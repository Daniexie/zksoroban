import assert from "node:assert/strict";
import test from "node:test";

import { Keypair } from "@stellar/stellar-sdk";

import { verifyOnChain } from "../src/verify";
import {
  TESTNET_CONTRACT_ID,
  TESTNET_RPC_URL,
  VALID_PUBLIC_INPUT_HEX,
  calldataBuffersFromHex,
  tamperedProofAHex
} from "./fixtures";

const secretKey = process.env.SOROBAN_SECRET_KEY;

if (!secretKey) {
  test.skip("verifyOnChain integration tests require SOROBAN_SECRET_KEY");
} else {
  const keypair = Keypair.fromSecret(secretKey);
  const validCalldata = calldataBuffersFromHex();

  test("verifyOnChain returns true for a valid proof", async () => {
    const result = await verifyOnChain({
      rpcUrl: TESTNET_RPC_URL,
      contractId: TESTNET_CONTRACT_ID,
      keypair,
      calldata: validCalldata
    });

    assert.equal(result.verified, true);
    assert.match(result.txHash, /^[0-9a-f]{64}$/);
    assert.ok(result.ledger > 0);
    assert.match(result.fee, /^[1-9][0-9]*$/);
  });

  test("verifyOnChain returns false for a tampered proof", async () => {
    const result = await verifyOnChain({
      rpcUrl: TESTNET_RPC_URL,
      contractId: TESTNET_CONTRACT_ID,
      keypair,
      calldata: {
        ...validCalldata,
        proofA: Buffer.from(tamperedProofAHex(), "hex")
      }
    });

    assert.equal(result.verified, false);
    assert.match(result.txHash, /^[0-9a-f]{64}$/);
  });

  test("verifyOnChain returns false for wrong public inputs", async () => {
    const wrongPublicInput = Buffer.from(`${"0".repeat(63)}8`, "hex");
    assert.notEqual(wrongPublicInput.toString("hex"), VALID_PUBLIC_INPUT_HEX);

    const result = await verifyOnChain({
      rpcUrl: TESTNET_RPC_URL,
      contractId: TESTNET_CONTRACT_ID,
      keypair,
      calldata: {
        ...validCalldata,
        publicInputs: [wrongPublicInput]
      }
    });

    assert.equal(result.verified, false);
    assert.match(result.txHash, /^[0-9a-f]{64}$/);
    assert.ok(result.ledger > 0);
    assert.match(result.fee, /^[1-9][0-9]*$/);
  });
}
