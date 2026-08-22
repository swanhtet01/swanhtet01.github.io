"""Fail-closed Supabase user-token verification for the managed trial."""

from __future__ import annotations

from dataclasses import dataclass
import base64
import binascii
import json
import os
from typing import Any
from uuid import UUID
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request as UrlRequest, build_opener


_MAX_AUTH_RESPONSE_BYTES = 64 * 1024
_MAX_TOKEN_LENGTH = 16 * 1024
_LOCAL_HOSTS = frozenset({"127.0.0.1", "::1", "localhost"})


class SupabaseAuthUnavailable(RuntimeError):
    """The configured identity provider could not make an auth decision."""


class _NoRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001, ANN201 - urllib override.
        return None


@dataclass(frozen=True, slots=True)
class SupabaseAuthConfig:
    base_url: str = ""
    publishable_key: str = ""

    @property
    def ready(self) -> bool:
        return bool(self.base_url and self.publishable_key)

    @classmethod
    def from_environment(cls) -> "SupabaseAuthConfig":
        raw_url = str(
            os.getenv("SUPERMEGA_SUPABASE_URL")
            or os.getenv("SUPABASE_URL")
            or os.getenv("VITE_SUPABASE_URL")
            or ""
        ).strip()
        raw_key = str(
            os.getenv("SUPERMEGA_SUPABASE_PUBLISHABLE_KEY")
            or os.getenv("SUPABASE_PUBLISHABLE_KEY")
            or os.getenv("SUPABASE_ANON_KEY")
            or os.getenv("VITE_SUPABASE_PUBLISHABLE_KEY")
            or os.getenv("VITE_SUPABASE_ANON_KEY")
            or ""
        ).strip()
        return cls(
            base_url=_normalize_base_url(raw_url),
            publishable_key=raw_key if _is_publishable_key(raw_key) else "",
        )


@dataclass(frozen=True, slots=True)
class VerifiedSupabaseUser:
    """A named Supabase user bound to the exact signed Auth session.

    ``email_verified`` is true only when the server-confirmed Auth user record
    carries a confirmed email address. Self-serve tenant creation requires it;
    workspace authorization continues to rely on membership, not this flag.
    """

    user_id: str
    session_id: str
    email_verified: bool = False
    # The server-confirmed address, populated ONLY when email_verified is true
    # so an unconfirmed address never travels. Used for the one courtesy send
    # at self-serve activation; authorization never depends on it.
    email: str = ""


def _normalize_base_url(value: str) -> str:
    if not value:
        return ""
    try:
        parsed = urlsplit(value)
    except ValueError:
        return ""
    hostname = (parsed.hostname or "").casefold()
    local_http = parsed.scheme == "http" and hostname in _LOCAL_HOSTS
    if parsed.scheme != "https" and not local_http:
        return ""
    if not hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        return ""
    if parsed.path not in {"", "/"}:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")


def _decode_jwt_payload(value: str) -> dict[str, Any] | None:
    parts = value.split(".")
    if len(parts) != 3:
        return None
    try:
        payload = parts[1] + "=" * (-len(parts[1]) % 4)
        decoded = json.loads(base64.urlsafe_b64decode(payload.encode("ascii")))
    except (UnicodeEncodeError, ValueError, json.JSONDecodeError, binascii.Error):
        return None
    return decoded if isinstance(decoded, dict) else None


def _is_publishable_key(value: str) -> bool:
    if value.startswith("sb_publishable_") and len(value) >= 24:
        return True
    payload = _decode_jwt_payload(value)
    return bool(payload and payload.get("role") == "anon")


def is_supabase_publishable_key(value: str) -> bool:
    """Return true only for a modern publishable key or legacy anon JWT."""

    return _is_publishable_key(str(value or "").strip())


def _canonical_uuid(value: object) -> str:
    candidate = str(value or "").strip()
    try:
        parsed = UUID(candidate)
    except (ValueError, AttributeError, TypeError):
        return ""
    return str(parsed) if str(parsed) == candidate.casefold() else ""


def _authenticated_token_identity(
    token: str,
    config: SupabaseAuthConfig,
) -> VerifiedSupabaseUser | None:
    """Return signed identity claims only for this project's named session.

    Supabase Auth remains the signature and freshness authority through the
    server-side ``/user`` request below. These checks bind that response to the
    configured project and reject anonymous, service, static custom, or
    malformed tokens before they can reach workspace authorization.
    """

    payload = _decode_jwt_payload(token)
    if not payload:
        return None
    audience = payload.get("aud")
    authenticated_audience = audience == "authenticated" or (
        isinstance(audience, list)
        and audience
        and all(isinstance(item, str) for item in audience)
        and "authenticated" in audience
    )
    subject = _canonical_uuid(payload.get("sub"))
    session_id = _canonical_uuid(payload.get("session_id"))
    if (
        payload.get("iss") != f"{config.base_url}/auth/v1"
        or not authenticated_audience
        or payload.get("role") != "authenticated"
        or payload.get("is_anonymous") is not False
        or not subject
        or not session_id
    ):
        return None
    return VerifiedSupabaseUser(user_id=subject, session_id=session_id)


def verify_supabase_user_identity(
    token: str,
    config: SupabaseAuthConfig,
    *,
    timeout_seconds: float = 4.0,
) -> VerifiedSupabaseUser | None:
    """Return a fresh user and signed session pair confirmed by Supabase Auth.

    The caller must still confirm that ``session_id`` exists in
    ``auth.sessions`` before authorizing managed data. That second check makes
    sign-out and administrative session revocation effective before JWT expiry.
    """

    candidate = str(token or "").strip()
    if not config.ready:
        return None
    if not candidate or len(candidate) > _MAX_TOKEN_LENGTH or len(candidate.split(".")) != 3:
        return None
    token_identity = _authenticated_token_identity(candidate, config)
    if token_identity is None:
        return None

    request = UrlRequest(
        f"{config.base_url}/auth/v1/user",
        headers={
            "accept": "application/json",
            "apikey": config.publishable_key,
            "authorization": f"Bearer {candidate}",
            "user-agent": "supermega-trial-runtime/1.2",
        },
        method="GET",
    )
    opener = build_opener(ProxyHandler({}), _NoRedirectHandler())
    try:
        with opener.open(request, timeout=timeout_seconds) as response:
            payload = response.read(_MAX_AUTH_RESPONSE_BYTES + 1)
    except HTTPError as exc:
        if exc.code in {400, 401, 403}:
            return None
        raise SupabaseAuthUnavailable("Supabase Auth returned an unexpected response.") from exc
    except (OSError, TimeoutError, URLError) as exc:
        raise SupabaseAuthUnavailable("Supabase Auth is unavailable.") from exc

    if len(payload) > _MAX_AUTH_RESPONSE_BYTES:
        raise SupabaseAuthUnavailable("Supabase Auth returned an oversized response.")
    try:
        user = json.loads(payload)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise SupabaseAuthUnavailable("Supabase Auth returned invalid JSON.") from exc
    if not isinstance(user, dict) or user.get("is_anonymous") is not False:
        return None
    user_id = _canonical_uuid(user.get("id"))
    if user_id != token_identity.user_id:
        return None
    email = user.get("email")
    email_confirmed_at = user.get("email_confirmed_at")
    email_verified = bool(
        isinstance(email, str)
        and email.strip()
        and isinstance(email_confirmed_at, str)
        and email_confirmed_at.strip()
    )
    return VerifiedSupabaseUser(
        user_id=token_identity.user_id,
        session_id=token_identity.session_id,
        email_verified=email_verified,
        email=email.strip() if email_verified and isinstance(email, str) else "",
    )


def verify_supabase_user_token(
    token: str,
    config: SupabaseAuthConfig,
    *,
    timeout_seconds: float = 4.0,
) -> str | None:
    """Return a fresh, server-confirmed user id or reject the token.

    The Auth ``/user`` endpoint supports both legacy symmetric and current
    asymmetric Supabase signing keys. Authorization still happens in the
    private trial store through explicit workspace membership and capabilities.
    """

    identity = verify_supabase_user_identity(
        token,
        config,
        timeout_seconds=timeout_seconds,
    )
    return identity.user_id if identity is not None else None


__all__ = [
    "SupabaseAuthConfig",
    "SupabaseAuthUnavailable",
    "VerifiedSupabaseUser",
    "is_supabase_publishable_key",
    "verify_supabase_user_identity",
    "verify_supabase_user_token",
]
