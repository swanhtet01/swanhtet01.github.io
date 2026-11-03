"""Unmounted, manager-only retail stock reservation projection contract.

This does not authorize a sale or alter stock. The full hold/release/commit
lifecycle and a cloud client cursor are not yet implemented, so no transport
or native replica consumes this projection. This pure function's caller-supplied
digest checks only internal consistency; the unmounted event-feed reader binds
an actual database row to an authorized header sequence in one transaction.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Mapping

from .connected_site_event_read import authorize_event_read
from .connected_site_runtime import ConnectedSitePrincipal
from .connected_site_v15 import (
    ConnectedSiteV15Error, SiteAuthority, _exact, _identifier, _time, digest,
)


PROJECTION_CONTRACT = "supermega.connected-site-retail-reservation-view.v1"
_EVENT_KEYS = {
    "eventId", "workspaceId", "siteId", "aggregateType", "aggregateId",
    "aggregateVersion", "eventType", "occurredAt", "payload",
}
_RESERVATION_KEYS = {
    "schemaVersion", "reservationId", "workspaceId", "siteId", "actorId",
    "deviceId", "workflowType", "subjectId", "capability", "lines",
    "basketDigest", "issuedAt", "expiresAt", "state", "stateVersion",
    "reservationDigest",
}


def project_retail_reservation_held(
    *, principal: ConnectedSitePrincipal, authority: SiteAuthority,
    lease: Mapping[str, Any], request: Mapping[str, Any], now: datetime,
    event: Mapping[str, Any], candidate_event_digest: str,
) -> dict[str, Any]:
    """Shape one candidate event and strip staff/financial details.

    Read authority is rechecked here. This pure projection does not establish
    that the event was in PostgreSQL, corresponded to a signed upload, or was
    delivered to any client.
    """
    grant = authorize_event_read(
        principal=principal, authority=authority, lease=lease,
        request=request, now=now,
    )
    shaped = _exact(event, _EVENT_KEYS, "projection_event_shape")
    if digest(shaped) != candidate_event_digest:
        raise ConnectedSiteV15Error("connected_site_projection_event_digest")
    _identifier(shaped["eventId"], "projection_event_id")
    aggregate_id = _identifier(shaped["aggregateId"], "projection_aggregate")
    if (
        shaped["workspaceId"] != grant.workspace_id
        or shaped["siteId"] != grant.site_id
        or shaped["aggregateType"] != "retailCart"
        or shaped["eventType"] != "shop.connected_stock.reserved.v1"
        or type(shaped["aggregateVersion"]) is not int
        or shaped["aggregateVersion"] < 1
    ):
        raise ConnectedSiteV15Error("connected_site_projection_event_scope")
    _time(shaped["occurredAt"], "projection_event_time")
    payload = _exact(
        shaped["payload"], {"contract", "reservation"},
        "projection_payload_shape",
    )
    if payload["contract"] != "supermega.shop.connected-stock-reserve.v1":
        raise ConnectedSiteV15Error("connected_site_projection_payload_contract")
    reservation = _exact(
        payload["reservation"], _RESERVATION_KEYS,
        "projection_reservation_shape",
    )
    unsigned = {key: reservation[key] for key in _RESERVATION_KEYS - {"reservationDigest"}}
    if (
        type(reservation["schemaVersion"]) is not int
        or reservation["schemaVersion"] != 1
        or type(reservation["stateVersion"]) is not int
        or reservation["stateVersion"] != 1
        or reservation["workspaceId"] != grant.workspace_id
        or reservation["siteId"] != grant.site_id
        or reservation["workflowType"] != "retailCart"
        or reservation["subjectId"] != aggregate_id
        or reservation["capability"] != "counterSale"
        or reservation["state"] != "held"
        or reservation["reservationDigest"] != digest(unsigned)
    ):
        raise ConnectedSiteV15Error("connected_site_projection_reservation_binding")
    reservation_id = _identifier(reservation["reservationId"], "projection_reservation_id")
    _identifier(reservation["actorId"], "projection_actor_id")
    _identifier(reservation["deviceId"], "projection_device_id")
    issued = _time(reservation["issuedAt"], "projection_issued_at")
    expires = _time(reservation["expiresAt"], "projection_expires_at")
    if (
        shaped["occurredAt"] != reservation["issuedAt"]
        or expires <= issued or expires - issued > timedelta(hours=24)
    ):
        raise ConnectedSiteV15Error("connected_site_projection_reservation_time")
    raw_lines = reservation["lines"]
    if not isinstance(raw_lines, list) or not 1 <= len(raw_lines) <= 100:
        raise ConnectedSiteV15Error("connected_site_projection_lines")
    lines: list[dict[str, Any]] = []
    for raw_line in raw_lines:
        line = _exact(raw_line, {"productId", "quantity"}, "projection_line_shape")
        product_id = _identifier(line["productId"], "projection_product_id")
        quantity = line["quantity"]
        if type(quantity) is not int or not 1 <= quantity <= 1000:
            raise ConnectedSiteV15Error("connected_site_projection_quantity")
        lines.append({"productId": product_id, "quantity": quantity})
    products = [line["productId"] for line in lines]
    if products != sorted(set(products)) or reservation["basketDigest"] != digest({
        "schemaVersion": 1, "lines": lines,
    }):
        raise ConnectedSiteV15Error("connected_site_projection_basket")
    return {
        "contract": PROJECTION_CONTRACT,
        "workspaceId": grant.workspace_id,
        "siteId": grant.site_id,
        "candidateEventDigest": candidate_event_digest,
        "reservationId": reservation_id,
        "reservationDigest": reservation["reservationDigest"],
        "state": "held",
        "stateVersion": 1,
        "lines": lines,
    }
