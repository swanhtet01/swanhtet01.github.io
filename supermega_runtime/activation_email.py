"""The one courtesy email the platform sends: welcome-at-activation.

Sent best-effort after a NEW self-serve tenant is created (never on idempotent
replay). This module must never affect the activation result: every failure --
missing key, network error, provider rejection -- returns False and the tenant
stays created. The workspace-derived idempotency key supports provider
deduplication; it is not proof of delivery or unlimited duplicate prevention.
No address or name is ever logged.

Sender identity reuses the public contact function's env contract
(SUPERMEGA_CONTACT_FROM_EMAIL / RESEND_API_KEY) so one verified Resend domain
serves both surfaces.
"""

from __future__ import annotations

import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request as UrlRequest, build_opener

_RESEND_ENDPOINT = "https://api.resend.com/emails"
_TIMEOUT_SECONDS = 9.0
_DEFAULT_FROM = "SuperMega <leads@supermega.dev>"
_MAX_EMAIL_LENGTH = 160


def _welcome_text(business_name: str) -> str:
    return (
        f"Your company account for {business_name} has been created.\n"
        "\n"
        "Open your company\n"
        "https://app.supermega.dev/login\n"
        "Sign in with the same account you used during setup. SuperMega "
        "will show the companies assigned to that account.\n"
        "\n"
        "Account creation does not import your browser-local sample records, "
        "publish a website or take a payment. Product setup and live-use "
        "readiness are separate from account creation.\n"
        "\n"
        "Can't see your company? Check that you used the same sign-in account, "
        "then reply to this email for setup help. Do not send passwords, "
        "sign-in codes or customer records.\n"
        "\n"
        "-- SuperMega\n"
    )


def send_self_serve_welcome_email(
    *,
    to_email: str,
    business_name: str,
    workspace_id: str,
    claim_code: str,
) -> bool:
    """Best-effort welcome send; True only when the provider accepted it."""

    api_key = str(os.getenv("RESEND_API_KEY") or "").strip()
    recipient = str(to_email or "").strip()
    if not api_key or not recipient or len(recipient) > _MAX_EMAIL_LENGTH or "@" not in recipient:
        return False
    sender = str(os.getenv("SUPERMEGA_CONTACT_FROM_EMAIL") or "").strip() or _DEFAULT_FROM
    reply_to = str(os.getenv("SUPERMEGA_CONTACT_NOTIFY_EMAIL") or "").strip() or "swanhtet@supermega.dev"
    body = json.dumps(
        {
            "from": sender,
            "to": [recipient],
            "reply_to": reply_to,
            "subject": f"Company account created - {business_name} | SuperMega",
            "text": _welcome_text(business_name),
        },
        ensure_ascii=False,
    ).encode("utf-8")
    request = UrlRequest(
        _RESEND_ENDPOINT,
        data=body,
        headers={
            "authorization": f"Bearer {api_key}",
            "content-type": "application/json",
            # Deterministic per workspace for provider-side deduplication.
            # The activation route separately suppresses idempotent replays.
            "idempotency-key": f"supermega-self-serve-welcome/{workspace_id}",
        },
        method="POST",
    )
    opener = build_opener(ProxyHandler({}))
    try:
        with opener.open(request, timeout=_TIMEOUT_SECONDS) as response:
            return 200 <= int(getattr(response, "status", 0) or 0) < 300
    except (HTTPError, URLError, OSError, TimeoutError, ValueError):
        return False


__all__ = ["send_self_serve_welcome_email"]
