"""Private catalog review domain only; no endpoint, grant or persistence.

Callers must supply server-derived state, assignment and readiness in one guarded
transaction. Recipient membership must be checked before preparing an assignment.
"""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from uuid import UUID
from collections.abc import Mapping
from .commerce_runtime import commerce_storefront_preview, commerce_storefront_preview_digest
from .trial_store import TrialValidationError, _principal_auth_ready

CONTRACT = 'supermega.ecommerce.customer-review.v1'
FIELDS = {'contract','reviewId','workspaceId','recipientActorId','preparedBy','preparedAt','expiresAt','contentRevision','sourceVersion','preview','previewDigest','status'}

def fail():
    raise TrialValidationError('ecommerce_review_unavailable')

def uuid(value):
    try:
        if not isinstance(value, str) or str(UUID(value)) != value: fail()
    except (ValueError, TypeError, AttributeError): fail()
    return value

def stamp(value):
    try:
        result = datetime.fromisoformat(value.replace('Z', '+00:00')) if isinstance(value, str) else value
        if not isinstance(result, datetime) or result.tzinfo is None or result.utcoffset() != timedelta(0): fail()
        return result
    except (ValueError, TypeError, AttributeError): fail()

def access(principal, readiness, *, preparing=False):
    actor = principal.normalized()
    capability = 'commerce.write' if preparing else 'ecommerce.review'
    if (not _principal_auth_ready(actor) or actor.actor_kind != 'human'
        or not (readiness.write_ready if preparing else readiness.read_ready)
        or capability not in readiness.capabilities or 'ecommerce' not in (readiness.product_entitlements or ())): fail()
    return actor

def prepare_catalog_review(state, *, principal, readiness, review_id, recipient_actor_id, expires_at, source_version, now=None):
    actor = access(principal, readiness, preparing=True)
    if type(source_version) is not int or not 1 <= source_version <= 9_007_199_254_740_991: fail()
    prepared = stamp(datetime.now(timezone.utc) if now is None else now); expiry = stamp(expires_at)
    if not prepared < expiry <= prepared + timedelta(days=7): fail()
    preview = commerce_storefront_preview(state)
    return dict(contract=CONTRACT, reviewId=uuid(review_id), workspaceId=actor.workspace_id,
        recipientActorId=uuid(recipient_actor_id), preparedBy=actor.actor_id, preparedAt=prepared.isoformat(),
        expiresAt=expiry.isoformat(), contentRevision=state['storefrontConfiguration']['revision'],
        preview=preview, previewDigest=commerce_storefront_preview_digest(state), sourceVersion=source_version, status='active')

def catalog_review_projection(review, state, *, principal, readiness, source_version, now=None):
    actor = access(principal, readiness)
    if type(source_version) is not int or not 1 <= source_version <= 9_007_199_254_740_991: fail()
    if (not isinstance(review, Mapping) or set(review) != FIELDS or review['contract'] != CONTRACT
        or review['workspaceId'] != actor.workspace_id or review['recipientActorId'] != actor.actor_id
        or review['status'] != 'active' or type(review['sourceVersion']) is not int
        or review['sourceVersion'] != source_version): fail()
    uuid(review['reviewId']); uuid(review['recipientActorId'])
    if (not isinstance(review['preparedAt'], str) or not isinstance(review['expiresAt'], str)
        or not isinstance(review['preparedBy'], str) or not review['preparedBy']
        or review['preparedBy'] != review['preparedBy'].strip()): fail()
    prepared, expiry, current = stamp(review['preparedAt']), stamp(review['expiresAt']), stamp(datetime.now(timezone.utc) if now is None else now)
    if not prepared <= current < expiry or expiry > prepared + timedelta(days=7): fail()
    preview = commerce_storefront_preview(state)
    if (type(review['contentRevision']) is not int or review['contentRevision'] != state['storefrontConfiguration']['revision']
        or review['preview'] != preview or review['previewDigest'] != commerce_storefront_preview_digest(state)): fail()
    return {key: deepcopy(review[key]) for key in ('reviewId','contentRevision','previewDigest','preview','expiresAt')} | dict(status='prepared_preview', publicationAuthorized=False, deploymentAuthorized=False)


def build_catalog_acceptance(review, state, payload, *, principal, readiness, source_version, now=None):
    """Build a candidate only; the guarded store must persist and enforce replay.

    Caller must lock the source and assignment and reject retained change requests.
    Customer consent to a revision never authorizes publication or deployment.
    """
    from hashlib import sha256
    import json
    current = stamp(datetime.now(timezone.utc) if now is None else now)
    projected = catalog_review_projection(review, state, principal=principal,
        readiness=readiness, source_version=source_version, now=current)
    if not readiness.write_ready: fail()
    if (not isinstance(payload, Mapping)
        or set(payload) != {'commandId', 'reviewId', 'previewDigest', 'decision'}
        or payload['reviewId'] != projected['reviewId']
        or payload['previewDigest'] != projected['previewDigest']
        or payload['decision'] != 'accept_preview_for_release_review'): fail()
    actor = principal.normalized()
    identity = dict(contract='supermega.ecommerce.customer-acceptance.v1',
        workspaceId=actor.workspace_id, actorId=actor.actor_id,
        commandId=uuid(payload['commandId']), reviewId=projected['reviewId'],
        previewDigest=projected['previewDigest'], contentRevision=projected['contentRevision'],
        sourceVersion=source_version, decision=payload['decision'])
    fingerprint = 'sha256:' + sha256(json.dumps(identity, sort_keys=True,
        separators=(',', ':'), ensure_ascii=True).encode()).hexdigest()
    return identity | dict(commandFingerprint=fingerprint, acceptedAt=current.isoformat(),
        status='accepted_for_operator_release_review', persisted=False,
        publicationAuthorized=False, deploymentAuthorized=False)
