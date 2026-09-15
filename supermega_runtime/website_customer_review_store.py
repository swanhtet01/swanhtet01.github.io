"""Guarded PostgreSQL adapter for prepared Website reviews, not an HTTP API.

The optional storage migration must be installed through the reviewed release
path. Customers never read workspace_state. SQL owns snapshot validation and
invalidation; this adapter requires READ COMMITTED and serializes reads/writes
against that same invalidation lock. No membership or publishing is granted.
"""

from contextlib import contextmanager
from copy import deepcopy
from typing import Any, Mapping

from .trial_store import PostgresTrialStore, TrialPrincipal, TrialPermissionDenied, TrialValidationError, TrialNotReadyError
from .website_customer_review import _digest, _text, _uuid


class WebsiteCustomerReviewStore:
    def __init__(self, store: PostgresTrialStore):
        self.store = store

    @contextmanager
    def _transaction(self, principal: TrialPrincipal, *, write: bool, capability: str):
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
            cursor.execute("select pg_advisory_xact_lock(hashtextextended('website-review:' || %s,0))", (actor.workspace_id,))
            # A lock wait may outlive session or entitlement revocation.
            self.store._assert_active_identity_session(cursor, actor)
            if "website" not in (self.store._product_entitlements(cursor, actor.workspace_id) or ()):
                raise TrialPermissionDenied(capability)
            yield cursor, actor
        # Returning to the caller happens only after the outer transaction commits.

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
