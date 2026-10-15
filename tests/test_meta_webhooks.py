from __future__ import annotations

import unittest

from supermega_runtime.meta_webhooks import (
    verify_meta_webhook_challenge,
    verify_meta_webhook_signature,
)


class MetaWebhookSignatureTests(unittest.TestCase):
    def test_accepts_bounded_subscribe_challenge_for_matching_token(self) -> None:
        self.assertEqual(
            verify_meta_webhook_challenge("subscribe", "verify-me", "challenge-1", "verify-me"),
            "challenge-1",
        )

    def test_rejects_wrong_mode_token_and_missing_configuration(self) -> None:
        for values in (
            ("unsubscribe", "verify-me", "challenge-1", "verify-me"),
            ("subscribe", "wrong", "challenge-1", "verify-me"),
            ("subscribe", "verify-me", "challenge-1", ""),
            (None, "verify-me", "challenge-1", "verify-me"),
        ):
            with self.subTest(values=values):
                self.assertIsNone(verify_meta_webhook_challenge(*values))

    def test_rejects_empty_long_or_control_character_challenge(self) -> None:
        for challenge in ("", "c" * 257, "line1\r\nline2"):
            with self.subTest(challenge_length=len(challenge)):
                self.assertIsNone(
                    verify_meta_webhook_challenge("subscribe", "token", challenge, "token")
                )

    def test_known_hmac_sha256_vector(self) -> None:
        self.assertTrue(
            verify_meta_webhook_signature(
                b"The quick brown fox jumps over the lazy dog",
                "sha256=f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
                "key",
            )
        )

    def test_authenticates_exact_raw_bytes(self) -> None:
        self.assertFalse(
            verify_meta_webhook_signature(
                b'{"message":"changed"}',
                "sha256=f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
                "key",
            )
        )

    def test_rejects_missing_or_wrong_prefix(self) -> None:
        for signature in (None, "", "sha1=" + "0" * 64, "SHA256=" + "0" * 64):
            with self.subTest(signature=signature):
                self.assertFalse(verify_meta_webhook_signature(b"body", signature, "secret"))

    def test_rejects_wrong_length_or_non_hex_digest(self) -> None:
        for digest in ("", "0" * 63, "g" * 64, "０" * 64):
            with self.subTest(digest=digest):
                self.assertFalse(
                    verify_meta_webhook_signature(b"body", "sha256=" + digest, "secret")
                )

    def test_rejects_empty_secret(self) -> None:
        self.assertFalse(
            verify_meta_webhook_signature(b"body", "sha256=" + "0" * 64, "")
        )

    def test_rejects_non_utf8_secret_without_raising(self) -> None:
        self.assertFalse(
            verify_meta_webhook_signature(b"body", "sha256=" + "0" * 64, "\ud800")
        )

    def test_rejects_non_raw_body_types(self) -> None:
        for body in ("body", bytearray(b"body"), None):
            with self.subTest(body_type=type(body).__name__):
                self.assertFalse(
                    verify_meta_webhook_signature(body, "sha256=" + "0" * 64, "secret")  # type: ignore[arg-type]
                )


if __name__ == "__main__":
    unittest.main()
