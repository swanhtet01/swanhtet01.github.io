"""Workspace-scoped persistence contracts for the canonical SuperMega trial."""

from __future__ import annotations

from contextlib import contextmanager
from copy import deepcopy
from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
import logging
import os
import re
from threading import RLock
from typing import Any, Callable, Iterator, Mapping, Protocol, Sequence
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

from supermega_runtime.shop_inventory_runtime import (
    ShopInventoryValidationError,
    restamp_latest_shop_inventory_command,
)
from supermega_runtime.shop_correction_receipts import (
    SHOP_CORRECTION_AUTHORIZATION_CONTRACT,
    SHOP_CORRECTION_AUTHORIZATION_V2_CONTRACT,
    SHOP_CORRECTION_RECEIPT_PUBLIC_KEYS,
    ShopCorrectionReceiptSigner,
    ShopCorrectionSigningError,
    load_shop_correction_receipt_signer,
    verify_shop_correction_signature,
)


TRIAL_SCHEMA_COMPONENT = "private_trial_backend"


def _workspace_label_from_identifier(workspace_id: str) -> str:
    """Return a stable, readable directory label when setup is still empty."""

    normalized = workspace_id.strip()
    try:
        UUID(normalized)
    except (ValueError, AttributeError):
        pass
    else:
        return "Managed company"

    words = [part for part in re.split(r"[._-]+", normalized) if part]
    label = " ".join("SuperMega" if word.casefold() == "supermega" else word.title() for word in words)
    return label if 1 <= len(label) <= 120 else "Managed company"

_READINESS_LOG = logging.getLogger(__name__)
_READINESS_STAGES = frozenset({
    "configuration", "connect", "transaction", "probe", "role", "schema",
    "audit", "context", "session", "membership", "entitlements", "premium",
    "cursor_close", "transaction_close", "connection_close",
})
_READINESS_FAILURES = frozenset({
    "missing_configuration", "driver_unavailable", "contract_not_ready",
    "unexpected_error", "authentication_rejected", "connection_failure",
    "permission_denied", "connection_capacity", "connection_timeout",
    "database_operation_failure",
})



def _readiness_exception_category(exc: Exception) -> str:
    """Map SQLSTATE or trusted driver types; never inspect exception messages."""
    try:
        state = getattr(exc, "sqlstate", None)
        if state is None:
            # Client-side libpq failures need not carry a server SQLSTATE.
            # Keep the import lazy for offline/no-driver validation. Do not read
            # messages, diagnostic objects, connection attributes or class names.
            try:
                from psycopg import OperationalError
                from psycopg.errors import ConnectionTimeout
            except ImportError:
                return "unexpected_error"
            if isinstance(exc, ConnectionTimeout):
                return "connection_timeout"
            if isinstance(exc, OperationalError):
                return "database_operation_failure"
        if not isinstance(state, str) or not re.fullmatch(r"[0-9A-Z]{5}", state):
            return "unexpected_error"
        if state.startswith("28"):
            return "authentication_rejected"
        if state.startswith("08"):
            return "connection_failure"
        return {"42501": "permission_denied", "53300": "connection_capacity"}.get(
            state, "unexpected_error",
        )
    except Exception:
        return "unexpected_error"


def _log_readiness_failure(stage: str, category: str) -> None:
    """Server-only closed vocabulary; never serialize exceptions or identities."""
    safe_stage = stage if stage in _READINESS_STAGES else "unknown"
    safe_category = category if category in _READINESS_FAILURES else "unknown"
    try:
        _READINESS_LOG.warning(
            "trial_readiness_failure stage=%s category=%s", safe_stage, safe_category,
        )
    except Exception:
        # A logging sink must not change readiness or the public response.
        pass


def _env_schema_version(default: int = 10) -> int:
    """Parse SUPERMEGA_TRIAL_SCHEMA_VERSION without ever crashing at import.

    This module is imported by the whole app runtime, and the production
    activation runbook has the operator setting this exact variable -- an empty
    or mistyped value must not take the entire app down with an import-time
    ValueError. A non-parsable value falls back to the default, and if that
    default then disagrees with the live schema, _assert_schema fail-closes the
    trial paths cleanly at runtime (the operator's verification step surfaces
    it) while everything else keeps serving.
    """

    raw = str(os.environ.get("SUPERMEGA_TRIAL_SCHEMA_VERSION") or "").strip()
    if not raw:
        return default
    try:
        parsed = int(raw, 10)
    except ValueError:
        return default
    return parsed if parsed > 0 else default


# The exact live schema version the store fail-closes on: _assert_schema rejects
# any database whose app_private schema is not EXACTLY this. Default 10 keeps
# deployed/production behavior unchanged; an operator raises it (e.g. to 11 for a
# v11 branch) only AFTER the matching migration has been applied to that target.
TRIAL_SCHEMA_VERSION = _env_schema_version()
TRIAL_SURFACES = frozenset({"company", "commerce", "production", "website", "setup"})
ACTIVATION_PRODUCT_ORDER = ("shop", "plant", "website", "ecommerce")
ACTIVATION_PRODUCT_ENTITLEMENTS = {
    "shop": "commerce",
    "plant": "production",
    "website": "website",
    "ecommerce": "ecommerce",
}
PRODUCT_ENTITLEMENT_ORDER = tuple(ACTIVATION_PRODUCT_ENTITLEMENTS.values())
PRODUCT_ACCEPTANCE_SURFACES = {
    "commerce": "commerce",
    "production": "production",
    "website": "website",
    "ecommerce": "commerce",
}
PRODUCT_ACCEPTANCE_CONTRACT = "supermega.hosted_product_acceptance.v1"
PRODUCT_ACCEPTANCE_EVENT_TYPE = "client.product_acceptance.recorded"
SHOP_CORRECTION_AUTHORIZATION_EVENT_TYPE = (
    "commerce.shop_correction_authorization.finalized"
)
SHOP_CORRECTION_AUTHORIZATION_SOURCE = "managed_membership_receipt_v1"
SHOP_CORRECTION_AUTHORIZATION_COMMAND_NAMESPACE = (
    "https://supermega.dev/contracts/shop-correction-finalization/v1"
)
SHOP_CORRECTION_AUTHORIZATION_TTL_MILLIS = 5 * 60 * 1000
SHOP_CORRECTION_AUTHORIZATION_CAPABILITIES = frozenset(
    {"shop.sale.reverse", "shop.sale.reconcile_wallet"}
)
SHOP_CORRECTION_AUTHORIZATION_CONFIRMATIONS = {
    "shop.sale.reverse": "AUTHORIZE FULL SALE REVERSAL",
    "shop.sale.reconcile_wallet": "AUTHORIZE WALLET RECONCILIATION",
}
SHOP_CORRECTION_LINEAGE_CONTRACT = "supermega.shop.correction-lineage.v1"
SHOP_CORRECTION_CONSUMPTION_CONTRACT = "supermega.shop.correction-consumption.v1"
SHOP_CORRECTION_LINEAGE_EVENT_TYPE = "commerce.shop_correction_lineage.activated"
SHOP_CORRECTION_CONSUMPTION_EVENT_TYPE = (
    "commerce.shop_correction_consumption.committed"
)
SHOP_CORRECTION_CONSUMPTION_COMMAND_NAMESPACE = (
    "https://supermega.dev/contracts/shop-correction-consumption/v1"
)
# TLS transit is enforced by connection configuration (finding 6): psycopg refuses
# to connect unless the DSN negotiates TLS under one of these sslmodes. This is the
# authoritative client->server (or client->Supavisor-pooler) guarantee -- a
# per-backend pg_stat_ssl read cannot observe the client leg through a pooler.
TRIAL_TLS_SSLMODES = frozenset({"require", "verify-ca", "verify-full"})
TRUSTED_ACTOR_KINDS = frozenset({"human", "service", "agent"})
TRUSTED_IDENTITY_PROVIDERS = frozenset({"gateway", "supabase"})
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
        "commerce.inventory.supplier_policy_saved",
        "commerce.inventory.transferred",
        "commerce.purchase_budget.approved",
        "commerce.supplier_sourcing.approved",
        "commerce.purchase_requisition.approved",
        "commerce.purchase_order.created",
        "commerce.purchase_order.received",
        "commerce.purchase_order.cancelled",
        "commerce.supplier_invoice.recorded",
        "commerce.supplier_invoice.payable_ready",
        "commerce.supplier_return.authorized",
        "commerce.supplier_credit.recorded",
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
        "production.shift.closed",
        "website.evidence.recorded",
        "website.revision.approved",
        "website.snapshot.recorded",
        "website.release.recorded",
        "website.inquiry.received",
        "website.inquiry.reviewed",
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

# Self-serve tenant provisioning (SELF-SERVE-ONBOARDING-SPEC.md step D).
# The claim alphabet mirrors the client generator in
# showroom/src/core/signup-trial.ts: Crockford-ish, no I, L, O, or U.
SELF_SERVE_CLAIM_CODE_PATTERN = re.compile(r"^SM-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$")
SELF_SERVE_MAX_BUSINESS_NAME = 120
SELF_SERVE_RATE_LIMIT_MAX = 5
SELF_SERVE_WORKSPACE_EVENT_TYPE = "company.workspace.created"
SELF_SERVE_ACTIVATION_AUTHORIZATION_CONTRACT = "self_serve_claim_v1"
# The user names themselves and owns the tenant they created. Company/setup
# controls are shared, while product capabilities are limited to the one
# product selected by the device trial. Ecommerce intentionally shares the
# commerce data surface without granting a Shop portal entitlement.
_SELF_SERVE_BASE_OWNER_CAPABILITIES = frozenset(
    {
        "approvals.decide",
        "approvals.read",
        "approvals.request",
        "company.baseline.approve",
        "company.control.approve",
        "company.read",
        "company.write",
        "setup.read",
        "setup.write",
    }
)
SELF_SERVE_PRODUCT_CAPABILITIES = {
    "commerce": frozenset({"commerce.read", "commerce.write"}),
    "production": frozenset({"production.read", "production.write"}),
    "website": frozenset({"website.read", "website.write"}),
    "ecommerce": frozenset({"commerce.read", "commerce.write"}),
}
SELF_SERVE_PRODUCT_ACTIVATION_IDS = {
    "commerce": "shop",
    "production": "plant",
    "website": "website",
    "ecommerce": "ecommerce",
}


def validate_self_serve_product(value: object) -> str:
    product = str(value or "").strip().lower()
    if product not in SELF_SERVE_PRODUCT_CAPABILITIES:
        raise TrialValidationError("self-serve product is invalid.")
    return product


def self_serve_owner_capabilities(product: object) -> frozenset[str]:
    normalized = validate_self_serve_product(product)
    return _SELF_SERVE_BASE_OWNER_CAPABILITIES | SELF_SERVE_PRODUCT_CAPABILITIES[normalized]


# Compatibility name: the original self-serve contract defaulted to Shop.
SELF_SERVE_OWNER_CAPABILITIES = self_serve_owner_capabilities("commerce")
_SELF_SERVE_PROJECT_REF_PATTERN = re.compile(r"^[a-z0-9]{20}$")
_SELF_SERVE_RELEASE_COMMIT_PATTERN = re.compile(r"^[0-9a-f]{40}$")

JsonObject = dict[str, Any]
StateReducer = Callable[[str, str, Mapping[str, Any], Mapping[str, Any]], Mapping[str, Any]]
StatePrecondition = Callable[[Mapping[str, Any], Mapping[str, Mapping[str, Any]]], None]


def activation_product_entitlements(payload_value: object) -> tuple[str, ...]:
    """Return only the canonical products proven by an activation event."""

    payload = payload_value
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            return ()
    if not isinstance(payload, Mapping):
        return ()
    products_value = payload.get("products")
    if products_value is None:
        products_value = [payload.get("product")]
    if not isinstance(products_value, list) or not products_value:
        return ()
    if any(not isinstance(product, str) for product in products_value):
        return ()
    products = tuple(products_value)
    canonical = tuple(product for product in ACTIVATION_PRODUCT_ORDER if product in products)
    if products != canonical or len(set(products)) != len(products):
        return ()
    try:
        return tuple(ACTIVATION_PRODUCT_ENTITLEMENTS[product] for product in products)
    except KeyError:
        return ()


def capabilities_for_product_entitlements(
    capabilities: Sequence[str],
    product_entitlements: Sequence[str] | None,
) -> frozenset[str]:
    """Intersect product capabilities with immutable activation proof.

    ``None`` is reserved for stores that do not provide authoritative product
    entitlements. An explicit empty or malformed grant keeps company, setup,
    and approval controls available while denying every product data surface.
    Ecommerce intentionally authorizes the shared commerce surface without
    becoming a Shop portal entitlement.
    """

    granted = frozenset(str(capability).strip() for capability in capabilities)
    if product_entitlements is None:
        return granted
    products = tuple(product_entitlements)
    if (
        any(not isinstance(product, str) for product in products)
        or products != tuple(product for product in PRODUCT_ENTITLEMENT_ORDER if product in products)
        or len(set(products)) != len(products)
    ):
        products = ()
    allowed_surfaces = {
        "commerce" if product in {"commerce", "ecommerce"} else product
        for product in products
    }
    product_capabilities = {
        capability
        for surface in ("commerce", "production", "website")
        for capability in (f"{surface}.read", f"{surface}.write")
    } | {"website.review", "ecommerce.review"}
    allowed_capabilities = {
        capability
        for surface in allowed_surfaces
        for capability in (f"{surface}.read", f"{surface}.write")
    }
    if "website" in allowed_surfaces:
        allowed_capabilities.add("website.review")
    # Shop and Ecommerce share commerce data, but private catalog review is
    # an Ecommerce delivery capability, never implied by Shop activation.
    if "ecommerce" in products:
        allowed_capabilities.add("ecommerce.review")
    return frozenset(
        capability
        for capability in granted
        if capability not in product_capabilities or capability in allowed_capabilities
    )

_PRIVATE_HARDENING_TRIGGER_CONTRACT: dict[tuple[str, str], dict[str, Any]] = {
    ("workspace_access_controls", "workspace_access_control_guard"): {
        "event_mask": 31,
        "function_name": "guard_workspace_access_control",
        "function_source": """
            begin
              if tg_op = 'INSERT' then
                new.activated_at := transaction_timestamp();
                new.updated_at := transaction_timestamp();
                if new.status = 'suspended' then
                  new.suspended_at := transaction_timestamp();
                end if;
                return new;
              end if;
              if tg_op = 'DELETE' then
                raise exception using errcode = '55000', message = 'workspace access controls cannot be deleted';
              end if;
              if new.workspace_id is distinct from old.workspace_id
                 or new.activation_id is distinct from old.activation_id
                 or new.authorization_id is distinct from old.authorization_id
                 or new.authorization_contract is distinct from old.authorization_contract
                 or new.plan_digest is distinct from old.plan_digest
                 or new.owner_actor_id is distinct from old.owner_actor_id
                 or new.project_ref is distinct from old.project_ref
                 or new.release_commit is distinct from old.release_commit
                 or new.activated_at is distinct from old.activated_at then
                raise exception using errcode = '55000', message = 'workspace activation identity is immutable';
              end if;
              if old.status <> 'active' or new.status <> 'suspended' then
                raise exception using errcode = '55000', message = 'workspace access can only transition from active to suspended';
              end if;
              new.suspended_at := transaction_timestamp();
              new.updated_at := transaction_timestamp();
              return new;
            end
        """,
    },
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

if TRIAL_SCHEMA_VERSION >= 12:
    # Billing rail v12 (BILLING-RAIL-DESIGN.md 4.4): the billing tables carry
    # their own hardening triggers, mirrored here byte-for-byte from
    # 20260817090000_private_trial_backend_v12_billing_rail.sql so the exact
    # trigger-inventory assertion keeps holding. On the default v10/v11 targets
    # the inventory is unchanged; an operator raises
    # SUPERMEGA_TRIAL_SCHEMA_VERSION only after applying v12.
    _PRIVATE_HARDENING_TRIGGER_CONTRACT.update(
        {
            ("billing_invoices", "billing_invoice_guard"): {
                "event_mask": 31,
                "function_name": "guard_billing_invoice",
                "function_source": """
                    begin
                      if tg_op = 'INSERT' then
                        if new.status <> 'issued' then
                          raise exception using errcode = '55000', message = 'billing invoices are recorded at issued status';
                        end if;
                        if new.revision <> 1 then
                          raise exception using errcode = '55000', message = 'initial billing invoice revision must be one';
                        end if;
                        new.created_at := transaction_timestamp();
                        new.updated_at := transaction_timestamp();
                        return new;
                      end if;
                      if tg_op = 'DELETE' then
                        raise exception using errcode = '55000', message = 'billing invoices cannot be deleted';
                      end if;
                      if new.workspace_id is distinct from old.workspace_id
                         or new.invoice_id is distinct from old.invoice_id
                         or new.invoice_digest is distinct from old.invoice_digest
                         or new.payload_json is distinct from old.payload_json
                         or new.created_at is distinct from old.created_at then
                        raise exception using errcode = '55000', message = 'billing invoice identity is immutable';
                      end if;
                      if old.status <> 'issued' or new.status not in ('paid', 'void') then
                        raise exception using errcode = '55000', message = 'billing invoice status can only transition from issued to paid or void';
                      end if;
                      if new.revision <> old.revision + 1 then
                        raise exception using errcode = '40001', message = 'billing invoice revision must increment by one';
                      end if;
                      new.updated_at := transaction_timestamp();
                      return new;
                    end
                """,
            },
            ("billing_events", "billing_events_immutable"): {
                "event_mask": 27,
                "function_name": "reject_billing_event_mutation",
                "function_source": """
                    begin
                      raise exception using
                        errcode = '55000',
                        message = 'billing events are immutable';
                    end
                """,
            },
            ("billing_events", "billing_events_server_timestamp"): {
                "event_mask": 7,
                "function_name": "stamp_billing_event_insert",
                "function_source": """
                    begin
                      new.created_at := transaction_timestamp();
                      return new;
                    end
                """,
            },
            ("billing_entitlements", "billing_entitlement_guard"): {
                "event_mask": 31,
                "function_name": "guard_billing_entitlement",
                "function_source": """
                    begin
                      if tg_op = 'INSERT' then
                        if new.status <> 'none' or new.revision <> 1 then
                          raise exception using errcode = '55000', message = 'billing entitlement rows start at none with revision one';
                        end if;
                        new.updated_at := transaction_timestamp();
                        return new;
                      end if;
                      if tg_op = 'DELETE' then
                        raise exception using errcode = '55000', message = 'billing entitlements cannot be deleted';
                      end if;
                      if new.workspace_id is distinct from old.workspace_id
                         or new.tier is distinct from old.tier then
                        raise exception using errcode = '55000', message = 'billing entitlement identity is immutable';
                      end if;
                      if not (
                        (old.status = 'none' and new.status = 'granted')
                        or (old.status = 'granted' and new.status = 'revoked')
                        or (old.status = 'revoked' and new.status = 'granted')
                      ) then
                        raise exception using errcode = '55000', message = 'billing entitlement transitions are none to granted, granted to revoked, or revoked to granted';
                      end if;
                      if new.revision <> old.revision + 1 then
                        raise exception using errcode = '40001', message = 'billing entitlement revision must increment by one';
                      end if;
                      new.updated_at := transaction_timestamp();
                      return new;
                    end
                """,
            },
        }
    )


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


class TrialAuthorizationExpired(TrialStoreError):
    def __init__(self, authorization_request_id: str):
        self.authorization_request_id = authorization_request_id
        super().__init__(
            "Shop correction authorization expired; the finalized command cannot be reauthorized."
        )


class TrialReconciliationRequired(TrialStoreError):
    """The local correction watermark cannot safely become authoritative."""

    def __init__(self, *, state: str):
        self.state = str(state)
        super().__init__("Shop correction history must be reconciled before this lineage can continue.")


class TrialInvalidTransition(TrialStoreError):
    pass


class TrialNotFound(TrialStoreError):
    pass


class TrialValidationError(TrialStoreError):
    pass


class TrialRateLimited(TrialStoreError):
    def __init__(self, *, limit: int):
        self.limit = int(limit)
        super().__init__(
            f"Self-serve workspace creation is limited to {self.limit} attempts per user."
        )


class TrialClaimConflict(TrialStoreError):
    def __init__(self, claim_code: str):
        self.claim_code = str(claim_code)
        super().__init__("The claim code is already linked to a different owner.")


@dataclass(frozen=True, slots=True)
class TrialPrincipal:
    workspace_id: str
    actor_id: str
    actor_kind: str = "unknown"
    authenticated: bool = True
    session_id: str = ""
    identity_provider: str = "gateway"

    def normalized(self) -> "TrialPrincipal":
        return TrialPrincipal(
            workspace_id=str(self.workspace_id or "").strip(),
            actor_id=str(self.actor_id or "").strip(),
            actor_kind=str(self.actor_kind or "").strip().lower(),
            authenticated=bool(self.authenticated),
            session_id=str(self.session_id or "").strip().lower(),
            identity_provider=str(self.identity_provider or "").strip().lower(),
        )


@dataclass(frozen=True, slots=True)
class ManagedWorkspaceAccess:
    workspace_id: str
    label: str
    access: str

    def to_dict(self) -> JsonObject:
        return {
            "workspace_id": self.workspace_id,
            "label": self.label,
            "access": self.access,
        }


@dataclass(frozen=True, slots=True)
class SelfServeWorkspaceResult:
    """The directory entry a completed self-serve tenant creation returns."""

    workspace_id: str
    label: str
    access: str
    claim_code: str
    owner_actor_id: str
    event_id: str
    created_at: str
    idempotent_replay: bool = False

    def to_dict(self) -> JsonObject:
        return {
            "workspace_id": self.workspace_id,
            "label": self.label,
            "access": self.access,
            "claim_code": self.claim_code,
            "owner_actor_id": self.owner_actor_id,
            "event_id": self.event_id,
            "created_at": self.created_at,
            "idempotent_replay": self.idempotent_replay,
        }


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
    # Billing rail v12 (BILLING-RAIL-DESIGN.md 4.3): derived ONLY from the
    # server-side billing_entitlements projection, never stored on the device,
    # and fail-closed to False everywhere the entitlement cannot be proven.
    premium_unlocked: bool = False
    # Present only when an immutable managed activation event proves the
    # products assigned to this tenant. None preserves compatibility for
    # non-managed stores; an empty tuple is an explicit fail-closed grant.
    product_entitlements: tuple[str, ...] | None = None

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
        payload: JsonObject = {
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
            # The browser needs the actor's effective, entitlement-filtered
            # capabilities to render staff portals honestly. This is authority
            # metadata, not a secret; every write is still re-authorized here.
            "capabilities": sorted(self.capabilities),
            "premiumUnlocked": self.premium_unlocked,
        }
        if self.product_entitlements is not None:
            payload["productEntitlements"] = list(self.product_entitlements)
        return payload


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
class ProductAcceptanceRecord:
    probe_id: str
    owner_approval_id: str
    product: str
    surface: str
    release_commit: str
    state_version: int
    state_digest: str
    recorded_at: str
    idempotent_replay: bool = False

    def to_dict(self) -> JsonObject:
        return {
            "contract": PRODUCT_ACCEPTANCE_CONTRACT,
            "probe_id": self.probe_id,
            "owner_approval_id": self.owner_approval_id,
            "product": self.product,
            "surface": self.surface,
            "release_commit": self.release_commit,
            "state_version": self.state_version,
            "state_digest": self.state_digest,
            "recorded_at": self.recorded_at,
            "idempotent_replay": self.idempotent_replay,
        }


@dataclass(frozen=True, slots=True)
class ShopCorrectionAuthorizationReceipt:
    receipt_id: str
    receipt_digest: str
    finalization_request_id: str
    workspace_id: str
    actor_id: str
    actor_label: str
    actor_role: str
    capability: str
    source: str
    command_digest: str
    finalized_at_millis: int
    issued_at_millis: int
    expires_at_millis: int
    key_id: str
    signature: str
    idempotent_replay: bool = False

    def to_dict(self) -> JsonObject:
        return {
            "contract": SHOP_CORRECTION_AUTHORIZATION_CONTRACT,
            "receiptId": self.receipt_id,
            "receiptDigest": self.receipt_digest,
            "finalizationRequestId": self.finalization_request_id,
            "workspaceId": self.workspace_id,
            "actorId": self.actor_id,
            "actorLabel": self.actor_label,
            "actorRole": self.actor_role,
            "capability": self.capability,
            "source": self.source,
            "commandDigest": self.command_digest,
            "finalizedAtMillis": self.finalized_at_millis,
            "issuedAtMillis": self.issued_at_millis,
            "expiresAtMillis": self.expires_at_millis,
            "keyId": self.key_id,
            "signature": self.signature,
        }


@dataclass(frozen=True, slots=True)
class ShopCorrectionLineageRecord:
    activation_request_id: str
    workspace_id: str
    actor_id: str
    lineage_id: str
    lineage_epoch: int
    previous_lineage_id: str | None
    previous_lineage_epoch: int | None
    consumption_ordinal: int
    consumption_digest: str | None
    activated_at_millis: int
    idempotent_replay: bool = False

    def to_dict(self) -> JsonObject:
        return {
            "contract": SHOP_CORRECTION_LINEAGE_CONTRACT,
            "activationRequestId": self.activation_request_id,
            "workspaceId": self.workspace_id,
            "actorId": self.actor_id,
            "lineageId": self.lineage_id,
            "lineageEpoch": self.lineage_epoch,
            "previousLineageId": self.previous_lineage_id,
            "previousLineageEpoch": self.previous_lineage_epoch,
            "consumptionOrdinal": self.consumption_ordinal,
            "consumptionDigest": self.consumption_digest,
            "activatedAtMillis": self.activated_at_millis,
        }


@dataclass(frozen=True, slots=True)
class ShopCorrectionConsumptionProof:
    consumption_id: str
    consumption_request_id: str
    authorization_receipt_id: str
    authorization_receipt_digest: str
    workspace_id: str
    actor_id: str
    capability: str
    semantic_target_id: str
    command_digest: str
    lineage_id: str
    lineage_epoch: int
    consumption_ordinal: int
    previous_consumption_digest: str | None
    history_digest: str
    consumed_at_millis: int
    key_id: str
    signature: str
    response_mode: str = "commit_new"

    def signed_dict(self) -> JsonObject:
        return {
            "contract": SHOP_CORRECTION_CONSUMPTION_CONTRACT,
            "consumptionId": self.consumption_id,
            "consumptionRequestId": self.consumption_request_id,
            "authorizationReceiptId": self.authorization_receipt_id,
            "authorizationReceiptDigest": self.authorization_receipt_digest,
            "workspaceId": self.workspace_id,
            "actorId": self.actor_id,
            "capability": self.capability,
            "semanticTargetId": self.semantic_target_id,
            "commandDigest": self.command_digest,
            "lineageId": self.lineage_id,
            "lineageEpoch": self.lineage_epoch,
            "consumptionOrdinal": self.consumption_ordinal,
            "previousConsumptionDigest": self.previous_consumption_digest,
            "historyDigest": self.history_digest,
            "consumedAtMillis": self.consumed_at_millis,
            "keyId": self.key_id,
            "signature": self.signature,
            "moneyMovementPerformed": False,
            "localMutationPerformed": False,
        }

    def to_dict(self) -> JsonObject:
        # The caller derives reconstruction from the signed original request ID.
        # response_mode is server-local observability and is never an authority field.
        return self.signed_dict()


@dataclass(frozen=True, slots=True)
class ShopCorrectionReconciliationStatus:
    workspace_id: str
    requested_lineage_id: str
    requested_lineage_epoch: int
    active_lineage_id: str
    active_lineage_epoch: int
    server_consumption_ordinal: int
    server_consumption_digest: str | None
    local_consumption_ordinal: int
    local_consumption_digest: str | None
    state: str

    def to_dict(self) -> JsonObject:
        return {
            "contract": SHOP_CORRECTION_LINEAGE_CONTRACT,
            "workspaceId": self.workspace_id,
            "requestedLineageId": self.requested_lineage_id,
            "requestedLineageEpoch": self.requested_lineage_epoch,
            "activeLineageId": self.active_lineage_id,
            "activeLineageEpoch": self.active_lineage_epoch,
            "serverConsumptionOrdinal": self.server_consumption_ordinal,
            "serverConsumptionDigest": self.server_consumption_digest,
            "localConsumptionOrdinal": self.local_consumption_ordinal,
            "localConsumptionDigest": self.local_consumption_digest,
            "state": self.state,
            "reconstructionRequired": self.state == "reconciliation_required",
            "moneyMovementPerformed": False,
            "localMutationPerformed": False,
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

    def list_actor_workspaces(
        self,
        principal: TrialPrincipal,
        *,
        limit: int = 50,
    ) -> tuple[list[ManagedWorkspaceAccess], bool]: ...

    def create_self_serve_workspace(
        self,
        *,
        actor_id: str,
        claim_code: str,
        business_name: str,
        product: str = "commerce",
        session_id: str = "",
        identity_provider: str = "supabase",
    ) -> SelfServeWorkspaceResult: ...

    def get_state(self, principal: TrialPrincipal, surface: str) -> TrialState: ...

    def list_approvals(self, principal: TrialPrincipal, *, limit: int = 50) -> list[ApprovalRecord]: ...

    def record_product_acceptance(
        self,
        principal: TrialPrincipal,
        *,
        probe_id: str | UUID,
        owner_approval_id: str | UUID,
        product: str,
        release_commit: str,
    ) -> ProductAcceptanceRecord: ...

    def get_product_acceptance(
        self,
        principal: TrialPrincipal,
        *,
        probe_id: str | UUID,
    ) -> ProductAcceptanceRecord: ...

    def issue_shop_correction_authorization(
        self,
        principal: TrialPrincipal,
        *,
        authorization_request_id: str | UUID,
        capability: str,
        command_digest: str,
        request_fingerprint: str,
        confirmation: str,
    ) -> ShopCorrectionAuthorizationReceipt: ...

    def shop_correction_authorization_signing_ready(self) -> bool: ...

    def activate_shop_correction_lineage(
        self,
        principal: TrialPrincipal,
        *,
        activation_request_id: str | UUID,
        lineage_id: str | UUID,
        expected_previous_lineage_id: str | UUID | None,
        expected_previous_lineage_epoch: int | None,
        local_consumption_ordinal: int,
        local_consumption_digest: str | None,
    ) -> ShopCorrectionLineageRecord: ...

    def consume_shop_correction_authorization(
        self,
        principal: TrialPrincipal,
        *,
        consumption_request_id: str | UUID,
        authorization_receipt_id: str | UUID,
        authorization_receipt_digest: str,
        lineage_id: str | UUID,
        lineage_epoch: int,
        capability: str,
        semantic_target_id: str,
        command_digest: str,
        allow_new_decision: bool,
    ) -> ShopCorrectionConsumptionProof: ...

    def get_shop_correction_reconciliation_status(
        self,
        principal: TrialPrincipal,
        *,
        lineage_id: str | UUID,
        lineage_epoch: int,
        local_consumption_ordinal: int,
        local_consumption_digest: str | None,
    ) -> ShopCorrectionReconciliationStatus: ...

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
        expected_related_versions: Mapping[str, int] | None = None,
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
    if surface == "website" and event_type in {
        "website.inquiry.received",
        "website.inquiry.reviewed",
    }:
        evidence = authoritative.get("evidence")
        state = authoritative.get("state")
        ledger = state.get("leadLedger") if isinstance(state, Mapping) else None
        leads = ledger.get("leads") if isinstance(ledger, Mapping) else None
        reference = evidence.get("evidenceReference") if isinstance(evidence, Mapping) else None
        suffix = "received" if event_type == "website.inquiry.received" else "reviewed"
        prefix = "website:inquiry:"
        trailer = f":{suffix}"
        if (
            not isinstance(evidence, Mapping)
            or not isinstance(state, Mapping)
            or not isinstance(ledger, Mapping)
            or not isinstance(leads, list)
            or not isinstance(reference, str)
            or not reference.startswith(prefix)
            or not reference.endswith(trailer)
        ):
            return authoritative
        lead_id = reference[len(prefix):-len(trailer)]
        indexes = [
            index
            for index, lead in enumerate(leads)
            if isinstance(lead, Mapping) and lead.get("id") == lead_id
        ]
        if len(indexes) != 1:
            return authoritative
        website_captured_at = _canonical_millisecond_utc(captured_at)
        authoritative_leads = deepcopy(leads)
        authoritative_lead = dict(authoritative_leads[indexes[0]])
        authoritative_lead["updatedAt"] = website_captured_at
        if event_type == "website.inquiry.received":
            authoritative_lead["createdAt"] = website_captured_at
        authoritative_leads[indexes[0]] = authoritative_lead
        authoritative_state = dict(state)
        authoritative_state["leadLedger"] = {
            **dict(ledger),
            "leads": authoritative_leads,
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
        "commerce.inventory.supplier_policy_saved",
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
    if event_type == "commerce.purchase_budget.approved":
        evidence = authoritative.get("evidence")
        state = authoritative.get("state")
        envelopes = (
            state.get("purchaseBudgetEnvelopes") if isinstance(state, Mapping) else None
        )
        if (
            not isinstance(evidence, Mapping)
            or not isinstance(state, Mapping)
            or not isinstance(envelopes, list)
            or not envelopes
            or not isinstance(envelopes[0], Mapping)
            or not isinstance(envelopes[0].get("approval"), Mapping)
            or envelopes[0]["approval"].get("actionId") != evidence.get("actionId")
        ):
            return authoritative
        authoritative_evidence = {
            **dict(evidence),
            "actor": principal.actor_id,
            "capturedAt": captured_at,
        }
        authoritative_envelope = {
            **dict(envelopes[0]),
            "createdAt": captured_at,
            "periodStart": captured_at,
            "approval": deepcopy(authoritative_evidence),
        }
        authoritative_state = dict(state)
        authoritative_state["purchaseBudgetEnvelopes"] = [
            authoritative_envelope,
            *deepcopy(envelopes[1:]),
        ]
        authoritative["evidence"] = authoritative_evidence
        authoritative["state"] = authoritative_state
        return authoritative
    if event_type == "commerce.supplier_sourcing.approved":
        evidence = authoritative.get("evidence")
        state = authoritative.get("state")
        decisions = (
            state.get("supplierSourcingDecisions") if isinstance(state, Mapping) else None
        )
        if (
            not isinstance(evidence, Mapping)
            or not isinstance(state, Mapping)
            or not isinstance(decisions, list)
            or not decisions
            or not isinstance(decisions[0], Mapping)
            or not isinstance(decisions[0].get("approval"), Mapping)
            or decisions[0]["approval"].get("actionId") != evidence.get("actionId")
        ):
            return authoritative
        authoritative_evidence = {
            **dict(evidence),
            "actor": principal.actor_id,
            "capturedAt": captured_at,
        }
        authoritative_decision = {
            **dict(decisions[0]),
            "createdAt": captured_at,
            "approval": deepcopy(authoritative_evidence),
        }
        authoritative_state = dict(state)
        authoritative_state["supplierSourcingDecisions"] = [
            authoritative_decision,
            *deepcopy(decisions[1:]),
        ]
        authoritative["evidence"] = authoritative_evidence
        authoritative["state"] = authoritative_state
        return authoritative
    if event_type == "commerce.purchase_requisition.approved":
        evidence = authoritative.get("evidence")
        state = authoritative.get("state")
        requisitions = (
            state.get("purchaseRequisitions") if isinstance(state, Mapping) else None
        )
        if (
            not isinstance(evidence, Mapping)
            or not isinstance(state, Mapping)
            or not isinstance(requisitions, list)
            or not requisitions
            or not isinstance(requisitions[0], Mapping)
            or not isinstance(requisitions[0].get("approval"), Mapping)
            or requisitions[0]["approval"].get("actionId") != evidence.get("actionId")
        ):
            return authoritative
        authoritative_evidence = {**dict(evidence), "actor": principal.actor_id, "capturedAt": captured_at}
        authoritative_requisition = {
            **dict(requisitions[0]),
            "createdAt": captured_at,
            "approval": deepcopy(authoritative_evidence),
        }
        authoritative_state = dict(state)
        authoritative_state["purchaseRequisitions"] = [
            authoritative_requisition,
            *deepcopy(requisitions[1:]),
        ]
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
    if event_type in {
        "commerce.supplier_invoice.recorded",
        "commerce.supplier_invoice.payable_ready",
    }:
        evidence = authoritative.get("evidence")
        state = authoritative.get("state")
        purchase_orders = (
            state.get("purchaseOrders") if isinstance(state, Mapping) else None
        )
        proof_key = (
            "recording"
            if event_type == "commerce.supplier_invoice.recorded"
            else "payableReview"
        )
        matches: list[tuple[int, Mapping[str, Any], Mapping[str, Any]]] = []
        if isinstance(purchase_orders, list) and isinstance(evidence, Mapping):
            for index, candidate in enumerate(purchase_orders):
                invoice = (
                    candidate.get("supplierInvoice")
                    if isinstance(candidate, Mapping)
                    else None
                )
                proof = invoice.get(proof_key) if isinstance(invoice, Mapping) else None
                if (
                    isinstance(proof, Mapping)
                    and proof.get("actionId") == evidence.get("actionId")
                ):
                    matches.append((index, candidate, invoice))
        if len(matches) != 1 or not isinstance(state, Mapping):
            return authoritative
        purchase_order_index, purchase_order, invoice = matches[0]
        receipt_times = [
            movement.get("createdAt")
            for movement in state.get("movements", [])
            if isinstance(movement, Mapping)
            and movement.get("kind") == "receipt"
            and movement.get("purchaseOrderId") == purchase_order.get("id")
        ]
        effective_captured_at = _not_before(
            captured_at,
            purchase_order.get("createdAt"),
            invoice.get("issuedAt"),
            invoice.get("recording", {}).get("capturedAt")
            if event_type == "commerce.supplier_invoice.payable_ready"
            and isinstance(invoice.get("recording"), Mapping)
            else None,
            *receipt_times,
        )
        authoritative_evidence = {
            **dict(evidence),
            "actor": principal.actor_id,
            "capturedAt": effective_captured_at,
        }
        authoritative_invoice = dict(invoice)
        authoritative_invoice[proof_key] = deepcopy(authoritative_evidence)
        authoritative_purchase_order = {
            **dict(purchase_order),
            "supplierInvoice": authoritative_invoice,
        }
        authoritative_purchase_orders = deepcopy(purchase_orders)
        authoritative_purchase_orders[purchase_order_index] = authoritative_purchase_order
        authoritative_state = dict(state)
        authoritative_state["purchaseOrders"] = authoritative_purchase_orders
        authoritative["evidence"] = authoritative_evidence
        authoritative["state"] = authoritative_state
        return authoritative
    if event_type == "commerce.supplier_return.authorized":
        evidence = authoritative.get("evidence")
        state = authoritative.get("state")
        purchase_orders = (
            state.get("purchaseOrders") if isinstance(state, Mapping) else None
        )
        matches: list[tuple[int, Mapping[str, Any], int, Mapping[str, Any]]] = []
        if isinstance(purchase_orders, list) and isinstance(evidence, Mapping):
            for purchase_order_index, purchase_order in enumerate(purchase_orders):
                supplier_returns = (
                    purchase_order.get("supplierReturns", [])
                    if isinstance(purchase_order, Mapping)
                    else []
                )
                if not isinstance(supplier_returns, list):
                    continue
                for return_index, supplier_return in enumerate(supplier_returns):
                    authorization = (
                        supplier_return.get("authorization")
                        if isinstance(supplier_return, Mapping)
                        else None
                    )
                    if (
                        isinstance(authorization, Mapping)
                        and authorization.get("actionId") == evidence.get("actionId")
                    ):
                        matches.append(
                            (
                                purchase_order_index,
                                purchase_order,
                                return_index,
                                supplier_return,
                            )
                        )
        if len(matches) != 1 or not isinstance(state, Mapping):
            return authoritative
        purchase_order_index, purchase_order, return_index, supplier_return = matches[0]
        receipt = next(
            (
                movement
                for movement in state.get("movements", [])
                if isinstance(movement, Mapping)
                and movement.get("id") == supplier_return.get("receiptMovementId")
            ),
            None,
        )
        effective_captured_at = _not_before(
            captured_at,
            purchase_order.get("createdAt"),
            receipt.get("createdAt") if isinstance(receipt, Mapping) else None,
        )
        authoritative_evidence = {
            **dict(evidence),
            "actor": principal.actor_id,
            "capturedAt": effective_captured_at,
        }
        authoritative_return = {
            **dict(supplier_return),
            "createdAt": effective_captured_at,
            "authorization": deepcopy(authoritative_evidence),
        }
        authoritative_returns = deepcopy(purchase_order.get("supplierReturns", []))
        authoritative_returns[return_index] = authoritative_return
        authoritative_purchase_order = {
            **dict(purchase_order),
            "supplierReturns": authoritative_returns,
        }
        authoritative_purchase_orders = deepcopy(purchase_orders)
        authoritative_purchase_orders[purchase_order_index] = authoritative_purchase_order
        authoritative_state = dict(state)
        authoritative_state["purchaseOrders"] = authoritative_purchase_orders
        authoritative["evidence"] = authoritative_evidence
        authoritative["state"] = authoritative_state
        return authoritative
    if event_type == "commerce.supplier_credit.recorded":
        evidence = authoritative.get("evidence")
        state = authoritative.get("state")
        purchase_orders = (
            state.get("purchaseOrders") if isinstance(state, Mapping) else None
        )
        matches: list[
            tuple[int, Mapping[str, Any], int, Mapping[str, Any], int, Mapping[str, Any]]
        ] = []
        if isinstance(purchase_orders, list) and isinstance(evidence, Mapping):
            for purchase_order_index, purchase_order in enumerate(purchase_orders):
                supplier_returns = (
                    purchase_order.get("supplierReturns", [])
                    if isinstance(purchase_order, Mapping)
                    else []
                )
                if not isinstance(supplier_returns, list):
                    continue
                for return_index, supplier_return in enumerate(supplier_returns):
                    credit_notes = (
                        supplier_return.get("creditNotes", [])
                        if isinstance(supplier_return, Mapping)
                        else []
                    )
                    if not isinstance(credit_notes, list):
                        continue
                    for credit_index, credit_note in enumerate(credit_notes):
                        recording = (
                            credit_note.get("recording")
                            if isinstance(credit_note, Mapping)
                            else None
                        )
                        if (
                            isinstance(recording, Mapping)
                            and recording.get("actionId") == evidence.get("actionId")
                        ):
                            matches.append(
                                (
                                    purchase_order_index,
                                    purchase_order,
                                    return_index,
                                    supplier_return,
                                    credit_index,
                                    credit_note,
                                )
                            )
        if len(matches) != 1 or not isinstance(state, Mapping):
            return authoritative
        (
            purchase_order_index,
            purchase_order,
            return_index,
            supplier_return,
            credit_index,
            credit_note,
        ) = matches[0]
        effective_captured_at = _not_before(
            captured_at,
            supplier_return.get("createdAt"),
            credit_note.get("issuedAt"),
        )
        authoritative_evidence = {
            **dict(evidence),
            "actor": principal.actor_id,
            "capturedAt": effective_captured_at,
        }
        authoritative_credit = {
            **dict(credit_note),
            "recording": deepcopy(authoritative_evidence),
        }
        authoritative_credits = deepcopy(supplier_return.get("creditNotes", []))
        authoritative_credits[credit_index] = authoritative_credit
        authoritative_return = {
            **dict(supplier_return),
            "creditNotes": authoritative_credits,
        }
        authoritative_returns = deepcopy(purchase_order.get("supplierReturns", []))
        authoritative_returns[return_index] = authoritative_return
        authoritative_purchase_order = {
            **dict(purchase_order),
            "supplierReturns": authoritative_returns,
        }
        authoritative_purchase_orders = deepcopy(purchase_orders)
        authoritative_purchase_orders[purchase_order_index] = authoritative_purchase_order
        authoritative_state = dict(state)
        authoritative_state["purchaseOrders"] = authoritative_purchase_orders
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


def _normalize_expected_related_versions(
    related_surfaces: Sequence[str],
    expected_versions: Mapping[str, int] | None,
) -> dict[str, int]:
    if expected_versions is None:
        return {}
    if not isinstance(expected_versions, Mapping) or set(expected_versions) != set(related_surfaces):
        raise TrialValidationError("expected related versions must match related surfaces exactly.")
    normalized: dict[str, int] = {}
    for surface, version in expected_versions.items():
        if not isinstance(version, int) or isinstance(version, bool) or version < 0:
            raise TrialValidationError("expected related versions must be non-negative integers.")
        normalized[str(surface)] = version
    return normalized


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


def shop_correction_authorization_receipt_digest(
    *,
    source: str,
    receipt_id: str,
    workspace_id: str,
    actor_id: str,
    actor_label: str,
    actor_role: str,
    capability: str,
    command_digest: str,
    issued_at_millis: int,
    expires_at_millis: int,
) -> str:
    """Digest the ordered cross-runtime receipt projection.

    The order and domain separator are part of the native/server v2 contract.
    This intentionally is not the store's sorted-key command fingerprint.
    """

    projection = {
        "source": source,
        "receiptId": receipt_id,
        "workspaceId": workspace_id,
        "actorId": actor_id,
        "actorLabel": actor_label,
        "actorRole": actor_role,
        "capability": capability,
        "commandDigest": command_digest,
        "issuedAtMillis": issued_at_millis,
        "expiresAtMillis": expires_at_millis,
    }
    encoded = (
        SHOP_CORRECTION_AUTHORIZATION_V2_CONTRACT
        + "\n"
        + json.dumps(
            projection,
            ensure_ascii=False,
            separators=(",", ":"),
            allow_nan=False,
        )
    ).encode("utf-8")
    return sha256(encoded).hexdigest()


def shop_correction_authorization_receipt_v3_digest(
    *,
    source: str,
    receipt_id: str,
    finalization_request_id: str,
    workspace_id: str,
    actor_id: str,
    actor_label: str,
    actor_role: str,
    capability: str,
    command_digest: str,
    finalized_at_millis: int,
    issued_at_millis: int,
    expires_at_millis: int,
) -> str:
    """Digest the ordered, server-finalized cross-runtime v3 projection."""

    projection = {
        "source": source,
        "receiptId": receipt_id,
        "finalizationRequestId": finalization_request_id,
        "workspaceId": workspace_id,
        "actorId": actor_id,
        "actorLabel": actor_label,
        "actorRole": actor_role,
        "capability": capability,
        "commandDigest": command_digest,
        "finalizedAtMillis": finalized_at_millis,
        "issuedAtMillis": issued_at_millis,
        "expiresAtMillis": expires_at_millis,
    }
    encoded = (
        SHOP_CORRECTION_AUTHORIZATION_CONTRACT
        + "\n"
        + json.dumps(
            projection,
            ensure_ascii=False,
            separators=(",", ":"),
            allow_nan=False,
        )
    ).encode("utf-8")
    return sha256(encoded).hexdigest()


def _configured_shop_correction_signer(
    explicit: ShopCorrectionReceiptSigner | None,
) -> ShopCorrectionReceiptSigner | None:
    try:
        signer = explicit or load_shop_correction_receipt_signer()
        if signer is not None:
            _shop_correction_verification_keys(signer)
        return signer
    except ShopCorrectionSigningError:
        return None


def _shop_correction_verification_keys(
    signer: ShopCorrectionReceiptSigner,
) -> dict[str, str]:
    verification_keys = dict(SHOP_CORRECTION_RECEIPT_PUBLIC_KEYS)
    configured_pin = verification_keys.get(signer.key_id)
    if configured_pin is not None and configured_pin != signer.public_key_base64url:
        raise ShopCorrectionSigningError(
            "shop_correction_signing_public_pin_mismatch"
        )
    verification_keys.setdefault(signer.key_id, signer.public_key_base64url)
    return verification_keys


def _shop_correction_json_object(pairs: list[tuple[str, Any]]) -> JsonObject:
    value: JsonObject = {}
    for key, nested in pairs:
        if key in value:
            raise ValueError("duplicate JSON object key")
        value[key] = nested
    return value


def _reject_shop_correction_json_constant(value: str) -> None:
    raise ValueError(f"unsupported JSON constant: {value}")


def _bounded_shop_correction_text(value: object, *, field: str, maximum: int) -> str:
    if not isinstance(value, str):
        raise TrialValidationError(f"{field} must be text.")
    if (
        not value
        or value != value.strip()
        or len(value) > maximum
        or re.search(r"[\x00-\x1f\x7f]", value)
    ):
        raise TrialValidationError(f"{field} is invalid.")
    return value


def _shop_correction_command_facts(
    *,
    capability: object,
    command_digest: object,
    request_fingerprint: object,
) -> tuple[str, str, str, JsonObject]:
    if (
        not isinstance(capability, str)
        or capability not in SHOP_CORRECTION_AUTHORIZATION_CAPABILITIES
    ):
        raise TrialValidationError("Shop correction capability is invalid.")
    if not isinstance(command_digest, str) or not re.fullmatch(
        r"[0-9a-f]{64}", command_digest
    ):
        raise TrialValidationError("Shop correction command_digest is invalid.")
    if not isinstance(request_fingerprint, str):
        raise TrialValidationError("Shop correction request_fingerprint must be text.")
    try:
        encoded_fingerprint = request_fingerprint.encode("utf-8")
    except UnicodeEncodeError as exc:
        raise TrialValidationError(
            "Shop correction request_fingerprint is invalid."
        ) from exc
    if not encoded_fingerprint or len(encoded_fingerprint) > 4096:
        raise TrialValidationError("Shop correction request_fingerprint is invalid.")
    if sha256(encoded_fingerprint).hexdigest() != command_digest:
        raise TrialValidationError(
            "Shop correction command_digest does not match request_fingerprint."
        )
    try:
        parsed = json.loads(
            request_fingerprint,
            object_pairs_hook=_shop_correction_json_object,
            parse_constant=_reject_shop_correction_json_constant,
        )
    except (json.JSONDecodeError, ValueError, RecursionError) as exc:
        raise TrialValidationError(
            "Shop correction request_fingerprint is invalid JSON."
        ) from exc
    if not isinstance(parsed, dict):
        raise TrialValidationError(
            "Shop correction request_fingerprint must be a JSON object."
        )

    operation_id = _bounded_shop_correction_text(
        parsed.get("operationId"),
        field="Shop correction operationId",
        maximum=120,
    )
    if capability == "shop.sale.reverse":
        expected_keys = {
            "operationId",
            "saleId",
            "saleSnapshotDigest",
            "restockItems",
            "reason",
            "cashReturnConfirmed",
            "expectedCashShiftId",
            "paymentResolution",
        }
        if set(parsed) != expected_keys:
            raise TrialValidationError(
                "Full-sale reversal request_fingerprint fields are invalid."
            )
        sale_id = _bounded_shop_correction_text(
            parsed.get("saleId"), field="Shop correction saleId", maximum=120
        )
        snapshot_digest = parsed.get("saleSnapshotDigest")
        if not isinstance(snapshot_digest, str) or not re.fullmatch(
            r"[0-9a-f]{64}", snapshot_digest
        ):
            raise TrialValidationError("Shop correction saleSnapshotDigest is invalid.")
        restock_items = parsed.get("restockItems")
        cash_return_confirmed = parsed.get("cashReturnConfirmed")
        if type(restock_items) is not bool or type(cash_return_confirmed) is not bool:
            raise TrialValidationError("Shop correction boolean fields are invalid.")
        reason = _bounded_shop_correction_text(
            parsed.get("reason"), field="Shop correction reason", maximum=240
        )
        expected_cash_shift_id = parsed.get("expectedCashShiftId")
        if expected_cash_shift_id is not None:
            expected_cash_shift_id = _bounded_shop_correction_text(
                expected_cash_shift_id,
                field="Shop correction expectedCashShiftId",
                maximum=120,
            )
        payment_resolution = parsed.get("paymentResolution")
        if payment_resolution == "cash_returned_now":
            if not cash_return_confirmed or expected_cash_shift_id is None:
                raise TrialValidationError(
                    "Cash reversal confirmation and shift binding are inconsistent."
                )
        elif payment_resolution == "external_pending":
            if cash_return_confirmed or expected_cash_shift_id is not None:
                raise TrialValidationError(
                    "Wallet reversal must remain pending external reconciliation."
                )
        else:
            raise TrialValidationError("Shop correction paymentResolution is invalid.")
        facts: JsonObject = {
            "operationId": operation_id,
            "saleId": sale_id,
            "saleSnapshotDigest": snapshot_digest,
            "restockItems": restock_items,
            "reason": reason,
            "cashReturnConfirmed": cash_return_confirmed,
            "expectedCashShiftId": expected_cash_shift_id,
            "paymentResolution": payment_resolution,
        }
    else:
        expected_keys = {
            "operationId",
            "reversalId",
            "originalPaymentMethod",
            "originalTotalMmk",
            "outcome",
            "evidenceReference",
        }
        if set(parsed) != expected_keys:
            raise TrialValidationError(
                "Wallet reconciliation request_fingerprint fields are invalid."
            )
        reversal_id = _bounded_shop_correction_text(
            parsed.get("reversalId"),
            field="Shop correction reversalId",
            maximum=120,
        )
        original_payment_method = parsed.get("originalPaymentMethod")
        if not isinstance(original_payment_method, str) or original_payment_method not in {
            "kbzpay",
            "wavepay",
        }:
            raise TrialValidationError(
                "Wallet reconciliation originalPaymentMethod is invalid."
            )
        original_total_mmk = parsed.get("originalTotalMmk")
        if (
            type(original_total_mmk) is not int
            or original_total_mmk < 0
            or original_total_mmk > 200_000_000_000_000
        ):
            raise TrialValidationError(
                "Wallet reconciliation originalTotalMmk is invalid."
            )
        outcome = parsed.get("outcome")
        if not isinstance(outcome, str) or outcome not in {
            "money_returned",
            "payment_not_received",
        }:
            raise TrialValidationError("Wallet reconciliation outcome is invalid.")
        evidence_reference = _bounded_shop_correction_text(
            parsed.get("evidenceReference"),
            field="Wallet evidenceReference",
            maximum=160,
        )
        facts = {
            "operationId": operation_id,
            "reversalId": reversal_id,
            "originalPaymentMethod": original_payment_method,
            "originalTotalMmk": original_total_mmk,
            "outcome": outcome,
            "evidenceReference": evidence_reference,
        }
    return capability, command_digest, request_fingerprint, facts


def _shop_correction_authorization_request(
    *,
    authorization_request_id: str | UUID,
    capability: object,
    command_digest: object,
    request_fingerprint: object,
    confirmation: object,
) -> tuple[str, str, str, str, JsonObject]:
    request_id = _normalize_uuid(
        authorization_request_id,
        field_name="authorization_request_id",
    )
    capability_value, digest_value, fingerprint_value, facts = (
        _shop_correction_command_facts(
            capability=capability,
            command_digest=command_digest,
            request_fingerprint=request_fingerprint,
        )
    )
    expected_confirmation = SHOP_CORRECTION_AUTHORIZATION_CONFIRMATIONS[capability_value]
    if not isinstance(confirmation, str) or confirmation != expected_confirmation:
        raise TrialValidationError("Shop correction confirmation is invalid.")
    return (
        request_id,
        capability_value,
        digest_value,
        confirmation,
        facts,
    )


def _shop_correction_finalization_identity(
    *, workspace_id: str, capability: str, semantic_target_id: str
) -> tuple[str, str]:
    """Return the global semantic-correction key and fingerprint.

    The caller's request id is deliberately absent. It identifies an ambiguous
    retry claimant, not a new authorization for the same sale or reversal.
    The exact command digest remains bound in the signed receipt and stored
    payload, while this key prevents a clone from changing its operation id to
    obtain another authorization for the same business target.
    """

    binding = {
        "contract": SHOP_CORRECTION_AUTHORIZATION_CONTRACT,
        "workspace_id": workspace_id,
        "capability": capability,
        "semantic_target_id": semantic_target_id,
    }
    command_id = str(
        uuid5(
            NAMESPACE_URL,
            SHOP_CORRECTION_AUTHORIZATION_COMMAND_NAMESPACE
            + "\n"
            + json.dumps(binding, sort_keys=True, separators=(",", ":")),
        )
    )
    return command_id, _canonical_fingerprint(
        "shop_correction_authorization_finalization", binding
    )


def _shop_correction_uuid(value: object, *, field: str) -> str:
    try:
        return str(UUID(str(value)))
    except (TypeError, ValueError, AttributeError) as exc:
        raise TrialValidationError(f"{field} must be a UUID.") from exc


def _shop_correction_digest(value: object, *, field: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value):
        raise TrialValidationError(f"{field} must be a lowercase SHA-256 digest.")
    return value


def _shop_correction_lineage_input(
    *,
    lineage_id: object,
    lineage_epoch: object,
    consumption_ordinal: object,
    consumption_digest: object,
) -> tuple[str, int, int, str | None]:
    lineage = _shop_correction_uuid(lineage_id, field="lineage_id")
    if type(lineage_epoch) is not int or lineage_epoch < 1:
        raise TrialValidationError("lineage_epoch must be a positive integer.")
    if type(consumption_ordinal) is not int or consumption_ordinal < 0:
        raise TrialValidationError("consumption_ordinal must be a non-negative integer.")
    if consumption_digest is None:
        if consumption_ordinal != 0:
            raise TrialValidationError(
                "A non-empty correction watermark requires a consumption digest."
            )
        digest = None
    else:
        digest = _shop_correction_digest(
            consumption_digest, field="consumption_digest"
        )
        if consumption_ordinal == 0:
            raise TrialValidationError(
                "An empty correction watermark cannot carry a consumption digest."
            )
    return lineage, lineage_epoch, consumption_ordinal, digest


def _shop_correction_consumption_identity(
    *, workspace_id: str, capability: str, semantic_target_id: str
) -> tuple[str, str]:
    target = _bounded_shop_correction_text(
        semantic_target_id,
        field="Shop correction semantic_target_id",
        maximum=120,
    )
    if capability not in SHOP_CORRECTION_AUTHORIZATION_CAPABILITIES:
        raise TrialValidationError("Shop correction capability is invalid.")
    binding = {
        "contract": SHOP_CORRECTION_CONSUMPTION_CONTRACT,
        "workspace_id": workspace_id,
        "capability": capability,
        "semantic_target_id": target,
    }
    command_id = str(
        uuid5(
            NAMESPACE_URL,
            SHOP_CORRECTION_CONSUMPTION_COMMAND_NAMESPACE
            + "\n"
            + json.dumps(binding, sort_keys=True, separators=(",", ":")),
        )
    )
    return command_id, _canonical_fingerprint(
        "shop_correction_consumption", binding
    )


def _shop_correction_consumption_digest(
    *,
    consumption_id: str,
    consumption_request_id: str,
    authorization_receipt_id: str,
    authorization_receipt_digest: str,
    workspace_id: str,
    actor_id: str,
    capability: str,
    semantic_target_id: str,
    command_digest: str,
    lineage_id: str,
    lineage_epoch: int,
    consumption_ordinal: int,
    previous_consumption_digest: str | None,
    consumed_at_millis: int,
) -> str:
    projection = {
        "consumptionId": consumption_id,
        "consumptionRequestId": consumption_request_id,
        "authorizationReceiptId": authorization_receipt_id,
        "authorizationReceiptDigest": authorization_receipt_digest,
        "workspaceId": workspace_id,
        "actorId": actor_id,
        "capability": capability,
        "semanticTargetId": semantic_target_id,
        "commandDigest": command_digest,
        "lineageId": lineage_id,
        "lineageEpoch": lineage_epoch,
        "consumptionOrdinal": consumption_ordinal,
        "previousConsumptionDigest": previous_consumption_digest,
        "consumedAtMillis": consumed_at_millis,
        "moneyMovementPerformed": False,
        "localMutationPerformed": False,
    }
    return sha256(
        (
            SHOP_CORRECTION_CONSUMPTION_CONTRACT
            + "\n"
            + json.dumps(
                projection,
                ensure_ascii=False,
                separators=(",", ":"),
                allow_nan=False,
            )
        ).encode("utf-8")
    ).hexdigest()


def _shop_correction_lineage_from_mapping(
    value: object,
    *,
    workspace_id: str | None = None,
    idempotent_replay: bool = False,
) -> ShopCorrectionLineageRecord:
    if not isinstance(value, Mapping):
        raise TrialStoreError("Shop correction lineage evidence is invalid.")
    try:
        record = ShopCorrectionLineageRecord(
            activation_request_id=str(UUID(str(value.get("activation_request_id")))),
            workspace_id=str(value.get("workspace_id") or ""),
            actor_id=str(value.get("actor_id") or ""),
            lineage_id=str(UUID(str(value.get("lineage_id")))),
            lineage_epoch=int(value.get("lineage_epoch")),
            previous_lineage_id=(
                None
                if value.get("previous_lineage_id") is None
                else str(UUID(str(value.get("previous_lineage_id"))))
            ),
            previous_lineage_epoch=(
                None
                if value.get("previous_lineage_epoch") is None
                else int(value.get("previous_lineage_epoch"))
            ),
            consumption_ordinal=int(value.get("current_consumption_ordinal")),
            consumption_digest=(
                None
                if value.get("current_consumption_digest") is None
                else str(value.get("current_consumption_digest"))
            ),
            activated_at_millis=int(value.get("activated_at_millis")),
            idempotent_replay=idempotent_replay,
        )
    except (TypeError, ValueError, AttributeError) as exc:
        raise TrialStoreError("Shop correction lineage evidence is invalid.") from exc
    try:
        _shop_correction_lineage_input(
            lineage_id=record.lineage_id,
            lineage_epoch=record.lineage_epoch,
            consumption_ordinal=record.consumption_ordinal,
            consumption_digest=record.consumption_digest,
        )
    except TrialValidationError as exc:
        raise TrialStoreError("Shop correction lineage evidence is invalid.") from exc
    if (
        not record.workspace_id
        or (workspace_id is not None and record.workspace_id != workspace_id)
        or not record.actor_id
        or record.activated_at_millis <= 0
        or ((record.previous_lineage_id is None) != (record.previous_lineage_epoch is None))
        or (
            record.lineage_epoch == 1
            and (record.previous_lineage_id is not None or record.previous_lineage_epoch is not None)
        )
        or (
            record.lineage_epoch > 1
            and record.previous_lineage_epoch != record.lineage_epoch - 1
        )
    ):
        raise TrialStoreError("Shop correction lineage evidence is invalid.")
    return record


def _shop_correction_consumption_from_mapping(
    value: object,
    *,
    signer: ShopCorrectionReceiptSigner,
    workspace_id: str,
    response_mode: str,
) -> ShopCorrectionConsumptionProof:
    if not isinstance(value, Mapping):
        raise TrialStoreError("Shop correction consumption evidence is invalid.")
    try:
        proof = ShopCorrectionConsumptionProof(
            consumption_id=str(UUID(str(value.get("consumption_id")))),
            consumption_request_id=str(UUID(str(value.get("consumption_request_id")))),
            authorization_receipt_id=str(UUID(str(value.get("authorization_receipt_id")))),
            authorization_receipt_digest=str(value.get("authorization_receipt_digest") or ""),
            workspace_id=str(value.get("workspace_id") or ""),
            actor_id=str(value.get("actor_id") or ""),
            capability=str(value.get("capability") or ""),
            semantic_target_id=str(value.get("semantic_target_id") or ""),
            command_digest=str(value.get("command_digest") or ""),
            lineage_id=str(UUID(str(value.get("lineage_id")))),
            lineage_epoch=int(value.get("lineage_epoch")),
            consumption_ordinal=int(value.get("consumption_ordinal")),
            previous_consumption_digest=(
                None
                if value.get("previous_consumption_digest") is None
                else str(value.get("previous_consumption_digest"))
            ),
            history_digest=str(value.get("history_digest") or ""),
            consumed_at_millis=int(value.get("consumed_at_millis")),
            key_id=str(value.get("key_id") or ""),
            signature=str(value.get("signature") or ""),
            response_mode=response_mode,
        )
    except (TypeError, ValueError, AttributeError) as exc:
        raise TrialStoreError("Shop correction consumption evidence is invalid.") from exc
    expected = _shop_correction_consumption_digest(
        consumption_id=proof.consumption_id,
        consumption_request_id=proof.consumption_request_id,
        authorization_receipt_id=proof.authorization_receipt_id,
        authorization_receipt_digest=proof.authorization_receipt_digest,
        workspace_id=proof.workspace_id,
        actor_id=proof.actor_id,
        capability=proof.capability,
        semantic_target_id=proof.semantic_target_id,
        command_digest=proof.command_digest,
        lineage_id=proof.lineage_id,
        lineage_epoch=proof.lineage_epoch,
        consumption_ordinal=proof.consumption_ordinal,
        previous_consumption_digest=proof.previous_consumption_digest,
        consumed_at_millis=proof.consumed_at_millis,
    )
    try:
        verification_keys = _shop_correction_verification_keys(signer)
    except ShopCorrectionSigningError as exc:
        raise TrialStoreError(
            "Shop correction signing key conflicts with its source pin."
        ) from exc
    if (
        proof.workspace_id != workspace_id
        or proof.capability not in SHOP_CORRECTION_AUTHORIZATION_CAPABILITIES
        or proof.history_digest != expected
        or not verify_shop_correction_signature(
            key_id=proof.key_id,
            receipt_digest=proof.history_digest,
            signature=proof.signature,
            public_keys=verification_keys,
        )
    ):
        raise TrialStoreError("Shop correction consumption evidence is invalid.")
    return proof


def _shop_correction_receipt_from_mapping(
    value: object,
    *,
    signer: ShopCorrectionReceiptSigner,
    workspace_id: str,
    actor_id: str,
    finalization_request_id: str,
    capability: str,
    command_digest: str,
    idempotent_replay: bool,
) -> ShopCorrectionAuthorizationReceipt:
    if not isinstance(value, Mapping):
        raise TrialStoreError("Shop correction authorization evidence is invalid.")
    expected_keys = {
        "contract",
        "receiptId",
        "receiptDigest",
        "finalizationRequestId",
        "workspaceId",
        "actorId",
        "actorLabel",
        "actorRole",
        "capability",
        "source",
        "commandDigest",
        "finalizedAtMillis",
        "issuedAtMillis",
        "expiresAtMillis",
        "keyId",
        "signature",
    }
    if set(value) != expected_keys:
        raise TrialStoreError("Shop correction authorization evidence is invalid.")
    try:
        receipt_id = str(UUID(str(value.get("receiptId"))))
    except (TypeError, ValueError, AttributeError) as exc:
        raise TrialStoreError("Shop correction authorization evidence is invalid.") from exc
    issued_at_millis = value.get("issuedAtMillis")
    finalized_at_millis = value.get("finalizedAtMillis")
    expires_at_millis = value.get("expiresAtMillis")
    if (
        type(finalized_at_millis) is not int
        or type(issued_at_millis) is not int
        or type(expires_at_millis) is not int
    ):
        raise TrialStoreError("Shop correction authorization evidence is invalid.")
    receipt = ShopCorrectionAuthorizationReceipt(
        receipt_id=receipt_id,
        receipt_digest=str(value.get("receiptDigest") or ""),
        finalization_request_id=str(value.get("finalizationRequestId") or ""),
        workspace_id=str(value.get("workspaceId") or ""),
        actor_id=str(value.get("actorId") or ""),
        actor_label=str(value.get("actorLabel") or ""),
        actor_role=str(value.get("actorRole") or ""),
        capability=str(value.get("capability") or ""),
        source=str(value.get("source") or ""),
        command_digest=str(value.get("commandDigest") or ""),
        finalized_at_millis=finalized_at_millis,
        issued_at_millis=issued_at_millis,
        expires_at_millis=expires_at_millis,
        key_id=str(value.get("keyId") or ""),
        signature=str(value.get("signature") or ""),
        idempotent_replay=idempotent_replay,
    )
    expected_digest = shop_correction_authorization_receipt_v3_digest(
        source=receipt.source,
        receipt_id=receipt.receipt_id,
        finalization_request_id=receipt.finalization_request_id,
        workspace_id=receipt.workspace_id,
        actor_id=receipt.actor_id,
        actor_label=receipt.actor_label,
        actor_role=receipt.actor_role,
        capability=receipt.capability,
        command_digest=receipt.command_digest,
        finalized_at_millis=receipt.finalized_at_millis,
        issued_at_millis=receipt.issued_at_millis,
        expires_at_millis=receipt.expires_at_millis,
    )
    if (
        value.get("contract") != SHOP_CORRECTION_AUTHORIZATION_CONTRACT
        or receipt.finalization_request_id != finalization_request_id
        or receipt.workspace_id != workspace_id
        or receipt.actor_id != actor_id
        or receipt.actor_label != "Workspace owner"
        or receipt.actor_role != "owner"
        or receipt.capability != capability
        or receipt.source != SHOP_CORRECTION_AUTHORIZATION_SOURCE
        or receipt.command_digest != command_digest
        or not re.fullmatch(r"[0-9a-f]{64}", receipt.receipt_digest)
        or receipt.receipt_digest != expected_digest
        or receipt.finalized_at_millis <= 0
        or receipt.issued_at_millis <= 0
        or not (
            receipt.issued_at_millis
            <= receipt.finalized_at_millis
            <= receipt.expires_at_millis
        )
        or receipt.expires_at_millis - receipt.issued_at_millis
        != SHOP_CORRECTION_AUTHORIZATION_TTL_MILLIS
        or receipt.key_id != signer.key_id
        or not signer.verify(
            receipt_digest=receipt.receipt_digest,
            signature=receipt.signature,
        )
    ):
        raise TrialStoreError("Shop correction authorization evidence is invalid.")
    return receipt


def _new_shop_correction_authorization_receipt(
    *,
    signer: ShopCorrectionReceiptSigner,
    workspace_id: str,
    actor_id: str,
    finalization_request_id: str,
    capability: str,
    command_digest: str,
    finalized_at_millis: int,
) -> ShopCorrectionAuthorizationReceipt:
    issued_at_millis = finalized_at_millis
    expires_at_millis = issued_at_millis + SHOP_CORRECTION_AUTHORIZATION_TTL_MILLIS
    receipt_id = str(uuid4())
    receipt_digest = shop_correction_authorization_receipt_v3_digest(
        source=SHOP_CORRECTION_AUTHORIZATION_SOURCE,
        receipt_id=receipt_id,
        finalization_request_id=finalization_request_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        actor_label="Workspace owner",
        actor_role="owner",
        capability=capability,
        command_digest=command_digest,
        finalized_at_millis=finalized_at_millis,
        issued_at_millis=issued_at_millis,
        expires_at_millis=expires_at_millis,
    )
    return ShopCorrectionAuthorizationReceipt(
        receipt_id=receipt_id,
        receipt_digest=receipt_digest,
        finalization_request_id=finalization_request_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        actor_label="Workspace owner",
        actor_role="owner",
        capability=capability,
        source=SHOP_CORRECTION_AUTHORIZATION_SOURCE,
        command_digest=command_digest,
        finalized_at_millis=finalized_at_millis,
        issued_at_millis=issued_at_millis,
        expires_at_millis=expires_at_millis,
        key_id=signer.key_id,
        signature=signer.sign(receipt_digest=receipt_digest),
    )


def _normalize_acceptance_product(product: object) -> tuple[str, str]:
    normalized = str(product or "").strip().lower()
    surface = PRODUCT_ACCEPTANCE_SURFACES.get(normalized)
    if surface is None:
        raise TrialValidationError("Unsupported product acceptance target.")
    return normalized, surface


def _normalize_release_commit(value: object) -> str:
    commit = str(value or "").strip().lower()
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise TrialValidationError("release_commit must be an immutable Git SHA.")
    return commit


def _product_acceptance_record(
    value: Mapping[str, Any],
    *,
    idempotent_replay: bool = False,
) -> ProductAcceptanceRecord:
    product, surface = _normalize_acceptance_product(value.get("product"))
    probe_id = _normalize_uuid(value.get("probe_id", ""), field_name="probe_id")
    owner_approval_id = _normalize_uuid(
        value.get("owner_approval_id", ""),
        field_name="owner_approval_id",
    )
    release_commit = _normalize_release_commit(value.get("release_commit"))
    state_version = value.get("state_version")
    state_digest = str(value.get("state_digest") or "")
    recorded_at = str(value.get("recorded_at") or "")
    if (
        value.get("contract") != PRODUCT_ACCEPTANCE_CONTRACT
        or value.get("surface") != surface
        or not isinstance(state_version, int)
        or isinstance(state_version, bool)
        or state_version < 0
        or not re.fullmatch(r"sha256:[0-9a-f]{64}", state_digest)
        or not recorded_at
    ):
        raise TrialStoreError("Product acceptance evidence is invalid.")
    try:
        parsed_recorded_at = datetime.fromisoformat(recorded_at.replace("Z", "+00:00"))
    except ValueError as exc:
        raise TrialStoreError("Product acceptance evidence is invalid.") from exc
    if parsed_recorded_at.tzinfo is None:
        raise TrialStoreError("Product acceptance evidence is invalid.")
    return ProductAcceptanceRecord(
        probe_id=probe_id,
        owner_approval_id=owner_approval_id,
        product=product,
        surface=surface,
        release_commit=release_commit,
        state_version=state_version,
        state_digest=state_digest,
        recorded_at=recorded_at,
        idempotent_replay=idempotent_replay,
    )


def validate_self_serve_claim_code(value: object) -> str:
    claim_code = str(value or "").strip()
    if not SELF_SERVE_CLAIM_CODE_PATTERN.fullmatch(claim_code):
        raise TrialValidationError(
            "claim code must match SM-XXXX-XXXX using the Crockford alphabet without I, L, O, or U."
        )
    return claim_code


def validate_self_serve_business_name(value: object) -> str:
    business_name = str(value or "")
    if (
        not business_name.strip()
        or business_name != business_name.strip()
        or len(business_name) > SELF_SERVE_MAX_BUSINESS_NAME
    ):
        raise TrialValidationError(
            "business name must be canonical visible text of at most 120 characters."
        )
    return business_name


def self_serve_workspace_id(claim_code: str) -> str:
    """Derive the one workspace identity a claim code can ever provision.

    The claim is the join key between the device trial and the managed tenant
    (spec step D), so the tenant id is derived rather than generated: the same
    claim always replays the same workspace and can never mint a second tenant.
    """

    claim = validate_self_serve_claim_code(claim_code)
    return str(uuid5(NAMESPACE_URL, f"supermega:self-serve-workspace:{claim}"))


def _self_serve_command_identity(
    claim_code: str,
    business_name: str,
    product: str = "commerce",
) -> tuple[str, str, str]:
    normalized_product = validate_self_serve_product(product)
    workspace_id = self_serve_workspace_id(claim_code)
    command_id = str(uuid5(UUID(workspace_id), f"self-serve-create:{claim_code}"))
    fingerprint = _canonical_fingerprint(
        "self_serve_workspace",
        {
            "workspace_id": workspace_id,
            "claim_code": claim_code,
            "business_name": business_name,
            "product": normalized_product,
            "event_type": SELF_SERVE_WORKSPACE_EVENT_TYPE,
        },
    )
    return workspace_id, command_id, fingerprint


def _count_self_serve_attempt(attempts: dict[str, int], actor_id: str) -> None:
    """One fail-closed counter per user; the caller holds the store lock."""

    total = attempts.get(actor_id, 0) + 1
    attempts[actor_id] = total
    if total > SELF_SERVE_RATE_LIMIT_MAX:
        raise TrialRateLimited(limit=SELF_SERVE_RATE_LIMIT_MAX)


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
    base_ready = bool(
        normalized.authenticated
        and normalized.workspace_id
        and normalized.actor_id
        and normalized.actor_kind in TRUSTED_ACTOR_KINDS
        and normalized.identity_provider in TRUSTED_IDENTITY_PROVIDERS
    )
    if not base_ready:
        return False
    if normalized.identity_provider != "supabase":
        return True
    try:
        return bool(
            normalized.actor_kind == HUMAN_ACTOR_KIND
            and str(UUID(normalized.actor_id)) == normalized.actor_id
            and str(UUID(normalized.session_id)) == normalized.session_id
        )
    except (ValueError, AttributeError, TypeError):
        return False


def _require_shop_correction_principal(principal: TrialPrincipal) -> TrialPrincipal:
    normalized = principal.normalized()
    if normalized.actor_kind != HUMAN_ACTOR_KIND:
        raise TrialHumanApprovalRequired()
    if normalized.identity_provider != "supabase":
        raise TrialPermissionDenied("shop.correction.supabase_identity")
    if not _principal_auth_ready(normalized):
        raise TrialNotReadyError(("auth_ready",))
    return normalized


def _iso_timestamp(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        normalized = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
        return normalized.astimezone(timezone.utc).isoformat()
    return str(value)


def _normalize_sql_source(value: Any) -> str:
    return " ".join(str(value or "").strip().lower().split())


_WEBSITE_REVIEW_TRIGGERS = {
    ("website_customer_reviews", "website_review_guard"): (31, "guard_website_review", "8f8af0590da5a261d83bbeb533c32e66d8f93b107c1678816914e87d5142e9ab"),
    ("workspace_state", "website_reviews_invalidate"): (25, "invalidate_website_reviews", "2cd9786703eabacac44f2c1d41bd8f8f15a071d87974d2df767e6f6a5a0dcd5e"),
    ("website_customer_feedback", "website_feedback_guard"): (31, "guard_website_feedback", "50985a3ff0c869379803e8ea8d1bdcdffc1643b933d473b2b813721a79730f4d"),
}


def _without_verified_website_review_triggers(rows: Sequence[Mapping[str, Any]]) -> list[Mapping[str, Any]]:
    """Optional extension: accept all three exact guards or none, never ignore drift."""
    extension = [row for row in rows if (row.get("table_name"), row.get("trigger_name")) in _WEBSITE_REVIEW_TRIGGERS]
    if not extension:
        return list(rows)
    if len(extension) != 3 or len({(row["table_name"], row["trigger_name"]) for row in extension}) != 3:
        raise TrialNotReadyError(("schema_ready",))
    for row in extension:
        mask, function, digest = _WEBSITE_REVIEW_TRIGGERS[(row["table_name"], row["trigger_name"])]
        if (row.get("event_mask") != mask or row.get("enabled") != "O"
                or not all(row.get(key) for key in ("no_when_clause", "no_arguments", "no_column_filter", "no_constraint_link", "not_deferrable", "not_initially_deferred", "no_transition_tables"))
                or row.get("function_schema") != "app_private" or row.get("function_name") != function
                or row.get("function_language") != "plpgsql" or row.get("security_definer") is not False
                or tuple(row.get("function_config") or ()) != ("search_path=pg_catalog, app_private",)
                or sha256(_normalize_sql_source(row.get("function_source")).encode()).hexdigest() != digest):
            raise TrialNotReadyError(("schema_ready",))
    return [row for row in rows if (row.get("table_name"), row.get("trigger_name")) not in _WEBSITE_REVIEW_TRIGGERS]


_ECOMMERCE_REVIEW_TRIGGERS = {
    ("ecommerce_customer_reviews", "ecommerce_review_guard"): (31, "guard_ecommerce_review", "41583ca2889b54fcf7c77c68d307f55ec127b218b27f3bc001cf05418e4776d9"),
    ("workspace_state", "ecommerce_reviews_invalidate"): (25, "invalidate_ecommerce_reviews", "2f8e3905cd867d3a118d4fd6eaf9963248cee9ea14cfd7df0160d073f2167959"),
}

def _without_verified_ecommerce_review_triggers(rows: Sequence[Mapping[str, Any]]) -> list[Mapping[str, Any]]:
    """Optional extension: accept both exact guards or none, never ignore drift."""
    extension = [row for row in rows if (row.get("table_name"), row.get("trigger_name")) in _ECOMMERCE_REVIEW_TRIGGERS]
    if not extension:
        return list(rows)
    if len(extension) != 2 or len({(row["table_name"], row["trigger_name"]) for row in extension}) != 2:
        raise TrialNotReadyError(("schema_ready",))
    for row in extension:
        mask, function, digest = _ECOMMERCE_REVIEW_TRIGGERS[(row["table_name"], row["trigger_name"])]
        if (row.get("event_mask") != mask or row.get("enabled") != "O"
                or not all(row.get(key) for key in ("no_when_clause", "no_arguments", "no_column_filter", "no_constraint_link", "not_deferrable", "not_initially_deferred", "no_transition_tables"))
                or row.get("function_schema") != "app_private" or row.get("function_name") != function
                or row.get("function_language") != "plpgsql" or row.get("security_definer") is not False
                or tuple(row.get("function_config") or ()) != ("search_path=pg_catalog, app_private",)
                or sha256(str(row.get("function_source") or "").replace("\r\n", "\n").strip().encode()).hexdigest() != digest):
            raise TrialNotReadyError(("schema_ready",))
    return [row for row in rows if (row.get("table_name"), row.get("trigger_name")) not in _ECOMMERCE_REVIEW_TRIGGERS]


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

    def __init__(
        self,
        database_url: str,
        *,
        reducer: StateReducer,
        write_enabled: bool = False,
        shop_correction_signer: ShopCorrectionReceiptSigner | None = None,
    ):
        self.database_url = str(database_url or "").strip()
        self.reducer = reducer
        self.write_enabled = bool(write_enabled)
        self._shop_correction_signer = _configured_shop_correction_signer(
            shop_correction_signer
        )

    def shop_correction_authorization_signing_ready(self) -> bool:
        return self._shop_correction_signer is not None

    def _connect(self):
        if not self.database_url:
            raise TrialNotReadyError(("database_ready",))
        try:
            import psycopg
            from psycopg.rows import dict_row
        except ImportError as exc:
            raise TrialNotReadyError(("postgres_driver_ready",)) from exc
        # Enforce encrypted transport by CONNECTION CONFIGURATION -- the only place
        # it holds for BOTH the direct-host lane and the Supavisor session pooler
        # that production must use (the Supabase direct host is IPv6-only). psycopg
        # refuses to open the connection unless the channel negotiates TLS under an
        # sslmode of require/verify-ca/verify-full, so a successful connect proves
        # the client->server (or client->pooler) leg is encrypted. A per-backend
        # pg_stat_ssl read reflects the pooler->Postgres leg, not the client leg,
        # and reads FALSE through Supavisor even when the client leg is TLS
        # (finding 6) -- so this configuration assertion, not a query, is the
        # authoritative guarantee. Fail closed; never silently downgrade or force.
        self._require_dsn_tls(self.database_url)
        # Keep autocommit explicitly disabled so every request can bind its
        # identity to one transaction, and disable automatic prepared statements
        # for Supavisor transaction mode.
        connection_kwargs: dict[str, Any] = {
            "row_factory": dict_row,
            "connect_timeout": 5,
            "autocommit": False,
            "prepare_threshold": None,
            "application_name": "supermega-trial-runtime",
        }
        return psycopg.connect(self.database_url, **connection_kwargs)

    @staticmethod
    def _require_dsn_tls(database_url: str) -> None:
        """Fail closed unless the connection DSN configures TLS transport.

        sslmode must be one of require/verify-ca/verify-full; prefer, allow,
        disable, or an omitted mode are rejected. This is where transit
        encryption is actually enforced (see _connect); the DSN is never
        surfaced in the raised error.
        """

        try:
            from psycopg.conninfo import conninfo_to_dict
        except ImportError as exc:
            raise TrialNotReadyError(("postgres_driver_ready",)) from exc
        try:
            configured_sslmode = (
                str(conninfo_to_dict(str(database_url)).get("sslmode", "")).strip().lower()
            )
        except Exception:  # noqa: BLE001 - never surface the DSN in the error
            raise TrialNotReadyError(("database_url_invalid",)) from None
        if configured_sslmode not in TRIAL_TLS_SSLMODES:
            raise TrialNotReadyError(("tls_required",))

    @staticmethod
    def _set_context(cursor: Any, principal: TrialPrincipal) -> None:
        cursor.execute(
            "select set_config('app.workspace_id', %s, true), set_config('app.actor_id', %s, true), set_config('app.actor_kind', %s, true)",
            (principal.workspace_id, principal.actor_id, principal.actor_kind),
        )

    @staticmethod
    def _assert_active_identity_session(cursor: Any, principal: TrialPrincipal) -> None:
        if principal.identity_provider != "supabase":
            return
        cursor.execute(
            "select app_private.supabase_session_is_active(%s::uuid, %s::uuid) as active",
            (principal.actor_id, principal.session_id),
        )
        row = cursor.fetchone() or {}
        if not bool(row.get("active")):
            raise TrialNotReadyError(("auth_session_active",))

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
              to_regclass('app_private.workspace_access_controls') is not null
                as workspace_access_control_ready,
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
              to_regclass('app_private.ecommerce_customer_decisions') is not null
                as ecommerce_decision_storage_present,
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
            or not bool(row.get("workspace_access_control_ready"))
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
        raw_triggers = cursor.fetchall()
        trigger_rows = _without_verified_ecommerce_review_triggers(
            _without_verified_website_review_triggers(raw_triggers))
        from .website_acceptance_schema import ACCEPTANCE_TRIGGERS, acceptance_triggers_verified, acceptance_storage_verified
        if any((row.get("table_name"), row.get("trigger_name")) in ACCEPTANCE_TRIGGERS for row in trigger_rows):
            # Optional extension: never whitelist a trigger by name alone.
            if (not acceptance_triggers_verified(raw_triggers)
                    or not set(_WEBSITE_REVIEW_TRIGGERS).issubset(
                        {(row.get("table_name"), row.get("trigger_name")) for row in raw_triggers})
                    or not acceptance_storage_verified(cursor)):
                raise TrialNotReadyError(("website_acceptance_storage_ready",))
            trigger_rows = [row for row in trigger_rows
                            if (row.get("table_name"), row.get("trigger_name")) not in ACCEPTANCE_TRIGGERS]
        from .ecommerce_decision_schema import (
            ACCEPTANCE_TRIGGERS as CATALOG_DECISION_TRIGGERS,
            acceptance_triggers_verified as catalog_decision_triggers_verified,
            acceptance_storage_verified as catalog_decision_storage_verified,
        )
        if row.get("ecommerce_decision_storage_present") or any(
                (item.get("table_name"), item.get("trigger_name")) in CATALOG_DECISION_TRIGGERS
                for item in raw_triggers):
            if (not catalog_decision_triggers_verified(raw_triggers)
                    or not catalog_decision_storage_verified(cursor)):
                raise TrialNotReadyError(("ecommerce_decision_storage_ready",))
            trigger_rows = [row for row in trigger_rows
                           if (row.get("table_name"), row.get("trigger_name")) not in CATALOG_DECISION_TRIGGERS]
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
        from .core_security_catalog import core_security_catalog_verified
        if not core_security_catalog_verified(cursor, TRIAL_SCHEMA_VERSION):
            raise TrialNotReadyError(("schema_ready",))

    @staticmethod
    def _assert_runtime_role(cursor: Any) -> None:
        # Finding 6: transit TLS is enforced by the sslmode connection assertion in
        # _connect (require/verify-ca/verify-full), which holds through the Supavisor
        # session pooler production must use. The old per-backend SSL-status read
        # reflected the pooler->Postgres leg, not the client leg, so it was FALSE
        # over the pooler even when the client leg was encrypted. The tls_active
        # column below now only sanity-checks that the server supports TLS; the
        # authoritative client-leg guarantee lives in _connect.
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
                -- Exactly one conforming runtime-login member, plus at most the
                -- Supabase-managed conforming `postgres` admin member that
                -- supabase_admin auto-grants and the customer cannot revoke. This
                -- mirrors the v4 backend_role_guard tolerance verbatim (that guard
                -- runs before the login role exists; this check runs after, so it
                -- must admit both members). postgres is the project's top role and
                -- already outranks the backend role; its membership grants no
                -- application escalation (RLS is GUC-actor-bound, not login-bound).
                select
                  count(*) filter (
                    where member_role.rolname = current_user
                      and membership.inherit_option
                      and not membership.set_option
                      and not membership.admin_option
                  ) = 1
                  and bool_and(
                    (
                      member_role.rolname = current_user
                      and membership.inherit_option
                      and not membership.set_option
                      and not membership.admin_option
                    )
                    or (
                      member_role.rolname = 'postgres'
                      and grantor_role.rolname in ('postgres', 'supabase_admin')
                      and membership.admin_option
                      and not membership.inherit_option
                      and not membership.set_option
                    )
                  )
                from backend_role
                join pg_auth_members membership on membership.roleid = backend_role.oid
                join pg_roles member_role on member_role.oid = membership.member
                join pg_roles grantor_role on grantor_role.oid = membership.grantor
              ), false) as backend_member_exact,
              not exists (
                -- The runtime login role may carry only the same Supabase-managed
                -- conforming `postgres` admin membership; any other member fails.
                select 1
                from runtime_role
                join pg_auth_members membership on membership.roleid = runtime_role.oid
                join pg_roles member_role on member_role.oid = membership.member
                join pg_roles grantor_role on grantor_role.oid = membership.grantor
                where not (
                  member_role.rolname = 'postgres'
                  and grantor_role.rolname in ('postgres', 'supabase_admin')
                  and membership.admin_option
                  and not membership.inherit_option
                  and not membership.set_option
                )
              ) as no_runtime_role_members,
              not exists (
                select 1
                from runtime_role cross join elevated_role
                where runtime_role.oid <> elevated_role.oid
                  and pg_has_role(runtime_role.oid, elevated_role.oid, 'USAGE')
              ) as no_elevated_membership,
              coalesce((
                select not has_schema_privilege(current_user, n.oid, 'CREATE')
                  and not has_schema_privilege(b.oid, n.oid, 'CREATE')
                from pg_namespace n cross join backend_role b
                where n.nspname = 'app_private'
              ), false) as no_private_schema_create,
              not exists (
                -- Ownership permits DDL independently of ordinary ACL grants.
                -- Reject ownership by the login or any effectively inherited
                -- role, including the backend role, in this database.
                select 1
                from pg_shdepend d
                where d.refclassid = 'pg_authid'::regclass
                  and d.deptype = 'o'
                  and (
                    d.dbid = (select oid from pg_database where datname = current_database())
                    or (d.classid = 'pg_database'::regclass
                        and d.objid = (select oid from pg_database where datname = current_database()))
                  )
                  and pg_has_role(current_user, d.refobjid, 'USAGE')
              ) as no_database_object_ownership,
              coalesce((select setting = 'on' from pg_settings where name = 'ssl'), false) as tls_active
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
            "no_private_schema_create",
            "no_database_object_ownership",
            "tls_active",
        )
        if not all(bool(row.get(check)) for check in required):
            raise TrialNotReadyError(("role_ready",))

    @staticmethod
    def _load_membership(cursor: Any, principal: TrialPrincipal) -> frozenset[str]:
        cursor.execute(
            """
            select membership.actor_kind, membership.capabilities
            from app_private.workspace_memberships membership
            join app_private.workspace_access_controls access_control
              on access_control.workspace_id = membership.workspace_id
             and access_control.status = 'active'
            where membership.workspace_id = %s
              and membership.actor_id = %s
              and membership.status = 'active'
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
    def _workspace_access_label(capabilities: Sequence[str]) -> str:
        normalized = frozenset(str(item).strip() for item in capabilities if str(item).strip())
        if "company.control.approve" in normalized or "company.write" in normalized:
            return "owner"
        if "approvals.decide" in normalized or any(item.endswith(".write") for item in normalized):
            return "operator"
        return "viewer"

    def list_actor_workspaces(
        self,
        principal: TrialPrincipal,
        *,
        limit: int = 50,
    ) -> tuple[list[ManagedWorkspaceAccess], bool]:
        normalized = principal.normalized()
        if (
            not _principal_auth_ready(normalized)
            or normalized.identity_provider != "supabase"
            or normalized.actor_kind != HUMAN_ACTOR_KIND
        ):
            raise TrialNotReadyError(("auth_ready",))
        if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= 50:
            raise TrialValidationError("Workspace discovery limit must be between 1 and 50.")
        try:
            connection = self._connect()
        except TrialStoreError:
            raise
        except Exception as exc:
            raise TrialNotReadyError(("database_ready",)) from exc

        try:
            with connection:
                with connection.transaction():
                    with connection.cursor() as cursor:
                        cursor.execute("set transaction read only")
                        self._assert_runtime_role(cursor)
                        self._assert_schema(cursor)
                        self._set_context(cursor, normalized)
                        self._assert_active_identity_session(cursor, normalized)
                        cursor.execute(
                            """
                            select workspace_id, capabilities, display_name
                            from app_private.actor_workspace_directory()
                            limit %s
                            """,
                            (limit + 1,),
                        )
                        rows = cursor.fetchall()
                        truncated = len(rows) > limit
                        workspaces: list[ManagedWorkspaceAccess] = []
                        for row in rows[:limit]:
                            workspace_id = str(row.get("workspace_id", "")).strip()
                            if not workspace_id:
                                continue
                            display_name = str(row.get("display_name") or "").strip()
                            if not display_name or len(display_name) > 120:
                                display_name = _workspace_label_from_identifier(workspace_id)
                            workspaces.append(
                                ManagedWorkspaceAccess(
                                    workspace_id=workspace_id,
                                    label=display_name,
                                    access=self._workspace_access_label(
                                        row.get("capabilities") or ()
                                    ),
                                )
                            )
                        return workspaces, truncated
        except TrialStoreError:
            raise
        except Exception as exc:
            raise TrialNotReadyError(("database_or_schema_ready",)) from exc

    def _self_serve_budget_transaction(
        self, principal: TrialPrincipal, *, conflict_at: datetime | None = None
    ) -> datetime | None:
        """Commit admission independently of the later workspace transaction.

        Five admitted attempts (including exact replays and failed claims) per
        verified actor in a rolling database-clock 24h window. Missing migration,
        revoked session, timeout or uncertain commit fails closed; never refund or
        automatically retry a possibly committed admission. No process-local fallback.
        """
        try:
            with self._connect() as connection:
                with connection.transaction():
                    with connection.cursor() as cursor:
                        cursor.execute("set transaction isolation level read committed")
                        cursor.execute("set local statement_timeout = '5s'")
                        cursor.execute("set local lock_timeout = '3s'")
                        self._assert_runtime_role(cursor)
                        self._assert_schema(cursor)
                        self._set_context(cursor, principal)
                        self._assert_active_identity_session(cursor, principal)
                        if conflict_at is None:
                            cursor.execute(
                                "select app_private.reserve_self_serve_attempt() as admitted_at"
                            )
                            row = cursor.fetchone() or {}
                            if "admitted_at" not in row:
                                raise TrialNotReadyError(("self_serve_budget_ready",))
                            admitted_at = row["admitted_at"]
                            if admitted_at is not None and (
                                not isinstance(admitted_at, datetime)
                                or admitted_at.tzinfo is None
                            ):
                                raise TrialNotReadyError(("self_serve_budget_ready",))
                        else:
                            cursor.execute(
                                "select app_private.mark_self_serve_claim_conflict(%s::timestamptz) as recorded",
                                (conflict_at,),
                            )
                            if (cursor.fetchone() or {}).get("recorded") is not True:
                                raise TrialNotReadyError(("self_serve_budget_ready",))
                            admitted_at = conflict_at
            # Only return after BOTH context managers have committed successfully.
            return admitted_at
        except TrialStoreError:
            raise
        except Exception:
            # Driver exceptions can contain DSNs, actor ids or SQL parameters.
            raise TrialNotReadyError(("self_serve_budget_ready",)) from None

    def create_self_serve_workspace(
        self,
        *,
        actor_id: str,
        claim_code: str,
        business_name: str,
        product: str = "commerce",
        session_id: str = "",
        identity_provider: str = "supabase",
    ) -> SelfServeWorkspaceResult:
        """Provision one RLS-isolated self-serve tenant for a verified user.

        Mirrors the hosted managed-persistence proof semantics: the identity is
        bound to the transaction through the GUC context, the claim is locked
        for the transaction, the ``company.workspace.created`` event carries a
        command fingerprint, replays are exact-idempotent per claim, and every
        write is read back before the directory entry is returned.
        """

        claim = validate_self_serve_claim_code(claim_code)
        label = validate_self_serve_business_name(business_name)
        normalized_product = validate_self_serve_product(product)
        owner_capabilities = self_serve_owner_capabilities(normalized_product)
        workspace_id, command_id, fingerprint = _self_serve_command_identity(
            claim, label, normalized_product
        )
        principal = TrialPrincipal(
            workspace_id=workspace_id,
            actor_id=actor_id,
            actor_kind=HUMAN_ACTOR_KIND,
            authenticated=True,
            session_id=session_id,
            identity_provider=identity_provider,
        ).normalized()
        if not _principal_auth_ready(principal):
            raise TrialNotReadyError(("auth_ready",))
        if not self.write_enabled:
            raise TrialNotReadyError(("write_enabled",))
        # The activation target metadata is required, never fabricated: without
        # the approved project reference and release commit the endpoint stays
        # closed rather than minting a tenant with an unaccountable identity.
        project_ref = str(os.getenv("SUPERMEGA_SUPABASE_PROJECT_REF") or "").strip().lower()
        release_commit = (
            str(
                os.getenv("SUPERMEGA_RELEASE_COMMIT")
                or os.getenv("VERCEL_GIT_COMMIT_SHA")
                or ""
            )
            .strip()
            .lower()
        )
        if not _SELF_SERVE_PROJECT_REF_PATTERN.fullmatch(project_ref) or not (
            _SELF_SERVE_RELEASE_COMMIT_PATTERN.fullmatch(release_commit)
        ):
            raise TrialNotReadyError(("self_serve_target_ready",))
        admitted_at = self._self_serve_budget_transaction(principal)
        if admitted_at is None:
            raise TrialRateLimited(limit=SELF_SERVE_RATE_LIMIT_MAX)
        try:
            connection = self._connect()
        except TrialStoreError:
            raise
        except Exception as exc:
            raise TrialNotReadyError(("database_ready",)) from exc
        try:
            with connection:
                with connection.transaction():
                    with connection.cursor() as cursor:
                        cursor.execute("set transaction isolation level serializable")
                        try:
                            self._assert_runtime_role(cursor)
                            self._assert_schema(cursor)
                            self._set_context(cursor, principal)
                            self._assert_active_identity_session(cursor, principal)
                            self._assert_audit(cursor)
                        except TrialStoreError:
                            raise
                        except Exception as exc:
                            raise TrialNotReadyError(("database_or_schema_ready",)) from exc
                        self._lock(cursor, f"self-serve-claim:{claim}")
                        cursor.execute(
                            """
                            select actor_id, actor_kind, status, capabilities
                            from app_private.workspace_memberships
                            where workspace_id = %s
                            """,
                            (workspace_id,),
                        )
                        membership_rows = cursor.fetchall()
                        if any(
                            str(row.get("actor_id", "")) != principal.actor_id
                            for row in membership_rows
                        ):
                            raise TrialClaimConflict(claim)
                        cursor.execute(
                            """
                            select command_fingerprint, actor_id, result_json, created_at
                            from app_private.workspace_events
                            where workspace_id = %s and command_id = %s
                            """,
                            (workspace_id, command_id),
                        )
                        event_row = cursor.fetchone()
                        if event_row is not None:
                            if (
                                str(event_row.get("command_fingerprint", "")) != fingerprint
                                or str(event_row.get("actor_id", "")) != principal.actor_id
                            ):
                                raise TrialIdempotencyConflict(command_id)
                            owner_membership_active = any(
                                str(row.get("actor_id", "")) == principal.actor_id
                                and str(row.get("status", "")) == "active"
                                and frozenset(
                                    str(item) for item in (row.get("capabilities") or [])
                                ) == owner_capabilities
                                for row in membership_rows
                            )
                            if not owner_membership_active:
                                raise TrialInvalidTransition(
                                    "Self-serve claim history exists without an active owner membership."
                                )
                            result_json = event_row.get("result_json") or {}
                            if isinstance(result_json, str):
                                result_json = json.loads(result_json)
                            stored = (
                                result_json.get("self_serve_workspace")
                                if isinstance(result_json, Mapping)
                                else None
                            )
                            if not isinstance(stored, Mapping):
                                raise TrialInvalidTransition(
                                    "Self-serve claim history is not replayable."
                                )
                            return SelfServeWorkspaceResult(
                                workspace_id=str(stored.get("workspace_id", workspace_id)),
                                label=str(stored.get("label", label)),
                                access="owner",
                                claim_code=claim,
                                owner_actor_id=principal.actor_id,
                                event_id=str(stored.get("event_id", command_id)),
                                created_at=_iso_timestamp(event_row.get("created_at")),
                                idempotent_replay=True,
                            )
                        if membership_rows:
                            raise TrialInvalidTransition(
                                "Self-serve workspace identity conflicts with durable history."
                            )
                        cursor.execute(
                            """
                            select owner_actor_id, status
                            from app_private.workspace_access_controls
                            where workspace_id = %s
                            """,
                            (workspace_id,),
                        )
                        existing_access = cursor.fetchone()
                        if existing_access is not None:
                            # The membership guard above cannot see a DIFFERENT
                            # actor's owner row: the workspace_memberships_self_read
                            # RLS policy only exposes the caller's own membership
                            # (actor_id = app.actor_id), so a second user claiming an
                            # already-owned claim reads zero membership rows and the
                            # TrialClaimConflict guard never fires. The access-control
                            # read policy IS workspace-scoped (visible to any session
                            # bound to this workspace GUC), so it is the authoritative
                            # place to detect the collision. A self-serve claim is 1:1
                            # with a workspace; an active row owned by a different actor
                            # is a claim-code conflict and must surface as
                            # claim_code_conflict (409 "already in use"), not the
                            # generic durable-history transition error.
                            if (
                                str(existing_access.get("owner_actor_id", ""))
                                != principal.actor_id
                            ):
                                raise TrialClaimConflict(claim)
                            raise TrialInvalidTransition(
                                "Self-serve workspace identity conflicts with durable history."
                            )
                        try:
                            cursor.execute(
                                """
                                insert into app_private.workspace_access_controls (
                                  workspace_id, activation_id, authorization_id,
                                  authorization_contract, plan_digest, owner_actor_id,
                                  project_ref, release_commit, status
                                ) values (%s, %s, %s, %s, %s, %s, %s, %s, 'active')
                                """,
                                (
                                    workspace_id,
                                    command_id,
                                    # authorization_id is a uuid column: derive a deterministic uuid5
                                    # from the workspace + claim so replay reuses the exact value (the
                                    # UNIQUE constraint makes idempotency safe) and distinct from the
                                    # activation_id's 'self-serve-create:' name. A raw
                                    # 'self-serve-claim-<claim>' string is not valid uuid syntax (22P02)
                                    # and would abort every self-serve creation on a real database.
                                    str(uuid5(UUID(workspace_id), f"self-serve-authorization:{claim}")),
                                    SELF_SERVE_ACTIVATION_AUTHORIZATION_CONTRACT,
                                    fingerprint,
                                    principal.actor_id,
                                    project_ref,
                                    release_commit,
                                ),
                            )
                        except TrialStoreError:
                            raise
                        except Exception as exc:
                            # Under true concurrency the SERIALIZABLE snapshot is taken
                            # before pg_advisory_xact_lock is acquired, so the losing
                            # claimant's guards above can miss the winner's committed
                            # rows entirely and fall through to this insert. The unique
                            # constraint on workspace_id is the authoritative arbiter:
                            # a duplicate-key rejection here IS the claim collision and
                            # must surface as claim_code_conflict, not the generic
                            # not-ready error. `from None` so no driver detail (which
                            # can embed key values) ever reaches a caller.
                            if getattr(exc, "sqlstate", None) == "23505":
                                raise TrialClaimConflict(claim) from None
                            raise
                        cursor.execute(
                            """
                            insert into app_private.workspace_memberships (
                              workspace_id, actor_id, actor_kind, status, capabilities
                            ) values (%s, %s, 'human', 'active', %s)
                            """,
                            (
                                workspace_id,
                                principal.actor_id,
                                sorted(owner_capabilities),
                            ),
                        )
                        result = {
                            "self_serve_workspace": {
                                "workspace_id": workspace_id,
                                "label": label,
                                "access": "owner",
                                "claim_code": claim,
                                "owner_actor_id": principal.actor_id,
                                "event_id": command_id,
                                "product": normalized_product,
                            }
                        }
                        payload = {
                            "claimLinkage": {
                                "claimCode": claim,
                                "workspaceId": workspace_id,
                                "linkedBy": principal.actor_id,
                            },
                            "businessName": label,
                            "products": [SELF_SERVE_PRODUCT_ACTIVATION_IDS[normalized_product]],
                            "ownerCapabilities": sorted(owner_capabilities),
                        }
                        cursor.execute(
                            """
                            insert into app_private.workspace_events (
                              event_id, workspace_id, command_id, command_fingerprint,
                              surface, event_type, actor_id, actor_kind, expected_version,
                              resulting_version, payload_json, result_json
                            ) values (
                              %s, %s, %s, %s, 'company', %s,
                              %s, 'human', null, null, %s::jsonb, %s::jsonb
                            )
                            returning created_at
                            """,
                            (
                                command_id,
                                workspace_id,
                                command_id,
                                fingerprint,
                                SELF_SERVE_WORKSPACE_EVENT_TYPE,
                                principal.actor_id,
                                json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
                                json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
                            ),
                        )
                        inserted = cursor.fetchone() or {}
                        created_at = _iso_timestamp(inserted.get("created_at"))
                        if not created_at:
                            raise TrialStoreError(
                                "Self-serve workspace event timestamp was not returned durably."
                            )
                        cursor.execute(
                            """
                            select access_control.status as access_status,
                                   membership.status as membership_status,
                                   membership.capabilities as capabilities,
                                   events.command_fingerprint as command_fingerprint
                            from app_private.workspace_access_controls access_control
                            join app_private.workspace_memberships membership
                              on membership.workspace_id = access_control.workspace_id
                            join app_private.workspace_events events
                              on events.workspace_id = access_control.workspace_id
                             and events.command_id = %s
                            where access_control.workspace_id = %s
                              and membership.actor_id = %s
                            """,
                            (command_id, workspace_id, principal.actor_id),
                        )
                        read_back = cursor.fetchone() or {}
                        if (
                            str(read_back.get("access_status", "")) != "active"
                            or str(read_back.get("membership_status", "")) != "active"
                            or frozenset(
                                str(item) for item in (read_back.get("capabilities") or [])
                            )
                            != owner_capabilities
                            or str(read_back.get("command_fingerprint", "")) != fingerprint
                        ):
                            raise TrialStoreError(
                                "Self-serve workspace writes could not be read back durably."
                            )
                        return SelfServeWorkspaceResult(
                            workspace_id=workspace_id,
                            label=label,
                            access="owner",
                            claim_code=claim,
                            owner_actor_id=principal.actor_id,
                            event_id=command_id,
                            created_at=created_at,
                        )
        except TrialClaimConflict:
            # The failed workspace transaction has rolled back by this point.
            # Its durable admission survives, and the diagnostic mark is bound
            # to that exact admission rather than a user-supplied identifier.
            self._self_serve_budget_transaction(principal, conflict_at=admitted_at)
            raise
        except TrialStoreError:
            raise
        except Exception as exc:
            raise TrialNotReadyError(("database_or_schema_ready",)) from exc

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
                        self._assert_active_identity_session(cursor, normalized)
                        capabilities = self._load_membership(cursor, normalized)
                        product_entitlements = self._product_entitlements(
                            cursor, normalized.workspace_id
                        )
                        capabilities = capabilities_for_product_entitlements(
                            capabilities, product_entitlements
                        )
                        if write:
                            self._assert_audit(cursor)
                    except TrialStoreError:
                        raise
                    except Exception as exc:
                        raise TrialNotReadyError(("database_or_schema_ready",)) from exc
                    if capability and capability not in capabilities:
                        raise TrialPermissionDenied(capability)
                    yield cursor, capabilities

    @staticmethod
    def _product_entitlements(cursor: Any, workspace_id: str) -> tuple[str, ...]:
        """Read the immutable activation event; malformed or absent proof grants nothing."""

        cursor.execute(
            """
            select payload_json
            from app_private.workspace_events
            where workspace_id = %s
              and surface = 'company'
              and event_type in ('company.workspace.activated', 'company.workspace.created')
            order by case when event_type = 'company.workspace.activated' then 0 else 1 end,
                     created_at desc
            limit 1
            """,
            (workspace_id,),
        )
        row = cursor.fetchone()
        if isinstance(row, Mapping):
            payload = row.get("payload_json")
        elif isinstance(row, Sequence) and not isinstance(row, (str, bytes)) and row:
            payload = row[0]
        else:
            payload = None
        products = activation_product_entitlements(payload)
        if products:
            return products
        # Review-only members cannot read company events. Each optional private
        # proof supplies only its product, never event contents or capabilities.
        # Identifiers below are fixed code constants, never caller input.
        proofs = (
            ("website", "website_review_entitled", "c6c8000c5abf562fc347e432562a14e2142f154eadd02802883b7fece05422b3"),
            ("ecommerce", "ecommerce_review_entitled", "517968351e00b192674e9de6762534afd15d65e74fa06778720514818e86ecca"),
        )
        entitled_products = []
        for product, function, expected_digest in proofs:
            cursor.execute("""select p.prosrc as source, p.prosecdef as definer,
                p.provolatile as volatility, p.proconfig as config, l.lanname as language,
                p.prorettype='boolean'::regtype as boolean_result,
                (r.rolsuper or r.rolbypassrls) and r.rolname <> current_user as trusted_owner,
                not has_function_privilege('anon',p.oid,'EXECUTE')
                  and not has_function_privilege('authenticated',p.oid,'EXECUTE')
                  and not has_function_privilege('service_role',p.oid,'EXECUTE') as private_execute
                from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                join pg_roles r on r.oid=p.proowner join pg_language l on l.oid=p.prolang
                where n.nspname='app_private' and p.proname=%s and p.pronargs=0""", (function,))
            proof = cursor.fetchone()
            if not isinstance(proof, Mapping) or not proof.get("source"):
                continue
            if (proof.get("definer") is not True or proof.get("volatility") != "s"
                    or proof.get("language") != "sql" or proof.get("boolean_result") is not True
                    or proof.get("trusted_owner") is not True or proof.get("private_execute") is not True
                    or tuple(proof.get("config") or ()) != ("search_path=pg_catalog, app_private",)
                    or sha256(_normalize_sql_source(proof["source"]).encode()).hexdigest()
                    != expected_digest):
                raise TrialNotReadyError((f"{product}_review_entitlement_proof",))
            cursor.execute(f"select app_private.{function}() as entitled")
            if (cursor.fetchone() or {}).get("entitled") is True:
                entitled_products.append(product)
        return tuple(entitled_products)

    @staticmethod
    def _premium_unlocked(cursor: Any, workspace_id: str) -> bool:
        """Billing rail v12 (BILLING-RAIL-DESIGN.md 4.3): derive premiumUnlocked
        from the billing_entitlements projection, one query, fail closed.

        The privilege probe runs first because the v12 billing tables are
        deny-by-default and grant the runtime role nothing: without it the
        entitlement read would raise insufficient_privilege and abort the
        readiness transaction. Until a founder-approved migration adds the
        narrow entitlement read, the probe is false and the flag stays False.
        """

        cursor.execute(
            """
            select case
              when to_regclass('app_private.billing_entitlements') is null then false
              else has_table_privilege(
                current_user, 'app_private.billing_entitlements', 'SELECT'
              )
            end as entitlement_readable
            """
        )
        if not bool((cursor.fetchone() or {}).get("entitlement_readable")):
            return False
        cursor.execute(
            """
            select exists (
              select 1
              from app_private.billing_entitlements entitlement
              where entitlement.workspace_id = %s
                and entitlement.tier = 'premium'
                and entitlement.status = 'granted'
            ) as premium_unlocked
            """,
            (workspace_id,),
        )
        return bool((cursor.fetchone() or {}).get("premium_unlocked"))

    def readiness(self, principal: TrialPrincipal | None) -> TrialReadiness:
        auth_ready = _principal_auth_ready(principal)
        database_ready = False
        role_ready = False
        schema_ready = False
        membership_ready = False
        audit_ready = False
        premium_unlocked = False
        product_entitlements: tuple[str, ...] | None = None
        capabilities: frozenset[str] = frozenset()
        if not self.database_url:
            _log_readiness_failure("configuration", "missing_configuration")
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
        stage = "connect"
        try:
            with self._connect() as connection:
                stage = "transaction"
                with connection.transaction():
                    stage = "probe"
                    with connection.cursor() as cursor:
                        cursor.execute("select 1 as ready")
                        database_ready = bool((cursor.fetchone() or {}).get("ready"))
                        stage = "role"
                        self._assert_runtime_role(cursor)
                        role_ready = True
                        stage = "schema"
                        self._assert_schema(cursor)
                        schema_ready = True
                        stage = "audit"
                        self._assert_audit(cursor)
                        audit_ready = True
                        if auth_ready and principal is not None:
                            stage = "context"
                            normalized = principal.normalized()
                            self._set_context(cursor, normalized)
                            stage = "session"
                            self._assert_active_identity_session(cursor, normalized)
                            stage = "membership"
                            capabilities = self._load_membership(cursor, normalized)
                            membership_ready = True
                            stage = "entitlements"
                            product_entitlements = self._product_entitlements(
                                cursor, normalized.workspace_id
                            )
                            capabilities = capabilities_for_product_entitlements(
                                capabilities, product_entitlements
                            )
                            if TRIAL_SCHEMA_VERSION >= 12:
                                stage = "premium"
                                premium_unlocked = self._premium_unlocked(
                                    cursor, normalized.workspace_id
                                )
                        stage = "cursor_close"
                    stage = "transaction_close"
                stage = "connection_close"
        except TrialNotReadyError as exc:
            _log_readiness_failure(
                stage,
                "driver_unavailable" if "postgres_driver_ready" in exc.reasons
                else "contract_not_ready",
            )
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
            elif "auth_session_active" in exc.reasons:
                auth_ready = False
                membership_ready = False
                capabilities = frozenset()
        except Exception as exc:
            _log_readiness_failure(stage, _readiness_exception_category(exc))
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
            premium_unlocked=premium_unlocked,
            product_entitlements=product_entitlements,
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

    @staticmethod
    def _require_active_workspace_owner(cursor: Any, principal: TrialPrincipal) -> None:
        cursor.execute(
            """
            select owner_actor_id
            from app_private.workspace_access_controls
            where workspace_id = %s and status = 'active'
            for share
            """,
            (principal.workspace_id,),
        )
        row = cursor.fetchone()
        if not isinstance(row, Mapping) or str(row.get("owner_actor_id") or "") != principal.actor_id:
            raise TrialPermissionDenied("shop.owner")

    def _load_shop_correction_authorization_replay(
        self,
        cursor: Any,
        *,
        principal: TrialPrincipal,
        command_id: str,
        authorization_request_id: str,
        fingerprint: str,
        capability: str,
        command_digest: str,
    ) -> ShopCorrectionAuthorizationReceipt | None:
        cursor.execute(
            """
            select event_type, actor_id, actor_kind, command_fingerprint,
                   payload_json, result_json
            from app_private.workspace_events
            where workspace_id = %s and command_id = %s
            """,
            (principal.workspace_id, command_id),
        )
        row = cursor.fetchone()
        if not row:
            return None
        if (
            str(row.get("event_type") or "")
            != SHOP_CORRECTION_AUTHORIZATION_EVENT_TYPE
            or str(row.get("actor_id") or "") != principal.actor_id
            or str(row.get("actor_kind") or "") != principal.actor_kind
            or str(row.get("command_fingerprint") or "") != fingerprint
        ):
            raise TrialIdempotencyConflict(command_id)
        payload = row.get("payload_json") or {}
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except json.JSONDecodeError as exc:
                raise TrialStoreError(
                    "Shop correction authorization evidence is invalid."
                ) from exc
        if (
            not isinstance(payload, Mapping)
            or payload.get("authorizationRequestId") != authorization_request_id
            or payload.get("capability") != capability
            or payload.get("commandDigest") != command_digest
        ):
            raise TrialIdempotencyConflict(command_id)
        result = row.get("result_json") or {}
        if isinstance(result, str):
            try:
                result = json.loads(result)
            except json.JSONDecodeError as exc:
                raise TrialStoreError(
                    "Shop correction authorization evidence is invalid."
                ) from exc
        signer = self._shop_correction_signer
        if signer is None:
            raise TrialNotReadyError(("shop_correction_signing_ready",))
        return _shop_correction_receipt_from_mapping(
            result,
            signer=signer,
            workspace_id=principal.workspace_id,
            actor_id=principal.actor_id,
            finalization_request_id=authorization_request_id,
            capability=capability,
            command_digest=command_digest,
            idempotent_replay=True,
        )

    def issue_shop_correction_authorization(
        self,
        principal: TrialPrincipal,
        *,
        authorization_request_id: str | UUID,
        capability: str,
        command_digest: str,
        request_fingerprint: str,
        confirmation: str,
    ) -> ShopCorrectionAuthorizationReceipt:
        signer = self._shop_correction_signer
        if signer is None:
            raise TrialNotReadyError(("shop_correction_signing_ready",))
        (
            request_id,
            capability_value,
            command_digest_value,
            confirmation_value,
            command_facts,
        ) = _shop_correction_authorization_request(
            authorization_request_id=authorization_request_id,
            capability=capability,
            command_digest=command_digest,
            request_fingerprint=request_fingerprint,
            confirmation=confirmation,
        )
        normalized = _require_shop_correction_principal(principal)
        command_id, fingerprint = _shop_correction_finalization_identity(
            workspace_id=normalized.workspace_id,
            capability=capability_value,
            semantic_target_id=str(
                command_facts[
                    "saleId"
                    if capability_value == "shop.sale.reverse"
                    else "reversalId"
                ]
            ),
        )
        with self._guarded_cursor(
            normalized,
            write=True,
            capability="commerce.write",
        ) as (cursor, _capabilities):
            if "commerce" not in self._product_entitlements(
                cursor,
                normalized.workspace_id,
            ):
                raise TrialPermissionDenied("product.commerce")
            self._require_active_workspace_owner(cursor, normalized)
            self._lock(
                cursor,
                f"{normalized.workspace_id}:shop-correction-finalization:{command_id}",
            )
            self._lock(
                cursor,
                f"{normalized.workspace_id}:shop-correction-request:{request_id}",
            )
            cursor.execute(
                """
                select command_id
                from app_private.workspace_events
                where workspace_id = %s
                  and event_type = %s
                  and payload_json ->> 'authorizationRequestId' = %s
                """,
                (
                    normalized.workspace_id,
                    SHOP_CORRECTION_AUTHORIZATION_EVENT_TYPE,
                    request_id,
                ),
            )
            request_claim = cursor.fetchone()
            if request_claim and str(request_claim.get("command_id") or "") != command_id:
                raise TrialIdempotencyConflict(request_id)
            cursor.execute(
                """
                select floor(extract(epoch from clock_timestamp()) * 1000)::bigint
                       as issued_at_millis
                """
            )
            clock_row = cursor.fetchone() or {}
            try:
                issued_at_millis = int(clock_row.get("issued_at_millis"))
            except (TypeError, ValueError, AttributeError) as exc:
                raise TrialNotReadyError(("database_or_schema_ready",)) from exc
            if issued_at_millis <= 0:
                raise TrialNotReadyError(("database_or_schema_ready",))
            replay = self._load_shop_correction_authorization_replay(
                cursor,
                principal=normalized,
                command_id=command_id,
                authorization_request_id=request_id,
                fingerprint=fingerprint,
                capability=capability_value,
                command_digest=command_digest_value,
            )
            if replay is not None:
                if issued_at_millis > replay.expires_at_millis:
                    raise TrialAuthorizationExpired(request_id)
                return replay
            receipt = _new_shop_correction_authorization_receipt(
                signer=signer,
                workspace_id=normalized.workspace_id,
                actor_id=normalized.actor_id,
                finalization_request_id=request_id,
                capability=capability_value,
                command_digest=command_digest_value,
                finalized_at_millis=issued_at_millis,
            )
            payload: JsonObject = {
                "contract": SHOP_CORRECTION_AUTHORIZATION_CONTRACT,
                "authorizationRequestId": request_id,
                "capability": capability_value,
                "commandDigest": command_digest_value,
                "confirmation": confirmation_value,
                "command": command_facts,
            }
            cursor.execute(
                """
                insert into app_private.workspace_events
                  (event_id, workspace_id, command_id, command_fingerprint, surface,
                   event_type, actor_id, actor_kind, expected_version, resulting_version,
                   payload_json, result_json)
                values (%s, %s, %s, %s, 'commerce', %s, %s, %s, null, null,
                        %s::jsonb, %s::jsonb)
                """,
                (
                    receipt.receipt_id,
                    normalized.workspace_id,
                    command_id,
                    fingerprint,
                    SHOP_CORRECTION_AUTHORIZATION_EVENT_TYPE,
                    normalized.actor_id,
                    normalized.actor_kind,
                    json.dumps(payload, ensure_ascii=False),
                    json.dumps(receipt.to_dict(), ensure_ascii=False),
                ),
            )
            readback = self._load_shop_correction_authorization_replay(
                cursor,
                principal=normalized,
                command_id=command_id,
                authorization_request_id=request_id,
                fingerprint=fingerprint,
                capability=capability_value,
                command_digest=command_digest_value,
            )
            if readback is None or readback.to_dict() != receipt.to_dict():
                raise TrialStoreError(
                    "Shop correction authorization evidence could not be read back."
                )
            return receipt

    def activate_shop_correction_lineage(
        self,
        principal: TrialPrincipal,
        *,
        activation_request_id: str | UUID,
        lineage_id: str | UUID,
        expected_previous_lineage_id: str | UUID | None,
        expected_previous_lineage_epoch: int | None,
        local_consumption_ordinal: int,
        local_consumption_digest: str | None,
    ) -> ShopCorrectionLineageRecord:
        normalized = _require_shop_correction_principal(principal)
        request_id = _shop_correction_uuid(
            activation_request_id, field="activation_request_id"
        )
        lineage = _shop_correction_uuid(lineage_id, field="lineage_id")
        previous_lineage = (
            None
            if expected_previous_lineage_id is None
            else _shop_correction_uuid(
                expected_previous_lineage_id,
                field="expected_previous_lineage_id",
            )
        )
        if expected_previous_lineage_epoch is not None and (
            type(expected_previous_lineage_epoch) is not int
            or expected_previous_lineage_epoch < 1
        ):
            raise TrialValidationError(
                "expected_previous_lineage_epoch must be a positive integer."
            )
        _, _, ordinal, digest = _shop_correction_lineage_input(
            lineage_id=lineage,
            lineage_epoch=1,
            consumption_ordinal=local_consumption_ordinal,
            consumption_digest=local_consumption_digest,
        )
        activation_fingerprint = _canonical_fingerprint(
            "shop_correction_lineage_activation",
            {
                "activation_request_id": request_id,
                "lineage_id": lineage,
                "expected_previous_lineage_id": previous_lineage,
                "expected_previous_lineage_epoch": expected_previous_lineage_epoch,
                "local_consumption_ordinal": ordinal,
                "local_consumption_digest": digest,
            },
        )
        command_id = str(uuid5(NAMESPACE_URL, f"{SHOP_CORRECTION_LINEAGE_CONTRACT}\n{normalized.workspace_id}\n{request_id}"))
        select_fields = """
            workspace_id, activation_request_id, lineage_id, lineage_epoch,
            previous_lineage_id, previous_lineage_epoch, actor_id,
            current_consumption_ordinal, current_consumption_digest,
            floor(extract(epoch from activated_at) * 1000)::bigint as activated_at_millis
        """
        with self._guarded_cursor(
            normalized, write=True, capability="commerce.write"
        ) as (cursor, _capabilities):
            if "commerce" not in self._product_entitlements(cursor, normalized.workspace_id):
                raise TrialPermissionDenied("product.commerce")
            self._require_active_workspace_owner(cursor, normalized)
            self._lock(cursor, f"{normalized.workspace_id}:shop-correction-lineage")
            self._lock(
                cursor,
                f"{normalized.workspace_id}:shop-correction-lineage-request:{request_id}",
            )
            cursor.execute(
                f"""select {select_fields}, activation_fingerprint
                    from app_private.shop_correction_lineages
                    where workspace_id = %s and activation_request_id = %s""",
                (normalized.workspace_id, request_id),
            )
            replay_row = cursor.fetchone()
            cursor.execute(
                f"""select {select_fields}
                    from app_private.shop_correction_lineages
                    where workspace_id = %s and superseded_at is null
                    for update""",
                (normalized.workspace_id,),
            )
            active_row = cursor.fetchone()
            if replay_row is not None:
                if str(replay_row.get("activation_fingerprint") or "") != activation_fingerprint:
                    raise TrialIdempotencyConflict(request_id)
                replay = _shop_correction_lineage_from_mapping(
                    replay_row,
                    workspace_id=normalized.workspace_id,
                    idempotent_replay=True,
                )
                if active_row is not None and str(active_row.get("lineage_id")) == replay.lineage_id:
                    return _shop_correction_lineage_from_mapping(
                        active_row,
                        workspace_id=normalized.workspace_id,
                        idempotent_replay=True,
                    )
                return replay
            if active_row is None:
                if (
                    previous_lineage is not None
                    or expected_previous_lineage_epoch is not None
                    or ordinal != 0
                    or digest is not None
                ):
                    raise TrialReconciliationRequired(state="initial_watermark_not_empty")
                epoch = 1
            else:
                active = _shop_correction_lineage_from_mapping(
                    active_row, workspace_id=normalized.workspace_id
                )
                if (
                    previous_lineage != active.lineage_id
                    or expected_previous_lineage_epoch != active.lineage_epoch
                ):
                    raise TrialReconciliationRequired(state="stale_lineage")
                if ordinal != active.consumption_ordinal or digest != active.consumption_digest:
                    raise TrialReconciliationRequired(state="watermark_mismatch")
                if lineage == active.lineage_id:
                    raise TrialValidationError("A restored lineage must use a fresh lineage_id.")
                epoch = active.lineage_epoch + 1
                cursor.execute(
                    """update app_private.shop_correction_lineages
                       set superseded_at = transaction_timestamp()
                       where workspace_id = %s and lineage_id = %s
                         and superseded_at is null
                       returning lineage_id""",
                    (normalized.workspace_id, active.lineage_id),
                )
                if str((cursor.fetchone() or {}).get("lineage_id") or "") != active.lineage_id:
                    raise TrialReconciliationRequired(state="stale_lineage")
            cursor.execute(
                """insert into app_private.shop_correction_lineages
                  (workspace_id, lineage_id, lineage_epoch, activation_request_id,
                   activation_fingerprint, actor_id, actor_kind,
                   previous_lineage_id, previous_lineage_epoch,
                   initial_consumption_ordinal, initial_consumption_digest,
                   current_consumption_ordinal, current_consumption_digest)
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    normalized.workspace_id, lineage, epoch, request_id,
                    activation_fingerprint, normalized.actor_id, normalized.actor_kind,
                    previous_lineage, expected_previous_lineage_epoch,
                    ordinal, digest, ordinal, digest,
                ),
            )
            cursor.execute(
                f"""select {select_fields}
                    from app_private.shop_correction_lineages
                    where workspace_id = %s and activation_request_id = %s""",
                (normalized.workspace_id, request_id),
            )
            record = _shop_correction_lineage_from_mapping(
                cursor.fetchone(), workspace_id=normalized.workspace_id
            )
            payload = {
                "contract": SHOP_CORRECTION_LINEAGE_CONTRACT,
                "activationRequestId": request_id,
                "lineageId": lineage,
                "expectedPreviousLineageId": previous_lineage,
                "expectedPreviousLineageEpoch": expected_previous_lineage_epoch,
                "localConsumptionOrdinal": ordinal,
                "localConsumptionDigest": digest,
            }
            cursor.execute(
                """insert into app_private.workspace_events
                  (event_id, workspace_id, command_id, command_fingerprint, surface,
                   event_type, actor_id, actor_kind, expected_version, resulting_version,
                   payload_json, result_json)
                values (%s, %s, %s, %s, 'commerce', %s, %s, %s, null, null,
                        %s::jsonb, %s::jsonb)""",
                (
                    str(uuid4()), normalized.workspace_id, command_id,
                    activation_fingerprint, SHOP_CORRECTION_LINEAGE_EVENT_TYPE,
                    normalized.actor_id, normalized.actor_kind,
                    json.dumps(payload, ensure_ascii=False),
                    json.dumps(record.to_dict(), ensure_ascii=False),
                ),
            )
            return record

    def consume_shop_correction_authorization(
        self,
        principal: TrialPrincipal,
        *,
        consumption_request_id: str | UUID,
        authorization_receipt_id: str | UUID,
        authorization_receipt_digest: str,
        lineage_id: str | UUID,
        lineage_epoch: int,
        capability: str,
        semantic_target_id: str,
        command_digest: str,
        allow_new_decision: bool,
    ) -> ShopCorrectionConsumptionProof:
        normalized = _require_shop_correction_principal(principal)
        if type(allow_new_decision) is not bool:
            raise TrialValidationError("allow_new_decision must be a boolean.")
        request_id = _shop_correction_uuid(
            consumption_request_id, field="consumption_request_id"
        )
        receipt_id = _shop_correction_uuid(
            authorization_receipt_id, field="authorization_receipt_id"
        )
        receipt_digest = _shop_correction_digest(
            authorization_receipt_digest, field="authorization_receipt_digest"
        )
        lineage, epoch, _, _ = _shop_correction_lineage_input(
            lineage_id=lineage_id,
            lineage_epoch=lineage_epoch,
            consumption_ordinal=0,
            consumption_digest=None,
        )
        digest = _shop_correction_digest(command_digest, field="command_digest")
        target = _bounded_shop_correction_text(
            semantic_target_id, field="Shop correction semantic_target_id", maximum=120
        )
        if capability not in SHOP_CORRECTION_AUTHORIZATION_CAPABILITIES:
            raise TrialValidationError("Shop correction capability is invalid.")
        signer = self._shop_correction_signer
        if signer is None:
            raise TrialNotReadyError(("shop_correction_signing_ready",))
        command_id, fingerprint = _shop_correction_consumption_identity(
            workspace_id=normalized.workspace_id,
            capability=capability,
            semantic_target_id=target,
        )
        consumption_fields = """
            workspace_id, consumption_id, consumption_request_id,
            authorization_receipt_id, authorization_receipt_digest, actor_id,
            capability, semantic_target_id, command_digest, lineage_id,
            lineage_epoch, consumption_ordinal, previous_consumption_digest,
            history_digest, consumed_at_millis, key_id, signature
        """
        with self._guarded_cursor(
            normalized, write=True, capability="commerce.write"
        ) as (cursor, _capabilities):
            if "commerce" not in self._product_entitlements(cursor, normalized.workspace_id):
                raise TrialPermissionDenied("product.commerce")
            self._require_active_workspace_owner(cursor, normalized)
            self._lock(cursor, f"{normalized.workspace_id}:shop-correction-lineage")
            self._lock(cursor, f"{normalized.workspace_id}:shop-correction-target:{command_id}")
            self._lock(cursor, f"{normalized.workspace_id}:shop-correction-request:{request_id}")
            cursor.execute(
                """select workspace_id, activation_request_id, lineage_id, lineage_epoch,
                          previous_lineage_id, previous_lineage_epoch, actor_id,
                          current_consumption_ordinal, current_consumption_digest,
                          floor(extract(epoch from activated_at) * 1000)::bigint as activated_at_millis
                   from app_private.shop_correction_lineages
                   where workspace_id = %s and superseded_at is null
                   for update""",
                (normalized.workspace_id,),
            )
            active_row = cursor.fetchone()
            if active_row is None:
                raise TrialNotReadyError(("shop_correction_lineage_ready",))
            active = _shop_correction_lineage_from_mapping(
                active_row, workspace_id=normalized.workspace_id
            )
            if active.lineage_id != lineage or active.lineage_epoch != epoch:
                raise TrialReconciliationRequired(state="stale_lineage")
            cursor.execute(
                f"""select {consumption_fields}
                    from app_private.shop_correction_consumptions
                    where workspace_id = %s and consumption_request_id = %s""",
                (normalized.workspace_id, request_id),
            )
            request_row = cursor.fetchone()
            cursor.execute(
                f"""select {consumption_fields}
                    from app_private.shop_correction_consumptions
                    where workspace_id = %s and command_id = %s""",
                (normalized.workspace_id, command_id),
            )
            existing_row = cursor.fetchone()
            if request_row is not None and (
                existing_row is None
                or str(request_row.get("consumption_id")) != str(existing_row.get("consumption_id"))
            ):
                raise TrialIdempotencyConflict(request_id)
            if existing_row is not None:
                existing = _shop_correction_consumption_from_mapping(
                    existing_row,
                    signer=signer,
                    workspace_id=normalized.workspace_id,
                    response_mode="reconstruct_existing",
                )
                existing = replace(
                    existing,
                    response_mode=(
                        "recover_same_request"
                        if existing.consumption_request_id == request_id
                        and existing.lineage_id == lineage
                        and existing.lineage_epoch == epoch
                        else "reconstruct_existing"
                    ),
                )
                if (
                    existing.authorization_receipt_id != receipt_id
                    or existing.authorization_receipt_digest != receipt_digest
                    or existing.actor_id != normalized.actor_id
                    or existing.capability != capability
                    or existing.semantic_target_id != target
                    or existing.command_digest != digest
                    or active.consumption_ordinal < existing.consumption_ordinal
                ):
                    raise TrialReconciliationRequired(state="committed_other_lineage")
                return existing
            cursor.execute(
                """select payload_json, result_json
                   from app_private.workspace_events
                   where workspace_id = %s
                     and event_type = %s
                     and result_json ->> 'receiptId' = %s
                   limit 1""",
                (normalized.workspace_id, SHOP_CORRECTION_AUTHORIZATION_EVENT_TYPE, receipt_id),
            )
            authorization_row = cursor.fetchone()
            if not isinstance(authorization_row, Mapping):
                raise TrialNotFound("Shop correction authorization was not found.")
            payload = authorization_row.get("payload_json") or {}
            result = authorization_row.get("result_json") or {}
            try:
                if isinstance(payload, str):
                    payload = json.loads(payload)
                if isinstance(result, str):
                    result = json.loads(result)
            except json.JSONDecodeError as exc:
                raise TrialStoreError(
                    "Shop correction authorization evidence is invalid."
                ) from exc
            if not isinstance(payload, Mapping) or not isinstance(result, Mapping):
                raise TrialStoreError("Shop correction authorization evidence is invalid.")
            payload_request_id = str(payload.get("authorizationRequestId") or "")
            if (
                payload.get("contract") != SHOP_CORRECTION_AUTHORIZATION_CONTRACT
                or payload.get("capability") != capability
                or payload.get("commandDigest") != digest
            ):
                raise TrialPermissionDenied("shop.correction.consume")
            receipt = _shop_correction_receipt_from_mapping(
                result,
                signer=signer,
                workspace_id=normalized.workspace_id,
                actor_id=normalized.actor_id,
                finalization_request_id=payload_request_id,
                capability=capability,
                command_digest=digest,
                idempotent_replay=True,
            )
            command = payload.get("command")
            expected_target = (
                command.get("saleId" if capability == "shop.sale.reverse" else "reversalId")
                if isinstance(command, Mapping)
                else None
            )
            if receipt.receipt_digest != receipt_digest or expected_target != target:
                raise TrialPermissionDenied("shop.correction.consume")
            if not allow_new_decision:
                raise TrialNotReadyError(("shop_correction_authorization_window_open",))
            cursor.execute(
                "select floor(extract(epoch from transaction_timestamp()) * 1000)::bigint as consumed_at_millis"
            )
            now_row = cursor.fetchone() or {}
            now_millis = int(now_row.get("consumed_at_millis") or 0)
            if now_millis <= 0:
                raise TrialStoreError("Shop correction server time is invalid.")
            if now_millis > receipt.expires_at_millis:
                raise TrialAuthorizationExpired(receipt.finalization_request_id)
            ordinal = active.consumption_ordinal + 1
            consumption_id = str(uuid5(UUID(receipt_id), request_id))
            history_digest = _shop_correction_consumption_digest(
                consumption_id=consumption_id,
                consumption_request_id=request_id,
                authorization_receipt_id=receipt_id,
                authorization_receipt_digest=receipt_digest,
                workspace_id=normalized.workspace_id,
                actor_id=normalized.actor_id,
                capability=capability,
                semantic_target_id=target,
                command_digest=digest,
                lineage_id=lineage,
                lineage_epoch=epoch,
                consumption_ordinal=ordinal,
                previous_consumption_digest=active.consumption_digest,
                consumed_at_millis=now_millis,
            )
            signature = signer.sign(receipt_digest=history_digest)
            expected_proof = ShopCorrectionConsumptionProof(
                consumption_id=consumption_id,
                consumption_request_id=request_id,
                authorization_receipt_id=receipt_id,
                authorization_receipt_digest=receipt_digest,
                workspace_id=normalized.workspace_id,
                actor_id=normalized.actor_id,
                capability=capability,
                semantic_target_id=target,
                command_digest=digest,
                lineage_id=lineage,
                lineage_epoch=epoch,
                consumption_ordinal=ordinal,
                previous_consumption_digest=active.consumption_digest,
                history_digest=history_digest,
                consumed_at_millis=now_millis,
                key_id=signer.key_id,
                signature=signature,
            )
            cursor.execute(
                """insert into app_private.shop_correction_consumptions
                  (workspace_id, consumption_id, consumption_request_id,
                   authorization_receipt_id, authorization_receipt_digest,
                   actor_id, actor_kind, capability, semantic_target_id,
                   command_id, command_digest, lineage_id, lineage_epoch,
                   consumption_ordinal, previous_consumption_digest, history_digest,
                   consumed_at_millis, key_id, signature)
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s, %s)""",
                (
                    normalized.workspace_id, consumption_id, request_id,
                    receipt_id, receipt_digest, normalized.actor_id,
                    normalized.actor_kind, capability, target, command_id, digest,
                    lineage, epoch, ordinal, active.consumption_digest,
                    history_digest, now_millis, signer.key_id, signature,
                ),
            )
            cursor.execute(
                """update app_private.shop_correction_lineages
                   set current_consumption_ordinal = %s,
                       current_consumption_digest = %s
                   where workspace_id = %s and lineage_id = %s
                     and lineage_epoch = %s and superseded_at is null
                     and current_consumption_ordinal = %s
                     and current_consumption_digest is not distinct from %s
                   returning current_consumption_ordinal, current_consumption_digest""",
                (
                    ordinal, history_digest, normalized.workspace_id, lineage,
                    epoch, active.consumption_ordinal, active.consumption_digest,
                ),
            )
            advanced = cursor.fetchone() or {}
            if (
                int(advanced.get("current_consumption_ordinal") or -1) != ordinal
                or str(advanced.get("current_consumption_digest") or "") != history_digest
            ):
                raise TrialReconciliationRequired(state="watermark_mismatch")
            cursor.execute(
                f"""select {consumption_fields}
                    from app_private.shop_correction_consumptions
                    where workspace_id = %s and consumption_id = %s""",
                (normalized.workspace_id, consumption_id),
            )
            proof = _shop_correction_consumption_from_mapping(
                cursor.fetchone(),
                signer=signer,
                workspace_id=normalized.workspace_id,
                response_mode="commit_new",
            )
            if proof.signed_dict() != expected_proof.signed_dict():
                raise TrialStoreError("Shop correction consumption evidence could not be read back.")
            audit_payload = {
                "contract": SHOP_CORRECTION_CONSUMPTION_CONTRACT,
                "consumptionRequestId": request_id,
                "authorizationReceiptId": receipt_id,
                "capability": capability,
                "semanticTargetId": target,
                "commandDigest": digest,
                "lineageId": lineage,
                "lineageEpoch": epoch,
            }
            cursor.execute(
                """insert into app_private.workspace_events
                  (event_id, workspace_id, command_id, command_fingerprint, surface,
                   event_type, actor_id, actor_kind, expected_version, resulting_version,
                   payload_json, result_json)
                values (%s, %s, %s, %s, 'commerce', %s, %s, %s, null, null,
                        %s::jsonb, %s::jsonb)""",
                (
                    consumption_id, normalized.workspace_id, command_id, fingerprint,
                    SHOP_CORRECTION_CONSUMPTION_EVENT_TYPE, normalized.actor_id,
                    normalized.actor_kind, json.dumps(audit_payload, ensure_ascii=False),
                    json.dumps(proof.to_dict(), ensure_ascii=False),
                ),
            )
            return proof

    def get_shop_correction_reconciliation_status(
        self,
        principal: TrialPrincipal,
        *,
        lineage_id: str | UUID,
        lineage_epoch: int,
        local_consumption_ordinal: int,
        local_consumption_digest: str | None,
    ) -> ShopCorrectionReconciliationStatus:
        normalized = _require_shop_correction_principal(principal)
        lineage, epoch, ordinal, digest = _shop_correction_lineage_input(
            lineage_id=lineage_id,
            lineage_epoch=lineage_epoch,
            consumption_ordinal=local_consumption_ordinal,
            consumption_digest=local_consumption_digest,
        )
        with self._guarded_cursor(
            normalized, write=False, capability="commerce.write"
        ) as (cursor, _capabilities):
            if "commerce" not in self._product_entitlements(cursor, normalized.workspace_id):
                raise TrialPermissionDenied("product.commerce")
            self._require_active_workspace_owner(cursor, normalized)
            cursor.execute(
                """select lineage_id, lineage_epoch,
                          current_consumption_ordinal, current_consumption_digest
                   from app_private.shop_correction_lineages
                   where workspace_id = %s and superseded_at is null""",
                (normalized.workspace_id,),
            )
            row = cursor.fetchone()
            if not isinstance(row, Mapping):
                raise TrialNotReadyError(("shop_correction_lineage_ready",))
            active_lineage = str(row.get("lineage_id") or "")
            active_epoch = int(row.get("lineage_epoch") or 0)
            server_ordinal = int(row.get("current_consumption_ordinal") or 0)
            server_digest = row.get("current_consumption_digest")
            if active_lineage != lineage or active_epoch != epoch:
                state = "stale_lineage"
            elif server_ordinal == ordinal and server_digest == digest:
                state = "current"
            else:
                state = "reconciliation_required"
            return ShopCorrectionReconciliationStatus(
                workspace_id=normalized.workspace_id,
                requested_lineage_id=lineage,
                requested_lineage_epoch=epoch,
                active_lineage_id=active_lineage,
                active_lineage_epoch=active_epoch,
                server_consumption_ordinal=server_ordinal,
                server_consumption_digest=(None if server_digest is None else str(server_digest)),
                local_consumption_ordinal=ordinal,
                local_consumption_digest=digest,
                state=state,
            )

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
        expected_related_versions: Mapping[str, int] | None = None,
        state_precondition: StatePrecondition | None = None,
    ) -> CommandResult:
        command_id_value = _normalize_uuid(command_id, field_name="command_id")
        surface_value = _normalize_surface(surface)
        event_type_value = _normalize_event_type(event_type)
        related_surface_values = _normalize_related_surfaces(surface_value, related_surfaces)
        related_version_values = _normalize_expected_related_versions(
            related_surface_values,
            expected_related_versions,
        )
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
        if related_version_values:
            command_contract["expected_related_versions"] = related_version_values
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
            for related_surface, expected_related_version in related_version_values.items():
                related_row = rows[related_surface]
                related_version = int(related_row["version"]) if related_row else 0
                if related_version != expected_related_version:
                    raise TrialVersionConflict(
                        expected_version=expected_related_version,
                        current_version=related_version,
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

    def record_product_acceptance(
        self,
        principal: TrialPrincipal,
        *,
        probe_id: str | UUID,
        owner_approval_id: str | UUID,
        product: str,
        release_commit: str,
    ) -> ProductAcceptanceRecord:
        probe_id_value = _normalize_uuid(probe_id, field_name="probe_id")
        owner_approval_id_value = _normalize_uuid(
            owner_approval_id,
            field_name="owner_approval_id",
        )
        product_value, surface = _normalize_acceptance_product(product)
        release_commit_value = _normalize_release_commit(release_commit)
        normalized = principal.normalized()
        payload: JsonObject = {
            "contract": PRODUCT_ACCEPTANCE_CONTRACT,
            "probe_id": probe_id_value,
            "owner_approval_id": owner_approval_id_value,
            "product": product_value,
            "surface": surface,
            "release_commit": release_commit_value,
        }
        fingerprint = _canonical_fingerprint("hosted_product_acceptance", payload)
        with self._guarded_cursor(
            normalized,
            write=True,
            capability=_required_surface_capability(surface),
        ) as (cursor, _capabilities):
            if product_value not in self._product_entitlements(
                cursor,
                normalized.workspace_id,
            ):
                raise TrialPermissionDenied(f"product.{product_value}")
            self._lock(cursor, f"{normalized.workspace_id}:acceptance:{probe_id_value}")
            replay = self._load_event_replay(
                cursor,
                workspace_id=normalized.workspace_id,
                command_id=probe_id_value,
                fingerprint=fingerprint,
            )
            if replay is not None:
                return _product_acceptance_record(replay, idempotent_replay=True)
            cursor.execute(
                """
                select version, state_json
                from app_private.workspace_state
                where workspace_id = %s and surface = %s
                """,
                (normalized.workspace_id, surface),
            )
            state_row = cursor.fetchone() or {}
            state_version = int(state_row.get("version", 0) or 0)
            state = state_row.get("state_json", {}) or {}
            if isinstance(state, str):
                state = json.loads(state)
            state_value = _json_object(state, field_name="acceptance state")
            state_digest = f"sha256:{_canonical_fingerprint('product_state', state_value)}"
            recorded_at = _utc_now()
            result = ProductAcceptanceRecord(
                probe_id=probe_id_value,
                owner_approval_id=owner_approval_id_value,
                product=product_value,
                surface=surface,
                release_commit=release_commit_value,
                state_version=state_version,
                state_digest=state_digest,
                recorded_at=recorded_at,
            ).to_dict()
            cursor.execute(
                """
                insert into app_private.workspace_events
                  (event_id, workspace_id, command_id, command_fingerprint, surface,
                   event_type, actor_id, actor_kind, expected_version, resulting_version,
                   payload_json, result_json, created_at)
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                        %s::jsonb, %s::jsonb, %s::timestamptz)
                """,
                (
                    str(uuid4()),
                    normalized.workspace_id,
                    probe_id_value,
                    fingerprint,
                    surface,
                    PRODUCT_ACCEPTANCE_EVENT_TYPE,
                    normalized.actor_id,
                    normalized.actor_kind,
                    state_version,
                    state_version,
                    json.dumps(payload, ensure_ascii=False),
                    json.dumps(result, ensure_ascii=False),
                    recorded_at,
                ),
            )
            cursor.execute(
                """
                select result_json
                from app_private.workspace_events
                where workspace_id = %s and command_id = %s
                  and event_type = %s
                """,
                (
                    normalized.workspace_id,
                    probe_id_value,
                    PRODUCT_ACCEPTANCE_EVENT_TYPE,
                ),
            )
            readback_row = cursor.fetchone()
            if not isinstance(readback_row, Mapping):
                raise TrialStoreError("Product acceptance evidence could not be read back.")
            readback = readback_row.get("result_json") or {}
            if isinstance(readback, str):
                readback = json.loads(readback)
            record = _product_acceptance_record(readback)
            if record.to_dict() != result:
                raise TrialStoreError("Product acceptance evidence could not be read back.")
            return record

    def get_product_acceptance(
        self,
        principal: TrialPrincipal,
        *,
        probe_id: str | UUID,
    ) -> ProductAcceptanceRecord:
        probe_id_value = _normalize_uuid(probe_id, field_name="probe_id")
        normalized = principal.normalized()
        with self._guarded_cursor(normalized, write=False) as (cursor, capabilities):
            cursor.execute(
                """
                select surface, result_json
                from app_private.workspace_events
                where workspace_id = %s and command_id = %s
                  and event_type = %s
                """,
                (
                    normalized.workspace_id,
                    probe_id_value,
                    PRODUCT_ACCEPTANCE_EVENT_TYPE,
                ),
            )
            row = cursor.fetchone()
            if not isinstance(row, Mapping):
                raise TrialNotFound()
            surface = _normalize_surface(str(row.get("surface") or ""))
            _require_surface_read_capability(capabilities, surface)
            result = row.get("result_json") or {}
            if isinstance(result, str):
                result = json.loads(result)
            return _product_acceptance_record(result)

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
        shop_correction_signer: ShopCorrectionReceiptSigner | None = None,
    ):
        self.reducer = reducer
        self.database_ready = bool(database_ready)
        self.role_ready = bool(role_ready)
        self.schema_ready = bool(schema_ready)
        self.audit_ready = bool(audit_ready)
        self.write_enabled = bool(write_enabled)
        self._shop_correction_signer = _configured_shop_correction_signer(
            shop_correction_signer
        )
        self._memberships: dict[tuple[str, str], tuple[str, str, frozenset[str]]] = {}
        self._states: dict[tuple[str, str], TrialState] = {}
        self._events: dict[tuple[str, str], tuple[str, str, str, JsonObject]] = {}
        self._event_types: dict[tuple[str, str], str] = {}
        self._shop_correction_payloads: dict[tuple[str, str], JsonObject] = {}
        self._shop_correction_lineages: dict[str, ShopCorrectionLineageRecord] = {}
        self._shop_correction_lineage_requests: dict[
            tuple[str, str], ShopCorrectionLineageRecord
        ] = {}
        self._shop_correction_consumptions: dict[
            tuple[str, str], ShopCorrectionConsumptionProof
        ] = {}
        self._shop_correction_consumption_requests: dict[
            tuple[str, str], ShopCorrectionConsumptionProof
        ] = {}
        self._commerce_action_ids: dict[tuple[str, str], str] = {}
        self._approvals: dict[tuple[str, str], ApprovalRecord] = {}
        self._approval_commands: dict[tuple[str, str], str] = {}
        self._self_serve_links: dict[str, JsonObject] = {}
        self._self_serve_attempts: dict[str, int] = {}
        self._workspace_labels: dict[str, str] = {}
        self._workspace_product_entitlements: dict[str, tuple[str, ...]] = {}
        self._workspace_owner_actor_ids: dict[str, str] = {}
        self._lock = RLock()

    def shop_correction_authorization_signing_ready(self) -> bool:
        return self._shop_correction_signer is not None

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

    def provision_product_entitlements(
        self,
        *,
        workspace_id: str,
        products: Sequence[str],
    ) -> None:
        """Install authoritative activation proof in the parity test double."""

        normalized = tuple(str(product).strip().lower() for product in products)
        if (
            normalized
            != tuple(product for product in PRODUCT_ENTITLEMENT_ORDER if product in normalized)
            or len(set(normalized)) != len(normalized)
        ):
            raise TrialValidationError("Product entitlements are invalid.")
        workspace = str(workspace_id).strip()
        if not workspace:
            raise TrialValidationError("Workspace ID is required.")
        self._workspace_product_entitlements[workspace] = normalized

    def provision_workspace_owner(self, *, workspace_id: str, actor_id: str) -> None:
        workspace = str(workspace_id or "").strip()
        actor = str(actor_id or "").strip()
        if not workspace or not actor:
            raise TrialValidationError("Workspace owner identity is required.")
        self._workspace_owner_actor_ids[workspace] = actor

    def create_self_serve_workspace(
        self,
        *,
        actor_id: str,
        claim_code: str,
        business_name: str,
        product: str = "commerce",
        session_id: str = "",
        identity_provider: str = "supabase",
    ) -> SelfServeWorkspaceResult:
        """Parity double for the hosted self-serve provisioning semantics."""

        del session_id, identity_provider  # The parity double keeps no live auth sessions.
        claim = validate_self_serve_claim_code(claim_code)
        label = validate_self_serve_business_name(business_name)
        actor = str(actor_id or "").strip()
        if not actor:
            raise TrialNotReadyError(("auth_ready",))
        normalized_product = validate_self_serve_product(product)
        owner_capabilities = self_serve_owner_capabilities(normalized_product)
        workspace_id, command_id, fingerprint = _self_serve_command_identity(
            claim, label, normalized_product
        )
        with self._lock:
            infrastructure_blockers = tuple(
                name
                for name, ready in (
                    ("database_ready", self.database_ready),
                    ("role_ready", self.role_ready),
                    ("schema_ready", self.schema_ready),
                    ("audit_ready", self.audit_ready),
                    ("write_enabled", self.write_enabled),
                )
                if not ready
            )
            if infrastructure_blockers:
                raise TrialNotReadyError(infrastructure_blockers)
            _count_self_serve_attempt(self._self_serve_attempts, actor)
            link = self._self_serve_links.get(claim)
            if link is not None:
                if str(link.get("owner_actor_id", "")) != actor:
                    raise TrialClaimConflict(claim)
                replay = self._replay(workspace_id, actor, HUMAN_ACTOR_KIND, command_id, fingerprint)
                membership = self._memberships.get((workspace_id, actor))
                if (
                    replay is None
                    or membership is None
                    or membership[0] != "active"
                    or membership[2] != owner_capabilities
                ):
                    raise TrialInvalidTransition(
                        "Self-serve claim history exists without an active owner membership."
                    )
                stored = replay.get("self_serve_workspace")
                if not isinstance(stored, Mapping):
                    raise TrialInvalidTransition("Self-serve claim history is not replayable.")
                return SelfServeWorkspaceResult(
                    workspace_id=str(stored.get("workspace_id", workspace_id)),
                    label=str(stored.get("label", label)),
                    access="owner",
                    claim_code=claim,
                    owner_actor_id=actor,
                    event_id=str(stored.get("event_id", command_id)),
                    created_at=str(stored.get("created_at", "")),
                    idempotent_replay=True,
                )
            if any(
                existing_workspace == workspace_id
                for existing_workspace, _ in self._memberships
            ):
                raise TrialInvalidTransition(
                    "Self-serve workspace identity conflicts with durable history."
                )
            now = _utc_now()
            self.provision_membership(
                workspace_id=workspace_id,
                actor_id=actor,
                actor_kind=HUMAN_ACTOR_KIND,
                capabilities=sorted(owner_capabilities),
            )
            link_record: JsonObject = {
                "claim_code": claim,
                "workspace_id": workspace_id,
                "owner_actor_id": actor,
                "business_name": label,
                "product": normalized_product,
                "linked_at": now,
            }
            self._self_serve_links[claim] = deepcopy(link_record)
            self._workspace_labels[workspace_id] = label
            self._workspace_product_entitlements[workspace_id] = (normalized_product,)
            self._workspace_owner_actor_ids[workspace_id] = actor
            result = SelfServeWorkspaceResult(
                workspace_id=workspace_id,
                label=label,
                access="owner",
                claim_code=claim,
                owner_actor_id=actor,
                event_id=command_id,
                created_at=now,
            )
            self._events[(workspace_id, command_id)] = (
                fingerprint,
                actor,
                HUMAN_ACTOR_KIND,
                {"self_serve_workspace": result.to_dict()},
            )
            # Durable read-back before the directory entry is returned (parity
            # with the hosted persistence-proof semantics).
            stored_membership = self._memberships.get((workspace_id, actor))
            stored_event = self._events.get((workspace_id, command_id))
            if (
                stored_membership is None
                or stored_membership[0] != "active"
                or stored_membership[1] != HUMAN_ACTOR_KIND
                or stored_membership[2] != owner_capabilities
                or stored_event is None
                or stored_event[0] != fingerprint
                or self._self_serve_links.get(claim) != link_record
            ):
                raise TrialStoreError(
                    "Self-serve workspace writes could not be read back durably."
                )
            return result

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
        product_entitlements = (
            self._workspace_product_entitlements.get(normalized.workspace_id)
            if membership_ready and principal is not None
            else None
        )
        capabilities = capabilities_for_product_entitlements(
            capabilities, product_entitlements
        )
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
            product_entitlements=product_entitlements,
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

    def issue_shop_correction_authorization(
        self,
        principal: TrialPrincipal,
        *,
        authorization_request_id: str | UUID,
        capability: str,
        command_digest: str,
        request_fingerprint: str,
        confirmation: str,
    ) -> ShopCorrectionAuthorizationReceipt:
        signer = self._shop_correction_signer
        if signer is None:
            raise TrialNotReadyError(("shop_correction_signing_ready",))
        (
            request_id,
            capability_value,
            command_digest_value,
            confirmation_value,
            command_facts,
        ) = _shop_correction_authorization_request(
            authorization_request_id=authorization_request_id,
            capability=capability,
            command_digest=command_digest,
            request_fingerprint=request_fingerprint,
            confirmation=confirmation,
        )
        normalized = _require_shop_correction_principal(principal)
        command_id, fingerprint = _shop_correction_finalization_identity(
            workspace_id=normalized.workspace_id,
            capability=capability_value,
            semantic_target_id=str(
                command_facts[
                    "saleId"
                    if capability_value == "shop.sale.reverse"
                    else "reversalId"
                ]
            ),
        )
        with self._lock:
            normalized, readiness = self._guard(
                normalized,
                write=True,
                capability="commerce.write",
            )
            if (
                readiness.product_entitlements is None
                or "commerce" not in readiness.product_entitlements
            ):
                raise TrialPermissionDenied("product.commerce")
            if (
                self._workspace_owner_actor_ids.get(normalized.workspace_id)
                != normalized.actor_id
            ):
                raise TrialPermissionDenied("shop.owner")
            event_key = (normalized.workspace_id, command_id)
            claimed_command = next(
                (
                    existing_command
                    for (workspace_id, existing_command), payload
                    in self._shop_correction_payloads.items()
                    if workspace_id == normalized.workspace_id
                    and payload.get("authorizationRequestId") == request_id
                ),
                None,
            )
            if claimed_command is not None and claimed_command != command_id:
                raise TrialIdempotencyConflict(request_id)
            if (
                event_key in self._events
                and self._event_types.get(event_key)
                != SHOP_CORRECTION_AUTHORIZATION_EVENT_TYPE
            ):
                raise TrialIdempotencyConflict(command_id)
            issued_at_millis = int(datetime.now(timezone.utc).timestamp() * 1000)
            replay = self._replay(
                normalized.workspace_id,
                normalized.actor_id,
                normalized.actor_kind,
                command_id,
                fingerprint,
            )
            if replay is not None:
                payload = self._shop_correction_payloads.get(event_key)
                if (
                    not isinstance(payload, Mapping)
                    or payload.get("authorizationRequestId") != request_id
                    or payload.get("capability") != capability_value
                    or payload.get("commandDigest") != command_digest_value
                ):
                    raise TrialIdempotencyConflict(command_id)
                receipt = _shop_correction_receipt_from_mapping(
                    replay,
                    signer=signer,
                    workspace_id=normalized.workspace_id,
                    actor_id=normalized.actor_id,
                    finalization_request_id=request_id,
                    capability=capability_value,
                    command_digest=command_digest_value,
                    idempotent_replay=True,
                )
                if issued_at_millis > receipt.expires_at_millis:
                    raise TrialAuthorizationExpired(request_id)
                return receipt
            receipt = _new_shop_correction_authorization_receipt(
                signer=signer,
                workspace_id=normalized.workspace_id,
                actor_id=normalized.actor_id,
                finalization_request_id=request_id,
                capability=capability_value,
                command_digest=command_digest_value,
                finalized_at_millis=issued_at_millis,
            )
            self._events[event_key] = (
                fingerprint,
                normalized.actor_id,
                normalized.actor_kind,
                receipt.to_dict(),
            )
            self._event_types[event_key] = SHOP_CORRECTION_AUTHORIZATION_EVENT_TYPE
            self._shop_correction_payloads[event_key] = {
                "contract": SHOP_CORRECTION_AUTHORIZATION_CONTRACT,
                "authorizationRequestId": request_id,
                "capability": capability_value,
                "commandDigest": command_digest_value,
                "confirmation": confirmation_value,
                "command": deepcopy(command_facts),
            }
            readback = self._replay(
                normalized.workspace_id,
                normalized.actor_id,
                normalized.actor_kind,
                command_id,
                fingerprint,
            )
            record = _shop_correction_receipt_from_mapping(
                readback,
                signer=signer,
                workspace_id=normalized.workspace_id,
                actor_id=normalized.actor_id,
                finalization_request_id=request_id,
                capability=capability_value,
                command_digest=command_digest_value,
                idempotent_replay=False,
            )
            if record.to_dict() != receipt.to_dict():
                raise TrialStoreError(
                    "Shop correction authorization evidence could not be read back."
                )
            return record

    def _guard_shop_correction_owner(
        self, principal: TrialPrincipal, *, write: bool
    ) -> tuple[TrialPrincipal, TrialReadiness]:
        normalized, readiness = self._guard(
            principal,
            write=write,
            capability="commerce.write",
        )
        if (
            readiness.product_entitlements is None
            or "commerce" not in readiness.product_entitlements
        ):
            raise TrialPermissionDenied("product.commerce")
        if self._workspace_owner_actor_ids.get(normalized.workspace_id) != normalized.actor_id:
            raise TrialPermissionDenied("shop.owner")
        return normalized, readiness

    def activate_shop_correction_lineage(
        self,
        principal: TrialPrincipal,
        *,
        activation_request_id: str | UUID,
        lineage_id: str | UUID,
        expected_previous_lineage_id: str | UUID | None,
        expected_previous_lineage_epoch: int | None,
        local_consumption_ordinal: int,
        local_consumption_digest: str | None,
    ) -> ShopCorrectionLineageRecord:
        request_id = _shop_correction_uuid(
            activation_request_id, field="activation_request_id"
        )
        lineage = _shop_correction_uuid(lineage_id, field="lineage_id")
        if expected_previous_lineage_id is None:
            previous_lineage = None
        else:
            previous_lineage = _shop_correction_uuid(
                expected_previous_lineage_id,
                field="expected_previous_lineage_id",
            )
        if expected_previous_lineage_epoch is not None and (
            type(expected_previous_lineage_epoch) is not int
            or expected_previous_lineage_epoch < 1
        ):
            raise TrialValidationError(
                "expected_previous_lineage_epoch must be a positive integer."
            )
        _, _, ordinal, digest = _shop_correction_lineage_input(
            lineage_id=lineage,
            lineage_epoch=1,
            consumption_ordinal=local_consumption_ordinal,
            consumption_digest=local_consumption_digest,
        )
        with self._lock:
            normalized, _ = self._guard_shop_correction_owner(principal, write=True)
            replay = self._shop_correction_lineage_requests.get(
                (normalized.workspace_id, request_id)
            )
            if replay is not None:
                if (
                    replay.lineage_id != lineage
                    or replay.previous_lineage_id != previous_lineage
                    or replay.previous_lineage_epoch != expected_previous_lineage_epoch
                    or replay.consumption_ordinal != ordinal
                    or replay.consumption_digest != digest
                ):
                    raise TrialIdempotencyConflict(request_id)
                current = self._shop_correction_lineages.get(normalized.workspace_id)
                if (
                    current is not None
                    and current.lineage_id == replay.lineage_id
                    and current.lineage_epoch == replay.lineage_epoch
                ):
                    return replace(
                        replay,
                        consumption_ordinal=current.consumption_ordinal,
                        consumption_digest=current.consumption_digest,
                        idempotent_replay=True,
                    )
                return replace(replay, idempotent_replay=True)
            active = self._shop_correction_lineages.get(normalized.workspace_id)
            if active is None:
                if (
                    previous_lineage is not None
                    or expected_previous_lineage_epoch is not None
                    or ordinal != 0
                    or digest is not None
                ):
                    raise TrialReconciliationRequired(state="initial_watermark_not_empty")
                epoch = 1
            else:
                if (
                    previous_lineage != active.lineage_id
                    or expected_previous_lineage_epoch != active.lineage_epoch
                ):
                    raise TrialReconciliationRequired(state="stale_lineage")
                if (
                    ordinal != active.consumption_ordinal
                    or digest != active.consumption_digest
                ):
                    raise TrialReconciliationRequired(state="watermark_mismatch")
                if lineage == active.lineage_id:
                    raise TrialValidationError(
                        "A restored lineage must use a fresh lineage_id."
                    )
                epoch = active.lineage_epoch + 1
            record = ShopCorrectionLineageRecord(
                activation_request_id=request_id,
                workspace_id=normalized.workspace_id,
                actor_id=normalized.actor_id,
                lineage_id=lineage,
                lineage_epoch=epoch,
                previous_lineage_id=previous_lineage,
                previous_lineage_epoch=expected_previous_lineage_epoch,
                consumption_ordinal=ordinal,
                consumption_digest=digest,
                activated_at_millis=int(datetime.now(timezone.utc).timestamp() * 1000),
            )
            self._shop_correction_lineages[normalized.workspace_id] = record
            self._shop_correction_lineage_requests[
                (normalized.workspace_id, request_id)
            ] = record
            return record

    def _find_shop_correction_authorization(
        self,
        *,
        workspace_id: str,
        receipt_id: str,
    ) -> tuple[ShopCorrectionAuthorizationReceipt, Mapping[str, Any]]:
        signer = self._shop_correction_signer
        if signer is None:
            raise TrialNotReadyError(("shop_correction_signing_ready",))
        for event_key, event_type in self._event_types.items():
            if event_key[0] != workspace_id or event_type != SHOP_CORRECTION_AUTHORIZATION_EVENT_TYPE:
                continue
            stored = self._events.get(event_key)
            if stored is None:
                continue
            result = stored[3]
            if str(result.get("receiptId") or "") != receipt_id:
                continue
            payload = self._shop_correction_payloads.get(event_key)
            if not isinstance(payload, Mapping):
                raise TrialStoreError("Shop correction authorization evidence is invalid.")
            receipt = _shop_correction_receipt_from_mapping(
                result,
                signer=signer,
                workspace_id=workspace_id,
                actor_id=str(result.get("actorId") or ""),
                finalization_request_id=str(result.get("finalizationRequestId") or ""),
                capability=str(result.get("capability") or ""),
                command_digest=str(result.get("commandDigest") or ""),
                idempotent_replay=True,
            )
            return receipt, payload
        raise TrialNotFound("Shop correction authorization was not found.")

    def consume_shop_correction_authorization(
        self,
        principal: TrialPrincipal,
        *,
        consumption_request_id: str | UUID,
        authorization_receipt_id: str | UUID,
        authorization_receipt_digest: str,
        lineage_id: str | UUID,
        lineage_epoch: int,
        capability: str,
        semantic_target_id: str,
        command_digest: str,
        allow_new_decision: bool,
    ) -> ShopCorrectionConsumptionProof:
        if type(allow_new_decision) is not bool:
            raise TrialValidationError("allow_new_decision must be a boolean.")
        request_id = _shop_correction_uuid(
            consumption_request_id, field="consumption_request_id"
        )
        receipt_id = _shop_correction_uuid(
            authorization_receipt_id, field="authorization_receipt_id"
        )
        receipt_digest = _shop_correction_digest(
            authorization_receipt_digest,
            field="authorization_receipt_digest",
        )
        lineage, epoch, _, _ = _shop_correction_lineage_input(
            lineage_id=lineage_id,
            lineage_epoch=lineage_epoch,
            consumption_ordinal=0,
            consumption_digest=None,
        )
        digest = _shop_correction_digest(command_digest, field="command_digest")
        target = _bounded_shop_correction_text(
            semantic_target_id,
            field="Shop correction semantic_target_id",
            maximum=120,
        )
        if capability not in SHOP_CORRECTION_AUTHORIZATION_CAPABILITIES:
            raise TrialValidationError("Shop correction capability is invalid.")
        with self._lock:
            normalized, _ = self._guard_shop_correction_owner(principal, write=True)
            active = self._shop_correction_lineages.get(normalized.workspace_id)
            if (
                active is None
                or active.lineage_id != lineage
                or active.lineage_epoch != epoch
            ):
                raise TrialReconciliationRequired(state="stale_lineage")
            receipt, payload = self._find_shop_correction_authorization(
                workspace_id=normalized.workspace_id,
                receipt_id=receipt_id,
            )
            command = payload.get("command")
            if not isinstance(command, Mapping):
                raise TrialStoreError("Shop correction authorization evidence is invalid.")
            expected_target = command.get(
                "saleId" if capability == "shop.sale.reverse" else "reversalId"
            )
            if (
                receipt.actor_id != normalized.actor_id
                or receipt.receipt_digest != receipt_digest
                or receipt.capability != capability
                or receipt.command_digest != digest
                or expected_target != target
            ):
                raise TrialPermissionDenied("shop.correction.consume")
            command_id, _ = _shop_correction_consumption_identity(
                workspace_id=normalized.workspace_id,
                capability=capability,
                semantic_target_id=target,
            )
            key = (normalized.workspace_id, command_id)
            existing = self._shop_correction_consumptions.get(key)
            if existing is not None:
                exact_request = existing.consumption_request_id == request_id
                same_committed_lineage = (
                    existing.lineage_id == lineage
                    and existing.lineage_epoch == epoch
                )
                accepted_successor = (
                    active.lineage_id == lineage
                    and active.lineage_epoch == epoch
                    and active.consumption_ordinal >= existing.consumption_ordinal
                )
                if (
                    existing.authorization_receipt_id != receipt_id
                    or existing.authorization_receipt_digest != receipt_digest
                    or existing.command_digest != digest
                    or existing.capability != capability
                    or existing.semantic_target_id != target
                    or not (same_committed_lineage or accepted_successor)
                ):
                    raise TrialReconciliationRequired(state="committed_other_lineage")
                return replace(
                    existing,
                    response_mode=(
                        "recover_same_request"
                        if same_committed_lineage and exact_request
                        else "reconstruct_existing"
                    ),
                )
            claimed = self._shop_correction_consumption_requests.get(
                (normalized.workspace_id, request_id)
            )
            if claimed is not None:
                raise TrialIdempotencyConflict(request_id)
            if not allow_new_decision:
                raise TrialNotReadyError(("shop_correction_authorization_window_open",))
            now_millis = int(datetime.now(timezone.utc).timestamp() * 1000)
            if now_millis > receipt.expires_at_millis:
                raise TrialAuthorizationExpired(receipt.finalization_request_id)
            ordinal = active.consumption_ordinal + 1
            consumption_id = str(uuid5(UUID(receipt_id), request_id))
            history_digest = _shop_correction_consumption_digest(
                consumption_id=consumption_id,
                consumption_request_id=request_id,
                authorization_receipt_id=receipt_id,
                authorization_receipt_digest=receipt_digest,
                workspace_id=normalized.workspace_id,
                actor_id=normalized.actor_id,
                capability=capability,
                semantic_target_id=target,
                command_digest=digest,
                lineage_id=lineage,
                lineage_epoch=epoch,
                consumption_ordinal=ordinal,
                previous_consumption_digest=active.consumption_digest,
                consumed_at_millis=now_millis,
            )
            signer = self._shop_correction_signer
            if signer is None:
                raise TrialNotReadyError(("shop_correction_signing_ready",))
            proof = ShopCorrectionConsumptionProof(
                consumption_id=consumption_id,
                consumption_request_id=request_id,
                authorization_receipt_id=receipt_id,
                authorization_receipt_digest=receipt_digest,
                workspace_id=normalized.workspace_id,
                actor_id=normalized.actor_id,
                capability=capability,
                semantic_target_id=target,
                command_digest=digest,
                lineage_id=lineage,
                lineage_epoch=epoch,
                consumption_ordinal=ordinal,
                previous_consumption_digest=active.consumption_digest,
                history_digest=history_digest,
                consumed_at_millis=now_millis,
                key_id=signer.key_id,
                signature=signer.sign(receipt_digest=history_digest),
            )
            self._shop_correction_consumptions[key] = proof
            self._shop_correction_consumption_requests[
                (normalized.workspace_id, request_id)
            ] = proof
            self._shop_correction_lineages[normalized.workspace_id] = (
                ShopCorrectionLineageRecord(
                    activation_request_id=active.activation_request_id,
                    workspace_id=active.workspace_id,
                    actor_id=active.actor_id,
                    lineage_id=active.lineage_id,
                    lineage_epoch=active.lineage_epoch,
                    previous_lineage_id=active.previous_lineage_id,
                    previous_lineage_epoch=active.previous_lineage_epoch,
                    consumption_ordinal=ordinal,
                    consumption_digest=history_digest,
                    activated_at_millis=active.activated_at_millis,
                )
            )
            return proof

    def get_shop_correction_reconciliation_status(
        self,
        principal: TrialPrincipal,
        *,
        lineage_id: str | UUID,
        lineage_epoch: int,
        local_consumption_ordinal: int,
        local_consumption_digest: str | None,
    ) -> ShopCorrectionReconciliationStatus:
        lineage, epoch, ordinal, digest = _shop_correction_lineage_input(
            lineage_id=lineage_id,
            lineage_epoch=lineage_epoch,
            consumption_ordinal=local_consumption_ordinal,
            consumption_digest=local_consumption_digest,
        )
        with self._lock:
            normalized, _ = self._guard_shop_correction_owner(principal, write=False)
            active = self._shop_correction_lineages.get(normalized.workspace_id)
            if active is None:
                raise TrialNotReadyError(("shop_correction_lineage_ready",))
            if lineage != active.lineage_id or epoch != active.lineage_epoch:
                state = "stale_lineage"
            elif ordinal == active.consumption_ordinal and digest == active.consumption_digest:
                state = "current"
            else:
                state = "reconciliation_required"
            return ShopCorrectionReconciliationStatus(
                workspace_id=normalized.workspace_id,
                requested_lineage_id=lineage,
                requested_lineage_epoch=epoch,
                active_lineage_id=active.lineage_id,
                active_lineage_epoch=active.lineage_epoch,
                server_consumption_ordinal=active.consumption_ordinal,
                server_consumption_digest=active.consumption_digest,
                local_consumption_ordinal=ordinal,
                local_consumption_digest=digest,
                state=state,
            )

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
        expected_related_versions: Mapping[str, int] | None = None,
        state_precondition: StatePrecondition | None = None,
    ) -> CommandResult:
        command_id_value = _normalize_uuid(command_id, field_name="command_id")
        surface_value = _normalize_surface(surface)
        event_type_value = _normalize_event_type(event_type)
        related_surface_values = _normalize_related_surfaces(surface_value, related_surfaces)
        related_version_values = _normalize_expected_related_versions(
            related_surface_values,
            expected_related_versions,
        )
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
        if related_version_values:
            command_contract["expected_related_versions"] = related_version_values
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
            for related_surface, expected_related_version in related_version_values.items():
                related_record = self._states.get(
                    (normalized.workspace_id, related_surface),
                    TrialState(normalized.workspace_id, related_surface, 0, {}),
                )
                if related_record.version != expected_related_version:
                    raise TrialVersionConflict(
                        expected_version=expected_related_version,
                        current_version=related_record.version,
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

    def record_product_acceptance(
        self,
        principal: TrialPrincipal,
        *,
        probe_id: str | UUID,
        owner_approval_id: str | UUID,
        product: str,
        release_commit: str,
    ) -> ProductAcceptanceRecord:
        probe_id_value = _normalize_uuid(probe_id, field_name="probe_id")
        owner_approval_id_value = _normalize_uuid(
            owner_approval_id,
            field_name="owner_approval_id",
        )
        product_value, surface = _normalize_acceptance_product(product)
        release_commit_value = _normalize_release_commit(release_commit)
        payload: JsonObject = {
            "contract": PRODUCT_ACCEPTANCE_CONTRACT,
            "probe_id": probe_id_value,
            "owner_approval_id": owner_approval_id_value,
            "product": product_value,
            "surface": surface,
            "release_commit": release_commit_value,
        }
        fingerprint = _canonical_fingerprint("hosted_product_acceptance", payload)
        with self._lock:
            normalized, _readiness = self._guard(
                principal,
                write=True,
                capability=_required_surface_capability(surface),
            )
            if (
                _readiness.product_entitlements is None
                or product_value not in _readiness.product_entitlements
            ):
                raise TrialPermissionDenied(f"product.{product_value}")
            replay = self._replay(
                normalized.workspace_id,
                normalized.actor_id,
                normalized.actor_kind,
                probe_id_value,
                fingerprint,
            )
            if replay is not None:
                return _product_acceptance_record(replay, idempotent_replay=True)
            state = self._states.get(
                (normalized.workspace_id, surface),
                TrialState(normalized.workspace_id, surface, 0, {}),
            )
            record = ProductAcceptanceRecord(
                probe_id=probe_id_value,
                owner_approval_id=owner_approval_id_value,
                product=product_value,
                surface=surface,
                release_commit=release_commit_value,
                state_version=state.version,
                state_digest=f"sha256:{_canonical_fingerprint('product_state', state.state)}",
                recorded_at=_utc_now(),
            )
            self._events[(normalized.workspace_id, probe_id_value)] = (
                fingerprint,
                normalized.actor_id,
                normalized.actor_kind,
                record.to_dict(),
            )
            return _product_acceptance_record(
                self._events[(normalized.workspace_id, probe_id_value)][3]
            )

    def get_product_acceptance(
        self,
        principal: TrialPrincipal,
        *,
        probe_id: str | UUID,
    ) -> ProductAcceptanceRecord:
        probe_id_value = _normalize_uuid(probe_id, field_name="probe_id")
        with self._lock:
            normalized, readiness = self._guard(principal, write=False)
            row = self._events.get((normalized.workspace_id, probe_id_value))
            if row is None:
                raise TrialNotFound()
            record = _product_acceptance_record(row[3])
            _require_surface_read_capability(readiness.capabilities, record.surface)
            return record

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
