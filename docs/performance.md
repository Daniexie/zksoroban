# SDK Performance Notes

## Dual ESM/CJS build

`sdk/` builds to three parallel outputs from the same `src/`:

| Path | Format | Produced by |
|---|---|---|
| `dist/cjs/*.js` | CommonJS | `tsconfig.cjs.json` |
| `dist/esm/*.js` | ESM | `tsconfig.esm.json` |
| `dist/types/*.d.ts` | Type declarations (format-agnostic) | `tsconfig.types.json` |

`dist/index.cjs` and `dist/index.mjs` are thin entry points (`module.exports = require("./cjs/index.js")` and `export * from "./esm/index.js"`) that `sdk/package.json`'s `exports` map points at:

```json
"exports": {
  ".": {
    "types": "./dist/types/index.d.ts",
    "import": "./dist/index.mjs",
    "require": "./dist/index.cjs"
  }
}
```

Each of `dist/cjs/` and `dist/esm/` carries its own `package.json` (`{"type":"commonjs"}` / `{"type":"module"}`) written by `scripts/postbuild.cjs`, so Node interprets the plain `.js` files inside each correctly regardless of the package's own top-level `"type"` field. This avoids renaming individual compiled files to `.cjs`/`.mjs` (which would break Node's default extensionless `require()` resolution for the CJS build) while still satisfying `.mjs`/`.cjs` at the two paths that actually matter for consumers and tooling.

Verified directly, not just assumed:
- `const { verifyOnChain } = require('@zksoroban/sdk')` — tested against a real `npm pack` tarball installed into a fresh consumer project.
- `import { verifyOnChain } from '@zksoroban/sdk'` — tested the same way inside a real Vite project, including a full `vite build`.

## ESM bundle size and tree-shaking

Measured with `vite build` (Rollup) importing only specific named exports from a freshly-installed `@zksoroban/sdk` tarball, no other app code:

| Import | Bundle (raw) | Bundle (gzip) |
|---|---|---|
| `import { formatProof } from "@zksoroban/sdk"` | 4.93 kB | 1.96 kB |
| `import { verifyOnChain } from "@zksoroban/sdk"` | 361.56 kB | 95.35 kB |
| `import * as sdk` (every export referenced) | 811.32 kB | 199.94 kB |

`verifyOnChain`'s bundle is dominated by `@stellar/stellar-sdk`, which it genuinely needs to submit transactions — that's expected weight, not a tree-shaking failure. The `formatProof`-only case shows the SDK's own pure formatting/validation logic tree-shakes down to almost nothing when the on-chain and off-chain verification paths aren't used.

### A real tree-shaking bug found and fixed while verifying this

`verifyOffChain.ts` originally loaded snarkjs with a **module-scope** `require("snarkjs")`. A bare `require()` call at the top of a file is opaque to Rollup — it can't prove the module has no side effects, so it can't safely drop the module even when nothing imports `verifyOffChain`. Because every export is re-exported through one barrel (`index.ts`), that single top-level `require()` was pinning snarkjs (and its `ffjavascript` dependency) into *every* consumer's bundle regardless of which export they actually used:

| Import | Bundle (raw) before the fix |
|---|---|
| `formatProof` only | 451.76 kB |
| `verifyOnChain` only | 808.60 kB |

The fix: move the snarkjs load into the function body as a lazy `await import("snarkjs")`, so it only executes if `verifyOffChain` is actually called, and so the module has no top-level side effects for Rollup to worry about. A `declare module "snarkjs";` ambient shim (`src/snarkjs.d.ts`) was added alongside it — snarkjs ships no type declarations, and `import()` requires TypeScript to resolve the module (`require()`'s untyped return didn't need to). This shim carries the same trust boundary the old `require()` call had implicitly.

This is also why `require()` at module scope wasn't just a tree-shaking wart, but an outright bug waiting to happen for the ESM build specifically: plain `require()` doesn't exist in a real Node ESM module. Dynamic `import()` works correctly from both CJS and ESM contexts, which is what makes it the right fix here rather than only a tree-shaking one.

**All of these numbers are single measurements on one machine with one Vite version — expect them to drift over time and across environments.** Re-run `vite build` yourself if you need a number to depend on.
