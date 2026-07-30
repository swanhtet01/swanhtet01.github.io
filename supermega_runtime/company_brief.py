"""Tenant-scoped operating briefs for managed SuperMega workspaces."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from copy import deepcopy
from hashlib import sha256
import json
from typing import Any

from supermega_runtime.commerce_runtime import validate_commerce_state
from supermega_runtime.managed_context import managed_context_brief_projection, managed_context_from_company_state
from supermega_runtime.production_runtime import validate_production_state
from supermega_runtime.trial_store import ApprovalRecord, TrialState, TrialValidationError
from supermega_runtime.website_runtime import validate_website_state


COMPANY_BRIEF_CONTRACT = "supermega.managed_company_brief.v1"
COMPANY_BRIEF_RECEIPT_CONTRACT = "supermega.managed_company_brief_receipt.v1"
OPERATING_BASELINE_CONTRACT = "supermega.operating_baseline.v1"
OPERATING_BASELINE_CHANGE_CONTRACT = "supermega.operating_baseline_change.v1"
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
_SAFE_RECEIPT_ACTIONS = frozenset({
    *_SAFE_ACTIONS.values(),
    ("shop", "/settings/?product=shop", "Prepare Shop"),
    ("plant", "/settings/?product=plant", "Prepare Plant"),
    ("website", "/settings/?product=website", "Prepare Website"),
    ("ecommerce", "/settings/?product=ecommerce", "Prepare Ecommerce"),
})
_BOUNDARY = (
    "This managed brief reads tenant-scoped validated snapshots and approval status. "
    "It does not send messages, publish, charge, move stock, write production, or train models. "
    "Keeping an operating checkpoint is a separate authenticated owner-approved company write."
)
_PRODUCTS = ("shop", "plant", "website", "ecommerce")
_PRODUCT_STATUSES = frozenset({"missing", "invalid", "ready"})
_MAX_BASELINE_COUNT = 1_000_000


def _canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"), sort_keys=True)


def _digest(value: object) -> str:
    return f"sha256:{sha256(_canonical_json(value).encode('utf-8')).hexdigest()}"


def _bounded_count(value: object, label: str, maximum: int = _MAX_BASELINE_COUNT) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= maximum:
        raise TrialValidationError(f"{label} is outside the supported range.")
    return value


def _digest_text(value: object, label: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != 71
        or not value.startswith("sha256:")
        or any(character not in "0123456789abcdef" for character in value[7:])
    ):
        raise TrialValidationError(f"{label} is invalid.")
    return value


def _validate_source_versions(value: object) -> list[dict[str, object]]:
    if not isinstance(value, list) or len(value) > len(_PRODUCT_SURFACES):
        raise TrialValidationError("Operating baseline source versions are invalid.")
    retained: list[dict[str, object]] = []
    seen: set[str] = set()
    for source in value:
        if not isinstance(source, Mapping) or set(source) != {"surface", "version", "updatedAt", "projectionDigest"}:
            raise TrialValidationError("Operating baseline source reference is invalid.")
        surface = source["surface"]
        updated_at = source["updatedAt"]
        if surface not in _PRODUCT_SURFACES or surface in seen:
            raise TrialValidationError("Operating baseline source surface is invalid.")
        if not isinstance(updated_at, str) or len(updated_at) > 64:
            raise TrialValidationError("Operating baseline source timestamp is invalid.")
        seen.add(str(surface))
        retained.append({
            "surface": surface,
            "version": _bounded_count(source["version"], "Operating baseline source version"),
            "updatedAt": updated_at,
            "projectionDigest": _digest_text(source["projectionDigest"], "Operating baseline projection digest"),
        })
    return retained


def _projection_digest(
    *,
    workspace_id: str,
    surface: str,
    version: int,
    projection: Mapping[str, object],
) -> str:
    return _digest({
        "contract": "supermega.operating_projection_source.v1",
        "workspaceId": workspace_id,
        "surface": surface,
        "version": version,
        "projection": projection,
    })


def _source_reference(
    record: TrialState,
    *,
    workspace_id: str,
    projection: Mapping[str, object],
) -> dict[str, object]:
    return {
        "surface": record.surface,
        "version": record.version,
        "updatedAt": record.updated_at,
        "projectionDigest": _projection_digest(
            workspace_id=workspace_id,
            surface=record.surface,
            version=record.version,
            projection=projection,
        ),
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
        "criticalIssues": 0,
        "highIssues": 0,
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
        "criticalIssues": sum(1 for issue in open_issues if issue["severity"] == "critical"),
        "highIssues": sum(1 for issue in open_issues if issue["severity"] == "high"),
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


def _attention_rank(projections: Mapping[str, Mapping[str, object]]) -> list[tuple[int, int, str]]:
    shop = projections["shop"]
    plant = projections["plant"]
    website = projections["website"]
    ecommerce = projections["ecommerce"]
    return [
        (
            3 if int(shop["moneyExceptions"]) else 2 if int(shop["lowStock"]) else 1 if int(shop["activeOrders"]) else 0,
            int(shop["moneyExceptions"]) * 3 + int(shop["lowStock"]) * 2 + int(shop["activeOrders"]),
            "shop_inventory",
        ) if shop["status"] == "ready" else (-1, -1, "shop_inventory"),
        (
            4 if int(plant["criticalIssues"]) or int(plant["stoppedMachines"]) else 3 if int(plant["highIssues"]) or int(plant["heldJobs"]) else 1 if int(plant["unfinishedJobs"]) else 0,
            int(plant["criticalIssues"]) * 8 + int(plant["stoppedMachines"]) * 6 + int(plant["highIssues"]) * 4 + int(plant["heldJobs"]) * 3 + int(plant["unfinishedJobs"]),
            "plant_control",
        ) if plant["status"] == "ready" else (-1, -1, "plant_control"),
        (
            2 if not website["approved"] or not website["released"] else 1 if int(website["readyPages"]) < int(website["pageCount"]) else 0,
            (0 if website["approved"] else 2) + (0 if website["released"] else 2) + int(website["pageCount"]) - int(website["readyPages"]),
            "website_readiness",
        ) if website["status"] == "ready" else (-1, -1, "website_readiness"),
        (
            2 if not ecommerce["shopSourceReady"] else 1 if int(ecommerce["incomingRequests"]) else 0,
            int(ecommerce["incomingRequests"]) + (0 if ecommerce["shopSourceReady"] else 3),
            "ecommerce_readiness",
        ) if ecommerce["status"] == "ready" else (-1, -1, "ecommerce_readiness"),
    ]


def _baseline_attention(
    projections: Mapping[str, Mapping[str, object]],
) -> dict[str, tuple[int, int]]:
    ranked = {intent: (level, load) for level, load, intent in _attention_rank(projections)}
    return {
        "shop": ranked["shop_inventory"],
        "plant": ranked["plant_control"],
        "website": ranked["website_readiness"],
        "ecommerce": ranked["ecommerce_readiness"],
    }


def _baseline_product(
    product: str,
    projection: Mapping[str, object],
    attention: tuple[int, int],
) -> dict[str, object]:
    status = str(projection["status"])
    attention_level = 5 if status == "invalid" else attention[0] if status == "ready" else 0
    review_load = max(0, attention[1]) if status == "ready" else 0
    common = {
        "status": status,
        "attentionLevel": attention_level,
        "reviewLoad": review_load,
    }
    if product == "shop":
        return {
            **common,
            "itemCount": int(projection["itemCount"]),
            "lowStock": int(projection["lowStock"]),
            "activeOrders": int(projection["activeOrders"]),
            "moneyExceptions": int(projection["moneyExceptions"]),
            "incomingRequests": int(projection["incomingRequests"]),
        }
    if product == "plant":
        return {
            **common,
            "jobCount": int(projection["jobCount"]),
            "unfinishedJobs": int(projection["unfinishedJobs"]),
            "heldJobs": int(projection["heldJobs"]),
            "criticalIssues": int(projection["criticalIssues"]),
            "highIssues": int(projection["highIssues"]),
            "openIssues": int(projection["openIssues"]),
            "stoppedMachines": int(projection["stoppedMachines"]),
        }
    if product == "website":
        return {
            **common,
            "pageCount": int(projection["pageCount"]),
            "readyPages": int(projection["readyPages"]),
            "approved": bool(projection["approved"]),
            "released": bool(projection["released"]),
        }
    return {
        **common,
        "selectedSkus": int(projection["selectedSkus"]),
        "incomingRequests": int(projection["incomingRequests"]),
        "shopSourceReady": bool(projection["shopSourceReady"]),
    }


def _validate_baseline_product(product: str, value: object) -> dict[str, object]:
    count_fields = {
        "shop": ("itemCount", "lowStock", "activeOrders", "moneyExceptions", "incomingRequests"),
        "plant": ("jobCount", "unfinishedJobs", "heldJobs", "criticalIssues", "highIssues", "openIssues", "stoppedMachines"),
        "website": ("pageCount", "readyPages"),
        "ecommerce": ("selectedSkus", "incomingRequests"),
    }[product]
    boolean_fields = {
        "shop": (),
        "plant": (),
        "website": ("approved", "released"),
        "ecommerce": ("shopSourceReady",),
    }[product]
    expected = {"status", "attentionLevel", "reviewLoad", *count_fields, *boolean_fields}
    if not isinstance(value, Mapping) or set(value) != expected:
        raise TrialValidationError(f"{product.title()} operating baseline has an invalid shape.")
    status = value["status"]
    if status not in _PRODUCT_STATUSES:
        raise TrialValidationError(f"{product.title()} operating baseline status is invalid.")
    normalized = {
        "status": status,
        "attentionLevel": _bounded_count(value["attentionLevel"], f"{product.title()} attention level", 5),
        "reviewLoad": _bounded_count(value["reviewLoad"], f"{product.title()} review load"),
    }
    normalized.update({
        field: _bounded_count(value[field], f"{product.title()} {field}")
        for field in count_fields
    })
    for field in boolean_fields:
        if not isinstance(value[field], bool):
            raise TrialValidationError(f"{product.title()} {field} must be a boolean.")
        normalized[field] = value[field]
    if status != "ready":
        expected_attention = 5 if status == "invalid" else 0
        if (
            normalized["attentionLevel"] != expected_attention
            or normalized["reviewLoad"] != 0
            or any(normalized[field] != 0 for field in count_fields)
            or any(normalized[field] is not False for field in boolean_fields)
        ):
            raise TrialValidationError(f"{product.title()} unavailable baseline contains operating facts.")
    elif (
        (product == "shop" and normalized["lowStock"] > normalized["itemCount"])
        or (
            product == "plant"
            and (
                normalized["unfinishedJobs"] > normalized["jobCount"]
                or normalized["heldJobs"] > normalized["jobCount"]
                or normalized["criticalIssues"] + normalized["highIssues"] > normalized["openIssues"]
            )
        )
        or (product == "website" and normalized["readyPages"] > normalized["pageCount"])
    ):
        raise TrialValidationError(f"{product.title()} operating baseline counters are inconsistent.")
    return normalized


def validate_operating_baseline(
    value: object,
    *,
    workspace_id: str | None = None,
) -> dict[str, object]:
    expected = {
        "contract",
        "version",
        "workspaceId",
        "sourceVersions",
        "coverage",
        "products",
        "rawRecordsIncluded",
        "baselineDigest",
    }
    if not isinstance(value, Mapping) or set(value) != expected:
        raise TrialValidationError("Operating baseline has an invalid shape.")
    retained_workspace = value["workspaceId"]
    if (
        not isinstance(retained_workspace, str)
        or retained_workspace != retained_workspace.strip()
        or not retained_workspace
        or len(retained_workspace) > 128
        or (workspace_id is not None and retained_workspace != workspace_id)
    ):
        raise TrialValidationError("Operating baseline workspace is invalid.")
    if value["contract"] != OPERATING_BASELINE_CONTRACT or value["version"] != 1:
        raise TrialValidationError("Operating baseline contract is invalid.")
    if value["rawRecordsIncluded"] is not False:
        raise TrialValidationError("Operating baseline must remain aggregate-only.")
    source_versions = _validate_source_versions(value["sourceVersions"])
    products = value["products"]
    if not isinstance(products, Mapping) or set(products) != set(_PRODUCTS):
        raise TrialValidationError("Operating baseline products are invalid.")
    normalized_products = {
        product: _validate_baseline_product(product, products[product])
        for product in _PRODUCTS
    }
    coverage = value["coverage"]
    if not isinstance(coverage, Mapping) or set(coverage) != {"readyProducts", "missingProducts", "invalidProducts"}:
        raise TrialValidationError("Operating baseline coverage is invalid.")
    normalized_coverage = {
        "readyProducts": _bounded_count(coverage["readyProducts"], "Ready product count", len(_PRODUCTS)),
        "missingProducts": _bounded_count(coverage["missingProducts"], "Missing product count", len(_PRODUCTS)),
        "invalidProducts": _bounded_count(coverage["invalidProducts"], "Invalid product count", len(_PRODUCTS)),
    }
    expected_coverage = {
        "readyProducts": sum(1 for product in normalized_products.values() if product["status"] == "ready"),
        "missingProducts": sum(1 for product in normalized_products.values() if product["status"] == "missing"),
        "invalidProducts": sum(1 for product in normalized_products.values() if product["status"] == "invalid"),
    }
    if normalized_coverage != expected_coverage:
        raise TrialValidationError("Operating baseline coverage does not match its products.")
    basis = {
        "contract": OPERATING_BASELINE_CONTRACT,
        "version": 1,
        "workspaceId": retained_workspace,
        "sourceVersions": source_versions,
        "coverage": normalized_coverage,
        "products": normalized_products,
        "rawRecordsIncluded": False,
    }
    baseline_digest = _digest_text(value["baselineDigest"], "Operating baseline digest")
    if baseline_digest != _digest(basis):
        raise TrialValidationError("Operating baseline digest does not match its summary.")
    return {**basis, "baselineDigest": baseline_digest}


def _operating_baseline(
    *,
    workspace_id: str,
    projections: Mapping[str, Mapping[str, object]],
    source_versions: list[dict[str, object]],
) -> dict[str, object]:
    attention = _baseline_attention(projections)
    products = {
        product: _baseline_product(product, projections[product], attention[product])
        for product in _PRODUCTS
    }
    basis = {
        "contract": OPERATING_BASELINE_CONTRACT,
        "version": 1,
        "workspaceId": workspace_id,
        "sourceVersions": deepcopy(source_versions),
        "coverage": {
            "readyProducts": sum(1 for product in products.values() if product["status"] == "ready"),
            "missingProducts": sum(1 for product in products.values() if product["status"] == "missing"),
            "invalidProducts": sum(1 for product in products.values() if product["status"] == "invalid"),
        },
        "products": products,
        "rawRecordsIncluded": False,
    }
    return validate_operating_baseline({**basis, "baselineDigest": _digest(basis)}, workspace_id=workspace_id)


def _previous_operating_baseline(
    company_state: Mapping[str, Any] | None,
    *,
    workspace_id: str,
    current_digest: str,
) -> dict[str, object] | None:
    if not isinstance(company_state, Mapping) or not isinstance(company_state.get("briefReceipts"), list):
        return None
    for receipt in company_state["briefReceipts"]:
        if not isinstance(receipt, Mapping) or receipt.get("contract") != COMPANY_BRIEF_RECEIPT_CONTRACT:
            continue
        try:
            baseline = validate_operating_baseline(receipt.get("operatingBaseline"), workspace_id=workspace_id)
        except TrialValidationError:
            continue
        if baseline["baselineDigest"] != current_digest:
            return baseline
    return None


def _operating_change(
    current: Mapping[str, object],
    previous: Mapping[str, object] | None,
) -> dict[str, object]:
    current_baseline = validate_operating_baseline(current)
    previous_baseline = validate_operating_baseline(
        previous,
        workspace_id=str(current_baseline["workspaceId"]),
    ) if previous is not None else None
    changed_products: list[str] = []
    attention_increased: list[str] = []
    attention_decreased: list[str] = []
    coverage_changed = False
    if previous_baseline is not None:
        current_products = current_baseline["products"]
        previous_products = previous_baseline["products"]
        assert isinstance(current_products, Mapping)
        assert isinstance(previous_products, Mapping)
        for product in _PRODUCTS:
            current_product = current_products[product]
            previous_product = previous_products[product]
            assert isinstance(current_product, Mapping)
            assert isinstance(previous_product, Mapping)
            if current_product != previous_product:
                changed_products.append(product)
            if current_product["status"] == "ready" and previous_product["status"] == "ready":
                current_attention = (int(current_product["attentionLevel"]), int(current_product["reviewLoad"]))
                previous_attention = (int(previous_product["attentionLevel"]), int(previous_product["reviewLoad"]))
                if current_attention > previous_attention:
                    attention_increased.append(product)
                elif current_attention < previous_attention:
                    attention_decreased.append(product)
        coverage_changed = current_baseline["coverage"] != previous_baseline["coverage"]
    basis = {
        "contract": OPERATING_BASELINE_CHANGE_CONTRACT,
        "version": 1,
        "status": (
            "first_checkpoint"
            if previous_baseline is None
            else "changed"
            if changed_products or coverage_changed
            else "unchanged"
        ),
        "currentBaselineDigest": current_baseline["baselineDigest"],
        "previousBaselineDigest": previous_baseline["baselineDigest"] if previous_baseline else None,
        "changedProducts": changed_products,
        "attentionIncreased": attention_increased,
        "attentionDecreased": attention_decreased,
        "coverageChanged": coverage_changed,
        "rawRecordsIncluded": False,
    }
    return {**basis, "changeDigest": _digest(basis)}


def _answer(
    projections: Mapping[str, Mapping[str, object]],
    intent: str,
    owner_context: Mapping[str, object] | None = None,
) -> dict[str, object]:
    builders = {
        "shop_inventory": lambda: _shop_answer(projections["shop"]),
        "plant_control": lambda: _plant_answer(projections["plant"]),
        "website_readiness": lambda: _website_answer(projections["website"]),
        "ecommerce_readiness": lambda: _ecommerce_answer(projections["ecommerce"]),
    }
    if intent != "attention":
        return builders[intent]()
    ranked = _attention_rank(projections)
    critical = max(ranked, key=lambda item: item[0])
    if critical[0] >= 4:
        selected = builders[critical[2]]()
        return {**selected, "intent": "attention", "title": f"Start here: {selected['title']}"}
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
    preferred_intent = None
    if owner_context:
        preferred_intent = {
            "commerce": "shop_inventory",
            "production": "plant_control",
            "website": "website_readiness",
            "ecommerce": "ecommerce_readiness",
        }.get(str(owner_context.get("preferredProduct")))
    selected = builders[max(ranked, key=lambda item: (item[0], item[1], item[2] == preferred_intent))[2]]()
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
    if set(states) - {*_PRODUCT_SURFACES, "company"}:
        raise TrialValidationError("Company brief contains an unexpected managed surface.")
    for surface, record in states.items():
        if record.workspace_id != workspace_id or record.surface != surface:
            raise TrialValidationError("Company brief managed state identity is invalid.")
    product_states = {surface: states[surface] for surface in _PRODUCT_SURFACES if surface in states}
    company_state = states.get("company")
    owner_profile = managed_context_from_company_state(
        company_state.state if company_state else None,
        workspace_id=workspace_id,
    )
    owner_context = managed_context_brief_projection(owner_profile)
    shop, ecommerce = _project_commerce(product_states.get("commerce"))
    projections = {
        "shop": shop,
        "plant": _project_plant(product_states.get("production")),
        "website": _project_website(product_states.get("website")),
        "ecommerce": ecommerce,
    }
    source_projections = {
        "commerce": {"shop": shop, "ecommerce": ecommerce},
        "production": projections["plant"],
        "website": projections["website"],
    }
    source_versions = [
        _source_reference(
            product_states[surface],
            workspace_id=workspace_id,
            projection=source_projections[surface],
        )
        for surface in _PRODUCT_SURFACES
        if surface in product_states
    ]
    operating_baseline = _operating_baseline(
        workspace_id=workspace_id,
        projections=projections,
        source_versions=source_versions,
    )
    previous_baseline = _previous_operating_baseline(
        company_state.state if company_state else None,
        workspace_id=workspace_id,
        current_digest=str(operating_baseline["baselineDigest"]),
    )
    operating_change = _operating_change(operating_baseline, previous_baseline)
    answer = _answer(projections, intent, owner_context)
    approval_summary = _approval_summary(approvals)
    brief_basis = {
        "contract": COMPANY_BRIEF_CONTRACT,
        "workspaceId": workspace_id,
        "intent": intent,
        "sourceVersions": source_versions,
        "approvalSummary": approval_summary,
        "ownerContext": owner_context,
        "operatingBaseline": operating_baseline,
        "operatingChange": operating_change,
        "answer": answer,
    }
    brief_digest = _digest(brief_basis)
    retention = "reproducible_not_persisted"
    if company_state and isinstance(company_state.state.get("briefReceipts"), list):
        for candidate in company_state.state["briefReceipts"]:
            try:
                retained = _validate_retained_brief_receipt(candidate, workspace_id=workspace_id)
            except TrialValidationError:
                continue
            if retained["briefDigest"] == brief_digest:
                retention = "persisted_managed_audit"
                break
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
        "ownerContext": deepcopy(owner_context),
        "operatingBaseline": operating_baseline,
        "operatingChange": operating_change,
        "briefDigest": brief_digest,
        "retention": retention,
        "externalWritesPerformed": False,
    }


def company_brief_receipt(brief: Mapping[str, object]) -> dict[str, object]:
    """Reduce a verified brief to the bounded record retained in company state."""

    if brief.get("contract") != COMPANY_BRIEF_CONTRACT:
        raise TrialValidationError("Company brief contract is invalid.")
    operating_baseline = validate_operating_baseline(brief.get("operatingBaseline"))
    if operating_baseline["sourceVersions"] != brief.get("sourceVersions"):
        raise TrialValidationError("Company brief baseline sources do not match the brief.")
    owner_context = brief.get("ownerContext")
    owner_context_digest = None
    if owner_context is not None:
        if not isinstance(owner_context, Mapping):
            raise TrialValidationError("Company brief owner context is invalid.")
        candidate_digest = owner_context.get("profileDigest")
        if (
            not isinstance(candidate_digest, str)
            or len(candidate_digest) != 71
            or not candidate_digest.startswith("sha256:")
            or any(character not in "0123456789abcdef" for character in candidate_digest[7:])
        ):
            raise TrialValidationError("Company brief owner context digest is invalid.")
        owner_context_digest = candidate_digest
    return {
        "contract": COMPANY_BRIEF_RECEIPT_CONTRACT,
        "briefDigest": brief["briefDigest"],
        "intent": brief["intent"],
        "sourceCount": brief["sourceCount"],
        "sourceVersions": deepcopy(brief["sourceVersions"]),
        "approvalSummary": deepcopy(brief["approvalSummary"]),
        "nextAction": deepcopy(brief["nextAction"]),
        "ownerContextDigest": owner_context_digest,
        "operatingBaseline": operating_baseline,
    }


def _validate_retained_brief_receipt(
    value: object,
    *,
    workspace_id: str,
) -> dict[str, object]:
    required = {
        "contract",
        "briefDigest",
        "intent",
        "sourceCount",
        "sourceVersions",
        "approvalSummary",
        "nextAction",
    }
    optional = {"ownerContextDigest", "operatingBaseline"}
    if not isinstance(value, Mapping) or not required.issubset(value) or not set(value).issubset(required | optional):
        raise TrialValidationError("Retained company brief receipt has an invalid shape.")
    if value["contract"] != COMPANY_BRIEF_RECEIPT_CONTRACT or value["intent"] not in COMPANY_BRIEF_INTENTS:
        raise TrialValidationError("Retained company brief receipt contract is invalid.")
    source_versions = _validate_source_versions(value["sourceVersions"])
    source_count = _bounded_count(value["sourceCount"], "Retained company brief source count", len(_PRODUCTS))
    approvals = value["approvalSummary"]
    if not isinstance(approvals, Mapping) or set(approvals) != {"pending", "approved", "declined"}:
        raise TrialValidationError("Retained company brief approval summary is invalid.")
    approval_summary = {
        status: _bounded_count(approvals[status], f"Retained {status} approval count")
        for status in ("pending", "approved", "declined")
    }
    next_action = value["nextAction"]
    if not isinstance(next_action, Mapping) or set(next_action) != {"product", "path", "label"}:
        raise TrialValidationError("Retained company brief next action is invalid.")
    action = (next_action["product"], next_action["path"], next_action["label"])
    if action not in _SAFE_RECEIPT_ACTIONS:
        raise TrialValidationError("Retained company brief action is not allowlisted.")
    expected_product, expected_path, expected_label = action
    owner_context_digest = value.get("ownerContextDigest")
    if owner_context_digest is not None:
        owner_context_digest = _digest_text(owner_context_digest, "Retained owner context digest")
    normalized = {
        "contract": COMPANY_BRIEF_RECEIPT_CONTRACT,
        "briefDigest": _digest_text(value["briefDigest"], "Retained company brief digest"),
        "intent": value["intent"],
        "sourceCount": source_count,
        "sourceVersions": source_versions,
        "approvalSummary": approval_summary,
        "nextAction": {
            "product": expected_product,
            "path": expected_path,
            "label": expected_label,
        },
        "ownerContextDigest": owner_context_digest,
    }
    if "operatingBaseline" in value:
        baseline = validate_operating_baseline(value["operatingBaseline"], workspace_id=workspace_id)
        if baseline["sourceVersions"] != source_versions:
            raise TrialValidationError("Retained operating baseline sources do not match its receipt.")
        normalized["operatingBaseline"] = baseline
    return normalized


def company_state_with_receipt(current: Mapping[str, Any], receipt: Mapping[str, object]) -> dict[str, object]:
    """Keep the latest bounded checkpoints while preserving unrelated company state."""

    tasks = current.get("tasks", [])
    receipts = current.get("briefReceipts", [])
    if not isinstance(tasks, list) or not isinstance(receipts, list) or len(receipts) > 1_000:
        raise TrialValidationError("Company state cannot retain a brief safely.")
    baseline = validate_operating_baseline(receipt.get("operatingBaseline"))
    workspace_id = str(baseline["workspaceId"])
    validated = _validate_retained_brief_receipt(receipt, workspace_id=workspace_id)
    retained: list[dict[str, object]] = []
    for candidate in receipts:
        try:
            normalized = _validate_retained_brief_receipt(candidate, workspace_id=workspace_id)
        except TrialValidationError:
            continue
        if normalized not in retained:
            retained.append(normalized)
        if len(retained) == 30:
            break
    if validated not in retained:
        retained = [validated, *retained][:30]
    return {
        **deepcopy(dict(current)),
        "tasks": deepcopy(tasks),
        "briefReceipts": retained,
    }


def assert_brief_sources_unchanged(
    source_versions: Sequence[Mapping[str, object]],
    related_states: Mapping[str, Mapping[str, Any]],
    *,
    workspace_id: str,
) -> None:
    expected_sources = _validate_source_versions(list(source_versions))
    expected = {str(source["surface"]): source for source in expected_sources}
    if set(expected) != set(related_states):
        raise TrialValidationError("Company brief source set changed before retention.")
    for surface, state in related_states.items():
        version = int(expected[surface]["version"])
        record = TrialState(workspace_id, surface, version, state)
        if surface == "commerce":
            shop, ecommerce = _project_commerce(record)
            projection: Mapping[str, object] = {"shop": shop, "ecommerce": ecommerce}
        elif surface == "production":
            projection = _project_plant(record)
        elif surface == "website":
            projection = _project_website(record)
        else:
            raise TrialValidationError("Company brief source surface changed before retention.")
        current_digest = _projection_digest(
            workspace_id=workspace_id,
            surface=surface,
            version=version,
            projection=projection,
        )
        if current_digest != expected[surface]["projectionDigest"]:
            raise TrialValidationError("Company brief projection changed before retention.")


__all__ = [
    "COMPANY_BRIEF_CONTRACT",
    "COMPANY_BRIEF_INTENTS",
    "COMPANY_BRIEF_RECEIPT_CONTRACT",
    "OPERATING_BASELINE_CHANGE_CONTRACT",
    "OPERATING_BASELINE_CONTRACT",
    "assert_brief_sources_unchanged",
    "build_managed_company_brief",
    "company_brief_receipt",
    "company_state_with_receipt",
    "validate_operating_baseline",
]
