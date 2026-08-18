/**
 * Unit tests for verifyOnChain()'s contract call shape and error decoding.
 *
 * The RPC layer is replaced with a lightweight stub, the same way
 * getContractConfig.test.ts does it — no funded account or real network
 * call is needed.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { Keypair, rpc, xdr } from "@stellar/stellar-sdk";

import { verifyOnChain } from "../src/verify";
import { SorobanZkError, SorobanZkErrorCode, VerifyOptions } from "../src/types";

import * as stellarSdk from "@stellar/stellar-sdk";

const STUB_PASSPHRASE = "Test SDF Network ; September 2015";
const STUB_KEYPAIR = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 7));

function withStubbedServer(
  stubFactory: () => object,
  fn: () => Promise<void>
): Promise<void> {
  const original = (stellarSdk.rpc as any).Server;
  (stellarSdk.rpc as any).Server = function () {
    return stubFactory();
  };
  return fn().finally(() => {
    (stellarSdk.rpc as any).Server = original;
  });
}

function buildFnReturnDiagnosticEvent(value: boolean): string {
  const v0 = new xdr.ContractEventV0({
    topics: [xdr.ScVal.scvSymbol("fn_return"), xdr.ScVal.scvSymbol("verify_proof")],
    data: xdr.ScVal.scvBool(value)
  });
  const body = new xdr.ContractEventBody(0, v0);
  const event = new xdr.ContractEvent({
    ext: new xdr.ExtensionPoint(0),
    contractId: null,
    type: xdr.ContractEventType.contract(),
    body
  });
  const diagnostic = new xdr.DiagnosticEvent({
    inSuccessfulContractCall: true,
    event
  });
  return diagnostic.toXDR("base64");
}

function buildTransactionResultXdr(feeCharged = "100"): string {
  const result = xdr.TransactionResultResult.txSuccess([]);
  const ext = new xdr.TransactionResultExt(0);
  const tr = new xdr.TransactionResult({
    feeCharged: xdr.Int64.fromString(feeCharged),
    result,
    ext
  });
  return tr.toXDR("base64");
}

const DEFAULT_OPTS: VerifyOptions = {
  rpcUrl: "http://localhost:8000",
  contractId: "CBL6MAWJALQP25LYKUUOC34K464XPSF6BLKUW6MXZDEXEDXMQUSP7HNN",
  keypair: STUB_KEYPAIR,
  calldata: {
    proofA: Buffer.alloc(64, 1),
    proofB: Buffer.alloc(128, 2),
    proofC: Buffer.alloc(64, 3),
    publicInputs: [Buffer.alloc(32, 4)]
  }
};

function buildSuccessStub(capturedArgs: { args?: xdr.ScVal[] }) {
  return {
    getNetwork: async () => ({ passphrase: STUB_PASSPHRASE }),
    getAccount: async (id: string) => new stellarSdk.Account(id, "0"),
    prepareTransaction: async (tx: any) => {
      const op = tx.operations[0];
      capturedArgs.args = op.func.invokeContract().args();
      return tx;
    },
    sendTransaction: async () => ({ status: "PENDING", hash: "a".repeat(64) }),
    _getTransaction: async () => ({
      status: rpc.Api.GetTransactionStatus.SUCCESS,
      ledger: 12345,
      resultXdr: buildTransactionResultXdr(),
      diagnosticEventsXdr: [buildFnReturnDiagnosticEvent(true)]
    })
  };
}

function buildSimulationErrorStub(message: string) {
  return {
    getNetwork: async () => ({ passphrase: STUB_PASSPHRASE }),
    getAccount: async (id: string) => new stellarSdk.Account(id, "0"),
    prepareTransaction: async () => {
      throw new Error(message);
    }
  };
}

test("verifyOnChain passes caller as the first verify_proof argument", async () => {
  const captured: { args?: xdr.ScVal[] } = {};

  await withStubbedServer(
    () => buildSuccessStub(captured),
    async () => {
      const result = await verifyOnChain(DEFAULT_OPTS);
      assert.equal(result.verified, true);

      assert.ok(captured.args, "prepareTransaction should have been called");
      assert.equal(captured.args!.length, 5, "verify_proof now takes 5 args");

      const callerAddress = stellarSdk.Address.fromScVal(captured.args![0]);
      assert.equal(callerAddress.toString(), STUB_KEYPAIR.publicKey());
    }
  );
});

const CONTRACT_ERROR_CASES: Array<[number, SorobanZkErrorCode]> = [
  [1, SorobanZkErrorCode.CONTRACT_NOT_INITIALIZED],
  [2, SorobanZkErrorCode.RATE_LIMIT_EXCEEDED],
  [3, SorobanZkErrorCode.INVALID_WINDOW_SIZE],
  [4, SorobanZkErrorCode.PROOF_EXPIRED],
  [5, SorobanZkErrorCode.CALLER_NOT_ALLOWED]
];

for (const [code, expected] of CONTRACT_ERROR_CASES) {
  test(`verifyOnChain maps Error(Contract, #${code}) to ${expected}`, async () => {
    await withStubbedServer(
      () => buildSimulationErrorStub(`HostError: Error(Contract, #${code})`),
      async () => {
        await assert.rejects(
          verifyOnChain(DEFAULT_OPTS),
          (err: unknown) => {
            assert.ok(err instanceof SorobanZkError);
            assert.equal(err.code, expected);
            return true;
          }
        );
      }
    );
  });
}

test("verifyOnChain falls back to a generic error for an unrecognized failure", async () => {
  await withStubbedServer(
    () => buildSimulationErrorStub("some unrelated RPC failure"),
    async () => {
      await assert.rejects(
        verifyOnChain(DEFAULT_OPTS),
        (err: unknown) => {
          assert.ok(err instanceof SorobanZkError);
          assert.equal(err.code, SorobanZkErrorCode.CONTRACT_INVOCATION_FAILED);
          return true;
        }
      );
    }
  );
});
