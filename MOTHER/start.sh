#!/usr/bin/env bash
# MOTHER - run ./start.sh (Mac/Linux). First run installs everything and asks for the database password.
#   ./start.sh --setup   re-enter the database login
set -e
cd "$(dirname "$0")"

PY=python3
command -v python3 >/dev/null 2>&1 || PY=python
if ! command -v "$PY" >/dev/null 2>&1; then
  echo "[MOTHER] Python 3.10 or newer is required: https://www.python.org/downloads/"
  exit 1
fi

if [ ! -x .venv/bin/python ]; then
  echo "[MOTHER] First run: creating the Python environment (1-2 minutes)..."
  "$PY" -m venv .venv
fi
echo "[MOTHER] Checking Python packages..."
.venv/bin/python -m pip install --quiet --disable-pip-version-check -r requirements.txt

if [ "$1" = "--setup" ] || [ ! -f .env ]; then
  .venv/bin/python -m mother.configure || true
fi
exec .venv/bin/python -m mother.server
