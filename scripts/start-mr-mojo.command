#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

LOG_DIR="$PROJECT_DIR/.mmr-logs"
LOG_FILE="$HOME/Library/Logs/MrMojoRising-launch.log"
WEB_PID_FILE="$LOG_DIR/web.pid"
SERVER_PID_FILE="$LOG_DIR/server.pid"
WEB_PORT_FILE="$LOG_DIR/web.port"

WEB_LOG="$LOG_DIR/web.log"
SERVER_LOG="$LOG_DIR/server.log"

WEB_PORT=3000
SERVER_PORT=8000
PORT_CANDIDATES=(3000 3001 3002 3003 3010 3100)

mkdir -p "$LOG_DIR"
mkdir -p "$HOME/Library/Logs"
cd "$PROJECT_DIR"

log() {
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$LOG_FILE"
}

notify() {
  local title="$1"
  local message="$2"
  osascript -e "display notification \"$message\" with title \"$title\"" >/dev/null 2>&1 || true
  log "$title - $message"
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    notify "Mr Mojo Rising" "$cmd is required but not found in PATH"
    exit 1
  fi
}

is_pid_running() {
  local pid="$1"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" >/dev/null 2>&1
}

pid_from_file() {
  local file="$1"
  if [ -f "$file" ]; then
    tr -d "[:space:]" < "$file"
  fi
}

cleanup_stale_pid() {
  local file="$1"
  local existing
  existing="$(pid_from_file "$file" || true)"
  if [ -n "${existing:-}" ] && is_pid_running "$existing"; then
    return 0
  fi
  if [ -f "$file" ]; then
    rm -f "$file"
  fi
  return 0
}

is_port_listening() {
  local port="$1"
  if lsof -iTCP:"$port" -sTCP:LISTEN -nP >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

find_process_for_port() {
  lsof -tiTCP:"$1" -sTCP:LISTEN -nP 2>/dev/null || true
}

find_listening_port_for_pid() {
  local pid="$1"
  lsof -Pan -p "$pid" -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {split($9, a, ":"); print a[length(a)]; exit}'
}

find_available_port() {
  local candidate
  for candidate in "${PORT_CANDIDATES[@]}"; do
    if ! is_port_listening "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

guarded_start() {
  local name="$1"
  local port="$2"
  local process_hint="$3"
  local pid_file="$4"

  cleanup_stale_pid "$pid_file"
  local pids
  pids="$(find_process_for_port "$port")"
  if [ -n "$pids" ]; then
    if [ -n "$process_hint" ]; then
      local pid
      for pid in $pids; do
        local cmdline
        cmdline="$(ps -p "$pid" -o command= 2>/dev/null || true)"
        if [[ "$cmdline" == *"$process_hint"* ]]; then
          echo "$pid" > "$pid_file"
          notify "Mr Mojo Rising" "$name already running on port $port (pid $pid)"
          return 0
        fi
      done
    fi

    notify "Mr Mojo Rising" "$name cannot start because port $port is in use by another process. Resolve and try again."
    exit 1
  fi

  log "Starting $name ..."
  if [ "$name" = "Web app" ]; then
    nohup npm run dev >> "$WEB_LOG" 2>&1 &
  else
    nohup ./mac-server/start.sh >> "$SERVER_LOG" 2>&1 &
  fi
  echo "$!" > "$pid_file"
  sleep 1
}

require_cmd node
require_cmd npm
require_cmd lsof
require_cmd python3

if [ ! -d "$PROJECT_DIR/node_modules" ] || [ ! -x "$PROJECT_DIR/node_modules/.bin/next" ]; then
  notify "Mr Mojo Rising" "Node modules missing. Running npm install..."
  npm install >> "$LOG_DIR/npm-install.log" 2>&1
fi

if [ ! -f "$PROJECT_DIR/.env.local" ]; then
  notify "Mr Mojo Rising" "Missing .env.local. Please create it before launching."
  exit 1
fi

if [ ! -f "$PROJECT_DIR/package.json" ]; then
  notify "Mr Mojo Rising" "Missing package.json in project root."
  exit 1
fi

if [ ! -x "$PROJECT_DIR/mac-server/start.sh" ]; then
  notify "Mr Mojo Rising" "Missing mac-server/start.sh executable."
  exit 1
fi

for required_var in "TURSO_DATABASE_URL" "TURSO_AUTH_TOKEN" "BLOB_READ_WRITE_TOKEN"; do
  if ! grep -qE "^${required_var}=" "$PROJECT_DIR/.env.local" && ! grep -qE "^export ${required_var}=" "$PROJECT_DIR/.env.local"; then
    notify "Mr Mojo Rising" "Missing required env var: $required_var in .env.local"
    exit 1
  fi
done

EXISTING_WEB_PID="$(pid_from_file "$WEB_PID_FILE" || true)"
if [ -n "${EXISTING_WEB_PID:-}" ] && is_pid_running "$EXISTING_WEB_PID"; then
  EXISTING_WEB_PORT="$(find_listening_port_for_pid "$EXISTING_WEB_PID" || true)"
else
  EXISTING_WEB_PORT=""
fi

if [ -n "${EXISTING_WEB_PORT:-}" ]; then
  WEB_PORT="$EXISTING_WEB_PORT"
  WEB_URL="http://localhost:$WEB_PORT"
  notify "Mr Mojo Rising" "Web app already running on port $WEB_PORT"
else
  WEB_PORT="$(find_available_port || true)"
  if [ -z "$WEB_PORT" ]; then
    notify "Mr Mojo Rising" "No free web port found in ${PORT_CANDIDATES[*]}. Free one and retry."
    exit 1
  fi
  WEB_URL="http://localhost:$WEB_PORT"
  echo "$WEB_PORT" > "$WEB_PORT_FILE"
  guarded_start "Web app" "$WEB_PORT" "next dev" "$WEB_PID_FILE"
fi

guarded_start "Backend service" "$SERVER_PORT" "uvicorn main:app" "$SERVER_PID_FILE"

SECONDS_WAIT=0
MAX_SECONDS=30
while ! is_port_listening "$WEB_PORT" && [ "$SECONDS_WAIT" -lt "$MAX_SECONDS" ]; do
  sleep 1
  SECONDS_WAIT=$((SECONDS_WAIT + 1))
done

if ! is_port_listening "$WEB_PORT"; then
  notify "Mr Mojo Rising" "Web app did not start on port $WEB_PORT. Check $WEB_LOG"
  exit 1
fi

if [ -d "/Applications/Google Chrome.app" ]; then
  open -a "Google Chrome" "$WEB_URL" >/dev/null 2>&1 || open "$WEB_URL" >/dev/null 2>&1
else
  open "$WEB_URL" >/dev/null 2>&1
fi

notify "Mr Mojo Rising" "Launch complete. Opened $WEB_URL"
