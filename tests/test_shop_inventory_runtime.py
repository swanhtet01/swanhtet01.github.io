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
    shop_inventory_balances,
    shop_inventory_catalog_digest,
    shop_inventory_sku_available_to_promise,
    shop_inventory_sku_totals,
    validate_shop_inventory_state,
)
from supermega_runtime.trial_store import (
    InMemoryTrialStore,
    TrialHumanApprovalRequired,
    TrialPrincipal,
    TrialValidationError,
    _authoritative_command_payload,
)


OPEN_AT = "2026-07-27T01:00:00.000Z"
TRANSFER_AT = "2026-07-27T02:00:00.000Z"
MASTER_AT = "2026-07-27T02:30:00.000Z"
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


def master_created_inventory(
    state: dict[str, object],
    proof: dict[str, str],
    *,
    command_id: str = "MST-CLIENT-001",
    master_type: str = "client",
    master_id: str = "CLI-ACCOUNT-001",
    name: str = "Golden Lotus",
) -> dict[str, object]:
    return append_inventory_command(
        state,
        {
            "kind": "master_create",
            "id": command_id,
            "masterType": master_type,
            "master": {"id": master_id, "name": name},
            "proof": proof,
        },
    )


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


def append_inventory_command(
    state: dict[str, object], payload: dict[str, object]
) -> dict[str, object]:
    current = deepcopy(state)
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


def counted_inventory(
    state: dict[str, object],
    proof: dict[str, str],
    *,
    expected_quantity: int,
    counted_quantity: int,
    stock_unit_id: str = "LOT-SKU1-OPENING-001",
    location_id: str = "LOC-MAIN",
    count_id: str = "CNT-LOCATION-001",
) -> dict[str, object]:
    return append_inventory_command(
        state,
        {
            "kind": "count",
            "id": count_id,
            "stockUnitId": stock_unit_id,
            "locationId": location_id,
            "expectedQuantity": expected_quantity,
            "countedQuantity": counted_quantity,
            "proof": proof,
        },
    )


def production_inventory_command_id(request_id: str) -> str:
    identity = canonical_digest(
        {
            "contract": "supermega.shop.production-issue-inventory-command.v1",
            "requestId": request_id,
        }
    )
    return f"PIS-{identity[7:39].upper()}"


def production_issued_inventory(
    state: dict[str, object],
    proof: dict[str, str],
    request: dict[str, object],
    *,
    stock_quantity: int = 2,
    allocations: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    return append_inventory_command(
        state,
        {
            "kind": "production_issue",
            "id": production_inventory_command_id(str(request["requestId"])),
            "productionRequestId": request["requestId"],
            "productionCommandDigest": request["sourceCommandDigest"],
            "productionJobId": request["jobId"],
            "productionMaterialId": request["materialId"],
            "productionInputLotId": request["inputLotId"],
            "productionQuantityMilli": request["quantityMilli"],
            "productionUnit": request["unit"],
            "sku": "SKU-1",
            "stockQuantity": stock_quantity,
            "conversionNote": f"{stock_quantity} Shop units provide the reviewed Plant material quantity.",
            "allocations": allocations
            or [
                {
                    "stockUnitId": "LOT-SKU1-OPENING-001",
                    "locationId": "LOC-MAIN",
                    "quantity": stock_quantity,
                }
            ],
            "proof": proof,
        },
    )


def production_return_command_id(production_issue_id: str, action_id: str) -> str:
    identity = canonical_digest(
        {
            "contract": "supermega.shop.production-return-inventory-command.v1",
            "productionIssueId": production_issue_id,
            "actionId": action_id,
        }
    )
    return f"PRT-{identity[7:39].upper()}"


def production_returned_inventory(
    state: dict[str, object],
    proof: dict[str, str],
    *,
    production_quantity_milli: int,
    stock_quantity: int,
    production_issue_id: str | None = None,
    stock_unit_id: str | None = None,
    location_id: str | None = None,
) -> dict[str, object]:
    current = deepcopy(state)
    issue = next(
        command["payload"]
        for command in current["commands"]  # type: ignore[union-attr]
        if command["payload"]["kind"] == "production_issue"
    )
    retained_issue_id = production_issue_id or issue["id"]
    return append_inventory_command(
        current,
        {
            "kind": "production_return",
            "id": production_return_command_id(
                retained_issue_id, proof["actionId"]
            ),
            "productionIssueId": retained_issue_id,
            "productionRequestId": issue["productionRequestId"],
            "productionCommandDigest": issue["productionCommandDigest"],
            "productionJobId": issue["productionJobId"],
            "productionMaterialId": issue["productionMaterialId"],
            "productionInputLotId": issue["productionInputLotId"],
            "productionQuantityMilli": production_quantity_milli,
            "productionUnit": issue["productionUnit"],
            "sku": issue["sku"],
            "stockQuantity": stock_quantity,
            "conversionNote": issue["conversionNote"],
            "stockUnitId": stock_unit_id or issue["allocations"][0]["stockUnitId"],
            "locationId": location_id or issue["allocations"][0]["locationId"],
            "proof": proof,
        },
    )


def production_issue_movement(
    proof: dict[str, str],
    request: dict[str, object],
    *,
    stock_quantity: int = 2,
) -> dict[str, object]:
    return {
        "id": f"MOV2:{proof['actionId']}",
        "actionId": proof["actionId"],
        "createdAt": proof["capturedAt"],
        "actor": proof["actor"],
        "reason": proof["reason"],
        "evidenceReference": proof["evidenceReference"],
        "kind": "production_issue",
        "sku": "SKU-1",
        "quantityDelta": -stock_quantity,
        "productionRequestId": request["requestId"],
        "productionCommandDigest": request["sourceCommandDigest"],
        "productionJobId": request["jobId"],
        "productionMaterialId": request["materialId"],
        "productionInputLotId": request["inputLotId"],
        "productionQuantityMilli": request["quantityMilli"],
        "productionUnit": request["unit"],
        "conversionNote": f"{stock_quantity} Shop units provide the reviewed Plant material quantity.",
    }


def production_receipt_command_id(release_id: str) -> str:
    identity = canonical_digest(
        {
            "contract": "supermega.shop.production-receipt-inventory-command.v1",
            "releaseId": release_id,
        }
    )
    return f"PRC-{identity[7:39].upper()}"


def production_receipt_stock_unit_id(release_id: str) -> str:
    identity = canonical_digest(
        {
            "contract": "supermega.shop.production-receipt-stock-unit.v1",
            "releaseId": release_id,
        }
    )
    return f"LOT-PLANT-{identity[7:31].upper()}"


def production_received_inventory(
    state: dict[str, object],
    proof: dict[str, str],
    release: dict[str, object],
    *,
    quantity: int = 6,
) -> dict[str, object]:
    release_id = str(release["releaseId"])
    output_batch_id = str(release["outputBatchId"])
    return append_inventory_command(
        state,
        {
            "kind": "production_receipt",
            "id": production_receipt_command_id(release_id),
            "productionReleaseId": release_id,
            "productionCommandDigest": release["sourceCommandDigest"],
            "productionJobId": release["jobId"],
            "productionOutputBatchId": output_batch_id,
            "productionReleasedAt": release["releasedAt"],
            "stockUnitId": production_receipt_stock_unit_id(release_id),
            "sku": "SKU-1",
            "trackingCode": output_batch_id,
            "locationId": "LOC-MAIN",
            "quantity": quantity,
            "proof": proof,
        },
    )


def production_receipt_movement(
    proof: dict[str, str],
    release: dict[str, object],
    *,
    quantity: int = 6,
) -> dict[str, object]:
    return {
        "id": f"MOV2:{proof['actionId']}",
        "actionId": proof["actionId"],
        "createdAt": proof["capturedAt"],
        "actor": proof["actor"],
        "reason": proof["reason"],
        "evidenceReference": proof["evidenceReference"],
        "kind": "production_receipt",
        "sku": "SKU-1",
        "quantityDelta": quantity,
        "productionReleaseId": release["releaseId"],
        "productionCommandDigest": release["sourceCommandDigest"],
        "productionJobId": release["jobId"],
        "productionOutputBatchId": release["outputBatchId"],
        "productionReleasedAt": release["releasedAt"],
        "productionSourceProduct": release["sourceProduct"],
    }


def order_inventory_command_id(prefix: str, order_id: str) -> str:
    identity = canonical_digest(
        {
            "contract": "supermega.shop.order-inventory-command.v1",
            "kind": prefix,
            "orderId": order_id,
        }
    )
    return f"{prefix}-{identity[7:39].upper()}"


def order_allocation(
    order_id: str,
    *,
    quantity: int = 3,
    location_id: str = "LOC-MAIN",
) -> dict[str, object]:
    allocation: dict[str, object] = {
        "sku": "SKU-1",
        "stockUnitId": "LOT-SKU1-OPENING-001",
        "locationId": location_id,
        "quantity": quantity,
    }
    identity = canonical_digest(
        {
            "contract": "supermega.shop.order-allocation.v1",
            "orderId": order_id,
            **allocation,
        }
    )
    return {"reservationId": f"RES-ORD-{identity[7:39].upper()}", **allocation}


def reserved_order_inventory(
    state: dict[str, object],
    proof: dict[str, str],
    *,
    order_id: str = "ORD-LOCATION-001",
    quantity: int = 3,
    location_id: str = "LOC-MAIN",
) -> dict[str, object]:
    return append_inventory_command(
        state,
        {
            "kind": "order_reserve",
            "id": order_inventory_command_id("ORS", order_id),
            "orderId": order_id,
            "customerReference": "Customer A",
            "allocations": [
                order_allocation(
                    order_id, quantity=quantity, location_id=location_id
                )
            ],
            "proof": proof,
        },
    )


def closed_order_inventory(
    state: dict[str, object],
    proof: dict[str, str],
    *,
    kind: str,
    order_id: str = "ORD-LOCATION-001",
) -> dict[str, object]:
    reserve = next(
        command["payload"]
        for command in state["commands"]  # type: ignore[union-attr]
        if command["payload"]["kind"] == "order_reserve"
        and command["payload"]["orderId"] == order_id
    )
    prefix = "ORL" if kind == "order_release" else "ORF"
    return append_inventory_command(
        state,
        {
            "kind": kind,
            "id": order_inventory_command_id(prefix, order_id),
            "orderId": order_id,
            "reservationIds": sorted(
                allocation["reservationId"] for allocation in reserve["allocations"]
            ),
            "proof": proof,
        },
    )


def order_return_inventory_command_id(
    order_id: str, sku: str, action_id: str
) -> str:
    identity = canonical_digest(
        {
            "contract": "supermega.shop.order-return-inventory-command.v1",
            "orderId": order_id,
            "sku": sku,
            "actionId": action_id,
        }
    )
    return f"ORT-{identity[7:39].upper()}"


def returned_order_inventory(
    state: dict[str, object],
    proof: dict[str, str],
    *,
    order_id: str = "ORD-LOCATION-001",
    sku: str = "SKU-1",
    quantity: int = 1,
) -> dict[str, object]:
    reserve = next(
        command["payload"]
        for command in state["commands"]  # type: ignore[union-attr]
        if command["payload"]["kind"] == "order_reserve"
        and command["payload"]["orderId"] == order_id
    )
    allocation = next(
        candidate
        for candidate in reserve["allocations"]
        if candidate["sku"] == sku
    )
    return append_inventory_command(
        state,
        {
            "kind": "order_return",
            "id": order_return_inventory_command_id(
                order_id, sku, proof["actionId"]
            ),
            "orderId": order_id,
            "sku": sku,
            "quantity": quantity,
            "allocations": [
                {
                    "reservationId": allocation["reservationId"],
                    "stockUnitId": allocation["stockUnitId"],
                    "locationId": allocation["locationId"],
                    "quantity": quantity,
                }
            ],
            "proof": proof,
        },
    )


def sales_order(
    proof: dict[str, str],
    *,
    order_id: str = "ORD-LOCATION-001",
    quantity: int = 3,
) -> dict[str, object]:
    return {
        "id": order_id,
        "createdAt": proof["capturedAt"],
        "customer": "Customer A",
        "owner": proof["actor"],
        "channel": "Phone",
        "item": "Test item",
        "itemSku": "SKU-1",
        "quantity": quantity,
        "payment": "Cash",
        "paymentStatus": "pending",
        "refundStatus": "none",
        "fulfilment": "pickup",
        "fulfilmentReference": "COUNTER-A",
        "promisedAt": "2026-07-28T08:00:00.000Z",
        "calculation": {
            "schema": "supermega.commerce.order-calculation.v1",
            "currency": "MMK",
            "catalogRevision": 0,
            "subtotalMmk": quantity * 100,
            "taxMode": "not_configured",
            "taxMmk": 0,
            "totalMmk": quantity * 100,
        },
        "total": quantity * 100,
        "status": "confirmed",
    }


def order_movement(
    kind: str,
    proof: dict[str, str],
    quantity_delta: int,
    *,
    order_id: str = "ORD-LOCATION-001",
) -> dict[str, object]:
    return {
        "id": f"MOV2:{proof['actionId']}",
        "actionId": proof["actionId"],
        "createdAt": proof["capturedAt"],
        "actor": proof["actor"],
        "reason": proof["reason"],
        "evidenceReference": proof["evidenceReference"],
        "kind": kind,
        "sku": "SKU-1",
        "quantityDelta": quantity_delta,
        "orderId": order_id,
    }


def purchase_order(proof: dict[str, str] | None = None) -> dict[str, object]:
    creation = proof or action_proof(
        "ACT-PURCHASE-001", "2026-07-27T04:10:00.000Z"
    )
    return {
        "id": PURCHASE_ORDER_ID,
        "createdAt": creation["capturedAt"],
        "expectedAt": "2026-07-28T05:00:00.000Z",
        "supplier": "Opening source",
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


def count_movement(
    proof: dict[str, str], *, expected_quantity: int, counted_quantity: int
) -> dict[str, object]:
    return {
        "id": f"MOV2:{proof['actionId']}",
        "actionId": proof["actionId"],
        "createdAt": proof["capturedAt"],
        "actor": proof["actor"],
        "reason": proof["reason"],
        "evidenceReference": proof["evidenceReference"],
        "kind": "count",
        "sku": "SKU-1",
        "quantityDelta": counted_quantity - expected_quantity,
        "expectedQuantity": expected_quantity,
        "countedQuantity": counted_quantity,
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
        unmastered_order = purchase_order()
        unmastered_order["supplier"] = "Unregistered supplier"
        with self.assertRaisesRegex(TrialValidationError, "retained supplier master"):
            reduce_commerce_state(
                "commerce.purchase_order.created",
                initialized,
                {
                    "state": {**initialized, "purchaseOrders": [unmastered_order]},
                    "evidence": unmastered_order["creation"],
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

    def test_location_count_sets_one_physical_balance_and_preserves_reservations(self) -> None:
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
        reserve_proof = action_proof(
            "ACT-ORDER-RESERVE-COUNT", "2026-07-27T06:00:00.000Z"
        )
        order = sales_order(reserve_proof, order_id="ORD-LOCATION-COUNT")
        reserved_state = deepcopy(initialized)
        reserved_state["items"][0]["onHand"] = 7  # type: ignore[index]
        reserved_state["orders"] = [order]
        reserved_state["movements"] = [
            order_movement(
                "reserve", reserve_proof, -3, order_id="ORD-LOCATION-COUNT"
            )
        ]
        reserved_state["inventoryFoundation"] = reserved_order_inventory(
            initialized["inventoryFoundation"],
            reserve_proof,
            order_id="ORD-LOCATION-COUNT",
        )
        reserved = reduce_commerce_state(
            "commerce.order.created",
            initialized,
            {"state": reserved_state, "evidence": reserve_proof},
        )

        count_proof = action_proof(
            "ACT-LOCATION-COUNT-001", "2026-07-27T07:00:00.000Z"
        )
        counted_state = deepcopy(reserved)
        counted_state["items"][0]["onHand"] = 5  # type: ignore[index]
        counted_state["movements"] = [
            count_movement(
                count_proof, expected_quantity=7, counted_quantity=5
            ),
            *reserved["movements"],  # type: ignore[misc]
        ]
        counted_state["inventoryFoundation"] = counted_inventory(
            reserved["inventoryFoundation"],
            count_proof,
            expected_quantity=10,
            counted_quantity=8,
        )
        counted = reduce_commerce_state(
            "commerce.stock.counted",
            reserved,
            {"state": counted_state, "evidence": count_proof},
        )
        main_balance = next(
            balance
            for balance in shop_inventory_balances(
                counted["inventoryFoundation"], ["SKU-1"]
            )
            if balance["stockUnitId"] == "LOT-SKU1-OPENING-001"
            and balance["locationId"] == "LOC-MAIN"
        )
        self.assertEqual(
            (main_balance["onHand"], main_balance["reserved"], main_balance["availableToPromise"]),
            (8, 3, 5),
        )
        self.assertEqual(
            shop_inventory_sku_totals(counted["inventoryFoundation"], ["SKU-1"]),
            {"SKU-1": 8},
        )
        self.assertEqual(
            shop_inventory_sku_available_to_promise(
                counted["inventoryFoundation"], ["SKU-1"]
            ),
            {"SKU-1": 5},
        )

        stale = deepcopy(counted_state)
        stale["inventoryFoundation"] = counted_inventory(
            reserved["inventoryFoundation"],
            count_proof,
            expected_quantity=9,
            counted_quantity=8,
        )
        with self.assertRaisesRegex(TrialValidationError, "expected quantity is stale"):
            reduce_commerce_state(
                "commerce.stock.counted",
                reserved,
                {"state": stale, "evidence": count_proof},
            )

        below_reserved = deepcopy(counted_state)
        below_reserved["inventoryFoundation"] = counted_inventory(
            reserved["inventoryFoundation"],
            count_proof,
            expected_quantity=10,
            counted_quantity=2,
        )
        with self.assertRaisesRegex(TrialValidationError, "below reserved stock"):
            reduce_commerce_state(
                "commerce.stock.counted",
                reserved,
                {"state": below_reserved, "evidence": count_proof},
            )

        aggregate_only = deepcopy(counted_state)
        aggregate_only["inventoryFoundation"] = reserved["inventoryFoundation"]
        with self.assertRaisesRegex(TrialValidationError, "location inventory|location count"):
            reduce_commerce_state(
                "commerce.stock.counted",
                reserved,
                {"state": aggregate_only, "evidence": count_proof},
            )

    def test_production_issue_consumes_one_deterministic_location_allocation(self) -> None:
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
        request: dict[str, object] = {
            "requestId": "ISSUE-LOCATION-001",
            "sourceCommandDigest": canonical_digest({"plant": "issue-001"}),
            "jobId": "JOB-LOCATION-001",
            "materialId": "MAT-LOCATION-001",
            "inputLotId": "INPUT-LOT-001",
            "quantityMilli": 10_000,
            "unit": "kg",
        }
        proof = action_proof(
            "ACT-PRODUCTION-LOCATION-001", "2026-07-27T08:00:00.000Z"
        )
        candidate = deepcopy(initialized)
        candidate["items"][0]["onHand"] = 8  # type: ignore[index]
        candidate["movements"] = [production_issue_movement(proof, request)]
        candidate["inventoryFoundation"] = production_issued_inventory(
            initialized["inventoryFoundation"], proof, request
        )
        accepted = reduce_commerce_state(
            "commerce.production_material.issued",
            initialized,
            {"state": candidate, "evidence": proof},
        )
        latest = accepted["inventoryFoundation"]["commands"][-1]["payload"]
        self.assertEqual(latest["kind"], "production_issue")
        self.assertEqual(
            latest["id"], production_inventory_command_id("ISSUE-LOCATION-001")
        )
        self.assertEqual(
            latest["allocations"],
            [
                {
                    "stockUnitId": "LOT-SKU1-OPENING-001",
                    "locationId": "LOC-MAIN",
                    "quantity": 2,
                }
            ],
        )
        self.assertEqual(
            shop_inventory_sku_totals(
                accepted["inventoryFoundation"], ["SKU-1"]
            ),
            {"SKU-1": 8},
        )
        self.assertEqual(
            shop_inventory_sku_available_to_promise(
                accepted["inventoryFoundation"], ["SKU-1"]
            ),
            {"SKU-1": 8},
        )

        split_request = {**request, "requestId": "ISSUE-LOCATION-SPLIT"}
        split_proof = action_proof(
            "ACT-PRODUCTION-LOCATION-SPLIT", "2026-07-27T08:15:00.000Z"
        )
        deterministic = production_issued_inventory(
            transferred_inventory(opening),
            split_proof,
            split_request,
            stock_quantity=4,
        )
        validate_shop_inventory_state(deterministic, ["SKU-1"])
        non_deterministic = production_issued_inventory(
            transferred_inventory(opening),
            split_proof,
            split_request,
            stock_quantity=4,
            allocations=[
                {
                    "stockUnitId": "LOT-SKU1-OPENING-001",
                    "locationId": "LOC-BRANCH",
                    "quantity": 3,
                },
                {
                    "stockUnitId": "LOT-SKU1-OPENING-001",
                    "locationId": "LOC-MAIN",
                    "quantity": 1,
                },
            ],
        )
        with self.assertRaisesRegex(
            ShopInventoryValidationError, "deterministic available location stock"
        ):
            validate_shop_inventory_state(non_deterministic, ["SKU-1"])

        aggregate_only = deepcopy(candidate)
        aggregate_only["inventoryFoundation"] = initialized["inventoryFoundation"]
        with self.assertRaisesRegex(TrialValidationError, "production issue location"):
            reduce_commerce_state(
                "commerce.production_material.issued",
                initialized,
                {"state": aggregate_only, "evidence": proof},
            )

        reserve_proof = action_proof(
            "ACT-ORDER-RESERVE-PRODUCTION", "2026-07-27T08:30:00.000Z"
        )
        reserved = reserved_order_inventory(
            opening,
            reserve_proof,
            order_id="ORD-LOCATION-PRODUCTION",
            quantity=3,
        )
        over_issue_proof = action_proof(
            "ACT-PRODUCTION-LOCATION-OVER", "2026-07-27T09:00:00.000Z"
        )
        over_issued = production_issued_inventory(
            reserved,
            over_issue_proof,
            {**request, "requestId": "ISSUE-LOCATION-OVER"},
            stock_quantity=8,
        )
        with self.assertRaisesRegex(
            ShopInventoryValidationError, "cannot allocate|available"
        ):
            validate_shop_inventory_state(over_issued, ["SKU-1"])

    def test_production_return_restores_only_reviewed_issue_lot_and_quantity(self) -> None:
        request: dict[str, object] = {
            "requestId": "ISSUE-RETURN-001",
            "sourceCommandDigest": canonical_digest({"plant": "issue-return-001"}),
            "jobId": "JOB-RETURN-001",
            "materialId": "MAT-RETURN-001",
            "inputLotId": "INPUT-RETURN-001",
            "quantityMilli": 10_000,
            "unit": "kg",
        }
        issued = production_issued_inventory(
            opening_inventory(),
            action_proof("ACT-PRODUCTION-RETURN-ISSUE", "2026-07-27T08:00:00.000Z"),
            request,
            stock_quantity=4,
        )
        first_proof = action_proof(
            "ACT-PRODUCTION-RETURN-001", "2026-07-27T08:10:00.000Z", "operator-return"
        )
        first = production_returned_inventory(
            issued,
            first_proof,
            production_quantity_milli=2_500,
            stock_quantity=1,
        )
        validated = validate_shop_inventory_state(first, ["SKU-1"])
        latest = validated["commands"][-1]["payload"]
        self.assertEqual(latest["kind"], "production_return")
        self.assertEqual(
            latest["id"],
            production_return_command_id(
                production_inventory_command_id("ISSUE-RETURN-001"),
                "ACT-PRODUCTION-RETURN-001",
            ),
        )
        self.assertEqual(latest["stockUnitId"], "LOT-SKU1-OPENING-001")
        self.assertEqual(latest["locationId"], "LOC-MAIN")
        self.assertEqual(shop_inventory_sku_totals(first, ["SKU-1"]), {"SKU-1": 7})

        second = production_returned_inventory(
            first,
            action_proof("ACT-PRODUCTION-RETURN-002", "2026-07-27T08:20:00.000Z"),
            production_quantity_milli=2_500,
            stock_quantity=1,
        )
        self.assertEqual(shop_inventory_sku_totals(second, ["SKU-1"]), {"SKU-1": 8})

        over_return = production_returned_inventory(
            second,
            action_proof("ACT-PRODUCTION-RETURN-OVER", "2026-07-27T08:30:00.000Z"),
            production_quantity_milli=7_500,
            stock_quantity=3,
        )
        with self.assertRaisesRegex(
            ShopInventoryValidationError, "exceeds the unconsumed quantity"
        ):
            validate_shop_inventory_state(over_return, ["SKU-1"])

        wrong_ratio = production_returned_inventory(
            issued,
            action_proof("ACT-PRODUCTION-RETURN-RATIO", "2026-07-27T08:30:00.000Z"),
            production_quantity_milli=2_000,
            stock_quantity=1,
        )
        with self.assertRaisesRegex(ShopInventoryValidationError, "conversion ratio"):
            validate_shop_inventory_state(wrong_ratio, ["SKU-1"])

        wrong_location = production_returned_inventory(
            issued,
            action_proof("ACT-PRODUCTION-RETURN-LOCATION", "2026-07-27T08:30:00.000Z"),
            production_quantity_milli=2_500,
            stock_quantity=1,
            location_id="LOC-BRANCH",
        )
        with self.assertRaisesRegex(ShopInventoryValidationError, "exact lot and location"):
            validate_shop_inventory_state(wrong_location, ["SKU-1"])

        unknown_issue = production_returned_inventory(
            issued,
            action_proof("ACT-PRODUCTION-RETURN-UNKNOWN", "2026-07-27T08:30:00.000Z"),
            production_quantity_milli=2_500,
            stock_quantity=1,
            production_issue_id="PIS-UNKNOWN-001",
        )
        with self.assertRaisesRegex(ShopInventoryValidationError, "earlier Plant issue"):
            validate_shop_inventory_state(unknown_issue, ["SKU-1"])

        tampered_identity = production_returned_inventory(
            issued,
            action_proof("ACT-PRODUCTION-RETURN-TAMPER", "2026-07-27T08:30:00.000Z"),
            production_quantity_milli=2_500,
            stock_quantity=1,
        )
        tampered_identity["commands"][-1]["payload"]["productionJobId"] = "JOB-TAMPERED"  # type: ignore[index]
        body = {
            key: tampered_identity["commands"][-1][key]  # type: ignore[index]
            for key in ("sequence", "previousDigest", "payload")
        }
        tampered_identity["commands"][-1]["digest"] = canonical_digest(body)  # type: ignore[index]
        tampered_identity["headDigest"] = tampered_identity["commands"][-1]["digest"]  # type: ignore[index]
        with self.assertRaisesRegex(ShopInventoryValidationError, "immutable Plant issue"):
            validate_shop_inventory_state(tampered_identity, ["SKU-1"])

        duplicate = append_inventory_command(first, deepcopy(latest))
        with self.assertRaisesRegex(
            ShopInventoryValidationError, "command or action ID is duplicated"
        ):
            validate_shop_inventory_state(duplicate, ["SKU-1"])

    def test_managed_plant_batch_receipt_updates_aggregate_and_location_truth(self) -> None:
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
        release: dict[str, object] = {
            "releaseId": "QREL-PLANT-001",
            "sourceCommandDigest": canonical_digest({"plant": "released-batch-001"}),
            "jobId": "JOB-PLANT-001",
            "outputBatchId": "BATCH-PLANT-001",
            "releasedAt": "2026-07-27T09:00:00.000Z",
            "sourceProduct": "Finished Product A",
        }
        proof = {
            **action_proof(
                "ACT-PLANT-RECEIPT-001", "2026-07-27T09:15:00.000Z"
            ),
            "evidenceReference": (
                "PLANT-BATCH:QREL-PLANT-001:"
                f"{release['sourceCommandDigest']}:LOC-MAIN"
            ),
        }
        candidate = deepcopy(initialized)
        candidate["items"][0]["onHand"] = 16  # type: ignore[index]
        candidate["movements"] = [production_receipt_movement(proof, release)]
        candidate["inventoryFoundation"] = production_received_inventory(
            initialized["inventoryFoundation"], proof, release
        )
        accepted = reduce_commerce_state(
            "commerce.production_batch.received",
            initialized,
            {"state": candidate, "evidence": proof},
        )
        self.assertEqual(accepted["items"][0]["onHand"], 16)
        self.assertEqual(
            shop_inventory_sku_totals(
                accepted["inventoryFoundation"], ["SKU-1"]
            ),
            {"SKU-1": 16},
        )
        self.assertEqual(
            accepted["movements"][0]["productionSourceProduct"],  # type: ignore[index]
            "Finished Product A",
        )

        conflicting_mapping = deepcopy(accepted)
        conflicting_mapping["items"].append(  # type: ignore[union-attr]
            {
                "sku": "SKU-2",
                "name": "Alternate finished product",
                "onHand": 0,
                "reorderAt": 0,
                "price": 500,
            }
        )
        conflicting_release = {
            **release,
            "releaseId": "QREL-PLANT-002",
            "outputBatchId": "BATCH-PLANT-002",
        }
        conflicting_proof = {
            **action_proof(
                "ACT-PLANT-RECEIPT-002", "2026-07-27T09:30:00.000Z"
            ),
            "evidenceReference": (
                "PLANT-BATCH:QREL-PLANT-002:"
                f"{release['sourceCommandDigest']}:LOC-MAIN"
            ),
        }
        conflicting_movement = production_receipt_movement(
            conflicting_proof, conflicting_release
        )
        conflicting_movement["sku"] = "SKU-2"
        conflicting_mapping["movements"] = [
            conflicting_movement,
            *accepted["movements"],  # type: ignore[misc]
        ]
        with self.assertRaisesRegex(
            TrialValidationError, "conflicts with the retained Plant product mapping"
        ):
            reduce_commerce_state(
                "commerce.production_batch.received",
                accepted,
                {"state": conflicting_mapping, "evidence": conflicting_proof},
            )

        self.assertEqual(
            shop_inventory_sku_available_to_promise(
                accepted["inventoryFoundation"], ["SKU-1"]
            ),
            {"SKU-1": 16},
        )

        tampered = deepcopy(candidate)
        tampered["inventoryFoundation"]["commands"][-1]["payload"][  # type: ignore[index]
            "productionOutputBatchId"
        ] = "BATCH-TAMPERED-001"
        with self.assertRaises(TrialValidationError):
            reduce_commerce_state(
                "commerce.production_batch.received",
                initialized,
                {"state": tampered, "evidence": proof},
            )

        duplicate_proof = {
            **proof,
            "actionId": "ACT-PLANT-RECEIPT-DUPLICATE",
            "capturedAt": "2026-07-27T09:30:00.000Z",
        }
        duplicate = deepcopy(accepted)
        duplicate["items"][0]["onHand"] = 22  # type: ignore[index]
        duplicate["movements"] = [
            production_receipt_movement(duplicate_proof, release),
            *accepted["movements"],
        ]
        duplicate["inventoryFoundation"] = production_received_inventory(
            accepted["inventoryFoundation"], duplicate_proof, release
        )
        with self.assertRaises(TrialValidationError):
            reduce_commerce_state(
                "commerce.production_batch.received",
                accepted,
                {"state": duplicate, "evidence": duplicate_proof},
            )

    def test_client_and_supplier_masters_are_append_only_and_stock_neutral(self) -> None:
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
        proof = action_proof("ACT-MASTER-001", MASTER_AT)
        created_foundation = master_created_inventory(
            initialized["inventoryFoundation"], proof
        )
        accepted = reduce_commerce_state(
            "commerce.inventory.master_created",
            initialized,
            {
                "state": {**initialized, "inventoryFoundation": created_foundation},
                "evidence": proof,
            },
        )
        self.assertEqual(
            shop_inventory_sku_totals(accepted["inventoryFoundation"], ["SKU-1"]),
            {"SKU-1": 10},
        )
        self.assertEqual(
            shop_inventory_sku_available_to_promise(
                accepted["inventoryFoundation"], ["SKU-1"]
            ),
            {"SKU-1": 10},
        )

        duplicate_name = master_created_inventory(
            accepted["inventoryFoundation"],
            action_proof("ACT-MASTER-002", "2026-07-27T02:40:00.000Z"),
            command_id="MST-CLIENT-002",
            master_id="CLI-ACCOUNT-002",
            name="golden lotus",
        )
        with self.assertRaises(ShopInventoryValidationError):
            validate_shop_inventory_state(duplicate_name, ["SKU-1"])

        duplicate_id = master_created_inventory(
            accepted["inventoryFoundation"],
            action_proof("ACT-MASTER-003", "2026-07-27T02:50:00.000Z"),
            command_id="MST-CLIENT-003",
            master_id="CLI-ACCOUNT-001",
            name="Another account",
        )
        with self.assertRaises(ShopInventoryValidationError):
            validate_shop_inventory_state(duplicate_id, ["SKU-1"])

        tampered = deepcopy(created_foundation)
        tampered["commands"][-1]["payload"]["master"]["name"] = "Changed"  # type: ignore[index]
        with self.assertRaises(ShopInventoryValidationError):
            validate_shop_inventory_state(tampered, ["SKU-1"])

    def test_order_allocation_reserve_release_and_fulfil_are_atomic(self) -> None:
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
        reserve_proof = action_proof(
            "ACT-ORDER-RESERVE-001", "2026-07-27T06:00:00.000Z"
        )
        order = sales_order(reserve_proof)
        reserved_state = deepcopy(initialized)
        reserved_state["items"][0]["onHand"] = 7  # type: ignore[index]
        reserved_state["orders"] = [order]
        reserved_state["movements"] = [
            order_movement("reserve", reserve_proof, -3)
        ]
        reserved_state["inventoryFoundation"] = reserved_order_inventory(
            initialized["inventoryFoundation"], reserve_proof
        )
        reserved = reduce_commerce_state(
            "commerce.order.created",
            initialized,
            {"state": reserved_state, "evidence": reserve_proof},
        )
        self.assertEqual(
            shop_inventory_sku_totals(reserved["inventoryFoundation"], ["SKU-1"]),
            {"SKU-1": 10},
        )
        self.assertEqual(
            shop_inventory_sku_available_to_promise(
                reserved["inventoryFoundation"], ["SKU-1"]
            ),
            {"SKU-1": 7},
        )
        forged_identity = deepcopy(reserved["inventoryFoundation"])
        forged_identity["commands"][-1]["payload"]["id"] = (  # type: ignore[index]
            f"ORS-{'A' * 32}"
        )
        with self.assertRaisesRegex(
            ShopInventoryValidationError, "not deterministic"
        ):
            validate_shop_inventory_state(forged_identity, ["SKU-1"])

        non_deterministic_current = {
            **initialized,
            "inventoryFoundation": transferred_inventory(
                initialized["inventoryFoundation"]
            ),
        }
        non_deterministic = deepcopy(reserved_state)
        non_deterministic["inventoryFoundation"] = reserved_order_inventory(
            non_deterministic_current["inventoryFoundation"],
            reserve_proof,
            location_id="LOC-BRANCH",
        )
        with self.assertRaisesRegex(TrialValidationError, "fewest-lot"):
            reduce_commerce_state(
                "commerce.order.created",
                non_deterministic_current,
                {"state": non_deterministic, "evidence": reserve_proof},
            )

        cancel_proof = action_proof(
            "ACT-ORDER-RELEASE-001", "2026-07-27T07:00:00.000Z"
        )
        cancelled_state = deepcopy(reserved)
        cancelled_state["items"][0]["onHand"] = 10  # type: ignore[index]
        cancelled_state["orders"][0].update(  # type: ignore[index]
            {"status": "cancelled", "refundStatus": "none"}
        )
        cancelled_state["movements"] = [
            order_movement("release", cancel_proof, 3),
            *reserved["movements"],  # type: ignore[misc]
        ]
        cancelled_state["inventoryFoundation"] = closed_order_inventory(
            reserved["inventoryFoundation"], cancel_proof, kind="order_release"
        )
        cancelled = reduce_commerce_state(
            "commerce.order.cancelled",
            reserved,
            {"state": cancelled_state, "evidence": cancel_proof},
        )
        self.assertEqual(
            shop_inventory_sku_available_to_promise(
                cancelled["inventoryFoundation"], ["SKU-1"]
            ),
            {"SKU-1": 10},
        )

        ready = deepcopy(reserved)
        ready["orders"][0].update(  # type: ignore[index]
            {
                "status": "ready",
                "paymentStatus": "reconciled",
                "paymentReconciledAt": "2026-07-27T07:00:00.000Z",
                "paymentReconciliationActionId": "ACT-PAY-LOCATION-001",
                "paymentReconciledBy": "operator-a",
                "paymentReconciliationReason": "Payment reviewed.",
                "paymentEvidenceReference": "PAYMENT:LOCATION-001",
                "advancementActionIds": ["ACT-PREPARING-001", "ACT-READY-001"],
            }
        )
        completion_proof = action_proof(
            "ACT-ORDER-FULFIL-001", "2026-07-27T08:00:00.000Z"
        )
        completed_state = deepcopy(ready)
        completed_state["orders"][0].update(  # type: ignore[index]
            {"status": "completed", "completion": completion_proof}
        )
        completed_state["inventoryFoundation"] = closed_order_inventory(
            ready["inventoryFoundation"], completion_proof, kind="order_fulfil"
        )
        completed = reduce_commerce_state(
            "commerce.order.advanced",
            ready,
            {"state": completed_state, "evidence": completion_proof},
        )
        self.assertEqual(
            shop_inventory_sku_totals(completed["inventoryFoundation"], ["SKU-1"]),
            {"SKU-1": 7},
        )
        self.assertEqual(
            shop_inventory_sku_available_to_promise(
                completed["inventoryFoundation"], ["SKU-1"]
            ),
            {"SKU-1": 7},
        )

        return_proof = action_proof(
            "ACT-ORDER-RETURN-001", "2026-07-27T09:00:00.000Z"
        )
        returned_state = deepcopy(completed)
        returned_state["items"][0]["onHand"] = 8  # type: ignore[index]
        returned_state["orders"][0]["returns"] = [  # type: ignore[index]
            {
                "actionId": return_proof["actionId"],
                "createdAt": return_proof["capturedAt"],
                "actor": return_proof["actor"],
                "reason": return_proof["reason"],
                "evidenceReference": return_proof["evidenceReference"],
                "sku": "SKU-1",
                "quantity": 1,
                "disposition": "restock",
            }
        ]
        returned_state["movements"] = [
            order_movement("return", return_proof, 1),
            *completed["movements"],  # type: ignore[misc]
        ]
        returned_state["inventoryFoundation"] = returned_order_inventory(
            completed["inventoryFoundation"], return_proof
        )
        returned = reduce_commerce_state(
            "commerce.order.return_recorded",
            completed,
            {"state": returned_state, "evidence": return_proof},
        )
        latest_return = returned["inventoryFoundation"]["commands"][-1]["payload"]  # type: ignore[index]
        self.assertEqual(latest_return["kind"], "order_return")
        self.assertEqual(latest_return["orderId"], "ORD-LOCATION-001")
        self.assertEqual(latest_return["allocations"][0]["locationId"], "LOC-MAIN")
        self.assertEqual(
            shop_inventory_sku_totals(returned["inventoryFoundation"], ["SKU-1"]),
            {"SKU-1": 8},
        )
        self.assertEqual(
            shop_inventory_sku_available_to_promise(
                returned["inventoryFoundation"], ["SKU-1"]
            ),
            {"SKU-1": 8},
        )

        authoritative = _authoritative_command_payload(
            {"state": returned_state, "evidence": return_proof},
            principal=TrialPrincipal(
                "workspace-return", "authenticated-return-operator", "human"
            ),
            surface="commerce",
            event_type="commerce.order.return_recorded",
            captured_at="2026-07-27T09:30:00+00:00",
        )
        authoritative_returned = reduce_commerce_state(
            "commerce.order.return_recorded",
            completed,
            authoritative,
        )
        authoritative_record = authoritative_returned["orders"][0]["returns"][0]  # type: ignore[index]
        authoritative_movement = authoritative_returned["movements"][0]  # type: ignore[index]
        authoritative_location_proof = authoritative_returned["inventoryFoundation"]["commands"][-1]["payload"]["proof"]  # type: ignore[index]
        for evidence_record in (
            authoritative["evidence"],
            authoritative_record,
            authoritative_movement,
            authoritative_location_proof,
        ):
            self.assertEqual(
                evidence_record["actor"], "authenticated-return-operator"
            )
        self.assertEqual(
            authoritative_location_proof["capturedAt"],
            "2026-07-27T09:30:00+00:00",
        )

        missing_location_return = deepcopy(returned_state)
        missing_location_return["inventoryFoundation"] = completed[
            "inventoryFoundation"
        ]
        with self.assertRaisesRegex(TrialValidationError, "location command"):
            reduce_commerce_state(
                "commerce.order.return_recorded",
                completed,
                {"state": missing_location_return, "evidence": return_proof},
            )

        forged_allocation = deepcopy(returned["inventoryFoundation"])
        forged_allocation["commands"][-1]["payload"]["allocations"][0][  # type: ignore[index]
            "locationId"
        ] = "LOC-BRANCH"
        forged_body = {
            "sequence": forged_allocation["commands"][-1]["sequence"],  # type: ignore[index]
            "previousDigest": forged_allocation["commands"][-1]["previousDigest"],  # type: ignore[index]
            "payload": forged_allocation["commands"][-1]["payload"],  # type: ignore[index]
        }
        forged_allocation["commands"][-1]["digest"] = canonical_digest(  # type: ignore[index]
            forged_body
        )
        forged_allocation["headDigest"] = forged_allocation["commands"][-1][  # type: ignore[index]
            "digest"
        ]
        with self.assertRaisesRegex(
            ShopInventoryValidationError, "deterministic|fulfilled reservation"
        ):
            validate_shop_inventory_state(forged_allocation, ["SKU-1"])

        over_return = returned_order_inventory(
            returned["inventoryFoundation"],
            action_proof(
                "ACT-ORDER-RETURN-OVER", "2026-07-27T10:00:00.000Z"
            ),
            quantity=3,
        )
        with self.assertRaisesRegex(
            ShopInventoryValidationError, "only 2 location units"
        ):
            validate_shop_inventory_state(over_return, ["SKU-1"])

    def test_store_stamps_order_location_reserve_and_release(self) -> None:
        store = InMemoryTrialStore(reducer=reduce_trial_state)
        operator = TrialPrincipal("workspace-order", "operator-order", "human")
        store.provision_membership(
            workspace_id=operator.workspace_id,
            actor_id=operator.actor_id,
            actor_kind=operator.actor_kind,
            capabilities=("commerce.read", "commerce.write"),
        )
        with patch(
            "supermega_runtime.trial_store._utc_now",
            return_value="2026-07-27T05:00:00+00:00",
        ):
            initialized = store.apply_command(
                operator,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.workspace.initialized",
                expected_version=0,
                payload={
                    "state": commerce_state(),
                    "evidence": action_proof("ACT-CATALOG-ORDER-001", OPEN_AT),
                },
            )
        opening = opening_inventory(
            action_proof("ACT-OPENING-ORDER-001", OPEN_AT)
        )
        with patch(
            "supermega_runtime.trial_store._utc_now",
            return_value="2026-07-27T05:30:00+00:00",
        ):
            located = store.apply_command(
                operator,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.inventory.initialized",
                expected_version=initialized.version,
                payload={
                    "state": {**initialized.state, "inventoryFoundation": opening},
                    "evidence": opening["commands"][-1]["payload"]["proof"],  # type: ignore[index]
                },
            )

        forged_reserve = action_proof(
            "ACT-ORDER-STORE-RESERVE-001",
            "2099-01-01T00:00:00.000Z",
            "forged-order-actor",
        )
        order = sales_order(forged_reserve)
        reserve_state = deepcopy(located.state)
        reserve_state["items"][0]["onHand"] = 7  # type: ignore[index]
        reserve_state["orders"] = [order]
        reserve_state["movements"] = [
            order_movement("reserve", forged_reserve, -3)
        ]
        reserve_state["inventoryFoundation"] = reserved_order_inventory(
            located.state["inventoryFoundation"], forged_reserve
        )
        reserve_command_id = str(uuid4())
        with patch(
            "supermega_runtime.trial_store._utc_now",
            return_value="2026-07-27T06:00:00+00:00",
        ):
            reserved = store.apply_command(
                operator,
                command_id=reserve_command_id,
                surface="commerce",
                event_type="commerce.order.created",
                expected_version=located.version,
                payload={"state": reserve_state, "evidence": forged_reserve},
            )
            reserve_replay = store.apply_command(
                operator,
                command_id=reserve_command_id,
                surface="commerce",
                event_type="commerce.order.created",
                expected_version=located.version,
                payload={"state": reserve_state, "evidence": forged_reserve},
            )
        self.assertTrue(reserve_replay.idempotent_replay)
        self.assertEqual(reserved.state["orders"][0]["owner"], operator.actor_id)  # type: ignore[index]
        self.assertEqual(reserved.state["movements"][0]["actor"], operator.actor_id)  # type: ignore[index]
        retained_reserve_proof = reserved.state["inventoryFoundation"]["commands"][-1]["payload"]["proof"]  # type: ignore[index]
        self.assertEqual(retained_reserve_proof["actor"], operator.actor_id)
        self.assertEqual(
            retained_reserve_proof["capturedAt"], "2026-07-27T06:00:00+00:00"
        )

        forged_release = action_proof(
            "ACT-ORDER-STORE-RELEASE-001",
            "2099-01-02T00:00:00.000Z",
            "forged-release-actor",
        )
        release_state = deepcopy(reserved.state)
        release_state["items"][0]["onHand"] = 10  # type: ignore[index]
        release_state["orders"][0].update(  # type: ignore[index]
            {"status": "cancelled", "refundStatus": "none"}
        )
        release_state["movements"] = [
            order_movement("release", forged_release, 3),
            *reserved.state["movements"],  # type: ignore[misc]
        ]
        release_state["inventoryFoundation"] = closed_order_inventory(
            reserved.state["inventoryFoundation"],
            forged_release,
            kind="order_release",
        )
        with patch(
            "supermega_runtime.trial_store._utc_now",
            return_value="2026-07-27T07:00:00+00:00",
        ):
            released = store.apply_command(
                operator,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.order.cancelled",
                expected_version=reserved.version,
                payload={"state": release_state, "evidence": forged_release},
            )
        retained_release_proof = released.state["inventoryFoundation"]["commands"][-1]["payload"]["proof"]  # type: ignore[index]
        self.assertEqual(released.state["movements"][0]["actor"], operator.actor_id)  # type: ignore[index]
        self.assertEqual(retained_release_proof["actor"], operator.actor_id)
        self.assertEqual(
            retained_release_proof["capturedAt"], "2026-07-27T07:00:00+00:00"
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

        spoofed_count_proof = action_proof(
            "ACT-LOCATION-COUNT-STORE",
            "2099-01-01T00:00:00.000Z",
            "fabricated-counter",
        )
        count_state = deepcopy(received.state)
        count_state["items"][0]["onHand"] = 13  # type: ignore[index]
        count_state["movements"] = [
            count_movement(
                spoofed_count_proof,
                expected_quantity=14,
                counted_quantity=13,
            ),
            *received.state["movements"],  # type: ignore[misc]
        ]
        count_state["inventoryFoundation"] = counted_inventory(
            received.state["inventoryFoundation"],
            spoofed_count_proof,
            expected_quantity=7,
            counted_quantity=6,
            count_id="CNT-LOCATION-STORE",
        )
        count_payload = {"state": count_state, "evidence": spoofed_count_proof}
        count_command_id = str(uuid4())
        with patch(
            "supermega_runtime.trial_store._utc_now",
            return_value="2026-07-27T06:00:00+00:00",
        ):
            counted = store.apply_command(
                operator,
                command_id=count_command_id,
                surface="commerce",
                event_type="commerce.stock.counted",
                expected_version=received.version,
                payload=count_payload,
            )
            count_replay = store.apply_command(
                operator,
                command_id=count_command_id,
                surface="commerce",
                event_type="commerce.stock.counted",
                expected_version=received.version,
                payload=count_payload,
            )
        retained_count_movement = counted.state["movements"][0]
        retained_count_proof = counted.state["inventoryFoundation"]["commands"][-1][
            "payload"
        ]["proof"]
        self.assertEqual(retained_count_movement["actor"], operator.actor_id)
        self.assertEqual(
            retained_count_movement["createdAt"], "2026-07-27T06:00:00+00:00"
        )
        self.assertEqual(retained_count_proof["actor"], operator.actor_id)
        self.assertEqual(
            retained_count_proof["capturedAt"], "2026-07-27T06:00:00+00:00"
        )
        self.assertTrue(count_replay.idempotent_replay)
        self.assertEqual(count_replay.state, counted.state)
        self.assertEqual(counted.state["items"][0]["onHand"], 13)


if __name__ == "__main__":
    unittest.main()
