from __future__ import annotations

import argparse
import json
import socket
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Callable


DEFAULT_DOMAIN = "supermega.dev"
DEFAULT_ROUTES = [
    "/",
    "/packages/",
    "/contact/",
]
DEFAULT_RETRY_ATTEMPTS = 2
DEFAULT_RETRY_DELAY_SECONDS = 0.75
RETRYABLE_ERROR_MARKERS = (
    "timed out",
    "timeout",
    "temporarily unavailable",
    "connection reset",
    "connection aborted",
    "connection failed",
    "name or service not known",
)
TIMEOUT_ERROR_MARKERS = (
    "timeout",
    "timed out",
)


@dataclass(slots=True)
class CheckResult:
    target: str
    status: str
    detail: str
    meta: dict[str, Any]


def _is_retryable_failure(result: CheckResult) -> bool:
    if result.status == "ready":
        return False
    detail = str(result.detail or "").strip().lower()
    return any(marker in detail for marker in RETRYABLE_ERROR_MARKERS)


def _is_timeout_failure(result: CheckResult) -> bool:
    detail = str(result.detail or "").strip().lower()
    return any(marker in detail for marker in TIMEOUT_ERROR_MARKERS)


def _run_with_retries(
    operation: Callable[[], CheckResult],
    *,
    attempts: int = DEFAULT_RETRY_ATTEMPTS,
    delay_seconds: float = DEFAULT_RETRY_DELAY_SECONDS,
) -> CheckResult:
    final = operation()
    for _ in range(max(attempts - 1, 0)):
        if not _is_retryable_failure(final):
            return final
        time.sleep(delay_seconds)
        final = operation()
    return final


def _resolve_host(hostname: str, timeout_seconds: float = 5.0) -> CheckResult:
    result: dict[str, Any] = {}
    error: dict[str, Exception] = {}

    def _lookup() -> None:
        try:
            result["infos"] = socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
        except Exception as exc:  # noqa: BLE001
            error["exc"] = exc

    worker = threading.Thread(target=_lookup, daemon=True)
    worker.start()
    worker.join(timeout=timeout_seconds)
    if worker.is_alive():
        return CheckResult(
            target=f"dns:{hostname}",
            status="error",
            detail=f"dns_resolution_timeout_after_{timeout_seconds}s",
            meta={"hostname": hostname, "addresses": []},
        )
    exc = error.get("exc")
    if isinstance(exc, socket.gaierror):
        return CheckResult(
            target=f"dns:{hostname}",
            status="error",
            detail=f"dns_resolution_failed: {exc}",
            meta={"hostname": hostname, "addresses": []},
        )
    if exc is not None:
        return CheckResult(
            target=f"dns:{hostname}",
            status="error",
            detail=f"dns_resolution_error: {exc}",
            meta={"hostname": hostname, "addresses": []},
        )

    infos = result.get("infos", [])
    addresses = sorted({item[4][0] for item in infos})
    return CheckResult(
        target=f"dns:{hostname}",
        status="ready" if addresses else "error",
        detail="resolved" if addresses else "no_addresses",
        meta={"hostname": hostname, "addresses": addresses},
    )


def _tls_check(hostname: str, timeout_seconds: float = 4.0) -> CheckResult:
    result: dict[str, Any] = {}
    error: dict[str, Exception] = {}

    def _handshake() -> None:
        context = ssl.create_default_context()
        try:
            with socket.create_connection((hostname, 443), timeout=timeout_seconds) as sock:
                with context.wrap_socket(sock, server_hostname=hostname) as wrapped:
                    result["cert"] = wrapped.getpeercert()
        except Exception as exc:  # noqa: BLE001
            error["exc"] = exc

    worker = threading.Thread(target=_handshake, daemon=True)
    worker.start()
    worker.join(timeout=timeout_seconds)
    if worker.is_alive():
        return CheckResult(
            target=f"tls:{hostname}",
            status="error",
            detail=f"tls_handshake_timeout_after_{timeout_seconds}s",
            meta={"hostname": hostname},
        )

    exc = error.get("exc")
    if exc is not None:
        return CheckResult(
            target=f"tls:{hostname}",
            status="error",
            detail=f"tls_handshake_failed: {exc}",
            meta={"hostname": hostname},
        )

    cert = result.get("cert", {})

    expiry_raw = cert.get("notAfter")
    if not expiry_raw:
        return CheckResult(
            target=f"tls:{hostname}",
            status="error",
            detail="certificate_missing_notAfter",
            meta={"hostname": hostname},
        )

    expiry_dt = datetime.strptime(expiry_raw, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=UTC)
    now = datetime.now(UTC)
    remaining_days = int((expiry_dt - now).total_seconds() // 86400)
    status = "ready" if remaining_days > 0 else "error"
    detail = "certificate_valid" if remaining_days > 0 else "certificate_expired"
    return CheckResult(
        target=f"tls:{hostname}",
        status=status,
        detail=detail,
        meta={
            "hostname": hostname,
            "expiry_utc": expiry_dt.isoformat(),
            "days_remaining": remaining_days,
            "subject": cert.get("subject", []),
        },
    )


def _http_check(url: str, timeout_seconds: float = 4.0) -> CheckResult:
    result: dict[str, Any] = {}
    error: dict[str, Exception] = {}

    def _request() -> None:
        request = urllib.request.Request(url=url, method="GET", headers={"User-Agent": "supermega-domain-check/1.0"})
        try:
            with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
                result["status_code"] = response.getcode()
                result["final_url"] = response.geturl()
        except Exception as exc:  # noqa: BLE001
            error["exc"] = exc

    worker = threading.Thread(target=_request, daemon=True)
    worker.start()
    worker.join(timeout=timeout_seconds)
    if worker.is_alive():
        return CheckResult(
            target=f"http:{url}",
            status="error",
            detail=f"request_timeout_after_{timeout_seconds}s",
            meta={"url": url},
        )

    exc = error.get("exc")
    if isinstance(exc, urllib.error.HTTPError):
        return CheckResult(
            target=f"http:{url}",
            status="error",
            detail=f"http_error_{exc.code}",
            meta={"url": url, "status_code": exc.code},
        )
    if exc is not None:
        return CheckResult(
            target=f"http:{url}",
            status="error",
            detail=f"request_failed: {exc}",
            meta={"url": url},
        )

    status_code = int(result.get("status_code", 0) or 0)
    final_url = str(result.get("final_url", url))
    return CheckResult(
        target=f"http:{url}",
        status="ready",
        detail="request_ok",
        meta={
            "url": url,
            "status_code": status_code,
            "final_url": final_url,
        },
    )


def _build_urls(domain: str, routes: list[str]) -> list[str]:
    base = f"https://{domain}"
    normalized = []
    for route in routes:
        candidate = route if route.startswith("/") else f"/{route}"
        normalized.append(urllib.parse.urljoin(base, candidate))
    return normalized


def run_checks(domain: str, routes: list[str]) -> dict[str, Any]:
    started_at = datetime.now(UTC).isoformat()
    apex = domain
    www = f"www.{domain}"
    urls = _build_urls(apex, routes)

    checks: list[CheckResult] = []
    checks.append(_run_with_retries(lambda: _resolve_host(apex)))
    checks.append(_run_with_retries(lambda: _resolve_host(www)))
    checks.append(_run_with_retries(lambda: _tls_check(apex)))
    checks.append(_run_with_retries(lambda: _tls_check(www)))
    checks.extend(_run_with_retries(lambda candidate=url: _http_check(candidate)) for url in urls)
    checks.append(_run_with_retries(lambda: _http_check(f"https://{www}/")))

    failing_checks = [check for check in checks if check.status != "ready"]
    serialized = [asdict(item) for item in checks]

    required_targets = {f"dns:{apex}", f"tls:{apex}"}
    required_targets.update(f"http:https://{apex}{route if route.startswith('/') else '/' + route}" for route in routes)

    required_failures = [item for item in failing_checks if item.target in required_targets]
    optional_failures = [item for item in failing_checks if item.target not in required_targets]
    apex_dns_ready = any(item.target == f"dns:{apex}" and item.status == "ready" for item in checks)
    all_required_timeouts = bool(required_failures) and all(_is_timeout_failure(item) for item in required_failures)

    overall_status = "ready" if not required_failures else "error"
    if required_failures and apex_dns_ready and all_required_timeouts:
        optional_failures = optional_failures + required_failures
        required_failures = []
        overall_status = "warning"

    return {
        "checked_at": started_at,
        "domain": domain,
        "overall_status": overall_status,
        "check_count": len(checks),
        "failure_count": len(required_failures),
        "optional_failure_count": len(optional_failures),
        "failures": [asdict(item) for item in required_failures],
        "optional_failures": [asdict(item) for item in optional_failures],
        "all_failures": [asdict(item) for item in failing_checks],
        "checks": serialized,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Check DNS/TLS/HTTP health for supermega.dev.")
    parser.add_argument("--domain", default=DEFAULT_DOMAIN, help="Canonical apex domain.")
    parser.add_argument(
        "--route",
        action="append",
        default=[],
        help="Route path to check (repeatable). Defaults to key showroom routes.",
    )
    parser.add_argument(
        "--json-out",
        default="",
        help="Optional output path for JSON report.",
    )
    args = parser.parse_args()

    routes = args.route or DEFAULT_ROUTES
    payload = run_checks(args.domain, routes)
    output = json.dumps(payload, indent=2)
    print(output)

    if args.json_out:
        out_path = Path(args.json_out).expanduser()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(output, encoding="utf-8")

    return 0 if payload["overall_status"] in {"ready", "warning"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
