"""Shop photo boundary tests. Synthetic stores do not prove hosted Supabase."""

from contextlib import contextmanager
from copy import deepcopy
from hashlib import sha256
from io import BytesIO
import json
import os
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from supermega_runtime.shop_media import (ShopMediaStore, MEDIA_EVENT, REMOVE_EVENT,
    COLLECT_EVENT, FENCE_EVENT, _shop_media_schema_ready)
from supermega_runtime.trial_runtime import create_trial_router
from supermega_runtime.trial_store import (PostgresTrialStore, TrialNotFound,
    TrialNotReadyError, TrialPermissionDenied, TrialPrincipal, TrialReadiness,
    TrialValidationError, TrialVersionConflict)
from supermega_runtime.website_media import prepare_photo
from supermega_runtime.website_media_storage import (BUCKET, SHOP_BUCKET,
    SHOP_ATTEMPT_FENCE, SHOP_ATTEMPT_FENCE_RECEIPT,
    MediaStorageConfig, SupabasePrivateMediaStorage)
from tests.test_website_media_postgres import _local_database
from tools import rehearse_supermega_postgres17 as pg


def photo(color="#ab6633"):
    buffer = BytesIO()
    with Image.new("RGB", (32, 24), color) as image:
        image.save(buffer, format="PNG")
    return prepare_photo(buffer.getvalue(), "image/png")


class MemoryDatabase:
    def __init__(self):
        self.catalog = {"items": [{"sku": "CUP-1", "name": "Ceramic cup", "price": 5000}],
                        "catalogBaselines": [{"sku": "CUP-1", "anchorDigest": "sha256:" + "a" * 64}]}
        self.bindings = {}
        self.assets = {}
        self.attempts = {}
        self.events = {}
        self.products = ("commerce",)
        self.capabilities = {"commerce.read", "commerce.write"}
        self.active = True
        self.in_transaction = False
        self.locked = []
        self.result = None

    @contextmanager
    def _guarded_cursor(self, actor, *, write, capability=None):
        if not self.active:
            raise TrialNotReadyError(("auth_session_active",))
        if capability and capability not in self.capabilities:
            raise TrialPermissionDenied(capability)
        assert not self.in_transaction
        before = deepcopy((self.bindings, self.assets, self.attempts, self.events))
        self.in_transaction = True
        try:
            yield self, self.capabilities
        except Exception:
            self.bindings, self.assets, self.attempts, self.events = before
            raise
        finally:
            self.in_transaction = False

    def _assert_active_identity_session(self, cursor, actor):
        if not self.active:
            raise TrialNotReadyError(("auth_session_active",))

    def _load_membership(self, cursor, actor):
        return self.capabilities

    def _product_entitlements(self, cursor, workspace):
        return self.products

    def _lock(self, cursor, key):
        self.locked.append(key)

    def execute(self, sql, params):
        query = " ".join(sql.lower().split())
        if "select state_json from app_private.workspace_state" in query:
            self.result = {"state_json": deepcopy(self.catalog)}
        elif "select result_json from app_private.workspace_events" in query:
            event = next((row["result"] for row in self.events.values()
                          if row["workspace"] == params[0] and row["type"] == MEDIA_EVENT
                          and row["result"].get("assetId") == params[2]
                          and row["result"].get("attemptId") == params[3]
                          and row["result"].get("objectKey") == params[4]), None)
            self.result = {"result_json": deepcopy(event)} if event else None
        elif "as assets," in query and "from app_private.shop_media_upload_attempts" in query:
            relevant = [row for (workspace, _), row in self.attempts.items()
                        if workspace == params[1] and row["state"] != "deleted"]
            self.result = {"assets": sum(row["state"] != "fenced" for row in relevant),
                           "fences": sum(row["state"] == "fenced" for row in relevant),
                           "bytes": sum(SHOP_ATTEMPT_FENCE_RECEIPT["bytes"] if row["state"] == "fenced"
                                        else row["byte_size"] for row in relevant)}
        elif "select count(*) as recent" in query:
            self.result = {"recent": sum(workspace == params[0]
                                          for workspace, _ in self.attempts)}
        elif "select count(*) as fences" in query:
            self.result = {"fences": sum(workspace == params[0] and row["state"] == "fenced"
                                          for (workspace, _), row in self.attempts.items())}
        elif "select count(*) as refs from app_private.shop_product_media" in query:
            self.result = {"refs": sum(workspace == params[0] and row["asset_id"] == params[1]
                                       for (workspace, _), row in self.bindings.items())}
        elif "select asset_id,attempt_id,object_key,byte_size,state,lease_token,lease_until,collect_after" in query:
            self.result = deepcopy(self.assets.get((params[0], params[1])))
        elif "select attempt_id,asset_id,object_key,byte_size,state" in query:
            self.result = deepcopy(self.attempts.get((params[0], params[1])))
        elif "select lease_token from app_private.shop_media_assets" in query:
            row = self.assets.get((params[0], params[1]))
            self.result = ({"lease_token": row["lease_token"]} if row and
                           row["state"] == "pending" and not row["expired"] and
                           self.attempts[(params[0], row["attempt_id"])]["state"] == "pending" else None)
        elif "select asset_id,attempt_id,object_key,byte_size from app_private.shop_media_assets" in query:
            self.result = next((deepcopy(row) for (workspace, asset), row in self.assets.items()
                                if workspace == params[0] and not any(
                                    binding["asset_id"] == asset for (bound_workspace, _), binding
                                    in self.bindings.items() if bound_workspace == workspace)
                                and ((row["state"] == "live" and row["collect_after"])
                                     or (row["state"] == "retiring" and row["expired"]))), None)
        elif "select a.asset_id,a.attempt_id,a.object_key from app_private.shop_media_assets" in query:
            self.result = next((deepcopy(row) for (workspace, asset), row in self.assets.items()
                                if workspace == params[0] and row["state"] == "pending"
                                and row["expired"] and self.attempts[(workspace, row["attempt_id"])]["state"]
                                in ("pending", "ambiguous") and not any(
                                    binding["asset_id"] == asset for (owner, _), binding in self.bindings.items()
                                    if owner == workspace)), None)
        elif "select t.attempt_id,t.asset_id,t.object_key,t.byte_size" in query:
            self.result = next((deepcopy(row) for (workspace, attempt), row in self.attempts.items()
                                if workspace == params[0] and row["state"] == "ambiguous"
                                and not any(asset["attempt_id"] == attempt
                                            and asset["object_key"] == row["object_key"]
                                            and asset["state"] != "deleted"
                                            for (owner, _), asset in self.assets.items() if owner == workspace)), None)
        elif "select sku,catalog_fingerprint,asset_id,generation from app_private.shop_product_media" in query:
            candidates = [deepcopy(row) for (workspace, _), row in self.bindings.items()
                          if workspace == params[0] and row["asset_id"] is not None]
            if "sku <> all(%s)" in query:
                candidates = [row for row in candidates if row["sku"] not in params[1]]
            elif "sku=any(%s)" in query:
                candidates = [row for row in candidates if row["sku"] in params[1]]
            self.result = sorted(candidates, key=lambda row: row["sku"])[:params[2]]
        elif "select sku,catalog_fingerprint,asset_id,generation,byte_size,width,height" in query:
            if "and sku=%s" in query:
                self.result = deepcopy(self.bindings.get((params[0], params[1])))
            elif "and asset_id=%s" in query:
                self.result = [deepcopy(row) for (workspace, _), row in self.bindings.items()
                               if workspace == params[0] and row["asset_id"] == params[1]
                               and ("sku=any(%s)" not in query or row["sku"] in params[2])][:params[-1]]
            elif "sku=any(%s)" in query:
                self.result = [deepcopy(row) for (workspace, _), row in self.bindings.items()
                               if workspace == params[0] and row["sku"] in params[1]][:params[2]]
            else:
                self.result = [deepcopy(row) for (workspace, _), row in self.bindings.items()
                               if workspace == params[0]]
        elif "insert into app_private.workspace_events" in query:
            self.events[params[0]] = {"workspace": params[1], "type": params[4],
                                      "result": json.loads(params[-1]),
                                      "payload": json.loads(params[-2])}
            self.result = None
        elif "insert into app_private.shop_media_upload_attempts" in query:
            workspace, attempt_id, asset_id, object_key, size, actor = params
            assert (workspace, attempt_id) not in self.attempts
            assert all(existing["object_key"] != object_key for (owner, _), existing
                       in self.attempts.items() if owner == workspace)
            self.attempts[(workspace, attempt_id)] = {
                "attempt_id": attempt_id, "asset_id": asset_id,
                "object_key": object_key, "byte_size": size, "state": "pending"}
            self.result = None
        elif "update app_private.shop_media_upload_attempts t set" in query:
            _, workspace, attempt_id, asset_id, object_key = params
            row = self.attempts.get((workspace, attempt_id))
            linked = any(asset["attempt_id"] == attempt_id and asset["object_key"] == object_key
                         and asset["state"] != "deleted" for (owner, _), asset in self.assets.items()
                         if owner == workspace)
            if row and row["asset_id"] == asset_id and row["object_key"] == object_key \
                    and row["state"] == "ambiguous" and not linked:
                row["state"] = "fenced"
                self.result = {"attempt_id": attempt_id}
            else:
                self.result = None
        elif "update app_private.shop_media_upload_attempts" in query:
            if "state='ambiguous'" in query and "asset_id=%s" in query:
                _, workspace, attempt_id, asset_id, object_key = params
            elif "state='ambiguous'" in query:
                _, workspace, attempt_id = params
                asset_id = object_key = None
            else:
                _, workspace, attempt_id, asset_id, object_key = params
            row = self.attempts[(workspace, attempt_id)]
            if ((asset_id is None or row["asset_id"] == asset_id)
                    and (object_key is None or row["object_key"] == object_key)):
                if "state='ambiguous'" in query and row["state"] == "pending":
                    row["state"] = "ambiguous"
                elif "state='confirmed'" in query and row["state"] == "pending":
                    row["state"] = "confirmed"
                elif "state='deleted'" in query and row["state"] == "confirmed":
                    row["state"] = "deleted"
                else:
                    self.result = None
                    return
                self.result = {"attempt_id": attempt_id} if "returning attempt_id" in query else None
            else:
                self.result = None
        elif "insert into app_private.shop_media_assets" in query:
            workspace, asset, attempt_id, object_key, size, token, _ = params
            self.assets[(workspace, asset)] = {"asset_id": asset, "attempt_id": attempt_id,
                "object_key": object_key, "byte_size": size,
                "state": "pending", "lease_token": token, "lease_until": True,
                "collect_after": False, "expired": False}
            self.result = None
        elif "update app_private.shop_media_assets set state='pending'" in query:
            attempt_id, object_key, token, _, workspace, asset = params
            row = self.assets[(workspace, asset)]
            assert row["state"] in ("deleted", "pending")
            row.update(state="pending", attempt_id=attempt_id, object_key=object_key,
                       lease_token=token, lease_until=True,
                       collect_after=False, expired=False)
            self.result = {"asset_id": asset}
        elif "update app_private.shop_media_assets set lease_until=clock_timestamp()" in query:
            _, workspace, asset, attempt_id, object_key = params
            row = self.assets[(workspace, asset)]
            if row["state"] == "pending" and row["attempt_id"] == attempt_id and row["object_key"] == object_key:
                row["expired"] = True
            self.result = None
        elif "update app_private.shop_media_assets set state='deleted'" in query:
            _, workspace, asset, attempt_id, object_key = params
            row = self.assets[(workspace, asset)]
            if (row["state"] == "pending" and row["expired"]
                    and row["attempt_id"] == attempt_id and row["object_key"] == object_key):
                row.update(state="deleted", lease_token=None, lease_until=None, expired=False)
                self.result = {"asset_id": asset}
            else:
                self.result = None
        elif "update app_private.shop_media_assets" in query and "state='live'" in query and "lease_token=null" in query:
            _, workspace, asset, attempt_id, object_key, token = params
            row = self.assets[(workspace, asset)]
            if (row["state"] == "pending" and row["lease_token"] == token
                    and row["attempt_id"] == attempt_id and row["object_key"] == object_key):
                row.update(state="live", lease_token=None, lease_until=None,
                           collect_after=False, expired=False)
                self.result = {"asset_id": asset}
            else:
                self.result = None
        elif "update app_private.shop_media_assets set collect_after=null" in query and "state='live'" in query:
            _, workspace, asset = params
            row = self.assets[(workspace, asset)]
            row["collect_after"] = False
            self.result = None
        elif "update app_private.shop_media_assets" in query and "collect_after=clock_timestamp()" in query:
            _, workspace, asset, _, _ = params
            row = self.assets[(workspace, asset)]
            row["collect_after"] = not any(
                binding["asset_id"] == asset for (bound_workspace, _), binding in self.bindings.items()
                if bound_workspace == workspace)
            self.result = None
        elif "update app_private.shop_media_assets a set state='retiring'" in query:
            token, _, workspace, asset, object_key = params
            row = self.assets[(workspace, asset)]
            if (row["object_key"] == object_key and row["state"] in ("live", "retiring")
                    and (row["state"] != "retiring" or row["expired"])):
                row.update(state="retiring", lease_token=token, lease_until=True,
                           collect_after=False, expired=False)
                self.result = {"asset_id": asset}
            else:
                self.result = None
        elif "update app_private.shop_media_assets a set state='deleted'" in query:
            _, workspace, asset, object_key, token = params
            row = self.assets[(workspace, asset)]
            if (row["state"] == "retiring" and row["lease_token"] == token
                    and row["object_key"] == object_key):
                row.update(state="deleted", lease_token=None, lease_until=None,
                           collect_after=False, expired=False)
                self.result = {"asset_id": asset}
            else:
                self.result = None
        elif "insert into app_private.shop_product_media" in query:
            workspace, sku, fingerprint, asset, size, width, height, actor = params
            self.bindings[(workspace, sku)] = {"sku": sku, "catalog_fingerprint": fingerprint,
                "asset_id": asset, "generation": 1, "byte_size": size, "width": width, "height": height}
            self.result = {"generation": 1}
        elif "update app_private.shop_product_media" in query and "asset_id=null" in query:
            _, workspace, sku, expected = params
            row = self.bindings[(workspace, sku)]
            if row["generation"] != expected:
                self.result = None
            else:
                row.update(asset_id=None, generation=expected + 1, byte_size=None, width=None, height=None)
                self.result = {"generation": expected + 1}
        elif "update app_private.shop_product_media" in query:
            fingerprint, asset, size, width, height, _, workspace, sku, expected = params
            row = self.bindings[(workspace, sku)]
            if row["generation"] != expected:
                self.result = None
            else:
                row.update(catalog_fingerprint=fingerprint, asset_id=asset,
                           generation=expected + 1, byte_size=size, width=width, height=height)
                self.result = {"generation": expected + 1}
        else:
            raise AssertionError(query)

    def fetchone(self):
        return self.result

    def fetchall(self):
        return self.result


class MemoryObjects:
    def __init__(self, database):
        self.database = database
        self.objects = {}
        self.after_put = None
        self.after_fence = None
        self.after_get = None
        self.put_count = 0
        self.delete_count = 0

    def put(self, workspace, prepared, object_key):
        assert not self.database.in_transaction, "provider I/O held a Commerce transaction"
        self.put_count += 1
        if (workspace, object_key) in self.objects:
            raise TrialNotReadyError(("synthetic_asset_already_exists",))
        self.objects[(workspace, object_key)] = prepared.data
        if self.after_put:
            self.after_put()
        return prepared.receipt()

    def get(self, workspace, asset, object_key):
        assert not self.database.in_transaction, "provider I/O held a Commerce transaction"
        try:
            data = self.objects[(workspace, object_key)]
        except KeyError as exc:
            raise TrialNotReadyError(("synthetic_object_missing",)) from exc
        if self.after_get:
            self.after_get()
        return data

    def delete(self, workspace, asset, object_key):
        assert not self.database.in_transaction, "provider I/O held a Commerce transaction"
        self.delete_count += 1
        self.objects.pop((workspace, object_key), None)

    def fence_abandoned_attempt(self, workspace, asset, object_key):
        assert not self.database.in_transaction, "provider I/O held a Commerce transaction"
        prior_bytes = self.objects.get((workspace, object_key))
        if prior_bytes is None:
            prior = "absent"
        elif prior_bytes == SHOP_ATTEMPT_FENCE:
            prior = "fenced"
        elif asset == sha256(prior_bytes).hexdigest() + ".webp":
            prior = "attempt"
        else:
            raise TrialNotReadyError(("shop_media_attempt_inspection_unconfirmed",))
        self.objects[(workspace, object_key)] = SHOP_ATTEMPT_FENCE
        if self.after_fence:
            self.after_fence()
        if self.objects[(workspace, object_key)] != SHOP_ATTEMPT_FENCE:
            raise TrialNotReadyError(("shop_media_fence_unconfirmed",))
        return {**SHOP_ATTEMPT_FENCE_RECEIPT, "observedBeforeFence": prior}


class ShopMediaStoreTests(unittest.TestCase):
    def setUp(self):
        self.db = MemoryDatabase()
        self.objects = MemoryObjects(self.db)
        self.media = ShopMediaStore(self.db, self.objects)
        self.actor = TrialPrincipal("workspace-a", "owner-a", "human")
        self.photo = photo()

    def object_key(self, prepared):
        return self.db.assets[(self.actor.workspace_id, prepared.asset_id)]["object_key"]

    def add_synthetic_live_asset(self, asset_id, object_key, byte_size=1):
        attempt_id = uuid4().hex
        self.db.attempts[(self.actor.workspace_id, attempt_id)] = {
            "attempt_id": attempt_id, "asset_id": asset_id,
            "object_key": object_key, "byte_size": byte_size, "state": "confirmed"}
        self.db.assets[(self.actor.workspace_id, asset_id)] = {
            "asset_id": asset_id, "attempt_id": attempt_id, "object_key": object_key,
            "byte_size": byte_size, "state": "live", "lease_token": None,
            "lease_until": None, "collect_after": False, "expired": False}

    def test_upload_manifest_read_delete_and_generation_tombstone(self):
        self.assertEqual(self.media.manifest(self.actor), {"photos": {}, "generations": {}})
        result = self.media.put(self.actor, "CUP-1", self.photo, 0)
        self.assertEqual(result["generation"], 1)
        self.assertEqual(self.media.manifest(self.actor)["photos"]["CUP-1"]["assetId"], self.photo.asset_id)
        self.assertEqual(self.media.get(self.actor, self.photo.asset_id)[0], self.photo.data)
        self.assertEqual(self.media.put(self.actor, "CUP-1", self.photo, 1)["generation"], 1)
        self.assertEqual(self.objects.put_count, 1)
        self.assertEqual(self.media.delete(self.actor, "CUP-1", 1), {"generation": 2, "removed": True})
        self.assertEqual(self.media.manifest(self.actor), {"photos": {}, "generations": {"CUP-1": 2}})
        with self.assertRaises(TrialNotFound):
            self.media.get(self.actor, self.photo.asset_id)
        with self.assertRaises(TrialVersionConflict):
            self.media.put(self.actor, "CUP-1", self.photo, 0)
        self.assertEqual(self.media.put(self.actor, "CUP-1", self.photo, 2)["generation"], 3)

    def test_missing_product_and_entitlement_deny_before_storage(self):
        with self.assertRaises(TrialNotFound):
            self.media.put(self.actor, "NO-SKU", self.photo, 0)
        self.db.products = ("ecommerce",)
        with self.assertRaises(TrialPermissionDenied):
            self.media.put(self.actor, "CUP-1", self.photo, 0)
        self.assertEqual(self.objects.put_count, 0)

    def test_catalog_replacement_during_upload_cannot_bind_old_photo(self):
        def replace():
            self.db.catalog["catalogBaselines"][0]["anchorDigest"] = "sha256:" + "b" * 64
        self.objects.after_put = replace
        with self.assertRaises(TrialNotFound):
            self.media.put(self.actor, "CUP-1", self.photo, 0)
        self.assertFalse(self.db.events)
        self.assertFalse(self.db.bindings)
        self.assertIn((self.actor.workspace_id, self.object_key(self.photo)), self.objects.objects)

    def test_revocation_or_competing_generation_during_provider_call_fails_closed(self):
        self.objects.after_put = lambda: setattr(self.db, "active", False)
        with self.assertRaises(TrialNotReadyError):
            self.media.put(self.actor, "CUP-1", self.photo, 0)
        self.assertFalse(self.db.bindings)
        self.db.active = True
        self.db.assets[(self.actor.workspace_id, self.photo.asset_id)]["expired"] = True
        self.objects.after_put = lambda: self.db.bindings.update({(self.actor.workspace_id, "CUP-1"):
            {"sku": "CUP-1", "catalog_fingerprint": "x" * 64, "asset_id": None,
             "generation": 1, "byte_size": None, "width": None, "height": None}})
        with self.assertRaises(TrialVersionConflict):
            self.media.put(self.actor, "CUP-1", self.photo, 0)

    def test_catalog_or_membership_change_during_read_blocks_response(self):
        self.media.put(self.actor, "CUP-1", self.photo, 0)
        self.objects.objects[(self.actor.workspace_id, self.object_key(self.photo))] = b"X" * len(self.photo.data)
        with self.assertRaises(TrialNotReadyError):
            self.media.get(self.actor, self.photo.asset_id)
        self.objects.objects[(self.actor.workspace_id, self.object_key(self.photo))] = self.photo.data
        self.objects.after_get = lambda: setattr(self.db, "active", False)
        with self.assertRaises(TrialNotReadyError):
            self.media.get(self.actor, self.photo.asset_id)
        self.db.active = True
        self.objects.after_get = lambda: self.db.catalog.update(items=[])
        with self.assertRaises(TrialNotFound):
            self.media.get(self.actor, self.photo.asset_id)

    def test_pending_upload_charges_quota_until_fence_is_verified(self):
        self.objects.after_put = lambda: setattr(self.db, "active", False)
        with self.assertRaises(TrialNotReadyError):
            self.media.put(self.actor, "CUP-1", self.photo, 0)
        self.db.active = True
        pending = self.db.assets[(self.actor.workspace_id, self.photo.asset_id)]
        self.assertEqual(pending["state"], "pending")
        for index in range(999):
            asset = f"{index:064x}.webp"
            self.add_synthetic_live_asset(asset, f"{index:032x}")
        self.objects.after_put = None
        with self.assertRaises(TrialValidationError):
            self.media.put(self.actor, "CUP-1", photo("#1199aa"), 0)
        self.assertFalse(self.db.bindings)
        pending = self.db.assets[(self.actor.workspace_id, self.photo.asset_id)]
        self.db.assets[(self.actor.workspace_id, self.photo.asset_id)]["expired"] = True
        # Expiry alone never releases quota. The collector retires the old
        # reservation and reads back a permanent same-key private fence.
        self.assertEqual(self.media.collect(self.actor), 1)
        self.assertEqual(pending["state"], "deleted")
        self.assertEqual(self.db.attempts[(self.actor.workspace_id, pending["attempt_id"])]["state"], "fenced")
        self.assertEqual(self.objects.objects[(self.actor.workspace_id, pending["object_key"])],
                         SHOP_ATTEMPT_FENCE)
        self.objects.after_put = None
        with patch("supermega_runtime.shop_media.MAX_HOURLY_UPLOADS", 2000):
            self.assertEqual(self.media.put(self.actor, "CUP-1", self.photo, 0)["generation"], 1)

    def test_ambiguous_upload_retries_on_new_key_and_charges_both_attempts(self):
        def ambiguous():
            raise TrialNotReadyError(("synthetic_ambiguous_upload",))
        self.objects.after_put = ambiguous
        with self.assertRaises(TrialNotReadyError):
            self.media.put(self.actor, "CUP-1", self.photo, 0)
        old_key = self.object_key(self.photo)
        old_attempt = self.db.assets[(self.actor.workspace_id, self.photo.asset_id)]["attempt_id"]
        self.assertEqual(self.db.attempts[(self.actor.workspace_id, old_attempt)]["state"], "ambiguous")
        self.objects.after_put = None
        self.assertEqual(self.media.put(self.actor, "CUP-1", self.photo, 0)["generation"], 1)
        self.assertEqual(self.objects.put_count, 2)
        self.assertNotEqual(old_key, self.object_key(self.photo))
        self.assertEqual(len([row for row in self.db.attempts.values() if row["state"] != "deleted"]), 2)
        self.assertEqual(sum(row["type"] == MEDIA_EVENT for row in self.db.events.values()), 1)
        receipt = next(row["result"] for row in self.db.events.values() if row["type"] == MEDIA_EVENT)
        self.assertEqual(receipt["objectKey"], self.object_key(self.photo))
        self.assertNotEqual(receipt["attemptId"], old_attempt)

    def test_paused_first_upload_cannot_recreate_the_current_key(self):
        original_put = self.objects.put
        self.objects.put = lambda *_: (_ for _ in ()).throw(
            TrialNotReadyError(("synthetic_paused_upload",)))
        with self.assertRaises(TrialNotReadyError):
            self.media.put(self.actor, "CUP-1", self.photo, 0)
        key = self.object_key(self.photo)
        old_attempt = self.db.assets[(self.actor.workspace_id, self.photo.asset_id)]["attempt_id"]
        self.objects.put = original_put
        self.assertEqual(self.media.put(self.actor, "CUP-1", self.photo, 0)["generation"], 1)
        current_key = self.object_key(self.photo)
        self.assertNotEqual(key, current_key)
        # Simulate the first provider POST completing after the second attempt.
        self.objects.objects[(self.actor.workspace_id, key)] = self.photo.data
        self.assertEqual(self.media.collect(self.actor), 1)
        self.assertEqual(self.media.get(self.actor, self.photo.asset_id)[0], self.photo.data)
        self.assertEqual(self.object_key(self.photo), current_key)
        self.assertEqual(self.db.attempts[(self.actor.workspace_id, old_attempt)]["state"], "fenced")
        self.assertEqual(self.objects.objects[(self.actor.workspace_id, key)], SHOP_ATTEMPT_FENCE)
        self.assertEqual(self.objects.put_count, 1)

    def test_late_original_post_cannot_replace_a_verified_fence(self):
        original_put = self.objects.put
        self.objects.put = lambda *_: (_ for _ in ()).throw(
            TrialNotReadyError(("synthetic_upload_timeout",)))
        with self.assertRaises(TrialNotReadyError):
            self.media.put(self.actor, "CUP-1", self.photo, 0)
        old_key = self.object_key(self.photo)
        self.objects.put = original_put
        self.media.put(self.actor, "CUP-1", self.photo, 0)
        self.assertEqual(self.media.collect(self.actor), 1)
        with self.assertRaises(TrialNotReadyError):
            original_put(self.actor.workspace_id, self.photo, old_key)
        self.assertEqual(self.objects.objects[(self.actor.workspace_id, old_key)], SHOP_ATTEMPT_FENCE)
        self.assertEqual(self.media.get(self.actor, self.photo.asset_id)[0], self.photo.data)

    def test_ambiguous_fence_acknowledgement_keeps_payload_quota_until_readback(self):
        self.objects.after_put = lambda: (_ for _ in ()).throw(
            TrialNotReadyError(("synthetic_upload_timeout",)))
        with self.assertRaises(TrialNotReadyError):
            self.media.put(self.actor, "CUP-1", self.photo, 0)
        old_key = self.object_key(self.photo)
        old_attempt = self.db.assets[(self.actor.workspace_id, self.photo.asset_id)]["attempt_id"]
        self.objects.after_put = None
        self.media.put(self.actor, "CUP-1", self.photo, 0)
        self.objects.after_fence = lambda: (_ for _ in ()).throw(
            TrialNotReadyError(("synthetic_fence_timeout",)))
        self.assertEqual(self.media.collect(self.actor), 0)
        self.assertEqual(self.db.attempts[(self.actor.workspace_id, old_attempt)]["state"], "ambiguous")
        self.assertEqual(self.objects.objects[(self.actor.workspace_id, old_key)], SHOP_ATTEMPT_FENCE)
        with patch("supermega_runtime.shop_media.MAX_WORKSPACE_ASSETS", 1):
            with self.assertRaises(TrialValidationError):
                self.media.put(self.actor, "CUP-1", photo("#11aa22"), 1)
        self.objects.after_fence = None
        self.assertEqual(self.media.collect(self.actor), 1)
        self.assertEqual(self.db.attempts[(self.actor.workspace_id, old_attempt)]["state"], "fenced")
        self.assertEqual(self.media.collect(self.actor), 0)
        self.assertEqual(sum(row["type"] == FENCE_EVENT for row in self.db.events.values()), 1)

    def test_other_workspace_cannot_reconcile_an_attempt(self):
        self.objects.after_put = lambda: (_ for _ in ()).throw(
            TrialNotReadyError(("synthetic_upload_timeout",)))
        with self.assertRaises(TrialNotReadyError):
            self.media.put(self.actor, "CUP-1", self.photo, 0)
        old = self.db.assets[(self.actor.workspace_id, self.photo.asset_id)]
        old["expired"] = True
        other = TrialPrincipal("workspace-b", "owner-b", "human")
        self.assertEqual(self.media.reconcile_abandoned_attempts(other), 0)
        self.assertEqual(self.db.attempts[(self.actor.workspace_id, old["attempt_id"])]["state"],
                         "ambiguous")
        self.assertEqual(self.media.reconcile_abandoned_attempts(self.actor), 1)
        self.assertEqual(self.db.attempts[(self.actor.workspace_id, old["attempt_id"])]["state"],
                         "fenced")

    def test_fence_cap_keeps_other_ambiguous_attempt_charged(self):
        self.objects.after_put = lambda: (_ for _ in ()).throw(
            TrialNotReadyError(("synthetic_upload_timeout",)))
        for _ in range(2):
            with self.assertRaises(TrialNotReadyError):
                self.media.put(self.actor, "CUP-1", self.photo, 0)
        with patch("supermega_runtime.shop_media.MAX_WORKSPACE_FENCES", 1):
            self.assertEqual(self.media.reconcile_abandoned_attempts(self.actor, limit=4), 1)
        states = [row["state"] for row in self.db.attempts.values()]
        self.assertEqual(sorted(states), ["ambiguous", "fenced"])
        self.assertEqual(sum(row["type"] == FENCE_EVENT for row in self.db.events.values()), 1)

    def test_absent_payload_releases_quota_only_after_verified_fence(self):
        original_put = self.objects.put
        self.objects.put = lambda *_: (_ for _ in ()).throw(
            TrialNotReadyError(("synthetic_definitive_no_write",)))
        with self.assertRaises(TrialNotReadyError):
            self.media.put(self.actor, "CUP-1", self.photo, 0)
        pending = self.db.assets[(self.actor.workspace_id, self.photo.asset_id)]
        with patch("supermega_runtime.shop_media.MAX_WORKSPACE_ASSETS", 1):
            for index in range(3):
                pending["expired"] = True
                self.assertEqual(self.media.collect(self.actor), 1)
                self.assertEqual(pending["state"], "deleted")
                self.assertEqual(self.objects.objects[(self.actor.workspace_id, pending["object_key"])],
                                 SHOP_ATTEMPT_FENCE)
                if index < 2:
                    with self.assertRaises(TrialNotReadyError):
                        self.media.put(self.actor, "CUP-1", self.photo, 0)
                    pending = self.db.assets[(self.actor.workspace_id, self.photo.asset_id)]
        self.objects.put = original_put
        self.assertEqual(self.objects.put_count, 0)
        self.assertEqual(sum(row["type"] == FENCE_EVENT for row in self.db.events.values()), 3)
        self.assertFalse(any(row["type"] == MEDIA_EVENT for row in self.db.events.values()))

    def test_pending_attempts_count_toward_hourly_rate(self):
        with patch("supermega_runtime.shop_media.MAX_HOURLY_UPLOADS", 1):
            self.objects.put = lambda *_: (_ for _ in ()).throw(
                TrialNotReadyError(("synthetic_unknown_ack",)))
            with self.assertRaises(TrialNotReadyError):
                self.media.put(self.actor, "CUP-1", self.photo, 0)
            with self.assertRaises(TrialNotReadyError) as blocked:
                self.media.put(self.actor, "CUP-1", self.photo, 0)
            self.assertIn("shop_media_upload_rate_limited", str(blocked.exception))
        self.assertFalse(self.db.events)

    def test_repeated_replacement_and_remove_reclaim_physical_quota(self):
        with patch("supermega_runtime.shop_media.MAX_WORKSPACE_ASSETS", 3):
            expected = 0
            colors = ("#ff0000", "#00ff00", "#0000ff", "#ffff00",
                      "#00ffff", "#ff00ff", "#000000", "#ffffff")
            for color in colors:
                prepared = photo(color)
                result = self.media.put(self.actor, "CUP-1", prepared, expected)
                expected = result["generation"]
            self.assertLessEqual(sum(row["state"] != "deleted" for row in self.db.assets.values()), 3)
            self.media.delete(self.actor, "CUP-1", expected)
            self.assertGreaterEqual(self.media.collect(self.actor), 1)
            self.assertEqual(sum(row["state"] != "deleted" for row in self.db.assets.values()), 0)
            self.assertTrue(any(row["type"] == REMOVE_EVENT for row in self.db.events.values()))
            self.assertTrue(any(row["type"] == COLLECT_EVENT for row in self.db.events.values()))
            self.assertEqual(sum(row["type"] == MEDIA_EVENT for row in self.db.events.values()), 8)

    def test_shared_digest_survives_first_sku_removal(self):
        self.db.catalog["items"].append({"sku": "CUP-2", "name": "Another cup", "price": 5000})
        self.media.put(self.actor, "CUP-1", self.photo, 0)
        self.media.put(self.actor, "CUP-2", self.photo, 0)
        self.media.delete(self.actor, "CUP-1", 1)
        self.assertEqual(self.media.collect(self.actor), 0)
        self.assertEqual(self.media.get(self.actor, self.photo.asset_id)[0], self.photo.data)
        self.media.delete(self.actor, "CUP-2", 1)
        self.assertEqual(self.media.collect(self.actor), 1)

    def test_ambiguous_delete_is_retryable_and_reupload_restores_receipt(self):
        self.media.put(self.actor, "CUP-1", self.photo, 0)
        self.media.delete(self.actor, "CUP-1", 1)
        original_delete = self.objects.delete
        def ambiguous(workspace, asset, object_key):
            original_delete(workspace, asset, object_key)
            raise TrialNotReadyError(("synthetic_ambiguous_delete",))
        self.objects.delete = ambiguous
        self.assertEqual(self.media.collect(self.actor), 0)
        asset = self.db.assets[(self.actor.workspace_id, self.photo.asset_id)]
        self.assertEqual(asset["state"], "retiring")
        asset["expired"] = True
        self.objects.delete = original_delete
        self.assertEqual(self.media.collect(self.actor), 1)
        self.assertEqual(asset["state"], "deleted")
        self.assertEqual(self.media.put(self.actor, "CUP-1", self.photo, 2)["generation"], 3)
        self.assertEqual(self.objects.put_count, 2)
        self.assertEqual(sum(row["type"] == MEDIA_EVENT for row in self.db.events.values()), 2)

    def test_old_digest_receipt_does_not_authorize_a_new_upload_attempt(self):
        self.media.put(self.actor, "CUP-1", self.photo, 0)
        old_key = self.object_key(self.photo)
        old_attempt = self.db.assets[(self.actor.workspace_id, self.photo.asset_id)]["attempt_id"]
        self.media.delete(self.actor, "CUP-1", 1)
        self.assertEqual(self.media.collect(self.actor), 1)
        _, _, new_key, new_attempt, fresh = self.media._prepare_upload(
            self.actor, "CUP-1", self.photo, 2)
        self.assertTrue(fresh)
        self.assertNotEqual((old_attempt, old_key), (new_attempt, new_key))
        self.assertIsNotNone(self.media._receipt(self.db, self.actor.workspace_id,
                                                 self.photo.asset_id, old_attempt, old_key))
        self.assertIsNone(self.media._receipt(self.db, self.actor.workspace_id,
                                             self.photo.asset_id, new_attempt, new_key))

    def test_delayed_old_collector_cannot_delete_restored_digest(self):
        self.media.put(self.actor, "CUP-1", self.photo, 0)
        old_key = self.object_key(self.photo)
        self.media.delete(self.actor, "CUP-1", 1)
        original_delete = self.objects.delete
        def delayed_delete(workspace, asset, object_key):
            # Worker A paused after claiming a two-minute lease. Worker B
            # expires that lease, deletes the old key and restores the digest.
            self.db.assets[(workspace, asset)]["expired"] = True
            self.objects.delete = original_delete
            self.assertEqual(self.media.collect(self.actor), 1)
            self.assertEqual(self.media.put(self.actor, "CUP-1", self.photo, 2)["generation"], 3)
            original_delete(workspace, asset, object_key)
        self.objects.delete = delayed_delete
        with self.assertRaises(TrialNotReadyError):
            self.media.collect(self.actor)
        new_key = self.object_key(self.photo)
        self.assertNotEqual(old_key, new_key)
        self.assertEqual(self.db.assets[(self.actor.workspace_id, self.photo.asset_id)]["state"], "live")
        self.assertIn((self.actor.workspace_id, new_key), self.objects.objects)
        self.assertEqual(self.media.get(self.actor, self.photo.asset_id)[0], self.photo.data)
        uploads = [row for row in self.db.events.values() if row["type"] == MEDIA_EVENT]
        self.assertEqual({row["payload"]["objectKey"] for row in uploads}, {old_key, new_key})

    def test_historical_skus_do_not_starve_manifest_or_stale_cleanup(self):
        self.media.put(self.actor, "CUP-1", self.photo, 0)
        for index in range(2001):
            sku = f"OLD-{index:04d}"
            asset_id = f"{index:064x}.webp"
            self.add_synthetic_live_asset(asset_id, f"{index:032x}")
            self.db.bindings[(self.actor.workspace_id, sku)] = {
                "sku": sku, "catalog_fingerprint": "0" * 64, "asset_id": asset_id,
                "generation": 1, "byte_size": 1, "width": 1, "height": 1}
        self.assertIn("CUP-1", self.media.manifest(self.actor)["photos"])
        self.assertEqual(self.media.collect(self.actor, limit=1), 1)
        self.assertIsNone(self.db.bindings[(self.actor.workspace_id, "OLD-0000")]["asset_id"])
        self.assertIn("CUP-1", self.media.manifest(self.actor)["photos"])

    def test_shared_digest_history_does_not_hide_current_image(self):
        self.media.put(self.actor, "CUP-1", self.photo, 0)
        current = self.db.bindings[(self.actor.workspace_id, "CUP-1")]
        for index in range(2001):
            sku = f"OLD-{index:04d}"
            self.db.bindings[(self.actor.workspace_id, sku)] = {
                **current, "sku": sku, "catalog_fingerprint": "0" * 64}
        self.assertEqual(self.media.get(self.actor, self.photo.asset_id)[0], self.photo.data)

    def test_one_replacement_headroom_when_catalog_is_at_asset_limit(self):
        self.db.catalog["items"].append({"sku": "CUP-2", "name": "Second cup", "price": 6000})
        first = photo("#aa1111")
        second = photo("#bb2222")
        replacement = photo("#cc3333")
        with patch("supermega_runtime.shop_media.MAX_WORKSPACE_ASSETS", 2):
            self.media.put(self.actor, "CUP-1", first, 0)
            self.media.put(self.actor, "CUP-2", second, 0)
            self.assertEqual(self.media.put(self.actor, "CUP-1", replacement, 1)["generation"], 2)
            self.assertEqual(sum(row["state"] != "deleted" for row in self.db.assets.values()), 3)
            self.assertEqual(self.media.collect(self.actor), 1)
            self.assertEqual(sum(row["state"] != "deleted" for row in self.db.assets.values()), 2)

    def test_rebind_is_denied_while_private_object_is_retiring(self):
        self.media.put(self.actor, "CUP-1", self.photo, 0)
        self.media.delete(self.actor, "CUP-1", 1)
        original_delete = self.objects.delete
        def racing_delete(workspace, asset, object_key):
            with self.assertRaises(TrialNotReadyError):
                self.media.put(self.actor, "CUP-1", self.photo, 2)
            original_delete(workspace, asset, object_key)
        self.objects.delete = racing_delete
        self.assertEqual(self.media.collect(self.actor), 1)
        self.assertIsNone(self.db.bindings[(self.actor.workspace_id, "CUP-1")]["asset_id"])

    def test_lost_upload_reservation_cannot_publish_a_binding(self):
        def steal_lease():
            self.db.assets[(self.actor.workspace_id, self.photo.asset_id)]["lease_token"] = "other"
        self.objects.after_put = steal_lease
        with self.assertRaises(TrialNotReadyError):
            self.media.put(self.actor, "CUP-1", self.photo, 0)
        self.assertFalse(self.db.bindings)
        self.assertFalse(self.db.events)


class ShopMediaTransportTests(unittest.TestCase):
    def setUp(self):
        self.server_gate_patch = patch("supermega_runtime.shop_media.SHOP_MEDIA_SERVER_ENABLED", True)
        self.server_gate_patch.start()
        self.addCleanup(self.server_gate_patch.stop)
        self.schema_patch = patch("supermega_runtime.shop_media._shop_media_schema_ready", return_value=True)
        self.schema_patch.start()
        self.addCleanup(self.schema_patch.stop)
        self.bucket_patch = patch("supermega_runtime.shop_media.SupabasePrivateMediaStorage._require_private_bucket")
        self.bucket_patch.start()
        self.addCleanup(self.bucket_patch.stop)
        self.store = MagicMock(spec=PostgresTrialStore)
        ready = MagicMock(spec=TrialReadiness)
        for flag in ("database_ready", "schema_ready", "audit_ready", "write_enabled",
                     "auth_ready", "membership_ready"):
            setattr(ready, flag, True)
        ready.capabilities = frozenset({"commerce.read", "commerce.write"})
        self.store.readiness.return_value = ready
        self.actor = TrialPrincipal("workspace-a", "owner-a", "human")
        self.resolve = MagicMock(return_value=self.actor)
        app = FastAPI()
        app.include_router(create_trial_router(store=self.store, resolve_principal=self.resolve))
        self.client = TestClient(app)
        config = MediaStorageConfig("https://synthetic.supabase.co",
                                    "sb_secret_synthetic_fixture_only_123456789", SHOP_BUCKET)
        self.config_patch = patch("supermega_runtime.shop_media.MediaStorageConfig.for_shop_from_environment",
                                  return_value=config)
        self.config_patch.start()
        self.addCleanup(self.config_patch.stop)
        self.adapter_patch = patch("supermega_runtime.shop_media.ShopMediaStore")
        self.adapter = self.adapter_patch.start().return_value
        self.addCleanup(self.adapter_patch.stop)
        self.photo = photo()
        self.adapter.manifest.return_value = {"photos": {}, "generations": {}}
        self.adapter.put.return_value = {"assetId": self.photo.asset_id, "generation": 1}
        self.adapter.get.return_value = (self.photo.data, {"sha256": self.photo.asset_id[:-5]})
        self.adapter.delete.return_value = {"generation": 2, "removed": True}

    def test_private_manifest_upload_image_and_delete(self):
        manifest = self.client.get("/api/trial/v1/shop-media")
        self.assertEqual(manifest.json(), {"photos": {}, "generations": {}})
        uploaded = self.client.put("/api/trial/v1/shop-media/sku/~CUP-1", content=self.photo.data,
            headers={"Content-Type": "image/webp", "If-Match": '"0"'})
        self.assertEqual(uploaded.status_code, 201, uploaded.text)
        self.assertEqual(uploaded.headers["etag"], '"1"')
        image = self.client.get(f"/api/trial/v1/shop-media/image/{self.photo.asset_id}")
        self.assertEqual(image.content, self.photo.data)
        deleted = self.client.delete("/api/trial/v1/shop-media/sku/~CUP-1", headers={"If-Match": '"1"'})
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(self.adapter.collect.call_count, 2)
        self.adapter.collect.assert_any_call(self.actor, limit=1)
        for response in (manifest, uploaded, image, deleted):
            self.assertEqual(response.headers["cache-control"], "private, no-store")

    def test_best_effort_cleanup_failure_does_not_mask_committed_removal(self):
        self.adapter.collect.side_effect = TrialNotReadyError(("synthetic_delete_unconfirmed",))
        with self.assertLogs("supermega_runtime.shop_media", level="WARNING") as logs:
            response = self.client.delete("/api/trial/v1/shop-media/sku/~CUP-1",
                                          headers={"If-Match": '"1"'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"generation": 2, "removed": True})
        self.assertTrue(any("cleanup deferred" in item for item in logs.output))

    def test_preconditions_and_auth_fail_before_body(self):
        self.assertEqual(self.client.put("/api/trial/v1/shop-media/sku/~CUP-1").status_code, 428)
        self.assertEqual(self.client.delete("/api/trial/v1/shop-media/sku/~CUP-1", headers={"If-Match": "0"}).status_code, 400)
        self.resolve.return_value = None
        self.assertEqual(self.client.get("/api/trial/v1/shop-media").status_code, 401)
        self.adapter.put.assert_not_called()

    def test_dot_sku_uses_stable_prefixed_segment(self):
        response = self.client.put("/api/trial/v1/shop-media/sku/~..", content=self.photo.data,
            headers={"Content-Type": "image/webp", "If-Match": '"0"'})
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(self.adapter.put.call_args.args[1], "..")

    def test_private_shop_bucket_is_separate_and_public_bucket_rejected(self):
        self.bucket_patch.stop()
        self.assertNotEqual(BUCKET, SHOP_BUCKET)
        storage = SupabasePrivateMediaStorage(MediaStorageConfig(
            "https://synthetic.supabase.co", "sb_secret_synthetic_fixture_only_123456789", SHOP_BUCKET))
        first = storage._object_path("workspace-a", self.photo.asset_id, "a" * 32)
        second = storage._object_path("workspace-a", self.photo.asset_id, "b" * 32)
        self.assertNotEqual(first, second)
        self.assertTrue(first.endswith(f"/{'a' * 32}/{self.photo.asset_id}"))
        with self.assertRaises(TrialNotReadyError):
            storage._object_path("workspace-a", self.photo.asset_id, None)
        with patch.object(storage, "_request", return_value=(200, json.dumps(
                {"id": SHOP_BUCKET, "public": True}).encode())):
            with self.assertRaises(TrialNotReadyError):
                storage.put("workspace-a", self.photo)

    def test_conflict_acknowledgement_cannot_be_promoted_by_later_get(self):
        self.bucket_patch.stop()
        storage = SupabasePrivateMediaStorage(MediaStorageConfig(
            "https://synthetic.supabase.co", "sb_secret_synthetic_fixture_only_123456789", SHOP_BUCKET))
        calls = []
        def request(method, path, **_):
            calls.append(method)
            if method == "GET":
                return 200, json.dumps({"id": SHOP_BUCKET, "public": False}).encode()
            return 409, b""
        with patch.object(storage, "_request", side_effect=request):
            with self.assertRaises(TrialNotReadyError):
                storage.put("workspace-a", self.photo, "a" * 32)
        self.assertEqual(calls, ["GET", "POST"])

    def test_fence_uses_upsert_only_for_exact_abandoned_key_and_requires_readback(self):
        self.bucket_patch.stop()
        storage = SupabasePrivateMediaStorage(MediaStorageConfig(
            "https://synthetic.supabase.co", "sb_secret_synthetic_fixture_only_123456789", SHOP_BUCKET))
        calls = []
        def request(method, path, **kwargs):
            calls.append((method, path, kwargs.get("upsert", False)))
            if path == f"bucket/{SHOP_BUCKET}":
                return 200, json.dumps({"id": SHOP_BUCKET, "public": False}).encode()
            if method == "POST":
                self.assertEqual(kwargs["data"], SHOP_ATTEMPT_FENCE)
                return 201, b""
            if len(calls) == 2:
                return 404, b""
            return 200, SHOP_ATTEMPT_FENCE
        with patch.object(storage, "_request", side_effect=request):
            self.assertEqual(storage.fence_abandoned_attempt(
                "workspace-a", self.photo.asset_id, "a" * 32),
                {**SHOP_ATTEMPT_FENCE_RECEIPT, "observedBeforeFence": "absent"})
        self.assertEqual([method for method, _, _ in calls], ["GET", "GET", "POST", "GET"])
        self.assertEqual(calls[2][2], True)
        self.assertTrue(calls[2][1].endswith(f"/{'a' * 32}/{self.photo.asset_id}"))
        object_reads = 0
        def wrong_readback(method, path, **kwargs):
            nonlocal object_reads
            if path == f"bucket/{SHOP_BUCKET}":
                return 200, json.dumps({"id": SHOP_BUCKET, "public": False}).encode()
            if method == "POST":
                return 201, b""
            object_reads += 1
            return 200, self.photo.data
        with patch.object(storage, "_request", side_effect=wrong_readback):
            with self.assertRaises(TrialNotReadyError):
                storage.fence_abandoned_attempt("workspace-a", self.photo.asset_id, "a" * 32)
        self.assertEqual(object_reads, 2)
        writes = []
        def unknown_existing(method, path, **kwargs):
            if path == f"bucket/{SHOP_BUCKET}":
                return 200, json.dumps({"id": SHOP_BUCKET, "public": False}).encode()
            if method == "POST":
                writes.append(path)
                return 201, b""
            return 200, b"unexpected tenant content"
        with patch.object(storage, "_request", side_effect=unknown_existing):
            with self.assertRaises(TrialNotReadyError):
                storage.fence_abandoned_attempt("workspace-a", self.photo.asset_id, "a" * 32)
        self.assertEqual(writes, [])

    def test_original_upload_is_non_upsert_and_only_fence_can_overwrite(self):
        self.bucket_patch.stop()
        storage = SupabasePrivateMediaStorage(MediaStorageConfig(
            "https://synthetic.supabase.co", "sb_secret_synthetic_fixture_only_123456789", SHOP_BUCKET))
        requests = []
        class Response:
            status = 201
            def __enter__(self):
                return self
            def __exit__(self, *_):
                return False
            def read(self, *_):
                return b""
        class Opener:
            def open(self, request, *, timeout):
                requests.append(request)
                return Response()
        with patch("supermega_runtime.website_media_storage.build_opener", return_value=Opener()):
            storage._request("POST", "object/example/original", data=self.photo.data)
            storage._request("POST", "object/example/fence", data=SHOP_ATTEMPT_FENCE,
                             upsert=True)
        self.assertEqual([request.get_header("X-upsert") for request in requests],
                         ["false", "true"])


class ShopMediaServerGateTests(unittest.TestCase):
    def setUp(self):
        self.store = MagicMock(spec=PostgresTrialStore)
        ready = MagicMock(spec=TrialReadiness)
        for flag in ("database_ready", "schema_ready", "audit_ready", "write_enabled",
                     "auth_ready", "membership_ready"):
            setattr(ready, flag, True)
        ready.capabilities = frozenset({"commerce.read", "commerce.write"})
        self.store.readiness.return_value = ready
        self.actor = TrialPrincipal("workspace-a", "owner-a", "human")
        self.resolve = MagicMock(return_value=self.actor)
        app = FastAPI()
        app.include_router(create_trial_router(store=self.store, resolve_principal=self.resolve))
        self.client = TestClient(app)
        self.config = MediaStorageConfig("https://synthetic.supabase.co",
            "sb_secret_synthetic_fixture_only_123456789", SHOP_BUCKET)

    def test_storage_key_cannot_enable_server_routes_without_rollout(self):
        with (patch("supermega_runtime.shop_media.MediaStorageConfig.for_shop_from_environment",
                    return_value=self.config) as config,
              patch("supermega_runtime.shop_media.ShopMediaStore") as adapter):
            responses = [self.client.get("/api/trial/v1/shop-media"),
                self.client.get(f"/api/trial/v1/shop-media/image/{photo().asset_id}"),
                self.client.put("/api/trial/v1/shop-media/sku/~CUP-1",
                    content=photo().data, headers={"Content-Type": "image/webp", "If-Match": '"0"'}),
                self.client.delete("/api/trial/v1/shop-media/sku/~CUP-1",
                    headers={"If-Match": '"1"'})]
        for response in responses:
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json()["detail"]["code"], "shop_media_disabled")
            self.assertEqual(response.headers["cache-control"], "private, no-store")
        config.assert_not_called()
        adapter.assert_not_called()
        self.store._guarded_cursor.assert_not_called()

    def test_explicit_server_rollout_still_rejects_absent_candidate_tables(self):
        cursor = MagicMock()
        cursor.fetchone.return_value = {"ready": False}
        @contextmanager
        def missing_schema(*_, **__):
            yield cursor, None
        self.store._guarded_cursor.side_effect = missing_schema
        with (patch("supermega_runtime.shop_media.SHOP_MEDIA_SERVER_ENABLED", True),
              patch("supermega_runtime.shop_media.MediaStorageConfig.for_shop_from_environment",
                    return_value=self.config),
              patch("supermega_runtime.shop_media.SupabasePrivateMediaStorage") as storage,
              patch("supermega_runtime.shop_media.ShopMediaStore") as adapter):
            response = self.client.get("/api/trial/v1/shop-media")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"]["code"], "shop_media_schema_unavailable")
        self.assertIn("shop_media_upload_attempts", cursor.execute.call_args.args[0])
        storage.assert_not_called()
        adapter.assert_not_called()

    def test_explicit_server_rollout_still_requires_a_private_bucket(self):
        with (patch("supermega_runtime.shop_media.SHOP_MEDIA_SERVER_ENABLED", True),
              patch("supermega_runtime.shop_media._shop_media_schema_ready", return_value=True),
              patch("supermega_runtime.shop_media.MediaStorageConfig.for_shop_from_environment",
                    return_value=self.config),
              patch("supermega_runtime.shop_media.SupabasePrivateMediaStorage") as storage,
              patch("supermega_runtime.shop_media.ShopMediaStore") as adapter):
            storage.return_value._require_private_bucket.side_effect = TrialNotReadyError(
                ("website_media_private_bucket_required",))
            response = self.client.get("/api/trial/v1/shop-media")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"]["code"], "shop_media_storage_unavailable")
        adapter.assert_not_called()


@unittest.skipUnless(os.environ.get("SUPERMEGA_TEST_POSTGRES") == "1",
                     "Set SUPERMEGA_TEST_POSTGRES=1 for disposable local PostgreSQL.")
class ShopMediaPostgresTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.admin, runtime = cls.enterClassContext(_local_database())
        migration = (Path(__file__).resolve().parents[1] / "supabase" / "migrations"
                     / pg.SHOP_MEDIA_CANDIDATE_MIGRATION)
        with pg._connect(cls.admin) as connection:
            connection.execute(migration.read_text(encoding="utf-8"))
        cls.store = PostgresTrialStore(runtime, reducer=lambda surface, event, state, payload: state,
                                       write_enabled=True)

    def _sql(self, statement, parameters=()):
        with pg._connect(self.admin) as connection:
            with connection.cursor() as cursor:
                cursor.execute(statement, parameters)
                return cursor.fetchall() if cursor.description else []

    def _principal(self, product="shop"):
        actor, session, workspace = str(uuid4()), str(uuid4()), "shop-media-" + str(uuid4())
        self._sql("""insert into app_private.workspace_access_controls
            (workspace_id,activation_id,authorization_id,authorization_contract,
             plan_digest,owner_actor_id,project_ref,release_commit,status)
            values(%s,%s,%s,'legacy_migration_v1',%s,%s,%s,%s,'active')""",
            (workspace, str(uuid4()), str(uuid4()), "0" * 64, actor, "0" * 20, "0" * 40))
        self._sql("""insert into app_private.workspace_events
            (event_id,workspace_id,command_id,command_fingerprint,surface,event_type,
             actor_id,actor_kind,payload_json,result_json)
            values(%s,%s,%s,%s,'company','company.workspace.activated',%s,'human',%s::jsonb,%s::jsonb)""",
            (str(uuid4()), workspace, str(uuid4()), "0" * 64, actor,
             json.dumps({"products": [product]}), json.dumps({"status": "activated"})))
        self._sql("""insert into app_private.workspace_memberships
            (workspace_id,actor_id,status,capabilities,actor_kind)
            values(%s,%s,'active',%s,'human')""",
            (workspace, actor, ["company.read", "commerce.read", "commerce.write"]))
        self._sql("insert into auth.sessions (id,user_id) values (%s,%s)", (session, actor))
        catalog = {"items": [{"sku": "CUP-1", "name": "Ceramic cup", "price": 5000}],
                   "catalogBaselines": [{"sku": "CUP-1", "anchorDigest": "sha256:" + "a" * 64}]}
        self._sql("""insert into app_private.workspace_state
            (workspace_id,surface,version,state_json,updated_by)
            values(%s,'commerce',1,%s::jsonb,%s)""", (workspace, json.dumps(catalog), actor))
        return TrialPrincipal(workspace, actor, actor_kind="human", session_id=session,
                              identity_provider="supabase")

    def test_real_private_rls_binding_and_cross_tenant_denial(self):
        actor = self._principal()
        self.assertTrue(_shop_media_schema_ready(self.store, actor))
        prepared = photo()
        storage = MagicMock()
        storage.put.return_value = prepared.receipt()
        storage.get.return_value = prepared.data
        media = ShopMediaStore(self.store, storage)
        self.assertEqual(media.put(actor, "CUP-1", prepared, 0)["generation"], 1)
        self.assertEqual(media.manifest(actor)["photos"]["CUP-1"]["assetId"], prepared.asset_id)
        self.assertEqual(media.get(actor, prepared.asset_id)[0], prepared.data)
        other = self._principal()
        storage.get.reset_mock()
        with self.assertRaises(TrialNotFound):
            media.get(other, prepared.asset_id)
        storage.get.assert_not_called()
        self.assertEqual(media.delete(actor, "CUP-1", 1)["generation"], 2)
        self.assertEqual(media.manifest(actor)["generations"]["CUP-1"], 2)
        with self.assertRaises(TrialNotFound):
            media.get(actor, prepared.asset_id)
        self.assertEqual(self._sql("""select state from app_private.shop_media_assets
            where workspace_id=%s and asset_id=%s""",
            (actor.workspace_id, prepared.asset_id)), [("live",)])
        self.assertEqual(media.collect(actor), 1)
        old_key = storage.put.call_args.args[2]
        storage.delete.assert_called_once_with(actor.workspace_id, prepared.asset_id, old_key)
        self.assertEqual(self._sql("""select state from app_private.shop_media_assets
            where workspace_id=%s and asset_id=%s""",
            (actor.workspace_id, prepared.asset_id)), [("deleted",)])
        self.assertEqual(media.put(actor, "CUP-1", prepared, 2)["generation"], 3)
        self.assertEqual(storage.put.call_count, 2)
        self.assertNotEqual(old_key, storage.put.call_args.args[2])
        self.assertEqual(self._sql("""select event_type,count(*) from app_private.workspace_events
            where workspace_id=%s and event_type in (%s,%s,%s)
            group by event_type order by event_type""",
            (actor.workspace_id, MEDIA_EVENT, REMOVE_EVENT, COLLECT_EVENT)),
            [(COLLECT_EVENT, 1), (REMOVE_EVENT, 1), (MEDIA_EVENT, 2)])
        ecommerce = self._principal("ecommerce")
        with self.assertRaises(TrialPermissionDenied):
            media.put(ecommerce, "CUP-1", prepared, 0)
        rows = self._sql("""select relrowsecurity,relforcerowsecurity,
            has_table_privilege('anon','app_private.shop_product_media','select'),
            has_table_privilege('authenticated','app_private.shop_product_media','select')
            from pg_class where oid='app_private.shop_product_media'::regclass""")
        self.assertEqual(rows, [(True, True, False, False)])
        asset_permissions = self._sql("""select relrowsecurity,relforcerowsecurity,
            has_table_privilege('anon','app_private.shop_media_assets','select'),
            has_table_privilege('authenticated','app_private.shop_media_assets','select')
            from pg_class where oid='app_private.shop_media_assets'::regclass""")
        self.assertEqual(asset_permissions, [(True, True, False, False)])
        attempt_permissions = self._sql("""select relrowsecurity,relforcerowsecurity,
            has_column_privilege('supermega_trial_backend',
              'app_private.shop_media_upload_attempts','state','update'),
            has_column_privilege('supermega_trial_backend',
              'app_private.shop_media_upload_attempts','object_key','update'),
            has_column_privilege('supermega_trial_backend',
              'app_private.shop_media_upload_attempts','attempt_id','update'),
            has_table_privilege('authenticated','app_private.shop_media_upload_attempts','select')
            from pg_class where oid='app_private.shop_media_upload_attempts'::regclass""")
        self.assertEqual(attempt_permissions, [(True, True, True, False, False, False)])

    def test_real_sql_fence_reconciles_only_own_abandoned_attempt(self):
        actor = self._principal()
        other = self._principal()
        prepared = photo("#663399")
        storage = MagicMock()
        storage.put.side_effect = TrialNotReadyError(("synthetic_upload_timeout",))
        storage.fence_abandoned_attempt.return_value = {
            **SHOP_ATTEMPT_FENCE_RECEIPT, "observedBeforeFence": "absent"}
        media = ShopMediaStore(self.store, storage)
        with self.assertRaises(TrialNotReadyError):
            media.put(actor, "CUP-1", prepared, 0)
        attempt_id, key = self._sql("""select attempt_id,object_key
            from app_private.shop_media_upload_attempts where workspace_id=%s""",
            (actor.workspace_id,))[0]
        self.assertEqual(media.reconcile_abandoned_attempts(other), 0)
        storage.fence_abandoned_attempt.assert_not_called()
        self.assertEqual(media.reconcile_abandoned_attempts(actor), 1)
        storage.fence_abandoned_attempt.assert_called_once_with(
            actor.workspace_id, prepared.asset_id, key)
        self.assertEqual(self._sql("""select state from app_private.shop_media_upload_attempts
            where workspace_id=%s and attempt_id=%s""", (actor.workspace_id, attempt_id)),
            [("fenced",)])
        self.assertEqual(self._sql("""select state from app_private.shop_media_assets
            where workspace_id=%s and asset_id=%s""", (actor.workspace_id, prepared.asset_id)),
            [("deleted",)])
        receipt = self._sql("""select result_json from app_private.workspace_events
            where workspace_id=%s and event_type=%s""", (actor.workspace_id, FENCE_EVENT))[0][0]
        self.assertEqual(receipt["objectKey"], key)
        self.assertEqual(receipt["fenceSha256"], SHOP_ATTEMPT_FENCE_RECEIPT["sha256"])
        self.assertEqual(media.reconcile_abandoned_attempts(actor), 0)
        with patch("supermega_runtime.shop_media.MAX_WORKSPACE_FENCES", 1):
            with self.assertRaises(TrialNotReadyError) as full:
                media.put(actor, "CUP-1", photo("#336699"), 0)
        self.assertIn("shop_media_fence_limit_reached", str(full.exception))

    def test_removed_catalog_sku_retires_private_asset_under_rls(self):
        actor = self._principal()
        prepared = photo("#3366cc")
        storage = MagicMock()
        storage.put.return_value = prepared.receipt()
        storage.get.return_value = prepared.data
        media = ShopMediaStore(self.store, storage)
        media.put(actor, "CUP-1", prepared, 0)
        self._sql("""update app_private.workspace_state set version=version+1,state_json=jsonb_set(
            state_json,'{items}','[]'::jsonb) where workspace_id=%s and surface='commerce'""",
            (actor.workspace_id,))
        self.assertEqual(media.collect(actor), 1)
        self.assertEqual(self._sql("""select generation,asset_id from app_private.shop_product_media
            where workspace_id=%s and sku='CUP-1'""", (actor.workspace_id,)), [(2, None)])
        self.assertEqual(self._sql("""select state from app_private.shop_media_assets
            where workspace_id=%s and asset_id=%s""",
            (actor.workspace_id, prepared.asset_id)), [("deleted",)])

    def test_real_sql_filters_current_skus_before_limit_and_batches_stale_rows(self):
        actor = self._principal()
        prepared = photo("#4455aa")
        storage = MagicMock()
        storage.put.return_value = prepared.receipt()
        media = ShopMediaStore(self.store, storage)
        media.put(actor, "CUP-1", prepared, 0)
        self._sql("""insert into app_private.shop_media_upload_attempts
            (workspace_id,attempt_id,asset_id,object_key,byte_size,state,updated_by)
            select %s,md5('attempt:'||i::text),lpad(to_hex(i),64,'0')||'.webp',
              md5(i::text),1,'confirmed',%s
            from generate_series(0,2000) i""", (actor.workspace_id, actor.actor_id))
        self._sql("""insert into app_private.shop_media_assets
            (workspace_id,asset_id,attempt_id,object_key,byte_size,state,updated_by)
            select %s,lpad(to_hex(i),64,'0')||'.webp',md5('attempt:'||i::text),
              md5(i::text),1,'live',%s
            from generate_series(0,2000) i""", (actor.workspace_id, actor.actor_id))
        self._sql("""insert into app_private.shop_product_media
            (workspace_id,sku,catalog_fingerprint,asset_id,generation,byte_size,width,height,updated_by)
            select %s,'OLD-'||lpad(i::text,4,'0'),repeat('0',64),
                lpad(to_hex(i),64,'0')||'.webp',1,1,1,1,%s
            from generate_series(0,2000) i""", (actor.workspace_id, actor.actor_id))
        self.assertIn("CUP-1", media.manifest(actor)["photos"])
        self.assertEqual(media.collect(actor, limit=1), 1)
        self.assertEqual(self._sql("""select asset_id from app_private.shop_product_media
            where workspace_id=%s and sku='OLD-0000'""", (actor.workspace_id,)), [(None,)])

    def test_real_sql_bounded_full_catalog_replacement_headroom(self):
        actor = self._principal()
        self._sql("""update app_private.workspace_state set version=version+1,state_json=jsonb_set(
            state_json,'{items}',state_json->'items' ||
            '[{"sku":"CUP-2","name":"Second cup","price":6000}]'::jsonb)
            where workspace_id=%s and surface='commerce'""", (actor.workspace_id,))
        storage = MagicMock()
        storage.put.side_effect = lambda _workspace, prepared, _object_key: prepared.receipt()
        media = ShopMediaStore(self.store, storage)
        with patch("supermega_runtime.shop_media.MAX_WORKSPACE_ASSETS", 2):
            media.put(actor, "CUP-1", photo("#aa1111"), 0)
            media.put(actor, "CUP-2", photo("#bb2222"), 0)
            media.put(actor, "CUP-1", photo("#cc3333"), 1)
            self.assertEqual(self._sql("""select count(*) from app_private.shop_media_assets
                where workspace_id=%s and state <> 'deleted'""", (actor.workspace_id,)), [(3,)])
            self.assertEqual(media.collect(actor), 1)
            self.assertEqual(self._sql("""select count(*) from app_private.shop_media_assets
                where workspace_id=%s and state <> 'deleted'""", (actor.workspace_id,)), [(2,)])


if __name__ == "__main__":
    unittest.main()
