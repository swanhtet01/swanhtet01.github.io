#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_ENDPOINT="https://codex-deploy-skills.vercel.sh/api/deploy"
TMP_DIR="$(mktemp -d)"
TARBALL_PATH="${TMPDIR:-/tmp}/supermega-claimable-preview.tgz"

cleanup() {
  rm -rf "${TMP_DIR}"
}

trap cleanup EXIT

echo "Packaging preview bundle..." >&2
python3 "${ROOT_DIR}/tools/package_preview_bundle.py" --output "${TARBALL_PATH}" >/dev/null

echo "Uploading preview bundle..." >&2
set +e
RESPONSE="$(timeout 600 curl -sS --fail-with-body -X POST "${DEPLOY_ENDPOINT}" \
  -F "file=@${TARBALL_PATH}" \
  -F "framework=null")"
status=$?
set -e

if [ "${status}" -ne 0 ]; then
  if [ "${status}" -eq 124 ]; then
    echo "Claimable preview deploy timed out after 10 minutes. Retry later or deploy with an authenticated Vercel token." >&2
  else
    echo "Claimable preview deploy failed while contacting ${DEPLOY_ENDPOINT}." >&2
  fi
  exit "${status}"
fi

python3 - "${RESPONSE}" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
print(json.dumps(payload, indent=2))
PY
