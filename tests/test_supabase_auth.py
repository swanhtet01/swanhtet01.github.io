from __future__ import annotations

import base64
import json
import os
import unittest
from unittest.mock import MagicMock, patch

from supermega_runtime.supabase_auth import (
    SupabaseAuthConfig,
    VerifiedSupabaseUser,
    verify_supabase_user_identity,
    verify_supabase_user_token,
)


def _jwt(payload: dict[str, object]) -> str:
    def encode(value: dict[str, object]) -> str:
        raw = json.dumps(value, separators=(",", ":")).encode()
        return base64.urlsafe_b64encode(raw).decode().rstrip("=")

    return f"{encode({'alg': 'HS256', 'typ': 'JWT'})}.{encode(payload)}.signature"


USER_ID = "2f8d24d8-308c-4dc8-a352-7b61df756728"
SESSION_ID = "d8aaab28-a5a7-4a0d-9d75-7a6265a969c3"


def _user_token(**overrides: object) -> str:
    payload: dict[str, object] = {
        "iss": "https://example.supabase.co/auth/v1",
        "aud": "authenticated",
        "sub": USER_ID,
        "session_id": SESSION_ID,
        "role": "authenticated",
        "is_anonymous": False,
    }
    payload.update(overrides)
    return _jwt(payload)


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

    def test_verifier_uses_auth_server_and_preserves_signed_session_identity(self) -> None:
        config = SupabaseAuthConfig(
            base_url="https://example.supabase.co",
            publishable_key="sb_publishable_abcdefghijklmnopqrstuvwxyz",
        )
        response = MagicMock()
        response.read.return_value = json.dumps(
            {"id": USER_ID, "email": "STAFF@EXAMPLE.COM", "is_anonymous": False}
        ).encode()
        response.__enter__.return_value = response
        opener = MagicMock()
        opener.open.return_value = response
        token = _user_token()
        with patch("supermega_runtime.supabase_auth.build_opener", return_value=opener):
            identity = verify_supabase_user_identity(token, config)

        self.assertEqual(identity, VerifiedSupabaseUser(USER_ID, SESSION_ID, "staff@example.com"))
        request = opener.open.call_args.args[0]
        self.assertEqual(request.full_url, "https://example.supabase.co/auth/v1/user")
        self.assertEqual(request.get_header("Authorization"), f"Bearer {token}")
        self.assertEqual(request.get_header("Apikey"), config.publishable_key)

        with patch("supermega_runtime.supabase_auth.build_opener", return_value=opener):
            self.assertEqual(verify_supabase_user_token(token, config), USER_ID)

    def test_verifier_binds_auth_response_to_signed_project_session_and_subject(self) -> None:
        config = SupabaseAuthConfig(
            base_url="https://example.supabase.co",
            publishable_key="sb_publishable_abcdefghijklmnopqrstuvwxyz",
        )
        invalid_tokens = (
            _user_token(iss="https://other.supabase.co/auth/v1"),
            _user_token(aud="anon"),
            _user_token(role="service_role"),
            _user_token(is_anonymous=True),
            _user_token(sub="not-a-uuid"),
            _user_token(session_id=""),
        )
        opener = MagicMock()
        with patch("supermega_runtime.supabase_auth.build_opener", return_value=opener):
            for token in invalid_tokens:
                with self.subTest(token=token[:32]):
                    self.assertIsNone(verify_supabase_user_token(token, config))
            opener.open.assert_not_called()

        response = MagicMock()
        response.read.return_value = json.dumps(
            {"id": "3813d642-90f6-44e0-ad62-195ac8793aa8", "is_anonymous": False}
        ).encode()
        response.__enter__.return_value = response
        opener.open.return_value = response
        with patch("supermega_runtime.supabase_auth.build_opener", return_value=opener):
            self.assertIsNone(verify_supabase_user_token(_user_token(), config))

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
            self.assertIsNone(verify_supabase_user_token(_user_token(), config))

        response.read.return_value = json.dumps({"id": "identity-without-kind"}).encode()
        with patch("supermega_runtime.supabase_auth.build_opener", return_value=opener):
            self.assertIsNone(verify_supabase_user_token(_user_token(), config))


if __name__ == "__main__":
    unittest.main()
