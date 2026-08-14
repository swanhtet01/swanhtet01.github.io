from __future__ import annotations

import hashlib
import hmac
import os
import time
import unittest
from contextlib import contextmanager
from collections.abc import Iterator, Sequence
from unittest.mock import patch

from fastapi.testclient import TestClient

from supermega_runtime.order_intake import (
    OrderIntakeCatalogItem,
    OrderIntakeModelExtraction,
    build_order_intake_draft,
)
from supermega_runtime.runtime import create_app, reduce_trial_state
from supermega_runtime.supabase_auth import VerifiedSupabaseUser
from supermega_runtime.trial_store import (
    ManagedWorkspaceAccess,
    TrialNotReadyError,
    TrialPrincipal,
    TrialValidationError,
)


STRONG_TEST_IDENTITY_SECRET = "mN7!qP2#vR9$kT4@xC8&dF5*zH1_wS6+"
LOCAL_ORDER_MESSAGE = "May wants 2 SM-1001 through Messenger and will pay KBZPay."


class FakeLocalOrderIntakeProvider:
    provider_id = "ollama-local"

    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    async def generate(
        self,
        *,
        message: str,
        catalog: Sequence[OrderIntakeCatalogItem],
        workspace_id: str,
        actor_id: str,
    ):
        self.calls.append(
            {
                "message": message,
                "catalog": list(catalog),
                "workspace_id": workspace_id,
                "actor_id": actor_id,
            }
        )
        extraction = OrderIntakeModelExtraction.model_validate(
            {
                "scope": "single_item_order",
                "customer_reference": "May",
                "channel": "messenger",
                "sku": "SM-1001",
                "quantity": 2,
                "payment": "kbzpay",
                "fulfilment": None,
                "uncertain_fields": [],
                "provenance": [
                    {"field": "customer_reference", "source_quotes": [{"quote": "May", "occurrence": 1}]},
                    {"field": "channel", "source_quotes": [{"quote": "Messenger", "occurrence": 1}]},
                    {"field": "sku", "source_quotes": [{"quote": "SM-1001", "occurrence": 1}]},
                    {"field": "quantity", "source_quotes": [{"quote": "2", "occurrence": 1}]},
                    {"field": "payment", "source_quotes": [{"quote": "KBZPay", "occurrence": 1}]},
                ],
            }
        )
        return build_order_intake_draft(
            message=message,
            catalog=list(catalog),
            extraction=extraction,
            response_id="local-route-test",
            model="llama3.2:1b",
            provider="ollama-local",
        )


class CanonicalRuntimeTests(unittest.TestCase):
    @contextmanager
    def _client(
        self,
        *,
        base_url: str = "http://testserver",
        client_host: str = "testclient",
        **environment: str,
    ) -> Iterator[TestClient]:
        controlled = {
            "SUPERMEGA_DATABASE_URL": "",
            "SUPERMEGA_TRIAL_IDENTITY_SECRET": "",
            "SUPERMEGA_TRIAL_WRITES_ENABLED": "false",
            "SUPERMEGA_SUPABASE_URL": "",
            "SUPABASE_URL": "",
            "SUPERMEGA_SUPABASE_PUBLISHABLE_KEY": "",
            "SUPABASE_PUBLISHABLE_KEY": "",
            "SUPABASE_ANON_KEY": "",
            "VITE_SUPABASE_URL": "",
            "VITE_SUPABASE_PUBLISHABLE_KEY": "",
            "VITE_SUPABASE_ANON_KEY": "",
            "SUPERMEGA_CORS_ORIGINS": "",
            "SUPERMEGA_AI_PROVIDER_POLICY": "local-only",
            "SUPERMEGA_OLLAMA_ENABLED": "0",
            "SUPERMEGA_OLLAMA_MODEL": "",
            **environment,
        }
        with patch.dict(os.environ, controlled, clear=False):
            with TestClient(
                create_app(),
                base_url=base_url,
                client=(client_host, 50_000),
            ) as client:
                yield client

    def test_health_is_available_without_claiming_managed_readiness(self) -> None:
        with self._client() as client:
            response = client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "ready")
        self.assertEqual(body["service"], "supermega-service")
        self.assertEqual(body["operating_mode"], "isolated_demo")
        self.assertFalse(body["enterprise_db_ready"])
        self.assertFalse(body["security_ready"])
        self.assertFalse(body["authentication"]["supabase_user_tokens_ready"])
        self.assertFalse(body["authentication"]["anonymous_users_allowed"])
        self.assertTrue(body["browser_origin_policy"]["strict_exact_origins"])
        self.assertEqual(body["browser_origin_policy"]["configured_origin_count"], 3)
        self.assertFalse(body["browser_origin_policy"]["wildcards_allowed"])
        self.assertFalse(body["browser_origin_policy"]["insecure_remote_origins_allowed"])
        self.assertFalse(body["trial_backend"]["browser_service_role_exposed"])
        self.assertGreater(len(body["enterprise_activation"]["requirements"]), 0)
        manifest = body["enterprise_activation"]["manifest"]
        self.assertEqual(manifest["contract"], "supermega.activation_manifest.v1")
        self.assertEqual(manifest["mode"], "isolated_demo")
        self.assertIsInstance(manifest["ready_percent"], int)
        self.assertIn("database", manifest["blocked_gate_ids"])
        self.assertIn("browser_local_trial", manifest["safe_enable"])
        self.assertIn("evidence_export", manifest["safe_enable"])
        self.assertNotIn("managed_trial_writes", manifest["safe_enable"])
        self.assertIn("postgres17_rehearsal", manifest["proof_commands"])
        self.assertFalse(manifest["secret_values_exposed"])
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")

    def test_cors_accepts_only_exact_https_or_explicit_loopback_origins(self) -> None:
        configured = "https://tenant.example.com,http://127.0.0.1:5173"
        with self._client(SUPERMEGA_CORS_ORIGINS=configured) as client:
            response = client.options(
                "/api/health",
                headers={
                    "origin": "https://tenant.example.com",
                    "access-control-request-method": "GET",
                },
            )
            health = client.get("/api/health").json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["access-control-allow-origin"], "https://tenant.example.com")
        self.assertEqual(health["browser_origin_policy"]["configured_origin_count"], 2)

    def test_cors_configuration_fails_closed_before_startup(self) -> None:
        invalid_values = (
            "*",
            "null",
            "http://tenant.example.com",
            "https://user:password@tenant.example.com",
            "https://tenant.example.com/path",
            "https://tenant.example.com?workspace=a",
            "https://tenant.example.com#fragment",
            "https://tenant.example.com,,https://app.supermega.dev",
            "https://tenant..example.com",
        )
        for value in invalid_values:
            with self.subTest(value=value):
                with patch.dict(os.environ, {"SUPERMEGA_CORS_ORIGINS": value}, clear=False):
                    with self.assertRaisesRegex(ValueError, "SUPERMEGA_CORS_ORIGINS"):
                        create_app()

    def test_local_order_intake_is_loopback_origin_bound_and_non_mutating(self) -> None:
        origin = "http://127.0.0.1:5190"
        payload = {
            "source_label": "MSG-DEMO-001",
            "message": LOCAL_ORDER_MESSAGE,
            "catalog": [
                {
                    "sku": "SM-1001",
                    "name": "Classic Tee",
                    "variant": "Black / M",
                    "on_hand": 12,
                    "unit_price_mmk": 25_000,
                }
            ],
        }
        provider = FakeLocalOrderIntakeProvider()
        with patch(
            "supermega_runtime.runtime.configured_order_intake_provider",
            return_value=provider,
        ):
            with self._client(
                base_url="http://127.0.0.1:8790",
                client_host="127.0.0.1",
                SUPERMEGA_CORS_ORIGINS=origin,
            ) as client:
                health = client.get("/api/health").json()
                missing_review_header = client.post(
                    "/api/local/v1/commerce/order-intake/drafts",
                    headers={"origin": origin},
                    json=payload,
                )
                invalid_catalog = client.post(
                    "/api/local/v1/commerce/order-intake/drafts",
                    headers={
                        "origin": origin,
                        "x-supermega-local-review": "order-intake-v1",
                    },
                    json={**payload, "catalog": [{**payload["catalog"][0], "unexpected": True}]},
                )
                response = client.post(
                    "/api/local/v1/commerce/order-intake/drafts",
                    headers={
                        "origin": origin,
                        "x-supermega-local-review": "order-intake-v1",
                    },
                    json=payload,
                )

        self.assertTrue(health["ai"]["local_order_intake_review_enabled"])
        self.assertFalse(health["ai"]["operational_actions_allowed"])
        self.assertEqual(missing_review_header.status_code, 404)
        self.assertEqual(invalid_catalog.status_code, 422)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["draft"]["generation"]["provider"], "ollama-local")
        self.assertEqual(
            response.json()["source_label_digest"],
            f"sha256:{hashlib.sha256(payload['source_label'].encode()).hexdigest()}",
        )
        self.assertFalse(response.json()["raw_message_retained"])
        self.assertEqual(response.json()["operational_actions_performed"], 0)
        self.assertFalse(response.json()["external_writes_performed"])
        self.assertEqual(len(provider.calls), 1)
        self.assertEqual(provider.calls[0]["workspace_id"], "local-demo-shop")
        self.assertEqual(provider.calls[0]["actor_id"], "local-human-review")

        with patch(
            "supermega_runtime.runtime.configured_order_intake_provider",
            return_value=FakeLocalOrderIntakeProvider(),
        ):
            with self._client(
                base_url="http://127.0.0.1:8790",
                client_host="10.0.0.8",
                SUPERMEGA_CORS_ORIGINS=origin,
            ) as remote_client:
                remote = remote_client.post(
                    "/api/local/v1/commerce/order-intake/drafts",
                    headers={
                        "origin": origin,
                        "x-supermega-local-review": "order-intake-v1",
                    },
                    json=payload,
                )
            with self._client(
                base_url="http://127.0.0.1:8790",
                client_host="127.0.0.1",
                SUPERMEGA_CORS_ORIGINS=origin,
                SUPERMEGA_TRIAL_WRITES_ENABLED="true",
            ) as write_client:
                write_health = write_client.get("/api/health").json()
                write_enabled = write_client.post(
                    "/api/local/v1/commerce/order-intake/drafts",
                    headers={
                        "origin": origin,
                        "x-supermega-local-review": "order-intake-v1",
                    },
                    json=payload,
                )
        self.assertEqual(remote.status_code, 404)
        self.assertFalse(write_health["ai"]["local_order_intake_review_enabled"])
        self.assertEqual(write_enabled.status_code, 404)

    def test_trial_identity_fails_closed_without_a_valid_gateway_signature(self) -> None:
        with self._client(SUPERMEGA_TRIAL_IDENTITY_SECRET=STRONG_TEST_IDENTITY_SECRET) as client:
            unsigned = client.get("/api/trial/v1/readiness")
            self.assertEqual(unsigned.status_code, 401)
            self.assertEqual(unsigned.json()["detail"]["code"], "trial_auth_required")

            timestamp = str(int(time.time()))
            old_message = f"v1\n{timestamp}\nworkspace-a\nactor-a".encode()
            old_signature = hmac.new(
                STRONG_TEST_IDENTITY_SECRET.encode(),
                old_message,
                hashlib.sha256,
            ).hexdigest()
            old_signed = client.get(
                "/api/trial/v1/readiness",
                headers={
                    "x-supermega-workspace-id": "workspace-a",
                    "x-supermega-actor-id": "actor-a",
                    "x-supermega-actor-kind": "human",
                    "x-supermega-identity-timestamp": timestamp,
                    "x-supermega-identity-signature": old_signature,
                },
            )
            self.assertEqual(old_signed.status_code, 401)

            message = f"v2\n{timestamp}\nworkspace-a\nactor-a\nhuman".encode()
            signature = hmac.new(
                STRONG_TEST_IDENTITY_SECRET.encode(),
                message,
                hashlib.sha256,
            ).hexdigest()
            signed = client.get(
                "/api/trial/v1/readiness",
                headers={
                    "x-supermega-workspace-id": "workspace-a",
                    "x-supermega-actor-id": "actor-a",
                    "x-supermega-actor-kind": "human",
                    "x-supermega-identity-timestamp": timestamp,
                    "x-supermega-identity-signature": signature,
                },
            )
        self.assertEqual(signed.status_code, 200)
        self.assertEqual(signed.json()["status"], "blocked")
        self.assertIn("database_ready", signed.json()["blockers"])

    def test_verified_supabase_user_token_resolves_only_a_human_actor(self) -> None:
        environment = {
            "SUPERMEGA_SUPABASE_URL": "https://example.supabase.co",
            "SUPERMEGA_SUPABASE_PUBLISHABLE_KEY": "sb_publishable_abcdefghijklmnopqrstuvwxyz",
        }
        with patch(
            "supermega_runtime.runtime.verify_supabase_user_identity",
            return_value=VerifiedSupabaseUser(
                "2f8d24d8-308c-4dc8-a352-7b61df756728",
                "d8aaab28-a5a7-4a0d-9d75-7a6265a969c3",
            ),
        ) as verify:
            with self._client(**environment) as client:
                health = client.get("/api/health")
                response = client.get(
                    "/api/trial/v1/readiness",
                    headers={
                        "authorization": "Bearer header.payload.signature",
                        "x-supermega-workspace-id": "workspace-a",
                        "x-supermega-actor-id": "spoofed-service",
                        "x-supermega-actor-kind": "service",
                    },
                )
        self.assertTrue(health.json()["security_ready"])
        self.assertTrue(health.json()["authentication"]["supabase_user_tokens_ready"])
        self.assertEqual(response.status_code, 200)
        self.assertIn("database_ready", response.json()["blockers"])
        verify.assert_called_once()

    def test_named_user_discovers_only_bounded_active_workspace_summaries(self) -> None:
        environment = {
            "SUPERMEGA_SUPABASE_URL": "https://example.supabase.co",
            "SUPERMEGA_SUPABASE_PUBLISHABLE_KEY": "sb_publishable_abcdefghijklmnopqrstuvwxyz",
        }
        with patch(
            "supermega_runtime.runtime.verify_supabase_user_identity",
            return_value=VerifiedSupabaseUser(
                "2f8d24d8-308c-4dc8-a352-7b61df756728",
                "d8aaab28-a5a7-4a0d-9d75-7a6265a969c3",
            ),
        ) as verify, patch(
            "supermega_runtime.trial_store.PostgresTrialStore.list_actor_workspaces",
            return_value=([ManagedWorkspaceAccess("company-a", "Mingalar Fresh Mart", "owner")], False),
        ) as discover:
            with self._client(**environment) as client:
                response = client.get(
                    "/api/trial/v1/workspaces",
                    headers={
                        "authorization": "Bearer header.payload.signature",
                        "x-supermega-workspace-id": "spoofed-company",
                        "x-supermega-actor-id": "spoofed-service",
                        "x-supermega-actor-kind": "service",
                    },
                )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "contract": "supermega.managed_workspace_directory.v1",
                "status": "ready",
                "workspaces": [
                    {"workspace_id": "company-a", "label": "Mingalar Fresh Mart", "access": "owner"}
                ],
                "truncated": False,
                "external_writes_performed": False,
                "secret_values_exposed": False,
            },
        )
        verify.assert_called_once()
        discover.assert_called_once_with(
            TrialPrincipal(
                workspace_id="workspace-discovery",
                actor_id="2f8d24d8-308c-4dc8-a352-7b61df756728",
                actor_kind="human",
                authenticated=True,
                session_id="d8aaab28-a5a7-4a0d-9d75-7a6265a969c3",
                identity_provider="supabase",
            ),
            limit=50,
        )

    def test_workspace_directory_rejects_gateway_headers_and_fails_closed(self) -> None:
        with self._client(SUPERMEGA_TRIAL_IDENTITY_SECRET=STRONG_TEST_IDENTITY_SECRET) as client:
            gateway_only = client.get(
                "/api/trial/v1/workspaces",
                headers={
                    "x-supermega-workspace-id": "company-a",
                    "x-supermega-actor-id": "owner-a",
                    "x-supermega-actor-kind": "human",
                },
            )
        self.assertEqual(gateway_only.status_code, 401)
        self.assertEqual(gateway_only.json()["detail"]["code"], "managed_auth_required")

        environment = {
            "SUPERMEGA_SUPABASE_URL": "https://example.supabase.co",
            "SUPERMEGA_SUPABASE_PUBLISHABLE_KEY": "sb_publishable_abcdefghijklmnopqrstuvwxyz",
        }
        with patch(
            "supermega_runtime.runtime.verify_supabase_user_identity",
            return_value=VerifiedSupabaseUser(
                "2f8d24d8-308c-4dc8-a352-7b61df756728",
                "d8aaab28-a5a7-4a0d-9d75-7a6265a969c3",
            ),
        ), patch(
            "supermega_runtime.trial_store.PostgresTrialStore.list_actor_workspaces",
            side_effect=TrialNotReadyError(("schema_ready",)),
        ):
            with self._client(**environment) as client:
                blocked = client.get(
                    "/api/trial/v1/workspaces",
                    headers={"authorization": "Bearer header.payload.signature"},
                )
        self.assertEqual(blocked.status_code, 503)
        self.assertEqual(blocked.json()["detail"]["code"], "workspace_directory_not_ready")
        self.assertEqual(blocked.json()["detail"]["blockers"], ["schema_ready"])

    def test_invalid_supabase_token_or_workspace_fails_closed(self) -> None:
        environment = {
            "SUPERMEGA_SUPABASE_URL": "https://example.supabase.co",
            "SUPERMEGA_SUPABASE_PUBLISHABLE_KEY": "sb_publishable_abcdefghijklmnopqrstuvwxyz",
        }
        with patch("supermega_runtime.runtime.verify_supabase_user_identity", return_value=None):
            with self._client(**environment) as client:
                rejected_token = client.get(
                    "/api/trial/v1/readiness",
                    headers={
                        "authorization": "Bearer header.payload.signature",
                        "x-supermega-workspace-id": "workspace-a",
                    },
                )
                rejected_workspace = client.get(
                    "/api/trial/v1/readiness",
                    headers={
                        "authorization": "Bearer header.payload.signature",
                        "x-supermega-workspace-id": "../../workspace-a",
                    },
                )
        self.assertEqual(rejected_token.status_code, 401)
        self.assertEqual(rejected_workspace.status_code, 401)

    def test_weak_or_placeholder_identity_secret_never_enables_security(self) -> None:
        weak_secrets = (
            "short-secret",
            "a" * 64,
            "replace-me-with-a-generated-production-secret-1234567890",
        )
        for secret in weak_secrets:
            with self.subTest(secret=secret[:12]):
                timestamp = str(int(time.time()))
                message = f"v2\n{timestamp}\nworkspace-a\nactor-a\nhuman".encode()
                signature = hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
                with self._client(SUPERMEGA_TRIAL_IDENTITY_SECRET=secret) as client:
                    health = client.get("/api/health")
                    signed = client.get(
                        "/api/trial/v1/readiness",
                        headers={
                            "x-supermega-workspace-id": "workspace-a",
                            "x-supermega-actor-id": "actor-a",
                            "x-supermega-actor-kind": "human",
                            "x-supermega-identity-timestamp": timestamp,
                            "x-supermega-identity-signature": signature,
                        },
                    )
                self.assertFalse(health.json()["security_ready"])
                self.assertTrue(
                    any(
                        "high-entropy" in requirement
                        for requirement in health.json()["enterprise_activation"]["requirements"]
                    )
                )
                self.assertEqual(signed.status_code, 401)

    def test_reducer_allows_only_bounded_surface_snapshots(self) -> None:
        state = {"tasks": []}
        reduced = reduce_trial_state(
            "company",
            "company.snapshot.saved",
            {},
            {"state": state},
        )
        self.assertEqual(reduced, state)
        self.assertIsNot(reduced, state)

        with self.assertRaises(TrialValidationError):
            reduce_trial_state("company", "company.task.deleted", {}, {"state": state})
        with self.assertRaises(TrialValidationError):
            reduce_trial_state(
                "commerce",
                "commerce.snapshot.saved",
                {},
                {"state": {"items": []}},
            )


if __name__ == "__main__":
    unittest.main()
