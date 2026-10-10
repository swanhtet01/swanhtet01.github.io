"""Durable Sites publication and inquiry adapter with source-pinned storage guards.

Channels start disabled; explicit publication retains an approved artifact.
Hosting activation requires explicit configuration and a saved, approved snapshot.
Customer text stays in PostgreSQL and never appears in errors or public receipts.
"""

from datetime import timezone
from typing import Any, Mapping
from urllib.parse import urlsplit

from .trial_store import PostgresTrialStore, TrialPrincipal, TrialNotReadyError, TrialValidationError
from .website_customer_review import _text, _time, _uuid
from .website_runtime import validate_website_state, _current_release_source
from .website_publishing_schema import require_publishing_schema
from .website_media_references import require_website_media_receipts, website_asset_ids
from .website_media_store import WebsiteMediaStore
from .website_published_media import read_published_photo, verify_photo_bytes


class WebsiteInquiryStore:
    def __init__(self, store: PostgresTrialStore, *, media_storage=None):
        self.store = store
        self.media_storage = media_storage

    def prepare_channel(self, principal: TrialPrincipal, *, channel_id: str,
                        page_id: str, expected_version: int, origin: str) -> dict[str, Any]:
        channel_id = _uuid(channel_id)
        page_id = _text(page_id, 80)
        try:
            parsed = urlsplit(origin)
            valid_port = parsed.port is None or 1 <= parsed.port <= 65535
        except (ValueError, TypeError):
            raise TrialValidationError('website_inquiry_origin_invalid') from None
        if (parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password
                or parsed.path or parsed.query or parsed.fragment
                or origin != f'https://{parsed.netloc}' or origin != origin.lower()
                or len(origin) > 256 or not valid_port):
            raise TrialValidationError('website_inquiry_origin_invalid')
        if type(expected_version) is not int or expected_version < 1:
            raise TrialValidationError('website_inquiry_version_invalid')
        with self.store._guarded_cursor(principal, write=True, capability='website.write') as (cursor, _):
            require_publishing_schema(cursor)
            cursor.execute("""select version,state_json,'sha256:' || encode(sha256(convert_to(
                app_private.website_review_json(state_json),'UTF8')),'hex') as source_digest from app_private.workspace_state
                where workspace_id=%s and surface='website' for share""", (principal.workspace_id,))
            source = cursor.fetchone()
            if source is None or source['version'] != expected_version:
                raise TrialValidationError('website_inquiry_source_stale')
            state = validate_website_state(source['state_json'])
            page = next((item for item in state['pages'] if item['id'] == page_id), None)
            if page is None:
                raise TrialValidationError('website_inquiry_page_missing')
            source_page = page['slug'].strip().rstrip('/') or '/'
            cursor.execute("""insert into app_private.website_inquiry_channels
                (channel_id,workspace_id,page_id,source_version,source_digest,site_name,source_page,allowed_origin,created_by)
                values(%s,%s,%s,%s,%s,%s,%s,%s,%s) on conflict(channel_id) do nothing""",
                (channel_id, principal.workspace_id, page_id, expected_version, source['source_digest'], state['siteName'], source_page, origin, principal.actor_id))
            cursor.execute("""select workspace_id,page_id,source_version,site_name,source_page,allowed_origin,enabled
                from app_private.website_inquiry_channels where channel_id=%s""", (channel_id,))
            channel = cursor.fetchone()
            if (channel is None or channel['workspace_id'] != principal.workspace_id
                    or channel['page_id'] != page_id or channel['allowed_origin'] != origin
                    or channel['source_version'] != expected_version or channel['site_name'] != state['siteName']
                    or channel['source_page'] != source_page):
                raise TrialValidationError('website_inquiry_channel_conflict')
            result = {'channelId': channel_id, 'enabled': channel['enabled']}
        return result

    def publish_channel(self, principal: TrialPrincipal, *, channel_id: str,
                        expected_version: int, public_origin: str) -> dict[str, Any]:
        """Publish one prepared page from its exact saved approval, not request HTML."""
        channel_id = _uuid(channel_id)
        if type(expected_version) is not int or expected_version < 1:
            raise TrialValidationError('website_inquiry_version_invalid')
        with self.store._guarded_cursor(principal, write=True, capability='website.write') as (cursor, _):
            require_publishing_schema(cursor)
            cursor.execute("""select snapshot_id,artifact_digest from app_private.website_inquiry_channels
                where channel_id=%s and workspace_id=%s""", (channel_id, principal.workspace_id))
            prior = cursor.fetchone()
            if prior and prior['snapshot_id']:
                snapshot, digest = prior['snapshot_id'], prior['artifact_digest']
            else:
                cursor.execute("""select version,state_json from app_private.workspace_state
                    where workspace_id=%s and surface='website' for share""", (principal.workspace_id,))
                source = cursor.fetchone()
                if source is None or source['version'] != expected_version:
                    raise TrialValidationError('website_inquiry_source_stale')
                state = validate_website_state(source['state_json'])
                release = _current_release_source(state)
                snapshot, digest = release['snapshotId'], release['artifactDigest']
                artifact = next(item['artifact'] for item in state['localPublishes'] if item['id'] == snapshot)
                require_website_media_receipts(cursor, principal.workspace_id, artifact)
                asset_ids = website_asset_ids(artifact)
                if asset_ids and self.media_storage is None:
                    raise TrialNotReadyError(('website_media_unavailable',))
                # Verify one asset at a time: no unbounded in-memory publication bundle.
                media = WebsiteMediaStore(self.store, self.media_storage)
                total = 0
                for asset_id in sorted(asset_ids):
                    data, receipt = media.get(principal, asset_id)
                    verify_photo_bytes(data, receipt, asset_id)
                    total += len(data)
                    if total > 8 * 1024 * 1024:
                        raise TrialValidationError('website_publication_photos_too_large')
                self.store._assert_active_identity_session(cursor, principal.normalized())
            cursor.execute('select app_private.publish_website_inquiry_channel(%s,%s,%s,%s,%s) as receipt',
                           (channel_id, expected_version, snapshot, digest, public_origin))
            result = cursor.fetchone()['receipt']
        return result

    def unpublish_channel(self, principal: TrialPrincipal, *, channel_id: str, artifact_digest: str) -> dict[str, Any]:
        channel_id = _uuid(channel_id)
        artifact_digest = _text(artifact_digest, 71)
        with self.store._guarded_cursor(principal, write=True, capability='website.write') as (cursor, _):
            require_publishing_schema(cursor)
            cursor.execute('select app_private.unpublish_website_inquiry_channel(%s,%s) as receipt', (channel_id, artifact_digest))
            result = cursor.fetchone()['receipt']
        return result

    def public_page(self, *, channel_id: str, public_origin: str) -> dict[str, Any] | None:
        channel_id = _uuid(channel_id)
        with self.store._connect() as connection:
            with connection.transaction(), connection.cursor() as cursor:
                self.store._assert_runtime_role(cursor)
                self.store._assert_schema(cursor)
                require_publishing_schema(cursor)
                cursor.execute("set local statement_timeout='5s'")
                cursor.execute('select app_private.read_website_inquiry_page(%s,%s) as page', (channel_id, public_origin))
                return cursor.fetchone()['page']

    def public_photo(self, *, channel_id: str, public_origin: str, asset_id: str) -> bytes:
        return read_published_photo(self.store, self.media_storage, channel_id=channel_id,
                                    public_origin=public_origin, asset_id=asset_id)

    def receive(self, *, channel_id: str, request_id: str, origin: str,
                payload: Mapping[str, Any], client_key: str) -> dict[str, Any]:
        """Server-only ingress. Caller must validate origin/address and bound body.

        No caller-supplied workspace or actor is accepted. SQL resolves a channel,
        enforces durable budgets and commits once before this method acknowledges.
        """
        channel_id, request_id = _uuid(channel_id), _uuid(request_id)
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
                require_publishing_schema(cursor)
                cursor.execute("set local statement_timeout='5s'")
                cursor.execute("set local lock_timeout='3s'")
                cursor.execute("""select app_private.receive_website_inquiry(
                    %s,%s,%s,%s,%s,%s,%s,%s) as receipt""",
                    (channel_id, request_id, origin, name, contact, message, True, client_key))
                result = cursor.fetchone()['receipt']
        return result

    def change_inquiry(self, principal: TrialPrincipal, *, channel_id: str, request_id: str,
                       action_id: str, expected_revision: int, operation: str, note: str = '') -> dict[str, Any]:
        channel_id, request_id, action_id = _uuid(channel_id), _uuid(request_id), _uuid(action_id)
        if (type(expected_revision) is not int or not 1 <= expected_revision < 9007199254740991
                or operation not in ('claim', 'release', 'complete', 'reopen', 'note')
                or not isinstance(note, str) or len(note) > 800 or '\x00' in note
                or (operation != 'note' and note != '')):
            raise TrialValidationError('website_inquiry_invalid')
        with self.store._guarded_cursor(principal, write=True, capability='website.write') as (cursor, _):
            require_publishing_schema(cursor)
            cursor.execute("set local statement_timeout='5s'")
            cursor.execute("set local lock_timeout='3s'")
            cursor.execute('select app_private.change_website_inquiry(%s,%s,%s,%s,%s,%s) as receipt',
                           (channel_id, request_id, action_id, expected_revision, operation, note))
            return cursor.fetchone()['receipt']

    def inbox(self, principal: TrialPrincipal, *, before: tuple[str, str, str] | None = None,
              view: str = 'open') -> dict[str, Any]:
        # Keyset pagination is bounded and stable when new requests arrive.
        if view not in ('open', 'done'):
            raise TrialValidationError('website_inquiry_view_invalid')
        boundary, parameters = '', (principal.workspace_id,)
        status_filter = "and i.status='done'" if view == 'done' else "and i.status in ('new','in_progress')"
        if before is not None:
            if not isinstance(before, tuple) or len(before) != 3:
                raise TrialValidationError('website_inquiry_cursor_invalid')
            _time(before[0])
            boundary = 'and (i.received_at,i.channel_id,i.request_id)<(%s::timestamptz,%s::uuid,%s::uuid)'
            parameters += (before[0], _uuid(before[1]), _uuid(before[2]))
        with self.store._guarded_cursor(principal, write=False, capability='website.write') as (cursor, _):
            require_publishing_schema(cursor)
            cursor.execute("""select i.channel_id,i.request_id,i.name,i.contact,i.message,i.received_at,
                c.site_name,c.source_page,i.status,i.revision,i.assigned_to,i.followup_note,i.updated_by,i.updated_at
                from app_private.website_inbox i
                join app_private.website_inquiry_channels c on c.channel_id=i.channel_id
                where i.workspace_id=%s """ + status_filter + ' ' + boundary + " order by i.received_at desc,i.channel_id desc,i.request_id desc limit 51", parameters)
            rows = cursor.fetchall()
            entries = [{'channelId': str(row['channel_id']), 'requestId': str(row['request_id']),
                        'name': row['name'], 'contact': row['contact'], 'message': row['message'],
                        'siteName': row['site_name'], 'sourcePage': row['source_page'],
                        'receivedAt': row['received_at'].astimezone(timezone.utc).isoformat(),
                        'status': row['status'], 'revision': row['revision'], 'assignedTo': row['assigned_to'],
                        'note': row['followup_note'], 'updatedBy': row['updated_by'],
                        'updatedAt': row['updated_at'].astimezone(timezone.utc).isoformat() if row['updated_at'] else None}
                       for row in rows[:50]]
            last = entries[-1] if len(rows) > 50 else None
            cursor.execute("""select count(*) filter(where status<>'done') as open,
                count(*) filter(where status='done') as done from app_private.website_inbox where workspace_id=%s""",
                (principal.workspace_id,))
            counts = cursor.fetchone()
            return {'inquiries': entries, 'counts': {'open': counts['open'], 'done': counts['done']}, 'nextBefore':
                    [last['receivedAt'], last['channelId'], last['requestId']] if last else None}

    def publications(self, principal: TrialPrincipal, *, public_origin: str) -> dict[str, Any]:
        with self.store._guarded_cursor(principal, write=False, capability='website.write') as (cursor, _):
            require_publishing_schema(cursor)
            cursor.execute("""select channel_id,page_id,source_version,enabled,artifact_digest,snapshot_id,published_at
                from app_private.website_inquiry_channels where workspace_id=%s and allowed_origin=%s
                and snapshot_id is not null order by enabled desc,published_at desc,channel_id desc limit 25""",
                (principal.workspace_id, public_origin))
            publications = [
                {'channelId': str(row['channel_id']), 'pageId': row['page_id'], 'sourceVersion': row['source_version'],
                 'enabled': row['enabled'], 'artifactDigest': row['artifact_digest'], 'snapshotId': row['snapshot_id'],
                 'publishedAt': row['published_at'].astimezone(timezone.utc).isoformat()}
                for row in cursor.fetchall()]
            cursor.execute("select version,state_json from app_private.workspace_state where workspace_id=%s and surface='website'",
                           (principal.workspace_id,))
            saved = cursor.fetchone()
            source = None
            if saved is not None:
                try:
                    release = _current_release_source(validate_website_state(saved['state_json']))
                    source = {'version': saved['version'], 'snapshotId': release['snapshotId'],
                              'artifactDigest': release['artifactDigest']}
                except TrialValidationError:
                    pass  # No current approved snapshot; publishing stays unavailable.
            return {'publicOrigin': public_origin, 'source': source, 'publications': publications}
