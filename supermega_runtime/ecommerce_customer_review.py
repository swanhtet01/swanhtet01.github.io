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
FIELDS = {'contract','reviewId','workspaceId','recipientActorId','preparedBy','preparedAt','expiresAt','contentRevision','preview','previewDigest','status'}

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

def prepare_catalog_review(state, *, principal, readiness, review_id, recipient_actor_id, expires_at, now=None):
    actor = access(principal, readiness, preparing=True)
    prepared = stamp(datetime.now(timezone.utc) if now is None else now); expiry = stamp(expires_at)
    if not prepared < expiry <= prepared + timedelta(days=7): fail()
    preview = commerce_storefront_preview(state)
    return dict(contract=CONTRACT, reviewId=uuid(review_id), workspaceId=actor.workspace_id,
        recipientActorId=uuid(recipient_actor_id), preparedBy=actor.actor_id, preparedAt=prepared.isoformat(),
        expiresAt=expiry.isoformat(), contentRevision=state['storefrontConfiguration']['revision'],
        preview=preview, previewDigest=commerce_storefront_preview_digest(state), status='active')

def catalog_review_projection(review, state, *, principal, readiness, now=None):
    actor = access(principal, readiness)
    if (not isinstance(review, Mapping) or set(review) != FIELDS or review['contract'] != CONTRACT
        or review['workspaceId'] != actor.workspace_id or review['recipientActorId'] != actor.actor_id
        or review['status'] != 'active'): fail()
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
