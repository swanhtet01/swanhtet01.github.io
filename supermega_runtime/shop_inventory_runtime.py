"""Fail-closed validation for Shop's location and lot inventory foundation."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from hashlib import sha256
import json
import re
import unicodedata
from typing import Any, Mapping, Sequence


SHOP_INVENTORY_SCHEMA = "supermega.shop.inventory_foundation.v1"
SHOP_INVENTORY_IMPORT_CONTRACT = "supermega.shop.inventory_import.v1"
EMPTY_SHOP_INVENTORY_DIGEST = f"sha256:{'0' * 64}"
_DIGEST_PATTERN = re.compile(r"sha256:[0-9a-f]{64}")
_BUSINESS_ID_PATTERN = re.compile(r"[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+")
_TIMESTAMP_PATTERN = re.compile(
    r"[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}"
    r"(?:\.[0-9]{1,6})?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])"
)
_MAX_SAFE_INTEGER = 9_007_199_254_740_991


class ShopInventoryValidationError(ValueError):
    """Raised when location inventory evidence is malformed or inconsistent."""


def _object(value: object, field: str) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        raise ShopInventoryValidationError(f"{field} must be an object.")
    return dict(value)


def _exact(value: object, field: str, fields: set[str]) -> dict[str, Any]:
    row = _object(value, field)
    if set(row) != fields:
        raise ShopInventoryValidationError(f"{field} fields do not match the contract.")
    return row


def _list(value: object, field: str, minimum: int, maximum: int) -> list[Any]:
    if not isinstance(value, list) or not minimum <= len(value) <= maximum:
        raise ShopInventoryValidationError(
            f"{field} must contain between {minimum} and {maximum} items."
        )
    return value


def _text(value: object, field: str, maximum: int = 180) -> str:
    if (
        not isinstance(value, str)
        or not value
        or value != value.strip()
        or unicodedata.normalize("NFC", value) != value
        or len(value) > maximum
        or any(ord(character) <= 31 or ord(character) == 127 for character in value)
    ):
        raise ShopInventoryValidationError(f"{field} must be canonical nonblank text.")
    return value


def _identifier(value: object, field: str, prefix: str) -> str:
    candidate = _text(value, field, 80)
    if not candidate.startswith(f"{prefix}-") or not _BUSINESS_ID_PATTERN.fullmatch(candidate):
        raise ShopInventoryValidationError(
            f"{field} must be a canonical {prefix} identifier."
        )
    return candidate


def _integer(value: object, field: str, minimum: int = 0) -> int:
    if (
        isinstance(value, bool)
        or not isinstance(value, int)
        or value < minimum
        or value > _MAX_SAFE_INTEGER
    ):
        raise ShopInventoryValidationError(f"{field} must be a supported integer quantity.")
    return value


def _digest(value: object, field: str) -> str:
    candidate = _text(value, field, 71)
    if not _DIGEST_PATTERN.fullmatch(candidate):
        raise ShopInventoryValidationError(f"{field} must be a SHA-256 digest.")
    return candidate


def _timestamp(value: object, field: str) -> tuple[str, datetime]:
    candidate = _text(value, field, 40)
    if not _TIMESTAMP_PATTERN.fullmatch(candidate):
        raise ShopInventoryValidationError(
            f"{field} must be a real ISO timestamp with an explicit offset."
        )
    try:
        parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ShopInventoryValidationError(
            f"{field} must be a real ISO timestamp with an explicit offset."
        ) from exc
    if parsed.tzinfo is None:
        raise ShopInventoryValidationError(
            f"{field} must be a real ISO timestamp with an explicit offset."
        )
    return candidate, parsed


def _canonical_digest(value: object) -> str:
    encoded = json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return f"sha256:{sha256(encoded).hexdigest()}"


def shop_inventory_catalog_digest(catalog_skus: Sequence[str]) -> str:
    trusted = sorted({_text(sku, "catalog sku", 80) for sku in catalog_skus})
    if not trusted:
        raise ShopInventoryValidationError("catalog skus cannot be empty.")
    if len(trusted) != len(catalog_skus):
        raise ShopInventoryValidationError("catalog skus contain duplicates.")
    return _canonical_digest({"catalogSkus": trusted})


def _proof(value: object, field: str) -> dict[str, str]:
    row = _exact(
        value,
        field,
        {"actionId", "capturedAt", "actor", "reason", "evidenceReference"},
    )
    captured_at, _ = _timestamp(row["capturedAt"], f"{field}.capturedAt")
    return {
        "actionId": _identifier(row["actionId"], f"{field}.actionId", "ACT"),
        "capturedAt": captured_at,
        "actor": _text(row["actor"], f"{field}.actor", 120),
        "reason": _text(row["reason"], f"{field}.reason", 300),
        "evidenceReference": _text(
            row["evidenceReference"], f"{field}.evidenceReference", 180
        ),
    }


def _master_rows(value: object, field: str, prefix: str, maximum: int) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for index, candidate in enumerate(_list(value, field, 1, maximum)):
        row = _exact(candidate, f"{field}[{index}]", {"id", "name"})
        rows.append(
            {
                "id": _identifier(row["id"], f"{field}[{index}].id", prefix),
                "name": _text(row["name"], f"{field}[{index}].name", 120),
            }
        )
    ids = [row["id"] for row in rows]
    if len(ids) != len(set(ids)) or ids != sorted(ids):
        raise ShopInventoryValidationError(f"{field} must use unique canonical order.")
    return rows


def _import_package(
    value: object,
    catalog_skus: list[str],
    *,
    require_current_catalog_digest: bool,
) -> dict[str, Any]:
    row = _exact(
        value,
        "import package",
        {
            "contract",
            "importId",
            "sourceDigest",
            "catalogSkuDigest",
            "clients",
            "vendors",
            "locations",
            "stockUnits",
            "openings",
            "packageDigest",
        },
    )
    if row["contract"] != SHOP_INVENTORY_IMPORT_CONTRACT:
        raise ShopInventoryValidationError("import package contract is unsupported.")
    import_id = _identifier(row["importId"], "import package.importId", "IMP")
    source_digest = _digest(row["sourceDigest"], "import package.sourceDigest")
    catalog_digest = _digest(
        row["catalogSkuDigest"], "import package.catalogSkuDigest"
    )
    if require_current_catalog_digest and catalog_digest != shop_inventory_catalog_digest(
        catalog_skus
    ):
        raise ShopInventoryValidationError("the import package catalog identity is stale.")
    clients = _master_rows(row["clients"], "import package.clients", "CLI", 200)
    vendors = _master_rows(row["vendors"], "import package.vendors", "VEN", 200)
    locations = _master_rows(row["locations"], "import package.locations", "LOC", 8)
    if len(locations) < 2:
        raise ShopInventoryValidationError("inventory foundation requires two locations.")
    trusted_catalog = set(catalog_skus)
    stock_units: list[dict[str, str]] = []
    for index, candidate in enumerate(
        _list(row["stockUnits"], "import package.stockUnits", 1, 1_000)
    ):
        field = f"import package.stockUnits[{index}]"
        unit = _exact(candidate, field, {"id", "sku", "tracking", "trackingCode"})
        tracking = _text(unit["tracking"], f"{field}.tracking", 10)
        if tracking not in {"lot", "serial"}:
            raise ShopInventoryValidationError(f"{field}.tracking is unsupported.")
        sku = _text(unit["sku"], f"{field}.sku", 80)
        if sku not in trusted_catalog:
            raise ShopInventoryValidationError(f"{field}.sku is not in the Shop catalog.")
        stock_units.append(
            {
                "id": _identifier(
                    unit["id"], f"{field}.id", "LOT" if tracking == "lot" else "SER"
                ),
                "sku": sku,
                "tracking": tracking,
                "trackingCode": _text(
                    unit["trackingCode"], f"{field}.trackingCode", 80
                ),
            }
        )
    unit_ids = [unit["id"] for unit in stock_units]
    trace_ids = [
        f"{unit['sku']}|{unit['tracking']}|{unit['trackingCode']}"
        for unit in stock_units
    ]
    if (
        len(unit_ids) != len(set(unit_ids))
        or unit_ids != sorted(unit_ids)
        or len(trace_ids) != len(set(trace_ids))
    ):
        raise ShopInventoryValidationError("stock units are duplicated or not canonical.")
    location_ids = {location["id"] for location in locations}
    vendor_ids = {vendor["id"] for vendor in vendors}
    unit_by_id = {unit["id"]: unit for unit in stock_units}
    serial_openings: set[str] = set()
    openings: list[dict[str, Any]] = []
    for index, candidate in enumerate(
        _list(row["openings"], "import package.openings", 1, 2_000)
    ):
        field = f"import package.openings[{index}]"
        opening = _exact(
            candidate, field, {"stockUnitId", "locationId", "vendorId", "quantity"}
        )
        stock_unit_id = _text(opening["stockUnitId"], f"{field}.stockUnitId", 80)
        location_id = _text(opening["locationId"], f"{field}.locationId", 80)
        vendor_id = _text(opening["vendorId"], f"{field}.vendorId", 80)
        unit = unit_by_id.get(stock_unit_id)
        if unit is None or location_id not in location_ids or vendor_id not in vendor_ids:
            raise ShopInventoryValidationError(f"{field} references an unknown master.")
        quantity = _integer(opening["quantity"], f"{field}.quantity", 1)
        if unit["tracking"] == "serial":
            if quantity != 1 or stock_unit_id in serial_openings:
                raise ShopInventoryValidationError(
                    f"{field} serial stock must open once with quantity one."
                )
            serial_openings.add(stock_unit_id)
        openings.append(
            {
                "stockUnitId": stock_unit_id,
                "locationId": location_id,
                "vendorId": vendor_id,
                "quantity": quantity,
            }
        )
    opening_keys = [
        f"{opening['stockUnitId']}|{opening['locationId']}" for opening in openings
    ]
    if (
        len(opening_keys) != len(set(opening_keys))
        or opening_keys != sorted(opening_keys)
        or {opening["stockUnitId"] for opening in openings} != set(unit_ids)
    ):
        raise ShopInventoryValidationError("opening evidence is incomplete or not canonical.")
    canonical = {
        "contract": SHOP_INVENTORY_IMPORT_CONTRACT,
        "importId": import_id,
        "sourceDigest": source_digest,
        "catalogSkuDigest": catalog_digest,
        "clients": clients,
        "vendors": vendors,
        "locations": locations,
        "stockUnits": stock_units,
        "openings": openings,
    }
    package_digest = _digest(row["packageDigest"], "import package.packageDigest")
    if package_digest != _canonical_digest(canonical):
        raise ShopInventoryValidationError("import package digest does not match its contents.")
    return {**canonical, "packageDigest": package_digest}


def _order_allocations(
    value: object, field: str, catalog_skus: list[str]
) -> list[dict[str, Any]]:
    allocations: list[dict[str, Any]] = []
    for index, candidate in enumerate(_list(value, field, 1, 200)):
        row_field = f"{field}[{index}]"
        row = _exact(
            candidate,
            row_field,
            {"reservationId", "sku", "stockUnitId", "locationId", "quantity"},
        )
        sku = _text(row["sku"], f"{row_field}.sku", 80)
        if sku not in catalog_skus:
            raise ShopInventoryValidationError(
                f"{row_field}.sku is not in the Shop catalog."
            )
        allocations.append(
            {
                "reservationId": _identifier(
                    row["reservationId"], f"{row_field}.reservationId", "RES"
                ),
                "sku": sku,
                "stockUnitId": _text(
                    row["stockUnitId"], f"{row_field}.stockUnitId", 80
                ),
                "locationId": _identifier(
                    row["locationId"], f"{row_field}.locationId", "LOC"
                ),
                "quantity": _integer(row["quantity"], f"{row_field}.quantity", 1),
            }
        )
    reservation_ids = [row["reservationId"] for row in allocations]
    keys = [
        f"{row['sku']}|{row['locationId']}|{row['stockUnitId']}|{row['reservationId']}"
        for row in allocations
    ]
    if len(reservation_ids) != len(set(reservation_ids)) or keys != sorted(keys):
        raise ShopInventoryValidationError(
            f"{field} must use unique canonical allocation order."
        )
    return allocations


def _order_inventory_command_id(prefix: str, order_id: str) -> str:
    identity = _canonical_digest(
        {
            "contract": "supermega.shop.order-inventory-command.v1",
            "kind": prefix,
            "orderId": order_id,
        }
    )
    return f"{prefix}-{identity[7:39].upper()}"


def _order_inventory_reservation_id(
    order_id: str, allocation: Mapping[str, Any]
) -> str:
    identity = _canonical_digest(
        {
            "contract": "supermega.shop.order-allocation.v1",
            "orderId": order_id,
            "sku": allocation["sku"],
            "stockUnitId": allocation["stockUnitId"],
            "locationId": allocation["locationId"],
            "quantity": allocation["quantity"],
        }
    )
    return f"RES-ORD-{identity[7:39].upper()}"


def _payload(value: object, field: str, catalog_skus: list[str]) -> dict[str, Any]:
    row = _object(value, field)
    kind = row.get("kind")
    if kind == "import":
        row = _exact(row, field, {"kind", "id", "package", "proof"})
        package = _import_package(
            row["package"], catalog_skus, require_current_catalog_digest=False
        )
        command_id = _identifier(row["id"], f"{field}.id", "IMP")
        if command_id != package["importId"]:
            raise ShopInventoryValidationError(f"{field}.id does not match its package.")
        return {
            "kind": "import",
            "id": command_id,
            "package": package,
            "proof": _proof(row["proof"], f"{field}.proof"),
        }
    if kind == "transfer":
        row = _exact(
            row,
            field,
            {
                "kind",
                "id",
                "stockUnitId",
                "fromLocationId",
                "toLocationId",
                "quantity",
                "proof",
            },
        )
        from_location = _identifier(
            row["fromLocationId"], f"{field}.fromLocationId", "LOC"
        )
        to_location = _identifier(
            row["toLocationId"], f"{field}.toLocationId", "LOC"
        )
        if from_location == to_location:
            raise ShopInventoryValidationError("a transfer needs two different locations.")
        return {
            "kind": "transfer",
            "id": _identifier(row["id"], f"{field}.id", "TRF"),
            "stockUnitId": _text(row["stockUnitId"], f"{field}.stockUnitId", 80),
            "fromLocationId": from_location,
            "toLocationId": to_location,
            "quantity": _integer(row["quantity"], f"{field}.quantity", 1),
            "proof": _proof(row["proof"], f"{field}.proof"),
        }
    if kind == "receipt":
        row = _exact(
            row,
            field,
            {
                "kind",
                "id",
                "purchaseOrderId",
                "stockUnitId",
                "sku",
                "trackingCode",
                "locationId",
                "quantity",
                "proof",
            },
        )
        sku = _text(row["sku"], f"{field}.sku", 80)
        if sku not in catalog_skus:
            raise ShopInventoryValidationError(
                f"{field}.sku is not in the Shop catalog."
            )
        return {
            "kind": "receipt",
            "id": _identifier(row["id"], f"{field}.id", "RCV"),
            "purchaseOrderId": _identifier(
                row["purchaseOrderId"], f"{field}.purchaseOrderId", "PO"
            ),
            "stockUnitId": _identifier(
                row["stockUnitId"], f"{field}.stockUnitId", "LOT"
            ),
            "sku": sku,
            "trackingCode": _text(
                row["trackingCode"], f"{field}.trackingCode", 80
            ),
            "locationId": _identifier(
                row["locationId"], f"{field}.locationId", "LOC"
            ),
            "quantity": _integer(row["quantity"], f"{field}.quantity", 1),
            "proof": _proof(row["proof"], f"{field}.proof"),
        }
    if kind == "order_reserve":
        row = _exact(
            row,
            field,
            {"kind", "id", "orderId", "customerReference", "allocations", "proof"},
        )
        order_id = _text(row["orderId"], f"{field}.orderId", 160)
        command_id = _identifier(row["id"], f"{field}.id", "ORS")
        if command_id != _order_inventory_command_id("ORS", order_id):
            raise ShopInventoryValidationError(
                f"{field}.id is not deterministic for its order."
            )
        allocations = _order_allocations(
            row["allocations"], f"{field}.allocations", catalog_skus
        )
        for index, allocation in enumerate(allocations):
            if allocation["reservationId"] != _order_inventory_reservation_id(
                order_id, allocation
            ):
                raise ShopInventoryValidationError(
                    f"{field}.allocations[{index}].reservationId is not deterministic."
                )
        return {
            "kind": "order_reserve",
            "id": command_id,
            "orderId": order_id,
            "customerReference": _text(
                row["customerReference"], f"{field}.customerReference", 180
            ),
            "allocations": allocations,
            "proof": _proof(row["proof"], f"{field}.proof"),
        }
    if kind in {"order_release", "order_fulfil"}:
        row = _exact(
            row,
            field,
            {"kind", "id", "orderId", "reservationIds", "proof"},
        )
        order_id = _text(row["orderId"], f"{field}.orderId", 160)
        prefix = "ORL" if kind == "order_release" else "ORF"
        command_id = _identifier(row["id"], f"{field}.id", prefix)
        if command_id != _order_inventory_command_id(prefix, order_id):
            raise ShopInventoryValidationError(
                f"{field}.id is not deterministic for its order."
            )
        reservation_ids = [
            _identifier(candidate, f"{field}.reservationIds[{index}]", "RES")
            for index, candidate in enumerate(
                _list(row["reservationIds"], f"{field}.reservationIds", 1, 200)
            )
        ]
        if len(reservation_ids) != len(set(reservation_ids)) or reservation_ids != sorted(
            reservation_ids
        ):
            raise ShopInventoryValidationError(
                f"{field}.reservationIds must use unique canonical order."
            )
        return {
            "kind": kind,
            "id": command_id,
            "orderId": order_id,
            "reservationIds": reservation_ids,
            "proof": _proof(row["proof"], f"{field}.proof"),
        }
    raise ShopInventoryValidationError(f"{field}.kind is unsupported for managed v1.")


def _project(commands: list[dict[str, Any]]) -> dict[str, Any]:
    locations: set[str] = set()
    units: dict[str, dict[str, str]] = {}
    balances: dict[tuple[str, str], dict[str, int]] = {}
    reservations: dict[str, dict[str, Any]] = {}
    import_count = 0

    def current_balance(stock_unit_id: str, location_id: str) -> dict[str, int]:
        return balances.setdefault(
            (stock_unit_id, location_id), {"onHand": 0, "reserved": 0}
        )

    def apply_delta(
        stock_unit_id: str,
        location_id: str,
        *,
        on_hand_delta: int,
        reserved_delta: int,
        field: str,
    ) -> None:
        balance = current_balance(stock_unit_id, location_id)
        on_hand = balance["onHand"] + on_hand_delta
        reserved = balance["reserved"] + reserved_delta
        if (
            not 0 <= on_hand <= _MAX_SAFE_INTEGER
            or not 0 <= reserved <= on_hand
            or (
                units.get(stock_unit_id, {}).get("tracking") == "serial"
                and on_hand > 1
            )
        ):
            raise ShopInventoryValidationError(
                f"{field} would make on-hand or reserved stock invalid."
            )
        balance["onHand"] = on_hand
        balance["reserved"] = reserved

    for index, command in enumerate(commands):
        field = f"commands[{index}].payload"
        if index == 0 and command["kind"] != "import":
            raise ShopInventoryValidationError("the first command must be an import.")
        if command["kind"] == "import":
            import_count += 1
            if import_count != 1:
                raise ShopInventoryValidationError("managed v1 accepts one opening import.")
            package = command["package"]
            locations.update(location["id"] for location in package["locations"])
            units.update({unit["id"]: unit for unit in package["stockUnits"]})
            for opening in package["openings"]:
                apply_delta(
                    opening["stockUnitId"],
                    opening["locationId"],
                    on_hand_delta=opening["quantity"],
                    reserved_delta=0,
                    field=field,
                )
            continue
        if command["kind"] == "receipt":
            if command["locationId"] not in locations:
                raise ShopInventoryValidationError(
                    "receipt references an unknown location."
                )
            if command["stockUnitId"] in units:
                raise ShopInventoryValidationError(
                    "receipt stock unit is already recorded."
                )
            trace_identity = f"{command['sku']}|lot|{command['trackingCode']}"
            if any(
                f"{unit['sku']}|{unit['tracking']}|{unit['trackingCode']}"
                == trace_identity
                for unit in units.values()
            ):
                raise ShopInventoryValidationError(
                    "receipt lot identity is already recorded."
                )
            units[command["stockUnitId"]] = {
                "id": command["stockUnitId"],
                "sku": command["sku"],
                "tracking": "lot",
                "trackingCode": command["trackingCode"],
            }
            apply_delta(
                command["stockUnitId"],
                command["locationId"],
                on_hand_delta=command["quantity"],
                reserved_delta=0,
                field=field,
            )
            continue
        if command["kind"] == "transfer":
            if command["stockUnitId"] not in units:
                raise ShopInventoryValidationError(
                    "transfer references an unknown stock unit."
                )
            if (
                command["fromLocationId"] not in locations
                or command["toLocationId"] not in locations
            ):
                raise ShopInventoryValidationError(
                    "transfer references an unknown location."
                )
            source = current_balance(
                command["stockUnitId"], command["fromLocationId"]
            )
            if source["onHand"] - source["reserved"] < command["quantity"]:
                raise ShopInventoryValidationError(
                    "transfer exceeds source available stock."
                )
            apply_delta(
                command["stockUnitId"],
                command["fromLocationId"],
                on_hand_delta=-command["quantity"],
                reserved_delta=0,
                field=field,
            )
            apply_delta(
                command["stockUnitId"],
                command["toLocationId"],
                on_hand_delta=command["quantity"],
                reserved_delta=0,
                field=field,
            )
            continue
        if command["kind"] == "order_reserve":
            if any(
                reservation["orderId"] == command["orderId"]
                for reservation in reservations.values()
            ):
                raise ShopInventoryValidationError(
                    "an order location reservation is already recorded."
                )
            for allocation in command["allocations"]:
                unit = units.get(allocation["stockUnitId"])
                if unit is None or unit["sku"] != allocation["sku"]:
                    raise ShopInventoryValidationError(
                        "order allocation stock unit does not match its SKU."
                    )
                if allocation["locationId"] not in locations:
                    raise ShopInventoryValidationError(
                        "order allocation references an unknown location."
                    )
                if allocation["reservationId"] in reservations:
                    raise ShopInventoryValidationError(
                        "order allocation reservation ID is already recorded."
                    )
                balance = current_balance(
                    allocation["stockUnitId"], allocation["locationId"]
                )
                if (
                    balance["onHand"] - balance["reserved"]
                    < allocation["quantity"]
                ):
                    raise ShopInventoryValidationError(
                        "order allocation exceeds available-to-promise stock."
                    )
                apply_delta(
                    allocation["stockUnitId"],
                    allocation["locationId"],
                    on_hand_delta=0,
                    reserved_delta=allocation["quantity"],
                    field=field,
                )
                reservations[allocation["reservationId"]] = {
                    **allocation,
                    "orderId": command["orderId"],
                    "customerReference": command["customerReference"],
                    "status": "active",
                }
            continue
        if command["kind"] in {"order_release", "order_fulfil"}:
            active_ids = sorted(
                reservation_id
                for reservation_id, reservation in reservations.items()
                if reservation["orderId"] == command["orderId"]
                and reservation["status"] == "active"
            )
            if active_ids != command["reservationIds"]:
                raise ShopInventoryValidationError(
                    "order closure must include every active location reservation."
                )
            for reservation_id in command["reservationIds"]:
                reservation = reservations[reservation_id]
                fulfil = command["kind"] == "order_fulfil"
                apply_delta(
                    reservation["stockUnitId"],
                    reservation["locationId"],
                    on_hand_delta=-reservation["quantity"] if fulfil else 0,
                    reserved_delta=-reservation["quantity"],
                    field=field,
                )
                reservation["status"] = "fulfilled" if fulfil else "released"
            continue
        raise ShopInventoryValidationError("inventory command kind cannot be projected.")
    if commands and import_count != 1:
        raise ShopInventoryValidationError("inventory history lacks its opening import.")
    sku_totals: dict[str, int] = {}
    sku_available: dict[str, int] = {}
    for (unit_id, _location_id), balance in balances.items():
        sku = units[unit_id]["sku"]
        sku_totals[sku] = sku_totals.get(sku, 0) + balance["onHand"]
        sku_available[sku] = (
            sku_available.get(sku, 0)
            + balance["onHand"]
            - balance["reserved"]
        )
    return {
        "skuTotals": {sku: value for sku, value in sku_totals.items() if value > 0},
        "skuAvailableToPromise": {
            sku: value for sku, value in sku_available.items() if value > 0
        },
        "balances": balances,
        "reservations": reservations,
        "units": units,
    }


def validate_shop_inventory_state(
    value: object,
    catalog_skus: Sequence[str],
    *,
    require_current_catalog_digest: bool = False,
) -> dict[str, Any]:
    trusted_catalog = sorted({_text(sku, "catalog sku", 80) for sku in catalog_skus})
    if not trusted_catalog:
        raise ShopInventoryValidationError("catalog skus cannot be empty.")
    state = _exact(value, "inventory state", {"schema", "revision", "headDigest", "commands"})
    if state["schema"] != SHOP_INVENTORY_SCHEMA:
        raise ShopInventoryValidationError("inventory state schema is unsupported.")
    revision = _integer(state["revision"], "inventory state.revision")
    head_digest = _digest(state["headDigest"], "inventory state.headDigest")
    raw_commands = _list(state["commands"], "inventory state.commands", 0, 2_000)
    if revision != len(raw_commands):
        raise ShopInventoryValidationError("inventory revision does not match command count.")
    commands: list[dict[str, Any]] = []
    command_ids: set[str] = set()
    action_ids: set[str] = set()
    previous_digest = EMPTY_SHOP_INVENTORY_DIGEST
    previous_timestamp: datetime | None = None
    for index, candidate in enumerate(raw_commands):
        field = f"inventory state.commands[{index}]"
        envelope = _exact(
            candidate, field, {"sequence", "previousDigest", "payload", "digest"}
        )
        sequence = _integer(envelope["sequence"], f"{field}.sequence", 1)
        retained_previous = _digest(
            envelope["previousDigest"], f"{field}.previousDigest"
        )
        if sequence != index + 1 or retained_previous != previous_digest:
            raise ShopInventoryValidationError("inventory command chain is not contiguous.")
        payload = _payload(envelope["payload"], f"{field}.payload", trusted_catalog)
        _, captured_at = _timestamp(
            payload["proof"]["capturedAt"], f"{field}.payload.proof.capturedAt"
        )
        if previous_timestamp is not None and captured_at < previous_timestamp:
            raise ShopInventoryValidationError("inventory proof time moves backwards.")
        body = {
            "sequence": sequence,
            "previousDigest": retained_previous,
            "payload": payload,
        }
        retained_digest = _digest(envelope["digest"], f"{field}.digest")
        if retained_digest != _canonical_digest(body):
            raise ShopInventoryValidationError("inventory command digest is invalid.")
        if payload["id"] in command_ids or payload["proof"]["actionId"] in action_ids:
            raise ShopInventoryValidationError("inventory command or action ID is duplicated.")
        commands.append({**body, "digest": retained_digest})
        command_ids.add(payload["id"])
        action_ids.add(payload["proof"]["actionId"])
        previous_digest = retained_digest
        previous_timestamp = captured_at
    expected_head = previous_digest if commands else EMPTY_SHOP_INVENTORY_DIGEST
    if head_digest != expected_head:
        raise ShopInventoryValidationError("inventory head digest is invalid.")
    if require_current_catalog_digest and commands:
        package_digest = commands[0]["payload"]["package"]["catalogSkuDigest"]
        if package_digest != shop_inventory_catalog_digest(trusted_catalog):
            raise ShopInventoryValidationError("inventory opening catalog identity is stale.")
    _project([command["payload"] for command in commands])
    return deepcopy(
        {
            "schema": SHOP_INVENTORY_SCHEMA,
            "revision": revision,
            "headDigest": head_digest,
            "commands": commands,
        }
    )


def shop_inventory_sku_totals(
    value: object, catalog_skus: Sequence[str]
) -> dict[str, int]:
    state = validate_shop_inventory_state(value, catalog_skus)
    return dict(_project([command["payload"] for command in state["commands"]])["skuTotals"])


def shop_inventory_sku_available_to_promise(
    value: object, catalog_skus: Sequence[str]
) -> dict[str, int]:
    state = validate_shop_inventory_state(value, catalog_skus)
    return dict(
        _project([command["payload"] for command in state["commands"]])[
            "skuAvailableToPromise"
        ]
    )


def shop_inventory_available_balances(
    value: object, catalog_skus: Sequence[str]
) -> list[dict[str, Any]]:
    state = validate_shop_inventory_state(value, catalog_skus)
    projection = _project([command["payload"] for command in state["commands"]])
    rows: list[dict[str, Any]] = []
    for (stock_unit_id, location_id), balance in projection["balances"].items():
        available = balance["onHand"] - balance["reserved"]
        if available <= 0:
            continue
        rows.append(
            {
                "stockUnitId": stock_unit_id,
                "sku": projection["units"][stock_unit_id]["sku"],
                "locationId": location_id,
                "availableToPromise": available,
            }
        )
    return sorted(
        rows,
        key=lambda row: (row["sku"], row["locationId"], row["stockUnitId"]),
    )


def restamp_latest_shop_inventory_command(
    value: object,
    *,
    action_id: str,
    actor: str,
    captured_at: str,
) -> dict[str, Any]:
    state = _object(deepcopy(value), "inventory state")
    commands = state.get("commands")
    if not isinstance(commands, list) or not commands:
        raise ShopInventoryValidationError("inventory command is missing.")
    latest = _object(commands[-1], "latest inventory command")
    payload = _object(latest.get("payload"), "latest inventory payload")
    proof = _object(payload.get("proof"), "latest inventory proof")
    if proof.get("actionId") != action_id:
        raise ShopInventoryValidationError("inventory proof does not match command evidence.")
    payload["proof"] = {**proof, "actor": actor, "capturedAt": captured_at}
    body = {
        "sequence": latest.get("sequence"),
        "previousDigest": latest.get("previousDigest"),
        "payload": payload,
    }
    latest = {**body, "digest": _canonical_digest(body)}
    commands[-1] = latest
    state["commands"] = commands
    state["headDigest"] = latest["digest"]
    return state


__all__ = [
    "EMPTY_SHOP_INVENTORY_DIGEST",
    "SHOP_INVENTORY_IMPORT_CONTRACT",
    "SHOP_INVENTORY_SCHEMA",
    "ShopInventoryValidationError",
    "restamp_latest_shop_inventory_command",
    "shop_inventory_available_balances",
    "shop_inventory_catalog_digest",
    "shop_inventory_sku_available_to_promise",
    "shop_inventory_sku_totals",
    "validate_shop_inventory_state",
]
