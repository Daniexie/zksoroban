# Poseidon Preimage Circuit

This is the reference circuit for `zksoroban`.

It proves knowledge of a private `secret` such that:

```text
Poseidon(secret) == commitment
```

Inputs:

- private: `secret`
- public: `commitment`

Files:

- `circuit.circom`: the Circom circuit
- `input_example.json`: sample input for the reference flow
- `setup/circuit.zkey`: testnet-only proving key
- `setup/verification_key.json`: verifying key exported from the same setup

## Rebuilding the Artifacts

Compile the circuit:

```bash
circom circuit.circom --r1cs --wasm --sym -o build -l ../../demo/node_modules
```

Generate a proof with the reference setup:

```bash
npx snarkjs groth16 fullprove input_example.json build/circuit_js/circuit.wasm setup/circuit.zkey proof.json public.json
```

Verify the proof locally:

```bash
npx snarkjs groth16 verify setup/verification_key.json public.json proof.json
```

## Important Note

The files in `setup/` are testnet-only reference artifacts. They are suitable for reproducing the demo and tests in this repository, but they are not production ceremony outputs.
