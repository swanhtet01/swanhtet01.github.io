from __future__ import annotations

import asyncio
from dataclasses import replace
from datetime import datetime, timezone
import json
from pathlib import Path
import unittest

from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient

from supermega_runtime.connected_site_runtime import (
    ConnectedSitePrincipal,
    ConnectedSiteRuntimeService,
    RECONCILE_REQUEST_CONTRACT,
    _read_bounded_body,
    create_connected_site_router,
    canonical_json,
)
from supermega_runtime.connected_site_v15 import MemoryConnectedSiteRepository, UploadEvent
from tests.test_connected_site_v15 import DEVICE_A, DEVICE_B, NOW, _authority, _upload


class _Authorities:
    def __init__(self, *values: object) -> None:
        self.values = {
            (value.workspace_id, value.site_id): value  # type: ignore[attr-defined]
            for value in values
        }

    def load_authority(self, *, workspace_id: str, site_id: str):
        return self.values.get((workspace_id, site_id))


def _event_json(value: UploadEvent) -> dict[str, object]:
    return {
        "cursor": value.cursor,
        "commandId": value.command_id,
        "commandDigest": value.command_digest,
        "event": dict(value.event),
        "eventDigest": value.event_digest,
        "cloudProof": dict(value.cloud_proof),
    }


def _request(authority, upload: UploadEvent, *, after_cursor: int = 0) -> dict[str, object]:
    device = next(iter(authority.devices.values()))
    return {
        "contract": RECONCILE_REQUEST_CONTRACT,
        "workspaceId": authority.workspace_id,
        "siteId": authority.site_id,
        "deviceId": device.device_id,
        "sessionGeneration": device.session_generation,
        "authorityGeneration": authority.authority_generation,
        "authorityPayloadDigest": authority.authority_payload_digest,
        "revocationGeneration": authority.revocation_generation,
        "afterCursor": after_cursor,
        "events": [_event_json(upload)],
    }


class ConnectedSiteRuntimeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.authority_a = _authority("workspace-a", "site-a", "device-a", DEVICE_A)
        self.authority_b = _authority("workspace-b", "site-b", "device-b", DEVICE_B)
        self.authorities = _Authorities(self.authority_a, self.authority_b)
        self.repository = MemoryConnectedSiteRepository()
        self.principal = ConnectedSitePrincipal(
            workspace_id="workspace-a",
            site_id="site-a",
            device_id="device-a",
            authenticated=True,
            identity_provider="synthetic-gateway",
        )

    def client(
        self,
        *,
        enabled: bool = True,
        principal: ConnectedSitePrincipal | None = None,
        max_body_bytes: int = 1024 * 1024,
    ) -> TestClient:
        service = ConnectedSiteRuntimeService(
            authority_provider=self.authorities,
            repository=self.repository,
            runtime_enabled=enabled,
            now=lambda: NOW,
        )
        app = FastAPI()
        resolved = self.principal if principal is None else principal
        app.include_router(
            create_connected_site_router(
                service=service,
                resolve_principal=lambda _request: resolved,
                max_body_bytes=max_body_bytes,
            )
        )
        return TestClient(app)

    def test_router_is_unmounted_by_default_and_service_fails_closed(self) -> None:
        app = FastAPI()
        self.assertEqual({route.path for route in app.routes}.intersection({
            "/api/connected-site/v1/reconcile",
        }), set())
        response = self.client(enabled=False).post(
            "/api/connected-site/v1/reconcile",
            json=_request(self.authority_a, _upload(self.authority_a, key=DEVICE_A)),
        )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"]["error"], "server_adapter_disabled")

    def test_cross_runtime_wire_golden_is_byte_exact(self) -> None:
        service = ConnectedSiteRuntimeService(
            authority_provider=self.authorities,
            repository=MemoryConnectedSiteRepository(),
            runtime_enabled=True,
            now=lambda: NOW,
        )
        request = _request(
            self.authority_a,
            _upload(self.authority_a, key=DEVICE_A),
        )
        generated = {
            "contract": "supermega.connected-site-wire-golden.v1",
            "authorityResponse": service.authority(
                principal=self.principal,
                workspace_id="workspace-a",
                site_id="site-a",
            ),
            "reconcileRequest": request,
            "reconcileResponse": service.reconcile(
                principal=self.principal,
                request=request,
            ),
        }
        authority_response = generated["authorityResponse"]
        checkpoint = json.loads(authority_response["authorityCheckpointBytes"])
        self.assertEqual(
            checkpoint["checkpointDigest"],
            authority_response["authorityCheckpointDigest"],
        )
        self.assertEqual(checkpoint["deviceId"], self.principal.device_id)
        self.assertEqual(checkpoint["lastAuthoritySequence"], 1)
        fixture = Path(
            "mobile/shop_pos/test/fixtures/connected_site_cloud_wire_v1.json"
        ).read_text(encoding="utf-8").rstrip("\n")
        self.assertEqual(canonical_json(generated), fixture)

    def test_cross_runtime_full_chain_checkpoint_golden_is_byte_exact(self) -> None:
        authority = _authority(
            "workspace-a",
            "site-a",
            "device-a",
            DEVICE_A,
            authority_sequence=4,
        )
        service = ConnectedSiteRuntimeService(
            authority_provider=_Authorities(authority),
            repository=MemoryConnectedSiteRepository(),
            runtime_enabled=True,
            now=lambda: NOW,
        )
        generated = service.authority(
            principal=self.principal,
            workspace_id="workspace-a",
            site_id="site-a",
        )
        fixture = Path(
            "mobile/shop_pos/test/fixtures/connected_site_authority_bootstrap_v1.json"
        ).read_text(encoding="utf-8").rstrip("\n")
        self.assertEqual(canonical_json(generated), fixture)

    def test_accept_replay_and_conflict_are_explicit_and_idempotent(self) -> None:
        client = self.client()
        first = _upload(self.authority_a, key=DEVICE_A)
        accepted = client.post(
            "/api/connected-site/v1/reconcile",
            json=_request(self.authority_a, first),
        )
        self.assertEqual(accepted.status_code, 200, accepted.text)
        self.assertEqual(accepted.json()["acknowledgements"][0]["state"], "accepted")
        self.assertEqual(accepted.json()["conflicts"], [])
        self.assertEqual(
            accepted.json()["authorityPayloadDigest"],
            self.authority_a.authority_payload_digest,
        )
        self.assertNotIn("cloudProof", accepted.text)
        self.assertNotIn("totalMmk", accepted.text)

        replay = replace(first, cursor=2)
        replayed = client.post(
            "/api/connected-site/v1/reconcile",
            json=_request(self.authority_a, replay, after_cursor=1),
        )
        self.assertEqual(replayed.status_code, 200, replayed.text)
        self.assertEqual(replayed.json()["acknowledgements"][0]["state"], "replayed")
        self.assertEqual(len(self.repository.events), 1)

        conflict_upload = _upload(
            self.authority_a,
            key=DEVICE_A,
            cursor=3,
            command_id="command-2",
            expected_version=0,
        )
        conflict = client.post(
            "/api/connected-site/v1/reconcile",
            json=_request(self.authority_a, conflict_upload, after_cursor=2),
        )
        self.assertEqual(conflict.status_code, 200, conflict.text)
        self.assertEqual(conflict.json()["acknowledgements"], [])
        decision = conflict.json()["conflicts"][0]
        self.assertEqual(decision["state"], "quarantined")
        self.assertEqual(decision["reason"], "aggregate_version_conflict")
        self.assertEqual(decision["conflictId"], "conflict:command-2")
        self.assertEqual(decision["aggregateId"], "basket-1")
        self.assertEqual(len(self.repository.events), 1)

        replay_conflict = replace(conflict_upload, cursor=4)
        replayed_conflict = client.post(
            "/api/connected-site/v1/reconcile",
            json=_request(self.authority_a, replay_conflict, after_cursor=3),
        )
        self.assertEqual(replayed_conflict.status_code, 200, replayed_conflict.text)
        self.assertEqual(replayed_conflict.json()["conflicts"], [decision])
        self.assertEqual(len(self.repository.events), 1)

    def test_reused_command_with_altered_digest_fails_without_effect(self) -> None:
        client = self.client()
        first = _upload(self.authority_a, key=DEVICE_A)
        self.assertEqual(client.post(
            "/api/connected-site/v1/reconcile",
            json=_request(self.authority_a, first),
        ).status_code, 200)
        altered = _upload(
            self.authority_a,
            key=DEVICE_A,
            cursor=2,
            command_id="command-1",
            aggregate_id="basket-substituted",
        )
        response = client.post(
            "/api/connected-site/v1/reconcile",
            json=_request(self.authority_a, altered, after_cursor=1),
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"]["error"], "command_id_digest_conflict")
        self.assertEqual(len(self.repository.events), 1)

    def test_authenticated_principal_is_bound_to_tenant_site_and_device(self) -> None:
        upload_b = _upload(self.authority_b, key=DEVICE_B)
        cross_tenant = self.client().post(
            "/api/connected-site/v1/reconcile",
            json=_request(self.authority_b, upload_b),
        )
        self.assertEqual(cross_tenant.status_code, 403)
        self.assertEqual(cross_tenant.json()["detail"]["error"], "principal_scope")
        request = _request(self.authority_a, _upload(self.authority_a, key=DEVICE_A))
        request["deviceId"] = "device-b"
        wrong_device = self.client().post("/api/connected-site/v1/reconcile", json=request)
        self.assertEqual(wrong_device.status_code, 403)
        self.assertEqual(wrong_device.json()["detail"]["error"], "device_scope")

    def test_current_revocation_generation_is_revalidated_on_every_request(self) -> None:
        request = _request(self.authority_a, _upload(self.authority_a, key=DEVICE_A))
        request["revocationGeneration"] = 2
        response = self.client().post("/api/connected-site/v1/reconcile", json=request)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["detail"]["error"], "revocation_generation")
        self.assertEqual(self.repository.events, [])

    def test_raw_bearer_and_sensitive_payload_keys_are_rejected_without_echo(self) -> None:
        request = _request(self.authority_a, _upload(self.authority_a, key=DEVICE_A))
        bearer = self.client().post(
            "/api/connected-site/v1/reconcile",
            json=request,
            headers={
                "authorization": "".join(
                    ("Bearer", " ", "synthetic-value-that-must-not-echo")
                )
            },
        )
        self.assertEqual(bearer.status_code, 400)
        self.assertNotIn("synthetic-value", bearer.text)

        request["events"][0]["cloudProof"]["rawSupabaseToken"] = "sensitive-value"  # type: ignore[index]
        sensitive = self.client().post("/api/connected-site/v1/reconcile", json=request)
        self.assertEqual(sensitive.status_code, 400)
        self.assertNotIn("sensitive-value", sensitive.text)

    def test_duplicate_json_keys_malformed_json_and_oversize_fail_closed(self) -> None:
        duplicate = self.client().post(
            "/api/connected-site/v1/reconcile",
            content=b'{"contract":"one","contract":"two"}',
            headers={"content-type": "application/json"},
        )
        self.assertEqual(duplicate.status_code, 400)
        malformed = self.client().post(
            "/api/connected-site/v1/reconcile",
            content=b'{',
            headers={"content-type": "application/json"},
        )
        self.assertEqual(malformed.status_code, 400)
        oversize = self.client(max_body_bytes=1024).post(
            "/api/connected-site/v1/reconcile",
            content=json.dumps({"padding": "x" * 1200}),
            headers={"content-type": "application/json"},
        )
        self.assertEqual(oversize.status_code, 413)

    def test_chunked_body_without_declared_length_stops_at_cumulative_cap(self) -> None:
        messages = [
            {"type": "http.request", "body": b"x" * 700, "more_body": True},
            {"type": "http.request", "body": b"y" * 400, "more_body": True},
            {"type": "http.request", "body": b"must-not-be-read", "more_body": False},
        ]
        reads = 0

        async def receive():
            nonlocal reads
            reads += 1
            return messages.pop(0)

        request = Request(
            {"type": "http", "method": "POST", "path": "/", "headers": []},
            receive,
        )
        with self.assertRaises(HTTPException) as caught:
            asyncio.run(_read_bounded_body(request, max_body_bytes=1024))
        self.assertEqual(caught.exception.status_code, 413)
        self.assertEqual(reads, 2)
        self.assertEqual(len(messages), 1)

    def test_disconnected_partial_stream_is_rejected_without_returning_prefix(self) -> None:
        messages = [
            {"type": "http.request", "body": b'{"partial":', "more_body": True},
            {"type": "http.disconnect"},
        ]

        async def receive():
            return messages.pop(0)

        request = Request(
            {"type": "http", "method": "POST", "path": "/", "headers": []},
            receive,
        )
        with self.assertRaises(HTTPException) as caught:
            asyncio.run(_read_bounded_body(request, max_body_bytes=1024))
        self.assertEqual(caught.exception.status_code, 400)
        self.assertEqual(caught.exception.detail["error"], "request_stream_incomplete")

    def test_authority_refresh_returns_only_public_bound_evidence(self) -> None:
        response = self.client().get(
            "/api/connected-site/v1/workspaces/workspace-a/sites/site-a/authority"
        )
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["workspaceId"], "workspace-a")
        self.assertEqual(payload["deviceId"], "device-a")
        self.assertEqual(payload["revocationGeneration"], 3)
        self.assertEqual(
            payload["authorityGeneration"], self.authority_a.authority_generation
        )
        self.assertEqual(
            payload["authorityPayloadBytes"],
            json.dumps(
                self.authority_a.authority_payload,
                ensure_ascii=False,
                separators=(",", ":"),
                sort_keys=True,
            ),
        )
        checkpoint = json.loads(payload["authorityCheckpointBytes"])
        self.assertEqual(checkpoint["deviceId"], "device-a")
        self.assertEqual(
            checkpoint["checkpointDigest"],
            payload["authorityCheckpointDigest"],
        )
        self.assertEqual(checkpoint["lastAuthoritySequence"], 1)
        self.assertNotIn("private", response.text.casefold())
        self.assertNotIn("password", response.text.casefold())
        self.assertEqual(response.headers["cache-control"], "no-store")

    def test_authority_refresh_fails_closed_without_signed_device_checkpoint(self) -> None:
        self.authorities.values[("workspace-a", "site-a")] = replace(
            self.authority_a,
            authority_checkpoints={},
        )
        response = self.client().get(
            "/api/connected-site/v1/workspaces/workspace-a/sites/site-a/authority"
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json()["detail"]["error"],
            "authority_checkpoint_unavailable",
        )

    def test_reconcile_binds_exact_refreshed_authority_snapshot(self) -> None:
        request = _request(self.authority_a, _upload(self.authority_a, key=DEVICE_A))
        request["authorityPayloadDigest"] = "f" * 64
        response = self.client().post("/api/connected-site/v1/reconcile", json=request)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["detail"]["error"], "authority_generation")
        self.assertEqual(self.repository.events, [])


if __name__ == "__main__":
    unittest.main()
