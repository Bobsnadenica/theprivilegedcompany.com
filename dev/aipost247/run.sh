#!/usr/bin/env bash
#
# AIPost247 one-command launcher (macOS / Linux / WSL / Git Bash).
#
#   ./run.sh            -> set up venv, install deps, start the app
#   ./run.sh setup      -> any argument is passed straight to run.py
#   ./run.sh generate
#   ./run.sh post-now
#   ./run.sh run
#
# It creates an isolated virtual environment (.venv), installs the
# requirements into it, and then runs the Python entry point.
#
set -euo pipefail

# Always work from this script's own directory, no matter where it's called from.
cd "$(dirname "$0")"

VENV_DIR=".venv"
PYTHON_BIN="${PYTHON_BIN:-python3}"

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "[run.sh] Error: '$PYTHON_BIN' not found. Install Python 3.9+ and retry." >&2
  echo "         (You can override the interpreter: PYTHON_BIN=python ./run.sh)" >&2
  exit 1
fi

# 1) Create the virtual environment on first run.
if [ ! -d "$VENV_DIR" ]; then
  echo "[run.sh] Creating virtual environment in ./$VENV_DIR ..."
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

# 2) Activate it (temporarily relax 'nounset' for older activate scripts).
set +u
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
set -u

# 3) Install / refresh dependencies on first run or when requirements change.
STAMP="$VENV_DIR/.requirements.stamp"
if [ ! -f "$STAMP" ] || [ requirements.txt -nt "$STAMP" ]; then
  echo "[run.sh] Installing dependencies ..."
  python -m pip install --upgrade pip >/dev/null
  python -m pip install -r requirements.txt
  touch "$STAMP"
else
  echo "[run.sh] Dependencies already installed."
fi

# 4) Launch the app, forwarding any arguments. 'exec' lets Ctrl+C reach Python.
echo "[run.sh] Starting AIPost247 ..."
exec python run.py "$@"
