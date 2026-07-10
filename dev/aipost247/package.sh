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
PYTHON="${PYTHON_BIN:-python3}"
if [ -z "${PYTHON_BIN:-}" ] && [ -x "$HERE/.venv/bin/python" ]; then
  PYTHON="$HERE/.venv/bin/python"
fi

# Stamp the version (from __init__.py) + build date into the download card so
# the website and the zip always advertise the same, current version.
VER="$(grep -oE '__version__ *= *"[^"]+"' "$HERE/aipost247/__init__.py" | sed -E 's/.*"([^"]+)".*/\1/')"
DATE="$(date +%Y-%m-%d)"
"$PYTHON" "$HERE/assets/build-images-manifest.py"
"$PYTHON" "$HERE/assets/video/validate-videos.py"
"$PYTHON" -m compileall -q "$HERE/run.py" "$HERE/aipost247" "$HERE/assets"
"$PYTHON" -m unittest discover -s "$HERE/tests" -v
ASSET_HASH="$(
  find "$HERE/assets" -type f \
    ! -path '*/__pycache__/*' \
    ! -name '.DS_Store' \
    -print \
  | LC_ALL=C sort \
  | while IFS= read -r f; do shasum "$f"; done \
  | shasum \
  | awk '{print substr($1, 1, 12)}'
)"
if [ -n "$VER" ] && grep -q 'id="dl-ver"' "$HERE/index.html"; then
  STAMP="$(mktemp)"
  sed -E \
    -e "s#(<html lang=\"bg\" data-assets-version=\")[^\"]*(\")#\1${VER}-${ASSET_HASH}\2#" \
    -e "s#(<div class=\"dl-ver\" id=\"dl-ver\">).*(</div>)#\1Версия ${VER} · обновена ${DATE}\2#" \
    "$HERE/index.html" > "$STAMP" && mv "$STAMP" "$HERE/index.html"
  echo "Stamped version: $VER ($DATE)"
  echo "Stamped asset version: ${VER}-${ASSET_HASH}"
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
  --exclude='planning/' \
  --exclude='tests/' \
  --exclude='__pycache__/' \
  --exclude='*.pyc' \
  --exclude='.pytest_cache/' \
  --exclude='.mypy_cache/' \
  --exclude='.ruff_cache/' \
  --exclude='.coverage' \
  --exclude='coverage.xml' \
  --exclude='htmlcov/' \
  --exclude='*.log' \
  --exclude='*.out' \
  --exclude='.DS_Store' \
  --exclude='*.db' \
  --exclude='*.sqlite3' \
  --exclude='memory/business.md' \
  --exclude='memory/skill.md' \
  --exclude='memory/steering.md' \
  --exclude='assets/soon copy*.jpg' \
  --exclude='package.sh' \
  "$HERE/" "$DEST/"

# *.env excludes secrets but also the safe template — restore the template.
cp -f "$HERE/.env.example" "$DEST/.env.example" 2>/dev/null || true

# Safety net: refuse to ship if any personal/secret file slipped in, so the
# public download can never contain user data — enforced on every build.
FORBIDDEN="$(cd "$STAGE" && find aipost247 \
  \( -name '.env' -o -name '*.db' -o -name '*.sqlite3' \
     -o -name 'business.md' -o -name 'skill.md' -o -name 'steering.md' \
     -o -name 'oauth_creds.json' \) \
  ! -name '.env.example' -print)"
if [ -n "$FORBIDDEN" ]; then
  echo "ABORT: personal/secret files would be packaged:" >&2
  echo "$FORBIDDEN" | sed 's/^/  /' >&2
  exit 1
fi

# Development caches are harmless locally but signal a dirty, needlessly large
# release. Keep this as a second guard in case a future rsync edit misses one.
JUNK="$(cd "$STAGE" && find aipost247 \
  \( -name '__pycache__' -o -name '.pytest_cache' -o -name '.mypy_cache' \
     -o -name '.ruff_cache' -o -name '.coverage' -o -name 'coverage.xml' \
     -o -name 'htmlcov' -o -name '*.pyc' -o -name '*.pyo' \) -print)"
if [ -n "$JUNK" ]; then
  echo "ABORT: development cache files would be packaged:" >&2
  echo "$JUNK" | sed 's/^/  /' >&2
  exit 1
fi

rm -f "$OUT"
( cd "$STAGE" && zip -r -q "$OUT" "aipost247" )

# Size guard: the download is a small tool. Refuse to ship a bloated zip (e.g.
# un-optimized screenshots) so the 2.5 MB regression can never recur.
MAX_BYTES=1572864  # 1.5 MB
ZIP_BYTES="$(wc -c < "$OUT" | tr -d ' ')"
if [ "$ZIP_BYTES" -gt "$MAX_BYTES" ]; then
  echo "ABORT: download is ${ZIP_BYTES} bytes (> ${MAX_BYTES}). Optimize images in assets/." >&2
  rm -f "$OUT"
  exit 1
fi

echo "Built: $OUT"
ls -lh "$OUT" | awk '{print "  size:", $5}'
echo "  contents:"
unzip -Z1 "$OUT" | sed 's/^/    /'
