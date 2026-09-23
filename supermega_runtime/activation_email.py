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
from html import escape
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request as UrlRequest, build_opener

_RESEND_ENDPOINT = "https://api.resend.com/emails"
_TIMEOUT_SECONDS = 9.0
_DEFAULT_FROM = "SuperMega <leads@supermega.dev>"
_MAX_EMAIL_LENGTH = 160
_SIGN_IN_URL = "https://app.supermega.dev/login"


class _RefuseRedirects(HTTPRedirectHandler):
    """Never forward the provider credential or recipient payload elsewhere."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _welcome_sections(business_name: str) -> tuple[str, str, str, str]:
    return (
        f"Your company account for {business_name} has been created.",
        "Sign in with the same account you used during setup. SuperMega "
        "will show the companies assigned to that account.",
        "Account creation does not import your browser-local sample records, "
        "publish a website or take a payment. Product setup and live-use "
        "readiness are separate from account creation.",
        "Can't see your company? Check that you used the same sign-in account, "
        "then reply to this email for setup help. Do not send passwords, "
        "sign-in codes or customer records.",
    )


def _welcome_text(business_name: str) -> str:
    created, sign_in, boundary, recovery = _welcome_sections(business_name)
    return "\n\n".join((created, f"Open your company\n{_SIGN_IN_URL}\n{sign_in}", boundary, recovery, "-- SuperMega\n"))


def _welcome_html(business_name: str) -> str:
    """Inline, image-free email; shared copy keeps the text fallback truthful."""
    created, sign_in, boundary, recovery = map(escape, _welcome_sections(business_name))
    return (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        '<title>Company account created | SuperMega</title></head>'
        '<body style="margin:0;background:#f4f5f2;color:#172d26;font-family:Arial,sans-serif;">'
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:24px 12px;">'
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" align="center" '
        'style="max-width:560px;background:#ffffff;border:1px solid #d9dfd8;border-radius:16px;">'
        '<tr><td style="padding:28px 24px;overflow-wrap:anywhere;word-break:break-word;">'
        '<p style="margin:0 0 28px;font-size:18px;font-weight:bold;">SuperMega</p>'
        '<h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;">Your company account is created.</h1>'
        f'<p style="font-size:16px;line-height:1.6;">{created}</p>'
        f'<p style="font-size:16px;line-height:1.6;">{sign_in}</p>'
        '<p style="margin:24px 0;">'
        f'<a href="{_SIGN_IN_URL}" style="display:inline-block;background:#173e31;color:#ffffff;'
        'padding:14px 20px;border-radius:8px;font-size:16px;line-height:24px;font-weight:bold;'
        'text-decoration:none;">Open your company</a></p>'
        '<h2 style="margin:28px 0 8px;font-size:16px;">What this means</h2>'
        f'<p style="margin:0;font-size:15px;line-height:1.6;color:#405349;">{boundary}</p>'
        '<hr style="border:0;border-top:1px solid #d9dfd8;margin:24px 0;">'
        f'<p style="margin:0;font-size:15px;line-height:1.6;color:#405349;">{recovery}</p>'
        '</td></tr></table></td></tr></table></body></html>'
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
            "html": _welcome_html(business_name),
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
    try:
        opener = build_opener(ProxyHandler({}), _RefuseRedirects())
        with opener.open(request, timeout=_TIMEOUT_SECONDS) as response:
            return 200 <= int(getattr(response, "status", 0) or 0) < 300
    except HTTPError as error:
        error.close()
        return False
    except (URLError, OSError, TimeoutError, ValueError):
        return False


__all__ = ["send_self_serve_welcome_email"]
