import { storefrontPreviewDigest, validateStorefrontPreview, type StorefrontPreview } from './storefront-model.ts'

export type CatalogPreparation = { sourceVersion: number; contentRevision: number; previewDigest: string; readAt: string; preview: StorefrontPreview }
export type CatalogRecipients = { recipients: { grantId: string; label: string }[]; nextAfter: string | null; order: 'grant_id_ascending'; accessGranted: false }
const invalid = (): never => { throw new Error('Unverified catalog response') }
const uuid = (value: unknown): value is string => typeof value === 'string' && value.length === 36 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
const time = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))
function exact(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join('|') !== keys.sort().join('|')) return invalid()
  return value as Record<string, unknown>
}
export async function verifyCatalogPreparation(value: unknown): Promise<CatalogPreparation> {
  const root = exact(structuredClone(value), ['status', 'sourceVersion', 'contentRevision', 'preview', 'previewDigest', 'readAt', 'reviewCreated', 'publicationAuthorized', 'deploymentAuthorized'])
  if (root.status !== 'saved_source_preview' || !Number.isSafeInteger(root.sourceVersion) || Number(root.sourceVersion) < 1
    || !Number.isSafeInteger(root.contentRevision) || Number(root.contentRevision) < 0 || !time(root.readAt)
    || root.reviewCreated !== false || root.publicationAuthorized !== false || root.deploymentAuthorized !== false) return invalid()
  const preview = validateStorefrontPreview(root.preview)
  if (await storefrontPreviewDigest(preview) !== root.previewDigest) return invalid()
  return { sourceVersion: Number(root.sourceVersion), contentRevision: Number(root.contentRevision),
    previewDigest: String(root.previewDigest), readAt: root.readAt, preview }
}
export function verifyCatalogRecipients(value: unknown, after?: string): CatalogRecipients {
  if (after !== undefined && !uuid(after)) return invalid()
  const root = exact(value, ['recipients', 'nextAfter', 'order', 'accessGranted'])
  if (root.accessGranted !== false || root.order !== 'grant_id_ascending' || !Array.isArray(root.recipients) || root.recipients.length > 50) return invalid()
  let previous = after ?? ''
  for (const raw of root.recipients) {
    const row = exact(raw, ['grantId', 'label'])
    if (!uuid(row.grantId) || row.grantId <= previous || typeof row.label !== 'string' || !row.label.trim()
      || Array.from(row.label).length > 120 || Array.from(row.label).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return invalid()
    previous = row.grantId
  }
  if (root.nextAfter !== null && (root.recipients.length !== 50 || root.nextAfter !== previous)) return invalid()
  return structuredClone(root) as CatalogRecipients
}
