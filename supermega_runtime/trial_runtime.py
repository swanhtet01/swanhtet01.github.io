from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from copy import deepcopy
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from hashlib import sha256
import json
import os
from typing import Any, Literal, Protocol, TypeVar
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from supermega_runtime.commerce_runtime import COMMERCE_HUMAN_EVENTS, validate_commerce_state
from supermega_runtime.client_import_runtime import (
    CLIENT_IMPORT_MAX_PACKAGE_BYTES,
    ClientImportValidationError,
    validate_client_import_staging_package,
)
from supermega_runtime.company_brief import (
    assert_brief_sources_unchanged,
    build_managed_company_brief,
    company_brief_receipt,
    company_state_with_receipt,
)
from supermega_runtime.owner_control import (
    assert_owner_control_sources_unchanged,
    build_managed_owner_control_run,
    company_state_with_owner_control_acknowledgement,
    owner_control_acknowledgement,
)
from supermega_runtime.managed_context import (
    MANAGED_CONTEXT_RETENTION_CONTRACT,
    MANAGED_CONTEXT_VALIDATION_CONTRACT,
    build_managed_context_profile,
    company_state_with_context_profile,
    managed_context_validation_digest,
)
from supermega_runtime.production_runtime import (
    PRODUCTION_HUMAN_EVENTS,
    require_shop_demand_source_current,
)
from supermega_runtime.order_intake import (
    MAX_ORDER_MESSAGE_LENGTH,
    OrderIntakeCatalogItem,
)
from supermega_runtime.order_intake_provider import (
    MAX_ORDER_INTAKE_CATALOG_ITEMS,
    OrderIntakeDraftProvider,
    OrderIntakeProviderError,
)
from supermega_runtime.plant_equipment_import import (
    PLANT_EQUIPMENT_MAX_PACKAGE_BYTES,
    PlantEquipmentImportError,
    validate_plant_equipment_import,
)
from supermega_runtime.telemetry import schema as telemetry_schema
from supermega_runtime.telemetry.tracing import domain_span
from supermega_runtime.production_material_handoff import (
    production_material_requests,
    require_shop_issue_before_plant_progress,
    require_shop_issue_matches_plant,
)
from supermega_runtime.trial_store import (
    APPROVAL_DECIDE_CAPABILITY,
    APPROVAL_REQUEST_CAPABILITY,
    PRODUCT_ACCEPTANCE_SURFACES,
    SURFACE_WRITE_CAPABILITIES,
    ApprovalRecord,
    CommandResult,
    TrialClaimConflict,
    TrialIdempotencyConflict,
    TrialHumanApprovalRequired,
    TrialInvalidTransition,
    TrialNotFound,
    TrialNotReadyError,
    TrialPermissionDenied,
    TrialPrincipal,
    TrialRateLimited,
    TrialReadiness,
    TrialState,
    TrialStore,
    TrialStoreError,
    TrialValidationError,
    TrialVersionConflict,
    StatePrecondition,
    has_approval_read_capability,
    has_surface_read_capability,
    validate_self_serve_business_name,
    validate_self_serve_claim_code,
)
from supermega_runtime.website_runtime import WEBSITE_HUMAN_EVENTS, validate_website_snapshot_source


TRIAL_API_PREFIX = "/api/trial/v1"
TRIAL_SURFACE_ORDER = ("company", "commerce", "production", "website", "setup")

SELF_SERVE_ACTIVATION_WINDOW_ENV = "SUPERMEGA_SELF_SERVE_ACTIVATION_WINDOW"
SELF_SERVE_ACTIVATION_CONTRACT = "supermega.self_serve_workspace_activation.v1"


@dataclass(frozen=True, slots=True)
class TrialSignupSession:
    """A verified authenticated user who is not yet a workspace member.

    Tenant creation is the one trial route that cannot present a workspace
    identity, so it carries only what the server-side auth wiring confirmed:
    the named actor, the signed session, and the email-verification state.
    """

    actor_id: str
    session_id: str = ""
    email_verified: bool = False
    identity_provider: str = "supabase"
    # Server-confirmed address (empty unless verified); used only for the
    # courtesy welcome send after tenant creation, never for authorization.
    email: str = ""


PrincipalResolver = Callable[[Request], TrialPrincipal | None]
SignupSessionResolver = Callable[[Request], TrialSignupSession | None]
DateResolver = Callable[[], date]
ResultT = TypeVar("ResultT")


class WelcomeEmailSender(Protocol):
    """Best-effort courtesy send after a NEW tenant is created.

    Implementations must never raise into the activation path and must be
    idempotent per workspace; the router additionally guards both properties.
    """

    def __call__(
        self, *, to_email: str, business_name: str, workspace_id: str, claim_code: str
    ) -> bool: ...


def self_serve_activation_window_open() -> bool:
    """The fail-closed service gate for self-serve tenant creation.

    Setting ``SUPERMEGA_SELF_SERVE_ACTIVATION_WINDOW`` to exactly ``open`` IS
    the founder's self_serve_pilot decision (spec section 4). Absent, blank,
    or any other value keeps the endpoint dark with a 503.
    """

    return os.environ.get(SELF_SERVE_ACTIVATION_WINDOW_ENV) == "open"

_YANGON_TIME_ZONE = timezone(timedelta(hours=6, minutes=30))


def _current_yangon_date() -> date:
    return datetime.now(_YANGON_TIME_ZONE).date()


def _current_utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


_CLIENT_IDENTITY_FIELDS = frozenset(
    {
        "actor_id",
        "actor_kind",
        "decided_by",
        "decided_actor_kind",
        "requested_by",
        "requested_actor_kind",
        "updated_by",
        "workspace_id",
    }
)


def _strict_json_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, nested in pairs:
        if key in value:
            raise ValueError("duplicate JSON object key")
        value[key] = nested
    return value


def _reject_json_constant(value: str) -> None:
    raise ValueError(f"unsupported JSON constant: {value}")


class _StrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TrialCommandRequest(_StrictRequest):
    command_id: UUID
    surface: Literal["company", "commerce", "production", "website", "setup"]
    event_type: str = Field(min_length=1, max_length=80)
    expected_version: int = Field(ge=0)
    payload: dict[str, Any] = Field(default_factory=dict)


class TrialProductAcceptanceRequest(_StrictRequest):
    probe_id: UUID
    owner_approval_id: UUID
    product: Literal["commerce", "production", "website", "ecommerce"]
    release_commit: str = Field(pattern=r"^[0-9a-f]{40}$")
    confirmation: Literal["RECORD HOSTED PRODUCT ACCEPTANCE"]


class TrialSelfServeWorkspaceRequest(_StrictRequest):
    """One named company and one explicit first-product entitlement."""

    claimCode: str = Field(min_length=1, max_length=40)
    businessName: str = Field(min_length=1, max_length=120)
    product: Literal["commerce", "production", "website", "ecommerce"]


class TrialClientImportApplyRequest(_StrictRequest):
    command_id: UUID
    expected_version: int = Field(ge=0)
    preflight_digest: str = Field(
        min_length=71,
        max_length=71,
        pattern=r"^sha256:[0-9a-f]{64}$",
    )
    confirmation: str = Field(
        min_length=77,
        max_length=77,
        pattern=r"^APPLY sha256:[0-9a-f]{64}$",
    )
    package: dict[str, Any]


class TrialClientImportApplyPreflightRequest(_StrictRequest):
    expected_version: int = Field(ge=0)
    package: dict[str, Any]


class TrialPlantEquipmentImportApplyRequest(_StrictRequest):
    command_id: UUID
    expected_version: int = Field(ge=1)
    confirmation: str = Field(min_length=77, max_length=77)
    package: dict[str, Any]


class TrialPlantEquipmentCommissionRequest(_StrictRequest):
    command_id: UUID
    expected_version: int = Field(ge=1)
    equipment_id: str = Field(
        min_length=1,
        max_length=80,
        pattern=r"^[A-Z0-9][A-Z0-9._/-]{0,79}$",
    )
    installed_at: str = Field(min_length=24, max_length=24)
    initial_state: Literal["running", "attention", "stopped"]
    safety_baseline_reference: str = Field(min_length=1, max_length=240)
    confirmation: str = Field(min_length=12, max_length=91)


class TrialPlantEquipmentMaintenanceStrategyRequest(_StrictRequest):
    command_id: UUID
    expected_version: int = Field(ge=1)
    equipment_id: str = Field(
        min_length=1,
        max_length=80,
        pattern=r"^[A-Z0-9][A-Z0-9._/-]{0,79}$",
    )
    maintenance_owner: str = Field(min_length=1, max_length=120)
    interval_days: int = Field(ge=1, le=3650)
    next_due_at: str = Field(min_length=24, max_length=24)
    procedure_reference: str = Field(min_length=1, max_length=240)
    safety_baseline_reference: str = Field(min_length=1, max_length=240)
    confirmation: str = Field(min_length=18, max_length=98)


class TrialOrderIntakeDraftRequest(_StrictRequest):
    source_label: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=1, max_length=MAX_ORDER_MESSAGE_LENGTH)

    @field_validator("source_label")
    @classmethod
    def require_canonical_source_label(cls, value: str) -> str:
        if not value.strip() or value != value.strip():
            raise ValueError("source label must be canonical visible text")
        return value

    @field_validator("message")
    @classmethod
    def require_visible_order_message(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("order message must contain visible characters")
        return value


class TrialCompanyBriefRequest(_StrictRequest):
    intent: Literal[
        "attention",
        "shop_inventory",
        "plant_control",
        "website_readiness",
        "ecommerce_readiness",
    ]


class TrialCompanyBriefReceiptRequest(TrialCompanyBriefRequest):
    command_id: UUID
    brief_digest: str = Field(min_length=71, max_length=71, pattern=r"^sha256:[0-9a-f]{64}$")
    expected_company_version: int = Field(ge=0)


class TrialOwnerControlAcknowledgementRequest(_StrictRequest):
    command_id: UUID
    expected_company_version: int = Field(ge=0)
    run_digest: str = Field(min_length=71, max_length=71, pattern=r"^sha256:[0-9a-f]{64}$")
    item_id: str = Field(min_length=71, max_length=71, pattern=r"^sha256:[0-9a-f]{64}$")


class TrialManagedContextValidateRequest(_StrictRequest):
    package: dict[str, Any]


class TrialManagedContextRetainRequest(TrialManagedContextValidateRequest):
    command_id: UUID
    expected_company_version: int = Field(ge=0)
    profile_digest: str = Field(min_length=71, max_length=71, pattern=r"^sha256:[0-9a-f]{64}$")
    validation_digest: str = Field(min_length=71, max_length=71, pattern=r"^sha256:[0-9a-f]{64}$")


class TrialServiceScheduleSaveRequest(_StrictRequest):
    command_id: UUID
    expected_version: int = Field(ge=1)
    captured_at: str = Field(min_length=20, max_length=40)
    schedule: dict[str, Any]


class TrialDecisionSubject(_StrictRequest):
    kind: str = Field(min_length=1, max_length=80, pattern=r"^[a-z0-9._-]+$")
    id: str = Field(min_length=1, max_length=160)
    version: Literal[1]


class TrialDecisionClaim(_StrictRequest):
    id: str = Field(min_length=1, max_length=160)
    claim_type: Literal["fact", "analysis"]
    statement: str = Field(min_length=1, max_length=500)
    source_reference: str = Field(min_length=1, max_length=200)
    captured_at: str = Field(min_length=20, max_length=40)
    status: Literal["observed", "verified"]
    uncertainty: Literal["low", "medium", "high"]
    visibility: Literal["private", "public"]
    digest: str | None = Field(default=None, max_length=71, pattern=r"^sha256:[0-9a-f]{64}$")


class TrialDecisionPacket(_StrictRequest):
    contract: Literal["decision_packet.v1"]
    subject: TrialDecisionSubject
    decision: str = Field(min_length=1, max_length=500)
    claims: list[TrialDecisionClaim] = Field(min_length=1, max_length=20)
    baseline: str = Field(min_length=1, max_length=500)
    target: str = Field(min_length=1, max_length=500)
    result: str = Field(min_length=1, max_length=500)
    acceptance: str = Field(min_length=1, max_length=500)
    artifact_reference: str = Field(min_length=1, max_length=200)


class TrialApprovalRequest(_StrictRequest):
    command_id: UUID
    title: str = Field(min_length=1, max_length=160)
    proposal: TrialDecisionPacket
    evidence_refs: list[str] = Field(min_length=1, max_length=20)


class TrialApprovalDecisionRequest(_StrictRequest):
    command_id: UUID
    decision: Literal["approved", "declined"]
    note: str = Field(min_length=1, max_length=500)

    @field_validator("note", mode="before")
    @classmethod
    def normalize_decision_note(cls, value: object) -> object:
        if not isinstance(value, str):
            raise ValueError("decision note must be a string")
        note = value.strip()
        if not note:
            raise ValueError("decision note must not be blank")
        return note


def _error(status_code: int, code: str, **details: Any) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, **details})


def _resolve_principal(request: Request, resolver: PrincipalResolver) -> TrialPrincipal:
    """Resolve identity only through trusted server authentication wiring."""

    try:
        principal = resolver(request)
    except HTTPException:
        raise
    except Exception as exc:
        raise _error(503, "trial_auth_unavailable") from exc
    if principal is None:
        raise _error(401, "trial_auth_required")
    if not isinstance(principal, TrialPrincipal):
        raise _error(503, "trial_auth_unavailable")
    normalized = principal.normalized()
    if (
        not normalized.authenticated
        or not normalized.workspace_id
        or not normalized.actor_id
        or normalized.actor_kind not in {"human", "service", "agent"}
    ):
        raise _error(401, "trial_auth_required")
    return normalized


def _readiness(store: TrialStore, principal: TrialPrincipal) -> TrialReadiness:
    try:
        readiness = store.readiness(principal)
    except Exception as exc:
        raise _error(503, "trial_backend_unavailable") from exc
    if not isinstance(readiness, TrialReadiness):
        raise _error(503, "trial_backend_unavailable")
    return readiness


def _require_read_ready(readiness: TrialReadiness) -> None:
    infrastructure_blockers = [
        name
        for name, ready in (
            ("database_ready", readiness.database_ready),
            ("schema_ready", readiness.schema_ready),
        )
        if not ready
    ]
    if infrastructure_blockers:
        raise _error(503, "trial_not_ready", blockers=infrastructure_blockers)
    if not readiness.auth_ready:
        raise _error(401, "trial_auth_required")
    if not readiness.membership_ready:
        raise _error(403, "trial_membership_required")


def _require_write_ready(readiness: TrialReadiness, capability: str) -> None:
    infrastructure_blockers = [
        name
        for name, ready in (
            ("database_ready", readiness.database_ready),
            ("schema_ready", readiness.schema_ready),
            ("audit_ready", readiness.audit_ready),
            ("write_enabled", readiness.write_enabled),
        )
        if not ready
    ]
    if infrastructure_blockers:
        raise _error(503, "trial_not_ready", blockers=infrastructure_blockers)
    if not readiness.auth_ready:
        raise _error(401, "trial_auth_required")
    if not readiness.membership_ready:
        raise _error(403, "trial_membership_required")
    if capability not in readiness.capabilities:
        raise _error(403, "trial_capability_required", required_capability=capability)


_SPA_OWNER_SCHEDULE_EVENTS = frozenset(
    {"client_retention_set", "client_exported", "client_anonymized"}
)


def _spa_owner_schedule_event(candidate: Mapping[str, Any]) -> str | None:
    schedule = candidate.get("serviceSchedule")
    events = schedule.get("events") if isinstance(schedule, Mapping) else None
    latest = events[-1] if isinstance(events, list) and events else None
    event_type = latest.get("type") if isinstance(latest, Mapping) else None
    return str(event_type) if event_type in _SPA_OWNER_SCHEDULE_EVENTS else None


def _require_spa_owner_schedule_action(
    readiness: TrialReadiness,
    candidate: Mapping[str, Any],
) -> None:
    event_type = _spa_owner_schedule_event(candidate)
    if event_type is not None and not readiness.capabilities.intersection(
        {"company.control.approve", "company.write"}
    ):
        raise _error(
            403,
            "spa_owner_action_required",
            action=f"service_schedule:{event_type}",
            required_capability="company.write",
        )


def _reject_client_identity(value: Any, *, path: str) -> None:
    """Prevent generic reducers from persisting client-asserted authority metadata."""

    if isinstance(value, Mapping):
        for key, nested in value.items():
            field = str(key)
            if field.casefold() in _CLIENT_IDENTITY_FIELDS:
                raise _error(422, "client_identity_forbidden", field=f"{path}.{field}")
            _reject_client_identity(nested, path=f"{path}.{field}")
    elif isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        for index, nested in enumerate(value):
            _reject_client_identity(nested, path=f"{path}[{index}]")


async def _bounded_json_body(
    request: Request,
    *,
    maximum_bytes: int = CLIENT_IMPORT_MAX_PACKAGE_BYTES,
) -> object:
    """Read one JSON package without trusting Content-Length or buffering unbounded input."""

    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if content_type != "application/json":
        raise _error(415, "client_import_json_required")

    content_length = request.headers.get("content-length")
    if content_length:
        try:
            declared_size = int(content_length)
        except ValueError as exc:
            raise _error(400, "client_import_invalid_content_length") from exc
        if declared_size < 0:
            raise _error(400, "client_import_invalid_content_length")
        if declared_size > maximum_bytes:
            raise _error(
                413,
                "client_import_too_large",
                maximum_bytes=maximum_bytes,
            )

    chunks: list[bytes] = []
    total = 0
    try:
        async for chunk in request.stream():
            total += len(chunk)
            if total > maximum_bytes:
                raise _error(
                    413,
                    "client_import_too_large",
                    maximum_bytes=maximum_bytes,
                )
            chunks.append(chunk)
        return json.loads(
            b"".join(chunks),
            object_pairs_hook=_strict_json_object,
            parse_constant=_reject_json_constant,
        )
    except HTTPException:
        raise
    except (ValueError, UnicodeDecodeError, RecursionError) as exc:
        raise _error(422, "client_import_invalid_json") from exc


def _invoke(operation: Callable[[], ResultT]) -> ResultT:
    try:
        return operation()
    except TrialNotReadyError as exc:
        reasons = list(exc.reasons)
        if "auth_ready" in exc.reasons:
            raise _error(401, "trial_auth_required") from exc
        if exc.reasons and set(exc.reasons) == {"membership_ready"}:
            raise _error(403, "trial_membership_required") from exc
        raise _error(503, "trial_not_ready", blockers=reasons) from exc
    except TrialPermissionDenied as exc:
        raise _error(
            403,
            "trial_capability_required",
            required_capability=exc.required_capability,
        ) from exc
    except TrialHumanApprovalRequired as exc:
        raise _error(403, "trial_human_approval_required") from exc
    except TrialVersionConflict as exc:
        raise _error(
            409,
            "trial_version_conflict",
            expected_version=exc.expected_version,
            current_version=exc.current_version,
        ) from exc
    except TrialIdempotencyConflict as exc:
        raise _error(409, "trial_idempotency_conflict", command_id=exc.command_id) from exc
    except TrialInvalidTransition as exc:
        raise _error(409, "trial_invalid_transition") from exc
    except TrialClaimConflict as exc:
        raise _error(409, "claim_code_conflict") from exc
    except TrialRateLimited as exc:
        raise _error(429, "self_serve_rate_limited", limit=exc.limit) from exc
    except TrialNotFound as exc:
        raise _error(404, "trial_not_found") from exc
    except TrialValidationError as exc:
        raise _error(422, "trial_validation_error", message=str(exc)) from exc
    except TrialStoreError as exc:
        raise _error(503, "trial_backend_unavailable") from exc
    except Exception as exc:
        raise _error(503, "trial_backend_unavailable") from exc


def _approval_response(approval: ApprovalRecord) -> dict[str, Any]:
    return {"approval": approval.to_dict()}


def _command_response(result: CommandResult) -> dict[str, Any]:
    return {"result": result.to_dict()}


def _command_domain_span_name(surface: str, event_type: str) -> str | None:
    """Map a generic `/commands` request to one of the plan's named workflow spans.

    Plan section 6 step 9 names five multi-step workflows to wrap with a
    manual domain span: shop order confirm, plant job release, ecommerce
    request submit, AI invocation, and worker cycle. This runtime has no
    per-workflow command function — every surface writes through one
    generic `store.apply_command`, keyed by `(surface, event_type)` — so the
    mapping lives here instead, at the one call site all of them share.

    * `commerce.order.created` is Shop's actual order-confirmation event: an
      order in this codebase is created directly into the `confirmed` state
      (see `commerce_runtime._ORDER_STATUSES`), so there is no separate
      `commerce.order.intake` step to distinguish it from — this is the
      `shop.order.confirm` span.
    * `production.job.created` is the point a job's BOM/routing versions are
      locked and it becomes workable — `plant.job.release`.
    * `commerce.storefront_request.received` is the event that durably
      records an Ecommerce buyer's submitted request into the Shop-facing
      state — `ecommerce.request.submit`.

    AI invocation and worker cycle are not reachable from this endpoint;
    see `order_intake_provider.py` and the Phase A report for those.
    """

    if surface == "commerce" and event_type == "commerce.order.created":
        return telemetry_schema.SHOP_ORDER_CONFIRM
    if surface == "production" and event_type == "production.job.created":
        return telemetry_schema.PLANT_JOB_RELEASE
    if surface == "commerce" and event_type == "commerce.storefront_request.received":
        return telemetry_schema.ECOMMERCE_REQUEST_SUBMIT
    return None


def _company_brief_context(
    store: TrialStore,
    principal: TrialPrincipal,
    readiness: TrialReadiness,
) -> tuple[dict[str, Any], list[ApprovalRecord], int]:
    states = {
        surface: _invoke(lambda surface=surface: store.get_state(principal, surface))
        for surface in ("commerce", "production", "website")
        if has_surface_read_capability(readiness.capabilities, surface)
    }
    approvals = (
        _invoke(lambda: store.list_approvals(principal))
        if has_approval_read_capability(readiness.capabilities)
        else []
    )
    company_version = 0
    if has_surface_read_capability(readiness.capabilities, "company"):
        company = _invoke(lambda: store.get_state(principal, "company"))
        company_version = company.version
        states["company"] = company
    return states, approvals, company_version


def _shop_catalog_import_payload(
    package: Mapping[str, Any],
    *,
    actor_id: str,
    command_id: UUID,
    package_digest: str,
) -> dict[str, Any]:
    rows = package.get("rows")
    if not isinstance(rows, list) or not rows:
        raise _error(422, "client_import_activation_invalid")
    items: list[dict[str, Any]] = []
    try:
        for row in rows:
            if not isinstance(row, Mapping) or not isinstance(row.get("values"), Mapping):
                raise ValueError("invalid row")
            values = row["values"]
            items.append(
                {
                    "sku": values["sku"],
                    "name": values["name"],
                    "onHand": int(values["onHand"]),
                    "reorderAt": int(values["reorderAt"]),
                    "price": int(values["price"]),
                }
            )
    except (KeyError, TypeError, ValueError) as exc:
        raise _error(422, "client_import_activation_invalid") from exc
    return {
        "state": {
            "schema": "supermega.commerce.workspace.v2",
            "items": items,
            "orders": [],
            "movements": [],
            "closes": [],
        },
        "evidence": {
            "actionId": f"ACT-IMPORT-{command_id}",
            "capturedAt": "server-assigned",
            "actor": actor_id,
            "reason": "Apply the reviewed Shop catalog import.",
            "evidenceReference": package_digest,
        },
    }


def _plant_jobs_import_payload(
    package: Mapping[str, Any],
    *,
    actor_id: str,
    command_id: UUID,
    package_digest: str,
) -> dict[str, Any]:
    rows = package.get("rows")
    owner = package.get("owner")
    industry_pack_id = package.get("plantIndustryPackId")
    if (
        not isinstance(rows, list)
        or not rows
        or not isinstance(owner, str)
        or not isinstance(industry_pack_id, str)
    ):
        raise _error(422, "client_import_activation_invalid")
    jobs: list[dict[str, Any]] = []
    try:
        for row in rows:
            if not isinstance(row, Mapping) or not isinstance(row.get("values"), Mapping):
                raise ValueError("invalid row")
            values = row["values"]
            job_code = values["jobCode"]
            product_name = values["productName"]
            due_date = values["dueDate"]
            line = values["line"]
            if not all(
                isinstance(value, str)
                for value in (job_code, product_name, due_date, line)
            ):
                raise ValueError("invalid row value")
            canonical_due_date = date.fromisoformat(due_date).isoformat()
            jobs.append(
                {
                    "id": job_code,
                    "line": line,
                    "product": product_name,
                    "target": int(values["targetQuantity"]),
                    "output": 0,
                    "owner": owner,
                    "priority": "normal",
                    # 23:59:59.999 in Myanmar is 17:29:59.999 UTC.
                    "dueAt": f"{canonical_due_date}T17:29:59.999Z",
                }
            )
    except (KeyError, TypeError, ValueError) as exc:
        raise _error(422, "client_import_activation_invalid") from exc
    return {
        "state": {
            "schema": "supermega.production.workspace.v2",
            "revision": 0,
            "jobs": jobs,
            "issues": [],
            "machines": [],
            "events": [],
            "openingPlan": {
                "contract": "supermega.production.opening-plan.v1",
                "packageDigest": package_digest,
                "confirmedAt": "server-assigned",
                "industryPackId": industry_pack_id,
                "jobIds": [job["id"] for job in jobs],
                "machineIds": [],
            },
        },
        "evidence": {
            "actionId": f"ACT-IMPORT-{command_id}",
            "capturedAt": "server-assigned",
            "actor": actor_id,
            "reason": "Initialize Plant jobs from the reviewed opening plan.",
            "evidenceReference": package_digest,
        },
    }


def _website_pages_import_payload(
    package: Mapping[str, Any],
    *,
    actor_id: str,
    command_id: UUID,
    package_digest: str,
) -> dict[str, Any]:
    rows = package.get("rows")
    workspace = package.get("workspace")
    if not isinstance(rows, list) or not rows or not isinstance(workspace, str):
        raise _error(422, "client_import_activation_invalid")
    pages: list[dict[str, Any]] = []
    try:
        for index, row in enumerate(rows, start=1):
            if not isinstance(row, Mapping) or not isinstance(row.get("values"), Mapping):
                raise ValueError("invalid row")
            values = row["values"]
            slug = str(values["slug"])
            title = str(values["title"])
            contact_url = str(values["contactUrl"])
            pages.append(
                {
                    "id": f"page-import-{index}",
                    "internalName": title,
                    "slug": "/" if slug == "home" else f"/{slug}",
                    "stage": "draft",
                    "navigation": {"label": title, "visible": False},
                    "hero": {
                        "eyebrow": "",
                        "headline": str(values["headline"]),
                        "summary": "",
                        "ctaLabel": "Contact" if contact_url else "",
                        "ctaHref": contact_url,
                    },
                    "sections": [
                        {
                            "id": f"section-import-{index}",
                            "eyebrow": "",
                            "title": title,
                            "body": str(values["body"]),
                        }
                    ],
                    "seo": {"title": title, "description": ""},
                    "updatedAt": "server-assigned",
                }
            )
    except (KeyError, TypeError, ValueError) as exc:
        raise _error(422, "client_import_activation_invalid") from exc
    return {
        "state": {
            "schema": "supermega.website.workspace.v2",
            "version": 2,
            "revision": 0,
            "contentRevision": 0,
            "siteName": workspace,
            "pages": pages,
            "selectedPageId": pages[0]["id"],
            "evidence": [],
            "approvals": [],
            "localPublishes": [],
            "events": [],
            "openingPlan": {
                "contract": "supermega.website.opening-plan.v1",
                "packageDigest": package_digest,
                "workflowTemplateId": package["workflowTemplateId"],
                "confirmedAt": "server-assigned",
                "pageIds": [page["id"] for page in pages],
            },
        },
        "evidence": {
            "actionId": f"ACT-IMPORT-{command_id}",
            "capturedAt": "server-assigned",
            "actor": actor_id,
            "reason": "Initialize Website drafts from the reviewed page import.",
            "evidenceReference": package_digest,
        },
    }


def _ecommerce_merchandising_import_payload(
    package: Mapping[str, Any],
    *,
    actor_id: str,
    command_id: UUID,
    package_digest: str,
) -> dict[str, Any]:
    return {
        "commandId": str(command_id),
        "package": package,
        "evidence": {
            "actionId": f"ACT-IMPORT-{command_id}",
            "capturedAt": "server-assigned",
            "actor": actor_id,
            "reason": "Apply the reviewed Ecommerce merchandising import.",
            "evidenceReference": package_digest,
        },
    }


_CLIENT_IMPORT_APPLY_PREFLIGHT_CONTRACT = "supermega.client_import_apply_preflight.v1"
_CLIENT_IMPORT_APPLY_PREFLIGHT_CHECKS = (
    "trusted_managed_identity",
    "human_actor",
    "setup_write_capability",
    "product_write_capability",
    "package_digest_bound",
    "current_revision_bound",
    "atomic_adapter_ready",
)


def _client_import_apply_preflight_digest(
    *,
    principal: TrialPrincipal,
    validation: Any,
    expected_version: int,
) -> str:
    projection = [
        _CLIENT_IMPORT_APPLY_PREFLIGHT_CONTRACT,
        1,
        principal.workspace_id,
        principal.actor_id,
        validation.product,
        validation.object_id,
        validation.workflow_template_id,
        validation.target_surface,
        validation.required_capability,
        validation.package_digest,
        validation.row_count,
        expected_version,
    ]
    canonical = json.dumps(
        projection,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return f"sha256:{sha256(canonical).hexdigest()}"


def _client_import_apply_preflight(
    *,
    principal: TrialPrincipal,
    validation: Any,
    package: Mapping[str, Any],
    expected_version: int,
    current_state: Any,
) -> dict[str, Any]:
    if validation.product not in {"commerce", "production", "website", "ecommerce"}:
        raise _error(
            409,
            "client_import_activation_not_ready",
            product=validation.product,
        )
    if current_state.surface != validation.target_surface:
        raise _error(409, "client_import_preflight_surface_mismatch")
    if current_state.version != expected_version:
        raise _error(
            409,
            "trial_version_conflict",
            expected_version=expected_version,
            current_version=current_state.version,
        )
    if validation.product == "ecommerce":
        if expected_version < 1:
            raise _error(409, "client_import_activation_not_ready", product="ecommerce")
        try:
            commerce_state = validate_commerce_state(current_state.state)
            configuration = commerce_state.get("storefrontConfiguration")
            current_skus = {item["sku"] for item in commerce_state["items"]}
            rows = package.get("rows")
            if (
                not isinstance(configuration, Mapping)
                or not isinstance(rows, list)
                or not rows
                or any(
                    not isinstance(row, Mapping)
                    or not isinstance(row.get("values"), Mapping)
                    or row["values"].get("sku") not in current_skus
                    for row in rows
                )
            ):
                raise ValueError("missing Ecommerce prerequisite")
        except (KeyError, TypeError, TrialValidationError, ValueError) as exc:
            raise _error(409, "client_import_activation_not_ready", product="ecommerce") from exc
    elif expected_version != 0:
        raise _error(
            409,
            "client_import_activation_not_ready",
            product=validation.product,
        )
    return {
        "contract": _CLIENT_IMPORT_APPLY_PREFLIGHT_CONTRACT,
        "status": "ready_for_owner_confirmation",
        "workspace_id": principal.workspace_id,
        "actor_id": principal.actor_id,
        "product": validation.product,
        "object": validation.object_id,
        "workflow_template_id": validation.workflow_template_id,
        "target_surface": validation.target_surface,
        "required_capability": validation.required_capability,
        "package_digest": validation.package_digest,
        "row_count": validation.row_count,
        "expected_version": expected_version,
        "current_version": current_state.version,
        "preflight_digest": _client_import_apply_preflight_digest(
            principal=principal,
            validation=validation,
            expected_version=expected_version,
        ),
        "confirmation": f"APPLY {validation.package_digest}",
        "checks": list(_CLIENT_IMPORT_APPLY_PREFLIGHT_CHECKS),
        "external_writes_performed": False,
        "next_step": (
            "The named human may submit one idempotent managed import using this exact package, revision, identity, and preflight receipt."
        ),
    }


def _website_source_identity(value: object) -> tuple[str, str, str, str] | None:
    if not isinstance(value, Mapping):
        return None
    fields = ("fingerprint", "approvalId", "snapshotId", "pageId")
    identity: list[str] = []
    for field in fields:
        item = value.get(field)
        if not isinstance(item, str) or not item:
            return None
        identity.append(item)
    return identity[0], identity[1], identity[2], identity[3]


def _commerce_retains_website_source(commerce_state: object, source: object) -> bool:
    source_identity = _website_source_identity(source)
    if source_identity is None or not isinstance(commerce_state, Mapping):
        return False
    intakes = commerce_state.get("websiteIntakes", [])
    if not isinstance(intakes, list):
        return False
    return any(
        isinstance(intake, Mapping)
        and isinstance(intake.get("source"), Mapping)
        and _website_source_identity(intake.get("source")) == source_identity
        and intake.get("source") == source
        for intake in intakes
    )


def _order_intake_catalog(commerce_state: object) -> list[OrderIntakeCatalogItem]:
    if not isinstance(commerce_state, Mapping):
        raise _error(409, "order_intake_catalog_unavailable")
    items = commerce_state.get("items")
    if not isinstance(items, list) or not items:
        raise _error(409, "order_intake_catalog_unavailable")
    if len(items) > MAX_ORDER_INTAKE_CATALOG_ITEMS:
        raise _error(
            409,
            "order_intake_catalog_too_large",
            maximum_items=MAX_ORDER_INTAKE_CATALOG_ITEMS,
        )
    if any(not isinstance(item, Mapping) for item in items):
        raise _error(409, "order_intake_catalog_invalid")
    try:
        return [
            OrderIntakeCatalogItem(
                sku=item["sku"],
                name=item["name"],
                variant=item.get("variant"),
                on_hand=item["onHand"],
                unit_price_mmk=item["price"],
            )
            for item in items
        ]
    except (KeyError, ValidationError) as exc:
        raise _error(409, "order_intake_catalog_invalid") from exc


def create_trial_router(
    *,
    store: TrialStore,
    resolve_principal: PrincipalResolver,
    resolve_signup_session: SignupSessionResolver | None = None,
    order_intake_provider: OrderIntakeDraftProvider | None = None,
    send_welcome_email: WelcomeEmailSender | None = None,
    current_date: DateResolver = _current_yangon_date,
) -> APIRouter:
    """Create an unwired private-trial router with injected storage and auth.

    ``resolve_principal`` must validate a server-side session or token and return
    its workspace and actor. This module never accepts either identity from a
    request body and never holds a browser-facing Supabase credential.

    ``resolve_signup_session`` authenticates self-serve tenant creation, the one
    route whose caller has no workspace yet. It must confirm the named user and
    the email-verification state through trusted server-side wiring; without it
    the tenant-creation endpoint answers 503.
    """

    router = APIRouter(prefix=TRIAL_API_PREFIX, tags=["private-trial"])

    @router.post("/workspaces")
    async def trial_self_serve_workspace(request: Request) -> dict[str, Any]:
        # Fail-closed service gate FIRST: until the founder opens the
        # activation window the endpoint is dark for every caller, before any
        # auth, parsing, or storage work happens (spec section 4).
        if not self_serve_activation_window_open():
            raise _error(503, "activation_window_closed")
        if resolve_signup_session is None:
            raise _error(503, "trial_auth_unavailable")
        try:
            session = resolve_signup_session(request)
        except HTTPException:
            raise
        except Exception as exc:
            raise _error(503, "trial_auth_unavailable") from exc
        if session is None:
            raise _error(401, "trial_auth_required")
        if not isinstance(session, TrialSignupSession) or not str(session.actor_id or "").strip():
            raise _error(503, "trial_auth_unavailable")
        if not session.email_verified:
            raise _error(403, "email_verification_required")
        raw_body = await _bounded_json_body(request, maximum_bytes=4096)
        try:
            body = TrialSelfServeWorkspaceRequest.model_validate(raw_body)
        except ValidationError as exc:
            raise _error(422, "self_serve_request_invalid") from exc
        try:
            claim_code = validate_self_serve_claim_code(body.claimCode)
        except TrialValidationError as exc:
            raise _error(422, "claim_code_invalid") from exc
        try:
            business_name = validate_self_serve_business_name(body.businessName)
        except TrialValidationError as exc:
            raise _error(422, "business_name_invalid") from exc
        result = _invoke(
            lambda: store.create_self_serve_workspace(
                actor_id=session.actor_id,
                claim_code=claim_code,
                business_name=business_name,
                product=body.product,
                session_id=session.session_id,
                identity_provider=session.identity_provider,
            )
        )
        if (
            send_welcome_email is not None
            and not result.idempotent_replay
            and str(getattr(session, "email", "") or "").strip()
        ):
            # Courtesy send, strictly after the durable write and strictly
            # unable to change the outcome: the sender returns a bool and any
            # unexpected exception is swallowed here. Replays never send.
            try:
                send_welcome_email(
                    to_email=session.email,
                    business_name=result.label,
                    workspace_id=result.workspace_id,
                    claim_code=result.claim_code,
                )
            except Exception:  # noqa: BLE001 - the tenant exists; email is best-effort
                pass
        return {
            "contract": SELF_SERVE_ACTIVATION_CONTRACT,
            "status": "already_created" if result.idempotent_replay else "created",
            "workspace": {
                "workspace_id": result.workspace_id,
                "label": result.label,
                "access": result.access,
                "product": body.product,
            },
            "claim": {
                "claimCode": result.claim_code,
                "workspaceId": result.workspace_id,
            },
            "created_at": result.created_at,
            "idempotent_replay": result.idempotent_replay,
            "external_writes_performed": not result.idempotent_replay,
            "secret_values_exposed": False,
        }

    @router.get("/readiness")
    def trial_readiness(request: Request) -> dict[str, Any]:
        principal = _resolve_principal(request, resolve_principal)
        return _readiness(store, principal).to_dict()

    @router.get("/bootstrap")
    def trial_bootstrap(request: Request) -> dict[str, Any]:
        principal = _resolve_principal(request, resolve_principal)
        readiness = _readiness(store, principal)
        _require_read_ready(readiness)
        states = {
            surface: _invoke(lambda surface=surface: store.get_state(principal, surface)).to_dict()
            for surface in TRIAL_SURFACE_ORDER
            if has_surface_read_capability(readiness.capabilities, surface)
        }
        approvals = (
            _invoke(lambda: store.list_approvals(principal))
            if has_approval_read_capability(readiness.capabilities)
            else []
        )
        return {
            "identity": {
                "workspace_id": principal.workspace_id,
                "actor_id": principal.actor_id,
                "actor_kind": principal.actor_kind,
            },
            "readiness": readiness.to_dict(),
            "states": states,
            "approvals": [approval.to_dict() for approval in approvals],
        }

    @router.post("/company-brief")
    def trial_company_brief(request: Request, body: TrialCompanyBriefRequest) -> dict[str, Any]:
        principal = _resolve_principal(request, resolve_principal)
        readiness = _readiness(store, principal)
        _require_read_ready(readiness)
        states, approvals, company_version = _company_brief_context(store, principal, readiness)
        brief = _invoke(
            lambda: build_managed_company_brief(
                workspace_id=principal.workspace_id,
                intent=body.intent,
                states=states,
                approvals=approvals,
            )
        )
        return {
            "brief": {**brief, "companyVersion": company_version},
            "identity": {
                "workspace_id": principal.workspace_id,
                "actor_id": principal.actor_id,
                "actor_kind": principal.actor_kind,
            },
        }

    @router.post("/company-brief/receipts")
    def trial_company_brief_receipt(
        request: Request,
        body: TrialCompanyBriefReceiptRequest,
    ) -> dict[str, Any]:
        principal = _resolve_principal(request, resolve_principal)
        if principal.actor_kind != "human":
            raise _error(403, "trial_human_approval_required")
        readiness = _readiness(store, principal)
        _require_write_ready(readiness, "company.write")
        if "company.baseline.approve" not in readiness.capabilities:
            raise _error(
                403,
                "trial_capability_required",
                required_capability="company.baseline.approve",
            )
        states, approvals, _ = _company_brief_context(store, principal, readiness)
        company = states["company"]
        brief = _invoke(
            lambda: build_managed_company_brief(
                workspace_id=principal.workspace_id,
                intent=body.intent,
                states=states,
                approvals=approvals,
            )
        )
        if body.brief_digest != brief["briefDigest"]:
            raise _error(409, "company_brief_changed")
        receipt = company_brief_receipt(brief)
        next_company = _invoke(lambda: company_state_with_receipt(company.state, receipt))
        source_versions = brief["sourceVersions"]
        related_surfaces = tuple(str(source["surface"]) for source in source_versions)
        expected_related_versions = {
            str(source["surface"]): int(source["version"])
            for source in source_versions
        }
        if next_company == company.state and body.expected_company_version == company.version:
            return {
                "brief": {
                    **brief,
                    "companyVersion": company.version,
                    "retention": "persisted_managed_audit",
                },
                "retention": {
                    "contract": "supermega.managed_company_brief_retention.v1",
                    "status": "already_retained",
                    "briefDigest": brief["briefDigest"],
                    "internalWritePerformed": False,
                    "externalWritesPerformed": False,
                    "idempotentReplay": True,
                },
                "identity": {
                    "workspace_id": principal.workspace_id,
                    "actor_id": principal.actor_id,
                    "actor_kind": principal.actor_kind,
                },
            }

        def require_same_brief_sources(
            current_company: Mapping[str, Any],
            related_states: Mapping[str, Mapping[str, Any]],
        ) -> None:
            if current_company != company.state:
                raise TrialValidationError("Company brief history changed before retention.")
            assert_brief_sources_unchanged(
                source_versions,
                related_states,
                workspace_id=principal.workspace_id,
            )

        result = _invoke(
            lambda: store.apply_command(
                principal,
                command_id=body.command_id,
                surface="company",
                event_type="company.snapshot.saved",
                expected_version=body.expected_company_version,
                payload={"state": next_company},
                related_surfaces=related_surfaces,
                expected_related_versions=expected_related_versions,
                state_precondition=require_same_brief_sources,
            )
        )
        if result.idempotent_replay:
            return {
                "brief": {
                    **brief,
                    "companyVersion": result.version,
                    "retention": "persisted_managed_audit",
                },
                "retention": {
                    "contract": "supermega.managed_company_brief_retention.v1",
                    "status": "already_retained",
                    "briefDigest": brief["briefDigest"],
                    "internalWritePerformed": False,
                    "externalWritesPerformed": False,
                    "idempotentReplay": True,
                },
                "identity": {
                    "workspace_id": principal.workspace_id,
                    "actor_id": principal.actor_id,
                    "actor_kind": principal.actor_kind,
                },
            }
        return {
            "brief": {
                **brief,
                "companyVersion": result.version,
                "retention": "persisted_managed_audit",
            },
            "retention": {
                "contract": "supermega.managed_company_brief_retention.v1",
                "status": "retained",
                "briefDigest": brief["briefDigest"],
                "internalWritePerformed": True,
                "externalWritesPerformed": False,
                "idempotentReplay": result.idempotent_replay,
            },
            "identity": {
                "workspace_id": principal.workspace_id,
                "actor_id": principal.actor_id,
                "actor_kind": principal.actor_kind,
            },
            **_command_response(result),
        }

    @router.get("/owner-control")
    def trial_owner_control(request: Request) -> dict[str, Any]:
        principal = _resolve_principal(request, resolve_principal)
        readiness = _readiness(store, principal)
        _require_read_ready(readiness)
        states, _, company_version = _company_brief_context(store, principal, readiness)
        run = _invoke(
            lambda: build_managed_owner_control_run(
                workspace_id=principal.workspace_id,
                states=states,
            )
        )
        return {
            "run": {**run, "companyVersion": company_version},
            "identity": {
                "workspace_id": principal.workspace_id,
                "actor_id": principal.actor_id,
                "actor_kind": principal.actor_kind,
            },
        }

    @router.post("/owner-control/acknowledgements")
    def trial_owner_control_acknowledgement(
        request: Request,
        body: TrialOwnerControlAcknowledgementRequest,
    ) -> dict[str, Any]:
        principal = _resolve_principal(request, resolve_principal)
        if principal.actor_kind != "human":
            raise _error(403, "trial_human_approval_required")
        readiness = _readiness(store, principal)
        _require_write_ready(readiness, "company.write")
        if "company.control.approve" not in readiness.capabilities:
            raise _error(
                403,
                "trial_capability_required",
                required_capability="company.control.approve",
            )
        states, _, _ = _company_brief_context(store, principal, readiness)
        company = states.get("company")
        if company is None:
            raise _error(403, "trial_capability_required", required_capability="company.read")
        run = _invoke(
            lambda: build_managed_owner_control_run(
                workspace_id=principal.workspace_id,
                states=states,
            )
        )
        if body.run_digest != run["runDigest"]:
            raise _error(409, "owner_control_changed")
        selected = next(
            (
                item
                for item in run["items"]
                if isinstance(item, Mapping) and item.get("itemId") == body.item_id
            ),
            None,
        )
        if selected is None:
            raise _error(409, "owner_control_item_changed")
        if selected["status"] != "pending":
            return {
                "run": {**run, "companyVersion": company.version},
                "retention": {
                    "contract": "supermega.managed_owner_control_retention.v1",
                    "status": "already_acknowledged",
                    "runDigest": run["runDigest"],
                    "itemId": body.item_id,
                    "companyVersion": company.version,
                    "internalWritePerformed": False,
                    "externalWritesPerformed": False,
                    "idempotentReplay": True,
                },
                "identity": {
                    "workspace_id": principal.workspace_id,
                    "actor_id": principal.actor_id,
                    "actor_kind": principal.actor_kind,
                },
            }
        acknowledgement = _invoke(
            lambda: owner_control_acknowledgement(
                run,
                item_id=body.item_id,
                retained_by=principal.actor_id,
            )
        )
        next_company = _invoke(
            lambda: company_state_with_owner_control_acknowledgement(company.state, acknowledgement)
        )
        source_versions = run["sourceVersions"]
        related_surfaces = tuple(str(source["surface"]) for source in source_versions)
        expected_related_versions = {
            str(source["surface"]): int(source["version"])
            for source in source_versions
        }

        def require_same_owner_control_sources(
            current_company: Mapping[str, Any],
            related_states: Mapping[str, Mapping[str, Any]],
        ) -> None:
            if current_company != company.state:
                raise TrialValidationError("Owner control history changed before acknowledgement.")
            assert_owner_control_sources_unchanged(
                run,
                related_states,
                workspace_id=principal.workspace_id,
            )

        result = _invoke(
            lambda: store.apply_command(
                principal,
                command_id=body.command_id,
                surface="company",
                event_type="company.snapshot.saved",
                expected_version=body.expected_company_version,
                payload={"state": next_company},
                related_surfaces=related_surfaces,
                expected_related_versions=expected_related_versions,
                state_precondition=require_same_owner_control_sources,
            )
        )
        updated_states = {
            **states,
            "company": TrialState(
                principal.workspace_id,
                "company",
                result.version,
                result.state,
                principal.actor_id,
            ),
        }
        updated_run = _invoke(
            lambda: build_managed_owner_control_run(
                workspace_id=principal.workspace_id,
                states=updated_states,
            )
        )
        return {
            "run": {**updated_run, "companyVersion": result.version},
            "retention": {
                "contract": "supermega.managed_owner_control_retention.v1",
                "status": "already_acknowledged" if result.idempotent_replay else "acknowledged",
                "runDigest": run["runDigest"],
                "itemId": body.item_id,
                "companyVersion": result.version,
                "internalWritePerformed": not result.idempotent_replay,
                "externalWritesPerformed": False,
                "idempotentReplay": result.idempotent_replay,
            },
            "identity": {
                "workspace_id": principal.workspace_id,
                "actor_id": principal.actor_id,
                "actor_kind": principal.actor_kind,
            },
        }

    @router.post("/managed-context/validate")
    def trial_managed_context_validate(
        request: Request,
        body: TrialManagedContextValidateRequest,
    ) -> dict[str, Any]:
        principal = _resolve_principal(request, resolve_principal)
        if principal.actor_kind != "human":
            raise _error(403, "trial_human_approval_required")
        readiness = _readiness(store, principal)
        _require_read_ready(readiness)
        if "company.write" not in readiness.capabilities:
            raise _error(403, "trial_capability_required", required_capability="company.write")
        profile = _invoke(
            lambda: build_managed_context_profile(
                body.package,
                workspace_id=principal.workspace_id,
                actor_id=principal.actor_id,
            )
        )
        company = _invoke(lambda: store.get_state(principal, "company"))
        validation_digest = _invoke(
            lambda: managed_context_validation_digest(
                str(profile["profileDigest"]),
                workspace_id=principal.workspace_id,
                actor_id=principal.actor_id,
                company_version=company.version,
            )
        )
        return {
            "profile": profile,
            "validation": {
                "contract": MANAGED_CONTEXT_VALIDATION_CONTRACT,
                "status": "ready_for_owner_confirmation",
                "profileDigest": profile["profileDigest"],
                "companyVersion": company.version,
                "validationDigest": validation_digest,
                "internalWritePerformed": False,
                "externalWritesPerformed": False,
            },
            "identity": {
                "workspace_id": principal.workspace_id,
                "actor_id": principal.actor_id,
                "actor_kind": principal.actor_kind,
            },
            "secretValuesExposed": False,
        }

    @router.post("/managed-context/retain")
    def trial_managed_context_retain(
        request: Request,
        body: TrialManagedContextRetainRequest,
    ) -> dict[str, Any]:
        principal = _resolve_principal(request, resolve_principal)
        if principal.actor_kind != "human":
            raise _error(403, "trial_human_approval_required")
        readiness = _readiness(store, principal)
        _require_write_ready(readiness, "company.write")
        if "company.control.approve" not in readiness.capabilities:
            raise _error(
                403,
                "trial_capability_required",
                required_capability="company.control.approve",
            )
        profile = _invoke(
            lambda: build_managed_context_profile(
                body.package,
                workspace_id=principal.workspace_id,
                actor_id=principal.actor_id,
            )
        )
        if body.profile_digest != profile["profileDigest"]:
            raise _error(409, "managed_context_profile_changed")
        company = _invoke(lambda: store.get_state(principal, "company"))
        expected_validation_digest = _invoke(
            lambda: managed_context_validation_digest(
                str(profile["profileDigest"]),
                workspace_id=principal.workspace_id,
                actor_id=principal.actor_id,
                company_version=body.expected_company_version,
            )
        )
        if body.validation_digest != expected_validation_digest:
            raise _error(409, "managed_context_validation_changed")
        next_company = _invoke(lambda: company_state_with_context_profile(company.state, profile))
        result = _invoke(
            lambda: store.apply_command(
                principal,
                command_id=body.command_id,
                surface="company",
                event_type="company.snapshot.saved",
                expected_version=body.expected_company_version,
                payload={"state": next_company},
            )
        )
        return {
            "profile": profile,
            "retention": {
                "contract": MANAGED_CONTEXT_RETENTION_CONTRACT,
                "status": "retained",
                "profileDigest": profile["profileDigest"],
                "companyVersion": result.version,
                "internalWritePerformed": True,
                "externalWritesPerformed": False,
                "idempotentReplay": result.idempotent_replay,
            },
            "identity": {
                "workspace_id": principal.workspace_id,
                "actor_id": principal.actor_id,
                "actor_kind": principal.actor_kind,
            },
            "secretValuesExposed": False,
            **_command_response(result),
        }

    @router.post("/commerce/order-intake/drafts")
    async def trial_order_intake_draft(request: Request) -> dict[str, Any]:
        principal = _resolve_principal(request, resolve_principal)
        readiness = _readiness(store, principal)
        _require_read_ready(readiness)
        if not has_surface_read_capability(readiness.capabilities, "commerce"):
            raise _error(
                403,
                "trial_capability_required",
                required_capability="commerce.read",
            )
        if principal.actor_kind != "human":
            raise _error(403, "trial_human_approval_required")
        if order_intake_provider is None:
            raise _error(503, "order_intake_provider_not_configured")
        raw_body = await _bounded_json_body(
            request,
            maximum_bytes=MAX_ORDER_MESSAGE_LENGTH + 512,
        )
        try:
            body = TrialOrderIntakeDraftRequest.model_validate(raw_body)
        except ValidationError as exc:
            raise _error(422, "order_intake_request_invalid") from exc
        commerce = _invoke(lambda: store.get_state(principal, "commerce"))
        catalog = _order_intake_catalog(commerce.state)
        try:
            draft = await order_intake_provider.generate(
                message=body.message,
                catalog=catalog,
                workspace_id=principal.workspace_id,
                actor_id=principal.actor_id,
            )
        except OrderIntakeProviderError as exc:
            status_code = 503
            if exc.code == "order_intake_company_budget_reached":
                status_code = 429
            elif exc.code in {
                "order_intake_catalog_empty",
                "order_intake_catalog_invalid",
                "order_intake_catalog_too_large",
            }:
                status_code = 409
            elif exc.code == "order_intake_provider_refused":
                status_code = 422
            raise _error(status_code, exc.code) from exc
        return {
            "draft": draft.model_dump(mode="json"),
            "source_label_digest": (
                f"sha256:{sha256(body.source_label.encode('utf-8')).hexdigest()}"
            ),
        }

    @router.get("/commerce/service-schedule")
    def trial_service_schedule(request: Request) -> dict[str, Any]:
        principal = _resolve_principal(request, resolve_principal)
        readiness = _readiness(store, principal)
        _require_read_ready(readiness)
        if not has_surface_read_capability(readiness.capabilities, "commerce"):
            raise _error(
                403,
                "trial_capability_required",
                required_capability="commerce.read",
            )
        commerce = _invoke(lambda: store.get_state(principal, "commerce"))
        if not commerce.state:
            raise _error(409, "commerce_workspace_required")
        state = _invoke(lambda: validate_commerce_state(commerce.state))
        return {
            "workspace_id": principal.workspace_id,
            "version": commerce.version,
            "privacy_owner": bool(
                readiness.capabilities.intersection(
                    {"company.control.approve", "company.write"}
                )
            ),
            "schedule": deepcopy(state.get("serviceSchedule")),
        }

    @router.post("/commerce/service-schedule")
    async def trial_service_schedule_save(request: Request) -> dict[str, Any]:
        principal = _resolve_principal(request, resolve_principal)
        readiness = _readiness(store, principal)
        _require_write_ready(readiness, "commerce.write")
        if principal.actor_kind != "human":
            raise _error(403, "trial_human_approval_required")
        raw_body = await _bounded_json_body(request, maximum_bytes=64 * 1024)
        try:
            body = TrialServiceScheduleSaveRequest.model_validate(raw_body)
        except ValidationError as exc:
            raise _error(422, "service_schedule_request_invalid") from exc
        _reject_client_identity(body.schedule, path="schedule")
        commerce = _invoke(lambda: store.get_state(principal, "commerce"))
        if not commerce.state:
            raise _error(409, "commerce_workspace_required")
        current_state = _invoke(lambda: validate_commerce_state(commerce.state))
        schedule = deepcopy(body.schedule)
        events = schedule.get("events")
        revision = schedule.get("revision")
        initializing = (
            revision == 0
            and events == []
        )
        if initializing:
            pack_id = schedule.get("industryPackId")
            event_type = "commerce.service_schedule.initialized"
            evidence = {
                "actionId": f"ACT-SERVICE-SCHEDULE-INIT-{str(pack_id).upper()}",
                "capturedAt": body.captured_at,
                "actor": principal.actor_id,
                "reason": f"Initialize the reviewed {pack_id} Shop industry pack.",
                "evidenceReference": f"SHOP-SERVICE-SCHEDULE:{pack_id}:R0",
            }
        elif (
            not isinstance(events, list)
            or not events
            or not isinstance(revision, int)
            or isinstance(revision, bool)
            or revision < 1
            or not isinstance(events[-1], Mapping)
        ):
            raise _error(422, "service_schedule_evidence_required")
        else:
            latest_event = dict(events[-1])
            latest_event["actor"] = principal.actor_id
            if latest_event.get("type") in _SPA_OWNER_SCHEDULE_EVENTS:
                latest_event["happenedAt"] = _current_utc_timestamp()
            events[-1] = latest_event
            if latest_event.get("type") == "client_retention_set":
                privacy_policy = schedule.get("privacyPolicy")
                if isinstance(privacy_policy, Mapping):
                    schedule["privacyPolicy"] = {
                        **dict(privacy_policy),
                        "updatedAt": latest_event["happenedAt"],
                        "updatedBy": principal.actor_id,
                    }
            elif latest_event.get("type") == "client_anonymized":
                subject_id = latest_event.get("subjectId")
                clients = schedule.get("clients")
                if isinstance(clients, list):
                    schedule["clients"] = [
                        {
                            **dict(client),
                            "updatedAt": latest_event["happenedAt"],
                            "anonymizedAt": latest_event["happenedAt"],
                            "anonymizedBy": principal.actor_id,
                        }
                        if isinstance(client, Mapping)
                        and client.get("id") == subject_id
                        and "anonymizedAt" in client
                        else client
                        for client in clients
                    ]
                bookings = schedule.get("bookings")
                if isinstance(bookings, list):
                    schedule["bookings"] = [
                        {
                            **dict(booking),
                            "updatedAt": latest_event["happenedAt"],
                        }
                        if isinstance(booking, Mapping)
                        and booking.get("clientId") == subject_id
                        else booking
                        for booking in bookings
                    ]
            event_type = "commerce.service_schedule.saved"
            evidence = {
                "actionId": f"ACT-SERVICE-SCHEDULE-R{revision}",
                "capturedAt": latest_event.get("happenedAt"),
                "actor": principal.actor_id,
                "reason": latest_event.get("reason"),
                "evidenceReference": f"SHOP-SERVICE-SCHEDULE:R{revision}",
            }
        next_state = {**current_state, "serviceSchedule": schedule}
        _require_spa_owner_schedule_action(readiness, next_state)
        result = _invoke(
            lambda: store.apply_command(
                principal,
                command_id=body.command_id,
                surface="commerce",
                event_type=event_type,
                expected_version=body.expected_version,
                payload={"state": next_state, "evidence": evidence},
            )
        )
        return _command_response(result)

    @router.post("/imports/validate")
    async def trial_import_validation(request: Request) -> dict[str, Any]:
        principal = _resolve_principal(request, resolve_principal)
        readiness = _readiness(store, principal)
        _require_read_ready(readiness)
        if not has_surface_read_capability(readiness.capabilities, "setup"):
            raise _error(
                403,
                "trial_capability_required",
                required_capability="setup.read",
            )
        package = await _bounded_json_body(request)
        try:
            validation = validate_client_import_staging_package(
                package,
                minimum_production_due_date=current_date(),
            )
        except ClientImportValidationError as exc:
            raise _error(
                422,
                "client_import_validation_error",
                message=str(exc),
            ) from exc
        return {
            "validation": {
                **validation.to_dict(),
                "workspace_id": principal.workspace_id,
            }
        }

    @router.post("/imports/apply-preflight")
    async def trial_import_apply_preflight(request: Request) -> dict[str, Any]:
        principal = _resolve_principal(request, resolve_principal)
        readiness = _readiness(store, principal)
        _require_write_ready(readiness, "setup.write")
        if principal.actor_kind != "human":
            raise _error(403, "trial_human_approval_required")
        raw_body = await _bounded_json_body(
            request,
            maximum_bytes=CLIENT_IMPORT_MAX_PACKAGE_BYTES + 1024,
        )
        try:
            body = TrialClientImportApplyPreflightRequest.model_validate(raw_body)
        except ValidationError as exc:
            raise _error(422, "client_import_apply_preflight_invalid") from exc
        try:
            validation = validate_client_import_staging_package(body.package)
        except ClientImportValidationError as exc:
            raise _error(
                422,
                "client_import_validation_error",
                message=str(exc),
            ) from exc
        _require_write_ready(readiness, validation.required_capability)
        current_state = _invoke(
            lambda: store.get_state(principal, validation.target_surface)
        )
        preflight = _client_import_apply_preflight(
            principal=principal,
            validation=validation,
            package=body.package,
            expected_version=body.expected_version,
            current_state=current_state,
        )
        return {
            "preflight": preflight,
            "identity_authority": "trusted_managed_identity",
            "external_writes_performed": False,
            "secret_values_exposed": False,
        }

    @router.post("/imports/plant-equipment/validate")
    async def trial_plant_equipment_validation(request: Request) -> dict[str, Any]:
        principal = _resolve_principal(request, resolve_principal)
        readiness = _readiness(store, principal)
        _require_read_ready(readiness)
        if not has_surface_read_capability(readiness.capabilities, "setup"):
            raise _error(
                403,
                "trial_capability_required",
                required_capability="setup.read",
            )
        package = await _bounded_json_body(
            request,
            maximum_bytes=PLANT_EQUIPMENT_MAX_PACKAGE_BYTES,
        )
        try:
            validation, _ = validate_plant_equipment_import(package)
        except PlantEquipmentImportError as exc:
            raise _error(
                422,
                "plant_equipment_import_validation_error",
                message=str(exc),
            ) from exc
        return {
            "validation": {
                **validation.to_dict(),
                "workspace_id": principal.workspace_id,
            }
        }

    @router.post("/imports/plant-equipment/apply")
    async def trial_plant_equipment_apply(request: Request) -> dict[str, Any]:
        principal = _resolve_principal(request, resolve_principal)
        readiness = _readiness(store, principal)
        _require_write_ready(readiness, "setup.write")
        if principal.actor_kind != "human":
            raise _error(403, "trial_human_approval_required")
        raw_body = await _bounded_json_body(
            request,
            maximum_bytes=PLANT_EQUIPMENT_MAX_PACKAGE_BYTES + 2048,
        )
        try:
            body = TrialPlantEquipmentImportApplyRequest.model_validate(raw_body)
        except ValidationError as exc:
            raise _error(422, "plant_equipment_import_apply_invalid") from exc
        try:
            validation, package = validate_plant_equipment_import(body.package)
        except PlantEquipmentImportError as exc:
            raise _error(
                422,
                "plant_equipment_import_validation_error",
                message=str(exc),
            ) from exc
        _require_write_ready(readiness, "production.write")
        if body.confirmation != f"APPLY {validation.package_digest}":
            raise _error(409, "plant_equipment_import_confirmation_mismatch")
        command_id = str(body.command_id)
        result = _invoke(
            lambda: store.apply_command(
                principal,
                command_id=command_id,
                surface="production",
                event_type="production.equipment_master.imported",
                expected_version=body.expected_version,
                payload={
                    "equipment": [
                        {
                            "id": row["values"]["equipmentId"],
                            "name": row["values"]["name"],
                            "workCentreId": row["values"]["workCentreId"],
                            "criticality": row["values"]["criticality"],
                            "owner": package["owner"],
                        }
                        for row in package["rows"]
                    ],
                    "evidence": {
                        "actionId": f"ACT-EQUIPMENT-IMPORT-{command_id}",
                        "capturedAt": "server-assigned",
                        "actor": principal.actor_id,
                        "reason": "Imported reviewed Plant equipment master",
                        "evidenceReference": validation.package_digest,
                    },
                },
            )
        )
        return {
            "activation": {
                "contract": "supermega.production.equipment-import-activation.v1",
                "status": "applied",
                "package_digest": validation.package_digest,
                "row_count": validation.row_count,
                "workspace_id": principal.workspace_id,
                "external_writes_performed": True,
                "commissioning_performed": False,
            },
            **_command_response(result),
        }

    @router.post("/production/equipment/commission")
    async def trial_plant_equipment_commission(request: Request) -> dict[str, Any]:
        principal = _resolve_principal(request, resolve_principal)
        readiness = _readiness(store, principal)
        _require_write_ready(readiness, "production.write")
        if principal.actor_kind != "human":
            raise _error(403, "trial_human_approval_required")
        raw_body = await _bounded_json_body(request, maximum_bytes=4096)
        try:
            body = TrialPlantEquipmentCommissionRequest.model_validate(raw_body)
        except ValidationError as exc:
            raise _error(422, "plant_equipment_commission_invalid") from exc
        if body.confirmation != f"COMMISSION {body.equipment_id}":
            raise _error(409, "plant_equipment_commission_confirmation_mismatch")
        command_id = str(body.command_id)
        result = _invoke(
            lambda: store.apply_command(
                principal,
                command_id=command_id,
                surface="production",
                event_type="production.equipment.commissioned",
                expected_version=body.expected_version,
                payload={
                    "equipmentId": body.equipment_id,
                    "installedAt": body.installed_at,
                    "initialState": body.initial_state,
                    "safetyBaselineReference": body.safety_baseline_reference,
                    "evidence": {
                        "actionId": f"ACT-EQUIPMENT-COMMISSION-{command_id}",
                        "capturedAt": "server-assigned",
                        "actor": principal.actor_id,
                        "reason": "Commissioned reviewed Plant equipment",
                        "evidenceReference": body.safety_baseline_reference,
                    },
                },
            )
        )
        return {
            "commissioning": {
                "contract": "supermega.production.equipment-commissioning.v1",
                "status": "commissioned",
                "equipment_id": body.equipment_id,
                "workspace_id": principal.workspace_id,
                "runtime_machine_created": True,
                "equipment_command_performed": False,
                "telemetry_connected": False,
                "bulk_commissioning_performed": False,
            },
            **_command_response(result),
        }

    @router.post("/production/equipment/maintenance-strategy")
    async def trial_plant_equipment_maintenance_strategy(
        request: Request,
    ) -> dict[str, Any]:
        principal = _resolve_principal(request, resolve_principal)
        readiness = _readiness(store, principal)
        _require_write_ready(readiness, "production.write")
        if principal.actor_kind != "human":
            raise _error(403, "trial_human_approval_required")
        raw_body = await _bounded_json_body(request, maximum_bytes=6144)
        try:
            body = TrialPlantEquipmentMaintenanceStrategyRequest.model_validate(
                raw_body
            )
        except ValidationError as exc:
            raise _error(422, "plant_equipment_maintenance_strategy_invalid") from exc
        if body.confirmation != f"SAVE MAINTENANCE {body.equipment_id}":
            raise _error(
                409,
                "plant_equipment_maintenance_strategy_confirmation_mismatch",
            )
        command_id = str(body.command_id)
        result = _invoke(
            lambda: store.apply_command(
                principal,
                command_id=command_id,
                surface="production",
                event_type="production.equipment_maintenance_strategy.saved",
                expected_version=body.expected_version,
                payload={
                    "equipmentId": body.equipment_id,
                    "maintenanceOwner": body.maintenance_owner,
                    "intervalDays": body.interval_days,
                    "nextDueAt": body.next_due_at,
                    "procedureReference": body.procedure_reference,
                    "safetyBaselineReference": body.safety_baseline_reference,
                    "evidence": {
                        "actionId": f"ACT-EQUIPMENT-MAINTENANCE-STRATEGY-{command_id}",
                        "capturedAt": "server-assigned",
                        "actor": principal.actor_id,
                        "reason": "Saved reviewed preventive maintenance strategy",
                        "evidenceReference": body.safety_baseline_reference,
                    },
                },
            )
        )
        return {
            "maintenance_strategy": {
                "contract": "supermega.production.equipment-maintenance-strategy.v1",
                "status": "saved",
                "equipment_id": body.equipment_id,
                "workspace_id": principal.workspace_id,
                "maintenance_execution_started": False,
                "work_order_created": False,
                "equipment_command_performed": False,
                "telemetry_connected": False,
                "bulk_strategy_created": False,
            },
            **_command_response(result),
        }

    @router.post("/imports/apply")
    async def trial_import_apply(request: Request) -> dict[str, Any]:
        principal = _resolve_principal(request, resolve_principal)
        readiness = _readiness(store, principal)
        _require_write_ready(readiness, "setup.write")
        if principal.actor_kind != "human":
            raise _error(403, "trial_human_approval_required")
        raw_body = await _bounded_json_body(
            request,
            maximum_bytes=CLIENT_IMPORT_MAX_PACKAGE_BYTES + 2048,
        )
        try:
            body = TrialClientImportApplyRequest.model_validate(raw_body)
        except ValidationError as exc:
            raise _error(422, "client_import_apply_invalid") from exc
        try:
            validation = validate_client_import_staging_package(
                body.package,
                minimum_production_due_date=current_date(),
            )
        except ClientImportValidationError as exc:
            raise _error(
                422,
                "client_import_validation_error",
                message=str(exc),
            ) from exc
        if validation.product not in {"commerce", "production", "website", "ecommerce"}:
            raise _error(
                409,
                "client_import_activation_not_ready",
                product=validation.product,
            )
        _require_write_ready(readiness, validation.required_capability)
        expected_preflight_digest = _client_import_apply_preflight_digest(
            principal=principal,
            validation=validation,
            expected_version=body.expected_version,
        )
        if body.preflight_digest != expected_preflight_digest:
            raise _error(409, "client_import_apply_preflight_mismatch")
        if body.confirmation != f"APPLY {validation.package_digest}":
            raise _error(409, "client_import_confirmation_mismatch")
        if validation.product == "commerce":
            surface = "commerce"
            event_type = "commerce.workspace.initialized"
            payload = _shop_catalog_import_payload(
                body.package,
                actor_id=principal.actor_id,
                command_id=body.command_id,
                package_digest=validation.package_digest,
            )
        elif validation.product == "production":
            surface = "production"
            event_type = "production.workspace.initialized"
            payload = _plant_jobs_import_payload(
                body.package,
                actor_id=principal.actor_id,
                command_id=body.command_id,
                package_digest=validation.package_digest,
            )
        elif validation.product == "website":
            surface = "website"
            event_type = "website.workspace.initialized"
            payload = _website_pages_import_payload(
                body.package,
                actor_id=principal.actor_id,
                command_id=body.command_id,
                package_digest=validation.package_digest,
            )
        else:
            surface = "commerce"
            event_type = "commerce.storefront.merchandising.imported"
            payload = _ecommerce_merchandising_import_payload(
                body.package,
                actor_id=principal.actor_id,
                command_id=body.command_id,
                package_digest=validation.package_digest,
            )
        result = _invoke(
            lambda: store.apply_command(
                principal,
                command_id=body.command_id,
                surface=surface,
                event_type=event_type,
                expected_version=body.expected_version,
                payload=payload,
            )
        )
        return {
            "activation": {
                "contract": "supermega.client_import_activation.v1",
                "status": "applied",
                "product": validation.product,
                "object": validation.object_id,
                "workflow_template_id": validation.workflow_template_id,
                "package_digest": validation.package_digest,
                "row_count": validation.row_count,
                "workspace_id": principal.workspace_id,
                "external_writes_performed": True,
            },
            **_command_response(result),
        }

    @router.post("/product-acceptance")
    def record_product_acceptance(
        request: Request,
        body: TrialProductAcceptanceRequest,
    ) -> dict[str, Any]:
        principal = _resolve_principal(request, resolve_principal)
        if principal.actor_kind != "human":
            raise _error(403, "trial_human_approval_required")
        readiness = _readiness(store, principal)
        surface = PRODUCT_ACCEPTANCE_SURFACES[body.product]
        _require_write_ready(readiness, SURFACE_WRITE_CAPABILITIES[surface])
        if (
            readiness.product_entitlements is None
            or body.product not in readiness.product_entitlements
        ):
            raise _error(
                403,
                "trial_product_entitlement_required",
                required_product=body.product,
            )
        acceptance = _invoke(
            lambda: store.record_product_acceptance(
                principal,
                probe_id=body.probe_id,
                owner_approval_id=body.owner_approval_id,
                product=body.product,
                release_commit=body.release_commit,
            )
        )
        return {
            "acceptance": acceptance.to_dict(),
            "product_state_mutated": False,
            "external_writes_performed": not acceptance.idempotent_replay,
            "secret_values_exposed": False,
        }

    @router.get("/product-acceptance/{probe_id}")
    def read_product_acceptance(probe_id: UUID, request: Request) -> dict[str, Any]:
        principal = _resolve_principal(request, resolve_principal)
        acceptance = _invoke(
            lambda: store.get_product_acceptance(principal, probe_id=probe_id)
        )
        return {
            "acceptance": acceptance.to_dict(),
            "product_state_mutated": False,
            "external_writes_performed": False,
            "secret_values_exposed": False,
        }

    @router.post("/commands")
    def trial_command(request: Request, body: TrialCommandRequest) -> dict[str, Any]:
        principal = _resolve_principal(request, resolve_principal)
        if body.surface == "company":
            raise _error(409, "company_write_requires_dedicated_workflow")
        _reject_client_identity(body.payload, path="payload")
        if body.surface == "commerce":
            evidence = body.payload.get("evidence")
            if not isinstance(evidence, Mapping) or evidence.get("actor") != principal.actor_id:
                raise _error(422, "commerce_actor_evidence_required")
            if body.event_type in COMMERCE_HUMAN_EVENTS and principal.actor_kind != "human":
                raise _error(403, "trial_human_approval_required")
        if body.surface == "production":
            evidence = body.payload.get("evidence")
            if not isinstance(evidence, Mapping) or evidence.get("actor") != principal.actor_id:
                raise _error(422, "production_actor_evidence_required")
            if body.event_type in PRODUCTION_HUMAN_EVENTS and principal.actor_kind != "human":
                raise _error(403, "trial_human_approval_required")
        if body.surface == "website":
            evidence = body.payload.get("evidence")
            if not isinstance(evidence, Mapping) or evidence.get("actor") != principal.actor_id:
                raise _error(422, "website_actor_evidence_required")
            if body.event_type in WEBSITE_HUMAN_EVENTS and principal.actor_kind != "human":
                raise _error(403, "trial_human_approval_required")
        readiness = _readiness(store, principal)
        _require_write_ready(readiness, SURFACE_WRITE_CAPABILITIES[body.surface])
        related_surfaces: tuple[str, ...] = ()
        state_precondition: StatePrecondition | None = None
        if body.surface == "commerce" and body.event_type == "commerce.website_intake.created":
            next_state = body.payload.get("state")
            website_intakes = next_state.get("websiteIntakes") if isinstance(next_state, Mapping) else None
            source = website_intakes[0].get("source") if (
                isinstance(website_intakes, list)
                and website_intakes
                and isinstance(website_intakes[0], Mapping)
            ) else None

            def require_website_source(
                commerce_state: Mapping[str, Any],
                related_states: Mapping[str, Mapping[str, Any]],
            ) -> None:
                if not _commerce_retains_website_source(commerce_state, source):
                    validate_website_snapshot_source(related_states.get("website", {}), source)

            related_surfaces = ("website",)
            state_precondition = require_website_source
        elif (
            body.surface == "commerce"
            and body.event_type == "commerce.production_material.issued"
        ):
            submitted_commerce = body.payload.get("state")
            if not isinstance(submitted_commerce, Mapping):
                raise _error(422, "production_material_issue_state_required")

            def require_plant_request(
                commerce_state: Mapping[str, Any],
                related_states: Mapping[str, Mapping[str, Any]],
            ) -> None:
                require_shop_issue_matches_plant(
                    commerce_state,
                    submitted_commerce,
                    related_states.get("production", {}),
                )

            related_surfaces = ("production",)
            state_precondition = require_plant_request
        elif (
            body.surface == "commerce"
            and body.event_type == "commerce.production_material.returned"
        ):
            submitted_commerce = body.payload.get("state")
            submitted_movements = (
                submitted_commerce.get("movements")
                if isinstance(submitted_commerce, Mapping)
                else None
            )
            return_movement = (
                submitted_movements[0]
                if isinstance(submitted_movements, list)
                and submitted_movements
                and isinstance(submitted_movements[0], Mapping)
                else None
            )
            if (
                not isinstance(return_movement, Mapping)
                or return_movement.get("kind") != "production_return"
            ):
                raise _error(422, "production_material_return_state_required")

            def require_current_plant_issue(
                commerce_state: Mapping[str, Any],
                related_states: Mapping[str, Mapping[str, Any]],
            ) -> None:
                source_issue_action_id = return_movement.get(
                    "productionIssueActionId"
                )
                movements = commerce_state.get("movements")
                source_issues = [
                    movement
                    for movement in movements
                    if isinstance(movement, Mapping)
                    and movement.get("kind") == "production_issue"
                    and movement.get("actionId") == source_issue_action_id
                ] if isinstance(movements, list) else []
                if len(source_issues) != 1:
                    raise TrialValidationError(
                        "the material return source issue is not retained in Shop."
                    )
                source = source_issues[0]
                requests = production_material_requests(
                    related_states.get("production", {})
                )
                matching = [
                    request
                    for request in requests
                    if request.get("requestId") == source.get("productionRequestId")
                    and request.get("sourceCommandDigest")
                    == source.get("productionCommandDigest")
                    and request.get("jobId") == source.get("productionJobId")
                    and request.get("materialId")
                    == source.get("productionMaterialId")
                    and request.get("inputLotId")
                    == source.get("productionInputLotId")
                    and request.get("quantityMilli")
                    == source.get("productionQuantityMilli")
                    and request.get("unit") == source.get("productionUnit")
                ]
                if len(matching) != 1:
                    raise TrialValidationError(
                        "the material return no longer matches the locked Plant issue."
                    )

            related_surfaces = ("production",)
            state_precondition = require_current_plant_issue
        elif (
            body.surface == "production"
            and body.event_type == "production.order_execution.recorded"
        ):
            submitted_production = body.payload.get("state")
            submitted_executions: list[Mapping[str, Any]] = []
            if isinstance(submitted_production, Mapping):
                legacy_execution = submitted_production.get("orderExecution")
                if isinstance(legacy_execution, Mapping):
                    submitted_executions.append(legacy_execution)
                portfolio = submitted_production.get("orderPortfolio")
                entries = portfolio.get("entries") if isinstance(portfolio, Mapping) else None
                if isinstance(entries, list):
                    submitted_executions.extend(
                        entry["execution"]
                        for entry in entries
                        if isinstance(entry, Mapping) and isinstance(entry.get("execution"), Mapping)
                    )
            evidence_action_id = evidence.get("actionId") if isinstance(evidence, Mapping) else None
            latest_payload = next(
                (
                    commands[-1].get("payload")
                    for execution in submitted_executions
                    if isinstance((commands := execution.get("commands")), list)
                    and commands
                    and isinstance(commands[-1], Mapping)
                    and isinstance(commands[-1].get("payload"), Mapping)
                    and isinstance(commands[-1]["payload"].get("proof"), Mapping)
                    and commands[-1]["payload"]["proof"].get("actionId") == evidence_action_id
                ),
                None,
            )
            if (
                isinstance(submitted_production, Mapping)
                and isinstance(latest_payload, Mapping)
                and latest_payload.get("kind")
                in {"record_operation", "record_output"}
            ):

                def require_shop_issue(
                    _production_state: Mapping[str, Any],
                    related_states: Mapping[str, Mapping[str, Any]],
                ) -> None:
                    require_shop_issue_before_plant_progress(
                        submitted_production,
                        related_states.get("commerce", {}),
                    )

                related_surfaces = ("commerce",)
                state_precondition = require_shop_issue
        elif (
            body.surface == "production"
            and body.event_type == "production.job.created"
            and isinstance(body.payload.get("intent"), Mapping)
            and isinstance(body.payload["intent"].get("shopDemandSource"), Mapping)
        ):
            submitted_source = deepcopy(body.payload["intent"]["shopDemandSource"])

            def require_current_shop_demand(
                production_state: Mapping[str, Any],
                related_states: Mapping[str, Mapping[str, Any]],
            ) -> None:
                require_shop_demand_source_current(
                    production_state,
                    related_states.get("commerce", {}),
                    submitted_source,
                )

            related_surfaces = ("commerce",)
            state_precondition = require_current_shop_demand
        domain_span_name = _command_domain_span_name(body.surface, body.event_type)

        def apply() -> CommandResult:
            return store.apply_command(
                principal,
                command_id=body.command_id,
                surface=body.surface,
                event_type=body.event_type,
                expected_version=body.expected_version,
                payload=body.payload,
                related_surfaces=related_surfaces,
                state_precondition=state_precondition,
            )

        if domain_span_name is None:
            result = _invoke(apply)
        else:
            with domain_span(domain_span_name, surface=body.surface, event_type=body.event_type):
                result = _invoke(apply)
        return _command_response(result)

    @router.post("/approvals")
    def trial_approval_request(request: Request, body: TrialApprovalRequest) -> dict[str, Any]:
        principal = _resolve_principal(request, resolve_principal)
        proposal = body.proposal.model_dump()
        _reject_client_identity(proposal, path="proposal")
        readiness = _readiness(store, principal)
        _require_write_ready(readiness, APPROVAL_REQUEST_CAPABILITY)
        approval = _invoke(
            lambda: store.create_approval(
                principal,
                command_id=body.command_id,
                title=body.title,
                proposal=proposal,
                evidence_refs=body.evidence_refs,
            )
        )
        return _approval_response(approval)

    @router.post("/approvals/{approval_id}/decision")
    def trial_approval_decision(
        approval_id: UUID,
        request: Request,
        body: TrialApprovalDecisionRequest,
    ) -> dict[str, Any]:
        principal = _resolve_principal(request, resolve_principal)
        readiness = _readiness(store, principal)
        _require_write_ready(readiness, APPROVAL_DECIDE_CAPABILITY)
        approval = _invoke(
            lambda: store.decide_approval(
                principal,
                approval_id=approval_id,
                command_id=body.command_id,
                decision=body.decision,
                note=body.note,
            )
        )
        return _approval_response(approval)

    return router


__all__ = [
    "PrincipalResolver",
    "SELF_SERVE_ACTIVATION_CONTRACT",
    "SELF_SERVE_ACTIVATION_WINDOW_ENV",
    "SignupSessionResolver",
    "TRIAL_API_PREFIX",
    "TrialApprovalDecisionRequest",
    "TrialApprovalRequest",
    "TrialCommandRequest",
    "TrialProductAcceptanceRequest",
    "TrialSelfServeWorkspaceRequest",
    "TrialSignupSession",
    "create_trial_router",
    "self_serve_activation_window_open",
]
