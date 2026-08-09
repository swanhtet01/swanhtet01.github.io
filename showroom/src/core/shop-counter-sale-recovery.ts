import type { CommerceItem } from './commerce-workspace.ts'

export const SHOP_COUNTER_SALE_RECOVERY_CONTRACT = 'supermega.shop.closed-counter-sale.v1' as const

export type ShopCounterPayment = 'Cash' | 'KBZPay' | 'WavePay'

export type ShopCounterSaleLine = Readonly<{
  sku: string
  quantity: number
}>

export type ShopCounterSaleDraft = Readonly<{
  lines: readonly ShopCounterSaleLine[]
  customer: string
  payment: ShopCounterPayment
  cartOpen: boolean
}>

export type ShopCounterSaleRecoverySource = Readonly<{
  catalogDigest: string
}>

export type ShopCounterSaleRecovery = Readonly<{
  schema: typeof SHOP_COUNTER_SALE_RECOVERY_CONTRACT
  scope: string
  capturedAt: string
  source: ShopCounterSaleRecoverySource
  draft: ShopCounterSaleDraft
}>

export type ShopCounterSaleRecoveryReview =
  | Readonly<{ ok: true; draft: ShopCounterSaleDraft }>
  | Readonly<{ ok: false; reason: 'invalid_recovery' | 'scope_changed' | 'catalog_changed' }>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  const actual = Object.keys(value)
  return required.every((key) => actual.includes(key))
    && actual.every((key) => required.includes(key) || optional.includes(key))
}

function exactText(value: unknown, maximum: number, blankable = false) {
  if (typeof value !== 'string'
    || value.length > maximum
    || value.includes('\u0000')
    || (!blankable && (!value || value !== value.trim()))) return null
  return value
}

function canonicalTimestamp(value: unknown) {
  if (typeof value !== 'string'
    || !/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value ? value : null
}

function canonicalDigest(value: unknown) {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value) ? value : null
}

function canonicalNonNegativeInteger(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 1_000_000_000
    ? Number(value)
    : null
}

function canonicalCatalog(items: readonly CommerceItem[]) {
  if (!Array.isArray(items) || items.length > 500) return null
  const rows: Array<Required<Omit<CommerceItem, 'variant'>> & { variant: string | null }> = []
  for (const candidate of items) {
    if (!isRecord(candidate)
      || !hasExactKeys(candidate, ['sku', 'name', 'onHand', 'reorderAt', 'price'], ['variant'])) return null
    const sku = exactText(candidate.sku, 80)
    const name = exactText(candidate.name, 180)
    const variant = candidate.variant === undefined ? null : exactText(candidate.variant, 180, true)
    const onHand = canonicalNonNegativeInteger(candidate.onHand)
    const reorderAt = canonicalNonNegativeInteger(candidate.reorderAt)
    const price = canonicalNonNegativeInteger(candidate.price)
    if (!sku || !name || variant === null && candidate.variant !== undefined || onHand === null || reorderAt === null || price === null) return null
    rows.push({ sku, name, variant, onHand, reorderAt, price })
  }
  if (new Set(rows.map((row) => row.sku)).size !== rows.length) return null
  return rows
}

function canonicalDraft(value: unknown): ShopCounterSaleDraft | null {
  if (!isRecord(value)
    || !hasExactKeys(value, ['lines', 'customer', 'payment', 'cartOpen'])
    || !Array.isArray(value.lines)
    || value.lines.length < 1
    || value.lines.length > 100
    || typeof value.cartOpen !== 'boolean') return null
  const customer = exactText(value.customer, 80, true)
  if (customer === null || !['Cash', 'KBZPay', 'WavePay'].includes(String(value.payment))) return null
  const lines: ShopCounterSaleLine[] = []
  for (const candidate of value.lines) {
    if (!isRecord(candidate) || !hasExactKeys(candidate, ['sku', 'quantity'])) return null
    const sku = exactText(candidate.sku, 80)
    const quantity = canonicalNonNegativeInteger(candidate.quantity)
    if (!sku || quantity === null || quantity < 1) return null
    lines.push({ sku, quantity })
  }
  if (new Set(lines.map((line) => line.sku)).size !== lines.length) return null
  return {
    lines,
    customer,
    payment: value.payment as ShopCounterPayment,
    cartOpen: value.cartOpen,
  }
}

function canonicalSource(value: unknown): ShopCounterSaleRecoverySource | null {
  if (!isRecord(value) || !hasExactKeys(value, ['catalogDigest'])) return null
  const catalogDigest = canonicalDigest(value.catalogDigest)
  return catalogDigest ? { catalogDigest } : null
}

function canonicalScope(value: unknown) {
  return exactText(value, 256)
}

export function shopCounterCatalogDigestSource(items: readonly CommerceItem[]) {
  const catalog = canonicalCatalog(items)
  if (!catalog) throw new Error('Shop counter recovery requires a valid exact catalogue.')
  return JSON.stringify(catalog)
}

export async function shopCounterCatalogDigest(items: readonly CommerceItem[]) {
  const bytes = new TextEncoder().encode(shopCounterCatalogDigestSource(items))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

export function shopCounterSaleRecoveryStorageKey(scope: string) {
  const retainedScope = canonicalScope(scope)
  if (!retainedScope) throw new Error('Shop counter recovery requires an exact workspace scope.')
  return `${SHOP_COUNTER_SALE_RECOVERY_CONTRACT}.${encodeURIComponent(retainedScope)}`
}

export function createShopCounterSaleRecovery(
  scope: string,
  source: ShopCounterSaleRecoverySource,
  draft: ShopCounterSaleDraft,
  capturedAt: Date | string = new Date(),
): ShopCounterSaleRecovery {
  const retainedScope = canonicalScope(scope)
  const retainedSource = canonicalSource(source)
  const retainedDraft = canonicalDraft(draft)
  const capturedAtValue = capturedAt instanceof Date ? capturedAt.toISOString() : capturedAt
  if (!retainedScope || !retainedSource || !retainedDraft || canonicalTimestamp(capturedAtValue) === null) {
    throw new Error('Shop counter recovery could not be created from this sale.')
  }
  return {
    schema: SHOP_COUNTER_SALE_RECOVERY_CONTRACT,
    scope: retainedScope,
    capturedAt: capturedAtValue,
    source: retainedSource,
    draft: retainedDraft,
  }
}

export function restoreShopCounterSaleRecovery(value: unknown): ShopCounterSaleRecovery | null {
  try {
    const candidate = typeof value === 'string' ? JSON.parse(value) as unknown : value
    if (!isRecord(candidate)
      || !hasExactKeys(candidate, ['schema', 'scope', 'capturedAt', 'source', 'draft'])
      || candidate.schema !== SHOP_COUNTER_SALE_RECOVERY_CONTRACT) return null
    return createShopCounterSaleRecovery(
      candidate.scope as string,
      candidate.source as ShopCounterSaleRecoverySource,
      candidate.draft as ShopCounterSaleDraft,
      candidate.capturedAt as string,
    )
  } catch {
    return null
  }
}

export function shopCounterSaleDraftsMatch(left: ShopCounterSaleDraft, right: ShopCounterSaleDraft) {
  const retainedLeft = canonicalDraft(left)
  const retainedRight = canonicalDraft(right)
  return Boolean(retainedLeft && retainedRight && JSON.stringify(retainedLeft) === JSON.stringify(retainedRight))
}

export function shopCounterSaleRecoveryMatchesDraft(
  recovery: ShopCounterSaleRecovery,
  scope: string,
  source: ShopCounterSaleRecoverySource,
  draft: ShopCounterSaleDraft,
) {
  const restored = restoreShopCounterSaleRecovery(recovery)
  const retainedSource = canonicalSource(source)
  const retainedDraft = canonicalDraft(draft)
  return Boolean(restored
    && retainedSource
    && retainedDraft
    && restored.scope === scope
    && restored.source.catalogDigest === retainedSource.catalogDigest
    && shopCounterSaleDraftsMatch(restored.draft, retainedDraft))
}

export function shopCounterSaleRecoveriesMatch(left: ShopCounterSaleRecovery, right: ShopCounterSaleRecovery) {
  const retainedLeft = restoreShopCounterSaleRecovery(left)
  const retainedRight = restoreShopCounterSaleRecovery(right)
  return Boolean(retainedLeft
    && retainedRight
    && retainedLeft.capturedAt === retainedRight.capturedAt
    && shopCounterSaleRecoveryMatchesDraft(
      retainedLeft,
      retainedRight.scope,
      retainedRight.source,
      retainedRight.draft,
    ))
}

export function reviewShopCounterSaleRecovery(
  recovery: ShopCounterSaleRecovery,
  scope: string,
  catalogDigest: string,
  items: readonly CommerceItem[],
): ShopCounterSaleRecoveryReview {
  const restored = restoreShopCounterSaleRecovery(recovery)
  const retainedDigest = canonicalDigest(catalogDigest)
  const catalog = canonicalCatalog(items)
  if (!restored || !retainedDigest || !catalog) return { ok: false, reason: 'invalid_recovery' }
  if (restored.scope !== scope) return { ok: false, reason: 'scope_changed' }
  if (restored.source.catalogDigest !== retainedDigest) return { ok: false, reason: 'catalog_changed' }
  const bySku = new Map(catalog.map((item) => [item.sku, item]))
  if (restored.draft.lines.some((line) => !bySku.has(line.sku) || line.quantity > Number(bySku.get(line.sku)?.onHand))) {
    return { ok: false, reason: 'invalid_recovery' }
  }
  return { ok: true, draft: restored.draft }
}
