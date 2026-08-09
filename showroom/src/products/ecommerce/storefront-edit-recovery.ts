import type { CommerceStorefrontMerchandising } from '../../core/commerce-workspace.ts'

export const STOREFRONT_EDIT_RECOVERY_CONTRACT = 'supermega.ecommerce.closed-storefront-edit.v1' as const
const STOREFRONT_EDIT_RECOVERY_KEY = STOREFRONT_EDIT_RECOVERY_CONTRACT

export type StorefrontEditView = 'setup' | 'preview'
export type StorefrontEditDevice = 'phone' | 'desktop'

export type StorefrontEditDraft = Readonly<{
  storeName: string
  summary: string
  selectedSkus: readonly string[]
  merchandising: readonly CommerceStorefrontMerchandising[] | null
}>

export type StorefrontSavedSnapshot = Readonly<{
  revision: number
  savedAt: string
  storeName: string
  summary: string
  selectedSkus: readonly string[]
  merchandising?: readonly CommerceStorefrontMerchandising[]
  localPreviewDigest?: string
  shopCatalogDigest?: string
  actionId?: string
}>

export type StorefrontEditRecoverySource = Readonly<{
  savedRevision: number
  savedAt: string | null
  savedFingerprint: string
  catalogDigest: string
}>

export type StorefrontEditRecovery = Readonly<{
  schema: typeof STOREFRONT_EDIT_RECOVERY_CONTRACT
  scope: string
  capturedAt: string
  view: StorefrontEditView
  device: StorefrontEditDevice
  source: StorefrontEditRecoverySource
  draft: StorefrontEditDraft
}>

export type StorefrontEditRecoveryReview =
  | Readonly<{ ok: true; draft: StorefrontEditDraft; view: StorefrontEditView; device: StorefrontEditDevice }>
  | Readonly<{
      ok: false
      reason: 'invalid_recovery' | 'scope_changed' | 'saved_storefront_changed' | 'catalog_changed' | 'no_changes'
    }>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: string[], optional: string[] = []) {
  const actual = Object.keys(value)
  return keys.every((key) => actual.includes(key))
    && actual.every((key) => keys.includes(key) || optional.includes(key))
}

function exactText(value: unknown, maximum: number, blankable = false) {
  if (typeof value !== 'string'
    || value.length > maximum
    || value.includes('\u0000')
    || (!blankable && (!value || value !== value.trim()))) return null
  return value
}

function canonicalTimestamp(value: unknown, blankable = false) {
  if (blankable && value === null) return null
  if (typeof value !== 'string'
    || !/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value ? value : null
}

function canonicalDigest(value: unknown) {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value) ? value : null
}

function canonicalScope(value: unknown) {
  return exactText(value, 256)
}

function canonicalMerchandising(value: unknown, selectedSkus: readonly string[]) {
  if (value === null) return null
  if (!Array.isArray(value) || value.length !== selectedSkus.length) return undefined
  const selected = new Set(selectedSkus)
  const rows: CommerceStorefrontMerchandising[] = []
  for (const candidate of value) {
    if (!isRecord(candidate)
      || !hasExactKeys(candidate, ['sku', 'featured', 'collection', 'displayName', 'note'])
      || typeof candidate.featured !== 'boolean') return undefined
    const sku = exactText(candidate.sku, 80)
    const collection = exactText(candidate.collection, 120)
    const displayName = exactText(candidate.displayName, 180, true)
    const note = exactText(candidate.note, 300, true)
    if (!sku || !selected.has(sku) || collection === null || displayName === null || note === null) return undefined
    rows.push({ sku, featured: candidate.featured, collection, displayName, note })
  }
  if (new Set(rows.map((row) => row.sku)).size !== selectedSkus.length) return undefined
  return rows
}

function canonicalDraft(value: unknown): StorefrontEditDraft | null {
  if (!isRecord(value)
    || !hasExactKeys(value, ['storeName', 'summary', 'selectedSkus', 'merchandising'])) return null
  const storeName = exactText(value.storeName, 60, true)
  const summary = exactText(value.summary, 180, true)
  if (storeName === null
    || summary === null
    || !Array.isArray(value.selectedSkus)
    || value.selectedSkus.length > 8) return null
  const selectedSkus = value.selectedSkus.map((sku) => exactText(sku, 80))
  if (selectedSkus.some((sku) => !sku)
    || new Set(selectedSkus).size !== selectedSkus.length) return null
  const merchandising = canonicalMerchandising(value.merchandising, selectedSkus as string[])
  if (merchandising === undefined) return null
  return {
    storeName,
    summary,
    selectedSkus: selectedSkus as string[],
    merchandising,
  }
}

function canonicalSavedSnapshot(value: StorefrontSavedSnapshot | null) {
  if (value === null) return null
  if (!isRecord(value)
    || !Number.isSafeInteger(value.revision)
    || Number(value.revision) < 1
    || canonicalTimestamp(value.savedAt) === null) throw new Error('Saved storefront recovery identity is invalid.')
  const draft = canonicalDraft({
    storeName: value.storeName,
    summary: value.summary,
    selectedSkus: value.selectedSkus,
    merchandising: value.merchandising ?? null,
  })
  if (!draft || draft.selectedSkus.length < 1) throw new Error('Saved storefront recovery identity is invalid.')
  const localPreviewDigest = value.localPreviewDigest === undefined ? null : canonicalDigest(value.localPreviewDigest)
  const shopCatalogDigest = value.shopCatalogDigest === undefined ? null : canonicalDigest(value.shopCatalogDigest)
  const actionId = value.actionId === undefined ? null : exactText(value.actionId, 256)
  if ((value.localPreviewDigest !== undefined && !localPreviewDigest)
    || (value.shopCatalogDigest !== undefined && !shopCatalogDigest)
    || (value.actionId !== undefined && !actionId)) throw new Error('Saved storefront recovery identity is invalid.')
  return {
    revision: Number(value.revision),
    savedAt: value.savedAt,
    ...draft,
    localPreviewDigest,
    shopCatalogDigest,
    actionId,
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function fingerprint(value: unknown) {
  const source = canonicalJson(value)
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function canonicalSource(value: unknown): StorefrontEditRecoverySource | null {
  if (!isRecord(value)
    || !hasExactKeys(value, ['savedRevision', 'savedAt', 'savedFingerprint', 'catalogDigest'])
    || !Number.isSafeInteger(value.savedRevision)
    || Number(value.savedRevision) < 0
    || (value.savedAt !== null && canonicalTimestamp(value.savedAt) === null)
    || typeof value.savedFingerprint !== 'string'
    || !/^storefront-saved-[0-9a-f]{8}$/.test(value.savedFingerprint)) return null
  const catalogDigest = canonicalDigest(value.catalogDigest)
  if (!catalogDigest) return null
  return {
    savedRevision: Number(value.savedRevision),
    savedAt: value.savedAt as string | null,
    savedFingerprint: value.savedFingerprint,
    catalogDigest,
  }
}

export function storefrontSavedStateFingerprint(saved: StorefrontSavedSnapshot | null) {
  return `storefront-saved-${fingerprint(canonicalSavedSnapshot(saved))}`
}

export function storefrontEditDraftsMatch(left: StorefrontEditDraft, right: StorefrontEditDraft) {
  const canonicalLeft = canonicalDraft(left)
  const canonicalRight = canonicalDraft(right)
  return Boolean(canonicalLeft && canonicalRight && canonicalJson(canonicalLeft) === canonicalJson(canonicalRight))
}

export function storefrontEditRecoveryStorageKey(scope: string) {
  const retainedScope = canonicalScope(scope)
  if (!retainedScope) throw new Error('Storefront edit recovery requires an exact workspace scope.')
  return `${STOREFRONT_EDIT_RECOVERY_KEY}.${encodeURIComponent(retainedScope)}`
}

export function createStorefrontEditRecovery(
  scope: string,
  source: StorefrontEditRecoverySource,
  draft: StorefrontEditDraft,
  view: StorefrontEditView,
  device: StorefrontEditDevice,
  capturedAt: Date | string = new Date(),
): StorefrontEditRecovery {
  const retainedScope = canonicalScope(scope)
  const retainedSource = canonicalSource(source)
  const retainedDraft = canonicalDraft(draft)
  const capturedAtValue = capturedAt instanceof Date ? capturedAt.toISOString() : capturedAt
  if (!retainedScope
    || !retainedSource
    || !retainedDraft
    || canonicalTimestamp(capturedAtValue) === null
    || (view !== 'setup' && view !== 'preview')
    || (device !== 'phone' && device !== 'desktop')) {
    throw new Error('Storefront edit recovery could not be created from this draft.')
  }
  return {
    schema: STOREFRONT_EDIT_RECOVERY_CONTRACT,
    scope: retainedScope,
    capturedAt: capturedAtValue,
    view,
    device,
    source: retainedSource,
    draft: retainedDraft,
  }
}

export function restoreStorefrontEditRecovery(value: unknown): StorefrontEditRecovery | null {
  try {
    const candidate = typeof value === 'string' ? JSON.parse(value) as unknown : value
    if (!isRecord(candidate)
      || !hasExactKeys(candidate, ['schema', 'scope', 'capturedAt', 'view', 'device', 'source', 'draft'])
      || candidate.schema !== STOREFRONT_EDIT_RECOVERY_CONTRACT) return null
    return createStorefrontEditRecovery(
      candidate.scope as string,
      candidate.source as StorefrontEditRecoverySource,
      candidate.draft as StorefrontEditDraft,
      candidate.view as StorefrontEditView,
      candidate.device as StorefrontEditDevice,
      candidate.capturedAt as string,
    )
  } catch {
    return null
  }
}

export function storefrontEditRecoveryMatchesDraft(
  recovery: StorefrontEditRecovery,
  scope: string,
  source: StorefrontEditRecoverySource,
  draft: StorefrontEditDraft,
) {
  const restored = restoreStorefrontEditRecovery(recovery)
  const retainedSource = canonicalSource(source)
  const retainedDraft = canonicalDraft(draft)
  return Boolean(restored
    && retainedSource
    && retainedDraft
    && restored.scope === scope
    && canonicalJson(restored.source) === canonicalJson(retainedSource)
    && storefrontEditDraftsMatch(restored.draft, retainedDraft))
}

export function storefrontEditRecoveriesMatch(left: StorefrontEditRecovery, right: StorefrontEditRecovery) {
  const restoredLeft = restoreStorefrontEditRecovery(left)
  const restoredRight = restoreStorefrontEditRecovery(right)
  return Boolean(restoredLeft
    && restoredRight
    && restoredLeft.capturedAt === restoredRight.capturedAt
    && restoredLeft.view === restoredRight.view
    && restoredLeft.device === restoredRight.device
    && storefrontEditRecoveryMatchesDraft(
      restoredLeft,
      restoredRight.scope,
      restoredRight.source,
      restoredRight.draft,
    ))
}

export function reviewStorefrontEditRecovery(
  recovery: StorefrontEditRecovery,
  scope: string,
  saved: StorefrontSavedSnapshot | null,
  catalogDigest: string,
  catalogSkus: readonly string[],
  savedFields: StorefrontEditDraft,
): StorefrontEditRecoveryReview {
  const restored = restoreStorefrontEditRecovery(recovery)
  const currentCatalogDigest = canonicalDigest(catalogDigest)
  const retainedSavedFields = canonicalDraft(savedFields)
  if (!restored
    || !currentCatalogDigest
    || !retainedSavedFields
    || !Array.isArray(catalogSkus)
    || catalogSkus.length > 100
    || catalogSkus.some((sku) => !exactText(sku, 80))
    || new Set(catalogSkus).size !== catalogSkus.length) return { ok: false, reason: 'invalid_recovery' }
  if (restored.scope !== scope) return { ok: false, reason: 'scope_changed' }
  const savedRevision = saved?.revision ?? 0
  const savedAt = saved?.savedAt ?? null
  if (restored.source.savedRevision !== savedRevision
    || restored.source.savedAt !== savedAt
    || restored.source.savedFingerprint !== storefrontSavedStateFingerprint(saved)) {
    return { ok: false, reason: 'saved_storefront_changed' }
  }
  if (restored.source.catalogDigest !== currentCatalogDigest) return { ok: false, reason: 'catalog_changed' }
  const knownSkus = new Set(catalogSkus)
  if (restored.draft.selectedSkus.some((sku) => !knownSkus.has(sku))) return { ok: false, reason: 'invalid_recovery' }
  if (storefrontEditDraftsMatch(restored.draft, retainedSavedFields)) return { ok: false, reason: 'no_changes' }
  return {
    ok: true,
    draft: restored.draft,
    view: restored.view,
    device: restored.device,
  }
}
