# Circuits

Each subdirectory here is a standalone Circom circuit with its own `circuit.circom`, sample input, and README. See each circuit's own README for what it proves.

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
