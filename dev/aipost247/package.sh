#!/usr/bin/env bash
#
# Build the downloadable distribution:  download/aipost247.zip
#
# The zip contains a clean copy of the project (a top-level aipost247/ folder)
# that users download, unzip, and run with run.sh (macOS/Linux) or run.bat
# (Windows). Secrets, the virtualenv, and runtime data are excluded.
#
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/download/aipost247.zip"
mkdir -p "$HERE/download"

STAGE="$(mktemp -d)"
DEST="$STAGE/aipost247"
mkdir -p "$DEST"
trap 'rm -rf "$STAGE"' EXIT

rsync -a \
  --exclude='.venv/' \
  --exclude='.env' \
  --exclude='data/' \
  --exclude='logs/' \
  --exclude='download/' \
  --exclude='__pycache__/' \
  --exclude='*.pyc' \
  --exclude='*.log' \
  --exclude='*.out' \
  --exclude='.DS_Store' \
  --exclude='memory/business.md' \
  --exclude='package.sh' \
  "$HERE/" "$DEST/"

rm -f "$OUT"
( cd "$STAGE" && zip -r -q "$OUT" "aipost247" )

echo "Built: $OUT"
ls -lh "$OUT" | awk '{print "  size:", $5}'
echo "  contents:"
unzip -Z1 "$OUT" | sed 's/^/    /'
