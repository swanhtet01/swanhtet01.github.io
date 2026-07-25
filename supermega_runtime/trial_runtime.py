from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
import json
from typing import Any, Literal, TypeVar
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

from supermega_runtime.commerce_runtime import COMMERCE_HUMAN_EVENTS
from supermega_runtime.client_import_runtime import (
    CLIENT_IMPORT_MAX_PACKAGE_BYTES,
    ClientImportValidationError,
    validate_client_import_staging_package,
)
from supermega_runtime.production_runtime import PRODUCTION_HUMAN_EVENTS
from supermega_runtime.trial_store import (
    APPROVAL_DECIDE_CAPABILITY,
    APPROVAL_REQUEST_CAPABILITY,
    SURFACE_WRITE_CAPABILITIES,
    ApprovalRecord,
    CommandResult,
    TrialIdempotencyConflict,
    TrialHumanApprovalRequired,
    TrialInvalidTransition,
    TrialNotFound,
    TrialNotReadyError,
    TrialPermissionDenied,
    TrialPrincipal,
    TrialReadiness,
    TrialStore,
    TrialStoreError,
    TrialValidationError,
    TrialVersionConflict,
    StatePrecondition,
    has_approval_read_capability,
    has_surface_read_capability,
)
from supermega_runtime.website_runtime import WEBSITE_HUMAN_EVENTS, validate_website_snapshot_source


TRIAL_API_PREFIX = "/api/trial/v1"
TRIAL_SURFACE_ORDER = ("company", "commerce", "production", "website", "setup")

PrincipalResolver = Callable[[Request], TrialPrincipal | None]
ResultT = TypeVar("ResultT")

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


async def _bounded_json_body(request: Request) -> object:
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
        if declared_size > CLIENT_IMPORT_MAX_PACKAGE_BYTES:
            raise _error(
                413,
                "client_import_too_large",
                maximum_bytes=CLIENT_IMPORT_MAX_PACKAGE_BYTES,
            )

    chunks: list[bytes] = []
    total = 0
    try:
        async for chunk in request.stream():
            total += len(chunk)
            if total > CLIENT_IMPORT_MAX_PACKAGE_BYTES:
                raise _error(
                    413,
                    "client_import_too_large",
                    maximum_bytes=CLIENT_IMPORT_MAX_PACKAGE_BYTES,
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


def create_trial_router(*, store: TrialStore, resolve_principal: PrincipalResolver) -> APIRouter:
    """Create an unwired private-trial router with injected storage and auth.

    ``resolve_principal`` must validate a server-side session or token and return
    its workspace and actor. This module never accepts either identity from a
    request body and never holds a browser-facing Supabase credential.
    """

    router = APIRouter(prefix=TRIAL_API_PREFIX, tags=["private-trial"])

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
            validation = validate_client_import_staging_package(package)
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

    @router.post("/commands")
    def trial_command(request: Request, body: TrialCommandRequest) -> dict[str, Any]:
        principal = _resolve_principal(request, resolve_principal)
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
        result = _invoke(
            lambda: store.apply_command(
                principal,
                command_id=body.command_id,
                surface=body.surface,
                event_type=body.event_type,
                expected_version=body.expected_version,
                payload=body.payload,
                related_surfaces=related_surfaces,
                state_precondition=state_precondition,
            )
        )
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
    "TRIAL_API_PREFIX",
    "TrialApprovalDecisionRequest",
    "TrialApprovalRequest",
    "TrialCommandRequest",
    "create_trial_router",
]
