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

export type CatalogPreparationCommand = {
  reviewId: string; recipientGrantId: string; expectedVersion: number; expiresAt: string
  contentRevision: number; previewDigest: string; readAt: string
}
export type CatalogPreparationReceipt = {
  reviewId: string; sourceVersion: number; contentRevision: number; preparedAt: string; expiresAt: string
  previewDigest: string; status: 'prepared_preview'; persisted: true; replayed: boolean
  publicationAuthorized: false; deploymentAuthorized: false
}
function instant(value: unknown): bigint {
  if (!time(value)) return invalid()
  const fraction = value.match(/\.(\d{1,6})/)?.[1] ?? ''
  return BigInt(Date.parse(value)) * 1000n + BigInt(fraction.padEnd(6, '0').slice(3))
}
export function verifyCatalogPreparationReceipt(value: unknown, command: CatalogPreparationCommand): CatalogPreparationReceipt {
  const row = exact(value, ['reviewId', 'sourceVersion', 'contentRevision', 'preparedAt', 'expiresAt', 'previewDigest', 'status', 'persisted', 'replayed', 'publicationAuthorized', 'deploymentAuthorized'])
  if (!uuid(command.reviewId) || !uuid(command.recipientGrantId) || !Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 1
    || !Number.isSafeInteger(command.contentRevision) || command.contentRevision < 0 || !/^sha256:[0-9a-f]{64}$/.test(command.previewDigest)
    || row.reviewId !== command.reviewId || row.sourceVersion !== command.expectedVersion || row.contentRevision !== command.contentRevision
    || row.previewDigest !== command.previewDigest || row.status !== 'prepared_preview' || row.persisted !== true
    || typeof row.replayed !== 'boolean' || row.publicationAuthorized !== false || row.deploymentAuthorized !== false) return invalid()
  const prepared = instant(row.preparedAt), expiry = instant(row.expiresAt)
  if (expiry !== instant(command.expiresAt) || prepared < instant(command.readAt) || prepared >= expiry
    || expiry - prepared > 604800000000n) return invalid()
  return structuredClone(row) as CatalogPreparationReceipt
}
export function verifyCatalogWithdrawal(value: unknown, reviewId: string) {
  const row = exact(value, ['reviewId', 'status', 'persisted', 'replayed', 'publicationAuthorized', 'deploymentAuthorized'])
  if (!uuid(reviewId) || row.reviewId !== reviewId || row.status !== 'revoked' || row.persisted !== true
    || typeof row.replayed !== 'boolean' || row.publicationAuthorized !== false || row.deploymentAuthorized !== false) return invalid()
  return { reviewId, status: 'revoked' as const, replayed: row.replayed }
}
