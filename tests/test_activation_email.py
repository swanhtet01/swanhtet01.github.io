"""The welcome sender never raises and never sends without configuration.

Offline: the network layer is monkeypatched; a real request in these tests is
a bug. The contract under test is exactly what the activation route relies on:
returns a bool, swallows every provider failure, refuses to build a request
without a key and a plausible recipient, and derives a deterministic
idempotency key from the workspace id.
"""

from __future__ import annotations

import io
import json
import os
import unittest
from unittest.mock import patch
from urllib.error import URLError

import supermega_runtime.activation_email as activation_email


class _RecordingOpener:
    def __init__(self, status: int = 200, error: Exception | None = None) -> None:
        self.status = status
        self.error = error
        self.requests: list[object] = []

    def open(self, request, timeout=None):  # noqa: ANN001 - urllib duck type
        self.requests.append(request)
        if self.error is not None:
            raise self.error

        opener = self

        class _Response(io.BytesIO):
            status = opener.status

            def __enter__(self):  # noqa: ANN204
                return self

            def __exit__(self, *args):  # noqa: ANN002
                return False

        return _Response(b"{}")


def _send(**overrides):
    arguments = {
        "to_email": "owner@example.invalid",
        "business_name": "Yangon Tyre and Service",
        "workspace_id": "6a1f0f70-1234-4c56-8def-abc123456789",
        "claim_code": "SM-ABCD-2345",
    }
    arguments.update(overrides)
    return activation_email.send_self_serve_welcome_email(**arguments)


class ActivationEmailTests(unittest.TestCase):
    def _patched(self, opener: _RecordingOpener, environment: dict[str, str]):
        return (
            patch.dict(os.environ, environment, clear=True),
            patch.object(activation_email, "build_opener", lambda *handlers: opener),
        )

    def test_missing_key_or_recipient_short_circuits_without_network(self) -> None:
        opener = _RecordingOpener()
        env_patch, opener_patch = self._patched(opener, {})
        with env_patch, opener_patch:
            self.assertFalse(_send())
        env_patch, opener_patch = self._patched(opener, {"RESEND_API_KEY": "re_test_key"})
        with env_patch, opener_patch:
            self.assertFalse(_send(to_email=""))
            self.assertFalse(_send(to_email="not-an-address"))
        self.assertEqual(opener.requests, [])

    def test_accepted_send_returns_true_with_deterministic_idempotency(self) -> None:
        opener = _RecordingOpener(status=200)
        env_patch, opener_patch = self._patched(opener, {"RESEND_API_KEY": "re_test_key"})
        with env_patch, opener_patch:
            self.assertTrue(_send())
        self.assertEqual(len(opener.requests), 1)
        request = opener.requests[0]
        self.assertEqual(
            request.get_header("Idempotency-key"),
            "supermega-self-serve-welcome/6a1f0f70-1234-4c56-8def-abc123456789",
        )
        payload = json.loads(request.data.decode("utf-8"))
        self.assertEqual(payload["to"], ["owner@example.invalid"])
        self.assertIn("SM-ABCD-2345", payload["text"])
        self.assertIn("Yangon Tyre and Service", payload["subject"])
        # The courtesy email never carries secrets or session material.
        self.assertNotIn("Bearer", payload["text"])

    def test_provider_failure_returns_false_never_raises(self) -> None:
        opener = _RecordingOpener(error=URLError("connection refused"))
        env_patch, opener_patch = self._patched(opener, {"RESEND_API_KEY": "re_test_key"})
        with env_patch, opener_patch:
            self.assertFalse(_send())


if __name__ == "__main__":
    unittest.main()
