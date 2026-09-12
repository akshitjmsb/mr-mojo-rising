#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PYTHON="$PROJECT_DIR/mac-server/venv/bin/python"
LABEL="com.mrmojorising.worker"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
"$PYTHON" -m yt_dlp --version
"$PROJECT_DIR/mac-server/venv-sep/bin/python" -c 'from audio_separator.utils.cli import main; main()' --version
test -f "$PROJECT_DIR/.env.local"
"$PYTHON" "$SCRIPT_DIR/write-worker-registration.py" "$PROJECT_DIR" "$PLIST"
plutil -lint "$PLIST"
launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
# bootout can return before launchd has finished tearing down the old job.
for attempt in 1 2 3 4 5; do
  if launchctl bootstrap "gui/$(id -u)" "$PLIST"; then
    break
  fi
  if [ "$attempt" = 5 ]; then
    echo "Registration failed; backup is in .runtime/backups."
    exit 1
  fi
  sleep 2
done
echo "Worker registered directly from $PROJECT_DIR; logs in .runtime/logs"
