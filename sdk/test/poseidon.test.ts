import assert from "node:assert/strict";
import test from "node:test";

import { poseidon } from "../src/poseidon";
import { SorobanZkError } from "../src/types";

test("poseidon matches the known reference vector", () => {
  assert.equal(
    poseidon([1n, 2n]),
    7853200120776062878684798364095072458815029376092732009249414926327459813530n
  );
});

test("poseidon is deterministic", () => {
  assert.equal(poseidon([9n]), poseidon([9n]));
});

test("poseidon handles single-input and maximum-input cases", () => {
  assert.equal(typeof poseidon([42n]), "bigint");
  assert.equal(typeof poseidon(new Array<bigint>(16).fill(1n)), "bigint");
});

test("poseidon rejects empty input arrays", () => {
  assert.throws(() => poseidon([]), SorobanZkError);
});
