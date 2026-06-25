#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

cleanup() {
  kill "${WEB_PID:-}" "${API_PID:-}" "${RQ_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

npm run start --workspace=apps/web & WEB_PID=$!
npm run dev:worker-api & API_PID=$!
npm run dev:worker-rq & RQ_PID=$!
wait
