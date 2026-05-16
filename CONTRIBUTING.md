# Contributing

Contributions should preserve the core guarantees of this repository:

- the SDK, circuit, and verifier contract must remain interoperable
- the reference Testnet flow must stay reproducible
- documentation must stay aligned with the actual byte encoding and contract behavior

## Development Expectations

Before submitting changes:

1. Run the Rust verifier tests in `contracts/verifier/`.
2. Run the TypeScript SDK tests in `sdk/`.
3. If you change the circuit, regenerate the setup artifacts and confirm the verifier constants still match.
4. If you change proof encoding or verifier behavior, update `docs/proof-format.md`.
5. If you change the circuit or hashing assumptions, update `docs/architecture.md` and `docs/poseidon-parameters.md`.

## Scope Notes

- The current verifier is intentionally stateless.
- The current contract hardcodes one circuit's verifying key.
- The setup artifacts in `circuits/poseidon_preimage/setup/` are testnet-only reference artifacts, not production ceremony outputs.

## Pull Request Guidance

Good changes for this repository:

- verifier correctness fixes
- SDK interoperability improvements
- test coverage improvements
- documentation fixes tied to actual implementation behavior

Changes that need extra care:

- modifying the circuit
- changing proof byte encoding
- changing Poseidon assumptions
- changing the deployed contract target or contract interface
