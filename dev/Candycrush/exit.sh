#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-4173}"
PID_FILE="${ROOT_DIR}/.sugarbox-server.pid"

port_pid() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN -t 2>/dev/null | awk "NR == 1 { print; exit }"
  fi
}

if [[ ! -f "${PID_FILE}" ]]; then
  listener_pid="$(port_pid || true)"
  if [[ -n "${listener_pid}" ]]; then
    printf "No Sugarbox pid file found, but port %s is in use by pid %s.\n" "${PORT}" "${listener_pid}"
    printf "Leaving it alone because it was not started by ./run.sh.\n"
  else
    printf "Sugarbox server is not running.\n"
  fi
  exit 0
fi

pid="$(<"${PID_FILE}")"
if [[ ! "${pid}" =~ ^[0-9]+$ ]]; then
  rm -f "${PID_FILE}"
  printf "Removed invalid Sugarbox pid file.\n"
  exit 0
fi

if ! kill -0 "${pid}" >/dev/null 2>&1; then
  rm -f "${PID_FILE}"
  printf "Sugarbox server was not running. Removed stale pid file.\n"
  exit 0
fi

printf "Stopping Sugarbox server (pid %s)...\n" "${pid}"
kill "${pid}"

for _ in {1..20}; do
  if ! kill -0 "${pid}" >/dev/null 2>&1; then
    rm -f "${PID_FILE}"
    printf "Sugarbox server stopped.\n"
    exit 0
  fi
  sleep 0.1
done

printf "Sugarbox server is still running after SIGTERM (pid %s).\n" "${pid}"
printf "Check it manually, or run: kill %s\n" "${pid}"
