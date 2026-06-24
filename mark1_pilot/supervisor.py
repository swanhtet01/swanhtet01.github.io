from __future__ import annotations

import argparse
import json
import os
import signal
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from http.cookiejar import CookieJar
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import HTTPCookieProcessor, Request, build_opener


DEFAULT_JOB_TYPES = [
    "revenue_scout",
    "list_clerk",
    "template_clerk",
    "task_triage",
    "ops_watch",
    "founder_brief",
    "github_release_watch",
]


def _timestamp() -> str:
    return datetime.now().astimezone().isoformat()


def _request_json(
    opener,
    method: str,
    url: str,
    payload: dict[str, Any] | None = None,
    timeout: int = 20,
    extra_headers: dict[str, str] | None = None,
) -> dict[str, Any]:
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


def _status_file_path(repo_root: Path | None) -> Path:
    pilot_data_env = str(os.getenv("SUPERMEGA_PILOT_DATA", "")).strip()
    if pilot_data_env:
        base = Path(pilot_data_env)
    elif repo_root is not None:
        base = repo_root / "pilot-data"
    else:
        base = Path("pilot-data")
    base.mkdir(parents=True, exist_ok=True)
    return base / "supervisor_status.json"


def _read_status(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8") or "{}")
    except (OSError, json.JSONDecodeError):
        return {}


def _write_status(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
        temp_path = Path(handle.name)
    temp_path.replace(path)


@dataclass
class SupervisorConfig:
    base_url: str
    interval_minutes: int
    poll_seconds: int
    limit: int
    max_cycles: int
    enqueue_defaults: bool
    job_types: list[str]
    cron_token: str
    username: str
    password: str
    workspace_slug: str
    status_path: Path


class SupervisorRuntime:
    def __init__(self, config: SupervisorConfig) -> None:
        self.config = config
        self.stop_requested = False
        self.opener = build_opener(HTTPCookieProcessor(CookieJar()))
        self.mode = "internal_queue" if config.cron_token else "workspace_session"
        existing_status = _read_status(config.status_path)
        self.cycle_count = int(existing_status.get("cycle_count", 0) or 0)
        self.last_started_at = str(existing_status.get("last_started_at", "")).strip()
        self.last_finished_at = str(existing_status.get("last_finished_at", "")).strip()
        self.next_enqueue_at = time.monotonic()
        self.logged_in = False
        signal.signal(signal.SIGINT, self._handle_stop)
        signal.signal(signal.SIGTERM, self._handle_stop)

    def _handle_stop(self, signum: int, _frame: Any) -> None:
        self.stop_requested = True
        self._persist_status(
            status="stopping",
            last_error=f"received signal {signum}",
            last_processed_count=0,
            last_enqueued_count=0,
        )

    def _persist_status(
        self,
        *,
        status: str,
        last_error: str = "",
        last_processed_count: int = 0,
        last_enqueued_count: int = 0,
        health_status: str = "",
    ) -> None:
        payload = {
            "status": status,
            "cycle_count": self.cycle_count,
            "interval_minutes": self.config.interval_minutes,
            "poll_seconds": self.config.poll_seconds,
            "limit": self.config.limit,
            "last_started_at": self.last_started_at,
            "last_finished_at": self.last_finished_at,
            "last_error": last_error,
            "last_processed_count": last_processed_count,
            "last_enqueued_count": last_enqueued_count,
            "base_url": self.config.base_url,
            "mode": self.mode,
            "health_status": health_status,
            "job_types": self.config.job_types,
            "enqueue_defaults": self.config.enqueue_defaults,
        }
        _write_status(self.config.status_path, payload)

    def _health_ready(self) -> tuple[bool, str]:
        try:
            payload = _request_json(
                self.opener,
                "GET",
                f"{self.config.base_url}/api/health",
                timeout=10,
            )
        except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
            return False, str(exc)
        status = str(payload.get("status", "")).strip()
        return status == "ready", status or "unknown"

    def _login_if_needed(self) -> None:
        if self.config.cron_token or self.logged_in:
            return
        payload = _request_json(
            self.opener,
            "POST",
            f"{self.config.base_url}/api/auth/login",
            {
                "username": self.config.username,
                "password": self.config.password,
                "workspace_slug": self.config.workspace_slug,
            },
            timeout=20,
        )
        if str(payload.get("status", "")).strip() != "ready":
            raise RuntimeError("Supervisor could not log into the workspace runtime.")
        self.logged_in = True

    def _headers(self) -> dict[str, str]:
        if not self.config.cron_token:
            return {}
        return {"x-supermega-cron-token": self.config.cron_token}

    def _enqueue_defaults(self) -> int:
        if self.config.cron_token:
            payload = _request_json(
                self.opener,
                "POST",
                f"{self.config.base_url}/api/internal/agent-runs/enqueue-defaults",
                {
                    "source": "supervisor",
                    "job_types": self.config.job_types,
                },
                timeout=60,
                extra_headers=self._headers(),
            )
        else:
            payload = _request_json(
                self.opener,
                "POST",
                f"{self.config.base_url}/api/agent-runs/run-defaults",
                {
                    "source": "supervisor",
                    "job_types": self.config.job_types,
                    "enqueue_only": True,
                },
                timeout=60,
            )
        return int(payload.get("queued_count", payload.get("count", 0)) or 0)

    def _process_queue(self) -> int:
        if self.config.cron_token:
            payload = _request_json(
                self.opener,
                "POST",
                f"{self.config.base_url}/api/internal/agent-runs/process-queue",
                {
                    "source": "supervisor",
                    "job_types": self.config.job_types,
                    "limit": self.config.limit,
                },
                timeout=120,
                extra_headers=self._headers(),
            )
        else:
            payload = _request_json(
                self.opener,
                "POST",
                f"{self.config.base_url}/api/agent-runs/process-queue",
                {
                    "source": "supervisor",
                    "job_types": self.config.job_types,
                    "limit": self.config.limit,
                },
                timeout=120,
            )
        return int(payload.get("processed_count", payload.get("count", 0)) or 0)

    def run(self) -> int:
        while not self.stop_requested and (self.config.max_cycles <= 0 or self.cycle_count < self.config.max_cycles):
            self.cycle_count += 1
            self.last_started_at = _timestamp()
            self._persist_status(status="starting")

            ready, health_status = self._health_ready()
            if not ready:
                self.last_finished_at = _timestamp()
                self._persist_status(
                    status="waiting_for_health",
                    last_error="runtime not ready",
                    health_status=health_status,
                )
                self._sleep_until_next_poll()
                continue

            processed_count = 0
            enqueued_count = 0
            last_error = ""
            final_status = "ready"

            try:
                self._login_if_needed()
                if self.config.enqueue_defaults and time.monotonic() >= self.next_enqueue_at:
                    enqueued_count = self._enqueue_defaults()
                    self.next_enqueue_at = time.monotonic() + max(self.config.interval_minutes, 1) * 60
                processed_count = self._process_queue()
            except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError, RuntimeError) as exc:
                final_status = "error"
                last_error = str(exc)
                self.logged_in = False

            self.last_finished_at = _timestamp()
            self._persist_status(
                status=final_status,
                last_error=last_error,
                last_processed_count=processed_count,
                last_enqueued_count=enqueued_count,
                health_status=health_status,
            )
            self._sleep_until_next_poll()

        self.last_finished_at = _timestamp()
        self._persist_status(status="stopped")
        return 0

    def _sleep_until_next_poll(self) -> None:
        deadline = time.monotonic() + max(self.config.poll_seconds, 1)
        while not self.stop_requested and time.monotonic() < deadline:
            time.sleep(min(1.0, deadline - time.monotonic()))


def _parse_args(argv: list[str]) -> SupervisorConfig:
    parser = argparse.ArgumentParser(description="Run the SuperMega autonomous worker supervisor.")
    parser.add_argument("--config", default="")
    parser.add_argument("--repo-root", default="")
    parser.add_argument("--base-url", default=str(os.getenv("SUPERMEGA_RUNTIME_BASE_URL", "")).strip() or "http://127.0.0.1:8787")
    parser.add_argument("--interval-minutes", type=int, default=int(os.getenv("SUPERMEGA_SUPERVISOR_INTERVAL_MINUTES", "60") or 60))
    parser.add_argument("--poll-seconds", type=int, default=int(os.getenv("SUPERMEGA_SUPERVISOR_POLL_SECONDS", "30") or 30))
    parser.add_argument("--limit", type=int, default=int(os.getenv("SUPERMEGA_SUPERVISOR_LIMIT", "12") or 12))
    parser.add_argument("--max-cycles", type=int, default=int(os.getenv("SUPERMEGA_SUPERVISOR_MAX_CYCLES", "0") or 0))
    parser.add_argument("--enqueue-defaults", dest="enqueue_defaults", action="store_true")
    parser.add_argument("--no-enqueue-defaults", dest="enqueue_defaults", action="store_false")
    parser.set_defaults(enqueue_defaults=True)
    parser.add_argument("--job-type", action="append", dest="job_types")
    args = parser.parse_args(argv)

    repo_root_raw = str(args.repo_root or "").strip()
    repo_root = Path(repo_root_raw).resolve() if repo_root_raw else None
    job_types = [str(item).strip().lower() for item in (args.job_types or DEFAULT_JOB_TYPES) if str(item).strip()]

    return SupervisorConfig(
        base_url=str(args.base_url).rstrip("/"),
        interval_minutes=max(int(args.interval_minutes or 60), 1),
        poll_seconds=max(int(args.poll_seconds or 30), 1),
        limit=max(int(args.limit or 12), 1),
        max_cycles=int(args.max_cycles or 0),
        enqueue_defaults=bool(args.enqueue_defaults),
        job_types=job_types,
        cron_token=str(os.getenv("SUPERMEGA_INTERNAL_CRON_TOKEN", "")).strip(),
        username=str(os.getenv("SUPERMEGA_APP_USERNAME", "owner")).strip() or "owner",
        password=str(os.getenv("SUPERMEGA_APP_PASSWORD", "supermega-demo")).strip() or "supermega-demo",
        workspace_slug=str(os.getenv("SUPERMEGA_WORKSPACE_SLUG", "supermega-lab")).strip() or "supermega-lab",
        status_path=_status_file_path(repo_root),
    )


def main(argv: list[str] | None = None) -> int:
    config = _parse_args(argv or sys.argv[1:])
    runtime = SupervisorRuntime(config)
    return runtime.run()


if __name__ == "__main__":
    raise SystemExit(main())
