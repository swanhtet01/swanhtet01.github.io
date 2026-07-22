from __future__ import annotations

import base64
import json
import os
import unittest
from unittest.mock import MagicMock, patch

from supermega_runtime.supabase_auth import SupabaseAuthConfig, verify_supabase_user_token


def _jwt(payload: dict[str, object]) -> str:
    def encode(value: dict[str, object]) -> str:
        raw = json.dumps(value, separators=(",", ":")).encode()
        return base64.urlsafe_b64encode(raw).decode().rstrip("=")

    return f"{encode({'alg': 'HS256', 'typ': 'JWT'})}.{encode(payload)}.signature"


class SupabaseAuthTests(unittest.TestCase):
    def test_configuration_accepts_only_public_client_keys(self) -> None:
        safe_environment = {
            "SUPERMEGA_SUPABASE_URL": "https://example.supabase.co",
            "SUPERMEGA_SUPABASE_PUBLISHABLE_KEY": "sb_publishable_abcdefghijklmnopqrstuvwxyz",
        }
        with patch.dict(os.environ, safe_environment, clear=True):
            self.assertTrue(SupabaseAuthConfig.from_environment().ready)

        with patch.dict(
            os.environ,
            {
                "VITE_SUPABASE_URL": "https://example.supabase.co",
                "VITE_SUPABASE_ANON_KEY": _jwt({"role": "anon"}),
            },
            clear=True,
        ):
            self.assertTrue(SupabaseAuthConfig.from_environment().ready)

        unsafe_keys = (
            "sb_secret_abcdefghijklmnopqrstuvwxyz",
            _jwt({"role": "service_role"}),
            "not-a-key",
        )
        for key in unsafe_keys:
            with self.subTest(key=key[:16]):
                with patch.dict(
                    os.environ,
                    {
                        "SUPERMEGA_SUPABASE_URL": "https://example.supabase.co",
                        "SUPABASE_ANON_KEY": key,
                    },
                    clear=True,
                ):
                    self.assertFalse(SupabaseAuthConfig.from_environment().ready)

    def test_configuration_rejects_non_https_remote_urls(self) -> None:
        with patch.dict(
            os.environ,
            {
                "SUPERMEGA_SUPABASE_URL": "http://example.supabase.co",
                "SUPERMEGA_SUPABASE_PUBLISHABLE_KEY": "sb_publishable_abcdefghijklmnopqrstuvwxyz",
            },
            clear=True,
        ):
            self.assertFalse(SupabaseAuthConfig.from_environment().ready)

    def test_verifier_uses_auth_server_and_returns_named_user_id(self) -> None:
        config = SupabaseAuthConfig(
            base_url="https://example.supabase.co",
            publishable_key="sb_publishable_abcdefghijklmnopqrstuvwxyz",
        )
        response = MagicMock()
        response.read.return_value = json.dumps(
            {"id": "2f8d24d8-308c-4dc8-a352-7b61df756728", "is_anonymous": False}
        ).encode()
        response.__enter__.return_value = response
        opener = MagicMock()
        opener.open.return_value = response
        with patch("supermega_runtime.supabase_auth.build_opener", return_value=opener):
            user_id = verify_supabase_user_token("header.payload.signature", config)

        self.assertEqual(user_id, "2f8d24d8-308c-4dc8-a352-7b61df756728")
        request = opener.open.call_args.args[0]
        self.assertEqual(request.full_url, "https://example.supabase.co/auth/v1/user")
        self.assertEqual(request.get_header("Authorization"), "Bearer header.payload.signature")
        self.assertEqual(request.get_header("Apikey"), config.publishable_key)

    def test_verifier_rejects_anonymous_or_malformed_tokens_without_identity(self) -> None:
        config = SupabaseAuthConfig(
            base_url="https://example.supabase.co",
            publishable_key="sb_publishable_abcdefghijklmnopqrstuvwxyz",
        )
        opener = MagicMock()
        with patch("supermega_runtime.supabase_auth.build_opener", return_value=opener):
            self.assertIsNone(verify_supabase_user_token("not-a-jwt", config))
            opener.open.assert_not_called()

        response = MagicMock()
        response.read.return_value = json.dumps({"id": "anonymous-user", "is_anonymous": True}).encode()
        response.__enter__.return_value = response
        opener.open.return_value = response
        with patch("supermega_runtime.supabase_auth.build_opener", return_value=opener):
            self.assertIsNone(verify_supabase_user_token("header.payload.signature", config))

        response.read.return_value = json.dumps({"id": "identity-without-kind"}).encode()
        with patch("supermega_runtime.supabase_auth.build_opener", return_value=opener):
            self.assertIsNone(verify_supabase_user_token("header.payload.signature", config))


if __name__ == "__main__":
    unittest.main()
