"""Bounded owner-approved context retained by a managed SuperMega workspace."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from copy import deepcopy
from datetime import datetime, timezone
from hashlib import sha256
import json
from typing import Any

from supermega_runtime.trial_store import TrialValidationError


MANAGED_CONTEXT_REQUEST_CONTRACT = "supermega.managed_context_profile_request.v1"
MANAGED_AI_CONTEXT_EXPORT_CONTRACT = "supermega.ai_context_export.v1"
MANAGED_CONTEXT_PROFILE_CONTRACT = "supermega.managed_context_profile.v2"
MANAGED_CONTEXT_VALIDATION_CONTRACT = "supermega.managed_context_profile_validation.v2"
MANAGED_CONTEXT_RETENTION_CONTRACT = "supermega.managed_context_profile_retention.v2"
MANAGED_CONTEXT_RECEIPT_CONTRACT = "supermega.managed_context_profile_receipt.v2"
MANAGED_CONTEXT_BRIEF_PROJECTION_CONTRACT = "supermega.managed_context_brief_projection.v2"
LEGACY_MANAGED_CONTEXT_PROFILE_CONTRACT = "supermega.managed_context_profile.v1"
LEGACY_MANAGED_CONTEXT_RECEIPT_CONTRACT = "supermega.managed_context_profile_receipt.v1"
LEGACY_MANAGED_CONTEXT_BRIEF_PROJECTION_CONTRACT = "supermega.managed_context_brief_projection.v1"
MANAGED_CONTEXT_ALLOWED_USES = (
    "rank_next_actions",
    "draft_internal_recommendations",
    "prepare_import_mapping",
    "summarize_workspace_evidence",
)
MANAGED_CONTEXT_FORBIDDEN_ACTIONS = (
    "customer_message_send",
    "payment_capture",
    "stock_move",
    "production_write",
    "domain_publish",
    "crm_write",
    "model_training",
)
_PRODUCTS = frozenset({"shop", "plant", "website", "ecommerce"})
_BEHAVIOR_PRODUCTS = frozenset({"commerce", "production", "website", "ecommerce"})
_PRODUCT_TEMPLATES = {
    "shop": frozenset({"social-commerce", "retail-wholesale", "restaurant-ordering"}),
    "plant": frozenset({"production-control", "maintenance-downtime", "quality-traceability"}),
    "website": frozenset({"business-presence", "lead-generation", "catalog-showcase"}),
    "ecommerce": frozenset({"social-storefront", "pickup-preorder", "wholesale-request"}),
}
_PROFILE_KEYS = frozenset(
    {
        "approvedAt",
        "approvedBy",
        "approvedContextDigest",
        "allowedUses",
        "behaviorPreference",
        "contract",
        "forbiddenActions",
        "modelTrainingAllowed",
        "outcome",
        "product",
        "profileDigest",
        "rawBehaviorEntriesIncluded",
        "rawDecisionRecordsIncluded",
        "rawProductRecordsIncluded",
        "retainedBy",
        "sourceCounts",
        "templateId",
        "version",
        "workspaceId",
    }
)
_LEGACY_PROFILE_KEYS = frozenset(
    {
        "allowedUses",
        "behaviorPreference",
        "contract",
        "forbiddenActions",
        "modelTrainingAllowed",
        "product",
        "profileDigest",
        "rawProductRecordsIncluded",
        "retainedBy",
        "sourceCounts",
        "templateId",
        "version",
        "workspaceId",
    }
)
_MAX_SAFE_INTEGER = 9_007_199_254_740_991


def _exact(value: object, keys: Sequence[str], label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping) or set(value) != set(keys):
        raise TrialValidationError(f"{label} has an invalid shape.")
    return value


def _text(value: object, label: str, maximum: int) -> str:
    if (
        not isinstance(value, str)
        or value != value.strip()
        or not value
        or len(value) > maximum
        or any(ord(character) < 32 or ord(character) == 127 for character in value)
    ):
        raise TrialValidationError(f"{label} must be canonical visible text.")
    return value


def _count(value: object, label: str, *, minimum: int = 0, maximum: int = _MAX_SAFE_INTEGER) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or not minimum <= value <= maximum:
        raise TrialValidationError(f"{label} is outside the supported range.")
    return value


def _sha256_digest(value: object, label: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != 71
        or not value.startswith("sha256:")
        or any(character not in "0123456789abcdef" for character in value[7:])
    ):
        raise TrialValidationError(f"{label} is invalid.")
    return value


def _canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"))


def _timestamp(value: object, label: str) -> str:
    candidate = _text(value, label, 40)
    try:
        parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
    except ValueError as exc:
        raise TrialValidationError(f"{label} must be a canonical UTC timestamp.") from exc
    if parsed.tzinfo is None:
        raise TrialValidationError(f"{label} must include a timezone.")
    normalized = parsed.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    if normalized != candidate:
        raise TrialValidationError(f"{label} must use canonical UTC millisecond precision.")
    return normalized


def managed_ai_context_export_projection(value: Mapping[str, object]) -> list[object]:
    source_counts = value["sourceCounts"]
    behavior = value["behaviorPreference"]
    outcome = value["outcome"]
    owner_review = value["ownerReview"]
    handoff = value["handoff"]
    privacy = value["privacyBoundary"]
    assert isinstance(source_counts, Mapping)
    assert isinstance(behavior, Mapping)
    assert isinstance(outcome, Mapping)
    assert isinstance(owner_review, Mapping)
    assert isinstance(handoff, Mapping)
    assert isinstance(privacy, Mapping)
    return [
        value["contract"],
        value["version"],
        value["product"],
        value["templateId"],
        source_counts["selectedProductRecords"],
        source_counts["behaviorSignals"],
        source_counts["reviewedDecisions"],
        behavior["product"],
        behavior["chosenCount"],
        outcome["status"],
        outcome["digest"],
        outcome["accepted"],
        *value["allowedUses"],
        "|",
        *value["forbiddenActions"],
        owner_review["status"],
        owner_review["reviewedBy"],
        owner_review["reviewedAt"],
        handoff["route"],
        handoff["activationRequired"],
        privacy["rawProductRecordsIncluded"],
        privacy["rawBehaviorEntriesIncluded"],
        privacy["rawDecisionRecordsIncluded"],
        privacy["externalSendPerformed"],
        privacy["managedWritePerformed"],
        privacy["modelTrainingAllowed"],
    ]


def managed_ai_context_export_digest(value: Mapping[str, object]) -> str:
    return f"sha256:{sha256(_canonical_json(managed_ai_context_export_projection(value)).encode('utf-8')).hexdigest()}"


def validate_managed_ai_context_export(value: object) -> dict[str, object]:
    """Validate the exact owner-approved, outcome-bound summary exported by the free workspace."""

    export = _exact(
        value,
        (
            "allowedUses",
            "behaviorPreference",
            "contextDigest",
            "contract",
            "forbiddenActions",
            "handoff",
            "outcome",
            "ownerReview",
            "privacyBoundary",
            "product",
            "sourceCounts",
            "templateId",
            "version",
        ),
        "Approved AI context export",
    )
    if export["contract"] != MANAGED_AI_CONTEXT_EXPORT_CONTRACT or export["version"] != 1:
        raise TrialValidationError("Approved AI context export contract is invalid.")
    product = _text(export["product"], "Approved AI context product", 24)
    if product not in _PRODUCTS:
        raise TrialValidationError("Approved AI context product is unsupported.")
    template_id = _text(export["templateId"], "Approved AI context template", 120)
    if template_id not in _PRODUCT_TEMPLATES[product]:
        raise TrialValidationError("Approved AI context template is unsupported for this product.")
    source_counts = _exact(
        export["sourceCounts"],
        ("behaviorSignals", "reviewedDecisions", "selectedProductRecords"),
        "Approved AI context source counts",
    )
    behavior_signals = _count(source_counts["behaviorSignals"], "Approved behavior signal count", minimum=1, maximum=80)
    normalized_counts = {
        "selectedProductRecords": _count(source_counts["selectedProductRecords"], "Approved product record count", minimum=1, maximum=100_000),
        "behaviorSignals": behavior_signals,
        "reviewedDecisions": _count(source_counts["reviewedDecisions"], "Approved decision count", minimum=1, maximum=10_000),
    }
    behavior = _exact(export["behaviorPreference"], ("chosenCount", "product"), "Approved behavior preference")
    behavior_product = _text(behavior["product"], "Approved behavior product", 24)
    if behavior_product not in _BEHAVIOR_PRODUCTS:
        raise TrialValidationError("Approved behavior product is unsupported.")
    normalized_behavior = {
        "product": behavior_product,
        "chosenCount": _count(behavior["chosenCount"], "Approved behavior choice count", minimum=1, maximum=behavior_signals),
    }
    outcome = _exact(export["outcome"], ("accepted", "digest", "status"), "Approved AI context outcome")
    outcome_status = _text(outcome["status"], "Approved AI context outcome status", 24)
    if outcome_status not in {"target_met", "improved"} or outcome["accepted"] is not True:
        raise TrialValidationError("Approved AI context requires an accepted positive outcome.")
    outcome_digest = _sha256_digest(outcome["digest"], "Approved AI context outcome digest")
    if not isinstance(export["allowedUses"], list) or tuple(export["allowedUses"]) != MANAGED_CONTEXT_ALLOWED_USES:
        raise TrialValidationError("Approved AI context allowed uses are invalid.")
    if not isinstance(export["forbiddenActions"], list) or tuple(export["forbiddenActions"]) != MANAGED_CONTEXT_FORBIDDEN_ACTIONS:
        raise TrialValidationError("Approved AI context forbidden actions are invalid.")
    handoff = _exact(export["handoff"], ("activationRequired", "route"), "Approved AI context handoff")
    if handoff["route"] != "managed_activation_review" or handoff["activationRequired"] is not True:
        raise TrialValidationError("Approved AI context handoff is invalid.")
    owner_review = _exact(export["ownerReview"], ("reviewedAt", "reviewedBy", "status"), "Approved AI context owner review")
    if owner_review["status"] != "approved_for_managed_review":
        raise TrialValidationError("Approved AI context owner review is invalid.")
    reviewed_by = _text(owner_review["reviewedBy"], "Approved AI context reviewer", 120)
    reviewed_at = _timestamp(owner_review["reviewedAt"], "Approved AI context review timestamp")
    privacy = _exact(
        export["privacyBoundary"],
        (
            "externalSendPerformed",
            "managedWritePerformed",
            "modelTrainingAllowed",
            "rawBehaviorEntriesIncluded",
            "rawDecisionRecordsIncluded",
            "rawProductRecordsIncluded",
        ),
        "Approved AI context privacy boundary",
    )
    if any(privacy[key] is not False for key in privacy):
        raise TrialValidationError("Approved AI context must remain summary-only, unsent, unwritten, and training-disabled.")
    normalized = {
        "contract": MANAGED_AI_CONTEXT_EXPORT_CONTRACT,
        "version": 1,
        "product": product,
        "templateId": template_id,
        "sourceCounts": normalized_counts,
        "behaviorPreference": normalized_behavior,
        "outcome": {"status": outcome_status, "digest": outcome_digest, "accepted": True},
        "allowedUses": list(MANAGED_CONTEXT_ALLOWED_USES),
        "forbiddenActions": list(MANAGED_CONTEXT_FORBIDDEN_ACTIONS),
        "handoff": {"route": "managed_activation_review", "activationRequired": True},
        "ownerReview": {"status": "approved_for_managed_review", "reviewedBy": reviewed_by, "reviewedAt": reviewed_at},
        "privacyBoundary": {
            "rawProductRecordsIncluded": False,
            "rawBehaviorEntriesIncluded": False,
            "rawDecisionRecordsIncluded": False,
            "externalSendPerformed": False,
            "managedWritePerformed": False,
            "modelTrainingAllowed": False,
        },
    }
    context_digest = _sha256_digest(export["contextDigest"], "Approved AI context digest")
    if context_digest != managed_ai_context_export_digest(normalized):
        raise TrialValidationError("Approved AI context digest does not match its summary.")
    return {**normalized, "contextDigest": context_digest}


def validate_managed_context_request(value: object) -> dict[str, object]:
    """Validate the summary-only package prepared by the free workspace."""

    request = _exact(
        value,
        (
            "allowedUses",
            "behaviorPreference",
            "contract",
            "forbiddenActions",
            "modelTrainingAllowed",
            "ownerApproved",
            "product",
            "rawProductRecordsIncluded",
            "sourceCounts",
            "templateId",
            "version",
        ),
        "Managed context request",
    )
    if request["contract"] != MANAGED_CONTEXT_REQUEST_CONTRACT or request["version"] != 1:
        raise TrialValidationError("Managed context request contract is invalid.")
    product = _text(request["product"], "Managed context product", 24)
    if product not in _PRODUCTS:
        raise TrialValidationError("Managed context product is unsupported.")
    template_id = _text(request["templateId"], "Managed context template", 120)
    if template_id not in _PRODUCT_TEMPLATES[product]:
        raise TrialValidationError("Managed context template is unsupported for this product.")
    source_counts = _exact(
        request["sourceCounts"],
        ("behaviorSignals", "reviewedDecisions", "selectedProductRecords"),
        "Managed context source counts",
    )
    selected_records = _count(
        source_counts["selectedProductRecords"],
        "Selected product record count",
        minimum=1,
        maximum=100_000,
    )
    behavior_signals = _count(
        source_counts["behaviorSignals"],
        "Behavior signal count",
        minimum=1,
        maximum=80,
    )
    reviewed_decisions = _count(
        source_counts["reviewedDecisions"],
        "Reviewed decision count",
        minimum=1,
        maximum=10_000,
    )
    behavior = _exact(
        request["behaviorPreference"],
        ("chosenCount", "product"),
        "Managed behavior preference",
    )
    behavior_product = _text(behavior["product"], "Managed behavior product", 24)
    if behavior_product not in _BEHAVIOR_PRODUCTS:
        raise TrialValidationError("Managed behavior product is unsupported.")
    chosen_count = _count(
        behavior["chosenCount"],
        "Managed behavior chosen count",
        minimum=1,
        maximum=behavior_signals,
    )
    allowed_uses = request["allowedUses"]
    forbidden_actions = request["forbiddenActions"]
    if not isinstance(allowed_uses, list) or tuple(allowed_uses) != MANAGED_CONTEXT_ALLOWED_USES:
        raise TrialValidationError("Managed context allowed uses are invalid.")
    if not isinstance(forbidden_actions, list) or tuple(forbidden_actions) != MANAGED_CONTEXT_FORBIDDEN_ACTIONS:
        raise TrialValidationError("Managed context forbidden actions are invalid.")
    if request["ownerApproved"] is not True:
        raise TrialValidationError("Managed context requires explicit owner approval.")
    if request["rawProductRecordsIncluded"] is not False or request["modelTrainingAllowed"] is not False:
        raise TrialValidationError("Managed context must remain summary-only and training-disabled.")
    return {
        "contract": MANAGED_CONTEXT_REQUEST_CONTRACT,
        "version": 1,
        "product": product,
        "templateId": template_id,
        "sourceCounts": {
            "selectedProductRecords": selected_records,
            "behaviorSignals": behavior_signals,
            "reviewedDecisions": reviewed_decisions,
        },
        "behaviorPreference": {
            "product": behavior_product,
            "chosenCount": chosen_count,
        },
        "allowedUses": list(MANAGED_CONTEXT_ALLOWED_USES),
        "forbiddenActions": list(MANAGED_CONTEXT_FORBIDDEN_ACTIONS),
        "ownerApproved": True,
        "rawProductRecordsIncluded": False,
        "modelTrainingAllowed": False,
    }


def _legacy_managed_context_profile_digest(
    request: Mapping[str, object],
    *,
    workspace_id: str,
    actor_id: str,
) -> str:
    source_counts = request["sourceCounts"]
    behavior = request["behaviorPreference"]
    assert isinstance(source_counts, Mapping)
    assert isinstance(behavior, Mapping)
    projection = [
        LEGACY_MANAGED_CONTEXT_PROFILE_CONTRACT,
        1,
        workspace_id,
        actor_id,
        request["product"],
        request["templateId"],
        source_counts["selectedProductRecords"],
        source_counts["behaviorSignals"],
        source_counts["reviewedDecisions"],
        behavior["product"],
        behavior["chosenCount"],
        *MANAGED_CONTEXT_ALLOWED_USES,
        "|",
        *MANAGED_CONTEXT_FORBIDDEN_ACTIONS,
    ]
    return f"sha256:{sha256(_canonical_json(projection).encode('utf-8')).hexdigest()}"


def managed_context_profile_digest(
    approved_context: Mapping[str, object],
    *,
    workspace_id: str,
    actor_id: str,
) -> str:
    source_counts = approved_context["sourceCounts"]
    behavior = approved_context["behaviorPreference"]
    outcome = approved_context["outcome"]
    owner_review = approved_context["ownerReview"]
    assert isinstance(source_counts, Mapping)
    assert isinstance(behavior, Mapping)
    assert isinstance(outcome, Mapping)
    assert isinstance(owner_review, Mapping)
    projection = [
        MANAGED_CONTEXT_PROFILE_CONTRACT,
        2,
        workspace_id,
        actor_id,
        approved_context["contextDigest"],
        approved_context["product"],
        approved_context["templateId"],
        source_counts["selectedProductRecords"],
        source_counts["behaviorSignals"],
        source_counts["reviewedDecisions"],
        behavior["product"],
        behavior["chosenCount"],
        outcome["status"],
        outcome["digest"],
        outcome["accepted"],
        owner_review["reviewedBy"],
        owner_review["reviewedAt"],
        *MANAGED_CONTEXT_ALLOWED_USES,
        "|",
        *MANAGED_CONTEXT_FORBIDDEN_ACTIONS,
        False,
        False,
        False,
        False,
    ]
    return f"sha256:{sha256(_canonical_json(projection).encode('utf-8')).hexdigest()}"


def managed_context_validation_digest(
    profile_digest: str,
    *,
    workspace_id: str,
    actor_id: str,
    company_version: int,
) -> str:
    workspace = _text(workspace_id, "Managed context workspace", 128)
    actor = _text(actor_id, "Managed context actor", 128)
    version = _count(company_version, "Managed context company version")
    profile_digest = _sha256_digest(profile_digest, "Managed context profile digest")
    projection = [
        MANAGED_CONTEXT_VALIDATION_CONTRACT,
        2,
        workspace,
        actor,
        profile_digest,
        version,
    ]
    return f"sha256:{sha256(_canonical_json(projection).encode('utf-8')).hexdigest()}"


def build_managed_context_profile(
    value: object,
    *,
    workspace_id: str,
    actor_id: str,
) -> dict[str, object]:
    approved_context = validate_managed_ai_context_export(value)
    workspace = _text(workspace_id, "Managed context workspace", 128)
    actor = _text(actor_id, "Managed context actor", 128)
    outcome = approved_context["outcome"]
    owner_review = approved_context["ownerReview"]
    assert isinstance(outcome, Mapping)
    assert isinstance(owner_review, Mapping)
    return {
        "contract": MANAGED_CONTEXT_PROFILE_CONTRACT,
        "version": 2,
        "workspaceId": workspace,
        "retainedBy": actor,
        "approvedContextDigest": approved_context["contextDigest"],
        "product": approved_context["product"],
        "templateId": approved_context["templateId"],
        "sourceCounts": deepcopy(approved_context["sourceCounts"]),
        "behaviorPreference": deepcopy(approved_context["behaviorPreference"]),
        "outcome": deepcopy(outcome),
        "approvedBy": owner_review["reviewedBy"],
        "approvedAt": owner_review["reviewedAt"],
        "allowedUses": list(MANAGED_CONTEXT_ALLOWED_USES),
        "forbiddenActions": list(MANAGED_CONTEXT_FORBIDDEN_ACTIONS),
        "profileDigest": managed_context_profile_digest(approved_context, workspace_id=workspace, actor_id=actor),
        "rawProductRecordsIncluded": False,
        "rawBehaviorEntriesIncluded": False,
        "rawDecisionRecordsIncluded": False,
        "modelTrainingAllowed": False,
    }


def _validate_legacy_managed_context_profile(value: object) -> dict[str, object]:
    profile = _exact(value, tuple(_LEGACY_PROFILE_KEYS), "Legacy managed context profile")
    if profile["contract"] != LEGACY_MANAGED_CONTEXT_PROFILE_CONTRACT or profile["version"] != 1:
        raise TrialValidationError("Legacy managed context profile contract is invalid.")
    request = validate_managed_context_request(
        {
            "contract": MANAGED_CONTEXT_REQUEST_CONTRACT,
            "version": 1,
            "product": profile["product"],
            "templateId": profile["templateId"],
            "sourceCounts": profile["sourceCounts"],
            "behaviorPreference": profile["behaviorPreference"],
            "allowedUses": profile["allowedUses"],
            "forbiddenActions": profile["forbiddenActions"],
            "ownerApproved": True,
            "rawProductRecordsIncluded": profile["rawProductRecordsIncluded"],
            "modelTrainingAllowed": profile["modelTrainingAllowed"],
        }
    )
    workspace_id = _text(profile["workspaceId"], "Managed context workspace", 128)
    actor_id = _text(profile["retainedBy"], "Managed context actor", 128)
    expected_digest = _legacy_managed_context_profile_digest(request, workspace_id=workspace_id, actor_id=actor_id)
    if profile["profileDigest"] != expected_digest:
        raise TrialValidationError("Legacy managed context profile digest is invalid.")
    return deepcopy(dict(profile))


def validate_managed_context_profile(value: object) -> dict[str, object]:
    if isinstance(value, Mapping) and value.get("contract") == LEGACY_MANAGED_CONTEXT_PROFILE_CONTRACT:
        return _validate_legacy_managed_context_profile(value)
    profile = _exact(value, tuple(_PROFILE_KEYS), "Managed context profile")
    if profile["contract"] != MANAGED_CONTEXT_PROFILE_CONTRACT or profile["version"] != 2:
        raise TrialValidationError("Managed context profile contract is invalid.")
    approved_context = validate_managed_ai_context_export(
        {
            "contract": MANAGED_AI_CONTEXT_EXPORT_CONTRACT,
            "version": 1,
            "product": profile["product"],
            "templateId": profile["templateId"],
            "sourceCounts": profile["sourceCounts"],
            "behaviorPreference": profile["behaviorPreference"],
            "outcome": profile["outcome"],
            "allowedUses": profile["allowedUses"],
            "forbiddenActions": profile["forbiddenActions"],
            "handoff": {"route": "managed_activation_review", "activationRequired": True},
            "ownerReview": {
                "status": "approved_for_managed_review",
                "reviewedBy": profile["approvedBy"],
                "reviewedAt": profile["approvedAt"],
            },
            "privacyBoundary": {
                "rawProductRecordsIncluded": profile["rawProductRecordsIncluded"],
                "rawBehaviorEntriesIncluded": profile["rawBehaviorEntriesIncluded"],
                "rawDecisionRecordsIncluded": profile["rawDecisionRecordsIncluded"],
                "externalSendPerformed": False,
                "managedWritePerformed": False,
                "modelTrainingAllowed": profile["modelTrainingAllowed"],
            },
            "contextDigest": profile["approvedContextDigest"],
        }
    )
    workspace_id = _text(profile["workspaceId"], "Managed context workspace", 128)
    actor_id = _text(profile["retainedBy"], "Managed context actor", 128)
    expected_digest = managed_context_profile_digest(approved_context, workspace_id=workspace_id, actor_id=actor_id)
    if profile["profileDigest"] != expected_digest:
        raise TrialValidationError("Managed context profile digest is invalid.")
    return deepcopy(dict(profile))


def managed_context_from_company_state(
    state: Mapping[str, Any] | None,
    *,
    workspace_id: str | None = None,
) -> dict[str, object] | None:
    if not isinstance(state, Mapping) or "managedContextProfile" not in state:
        return None
    try:
        profile = validate_managed_context_profile(state["managedContextProfile"])
        if workspace_id is not None and profile["workspaceId"] != workspace_id:
            return None
        return profile
    except TrialValidationError:
        return None


def managed_context_brief_projection(profile: Mapping[str, object] | None) -> dict[str, object] | None:
    if profile is None:
        return None
    try:
        validated = validate_managed_context_profile(profile)
    except TrialValidationError:
        return None
    behavior = validated["behaviorPreference"]
    assert isinstance(behavior, Mapping)
    if validated["contract"] == LEGACY_MANAGED_CONTEXT_PROFILE_CONTRACT:
        return {
            "contract": LEGACY_MANAGED_CONTEXT_BRIEF_PROJECTION_CONTRACT,
            "version": 1,
            "profileDigest": validated["profileDigest"],
            "preferredProduct": behavior["product"],
        }
    outcome = validated["outcome"]
    assert isinstance(outcome, Mapping)
    return {
        "contract": MANAGED_CONTEXT_BRIEF_PROJECTION_CONTRACT,
        "version": 2,
        "profileDigest": validated["profileDigest"],
        "approvedContextDigest": validated["approvedContextDigest"],
        "acceptedOutcomeDigest": outcome["digest"],
        "preferredProduct": behavior["product"],
    }


def _receipt_summary(value: Mapping[str, object]) -> tuple[str, str, dict[str, int], dict[str, object]]:
    product = _text(value["product"], "Managed context receipt product", 24)
    template_id = _text(value["templateId"], "Managed context receipt template", 120)
    if product not in _PRODUCTS or template_id not in _PRODUCT_TEMPLATES[product]:
        raise TrialValidationError("Managed context receipt product template is invalid.")
    source_counts = _exact(
        value["sourceCounts"],
        ("behaviorSignals", "reviewedDecisions", "selectedProductRecords"),
        "Managed context receipt source counts",
    )
    behavior_signals = _count(source_counts["behaviorSignals"], "Managed context receipt behavior count", minimum=1, maximum=80)
    normalized_counts = {
        "selectedProductRecords": _count(source_counts["selectedProductRecords"], "Managed context receipt source count", minimum=1, maximum=100_000),
        "behaviorSignals": behavior_signals,
        "reviewedDecisions": _count(source_counts["reviewedDecisions"], "Managed context receipt decision count", minimum=1, maximum=10_000),
    }
    behavior = _exact(value["behaviorPreference"], ("chosenCount", "product"), "Managed context receipt behavior")
    behavior_product = _text(behavior["product"], "Managed context receipt behavior product", 24)
    if behavior_product not in _BEHAVIOR_PRODUCTS:
        raise TrialValidationError("Managed context receipt behavior product is invalid.")
    normalized_behavior = {
        "product": behavior_product,
        "chosenCount": _count(behavior["chosenCount"], "Managed context receipt choice count", minimum=1, maximum=behavior_signals),
    }
    return product, template_id, normalized_counts, normalized_behavior


def _validate_context_receipt(value: object) -> dict[str, object]:
    if isinstance(value, Mapping) and value.get("contract") == LEGACY_MANAGED_CONTEXT_RECEIPT_CONTRACT:
        receipt = _exact(
            value,
            (
                "behaviorPreference",
                "contract",
                "modelTrainingAllowed",
                "product",
                "profileDigest",
                "rawProductRecordsIncluded",
                "sourceCounts",
                "templateId",
            ),
            "Legacy managed context receipt",
        )
        product, template_id, normalized_counts, normalized_behavior = _receipt_summary(receipt)
        profile_digest = _sha256_digest(receipt["profileDigest"], "Legacy managed context receipt profile digest")
        if receipt["rawProductRecordsIncluded"] is not False or receipt["modelTrainingAllowed"] is not False:
            raise TrialValidationError("Legacy managed context receipt must remain summary-only and training-disabled.")
        return {
            "contract": LEGACY_MANAGED_CONTEXT_RECEIPT_CONTRACT,
            "profileDigest": profile_digest,
            "product": product,
            "templateId": template_id,
            "sourceCounts": normalized_counts,
            "behaviorPreference": normalized_behavior,
            "rawProductRecordsIncluded": False,
            "modelTrainingAllowed": False,
        }
    receipt = _exact(
        value,
        (
            "acceptedOutcomeDigest",
            "approvedContextDigest",
            "behaviorPreference",
            "contract",
            "modelTrainingAllowed",
            "product",
            "profileDigest",
            "rawBehaviorEntriesIncluded",
            "rawDecisionRecordsIncluded",
            "rawProductRecordsIncluded",
            "sourceCounts",
            "templateId",
        ),
        "Managed context receipt",
    )
    if receipt["contract"] != MANAGED_CONTEXT_RECEIPT_CONTRACT:
        raise TrialValidationError("Managed context receipt contract is invalid.")
    product, template_id, normalized_counts, normalized_behavior = _receipt_summary(receipt)
    profile_digest = _sha256_digest(receipt["profileDigest"], "Managed context receipt profile digest")
    approved_context_digest = _sha256_digest(receipt["approvedContextDigest"], "Managed context receipt approved digest")
    accepted_outcome_digest = _sha256_digest(receipt["acceptedOutcomeDigest"], "Managed context receipt outcome digest")
    if (
        receipt["rawProductRecordsIncluded"] is not False
        or receipt["rawBehaviorEntriesIncluded"] is not False
        or receipt["rawDecisionRecordsIncluded"] is not False
        or receipt["modelTrainingAllowed"] is not False
    ):
        raise TrialValidationError("Managed context receipt must remain summary-only and training-disabled.")
    return {
        "contract": MANAGED_CONTEXT_RECEIPT_CONTRACT,
        "profileDigest": profile_digest,
        "approvedContextDigest": approved_context_digest,
        "acceptedOutcomeDigest": accepted_outcome_digest,
        "product": product,
        "templateId": template_id,
        "sourceCounts": normalized_counts,
        "behaviorPreference": normalized_behavior,
        "rawProductRecordsIncluded": False,
        "rawBehaviorEntriesIncluded": False,
        "rawDecisionRecordsIncluded": False,
        "modelTrainingAllowed": False,
    }


def company_state_with_context_profile(
    current: Mapping[str, Any],
    profile: Mapping[str, object],
) -> dict[str, object]:
    validated = validate_managed_context_profile(profile)
    tasks = current.get("tasks", [])
    brief_receipts = current.get("briefReceipts", [])
    context_receipts = current.get("managedContextReceipts", [])
    if not isinstance(tasks, list) or not isinstance(brief_receipts, list) or not isinstance(context_receipts, list):
        raise TrialValidationError("Company state cannot retain managed context safely.")
    if validated["contract"] != MANAGED_CONTEXT_PROFILE_CONTRACT:
        raise TrialValidationError("Only outcome-bound managed context can be newly retained.")
    outcome = validated["outcome"]
    assert isinstance(outcome, Mapping)
    receipt = {
        "contract": MANAGED_CONTEXT_RECEIPT_CONTRACT,
        "profileDigest": validated["profileDigest"],
        "approvedContextDigest": validated["approvedContextDigest"],
        "acceptedOutcomeDigest": outcome["digest"],
        "product": validated["product"],
        "templateId": validated["templateId"],
        "sourceCounts": deepcopy(validated["sourceCounts"]),
        "behaviorPreference": deepcopy(validated["behaviorPreference"]),
        "rawProductRecordsIncluded": False,
        "rawBehaviorEntriesIncluded": False,
        "rawDecisionRecordsIncluded": False,
        "modelTrainingAllowed": False,
    }
    retained = []
    for candidate in context_receipts:
        try:
            retained.append(_validate_context_receipt(candidate))
        except TrialValidationError:
            continue
        if len(retained) == 30:
            break
    if not any(candidate.get("profileDigest") == receipt["profileDigest"] for candidate in retained):
        retained = [receipt, *deepcopy(retained)][:30]
    return {
        **deepcopy(dict(current)),
        "tasks": deepcopy(tasks),
        "briefReceipts": deepcopy(brief_receipts),
        "managedContextProfile": validated,
        "managedContextReceipts": retained,
    }


__all__ = [
    "MANAGED_AI_CONTEXT_EXPORT_CONTRACT",
    "MANAGED_CONTEXT_ALLOWED_USES",
    "MANAGED_CONTEXT_BRIEF_PROJECTION_CONTRACT",
    "MANAGED_CONTEXT_FORBIDDEN_ACTIONS",
    "MANAGED_CONTEXT_PROFILE_CONTRACT",
    "MANAGED_CONTEXT_RECEIPT_CONTRACT",
    "MANAGED_CONTEXT_REQUEST_CONTRACT",
    "MANAGED_CONTEXT_RETENTION_CONTRACT",
    "MANAGED_CONTEXT_VALIDATION_CONTRACT",
    "build_managed_context_profile",
    "company_state_with_context_profile",
    "managed_ai_context_export_digest",
    "managed_ai_context_export_projection",
    "managed_context_brief_projection",
    "managed_context_from_company_state",
    "managed_context_profile_digest",
    "managed_context_validation_digest",
    "validate_managed_ai_context_export",
    "validate_managed_context_profile",
    "validate_managed_context_request",
]
