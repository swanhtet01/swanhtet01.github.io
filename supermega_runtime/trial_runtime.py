from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from typing import Any, Literal, TypeVar
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from supermega_runtime.trial_store import (
    APPROVAL_DECIDE_CAPABILITY,
    APPROVAL_REQUEST_CAPABILITY,
    SURFACE_WRITE_CAPABILITIES,
    ApprovalRecord,
    CommandResult,
    TrialIdempotencyConflict,
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
)


TRIAL_API_PREFIX = "/api/trial/v1"
TRIAL_SURFACE_ORDER = ("command", "shop", "plant", "setup")

PrincipalResolver = Callable[[Request], TrialPrincipal | None]
ResultT = TypeVar("ResultT")

_CLIENT_IDENTITY_FIELDS = frozenset(
    {
        "actor_id",
        "decided_by",
        "requested_by",
        "updated_by",
        "workspace_id",
    }
)


class _StrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TrialCommandRequest(_StrictRequest):
    command_id: UUID
    surface: Literal["command", "shop", "plant", "setup"]
    event_type: str = Field(min_length=1, max_length=80)
    expected_version: int = Field(ge=0)
    payload: dict[str, Any] = Field(default_factory=dict)


class TrialApprovalRequest(_StrictRequest):
    command_id: UUID
    title: str = Field(min_length=1, max_length=160)
    proposal: dict[str, Any]
    evidence_refs: list[str] = Field(min_length=1, max_length=20)


class TrialApprovalDecisionRequest(_StrictRequest):
    command_id: UUID
    decision: Literal["approved", "declined"]
    note: str = Field(default="", max_length=500)


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
    if not normalized.authenticated or not normalized.workspace_id or not normalized.actor_id:
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
        }
        approvals = _invoke(lambda: store.list_approvals(principal))
        return {
            "identity": {
                "workspace_id": principal.workspace_id,
                "actor_id": principal.actor_id,
            },
            "readiness": readiness.to_dict(),
            "states": states,
            "approvals": [approval.to_dict() for approval in approvals],
        }

    @router.post("/commands")
    def trial_command(request: Request, body: TrialCommandRequest) -> dict[str, Any]:
        principal = _resolve_principal(request, resolve_principal)
        _reject_client_identity(body.payload, path="payload")
        readiness = _readiness(store, principal)
        _require_write_ready(readiness, SURFACE_WRITE_CAPABILITIES[body.surface])
        result = _invoke(
            lambda: store.apply_command(
                principal,
                command_id=body.command_id,
                surface=body.surface,
                event_type=body.event_type,
                expected_version=body.expected_version,
                payload=body.payload,
            )
        )
        return _command_response(result)

    @router.post("/approvals")
    def trial_approval_request(request: Request, body: TrialApprovalRequest) -> dict[str, Any]:
        principal = _resolve_principal(request, resolve_principal)
        _reject_client_identity(body.proposal, path="proposal")
        readiness = _readiness(store, principal)
        _require_write_ready(readiness, APPROVAL_REQUEST_CAPABILITY)
        approval = _invoke(
            lambda: store.create_approval(
                principal,
                command_id=body.command_id,
                title=body.title,
                proposal=body.proposal,
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
