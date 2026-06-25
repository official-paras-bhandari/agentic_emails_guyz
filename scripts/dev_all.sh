#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

docker info >/dev/null
docker compose up -d postgres redis
npm run db:push
node --env-file=.env scripts/seed_local.js

cleanup() {
  kill "${WEB_PID:-}" "${API_PID:-}" "${RQ_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

npm run dev:web & WEB_PID=$!
npm run dev:worker-api & API_PID=$!
npm run dev:worker-rq & RQ_PID=$!
bash ./scripts/dev_cron.sh & CRON_PID=$!
wait
