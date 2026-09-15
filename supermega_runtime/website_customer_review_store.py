"""Guarded PostgreSQL adapter for prepared Website reviews, not an HTTP API.

The optional storage migration must be installed through the reviewed release
path. Customers never read workspace_state. SQL owns snapshot validation and
invalidation; this adapter requires READ COMMITTED and serializes reads/writes
against that same invalidation lock. No membership or publishing is granted.
"""

from contextlib import contextmanager
from copy import deepcopy
from datetime import timedelta
import json
from typing import Any, Mapping

from .trial_store import PostgresTrialStore, TrialPrincipal, TrialPermissionDenied, TrialValidationError, TrialNotReadyError
from .website_customer_review import _digest, _text, _uuid, _time, _preview


class WebsiteCustomerReviewStore:
    def __init__(self, store: PostgresTrialStore):
        self.store = store

    @contextmanager
    def _transaction(self, principal: TrialPrincipal, *, write: bool, capability: str, lock_source: bool = False):
        actor = principal.normalized()
        if actor.actor_kind != "human":
            raise TrialPermissionDenied(capability)
        with self.store._guarded_cursor(actor, write=write, capability=capability) as (cursor, _):
            # The base store permits the extension to be absent. This adapter
            # requires it; existing guards have already been byte/shape checked.
            cursor.execute("""select count(*) as guards from pg_trigger t
                join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
                where n.nspname='app_private' and not t.tgisinternal and
                (c.relname,t.tgname) in (('website_customer_reviews','website_review_guard'),
                 ('workspace_state','website_reviews_invalidate'),('website_customer_feedback','website_feedback_guard'))""")
            if cursor.fetchone()["guards"] != 3:
                raise TrialNotReadyError(("website_review_storage_ready",))
            cursor.execute("select current_setting('transaction_isolation') as isolation")
            if cursor.fetchone()["isolation"] != "read committed":
                raise TrialValidationError("website_review_requires_read_committed")
            if lock_source:
                # Match the Website UPDATE/INSERT-trigger ordering: source row
                # first, then advisory lock. Never invert this during preparation.
                cursor.execute("select version from app_private.workspace_state where workspace_id=%s and surface='website' for update", (actor.workspace_id,))
                if cursor.fetchone() is None:
                    raise TrialValidationError("website_review_source_missing")
            cursor.execute("select pg_advisory_xact_lock(hashtextextended('website-review:' || %s,0))", (actor.workspace_id,))
            # A lock wait may outlive session or entitlement revocation.
            self.store._assert_active_identity_session(cursor, actor)
            if "website" not in (self.store._product_entitlements(cursor, actor.workspace_id) or ()):
                raise TrialPermissionDenied(capability)
            yield cursor, actor
        # Returning to the caller happens only after the outer transaction commits.

    def prepare(self, principal: TrialPrincipal, *, review_id: str, recipient_actor_id: str,
                expected_version: int, expires_at: str) -> dict[str, Any]:
        review_id, recipient = _uuid(review_id), _uuid(recipient_actor_id)
        expiry = _time(expires_at)
        if type(expected_version) is not int or expected_version < 1:
            raise TrialValidationError("website_review_source_stale")
        with self._transaction(principal, write=True, capability="website.write", lock_source=True) as (cursor, actor):
            cursor.execute("select clock_timestamp() as now")
            now = cursor.fetchone()["now"]
            if not now < expiry <= now + timedelta(days=7):
                raise TrialValidationError("website_review_expiry_invalid")
            cursor.execute("select version,state_json from app_private.workspace_state where workspace_id=%s and surface='website'", (actor.workspace_id,))
            source = cursor.fetchone()
            if source is None or source["version"] != expected_version:
                raise TrialValidationError("website_review_source_stale")
            cursor.execute("select app_private.website_review_recipient_ready(%s) as ready", (recipient,))
            if (cursor.fetchone() or {}).get("ready") is not True:
                raise TrialPermissionDenied("website.review")
            revision, preview = _preview(source["state_json"])
            digest = _digest(preview)
            cursor.execute("""select recipient_actor_id,prepared_by,source_version,preview_digest,expires_at,status
                from app_private.website_customer_reviews where workspace_id=%s and review_id=%s""", (actor.workspace_id, review_id))
            prior = cursor.fetchone()
            replay = prior is not None
            if prior is not None:
                if (prior["recipient_actor_id"] != recipient or prior["prepared_by"] != actor.actor_id
                        or prior["source_version"] != expected_version or prior["preview_digest"] != digest
                        or prior["expires_at"] != expiry or prior["status"] != "active"):
                    raise TrialValidationError("website_review_prepare_conflict")
            else:
                cursor.execute("""insert into app_private.website_customer_reviews
                    (review_id,workspace_id,recipient_actor_id,prepared_by,source_version,preview,preview_digest,expires_at)
                    values (%s,%s,%s,%s,%s,%s::jsonb,%s,%s)""",
                    (review_id, actor.workspace_id, recipient, actor.actor_id, expected_version,
                     json.dumps(preview, ensure_ascii=False), digest, expiry))
            cursor.execute("""select review_id from app_private.website_customer_reviews
                where workspace_id=%s and review_id=%s and status='active' and expires_at>clock_timestamp()""", (actor.workspace_id, review_id))
            if cursor.fetchone() is None:
                raise TrialValidationError("website_review_expired")
            result = {"reviewId": review_id, "contentRevision": revision, "sourceVersion": expected_version,
                      "previewDigest": digest, "expiresAt": expiry.isoformat(), "status": "prepared_preview",
                      "persisted": True, "replayed": replay, "publicationAuthorized": False}
        return result

    def revoke(self, principal: TrialPrincipal, review_id: str) -> dict[str, Any]:
        review_id = _uuid(review_id)
        with self._transaction(principal, write=True, capability="website.write") as (cursor, actor):
            cursor.execute("select status from app_private.website_customer_reviews where workspace_id=%s and review_id=%s", (actor.workspace_id, review_id))
            prior = cursor.fetchone()
            if prior is None:
                raise TrialPermissionDenied("website.write")
            replay = prior["status"] == "revoked"
            if not replay:
                cursor.execute("update app_private.website_customer_reviews set status='revoked' where workspace_id=%s and review_id=%s returning status", (actor.workspace_id, review_id))
                if (cursor.fetchone() or {}).get("status") != "revoked":
                    raise TrialValidationError("website_review_revoke_failed")
            result = {"reviewId": review_id, "status": "revoked", "persisted": True,
                      "replayed": replay, "publicationAuthorized": False}
        return result

    @staticmethod
    def _assignment(cursor: Any, actor: TrialPrincipal, review_id: str):
        cursor.execute("""select review_id, source_version, content_revision, preview,
            preview_digest, expires_at from app_private.website_customer_reviews
            where workspace_id=%s and recipient_actor_id=%s and review_id=%s
              and status='active' and prepared_at <= clock_timestamp()
              and expires_at > clock_timestamp()""", (actor.workspace_id, actor.actor_id, _uuid(review_id)))
        row = cursor.fetchone()
        if row is None:
            raise TrialPermissionDenied("website.review")
        if _digest(row["preview"]) != row["preview_digest"]:
            raise TrialValidationError("website_review_snapshot_corrupt")
        return row

    def preview(self, principal: TrialPrincipal, review_id: str) -> dict[str, Any]:
        with self._transaction(principal, write=False, capability="website.review") as (cursor, actor):
            row = self._assignment(cursor, actor, review_id)
            result = {"reviewId": str(row["review_id"]), "contentRevision": row["content_revision"],
                      "preview": deepcopy(row["preview"]), "previewDigest": row["preview_digest"],
                      "expiresAt": row["expires_at"].isoformat(), "status": "prepared_preview",
                      "publicationAuthorized": False}
        return result

    def feedback(self, principal: TrialPrincipal, review_id: str, *, after: str | None = None) -> dict[str, Any]:
        """Staff-only retained feedback. Reading never revives or approves a review.

        The cursor identifies a retained row in this exact review; its server
        timestamp plus command ID supplies deterministic keyset pagination.
        Newly arriving feedback appears on a fresh first page, not mid-history.
        """
        review_id = _uuid(review_id)
        if after is not None:
            after = _uuid(after)
        with self._transaction(principal, write=False, capability="website.write") as (cursor, actor):
            cursor.execute("""select content_revision,source_version,preview_digest,recipient_actor_id,
                case when status='active' and expires_at<=clock_timestamp() then 'expired' else status end as status
                from app_private.website_customer_reviews where workspace_id=%s and review_id=%s""", (actor.workspace_id, review_id))
            review = cursor.fetchone()
            if review is None:
                raise TrialPermissionDenied("website.write")
            anchor = None
            if after is not None:
                cursor.execute("""select created_at,command_id from app_private.website_customer_feedback
                    where workspace_id=%s and actor_id=%s and command_id=%s and review_id=%s limit 2""",
                    (actor.workspace_id, review["recipient_actor_id"], after, review_id))
                anchors = cursor.fetchall()
                if len(anchors) != 1:
                    raise TrialValidationError("website_review_cursor_invalid")
                anchor = anchors[0]
            parameters = [actor.workspace_id, review_id]
            boundary = ""
            if anchor is not None:
                boundary = " and (created_at,command_id)<(%s,%s)"
                parameters.extend([anchor["created_at"], anchor["command_id"]])
            cursor.execute("""select command_id,source_version,preview_digest,note,created_at
                from app_private.website_customer_feedback where workspace_id=%s and review_id=%s"""
                + boundary + " order by created_at desc,command_id desc limit 51", parameters)
            rows = cursor.fetchall()
            # Even retained rows must match the immutable prepared revision.
            if any(row["source_version"] != review["source_version"] or row["preview_digest"] != review["preview_digest"] for row in rows):
                raise TrialValidationError("website_review_feedback_revision_invalid")
            page = rows[:50]
            result = {"reviewId": review_id, "contentRevision": review["content_revision"],
                      "sourceVersion": review["source_version"], "previewDigest": review["preview_digest"],
                      "reviewStatus": review["status"], "publicationAuthorized": False,
                      "requests": [{"commandId": str(row["command_id"]), "note": row["note"],
                                    "createdAt": row["created_at"].isoformat()} for row in page],
                      "nextAfter": str(page[-1]["command_id"]) if len(rows) > 50 else None}
        return result

    def request_changes(self, principal: TrialPrincipal, payload: Mapping[str, Any]) -> dict[str, Any]:
        if not isinstance(payload, Mapping) or set(payload) != {"commandId", "reviewId", "previewDigest", "note"}:
            raise TrialValidationError("website_review_payload_invalid")
        command_id, review_id = _uuid(payload["commandId"]), _uuid(payload["reviewId"])
        note = _text(payload["note"], 2000)
        with self._transaction(principal, write=True, capability="website.review") as (cursor, actor):
            row = self._assignment(cursor, actor, review_id)
            if payload["previewDigest"] != row["preview_digest"]:
                raise TrialValidationError("website_review_stale_revision")
            identity = {"contract": "supermega.website.customer-change-request.v1",
                        "workspaceId": actor.workspace_id, "actorId": actor.actor_id,
                        "reviewId": review_id, "commandId": command_id,
                        "contentRevision": row["content_revision"],
                        "previewDigest": row["preview_digest"], "note": note}
            fingerprint = _digest(identity)
            cursor.execute("""select review_id, source_version, preview_digest, command_fingerprint, note, created_at
                from app_private.website_customer_feedback where workspace_id=%s and actor_id=%s and command_id=%s""",
                           (actor.workspace_id, actor.actor_id, command_id))
            retained = cursor.fetchone()
            replay = retained is not None
            if retained is None:
                cursor.execute("""insert into app_private.website_customer_feedback
                    (workspace_id,actor_id,command_id,review_id,source_version,preview_digest,command_fingerprint,note)
                    values (%s,%s,%s,%s,%s,%s,%s,%s)
                    returning review_id,source_version,preview_digest,command_fingerprint,note,created_at""",
                               (actor.workspace_id, actor.actor_id, command_id, review_id, row["source_version"],
                                row["preview_digest"], fingerprint, note))
                retained = cursor.fetchone()
            if (retained is None or str(retained["review_id"]) != review_id
                    or retained["source_version"] != row["source_version"]
                    or retained["preview_digest"] != row["preview_digest"]
                    or retained["note"] != note or retained["command_fingerprint"] != fingerprint):
                raise TrialValidationError("website_review_command_conflict")
            result = {"commandId": command_id, "reviewId": review_id,
                      "status": "changes_requested", "createdAt": retained["created_at"].isoformat(),
                      "persisted": True, "replayed": replay, "publicationAuthorized": False}
        return result
