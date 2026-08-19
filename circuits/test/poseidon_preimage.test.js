/**
 * Constraint-level tests for circuits/poseidon_preimage/circuit.circom.
 *
 * These tests use circom_tester's `wasm` tester to calculate a witness and
 * check R1CS constraints directly, without generating or verifying a
 * Groth16 proof and without a trusted setup. That makes them fast enough
 * to run on every change instead of only during a full proof-generation
 * check.
 *
 * The circuit is:
 *   signal input secret;
 *   signal input commitment;
 *   commitment === Poseidon(secret);
 *
 * Two distinct failure shapes matter here and are both covered below:
 *   - `calculateWitness` itself rejects when `commitment` doesn't match
 *     Poseidon(secret) — the `===` in the circuit compiles to a runtime
 *     assertion in the witness calculator, so a bad witness is refused
 *     before a witness even exists to check constraints against.
 *   - `checkConstraints` re-verifies every R1CS constraint (a*b - c = 0)
 *     against an already-computed witness — used for the valid cases to
 *     confirm the witness genuinely satisfies the compiled circuit, not
 *     just that computation happened to not throw.
 */

const path = require("path");
const assert = require("assert");
const wasm_tester = require("circom_tester").wasm;
const { buildPoseidon } = require("circomlibjs");

const BN254_SCALAR_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

const REPO_ROOT = path.join(__dirname, "..", "..");
const CIRCUIT_PATH = path.join(
  REPO_ROOT,
  "circuits",
  "poseidon_preimage",
  "circuit.circom",
);

describe("poseidon_preimage circuit", function () {
  this.timeout(120000);

  /** @type {import("circom_tester").WasmTester} */
  let circuit;
  let poseidon;
  let F;

  before(async function () {
    circuit = await wasm_tester(CIRCUIT_PATH, {
      include: [path.join(REPO_ROOT, "node_modules")],
    });
    poseidon = await buildPoseidon();
    F = poseidon.F;
  });

  /** Computes the circuit's expected commitment for a given secret. */
  function commitmentFor(secret) {
    return F.toString(poseidon([secret]));
  }

  it("accepts a valid witness: secret=1 with its real Poseidon(1) commitment", async () => {
    const w = await circuit.calculateWitness(
      { secret: "1", commitment: commitmentFor(1n) },
      true,
    );
    await circuit.checkConstraints(w);
  });

  it("rejects a wrong commitment for a valid secret", async () => {
    await assert.rejects(
      circuit.calculateWitness({ secret: "1", commitment: "999999999" }, true),
      /Assert Failed/,
    );
  });

  it("rejects a secret whose real commitment doesn't match a different secret's commitment", async () => {
    // Guards against accidentally satisfying the circuit by supplying some
    // *other* valid (secret, commitment) pair instead of the matching one.
    await assert.rejects(
      circuit.calculateWitness(
        { secret: "2", commitment: commitmentFor(1n) },
        true,
      ),
      /Assert Failed/,
    );
  });

  it("accepts secret=0 with its real Poseidon(0) commitment", async () => {
    const w = await circuit.calculateWitness(
      { secret: "0", commitment: commitmentFor(0n) },
      true,
    );
    await circuit.checkConstraints(w);
  });

  it("reduces a secret exactly at the BN254 scalar field modulus to 0 and still satisfies constraints", async () => {
    // The modulus is congruent to 0 mod p, so this should behave exactly
    // like secret=0 rather than erroring or silently misbehaving.
    const w = await circuit.calculateWitness(
      { secret: BN254_SCALAR_MODULUS.toString(), commitment: commitmentFor(0n) },
      true,
    );
    await circuit.checkConstraints(w);
  });

  it("reduces a secret one above the field modulus to 1 and still satisfies constraints", async () => {
    const oneAboveModulus = BN254_SCALAR_MODULUS + 1n;
    const w = await circuit.calculateWitness(
      { secret: oneAboveModulus.toString(), commitment: commitmentFor(1n) },
      true,
    );
    await circuit.checkConstraints(w);
  });

  it("rejects an over-the-modulus secret paired with the wrong (non-reduced) commitment", async () => {
    // Confirms the reduction happens on the *input value*, not that the
    // circuit just stops checking once a value looks unusually large.
    const oneAboveModulus = BN254_SCALAR_MODULUS + 1n;
    await assert.rejects(
      circuit.calculateWitness(
        { secret: oneAboveModulus.toString(), commitment: commitmentFor(0n) },
        true,
      ),
      /Assert Failed/,
    );
  });

  it("rejects a witness with the commitment input missing entirely", async () => {
    await assert.rejects(circuit.calculateWitness({ secret: "1" }, true));
  });
});
