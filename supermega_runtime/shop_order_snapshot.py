"""Contact-minimal Shop order projection from the managed Commerce authority.

This is a read contract, not an independent order store or a sync acknowledgement.
The caller must validate the complete Commerce state and authorize its workspace
before using this projection. Storefront requests are deliberately excluded.
"""

from collections.abc import Mapping
from typing import Any


SHOP_ORDER_SNAPSHOT_SCHEMA = "supermega.shop.orders.snapshot.v1"


def project_shop_order_snapshot(
    state: Mapping[str, Any], *, workspace_id: str, workspace_version: int,
    workspace_updated_at: str,
) -> dict[str, Any]:
    """Project confirmed orders without customer, payment, or contact evidence."""

    orders = state.get("orders")
    if not isinstance(orders, list):
        raise ValueError("Validated Commerce state must contain orders.")
    seen: set[str] = set()
    projected: list[dict[str, Any]] = []
    for order in orders:
        if not isinstance(order, Mapping) or not isinstance(order.get("id"), str):
            raise ValueError("Validated Commerce state contains an invalid order.")
        order_id = order["id"]
        if order_id in seen:
            raise ValueError("Validated Commerce state contains duplicate orders.")
        seen.add(order_id)
        raw_lines = order.get("lines")
        lines_available = isinstance(raw_lines, list) and bool(raw_lines)
        lines: list[dict[str, Any]] = []
        if lines_available:
            for line in raw_lines:
                if not isinstance(line, Mapping):
                    raise ValueError("Validated Commerce state contains an invalid order line.")
                lines.append({
                    "sku": line["sku"],
                    "name": line["name"],
                    **({"nameMy": line["nameMy"]} if "nameMy" in line else {}),
                    **({"variant": line["variant"]} if "variant" in line else {}),
                    "quantity": line["quantity"],
                    "unitPriceMmk": line["unitPriceMmk"],
                })
        projected.append({
            "id": order_id,
            "createdAt": order["createdAt"],
            "status": order["status"],
            "paymentStatus": order["paymentStatus"],
            "refundStatus": order["refundStatus"],
            "paymentDueAt": order.get("paymentDueAt"),
            "promisedAt": order.get("promisedAt"),
            "quantity": order["quantity"],
            "totalMmk": order["total"],
            "lineSnapshotsAvailable": lines_available,
            "lines": lines,
        })
    projected.sort(key=lambda order: (order["createdAt"], order["id"]), reverse=True)
    return {
        "schema": SHOP_ORDER_SNAPSHOT_SCHEMA,
        "scope": "confirmed-orders-only",
        "workspaceId": workspace_id,
        # The managed Commerce version is global to its workspace, not a
        # per-order revision. Clients must compare this whole snapshot.
        "workspaceVersion": workspace_version,
        "workspaceUpdatedAt": workspace_updated_at,
        "orders": projected,
    }
