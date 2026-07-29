"""Tenant-scoped operating briefs for managed SuperMega workspaces."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from copy import deepcopy
from hashlib import sha256
import json
from typing import Any

from supermega_runtime.commerce_runtime import validate_commerce_state
from supermega_runtime.production_runtime import validate_production_state
from supermega_runtime.trial_store import ApprovalRecord, TrialState, TrialValidationError
from supermega_runtime.website_runtime import validate_website_state


COMPANY_BRIEF_CONTRACT = "supermega.managed_company_brief.v1"
COMPANY_BRIEF_RECEIPT_CONTRACT = "supermega.managed_company_brief_receipt.v1"
COMPANY_BRIEF_INTENTS = frozenset(
    {
        "attention",
        "shop_inventory",
        "plant_control",
        "website_readiness",
        "ecommerce_readiness",
    }
)
_PRODUCT_SURFACES = ("commerce", "production", "website")
_SAFE_ACTIONS = {
    "shop_inventory": ("shop", "/shop/?tab=inventory", "Review Shop inventory"),
    "plant_control": ("plant", "/plant/?tab=production", "Open Plant control"),
    "website_readiness": ("website", "/website/", "Finish Website review"),
    "ecommerce_readiness": ("ecommerce", "/ecommerce/", "Review Ecommerce setup"),
}
_BOUNDARY = (
    "This managed brief reads tenant-scoped validated snapshots and approval status. "
    "It does not send messages, publish, charge, move stock, write production, or train models. "
    "Keeping it as evidence is a separate authenticated company write."
)


def _canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"), sort_keys=True)


def _digest(value: object) -> str:
    return f"sha256:{sha256(_canonical_json(value).encode('utf-8')).hexdigest()}"


def _source_reference(record: TrialState) -> dict[str, object]:
    return {
        "surface": record.surface,
        "version": record.version,
        "updatedAt": record.updated_at,
        "stateDigest": _digest(record.state),
    }


def _empty_shop(status: str = "missing") -> dict[str, object]:
    return {
        "status": status,
        "itemCount": 0,
        "lowStock": 0,
        "activeOrders": 0,
        "moneyExceptions": 0,
        "incomingRequests": 0,
    }


def _empty_plant(status: str = "missing") -> dict[str, object]:
    return {
        "status": status,
        "jobCount": 0,
        "unfinishedJobs": 0,
        "heldJobs": 0,
        "priorityIssues": 0,
        "openIssues": 0,
        "stoppedMachines": 0,
    }


def _empty_website(status: str = "missing") -> dict[str, object]:
    return {
        "status": status,
        "pageCount": 0,
        "readyPages": 0,
        "approved": False,
        "released": False,
    }


def _empty_ecommerce(status: str = "missing") -> dict[str, object]:
    return {
        "status": status,
        "selectedSkus": 0,
        "incomingRequests": 0,
        "shopSourceReady": False,
    }


def _project_commerce(record: TrialState | None) -> tuple[dict[str, object], dict[str, object]]:
    if record is None or (record.version == 0 and not record.state):
        return _empty_shop(), _empty_ecommerce()
    try:
        state = validate_commerce_state(record.state)
    except TrialValidationError:
        return _empty_shop("invalid"), _empty_ecommerce("invalid")
    items = state["items"]
    orders = state["orders"]
    requests = state.get("storefrontRequests", [])
    configuration = state.get("storefrontConfiguration")
    shop = {
        "status": "ready",
        "itemCount": len(items),
        "lowStock": sum(1 for item in items if item["onHand"] <= item["reorderAt"]),
        "activeOrders": sum(1 for order in orders if order["status"] in {"confirmed", "preparing", "ready"}),
        "moneyExceptions": sum(
            1
            for order in orders
            if order["status"] != "cancelled" and order["paymentStatus"] == "pending"
        )
        + sum(1 for order in orders if order["refundStatus"] == "due"),
        "incomingRequests": len(requests),
    }
    if not isinstance(configuration, Mapping):
        return shop, _empty_ecommerce()
    return shop, {
        "status": "ready",
        "selectedSkus": len(configuration["selectedSkus"]),
        "incomingRequests": len(requests),
        "shopSourceReady": bool(items),
    }


def _project_plant(record: TrialState | None) -> dict[str, object]:
    if record is None or (record.version == 0 and not record.state):
        return _empty_plant()
    try:
        state = validate_production_state(record.state)
    except TrialValidationError:
        return _empty_plant("invalid")
    jobs = state["jobs"]
    issues = state["issues"]
    machines = state["machines"]
    open_issues = [issue for issue in issues if issue["status"] == "open"]
    return {
        "status": "ready",
        "jobCount": len(jobs),
        "unfinishedJobs": sum(1 for job in jobs if not job.get("closure") and job["output"] < job["target"]),
        "heldJobs": sum(1 for job in jobs if bool(job.get("qualityHold")) and not job.get("closure")),
        "priorityIssues": sum(1 for issue in open_issues if issue["severity"] in {"critical", "high"}),
        "openIssues": len(open_issues),
        "stoppedMachines": sum(1 for machine in machines if machine["state"] == "stopped"),
    }


def _project_website(record: TrialState | None) -> dict[str, object]:
    if record is None or (record.version == 0 and not record.state):
        return _empty_website()
    try:
        state = validate_website_state(record.state)
    except TrialValidationError:
        return _empty_website("invalid")
    pages = state["pages"]
    current_revision = state["contentRevision"]
    current_approval_ids = {
        approval["id"]
        for approval in state["approvals"]
        if not approval["migratedFromV1"]
        and approval["source"]["contentRevision"] == current_revision
    }
    current_snapshots = [
        snapshot
        for snapshot in state["localPublishes"]
        if not snapshot["migratedFromV1"]
        and snapshot["artifact"] is not None
        and snapshot["source"]["contentRevision"] == current_revision
        and snapshot["approvalId"] in current_approval_ids
    ]
    return {
        "status": "ready",
        "pageCount": len(pages),
        "readyPages": sum(1 for page in pages if page["stage"] == "ready"),
        "approved": bool(current_approval_ids),
        "released": bool(current_snapshots),
    }


def _fact(label: str, value: str, detail: str) -> dict[str, str]:
    return {"label": label, "value": value, "detail": detail}


def _unavailable_answer(intent: str, product: str, status: str) -> dict[str, object]:
    label = "Ecommerce" if product == "ecommerce" else product.title()
    invalid = status == "invalid"
    return {
        "intent": intent,
        "title": f"{label} data needs repair" if invalid else f"{label} needs managed source data",
        "summary": (
            f"The retained {label} snapshot failed validation, so SuperMega excluded it from the brief."
            if invalid
            else f"This tenant has no readable {label} snapshot yet. Import or prepare that product before relying on its brief."
        ),
        "facts": [
            _fact("Source", "Validation failed" if invalid else "Not connected", "No operational fact was inferred."),
            _fact("Evidence", "Not enough", "The answer fails closed when a source is absent or malformed."),
            _fact("Approvals", "Unchanged", "Existing managed decisions remain intact."),
            _fact("Write gate", "Blocked", "This answer cannot run a product or external action."),
        ],
        "nextAction": {
            "product": product,
            "path": f"/settings/?product={product}",
            "label": f"Prepare {label}",
        },
    }


def _shop_answer(shop: Mapping[str, object]) -> dict[str, object]:
    if shop["status"] != "ready":
        return _unavailable_answer("shop_inventory", "shop", str(shop["status"]))
    urgent = int(shop["lowStock"]) + int(shop["moneyExceptions"])
    product, path, label = _SAFE_ACTIONS["shop_inventory"]
    return {
        "intent": "shop_inventory",
        "title": f"{urgent} Shop exceptions need review" if urgent else "Shop has no urgent exception",
        "summary": (
            "Review low stock and money exceptions before routine order work."
            if urgent
            else "The current managed Shop snapshot has no low-stock or money exception. Continue the order queue."
        ),
        "facts": [
            _fact("Stock", f"{shop['lowStock']} low / {shop['itemCount']} SKUs", "Compared with retained reorder points."),
            _fact("Orders", f"{shop['activeOrders']} active", "Confirmed, preparing, or ready orders."),
            _fact("Money review", f"{shop['moneyExceptions']} exceptions", "Pending payments and due refunds."),
            _fact("Online intake", f"{shop['incomingRequests']} requests", "Retained Ecommerce requests in Shop."),
        ],
        "nextAction": {"product": product, "path": path, "label": label},
    }


def _plant_answer(plant: Mapping[str, object]) -> dict[str, object]:
    if plant["status"] != "ready":
        return _unavailable_answer("plant_control", "plant", str(plant["status"]))
    blockers = int(plant["priorityIssues"]) + int(plant["heldJobs"]) + int(plant["stoppedMachines"])
    product, path, label = _SAFE_ACTIONS["plant_control"]
    return {
        "intent": "plant_control",
        "title": f"{blockers} production blockers need containment" if blockers else "Plant has no critical control blocker",
        "summary": (
            "Contain priority issues, quality holds, and stopped equipment before routine MES progress."
            if blockers
            else "The current managed Plant snapshot has no priority issue, quality hold, or stopped machine."
        ),
        "facts": [
            _fact("Jobs", f"{plant['unfinishedJobs']} unfinished / {plant['jobCount']} total", "Below target and not closed."),
            _fact("Quality", f"{plant['heldJobs']} held", "Unclosed jobs with a quality hold."),
            _fact("Issues", f"{plant['priorityIssues']} priority / {plant['openIssues']} open", "Critical and high issues rank first."),
            _fact("Equipment", f"{plant['stoppedMachines']} stopped", "Observation only; no equipment control."),
        ],
        "nextAction": {"product": product, "path": path, "label": label},
    }


def _website_answer(website: Mapping[str, object]) -> dict[str, object]:
    if website["status"] != "ready":
        return _unavailable_answer("website_readiness", "website", str(website["status"]))
    ready = (
        int(website["pageCount"]) > 0
        and website["readyPages"] == website["pageCount"]
        and bool(website["approved"])
        and bool(website["released"])
    )
    product, path, label = _SAFE_ACTIONS["website_readiness"]
    return {
        "intent": "website_readiness",
        "title": "Website review evidence is complete" if ready else "Website still needs review evidence",
        "summary": (
            "Ready pages, current approval, and the exact retained site snapshot are present."
            if ready
            else "Finish ready pages, current human approval, and an exact site snapshot before a publish decision."
        ),
        "facts": [
            _fact("Pages", f"{website['readyPages']} ready / {website['pageCount']} total", "Validated managed page records."),
            _fact("Approval", "Current" if website["approved"] else "Missing", "Human approval in the Website snapshot."),
            _fact("Snapshot evidence", "Current" if website["released"] else "Missing", "The exact approved site file, not a live-domain claim."),
            _fact("Publish gate", "Review ready" if ready else "Blocked", "Publishing remains a separate owner-controlled action."),
        ],
        "nextAction": {"product": product, "path": path, "label": label},
    }


def _ecommerce_answer(ecommerce: Mapping[str, object]) -> dict[str, object]:
    if ecommerce["status"] != "ready":
        return _unavailable_answer("ecommerce_readiness", "ecommerce", str(ecommerce["status"]))
    ready = bool(ecommerce["shopSourceReady"]) and int(ecommerce["selectedSkus"]) > 0
    product, path, label = _SAFE_ACTIONS["ecommerce_readiness"]
    return {
        "intent": "ecommerce_readiness",
        "title": "Ecommerce is ready for order review" if ready else "Ecommerce needs a Shop source fix",
        "summary": (
            "The retained storefront is tied to a validated Shop catalog; requests still require Shop-side review."
            if ready
            else "Connect a validated Shop catalog before treating Ecommerce requests as operational orders."
        ),
        "facts": [
            _fact("Catalog", f"{ecommerce['selectedSkus']} selected SKUs", "Retained storefront configuration."),
            _fact("Shop source", "Ready" if ecommerce["shopSourceReady"] else "Missing", "Catalog facts come from the managed Shop snapshot."),
            _fact("Requests", f"{ecommerce['incomingRequests']} in Shop", "Requests only; not fulfilment or payment."),
            _fact("Order gate", "Review ready" if ready else "Blocked", "Owner approval remains required before Shop action."),
        ],
        "nextAction": {"product": product, "path": path, "label": label},
    }


def _source_count(projections: Mapping[str, Mapping[str, object]]) -> int:
    return sum(1 for projection in projections.values() if projection["status"] == "ready")


def _answer(projections: Mapping[str, Mapping[str, object]], intent: str) -> dict[str, object]:
    builders = {
        "shop_inventory": lambda: _shop_answer(projections["shop"]),
        "plant_control": lambda: _plant_answer(projections["plant"]),
        "website_readiness": lambda: _website_answer(projections["website"]),
        "ecommerce_readiness": lambda: _ecommerce_answer(projections["ecommerce"]),
    }
    if intent != "attention":
        return builders[intent]()
    for product, product_intent in (
        ("shop", "shop_inventory"),
        ("plant", "plant_control"),
        ("website", "website_readiness"),
        ("ecommerce", "ecommerce_readiness"),
    ):
        if projections[product]["status"] == "invalid":
            selected = builders[product_intent]()
            return {**selected, "intent": "attention", "title": f"Start here: {selected['title']}"}
    if _source_count(projections) == 0:
        return {
            **_unavailable_answer("attention", "shop", "missing"),
            "title": "Start with one managed business source",
        }
    ranked = [
        (int(projections["shop"]["lowStock"]) * 3 + int(projections["shop"]["moneyExceptions"]) * 3 + int(projections["shop"]["activeOrders"]), "shop_inventory")
        if projections["shop"]["status"] == "ready" else (-1, "shop_inventory"),
        (int(projections["plant"]["priorityIssues"]) * 4 + int(projections["plant"]["heldJobs"]) * 4 + int(projections["plant"]["stoppedMachines"]) * 4 + int(projections["plant"]["unfinishedJobs"]), "plant_control")
        if projections["plant"]["status"] == "ready" else (-1, "plant_control"),
        ((0 if projections["website"]["approved"] else 2) + (0 if projections["website"]["released"] else 2) + int(projections["website"]["pageCount"]) - int(projections["website"]["readyPages"]), "website_readiness")
        if projections["website"]["status"] == "ready" else (-1, "website_readiness"),
        (int(projections["ecommerce"]["incomingRequests"]) * 2 + (0 if projections["ecommerce"]["shopSourceReady"] else 3), "ecommerce_readiness")
        if projections["ecommerce"]["status"] == "ready" else (-1, "ecommerce_readiness"),
    ]
    selected = builders[max(ranked, key=lambda item: item[0])[1]]()
    return {**selected, "intent": "attention", "title": f"Start here: {selected['title']}"}


def _approval_summary(approvals: Sequence[ApprovalRecord]) -> dict[str, int]:
    return {
        status: sum(1 for approval in approvals if approval.status == status)
        for status in ("pending", "approved", "declined")
    }


def build_managed_company_brief(
    *,
    workspace_id: str,
    intent: str,
    states: Mapping[str, TrialState],
    approvals: Sequence[ApprovalRecord],
) -> dict[str, object]:
    """Build a reproducible, no-write answer from tenant-scoped managed state."""

    if intent not in COMPANY_BRIEF_INTENTS:
        raise TrialValidationError("Company brief intent is unsupported.")
    if not workspace_id or len(workspace_id) > 128:
        raise TrialValidationError("Company brief workspace is invalid.")
    product_states = {surface: states[surface] for surface in _PRODUCT_SURFACES if surface in states}
    shop, ecommerce = _project_commerce(product_states.get("commerce"))
    projections = {
        "shop": shop,
        "plant": _project_plant(product_states.get("production")),
        "website": _project_website(product_states.get("website")),
        "ecommerce": ecommerce,
    }
    answer = _answer(projections, intent)
    source_versions = [_source_reference(product_states[surface]) for surface in _PRODUCT_SURFACES if surface in product_states]
    approval_summary = _approval_summary(approvals)
    brief_basis = {
        "contract": COMPANY_BRIEF_CONTRACT,
        "workspaceId": workspace_id,
        "intent": intent,
        "sourceVersions": source_versions,
        "approvalSummary": approval_summary,
        "answer": answer,
    }
    return {
        "contract": COMPANY_BRIEF_CONTRACT,
        "intent": intent,
        "sourceCount": _source_count(projections),
        "title": answer["title"],
        "summary": answer["summary"],
        "facts": deepcopy(answer["facts"]),
        "nextAction": deepcopy(answer["nextAction"]),
        "boundary": _BOUNDARY,
        "sourceVersions": source_versions,
        "approvalSummary": approval_summary,
        "briefDigest": _digest(brief_basis),
        "retention": "reproducible_not_persisted",
        "externalWritesPerformed": False,
    }


def company_brief_receipt(brief: Mapping[str, object]) -> dict[str, object]:
    """Reduce a verified brief to the bounded record retained in company state."""

    if brief.get("contract") != COMPANY_BRIEF_CONTRACT:
        raise TrialValidationError("Company brief contract is invalid.")
    return {
        "contract": COMPANY_BRIEF_RECEIPT_CONTRACT,
        "briefDigest": brief["briefDigest"],
        "intent": brief["intent"],
        "sourceCount": brief["sourceCount"],
        "sourceVersions": deepcopy(brief["sourceVersions"]),
        "approvalSummary": deepcopy(brief["approvalSummary"]),
        "nextAction": deepcopy(brief["nextAction"]),
    }


def company_state_with_receipt(current: Mapping[str, Any], receipt: Mapping[str, object]) -> dict[str, object]:
    """Append one bounded receipt while preserving all earlier receipts."""

    tasks = current.get("tasks", [])
    receipts = current.get("briefReceipts", [])
    if not isinstance(tasks, list) or not isinstance(receipts, list) or len(receipts) > 30:
        raise TrialValidationError("Company state cannot retain a brief safely.")
    validated = company_brief_receipt({
        "contract": COMPANY_BRIEF_CONTRACT,
        "briefDigest": receipt.get("briefDigest"),
        "intent": receipt.get("intent"),
        "sourceCount": receipt.get("sourceCount"),
        "sourceVersions": receipt.get("sourceVersions"),
        "approvalSummary": receipt.get("approvalSummary"),
        "nextAction": receipt.get("nextAction"),
    })
    if receipt.get("contract") != COMPANY_BRIEF_RECEIPT_CONTRACT:
        raise TrialValidationError("Company brief receipt contract is invalid.")
    if any(candidate == validated for candidate in receipts):
        return deepcopy(dict(current))
    if len(receipts) >= 30:
        raise TrialValidationError("Company brief receipt history reached its 30-record limit.")
    return {**deepcopy(dict(current)), "tasks": deepcopy(tasks), "briefReceipts": [validated, *deepcopy(receipts)]}


def assert_brief_sources_unchanged(
    source_versions: Sequence[Mapping[str, object]],
    related_states: Mapping[str, Mapping[str, Any]],
) -> None:
    expected = {str(source["surface"]): str(source["stateDigest"]) for source in source_versions}
    if set(expected) != set(related_states):
        raise TrialValidationError("Company brief source set changed before retention.")
    for surface, state in related_states.items():
        if _digest(state) != expected[surface]:
            raise TrialValidationError("Company brief source changed before retention.")


__all__ = [
    "COMPANY_BRIEF_CONTRACT",
    "COMPANY_BRIEF_INTENTS",
    "COMPANY_BRIEF_RECEIPT_CONTRACT",
    "assert_brief_sources_unchanged",
    "build_managed_company_brief",
    "company_brief_receipt",
    "company_state_with_receipt",
]
