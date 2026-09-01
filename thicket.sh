#!/usr/bin/env bash
set -euo pipefail

THICKET_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
THICKET_VENV="$THICKET_ROOT/.venv"
THICKET_WEB="$THICKET_ROOT/thicket-web"

usage() {
  echo "Usage: ./thicket.sh {setup|start|dev|test}"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Thicket needs $1, but it was not found on PATH." >&2
    exit 1
  fi
}

setup() {
  require_command python3
  require_command npm
  if [[ ! -x "$THICKET_VENV/bin/python" ]]; then
    python3 -m venv "$THICKET_VENV"
  fi
  "$THICKET_VENV/bin/python" -m pip install -r "$THICKET_ROOT/requirements.txt"
  npm --prefix "$THICKET_WEB" ci
  VITE_API_URL= npm --prefix "$THICKET_WEB" run build
  echo "Thicket is ready. Run ./thicket.sh start"
}

start() {
  if [[ ! -x "$THICKET_VENV/bin/uvicorn" || ! -f "$THICKET_WEB/dist/index.html" ]]; then
    echo "Thicket is not built yet. Run ./thicket.sh setup first." >&2
    exit 1
  fi
  echo "Thicket is running at http://127.0.0.1:${THICKET_PORT:-8000}"
  cd "$THICKET_ROOT"
  THICKET_STATIC_DIR="$THICKET_WEB/dist" \
    exec "$THICKET_VENV/bin/uvicorn" thicket.main:app \
      --host 127.0.0.1 --port "${THICKET_PORT:-8000}"
}

dev() {
  if [[ ! -x "$THICKET_VENV/bin/uvicorn" || ! -d "$THICKET_WEB/node_modules" ]]; then
    echo "Dependencies are missing. Run ./thicket.sh setup first." >&2
    exit 1
  fi
  trap 'kill 0' EXIT INT TERM
  cd "$THICKET_ROOT"
  "$THICKET_VENV/bin/uvicorn" thicket.main:app --reload \
    --host 127.0.0.1 --port 8000 &
  npm --prefix "$THICKET_WEB" run dev -- --host 127.0.0.1
}

test_all() {
  "$THICKET_VENV/bin/python" -m pytest
  npm --prefix "$THICKET_WEB" test
  npm --prefix "$THICKET_WEB" run lint
  VITE_API_URL= npm --prefix "$THICKET_WEB" run build
}

case "${1:-}" in
  setup) setup ;;
  start) start ;;
  dev) dev ;;
  test) test_all ;;
  *) usage; exit 2 ;;
esac
