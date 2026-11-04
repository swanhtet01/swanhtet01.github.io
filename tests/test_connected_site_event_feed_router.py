"""Unmounted feed-route checks with synthetic peers and SQL; no live ingress."""

from __future__ import annotations

from datetime import timedelta
import json
import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from supermega_runtime.connected_site_event_feed_router import (
    create_connected_site_event_feed_router,
)
from supermega_runtime.connected_site_gateway import (
    ConnectedSiteGatewayPrincipalResolver, GatewayPeerAttestation,
)
from supermega_runtime.connected_site_v15 import canonical_json, digest
from tests.connected_site_signed_page_fixture import _signature
from tests.test_connected_site_event_feed import _Script
from tests.test_connected_site_event_read import _fixture, _resign
from tests.test_connected_site_runtime import _Authorities
from tests.test_connected_site_v15 import NOW
from tests.v41_native_http_bridge_fixture import _key


PATH = "/api/connected-site/v1/event-feed"


def _app(*, enabled=True, signer_mode="valid", peer_active=True,
         pin_seed=23, clock_rollback=False):
    authority, lease, signed_request = _fixture()
    event = {"synthetic": "private-event", "privateRemark": "must-not-leak"}
    script = _Script(authority, lease, events=[
        (1, digest(event), None, canonical_json(event)),
    ])
    provider = _Authorities(authority)

    def peer(request):
        if not peer_active:
            return None
        device = authority.devices["device-a"]
        return GatewayPeerAttestation(
            request=request, gateway_id="synthetic-gateway",
            workspace_id=authority.workspace_id, site_id=authority.site_id,
            device_id=device.device_id, client_fingerprint=device.client_fingerprint,
            session_generation=device.session_generation, observed_at=NOW,
        )

    resolver = ConnectedSiteGatewayPrincipalResolver(
        gateway_id="synthetic-gateway", load_attested_peer=peer,
        authority_provider=provider, now=lambda: NOW,
    )
    clock_reads = 0

    def trusted_now():
        nonlocal clock_reads
        clock_reads += 1
        return NOW - timedelta(seconds=1) if clock_rollback and clock_reads > 1 else NOW

    def sign(page, request, retained_lease):
        if signer_mode == "raises":
            raise RuntimeError("synthetic_signer_failed")
        if signer_mode == "mutate-request":
            request["requestNonce"] = "f" * 64
        if signer_mode == "mutate-lease":
            retained_lease["role"] = "owner"
        if signer_mode == "mutate-lease-signature":
            retained_lease["signature"] = "changed"
        wire = page.to_wire()
        issued = int(NOW.timestamp() * 1000)
        proof = {
            "contract": "supermega.connected-cloud-feed-proof.v1",
            "protocolVersion": 1, "issuerKeyId": "feed_fixture",
            "issuedAtMillis": issued, "expiresAtMillis": issued + 30000,
            "workspaceId": wire["workspaceId"], "siteId": wire["siteId"],
            "actorId": wire["actorId"], "actorRole": retained_lease["role"],
            "deviceId": wire["deviceId"],
            "authorityGeneration": wire["authorityGeneration"],
            "revocationGeneration": wire["revocationGeneration"],
            "authorityPayloadDigest": wire["authorityPayloadDigest"],
            "leaseDigest": wire["leaseDigest"],
            "requestDigest": wire["requestDigest"],
            "requestNonce": request["requestNonce"],
            "afterSequence": wire["afterSequence"],
            "priorEventDigest": wire["priorEventDigest"],
            "nextSequence": wire["nextSequence"],
            "nextEventDigest": wire["nextEventDigest"],
            "pageDigest": wire["pageDigest"],
        }
        sealed = {
            "requestJson": canonical_json(request),
            "pageJson": canonical_json(wire),
            "proofJson": canonical_json({
                **proof, "signature": _signature(23, proof),
            }),
        }
        if signer_mode == "wrong-page":
            sealed["pageJson"] = canonical_json({**wire, "siteId": "other"})
        if signer_mode == "wrong-signature":
            changed = json.loads(sealed["proofJson"])
            changed["signature"] = _signature(24, proof)
            sealed["proofJson"] = canonical_json(changed)
        return sealed

    app = FastAPI()
    app.include_router(create_connected_site_event_feed_router(
        connection_factory=script.connect, authority_provider=provider,
        resolve_principal=resolver,
        load_lease=lambda principal, request: lease,
        seal_checked_page=sign,
        pinned_issuer_keys={"feed_fixture": _key(pin_seed)[1]},
        trusted_now=trusted_now, runtime_enabled=enabled,
    ))
    return app, signed_request, script


class EventFeedRouterTests(unittest.TestCase):
    def test_disabled_and_unpaired_peer_never_read_sql(self):
        for enabled, peer_active, expected in ((False, True, 503), (True, False, 401)):
            app, request, script = _app(enabled=enabled, peer_active=peer_active)
            with TestClient(app) as client:
                response = client.post(PATH, json=request)
            self.assertEqual(response.status_code, expected)
            self.assertEqual(script.queries, [])

    def test_current_signed_manager_gets_only_checked_bound_bytes(self):
        app, request, script = _app()
        with TestClient(app) as client:
            response = client.post(PATH, json=request)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers["cache-control"], "no-store")
        sealed = response.json()
        self.assertEqual(set(sealed), {"requestJson", "pageJson", "proofJson"})
        self.assertEqual(sealed["requestJson"], canonical_json(request))
        self.assertNotIn("must-not-leak", response.text)
        self.assertTrue(any("for share" in sql for sql, _ in script.queries))
        self.assertEqual(script.clock_reads, 3)

    def test_ambient_duplicate_oversize_and_substituted_identity_fail(self):
        app, request, _ = _app()
        with TestClient(app) as client:
            self.assertEqual(client.post(PATH, json=request,
                                         headers={"Authorization": "Bearer synthetic"}).status_code, 400)
            raw = canonical_json(request).replace(
                '"contract":', '"contract":"duplicate","contract":', 1,
            )
            self.assertEqual(client.post(PATH, content=raw,
                                         headers={"content-type": "application/json"}).status_code, 400)
            self.assertEqual(client.post(PATH, content="x" * 70000).status_code, 413)
            self.assertNotEqual(client.post(PATH, json={**request, "deviceId": "device-b"}).status_code, 200)
            self.assertNotEqual(client.post(PATH, json={**request, "requestNonce": "f" * 64}).status_code, 200)
            self.assertNotEqual(client.post(PATH, json=_resign(request, workspaceId="other")).status_code, 200)
            stale = (NOW - timedelta(seconds=31)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
            self.assertNotEqual(client.post(PATH, json=_resign(request, issuedAt=stale)).status_code, 200)

    def test_revoked_sql_and_bad_or_failed_signer_never_return_page(self):
        app, request, script = _app()
        script.device = ("revoked", *script.device[1:])
        with TestClient(app) as client:
            self.assertNotEqual(client.post(PATH, json=request).status_code, 200)
        for mode in ("wrong-page", "wrong-signature", "raises",
                     "mutate-request", "mutate-lease", "mutate-lease-signature"):
            app, request, _ = _app(signer_mode=mode)
            with TestClient(app) as client:
                response = client.post(PATH, json=request)
            self.assertNotEqual(response.status_code, 200, mode)
        for kwargs in ({"pin_seed": 24}, {"clock_rollback": True}):
            app, request, _ = _app(**kwargs)
            with TestClient(app) as client:
                self.assertNotEqual(client.post(PATH, json=request).status_code, 200)
        app, request, script = _app()
        script.site = (True, 1, 99, script.site[3])
        with TestClient(app) as client:
            self.assertNotEqual(client.post(PATH, json=request).status_code, 200)


if __name__ == "__main__":
    unittest.main()
