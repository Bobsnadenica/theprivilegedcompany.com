#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-4173}"
URL="http://${HOST}:${PORT}/"
PID_FILE="${ROOT_DIR}/.sugarbox-server.pid"
LOG_FILE="${ROOT_DIR}/.sugarbox-server.log"

print_status() {
  printf "%-18s %s\n" "$1" "$2"
}

command_status() {
  local name="$1"
  local command_name="$2"
  shift 2

  if ! command -v "${command_name}" >/dev/null 2>&1; then
    print_status "${name}" "not installed"
    return
  fi

  if "$@" >/dev/null 2>&1; then
    print_status "${name}" "running"
  else
    print_status "${name}" "not running"
  fi
}

gitlab_runner_status() {
  if ! command -v gitlab-runner >/dev/null 2>&1; then
    print_status "GitLab Runner" "not installed"
    return
  fi

  local runner_output
  runner_output="$(gitlab-runner status 2>&1 || true)"
  if printf "%s" "${runner_output}" | grep -Eiq "service is running|is running" || pgrep -f "[g]itlab-runner" >/dev/null 2>&1; then
    print_status "GitLab Runner" "running"
  else
    print_status "GitLab Runner" "not running"
  fi
}

server_pid_from_file() {
  if [[ -f "${PID_FILE}" ]]; then
    local pid
    pid="$(<"${PID_FILE}")"
    if [[ "${pid}" =~ ^[0-9]+$ ]] && kill -0 "${pid}" >/dev/null 2>&1; then
      printf "%s" "${pid}"
      return
    fi
    rm -f "${PID_FILE}"
  fi
}

port_pid() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN -t 2>/dev/null | awk "NR == 1 { print; exit }"
  fi
}

open_game() {
  if [[ "${OPEN_GAME:-1}" == "0" ]]; then
    printf "Game URL: %s\n" "${URL}"
    return
  fi

  if command -v open >/dev/null 2>&1; then
    open "${URL}" || printf "Open %s in your browser.\n" "${URL}"
  elif command -v xdg-open >/dev/null 2>&1; then
    if ! xdg-open "${URL}" >/dev/null 2>&1; then
      printf "Open %s in your browser.\n" "${URL}"
    fi
  else
    printf "Open %s in your browser.\n" "${URL}"
  fi
}

printf "Checking local services...\n"
command_status "Colima" "colima" colima status
command_status "Docker" "docker" docker info
gitlab_runner_status
printf "\n"

existing_pid="$(server_pid_from_file || true)"
if [[ -n "${existing_pid}" ]]; then
  printf "Sugarbox server already running on %s (pid %s).\n" "${URL}" "${existing_pid}"
  open_game
  exit 0
fi

listener_pid="$(port_pid || true)"
if [[ -n "${listener_pid}" ]]; then
  printf "Port %s is already in use by pid %s. Opening %s.\n" "${PORT}" "${listener_pid}" "${URL}"
  open_game
  exit 0
fi

: > "${LOG_FILE}"
(
  cd "${ROOT_DIR}"
  exec nohup python3 -m http.server "${PORT}" --bind "${HOST}"
) >>"${LOG_FILE}" 2>&1 &
server_pid="$!"
printf "%s" "${server_pid}" > "${PID_FILE}"

sleep 0.7
if ! kill -0 "${server_pid}" >/dev/null 2>&1; then
  rm -f "${PID_FILE}"
  printf "Could not start Sugarbox server. Log:\n"
  tail -n 20 "${LOG_FILE}" || true
  exit 1
fi

printf "Sugarbox server started on %s (pid %s).\n" "${URL}" "${server_pid}"
printf "Log: %s\n" "${LOG_FILE}"
open_game
