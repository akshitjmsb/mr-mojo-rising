#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LABEL="com.mrmojorising.worker"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
APP_SUPPORT_DIR="$HOME/Library/Application Support/MrMojoRising"
RUNTIME_DIR="$APP_SUPPORT_DIR/runtime"
LOG_DIR="$APP_SUPPORT_DIR/logs"
STDOUT_LOG="$LOG_DIR/worker-launchd.out.log"
STDERR_LOG="$LOG_DIR/worker-launchd.err.log"

mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$LOG_DIR"
mkdir -p "$RUNTIME_DIR"

if [ ! -f "$PROJECT_DIR/.env.local" ]; then
  echo "Missing .env.local. Create it before installing the worker LaunchAgent."
  exit 1
fi

if [ ! -x "$PROJECT_DIR/mac-server/start.sh" ]; then
  chmod +x "$PROJECT_DIR/mac-server/start.sh"
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync is required to install the worker runtime."
  exit 1
fi

rsync -a --delete \
  --exclude "__pycache__" \
  --exclude "*.pyc" \
  "$PROJECT_DIR/mac-server/" "$RUNTIME_DIR/mac-server/"

cp "$PROJECT_DIR/.env.local" "$RUNTIME_DIR/.env.local"
chmod +x "$RUNTIME_DIR/mac-server/start.sh"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$RUNTIME_DIR/mac-server/start.sh</string>
  </array>

  <key>WorkingDirectory</key>
  <string>$RUNTIME_DIR</string>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>$STDOUT_LOG</string>

  <key>StandardErrorPath</key>
  <string>$STDERR_LOG</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>ENABLE_WORKER_SUPERVISOR</key>
    <string>1</string>
  </dict>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl kickstart -k "gui/$(id -u)/$LABEL"

echo "Installed and started $LABEL"
echo "Plist: $PLIST"
echo "Runtime: $RUNTIME_DIR"
echo "Logs: $STDOUT_LOG"
echo "Status: launchctl print gui/$(id -u)/$LABEL"
