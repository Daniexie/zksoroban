import fs from "node:fs";
import path from "node:path";

import { SorobanZkError, SorobanZkErrorCode } from "./types";

const BN254_SCALAR_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const N_ROUNDS_F = 8;
const N_ROUNDS_P = [56, 57, 56, 60, 60, 63, 64, 63, 60, 66, 60, 65, 70, 60, 64, 68];
const MAX_INPUTS = N_ROUNDS_P.length;

type PoseidonConstants = {
  C: string[][];
  S: string[][];
  M: string[][][];
  P: string[][][];
};

type PoseidonPreparedConstants = {
  C: bigint[][];
  S: bigint[][];
  M: bigint[][][];
  P: bigint[][][];
};

let constantsCache: PoseidonPreparedConstants | undefined;

function mod(value: bigint): bigint {
  const reduced = value % BN254_SCALAR_MODULUS;
  return reduced >= 0n ? reduced : reduced + BN254_SCALAR_MODULUS;
}

function add(a: bigint, b: bigint): bigint {
  return mod(a + b);
}

function mul(a: bigint, b: bigint): bigint {
  return mod(a * b);
}

function pow5(value: bigint): bigint {
  const squared = mul(value, value);
  const fourth = mul(squared, squared);
  return mul(value, fourth);
}

function parseConstants(): PoseidonPreparedConstants {
  const mainPath = require.resolve("circomlibjs");
  const constantsPath = path.join(path.dirname(mainPath), "..", "src", "poseidon_constants_opt.js");
  const source = fs.readFileSync(constantsPath, "utf8").trim();
  const normalized = source.replace(/^export default\s+/, "").replace(/;\s*$/, "");
  const parsed = JSON.parse(normalized) as PoseidonConstants;

  const convert = (value: unknown): unknown => {
    if (typeof value === "string") {
      return BigInt(value);
    }

    if (Array.isArray(value)) {
      return value.map((item) => convert(item));
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, convert(item)])
      );
    }

    return value;
  };

  return convert(parsed) as PoseidonPreparedConstants;
}

function getConstants(): PoseidonPreparedConstants {
  if (!constantsCache) {
    constantsCache = parseConstants();
  }

  return constantsCache;
}

function normalizeInput(value: bigint): bigint {
  if (typeof value !== "bigint") {
    throw new SorobanZkError(
      "poseidon() inputs must be bigint values",
      SorobanZkErrorCode.INVALID_PUBLIC_INPUT
    );
  }

  return mod(value);
}

export function poseidon(inputs: bigint[]): bigint {
  if (!Array.isArray(inputs)) {
    throw new SorobanZkError(
      "poseidon() expects an array of bigint inputs",
      SorobanZkErrorCode.INVALID_PUBLIC_INPUT
    );
  }

  if (inputs.length === 0 || inputs.length > MAX_INPUTS) {
    throw new SorobanZkError(
      `poseidon() supports between 1 and ${MAX_INPUTS} inputs`,
      SorobanZkErrorCode.INVALID_PUBLIC_INPUT
    );
  }

  const preparedInputs = inputs.map((input) => normalizeInput(input));
  const constants = getConstants();
  const t = preparedInputs.length + 1;
  const partialRounds = N_ROUNDS_P[t - 2];
  const C = constants.C[t - 2];
  const S = constants.S[t - 2];
  const M = constants.M[t - 2];
  const P = constants.P[t - 2];

  let state = [0n, ...preparedInputs];
  state = state.map((value, index) => add(value, C[index]));

  for (let round = 0; round < N_ROUNDS_F / 2 - 1; round += 1) {
    state = state.map((value) => pow5(value));
    state = state.map((value, index) => add(value, C[(round + 1) * t + index]));
    state = state.map((_, column) =>
      state.reduce((acc, value, row) => add(acc, mul(M[row][column], value)), 0n)
    );
  }

  state = state.map((value) => pow5(value));
  state = state.map((value, index) => add(value, C[(N_ROUNDS_F / 2) * t + index]));
  state = state.map((_, column) =>
    state.reduce((acc, value, row) => add(acc, mul(P[row][column], value)), 0n)
  );

  for (let round = 0; round < partialRounds; round += 1) {
    state[0] = pow5(state[0]);
    state[0] = add(state[0], C[(N_ROUNDS_F / 2 + 1) * t + round]);

    const s0 = state.reduce(
      (acc, value, index) => add(acc, mul(S[(t * 2 - 1) * round + index], value)),
      0n
    );

    for (let k = 1; k < t; k += 1) {
      state[k] = add(state[k], mul(state[0], S[(t * 2 - 1) * round + t + k - 1]));
    }

    state[0] = s0;
  }

  for (let round = 0; round < N_ROUNDS_F / 2 - 1; round += 1) {
    state = state.map((value) => pow5(value));
    state = state.map((value, index) =>
      add(value, C[(N_ROUNDS_F / 2 + 1) * t + partialRounds + round * t + index])
    );
    state = state.map((_, column) =>
      state.reduce((acc, value, row) => add(acc, mul(M[row][column], value)), 0n)
    );
  }

  state = state.map((value) => pow5(value));
  state = state.map((_, column) =>
    state.reduce((acc, value, row) => add(acc, mul(M[row][column], value)), 0n)
  );

  return state[0];
}
