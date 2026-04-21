#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$PROJECT_DIR/.mmr-logs"
LOG_FILE="$HOME/Library/Logs/MrMojoRising-launch.log"
WEB_PID_FILE="$LOG_DIR/web.pid"
SERVER_PID_FILE="$LOG_DIR/server.pid"
WEB_PORT_FILE="$LOG_DIR/web.port"
WEB_PORT=3000
SERVER_PORT=8000

mkdir -p "$LOG_DIR"
mkdir -p "$HOME/Library/Logs"

log() {
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$LOG_FILE"
}

notify() {
  local title="$1"
  local message="$2"
  osascript -e "display notification \"$message\" with title \"$title\"" >/dev/null 2>&1 || true
  log "$title - $message"
}

is_pid_running() {
  local pid="$1"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" >/dev/null 2>&1
}

safe_kill() {
  local pid="$1"
  if ! is_pid_running "$pid"; then
    return 0
  fi

  kill -TERM "$pid" >/dev/null 2>&1 || true
  local tries=10
  while [ "$tries" -gt 0 ]; do
    if is_pid_running "$pid"; then
      sleep 0.4
      tries=$((tries - 1))
    else
      return 0
    fi
  done
  kill -KILL "$pid" >/dev/null 2>&1 || true
}

is_project_process() {
  local pid="$1"
  local cmd
  cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  [[ "$cmd" == *"$PROJECT_DIR"* ]]
}

kill_by_pid_file() {
  local pid_file="$1"
  if [ -f "$pid_file" ]; then
    local pid
    pid="$(tr -d '[:space:]' < "$pid_file" || true)"
    if [ -n "${pid:-}" ] && is_project_process "$pid"; then
      safe_kill "$pid"
    fi
    rm -f "$pid_file"
  fi
}

kill_by_label() {
  local pattern="$1"
  local pids
  pids="$(pgrep -f "$pattern" 2>/dev/null || true)"
  local pid
  for pid in $pids; do
    if is_project_process "$pid"; then
      safe_kill "$pid"
    fi
  done
}

kill_by_port() {
  local port="$1"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN -nP 2>/dev/null || true)"
  local pid
  for pid in $pids; do
    if is_project_process "$pid"; then
      safe_kill "$pid"
    fi
  done
}

is_project_process_on_port() {
  local port="$1"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN -nP 2>/dev/null || true)"
  local pid
  for pid in $pids; do
    if is_project_process "$pid"; then
      return 0
    fi
  done
  return 1
}

kill_by_pid_file "$WEB_PID_FILE"
kill_by_pid_file "$SERVER_PID_FILE"
rm -f "$WEB_PORT_FILE"
kill_by_label "npm run dev"
kill_by_label "mac-server/start.sh"
kill_by_port 3000
kill_by_port 8000

if is_project_process_on_port "$WEB_PORT" || is_project_process_on_port "$SERVER_PORT"; then
  notify "Mr Mojo Rising" "Warning: some project-related processes may still be listening on 3000/8000."
  exit 1
fi

notify "Mr Mojo Rising" "Mr Mojo Rising stopped."
