"""Retired placeholder; retained only to fail closed for old launch commands."""

import json


def main() -> int:
    print(json.dumps({
        "service": "legacy-finance-agent",
        "status": "retired",
        "writes_enabled": False,
        "payments_enabled": False,
        "reason": "Use the canonical managed queue and human approval path.",
    }, separators=(",", ":")))
    return 78


if __name__ == "__main__":
    raise SystemExit(main())
