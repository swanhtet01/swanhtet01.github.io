from __future__ import annotations

import argparse
import json
import os
import sys
from http.cookiejar import CookieJar
from urllib.error import HTTPError, URLError
from urllib.request import HTTPCookieProcessor, Request, build_opener


DEFAULT_JOB_TYPES = [
    "revenue_scout",
    "list_clerk",
    "template_clerk",
    "task_triage",
    "ops_watch",
    "founder_brief",
]


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
        return json.loads(response.read().decode("utf-8") or "{}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the current durable SuperMega agent jobs.")
    parser.add_argument("--base-url", default="https://app.supermega.dev")
    parser.add_argument("--username", default="owner")
    parser.add_argument("--password", default="supermega-demo")
    parser.add_argument("--workspace", default="supermega-lab")
    parser.add_argument("--job-type", action="append", dest="job_types")
    parser.add_argument("--cron-token", default="")
    parser.add_argument("--as-json", action="store_true")
    args = parser.parse_args()

    job_types = [str(item).strip().lower() for item in (args.job_types or DEFAULT_JOB_TYPES) if str(item).strip()]
    opener = build_opener(HTTPCookieProcessor(CookieJar()))
    base_url = args.base_url.rstrip("/")
    cron_token = str(args.cron_token or os.getenv("SUPERMEGA_INTERNAL_CRON_TOKEN", "")).strip()

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

    login = request_json(
        opener,
        "POST",
        f"{base_url}/api/auth/login",
        {
            "username": args.username,
            "password": args.password,
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
        except (HTTPError, URLError, TimeoutError, OSError) as exc:
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
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
