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
        with self._client(SUPERMEGA_TRIAL_IDENTITY_SECRET="test-secret") as client:
            unsigned = client.get("/api/trial/v1/readiness")
            self.assertEqual(unsigned.status_code, 401)
            self.assertEqual(unsigned.json()["detail"]["code"], "trial_auth_required")

            timestamp = str(int(time.time()))
            message = f"v1\n{timestamp}\nworkspace-a\nactor-a".encode()
            signature = hmac.new(b"test-secret", message, hashlib.sha256).hexdigest()
            signed = client.get(
                "/api/trial/v1/readiness",
                headers={
                    "x-supermega-workspace-id": "workspace-a",
                    "x-supermega-actor-id": "actor-a",
                    "x-supermega-identity-timestamp": timestamp,
                    "x-supermega-identity-signature": signature,
                },
            )
        self.assertEqual(signed.status_code, 200)
        self.assertEqual(signed.json()["status"], "blocked")
        self.assertIn("database_ready", signed.json()["blockers"])

    def test_reducer_allows_only_bounded_surface_snapshots(self) -> None:
        state = {"tasks": []}
        reduced = reduce_trial_state(
            "command",
            "command.snapshot.saved",
            {},
            {"state": state},
        )
        self.assertEqual(reduced, state)
        self.assertIsNot(reduced, state)

        with self.assertRaises(TrialValidationError):
            reduce_trial_state("command", "command.task.deleted", {}, {"state": state})
        with self.assertRaises(TrialValidationError):
            reduce_trial_state("shop", "shop.snapshot.saved", {}, {"state": {"items": []}})


if __name__ == "__main__":
    unittest.main()
