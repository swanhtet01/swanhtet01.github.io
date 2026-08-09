import { validateCommerceState, type CommerceItem, type CommerceState } from '../../core/commerce-workspace.ts'
import {
  validateEcommerceBuyingState,
  type EcommerceBuyingState,
  type EcommerceFulfilment,
  type EcommercePaymentAdapter,
} from './ecommerce-buying-lifecycle.ts'
import { storefrontPreviewDigest, validateStorefrontPreview, type StorefrontPreview } from './storefront-model.ts'

export const ECOMMERCE_CHECKOUT_ENTRY_RECOVERY_CONTRACT = 'supermega.ecommerce.closed-checkout-entry.v1' as const

export type EcommerceCheckoutEntryLine = Readonly<{
  sku: string
  quantity: number
  quantityDraft: string
}>

export type EcommerceCheckoutEntryRemovedLine = Readonly<{
  line: Readonly<{ sku: string; quantity: number }>
  index: number
  itemName: string
}>

export type EcommerceCheckoutEntryDraft = Readonly<{
  lines: readonly EcommerceCheckoutEntryLine[]
  removedCartLine: EcommerceCheckoutEntryRemovedLine | null
  customerName: string
  customerPhone: string
  addressLine1: string
  addressTownship: string
  addressCity: string
  deliveryInstructions: string
  fulfilment: EcommerceFulfilment
  paymentAdapter: EcommercePaymentAdapter
  promotionCode: string
  panelOpen: true
}>

export type EcommerceCheckoutEntryRecoverySource = Readonly<{
  sourcePreviewDigest: string
  sourceStorefrontRevision: number | null
  sourceStorefrontActionId: string | null
  buyingRevision: number
  buyingHeadDigest: string
  stateDigest: string
}>

export type EcommerceCheckoutEntryRecovery = Readonly<{
  schema: typeof ECOMMERCE_CHECKOUT_ENTRY_RECOVERY_CONTRACT
  scope: string
  capturedAt: string
  source: EcommerceCheckoutEntryRecoverySource
  draft: EcommerceCheckoutEntryDraft
}>

export type EcommerceCheckoutEntryRecoveryReview =
  | Readonly<{ ok: true; draft: EcommerceCheckoutEntryDraft }>
  | Readonly<{ ok: false; reason: 'invalid_recovery' | 'scope_changed' | 'source_changed' }>

type EcommerceCheckoutEntrySourceInput = Readonly<{
  commerceState: CommerceState
  currentCatalog: CommerceItem[]
  preview: StorefrontPreview
  buyingState: EcommerceBuyingState
  sourcePreviewDigest: string
  sourceStorefront: { revision: number; actionId: string } | null
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, required: string[]) {
  const actual = Object.keys(value)
  return required.every((key) => actual.includes(key)) && actual.every((key) => required.includes(key))
}

function exactRawText(value: unknown, maximum: number) {
  return typeof value === 'string' && value.length <= maximum && !value.includes('\u0000') ? value : null
}

function exactIdentity(value: unknown, maximum: number) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maximum
    && value === value.trim()
    && !value.includes('\u0000')
    ? value
    : null
}

function canonicalInteger(value: unknown, minimum: number, maximum: number) {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum ? Number(value) : null
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

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, nested]) => [key, canonicalValue(nested)]),
  )
}

function canonicalScope(value: unknown) {
  return exactIdentity(value, 256)
}

function canonicalLine(value: unknown): EcommerceCheckoutEntryLine | null {
  if (!isRecord(value) || !hasExactKeys(value, ['sku', 'quantity', 'quantityDraft'])) return null
  const sku = exactIdentity(value.sku, 80)
  const quantity = canonicalInteger(value.quantity, 1, 99)
  const quantityDraft = exactRawText(value.quantityDraft, 8)
  if (!sku || quantity === null || quantityDraft === null) return null
  const parsedDraft = Number(quantityDraft)
  if (quantityDraft.trim()
    && Number.isSafeInteger(parsedDraft)
    && parsedDraft >= 1
    && parsedDraft <= 99
    && parsedDraft !== quantity) return null
  return { sku, quantity, quantityDraft }
}

function canonicalRemovedLine(value: unknown): EcommerceCheckoutEntryRemovedLine | null {
  if (!isRecord(value) || !hasExactKeys(value, ['line', 'index', 'itemName']) || !isRecord(value.line)) return null
  if (!hasExactKeys(value.line, ['sku', 'quantity'])) return null
  const sku = exactIdentity(value.line.sku, 80)
  const quantity = canonicalInteger(value.line.quantity, 1, 99)
  const index = canonicalInteger(value.index, 0, 20)
  const itemName = exactIdentity(value.itemName, 180)
  if (!sku || quantity === null || index === null || !itemName) return null
  return { line: { sku, quantity }, index, itemName }
}

function canonicalDraft(value: unknown): EcommerceCheckoutEntryDraft | null {
  if (!isRecord(value)
    || !hasExactKeys(value, [
      'lines', 'removedCartLine', 'customerName', 'customerPhone', 'addressLine1', 'addressTownship',
      'addressCity', 'deliveryInstructions', 'fulfilment', 'paymentAdapter', 'promotionCode', 'panelOpen',
    ])
    || !Array.isArray(value.lines)
    || value.lines.length > 20
    || value.panelOpen !== true
    || !['pickup', 'delivery'].includes(String(value.fulfilment))
    || !['pay_on_pickup', 'cash_on_delivery', 'kbzpay_manual'].includes(String(value.paymentAdapter))) return null
  const lines = value.lines.map((line) => canonicalLine(line))
  if (lines.some((line) => !line)) return null
  const retainedLines = lines as EcommerceCheckoutEntryLine[]
  if (new Set(retainedLines.map((line) => line.sku)).size !== retainedLines.length) return null
  const removedCartLine = value.removedCartLine === null ? null : canonicalRemovedLine(value.removedCartLine)
  if (value.removedCartLine !== null && !removedCartLine) return null
  if (removedCartLine
    && (retainedLines.some((line) => line.sku === removedCartLine.line.sku)
      || removedCartLine.index > retainedLines.length)) return null
  const customerName = exactRawText(value.customerName, 80)
  const customerPhone = exactRawText(value.customerPhone, 32)
  const addressLine1 = exactRawText(value.addressLine1, 120)
  const addressTownship = exactRawText(value.addressTownship, 80)
  const addressCity = exactRawText(value.addressCity, 80)
  const deliveryInstructions = exactRawText(value.deliveryInstructions, 160)
  const promotionCode = exactRawText(value.promotionCode, 40)
  if (customerName === null
    || customerPhone === null
    || addressLine1 === null
    || addressTownship === null
    || addressCity === null
    || deliveryInstructions === null
    || promotionCode === null) return null
  const draft: EcommerceCheckoutEntryDraft = {
    lines: retainedLines,
    removedCartLine,
    customerName,
    customerPhone,
    addressLine1,
    addressTownship,
    addressCity,
    deliveryInstructions,
    fulfilment: value.fulfilment as EcommerceFulfilment,
    paymentAdapter: value.paymentAdapter as EcommercePaymentAdapter,
    promotionCode,
    panelOpen: true,
  }
  return ecommerceCheckoutEntryDraftHasContent(draft) ? draft : null
}

function canonicalSource(value: unknown): EcommerceCheckoutEntryRecoverySource | null {
  if (!isRecord(value)
    || !hasExactKeys(value, [
      'sourcePreviewDigest', 'sourceStorefrontRevision', 'sourceStorefrontActionId',
      'buyingRevision', 'buyingHeadDigest', 'stateDigest',
    ])) return null
  const sourcePreviewDigest = canonicalDigest(value.sourcePreviewDigest)
  const buyingRevision = canonicalInteger(value.buyingRevision, 0, Number.MAX_SAFE_INTEGER)
  const buyingHeadDigest = canonicalDigest(value.buyingHeadDigest)
  const stateDigest = canonicalDigest(value.stateDigest)
  const sourceStorefrontRevision = value.sourceStorefrontRevision === null
    ? null
    : canonicalInteger(value.sourceStorefrontRevision, 0, Number.MAX_SAFE_INTEGER)
  const sourceStorefrontActionId = value.sourceStorefrontActionId === null
    ? null
    : exactIdentity(value.sourceStorefrontActionId, 180)
  if (!sourcePreviewDigest
    || buyingRevision === null
    || !buyingHeadDigest
    || !stateDigest
    || (value.sourceStorefrontRevision !== null && sourceStorefrontRevision === null)
    || (value.sourceStorefrontActionId !== null && !sourceStorefrontActionId)
    || (sourceStorefrontRevision === null) !== (sourceStorefrontActionId === null)) return null
  return {
    sourcePreviewDigest,
    sourceStorefrontRevision,
    sourceStorefrontActionId,
    buyingRevision,
    buyingHeadDigest,
    stateDigest,
  }
}

function canonicalCatalog(value: CommerceItem[]) {
  if (!Array.isArray(value) || value.length > 2_000) throw new Error('Ecommerce checkout recovery requires a valid Shop catalog.')
  const items = value.map((item) => {
    const sku = exactIdentity(item?.sku, 80)
    const name = exactIdentity(item?.name, 180)
    const variant = item?.variant === undefined
      ? null
      : typeof item.variant === 'string'
        && item.variant.length <= 180
        && item.variant === item.variant.trim()
        && !item.variant.includes('\u0000')
        ? item.variant
        : null
    const onHand = canonicalInteger(item?.onHand, 0, Number.MAX_SAFE_INTEGER)
    const reorderAt = canonicalInteger(item?.reorderAt, 0, Number.MAX_SAFE_INTEGER)
    const price = canonicalInteger(item?.price, 1, Number.MAX_SAFE_INTEGER)
    if (!sku || !name || (item.variant !== undefined && variant === null) || onHand === null || reorderAt === null || price === null) {
      throw new Error('Ecommerce checkout recovery requires a valid Shop catalog.')
    }
    return { sku, name, variant, onHand, reorderAt, price }
  }).sort((left, right) => left.sku.localeCompare(right.sku))
  if (new Set(items.map((item) => item.sku)).size !== items.length) {
    throw new Error('Ecommerce checkout recovery requires unique Shop SKUs.')
  }
  return items
}

async function sha256(value: unknown) {
  if (!globalThis.crypto?.subtle) throw new Error('Secure checkout recovery is unavailable.')
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalValue(value)))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

export function ecommerceCheckoutEntryDraftHasContent(draft: Pick<
  EcommerceCheckoutEntryDraft,
  'lines' | 'removedCartLine' | 'customerName' | 'customerPhone' | 'addressLine1' | 'addressTownship'
    | 'addressCity' | 'deliveryInstructions' | 'fulfilment' | 'paymentAdapter' | 'promotionCode'
>) {
  return Boolean(draft.lines.length
    || draft.removedCartLine
    || draft.customerName.length
    || draft.customerPhone.length
    || draft.addressLine1.length
    || draft.addressTownship.length
    || (draft.addressCity && draft.addressCity !== 'Yangon')
    || draft.deliveryInstructions.length
    || draft.fulfilment !== 'pickup'
    || draft.paymentAdapter !== 'pay_on_pickup'
    || draft.promotionCode.length)
}

export function ecommerceCheckoutEntryDraft(value: Omit<EcommerceCheckoutEntryDraft, 'panelOpen'>) {
  const retained = canonicalDraft({ ...value, panelOpen: true })
  if (!retained) throw new Error('Ecommerce checkout recovery could not preserve this entry.')
  return retained
}

export async function ecommerceCheckoutEntryRecoverySource(
  scope: string,
  input: EcommerceCheckoutEntrySourceInput,
): Promise<EcommerceCheckoutEntryRecoverySource> {
  const retainedScope = canonicalScope(scope)
  const sourcePreviewDigest = canonicalDigest(input.sourcePreviewDigest)
  if (!retainedScope || !sourcePreviewDigest) throw new Error('Ecommerce checkout recovery requires an exact source.')
  const commerceState = validateCommerceState(input.commerceState)
  const currentCatalog = canonicalCatalog(input.currentCatalog)
  const preview = validateStorefrontPreview(input.preview)
  const buyingState = await validateEcommerceBuyingState(input.buyingState, retainedScope)
  if (await storefrontPreviewDigest(preview) !== sourcePreviewDigest) {
    throw new Error('Ecommerce checkout recovery requires the exact storefront preview.')
  }
  const sourceStorefront = input.sourceStorefront
    ? {
        revision: canonicalInteger(input.sourceStorefront.revision, 0, Number.MAX_SAFE_INTEGER),
        actionId: exactIdentity(input.sourceStorefront.actionId, 180),
      }
    : null
  if (sourceStorefront && (sourceStorefront.revision === null || !sourceStorefront.actionId)) {
    throw new Error('Ecommerce checkout recovery requires an exact saved storefront source.')
  }
  const stateDigest = await sha256({
    scope: retainedScope,
    commerceState,
    currentCatalog,
    preview,
    buyingState,
    sourcePreviewDigest,
    sourceStorefront,
  })
  return {
    sourcePreviewDigest,
    sourceStorefrontRevision: sourceStorefront?.revision ?? null,
    sourceStorefrontActionId: sourceStorefront?.actionId ?? null,
    buyingRevision: buyingState.revision,
    buyingHeadDigest: buyingState.headDigest,
    stateDigest,
  }
}

export function ecommerceCheckoutEntryRecoveryStorageKey(scope: string) {
  const retainedScope = canonicalScope(scope)
  if (!retainedScope) throw new Error('Ecommerce checkout recovery requires an exact account scope.')
  return `${ECOMMERCE_CHECKOUT_ENTRY_RECOVERY_CONTRACT}.${encodeURIComponent(retainedScope)}`
}

export function createEcommerceCheckoutEntryRecovery(
  scope: string,
  source: EcommerceCheckoutEntryRecoverySource,
  draft: EcommerceCheckoutEntryDraft,
  capturedAt: Date | string = new Date(),
): EcommerceCheckoutEntryRecovery {
  const retainedScope = canonicalScope(scope)
  const retainedSource = canonicalSource(source)
  const retainedDraft = canonicalDraft(draft)
  const capturedAtValue = capturedAt instanceof Date ? capturedAt.toISOString() : capturedAt
  if (!retainedScope || !retainedSource || !retainedDraft || canonicalTimestamp(capturedAtValue) === null) {
    throw new Error('Ecommerce checkout recovery could not be created from this entry.')
  }
  return {
    schema: ECOMMERCE_CHECKOUT_ENTRY_RECOVERY_CONTRACT,
    scope: retainedScope,
    capturedAt: capturedAtValue,
    source: retainedSource,
    draft: retainedDraft,
  }
}

export function restoreEcommerceCheckoutEntryRecovery(value: unknown): EcommerceCheckoutEntryRecovery | null {
  try {
    const candidate = typeof value === 'string' ? JSON.parse(value) as unknown : value
    if (!isRecord(candidate)
      || !hasExactKeys(candidate, ['schema', 'scope', 'capturedAt', 'source', 'draft'])
      || candidate.schema !== ECOMMERCE_CHECKOUT_ENTRY_RECOVERY_CONTRACT) return null
    return createEcommerceCheckoutEntryRecovery(
      candidate.scope as string,
      candidate.source as EcommerceCheckoutEntryRecoverySource,
      candidate.draft as EcommerceCheckoutEntryDraft,
      candidate.capturedAt as string,
    )
  } catch {
    return null
  }
}

function sourcesMatch(left: EcommerceCheckoutEntryRecoverySource, right: EcommerceCheckoutEntryRecoverySource) {
  const retainedLeft = canonicalSource(left)
  const retainedRight = canonicalSource(right)
  return Boolean(retainedLeft && retainedRight && JSON.stringify(retainedLeft) === JSON.stringify(retainedRight))
}

export function ecommerceCheckoutEntryDraftsMatch(left: EcommerceCheckoutEntryDraft, right: EcommerceCheckoutEntryDraft) {
  const retainedLeft = canonicalDraft(left)
  const retainedRight = canonicalDraft(right)
  return Boolean(retainedLeft && retainedRight && JSON.stringify(retainedLeft) === JSON.stringify(retainedRight))
}

export function ecommerceCheckoutEntryRecoveryMatchesDraft(
  recovery: EcommerceCheckoutEntryRecovery,
  scope: string,
  source: EcommerceCheckoutEntryRecoverySource,
  draft: EcommerceCheckoutEntryDraft,
) {
  const restored = restoreEcommerceCheckoutEntryRecovery(recovery)
  return Boolean(restored
    && restored.scope === scope
    && sourcesMatch(restored.source, source)
    && ecommerceCheckoutEntryDraftsMatch(restored.draft, draft))
}

export function ecommerceCheckoutEntryRecoveriesMatch(
  left: EcommerceCheckoutEntryRecovery,
  right: EcommerceCheckoutEntryRecovery,
) {
  const retainedLeft = restoreEcommerceCheckoutEntryRecovery(left)
  const retainedRight = restoreEcommerceCheckoutEntryRecovery(right)
  return Boolean(retainedLeft
    && retainedRight
    && retainedLeft.capturedAt === retainedRight.capturedAt
    && ecommerceCheckoutEntryRecoveryMatchesDraft(retainedLeft, retainedRight.scope, retainedRight.source, retainedRight.draft))
}

export function reviewEcommerceCheckoutEntryRecovery(
  recovery: EcommerceCheckoutEntryRecovery,
  scope: string,
  source: EcommerceCheckoutEntryRecoverySource,
  currentCatalog: CommerceItem[],
  preview: StorefrontPreview,
): EcommerceCheckoutEntryRecoveryReview {
  const restored = restoreEcommerceCheckoutEntryRecovery(recovery)
  const retainedSource = canonicalSource(source)
  if (!restored || !retainedSource) return { ok: false, reason: 'invalid_recovery' }
  if (restored.scope !== scope) return { ok: false, reason: 'scope_changed' }
  if (!sourcesMatch(restored.source, retainedSource)) return { ok: false, reason: 'source_changed' }
  let catalog: ReturnType<typeof canonicalCatalog>
  let retainedPreview: StorefrontPreview
  try {
    catalog = canonicalCatalog(currentCatalog)
    retainedPreview = validateStorefrontPreview(preview)
  } catch {
    return { ok: false, reason: 'invalid_recovery' }
  }
  const catalogBySku = new Map(catalog.map((item) => [item.sku, item]))
  const previewSkus = new Set(retainedPreview.items.filter((item) => item.availability === 'available').map((item) => item.sku))
  const retainedDraft = restored.draft
  if (retainedDraft.lines.some((line) => {
    const item = catalogBySku.get(line.sku)
    return !item || !previewSkus.has(line.sku) || line.quantity > item.onHand
  })) return { ok: false, reason: 'source_changed' }
  if (retainedDraft.removedCartLine) {
    const removed = retainedDraft.removedCartLine.line
    const item = catalogBySku.get(removed.sku)
    if (!item || !previewSkus.has(removed.sku) || removed.quantity > item.onHand) {
      return { ok: false, reason: 'source_changed' }
    }
  }
  return { ok: true, draft: retainedDraft }
}
