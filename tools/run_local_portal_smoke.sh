#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${SUPERMEGA_HOST:-127.0.0.1}"
if [[ -n "${SUPERMEGA_PORT:-}" ]]; then
  PORT="$SUPERMEGA_PORT"
else
  PORT="$(python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
)"
fi
BASE_URL="http://${HOST}:${PORT}"
SERVER_LOG="${TMPDIR:-/tmp}/supermega-portal-server.log"
RUN_TAG="$(date +%s)"
SMOKE_WORKSPACE_SLUG="${SUPERMEGA_SMOKE_WORKSPACE_SLUG:-portal-smoke-${RUN_TAG}}"
SMOKE_WORKSPACE_NAME="${SUPERMEGA_SMOKE_WORKSPACE_NAME:-Portal Smoke Workspace ${RUN_TAG}}"
SMOKE_APP_USERNAME="${SUPERMEGA_SMOKE_APP_USERNAME:-portal-owner-${RUN_TAG}}"
SMOKE_APP_PASSWORD="${SUPERMEGA_SMOKE_APP_PASSWORD:-supermega-demo}"
SMOKE_APP_DISPLAY_NAME="${SUPERMEGA_SMOKE_APP_DISPLAY_NAME:-Portal Smoke Owner ${RUN_TAG}}"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

echo "Building showroom..."
npm --prefix "${ROOT_DIR}/showroom" run build >/dev/null

echo "Starting API at ${BASE_URL}..."
SUPERMEGA_APP_USERNAME="${SMOKE_APP_USERNAME}" \
SUPERMEGA_APP_PASSWORD="${SMOKE_APP_PASSWORD}" \
SUPERMEGA_APP_DISPLAY_NAME="${SMOKE_APP_DISPLAY_NAME}" \
SUPERMEGA_WORKSPACE_SLUG="${SMOKE_WORKSPACE_SLUG}" \
SUPERMEGA_WORKSPACE_NAME="${SMOKE_WORKSPACE_NAME}" \
python3 "${ROOT_DIR}/tools/serve_solution.py" --host "${HOST}" --port "${PORT}" >"${SERVER_LOG}" 2>&1 &
SERVER_PID=$!

python3 - "${BASE_URL}/api/health" <<'PY'
import json
import sys
import time
import urllib.error
import urllib.request

url = sys.argv[1]
deadline = time.time() + 60
last_error = ""

while time.time() < deadline:
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8"))
            if str(payload.get("status", "")).strip().lower() == "ready":
                print(f"Health check ready at {url}")
                raise SystemExit(0)
            last_error = f"unexpected status: {payload!r}"
    except Exception as exc:  # noqa: BLE001
        last_error = str(exc)
        time.sleep(1)

print(f"Health check failed: {last_error}", file=sys.stderr)
raise SystemExit(1)
PY

echo "Running smoke test..."
python3 "${ROOT_DIR}/tools/smoke_test_supermega_app.py" \
  --base-url "${BASE_URL}" \
  --username "${SMOKE_APP_USERNAME}" \
  --password "${SMOKE_APP_PASSWORD}" \
  --workspace "${SMOKE_WORKSPACE_SLUG}" \
  --timeout-seconds 60 \
  --as-json

echo "Running public site smoke..."
python3 "${ROOT_DIR}/tools/smoke_test_public_site.py" --base-url "${BASE_URL}"

echo "Server log: ${SERVER_LOG}"
