from __future__ import annotations

from copy import deepcopy
import unittest
from uuid import uuid4

from supermega_runtime.runtime import reduce_trial_state
from supermega_runtime.trial_store import InMemoryTrialStore, TrialPrincipal, TrialValidationError


NOW = "2026-07-23T09:00:00.000Z"


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


def movement(kind: str, action_id: str, quantity: int, *, order_id: str | None = None, sku: str = "SKU-1") -> dict[str, object]:
    record: dict[str, object] = {
        "id": f"MOV-{action_id}",
        "actionId": action_id,
        "createdAt": NOW,
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


def action_evidence(action_id: str = "ACT-LIFECYCLE") -> dict[str, str]:
    return {
        "actionId": action_id,
        "capturedAt": NOW,
        "actor": "Accountable operator",
        "reason": "Verified against the source record.",
        "evidenceReference": f"EV-{action_id}",
    }


def created_state(order_id: str = "ORD-1") -> dict[str, object]:
    state = catalog_state()
    state["items"] = [{**state["items"][0], "onHand": 8}]  # type: ignore[index]
    state["orders"] = [order_record(order_id)]
    state["movements"] = [movement("reserve", f"ACT-{order_id}", -2, order_id=order_id)]
    return state


def evidence_for(event_type: str, next_state: dict[str, object]) -> dict[str, str]:
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
