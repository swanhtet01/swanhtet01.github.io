from __future__ import annotations

import argparse
import ipaddress
import json
import os
import re
import sys
from http.cookiejar import CookieJar
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, HTTPCookieProcessor, Request, build_opener


DEFAULT_JOB_TYPES = [
    "revenue_scout",
    "list_clerk",
    "template_clerk",
    "task_triage",
    "ops_watch",
    "founder_brief",
    "github_release_watch",
]
DEFAULT_DEPLOYED_BASE_URL = "https://supermega-app-453184845544.asia-southeast1.run.app"
DEFAULT_BASE_URL = os.getenv("SUPERMEGA_RUNTIME_BASE_URL", DEFAULT_DEPLOYED_BASE_URL).strip() or DEFAULT_DEPLOYED_BASE_URL
DEFAULT_ALLOWED_REMOTE_HOSTS = frozenset(
    {
        "app.supermega.dev",
        "supermega-app-453184845544.asia-southeast1.run.app",
    }
)
MAX_RESPONSE_BYTES = 262_144


class RejectRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001, ANN201
        raise RuntimeError("runtime_redirect_rejected")


def _allowed_remote_hosts() -> frozenset[str]:
    configured = str(os.getenv("SUPERMEGA_AGENT_ALLOWED_HOSTS", "")).strip()
    hosts = set(DEFAULT_ALLOWED_REMOTE_HOSTS)
    for value in configured.split(","):
        host = value.strip().lower().rstrip(".")
        if not host:
            continue
        if not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?", host):
            raise RuntimeError("invalid_runtime_allowed_host")
        hosts.add(host)
    return frozenset(hosts)


def validate_base_url(base_url: str, *, allowed_hosts: frozenset[str] | None = None) -> str:
    raw_url = str(base_url or "").strip()
    try:
        parsed = urlsplit(raw_url)
        port = parsed.port
    except ValueError as exc:
        raise RuntimeError("invalid_runtime_base_url") from exc
    scheme = parsed.scheme.lower()
    host = str(parsed.hostname or "").strip().lower().rstrip(".")
    if scheme not in {"http", "https"} or not host:
        raise RuntimeError("invalid_runtime_base_url")
    if parsed.username is not None or parsed.password is not None:
        raise RuntimeError("runtime_base_url_userinfo_rejected")
    if parsed.query or parsed.fragment:
        raise RuntimeError("runtime_base_url_query_or_fragment_rejected")
    if parsed.path not in {"", "/"}:
        raise RuntimeError("runtime_base_url_path_rejected")
    if port == 0:
        raise RuntimeError("runtime_base_url_port_rejected")

    is_loopback = host == "localhost"
    try:
        parsed_ip = ipaddress.ip_address(host)
    except ValueError:
        parsed_ip = None
    else:
        is_loopback = parsed_ip.is_loopback

    if not is_loopback:
        if parsed_ip is not None:
            raise RuntimeError("runtime_base_url_ip_literal_rejected")
        if scheme != "https":
            raise RuntimeError("runtime_base_url_https_required")
        if port not in {None, 443}:
            raise RuntimeError("runtime_base_url_port_rejected")
        if host not in (allowed_hosts if allowed_hosts is not None else _allowed_remote_hosts()):
            raise RuntimeError("runtime_base_url_host_not_allowed")

    host_port = f"[{host}]" if ":" in host else host
    if port is not None and not (scheme == "https" and port == 443) and not (scheme == "http" and port == 80):
        host_port = f"{host_port}:{port}"
    return f"{scheme}://{host_port}"


def _read_json_response(response) -> dict:  # noqa: ANN001
    content_type = str(response.headers.get("Content-Type", "")).lower()
    if "application/json" not in content_type and "+json" not in content_type:
        raise RuntimeError("runtime_response_content_type_rejected")
    content_length = str(response.headers.get("Content-Length", "")).strip()
    if content_length:
        try:
            parsed_content_length = int(content_length)
            if parsed_content_length < 0 or parsed_content_length > MAX_RESPONSE_BYTES:
                raise RuntimeError("runtime_response_too_large")
        except ValueError as exc:
            raise RuntimeError("runtime_response_content_length_invalid") from exc
    body = response.read(MAX_RESPONSE_BYTES + 1)
    if len(body) > MAX_RESPONSE_BYTES:
        raise RuntimeError("runtime_response_too_large")
    try:
        payload = json.loads(body.decode("utf-8") or "{}")
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError("runtime_response_json_invalid") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("runtime_response_shape_invalid")
    return payload


def request_json(
    opener,
    method: str,
    url: str,
    payload: dict | None = None,
    timeout: int = 20,
    extra_headers: dict[str, str] | None = None,
) -> dict:
    body = None
    headers = {"Accept": "application/json"}
    if extra_headers:
        headers.update(extra_headers)
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = Request(url, data=body, headers=headers, method=method.upper())
    with opener.open(request, timeout=timeout) as response:
        return _read_json_response(response)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the current durable SuperMega agent jobs.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--workspace", default=os.getenv("SUPERMEGA_AGENT_WORKSPACE", "supermega-lab"))
    parser.add_argument("--job-type", action="append", dest="job_types")
    parser.add_argument("--as-json", action="store_true")
    args = parser.parse_args()

    job_types = [str(item).strip().lower() for item in (args.job_types or DEFAULT_JOB_TYPES) if str(item).strip()]
    opener = build_opener(RejectRedirectHandler(), HTTPCookieProcessor(CookieJar()))
    base_url = validate_base_url(args.base_url)
    cron_token = str(os.getenv("SUPERMEGA_INTERNAL_CRON_TOKEN", "")).strip()

    if cron_token:
        enqueue_payload = request_json(
            opener,
            "POST",
            f"{base_url}/api/internal/agent-runs/enqueue-defaults",
            {
                "source": "ops_script",
                "job_types": job_types,
            },
            timeout=60,
            extra_headers={"x-supermega-cron-token": cron_token},
        )
        payload = request_json(
            opener,
            "POST",
            f"{base_url}/api/internal/agent-runs/process-queue",
            {
                "source": "ops_worker",
                "job_types": job_types,
                "limit": max(len(job_types), 1),
            },
            timeout=120,
            extra_headers={"x-supermega-cron-token": cron_token},
        )
        rows = payload.get("rows", []) if isinstance(payload, dict) else []
        results = [
            {
                "job_type": str(row.get("job_type", "")),
                "status": str(row.get("status", "")),
                "summary": str(row.get("summary", "")),
                "run_id": str(row.get("run_id", "")),
            }
            for row in rows
        ]
        report = {
            "base_url": base_url,
            "workspace": args.workspace,
            "count": len(results),
            "queued_count": int(enqueue_payload.get("queued_count", 0) or 0),
            "results": results,
            "source": "internal_queue_worker",
        }
        if args.as_json:
            print(json.dumps(report, indent=2))
        else:
            print()
            print("SuperMega durable agent jobs")
            print(f"- Base URL: {base_url}")
            print("- Source: internal_queue_worker")
            print(f"- Queued: {report['queued_count']}")
            for row in results:
                print(f"- {row['job_type']}: {row['status']} :: {row['summary']}")
            print()
        return 0 if all(str(row.get("status", "")) == "ready" for row in results) else 1

    username = str(os.getenv("SUPERMEGA_AGENT_USERNAME", "")).strip()
    password = str(os.getenv("SUPERMEGA_AGENT_PASSWORD", "")).strip()
    if not username or not password:
        raise RuntimeError(
            "Set SUPERMEGA_INTERNAL_CRON_TOKEN or both SUPERMEGA_AGENT_USERNAME and SUPERMEGA_AGENT_PASSWORD."
        )

    login = request_json(
        opener,
        "POST",
        f"{base_url}/api/auth/login",
        {
            "username": username,
            "password": password,
            "workspace_slug": args.workspace,
        },
    )
    if login.get("status") != "ready":
        raise RuntimeError("Login failed before agent jobs could run.")

    results: list[dict] = []
    for job_type in job_types:
        try:
            payload = request_json(
                opener,
                "POST",
                f"{base_url}/api/agent-runs",
                {
                    "job_type": job_type,
                    "source": "ops_script",
                },
                timeout=60,
            )
            row = payload.get("row", {}) if isinstance(payload, dict) else {}
            results.append(
                {
                    "job_type": job_type,
                    "status": str(row.get("status", payload.get("status", "error"))),
                    "summary": str(row.get("summary", "")),
                    "run_id": str(row.get("run_id", "")),
                }
            )
        except (RuntimeError, HTTPError, URLError, TimeoutError, OSError) as exc:
            results.append(
                {
                    "job_type": job_type,
                    "status": "error",
                    "summary": str(exc),
                    "run_id": "",
                }
            )

    report = {
        "base_url": base_url,
        "workspace": args.workspace,
        "count": len(results),
        "results": results,
        "source": "workspace_login",
    }
    if args.as_json:
        print(json.dumps(report, indent=2))
    else:
        print()
        print("SuperMega durable agent jobs")
        print(f"- Base URL: {base_url}")
        print(f"- Workspace: {args.workspace}")
        for row in results:
            print(f"- {row['job_type']}: {row['status']} :: {row['summary']}")
        print()

    return 0 if all(str(row.get("status", "")) == "ready" for row in results) else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, HTTPError, URLError, TimeoutError, OSError) as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
