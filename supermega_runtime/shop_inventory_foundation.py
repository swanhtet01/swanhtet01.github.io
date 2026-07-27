"""Deterministic, no-I/O Shop inventory foundation for bounded client workcells."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from copy import deepcopy
from datetime import datetime
from hashlib import sha256
import json
import re
import unicodedata
from typing import Any


SHOP_INVENTORY_STATE_SCHEMA = "supermega.shop.inventory_foundation.v1"
SHOP_INVENTORY_IMPORT_CONTRACT = "supermega.shop.inventory_import.v1"
SHOP_INVENTORY_PROJECTION_CONTRACT = "supermega.shop.inventory_projection.v1"
EMPTY_SHOP_INVENTORY_DIGEST = f"sha256:{'0' * 64}"

_DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
_BUSINESS_ID = re.compile(r"^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$")
_ISO_TIMESTAMP = re.compile(
    r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}"
    r"(?:\.[0-9]{1,6})?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])$"
)
_TRACKING_KINDS = frozenset({"lot", "serial"})
_COMMAND_KINDS = frozenset({"import", "transfer", "reserve", "release", "fulfil"})
_MAX_COMMANDS = 2_000
_MAX_CLIENTS = 200
_MAX_VENDORS = 200
_MAX_LOCATIONS = 8
_MAX_STOCK_UNITS = 1_000
_MAX_OPENINGS = 2_000


class ShopInventoryValidationError(ValueError):
    """Raised when inventory evidence cannot be proved internally consistent."""


def _fail(message: str) -> ShopInventoryValidationError:
    return ShopInventoryValidationError(message)


def _object(value: object, field: str, keys: Sequence[str]) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise _fail(f"{field} must be an object.")
    if any(not isinstance(key, str) for key in value) or frozenset(value) != frozenset(keys):
        raise _fail(f"{field} fields do not match the contract.")
    return value


def _array(
    value: object,
    field: str,
    *,
    minimum: int = 0,
    maximum: int,
) -> list[Any]:
    if not isinstance(value, list) or not minimum <= len(value) <= maximum:
        raise _fail(f"{field} must contain between {minimum} and {maximum} items.")
    return value


def _text(value: object, field: str, *, maximum: int = 180) -> str:
    if not isinstance(value, str) or not value or value != value.strip():
        raise _fail(f"{field} must be nonblank trimmed text.")
    if unicodedata.normalize("NFC", value) != value:
        raise _fail(f"{field} must use normalized Unicode text.")
    if any(ord(character) <= 31 or ord(character) == 127 for character in value):
        raise _fail(f"{field} contains a control character.")
    if len(value.encode("utf-16-le")) // 2 > maximum:
        raise _fail(f"{field} exceeds its supported length.")
    return value


def _identifier(value: object, field: str, prefix: str) -> str:
    candidate = _text(value, field, maximum=80)
    if not candidate.startswith(f"{prefix}-") or _BUSINESS_ID.fullmatch(candidate) is None:
        raise _fail(f"{field} must be a canonical {prefix} identifier.")
    return candidate


def _quantity(value: object, field: str, *, minimum: int = 0) -> int:
    if (
        isinstance(value, bool)
        or not isinstance(value, int)
        or value < minimum
        or value > 9_007_199_254_740_991
    ):
        raise _fail(f"{field} must be a supported integer quantity.")
    return value


def _digest(value: object, field: str) -> str:
    candidate = _text(value, field, maximum=71)
    if _DIGEST.fullmatch(candidate) is None:
        raise _fail(f"{field} must be a SHA-256 digest.")
    return candidate


def _timestamp(value: object, field: str) -> str:
    candidate = _text(value, field, maximum=40)
    if _ISO_TIMESTAMP.fullmatch(candidate) is None:
        raise _fail(f"{field} must be an ISO timestamp with an explicit offset.")
    try:
        parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
    except ValueError as exc:
        raise _fail(f"{field} must be a real calendar timestamp.") from exc
    if parsed.utcoffset() is None:
        raise _fail(f"{field} must include a UTC offset.")
    return candidate


def _unique(values: Sequence[str], field: str) -> None:
    if len(values) != len(set(values)):
        raise _fail(f"{field} contains duplicates.")


def _canonical_digest(value: object) -> str:
    try:
        encoded = json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise _fail("Inventory evidence is not canonical JSON.") from exc
    return f"sha256:{sha256(encoded).hexdigest()}"


def _canonical_copy(value: object) -> Any:
    try:
        return json.loads(
            json.dumps(value, ensure_ascii=False, sort_keys=True, allow_nan=False)
        )
    except (TypeError, ValueError) as exc:
        raise _fail("Inventory evidence is not detached canonical JSON.") from exc


def _sorted(values: Sequence[str], field: str) -> None:
    if list(values) != sorted(values):
        raise _fail(f"{field} must use canonical identifier order.")


def _proof(value: object, field: str) -> dict[str, str]:
    source = _object(
        value,
        field,
        ("actionId", "capturedAt", "actor", "reason", "evidenceReference"),
    )
    return {
        "actionId": _identifier(source["actionId"], f"{field}.actionId", "ACT"),
        "capturedAt": _timestamp(source["capturedAt"], f"{field}.capturedAt"),
        "actor": _text(source["actor"], f"{field}.actor", maximum=120),
        "reason": _text(source["reason"], f"{field}.reason", maximum=300),
        "evidenceReference": _text(
            source["evidenceReference"],
            f"{field}.evidenceReference",
            maximum=180,
        ),
    }


def shop_inventory_catalog_digest(catalog_skus: object) -> str:
    """Bind an import preview to one canonical ordered catalog identity set."""

    values = _array(catalog_skus, "catalog_skus", minimum=1, maximum=1_000)
    skus = [_text(value, f"catalog_skus[{index}]", maximum=80) for index, value in enumerate(values)]
    _unique(skus, "catalog_skus")
    _sorted(skus, "catalog_skus")
    return _canonical_digest({"catalogSkus": skus})


def create_empty_shop_inventory_state() -> dict[str, Any]:
    return {
        "schema": SHOP_INVENTORY_STATE_SCHEMA,
        "revision": 0,
        "headDigest": EMPTY_SHOP_INVENTORY_DIGEST,
        "commands": [],
    }


def _validate_master_rows(
    value: object,
    field: str,
    *,
    prefix: str,
    maximum: int,
) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for index, candidate in enumerate(
        _array(value, field, minimum=1, maximum=maximum)
    ):
        row_field = f"{field}[{index}]"
        row = _object(candidate, row_field, ("id", "name"))
        rows.append(
            {
                "id": _identifier(row["id"], f"{row_field}.id", prefix),
                "name": _text(row["name"], f"{row_field}.name", maximum=120),
            }
        )
    identifiers = [row["id"] for row in rows]
    _unique(identifiers, field)
    _sorted(identifiers, field)
    return rows


def _validate_import_package(
    package: object,
    *,
    catalog_skus: list[str],
    require_current_catalog_digest: bool,
) -> dict[str, Any]:
    source = _object(
        package,
        "import package",
        (
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
        ),
    )
    if source["contract"] != SHOP_INVENTORY_IMPORT_CONTRACT:
        raise _fail("import package.contract is unsupported.")
    import_id = _identifier(source["importId"], "import package.importId", "IMP")
    source_digest = _digest(source["sourceDigest"], "import package.sourceDigest")
    catalog_digest = _digest(
        source["catalogSkuDigest"], "import package.catalogSkuDigest"
    )
    if require_current_catalog_digest and catalog_digest != shop_inventory_catalog_digest(catalog_skus):
        raise _fail("The import package catalog identity is stale.")

    clients = _validate_master_rows(
        source["clients"], "import package.clients", prefix="CLI", maximum=_MAX_CLIENTS
    )
    vendors = _validate_master_rows(
        source["vendors"], "import package.vendors", prefix="VEN", maximum=_MAX_VENDORS
    )
    locations = _validate_master_rows(
        source["locations"],
        "import package.locations",
        prefix="LOC",
        maximum=_MAX_LOCATIONS,
    )
    if len(locations) < 2:
        raise _fail("The v1 inventory foundation requires at least two locations.")

    stock_units: list[dict[str, str]] = []
    for index, candidate in enumerate(
        _array(
            source["stockUnits"],
            "import package.stockUnits",
            minimum=1,
            maximum=_MAX_STOCK_UNITS,
        )
    ):
        field = f"import package.stockUnits[{index}]"
        item = _object(candidate, field, ("id", "sku", "tracking", "trackingCode"))
        tracking = _text(item["tracking"], f"{field}.tracking", maximum=10)
        if tracking not in _TRACKING_KINDS:
            raise _fail(f"{field}.tracking is unsupported.")
        unit_id = _identifier(
            item["id"], f"{field}.id", "LOT" if tracking == "lot" else "SER"
        )
        sku = _text(item["sku"], f"{field}.sku", maximum=80)
        if sku not in catalog_skus:
            raise _fail(f"{field}.sku is not present in the trusted Shop catalog.")
        stock_units.append(
            {
                "id": unit_id,
                "sku": sku,
                "tracking": tracking,
                "trackingCode": _text(
                    item["trackingCode"], f"{field}.trackingCode", maximum=80
                ),
            }
        )
    stock_unit_ids = [item["id"] for item in stock_units]
    _unique(stock_unit_ids, "import package.stockUnits")
    _sorted(stock_unit_ids, "import package.stockUnits")
    _unique(
        [
            f"{item['sku']}|{item['tracking']}|{item['trackingCode']}"
            for item in stock_units
        ],
        "import package stock trace identities",
    )

    vendor_ids = frozenset(item["id"] for item in vendors)
    location_ids = frozenset(item["id"] for item in locations)
    stock_units_by_id = {item["id"]: item for item in stock_units}
    openings: list[dict[str, object]] = []
    opening_keys: list[str] = []
    serial_openings: set[str] = set()
    for index, candidate in enumerate(
        _array(
            source["openings"],
            "import package.openings",
            minimum=1,
            maximum=_MAX_OPENINGS,
        )
    ):
        field = f"import package.openings[{index}]"
        item = _object(
            candidate, field, ("stockUnitId", "locationId", "vendorId", "quantity")
        )
        stock_unit_id = _text(item["stockUnitId"], f"{field}.stockUnitId", maximum=80)
        location_id = _text(item["locationId"], f"{field}.locationId", maximum=80)
        vendor_id = _text(item["vendorId"], f"{field}.vendorId", maximum=80)
        if stock_unit_id not in stock_units_by_id:
            raise _fail(f"{field}.stockUnitId is unknown.")
        if location_id not in location_ids:
            raise _fail(f"{field}.locationId is unknown.")
        if vendor_id not in vendor_ids:
            raise _fail(f"{field}.vendorId is unknown.")
        quantity = _quantity(item["quantity"], f"{field}.quantity", minimum=1)
        if stock_units_by_id[stock_unit_id]["tracking"] == "serial":
            if quantity != 1 or stock_unit_id in serial_openings:
                raise _fail(f"{field} serial stock must open exactly once with quantity one.")
            serial_openings.add(stock_unit_id)
        openings.append(
            {
                "stockUnitId": stock_unit_id,
                "locationId": location_id,
                "vendorId": vendor_id,
                "quantity": quantity,
            }
        )
        opening_keys.append(f"{stock_unit_id}|{location_id}")
    _unique(opening_keys, "import package.openings")
    _sorted(opening_keys, "import package.openings")
    if frozenset(item["stockUnitId"] for item in openings) != frozenset(stock_unit_ids):
        raise _fail("Every stock unit must have opening evidence.")

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
    package_digest = _digest(source["packageDigest"], "import package.packageDigest")
    if package_digest != _canonical_digest(canonical):
        raise _fail("import package.packageDigest does not match its reviewed contents.")
    return {**canonical, "packageDigest": package_digest}


def build_shop_inventory_import_package(
    *,
    import_id: object,
    source_digest: object,
    catalog_skus: object,
    clients: object,
    vendors: object,
    locations: object,
    stock_units: object,
    openings: object,
) -> dict[str, Any]:
    """Build one canonical import package without applying it."""

    raw_skus = _array(catalog_skus, "catalog_skus", minimum=1, maximum=1_000)
    normalized_skus = [
        _text(value, f"catalog_skus[{index}]", maximum=80)
        for index, value in enumerate(raw_skus)
    ]
    _unique(normalized_skus, "catalog_skus")
    _sorted(normalized_skus, "catalog_skus")
    candidate = {
        "contract": SHOP_INVENTORY_IMPORT_CONTRACT,
        "importId": import_id,
        "sourceDigest": source_digest,
        "catalogSkuDigest": shop_inventory_catalog_digest(normalized_skus),
        "clients": clients,
        "vendors": vendors,
        "locations": locations,
        "stockUnits": stock_units,
        "openings": openings,
        "packageDigest": EMPTY_SHOP_INVENTORY_DIGEST,
    }
    digest_source = {key: value for key, value in candidate.items() if key != "packageDigest"}
    candidate["packageDigest"] = _canonical_digest(digest_source)
    return _validate_import_package(
        candidate,
        catalog_skus=normalized_skus,
        require_current_catalog_digest=True,
    )


def _catalog_skus(value: object) -> list[str]:
    rows = _array(value, "catalog_skus", minimum=1, maximum=1_000)
    skus = [
        _text(item, f"catalog_skus[{index}]", maximum=80)
        for index, item in enumerate(rows)
    ]
    _unique(skus, "catalog_skus")
    _sorted(skus, "catalog_skus")
    return skus


def _command_payload(
    value: object,
    field: str,
    *,
    catalog_skus: list[str],
) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        raise _fail(f"{field} must be an object.")
    kind = value.get("kind")
    if not isinstance(kind, str) or kind not in _COMMAND_KINDS:
        raise _fail(f"{field}.kind is unsupported.")

    if kind == "import":
        source = _object(value, field, ("kind", "id", "package", "proof"))
        package = _validate_import_package(
            source["package"],
            catalog_skus=catalog_skus,
            require_current_catalog_digest=False,
        )
        command_id = _identifier(source["id"], f"{field}.id", "IMP")
        if command_id != package["importId"]:
            raise _fail(f"{field}.id must equal its import package identity.")
        return {
            "kind": "import",
            "id": command_id,
            "package": package,
            "proof": _proof(source["proof"], f"{field}.proof"),
        }

    if kind == "transfer":
        source = _object(
            value,
            field,
            (
                "kind",
                "id",
                "stockUnitId",
                "fromLocationId",
                "toLocationId",
                "quantity",
                "proof",
            ),
        )
        from_location = _identifier(
            source["fromLocationId"], f"{field}.fromLocationId", "LOC"
        )
        to_location = _identifier(
            source["toLocationId"], f"{field}.toLocationId", "LOC"
        )
        if from_location == to_location:
            raise _fail(f"{field} must move stock between different locations.")
        return {
            "kind": "transfer",
            "id": _identifier(source["id"], f"{field}.id", "TRF"),
            "stockUnitId": _text(
                source["stockUnitId"], f"{field}.stockUnitId", maximum=80
            ),
            "fromLocationId": from_location,
            "toLocationId": to_location,
            "quantity": _quantity(source["quantity"], f"{field}.quantity", minimum=1),
            "proof": _proof(source["proof"], f"{field}.proof"),
        }

    if kind == "reserve":
        source = _object(
            value,
            field,
            (
                "kind",
                "id",
                "clientId",
                "stockUnitId",
                "locationId",
                "quantity",
                "proof",
            ),
        )
        return {
            "kind": "reserve",
            "id": _identifier(source["id"], f"{field}.id", "RES"),
            "clientId": _identifier(source["clientId"], f"{field}.clientId", "CLI"),
            "stockUnitId": _text(
                source["stockUnitId"], f"{field}.stockUnitId", maximum=80
            ),
            "locationId": _identifier(
                source["locationId"], f"{field}.locationId", "LOC"
            ),
            "quantity": _quantity(source["quantity"], f"{field}.quantity", minimum=1),
            "proof": _proof(source["proof"], f"{field}.proof"),
        }

    prefix = "REL" if kind == "release" else "FUL"
    source = _object(value, field, ("kind", "id", "reservationId", "proof"))
    return {
        "kind": str(kind),
        "id": _identifier(source["id"], f"{field}.id", prefix),
        "reservationId": _identifier(
            source["reservationId"], f"{field}.reservationId", "RES"
        ),
        "proof": _proof(source["proof"], f"{field}.proof"),
    }


def _event(
    *,
    event_id: str,
    kind: str,
    command: Mapping[str, Any],
    stock_unit_id: str,
    location_id: str,
    on_hand_delta: int,
    reserved_delta: int,
    reference_id: str,
    counterparty_location_id: str | None = None,
    vendor_id: str | None = None,
    client_id: str | None = None,
) -> dict[str, Any]:
    proof = command["proof"]
    record: dict[str, Any] = {
        "id": event_id,
        "kind": kind,
        "commandId": command["id"],
        "actionId": proof["actionId"],
        "capturedAt": proof["capturedAt"],
        "actor": proof["actor"],
        "reason": proof["reason"],
        "evidenceReference": proof["evidenceReference"],
        "stockUnitId": stock_unit_id,
        "locationId": location_id,
        "onHandDelta": on_hand_delta,
        "reservedDelta": reserved_delta,
        "referenceId": reference_id,
    }
    if counterparty_location_id is not None:
        record["counterpartyLocationId"] = counterparty_location_id
    if vendor_id is not None:
        record["vendorId"] = vendor_id
    if client_id is not None:
        record["clientId"] = client_id
    return record


def _replay_commands(commands: list[dict[str, Any]]) -> dict[str, Any]:
    clients: dict[str, dict[str, str]] = {}
    vendors: dict[str, dict[str, str]] = {}
    locations: dict[str, dict[str, str]] = {}
    stock_units: dict[str, dict[str, str]] = {}
    balances: dict[tuple[str, str], dict[str, int]] = {}
    reservations: dict[str, dict[str, Any]] = {}
    ledger: list[dict[str, Any]] = []
    import_count = 0

    def balance(stock_unit_id: str, location_id: str) -> dict[str, int]:
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
        current = balance(stock_unit_id, location_id)
        next_on_hand = current["onHand"] + on_hand_delta
        next_reserved = current["reserved"] + reserved_delta
        if (
            not 0 <= next_on_hand <= 9_007_199_254_740_991
            or not 0 <= next_reserved <= next_on_hand
        ):
            raise _fail(f"{field} would make on-hand or reserved stock invalid.")
        if stock_units[stock_unit_id]["tracking"] == "serial" and next_on_hand > 1:
            raise _fail(f"{field} would duplicate serial stock.")
        current["onHand"] = next_on_hand
        current["reserved"] = next_reserved

    for index, command in enumerate(commands):
        field = f"commands[{index}].payload"
        kind = command["kind"]
        if index == 0 and kind != "import":
            raise _fail("The first inventory command must be the reviewed opening import.")

        if kind == "import":
            import_count += 1
            if import_count != 1:
                raise _fail("Inventory foundation v1 accepts exactly one opening import.")
            package = command["package"]
            clients.update({item["id"]: item for item in package["clients"]})
            vendors.update({item["id"]: item for item in package["vendors"]})
            locations.update({item["id"]: item for item in package["locations"]})
            stock_units.update({item["id"]: item for item in package["stockUnits"]})
            for opening_index, opening in enumerate(package["openings"]):
                stock_unit_id = str(opening["stockUnitId"])
                location_id = str(opening["locationId"])
                quantity = int(opening["quantity"])
                apply_delta(
                    stock_unit_id,
                    location_id,
                    on_hand_delta=quantity,
                    reserved_delta=0,
                    field=f"{field}.package.openings[{opening_index}]",
                )
                ledger.append(
                    _event(
                        event_id=f"LED-{command['id']}-OPEN-{opening_index + 1}",
                        kind="opening",
                        command=command,
                        stock_unit_id=stock_unit_id,
                        location_id=location_id,
                        on_hand_delta=quantity,
                        reserved_delta=0,
                        reference_id=package["importId"],
                        vendor_id=str(opening["vendorId"]),
                    )
                )
            continue

        stock_unit_id = str(command.get("stockUnitId", ""))
        if kind in {"transfer", "reserve"} and stock_unit_id not in stock_units:
            raise _fail(f"{field}.stockUnitId is unknown.")

        if kind == "transfer":
            from_location = str(command["fromLocationId"])
            to_location = str(command["toLocationId"])
            if from_location not in locations or to_location not in locations:
                raise _fail(f"{field} references an unknown location.")
            quantity = int(command["quantity"])
            source = balance(stock_unit_id, from_location)
            if source["onHand"] - source["reserved"] < quantity:
                raise _fail(f"{field} exceeds source available-to-promise stock.")
            apply_delta(
                stock_unit_id,
                from_location,
                on_hand_delta=-quantity,
                reserved_delta=0,
                field=field,
            )
            apply_delta(
                stock_unit_id,
                to_location,
                on_hand_delta=quantity,
                reserved_delta=0,
                field=field,
            )
            ledger.extend(
                (
                    _event(
                        event_id=f"LED-{command['id']}-OUT",
                        kind="transfer-out",
                        command=command,
                        stock_unit_id=stock_unit_id,
                        location_id=from_location,
                        counterparty_location_id=to_location,
                        on_hand_delta=-quantity,
                        reserved_delta=0,
                        reference_id=str(command["id"]),
                    ),
                    _event(
                        event_id=f"LED-{command['id']}-IN",
                        kind="transfer-in",
                        command=command,
                        stock_unit_id=stock_unit_id,
                        location_id=to_location,
                        counterparty_location_id=from_location,
                        on_hand_delta=quantity,
                        reserved_delta=0,
                        reference_id=str(command["id"]),
                    ),
                )
            )
            continue

        if kind == "reserve":
            client_id = str(command["clientId"])
            location_id = str(command["locationId"])
            if client_id not in clients:
                raise _fail(f"{field}.clientId is unknown.")
            if location_id not in locations:
                raise _fail(f"{field}.locationId is unknown.")
            quantity = int(command["quantity"])
            current = balance(stock_unit_id, location_id)
            if current["onHand"] - current["reserved"] < quantity:
                raise _fail(f"{field} exceeds available-to-promise stock.")
            apply_delta(
                stock_unit_id,
                location_id,
                on_hand_delta=0,
                reserved_delta=quantity,
                field=field,
            )
            reservations[str(command["id"])] = {
                "id": command["id"],
                "clientId": client_id,
                "stockUnitId": stock_unit_id,
                "locationId": location_id,
                "quantity": quantity,
                "status": "active",
                "reserveProof": deepcopy(command["proof"]),
                "closureCommandId": None,
                "closureProof": None,
            }
            ledger.append(
                _event(
                    event_id=f"LED-{command['id']}-RESERVE",
                    kind="reserve",
                    command=command,
                    stock_unit_id=stock_unit_id,
                    location_id=location_id,
                    on_hand_delta=0,
                    reserved_delta=quantity,
                    reference_id=str(command["id"]),
                    client_id=client_id,
                )
            )
            continue

        reservation_id = str(command["reservationId"])
        reservation = reservations.get(reservation_id)
        if reservation is None:
            raise _fail(f"{field}.reservationId is unknown.")
        if reservation["status"] != "active":
            raise _fail(f"{field}.reservationId is already closed.")
        quantity = int(reservation["quantity"])
        on_hand_delta = -quantity if kind == "fulfil" else 0
        apply_delta(
            str(reservation["stockUnitId"]),
            str(reservation["locationId"]),
            on_hand_delta=on_hand_delta,
            reserved_delta=-quantity,
            field=field,
        )
        reservation["status"] = "fulfilled" if kind == "fulfil" else "released"
        reservation["closureCommandId"] = command["id"]
        reservation["closureProof"] = deepcopy(command["proof"])
        ledger.append(
            _event(
                event_id=f"LED-{command['id']}-{kind.upper()}",
                kind=str(kind),
                command=command,
                stock_unit_id=str(reservation["stockUnitId"]),
                location_id=str(reservation["locationId"]),
                on_hand_delta=on_hand_delta,
                reserved_delta=-quantity,
                reference_id=reservation_id,
                client_id=str(reservation["clientId"]),
            )
        )

    if import_count != 1 and commands:
        raise _fail("Inventory command history lacks its opening import.")

    balance_rows: list[dict[str, Any]] = []
    for (stock_unit_id, location_id), values in sorted(balances.items()):
        if values["onHand"] == 0 and values["reserved"] == 0:
            continue
        stock_unit = stock_units[stock_unit_id]
        balance_rows.append(
            {
                "stockUnitId": stock_unit_id,
                "sku": stock_unit["sku"],
                "tracking": stock_unit["tracking"],
                "trackingCode": stock_unit["trackingCode"],
                "locationId": location_id,
                "onHand": values["onHand"],
                "reserved": values["reserved"],
                "availableToPromise": values["onHand"] - values["reserved"],
            }
        )

    total_on_hand = sum(row["onHand"] for row in balance_rows)
    total_reserved = sum(row["reserved"] for row in balance_rows)
    return {
        "clients": [clients[key] for key in sorted(clients)],
        "vendors": [vendors[key] for key in sorted(vendors)],
        "locations": [locations[key] for key in sorted(locations)],
        "stockUnits": [stock_units[key] for key in sorted(stock_units)],
        "balances": balance_rows,
        "reservations": [reservations[key] for key in sorted(reservations)],
        "ledger": ledger,
        "metrics": {
            "totalOnHand": total_on_hand,
            "totalReserved": total_reserved,
            "totalAvailableToPromise": total_on_hand - total_reserved,
        },
    }


def validate_shop_inventory_state(
    value: object,
    *,
    catalog_skus: object,
) -> dict[str, Any]:
    """Validate a complete digest-chained inventory snapshot without repairing it."""

    trusted_skus = _catalog_skus(catalog_skus)
    source = _object(
        value,
        "inventory state",
        ("schema", "revision", "headDigest", "commands"),
    )
    if source["schema"] != SHOP_INVENTORY_STATE_SCHEMA:
        raise _fail("inventory state.schema is unsupported.")
    revision = _quantity(source["revision"], "inventory state.revision")
    head_digest = _digest(source["headDigest"], "inventory state.headDigest")
    raw_commands = _array(
        source["commands"], "inventory state.commands", maximum=_MAX_COMMANDS
    )
    if revision != len(raw_commands):
        raise _fail("inventory state.revision must equal its retained command count.")

    commands: list[dict[str, Any]] = []
    command_ids: list[str] = []
    action_ids: list[str] = []
    prior_digest = EMPTY_SHOP_INVENTORY_DIGEST
    prior_timestamp: datetime | None = None
    for index, candidate in enumerate(raw_commands):
        field = f"inventory state.commands[{index}]"
        envelope = _object(
            candidate,
            field,
            ("sequence", "previousDigest", "payload", "digest"),
        )
        sequence = _quantity(envelope["sequence"], f"{field}.sequence", minimum=1)
        if sequence != index + 1:
            raise _fail(f"{field}.sequence is not contiguous.")
        previous_digest = _digest(
            envelope["previousDigest"], f"{field}.previousDigest"
        )
        if previous_digest != prior_digest:
            raise _fail(f"{field}.previousDigest breaks the command chain.")
        payload = _command_payload(
            envelope["payload"], f"{field}.payload", catalog_skus=trusted_skus
        )
        payload_timestamp = datetime.fromisoformat(
            str(payload["proof"]["capturedAt"]).replace("Z", "+00:00")
        )
        if prior_timestamp is not None and payload_timestamp < prior_timestamp:
            raise _fail(f"{field}.payload.proof.capturedAt moves backwards.")
        envelope_body = {
            "sequence": sequence,
            "previousDigest": previous_digest,
            "payload": payload,
        }
        digest = _digest(envelope["digest"], f"{field}.digest")
        if digest != _canonical_digest(envelope_body):
            raise _fail(f"{field}.digest does not match its command evidence.")
        commands.append({**envelope_body, "digest": digest})
        command_ids.append(str(payload["id"]))
        action_ids.append(str(payload["proof"]["actionId"]))
        prior_digest = digest
        prior_timestamp = payload_timestamp

    _unique(command_ids, "inventory command IDs")
    _unique(action_ids, "inventory action IDs")
    expected_head = prior_digest if commands else EMPTY_SHOP_INVENTORY_DIGEST
    if head_digest != expected_head:
        raise _fail("inventory state.headDigest does not match its command chain.")

    payloads = [command["payload"] for command in commands]
    _replay_commands(payloads)
    return _canonical_copy(
        {
            "schema": SHOP_INVENTORY_STATE_SCHEMA,
            "revision": revision,
            "headDigest": head_digest,
            "commands": commands,
        }
    )


def project_shop_inventory(
    state: object,
    *,
    catalog_skus: object,
) -> dict[str, Any]:
    """Derive masters, immutable ledger, balances, reservations, and ATP totals."""

    validated = validate_shop_inventory_state(state, catalog_skus=catalog_skus)
    projection = _replay_commands(
        [command["payload"] for command in validated["commands"]]
    )
    return _canonical_copy(
        {
            "contract": SHOP_INVENTORY_PROJECTION_CONTRACT,
            "revision": validated["revision"],
            "headDigest": validated["headDigest"],
            **projection,
        }
    )


def _append_command(
    state: object,
    payload: object,
    *,
    catalog_skus: object,
    expected_head_digest: object,
) -> dict[str, Any]:
    trusted_skus = _catalog_skus(catalog_skus)
    current = validate_shop_inventory_state(state, catalog_skus=trusted_skus)
    canonical_payload = _command_payload(
        payload, "command payload", catalog_skus=trusted_skus
    )

    for command in current["commands"]:
        existing = command["payload"]
        if existing["id"] != canonical_payload["id"]:
            continue
        if existing != canonical_payload:
            raise _fail("The inventory command ID was already used with different evidence.")
        return {"state": current, "replayed": True}

    expected_digest = _digest(expected_head_digest, "expected_head_digest")
    if expected_digest != current["headDigest"]:
        raise _fail("The inventory snapshot changed before this command was applied.")

    sequence = int(current["revision"]) + 1
    envelope_body = {
        "sequence": sequence,
        "previousDigest": current["headDigest"],
        "payload": canonical_payload,
    }
    envelope = {**envelope_body, "digest": _canonical_digest(envelope_body)}
    candidate = {
        "schema": SHOP_INVENTORY_STATE_SCHEMA,
        "revision": sequence,
        "headDigest": envelope["digest"],
        "commands": [*current["commands"], envelope],
    }
    validated = validate_shop_inventory_state(candidate, catalog_skus=trusted_skus)
    return {"state": validated, "replayed": False}


def apply_shop_inventory_import(
    state: object,
    package: object,
    proof: object,
    *,
    catalog_skus: object,
    expected_head_digest: object,
) -> dict[str, Any]:
    """Apply one reviewed opening import to an empty foundation or replay it exactly."""

    trusted_skus = _catalog_skus(catalog_skus)
    validated_package = _validate_import_package(
        package,
        catalog_skus=trusted_skus,
        require_current_catalog_digest=True,
    )
    payload = {
        "kind": "import",
        "id": validated_package["importId"],
        "package": validated_package,
        "proof": _proof(proof, "proof"),
    }
    return _append_command(
        state,
        payload,
        catalog_skus=trusted_skus,
        expected_head_digest=expected_head_digest,
    )


def transfer_shop_inventory(
    state: object,
    *,
    transfer_id: object,
    stock_unit_id: object,
    from_location_id: object,
    to_location_id: object,
    quantity: object,
    proof: object,
    catalog_skus: object,
    expected_head_digest: object,
) -> dict[str, Any]:
    payload = {
        "kind": "transfer",
        "id": transfer_id,
        "stockUnitId": stock_unit_id,
        "fromLocationId": from_location_id,
        "toLocationId": to_location_id,
        "quantity": quantity,
        "proof": _proof(proof, "proof"),
    }
    return _append_command(
        state,
        payload,
        catalog_skus=catalog_skus,
        expected_head_digest=expected_head_digest,
    )


def reserve_shop_inventory(
    state: object,
    *,
    reservation_id: object,
    client_id: object,
    stock_unit_id: object,
    location_id: object,
    quantity: object,
    proof: object,
    catalog_skus: object,
    expected_head_digest: object,
) -> dict[str, Any]:
    payload = {
        "kind": "reserve",
        "id": reservation_id,
        "clientId": client_id,
        "stockUnitId": stock_unit_id,
        "locationId": location_id,
        "quantity": quantity,
        "proof": _proof(proof, "proof"),
    }
    return _append_command(
        state,
        payload,
        catalog_skus=catalog_skus,
        expected_head_digest=expected_head_digest,
    )


def _close_reservation(
    state: object,
    *,
    kind: str,
    command_id: object,
    reservation_id: object,
    proof: object,
    catalog_skus: object,
    expected_head_digest: object,
) -> dict[str, Any]:
    payload = {
        "kind": kind,
        "id": command_id,
        "reservationId": reservation_id,
        "proof": _proof(proof, "proof"),
    }
    return _append_command(
        state,
        payload,
        catalog_skus=catalog_skus,
        expected_head_digest=expected_head_digest,
    )


def release_shop_inventory_reservation(
    state: object,
    *,
    release_id: object,
    reservation_id: object,
    proof: object,
    catalog_skus: object,
    expected_head_digest: object,
) -> dict[str, Any]:
    """Recover all ATP from one active reservation without changing on-hand stock."""

    return _close_reservation(
        state,
        kind="release",
        command_id=release_id,
        reservation_id=reservation_id,
        proof=proof,
        catalog_skus=catalog_skus,
        expected_head_digest=expected_head_digest,
    )


def fulfil_shop_inventory_reservation(
    state: object,
    *,
    fulfilment_id: object,
    reservation_id: object,
    proof: object,
    catalog_skus: object,
    expected_head_digest: object,
) -> dict[str, Any]:
    """Consume one active reservation with attributable human evidence."""

    return _close_reservation(
        state,
        kind="fulfil",
        command_id=fulfilment_id,
        reservation_id=reservation_id,
        proof=proof,
        catalog_skus=catalog_skus,
        expected_head_digest=expected_head_digest,
    )


__all__ = (
    "EMPTY_SHOP_INVENTORY_DIGEST",
    "SHOP_INVENTORY_IMPORT_CONTRACT",
    "SHOP_INVENTORY_PROJECTION_CONTRACT",
    "SHOP_INVENTORY_STATE_SCHEMA",
    "ShopInventoryValidationError",
    "apply_shop_inventory_import",
    "build_shop_inventory_import_package",
    "create_empty_shop_inventory_state",
    "fulfil_shop_inventory_reservation",
    "project_shop_inventory",
    "release_shop_inventory_reservation",
    "reserve_shop_inventory",
    "shop_inventory_catalog_digest",
    "transfer_shop_inventory",
    "validate_shop_inventory_state",
)
