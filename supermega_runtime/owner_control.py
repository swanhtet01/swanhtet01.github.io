"""Evidence-bound owner control runs for managed SuperMega workspaces."""

from __future__ import annotations

from collections.abc import Mapping
from copy import deepcopy
from hashlib import sha256
import json
from typing import Any

from supermega_runtime.company_brief import (
    assert_brief_sources_unchanged,
    build_managed_company_brief,
    validate_operating_baseline,
)
from supermega_runtime.trial_store import TrialState, TrialValidationError


OWNER_CONTROL_RUN_CONTRACT = "supermega.managed_owner_control_run.v1"
OWNER_CONTROL_ACKNOWLEDGEMENT_CONTRACT = "supermega.managed_owner_control_acknowledgement.v1"
_INTENTS = (
    "shop_inventory",
    "plant_control",
    "website_readiness",
    "ecommerce_readiness",
)
_PRODUCTS = ("shop", "plant", "website", "ecommerce")
_INTENT_PRODUCT = dict(zip(_INTENTS, _PRODUCTS, strict=True))
_SOURCE_SURFACES = ("commerce", "production", "website")
_MAX_ACKNOWLEDGEMENTS = len(_PRODUCTS)
_BOUNDARY = (
    "This run reads tenant-scoped aggregate evidence and records only an explicit owner acknowledgement. "
    "It does not send messages, publish, charge, move stock, write production, or train models."
)


def _canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"), sort_keys=True)


def _digest(value: object) -> str:
    return f"sha256:{sha256(_canonical_json(value).encode('utf-8')).hexdigest()}"


def _digest_text(value: object, label: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != 71
        or not value.startswith("sha256:")
        or any(character not in "0123456789abcdef" for character in value[7:])
    ):
        raise TrialValidationError(f"{label} is invalid.")
    return value


def _bounded_text(value: object, label: str, maximum: int) -> str:
    if not isinstance(value, str) or not value or value != value.strip() or len(value) > maximum:
        raise TrialValidationError(f"{label} is invalid.")
    return value


def _priority(attention_level: int) -> str:
    if attention_level >= 4:
        return "critical"
    if attention_level >= 2:
        return "high"
    return "routine"


def _validate_source_versions(value: object) -> list[dict[str, object]]:
    if not isinstance(value, list) or len(value) > len(_SOURCE_SURFACES):
        raise TrialValidationError("Owner control source versions are invalid.")
    normalized: list[dict[str, object]] = []
    seen: set[str] = set()
    for source in value:
        expected = {"surface", "version", "updatedAt", "projectionDigest"}
        if not isinstance(source, Mapping) or set(source) != expected:
            raise TrialValidationError("Owner control source version has an invalid shape.")
        surface = source["surface"]
        version = source["version"]
        updated_at = source["updatedAt"]
        if (
            surface not in _SOURCE_SURFACES
            or surface in seen
            or not isinstance(version, int)
            or isinstance(version, bool)
            or version < 0
            or not isinstance(updated_at, str)
            or len(updated_at) > 64
        ):
            raise TrialValidationError("Owner control source version is invalid.")
        seen.add(str(surface))
        normalized.append({
            "surface": surface,
            "version": version,
            "updatedAt": updated_at,
            "projectionDigest": _digest_text(source["projectionDigest"], "Owner control source digest"),
        })
    return normalized


def _ranked_intents(baseline: Mapping[str, object]) -> list[tuple[str, int]]:
    products = baseline["products"]
    if not isinstance(products, Mapping):
        raise TrialValidationError("Owner control baseline products are invalid.")
    ranked: list[tuple[int, int, int, str]] = []
    for order, (intent, product) in enumerate(zip(_INTENTS, _PRODUCTS, strict=True)):
        current = products[product]
        if not isinstance(current, Mapping):
            raise TrialValidationError("Owner control product baseline is invalid.")
        status = current["status"]
        if status == "missing":
            continue
        if product == "ecommerce" and status == "invalid" and products["shop"]["status"] == "invalid":
            continue
        level = 5 if status == "invalid" and product == "plant" else 3 if status == "invalid" else int(current["attentionLevel"])
        ranked.append((level, int(current["reviewLoad"]), -order, intent))
    if not ranked:
        return [("shop_inventory", 0)]
    ranked.sort(reverse=True)
    return [(intent, level) for level, _, _, intent in ranked[:3]]


def _validate_acknowledgement(value: object, *, workspace_id: str) -> dict[str, object]:
    expected = {
        "contract",
        "workspaceId",
        "runDigest",
        "itemId",
        "product",
        "retainedBy",
        "operatingBaselineDigest",
        "sourceVersions",
    }
    if not isinstance(value, Mapping) or set(value) != expected:
        raise TrialValidationError("Owner control acknowledgement has an invalid shape.")
    if value["contract"] != OWNER_CONTROL_ACKNOWLEDGEMENT_CONTRACT or value["workspaceId"] != workspace_id:
        raise TrialValidationError("Owner control acknowledgement identity is invalid.")
    product = value["product"]
    if product not in _PRODUCTS:
        raise TrialValidationError("Owner control acknowledgement product is invalid.")
    return {
        "contract": OWNER_CONTROL_ACKNOWLEDGEMENT_CONTRACT,
        "workspaceId": workspace_id,
        "runDigest": _digest_text(value["runDigest"], "Owner control run digest"),
        "itemId": _digest_text(value["itemId"], "Owner control item ID"),
        "product": product,
        "retainedBy": _bounded_text(value["retainedBy"], "Owner control reviewer", 128),
        "operatingBaselineDigest": _digest_text(value["operatingBaselineDigest"], "Owner control baseline digest"),
        "sourceVersions": _validate_source_versions(value["sourceVersions"]),
    }


def _retained_acknowledgements(
    company_state: Mapping[str, Any] | None,
    *,
    workspace_id: str,
) -> list[dict[str, object]]:
    if not isinstance(company_state, Mapping) or not isinstance(company_state.get("ownerControlAcknowledgements"), list):
        return []
    retained: list[dict[str, object]] = []
    seen: set[tuple[str, str]] = set()
    for candidate in company_state["ownerControlAcknowledgements"]:
        try:
            acknowledgement = _validate_acknowledgement(candidate, workspace_id=workspace_id)
        except TrialValidationError:
            continue
        key = (str(acknowledgement["runDigest"]), str(acknowledgement["itemId"]))
        if key in seen:
            continue
        seen.add(key)
        retained.append(acknowledgement)
        if len(retained) == _MAX_ACKNOWLEDGEMENTS:
            break
    return retained


def build_managed_owner_control_run(
    *,
    workspace_id: str,
    states: Mapping[str, TrialState],
) -> dict[str, object]:
    """Build one reproducible owner-control run from managed aggregate evidence."""

    attention = build_managed_company_brief(
        workspace_id=workspace_id,
        intent="attention",
        states=states,
        approvals=(),
    )
    baseline = validate_operating_baseline(attention["operatingBaseline"], workspace_id=workspace_id)
    item_basis: list[dict[str, object]] = []
    for intent, effective_level in _ranked_intents(baseline):
        brief = build_managed_company_brief(
            workspace_id=workspace_id,
            intent=intent,
            states=states,
            approvals=(),
        )
        product = _INTENT_PRODUCT[intent]
        product_baseline = baseline["products"][product]
        if not isinstance(product_baseline, Mapping):
            raise TrialValidationError("Owner control product baseline is invalid.")
        action = deepcopy(brief["nextAction"])
        item_id = _digest({
            "contract": "supermega.managed_owner_control_item.v1",
            "baselineDigest": baseline["baselineDigest"],
            "intent": intent,
            "action": action,
        })
        item_basis.append({
            "itemId": item_id,
            "intent": intent,
            "product": product,
            "priority": _priority(effective_level),
            "title": brief["title"],
            "summary": brief["summary"],
            "facts": deepcopy(brief["facts"]),
            "nextAction": action,
        })
    run_basis = {
        "contract": OWNER_CONTROL_RUN_CONTRACT,
        "workspaceId": workspace_id,
        "sourceVersions": deepcopy(attention["sourceVersions"]),
        "operatingBaselineDigest": baseline["baselineDigest"],
        "items": item_basis,
    }
    run_digest = _digest(run_basis)
    company = states.get("company")
    acknowledgements = {
        str(acknowledgement["itemId"]): acknowledgement
        for acknowledgement in _retained_acknowledgements(company.state if company else None, workspace_id=workspace_id)
        if acknowledgement["runDigest"] == run_digest
    }
    items = [
        {
            **deepcopy(item),
            "status": "acknowledged" if str(item["itemId"]) in acknowledgements else "pending",
        }
        for item in item_basis
    ]
    pending = [item for item in items if item["status"] == "pending"]
    source_count = int(attention["sourceCount"])
    if source_count == 0:
        title = "Start with one trusted business source"
        summary = "Import or prepare one product before relying on a managed operating recommendation."
    elif pending:
        title = f"{len(pending)} current review{'s' if len(pending) != 1 else ''}"
        summary = "SuperMega ranked current managed exceptions. Open the first workflow, then acknowledge the exact evidence reviewed."
    else:
        title = "Current control run is clear"
        summary = "Every item from the current managed baseline has an owner acknowledgement. Changed source evidence creates a fresh run."
    return {
        **run_basis,
        "runDigest": run_digest,
        "sourceCount": source_count,
        "pendingCount": len(pending),
        "acknowledgedCount": len(items) - len(pending),
        "primaryItemId": pending[0]["itemId"] if pending else None,
        "title": title,
        "summary": summary,
        "items": items,
        "operatingBaseline": baseline,
        "boundary": _BOUNDARY,
        "externalWritesPerformed": False,
    }


def owner_control_acknowledgement(
    run: Mapping[str, object],
    *,
    item_id: str,
    retained_by: str,
) -> dict[str, object]:
    if run.get("contract") != OWNER_CONTROL_RUN_CONTRACT:
        raise TrialValidationError("Owner control acknowledgement request is invalid.")
    items = run.get("items")
    if not isinstance(items, list):
        raise TrialValidationError("Owner control run items are invalid.")
    selected = next((item for item in items if isinstance(item, Mapping) and item.get("itemId") == item_id), None)
    if selected is None or selected.get("status") != "pending":
        raise TrialValidationError("Owner control item is not pending in the current run.")
    receipt = {
        "contract": OWNER_CONTROL_ACKNOWLEDGEMENT_CONTRACT,
        "workspaceId": run["workspaceId"],
        "runDigest": run["runDigest"],
        "itemId": selected["itemId"],
        "product": selected["product"],
        "retainedBy": retained_by,
        "operatingBaselineDigest": run["operatingBaselineDigest"],
        "sourceVersions": deepcopy(run["sourceVersions"]),
    }
    return _validate_acknowledgement(receipt, workspace_id=str(run["workspaceId"]))


def company_state_with_owner_control_acknowledgement(
    current: Mapping[str, Any],
    acknowledgement: Mapping[str, object],
) -> dict[str, object]:
    tasks = current.get("tasks", [])
    receipts = current.get("ownerControlAcknowledgements", [])
    if not isinstance(tasks, list) or not isinstance(receipts, list) or len(receipts) > 1_000:
        raise TrialValidationError("Company state cannot retain an owner control acknowledgement safely.")
    workspace_id = str(acknowledgement.get("workspaceId", ""))
    validated = _validate_acknowledgement(acknowledgement, workspace_id=workspace_id)
    retained = _retained_acknowledgements({"ownerControlAcknowledgements": receipts}, workspace_id=workspace_id)
    key = (validated["runDigest"], validated["itemId"])
    retained = [
        candidate
        for candidate in retained
        if (candidate["runDigest"], candidate["itemId"]) != key
        and candidate["product"] != validated["product"]
    ]
    return {
        **deepcopy(dict(current)),
        "tasks": deepcopy(tasks),
        "ownerControlAcknowledgements": [validated, *retained][:_MAX_ACKNOWLEDGEMENTS],
    }


def assert_owner_control_sources_unchanged(
    run: Mapping[str, object],
    related_states: Mapping[str, Mapping[str, Any]],
    *,
    workspace_id: str,
) -> None:
    baseline = validate_operating_baseline(run.get("operatingBaseline"), workspace_id=workspace_id)
    if baseline["baselineDigest"] != run.get("operatingBaselineDigest"):
        raise TrialValidationError("Owner control operating baseline changed before acknowledgement.")
    assert_brief_sources_unchanged(
        baseline["sourceVersions"],
        related_states,
        workspace_id=workspace_id,
    )


__all__ = [
    "OWNER_CONTROL_ACKNOWLEDGEMENT_CONTRACT",
    "OWNER_CONTROL_RUN_CONTRACT",
    "assert_owner_control_sources_unchanged",
    "build_managed_owner_control_run",
    "company_state_with_owner_control_acknowledgement",
    "owner_control_acknowledgement",
]
