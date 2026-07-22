from __future__ import annotations

import hashlib
import hmac
import os
import time
import unittest
from contextlib import contextmanager
from collections.abc import Iterator
from unittest.mock import patch

from fastapi.testclient import TestClient

from supermega_runtime.runtime import create_app, reduce_trial_state
from supermega_runtime.trial_store import TrialValidationError


STRONG_TEST_IDENTITY_SECRET = "mN7!qP2#vR9$kT4@xC8&dF5*zH1_wS6+"


class CanonicalRuntimeTests(unittest.TestCase):
    @contextmanager
    def _client(self, **environment: str) -> Iterator[TestClient]:
        controlled = {
            "SUPERMEGA_DATABASE_URL": "",
            "SUPERMEGA_TRIAL_IDENTITY_SECRET": "",
            "SUPERMEGA_TRIAL_WRITES_ENABLED": "false",
            **environment,
        }
        with patch.dict(os.environ, controlled, clear=False):
            with TestClient(create_app()) as client:
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
        self.assertFalse(body["trial_backend"]["browser_service_role_exposed"])
        self.assertGreater(len(body["enterprise_activation"]["requirements"]), 0)
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")

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
