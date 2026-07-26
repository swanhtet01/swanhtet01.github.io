from __future__ import annotations

import json
import os
import unittest
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timezone
from io import StringIO
from unittest.mock import patch

from tools import verify_private_storage_privacy as verifier


class PrivateStoragePrivacyTests(unittest.TestCase):
    now = datetime(2030, 1, 1, tzinfo=timezone.utc)

    def setUp(self) -> None:
        self.environment = verifier._fixture_environment()
        self.config = verifier.load_config(self.environment, now=self.now)

    def run_fixture(
        self,
        responses: list[verifier.AuditResponse | verifier.PrivacyAuditError] | None = None,
    ) -> tuple[dict[str, object], verifier._FixtureTransport]:
        transport = verifier._FixtureTransport(
            verifier._fixture_responses(self.config) if responses is None else responses
        )
        report = verifier.PrivacyAuditSession(self.config, transport).run(captured_at=self.now)
        return report, transport

    def assert_fixture_error(
        self,
        code: str,
        responses: list[verifier.AuditResponse | verifier.PrivacyAuditError],
    ) -> None:
        with self.assertRaises(verifier.PrivacyAuditError) as raised:
            self.run_fixture(responses)
        self.assertEqual(raised.exception.code, code)

    def test_offline_self_test_is_network_free(self) -> None:
        result = verifier.run_self_test()
        self.assertTrue(result["ok"])
        self.assertGreaterEqual(result["cases"], 10)
        self.assertEqual(result["network_requests_performed"], 0)
        self.assertEqual(result["persistent_mutations_performed"], 0)

    def test_success_is_bounded_read_only_and_redacted(self) -> None:
        report, transport = self.run_fixture()
        self.assertTrue(report["ok"])
        self.assertEqual(report["contract"], verifier.CONTRACT)
        self.assertEqual(report["provider_requests_performed"], verifier.MAX_REQUESTS)
        self.assertEqual(report["http_post_requests_performed"], 4)
        self.assertEqual(report["persistent_mutations_performed"], 0)
        self.assertEqual([item[0] for item in transport.requests], ["POST", "POST", "POST", "GET", "POST", "HEAD"])
        serialized = json.dumps(report, sort_keys=True)
        for secret in (
            self.config.publishable_key,
            self.config.tenant_a_jwt,
            self.config.tenant_b_jwt,
            self.config.bucket,
            self.config.tenant_a_object,
            self.config.tenant_b_object,
            "fixture-signed-token",
        ):
            self.assertNotIn(secret, serialized)

    def test_configuration_preflight_is_network_free_redacted_and_cli_reachable(self) -> None:
        report = verifier.configuration_preflight(self.config, captured_at=self.now)
        self.assertTrue(report["ok"])
        self.assertEqual(report["mode"], "offline_configuration_preflight")
        self.assertEqual(report["network_requests_performed"], 0)
        self.assertEqual(report["persistent_mutations_performed"], 0)
        self.assertFalse(report["provider_credentials_verified"])
        serialized = json.dumps(report, sort_keys=True)
        for value in (
            self.config.publishable_key,
            self.config.tenant_a_jwt,
            self.config.tenant_b_jwt,
            self.config.bucket,
            self.config.tenant_a_object,
            self.config.tenant_b_object,
        ):
            self.assertNotIn(value, serialized)

        output = StringIO()
        with patch.dict(os.environ, self.environment, clear=True), redirect_stdout(output):
            self.assertEqual(verifier.main(["--preflight"]), 0)
        self.assertEqual(json.loads(output.getvalue())["network_requests_performed"], 0)

    def test_anonymous_listing_must_be_explicitly_denied(self) -> None:
        responses = verifier._fixture_responses(self.config)
        responses[0] = verifier._json_fixture({"folders": [], "hasNext": False, "objects": []})
        self.assert_fixture_error("anonymous_listing_not_denied", responses)

    def test_own_positive_control_is_required(self) -> None:
        responses = verifier._fixture_responses(self.config)
        responses[1] = verifier._json_fixture({"folders": [], "hasNext": False, "objects": []})
        self.assert_fixture_error("own_sentinel_not_visible", responses)

    def test_cross_tenant_listing_may_be_denied_or_empty_but_not_visible(self) -> None:
        report, _ = self.run_fixture()
        proof = next(item for item in report["proofs"] if item["id"] == "cross_tenant_listing_denied")
        self.assertEqual(proof["result"], "empty_filtered")

        denied = verifier._fixture_responses(self.config)
        denied[2] = verifier.AuditResponse(403, {})
        denied_report, _ = self.run_fixture(denied)
        denied_proof = next(
            item for item in denied_report["proofs"] if item["id"] == "cross_tenant_listing_denied"
        )
        self.assertEqual(denied_proof["result"], "denied")

        exposed = verifier._fixture_responses(self.config)
        exposed[2] = verifier._json_fixture(
            {"folders": [], "hasNext": False, "objects": [{"name": "b-sentinel.txt"}]}
        )
        self.assert_fixture_error("cross_tenant_listing_visible", exposed)

    def test_cross_tenant_object_must_not_be_readable(self) -> None:
        responses = verifier._fixture_responses(self.config)
        responses[3] = verifier.AuditResponse(206, {})
        self.assert_fixture_error("cross_tenant_object_visible", responses)

    def test_signed_url_is_exact_host_path_and_single_token(self) -> None:
        invalid_urls = [
            "https://evil.example/storage/v1/object/sign/private-fixture/tenant-b/b-sentinel.txt?token=x",
            "https://fixture-project.supabase.co/storage/v1/object/sign/private-fixture/tenant-a/a-sentinel.txt?token=x",
            "https://fixture-project.supabase.co/storage/v1/object/sign/private-fixture/tenant-b/b-sentinel.txt?token=x&next=evil",
            "https://user:pass@fixture-project.supabase.co/storage/v1/object/sign/private-fixture/tenant-b/b-sentinel.txt?token=x",
        ]
        for signed_url in invalid_urls:
            with self.subTest(signed_url=signed_url):
                responses = verifier._fixture_responses(self.config)
                responses[4] = verifier._json_fixture({"signedURL": signed_url})
                self.assert_fixture_error("signed_url_target_invalid", responses)

    def test_duplicate_and_oversized_json_fail_closed(self) -> None:
        duplicate = verifier._fixture_responses(self.config)
        duplicate[1] = verifier.AuditResponse(
            200,
            {"content-type": "application/json"},
            b'{"hasNext":false,"hasNext":true,"folders":[],"objects":[]}',
        )
        self.assert_fixture_error("response_json_duplicate_key", duplicate)

        oversized = verifier._fixture_responses(self.config)
        oversized[1] = verifier.AuditResponse(
            200,
            {"content-type": "application/json"},
            b"{" + b"x" * verifier.MAX_RESPONSE_BYTES + b"}",
        )
        self.assert_fixture_error("response_too_large", oversized)

    def test_configuration_rejects_destination_and_boundary_ambiguity(self) -> None:
        cases = [
            {verifier.ENV_BASE_URL: "http://fixture-project.supabase.co"},
            {verifier.ENV_BASE_URL: "https://evil.example"},
            {verifier.ENV_BASE_URL: "https://user:pass@fixture-project.supabase.co"},
            {verifier.ENV_BASE_URL: "https://fixture-project.supabase.co/path"},
            {verifier.ENV_TENANT_B_PREFIX: "tenant-a/"},
            {verifier.ENV_TENANT_B_OBJECT: "tenant-a/b-sentinel.txt"},
            {verifier.ENV_TENANT_A_PREFIX: "../tenant-a/"},
        ]
        for override in cases:
            with self.subTest(override=override), self.assertRaises(verifier.PrivacyAuditError):
                verifier.load_config({**self.environment, **override}, now=self.now)

    def test_service_role_and_non_user_credentials_are_rejected(self) -> None:
        forbidden_keys = [
            "sb_secret_forbidden_0123456789",
            verifier._test_jwt(role="service_role", subject="backend"),
        ]
        for key in forbidden_keys:
            with self.subTest(key=key[:12]), self.assertRaises(verifier.PrivacyAuditError):
                verifier.load_config(
                    {**self.environment, verifier.ENV_PUBLISHABLE_KEY: key}, now=self.now
                )

        with self.assertRaises(verifier.PrivacyAuditError):
            verifier.load_config(
                {
                    **self.environment,
                    verifier.ENV_TENANT_A_JWT: verifier._test_jwt(
                        role="service_role", subject="backend"
                    ),
                },
                now=self.now,
            )

    def test_live_mode_requires_matching_owner_confirmation(self) -> None:
        error_output = StringIO()
        with redirect_stderr(error_output):
            self.assertEqual(verifier.main([]), 1)
        self.assertEqual(json.loads(error_output.getvalue())["error"], "owner_approval_confirmation_required")

        error_output = StringIO()
        with redirect_stderr(error_output):
            self.assertEqual(
                verifier.main(["--self-test", "--confirm-read-only-audit", "approval"]), 1
            )
        self.assertEqual(json.loads(error_output.getvalue())["error"], "audit_mode_conflict")

        error_output = StringIO()
        with patch.dict(os.environ, self.environment, clear=True), redirect_stderr(error_output):
            self.assertEqual(
                verifier.main(["--confirm-read-only-audit", "OWNER-STORAGE-AUDIT-WRONG"]), 1
            )
        self.assertEqual(
            json.loads(error_output.getvalue())["error"], "owner_approval_confirmation_mismatch"
        )

    def test_redirect_handler_fails_closed_without_echoing_target(self) -> None:
        with self.assertRaises(verifier.PrivacyAuditError) as raised:
            verifier._NoRedirectHandler().redirect_request(
                None, None, 302, "Found", {}, "https://evil.example/?token=secret"
            )
        self.assertEqual(raised.exception.code, "redirect_rejected")
        self.assertNotIn("secret", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
