import assert from "node:assert/strict";
import test from "node:test";

import { formatProof } from "../src/proof";
import { SorobanZkError, SorobanZkErrorCode } from "../src/types";
import {
  VALID_PROOF_A_HEX,
  VALID_PROOF_B_HEX,
  VALID_PROOF_C_HEX,
  VALID_PUBLIC_INPUT_HEX,
  VALID_PUBLIC_SIGNALS,
  VALID_SNARKJS_PROOF
} from "./fixtures";

test("formatProof produces the expected calldata lengths", () => {
  const result = formatProof(VALID_SNARKJS_PROOF, VALID_PUBLIC_SIGNALS);

  assert.equal(result.proofA.length, 64);
  assert.equal(result.proofB.length, 128);
  assert.equal(result.proofC.length, 64);
});

test("formatProof matches known G1 and G2 encodings", () => {
  const result = formatProof(VALID_SNARKJS_PROOF, VALID_PUBLIC_SIGNALS);

  assert.equal(result.proofA.toString("hex"), VALID_PROOF_A_HEX);
  assert.equal(result.proofB.toString("hex"), VALID_PROOF_B_HEX);
  assert.equal(result.proofC.toString("hex"), VALID_PROOF_C_HEX);
});

test("formatProof encodes public inputs as 32-byte big-endian field elements", () => {
  const result = formatProof(VALID_SNARKJS_PROOF, VALID_PUBLIC_SIGNALS);

  assert.equal(result.publicInputs.length, 1);
  assert.equal(result.publicInputs[0].toString("hex"), VALID_PUBLIC_INPUT_HEX);
});

test("formatProof throws typed errors for malformed proof input", () => {
  assert.throws(
    () =>
      formatProof(
        {
          ...VALID_SNARKJS_PROOF,
          pi_a: ["not-a-number", VALID_SNARKJS_PROOF.pi_a[1], "1"]
        },
        VALID_PUBLIC_SIGNALS
      ),
    (error: unknown) =>
      error instanceof SorobanZkError &&
      error.code === SorobanZkErrorCode.INVALID_PROOF_FORMAT
  );
});

test("formatProof throws typed errors for malformed public input", () => {
  assert.throws(
    () => formatProof(VALID_SNARKJS_PROOF, ["not-a-field-element"]),
    (error: unknown) =>
      error instanceof SorobanZkError &&
      error.code === SorobanZkErrorCode.INVALID_PUBLIC_INPUT
  );
});
