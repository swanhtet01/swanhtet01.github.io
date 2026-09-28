import type { ManagedIdentity } from '../../core/managed-trial'

export type PendingWebsiteFeedback = { reviewId: string; commandId: string; previewDigest: string; note: string }
type Review = { reviewId: string; previewDigest: string; expiresAt: string }
const key = (who: ManagedIdentity, reviewId: string) =>
  `supermega.website-feedback:${JSON.stringify([who.userId, who.workspaceId, reviewId])}`

export function recoverWebsiteFeedback(storage: Pick<Storage, 'getItem' | 'removeItem'>, who: ManagedIdentity, review: Review): PendingWebsiteFeedback | null {
  const name = key(who, review.reviewId), raw = storage.getItem(name)
  if (raw === null) return null
  if (raw.length > 16000) throw Error()
  const value = JSON.parse(raw), p = value?.payload
  if (!value || Array.isArray(value) || Object.keys(value).sort().join() !== 'expiresAt,payload'
    || value.expiresAt !== review.expiresAt || !Number.isFinite(Date.parse(value.expiresAt))
    || !p || Array.isArray(p) || Object.keys(p).sort().join() !== 'commandId,note,previewDigest,reviewId'
    || p.reviewId !== review.reviewId || p.previewDigest !== review.previewDigest
    || typeof p.commandId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(p.commandId)
    || typeof p.note !== 'string' || !p.note.trim() || p.note !== p.note.trim() || [...p.note].length > 2000
    || [...p.note].some(character => { const code = character.charCodeAt(0); return (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127 })) throw Error()
  if (Date.parse(value.expiresAt) <= Date.now()) {
    clearWebsiteFeedback(storage, who, p)
    return null
  }
  return p
}

export function retainWebsiteFeedback(storage: Storage, who: ManagedIdentity, review: Review, payload: PendingWebsiteFeedback) {
  const prior = recoverWebsiteFeedback(storage, who, review)
  if (prior && JSON.stringify(prior) !== JSON.stringify(payload)) throw Error()
  const raw = JSON.stringify({ expiresAt: review.expiresAt, payload })
  // Validate before mutating storage, including new requests.
  if (!recoverWebsiteFeedback({ getItem: () => raw, removeItem: () => { throw Error() } }, who, review)) throw Error()
  const name = key(who, review.reviewId)
  storage.setItem(name, raw)
  if (storage.getItem(name) !== raw) throw Error()
}

export function clearWebsiteFeedback(storage: Pick<Storage, 'getItem' | 'removeItem'>, who: ManagedIdentity, payload: PendingWebsiteFeedback) {
  const name = key(who, payload.reviewId), raw = storage.getItem(name)
  if (raw === null) return
  if (JSON.stringify(JSON.parse(raw)?.payload) !== JSON.stringify(payload)) throw Error()
  storage.removeItem(name)
  if (storage.getItem(name) !== null) throw Error()
}
