"""Canonical, SuperMega-only API runtime for app.supermega.dev.

The public application remains an isolated browser demo until every managed
trial gate is configured. No legacy client runtime is imported here.
"""

from __future__ import annotations

from collections.abc import Mapping
from copy import deepcopy
from datetime import datetime
from datetime import timezone
import hashlib
import hmac
import ipaddress
import json
import logging
import os
import re
import time
from typing import Any
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from supermega_runtime.cloud_runtime import router as cloud_runtime_router
from supermega_runtime.commerce_runtime import reduce_commerce_state
from supermega_runtime.order_intake_provider import (
    OrderIntakeProviderError,
    order_intake_provider_from_environment,
)
from supermega_runtime.production_runtime import reduce_production_state
from supermega_runtime.activation_email import send_self_serve_welcome_email
from supermega_runtime.supabase_auth import SupabaseAuthConfig, verify_supabase_user_identity
from supermega_runtime.telemetry.tracing import instrument_app as instrument_telemetry
from supermega_runtime.trial_runtime import TrialSignupSession, create_trial_router
from supermega_runtime.trial_store import (
    PostgresTrialStore,
    TrialNotReadyError,
    TrialPrincipal,
    TrialValidationError,
)
from supermega_runtime.website_runtime import reduce_website_state


SERVICE_NAME = "supermega-service"
SERVICE_VERSION = "1.2.0"
TRIAL_EVENT_BY_SURFACE = {
    "company": "company.snapshot.saved",
    "setup": "setup.snapshot.saved",
}
_IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
_MAX_IDENTITY_AGE_SECONDS = 300
_MIN_IDENTITY_SECRET_BYTES = 32
_MIN_IDENTITY_SECRET_DISTINCT_BYTES = 10
_DEFAULT_CORS_ORIGINS = "https://app.supermega.dev,https://supermega.dev,https://www.supermega.dev"
_MAX_CORS_ORIGINS = 16
_MAX_CORS_CONFIGURATION_BYTES = 8 * 1024
_MAX_CORS_ORIGIN_BYTES = 512
_DNS_LABEL = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$")
_IDENTITY_SECRET_PLACEHOLDER_MARKERS = frozenset(
    {
        "change-me",
        "changeme",
        "example-secret",
        "example_secret",
        "placeholder",
        "replace-me",
        "replaceme",
        "test-secret",
        "test_secret",
        "your-secret",
        "your_secret",
    }
)
_ECOMMERCE_ORDER_IMPORT_REVIEW_PACKET_SCHEMA = "supermega.ecommerce.order_import_review_packet.v1"
_ECOMMERCE_ORDER_QUEUE_READINESS_PACKET_SCHEMA = "supermega.ecommerce.order_queue_readiness.v1"
_ECOMMERCE_ORDER_QUEUE_VALIDATION_CONTRACT = "supermega.ecommerce.order_queue_readiness_validation.v1"
_ECOMMERCE_ORDER_QUEUE_OWNER_APPROVAL_CONTRACT = "supermega.ecommerce.order_queue_owner_approval.v1"
_ECOMMERCE_ORDER_QUEUE_IMPORT_PLAN_CONTRACT = "supermega.ecommerce.shop_queue_import_plan.v1"
_ECOMMERCE_ORDER_QUEUE_REQUIRED_CONTROLS = [
    "managed_postgres_rls",
    "workspace_identity",
    "shop_catalog_match",
    "source_message_retention",
    "owner_queue_approval",
    "audit_log",
    "scheduler_proof",
]
_ECOMMERCE_ORDER_QUEUE_FORBIDDEN_UNTIL_APPLIED = [
    "order_import",
    "production_queue_write",
    "customer_message_send",
    "payment_capture",
    "wallet_debit",
    "delivery_booking",
    "stock_move",
    "refund_write",
    "shop_write",
    "managed_activation",
]


def _text(value: object) -> str:
    return str(value or "").strip()


def _is_record(value: object) -> bool:
    return isinstance(value, dict)


def _exact_keys(value: Mapping[str, Any], keys: list[str]) -> bool:
    return set(value.keys()) == set(keys) and len(value.keys()) == len(keys)


def _canonical_text(value: object, maximum: int) -> bool:
    return isinstance(value, str) and value == value.strip() and 0 < len(value) <= maximum


def _safe_non_negative_integer(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def _iso_timestamp(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return parsed.tzinfo is not None and parsed.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z") == value


def _same_string_array(left: object, right: list[str]) -> bool:
    return isinstance(left, list) and left == right and all(isinstance(item, str) for item in left)


def _flag(name: str, *, default: bool = False) -> bool:
    value = _text(os.getenv(name))
    if not value:
        return default
    return value.casefold() in {"1", "true", "yes", "on"}


def _identity_secret_ready(value: object) -> bool:
    """Apply a bounded fail-closed check to the gateway HMAC key material."""

    secret = _text(value)
    encoded = secret.encode("utf-8")
    lowered = secret.casefold()
    return bool(
        len(encoded) >= _MIN_IDENTITY_SECRET_BYTES
        and len(set(encoded)) >= _MIN_IDENTITY_SECRET_DISTINCT_BYTES
        and not any(marker in lowered for marker in _IDENTITY_SECRET_PLACEHOLDER_MARKERS)
    )


def _cors_origins(value: object) -> list[str]:
    """Return exact credential-safe browser origins or fail application startup."""

    raw = _text(value) or _DEFAULT_CORS_ORIGINS
    if len(raw.encode("utf-8")) > _MAX_CORS_CONFIGURATION_BYTES:
        raise ValueError("SUPERMEGA_CORS_ORIGINS exceeds the bounded configuration size.")
    candidates = raw.split(",")
    if not 1 <= len(candidates) <= _MAX_CORS_ORIGINS or any(not item.strip() for item in candidates):
        raise ValueError("SUPERMEGA_CORS_ORIGINS must contain 1 to 16 non-empty exact origins.")

    origins: list[str] = []
    for index, candidate in enumerate(candidates):
        origin = candidate.strip()
        try:
            parsed = urlsplit(origin)
            port = parsed.port
        except ValueError as exc:
            raise ValueError(
                f"SUPERMEGA_CORS_ORIGINS contains an invalid origin at position {index + 1}."
            ) from exc
        hostname = parsed.hostname or ""
        loopback = hostname.casefold() in {"localhost", "127.0.0.1", "::1"}
        try:
            hostname.encode("ascii")
        except UnicodeEncodeError as exc:
            raise ValueError(
                f"SUPERMEGA_CORS_ORIGINS contains an invalid origin at position {index + 1}."
            ) from exc
        if (
            len(origin.encode("utf-8")) > _MAX_CORS_ORIGIN_BYTES
            or origin == "null"
            or "*" in origin
            or parsed.scheme.casefold() not in {"http", "https"}
            or (parsed.scheme.casefold() != "https" and not loopback)
            or not parsed.netloc
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path
            or parsed.query
            or parsed.fragment
            or hostname.endswith(".")
        ):
            raise ValueError(
                f"SUPERMEGA_CORS_ORIGINS contains an invalid origin at position {index + 1}."
            )
        try:
            ipaddress.ip_address(hostname)
            host_valid = True
        except ValueError:
            host_valid = all(_DNS_LABEL.fullmatch(label) for label in hostname.split("."))
        if not host_valid:
            raise ValueError(
                f"SUPERMEGA_CORS_ORIGINS contains an invalid origin at position {index + 1}."
            )
        canonical = f"{parsed.scheme.casefold()}://{parsed.netloc.casefold()}"
        if port is not None and not 1 <= port <= 65535:
            raise ValueError(
                f"SUPERMEGA_CORS_ORIGINS contains an invalid origin at position {index + 1}."
            )
        if canonical not in origins:
            origins.append(canonical)
    return origins


def _validate_state_shape(surface: str, state: Mapping[str, Any]) -> None:
    required_lists = {
        "company": ("tasks",),
        "commerce": ("items", "orders", "closes"),
    }
    if surface in required_lists:
        missing = [key for key in required_lists[surface] if not isinstance(state.get(key), list)]
        if missing:
            raise TrialValidationError(f"{surface} state requires list fields: {', '.join(missing)}.")
    elif surface == "setup":
        if state.get("product") not in {"commerce", "production"}:
            raise TrialValidationError("setup product must be commerce or production.")
        for field in ("template", "workspace", "owner"):
            if not isinstance(state.get(field), str) or len(str(state[field])) > 160:
                raise TrialValidationError(f"setup {field} must be a string of at most 160 characters.")


def reduce_trial_state(
    surface: str,
    event_type: str,
    current: Mapping[str, Any],
    payload: Mapping[str, Any],
) -> Mapping[str, Any]:
    """Reduce one bounded command with explicit product lifecycle rules."""

    if surface == "commerce":
        state = reduce_commerce_state(event_type, current, payload)
    elif surface == "production":
        state = reduce_production_state(event_type, current, payload)
    elif surface == "website":
        state = reduce_website_state(event_type, current, payload)
    else:
        expected_event = TRIAL_EVENT_BY_SURFACE.get(surface)
        if event_type != expected_event:
            raise TrialValidationError(f"event_type must be {expected_event or 'a supported snapshot event'}.")
        if set(payload) != {"state"} or not isinstance(payload.get("state"), Mapping):
            raise TrialValidationError("payload must contain exactly one object field named state.")
        state = dict(payload["state"])
        _validate_state_shape(surface, state)
    try:
        encoded = json.dumps(state, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise TrialValidationError("state must be valid JSON.") from exc
    if len(encoded) > 64 * 1024:
        raise TrialValidationError("state exceeds the 64 KiB trial limit.")
    return deepcopy(state)


def _resolve_gateway_principal(request: Request) -> TrialPrincipal | None:
    """Verify identity signed by a trusted server-side auth gateway.

    Browsers cannot assert workspace or actor identity by themselves. The
    gateway signs ``v2\n<timestamp>\n<workspace>\n<actor>\n<actor_kind>`` with
    the server-only ``SUPERMEGA_TRIAL_IDENTITY_SECRET``. Actor kind is part of
    the signature so a service or agent identity cannot relabel itself human.
    """

    secret = _text(os.getenv("SUPERMEGA_TRIAL_IDENTITY_SECRET"))
    workspace_id = _text(request.headers.get("x-supermega-workspace-id"))
    actor_id = _text(request.headers.get("x-supermega-actor-id"))
    actor_kind = _text(request.headers.get("x-supermega-actor-kind")).casefold()
    timestamp = _text(request.headers.get("x-supermega-identity-timestamp"))
    signature = _text(request.headers.get("x-supermega-identity-signature")).casefold()
    if not _identity_secret_ready(secret):
        return None
    if not all((workspace_id, actor_id, actor_kind, timestamp, signature)):
        return None
    if not _IDENTIFIER.fullmatch(workspace_id) or not _IDENTIFIER.fullmatch(actor_id):
        return None
    if actor_kind not in {"human", "service", "agent"}:
        return None
    try:
        issued_at = int(timestamp)
    except ValueError:
        return None
    if abs(int(time.time()) - issued_at) > _MAX_IDENTITY_AGE_SECONDS:
        return None
    message = f"v2\n{timestamp}\n{workspace_id}\n{actor_id}\n{actor_kind}".encode("utf-8")
    expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        return None
    return TrialPrincipal(
        workspace_id=workspace_id,
        actor_id=actor_id,
        actor_kind=actor_kind,
        authenticated=True,
        identity_provider="gateway",
    )


def _bearer_token(request: Request) -> str:
    authorization = _text(request.headers.get("authorization"))
    scheme, separator, token = authorization.partition(" ")
    if not separator or scheme.casefold() != "bearer":
        return ""
    return token.strip()


def resolve_trial_principal(request: Request) -> TrialPrincipal | None:
    """Resolve a trusted gateway identity or a verified Supabase user token.

    A browser may nominate a workspace, but never an actor or actor kind. The
    Postgres membership and RLS checks remain the authorization authority.
    """

    gateway_principal = _resolve_gateway_principal(request)
    if gateway_principal is not None:
        return gateway_principal

    workspace_id = _text(
        request.headers.get("x-supermega-workspace-id")
        or os.getenv("SUPERMEGA_TRIAL_DEFAULT_WORKSPACE_ID")
    )
    token = _bearer_token(request)
    if not token or not _IDENTIFIER.fullmatch(workspace_id):
        return None
    identity = verify_supabase_user_identity(token, SupabaseAuthConfig.from_environment())
    if identity is None or not _IDENTIFIER.fullmatch(identity.user_id):
        return None
    return TrialPrincipal(
        workspace_id=workspace_id,
        actor_id=identity.user_id,
        actor_kind="human",
        authenticated=True,
        session_id=identity.session_id,
        identity_provider="supabase",
    )


def resolve_workspace_discovery_principal(request: Request) -> TrialPrincipal | None:
    """Resolve a verified named user and session for workspace discovery."""

    token = _bearer_token(request)
    if not token:
        return None
    identity = verify_supabase_user_identity(token, SupabaseAuthConfig.from_environment())
    if identity is None or not _IDENTIFIER.fullmatch(identity.user_id):
        return None
    return TrialPrincipal(
        workspace_id="workspace-discovery",
        actor_id=identity.user_id,
        actor_kind="human",
        authenticated=True,
        session_id=identity.session_id,
        identity_provider="supabase",
    )


def resolve_self_serve_signup_session(request: Request) -> TrialSignupSession | None:
    """Resolve a verified named user for self-serve workspace creation.

    The caller has no workspace yet, so only the Supabase-confirmed identity,
    signed session, and email-verification state travel. The trial store
    derives the tenant identity from the claim code on the server side.
    """

    token = _bearer_token(request)
    if not token:
        return None
    identity = verify_supabase_user_identity(token, SupabaseAuthConfig.from_environment())
    if identity is None or not _IDENTIFIER.fullmatch(identity.user_id):
        return None
    return TrialSignupSession(
        actor_id=identity.user_id,
        session_id=identity.session_id,
        email_verified=identity.email_verified,
        identity_provider="supabase",
        email=identity.email,
    )


def _activation_requirements(*, database_ready: bool, role_ready: bool, schema_ready: bool, audit_ready: bool) -> list[str]:
    requirements: list[str] = []
    if not _text(os.getenv("SUPERMEGA_DATABASE_URL")):
        requirements.append("Configure a dedicated, non-BYPASSRLS managed Postgres connection.")
    elif not database_ready:
        requirements.append("Restore the managed Postgres connection and server-only driver.")
    if database_ready and not role_ready:
        requirements.append("Use an encrypted, dedicated non-BYPASSRLS login with only the trial backend role.")
    if not schema_ready:
        requirements.append("Apply and verify the private trial schema on a non-production branch first.")
    identity_secret = _text(os.getenv("SUPERMEGA_TRIAL_IDENTITY_SECRET"))
    gateway_ready = _identity_secret_ready(identity_secret)
    supabase_auth_ready = SupabaseAuthConfig.from_environment().ready
    if identity_secret and not gateway_ready and not supabase_auth_ready:
        requirements.append(
            "Replace the identity signing secret with at least 32 bytes of high-entropy, non-placeholder key material."
        )
    elif not gateway_ready and not supabase_auth_ready:
        requirements.append("Configure trusted gateway signing or Supabase named-user authentication.")
    if not audit_ready:
        requirements.append("Verify immutable audit-event insert access through the runtime role.")
    if not _flag("SUPERMEGA_TRIAL_WRITES_ENABLED"):
        requirements.append("Enable trial writes only after RLS, recovery, and acceptance tests pass.")
    return requirements


def _activation_steps(
    *,
    database_ready: bool,
    role_ready: bool,
    schema_ready: bool,
    security_ready: bool,
    audit_ready: bool,
    writes_ready: bool,
) -> list[dict[str, Any]]:
    return [
        {
            "id": "database",
            "label": "Database",
            "ready": database_ready,
            "action": "Provision a dedicated, non-BYPASSRLS managed Postgres connection.",
        },
        {
            "id": "role",
            "label": "Role",
            "ready": database_ready and role_ready,
            "action": "Use an encrypted, dedicated non-BYPASSRLS login with only the trial backend role.",
        },
        {
            "id": "schema",
            "label": "Schema",
            "ready": database_ready and schema_ready,
            "action": "Apply and verify the private trial schema before enabling customer writes.",
        },
        {
            "id": "identity",
            "label": "Identity",
            "ready": security_ready,
            "action": "Configure trusted gateway signing or Supabase named-user authentication.",
        },
        {
            "id": "audit",
            "label": "Audit",
            "ready": database_ready and audit_ready,
            "action": "Verify immutable audit-event insert access through the runtime role.",
        },
        {
            "id": "writes",
            "label": "Writes",
            "ready": database_ready and role_ready and schema_ready and security_ready and audit_ready and writes_ready,
            "action": "Enable trial writes only after RLS, recovery, and acceptance tests pass.",
        },
    ]


def _activation_evidence_plan(
    *,
    database_ready: bool,
    role_ready: bool,
    schema_ready: bool,
    security_ready: bool,
    audit_ready: bool,
    writes_ready: bool,
) -> list[dict[str, Any]]:
    return [
        {
            "id": "postgres17_rehearsal",
            "label": "Postgres 17 rehearsal",
            "ready": database_ready and role_ready and schema_ready,
            "proof": "Run the private trial migration rehearsal and keep the read-only validator output.",
            "verifier": "node tools/run_postgres17_rehearsal.mjs",
        },
        {
            "id": "runtime_role_audit",
            "label": "Runtime role audit",
            "ready": database_ready and role_ready and audit_ready,
            "proof": "Prove the runtime login is non-BYPASSRLS, TLS-backed, role-scoped, and can append immutable audit events.",
            "verifier": "python tools/validate_supermega_database_url.py --read-only",
        },
        {
            "id": "identity_gateway",
            "label": "Identity gateway",
            "ready": security_ready,
            "proof": "Show trusted gateway signing or Supabase named-user verification with no browser privileged credential.",
            "verifier": "node tools/verify_app_security_contract.mjs",
        },
        {
            "id": "storage_privacy",
            "label": "Storage privacy",
            "ready": database_ready and audit_ready,
            "proof": "Run the bounded private-storage privacy proof with redacted output and no persistent mutation.",
            "verifier": "npm run storage:privacy:self-test",
        },
        {
            "id": "write_acceptance",
            "label": "Write acceptance",
            "ready": database_ready and role_ready and schema_ready and security_ready and audit_ready and writes_ready,
            "proof": "Enable writes only after managed Shop, Plant, Website, Ecommerce, recovery, RLS, and human-approval acceptance tests pass.",
            "verifier": "npm run app:verify",
        },
    ]


def _activation_manifest(
    *,
    operating_mode: str,
    activation_steps: list[dict[str, Any]],
    evidence_plan: list[dict[str, Any]],
    requirements: list[str],
    coverage_score: int,
) -> dict[str, Any]:
    blocked_steps = [str(step["id"]) for step in activation_steps if not step["ready"]]
    next_step = next((step for step in activation_steps if not step["ready"]), None)
    proof_commands = {str(item["id"]): str(item["verifier"]) for item in evidence_plan}
    safe_enable: list[str] = ["browser_local_trial", "evidence_export"]
    if not requirements:
        safe_enable.extend(["managed_workspace_login", "managed_trial_writes"])
    return {
        "contract": "supermega.activation_manifest.v1",
        "mode": operating_mode,
        "ready_percent": coverage_score,
        "next_action": str(next_step["action"]) if next_step else "Managed activation is ready for paid workspaces.",
        "blocked_gate_ids": blocked_steps,
        "proof_commands": proof_commands,
        "safe_enable": safe_enable,
        "automation_boundary": "Agents may prepare evidence and drafts; customer writes, payments, messages, deployments, and production changes require managed controls plus human approval.",
        "secret_values_exposed": False,
    }


def _import_provisioning_readiness(
    *,
    database_ready: bool,
    role_ready: bool,
    schema_ready: bool,
    security_ready: bool,
    audit_ready: bool,
    writes_ready: bool,
) -> dict[str, Any]:
    checks = [
        {
            "id": "managed_identity_confirmed",
            "label": "Managed identity",
            "ready": security_ready,
            "action": "Verify trusted gateway or Supabase named-user identity before import approval.",
        },
        {
            "id": "private_workspace_schema",
            "label": "Private workspace schema",
            "ready": database_ready and role_ready and schema_ready,
            "action": "Apply the private trial schema with a non-BYPASSRLS runtime role.",
        },
        {
            "id": "zero_write_validation_receipt",
            "label": "Zero-write validation",
            "ready": database_ready and role_ready and schema_ready and audit_ready,
            "action": "Run the managed import validation endpoint and prove external_writes_performed is false.",
        },
        {
            "id": "owner_import_approval",
            "label": "Owner approval",
            "ready": security_ready and audit_ready,
            "action": "Capture a named owner approval before any import apply request.",
        },
        {
            "id": "atomic_adapter_receipt",
            "label": "Atomic adapter",
            "ready": database_ready and role_ready and schema_ready and audit_ready and writes_ready,
            "action": "Confirm the product adapter can create one idempotent managed revision.",
        },
        {
            "id": "durable_revision_confirmation",
            "label": "Durable revision",
            "ready": database_ready and role_ready and schema_ready and audit_ready and writes_ready,
            "action": "Read back workspace state after apply and compare the revision digest.",
        },
    ]
    ready = all(item["ready"] for item in checks)
    return {
        "contract": "supermega.import_provisioning_readiness.v1",
        "status": "ready" if ready else "blocked",
        "ready": ready,
        "checks": checks,
        "forbidden_until_ready": [
            "copy_browser_storage_to_production",
            "customer_message_send",
            "payment_capture",
            "domain_publish",
            "scheduler_autopilot",
        ],
        "next_action": (
            "Import provisioning is ready for one reviewed managed workspace."
            if ready
            else "Validate a staged client import package inside a managed workspace before any activation write."
        ),
        "secret_values_exposed": False,
    }


def _ecommerce_order_queue_packet(value: object) -> Mapping[str, Any]:
    packet_keys = [
        "schema",
        "version",
        "generatedAt",
        "product",
        "storeName",
        "sourceReview",
        "readiness",
        "requiredControls",
        "forbiddenUntilReady",
    ]
    source_keys = [
        "schema",
        "generatedAt",
        "operatingMode",
        "catalogSource",
        "selectedSkus",
        "totalRows",
        "readyRows",
        "blockedRows",
    ]
    readiness_keys = ["status", "nextAction"]
    if not _is_record(value):
        raise ValueError("Ecommerce order queue packet must be an object.")
    packet = value
    source_review = packet.get("sourceReview")
    readiness = packet.get("readiness")
    selected_skus = source_review.get("selectedSkus") if _is_record(source_review) else None
    if (
        not _exact_keys(packet, packet_keys)
        or packet.get("schema") != _ECOMMERCE_ORDER_QUEUE_READINESS_PACKET_SCHEMA
        or packet.get("version") != 1
        or not _iso_timestamp(packet.get("generatedAt"))
        or packet.get("product") != "ecommerce"
        or not _canonical_text(packet.get("storeName"), 60)
        or not _is_record(source_review)
        or not _exact_keys(source_review, source_keys)
        or source_review.get("schema") != _ECOMMERCE_ORDER_IMPORT_REVIEW_PACKET_SCHEMA
        or not _iso_timestamp(source_review.get("generatedAt"))
        or source_review.get("operatingMode") not in {"browser_local_trial", "managed_trial"}
        or source_review.get("catalogSource") not in {"shop-local", "sample", "unavailable", "managed-shop"}
        or not isinstance(selected_skus, list)
        or len(selected_skus) > 8
        or not all(_canonical_text(item, 80) for item in selected_skus)
        or not _safe_non_negative_integer(source_review.get("totalRows"))
        or not _safe_non_negative_integer(source_review.get("readyRows"))
        or not _safe_non_negative_integer(source_review.get("blockedRows"))
        or not _is_record(readiness)
        or not _exact_keys(readiness, readiness_keys)
        or readiness.get("status") not in {"ready_for_support", "blocked_for_repair"}
        or not _canonical_text(readiness.get("nextAction"), 160)
        or not _same_string_array(packet.get("requiredControls"), _ECOMMERCE_ORDER_QUEUE_REQUIRED_CONTROLS)
        or not _same_string_array(packet.get("forbiddenUntilReady"), _ECOMMERCE_ORDER_QUEUE_FORBIDDEN_UNTIL_APPLIED)
    ):
        raise ValueError("Ecommerce order queue readiness packet failed validation.")
    total_rows = int(source_review["totalRows"])
    ready_rows = int(source_review["readyRows"])
    blocked_rows = int(source_review["blockedRows"])
    if ready_rows + blocked_rows != total_rows:
        raise ValueError("Ecommerce order queue readiness packet row counts do not reconcile.")
    if readiness["status"] == "ready_for_support" and blocked_rows != 0:
        raise ValueError("Ready Ecommerce order queue packets cannot include blocked rows.")
    if readiness["status"] == "blocked_for_repair" and blocked_rows == 0:
        raise ValueError("Blocked Ecommerce order queue packets must include blocked rows.")
    return packet


def _ecommerce_order_queue_validation(packet: Mapping[str, Any], workspace_id: str) -> dict[str, Any]:
    source_review = packet["sourceReview"]
    readiness = packet["readiness"]
    row_count = int(source_review["totalRows"])
    ready_rows = int(source_review["readyRows"])
    blocked_rows = int(source_review["blockedRows"])
    source_ready = (
        readiness["status"] == "ready_for_support"
        and blocked_rows == 0
        and row_count > 0
        and len(source_review["selectedSkus"]) > 0
        and source_review["catalogSource"] != "unavailable"
    )
    return {
        "contract": _ECOMMERCE_ORDER_QUEUE_VALIDATION_CONTRACT,
        "status": "ready_for_owner_review" if source_ready else "blocked",
        "workspace_id": workspace_id,
        "product": "ecommerce",
        "target_surface": "commerce",
        "required_capability": "commerce.write",
        "packet_schema": _ECOMMERCE_ORDER_QUEUE_READINESS_PACKET_SCHEMA,
        "row_count": row_count,
        "ready_rows": ready_rows,
        "blocked_rows": blocked_rows,
        "required_controls": list(_ECOMMERCE_ORDER_QUEUE_REQUIRED_CONTROLS),
        "forbidden_until_applied": list(_ECOMMERCE_ORDER_QUEUE_FORBIDDEN_UNTIL_APPLIED),
        "human_approval_required": True,
        "external_writes_performed": False,
        "next_step": (
            "Owner reviews this zero-write receipt, then support may prepare one managed Shop queue import approval."
            if source_ready
            else "Repair packet rows, controls, catalog source, or evidence before managed queue approval."
        ),
    }


def _ecommerce_order_queue_owner_approval_packet(value: object) -> Mapping[str, Any]:
    packet_keys = [
        "contract",
        "version",
        "createdAt",
        "product",
        "workspaceId",
        "storeName",
        "queuePacketSchema",
        "validationContract",
        "validationStatus",
        "targetSurface",
        "requiredCapability",
        "rowCount",
        "readyRows",
        "blockedRows",
        "selectedSkus",
        "sourceEvidence",
        "ownerDecision",
        "ownerApprovalRequired",
        "forbiddenUntilApproved",
        "externalWritesPerformed",
        "nextAction",
    ]
    source_keys = ["sourceReviewGeneratedAt", "sourceCatalog", "sourceMessagesRetained"]
    if not _is_record(value):
        raise ValueError("Ecommerce owner approval packet must be an object.")
    packet = value
    source = packet.get("sourceEvidence")
    selected_skus = packet.get("selectedSkus")
    if (
        not _exact_keys(packet, packet_keys)
        or packet.get("contract") != _ECOMMERCE_ORDER_QUEUE_OWNER_APPROVAL_CONTRACT
        or packet.get("version") != 1
        or not _iso_timestamp(packet.get("createdAt"))
        or packet.get("product") != "ecommerce"
        or not _canonical_text(packet.get("workspaceId"), 128)
        or not _canonical_text(packet.get("storeName"), 60)
        or packet.get("queuePacketSchema") != _ECOMMERCE_ORDER_QUEUE_READINESS_PACKET_SCHEMA
        or packet.get("validationContract") != _ECOMMERCE_ORDER_QUEUE_VALIDATION_CONTRACT
        or packet.get("validationStatus") not in {"ready_for_owner_review", "blocked"}
        or packet.get("targetSurface") != "commerce"
        or packet.get("requiredCapability") != "commerce.write"
        or not _safe_non_negative_integer(packet.get("rowCount"))
        or not _safe_non_negative_integer(packet.get("readyRows"))
        or not _safe_non_negative_integer(packet.get("blockedRows"))
        or not isinstance(selected_skus, list)
        or len(selected_skus) > 8
        or not all(_canonical_text(item, 80) for item in selected_skus)
        or not _is_record(source)
        or not _exact_keys(source, source_keys)
        or not _iso_timestamp(source.get("sourceReviewGeneratedAt"))
        or source.get("sourceCatalog") not in {"shop-local", "sample", "unavailable", "managed-shop"}
        or source.get("sourceMessagesRetained") is not True
        or not _canonical_text(packet.get("ownerDecision"), 240)
        or packet.get("ownerApprovalRequired") is not True
        or not _same_string_array(packet.get("forbiddenUntilApproved"), _ECOMMERCE_ORDER_QUEUE_FORBIDDEN_UNTIL_APPLIED)
        or packet.get("externalWritesPerformed") is not False
        or not _canonical_text(packet.get("nextAction"), 180)
    ):
        raise ValueError("Ecommerce owner approval packet failed validation.")
    row_count = int(packet["rowCount"])
    ready_rows = int(packet["readyRows"])
    blocked_rows = int(packet["blockedRows"])
    if ready_rows + blocked_rows != row_count:
        raise ValueError("Ecommerce owner approval packet row counts do not reconcile.")
    if packet["validationStatus"] == "ready_for_owner_review" and blocked_rows != 0:
        raise ValueError("Ready Ecommerce owner approval packets cannot include blocked rows.")
    return packet


def _ecommerce_order_queue_import_plan(
    queue_packet: Mapping[str, Any],
    approval_packet: Mapping[str, Any],
    workspace_id: str,
) -> dict[str, Any]:
    validation = _ecommerce_order_queue_validation(queue_packet, workspace_id)
    source_review = queue_packet["sourceReview"]
    mismatch = (
        approval_packet["workspaceId"] != workspace_id
        or approval_packet["storeName"] != queue_packet["storeName"]
        or approval_packet["queuePacketSchema"] != queue_packet["schema"]
        or approval_packet["validationContract"] != validation["contract"]
        or approval_packet["validationStatus"] != validation["status"]
        or approval_packet["targetSurface"] != validation["target_surface"]
        or approval_packet["requiredCapability"] != validation["required_capability"]
        or approval_packet["rowCount"] != validation["row_count"]
        or approval_packet["readyRows"] != validation["ready_rows"]
        or approval_packet["blockedRows"] != validation["blocked_rows"]
        or approval_packet["selectedSkus"] != source_review["selectedSkus"]
        or approval_packet["sourceEvidence"]["sourceReviewGeneratedAt"] != source_review["generatedAt"]
        or approval_packet["sourceEvidence"]["sourceCatalog"] != source_review["catalogSource"]
    )
    if mismatch:
        raise ValueError("Ecommerce owner approval packet does not match the queue readiness receipt.")
    import_ready = validation["status"] == "ready_for_owner_review" and approval_packet["blockedRows"] == 0
    digest_source = json.dumps(
        {
            "workspace_id": workspace_id,
            "store_name": queue_packet["storeName"],
            "generated_at": queue_packet["generatedAt"],
            "source_review_generated_at": source_review["generatedAt"],
            "ready_rows": approval_packet["readyRows"],
            "selected_skus": approval_packet["selectedSkus"],
            "owner_decision": approval_packet["ownerDecision"],
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    digest = hashlib.sha256(digest_source.encode("utf-8")).hexdigest()
    return {
        "contract": _ECOMMERCE_ORDER_QUEUE_IMPORT_PLAN_CONTRACT,
        "status": "ready_for_managed_apply" if import_ready else "blocked",
        "workspace_id": workspace_id,
        "product": "ecommerce",
        "target_surface": "commerce",
        "target_adapter": "shop_order_queue",
        "required_capability": "commerce.write",
        "idempotency_key": f"ecommerce-shop-queue:{digest[:24]}",
        "plan_digest": f"sha256:{digest}",
        "store_name": queue_packet["storeName"],
        "row_count": approval_packet["rowCount"],
        "ready_rows": approval_packet["readyRows"],
        "blocked_rows": approval_packet["blockedRows"],
        "selected_skus": list(approval_packet["selectedSkus"]),
        "required_controls": list(_ECOMMERCE_ORDER_QUEUE_REQUIRED_CONTROLS),
        "required_approval_contract": _ECOMMERCE_ORDER_QUEUE_OWNER_APPROVAL_CONTRACT,
        "external_writes_performed": False,
        "forbidden_until_applied": list(_ECOMMERCE_ORDER_QUEUE_FORBIDDEN_UNTIL_APPLIED),
        "apply_boundary": (
            "This is a plan only. Apply requires a decided human approval record, managed Postgres/RLS, audit, scheduler proof, and an idempotent commerce.write command."
        ),
        "next_step": (
            "Support may prepare one idempotent managed Shop queue import command from this plan after owner approval is decided."
            if import_ready
            else "Repair blocked rows or approval evidence before preparing a managed Shop queue import command."
        ),
    }


def _ecommerce_order_queue_import_plan_packet(value: object) -> Mapping[str, Any]:
    plan_keys = [
        "contract",
        "status",
        "workspace_id",
        "product",
        "target_surface",
        "target_adapter",
        "required_capability",
        "idempotency_key",
        "plan_digest",
        "store_name",
        "row_count",
        "ready_rows",
        "blocked_rows",
        "selected_skus",
        "required_controls",
        "required_approval_contract",
        "external_writes_performed",
        "forbidden_until_applied",
        "apply_boundary",
        "next_step",
    ]
    if not _is_record(value):
        raise ValueError("Ecommerce Shop queue import plan must be an object.")
    plan = value
    selected_skus = plan.get("selected_skus")
    if (
        not _exact_keys(plan, plan_keys)
        or plan.get("contract") != _ECOMMERCE_ORDER_QUEUE_IMPORT_PLAN_CONTRACT
        or plan.get("status") not in {"ready_for_managed_apply", "blocked"}
        or not _canonical_text(plan.get("workspace_id"), 128)
        or plan.get("product") != "ecommerce"
        or plan.get("target_surface") != "commerce"
        or plan.get("target_adapter") != "shop_order_queue"
        or plan.get("required_capability") != "commerce.write"
        or not isinstance(plan.get("idempotency_key"), str)
        or not str(plan["idempotency_key"]).startswith("ecommerce-shop-queue:")
        or not isinstance(plan.get("plan_digest"), str)
        or not str(plan["plan_digest"]).startswith("sha256:")
        or len(str(plan["plan_digest"])) != 71
        or not _canonical_text(plan.get("store_name"), 60)
        or not _safe_non_negative_integer(plan.get("row_count"))
        or not _safe_non_negative_integer(plan.get("ready_rows"))
        or not _safe_non_negative_integer(plan.get("blocked_rows"))
        or not isinstance(selected_skus, list)
        or len(selected_skus) > 8
        or not all(_canonical_text(item, 80) for item in selected_skus)
        or not _same_string_array(plan.get("required_controls"), _ECOMMERCE_ORDER_QUEUE_REQUIRED_CONTROLS)
        or plan.get("required_approval_contract") != _ECOMMERCE_ORDER_QUEUE_OWNER_APPROVAL_CONTRACT
        or plan.get("external_writes_performed") is not False
        or not _same_string_array(plan.get("forbidden_until_applied"), _ECOMMERCE_ORDER_QUEUE_FORBIDDEN_UNTIL_APPLIED)
        or not _canonical_text(plan.get("apply_boundary"), 240)
        or not _canonical_text(plan.get("next_step"), 180)
    ):
        raise ValueError("Ecommerce Shop queue import plan failed validation.")
    if int(plan["ready_rows"]) + int(plan["blocked_rows"]) != int(plan["row_count"]):
        raise ValueError("Ecommerce Shop queue import plan row counts do not reconcile.")
    if plan["status"] == "ready_for_managed_apply" and int(plan["blocked_rows"]) != 0:
        raise ValueError("Ready Ecommerce Shop queue import plans cannot include blocked rows.")
    return plan


def _ecommerce_order_queue_identity(request: Request, body: Mapping[str, Any]) -> tuple[str, str]:
    try:
        principal = resolve_trial_principal(request)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="trial_auth_unavailable") from exc
    if principal is not None:
        workspace_id = principal.workspace_id
        body_workspace_id = _text(body.get("workspace_id"))
        if body_workspace_id and body_workspace_id != workspace_id:
            raise HTTPException(status_code=403, detail="workspace_id does not match trusted identity.")
        return workspace_id, "trusted_managed_identity"
    identity_secret = _text(os.getenv("SUPERMEGA_TRIAL_IDENTITY_SECRET"))
    if identity_secret or SupabaseAuthConfig.from_environment().ready:
        raise HTTPException(status_code=401, detail="trial_auth_required")
    workspace_id = _text(body.get("workspace_id") or request.headers.get("x-supermega-workspace-id"))
    if not _canonical_text(workspace_id, 128):
        raise HTTPException(status_code=400, detail="workspace_id is required.")
    return workspace_id, "isolated_demo_untrusted_workspace"


def _ecommerce_order_queue_managed_principal(request: Request) -> TrialPrincipal:
    try:
        principal = resolve_trial_principal(request)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="trial_auth_unavailable") from exc
    if principal is None:
        raise HTTPException(status_code=401, detail="trial_auth_required")
    return principal.normalized()


def _ecommerce_order_queue_apply_preflight(
    *,
    plan: Mapping[str, Any],
    approval_id: str,
    approval_records: list[Any],
    workspace_id: str,
) -> dict[str, Any]:
    if plan["workspace_id"] != workspace_id:
        raise ValueError("Ecommerce Shop queue import plan workspace does not match trusted identity.")
    if plan["status"] != "ready_for_managed_apply":
        raise ValueError("Ecommerce Shop queue import plan is not ready for managed apply.")
    approval = next((record for record in approval_records if record.approval_id == approval_id), None)
    if approval is None:
        raise ValueError("Approved Ecommerce queue owner decision was not found.")
    proposal = approval.proposal
    subject = proposal.get("subject") if isinstance(proposal, dict) else None
    claims = proposal.get("claims") if isinstance(proposal, dict) else None
    claim_sources = [
        claim.get("source_reference")
        for claim in claims
        if isinstance(claim, dict) and isinstance(claim.get("source_reference"), str)
    ] if isinstance(claims, list) else []
    if (
        approval.status != "approved"
        or approval.decided_actor_kind != "human"
        or not approval.decided_by
        or not approval.decision_note
        or not isinstance(subject, dict)
        or subject.get("kind") != "ecommerce_order_queue"
        or subject.get("id") != plan["store_name"]
        or plan["required_approval_contract"] != _ECOMMERCE_ORDER_QUEUE_OWNER_APPROVAL_CONTRACT
        or not any("order-approval" in source for source in claim_sources)
    ):
        raise ValueError("Ecommerce queue import requires a matching approved human owner decision.")
    return {
        "contract": "supermega.ecommerce.shop_queue_apply_preflight.v1",
        "status": "ready_for_idempotent_apply",
        "workspace_id": workspace_id,
        "approval_id": approval.approval_id,
        "approved_by": approval.decided_by,
        "approved_at": approval.decided_at,
        "plan_digest": plan["plan_digest"],
        "idempotency_key": plan["idempotency_key"],
        "required_capability": "commerce.write",
        "target_adapter": "shop_order_queue",
        "external_writes_performed": False,
        "apply_boundary": "Preflight only. The next command must be a human-authenticated, idempotent commerce.write apply using this plan digest.",
        "next_step": "Submit exactly one managed apply command with this digest, approval id, and idempotency key after final operator review.",
    }


def create_app() -> FastAPI:
    database_url = _text(os.getenv("SUPERMEGA_DATABASE_URL"))
    store = PostgresTrialStore(
        database_url,
        reducer=reduce_trial_state,
        write_enabled=_flag("SUPERMEGA_TRIAL_WRITES_ENABLED"),
    )
    try:
        order_intake_provider = order_intake_provider_from_environment()
    except OrderIntakeProviderError:
        order_intake_provider = None
    app = FastAPI(
        title="SuperMega Service",
        version=SERVICE_VERSION,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    origins = _cors_origins(os.getenv("SUPERMEGA_CORS_ORIGINS"))
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=[
            "accept",
            "authorization",
            "content-type",
            "x-supermega-workspace-id",
            "x-supermega-actor-id",
            "x-supermega-actor-kind",
            "x-supermega-identity-timestamp",
            "x-supermega-identity-signature",
            "traceparent",
            "tracestate",
        ],
    )

    # OpenTelemetry Phase A (local-only; see
    # hq/research/opentelemetry-implementation-plan-2026-08.md). Additive
    # instrumentation only: every step inside `instrument_telemetry` is
    # individually defensive and degrades to a no-op rather than breaking
    # app startup or request handling if a dependency is missing or
    # disabled. Must run before other middleware registration so the
    # customer-content scope wraps the full request lifecycle.
    try:
        instrument_telemetry(app)
    except Exception:  # pragma: no cover - instrumentation must never break the API
        logging.getLogger("supermega.telemetry").exception(
            "supermega.telemetry: instrumentation failed to attach; continuing without tracing."
        )

    @app.middleware("http")
    async def api_security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("cache-control", "no-store")
        response.headers.setdefault("x-content-type-options", "nosniff")
        response.headers.setdefault("x-frame-options", "DENY")
        response.headers.setdefault("referrer-policy", "no-referrer")
        response.headers.setdefault("permissions-policy", "camera=(), microphone=(), geolocation=()")
        return response

    @app.get("/api/health")
    def health() -> dict[str, Any]:
        release_commit_value = str(os.getenv("VERCEL_GIT_COMMIT_SHA") or "").strip().lower()
        release_commit = release_commit_value if re.fullmatch(r"[0-9a-f]{40}", release_commit_value) else None
        readiness = store.readiness(None)
        enterprise_db_ready = readiness.database_ready and readiness.role_ready and readiness.schema_ready and readiness.audit_ready
        gateway_ready = _identity_secret_ready(os.getenv("SUPERMEGA_TRIAL_IDENTITY_SECRET"))
        supabase_auth_ready = SupabaseAuthConfig.from_environment().ready
        security_ready = gateway_ready or supabase_auth_ready
        requirements = _activation_requirements(
            database_ready=readiness.database_ready,
            role_ready=readiness.role_ready,
            schema_ready=readiness.schema_ready,
            audit_ready=readiness.audit_ready,
        )
        activation_steps = _activation_steps(
            database_ready=readiness.database_ready,
            role_ready=readiness.role_ready,
            schema_ready=readiness.schema_ready,
            security_ready=security_ready,
            audit_ready=readiness.audit_ready,
            writes_ready=readiness.write_enabled,
        )
        evidence_plan = _activation_evidence_plan(
            database_ready=readiness.database_ready,
            role_ready=readiness.role_ready,
            schema_ready=readiness.schema_ready,
            security_ready=security_ready,
            audit_ready=readiness.audit_ready,
            writes_ready=readiness.write_enabled,
        )
        coverage_score = round(
            sum(1 for step in activation_steps if step["ready"]) / len(activation_steps) * 100
        )
        operating_mode = "managed_trial" if not requirements else "isolated_demo"
        activation_manifest = _activation_manifest(
            operating_mode=operating_mode,
            activation_steps=activation_steps,
            evidence_plan=evidence_plan,
            requirements=requirements,
            coverage_score=coverage_score,
        )
        import_provisioning = _import_provisioning_readiness(
            database_ready=readiness.database_ready,
            role_ready=readiness.role_ready,
            schema_ready=readiness.schema_ready,
            security_ready=security_ready,
            audit_ready=readiness.audit_ready,
            writes_ready=readiness.write_enabled,
        )
        return {
            "status": "ready",
            "service": SERVICE_NAME,
            "version": SERVICE_VERSION,
            "commit": release_commit,
            "operating_mode": operating_mode,
            "enterprise_db_ready": enterprise_db_ready,
            "security_ready": security_ready,
            "authentication": {
                "trusted_gateway_ready": gateway_ready,
                "supabase_user_tokens_ready": supabase_auth_ready,
                "anonymous_users_allowed": False,
                "client_asserted_roles_allowed": False,
            },
            "browser_origin_policy": {
                "strict_exact_origins": True,
                "configured_origin_count": len(origins),
                "wildcards_allowed": False,
                "insecure_remote_origins_allowed": False,
            },
            "coverage_score": coverage_score,
            "trial_backend": {
                "database_ready": readiness.database_ready,
                "role_ready": readiness.role_ready,
                "schema_ready": readiness.schema_ready,
                "audit_ready": readiness.audit_ready,
                "write_enabled": readiness.write_enabled,
                "browser_service_role_exposed": False,
            },
            "ai": {
                "order_intake_configured": order_intake_provider is not None,
                "browser_api_key_exposed": False,
                "operational_actions_allowed": False,
            },
            "enterprise_activation": {
                "status": "ready" if not requirements else "attention",
                "requirements": requirements,
                "steps": activation_steps,
                "evidence_plan": evidence_plan,
                "evidence_ready": all(item["ready"] for item in evidence_plan),
                "manifest": activation_manifest,
                "import_provisioning": import_provisioning,
                "secret_values_exposed": False,
            },
        }

    @app.get("/api/trial/v1/workspaces")
    def discover_managed_workspaces(request: Request) -> dict[str, Any]:
        principal = resolve_workspace_discovery_principal(request)
        if principal is None:
            raise HTTPException(
                status_code=401,
                detail={"code": "managed_auth_required", "message": "Sign in with a managed account."},
            )
        try:
            workspaces, truncated = store.list_actor_workspaces(principal, limit=50)
        except TrialNotReadyError as exc:
            raise HTTPException(
                status_code=503,
                detail={"code": "workspace_directory_not_ready", "blockers": list(exc.reasons)},
            ) from exc
        return {
            "contract": "supermega.managed_workspace_directory.v1",
            "status": "ready",
            "workspaces": [workspace.to_dict() for workspace in workspaces],
            "truncated": truncated,
            "external_writes_performed": False,
            "secret_values_exposed": False,
        }

    @app.post("/api/trial/v1/ecommerce/order-queue/validate")
    async def validate_ecommerce_order_queue(request: Request) -> dict[str, Any]:
        try:
            body = await request.json()
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Request body must be JSON.") from exc
        if not isinstance(body, dict):
            raise HTTPException(status_code=400, detail="Request body must be an object.")
        workspace_id, identity_authority = _ecommerce_order_queue_identity(request, body)
        if not _is_record(body.get("packet")):
            raise HTTPException(status_code=400, detail="packet is required.")
        try:
            packet = _ecommerce_order_queue_packet(body["packet"])
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        validation = _ecommerce_order_queue_validation(packet, workspace_id)
        return {
            "status": "ready",
            "validation": validation,
            "identity_authority": identity_authority,
            "external_writes_performed": False,
            "secret_values_exposed": False,
        }

    @app.post("/api/trial/v1/ecommerce/order-queue/import-plan")
    async def plan_ecommerce_order_queue_import(request: Request) -> dict[str, Any]:
        try:
            body = await request.json()
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Request body must be JSON.") from exc
        if not isinstance(body, dict):
            raise HTTPException(status_code=400, detail="Request body must be an object.")
        workspace_id, identity_authority = _ecommerce_order_queue_identity(request, body)
        if not _is_record(body.get("packet")):
            raise HTTPException(status_code=400, detail="packet is required.")
        if not _is_record(body.get("approval_packet")):
            raise HTTPException(status_code=400, detail="approval_packet is required.")
        try:
            packet = _ecommerce_order_queue_packet(body["packet"])
            approval_packet = _ecommerce_order_queue_owner_approval_packet(body["approval_packet"])
            plan = _ecommerce_order_queue_import_plan(packet, approval_packet, workspace_id)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return {
            "status": "ready",
            "plan": plan,
            "identity_authority": identity_authority,
            "external_writes_performed": False,
            "secret_values_exposed": False,
        }

    @app.post("/api/trial/v1/ecommerce/order-queue/apply-preflight")
    async def preflight_ecommerce_order_queue_apply(request: Request) -> dict[str, Any]:
        try:
            body = await request.json()
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Request body must be JSON.") from exc
        if not isinstance(body, dict):
            raise HTTPException(status_code=400, detail="Request body must be an object.")
        principal = _ecommerce_order_queue_managed_principal(request)
        readiness = store.readiness(principal)
        if not readiness.write_ready:
            raise HTTPException(status_code=503, detail={"code": "trial_not_ready", "blockers": list(readiness.blockers)})
        if "commerce.write" not in readiness.capabilities:
            raise HTTPException(status_code=403, detail={"code": "trial_capability_required", "required_capability": "commerce.write"})
        approval_id = _text(body.get("approval_id"))
        if not _IDENTIFIER.fullmatch(approval_id):
            raise HTTPException(status_code=400, detail="approval_id is required.")
        if not _is_record(body.get("plan")):
            raise HTTPException(status_code=400, detail="plan is required.")
        try:
            plan = _ecommerce_order_queue_import_plan_packet(body["plan"])
            approvals = store.list_approvals(principal, limit=100)
            preflight = _ecommerce_order_queue_apply_preflight(
                plan=plan,
                approval_id=approval_id,
                approval_records=approvals,
                workspace_id=principal.workspace_id,
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return {
            "status": "ready",
            "preflight": preflight,
            "identity_authority": "trusted_managed_identity",
            "external_writes_performed": False,
            "secret_values_exposed": False,
        }

    app.include_router(
        create_trial_router(
            store=store,
            resolve_principal=resolve_trial_principal,
            resolve_signup_session=resolve_self_serve_signup_session,
            order_intake_provider=order_intake_provider,
            send_welcome_email=send_self_serve_welcome_email,
        )
    )
    app.include_router(cloud_runtime_router)
    return app


app = create_app()


__all__ = [
    "app",
    "create_app",
    "reduce_trial_state",
    "resolve_self_serve_signup_session",
    "resolve_trial_principal",
]
