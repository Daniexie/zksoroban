#!/usr/bin/env bash
#
# circuits/audit.sh
#
# Compiles every circuit under circuits/*/circuit.circom, runs
# `snarkjs r1cs info` against the resulting R1CS, and prints a Markdown
# table of constraint counts and I/O sizes so contributors can see the
# cost of a circuit change before opening a PR.
#
# For any circuit that already ships a reference proving key
# (setup/circuit.zkey) and sample input (input_example.json), the script
# also times a real `snarkjs groth16 fullprove` run on this machine and
# reports it as a measured (not estimated) proof time. Circuits without a
# committed proving key show "n/a" in that column instead of a guess.
#
# Exits non-zero if any circuit fails to compile. Takes no arguments.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LIB_PATH="$REPO_ROOT/demo/node_modules"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

overall_exit=0
rows=()
failed_names=()

# Strips ANSI colour codes that snarkjs always emits, even when not a TTY.
strip_ansi() {
  sed -E 's/\x1b\[[0-9;]*[A-Za-z]//g'
}

extract_field() {
  # $1 = raw snarkjs r1cs info output, $2 = field label as it appears in that output
  echo "$1" | grep -oE "# of ${2}: [0-9]+" | grep -oE '[0-9]+$'
}

for dir in "$SCRIPT_DIR"/*/; do
  name="$(basename "$dir")"
  circuit_file="${dir}circuit.circom"
  [ -f "$circuit_file" ] || continue

  out_dir="$WORK_DIR/$name"
  mkdir -p "$out_dir"
  compile_log="$out_dir/compile.log"

  if ! (cd "$dir" && circom circuit.circom --r1cs --wasm --sym -o "$out_dir" -l "$LIB_PATH") \
      > "$compile_log" 2>&1; then
    echo "ERROR: $name failed to compile. Last 20 lines of circom output:" >&2
    tail -n 20 "$compile_log" >&2
    failed_names+=("$name")
    overall_exit=1
    continue
  fi

  info_raw="$(npx --yes snarkjs r1cs info "$out_dir/circuit.r1cs" 2>&1 | strip_ansi)"
  constraints="$(extract_field "$info_raw" 'Constraints')"
  public_inputs="$(extract_field "$info_raw" 'Public Inputs')"
  private_inputs="$(extract_field "$info_raw" 'Private Inputs')"
  wires="$(extract_field "$info_raw" 'Wires')"

  proof_time='n/a'
  zkey="${dir}setup/circuit.zkey"
  input_file="${dir}input_example.json"
  if [ -f "$zkey" ] && [ -f "$input_file" ]; then
    start_ns=$(date +%s%N)
    if (cd "$dir" && npx --yes snarkjs groth16 fullprove input_example.json \
          "$out_dir/circuit_js/circuit.wasm" setup/circuit.zkey \
          "$out_dir/proof.json" "$out_dir/public.json") \
        > "$out_dir/prove.log" 2>&1; then
      end_ns=$(date +%s%N)
      proof_time="$(( (end_ns - start_ns) / 1000000 ))ms"
    else
      proof_time='error'
    fi
  fi

  rows+=("${name}|${constraints}|${public_inputs}|${private_inputs}|${wires}|${proof_time}")
done

echo '# Circuit Audit'
echo
echo "| Circuit | Constraints | Public Inputs | Private Inputs | Wires | Measured Proof Time* |"
echo '|---|---|---|---|---|---|'
for row in "${rows[@]}"; do
  IFS='|' read -r name constraints public_inputs private_inputs wires proof_time <<< "$row"
  echo "| ${name} | ${constraints} | ${public_inputs} | ${private_inputs} | ${wires} | ${proof_time} |"
done
for name in "${failed_names[@]}"; do
  echo "| ${name} | FAILED TO COMPILE | - | - | - | - |"
done
echo
echo '*Measured with a real `snarkjs groth16 fullprove` run using the reference proving key already committed under `setup/`, where one exists. This is a single wall-clock run on whatever machine ran the script — not a cross-hardware benchmark. `n/a` means no reference proving key is committed for that circuit yet, so nothing was timed.'
echo

if [ ${#rows[@]} -gt 0 ]; then
  echo '## Critical Path & Bottleneck Analysis'
  echo

  analysis="$(
    for row in "${rows[@]}"; do
      IFS='|' read -r name constraints _ _ _ _ <<< "$row"
      echo "${name} ${constraints}"
    done | awk '
      {
        names[NR] = $1
        counts[NR] = $2
        sum += $2
        if ($2 > max) { max = $2; maxName = $1 }
      }
      END {
        n = NR
        # Insertion sort counts (n is small — a handful of circuits per repo).
        for (i = 1; i <= n; i++) sorted[i] = counts[i]
        for (i = 2; i <= n; i++) {
          key = sorted[i]; j = i - 1
          while (j >= 1 && sorted[j] > key) { sorted[j+1] = sorted[j]; j-- }
          sorted[j+1] = key
        }
        if (n % 2 == 1) median = sorted[(n+1)/2]
        else median = (sorted[n/2] + sorted[n/2 + 1]) / 2

        printf "CRITICAL_PATH|%s|%d\n", maxName, max
        printf "MEDIAN|%d\n", median

        for (i = 1; i <= n; i++) {
          if (median > 0 && counts[i] >= 2 * median) {
            printf "BOTTLENECK|%s|%d|%.1f\n", names[i], counts[i], counts[i] / median
          }
        }
      }
    '
  )"

  critical_name=""
  critical_count=""
  median=""
  bottlenecks_found=0

  while IFS='|' read -r kind a b c; do
    case "$kind" in
      CRITICAL_PATH)
        critical_name="$a"
        critical_count="$b"
        ;;
      MEDIAN)
        median="$a"
        ;;
      BOTTLENECK)
        bottlenecks_found=1
        echo "- **Bottleneck:** \`${a}\` has ${b} constraints, ${c}x the median (${median}) across audited circuits."
        ;;
    esac
  done <<< "$analysis"

  if [ -n "$critical_name" ]; then
    echo "- **Critical path:** \`${critical_name}\` has the highest constraint count (${critical_count}) of any audited circuit. If these circuits are ever proven together or budgeted as a group, this one dominates the total cost."
  fi
  if [ "$bottlenecks_found" -eq 0 ]; then
    echo '- No circuit uses 2x or more constraints than the median — no outlier bottleneck detected.'
  fi
  echo
  echo '(Bottleneck threshold: constraint count at least 2x the median across the circuits audited in this run. This flags circuits whose relative cost stands out, not an absolute "too many constraints" judgment — a circuit doing genuinely more work is expected to cost more.)'
fi

exit "$overall_exit"
