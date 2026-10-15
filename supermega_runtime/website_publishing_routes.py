"""Explicit server wiring for Sites hosting. Disabled unless fully configured.

Only Vercel's platform-overwritten address header is supported here. Other hosts
must provide a reviewed ingress adapter rather than trust arbitrary proxy headers.
See https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for.
"""

import ipaddress
import os
import re

from .trial_store import PostgresTrialStore
from .website_inquiry_api import create_website_inquiry_router
from .website_inquiry_store import WebsiteInquiryStore
from .website_media_storage import MediaStorageConfig, SupabasePrivateMediaStorage


def vercel_client_address(request):
    values = request.headers.getlist('x-vercel-forwarded-for')
    if len(values) != 1 or ',' in values[0] or '%' in values[0]:
        raise ValueError('verified_address_required')
    return ipaddress.ip_address(values[0].strip()).compressed


def mount_website_publishing_routes(app, *, store, resolve_principal):
    enabled = (os.getenv('SUPERMEGA_WEBSITE_PUBLISHING_ENABLED') == 'true'
               and os.getenv('SUPERMEGA_WEBSITE_INGRESS') == 'vercel'
               and os.getenv('VERCEL') == '1'
               and os.getenv('VERCEL_ENV') in ('preview', 'production')
               and isinstance(store, PostgresTrialStore))
    key = os.getenv('SUPERMEGA_WEBSITE_INQUIRY_HMAC_KEY', '')
    abuse_key = bytes.fromhex(key) if re.fullmatch(r'[0-9a-fA-F]{64}', key) else b''
    media = MediaStorageConfig.from_environment()
    adapter = WebsiteInquiryStore(store, media_storage=SupabasePrivateMediaStorage(media) if media.ready else None)
    app.include_router(create_website_inquiry_router(
        store=adapter, enabled=enabled, resolve_principal=resolve_principal,
        resolve_client_address=vercel_client_address,
        abuse_key=abuse_key, public_origin=os.getenv('SUPERMEGA_WEBSITE_PUBLIC_ORIGIN', ''),
    ))
