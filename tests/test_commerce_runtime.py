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
    commerce_order_acknowledgement,
    commerce_order_acknowledgement_text,
    commerce_order_calculation_digest,
    commerce_shop_demand_intelligence,
    commerce_shop_procurement_decision,
    commerce_storefront_preview_digest,
    commerce_supplier_invoice_match,
    commerce_supplier_payables_handoff,
    commerce_supplier_payables_handoff_csv,
    commerce_supplier_payables_aging,
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
    rejected_quantity: int | None = None,
    discrepancy_code: str | None = None,
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
    if rejected_quantity is not None:
        record["rejectedQuantity"] = rejected_quantity
        record["discrepancyCode"] = discrepancy_code or "damaged"
        record["discrepancyDisposition"] = "return_to_vendor"
    return record


def purchase_order_record(
    *,
    purchase_order_id: str = PURCHASE_ORDER_ID,
    action_id: str = "ACT-PURCHASE-CREATE",
    quantity: int = 10,
    captured_at: str = NOW,
    expected_at: str = PURCHASE_ORDER_EXPECTED_AT,
    unit_cost_mmk: int = 75,
    actor: str = "Accountable operator",
) -> dict[str, object]:
    return {
        "id": purchase_order_id,
        "createdAt": captured_at,
        "expectedAt": expected_at,
        "supplier": "Yangon Supply",
        "sku": "SKU-1",
        "quantityOrdered": quantity,
        "unitCostMmk": unit_cost_mmk,
        "creation": action_evidence(action_id, captured_at=captured_at, actor=actor),
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


def purchase_requisition_record(
    *,
    requisition_id: str = "PR-00000000-0000-4000-8000-000000000019",
    action_id: str = "ACT-PURCHASE-REQUISITION-APPROVE",
    captured_at: str = NOW,
    expected_at: str = PURCHASE_ORDER_EXPECTED_AT,
    quantity: int = 10,
    unit_cost_mmk: int = 75,
    actor: str = "Accountable operator",
    budget_envelope_id: str | None = None,
    source_sourcing_decision_id: str | None = None,
) -> dict[str, object]:
    requisition: dict[str, object] = {
        "id": requisition_id,
        "createdAt": captured_at,
        "expectedAt": expected_at,
        "supplier": "Yangon Supply",
        "sku": "SKU-1",
        "quantityRequested": quantity,
        "unitCostMmk": unit_cost_mmk,
        "totalMmk": quantity * unit_cost_mmk,
        "sourceDecisionDigest": f"sha256:{'1' * 64}",
        "sourceReplenishmentDigest": f"sha256:{'2' * 64}",
        "approval": action_evidence(action_id, captured_at=captured_at, actor=actor),
    }
    if budget_envelope_id:
        requisition["budgetEnvelopeId"] = budget_envelope_id
    if source_sourcing_decision_id:
        requisition["sourceSourcingDecisionId"] = source_sourcing_decision_id
    return requisition


def supplier_sourcing_decision_record(
    *,
    decision_id: str = "SSD-00000000-0000-4000-8000-000000000017",
    action_id: str = "ACT-SUPPLIER-SOURCING-APPROVE",
    captured_at: str = NOW,
    quantity: int = 10,
    selected_quote_reference: str = "YS-Q-2026-0017",
    unit_cost_tolerance_basis_points: int = 0,
    delivery_tolerance_days: int = 0,
    actor: str = "Accountable operator",
) -> dict[str, object]:
    return {
        "id": decision_id,
        "createdAt": captured_at,
        "sku": "SKU-1",
        "quantity": quantity,
        "quotes": [
            {
                "supplier": "Yangon Supply",
                "quoteReference": "YS-Q-2026-0017",
                "vendorApprovalReference": "SPP-SKU1-001",
                "unitCostMmk": 75,
                "deliveryAt": PURCHASE_ORDER_EXPECTED_AT,
                "validUntil": "2026-08-23T09:00:00.000Z",
            },
            {
                "supplier": "Mandalay Supply",
                "quoteReference": "MS-Q-2026-0017",
                "vendorApprovalReference": "SPP-SKU1-002",
                "unitCostMmk": 80,
                "deliveryAt": "2026-07-24T09:00:00.000Z",
                "validUntil": "2026-08-23T09:00:00.000Z",
            },
        ],
        "selectedQuoteReference": selected_quote_reference,
        "unitCostToleranceBasisPoints": unit_cost_tolerance_basis_points,
        "deliveryToleranceDays": delivery_tolerance_days,
        "approval": action_evidence(action_id, captured_at=captured_at, actor=actor),
    }


def purchase_budget_envelope_record(
    *,
    envelope_id: str = "PBE-00000000-0000-4000-8000-000000000018",
    action_id: str = "ACT-PURCHASE-BUDGET-APPROVE",
    captured_at: str = NOW,
    period_end: str = "2027-07-23T09:00:00.000Z",
    ceiling_mmk: int = 5_000,
    per_requisition_limit_mmk: int = 1_000,
    actor: str = "Accountable operator",
) -> dict[str, object]:
    return {
        "id": envelope_id,
        "createdAt": captured_at,
        "budgetCode": "SHOP-STOCK-2026",
        "label": "Stock replenishment",
        "periodStart": captured_at,
        "periodEnd": period_end,
        "ceilingMmk": ceiling_mmk,
        "perRequisitionLimitMmk": per_requisition_limit_mmk,
        "approval": action_evidence(action_id, captured_at=captured_at, actor=actor),
    }


def supplier_invoice_record(
    *,
    action_id: str = "ACT-SUPPLIER-INVOICE-RECORD",
    captured_at: str = "2026-07-23T09:30:00.000Z",
    quantity: int = 10,
    unit_cost_mmk: int = 75,
) -> dict[str, object]:
    return {
        "id": "PINV-00000000-0000-4000-8000-000000000030",
        "supplierReference": "YS-INV-2026-0030",
        "issuedAt": "2026-07-23T09:20:00.000Z",
        "dueAt": "2026-08-22T09:20:00.000Z",
        "quantityInvoiced": quantity,
        "unitCostMmk": unit_cost_mmk,
        "totalMmk": quantity * unit_cost_mmk,
        "recording": action_evidence(action_id, captured_at=captured_at),
    }


def supplier_return_claim_record(
    receipt_movement_id: str,
    *,
    action_id: str = "ACT-SUPPLIER-RETURN-AUTHORIZE",
    captured_at: str = "2026-07-23T09:50:00.000Z",
    rejected_quantity: int = 2,
    unit_cost_mmk: int = 75,
) -> dict[str, object]:
    return {
        "id": "SRET-00000000-0000-4000-8000-000000000031",
        "createdAt": captured_at,
        "receiptMovementId": receipt_movement_id,
        "quantityRejected": rejected_quantity,
        "reasonCode": "damaged",
        "claimAmountMmk": rejected_quantity * unit_cost_mmk,
        "internalReturnReference": "RET-YS-2026-0031",
        "physicalReturnStatus": "not_dispatched",
        "supplierContacted": False,
        "accountingPosted": False,
        "authorization": action_evidence(action_id, captured_at=captured_at),
        "creditNotes": [],
    }


def supplier_credit_note_record(
    *,
    action_id: str = "ACT-SUPPLIER-CREDIT-RECORD",
    captured_at: str = "2026-07-23T10:00:00.000Z",
    issued_at: str = "2026-07-23T09:55:00.000Z",
    amount_mmk: int = 150,
) -> dict[str, object]:
    return {
        "id": "SCN-00000000-0000-4000-8000-000000000032",
        "supplierReference": "YS-CN-2026-0032",
        "issuedAt": issued_at,
        "amountMmk": amount_mmk,
        "accountingPosted": False,
        "recording": action_evidence(action_id, captured_at=captured_at),
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
    sales_adjustment: str = "4200-ADJUST",
    correction_receivable: str = "1200-CORR-AR",
    correction_payable: str = "2200-CORR-AP",
    legacy: bool = False,
) -> dict[str, object]:
    mappings = [
        {"accountRole": "payment_clearing", "externalAccountCode": payment_clearing},
        {"accountRole": "sales_revenue", "externalAccountCode": sales_revenue},
        {"accountRole": "sales_revenue_unverified", "externalAccountCode": legacy_revenue},
        {"accountRole": "tax_payable", "externalAccountCode": tax_payable},
        {"accountRole": "sales_adjustment", "externalAccountCode": sales_adjustment},
        {"accountRole": "correction_receivable", "externalAccountCode": correction_receivable},
        {"accountRole": "correction_payable", "externalAccountCode": correction_payable},
    ]
    return {
        "revision": revision,
        "mappings": mappings[:4] if legacy else mappings,
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
        customer_profile_input={
            "name": "Customer A",
            "phone": "09 123 456 789",
            "previous": None,
        },
        delivery_address_input={
            "line1": "12 Insein Road, Ward 3",
            "township": "Hlaing",
            "city": "Yangon",
            "instructions": "Call at the gate",
            "previous": None,
        },
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
    if event_type == "commerce.purchase_budget.approved":
        return dict(next_state["purchaseBudgetEnvelopes"][0]["approval"])  # type: ignore[index, arg-type]
    if event_type == "commerce.supplier_sourcing.approved":
        return dict(next_state["supplierSourcingDecisions"][0]["approval"])  # type: ignore[index, arg-type]
    if event_type == "commerce.purchase_requisition.approved":
        return dict(next_state["purchaseRequisitions"][0]["approval"])  # type: ignore[index, arg-type]
    if event_type == "commerce.purchase_order.cancelled":
        cancelled = next(
            purchase_order
            for purchase_order in next_state["purchaseOrders"]  # type: ignore[union-attr]
            if "cancellation" in purchase_order
        )
        return dict(cancelled["cancellation"])
    if event_type in {
        "commerce.supplier_invoice.recorded",
        "commerce.supplier_invoice.payable_ready",
    }:
        proof_key = (
            "recording"
            if event_type == "commerce.supplier_invoice.recorded"
            else "payableReview"
        )
        invoice = next(
            purchase_order["supplierInvoice"]
            for purchase_order in next_state["purchaseOrders"]  # type: ignore[union-attr]
            if "supplierInvoice" in purchase_order
            and proof_key in purchase_order["supplierInvoice"]
        )
        return dict(invoice[proof_key])
    if event_type == "commerce.supplier_return.authorized":
        claim = next(
            claim
            for purchase_order in next_state["purchaseOrders"]  # type: ignore[union-attr]
            for claim in purchase_order.get("supplierReturns", [])
            if "authorization" in claim
        )
        return dict(claim["authorization"])
    if event_type == "commerce.supplier_credit.recorded":
        credit = next(
            credit
            for purchase_order in next_state["purchaseOrders"]  # type: ignore[union-attr]
            for claim in purchase_order.get("supplierReturns", [])
            for credit in claim.get("creditNotes", [])
            if "recording" in credit
        )
        return dict(credit["recording"])
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
    if event_type == "commerce.customer_credit_policy.saved":
        return dict(next_state["customerCreditPolicies"][0]["proof"])  # type: ignore[index,arg-type]
    if event_type == "commerce.promotion_policy.saved":
        return dict(next_state["promotionPolicies"][0]["proof"])  # type: ignore[index,arg-type]
    if event_type == "commerce.shipping_policy.saved":
        return dict(next_state["shippingPolicies"][0]["proof"])  # type: ignore[index,arg-type]
    if event_type == "commerce.payment_policy.saved":
        return dict(next_state["paymentPolicies"][0]["proof"])  # type: ignore[index,arg-type]
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
    if event_type == "commerce.order.support_case_opened":
        support_order = next(
            order for order in next_state["orders"] if order.get("supportCases")  # type: ignore[union-attr]
        )
        return dict(support_order["supportCases"][0]["opening"])
    if event_type == "commerce.order.support_case_reopened":
        support_order = next(
            order for order in next_state["orders"] if order.get("supportCases")  # type: ignore[union-attr]
        )
        support_case = next(case for case in support_order["supportCases"] if case.get("reopen"))
        return dict(support_case["reopen"]["proof"])
    if event_type == "commerce.order.support_case_service_recorded":
        support_order = next(
            order for order in next_state["orders"] if order.get("supportCases")  # type: ignore[union-attr]
        )
        support_case = next(
            case for case in support_order["supportCases"]
            if case.get("followUpServiceEvents") or case.get("serviceEvents")
        )
        events = support_case.get("followUpServiceEvents") or support_case["serviceEvents"]
        return dict(events[0]["proof"])
    if event_type == "commerce.order.support_case_resolved":
        support_order = next(
            order for order in next_state["orders"] if order.get("supportCases")  # type: ignore[union-attr]
        )
        support_case = next(
            case for case in support_order["supportCases"]
            if case.get("followUpResolution") or case.get("resolution")
        )
        resolution = support_case.get("followUpResolution") or support_case["resolution"]
        return dict(resolution["proof"])
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
    if event_type == "commerce.collection_action.recorded":
        contacted_orders = [
            order
            for order in next_state["orders"]  # type: ignore[union-attr]
            if order.get("collectionActions")
        ]
        return dict(contacted_orders[0]["collectionActions"][0]["proof"])
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
    def test_shop_demand_intelligence_nets_returns_and_preserves_authority(self) -> None:
        first = completed_state("ORD-DEMAND-1")
        second = completed_state("ORD-DEMAND-2")
        current = deepcopy(first)
        current["items"][0]["onHand"] = 6  # type: ignore[index]
        current["orders"] = [first["orders"][0], second["orders"][0]]  # type: ignore[index]
        current["movements"] = [first["movements"][0], second["movements"][0]]  # type: ignore[index]
        current = returned_state(
            current,
            action_id="ACT-DEMAND-RETURN",
            captured_at=RETURN_AT,
        )

        projection = commerce_shop_demand_intelligence(
            current,
            "2026-07-24T09:00:00.000Z",
        )

        self.assertEqual(projection["contract"], "supermega.shop.demand-intelligence.v1")
        self.assertEqual(projection["lookbackDays"], 28)
        self.assertEqual(projection["summary"]["netDemandUnits"], 3)
        self.assertEqual(projection["summary"]["forecastWeeklyUnits"], 1)
        self.assertEqual(len(projection["rows"]), 1)
        row = projection["rows"][0]
        self.assertEqual(row["completedOrderCount"], 2)
        self.assertEqual(row["sourceOrderIds"], ["ORD-DEMAND-1", "ORD-DEMAND-2"])
        self.assertEqual(row["sourceReturnActionIds"], ["ACT-DEMAND-RETURN"])
        self.assertEqual(row["grossDemandUnits"], 4)
        self.assertEqual(row["returnedUnits"], 1)
        self.assertEqual(row["netDemandUnits"], 3)
        self.assertEqual(row["weeklyNetDemandUnits"], [3, 0, 0, 0])
        self.assertEqual(row["forecastWeeklyUnits"], 1)
        self.assertEqual(row["recommendedSafetyStockUnits"], 2)
        self.assertEqual(row["confidence"], "emerging")
        self.assertEqual(row["planningHorizonSource"], "planning_default")
        self.assertEqual(row["status"], "monitor")
        self.assertEqual(
            projection["authority"],
            {
                "recommendationOnly": True,
                "purchaseCreated": False,
                "supplierContacted": False,
                "inventoryChanged": False,
                "policyChanged": False,
                "providerCalled": False,
            },
        )
        self.assertRegex(projection["digest"], r"^sha256:[0-9a-f]{64}$")
        self.assertEqual(
            projection,
            commerce_shop_demand_intelligence(current, "2026-07-24T09:00:00.000Z"),
        )

    def test_shop_demand_intelligence_rejects_invalid_as_of(self) -> None:
        with self.assertRaises(TrialValidationError):
            commerce_shop_demand_intelligence(completed_state(), "not-a-time")

    def test_shop_demand_intelligence_floors_weekly_bucket_at_zero(self) -> None:
        # The sale lands in the oldest weekly bucket (week 3); its return lands
        # in the newest bucket (week 0), which otherwise has no gross demand
        # to offset it. Without a floor, weekly[0] would go negative.
        as_of = "2026-08-14T09:20:00.000Z"
        current = completed_state("ORD-DEMAND-FLOOR")
        current = returned_state(
            current,
            quantity=2,
            action_id="ACT-RETURN-FLOOR",
            captured_at="2026-08-13T09:20:00.000Z",
        )

        projection = commerce_shop_demand_intelligence(current, as_of)

        row = projection["rows"][0]
        self.assertEqual(row["grossDemandUnits"], 2)
        self.assertEqual(row["returnedUnits"], 2)
        self.assertEqual(row["netDemandUnits"], 0)
        self.assertEqual(row["weeklyNetDemandUnits"], [0, 0, 0, 2])
        self.assertTrue(all(bucket >= 0 for bucket in row["weeklyNetDemandUnits"]))

    def test_shop_procurement_decision_ranks_evidence_and_preserves_authority(self) -> None:
        current = catalog_state()
        first_order = purchase_order_record(
            captured_at="2026-07-20T09:00:00.000Z",
            expected_at="2026-07-22T09:00:00.000Z",
            unit_cost_mmk=75,
        )
        second_order = purchase_order_record(
            purchase_order_id="PO-00000000-0000-4000-8000-000000000021",
            action_id="ACT-PURCHASE-CREATE-2",
            captured_at="2026-07-20T10:00:00.000Z",
            expected_at="2026-07-22T10:00:00.000Z",
            unit_cost_mmk=70,
        )
        second_order["supplier"] = "Mandalay Trade"
        current["items"][0]["onHand"] = 30  # type: ignore[index]
        current["purchaseOrders"] = [second_order, first_order]
        current["movements"] = [
            movement("receipt", "ACT-PURCHASE-RECEIVE-2", 10, created_at="2026-07-23T10:00:00.000Z", purchase_order_id=str(second_order["id"])),
            movement("receipt", "ACT-PURCHASE-RECEIVE-1", 10, created_at="2026-07-22T08:00:00.000Z", purchase_order_id=str(first_order["id"])),
        ]
        plan_body = {
            "contract": "supermega.shop.replenishment_plan.v1",
            "source": {"commerceDigest": f"sha256:{'1' * 64}", "productionOrders": []},
            "rows": [{
                "sku": "SKU-1", "itemName": "Test item", "recommendedOrderUnits": 8,
                "suggestedSupplier": "Yangon Supply", "earliestNeedAt": "2026-07-30T09:00:00.000Z",
                "jobIds": ["JOB-1"],
            }],
            "summary": {"recommendedOrderUnits": 8},
            "authority": {"purchaseCreated": False, "supplierContacted": False},
        }
        plan = {
            **plan_body,
            "digest": f"sha256:{sha256(json.dumps(plan_body, ensure_ascii=False, separators=(',', ':'), sort_keys=True).encode('utf-8')).hexdigest()}",
        }

        decision = commerce_shop_procurement_decision(current, plan, "2026-07-24T09:00:00.000Z")

        self.assertEqual(decision["contract"], "supermega.shop.procurement-decision.v1")
        self.assertEqual(decision["summary"], {
            "requisitions": 1, "readyForReview": 1, "riskReviews": 0,
            "termsRequired": 0, "comparedSuppliers": 2,
            "knownExposureMmk": 600, "unknownExposure": 0,
        })
        row = decision["rows"][0]
        self.assertEqual(row["recommendedSupplier"], "Yangon Supply")
        self.assertEqual(row["recommendedUnitCostMmk"], 75)
        self.assertEqual(row["estimatedTotalMmk"], 600)
        self.assertEqual(row["status"], "ready_for_owner_review")
        self.assertEqual(row["supplierOptions"][0]["performanceStatus"], "on_track")
        self.assertEqual(row["supplierOptions"][1]["performanceStatus"], "attention")
        self.assertEqual(row["plantJobIds"], ["JOB-1"])
        self.assertTrue(decision["authority"]["recommendationOnly"])
        self.assertFalse(any(value for key, value in decision["authority"].items() if key != "recommendationOnly"))
        self.assertRegex(decision["digest"], r"^sha256:[0-9a-f]{64}$")

    def test_shop_procurement_decision_rejects_tampered_plan(self) -> None:
        plan = {
            "contract": "supermega.shop.replenishment_plan.v1",
            "source": {"commerceDigest": f"sha256:{'1' * 64}"},
            "rows": [],
            "digest": f"sha256:{'0' * 64}",
        }
        with self.assertRaisesRegex(TrialValidationError, "untampered"):
            commerce_shop_procurement_decision(catalog_state(), plan, NOW)

    def test_ecommerce_payment_is_policy_bound_limited_and_never_authorized(self) -> None:
        current = created_state("ORD-PAYMENT-POLICY-1")
        configured = deepcopy(current)
        configured["paymentPolicies"] = [{
            "revision": 1,
            "adapter": "pay_on_pickup",
            "allowedFulfilments": ["pickup"],
            "maximumOrderMmk": 250,
            "instructions": "Collect at the counter and reconcile the receipt in Shop.",
            "status": "active",
            "effectiveFrom": "2026-07-23T08:00:00.000Z",
            "effectiveUntil": None,
            "proof": action_evidence(
                "ACT-PAYMENT-PICKUP-R1",
                captured_at="2026-07-23T08:00:00.000Z",
                reason="Approved the pickup payment boundary.",
            ),
        }]
        state = apply_event(current, "commerce.payment_policy.saved", configured)
        self.assertEqual(apply_event(current, "commerce.payment_policy.saved", configured), state)

        order = state["orders"][0]  # type: ignore[index]
        order.update({
            "sourceRecordId": "ECR-00000000-0000-4000-8000-000000000097",
            "lines": [{"sku": "SKU-1", "name": "Test item", "quantity": 2, "unitPriceMmk": 100}],
            "payment": "Cash",
            "paymentDecision": {
                "schema": "supermega.commerce.payment-decision.v1",
                "status": "approved",
                "reason": "approved",
                "adapter": "pay_on_pickup",
                "policyRevision": 1,
                "policyActionId": "ACT-PAYMENT-PICKUP-R1",
                "maximumOrderMmk": 250,
                "instructions": "Collect at the counter and reconcile the receipt in Shop.",
                "reviewedAt": NOW,
                "authorized": False,
            },
        })
        self.assertEqual(validate_commerce_state(state)["orders"][0]["payment"], "Cash")  # type: ignore[index]

        for field, value in (("authorized", True), ("maximumOrderMmk", 500), ("policyRevision", 2)):
            tampered = deepcopy(state)
            tampered["orders"][0]["paymentDecision"][field] = value  # type: ignore[index]
            with self.assertRaisesRegex(TrialValidationError, "versioned Shop policy"):
                validate_commerce_state(tampered)
        over_limit = deepcopy(state)
        over_limit["paymentPolicies"][0]["maximumOrderMmk"] = 199  # type: ignore[index]
        with self.assertRaisesRegex(TrialValidationError, "versioned Shop policy"):
            validate_commerce_state(over_limit)
        tax_inclusive_limit = deepcopy(state)
        tax_inclusive_limit["taxConfigurations"] = [tax_configuration(1)]
        tax_inclusive_limit["paymentPolicies"][0]["maximumOrderMmk"] = 205  # type: ignore[index]
        tax_inclusive_limit["orders"][0]["paymentDecision"]["maximumOrderMmk"] = 205  # type: ignore[index]
        with self.assertRaisesRegex(TrialValidationError, "versioned Shop policy"):
            validate_commerce_state(tax_inclusive_limit)
        tax_inclusive_limit["paymentPolicies"][0]["maximumOrderMmk"] = 210  # type: ignore[index]
        tax_inclusive_limit["orders"][0]["paymentDecision"]["maximumOrderMmk"] = 210  # type: ignore[index]
        tax_inclusive_limit["orders"][0]["taxDecision"] = {  # type: ignore[index]
            "schema": "supermega.ecommerce.tax-decision.v1",
            "status": "configured",
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
            "policyActionId": "ACT-TAX-R1",
            "reviewedAt": NOW,
        }
        self.assertEqual(
            validate_commerce_state(tax_inclusive_limit)["orders"][0]["taxDecision"]["policyActionId"],  # type: ignore[index]
            "ACT-TAX-R1",
        )
        forged_tax = deepcopy(tax_inclusive_limit)
        forged_tax["orders"][0]["taxDecision"]["policyActionId"] = "ACT-TAX-FORGED"  # type: ignore[index]
        with self.assertRaisesRegex(TrialValidationError, "taxDecision"):
            validate_commerce_state(forged_tax)
        wrong_evidence = action_evidence("ACT-PAYMENT-WRONG-EVIDENCE")
        with self.assertRaisesRegex(TrialValidationError, "payment policy proof"):
            apply_event(current, "commerce.payment_policy.saved", configured, wrong_evidence)

    def test_ecommerce_shipping_is_policy_bound_and_prices_the_shop_order(self) -> None:
        current = created_state("ORD-SHIPPING-1")
        configured = deepcopy(current)
        configured["shippingPolicies"] = [{
            "revision": 1,
            "zoneCode": "YGN-WEST",
            "townships": ["Hlaing", "Kamayut"],
            "feeMmk": 3_000,
            "promiseMinutes": 120,
            "status": "active",
            "effectiveFrom": "2026-07-23T08:00:00.000Z",
            "effectiveUntil": None,
            "proof": action_evidence(
                "ACT-SHIPPING-YGN-WEST-R1",
                captured_at="2026-07-23T08:00:00.000Z",
                reason="Approved the Yangon west shipping policy.",
            ),
        }]
        state = apply_event(current, "commerce.shipping_policy.saved", configured)
        self.assertEqual(apply_event(current, "commerce.shipping_policy.saved", configured), state)
        with self.assertRaisesRegex(TrialValidationError, "shipping policy proof"):
            apply_event(
                current,
                "commerce.shipping_policy.saved",
                configured,
                action_evidence("ACT-SHIPPING-WRONG-EVIDENCE"),
            )

        order = state["orders"][0]  # type: ignore[index]
        order.update({
            "sourceRecordId": "ECR-00000000-0000-4000-8000-000000000098",
            "lines": [{"sku": "SKU-1", "name": "Test item", "quantity": 2, "unitPriceMmk": 100}],
            "fulfilment": "delivery",
            "shippingDecision": {
                "schema": "supermega.commerce.shipping-decision.v1",
                "status": "approved",
                "reason": "approved",
                "township": "Hlaing",
                "zoneCode": "YGN-WEST",
                "policyRevision": 1,
                "policyActionId": "ACT-SHIPPING-YGN-WEST-R1",
                "feeMmk": 3_000,
                "promiseMinutes": 120,
                "reviewedAt": NOW,
            },
            "total": 3_200,
        })
        accepted = validate_commerce_state(state)
        self.assertEqual(accepted["orders"][0]["total"], 3_200)  # type: ignore[index]

        for field, value in (("feeMmk", 2_999), ("policyRevision", 2), ("promiseMinutes", 90)):
            tampered = deepcopy(state)
            tampered["orders"][0]["shippingDecision"][field] = value  # type: ignore[index]
            with self.assertRaisesRegex(TrialValidationError, "versioned Shop policy"):
                validate_commerce_state(tampered)
        early = deepcopy(state)
        early["orders"][0]["promisedAt"] = "2026-07-23T10:59:59.000Z"  # type: ignore[index]
        with self.assertRaisesRegex(TrialValidationError, "promise is earlier"):
            validate_commerce_state(early)
        ungoverned = deepcopy(state)
        ungoverned["shippingPolicies"] = []
        with self.assertRaisesRegex(TrialValidationError, "versioned Shop policy"):
            validate_commerce_state(ungoverned)

    def test_ecommerce_promotion_is_policy_bound_and_prices_the_shop_order(self) -> None:
        current = created_state("ORD-PROMO-1")
        configured_state = deepcopy(current)
        configured_state["promotionPolicies"] = [
            {
                "revision": 1,
                "code": "WELCOME",
                "discountBasisPoints": 1_000,
                "minimumSubtotalMmk": 100,
                "maximumDiscountMmk": 50,
                "status": "active",
                "effectiveFrom": "2026-07-23T08:00:00.000Z",
                "effectiveUntil": None,
                "proof": action_evidence(
                    "ACT-PROMOTION-WELCOME-R1",
                    captured_at="2026-07-23T08:00:00.000Z",
                    reason="Approved the launch promotion policy.",
                ),
            }
        ]
        state = apply_event(
            current,
            "commerce.promotion_policy.saved",
            configured_state,
        )
        self.assertEqual(state["promotionPolicies"], configured_state["promotionPolicies"])
        self.assertEqual(
            apply_event(
                current,
                "commerce.promotion_policy.saved",
                configured_state,
            ),
            state,
        )
        with self.assertRaisesRegex(TrialValidationError, "promotion policy proof"):
            apply_event(
                current,
                "commerce.promotion_policy.saved",
                configured_state,
                action_evidence("ACT-PROMOTION-WRONG-EVIDENCE"),
            )

        order = state["orders"][0]  # type: ignore[index]
        order["sourceRecordId"] = "ECR-00000000-0000-4000-8000-000000000099"
        order["lines"] = [
            {
                "sku": "SKU-1",
                "name": "Test item",
                "quantity": 2,
                "unitPriceMmk": 100,
            }
        ]
        order["promotionDecision"] = {
            "schema": "supermega.commerce.promotion-decision.v1",
            "status": "approved",
            "code": "WELCOME",
            "policyRevision": 1,
            "policyActionId": "ACT-PROMOTION-WELCOME-R1",
            "discountBasisPoints": 1_000,
            "grossSubtotalMmk": 200,
            "discountMmk": 20,
            "netSubtotalMmk": 180,
            "reviewedAt": NOW,
            "reason": "approved",
        }
        order["total"] = 180

        accepted = validate_commerce_state(state)
        self.assertEqual(accepted["orders"][0]["total"], 180)  # type: ignore[index]

        for field, value in (
            ("discountMmk", 19),
            ("policyActionId", "ACT-PROMOTION-FORGED"),
            ("netSubtotalMmk", 181),
        ):
            tampered = deepcopy(state)
            tampered["orders"][0]["promotionDecision"][field] = value  # type: ignore[index]
            with self.assertRaisesRegex(TrialValidationError, "versioned Shop policy"):
                validate_commerce_state(tampered)

        ungoverned = deepcopy(state)
        ungoverned["promotionPolicies"] = []
        with self.assertRaisesRegex(TrialValidationError, "versioned Shop policy"):
            validate_commerce_state(ungoverned)

        store = InMemoryTrialStore(reducer=reduce_trial_state)
        operator = TrialPrincipal("workspace-promotion", "operator-promotion", "human")
        agent = TrialPrincipal("workspace-promotion", "promotion-agent", "agent")
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
                "evidence": action_evidence("ACT-INIT-PROMOTION"),
            },
        )
        future_policy = deepcopy(configured_state["promotionPolicies"][0])  # type: ignore[index]
        future_policy["effectiveFrom"] = "2099-02-01T00:00:00.000Z"
        future_policy["proof"] = action_evidence(
            "ACT-PROMOTION-SERVER",
            captured_at="2099-01-01T00:00:00.000Z",
            actor="forged-actor",
        )
        managed_state = deepcopy(initialized.state)
        managed_state["promotionPolicies"] = [future_policy]
        payload = {
            "state": managed_state,
            "evidence": dict(future_policy["proof"]),
        }
        saved = store.apply_command(
            operator,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.promotion_policy.saved",
            expected_version=initialized.version,
            payload=payload,
        )
        saved_proof = saved.state["promotionPolicies"][0]["proof"]  # type: ignore[index]
        self.assertEqual(saved_proof["actor"], operator.actor_id)
        self.assertNotEqual(saved_proof["capturedAt"], "2099-01-01T00:00:00.000Z")
        with self.assertRaises(TrialHumanApprovalRequired):
            store.apply_command(
                agent,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.promotion_policy.saved",
                expected_version=saved.version,
                payload=payload,
            )

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

        short_stock = deepcopy(current)
        short_stock["items"][0]["onHand"] = 1  # type: ignore[index]
        short_stock_request = storefront_request(quantity=2)
        short_stock_next = deepcopy(short_stock)
        short_stock_next["storefrontRequests"] = [short_stock_request]
        with self.assertRaises(TrialValidationError):
            apply_event(
                short_stock,
                "commerce.storefront_request.received",
                short_stock_next,
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
        self.assertEqual(request["customerProfile"]["phone"], "09 123 456 789")  # type: ignore[index]
        self.assertEqual(request["deliveryAddress"]["township"], "Hlaing")  # type: ignore[index]
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

        tampered_profile = deepcopy(next_state)
        tampered_profile["storefrontRequests"][0]["customerProfile"]["phone"] = "09 999 999 999"  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.storefront_request.received",
                tampered_profile,
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
                }
            ),
        )
        self.assertIn("commerce.item.updated", COMMERCE_EVENTS)
        self.assertIn("commerce.storefront.merchandising.imported", COMMERCE_EVENTS)
        self.assertIn("commerce.tax_configuration.saved", COMMERCE_EVENTS)
        self.assertIn("commerce.account_mapping.saved", COMMERCE_EVENTS)
        self.assertIn("commerce.customer_credit_policy.saved", COMMERCE_EVENTS)
        self.assertIn("commerce.promotion_policy.saved", COMMERCE_EVENTS)
        self.assertIn("commerce.shipping_policy.saved", COMMERCE_EVENTS)
        self.assertIn("commerce.payment_policy.saved", COMMERCE_EVENTS)
        self.assertIn("commerce.service_schedule.initialized", COMMERCE_EVENTS)
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

    def test_supplier_invoice_three_way_match_gates_payable_handoff(self) -> None:
        current = catalog_state()
        created_state = deepcopy(current)
        created_state["purchaseOrders"] = [purchase_order_record()]
        created = apply_event(current, "commerce.purchase_order.created", created_state)

        invoice = supplier_invoice_record()
        invoiced_state = deepcopy(created)
        invoiced_state["purchaseOrders"][0]["supplierInvoice"] = invoice  # type: ignore[index]
        invoiced = apply_event(
            created,
            "commerce.supplier_invoice.recorded",
            invoiced_state,
        )
        match = commerce_supplier_invoice_match(
            invoiced,
            invoiced["purchaseOrders"][0],  # type: ignore[index,arg-type]
        )
        self.assertEqual(match["status"], "awaiting_receipt")
        self.assertFalse(match["payableReady"])

        forged_payable = deepcopy(invoiced)
        forged_payable["purchaseOrders"][0]["supplierInvoice"]["payableReview"] = (  # type: ignore[index]
            action_evidence(
                "ACT-SUPPLIER-INVOICE-PAYABLE-EARLY",
                captured_at="2026-07-23T09:31:00.000Z",
            )
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                invoiced,
                "commerce.supplier_invoice.payable_ready",
                forged_payable,
            )

        received_state = deepcopy(invoiced)
        received_state["items"][0]["onHand"] = 20  # type: ignore[index]
        received_state["movements"] = [
            movement(
                "receipt",
                "ACT-PURCHASE-RECEIVE-FULL",
                10,
                created_at="2026-07-23T09:40:00.000Z",
                purchase_order_id=PURCHASE_ORDER_ID,
            )
        ]
        received = apply_event(
            invoiced,
            "commerce.purchase_order.received",
            received_state,
        )
        matched = commerce_supplier_invoice_match(
            received,
            received["purchaseOrders"][0],  # type: ignore[index,arg-type]
        )
        self.assertEqual(matched["status"], "matched")
        self.assertEqual(matched["orderedTotalMmk"], 750)
        self.assertEqual(matched["invoicedTotalMmk"], 750)

        review = action_evidence(
            "ACT-SUPPLIER-INVOICE-PAYABLE",
            captured_at="2026-07-23T09:50:00.000Z",
        )
        payable_state = deepcopy(received)
        payable_state["purchaseOrders"][0]["supplierInvoice"]["payableReview"] = review  # type: ignore[index]
        payable = apply_event(
            received,
            "commerce.supplier_invoice.payable_ready",
            payable_state,
        )
        payable_match = commerce_supplier_invoice_match(
            payable,
            payable["purchaseOrders"][0],  # type: ignore[index,arg-type]
        )
        self.assertTrue(payable_match["payableReady"])
        handoff = commerce_supplier_payables_handoff(payable)
        self.assertIsNotNone(handoff)
        assert handoff is not None
        self.assertEqual(handoff["schema"], "supermega.commerce.supplier-payables-handoff.v1")
        self.assertEqual(handoff["status"], "review_required")
        self.assertEqual(handoff["paymentAuthority"], "none")
        self.assertFalse(handoff["paymentInitiated"])
        self.assertFalse(handoff["accountingPosted"])
        self.assertEqual(handoff["readyInvoiceCount"], 1)
        self.assertEqual(handoff["excludedInvoiceCount"], 0)
        self.assertEqual(handoff["grossInvoiceTotalMmk"], 750)
        self.assertEqual(handoff["supplierCreditTotalMmk"], 0)
        self.assertEqual(handoff["netPayableTotalMmk"], 750)
        self.assertEqual(handoff["rows"][0]["receiptMovementIds"], [received_state["movements"][0]["id"]])  # type: ignore[index]
        self.assertEqual(handoff["rows"][0]["physicalReturnStatus"], "not_required")
        self.assertEqual(handoff["rows"][0]["payableReviewActionId"], review["actionId"])
        self.assertIn('"net_payable_mmk"', commerce_supplier_payables_handoff_csv(handoff))

        blocked_aging = commerce_supplier_payables_aging(
            invoiced,
            "2026-08-15T09:20:00.000Z",
        )
        self.assertEqual(blocked_aging["rows"], [])
        self.assertEqual(blocked_aging["blockedInvoiceCount"], 1)

        scheduled_aging = commerce_supplier_payables_aging(
            payable,
            "2026-08-14T09:20:00.000Z",
        )
        self.assertEqual(scheduled_aging["rows"][0]["bucket"], "scheduled")
        self.assertEqual(scheduled_aging["rows"][0]["daysUntilDue"], 8)
        due_aging = commerce_supplier_payables_aging(
            payable,
            "2026-08-15T09:20:00.000Z",
        )
        self.assertEqual(due_aging["rows"][0]["bucket"], "due_7_days")
        self.assertEqual(due_aging["rows"][0]["daysUntilDue"], 7)
        self.assertEqual(due_aging["totalsMmk"]["due_7_days"], 750)
        self.assertEqual(due_aging["dueWithin7DaysInvoiceCount"], 1)
        self.assertEqual(due_aging["paymentAuthority"], "none")
        self.assertFalse(due_aging["paymentInitiated"])
        overdue_aging = commerce_supplier_payables_aging(
            payable,
            "2026-08-22T09:20:00.001Z",
        )
        self.assertEqual(overdue_aging["rows"][0]["bucket"], "overdue")
        self.assertEqual(overdue_aging["rows"][0]["daysPastDue"], 1)
        self.assertEqual(overdue_aging["overdueInvoiceCount"], 1)
        self.assertEqual(overdue_aging["totalsMmk"]["overdue"], 750)
        with self.assertRaises(TrialValidationError):
            commerce_supplier_payables_aging(payable, "not-a-timestamp")

        tampered_handoff = deepcopy(handoff)
        tampered_handoff["netPayableTotalMmk"] = 751
        with self.assertRaisesRegex(TrialValidationError, "integrity check failed"):
            commerce_supplier_payables_handoff_csv(tampered_handoff)

        formula_state = deepcopy(payable)
        formula_state["purchaseOrders"][0]["supplierInvoice"]["supplierReference"] = "=2+2"  # type: ignore[index]
        formula_handoff = commerce_supplier_payables_handoff(formula_state)
        assert formula_handoff is not None
        self.assertIn('"\'=2+2"', commerce_supplier_payables_handoff_csv(formula_handoff))

        price_variance_state = deepcopy(created)
        price_variance_state["purchaseOrders"][0]["supplierInvoice"] = (  # type: ignore[index]
            supplier_invoice_record(unit_cost_mmk=80)
        )
        price_variance = apply_event(
            created,
            "commerce.supplier_invoice.recorded",
            price_variance_state,
        )
        price_variance_received = deepcopy(price_variance)
        price_variance_received["items"][0]["onHand"] = 20  # type: ignore[index]
        price_variance_received["movements"] = received_state["movements"]
        price_variance_received = apply_event(
            price_variance,
            "commerce.purchase_order.received",
            price_variance_received,
        )
        self.assertEqual(
            commerce_supplier_invoice_match(
                price_variance_received,
                price_variance_received["purchaseOrders"][0],  # type: ignore[index,arg-type]
            )["status"],
            "price_variance",
        )

        cancellation = deepcopy(invoiced)
        cancellation["purchaseOrders"][0]["cancellation"] = action_evidence(  # type: ignore[index]
            "ACT-PURCHASE-CANCEL-INVOICED",
            captured_at="2026-07-23T09:35:00.000Z",
        )
        with self.assertRaises(TrialValidationError):
            apply_event(invoiced, "commerce.purchase_order.cancelled", cancellation)

    def test_rejected_supplier_units_require_immutable_return_and_exact_credit(self) -> None:
        current = catalog_state()
        created_state = deepcopy(current)
        created_state["purchaseOrders"] = [purchase_order_record()]
        created = apply_event(current, "commerce.purchase_order.created", created_state)

        receipt = movement(
            "receipt",
            "ACT-PURCHASE-RECEIVE-REJECTED",
            8,
            created_at="2026-07-23T09:40:00.000Z",
            purchase_order_id=PURCHASE_ORDER_ID,
            rejected_quantity=2,
            discrepancy_code="damaged",
        )
        received_state = deepcopy(created)
        received_state["items"][0]["onHand"] = 18  # type: ignore[index]
        received_state["movements"] = [receipt]
        received = apply_event(
            created,
            "commerce.purchase_order.received",
            received_state,
        )

        invoiced_state = deepcopy(received)
        invoiced_state["purchaseOrders"][0]["supplierInvoice"] = supplier_invoice_record()  # type: ignore[index]
        invoiced = apply_event(
            received,
            "commerce.supplier_invoice.recorded",
            invoiced_state,
        )
        self.assertEqual(
            commerce_supplier_invoice_match(
                invoiced,
                invoiced["purchaseOrders"][0],  # type: ignore[index,arg-type]
            )["status"],
            "supplier_credit_pending",
        )

        claim = supplier_return_claim_record(str(receipt["id"]))
        claimed_state = deepcopy(invoiced)
        claimed_state["purchaseOrders"][0]["supplierReturns"] = [claim]  # type: ignore[index]
        claimed = apply_event(
            invoiced,
            "commerce.supplier_return.authorized",
            claimed_state,
        )
        self.assertEqual(claimed["items"], invoiced["items"])
        self.assertEqual(claimed["movements"], invoiced["movements"])
        retained_claim = claimed["purchaseOrders"][0]["supplierReturns"][0]  # type: ignore[index]
        self.assertEqual(retained_claim["claimAmountMmk"], 150)
        self.assertEqual(retained_claim["physicalReturnStatus"], "not_dispatched")
        self.assertFalse(retained_claim["supplierContacted"])
        self.assertFalse(retained_claim["accountingPosted"])

        partial_credit = supplier_credit_note_record(amount_mmk=75)
        partial_state = deepcopy(claimed)
        partial_state["purchaseOrders"][0]["supplierReturns"][0]["creditNotes"] = [partial_credit]  # type: ignore[index]
        partial = apply_event(
            claimed,
            "commerce.supplier_credit.recorded",
            partial_state,
        )
        partial_match = commerce_supplier_invoice_match(
            partial,
            partial["purchaseOrders"][0],  # type: ignore[index,arg-type]
        )
        self.assertEqual(partial_match["status"], "supplier_credit_pending")
        self.assertEqual(partial_match["supplierReturnBalanceMmk"], 75)

        final_credit = supplier_credit_note_record(
            action_id="ACT-SUPPLIER-CREDIT-RECORD-FINAL",
            captured_at="2026-07-23T10:10:00.000Z",
            issued_at="2026-07-23T10:05:00.000Z",
            amount_mmk=75,
        )
        final_credit["id"] = "SCN-00000000-0000-4000-8000-000000000033"
        final_credit["supplierReference"] = "YS-CN-2026-0033"
        credited_state = deepcopy(partial)
        credited_state["purchaseOrders"][0]["supplierReturns"][0]["creditNotes"] = [  # type: ignore[index]
            final_credit,
            partial_credit,
        ]
        credited = apply_event(
            partial,
            "commerce.supplier_credit.recorded",
            credited_state,
        )
        credited_match = commerce_supplier_invoice_match(
            credited,
            credited["purchaseOrders"][0],  # type: ignore[index,arg-type]
        )
        self.assertEqual(credited_match["status"], "matched")
        self.assertEqual(credited_match["supplierClaimMmk"], 150)
        self.assertEqual(credited_match["supplierCreditMmk"], 150)
        self.assertEqual(credited_match["netInvoiceTotalMmk"], 600)
        self.assertEqual(credited_match["acceptedTotalMmk"], 600)

        credited_payable_state = deepcopy(credited)
        credited_payable_state["purchaseOrders"][0]["supplierInvoice"]["payableReview"] = action_evidence(  # type: ignore[index]
            "ACT-SUPPLIER-INVOICE-CREDITED-PAYABLE",
            captured_at="2026-07-23T10:20:00.000Z",
        )
        credited_payable = apply_event(
            credited,
            "commerce.supplier_invoice.payable_ready",
            credited_payable_state,
        )
        credited_handoff = commerce_supplier_payables_handoff(credited_payable)
        self.assertIsNotNone(credited_handoff)
        assert credited_handoff is not None
        self.assertEqual(credited_handoff["grossInvoiceTotalMmk"], 750)
        self.assertEqual(credited_handoff["supplierCreditTotalMmk"], 150)
        self.assertEqual(credited_handoff["netPayableTotalMmk"], 600)
        self.assertEqual(credited_handoff["rows"][0]["rejectedQuantity"], 2)
        self.assertEqual(credited_handoff["rows"][0]["supplierReturnClaimIds"], [claim["id"]])
        self.assertEqual(credited_handoff["rows"][0]["supplierCreditNoteIds"], [partial_credit["id"], final_credit["id"]])
        self.assertEqual(credited_handoff["rows"][0]["physicalReturnStatus"], "not_dispatched")

        unsafe_claim = deepcopy(claimed_state)
        unsafe_claim["purchaseOrders"][0]["supplierReturns"][0]["physicalReturnStatus"] = "dispatched"  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(invoiced, "commerce.supplier_return.authorized", unsafe_claim)

        overcredit = supplier_credit_note_record(amount_mmk=151)
        overcredit_state = deepcopy(claimed)
        overcredit_state["purchaseOrders"][0]["supplierReturns"][0]["creditNotes"] = [overcredit]  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(claimed, "commerce.supplier_credit.recorded", overcredit_state)

        posted_credit = supplier_credit_note_record()
        posted_credit["accountingPosted"] = True
        posted_state = deepcopy(claimed)
        posted_state["purchaseOrders"][0]["supplierReturns"][0]["creditNotes"] = [posted_credit]  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(claimed, "commerce.supplier_credit.recorded", posted_state)

    def test_purchase_budget_caps_commitment_and_cancelled_po_releases_it(self) -> None:
        envelope = purchase_budget_envelope_record(ceiling_mmk=1_000)
        first = purchase_requisition_record(budget_envelope_id=envelope["id"])  # type: ignore[arg-type]
        second = purchase_requisition_record(
            requisition_id="PR-00000000-0000-4000-8000-000000000020",
            action_id="ACT-PURCHASE-REQUISITION-SECOND",
            quantity=5,
            budget_envelope_id=envelope["id"],  # type: ignore[arg-type]
        )
        state = catalog_state()
        state["purchaseBudgetEnvelopes"] = [envelope]
        state["purchaseRequisitions"] = [second, first]
        first_po = purchase_order_record(actor="Procurement operator")
        first_po["requisitionId"] = first["id"]
        second_po = purchase_order_record(
            purchase_order_id="PO-00000000-0000-4000-8000-000000000022",
            action_id="ACT-PURCHASE-CREATE-SECOND",
            quantity=5,
            actor="Procurement operator",
        )
        second_po["requisitionId"] = second["id"]
        state["purchaseOrders"] = [second_po, first_po]
        with self.assertRaisesRegex(TrialValidationError, "approved ceiling"):
            validate_commerce_state(state)

        first_po["cancellation"] = action_evidence(
            "ACT-PURCHASE-CANCEL-BUDGET-RELEASE",
            captured_at="2026-07-23T09:10:00.000Z",
            actor="Procurement operator",
        )
        validated = validate_commerce_state(state)
        self.assertEqual(len(validated["purchaseRequisitions"]), 2)

        over_limit = deepcopy(validated)
        over_limit["purchaseRequisitions"][0]["quantityRequested"] = 14  # type: ignore[index]
        over_limit["purchaseRequisitions"][0]["totalMmk"] = 1_050  # type: ignore[index]
        with self.assertRaisesRegex(TrialValidationError, "per-requisition"):
            validate_commerce_state(over_limit)

        legacy = catalog_state()
        legacy["purchaseRequisitions"] = [purchase_requisition_record()]
        self.assertEqual(len(validate_commerce_state(legacy)["purchaseRequisitions"]), 1)
        with self.assertRaisesRegex(TrialValidationError, "budget envelope"):
            apply_event(catalog_state(), "commerce.purchase_requisition.approved", legacy)

    def test_purchase_requisition_is_immutable_and_exactly_converts_to_one_po(self) -> None:
        current = catalog_state()
        envelope = purchase_budget_envelope_record()
        budget_state = deepcopy(current)
        budget_state["purchaseBudgetEnvelopes"] = [envelope]
        budgeted = apply_event(current, "commerce.purchase_budget.approved", budget_state)
        sourcing = supplier_sourcing_decision_record()
        sourcing_state = deepcopy(budgeted)
        sourcing_state["supplierSourcingDecisions"] = [sourcing]
        sourced = apply_event(budgeted, "commerce.supplier_sourcing.approved", sourcing_state)
        requisition = purchase_requisition_record(
            budget_envelope_id=envelope["id"],  # type: ignore[arg-type]
            source_sourcing_decision_id=sourcing["id"],  # type: ignore[arg-type]
        )
        requisition_state = deepcopy(sourced)
        requisition_state["purchaseRequisitions"] = [requisition]
        approved = apply_event(
            sourced,
            "commerce.purchase_requisition.approved",
            requisition_state,
        )
        self.assertEqual(approved["purchaseRequisitions"][0]["totalMmk"], 750)  # type: ignore[index]
        self.assertNotIn("purchaseOrders", approved)

        purchase_order = purchase_order_record(actor="Procurement operator")
        purchase_order["requisitionId"] = requisition["id"]
        converted_state = deepcopy(approved)
        converted_state["purchaseOrders"] = [purchase_order]
        converted = apply_event(
            approved,
            "commerce.purchase_order.created",
            converted_state,
        )
        self.assertEqual(converted["purchaseOrders"][0]["requisitionId"], requisition["id"])  # type: ignore[index]

        same_operator = deepcopy(approved)
        same_operator_order = purchase_order_record(
            purchase_order_id="PO-00000000-0000-4000-8000-000000000021",
            action_id="ACT-PURCHASE-CREATE-SAME-OPERATOR",
            actor="accountable OPERATOR",
        )
        same_operator_order["requisitionId"] = requisition["id"]
        same_operator["purchaseOrders"] = [same_operator_order]
        with self.assertRaisesRegex(TrialValidationError, "different operator"):
            apply_event(approved, "commerce.purchase_order.created", same_operator)

        stale_confirmation = deepcopy(approved)
        stale_order = purchase_order_record(
            purchase_order_id="PO-00000000-0000-4000-8000-000000000023",
            action_id="ACT-PURCHASE-CREATE-STALE",
            captured_at="2026-07-23T08:59:59.999Z",
            actor="Procurement operator",
        )
        stale_order["requisitionId"] = requisition["id"]
        stale_confirmation["purchaseOrders"] = [stale_order]
        with self.assertRaisesRegex(TrialValidationError, "later confirmation"):
            apply_event(approved, "commerce.purchase_order.created", stale_confirmation)

        mismatched = deepcopy(approved)
        mismatched_order = deepcopy(purchase_order)
        mismatched_order["unitCostMmk"] = 74
        mismatched["purchaseOrders"] = [mismatched_order]
        with self.assertRaisesRegex(TrialValidationError, "approved requisition"):
            apply_event(approved, "commerce.purchase_order.created", mismatched)

        duplicate = deepcopy(converted)
        duplicate_order = purchase_order_record(
            purchase_order_id="PO-00000000-0000-4000-8000-000000000022",
            action_id="ACT-PURCHASE-CREATE-DUPLICATE",
            actor="Procurement operator",
        )
        duplicate_order["requisitionId"] = requisition["id"]
        duplicate["purchaseOrders"] = [duplicate_order, *converted["purchaseOrders"]]  # type: ignore[misc]
        with self.assertRaisesRegex(TrialValidationError, "Converted purchase requisition"):
            apply_event(converted, "commerce.purchase_order.created", duplicate)

    def test_store_restamps_and_idempotently_retains_human_requisition_approval(self) -> None:
        store = InMemoryTrialStore(reducer=reduce_trial_state)
        operator = TrialPrincipal("workspace-requisition", "shop-owner", "human")
        buyer = TrialPrincipal("workspace-requisition", "procurement-operator", "human")
        agent = TrialPrincipal("workspace-requisition", "buying-agent", "agent")
        for principal in (operator, buyer, agent):
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
            payload={"state": catalog_state(), "evidence": action_evidence("ACT-REQUISITION-INIT")},
        )
        envelope = purchase_budget_envelope_record(captured_at="2099-01-01T00:00:00.000Z", period_end="2099-12-31T00:00:00.000Z")
        envelope["approval"]["actor"] = "Fabricated buying agent"  # type: ignore[index]
        budget_state = deepcopy(initialized.state)
        budget_state["purchaseBudgetEnvelopes"] = [envelope]
        budget_payload = {"state": budget_state, "evidence": dict(envelope["approval"])}  # type: ignore[arg-type]
        with self.assertRaises(TrialHumanApprovalRequired):
            store.apply_command(
                agent,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.purchase_budget.approved",
                expected_version=initialized.version,
                payload=budget_payload,
            )
        budget_command_id = str(uuid4())
        with patch(
            "supermega_runtime.trial_store._utc_now",
            return_value="2026-07-23T09:04:00.000+00:00",
        ):
            budgeted = store.apply_command(
                operator,
                command_id=budget_command_id,
                surface="commerce",
                event_type="commerce.purchase_budget.approved",
                expected_version=initialized.version,
                payload=budget_payload,
            )
            budget_replay = store.apply_command(
                operator,
                command_id=budget_command_id,
                surface="commerce",
                event_type="commerce.purchase_budget.approved",
                expected_version=initialized.version,
                payload=budget_payload,
            )
        retained_envelope = budgeted.state["purchaseBudgetEnvelopes"][0]  # type: ignore[index]
        self.assertEqual(retained_envelope["approval"]["actor"], operator.actor_id)  # type: ignore[index]
        self.assertEqual(retained_envelope["periodStart"], "2026-07-23T09:04:00.000+00:00")
        self.assertTrue(budget_replay.idempotent_replay)

        sourcing = supplier_sourcing_decision_record(
            captured_at="2099-01-01T00:00:00.000Z",
        )
        sourcing["approval"]["actor"] = "Fabricated buying agent"  # type: ignore[index]
        sourcing_state = deepcopy(budgeted.state)
        sourcing_state["supplierSourcingDecisions"] = [sourcing]
        sourcing_payload = {
            "state": sourcing_state,
            "evidence": dict(sourcing["approval"]),  # type: ignore[arg-type]
        }
        with self.assertRaises(TrialHumanApprovalRequired):
            store.apply_command(
                agent,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.supplier_sourcing.approved",
                expected_version=budgeted.version,
                payload=sourcing_payload,
            )
        sourcing_command_id = str(uuid4())
        with patch(
            "supermega_runtime.trial_store._utc_now",
            return_value="2026-07-23T09:04:30.000+00:00",
        ):
            sourced = store.apply_command(
                operator,
                command_id=sourcing_command_id,
                surface="commerce",
                event_type="commerce.supplier_sourcing.approved",
                expected_version=budgeted.version,
                payload=sourcing_payload,
            )
            sourcing_replay = store.apply_command(
                operator,
                command_id=sourcing_command_id,
                surface="commerce",
                event_type="commerce.supplier_sourcing.approved",
                expected_version=budgeted.version,
                payload=sourcing_payload,
            )
        retained_sourcing = sourced.state["supplierSourcingDecisions"][0]  # type: ignore[index]
        self.assertEqual(retained_sourcing["approval"]["actor"], operator.actor_id)  # type: ignore[index]
        self.assertEqual(retained_sourcing["createdAt"], "2026-07-23T09:04:30.000+00:00")
        self.assertTrue(sourcing_replay.idempotent_replay)

        requisition = purchase_requisition_record(
            captured_at="2099-01-01T00:00:00.000Z",
            budget_envelope_id=retained_envelope["id"],  # type: ignore[arg-type]
            source_sourcing_decision_id=retained_sourcing["id"],  # type: ignore[arg-type]
        )
        requisition["approval"]["actor"] = "Fabricated buying agent"  # type: ignore[index]
        next_state = deepcopy(sourced.state)
        next_state["purchaseRequisitions"] = [requisition]
        command_id = str(uuid4())
        payload = {
            "state": next_state,
            "evidence": dict(requisition["approval"]),  # type: ignore[arg-type]
        }
        with self.assertRaises(TrialHumanApprovalRequired):
            store.apply_command(
                agent,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.purchase_requisition.approved",
                expected_version=sourced.version,
                payload=payload,
            )
        with patch(
            "supermega_runtime.trial_store._utc_now",
            return_value="2026-07-23T09:05:00.000+00:00",
        ):
            approved = store.apply_command(
                operator,
                command_id=command_id,
                surface="commerce",
                event_type="commerce.purchase_requisition.approved",
                expected_version=sourced.version,
                payload=payload,
            )
            replay = store.apply_command(
                operator,
                command_id=command_id,
                surface="commerce",
                event_type="commerce.purchase_requisition.approved",
                expected_version=sourced.version,
                payload=payload,
            )
        retained = approved.state["purchaseRequisitions"][0]  # type: ignore[index]
        self.assertEqual(retained["approval"]["actor"], operator.actor_id)  # type: ignore[index]
        self.assertEqual(retained["createdAt"], "2026-07-23T09:05:00.000+00:00")
        self.assertNotIn("purchaseOrders", approved.state)
        self.assertTrue(replay.idempotent_replay)

        purchase_order = purchase_order_record(
            captured_at="2099-01-01T00:00:00.000Z",
            actor="Fabricated second operator",
        )
        purchase_order["requisitionId"] = retained["id"]  # type: ignore[index]
        purchase_state = deepcopy(approved.state)
        purchase_state["purchaseOrders"] = [purchase_order]
        purchase_payload = {
            "state": purchase_state,
            "evidence": dict(purchase_order["creation"]),  # type: ignore[arg-type]
        }
        with patch(
            "supermega_runtime.trial_store._utc_now",
            return_value="2026-07-23T09:06:00.000+00:00",
        ):
            with self.assertRaisesRegex(TrialValidationError, "different operator"):
                store.apply_command(
                    operator,
                    command_id=str(uuid4()),
                    surface="commerce",
                    event_type="commerce.purchase_order.created",
                    expected_version=approved.version,
                    payload=purchase_payload,
                )
            converted = store.apply_command(
                buyer,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.purchase_order.created",
                expected_version=approved.version,
                payload=purchase_payload,
            )
        retained_order = converted.state["purchaseOrders"][0]  # type: ignore[index]
        self.assertEqual(retained_order["creation"]["actor"], buyer.actor_id)  # type: ignore[index]
        self.assertNotEqual(retained_order["creation"]["actor"], retained["approval"]["actor"])  # type: ignore[index]

    def test_supplier_sourcing_award_is_immutable_tolerance_bound_and_single_use(self) -> None:
        current = catalog_state()
        envelope = purchase_budget_envelope_record()
        budget_state = deepcopy(current)
        budget_state["purchaseBudgetEnvelopes"] = [envelope]
        budgeted = apply_event(current, "commerce.purchase_budget.approved", budget_state)
        decision = supplier_sourcing_decision_record(
            unit_cost_tolerance_basis_points=1_000,
            delivery_tolerance_days=2,
        )
        sourcing_state = deepcopy(budgeted)
        sourcing_state["supplierSourcingDecisions"] = [decision]
        sourced = apply_event(
            budgeted,
            "commerce.supplier_sourcing.approved",
            sourcing_state,
        )
        self.assertEqual(sourced["supplierSourcingDecisions"], [decision])
        self.assertEqual(sourced["items"], budgeted["items"])

        unknown_award = deepcopy(sourced)
        unknown_award["supplierSourcingDecisions"][0]["selectedQuoteReference"] = "UNKNOWN"  # type: ignore[index]
        with self.assertRaisesRegex(TrialValidationError, "selectedQuoteReference"):
            validate_commerce_state(unknown_award)

        requisition = purchase_requisition_record(
            unit_cost_mmk=82,
            expected_at="2026-07-27T09:00:00.000Z",
            budget_envelope_id=envelope["id"],  # type: ignore[arg-type]
            source_sourcing_decision_id=decision["id"],  # type: ignore[arg-type]
        )
        approved_state = deepcopy(sourced)
        approved_state["purchaseRequisitions"] = [requisition]
        approved = apply_event(
            sourced,
            "commerce.purchase_requisition.approved",
            approved_state,
        )
        self.assertEqual(
            approved["purchaseRequisitions"][0]["sourceSourcingDecisionId"],  # type: ignore[index]
            decision["id"],
        )

        excessive_cost = deepcopy(approved_state)
        excessive_cost["purchaseRequisitions"][0]["unitCostMmk"] = 83  # type: ignore[index]
        excessive_cost["purchaseRequisitions"][0]["totalMmk"] = 830  # type: ignore[index]
        with self.assertRaisesRegex(TrialValidationError, "approved sourcing decision"):
            validate_commerce_state(excessive_cost)

        late_delivery = deepcopy(approved_state)
        late_delivery["purchaseRequisitions"][0]["expectedAt"] = "2026-07-27T09:00:00.001Z"  # type: ignore[index]
        with self.assertRaisesRegex(TrialValidationError, "approved sourcing decision"):
            validate_commerce_state(late_delivery)

        reused = deepcopy(approved)
        second = purchase_requisition_record(
            requisition_id="PR-00000000-0000-4000-8000-000000000020",
            action_id="ACT-PURCHASE-REQUISITION-SECOND",
            budget_envelope_id=envelope["id"],  # type: ignore[arg-type]
            source_sourcing_decision_id=decision["id"],  # type: ignore[arg-type]
        )
        reused["purchaseRequisitions"] = [second, *approved["purchaseRequisitions"]]  # type: ignore[misc]
        with self.assertRaisesRegex(TrialValidationError, "Consumed supplier sourcing decision"):
            validate_commerce_state(reused)

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

    def test_store_stamps_supplier_invoice_and_payable_review(self) -> None:
        store = InMemoryTrialStore(reducer=reduce_trial_state)
        operator = TrialPrincipal("workspace-invoice", "shop-finance-owner", "human")
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
            payload={"state": catalog_state(), "evidence": action_evidence("ACT-INVOICE-INIT")},
        )
        created_state = deepcopy(initialized.state)
        created_state["purchaseOrders"] = [purchase_order_record()]
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
                payload={
                    "state": created_state,
                    "evidence": evidence_for("commerce.purchase_order.created", created_state),
                },
            )

        received_state = deepcopy(created.state)
        received_state["items"][0]["onHand"] = 20  # type: ignore[index]
        received_state["movements"] = [
            movement(
                "receipt",
                "ACT-INVOICE-RECEIPT",
                10,
                created_at="2099-01-01T00:00:00.000Z",
                purchase_order_id=PURCHASE_ORDER_ID,
            )
        ]
        received_state["movements"][0]["actor"] = "Fabricated receiver"  # type: ignore[index]
        with patch(
            "supermega_runtime.trial_store._utc_now",
            return_value="2026-07-23T09:10:00.000+00:00",
        ):
            received = store.apply_command(
                operator,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.purchase_order.received",
                expected_version=created.version,
                payload={
                    "state": received_state,
                    "evidence": action_evidence(
                        "ACT-INVOICE-RECEIPT",
                        captured_at="2099-01-01T00:00:00.000Z",
                        actor="Fabricated receiver",
                    ),
                },
            )

        invoiced_state = deepcopy(received.state)
        invoice = supplier_invoice_record(
            captured_at="2099-01-01T00:00:00.000Z",
        )
        invoice["recording"]["actor"] = "Fabricated accounts bot"  # type: ignore[index]
        invoiced_state["purchaseOrders"][0]["supplierInvoice"] = invoice  # type: ignore[index]
        invoice_command_id = str(uuid4())
        invoice_payload = {
            "state": invoiced_state,
            "evidence": dict(invoice["recording"]),  # type: ignore[arg-type]
        }
        with patch(
            "supermega_runtime.trial_store._utc_now",
            return_value="2026-07-23T09:20:00.000+00:00",
        ):
            invoiced = store.apply_command(
                operator,
                command_id=invoice_command_id,
                surface="commerce",
                event_type="commerce.supplier_invoice.recorded",
                expected_version=received.version,
                payload=invoice_payload,
            )
            invoice_replay = store.apply_command(
                operator,
                command_id=invoice_command_id,
                surface="commerce",
                event_type="commerce.supplier_invoice.recorded",
                expected_version=received.version,
                payload=invoice_payload,
            )
        retained_invoice = invoiced.state["purchaseOrders"][0]["supplierInvoice"]  # type: ignore[index]
        self.assertEqual(retained_invoice["recording"]["actor"], operator.actor_id)  # type: ignore[index]
        self.assertEqual(
            datetime.fromisoformat(retained_invoice["recording"]["capturedAt"]),  # type: ignore[index]
            datetime.fromisoformat("2026-07-23T09:20:00.000+00:00"),
        )
        self.assertTrue(invoice_replay.idempotent_replay)

        payable_state = deepcopy(invoiced.state)
        payable_state["purchaseOrders"][0]["supplierInvoice"]["payableReview"] = (  # type: ignore[index]
            action_evidence(
                "ACT-INVOICE-PAYABLE-MANAGED",
                captured_at="2099-01-01T00:00:00.000Z",
                actor="Fabricated payable bot",
            )
        )
        with patch(
            "supermega_runtime.trial_store._utc_now",
            return_value="2026-07-23T09:30:00.000+00:00",
        ):
            payable = store.apply_command(
                operator,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.supplier_invoice.payable_ready",
                expected_version=invoiced.version,
                payload={
                    "state": payable_state,
                    "evidence": evidence_for(
                        "commerce.supplier_invoice.payable_ready", payable_state
                    ),
                },
            )
        review = payable.state["purchaseOrders"][0]["supplierInvoice"]["payableReview"]  # type: ignore[index]
        self.assertEqual(review["actor"], operator.actor_id)
        self.assertEqual(
            datetime.fromisoformat(review["capturedAt"]),
            datetime.fromisoformat("2026-07-23T09:30:00.000+00:00"),
        )
        self.assertTrue(
            commerce_supplier_invoice_match(
                payable.state,
                payable.state["purchaseOrders"][0],  # type: ignore[index,arg-type]
            )["payableReady"]
        )

    def test_store_stamps_supplier_return_and_credit_evidence(self) -> None:
        store = InMemoryTrialStore(reducer=reduce_trial_state)
        operator = TrialPrincipal("workspace-supplier-return", "shop-procurement-owner", "human")
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
            payload={"state": catalog_state(), "evidence": action_evidence("ACT-RETURN-INIT")},
        )
        created_state = deepcopy(initialized.state)
        created_state["purchaseOrders"] = [purchase_order_record()]
        with patch("supermega_runtime.trial_store._utc_now", return_value="2026-07-23T09:00:00.000+00:00"):
            created = store.apply_command(
                operator,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.purchase_order.created",
                expected_version=initialized.version,
                payload={
                    "state": created_state,
                    "evidence": evidence_for("commerce.purchase_order.created", created_state),
                },
            )
        receipt = movement(
            "receipt",
            "ACT-RETURN-RECEIPT",
            8,
            created_at="2099-01-01T00:00:00.000Z",
            purchase_order_id=PURCHASE_ORDER_ID,
            rejected_quantity=2,
        )
        received_state = deepcopy(created.state)
        received_state["items"][0]["onHand"] = 18  # type: ignore[index]
        received_state["movements"] = [receipt]
        with patch("supermega_runtime.trial_store._utc_now", return_value="2026-07-23T09:40:00.000+00:00"):
            received = store.apply_command(
                operator,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.purchase_order.received",
                expected_version=created.version,
                payload={
                    "state": received_state,
                    "evidence": action_evidence(
                        "ACT-RETURN-RECEIPT",
                        captured_at="2099-01-01T00:00:00.000Z",
                        actor="Fabricated receiver",
                    ),
                },
            )
        receipt_id = received.state["movements"][0]["id"]  # type: ignore[index]
        claim = supplier_return_claim_record(
            str(receipt_id),
            captured_at="2099-01-01T00:00:00.000Z",
        )
        claim["authorization"]["actor"] = "Fabricated returns bot"  # type: ignore[index]
        claimed_state = deepcopy(received.state)
        claimed_state["purchaseOrders"][0]["supplierReturns"] = [claim]  # type: ignore[index]
        claim_command_id = str(uuid4())
        claim_payload = {
            "state": claimed_state,
            "evidence": evidence_for("commerce.supplier_return.authorized", claimed_state),
        }
        with patch("supermega_runtime.trial_store._utc_now", return_value="2026-07-23T09:50:00.000+00:00"):
            claimed = store.apply_command(
                operator,
                command_id=claim_command_id,
                surface="commerce",
                event_type="commerce.supplier_return.authorized",
                expected_version=received.version,
                payload=claim_payload,
            )
            replay = store.apply_command(
                operator,
                command_id=claim_command_id,
                surface="commerce",
                event_type="commerce.supplier_return.authorized",
                expected_version=received.version,
                payload=claim_payload,
            )
        retained_claim = claimed.state["purchaseOrders"][0]["supplierReturns"][0]  # type: ignore[index]
        self.assertEqual(retained_claim["authorization"]["actor"], operator.actor_id)
        self.assertEqual(
            datetime.fromisoformat(retained_claim["createdAt"]),
            datetime.fromisoformat("2026-07-23T09:50:00.000+00:00"),
        )
        self.assertTrue(replay.idempotent_replay)

        credit = supplier_credit_note_record(captured_at="2099-01-01T00:00:00.000Z")
        credit["recording"]["actor"] = "Fabricated accounts bot"  # type: ignore[index]
        credited_state = deepcopy(claimed.state)
        credited_state["purchaseOrders"][0]["supplierReturns"][0]["creditNotes"] = [credit]  # type: ignore[index]
        with patch("supermega_runtime.trial_store._utc_now", return_value="2026-07-23T10:00:00.000+00:00"):
            credited = store.apply_command(
                operator,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.supplier_credit.recorded",
                expected_version=claimed.version,
                payload={
                    "state": credited_state,
                    "evidence": evidence_for("commerce.supplier_credit.recorded", credited_state),
                },
            )
        retained_credit = credited.state["purchaseOrders"][0]["supplierReturns"][0]["creditNotes"][0]  # type: ignore[index]
        self.assertEqual(retained_credit["recording"]["actor"], operator.actor_id)
        self.assertEqual(
            datetime.fromisoformat(retained_credit["recording"]["capturedAt"]),
            datetime.fromisoformat("2026-07-23T10:00:00.000+00:00"),
        )
        self.assertFalse(retained_credit["accountingPosted"])

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

        missing_terms = deepcopy(current)
        purchase_order_without_terms = purchase_order_record()
        purchase_order_without_terms.pop("unitCostMmk")
        missing_terms["purchaseOrders"] = [purchase_order_without_terms]
        self.assertEqual(
            validate_commerce_state(missing_terms)["purchaseOrders"],
            [purchase_order_without_terms],
        )
        with self.assertRaisesRegex(TrialValidationError, "requires retained whole-MMK unit cost"):
            apply_event(current, "commerce.purchase_order.created", missing_terms)

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

    def test_purchase_receipt_retains_rejected_units_without_adding_them_to_stock(self) -> None:
        current = catalog_state()
        current["purchaseOrders"] = [purchase_order_record()]
        accepted_state = deepcopy(current)
        accepted_state["items"][0]["onHand"] = 16  # type: ignore[index]
        accepted_state["movements"] = [
            movement(
                "receipt",
                "ACT-PURCHASE-DISCREPANCY",
                6,
                created_at="2026-07-23T09:10:00.000Z",
                purchase_order_id=PURCHASE_ORDER_ID,
                rejected_quantity=4,
                discrepancy_code="quality_failed",
            )
        ]
        accepted = apply_event(
            current,
            "commerce.purchase_order.received",
            accepted_state,
        )
        receipt = accepted["movements"][0]  # type: ignore[index]
        self.assertEqual(accepted["items"][0]["onHand"], 16)  # type: ignore[index]
        self.assertEqual(receipt["quantityDelta"], 6)  # type: ignore[index]
        self.assertEqual(receipt["rejectedQuantity"], 4)  # type: ignore[index]
        self.assertEqual(receipt["discrepancyDisposition"], "return_to_vendor")  # type: ignore[index]

        incomplete = deepcopy(accepted_state)
        del incomplete["movements"][0]["discrepancyCode"]  # type: ignore[index]
        with self.assertRaisesRegex(TrialValidationError, "discrepancy fields are incomplete"):
            apply_event(current, "commerce.purchase_order.received", incomplete)

        over_delivery = deepcopy(accepted_state)
        over_delivery["items"][0]["onHand"] = 17  # type: ignore[index]
        over_delivery["movements"][0]["quantityDelta"] = 7  # type: ignore[index]
        with self.assertRaisesRegex(TrialValidationError, "outstanding quantity|exceeds its purchase order"):
            apply_event(current, "commerce.purchase_order.received", over_delivery)

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
        current["orders"][0]["paymentDueAt"] = "2026-08-22T09:00:00.000Z"  # type: ignore[index]
        current = validate_commerce_state(current)
        contact_proof = action_evidence(
            "ACT-COLLECTION-1",
            captured_at="2026-07-23T09:05:00.000Z",
            reason="Recorded a customer payment follow-up.",
        )
        contacted = deepcopy(current)
        contacted["orders"][0]["collectionActions"] = [  # type: ignore[index]
            {"kind": "customer_contact", "proof": contact_proof}
        ]
        current = apply_event(
            current,
            "commerce.collection_action.recorded",
            contacted,
        )
        self.assertEqual(
            current["orders"][0]["collectionActions"][0]["proof"],  # type: ignore[index]
            contact_proof,
        )
        rewritten_due = deepcopy(current)
        rewritten_due["orders"][0]["paymentDueAt"] = "2026-08-23T09:00:00.000Z"  # type: ignore[index]
        rewritten_due["orders"][0]["collectionActions"] = [  # type: ignore[index]
            {
                "kind": "customer_contact",
                "proof": action_evidence(
                    "ACT-COLLECTION-2",
                    captured_at="2026-07-23T09:06:00.000Z",
                ),
            },
            *current["orders"][0]["collectionActions"],  # type: ignore[index]
        ]
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.collection_action.recorded",
                rewritten_due,
            )
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

    def test_order_support_case_opens_and_resolves_without_external_side_effects(self) -> None:
        request_uuid = "12345678-1234-4123-8123-123456789ABC"
        request_id = f"ECR-{request_uuid}"
        intent_id = f"ESR-{request_uuid}"
        case_id = f"CASE-{request_uuid}"
        requested_at = "2026-07-23T09:25:00.000Z"
        opening_at = "2026-07-23T09:30:00.000Z"
        resolution_at = "2026-07-23T09:40:00.000Z"
        evidence_reference = f"ECOMMERCE-SUPPORT:{request_uuid}:ORD-1:{request_id}"
        current = completed_state()
        current["orders"][0]["sourceRecordId"] = request_id  # type: ignore[index]
        current = validate_commerce_state(current)

        opening = action_evidence(
            "ACT-SUPPORT-OPEN",
            captured_at=opening_at,
            reason="Reviewed the customer help request.",
            evidence_reference=evidence_reference,
        )
        opened_candidate = deepcopy(current)
        opened_candidate["orders"][0]["supportCases"] = [{  # type: ignore[index]
            "caseId": case_id,
            "sourceIntentId": intent_id,
            "sourceRequestId": request_id,
            "customerRequestedAt": requested_at,
            "category": "delivery_issue",
            "customerDescription": "Delivery arrived later than the promised time.",
            "priority": "high",
            "owner": "Support owner",
            "dueAt": "2026-07-23T13:30:00.000Z",
            "status": "open",
            "opening": opening,
            "externalMessageSent": False,
            "refundStarted": False,
        }]
        opened = apply_event(
            current,
            "commerce.order.support_case_opened",
            opened_candidate,
        )
        support_case = opened["orders"][0]["supportCases"][0]  # type: ignore[index]
        self.assertEqual(support_case["status"], "open")
        self.assertEqual(support_case["priority"], "high")
        self.assertEqual(support_case["owner"], "Support owner")
        self.assertFalse(support_case["externalMessageSent"])
        self.assertFalse(support_case["refundStarted"])
        self.assertEqual(opened["items"], current["items"])
        self.assertEqual(opened["movements"], current["movements"])

        reassigned_candidate = deepcopy(opened)
        reassigned_candidate["orders"][0]["supportCases"][0]["serviceEvents"] = [{  # type: ignore[index]
            "kind": "reassigned",
            "owner": "Tier 2 owner",
            "priority": "high",
            "dueAt": "2026-07-23T13:30:00.000Z",
            "note": "Assigned to the delivery specialist.",
            "proof": action_evidence(
                "ACT-SUPPORT-REASSIGN",
                captured_at="2026-07-23T09:35:00.000Z",
                reason="Assign the case to the delivery specialist.",
                evidence_reference=f"SUPPORT-SERVICE:{case_id}",
            ),
        }]
        reassigned = apply_event(
            opened,
            "commerce.order.support_case_service_recorded",
            reassigned_candidate,
        )
        self.assertEqual(
            reassigned["orders"][0]["supportCases"][0]["serviceEvents"][0]["owner"],  # type: ignore[index]
            "Tier 2 owner",
        )

        escalated_candidate = deepcopy(reassigned)
        escalated_case = escalated_candidate["orders"][0]["supportCases"][0]  # type: ignore[index]
        escalated_case["serviceEvents"] = [{
            "kind": "escalated",
            "owner": "Tier 2 owner",
            "priority": "urgent",
            "dueAt": "2026-07-23T12:30:00.000Z",
            "note": "Customer delivery impact now requires urgent review.",
            "proof": action_evidence(
                "ACT-SUPPORT-ESCALATE",
                captured_at="2026-07-23T09:36:00.000Z",
                reason="Escalate the delivery case without changing its owner.",
                evidence_reference=f"SUPPORT-SERVICE:{case_id}",
            ),
        }, *escalated_case["serviceEvents"]]
        escalated = apply_event(
            reassigned,
            "commerce.order.support_case_service_recorded",
            escalated_candidate,
        )
        self.assertEqual(
            escalated["orders"][0]["supportCases"][0]["serviceEvents"][0]["priority"],  # type: ignore[index]
            "urgent",
        )
        self.assertEqual(escalated["items"], current["items"])
        self.assertEqual(escalated["movements"], current["movements"])

        overdue_reassignment_candidate = deepcopy(opened)
        overdue_case = overdue_reassignment_candidate["orders"][0]["supportCases"][0]  # type: ignore[index]
        overdue_case["serviceEvents"] = [{
            "kind": "reassigned",
            "owner": "Overdue recovery owner",
            "priority": "high",
            "dueAt": "2026-07-23T13:30:00.000Z",
            "note": "Take accountable ownership of the overdue case.",
            "proof": action_evidence(
                "ACT-SUPPORT-OVERDUE-REASSIGN",
                captured_at="2026-07-23T14:00:00.000Z",
                reason="Reassign overdue work without rewriting its target.",
                evidence_reference=f"SUPPORT-SERVICE:{case_id}",
            ),
        }]
        overdue_reassignment = apply_event(
            opened,
            "commerce.order.support_case_service_recorded",
            overdue_reassignment_candidate,
        )
        self.assertEqual(
            overdue_reassignment["orders"][0]["supportCases"][0]["serviceEvents"][0]["owner"],  # type: ignore[index]
            "Overdue recovery owner",
        )

        unresolved_candidate = deepcopy(escalated)
        unresolved_case = unresolved_candidate["orders"][0]["supportCases"][0]  # type: ignore[index]
        unresolved_case["status"] = "resolved"
        unresolved_case["resolution"] = {
            "outcome": "no_action",
            "note": "Invalid close before response readiness.",
            "proof": action_evidence(
                "ACT-SUPPORT-EARLY-RESOLVE",
                captured_at="2026-07-23T09:37:00.000Z",
                evidence_reference=f"SUPPORT-RESOLUTION:{case_id}",
            ),
        }
        with self.assertRaises(TrialValidationError):
            apply_event(escalated, "commerce.order.support_case_resolved", unresolved_candidate)

        response_before_ack_candidate = deepcopy(escalated)
        response_before_ack_case = response_before_ack_candidate["orders"][0]["supportCases"][0]  # type: ignore[index]
        response_before_ack_case["serviceEvents"] = [{
            "kind": "first_response_ready",
            "owner": "Tier 2 owner",
            "priority": "urgent",
            "dueAt": "2026-07-23T12:30:00.000Z",
            "note": "Invalid response readiness before acknowledgement.",
            "proof": action_evidence(
                "ACT-SUPPORT-EARLY-RESPONSE",
                captured_at="2026-07-23T09:37:00.000Z",
                evidence_reference=f"SUPPORT-SERVICE:{case_id}",
            ),
        }, *response_before_ack_case["serviceEvents"]]
        with self.assertRaises(TrialValidationError):
            apply_event(
                escalated,
                "commerce.order.support_case_service_recorded",
                response_before_ack_candidate,
            )

        acknowledged_candidate = deepcopy(escalated)
        acknowledged_case = acknowledged_candidate["orders"][0]["supportCases"][0]  # type: ignore[index]
        acknowledged_case["serviceEvents"] = [{
            "kind": "acknowledged",
            "owner": "Tier 2 owner",
            "priority": "urgent",
            "dueAt": "2026-07-23T12:30:00.000Z",
            "note": "Delivery specialist accepted the case internally.",
            "proof": action_evidence(
                "ACT-SUPPORT-ACKNOWLEDGE",
                captured_at="2026-07-23T09:37:00.000Z",
                reason="Acknowledge accountable ownership without sending a message.",
                evidence_reference=f"SUPPORT-SERVICE:{case_id}",
            ),
        }, *acknowledged_case["serviceEvents"]]
        acknowledged = apply_event(
            escalated,
            "commerce.order.support_case_service_recorded",
            acknowledged_candidate,
        )

        response_candidate = deepcopy(acknowledged)
        response_case = response_candidate["orders"][0]["supportCases"][0]  # type: ignore[index]
        response_case["serviceEvents"] = [{
            "kind": "first_response_ready",
            "owner": "Tier 2 owner",
            "priority": "urgent",
            "dueAt": "2026-07-23T12:30:00.000Z",
            "note": "Reviewed first response is ready for independent delivery.",
            "proof": action_evidence(
                "ACT-SUPPORT-RESPONSE-READY",
                captured_at="2026-07-23T09:38:00.000Z",
                reason="Record response readiness without sending a customer message.",
                evidence_reference=f"SUPPORT-SERVICE:{case_id}",
            ),
        }, *response_case["serviceEvents"]]
        response_ready = apply_event(
            acknowledged,
            "commerce.order.support_case_service_recorded",
            response_candidate,
        )
        self.assertEqual(
            response_ready["orders"][0]["supportCases"][0]["serviceEvents"][0]["kind"],  # type: ignore[index]
            "first_response_ready",
        )

        resolution = {
            "outcome": "information_provided",
            "note": "Reviewed the delivery timeline with the customer record.",
            "proof": action_evidence(
                "ACT-SUPPORT-RESOLVE",
                captured_at=resolution_at,
                reason="Reviewed and closed the support case.",
                evidence_reference=f"SUPPORT-RESOLUTION:{case_id}",
            ),
        }
        resolved_candidate = deepcopy(response_ready)
        resolved_case = resolved_candidate["orders"][0]["supportCases"][0]  # type: ignore[index]
        resolved_case["status"] = "resolved"
        resolved_case["resolution"] = resolution
        resolved = apply_event(
            response_ready,
            "commerce.order.support_case_resolved",
            resolved_candidate,
        )
        self.assertEqual(
            resolved["orders"][0]["supportCases"][0]["resolution"]["outcome"],  # type: ignore[index]
            "information_provided",
        )
        self.assertEqual(resolved["items"], current["items"])
        self.assertEqual(resolved["movements"], current["movements"])

        reopened_candidate = deepcopy(resolved)
        reopened_case = reopened_candidate["orders"][0]["supportCases"][0]  # type: ignore[index]
        reopened_case["status"] = "open"
        reopened_case["reopen"] = {
            "sourceResolutionActionId": "ACT-SUPPORT-RESOLVE",
            "owner": "Follow-up owner",
            "priority": "high",
            "dueAt": "2026-07-23T14:00:00.000Z",
            "note": "Customer issue recurred after the retained resolution.",
            "proof": action_evidence(
                "ACT-SUPPORT-REOPEN",
                captured_at="2026-07-23T10:00:00.000Z",
                reason="Reopen one linked follow-up without sending a message.",
                evidence_reference=f"SUPPORT-REOPEN:{case_id}:ACT-SUPPORT-RESOLVE",
            ),
        }
        reopened = apply_event(
            resolved,
            "commerce.order.support_case_reopened",
            reopened_candidate,
        )
        active_reopen = reopened["orders"][0]["supportCases"][0]  # type: ignore[index]
        self.assertEqual(active_reopen["status"], "open")
        self.assertEqual(active_reopen["resolution"], resolution)
        self.assertEqual(active_reopen["reopen"]["owner"], "Follow-up owner")

        follow_up_ack_candidate = deepcopy(reopened)
        follow_up_ack_case = follow_up_ack_candidate["orders"][0]["supportCases"][0]  # type: ignore[index]
        follow_up_ack_case["followUpServiceEvents"] = [{
            "kind": "acknowledged",
            "owner": "Follow-up owner",
            "priority": "high",
            "dueAt": "2026-07-23T14:00:00.000Z",
            "note": "Follow-up owner accepted the reopened case.",
            "proof": action_evidence(
                "ACT-SUPPORT-FOLLOWUP-ACK",
                captured_at="2026-07-23T10:01:00.000Z",
                evidence_reference=f"SUPPORT-SERVICE:{case_id}",
            ),
        }]
        follow_up_acknowledged = apply_event(
            reopened,
            "commerce.order.support_case_service_recorded",
            follow_up_ack_candidate,
        )

        follow_up_response_candidate = deepcopy(follow_up_acknowledged)
        follow_up_response_case = follow_up_response_candidate["orders"][0]["supportCases"][0]  # type: ignore[index]
        follow_up_response_case["followUpServiceEvents"] = [{
            "kind": "first_response_ready",
            "owner": "Follow-up owner",
            "priority": "high",
            "dueAt": "2026-07-23T14:00:00.000Z",
            "note": "Follow-up response is ready for independent delivery.",
            "proof": action_evidence(
                "ACT-SUPPORT-FOLLOWUP-RESPONSE",
                captured_at="2026-07-23T10:02:00.000Z",
                evidence_reference=f"SUPPORT-SERVICE:{case_id}",
            ),
        }, *follow_up_response_case["followUpServiceEvents"]]
        follow_up_response_ready = apply_event(
            follow_up_acknowledged,
            "commerce.order.support_case_service_recorded",
            follow_up_response_candidate,
        )

        follow_up_resolved_candidate = deepcopy(follow_up_response_ready)
        follow_up_resolved_case = follow_up_resolved_candidate["orders"][0]["supportCases"][0]  # type: ignore[index]
        follow_up_resolved_case["status"] = "resolved"
        follow_up_resolved_case["followUpResolution"] = {
            "outcome": "information_provided",
            "note": "Follow-up was reviewed and closed separately.",
            "proof": action_evidence(
                "ACT-SUPPORT-FOLLOWUP-RESOLVE",
                captured_at="2026-07-23T10:03:00.000Z",
                evidence_reference=f"SUPPORT-RESOLUTION:{case_id}",
            ),
        }
        follow_up_resolved = apply_event(
            follow_up_response_ready,
            "commerce.order.support_case_resolved",
            follow_up_resolved_candidate,
        )
        retained_case = follow_up_resolved["orders"][0]["supportCases"][0]  # type: ignore[index]
        self.assertEqual(retained_case["resolution"], resolution)
        self.assertEqual(retained_case["followUpResolution"]["proof"]["actionId"], "ACT-SUPPORT-FOLLOWUP-RESOLVE")
        self.assertFalse(retained_case["externalMessageSent"])

        forged_reopen = deepcopy(resolved)
        forged_case = forged_reopen["orders"][0]["supportCases"][0]  # type: ignore[index]
        forged_case["status"] = "open"
        forged_case["reopen"] = {**reopened_case["reopen"], "sourceResolutionActionId": "ACT-WRONG"}
        with self.assertRaises(TrialValidationError):
            apply_event(resolved, "commerce.order.support_case_reopened", forged_reopen)

        forged = deepcopy(opened_candidate)
        forged["orders"][0]["supportCases"][0]["refundStarted"] = True  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(forged)

        missing_triage = deepcopy(opened_candidate)
        del missing_triage["orders"][0]["supportCases"][0]["owner"]  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(current, "commerce.order.support_case_opened", missing_triage)

        invalid_escalation = deepcopy(reassigned)
        invalid_case = invalid_escalation["orders"][0]["supportCases"][0]  # type: ignore[index]
        invalid_case["serviceEvents"] = [{
            "kind": "escalated",
            "owner": "Different owner",
            "priority": "urgent",
            "dueAt": "2026-07-23T12:30:00.000Z",
            "note": "Invalid combined escalation and reassignment.",
            "proof": action_evidence(
                "ACT-SUPPORT-INVALID-ESCALATE",
                captured_at="2026-07-23T09:36:00.000Z",
                evidence_reference=f"SUPPORT-SERVICE:{case_id}",
            ),
        }, *invalid_case["serviceEvents"]]
        with self.assertRaises(TrialValidationError):
            apply_event(
                reassigned,
                "commerce.order.support_case_service_recorded",
                invalid_escalation,
            )

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
        handoff = commerce_accounting_handoff(accepted_close, CLOSE_ID_2)
        self.assertIsNotNone(handoff)
        assert handoff is not None
        self.assertEqual(handoff["schema"], "supermega.commerce.accounting-handoff.v3")
        self.assertEqual(handoff["originalOrderTotalMmk"], 200)
        self.assertEqual(handoff["netOrderTotalMmk"], 150)
        self.assertEqual(handoff["correctionCount"], 1)
        self.assertEqual(handoff["creditCorrectionMmk"], 50)
        self.assertEqual(handoff["debitCorrectionMmk"], 0)
        self.assertEqual(handoff["totalDebitMmk"], 250)
        self.assertEqual(handoff["totalCreditMmk"], 250)
        correction_entries = [
            entry for entry in handoff["entries"]
            if entry["sourceDocumentId"] == record["documentId"]
        ]
        self.assertEqual(
            [(entry["side"], entry["accountRole"], entry["amountMmk"]) for entry in correction_entries],
            [("debit", "sales_adjustment", 50), ("credit", "correction_payable", 50)],
        )
        self.assertTrue(
            all(entry["sourceOrderId"] == current["orders"][0]["id"] for entry in correction_entries)  # type: ignore[index]
        )
        self.assertTrue(all(entry["mappingStatus"] == "unmapped" for entry in correction_entries))
        correction_csv = commerce_accounting_handoff_csv(handoff)
        self.assertIn('"source_document_id"', correction_csv)
        self.assertIn(f'"{record["documentId"]}"', correction_csv)
        self.assertEqual(handoff, commerce_accounting_handoff(accepted_close, CLOSE_ID_2))
        legacy_mapped_close = deepcopy(accepted_close)
        legacy_mapped_close["accountMappingConfigurations"] = [
            account_mapping_configuration(1, legacy=True)
        ]
        legacy_mapped_handoff = commerce_accounting_handoff(
            validate_commerce_state(legacy_mapped_close), CLOSE_ID_2
        )
        self.assertIsNotNone(legacy_mapped_handoff)
        assert legacy_mapped_handoff is not None
        self.assertTrue(
            all(
                entry["mappingStatus"] == "mapped"
                for entry in legacy_mapped_handoff["entries"]
                if entry["accountRole"] in {
                    "payment_clearing", "sales_revenue", "tax_payable"
                }
            )
        )
        self.assertTrue(
            all(
                entry["mappingStatus"] == "unmapped"
                for entry in legacy_mapped_handoff["entries"]
                if entry["accountRole"] in {"sales_adjustment", "correction_payable"}
            )
        )

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

    def test_daily_close_settlement_matches_payment_totals_and_retains_owned_variance(self) -> None:
        current = completed_state("ORD-SETTLEMENT")
        close = close_record(current, CLOSE_ACTION_ID_2, close_id=CLOSE_ID_2, captured_at="2026-07-23T10:00:00.000Z")
        payment_method = current["orders"][0]["payment"]  # type: ignore[index]
        close["settlement"] = {
            "schema": "supermega.commerce.close-settlement.v1",
            "status": "matched",
            "totalExpectedMmk": 200,
            "totalCountedMmk": 200,
            "totalVarianceMmk": 0,
            "lines": [{
                "paymentMethod": payment_method,
                "expectedMmk": 200,
                "countedMmk": 200,
                "varianceMmk": 0,
                "status": "matched",
                "varianceOwner": None,
                "varianceReason": None,
            }],
        }
        matched_state = deepcopy(current)
        matched_state["closes"] = [close]
        accepted = apply_event(current, "commerce.close.saved", matched_state)
        self.assertEqual(accepted["closes"][0]["settlement"]["status"], "matched")  # type: ignore[index]

        variance_state = deepcopy(current)
        variance_close = close_record(current, CLOSE_ACTION_ID_3, close_id=CLOSE_ID_3, captured_at="2026-07-23T10:00:00.000Z")
        variance_close["settlement"] = {
            **deepcopy(close["settlement"]),
            "status": "variance_review",
            "totalCountedMmk": 190,
            "totalVarianceMmk": -10,
            "lines": [{
                "paymentMethod": payment_method,
                "expectedMmk": 200,
                "countedMmk": 190,
                "varianceMmk": -10,
                "status": "variance_review",
                "varianceOwner": "Shift lead",
                "varianceReason": "Cash drawer recount required.",
            }],
        }
        variance_state["closes"] = [variance_close]
        variance_accepted = apply_event(current, "commerce.close.saved", variance_state)
        self.assertEqual(variance_accepted["closes"][0]["settlement"]["totalVarianceMmk"], -10)  # type: ignore[index]

        forged_total = deepcopy(matched_state)
        forged_total["closes"][0]["settlement"]["totalCountedMmk"] = 201  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(forged_total)

        unowned_variance = deepcopy(variance_state)
        unowned_variance["closes"][0]["settlement"]["lines"][0]["varianceOwner"] = None  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(unowned_variance)

        wrong_payment = deepcopy(matched_state)
        wrong_payment["closes"][0]["settlement"]["lines"][0]["paymentMethod"] = "Unknown"  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            validate_commerce_state(wrong_payment)

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

    def test_customer_credit_policy_is_versioned_and_gates_new_credit_orders(self) -> None:
        current = catalog_state()
        policy = {
            "revision": 1,
            "customer": "Customer ref",
            "creditLimitMmk": 250,
            "maxPaymentTermsDays": 30,
            "status": "active",
            "proof": action_evidence(
                "ACT-CREDIT-R1",
                reason="Reviewed the customer credit boundary for future Shop orders.",
            ),
        }
        configured_state = deepcopy(current)
        configured_state["customerCreditPolicies"] = [policy]
        configured = apply_event(
            current,
            "commerce.customer_credit_policy.saved",
            configured_state,
        )
        self.assertEqual(configured["customerCreditPolicies"], [policy])
        self.assertEqual(
            apply_event(
                current,
                "commerce.customer_credit_policy.saved",
                configured_state,
            ),
            configured,
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "commerce.customer_credit_policy.saved",
                configured_state,
                action_evidence("ACT-WRONG-CREDIT-EVIDENCE"),
            )

        unchanged = deepcopy(configured)
        unchanged["customerCreditPolicies"] = [  # type: ignore[index]
            {
                **policy,
                "revision": 2,
                "proof": action_evidence("ACT-CREDIT-R2"),
            },
            policy,
        ]
        with self.assertRaises(TrialValidationError):
            apply_event(
                configured,
                "commerce.customer_credit_policy.saved",
                unchanged,
            )

        order = order_record("ORD-CREDIT-1")
        order["paymentDueAt"] = "2026-08-22T09:00:00.000Z"
        order["lines"] = [
            {
                "sku": "SKU-1",
                "name": "Test item",
                "quantity": 2,
                "unitPriceMmk": 100,
            }
        ]
        order["creditDecision"] = {
            "policyRevision": 1,
            "policyActionId": "ACT-CREDIT-R1",
            "creditLimitMmk": 250,
            "exposureBeforeMmk": 0,
            "orderAmountMmk": 200,
            "exposureAfterMmk": 200,
            "maxPaymentTermsDays": 30,
            "paymentTermsDays": 30,
            "status": "approved",
        }
        ordered_state = deepcopy(configured)
        ordered_state["items"][0]["onHand"] = 8  # type: ignore[index]
        ordered_state["orders"] = [order]
        ordered_state["movements"] = [
            movement("reserve", "ACT-CREDIT-ORDER-1", -2, order_id="ORD-CREDIT-1")
        ]
        accepted = apply_event(
            configured,
            "commerce.order.created",
            ordered_state,
        )
        self.assertEqual(
            accepted["orders"][0]["creditDecision"]["exposureAfterMmk"],  # type: ignore[index]
            200,
        )

        missing_decision = deepcopy(ordered_state)
        missing_decision["orders"][0].pop("creditDecision")  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(
                configured,
                "commerce.order.created",
                missing_decision,
            )

        forged_decision = deepcopy(ordered_state)
        forged_decision["orders"][0]["creditDecision"]["exposureBeforeMmk"] = 1  # type: ignore[index]
        forged_decision["orders"][0]["creditDecision"]["exposureAfterMmk"] = 201  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(
                configured,
                "commerce.order.created",
                forged_decision,
            )

        legacy_credit = deepcopy(accepted)
        legacy_credit["orders"][0].pop("creditDecision")  # type: ignore[index]
        self.assertNotIn(
            "creditDecision",
            validate_commerce_state(legacy_credit)["orders"][0],
        )

        over_limit = deepcopy(accepted)
        second_order = order_record("ORD-CREDIT-2")
        second_order.update(
            {
                "quantity": 1,
                "total": 100,
                "paymentDueAt": "2026-08-22T09:00:00.000Z",
                "lines": [
                    {
                        "sku": "SKU-1",
                        "name": "Test item",
                        "quantity": 1,
                        "unitPriceMmk": 100,
                    }
                ],
                "creditDecision": {
                    "policyRevision": 1,
                    "policyActionId": "ACT-CREDIT-R1",
                    "creditLimitMmk": 250,
                    "exposureBeforeMmk": 200,
                    "orderAmountMmk": 100,
                    "exposureAfterMmk": 300,
                    "maxPaymentTermsDays": 30,
                    "paymentTermsDays": 30,
                    "status": "approved",
                },
            }
        )
        over_limit["items"][0]["onHand"] = 7  # type: ignore[index]
        over_limit["orders"] = [second_order, *accepted["orders"]]  # type: ignore[index]
        over_limit["movements"] = [  # type: ignore[index]
            movement("reserve", "ACT-CREDIT-ORDER-2", -1, order_id="ORD-CREDIT-2"),
            *accepted["movements"],  # type: ignore[index]
        ]
        with self.assertRaises(TrialValidationError):
            apply_event(accepted, "commerce.order.created", over_limit)

        store = InMemoryTrialStore(reducer=reduce_trial_state)
        operator = TrialPrincipal("workspace-credit", "operator-credit", "human")
        agent = TrialPrincipal("workspace-credit", "credit-agent", "agent")
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
                "evidence": action_evidence("ACT-INIT-CREDIT"),
            },
        )
        forged_policy = {
            **policy,
            "proof": action_evidence(
                "ACT-CREDIT-SERVER",
                captured_at="2099-01-01T00:00:00.000Z",
                actor="forged-actor",
            ),
        }
        forged_state = deepcopy(initialized.state)
        forged_state["customerCreditPolicies"] = [forged_policy]
        payload = {
            "state": forged_state,
            "evidence": dict(forged_policy["proof"]),
        }
        command_id = str(uuid4())
        saved = store.apply_command(
            operator,
            command_id=command_id,
            surface="commerce",
            event_type="commerce.customer_credit_policy.saved",
            expected_version=initialized.version,
            payload=payload,
        )
        replay = store.apply_command(
            operator,
            command_id=command_id,
            surface="commerce",
            event_type="commerce.customer_credit_policy.saved",
            expected_version=initialized.version,
            payload=payload,
        )
        saved_proof = saved.state["customerCreditPolicies"][0]["proof"]  # type: ignore[index]
        self.assertEqual(saved_proof["actor"], operator.actor_id)
        self.assertNotEqual(saved_proof["capturedAt"], "2099-01-01T00:00:00.000Z")
        self.assertTrue(replay.idempotent_replay)
        with self.assertRaises(TrialHumanApprovalRequired):
            store.apply_command(
                agent,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.customer_credit_policy.saved",
                expected_version=saved.version,
                payload=payload,
            )

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

    def test_order_acknowledgement_is_deterministic_customer_safe_and_fail_closed(self) -> None:
        current = created_state()
        current["orders"][0]["lines"] = [  # type: ignore[index]
            {
                "sku": "SKU-1",
                "name": "Test item",
                "quantity": 2,
                "unitPriceMmk": 100,
            }
        ]
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

        artifact = commerce_order_acknowledgement(current, "ORD-1")
        self.assertIsNotNone(artifact)
        assert artifact is not None
        self.assertEqual(artifact, commerce_order_acknowledgement(current, "ORD-1"))
        self.assertEqual(artifact["schema"], "supermega.commerce.order-acknowledgement.v1")
        self.assertEqual(artifact["lines"][0]["lineTotalMmk"], 200)
        self.assertEqual(artifact["promotion"]["status"], "not_recorded")
        self.assertEqual(artifact["tax"]["status"], "not_configured")
        self.assertEqual(artifact["payment"]["status"], "pending")
        self.assertEqual(artifact["cancellation"]["state"], "not_cancelled")
        self.assertEqual(artifact["evidence"]["confirmationActionId"], "ACT-ORD-1")
        self.assertEqual(
            artifact["controls"],
            {
                "customerMessageSent": False,
                "taxInvoiceIssued": False,
                "paymentProviderCalled": False,
                "externalWritePerformed": False,
            },
        )
        self.assertEqual(
            artifact["digest"],
            "sha256:ae097cca2bb06cbedb37863950f51513ec6c30cc86cc2f23bcdcbeaa9e6ef4fb",
        )
        text = commerce_order_acknowledgement_text(artifact)
        self.assertIn("Not a tax invoice, receipt, or payment confirmation.", text)
        self.assertIn("Document digest: sha256:", text)
        self.assertNotIn("Accountable operator", text)
        self.assertNotIn("Verified against the source record", text)

        legacy = created_state("ORD-LEGACY")
        self.assertIsNone(commerce_order_acknowledgement(legacy, "ORD-LEGACY"))
        self.assertIsNone(commerce_order_acknowledgement(current, "ORD-UNKNOWN"))

        tampered = deepcopy(current)
        tampered["orders"][0]["lines"][0]["unitPriceMmk"] = 101  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            commerce_order_acknowledgement(tampered, "ORD-1")

        cancelled = cancelled_due_state()
        cancelled["orders"][0]["lines"] = deepcopy(current["orders"][0]["lines"])  # type: ignore[index]
        cancelled["orders"][0]["calculation"] = deepcopy(current["orders"][0]["calculation"])  # type: ignore[index]
        cancelled_artifact = commerce_order_acknowledgement(
            validate_commerce_state(cancelled),
            "ORD-REFUND",
        )
        self.assertIsNotNone(cancelled_artifact)
        assert cancelled_artifact is not None
        self.assertEqual(cancelled_artifact["cancellation"]["state"], "cancelled")
        self.assertEqual(cancelled_artifact["cancellation"]["actionId"], "ACT-CANCEL-ORD-REFUND")
        self.assertEqual(cancelled_artifact["payment"]["refundStatus"], "due")

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
        self.assertEqual(unmapped_handoff["schema"], "supermega.commerce.accounting-handoff.v3")
        self.assertEqual(unmapped_handoff["originalOrderTotalMmk"], 200)
        self.assertEqual(unmapped_handoff["netOrderTotalMmk"], 200)
        self.assertEqual(unmapped_handoff["correctionCount"], 0)
        self.assertEqual(unmapped_handoff["creditCorrectionMmk"], 0)
        self.assertEqual(unmapped_handoff["debitCorrectionMmk"], 0)
        self.assertIsNone(unmapped_handoff["accountMappingRevision"])
        self.assertTrue(
            all(
                entry["mappingStatus"] == "unmapped"
                and entry["externalAccountCode"] is None
                for entry in unmapped_handoff["entries"]
            )
        )
        self.assertEqual(unmapped_handoff["totalDebitMmk"], unmapped_handoff["totalCreditMmk"])
        self.assertTrue(
            all(
                entry["sourceOrderId"] is None and entry["sourceDocumentId"] is None
                for entry in unmapped_handoff["entries"]
            )
        )

        legacy_mapping = deepcopy(current)
        legacy_mapping["accountMappingConfigurations"] = [
            account_mapping_configuration(1, legacy=True)
        ]
        legacy_mapping = validate_commerce_state(legacy_mapping)
        self.assertEqual(len(legacy_mapping["accountMappingConfigurations"][0]["mappings"]), 4)  # type: ignore[index]

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
        collection_state = deepcopy(preparing.state)
        forged_collection_proof = action_evidence(
            "ACT-STORE-COLLECTION",
            captured_at="2099-01-01T00:00:00.000Z",
            actor="Fabricated Collection Bot",
            reason="Recorded a customer payment follow-up.",
        )
        collection_state["orders"][0]["collectionActions"] = [  # type: ignore[index]
            {"kind": "customer_contact", "proof": forged_collection_proof}
        ]
        contacted = store.apply_command(
            principal,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.collection_action.recorded",
            expected_version=preparing.version,
            payload={
                "state": collection_state,
                "evidence": forged_collection_proof,
            },
        )
        authoritative_contact = contacted.state["orders"][0]["collectionActions"][0]["proof"]  # type: ignore[index]
        self.assertEqual(authoritative_contact["actor"], principal.actor_id)
        self.assertNotEqual(
            authoritative_contact["capturedAt"],
            forged_collection_proof["capturedAt"],
        )
        reconciled_state = deepcopy(contacted.state)
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
            expected_version=contacted.version,
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
        current = completed_state("ORD-SPA-PACKAGE")
        current["items"][0].update(  # type: ignore[index]
            {
                "sku": "SPA-PACK-MASSAGE-5",
                "name": "Myanmar massage package 5 sessions",
                "onHand": 9,
                "price": 200000,
            }
        )
        current["orders"][0].update(  # type: ignore[index]
            {
                "customer": "Mya Thandar",
                "item": "Myanmar massage package 5 sessions",
                "itemSku": "SPA-PACK-MASSAGE-5",
                "quantity": 1,
                "total": 200000,
                "lines": [
                    {
                        "sku": "SPA-PACK-MASSAGE-5",
                        "name": "Myanmar massage package 5 sessions",
                        "quantity": 1,
                        "unitPriceMmk": 200000,
                    }
                ],
            }
        )
        current["movements"][0].update(  # type: ignore[index]
            {"sku": "SPA-PACK-MASSAGE-5", "quantityDelta": -1}
        )
        validate_commerce_state(current)
        schedule = {
            "schema": "supermega.shop.service_schedule.v4",
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
            "privacyPolicy": {"clientRetentionDays": None},
            "clients": [
                {
                    "id": "client-0001",
                    "name": "Mya Thandar",
                    "contact": "09-111-111",
                    "appointmentUpdates": "declined",
                    "createdAt": "2026-07-29T04:00:00.000Z",
                    "updatedAt": "2026-07-29T04:00:00.000Z",
                }
            ],
            "bookings": [
                {
                    "id": "booking-0001",
                    "clientId": "client-0001",
                    "customerName": "Mya Thandar",
                    "contact": "09-111-111",
                    "appointmentUpdates": "declined",
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
        clean_schedule = deepcopy(schedule)
        clean_schedule["revision"] = 0
        clean_schedule["clients"] = []
        clean_schedule["bookings"] = []
        clean_schedule["events"] = []
        initialized = apply_event(
            current,
            "commerce.service_schedule.initialized",
            {**current, "serviceSchedule": clean_schedule},
            {
                "actionId": "ACT-SERVICE-SCHEDULE-INIT-SPA",
                "capturedAt": "2026-07-29T03:59:00.000Z",
                "actor": "operator-1",
                "reason": "Initialize the reviewed spa Shop industry pack.",
                "evidenceReference": "SHOP-SERVICE-SCHEDULE:spa:R0",
            },
        )
        self.assertEqual(initialized["serviceSchedule"], clean_schedule)
        with self.assertRaises(TrialValidationError):
            apply_event(
                initialized,
                "commerce.service_schedule.initialized",
                initialized,
                {
                    "actionId": "ACT-SERVICE-SCHEDULE-INIT-SPA",
                    "capturedAt": "2026-07-29T03:59:00.000Z",
                    "actor": "operator-1",
                    "reason": "Initialize the reviewed spa Shop industry pack.",
                    "evidenceReference": "SHOP-SERVICE-SCHEDULE:spa:R0",
                },
            )

        first = {**initialized, "serviceSchedule": schedule}
        first_evidence = {
            "actionId": "ACT-SERVICE-SCHEDULE-R1",
            "capturedAt": "2026-07-29T04:00:00.000Z",
            "actor": "operator-1",
            "reason": "Scheduled from the Shop appointment workspace.",
            "evidenceReference": "SHOP-SERVICE-SCHEDULE:R1",
        }
        accepted = apply_event(
            initialized,
            "commerce.service_schedule.saved",
            first,
            first_evidence,
        )
        self.assertEqual(accepted["serviceSchedule"], schedule)

        privacy_schedule = deepcopy(schedule)
        privacy_schedule["revision"] = 2
        privacy_schedule["bookings"][0]["status"] = "cancelled"
        privacy_schedule["bookings"][0]["updatedAt"] = "2026-07-29T04:10:00.000Z"
        privacy_schedule["events"].append({
            "revision": 2,
            "type": "booking_cancelled",
            "subjectId": "booking-0001",
            "actor": "operator-1",
            "reason": "Cancelled by the responsible Shop operator.",
            "happenedAt": "2026-07-29T04:10:00.000Z",
        })
        privacy_state = apply_event(
            accepted,
            "commerce.service_schedule.saved",
            {**accepted, "serviceSchedule": privacy_schedule},
            {
                "actionId": "ACT-SERVICE-SCHEDULE-R2",
                "capturedAt": "2026-07-29T04:10:00.000Z",
                "actor": "operator-1",
                "reason": "Cancelled by the responsible Shop operator.",
                "evidenceReference": "SHOP-SERVICE-SCHEDULE:R2",
            },
        )
        retained_schedule = deepcopy(privacy_schedule)
        retained_schedule["revision"] = 3
        retained_schedule["privacyPolicy"] = {
            "clientRetentionDays": 30,
            "updatedAt": "2026-07-29T04:11:00.000Z",
            "updatedBy": "owner-1",
        }
        retained_schedule["events"].append({
            "revision": 3,
            "type": "client_retention_set",
            "subjectId": "retention-30-days",
            "actor": "owner-1",
            "reason": "Owner approved a 30-day client retention period.",
            "happenedAt": "2026-07-29T04:11:00.000Z",
        })
        retained_state = apply_event(
            privacy_state,
            "commerce.service_schedule.saved",
            {**privacy_state, "serviceSchedule": retained_schedule},
            {
                "actionId": "ACT-SERVICE-SCHEDULE-R3",
                "capturedAt": "2026-07-29T04:11:00.000Z",
                "actor": "owner-1",
                "reason": "Owner approved a 30-day client retention period.",
                "evidenceReference": "SHOP-SERVICE-SCHEDULE:R3",
            },
        )
        client_csv = (
            '"Name","Contact","Appointment updates","Consent recorded","Appointments","Completed visits"\r\n'
            '"Mya Thandar","09-111-111","declined","","0","0"'
        )
        export_digest = f"sha256:{sha256(client_csv.encode('utf-8')).hexdigest()}"
        exported_schedule = deepcopy(retained_schedule)
        exported_schedule["revision"] = 4
        exported_schedule["events"].append({
            "revision": 4,
            "type": "client_exported",
            "subjectId": export_digest,
            "actor": "owner-1",
            "reason": "Exported 1 privacy-minimal client record.",
            "happenedAt": "2026-07-29T04:12:00.000Z",
        })
        exported_state = apply_event(
            retained_state,
            "commerce.service_schedule.saved",
            {**retained_state, "serviceSchedule": exported_schedule},
            {
                "actionId": "ACT-SERVICE-SCHEDULE-R4",
                "capturedAt": "2026-07-29T04:12:00.000Z",
                "actor": "owner-1",
                "reason": "Exported 1 privacy-minimal client record.",
                "evidenceReference": "SHOP-SERVICE-SCHEDULE:R4",
            },
        )
        forged_export = deepcopy(exported_schedule)
        forged_export["events"][-1]["subjectId"] = f"sha256:{'0' * 64}"
        with self.assertRaises(TrialValidationError):
            apply_event(
                retained_state,
                "commerce.service_schedule.saved",
                {**retained_state, "serviceSchedule": forged_export},
                {
                    "actionId": "ACT-SERVICE-SCHEDULE-R4",
                    "capturedAt": "2026-07-29T04:12:00.000Z",
                    "actor": "owner-1",
                    "reason": "Exported 1 privacy-minimal client record.",
                    "evidenceReference": "SHOP-SERVICE-SCHEDULE:R4",
                },
            )
        anonymized_schedule = deepcopy(exported_schedule)
        anonymized_schedule["revision"] = 5
        anonymized_at = "2026-09-01T00:00:00.000Z"
        anonymized_schedule["clients"][0] = {
            "id": "client-0001",
            "name": "Former client client-0001",
            "contact": "anonymized:client-0001",
            "appointmentUpdates": "not_recorded",
            "createdAt": "2026-07-29T04:00:00.000Z",
            "updatedAt": anonymized_at,
            "anonymizedAt": anonymized_at,
            "anonymizedBy": "owner-1",
        }
        anonymized_schedule["bookings"][0].update({
            "customerName": "Former client client-0001",
            "contact": "anonymized:client-0001",
            "appointmentUpdates": "not_recorded",
            "note": "",
            "updatedAt": anonymized_at,
        })
        anonymized_schedule["events"].append({
            "revision": 5,
            "type": "client_anonymized",
            "subjectId": "client-0001",
            "actor": "owner-1",
            "reason": "Owner reviewed and confirmed client anonymization after retention and financial closure.",
            "happenedAt": anonymized_at,
        })
        anonymized_state = apply_event(
            exported_state,
            "commerce.service_schedule.saved",
            {**exported_state, "serviceSchedule": anonymized_schedule},
            {
                "actionId": "ACT-SERVICE-SCHEDULE-R5",
                "capturedAt": anonymized_at,
                "actor": "owner-1",
                "reason": "Owner reviewed and confirmed client anonymization after retention and financial closure.",
                "evidenceReference": "SHOP-SERVICE-SCHEDULE:R5",
            },
        )
        self.assertEqual(
            anonymized_state["serviceSchedule"]["clients"][0]["contact"],
            "anonymized:client-0001",
        )

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

        managed_schedule_state = confirmed
        for revision, status, captured_at in (
            (3, "checked_in", "2026-07-29T04:10:00.000Z"),
            (4, "completed", "2026-07-29T05:30:00.000Z"),
        ):
            advanced_schedule = deepcopy(managed_schedule_state["serviceSchedule"])
            advanced_schedule["revision"] = revision
            advanced_schedule["bookings"][0]["status"] = status
            advanced_schedule["bookings"][0]["updatedAt"] = captured_at
            advanced_schedule["events"].append(
                {
                    "revision": revision,
                    "type": "booking_advanced",
                    "subjectId": "booking-0001",
                    "actor": "operator-1",
                    "reason": "Advanced by the responsible Shop operator.",
                    "happenedAt": captured_at,
                }
            )
            managed_schedule_state = apply_event(
                managed_schedule_state,
                "commerce.service_schedule.saved",
                {**managed_schedule_state, "serviceSchedule": advanced_schedule},
                {
                    "actionId": f"ACT-SERVICE-SCHEDULE-R{revision}",
                    "capturedAt": captured_at,
                    "actor": "operator-1",
                    "reason": "Advanced by the responsible Shop operator.",
                    "evidenceReference": f"SHOP-SERVICE-SCHEDULE:R{revision}",
                },
            )

        package_schedule = deepcopy(managed_schedule_state["serviceSchedule"])
        package_schedule["revision"] = 5
        package_schedule["events"].append(
            {
                "revision": 5,
                "type": "package_redeemed",
                "subjectId": "booking-0001",
                "actor": "operator-1",
                "reason": "Used after the completed treatment was checked.",
                "happenedAt": "2026-07-29T05:31:00.000Z",
            }
        )
        package_saved = apply_event(
            managed_schedule_state,
            "commerce.service_schedule.saved",
            {**managed_schedule_state, "serviceSchedule": package_schedule},
            {
                "actionId": "ACT-SERVICE-SCHEDULE-R5",
                "capturedAt": "2026-07-29T05:31:00.000Z",
                "actor": "operator-1",
                "reason": "Used after the completed treatment was checked.",
                "evidenceReference": "SHOP-SERVICE-SCHEDULE:R5",
            },
        )
        self.assertEqual(package_saved["serviceSchedule"]["events"][-1]["type"], "package_redeemed")
        self.assertEqual(package_saved["serviceSchedule"]["bookings"], managed_schedule_state["serviceSchedule"]["bookings"])

        no_paid_balance = deepcopy(managed_schedule_state)
        no_paid_balance["orders"][0]["customer"] = "Another Client"
        with self.assertRaises(TrialValidationError):
            apply_event(
                no_paid_balance,
                "commerce.service_schedule.saved",
                {**no_paid_balance, "serviceSchedule": package_schedule},
                {
                    "actionId": "ACT-SERVICE-SCHEDULE-R5",
                    "capturedAt": "2026-07-29T05:31:00.000Z",
                    "actor": "operator-1",
                    "reason": "Used after the completed treatment was checked.",
                    "evidenceReference": "SHOP-SERVICE-SCHEDULE:R5",
                },
            )

        package_rewrite = deepcopy(package_schedule)
        package_rewrite["bookings"][0]["customerName"] = "Rewritten during redemption"
        with self.assertRaises(TrialValidationError):
            apply_event(
                managed_schedule_state,
                "commerce.service_schedule.saved",
                {**managed_schedule_state, "serviceSchedule": package_rewrite},
                {
                    "actionId": "ACT-SERVICE-SCHEDULE-R5",
                    "capturedAt": "2026-07-29T05:31:00.000Z",
                    "actor": "operator-1",
                    "reason": "Used after the completed treatment was checked.",
                    "evidenceReference": "SHOP-SERVICE-SCHEDULE:R5",
                },
            )

        unfinished_package = deepcopy(confirmed_schedule)
        unfinished_package["revision"] = 3
        unfinished_package["events"].append(
            {
                "revision": 3,
                "type": "package_redeemed",
                "subjectId": "booking-0001",
                "actor": "operator-1",
                "reason": "Invalid early package use.",
                "happenedAt": "2026-07-29T04:06:00.000Z",
            }
        )
        with self.assertRaises(TrialValidationError):
            validate_commerce_state({**current, "serviceSchedule": unfinished_package})

        wrong_duration = deepcopy(schedule)
        wrong_duration["bookings"][0]["endsAt"] = "2026-07-29T05:00:00.000Z"
        with self.assertRaises(TrialValidationError):
            validate_commerce_state({**current, "serviceSchedule": wrong_duration})


if __name__ == "__main__":
    unittest.main()
