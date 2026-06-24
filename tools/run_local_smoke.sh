#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${SUPERMEGA_SMOKE_HOST:-127.0.0.1}"
if [[ -n "${SUPERMEGA_SMOKE_PORT:-}" ]]; then
  PORT="$SUPERMEGA_SMOKE_PORT"
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
RUN_TAG="$(date +%s)"
SMOKE_WORKSPACE_SLUG="${SUPERMEGA_SMOKE_WORKSPACE_SLUG:-smoke-${RUN_TAG}}"
SMOKE_WORKSPACE_NAME="${SUPERMEGA_SMOKE_WORKSPACE_NAME:-Smoke Workspace ${RUN_TAG}}"
SMOKE_APP_USERNAME="${SUPERMEGA_SMOKE_APP_USERNAME:-owner-${RUN_TAG}}"
SMOKE_APP_PASSWORD="${SUPERMEGA_SMOKE_APP_PASSWORD:-supermega-demo}"
SMOKE_APP_DISPLAY_NAME="${SUPERMEGA_SMOKE_APP_DISPLAY_NAME:-Smoke Owner ${RUN_TAG}}"

cd "$REPO_ROOT"

SUPERMEGA_APP_USERNAME="$SMOKE_APP_USERNAME" \
SUPERMEGA_APP_PASSWORD="$SMOKE_APP_PASSWORD" \
SUPERMEGA_APP_DISPLAY_NAME="$SMOKE_APP_DISPLAY_NAME" \
SUPERMEGA_WORKSPACE_SLUG="$SMOKE_WORKSPACE_SLUG" \
SUPERMEGA_WORKSPACE_NAME="$SMOKE_WORKSPACE_NAME" \
nohup python3 tools/serve_solution.py --host "$HOST" --port "$PORT" </dev/null >/tmp/supermega-local-smoke.log 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" >/dev/null 2>&1 || true
  wait "$SERVER_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 30); do
  if curl -fsS "$BASE_URL/api/health" >/dev/null 2>&1; then
    python3 tools/smoke_test_supermega_app.py \
      --base-url "$BASE_URL" \
      --username "$SMOKE_APP_USERNAME" \
      --password "$SMOKE_APP_PASSWORD" \
      --workspace "$SMOKE_WORKSPACE_SLUG" \
      --timeout-seconds 120 \
      --as-json
    exit 0
  fi
  sleep 1
done

echo "Local smoke server did not become ready at $BASE_URL" >&2
echo "Server log:" >&2
cat /tmp/supermega-local-smoke.log >&2
exit 1
