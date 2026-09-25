import { storefrontPreviewDigest, validateStorefrontPreview, type StorefrontPreview } from './storefront-model.ts'

export type PreparedCatalogReview = {
  reviewId: string
  contentRevision: number
  previewDigest: string
  preview: StorefrontPreview
  expiresAt: string
  status: 'prepared_preview'
  publicationAuthorized: false
  deploymentAuthorized: false
}

// Content integrity only. The private transport must authorize the assigned
// recipient before returning this payload; a matching digest is not access proof.
export async function verifyPreparedCatalogReview(value: unknown, expectedReviewId: string, now = Date.now()): Promise<PreparedCatalogReview> {
  const invalid = () => { throw new Error('This catalog review could not be verified. Ask SuperMega for a fresh review.') }
  if (!Number.isFinite(now) || expectedReviewId.length !== 36
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(expectedReviewId)
    || !value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  const review = structuredClone(value) as Record<string, unknown>
  const keys = ['reviewId', 'contentRevision', 'previewDigest', 'preview', 'expiresAt', 'status', 'publicationAuthorized', 'deploymentAuthorized']
  if (Object.keys(review).length !== keys.length || !keys.every(key => Object.hasOwn(review, key))
    || review.reviewId !== expectedReviewId || !Number.isSafeInteger(review.contentRevision) || Number(review.contentRevision) < 0
    || review.status !== 'prepared_preview' || review.publicationAuthorized !== false || review.deploymentAuthorized !== false
    || typeof review.expiresAt !== 'string' || !Number.isFinite(Date.parse(review.expiresAt)) || Date.parse(review.expiresAt) <= now) return invalid()
  const preview = validateStorefrontPreview(review.preview)
  if (await storefrontPreviewDigest(preview) !== review.previewDigest) return invalid()
  return { ...review, preview } as PreparedCatalogReview
}

export type CatalogDecisionPage = {
  reviewId: string; sourceVersion: number; contentRevision: number; previewDigest: string
  decisions: { commandId: string; kind: 'acceptance' | 'feedback'; note: string | null; createdAt: string }[]
  nextAfter: string | null; publicationAuthorized: false; deploymentAuthorized: false
}

export function verifyCatalogDecisionPage(value: unknown, review: Pick<PreparedCatalogReview, 'reviewId' | 'contentRevision' | 'previewDigest' | 'expiresAt'>, after?: string): CatalogDecisionPage {
  const invalid = () => { throw new Error('Your saved response could not be verified. Try again.') }
  const uuid = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
  const exact = (object: unknown, keys: string[]): object is Record<string, unknown> =>
    !!object && typeof object === 'object' && !Array.isArray(object)
    && Object.keys(object).length === keys.length && keys.every(key => Object.hasOwn(object, key))
  if (!exact(value, ['reviewId', 'sourceVersion', 'contentRevision', 'previewDigest', 'decisions', 'nextAfter', 'publicationAuthorized', 'deploymentAuthorized'])
    || value.reviewId !== review.reviewId || value.contentRevision !== review.contentRevision
    || value.previewDigest !== review.previewDigest || !Number.isSafeInteger(value.sourceVersion) || Number(value.sourceVersion) < 1
    || value.publicationAuthorized !== false || value.deploymentAuthorized !== false
    || !Array.isArray(value.decisions) || value.decisions.length > 50 || (after !== undefined && !uuid(after))) return invalid()
  let previous = after ?? ''
  let accepted = false
  for (const item of value.decisions) {
    if (!exact(item, ['commandId', 'kind', 'note', 'createdAt']) || !uuid(item.commandId) || item.commandId <= previous
      || typeof item.createdAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt))
      || Date.parse(item.createdAt) >= Date.parse(review.expiresAt)) return invalid()
    previous = item.commandId
    if (item.kind === 'acceptance') {
      if (item.note !== null || value.decisions.length !== 1 || after !== undefined) return invalid()
      accepted = true
    } else if (item.kind !== 'feedback' || typeof item.note !== 'string' || !item.note.trim()
      || item.note !== item.note.trim() || [...item.note].length > 2000
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(item.note)) return invalid()
  }
  if (value.nextAfter !== null && (accepted || value.decisions.length !== 50 || value.nextAfter !== previous)) return invalid()
  return structuredClone(value) as CatalogDecisionPage
}
