"""Private, tenant-bound primary Shop photos for the managed Commerce catalog.

Bindings are versioned independently of the accountable Commerce state. A
binding is visible only after its immutable object and ledger receipt commit.
The private object can be orphaned if storage succeeds but PostgreSQL fails;
its attempt stays quota-charged, and this module never makes it public.
"""

from hashlib import sha256
import json
import logging
import re
from uuid import uuid4

from fastapi import BackgroundTasks, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool
from starlette.requests import ClientDisconnect

from .trial_store import (PostgresTrialStore, TrialNotFound, TrialNotReadyError,
                          TrialPermissionDenied, TrialPrincipal, TrialValidationError,
                          TrialVersionConflict, capabilities_for_product_entitlements,
                          has_surface_read_capability)
from .website_media import (IMAGE_TYPES, MAX_ASSET_BYTES, MAX_UPLOAD_BYTES,
                            PreparedPhoto, prepare_photo, validate_asset_id)
from .website_media_storage import (MediaStorageConfig, SupabasePrivateMediaStorage,
                                    SHOP_ATTEMPT_FENCE_RECEIPT)

PRIVATE_HEADERS = {"Cache-Control": "private, no-store", "Pragma": "no-cache",
                   "X-Content-Type-Options": "nosniff", "Vary": "Authorization, X-Supermega-Workspace-Id"}
MEDIA_EVENT = "commerce.shop_photo.uploaded"
REMOVE_EVENT = "commerce.shop_photo.removed"
COLLECT_EVENT = "commerce.shop_photo.collected"
FENCE_EVENT = "commerce.shop_photo.attempt_fenced"
MAX_WORKSPACE_ASSETS = 1000
MAX_WORKSPACE_BYTES = 250 * 1024 * 1024
MAX_WORKSPACE_FENCES = 1000
MAX_HOURLY_UPLOADS = 60
MAX_CATALOG_ITEMS = 2000
MAX_GENERATION = 9007199254740991
# A code-reviewed server rollout must explicitly change this after the private
# SQL and bucket are deployed. A storage key or browser flag cannot enable it.
SHOP_MEDIA_SERVER_ENABLED = False
_MATCH = re.compile(r'^"(0|[1-9][0-9]{0,15})"$')
_LOG = logging.getLogger(__name__)


def _sku(value: str) -> str:
    if (not isinstance(value, str) or not 1 <= len(value) <= 160
            or value != value.strip() or any(ord(character) < 32 or ord(character) == 127 for character in value)):
        raise TrialValidationError("Invalid product SKU.")
    return value


def _generation(value: str | None) -> int:
    if value is None:
        raise HTTPException(428, detail={"code": "shop_media_version_required"})
    matched = _MATCH.fullmatch(value)
    if matched is None or int(matched.group(1)) > MAX_GENERATION:
        raise HTTPException(400, detail={"code": "shop_media_version_invalid"})
    return int(matched.group(1))


def _shop_media_schema_ready(store: PostgresTrialStore, actor: TrialPrincipal) -> bool:
    """Check the optional candidate tables without querying an absent table."""
    with store._guarded_cursor(actor, write=False) as (cursor, _):
        cursor.execute("""select count(*) = 3 as ready from pg_catalog.pg_class c
            join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'app_private' and c.relkind = 'r'
              and c.relname in ('shop_media_upload_attempts',
                'shop_media_assets', 'shop_product_media')
              and c.relrowsecurity and c.relforcerowsecurity""")
        row = cursor.fetchone()
        return bool(row and row["ready"])


class ShopMediaStore:
    def __init__(self, store: PostgresTrialStore, storage: SupabasePrivateMediaStorage):
        self.store = store
        self.storage = storage

    def _reauthorize(self, cursor, actor: TrialPrincipal, *, write: bool) -> None:
        self.store._assert_active_identity_session(cursor, actor)
        products = self.store._product_entitlements(cursor, actor.workspace_id)
        capabilities = capabilities_for_product_entitlements(
            self.store._load_membership(cursor, actor), products)
        capability = "commerce.write" if write else "commerce.read"
        if (actor.actor_kind != "human" or "commerce" not in products
                or (write and capability not in capabilities)
                or (not write and not has_surface_read_capability(capabilities, "commerce"))):
            raise TrialPermissionDenied(capability)

    def _catalog(self, cursor, actor: TrialPrincipal) -> dict[str, str]:
        cursor.execute("""select state_json from app_private.workspace_state
            where workspace_id=%s and surface='commerce'""", (actor.workspace_id,))
        row = cursor.fetchone()
        if row is None:
            return {}
        state = row["state_json"]
        if isinstance(state, str):
            try:
                state = json.loads(state)
            except ValueError as exc:
                raise TrialNotReadyError(("shop_media_catalog_invalid",)) from exc
        if not isinstance(state, dict) or not isinstance(state.get("items"), list):
            raise TrialNotReadyError(("shop_media_catalog_invalid",))
        items = state["items"]
        if len(items) > MAX_CATALOG_ITEMS:
            raise TrialNotReadyError(("shop_media_catalog_invalid",))
        anchors = {}
        for baseline in state.get("catalogBaselines", []):
            if (not isinstance(baseline, dict) or not isinstance(baseline.get("sku"), str)
                    or not isinstance(baseline.get("anchorDigest"), str)):
                raise TrialNotReadyError(("shop_media_catalog_invalid",))
            if baseline["sku"] in anchors:
                raise TrialNotReadyError(("shop_media_catalog_invalid",))
            anchors[baseline["sku"]] = baseline["anchorDigest"]
        skus = {}
        for item in items:
            if not isinstance(item, dict) or not isinstance(item.get("sku"), str):
                raise TrialNotReadyError(("shop_media_catalog_invalid",))
            sku = item["sku"]
            if sku in skus:
                raise TrialNotReadyError(("shop_media_catalog_invalid",))
            identity = {"sku": sku, "name": item.get("name"), "variant": item.get("variant"),
                        "anchor": anchors.get(sku, "")}
            if not isinstance(identity["name"], str) or (
                    identity["variant"] is not None and not isinstance(identity["variant"], str)):
                raise TrialNotReadyError(("shop_media_catalog_invalid",))
            skus[sku] = sha256(json.dumps(identity, sort_keys=True, ensure_ascii=False,
                                          separators=(",", ":")).encode()).hexdigest()
        return skus

    @staticmethod
    def _binding(cursor, workspace_id: str, sku: str) -> dict | None:
        cursor.execute("""select sku,catalog_fingerprint,asset_id,generation,byte_size,width,height
            from app_private.shop_product_media where workspace_id=%s and sku=%s""",
            (workspace_id, sku))
        return cursor.fetchone()

    @staticmethod
    def _receipt(cursor, workspace_id: str, asset_id: str,
                 attempt_id: str, object_key: str) -> dict | None:
        cursor.execute("""select result_json from app_private.workspace_events
            where workspace_id=%s and surface='commerce' and event_type=%s
              and result_json->>'assetId'=%s and result_json->>'attemptId'=%s
              and result_json->>'objectKey'=%s order by created_at,event_id limit 1""",
            (workspace_id, MEDIA_EVENT, asset_id, attempt_id, object_key))
        row = cursor.fetchone()
        receipt = row["result_json"] if row else None
        return json.loads(receipt) if isinstance(receipt, str) else receipt

    @staticmethod
    def _metadata(row: dict) -> dict:
        return {"assetId": row["asset_id"], "generation": int(row["generation"]),
                "sha256": row["asset_id"][:-5], "bytes": int(row["byte_size"]),
                "width": int(row["width"]), "height": int(row["height"])}

    @staticmethod
    def _quota(cursor, workspace_id: str, byte_count: int,
               replacement_asset_id: str | None = None) -> None:
        cursor.execute("""select count(*) filter (where state <> 'fenced') as assets,
            count(*) filter (where state = 'fenced') as fences,
            coalesce(sum(case when state = 'fenced' then %s else byte_size end),0) as bytes
            from app_private.shop_media_upload_attempts
            where workspace_id=%s and state <> 'deleted'""",
            (SHOP_ATTEMPT_FENCE_RECEIPT["bytes"], workspace_id))
        quota = cursor.fetchone()
        if quota["fences"] >= MAX_WORKSPACE_FENCES:
            raise TrialNotReadyError(("shop_media_fence_limit_reached",))
        if quota["assets"] >= MAX_WORKSPACE_ASSETS or quota["bytes"] + byte_count > MAX_WORKSPACE_BYTES:
            # One bounded in-flight slot lets a full catalog replace a photo.
            # The old object must become unreferenced on commit. A second
            # concurrent reservation sees the first slot and is denied.
            if (replacement_asset_id is None or quota["assets"] >= MAX_WORKSPACE_ASSETS + 1
                    or quota["bytes"] + byte_count > MAX_WORKSPACE_BYTES + MAX_ASSET_BYTES):
                raise TrialValidationError("Shop photo storage is full. Contact support.")
            cursor.execute("""select count(*) as refs from app_private.shop_product_media
                where workspace_id=%s and asset_id=%s""",
                (workspace_id, replacement_asset_id))
            if cursor.fetchone()["refs"] != 1:
                raise TrialValidationError("Shop photo storage is full. Contact support.")
            previous = ShopMediaStore._asset(cursor, workspace_id, replacement_asset_id)
            if previous is None or previous["state"] != "live":
                raise TrialValidationError("Shop photo storage is full. Contact support.")
        cursor.execute("""select count(*) as recent from app_private.shop_media_upload_attempts
            where workspace_id=%s
              and created_at > clock_timestamp() - interval '1 hour'""",
            (workspace_id,))
        if cursor.fetchone()["recent"] >= MAX_HOURLY_UPLOADS:
            raise TrialNotReadyError(("shop_media_upload_rate_limited",))

    @staticmethod
    def _asset(cursor, workspace_id: str, asset_id: str) -> dict | None:
        cursor.execute("""select asset_id,attempt_id,object_key,byte_size,state,lease_token,lease_until,collect_after
            from app_private.shop_media_assets where workspace_id=%s and asset_id=%s""",
            (workspace_id, asset_id))
        return cursor.fetchone()

    @staticmethod
    def _attempt(cursor, workspace_id: str, attempt_id: str) -> dict | None:
        cursor.execute("""select attempt_id,asset_id,object_key,byte_size,state
            from app_private.shop_media_upload_attempts
            where workspace_id=%s and attempt_id=%s""", (workspace_id, attempt_id))
        return cursor.fetchone()

    @staticmethod
    def _prepared_receipt(photo: PreparedPhoto, attempt_id: str, object_key: str) -> dict:
        return {**photo.receipt(), "attemptId": attempt_id, "objectKey": object_key}

    @staticmethod
    def _event(cursor, actor: TrialPrincipal, event_type: str, payload: dict, result: dict) -> None:
        command_id = str(uuid4())
        fingerprint = sha256(f"{event_type}\n{actor.workspace_id}\n{command_id}".encode()).hexdigest()
        cursor.execute("""insert into app_private.workspace_events
            (event_id,workspace_id,command_id,command_fingerprint,surface,event_type,
             actor_id,actor_kind,expected_version,resulting_version,payload_json,result_json)
            values(%s,%s,%s,%s,'commerce',%s,%s,'human',null,null,%s::jsonb,%s::jsonb)""",
            (str(uuid4()), actor.workspace_id, command_id, fingerprint, event_type, actor.actor_id,
             json.dumps(payload), json.dumps(result)))

    def _reserve(self, cursor, actor: TrialPrincipal, photo: PreparedPhoto,
                 replacement_asset_id: str | None) -> tuple[str | None, str, str, bool]:
        """Reserve one immutable physical key; never PUT that key twice."""
        asset = self._asset(cursor, actor.workspace_id, photo.asset_id)
        if asset is not None and asset["byte_size"] != len(photo.data):
            raise TrialNotReadyError(("shop_media_integrity_failed",))
        if asset is not None and asset["state"] == "live":
            return None, asset["object_key"], asset["attempt_id"], False
        if asset is not None and asset["state"] == "retiring":
            raise TrialNotReadyError(("shop_media_object_retiring",))
        if asset is not None and asset["state"] == "pending":
            previous = self._attempt(cursor, actor.workspace_id, asset["attempt_id"])
            if (previous is None or previous["asset_id"] != photo.asset_id
                    or previous["object_key"] != asset["object_key"]
                    or previous["byte_size"] != len(photo.data)
                    or previous["state"] not in ("pending", "ambiguous")):
                raise TrialNotReadyError(("shop_media_integrity_failed",))
            cursor.execute("""select lease_token from app_private.shop_media_assets
                where workspace_id=%s and asset_id=%s and state='pending'
                  and lease_until >= clock_timestamp()
                  and exists (select 1 from app_private.shop_media_upload_attempts a
                    where a.workspace_id=%s and a.attempt_id=shop_media_assets.attempt_id
                      and a.state='pending')""",
                (actor.workspace_id, photo.asset_id, actor.workspace_id))
            if cursor.fetchone() is not None:
                raise TrialNotReadyError(("shop_media_upload_in_progress",))

        self._quota(cursor, actor.workspace_id, len(photo.data), replacement_asset_id)
        token = str(uuid4())
        attempt_id = uuid4().hex
        object_key = uuid4().hex
        cursor.execute("""insert into app_private.shop_media_upload_attempts
            (workspace_id,attempt_id,asset_id,object_key,byte_size,state,updated_by)
            values(%s,%s,%s,%s,%s,'pending',%s)""",
            (actor.workspace_id, attempt_id, photo.asset_id, object_key,
             len(photo.data), actor.actor_id))
        if asset is None:
            cursor.execute("""insert into app_private.shop_media_assets
                (workspace_id,asset_id,attempt_id,object_key,byte_size,state,lease_token,lease_until,updated_by)
                values(%s,%s,%s,%s,%s,'pending',%s,clock_timestamp()+interval '2 minutes',%s)""",
                (actor.workspace_id, photo.asset_id, attempt_id, object_key,
                 len(photo.data), token, actor.actor_id))
        else:
            if asset["state"] == "pending":
                cursor.execute("""update app_private.shop_media_upload_attempts set
                    state='ambiguous',updated_by=%s,updated_at=clock_timestamp()
                    where workspace_id=%s and attempt_id=%s and state='pending'""",
                    (actor.actor_id, actor.workspace_id, asset["attempt_id"]))
            cursor.execute("""update app_private.shop_media_assets set state='pending',
                attempt_id=%s,object_key=%s,lease_token=%s,
                lease_until=clock_timestamp()+interval '2 minutes',
                collect_after=null,updated_by=%s,updated_at=clock_timestamp()
                where workspace_id=%s and asset_id=%s and state in ('deleted','pending')
                returning asset_id""",
                (attempt_id, object_key, token, actor.actor_id,
                 actor.workspace_id, photo.asset_id))
            if cursor.fetchone() is None:
                raise TrialNotReadyError(("shop_media_upload_in_progress",))
        return token, object_key, attempt_id, True

    @staticmethod
    def _mark_collectible(cursor, actor: TrialPrincipal, asset_id: str | None) -> None:
        if asset_id is None:
            return
        cursor.execute("""update app_private.shop_media_assets set
            collect_after=clock_timestamp(),updated_by=%s,updated_at=clock_timestamp()
            where workspace_id=%s and asset_id=%s and state='live'
              and not exists (select 1 from app_private.shop_product_media b
                where b.workspace_id=%s and b.asset_id=%s)""",
            (actor.actor_id, actor.workspace_id, asset_id, actor.workspace_id, asset_id))

    def manifest(self, principal: TrialPrincipal) -> dict:
        actor = principal.normalized()
        with self.store._guarded_cursor(actor, write=False) as (cursor, _):
            self._reauthorize(cursor, actor, write=False)
            skus = self._catalog(cursor, actor)
            rows = []
            if skus:
                cursor.execute("""select sku,catalog_fingerprint,asset_id,generation,byte_size,width,height
                    from app_private.shop_product_media
                    where workspace_id=%s and sku=any(%s) order by sku limit %s""",
                    (actor.workspace_id, list(skus), MAX_CATALOG_ITEMS + 1))
                rows = cursor.fetchall()
                if len(rows) > MAX_CATALOG_ITEMS:
                    raise TrialNotReadyError(("shop_media_manifest_too_large",))
            photos = {row["sku"]: self._metadata(row) for row in rows
                      if row["sku"] in skus and row["asset_id"] is not None
                      and row["catalog_fingerprint"] == skus[row["sku"]]}
            generations = {row["sku"]: int(row["generation"]) for row in rows if row["sku"] in skus}
            if self._catalog(cursor, actor) != skus:
                raise TrialNotReadyError(("shop_media_catalog_changed",))
            self._reauthorize(cursor, actor, write=False)
        return {"photos": photos, "generations": generations}

    def _current_image(self, cursor, actor: TrialPrincipal, asset_id: str) -> tuple[dict, str]:
        skus = self._catalog(cursor, actor)
        if not skus:
            raise TrialNotFound("Photo not found.")
        cursor.execute("""select sku,catalog_fingerprint,asset_id,generation,byte_size,width,height
            from app_private.shop_product_media
            where workspace_id=%s and asset_id=%s and sku=any(%s) limit %s""",
            (actor.workspace_id, asset_id, list(skus), MAX_CATALOG_ITEMS + 1))
        rows = cursor.fetchall()
        if len(rows) > MAX_CATALOG_ITEMS:
            raise TrialNotReadyError(("shop_media_manifest_too_large",))
        binding = next((row for row in rows if row["sku"] in skus
                        and row["catalog_fingerprint"] == skus[row["sku"]]), None)
        if binding is None:
            raise TrialNotFound("Photo not found.")
        asset = self._asset(cursor, actor.workspace_id, asset_id)
        if asset is None or asset["state"] != "live" or asset["byte_size"] != binding["byte_size"]:
            raise TrialNotReadyError(("shop_media_integrity_failed",))
        receipt = self._receipt(cursor, actor.workspace_id, asset_id,
                                asset["attempt_id"], asset["object_key"])
        if (not isinstance(receipt, dict) or receipt.get("assetId") != asset_id
                or receipt.get("attemptId") != asset["attempt_id"]
                or receipt.get("objectKey") != asset["object_key"]
                or receipt.get("sha256") != asset_id[:-5]
                or receipt.get("bytes") != binding["byte_size"]
                or receipt.get("width") != binding["width"]
                or receipt.get("height") != binding["height"]
                or receipt.get("visibility") != "private"):
            raise TrialNotReadyError(("shop_media_integrity_failed",))
        return self._metadata(binding), asset["object_key"]

    def get(self, principal: TrialPrincipal, asset_id: str) -> tuple[bytes, dict]:
        actor = principal.normalized()
        asset_id = validate_asset_id(asset_id)
        with self.store._guarded_cursor(actor, write=False) as (cursor, _):
            self._reauthorize(cursor, actor, write=False)
            before, object_key = self._current_image(cursor, actor, asset_id)
        # Network I/O runs after the transaction closes, so a slow provider
        # cannot stall sales or catalog commands.
        data = self.storage.get(actor.workspace_id, asset_id, object_key)
        if len(data) != before["bytes"] or sha256(data).hexdigest() != before["sha256"]:
            raise TrialNotReadyError(("shop_media_integrity_failed",))
        with self.store._guarded_cursor(actor, write=False) as (cursor, _):
            self._reauthorize(cursor, actor, write=False)
            after, current_key = self._current_image(cursor, actor, asset_id)
            if after != before or current_key != object_key:
                raise TrialNotFound("Photo changed.")
            self._reauthorize(cursor, actor, write=False)
        return data, after

    def _tombstone_stale_bindings(self, actor: TrialPrincipal, limit: int) -> None:
        """Catalog removal or identity changes cannot pin private objects forever."""
        with self.store._guarded_cursor(actor, write=True, capability="commerce.write") as (cursor, _):
            self._reauthorize(cursor, actor, write=True)
            self.store._lock(cursor, f"{actor.workspace_id}:state:commerce")
            self.store._lock(cursor, f"shop-media:{actor.workspace_id}")
            catalog = self._catalog(cursor, actor)
            cursor.execute("""select sku,catalog_fingerprint,asset_id,generation
                from app_private.shop_product_media
                where workspace_id=%s and asset_id is not null and sku <> all(%s)
                order by sku limit %s""",
                (actor.workspace_id, list(catalog), limit))
            stale = cursor.fetchall()
            if len(stale) < limit and catalog:
                cursor.execute("""select sku,catalog_fingerprint,asset_id,generation
                    from app_private.shop_product_media
                    where workspace_id=%s and asset_id is not null and sku=any(%s)
                    order by sku limit %s""",
                    (actor.workspace_id, list(catalog), MAX_CATALOG_ITEMS + 1))
                current = cursor.fetchall()
                if len(current) > MAX_CATALOG_ITEMS:
                    raise TrialNotReadyError(("shop_media_manifest_too_large",))
                stale.extend(row for row in current
                             if row["catalog_fingerprint"] != catalog[row["sku"]])
            for row in stale[:limit]:
                generation = int(row["generation"])
                if generation >= MAX_GENERATION:
                    raise TrialNotReadyError(("shop_media_generation_exhausted",))
                cursor.execute("""update app_private.shop_product_media set
                    asset_id=null,generation=generation+1,byte_size=null,width=null,height=null,
                    updated_by=%s,updated_at=clock_timestamp()
                    where workspace_id=%s and sku=%s and generation=%s returning generation""",
                    (actor.actor_id, actor.workspace_id, row["sku"], generation))
                updated = cursor.fetchone()
                if updated is None:
                    raise TrialVersionConflict(expected_version=generation, current_version=generation)
                self._event(cursor, actor, REMOVE_EVENT,
                            {"sku": row["sku"], "assetId": row["asset_id"],
                             "reason": "catalog_changed"},
                            {"generation": int(updated["generation"]), "removed": True})
                self._mark_collectible(cursor, actor, row["asset_id"])
            self._reauthorize(cursor, actor, write=True)

    def collect(self, principal: TrialPrincipal, *, limit: int = 4) -> int:
        """Best-effort, bounded private-object reconciliation for an active Shop workspace.

        A separate scheduled caller is still needed to guarantee wall-clock
        retention for an inactive workspace. HTTP mutations schedule a bounded
        best-effort pass; quota pressure also invokes it before denial. An
        expired pending attempt is retired before its exact key is fenced;
        a mere absence check never releases its quota.
        """
        actor = principal.normalized()
        if actor.actor_kind != "human":
            raise TrialPermissionDenied("commerce.write")
        limit = max(0, min(limit, 8))
        if limit == 0:
            return 0
        self._tombstone_stale_bindings(actor, limit)
        removed = 0
        for _ in range(limit):
            token = str(uuid4())
            with self.store._guarded_cursor(actor, write=True, capability="commerce.write") as (cursor, _):
                self._reauthorize(cursor, actor, write=True)
                self.store._lock(cursor, f"shop-media:{actor.workspace_id}")
                cursor.execute("""select asset_id,attempt_id,object_key,byte_size from app_private.shop_media_assets a
                    where workspace_id=%s and (
                      (state='live' and collect_after <= clock_timestamp())
                      or (state='retiring' and lease_until < clock_timestamp()))
                      and not exists (select 1 from app_private.shop_product_media b
                        where b.workspace_id=a.workspace_id and b.asset_id=a.asset_id)
                    order by coalesce(collect_after,lease_until),asset_id limit 1""",
                    (actor.workspace_id,))
                candidate = cursor.fetchone()
                if candidate is None:
                    break
                asset_id = candidate["asset_id"]
                attempt_id = candidate["attempt_id"]
                object_key = candidate["object_key"]
                cursor.execute("""update app_private.shop_media_assets a set
                    state='retiring',lease_token=%s,
                    lease_until=clock_timestamp()+interval '2 minutes',
                    collect_after=null,updated_by=%s,updated_at=clock_timestamp()
                    where workspace_id=%s and asset_id=%s and object_key=%s
                      and (state='live' or (state='retiring' and lease_until < clock_timestamp()))
                      and not exists (select 1 from app_private.shop_product_media b
                        where b.workspace_id=a.workspace_id and b.asset_id=a.asset_id)
                    returning asset_id""",
                    (token, actor.actor_id, actor.workspace_id, asset_id, object_key))
                if cursor.fetchone() is None:
                    continue
                self._reauthorize(cursor, actor, write=True)
            # A failed/ambiguous DELETE keeps the object quota-charged. A later
            # collector can take over the expired lease and verify its absence.
            try:
                self.storage.delete(actor.workspace_id, asset_id, object_key)
            except TrialNotReadyError:
                continue
            with self.store._guarded_cursor(actor, write=True, capability="commerce.write") as (cursor, _):
                self._reauthorize(cursor, actor, write=True)
                self.store._lock(cursor, f"shop-media:{actor.workspace_id}")
                cursor.execute("""update app_private.shop_media_assets a set
                    state='deleted',lease_token=null,lease_until=null,
                    collect_after=null,updated_by=%s,updated_at=clock_timestamp()
                    where workspace_id=%s and asset_id=%s and object_key=%s
                      and state='retiring' and lease_token=%s
                      and not exists (select 1 from app_private.shop_product_media b
                        where b.workspace_id=a.workspace_id and b.asset_id=a.asset_id)
                    returning asset_id""",
                    (actor.actor_id, actor.workspace_id, asset_id, object_key, token))
                if cursor.fetchone() is None:
                    raise TrialNotReadyError(("shop_media_gc_race",))
                cursor.execute("""update app_private.shop_media_upload_attempts set
                    state='deleted',updated_by=%s,updated_at=clock_timestamp()
                    where workspace_id=%s and attempt_id=%s and asset_id=%s
                      and object_key=%s and state='confirmed' returning attempt_id""",
                    (actor.actor_id, actor.workspace_id, attempt_id, asset_id, object_key))
                if cursor.fetchone() is None:
                    raise TrialNotReadyError(("shop_media_gc_race",))
                self._event(cursor, actor, COLLECT_EVENT,
                            {"assetId": asset_id, "attemptId": attempt_id,
                             "objectKey": object_key},
                            {"assetId": asset_id, "bytes": int(candidate["byte_size"]),
                             "objectState": "deleted", "visibility": "private"})
                self._reauthorize(cursor, actor, write=True)
            removed += 1
        return removed + self.reconcile_abandoned_attempts(actor, limit=limit - removed)

    def reconcile_abandoned_attempts(self, principal: TrialPrincipal, *, limit: int = 4) -> int:
        """Fence only unbound attempt keys, then release their payload quota.

        A fence remains as one bounded private object. The original upload's
        no-upsert POST may finish before or after this pass; it can never
        replace a read-back fence. This method is safe to retry after an
        ambiguous provider acknowledgement or a failed database commit.
        """
        actor = principal.normalized()
        if actor.actor_kind != "human":
            raise TrialPermissionDenied("commerce.write")
        limit = max(0, min(limit, 8))
        resolved = 0
        for _ in range(limit):
            with self.store._guarded_cursor(actor, write=True, capability="commerce.write") as (cursor, _):
                self._reauthorize(cursor, actor, write=True)
                self.store._lock(cursor, f"shop-media:{actor.workspace_id}")
                cursor.execute("""select count(*) as fences
                    from app_private.shop_media_upload_attempts
                    where workspace_id=%s and state='fenced'""", (actor.workspace_id,))
                if cursor.fetchone()["fences"] >= MAX_WORKSPACE_FENCES:
                    return resolved
                # Abandon an expired current reservation before provider I/O.
                # A delayed uploader will fail its asset/lease check and cannot
                # publish the old key even if its POST eventually succeeds.
                cursor.execute("""select a.asset_id,a.attempt_id,a.object_key
                    from app_private.shop_media_assets a
                    join app_private.shop_media_upload_attempts t
                      on t.workspace_id=a.workspace_id and t.attempt_id=a.attempt_id
                    where a.workspace_id=%s and a.state='pending'
                      and a.lease_until < clock_timestamp()
                      and t.state in ('pending','ambiguous')
                      and not exists (select 1 from app_private.shop_product_media b
                        where b.workspace_id=a.workspace_id and b.asset_id=a.asset_id)
                    order by a.lease_until,a.asset_id limit 1""", (actor.workspace_id,))
                expired = cursor.fetchone()
                if expired is not None:
                    cursor.execute("""update app_private.shop_media_assets set
                        state='deleted',lease_token=null,lease_until=null,
                        updated_by=%s,updated_at=clock_timestamp()
                        where workspace_id=%s and asset_id=%s and attempt_id=%s
                          and object_key=%s and state='pending'
                          and lease_until < clock_timestamp() returning asset_id""",
                        (actor.actor_id, actor.workspace_id, expired["asset_id"],
                         expired["attempt_id"], expired["object_key"]))
                    if cursor.fetchone() is None:
                        raise TrialNotReadyError(("shop_media_gc_race",))
                    cursor.execute("""update app_private.shop_media_upload_attempts set
                        state='ambiguous',updated_by=%s,updated_at=clock_timestamp()
                        where workspace_id=%s and attempt_id=%s and asset_id=%s
                          and object_key=%s and state='pending'""",
                        (actor.actor_id, actor.workspace_id, expired["attempt_id"],
                         expired["asset_id"], expired["object_key"]))
                cursor.execute("""select t.attempt_id,t.asset_id,t.object_key,t.byte_size
                    from app_private.shop_media_upload_attempts t
                    where t.workspace_id=%s and t.state='ambiguous'
                      and not exists (select 1 from app_private.shop_media_assets a
                        where a.workspace_id=t.workspace_id and a.attempt_id=t.attempt_id
                          and a.object_key=t.object_key and a.state <> 'deleted')
                    order by t.created_at,t.attempt_id limit 1""", (actor.workspace_id,))
                candidate = cursor.fetchone()
                self._reauthorize(cursor, actor, write=True)
            if candidate is None:
                break
            try:
                receipt = self.storage.fence_abandoned_attempt(
                    actor.workspace_id, candidate["asset_id"], candidate["object_key"])
                if (not isinstance(receipt, dict)
                        or receipt.get("sha256") != SHOP_ATTEMPT_FENCE_RECEIPT["sha256"]
                        or receipt.get("bytes") != SHOP_ATTEMPT_FENCE_RECEIPT["bytes"]
                        or receipt.get("observedBeforeFence") not in ("absent", "attempt", "fenced")):
                    raise TrialNotReadyError(("shop_media_fence_unconfirmed",))
            except TrialNotReadyError:
                # Unknown acknowledgement stays fully charged. Retry the same
                # immutable key later; the fence upsert itself is idempotent.
                break
            with self.store._guarded_cursor(actor, write=True, capability="commerce.write") as (cursor, _):
                self._reauthorize(cursor, actor, write=True)
                self.store._lock(cursor, f"shop-media:{actor.workspace_id}")
                cursor.execute("""select count(*) as fences
                    from app_private.shop_media_upload_attempts
                    where workspace_id=%s and state='fenced'""", (actor.workspace_id,))
                if cursor.fetchone()["fences"] >= MAX_WORKSPACE_FENCES:
                    # Another collector used the final fence slot. This key
                    # is physically fenced but remains fully quota-charged.
                    return resolved
                cursor.execute("""update app_private.shop_media_upload_attempts t set
                    state='fenced',updated_by=%s,updated_at=clock_timestamp()
                    where t.workspace_id=%s and t.attempt_id=%s and t.asset_id=%s
                      and t.object_key=%s and t.state='ambiguous'
                      and not exists (select 1 from app_private.shop_media_assets a
                        where a.workspace_id=t.workspace_id and a.attempt_id=t.attempt_id
                          and a.object_key=t.object_key and a.state <> 'deleted')
                    returning attempt_id""",
                    (actor.actor_id, actor.workspace_id, candidate["attempt_id"],
                     candidate["asset_id"], candidate["object_key"]))
                if cursor.fetchone() is None:
                    current = self._attempt(cursor, actor.workspace_id, candidate["attempt_id"])
                    if (current is not None and current["state"] == "fenced"
                            and current["asset_id"] == candidate["asset_id"]
                            and current["object_key"] == candidate["object_key"]):
                        # Another collector committed the same fixed fence.
                        self._reauthorize(cursor, actor, write=True)
                        continue
                    raise TrialNotReadyError(("shop_media_gc_race",))
                self._event(cursor, actor, FENCE_EVENT,
                            {"assetId": candidate["asset_id"],
                             "attemptId": candidate["attempt_id"],
                             "objectKey": candidate["object_key"]},
                            {"assetId": candidate["asset_id"],
                             "attemptId": candidate["attempt_id"],
                             "objectKey": candidate["object_key"],
                             "payloadBytesReleased": int(candidate["byte_size"]),
                             "fenceSha256": receipt["sha256"],
                             "fenceBytes": receipt["bytes"],
                             "observedBeforeFence": receipt["observedBeforeFence"],
                             "objectState": "fenced", "visibility": "private"})
                self._reauthorize(cursor, actor, write=True)
            resolved += 1
        return resolved

    def _prepare_upload(self, actor: TrialPrincipal, sku: str, photo: PreparedPhoto,
                        expected_generation: int) -> tuple[str, str | None, str, str, bool]:
        # Short quota reservation precedes provider I/O. The workspace media
        # lock serializes all capacity claims without stalling Commerce sales.
        with self.store._guarded_cursor(actor, write=True, capability="commerce.write") as (cursor, _):
            self._reauthorize(cursor, actor, write=True)
            self.store._lock(cursor, f"shop-media:{actor.workspace_id}")
            catalog = self._catalog(cursor, actor)
            if sku not in catalog:
                raise TrialNotFound("Product not found.")
            catalog_fingerprint = catalog[sku]
            current = self._binding(cursor, actor.workspace_id, sku)
            generation = int(current["generation"]) if current else 0
            if expected_generation != generation:
                raise TrialVersionConflict(expected_version=expected_generation, current_version=generation)
            if generation >= MAX_GENERATION:
                raise TrialNotReadyError(("shop_media_generation_exhausted",))
            replacement_asset_id = (current["asset_id"] if current and current["asset_id"] != photo.asset_id
                                    else None)
            reservation, object_key, attempt_id, new_object = self._reserve(
                cursor, actor, photo, replacement_asset_id)
            if reservation is None:
                receipt = self._receipt(cursor, actor.workspace_id, photo.asset_id,
                                        attempt_id, object_key)
                if receipt != self._prepared_receipt(photo, attempt_id, object_key):
                    raise TrialNotReadyError(("shop_media_integrity_failed",))
        return catalog_fingerprint, reservation, object_key, attempt_id, new_object

    def _mark_ambiguous(self, actor: TrialPrincipal, photo: PreparedPhoto,
                        attempt_id: str, object_key: str) -> None:
        # If auth/database fails here, the untouched pending attempt still
        # consumes quota and cannot be reused after its lease expires.
        with self.store._guarded_cursor(actor, write=True, capability="commerce.write") as (cursor, _):
            self._reauthorize(cursor, actor, write=True)
            self.store._lock(cursor, f"shop-media:{actor.workspace_id}")
            cursor.execute("""update app_private.shop_media_upload_attempts set
                state='ambiguous',updated_by=%s,updated_at=clock_timestamp()
                where workspace_id=%s and attempt_id=%s and asset_id=%s
                  and object_key=%s and state='pending'""",
                (actor.actor_id, actor.workspace_id, attempt_id, photo.asset_id, object_key))
            cursor.execute("""update app_private.shop_media_assets set
                lease_until=clock_timestamp(),updated_by=%s,updated_at=clock_timestamp()
                where workspace_id=%s and asset_id=%s and attempt_id=%s
                  and object_key=%s and state='pending'""",
                (actor.actor_id, actor.workspace_id, photo.asset_id, attempt_id, object_key))

    def put(self, principal: TrialPrincipal, sku: str, photo: PreparedPhoto,
            expected_generation: int) -> dict:
        actor = principal.normalized()
        sku = _sku(sku)
        if actor.actor_kind != "human":
            raise TrialPermissionDenied("commerce.write")
        try:
            catalog_fingerprint, reservation, object_key, attempt_id, new_object = self._prepare_upload(
                actor, sku, photo, expected_generation)
        except TrialValidationError:
            # Reclaim only when physical capacity would block this upload;
            # normal counter work does not wait on provider deletion.
            self.collect(actor, limit=8)
            catalog_fingerprint, reservation, object_key, attempt_id, new_object = self._prepare_upload(
                actor, sku, photo, expected_generation)

        # Supabase object I/O is outside every database transaction and advisory
        # lock. A later conflict leaves a quota-charged pending reservation.
        if new_object:
            try:
                stored_receipt = self.storage.put(actor.workspace_id, photo, object_key)
                if stored_receipt != photo.receipt():
                    raise TrialNotReadyError(("shop_media_integrity_failed",))
            except Exception:
                try:
                    self._mark_ambiguous(actor, photo, attempt_id, object_key)
                except Exception:
                    _LOG.warning("Shop photo attempt could not be marked ambiguous; pending quota retained")
                raise
        elif self.storage.get(actor.workspace_id, photo.asset_id, object_key) != photo.data:
            raise TrialNotReadyError(("shop_media_integrity_failed",))

        with self.store._guarded_cursor(actor, write=True, capability="commerce.write") as (cursor, _):
            self._reauthorize(cursor, actor, write=True)
            self.store._lock(cursor, f"{actor.workspace_id}:state:commerce")
            self.store._lock(cursor, f"shop-media:{actor.workspace_id}")
            if self._catalog(cursor, actor).get(sku) != catalog_fingerprint:
                raise TrialNotFound("Product changed.")
            current = self._binding(cursor, actor.workspace_id, sku)
            generation = int(current["generation"]) if current else 0
            if expected_generation != generation:
                raise TrialVersionConflict(expected_version=expected_generation, current_version=generation)
            asset = self._asset(cursor, actor.workspace_id, photo.asset_id)
            if (asset is None or asset["byte_size"] != len(photo.data)
                    or asset["attempt_id"] != attempt_id
                    or asset["object_key"] != object_key
                    or (reservation is None and asset["state"] != "live")
                    or (reservation is not None and
                        (asset["state"] != "pending" or asset["lease_token"] != reservation))):
                raise TrialNotReadyError(("shop_media_asset_changed",))
            current_receipt = self._receipt(cursor, actor.workspace_id, photo.asset_id,
                                            attempt_id, object_key)
            expected_receipt = self._prepared_receipt(photo, attempt_id, object_key)
            if ((reservation is None and current_receipt != expected_receipt)
                    or (reservation is not None and current_receipt is not None)):
                raise TrialNotReadyError(("shop_media_integrity_failed",))
            if reservation is not None:
                self._event(cursor, actor, MEDIA_EVENT,
                            {"assetId": photo.asset_id, "attemptId": attempt_id,
                             "objectKey": object_key,
                             "preparation": "webp-2048-v1"},
                            expected_receipt)
                cursor.execute("""update app_private.shop_media_upload_attempts set
                    state='confirmed',updated_by=%s,updated_at=clock_timestamp()
                    where workspace_id=%s and attempt_id=%s and asset_id=%s
                      and object_key=%s and state='pending' returning attempt_id""",
                    (actor.actor_id, actor.workspace_id, attempt_id, photo.asset_id, object_key))
                if cursor.fetchone() is None:
                    raise TrialNotReadyError(("shop_media_asset_changed",))
                cursor.execute("""update app_private.shop_media_assets set state='live',
                    lease_token=null,lease_until=null,collect_after=null,updated_by=%s,
                    updated_at=clock_timestamp() where workspace_id=%s and asset_id=%s
                      and attempt_id=%s and object_key=%s and state='pending'
                      and lease_token=%s returning asset_id""",
                    (actor.actor_id, actor.workspace_id, photo.asset_id, attempt_id,
                     object_key, reservation))
                if cursor.fetchone() is None:
                    raise TrialNotReadyError(("shop_media_asset_changed",))
            else:
                # The asset may have become unbound while we verified its bytes.
                cursor.execute("""update app_private.shop_media_assets set collect_after=null,
                    updated_by=%s,updated_at=clock_timestamp()
                    where workspace_id=%s and asset_id=%s and state='live'""",
                    (actor.actor_id, actor.workspace_id, photo.asset_id))
            old_asset_id = current["asset_id"] if current else None
            if (current and current["asset_id"] == photo.asset_id
                    and current["catalog_fingerprint"] == catalog_fingerprint):
                result = self._metadata(current)
            else:
                if generation >= MAX_GENERATION:
                    raise TrialNotReadyError(("shop_media_generation_exhausted",))
                if current:
                    cursor.execute("""update app_private.shop_product_media set
                        catalog_fingerprint=%s,asset_id=%s,generation=generation+1,
                        byte_size=%s,width=%s,height=%s,updated_by=%s,updated_at=clock_timestamp()
                        where workspace_id=%s and sku=%s and generation=%s returning generation""",
                        (catalog_fingerprint, photo.asset_id, len(photo.data), photo.width, photo.height,
                         actor.actor_id, actor.workspace_id, sku, generation))
                else:
                    cursor.execute("""insert into app_private.shop_product_media
                        (workspace_id,sku,catalog_fingerprint,asset_id,generation,byte_size,width,height,updated_by)
                        values(%s,%s,%s,%s,1,%s,%s,%s,%s) returning generation""",
                        (actor.workspace_id, sku, catalog_fingerprint, photo.asset_id,
                         len(photo.data), photo.width, photo.height, actor.actor_id))
                updated = cursor.fetchone()
                if not updated:
                    raise TrialVersionConflict(expected_version=expected_generation, current_version=generation)
                result = {"assetId": photo.asset_id, "generation": int(updated["generation"]),
                          "sha256": photo.asset_id[:-5], "bytes": len(photo.data),
                          "width": photo.width, "height": photo.height}
            if old_asset_id != photo.asset_id:
                self._mark_collectible(cursor, actor, old_asset_id)
            self._reauthorize(cursor, actor, write=True)
        return result

    def delete(self, principal: TrialPrincipal, sku: str, expected_generation: int) -> dict:
        actor = principal.normalized()
        sku = _sku(sku)
        if actor.actor_kind != "human":
            raise TrialPermissionDenied("commerce.write")
        with self.store._guarded_cursor(actor, write=True, capability="commerce.write") as (cursor, _):
            self._reauthorize(cursor, actor, write=True)
            self.store._lock(cursor, f"{actor.workspace_id}:state:commerce")
            self.store._lock(cursor, f"shop-media:{actor.workspace_id}")
            catalog = self._catalog(cursor, actor)
            if sku not in catalog:
                raise TrialNotFound("Product not found.")
            current = self._binding(cursor, actor.workspace_id, sku)
            if (current is None or current["asset_id"] is None
                    or current["catalog_fingerprint"] != catalog[sku]):
                raise TrialNotFound("Photo not found.")
            generation = int(current["generation"])
            if expected_generation != generation:
                raise TrialVersionConflict(expected_version=expected_generation, current_version=generation)
            if generation >= MAX_GENERATION:
                raise TrialNotReadyError(("shop_media_generation_exhausted",))
            cursor.execute("""update app_private.shop_product_media set
                asset_id=null,generation=generation+1,byte_size=null,width=null,height=null,
                updated_by=%s,updated_at=clock_timestamp()
                where workspace_id=%s and sku=%s and generation=%s returning generation""",
                (actor.actor_id, actor.workspace_id, sku, generation))
            updated = cursor.fetchone()
            if not updated:
                raise TrialVersionConflict(expected_version=expected_generation, current_version=generation)
            self._event(cursor, actor, REMOVE_EVENT,
                        {"sku": sku, "assetId": current["asset_id"]},
                        {"generation": int(updated["generation"]), "removed": True})
            self._mark_collectible(cursor, actor, current["asset_id"])
            self._reauthorize(cursor, actor, write=True)
            result = {"generation": int(updated["generation"]), "removed": True}
        return result


def mount_shop_media_routes(router, *, store, resolve_principal):
    from .trial_runtime import (_error, _invoke, _readiness, _require_read_ready,
                                _require_write_ready, _resolve_principal)

    def authorized(request, *, write):
        actor = _resolve_principal(request, resolve_principal)
        if actor.actor_kind != "human":
            raise _error(403, "shop_media_human_required")
        if not SHOP_MEDIA_SERVER_ENABLED:
            raise _error(503, "shop_media_disabled")
        ready = _readiness(store, actor)
        if write:
            _require_write_ready(ready, "commerce.write")
        else:
            _require_read_ready(ready)
            if not has_surface_read_capability(ready.capabilities, "commerce"):
                raise _error(403, "trial_capability_required", required_capability="commerce.read")
        if not isinstance(store, PostgresTrialStore):
            raise _error(503, "shop_media_storage_unavailable")
        config = MediaStorageConfig.for_shop_from_environment()
        if not config.ready:
            raise _error(503, "shop_media_storage_unavailable")
        try:
            schema_ready = _shop_media_schema_ready(store, actor)
        except Exception as exc:
            raise _error(503, "shop_media_schema_unavailable") from exc
        if not schema_ready:
            raise _error(503, "shop_media_schema_unavailable")
        storage = SupabasePrivateMediaStorage(config)
        try:
            storage._require_private_bucket()
        except Exception as exc:
            raise _error(503, "shop_media_storage_unavailable") from exc
        return actor, ShopMediaStore(store, storage)

    def reject_query(request):
        if request.query_params:
            raise _error(422, "shop_media_request_invalid")

    def reconcile_after_mutation(actor, adapter):
        try:
            adapter.collect(actor, limit=1)
        except Exception:
            # The user mutation already committed. Collection remains charged
            # and retryable; never turn a successful response into an error.
            _LOG.warning("Shop photo private-object cleanup deferred")

    @router.get("/shop-media")
    async def shop_photo_manifest(request: Request):
        try:
            actor, adapter = await run_in_threadpool(authorized, request, write=False)
            reject_query(request)
            result = await run_in_threadpool(_invoke, lambda: adapter.manifest(actor))
            return JSONResponse(result, headers=PRIVATE_HEADERS)
        except HTTPException as exc:
            exc.headers = {**(exc.headers or {}), **PRIVATE_HEADERS}
            raise

    @router.get("/shop-media/image/{asset_id}")
    async def shop_photo_image(asset_id: str, request: Request):
        try:
            actor, adapter = await run_in_threadpool(authorized, request, write=False)
            reject_query(request)
            data, metadata = await run_in_threadpool(_invoke, lambda: adapter.get(actor, asset_id))
            return Response(data, media_type="image/webp", headers={**PRIVATE_HEADERS,
                "Content-Disposition": 'inline; filename="shop-photo.webp"',
                "Content-Security-Policy": "default-src 'none'; sandbox",
                "X-Content-SHA256": metadata["sha256"]})
        except HTTPException as exc:
            exc.headers = {**(exc.headers or {}), **PRIVATE_HEADERS}
            raise

    # Prefix the encoded SKU segment so valid catalog SKUs "." and ".." cannot
    # be collapsed by browser URL normalization before they reach this route.
    @router.put("/shop-media/sku/{encoded_sku:path}")
    async def bind_shop_photo(encoded_sku: str, request: Request,
                              background_tasks: BackgroundTasks):
        try:
            if not encoded_sku.startswith("~"):
                raise _error(422, "shop_media_sku_invalid")
            sku = encoded_sku[1:]
            actor, adapter = await run_in_threadpool(authorized, request, write=True)
            reject_query(request)
            expected = _generation(request.headers.get("if-match"))
            await run_in_threadpool(_invoke, lambda: _sku(sku))
            content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
            if content_type not in IMAGE_TYPES:
                raise _error(415, "shop_media_photo_required")
            declared = request.headers.get("content-length")
            if declared is not None:
                if not declared.isascii() or not declared.isdecimal():
                    raise _error(400, "shop_media_invalid_content_length")
                if len(declared) > 10 or int(declared) > MAX_UPLOAD_BYTES:
                    raise _error(413, "shop_media_too_large")
            body = bytearray()
            async for chunk in request.stream():
                if len(body) + len(chunk) > MAX_UPLOAD_BYTES:
                    raise _error(413, "shop_media_too_large")
                body.extend(chunk)
            photo = await run_in_threadpool(_invoke, lambda: prepare_photo(bytes(body), content_type))
            result = await run_in_threadpool(_invoke, lambda: adapter.put(actor, sku, photo, expected))
            background_tasks.add_task(reconcile_after_mutation, actor, adapter)
            return JSONResponse(result, status_code=201 if expected == 0 else 200,
                                headers={**PRIVATE_HEADERS, "ETag": f'"{result["generation"]}"'})
        except ClientDisconnect as exc:
            raise HTTPException(400, detail={"code": "shop_media_upload_interrupted"}, headers=PRIVATE_HEADERS) from exc
        except HTTPException as exc:
            exc.headers = {**(exc.headers or {}), **PRIVATE_HEADERS}
            raise

    @router.delete("/shop-media/sku/{encoded_sku:path}")
    async def remove_shop_photo(encoded_sku: str, request: Request,
                                background_tasks: BackgroundTasks):
        try:
            if not encoded_sku.startswith("~"):
                raise _error(422, "shop_media_sku_invalid")
            sku = encoded_sku[1:]
            actor, adapter = await run_in_threadpool(authorized, request, write=True)
            reject_query(request)
            expected = _generation(request.headers.get("if-match"))
            result = await run_in_threadpool(_invoke, lambda: adapter.delete(actor, sku, expected))
            background_tasks.add_task(reconcile_after_mutation, actor, adapter)
            return JSONResponse(result, headers={**PRIVATE_HEADERS, "ETag": f'"{result["generation"]}"'})
        except HTTPException as exc:
            exc.headers = {**(exc.headers or {}), **PRIVATE_HEADERS}
            raise
