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

# Stamp the version (from __init__.py) + build date into the download card so
# the website and the zip always advertise the same, current version.
VER="$(grep -oE '__version__ *= *"[^"]+"' "$HERE/aipost247/__init__.py" | sed -E 's/.*"([^"]+)".*/\1/')"
DATE="$(date +%Y-%m-%d)"
if [ -n "$VER" ] && grep -q 'id="dl-ver"' "$HERE/index.html"; then
  STAMP="$(mktemp)"
  sed -E "s#(<div class=\"dl-ver\" id=\"dl-ver\">).*(</div>)#\1Версия ${VER} · обновена ${DATE}\2#" \
    "$HERE/index.html" > "$STAMP" && mv "$STAMP" "$HERE/index.html"
  echo "Stamped version: $VER ($DATE)"
fi

STAGE="$(mktemp -d)"
DEST="$STAGE/aipost247"
mkdir -p "$DEST"
trap 'rm -rf "$STAGE"' EXIT

rsync -a \
  --exclude='.venv/' \
  --exclude='.env' \
  --exclude='*.env' \
  --exclude='data/' \
  --exclude='logs/' \
  --exclude='download/' \
  --exclude='__pycache__/' \
  --exclude='*.pyc' \
  --exclude='*.log' \
  --exclude='*.out' \
  --exclude='.DS_Store' \
  --exclude='*.db' \
  --exclude='*.sqlite3' \
  --exclude='memory/business.md' \
  --exclude='memory/skill.md' \
  --exclude='package.sh' \
  "$HERE/" "$DEST/"

# *.env excludes secrets but also the safe template — restore the template.
cp -f "$HERE/.env.example" "$DEST/.env.example" 2>/dev/null || true

# Safety net: refuse to ship if any personal/secret file slipped in, so the
# public download can never contain user data — enforced on every build.
FORBIDDEN="$(cd "$STAGE" && find aipost247 \
  \( -name '.env' -o -name '*.db' -o -name '*.sqlite3' \
     -o -name 'business.md' -o -name 'skill.md' -o -name 'oauth_creds.json' \) \
  ! -name '.env.example' -print)"
if [ -n "$FORBIDDEN" ]; then
  echo "ABORT: personal/secret files would be packaged:" >&2
  echo "$FORBIDDEN" | sed 's/^/  /' >&2
  exit 1
fi

rm -f "$OUT"
( cd "$STAGE" && zip -r -q "$OUT" "aipost247" )

echo "Built: $OUT"
ls -lh "$OUT" | awk '{print "  size:", $5}'
echo "  contents:"
unzip -Z1 "$OUT" | sed 's/^/    /'
