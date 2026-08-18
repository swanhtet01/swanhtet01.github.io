"""The one courtesy email the platform sends: welcome-at-activation.

Sent best-effort after a NEW self-serve tenant is created (never on idempotent
replay). This module must never affect the activation result: every failure --
missing key, network error, provider rejection -- returns False and the tenant
stays created. The idempotency key is derived from the workspace id, so even a
retried create cannot double-send. No address or name is ever logged.

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


def _welcome_text(business_name: str, claim_code: str) -> str:
    return (
        f"{business_name} is active on SuperMega.\n"
        "\n"
        "What just happened: your claim code "
        f"{claim_code} created your company account. You are the owner; only "
        "your signed-in account holds that role.\n"
        "\n"
        "Next steps:\n"
        "1. Sign in any time at https://app.supermega.dev/login -- SuperMega "
        "finds the companies assigned to you.\n"
        "2. Your on-device trial records stay yours. Use Settings -> Company "
        "controls to bring data across when you are ready.\n"
        "3. A person reads replies to this address. Ask anything, any time.\n"
        "\n"
        "Nothing else changed: no payment was taken, nothing was published, "
        "and your data is only shared with people you invite.\n"
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
            "subject": f"{business_name} is active - SuperMega",
            "text": _welcome_text(business_name, claim_code),
        },
        ensure_ascii=False,
    ).encode("utf-8")
    request = UrlRequest(
        _RESEND_ENDPOINT,
        data=body,
        headers={
            "authorization": f"Bearer {api_key}",
            "content-type": "application/json",
            # Deterministic per workspace: a retried activation can never
            # double-send, mirroring the contact function's idempotency style.
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
