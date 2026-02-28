#!/bin/bash
# Mr. Mojo Rising — Mac Server Startup

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load environment variables
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

echo "Starting Mr. Mojo Rising Mac server..."
echo "Supabase URL: $SUPABASE_URL"
echo "Worker concurrency: ${WORKER_CONCURRENCY:-1}"

if [ -z "${DEMUCS_PYTHON:-}" ] && [ -x "$SCRIPT_DIR/venv/bin/python" ]; then
  export DEMUCS_PYTHON="$SCRIPT_DIR/venv/bin/python"
fi

if [ "${DEV_RELOAD:-0}" = "1" ]; then
  uvicorn main:app --host 0.0.0.0 --port 8000 --reload
else
  uvicorn main:app --host 0.0.0.0 --port 8000
fi
