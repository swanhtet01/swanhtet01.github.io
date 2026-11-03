"""Adversarial synthetic tests for the still-unmounted gateway binding."""

from __future__ import annotations

from dataclasses import replace
from datetime import timedelta
import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from supermega_runtime.connected_site_gateway import (
    ConnectedSiteGatewayPrincipalResolver,
    GatewayPeerAttestation,
)
from supermega_runtime.connected_site_runtime import (
    ConnectedSiteRuntimeService,
    create_connected_site_router,
)
from supermega_runtime.connected_site_v15 import MemoryConnectedSiteRepository
from tests.test_connected_site_runtime import _Authorities
from tests.test_connected_site_v15 import DEVICE_A, NOW, _authority


class GatewayBindingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.authority = _authority("workspace-a", "site-a", "device-a", DEVICE_A)
        self.authorities = _Authorities(self.authority)

    def client(self, load_peer) -> TestClient:
        resolver = ConnectedSiteGatewayPrincipalResolver(
            gateway_id="reviewed-ingress",
            load_attested_peer=load_peer,
            authority_provider=self.authorities,
            now=lambda: NOW,
        )
        service = ConnectedSiteRuntimeService(
            authority_provider=self.authorities,
            repository=MemoryConnectedSiteRepository(),
            runtime_enabled=True,
            now=lambda: NOW,
        )
        app = FastAPI()
        app.include_router(create_connected_site_router(
            service=service, resolve_principal=resolver,
        ))
        return TestClient(app)

    def peer(self, request, **changes) -> GatewayPeerAttestation:
        device = self.authority.devices["device-a"]
        fields = dict(
            request=request,
            gateway_id="reviewed-ingress",
            workspace_id="workspace-a",
            site_id="site-a",
            device_id="device-a",
            client_fingerprint=device.client_fingerprint,
            session_generation=device.session_generation,
            observed_at=NOW,
        )
        fields.update(changes)
        return GatewayPeerAttestation(**fields)

    @staticmethod
    def authority_url() -> str:
        return "/api/connected-site/v1/workspaces/workspace-a/sites/site-a/authority"

    def test_current_request_attestation_matches_enrolled_device(self) -> None:
        with self.client(lambda request: self.peer(request)) as client:
            response = client.get(self.authority_url())
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["deviceId"], "device-a")

    def test_http_fields_cannot_supply_missing_peer_evidence(self) -> None:
        with self.client(lambda _request: None) as client:
            response = client.get(
                self.authority_url() + "?deviceId=device-a&authenticated=true",
                headers={"x-device-id": "device-a", "x-client-fingerprint": "a" * 64},
            )
            cookie_response = client.get(
                self.authority_url(), headers={"cookie": "gateway-peer=device-a"},
            )
            body_response = client.post(
                "/api/connected-site/v1/reconcile",
                json={"deviceId": "device-a", "authenticated": True},
            )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(body_response.status_code, 401)
        self.assertEqual(cookie_response.status_code, 400)
        self.assertEqual(
            cookie_response.json()["detail"]["error"], "ambient_authority_rejected"
        )

    def test_wrong_gateway_scope_fingerprint_generation_and_time_fail(self) -> None:
        wrong = (
            {"gateway_id": "other-ingress"},
            {"workspace_id": "workspace-b"},
            {"site_id": "site-b"},
            {"device_id": "device-b"},
            {"client_fingerprint": "a" * 64},
            {"session_generation": 99},
            {"observed_at": NOW - timedelta(seconds=31)},
            {"observed_at": NOW + timedelta(seconds=1)},
        )
        for changes in wrong:
            with self.subTest(changes=changes), self.client(
                lambda request: self.peer(request, **changes)
            ) as client:
                self.assertEqual(client.get(self.authority_url()).status_code, 401)

    def test_attestation_replay_on_another_request_fails(self) -> None:
        retained = []

        def load(request):
            if not retained:
                retained.append(self.peer(request))
            return retained[0]

        with self.client(load) as client:
            self.assertEqual(client.get(self.authority_url()).status_code, 200)
            self.assertEqual(client.get(self.authority_url()).status_code, 401)

    def test_revoked_device_and_unavailable_ingress_fail(self) -> None:
        device = self.authority.devices["device-a"]
        self.authorities.values[("workspace-a", "site-a")] = replace(
            self.authority, devices={"device-a": replace(device, active=False)},
        )
        with self.client(lambda request: self.peer(request)) as client:
            self.assertEqual(client.get(self.authority_url()).status_code, 401)
        with self.client(lambda _request: (_ for _ in ()).throw(RuntimeError("ingress down"))) as client:
            self.assertEqual(client.get(self.authority_url()).status_code, 401)

    def test_missing_or_disabled_current_authority_fails(self) -> None:
        for value in (None, replace(self.authority, enabled=False)):
            self.authorities.values[("workspace-a", "site-a")] = value
            with self.subTest(authority=value), self.client(
                lambda request: self.peer(request)
            ) as client:
                self.assertEqual(client.get(self.authority_url()).status_code, 401)


if __name__ == "__main__":
    unittest.main()
