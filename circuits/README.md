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

## Constraint tests (fast, no trusted setup)

`circuits/test/` holds [mocha](https://mochajs.org/) tests built on [`circom_tester`](https://github.com/iden3/circom_tester). They compile a circuit, compute a witness for specific inputs, and check that the witness satisfies (or correctly fails to satisfy) the circuit's R1CS constraints — no `snarkjs` proof generation and no trusted setup involved. This makes them fast enough to run on every circuit change, not just before a release.

Run all circuit constraint tests from the repository root:

```bash
npm install
npm run test:circuits
```

`npm install` at the root pulls in `circom_tester`, `mocha`, `circomlib` (the `.circom` sources the circuits `include`), and `circomlibjs` (a JS Poseidon implementation used to compute the *correct* commitment for a given secret in test fixtures, so tests aren't just re-asserting hardcoded numbers pulled from nowhere). It's a separate install from `sdk/` and `demo/` — those still manage their own dependencies independently.

### What these tests check

For each circuit, `circom_tester`'s `wasm` tester exposes two things tests use here:

- **`calculateWitness(input, true)`** — computes a witness for the given signal inputs. If the circuit has a `===` assertion between an input and a computed value (like `poseidon_preimage`'s `commitment === Poseidon(secret)`), a mismatched input makes this **throw** — the witness calculator refuses to produce a witness at all, before constraints are even checked.
- **`checkConstraints(witness)`** — independently re-verifies every R1CS constraint (`a * b - c == 0`) against an already-computed witness. Used on the valid cases to confirm the witness genuinely satisfies the compiled circuit.

`circuits/test/poseidon_preimage.test.js` covers:

1. A valid witness (secret `1` with its real Poseidon(1) commitment) satisfies constraints.
2. A wrong commitment for an otherwise-valid secret is rejected.
3. A secret whose *own* real commitment doesn't match a *different* secret's commitment is rejected (guards against accidentally satisfying the circuit with some other valid pair).
4. Secret `0` with its real Poseidon(0) commitment satisfies constraints.
5. A secret exactly at the BN254 scalar field modulus is correctly reduced to `0` (the modulus is congruent to `0 mod p`) and still satisfies constraints — not an error, not silently wrong.
6. A secret one above the modulus is correctly reduced to `1` and still satisfies constraints.
7. That same over-the-modulus secret paired with the *wrong* (non-reduced) commitment is still rejected — confirming the reduction happens to the value, not that validation just stops once a number looks unusually large.
8. A witness with the `commitment` input missing entirely is rejected.

### Out of scope (by design)

This harness deliberately does **not** generate a Groth16 proof, run a trusted setup, or measure coverage — that's each circuit's own `setup/` + `snarkjs groth16 fullprove` flow (see each circuit's README, e.g. [`poseidon_preimage`](./poseidon_preimage/README.md)). Keeping constraint tests free of any proving-key dependency is what makes them fast and runnable with nothing more than `npm install` at the root.

### Adding tests for another circuit

Add `circuits/test/<circuit_name>.test.js` following the pattern in `poseidon_preimage.test.js`: point `wasm_tester` at that circuit's `circuit.circom` with `include: [path.join(repoRoot, "node_modules")]`, then use `calculateWitness`/`checkConstraints` for the cases that matter for that circuit. Mocha picks up any `circuits/test/**/*.test.js` file automatically — no config changes needed.
