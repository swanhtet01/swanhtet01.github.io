#!/usr/bin/env bash

set -euo pipefail

echo "Retired: claimable preview uploads are disabled because they are not bound to SuperMega's canonical Vercel project." >&2
echo "Use the approval-gated canonical megaos preview path or the coordinated GitHub release workflow." >&2
exit 78
