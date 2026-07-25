from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
import math
import os
import re
import urllib.error
import urllib.request
from collections.abc import Mapping
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlsplit

from fastapi import APIRouter, Header, HTTPException, Request

from mark1_pilot.agent_governance import (
    AGENT_BUDGET_ACCOUNTING_CONTRACT,
    AGENT_BUDGET_GRANT_CONTRACT,
    AgentGovernanceError,
    issue_agent_budget_grant,
)


router = APIRouter()

QUEUE_CRON_PATH = "/api/cron/supermega/agent-queue"
DAILY_CRON_PATH = "/api/cron/supermega/daily"
WORKER_ALLOWLIST_ENV = "SUPERMEGA_CLOUD_TASKS_ALLOWED_HOSTS"
WORKER_URL_ENV = "SUPERMEGA_CLOUD_TASKS_WORKER_URL"

_WORKER_TIMEOUT_SECONDS = 12
_MAX_WORKER_URL_CHARS = 2_048
_MAX_ALLOWLIST_CHARS = 2_048
_MAX_ALLOWED_HOSTS = 16
_MAX_WORKER_RESPONSE_BYTES = 32_768
_MAX_RESPONSE_DEPTH = 5
_MAX_RESPONSE_ITEMS = 32
_MAX_RESPONSE_STRING_CHARS = 1_024
_MAX_RESPONSE_KEY_CHARS = 80

_HOST_LABEL = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
_SENSITIVE_KEY_PARTS = frozenset(
    {
        "api_key",
        "apikey",
        "authorization",
        "cookie",
        "credential",
        "password",
        "secret",
        "session",
        "token",
    }
)

# These job names describe bounded, review-gated SuperMega operating cycles. The
# scheduler does not execute jobs itself; it only forwards this fixed allowlist.
_SCHEDULER_ROUTES: dict[str, dict[str, object]] = {
    QUEUE_CRON_PATH: {
        "cycle": "queue",
        "job_types": ("task_triage", "ops_watch"),
        "limit": 8,
    },
    DAILY_CRON_PATH: {
        "cycle": "daily",
        "job_types": ("founder_brief", "github_release_watch"),
        "limit": 4,
    },
}


class WorkerContractError(ValueError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(
        self,
        request: urllib.request.Request,
        file_pointer: object,
        code: int,
        message: str,
        headers: object,
        new_url: str,
    ) -> None:
        del request, file_pointer, code, message, headers, new_url
        return None


def _text(value: object) -> str:
    return str(value or "").strip()


def _configured_tokens() -> tuple[str, ...]:
    values = (
        _text(os.getenv("SUPERMEGA_INTERNAL_CRON_TOKEN")),
        _text(os.getenv("CRON_SECRET")),
    )
    return tuple(dict.fromkeys(value for value in values if value))


def _worker_token() -> str:
    return _text(os.getenv("SUPERMEGA_INTERNAL_CRON_TOKEN")) or _text(os.getenv("CRON_SECRET"))


def _authorized(authorization: str | None, x_cron_secret: str | None) -> bool:
    expected_tokens = _configured_tokens()
    if not expected_tokens:
        return False

    supplied: list[str] = []
    bearer = _text(authorization)
    if bearer:
        if not bearer.lower().startswith("bearer "):
            return False
        bearer = bearer[7:].strip()
        if not bearer:
            return False
        supplied.append(bearer)

    header_secret = _text(x_cron_secret)
    if header_secret:
        supplied.append(header_secret)

    if not supplied:
        return False
    if len(supplied) > 1 and not hmac.compare_digest(supplied[0], supplied[1]):
        return False

    supplied_digest = hashlib.sha256(supplied[0].encode()).digest()
    return any(
        hmac.compare_digest(supplied_digest, hashlib.sha256(expected.encode()).digest())
        for expected in expected_tokens
    )


def _normalize_dns_host(value: str) -> str | None:
    candidate = value.strip().lower().rstrip(".")
    if not candidate or len(candidate) > 253:
        return None
    try:
        candidate = candidate.encode("idna").decode("ascii")
        ipaddress.ip_address(candidate)
    except UnicodeError:
        return None
    except ValueError:
        pass
    else:
        return None

    labels = candidate.split(".")
    if len(labels) < 2 or any(not _HOST_LABEL.fullmatch(label) for label in labels):
        return None
    return candidate


def _allowed_worker_hosts() -> tuple[frozenset[str], str | None]:
    raw = _text(os.getenv(WORKER_ALLOWLIST_ENV))
    if not raw:
        return frozenset(), "worker_allowlist_missing"
    if len(raw) > _MAX_ALLOWLIST_CHARS:
        return frozenset(), "worker_allowlist_too_large"

    entries = [entry.strip() for entry in raw.split(",") if entry.strip()]
    if not entries or len(entries) > _MAX_ALLOWED_HOSTS:
        return frozenset(), "worker_allowlist_invalid"

    normalized: set[str] = set()
    for entry in entries:
        if any(marker in entry for marker in ("://", "/", "\\", "@", ":", "?", "#", "*")):
            return frozenset(), "worker_allowlist_invalid"
        host = _normalize_dns_host(entry)
        if host is None:
            return frozenset(), "worker_allowlist_invalid"
        normalized.add(host)
    return frozenset(normalized), None


def _validated_worker_url() -> tuple[str | None, str | None, int]:
    worker_url = _text(os.getenv(WORKER_URL_ENV))
    allowed_hosts, allowlist_error = _allowed_worker_hosts()
    if allowlist_error:
        return None, allowlist_error, len(allowed_hosts)
    if not worker_url:
        return None, "worker_url_missing", len(allowed_hosts)
    if len(worker_url) > _MAX_WORKER_URL_CHARS or any(ord(character) < 33 for character in worker_url):
        return None, "worker_url_invalid", len(allowed_hosts)

    try:
        parsed = urlsplit(worker_url)
        port = parsed.port
    except ValueError:
        return None, "worker_url_invalid", len(allowed_hosts)

    if parsed.scheme.lower() != "https":
        return None, "worker_url_https_required", len(allowed_hosts)
    if not parsed.netloc or parsed.username is not None or parsed.password is not None:
        return None, "worker_url_credentials_forbidden", len(allowed_hosts)
    if parsed.query or parsed.fragment:
        return None, "worker_url_query_or_fragment_forbidden", len(allowed_hosts)
    if port not in (None, 443):
        return None, "worker_url_port_forbidden", len(allowed_hosts)
    if "\\" in parsed.path:
        return None, "worker_url_invalid", len(allowed_hosts)

    host = _normalize_dns_host(parsed.hostname or "")
    if host is None:
        return None, "worker_url_host_invalid", len(allowed_hosts)
    if host not in allowed_hosts:
        return None, "worker_host_not_allowed", len(allowed_hosts)
    return worker_url, None, len(allowed_hosts)


def _runtime_status() -> dict[str, object]:
    token_configured = bool(_configured_tokens())
    cron_secret_configured = bool(_text(os.getenv("CRON_SECRET")))
    worker_url_configured = bool(_text(os.getenv(WORKER_URL_ENV)))
    worker_url, worker_configuration_error, allowed_host_count = _validated_worker_url()

    configuration_errors: list[str] = []
    if not token_configured:
        configuration_errors.append("cron_token_missing")
    if not cron_secret_configured:
        configuration_errors.append("cron_secret_missing")
    if worker_configuration_error:
        configuration_errors.append(worker_configuration_error)

    scheduler_ready = not configuration_errors and bool(worker_url) and bool(_worker_token())
    return {
        "status": "ready" if scheduler_ready else "degraded",
        "runtime_target": "hosted_vercel_api",
        "pc_dependency": False,
        "scheduler": {
            "configured": scheduler_ready,
            "token_configured": token_configured,
            "cron_secret_configured": cron_secret_configured,
            "worker_url_configured": worker_url_configured,
            "worker_url_valid": bool(worker_url),
            "worker_allowlist_configured": allowed_host_count > 0,
            "allowed_host_count": allowed_host_count,
            "configuration_errors": configuration_errors,
            "queue_path": QUEUE_CRON_PATH,
            "daily_path": DAILY_CRON_PATH,
            "queue_job_types": list(_SCHEDULER_ROUTES[QUEUE_CRON_PATH]["job_types"]),
            "daily_job_types": list(_SCHEDULER_ROUTES[DAILY_CRON_PATH]["job_types"]),
            "max_jobs_per_run": 8,
            "max_worker_response_bytes": _MAX_WORKER_RESPONSE_BYTES,
            "redirects_allowed": False,
            "budget_grant_contract": AGENT_BUDGET_GRANT_CONTRACT,
            "budget_grants_required": True,
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
            "scheduler_path": DAILY_CRON_PATH,
            "queue_path": QUEUE_CRON_PATH,
            "no_local_pc_scheduler": True,
        },
        "next_action": (
            "Configure the hosted worker HTTPS URL, explicit host allowlist, and cron token before execution."
            if runtime["status"] != "ready"
            else "Run the bounded daily review and queue drain on the hosted scheduler."
        ),
    }


def _require_cron_auth(authorization: str | None, x_cron_secret: str | None) -> None:
    if not _authorized(authorization, x_cron_secret):
        raise HTTPException(status_code=401, detail="cron_auth_required")


def _is_sensitive_key(key: str) -> bool:
    normalized = re.sub(r"[^a-z0-9]+", "_", key.lower()).strip("_")
    segments = set(normalized.split("_"))
    return normalized in _SENSITIVE_KEY_PARTS or bool(segments & _SENSITIVE_KEY_PARTS)


def _safe_string(value: str, *, limit: int = _MAX_RESPONSE_STRING_CHARS) -> str:
    printable = "".join(character if character.isprintable() else " " for character in value)
    compact = " ".join(printable.split())
    if len(compact) <= limit:
        return compact
    return f"{compact[: limit - 1]}…"


def _sanitize_worker_value(value: object, *, depth: int = 0) -> object:
    if value is None or isinstance(value, bool) or isinstance(value, int):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, str):
        return _safe_string(value)
    if depth >= _MAX_RESPONSE_DEPTH:
        return "[depth-limited]"
    if isinstance(value, Mapping):
        sanitized: dict[str, object] = {}
        truncated = False
        for index, (raw_key, item) in enumerate(value.items()):
            if index >= _MAX_RESPONSE_ITEMS:
                truncated = True
                break
            key = _safe_string(str(raw_key), limit=_MAX_RESPONSE_KEY_CHARS) or "field"
            if _is_sensitive_key(key):
                sanitized[key] = "[redacted]"
            else:
                sanitized[key] = _sanitize_worker_value(item, depth=depth + 1)
        if truncated:
            sanitized["_truncated"] = True
        return sanitized
    if isinstance(value, (list, tuple)):
        sanitized_items = [
            _sanitize_worker_value(item, depth=depth + 1)
            for item in value[:_MAX_RESPONSE_ITEMS]
        ]
        if len(value) > _MAX_RESPONSE_ITEMS:
            sanitized_items.append({"_truncated": True})
        return sanitized_items
    return _safe_string(type(value).__name__, limit=64)


def _reported_side_effects(payload: Mapping[str, object]) -> tuple[bool | None, bool | None]:
    nested = payload.get("side_effects")
    sources = [nested, payload] if isinstance(nested, Mapping) else [payload]

    def reported_boolean(key: str) -> bool | None:
        for source in sources:
            value = source.get(key) if isinstance(source, Mapping) else None
            if type(value) is bool:
                return value
        return None

    return reported_boolean("writes_performed"), reported_boolean("external_messages_sent")


def _reported_budget_accounting(
    payload: Mapping[str, object],
    grant: Mapping[str, object],
) -> tuple[dict[str, object] | None, str | None]:
    accounting = payload.get("budget_accounting")
    if not isinstance(accounting, Mapping):
        return None, "worker_budget_accounting_required"
    if str(accounting.get("contract", "")) != AGENT_BUDGET_ACCOUNTING_CONTRACT:
        return None, "worker_budget_accounting_contract_invalid"
    if not hmac.compare_digest(str(accounting.get("grant_id", "")), str(grant.get("grant_id", ""))):
        return None, "worker_budget_grant_mismatch"
    integer_fields = ("reserved_runs", "reserved_work_units", "consumed_runs", "consumed_work_units")
    if any(type(accounting.get(field)) is not int for field in integer_fields):
        return None, "worker_budget_accounting_invalid"
    reserved_runs = int(accounting["reserved_runs"])
    reserved_units = int(accounting["reserved_work_units"])
    consumed_runs = int(accounting["consumed_runs"])
    consumed_units = int(accounting["consumed_work_units"])
    if (
        min(reserved_runs, reserved_units, consumed_runs, consumed_units) < 0
        or reserved_runs > int(grant["max_runs"])
        or reserved_units > int(grant["max_work_units"])
        or consumed_runs != reserved_runs
        or consumed_units != reserved_units
        or str(accounting.get("status", "")) != "consumed"
    ):
        return None, "worker_budget_accounting_invalid"
    return {
        "contract": AGENT_BUDGET_ACCOUNTING_CONTRACT,
        "grant_id": str(grant["grant_id"]),
        "reserved_runs": reserved_runs,
        "reserved_work_units": reserved_units,
        "consumed_runs": consumed_runs,
        "consumed_work_units": consumed_units,
        "status": "consumed",
    }, None


def _read_worker_payload(response: Any) -> Mapping[str, object]:
    body = response.read(_MAX_WORKER_RESPONSE_BYTES + 1)
    if len(body) > _MAX_WORKER_RESPONSE_BYTES:
        raise WorkerContractError("worker_response_too_large")
    if not body:
        raise WorkerContractError("worker_response_empty")
    try:
        parsed = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise WorkerContractError("worker_response_invalid_json") from exc
    if not isinstance(parsed, Mapping):
        raise WorkerContractError("worker_response_object_required")
    return parsed


def _open_worker_request(request: urllib.request.Request) -> Any:
    # Disable redirects and ambient proxy routing so a validated hostname cannot
    # bounce the scheduler into an unapproved network destination.
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({}),
        _NoRedirectHandler(),
    )
    return opener.open(request, timeout=_WORKER_TIMEOUT_SECONDS)


def _base_cron_result(path: str, route: Mapping[str, object] | None) -> dict[str, object]:
    return {
        "status": "degraded",
        "path": path,
        "cycle": route.get("cycle") if route else None,
        "job_types": list(route.get("job_types", ())) if route else [],
        "execution": "hosted_runtime_not_configured",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "writes_performed": False,
        "external_messages_sent": False,
        "side_effects": {
            "worker_invoked": False,
            "reporting": "not_invoked",
        },
    }


def _cron_result(path: str) -> dict[str, object]:
    route = _SCHEDULER_ROUTES.get(path)
    result = _base_cron_result(path, route)
    if route is None:
        result["configuration_errors"] = ["scheduler_route_not_allowed"]
        return result

    runtime = _runtime_status()
    scheduler = runtime["scheduler"]
    if runtime["status"] != "ready" or not isinstance(scheduler, Mapping):
        result["configuration_errors"] = (
            list(scheduler.get("configuration_errors", [])) if isinstance(scheduler, Mapping) else []
        )
        return result

    worker_url, worker_configuration_error, _ = _validated_worker_url()
    token = _worker_token()
    if not worker_url or worker_configuration_error or not token:
        result["configuration_errors"] = [worker_configuration_error or "worker_token_missing"]
        return result

    try:
        budget_grant = issue_agent_budget_grant(
            secret=token,
            cycle=str(route["cycle"]),
            job_types=list(route["job_types"]),
            max_runs=min(int(route["limit"]), len(tuple(route["job_types"]))),
        )
    except AgentGovernanceError as exc:
        result["configuration_errors"] = [exc.code]
        return result

    payload = json.dumps(
        {
            "contract_version": "supermega.hosted-agent-scheduler.v1",
            "cycle": route["cycle"],
            "job_types": list(route["job_types"]),
            "source": "vercel_cron",
            "limit": int(route["limit"]),
            "execution_policy": "review_gated_no_external_send_or_money_actions",
            "budget_grant": budget_grant,
        },
        separators=(",", ":"),
    ).encode("utf-8")
    worker_request = urllib.request.Request(
        worker_url,
        data=payload,
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-Supermega-Cron-Token": token,
            "User-Agent": "supermega-hosted-scheduler/1",
        },
        method="POST",
    )

    result["writes_performed"] = None
    result["external_messages_sent"] = None
    result["side_effects"] = {
        "worker_invoked": True,
        "reporting": "unknown",
    }
    try:
        with _open_worker_request(worker_request) as response:
            worker_status_value = getattr(response, "status", None)
            if worker_status_value is None:
                worker_status_value = response.getcode()
            if type(worker_status_value) is not int:
                raise WorkerContractError("worker_status_invalid")
            worker_status = worker_status_value
            if worker_status < 200 or worker_status >= 300:
                raise WorkerContractError("worker_non_success_status")
            worker_payload = _read_worker_payload(response)

        writes_performed, external_messages_sent = _reported_side_effects(worker_payload)
        budget_accounting, budget_error = _reported_budget_accounting(worker_payload, budget_grant)
        result["worker_status"] = worker_status
        result["worker_result"] = _sanitize_worker_value(worker_payload)
        result["writes_performed"] = writes_performed
        result["external_messages_sent"] = external_messages_sent
        if writes_performed is None or external_messages_sent is None:
            result["execution"] = "worker_response_invalid"
            result["worker_error"] = "worker_side_effect_report_required"
            result["side_effects"] = {
                "worker_invoked": True,
                "reporting": "incomplete",
            }
            return result
        if budget_error or budget_accounting is None:
            result["execution"] = "worker_response_invalid"
            result["worker_error"] = budget_error or "worker_budget_accounting_required"
            result["side_effects"] = {
                "worker_invoked": True,
                "reporting": "incomplete",
            }
            return result

        result["status"] = "accepted"
        result["execution"] = "hosted_runtime_forwarded"
        result["budget_accounting"] = budget_accounting
        result["side_effects"] = {
            "worker_invoked": True,
            # Side effects remain worker assertions even when the separate
            # signed budget ledger is cryptographically bound.
            "reporting": "worker_reported_unverified",
            "budget_reporting": "worker_reported_budget_bound",
            "writes_performed": writes_performed,
            "external_messages_sent": external_messages_sent,
        }
    except urllib.error.HTTPError as exc:
        result["execution"] = "worker_error"
        result["worker_status"] = int(exc.code)
        result["worker_error"] = "worker_redirect_rejected" if 300 <= int(exc.code) < 400 else "worker_http_error"
        result["retryable"] = int(exc.code) == 429 or int(exc.code) >= 500
    except (urllib.error.URLError, TimeoutError, OSError):
        result["execution"] = "worker_error"
        result["worker_error"] = "worker_unavailable"
        result["retryable"] = True
    except WorkerContractError as exc:
        result["execution"] = "worker_response_invalid"
        result["worker_error"] = exc.code
        result["retryable"] = False
    return result


@router.get(QUEUE_CRON_PATH)
def agent_queue_cron(
    request: Request,
    authorization: str | None = Header(default=None),
    x_cron_secret: str | None = Header(default=None),
) -> dict[str, object]:
    _require_cron_auth(authorization, x_cron_secret)
    return _cron_result(str(request.url.path))


@router.get(DAILY_CRON_PATH)
def daily_cron(
    request: Request,
    authorization: str | None = Header(default=None),
    x_cron_secret: str | None = Header(default=None),
) -> dict[str, object]:
    _require_cron_auth(authorization, x_cron_secret)
    return _cron_result(str(request.url.path))
