#!/usr/bin/env python3
"""Read-only production health gate for the current SuperMega product funnel."""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable


USER_AGENT = "supermega-public-live-health/5.0"


@dataclass(frozen=True)
class HttpResult:
    url: str
    status: int
    headers: dict[str, str]
    body: bytes


def fetch(url: str, *, timeout: float = 30.0) -> HttpResult:
    request = urllib.request.Request(url, headers={"Accept": "text/html,application/json", "User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return HttpResult(response.geturl(), response.status, dict(response.headers.items()), response.read())
    except urllib.error.HTTPError as error:
        return HttpResult(url, error.code, dict(error.headers.items()), error.read())


def check_page(url: str, tokens: list[str], getter: Callable[[str], HttpResult] = fetch) -> dict[str, Any]:
    result = getter(url)
    body = result.body.decode("utf-8", errors="replace")
    missing = [token for token in tokens if token not in body]
    return {"kind": "page", "url": url, "status": result.status, "bytes": len(result.body), "missing": missing}


def check_json(url: str, expected: dict[str, Any], getter: Callable[[str], HttpResult] = fetch) -> dict[str, Any]:
    result = getter(url)
    try:
        payload = json.loads(result.body.decode("utf-8", errors="replace"))
    except json.JSONDecodeError:
        payload = None
    mismatches = {key: {"expected": value, "actual": payload.get(key) if isinstance(payload, dict) else None} for key, value in expected.items() if not isinstance(payload, dict) or payload.get(key) != value}
    return {"kind": "json", "url": url, "status": result.status, "mismatches": mismatches}


def run(getter: Callable[[str], HttpResult] = fetch) -> dict[str, Any]:
    checks = [
        check_page("https://supermega.dev/", ["Operating software for shops and plants", "Shop", "Plant"], getter),
        check_page("https://www.supermega.dev/", ["Operating software for shops and plants", "Shop", "Plant"], getter),
        check_page("https://supermega.dev/products/", ["Open Shop"], getter),
        check_page("https://supermega.dev/offers/", ["Talk to us"], getter),
        check_page("https://supermega.dev/contact/", ["Start a conversation", "What should become easier?"], getter),
        check_page("https://app.supermega.dev/commerce-machine", [], getter),
        check_json("https://app.supermega.dev/api/health", {"status": "ready", "service": "supermega-service"}, getter),
        check_json("https://pos.supermega.dev/api/health", {"status": "ready"}, getter),
        check_json("https://supermega.dev/api/contact-submissions/status", {"status": "ready", "lead_ledger": "configured"}, getter),
    ]
    failures = [check for check in checks if check["status"] != 200 or check.get("missing") or check.get("mismatches")]
    return {"status": "ready" if not failures else "error", "checks": len(checks), "failures": failures, "results": checks}


if __name__ == "__main__":
    result = run()
    print(json.dumps(result, indent=2))
    sys.exit(0 if result["status"] == "ready" else 1)
