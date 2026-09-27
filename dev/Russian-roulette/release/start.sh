#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Install Node.js 22 or newer from https://nodejs.org/' 'Инсталирайте Node.js 22 или по-нова версия.'
  exit 1
fi
exec node start.mjs
