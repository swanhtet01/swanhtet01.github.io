"""Synthetic SQL-boundary tests; real PostgreSQL execution is separate."""

from __future__ import annotations

from dataclasses import replace
from datetime import timedelta
import json
import unittest

from supermega_runtime.connected_site_event_feed import (
    read_event_headers, read_retail_reservation_page,
)
from supermega_runtime.connected_site_runtime import ConnectedSitePrincipal
from supermega_runtime.connected_site_v15 import ConnectedSiteV15Error, digest
from tests.test_connected_site_event_read import _fixture, _resign
from tests.test_connected_site_event_projection import _inputs
from tests.test_connected_site_v15 import NOW


class _Cursor:
    def __init__(self, script):
        self.script = script
        self.rows = None

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def execute(self, sql, args=None):
        self.script.queries.append((sql, args))
        if "from app_private.connected_sites " in sql:
            self.rows = self.script.site
        elif "from app_private.connected_site_devices " in sql:
            self.rows = self.script.device
        elif "from app_private.connected_site_leases " in sql:
            self.rows = self.script.lease
        elif "clock_timestamp()" in sql:
            self.script.clock_reads += 1
            self.rows = (self.script.late_now if self.script.clock_reads > 1 and
                         self.script.late_now is not None else self.script.now,)
        elif "from app_private.connected_site_events " in sql:
            self.rows = self.script.prior if "event_sequence=%s" in sql else self.script.events
        else:
            self.rows = None

    def fetchone(self):
        return self.rows

    def fetchall(self):
        return self.rows


class _Connection:
    def __init__(self, script):
        self.script = script
        self.autocommit = script.autocommit

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def cursor(self):
        return _Cursor(self.script)


class _Script:
    def __init__(self, authority, lease, *, events=None):
        device = authority.devices["device-a"]
        self.site = (True, authority.authority_generation,
                     authority.revocation_generation, authority.authority_payload_digest)
        self.device = ("active", device.signing_key_id, device.public_key,
                       device.client_fingerprint, device.enrollment_evidence_digest,
                       device.session_generation)
        self.lease = ("active", digest(lease), "actor-1", "device-a",
                      lease["role"], lease["sessionGeneration"],
                      lease["revocationGeneration"], lease["issuerKeyId"],
                      authority.issuer_keys[lease["issuerKeyId"]],
                      NOW + timedelta(days=1))
        self.now = NOW
        self.prior = None
        self.events = events if events is not None else [
            (1, "a" * 64, None), (2, "b" * 64, "a" * 64),
        ]
        self.queries = []
        self.autocommit = False
        self.clock_reads = 0
        self.late_now = None

    def connect(self):
        return _Connection(self)


def _read(script, authority, lease, request, *, now=NOW, principal=None):
    principal = principal or ConnectedSitePrincipal(
        workspace_id=authority.workspace_id, site_id=authority.site_id,
        device_id="device-a", authenticated=True,
        identity_provider="synthetic-gateway",
    )
    return read_event_headers(
        connection_factory=script.connect, principal=principal,
        authority=authority, lease=lease, request=request, now=now,
    )


class EventFeedTests(unittest.TestCase):
    def test_manager_page_binds_stored_row_and_returns_only_typed_stock_fields(self):
        authority, lease, request, principal, event = _inputs()
        script = _Script(authority, lease, events=[
            (1, digest(event), None, json.dumps(event)),
        ])
        page = read_retail_reservation_page(
            connection_factory=script.connect, principal=principal,
            authority=authority, lease=lease, request=request, now=NOW,
        )
        self.assertEqual(page.headers.next_sequence, 1)
        self.assertEqual(len(page.projections), 1)
        self.assertEqual(page.projections[0].sequence, 1)
        self.assertEqual(page.projections[0].event_digest, digest(event))
        self.assertEqual(page.projections[0].projection["candidateEventDigest"], digest(event))
        self.assertEqual(page.projections[0].projection["state"], "held")
        self.assertEqual(page.projections[0].projection["lines"],
                         [{"productId": "product-1", "quantity": 1}])
        self.assertNotIn("actorId", str(page))
        self.assertNotIn("deviceId", str(page))
        self.assertNotIn("payload", str(page))
        self.assertTrue(any("event_json::text" in sql for sql, _ in script.queries))
        self.assertEqual(script.clock_reads, 2)

    def test_manager_page_rejects_changed_row_and_never_returns_raw_payload(self):
        authority, lease, request, principal, event = _inputs()
        for row in (
            (1, "f" * 64, None, json.dumps(event)),
            (1, digest(event), None, "{broken"),
            (1, digest(event), None, ""),
            (1, digest(event), None),
        ):
            script = _Script(authority, lease, events=[row])
            with self.subTest(row=row), self.assertRaises(ConnectedSiteV15Error):
                read_retail_reservation_page(
                    connection_factory=script.connect, principal=principal,
                    authority=authority, lease=lease, request=request, now=NOW,
                )
        hostile = json.loads(json.dumps(event))
        hostile["payload"]["customerPhone"] = "private-value"
        script = _Script(authority, lease, events=[
            (1, digest(hostile), None, json.dumps(hostile)),
        ])
        with self.assertRaises(ConnectedSiteV15Error):
            read_retail_reservation_page(
                connection_factory=script.connect, principal=principal,
                authority=authority, lease=lease, request=request, now=NOW,
            )

    def test_manager_page_advances_over_other_events_without_exposing_them(self):
        authority, lease, request, principal, event = _inputs()
        other = json.loads(json.dumps(event))
        other["eventType"] = "shop.cafe_order.put.v1"
        other["payload"] = {"privateNote": "not-a-projection"}
        script = _Script(authority, lease, events=[
            (1, digest(other), None, json.dumps(other)),
            (2, digest(event), digest(other), json.dumps(event)),
        ])
        page = read_retail_reservation_page(
            connection_factory=script.connect, principal=principal,
            authority=authority, lease=lease, request=request, now=NOW,
        )
        self.assertEqual(page.headers.next_sequence, 2)
        self.assertEqual(len(page.projections), 1)
        self.assertEqual(page.projections[0].sequence, 2)
        self.assertEqual(page.projections[0].event_digest, digest(event))
        self.assertNotIn("privateNote", str(page))

        # The lookahead row proves has_more but cannot leak its projection.
        lookahead = read_retail_reservation_page(
            connection_factory=script.connect, principal=principal,
            authority=authority, lease=lease,
            request=_resign(request, limit=1), now=NOW,
        )
        self.assertEqual(lookahead.headers.next_sequence, 1)
        self.assertTrue(lookahead.headers.has_more)
        self.assertEqual(lookahead.projections, ())

    def test_manager_page_denies_wrong_role_and_expiry_during_db_read(self):
        cashier, cashier_lease, cashier_request = _fixture(
            role="cashierCounter", capabilities=("counterSale",),
        )
        cashier_script = _Script(cashier, cashier_lease)
        cashier_principal = ConnectedSitePrincipal(
            cashier.workspace_id, cashier.site_id, "device-a", True,
            "synthetic-gateway",
        )
        with self.assertRaises(ConnectedSiteV15Error):
            read_retail_reservation_page(
                connection_factory=cashier_script.connect,
                principal=cashier_principal, authority=cashier,
                lease=cashier_lease, request=cashier_request, now=NOW,
            )
        self.assertEqual(cashier_script.queries, [])

        authority, lease, request, principal, event = _inputs()
        script = _Script(authority, lease, events=[
            (1, digest(event), None, json.dumps(event)),
        ])
        script.late_now = NOW + timedelta(days=2)
        with self.assertRaises(ConnectedSiteV15Error):
            read_retail_reservation_page(
                connection_factory=script.connect, principal=principal,
                authority=authority, lease=lease, request=request, now=NOW,
            )
        self.assertEqual(script.clock_reads, 2)

    def test_ordered_metadata_page_reconnect_and_no_payload_query(self):
        authority, lease, request = _fixture()
        script = _Script(authority, lease)
        first = _read(script, authority, lease, _resign(request, limit=1))
        self.assertEqual((first.next_sequence, first.next_event_digest, first.has_more),
                         (1, "a" * 64, True))
        self.assertEqual(len(first.headers), 1)
        self.assertTrue(all("event_json" not in sql for sql, _ in script.queries))
        self.assertTrue(any("repeatable read" in sql for sql, _ in script.queries))
        self.assertTrue(any("for share" in sql for sql, _ in script.queries))
        script.prior = ("a" * 64,)
        script.events = [(2, "b" * 64, "a" * 64)]
        continued = _resign(request, afterSequence=1, priorEventDigest="a" * 64)
        second = _read(script, authority, lease, continued)
        self.assertEqual((second.next_sequence, second.next_event_digest, second.has_more),
                         (2, "b" * 64, False))
        self.assertEqual(_read(script, authority, lease, continued), second)
        self.assertEqual([args for sql, args in script.queries if "order by event_sequence" in sql][-1],
                         (authority.workspace_id, authority.site_id, 1, 33))

    def test_scope_and_revocation_are_rechecked_before_events(self):
        authority, lease, request = _fixture()
        for mutation in (
            lambda s: setattr(s, "site", (False, *s.site[1:])),
            lambda s: setattr(s, "site", (True, 99, *s.site[2:])),
            lambda s: setattr(s, "site", (True, s.site[1], 99, s.site[3])),
            lambda s: setattr(s, "site", (True, s.site[1], s.site[2], "f" * 64)),
            lambda s: setattr(s, "device", ("revoked", *s.device[1:])),
            lambda s: setattr(s, "lease", ("revoked", *s.lease[1:])),
            lambda s: setattr(s, "lease", (s.lease[0], "f" * 64, *s.lease[2:])),
            lambda s: setattr(s, "lease", (*s.lease[:9], NOW + timedelta(days=2))),
            lambda s: setattr(s, "now", NOW + timedelta(days=2)),
        ):
            script = _Script(authority, lease)
            mutation(script)
            with self.subTest(mutation=mutation), self.assertRaises(ConnectedSiteV15Error):
                _read(script, authority, lease, request)
            self.assertFalse(any("connected_site_events" in sql for sql, _ in script.queries))
        script = _Script(authority, lease)
        other = ConnectedSitePrincipal("other-workspace", authority.site_id,
                                       "device-a", True, "synthetic-gateway")
        with self.assertRaises(ConnectedSiteV15Error):
            _read(script, authority, lease, request, principal=other)
        self.assertEqual(script.queries, [])

    def test_expiry_during_page_read_fails_after_fetch(self):
        authority, lease, request = _fixture()
        for late_now in (NOW + timedelta(days=2), NOW + timedelta(seconds=31)):
            script = _Script(authority, lease)
            script.late_now = late_now
            with self.subTest(late_now=late_now), self.assertRaises(ConnectedSiteV15Error):
                _read(script, authority, lease, request)
            self.assertEqual(script.clock_reads, 2)
            self.assertTrue(any("connected_site_events" in sql for sql, _ in script.queries))

    def test_cursor_substitution_gap_and_truncation_fail_closed(self):
        authority, lease, request = _fixture()
        continued = _resign(request, afterSequence=1, priorEventDigest="a" * 64)
        for prior, events in (
            (None, [(2, "b" * 64, "a" * 64)]),
            (("f" * 64,), [(2, "b" * 64, "a" * 64)]),
            (("a" * 64,), [(3, "b" * 64, "a" * 64)]),
            (("a" * 64,), [(2, "b" * 64, "f" * 64)]),
            (("a" * 64,), [(2, "bad", "a" * 64)]),
        ):
            script = _Script(authority, lease, events=events)
            script.prior = prior
            with self.subTest(prior=prior, events=events), self.assertRaises(ConnectedSiteV15Error):
                _read(script, authority, lease, continued)

    def test_no_connection_for_expired_or_unprivileged_actor(self):
        authority, lease, request = _fixture()
        script = _Script(authority, lease)
        with self.assertRaises(ConnectedSiteV15Error):
            _read(script, authority, lease, request, now=NOW + timedelta(days=2))
        self.assertEqual(script.queries, [])
        cashier, cashier_lease, cashier_request = _fixture(
            role="cashierCounter", capabilities=("counterSale",),
        )
        script = _Script(cashier, cashier_lease)
        with self.assertRaises(ConnectedSiteV15Error):
            _read(script, cashier, cashier_lease, cashier_request)
        self.assertEqual(script.queries, [])

    def test_autocommit_connection_cannot_read_a_page(self):
        authority, lease, request = _fixture()
        script = _Script(authority, lease)
        script.autocommit = True
        with self.assertRaisesRegex(ConnectedSiteV15Error, "transaction_required"):
            _read(script, authority, lease, request)
        self.assertEqual(script.queries, [])


if __name__ == "__main__":
    unittest.main()
