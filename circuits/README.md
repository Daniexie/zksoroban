# Circuits

Each subdirectory here is a standalone Circom circuit with its own `circuit.circom`, sample input, and README. See each circuit's own README for what it proves.

## Auditing circuit cost

`audit.sh` compiles every circuit in this directory, reads its constraint count and I/O size via `snarkjs r1cs info`, and prints a Markdown report. Run it before opening a PR that touches a circuit, so you know whether your change added 100 constraints or 100,000:

```bash
circuits/audit.sh
```

It takes no arguments and requires `circom` on your `PATH` (see the [root README](../README.md) for install instructions) plus the demo's dependencies installed once (`cd demo && npm install`) — the circuits include `circomlib`, which is only vendored there.

### Reading the output

The main table has one row per circuit:

| Column | Meaning |
|---|---|
| Constraints | Total R1CS constraints — the main driver of proving time and (for on-chain verification) gas/resource cost. |
| Public Inputs / Private Inputs | Signal counts from `snarkjs r1cs info`. |
| Wires | Total wires in the R1CS — useful context for constraint count, since a circuit can have many wires but few constraints or vice versa. |
| Measured Proof Time | A real `snarkjs groth16 fullprove` run, timed on whatever machine ran the script, for circuits that already have a reference proving key committed at `setup/circuit.zkey`. Circuits without one show `n/a` — nothing is measured or guessed for those. |

Below the table, a **Critical Path & Bottleneck Analysis** section calls out:
- **Critical path** — the circuit with the highest constraint count. If circuits are ever composed or budgeted together, this is the one that dominates total cost.
- **Bottleneck(s)** — any circuit using at least 2x the median constraint count across the circuits audited in that run. This flags circuits whose *relative* cost stands out; it isn't a judgment that a circuit has "too many" constraints in absolute terms — genuinely more complex logic is expected to cost more.

### What "Measured Proof Time" is and isn't

It's a real timing, not an estimate — but it's a single wall-clock run on one machine, using whatever hardware and Node version happen to be running the script. It will vary between machines and between runs. Treat it as a rough sense of relative cost between circuits in this repo, not a cross-hardware benchmark or an SLA.

### Exit code

The script exits non-zero if any circuit fails to compile (a failing circuit still gets reported in the table as `FAILED TO COMPILE`, and the script keeps auditing the rest before exiting). This makes it safe to wire into a CI gate later — see [#35](https://github.com/yusufadeagbo/zksoroban/issues/35) for that as a separate, out-of-scope follow-up.

### Adding a new circuit

Nothing to configure — the script discovers every subdirectory of `circuits/` that has a `circuit.circom`. Add a reference `setup/circuit.zkey` and `input_example.json` (following the pattern in [`poseidon_preimage`](./poseidon_preimage/)) if you also want its proof time measured.
