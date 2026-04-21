#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STOP_SCRIPT="$PROJECT_DIR/scripts/stop-mr-mojo.command"
START_SCRIPT="$PROJECT_DIR/scripts/start-mr-mojo.command"

"$STOP_SCRIPT" || true
"$START_SCRIPT"
