// snarkjs ships no type declarations. This ambient module lets
// `await import("snarkjs")` in verifyOffChain.ts resolve for both the CJS
// and ESM builds without needing real upstream types — the same trust
// boundary the previous `require("snarkjs")` call already had implicitly,
// since `require`'s return type is untyped regardless of module resolution.
declare module "snarkjs";
