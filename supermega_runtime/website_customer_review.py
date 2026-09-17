"""Prepared Website review domain contract; not an endpoint or persistence layer.

Callers must obtain principal/readiness, assignment and current Website state from
the server in one guarded transaction. The upcoming store must enforce recipient
isolation in SQL, revoke assignments, and atomically persist/replay requests. No
function here grants a capability, sends feedback, approves content or publishes.
"""

from copy import deepcopy
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
from typing import Any, Mapping
from uuid import UUID

from .trial_store import TrialPrincipal, TrialReadiness, TrialValidationError, _principal_auth_ready
from .website_runtime import validate_website_state, _website_artifact

REVIEW_CONTRACT = "supermega.website.customer-review.v1"
FEEDBACK_CONTRACT = "supermega.website.customer-change-request.v1"
ACCEPTANCE_CONTRACT = "supermega.website.customer-acceptance.v1"
REVIEW_CAPABILITY = "website.review"
_FIELDS = frozenset({"contract", "reviewId", "workspaceId", "recipientActorId", "preparedBy",
                     "preparedAt", "expiresAt", "contentRevision", "preview", "previewDigest", "status"})
_FEEDBACK_FIELDS = frozenset({"commandId", "reviewId", "previewDigest", "note"})
_ACCEPTANCE_FIELDS = frozenset({"commandId", "reviewId", "previewDigest", "decision"})
_ACCEPTANCE_DECISION = "accept_preview_for_release_review"


def _fail(code: str) -> None:
    # Never put customer text, identifiers or preview content in exceptions.
    raise TrialValidationError(f"website_customer_review_{code}")


def _uuid(value: Any) -> str:
    try:
        if not isinstance(value, str) or str(UUID(value)) != value:
            _fail("identity_invalid")
    except (ValueError, TypeError, AttributeError):
        _fail("identity_invalid")
    return value


def _text(value: Any, limit: int) -> str:
    if (not isinstance(value, str) or not value.strip() or value != value.strip()
            or len(value) > limit or any(ord(c) < 32 and c not in "\n\t" for c in value)
            or any(0xD800 <= ord(c) <= 0xDFFF for c in value)):
        _fail("text_invalid")
    return value


def _time(value: str) -> datetime:
    try:
        stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if stamp.tzinfo is None or stamp.utcoffset() != timedelta(0):
            _fail("time_invalid")
        return stamp
    except (ValueError, TypeError, AttributeError):
        _fail("time_invalid")


def _now(value: datetime | None) -> datetime:
    stamp = value if value is not None else datetime.now(timezone.utc)
    if stamp.tzinfo is None or stamp.utcoffset() != timedelta(0):
        _fail("time_invalid")
    return stamp


def _digest(value: Any) -> str:
    return "sha256:" + sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                        separators=(",", ":"), allow_nan=False).encode("utf-8")).hexdigest()


def _access(principal: TrialPrincipal, readiness: TrialReadiness, capability: str, *, write: bool) -> TrialPrincipal:
    actor = principal.normalized()
    if (not _principal_auth_ready(actor) or actor.actor_kind != "human"
            or not (readiness.write_ready if write else readiness.read_ready)
            or capability not in readiness.capabilities
            or "website" not in (readiness.product_entitlements or ())):
        _fail("access_denied")
    return actor


def _preview(state: Mapping[str, Any]) -> tuple[int, dict[str, Any]]:
    validated = validate_website_state(state)
    artifact = _website_artifact(validated)
    if not artifact["pages"]:
        _fail("no_prepared_pages")
    # Explicit public projection, never bootstrap, lead ledger or internal proofs.
    return validated["contentRevision"], {"siteName": artifact["siteName"], "pages": artifact["pages"]}


def prepare_customer_review(state: Mapping[str, Any], *, principal: TrialPrincipal,
                            readiness: TrialReadiness, review_id: str, recipient_actor_id: str,
                            expires_at: str, now: datetime | None = None) -> dict[str, Any]:
    """Build an assignment for a store-verified active human recipient; persist separately.

    The store must resolve recipient membership before calling and must not accept
    a client-supplied snapshot. This does not assign or activate that membership.
    """
    actor = _access(principal, readiness, "website.write", write=True)
    stamp = _now(now)
    expiry = _time(expires_at)
    if not stamp < expiry <= stamp + timedelta(days=7):
        _fail("expiry_invalid")
    revision, preview = _preview(state)
    return {"contract": REVIEW_CONTRACT, "reviewId": _uuid(review_id),
            "workspaceId": actor.workspace_id, "recipientActorId": _uuid(recipient_actor_id),
            "preparedBy": actor.actor_id, "preparedAt": stamp.isoformat(), "expiresAt": expires_at,
            "contentRevision": revision, "preview": preview, "previewDigest": _digest(preview), "status": "active"}


def _authorized_review(review: Mapping[str, Any], state: Mapping[str, Any], *,
                       principal: TrialPrincipal, readiness: TrialReadiness,
                       now: datetime | None, write: bool) -> tuple[TrialPrincipal, datetime]:
    actor = _access(principal, readiness, REVIEW_CAPABILITY, write=write)
    if (not isinstance(review, Mapping) or set(review) != _FIELDS
            or review.get("contract") != REVIEW_CONTRACT
            or review.get("workspaceId") != actor.workspace_id
            or review.get("recipientActorId") != actor.actor_id
            or review.get("status") != "active"):
        _fail("access_denied")
    _uuid(review["reviewId"])
    _uuid(review["recipientActorId"])
    _text(review["preparedBy"], 160)
    stamp = _now(now)
    prepared, expiry = _time(review["preparedAt"]), _time(review["expiresAt"])
    if not prepared <= stamp < expiry or expiry > prepared + timedelta(days=7):
        _fail("expired_or_future")
    revision, preview = _preview(state)
    if (type(review["contentRevision"]) is not int or review["contentRevision"] != revision
            or review["preview"] != preview or review["previewDigest"] != _digest(preview)):
        _fail("stale_revision")
    return actor, stamp


def customer_review_projection(review: Mapping[str, Any], state: Mapping[str, Any], *,
                               principal: TrialPrincipal, readiness: TrialReadiness,
                               now: datetime | None = None) -> dict[str, Any]:
    _authorized_review(review, state, principal=principal, readiness=readiness, now=now, write=False)
    return {key: deepcopy(review[key]) for key in
            ("reviewId", "contentRevision", "previewDigest", "preview", "expiresAt")} | {
        "status": "prepared_preview", "publicationAuthorized": False}


def build_customer_change_request(review: Mapping[str, Any], state: Mapping[str, Any],
                                  payload: Mapping[str, Any], *, principal: TrialPrincipal,
                                  readiness: TrialReadiness, now: datetime | None = None) -> dict[str, Any]:
    """Build a transaction candidate, not an acknowledgement of durable delivery.

    The store must check current access before replay, reject conflicting command
    fingerprints and insert/read back once atomically. New requests require the
    current revision; a previously committed exact retry is handled by the store.
    """
    actor, stamp = _authorized_review(review, state, principal=principal, readiness=readiness, now=now, write=True)
    if not isinstance(payload, Mapping) or set(payload) != _FEEDBACK_FIELDS:
        _fail("payload_invalid")
    command_id = _uuid(payload["commandId"])
    if (payload["reviewId"] != review["reviewId"]
            or payload["previewDigest"] != review["previewDigest"]):
        _fail("stale_revision")
    note = _text(payload["note"], 2000)
    identity = {"contract": FEEDBACK_CONTRACT, "workspaceId": actor.workspace_id,
                "actorId": actor.actor_id, "reviewId": review["reviewId"], "commandId": command_id,
                "contentRevision": review["contentRevision"], "previewDigest": review["previewDigest"], "note": note}
    return identity | {"commandFingerprint": _digest(identity), "createdAt": stamp.isoformat(),
                       "persisted": False, "publicationAuthorized": False}


def build_customer_acceptance(review: Mapping[str, Any], state: Mapping[str, Any],
                              payload: Mapping[str, Any], *, principal: TrialPrincipal,
                              readiness: TrialReadiness, now: datetime | None = None) -> dict[str, Any]:
    """Build an exact-preview acceptance candidate for guarded persistence.

    Acceptance means the customer is satisfied with this prepared revision and
    SuperMega may begin operator release review. It never publishes, deploys,
    connects a domain or grants provider authority. The store must reject an
    acceptance when retained change requests exist for the same review.
    """
    actor, stamp = _authorized_review(
        review, state, principal=principal, readiness=readiness, now=now, write=True,
    )
    if not isinstance(payload, Mapping) or set(payload) != _ACCEPTANCE_FIELDS:
        _fail("acceptance_payload_invalid")
    command_id = _uuid(payload["commandId"])
    if (payload["reviewId"] != review["reviewId"]
            or payload["previewDigest"] != review["previewDigest"]):
        _fail("stale_revision")
    if payload["decision"] != _ACCEPTANCE_DECISION:
        _fail("acceptance_decision_invalid")
    identity = {"contract": ACCEPTANCE_CONTRACT, "workspaceId": actor.workspace_id,
                "actorId": actor.actor_id, "reviewId": review["reviewId"],
                "commandId": command_id, "contentRevision": review["contentRevision"],
                "previewDigest": review["previewDigest"], "decision": _ACCEPTANCE_DECISION}
    return identity | {"commandFingerprint": _digest(identity), "acceptedAt": stamp.isoformat(),
                       "status": "accepted_for_operator_release_review", "persisted": False,
                       "publicationAuthorized": False, "deploymentAuthorized": False}
