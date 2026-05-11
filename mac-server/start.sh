#!/usr/bin/env bash
# Mr. Mojo Rising — Mac Server Startup

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$SCRIPT_DIR"

load_env_file() {
  local env_file="$1"
  [ -f "$env_file" ] || return 0

  local raw_line line key value
  while IFS= read -r raw_line || [ -n "$raw_line" ]; do
    line="${raw_line%$'\r'}"

    # Skip blank lines and comments.
    if [[ -z "${line//[[:space:]]/}" || "$line" =~ ^[[:space:]]*# ]]; then
      continue
    fi

    # Support optional "export KEY=VALUE" syntax.
    if [[ "$line" =~ ^[[:space:]]*export[[:space:]]+ ]]; then
      line="${line#export }"
      line="${line#"${line%%[![:space:]]*}"}"
    fi

    [[ "$line" == *"="* ]] || continue

    key="${line%%=*}"
    value="${line#*=}"
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"

    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue

    # Strip matching wrapping quotes if present.
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi

    export "$key=$value"
  done < "$env_file"

  return 0
}

# Load worker env first, then app env so local app config wins by default.
load_env_file "$SCRIPT_DIR/.env"
load_env_file "$ROOT_DIR/.env.local"

if [ -n "${MAC_API_SECRET:-}" ]; then
  export API_SECRET="$MAC_API_SECRET"
fi

missing_vars=()
for required_var in TURSO_DATABASE_URL TURSO_AUTH_TOKEN BLOB_READ_WRITE_TOKEN; do
  if [ -z "${!required_var:-}" ]; then
    missing_vars+=("$required_var")
  fi
done

if [ "${#missing_vars[@]}" -gt 0 ]; then
  echo "Missing required env vars: ${missing_vars[*]}"
  echo "Set them in $ROOT_DIR/.env.local or $SCRIPT_DIR/.env"
  exit 1
fi

echo "Starting Mr. Mojo Rising Mac server..."
echo "Turso URL: $TURSO_DATABASE_URL"
echo "Worker concurrency: ${WORKER_CONCURRENCY:-1}"

PYTHON_BIN="python3"
if [ -x "$SCRIPT_DIR/venv/bin/python" ]; then
  PYTHON_BIN="$SCRIPT_DIR/venv/bin/python"
fi

if [ -z "${DEMUCS_PYTHON:-}" ] && [ -x "$SCRIPT_DIR/venv/bin/python" ]; then
  export DEMUCS_PYTHON="$SCRIPT_DIR/venv/bin/python"
fi

RUNNER=()
if command -v caffeinate >/dev/null 2>&1 && [ "${DISABLE_CAFFEINATE:-0}" != "1" ]; then
  RUNNER=(caffeinate -dimsu)
  echo "Sleep prevention: caffeinate enabled while the worker is running."
fi

if [ "${DEV_RELOAD:-0}" = "1" ]; then
  exec "${RUNNER[@]}" "$PYTHON_BIN" -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
else
  exec "${RUNNER[@]}" "$PYTHON_BIN" -m uvicorn main:app --host 0.0.0.0 --port 8000
fi
