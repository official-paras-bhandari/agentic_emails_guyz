#!/usr/bin/env bash
set -euo pipefail

base_url="${1:-http://127.0.0.1:3000}"
cron_secret="${CRON_SECRET:-}"

while true; do
  if [[ -n "$cron_secret" ]]; then
    curl --max-time 20 -sS -X GET \
      -H "Authorization: Bearer ${cron_secret}" \
      "${base_url}/api/cron" >/dev/null || true
  else
    curl --max-time 20 -sS -X GET "${base_url}/api/cron" >/dev/null || true
  fi
  sleep 60
done
