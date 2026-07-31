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


AGENT_WORKFORCE_POLICY_CONTRACT = "supermega.agent-workforce-policy.v2"
AGENT_CAPACITY_PLAN_CONTRACT = "supermega.agent-capacity-plan.v2"
AGENT_CADENCE_ADMISSION_CONTRACT = "supermega.agent-cadence-admission.v1"
AGENT_RETRY_POLICY_CONTRACT = "supermega.agent-retry-policy.v1"
AGENT_BUDGET_GRANT_CONTRACT = "supermega.agent-budget-grant.v1"
AGENT_BUDGET_ACCOUNTING_CONTRACT = "supermega.agent-budget-accounting.v1"
AGENT_BUDGET_AUDIENCE = "supermega-agent-runtime"
AGENT_ACTIVE_ASSIGNMENT_LIMIT = 1
AGENT_ROSTER_LIMIT = 12

# Registered jobs are reusable capabilities; only these reviewed lanes are
# scheduled automatically. Keeping this authority beside capacity policy stops
# health checks and schedulers from treating dormant capabilities as workers.
AGENT_AUTOMATION_LANES: dict[str, tuple[str, ...]] = {
    "queue": ("task_triage", "ops_watch"),
    "daily": ("founder_brief", "github_release_watch"),
}
AGENT_AUTOMATED_JOB_TYPES = tuple(
    dict.fromkeys(job_type for lane in AGENT_AUTOMATION_LANES.values() for job_type in lane)
)

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

# These are compiled ceilings, not suggested defaults. Environment settings may
# narrow them for a smaller host or pilot, but may never expand the reviewed
# queue, run, work-unit, or lease envelope.
AGENT_QUEUE_LIMIT = 24
AGENT_DAILY_RUN_LIMIT = sum(AGENT_JOB_DAILY_LIMITS.values())
AGENT_DAILY_WORK_UNIT_LIMIT = sum(
    AGENT_JOB_UNITS[job_type] * daily_limit
    for job_type, daily_limit in AGENT_JOB_DAILY_LIMITS.items()
)
AGENT_LEASE_LIMIT_SECONDS = 300

# Higher numbers win scarce execution slots. This is deliberately fixed in
# reviewed code rather than caller input so a queued growth task cannot outrank
# operational safety, release integrity, or company coordination by tampering
# with its payload.
AGENT_JOB_PRIORITIES: dict[str, int] = {
    "revenue_scout": 50,
    "list_clerk": 40,
    "task_triage": 80,
    "template_clerk": 60,
    "ops_watch": 100,
    "founder_brief": 70,
    "github_release_watch": 90,
}

AGENT_JOB_CADENCE_SECONDS: dict[str, int] = {
    "revenue_scout": 3_600,
    "list_clerk": 86_400,
    "task_triage": 3_600,
    "template_clerk": 3_600,
    "ops_watch": 3_600,
    "founder_brief": 86_400,
    "github_release_watch": 3_600,
}

# A second execution is allowed only when the job result is a read-only
# snapshot. Jobs that can create tasks or other durable business state remain
# single-attempt until those writes have an independently verified idempotency
# key. This is server policy: callers may narrow it, but never expand it.
AGENT_JOB_MAX_ATTEMPTS: dict[str, int] = {
    "revenue_scout": 2,
    "list_clerk": 2,
    "task_triage": 2,
    "template_clerk": 1,
    "ops_watch": 1,
    "founder_brief": 2,
    "github_release_watch": 1,
}

if (
    set(AGENT_JOB_UNITS) != set(AGENT_JOB_DAILY_LIMITS)
    or set(AGENT_JOB_UNITS) != set(AGENT_JOB_PRIORITIES)
    or set(AGENT_JOB_UNITS) != set(AGENT_JOB_CADENCE_SECONDS)
    or set(AGENT_JOB_UNITS) != set(AGENT_JOB_MAX_ATTEMPTS)
):
    raise RuntimeError("agent_job_policy_contract_invalid")
if (
    not AGENT_AUTOMATED_JOB_TYPES
    or len(AGENT_AUTOMATED_JOB_TYPES) != sum(len(lane) for lane in AGENT_AUTOMATION_LANES.values())
    or any(not lane for lane in AGENT_AUTOMATION_LANES.values())
    or not set(AGENT_AUTOMATED_JOB_TYPES).issubset(AGENT_JOB_UNITS)
):
    raise RuntimeError("agent_automation_lane_contract_invalid")

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
    max_running: int = AGENT_ACTIVE_ASSIGNMENT_LIMIT
    max_queued: int = AGENT_QUEUE_LIMIT
    max_daily_runs: int = AGENT_DAILY_RUN_LIMIT
    max_daily_units: int = AGENT_DAILY_WORK_UNIT_LIMIT
    max_batch_jobs: int = AGENT_ACTIVE_ASSIGNMENT_LIMIT
    max_registered_specialists: int = AGENT_ROSTER_LIMIT
    lease_seconds: int = AGENT_LEASE_LIMIT_SECONDS

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
            "max_registered_specialists": self.max_registered_specialists,
            "lease_seconds": self.lease_seconds,
            "job_units": dict(AGENT_JOB_UNITS),
            "job_daily_limits": dict(AGENT_JOB_DAILY_LIMITS),
            "job_priorities": dict(AGENT_JOB_PRIORITIES),
            "job_cadence_seconds": dict(AGENT_JOB_CADENCE_SECONDS),
            "cadence_admission_contract": AGENT_CADENCE_ADMISSION_CONTRACT,
            "job_max_attempts": dict(AGENT_JOB_MAX_ATTEMPTS),
            "automation_lanes": {name: list(job_types) for name, job_types in AGENT_AUTOMATION_LANES.items()},
            "automated_job_types": list(AGENT_AUTOMATED_JOB_TYPES),
            "retry_policy_contract": AGENT_RETRY_POLICY_CONTRACT,
            "in_flight_per_job": 1,
            "capacity_plan_contract": AGENT_CAPACITY_PLAN_CONTRACT,
            "execution_model": "ephemeral_demand_driven",
            "registered_specialists_consume_compute": False,
            "idle_active_execution_target": 0,
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


def _validate_agent_workforce_policy(policy: AgentWorkforcePolicy) -> AgentWorkforcePolicy:
    bounded_fields = {
        "max_running": (policy.max_running, 1, AGENT_ACTIVE_ASSIGNMENT_LIMIT),
        "max_queued": (policy.max_queued, 1, AGENT_QUEUE_LIMIT),
        "max_daily_runs": (policy.max_daily_runs, 1, AGENT_DAILY_RUN_LIMIT),
        "max_daily_units": (policy.max_daily_units, 1, AGENT_DAILY_WORK_UNIT_LIMIT),
        "max_batch_jobs": (policy.max_batch_jobs, 1, AGENT_ACTIVE_ASSIGNMENT_LIMIT),
        "max_registered_specialists": (policy.max_registered_specialists, 4, AGENT_ROSTER_LIMIT),
        "lease_seconds": (policy.lease_seconds, 30, AGENT_LEASE_LIMIT_SECONDS),
    }
    for field, (value, minimum, maximum) in bounded_fields.items():
        if type(value) is not int or value < minimum or value > maximum:
            raise AgentGovernanceError(
                "agent_policy_invalid",
                f"{field} must be a whole number between {minimum} and {maximum}.",
            )
    if policy.max_daily_runs < policy.max_running:
        raise AgentGovernanceError("agent_policy_invalid", "max_daily_runs cannot be lower than max_running.")
    if policy.max_daily_units < policy.max_running:
        raise AgentGovernanceError("agent_policy_invalid", "max_daily_units cannot be lower than max_running.")
    if policy.max_registered_specialists < policy.max_running:
        raise AgentGovernanceError("agent_policy_invalid", "max_registered_specialists cannot be lower than max_running.")
    return policy


def load_agent_workforce_policy() -> AgentWorkforcePolicy:
    policy = AgentWorkforcePolicy(
        max_running=_bounded_environment_int(
            "SUPERMEGA_AGENT_MAX_RUNNING",
            AGENT_ACTIVE_ASSIGNMENT_LIMIT,
            1,
            AGENT_ACTIVE_ASSIGNMENT_LIMIT,
        ),
        max_queued=_bounded_environment_int(
            "SUPERMEGA_AGENT_MAX_QUEUED",
            AGENT_QUEUE_LIMIT,
            1,
            AGENT_QUEUE_LIMIT,
        ),
        max_daily_runs=_bounded_environment_int(
            "SUPERMEGA_AGENT_MAX_DAILY_RUNS",
            AGENT_DAILY_RUN_LIMIT,
            1,
            AGENT_DAILY_RUN_LIMIT,
        ),
        max_daily_units=_bounded_environment_int(
            "SUPERMEGA_AGENT_MAX_DAILY_UNITS",
            AGENT_DAILY_WORK_UNIT_LIMIT,
            1,
            AGENT_DAILY_WORK_UNIT_LIMIT,
        ),
        max_batch_jobs=_bounded_environment_int(
            "SUPERMEGA_AGENT_MAX_BATCH_JOBS",
            AGENT_ACTIVE_ASSIGNMENT_LIMIT,
            1,
            AGENT_ACTIVE_ASSIGNMENT_LIMIT,
        ),
        max_registered_specialists=_bounded_environment_int(
            "SUPERMEGA_AGENT_MAX_REGISTERED_SPECIALISTS",
            AGENT_ROSTER_LIMIT,
            4,
            AGENT_ROSTER_LIMIT,
        ),
        lease_seconds=_bounded_environment_int(
            "SUPERMEGA_AGENT_LEASE_SECONDS",
            AGENT_LEASE_LIMIT_SECONDS,
            30,
            AGENT_LEASE_LIMIT_SECONDS,
        ),
    )
    return _validate_agent_workforce_policy(policy)


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


def agent_job_priority(job_type: str) -> int:
    normalized = str(job_type or "").strip().lower()
    try:
        return AGENT_JOB_PRIORITIES[normalized]
    except KeyError as exc:
        raise AgentGovernanceError("agent_job_type_not_allowed", f"Unsupported agent job type: {normalized or 'blank'}.") from exc


def agent_job_cadence_seconds(job_type: str) -> int:
    normalized = str(job_type or "").strip().lower()
    try:
        return AGENT_JOB_CADENCE_SECONDS[normalized]
    except KeyError as exc:
        raise AgentGovernanceError("agent_job_type_not_allowed", f"Unsupported agent job type: {normalized or 'blank'}.") from exc


def agent_job_max_attempts(job_type: str) -> int:
    normalized = str(job_type or "").strip().lower()
    try:
        return AGENT_JOB_MAX_ATTEMPTS[normalized]
    except KeyError as exc:
        raise AgentGovernanceError("agent_job_type_not_allowed", f"Unsupported agent job type: {normalized or 'blank'}.") from exc


def _agent_job_sequence(values: Sequence[object] | None, *, field: str) -> list[str]:
    if values is None:
        return []
    if len(values) > 10_000:
        raise AgentGovernanceError("agent_capacity_state_invalid", f"{field} is too large to plan safely.")
    normalized: list[str] = []
    for raw in values:
        job_type = str(raw or "").strip().lower()
        if job_type not in AGENT_JOB_UNITS:
            raise AgentGovernanceError(
                "agent_job_type_not_allowed",
                f"Unsupported agent job type in {field}: {job_type or 'blank'}.",
            )
        normalized.append(job_type)
    return normalized


def _capacity_limit(value: int | None, *, default: int, maximum: int, field: str) -> int:
    candidate = default if value is None else value
    if type(candidate) is not int or candidate < 0 or candidate > maximum:
        raise AgentGovernanceError(
            "agent_capacity_limit_invalid",
            f"{field} must be a whole number between 0 and {maximum}.",
        )
    return candidate


def plan_agent_capacity(
    *,
    queued_job_types: Sequence[object] | None,
    running_job_types: Sequence[object] | None,
    daily_job_types: Sequence[object] | None,
    registered_specialists: int = 0,
    max_claim_runs: int | None = None,
    max_claim_work_units: int | None = None,
    policy: AgentWorkforcePolicy | None = None,
) -> dict[str, object]:
    """Plan useful execution demand without treating a specialist roster as workers."""

    active_policy = _validate_agent_workforce_policy(policy) if policy is not None else load_agent_workforce_policy()
    if (
        type(registered_specialists) is not int
        or registered_specialists < 0
        or registered_specialists > active_policy.max_registered_specialists
    ):
        raise AgentGovernanceError(
            "agent_capacity_state_invalid",
            f"registered_specialists must be a whole number between 0 and {active_policy.max_registered_specialists}.",
        )

    queued = _agent_job_sequence(queued_job_types, field="queued_job_types")
    running = _agent_job_sequence(running_job_types, field="running_job_types")
    daily = _agent_job_sequence(daily_job_types, field="daily_job_types")
    if len(running) > active_policy.max_running or len(set(running)) != len(running):
        raise AgentGovernanceError(
            "agent_capacity_state_invalid",
            "Active agent reservations exceed the concurrency or per-job policy.",
        )

    claim_run_limit = _capacity_limit(
        max_claim_runs,
        default=active_policy.max_batch_jobs,
        maximum=active_policy.max_batch_jobs,
        field="max_claim_runs",
    )
    claim_unit_limit = _capacity_limit(
        max_claim_work_units,
        default=active_policy.max_daily_units,
        maximum=active_policy.max_daily_units,
        field="max_claim_work_units",
    )
    daily_units_used = sum(agent_job_units(job_type) for job_type in daily)
    daily_counts = {job_type: daily.count(job_type) for job_type in AGENT_JOB_UNITS}
    remaining_daily_runs = max(0, active_policy.max_daily_runs - len(daily))
    remaining_daily_units = max(0, active_policy.max_daily_units - daily_units_used)
    available_slots = max(0, active_policy.max_running - len(running))
    selection_limit = min(available_slots, remaining_daily_runs, claim_run_limit)
    selection_unit_limit = min(remaining_daily_units, claim_unit_limit)

    selected: list[str] = []
    selected_units = 0
    first_queued_index: dict[str, int] = {}
    running_set = set(running)
    deferred = {
        "duplicate_job": 0,
        "job_in_flight": 0,
        "job_daily_budget": 0,
        "run_or_concurrency_limit": 0,
        "work_unit_budget": 0,
    }
    for index, job_type in enumerate(queued):
        if job_type in first_queued_index:
            deferred["duplicate_job"] += 1
            continue
        first_queued_index[job_type] = index

    # Deterministic priority is followed by work-unit efficiency and then FIFO.
    # The fixed priority table protects control-plane work; the final FIFO key
    # prevents callers from reordering equal-policy jobs unpredictably.
    ordered_queued = sorted(
        first_queued_index,
        key=lambda job_type: (
            -agent_job_priority(job_type),
            agent_job_units(job_type),
            first_queued_index[job_type],
            job_type,
        ),
    )
    for job_type in ordered_queued:
        if job_type in running_set:
            deferred["job_in_flight"] += 1
            continue
        if daily_counts[job_type] >= agent_job_daily_limit(job_type):
            deferred["job_daily_budget"] += 1
            continue
        if len(selected) >= selection_limit:
            deferred["run_or_concurrency_limit"] += 1
            continue
        units = agent_job_units(job_type)
        if selected_units + units > selection_unit_limit:
            deferred["work_unit_budget"] += 1
            continue
        selected.append(job_type)
        selected_units += units

    target_active_executions = len(running) + len(selected)
    if selected:
        decision = "scale_up"
    elif running:
        decision = "hold_active"
    elif not queued:
        decision = "scale_to_zero"
    elif remaining_daily_runs == 0 or remaining_daily_units == 0:
        decision = "daily_budget_exhausted"
    else:
        decision = "deferred"

    return {
        "contract": AGENT_CAPACITY_PLAN_CONTRACT,
        "status": "ready",
        "decision": decision,
        "execution_model": "ephemeral_demand_driven",
        "registered_specialists": registered_specialists,
        "registered_specialists_consume_compute": False,
        "running_executions": len(running),
        "queued_jobs": len(queued),
        "eligible_unique_jobs": len(set(first_queued_index) - running_set),
        "selection_policy": "fixed_priority_then_work_unit_efficiency_then_fifo",
        "recommended_claim_job_types": selected,
        "recommended_claims": [
            {
                "job_type": job_type,
                "priority": agent_job_priority(job_type),
                "work_units": agent_job_units(job_type),
            }
            for job_type in selected
        ],
        "recommended_claim_limit": len(selected),
        "recommended_claim_work_units": selected_units,
        "target_active_executions": target_active_executions,
        "idle_registered_specialists": max(0, registered_specialists - target_active_executions),
        "registry_attention": registered_specialists >= active_policy.max_registered_specialists,
        "registry_slots_remaining": active_policy.max_registered_specialists - registered_specialists,
        "scale_to_zero": target_active_executions == 0,
        "deferred_jobs": len(queued) - len(selected),
        "deferred_reasons": deferred,
        "budget": {
            "daily_runs_used": len(daily),
            "daily_runs_remaining": remaining_daily_runs,
            "daily_work_units_used": daily_units_used,
            "daily_work_units_remaining": remaining_daily_units,
        },
        "limits": {
            "max_running": active_policy.max_running,
            "max_queued": active_policy.max_queued,
            "max_batch_jobs": active_policy.max_batch_jobs,
            "max_daily_runs": active_policy.max_daily_runs,
            "max_daily_units": active_policy.max_daily_units,
            "max_registered_specialists": active_policy.max_registered_specialists,
            "in_flight_per_job": 1,
            "job_priorities": dict(AGENT_JOB_PRIORITIES),
        },
    }


def _utc(value: datetime | None = None) -> datetime:
    current = value or datetime.now(timezone.utc)
    if current.tzinfo is None:
        raise AgentGovernanceError("agent_time_invalid", "Agent governance timestamps must include a timezone.")
    return current.astimezone(timezone.utc)


def agent_job_cadence_state(
    *,
    job_type: str,
    last_finished_at: datetime | None,
    now: datetime | None = None,
) -> dict[str, object]:
    """Return a deterministic due-only admission decision for automation."""

    normalized_job_type = normalize_agent_job_types([job_type])[0]
    observed_at = _utc(now)
    cadence_seconds = agent_job_cadence_seconds(normalized_job_type)
    if last_finished_at is None:
        return {
            "contract": AGENT_CADENCE_ADMISSION_CONTRACT,
            "decision": "due_never_run",
            "due": True,
            "job_type": normalized_job_type,
            "cadence_seconds": cadence_seconds,
            "observed_at": observed_at.isoformat(),
            "last_finished_at": None,
            "next_due_at": observed_at.isoformat(),
        }

    finished_at = _utc(last_finished_at)
    if finished_at > observed_at + timedelta(minutes=5):
        raise AgentGovernanceError(
            "agent_cadence_state_invalid",
            "The latest agent completion is too far in the future for safe cadence admission.",
            job_type=normalized_job_type,
        )
    next_due_at = finished_at + timedelta(seconds=cadence_seconds)
    due = observed_at >= next_due_at
    return {
        "contract": AGENT_CADENCE_ADMISSION_CONTRACT,
        "decision": "due_cadence_elapsed" if due else "deferred_cadence_not_elapsed",
        "due": due,
        "job_type": normalized_job_type,
        "cadence_seconds": cadence_seconds,
        "observed_at": observed_at.isoformat(),
        "last_finished_at": finished_at.isoformat(),
        "next_due_at": next_due_at.isoformat(),
    }


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
    if len(normalized_secret.encode("utf-8")) < 32:
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
    requested_runs = min(len(normalized_job_types), policy.max_batch_jobs) if max_runs is None else int(max_runs)
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
        "max_work_units": sum(sorted((agent_job_units(job_type) for job_type in normalized_job_types), reverse=True)[:requested_runs]),
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
