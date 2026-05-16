import { Buffer } from "node:buffer";

import { SnarkjsProof } from "../src/types";

export const VALID_PROOF_A_HEX =
  "1c9f4896deda7ee2355d0450495c287824c2d7a7273526cb4e379a2bb7331bef2774e1ccdf712d4b913fa2fb73a9e9d3c411325f0a606457672dde2e164feccf";
export const VALID_PROOF_B_HEX =
  "012a0542a3eb25f9dd3b1c1a1c8dde882c7d39cdaeab789ed7052598802f6db30ac39707cbd15b1dd86963d88639f9263f1c3d10edb06a3b6a7f8496adf91827252a07f51df2b1b6aa65162f17933bfaa2245f427a024b1abc76654a2fc1ffa80b743e4f2c12b5c36eff491f6343c52b1d979dd222f786261f170403314d1b0d";
export const VALID_PROOF_C_HEX =
  "11c9db1a44293dd937839d0b271f95fbe7ac78df2331560beed6a29803aac9190c3780eb59106c3791d39969fca352f41f146690cda50d1c3c80c5def64501de";
export const VALID_PUBLIC_INPUT_HEX =
  "29176100eaa962bdc1fe6c654d6a3c130e96a4d1168b33848b897dc502820133";
export const TESTNET_CONTRACT_ID =
  "CBL6MAWJALQP25LYKUUOC34K464XPSF6BLKUW6MXZDEXEDXMQUSP7HNN";
export const TESTNET_RPC_URL = "https://soroban-testnet.stellar.org";
export const BN254_BASE_FIELD_MODULUS =
  21888242871839275222246405745257275088696311157297823662689037894645226208583n;

function hexToBigInt(hex: string): bigint {
  return BigInt(`0x${hex}`);
}

function g1FromHex(hex: string): [string, string, string] {
  return [
    hexToBigInt(hex.slice(0, 64)).toString(),
    hexToBigInt(hex.slice(64, 128)).toString(),
    "1"
  ];
}

function g2FromHex(hex: string): [[string, string], [string, string], [string, string]] {
  return [
    [
      hexToBigInt(hex.slice(64, 128)).toString(),
      hexToBigInt(hex.slice(0, 64)).toString()
    ],
    [
      hexToBigInt(hex.slice(192, 256)).toString(),
      hexToBigInt(hex.slice(128, 192)).toString()
    ],
    ["1", "0"]
  ];
}

export const VALID_SNARKJS_PROOF: SnarkjsProof = {
  pi_a: g1FromHex(VALID_PROOF_A_HEX),
  pi_b: g2FromHex(VALID_PROOF_B_HEX),
  pi_c: g1FromHex(VALID_PROOF_C_HEX),
  protocol: "groth16"
};

export const VALID_PUBLIC_SIGNALS = [hexToBigInt(VALID_PUBLIC_INPUT_HEX).toString()];

export function tamperedProofAHex(): string {
  const x = VALID_PROOF_A_HEX.slice(0, 64);
  const y = hexToBigInt(VALID_PROOF_A_HEX.slice(64, 128));
  const negatedY = y === 0n ? 0n : BN254_BASE_FIELD_MODULUS - y;
  return `${x}${negatedY.toString(16).padStart(64, "0")}`;
}

export function calldataBuffersFromHex(): {
  proofA: Buffer;
  proofB: Buffer;
  proofC: Buffer;
  publicInputs: Buffer[];
} {
  return {
    proofA: Buffer.from(VALID_PROOF_A_HEX, "hex"),
    proofB: Buffer.from(VALID_PROOF_B_HEX, "hex"),
    proofC: Buffer.from(VALID_PROOF_C_HEX, "hex"),
    publicInputs: [Buffer.from(VALID_PUBLIC_INPUT_HEX, "hex")]
  };
}
