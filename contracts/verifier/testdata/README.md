# Contract Test Data

This directory contains small reference inputs used by the verifier contract tests and Testnet invocation flow.

Current contents:

- `valid_public_inputs.json`: the public input vector for the reference Poseidon preimage proof

The proof point fixtures themselves are currently embedded directly in [lib.rs](/home/amuda/sorobanzk/contracts/verifier/src/lib.rs) as fixed byte arrays so the verifier tests remain self-contained and deterministic.

The active verifier contract is built for the reference statement:

```text
Poseidon(secret) == commitment
```

with one public input:

- `commitment`

If the circuit or setup artifacts change, the hardcoded verifier constants and embedded proof fixtures must be regenerated to match.
