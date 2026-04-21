#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_ENDPOINT="https://codex-deploy-skills.vercel.sh/api/deploy"

cd "$REPO_ROOT"

echo "Checking deploy endpoint..."
if ! curl -I -sS --connect-timeout 5 "$DEPLOY_ENDPOINT" >/dev/null; then
  echo "Deploy endpoint is currently unreachable: $DEPLOY_ENDPOINT" >&2
  exit 2
fi

echo "Deploying bundle..."
bash "${REPO_ROOT}/tools/deploy_claimable_preview.sh"
