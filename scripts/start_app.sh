#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_ROOT="${SCRIPT_DIR:h}"

cd "$PROJECT_ROOT"

echo "Starting DoroTracker at http://127.0.0.1:8000"
echo "Press Control+C in this window to stop the server."
echo

PYTHONPATH=backend python3 backend/server.py
