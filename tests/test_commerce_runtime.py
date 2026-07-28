from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
import unittest
from unittest.mock import patch
from urllib.parse import quote
from uuid import uuid4

from supermega_runtime.commerce_runtime import (
    COMMERCE_EVENTS,
    COMMERCE_HUMAN_EVENTS,
    commerce_catalog_baseline_digest,
    commerce_catalog_digest,
    commerce_accounting_handoff,
    commerce_accounting_handoff_csv,
    commerce_daily_close_csv,
    commerce_daily_close_export,
    commerce_order_calculation_digest,
    commerce_storefront_preview_digest,
    commerce_website_intake_snapshot_digest,
    validate_commerce_state,
)
from supermega_runtime.client_import_runtime import (
    CLIENT_IMPORT_PREVIEW_SCHEMA,
    CLIENT_IMPORT_STAGING_SCHEMA,
    validate_client_import_staging_package,
)
from supermega_runtime.ecommerce_buying_lifecycle import (
    build_ecommerce_checkout_quote,
    build_ecommerce_order_request,
    build_ecommerce_pim_projection,
)
from supermega_runtime.runtime import reduce_trial_state
from supermega_runtime.trial_store import (
    InMemoryTrialStore,
    TrialHumanApprovalRequired,
    TrialIdempotencyConflict,
    TrialPrincipal,
    TrialValidationError,
    TrialVersionConflict,
)


NOW = "2026-07-23T09:00:00.000Z"
CONVERTED_AT = "2026-07-23T09:15:00.000Z"
PROMISED_AT = "2026-07-23T11:00:00.000Z"
PAYMENT_AT = "2026-07-23T09:10:00.000Z"
COMPLETED_AT = "2026-07-23T09:20:00.000Z"
RETURN_AT = "2026-07-23T09:30:00.000Z"
RETURN_AT_2 = "2026-07-23T09:40:00.000Z"
CORRECTION_AT = "2026-07-23T09:35:00.000Z"
WEBSITE_INTAKE_ID = "WINT-12345678"
CLOSE_ACTION_ID = "ACT-00000000-0000-4000-8000-000000000001"
CLOSE_ID = "CLOSE-00000000-0000-4000-8000-000000000001"
CLOSE_ACTION_ID_2 = "ACT-00000000-0000-4000-8000-000000000002"
CLOSE_ID_2 = "CLOSE-00000000-0000-4000-8000-000000000002"
CLOSE_ACTION_ID_3 = "ACT-00000000-0000-4000-8000-000000000003"
CLOSE_ID_3 = "CLOSE-00000000-0000-4000-8000-000000000003"
STOREFRONT_REQUEST_UUID = "00000000-0000-4000-8000-000000000010"
STOREFRONT_CONFIGURATION_UUID = "00000000-0000-4000-8000-000000000011"
PURCHASE_ORDER_UUID = "00000000-0000-4000-8000-000000000020"
PURCHASE_ORDER_ID = f"PO-{PURCHASE_ORDER_UUID}"
PURCHASE_ORDER_EXPECTED_AT = "2026-07-25T09:00:00.000Z"
DEFAULT_STOREFRONT_PREVIEW_DIGEST = (
    "sha256:5708a10fcffa1df487bd93f88809e1cfb678f92888cdf6f22a7deabbaf24c34d"
)
DEFAULT_STOREFRONT_ACTION_ID = (
    "ACT-STOREFRONT-R1-3d8a204568ebc4399841a2fd7482876dc600c699d9603c1ed0ddefc0215804db"
)


def myanmar_business_date(timestamp: str) -> str:
    parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    return (
        parsed.astimezone(timezone.utc) + timedelta(hours=6, minutes=30)
    ).date().isoformat()


def catalog_state() -> dict[str, object]:
    return {
        "schema": "supermega.commerce.workspace.v2",
        "items": [
            {
                "sku": "SKU-1",
                "name": "Test item",
                "onHand": 10,
                "reorderAt": 2,
                "price": 100,
            }
        ],
        "orders": [],
        "movements": [],
        "closes": [],
    }


def order_record(order_id: str = "ORD-1") -> dict[str, object]:
    return {
        "id": order_id,
        "createdAt": NOW,
        "customer": "Customer ref",
        "owner": "Accountable operator",
        "channel": "Website",
        "item": "Test item",
        "itemSku": "SKU-1",
        "quantity": 2,
        "payment": "Manual QR review",
        "paymentStatus": "pending",
        "refundStatus": "none",
        "fulfilment": "pickup",
        "fulfilmentReference": f"FUL-{order_id}",
        "promisedAt": PROMISED_AT,
        "sourceRecordId": f"WEB-{order_id}",
        "total": 200,
        "status": "confirmed",
    }


def movement(
    kind: str,
    action_id: str,
    quantity: int,
    *,
    order_id: str | None = None,
    created_at: str = NOW,
    sku: str = "SKU-1",
    id_suffix: str | None = None,
    purchase_order_id: str | None = None,
    expected_quantity: int | None = None,
    counted_quantity: int | None = None,
) -> dict[str, object]:
    encoded_action_id = quote(action_id, safe="-_.!~*'()")
    record: dict[str, object] = {
        "id": f"MOV2:{encoded_action_id}{f':{id_suffix}' if id_suffix else ''}",
        "actionId": action_id,
        "createdAt": created_at,
        "actor": "Accountable operator",
        "reason": "Verified against the source record.",
        "evidenceReference": f"EV-{action_id}",
        "kind": kind,
        "sku": sku,
        "quantityDelta": quantity,
    }
    if order_id:
        record["orderId"] = order_id
    if purchase_order_id:
        record["purchaseOrderId"] = purchase_order_id
    if expected_quantity is not None:
        record["expectedQuantity"] = expected_quantity
    if counted_quantity is not None:
        record["countedQuantity"] = counted_quantity
    return record


def purchase_order_record(
    *,
    purchase_order_id: str = PURCHASE_ORDER_ID,
    action_id: str = "ACT-PURCHASE-CREATE",
    quantity: int = 10,
    captured_at: str = NOW,
    expected_at: str = PURCHASE_ORDER_EXPECTED_AT,
) -> dict[str, object]:
    return {
        "id": purchase_order_id,
        "createdAt": captured_at,
        "expectedAt": expected_at,
        "supplier": "Yangon Supply",
        "sku": "SKU-1",
        "quantityOrdered": quantity,
        "creation": action_evidence(action_id, captured_at=captured_at),
    }


def action_evidence(
    action_id: str = "ACT-LIFECYCLE",
    *,
    captured_at: str = NOW,
    actor: str = "Accountable operator",
    reason: str = "Verified against the source record.",
    evidence_reference: str | None = None,
) -> dict[str, str]:
    return {
        "actionId": action_id,
        "capturedAt": captured_at,
        "actor": actor,
        "reason": reason,
        "evidenceReference": evidence_reference or f"EV-{action_id}",
    }


def tax_configuration(
    revision: int,
    *,
    code: str = "CT5",
    label: str = "Commercial tax 5%",
    rate_basis_points: int = 500,
    mode: str = "exclusive",
    action_id: str | None = None,
    captured_at: str = NOW,
    jurisdiction_code: str = "MM",
    effective_from: str | None = None,
) -> dict[str, object]:
    return {
        "revision": revision,
        "code": code,
        "label": label,
        "rateBasisPoints": rate_basis_points,
        "mode": mode,
        "jurisdictionCode": jurisdiction_code,
        "effectiveFrom": effective_from or captured_at,
        "proof": action_evidence(
            action_id or f"ACT-TAX-R{revision}",
            captured_at=captured_at,
            reason="Reviewed the Shop tax setup for future orders.",
        ),
    }


def account_mapping_configuration(
    revision: int,
    *,
    action_id: str | None = None,
    captured_at: str = NOW,
    payment_clearing: str = "1100-CLEAR",
    sales_revenue: str = "4100-SALES",
    legacy_revenue: str = "4190-REVIEW",
    tax_payable: str = "2100-TAX",
) -> dict[str, object]:
    return {
        "revision": revision,
        "mappings": [
            {"accountRole": "payment_clearing", "externalAccountCode": payment_clearing},
            {"accountRole": "sales_revenue", "externalAccountCode": sales_revenue},
            {"accountRole": "sales_revenue_unverified", "externalAccountCode": legacy_revenue},
            {"accountRole": "tax_payable", "externalAccountCode": tax_payable},
        ],
        "proof": action_evidence(
            action_id or f"ACT-ACCOUNT-MAPPING-R{revision}",
            captured_at=captured_at,
            reason="Reviewed the Shop account mapping for future closes.",
        ),
    }


def catalog_baseline(
    item: dict[str, object],
    proof: dict[str, str],
) -> dict[str, object]:
    baseline: dict[str, object] = {
        "sku": item["sku"],
        "price": item["price"],
        "reorderAt": item["reorderAt"],
        "proof": deepcopy(proof),
    }
    baseline["anchorDigest"] = commerce_catalog_baseline_digest(baseline)
    return baseline


def catalog_update_state(
    current: dict[str, object],
    *,
    next_price: int | None = 125,
    next_reorder_at: int | None = 4,
    action_id: str = "ACT-CATALOG-UPDATE",
    captured_at: str = NOW,
    actor: str = "Accountable operator",
) -> dict[str, object]:
    state = deepcopy(current)
    item = state["items"][0]  # type: ignore[index]
    previous_price = item["price"]
    previous_reorder_at = item["reorderAt"]
    item["price"] = previous_price if next_price is None else next_price
    item["reorderAt"] = (
        previous_reorder_at if next_reorder_at is None else next_reorder_at
    )
    proof = action_evidence(
        action_id,
        captured_at=captured_at,
        actor=actor,
        reason="Approved the reviewed catalog values.",
    )
    change = {
        "sku": item["sku"],
        "previousPrice": previous_price,
        "nextPrice": item["price"],
        "previousReorderAt": previous_reorder_at,
        "nextReorderAt": item["reorderAt"],
        "proof": proof,
    }
    prior_changes = current.get("catalogChanges", [])
    state["catalogChanges"] = [
        change,
        *deepcopy(prior_changes),  # type: ignore[arg-type]
    ]
    prior_baselines = current.get("catalogBaselines", [])
    if not any(
        baseline.get("sku") == item["sku"]
        for baseline in prior_baselines  # type: ignore[union-attr]
    ):
        state["catalogBaselines"] = [
            catalog_baseline(
                {
                    **item,
                    "price": previous_price,
                    "reorderAt": previous_reorder_at,
                },
                proof,
            ),
            *deepcopy(prior_baselines),  # type: ignore[arg-type]
        ]
    return state


def close_record(
    state: dict[str, object],
    action_id: str = CLOSE_ACTION_ID,
    *,
    close_id: str | None = None,
    captured_at: str = NOW,
) -> dict[str, object]:
    evidence = action_evidence(action_id, captured_at=captured_at)
    orders = state["orders"]
    items = state["items"]
    closes = state["closes"]
    previously_closed_order_ids = {
        order_id
        for close in closes  # type: ignore[union-attr]
        for order_id in close.get("orderIds", [])
    }
    eligible = [
        order
        for order in orders  # type: ignore[union-attr]
        if order["status"] == "completed" and order["paymentStatus"] == "reconciled"
        and order["id"] not in previously_closed_order_ids
    ]
    eligible.sort(key=lambda order: order["id"])
    return {
        "id": close_id or f"CLOSE-{action_id.removeprefix('ACT-')}",
        "createdAt": evidence["capturedAt"],
        "total": sum(
            order.get("corrections", [{}])[0].get("balanceAfterMmk", order["total"])
            if order.get("corrections")
            else order["total"]
            for order in eligible
        ),
        "orders": len(eligible),
        "businessDate": myanmar_business_date(evidence["capturedAt"]),
        "orderIds": [order["id"] for order in eligible],
        "paymentExceptionOrderIds": sorted(
            order["id"]
            for order in orders  # type: ignore[union-attr]
            if order["refundStatus"] == "due"
            or (order["status"] != "cancelled" and order["paymentStatus"] == "pending")
        ),
        "stockExceptionSkus": sorted(
            item["sku"]
            for item in items  # type: ignore[union-attr]
            if item["onHand"] <= item["reorderAt"]
        ),
        "actionId": evidence["actionId"],
        "operator": evidence["actor"],
        "reason": evidence["reason"],
        "evidenceReference": evidence["evidenceReference"],
    }


def website_source(*, page_id: str = "page-shop", page_path: str = "/shop") -> dict[str, str]:
    return {
        "fingerprint": "web-1234abcd",
        "approvalId": "approval-website-1",
        "snapshotId": "snapshot-website-1",
        "pageId": page_id,
        "siteName": "SuperMega",
        "pagePath": page_path,
    }


def website_intake(
    *,
    intake_id: str = WEBSITE_INTAKE_ID,
    action_id: str = "ACT-WEB-INTAKE",
    source: dict[str, str] | None = None,
    bound: bool = True,
) -> dict[str, object]:
    intake: dict[str, object] = {
        "id": intake_id,
        "createdAt": NOW,
        "status": "pending_confirmation",
        "source": source or website_source(),
        "sku": "SKU-1",
        "quantity": 2,
        "itemName": "Test item",
        "unitPrice": 100,
        "total": 200,
        "creation": action_evidence(action_id),
    }
    if bound:
        intake["snapshotDigest"] = commerce_website_intake_snapshot_digest(intake)
    return intake


def storefront_request(
    *,
    request_uuid: str = STOREFRONT_REQUEST_UUID,
    quantity: int = 2,
    digest: str = DEFAULT_STOREFRONT_PREVIEW_DIGEST,
    created_at: str = NOW,
    source_revision: int | None = 1,
    source_action_id: str | None = DEFAULT_STOREFRONT_ACTION_ID,
) -> dict[str, object]:
    return {
        "schema": "supermega.ecommerce.order_request.v1",
        "mode": "browser-local-request",
        "state": "pending_shop_review",
        "id": f"ECR-{request_uuid}",
        "idempotencyKey": f"ECI-{request_uuid}",
        "createdAt": created_at,
        "sourcePreviewDigest": digest,
        "sourceStorefrontRevision": source_revision,
        "sourceStorefrontActionId": source_action_id,
        "customerReference": "Customer A",
        "fulfilment": "pickup",
        "currency": "MMK",
        "line": {
            "sku": "SKU-1",
            "name": "Test item",
            "variant": None,
            "quantity": quantity,
            "unitPriceMmk": 100,
        },
        "totalMmk": quantity * 100,
    }


def storefront_request_v2(state: dict[str, object]) -> dict[str, object]:
    configuration = state["storefrontConfiguration"]
    selected_skus = set(configuration["selectedSkus"])  # type: ignore[index]
    items = [
        {
            "sku": item["sku"],
            "name": item["name"],
            "variant": item.get("variant"),
            "unitPriceMmk": item["price"],
            "availability": "available" if item["onHand"] > 0 else "sold_out",
        }
        for item in state["items"]  # type: ignore[union-attr]
        if item["sku"] in selected_skus
    ]
    pim = build_ecommerce_pim_projection(
        scope="ecommerce:managed-commerce-test",
        source_preview_digest=commerce_storefront_preview_digest(state),
        items=items,
    )
    quote_value = build_ecommerce_checkout_quote(
        pim=pim,
        cart=[{"sku": item["sku"], "quantity": 1} for item in items],
        customer_reference="Customer A",
        fulfilment="delivery",
        payment_adapter="kbzpay_manual",
        promotion_code="WELCOME",
        idempotency_key=f"ECI-{STOREFRONT_REQUEST_UUID}",
        quoted_at=NOW,
        expires_at="2026-07-23T09:15:00.000Z",
    )
    return build_ecommerce_order_request(
        quote_value,
        source_storefront_revision=configuration["revision"],  # type: ignore[index]
        source_storefront_action_id=configuration["saved"]["actionId"],  # type: ignore[index]
    )


def storefront_evidence(request: dict[str, object]) -> dict[str, str]:
    request_id = str(request["id"])
    digest = str(request["sourcePreviewDigest"])
    return action_evidence(
        f"ACT-{request_id[4:]}",
        captured_at=str(request["createdAt"]),
        evidence_reference=f"ECOMMERCE:{request_id}:{digest}",
    )


def storefront_catalog_digest(state: dict[str, object]) -> str:
    return commerce_catalog_digest(state)


def storefront_configuration(
    state: dict[str, object],
    *,
    revision: int = 1,
    catalog_revision: int = 1,
    store_name: str = "Mingalar Shop",
    summary: str = "Clear prices and a small customer-ready catalog.",
    selected_skus: list[str] | None = None,
    merchandising: list[dict[str, object]] | None = None,
    digest: str | None = None,
    actor: str = "Accountable operator",
    captured_at: str = NOW,
) -> dict[str, object]:
    catalog_digest = digest or storefront_catalog_digest(state)
    evidence = action_evidence(
        f"ACT-STOREFRONT-R{revision}-{catalog_digest.removeprefix('sha256:')}",
        actor=actor,
        captured_at=captured_at,
        evidence_reference=f"ECOMMERCE-STOREFRONT:{catalog_digest}:R{revision}",
    )
    configuration: dict[str, object] = {
        "schema": "supermega.ecommerce.storefront.v1",
        "revision": revision,
        "shopCatalogSnapshotRevision": catalog_revision,
        "shopCatalogDigest": catalog_digest,
        "storeName": store_name,
        "summary": summary,
        "selectedSkus": selected_skus or ["SKU-1"],
        "saved": evidence,
    }
    if merchandising is not None:
        configuration["merchandising"] = deepcopy(merchandising)
    return configuration


def ecommerce_merchandising_import_package(
    *,
    sku: str = "SKU-1",
) -> dict[str, object]:
    mapping = {
        "sku": "sku",
        "featured": "featured",
        "collection": "collection",
        "displayName": "display_name",
        "note": "merchandising_note",
    }
    source_digest = "sha256:" + "1" * 64
    preview_source = json.dumps(
        {
            "schema": CLIENT_IMPORT_PREVIEW_SCHEMA,
            "product": "ecommerce",
            "object": "storefront_merchandising",
            "workflowTemplateId": "social-storefront",
            "sourceDigest": source_digest,
            "mapping": mapping,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return {
        "contract": CLIENT_IMPORT_STAGING_SCHEMA,
        "product": "ecommerce",
        "object": "storefront_merchandising",
        "workflowTemplateId": "social-storefront",
        "workspace": "Mingalar Shop",
        "owner": "Accountable operator",
        "source": {
            "name": "social-storefront.csv",
            "digest": source_digest,
            "previewDigest": f"sha256:{sha256(preview_source).hexdigest()}",
        },
        "mapping": mapping,
        "rows": [
            {
                "sourceRow": 2,
                "key": sku,
                "values": {
                    "sku": sku,
                    "featured": "true",
                    "collection": "Best sellers",
                    "displayName": "Customer display name",
                    "note": "Lead with approved proof.",
                },
            }
        ],
        "controls": {
            "rowCount": 1,
            "humanReviewRequired": True,
            "externalWritesPerformed": False,
            "activationStatus": "staged_not_applied",
        },
    }


def pending_intake_state() -> dict[str, object]:
    state = catalog_state()
    state["websiteIntakes"] = [website_intake()]
    return state


def converted_intake_state(
    current: dict[str, object] | None = None,
    *,
    conversion_action_id: str = "ACT-WEB-CONVERT",
    order_id: str = "ORD-WEB-1",
) -> dict[str, object]:
    state = deepcopy(current or pending_intake_state())
    conversion = {
        **action_evidence(conversion_action_id, captured_at=CONVERTED_AT),
        "orderId": order_id,
    }
    state["websiteIntakes"][0].update(  # type: ignore[index]
        {"status": "converted", "conversion": conversion}
    )
    state["items"][0]["onHand"] = 8  # type: ignore[index]
    order = order_record(order_id)
    order.update(
        {
            "createdAt": CONVERTED_AT,
            "channel": "Website",
            "fulfilment": "pickup",
            "fulfilmentReference": WEBSITE_INTAKE_ID,
            "sourceRecordId": WEBSITE_INTAKE_ID,
            "evidenceReference": conversion["evidenceReference"],
        }
    )
    state["orders"] = [order]
    state["movements"] = [
        movement(
            "reserve",
            conversion_action_id,
            -2,
            order_id=order_id,
            created_at=CONVERTED_AT,
        )
    ]
    return state


def created_state(order_id: str = "ORD-1") -> dict[str, object]:
    state = catalog_state()
    state["items"] = [{**state["items"][0], "onHand": 8}]  # type: ignore[index]
    state["orders"] = [order_record(order_id)]
    state["movements"] = [movement("reserve", f"ACT-{order_id}", -2, order_id=order_id)]
    return state


def completed_state(order_id: str = "ORD-1") -> dict[str, object]:
    state = created_state(order_id)
    payment = action_evidence(
        f"ACT-PAY-{order_id}",
        captured_at=PAYMENT_AT,
        reason="Matched the settlement record.",
    )
    completion = action_evidence(
        f"ACT-COMPLETE-{order_id}",
        captured_at=COMPLETED_AT,
        reason="Confirmed fulfilment was handed over.",
    )
    state["orders"][0].update(  # type: ignore[index]
        {
            "paymentStatus": "reconciled",
            "paymentReconciledAt": payment["capturedAt"],
            "paymentReconciliationActionId": payment["actionId"],
            "paymentReconciledBy": payment["actor"],
            "paymentReconciliationReason": payment["reason"],
            "paymentEvidenceReference": payment["evidenceReference"],
            "status": "completed",
            "completion": completion,
        }
    )
    return state


def returned_state(
    current: dict[str, object],
    *,
    quantity: int = 1,
    disposition: str = "restock",
    action_id: str = "ACT-RETURN-1",
    captured_at: str = RETURN_AT,
    sku: str = "SKU-1",
) -> dict[str, object]:
    state = deepcopy(current)
    order = state["orders"][0]  # type: ignore[index]
    evidence = action_evidence(
        action_id,
        captured_at=captured_at,
        reason="Inspected the returned item at intake.",
    )
    record = {
        "actionId": evidence["actionId"],
        "createdAt": evidence["capturedAt"],
        "actor": evidence["actor"],
        "reason": evidence["reason"],
        "evidenceReference": evidence["evidenceReference"],
        "sku": sku,
        "quantity": quantity,
        "disposition": disposition,
    }
    order["returns"] = [record, *order.get("returns", [])]
    if disposition == "restock":
        state["items"][0]["onHand"] += quantity  # type: ignore[index]
        state["movements"] = [
            movement(
                "return",
                action_id,
                quantity,
                order_id=str(order["id"]),
                created_at=captured_at,
                sku=sku,
            ),
            *state["movements"],  # type: ignore[misc]
        ]
        state["movements"][0]["reason"] = evidence["reason"]  # type: ignore[index]
    return state


def corrected_state(
    current: dict[str, object],
    *,
    kind: str = "credit",
    reason_code: str = "pricing_error",
    listed_amount_mmk: int = 50,
    action_id: str = "ACT-CORRECTION-1",
    captured_at: str = CORRECTION_AT,
) -> dict[str, object]:
    state = deepcopy(current)
    order = state["orders"][0]  # type: ignore[index]
    evidence = action_evidence(
        action_id,
        captured_at=captured_at,
        reason="Approved the invoice correction against source evidence.",
    )
    calculation = {
        "currency": "MMK",
        "taxConfigurationRevision": None,
        "taxCode": None,
        "taxRateBasisPoints": None,
        "taxMode": "not_configured",
        "listedAmountMmk": listed_amount_mmk,
        "subtotalMmk": listed_amount_mmk,
        "taxMmk": 0,
        "totalMmk": listed_amount_mmk,
    }
    current_balance = (
        order.get("corrections", [{}])[0].get("balanceAfterMmk", order["total"])
        if order.get("corrections")
        else order["total"]
    )
    record = {
        "documentId": "COR2:" + quote(action_id, safe="-_.!~*'()"),
        "actionId": action_id,
        "createdAt": captured_at,
        "actor": evidence["actor"],
        "reason": evidence["reason"],
        "evidenceReference": evidence["evidenceReference"],
        "kind": kind,
        "reasonCode": reason_code,
        "sourceCalculationDigest": commerce_order_calculation_digest(order),
        "calculation": calculation,
        "balanceAfterMmk": current_balance + (listed_amount_mmk if kind == "debit" else -listed_amount_mmk),
        "financialStatus": "review_required",
        "postingAuthority": "none",
        "externalPostingPerformed": False,
    }
    order["corrections"] = [record, *order.get("corrections", [])]
    return state


def cancelled_due_state(
    order_ids: tuple[str, ...] = ("ORD-REFUND",),
) -> dict[str, object]:
    state = catalog_state()
    orders: list[dict[str, object]] = []
    movements: list[dict[str, object]] = []
    for order_id in order_ids:
        order = order_record(order_id)
        order.update(
            {
                "paymentStatus": "reconciled",
                "paymentReconciledAt": NOW,
                "paymentReconciliationActionId": f"ACT-PAY-{order_id}",
                "paymentReconciledBy": "Accountable operator",
                "paymentReconciliationReason": "Matched payment before cancellation.",
                "paymentEvidenceReference": f"EV-PAY-{order_id}",
                "status": "cancelled",
                "refundStatus": "due",
            }
        )
        orders.append(order)
        movements.extend(
            (
                movement("release", f"ACT-CANCEL-{order_id}", 2, order_id=order_id),
                movement("reserve", f"ACT-{order_id}", -2, order_id=order_id),
            )
        )
    state["orders"] = orders
    state["movements"] = movements
    return state


def settled_refund_state(
    current: dict[str, object],
    *,
    order_index: int = 0,
    action_id: str = "ACT-REFUND-SETTLED",
    captured_at: str = NOW,
    actor: str = "Accountable operator",
    reason: str = "Matched the external refund settlement record.",
    evidence_reference: str | None = None,
) -> dict[str, object]:
    state = deepcopy(current)
    evidence = action_evidence(
        action_id,
        captured_at=captured_at,
        actor=actor,
        reason=reason,
        evidence_reference=evidence_reference,
    )
    state["orders"][order_index].update(  # type: ignore[index]
        {
            "refundStatus": "settled",
            "refundSettledAt": evidence["capturedAt"],
            "refundSettlementActionId": evidence["actionId"],
            "refundSettledBy": evidence["actor"],
            "refundSettlementReason": evidence["reason"],
            "refundEvidenceReference": evidence["evidenceReference"],
        }
    )
    return state


def evidence_for(event_type: str, next_state: dict[str, object]) -> dict[str, str]:
    if event_type == "commerce.item.updated":
        return dict(next_state["catalogChanges"][0]["proof"])  # type: ignore[index,arg-type]
    if event_type == "commerce.purchase_order.created":
        return dict(next_state["purchaseOrders"][0]["creation"])  # type: ignore[index, arg-type]
    if event_type == "commerce.purchase_order.cancelled":
        cancelled = next(
            purchase_order
            for purchase_order in next_state["purchaseOrders"]  # type: ignore[union-attr]
            if "cancellation" in purchase_order
        )
        return dict(cancelled["cancellation"])
    if event_type == "commerce.website_intake.created":
        return dict(next_state["websiteIntakes"][0]["creation"])  # type: ignore[index, arg-type]
    if event_type == "commerce.website_intake.converted":
        conversion = dict(next_state["websiteIntakes"][0]["conversion"])  # type: ignore[index, arg-type]
        conversion.pop("orderId")
        return conversion  # type: ignore[return-value]
    if event_type == "commerce.storefront_request.received":
        return storefront_evidence(next_state["storefrontRequests"][0])  # type: ignore[index,arg-type]
    if event_type == "commerce.storefront.configuration.saved":
        return dict(next_state["storefrontConfiguration"]["saved"])  # type: ignore[index,arg-type]
    if event_type == "commerce.tax_configuration.saved":
        return dict(next_state["taxConfigurations"][0]["proof"])  # type: ignore[index,arg-type]
    if event_type == "commerce.account_mapping.saved":
        return dict(next_state["accountMappingConfigurations"][0]["proof"])  # type: ignore[index,arg-type]
    if event_type == "commerce.order.advanced":
        completed_orders = [
            order
            for order in next_state["orders"]  # type: ignore[union-attr]
            if "completion" in order
        ]
        if completed_orders:
            return dict(completed_orders[0]["completion"])
        advanced_orders = [
            order
            for order in next_state["orders"]  # type: ignore[union-attr]
            if order.get("advancementActionIds")
        ]
        if advanced_orders:
            return action_evidence(
                advanced_orders[0]["advancementActionIds"][-1]
            )
    if event_type == "commerce.order.return_recorded":
        returned_orders = [
            order
            for order in next_state["orders"]  # type: ignore[union-attr]
            if order.get("returns")
        ]
        record = returned_orders[0]["returns"][0]
        return {
            "actionId": record["actionId"],
            "capturedAt": record["createdAt"],
            "actor": record["actor"],
            "reason": record["reason"],
            "evidenceReference": record["evidenceReference"],
        }
    if event_type == "commerce.order.correction_recorded":
        corrected_orders = [
            order
            for order in next_state["orders"]  # type: ignore[union-attr]
            if order.get("corrections")
        ]
        record = corrected_orders[0]["corrections"][0]
        return {
            "actionId": record["actionId"],
            "capturedAt": record["createdAt"],
            "actor": record["actor"],
            "reason": record["reason"],
            "evidenceReference": record["evidenceReference"],
        }
    if event_type in {
        "commerce.item.created",
        "commerce.order.created",
        "commerce.order.cancelled",
        "commerce.stock.received",
        "commerce.stock.counted",
        "commerce.production_material.issued",
        "commerce.purchase_order.received",
    }:
        movement_record = next_state["movements"][0]  # type: ignore[index]
        return {
            "actionId": movement_record["actionId"],
            "capturedAt": movement_record["createdAt"],
            "actor": movement_record["actor"],
            "reason": movement_record["reason"],
            "evidenceReference": movement_record["evidenceReference"],
        }
    if event_type == "commerce.payment.reconciled":
        order = next_state["orders"][0]  # type: ignore[index]
        return {
            "actionId": order["paymentReconciliationActionId"],
            "capturedAt": order["paymentReconciledAt"],
            "actor": order["paymentReconciledBy"],
            "reason": order["paymentReconciliationReason"],
            "evidenceReference": order["paymentEvidenceReference"],
        }
    if event_type == "commerce.refund.settled":
        settled_orders = [
            order
            for order in next_state["orders"]  # type: ignore[union-attr]
            if order["refundStatus"] == "settled"
        ]
        order = settled_orders[0]
        return {
            "actionId": order["refundSettlementActionId"],
            "capturedAt": order["refundSettledAt"],
            "actor": order["refundSettledBy"],
            "reason": order["refundSettlementReason"],
            "evidenceReference": order["refundEvidenceReference"],
        }
    if event_type == "commerce.close.saved":
        close = next_state["closes"][0]  # type: ignore[index]
        return {
            "actionId": close["actionId"],
            "capturedAt": close["createdAt"],
            "actor": close["operator"],
            "reason": close["reason"],
            "evidenceReference": close["evidenceReference"],
        }
    return action_evidence()


def apply_event(
    current: dict[str, object],
    event_type: str,
    next_state: dict[str, object],
    evidence: dict[str, str] | None = None,
) -> dict[str, object]:
    prepared_state = next_state
    if event_type in {
        "commerce.order.created",
        "commerce.website_intake.converted",
    }:
        current_orders = current.get("orders", [])
        next_orders = next_state.get("orders", [])
        if (
            isinstance(current_orders, list)
            and isinstance(next_orders, list)
            and len(next_orders) == len(current_orders) + 1
            and isinstance(next_orders[0], dict)
            and "calculation" not in next_orders[0]
        ):
            order = next_orders[0]
            lines = order.get("lines")
            subtotal_mmk: int | None = None
            if isinstance(lines, list) and lines:
                try:
                    subtotal_mmk = sum(
                        int(line["quantity"]) * int(line["unitPriceMmk"])
                        for line in lines
                    )
                except (KeyError, TypeError, ValueError):
                    subtotal_mmk = None
            elif isinstance(order.get("itemSku"), str) and isinstance(
                order.get("quantity"),
                int,
            ):
                matches = [
                    item
                    for item in current.get("items", [])  # type: ignore[union-attr]
                    if isinstance(item, dict)
                    and item.get("sku") == order["itemSku"]
                ]
                if len(matches) == 1 and isinstance(matches[0].get("price"), int):
                    subtotal_mmk = int(order["quantity"]) * int(matches[0]["price"])
            if subtotal_mmk is not None:
                prepared_state = deepcopy(next_state)
                prepared_order = prepared_state["orders"][0]  # type: ignore[index]
                prepared_order["calculation"] = {
                    "schema": "supermega.commerce.order-calculation.v1",
                    "currency": "MMK",
                    "catalogRevision": len(current.get("catalogChanges", [])),  # type: ignore[arg-type]
                    "subtotalMmk": subtotal_mmk,
                    "taxMode": "not_configured",
                    "taxMmk": 0,
                    "totalMmk": subtotal_mmk,
                }
    return dict(
        reduce_trial_state(
            "commerce",
            event_type,
            current,
            {
                "state": prepared_state,
                "evidence": evidence or evidence_for(event_type, prepared_state),
            },
        )
    )


class CommerceRuntimeTests(unittest.TestCase):
    def test_production_material_issue_decrements_one_item_with_linked_evidence(self) -> None:
        current = catalog_state()
        issue = movement(
            "production_issue",
            "ACT-PRODUCTION-ISSUE-001",
            -3,
            created_at="2026-07-24T10:00:00.000Z",
        )
        issue.update(
            {
                "productionRequestId": "ISSUE-MANAGED-001",
                "productionCommandDigest": f"sha256:{'a' * 64}",
                "productionJobId": "JOB-REAL-001",
                "productionMaterialId": "MAT-MANAGED-001",
                "productionInputLotId": "LOT-MANAGED-001",
                "productionQuantityMilli": 10_000,
                "productionUnit": "kg",
                "conversionNote": "3 Shop units provide the reviewed 10 kg Plant issue.",
            }
        )
        next_state = deepcopy(current)
        next_state["items"][0]["onHand"] = 7  # type: ignore[index]
        next_state["movements"] = [issue]

        accepted = apply_event(
            current,
            "commerce.production_material.issued",
            next_state,
        )

        self.assertEqual(accepted["items"][0]["onHand"], 7)  # type: ignore[index]
        self.assertEqual(accepted["movements"][0]["productionRequestId"], "ISSUE-MANAGED-001")  # type: ignore[index]

        missing_link = deepcopy(next_state)
        del missing_link["movements"][0]["productionCommandDigest"]  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.production_material.issued",
                missing_link,
            )

    def test_initialization_requires_catalog_without_invented_history(self) -> None:
        initialized = apply_event({}, "commerce.workspace.initialized", catalog_state())
        self.assertEqual(initialized, catalog_state())

        with self.assertRaises(TrialValidationError):
            apply_event({}, "commerce.workspace.initialized", created_state())
        with self.assertRaises(TrialValidationError):
            apply_event(catalog_state(), "commerce.workspace.initialized", catalog_state())

    def test_legacy_v2_state_and_empty_intake_collection_are_backward_compatible(self) -> None:
        legacy = catalog_state()
        self.assertNotIn("websiteIntakes", legacy)
        self.assertNotIn("catalogChanges", legacy)
        self.assertEqual(validate_commerce_state(legacy), legacy)
        self.assertEqual(apply_event({}, "commerce.workspace.initialized", legacy), legacy)

        explicit_empty = catalog_state()
        explicit_empty["websiteIntakes"] = []
        explicit_empty["catalogChanges"] = []
        self.assertEqual(
            apply_event({}, "commerce.workspace.initialized", explicit_empty),
            explicit_empty,
        )
        with self.assertRaises(TrialValidationError):
            apply_event({}, "commerce.workspace.initialized", pending_intake_state())
        with self.assertRaises(TrialValidationError):
            apply_event(
                {},
                "commerce.workspace.initialized",
                catalog_update_state(catalog_state()),
            )

    def test_catalog_update_changes_only_price_reorder_and_binds_exact_proof(self) -> None:
        current = catalog_state()
        next_state = catalog_update_state(
            current,
            next_price=125,
            next_reorder_at=4,
        )
        accepted = apply_event(current, "commerce.item.updated", next_state)

        self.assertEqual(
            accepted["items"][0],  # type: ignore[index]
            {
                **current["items"][0],  # type: ignore[index]
                "price": 125,
                "reorderAt": 4,
            },
        )
        expected_proof = action_evidence(
            "ACT-CATALOG-UPDATE",
            reason="Approved the reviewed catalog values.",
        )
        self.assertEqual(
            accepted["catalogChanges"][0],  # type: ignore[index]
            {
                "sku": "SKU-1",
                "previousPrice": 100,
                "nextPrice": 125,
                "previousReorderAt": 2,
                "nextReorderAt": 4,
                "proof": expected_proof,
            },
        )
        self.assertEqual(
            accepted["catalogBaselines"][0]["anchorDigest"],  # type: ignore[index]
            "sha256:b919e89be047ecdfc1dbce76f5aa95936c41d09d54eb4778bc7507e2c372b509",
        )
        for collection in ("orders", "movements", "closes"):
            self.assertEqual(accepted[collection], current[collection])

        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.item.updated",
                next_state,
                action_evidence(
                    "ACT-CATALOG-UPDATE",
                    reason="Different command evidence.",
                ),
            )

        stale_previous = deepcopy(next_state)
        stale_previous["catalogChanges"][0]["previousPrice"] = 99  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(stale_previous)
        with self.assertRaises(TrialValidationError):
            apply_event(current, "commerce.item.updated", stale_previous)

        rewritten_baseline = deepcopy(next_state)
        rewritten_baseline["catalogBaselines"][0]["price"] = 99  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(rewritten_baseline)

        missing_baseline = deepcopy(next_state)
        missing_baseline["catalogBaselines"] = []
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(missing_baseline)

        wrong_next = deepcopy(next_state)
        wrong_next["catalogChanges"][0]["nextPrice"] = 126  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(wrong_next)

    def test_catalog_update_rejects_forbidden_item_and_collection_changes(self) -> None:
        current = catalog_state()
        current["items"].append(  # type: ignore[union-attr]
            {
                "sku": "SKU-2",
                "name": "Second item",
                "onHand": 3,
                "reorderAt": 1,
                "price": 250,
            }
        )
        changed_name = catalog_update_state(current)
        changed_name["items"][0]["name"] = "Rewritten item"  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(current, "commerce.item.updated", changed_name)

        changed_two_items = catalog_update_state(current)
        changed_two_items["items"][1]["price"] = 300  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(current, "commerce.item.updated", changed_two_items)

        current_with_order = created_state()
        changed_order = catalog_update_state(current_with_order)
        changed_order["orders"][0]["customer"] = "Rewritten customer"  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(
                current_with_order,
                "commerce.item.updated",
                changed_order,
            )

        historical_change = catalog_update_state(current)
        historical_change["items"][0]["price"] = 100  # type: ignore[index]
        historical_change["items"][0]["reorderAt"] = 2  # type: ignore[index]
        historical_change["catalogChanges"][0].update(  # type: ignore[index]
            {
                "previousPrice": 90,
                "nextPrice": 100,
                "previousReorderAt": 1,
                "nextReorderAt": 2,
            }
        )
        received = deepcopy(current)
        received["items"][0]["onHand"] = 15  # type: ignore[index]
        received["movements"] = [
            movement("receipt", "ACT-RECEIVE-WITH-CATALOG-HISTORY", 5)
        ]
        received["catalogChanges"] = historical_change["catalogChanges"]
        with self.assertRaises(TrialValidationError):
            apply_event(current, "commerce.stock.received", received)

    def test_catalog_change_state_rejects_malformed_over_cap_and_broken_chains(self) -> None:
        current = catalog_state()
        valid = catalog_update_state(current)

        malformed_states: list[tuple[str, dict[str, object]]] = []
        unknown_sku = deepcopy(valid)
        unknown_sku["catalogChanges"][0]["sku"] = "SKU-UNKNOWN"  # type: ignore[index]
        malformed_states.append(("unknown SKU", unknown_sku))

        unsafe_price = deepcopy(valid)
        unsafe_price["catalogChanges"][0]["previousPrice"] = True  # type: ignore[index]
        malformed_states.append(("unsafe price", unsafe_price))

        negative_reorder = deepcopy(valid)
        negative_reorder["catalogChanges"][0]["previousReorderAt"] = -1  # type: ignore[index]
        malformed_states.append(("negative reorder", negative_reorder))

        no_op = deepcopy(valid)
        no_op["items"][0]["price"] = 100  # type: ignore[index]
        no_op["items"][0]["reorderAt"] = 2  # type: ignore[index]
        no_op["catalogChanges"][0].update(  # type: ignore[index]
            {
                "previousPrice": 100,
                "nextPrice": 100,
                "previousReorderAt": 2,
                "nextReorderAt": 2,
            }
        )
        malformed_states.append(("no-op", no_op))

        extra_proof_field = deepcopy(valid)
        extra_proof_field["catalogChanges"][0]["proof"]["untrusted"] = True  # type: ignore[index]
        malformed_states.append(("extra proof field", extra_proof_field))

        for label, malformed in malformed_states:
            with self.subTest(label=label), self.assertRaises(TrialValidationError):
                validate_commerce_state(malformed)

        over_cap = deepcopy(valid)
        over_cap["catalogChanges"] = [
            deepcopy(valid["catalogChanges"][0])  # type: ignore[index]
            for _ in range(501)
        ]
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(over_cap)

        first = apply_event(current, "commerce.item.updated", valid)
        chained = catalog_update_state(
            first,
            next_price=150,
            next_reorder_at=6,
            action_id="ACT-CATALOG-UPDATE-2",
            captured_at=CONVERTED_AT,
        )
        self.assertEqual(
            apply_event(first, "commerce.item.updated", chained),
            chained,
        )

        broken_chain = deepcopy(chained)
        broken_chain["catalogChanges"][1]["nextPrice"] = 124  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(broken_chain)

        wrong_order = deepcopy(chained)
        wrong_order["catalogChanges"][1]["proof"]["capturedAt"] = RETURN_AT  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(wrong_order)

        current_mismatch = deepcopy(chained)
        current_mismatch["items"][0]["price"] = 149  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(current_mismatch)

    def test_catalog_update_rejects_reused_action_id(self) -> None:
        first = apply_event(
            catalog_state(),
            "commerce.item.updated",
            catalog_update_state(catalog_state()),
        )
        reused = catalog_update_state(
            first,
            next_price=150,
            next_reorder_at=6,
            action_id="ACT-CATALOG-UPDATE",
            captured_at=CONVERTED_AT,
        )
        with self.assertRaises(TrialValidationError):
            apply_event(first, "commerce.item.updated", reused)

    def test_catalog_update_command_replay_is_exact(self) -> None:
        store = InMemoryTrialStore(reducer=reduce_trial_state)
        operator = TrialPrincipal(
            "workspace-catalog-update",
            "Accountable operator",
            "human",
        )
        store.provision_membership(
            workspace_id=operator.workspace_id,
            actor_id=operator.actor_id,
            actor_kind=operator.actor_kind,
            capabilities=("commerce.write",),
        )
        initialized = store.apply_command(
            operator,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.workspace.initialized",
            expected_version=0,
            payload={
                "state": catalog_state(),
                "evidence": action_evidence("ACT-CATALOG-INITIALIZE"),
            },
        )
        updated_state = catalog_update_state(
            initialized.state,
            actor="Spoofed client actor",
        )
        payload = {
            "state": updated_state,
            "evidence": evidence_for("commerce.item.updated", updated_state),
        }
        command_id = str(uuid4())
        first = store.apply_command(
            operator,
            command_id=command_id,
            surface="commerce",
            event_type="commerce.item.updated",
            expected_version=initialized.version,
            payload=payload,
        )
        replay = store.apply_command(
            operator,
            command_id=command_id,
            surface="commerce",
            event_type="commerce.item.updated",
            expected_version=initialized.version,
            payload=payload,
        )

        self.assertEqual(first.version, 2)
        self.assertEqual(
            first.state["catalogChanges"][0]["proof"]["actor"],  # type: ignore[index]
            operator.actor_id,
        )
        self.assertNotEqual(
            first.state["catalogChanges"][0]["proof"]["capturedAt"],  # type: ignore[index]
            NOW,
        )
        self.assertEqual(
            first.state["catalogBaselines"][0]["proof"],  # type: ignore[index]
            first.state["catalogChanges"][0]["proof"],  # type: ignore[index]
        )
        self.assertEqual(
            first.state["catalogBaselines"][0]["anchorDigest"],  # type: ignore[index]
            commerce_catalog_baseline_digest(
                first.state["catalogBaselines"][0]  # type: ignore[index,arg-type]
            ),
        )
        self.assertTrue(replay.idempotent_replay)
        self.assertEqual(replay.state, first.state)

        conflicting_payload = deepcopy(payload)
        conflicting_payload["evidence"]["reason"] = "Conflicting replay."  # type: ignore[index]
        conflicting_payload["state"]["catalogChanges"][0]["proof"]["reason"] = (  # type: ignore[index]
            "Conflicting replay."
        )
        with self.assertRaises(TrialIdempotencyConflict):
            store.apply_command(
                operator,
                command_id=command_id,
                surface="commerce",
                event_type="commerce.item.updated",
                expected_version=initialized.version,
                payload=conflicting_payload,
            )

    def test_store_rejects_reusing_an_action_id_from_immutable_command_history(self) -> None:
        store = InMemoryTrialStore(reducer=reduce_trial_state)
        operator = TrialPrincipal(
            "workspace-action-history",
            "Accountable operator",
            "human",
        )
        other_operator = TrialPrincipal(
            "workspace-action-history-other",
            "Other operator",
            "human",
        )
        for principal in (operator, other_operator):
            store.provision_membership(
                workspace_id=principal.workspace_id,
                actor_id=principal.actor_id,
                actor_kind=principal.actor_kind,
                capabilities=("commerce.write",),
            )
        initialization_command_id = str(uuid4())
        initialization_payload = {
            "state": catalog_state(),
            "evidence": action_evidence("ACT-HISTORY-ONLY"),
        }
        initialized = store.apply_command(
            operator,
            command_id=initialization_command_id,
            surface="commerce",
            event_type="commerce.workspace.initialized",
            expected_version=0,
            payload=initialization_payload,
        )
        replay = store.apply_command(
            operator,
            command_id=initialization_command_id,
            surface="commerce",
            event_type="commerce.workspace.initialized",
            expected_version=0,
            payload=initialization_payload,
        )
        self.assertTrue(replay.idempotent_replay)

        purchase_state = deepcopy(initialized.state)
        purchase_state["purchaseOrders"] = [
            purchase_order_record(action_id="ACT-HISTORY-ONLY")
        ]
        with self.assertRaises(TrialValidationError):
            store.apply_command(
                operator,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.purchase_order.created",
                expected_version=initialized.version,
                payload={
                    "state": purchase_state,
                    "evidence": dict(purchase_state["purchaseOrders"][0]["creation"]),  # type: ignore[index,arg-type]
                },
            )

        other_payload = {
            "state": catalog_state(),
            "evidence": action_evidence(
                "ACT-HISTORY-ONLY",
                actor=other_operator.actor_id,
            ),
        }
        other_initialized = store.apply_command(
            other_operator,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.workspace.initialized",
            expected_version=0,
            payload=other_payload,
        )
        self.assertEqual(other_initialized.version, 1)

    def test_storefront_request_is_retained_without_shop_side_effects(self) -> None:
        current = catalog_state()
        current["storefrontConfiguration"] = storefront_configuration(current)
        request = storefront_request()
        next_state = deepcopy(current)
        next_state["storefrontRequests"] = [request]

        accepted = apply_event(
            current,
            "commerce.storefront_request.received",
            next_state,
        )

        self.assertEqual(accepted["storefrontRequests"], [request])
        for field in ("items", "orders", "movements", "closes"):
            self.assertEqual(accepted[field], current[field])
        self.assertEqual(accepted.get("websiteIntakes", []), [])
        self.assertEqual(
            accepted["storefrontConfiguration"],
            current["storefrontConfiguration"],
        )

        for label, invalid in (
            ("changed item", {**next_state, "items": [{**current["items"][0], "onHand": 9}]}),  # type: ignore[index]
            ("created order", {**next_state, "orders": [order_record()]}),
            ("changed price", {**next_state, "storefrontRequests": [{**request, "line": {**request["line"], "unitPriceMmk": 101}, "totalMmk": 202}]}),  # type: ignore[arg-type]
            ("unbound digest", {**next_state, "storefrontRequests": [{**request, "sourcePreviewDigest": "sha256:" + "b" * 64}]}),
            ("bad digest", {**next_state, "storefrontRequests": [{**request, "sourcePreviewDigest": "sha256:" + "A" * 64}]}),
        ):
            with self.subTest(label=label), self.assertRaises(TrialValidationError):
                apply_event(
                    current,
                    "commerce.storefront_request.received",
                    invalid,
                )

        unconfigured = catalog_state()
        unconfigured_next = deepcopy(unconfigured)
        unconfigured_next["storefrontRequests"] = [request]
        with self.assertRaises(TrialValidationError):
            apply_event(
                unconfigured,
                "commerce.storefront_request.received",
                unconfigured_next,
            )

        for label, provenance_request in (
            (
                "missing provenance",
                storefront_request(source_revision=None, source_action_id=None),
            ),
            (
                "wrong revision",
                storefront_request(source_revision=2),
            ),
            (
                "wrong action",
                storefront_request(source_action_id="ACT-STOREFRONT-WRONG"),
            ),
            (
                "predates save",
                storefront_request(created_at="2026-07-23T08:59:59.000Z"),
            ),
        ):
            provenance_next = deepcopy(current)
            provenance_next["storefrontRequests"] = [provenance_request]
            with self.subTest(label=label), self.assertRaises(TrialValidationError):
                apply_event(
                    current,
                    "commerce.storefront_request.received",
                    provenance_next,
                )

        stale_configuration = deepcopy(current)
        stale_configuration["items"].append(  # type: ignore[union-attr]
            {
                "sku": "SKU-2",
                "name": "Second item",
                "onHand": 2,
                "reorderAt": 1,
                "price": 50,
            }
        )
        stale_next = deepcopy(stale_configuration)
        stale_next["storefrontRequests"] = [request]
        with self.assertRaises(TrialValidationError):
            apply_event(
                stale_configuration,
                "commerce.storefront_request.received",
                stale_next,
            )

        excluded = catalog_state()
        excluded["items"].append(  # type: ignore[union-attr]
            {
                "sku": "SKU-2",
                "name": "Second item",
                "onHand": 2,
                "reorderAt": 1,
                "price": 50,
            }
        )
        excluded_configuration = storefront_configuration(
            excluded,
            selected_skus=["SKU-1"],
        )
        excluded["storefrontConfiguration"] = excluded_configuration
        excluded_request = {
            **request,
            "sourceStorefrontRevision": excluded_configuration["revision"],
            "sourceStorefrontActionId": excluded_configuration["saved"]["actionId"],  # type: ignore[index]
            "line": {
                **request["line"],  # type: ignore[arg-type]
                "sku": "SKU-2",
                "name": "Second item",
                "unitPriceMmk": 50,
            },
            "totalMmk": 100,
        }
        excluded_next = deepcopy(excluded)
        excluded_next["storefrontRequests"] = [excluded_request]
        with self.assertRaises(TrialValidationError):
            apply_event(
                excluded,
                "commerce.storefront_request.received",
                excluded_next,
            )

        sold_out = deepcopy(current)
        sold_out["items"][0]["onHand"] = 0  # type: ignore[index]
        sold_out_request = storefront_request(
            digest=commerce_storefront_preview_digest(sold_out),
        )
        sold_out_next = deepcopy(sold_out)
        sold_out_next["storefrontRequests"] = [sold_out_request]
        with self.assertRaises(TrialValidationError):
            apply_event(
                sold_out,
                "commerce.storefront_request.received",
                sold_out_next,
            )

        changed_receipt = deepcopy(accepted)
        changed_receipt["storefrontRequests"][0]["customerReference"] = "Changed"  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(
                accepted,
                "commerce.stock.received",
                changed_receipt,
                action_evidence(),
            )

        collision_action_id = f"ACT-{STOREFRONT_REQUEST_UUID}"
        collision_current = deepcopy(current)
        collision_next = deepcopy(collision_current)
        collision_next["items"][0]["onHand"] = 11  # type: ignore[index]
        collision_next["movements"] = [movement("receipt", collision_action_id, 1)]
        collision_current = apply_event(
            collision_current,
            "commerce.stock.received",
            collision_next,
            action_evidence(collision_action_id),
        )
        collision_state = deepcopy(collision_current)
        collision_state["storefrontRequests"] = [request]
        with self.assertRaises(TrialValidationError):
            apply_event(
                collision_current,
                "commerce.storefront_request.received",
                collision_state,
            )

        oversized = catalog_state()
        oversized["storefrontRequests"] = [
            storefront_request(request_uuid=f"00000000-0000-4000-8000-{index:012d}")
            for index in range(100, 201)
        ]
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(oversized)

    def test_multiline_storefront_request_reaches_managed_shop_inbox(self) -> None:
        current = catalog_state()
        current["items"].append(  # type: ignore[union-attr]
            {
                "sku": "SKU-2",
                "name": "Second item",
                "variant": "Large",
                "onHand": 5,
                "reorderAt": 1,
                "price": 250,
            }
        )
        current["storefrontConfiguration"] = storefront_configuration(
            current,
            selected_skus=["SKU-1", "SKU-2"],
        )
        request = storefront_request_v2(current)
        next_state = deepcopy(current)
        next_state["storefrontRequests"] = [request]

        accepted = apply_event(
            current,
            "commerce.storefront_request.received",
            next_state,
            storefront_evidence(request),
        )

        self.assertEqual(accepted["storefrontRequests"], [request])
        self.assertEqual(len(request["lines"]), 2)  # type: ignore[arg-type]
        for field in ("items", "orders", "movements", "closes"):
            self.assertEqual(accepted[field], current[field])

        tampered_quote = deepcopy(next_state)
        tampered_quote["storefrontRequests"][0]["quote"]["payment"]["status"] = "authorized"  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.storefront_request.received",
                tampered_quote,
                storefront_evidence(request),
            )

        repriced_line = deepcopy(next_state)
        repriced_line["storefrontRequests"][0]["lines"][1]["unitPriceMmk"] += 1  # type: ignore[index,operator]
        repriced_line["storefrontRequests"][0]["lines"][1]["lineTotalMmk"] += 1  # type: ignore[index,operator]
        repriced_line["storefrontRequests"][0]["totalMmk"] += 1  # type: ignore[index,operator]
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.storefront_request.received",
                repriced_line,
                storefront_evidence(request),
            )

    def test_storefront_catalog_digest_matches_cross_runtime_golden(self) -> None:
        vector: dict[str, object] = {
            "schema": "supermega.commerce.workspace.v2",
            "items": [
                {
                    "sku": "SM-😀",
                    "name": "Emoji item",
                    "onHand": 4,
                    "reorderAt": 1,
                    "price": 400,
                },
                {
                    "sku": "SM-a",
                    "name": "Lowercase item",
                    "variant": "v2",
                    "onHand": 2,
                    "reorderAt": 1,
                    "price": 200,
                },
                {
                    "sku": "SM-\ue000",
                    "name": "Private-use item",
                    "onHand": 3,
                    "reorderAt": 1,
                    "price": 300,
                },
                {
                    "sku": "SM-A",
                    "name": "မြန်မာ လက်ဖက်ရည်",
                    "variant": "သေး",
                    "onHand": 1,
                    "reorderAt": 1,
                    "price": 100,
                },
            ],
            "orders": [],
            "movements": [],
            "closes": [],
        }
        self.assertEqual(
            commerce_catalog_digest(vector),
            "sha256:c03d623521a78627b7c324771c02be32dcc2f25c7e61d0883ebc6106042e0af2",
        )

    def test_storefront_preview_digest_matches_cross_runtime_golden(self) -> None:
        current = catalog_state()
        current["storefrontConfiguration"] = storefront_configuration(current)

        self.assertEqual(
            commerce_storefront_preview_digest(current),
            DEFAULT_STOREFRONT_PREVIEW_DIGEST,
        )
        unicode_vector: dict[str, object] = {
            "schema": "supermega.commerce.workspace.v2",
            "items": [
                {
                    "sku": "SM-😀",
                    "name": "Emoji item",
                    "onHand": 4,
                    "reorderAt": 1,
                    "price": 400,
                },
                {
                    "sku": "SM-A",
                    "name": "မြန်မာ လက်ဖက်ရည်",
                    "variant": "သေး",
                    "onHand": 0,
                    "reorderAt": 1,
                    "price": 100,
                },
            ],
            "orders": [],
            "movements": [],
            "closes": [],
        }
        unicode_vector["storefrontConfiguration"] = storefront_configuration(
            unicode_vector,
            store_name="မင်္ဂလာ ဆိုင်",
            summary="ရွေးထားသော ပစ္စည်းများ။",
            selected_skus=["SM-A", "SM-😀"],
        )
        self.assertEqual(
            commerce_storefront_preview_digest(unicode_vector),
            "sha256:a755c68b02a8de75279f0bcda5bb8ed21078ee538a68f583eeb223ee8a43973c",
        )

    def test_storefront_merchandising_is_canonical_revisioned_and_preview_bound(self) -> None:
        current = catalog_state()
        merchandising = [
            {
                "sku": "SKU-1",
                "featured": True,
                "collection": "Best sellers",
                "displayName": "Myanmar coffee 250g",
                "note": "Lead with the locally sourced proof.",
            }
        ]
        first_state = deepcopy(current)
        first_state["storefrontConfiguration"] = storefront_configuration(current)
        first = apply_event(
            current,
            "commerce.storefront.configuration.saved",
            first_state,
        )
        second_state = deepcopy(first)
        second_state["storefrontConfiguration"] = storefront_configuration(
            first,
            revision=2,
            merchandising=merchandising,
        )
        second = apply_event(
            first,
            "commerce.storefront.configuration.saved",
            second_state,
        )
        self.assertEqual(
            second["storefrontConfiguration"]["merchandising"],  # type: ignore[index]
            merchandising,
        )
        self.assertEqual(
            commerce_storefront_preview_digest(second),
            "sha256:7fecf82c74d794cae9380e3a3ce946f6d0f2bd1a0a838869ac77f867b309af61",
        )
        self.assertNotEqual(
            commerce_storefront_preview_digest(first),
            commerce_storefront_preview_digest(second),
        )

        unchanged = deepcopy(second)
        unchanged["storefrontConfiguration"] = storefront_configuration(
            second,
            revision=3,
            merchandising=merchandising,
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                second,
                "commerce.storefront.configuration.saved",
                unchanged,
            )

        invalid_vectors = []
        wrong_sku = deepcopy(second)
        wrong_sku["storefrontConfiguration"]["merchandising"][0]["sku"] = "UNKNOWN"  # type: ignore[index]
        invalid_vectors.append(wrong_sku)
        wrong_boolean = deepcopy(second)
        wrong_boolean["storefrontConfiguration"]["merchandising"][0]["featured"] = "true"  # type: ignore[index]
        invalid_vectors.append(wrong_boolean)
        noncanonical_optional = deepcopy(second)
        noncanonical_optional["storefrontConfiguration"]["merchandising"][0]["displayName"] = " padded "  # type: ignore[index]
        invalid_vectors.append(noncanonical_optional)
        extra_field = deepcopy(second)
        extra_field["storefrontConfiguration"]["merchandising"][0]["price"] = 1  # type: ignore[index]
        invalid_vectors.append(extra_field)
        for candidate in invalid_vectors:
            with self.assertRaises(TrialValidationError):
                validate_commerce_state(candidate)

    def test_reviewed_ecommerce_import_derives_one_locked_storefront_revision(self) -> None:
        current = catalog_state()
        current["storefrontConfiguration"] = storefront_configuration(current)
        package = ecommerce_merchandising_import_package()
        validation = validate_client_import_staging_package(package)
        command_id = "00000000-0000-4000-8000-000000000031"
        payload = {
            "commandId": command_id,
            "package": package,
            "evidence": {
                "actionId": f"ACT-IMPORT-{command_id}",
                "capturedAt": "2026-07-23T09:05:00.000Z",
                "actor": "Accountable operator",
                "reason": "Apply the reviewed Ecommerce merchandising import.",
                "evidenceReference": validation.package_digest,
            },
        }

        accepted = reduce_trial_state(
            "commerce",
            "commerce.storefront.merchandising.imported",
            current,
            payload,
        )
        configuration = accepted["storefrontConfiguration"]
        self.assertEqual(configuration["revision"], 2)
        self.assertEqual(configuration["shopCatalogSnapshotRevision"], 1)
        self.assertEqual(configuration["selectedSkus"], ["SKU-1"])
        self.assertEqual(
            configuration["merchandising"],
            [
                {
                    "sku": "SKU-1",
                    "featured": True,
                    "collection": "Best sellers",
                    "displayName": "Customer display name",
                    "note": "Lead with approved proof.",
                }
            ],
        )
        self.assertEqual(configuration["storeName"], "Mingalar Shop")
        self.assertEqual(configuration["summary"], "Clear prices and a small customer-ready catalog.")
        self.assertEqual(configuration["saved"]["capturedAt"], "2026-07-23T09:05:00.000Z")
        self.assertEqual(configuration["saved"]["actor"], "Accountable operator")
        for field in ("items", "orders", "movements", "closes"):
            self.assertEqual(accepted[field], current[field])
        self.assertNotEqual(
            commerce_storefront_preview_digest(accepted),
            commerce_storefront_preview_digest(current),
        )

        unchanged_command_id = "00000000-0000-4000-8000-000000000032"
        with self.assertRaises(TrialValidationError):
            reduce_trial_state(
                "commerce",
                "commerce.storefront.merchandising.imported",
                accepted,
                {
                    **payload,
                    "commandId": unchanged_command_id,
                    "evidence": {
                        **payload["evidence"],
                        "actionId": f"ACT-IMPORT-{unchanged_command_id}",
                    },
                },
            )
        unknown_package = ecommerce_merchandising_import_package(sku="UNKNOWN")
        unknown_validation = validate_client_import_staging_package(unknown_package)
        with self.assertRaises(TrialValidationError):
            reduce_trial_state(
                "commerce",
                "commerce.storefront.merchandising.imported",
                current,
                {
                    **payload,
                    "package": unknown_package,
                    "evidence": {
                        **payload["evidence"],
                        "evidenceReference": unknown_validation.package_digest,
                    },
                },
            )
        with self.assertRaises(TrialValidationError):
            reduce_trial_state(
                "commerce",
                "commerce.storefront.merchandising.imported",
                catalog_state(),
                payload,
            )

    def test_legacy_storefront_request_without_provenance_remains_readable(self) -> None:
        legacy_request = storefront_request()
        legacy_request.pop("sourceStorefrontRevision")
        legacy_request.pop("sourceStorefrontActionId")
        current = catalog_state()
        current["storefrontRequests"] = [legacy_request]

        self.assertEqual(
            validate_commerce_state(current)["storefrontRequests"],
            [legacy_request],
        )
        partial = deepcopy(current)
        partial["storefrontRequests"][0]["sourceStorefrontRevision"] = None  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(partial)

        next_state = deepcopy(current)
        next_state["items"][0]["onHand"] = 11  # type: ignore[index]
        next_state["movements"] = [
            movement("receipt", "ACT-LEGACY-RECEIPT", 1),
        ]
        accepted = apply_event(
            current,
            "commerce.stock.received",
            next_state,
            action_evidence("ACT-LEGACY-RECEIPT"),
        )
        self.assertEqual(accepted["storefrontRequests"], [legacy_request])

    def test_storefront_configuration_is_revisioned_without_shop_side_effects(self) -> None:
        current = catalog_state()
        first_state = deepcopy(current)
        first_state["storefrontConfiguration"] = storefront_configuration(current)
        first = apply_event(
            current,
            "commerce.storefront.configuration.saved",
            first_state,
        )
        self.assertEqual(first["storefrontConfiguration"], first_state["storefrontConfiguration"])
        for field in ("items", "orders", "movements", "closes"):
            self.assertEqual(first[field], current[field])
        self.assertEqual(first.get("websiteIntakes", []), [])
        self.assertEqual(first.get("storefrontRequests", []), [])

        explicit_null = deepcopy(current)
        explicit_null["storefrontConfiguration"] = None
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(explicit_null)
        null_receipt = deepcopy(current)
        null_receipt["items"][0]["onHand"] = 11  # type: ignore[index]
        null_receipt["movements"] = [movement("receipt", "ACT-NULL-CONFIG", 1)]
        null_receipt["storefrontConfiguration"] = None
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.stock.received",
                null_receipt,
                action_evidence("ACT-NULL-CONFIG"),
            )

        for label, invalid_configuration in (
            ("unknown SKU", storefront_configuration(current, selected_skus=["UNKNOWN"])),
            ("wrong digest", storefront_configuration(current, digest="sha256:" + "a" * 64)),
        ):
            invalid = deepcopy(current)
            invalid["storefrontConfiguration"] = invalid_configuration
            with self.subTest(label=label), self.assertRaises(TrialValidationError):
                apply_event(
                    current,
                    "commerce.storefront.configuration.saved",
                    invalid,
                )

        two_item_current = deepcopy(current)
        two_item_current["items"] = [
            *two_item_current["items"],  # type: ignore[misc]
            {"sku": "SKU-2", "name": "Second", "onHand": 2, "reorderAt": 1, "price": 50},
        ]
        unsorted = deepcopy(two_item_current)
        unsorted["storefrontConfiguration"] = storefront_configuration(
            two_item_current,
            selected_skus=["SKU-2", "SKU-1"],
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                two_item_current,
                "commerce.storefront.configuration.saved",
                unsorted,
            )

        changed_configuration = deepcopy(first)
        changed_configuration["storefrontConfiguration"]["storeName"] = "Changed outside event"  # type: ignore[index]
        receipt_state = deepcopy(first)
        receipt_state["storefrontRequests"] = [storefront_request()]
        receipt_state["storefrontConfiguration"] = changed_configuration["storefrontConfiguration"]
        with self.assertRaises(TrialValidationError):
            apply_event(
                first,
                "commerce.storefront_request.received",
                receipt_state,
            )

        stock_changed = deepcopy(first)
        stock_changed["items"][0]["onHand"] = 11  # type: ignore[index]
        stock_changed["movements"] = [movement("receipt", "ACT-STOCK-CONFIG", 1)]
        stock_changed = apply_event(
            first,
            "commerce.stock.received",
            stock_changed,
            action_evidence("ACT-STOCK-CONFIG"),
        )
        second_state = deepcopy(stock_changed)
        second_state["storefrontConfiguration"] = storefront_configuration(
            stock_changed,
            revision=2,
            catalog_revision=1,
            summary="Updated copy after a stock-only change.",
        )
        second = apply_event(
            stock_changed,
            "commerce.storefront.configuration.saved",
            second_state,
        )
        self.assertEqual(
            second["storefrontConfiguration"]["shopCatalogSnapshotRevision"],  # type: ignore[index]
            1,
        )

        reused_action = deepcopy(second)
        reused_action["storefrontConfiguration"] = storefront_configuration(
            second,
            revision=3,
            catalog_revision=1,
            summary="Attempted proof identity reuse.",
        )
        reused_action["storefrontConfiguration"]["saved"]["actionId"] = first["storefrontConfiguration"]["saved"]["actionId"]  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(
                second,
                "commerce.storefront.configuration.saved",
                reused_action,
            )

        catalog_changed = deepcopy(second)
        catalog_changed["items"] = [
            {"sku": "SKU-2", "name": "Second", "onHand": 2, "reorderAt": 1, "price": 50},
            *catalog_changed["items"],  # type: ignore[misc]
        ]
        catalog_changed["movements"] = [
            movement("opening", "ACT-ITEM-CONFIG", 2, sku="SKU-2"),
            *catalog_changed["movements"],  # type: ignore[misc]
        ]
        catalog_changed["catalogBaselines"] = [
            catalog_baseline(
                catalog_changed["items"][0],  # type: ignore[index,arg-type]
                action_evidence("ACT-ITEM-CONFIG"),
            ),
            *catalog_changed.get("catalogBaselines", []),  # type: ignore[misc]
        ]
        catalog_changed = apply_event(
            second,
            "commerce.item.created",
            catalog_changed,
            action_evidence("ACT-ITEM-CONFIG"),
        )
        third_state = deepcopy(catalog_changed)
        third_state["storefrontConfiguration"] = storefront_configuration(
            catalog_changed,
            revision=3,
            catalog_revision=2,
            selected_skus=["SKU-1", "SKU-2"],
        )
        third = apply_event(
            catalog_changed,
            "commerce.storefront.configuration.saved",
            third_state,
        )
        self.assertEqual(
            third["storefrontConfiguration"]["shopCatalogSnapshotRevision"],  # type: ignore[index]
            2,
        )

    def test_storefront_configuration_store_is_human_revisioned_and_tenant_scoped(self) -> None:
        store = InMemoryTrialStore(reducer=reduce_trial_state)
        operator = TrialPrincipal("workspace-storefront", "operator-a", "human")
        other = TrialPrincipal("workspace-other", "operator-b", "human")
        agent = TrialPrincipal("workspace-storefront", "storefront-agent", "agent")
        for principal in (operator, other, agent):
            store.provision_membership(
                workspace_id=principal.workspace_id,
                actor_id=principal.actor_id,
                actor_kind=principal.actor_kind,
                capabilities=("commerce.write",),
            )
        initialized = store.apply_command(
            operator,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.workspace.initialized",
            expected_version=0,
            payload={"state": catalog_state(), "evidence": action_evidence("ACT-INIT-STOREFRONT")},
        )
        other_initialized = store.apply_command(
            other,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.workspace.initialized",
            expected_version=0,
            payload={"state": catalog_state(), "evidence": action_evidence("ACT-INIT-OTHER", actor=other.actor_id)},
        )
        next_state = deepcopy(initialized.state)
        next_state["storefrontConfiguration"] = storefront_configuration(
            initialized.state,
            actor="forged-actor",
            captured_at="2099-01-01T00:00:00.000Z",
        )
        payload = {
            "state": next_state,
            "evidence": dict(next_state["storefrontConfiguration"]["saved"]),  # type: ignore[index,arg-type]
        }
        command_id = STOREFRONT_CONFIGURATION_UUID
        saved = store.apply_command(
            operator,
            command_id=command_id,
            surface="commerce",
            event_type="commerce.storefront.configuration.saved",
            expected_version=initialized.version,
            payload=payload,
        )
        replay = store.apply_command(
            operator,
            command_id=command_id,
            surface="commerce",
            event_type="commerce.storefront.configuration.saved",
            expected_version=initialized.version,
            payload=payload,
        )
        configuration = saved.state["storefrontConfiguration"]
        self.assertEqual(saved.version, initialized.version + 1)
        self.assertTrue(replay.idempotent_replay)
        self.assertEqual(replay.state, saved.state)
        self.assertEqual(configuration["saved"]["actor"], operator.actor_id)  # type: ignore[index]
        self.assertNotEqual(configuration["saved"]["capturedAt"], "2099-01-01T00:00:00.000Z")  # type: ignore[index]
        self.assertEqual(store.get_state(operator, "commerce").updated_by, operator.actor_id)
        self.assertEqual(store.get_state(other, "commerce").version, other_initialized.version)
        self.assertNotIn("storefrontConfiguration", store.get_state(other, "commerce").state)

        with self.assertRaises(TrialIdempotencyConflict):
            conflicting = deepcopy(payload)
            conflicting["state"]["storefrontConfiguration"]["summary"] = "Conflicting replay."  # type: ignore[index]
            store.apply_command(
                operator,
                command_id=command_id,
                surface="commerce",
                event_type="commerce.storefront.configuration.saved",
                expected_version=initialized.version,
                payload=conflicting,
            )
        with self.assertRaises(TrialVersionConflict):
            store.apply_command(
                operator,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.storefront.configuration.saved",
                expected_version=initialized.version,
                payload=payload,
            )
        with self.assertRaises(TrialHumanApprovalRequired):
            store.apply_command(
                agent,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.storefront.configuration.saved",
                expected_version=saved.version,
                payload=payload,
            )

    def test_storefront_request_store_replay_revision_tenant_and_recovery(self) -> None:
        store = InMemoryTrialStore(reducer=reduce_trial_state)
        operator = TrialPrincipal("workspace-a", "Accountable operator", "human")
        other = TrialPrincipal("workspace-b", "Other operator", "human")
        configured_states: dict[str, dict[str, object]] = {}
        for principal in (operator, other):
            store.provision_membership(
                workspace_id=principal.workspace_id,
                actor_id=principal.actor_id,
                actor_kind=principal.actor_kind,
                capabilities=("commerce.write",),
            )
            initialized = store.apply_command(
                principal,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.workspace.initialized",
                expected_version=0,
                payload={
                    "state": catalog_state(),
                    "evidence": action_evidence(actor=principal.actor_id),
                },
            )
            configured = deepcopy(initialized.state)
            configured["storefrontConfiguration"] = storefront_configuration(
                configured,
                actor=principal.actor_id,
            )
            saved = store.apply_command(
                principal,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.storefront.configuration.saved",
                expected_version=initialized.version,
                payload={
                    "state": configured,
                    "evidence": dict(configured["storefrontConfiguration"]["saved"]),  # type: ignore[index,arg-type]
                },
            )
            configured_states[principal.workspace_id] = dict(saved.state)

        operator_configuration = configured_states[operator.workspace_id][
            "storefrontConfiguration"
        ]
        request = storefront_request(
            created_at=operator_configuration["saved"]["capturedAt"],  # type: ignore[index]
            source_revision=operator_configuration["revision"],  # type: ignore[index]
            source_action_id=operator_configuration["saved"]["actionId"],  # type: ignore[index]
        )
        state = deepcopy(configured_states[operator.workspace_id])
        state["storefrontRequests"] = [request]
        command_id = STOREFRONT_REQUEST_UUID
        payload = {"state": state, "evidence": storefront_evidence(request)}
        first = store.apply_command(
            operator,
            command_id=command_id,
            surface="commerce",
            event_type="commerce.storefront_request.received",
            expected_version=2,
            payload=payload,
        )
        replay = store.apply_command(
            operator,
            command_id=command_id,
            surface="commerce",
            event_type="commerce.storefront_request.received",
            expected_version=2,
            payload=payload,
        )

        self.assertEqual(first.version, 3)
        self.assertTrue(replay.idempotent_replay)
        self.assertEqual(replay.state, first.state)
        self.assertEqual(store.get_state(operator, "commerce").state, first.state)
        self.assertNotIn("storefrontRequests", store.get_state(other, "commerce").state)

        conflicting_payload = deepcopy(payload)
        conflicting_payload["state"]["storefrontRequests"][0]["customerReference"] = "Conflict"  # type: ignore[index]
        with self.assertRaises(TrialIdempotencyConflict):
            store.apply_command(
                operator,
                command_id=command_id,
                surface="commerce",
                event_type="commerce.storefront_request.received",
                expected_version=2,
                payload=conflicting_payload,
            )
        with self.assertRaises(TrialVersionConflict):
            store.apply_command(
                operator,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.storefront_request.received",
                expected_version=2,
                payload=payload,
            )
        recovered = store.get_state(
            TrialPrincipal("workspace-a", "Accountable operator", "human"),
            "commerce",
        )
        self.assertEqual(recovered.version, 3)
        self.assertEqual(recovered.state["storefrontRequests"], [request])

        self.assertEqual(
            COMMERCE_HUMAN_EVENTS,
            frozenset(
                {
                    "commerce.workspace.initialized",
                    "commerce.item.created",
                    "commerce.item.updated",
                    "commerce.order.created",
                    "commerce.order.advanced",
                    "commerce.order.cancelled",
                    "commerce.order.return_recorded",
                    "commerce.order.correction_recorded",
                    "commerce.payment.reconciled",
                    "commerce.refund.settled",
                    "commerce.stock.received",
                    "commerce.stock.counted",
                    "commerce.production_material.issued",
                    "commerce.inventory.initialized",
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
                    "commerce.service_schedule.saved",
                }
            ),
        )
        self.assertIn("commerce.item.updated", COMMERCE_EVENTS)
        self.assertIn("commerce.storefront.merchandising.imported", COMMERCE_EVENTS)
        self.assertIn("commerce.tax_configuration.saved", COMMERCE_EVENTS)
        self.assertIn("commerce.account_mapping.saved", COMMERCE_EVENTS)
        self.assertIn("commerce.service_schedule.saved", COMMERCE_EVENTS)

    def test_website_intake_creation_records_no_order_or_stock_movement(self) -> None:
        current = catalog_state()
        created = apply_event(
            current,
            "commerce.website_intake.created",
            pending_intake_state(),
        )

        self.assertEqual(created["websiteIntakes"][0]["status"], "pending_confirmation")  # type: ignore[index]
        for collection in ("items", "orders", "movements", "closes"):
            self.assertEqual(created[collection], current[collection])
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.website_intake.created",
                pending_intake_state(),
                action_evidence("ACT-SPOOFED-CREATION"),
            )

    def test_website_intake_snapshot_binding_rejects_rewrite_and_blocks_legacy_conversion(self) -> None:
        bound = pending_intake_state()
        self.assertEqual(
            bound["websiteIntakes"][0]["snapshotDigest"],  # type: ignore[index]
            "sha256:9d7d7ecf238017ca75f06dbfb6cbdf237578dbba3f07b3612e877808ee53b223",
        )

        rewritten = deepcopy(bound)
        rewritten["websiteIntakes"][0]["unitPrice"] = 125  # type: ignore[index]
        rewritten["websiteIntakes"][0]["total"] = 250  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(rewritten)

        legacy = catalog_state()
        legacy["websiteIntakes"] = [website_intake(bound=False)]
        self.assertEqual(
            validate_commerce_state(legacy)["websiteIntakes"][0]["unitPrice"],  # type: ignore[index]
            100,
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                catalog_state(),
                "commerce.website_intake.created",
                legacy,
            )
        with self.assertRaises(TrialValidationError):
            apply_event(
                legacy,
                "commerce.website_intake.converted",
                converted_intake_state(legacy),
            )

        store = InMemoryTrialStore(reducer=reduce_trial_state)
        operator = TrialPrincipal(
            "workspace-intake-binding",
            "Accountable operator",
            "human",
        )
        store.provision_membership(
            workspace_id=operator.workspace_id,
            actor_id=operator.actor_id,
            actor_kind=operator.actor_kind,
            capabilities=("commerce.write",),
        )
        initialized = store.apply_command(
            operator,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.workspace.initialized",
            expected_version=0,
            payload={
                "state": catalog_state(),
                "evidence": action_evidence("ACT-INTAKE-BINDING-INITIALIZE"),
            },
        )
        unbound_next = deepcopy(initialized.state)
        unbound_next["websiteIntakes"] = [website_intake(bound=False)]
        created = store.apply_command(
            operator,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.website_intake.created",
            expected_version=initialized.version,
            payload={
                "state": unbound_next,
                "evidence": action_evidence("ACT-WEB-INTAKE"),
            },
        )
        self.assertEqual(
            created.state["websiteIntakes"][0]["snapshotDigest"],  # type: ignore[index]
            commerce_website_intake_snapshot_digest(
                created.state["websiteIntakes"][0]  # type: ignore[index,arg-type]
            ),
        )

    def test_website_intake_conversion_creates_one_attributable_order_and_reservation(self) -> None:
        current = apply_event(
            catalog_state(),
            "commerce.website_intake.created",
            pending_intake_state(),
        )
        converted = apply_event(
            current,
            "commerce.website_intake.converted",
            converted_intake_state(current),
        )

        intake = converted["websiteIntakes"][0]  # type: ignore[index]
        order = converted["orders"][0]  # type: ignore[index]
        stock_movement = converted["movements"][0]  # type: ignore[index]
        self.assertEqual(intake["status"], "converted")
        self.assertEqual(intake["conversion"]["orderId"], order["id"])  # type: ignore[index]
        self.assertEqual(order["sourceRecordId"], intake["id"])  # type: ignore[index]
        self.assertEqual(order["owner"], intake["conversion"]["actor"])  # type: ignore[index]
        self.assertEqual(converted["items"][0]["onHand"], 8)  # type: ignore[index]
        self.assertEqual(stock_movement["kind"], "reserve")
        self.assertEqual(stock_movement["actionId"], intake["conversion"]["actionId"])  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.website_intake.converted",
                converted_intake_state(current),
                action_evidence("ACT-SPOOFED-CONVERSION", captured_at=CONVERTED_AT),
            )

        store = InMemoryTrialStore(reducer=reduce_trial_state)
        managed_owner = TrialPrincipal(
            "workspace-intake-owner",
            "managed-shop-owner",
            "human",
        )
        store.provision_membership(
            workspace_id=managed_owner.workspace_id,
            actor_id=managed_owner.actor_id,
            actor_kind=managed_owner.actor_kind,
            capabilities=("commerce.write",),
        )
        initialized = store.apply_command(
            managed_owner,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.workspace.initialized",
            expected_version=0,
            payload={
                "state": catalog_state(),
                "evidence": action_evidence("ACT-MANAGED-INTAKE-INITIALIZE"),
            },
        )
        intake_created = store.apply_command(
            managed_owner,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.website_intake.created",
            expected_version=initialized.version,
            payload={
                "state": pending_intake_state(),
                "evidence": action_evidence("ACT-WEB-INTAKE"),
            },
        )
        managed_conversion = converted_intake_state(intake_created.state)
        managed_conversion["orders"][0]["owner"] = "Fabricated intake owner"  # type: ignore[index]
        managed_conversion["orders"][0]["promisedAt"] = "2099-01-02T00:00:00.000Z"  # type: ignore[index]
        converted_managed = store.apply_command(
            managed_owner,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.website_intake.converted",
            expected_version=intake_created.version,
            payload={
                "state": managed_conversion,
                "evidence": action_evidence(
                    "ACT-WEB-CONVERT",
                    captured_at=CONVERTED_AT,
                    actor="Fabricated intake owner",
                ),
            },
        )
        converted_order = converted_managed.state["orders"][0]  # type: ignore[index]
        converted_intake = converted_managed.state["websiteIntakes"][0]  # type: ignore[index]
        converted_movement = converted_managed.state["movements"][0]  # type: ignore[index]
        self.assertEqual(converted_order["owner"], managed_owner.actor_id)
        self.assertEqual(converted_intake["conversion"]["actor"], managed_owner.actor_id)  # type: ignore[index]
        self.assertEqual(converted_movement["actor"], managed_owner.actor_id)
        self.assertEqual(converted_order["createdAt"], converted_movement["createdAt"])
        self.assertEqual(converted_order["createdAt"], converted_intake["conversion"]["capturedAt"])  # type: ignore[index]

    def test_historical_website_intake_survives_catalog_update_but_stale_conversion_fails(self) -> None:
        pending = apply_event(
            catalog_state(),
            "commerce.website_intake.created",
            pending_intake_state(),
        )
        updated = apply_event(
            pending,
            "commerce.item.updated",
            catalog_update_state(pending, next_price=125, next_reorder_at=4),
        )

        self.assertEqual(
            validate_commerce_state(updated)["websiteIntakes"][0]["unitPrice"],  # type: ignore[index]
            100,
        )
        self.assertEqual(updated["items"][0]["price"], 125)  # type: ignore[index]
        renamed_snapshot = deepcopy(updated)
        renamed_snapshot["websiteIntakes"][0]["itemName"] = "Rewritten item"  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(renamed_snapshot)
        stale_conversion = converted_intake_state(updated)
        self.assertEqual(
            validate_commerce_state(stale_conversion)["websiteIntakes"][0]["unitPrice"],  # type: ignore[index]
            100,
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                updated,
                "commerce.website_intake.converted",
                stale_conversion,
            )

        updated_without_intake = apply_event(
            catalog_state(),
            "commerce.item.updated",
            catalog_update_state(catalog_state(), next_price=125),
        )
        stale_creation = deepcopy(updated_without_intake)
        stale_creation["websiteIntakes"] = [website_intake()]
        self.assertEqual(
            validate_commerce_state(stale_creation)["websiteIntakes"][0]["unitPrice"],  # type: ignore[index]
            100,
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                updated_without_intake,
                "commerce.website_intake.created",
                stale_creation,
            )

    def test_intake_events_reject_spoofed_collection_and_record_diffs(self) -> None:
        spoofed_creation = pending_intake_state()
        spoofed_creation["items"][0]["onHand"] = 9  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(
                catalog_state(),
                "commerce.website_intake.created",
                spoofed_creation,
            )

        current = apply_event(
            catalog_state(),
            "commerce.website_intake.created",
            pending_intake_state(),
        )
        spoofed_conversion = converted_intake_state(current)
        spoofed_conversion["websiteIntakes"][0]["source"]["siteName"] = "Spoofed site"  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.website_intake.converted",
                spoofed_conversion,
            )

        dropped_intakes = deepcopy(current)
        dropped_intakes.pop("websiteIntakes")
        dropped_intakes["items"][0]["onHand"] = 15  # type: ignore[index]
        dropped_intakes["movements"] = [movement("receipt", "ACT-RECEIVE-WITH-INTAKE", 5)]
        with self.assertRaises(TrialValidationError):
            apply_event(current, "commerce.stock.received", dropped_intakes)

    def test_intake_source_and_logical_action_ids_must_be_unique(self) -> None:
        current = pending_intake_state()

        duplicate_source = deepcopy(current)
        duplicate_source["websiteIntakes"] = [  # type: ignore[index]
            website_intake(
                intake_id="WINT-87654321",
                action_id="ACT-WEB-INTAKE-2",
            ),
            *current["websiteIntakes"],  # type: ignore[misc]
        ]
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.website_intake.created",
                duplicate_source,
            )

        duplicate_action = deepcopy(current)
        duplicate_action["websiteIntakes"] = [  # type: ignore[index]
            website_intake(
                intake_id="WINT-87654321",
                action_id="ACT-WEB-INTAKE",
                source=website_source(page_id="page-product", page_path="/product"),
            ),
            *current["websiteIntakes"],  # type: ignore[misc]
        ]
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.website_intake.created",
                duplicate_action,
            )

        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.website_intake.converted",
                converted_intake_state(
                    current,
                    conversion_action_id="ACT-WEB-INTAKE",
                ),
                action_evidence("ACT-WEB-INTAKE", captured_at=CONVERTED_AT),
            )

    def test_converted_intake_order_and_reservation_invariants_fail_closed(self) -> None:
        current = pending_intake_state()
        evidence = action_evidence("ACT-WEB-CONVERT", captured_at=CONVERTED_AT)
        invalid_states: list[tuple[str, dict[str, object]]] = []

        missing_conversion = converted_intake_state(current)
        missing_conversion["websiteIntakes"][0].pop("conversion")  # type: ignore[index]
        invalid_states.append(("missing conversion proof", missing_conversion))

        pending_with_order = converted_intake_state(current)
        pending_with_order["websiteIntakes"][0]["status"] = "pending_confirmation"  # type: ignore[index]
        pending_with_order["websiteIntakes"][0].pop("conversion")  # type: ignore[index]
        invalid_states.append(("pending intake with matching order", pending_with_order))

        wrong_order_time = converted_intake_state(current)
        wrong_order_time["orders"][0]["createdAt"] = NOW  # type: ignore[index]
        invalid_states.append(("order timestamp mismatch", wrong_order_time))

        wrong_order_evidence = converted_intake_state(current)
        wrong_order_evidence["orders"][0]["evidenceReference"] = "EV-SPOOFED"  # type: ignore[index]
        invalid_states.append(("order evidence mismatch", wrong_order_evidence))

        wrong_order_owner = converted_intake_state(current)
        wrong_order_owner["orders"][0]["owner"] = "Different operator"  # type: ignore[index]
        invalid_states.append(("order owner mismatch", wrong_order_owner))

        missing_reservation = converted_intake_state(current)
        missing_reservation["movements"] = []
        invalid_states.append(("missing reserve movement", missing_reservation))

        unchanged_stock = converted_intake_state(current)
        unchanged_stock["items"][0]["onHand"] = 10  # type: ignore[index]
        invalid_states.append(("missing stock decrement", unchanged_stock))

        for label, invalid_state in invalid_states:
            with self.subTest(label=label), self.assertRaises(TrialValidationError):
                apply_event(
                    current,
                    "commerce.website_intake.converted",
                    invalid_state,
                    evidence,
                )

    def test_item_creation_records_an_exact_attributed_opening_balance(self) -> None:
        current = catalog_state()
        new_item = {"sku": "SKU-2", "name": "Second item", "onHand": 0, "reorderAt": 3, "price": 250}
        created = deepcopy(current)
        created["items"] = [new_item, *current["items"]]  # type: ignore[misc]
        created["movements"] = [movement("opening", "ACT-ITEM", 0, sku="SKU-2")]
        created["catalogBaselines"] = [
            catalog_baseline(new_item, action_evidence("ACT-ITEM"))
        ]
        accepted = apply_event(current, "commerce.item.created", created)
        self.assertEqual(accepted["items"][0], new_item)  # type: ignore[index]
        self.assertEqual(accepted["movements"][0]["kind"], "opening")  # type: ignore[index]

        wrong_balance = deepcopy(created)
        wrong_balance["movements"][0]["quantityDelta"] = 1  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(current, "commerce.item.created", wrong_balance)

        changed_existing = deepcopy(created)
        changed_existing["items"][1]["name"] = "Rewritten item"  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(current, "commerce.item.created", changed_existing)

        pending = pending_intake_state()
        converted = converted_intake_state(pending)
        for label, state_with_intake in (("pending", pending), ("converted", converted)):
            with self.subTest(existing_intake=label):
                item = {
                    "sku": f"SKU-{label.upper()}",
                    "name": f"{label.title()} intake item",
                    "onHand": 7,
                    "reorderAt": 2,
                    "price": 300,
                }
                next_state = deepcopy(state_with_intake)
                next_state["items"] = [item, *state_with_intake["items"]]  # type: ignore[misc]
                next_state["movements"] = [
                    movement("opening", f"ACT-ITEM-{label.upper()}", 7, sku=str(item["sku"])),
                    *state_with_intake["movements"],  # type: ignore[misc]
                ]
                next_state["catalogBaselines"] = [
                    catalog_baseline(
                        item,
                        action_evidence(f"ACT-ITEM-{label.upper()}"),
                    ),
                    *state_with_intake.get("catalogBaselines", []),  # type: ignore[misc]
                ]
                accepted_with_intake = apply_event(state_with_intake, "commerce.item.created", next_state)
                self.assertEqual(accepted_with_intake["items"][0], item)  # type: ignore[index]
                self.assertEqual(accepted_with_intake["movements"][0]["quantityDelta"], 7)  # type: ignore[index]
                self.assertEqual(accepted_with_intake["websiteIntakes"], state_with_intake["websiteIntakes"])

    def test_order_create_and_stock_receipt_allow_only_the_declared_diff(self) -> None:
        current = catalog_state()
        created = apply_event(current, "commerce.order.created", created_state())
        self.assertEqual(created["items"][0]["onHand"], 8)  # type: ignore[index]

        legacy_without_promise = created_state()
        legacy_without_promise["orders"][0].pop("promisedAt")  # type: ignore[index]
        self.assertEqual(
            validate_commerce_state(legacy_without_promise),
            legacy_without_promise,
        )
        legacy_without_owner = created_state()
        legacy_without_owner["orders"][0].pop("owner")  # type: ignore[index]
        self.assertEqual(
            validate_commerce_state(legacy_without_owner),
            legacy_without_owner,
        )
        rewritten_owner = created_state()
        rewritten_owner["orders"][0]["owner"] = "Different operator"  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(rewritten_owner)
        for invalid_owner in (" Accountable operator", "x" * 121):
            malformed_owner = created_state()
            malformed_owner["orders"][0]["owner"] = invalid_owner  # type: ignore[index]
            with self.subTest(invalid_order_owner=invalid_owner), self.assertRaises(TrialValidationError):
                validate_commerce_state(malformed_owner)
        for promised_at in (
            "2026-07-23T11:00:00",
            NOW,
        ):
            invalid_promise = created_state()
            invalid_promise["orders"][0]["promisedAt"] = promised_at  # type: ignore[index]
            with self.subTest(invalid_promised_at=promised_at), self.assertRaises(TrialValidationError):
                validate_commerce_state(invalid_promise)

        for missing_field in ("owner", "fulfilment", "fulfilmentReference", "promisedAt"):
            without_handoff = created_state()
            without_handoff["orders"][0].pop(missing_field)  # type: ignore[index]
            with self.subTest(missing_order_handoff=missing_field), self.assertRaises(TrialValidationError):
                apply_event(current, "commerce.order.created", without_handoff)

        mismatched_owner_evidence = created_state()
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.order.created",
                mismatched_owner_evidence,
                action_evidence("ACT-ORD-1", actor="Different operator"),
            )

        stale_promise = created_state()
        stale_promise["orders"][0]["promisedAt"] = "2026-07-23T09:10:00.000Z"  # type: ignore[index]
        stale_promise["movements"][0]["createdAt"] = CONVERTED_AT  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.order.created",
                stale_promise,
                action_evidence(
                    "ACT-ORD-1",
                    captured_at=CONVERTED_AT,
                ),
            )

        arbitrary_stock = deepcopy(current)
        arbitrary_stock["items"][0]["onHand"] = 9  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(current, "commerce.order.created", arbitrary_stock, action_evidence())

        received = deepcopy(current)
        received["items"][0]["onHand"] = 15  # type: ignore[index]
        received["movements"] = [movement("receipt", "ACT-RECEIVE", 5)]
        accepted_receipt = apply_event(current, "commerce.stock.received", received)
        self.assertEqual(accepted_receipt["movements"][0]["kind"], "receipt")  # type: ignore[index]

        wrong_evidence = action_evidence("ACT-WRONG")
        with self.assertRaises(TrialValidationError):
            apply_event(current, "commerce.stock.received", received, wrong_evidence)

    def test_stock_count_sets_one_exact_available_balance_with_evidence(self) -> None:
        current = catalog_state()
        counted = deepcopy(current)
        counted["items"][0]["onHand"] = 7  # type: ignore[index]
        counted["movements"] = [
            movement(
                "count",
                "ACT-COUNT-LOW",
                -3,
                expected_quantity=10,
                counted_quantity=7,
            )
        ]
        accepted = apply_event(
            current,
            "commerce.stock.counted",
            counted,
            action_evidence("ACT-COUNT-LOW"),
        )
        self.assertEqual(accepted["items"][0]["onHand"], 7)  # type: ignore[index]
        self.assertEqual(accepted["movements"][0]["kind"], "count")  # type: ignore[index]
        self.assertEqual(accepted["movements"][0]["expectedQuantity"], 10)  # type: ignore[index]
        self.assertEqual(accepted["movements"][0]["countedQuantity"], 7)  # type: ignore[index]

        unchanged = deepcopy(accepted)
        unchanged["movements"] = [
            movement(
                "count",
                "ACT-COUNT-MATCH",
                0,
                created_at=CONVERTED_AT,
                expected_quantity=7,
                counted_quantity=7,
            ),
            *accepted["movements"],  # type: ignore[misc]
        ]
        matched = apply_event(
            accepted,
            "commerce.stock.counted",
            unchanged,
            action_evidence(
                "ACT-COUNT-MATCH",
                captured_at=CONVERTED_AT,
            ),
        )
        self.assertEqual(matched["items"][0]["onHand"], 7)  # type: ignore[index]
        self.assertEqual(matched["movements"][0]["quantityDelta"], 0)  # type: ignore[index]

        raised = deepcopy(matched)
        raised["items"][0]["onHand"] = 12  # type: ignore[index]
        raised["movements"] = [
            movement(
                "count",
                "ACT-COUNT-HIGH",
                5,
                created_at="2026-07-23T09:30:00.000Z",
                expected_quantity=7,
                counted_quantity=12,
            ),
            *matched["movements"],  # type: ignore[misc]
        ]
        accepted_raised = apply_event(
            matched,
            "commerce.stock.counted",
            raised,
            action_evidence(
                "ACT-COUNT-HIGH",
                captured_at="2026-07-23T09:30:00.000Z",
            ),
        )
        self.assertEqual(accepted_raised["items"][0]["onHand"], 12)  # type: ignore[index]

        for label, patch in (
            ("expected", {"expectedQuantity": 9}),
            ("counted", {"countedQuantity": 8}),
            ("variance", {"quantityDelta": -2}),
            ("order", {"orderId": "ORD-1"}),
            ("purchase", {"purchaseOrderId": PURCHASE_ORDER_ID}),
        ):
            invalid = deepcopy(counted)
            invalid["movements"][0].update(patch)  # type: ignore[index]
            with self.subTest(label=label), self.assertRaises(
                TrialValidationError
            ):
                apply_event(
                    current,
                    "commerce.stock.counted",
                    invalid,
                    action_evidence("ACT-COUNT-LOW"),
                )

        unrelated = deepcopy(counted)
        unrelated["items"][0]["price"] = 101  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.stock.counted",
                unrelated,
                action_evidence("ACT-COUNT-LOW"),
            )

        forged_history = deepcopy(accepted_raised)
        forged_history["movements"][1]["countedQuantity"] = 8  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(forged_history)

        unicode_time = deepcopy(counted)
        unicode_time["movements"][0]["createdAt"] = "٢٠٢٦-07-23T09:00:00.000Z"  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(unicode_time)

    def test_stock_count_uses_available_balance_and_preserves_open_work(self) -> None:
        current = created_state()
        current["purchaseOrders"] = [purchase_order_record()]
        current["items"][0]["onHand"] = 12  # type: ignore[index]
        current["movements"] = [
            movement(
                "receipt",
                "ACT-PURCHASE-RECEIVE-1",
                4,
                created_at="2026-07-23T09:10:00.000Z",
                purchase_order_id=PURCHASE_ORDER_ID,
            ),
            *current["movements"],  # type: ignore[misc]
        ]
        validate_commerce_state(current)

        counted = deepcopy(current)
        counted["items"][0]["onHand"] = 11  # type: ignore[index]
        counted["movements"] = [
            movement(
                "count",
                "ACT-COUNT-AVAILABLE",
                -1,
                created_at=CONVERTED_AT,
                expected_quantity=12,
                counted_quantity=11,
            ),
            *current["movements"],  # type: ignore[misc]
        ]
        accepted = apply_event(
            current,
            "commerce.stock.counted",
            counted,
            action_evidence(
                "ACT-COUNT-AVAILABLE",
                captured_at=CONVERTED_AT,
            ),
        )
        self.assertEqual(accepted["items"][0]["onHand"], 11)  # type: ignore[index]
        self.assertEqual(accepted["orders"], current["orders"])
        self.assertEqual(accepted["purchaseOrders"], current["purchaseOrders"])
        self.assertEqual(accepted["movements"][1:], current["movements"])  # type: ignore[index]
        forged_purchase_order = deepcopy(counted)
        forged_purchase_order["purchaseOrders"][0]["supplier"] = "Forged supplier"  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.stock.counted",
                forged_purchase_order,
                action_evidence(
                    "ACT-COUNT-AVAILABLE",
                    captured_at=CONVERTED_AT,
                ),
            )

        legacy = catalog_state()
        legacy["movements"] = [
            movement("receipt", f"ACT-LEGACY-{index}", 1)
            for index in range(20)
        ]
        validate_commerce_state(legacy)
        anchored = deepcopy(legacy)
        anchored["movements"] = [
            movement(
                "count",
                "ACT-LEGACY-COUNT",
                0,
                expected_quantity=10,
                counted_quantity=10,
            ),
            *legacy["movements"],  # type: ignore[misc]
        ]
        accepted_anchor = apply_event(
            legacy,
            "commerce.stock.counted",
            anchored,
            action_evidence("ACT-LEGACY-COUNT"),
        )
        self.assertEqual(len(accepted_anchor["movements"]), 21)  # type: ignore[arg-type]

    def test_store_stock_count_binds_human_replay_and_tenant_boundary(self) -> None:
        store = InMemoryTrialStore(reducer=reduce_trial_state)
        operator = TrialPrincipal("workspace-count", "operator-count", "human")
        other = TrialPrincipal("workspace-other", "operator-other", "human")
        agent = TrialPrincipal("workspace-count", "count-agent", "agent")
        for principal in (operator, other, agent):
            store.provision_membership(
                workspace_id=principal.workspace_id,
                actor_id=principal.actor_id,
                actor_kind=principal.actor_kind,
                capabilities=("commerce.write",),
            )
        initialized = store.apply_command(
            operator,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.workspace.initialized",
            expected_version=0,
            payload={
                "state": catalog_state(),
                "evidence": action_evidence(actor=operator.actor_id),
            },
        )
        other_initialized = store.apply_command(
            other,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.workspace.initialized",
            expected_version=0,
            payload={
                "state": catalog_state(),
                "evidence": action_evidence(
                    "ACT-OTHER-INITIALIZE",
                    actor=other.actor_id,
                ),
            },
        )
        action_id = "ACT-STORE-COUNT"
        spoofed_at = "2099-01-01T00:00:00.000Z"
        counted = deepcopy(initialized.state)
        counted["items"][0]["onHand"] = 7  # type: ignore[index]
        counted["movements"] = [
            movement(
                "count",
                action_id,
                -3,
                created_at=spoofed_at,
                expected_quantity=10,
                counted_quantity=7,
            )
        ]
        payload = {
            "state": counted,
            "evidence": action_evidence(
                action_id,
                captured_at=spoofed_at,
                actor="spoofed-operator",
            ),
        }
        command_id = str(uuid4())
        accepted = store.apply_command(
            operator,
            command_id=command_id,
            surface="commerce",
            event_type="commerce.stock.counted",
            expected_version=initialized.version,
            payload=payload,
        )
        replay = store.apply_command(
            operator,
            command_id=command_id,
            surface="commerce",
            event_type="commerce.stock.counted",
            expected_version=initialized.version,
            payload=payload,
        )
        recorded = accepted.state["movements"][0]  # type: ignore[index]
        self.assertEqual(recorded["actor"], operator.actor_id)
        self.assertNotEqual(recorded["createdAt"], spoofed_at)
        self.assertEqual(accepted.version, 2)
        self.assertTrue(replay.idempotent_replay)
        self.assertEqual(replay.state, accepted.state)

        conflicting = deepcopy(payload)
        conflicting["evidence"]["reason"] = "Changed reason."  # type: ignore[index]
        conflicting["state"]["movements"][0]["reason"] = "Changed reason."  # type: ignore[index]
        with self.assertRaises(TrialIdempotencyConflict):
            store.apply_command(
                operator,
                command_id=command_id,
                surface="commerce",
                event_type="commerce.stock.counted",
                expected_version=initialized.version,
                payload=conflicting,
            )
        with self.assertRaises(TrialVersionConflict):
            store.apply_command(
                operator,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.stock.counted",
                expected_version=initialized.version,
                payload=payload,
            )
        with self.assertRaises(TrialHumanApprovalRequired):
            store.apply_command(
                agent,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.stock.counted",
                expected_version=accepted.version,
                payload=payload,
            )
        with self.assertRaises(TrialValidationError):
            store.apply_command(
                operator,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.stock.counted",
                expected_version=accepted.version,
                payload=payload,
            )
        other_after = store.get_state(other, "commerce")
        self.assertEqual(other_after.version, other_initialized.version)
        self.assertEqual(other_after.state, other_initialized.state)

    def test_store_replaces_forged_order_calculation_and_binds_catalog_revision(self) -> None:
        store = InMemoryTrialStore(reducer=reduce_trial_state)
        operator = TrialPrincipal("workspace-pricing", "shop-pricing-owner", "human")
        store.provision_membership(
            workspace_id=operator.workspace_id,
            actor_id=operator.actor_id,
            actor_kind=operator.actor_kind,
            capabilities=("commerce.write",),
        )
        initialized = store.apply_command(
            operator,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.workspace.initialized",
            expected_version=0,
            payload={
                "state": catalog_state(),
                "evidence": action_evidence("ACT-PRICING-INITIALIZE"),
            },
        )
        repriced_state = catalog_update_state(
            initialized.state,
            next_price=125,
            action_id="ACT-PRICING-CATALOG",
            actor="Fabricated catalog client",
        )
        with patch("supermega_runtime.trial_store._utc_now", return_value=NOW):
            repriced = store.apply_command(
                operator,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.item.updated",
                expected_version=initialized.version,
                payload={
                    "state": repriced_state,
                    "evidence": dict(repriced_state["catalogChanges"][0]["proof"]),  # type: ignore[index,arg-type]
                },
            )

        action_id = "ACT-PRICING-ORDER"
        candidate = deepcopy(repriced.state)
        candidate["items"][0]["onHand"] = 8  # type: ignore[index]
        forged_order = order_record("ORD-PRICING")
        forged_order.update(
            {
                "createdAt": "2099-01-01T00:00:00.000Z",
                "owner": "Fabricated pricing bot",
                "total": 999,
                "calculation": {
                    "schema": "supermega.commerce.order-calculation.v1",
                    "currency": "MMK",
                    "catalogRevision": 999,
                    "subtotalMmk": 999,
                    "taxMode": "not_configured",
                    "taxMmk": 99,
                    "totalMmk": 1098,
                },
            }
        )
        candidate["orders"] = [forged_order]
        candidate["movements"] = [
            {
                **movement("reserve", action_id, -2, order_id="ORD-PRICING"),
                "actor": "Fabricated pricing bot",
                "createdAt": "2099-01-01T00:00:00.000Z",
            }
        ]
        payload = {
            "state": candidate,
            "evidence": action_evidence(
                action_id,
                captured_at="2099-01-01T00:00:00.000Z",
                actor="Fabricated pricing bot",
            ),
        }
        command_id = str(uuid4())
        with patch("supermega_runtime.trial_store._utc_now", return_value=NOW):
            accepted = store.apply_command(
                operator,
                command_id=command_id,
                surface="commerce",
                event_type="commerce.order.created",
                expected_version=repriced.version,
                payload=payload,
            )
            replay = store.apply_command(
                operator,
                command_id=command_id,
                surface="commerce",
                event_type="commerce.order.created",
                expected_version=repriced.version,
                payload=payload,
            )

        order = accepted.state["orders"][0]  # type: ignore[index]
        self.assertEqual(order["owner"], operator.actor_id)
        self.assertEqual(order["total"], 250)
        self.assertEqual(
            order["calculation"],
            {
                "schema": "supermega.commerce.order-calculation.v1",
                "currency": "MMK",
                "catalogRevision": 1,
                "subtotalMmk": 250,
                "taxMode": "not_configured",
                "taxMmk": 0,
                "totalMmk": 250,
            },
        )
        self.assertTrue(replay.idempotent_replay)
        self.assertEqual(replay.state, accepted.state)

        conflicting = deepcopy(payload)
        conflicting["state"]["orders"][0]["calculation"]["subtotalMmk"] = 998  # type: ignore[index]
        with self.assertRaises(TrialIdempotencyConflict):
            store.apply_command(
                operator,
                command_id=command_id,
                surface="commerce",
                event_type="commerce.order.created",
                expected_version=repriced.version,
                payload=conflicting,
            )

        missing = deepcopy(repriced.state)
        missing["items"][0]["onHand"] = 8  # type: ignore[index]
        missing_order = order_record("ORD-MISSING-CALCULATION")
        missing_order["total"] = 250
        missing["orders"] = [missing_order]
        missing["movements"] = [
            movement(
                "reserve",
                "ACT-MISSING-CALCULATION",
                -2,
                order_id="ORD-MISSING-CALCULATION",
            )
        ]
        with self.assertRaisesRegex(
            TrialValidationError,
            "current deterministic pricing calculation",
        ):
            reduce_trial_state(
                "commerce",
                "commerce.order.created",
                repriced.state,
                {
                    "state": missing,
                    "evidence": action_evidence("ACT-MISSING-CALCULATION"),
                },
            )

    def test_purchase_order_lifecycle_supports_partial_receipt_and_cancellation(self) -> None:
        current = catalog_state()
        purchase_order = purchase_order_record()
        created_state = deepcopy(current)
        created_state["purchaseOrders"] = [purchase_order]
        created = apply_event(
            current,
            "commerce.purchase_order.created",
            created_state,
        )
        self.assertEqual(created["purchaseOrders"], [purchase_order])
        self.assertEqual(created["items"], current["items"])

        partial_state = deepcopy(created)
        partial_state["items"][0]["onHand"] = 14  # type: ignore[index]
        partial_state["movements"] = [
            movement(
                "receipt",
                "ACT-PURCHASE-RECEIVE-1",
                4,
                created_at="2026-07-23T09:10:00.000Z",
                purchase_order_id=PURCHASE_ORDER_ID,
            )
        ]
        partial = apply_event(
            created,
            "commerce.purchase_order.received",
            partial_state,
        )
        self.assertEqual(partial["items"][0]["onHand"], 14)  # type: ignore[index]
        self.assertEqual(
            partial["movements"][0]["purchaseOrderId"],  # type: ignore[index]
            PURCHASE_ORDER_ID,
        )

        cancellation = action_evidence(
            "ACT-PURCHASE-CANCEL",
            captured_at="2026-07-23T09:20:00.000Z",
        )
        cancelled_state = deepcopy(partial)
        cancelled_state["purchaseOrders"][0]["cancellation"] = cancellation  # type: ignore[index]
        cancelled = apply_event(
            partial,
            "commerce.purchase_order.cancelled",
            cancelled_state,
        )
        self.assertEqual(
            cancelled["purchaseOrders"][0]["cancellation"],  # type: ignore[index]
            cancellation,
        )

        after_cancel = deepcopy(cancelled)
        after_cancel["items"][0]["onHand"] = 15  # type: ignore[index]
        after_cancel["movements"] = [
            movement(
                "receipt",
                "ACT-PURCHASE-RECEIVE-AFTER-CANCEL",
                1,
                created_at="2026-07-23T09:21:00.000Z",
                purchase_order_id=PURCHASE_ORDER_ID,
            ),
            *cancelled["movements"],  # type: ignore[misc]
        ]
        with self.assertRaises(TrialValidationError):
            apply_event(
                cancelled,
                "commerce.purchase_order.received",
                after_cancel,
            )

        legacy_receipt_bypass = deepcopy(cancelled)
        legacy_receipt_bypass["items"][0]["onHand"] = 15  # type: ignore[index]
        legacy_receipt_bypass["movements"] = [
            movement(
                "receipt",
                "ACT-LEGACY-RECEIPT-BYPASS",
                1,
                created_at=cancellation["capturedAt"],
                purchase_order_id=PURCHASE_ORDER_ID,
            ),
            *cancelled["movements"],  # type: ignore[misc]
        ]
        with self.assertRaises(TrialValidationError):
            apply_event(
                cancelled,
                "commerce.stock.received",
                legacy_receipt_bypass,
            )

        second_purchase_order = purchase_order_record(
            purchase_order_id="PO-00000000-0000-4000-8000-000000000021",
            action_id="ACT-PURCHASE-CREATE-2",
            quantity=5,
            captured_at="2026-07-23T09:21:00.000Z",
        )
        second_created_state = deepcopy(cancelled)
        second_created_state["purchaseOrders"] = [  # type: ignore[assignment]
            second_purchase_order,
            *cancelled["purchaseOrders"],  # type: ignore[misc]
        ]
        second_created = apply_event(
            cancelled,
            "commerce.purchase_order.created",
            second_created_state,
        )
        second_cancellation = action_evidence(
            "ACT-PURCHASE-CANCEL-2",
            captured_at="2026-07-23T09:22:00.000Z",
        )
        second_cancelled_state = deepcopy(second_created)
        second_cancelled_state["purchaseOrders"][0]["cancellation"] = second_cancellation  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(
                second_created,
                "commerce.purchase_order.cancelled",
                second_cancelled_state,
                cancellation,
            )

    def test_purchase_order_creation_requires_future_arrival_but_legacy_records_remain_readable(self) -> None:
        current = catalog_state()
        legacy_purchase_order = purchase_order_record()
        legacy_purchase_order.pop("expectedAt")
        legacy = deepcopy(current)
        legacy["purchaseOrders"] = [legacy_purchase_order]
        self.assertEqual(
            validate_commerce_state(legacy)["purchaseOrders"],
            [legacy_purchase_order],
        )
        with self.assertRaisesRegex(
            TrialValidationError,
            "requires an expected arrival",
        ):
            apply_event(
                current,
                "commerce.purchase_order.created",
                legacy,
            )

        for expected_at in (
            NOW,
            "2026-07-23T08:59:59.999Z",
            "2026-07-23T11:00:00",
            "not-a-time",
        ):
            invalid = deepcopy(current)
            invalid["purchaseOrders"] = [
                purchase_order_record(expected_at=expected_at)
            ]
            with self.subTest(expected_at=expected_at), self.assertRaises(
                TrialValidationError
            ):
                validate_commerce_state(invalid)

    def test_store_stamps_purchase_order_creation_and_rejects_expired_arrival(self) -> None:
        store = InMemoryTrialStore(reducer=reduce_trial_state)
        principal = TrialPrincipal("workspace-purchase", "shop-owner", "human")
        store.provision_membership(
            workspace_id=principal.workspace_id,
            actor_id=principal.actor_id,
            actor_kind=principal.actor_kind,
            capabilities=("commerce.write",),
        )
        initialized = store.apply_command(
            principal,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.workspace.initialized",
            expected_version=0,
            payload={
                "state": catalog_state(),
                "evidence": action_evidence("ACT-PURCHASE-INITIALIZE"),
            },
        )
        server_now = "2026-07-23T09:30:00.000+00:00"
        expired_state = deepcopy(initialized.state)
        expired_state["purchaseOrders"] = [
            purchase_order_record(
                action_id="ACT-PURCHASE-EXPIRED",
                expected_at="2026-07-23T09:15:00.000Z",
            )
        ]
        with patch(
            "supermega_runtime.trial_store._utc_now",
            return_value=server_now,
        ), self.assertRaises(TrialValidationError):
            store.apply_command(
                principal,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.purchase_order.created",
                expected_version=initialized.version,
                payload={
                    "state": expired_state,
                    "evidence": dict(
                        expired_state["purchaseOrders"][0]["creation"]  # type: ignore[index,arg-type]
                    ),
                },
            )
        self.assertEqual(
            store.get_state(principal, "commerce").version,
            initialized.version,
        )

        accepted_state = deepcopy(initialized.state)
        accepted_state["purchaseOrders"] = [
            purchase_order_record(
                action_id="ACT-PURCHASE-MANAGED",
                expected_at="2026-07-23T11:00:00.000Z",
            )
        ]
        accepted_state["purchaseOrders"][0]["creation"]["actor"] = (  # type: ignore[index]
            "Fabricated purchasing bot"
        )
        payload = {
            "state": accepted_state,
            "evidence": dict(
                accepted_state["purchaseOrders"][0]["creation"]  # type: ignore[index,arg-type]
            ),
        }
        command_id = str(uuid4())
        with patch(
            "supermega_runtime.trial_store._utc_now",
            return_value=server_now,
        ):
            accepted = store.apply_command(
                principal,
                command_id=command_id,
                surface="commerce",
                event_type="commerce.purchase_order.created",
                expected_version=initialized.version,
                payload=payload,
            )
            replay = store.apply_command(
                principal,
                command_id=command_id,
                surface="commerce",
                event_type="commerce.purchase_order.created",
                expected_version=initialized.version,
                payload=payload,
            )
        purchase_order = accepted.state["purchaseOrders"][0]  # type: ignore[index]
        self.assertEqual(purchase_order["createdAt"], server_now)
        self.assertEqual(purchase_order["creation"]["capturedAt"], server_now)  # type: ignore[index]
        self.assertEqual(purchase_order["creation"]["actor"], principal.actor_id)  # type: ignore[index]
        self.assertEqual(
            purchase_order["expectedAt"],
            "2026-07-23T11:00:00.000Z",
        )
        self.assertTrue(replay.idempotent_replay)
        self.assertEqual(replay.state, accepted.state)

    def test_store_stamps_purchase_receipt_actor_time_and_replay(self) -> None:
        store = InMemoryTrialStore(reducer=reduce_trial_state)
        operator = TrialPrincipal("workspace-receiving", "shop-receiver", "human")
        agent = TrialPrincipal("workspace-receiving", "receiving-agent", "agent")
        for principal in (operator, agent):
            store.provision_membership(
                workspace_id=principal.workspace_id,
                actor_id=principal.actor_id,
                actor_kind=principal.actor_kind,
                capabilities=("commerce.write",),
            )
        initialized = store.apply_command(
            operator,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.workspace.initialized",
            expected_version=0,
            payload={
                "state": catalog_state(),
                "evidence": action_evidence("ACT-RECEIVING-INITIALIZE"),
            },
        )
        created_state = deepcopy(initialized.state)
        created_state["purchaseOrders"] = [
            purchase_order_record(
                action_id="ACT-RECEIVING-ORDER",
                expected_at="2026-07-23T11:00:00.000Z",
            )
        ]
        created_payload = {
            "state": created_state,
            "evidence": dict(
                created_state["purchaseOrders"][0]["creation"]  # type: ignore[index,arg-type]
            ),
        }
        purchase_created_at = "2026-07-23T09:00:00.000+00:00"
        with patch(
            "supermega_runtime.trial_store._utc_now",
            return_value=purchase_created_at,
        ):
            created = store.apply_command(
                operator,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.purchase_order.created",
                expected_version=initialized.version,
                payload=created_payload,
            )

        action_id = "ACT-RECEIVING-PARTIAL"
        spoofed_at = "2099-01-01T00:00:00.000Z"
        receipt_state = deepcopy(created.state)
        receipt_state["items"][0]["onHand"] = 14  # type: ignore[index]
        receipt_state["movements"] = [
            movement(
                "receipt",
                action_id,
                4,
                created_at=spoofed_at,
                purchase_order_id=PURCHASE_ORDER_ID,
            )
        ]
        receipt_state["movements"][0]["actor"] = "Fabricated receiving bot"  # type: ignore[index]
        receipt_payload = {
            "state": receipt_state,
            "evidence": action_evidence(
                action_id,
                captured_at=spoofed_at,
                actor="Fabricated receiving bot",
            ),
        }
        command_id = str(uuid4())
        with patch(
            "supermega_runtime.trial_store._utc_now",
            return_value="2026-07-23T08:30:00.000+00:00",
        ):
            received = store.apply_command(
                operator,
                command_id=command_id,
                surface="commerce",
                event_type="commerce.purchase_order.received",
                expected_version=created.version,
                payload=receipt_payload,
            )
            replay = store.apply_command(
                operator,
                command_id=command_id,
                surface="commerce",
                event_type="commerce.purchase_order.received",
                expected_version=created.version,
                payload=receipt_payload,
            )

        receipt = received.state["movements"][0]  # type: ignore[index]
        self.assertEqual(receipt["actor"], operator.actor_id)
        self.assertEqual(
            datetime.fromisoformat(str(receipt["createdAt"])),
            datetime.fromisoformat(purchase_created_at),
        )
        self.assertNotEqual(receipt["createdAt"], spoofed_at)
        self.assertEqual(receipt["purchaseOrderId"], PURCHASE_ORDER_ID)
        self.assertEqual(received.state["items"][0]["onHand"], 14)  # type: ignore[index]
        self.assertTrue(replay.idempotent_replay)
        self.assertEqual(replay.state, received.state)

        conflicting = deepcopy(receipt_payload)
        conflicting["evidence"]["reason"] = "Changed replay reason."  # type: ignore[index]
        conflicting["state"]["movements"][0]["reason"] = "Changed replay reason."  # type: ignore[index]
        with self.assertRaises(TrialIdempotencyConflict):
            store.apply_command(
                operator,
                command_id=command_id,
                surface="commerce",
                event_type="commerce.purchase_order.received",
                expected_version=created.version,
                payload=conflicting,
            )

        second_action_id = "ACT-RECEIVING-FINAL"
        second_state = deepcopy(received.state)
        second_state["items"][0]["onHand"] = 16  # type: ignore[index]
        second_state["movements"] = [
            movement(
                "receipt",
                second_action_id,
                2,
                created_at=spoofed_at,
                purchase_order_id=PURCHASE_ORDER_ID,
            ),
            *received.state["movements"],  # type: ignore[misc]
        ]
        second_payload = {
            "state": second_state,
            "evidence": action_evidence(
                second_action_id,
                captured_at=spoofed_at,
                actor="Another fabricated receiver",
            ),
        }
        second_state["movements"][0]["actor"] = "Another fabricated receiver"  # type: ignore[index]
        with patch(
            "supermega_runtime.trial_store._utc_now",
            return_value="2026-07-23T08:00:00.000+00:00",
        ):
            final_receipt = store.apply_command(
                operator,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.purchase_order.received",
                expected_version=received.version,
                payload=second_payload,
            )
        final_movement = final_receipt.state["movements"][0]  # type: ignore[index]
        self.assertEqual(final_movement["actor"], operator.actor_id)
        self.assertEqual(final_movement["createdAt"], receipt["createdAt"])
        self.assertEqual(final_receipt.state["items"][0]["onHand"], 16)  # type: ignore[index]

        with self.assertRaises(TrialHumanApprovalRequired):
            store.apply_command(
                agent,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.purchase_order.received",
                expected_version=final_receipt.version,
                payload=receipt_payload,
            )

    def test_store_stamps_purchase_cancellation_actor_time_and_replay(self) -> None:
        store = InMemoryTrialStore(reducer=reduce_trial_state)
        operator = TrialPrincipal(
            "workspace-purchase-cancel",
            "shop-purchasing-lead",
            "human",
        )
        agent = TrialPrincipal(
            "workspace-purchase-cancel",
            "purchasing-agent",
            "agent",
        )
        for principal in (operator, agent):
            store.provision_membership(
                workspace_id=principal.workspace_id,
                actor_id=principal.actor_id,
                actor_kind=principal.actor_kind,
                capabilities=("commerce.write",),
            )
        initialized = store.apply_command(
            operator,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.workspace.initialized",
            expected_version=0,
            payload={
                "state": catalog_state(),
                "evidence": action_evidence("ACT-CANCELLATION-INITIALIZE"),
            },
        )
        created_state = deepcopy(initialized.state)
        created_state["purchaseOrders"] = [
            purchase_order_record(
                action_id="ACT-CANCELLATION-ORDER",
                expected_at="2026-07-23T11:00:00.000Z",
            )
        ]
        created_payload = {
            "state": created_state,
            "evidence": dict(
                created_state["purchaseOrders"][0]["creation"]  # type: ignore[index,arg-type]
            ),
        }
        with patch(
            "supermega_runtime.trial_store._utc_now",
            return_value="2026-07-23T09:00:00.000+00:00",
        ):
            created = store.apply_command(
                operator,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.purchase_order.created",
                expected_version=initialized.version,
                payload=created_payload,
            )

        receipt_action_id = "ACT-CANCELLATION-PARTIAL-RECEIPT"
        receipt_state = deepcopy(created.state)
        receipt_state["items"][0]["onHand"] = 14  # type: ignore[index]
        receipt_state["movements"] = [
            movement(
                "receipt",
                receipt_action_id,
                4,
                created_at="2099-01-01T00:00:00.000Z",
                purchase_order_id=PURCHASE_ORDER_ID,
            )
        ]
        receipt_payload = {
            "state": receipt_state,
            "evidence": action_evidence(
                receipt_action_id,
                captured_at="2099-01-01T00:00:00.000Z",
                actor="Fabricated receiver",
            ),
        }
        receipt_state["movements"][0]["actor"] = "Fabricated receiver"  # type: ignore[index]
        receipt_at = "2026-07-23T09:10:00.000+00:00"
        with patch(
            "supermega_runtime.trial_store._utc_now",
            return_value=receipt_at,
        ):
            partially_received = store.apply_command(
                operator,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.purchase_order.received",
                expected_version=created.version,
                payload=receipt_payload,
            )

        action_id = "ACT-PURCHASE-CANCEL-AUTHORITATIVE"
        spoofed_at = "2099-01-01T00:00:00.000Z"
        cancellation_state = deepcopy(partially_received.state)
        forged_cancellation = action_evidence(
            action_id,
            captured_at=spoofed_at,
            actor="Fabricated purchasing bot",
        )
        cancellation_state["purchaseOrders"][0]["cancellation"] = (  # type: ignore[index]
            forged_cancellation
        )
        cancellation_payload = {
            "state": cancellation_state,
            "evidence": dict(forged_cancellation),
        }
        command_id = str(uuid4())
        with patch(
            "supermega_runtime.trial_store._utc_now",
            return_value="2026-07-23T08:00:00.000+00:00",
        ):
            cancelled = store.apply_command(
                operator,
                command_id=command_id,
                surface="commerce",
                event_type="commerce.purchase_order.cancelled",
                expected_version=partially_received.version,
                payload=cancellation_payload,
            )
            replay = store.apply_command(
                operator,
                command_id=command_id,
                surface="commerce",
                event_type="commerce.purchase_order.cancelled",
                expected_version=partially_received.version,
                payload=cancellation_payload,
            )

        cancellation = cancelled.state["purchaseOrders"][0]["cancellation"]  # type: ignore[index]
        self.assertEqual(cancellation["actor"], operator.actor_id)
        self.assertEqual(
            datetime.fromisoformat(str(cancellation["capturedAt"])),
            datetime.fromisoformat(receipt_at),
        )
        self.assertNotEqual(cancellation["capturedAt"], spoofed_at)
        self.assertEqual(cancelled.state["items"], partially_received.state["items"])
        self.assertEqual(
            cancelled.state["movements"],
            partially_received.state["movements"],
        )
        self.assertTrue(replay.idempotent_replay)
        self.assertEqual(replay.state, cancelled.state)

        conflicting = deepcopy(cancellation_payload)
        conflicting["evidence"]["reason"] = "Changed replay reason."  # type: ignore[index]
        conflicting["state"]["purchaseOrders"][0]["cancellation"]["reason"] = (  # type: ignore[index]
            "Changed replay reason."
        )
        with self.assertRaises(TrialIdempotencyConflict):
            store.apply_command(
                operator,
                command_id=command_id,
                surface="commerce",
                event_type="commerce.purchase_order.cancelled",
                expected_version=partially_received.version,
                payload=conflicting,
            )
        with self.assertRaises(TrialHumanApprovalRequired):
            store.apply_command(
                agent,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.purchase_order.cancelled",
                expected_version=cancelled.version,
                payload=cancellation_payload,
            )

    def test_purchase_order_transitions_fail_closed_on_overreceipt_and_cross_event_mutation(self) -> None:
        current = catalog_state()
        created_state = deepcopy(current)
        created_state["purchaseOrders"] = [purchase_order_record()]
        created = apply_event(current, "commerce.purchase_order.created", created_state)

        duplicate_state = deepcopy(created)
        duplicate_state["purchaseOrders"] = [  # type: ignore[assignment]
            purchase_order_record(
                purchase_order_id="PO-00000000-0000-4000-8000-000000000021",
                action_id="ACT-PURCHASE-CREATE-2",
            ),
            *created["purchaseOrders"],  # type: ignore[misc]
        ]
        with self.assertRaises(TrialValidationError):
            apply_event(
                created,
                "commerce.purchase_order.created",
                duplicate_state,
            )

        overreceipt = deepcopy(created)
        overreceipt["items"][0]["onHand"] = 21  # type: ignore[index]
        overreceipt["movements"] = [
            movement(
                "receipt",
                "ACT-PURCHASE-OVERRECEIPT",
                11,
                created_at="2026-07-23T09:10:00.000Z",
                purchase_order_id=PURCHASE_ORDER_ID,
            )
        ]
        with self.assertRaises(TrialValidationError):
            apply_event(
                created,
                "commerce.purchase_order.received",
                overreceipt,
            )

        cross_event_mutation = deepcopy(created)
        cross_event_mutation["purchaseOrders"][0]["expectedAt"] = (  # type: ignore[index]
            "2026-07-26T09:00:00.000Z"
        )
        cross_event_mutation["items"][0]["onHand"] = 11  # type: ignore[index]
        cross_event_mutation["movements"] = [
            movement("receipt", "ACT-DIRECT-RECEIPT", 1)
        ]
        with self.assertRaises(TrialValidationError):
            apply_event(
                created,
                "commerce.stock.received",
                cross_event_mutation,
            )

        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.purchase_order.created",
                created_state,
                action_evidence("ACT-SPOOFED"),
            )

        for captured_at in (
            "2026-07-23T09:20:00",
            "2026-07-23T09:20:00.0000001Z",
        ):
            invalid_timestamp = deepcopy(created)
            invalid_timestamp["purchaseOrders"][0]["cancellation"] = action_evidence(  # type: ignore[index]
                f"ACT-PURCHASE-CANCEL-{captured_at}",
                captured_at=captured_at,
            )
            with self.subTest(captured_at=captured_at), self.assertRaises(TrialValidationError):
                validate_commerce_state(invalid_timestamp)

    def test_multi_line_order_reserves_and_releases_every_price_snapshot_atomically(self) -> None:
        current = catalog_state()
        current["items"].append(  # type: ignore[union-attr]
            {
                "sku": "SKU-2",
                "name": "Second item",
                "variant": "Large",
                "onHand": 5,
                "reorderAt": 1,
                "price": 250,
            }
        )
        order = {
            "id": "ORD-MULTI",
            "createdAt": NOW,
            "customer": "Counter A",
            "owner": "Accountable operator",
            "channel": "Walk-in",
            "item": "2 items",
            "quantity": 3,
            "payment": "Cash",
            "paymentStatus": "pending",
            "refundStatus": "none",
            "fulfilment": "pickup",
            "fulfilmentReference": "COUNTER-A",
            "promisedAt": PROMISED_AT,
            "lines": [
                {
                    "sku": "SKU-1",
                    "name": "Test item",
                    "quantity": 2,
                    "unitPriceMmk": 100,
                },
                {
                    "sku": "SKU-2",
                    "name": "Second item",
                    "variant": "Large",
                    "quantity": 1,
                    "unitPriceMmk": 250,
                },
            ],
            "total": 450,
            "status": "confirmed",
        }
        created = deepcopy(current)
        created["items"][0]["onHand"] = 8  # type: ignore[index]
        created["items"][1]["onHand"] = 4  # type: ignore[index]
        created["orders"] = [order]
        created["movements"] = [
            movement(
                "reserve",
                "ACT-MULTI",
                -2,
                order_id="ORD-MULTI",
                sku="SKU-1",
                id_suffix="L1",
            ),
            movement(
                "reserve",
                "ACT-MULTI",
                -1,
                order_id="ORD-MULTI",
                sku="SKU-2",
                id_suffix="L2",
            ),
        ]
        accepted = apply_event(current, "commerce.order.created", created)
        self.assertEqual(
            [item["onHand"] for item in accepted["items"]],  # type: ignore[index]
            [8, 4],
        )
        self.assertEqual(accepted["orders"][0]["total"], 450)  # type: ignore[index]
        self.assertEqual(
            [movement_record["actionId"] for movement_record in accepted["movements"]],  # type: ignore[index]
            ["ACT-MULTI", "ACT-MULTI"],
        )

        collision_order = {
            **order,
            "id": "ORD-COLLISION",
            "item": "Second item",
            "itemSku": "SKU-2",
            "quantity": 1,
            "lines": [
                {
                    "sku": "SKU-2",
                    "name": "Second item",
                    "variant": "Large",
                    "quantity": 1,
                    "unitPriceMmk": 250,
                }
            ],
            "total": 250,
        }
        collision_safe = deepcopy(accepted)
        collision_safe["items"][1]["onHand"] = 3  # type: ignore[index]
        collision_safe["orders"] = [collision_order, *accepted["orders"]]  # type: ignore[misc]
        collision_safe["movements"] = [
            movement(
                "reserve",
                "ACT-MULTI-L1",
                -1,
                order_id="ORD-COLLISION",
                sku="SKU-2",
            ),
            *accepted["movements"],  # type: ignore[misc]
        ]
        collision_accepted = apply_event(
            accepted,
            "commerce.order.created",
            collision_safe,
        )
        movement_ids = [
            movement_record["id"]
            for movement_record in collision_accepted["movements"]  # type: ignore[union-attr]
        ]
        self.assertEqual(len(movement_ids), len(set(movement_ids)))

        repriced = deepcopy(accepted)
        repriced["items"][0]["price"] = 125  # type: ignore[index]
        self.assertEqual(
            validate_commerce_state(repriced)["orders"][0]["lines"][0]["unitPriceMmk"],  # type: ignore[index]
            100,
        )

        missing_line = deepcopy(created)
        missing_line["movements"] = [missing_line["movements"][0]]  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(current, "commerce.order.created", missing_line)

        wrong_price = deepcopy(created)
        wrong_price["orders"][0]["lines"][1]["unitPriceMmk"] = 251  # type: ignore[index]
        wrong_price["orders"][0]["total"] = 451  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(current, "commerce.order.created", wrong_price)

        cancelled = deepcopy(accepted)
        cancelled["items"][0]["onHand"] = 10  # type: ignore[index]
        cancelled["items"][1]["onHand"] = 5  # type: ignore[index]
        cancelled["orders"][0].update(  # type: ignore[index]
            {"status": "cancelled", "refundStatus": "none"}
        )
        cancelled["movements"] = [
            movement(
                "release",
                "ACT-CANCEL-MULTI",
                2,
                order_id="ORD-MULTI",
                sku="SKU-1",
                id_suffix="L1",
            ),
            movement(
                "release",
                "ACT-CANCEL-MULTI",
                1,
                order_id="ORD-MULTI",
                sku="SKU-2",
                id_suffix="L2",
            ),
            *accepted["movements"],  # type: ignore[misc]
        ]
        released = apply_event(
            accepted,
            "commerce.order.cancelled",
            cancelled,
        )
        self.assertEqual(
            [item["onHand"] for item in released["items"]],  # type: ignore[index]
            [10, 5],
        )
        self.assertEqual(
            len(
                [
                    movement_record
                    for movement_record in released["movements"]  # type: ignore[union-attr]
                    if movement_record["kind"] == "release"
                ]
            ),
            2,
        )

    def test_order_progress_payment_and_close_are_server_checked(self) -> None:
        current = created_state()
        preparing = deepcopy(current)
        preparing["orders"][0].update(  # type: ignore[index]
            {
                "status": "preparing",
                "advancementActionIds": ["ACT-PREPARING"],
            }
        )
        rewritten_promise = deepcopy(preparing)
        rewritten_promise["orders"][0]["promisedAt"] = (  # type: ignore[index]
            "2026-07-23T12:00:00.000Z"
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.order.advanced",
                rewritten_promise,
            )
        current = apply_event(current, "commerce.order.advanced", preparing)

        ready = deepcopy(current)
        ready["orders"][0].update(  # type: ignore[index]
            {
                "status": "ready",
                "advancementActionIds": [
                    "ACT-PREPARING",
                    "ACT-READY",
                ],
            }
        )
        current = apply_event(current, "commerce.order.advanced", ready)

        completed_without_payment = deepcopy(current)
        completed_without_payment["orders"][0]["status"] = "completed"  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(current, "commerce.order.advanced", completed_without_payment)

        reconciled = deepcopy(current)
        reconciled["orders"][0].update(  # type: ignore[index]
            {
                "paymentStatus": "reconciled",
                "paymentReconciledAt": NOW,
                "paymentReconciliationActionId": "ACT-PAY",
                "paymentReconciledBy": "Accountable operator",
                "paymentReconciliationReason": "Matched the settlement record.",
                "paymentEvidenceReference": "EV-PAY",
            }
        )
        current = apply_event(current, "commerce.payment.reconciled", reconciled)

        reused_advancement = deepcopy(current)
        reused_advancement["orders"][0].update(  # type: ignore[index]
            {
                "status": "completed",
                "completion": action_evidence("ACT-READY"),
            }
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.order.advanced",
                reused_advancement,
            )

        completed = deepcopy(current)
        completed["orders"][0].update(  # type: ignore[index]
            {
                "status": "completed",
                "completion": action_evidence("ACT-COMPLETE"),
            }
        )
        current = apply_event(current, "commerce.order.advanced", completed)

        closed = deepcopy(current)
        closed["closes"] = [
            close_record(current, captured_at="2026-07-23T10:00:00.000Z")
        ]
        result = apply_event(current, "commerce.close.saved", closed)
        self.assertEqual(result["closes"][0]["total"], 200)  # type: ignore[index]
        self.assertEqual(result["closes"][0]["operator"], "Accountable operator")  # type: ignore[index]
        self.assertEqual(result["closes"][0]["businessDate"], "2026-07-23")  # type: ignore[index]
        self.assertEqual(result["closes"][0]["orderIds"], ["ORD-1"])  # type: ignore[index]
        self.assertEqual(result["closes"][0]["paymentExceptionOrderIds"], [])  # type: ignore[index]

        wrong_close = deepcopy(current)
        invalid_close = close_record(
            current,
            CLOSE_ACTION_ID_2,
            close_id=CLOSE_ID_2,
            captured_at="2026-07-23T10:00:00.000Z",
        )
        invalid_close["total"] = 100
        wrong_close["closes"] = [invalid_close]
        with self.assertRaises(TrialValidationError):
            apply_event(current, "commerce.close.saved", wrong_close)

        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.close.saved",
                closed,
                action_evidence("ACT-CLOSE-OTHER"),
            )

        same_period = deepcopy(result)
        same_period["closes"] = [
            close_record(
                result,
                CLOSE_ACTION_ID_3,
                close_id=CLOSE_ID_3,
                captured_at="2026-07-23T11:00:00.000Z",
            ),
            *result["closes"],  # type: ignore[union-attr]
        ]
        with self.assertRaises(TrialValidationError):
            apply_event(result, "commerce.close.saved", same_period)

        next_day_close = close_record(
            result,
            CLOSE_ACTION_ID_3,
            close_id=CLOSE_ID_3,
            captured_at="2026-07-24T09:00:00.000Z",
        )
        self.assertEqual(next_day_close["orderIds"], [])
        duplicated_membership = deepcopy(result)
        duplicated_close = deepcopy(next_day_close)
        duplicated_close.update({"orderIds": ["ORD-1"], "orders": 1, "total": 200})
        duplicated_membership["closes"] = [
            duplicated_close,
            *result["closes"],  # type: ignore[union-attr]
        ]
        with self.assertRaises(TrialValidationError):
            apply_event(result, "commerce.close.saved", duplicated_membership)

        next_day = deepcopy(result)
        next_day["closes"] = [
            next_day_close,
            *result["closes"],  # type: ignore[union-attr]
        ]
        accepted_next_day = apply_event(result, "commerce.close.saved", next_day)
        self.assertEqual(accepted_next_day["closes"][0]["orders"], 0)  # type: ignore[index]
        self.assertEqual(accepted_next_day["closes"][1]["orderIds"], ["ORD-1"])  # type: ignore[index]

    def test_completed_order_accepts_multiple_partial_returns_with_explicit_stock_disposition(self) -> None:
        current = validate_commerce_state(completed_state())
        original_order = deepcopy(current["orders"][0])
        original_movement_count = len(current["movements"])

        restocked_state = returned_state(current)
        restocked = apply_event(
            current,
            "commerce.order.return_recorded",
            restocked_state,
        )
        self.assertEqual(restocked["items"][0]["onHand"], 9)
        self.assertEqual(restocked["movements"][0]["kind"], "return")
        self.assertEqual(restocked["movements"][0]["orderId"], "ORD-1")
        self.assertEqual(restocked["orders"][0]["returns"][0]["disposition"], "restock")

        not_restocked_state = returned_state(
            restocked,
            disposition="not_restocked",
            action_id="ACT-RETURN-2",
            captured_at=RETURN_AT_2,
        )
        not_restocked = apply_event(
            restocked,
            "commerce.order.return_recorded",
            not_restocked_state,
        )
        self.assertEqual(not_restocked["items"][0]["onHand"], 9)
        self.assertEqual(
            len(not_restocked["movements"]),
            original_movement_count + 1,
        )
        self.assertEqual(
            [record["disposition"] for record in not_restocked["orders"][0]["returns"]],
            ["not_restocked", "restock"],
        )
        for field in (
            "total",
            "paymentStatus",
            "refundStatus",
            "paymentReconciliationActionId",
            "completion",
        ):
            self.assertEqual(
                not_restocked["orders"][0][field],
                original_order[field],
            )

        over_return = returned_state(
            not_restocked,
            action_id="ACT-RETURN-3",
            captured_at="2026-07-23T09:50:00.000Z",
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                not_restocked,
                "commerce.order.return_recorded",
                over_return,
            )
        with self.assertRaises(TrialValidationError):
            apply_event(
                restocked,
                "commerce.order.return_recorded",
                restocked,
            )

    def test_return_transition_rejects_unproven_chronology_stock_and_command_evidence(self) -> None:
        current = validate_commerce_state(completed_state())
        accepted_candidate = returned_state(current)

        forged_evidence = action_evidence(
            "ACT-FORGED-RETURN",
            captured_at=RETURN_AT,
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.order.return_recorded",
                accepted_candidate,
                forged_evidence,
            )

        legacy_completed = completed_state()
        legacy_completed["orders"][0].pop("completion")  # type: ignore[index]
        validate_commerce_state(legacy_completed)
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(returned_state(legacy_completed))

        backdated_completion = completed_state()
        backdated_completion["orders"][0]["completion"]["capturedAt"] = NOW  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(backdated_completion)

        backdated_return = returned_state(current, captured_at=PAYMENT_AT)
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(backdated_return)

        missing_restock = returned_state(current)
        missing_restock["items"] = deepcopy(current["items"])
        missing_restock["movements"] = deepcopy(current["movements"])
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(missing_restock)

        no_stock_disposition = returned_state(
            current,
            disposition="not_restocked",
        )
        no_stock_disposition["items"][0]["onHand"] += 1  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.order.return_recorded",
                no_stock_disposition,
            )

        changed_order_total = returned_state(current)
        changed_order_total["orders"][0]["total"] += 1  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.order.return_recorded",
                changed_order_total,
            )

        reused_completion_action = returned_state(
            current,
            action_id="ACT-COMPLETE-ORD-1",
        )
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(reused_completion_action)

    def test_invoice_correction_is_immutable_tax_bound_and_close_integrated(self) -> None:
        current = completed_state()
        current["orders"][0]["calculation"] = {  # type: ignore[index]
            "schema": "supermega.commerce.order-calculation.v1",
            "currency": "MMK",
            "catalogRevision": 0,
            "subtotalMmk": 200,
            "taxMode": "not_configured",
            "taxMmk": 0,
            "totalMmk": 200,
        }
        current = validate_commerce_state(current)
        original_order = deepcopy(current["orders"][0])

        corrected = apply_event(
            current,
            "commerce.order.correction_recorded",
            corrected_state(current),
        )
        record = corrected["orders"][0]["corrections"][0]  # type: ignore[index]
        self.assertEqual(record["kind"], "credit")
        self.assertEqual(record["balanceAfterMmk"], 150)
        self.assertEqual(record["financialStatus"], "review_required")
        self.assertEqual(record["postingAuthority"], "none")
        self.assertFalse(record["externalPostingPerformed"])
        for field in ("total", "calculation", "paymentStatus", "completion"):
            self.assertEqual(corrected["orders"][0][field], original_order[field])  # type: ignore[index]
        self.assertEqual(corrected["items"], current["items"])
        self.assertEqual(corrected["movements"], current["movements"])

        close = close_record(
            corrected,
            CLOSE_ACTION_ID_2,
            close_id=CLOSE_ID_2,
            captured_at="2026-07-23T10:00:00.000Z",
        )
        self.assertEqual(close["total"], 150)
        closed = deepcopy(corrected)
        closed["closes"] = [close]
        accepted_close = apply_event(corrected, "commerce.close.saved", closed)
        export = commerce_daily_close_export(accepted_close, CLOSE_ID_2)
        self.assertIsNotNone(export)
        assert export is not None
        self.assertEqual(export["schema"], "supermega.commerce.daily-close-export.v3")
        self.assertEqual(export["totalMmk"], 150)
        self.assertEqual(export["orders"][0]["originalTotalMmk"], 200)
        self.assertEqual(export["orders"][0]["totalMmk"], 150)
        self.assertEqual(export["orders"][0]["corrections"][0]["documentId"], record["documentId"])
        self.assertIsNone(commerce_accounting_handoff(accepted_close, CLOSE_ID_2))

        forged_total = corrected_state(current)
        forged_total["orders"][0]["total"] = 150  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(current, "commerce.order.correction_recorded", forged_total)

        over_credit = corrected_state(current, listed_amount_mmk=201)
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(over_credit)

        backdated = corrected_state(current, captured_at=PAYMENT_AT)
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(backdated)

        after_close = corrected_state(accepted_close, action_id="ACT-CORRECTION-2")
        with self.assertRaises(TrialValidationError):
            apply_event(
                accepted_close,
                "commerce.order.correction_recorded",
                after_close,
            )

    def test_daily_close_snapshots_exact_exceptions_and_legacy_records_still_load(self) -> None:
        current = created_state("ORD-EXCEPTION")
        current["items"][0]["reorderAt"] = 8  # type: ignore[index]
        close = close_record(current, CLOSE_ACTION_ID_2, close_id=CLOSE_ID_2)
        self.assertEqual(close["paymentExceptionOrderIds"], ["ORD-EXCEPTION"])
        self.assertEqual(close["stockExceptionSkus"], ["SKU-1"])

        next_state = deepcopy(current)
        next_state["closes"] = [close]
        accepted = apply_event(current, "commerce.close.saved", next_state)
        self.assertEqual(accepted["closes"][0]["orderIds"], [])  # type: ignore[index]
        self.assertEqual(accepted["closes"][0]["paymentExceptionOrderIds"], ["ORD-EXCEPTION"])  # type: ignore[index]
        self.assertEqual(accepted["closes"][0]["stockExceptionSkus"], ["SKU-1"])  # type: ignore[index]

        wrong_payment_exceptions = deepcopy(next_state)
        wrong_payment_exceptions["closes"][0]["paymentExceptionOrderIds"] = []  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(current, "commerce.close.saved", wrong_payment_exceptions)

        short_ids = deepcopy(next_state)
        short_ids["closes"][0].update(  # type: ignore[index]
            {"id": "CLOSE-SHORT", "actionId": "ACT-SHORT"}
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.close.saved",
                short_ids,
                action_evidence("ACT-SHORT"),
            )

        incomplete_proof = deepcopy(next_state)
        del incomplete_proof["closes"][0]["operator"]  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.close.saved",
                incomplete_proof,
                action_evidence(CLOSE_ACTION_ID_2),
            )

        legacy = catalog_state()
        legacy["closes"] = [
            {"id": "CLOSE-LEGACY", "createdAt": NOW, "total": 0, "orders": 0}
        ]
        self.assertEqual(
            validate_commerce_state(legacy)["closes"],
            legacy["closes"],
        )
        legacy_received = deepcopy(legacy)
        legacy_received["items"][0]["onHand"] = 11  # type: ignore[index]
        legacy_received["movements"] = [
            movement("receipt", "ACT-LEGACY-RECEIPT", 1)
        ]
        accepted_legacy_receipt = apply_event(
            legacy,
            "commerce.stock.received",
            legacy_received,
        )
        self.assertEqual(
            accepted_legacy_receipt["closes"],
            legacy["closes"],
        )
        legacy_with_proven_close = deepcopy(accepted_legacy_receipt)
        legacy_with_proven_close["closes"] = [
            close_record(
                accepted_legacy_receipt,
                CLOSE_ACTION_ID_3,
                close_id=CLOSE_ID_3,
            ),
            *accepted_legacy_receipt["closes"],  # type: ignore[union-attr]
        ]
        with self.assertRaises(TrialValidationError):
            apply_event(
                accepted_legacy_receipt,
                "commerce.close.saved",
                legacy_with_proven_close,
            )

        boundary_state = catalog_state()
        boundary_close = close_record(
            boundary_state,
            CLOSE_ACTION_ID_3,
            close_id=CLOSE_ID_3,
            captured_at="2026-07-23T20:00:00.000Z",
        )
        self.assertEqual(boundary_close["businessDate"], "2026-07-24")
        boundary_next = deepcopy(boundary_state)
        boundary_next["closes"] = [boundary_close]
        accepted_boundary = apply_event(
            boundary_state,
            "commerce.close.saved",
            boundary_next,
        )
        self.assertEqual(accepted_boundary["closes"][0]["businessDate"], "2026-07-24")  # type: ignore[index]

    def test_tax_configuration_is_versioned_bound_and_freezes_order_calculation(self) -> None:
        current = catalog_state()
        legacy_configuration = tax_configuration(1)
        legacy_configuration.pop("jurisdictionCode")
        legacy_configuration.pop("effectiveFrom")
        legacy_state = deepcopy(current)
        legacy_state["taxConfigurations"] = [legacy_configuration]
        self.assertEqual(
            validate_commerce_state(legacy_state)["taxConfigurations"],
            [legacy_configuration],
        )
        with self.assertRaises(TrialValidationError):
            apply_event(current, "commerce.tax_configuration.saved", legacy_state)

        incomplete_schedule = deepcopy(current)
        incomplete_schedule["taxConfigurations"] = [tax_configuration(1)]
        incomplete_schedule["taxConfigurations"][0].pop("effectiveFrom")  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(incomplete_schedule)

        backdated_schedule = deepcopy(current)
        backdated_schedule["taxConfigurations"] = [
            tax_configuration(
                1,
                captured_at="2026-07-23T09:05:00.000Z",
                effective_from=NOW,
            )
        ]
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(backdated_schedule)

        configured_state = deepcopy(current)
        configured_state["taxConfigurations"] = [tax_configuration(1)]
        configured = apply_event(
            current,
            "commerce.tax_configuration.saved",
            configured_state,
        )
        self.assertEqual(configured["taxConfigurations"][0]["revision"], 1)  # type: ignore[index]

        replay = apply_event(
            current,
            "commerce.tax_configuration.saved",
            configured_state,
        )
        self.assertEqual(replay, configured)
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.tax_configuration.saved",
                configured_state,
                action_evidence("ACT-WRONG-EVIDENCE"),
            )

        unchanged = deepcopy(configured)
        unchanged["taxConfigurations"] = [  # type: ignore[index]
            tax_configuration(2, action_id="ACT-TAX-UNCHANGED"),
            *configured["taxConfigurations"],  # type: ignore[index]
        ]
        with self.assertRaises(TrialValidationError):
            apply_event(configured, "commerce.tax_configuration.saved", unchanged)

        unrelated_mutation = deepcopy(configured)
        unrelated_mutation["items"][0]["price"] = 101  # type: ignore[index]
        unrelated_mutation["taxConfigurations"] = [  # type: ignore[index]
            tax_configuration(2, code="CT5I", mode="inclusive"),
            *configured["taxConfigurations"],  # type: ignore[index]
        ]
        with self.assertRaises(TrialValidationError):
            apply_event(
                configured,
                "commerce.tax_configuration.saved",
                unrelated_mutation,
            )

        def order_state(
            basis: dict[str, object],
            order_id: str,
            calculation: dict[str, object],
            *,
            created_at: str = NOW,
        ) -> dict[str, object]:
            state = deepcopy(basis)
            state["items"][0]["onHand"] -= 2  # type: ignore[index,operator]
            order = order_record(order_id)
            order["createdAt"] = created_at
            order["lines"] = [
                {
                    "sku": "SKU-1",
                    "name": "Test item",
                    "quantity": 2,
                    "unitPriceMmk": 100,
                }
            ]
            order["total"] = calculation["totalMmk"]
            order["calculation"] = calculation
            state["orders"] = [order, *basis["orders"]]  # type: ignore[index]
            state["movements"] = [
                movement(
                    "reserve",
                    f"ACT-{order_id}",
                    -2,
                    order_id=order_id,
                    created_at=created_at,
                ),
                *basis["movements"],  # type: ignore[index]
            ]
            return state

        exclusive_calculation: dict[str, object] = {
            "schema": "supermega.commerce.order-calculation.v2",
            "currency": "MMK",
            "catalogRevision": 0,
            "taxConfigurationRevision": 1,
            "taxCode": "CT5",
            "taxJurisdictionCode": "MM",
            "taxEffectiveFrom": NOW,
            "taxRateBasisPoints": 500,
            "taxMode": "exclusive",
            "listedSubtotalMmk": 200,
            "subtotalMmk": 200,
            "taxMmk": 10,
            "totalMmk": 210,
        }
        first_order = apply_event(
            configured,
            "commerce.order.created",
            order_state(configured, "ORD-TAX-1", exclusive_calculation),
        )

        revision_two_state = deepcopy(first_order)
        revision_two_state["taxConfigurations"] = [  # type: ignore[index]
            tax_configuration(
                2,
                code="CT5I",
                label="Commercial tax included",
                mode="inclusive",
                jurisdiction_code="MM-YGN",
                effective_from="2026-07-23T10:00:00.000Z",
            ),
            *first_order["taxConfigurations"],  # type: ignore[index]
        ]
        revision_two = apply_event(
            first_order,
            "commerce.tax_configuration.saved",
            revision_two_state,
        )
        self.assertEqual(
            revision_two["orders"][0]["calculation"]["taxConfigurationRevision"],  # type: ignore[index]
            1,
        )

        pre_effective_order = order_state(
            revision_two,
            "ORD-TAX-PRE-EFFECTIVE",
            exclusive_calculation,
        )
        pre_effective = apply_event(
            revision_two,
            "commerce.order.created",
            pre_effective_order,
        )
        self.assertEqual(
            pre_effective["orders"][0]["calculation"]["taxConfigurationRevision"],  # type: ignore[index]
            1,
        )

        inclusive_calculation: dict[str, object] = {
            "schema": "supermega.commerce.order-calculation.v2",
            "currency": "MMK",
            "catalogRevision": 0,
            "taxConfigurationRevision": 2,
            "taxCode": "CT5I",
            "taxJurisdictionCode": "MM-YGN",
            "taxEffectiveFrom": "2026-07-23T10:00:00.000Z",
            "taxRateBasisPoints": 500,
            "taxMode": "inclusive",
            "listedSubtotalMmk": 200,
            "subtotalMmk": 190,
            "taxMmk": 10,
            "totalMmk": 200,
        }
        second_order = apply_event(
            pre_effective,
            "commerce.order.created",
            order_state(
                pre_effective,
                "ORD-TAX-2",
                inclusive_calculation,
                created_at="2026-07-23T10:30:00.000Z",
            ),
        )
        self.assertEqual(second_order["orders"][0]["calculation"], inclusive_calculation)  # type: ignore[index]
        self.assertEqual(
            second_order["orders"][2]["calculation"]["taxConfigurationRevision"],  # type: ignore[index]
            1,
        )

        tampered = deepcopy(second_order)
        tampered["orders"][0]["calculation"]["taxMmk"] = 11  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(tampered)

    def test_tax_configuration_store_is_human_only_and_server_attributed(self) -> None:
        store = InMemoryTrialStore(reducer=reduce_trial_state)
        operator = TrialPrincipal("workspace-tax", "operator-tax", "human")
        agent = TrialPrincipal("workspace-tax", "tax-agent", "agent")
        for principal in (operator, agent):
            store.provision_membership(
                workspace_id=principal.workspace_id,
                actor_id=principal.actor_id,
                actor_kind=principal.actor_kind,
                capabilities=("commerce.write",),
            )
        initialized = store.apply_command(
            operator,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.workspace.initialized",
            expected_version=0,
            payload={"state": catalog_state(), "evidence": action_evidence("ACT-INIT-TAX")},
        )
        configured_state = deepcopy(initialized.state)
        configured_state["taxConfigurations"] = [
            tax_configuration(
                1,
                action_id="ACT-TAX-SERVER",
                captured_at="2099-01-01T00:00:00.000Z",
            )
        ]
        configured_state["taxConfigurations"][0]["proof"]["actor"] = "forged-actor"  # type: ignore[index]
        payload = {
            "state": configured_state,
            "evidence": dict(configured_state["taxConfigurations"][0]["proof"]),  # type: ignore[index,arg-type]
        }
        command_id = str(uuid4())
        saved = store.apply_command(
            operator,
            command_id=command_id,
            surface="commerce",
            event_type="commerce.tax_configuration.saved",
            expected_version=initialized.version,
            payload=payload,
        )
        replay = store.apply_command(
            operator,
            command_id=command_id,
            surface="commerce",
            event_type="commerce.tax_configuration.saved",
            expected_version=initialized.version,
            payload=payload,
        )
        proof = saved.state["taxConfigurations"][0]["proof"]  # type: ignore[index]
        self.assertEqual(proof["actor"], operator.actor_id)
        self.assertNotEqual(proof["capturedAt"], "2099-01-01T00:00:00.000Z")
        self.assertTrue(replay.idempotent_replay)
        self.assertEqual(replay.state, saved.state)
        with self.assertRaises(TrialHumanApprovalRequired):
            store.apply_command(
                agent,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.tax_configuration.saved",
                expected_version=saved.version,
                payload=payload,
            )

    def test_account_mapping_is_versioned_human_only_and_server_attributed(self) -> None:
        current = catalog_state()
        next_state = deepcopy(current)
        next_state["accountMappingConfigurations"] = [account_mapping_configuration(1)]
        configured = apply_event(current, "commerce.account_mapping.saved", next_state)
        self.assertEqual(configured["accountMappingConfigurations"][0]["revision"], 1)  # type: ignore[index]

        unchanged = deepcopy(configured)
        unchanged["accountMappingConfigurations"] = [  # type: ignore[index]
            account_mapping_configuration(2, action_id="ACT-ACCOUNT-MAPPING-UNCHANGED"),
            *configured["accountMappingConfigurations"],  # type: ignore[index]
        ]
        with self.assertRaises(TrialValidationError):
            apply_event(configured, "commerce.account_mapping.saved", unchanged)

        malformed = deepcopy(configured)
        malformed["accountMappingConfigurations"] = [  # type: ignore[index]
            account_mapping_configuration(
                2,
                action_id="ACT-ACCOUNT-MAPPING-MALFORMED",
                sales_revenue="=FORMULA",
            ),
            *configured["accountMappingConfigurations"],  # type: ignore[index]
        ]
        with self.assertRaises(TrialValidationError):
            apply_event(configured, "commerce.account_mapping.saved", malformed)

        store = InMemoryTrialStore(reducer=reduce_trial_state)
        operator = TrialPrincipal("workspace-accounts", "operator-accounts", "human")
        agent = TrialPrincipal("workspace-accounts", "account-agent", "agent")
        for principal in (operator, agent):
            store.provision_membership(
                workspace_id=principal.workspace_id,
                actor_id=principal.actor_id,
                actor_kind=principal.actor_kind,
                capabilities=("commerce.write",),
            )
        initialized = store.apply_command(
            operator,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.workspace.initialized",
            expected_version=0,
            payload={"state": current, "evidence": action_evidence("ACT-INIT-ACCOUNTS")},
        )
        forged = deepcopy(initialized.state)
        forged["accountMappingConfigurations"] = [
            account_mapping_configuration(
                1,
                action_id="ACT-ACCOUNT-MAPPING-SERVER",
                captured_at="2099-01-01T00:00:00.000Z",
            )
        ]
        forged["accountMappingConfigurations"][0]["proof"]["actor"] = "forged-actor"  # type: ignore[index]
        payload = {
            "state": forged,
            "evidence": dict(forged["accountMappingConfigurations"][0]["proof"]),  # type: ignore[index,arg-type]
        }
        saved = store.apply_command(
            operator,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.account_mapping.saved",
            expected_version=initialized.version,
            payload=payload,
        )
        proof = saved.state["accountMappingConfigurations"][0]["proof"]  # type: ignore[index]
        self.assertEqual(proof["actor"], operator.actor_id)
        self.assertNotEqual(proof["capturedAt"], "2099-01-01T00:00:00.000Z")
        with self.assertRaises(TrialHumanApprovalRequired):
            store.apply_command(
                agent,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.account_mapping.saved",
                expected_version=saved.version,
                payload=payload,
            )

    def test_daily_close_export_is_deterministic_minimal_and_formula_safe(self) -> None:
        current = completed_state()
        current["orders"][0]["calculation"] = {  # type: ignore[index]
            "schema": "supermega.commerce.order-calculation.v1",
            "currency": "MMK",
            "catalogRevision": 0,
            "subtotalMmk": 200,
            "taxMode": "not_configured",
            "taxMmk": 0,
            "totalMmk": 200,
        }
        current["orders"][0].update(  # type: ignore[index]
            {
                "paymentReconciledAt": "2026-07-23T09:00:01.000Z",
                "paymentReconciliationActionId": "ACT-PAYMENT",
                "paymentReconciledBy": "OP-OWNER",
                "paymentEvidenceReference": "EV-ACT-PAYMENT",
            }
        )
        current = validate_commerce_state(current)
        next_state = deepcopy(current)
        backdated_state = deepcopy(current)
        backdated_state["closes"] = [close_record(current)]
        with self.assertRaises(TrialValidationError):
            apply_event(current, "commerce.close.saved", backdated_state)
        self.assertIsNone(commerce_daily_close_export(backdated_state, CLOSE_ID))

        close = close_record(current, captured_at="2026-07-23T10:00:00.000Z")
        close.update(
            {
                "operator": "OP-OWNER",
                "evidenceReference": "EV-ACCOUNTING-CLOSE-001",
            }
        )
        next_state["closes"] = [close]
        closed = apply_event(
            current,
            "commerce.close.saved",
            next_state,
            action_evidence(
                CLOSE_ACTION_ID,
                captured_at="2026-07-23T10:00:00.000Z",
                actor="OP-OWNER",
                evidence_reference="EV-ACCOUNTING-CLOSE-001",
            ),
        )

        artifact = commerce_daily_close_export(closed, CLOSE_ID)
        self.assertIsNotNone(artifact)
        assert artifact is not None
        self.assertEqual(artifact, commerce_daily_close_export(closed, CLOSE_ID))
        self.assertEqual(artifact["schema"], "supermega.commerce.daily-close-export.v3")
        self.assertEqual(artifact["orderCount"], 1)
        self.assertEqual(artifact["orders"][0]["calculationStatus"], "accepted")
        self.assertEqual(artifact["orders"][0]["subtotalMmk"], 200)
        self.assertEqual(artifact["orders"][0]["taxMode"], "not_configured")
        self.assertNotIn("customer", json.dumps(artifact))
        self.assertEqual(
            artifact["digest"],
            "sha256:7365e864485958b4fa104d3d73f31102a4a4814d64d820afdafb28eb801dc8ce",
        )

        csv_text = commerce_daily_close_csv(closed, CLOSE_ID)
        self.assertIsNotNone(csv_text)
        assert csv_text is not None
        self.assertIn('"record_type"', csv_text)
        self.assertIn('"accepted"', csv_text)
        self.assertNotIn("Customer ref", csv_text)
        self.assertEqual(csv_text.count("\r\n"), 3)

        unmapped_handoff = commerce_accounting_handoff(closed, CLOSE_ID)
        self.assertIsNotNone(unmapped_handoff)
        assert unmapped_handoff is not None
        self.assertEqual(unmapped_handoff["schema"], "supermega.commerce.accounting-handoff.v2")
        self.assertIsNone(unmapped_handoff["accountMappingRevision"])
        self.assertTrue(
            all(
                entry["mappingStatus"] == "unmapped"
                and entry["externalAccountCode"] is None
                for entry in unmapped_handoff["entries"]
            )
        )
        self.assertEqual(unmapped_handoff["totalDebitMmk"], unmapped_handoff["totalCreditMmk"])

        late_mapping = deepcopy(closed)
        late_mapping["accountMappingConfigurations"] = [
            account_mapping_configuration(
                1,
                action_id="ACT-ACCOUNT-MAPPING-LATE",
                captured_at="2026-07-23T10:01:00.000Z",
            )
        ]
        late_mapping = validate_commerce_state(late_mapping)
        historical_handoff = commerce_accounting_handoff(late_mapping, CLOSE_ID)
        self.assertIsNotNone(historical_handoff)
        assert historical_handoff is not None
        self.assertIsNone(historical_handoff["accountMappingRevision"])

        mapped_current = deepcopy(current)
        mapped_current["accountMappingConfigurations"] = [
            account_mapping_configuration(
                1,
                captured_at="2026-07-23T09:30:00.000Z",
            )
        ]
        mapped_current = apply_event(
            current,
            "commerce.account_mapping.saved",
            mapped_current,
        )
        mapped_next = deepcopy(mapped_current)
        mapped_next["closes"] = [close]
        mapped_closed = apply_event(
            mapped_current,
            "commerce.close.saved",
            mapped_next,
            action_evidence(
                CLOSE_ACTION_ID,
                captured_at="2026-07-23T10:00:00.000Z",
                actor="OP-OWNER",
                evidence_reference="EV-ACCOUNTING-CLOSE-001",
            ),
        )
        mapped_handoff = commerce_accounting_handoff(mapped_closed, CLOSE_ID)
        self.assertIsNotNone(mapped_handoff)
        assert mapped_handoff is not None
        self.assertEqual(mapped_handoff["accountMappingRevision"], 1)
        self.assertEqual(mapped_handoff["accountMappingEvidenceReference"], "EV-ACT-ACCOUNT-MAPPING-R1")
        self.assertTrue(
            all(
                entry["mappingStatus"] == "mapped"
                and entry["externalAccountCode"]
                for entry in mapped_handoff["entries"]
            )
        )
        self.assertEqual(mapped_handoff, commerce_accounting_handoff(mapped_closed, CLOSE_ID))
        mapped_csv = commerce_accounting_handoff_csv(mapped_handoff)
        self.assertIn('"1100-CLEAR"', mapped_csv)
        self.assertIn('"false"', mapped_csv)
        self.assertNotIn("Customer ref", mapped_csv)

        formula_state = deepcopy(closed)
        formula_state["closes"][0]["operator"] = "=2+2"  # type: ignore[index]
        formula_csv = commerce_daily_close_csv(formula_state, CLOSE_ID)
        self.assertIsNotNone(formula_csv)
        assert formula_csv is not None
        self.assertIn('"\'=2+2"', formula_csv)

        legacy_order_state = deepcopy(closed)
        del legacy_order_state["orders"][0]["calculation"]  # type: ignore[index]
        legacy_artifact = commerce_daily_close_export(legacy_order_state, CLOSE_ID)
        self.assertIsNotNone(legacy_artifact)
        assert legacy_artifact is not None
        self.assertEqual(legacy_artifact["orders"][0]["calculationStatus"], "legacy_unverified")
        self.assertIsNone(legacy_artifact["orders"][0]["subtotalMmk"])
        self.assertEqual(legacy_artifact["orders"][0]["taxMode"], "not_recorded")

        legacy_close_state = catalog_state()
        legacy_close_state["closes"] = [
            {"id": "CLOSE-LEGACY", "createdAt": NOW, "total": 0, "orders": 0}
        ]
        self.assertIsNone(commerce_daily_close_export(legacy_close_state, "CLOSE-LEGACY"))
        self.assertIsNone(commerce_daily_close_csv(legacy_close_state, "CLOSE-LEGACY"))

    def test_cancellation_releases_once_and_preserves_refund_exception(self) -> None:
        current = created_state("ORD-CANCEL")
        reconciled = deepcopy(current)
        reconciled["orders"][0].update(  # type: ignore[index]
            {
                "paymentStatus": "reconciled",
                "paymentReconciledAt": NOW,
                "paymentReconciliationActionId": "ACT-PAY-CANCEL",
                "paymentReconciledBy": "Accountable operator",
                "paymentReconciliationReason": "Matched payment before cancellation.",
                "paymentEvidenceReference": "EV-PAY-CANCEL",
            }
        )
        current = apply_event(current, "commerce.payment.reconciled", reconciled)

        cancelled = deepcopy(current)
        cancelled["items"][0]["onHand"] = 10  # type: ignore[index]
        cancelled["orders"][0].update({"status": "cancelled", "refundStatus": "due"})  # type: ignore[index]
        cancelled["movements"] = [
            movement("release", "ACT-CANCEL", 2, order_id="ORD-CANCEL"),
            *current["movements"],  # type: ignore[misc]
        ]
        result = apply_event(current, "commerce.order.cancelled", cancelled)
        self.assertEqual(result["orders"][0]["refundStatus"], "due")  # type: ignore[index]

        with self.assertRaises(TrialValidationError):
            apply_event(result, "commerce.order.cancelled", cancelled)

    def test_refund_states_require_exact_complete_unique_settlement_evidence(self) -> None:
        legacy_none = created_state("ORD-NONE")
        legacy_due = cancelled_due_state(("ORD-DUE",))
        self.assertEqual(
            validate_commerce_state(legacy_none)["orders"][0]["refundStatus"],  # type: ignore[index]
            "none",
        )
        self.assertEqual(
            validate_commerce_state(legacy_due)["orders"][0]["refundStatus"],  # type: ignore[index]
            "due",
        )

        settled = settled_refund_state(legacy_due)
        validated = validate_commerce_state(settled)
        self.assertEqual(validated["orders"][0]["refundStatus"], "settled")  # type: ignore[index]
        settlement_fields = (
            "refundSettledAt",
            "refundSettlementActionId",
            "refundSettledBy",
            "refundSettlementReason",
            "refundEvidenceReference",
        )
        for field in settlement_fields:
            with self.subTest(missing=field):
                incomplete = deepcopy(settled)
                del incomplete["orders"][0][field]  # type: ignore[index]
                with self.assertRaises(TrialValidationError):
                    validate_commerce_state(incomplete)

        for legacy in (legacy_none, legacy_due):
            with self.subTest(refund_status=legacy["orders"][0]["refundStatus"]):  # type: ignore[index]
                unexpected_proof = deepcopy(legacy)
                unexpected_proof["orders"][0]["refundSettledAt"] = NOW  # type: ignore[index]
                with self.assertRaises(TrialValidationError):
                    validate_commerce_state(unexpected_proof)

        invalid_timestamp = deepcopy(settled)
        invalid_timestamp["orders"][0]["refundSettledAt"] = "2026-07-23T09:00:00"  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(invalid_timestamp)

        unsupported_field = deepcopy(settled)
        unsupported_field["orders"][0]["refundProvider"] = "not-in-contract"  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(unsupported_field)

        active_settlement = deepcopy(settled)
        active_settlement["orders"][0]["status"] = "confirmed"  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(active_settlement)

        missing_refund_exception = deepcopy(legacy_due)
        missing_refund_exception["orders"][0]["refundStatus"] = "none"  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(missing_refund_exception)

        cross_proof_collision = deepcopy(settled)
        cross_proof_collision["orders"][0]["refundSettlementActionId"] = (  # type: ignore[index]
            cross_proof_collision["orders"][0]["paymentReconciliationActionId"]  # type: ignore[index]
        )
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(cross_proof_collision)

        duplicate_refunds = cancelled_due_state(("ORD-REFUND-A", "ORD-REFUND-B"))
        duplicate_refunds = settled_refund_state(
            duplicate_refunds,
            order_index=0,
            action_id="ACT-REFUND-DUPLICATE",
        )
        duplicate_refunds = settled_refund_state(
            duplicate_refunds,
            order_index=1,
            action_id="ACT-REFUND-DUPLICATE",
        )
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(duplicate_refunds)

    def test_refund_settlement_changes_one_due_order_and_matches_exact_command_proof(self) -> None:
        current = cancelled_due_state(("ORD-REFUND", "ORD-OTHER"))
        next_state = settled_refund_state(current)
        proof = evidence_for("commerce.refund.settled", next_state)
        result = apply_event(
            current,
            "commerce.refund.settled",
            next_state,
            proof,
        )

        self.assertEqual(result["orders"][0]["refundStatus"], "settled")  # type: ignore[index]
        self.assertEqual(result["orders"][1], current["orders"][1])  # type: ignore[index]
        for collection in ("items", "movements", "closes"):
            self.assertEqual(result[collection], current[collection])

        mismatches = {
            "actionId": "ACT-REFUND-OTHER",
            "capturedAt": "2026-07-23T09:01:00.000Z",
            "actor": "Different accountable operator",
            "reason": "Different settlement reason.",
            "evidenceReference": "EV-REFUND-OTHER",
        }
        for field, value in mismatches.items():
            with self.subTest(evidence_field=field):
                changed_proof = {**proof, field: value}
                with self.assertRaises(TrialValidationError):
                    apply_event(
                        current,
                        "commerce.refund.settled",
                        next_state,
                        changed_proof,
                    )

        changed_order_data = deepcopy(next_state)
        changed_order_data["orders"][0]["customer"] = "Changed customer"  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.refund.settled",
                changed_order_data,
            )

        changed_other_order = deepcopy(next_state)
        changed_other_order["orders"][1]["customer"] = "Changed other customer"  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.refund.settled",
                changed_other_order,
            )

        changed_inventory = deepcopy(next_state)
        changed_inventory["items"][0]["onHand"] = 9  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.refund.settled",
                changed_inventory,
            )

        already_settled = deepcopy(result)
        already_settled["orders"][0]["refundSettlementReason"] = "Second settlement."  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(
                result,
                "commerce.refund.settled",
                already_settled,
            )

        prior_settlement = cancelled_due_state(("ORD-DUE-NOW", "ORD-SETTLED-EARLIER"))
        prior_settlement = settled_refund_state(
            prior_settlement,
            order_index=1,
            action_id="ACT-REFUND-EARLIER",
        )
        new_settlement = settled_refund_state(
            prior_settlement,
            order_index=0,
            action_id="ACT-REFUND-NOW",
        )
        prior_order = prior_settlement["orders"][1]  # type: ignore[index]
        prior_proof = {
            "actionId": prior_order["refundSettlementActionId"],
            "capturedAt": prior_order["refundSettledAt"],
            "actor": prior_order["refundSettledBy"],
            "reason": prior_order["refundSettlementReason"],
            "evidenceReference": prior_order["refundEvidenceReference"],
        }
        with self.assertRaises(TrialValidationError):
            apply_event(
                prior_settlement,
                "commerce.refund.settled",
                new_settlement,
                prior_proof,  # type: ignore[arg-type]
            )

    def test_daily_close_keeps_due_refunds_open_and_excludes_settled_refunds(self) -> None:
        current = cancelled_due_state(("ORD-DUE", "ORD-SETTLED"))
        current = settled_refund_state(
            current,
            order_index=1,
            action_id="ACT-REFUND-CLOSE",
        )
        close = close_record(current, CLOSE_ACTION_ID_2, close_id=CLOSE_ID_2)
        self.assertEqual(close["paymentExceptionOrderIds"], ["ORD-DUE"])

        next_state = deepcopy(current)
        next_state["closes"] = [close]
        accepted = apply_event(current, "commerce.close.saved", next_state)
        self.assertEqual(
            accepted["closes"][0]["paymentExceptionOrderIds"],  # type: ignore[index]
            ["ORD-DUE"],
        )

        wrong_exceptions = deepcopy(next_state)
        wrong_exceptions["closes"][0]["paymentExceptionOrderIds"] = [  # type: ignore[index]
            "ORD-DUE",
            "ORD-SETTLED",
        ]
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.close.saved",
                wrong_exceptions,
            )

    def test_refund_settlement_store_replay_is_exact_human_only_and_workspace_scoped(self) -> None:
        store = InMemoryTrialStore(reducer=reduce_trial_state)
        operator = TrialPrincipal("workspace-refund", "Accountable operator", "human")
        other_operator = TrialPrincipal("workspace-other", "Other operator", "human")
        agent = TrialPrincipal("workspace-refund", "refund-agent", "agent")
        for principal in (operator, other_operator, agent):
            store.provision_membership(
                workspace_id=principal.workspace_id,
                actor_id=principal.actor_id,
                actor_kind=principal.actor_kind,
                capabilities=("commerce.write",),
            )

        initialized = store.apply_command(
            operator,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.workspace.initialized",
            expected_version=0,
            payload={
                "state": catalog_state(),
                "evidence": action_evidence("ACT-STORE-INIT"),
            },
        )
        other_initialized = store.apply_command(
            other_operator,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.workspace.initialized",
            expected_version=0,
            payload={
                "state": catalog_state(),
                "evidence": action_evidence(
                    "ACT-OTHER-INIT",
                    actor=other_operator.actor_id,
                ),
            },
        )
        created_state_value = created_state("ORD-STORE-REFUND")
        created_state_value["orders"][0]["promisedAt"] = (  # type: ignore[index]
            "2099-01-02T00:00:00.000Z"
        )
        created = store.apply_command(
            operator,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.order.created",
            expected_version=initialized.version,
            payload={
                "state": created_state_value,
                "evidence": evidence_for(
                    "commerce.order.created",
                    created_state_value,
                ),
            },
        )
        reconciled_state = deepcopy(created.state)
        reconciled_state["orders"][0].update(  # type: ignore[index]
            {
                "paymentStatus": "reconciled",
                "paymentReconciledAt": NOW,
                "paymentReconciliationActionId": "ACT-STORE-REFUND-PAYMENT",
                "paymentReconciledBy": operator.actor_id,
                "paymentReconciliationReason": "Matched payment before cancellation.",
                "paymentEvidenceReference": "EV-STORE-REFUND-PAYMENT",
            }
        )
        reconciled = store.apply_command(
            operator,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.payment.reconciled",
            expected_version=created.version,
            payload={
                "state": reconciled_state,
                "evidence": evidence_for(
                    "commerce.payment.reconciled",
                    reconciled_state,
                ),
            },
        )
        cancelled_state = deepcopy(reconciled.state)
        cancelled_state["items"][0]["onHand"] = 10  # type: ignore[index]
        cancelled_state["orders"][0].update(  # type: ignore[index]
            {"status": "cancelled", "refundStatus": "due"}
        )
        cancelled_state["movements"] = [
            movement(
                "release",
                "ACT-STORE-REFUND-CANCEL",
                2,
                order_id="ORD-STORE-REFUND",
            ),
            *reconciled.state["movements"],  # type: ignore[misc]
        ]
        cancelled = store.apply_command(
            operator,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.order.cancelled",
            expected_version=reconciled.version,
            payload={
                "state": cancelled_state,
                "evidence": evidence_for(
                    "commerce.order.cancelled",
                    cancelled_state,
                ),
            },
        )
        settled_state = settled_refund_state(
            cancelled.state,
            action_id="ACT-STORE-REFUND-SETTLED",
            actor=operator.actor_id,
        )
        settlement_payload = {
            "state": settled_state,
            "evidence": evidence_for(
                "commerce.refund.settled",
                settled_state,
            ),
        }
        settlement_command_id = str(uuid4())
        settled = store.apply_command(
            operator,
            command_id=settlement_command_id,
            surface="commerce",
            event_type="commerce.refund.settled",
            expected_version=cancelled.version,
            payload=settlement_payload,
        )
        replay = store.apply_command(
            operator,
            command_id=settlement_command_id,
            surface="commerce",
            event_type="commerce.refund.settled",
            expected_version=cancelled.version,
            payload=settlement_payload,
        )

        self.assertEqual(settled.state["orders"][0], settled_state["orders"][0])  # type: ignore[index]
        self.assertTrue(replay.idempotent_replay)
        self.assertEqual(replay.state, settled.state)
        other_state = store.get_state(other_operator, "commerce")
        self.assertEqual(other_state.version, other_initialized.version)
        self.assertEqual(other_state.state, other_initialized.state)

        changed_payload = deepcopy(settlement_payload)
        changed_payload["evidence"]["reason"] = "Changed replay reason."  # type: ignore[index]
        changed_payload["state"]["orders"][0][  # type: ignore[index]
            "refundSettlementReason"
        ] = "Changed replay reason."
        with self.assertRaises(TrialIdempotencyConflict):
            store.apply_command(
                operator,
                command_id=settlement_command_id,
                surface="commerce",
                event_type="commerce.refund.settled",
                expected_version=cancelled.version,
                payload=changed_payload,
            )

        with self.assertRaises(TrialHumanApprovalRequired):
            store.apply_command(
                agent,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.refund.settled",
                expected_version=settled.version,
                payload=settlement_payload,
            )
        other_state_after = store.get_state(other_operator, "commerce")
        self.assertEqual(other_state_after.version, other_initialized.version)
        self.assertEqual(other_state_after.state, other_initialized.state)

    def test_store_preserves_revision_idempotency_and_authenticated_audit_actor(self) -> None:
        store = InMemoryTrialStore(reducer=reduce_trial_state)
        principal = TrialPrincipal("workspace-a", "user-a", "human")
        store.provision_membership(
            workspace_id=principal.workspace_id,
            actor_id=principal.actor_id,
            actor_kind=principal.actor_kind,
            capabilities=("commerce.write",),
        )
        initialize_id = str(uuid4())
        initialized = store.apply_command(
            principal,
            command_id=initialize_id,
            surface="commerce",
            event_type="commerce.workspace.initialized",
            expected_version=0,
            payload={"state": catalog_state(), "evidence": action_evidence("ACT-INITIALIZE")},
        )
        replay = store.apply_command(
            principal,
            command_id=initialize_id,
            surface="commerce",
            event_type="commerce.workspace.initialized",
            expected_version=0,
            payload={"state": catalog_state(), "evidence": action_evidence("ACT-INITIALIZE")},
        )
        forged_created_state = created_state()
        forged_created_state["orders"][0]["createdAt"] = (  # type: ignore[index]
            "2099-01-01T00:00:00.000Z"
        )
        forged_created_state["orders"][0]["promisedAt"] = (  # type: ignore[index]
            "2099-01-02T00:00:00.000Z"
        )
        forged_created_state["orders"][0]["owner"] = "Fabricated Order Bot"  # type: ignore[index]
        forged_created_state["movements"][0].update(  # type: ignore[index]
            {
                "createdAt": "2099-01-01T00:00:00.000Z",
                "actor": "Fabricated Order Bot",
            }
        )
        created = store.apply_command(
            principal,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.order.created",
            expected_version=initialized.version,
            payload={
                "state": forged_created_state,
                "evidence": evidence_for(
                    "commerce.order.created",
                    forged_created_state,
                ),
            },
        )

        self.assertEqual(initialized.version, 1)
        self.assertTrue(replay.idempotent_replay)
        self.assertEqual(created.version, 2)
        stored = store.get_state(principal, "commerce")
        self.assertEqual(stored.updated_by, principal.actor_id)
        self.assertNotEqual(
            stored.state["orders"][0]["createdAt"],  # type: ignore[index]
            "2099-01-01T00:00:00.000Z",
        )
        self.assertEqual(
            stored.state["orders"][0]["createdAt"],  # type: ignore[index]
            stored.state["movements"][0]["createdAt"],  # type: ignore[index]
        )
        self.assertEqual(
            stored.state["movements"][0]["actor"],  # type: ignore[index]
            principal.actor_id,
        )
        self.assertEqual(
            stored.state["orders"][0]["owner"],  # type: ignore[index]
            principal.actor_id,
        )

        preparing_state = deepcopy(created.state)
        preparing_state["orders"][0].update(  # type: ignore[index]
            {
                "status": "preparing",
                "advancementActionIds": ["ACT-STORE-PREPARING"],
            }
        )
        preparing = store.apply_command(
            principal,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.order.advanced",
            expected_version=created.version,
            payload={
                "state": preparing_state,
                "evidence": action_evidence("ACT-STORE-PREPARING"),
            },
        )
        reconciled_state = deepcopy(preparing.state)
        reconciled_state["orders"][0].update(  # type: ignore[index]
            {
                "paymentStatus": "reconciled",
                "paymentReconciledAt": "2099-01-01T00:00:00.000Z",
                "paymentReconciliationActionId": "ACT-STORE-PAYMENT",
                "paymentReconciledBy": "Fabricated Payments Bot",
                "paymentReconciliationReason": "Matched the settlement record.",
                "paymentEvidenceReference": "EV-STORE-PAYMENT",
            }
        )
        reconciled = store.apply_command(
            principal,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.payment.reconciled",
            expected_version=preparing.version,
            payload={
                "state": reconciled_state,
                "evidence": evidence_for(
                    "commerce.payment.reconciled",
                    reconciled_state,
                ),
            },
        )
        self.assertNotEqual(
            reconciled.state["orders"][0]["paymentReconciledAt"],  # type: ignore[index]
            "2099-01-01T00:00:00.000Z",
        )
        self.assertEqual(
            reconciled.state["orders"][0]["paymentReconciledBy"],  # type: ignore[index]
            principal.actor_id,
        )
        ready_state = deepcopy(reconciled.state)
        ready_state["orders"][0].update(  # type: ignore[index]
            {
                "status": "ready",
                "advancementActionIds": [
                    "ACT-STORE-PREPARING",
                    "ACT-STORE-READY",
                ],
            }
        )
        ready = store.apply_command(
            principal,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.order.advanced",
            expected_version=reconciled.version,
            payload={
                "state": ready_state,
                "evidence": action_evidence("ACT-STORE-READY"),
            },
        )
        completed_state = deepcopy(ready.state)
        completion_evidence = action_evidence("ACT-STORE-COMPLETED")
        completed_state["orders"][0].update(  # type: ignore[index]
            {
                "status": "completed",
                "completion": completion_evidence,
            }
        )
        malformed_completion_state = deepcopy(completed_state)
        malformed_completion_state["movements"] = None
        with self.assertRaises(TrialValidationError):
            store.apply_command(
                principal,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.order.advanced",
                expected_version=ready.version,
                payload={
                    "state": malformed_completion_state,
                    "evidence": completion_evidence,
                },
            )
        completed = store.apply_command(
            principal,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.order.advanced",
            expected_version=ready.version,
            payload={
                "state": completed_state,
                "evidence": completion_evidence,
            },
        )
        forged_return_state = returned_state(
            completed.state,
            action_id="ACT-STORE-RETURN",
            captured_at="2099-01-01T00:00:00.000Z",
        )
        forged_return = forged_return_state["orders"][0]["returns"][0]  # type: ignore[index]
        forged_return_movement = forged_return_state["movements"][0]  # type: ignore[index]
        forged_return["actor"] = "Fabricated Returns Bot"
        forged_return_movement["actor"] = "Fabricated Returns Bot"
        forged_return_payload = {
            "state": forged_return_state,
            "evidence": evidence_for(
                "commerce.order.return_recorded",
                forged_return_state,
            ),
        }
        return_command_id = str(uuid4())
        returned = store.apply_command(
            principal,
            command_id=return_command_id,
            surface="commerce",
            event_type="commerce.order.return_recorded",
            expected_version=completed.version,
            payload=forged_return_payload,
        )
        return_replay = store.apply_command(
            principal,
            command_id=return_command_id,
            surface="commerce",
            event_type="commerce.order.return_recorded",
            expected_version=completed.version,
            payload=forged_return_payload,
        )
        authoritative_return = returned.state["orders"][0]["returns"][0]  # type: ignore[index]
        authoritative_return_movement = returned.state["movements"][0]  # type: ignore[index]
        self.assertEqual(authoritative_return["actor"], principal.actor_id)
        self.assertEqual(authoritative_return_movement["actor"], principal.actor_id)
        self.assertNotEqual(
            authoritative_return["createdAt"],
            "2099-01-01T00:00:00.000Z",
        )
        self.assertEqual(returned.state["items"][0]["onHand"], 9)  # type: ignore[index]
        self.assertTrue(return_replay.idempotent_replay)
        self.assertEqual(return_replay.version, returned.version)

        forged_correction_state = corrected_state(
            returned.state,
            action_id="ACT-STORE-CORRECTION",
            captured_at="2099-01-01T00:00:00.000Z",
        )
        forged_correction = forged_correction_state["orders"][0]["corrections"][0]  # type: ignore[index]
        forged_correction["actor"] = "Fabricated Finance Bot"
        correction_payload = {
            "state": forged_correction_state,
            "evidence": evidence_for(
                "commerce.order.correction_recorded",
                forged_correction_state,
            ),
        }
        correction_command_id = str(uuid4())
        corrected = store.apply_command(
            principal,
            command_id=correction_command_id,
            surface="commerce",
            event_type="commerce.order.correction_recorded",
            expected_version=returned.version,
            payload=correction_payload,
        )
        correction_replay = store.apply_command(
            principal,
            command_id=correction_command_id,
            surface="commerce",
            event_type="commerce.order.correction_recorded",
            expected_version=returned.version,
            payload=correction_payload,
        )
        authoritative_correction = corrected.state["orders"][0]["corrections"][0]  # type: ignore[index]
        self.assertEqual(authoritative_correction["actor"], principal.actor_id)
        self.assertNotEqual(
            authoritative_correction["createdAt"],
            "2099-01-01T00:00:00.000Z",
        )
        self.assertEqual(authoritative_correction["balanceAfterMmk"], 150)
        self.assertTrue(correction_replay.idempotent_replay)
        self.assertEqual(correction_replay.version, corrected.version)

        forged_close_state = deepcopy(corrected.state)
        forged_close = close_record(
            corrected.state,
            CLOSE_ACTION_ID,
            close_id=CLOSE_ID,
            captured_at="2099-01-01T00:00:00.000Z",
        )
        forged_close["operator"] = "Fabricated CFO"
        forged_close_state["closes"] = [forged_close]
        forged_payload = {
            "state": forged_close_state,
            "evidence": evidence_for("commerce.close.saved", forged_close_state),
        }
        close_command_id = str(uuid4())
        closed = store.apply_command(
            principal,
            command_id=close_command_id,
            surface="commerce",
            event_type="commerce.close.saved",
            expected_version=corrected.version,
            payload=forged_payload,
        )
        close_replay = store.apply_command(
            principal,
            command_id=close_command_id,
            surface="commerce",
            event_type="commerce.close.saved",
            expected_version=corrected.version,
            payload=forged_payload,
        )
        authoritative_close = closed.state["closes"][0]  # type: ignore[index]
        self.assertEqual(authoritative_close["operator"], principal.actor_id)
        self.assertNotEqual(authoritative_close["createdAt"], "2099-01-01T00:00:00.000Z")
        self.assertEqual(
            authoritative_close["businessDate"],
            myanmar_business_date(authoritative_close["createdAt"]),
        )
        self.assertEqual(authoritative_close["orderIds"], ["ORD-1"])
        self.assertEqual(authoritative_close["total"], 150)
        self.assertTrue(close_replay.idempotent_replay)
        self.assertEqual(close_replay.state, closed.state)

    def test_unknown_fields_and_legacy_snapshot_event_fail_closed(self) -> None:
        invalid = catalog_state()
        invalid["untrusted"] = True
        with self.assertRaises(TrialValidationError):
            apply_event({}, "commerce.workspace.initialized", invalid)
        with self.assertRaises(TrialValidationError):
            apply_event({}, "commerce.snapshot.saved", catalog_state())

    def test_service_schedule_is_versioned_inside_commerce_and_fails_closed(self) -> None:
        current = catalog_state()
        schedule = {
            "schema": "supermega.shop.service_schedule.v2",
            "industryPackId": "spa",
            "revision": 1,
            "services": [
                {
                    "id": "service-session",
                    "name": "Standard treatment",
                    "durationMinutes": 60,
                    "priceMmk": 45000,
                    "active": True,
                }
            ],
            "resources": [
                {
                    "id": "resource-room-1",
                    "name": "Treatment room 1",
                    "kind": "room",
                    "active": True,
                }
            ],
            "bookings": [
                {
                    "id": "booking-0001",
                    "customerName": "Client A",
                    "contact": "09-111-111",
                    "serviceId": "service-session",
                    "resourceId": "resource-room-1",
                    "startsAt": "2026-07-29T04:30:00.000Z",
                    "endsAt": "2026-07-29T05:30:00.000Z",
                    "status": "held",
                    "note": "",
                    "createdAt": "2026-07-29T04:00:00.000Z",
                    "updatedAt": "2026-07-29T04:00:00.000Z",
                }
            ],
            "events": [
                {
                    "revision": 1,
                    "type": "booking_scheduled",
                    "subjectId": "booking-0001",
                    "actor": "operator-1",
                    "reason": "Scheduled from the Shop appointment workspace.",
                    "happenedAt": "2026-07-29T04:00:00.000Z",
                }
            ],
        }
        first = {**current, "serviceSchedule": schedule}
        first_evidence = {
            "actionId": "ACT-SERVICE-SCHEDULE-R1",
            "capturedAt": "2026-07-29T04:00:00.000Z",
            "actor": "operator-1",
            "reason": "Scheduled from the Shop appointment workspace.",
            "evidenceReference": "SHOP-SERVICE-SCHEDULE:R1",
        }
        accepted = apply_event(
            current,
            "commerce.service_schedule.saved",
            first,
            first_evidence,
        )
        self.assertEqual(accepted["serviceSchedule"], schedule)

        confirmed_schedule = deepcopy(schedule)
        confirmed_schedule["revision"] = 2
        confirmed_schedule["bookings"][0]["status"] = "confirmed"
        confirmed_schedule["bookings"][0]["updatedAt"] = "2026-07-29T04:05:00.000Z"
        confirmed_schedule["events"].append(
            {
                "revision": 2,
                "type": "booking_advanced",
                "subjectId": "booking-0001",
                "actor": "operator-1",
                "reason": "Advanced by the responsible Shop operator.",
                "happenedAt": "2026-07-29T04:05:00.000Z",
            }
        )
        confirmed = apply_event(
            accepted,
            "commerce.service_schedule.saved",
            {**accepted, "serviceSchedule": confirmed_schedule},
            {
                "actionId": "ACT-SERVICE-SCHEDULE-R2",
                "capturedAt": "2026-07-29T04:05:00.000Z",
                "actor": "operator-1",
                "reason": "Advanced by the responsible Shop operator.",
                "evidenceReference": "SHOP-SERVICE-SCHEDULE:R2",
            },
        )
        self.assertEqual(confirmed["serviceSchedule"]["bookings"][0]["status"], "confirmed")

        tampered = deepcopy(confirmed_schedule)
        tampered["bookings"][0]["customerName"] = "Rewritten history"
        with self.assertRaises(TrialValidationError):
            apply_event(
                accepted,
                "commerce.service_schedule.saved",
                {**accepted, "serviceSchedule": tampered},
                {
                    "actionId": "ACT-SERVICE-SCHEDULE-R2",
                    "capturedAt": "2026-07-29T04:05:00.000Z",
                    "actor": "operator-1",
                    "reason": "Advanced by the responsible Shop operator.",
                    "evidenceReference": "SHOP-SERVICE-SCHEDULE:R2",
                },
            )

        overlap = deepcopy(schedule)
        overlap["revision"] = 2
        overlap["bookings"].append({**overlap["bookings"][0], "id": "booking-0002"})
        overlap["events"].append(
            {
                "revision": 2,
                "type": "booking_scheduled",
                "subjectId": "booking-0002",
                "actor": "operator-1",
                "reason": "Conflicting booking.",
                "happenedAt": "2026-07-29T04:06:00.000Z",
            }
        )
        with self.assertRaises(TrialValidationError):
            validate_commerce_state({**current, "serviceSchedule": overlap})

        wrong_duration = deepcopy(schedule)
        wrong_duration["bookings"][0]["endsAt"] = "2026-07-29T05:00:00.000Z"
        with self.assertRaises(TrialValidationError):
            validate_commerce_state({**current, "serviceSchedule": wrong_duration})


if __name__ == "__main__":
    unittest.main()
