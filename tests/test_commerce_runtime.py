from __future__ import annotations

from copy import deepcopy
import unittest
from uuid import uuid4

from supermega_runtime.commerce_runtime import COMMERCE_HUMAN_EVENTS
from supermega_runtime.runtime import reduce_trial_state
from supermega_runtime.trial_store import InMemoryTrialStore, TrialPrincipal, TrialValidationError


NOW = "2026-07-23T09:00:00.000Z"
CONVERTED_AT = "2026-07-23T09:15:00.000Z"
WEBSITE_INTAKE_ID = "WINT-12345678"


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
        closed["closes"] = [{"id": "CLOSE-1", "createdAt": NOW, "total": 200, "orders": 1}]
        result = apply_event(current, "commerce.close.saved", closed)
        self.assertEqual(result["closes"][0]["total"], 200)  # type: ignore[index]

        wrong_close = deepcopy(current)
        wrong_close["closes"] = [{"id": "CLOSE-2", "createdAt": NOW, "total": 100, "orders": 1}]
        with self.assertRaises(TrialValidationError):
            apply_event(current, "commerce.close.saved", wrong_close)

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

    def test_unknown_fields_and_legacy_snapshot_event_fail_closed(self) -> None:
        invalid = catalog_state()
        invalid["untrusted"] = True
        with self.assertRaises(TrialValidationError):
            apply_event({}, "commerce.workspace.initialized", invalid)
        with self.assertRaises(TrialValidationError):
            apply_event({}, "commerce.snapshot.saved", catalog_state())


if __name__ == "__main__":
    unittest.main()
