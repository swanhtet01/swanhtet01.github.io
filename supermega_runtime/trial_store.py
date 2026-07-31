"""Workspace-scoped persistence contracts for the canonical SuperMega trial."""

from __future__ import annotations

from contextlib import contextmanager
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
from threading import RLock
from typing import Any, Callable, Iterator, Mapping, Protocol, Sequence
from uuid import UUID, uuid4

from supermega_runtime.shop_inventory_runtime import (
    ShopInventoryValidationError,
    restamp_latest_shop_inventory_command,
)


TRIAL_SCHEMA_COMPONENT = "private_trial_backend"
TRIAL_SCHEMA_VERSION = 5
TRIAL_SURFACES = frozenset({"company", "commerce", "production", "website", "setup"})
TRUSTED_ACTOR_KINDS = frozenset({"human", "service", "agent"})
HUMAN_ACTOR_KIND = "human"
_MAX_SAFE_INTEGER = 9_007_199_254_740_991
_ORDER_CALCULATION_SCHEMA = "supermega.commerce.order-calculation.v1"
HUMAN_COMMAND_EVENTS = frozenset(
    {
        "commerce.workspace.initialized",
        "commerce.item.created",
        "commerce.item.updated",
        "commerce.order.created",
        "commerce.order.advanced",
        "commerce.order.cancelled",
        "commerce.order.return_recorded",
        "commerce.order.support_case_opened",
        "commerce.order.support_case_reopened",
        "commerce.order.support_case_service_recorded",
        "commerce.order.support_case_resolved",
        "commerce.order.correction_recorded",
        "commerce.payment.reconciled",
        "commerce.collection_action.recorded",
        "commerce.refund.settled",
        "commerce.stock.received",
        "commerce.stock.counted",
        "commerce.production_material.issued",
        "commerce.production_material.returned",
        "commerce.production_batch.received",
        "commerce.inventory.initialized",
        "commerce.inventory.master_created",
        "commerce.inventory.transferred",
        "commerce.purchase_order.created",
        "commerce.purchase_order.received",
        "commerce.purchase_order.cancelled",
        "commerce.close.saved",
        "commerce.website_intake.converted",
        "commerce.storefront.configuration.saved",
        "commerce.storefront.merchandising.imported",
        "commerce.tax_configuration.saved",
        "commerce.account_mapping.saved",
        "commerce.customer_credit_policy.saved",
        "commerce.promotion_policy.saved",
        "commerce.shipping_policy.saved",
        "commerce.payment_policy.saved",
        "commerce.service_schedule.initialized",
        "commerce.service_schedule.saved",
        "production.workspace.initialized",
        "production.job.created",
        "production.job.schedule_updated",
        "production.job.closed",
        "production.output.recorded",
        "production.material.consumed",
        "production.issue.opened",
        "production.issue.resolved",
        "production.quality_hold.placed",
        "production.quality_hold.released",
        "production.machine_state.changed",
        "production.equipment_master.imported",
        "production.equipment.commissioned",
        "production.equipment_maintenance_strategy.saved",
        "production.order_execution.recorded",
        "production.downtime.started",
        "production.downtime.ended",
        "production.maintenance.started",
        "production.maintenance.completed",
        "website.evidence.recorded",
        "website.revision.approved",
        "website.snapshot.recorded",
        "website.release.recorded",
    }
)
SURFACE_WRITE_CAPABILITIES = {
    "company": "company.write",
    "commerce": "commerce.write",
    "production": "production.write",
    "website": "website.write",
    "setup": "setup.write",
}
SURFACE_READ_CAPABILITIES = {
    surface: f"{surface}.read" for surface in SURFACE_WRITE_CAPABILITIES
}
APPROVAL_READ_CAPABILITY = "approvals.read"
APPROVAL_REQUEST_CAPABILITY = "approvals.request"
APPROVAL_DECIDE_CAPABILITY = "approvals.decide"
DECISION_PACKET_CONTRACT = "decision_packet.v1"
MAX_JSON_BYTES = 64 * 1024

JsonObject = dict[str, Any]
StateReducer = Callable[[str, str, Mapping[str, Any], Mapping[str, Any]], Mapping[str, Any]]
StatePrecondition = Callable[[Mapping[str, Any], Mapping[str, Mapping[str, Any]]], None]

_PRIVATE_HARDENING_TRIGGER_CONTRACT: dict[tuple[str, str], dict[str, Any]] = {
    ("workspace_state", "workspace_state_version_guard"): {
        "event_mask": 23,
        "function_name": "guard_workspace_state_update",
        "function_source": """
            begin
              if tg_op = 'INSERT' then
                if new.version <> 1 then
                  raise exception using errcode = '55000', message = 'initial workspace state version must be one';
                end if;
              else
                if new.workspace_id is distinct from old.workspace_id
                   or new.surface is distinct from old.surface then
                  raise exception using errcode = '55000', message = 'workspace state identity is immutable';
                end if;
                if new.version <> old.version + 1 then
                  raise exception using errcode = '40001', message = 'workspace state version must increment by one';
                end if;
              end if;
              new.updated_at := transaction_timestamp();
              return new;
            end
        """,
    },
    ("workspace_events", "workspace_events_immutable"): {
        "event_mask": 27,
        "function_name": "reject_workspace_event_mutation",
        "function_source": """
            begin
              raise exception using
                errcode = '55000',
                message = 'workspace events are immutable';
            end
        """,
    },
    ("workspace_events", "workspace_events_server_timestamp"): {
        "event_mask": 7,
        "function_name": "stamp_workspace_event_insert",
        "function_source": """
            begin
              new.created_at := transaction_timestamp();
              return new;
            end
        """,
    },
    ("approval_requests", "approval_requests_controlled_mutation"): {
        "event_mask": 31,
        "function_name": "guard_approval_mutation",
        "function_source": """
            begin
              if tg_op = 'INSERT' then
                new.requested_at := transaction_timestamp();
                return new;
              end if;
              if tg_op = 'DELETE' then
                raise exception using errcode = '55000', message = 'approval records cannot be deleted';
              end if;
              if new.approval_id is distinct from old.approval_id
                 or new.workspace_id is distinct from old.workspace_id
                 or new.command_id is distinct from old.command_id
                 or new.command_fingerprint is distinct from old.command_fingerprint
                 or new.title is distinct from old.title
                 or new.proposal_json is distinct from old.proposal_json
                 or new.evidence_refs_json is distinct from old.evidence_refs_json
                 or new.requested_by is distinct from old.requested_by
                 or new.requested_actor_kind is distinct from old.requested_actor_kind
                 or new.requested_at is distinct from old.requested_at
                 or new.decision_contract_version is distinct from old.decision_contract_version then
                raise exception using errcode = '55000', message = 'approval proposal and evidence are immutable';
              end if;
              if old.decision_contract_version <> 2 then
                raise exception using errcode = '55000', message = 'legacy approval must be reissued under decision contract v2';
              end if;
              if old.status <> 'pending' or new.status not in ('approved', 'declined') then
                raise exception using errcode = '55000', message = 'approval transition must be pending to approved or declined';
              end if;
              if new.version <> old.version + 1
                 or new.decided_by is null
                 or new.decided_by <> btrim(new.decided_by)
                 or new.decided_by = ''
                 or new.decided_actor_kind <> 'human'
                 or new.decision_note <> btrim(new.decision_note)
                 or char_length(new.decision_note) not between 1 and 500 then
                raise exception using errcode = '55000', message = 'approval decision requires a named human and nonblank note';
              end if;
              new.decided_at := transaction_timestamp();
              return new;
            end
        """,
    },
}


class TrialStoreError(RuntimeError):
    """Base class for safe, expected trial-store failures."""


class TrialNotReadyError(TrialStoreError):
    def __init__(self, reasons: Sequence[str]):
        self.reasons = tuple(dict.fromkeys(str(reason) for reason in reasons if str(reason)))
        super().__init__("Trial backend is not ready: " + ", ".join(self.reasons))


class TrialPermissionDenied(TrialStoreError):
    def __init__(self, required_capability: str):
        self.required_capability = required_capability
        super().__init__(f"Missing capability: {required_capability}")


class TrialHumanApprovalRequired(TrialStoreError):
    def __init__(self):
        super().__init__("A trusted human actor must make the approval decision.")


class TrialVersionConflict(TrialStoreError):
    def __init__(self, *, expected_version: int, current_version: int):
        self.expected_version = expected_version
        self.current_version = current_version
        super().__init__(
            f"Expected workspace state version {expected_version}, current version is {current_version}."
        )


class TrialIdempotencyConflict(TrialStoreError):
    def __init__(self, command_id: str):
        self.command_id = command_id
        super().__init__(f"Command {command_id} was already used with different input.")


class TrialInvalidTransition(TrialStoreError):
    pass


class TrialNotFound(TrialStoreError):
    pass


class TrialValidationError(TrialStoreError):
    pass


@dataclass(frozen=True, slots=True)
class TrialPrincipal:
    workspace_id: str
    actor_id: str
    actor_kind: str = "unknown"
    authenticated: bool = True

    def normalized(self) -> "TrialPrincipal":
        return TrialPrincipal(
            workspace_id=str(self.workspace_id or "").strip(),
            actor_id=str(self.actor_id or "").strip(),
            actor_kind=str(self.actor_kind or "").strip().lower(),
            authenticated=bool(self.authenticated),
        )


@dataclass(frozen=True, slots=True)
class TrialReadiness:
    backend: str
    database_ready: bool
    role_ready: bool
    schema_ready: bool
    auth_ready: bool
    membership_ready: bool
    audit_ready: bool
    write_enabled: bool
    capabilities: frozenset[str] = frozenset()

    @property
    def read_ready(self) -> bool:
        return all(
            (
                self.database_ready,
                self.role_ready,
                self.schema_ready,
                self.auth_ready,
                self.membership_ready,
            )
        )

    @property
    def write_ready(self) -> bool:
        return self.read_ready and self.audit_ready and self.write_enabled

    @property
    def blockers(self) -> tuple[str, ...]:
        checks = (
            ("database_ready", self.database_ready),
            ("role_ready", self.role_ready),
            ("schema_ready", self.schema_ready),
            ("auth_ready", self.auth_ready),
            ("membership_ready", self.membership_ready),
            ("audit_ready", self.audit_ready),
            ("write_enabled", self.write_enabled),
        )
        return tuple(name for name, ready in checks if not ready)

    def to_dict(self) -> JsonObject:
        return {
            "status": "ready" if self.write_ready else "blocked",
            "backend": self.backend,
            "read_ready": self.read_ready,
            "write_ready": self.write_ready,
            "checks": {
                "database_ready": self.database_ready,
                "role_ready": self.role_ready,
                "schema_ready": self.schema_ready,
                "auth_ready": self.auth_ready,
                "membership_ready": self.membership_ready,
                "audit_ready": self.audit_ready,
                "write_enabled": self.write_enabled,
            },
            "blockers": list(self.blockers),
        }


@dataclass(frozen=True, slots=True)
class TrialState:
    workspace_id: str
    surface: str
    version: int
    state: JsonObject
    updated_by: str = ""
    updated_at: str = ""

    def to_dict(self) -> JsonObject:
        return {
            "surface": self.surface,
            "version": self.version,
            "state": deepcopy(self.state),
            "updated_by": self.updated_by,
            "updated_at": self.updated_at,
        }


@dataclass(frozen=True, slots=True)
class CommandResult:
    command_id: str
    surface: str
    event_type: str
    version: int
    state: JsonObject
    idempotent_replay: bool = False

    def to_dict(self) -> JsonObject:
        return {
            "command_id": self.command_id,
            "surface": self.surface,
            "event_type": self.event_type,
            "version": self.version,
            "state": deepcopy(self.state),
            "idempotent_replay": self.idempotent_replay,
        }


@dataclass(frozen=True, slots=True)
class ApprovalRecord:
    approval_id: str
    command_id: str
    title: str
    proposal: JsonObject
    evidence_refs: tuple[str, ...]
    status: str
    requested_by: str
    requested_actor_kind: str
    requested_at: str
    decided_by: str = ""
    decided_actor_kind: str = ""
    decided_at: str = ""
    decision_note: str = ""
    version: int = 0
    idempotent_replay: bool = False

    def to_dict(self) -> JsonObject:
        return {
            "approval_id": self.approval_id,
            "command_id": self.command_id,
            "title": self.title,
            "proposal": deepcopy(self.proposal),
            "evidence_refs": list(self.evidence_refs),
            "status": self.status,
            "requested_by": self.requested_by,
            "requested_actor_kind": self.requested_actor_kind,
            "requested_at": self.requested_at,
            "decided_by": self.decided_by,
            "decided_actor_kind": self.decided_actor_kind,
            "decided_at": self.decided_at,
            "decision_note": self.decision_note,
            "version": self.version,
            "idempotent_replay": self.idempotent_replay,
        }


class TrialStore(Protocol):
    def readiness(self, principal: TrialPrincipal | None) -> TrialReadiness: ...

    def get_state(self, principal: TrialPrincipal, surface: str) -> TrialState: ...

    def list_approvals(self, principal: TrialPrincipal, *, limit: int = 50) -> list[ApprovalRecord]: ...

    def apply_command(
        self,
        principal: TrialPrincipal,
        *,
        command_id: str | UUID,
        surface: str,
        event_type: str,
        expected_version: int,
        payload: Mapping[str, Any],
        related_surfaces: Sequence[str] = (),
        state_precondition: StatePrecondition | None = None,
    ) -> CommandResult: ...

    def create_approval(
        self,
        principal: TrialPrincipal,
        *,
        command_id: str | UUID,
        title: str,
        proposal: Mapping[str, Any],
        evidence_refs: Sequence[str],
    ) -> ApprovalRecord: ...

    def decide_approval(
        self,
        principal: TrialPrincipal,
        *,
        approval_id: str | UUID,
        command_id: str | UUID,
        decision: str,
        note: str,
    ) -> ApprovalRecord: ...


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _canonical_millisecond_utc(timestamp: str) -> str:
    return (
        datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        .astimezone(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def _not_before(captured_at: str, *timestamps: object) -> str:
    latest = datetime.fromisoformat(captured_at.replace("Z", "+00:00"))
    for timestamp in timestamps:
        if not isinstance(timestamp, str):
            continue
        try:
            candidate = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        except ValueError:
            continue
        if candidate > latest:
            latest = candidate
    return latest.isoformat()


def _myanmar_business_date(timestamp: str) -> str:
    parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    return (
        parsed.astimezone(timezone.utc) + timedelta(hours=6, minutes=30)
    ).date().isoformat()


def _authoritative_order_calculation(
    state: Mapping[str, Any],
    order: Mapping[str, Any],
) -> JsonObject | None:
    catalog_changes = state.get("catalogChanges", [])
    if not isinstance(catalog_changes, list):
        return None
    lines = order.get("lines")
    subtotal_mmk = 0
    if lines is not None:
        if not isinstance(lines, list) or not 1 <= len(lines) <= 20:
            return None
        for line in lines:
            if not isinstance(line, Mapping):
                return None
            quantity = line.get("quantity")
            unit_price = line.get("unitPriceMmk")
            if (
                not isinstance(quantity, int)
                or isinstance(quantity, bool)
                or not isinstance(unit_price, int)
                or isinstance(unit_price, bool)
                or quantity < 1
                or unit_price < 1
            ):
                return None
            subtotal_mmk += quantity * unit_price
            if subtotal_mmk > _MAX_SAFE_INTEGER:
                return None
    else:
        item_sku = order.get("itemSku")
        quantity = order.get("quantity")
        items = state.get("items")
        if (
            not isinstance(item_sku, str)
            or not isinstance(quantity, int)
            or isinstance(quantity, bool)
            or quantity < 1
            or not isinstance(items, list)
        ):
            return None
        matching_items = [
            item
            for item in items
            if isinstance(item, Mapping) and item.get("sku") == item_sku
        ]
        if len(matching_items) != 1:
            return None
        unit_price = matching_items[0].get("price")
        if (
            not isinstance(unit_price, int)
            or isinstance(unit_price, bool)
            or unit_price < 1
        ):
            return None
        subtotal_mmk = quantity * unit_price
        if subtotal_mmk > _MAX_SAFE_INTEGER:
            return None
    return {
        "schema": _ORDER_CALCULATION_SCHEMA,
        "currency": "MMK",
        "catalogRevision": len(catalog_changes),
        "subtotalMmk": subtotal_mmk,
        "taxMode": "not_configured",
        "taxMmk": 0,
        "totalMmk": subtotal_mmk,
    }


def _restamp_order_inventory(
    state: Mapping[str, Any],
    *,
    kind: str,
    action_id: str,
    actor: str,
    captured_at: str,
) -> JsonObject:
    authoritative_state = dict(state)
    foundation = state.get("inventoryFoundation")
    if not isinstance(foundation, Mapping):
        return authoritative_state
    commands = foundation.get("commands")
    latest_payload = (
        commands[-1].get("payload")
        if isinstance(commands, list)
        and commands
        and isinstance(commands[-1], Mapping)
        else None
    )
    if not isinstance(latest_payload, Mapping) or latest_payload.get("kind") != kind:
        return authoritative_state
    try:
        authoritative_state["inventoryFoundation"] = (
            restamp_latest_shop_inventory_command(
                foundation,
                action_id=action_id,
                actor=actor,
                captured_at=captured_at,
            )
        )
    except ShopInventoryValidationError as exc:
        raise TrialValidationError(str(exc)) from exc
    return authoritative_state


def _authoritative_command_payload(
    payload: Mapping[str, Any],
    *,
    principal: TrialPrincipal,
    surface: str,
    event_type: str,
    captured_at: str,
) -> JsonObject:
    authoritative = deepcopy(dict(payload))
    if surface == "website" and event_type == "website.workspace.initialized":
        website_captured_at = _canonical_millisecond_utc(captured_at)
        evidence = authoritative.get("evidence")
        state = authoritative.get("state")
        pages = state.get("pages") if isinstance(state, Mapping) else None
        opening_plan = state.get("openingPlan") if isinstance(state, Mapping) else None
        if (
            not isinstance(evidence, Mapping)
            or not isinstance(pages, list)
            or not isinstance(opening_plan, Mapping)
        ):
            return authoritative
        authoritative_state = dict(state)
        authoritative_pages: list[object] = []
        for page in pages:
            if not isinstance(page, Mapping):
                return authoritative
            authoritative_pages.append({**dict(page), "updatedAt": website_captured_at})
        authoritative_state["pages"] = authoritative_pages
        authoritative_state["openingPlan"] = {
            **dict(opening_plan),
            "confirmedAt": website_captured_at,
        }
        authoritative["state"] = authoritative_state
        authoritative["evidence"] = {
            **dict(evidence),
            "actor": principal.actor_id,
            "capturedAt": website_captured_at,
        }
        return authoritative
    if surface == "production" and event_type == "production.workspace.initialized":
        evidence = authoritative.get("evidence")
        state = authoritative.get("state")
        opening_plan = state.get("openingPlan") if isinstance(state, Mapping) else None
        if not isinstance(evidence, Mapping) or not isinstance(opening_plan, Mapping):
            return authoritative
        production_captured_at = _canonical_millisecond_utc(captured_at)
        authoritative_state = dict(state)
        authoritative_state["openingPlan"] = {
            **dict(opening_plan),
            "confirmedAt": production_captured_at,
        }
        authoritative["state"] = authoritative_state
        authoritative["evidence"] = {
            **dict(evidence),
            "actor": principal.actor_id,
            "capturedAt": production_captured_at,
        }
        return authoritative
    if surface == "production" and event_type in {
        "production.equipment_master.imported",
        "production.equipment.commissioned",
        "production.equipment_maintenance_strategy.saved",
    }:
        evidence = authoritative.get("evidence")
        if not isinstance(evidence, Mapping):
            return authoritative
        authoritative["evidence"] = {
            **dict(evidence),
            "actor": principal.actor_id,
            "capturedAt": _canonical_millisecond_utc(captured_at),
        }
        return authoritative
    if (
        surface == "production"
        and event_type == "production.job.created"
        and isinstance(authoritative.get("intent"), Mapping)
    ):
        evidence = authoritative.get("evidence")
        if not isinstance(evidence, Mapping):
            return authoritative
        authoritative["evidence"] = {
            **dict(evidence),
            "actor": principal.actor_id,
            "capturedAt": _canonical_millisecond_utc(captured_at),
        }
        return authoritative
    if surface != "commerce":
        return authoritative
    if event_type == "commerce.workspace.initialized":
        evidence = authoritative.get("evidence")
        if not isinstance(evidence, Mapping):
            return authoritative
        authoritative["evidence"] = {
            **dict(evidence),
            "actor": principal.actor_id,
            "capturedAt": captured_at,
        }
        return authoritative
    if event_type in {
        "commerce.inventory.initialized",
        "commerce.inventory.master_created",
        "commerce.inventory.transferred",
    }:
        evidence = authoritative.get("evidence")
        state = authoritative.get("state")
        foundation = (
            state.get("inventoryFoundation") if isinstance(state, Mapping) else None
        )
        if (
            not isinstance(evidence, Mapping)
            or not isinstance(state, Mapping)
            or not isinstance(foundation, Mapping)
        ):
            return authoritative
        commands = foundation.get("commands")
        previous_captured_at = None
        if (
            isinstance(commands, list)
            and len(commands) > 1
            and isinstance(commands[-2], Mapping)
        ):
            previous_payload = commands[-2].get("payload")
            previous_proof = (
                previous_payload.get("proof")
                if isinstance(previous_payload, Mapping)
                else None
            )
            previous_captured_at = (
                previous_proof.get("capturedAt")
                if isinstance(previous_proof, Mapping)
                else None
            )
        effective_captured_at = _not_before(captured_at, previous_captured_at)
        authoritative_evidence = {
            **dict(evidence),
            "actor": principal.actor_id,
            "capturedAt": effective_captured_at,
        }
        try:
            authoritative_foundation = restamp_latest_shop_inventory_command(
                foundation,
                action_id=str(authoritative_evidence.get("actionId", "")),
                actor=principal.actor_id,
                captured_at=effective_captured_at,
            )
        except ShopInventoryValidationError as exc:
            raise TrialValidationError(str(exc)) from exc
        authoritative_state = dict(state)
        authoritative_state["inventoryFoundation"] = authoritative_foundation
        authoritative["evidence"] = authoritative_evidence
        authoritative["state"] = authoritative_state
        return authoritative
    if event_type == "commerce.item.updated":
        evidence = authoritative.get("evidence")
        state = authoritative.get("state")
        changes = state.get("catalogChanges") if isinstance(state, Mapping) else None
        if (
            not isinstance(evidence, Mapping)
            or not isinstance(state, Mapping)
            or not isinstance(changes, list)
            or not changes
            or not isinstance(changes[0], Mapping)
            or not isinstance(changes[0].get("proof"), Mapping)
            or changes[0]["proof"].get("actionId") != evidence.get("actionId")
        ):
            return authoritative
        target_sku = changes[0].get("sku")
        prior_change = next(
            (
                change
                for change in changes[1:]
                if isinstance(change, Mapping)
                and change.get("sku") == target_sku
                and isinstance(change.get("proof"), Mapping)
            ),
            None,
        )
        effective_captured_at = _not_before(
            captured_at,
            prior_change["proof"].get("capturedAt")
            if isinstance(prior_change, Mapping)
            else None,
        )
        authoritative_evidence = dict(evidence)
        authoritative_evidence["actor"] = principal.actor_id
        authoritative_evidence["capturedAt"] = effective_captured_at
        authoritative_change = dict(changes[0])
        authoritative_change["proof"] = deepcopy(authoritative_evidence)
        authoritative_state = dict(state)
        authoritative_state["catalogChanges"] = [
            authoritative_change,
            *deepcopy(changes[1:]),
        ]
        baselines = state.get("catalogBaselines")
        if isinstance(baselines, list):
            authoritative_baselines = deepcopy(baselines)
            for index, baseline in enumerate(authoritative_baselines):
                proof = baseline.get("proof") if isinstance(baseline, Mapping) else None
                if (
                    isinstance(proof, Mapping)
                    and baseline.get("sku") == target_sku
                    and proof.get("actionId") == evidence.get("actionId")
                ):
                    authoritative_baseline = dict(baseline)
                    authoritative_baseline["proof"] = deepcopy(authoritative_evidence)
                    projection = [
                        "supermega.commerce.catalog-baseline.v1",
                        authoritative_baseline.get("sku"),
                        authoritative_baseline.get("price"),
                        authoritative_baseline.get("reorderAt"),
                        [
                            authoritative_evidence.get("actionId"),
                            authoritative_evidence.get("capturedAt"),
                            authoritative_evidence.get("actor"),
                            authoritative_evidence.get("reason"),
                            authoritative_evidence.get("evidenceReference"),
                        ],
                    ]
                    encoded = json.dumps(
                        projection,
                        ensure_ascii=False,
                        separators=(",", ":"),
                    ).encode("utf-8")
                    authoritative_baseline["anchorDigest"] = (
                        f"sha256:{sha256(encoded).hexdigest()}"
                    )
                    authoritative_baselines[index] = authoritative_baseline
            authoritative_state["catalogBaselines"] = authoritative_baselines
        authoritative["evidence"] = authoritative_evidence
        authoritative["state"] = authoritative_state
        return authoritative
    if event_type == "commerce.website_intake.created":
        state = authoritative.get("state")
        intakes = state.get("websiteIntakes") if isinstance(state, Mapping) else None
        if (
            not isinstance(state, Mapping)
            or not isinstance(intakes, list)
            or not intakes
            or not isinstance(intakes[0], Mapping)
            or not isinstance(intakes[0].get("source"), Mapping)
            or not isinstance(intakes[0].get("creation"), Mapping)
        ):
            return authoritative
        intake = dict(intakes[0])
        source = intake["source"]
        creation = intake["creation"]
        projection = [
            "supermega.commerce.website-intake.snapshot.v1",
            intake.get("id"),
            intake.get("createdAt"),
            [
                source.get("fingerprint"),
                source.get("approvalId"),
                source.get("snapshotId"),
                source.get("pageId"),
                source.get("siteName"),
                source.get("pagePath"),
            ],
            intake.get("sku"),
            intake.get("quantity"),
            intake.get("itemName"),
            intake.get("itemVariant"),
            intake.get("unitPrice"),
            intake.get("total"),
            [
                creation.get("actionId"),
                creation.get("capturedAt"),
                creation.get("actor"),
                creation.get("reason"),
                creation.get("evidenceReference"),
            ],
        ]
        encoded = json.dumps(
            projection,
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")
        intake["snapshotDigest"] = f"sha256:{sha256(encoded).hexdigest()}"
        authoritative_state = dict(state)
        authoritative_state["websiteIntakes"] = [
            intake,
            *deepcopy(intakes[1:]),
        ]
        authoritative["state"] = authoritative_state
        return authoritative
    if event_type == "commerce.website_intake.converted":
        evidence = authoritative.get("evidence")
        state = authoritative.get("state")
        orders = state.get("orders") if isinstance(state, Mapping) else None
        movements = state.get("movements") if isinstance(state, Mapping) else None
        intakes = state.get("websiteIntakes") if isinstance(state, Mapping) else None
        if (
            not isinstance(evidence, Mapping)
            or not isinstance(state, Mapping)
            or not isinstance(orders, list)
            or not isinstance(movements, list)
            or not isinstance(intakes, list)
        ):
            return authoritative
        action_id = evidence.get("actionId")
        target = next(
            (
                (index, intake["conversion"])
                for index, intake in enumerate(intakes)
                if isinstance(intake, Mapping)
                and isinstance(intake.get("conversion"), Mapping)
                and intake["conversion"].get("actionId") == action_id
                and isinstance(intake["conversion"].get("orderId"), str)
            ),
            None,
        )
        if target is None:
            return authoritative
        intake_index, conversion = target
        order_id = conversion["orderId"]
        authoritative_evidence = dict(evidence)
        authoritative_evidence["actor"] = principal.actor_id
        authoritative_evidence["capturedAt"] = captured_at
        authoritative_intakes = deepcopy(intakes)
        authoritative_intake = dict(authoritative_intakes[intake_index])
        authoritative_intake["conversion"] = {
            **authoritative_evidence,
            "orderId": order_id,
        }
        authoritative_intakes[intake_index] = authoritative_intake
        authoritative_orders = deepcopy(orders)
        for order_index, order in enumerate(authoritative_orders):
            if isinstance(order, Mapping) and order.get("id") == order_id:
                authoritative_order = dict(order)
                authoritative_order["createdAt"] = captured_at
                authoritative_order["owner"] = principal.actor_id
                calculation = _authoritative_order_calculation(state, order)
                if calculation is not None:
                    authoritative_order["calculation"] = calculation
                    authoritative_order["total"] = calculation["totalMmk"]
                authoritative_orders[order_index] = authoritative_order
        authoritative_movements = deepcopy(movements)
        for movement_index, movement in enumerate(authoritative_movements):
            if (
                isinstance(movement, Mapping)
                and movement.get("kind") == "reserve"
                and movement.get("actionId") == action_id
                and movement.get("orderId") == order_id
            ):
                authoritative_movement = dict(movement)
                authoritative_movement["actor"] = principal.actor_id
                authoritative_movement["createdAt"] = captured_at
                authoritative_movements[movement_index] = authoritative_movement
        authoritative_state = _restamp_order_inventory(
            {
                **dict(state),
                "websiteIntakes": authoritative_intakes,
                "orders": authoritative_orders,
                "movements": authoritative_movements,
            },
            kind="order_reserve",
            action_id=str(action_id),
            actor=principal.actor_id,
            captured_at=captured_at,
        )
        authoritative["evidence"] = authoritative_evidence
        authoritative["state"] = authoritative_state
        return authoritative
    if (
        event_type == "commerce.storefront_request.received"
        and isinstance(authoritative.get("intent"), Mapping)
    ):
        evidence = authoritative.get("evidence")
        if not isinstance(evidence, Mapping):
            return authoritative
        authoritative["evidence"] = {
            **dict(evidence),
            "actor": principal.actor_id,
            "capturedAt": captured_at,
        }
        return authoritative
    if event_type == "commerce.order.created":
        evidence = authoritative.get("evidence")
        if isinstance(authoritative.get("intent"), Mapping):
            if not isinstance(evidence, Mapping):
                return authoritative
            authoritative["evidence"] = {
                **dict(evidence),
                "actor": principal.actor_id,
                "capturedAt": captured_at,
            }
            return authoritative
        state = authoritative.get("state")
        orders = state.get("orders") if isinstance(state, Mapping) else None
        movements = state.get("movements") if isinstance(state, Mapping) else None
        if (
            not isinstance(evidence, Mapping)
            or not isinstance(state, Mapping)
            or not isinstance(orders, list)
            or not isinstance(movements, list)
        ):
            return authoritative
        authoritative_evidence = dict(evidence)
        authoritative_evidence["actor"] = principal.actor_id
        authoritative_evidence["capturedAt"] = captured_at
        target_order_ids = {
            movement.get("orderId")
            for movement in movements
            if isinstance(movement, Mapping)
            and movement.get("kind") == "reserve"
            and movement.get("actionId") == evidence.get("actionId")
            and isinstance(movement.get("orderId"), str)
        }
        authoritative_orders = deepcopy(orders)
        for order_index, order in enumerate(authoritative_orders):
            if (
                isinstance(order, Mapping)
                and order.get("id") in target_order_ids
            ):
                authoritative_order = dict(order)
                authoritative_order["createdAt"] = captured_at
                authoritative_order["owner"] = principal.actor_id
                calculation = _authoritative_order_calculation(state, order)
                if calculation is not None:
                    authoritative_order["calculation"] = calculation
                    authoritative_order["total"] = calculation["totalMmk"]
                authoritative_orders[order_index] = authoritative_order
        authoritative_movements = deepcopy(movements)
        for movement_index, movement in enumerate(authoritative_movements):
            if (
                isinstance(movement, Mapping)
                and movement.get("kind") == "reserve"
                and movement.get("actionId") == evidence.get("actionId")
            ):
                authoritative_movement = dict(movement)
                authoritative_movement["actor"] = principal.actor_id
                authoritative_movement["createdAt"] = captured_at
                authoritative_movements[movement_index] = authoritative_movement
        authoritative_state = _restamp_order_inventory(
            {
                **dict(state),
                "orders": authoritative_orders,
                "movements": authoritative_movements,
            },
            kind="order_reserve",
            action_id=str(evidence.get("actionId", "")),
            actor=principal.actor_id,
            captured_at=captured_at,
        )
        authoritative["evidence"] = authoritative_evidence
        authoritative["state"] = authoritative_state
        return authoritative
    if event_type == "commerce.order.cancelled":
        evidence = authoritative.get("evidence")
        state = authoritative.get("state")
        orders = state.get("orders") if isinstance(state, Mapping) else None
        movements = state.get("movements") if isinstance(state, Mapping) else None
        if (
            not isinstance(evidence, Mapping)
            or not isinstance(state, Mapping)
            or not isinstance(orders, list)
            or not isinstance(movements, list)
        ):
            return authoritative
        target_order_ids = {
            movement.get("orderId")
            for movement in movements
            if isinstance(movement, Mapping)
            and movement.get("kind") == "release"
            and movement.get("actionId") == evidence.get("actionId")
            and isinstance(movement.get("orderId"), str)
        }
        target_order_id = next(iter(target_order_ids)) if len(target_order_ids) == 1 else None
        target_order = next(
            (
                order
                for order in orders
                if isinstance(order, Mapping) and order.get("id") == target_order_id
            ),
            None,
        )
        effective_captured_at = _not_before(
            captured_at,
            target_order.get("createdAt") if isinstance(target_order, Mapping) else None,
            target_order.get("paymentReconciledAt") if isinstance(target_order, Mapping) else None,
            *(
                movement.get("createdAt")
                for movement in movements
                if isinstance(movement, Mapping)
                and movement.get("orderId") == target_order_id
                and movement.get("actionId") != evidence.get("actionId")
            ),
        )
        authoritative_evidence = {
            **dict(evidence),
            "actor": principal.actor_id,
            "capturedAt": effective_captured_at,
        }
        authoritative_movements = deepcopy(movements)
        for movement_index, movement in enumerate(authoritative_movements):
            if (
                isinstance(movement, Mapping)
                and movement.get("kind") == "release"
                and movement.get("actionId") == evidence.get("actionId")
            ):
                authoritative_movements[movement_index] = {
                    **dict(movement),
                    "actor": principal.actor_id,
                    "createdAt": effective_captured_at,
                }
        authoritative_state = _restamp_order_inventory(
            {**dict(state), "movements": authoritative_movements},
            kind="order_release",
            action_id=str(evidence.get("actionId", "")),
            actor=principal.actor_id,
            captured_at=effective_captured_at,
        )
        authoritative["evidence"] = authoritative_evidence
        authoritative["state"] = authoritative_state
        return authoritative
    if event_type == "commerce.purchase_order.created":
        evidence = authoritative.get("evidence")
        state = authoritative.get("state")
        purchase_orders = (
            state.get("purchaseOrders") if isinstance(state, Mapping) else None
        )
        if (
            not isinstance(evidence, Mapping)
            or not isinstance(state, Mapping)
            or not isinstance(purchase_orders, list)
            or not purchase_orders
            or not isinstance(purchase_orders[0], Mapping)
            or not isinstance(purchase_orders[0].get("creation"), Mapping)
            or purchase_orders[0]["creation"].get("actionId")
            != evidence.get("actionId")
        ):
            return authoritative
        authoritative_evidence = dict(evidence)
        authoritative_evidence["actor"] = principal.actor_id
        authoritative_evidence["capturedAt"] = captured_at
        authoritative_purchase_order = dict(purchase_orders[0])
        authoritative_purchase_order["createdAt"] = captured_at
        authoritative_purchase_order["creation"] = deepcopy(
            authoritative_evidence
        )
        authoritative_state = dict(state)
        authoritative_state["purchaseOrders"] = [
            authoritative_purchase_order,
            *deepcopy(purchase_orders[1:]),
        ]
        authoritative["evidence"] = authoritative_evidence
        authoritative["state"] = authoritative_state
        return authoritative
    if event_type == "commerce.purchase_order.received":
        evidence = authoritative.get("evidence")
        state = authoritative.get("state")
        movements = state.get("movements") if isinstance(state, Mapping) else None
        foundation = (
            state.get("inventoryFoundation") if isinstance(state, Mapping) else None
        )
        purchase_orders = (
            state.get("purchaseOrders") if isinstance(state, Mapping) else None
        )
        if (
            not isinstance(evidence, Mapping)
            or not isinstance(state, Mapping)
            or not isinstance(movements, list)
            or not movements
            or not isinstance(movements[0], Mapping)
            or not isinstance(purchase_orders, list)
        ):
            return authoritative
        receipt = movements[0]
        purchase_order_id = receipt.get("purchaseOrderId")
        purchase_order = next(
            (
                candidate
                for candidate in purchase_orders
                if isinstance(candidate, Mapping)
                and candidate.get("id") == purchase_order_id
            ),
            None,
        )
        if (
            receipt.get("kind") != "receipt"
            or receipt.get("actionId") != evidence.get("actionId")
            or not isinstance(purchase_order_id, str)
            or not isinstance(purchase_order, Mapping)
        ):
            return authoritative
        location_receipt_matches = False
        previous_inventory_captured_at = None
        commands = foundation.get("commands") if isinstance(foundation, Mapping) else None
        if (
            isinstance(commands, list)
            and commands
            and isinstance(commands[-1], Mapping)
        ):
            latest_payload = commands[-1].get("payload")
            latest_proof = (
                latest_payload.get("proof")
                if isinstance(latest_payload, Mapping)
                else None
            )
            location_receipt_matches = bool(
                isinstance(latest_payload, Mapping)
                and latest_payload.get("kind") == "receipt"
                and isinstance(latest_proof, Mapping)
                and latest_proof.get("actionId") == evidence.get("actionId")
            )
            if (
                location_receipt_matches
                and len(commands) > 1
                and isinstance(commands[-2], Mapping)
            ):
                previous_payload = commands[-2].get("payload")
                previous_proof = (
                    previous_payload.get("proof")
                    if isinstance(previous_payload, Mapping)
                    else None
                )
                previous_inventory_captured_at = (
                    previous_proof.get("capturedAt")
                    if isinstance(previous_proof, Mapping)
                    else None
                )
        effective_captured_at = _not_before(
            captured_at,
            purchase_order.get("createdAt"),
            previous_inventory_captured_at,
            *(
                prior.get("createdAt")
                for prior in movements[1:]
                if isinstance(prior, Mapping)
                and prior.get("kind") == "receipt"
                and prior.get("purchaseOrderId") == purchase_order_id
            ),
        )
        authoritative_evidence = dict(evidence)
        authoritative_evidence["actor"] = principal.actor_id
        authoritative_evidence["capturedAt"] = effective_captured_at
        authoritative_movement = dict(receipt)
        authoritative_movement["actor"] = principal.actor_id
        authoritative_movement["createdAt"] = effective_captured_at
        authoritative_state = dict(state)
        authoritative_state["movements"] = [
            authoritative_movement,
            *deepcopy(movements[1:]),
        ]
        if location_receipt_matches and isinstance(foundation, Mapping):
            try:
                authoritative_state["inventoryFoundation"] = (
                    restamp_latest_shop_inventory_command(
                        foundation,
                        action_id=str(authoritative_evidence.get("actionId", "")),
                        actor=principal.actor_id,
                        captured_at=effective_captured_at,
                    )
                )
            except ShopInventoryValidationError as exc:
                raise TrialValidationError(str(exc)) from exc
        authoritative["evidence"] = authoritative_evidence
        authoritative["state"] = authoritative_state
        return authoritative
    if event_type == "commerce.purchase_order.cancelled":
        evidence = authoritative.get("evidence")
        state = authoritative.get("state")
        movements = state.get("movements") if isinstance(state, Mapping) else None
        purchase_orders = (
            state.get("purchaseOrders") if isinstance(state, Mapping) else None
        )
        if (
            not isinstance(evidence, Mapping)
            or not isinstance(state, Mapping)
            or not isinstance(movements, list)
            or not isinstance(purchase_orders, list)
        ):
            return authoritative
        cancellation_matches = [
            (purchase_order_index, purchase_order)
            for purchase_order_index, purchase_order in enumerate(purchase_orders)
            if isinstance(purchase_order, Mapping)
            and isinstance(purchase_order.get("cancellation"), Mapping)
            and purchase_order["cancellation"].get("actionId")
            == evidence.get("actionId")
        ]
        if len(cancellation_matches) != 1:
            return authoritative
        purchase_order_index, purchase_order = cancellation_matches[0]
        purchase_order_id = purchase_order.get("id")
        if not isinstance(purchase_order_id, str):
            return authoritative
        effective_captured_at = _not_before(
            captured_at,
            purchase_order.get("createdAt"),
            *(
                movement.get("createdAt")
                for movement in movements
                if isinstance(movement, Mapping)
                and movement.get("kind") == "receipt"
                and movement.get("purchaseOrderId") == purchase_order_id
            ),
        )
        authoritative_evidence = dict(evidence)
        authoritative_evidence["actor"] = principal.actor_id
        authoritative_evidence["capturedAt"] = effective_captured_at
        authoritative_purchase_order = dict(purchase_order)
        authoritative_purchase_order["cancellation"] = deepcopy(
            authoritative_evidence
        )
        authoritative_purchase_orders = deepcopy(purchase_orders)
        authoritative_purchase_orders[purchase_order_index] = (
            authoritative_purchase_order
        )
        authoritative_state = dict(state)
        authoritative_state["purchaseOrders"] = authoritative_purchase_orders
        authoritative["evidence"] = authoritative_evidence
        authoritative["state"] = authoritative_state
        return authoritative
    if event_type == "commerce.collection_action.recorded":
        evidence = authoritative.get("evidence")
        state = authoritative.get("state")
        orders = state.get("orders") if isinstance(state, Mapping) else None
        if (
            not isinstance(evidence, Mapping)
            or not isinstance(state, Mapping)
            or not isinstance(orders, list)
        ):
            return authoritative
        contacted_order = next(
            (
                order
                for order in orders
                if isinstance(order, Mapping)
                and isinstance(order.get("collectionActions"), list)
                and order["collectionActions"]
                and isinstance(order["collectionActions"][0], Mapping)
                and isinstance(order["collectionActions"][0].get("proof"), Mapping)
                and order["collectionActions"][0]["proof"].get("actionId")
                == evidence.get("actionId")
            ),
            None,
        )
        effective_captured_at = captured_at
        if contacted_order is not None:
            prior_actions = contacted_order.get("collectionActions", [])[1:]
            effective_captured_at = _not_before(
                captured_at,
                contacted_order.get("createdAt"),
                *(
                    action.get("proof", {}).get("capturedAt")
                    for action in prior_actions
                    if isinstance(action, Mapping)
                    and isinstance(action.get("proof"), Mapping)
                ),
            )
        authoritative_evidence = {
            **dict(evidence),
            "actor": principal.actor_id,
            "capturedAt": effective_captured_at,
        }
        authoritative_orders = deepcopy(orders)
        for order_index, order in enumerate(authoritative_orders):
            actions = order.get("collectionActions") if isinstance(order, Mapping) else None
            if (
                not isinstance(actions, list)
                or not actions
                or not isinstance(actions[0], Mapping)
                or not isinstance(actions[0].get("proof"), Mapping)
                or actions[0]["proof"].get("actionId") != evidence.get("actionId")
            ):
                continue
            authoritative_action = dict(actions[0])
            authoritative_action["proof"] = deepcopy(authoritative_evidence)
            authoritative_order = dict(order)
            authoritative_order["collectionActions"] = [
                authoritative_action,
                *deepcopy(actions[1:]),
            ]
            authoritative_orders[order_index] = authoritative_order
        authoritative_state = dict(state)
        authoritative_state["orders"] = authoritative_orders
        authoritative["evidence"] = authoritative_evidence
        authoritative["state"] = authoritative_state
        return authoritative
    if event_type == "commerce.payment.reconciled":
        evidence = authoritative.get("evidence")
        state = authoritative.get("state")
        orders = state.get("orders") if isinstance(state, Mapping) else None
        if (
            not isinstance(evidence, Mapping)
            or not isinstance(state, Mapping)
            or not isinstance(orders, list)
        ):
            return authoritative
        authoritative_evidence = dict(evidence)
        authoritative_evidence["actor"] = principal.actor_id
        authoritative_evidence["capturedAt"] = captured_at
        authoritative_orders = deepcopy(orders)
        for order_index, order in enumerate(authoritative_orders):
            if (
                isinstance(order, Mapping)
                and order.get("paymentReconciliationActionId")
                == evidence.get("actionId")
            ):
                authoritative_order = dict(order)
                authoritative_order["paymentReconciledAt"] = captured_at
                authoritative_order["paymentReconciledBy"] = principal.actor_id
                authoritative_orders[order_index] = authoritative_order
        authoritative_state = dict(state)
        authoritative_state["orders"] = authoritative_orders
        authoritative["evidence"] = authoritative_evidence
        authoritative["state"] = authoritative_state
        return authoritative
    if event_type == "commerce.order.advanced":
        evidence = authoritative.get("evidence")
        state = authoritative.get("state")
        orders = state.get("orders") if isinstance(state, Mapping) else None
        movements = state.get("movements") if isinstance(state, Mapping) else None
        if (
            not isinstance(evidence, Mapping)
            or not isinstance(state, Mapping)
            or not isinstance(orders, list)
            or not isinstance(movements, list)
        ):
            return authoritative
        completion_order = next(
            (
                order
                for order in orders
                if isinstance(order, Mapping)
                and isinstance(order.get("completion"), Mapping)
                and order["completion"].get("actionId")
                == evidence.get("actionId")
            ),
            None,
        )
        effective_captured_at = captured_at
        if completion_order is not None:
            effective_captured_at = _not_before(
                captured_at,
                completion_order.get("createdAt"),
                completion_order.get("paymentReconciledAt"),
                *(
                    movement.get("createdAt")
                    for movement in movements
                    if isinstance(movement, Mapping)
                    and movement.get("orderId") == completion_order.get("id")
                ),
            )
        authoritative_evidence = dict(evidence)
        authoritative_evidence["actor"] = principal.actor_id
        authoritative_evidence["capturedAt"] = effective_captured_at
        authoritative_orders = deepcopy(orders)
        for index, order in enumerate(authoritative_orders):
            completion = order.get("completion") if isinstance(order, Mapping) else None
            if (
                isinstance(completion, Mapping)
                and completion.get("actionId") == evidence.get("actionId")
            ):
                authoritative_order = dict(order)
                authoritative_order["completion"] = deepcopy(
                    authoritative_evidence
                )
                authoritative_orders[index] = authoritative_order
        authoritative_state = _restamp_order_inventory(
            {**dict(state), "orders": authoritative_orders},
            kind="order_fulfil",
            action_id=str(evidence.get("actionId", "")),
            actor=principal.actor_id,
            captured_at=effective_captured_at,
        )
        authoritative["evidence"] = authoritative_evidence
        authoritative["state"] = authoritative_state
        return authoritative
    if event_type in {
        "commerce.order.support_case_opened",
        "commerce.order.support_case_reopened",
        "commerce.order.support_case_service_recorded",
        "commerce.order.support_case_resolved",
    }:
        evidence = authoritative.get("evidence")
        state = authoritative.get("state")
        orders = state.get("orders") if isinstance(state, Mapping) else None
        if not isinstance(evidence, Mapping) or not isinstance(state, Mapping) or not isinstance(orders, list):
            return authoritative
        target_order = None
        target_case = None
        for order in orders:
            if not isinstance(order, Mapping):
                continue
            for support_case in order.get("supportCases", []):
                if not isinstance(support_case, Mapping):
                    continue
                if event_type == "commerce.order.support_case_opened":
                    proof = support_case.get("opening")
                elif event_type == "commerce.order.support_case_reopened":
                    reopen = support_case.get("reopen")
                    proof = reopen.get("proof") if isinstance(reopen, Mapping) else None
                elif event_type == "commerce.order.support_case_service_recorded":
                    proof = next(
                        (
                            service_event.get("proof")
                            for service_event in [
                                *support_case.get("serviceEvents", []),
                                *support_case.get("followUpServiceEvents", []),
                            ]
                            if isinstance(service_event, Mapping)
                            and isinstance(service_event.get("proof"), Mapping)
                            and service_event["proof"].get("actionId") == evidence.get("actionId")
                        ),
                        None,
                    )
                else:
                    resolutions = [support_case.get("resolution"), support_case.get("followUpResolution")]
                    proof = next(
                        (
                            resolution.get("proof")
                            for resolution in resolutions
                            if isinstance(resolution, Mapping)
                            and isinstance(resolution.get("proof"), Mapping)
                            and resolution["proof"].get("actionId") == evidence.get("actionId")
                        ),
                        None,
                    )
                if isinstance(proof, Mapping) and proof.get("actionId") == evidence.get("actionId"):
                    target_order = order
                    target_case = support_case
                    break
            if target_case is not None:
                break
        effective_captured_at = captured_at
        if isinstance(target_order, Mapping) and isinstance(target_case, Mapping):
            completion = target_order.get("completion")
            opening = target_case.get("opening")
            service_events = [
                *target_case.get("serviceEvents", []),
                *target_case.get("followUpServiceEvents", []),
            ]
            original_resolution = target_case.get("resolution")
            reopen = target_case.get("reopen")
            effective_captured_at = _not_before(
                captured_at,
                target_order.get("createdAt"),
                completion.get("capturedAt") if isinstance(completion, Mapping) else None,
                target_case.get("customerRequestedAt"),
                opening.get("capturedAt") if isinstance(opening, Mapping) else None,
                *(
                    service_event.get("proof", {}).get("capturedAt")
                    for service_event in service_events
                    if isinstance(service_event, Mapping)
                    and isinstance(service_event.get("proof"), Mapping)
                ),
                original_resolution.get("proof", {}).get("capturedAt")
                if isinstance(original_resolution, Mapping)
                and isinstance(original_resolution.get("proof"), Mapping)
                else None,
                reopen.get("proof", {}).get("capturedAt")
                if isinstance(reopen, Mapping)
                and isinstance(reopen.get("proof"), Mapping)
                else None,
            )
        authoritative_evidence = dict(evidence)
        authoritative_evidence["actor"] = principal.actor_id
        authoritative_evidence["capturedAt"] = effective_captured_at
        authoritative_orders = deepcopy(orders)
        for order_index, order in enumerate(authoritative_orders):
            if not isinstance(order, Mapping):
                continue
            cases = order.get("supportCases")
            if not isinstance(cases, list):
                continue
            changed_cases = deepcopy(cases)
            changed = False
            for case_index, support_case in enumerate(changed_cases):
                if not isinstance(support_case, Mapping):
                    continue
                changed_case = dict(support_case)
                if event_type == "commerce.order.support_case_opened":
                    proof = support_case.get("opening")
                    if not isinstance(proof, Mapping) or proof.get("actionId") != evidence.get("actionId"):
                        continue
                    changed_proof = dict(proof)
                    changed_proof["actor"] = principal.actor_id
                    changed_proof["capturedAt"] = effective_captured_at
                    changed_case["opening"] = changed_proof
                elif event_type == "commerce.order.support_case_reopened":
                    reopen = support_case.get("reopen")
                    proof = reopen.get("proof") if isinstance(reopen, Mapping) else None
                    if not isinstance(proof, Mapping) or proof.get("actionId") != evidence.get("actionId"):
                        continue
                    changed_proof = dict(proof)
                    changed_proof["actor"] = principal.actor_id
                    changed_proof["capturedAt"] = effective_captured_at
                    changed_reopen = dict(reopen)
                    changed_reopen["proof"] = changed_proof
                    changed_case["reopen"] = changed_reopen
                elif event_type == "commerce.order.support_case_service_recorded":
                    event_field = (
                        "followUpServiceEvents"
                        if isinstance(support_case.get("reopen"), Mapping)
                        else "serviceEvents"
                    )
                    service_events = support_case.get(event_field)
                    if not isinstance(service_events, list):
                        continue
                    changed_events = deepcopy(service_events)
                    event_changed = False
                    for service_index, service_event in enumerate(changed_events):
                        if not isinstance(service_event, Mapping):
                            continue
                        proof = service_event.get("proof")
                        if not isinstance(proof, Mapping) or proof.get("actionId") != evidence.get("actionId"):
                            continue
                        changed_proof = dict(proof)
                        changed_proof["actor"] = principal.actor_id
                        changed_proof["capturedAt"] = effective_captured_at
                        changed_event = dict(service_event)
                        changed_event["proof"] = changed_proof
                        changed_events[service_index] = changed_event
                        event_changed = True
                        break
                    if not event_changed:
                        continue
                    changed_case[event_field] = changed_events
                else:
                    resolution_field = (
                        "followUpResolution"
                        if isinstance(support_case.get("reopen"), Mapping)
                        else "resolution"
                    )
                    resolution = support_case.get(resolution_field)
                    proof = resolution.get("proof") if isinstance(resolution, Mapping) else None
                    if not isinstance(proof, Mapping) or proof.get("actionId") != evidence.get("actionId"):
                        continue
                    changed_proof = dict(proof)
                    changed_proof["actor"] = principal.actor_id
                    changed_proof["capturedAt"] = effective_captured_at
                    changed_resolution = dict(resolution)
                    changed_resolution["proof"] = changed_proof
                    changed_case[resolution_field] = changed_resolution
                changed_cases[case_index] = changed_case
                changed = True
                break
            if changed:
                changed_order = dict(order)
                changed_order["supportCases"] = changed_cases
                authoritative_orders[order_index] = changed_order
                break
        authoritative_state = dict(state)
        authoritative_state["orders"] = authoritative_orders
        authoritative["evidence"] = authoritative_evidence
        authoritative["state"] = authoritative_state
        return authoritative
    if event_type == "commerce.order.return_recorded":
        evidence = authoritative.get("evidence")
        state = authoritative.get("state")
        orders = state.get("orders") if isinstance(state, Mapping) else None
        movements = state.get("movements") if isinstance(state, Mapping) else None
        if (
            not isinstance(evidence, Mapping)
            or not isinstance(state, Mapping)
            or not isinstance(orders, list)
            or not isinstance(movements, list)
        ):
            return authoritative
        returned_order = next(
            (
                order
                for order in orders
                if isinstance(order, Mapping)
                and isinstance(order.get("returns"), list)
                and order["returns"]
                and isinstance(order["returns"][0], Mapping)
                and order["returns"][0].get("actionId")
                == evidence.get("actionId")
            ),
            None,
        )
        effective_captured_at = captured_at
        if returned_order is not None:
            prior_returns = returned_order.get("returns", [])[1:]
            completion = returned_order.get("completion")
            effective_captured_at = _not_before(
                captured_at,
                returned_order.get("createdAt"),
                returned_order.get("paymentReconciledAt"),
                completion.get("capturedAt")
                if isinstance(completion, Mapping)
                else None,
                *(
                    record.get("createdAt")
                    for record in prior_returns
                    if isinstance(record, Mapping)
                ),
                *(
                    movement.get("createdAt")
                    for movement in movements
                    if isinstance(movement, Mapping)
                    and movement.get("orderId") == returned_order.get("id")
                    and movement.get("actionId") != evidence.get("actionId")
                ),
            )
        authoritative_evidence = dict(evidence)
        authoritative_evidence["actor"] = principal.actor_id
        authoritative_evidence["capturedAt"] = effective_captured_at
        authoritative_orders = deepcopy(orders)
        for order_index, order in enumerate(authoritative_orders):
            returns = order.get("returns") if isinstance(order, Mapping) else None
            if (
                not isinstance(returns, list)
                or not returns
                or not isinstance(returns[0], Mapping)
                or returns[0].get("actionId") != evidence.get("actionId")
            ):
                continue
            authoritative_return = dict(returns[0])
            authoritative_return["actor"] = principal.actor_id
            authoritative_return["createdAt"] = effective_captured_at
            authoritative_order = dict(order)
            authoritative_order["returns"] = [
                authoritative_return,
                *deepcopy(returns[1:]),
            ]
            authoritative_orders[order_index] = authoritative_order
        authoritative_movements = deepcopy(movements)
        for movement_index, movement in enumerate(authoritative_movements):
            if (
                isinstance(movement, Mapping)
                and movement.get("kind") == "return"
                and movement.get("actionId") == evidence.get("actionId")
            ):
                authoritative_movement = dict(movement)
                authoritative_movement["actor"] = principal.actor_id
                authoritative_movement["createdAt"] = effective_captured_at
                authoritative_movements[movement_index] = authoritative_movement
        authoritative_state = dict(state)
        authoritative_state["orders"] = authoritative_orders
        authoritative_state["movements"] = authoritative_movements
        return_record = (
            returned_order["returns"][0]
            if isinstance(returned_order, Mapping)
            and isinstance(returned_order.get("returns"), list)
            and returned_order["returns"]
            and isinstance(returned_order["returns"][0], Mapping)
            else None
        )
        if (
            isinstance(return_record, Mapping)
            and return_record.get("disposition") == "restock"
        ):
            authoritative_state = _restamp_order_inventory(
                authoritative_state,
                kind="order_return",
                action_id=str(evidence.get("actionId", "")),
                actor=principal.actor_id,
                captured_at=effective_captured_at,
            )
        authoritative["evidence"] = authoritative_evidence
        authoritative["state"] = authoritative_state
        return authoritative
    if event_type in {
        "commerce.stock.counted",
        "commerce.production_material.issued",
        "commerce.production_material.returned",
        "commerce.production_batch.received",
    }:
        evidence = authoritative.get("evidence")
        state = authoritative.get("state")
        movements = state.get("movements") if isinstance(state, Mapping) else None
        if (
            not isinstance(evidence, Mapping)
            or not isinstance(state, Mapping)
            or not isinstance(movements, list)
            or not movements
            or not isinstance(movements[0], Mapping)
        ):
            return authoritative
        foundation = state.get("inventoryFoundation")
        location_command_kind = {
            "commerce.stock.counted": "count",
            "commerce.production_material.issued": "production_issue",
            "commerce.production_material.returned": "production_return",
            "commerce.production_batch.received": "production_receipt",
        }[event_type]
        location_command_matches = False
        previous_inventory_captured_at = None
        if isinstance(foundation, Mapping):
            commands = foundation.get("commands")
            if (
                isinstance(commands, list)
                and commands
                and isinstance(commands[-1], Mapping)
            ):
                latest_payload = commands[-1].get("payload")
                latest_proof = (
                    latest_payload.get("proof")
                    if isinstance(latest_payload, Mapping)
                    else None
                )
                location_command_matches = bool(
                    isinstance(latest_payload, Mapping)
                    and latest_payload.get("kind") == location_command_kind
                    and isinstance(latest_proof, Mapping)
                    and latest_proof.get("actionId") == evidence.get("actionId")
                )
                if (
                    location_command_matches
                    and len(commands) > 1
                    and isinstance(commands[-2], Mapping)
                ):
                    previous_payload = commands[-2].get("payload")
                    previous_proof = (
                        previous_payload.get("proof")
                        if isinstance(previous_payload, Mapping)
                        else None
                    )
                    previous_inventory_captured_at = (
                        previous_proof.get("capturedAt")
                        if isinstance(previous_proof, Mapping)
                        else None
                    )
        effective_captured_at = (
            _not_before(captured_at, previous_inventory_captured_at)
            if location_command_matches
            else captured_at
        )
        authoritative_evidence = dict(evidence)
        authoritative_evidence["actor"] = principal.actor_id
        authoritative_evidence["capturedAt"] = effective_captured_at
        authoritative_movement = dict(movements[0])
        authoritative_movement["actor"] = principal.actor_id
        authoritative_movement["createdAt"] = effective_captured_at
        authoritative_state = dict(state)
        authoritative_state["movements"] = [
            authoritative_movement,
            *deepcopy(movements[1:]),
        ]
        if location_command_matches and isinstance(foundation, Mapping):
            try:
                authoritative_state["inventoryFoundation"] = (
                    restamp_latest_shop_inventory_command(
                        foundation,
                        action_id=str(authoritative_evidence.get("actionId", "")),
                        actor=principal.actor_id,
                        captured_at=effective_captured_at,
                    )
                )
            except ShopInventoryValidationError as exc:
                raise TrialValidationError(str(exc)) from exc
        authoritative["evidence"] = authoritative_evidence
        authoritative["state"] = authoritative_state
        return authoritative
    if event_type == "commerce.close.saved":
        evidence = authoritative.get("evidence")
        state = authoritative.get("state")
        closes = state.get("closes") if isinstance(state, Mapping) else None
        if not isinstance(evidence, Mapping) or not isinstance(state, Mapping) or not isinstance(closes, list) or not closes or not isinstance(closes[0], Mapping):
            return authoritative
        authoritative_evidence = dict(evidence)
        authoritative_evidence["actor"] = principal.actor_id
        authoritative_evidence["capturedAt"] = captured_at
        authoritative_close = dict(closes[0])
        authoritative_close["operator"] = principal.actor_id
        authoritative_close["createdAt"] = captured_at
        authoritative_close["businessDate"] = _myanmar_business_date(captured_at)
        authoritative_closes = [authoritative_close, *deepcopy(closes[1:])]
        authoritative_state = dict(state)
        authoritative_state["closes"] = authoritative_closes
        authoritative["evidence"] = authoritative_evidence
        authoritative["state"] = authoritative_state
        return authoritative
    if event_type == "commerce.storefront.merchandising.imported":
        evidence = authoritative.get("evidence")
        if not isinstance(evidence, Mapping):
            return authoritative
        authoritative["evidence"] = {
            **dict(evidence),
            "actor": principal.actor_id,
            "capturedAt": _canonical_millisecond_utc(captured_at),
        }
        return authoritative
    if event_type == "commerce.tax_configuration.saved":
        evidence = authoritative.get("evidence")
        state = authoritative.get("state")
        configurations = state.get("taxConfigurations") if isinstance(state, Mapping) else None
        configuration = configurations[0] if isinstance(configurations, list) and configurations else None
        if (
            not isinstance(evidence, Mapping)
            or not isinstance(state, Mapping)
            or not isinstance(configuration, Mapping)
        ):
            return authoritative
        authoritative_evidence = {
            **dict(evidence),
            "actor": principal.actor_id,
            "capturedAt": captured_at,
        }
        authoritative_configuration = {
            **dict(configuration),
            "proof": deepcopy(authoritative_evidence),
        }
        authoritative_state = dict(state)
        authoritative_state["taxConfigurations"] = [
            authoritative_configuration,
            *deepcopy(configurations[1:]),
        ]
        authoritative["evidence"] = authoritative_evidence
        authoritative["state"] = authoritative_state
        return authoritative
    if event_type == "commerce.order.correction_recorded":
        evidence = authoritative.get("evidence")
        state = authoritative.get("state")
        orders = state.get("orders") if isinstance(state, Mapping) else None
        if not isinstance(evidence, Mapping) or not isinstance(state, Mapping) or not isinstance(orders, list):
            return authoritative
        corrected_order = next(
            (
                order
                for order in orders
                if isinstance(order, Mapping)
                and isinstance(order.get("corrections"), list)
                and order["corrections"]
                and isinstance(order["corrections"][0], Mapping)
                and order["corrections"][0].get("actionId") == evidence.get("actionId")
            ),
            None,
        )
        effective_captured_at = captured_at
        if corrected_order is not None:
            completion = corrected_order.get("completion")
            prior_corrections = corrected_order.get("corrections", [])[1:]
            effective_captured_at = _not_before(
                captured_at,
                corrected_order.get("createdAt"),
                corrected_order.get("paymentReconciledAt"),
                completion.get("capturedAt") if isinstance(completion, Mapping) else None,
                *(
                    record.get("createdAt")
                    for record in prior_corrections
                    if isinstance(record, Mapping)
                ),
            )
        authoritative_evidence = dict(evidence)
        authoritative_evidence["actor"] = principal.actor_id
        authoritative_evidence["capturedAt"] = effective_captured_at
        authoritative_orders = deepcopy(orders)
        for order_index, order in enumerate(authoritative_orders):
            corrections = order.get("corrections") if isinstance(order, Mapping) else None
            if (
                not isinstance(corrections, list)
                or not corrections
                or not isinstance(corrections[0], Mapping)
                or corrections[0].get("actionId") != evidence.get("actionId")
            ):
                continue
            authoritative_correction = dict(corrections[0])
            authoritative_correction["actor"] = principal.actor_id
            authoritative_correction["createdAt"] = effective_captured_at
            authoritative_order = dict(order)
            authoritative_order["corrections"] = [
                authoritative_correction,
                *deepcopy(corrections[1:]),
            ]
            authoritative_orders[order_index] = authoritative_order
        authoritative_state = dict(state)
        authoritative_state["orders"] = authoritative_orders
        authoritative["evidence"] = authoritative_evidence
        authoritative["state"] = authoritative_state
        return authoritative
    if event_type == "commerce.account_mapping.saved":
        evidence = authoritative.get("evidence")
        state = authoritative.get("state")
        configurations = state.get("accountMappingConfigurations") if isinstance(state, Mapping) else None
        configuration = configurations[0] if isinstance(configurations, list) and configurations else None
        if (
            not isinstance(evidence, Mapping)
            or not isinstance(state, Mapping)
            or not isinstance(configuration, Mapping)
        ):
            return authoritative
        authoritative_evidence = {
            **dict(evidence),
            "actor": principal.actor_id,
            "capturedAt": captured_at,
        }
        authoritative_configuration = {
            **dict(configuration),
            "proof": deepcopy(authoritative_evidence),
        }
        authoritative_state = dict(state)
        authoritative_state["accountMappingConfigurations"] = [
            authoritative_configuration,
            *deepcopy(configurations[1:]),
        ]
        authoritative["evidence"] = authoritative_evidence
        authoritative["state"] = authoritative_state
        return authoritative
    if event_type in {
        "commerce.customer_credit_policy.saved",
        "commerce.promotion_policy.saved",
        "commerce.shipping_policy.saved",
        "commerce.payment_policy.saved",
    }:
        evidence = authoritative.get("evidence")
        state = authoritative.get("state")
        policy_collection = (
            "customerCreditPolicies"
            if event_type == "commerce.customer_credit_policy.saved"
            else "promotionPolicies"
            if event_type == "commerce.promotion_policy.saved"
            else "shippingPolicies"
            if event_type == "commerce.shipping_policy.saved"
            else "paymentPolicies"
        )
        policies = state.get(policy_collection) if isinstance(state, Mapping) else None
        policy = policies[0] if isinstance(policies, list) and policies else None
        if (
            not isinstance(evidence, Mapping)
            or not isinstance(state, Mapping)
            or not isinstance(policy, Mapping)
        ):
            return authoritative
        authoritative_evidence = {
            **dict(evidence),
            "actor": principal.actor_id,
            "capturedAt": captured_at,
        }
        authoritative_policy = {
            **dict(policy),
            "proof": deepcopy(authoritative_evidence),
        }
        authoritative_state = dict(state)
        authoritative_state[policy_collection] = [
            authoritative_policy,
            *deepcopy(policies[1:]),
        ]
        authoritative["evidence"] = authoritative_evidence
        authoritative["state"] = authoritative_state
        return authoritative
    if event_type != "commerce.storefront.configuration.saved":
        return authoritative
    evidence = authoritative.get("evidence")
    state = authoritative.get("state")
    configuration = state.get("storefrontConfiguration") if isinstance(state, Mapping) else None
    if not isinstance(evidence, Mapping) or not isinstance(state, Mapping) or not isinstance(configuration, Mapping):
        return authoritative
    authoritative_evidence = dict(evidence)
    authoritative_evidence["actor"] = principal.actor_id
    authoritative_evidence["capturedAt"] = captured_at
    authoritative_configuration = dict(configuration)
    authoritative_configuration["saved"] = deepcopy(authoritative_evidence)
    authoritative_state = dict(state)
    authoritative_state["storefrontConfiguration"] = authoritative_configuration
    authoritative["evidence"] = authoritative_evidence
    authoritative["state"] = authoritative_state
    return authoritative


def _require_command_evidence_actor(
    payload: Mapping[str, Any],
    *,
    principal: TrialPrincipal,
    surface: str,
    event_type: str,
) -> None:
    if (
        surface != "production"
        and not (surface == "website" and event_type in HUMAN_COMMAND_EVENTS)
        and not (
            surface == "commerce"
            and event_type
            in {
                "commerce.service_schedule.initialized",
                "commerce.service_schedule.saved",
            }
        )
    ):
        return
    evidence = payload.get("evidence")
    if not isinstance(evidence, Mapping) or evidence.get("actor") != principal.actor_id:
        raise TrialValidationError(
            f"{surface.title()} evidence actor must match the authenticated principal."
        )


def _commerce_command_action_id(
    surface: str,
    payload: Mapping[str, Any],
) -> str | None:
    if surface != "commerce":
        return None
    evidence = payload.get("evidence")
    if not isinstance(evidence, Mapping):
        return None
    action_id = evidence.get("actionId")
    if (
        not isinstance(action_id, str)
        or not action_id
        or action_id != action_id.strip()
        or len(action_id) > 160
    ):
        return None
    return action_id


def _normalize_uuid(value: str | UUID, *, field_name: str) -> str:
    try:
        return str(UUID(str(value)))
    except (TypeError, ValueError, AttributeError) as exc:
        raise TrialValidationError(f"{field_name} must be a UUID.") from exc


def _normalize_surface(surface: str) -> str:
    normalized = str(surface or "").strip().lower()
    if normalized not in TRIAL_SURFACES:
        raise TrialValidationError(f"Unsupported trial surface: {normalized or 'missing'}")
    return normalized


def _normalize_event_type(event_type: str) -> str:
    normalized = str(event_type or "").strip().lower()
    if not normalized or len(normalized) > 80:
        raise TrialValidationError("event_type must contain between 1 and 80 characters.")
    allowed = set("abcdefghijklmnopqrstuvwxyz0123456789._-")
    if any(character not in allowed for character in normalized):
        raise TrialValidationError("event_type contains unsupported characters.")
    return normalized


def _normalize_related_surfaces(surface: str, related_surfaces: Sequence[str]) -> tuple[str, ...]:
    normalized: set[str] = set()
    for related_surface in related_surfaces:
        candidate = _normalize_surface(related_surface)
        if candidate != surface:
            normalized.add(candidate)
    return tuple(sorted(normalized))


def _json_object(value: Mapping[str, Any], *, field_name: str) -> JsonObject:
    if not isinstance(value, Mapping):
        raise TrialValidationError(f"{field_name} must be a JSON object.")
    try:
        encoded = json.dumps(
            dict(value),
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        )
    except (TypeError, ValueError) as exc:
        raise TrialValidationError(f"{field_name} must contain valid JSON values.") from exc
    if len(encoded.encode("utf-8")) > MAX_JSON_BYTES:
        raise TrialValidationError(f"{field_name} exceeds {MAX_JSON_BYTES} bytes.")
    return json.loads(encoded)


def _decision_packet(value: Mapping[str, Any]) -> JsonObject:
    packet = _json_object(value, field_name="proposal")
    allowed = {
        "contract",
        "subject",
        "decision",
        "claims",
        "baseline",
        "target",
        "result",
        "acceptance",
        "artifact_reference",
    }
    unknown = sorted(set(packet) - allowed)
    if unknown:
        raise TrialValidationError(f"proposal contains unsupported fields: {', '.join(unknown)}")
    if packet.get("contract") != DECISION_PACKET_CONTRACT:
        raise TrialValidationError(f"proposal.contract must be {DECISION_PACKET_CONTRACT}.")

    normalized: JsonObject = {"contract": DECISION_PACKET_CONTRACT}
    subject = packet.get("subject")
    if not isinstance(subject, Mapping) or set(subject) != {"kind", "id", "version"}:
        raise TrialValidationError("proposal.subject must contain only kind, id, and version.")
    subject_kind = str(subject.get("kind", "")).strip().lower()
    subject_id = str(subject.get("id", "")).strip()
    if not 1 <= len(subject_kind) <= 80 or any(character not in "abcdefghijklmnopqrstuvwxyz0123456789._-" for character in subject_kind):
        raise TrialValidationError("proposal.subject.kind contains unsupported characters.")
    try:
        subject_version = int(subject.get("version", 0) or 0)
    except (TypeError, ValueError):
        subject_version = 0
    if not 1 <= len(subject_id) <= 160 or subject_version != 1:
        raise TrialValidationError("proposal.subject requires a bounded id and version 1.")
    normalized["subject"] = {"kind": subject_kind, "id": subject_id, "version": 1}

    for field in ("decision", "baseline", "target", "result", "acceptance"):
        text = str(packet.get(field, "")).strip()
        if not 1 <= len(text) <= 500:
            raise TrialValidationError(f"proposal.{field} must contain between 1 and 500 characters.")
        normalized[field] = text

    artifact_reference = str(packet.get("artifact_reference", "")).strip()
    if not 1 <= len(artifact_reference) <= 200:
        raise TrialValidationError("proposal.artifact_reference must contain between 1 and 200 characters.")
    normalized["artifact_reference"] = artifact_reference

    claims = packet.get("claims")
    if not isinstance(claims, list) or not 1 <= len(claims) <= 20:
        raise TrialValidationError("proposal.claims must contain 1 to 20 structured claims.")
    normalized_claims = []
    claim_fields = {
        "id",
        "claim_type",
        "statement",
        "source_reference",
        "captured_at",
        "status",
        "uncertainty",
        "visibility",
        "digest",
    }
    for index, claim in enumerate(claims):
        if not isinstance(claim, Mapping) or set(claim) - claim_fields:
            raise TrialValidationError(f"proposal.claims[{index}] contains unsupported fields.")
        claim_id = str(claim.get("id", "")).strip()
        claim_type = str(claim.get("claim_type", "")).strip().lower()
        statement = str(claim.get("statement", "")).strip()
        source_reference = str(claim.get("source_reference", "")).strip()
        captured_at = str(claim.get("captured_at", "")).strip()
        status = str(claim.get("status", "")).strip().lower()
        uncertainty = str(claim.get("uncertainty", "")).strip().lower()
        visibility = str(claim.get("visibility", "")).strip().lower()
        digest = str(claim.get("digest", "") or "").strip().lower()
        if not 1 <= len(claim_id) <= 160:
            raise TrialValidationError(f"proposal.claims[{index}].id must contain between 1 and 160 characters.")
        if claim_type not in {"fact", "analysis"}:
            raise TrialValidationError(f"proposal.claims[{index}].claim_type must be fact or analysis.")
        if not 1 <= len(statement) <= 500 or not 1 <= len(source_reference) <= 200:
            raise TrialValidationError(f"proposal.claims[{index}] requires a bounded statement and source_reference.")
        try:
            captured = datetime.fromisoformat(captured_at.replace("Z", "+00:00"))
        except ValueError as exc:
            raise TrialValidationError(f"proposal.claims[{index}].captured_at must be an ISO-8601 timestamp.") from exc
        if captured.tzinfo is None:
            raise TrialValidationError(f"proposal.claims[{index}].captured_at must include a timezone.")
        if status not in {"observed", "verified"} or uncertainty not in {"low", "medium", "high"} or visibility not in {"private", "public"}:
            raise TrialValidationError(f"proposal.claims[{index}] has an unsupported status, uncertainty, or visibility.")
        if digest and (len(digest) != 71 or not digest.startswith("sha256:") or any(character not in "0123456789abcdef" for character in digest[7:])):
            raise TrialValidationError(f"proposal.claims[{index}].digest must be a lowercase sha256 digest.")
        if status == "verified" and not digest:
            raise TrialValidationError(f"proposal.claims[{index}] requires a digest when status is verified.")
        normalized_claims.append(
            {
                "id": claim_id,
                "claim_type": claim_type,
                "statement": statement,
                "source_reference": source_reference,
                "captured_at": captured.isoformat(),
                "status": status,
                "uncertainty": uncertainty,
                "visibility": visibility,
                **({"digest": digest} if digest else {}),
            }
        )
    normalized["claims"] = normalized_claims
    return normalized


def _decision_evidence_refs(packet: Mapping[str, Any], evidence_refs: Sequence[str]) -> tuple[str, ...]:
    evidence = tuple(str(item).strip() for item in evidence_refs if str(item).strip())
    if not evidence or len(evidence) > 20 or any(len(item) > 200 for item in evidence):
        raise TrialValidationError("evidence_refs must contain 1 to 20 references of at most 200 characters.")
    claim_sources = {str(claim["source_reference"]) for claim in packet.get("claims", [])}
    missing = sorted(claim_sources - set(evidence))
    if missing:
        raise TrialValidationError("Every decision claim source_reference must be present in evidence_refs.")
    return evidence


def _canonical_fingerprint(kind: str, payload: Mapping[str, Any]) -> str:
    normalized = _json_object(payload, field_name="fingerprint payload")
    encoded = json.dumps(
        {"kind": kind, "payload": normalized},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    return sha256(encoded).hexdigest()


def _required_surface_capability(surface: str) -> str:
    return SURFACE_WRITE_CAPABILITIES[_normalize_surface(surface)]


def has_surface_read_capability(capabilities: Sequence[str], surface: str) -> bool:
    surface_value = _normalize_surface(surface)
    granted = frozenset(capabilities)
    return (
        SURFACE_READ_CAPABILITIES[surface_value] in granted
        or SURFACE_WRITE_CAPABILITIES[surface_value] in granted
    )


def has_approval_read_capability(capabilities: Sequence[str]) -> bool:
    granted = frozenset(capabilities)
    return bool(
        granted.intersection(
            {
                APPROVAL_READ_CAPABILITY,
                APPROVAL_REQUEST_CAPABILITY,
                APPROVAL_DECIDE_CAPABILITY,
            }
        )
    )


def _require_surface_read_capability(capabilities: Sequence[str], surface: str) -> None:
    surface_value = _normalize_surface(surface)
    if not has_surface_read_capability(capabilities, surface_value):
        raise TrialPermissionDenied(SURFACE_READ_CAPABILITIES[surface_value])


def _require_approval_read_capability(capabilities: Sequence[str]) -> None:
    if not has_approval_read_capability(capabilities):
        raise TrialPermissionDenied(APPROVAL_READ_CAPABILITY)


def _principal_auth_ready(principal: TrialPrincipal | None) -> bool:
    if principal is None:
        return False
    normalized = principal.normalized()
    return bool(
        normalized.authenticated
        and normalized.workspace_id
        and normalized.actor_id
        and normalized.actor_kind in TRUSTED_ACTOR_KINDS
    )


def _iso_timestamp(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        normalized = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
        return normalized.astimezone(timezone.utc).isoformat()
    return str(value)


def _normalize_sql_source(value: Any) -> str:
    return " ".join(str(value or "").strip().lower().split())


def _require_human_decider(principal: TrialPrincipal) -> None:
    if principal.actor_kind != HUMAN_ACTOR_KIND:
        raise TrialHumanApprovalRequired()


def _approval_from_mapping(row: Mapping[str, Any], *, replay: bool = False) -> ApprovalRecord:
    evidence = row.get("evidence_refs", row.get("evidence_refs_json", []))
    proposal = row.get("proposal", row.get("proposal_json", {}))
    if isinstance(evidence, str):
        evidence = json.loads(evidence or "[]")
    if isinstance(proposal, str):
        proposal = json.loads(proposal or "{}")
    return ApprovalRecord(
        approval_id=str(row.get("approval_id", "")),
        command_id=str(row.get("command_id", "")),
        title=str(row.get("title", "")),
        proposal=_decision_packet(proposal or {}),
        evidence_refs=tuple(str(item) for item in (evidence or [])),
        status=str(row.get("status", "pending")),
        requested_by=str(row.get("requested_by", "")),
        requested_actor_kind=str(row.get("requested_actor_kind", "")),
        requested_at=_iso_timestamp(row.get("requested_at")),
        decided_by=str(row.get("decided_by", "") or ""),
        decided_actor_kind=str(row.get("decided_actor_kind", "") or ""),
        decided_at=_iso_timestamp(row.get("decided_at")),
        decision_note=str(row.get("decision_note", "") or ""),
        version=int(row.get("version", 0) or 0),
        idempotent_replay=replay,
    )


class PostgresTrialStore:
    """Server-only Postgres adapter for the private trial schema.

    The psycopg import is deliberately lazy so validation and authorization
    tests can run without a database or native driver. Production integration
    is not verified until the migration is applied and this adapter's readiness
    probe succeeds with a dedicated non-BYPASSRLS login role.
    """

    def __init__(self, database_url: str, *, reducer: StateReducer, write_enabled: bool = False):
        self.database_url = str(database_url or "").strip()
        self.reducer = reducer
        self.write_enabled = bool(write_enabled)

    def _connect(self):
        if not self.database_url:
            raise TrialNotReadyError(("database_ready",))
        try:
            import psycopg
            from psycopg.conninfo import conninfo_to_dict
            from psycopg.rows import dict_row
        except ImportError as exc:
            raise TrialNotReadyError(("postgres_driver_ready",)) from exc
        # The Vercel runtime uses short-lived pooled connections. Keep
        # autocommit explicitly disabled so every request can bind its identity
        # to one transaction, disable automatic prepared statements for
        # Supavisor transaction mode, and enforce encrypted transport even if a
        # manually supplied URL omitted sslmode. A stronger URL setting
        # (verify-ca / verify-full) remains in the DSN and should be used where
        # the provider certificate is pinned.
        connection_kwargs: dict[str, Any] = {
            "row_factory": dict_row,
            "connect_timeout": 5,
            "autocommit": False,
            "prepare_threshold": None,
            "application_name": "supermega-trial-runtime",
        }
        configured_sslmode = str(conninfo_to_dict(self.database_url).get("sslmode", "")).lower()
        if configured_sslmode not in {"require", "verify-ca", "verify-full"}:
            connection_kwargs["sslmode"] = "require"
        return psycopg.connect(self.database_url, **connection_kwargs)

    @staticmethod
    def _set_context(cursor: Any, principal: TrialPrincipal) -> None:
        cursor.execute(
            "select set_config('app.workspace_id', %s, true), set_config('app.actor_id', %s, true), set_config('app.actor_kind', %s, true)",
            (principal.workspace_id, principal.actor_id, principal.actor_kind),
        )

    @staticmethod
    def _assert_schema(cursor: Any) -> None:
        cursor.execute(
            """
            select
              schema_meta.schema_version,
              (
                select count(*) = 5
                from information_schema.columns
                where table_schema = 'app_private'
                  and (table_name, column_name) in (
                    ('workspace_memberships', 'actor_kind'),
                    ('workspace_events', 'actor_kind'),
                    ('approval_requests', 'requested_actor_kind'),
                    ('approval_requests', 'decided_actor_kind'),
                    ('approval_requests', 'decision_contract_version')
                  )
              ) as actor_decision_columns_ready,
              (
                select count(*) = 3
                  and bool_and(
                    constraint_record.contype = 'c'
                    and constraint_record.convalidated
                    and table_record.relname = case constraint_record.conname
                      when 'workspace_events_approval_surface_v4_check'
                        then 'workspace_events'
                      else 'approval_requests'
                    end
                    and md5(
                      regexp_replace(
                        lower(pg_get_constraintdef(constraint_record.oid, true)),
                        '[[:space:]]+',
                        ' ',
                        'g'
                      )
                    ) = case constraint_record.conname
                      when 'approval_requests_decision_packet_v2_check'
                        then '1dd6a9dcdbb54e0c4f2c2a8982e8c5b8'
                      when 'approval_requests_terminal_decision_v2_check'
                        then '60d677e7b45dc392363aac8ed611b2e9'
                      when 'workspace_events_approval_surface_v4_check'
                        then '984de8f9066e2caaa3b5d4507da2d11f'
                    end
                  )
                from pg_constraint constraint_record
                join pg_class table_record on table_record.oid = constraint_record.conrelid
                join pg_namespace schema_record on schema_record.oid = table_record.relnamespace
                where schema_record.nspname = 'app_private'
                  and constraint_record.conname in (
                    'approval_requests_decision_packet_v2_check',
                    'approval_requests_terminal_decision_v2_check',
                    'workspace_events_approval_surface_v4_check'
                  )
              ) as security_constraints_ready,
              true as schema_contract_row_ready
            from app_private.trial_schema_meta schema_meta
            where schema_meta.component = %s
            """,
            (TRIAL_SCHEMA_COMPONENT,),
        )
        row = cursor.fetchone()
        if (
            not row
            or int(row["schema_version"]) != TRIAL_SCHEMA_VERSION
            or not bool(row.get("actor_decision_columns_ready"))
            or not bool(row.get("security_constraints_ready"))
        ):
            raise TrialNotReadyError(("schema_ready",))
        cursor.execute(
            """
            select
              table_record.relname as table_name,
              trigger_record.tgname as trigger_name,
              trigger_record.tgtype::integer as event_mask,
              trigger_record.tgenabled as enabled,
              trigger_record.tgqual is null as no_when_clause,
              trigger_record.tgnargs = 0 as no_arguments,
              cardinality(trigger_record.tgattr::int2[]) = 0 as no_column_filter,
              trigger_record.tgconstraint = 0 as no_constraint_link,
              not trigger_record.tgdeferrable as not_deferrable,
              not trigger_record.tginitdeferred as not_initially_deferred,
              trigger_record.tgoldtable is null
                and trigger_record.tgnewtable is null as no_transition_tables,
              function_schema.nspname as function_schema,
              function_record.proname as function_name,
              function_record.prosrc as function_source,
              language_record.lanname as function_language,
              function_record.prosecdef as security_definer,
              function_record.proconfig as function_config
            from pg_trigger trigger_record
            join pg_class table_record on table_record.oid = trigger_record.tgrelid
            join pg_namespace table_schema on table_schema.oid = table_record.relnamespace
            join pg_proc function_record on function_record.oid = trigger_record.tgfoid
            join pg_namespace function_schema on function_schema.oid = function_record.pronamespace
            join pg_language language_record on language_record.oid = function_record.prolang
            where table_schema.nspname = 'app_private'
              and not trigger_record.tgisinternal
            order by table_record.relname, trigger_record.tgname
            """
        )
        trigger_rows = cursor.fetchall()
        if len(trigger_rows) != len(_PRIVATE_HARDENING_TRIGGER_CONTRACT):
            raise TrialNotReadyError(("schema_ready",))
        actual_triggers: dict[tuple[str, str], dict[str, Any]] = {}
        for trigger_row in trigger_rows:
            key = (str(trigger_row.get("table_name", "")), str(trigger_row.get("trigger_name", "")))
            actual_triggers[key] = {
                "event_mask": int(trigger_row.get("event_mask", 0)),
                "enabled": str(trigger_row.get("enabled", "")),
                "no_when_clause": bool(trigger_row.get("no_when_clause")),
                "no_arguments": bool(trigger_row.get("no_arguments")),
                "no_column_filter": bool(trigger_row.get("no_column_filter")),
                "no_constraint_link": bool(trigger_row.get("no_constraint_link")),
                "not_deferrable": bool(trigger_row.get("not_deferrable")),
                "not_initially_deferred": bool(
                    trigger_row.get("not_initially_deferred")
                ),
                "no_transition_tables": bool(trigger_row.get("no_transition_tables")),
                "function_schema": str(trigger_row.get("function_schema", "")),
                "function_name": str(trigger_row.get("function_name", "")),
                "function_source": _normalize_sql_source(trigger_row.get("function_source")),
                "function_language": str(trigger_row.get("function_language", "")),
                "security_definer": bool(trigger_row.get("security_definer")),
                "function_config": tuple(str(item) for item in (trigger_row.get("function_config") or ())),
            }
        expected_triggers = {
            key: {
                "event_mask": int(contract["event_mask"]),
                "enabled": "O",
                "no_when_clause": True,
                "no_arguments": True,
                "no_column_filter": True,
                "no_constraint_link": True,
                "not_deferrable": True,
                "not_initially_deferred": True,
                "no_transition_tables": True,
                "function_schema": "app_private",
                "function_name": str(contract["function_name"]),
                "function_source": _normalize_sql_source(contract["function_source"]),
                "function_language": "plpgsql",
                "security_definer": False,
                "function_config": ("search_path=pg_catalog, app_private",),
            }
            for key, contract in _PRIVATE_HARDENING_TRIGGER_CONTRACT.items()
        }
        if actual_triggers != expected_triggers:
            raise TrialNotReadyError(("schema_ready",))

    @staticmethod
    def _assert_runtime_role(cursor: Any) -> None:
        cursor.execute(
            """
            with runtime_role as (
              select * from pg_roles where rolname = current_user
            ), backend_role as (
              select * from pg_roles where rolname = 'supermega_trial_backend'
            ), elevated_role as (
              select *
              from pg_roles
              where rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication
                 or rolname in (
                   'pg_read_all_data', 'pg_write_all_data', 'pg_execute_server_program',
                   'pg_read_server_files', 'pg_write_server_files'
                 )
            )
            select
              current_user = session_user as session_role_stable,
              current_user <> 'supermega_trial_backend'
                and current_user not in (
                  'postgres', 'supabase_admin', 'service_role', 'authenticator', 'anon', 'authenticated'
                ) as dedicated_login,
              coalesce((select rolcanlogin from runtime_role), false) as can_login,
              coalesce((select not rolsuper from runtime_role), false) as no_superuser,
              coalesce((select not rolbypassrls from runtime_role), false) as no_bypassrls,
              coalesce((select not rolcreaterole from runtime_role), false) as no_create_role,
              coalesce((select not rolcreatedb from runtime_role), false) as no_create_db,
              coalesce((select not rolreplication from runtime_role), false) as no_replication,
              coalesce((
                select pg_has_role(runtime_role.oid, backend_role.oid, 'USAGE')
                from runtime_role cross join backend_role
              ), false) as inherits_backend,
              coalesce((
                select
                  count(*) = 1
                  and bool_and(
                    parent_role.rolname = 'supermega_trial_backend'
                    and membership.inherit_option
                    and not membership.set_option
                    and not membership.admin_option
                  )
                from runtime_role
                join pg_auth_members membership on membership.member = runtime_role.oid
                join pg_roles parent_role on parent_role.oid = membership.roleid
              ), false) as direct_parent_membership_exact,
              coalesce((
                select
                  count(*) = 1
                  and bool_and(
                    member_role.rolname = current_user
                    and membership.inherit_option
                    and not membership.set_option
                    and not membership.admin_option
                  )
                from backend_role
                join pg_auth_members membership on membership.roleid = backend_role.oid
                join pg_roles member_role on member_role.oid = membership.member
              ), false) as backend_member_exact,
              not exists (
                select 1
                from runtime_role
                join pg_auth_members membership on membership.roleid = runtime_role.oid
              ) as no_runtime_role_members,
              not exists (
                select 1
                from runtime_role cross join elevated_role
                where runtime_role.oid <> elevated_role.oid
                  and pg_has_role(runtime_role.oid, elevated_role.oid, 'USAGE')
              ) as no_elevated_membership,
              coalesce((select ssl from pg_stat_ssl where pid = pg_backend_pid()), false) as tls_active
            """
        )
        row = cursor.fetchone() or {}
        required = (
            "session_role_stable",
            "dedicated_login",
            "can_login",
            "no_superuser",
            "no_bypassrls",
            "no_create_role",
            "no_create_db",
            "no_replication",
            "inherits_backend",
            "direct_parent_membership_exact",
            "backend_member_exact",
            "no_runtime_role_members",
            "no_elevated_membership",
            "tls_active",
        )
        if not all(bool(row.get(check)) for check in required):
            raise TrialNotReadyError(("role_ready",))

    @staticmethod
    def _load_membership(cursor: Any, principal: TrialPrincipal) -> frozenset[str]:
        cursor.execute(
            """
            select actor_kind, capabilities
            from app_private.workspace_memberships
            where workspace_id = %s and actor_id = %s and status = 'active'
            """,
            (principal.workspace_id, principal.actor_id),
        )
        row = cursor.fetchone()
        if not row:
            raise TrialNotReadyError(("membership_ready",))
        if str(row.get("actor_kind", "")).strip().lower() != principal.actor_kind:
            raise TrialNotReadyError(("membership_ready",))
        return frozenset(str(item) for item in (row.get("capabilities") or []))

    @staticmethod
    def _assert_audit(cursor: Any) -> None:
        cursor.execute(
            """
            select
              to_regclass('app_private.workspace_events') is not null as table_ready,
              has_table_privilege(current_user, 'app_private.workspace_events', 'INSERT') as insert_ready
            """
        )
        row = cursor.fetchone() or {}
        if not bool(row.get("table_ready")) or not bool(row.get("insert_ready")):
            raise TrialNotReadyError(("audit_ready",))

    @contextmanager
    def _guarded_cursor(
        self,
        principal: TrialPrincipal,
        *,
        write: bool,
        capability: str | None = None,
    ) -> Iterator[tuple[Any, frozenset[str]]]:
        normalized = principal.normalized()
        if not _principal_auth_ready(normalized):
            raise TrialNotReadyError(("auth_ready",))
        if write and not self.write_enabled:
            raise TrialNotReadyError(("write_enabled",))
        try:
            connection = self._connect()
        except TrialStoreError:
            raise
        except Exception as exc:
            raise TrialNotReadyError(("database_ready",)) from exc

        with connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    try:
                        self._assert_runtime_role(cursor)
                        self._assert_schema(cursor)
                        self._set_context(cursor, normalized)
                        capabilities = self._load_membership(cursor, normalized)
                        if write:
                            self._assert_audit(cursor)
                    except TrialStoreError:
                        raise
                    except Exception as exc:
                        raise TrialNotReadyError(("database_or_schema_ready",)) from exc
                    if capability and capability not in capabilities:
                        raise TrialPermissionDenied(capability)
                    yield cursor, capabilities

    def readiness(self, principal: TrialPrincipal | None) -> TrialReadiness:
        auth_ready = _principal_auth_ready(principal)
        database_ready = False
        role_ready = False
        schema_ready = False
        membership_ready = False
        audit_ready = False
        capabilities: frozenset[str] = frozenset()
        if not self.database_url:
            return TrialReadiness(
                backend="postgres",
                database_ready=False,
                role_ready=False,
                schema_ready=False,
                auth_ready=auth_ready,
                membership_ready=False,
                audit_ready=False,
                write_enabled=self.write_enabled,
            )
        try:
            with self._connect() as connection:
                with connection.transaction():
                    with connection.cursor() as cursor:
                        cursor.execute("select 1 as ready")
                        database_ready = bool((cursor.fetchone() or {}).get("ready"))
                        self._assert_runtime_role(cursor)
                        role_ready = True
                        self._assert_schema(cursor)
                        schema_ready = True
                        self._assert_audit(cursor)
                        audit_ready = True
                        if auth_ready and principal is not None:
                            normalized = principal.normalized()
                            self._set_context(cursor, normalized)
                            capabilities = self._load_membership(cursor, normalized)
                            membership_ready = True
        except TrialNotReadyError as exc:
            if "postgres_driver_ready" in exc.reasons:
                database_ready = False
            elif "role_ready" in exc.reasons:
                role_ready = False
            elif "schema_ready" in exc.reasons or "database_or_schema_ready" in exc.reasons:
                schema_ready = False
            elif "audit_ready" in exc.reasons:
                audit_ready = False
            elif "membership_ready" in exc.reasons:
                membership_ready = False
        except Exception:
            database_ready = False
            role_ready = False
            schema_ready = False
            audit_ready = False
            membership_ready = False
        return TrialReadiness(
            backend="postgres",
            database_ready=database_ready,
            role_ready=role_ready,
            schema_ready=schema_ready,
            auth_ready=auth_ready,
            membership_ready=membership_ready,
            audit_ready=audit_ready,
            write_enabled=self.write_enabled,
            capabilities=capabilities,
        )

    def get_state(self, principal: TrialPrincipal, surface: str) -> TrialState:
        normalized_surface = _normalize_surface(surface)
        with self._guarded_cursor(principal, write=False) as (cursor, capabilities):
            _require_surface_read_capability(capabilities, normalized_surface)
            cursor.execute(
                """
                select workspace_id, surface, version, state_json, updated_by, updated_at
                from app_private.workspace_state
                where workspace_id = %s and surface = %s
                """,
                (principal.normalized().workspace_id, normalized_surface),
            )
            row = cursor.fetchone()
        if not row:
            return TrialState(principal.normalized().workspace_id, normalized_surface, 0, {})
        state = row.get("state_json") or {}
        if isinstance(state, str):
            state = json.loads(state)
        return TrialState(
            workspace_id=str(row["workspace_id"]),
            surface=str(row["surface"]),
            version=int(row["version"]),
            state=_json_object(state, field_name="state"),
            updated_by=str(row.get("updated_by", "")),
            updated_at=str(row.get("updated_at", "")),
        )

    def list_approvals(self, principal: TrialPrincipal, *, limit: int = 50) -> list[ApprovalRecord]:
        bounded_limit = max(1, min(int(limit), 100))
        with self._guarded_cursor(principal, write=False) as (cursor, capabilities):
            _require_approval_read_capability(capabilities)
            cursor.execute(
                """
                select approval_id, command_id, title, proposal_json, evidence_refs_json,
                       status, requested_by, requested_actor_kind, requested_at,
                       decided_by, decided_actor_kind, decided_at,
                       decision_note, version
                from app_private.approval_requests
                where workspace_id = %s
                order by case status when 'pending' then 0 else 1 end, requested_at desc
                limit %s
                """,
                (principal.normalized().workspace_id, bounded_limit),
            )
            rows = cursor.fetchall()
        return [_approval_from_mapping(row) for row in rows]

    @staticmethod
    def _lock(cursor: Any, key: str) -> None:
        cursor.execute("select pg_advisory_xact_lock(hashtextextended(%s, 0))", (key,))

    @staticmethod
    def _load_event_replay(
        cursor: Any,
        *,
        workspace_id: str,
        command_id: str,
        fingerprint: str,
    ) -> Mapping[str, Any] | None:
        cursor.execute(
            """
            select command_fingerprint, result_json
            from app_private.workspace_events
            where workspace_id = %s and command_id = %s
            """,
            (workspace_id, command_id),
        )
        row = cursor.fetchone()
        if not row:
            return None
        if str(row["command_fingerprint"]) != fingerprint:
            raise TrialIdempotencyConflict(command_id)
        result = row.get("result_json") or {}
        return json.loads(result) if isinstance(result, str) else result

    def apply_command(
        self,
        principal: TrialPrincipal,
        *,
        command_id: str | UUID,
        surface: str,
        event_type: str,
        expected_version: int,
        payload: Mapping[str, Any],
        related_surfaces: Sequence[str] = (),
        state_precondition: StatePrecondition | None = None,
    ) -> CommandResult:
        command_id_value = _normalize_uuid(command_id, field_name="command_id")
        surface_value = _normalize_surface(surface)
        event_type_value = _normalize_event_type(event_type)
        related_surface_values = _normalize_related_surfaces(surface_value, related_surfaces)
        if int(expected_version) < 0:
            raise TrialValidationError("expected_version must be non-negative.")
        if related_surface_values and state_precondition is None:
            raise TrialValidationError("related surfaces require a state precondition.")
        payload_value = _json_object(payload, field_name="payload")
        command_contract: JsonObject = {
            "surface": surface_value,
            "event_type": event_type_value,
            "expected_version": int(expected_version),
            "payload": payload_value,
        }
        if related_surface_values:
            command_contract["related_surfaces"] = list(related_surface_values)
        commerce_action_id = _commerce_command_action_id(
            surface_value,
            payload_value,
        )
        fingerprint = _canonical_fingerprint(
            "state_command",
            command_contract,
        )
        normalized = principal.normalized()
        if event_type_value in HUMAN_COMMAND_EVENTS and normalized.actor_kind != HUMAN_ACTOR_KIND:
            raise TrialHumanApprovalRequired()
        _require_command_evidence_actor(
            payload_value,
            principal=normalized,
            surface=surface_value,
            event_type=event_type_value,
        )
        capability = _required_surface_capability(surface_value)
        with self._guarded_cursor(normalized, write=True, capability=capability) as (
            cursor,
            capabilities,
        ):
            for related_surface in related_surface_values:
                _require_surface_read_capability(capabilities, related_surface)
            self._lock(cursor, f"{normalized.workspace_id}:command:{command_id_value}")
            replay = self._load_event_replay(
                cursor,
                workspace_id=normalized.workspace_id,
                command_id=command_id_value,
                fingerprint=fingerprint,
            )
            if replay is not None:
                return CommandResult(
                    command_id=command_id_value,
                    surface=str(replay["surface"]),
                    event_type=str(replay["event_type"]),
                    version=int(replay["version"]),
                    state=_json_object(replay.get("state", {}), field_name="state"),
                    idempotent_replay=True,
                )
            locked_surfaces = tuple(sorted({surface_value, *related_surface_values}))
            for locked_surface in locked_surfaces:
                self._lock(cursor, f"{normalized.workspace_id}:state:{locked_surface}")
            rows: dict[str, Mapping[str, Any] | None] = {}
            states: dict[str, JsonObject] = {}
            for locked_surface in locked_surfaces:
                cursor.execute(
                    """
                    select version, state_json
                    from app_private.workspace_state
                    where workspace_id = %s and surface = %s
                    for update
                    """,
                    (normalized.workspace_id, locked_surface),
                )
                locked_row = cursor.fetchone()
                rows[locked_surface] = locked_row
                locked_state = locked_row.get("state_json", {}) if locked_row else {}
                if isinstance(locked_state, str):
                    locked_state = json.loads(locked_state)
                states[locked_surface] = _json_object(
                    locked_state,
                    field_name=f"{locked_surface} state",
                )
            row = rows[surface_value]
            current_version = int(row["version"]) if row else 0
            current_state = states[surface_value]
            if current_version != int(expected_version):
                raise TrialVersionConflict(
                    expected_version=int(expected_version),
                    current_version=current_version,
                )
            if commerce_action_id is not None:
                self._lock(
                    cursor,
                    f"{normalized.workspace_id}:commerce-action:{commerce_action_id}",
                )
                cursor.execute(
                    """
                    select command_id
                    from app_private.workspace_events
                    where workspace_id = %s
                      and surface = 'commerce'
                      and payload_json #>> '{evidence,actionId}' = %s
                    limit 1
                    """,
                    (normalized.workspace_id, commerce_action_id),
                )
                if cursor.fetchone():
                    raise TrialValidationError(
                        "Commerce actionId was already used by an earlier command."
                    )
            if state_precondition is not None:
                state_precondition(
                    deepcopy(current_state),
                    {
                        related_surface: deepcopy(states[related_surface])
                        for related_surface in related_surface_values
                    },
                )
            now = _utc_now()
            authoritative_payload = _json_object(
                _authoritative_command_payload(
                    payload_value,
                    principal=normalized,
                    surface=surface_value,
                    event_type=event_type_value,
                    captured_at=now,
                ),
                field_name="authoritative payload",
            )
            next_state = _json_object(
                self.reducer(
                    surface_value,
                    event_type_value,
                    deepcopy(current_state),
                    deepcopy(authoritative_payload),
                ),
                field_name="reduced state",
            )
            next_version = current_version + 1
            if row:
                cursor.execute(
                    """
                    update app_private.workspace_state
                    set version = %s, state_json = %s::jsonb, updated_by = %s, updated_at = %s::timestamptz
                    where workspace_id = %s and surface = %s
                    """,
                    (
                        next_version,
                        json.dumps(next_state, ensure_ascii=False),
                        normalized.actor_id,
                        now,
                        normalized.workspace_id,
                        surface_value,
                    ),
                )
            else:
                cursor.execute(
                    """
                    insert into app_private.workspace_state
                      (workspace_id, surface, version, state_json, updated_by, updated_at)
                    values (%s, %s, %s, %s::jsonb, %s, %s::timestamptz)
                    """,
                    (
                        normalized.workspace_id,
                        surface_value,
                        next_version,
                        json.dumps(next_state, ensure_ascii=False),
                        normalized.actor_id,
                        now,
                    ),
                )
            result = {
                "command_id": command_id_value,
                "surface": surface_value,
                "event_type": event_type_value,
                "version": next_version,
                "state": next_state,
            }
            cursor.execute(
                """
                insert into app_private.workspace_events
                  (event_id, workspace_id, command_id, command_fingerprint, surface,
                   event_type, actor_id, actor_kind, expected_version, resulting_version,
                   payload_json, result_json, created_at)
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::timestamptz)
                """,
                (
                    str(uuid4()),
                    normalized.workspace_id,
                    command_id_value,
                    fingerprint,
                    surface_value,
                    event_type_value,
                    normalized.actor_id,
                    normalized.actor_kind,
                    int(expected_version),
                    next_version,
                    json.dumps(authoritative_payload, ensure_ascii=False),
                    json.dumps(result, ensure_ascii=False),
                    now,
                ),
            )
        return CommandResult(
            command_id=command_id_value,
            surface=surface_value,
            event_type=event_type_value,
            version=next_version,
            state=next_state,
        )

    def create_approval(
        self,
        principal: TrialPrincipal,
        *,
        command_id: str | UUID,
        title: str,
        proposal: Mapping[str, Any],
        evidence_refs: Sequence[str],
    ) -> ApprovalRecord:
        command_id_value = _normalize_uuid(command_id, field_name="command_id")
        title_value = str(title or "").strip()
        if not 1 <= len(title_value) <= 160:
            raise TrialValidationError("title must contain between 1 and 160 characters.")
        proposal_value = _decision_packet(proposal)
        evidence_value = _decision_evidence_refs(proposal_value, evidence_refs)
        fingerprint = _canonical_fingerprint(
            "approval_request",
            {"title": title_value, "proposal": proposal_value, "evidence_refs": list(evidence_value)},
        )
        normalized = principal.normalized()
        with self._guarded_cursor(
            normalized,
            write=True,
            capability=APPROVAL_REQUEST_CAPABILITY,
        ) as (cursor, _):
            self._lock(cursor, f"{normalized.workspace_id}:command:{command_id_value}")
            replay = self._load_event_replay(
                cursor,
                workspace_id=normalized.workspace_id,
                command_id=command_id_value,
                fingerprint=fingerprint,
            )
            if replay is not None:
                return _approval_from_mapping(replay["approval"], replay=True)
            approval_id = str(uuid4())
            cursor.execute(
                """
                insert into app_private.approval_requests
                  (approval_id, workspace_id, command_id, command_fingerprint, title,
                    proposal_json, evidence_refs_json, status, requested_by,
                    requested_actor_kind, decision_contract_version, version)
                values (%s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, 'pending', %s, %s, 2, 0)
                returning requested_at
                """,
                (
                    approval_id,
                    normalized.workspace_id,
                    command_id_value,
                    fingerprint,
                    title_value,
                    json.dumps(proposal_value, ensure_ascii=False),
                    json.dumps(list(evidence_value), ensure_ascii=False),
                    normalized.actor_id,
                    normalized.actor_kind,
                ),
            )
            requested_at = _iso_timestamp((cursor.fetchone() or {}).get("requested_at"))
            if not requested_at:
                raise TrialNotReadyError(("schema_ready",))
            approval = ApprovalRecord(
                approval_id=approval_id,
                command_id=command_id_value,
                title=title_value,
                proposal=proposal_value,
                evidence_refs=evidence_value,
                status="pending",
                requested_by=normalized.actor_id,
                requested_actor_kind=normalized.actor_kind,
                requested_at=requested_at,
            )
            result = {"approval": approval.to_dict()}
            cursor.execute(
                """
                insert into app_private.workspace_events
                  (event_id, workspace_id, command_id, command_fingerprint, surface,
                    event_type, actor_id, actor_kind, expected_version, resulting_version,
                    payload_json, result_json)
                values (%s, %s, %s, %s, 'approvals', 'approval.requested', %s, %s,
                        null, 0, %s::jsonb, %s::jsonb)
                """,
                (
                    str(uuid4()),
                    normalized.workspace_id,
                    command_id_value,
                    fingerprint,
                    normalized.actor_id,
                    normalized.actor_kind,
                    json.dumps(
                        {"title": title_value, "proposal": proposal_value, "evidence_refs": list(evidence_value)},
                        ensure_ascii=False,
                    ),
                    json.dumps(result, ensure_ascii=False),
                ),
            )
        return approval

    def decide_approval(
        self,
        principal: TrialPrincipal,
        *,
        approval_id: str | UUID,
        command_id: str | UUID,
        decision: str,
        note: str,
    ) -> ApprovalRecord:
        approval_id_value = _normalize_uuid(approval_id, field_name="approval_id")
        command_id_value = _normalize_uuid(command_id, field_name="command_id")
        decision_value = str(decision or "").strip().lower()
        if decision_value not in {"approved", "declined"}:
            raise TrialValidationError("decision must be approved or declined.")
        note_value = str(note or "").strip()
        if not 1 <= len(note_value) <= 500:
            raise TrialValidationError("decision note must contain between 1 and 500 characters.")
        fingerprint = _canonical_fingerprint(
            "approval_decision",
            {"approval_id": approval_id_value, "decision": decision_value, "note": note_value},
        )
        normalized = principal.normalized()
        _require_human_decider(normalized)
        with self._guarded_cursor(
            normalized,
            write=True,
            capability=APPROVAL_DECIDE_CAPABILITY,
        ) as (cursor, _):
            self._lock(cursor, f"{normalized.workspace_id}:command:{command_id_value}")
            replay = self._load_event_replay(
                cursor,
                workspace_id=normalized.workspace_id,
                command_id=command_id_value,
                fingerprint=fingerprint,
            )
            if replay is not None:
                return _approval_from_mapping(replay["approval"], replay=True)
            self._lock(cursor, f"{normalized.workspace_id}:approval:{approval_id_value}")
            cursor.execute(
                """
                select approval_id, command_id, title, proposal_json, evidence_refs_json,
                       status, requested_by, requested_actor_kind, requested_at,
                       decided_by, decided_actor_kind, decided_at,
                       decision_note, version
                from app_private.approval_requests
                where workspace_id = %s and approval_id = %s
                for update
                """,
                (normalized.workspace_id, approval_id_value),
            )
            row = cursor.fetchone()
            if not row:
                raise TrialNotFound("Approval not found.")
            if str(row["status"]) != "pending":
                raise TrialInvalidTransition("Approval has already reached a terminal decision.")
            cursor.execute(
                """
                update app_private.approval_requests
                set status = %s, decided_by = %s, decided_actor_kind = %s,
                    decision_note = %s, version = version + 1
                where workspace_id = %s and approval_id = %s and status = 'pending'
                returning decided_at
                """,
                (
                    decision_value,
                    normalized.actor_id,
                    normalized.actor_kind,
                    note_value,
                    normalized.workspace_id,
                    approval_id_value,
                ),
            )
            if cursor.rowcount != 1:
                raise TrialInvalidTransition("Approval decision lost a concurrent update race.")
            decided_at = _iso_timestamp((cursor.fetchone() or {}).get("decided_at"))
            if not decided_at:
                raise TrialNotReadyError(("schema_ready",))
            decided = _approval_from_mapping(
                {
                    **dict(row),
                    "status": decision_value,
                    "decided_by": normalized.actor_id,
                    "decided_actor_kind": normalized.actor_kind,
                    "decided_at": decided_at,
                    "decision_note": note_value,
                    "version": int(row["version"]) + 1,
                }
            )
            result = {"approval": decided.to_dict()}
            cursor.execute(
                """
                insert into app_private.workspace_events
                  (event_id, workspace_id, command_id, command_fingerprint, surface,
                    event_type, actor_id, actor_kind, expected_version, resulting_version,
                    payload_json, result_json)
                values (%s, %s, %s, %s, 'approvals', 'approval.decided', %s, %s,
                        0, 1, %s::jsonb, %s::jsonb)
                """,
                (
                    str(uuid4()),
                    normalized.workspace_id,
                    command_id_value,
                    fingerprint,
                    normalized.actor_id,
                    normalized.actor_kind,
                    json.dumps(
                        {"approval_id": approval_id_value, "decision": decision_value, "note": note_value},
                        ensure_ascii=False,
                    ),
                    json.dumps(result, ensure_ascii=False),
                ),
            )
        return decided


class InMemoryTrialStore:
    """Parity test double. It is intentionally unsuitable for production use."""

    def __init__(
        self,
        *,
        reducer: StateReducer,
        database_ready: bool = True,
        role_ready: bool = True,
        schema_ready: bool = True,
        audit_ready: bool = True,
        write_enabled: bool = True,
    ):
        self.reducer = reducer
        self.database_ready = bool(database_ready)
        self.role_ready = bool(role_ready)
        self.schema_ready = bool(schema_ready)
        self.audit_ready = bool(audit_ready)
        self.write_enabled = bool(write_enabled)
        self._memberships: dict[tuple[str, str], tuple[str, str, frozenset[str]]] = {}
        self._states: dict[tuple[str, str], TrialState] = {}
        self._events: dict[tuple[str, str], tuple[str, str, str, JsonObject]] = {}
        self._commerce_action_ids: dict[tuple[str, str], str] = {}
        self._approvals: dict[tuple[str, str], ApprovalRecord] = {}
        self._approval_commands: dict[tuple[str, str], str] = {}
        self._lock = RLock()

    def provision_membership(
        self,
        *,
        workspace_id: str,
        actor_id: str,
        actor_kind: str,
        capabilities: Sequence[str],
        status: str = "active",
    ) -> None:
        normalized_status = str(status).strip().lower()
        if normalized_status not in {"active", "suspended", "revoked"}:
            raise TrialValidationError("Unsupported membership status.")
        normalized_actor_kind = str(actor_kind).strip().lower()
        if normalized_actor_kind not in TRUSTED_ACTOR_KINDS:
            raise TrialValidationError("Unsupported actor kind.")
        key = (str(workspace_id).strip(), str(actor_id).strip())
        self._memberships[key] = (
            normalized_status,
            normalized_actor_kind,
            frozenset(str(item).strip() for item in capabilities if str(item).strip()),
        )

    def readiness(self, principal: TrialPrincipal | None) -> TrialReadiness:
        auth_ready = _principal_auth_ready(principal)
        membership_ready = False
        capabilities: frozenset[str] = frozenset()
        if auth_ready and principal is not None:
            normalized = principal.normalized()
            status, member_actor_kind, capabilities = self._memberships.get(
                (normalized.workspace_id, normalized.actor_id),
                ("missing", "", frozenset()),
            )
            membership_ready = status == "active" and member_actor_kind == normalized.actor_kind
            if not membership_ready:
                capabilities = frozenset()
        return TrialReadiness(
            backend="memory_test_double",
            database_ready=self.database_ready,
            role_ready=self.role_ready,
            schema_ready=self.schema_ready,
            auth_ready=auth_ready,
            membership_ready=membership_ready,
            audit_ready=self.audit_ready,
            write_enabled=self.write_enabled,
            capabilities=capabilities,
        )

    def _guard(
        self,
        principal: TrialPrincipal,
        *,
        write: bool,
        capability: str | None = None,
    ) -> tuple[TrialPrincipal, TrialReadiness]:
        normalized = principal.normalized()
        readiness = self.readiness(normalized)
        blockers = readiness.blockers if write else tuple(
            blocker
            for blocker in readiness.blockers
            if blocker not in {"audit_ready", "write_enabled"}
        )
        if blockers:
            raise TrialNotReadyError(blockers)
        if capability and capability not in readiness.capabilities:
            raise TrialPermissionDenied(capability)
        return normalized, readiness

    def get_state(self, principal: TrialPrincipal, surface: str) -> TrialState:
        normalized, readiness = self._guard(principal, write=False)
        surface_value = _normalize_surface(surface)
        _require_surface_read_capability(readiness.capabilities, surface_value)
        state = self._states.get((normalized.workspace_id, surface_value))
        if state is None:
            return TrialState(normalized.workspace_id, surface_value, 0, {})
        return TrialState(
            workspace_id=state.workspace_id,
            surface=state.surface,
            version=state.version,
            state=deepcopy(state.state),
            updated_by=state.updated_by,
            updated_at=state.updated_at,
        )

    def list_approvals(self, principal: TrialPrincipal, *, limit: int = 50) -> list[ApprovalRecord]:
        normalized, readiness = self._guard(principal, write=False)
        _require_approval_read_capability(readiness.capabilities)
        can_review_all = bool(
            readiness.capabilities.intersection(
                {APPROVAL_READ_CAPABILITY, APPROVAL_DECIDE_CAPABILITY}
            )
        )
        rows = [
            approval
            for (workspace_id, _), approval in self._approvals.items()
            if workspace_id == normalized.workspace_id
            and (can_review_all or approval.requested_by == normalized.actor_id)
        ]
        rows.sort(key=lambda row: (row.status != "pending", row.requested_at), reverse=False)
        return [deepcopy(row) for row in rows[: max(1, min(int(limit), 100))]]

    def _replay(
        self,
        workspace_id: str,
        actor_id: str,
        actor_kind: str,
        command_id: str,
        fingerprint: str,
    ) -> JsonObject | None:
        row = self._events.get((workspace_id, command_id))
        if row is None:
            return None
        stored_fingerprint, stored_actor_id, stored_actor_kind, result = row
        if (
            stored_fingerprint != fingerprint
            or stored_actor_id != actor_id
            or stored_actor_kind != actor_kind
        ):
            raise TrialIdempotencyConflict(command_id)
        return deepcopy(result)

    def apply_command(
        self,
        principal: TrialPrincipal,
        *,
        command_id: str | UUID,
        surface: str,
        event_type: str,
        expected_version: int,
        payload: Mapping[str, Any],
        related_surfaces: Sequence[str] = (),
        state_precondition: StatePrecondition | None = None,
    ) -> CommandResult:
        command_id_value = _normalize_uuid(command_id, field_name="command_id")
        surface_value = _normalize_surface(surface)
        event_type_value = _normalize_event_type(event_type)
        related_surface_values = _normalize_related_surfaces(surface_value, related_surfaces)
        if int(expected_version) < 0:
            raise TrialValidationError("expected_version must be non-negative.")
        if related_surface_values and state_precondition is None:
            raise TrialValidationError("related surfaces require a state precondition.")
        payload_value = _json_object(payload, field_name="payload")
        command_contract: JsonObject = {
            "surface": surface_value,
            "event_type": event_type_value,
            "expected_version": int(expected_version),
            "payload": payload_value,
        }
        if related_surface_values:
            command_contract["related_surfaces"] = list(related_surface_values)
        commerce_action_id = _commerce_command_action_id(
            surface_value,
            payload_value,
        )
        fingerprint = _canonical_fingerprint(
            "state_command",
            command_contract,
        )
        with self._lock:
            normalized, readiness = self._guard(
                principal,
                write=True,
                capability=_required_surface_capability(surface_value),
            )
            for related_surface in related_surface_values:
                _require_surface_read_capability(readiness.capabilities, related_surface)
            if event_type_value in HUMAN_COMMAND_EVENTS and normalized.actor_kind != HUMAN_ACTOR_KIND:
                raise TrialHumanApprovalRequired()
            _require_command_evidence_actor(
                payload_value,
                principal=normalized,
                surface=surface_value,
                event_type=event_type_value,
            )
            replay = self._replay(
                normalized.workspace_id,
                normalized.actor_id,
                normalized.actor_kind,
                command_id_value,
                fingerprint,
            )
            if replay is not None:
                return CommandResult(
                    command_id=command_id_value,
                    surface=str(replay["surface"]),
                    event_type=str(replay["event_type"]),
                    version=int(replay["version"]),
                    state=_json_object(replay.get("state", {}), field_name="state"),
                    idempotent_replay=True,
                )
            current = self._states.get(
                (normalized.workspace_id, surface_value),
                TrialState(normalized.workspace_id, surface_value, 0, {}),
            )
            if current.version != int(expected_version):
                raise TrialVersionConflict(
                    expected_version=int(expected_version),
                    current_version=current.version,
                )
            if (
                commerce_action_id is not None
                and (
                    normalized.workspace_id,
                    commerce_action_id,
                )
                in self._commerce_action_ids
            ):
                raise TrialValidationError(
                    "Commerce actionId was already used by an earlier command."
                )
            if state_precondition is not None:
                state_precondition(
                    deepcopy(current.state),
                    {
                        related_surface: deepcopy(
                            self._states.get(
                                (normalized.workspace_id, related_surface),
                                TrialState(normalized.workspace_id, related_surface, 0, {}),
                            ).state
                        )
                        for related_surface in related_surface_values
                    },
                )
            now = _utc_now()
            authoritative_payload = _json_object(
                _authoritative_command_payload(
                    payload_value,
                    principal=normalized,
                    surface=surface_value,
                    event_type=event_type_value,
                    captured_at=now,
                ),
                field_name="authoritative payload",
            )
            next_state = _json_object(
                self.reducer(
                    surface_value,
                    event_type_value,
                    deepcopy(current.state),
                    deepcopy(authoritative_payload),
                ),
                field_name="reduced state",
            )
            next_version = current.version + 1
            next_row = TrialState(
                workspace_id=normalized.workspace_id,
                surface=surface_value,
                version=next_version,
                state=deepcopy(next_state),
                updated_by=normalized.actor_id,
                updated_at=now,
            )
            result = CommandResult(
                command_id=command_id_value,
                surface=surface_value,
                event_type=event_type_value,
                version=next_version,
                state=deepcopy(next_state),
            )
            self._states[(normalized.workspace_id, surface_value)] = next_row
            self._events[(normalized.workspace_id, command_id_value)] = (
                fingerprint,
                normalized.actor_id,
                normalized.actor_kind,
                result.to_dict(),
            )
            if commerce_action_id is not None:
                self._commerce_action_ids[
                    (normalized.workspace_id, commerce_action_id)
                ] = command_id_value
            return result

    def create_approval(
        self,
        principal: TrialPrincipal,
        *,
        command_id: str | UUID,
        title: str,
        proposal: Mapping[str, Any],
        evidence_refs: Sequence[str],
    ) -> ApprovalRecord:
        command_id_value = _normalize_uuid(command_id, field_name="command_id")
        title_value = str(title or "").strip()
        if not 1 <= len(title_value) <= 160:
            raise TrialValidationError("title must contain between 1 and 160 characters.")
        proposal_value = _decision_packet(proposal)
        evidence_value = _decision_evidence_refs(proposal_value, evidence_refs)
        fingerprint = _canonical_fingerprint(
            "approval_request",
            {"title": title_value, "proposal": proposal_value, "evidence_refs": list(evidence_value)},
        )
        with self._lock:
            normalized, _ = self._guard(
                principal,
                write=True,
                capability=APPROVAL_REQUEST_CAPABILITY,
            )
            replay = self._replay(
                normalized.workspace_id,
                normalized.actor_id,
                normalized.actor_kind,
                command_id_value,
                fingerprint,
            )
            if replay is not None:
                return _approval_from_mapping(replay["approval"], replay=True)
            approval = ApprovalRecord(
                approval_id=str(uuid4()),
                command_id=command_id_value,
                title=title_value,
                proposal=proposal_value,
                evidence_refs=evidence_value,
                status="pending",
                requested_by=normalized.actor_id,
                requested_actor_kind=normalized.actor_kind,
                requested_at=_utc_now(),
            )
            self._approvals[(normalized.workspace_id, approval.approval_id)] = deepcopy(approval)
            self._approval_commands[(normalized.workspace_id, command_id_value)] = approval.approval_id
            self._events[(normalized.workspace_id, command_id_value)] = (
                fingerprint,
                normalized.actor_id,
                normalized.actor_kind,
                {"approval": approval.to_dict()},
            )
            return deepcopy(approval)

    def decide_approval(
        self,
        principal: TrialPrincipal,
        *,
        approval_id: str | UUID,
        command_id: str | UUID,
        decision: str,
        note: str,
    ) -> ApprovalRecord:
        approval_id_value = _normalize_uuid(approval_id, field_name="approval_id")
        command_id_value = _normalize_uuid(command_id, field_name="command_id")
        decision_value = str(decision or "").strip().lower()
        if decision_value not in {"approved", "declined"}:
            raise TrialValidationError("decision must be approved or declined.")
        note_value = str(note or "").strip()
        if not 1 <= len(note_value) <= 500:
            raise TrialValidationError("decision note must contain between 1 and 500 characters.")
        fingerprint = _canonical_fingerprint(
            "approval_decision",
            {"approval_id": approval_id_value, "decision": decision_value, "note": note_value},
        )
        with self._lock:
            _require_human_decider(principal.normalized())
            normalized, _ = self._guard(
                principal,
                write=True,
                capability=APPROVAL_DECIDE_CAPABILITY,
            )
            replay = self._replay(
                normalized.workspace_id,
                normalized.actor_id,
                normalized.actor_kind,
                command_id_value,
                fingerprint,
            )
            if replay is not None:
                return _approval_from_mapping(replay["approval"], replay=True)
            key = (normalized.workspace_id, approval_id_value)
            current = self._approvals.get(key)
            if current is None:
                raise TrialNotFound("Approval not found.")
            if current.status != "pending":
                raise TrialInvalidTransition("Approval has already reached a terminal decision.")
            decided = ApprovalRecord(
                approval_id=current.approval_id,
                command_id=current.command_id,
                title=current.title,
                proposal=deepcopy(current.proposal),
                evidence_refs=current.evidence_refs,
                status=decision_value,
                requested_by=current.requested_by,
                requested_actor_kind=current.requested_actor_kind,
                requested_at=current.requested_at,
                decided_by=normalized.actor_id,
                decided_actor_kind=normalized.actor_kind,
                decided_at=_utc_now(),
                decision_note=note_value,
                version=1,
            )
            self._approvals[key] = deepcopy(decided)
            self._events[(normalized.workspace_id, command_id_value)] = (
                fingerprint,
                normalized.actor_id,
                normalized.actor_kind,
                {"approval": decided.to_dict()},
            )
            return deepcopy(decided)
