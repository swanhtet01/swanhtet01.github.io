from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping, Sequence


AGENT_WORKFORCE_POLICY_CONTRACT = "supermega.agent-workforce-policy.v1"
AGENT_BUDGET_GRANT_CONTRACT = "supermega.agent-budget-grant.v1"
AGENT_BUDGET_ACCOUNTING_CONTRACT = "supermega.agent-budget-accounting.v1"
AGENT_BUDGET_AUDIENCE = "supermega-agent-runtime"

AGENT_JOB_UNITS: dict[str, int] = {
    "revenue_scout": 3,
    "list_clerk": 1,
    "task_triage": 1,
    "template_clerk": 2,
    "ops_watch": 1,
    "founder_brief": 3,
    "github_release_watch": 2,
}

AGENT_JOB_DAILY_LIMITS: dict[str, int] = {
    "revenue_scout": 6,
    "list_clerk": 2,
    "task_triage": 12,
    "template_clerk": 6,
    "ops_watch": 24,
    "founder_brief": 1,
    "github_release_watch": 6,
}

_GRANT_ID = re.compile(r"^[a-f0-9]{32}$")
_GRANT_SIGNATURE = re.compile(r"^[a-f0-9]{64}$")


class AgentGovernanceError(RuntimeError):
    def __init__(self, code: str, detail: str = "", **metadata: object) -> None:
        super().__init__(detail or code)
        self.code = code
        self.detail = detail or code
        self.metadata = {str(key): value for key, value in metadata.items()}

    def as_dict(self) -> dict[str, object]:
        return {
            "contract": AGENT_WORKFORCE_POLICY_CONTRACT,
            "code": self.code,
            "detail": self.detail,
            **self.metadata,
        }


@dataclass(frozen=True)
class AgentWorkforcePolicy:
    max_running: int = 4
    max_queued: int = 24
    max_daily_runs: int = 64
    max_daily_units: int = 96
    max_batch_jobs: int = 5
    lease_seconds: int = 300

    @property
    def allowed_job_types(self) -> tuple[str, ...]:
        return tuple(AGENT_JOB_UNITS)

    def as_dict(self) -> dict[str, object]:
        return {
            "contract": AGENT_WORKFORCE_POLICY_CONTRACT,
            "max_running": self.max_running,
            "max_queued": self.max_queued,
            "max_daily_runs": self.max_daily_runs,
            "max_daily_units": self.max_daily_units,
            "max_batch_jobs": self.max_batch_jobs,
            "lease_seconds": self.lease_seconds,
            "job_units": dict(AGENT_JOB_UNITS),
            "job_daily_limits": dict(AGENT_JOB_DAILY_LIMITS),
            "in_flight_per_job": 1,
        }


def _bounded_environment_int(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = str(os.getenv(name, "")).strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise AgentGovernanceError("agent_policy_invalid", f"{name} must be a whole number.") from exc
    if value < minimum or value > maximum:
        raise AgentGovernanceError(
            "agent_policy_invalid",
            f"{name} must be between {minimum} and {maximum}.",
        )
    return value


def load_agent_workforce_policy() -> AgentWorkforcePolicy:
    policy = AgentWorkforcePolicy(
        max_running=_bounded_environment_int("SUPERMEGA_AGENT_MAX_RUNNING", 4, 1, 8),
        max_queued=_bounded_environment_int("SUPERMEGA_AGENT_MAX_QUEUED", 24, 1, 100),
        max_daily_runs=_bounded_environment_int("SUPERMEGA_AGENT_MAX_DAILY_RUNS", 64, 1, 128),
        max_daily_units=_bounded_environment_int("SUPERMEGA_AGENT_MAX_DAILY_UNITS", 96, 1, 256),
        max_batch_jobs=_bounded_environment_int("SUPERMEGA_AGENT_MAX_BATCH_JOBS", 5, 1, 7),
        lease_seconds=_bounded_environment_int("SUPERMEGA_AGENT_LEASE_SECONDS", 300, 30, 900),
    )
    if policy.max_daily_runs < policy.max_running:
        raise AgentGovernanceError(
            "agent_policy_invalid",
            "SUPERMEGA_AGENT_MAX_DAILY_RUNS cannot be lower than SUPERMEGA_AGENT_MAX_RUNNING.",
        )
    if policy.max_daily_units < policy.max_running:
        raise AgentGovernanceError(
            "agent_policy_invalid",
            "SUPERMEGA_AGENT_MAX_DAILY_UNITS cannot be lower than SUPERMEGA_AGENT_MAX_RUNNING.",
        )
    return policy


def normalize_agent_job_types(job_types: Sequence[object] | None) -> list[str]:
    normalized: list[str] = []
    for raw in job_types or ():
        job_type = str(raw or "").strip().lower()
        if not job_type or job_type in normalized:
            continue
        if job_type not in AGENT_JOB_UNITS:
            raise AgentGovernanceError("agent_job_type_not_allowed", f"Unsupported agent job type: {job_type or 'blank'}.")
        normalized.append(job_type)
    return normalized


def agent_job_units(job_type: str) -> int:
    normalized = str(job_type or "").strip().lower()
    try:
        return AGENT_JOB_UNITS[normalized]
    except KeyError as exc:
        raise AgentGovernanceError("agent_job_type_not_allowed", f"Unsupported agent job type: {normalized or 'blank'}.") from exc


def agent_job_daily_limit(job_type: str) -> int:
    normalized = str(job_type or "").strip().lower()
    try:
        return AGENT_JOB_DAILY_LIMITS[normalized]
    except KeyError as exc:
        raise AgentGovernanceError("agent_job_type_not_allowed", f"Unsupported agent job type: {normalized or 'blank'}.") from exc


def _utc(value: datetime | None = None) -> datetime:
    current = value or datetime.now(timezone.utc)
    if current.tzinfo is None:
        raise AgentGovernanceError("agent_time_invalid", "Agent governance timestamps must include a timezone.")
    return current.astimezone(timezone.utc)


def _parse_timestamp(value: object, field: str) -> datetime:
    raw = str(value or "").strip()
    if raw.endswith("Z"):
        raw = f"{raw[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError as exc:
        raise AgentGovernanceError("budget_grant_timestamp_invalid", f"{field} must be an ISO-8601 timestamp.") from exc
    if parsed.tzinfo is None:
        raise AgentGovernanceError("budget_grant_timestamp_invalid", f"{field} must include a timezone.")
    return parsed.astimezone(timezone.utc)


def _grant_signature_payload(grant: Mapping[str, object]) -> bytes:
    signed = {str(key): value for key, value in grant.items() if str(key) != "signature"}
    return json.dumps(signed, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")


def sign_agent_budget_grant(grant: Mapping[str, object], secret: str) -> str:
    normalized_secret = str(secret or "").strip()
    if len(normalized_secret) < 12:
        raise AgentGovernanceError("budget_grant_secret_invalid", "The budget grant signing secret is not configured securely.")
    return hmac.new(normalized_secret.encode("utf-8"), _grant_signature_payload(grant), hashlib.sha256).hexdigest()


def issue_agent_budget_grant(
    *,
    secret: str,
    cycle: str,
    job_types: Sequence[object],
    max_runs: int | None = None,
    now: datetime | None = None,
) -> dict[str, object]:
    policy = load_agent_workforce_policy()
    normalized_job_types = normalize_agent_job_types(job_types)
    if not normalized_job_types:
        raise AgentGovernanceError("budget_grant_jobs_required", "A budget grant needs at least one job type.")
    requested_runs = len(normalized_job_types) if max_runs is None else int(max_runs)
    if requested_runs < 1 or requested_runs > min(len(normalized_job_types), policy.max_batch_jobs):
        raise AgentGovernanceError("budget_grant_runs_invalid", "The budget grant run limit exceeds its unique job set.")
    issued_at = _utc(now).replace(microsecond=0)
    expires_at = issued_at + timedelta(seconds=min(policy.lease_seconds, 300))
    grant: dict[str, object] = {
        "contract": AGENT_BUDGET_GRANT_CONTRACT,
        "grant_id": secrets.token_hex(16),
        "audience": AGENT_BUDGET_AUDIENCE,
        "cycle": str(cycle or "").strip().lower() or "bounded",
        "job_types": normalized_job_types,
        "max_runs": requested_runs,
        "max_work_units": sum(agent_job_units(job_type) for job_type in normalized_job_types),
        "issued_at": issued_at.isoformat(),
        "expires_at": expires_at.isoformat(),
    }
    grant["signature"] = sign_agent_budget_grant(grant, secret)
    return grant


def verify_agent_budget_grant(
    grant: Mapping[str, object] | None,
    *,
    secret: str,
    requested_job_types: Sequence[object] | None = None,
    now: datetime | None = None,
) -> dict[str, object]:
    if not isinstance(grant, Mapping):
        raise AgentGovernanceError("budget_grant_required", "A signed agent budget grant is required.")
    if str(grant.get("contract", "")) != AGENT_BUDGET_GRANT_CONTRACT:
        raise AgentGovernanceError("budget_grant_contract_invalid", "The budget grant contract is not supported.")
    grant_id = str(grant.get("grant_id", "")).strip().lower()
    signature = str(grant.get("signature", "")).strip().lower()
    if not _GRANT_ID.fullmatch(grant_id) or not _GRANT_SIGNATURE.fullmatch(signature):
        raise AgentGovernanceError("budget_grant_identity_invalid", "The budget grant identity or signature is malformed.")
    expected_signature = sign_agent_budget_grant(grant, secret)
    if not hmac.compare_digest(signature, expected_signature):
        raise AgentGovernanceError("budget_grant_signature_invalid", "The budget grant signature is invalid.")
    if str(grant.get("audience", "")).strip() != AGENT_BUDGET_AUDIENCE:
        raise AgentGovernanceError("budget_grant_audience_invalid", "The budget grant audience does not match this worker.")

    policy = load_agent_workforce_policy()
    granted_job_types = normalize_agent_job_types(grant.get("job_types") if isinstance(grant.get("job_types"), list) else [])
    requested = normalize_agent_job_types(requested_job_types) if requested_job_types is not None else granted_job_types
    if not granted_job_types or requested != granted_job_types:
        raise AgentGovernanceError("budget_grant_jobs_mismatch", "The requested job types do not match the signed grant.")
    try:
        max_runs = int(grant.get("max_runs", 0))
        max_work_units = int(grant.get("max_work_units", 0))
    except (TypeError, ValueError) as exc:
        raise AgentGovernanceError("budget_grant_limits_invalid", "Budget grant limits must be whole numbers.") from exc
    expected_units = sum(agent_job_units(job_type) for job_type in granted_job_types)
    if max_runs < 1 or max_runs > min(len(granted_job_types), policy.max_batch_jobs):
        raise AgentGovernanceError("budget_grant_limits_invalid", "The budget grant run limit is outside policy.")
    if max_work_units < 1 or max_work_units > expected_units or max_work_units > policy.max_daily_units:
        raise AgentGovernanceError("budget_grant_limits_invalid", "The budget grant work-unit limit is outside policy.")

    issued_at = _parse_timestamp(grant.get("issued_at"), "issued_at")
    expires_at = _parse_timestamp(grant.get("expires_at"), "expires_at")
    observed_at = _utc(now)
    if expires_at <= issued_at or expires_at - issued_at > timedelta(minutes=5):
        raise AgentGovernanceError("budget_grant_window_invalid", "The budget grant validity window is outside policy.")
    if issued_at - observed_at > timedelta(seconds=30):
        raise AgentGovernanceError("budget_grant_not_yet_valid", "The budget grant was issued in the future.")
    if observed_at >= expires_at:
        raise AgentGovernanceError("budget_grant_expired", "The budget grant has expired.")

    return {
        "contract": AGENT_BUDGET_GRANT_CONTRACT,
        "grant_id": grant_id,
        "audience": AGENT_BUDGET_AUDIENCE,
        "cycle": str(grant.get("cycle", "")).strip().lower() or "bounded",
        "job_types": granted_job_types,
        "max_runs": max_runs,
        "max_work_units": max_work_units,
        "issued_at": issued_at.isoformat(),
        "expires_at": expires_at.isoformat(),
    }
