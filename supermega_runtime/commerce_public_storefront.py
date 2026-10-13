"""Explicit managed storefront publication and anonymous buyer-request intake.

Only a saved Shop catalog can be published. A public buyer sends cart/contact
intent; the server constructs the quote and writes a private, pending request.
No customer submission confirms an order, reserves stock, or takes payment.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import base64
from hashlib import sha256
import hmac
import ipaddress
import json
import os
import re
import unicodedata
from typing import Any, Callable, Mapping
from urllib.parse import urlsplit
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from .commerce_runtime import (
    commerce_catalog_digest,
    commerce_storefront_preview,
    commerce_storefront_preview_digest,
    validate_commerce_state,
)
from .ecommerce_buying_lifecycle import (
    EcommerceLifecycleValidationError,
    build_ecommerce_checkout_quote,
    build_ecommerce_order_request,
    build_ecommerce_pim_projection,
)
from .trial_store import (
    PostgresTrialStore, TrialNotReadyError, TrialPermissionDenied,
    TrialPrincipal, TrialValidationError, TrialVersionConflict,
)
from .website_publishing_routes import vercel_client_address

_HEADERS = {'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer'}
_DIGEST = re.compile(r'^sha256:[0-9a-f]{64}$')
_PHONE = re.compile(r'^\+?[0-9][0-9 ()-]{5,31}$')


def _error(status: int, code: str) -> HTTPException:
    headers = {**_HEADERS, **({'Retry-After': '600'} if status == 429 else {})}
    return HTTPException(status, detail=code, headers=headers)


def _uuid(value: object) -> str:
    try:
        parsed = UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        raise TrialValidationError('commerce_public_invalid') from None
    if parsed.version != 4 or str(value).lower() != str(parsed):
        raise TrialValidationError('commerce_public_invalid')
    return str(parsed)


def _text(value: object, limit: int) -> str:
    if not isinstance(value, str) or not value or value != value.strip():
        raise TrialValidationError('commerce_public_invalid')
    if unicodedata.normalize('NFC', value) != value or len(value.encode('utf-16-le')) // 2 > limit:
        raise TrialValidationError('commerce_public_invalid')
    if any(ord(character) < 32 or ord(character) == 127 for character in value):
        raise TrialValidationError('commerce_public_invalid')
    return value


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
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > 4096:
            raise _error(413, 'request_too_large')
        data.extend(chunk)
    try:
        result = json.loads(data.decode('utf-8'), object_pairs_hook=_unique_object,
                            parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
    except (ValueError, UnicodeError, RecursionError):
        raise _error(422, 'request_invalid') from None
    if not isinstance(result, dict):
        raise _error(422, 'request_invalid')
    return result


def _require_public_schema(cursor: Any) -> None:
    """Fail closed if the private tables/functions or role grants are missing."""
    cursor.execute("""select c.relname,c.relrowsecurity,c.relforcerowsecurity,
        has_table_privilege('anon',c.oid,'SELECT') as anon_read,
        has_table_privilege('authenticated',c.oid,'SELECT') as auth_read,
        has_table_privilege('service_role',c.oid,'SELECT') as service_read
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='app_private' and c.relname in
          ('commerce_public_storefronts','commerce_public_requests',
           'commerce_public_redaction_runs','commerce_public_reconciliation_runs')""")
    tables = cursor.fetchall()
    if (len(tables) != 4 or any(not row['relrowsecurity'] or not row['relforcerowsecurity']
            or row['anon_read'] or row['auth_read'] or row['service_read'] for row in tables)):
        raise TrialNotReadyError(('commerce_public_schema_unverified',))
    cursor.execute("""select p.proname,p.prosecdef,p.proconfig,
        has_function_privilege('anon',p.oid,'EXECUTE') as anon_exec,
        has_function_privilege('authenticated',p.oid,'EXECUTE') as auth_exec,
        has_function_privilege('service_role',p.oid,'EXECUTE') as service_exec
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='app_private' and p.proname in
          ('read_commerce_public_source','receive_commerce_public_request',
           'replay_commerce_public_request','reserve_commerce_public_request',
           'complete_commerce_public_request_claim','inspect_commerce_public_request',
           'close_commerce_public_request',
           'reconcile_commerce_public_closes',
           'redact_closed_commerce_public_requests',
           'commerce_public_redaction_due_count')""")
    functions = cursor.fetchall()
    if (len(functions) != 10 or any(not row['prosecdef']
            or 'search_path=pg_catalog, app_private' not in (row['proconfig'] or [])
            or row['anon_exec'] or row['auth_exec'] or row['service_exec'] for row in functions)):
        raise TrialNotReadyError(('commerce_public_schema_unverified',))


def _public_source(cursor: Any, handle: str) -> Mapping[str, Any] | None:
    cursor.execute('select app_private.read_commerce_public_source(%s) as source', (handle,))
    row = cursor.fetchone() or {}
    return row.get('source')


def _view(source: Mapping[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    state = validate_commerce_state(source['state'])
    configuration = state.get('storefrontConfiguration')
    if not isinstance(configuration, Mapping):
        raise TrialValidationError('commerce_public_unavailable')
    if (configuration['revision'] != source['sourceRevision']
            or configuration['saved']['actionId'] != source['sourceActionId']
            or configuration['shopCatalogDigest'] != source['sourceCatalogDigest']
            or commerce_catalog_digest(state) != source['sourceCatalogDigest']):
        raise TrialValidationError('commerce_public_unavailable')
    preview = commerce_storefront_preview(state)
    if commerce_storefront_preview_digest(state) != source['previewDigest']:
        raise TrialValidationError('commerce_public_unavailable')
    return state, preview


def _shop_request_id(handle: str, request_id: str) -> str:
    """Stable v4-shaped ID survives a command ack lost before the HTTP reply."""
    raw = bytearray(sha256(f'commerce-public-claim:v1:{handle}:{request_id}'.encode()).digest()[:16])
    raw[6] = (raw[6] & 0x0f) | 0x40
    raw[8] = (raw[8] & 0x3f) | 0x80
    return 'ECR-' + str(UUID(bytes=bytes(raw))).upper()


def _page_cursor(row: Mapping[str, Any]) -> str:
    payload = json.dumps([row['received_at'].astimezone(timezone.utc).isoformat(),
        str(row['handle']), str(row['request_id'])], separators=(',', ':')).encode()
    return base64.urlsafe_b64encode(payload).decode().rstrip('=')


def _parse_page_cursor(value: str) -> tuple[datetime, str, str]:
    if not re.fullmatch(r'[A-Za-z0-9_-]{40,220}', value):
        raise TrialValidationError('commerce_public_invalid')
    try:
        payload = base64.urlsafe_b64decode(value + '=' * (-len(value) % 4))
        fields = json.loads(payload)
        if not isinstance(fields, list) or len(fields) != 3:
            raise ValueError('invalid cursor')
        stamp = datetime.fromisoformat(fields[0])
        if stamp.tzinfo is None or stamp.utcoffset() != timedelta(0):
            raise ValueError('invalid cursor')
        handle, request_id = _uuid(fields[1]), _uuid(fields[2])
        if _page_cursor({'received_at': stamp, 'handle': handle, 'request_id': request_id}) != value:
            raise ValueError('invalid cursor')
        return stamp, handle, request_id
    except (ValueError, TypeError, IndexError, UnicodeError, OverflowError):
        raise TrialValidationError('commerce_public_invalid') from None


def _input(body: Mapping[str, Any]) -> tuple[str, dict[str, Any], str]:
    if set(body) != {'requestId', 'name', 'phone', 'fulfilment', 'lines', 'address', 'consent'}:
        raise TrialValidationError('commerce_public_invalid')
    request_id = _uuid(body['requestId'])
    name = _text(body['name'], 80)
    phone = _text(body['phone'], 32)
    if (not _PHONE.fullmatch(phone) or not 6 <= sum(character.isdigit() for character in phone) <= 15
            or body['consent'] is not True):
        raise TrialValidationError('commerce_public_invalid')
    fulfilment = body['fulfilment']
    if (fulfilment not in ('pickup', 'delivery') or not isinstance(body['lines'], list)
            or not 1 <= len(body['lines']) <= 8):
        raise TrialValidationError('commerce_public_invalid')
    lines = []
    for item in body['lines']:
        if (not isinstance(item, dict) or set(item) != {'sku', 'quantity'}
                or type(item['quantity']) is not int or not 1 <= item['quantity'] <= 99):
            raise TrialValidationError('commerce_public_invalid')
        lines.append({'sku': _text(item['sku'], 80), 'quantity': item['quantity']})
    if len({item['sku'] for item in lines}) != len(lines):
        raise TrialValidationError('commerce_public_invalid')
    address = body['address']
    if fulfilment == 'pickup' and address is not None:
        raise TrialValidationError('commerce_public_invalid')
    if fulfilment == 'delivery':
        if not isinstance(address, dict) or set(address) != {'line1', 'township', 'city', 'instructions'}:
            raise TrialValidationError('commerce_public_invalid')
        address = {'line1': _text(address['line1'], 120),
                   'township': _text(address['township'], 80),
                   'city': _text(address['city'], 80),
                   'instructions': _text(address['instructions'], 160) if address['instructions'] else None}
    canonical = {'name': name, 'phone': phone, 'fulfilment': fulfilment,
                 'lines': sorted(lines, key=lambda row: row['sku']), 'address': address, 'consent': True}
    fingerprint = sha256(json.dumps(canonical, sort_keys=True, ensure_ascii=False,
                                    separators=(',', ':')).encode()).hexdigest()
    return request_id, canonical, fingerprint


class CommercePublicStorefront:
    def __init__(self, store: PostgresTrialStore):
        self.store = store

    def publish(self, principal: TrialPrincipal, *, expected_version: int) -> dict[str, Any]:
        if principal.actor_kind != 'human' or type(expected_version) is not int or expected_version < 1:
            raise TrialValidationError('commerce_public_invalid')
        with self.store._guarded_cursor(principal, write=True, capability='commerce.write') as (cursor, _):
            _require_public_schema(cursor)
            cursor.execute("select version,state_json from app_private.workspace_state where workspace_id=%s and surface='commerce' for share",
                           (principal.workspace_id,))
            row = cursor.fetchone()
            if not row or row['version'] != expected_version:
                raise TrialValidationError('commerce_public_source_stale')
            state = validate_commerce_state(row['state_json'])
            preview = commerce_storefront_preview(state)
            configuration = state['storefrontConfiguration']
            digest = commerce_storefront_preview_digest(state)
            self.store._lock(cursor, f'{principal.workspace_id}:commerce-publication')
            cursor.execute('select handle,preview_digest,source_action_id from app_private.commerce_public_storefronts where workspace_id=%s and enabled for update',
                           (principal.workspace_id,))
            previous = cursor.fetchone()
            if previous and previous['preview_digest'] == digest and previous['source_action_id'] == configuration['saved']['actionId']:
                return {'handle': str(previous['handle']), 'enabled': True, 'previewDigest': digest}
            if previous:
                cursor.execute('update app_private.commerce_public_storefronts set enabled=false,revoked_at=clock_timestamp() where handle=%s',
                               (previous['handle'],))
            handle = str(uuid4())
            cursor.execute("""insert into app_private.commerce_public_storefronts
                (handle,workspace_id,source_version,source_revision,source_action_id,
                 source_catalog_digest,preview_digest,published_by)
                values(%s,%s,%s,%s,%s,%s,%s,%s)""",
                (handle, principal.workspace_id, expected_version, configuration['revision'],
                 configuration['saved']['actionId'], configuration['shopCatalogDigest'], digest,
                 principal.actor_id))
        return {'handle': handle, 'enabled': True, 'previewDigest': digest,
                'productCount': len(preview['items'])}

    def publications(self, principal: TrialPrincipal) -> dict[str, Any]:
        with self.store._guarded_cursor(principal, write=False, capability='commerce.write') as (cursor, _):
            _require_public_schema(cursor)
            cursor.execute('select handle,enabled,source_revision,preview_digest,published_at from app_private.commerce_public_storefronts where workspace_id=%s order by published_at desc limit 10',
                           (principal.workspace_id,))
            rows = cursor.fetchall()
            return {'publications': [{'handle': str(row['handle']), 'enabled': row['enabled'],
                    'sourceRevision': row['source_revision'], 'previewDigest': row['preview_digest'],
                    'publishedAt': row['published_at'].astimezone(timezone.utc).isoformat()}
                    for row in rows]}

    def revoke(self, principal: TrialPrincipal, *, handle: str, preview_digest: str) -> dict[str, Any]:
        if principal.actor_kind != 'human' or not _DIGEST.fullmatch(preview_digest):
            raise TrialValidationError('commerce_public_invalid')
        handle = _uuid(handle)
        with self.store._guarded_cursor(principal, write=True, capability='commerce.write') as (cursor, _):
            _require_public_schema(cursor)
            cursor.execute("""update app_private.commerce_public_storefronts
                set enabled=false,revoked_at=clock_timestamp()
                where handle=%s and workspace_id=%s and enabled and preview_digest=%s
                returning handle""", (handle, principal.workspace_id, preview_digest))
            if cursor.fetchone() is None:
                raise TrialValidationError('commerce_public_source_stale')
        return {'handle': handle, 'enabled': False}

    def catalog(self, *, handle: str) -> dict[str, Any]:
        handle = _uuid(handle)
        with self.store._connect() as connection:
            with connection.transaction(), connection.cursor() as cursor:
                self.store._assert_runtime_role(cursor)
                self.store._assert_schema(cursor)
                _require_public_schema(cursor)
                cursor.execute("set local statement_timeout='5s'")
                source = _public_source(cursor, handle)
                if source is None:
                    raise TrialValidationError('commerce_public_unavailable')
                _, preview = _view(source)
                return {'handle': handle, 'storeName': preview['storeName'],
                        'summary': preview['summary'], 'currency': 'MMK', 'items': preview['items']}

    def receive(self, *, handle: str, body: Mapping[str, Any], client_key: str) -> dict[str, Any]:
        if not self.store.write_enabled:
            raise TrialNotReadyError(('write_enabled',))
        handle = _uuid(handle)
        request_id, intent, fingerprint = _input(body)
        if not re.fullmatch(r'[0-9a-f]{64}', client_key):
            raise TrialValidationError('commerce_public_invalid')
        with self.store._connect() as connection:
            with connection.transaction(), connection.cursor() as cursor:
                self.store._assert_runtime_role(cursor)
                self.store._assert_schema(cursor)
                _require_public_schema(cursor)
                cursor.execute("set local statement_timeout='5s'")
                cursor.execute("set local lock_timeout='3s'")
                source = _public_source(cursor, handle)
                if source is None:
                    raise TrialValidationError('commerce_public_unavailable')
                cursor.execute('select app_private.replay_commerce_public_request(%s,%s,%s) as receipt',
                               (handle, request_id, fingerprint))
                replay = (cursor.fetchone() or {}).get('receipt')
                if replay is not None:
                    return replay
                state, preview = _view(source)
                current = {item['sku']: item for item in state['items']}
                if any(current.get(line['sku'], {}).get('onHand', 0) < line['quantity']
                       for line in intent['lines']):
                    raise TrialValidationError('commerce_public_stock_changed')
                now = datetime.now(timezone.utc)
                quoted_at = now.isoformat().replace('+00:00', 'Z')
                expires_at = (now + timedelta(minutes=15)).isoformat().replace('+00:00', 'Z')
                key = 'ECI-' + request_id.upper()
                pim_items = [{field: item[field] for field in
                    ('sku', 'name', 'variant', 'unitPriceMmk', 'availability')}
                    for item in preview['items']]
                pim = build_ecommerce_pim_projection(
                    scope=f"ecommerce:{source['workspaceId']}",
                    source_preview_digest=source['previewDigest'], items=pim_items)
                # Contact remains in the private intake row. Shop commands and
                # their full-state event results must never contain buyer PII.
                contact = {'name': intent['name'], 'phone': intent['phone'],
                           'address': intent['address']}
                quote = build_ecommerce_checkout_quote(
                    pim=pim, cart=intent['lines'],
                    customer_reference=f"Web request {request_id[:8].upper()}",
                    fulfilment=intent['fulfilment'], payment_adapter=(
                        'cash_on_delivery' if intent['fulfilment'] == 'delivery' else 'pay_on_pickup'),
                    promotion_code=None, idempotency_key=key, quoted_at=quoted_at,
                    expires_at=expires_at, customer_profile_input=None,
                    delivery_address_input=None)
                order_request = build_ecommerce_order_request(
                    quote, source_storefront_revision=source['sourceRevision'],
                    source_storefront_action_id=source['sourceActionId'])
                cursor.execute('select app_private.receive_commerce_public_request(%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s) as receipt',
                               (handle, request_id, _shop_request_id(handle, request_id), fingerprint,
                                json.dumps(order_request, ensure_ascii=False),
                                json.dumps(contact, ensure_ascii=False), client_key))
                return cursor.fetchone()['receipt']

    def inbox(self, principal: TrialPrincipal, *, after: str | None = None) -> dict[str, Any]:
        cursor_key = _parse_page_cursor(after) if after is not None else None
        with self.store._guarded_cursor(principal, write=False, capability='commerce.write') as (cursor, _):
            _require_public_schema(cursor)
            cursor.execute("""select handle,request_id,shop_request_id,request_json,contact_json,received_at,status
                from app_private.commerce_public_requests where workspace_id=%s
                and status <> 'closed'
                and (%s::timestamptz is null or (received_at,handle,request_id) < (%s::timestamptz,%s::uuid,%s::uuid))
                order by received_at desc,handle desc,request_id desc limit 51""",
                (principal.workspace_id, cursor_key[0] if cursor_key else None,
                 cursor_key[0] if cursor_key else None, cursor_key[1] if cursor_key else None,
                 cursor_key[2] if cursor_key else None))
            rows = cursor.fetchall()
            cursor.execute("select state_json from app_private.workspace_state where workspace_id=%s and surface='commerce'",
                           (principal.workspace_id,))
            state_row = cursor.fetchone()
            state = validate_commerce_state(state_row['state_json']) if state_row else None
            retained = {item['id'] for item in state.get('storefrontRequests', [])} if state else set()
            converted = {order['sourceRecordId'] for order in state.get('orders', [])
                if order.get('sourceRecordId')} if state else set()
            return {'requests': [{'handle': str(row['handle']), 'requestId': str(row['request_id']),
                'request': row['request_json'],
                'contact': row['contact_json'],
                'shopRequestId': row['shop_request_id'],
                'status': ('in_shop' if row['status'] == 'in_shop'
                    or row['shop_request_id'] in retained
                    or row['shop_request_id'] in converted
                    else 'reviewing' if row['status'] == 'in_review' else 'new'),
                'receivedAt': row['received_at'].astimezone(timezone.utc).isoformat()}
                for row in rows[:50]],
                'nextCursor': _page_cursor(rows[49]) if len(rows) > 50 else None}

    def shop_contact(self, principal: TrialPrincipal, *, shop_request_id: str) -> dict[str, Any]:
        """Show contact only while its unconverted request is in this Shop queue."""
        if not re.fullmatch(r'ECR-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}',
                            shop_request_id):
            raise TrialValidationError('commerce_public_invalid')
        with self.store._guarded_cursor(principal, write=False, capability='commerce.write') as (cursor, _):
            _require_public_schema(cursor)
            cursor.execute("""select contact_json from app_private.commerce_public_requests
                where workspace_id=%s and shop_request_id=%s and status='in_shop'
                  and redacted_at is null""", (principal.workspace_id, shop_request_id))
            contact_row = cursor.fetchone()
            if contact_row is None:
                raise TrialValidationError('commerce_public_unavailable')
            cursor.execute("""select state_json from app_private.workspace_state
                where workspace_id=%s and surface='commerce'""", (principal.workspace_id,))
            state_row = cursor.fetchone()
            if state_row is None:
                raise TrialValidationError('commerce_public_unavailable')
            state = validate_commerce_state(state_row['state_json'])
            if (not any(item['id'] == shop_request_id for item in state['storefrontRequests'])
                    or any(order.get('sourceRecordId') == shop_request_id for order in state['orders'])):
                raise TrialValidationError('commerce_public_unavailable')
            return {'shopRequestId': shop_request_id, 'contact': contact_row['contact_json']}

    def claim(self, principal: TrialPrincipal, *, handle: str, request_id: str) -> dict[str, Any]:
        """Requote a received request into Shop review; never confirm or charge it."""
        handle, request_id = _uuid(handle), _uuid(request_id)
        shop_request_id = _shop_request_id(handle, request_id)
        with self.store._guarded_cursor(principal, write=True, capability='commerce.write') as (cursor, _):
            _require_public_schema(cursor)
            cursor.execute('select app_private.reserve_commerce_public_request(%s,%s,%s) as reserved',
                (principal.workspace_id, handle, request_id))
            row = cursor.fetchone()['reserved']
            original = row['request']
            cursor.execute("select version,state_json from app_private.workspace_state where workspace_id=%s and surface='commerce'",
                           (principal.workspace_id,))
            state_row = cursor.fetchone()
            if state_row is None:
                raise TrialValidationError('commerce_public_unavailable')
            state = validate_commerce_state(state_row['state_json'])
            retained = [item for item in state.get('storefrontRequests', []) if item['id'] == shop_request_id]
            converted = any(order.get('sourceRecordId') == shop_request_id for order in state.get('orders', []))
            if retained or converted:
                cursor.execute('select app_private.complete_commerce_public_request_claim(%s,%s,%s)',
                               (principal.workspace_id, handle, request_id))
                return {'status': 'in_shop', 'shopRequestId': shop_request_id,
                        'priceChanged': (retained[0]['totalMmk'] != original['totalMmk']) if retained else False}
            if row['status'] == 'in_shop':
                raise TrialNotReadyError(('commerce_public_claim_state',))
            preview = commerce_storefront_preview(state)
            configuration = state['storefrontConfiguration']
            current = {item['sku']: item for item in state['items']}
            if any(current.get(line['sku'], {}).get('onHand', 0) < line['quantity']
                   for line in original['lines']):
                raise TrialValidationError('commerce_public_stock_changed')
            now = datetime.now(timezone.utc)
            quoted_at = now.isoformat().replace('+00:00', 'Z')
            expires_at = (now + timedelta(minutes=15)).isoformat().replace('+00:00', 'Z')
            suffix = shop_request_id[4:]
            pim_items = [{field: item[field] for field in
                ('sku', 'name', 'variant', 'unitPriceMmk', 'availability')}
                for item in preview['items']]
            pim = build_ecommerce_pim_projection(
                scope=f'ecommerce:{principal.workspace_id}',
                source_preview_digest=commerce_storefront_preview_digest(state),
                items=pim_items)
            quote = build_ecommerce_checkout_quote(
                pim=pim, cart=[{'sku': item['sku'], 'quantity': item['quantity']}
                               for item in original['lines']],
                customer_reference=original['customerReference'],
                fulfilment=original['fulfilment'],
                payment_adapter=('cash_on_delivery' if original['fulfilment'] == 'delivery' else 'pay_on_pickup'),
                promotion_code=None, idempotency_key='ECI-' + suffix,
                quoted_at=quoted_at, expires_at=expires_at,
                customer_profile_input=None, delivery_address_input=None)
            request = build_ecommerce_order_request(
                quote, source_storefront_revision=configuration['revision'],
                source_storefront_action_id=configuration['saved']['actionId'])
            evidence = {'actionId': 'ACT-' + suffix, 'capturedAt': quoted_at,
                'actor': principal.actor_id,
                'reason': 'Bring a received online request into Shop for review.',
                'evidenceReference': f"ECOMMERCE:{request['id']}:{request['sourcePreviewDigest']}"}
            expected_version = state_row['version']
        result = self.store.apply_command(principal, command_id=str(UUID(suffix)),
            surface='commerce', event_type='commerce.storefront_request.received',
            expected_version=expected_version, payload={'intent': {'request': request}, 'evidence': evidence})
        retained = result.state.get('storefrontRequests', [])
        if not retained or retained[0]['id'] != shop_request_id:
            raise TrialNotReadyError(('commerce_public_claim_readback',))
        with self.store._guarded_cursor(principal, write=True, capability='commerce.write') as (cursor, _):
            cursor.execute('select app_private.complete_commerce_public_request_claim(%s,%s,%s)',
                           (principal.workspace_id, handle, request_id))
        return {'status': 'in_shop', 'shopRequestId': shop_request_id,
                'priceChanged': request['totalMmk'] != original['totalMmk']}

    def close(self, principal: TrialPrincipal, *, handle: str, request_id: str,
              reason: str) -> dict[str, Any]:
        """Close a request only after an unconverted Shop queue item is removed."""
        if principal.actor_kind != 'human' or reason not in (
                'customer_withdrew', 'no_response', 'stock_unavailable',
                'spam_or_duplicate', 'other'):
            raise TrialValidationError('commerce_public_invalid')
        handle, request_id = _uuid(handle), _uuid(request_id)
        with self.store._guarded_cursor(principal, write=True, capability='commerce.write') as (cursor, _):
            _require_public_schema(cursor)
            cursor.execute('select app_private.inspect_commerce_public_request(%s,%s,%s) as item',
                (principal.workspace_id, handle, request_id))
            intake = cursor.fetchone()['item']
            if intake['status'] in ('in_review', 'in_shop'):
                shop_request_id = intake['shopRequestId']
                cursor.execute("""select version,state_json from app_private.workspace_state
                    where workspace_id=%s and surface='commerce'""",
                    (principal.workspace_id,))
                state_row = cursor.fetchone()
                if state_row is None:
                    raise TrialValidationError('commerce_public_close_state')
                state = validate_commerce_state(state_row['state_json'])
                if any(order.get('sourceRecordId') == shop_request_id
                       for order in state['orders']):
                    raise TrialValidationError('commerce_public_close_state')
                if any(item['id'] == shop_request_id
                       for item in state['storefrontRequests']):
                    command_id = uuid5(NAMESPACE_URL,
                        f'commerce-public-close:v1:{handle}:{request_id}')
                    captured_at = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
                    self.store.apply_command(principal, command_id=command_id,
                        surface='commerce', event_type='commerce.storefront_request.closed',
                        expected_version=state_row['version'], payload={
                            'intent': {'requestId': shop_request_id, 'reason': reason},
                            'evidence': {
                                'actionId': 'ACT-' + str(command_id).upper(),
                                'capturedAt': captured_at, 'actor': principal.actor_id,
                                'reason': reason,
                                'evidenceReference':
                                    f'ECOMMERCE-CLOSE:{shop_request_id}:{reason}'}})
                # If a prior Shop write succeeded but its SQL acknowledgement failed,
                # the SQL function checks that exact event before completing this retry.
            cursor.execute('select app_private.close_commerce_public_request(%s,%s,%s,%s) as result',
                           (principal.workspace_id, handle, request_id, reason))
            result = cursor.fetchone()['result']
        return {'handle': handle, 'requestId': request_id, **result}

    def reconcile_closes(self, *, run_id: str, limit: int = 100) -> int:
        """Repair proven Shop close events without impersonating their human actor."""
        if not 1 <= limit <= 500:
            raise TrialValidationError('commerce_public_invalid')
        try:
            run = str(UUID(run_id))
        except (ValueError, TypeError, AttributeError):
            raise TrialValidationError('commerce_public_invalid') from None
        if not self.store.write_enabled:
            raise TrialNotReadyError(('write_enabled',))
        with self.store._connect() as connection:
            with connection.transaction(), connection.cursor() as cursor:
                self.store._assert_runtime_role(cursor)
                self.store._assert_schema(cursor)
                _require_public_schema(cursor)
                cursor.execute("set local statement_timeout='10s'")
                cursor.execute('select app_private.reconcile_commerce_public_closes(%s,%s) as count',
                               (run, limit))
                return int(cursor.fetchone()['count'])

    def redact_due(self, *, run_id: str, limit: int = 100) -> int:
        """Internal bounded maintenance entrypoint; not mounted on HTTP routes."""
        if not 1 <= limit <= 500:
            raise TrialValidationError('commerce_public_invalid')
        try:
            run = str(UUID(run_id))
        except (ValueError, TypeError, AttributeError):
            raise TrialValidationError('commerce_public_invalid') from None
        if not self.store.write_enabled:
            raise TrialNotReadyError(('write_enabled',))
        with self.store._connect() as connection:
            with connection.transaction(), connection.cursor() as cursor:
                self.store._assert_runtime_role(cursor)
                self.store._assert_schema(cursor)
                _require_public_schema(cursor)
                cursor.execute("set local statement_timeout='10s'")
                cursor.execute('select app_private.redact_closed_commerce_public_requests(%s,%s) as count',
                               (run, limit))
                return int(cursor.fetchone()['count'])

    def redaction_due_count(self, *, cap: int = 100) -> int:
        """Return a bounded dry-run count without exposing customer data."""
        if not 1 <= cap <= 500:
            raise TrialValidationError('commerce_public_invalid')
        with self.store._connect() as connection:
            with connection.transaction(), connection.cursor() as cursor:
                self.store._assert_runtime_role(cursor)
                self.store._assert_schema(cursor)
                _require_public_schema(cursor)
                cursor.execute("set local statement_timeout='10s'")
                cursor.execute('select app_private.commerce_public_redaction_due_count(%s) as count',
                               (cap,))
                return int(cursor.fetchone()['count'])


def create_commerce_public_router(*, store: CommercePublicStorefront, enabled: bool,
        resolve_principal: Callable[[Request], TrialPrincipal] | None,
        resolve_client_address: Callable[[Request], str] | None,
        abuse_key: bytes, public_origin: str) -> APIRouter:
    router = APIRouter(tags=['commerce-public'])
    try:
        parsed = urlsplit(public_origin)
        valid_origin = (parsed.scheme == 'https' and bool(parsed.hostname)
            and not parsed.username and not parsed.password and not parsed.path
            and not parsed.query and not parsed.fragment
            and public_origin == f'https://{parsed.netloc}'.lower()
            and len(public_origin) <= 256)
    except (ValueError, TypeError):
        valid_origin = False
    configured = (enabled and valid_origin and callable(resolve_principal)
        and callable(resolve_client_address) and isinstance(abuse_key, bytes)
        and len(abuse_key) >= 32 and len(set(abuse_key)) >= 10)

    def available(request: Request) -> None:
        if not configured:
            raise _error(503, 'commerce_public_unavailable')
        if request.query_params:
            raise _error(422, 'request_invalid')

    def principal(request: Request) -> TrialPrincipal:
        try:
            actor = resolve_principal(request) if resolve_principal else None
        except Exception:
            raise _error(401, 'sign_in_required') from None
        if not isinstance(actor, TrialPrincipal) or actor.actor_kind != 'human':
            raise _error(401, 'sign_in_required')
        return actor

    async def invoke(operation):
        try:
            result = await run_in_threadpool(operation)
        except TrialPermissionDenied:
            raise _error(403, 'access_denied') from None
        except TrialNotReadyError:
            raise _error(503, 'commerce_public_unavailable') from None
        except TrialVersionConflict:
            raise _error(409, 'store_changed') from None
        except (TrialValidationError, EcommerceLifecycleValidationError) as exc:
            code = str(exc)
            status, public_code = {
                'commerce_public_unavailable': (404, 'store_unavailable'),
                'commerce_public_source_stale': (409, 'store_changed'),
                'commerce_public_stock_changed': (409, 'stock_changed'),
                'commerce_public_claim_queue_full': (409, 'Shop review is full. Finish an existing request before adding another.'),
            }.get(code, (422, 'request_invalid'))
            raise _error(status, public_code) from None
        except Exception as exc:
            code = getattr(getattr(exc, 'diag', None), 'message_primary', '')
            status, public_code = {
                'commerce_public_unavailable': (404, 'store_unavailable'),
                'commerce_public_invalid': (422, 'request_invalid'),
                'commerce_public_retry_conflict': (409, 'request_conflict'),
                'commerce_public_capacity': (429, 'try_later'),
                'commerce_public_request_closed': (409, 'request_closed'),
                'commerce_public_in_review': (409, 'request_in_review'),
                'commerce_public_close_conflict': (409, 'request_changed'),
                'commerce_public_close_state': (409, 'request_changed'),
            }.get(code, (503, 'commerce_public_unavailable'))
            raise _error(status, public_code) from None
        return JSONResponse(result, headers=_HEADERS)

    @router.get('/api/public/commerce/{handle}')
    async def catalog(handle: str, request: Request):
        available(request)
        return await invoke(lambda: store.catalog(handle=handle))

    @router.post('/api/public/commerce/{handle}/requests')
    async def receive(handle: str, request: Request):
        available(request)
        if request.headers.get('origin') != public_origin:
            raise _error(403, 'origin_required')
        try:
            address = ipaddress.ip_address(resolve_client_address(request))
        except Exception:
            raise _error(503, 'commerce_public_unavailable') from None
        if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
            address = address.ipv4_mapped
        body = await _body(request)
        client_key = hmac.new(abuse_key, b'commerce-public:v1:' + address.compressed.encode('ascii'),
                              sha256).hexdigest()
        return await invoke(lambda: store.receive(handle=handle, body=body, client_key=client_key))

    @router.get('/api/trial/v1/commerce-publications')
    async def publications(request: Request):
        available(request)
        actor = principal(request)
        return await invoke(lambda: store.publications(actor))

    @router.post('/api/trial/v1/commerce-publications')
    async def publish(request: Request):
        available(request)
        actor = principal(request)
        body = await _body(request)
        if set(body) != {'expectedVersion'}:
            raise _error(422, 'request_invalid')
        return await invoke(lambda: store.publish(actor, expected_version=body['expectedVersion']))

    @router.post('/api/trial/v1/commerce-publications/{handle}/revoke')
    async def revoke(handle: str, request: Request):
        available(request)
        actor = principal(request)
        body = await _body(request)
        if set(body) != {'previewDigest'}:
            raise _error(422, 'request_invalid')
        return await invoke(lambda: store.revoke(actor, handle=handle, preview_digest=body['previewDigest']))

    @router.get('/api/trial/v1/commerce-public-inbox')
    async def inbox(request: Request):
        if not configured or set(request.query_params) - {'after'} or len(request.query_params.getlist('after')) > 1:
            raise _error(422 if configured else 503, 'request_invalid' if configured else 'commerce_public_unavailable')
        after = request.query_params.get('after')
        actor = principal(request)
        return await invoke(lambda: store.inbox(actor, after=after))

    @router.get('/api/trial/v1/commerce-public-inbox/shop/{shop_request_id}/contact')
    async def shop_contact(shop_request_id: str, request: Request):
        available(request)
        actor = principal(request)
        return await invoke(lambda: store.shop_contact(actor,
                                                        shop_request_id=shop_request_id))

    @router.post('/api/trial/v1/commerce-public-inbox/{handle}/{request_id}/claim')
    async def claim(handle: str, request_id: str, request: Request):
        available(request)
        actor = principal(request)
        body = await _body(request)
        if body:
            raise _error(422, 'request_invalid')
        return await invoke(lambda: store.claim(actor, handle=handle, request_id=request_id))

    @router.post('/api/trial/v1/commerce-public-inbox/{handle}/{request_id}/close')
    async def close(handle: str, request_id: str, request: Request):
        available(request)
        actor = principal(request)
        body = await _body(request)
        if set(body) != {'reason'} or not isinstance(body['reason'], str):
            raise _error(422, 'request_invalid')
        return await invoke(lambda: store.close(actor, handle=handle,
                                                 request_id=request_id, reason=body['reason']))

    return router


def mount_commerce_public_routes(app, *, store, resolve_principal) -> None:
    enabled = (os.getenv('SUPERMEGA_COMMERCE_PUBLIC_ENABLED') == 'true'
        and os.getenv('SUPERMEGA_COMMERCE_PUBLIC_INGRESS') == 'vercel'
        and os.getenv('VERCEL') == '1'
        and os.getenv('VERCEL_ENV') in ('preview', 'production')
        and isinstance(store, PostgresTrialStore))
    key = os.getenv('SUPERMEGA_COMMERCE_PUBLIC_HMAC_KEY', '')
    abuse_key = bytes.fromhex(key) if re.fullmatch(r'[0-9a-fA-F]{64}', key) else b''
    adapter = CommercePublicStorefront(store)
    app.include_router(create_commerce_public_router(
        store=adapter, enabled=enabled, resolve_principal=resolve_principal,
        resolve_client_address=vercel_client_address, abuse_key=abuse_key,
        public_origin=os.getenv('SUPERMEGA_COMMERCE_PUBLIC_ORIGIN', '')))
