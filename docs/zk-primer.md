# ZK Primer for Stellar Developers

Zero-knowledge proofs let someone prove that a statement is true without revealing the private data that makes it true. In `zksoroban`, the statement is simple: "I know a secret whose Poseidon hash equals this public commitment." The secret stays private, while the verifier only learns that the math checks out.

For Stellar developers, the important shift is that Protocol 25 introduced native cryptographic host functions for BN254 elliptic curve operations and Poseidon permutations. That matters because zk systems are usually blocked by one of two costs: proof generation off-chain or proof verification on-chain. Proof generation is still expensive and remains off-chain, but Protocol 25 removes the biggest on-chain bottleneck by giving Soroban contracts access to the primitives needed to verify Groth16 proofs efficiently enough to be practical.

## The Core Roles

There are three roles in a zk workflow:

- The prover has private data and generates a proof.
- The verifier checks the proof and returns true or false.
- The circuit defines exactly what statement is being proven.

In this repository:

- The circuit is `circuits/poseidon_preimage/circuit.circom`.
- The prover is `snarkjs`, driven by the demo script.
- The verifier is the Soroban contract in `contracts/verifier/src/lib.rs`.

## Why a Circuit Exists at All

You do not prove arbitrary JavaScript or Rust code in a zk system. You prove a fixed arithmetic relation over finite fields. That relation is the circuit.

The reference circuit in this repo has:

- one private input: `secret`
- one public input: `commitment`

It enforces:

`Poseidon(secret) == commitment`

That is enough to demonstrate the whole toolchain:

- a client computes a commitment
- a prover generates a Groth16 proof for that commitment
- the Soroban contract verifies the proof on-chain

This is intentionally minimal. The value of the project is not the complexity of the circuit. The value is the end-to-end bridge from common zk tooling into Soroban.

## Public Inputs vs Private Inputs

Public inputs are visible to the verifier and become part of the statement being checked. Private inputs are only known to the prover and never appear on-chain.

In this reference flow:

- `secret` is private
- `commitment` is public

That means anyone can see the commitment on-chain, but nobody learns the secret from the proof. If the circuit accidentally marks `commitment` as private, the system stops matching the intended contract API, because the verifier no longer has the public value it is supposed to check. This distinction is why the circuit entrypoint explicitly exposes `commitment` as public.

## Why Poseidon Is Used

Traditional hashes like SHA-256 are excellent for general computing, but they are expensive inside zk circuits. Poseidon is designed for arithmetic circuits, which makes it much cheaper to prove and verify in zk systems.

For Stellar, Protocol 25 also matters here because it exposes Poseidon host support. That means a future family of applications can share the same hash function across off-chain proof generation and on-chain program logic without inventing an awkward compatibility layer.

## Why BN254 Is Used

BN254 is the pairing-friendly curve used by Groth16 in the tooling stack chosen here. A Groth16 verifier needs elliptic curve arithmetic in groups usually called G1 and G2, plus a pairing check. The contract does not manually implement these operations in Wasm. Instead, it uses Soroban host support for BN254 types and the pairing check primitive.

That is the main reason this project is viable as a small reference implementation. Without host support, a verifier contract would be too slow, too large, or too expensive to be useful.

## What Groth16 Is Doing

Groth16 is a succinct proof system. In practice that means:

- proofs are small
- verification is fast relative to many alternatives
- a trusted setup is required per circuit

That trusted setup is why the repository includes testnet-only `.zkey` and `verification_key.json` artifacts for the reference circuit. The proving key is used by the prover to create proofs. The verifying key is embedded in the verifier contract so the contract can check those proofs.

If the circuit changes, the setup changes. If the setup changes, the verifying key changes. If the verifying key changes, the contract constants must change too. That linkage is not optional.

## What the Soroban Contract Actually Checks

At a high level, the contract:

1. receives encoded proof points `proofA`, `proofB`, `proofC`
2. receives encoded public inputs
3. reconstructs the linear combination `vk_x` from the verifying key and public inputs
4. runs a BN254 pairing check using the proof points and verifying key constants
5. returns `true` if the pairing equation holds

The verifier is stateless. It stores nothing. That keeps the MVP small and focused.

This is an important design choice for Stellar developers. Many real privacy applications need more than proof verification. They often need nullifier tracking, membership proofs, key rotation, or policy constraints. None of that belongs in the smallest possible reference verifier. `zksoroban` solves the first hard problem cleanly: "How do I verify a zk proof on Stellar at all?"

## Why the SDK Matters

Most developers do not want to hand-encode BN254 points into byte arrays or decode RPC transaction metadata by hand. The SDK exists to close that tooling gap.

It provides three core pieces:

- `poseidon(inputs)` for client-side hashing
- `formatProof(proof, publicSignals)` for converting `snarkjs` output into the exact Soroban calldata layout
- `verifyOnChain(opts)` for transaction construction, submission, polling, and result decoding

That is the bridge from standard zk tooling into the Soroban runtime.

## Byte Encoding Is a Real Interoperability Problem

A proof is not just "some JSON." The contract expects exact byte layouts:

- G1 points are 64 bytes
- G2 points are 128 bytes
- public inputs are 32-byte big-endian field elements

If the encoding is wrong, verification fails even if the underlying proof is mathematically valid. This is one of the main reasons reference implementations matter. Once a byte-level spec exists and a working contract enforces it, other languages and clients can interoperate.

## What a Passing End-to-End Demo Proves

When the demo runs successfully, it proves several things at once:

- the circuit is valid
- the setup artifacts match the circuit
- the verifying key in the contract matches the setup artifacts
- the SDK proof formatting matches the contract's byte expectations
- the Soroban verifier can check the proof on Testnet

That is stronger than a local unit test. It shows the actual Stellar network path works.

## What This Unlocks

This MVP is not a private payments product by itself. It is infrastructure. Once developers can verify proofs reliably on Stellar, they can start building higher-level systems:

- private balances and transfers
- anonymous voting
- compliance attestations without revealing raw data
- selective disclosure credentials
- membership proofs for gated applications

Those systems still need product logic and careful threat modeling, but they all depend on the same foundation: predictable proof verification on-chain.

## What This Repo Does Not Claim

This repo does not make Groth16 trusted setup disappear. It does not provide production ceremonies. It does not implement nullifier sets or privacy-preserving application logic. It does not solve wallet UX for private applications.

What it does provide is the missing first layer for Stellar developers after Protocol 25: a working verifier contract, a compatible SDK, a reference circuit, and a demo that proves the stack actually works on Testnet.

That is the right scope for a reference project. It is narrow enough to audit, but complete enough to unblock real follow-on work.
