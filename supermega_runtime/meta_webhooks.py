"""Small Meta webhook primitives. No network, persistence, or payload parsing."""

from __future__ import annotations

import hashlib
import hmac


def verify_meta_webhook_challenge(
    mode: str | None,
    supplied_token: str | None,
    challenge: str | None,
    configured_token: str,
) -> str | None:
    """Return Meta's challenge only for a valid, bounded subscribe handshake."""
    if mode != "subscribe" or not isinstance(supplied_token, str):
        return None
    if not isinstance(configured_token, str) or not configured_token:
        return None
    if not isinstance(challenge, str) or not 1 <= len(challenge) <= 256:
        return None
    if not challenge.isascii() or any(ord(character) < 0x20 or ord(character) == 0x7F for character in challenge):
        return None
    try:
        supplied_bytes = supplied_token.encode("utf-8")
        configured_bytes = configured_token.encode("utf-8")
    except UnicodeEncodeError:
        return None
    if not hmac.compare_digest(supplied_bytes, configured_bytes):
        return None
    return challenge


def verify_meta_webhook_signature(
    raw_body: bytes,
    signature_header: str | None,
    app_secret: str,
) -> bool:
    """Verify Meta's X-Hub-Signature-256 against the exact raw request bytes.

    Call this before JSON parsing or tenant routing. The caller must separately
    enforce request-size limits, webhook challenge verification, tenant mapping,
    event idempotency, and retention policy.
    """
    if not isinstance(raw_body, bytes) or not isinstance(signature_header, str):
        return False
    if not isinstance(app_secret, str) or not app_secret:
        return False
    if not signature_header.startswith("sha256="):
        return False

    supplied_digest = signature_header.removeprefix("sha256=")
    if len(supplied_digest) != hashlib.sha256().digest_size * 2:
        return False
    try:
        supplied_digest.encode("ascii")
    except UnicodeEncodeError:
        return False
    if any(character not in "0123456789abcdefABCDEF" for character in supplied_digest):
        return False

    try:
        secret_bytes = app_secret.encode("utf-8")
    except UnicodeEncodeError:
        return False
    expected_digest = hmac.new(secret_bytes, raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected_digest, supplied_digest.lower())
