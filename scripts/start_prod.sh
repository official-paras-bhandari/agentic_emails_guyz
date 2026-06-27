#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
RUNTIME_BIN="/Users/parashbhandari/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin"
RUNTIME_NODE="/Users/parashbhandari/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
export PATH="$RUNTIME_BIN:$RUNTIME_NODE:$PATH"
ulimit -n 4096 || true

cleanup() {
  kill "${WEB_PID:-}" "${API_PID:-}" "${RQ_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

npm_cmd="${NPM_CMD:-pnpm}"
"$npm_cmd" --dir apps/web run start & WEB_PID=$!
pnpm run dev:worker-api & API_PID=$!
pnpm run dev:worker-rq & RQ_PID=$!
wait
