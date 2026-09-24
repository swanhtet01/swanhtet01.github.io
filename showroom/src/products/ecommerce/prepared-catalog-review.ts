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
