from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
import json
import unittest
from unittest.mock import patch
from uuid import uuid4

from supermega_runtime.commerce_runtime import reduce_commerce_state
from supermega_runtime.runtime import reduce_trial_state
from supermega_runtime.shop_inventory_runtime import (
    EMPTY_SHOP_INVENTORY_DIGEST,
    SHOP_INVENTORY_IMPORT_CONTRACT,
    SHOP_INVENTORY_SCHEMA,
    ShopInventoryValidationError,
    restamp_latest_shop_inventory_command,
    shop_inventory_catalog_digest,
    shop_inventory_sku_totals,
    validate_shop_inventory_state,
)
from supermega_runtime.trial_store import (
    InMemoryTrialStore,
    TrialHumanApprovalRequired,
    TrialPrincipal,
    TrialValidationError,
)


OPEN_AT = "2026-07-27T01:00:00.000Z"
TRANSFER_AT = "2026-07-27T02:00:00.000Z"
SERVER_OPEN_AT = "2026-07-27T03:00:00+00:00"
SERVER_TRANSFER_AT = "2026-07-27T04:00:00+00:00"
RECEIPT_AT = "2026-07-27T05:00:00.000Z"
SERVER_RECEIPT_AT = "2026-07-27T05:30:00+00:00"
PURCHASE_ORDER_ID = "PO-00000000-0000-4000-8000-000000000071"


def canonical_digest(value: object) -> str:
    encoded = json.dumps(
        value, ensure_ascii=False, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")
    return f"sha256:{sha256(encoded).hexdigest()}"


def action_proof(action_id: str, captured_at: str, actor: str = "operator-a") -> dict[str, str]:
    return {
        "actionId": action_id,
        "capturedAt": captured_at,
        "actor": actor,
        "reason": "Review and record location stock.",
        "evidenceReference": f"WAREHOUSE:{action_id}",
    }


def commerce_state() -> dict[str, object]:
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


def opening_inventory(proof: dict[str, str] | None = None) -> dict[str, object]:
    package: dict[str, object] = {
        "contract": SHOP_INVENTORY_IMPORT_CONTRACT,
        "importId": "IMP-OPENING-001",
        "sourceDigest": canonical_digest({"rows": 1, "source": "opening"}),
        "catalogSkuDigest": shop_inventory_catalog_digest(["SKU-1"]),
        "clients": [{"id": "CLI-RETAIL-001", "name": "Walk-in customer"}],
        "vendors": [{"id": "VEN-OPENING-001", "name": "Opening source"}],
        "locations": [
            {"id": "LOC-BRANCH", "name": "Branch"},
            {"id": "LOC-MAIN", "name": "Main store"},
        ],
        "stockUnits": [
            {
                "id": "LOT-SKU1-OPENING-001",
                "sku": "SKU-1",
                "tracking": "lot",
                "trackingCode": "OPENING-001",
            }
        ],
        "openings": [
            {
                "stockUnitId": "LOT-SKU1-OPENING-001",
                "locationId": "LOC-MAIN",
                "vendorId": "VEN-OPENING-001",
                "quantity": 10,
            }
        ],
    }
    package["packageDigest"] = canonical_digest(package)
    payload = {
        "kind": "import",
        "id": "IMP-OPENING-001",
        "package": package,
        "proof": proof or action_proof("ACT-OPENING-001", OPEN_AT),
    }
    body = {
        "sequence": 1,
        "previousDigest": EMPTY_SHOP_INVENTORY_DIGEST,
        "payload": payload,
    }
    command = {**body, "digest": canonical_digest(body)}
    return {
        "schema": SHOP_INVENTORY_SCHEMA,
        "revision": 1,
        "headDigest": command["digest"],
        "commands": [command],
    }


def transferred_inventory(
    state: dict[str, object], proof: dict[str, str] | None = None
) -> dict[str, object]:
    current = deepcopy(state)
    payload = {
        "kind": "transfer",
        "id": "TRF-MAIN-BRANCH-001",
        "stockUnitId": "LOT-SKU1-OPENING-001",
        "fromLocationId": "LOC-MAIN",
        "toLocationId": "LOC-BRANCH",
        "quantity": 3,
        "proof": proof or action_proof("ACT-TRANSFER-001", TRANSFER_AT),
    }
    body = {
        "sequence": 2,
        "previousDigest": current["headDigest"],
        "payload": payload,
    }
    command = {**body, "digest": canonical_digest(body)}
    current["revision"] = 2
    current["headDigest"] = command["digest"]
    current["commands"] = [*current["commands"], command]  # type: ignore[misc]
    return current


def received_inventory(
    state: dict[str, object],
    proof: dict[str, str] | None = None,
    *,
    quantity: int = 4,
    purchase_order_id: str = PURCHASE_ORDER_ID,
    location_id: str = "LOC-BRANCH",
    receipt_id: str = "RCV-PURCHASE-001",
    stock_unit_id: str = "LOT-PURCHASE-001",
    tracking_code: str = "PO-000071-LOT-001",
) -> dict[str, object]:
    current = deepcopy(state)
    payload = {
        "kind": "receipt",
        "id": receipt_id,
        "purchaseOrderId": purchase_order_id,
        "stockUnitId": stock_unit_id,
        "sku": "SKU-1",
        "trackingCode": tracking_code,
        "locationId": location_id,
        "quantity": quantity,
        "proof": proof or action_proof("ACT-RECEIPT-001", RECEIPT_AT),
    }
    body = {
        "sequence": int(current["revision"]) + 1,
        "previousDigest": current["headDigest"],
        "payload": payload,
    }
    command = {**body, "digest": canonical_digest(body)}
    current["revision"] = body["sequence"]
    current["headDigest"] = command["digest"]
    current["commands"] = [*current["commands"], command]  # type: ignore[misc]
    return current


def purchase_order(proof: dict[str, str] | None = None) -> dict[str, object]:
    creation = proof or action_proof(
        "ACT-PURCHASE-001", "2026-07-27T04:10:00.000Z"
    )
    return {
        "id": PURCHASE_ORDER_ID,
        "createdAt": creation["capturedAt"],
        "expectedAt": "2026-07-28T05:00:00.000Z",
        "supplier": "Yangon Supply",
        "sku": "SKU-1",
        "quantityOrdered": 4,
        "creation": creation,
    }


def purchase_receipt_movement(
    proof: dict[str, str] | None = None, *, quantity: int = 4
) -> dict[str, object]:
    evidence = proof or action_proof("ACT-RECEIPT-001", RECEIPT_AT)
    return {
        "id": f"MOV2:{evidence['actionId']}",
        "actionId": evidence["actionId"],
        "createdAt": evidence["capturedAt"],
        "actor": evidence["actor"],
        "reason": evidence["reason"],
        "evidenceReference": evidence["evidenceReference"],
        "kind": "receipt",
        "sku": "SKU-1",
        "quantityDelta": quantity,
        "purchaseOrderId": PURCHASE_ORDER_ID,
    }


class ShopInventoryRuntimeTests(unittest.TestCase):
    def test_opening_transfer_and_digest_chain_match_the_existing_contract(self) -> None:
        opening = opening_inventory()
        validated = validate_shop_inventory_state(
            opening, ["SKU-1"], require_current_catalog_digest=True
        )
        self.assertEqual(
            validated["commands"][0]["payload"]["package"]["packageDigest"],
            "sha256:e185ea0640d14241898c33365d417362274df1d43f0778c3508bb4b4e0a7c7d6",
        )
        self.assertEqual(shop_inventory_sku_totals(validated, ["SKU-1"]), {"SKU-1": 10})

        transferred = transferred_inventory(validated)
        self.assertEqual(
            shop_inventory_sku_totals(transferred, ["SKU-1"]), {"SKU-1": 10}
        )
        tampered = deepcopy(transferred)
        tampered["commands"][-1]["payload"]["quantity"] = 11  # type: ignore[index]
        with self.assertRaises(ShopInventoryValidationError):
            validate_shop_inventory_state(tampered, ["SKU-1"])

    def test_commerce_accepts_only_one_exact_location_transition(self) -> None:
        current = commerce_state()
        opening = opening_inventory()
        initialized_state = {**current, "inventoryFoundation": opening}
        initialized = reduce_commerce_state(
            "commerce.inventory.initialized",
            current,
            {
                "state": initialized_state,
                "evidence": opening["commands"][-1]["payload"]["proof"],  # type: ignore[index]
            },
        )
        transferred = transferred_inventory(initialized["inventoryFoundation"])
        transferred_state = {**initialized, "inventoryFoundation": transferred}
        accepted = reduce_commerce_state(
            "commerce.inventory.transferred",
            initialized,
            {
                "state": transferred_state,
                "evidence": transferred["commands"][-1]["payload"]["proof"],  # type: ignore[index]
            },
        )
        self.assertEqual(accepted["items"], current["items"])

        drifted = deepcopy(transferred_state)
        drifted["items"][0]["onHand"] = 9  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            reduce_commerce_state(
                "commerce.inventory.transferred",
                initialized,
                {
                    "state": drifted,
                    "evidence": transferred["commands"][-1]["payload"]["proof"],  # type: ignore[index]
                },
            )

    def test_purchase_receipt_links_one_lot_and_conserves_shop_stock(self) -> None:
        current = commerce_state()
        opening = opening_inventory()
        initialized = reduce_commerce_state(
            "commerce.inventory.initialized",
            current,
            {
                "state": {**current, "inventoryFoundation": opening},
                "evidence": opening["commands"][-1]["payload"]["proof"],  # type: ignore[index]
            },
        )
        order = purchase_order()
        ordered = reduce_commerce_state(
            "commerce.purchase_order.created",
            initialized,
            {
                "state": {**initialized, "purchaseOrders": [order]},
                "evidence": order["creation"],
            },
        )
        proof = action_proof("ACT-RECEIPT-001", RECEIPT_AT)
        foundation = received_inventory(ordered["inventoryFoundation"], proof)
        receipt_state = deepcopy(ordered)
        receipt_state["items"][0]["onHand"] = 14  # type: ignore[index]
        receipt_state["movements"] = [purchase_receipt_movement(proof)]
        receipt_state["inventoryFoundation"] = foundation
        received = reduce_commerce_state(
            "commerce.purchase_order.received",
            ordered,
            {"state": receipt_state, "evidence": proof},
        )
        self.assertEqual(
            shop_inventory_sku_totals(received["inventoryFoundation"], ["SKU-1"]),
            {"SKU-1": 14},
        )
        location_receipt = received["inventoryFoundation"]["commands"][-1][  # type: ignore[index]
            "payload"
        ]
        self.assertEqual(location_receipt["purchaseOrderId"], PURCHASE_ORDER_ID)
        self.assertEqual(location_receipt["locationId"], "LOC-BRANCH")
        self.assertEqual(location_receipt["stockUnitId"], "LOT-PURCHASE-001")

        mismatched = deepcopy(receipt_state)
        mismatched["inventoryFoundation"] = received_inventory(
            ordered["inventoryFoundation"], proof, quantity=3
        )
        with self.assertRaisesRegex(
            TrialValidationError,
            "match its aggregate purchase receipt|conserve aggregate Shop stock",
        ):
            reduce_commerce_state(
                "commerce.purchase_order.received",
                ordered,
                {"state": mismatched, "evidence": proof},
            )

        aggregate_only = deepcopy(receipt_state)
        aggregate_only["inventoryFoundation"] = ordered["inventoryFoundation"]
        with self.assertRaisesRegex(
            TrialValidationError, "append exactly one location receipt"
        ):
            reduce_commerce_state(
                "commerce.purchase_order.received",
                ordered,
                {"state": aggregate_only, "evidence": proof},
            )

    def test_store_stamps_human_location_commands_and_replays_exactly(self) -> None:
        store = InMemoryTrialStore(reducer=reduce_trial_state)
        operator = TrialPrincipal("workspace-a", "operator-a", "human")
        agent = TrialPrincipal("workspace-a", "warehouse-agent", "agent")
        for principal in (operator, agent):
            store.provision_membership(
                workspace_id=principal.workspace_id,
                actor_id=principal.actor_id,
                actor_kind=principal.actor_kind,
                capabilities=("commerce.read", "commerce.write"),
            )
        with patch(
            "supermega_runtime.trial_store._utc_now", return_value=SERVER_OPEN_AT
        ):
            initialized = store.apply_command(
                operator,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.workspace.initialized",
                expected_version=0,
                payload={
                    "state": commerce_state(),
                    "evidence": action_proof("ACT-CATALOG-001", OPEN_AT),
                },
            )

        opening = opening_inventory(action_proof("ACT-OPENING-001", OPEN_AT))
        opening_payload = {
            "state": {**initialized.state, "inventoryFoundation": opening},
            "evidence": opening["commands"][-1]["payload"]["proof"],  # type: ignore[index]
        }
        command_id = str(uuid4())
        with patch(
            "supermega_runtime.trial_store._utc_now", return_value=SERVER_OPEN_AT
        ):
            recorded = store.apply_command(
                operator,
                command_id=command_id,
                surface="commerce",
                event_type="commerce.inventory.initialized",
                expected_version=initialized.version,
                payload=opening_payload,
            )
            replay = store.apply_command(
                operator,
                command_id=command_id,
                surface="commerce",
                event_type="commerce.inventory.initialized",
                expected_version=initialized.version,
                payload=opening_payload,
            )
        retained_proof = recorded.state["inventoryFoundation"]["commands"][-1][
            "payload"
        ]["proof"]
        self.assertEqual(retained_proof["actor"], operator.actor_id)
        self.assertEqual(retained_proof["capturedAt"], SERVER_OPEN_AT)
        self.assertTrue(replay.idempotent_replay)
        self.assertEqual(replay.state, recorded.state)

        agent_opening = opening_inventory(
            action_proof("ACT-AGENT-OPENING-001", OPEN_AT, agent.actor_id)
        )
        with self.assertRaises(TrialHumanApprovalRequired):
            store.apply_command(
                agent,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.inventory.initialized",
                expected_version=recorded.version,
                payload={
                    "state": {**recorded.state, "inventoryFoundation": agent_opening},
                    "evidence": agent_opening["commands"][-1]["payload"]["proof"],  # type: ignore[index]
                },
            )

        transfer = transferred_inventory(
            recorded.state["inventoryFoundation"],
            action_proof("ACT-TRANSFER-001", TRANSFER_AT),
        )
        with patch(
            "supermega_runtime.trial_store._utc_now", return_value=SERVER_TRANSFER_AT
        ):
            moved = store.apply_command(
                operator,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.inventory.transferred",
                expected_version=recorded.version,
                payload={
                    "state": {**recorded.state, "inventoryFoundation": transfer},
                    "evidence": transfer["commands"][-1]["payload"]["proof"],  # type: ignore[index]
                },
            )
        moved_proof = moved.state["inventoryFoundation"]["commands"][-1]["payload"][
            "proof"
        ]
        self.assertEqual(moved_proof["actor"], operator.actor_id)
        self.assertEqual(moved_proof["capturedAt"], SERVER_TRANSFER_AT)

        order_proof = action_proof(
            "ACT-PURCHASE-001", "2099-01-01T00:00:00.000Z", "fabricated-buyer"
        )
        order = purchase_order(order_proof)
        with patch(
            "supermega_runtime.trial_store._utc_now",
            return_value="2026-07-27T04:10:00+00:00",
        ):
            ordered = store.apply_command(
                operator,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.purchase_order.created",
                expected_version=moved.version,
                payload={
                    "state": {**moved.state, "purchaseOrders": [order]},
                    "evidence": order_proof,
                },
            )

        spoofed_receipt_proof = action_proof(
            "ACT-RECEIPT-001", "2099-01-01T00:00:00.000Z", "fabricated-receiver"
        )
        receipt_state = deepcopy(ordered.state)
        receipt_state["items"][0]["onHand"] = 14  # type: ignore[index]
        receipt_state["movements"] = [
            purchase_receipt_movement(spoofed_receipt_proof)
        ]
        receipt_state["inventoryFoundation"] = received_inventory(
            ordered.state["inventoryFoundation"], spoofed_receipt_proof
        )
        receipt_payload = {
            "state": receipt_state,
            "evidence": spoofed_receipt_proof,
        }
        receipt_command_id = str(uuid4())
        with patch(
            "supermega_runtime.trial_store._utc_now", return_value=SERVER_RECEIPT_AT
        ):
            received = store.apply_command(
                operator,
                command_id=receipt_command_id,
                surface="commerce",
                event_type="commerce.purchase_order.received",
                expected_version=ordered.version,
                payload=receipt_payload,
            )
            receipt_replay = store.apply_command(
                operator,
                command_id=receipt_command_id,
                surface="commerce",
                event_type="commerce.purchase_order.received",
                expected_version=ordered.version,
                payload=receipt_payload,
            )
        authoritative_movement = received.state["movements"][0]
        authoritative_location_proof = received.state["inventoryFoundation"][
            "commands"
        ][-1]["payload"]["proof"]
        self.assertEqual(authoritative_movement["actor"], operator.actor_id)
        self.assertEqual(
            authoritative_movement["createdAt"], SERVER_RECEIPT_AT
        )
        self.assertEqual(authoritative_location_proof["actor"], operator.actor_id)
        self.assertEqual(
            authoritative_location_proof["capturedAt"], SERVER_RECEIPT_AT
        )
        self.assertTrue(receipt_replay.idempotent_replay)
        self.assertEqual(receipt_replay.state, received.state)
        self.assertEqual(
            shop_inventory_sku_totals(
                received.state["inventoryFoundation"], ["SKU-1"]
            ),
            {"SKU-1": 14},
        )


if __name__ == "__main__":
    unittest.main()
