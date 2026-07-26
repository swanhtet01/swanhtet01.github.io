#!/usr/bin/env bash

set -euo pipefail

echo "Retired: unlinked preview uploads are disabled." >&2
echo "Use the approval-gated canonical megaos preview path or the coordinated GitHub release workflow." >&2
exit 78
