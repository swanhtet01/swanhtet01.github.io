from __future__ import annotations

import hashlib
import hmac
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException, Request


router = APIRouter()


def _text(value: object) -> str:
    return str(value or "").strip()


def _cron_token() -> str:
    return _text(os.getenv("SUPERMEGA_INTERNAL_CRON_TOKEN")) or _text(os.getenv("CRON_SECRET"))


def _authorized(authorization: str | None, x_cron_secret: str | None) -> bool:
    expected = _cron_token()
    if not expected:
        return False
    bearer = _text(authorization)
    if bearer.lower().startswith("bearer "):
        bearer = bearer[7:].strip()
    supplied = bearer or _text(x_cron_secret)
    return bool(supplied) and hmac.compare_digest(
        hashlib.sha256(supplied.encode()).digest(),
        hashlib.sha256(expected.encode()).digest(),
    )


def _runtime_status() -> dict[str, object]:
    token_configured = bool(_cron_token())
    queue_url = _text(os.getenv("SUPERMEGA_CLOUD_TASKS_WORKER_URL"))
    scheduler_ready = token_configured and bool(queue_url)
    return {
        "status": "ready" if scheduler_ready else "degraded",
        "runtime_target": "hosted_vercel_api",
        "pc_dependency": False,
        "scheduler": {
            "configured": scheduler_ready,
            "token_configured": token_configured,
            "worker_url_configured": bool(queue_url),
            "queue_path": "/api/cron/supermega/agent-queue",
            "daily_path": "/api/cron/supermega/daily",
        },
        "execution_policy": "review_gated_no_external_send_or_money_actions",
    }


@router.get("/api/cloud-autonomy/status")
def cloud_autonomy_status() -> dict[str, object]:
    return _runtime_status()


@router.get("/api/process-organizer/status")
def process_organizer_status() -> dict[str, object]:
    runtime = _runtime_status()
    return {
        "status": runtime["status"],
        "runtime_target": runtime["runtime_target"],
        "cloud_contract": {
            "scheduler_path": "/api/cron/supermega/daily",
            "queue_path": "/api/cron/supermega/agent-queue",
            "no_local_pc_scheduler": True,
        },
        "next_action": "Configure hosted worker URL and cron token before enabling autonomous execution."
        if runtime["status"] != "ready"
        else "Run the bounded daily review and queue drain on the hosted scheduler.",
    }


def _require_cron_auth(authorization: str | None, x_cron_secret: str | None) -> None:
    if not _authorized(authorization, x_cron_secret):
        raise HTTPException(status_code=401, detail="cron_auth_required")


def _cron_result(path: str) -> dict[str, object]:
    runtime = _runtime_status()
    return {
        "status": "accepted" if runtime["status"] == "ready" else "degraded",
        "path": path,
        "execution": "hosted_runtime_ready" if runtime["status"] == "ready" else "hosted_runtime_not_configured",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "writes_performed": False,
        "external_messages_sent": False,
    }


@router.get("/api/cron/supermega/agent-queue")
def agent_queue_cron(
    request: Request,
    authorization: str | None = Header(default=None),
    x_cron_secret: str | None = Header(default=None),
) -> dict[str, object]:
    _require_cron_auth(authorization, x_cron_secret)
    return _cron_result(str(request.url.path))


@router.get("/api/cron/supermega/daily")
def daily_cron(
    request: Request,
    authorization: str | None = Header(default=None),
    x_cron_secret: str | None = Header(default=None),
) -> dict[str, object]:
    _require_cron_auth(authorization, x_cron_secret)
    return _cron_result(str(request.url.path))


@router.get("/api/cron/ytf/full-refresh")
def ytf_full_refresh_cron(
    request: Request,
    authorization: str | None = Header(default=None),
    x_cron_secret: str | None = Header(default=None),
) -> dict[str, object]:
    _require_cron_auth(authorization, x_cron_secret)
    return _cron_result(str(request.url.path))
