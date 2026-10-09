"""Candidate Sites inquiry HTTP adapter, deliberately not mounted in production.

The hosting integration must supply verified client-address and managed identity
resolvers. Never wire an unverified Forwarded/X-Forwarded-For header here. Public
page origin verification, operator UI and deployment migration remain prerequisites.
"""

from collections.abc import Callable
import hashlib
import hmac
import ipaddress
import json
from typing import Any
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from .trial_store import TrialNotReadyError, TrialPermissionDenied, TrialPrincipal, TrialValidationError
from .website_inquiry_store import WebsiteInquiryStore
from .website_public_page import render_website_inquiry_page

_HEADERS = {'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'}


def _error(status: int, code: str) -> HTTPException:
    return HTTPException(status, detail=code, headers={**_HEADERS, **({'Retry-After': '600'} if status == 429 else {})})


def _unique_object(pairs):
    result = {}
    for name, value in pairs:
        if name in result:
            raise ValueError('duplicate_json_key')
        result[name] = value
    return result


async def _body(request: Request) -> dict[str, Any]:
    if request.headers.get('content-type', '').split(';', 1)[0].strip().lower() != 'application/json':
        raise _error(415, 'json_required')
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > 4096:
            raise _error(413, 'request_too_large')
        body.extend(chunk)
    try:
        result = json.loads(body.decode('utf-8'), object_pairs_hook=_unique_object,
                            parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
    except (ValueError, UnicodeError, RecursionError):
        raise _error(422, 'request_invalid') from None
    if not isinstance(result, dict):
        raise _error(422, 'request_invalid')
    return result


def create_website_inquiry_router(
    *, store: WebsiteInquiryStore, enabled: bool = False,
    resolve_client_address: Callable[[Request], str] | None = None,
    resolve_principal: Callable[[Request], TrialPrincipal] | None = None,
    abuse_key: bytes = b'',
    public_origin: str = '',
) -> APIRouter:
    router = APIRouter(tags=['website-inquiries'])
    configured = (enabled and callable(resolve_client_address) and callable(resolve_principal)
                  and isinstance(abuse_key, bytes) and len(abuse_key) >= 32 and len(set(abuse_key)) >= 10)
    try:
        origin_parts = urlsplit(public_origin)
        publishing_configured = (configured and origin_parts.scheme == 'https' and bool(origin_parts.hostname)
            and not origin_parts.username and not origin_parts.password and not origin_parts.path
            and not origin_parts.query and not origin_parts.fragment and len(public_origin) <= 256
            and public_origin == f'https://{origin_parts.netloc}'.lower()
            and (origin_parts.port is None or 1 <= origin_parts.port <= 65535))
    except (ValueError, TypeError):
        publishing_configured = False

    def available(request):
        if not configured:
            raise _error(503, 'website_inquiries_unavailable')
        if request.query_params:
            raise _error(422, 'request_invalid')

    async def invoke(operation, *, render=False, page_path='/'):
        try:
            result = await run_in_threadpool(operation)
            if render and result is not None:
                result = render_website_inquiry_page(result, page_path)
        except TrialPermissionDenied:
            raise _error(403, 'access_denied') from None
        except TrialNotReadyError:
            raise _error(503, 'website_inquiries_unavailable') from None
        except TrialValidationError:
            raise _error(422, 'request_invalid') from None
        except Exception as exc:
            # Match known DB codes only. Never expose a SQL context or customer
            # text through an exception, even when the driver adds detail.
            code = getattr(getattr(exc, 'diag', None), 'message_primary', '')
            status, public_code = {
                'website_inquiry_unavailable': (404, 'form_unavailable'),
                'website_inquiry_invalid': (422, 'request_invalid'),
                'website_inquiry_retry_conflict': (409, 'request_conflict'),
                'website_inquiry_capacity': (429, 'try_later'),
                'website_inquiry_access_denied': (403, 'access_denied'),
                'website_inquiry_source_stale': (409, 'source_changed'),
                'website_inquiry_approval_required': (422, 'approval_required'),
            }.get(code, (503, 'website_inquiries_unavailable'))
            raise _error(status, public_code) from None
        if render:
            if result is None:
                raise _error(404, 'form_unavailable')
            return result
        return JSONResponse(result, headers=_HEADERS)

    def principal(request):
        try:
            actor = resolve_principal(request) if resolve_principal else None
        except Exception:
            raise _error(401, 'sign_in_required') from None
        if not isinstance(actor, TrialPrincipal) or actor.actor_kind != 'human':
            raise _error(401, 'sign_in_required')
        return actor

    @router.post('/api/public/sites/{channel_id}/inquiries')
    async def receive(channel_id: str, request: Request):
        available(request)
        try:
            address = ipaddress.ip_address(resolve_client_address(request))
        except Exception:
            raise _error(503, 'website_inquiries_unavailable') from None
        if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
            address = address.ipv4_mapped
        origin = request.headers.get('origin', '')
        if not origin or len(origin) > 256:
            raise _error(422, 'request_invalid')
        body = await _body(request)
        if set(body) != {'requestId', 'name', 'contact', 'message', 'consent'}:
            raise _error(422, 'request_invalid')
        request_id = body.pop('requestId')
        client_key = hmac.new(abuse_key, b'website-inquiry:v1:' + address.compressed.encode('ascii'), hashlib.sha256).hexdigest()
        return await invoke(lambda: store.receive(channel_id=channel_id, request_id=request_id,
                            origin=origin, payload=body, client_key=client_key))

    @router.post('/api/trial/v1/website-inquiry-channels')
    async def prepare(request: Request):
        available(request)
        actor = principal(request)
        body = await _body(request)
        if set(body) != {'channelId', 'pageId', 'expectedVersion', 'origin'}:
            raise _error(422, 'request_invalid')
        return await invoke(lambda: store.prepare_channel(actor, channel_id=body['channelId'],
            page_id=body['pageId'], expected_version=body['expectedVersion'], origin=body['origin']))

    @router.get('/api/trial/v1/website-inbox')
    async def inbox(request: Request):
        # Only a fixed three-part keyset cursor is accepted; workspace is always
        # supplied by the authenticated resolver, never by the query string.
        if not configured:
            raise _error(503, 'website_inquiries_unavailable')
        actor = principal(request)
        query = request.query_params
        if query and (set(query) != {'beforeTime', 'beforeChannel', 'beforeRequest'} or len(query.multi_items()) != 3):
            raise _error(422, 'request_invalid')
        before = (query['beforeTime'], query['beforeChannel'], query['beforeRequest']) if query else None
        return await invoke(lambda: store.inbox(actor, before=before))

    @router.get('/sites/{channel_id}')
    @router.get('/sites/{channel_id}/{page_path:path}')
    async def page(channel_id: str, request: Request, page_path: str = ''):
        available(request)
        if not publishing_configured:
            raise _error(503, 'website_inquiries_unavailable')
        return await invoke(lambda: store.public_page(channel_id=channel_id, public_origin=public_origin),
                            render=True, page_path='/' + page_path)

    @router.post('/api/trial/v1/website-inquiry-channels/{channel_id}/publish')
    async def publish(channel_id: str, request: Request):
        available(request)
        actor = principal(request)
        if not publishing_configured:
            raise _error(503, 'website_inquiries_unavailable')
        body = await _body(request)
        if set(body) != {'expectedVersion'}:
            raise _error(422, 'request_invalid')
        return await invoke(lambda: store.publish_channel(actor, channel_id=channel_id,
            expected_version=body['expectedVersion'], public_origin=public_origin))

    @router.post('/api/trial/v1/website-inquiry-channels/{channel_id}/unpublish')
    async def unpublish(channel_id: str, request: Request):
        available(request)
        actor = principal(request)
        body = await _body(request)
        if set(body) != {'artifactDigest'}:
            raise _error(422, 'request_invalid')
        return await invoke(lambda: store.unpublish_channel(actor, channel_id=channel_id, artifact_digest=body['artifactDigest']))

    return router
