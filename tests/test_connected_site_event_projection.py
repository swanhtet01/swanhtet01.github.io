"""Default-off retail stock projection; no network or replica writes."""

from __future__ import annotations

from copy import deepcopy
from datetime import timedelta
import unittest

from supermega_runtime.connected_site_event_projection import (
    PROJECTION_CONTRACT, project_retail_reservation_held,
)
from supermega_runtime.connected_site_runtime import ConnectedSitePrincipal
from supermega_runtime.connected_site_v15 import ConnectedSiteV15Error, digest
from tests.test_connected_site_event_read import _fixture
from tests.test_connected_site_v15 import DEVICE_A, NOW, _authority, _upload


def _inputs():
    authority, lease, request = _fixture()
    source = _authority("workspace-a", "site-a", "device-a", DEVICE_A)
    event = deepcopy(_upload(source, key=DEVICE_A).event)
    principal = ConnectedSitePrincipal(
        "workspace-a", "site-a", "device-a", True, "synthetic-gateway",
    )
    return authority, lease, request, principal, event


def _project(authority, lease, request, principal, event, *, now=NOW,
             candidate_digest=None):
    return project_retail_reservation_held(
        principal=principal, authority=authority, lease=lease, request=request,
        now=now, event=event,
        candidate_event_digest=candidate_digest or digest(event),
    )


class RetailReservationProjectionTests(unittest.TestCase):
    def test_manager_gets_only_typed_stock_fields(self):
        authority, lease, request, principal, event = _inputs()
        projection = _project(authority, lease, request, principal, event)
        self.assertEqual(projection, {
            "contract": PROJECTION_CONTRACT,
            "workspaceId": "workspace-a", "siteId": "site-a",
            "candidateEventDigest": digest(event),
            "reservationId": "reservation:command-1",
            "reservationDigest": event["payload"]["reservation"]["reservationDigest"],
            "state": "held", "stateVersion": 1,
            "lines": [{"productId": "product-1", "quantity": 1}],
        })
        for forbidden in ("actorId", "deviceId", "subjectId", "occurredAt",
                          "saleId", "remark", "unitPrice"):
            self.assertNotIn(forbidden, str(projection))
        self.assertEqual(_project(authority, lease, request, principal, event), projection)

    def test_unknown_or_sensitive_event_content_is_rejected_even_if_redigested(self):
        authority, lease, request, principal, base = _inputs()
        mutations = (
            lambda event: event.update(eventType="shop.cafe_order.put.v1"),
            lambda event: event.update(workspaceId="workspace-b"),
            lambda event: event.update(extra="private"),
            lambda event: event["payload"].update(customerPhone="secret"),
            lambda event: event["payload"]["reservation"].update(state="released"),
            lambda event: event["payload"]["reservation"].update(workflowType="cafeOrder"),
            lambda event: event["payload"]["reservation"]["lines"][0].update(unitPrice=100),
            lambda event: event["payload"]["reservation"]["lines"][0].update(quantity=True),
            lambda event: event["payload"]["reservation"]["lines"].append(
                {"productId": "product-1", "quantity": 1}),
        )
        for mutate in mutations:
            event = deepcopy(base)
            mutate(event)
            with self.subTest(event=event), self.assertRaises(ConnectedSiteV15Error):
                _project(authority, lease, request, principal, event)
        with self.assertRaisesRegex(ConnectedSiteV15Error, "projection_event_digest"):
            _project(authority, lease, request, principal, base,
                     candidate_digest="f" * 64)

    def test_read_role_scope_and_lease_remain_required(self):
        authority, lease, request, principal, event = _inputs()
        wrong = ConnectedSitePrincipal(
            "workspace-b", "site-a", "device-a", True, "synthetic-gateway",
        )
        with self.assertRaises(ConnectedSiteV15Error):
            _project(authority, lease, request, wrong, event)
        with self.assertRaises(ConnectedSiteV15Error):
            _project(authority, lease, request, principal, event,
                     now=NOW + timedelta(days=2))
        cashier, cashier_lease, cashier_request = _fixture(
            role="cashierCounter", capabilities=("counterSale",),
        )
        with self.assertRaises(ConnectedSiteV15Error):
            _project(cashier, cashier_lease, cashier_request, principal, event)


if __name__ == "__main__":
    unittest.main()
