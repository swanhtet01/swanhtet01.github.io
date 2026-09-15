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
  const root = object(value, ['reviewId', 'contentRevision', 'previewDigest', 'preview', 'expiresAt', 'status', 'publicationAuthorized'])
  if (root.reviewId !== reviewId || root.status !== 'prepared_preview' || root.publicationAuthorized !== false
    || !Number.isSafeInteger(root.contentRevision) || Number(root.contentRevision) < 0
    || typeof root.expiresAt !== 'string' || !Number.isFinite(Date.parse(root.expiresAt)) || Date.parse(root.expiresAt) <= now) invalid()
  const preview = object(root.preview, ['siteName', 'pages'])
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
  if (digest !== root.previewDigest) invalid()
  return structuredClone(root) as CustomerWebsiteReview
}

export function verifyCustomerChangeAcknowledgement(value: unknown, request: { reviewId: string; commandId: string }) {
  const result = object(value, ['commandId', 'reviewId', 'status', 'createdAt', 'persisted', 'replayed', 'publicationAuthorized'])
  if (result.commandId !== request.commandId || result.reviewId !== request.reviewId
    || result.status !== 'changes_requested' || result.persisted !== true || typeof result.replayed !== 'boolean'
    || result.publicationAuthorized !== false || typeof result.createdAt !== 'string'
    || !Number.isFinite(Date.parse(result.createdAt))) invalid()
  return { commandId: request.commandId, reviewId: request.reviewId, createdAt: String(result.createdAt), replayed: result.replayed === true }
}
