from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
import unittest

from supermega_runtime.shop_inventory_foundation import (
    EMPTY_SHOP_INVENTORY_DIGEST,
    SHOP_INVENTORY_PROJECTION_CONTRACT,
    ShopInventoryValidationError,
    apply_shop_inventory_import,
    build_shop_inventory_import_package,
    create_empty_shop_inventory_state,
    fulfil_shop_inventory_reservation,
    project_shop_inventory,
    release_shop_inventory_reservation,
    reserve_shop_inventory,
    transfer_shop_inventory,
    validate_shop_inventory_state,
)


CATALOG = ["SM-1001", "SM-1002"]


def _source_digest(label: str = "opening") -> str:
    return f"sha256:{sha256(label.encode()).hexdigest()}"


def _proof(sequence: int, label: str) -> dict[str, str]:
    return {
        "actionId": f"ACT-{sequence:03d}-{label.upper()}",
        "capturedAt": f"2026-07-26T0{sequence}:00:00+06:30",
        "actor": "Daw Mya",
        "reason": f"Review and record {label}.",
        "evidenceReference": f"EVIDENCE-{sequence:03d}",
    }


def _package(
    *,
    import_id: str = "IMP-OPENING-001",
    source_label: str = "opening",
    catalog: list[str] | None = None,
    clients: list[dict[str, str]] | None = None,
    vendors: list[dict[str, str]] | None = None,
    locations: list[dict[str, str]] | None = None,
    stock_units: list[dict[str, str]] | None = None,
    openings: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    return build_shop_inventory_import_package(
        import_id=import_id,
        source_digest=_source_digest(source_label),
        catalog_skus=catalog or CATALOG,
        clients=clients or [{"id": "CLI-RETAIL-001", "name": "ရွှေဆိုင် customer"}],
        vendors=vendors or [{"id": "VEN-YANGON-001", "name": "Yangon Supply"}],
        locations=locations
        or [
            {"id": "LOC-BRANCH", "name": "Branch"},
            {"id": "LOC-MAIN", "name": "Main store"},
        ],
        stock_units=stock_units
        or [
            {
                "id": "LOT-SM1001-BATCH-A",
                "sku": "SM-1001",
                "tracking": "lot",
                "trackingCode": "BATCH-A",
            },
            {
                "id": "SER-SM1002-UNIT-001",
                "sku": "SM-1002",
                "tracking": "serial",
                "trackingCode": "UNIT-001",
            },
        ],
        openings=openings
        or [
            {
                "stockUnitId": "LOT-SM1001-BATCH-A",
                "locationId": "LOC-MAIN",
                "vendorId": "VEN-YANGON-001",
                "quantity": 5,
            },
            {
                "stockUnitId": "SER-SM1002-UNIT-001",
                "locationId": "LOC-MAIN",
                "vendorId": "VEN-YANGON-001",
                "quantity": 1,
            },
        ],
    )


def _opened_state() -> dict[str, object]:
    result = apply_shop_inventory_import(
        create_empty_shop_inventory_state(),
        _package(),
        _proof(1, "opening"),
        catalog_skus=CATALOG,
        expected_head_digest=EMPTY_SHOP_INVENTORY_DIGEST,
    )
    return result["state"]


def _transferred_state() -> dict[str, object]:
    state = _opened_state()
    return transfer_shop_inventory(
        state,
        transfer_id="TRF-MAIN-BRANCH-001",
        stock_unit_id="LOT-SM1001-BATCH-A",
        from_location_id="LOC-MAIN",
        to_location_id="LOC-BRANCH",
        quantity=2,
        proof=_proof(2, "transfer"),
        catalog_skus=CATALOG,
        expected_head_digest=state["headDigest"],
    )["state"]


def _reserved_state() -> dict[str, object]:
    state = _transferred_state()
    return reserve_shop_inventory(
        state,
        reservation_id="RES-BRANCH-001",
        client_id="CLI-RETAIL-001",
        stock_unit_id="LOT-SM1001-BATCH-A",
        location_id="LOC-BRANCH",
        quantity=1,
        proof=_proof(3, "reserve"),
        catalog_skus=CATALOG,
        expected_head_digest=state["headDigest"],
    )["state"]


class ShopInventoryFoundationTests(unittest.TestCase):
    def assert_invalid(self, state: object, catalog: list[str] | None = None) -> None:
        with self.assertRaises(ShopInventoryValidationError):
            validate_shop_inventory_state(state, catalog_skus=catalog or CATALOG)

    def test_opening_import_builds_real_masters_traceability_and_atp(self) -> None:
        package = _package()
        state = _opened_state()
        projection = project_shop_inventory(state, catalog_skus=CATALOG)

        self.assertEqual(projection["contract"], SHOP_INVENTORY_PROJECTION_CONTRACT)
        self.assertEqual(projection["revision"], 1)
        self.assertRegex(projection["headDigest"], r"^sha256:[0-9a-f]{64}$")
        self.assertEqual(projection["clients"][0]["name"], "ရွှေဆိုင် customer")
        self.assertEqual([row["id"] for row in projection["locations"]], ["LOC-BRANCH", "LOC-MAIN"])
        self.assertEqual([row["tracking"] for row in projection["stockUnits"]], ["lot", "serial"])
        self.assertEqual(
            projection["metrics"],
            {"totalOnHand": 6, "totalReserved": 0, "totalAvailableToPromise": 6},
        )
        self.assertEqual([row["kind"] for row in projection["ledger"]], ["opening", "opening"])
        self.assertEqual(projection["ledger"][0]["vendorId"], "VEN-YANGON-001")
        self.assertEqual(state["commands"][0]["payload"]["package"], package)

    def test_import_is_detached_deterministic_and_exactly_replayable(self) -> None:
        package = _package()
        package_before = deepcopy(package)
        empty = create_empty_shop_inventory_state()
        empty_before = deepcopy(empty)
        first = apply_shop_inventory_import(
            empty,
            package,
            _proof(1, "opening"),
            catalog_skus=CATALOG,
            expected_head_digest=EMPTY_SHOP_INVENTORY_DIGEST,
        )
        replay = apply_shop_inventory_import(
            first["state"],
            deepcopy(package),
            deepcopy(_proof(1, "opening")),
            catalog_skus=CATALOG,
            expected_head_digest=EMPTY_SHOP_INVENTORY_DIGEST,
        )

        self.assertFalse(first["replayed"])
        self.assertTrue(replay["replayed"])
        self.assertEqual(replay["state"], first["state"])
        self.assertEqual(package, package_before)
        self.assertEqual(empty, empty_before)

        conflicting = _package(source_label="different")
        with self.assertRaises(ShopInventoryValidationError):
            apply_shop_inventory_import(
                first["state"],
                conflicting,
                _proof(1, "opening"),
                catalog_skus=CATALOG,
                expected_head_digest=first["state"]["headDigest"],
            )

    def test_transfer_is_paired_attributable_and_preserves_total_stock(self) -> None:
        state = _opened_state()
        result = transfer_shop_inventory(
            state,
            transfer_id="TRF-MAIN-BRANCH-001",
            stock_unit_id="LOT-SM1001-BATCH-A",
            from_location_id="LOC-MAIN",
            to_location_id="LOC-BRANCH",
            quantity=2,
            proof=_proof(2, "transfer"),
            catalog_skus=CATALOG,
            expected_head_digest=state["headDigest"],
        )
        projection = project_shop_inventory(result["state"], catalog_skus=CATALOG)
        lot_balances = {
            row["locationId"]: row
            for row in projection["balances"]
            if row["stockUnitId"] == "LOT-SM1001-BATCH-A"
        }

        self.assertEqual(lot_balances["LOC-MAIN"]["onHand"], 3)
        self.assertEqual(lot_balances["LOC-BRANCH"]["onHand"], 2)
        self.assertEqual(projection["metrics"]["totalOnHand"], 6)
        pair = projection["ledger"][-2:]
        self.assertEqual([row["kind"] for row in pair], ["transfer-out", "transfer-in"])
        self.assertEqual({row["actionId"] for row in pair}, {"ACT-002-TRANSFER"})
        self.assertEqual(sum(row["onHandDelta"] for row in pair), 0)

        replay = transfer_shop_inventory(
            result["state"],
            transfer_id="TRF-MAIN-BRANCH-001",
            stock_unit_id="LOT-SM1001-BATCH-A",
            from_location_id="LOC-MAIN",
            to_location_id="LOC-BRANCH",
            quantity=2,
            proof=_proof(2, "transfer"),
            catalog_skus=CATALOG,
            expected_head_digest=EMPTY_SHOP_INVENTORY_DIGEST,
        )
        self.assertTrue(replay["replayed"])
        self.assertEqual(replay["state"], result["state"])

    def test_reserve_and_fulfil_use_available_to_promise(self) -> None:
        reserved = _reserved_state()
        preview = project_shop_inventory(reserved, catalog_skus=CATALOG)
        branch = next(
            row
            for row in preview["balances"]
            if row["stockUnitId"] == "LOT-SM1001-BATCH-A"
            and row["locationId"] == "LOC-BRANCH"
        )
        self.assertEqual((branch["onHand"], branch["reserved"], branch["availableToPromise"]), (2, 1, 1))
        self.assertEqual(preview["reservations"][0]["status"], "active")

        result = fulfil_shop_inventory_reservation(
            reserved,
            fulfilment_id="FUL-BRANCH-001",
            reservation_id="RES-BRANCH-001",
            proof=_proof(4, "fulfil"),
            catalog_skus=CATALOG,
            expected_head_digest=reserved["headDigest"],
        )
        completed = project_shop_inventory(result["state"], catalog_skus=CATALOG)
        branch = next(
            row
            for row in completed["balances"]
            if row["stockUnitId"] == "LOT-SM1001-BATCH-A"
            and row["locationId"] == "LOC-BRANCH"
        )
        self.assertEqual((branch["onHand"], branch["reserved"], branch["availableToPromise"]), (1, 0, 1))
        self.assertEqual(completed["reservations"][0]["status"], "fulfilled")
        self.assertEqual(completed["ledger"][-1]["kind"], "fulfil")

    def test_release_is_a_full_duplicate_safe_recovery(self) -> None:
        reserved = _reserved_state()
        released = release_shop_inventory_reservation(
            reserved,
            release_id="REL-BRANCH-001",
            reservation_id="RES-BRANCH-001",
            proof=_proof(4, "release"),
            catalog_skus=CATALOG,
            expected_head_digest=reserved["headDigest"],
        )
        projection = project_shop_inventory(released["state"], catalog_skus=CATALOG)
        branch = next(
            row
            for row in projection["balances"]
            if row["stockUnitId"] == "LOT-SM1001-BATCH-A"
            and row["locationId"] == "LOC-BRANCH"
        )
        self.assertEqual((branch["onHand"], branch["reserved"], branch["availableToPromise"]), (2, 0, 2))
        self.assertEqual(projection["reservations"][0]["status"], "released")

        replay = release_shop_inventory_reservation(
            released["state"],
            release_id="REL-BRANCH-001",
            reservation_id="RES-BRANCH-001",
            proof=_proof(4, "release"),
            catalog_skus=CATALOG,
            expected_head_digest=EMPTY_SHOP_INVENTORY_DIGEST,
        )
        self.assertTrue(replay["replayed"])
        with self.assertRaises(ShopInventoryValidationError):
            fulfil_shop_inventory_reservation(
                released["state"],
                fulfilment_id="FUL-BRANCH-001",
                reservation_id="RES-BRANCH-001",
                proof=_proof(5, "fulfil"),
                catalog_skus=CATALOG,
                expected_head_digest=released["state"]["headDigest"],
            )

    def test_stale_conflicting_and_overcommitted_commands_fail_closed(self) -> None:
        state = _transferred_state()
        attempts = (
            {
                "transfer_id": "TRF-STALE-001",
                "from_location_id": "LOC-MAIN",
                "to_location_id": "LOC-BRANCH",
                "quantity": 1,
                "expected_head_digest": EMPTY_SHOP_INVENTORY_DIGEST,
            },
            {
                "transfer_id": "TRF-SAME-001",
                "from_location_id": "LOC-MAIN",
                "to_location_id": "LOC-MAIN",
                "quantity": 1,
                "expected_head_digest": state["headDigest"],
            },
            {
                "transfer_id": "TRF-TOO-MUCH-001",
                "from_location_id": "LOC-BRANCH",
                "to_location_id": "LOC-MAIN",
                "quantity": 3,
                "expected_head_digest": state["headDigest"],
            },
        )
        for attempt in attempts:
            with self.subTest(transfer_id=attempt["transfer_id"]):
                with self.assertRaises(ShopInventoryValidationError):
                    transfer_shop_inventory(
                        state,
                        stock_unit_id="LOT-SM1001-BATCH-A",
                        proof=_proof(3, "attempt"),
                        catalog_skus=CATALOG,
                        **attempt,
                    )

        with self.assertRaises(ShopInventoryValidationError):
            reserve_shop_inventory(
                state,
                reservation_id="RES-UNKNOWN-CLIENT",
                client_id="CLI-MISSING",
                stock_unit_id="LOT-SM1001-BATCH-A",
                location_id="LOC-BRANCH",
                quantity=1,
                proof=_proof(3, "reserve"),
                catalog_skus=CATALOG,
                expected_head_digest=state["headDigest"],
            )

    def test_serial_and_import_contracts_are_bounded(self) -> None:
        invalid_packages = (
            {
                "stock_units": [{
                    "id": "SER-SM1002-UNIT-001",
                    "sku": "SM-1002",
                    "tracking": "serial",
                    "trackingCode": "UNIT-001",
                }],
                "openings": [{
                    "stockUnitId": "SER-SM1002-UNIT-001",
                    "locationId": "LOC-MAIN",
                    "vendorId": "VEN-YANGON-001",
                    "quantity": 2,
                }],
            },
            {
                "locations": [{"id": "LOC-MAIN", "name": "Main"}],
                "stock_units": [{
                    "id": "LOT-SM1001-BATCH-A",
                    "sku": "SM-1001",
                    "tracking": "lot",
                    "trackingCode": "BATCH-A",
                }],
                "openings": [{
                    "stockUnitId": "LOT-SM1001-BATCH-A",
                    "locationId": "LOC-MAIN",
                    "vendorId": "VEN-YANGON-001",
                    "quantity": 1,
                }],
            },
            {
                "stock_units": [{
                    "id": "LOT-MISSING-BATCH-A",
                    "sku": "MISSING",
                    "tracking": "lot",
                    "trackingCode": "BATCH-A",
                }],
                "openings": [{
                    "stockUnitId": "LOT-MISSING-BATCH-A",
                    "locationId": "LOC-MAIN",
                    "vendorId": "VEN-YANGON-001",
                    "quantity": 1,
                }],
            },
        )
        for patch in invalid_packages:
            with self.subTest(patch=patch):
                with self.assertRaises(ShopInventoryValidationError):
                    _package(**patch)

        with self.assertRaises(ShopInventoryValidationError):
            _package(
                stock_units=[
                    {
                        "id": "SER-SM1002-UNIT-001",
                        "sku": "SM-1002",
                        "tracking": "serial",
                        "trackingCode": "UNIT-001",
                    },
                    {
                        "id": "SER-SM1002-UNIT-002",
                        "sku": "SM-1002",
                        "tracking": "serial",
                        "trackingCode": "UNIT-001",
                    },
                ],
                openings=[
                    {
                        "stockUnitId": "SER-SM1002-UNIT-001",
                        "locationId": "LOC-MAIN",
                        "vendorId": "VEN-YANGON-001",
                        "quantity": 1,
                    },
                    {
                        "stockUnitId": "SER-SM1002-UNIT-002",
                        "locationId": "LOC-MAIN",
                        "vendorId": "VEN-YANGON-001",
                        "quantity": 1,
                    },
                ],
            )

    def test_catalog_binding_rejects_stale_import_but_allows_later_additions(self) -> None:
        package = _package()
        with self.assertRaises(ShopInventoryValidationError):
            apply_shop_inventory_import(
                create_empty_shop_inventory_state(),
                package,
                _proof(1, "opening"),
                catalog_skus=["SM-1001", "SM-1002", "SM-1003"],
                expected_head_digest=EMPTY_SHOP_INVENTORY_DIGEST,
            )

        state = _opened_state()
        validate_shop_inventory_state(
            state, catalog_skus=["SM-1001", "SM-1002", "SM-1003"]
        )
        self.assert_invalid(state, catalog=["SM-1001"])

    def test_digest_chain_detects_sequence_history_and_head_tampering(self) -> None:
        state = _transferred_state()
        mutations = []

        changed_payload = deepcopy(state)
        changed_payload["commands"][1]["payload"]["quantity"] = 1
        mutations.append(changed_payload)

        changed_sequence = deepcopy(state)
        changed_sequence["commands"][1]["sequence"] = 3
        mutations.append(changed_sequence)

        changed_previous = deepcopy(state)
        changed_previous["commands"][1]["previousDigest"] = EMPTY_SHOP_INVENTORY_DIGEST
        mutations.append(changed_previous)

        changed_head = deepcopy(state)
        changed_head["headDigest"] = EMPTY_SHOP_INVENTORY_DIGEST
        mutations.append(changed_head)

        for candidate in mutations:
            with self.subTest(candidate=candidate):
                self.assert_invalid(candidate)

    def test_unknown_fields_action_reuse_and_backdated_evidence_fail_closed(self) -> None:
        unknown = _opened_state()
        unknown["extra"] = True
        self.assert_invalid(unknown)

        malformed_kind = _opened_state()
        malformed_kind["commands"][0]["payload"]["kind"] = []
        self.assert_invalid(malformed_kind)

        state = _opened_state()
        for proof in (
            _proof(1, "opening"),
            {**_proof(2, "transfer"), "capturedAt": "2026-07-25T00:00:00+06:30"},
        ):
            with self.subTest(proof=proof):
                with self.assertRaises(ShopInventoryValidationError):
                    transfer_shop_inventory(
                        state,
                        transfer_id="TRF-ACTION-CHECK-001",
                        stock_unit_id="LOT-SM1001-BATCH-A",
                        from_location_id="LOC-MAIN",
                        to_location_id="LOC-BRANCH",
                        quantity=1,
                        proof=proof,
                        catalog_skus=CATALOG,
                        expected_head_digest=state["headDigest"],
                    )

    def test_package_rows_and_catalog_are_canonical_and_unambiguous(self) -> None:
        with self.assertRaises(ShopInventoryValidationError):
            _package(
                locations=[
                    {"id": "LOC-MAIN", "name": "Main"},
                    {"id": "LOC-BRANCH", "name": "Branch"},
                ]
            )
        with self.assertRaises(ShopInventoryValidationError):
            build_shop_inventory_import_package(
                import_id="IMP-OPENING-001",
                source_digest=_source_digest(),
                catalog_skus=["SM-1002", "SM-1001"],
                clients=[{"id": "CLI-RETAIL-001", "name": "Client"}],
                vendors=[{"id": "VEN-YANGON-001", "name": "Vendor"}],
                locations=[
                    {"id": "LOC-BRANCH", "name": "Branch"},
                    {"id": "LOC-MAIN", "name": "Main"},
                ],
                stock_units=[{
                    "id": "LOT-SM1001-BATCH-A",
                    "sku": "SM-1001",
                    "tracking": "lot",
                    "trackingCode": "BATCH-A",
                }],
                openings=[{
                    "stockUnitId": "LOT-SM1001-BATCH-A",
                    "locationId": "LOC-MAIN",
                    "vendorId": "VEN-YANGON-001",
                    "quantity": 1,
                }],
            )


if __name__ == "__main__":
    unittest.main()
