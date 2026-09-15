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
from email.message import Message
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from urllib.request import HTTPSHandler, ProxyHandler, Request, build_opener
from urllib.response import addinfourl

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
        self.assertNotIn("SM-ABCD-2345", json.dumps(payload))
        self.assertEqual(payload["subject"], "Company account created - Yangon Tyre and Service | SuperMega")
        # The courtesy email never carries secrets or session material.
        self.assertNotIn("Bearer", payload["text"])

    def test_welcome_has_one_sign_in_action_and_precise_status(self) -> None:
        text = activation_email._welcome_text("Example Shop")
        self.assertEqual(text.count("https://"), 1)
        self.assertIn("https://app.supermega.dev/login", text)
        self.assertIn("same account you used during setup", text)
        self.assertIn("companies assigned to that account", text)
        self.assertIn("does not import your browser-local sample records", text)
        self.assertIn("readiness are separate from account creation", text)
        self.assertIn("reply to this email for setup help", text)
        self.assertIn("Do not send passwords, sign-in codes or customer records", text)
        for retired_claim in ("is active", "claim code", "Next steps:", "any time", "only shared with people you invite"):
            self.assertNotIn(retired_claim, text)

    def test_recovery_uses_configured_reply_address(self) -> None:
        opener = _RecordingOpener()
        env_patch, opener_patch = self._patched(opener, {
            "RESEND_API_KEY": "re_test_key",
            "SUPERMEGA_CONTACT_NOTIFY_EMAIL": "setup@example.invalid",
        })
        with env_patch, opener_patch:
            self.assertTrue(_send(business_name="မြန်မာ ဆိုင်"))
        payload = json.loads(opener.requests[0].data.decode("utf-8"))
        self.assertEqual(payload["reply_to"], "setup@example.invalid")
        self.assertIn("မြန်မာ ဆိုင်", payload["text"])

    def test_provider_failure_returns_false_never_raises(self) -> None:
        opener = _RecordingOpener(error=URLError("connection refused"))
        env_patch, opener_patch = self._patched(opener, {"RESEND_API_KEY": "re_test_key"})
        with env_patch, opener_patch:
            self.assertFalse(_send())

    def test_transport_installs_redirect_denial_and_bounded_timeout(self) -> None:
        opener = _RecordingOpener()
        with patch.dict(os.environ, {"RESEND_API_KEY": "re_test_key"}, clear=True):
            with patch.object(activation_email, "build_opener", return_value=opener) as factory:
                with patch.object(opener, "open", wraps=opener.open) as send:
                    self.assertTrue(_send())
        handlers = factory.call_args.args
        self.assertTrue(any(isinstance(handler, ProxyHandler) and handler.proxies == {} for handler in handlers))
        self.assertTrue(any(isinstance(handler, activation_email._RefuseRedirects) for handler in handlers))
        self.assertEqual(send.call_args.kwargs["timeout"], 9.0)
        self.assertEqual(opener.requests[0].full_url, "https://api.resend.com/emails")
        self.assertEqual(opener.requests[0].get_method(), "POST")

    def test_redirect_handler_never_reissues_request(self) -> None:
        handler = activation_email._RefuseRedirects()
        request = Request("https://api.resend.com/emails", data=b"{}", method="POST")
        for code in (301, 302, 303, 307, 308):
            for target in ("https://other.example.invalid/emails", "https://api.resend.com/other", "http://api.resend.com/emails"):
                with self.subTest(code=code, target=target):
                    self.assertIsNone(handler.redirect_request(request, None, code, "redirect", {}, target))
                    # Full urllib error chain, with synthetic HTTPS transport:
                    # the default error handler raises after redirect denial.
                    calls = []

                    class SyntheticHTTPS(HTTPSHandler):
                        def https_open(self, req):
                            calls.append(req.full_url)
                            headers = Message()
                            headers["Location"] = target
                            response = addinfourl(io.BytesIO(), headers, req.full_url, code)
                            response.msg = "redirect"
                            return response

                    offline_opener = build_opener(ProxyHandler({}), activation_email._RefuseRedirects(), SyntheticHTTPS())
                    with self.assertRaises(HTTPError) as failure:
                        offline_opener.open(request)
                    failure.exception.close()
                    self.assertEqual(calls, ["https://api.resend.com/emails"])

    def test_provider_rejection_and_transport_setup_failure_are_nonfatal(self) -> None:
        for status in (301, 400, 401, 429, 500):
            with self.subTest(status=status):
                opener = _RecordingOpener(status=status)
                env_patch, opener_patch = self._patched(opener, {"RESEND_API_KEY": "re_test_key"})
                with env_patch, opener_patch:
                    self.assertFalse(_send())
                self.assertEqual(len(opener.requests), 1)
        with patch.dict(os.environ, {"RESEND_API_KEY": "re_test_key"}, clear=True):
            with patch.object(activation_email, "build_opener", side_effect=OSError("unavailable")):
                self.assertFalse(_send())


if __name__ == "__main__":
    unittest.main()
