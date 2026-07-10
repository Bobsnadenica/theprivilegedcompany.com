#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
portal_base="${PORTAL_BASE:-https://data.egov.bg}"
road_portal_base="${ROAD_PORTAL_BASE:-https://data.egov.bg}"
road_resource_uuid="${ROAD_RESOURCE_UUID:-}"

if [[ $# -ne 0 ]]; then
  echo "Употреба: ./update.sh" >&2
  echo "По избор: PORTAL_BASE=https://data.egov.bg ./update.sh" >&2
  exit 2
fi

echo "Обновяване от ${portal_base}"
echo "Географски данни за ПТП от ${road_portal_base}"
echo "Данните първо се записват във временна папка и се активират само след успешна проверка."

update_args=(
  --target "$project_dir/data"
  --portal-base "$portal_base"
  --road-portal-base "$road_portal_base"
)

if [[ -n "$road_resource_uuid" ]]; then
  update_args+=(--road-resource-uuid "$road_resource_uuid")
fi

python3 "$project_dir/scripts/update_data.py" \
  "${update_args[@]}"

cd "$project_dir"
npm run test

echo "Готово: локалната моментна снимка и статичният build са валидни."
echo "Процесът приключи изцяло локално."
