import type { EcommerceReviewDecision, ManagedIdentity } from '../../core/managed-trial'
import type { PreparedCatalogReview } from './prepared-catalog-review'

const key = (identity: ManagedIdentity, reviewId: string) =>
  `supermega.catalog-response:${JSON.stringify([identity.userId, identity.workspaceId, reviewId])}`

export function retainCatalogDecision(storage: Storage, identity: ManagedIdentity, review: PreparedCatalogReview, payload: EcommerceReviewDecision) {
  const value = JSON.stringify({ expiresAt: review.expiresAt, payload })
  storage.setItem(key(identity, review.reviewId), value)
  if (storage.getItem(key(identity, review.reviewId)) !== value) throw Error('Response recovery unavailable')
}

export function recoverCatalogDecision(storage: Storage, identity: ManagedIdentity, review: PreparedCatalogReview): EcommerceReviewDecision | null {
  const raw = storage.getItem(key(identity, review.reviewId))
  if (raw === null) return null
  const value = JSON.parse(raw)
  const p = value?.payload
  const fields = ['reviewId', 'commandId', 'previewDigest', p?.decision ? 'decision' : 'note']
  if (!value || Object.keys(value).sort().join() !== 'expiresAt,payload'
    || value.expiresAt !== review.expiresAt || Date.parse(value.expiresAt) <= Date.now()
    || !p || typeof p !== 'object' || Object.keys(p).length !== 4 || !fields.every(field => Object.hasOwn(p, field))
    || p.reviewId !== review.reviewId || p.previewDigest !== review.previewDigest
    || typeof p.commandId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(p.commandId)
    || (p.decision ? p.decision !== 'accept_preview_for_release_review'
      : typeof p.note !== 'string' || !p.note.trim() || p.note !== p.note.trim() || [...p.note].length > 2000)) {
    throw Error('Saved response could not be recovered')
  }
  return p
}

export function clearCatalogDecision(storage: Storage, identity: ManagedIdentity, reviewId: string) {
  storage.removeItem(key(identity, reviewId))
}
