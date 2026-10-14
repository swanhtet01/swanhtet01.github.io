"""Tenant-proven Sites hostnames. No browser credential or arbitrary provider URL."""

from __future__ import annotations

from datetime import timezone
import ipaddress
import json
import os
import re
from secrets import token_urlsafe
from typing import Any, Mapping
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request as UrlRequest, build_opener
from uuid import uuid4

from .trial_store import PostgresTrialStore, TrialNotFound, TrialNotReadyError, TrialPrincipal, TrialValidationError
from .website_customer_review import _text, _uuid
from .website_media import validate_asset_id
from .website_published_media import verify_photo_bytes
from .website_publishing_schema import require_publishing_schema

_HOST_LABEL = re.compile(r'^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$')
_RESERVED_SUFFIXES = ('.localhost', '.local', '.test', '.invalid', '.example', '.vercel.app', '.supermega.dev')
_TIMEOUT = 5.0


def normalize_hostname(value: Any) -> str:
    """Accept DNS ASCII (including punycode) with no port, wildcard or URL syntax."""
    if not isinstance(value, str) or len(value) > 254 or value != value.strip():
        raise TrialValidationError('website_domain_invalid')
    host = value.lower().removesuffix('.')
    labels = host.split('.')
    if (len(labels) < 2 or len(host) > 253 or any(not _HOST_LABEL.fullmatch(part) for part in labels)
            or labels[-1].isdigit() or host in ('localhost', 'supermega.dev')
            or any(host.endswith(suffix) for suffix in _RESERVED_SUFFIXES)
            or any(part.startswith('xn--') and not _valid_punycode(part) for part in labels)):
        raise TrialValidationError('website_domain_invalid')
    return host


def _valid_punycode(label: str) -> bool:
    try:
        return label.encode('ascii').decode('idna').encode('idna').decode('ascii') == label
    except (UnicodeError, ValueError):
        return False


def require_domain_schema(cursor) -> None:
    require_publishing_schema(cursor)
    cursor.execute("""select coalesce((select relrowsecurity and relforcerowsecurity
        from pg_class where oid=to_regclass('app_private.website_domain_bindings')),false) as guarded,
        to_regprocedure('app_private.claim_website_domain(uuid,text,uuid,text)') is not null as claim,
        to_regprocedure('app_private.record_website_domain_check(uuid,text,boolean,jsonb,text)') is not null as record_check,
        to_regprocedure('app_private.claim_website_domain_renewals(integer)') is not null as claim_renewals,
        to_regprocedure('app_private.complete_website_domain_renewal(uuid,text)') is not null as complete_renewal,
        to_regprocedure('app_private.begin_website_domain_release(text)') is not null as begin_release,
        to_regprocedure('app_private.finish_website_domain_release(text)') is not null as finish_release,
        to_regprocedure('app_private.read_website_domain_page(text)') is not null as page,
        to_regprocedure('app_private.read_website_domain_media(text,text)') is not null as media,
        to_regprocedure('app_private.receive_website_domain_inquiry(text,uuid,text,text,text,boolean,text)') is not null as inquiry""")
    row = cursor.fetchone()
    if not row or not all(row[key] is True for key in ('guarded', 'claim', 'record_check',
                                                     'claim_renewals', 'complete_renewal',
                                                     'begin_release', 'finish_release', 'page', 'media', 'inquiry')):
        raise TrialNotReadyError(('website_domain_schema_unverified',))


class _RefuseRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class ProviderUnavailable(Exception):
    """Safe issue code; no response text or credential is retained."""


def _read_json(url: str, *, token: str = '', method: str = 'GET', body: dict | None = None,
               accept_not_found: bool = False) -> dict:
    request = UrlRequest(url, data=json.dumps(body).encode() if body is not None else None,
        headers={**({'Authorization': f'Bearer {token}'} if token else {}),
                 'Accept': 'application/json', **({'Content-Type': 'application/json'} if body is not None else {})},
        method=method)
    opener = build_opener(ProxyHandler({}), _RefuseRedirects())
    try:
        with opener.open(request, timeout=_TIMEOUT) as response:
            raw = response.read(16385)
    except HTTPError as exc:
        code = exc.code
        exc.close()
        if accept_not_found and code == 404:
            return {}
        raise ProviderUnavailable('provider_conflict' if code in (400, 409) else 'provider_unavailable') from None
    except (URLError, OSError, TimeoutError, ValueError):
        raise ProviderUnavailable('provider_unavailable') from None
    if len(raw) > 16384:
        raise ProviderUnavailable('provider_unavailable')
    if not raw and method == 'DELETE':
        return {}
    try:
        data = json.loads(raw)
    except (ValueError, UnicodeError):
        raise ProviderUnavailable('provider_unavailable') from None
    if not isinstance(data, dict):
        raise ProviderUnavailable('provider_unavailable')
    return data


def tenant_txt_proven(hostname: str, challenge: str) -> bool:
    """A per-claim TXT proof; Vercel's project-wide verified flag is insufficient."""
    record_name = f'_supermega.{hostname}'
    data = _read_json('https://dns.google/resolve?' + urlencode({'name': record_name, 'type': 'TXT', 'cd': '0'}))
    if data.get('Status') != 0 or data.get('TC') is not False:
        return False
    exact = '"' + challenge + '"'
    answers = data.get('Answer')
    if not isinstance(answers, list):
        return False
    return any(isinstance(answer, dict) and answer.get('type') == 16
               and answer.get('name', '').lower() == record_name + '.'
               and answer.get('data') == exact for answer in answers)


class VercelDomainProvider:
    def __init__(self, *, project_id: str, team_id: str, token: str):
        self.project_id, self.team_id, self._token = project_id, team_id, token

    @classmethod
    def from_environment(cls):
        project, team, token = (os.getenv(name, '') for name in ('VERCEL_PROJECT_ID', 'VERCEL_ORG_ID', 'VERCEL_TOKEN'))
        ready = (os.getenv('SUPERMEGA_WEBSITE_DOMAINS_ENABLED') == 'true'
            and os.getenv('SUPERMEGA_WEBSITE_PUBLISHING_ENABLED') == 'true'
            and os.getenv('SUPERMEGA_WEBSITE_INGRESS') == 'vercel'
            and os.getenv('VERCEL') == '1' and os.getenv('VERCEL_ENV') in ('preview', 'production')
            and re.fullmatch(r'prj_[A-Za-z0-9]+', project or '')
            and re.fullmatch(r'team_[A-Za-z0-9]+', team or '') and bool(token)
            and project == os.getenv('SUPERMEGA_WEBSITE_DOMAIN_PROJECT_ID')
            and team == os.getenv('SUPERMEGA_WEBSITE_DOMAIN_TEAM_ID'))
        return cls(project_id=project, team_id=team, token=token) if ready else None

    def _url(self, route: str, *, config: bool = False) -> str:
        return f'https://api.vercel.com{route}?' + urlencode({'teamId': self.team_id,
            **({'projectIdOrName': self.project_id} if config else {})})

    def add(self, hostname: str) -> dict:
        route = f'/v10/projects/{quote(self.project_id)}/domains'
        try:
            result = _read_json(self._url(route), token=self._token, method='POST', body={'name': hostname})
        except ProviderUnavailable as exc:
            if str(exc) != 'provider_conflict':
                raise
            # A replay may find a previously attached domain. A different
            # project or tenant is never silently moved or force-attached.
            return self.get(hostname)
        return self._checked_domain(result, hostname)

    def get(self, hostname: str) -> dict:
        route = f'/v9/projects/{quote(self.project_id)}/domains/{quote(hostname)}'
        data = _read_json(self._url(route), token=self._token, accept_not_found=True)
        if not data:
            raise ProviderUnavailable('provider_missing')
        return self._checked_domain(data, hostname)

    def verify(self, hostname: str) -> dict:
        route = f'/v9/projects/{quote(self.project_id)}/domains/{quote(hostname)}/verify'
        return self._checked_domain(_read_json(self._url(route), token=self._token, method='POST'), hostname)

    def config(self, hostname: str) -> dict:
        route = f'/v6/domains/{quote(hostname)}/config'
        data = _read_json(self._url(route, config=True), token=self._token)
        if type(data.get('misconfigured')) is not bool:
            raise ProviderUnavailable('provider_unavailable')
        return data

    def remove(self, hostname: str) -> None:
        route = f'/v9/projects/{quote(self.project_id)}/domains/{quote(hostname)}'
        _read_json(self._url(route), token=self._token, method='DELETE', accept_not_found=True)

    def _checked_domain(self, data: dict, hostname: str) -> dict:
        if (data.get('name') != hostname or data.get('projectId') != self.project_id
                or data.get('redirect') or data.get('gitBranch') or data.get('customEnvironmentId')
                or type(data.get('verified')) is not bool):
            raise ProviderUnavailable('provider_mismatch')
        return data


def recommended_dns(hostname: str, provider_domain: Mapping[str, Any], config: Mapping[str, Any]) -> dict | None:
    """Expose a provider-recommended record, never a guessed static target."""
    apex = provider_domain.get('apexName')
    kind, field = ('A', 'recommendedIPv4') if apex == hostname else ('CNAME', 'recommendedCNAME')
    candidates = config.get(field)
    if not isinstance(candidates, list):
        return None
    for item in sorted(candidates, key=lambda entry: entry.get('rank', 2**31)
                       if isinstance(entry, dict) and type(entry.get('rank')) is int else 2**31):
        value = item.get('value') if isinstance(item, dict) else item
        if kind == 'A':
            addresses = value if isinstance(value, list) else [value]
            value = next((str(ipaddress.IPv4Address(address)) for address in addresses
                          if isinstance(address, str) and _valid_ipv4(address)), None)
            if value is None:
                continue
        else:
            if not isinstance(value, str):
                continue
            value = value.lower().removesuffix('.')
            labels = value.split('.')
            if len(value) > 253 or len(labels) < 2 or any(not _HOST_LABEL.fullmatch(label) for label in labels):
                continue
        return {'type': kind, 'name': hostname, 'value': value}
    return None


def _valid_ipv4(value: str) -> bool:
    try:
        ipaddress.IPv4Address(value)
        return True
    except ipaddress.AddressValueError:
        return False


def provider_txt_challenge(hostname: str, provider_domain: Mapping[str, Any]) -> dict | None:
    """Return one bounded Vercel TXT challenge for this hostname or its apex."""
    apex = provider_domain.get('apexName')
    if not isinstance(apex, str):
        return None
    try:
        apex = normalize_hostname(apex)
    except TrialValidationError:
        return None
    if hostname != apex and not hostname.endswith('.' + apex):
        return None
    records = provider_domain.get('verification')
    if not isinstance(records, list):
        return None
    for record in records[:8]:
        if not isinstance(record, dict) or record.get('type') != 'TXT':
            continue
        name, value = record.get('domain'), record.get('value')
        if not isinstance(name, str) or not isinstance(value, str):
            continue
        name = name.lower().removesuffix('.')
        labels = name.split('.')
        if (len(name) > 253 or len(labels) < 2
                or any(not re.fullmatch(r'[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?', label) for label in labels)
                or not (name == hostname or name.endswith('.' + hostname)
                        or name == apex or name.endswith('.' + apex))
                or not 1 <= len(value) <= 512 or any(not 32 <= ord(char) <= 126 for char in value)):
            continue
        return {'type': 'TXT', 'name': name, 'value': value}
    return None


class WebsiteDomainStore:
    def __init__(self, store: PostgresTrialStore, *, media_storage=None, provider: VercelDomainProvider):
        self.store, self.media_storage, self.provider = store, media_storage, provider

    def _owned(self, principal: TrialPrincipal) -> dict | None:
        with self.store._guarded_cursor(principal, write=False, capability='website.write') as (cursor, _):
            require_domain_schema(cursor)
            cursor.execute("""select b.binding_id,b.hostname,b.channel_id,b.challenge,b.state,b.verified_until,
                b.dns_record,b.issue,c.enabled as channel_enabled
                from app_private.website_domain_bindings b
                join app_private.website_inquiry_channels c
                  on c.workspace_id=b.workspace_id and c.channel_id=b.channel_id
                where b.workspace_id=%s and b.state<>'released' limit 1""", (principal.workspace_id,))
            return cursor.fetchone()

    def status(self, principal: TrialPrincipal) -> dict:
        row = self._owned(principal)
        if row is None:
            return {'enabled': True, 'domain': None}
        until = row['verified_until']
        from datetime import datetime
        active = (row['state'] == 'active' and row['channel_enabled']
                  and until is not None and until > datetime.now(timezone.utc))
        issue = ('channel_unpublished' if not row['channel_enabled'] else
                 row['issue'] or ('verification_expired' if row['state'] == 'active' and not active else ''))
        return {'enabled': True, 'domain': {
            'hostname': row['hostname'], 'channelId': str(row['channel_id']),
            'state': 'active' if active else 'pending',
            'verification': {'name': '_supermega.' + row['hostname'], 'type': 'TXT', 'value': row['challenge']},
            'dns': row['dns_record'], **({'issue': issue} if issue else {})}}

    def claim(self, principal: TrialPrincipal, *, hostname: str, channel_id: str) -> dict:
        hostname, channel_id = normalize_hostname(hostname), _uuid(channel_id)
        challenge = 'supermega-domain=v1:' + token_urlsafe(24)
        with self.store._guarded_cursor(principal, write=True, capability='website.write') as (cursor, _):
            require_domain_schema(cursor)
            cursor.execute('select app_private.claim_website_domain(%s,%s,%s,%s) as receipt',
                           (str(uuid4()), hostname, channel_id, challenge))
            receipt = cursor.fetchone()['receipt']
        if receipt['replay'] and self.status(principal)['domain']['state'] == 'active':
            return self.status(principal)
        # A claim only reserves the hostname locally and returns its fresh TXT
        # challenge. Do not attach an arbitrary domain to the provider before
        # this tenant proves control of it.
        self._record(principal, receipt['bindingId'], hostname, verified=False,
                     dns=None, issue='ownership_pending')
        return self.status(principal)

    def _record(self, principal: TrialPrincipal, binding_id: str, hostname: str,
                *, verified: bool, dns: dict | None, issue: str) -> None:
        row = self._owned(principal)
        if row is None or row['hostname'] != hostname or str(row['binding_id']) != str(binding_id):
            raise TrialValidationError('website_domain_changed')
        with self.store._guarded_cursor(principal, write=True, capability='website.write') as (cursor, _):
            require_domain_schema(cursor)
            cursor.execute("select app_private.record_website_domain_check(%s,%s,%s,%s::jsonb,%s)",
                           (binding_id, row['challenge'], verified, json.dumps(dns) if dns else None, issue))

    def check(self, principal: TrialPrincipal, *, hostname: str) -> dict:
        hostname = normalize_hostname(hostname)
        row = self._owned(principal)
        if row is None or row['hostname'] != hostname:
            raise TrialValidationError('website_domain_changed')
        dns = row['dns_record']
        issue = 'ownership_pending'
        verified = False
        try:
            tenant_proof = tenant_txt_proven(hostname, row['challenge'])
            if not tenant_proof:
                self._record(principal, str(row['binding_id']), hostname,
                             verified=False, dns=None, issue='ownership_pending')
                return self.status(principal)
            try:
                domain = self.provider.get(hostname)
            except ProviderUnavailable as exc:
                if str(exc) != 'provider_missing':
                    raise
                # A failed initial attachment remains recoverable after the
                # tenant has proved the fresh per-claim DNS challenge.
                domain = self.provider.add(hostname)
            if not domain['verified']:
                try:
                    domain = self.provider.verify(hostname)
                except ProviderUnavailable as exc:
                    if str(exc) != 'provider_conflict' or provider_txt_challenge(hostname, domain) is None:
                        raise
            if not domain['verified']:
                dns = provider_txt_challenge(hostname, domain)
                issue = 'provider_verification_pending'
            else:
                config = self.provider.config(hostname)
                dns = recommended_dns(hostname, domain, config)
                if config['misconfigured'] is False:
                    verified, issue = True, ''
                else:
                    issue = 'dns_pending'
        except ProviderUnavailable as exc:
            issue = str(exc)
        self._record(principal, str(row['binding_id']), hostname,
                     verified=verified, dns=dns, issue=issue)
        return self.status(principal)

    def renew_due(self, *, limit: int = 20) -> dict:
        """Recheck a bounded due batch for a separately scheduled worker."""
        if not self.store.write_enabled or self.provider is None:
            raise TrialNotReadyError(('website_domain_renewal_unavailable',))
        if type(limit) is not int or not 1 <= limit <= 20:
            raise TrialValidationError('website_domain_invalid')
        with self.store._connect() as connection:
            with connection.transaction(), connection.cursor() as cursor:
                self.store._assert_runtime_role(cursor)
                self.store._assert_schema(cursor)
                require_domain_schema(cursor)
                cursor.execute("set local statement_timeout='5s'")
                cursor.execute('select * from app_private.claim_website_domain_renewals(%s)', (limit,))
                due = cursor.fetchall()
        renewed = 0
        for row in due:
            hostname = normalize_hostname(row['hostname'])
            try:
                if not tenant_txt_proven(hostname, row['challenge']):
                    continue
                domain = self.provider.get(hostname)
                config = self.provider.config(hostname)
                if not domain['verified'] or config['misconfigured'] is not False:
                    continue
            except ProviderUnavailable:
                continue
            with self.store._connect() as connection:
                with connection.transaction(), connection.cursor() as cursor:
                    self.store._assert_runtime_role(cursor)
                    self.store._assert_schema(cursor)
                    require_domain_schema(cursor)
                    cursor.execute("set local statement_timeout='5s'")
                    cursor.execute('select app_private.complete_website_domain_renewal(%s,%s) as renewed',
                                   (row['binding_id'], row['challenge']))
                    renewed += int(cursor.fetchone()['renewed'] is True)
        return {'examined': len(due), 'renewed': renewed, 'notRenewed': len(due) - renewed}

    def release(self, principal: TrialPrincipal, *, hostname: str) -> dict:
        hostname = normalize_hostname(hostname)
        with self.store._guarded_cursor(principal, write=True, capability='website.write') as (cursor, _):
            require_domain_schema(cursor)
            cursor.execute('select app_private.begin_website_domain_release(%s)', (hostname,))
        # Local routing closes first, and the hostname remains reserved until
        # Vercel detachment has succeeded. A failed cleanup is retryable.
        try:
            self.provider.remove(hostname)
        except ProviderUnavailable:
            return self.status(principal)
        with self.store._guarded_cursor(principal, write=True, capability='website.write') as (cursor, _):
            require_domain_schema(cursor)
            cursor.execute('select app_private.finish_website_domain_release(%s)', (hostname,))
        return self.status(principal)

    def public_page(self, hostname: str) -> dict | None:
        with self.store._connect() as connection:
            with connection.transaction(), connection.cursor() as cursor:
                self.store._assert_runtime_role(cursor)
                self.store._assert_schema(cursor)
                require_domain_schema(cursor)
                cursor.execute("set local statement_timeout='5s'")
                cursor.execute('select app_private.read_website_domain_page(%s) as page', (hostname,))
                return cursor.fetchone()['page']

    def public_photo(self, hostname: str, asset_id: str) -> bytes:
        asset_id = validate_asset_id(asset_id)
        if self.media_storage is None:
            raise TrialNotReadyError(('website_media_unavailable',))
        with self.store._connect() as connection:
            with connection.transaction(), connection.cursor() as cursor:
                self.store._assert_runtime_role(cursor)
                self.store._assert_schema(cursor)
                require_domain_schema(cursor)
                cursor.execute("set local statement_timeout='5s'")
                def access():
                    cursor.execute('select app_private.read_website_domain_media(%s,%s) as media',
                                   (hostname, asset_id))
                    return cursor.fetchone()['media']
                before = access()
                if before is None:
                    raise TrialNotFound('Photo not found.')
                data = self.media_storage.get(before['workspaceId'], asset_id)
                verify_photo_bytes(data, before['receipt'], asset_id)
                if access() != before:
                    raise TrialNotFound('Photo not found.')
                return data

    def receive(self, *, hostname: str, request_id: str, payload: Mapping[str, Any], client_key: str) -> dict:
        request_id = _uuid(request_id)
        if not self.store.write_enabled:
            raise TrialNotReadyError(('write_enabled',))
        if not isinstance(payload, Mapping) or set(payload) != {'name', 'contact', 'message', 'consent'}:
            raise TrialValidationError('website_inquiry_invalid')
        name, contact, message = (_text(payload[field], limit)
                                  for field, limit in (('name', 80), ('contact', 120), ('message', 500)))
        if payload['consent'] is not True:
            raise TrialValidationError('website_inquiry_consent_required')
        with self.store._connect() as connection:
            with connection.transaction(), connection.cursor() as cursor:
                self.store._assert_runtime_role(cursor)
                self.store._assert_schema(cursor)
                require_domain_schema(cursor)
                cursor.execute("set local statement_timeout='5s'")
                cursor.execute("set local lock_timeout='3s'")
                cursor.execute("""select app_private.receive_website_domain_inquiry(
                    %s,%s,%s,%s,%s,%s,%s) as receipt""",
                    (hostname, request_id, name, contact, message, True, client_key))
                return cursor.fetchone()['receipt']
