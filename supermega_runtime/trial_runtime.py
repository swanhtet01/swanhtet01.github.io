from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from copy import deepcopy
from datetime import date
from hashlib import sha256
import json
from typing import Any, Literal, TypeVar
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from supermega_runtime.commerce_runtime import COMMERCE_HUMAN_EVENTS, validate_commerce_state
from supermega_runtime.client_import_runtime import (
    CLIENT_IMPORT_MAX_PACKAGE_BYTES,
    ClientImportValidationError,
    validate_client_import_staging_package,
)
from supermega_runtime.production_runtime import PRODUCTION_HUMAN_EVENTS
from supermega_runtime.order_intake import (
    MAX_ORDER_MESSAGE_LENGTH,
    OrderIntakeCatalogItem,
)
from supermega_runtime.order_intake_provider import (
    MAX_ORDER_INTAKE_CATALOG_ITEMS,
    OrderIntakeDraftProvider,
    OrderIntakeProviderError,
)
from supermega_runtime.production_material_handoff import (
    require_shop_issue_before_plant_progress,
    require_shop_issue_matches_plant,
)
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


class TrialClientImportApplyRequest(_StrictRequest):
    command_id: UUID
    expected_version: int = Field(ge=0)
    confirmation: str = Field(
        min_length=77,
        max_length=77,
        pattern=r"^APPLY sha256:[0-9a-f]{64}$",
    )
    package: dict[str, Any]


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
    machines: list[dict[str, str]] = []
    machine_ids_by_line: dict[str, str] = {}
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
            if line not in machine_ids_by_line:
                machine_id = f"machine-import-{len(machines) + 1}"
                machine_ids_by_line[line] = machine_id
                machines.append(
                    {
                        "id": machine_id,
                        "name": line,
                        "state": "running",
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
            "machines": machines,
            "events": [],
            "openingPlan": {
                "contract": "supermega.production.opening-plan.v1",
                "packageDigest": package_digest,
                "confirmedAt": "server-assigned",
                "industryPackId": industry_pack_id,
                "jobIds": [job["id"] for job in jobs],
                "machineIds": [machine["id"] for machine in machines],
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
    order_intake_provider: OrderIntakeDraftProvider | None = None,
) -> APIRouter:
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
            events[-1] = latest_event
            event_type = "commerce.service_schedule.saved"
            evidence = {
                "actionId": f"ACT-SERVICE-SCHEDULE-R{revision}",
                "capturedAt": latest_event.get("happenedAt"),
                "actor": principal.actor_id,
                "reason": latest_event.get("reason"),
                "evidenceReference": f"SHOP-SERVICE-SCHEDULE:R{revision}",
            }
        next_state = {**current_state, "serviceSchedule": schedule}
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
            validation = validate_client_import_staging_package(body.package)
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
            body.surface == "production"
            and body.event_type == "production.order_execution.recorded"
        ):
            submitted_production = body.payload.get("state")
            execution = (
                submitted_production.get("orderExecution")
                if isinstance(submitted_production, Mapping)
                else None
            )
            commands = (
                execution.get("commands") if isinstance(execution, Mapping) else None
            )
            latest_payload = (
                commands[-1].get("payload")
                if isinstance(commands, list)
                and commands
                and isinstance(commands[-1], Mapping)
                else None
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
