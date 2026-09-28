import type { WebsitePage } from './website-model'

export type CustomerReviewPage = Pick<WebsitePage, 'id' | 'slug' | 'navigation' | 'hero' | 'sections' | 'seo'>
export type CustomerWebsiteReview = {
  reviewId: string
  contentRevision: number
  previewDigest: string
  preview: { siteName: string; pages: CustomerReviewPage[] }
  expiresAt: string
  status: 'prepared_preview'
  publicationAuthorized: false
}

const invalid = () => { throw new Error('The prepared review could not be verified. Ask SuperMega for a fresh review.') }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  const result = value as Record<string, unknown>
  if (Object.keys(result).sort().join('|') !== keys.sort().join('|')) return invalid()
  return result
}
function text(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length > 10000 || Array.from(value).some(char => {
    const code = char.charCodeAt(0)
    return code < 32 && code !== 9 && code !== 10 && code !== 13
  })) invalid()
}
function strings(value: unknown, keys: string[]) {
  const result = object(value, keys)
  Object.values(result).forEach(text)
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>
    return `{${Object.keys(item).sort().map(key => `${JSON.stringify(key)}:${canonical(item[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export async function verifyCustomerWebsiteReview(value: unknown, reviewId: string, now = Date.now()): Promise<CustomerWebsiteReview> {
  const root = object(structuredClone(value), ['reviewId', 'contentRevision', 'previewDigest', 'preview', 'expiresAt', 'status', 'publicationAuthorized'])
  if (root.reviewId !== reviewId || root.status !== 'prepared_preview' || root.publicationAuthorized !== false
    || !Number.isSafeInteger(root.contentRevision) || Number(root.contentRevision) < 0
    || typeof root.expiresAt !== 'string' || !Number.isFinite(Date.parse(root.expiresAt)) || Date.parse(root.expiresAt) <= now) invalid()
  await verifyWebsitePreviewContent(root.preview, root.previewDigest)
  return root as CustomerWebsiteReview
}

export function reviewContactDestination(value: string): string {
  if (!value.trim()) return 'Not prepared yet'
  if (value !== value.trim() || Array.from(value).some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127) || value.includes('\\')) return 'Needs correction by SuperMega'
  if (/^\/(?!\/)|^#/.test(value)) return value
  try {
    const url = new URL(value)
    if (!['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol) || url.username || url.password) return 'Needs correction by SuperMega'
    return value
  } catch { return 'Needs correction by SuperMega' }
}

export async function verifyWebsitePreviewContent(value: unknown, expectedDigest: unknown): Promise<CustomerWebsiteReview['preview']> {
  const preview = object(structuredClone(value), ['siteName', 'pages'])
  text(preview.siteName)
  if (!Array.isArray(preview.pages) || preview.pages.length < 1 || preview.pages.length > 4) return invalid()
  const ids = new Set<string>()
  for (const value of preview.pages) {
    const page = object(value, ['id', 'slug', 'navigation', 'hero', 'sections', 'seo'])
    text(page.id); text(page.slug)
    if (!page.id || ids.has(page.id)) invalid()
    ids.add(page.id)
    const navigation = object(page.navigation, ['label', 'visible'])
    text(navigation.label)
    if (typeof navigation.visible !== 'boolean') invalid()
    strings(page.hero, ['eyebrow', 'headline', 'summary', 'ctaLabel', 'ctaHref'])
    strings(page.seo, ['title', 'description'])
    if (!Array.isArray(page.sections) || page.sections.length > 4) return invalid()
    for (const section of page.sections) strings(section, ['id', 'eyebrow', 'title', 'body'])
  }
  const encoded = new TextEncoder().encode(canonical(preview))
  if (encoded.length > 250000) invalid()
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoded))
  const digest = `sha256:${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`
  if (digest !== expectedDigest) invalid()
  return preview as CustomerWebsiteReview['preview']
}

export function verifyCustomerChangeAcknowledgement(value: unknown, request: { reviewId: string; commandId: string }) {
  const result = object(value, ['commandId', 'reviewId', 'status', 'createdAt', 'persisted', 'replayed', 'publicationAuthorized'])
  if (result.commandId !== request.commandId || result.reviewId !== request.reviewId
    || result.status !== 'changes_requested' || result.persisted !== true || typeof result.replayed !== 'boolean'
    || result.publicationAuthorized !== false || typeof result.createdAt !== 'string'
    || !Number.isFinite(Date.parse(result.createdAt))) invalid()
  return { commandId: request.commandId, reviewId: request.reviewId, createdAt: String(result.createdAt), replayed: result.replayed === true }
}

export type CustomerReviewDecision = {
  reviewId: string; contentRevision: number; previewDigest: string; expiresAt: string
  status: 'pending_review' | 'changes_requested' | 'accepted_for_operator_release_review'
  acceptedAt: string | null; publicationAuthorized: false; deploymentAuthorized: false
}

function validAcceptedAt(value: unknown, expiresAt: string, now: number): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
    && Date.parse(value) <= now && Date.parse(value) < Date.parse(expiresAt)
}

export function verifyCustomerReviewDecision(value: unknown, review: CustomerWebsiteReview, now = Date.now()): CustomerReviewDecision {
  const result = object(value, ['reviewId', 'contentRevision', 'previewDigest', 'expiresAt', 'status',
    'acceptedAt', 'publicationAuthorized', 'deploymentAuthorized'])
  if (result.reviewId !== review.reviewId || result.contentRevision !== review.contentRevision
    || result.previewDigest !== review.previewDigest || result.expiresAt !== review.expiresAt
    || !(Date.parse(review.expiresAt) > now) || result.publicationAuthorized !== false || result.deploymentAuthorized !== false
    || !['pending_review', 'changes_requested', 'accepted_for_operator_release_review'].includes(String(result.status))) return invalid()
  if (result.status === 'accepted_for_operator_release_review'
    ? !validAcceptedAt(result.acceptedAt, review.expiresAt, now) : result.acceptedAt !== null) return invalid()
  return structuredClone(result) as CustomerReviewDecision
}

export function verifyCustomerAcceptanceAcknowledgement(value: unknown, request: { reviewId: string; commandId: string; previewDigest: string }, review: CustomerWebsiteReview, now = Date.now()) {
  const result = object(value, ['commandId', 'reviewId', 'contentRevision', 'previewDigest', 'acceptedAt',
    'status', 'persisted', 'replayed', 'publicationAuthorized', 'deploymentAuthorized'])
  if (result.commandId !== request.commandId || result.reviewId !== request.reviewId || request.reviewId !== review.reviewId
    || result.previewDigest !== request.previewDigest || request.previewDigest !== review.previewDigest
    || result.contentRevision !== review.contentRevision || result.status !== 'accepted_for_operator_release_review'
    || result.persisted !== true || typeof result.replayed !== 'boolean'
    || result.publicationAuthorized !== false || result.deploymentAuthorized !== false
    || !(Date.parse(review.expiresAt) > now) || !validAcceptedAt(result.acceptedAt, review.expiresAt, now)) return invalid()
  return verifyCustomerReviewDecision({ reviewId: review.reviewId, contentRevision: review.contentRevision,
    previewDigest: review.previewDigest, expiresAt: review.expiresAt, status: result.status,
    acceptedAt: result.acceptedAt, publicationAuthorized: false, deploymentAuthorized: false }, review, now)
}
