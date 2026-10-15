"""Workspace-authorized media with durable receipts in the existing event ledger.

An object is not visible through the application until its receipt commits.
Storage and PostgreSQL are not one transaction: an interrupted write can leave a
private orphan; retry safely verifies the same content-addressed object.
"""

from hashlib import sha256
import json
from uuid import uuid4

from .trial_store import (PostgresTrialStore, TrialPrincipal, TrialPermissionDenied,
                         TrialValidationError, TrialNotReadyError, TrialNotFound,
                         capabilities_for_product_entitlements, has_surface_read_capability)
from .website_media import PreparedPhoto, validate_asset_id
from .website_media_storage import SupabasePrivateMediaStorage

MAX_WORKSPACE_ASSETS = 1000
MAX_WORKSPACE_BYTES = 250 * 1024 * 1024
MAX_HOURLY_UPLOADS = 60
MEDIA_EVENT = "website.media.uploaded"


class WebsiteMediaStore:
    def __init__(self, store: PostgresTrialStore, storage: SupabasePrivateMediaStorage):
        self.store = store
        self.storage = storage

    def _reauthorize(self, cursor, actor: TrialPrincipal, *, write: bool):
        self.store._assert_active_identity_session(cursor, actor)
        capabilities = capabilities_for_product_entitlements(
            self.store._load_membership(cursor, actor),
            self.store._product_entitlements(cursor, actor.workspace_id))
        if ((write and "website.write" not in capabilities)
                or (not write and not has_surface_read_capability(capabilities, "website"))):
            raise TrialPermissionDenied("website.write" if write else "website.read")

    @staticmethod
    def _receipt(cursor, workspace_id: str, asset_id: str):
        cursor.execute("""select result_json from app_private.workspace_events
            where workspace_id=%s and surface='website' and event_type=%s
              and result_json->>'assetId'=%s order by created_at limit 1""",
            (workspace_id, MEDIA_EVENT, asset_id))
        row = cursor.fetchone()
        return row["result_json"] if row else None

    def put(self, principal: TrialPrincipal, photo: PreparedPhoto) -> dict:
        actor = principal.normalized()
        if actor.actor_kind != "human":
            raise TrialPermissionDenied("website.write")
        with self.store._guarded_cursor(actor, write=True, capability="website.write") as (cursor, _):
            # Serial quota admission and deduplication across all function instances.
            self.store._lock(cursor, f"website-media:{actor.workspace_id}")
            self._reauthorize(cursor, actor, write=True)
            existing = self._receipt(cursor, actor.workspace_id, photo.asset_id)
            if existing is not None:
                if existing != photo.receipt() or self.storage.get(actor.workspace_id, photo.asset_id) != photo.data:
                    raise TrialNotReadyError(("website_media_integrity_failed",))
                self._reauthorize(cursor, actor, write=True)
                return existing
            cursor.execute("""select count(*) as assets,
                coalesce(sum((result_json->>'bytes')::bigint),0) as bytes,
                count(*) filter(where created_at > clock_timestamp() - interval '1 hour') as recent
                from app_private.workspace_events
                where workspace_id=%s and surface='website' and event_type=%s""",
                (actor.workspace_id, MEDIA_EVENT))
            quota = cursor.fetchone()
            if quota["assets"] >= MAX_WORKSPACE_ASSETS or quota["bytes"] + len(photo.data) > MAX_WORKSPACE_BYTES:
                raise TrialValidationError("Your website photo storage is full. Contact support.")
            if quota["recent"] >= MAX_HOURLY_UPLOADS:
                raise TrialNotReadyError(("website_media_upload_rate_limited",))
            receipt = self.storage.put(actor.workspace_id, photo)
            if receipt != photo.receipt():
                raise TrialNotReadyError(("website_media_integrity_failed",))
            # Membership/session may have changed during a provider call or lock wait.
            self._reauthorize(cursor, actor, write=True)
            fingerprint = sha256(f"{MEDIA_EVENT}\n{actor.workspace_id}\n{photo.asset_id}".encode()).hexdigest()
            cursor.execute("""insert into app_private.workspace_events
                (event_id,workspace_id,command_id,command_fingerprint,surface,event_type,
                 actor_id,actor_kind,expected_version,resulting_version,payload_json,result_json)
                values(%s,%s,%s,%s,'website',%s,%s,'human',null,null,%s::jsonb,%s::jsonb)""",
                (str(uuid4()), actor.workspace_id, str(uuid4()), fingerprint, MEDIA_EVENT, actor.actor_id,
                 json.dumps({"assetId": photo.asset_id, "preparation": "webp-2048-v1"}), json.dumps(receipt)))
        return receipt  # The ledger transaction must commit before reporting success.

    def get(self, principal: TrialPrincipal, asset_id: str) -> tuple[bytes, dict]:
        asset_id = validate_asset_id(asset_id)
        actor = principal.normalized()
        if actor.actor_kind != "human":
            raise TrialPermissionDenied("website.read")
        with self.store._guarded_cursor(actor, write=False) as (cursor, capabilities):
            if not has_surface_read_capability(capabilities, "website"):
                raise TrialPermissionDenied("website.read")
            receipt = self._receipt(cursor, actor.workspace_id, asset_id)
            if receipt is None:
                raise TrialNotFound("Photo not found.")
            data = self.storage.get(actor.workspace_id, asset_id)
            if len(data) != receipt.get("bytes"):
                raise TrialNotReadyError(("website_media_integrity_failed",))
            self._reauthorize(cursor, actor, write=False)
        return data, receipt
