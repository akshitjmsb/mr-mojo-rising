#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -x mac-server/venv-lessons/bin/python ]; then
  python3 -m venv mac-server/venv-lessons
  mac-server/venv-lessons/bin/pip install -r mac-server/requirements-lessons.txt
fi
exec mac-server/venv-lessons/bin/python mac-server/lesson_worker.py "$@"
