#!/usr/bin/env python3
"""Read-only live health gate for the current SuperMega public funnel."""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any
from urllib.parse import urljoin


USER_AGENT = "supermega-public-live-health/2.0"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: N802
        return None


@dataclass(frozen=True)
class HttpResult:
    url: str
    status: int
    headers: dict[str, str]
    body: bytes


def fetch(url: str, *, timeout: float, attempts: int, follow_redirects: bool = True) -> HttpResult:
    opener = urllib.request.build_opener() if follow_redirects else urllib.request.build_opener(NoRedirect())
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "text/html,application/json",
            "User-Agent": USER_AGENT,
        },
    )
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            with opener.open(request, timeout=timeout) as response:
                return HttpResult(
                    url=response.geturl(),
                    status=response.getcode(),
                    headers=dict(response.headers.items()),
                    body=response.read(),
                )
        except urllib.error.HTTPError as error:
            result = HttpResult(
                url=url,
                status=error.code,
                headers=dict(error.headers.items()),
                body=error.read(),
            )
            if 500 <= error.code < 600 and attempt < attempts:
                time.sleep(attempt)
                continue
            return result
        except (TimeoutError, OSError, urllib.error.URLError) as error:
            last_error = error
            if attempt < attempts:
                time.sleep(attempt)
    raise RuntimeError(f"request_failed: {url}: {type(last_error).__name__}") from last_error


def nested_value(payload: dict[str, Any], path: str) -> Any:
    value: Any = payload
    for key in path.split("."):
        if not isinstance(value, dict) or key not in value:
            return None
        value = value[key]
    return value


def run(base_url: str, www_url: str, app_url: str, *, timeout: float, attempts: int) -> dict[str, Any]:
    base_url = base_url.rstrip("/") + "/"
    www_url = www_url.rstrip("/") + "/"
    app_url = app_url.rstrip("/") + "/"
    failures: list[dict[str, Any]] = []
    results: list[dict[str, Any]] = []

    page_checks = [
        (
            base_url,
            [
                "Run the day. Keep the handoffs.",
                "Open Shop demo",
                "Private setup",
                "Start with the work that matters.",
            ],
        ),
        (
            www_url,
            [
                "Run the day. Keep the handoffs.",
                "Open Shop demo",
                "Private setup",
                "Start with the work that matters.",
            ],
        ),
        (
            urljoin(base_url, "contact/"),
            [
                "What should run better?",
                'action="/api/contact-submissions"',
                'name="name"',
                'name="email"',
                'name="company"',
                'name="goal"',
                "No account, data connection, or external action starts without approval.",
            ],
        ),
        (urljoin(base_url, "privacy/"), ["Only the details needed to reply."]),
    ]

    for url, tokens in page_checks:
        response = fetch(url, timeout=timeout, attempts=attempts)
        body = response.body.decode("utf-8", errors="replace")
        missing = [token for token in tokens if token not in body]
        result = {"kind": "page", "url": url, "status": response.status, "bytes": len(response.body), "missing": missing}
        results.append(result)
        if response.status != 200 or len(response.body) < 1000 or missing:
            failures.append(result)

    for path in ("products/", "pricing/", "ai-agents/", "offers/"):
        url = urljoin(base_url, path)
        response = fetch(url, timeout=timeout, attempts=attempts, follow_redirects=False)
        location = response.headers.get("Location") or response.headers.get("location") or ""
        result = {"kind": "retired_route", "url": url, "status": response.status, "location": location}
        results.append(result)
        if response.status != 308 or location != "/":
            failures.append(result)

    status_url = urljoin(base_url, "api/contact-submissions/status")
    status_response = fetch(status_url, timeout=timeout, attempts=attempts)
    try:
        status_payload = json.loads(status_response.body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        status_payload = {}

    expected_contact_status = {
        "status": "ready",
        "service": "supermega-contact",
    }
    contact_mismatches = {
        path: {"expected": expected, "actual": nested_value(status_payload, path)}
        for path, expected in expected_contact_status.items()
        if nested_value(status_payload, path) != expected
    }
    contact_result = {
        "kind": "contact_status",
        "url": status_url,
        "status": status_response.status,
        "mismatches": contact_mismatches,
    }
    results.append(contact_result)
    if status_response.status != 200 or contact_mismatches:
        failures.append(contact_result)

    app_status_url = urljoin(app_url, "api/health")
    app_status_response = fetch(app_status_url, timeout=timeout, attempts=attempts)
    try:
        app_status_payload = json.loads(app_status_response.body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        app_status_payload = {}

    expected_app_status = {
        "ok": True,
        "status": "ready",
        "service": "supermega-product-app",
        "portfolio.products": ["shop", "plant"],
        "proof.workingDemos": True,
        "proof.productionCloudDurability": "not-asserted",
        "proof.realCustomerAcceptance": "not-asserted",
    }
    app_mismatches = {
        path: {"expected": expected, "actual": nested_value(app_status_payload, path)}
        for path, expected in expected_app_status.items()
        if nested_value(app_status_payload, path) != expected
    }
    app_result = {
        "kind": "product_app",
        "url": app_status_url,
        "status": app_status_response.status,
        "mismatches": app_mismatches,
    }
    results.append(app_result)
    if app_status_response.status != 200 or app_mismatches:
        failures.append(app_result)

    return {
        "status": "ready" if not failures else "error",
        "checks": len(results),
        "failures": failures,
        "results": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="https://supermega.dev")
    parser.add_argument("--www-url", default="https://www.supermega.dev")
    parser.add_argument("--app-url", default="https://app.supermega.dev")
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--attempts", type=int, default=3)
    args = parser.parse_args()
    if args.timeout <= 0 or args.attempts < 1:
        parser.error("timeout and attempts must be positive")

    try:
        report = run(args.base_url, args.www_url, args.app_url, timeout=args.timeout, attempts=args.attempts)
    except Exception as error:  # Keep Actions output concise and secret-free.
        report = {"status": "error", "reason": str(error)}

    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report.get("status") == "ready" else 1


if __name__ == "__main__":
    sys.exit(main())
