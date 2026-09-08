#!/usr/bin/env bash
#
# Shared implementation behind the per-platform entry points. macOS and Linux
# run identical commands; the separate scripts exist because the project asks
# for them by name, and keeping one copy of the logic means a fix to the
# start-up sequence cannot land on one platform and miss the other.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE=(docker compose -f "$REPO_ROOT/docker-compose.yml")
URL="http://localhost:8000"

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is not installed. See https://docs.docker.com/get-docker/" >&2
    exit 1
  fi

  if ! docker info >/dev/null 2>&1; then
    echo "Docker is installed but not running. Start Docker, then try again." >&2
    exit 1
  fi
}

start() {
  require_docker

  echo "Building and starting Prelegal…"
  "${COMPOSE[@]}" up --build -d

  printf 'Waiting for %s ' "$URL"
  for _ in $(seq 1 60); do
    if curl -fsS "$URL/api/health" >/dev/null 2>&1; then
      printf '\n\nPrelegal is running at %s\n' "$URL"
      return 0
    fi
    printf '.'
    sleep 1
  done

  printf '\n\nTimed out waiting for the app. Recent logs:\n' >&2
  "${COMPOSE[@]}" logs --tail 40 >&2
  exit 1
}

stop() {
  require_docker

  "${COMPOSE[@]}" down
  echo "Prelegal stopped. Its database went with it, which is the intended"
  echo "behaviour while the schema is still changing."
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  *)
    echo "Usage: $(basename "${BASH_SOURCE[0]}") {start|stop}" >&2
    exit 64
    ;;
esac
