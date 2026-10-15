"""Resolve one photo from an active, approved publication, never from a draft.

The private object store remains private. A narrow server-only database function
derives the workspace and committed receipt from the published channel. Access
is checked again after the provider call so withdrawal/suspension takes effect.
"""

from hashlib import sha256

from .trial_store import TrialNotFound, TrialNotReadyError
from .website_publishing_schema import require_publishing_schema
from .website_customer_review import _uuid
from .website_media import MAX_ASSET_BYTES, MAX_IMAGE_EDGE, validate_asset_id


def verify_photo_bytes(data: bytes, receipt: dict, asset_id: str) -> None:
    if (not isinstance(data, bytes) or not isinstance(receipt, dict)
            or receipt.get('assetId') != asset_id or receipt.get('visibility') != 'private'
            or receipt.get('contentType') != 'image/webp'
            or receipt.get('sha256') != asset_id[:-5]
            or type(receipt.get('bytes')) is not int or receipt['bytes'] != len(data)
            or not 12 <= len(data) <= MAX_ASSET_BYTES
            or any(type(receipt.get(size)) is not int or not 1 <= receipt[size] <= MAX_IMAGE_EDGE
                   for size in ('width', 'height'))
            or data[:4] != b'RIFF' or data[8:12] != b'WEBP'
            or sha256(data).hexdigest() != asset_id[:-5]):
        raise TrialNotReadyError(('website_media_integrity_failed',))


def read_published_photo(store, storage, *, channel_id: str, public_origin: str, asset_id: str) -> bytes:
    channel_id, asset_id = _uuid(channel_id), validate_asset_id(asset_id)
    if storage is None:
        raise TrialNotReadyError(('website_media_unavailable',))
    with store._connect() as connection:
        with connection.transaction(), connection.cursor() as cursor:
            store._assert_runtime_role(cursor)
            store._assert_schema(cursor)
            require_publishing_schema(cursor)
            cursor.execute("set local statement_timeout='5s'")

            def access():
                cursor.execute('select app_private.read_website_published_media(%s,%s,%s) as media',
                               (channel_id, public_origin, asset_id))
                return cursor.fetchone()['media']

            before = access()
            if before is None:
                raise TrialNotFound('Photo not found.')
            data = storage.get(before['workspaceId'], asset_id)
            verify_photo_bytes(data, before['receipt'], asset_id)
            if access() != before:
                raise TrialNotFound('Photo not found.')
    return data
