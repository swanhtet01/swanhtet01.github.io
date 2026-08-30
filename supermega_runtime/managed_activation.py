"""Fail-closed activation for one owner-approved managed SuperMega workspace."""

from __future__ import annotations

import argparse
from collections.abc import Callable, Mapping, Sequence
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
from typing import Any
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, urlopen
from uuid import NAMESPACE_URL, UUID, uuid5

from supermega_runtime.managed_context import validate_managed_ai_context_export
from supermega_runtime.trial_store import TrialValidationError


SOURCE_REQUEST_CONTRACT = "supermega.managed_trial_request.v1"
ACTIVATION_PLAN_CONTRACT = "supermega.managed_workspace_activation_plan.v1"
MULTI_PRODUCT_ACTIVATION_PLAN_CONTRACT = "supermega.managed_workspace_activation_plan.v2"
ACTIVATION_RECEIPT_CONTRACT = "supermega.managed_workspace_activation_receipt.v2"
ACTIVATION_REQUERY_EVIDENCE_CONTRACT = "supermega.managed_workspace_activation_requery_evidence.v2"
SUSPENSION_RECEIPT_CONTRACT = "supermega.managed_workspace_suspension_receipt.v2"
ACTIVATION_EVENT_RESULT_CONTRACT = "supermega.managed_workspace_activation_event.v1"
SUSPENSION_EVENT_RESULT_CONTRACT = "supermega.managed_workspace_suspension_event.v1"
ACTIVATION_AUTHORIZATION_CONTRACT = "supermega.managed_workspace_activation_authorization.v1"
# Production already carries the reviewed self-serve grants migration. New
# activation plans must bind to that exact schema and fail closed against the
# older v10 contract.
TRIAL_SCHEMA_VERSION = 11
MAX_INPUT_BYTES = 1024 * 1024
PLAN_TTL = timedelta(days=7)
AUTOMATIC_COMPENSATION_REASON = "Activation compensation after a downstream release gate failure."
LIVE_RELEASE_URL = "https://app.supermega.dev/__release.json"

_IDENTIFIER = re.compile(r"^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$")
_PROJECT_REF = re.compile(r"^[a-z0-9]{20}$")
_RELEASE_COMMIT = re.compile(r"^[0-9a-f]{40}$")
_SHA256 = re.compile(r"^sha256:[0-9a-f]{64}$")
_PRODUCT_ALIASES = {
    "commerce": "shop",
    "shop": "shop",
    "production": "plant",
    "plant": "plant",
    "website": "website",
    "ecommerce": "ecommerce",
}
_PRODUCT_BEHAVIOR = {
    "shop": "commerce",
    "plant": "production",
    "website": "website",
    "ecommerce": "ecommerce",
}
_BASE_OWNER_CAPABILITIES = frozenset(
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
_PRODUCT_CAPABILITIES = {
    "shop": frozenset({"commerce.read", "commerce.write"}),
    "plant": frozenset({"production.read", "production.write"}),
    "website": frozenset({"website.read", "website.write"}),
    "ecommerce": frozenset({"commerce.read", "commerce.write"}),
}
_REQUIRED_PROVISIONING_CONTROLS = frozenset(
    {
        "dedicated_postgres_rls",
        "trusted_identity_gateway",
        "private_storage",
        "audit_trail",
        "owner_write_approvals",
        "scheduler_budget_limits",
    }
)
_REQUIRED_FORBIDDEN_ACTIONS = frozenset(
    {
        "copy_browser_storage_to_production",
        "enable_hosted_scheduler",
        "send_customer_messages",
        "capture_payments",
        "publish_domains",
    }
)
_SECRET_FIELD = re.compile(r"password|secret|token|database.?url|service.?role.?key", re.IGNORECASE)
_PILOT_OUTCOME_STATUSES = frozenset({"collecting", "target_met", "improved", "unchanged", "regressed"})


class ManagedActivationError(ValueError):
    """Raised when activation evidence cannot support a safe operation."""


class ManagedActivationConflict(ManagedActivationError):
    """Raised when durable workspace state conflicts with an activation plan."""


def _canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"), sort_keys=True)


def _digest(value: object) -> str:
    return f"sha256:{sha256(_canonical_json(value).encode('utf-8')).hexdigest()}"


def _exact(value: object, keys: Sequence[str], label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping) or set(value) != set(keys):
        raise ManagedActivationError(f"{label} has an invalid shape.")
    return value


def _visible_text(value: object, label: str, maximum: int) -> str:
    if (
        not isinstance(value, str)
        or value != value.strip()
        or not value
        or len(value) > maximum
        or any(ord(character) < 32 or ord(character) == 127 for character in value)
    ):
        raise ManagedActivationError(f"{label} must be canonical visible text.")
    return value


def _identifier(value: object, label: str, maximum: int = 128) -> str:
    candidate = _visible_text(value, label, maximum)
    if not _IDENTIFIER.fullmatch(candidate):
        raise ManagedActivationError(f"{label} is invalid.")
    return candidate


def _approval_id(value: object, label: str) -> str:
    return _uuid(value, label)


def _uuid(value: object, label: str) -> str:
    candidate = _visible_text(value, label, 64)
    try:
        parsed = UUID(candidate)
    except ValueError as exc:
        raise ManagedActivationError(f"{label} must be a UUID.") from exc
    if str(parsed) != candidate.lower():
        raise ManagedActivationError(f"{label} must be a canonical UUID.")
    return str(parsed)


def _timestamp(value: object, label: str) -> datetime:
    candidate = _visible_text(value, label, 40)
    try:
        parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ManagedActivationError(f"{label} must be an ISO-8601 timestamp.") from exc
    if parsed.tzinfo is None:
        raise ManagedActivationError(f"{label} must include a timezone.")
    normalized = parsed.astimezone(timezone.utc)
    if normalized.isoformat(timespec="milliseconds").replace("+00:00", "Z") != candidate:
        raise ManagedActivationError(f"{label} must use canonical UTC millisecond precision.")
    return normalized


def _timestamp_text(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _count(value: object, label: str, *, minimum: int = 0, maximum: int = 1_000_000) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or not minimum <= value <= maximum:
        raise ManagedActivationError(f"{label} is outside the supported range.")
    return value


def _reject_embedded_secrets(value: object, path: str = "request") -> None:
    if isinstance(value, Mapping):
        for key, child in value.items():
            key_text = str(key)
            if _SECRET_FIELD.search(key_text) and isinstance(child, str) and child.strip():
                raise ManagedActivationError(f"{path}.{key_text} must not contain credential material.")
            _reject_embedded_secrets(child, f"{path}.{key_text}")
        return
    if isinstance(value, list):
        for index, child in enumerate(value):
            _reject_embedded_secrets(child, f"{path}[{index}]")
        return
    if isinstance(value, str) and value.strip().lower().startswith(("postgres://", "postgresql://")):
        raise ManagedActivationError(f"{path} must not contain a database URL.")


def _pilot_outcome_metric(value: object, label: str) -> dict[str, object]:
    metric = _exact(
        value,
        ("metricId", "label", "value", "unit", "better", "detail", "sourceDigest"),
        label,
    )
    normalized = {
        "metricId": _identifier(metric["metricId"], f"{label} ID", 80),
        "label": _visible_text(metric["label"], f"{label} label", 120),
        "value": _count(metric["value"], f"{label} value"),
        "unit": _visible_text(metric["unit"], f"{label} unit", 40),
        "better": metric["better"],
        "detail": _visible_text(metric["detail"], f"{label} detail", 300),
        "sourceDigest": _visible_text(metric["sourceDigest"], f"{label} source digest", 71),
    }
    if normalized["better"] != "lower" or not _SHA256.fullmatch(str(normalized["sourceDigest"])):
        raise ManagedActivationError(f"{label} direction or source digest is invalid.")
    return normalized


def _pilot_outcome_report(
    value: object,
    *,
    product: str,
    workspace: str,
    owner: str,
    template_id: str,
) -> dict[str, object]:
    report = _exact(
        value,
        (
            "contract",
            "version",
            "product",
            "workspace",
            "owner",
            "templateId",
            "checkpointDigest",
            "startedAt",
            "measuredAt",
            "baseline",
            "current",
            "outcomeStatus",
            "change",
            "recommendation",
            "review",
            "rawRecordsIncluded",
            "externalWritesPerformed",
            "reportDigest",
        ),
        "Pilot outcome report",
    )
    if report["contract"] != "supermega.pilot_outcome_report.v1" or report["version"] != 1:
        raise ManagedActivationError("Pilot outcome report contract is invalid.")
    report_product = _identifier(report["product"], "Pilot outcome product", 40)
    if _PRODUCT_ALIASES.get(report_product) != product:
        raise ManagedActivationError("Pilot outcome product changed.")
    report_workspace = _visible_text(report["workspace"], "Pilot outcome workspace", 80)
    report_owner = _visible_text(report["owner"], "Pilot outcome owner", 80)
    report_template = _identifier(report["templateId"], "Pilot outcome template", 120)
    if report_workspace != workspace or report_owner != owner or report_template != template_id:
        raise ManagedActivationError("Pilot outcome identity changed.")
    checkpoint_digest = _visible_text(report["checkpointDigest"], "Pilot outcome checkpoint digest", 71)
    report_digest = _visible_text(report["reportDigest"], "Pilot outcome report digest", 71)
    if not _SHA256.fullmatch(checkpoint_digest) or not _SHA256.fullmatch(report_digest):
        raise ManagedActivationError("Pilot outcome digest is invalid.")
    started = _timestamp(report["startedAt"], "Pilot outcome start timestamp")
    measured = _timestamp(report["measuredAt"], "Pilot outcome measurement timestamp")
    if measured < started:
        raise ManagedActivationError("Pilot outcome measurement predates its checkpoint.")
    baseline = _pilot_outcome_metric(report["baseline"], "Pilot outcome baseline")
    current = _pilot_outcome_metric(report["current"], "Pilot outcome current")
    if (
        baseline["metricId"] != current["metricId"]
        or baseline["label"] != current["label"]
        or baseline["unit"] != current["unit"]
        or baseline["better"] != current["better"]
    ):
        raise ManagedActivationError("Pilot outcome metric changed during the run.")
    status = _visible_text(report["outcomeStatus"], "Pilot outcome status", 24)
    if status not in _PILOT_OUTCOME_STATUSES:
        raise ManagedActivationError("Pilot outcome status is invalid.")
    changed_source = baseline["sourceDigest"] != current["sourceDigest"]
    expected_status = (
        "collecting"
        if not changed_source
        else "target_met"
        if current["value"] == 0
        else "improved"
        if current["value"] < baseline["value"]
        else "regressed"
        if current["value"] > baseline["value"]
        else "unchanged"
    )
    expected_recommendations = {
        "target_met": "Accept this clear result or continue the workflow to collect more evidence.",
        "improved": "Accept the measured improvement or continue until the product is clear.",
        "regressed": "Open the product and clear the new exceptions before accepting the pilot.",
        "unchanged": "Complete one consequential product step, then return for a fresh comparison.",
        "collecting": "Run one real product workflow. SuperMega will compare the next aggregate source revision automatically.",
    }
    recommendation = _visible_text(report["recommendation"], "Pilot outcome recommendation", 200)
    change = report["change"]
    if (
        isinstance(change, bool)
        or not isinstance(change, int)
        or change != current["value"] - baseline["value"]
        or status != expected_status
        or recommendation != expected_recommendations[status]
    ):
        raise ManagedActivationError("Pilot outcome result does not match its metrics.")
    review = _exact(
        report["review"],
        ("contract", "reportDigest", "reviewedBy", "reviewedAt", "decision"),
        "Pilot outcome review",
    )
    reviewed_at = _timestamp(review["reviewedAt"], "Pilot outcome review timestamp")
    if (
        review["contract"] != "supermega.local_pilot_outcome_review.v1"
        or review["reportDigest"] != report_digest
        or review["reviewedBy"] != owner
        or review["decision"] != "accepted"
        or measured != reviewed_at
        or status not in {"target_met", "improved"}
    ):
        raise ManagedActivationError("Pilot outcome lacks exact named-owner acceptance.")
    if report["rawRecordsIncluded"] is not False or report["externalWritesPerformed"] is not False:
        raise ManagedActivationError("Pilot outcome crossed its privacy or write boundary.")
    projection = [
        report["contract"],
        report["version"],
        report_product,
        report_workspace,
        report_owner,
        report_template,
        checkpoint_digest,
        report["startedAt"],
        list(baseline.values()),
        list(current.values()),
        status,
        change,
        recommendation,
        False,
        False,
    ]
    if _digest(projection) != report_digest:
        raise ManagedActivationError("Pilot outcome report digest does not match its evidence.")
    return deepcopy(dict(report))


def _source_request(value: object) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        raise ManagedActivationError("Managed trial request must be an object.")
    try:
        encoded = _canonical_json(value).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise ManagedActivationError("Managed trial request must be canonical JSON.") from exc
    if len(encoded) > MAX_INPUT_BYTES:
        raise ManagedActivationError("Managed trial request exceeds the 1 MiB activation limit.")
    _reject_embedded_secrets(value)
    if value.get("contract") != SOURCE_REQUEST_CONTRACT or value.get("version") != 1:
        raise ManagedActivationError("Managed trial request contract is invalid.")
    if value.get("pilotReady") is not True or value.get("noExternalSend") is not True:
        raise ManagedActivationError("Managed trial request is not owner-ready and no-send.")
    product_source = str(value.get("productSlug") or "").strip().lower()
    product = _PRODUCT_ALIASES.get(product_source)
    if product is None:
        raise ManagedActivationError("Managed trial product is unsupported.")
    workspace_label = _visible_text(value.get("workspace"), "Workspace label", 180)
    owner_label = _visible_text(value.get("owner"), "Owner label", 180)
    template_id = _identifier(value.get("templateId"), "Managed trial template", 120)
    if workspace_label.casefold() == "workspace not named" or owner_label.casefold() == "owner not assigned":
        raise ManagedActivationError("Managed trial request requires a named workspace and owner.")
    local_records = _count(value.get("localRecords"), "Local records", minimum=1)
    approval_packets = _count(value.get("approvalPackets"), "Approval packets", minimum=1)
    behavior_signals = _count(value.get("behaviorSignals"), "Behavior signals", minimum=1)
    pilot_outcome = _pilot_outcome_report(
        value.get("pilotOutcomeReport"),
        product=product,
        workspace=workspace_label,
        owner=owner_label,
        template_id=template_id,
    )
    try:
        approved_context = validate_managed_ai_context_export(value.get("approvedAiContext"))
    except TrialValidationError as exc:
        raise ManagedActivationError("Managed activation requires an exact owner-approved AI context export.") from exc
    context_counts = approved_context["sourceCounts"]
    context_behavior = approved_context["behaviorPreference"]
    context_outcome = approved_context["outcome"]
    context_owner_review = approved_context["ownerReview"]
    assert isinstance(context_counts, Mapping)
    assert isinstance(context_behavior, Mapping)
    assert isinstance(context_outcome, Mapping)
    assert isinstance(context_owner_review, Mapping)
    pilot_review = pilot_outcome["review"]
    assert isinstance(pilot_review, Mapping)
    if (
        approved_context["product"] != product
        or approved_context["templateId"] != template_id
        or context_counts["selectedProductRecords"] != local_records
        or context_counts["reviewedDecisions"] != approval_packets
        or context_counts["behaviorSignals"] != behavior_signals
        or context_behavior["product"] != _PRODUCT_BEHAVIOR[product]
        or context_outcome["status"] != pilot_outcome["outcomeStatus"]
        or context_outcome["digest"] != pilot_outcome["reportDigest"]
        or context_owner_review["reviewedBy"] != owner_label
        or _timestamp(context_owner_review["reviewedAt"], "Approved AI context timestamp")
            < _timestamp(pilot_review["reviewedAt"], "Pilot outcome review timestamp")
    ):
        raise ManagedActivationError("Approved AI context changed from the managed trial evidence.")
    provisioning = _exact(
        value.get("managedWorkspaceProvisioningPacket"),
        (
            "contract",
            "version",
            "createdAt",
            "evidenceVersion",
            "workspace",
            "owner",
            "product",
            "template",
            "tenantMode",
            "dataPackage",
            "requiredControls",
            "firstSafeActivation",
            "forbiddenUntilProvisioned",
        ),
        "Managed workspace provisioning packet",
    )
    if provisioning["contract"] != "supermega.managed_workspace_provisioning.v1" or provisioning["version"] != 1:
        raise ManagedActivationError("Managed workspace provisioning contract is invalid.")
    if provisioning["tenantMode"] not in {"managed_required", "managed_ready"}:
        raise ManagedActivationError("Managed workspace tenant mode is invalid.")
    if provisioning["workspace"] != workspace_label or provisioning["owner"] != owner_label:
        raise ManagedActivationError("Managed workspace provisioning identity changed.")
    controls = provisioning["requiredControls"]
    forbidden = provisioning["forbiddenUntilProvisioned"]
    if not isinstance(controls, list) or not _REQUIRED_PROVISIONING_CONTROLS.issubset(set(controls)):
        raise ManagedActivationError("Managed workspace provisioning controls are incomplete.")
    if not isinstance(forbidden, list) or not _REQUIRED_FORBIDDEN_ACTIONS.issubset(set(forbidden)):
        raise ManagedActivationError("Managed workspace provisioning boundaries are incomplete.")
    data_package = provisioning["dataPackage"]
    if not isinstance(data_package, Mapping):
        raise ManagedActivationError("Managed workspace data package is invalid.")
    if (
        data_package.get("localRecords") != local_records
        or data_package.get("approvalPackets") != approval_packets
        or data_package.get("behaviorSignals") != behavior_signals
        or data_package.get("pilotOutcomeDigest") != pilot_outcome["reportDigest"]
    ):
        raise ManagedActivationError("Managed workspace evidence counts changed.")
    import_packet = value.get("importProvisioningPacket")
    if not isinstance(import_packet, Mapping) or import_packet.get("secretValuesExposed") is not False:
        raise ManagedActivationError("Managed import provisioning must prove that secrets are excluded.")
    return {
        "raw": deepcopy(dict(value)),
        "product": product,
        "workspaceLabel": workspace_label,
        "ownerLabel": owner_label,
        "evidence": {
            "localRecords": local_records,
            "approvalPackets": approval_packets,
            "behaviorSignals": behavior_signals,
            "evidenceVersion": _count(value.get("evidenceVersion"), "Evidence version", minimum=1, maximum=10_000),
            "pilotOutcomeDigest": pilot_outcome["reportDigest"],
            "pilotOutcomeStatus": pilot_outcome["outcomeStatus"],
            "approvedContextContract": approved_context["contract"],
            "approvedContextDigest": approved_context["contextDigest"],
            "approvedContextOutcomeDigest": context_outcome["digest"],
            "approvedContextApprovedBy": context_owner_review["reviewedBy"],
            "approvedContextApprovedAt": context_owner_review["reviewedAt"],
            "approvedContextRawRecordsIncluded": False,
            "approvedContextModelTrainingAllowed": False,
        },
    }


def _owner_capabilities(product: str) -> list[str]:
    return sorted(_BASE_OWNER_CAPABILITIES | _PRODUCT_CAPABILITIES[product])


def validate_managed_trial_request(value: object) -> dict[str, Any]:
    """Validate owner-reviewed product evidence and return a redacted binding."""

    source = _source_request(value)
    return {
        "contract": SOURCE_REQUEST_CONTRACT,
        "product": source["product"],
        "workspaceLabel": source["workspaceLabel"],
        "ownerLabel": source["ownerLabel"],
        "templateId": source["raw"]["templateId"],
        "requestDigest": _digest(source["raw"]),
        "evidence": deepcopy(source["evidence"]),
        "rawRecordsIncluded": False,
        "secretValuesExposed": False,
    }


def owner_capabilities_for_products(products: Sequence[str]) -> list[str]:
    normalized = tuple(products)
    if not normalized or len(normalized) > len(_PRODUCT_CAPABILITIES) or len(set(normalized)) != len(normalized):
        raise ManagedActivationError("Managed activation products must be unique and non-empty.")
    if any(product not in _PRODUCT_CAPABILITIES for product in normalized):
        raise ManagedActivationError("Managed activation product is unsupported.")
    capabilities = set(_BASE_OWNER_CAPABILITIES)
    for product in normalized:
        capabilities.update(_PRODUCT_CAPABILITIES[product])
    return sorted(capabilities)


def compile_activation_plan(
    request: object,
    *,
    workspace_id: str,
    owner_actor_id: str,
    approval_id: str,
    approved_by: str,
    approved_at: str,
    project_ref: str,
    release_commit: str,
    admin_ca_sha256: str,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Bind browser evidence to one named user, target database, and release."""

    source = _source_request(request)
    workspace = _identifier(workspace_id, "Workspace ID")
    owner_actor = _uuid(owner_actor_id, "Owner actor ID")
    approval = _approval_id(approval_id, "Owner approval ID")
    approver = _visible_text(approved_by, "Owner approver", 160)
    approved = _timestamp(approved_at, "Owner approval timestamp")
    project = _visible_text(project_ref, "Supabase project ref", 20).lower()
    if not _PROJECT_REF.fullmatch(project):
        raise ManagedActivationError("Supabase project ref is invalid.")
    release = _visible_text(release_commit, "Release commit", 40).lower()
    if not _RELEASE_COMMIT.fullmatch(release):
        raise ManagedActivationError("Release commit is invalid.")
    ca_digest = _visible_text(admin_ca_sha256, "Administrative CA digest", 71).lower()
    if not _SHA256.fullmatch(ca_digest):
        raise ManagedActivationError("Administrative CA digest is invalid.")
    generated = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    if approver.casefold() != str(source["ownerLabel"]).casefold():
        raise ManagedActivationError("Activation approver must match the named workspace owner.")
    if approved > generated + timedelta(minutes=5):
        raise ManagedActivationError("Owner approval timestamp is in the future.")
    if generated - approved > PLAN_TTL:
        raise ManagedActivationError("Owner approval is stale and must be renewed.")
    source_digest = _digest(source["raw"])
    activation_id = str(uuid5(NAMESPACE_URL, f"{ACTIVATION_PLAN_CONTRACT}:{workspace}:{owner_actor}:{source_digest}"))
    compensation_authorization_id = str(
        uuid5(UUID(approval), f"{ACTIVATION_PLAN_CONTRACT}:automatic-compensation:{activation_id}")
    )
    plan: dict[str, Any] = {
        "contract": ACTIVATION_PLAN_CONTRACT,
        "version": 1,
        "activationId": activation_id,
        "createdAt": _timestamp_text(generated),
        "expiresAt": _timestamp_text(generated + PLAN_TTL),
        "sourceRequestDigest": source_digest,
        "workspaceId": workspace,
        "workspaceLabel": source["workspaceLabel"],
        "ownerActorId": owner_actor,
        "ownerLabel": source["ownerLabel"],
        "product": source["product"],
        "ownerCapabilities": _owner_capabilities(source["product"]),
        "approval": {
            "approvalId": approval,
            "approvedBy": approver,
            "approvedAt": _timestamp_text(approved),
        },
        "target": {
            "projectRef": project,
            "releaseCommit": release,
            "adminCaSha256": ca_digest,
            "schemaVersion": TRIAL_SCHEMA_VERSION,
        },
        "evidence": deepcopy(source["evidence"]),
        "operations": [
            "verify_postgres17_schema_v7",
            "lock_workspace_identity",
            "verify_durable_owner_authorization",
            "insert_workspace_access_control",
            "insert_owner_membership",
            "append_immutable_activation_event",
            "read_back_activation_receipt",
        ],
        "rollback": {
            "operation": "suspend_workspace_access_and_append_event",
            "authorizationId": compensation_authorization_id,
            "authorizationScope": "automatic_activation_compensation",
            "trigger": "downstream_release_gate_failure",
            "deletesCustomerData": False,
            "restoresBrowserLocalMode": True,
        },
        "forbiddenActions": sorted(_REQUIRED_FORBIDDEN_ACTIONS | {"model_training"}),
        "secretValuesExposed": False,
    }
    plan["planDigest"] = _digest(plan)
    return validate_activation_plan(plan, now=generated)


def compile_multi_product_activation_plan(
    requests: Sequence[object],
    *,
    workspace_id: str,
    owner_actor_id: str,
    approval_id: str,
    approved_by: str,
    approved_at: str,
    project_ref: str,
    release_commit: str,
    admin_ca_sha256: str,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Bind several independently reviewed products to one atomic tenant activation."""

    generated = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    source_plans = [
        compile_activation_plan(
            request,
            workspace_id=workspace_id,
            owner_actor_id=owner_actor_id,
            approval_id=approval_id,
            approved_by=approved_by,
            approved_at=approved_at,
            project_ref=project_ref,
            release_commit=release_commit,
            admin_ca_sha256=admin_ca_sha256,
            now=generated,
        )
        for request in requests
    ]
    products = [plan["product"] for plan in source_plans]
    canonical_order = [product for product in _PRODUCT_CAPABILITIES if product in products]
    if products != canonical_order or len(products) < 2 or len(set(products)) != len(products):
        raise ManagedActivationError("Multi-product activation requests must be unique and canonically ordered.")
    first = source_plans[0]
    identity_fields = ("createdAt", "expiresAt", "workspaceId", "workspaceLabel", "ownerActorId", "ownerLabel", "approval", "target")
    if any(any(plan[field] != first[field] for field in identity_fields) for plan in source_plans[1:]):
        raise ManagedActivationError("Multi-product activation identity or target changed between products.")
    source_digest = _digest([plan["planDigest"] for plan in source_plans])
    activation_id = str(uuid5(NAMESPACE_URL, f"{MULTI_PRODUCT_ACTIVATION_PLAN_CONTRACT}:{first['workspaceId']}:{first['ownerActorId']}:{source_digest}"))
    compensation_authorization_id = str(
        uuid5(UUID(approval_id), f"{MULTI_PRODUCT_ACTIVATION_PLAN_CONTRACT}:automatic-compensation:{activation_id}")
    )
    plan: dict[str, Any] = {
        "contract": MULTI_PRODUCT_ACTIVATION_PLAN_CONTRACT,
        "version": 2,
        "activationId": activation_id,
        "createdAt": first["createdAt"],
        "expiresAt": first["expiresAt"],
        "sourceRequestDigest": source_digest,
        "workspaceId": first["workspaceId"],
        "workspaceLabel": first["workspaceLabel"],
        "ownerActorId": first["ownerActorId"],
        "ownerLabel": first["ownerLabel"],
        "products": products,
        "ownerCapabilities": owner_capabilities_for_products(products),
        "approval": deepcopy(first["approval"]),
        "target": deepcopy(first["target"]),
        "sourcePlans": deepcopy(source_plans),
        "operations": deepcopy(first["operations"]),
        "rollback": {
            **deepcopy(first["rollback"]),
            "authorizationId": compensation_authorization_id,
        },
        "forbiddenActions": deepcopy(first["forbiddenActions"]),
        "secretValuesExposed": False,
    }
    plan["planDigest"] = _digest(plan)
    return validate_multi_product_activation_plan(plan, now=generated)


def validate_activation_plan(
    value: object,
    *,
    now: datetime | None = None,
    require_current: bool = False,
) -> dict[str, Any]:
    plan = _exact(
        value,
        (
            "contract",
            "version",
            "activationId",
            "createdAt",
            "expiresAt",
            "sourceRequestDigest",
            "workspaceId",
            "workspaceLabel",
            "ownerActorId",
            "ownerLabel",
            "product",
            "ownerCapabilities",
            "approval",
            "target",
            "evidence",
            "operations",
            "rollback",
            "forbiddenActions",
            "secretValuesExposed",
            "planDigest",
        ),
        "Managed activation plan",
    )
    if plan["contract"] != ACTIVATION_PLAN_CONTRACT or plan["version"] != 1:
        raise ManagedActivationError("Managed activation plan contract is invalid.")
    activation_id = _uuid(plan["activationId"], "Activation ID")
    created = _timestamp(plan["createdAt"], "Activation creation timestamp")
    expires = _timestamp(plan["expiresAt"], "Activation expiry timestamp")
    if expires - created != PLAN_TTL:
        raise ManagedActivationError("Managed activation plan lifetime is invalid.")
    if require_current and expires < (now or datetime.now(timezone.utc)).astimezone(timezone.utc):
        raise ManagedActivationError("Managed activation plan expired and must be rebuilt from current evidence.")
    source_digest = _visible_text(plan["sourceRequestDigest"], "Source request digest", 71)
    plan_digest = _visible_text(plan["planDigest"], "Activation plan digest", 71)
    if not _SHA256.fullmatch(source_digest) or not _SHA256.fullmatch(plan_digest):
        raise ManagedActivationError("Managed activation digest is invalid.")
    workspace = _identifier(plan["workspaceId"], "Workspace ID")
    owner_actor = _uuid(plan["ownerActorId"], "Owner actor ID")
    _visible_text(plan["workspaceLabel"], "Workspace label", 180)
    owner_label = _visible_text(plan["ownerLabel"], "Owner label", 180)
    product = _visible_text(plan["product"], "Activation product", 24)
    if product not in _PRODUCT_CAPABILITIES:
        raise ManagedActivationError("Managed activation product is unsupported.")
    capabilities = plan["ownerCapabilities"]
    if not isinstance(capabilities, list) or capabilities != _owner_capabilities(product):
        raise ManagedActivationError("Managed activation owner capabilities are invalid.")
    approval = _exact(plan["approval"], ("approvalId", "approvedBy", "approvedAt"), "Activation approval")
    _approval_id(approval["approvalId"], "Owner approval ID")
    if _visible_text(approval["approvedBy"], "Owner approver", 160).casefold() != owner_label.casefold():
        raise ManagedActivationError("Activation approver changed from the named owner.")
    _timestamp(approval["approvedAt"], "Owner approval timestamp")
    target = _exact(
        plan["target"],
        ("projectRef", "releaseCommit", "adminCaSha256", "schemaVersion"),
        "Activation target",
    )
    if not isinstance(target["projectRef"], str) or not _PROJECT_REF.fullmatch(target["projectRef"]):
        raise ManagedActivationError("Activation target project ref is invalid.")
    if not isinstance(target["releaseCommit"], str) or not _RELEASE_COMMIT.fullmatch(target["releaseCommit"]):
        raise ManagedActivationError("Activation target release commit is invalid.")
    if not isinstance(target["adminCaSha256"], str) or not _SHA256.fullmatch(target["adminCaSha256"]):
        raise ManagedActivationError("Activation target administrative CA digest is invalid.")
    if target["schemaVersion"] != TRIAL_SCHEMA_VERSION:
        raise ManagedActivationError("Activation target schema version is invalid.")
    evidence = _exact(
        plan["evidence"],
        (
            "approvalPackets",
            "approvedContextApprovedAt",
            "approvedContextApprovedBy",
            "approvedContextContract",
            "approvedContextDigest",
            "approvedContextModelTrainingAllowed",
            "approvedContextOutcomeDigest",
            "approvedContextRawRecordsIncluded",
            "behaviorSignals",
            "evidenceVersion",
            "localRecords",
            "pilotOutcomeDigest",
            "pilotOutcomeStatus",
        ),
        "Activation evidence",
    )
    _count(evidence["localRecords"], "Activation local records", minimum=1)
    _count(evidence["approvalPackets"], "Activation approval packets", minimum=1)
    _count(evidence["behaviorSignals"], "Activation behavior signals", minimum=1)
    _count(evidence["evidenceVersion"], "Activation evidence version", minimum=1, maximum=10_000)
    if not isinstance(evidence["pilotOutcomeDigest"], str) or not _SHA256.fullmatch(evidence["pilotOutcomeDigest"]):
        raise ManagedActivationError("Activation pilot outcome digest is invalid.")
    if (
        evidence["approvedContextContract"] != "supermega.ai_context_export.v1"
        or not isinstance(evidence["approvedContextDigest"], str)
        or not _SHA256.fullmatch(evidence["approvedContextDigest"])
        or not isinstance(evidence["approvedContextOutcomeDigest"], str)
        or not _SHA256.fullmatch(evidence["approvedContextOutcomeDigest"])
        or evidence["approvedContextOutcomeDigest"] != evidence["pilotOutcomeDigest"]
        or _visible_text(evidence["approvedContextApprovedBy"], "Approved AI context owner", 120) != owner_label
        or _timestamp(evidence["approvedContextApprovedAt"], "Approved AI context timestamp") > created
        or evidence["approvedContextRawRecordsIncluded"] is not False
        or evidence["approvedContextModelTrainingAllowed"] is not False
    ):
        raise ManagedActivationError("Activation approved AI context evidence is invalid.")
    if evidence["pilotOutcomeStatus"] not in {"target_met", "improved"}:
        raise ManagedActivationError("Activation pilot outcome status is invalid.")
    if plan["operations"] != [
        "verify_postgres17_schema_v7",
        "lock_workspace_identity",
        "verify_durable_owner_authorization",
        "insert_workspace_access_control",
        "insert_owner_membership",
        "append_immutable_activation_event",
        "read_back_activation_receipt",
    ]:
        raise ManagedActivationError("Managed activation operations changed.")
    rollback = _exact(
        plan["rollback"],
        (
            "operation",
            "authorizationId",
            "authorizationScope",
            "trigger",
            "deletesCustomerData",
            "restoresBrowserLocalMode",
        ),
        "Activation rollback",
    )
    compensation_authorization_id = _approval_id(
        rollback["authorizationId"],
        "Automatic compensation authorization ID",
    )
    expected_compensation_authorization_id = str(
        uuid5(UUID(str(approval["approvalId"])), f"{ACTIVATION_PLAN_CONTRACT}:automatic-compensation:{activation_id}")
    )
    if (
        rollback["operation"] != "suspend_workspace_access_and_append_event"
        or compensation_authorization_id != expected_compensation_authorization_id
        or rollback["authorizationScope"] != "automatic_activation_compensation"
        or rollback["trigger"] != "downstream_release_gate_failure"
        or rollback["deletesCustomerData"] is not False
        or rollback["restoresBrowserLocalMode"] is not True
    ):
        raise ManagedActivationError("Managed activation rollback is invalid.")
    forbidden = plan["forbiddenActions"]
    if not isinstance(forbidden, list) or forbidden != sorted(_REQUIRED_FORBIDDEN_ACTIONS | {"model_training"}):
        raise ManagedActivationError("Managed activation boundaries changed.")
    if plan["secretValuesExposed"] is not False:
        raise ManagedActivationError("Managed activation plan must not expose secrets.")
    recomputed = deepcopy(dict(plan))
    del recomputed["planDigest"]
    if _digest(recomputed) != plan_digest:
        raise ManagedActivationError("Managed activation plan digest is invalid.")
    expected_activation_id = str(
        uuid5(NAMESPACE_URL, f"{ACTIVATION_PLAN_CONTRACT}:{workspace}:{owner_actor}:{source_digest}")
    )
    if activation_id != expected_activation_id:
        raise ManagedActivationError("Managed activation identity is invalid.")
    return deepcopy(dict(plan))


def validate_multi_product_activation_plan(
    value: object,
    *,
    now: datetime | None = None,
    require_current: bool = False,
) -> dict[str, Any]:
    plan = _exact(
        value,
        (
            "contract", "version", "activationId", "createdAt", "expiresAt",
            "sourceRequestDigest", "workspaceId", "workspaceLabel", "ownerActorId",
            "ownerLabel", "products", "ownerCapabilities", "approval", "target",
            "sourcePlans", "operations", "rollback", "forbiddenActions",
            "secretValuesExposed", "planDigest",
        ),
        "Multi-product managed activation plan",
    )
    if plan["contract"] != MULTI_PRODUCT_ACTIVATION_PLAN_CONTRACT or plan["version"] != 2:
        raise ManagedActivationError("Multi-product managed activation plan contract is invalid.")
    created = _timestamp(plan["createdAt"], "Activation creation timestamp")
    expires = _timestamp(plan["expiresAt"], "Activation expiry timestamp")
    if expires - created != PLAN_TTL:
        raise ManagedActivationError("Managed activation plan lifetime is invalid.")
    if require_current and expires < (now or datetime.now(timezone.utc)).astimezone(timezone.utc):
        raise ManagedActivationError("Managed activation plan expired and must be rebuilt from current evidence.")
    source_plans_value = plan["sourcePlans"]
    if not isinstance(source_plans_value, list) or len(source_plans_value) < 2 or len(source_plans_value) > len(_PRODUCT_CAPABILITIES):
        raise ManagedActivationError("Multi-product activation source plans are incomplete.")
    source_plans = [validate_activation_plan(source, now=now, require_current=require_current) for source in source_plans_value]
    products = [source["product"] for source in source_plans]
    canonical_order = [product for product in _PRODUCT_CAPABILITIES if product in products]
    if products != canonical_order or len(set(products)) != len(products) or plan["products"] != products:
        raise ManagedActivationError("Multi-product activation products are invalid.")
    first = source_plans[0]
    identity_fields = ("createdAt", "expiresAt", "workspaceId", "workspaceLabel", "ownerActorId", "ownerLabel", "approval", "target")
    if any(any(source[field] != first[field] for field in identity_fields) for source in source_plans[1:]):
        raise ManagedActivationError("Multi-product activation identity or target changed between products.")
    for field in identity_fields:
        if plan[field] != first[field]:
            raise ManagedActivationError("Multi-product activation envelope changed reviewed identity or target.")
    capabilities = plan["ownerCapabilities"]
    if not isinstance(capabilities, list) or capabilities != owner_capabilities_for_products(products):
        raise ManagedActivationError("Multi-product activation owner capabilities are invalid.")
    source_digest = _digest([source["planDigest"] for source in source_plans])
    if plan["sourceRequestDigest"] != source_digest:
        raise ManagedActivationError("Multi-product activation source digest is invalid.")
    activation_id = _uuid(plan["activationId"], "Activation ID")
    expected_activation_id = str(
        uuid5(NAMESPACE_URL, f"{MULTI_PRODUCT_ACTIVATION_PLAN_CONTRACT}:{first['workspaceId']}:{first['ownerActorId']}:{source_digest}")
    )
    if activation_id != expected_activation_id:
        raise ManagedActivationError("Multi-product activation identity is invalid.")
    if plan["operations"] != first["operations"] or plan["forbiddenActions"] != first["forbiddenActions"]:
        raise ManagedActivationError("Multi-product activation boundaries changed.")
    rollback = _exact(
        plan["rollback"],
        ("operation", "authorizationId", "authorizationScope", "trigger", "deletesCustomerData", "restoresBrowserLocalMode"),
        "Activation rollback",
    )
    expected_authorization_id = str(
        uuid5(UUID(str(first["approval"]["approvalId"])), f"{MULTI_PRODUCT_ACTIVATION_PLAN_CONTRACT}:automatic-compensation:{activation_id}")
    )
    if (
        rollback["authorizationId"] != expected_authorization_id
        or {key: rollback[key] for key in rollback if key != "authorizationId"}
        != {key: first["rollback"][key] for key in first["rollback"] if key != "authorizationId"}
    ):
        raise ManagedActivationError("Multi-product activation rollback is invalid.")
    if plan["secretValuesExposed"] is not False:
        raise ManagedActivationError("Managed activation plan must not expose secrets.")
    plan_digest = plan["planDigest"]
    if not isinstance(plan_digest, str) or not _SHA256.fullmatch(plan_digest):
        raise ManagedActivationError("Managed activation digest is invalid.")
    recomputed = deepcopy(dict(plan))
    del recomputed["planDigest"]
    if _digest(recomputed) != plan_digest:
        raise ManagedActivationError("Managed activation plan digest is invalid.")
    return deepcopy(dict(plan))


def _validate_supported_activation_plan(
    value: object,
    *,
    now: datetime | None = None,
    require_current: bool = False,
) -> dict[str, Any]:
    if isinstance(value, Mapping) and value.get("contract") == MULTI_PRODUCT_ACTIVATION_PLAN_CONTRACT:
        return validate_multi_product_activation_plan(value, now=now, require_current=require_current)
    return validate_activation_plan(value, now=now, require_current=require_current)


def _row_value(row: object, key: str, index: int) -> Any:
    if isinstance(row, Mapping):
        return row.get(key)
    if isinstance(row, Sequence) and not isinstance(row, (str, bytes)):
        return row[index]
    return None


def _projection_digest(receipt: Mapping[str, Any]) -> str:
    projection = dict(receipt)
    projection.pop("projectionDigest", None)
    return _digest(projection)


def validate_activation_receipt(value: object, plan_value: object) -> dict[str, Any]:
    plan = _validate_supported_activation_plan(plan_value)
    if not isinstance(value, Mapping):
        raise ManagedActivationError("Managed activation receipt must be an object.")
    receipt = dict(value)
    expected_keys = {
        "activationId", "activatedAt", "adminCaSha256", "authority", "contract",
        "externalActionsPerformed", "localProjectionTrusted", "ownerActorId",
        "planDigest", "projectRef", "projectionDigest", "releaseCommit", "replayed",
        "secretValuesExposed", "status", "version", "workspaceId",
    }
    if set(receipt) != expected_keys:
        raise ManagedActivationError("Managed activation receipt fields are invalid.")
    if (
        receipt.get("contract") != ACTIVATION_RECEIPT_CONTRACT
        or receipt.get("version") != 2
        or receipt.get("status") != "active"
        or not isinstance(receipt.get("replayed"), bool)
        or receipt.get("localProjectionTrusted") is not False
        or receipt.get("secretValuesExposed") is not False
        or receipt.get("activationId") != plan["activationId"]
        or receipt.get("planDigest") != plan["planDigest"]
        or receipt.get("workspaceId") != plan["workspaceId"]
        or receipt.get("ownerActorId") != plan["ownerActorId"]
        or receipt.get("projectRef") != plan["target"]["projectRef"]
        or receipt.get("releaseCommit") != plan["target"]["releaseCommit"]
        or receipt.get("adminCaSha256") != plan["target"]["adminCaSha256"]
        or receipt.get("projectionDigest") != _projection_digest(receipt)
    ):
        raise ManagedActivationError("Managed activation receipt does not match the reviewed plan.")
    _timestamp(receipt.get("activatedAt"), "Managed activation receipt timestamp")
    authority = receipt.get("authority")
    if (
        not isinstance(authority, Mapping)
        or dict(authority) != {
            "system": "postgresql",
            "table": "app_private.workspace_events",
            "commandId": plan["activationId"],
            "verification": "requery_required",
        }
        or receipt.get("externalActionsPerformed") != [
            "workspace_access_control_insert",
            "workspace_membership_insert",
            "immutable_activation_event_insert",
        ]
    ):
        raise ManagedActivationError("Managed activation receipt authority is invalid.")
    return deepcopy(receipt)


def build_activation_requery_evidence(
    plan_value: object,
    receipt_value: object,
    inspection_value: object,
    *,
    observed_at: datetime | None = None,
) -> dict[str, Any]:
    plan = _validate_supported_activation_plan(plan_value)
    receipt = validate_activation_receipt(receipt_value, plan)
    if not isinstance(inspection_value, Mapping):
        raise ManagedActivationError("Managed activation requery result must be an object.")
    inspection = dict(inspection_value)
    if (
        inspection.get("contract") != "supermega.managed_workspace_activation_preflight.v1"
        or inspection.get("status") != "active_replay"
        or inspection.get("ready") is not True
        or inspection.get("authorizationReady") is not True
        or inspection.get("workspaceId") != plan["workspaceId"]
        or inspection.get("projectRef") != plan["target"]["projectRef"]
        or inspection.get("releaseCommit") != plan["target"]["releaseCommit"]
        or inspection.get("postgresMajor") != 17
        or inspection.get("schemaVersion") != TRIAL_SCHEMA_VERSION
        or inspection.get("membershipCount") != 1
        or inspection.get("secretValuesExposed") is not False
        or inspection.get("mutationStatementsExecuted") != 0
    ):
        raise ManagedActivationError("Hosted activation requery did not prove the exact active tenant.")
    observed = observed_at or datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "contract": ACTIVATION_REQUERY_EVIDENCE_CONTRACT,
        "version": 2,
        "status": "database_activation_verified",
        "observedAt": _timestamp_text(observed),
        "activation": {
            "activationId": plan["activationId"],
            "planDigest": plan["planDigest"],
            "receiptDigest": receipt["projectionDigest"],
            "activatedAt": receipt["activatedAt"],
            "workspaceId": plan["workspaceId"],
            "ownerActorId": plan["ownerActorId"],
            "ownerApprovalDigest": f"sha256:{sha256(str(plan['approval']['approvalId']).encode('utf-8')).hexdigest()}",
            "products": list(plan["products"] if "products" in plan else [plan["product"]]),
        },
        "target": {
            "projectRef": plan["target"]["projectRef"],
            "releaseCommit": plan["target"]["releaseCommit"],
            "postgresMajor": 17,
            "schemaVersion": TRIAL_SCHEMA_VERSION,
        },
        "proofs": {
            "ownerAuthorizationRequeried": True,
            "workspaceAccessRequeried": True,
            "singleOwnerMembershipRequeried": True,
            "immutableActivationEventRequeried": True,
            "databaseMutationStatementsExecuted": 0,
        },
        "remainingGates": [
            "exact_release_live_verification_required",
            "named_owner_portal_smoke_required",
            "cross_tenant_denial_smoke_required",
        ],
        "controls": {
            "containsSecrets": False,
            "containsRawClientRows": False,
            "hostedDatabaseReadPerformed": True,
            "databaseReadOnly": True,
            "tenantWritesPerformed": False,
            "deploymentPerformed": False,
            "portalSmokePerformed": False,
            "activationMutationPerformedByThisCommand": False,
        },
    }
    payload["evidenceDigest"] = _digest(payload)
    return payload


class ManagedWorkspaceProvisioner:
    """Provision and suspend memberships through an administrative connection."""

    def __init__(self, database_url: str, *, connection_factory: Callable[..., Any] | None = None):
        self._database_url = str(database_url or "").strip()
        self._connection_factory = connection_factory

    def _connect(self) -> Any:
        if self._connection_factory is not None:
            return self._connection_factory(self._database_url)
        try:
            import psycopg
            from psycopg.conninfo import conninfo_to_dict
            from psycopg.rows import dict_row
        except ImportError as exc:  # pragma: no cover - production dependency contract.
            raise ManagedActivationError("Psycopg 3 is required for managed activation.") from exc
        connection_parameters = conninfo_to_dict(self._database_url)
        configured_sslmode = str(connection_parameters.get("sslmode", "")).lower()
        if configured_sslmode not in {"require", "verify-ca", "verify-full"}:
            raise ManagedActivationError("Administrative activation requires an explicit encrypted sslmode.")
        host = str(connection_parameters.get("host", "")).lower()
        if host not in {"127.0.0.1", "localhost", "::1"}:
            if configured_sslmode != "verify-full" or not str(connection_parameters.get("sslrootcert", "")).strip():
                raise ManagedActivationError(
                    "Remote administrative activation requires sslmode=verify-full and an explicit reviewed CA."
                )
        return psycopg.connect(
            self._database_url,
            autocommit=False,
            connect_timeout=5,
            prepare_threshold=None,
            row_factory=dict_row,
            application_name="supermega-managed-activation",
        )

    @staticmethod
    def _assert_schema(cursor: Any, *, require_write_privilege: bool) -> dict[str, Any]:
        cursor.execute(
            """
            select
              current_setting('server_version_num')::integer as server_version_num,
              current_user as current_user,
              current_setting('transaction_read_only') = 'on' as transaction_read_only,
              coalesce((
                select rolsuper or rolbypassrls
                from pg_roles
                where rolname = current_user
              ), false) as provisioning_role_privileged,
              coalesce((
                select schema_version
                from app_private.trial_schema_meta
                where component = 'private_trial_backend'
              ), 0) as schema_version,
              coalesce((
                select not rolsuper and not rolbypassrls and not rolcanlogin
                from pg_roles
                where rolname = 'supermega_trial_backend'
              ), false) as backend_role_safe,
              has_table_privilege(current_user, 'app_private.workspace_access_controls', 'SELECT') as access_select,
              has_table_privilege(current_user, 'app_private.workspace_access_controls', 'INSERT') as access_insert,
              has_table_privilege(current_user, 'app_private.workspace_access_controls', 'UPDATE') as access_update,
              has_table_privilege(current_user, 'app_private.approval_requests', 'SELECT') as approval_select,
              has_table_privilege(current_user, 'app_private.approval_requests', 'INSERT') as approval_insert,
              has_table_privilege(current_user, 'app_private.workspace_memberships', 'SELECT') as membership_select,
              has_table_privilege(current_user, 'app_private.workspace_memberships', 'INSERT') as membership_insert,
              has_table_privilege(current_user, 'app_private.workspace_memberships', 'UPDATE') as membership_update,
              has_table_privilege(current_user, 'app_private.workspace_events', 'SELECT') as event_select,
              has_table_privilege(current_user, 'app_private.workspace_events', 'INSERT') as event_insert
            """
        )
        row = cursor.fetchone()
        if row is None:
            raise ManagedActivationError("Managed activation schema probe returned no result.")
        snapshot = {
            "postgresMajor": int(_row_value(row, "server_version_num", 0) or 0) // 10_000,
            "currentUser": str(_row_value(row, "current_user", 1) or ""),
            "transactionReadOnly": bool(_row_value(row, "transaction_read_only", 2)),
            "provisioningRolePrivileged": bool(_row_value(row, "provisioning_role_privileged", 3)),
            "schemaVersion": int(_row_value(row, "schema_version", 4) or 0),
            "backendRoleSafe": bool(_row_value(row, "backend_role_safe", 5)),
            "accessSelect": bool(_row_value(row, "access_select", 6)),
            "accessInsert": bool(_row_value(row, "access_insert", 7)),
            "accessUpdate": bool(_row_value(row, "access_update", 8)),
            "approvalSelect": bool(_row_value(row, "approval_select", 9)),
            "approvalInsert": bool(_row_value(row, "approval_insert", 10)),
            "membershipSelect": bool(_row_value(row, "membership_select", 11)),
            "membershipInsert": bool(_row_value(row, "membership_insert", 12)),
            "membershipUpdate": bool(_row_value(row, "membership_update", 13)),
            "eventSelect": bool(_row_value(row, "event_select", 14)),
            "eventInsert": bool(_row_value(row, "event_insert", 15)),
        }
        if snapshot["postgresMajor"] != 17 or snapshot["schemaVersion"] != TRIAL_SCHEMA_VERSION:
            raise ManagedActivationError("Managed activation requires PostgreSQL 17 and private schema version 10.")
        if not snapshot["backendRoleSafe"]:
            raise ManagedActivationError("Managed activation backend role is unsafe.")
        if (
            not snapshot["provisioningRolePrivileged"]
            or snapshot["currentUser"] in {"supermega_trial_backend", "supermega_trial_login"}
        ):
            raise ManagedActivationError("Managed activation requires the reviewed administrative role, never the runtime role.")
        if snapshot["transactionReadOnly"] == require_write_privilege:
            raise ManagedActivationError("Managed activation transaction mode is invalid for this operation.")
        if not all(snapshot[key] for key in ("accessSelect", "approvalSelect", "membershipSelect", "eventSelect")):
            raise ManagedActivationError("Managed activation connection cannot verify workspace history.")
        if require_write_privilege and not all(
            snapshot[key]
            for key in (
                "accessInsert",
                "accessUpdate",
                "approvalInsert",
                "membershipInsert",
                "membershipUpdate",
                "eventInsert",
            )
        ):
            raise ManagedActivationError("Managed activation connection lacks bounded provisioning privileges.")
        return snapshot

    @staticmethod
    def _lock(cursor: Any, workspace_id: str) -> None:
        cursor.execute("select pg_advisory_xact_lock(hashtextextended(%s, 0))", (workspace_id,))

    @staticmethod
    def _authorization_projection(plan: Mapping[str, Any]) -> dict[str, Any]:
        captured_at = plan["approval"]["approvedAt"]
        plan_digest = plan["planDigest"]
        source_digest = plan["sourceRequestDigest"]
        return {
            "contract": "decision_packet.v1",
            "subject": {
                "kind": "managed_workspace_activation",
                "id": plan["activationId"],
                "version": 1,
            },
            "decision": f"Activate managed workspace {plan['workspaceId']} under the exact approved plan.",
            "claims": [
                {
                    "id": "named-owner-authorized-exact-plan",
                    "claim_type": "fact",
                    "statement": f"Owner actor {plan['ownerActorId']} authorized the exact activation plan.",
                    "source_reference": plan_digest,
                    "captured_at": captured_at,
                    "status": "verified",
                    "uncertainty": "low",
                    "visibility": "private",
                    "digest": plan_digest,
                },
                {
                    "id": "release-and-database-target-bound",
                    "claim_type": "fact",
                    "statement": (
                        f"Activation is bound to project {plan['target']['projectRef']}, "
                        f"release {plan['target']['releaseCommit']}, and schema "
                        f"v{plan['target']['schemaVersion']}."
                    ),
                    "source_reference": plan_digest,
                    "captured_at": captured_at,
                    "status": "verified",
                    "uncertainty": "low",
                    "visibility": "private",
                    "digest": plan_digest,
                },
                {
                    "id": "source-request-bound",
                    "claim_type": "fact",
                    "statement": "The activation plan is bound to the reviewed managed-trial request.",
                    "source_reference": source_digest,
                    "captured_at": captured_at,
                    "status": "verified",
                    "uncertainty": "low",
                    "visibility": "private",
                    "digest": source_digest,
                },
                {
                    "id": "automatic-compensation-authorized",
                    "claim_type": "fact",
                    "statement": (
                        f"Compensation authorization {plan['rollback']['authorizationId']} "
                        "may suspend access after the bounded downstream failure trigger."
                    ),
                    "source_reference": plan_digest,
                    "captured_at": captured_at,
                    "status": "verified",
                    "uncertainty": "low",
                    "visibility": "private",
                    "digest": plan_digest,
                },
            ],
            "baseline": "The managed workspace is not active and production writes remain disabled.",
            "target": "Create one tenant-scoped workspace with durable owner authority and RLS.",
            "result": "The owner authorized the exact activation plan for controlled provisioning.",
            "acceptance": (
                f"Apply plan {plan_digest} once, retain immutable evidence, and use "
                f"compensation authorization {plan['rollback']['authorizationId']} if required."
            ),
            "artifact_reference": f"managed-activation://{plan['workspaceId']}/{plan['activationId']}",
        }

    @classmethod
    def _authorization_row(cls, cursor: Any, plan: Mapping[str, Any]) -> Any:
        cursor.execute(
            """
            select approval_id, workspace_id, command_id, command_fingerprint,
                   proposal_json, evidence_refs_json, status, requested_by,
                   requested_actor_kind, requested_at, decided_by,
                   decided_actor_kind, decided_at, decision_note,
                   decision_contract_version, version
            from app_private.approval_requests
            where approval_id = %s
               or (workspace_id = %s and command_id = %s)
            order by (approval_id = %s) desc
            limit 1
            """,
            (
                plan["approval"]["approvalId"],
                plan["workspaceId"],
                plan["activationId"],
                plan["approval"]["approvalId"],
            ),
        )
        return cursor.fetchone()

    @classmethod
    def _authorization_matches(cls, row: Any, plan: Mapping[str, Any]) -> bool:
        if row is None:
            return False
        proposal = _row_value(row, "proposal_json", 4)
        evidence = _row_value(row, "evidence_refs_json", 5)
        if isinstance(proposal, str):
            try:
                proposal = json.loads(proposal)
            except json.JSONDecodeError:
                return False
        if isinstance(evidence, str):
            try:
                evidence = json.loads(evidence)
            except json.JSONDecodeError:
                return False
        return bool(
            str(_row_value(row, "approval_id", 0)) == plan["approval"]["approvalId"]
            and _row_value(row, "workspace_id", 1) == plan["workspaceId"]
            and str(_row_value(row, "command_id", 2)) == plan["activationId"]
            and _row_value(row, "command_fingerprint", 3) == str(plan["planDigest"])[7:]
            and proposal == cls._authorization_projection(plan)
            and evidence == [plan["sourceRequestDigest"], plan["planDigest"]]
            and _row_value(row, "status", 6) == "approved"
            and _row_value(row, "requested_by", 7) == plan["ownerActorId"]
            and _row_value(row, "requested_actor_kind", 8) == "human"
            and _row_value(row, "decided_by", 10) == plan["ownerActorId"]
            and _row_value(row, "decided_actor_kind", 11) == "human"
            and isinstance(_row_value(row, "requested_at", 9), datetime)
            and isinstance(_row_value(row, "decided_at", 12), datetime)
            and _row_value(row, "decision_contract_version", 14) == 2
            and _row_value(row, "version", 15) == 1
        )

    @staticmethod
    def _access_row(cursor: Any, workspace_id: str) -> Any:
        cursor.execute(
            """
            select activation_id, authorization_id, authorization_contract,
                   plan_digest, owner_actor_id, project_ref, release_commit,
                   status, activated_at, suspended_at
            from app_private.workspace_access_controls
            where workspace_id = %s
            """,
            (workspace_id,),
        )
        return cursor.fetchone()

    @staticmethod
    def _access_matches(row: Any, plan: Mapping[str, Any], *, status: str) -> bool:
        if row is None:
            return False
        return bool(
            str(_row_value(row, "activation_id", 0)) == plan["activationId"]
            and str(_row_value(row, "authorization_id", 1)) == plan["approval"]["approvalId"]
            and _row_value(row, "authorization_contract", 2) == "managed_owner_approval_v1"
            and _row_value(row, "plan_digest", 3) == str(plan["planDigest"])[7:]
            and _row_value(row, "owner_actor_id", 4) == plan["ownerActorId"]
            and _row_value(row, "project_ref", 5) == plan["target"]["projectRef"]
            and _row_value(row, "release_commit", 6) == plan["target"]["releaseCommit"]
            and _row_value(row, "status", 7) == status
        )

    @staticmethod
    def _membership_rows(cursor: Any, workspace_id: str) -> list[Any]:
        cursor.execute(
            """
            select actor_id, actor_kind, status, capabilities
            from app_private.workspace_memberships
            where workspace_id = %s
            order by actor_id
            """,
            (workspace_id,),
        )
        return list(cursor.fetchall())

    @staticmethod
    def _event_row(cursor: Any, workspace_id: str, command_id: str) -> Any:
        cursor.execute(
            """
            select result_json, created_at, command_fingerprint
            from app_private.workspace_events
            where workspace_id = %s and command_id = %s
            """,
            (workspace_id, command_id),
        )
        return cursor.fetchone()

    @staticmethod
    def _matching_membership(rows: list[Any], plan: Mapping[str, Any], *, status: str) -> bool:
        matching = [
            row
            for row in rows
            if _row_value(row, "actor_id", 0) == plan["ownerActorId"]
        ]
        return bool(
            len(matching) == 1
            and _row_value(matching[0], "actor_kind", 1) == "human"
            and _row_value(matching[0], "status", 2) == status
            and sorted(_row_value(matching[0], "capabilities", 3) or []) == plan["ownerCapabilities"]
        )

    @staticmethod
    def _activation_receipt(plan: Mapping[str, Any], created_at: datetime, *, replayed: bool) -> dict[str, Any]:
        receipt: dict[str, Any] = {
            "contract": ACTIVATION_RECEIPT_CONTRACT,
            "version": 2,
            "status": "active",
            "replayed": replayed,
            "activationId": plan["activationId"],
            "planDigest": plan["planDigest"],
            "workspaceId": plan["workspaceId"],
            "ownerActorId": plan["ownerActorId"],
            "projectRef": plan["target"]["projectRef"],
            "releaseCommit": plan["target"]["releaseCommit"],
            "adminCaSha256": plan["target"]["adminCaSha256"],
            "activatedAt": _timestamp_text(created_at),
            "authority": {
                "system": "postgresql",
                "table": "app_private.workspace_events",
                "commandId": plan["activationId"],
                "verification": "requery_required",
            },
            "localProjectionTrusted": False,
            "secretValuesExposed": False,
            "externalActionsPerformed": [
                "workspace_access_control_insert",
                "workspace_membership_insert",
                "immutable_activation_event_insert",
            ],
        }
        receipt["projectionDigest"] = _projection_digest(receipt)
        return receipt

    @staticmethod
    def _suspension_receipt(
        plan: Mapping[str, Any],
        created_at: datetime,
        *,
        command_id: str,
        suspension_approval_id: str,
        replayed: bool,
    ) -> dict[str, Any]:
        receipt: dict[str, Any] = {
            "contract": SUSPENSION_RECEIPT_CONTRACT,
            "version": 2,
            "status": "suspended",
            "replayed": replayed,
            "activationId": plan["activationId"],
            "suspensionCommandId": command_id,
            "suspensionApprovalId": suspension_approval_id,
            "planDigest": plan["planDigest"],
            "workspaceId": plan["workspaceId"],
            "ownerActorId": plan["ownerActorId"],
            "suspendedAt": _timestamp_text(created_at),
            "authority": {
                "system": "postgresql",
                "table": "app_private.workspace_events",
                "commandId": command_id,
                "verification": "requery_required",
            },
            "localProjectionTrusted": False,
            "secretValuesExposed": False,
            "customerDataDeleted": False,
            "externalActionsPerformed": [
                "workspace_access_control_suspend",
                "workspace_membership_suspend",
                "immutable_suspension_event_insert",
            ],
        }
        receipt["projectionDigest"] = _projection_digest(receipt)
        return receipt

    @staticmethod
    def _event_matches(
        row: Any,
        *,
        contract: str,
        plan_digest: str,
        status: str,
        fingerprint: str,
    ) -> bool:
        if row is None:
            return False
        result = _row_value(row, "result_json", 0)
        if isinstance(result, str):
            try:
                result = json.loads(result)
            except json.JSONDecodeError:
                return False
        return bool(
            isinstance(result, Mapping)
            and result.get("contract") == contract
            and result.get("planDigest") == plan_digest
            and result.get("status") == status
            and _row_value(row, "command_fingerprint", 2) == fingerprint
        )

    def authorize(
        self,
        plan_value: object,
        *,
        verified_owner_actor_id: str,
        verified_owner_session_id: str,
        decision_note: str,
    ) -> dict[str, Any]:
        plan = _validate_supported_activation_plan(plan_value, require_current=True)
        verified_owner = _uuid(verified_owner_actor_id, "Verified owner actor ID")
        verified_session = _uuid(verified_owner_session_id, "Verified owner session ID")
        note = _visible_text(decision_note, "Activation authorization note", 500)
        if verified_owner != plan["ownerActorId"]:
            raise ManagedActivationError("Supabase Auth user does not match the activation owner.")
        connection = self._connect()
        try:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute("set transaction isolation level serializable")
                    self._assert_schema(cursor, require_write_privilege=True)
                    cursor.execute(
                        "select app_private.supabase_session_is_active(%s::uuid, %s::uuid) as active",
                        (verified_owner, verified_session),
                    )
                    if not bool(_row_value(cursor.fetchone(), "active", 0)):
                        raise ManagedActivationError("Supabase Auth session is no longer active.")
                    self._lock(cursor, plan["workspaceId"])
                    authorization = self._authorization_row(cursor, plan)
                    access = self._access_row(cursor, plan["workspaceId"])
                    rows = self._membership_rows(cursor, plan["workspaceId"])
                    event = self._event_row(cursor, plan["workspaceId"], plan["activationId"])
                    if self._authorization_matches(authorization, plan):
                        return {
                            "contract": ACTIVATION_AUTHORIZATION_CONTRACT,
                            "status": "approved",
                            "replayed": True,
                            "activationId": plan["activationId"],
                            "approvalId": plan["approval"]["approvalId"],
                            "planDigest": plan["planDigest"],
                            "ownerActorId": plan["ownerActorId"],
                            "secretValuesExposed": False,
                        }
                    if authorization is not None or access is not None or rows or event is not None:
                        raise ManagedActivationConflict("Workspace has conflicting authorization or activation state.")
                    cursor.execute(
                        """
                        insert into app_private.approval_requests (
                          approval_id, workspace_id, command_id, command_fingerprint,
                          title, proposal_json, evidence_refs_json, status,
                          requested_by, requested_actor_kind, decided_by,
                          decided_actor_kind, decided_at, decision_note,
                          decision_contract_version, version
                        ) values (
                          %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, 'approved',
                          %s, 'human', %s, 'human', transaction_timestamp(), %s, 2, 1
                        )
                        returning requested_at, decided_at
                        """,
                        (
                            plan["approval"]["approvalId"],
                            plan["workspaceId"],
                            plan["activationId"],
                            str(plan["planDigest"])[7:],
                            f"Activate {plan['workspaceLabel']}",
                            _canonical_json(self._authorization_projection(plan)),
                            _canonical_json([plan["sourceRequestDigest"], plan["planDigest"]]),
                            plan["ownerActorId"],
                            plan["ownerActorId"],
                            note,
                        ),
                    )
                    inserted = cursor.fetchone()
                    if not isinstance(_row_value(inserted, "decided_at", 1), datetime):
                        raise ManagedActivationError("Activation authorization timestamp was not returned by PostgreSQL.")
            return {
                "contract": ACTIVATION_AUTHORIZATION_CONTRACT,
                "status": "approved",
                "replayed": False,
                "activationId": plan["activationId"],
                "approvalId": plan["approval"]["approvalId"],
                "planDigest": plan["planDigest"],
                "ownerActorId": plan["ownerActorId"],
                "secretValuesExposed": False,
            }
        finally:
            connection.close()

    def inspect(self, plan_value: object) -> dict[str, Any]:
        plan = _validate_supported_activation_plan(plan_value)
        connection = self._connect()
        try:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute("set transaction read only")
                    schema = self._assert_schema(cursor, require_write_privilege=False)
                    authorization = self._authorization_row(cursor, plan)
                    access = self._access_row(cursor, plan["workspaceId"])
                    rows = self._membership_rows(cursor, plan["workspaceId"])
                    event = self._event_row(cursor, plan["workspaceId"], plan["activationId"])
            authorization_ready = self._authorization_matches(authorization, plan)
            if authorization_ready and access is None and not rows and event is None:
                status = "ready_to_apply"
            elif (
                authorization_ready
                and self._access_matches(access, plan, status="active")
                and self._matching_membership(rows, plan, status="active")
                and self._event_matches(
                    event,
                    contract=ACTIVATION_EVENT_RESULT_CONTRACT,
                    plan_digest=plan["planDigest"],
                    status="active",
                    fingerprint=str(plan["planDigest"])[7:],
                )
            ):
                status = "active_replay"
            elif self._access_matches(access, plan, status="suspended"):
                status = "suspended"
            elif authorization is None and access is None and not rows and event is None:
                status = "authorization_required"
            else:
                status = "conflict"
            return {
                "contract": "supermega.managed_workspace_activation_preflight.v1",
                "status": status,
                "ready": status in {"ready_to_apply", "active_replay"},
                "authorizationReady": authorization_ready,
                "workspaceId": plan["workspaceId"],
                "projectRef": plan["target"]["projectRef"],
                "releaseCommit": plan["target"]["releaseCommit"],
                "postgresMajor": schema["postgresMajor"],
                "schemaVersion": schema["schemaVersion"],
                "membershipCount": len(rows),
                "secretValuesExposed": False,
                "mutationStatementsExecuted": 0,
            }
        finally:
            connection.close()

    def apply(self, plan_value: object) -> dict[str, Any]:
        plan = _validate_supported_activation_plan(plan_value, require_current=True)
        connection = self._connect()
        try:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute("set transaction isolation level serializable")
                    self._assert_schema(cursor, require_write_privilege=True)
                    self._lock(cursor, plan["workspaceId"])
                    authorization = self._authorization_row(cursor, plan)
                    access = self._access_row(cursor, plan["workspaceId"])
                    rows = self._membership_rows(cursor, plan["workspaceId"])
                    event = self._event_row(cursor, plan["workspaceId"], plan["activationId"])
                    if (
                        self._authorization_matches(authorization, plan)
                        and self._access_matches(access, plan, status="active")
                        and self._matching_membership(rows, plan, status="active")
                        and self._event_matches(
                            event,
                            contract=ACTIVATION_EVENT_RESULT_CONTRACT,
                            plan_digest=plan["planDigest"],
                            status="active",
                            fingerprint=str(plan["planDigest"])[7:],
                        )
                    ):
                        created_at = _row_value(event, "created_at", 1)
                        if not isinstance(created_at, datetime):
                            raise ManagedActivationConflict("Activation replay timestamp is invalid.")
                        return self._activation_receipt(plan, created_at, replayed=True)
                    if not self._authorization_matches(authorization, plan):
                        raise ManagedActivationConflict("Durable owner authorization is missing or does not match this plan.")
                    if access is not None or rows or event is not None:
                        raise ManagedActivationConflict("Workspace identity already has conflicting activation state.")
                    cursor.execute(
                        """
                        insert into app_private.workspace_access_controls (
                          workspace_id, activation_id, authorization_id,
                          authorization_contract, plan_digest, owner_actor_id,
                          project_ref, release_commit, status
                        ) values (%s, %s, %s, 'managed_owner_approval_v1', %s, %s, %s, %s, 'active')
                        """,
                        (
                            plan["workspaceId"],
                            plan["activationId"],
                            plan["approval"]["approvalId"],
                            str(plan["planDigest"])[7:],
                            plan["ownerActorId"],
                            plan["target"]["projectRef"],
                            plan["target"]["releaseCommit"],
                        ),
                    )
                    cursor.execute(
                        """
                        insert into app_private.workspace_memberships (
                          workspace_id, actor_id, actor_kind, status, capabilities
                        ) values (%s, %s, 'human', 'active', %s)
                        """,
                        (plan["workspaceId"], plan["ownerActorId"], plan["ownerCapabilities"]),
                    )
                    result = {
                        "contract": ACTIVATION_EVENT_RESULT_CONTRACT,
                        "status": "active",
                        "planDigest": plan["planDigest"],
                        "ownerActorId": plan["ownerActorId"],
                        "secretValuesExposed": False,
                    }
                    payload = {
                        "activationId": plan["activationId"],
                        "sourceRequestDigest": plan["sourceRequestDigest"],
                        "approval": plan["approval"],
                        "target": plan["target"],
                        "ownerCapabilities": plan["ownerCapabilities"],
                        "evidence": plan.get("evidence", {
                            source["product"]: source["evidence"] for source in plan.get("sourcePlans", [])
                        }),
                    }
                    if "products" in plan:
                        payload["products"] = plan["products"]
                    else:
                        payload["product"] = plan["product"]
                    cursor.execute(
                        """
                        insert into app_private.workspace_events (
                          event_id, workspace_id, command_id, command_fingerprint,
                          surface, event_type, actor_id, actor_kind, expected_version,
                          resulting_version, payload_json, result_json
                        ) values (
                          %s, %s, %s, %s, 'company', 'company.workspace.activated',
                          %s, 'human', null, null, %s::jsonb, %s::jsonb
                        )
                        returning created_at
                        """,
                        (
                            plan["activationId"],
                            plan["workspaceId"],
                            plan["activationId"],
                            str(plan["planDigest"])[7:],
                            plan["ownerActorId"],
                            _canonical_json(payload),
                            _canonical_json(result),
                        ),
                    )
                    inserted = cursor.fetchone()
                    created_at = _row_value(inserted, "created_at", 0)
                    if not isinstance(created_at, datetime):
                        raise ManagedActivationError("Activation event timestamp was not returned by PostgreSQL.")
            return self._activation_receipt(plan, created_at, replayed=False)
        finally:
            connection.close()

    def suspend(
        self,
        plan_value: object,
        *,
        suspension_approval_id: str,
        suspended_by: str,
        reason: str,
    ) -> dict[str, Any]:
        plan = _validate_supported_activation_plan(plan_value)
        approval_id = _approval_id(suspension_approval_id, "Suspension approval ID")
        actor = _uuid(suspended_by, "Suspension operator actor ID")
        note = _visible_text(reason, "Suspension reason", 500)
        if actor != plan["ownerActorId"]:
            raise ManagedActivationError("Suspension operator must match the activation owner.")
        if approval_id != plan["rollback"]["authorizationId"]:
            raise ManagedActivationError("Suspension is limited to the exact owner-authorized compensation command.")
        if note != AUTOMATIC_COMPENSATION_REASON:
            raise ManagedActivationError("Suspension reason does not match the authorized compensation trigger.")
        command_id = str(uuid5(UUID(plan["activationId"]), f"suspend:{approval_id}"))
        fingerprint = _digest([plan["planDigest"], approval_id, actor, note])
        connection = self._connect()
        try:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute("set transaction isolation level serializable")
                    self._assert_schema(cursor, require_write_privilege=True)
                    self._lock(cursor, plan["workspaceId"])
                    authorization = self._authorization_row(cursor, plan)
                    access = self._access_row(cursor, plan["workspaceId"])
                    rows = self._membership_rows(cursor, plan["workspaceId"])
                    activation_event = self._event_row(cursor, plan["workspaceId"], plan["activationId"])
                    suspension_event = self._event_row(cursor, plan["workspaceId"], command_id)
                    if (
                        self._access_matches(access, plan, status="suspended")
                        and self._matching_membership(rows, plan, status="suspended")
                        and self._event_matches(
                            suspension_event,
                            contract=SUSPENSION_EVENT_RESULT_CONTRACT,
                            plan_digest=plan["planDigest"],
                            status="suspended",
                            fingerprint=str(fingerprint)[7:],
                        )
                    ):
                        created_at = _row_value(suspension_event, "created_at", 1)
                        if not isinstance(created_at, datetime):
                            raise ManagedActivationConflict("Suspension replay timestamp is invalid.")
                        return self._suspension_receipt(
                            plan,
                            created_at,
                            command_id=command_id,
                            suspension_approval_id=approval_id,
                            replayed=True,
                        )
                    if (
                        not self._authorization_matches(authorization, plan)
                        or not self._access_matches(access, plan, status="active")
                        or not self._matching_membership(rows, plan, status="active")
                        or not self._event_matches(
                            activation_event,
                            contract=ACTIVATION_EVENT_RESULT_CONTRACT,
                            plan_digest=plan["planDigest"],
                            status="active",
                            fingerprint=str(plan["planDigest"])[7:],
                        )
                    ):
                        raise ManagedActivationConflict(
                            "Only the exact durably authorized active workspace can be compensated."
                        )
                    if suspension_event is not None:
                        raise ManagedActivationConflict("Suspension command identity conflicts with durable history.")
                    cursor.execute(
                        """
                        update app_private.workspace_access_controls
                        set status = 'suspended'
                        where workspace_id = %s and activation_id = %s and status = 'active'
                        returning updated_at
                        """,
                        (plan["workspaceId"], plan["activationId"]),
                    )
                    if cursor.fetchone() is None:
                        raise ManagedActivationConflict("Workspace access state changed before suspension.")
                    cursor.execute(
                        """
                        update app_private.workspace_memberships
                        set status = 'suspended', updated_at = transaction_timestamp()
                        where workspace_id = %s and actor_id = %s and actor_kind = 'human' and status = 'active'
                        returning updated_at
                        """,
                        (plan["workspaceId"], plan["ownerActorId"]),
                    )
                    updated = cursor.fetchone()
                    if updated is None:
                        raise ManagedActivationConflict("Workspace membership changed before suspension.")
                    result = {
                        "contract": SUSPENSION_EVENT_RESULT_CONTRACT,
                        "status": "suspended",
                        "planDigest": plan["planDigest"],
                        "suspensionApprovalId": approval_id,
                        "customerDataDeleted": False,
                    }
                    payload = {
                        "activationId": plan["activationId"],
                        "suspensionApprovalId": approval_id,
                        "authorizationScope": plan["rollback"]["authorizationScope"],
                        "trigger": plan["rollback"]["trigger"],
                        "suspendedBy": actor,
                        "reason": note,
                    }
                    cursor.execute(
                        """
                        insert into app_private.workspace_events (
                          event_id, workspace_id, command_id, command_fingerprint,
                          surface, event_type, actor_id, actor_kind, expected_version,
                          resulting_version, payload_json, result_json
                        ) values (
                          %s, %s, %s, %s, 'company', 'company.workspace.suspended',
                          %s, 'human', null, null, %s::jsonb, %s::jsonb
                        )
                        returning created_at
                        """,
                        (
                            command_id,
                            plan["workspaceId"],
                            command_id,
                            fingerprint[7:],
                            plan["ownerActorId"],
                            _canonical_json(payload),
                            _canonical_json(result),
                        ),
                    )
                    inserted = cursor.fetchone()
                    created_at = _row_value(inserted, "created_at", 0)
                    if not isinstance(created_at, datetime):
                        raise ManagedActivationError("Suspension event timestamp was not returned by PostgreSQL.")
            return self._suspension_receipt(
                plan,
                created_at,
                command_id=command_id,
                suspension_approval_id=approval_id,
                replayed=False,
            )
        finally:
            connection.close()


def _read_json(path_value: str, label: str) -> dict[str, Any]:
    path = Path(path_value).resolve()
    if not path.is_file() or path.stat().st_size > MAX_INPUT_BYTES:
        raise ManagedActivationError(f"{label} is missing or too large.")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ManagedActivationError(f"{label} is not valid UTF-8 JSON.") from exc
    if not isinstance(value, dict):
        raise ManagedActivationError(f"{label} must contain a JSON object.")
    return value


def _read_database_url(path_value: str) -> str:
    path = Path(path_value).resolve()
    if not path.is_file() or path.stat().st_size > 16 * 1024:
        raise ManagedActivationError("Administrative database URL file is missing or too large.")
    value = path.read_text(encoding="utf-8").strip()
    parsed = urlsplit(value)
    if parsed.scheme not in {"postgres", "postgresql"} or not parsed.hostname or not parsed.username or not parsed.password:
        raise ManagedActivationError("Administrative database URL is invalid.")
    sslmodes = parse_qs(parsed.query).get("sslmode", [])
    if len(sslmodes) != 1 or sslmodes[0].lower() not in {"require", "verify-ca", "verify-full"}:
        raise ManagedActivationError("Administrative database URL must explicitly require encrypted TLS.")
    return value


def _read_secret_file(path_value: str, label: str, *, maximum_bytes: int = 64 * 1024) -> str:
    path = Path(path_value).resolve()
    if not path.is_file() or path.stat().st_size > maximum_bytes:
        raise ManagedActivationError(f"{label} file is missing or too large.")
    value = path.read_text(encoding="utf-8").strip()
    if not value:
        raise ManagedActivationError(f"{label} file is empty.")
    return value


def _load_database_validator() -> Any:
    path = Path(__file__).resolve().parents[1] / "tools" / "validate_supermega_database_url.py"
    spec = importlib.util.spec_from_file_location("supermega_activation_database_validator", path)
    if spec is None or spec.loader is None:
        raise ManagedActivationError("Database target validator could not be loaded.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _reviewed_ca_digest(path_value: str) -> str:
    certificate_path = _load_database_validator().validate_ssl_root_certificate(path_value)
    return f"sha256:{sha256(Path(certificate_path).read_bytes()).hexdigest()}"


def reviewed_activation_ca_digest(path_value: str) -> str:
    """Return the digest of one validated administrative TLS CA certificate."""

    return _reviewed_ca_digest(path_value)


def _validate_admin_target(database_url: str, project_ref: str, expected_ca_sha256: str) -> None:
    parsed = urlsplit(database_url)
    query = parse_qs(parsed.query)
    sslmodes = query.get("sslmode", [])
    root_certificates = query.get("sslrootcert", [])
    if (
        len(sslmodes) != 1
        or sslmodes[0].lower() != "verify-full"
        or len(root_certificates) != 1
        or not root_certificates[0].strip()
    ):
        raise ManagedActivationError(
            "Production administrative activation requires sslmode=verify-full and one reviewed sslrootcert."
        )
    validator = _load_database_validator()
    observed_ca_sha256 = _reviewed_ca_digest(root_certificates[0])
    if observed_ca_sha256 != expected_ca_sha256:
        raise ManagedActivationError("Administrative TLS CA does not match the owner-reviewed activation plan.")
    mode = validator.validate_supabase_activation_target(
        database_url,
        expected_project_ref=project_ref,
    )
    if mode == "transaction_pooler":
        raise ManagedActivationError("Administrative activation cannot use the transaction-mode pooler.")


def _production_project_ref() -> str:
    package_path = Path(__file__).resolve().parents[1] / "package.json"
    package = json.loads(package_path.read_text(encoding="utf-8"))
    value = str(package.get("supermega", {}).get("productionSupabaseProjectRef") or "").strip()
    if not _PROJECT_REF.fullmatch(value):
        raise ManagedActivationError("Reviewed production Supabase project ref is not configured.")
    return value


def _require_release_checkout(release_commit: str) -> None:
    root = Path(__file__).resolve().parents[1]
    subprocess.run(
        ["git", "fetch", "--quiet", "origin", "main"],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
    )
    head = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    if head != release_commit:
        raise ManagedActivationError("Activation must run from the exact reviewed release commit.")
    origin_main = subprocess.run(
        ["git", "rev-parse", "refs/remotes/origin/main"],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    if origin_main != release_commit:
        raise ManagedActivationError("Activation release commit is not the current protected origin/main commit.")
    status = subprocess.run(
        ["git", "status", "--porcelain=v1", "--untracked-files=all"],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    if status.strip():
        raise ManagedActivationError("Activation requires an entirely clean immutable checkout.")
    if not sys.flags.no_user_site:
        raise ManagedActivationError("Production activation must run Python with -s to disable user site imports.")
    request = Request(LIVE_RELEASE_URL, headers={"User-Agent": "supermega-managed-activation/1"})
    with urlopen(request, timeout=8) as response:
        if response.status != 200 or response.geturl() != LIVE_RELEASE_URL:
            raise ManagedActivationError("Canonical app release metadata did not resolve exactly.")
        payload_bytes = response.read(16 * 1024 + 1)
    if len(payload_bytes) > 16 * 1024:
        raise ManagedActivationError("Canonical app release metadata is too large.")
    try:
        payload = json.loads(payload_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ManagedActivationError("Canonical app release metadata is invalid.") from exc
    if (
        not isinstance(payload, Mapping)
        or payload.get("service") != "supermega-app"
        or payload.get("canonicalDomain") != "https://app.supermega.dev"
        or payload.get("commit") != release_commit
    ):
        raise ManagedActivationError("Canonical app does not serve the exact reviewed activation release.")


def _write_json(path_value: str, value: Mapping[str, Any], *, replace: bool = False) -> None:
    path = Path(path_value).resolve()
    if path.exists() and not replace:
        try:
            if json.loads(path.read_text(encoding="utf-8")) == value:
                return
        except (OSError, UnicodeDecodeError, json.JSONDecodeError):
            pass
        raise ManagedActivationError("Output file already exists with different content.")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def _write_receipt(path_value: str, value: Mapping[str, Any]) -> None:
    if value.get("localProjectionTrusted") is not False or value.get("projectionDigest") != _projection_digest(value):
        raise ManagedActivationError("Database-derived receipt projection digest is invalid.")
    authority = value.get("authority")
    if not isinstance(authority, Mapping) or authority.get("verification") != "requery_required":
        raise ManagedActivationError("Receipt projection does not identify its PostgreSQL authority.")
    path = Path(path_value).resolve()
    if path.exists():
        try:
            existing = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ManagedActivationError("Existing receipt file is unreadable and was not replaced.") from exc
        if (
            not isinstance(existing, Mapping)
            or existing.get("localProjectionTrusted") is not False
            or existing.get("projectionDigest") != _projection_digest(existing)
        ):
            raise ManagedActivationError("Existing receipt projection digest is invalid and was not replaced.")
        existing_projection = dict(existing)
        value_projection = dict(value)
        for projection in (existing_projection, value_projection):
            projection.pop("projectionDigest", None)
            projection["replayed"] = False
        if existing_projection != value_projection:
            raise ManagedActivationError("Existing receipt file does not match durable activation history.")
        return
    _write_json(path_value, value)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Prepare or execute one bounded managed tenant activation.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    prepare = subparsers.add_parser("prepare")
    prepare.add_argument(
        "--request-file",
        action="append",
        required=True,
        help="Reviewed product request; repeat in canonical Shop, Plant, Website, Ecommerce order.",
    )
    prepare.add_argument("--workspace-id", required=True)
    prepare.add_argument("--owner-actor-id", required=True)
    prepare.add_argument("--approval-id", required=True)
    prepare.add_argument("--approved-by", required=True)
    prepare.add_argument("--approved-at", required=True)
    prepare.add_argument("--project-ref", required=True)
    prepare.add_argument("--release-commit", required=True)
    prepare.add_argument("--admin-ca-file", required=True)
    prepare.add_argument("--output", required=True)
    prepare.add_argument("--replace", action="store_true")
    for command in ("validate", "requery", "authorize", "apply", "suspend"):
        operation = subparsers.add_parser(command)
        operation.add_argument("--plan-file", required=True)
        operation.add_argument("--database-url-file", required=True)
        if command in {"authorize", "apply", "suspend"}:
            operation.add_argument("--confirm-owner-approval", required=True)
            operation.add_argument("--production-handoff", action="store_true")
        if command in {"apply", "suspend"}:
            operation.add_argument("--receipt-file", required=True)
        if command == "requery":
            operation.add_argument("--receipt-file", required=True)
            operation.add_argument("--output", required=True)
        if command == "authorize":
            operation.add_argument("--owner-access-token-file", required=True)
            operation.add_argument("--publishable-key-file", required=True)
            operation.add_argument("--decision-note", required=True)
        if command == "suspend":
            operation.add_argument("--suspension-approval-id", required=True)
            operation.add_argument("--suspended-by", required=True)
            operation.add_argument("--reason", required=True)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    mutation_performed = False
    try:
        if args.command == "prepare":
            requests = [
                _read_json(path, f"Managed trial request {index}")
                for index, path in enumerate(args.request_file, start=1)
            ]
            compile_arguments = {
                "workspace_id": args.workspace_id,
                "owner_actor_id": args.owner_actor_id,
                "approval_id": args.approval_id,
                "approved_by": args.approved_by,
                "approved_at": args.approved_at,
                "project_ref": args.project_ref,
                "release_commit": args.release_commit,
                "admin_ca_sha256": _reviewed_ca_digest(args.admin_ca_file),
            }
            plan = (
                compile_activation_plan(requests[0], **compile_arguments)
                if len(requests) == 1
                else compile_multi_product_activation_plan(requests, **compile_arguments)
            )
            _write_json(args.output, plan, replace=args.replace)
            result = {
                "contract": plan["contract"],
                "status": "prepared",
                "activationId": plan["activationId"],
                "planDigest": plan["planDigest"],
                "workspaceId": plan["workspaceId"],
                "secretValuesExposed": False,
                "externalMutationPerformed": False,
            }
        else:
            plan = _validate_supported_activation_plan(
                _read_json(args.plan_file, "Managed activation plan"),
                require_current=args.command in {"authorize", "apply"},
            )
            database_url = _read_database_url(args.database_url_file)
            _validate_admin_target(
                database_url,
                plan["target"]["projectRef"],
                plan["target"]["adminCaSha256"],
            )
            provisioner = ManagedWorkspaceProvisioner(database_url)
            if args.command == "validate":
                result = provisioner.inspect(plan)
            elif args.command == "requery":
                receipt = _read_json(args.receipt_file, "Managed activation receipt")
                evidence = build_activation_requery_evidence(plan, receipt, provisioner.inspect(plan))
                output = Path(args.output).resolve()
                if output.exists():
                    raise ManagedActivationError("Requery evidence output already exists and was not replaced.")
                _write_json(str(output), evidence)
                result = {
                    "contract": evidence["contract"],
                    "status": evidence["status"],
                    "evidenceDigest": evidence["evidenceDigest"],
                    "remainingGateCount": len(evidence["remainingGates"]),
                    "secretValuesExposed": False,
                    "tenantWritesPerformed": False,
                    "databaseReadOnly": True,
                }
            else:
                if args.confirm_owner_approval != plan["approval"]["approvalId"]:
                    raise ManagedActivationError("Owner approval confirmation does not match the activation plan.")
                production = plan["target"]["projectRef"] == _production_project_ref()
                if production and not args.production_handoff:
                    raise ManagedActivationError("Production activation requires --production-handoff.")
                if args.production_handoff and not production:
                    raise ManagedActivationError("--production-handoff is valid only for the reviewed production project.")
                if production and args.command in {"authorize", "apply"}:
                    _require_release_checkout(plan["target"]["releaseCommit"])
                if args.command == "authorize":
                    from supermega_runtime.supabase_auth import (
                        SupabaseAuthConfig,
                        SupabaseAuthUnavailable,
                        verify_supabase_user_identity,
                    )

                    token = _read_secret_file(args.owner_access_token_file, "Owner access token")
                    publishable_key = _read_secret_file(args.publishable_key_file, "Supabase publishable key")
                    if not re.fullmatch(r"sb_publishable_[A-Za-z0-9_-]{16,}", publishable_key):
                        raise ManagedActivationError("Activation requires a modern Supabase publishable key.")
                    config = SupabaseAuthConfig(
                        base_url=f"https://{plan['target']['projectRef']}.supabase.co",
                        publishable_key=publishable_key,
                    )
                    try:
                        verified_owner = verify_supabase_user_identity(token, config)
                    except SupabaseAuthUnavailable as exc:
                        raise ManagedActivationError("Supabase Auth could not verify owner authorization.") from exc
                    if verified_owner is None:
                        raise ManagedActivationError("Owner access token is invalid or anonymous.")
                    result = provisioner.authorize(
                        plan,
                        verified_owner_actor_id=verified_owner.user_id,
                        verified_owner_session_id=verified_owner.session_id,
                        decision_note=args.decision_note,
                    )
                    token = ""
                    publishable_key = ""
                elif args.command == "apply":
                    result = provisioner.apply(plan)
                else:
                    result = provisioner.suspend(
                        plan,
                        suspension_approval_id=args.suspension_approval_id,
                        suspended_by=args.suspended_by,
                        reason=args.reason,
                    )
                mutation_performed = result.get("replayed") is False
                if args.command in {"apply", "suspend"}:
                    _write_receipt(args.receipt_file, result)
        print(json.dumps(result, ensure_ascii=False, separators=(",", ":"), sort_keys=True))
        return 0
    except (ManagedActivationError, OSError, json.JSONDecodeError, subprocess.SubprocessError) as exc:
        print(
            json.dumps(
                {
                    "contract": "supermega.managed_workspace_activation_error.v1",
                    "status": "blocked",
                    "error": str(exc),
                    "secretValuesExposed": False,
                    "externalMutationPerformed": mutation_performed,
                },
                ensure_ascii=False,
                separators=(",", ":"),
                sort_keys=True,
            )
        )
        return 1
    except Exception:
        print(
            json.dumps(
                {
                    "contract": "supermega.managed_workspace_activation_error.v1",
                    "status": "blocked",
                    "error": "Managed activation failed without exposing provider or credential details.",
                    "secretValuesExposed": False,
                    "externalMutationPerformed": mutation_performed,
                },
                separators=(",", ":"),
                sort_keys=True,
            )
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = [
    "ACTIVATION_AUTHORIZATION_CONTRACT",
    "ACTIVATION_PLAN_CONTRACT",
    "ACTIVATION_REQUERY_EVIDENCE_CONTRACT",
    "ACTIVATION_RECEIPT_CONTRACT",
    "MULTI_PRODUCT_ACTIVATION_PLAN_CONTRACT",
    "ManagedActivationConflict",
    "ManagedActivationError",
    "ManagedWorkspaceProvisioner",
    "build_activation_requery_evidence",
    "SUSPENSION_RECEIPT_CONTRACT",
    "compile_activation_plan",
    "compile_multi_product_activation_plan",
    "main",
    "validate_activation_plan",
    "validate_activation_receipt",
    "validate_managed_trial_request",
    "validate_multi_product_activation_plan",
]
