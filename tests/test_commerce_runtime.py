from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone
import unittest
from urllib.parse import quote
from uuid import uuid4

from supermega_runtime.commerce_runtime import (
    COMMERCE_HUMAN_EVENTS,
    commerce_catalog_digest,
    validate_commerce_state,
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
WEBSITE_INTAKE_ID = "WINT-12345678"
CLOSE_ACTION_ID = "ACT-00000000-0000-4000-8000-000000000001"
CLOSE_ID = "CLOSE-00000000-0000-4000-8000-000000000001"
CLOSE_ACTION_ID_2 = "ACT-00000000-0000-4000-8000-000000000002"
CLOSE_ID_2 = "CLOSE-00000000-0000-4000-8000-000000000002"
CLOSE_ACTION_ID_3 = "ACT-00000000-0000-4000-8000-000000000003"
CLOSE_ID_3 = "CLOSE-00000000-0000-4000-8000-000000000003"
STOREFRONT_REQUEST_UUID = "00000000-0000-4000-8000-000000000010"
STOREFRONT_CONFIGURATION_UUID = "00000000-0000-4000-8000-000000000011"


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
        "channel": "Website",
        "item": "Test item",
        "itemSku": "SKU-1",
        "quantity": 2,
        "payment": "Manual QR review",
        "paymentStatus": "pending",
        "refundStatus": "none",
        "fulfilment": "pickup",
        "fulfilmentReference": f"FUL-{order_id}",
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
    return record


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
        "total": sum(order["total"] for order in eligible),
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
) -> dict[str, object]:
    return {
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


def storefront_request(
    *,
    request_uuid: str = STOREFRONT_REQUEST_UUID,
    quantity: int = 2,
    digest: str = "sha256:" + "a" * 64,
) -> dict[str, object]:
    return {
        "schema": "supermega.ecommerce.order_request.v1",
        "mode": "browser-local-request",
        "state": "pending_shop_review",
        "id": f"ECR-{request_uuid}",
        "idempotencyKey": f"ECI-{request_uuid}",
        "createdAt": NOW,
        "sourcePreviewDigest": digest,
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
    return {
        "schema": "supermega.ecommerce.storefront.v1",
        "revision": revision,
        "shopCatalogSnapshotRevision": catalog_revision,
        "shopCatalogDigest": catalog_digest,
        "storeName": store_name,
        "summary": summary,
        "selectedSkus": selected_skus or ["SKU-1"],
        "saved": evidence,
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
    if event_type in {"commerce.item.created", "commerce.order.created", "commerce.order.cancelled", "commerce.stock.received"}:
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
    return dict(reduce_trial_state("commerce", event_type, current, {"state": next_state, "evidence": evidence or evidence_for(event_type, next_state)}))


class CommerceRuntimeTests(unittest.TestCase):
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
        self.assertEqual(apply_event({}, "commerce.workspace.initialized", legacy), legacy)

        explicit_empty = catalog_state()
        explicit_empty["websiteIntakes"] = []
        self.assertEqual(
            apply_event({}, "commerce.workspace.initialized", explicit_empty),
            explicit_empty,
        )
        with self.assertRaises(TrialValidationError):
            apply_event({}, "commerce.workspace.initialized", pending_intake_state())

    def test_storefront_request_is_retained_without_shop_side_effects(self) -> None:
        current = catalog_state()
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

        for label, invalid in (
            ("changed item", {**next_state, "items": [{**current["items"][0], "onHand": 9}]}),  # type: ignore[index]
            ("created order", {**next_state, "orders": [order_record()]}),
            ("changed price", {**next_state, "storefrontRequests": [{**request, "line": {**request["line"], "unitPriceMmk": 101}, "totalMmk": 202}]}),  # type: ignore[arg-type]
            ("bad digest", {**next_state, "storefrontRequests": [{**request, "sourcePreviewDigest": "sha256:" + "A" * 64}]}),
        ):
            with self.subTest(label=label), self.assertRaises(TrialValidationError):
                apply_event(
                    current,
                    "commerce.storefront_request.received",
                    invalid,
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
        collision_current = catalog_state()
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
        for principal in (operator, other):
            store.provision_membership(
                workspace_id=principal.workspace_id,
                actor_id=principal.actor_id,
                actor_kind=principal.actor_kind,
                capabilities=("commerce.write",),
            )
            store.apply_command(
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

        request = storefront_request()
        state = catalog_state()
        state["storefrontRequests"] = [request]
        command_id = STOREFRONT_REQUEST_UUID
        payload = {"state": state, "evidence": storefront_evidence(request)}
        first = store.apply_command(
            operator,
            command_id=command_id,
            surface="commerce",
            event_type="commerce.storefront_request.received",
            expected_version=1,
            payload=payload,
        )
        replay = store.apply_command(
            operator,
            command_id=command_id,
            surface="commerce",
            event_type="commerce.storefront_request.received",
            expected_version=1,
            payload=payload,
        )

        self.assertEqual(first.version, 2)
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
                expected_version=1,
                payload=conflicting_payload,
            )
        with self.assertRaises(TrialVersionConflict):
            store.apply_command(
                operator,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.storefront_request.received",
                expected_version=1,
                payload=payload,
            )
        recovered = store.get_state(
            TrialPrincipal("workspace-a", "Accountable operator", "human"),
            "commerce",
        )
        self.assertEqual(recovered.version, 2)
        self.assertEqual(recovered.state["storefrontRequests"], [request])

        self.assertEqual(
            COMMERCE_HUMAN_EVENTS,
            frozenset(
                {
                    "commerce.workspace.initialized",
                    "commerce.item.created",
                    "commerce.order.created",
                    "commerce.order.advanced",
                    "commerce.order.cancelled",
                    "commerce.payment.reconciled",
                    "commerce.refund.settled",
                    "commerce.stock.received",
                    "commerce.close.saved",
                    "commerce.website_intake.converted",
                    "commerce.storefront.configuration.saved",
                }
            ),
        )

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
                accepted_with_intake = apply_event(state_with_intake, "commerce.item.created", next_state)
                self.assertEqual(accepted_with_intake["items"][0], item)  # type: ignore[index]
                self.assertEqual(accepted_with_intake["movements"][0]["quantityDelta"], 7)  # type: ignore[index]
                self.assertEqual(accepted_with_intake["websiteIntakes"], state_with_intake["websiteIntakes"])

    def test_order_create_and_stock_receipt_allow_only_the_declared_diff(self) -> None:
        current = catalog_state()
        created = apply_event(current, "commerce.order.created", created_state())
        self.assertEqual(created["items"][0]["onHand"], 8)  # type: ignore[index]

        for missing_field in ("fulfilment", "fulfilmentReference"):
            without_handoff = created_state()
            without_handoff["orders"][0].pop(missing_field)  # type: ignore[index]
            with self.subTest(missing_order_handoff=missing_field), self.assertRaises(TrialValidationError):
                apply_event(current, "commerce.order.created", without_handoff)

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
            "channel": "Walk-in",
            "item": "2 items",
            "quantity": 3,
            "payment": "Cash",
            "paymentStatus": "pending",
            "refundStatus": "none",
            "fulfilment": "pickup",
            "fulfilmentReference": "COUNTER-A",
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
        preparing["orders"][0]["status"] = "preparing"  # type: ignore[index]
        current = apply_event(current, "commerce.order.advanced", preparing)

        ready = deepcopy(current)
        ready["orders"][0]["status"] = "ready"  # type: ignore[index]
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

        completed = deepcopy(current)
        completed["orders"][0]["status"] = "completed"  # type: ignore[index]
        current = apply_event(current, "commerce.order.advanced", completed)

        closed = deepcopy(current)
        closed["closes"] = [close_record(current)]
        result = apply_event(current, "commerce.close.saved", closed)
        self.assertEqual(result["closes"][0]["total"], 200)  # type: ignore[index]
        self.assertEqual(result["closes"][0]["operator"], "Accountable operator")  # type: ignore[index]
        self.assertEqual(result["closes"][0]["businessDate"], "2026-07-23")  # type: ignore[index]
        self.assertEqual(result["closes"][0]["orderIds"], ["ORD-1"])  # type: ignore[index]
        self.assertEqual(result["closes"][0]["paymentExceptionOrderIds"], [])  # type: ignore[index]

        wrong_close = deepcopy(current)
        invalid_close = close_record(current, CLOSE_ACTION_ID_2, close_id=CLOSE_ID_2)
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
            close_record(result, CLOSE_ACTION_ID_3, close_id=CLOSE_ID_3),
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
        created = store.apply_command(
            principal,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.order.created",
            expected_version=initialized.version,
            payload={"state": created_state(), "evidence": evidence_for("commerce.order.created", created_state())},
        )

        self.assertEqual(initialized.version, 1)
        self.assertTrue(replay.idempotent_replay)
        self.assertEqual(created.version, 2)
        stored = store.get_state(principal, "commerce")
        self.assertEqual(stored.updated_by, principal.actor_id)
        self.assertEqual(stored.state, created_state())

        preparing_state = deepcopy(created.state)
        preparing_state["orders"][0]["status"] = "preparing"  # type: ignore[index]
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
                "paymentReconciledAt": NOW,
                "paymentReconciliationActionId": "ACT-STORE-PAYMENT",
                "paymentReconciledBy": "Accountable operator",
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
        ready_state = deepcopy(reconciled.state)
        ready_state["orders"][0]["status"] = "ready"  # type: ignore[index]
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
        completed_state["orders"][0]["status"] = "completed"  # type: ignore[index]
        completed = store.apply_command(
            principal,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.order.advanced",
            expected_version=ready.version,
            payload={
                "state": completed_state,
                "evidence": action_evidence("ACT-STORE-COMPLETED"),
            },
        )
        forged_close_state = deepcopy(completed.state)
        forged_close = close_record(
            completed.state,
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
            expected_version=completed.version,
            payload=forged_payload,
        )
        close_replay = store.apply_command(
            principal,
            command_id=close_command_id,
            surface="commerce",
            event_type="commerce.close.saved",
            expected_version=completed.version,
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
        self.assertTrue(close_replay.idempotent_replay)
        self.assertEqual(close_replay.state, closed.state)

    def test_unknown_fields_and_legacy_snapshot_event_fail_closed(self) -> None:
        invalid = catalog_state()
        invalid["untrusted"] = True
        with self.assertRaises(TrialValidationError):
            apply_event({}, "commerce.workspace.initialized", invalid)
        with self.assertRaises(TrialValidationError):
            apply_event({}, "commerce.snapshot.saved", catalog_state())


if __name__ == "__main__":
    unittest.main()
