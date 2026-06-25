#!/bin/bash
# start_worker.sh — Starts both the FastAPI API server and the RQ background worker.
# Both processes must be running for the full email pipeline to work.

set -e

# Navigate to this script's directory
cd "$(dirname "$0")"

# Activate virtual environment if it exists
if [ -d "venv" ]; then
  source venv/bin/activate
  echo "✅ Activated virtual environment"
fi

# Check Redis is reachable
if ! redis-cli ping > /dev/null 2>&1; then
  echo "❌ Redis is not running. Start it with: redis-server"
  echo "   Or with Docker: docker run -d -p 6379:6379 redis:7-alpine"
  exit 1
fi
echo "✅ Redis is running"

# Start the RQ worker in the background
echo "🚀 Starting RQ background worker (queue: agentic_outreach_jobs)..."
rq worker agentic_outreach_jobs --url "${REDIS_URL:-redis://127.0.0.1:6379}" &
RQ_PID=$!
echo "   RQ worker PID: $RQ_PID"

# Give RQ a moment to start
sleep 1

# Start the FastAPI server
echo "🚀 Starting FastAPI server on port ${PORT:-8000}..."
uvicorn src.main:app --host 0.0.0.0 --port "${PORT:-8000}" --reload &
API_PID=$!
echo "   FastAPI PID: $API_PID"

echo ""
echo "✅ Both processes started."
echo "   FastAPI: http://localhost:${PORT:-8000}"
echo "   RQ worker: processing queue 'agentic_outreach_jobs'"
echo ""
echo "   Press Ctrl+C to stop both."

# Wait and forward signals to both processes
trap "echo 'Stopping...'; kill $RQ_PID $API_PID 2>/dev/null; exit 0" INT TERM

wait $API_PID $RQ_PID
