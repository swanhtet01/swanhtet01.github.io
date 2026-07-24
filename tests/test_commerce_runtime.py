from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone
import unittest
from uuid import uuid4

from supermega_runtime.commerce_runtime import COMMERCE_HUMAN_EVENTS, validate_commerce_state
from supermega_runtime.runtime import reduce_trial_state
from supermega_runtime.trial_store import InMemoryTrialStore, TrialPrincipal, TrialValidationError


NOW = "2026-07-23T09:00:00.000Z"
CONVERTED_AT = "2026-07-23T09:15:00.000Z"
WEBSITE_INTAKE_ID = "WINT-12345678"
CLOSE_ACTION_ID = "ACT-00000000-0000-4000-8000-000000000001"
CLOSE_ID = "CLOSE-00000000-0000-4000-8000-000000000001"
CLOSE_ACTION_ID_2 = "ACT-00000000-0000-4000-8000-000000000002"
CLOSE_ID_2 = "CLOSE-00000000-0000-4000-8000-000000000002"
CLOSE_ACTION_ID_3 = "ACT-00000000-0000-4000-8000-000000000003"
CLOSE_ID_3 = "CLOSE-00000000-0000-4000-8000-000000000003"


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
) -> dict[str, object]:
    record: dict[str, object] = {
        "id": f"MOV-{action_id}",
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


def action_evidence(action_id: str = "ACT-LIFECYCLE", *, captured_at: str = NOW) -> dict[str, str]:
    return {
        "actionId": action_id,
        "capturedAt": captured_at,
        "actor": "Accountable operator",
        "reason": "Verified against the source record.",
        "evidenceReference": f"EV-{action_id}",
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


def evidence_for(event_type: str, next_state: dict[str, object]) -> dict[str, str]:
    if event_type == "commerce.website_intake.created":
        return dict(next_state["websiteIntakes"][0]["creation"])  # type: ignore[index, arg-type]
    if event_type == "commerce.website_intake.converted":
        conversion = dict(next_state["websiteIntakes"][0]["conversion"])  # type: ignore[index, arg-type]
        conversion.pop("orderId")
        return conversion  # type: ignore[return-value]
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
                    "commerce.stock.received",
                    "commerce.close.saved",
                    "commerce.website_intake.converted",
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
