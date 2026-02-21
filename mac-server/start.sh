#!/bin/bash
# Mr. Mojo Rising — Mac Server Startup

set -e

# Load environment variables
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

echo "Starting Mr. Mojo Rising Mac server..."
echo "Supabase URL: $SUPABASE_URL"

uvicorn main:app --host 0.0.0.0 --port 8000 --reload
