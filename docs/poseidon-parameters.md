# Poseidon Parameters

This project uses the Poseidon parameterization implemented by `circomlibjs` and `circomlib` for BN254, matching the reference circuit and the SDK implementation.

## Field

The hash operates over the BN254 scalar field:

```text
21888242871839275222246405745257275088548364400416034343698204186575808495617
```

In the SDK this is the modulus used for all additions, multiplications, and S-box applications in [poseidon.ts](/home/amuda/sorobanzk/sdk/src/poseidon.ts).

## Arity Used by This Project

The reference circuit uses:

```text
Poseidon(1)
```

That means:

- one user input: `secret`
- one capacity element in the state
- total state width `t = 2`

The circuit lives in [circuit.circom](/home/amuda/sorobanzk/circuits/poseidon_preimage/circuit.circom).

## Round Structure

The SDK uses the optimized `circomlibjs` constants and round schedule:

- full rounds: `8`
- partial rounds by arity:
  `[56, 57, 56, 60, 60, 63, 64, 63, 60, 66, 60, 65, 70, 60, 64, 68]`

Because the reference circuit has one input, the active width is:

- `t = inputs.length + 1 = 2`

So the project uses:

- `N_ROUNDS_F = 8`
- `N_ROUNDS_P = 56`

for the actual reference circuit and the demo flow.

## S-Box

The non-linear layer is the Poseidon power-5 S-box:

```text
x -> x^5 mod p
```

The SDK implements this directly as repeated modular multiplication.

## Constants Source

The SDK does not hand-copy round constants. It loads the optimized constant tables from `circomlibjs/src/poseidon_constants_opt.js` at runtime and converts them into `bigint` values.

Those tables include:

- additive round constants `C`
- sparse matrix constants `S`
- MDS matrices `M`
- pre-sparse matrices `P`

This is important because it keeps the SDK aligned with the same parameter family used by the reference circuit tooling.

## Compatibility Rule

The project assumes these three layers all match:

- `circomlib` in the circuit
- `circomlibjs` in the SDK
- the known reference vector tests

If any of them diverge, the commitment computed off-chain can stop matching the commitment expected by the circuit and the proof flow will break.

## Reference Vector

The primary parity check used in the SDK test suite is:

```text
poseidon([1n, 2n]) =
7853200120776062878684798364095072458815029376092732009249414926327459813530
```

If this value changes, the SDK is no longer compatible with the parameter set used by the repository.

## Input Domain

The SDK accepts:

- a non-empty input array
- maximum input length `16`
- `bigint` inputs only

Every input is reduced modulo the BN254 scalar field before hashing.

For the reference circuit specifically, only one input is used:

- `secret`

The resulting output is compared against the public `commitment`.

## Practical Meaning

For this repository, “the Poseidon parameters” means:

- BN254 scalar field
- circomlib Poseidon implementation
- optimized constant tables from `circomlibjs`
- width `t = 2` for the reference circuit
- `8` full rounds
- `56` partial rounds
- power-5 S-box

That is the exact hashing profile the SDK, circuit, tests, and demo are built around.
