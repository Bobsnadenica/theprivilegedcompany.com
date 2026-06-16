#!/usr/bin/env bash
#
# AIPost247 — стартиране с една команда (macOS / Linux / WSL / Git Bash).
#
#   ./run.sh            -> настройва venv, инсталира зависимости, стартира приложението
#   ./run.sh setup      -> всеки аргумент се подава директно към run.py
#   ./run.sh generate
#   ./run.sh post-now
#   ./run.sh run
#
# Създава изолирана виртуална среда (.venv), инсталира зависимостите в нея и
# след това стартира Python входната точка.
#
set -euo pipefail

# Винаги работи от директорията на самия скрипт, без значение откъде е извикан.
cd "$(dirname "$0")"

VENV_DIR=".venv"
PYTHON_BIN="${PYTHON_BIN:-python3}"

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "[run.sh] Грешка: '$PYTHON_BIN' не е намерен. Инсталирайте Python 3.9+ и опитайте пак." >&2
  echo "         (Можете да смените интерпретатора: PYTHON_BIN=python ./run.sh)" >&2
  exit 1
fi

# 1) Създаване на виртуалната среда при първо стартиране.
if [ ! -d "$VENV_DIR" ]; then
  echo "[run.sh] Създаване на виртуална среда в ./$VENV_DIR ..."
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

# 2) Активиране (временно изключваме 'nounset' заради по-стари activate скриптове).
set +u
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
set -u

# 3) Инсталиране / обновяване на зависимостите при първо стартиране или при промяна.
STAMP="$VENV_DIR/.requirements.stamp"
if [ ! -f "$STAMP" ] || [ requirements.txt -nt "$STAMP" ]; then
  echo "[run.sh] Инсталиране на зависимости ..."
  python -m pip install --upgrade pip >/dev/null
  python -m pip install -r requirements.txt
  touch "$STAMP"
else
  echo "[run.sh] Зависимостите вече са инсталирани."
fi

# 4) Стартиране на приложението с подаване на всички аргументи.
# 'exec' позволява Ctrl+C да достигне до Python.
echo "[run.sh] Стартиране на AIPost247 ..."
exec python run.py "$@"
