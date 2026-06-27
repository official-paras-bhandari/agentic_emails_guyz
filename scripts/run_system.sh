#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

ROOT_DIR="$(pwd)"
RUNTIME_BIN="/Users/parashbhandari/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin"
RUNTIME_NODE="/Users/parashbhandari/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
export PATH="$RUNTIME_BIN:$RUNTIME_NODE:$PATH"
ulimit -n 4096 || true

load_env_file() {
  if [ -f "$1" ]; then
    set -a
    . "$1"
    set +a
  fi
}

load_env_file .env
load_env_file apps/web/.env
load_env_file apps/worker/.env

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need_cmd docker
need_cmd pnpm
need_cmd node

echo "Checking Docker..."
docker info >/dev/null

echo "Starting PostgreSQL and Redis..."
docker compose up -d postgres redis

echo "Generating Prisma client..."
pnpm run db:generate

echo "Syncing database schema..."
pnpm run db:push

cleanup() {
  kill "${WEB_PID:-}" "${API_PID:-}" "${RQ_PID:-}" "${CRON_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting web app, worker API, queue worker, and cron helper..."
pnpm run dev:web & WEB_PID=$!
pnpm run dev:worker-api & API_PID=$!
pnpm run dev:worker-rq & RQ_PID=$!
bash ./scripts/dev_cron.sh & CRON_PID=$!

wait
