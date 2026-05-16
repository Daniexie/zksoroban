#!/usr/bin/env bash
set -euo pipefail

if ! command -v stellar >/dev/null 2>&1; then
  echo "stellar CLI is required" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WASM_PATH="${WASM_PATH:-$ROOT_DIR/contracts/verifier/target/wasm32v1-none/release/soroban_zk_verifier.wasm}"
SOURCE_ACCOUNT="${SOURCE_ACCOUNT:-soroban-zk-deployer}"
NETWORK="${NETWORK:-testnet}"
ALIAS="${ALIAS:-soroban-zk-verifier}"

stellar contract build \
  --manifest-path "$ROOT_DIR/contracts/verifier/Cargo.toml" \
  --optimize

stellar contract deploy \
  --wasm "$WASM_PATH" \
  --source-account "$SOURCE_ACCOUNT" \
  --network "$NETWORK" \
  --alias "$ALIAS" \
  --cost
