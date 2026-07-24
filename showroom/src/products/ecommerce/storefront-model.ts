import {
  COMMERCE_KEY,
  COMMERCE_WORKSPACE_SCHEMA,
  createSeedCommerce,
  validateCommerceState,
  type CommerceItem,
} from '../../core/commerce-workspace.ts'

export const STOREFRONT_PREVIEW_SCHEMA = 'supermega.ecommerce.storefront_preview.v1' as const

export type StorefrontCatalogSource = 'shop-local' | 'sample' | 'unavailable'

export type StorefrontCatalogSnapshot = {
  source: StorefrontCatalogSource
  items: CommerceItem[]
  error: string
}

export type StorefrontPreviewItem = {
  sku: string
  name: string
  variant: string | null
  unitPriceMmk: number
  availability: 'available' | 'sold_out'
}

export type StorefrontPreview = {
  schema: typeof STOREFRONT_PREVIEW_SCHEMA
  mode: 'browser-local-preview'
  sourceCatalogSchema: typeof COMMERCE_WORKSPACE_SCHEMA
  storeName: string
  summary: string
  currency: 'MMK'
  items: StorefrontPreviewItem[]
}

type ReadableStorage = {
  getItem: (key: string) => string | null
}

type StorefrontInput = {
  storeName: string
  summary: string
  selectedSkus: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value)
  return actual.length === keys.length && keys.every((key) => actual.includes(key))
}

function browserStorage(): ReadableStorage | undefined {
  try {
    return globalThis.localStorage as ReadableStorage | undefined
  } catch {
    return undefined
  }
}

function canonicalText(value: unknown, field: string, maximum: number) {
  if (typeof value !== 'string' || value !== value.trim() || !value || value.length > maximum) {
    throw new Error(`${field} must be visible canonical text of at most ${maximum} characters.`)
  }
  return value
}

function validateCatalog(items: CommerceItem[]) {
  if (!Array.isArray(items) || !items.length || items.length > 100) {
    throw new Error('Shop catalog must contain between 1 and 100 items.')
  }
  const skus = new Set<string>()
  return items.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`Shop item ${index + 1} is invalid.`)
    const sku = canonicalText(item.sku, `Shop item ${index + 1} SKU`, 80)
    const name = canonicalText(item.name, `Shop item ${index + 1} name`, 180)
    const variant = item.variant === undefined ? undefined : canonicalText(item.variant, `Shop item ${index + 1} variant`, 180)
    if (skus.has(sku)) throw new Error(`Shop catalog contains duplicate SKU ${sku}.`)
    if (!Number.isSafeInteger(item.onHand) || item.onHand < 0) throw new Error(`${sku} has invalid availability.`)
    if (!Number.isSafeInteger(item.price) || item.price < 1) throw new Error(`${sku} has an invalid MMK price.`)
    skus.add(sku)
    return { ...item, sku, name, variant }
  })
}

export function readStorefrontCatalog(storage = browserStorage()): StorefrontCatalogSnapshot {
  if (!storage) {
    return {
      source: 'unavailable',
      items: [],
      error: 'Shop catalog storage is unavailable. Nothing was replaced.',
    }
  }
  let raw: string | null
  try {
    raw = storage.getItem(COMMERCE_KEY)
  } catch {
    return {
      source: 'unavailable',
      items: [],
      error: 'Shop catalog could not be read. Nothing was replaced.',
    }
  }
  if (raw === null) {
    return {
      source: 'sample',
      items: createSeedCommerce().items,
      error: '',
    }
  }
  try {
    return {
      source: 'shop-local',
      items: validateCommerceState(JSON.parse(raw)).items,
      error: '',
    }
  } catch {
    return {
      source: 'unavailable',
      items: [],
      error: 'Shop catalog is malformed. Ecommerce failed closed without restoring or changing it.',
    }
  }
}

export function buildStorefrontPreview(
  catalog: CommerceItem[],
  input: StorefrontInput,
): StorefrontPreview {
  const items = validateCatalog(catalog)
  const storeName = canonicalText(input.storeName, 'Store name', 60)
  const summary = canonicalText(input.summary, 'Store summary', 180)
  if (!Array.isArray(input.selectedSkus) || !input.selectedSkus.length || input.selectedSkus.length > 8) {
    throw new Error('Choose between 1 and 8 Shop items.')
  }
  const selectedSkus = input.selectedSkus.map((sku, index) => canonicalText(sku, `Selected SKU ${index + 1}`, 80))
  if (new Set(selectedSkus).size !== selectedSkus.length) throw new Error('Selected Shop SKUs must be unique.')
  const itemBySku = new Map(items.map((item) => [item.sku, item]))
  const selected = selectedSkus.map((sku) => {
    const item = itemBySku.get(sku)
    if (!item) throw new Error(`Selected SKU ${sku} is not in the Shop catalog.`)
    return item
  })

  return validateStorefrontPreview({
    schema: STOREFRONT_PREVIEW_SCHEMA,
    mode: 'browser-local-preview',
    sourceCatalogSchema: COMMERCE_WORKSPACE_SCHEMA,
    storeName,
    summary,
    currency: 'MMK',
    items: selected
      .sort((left, right) => left.sku.localeCompare(right.sku))
      .map((item) => ({
        sku: item.sku,
        name: item.name,
        variant: item.variant ?? null,
        unitPriceMmk: item.price,
        availability: item.onHand > 0 ? 'available' : 'sold_out',
      })),
  })
}

export function validateStorefrontPreview(value: unknown): StorefrontPreview {
  if (!isRecord(value) || !hasExactKeys(value, ['schema', 'mode', 'sourceCatalogSchema', 'storeName', 'summary', 'currency', 'items'])) {
    throw new Error('Storefront preview contract is invalid.')
  }
  if (value.schema !== STOREFRONT_PREVIEW_SCHEMA
    || value.mode !== 'browser-local-preview'
    || value.sourceCatalogSchema !== COMMERCE_WORKSPACE_SCHEMA
    || value.currency !== 'MMK'
    || !Array.isArray(value.items)
    || !value.items.length
    || value.items.length > 8) throw new Error('Storefront preview contract is invalid.')
  const storeName = canonicalText(value.storeName, 'Store name', 60)
  const summary = canonicalText(value.summary, 'Store summary', 180)
  const items = value.items.map((candidate, index) => {
    if (!isRecord(candidate) || !hasExactKeys(candidate, ['sku', 'name', 'variant', 'unitPriceMmk', 'availability'])) {
      throw new Error(`Storefront item ${index + 1} is invalid.`)
    }
    const sku = canonicalText(candidate.sku, `Storefront item ${index + 1} SKU`, 80)
    const name = canonicalText(candidate.name, `Storefront item ${index + 1} name`, 180)
    const variant = candidate.variant === null ? null : canonicalText(candidate.variant, `Storefront item ${index + 1} variant`, 180)
    if (!Number.isSafeInteger(candidate.unitPriceMmk) || Number(candidate.unitPriceMmk) < 1) {
      throw new Error(`${sku} has an invalid storefront price.`)
    }
    if (candidate.availability !== 'available' && candidate.availability !== 'sold_out') {
      throw new Error(`${sku} has invalid storefront availability.`)
    }
    const availability: StorefrontPreviewItem['availability'] = candidate.availability
    return {
      sku,
      name,
      variant,
      unitPriceMmk: Number(candidate.unitPriceMmk),
      availability,
    }
  })
  const skus = items.map((item) => item.sku)
  if (new Set(skus).size !== skus.length || skus.join(',') !== [...skus].sort((left, right) => left.localeCompare(right)).join(',')) {
    throw new Error('Storefront item SKUs must be unique and canonical.')
  }
  return {
    schema: STOREFRONT_PREVIEW_SCHEMA,
    mode: 'browser-local-preview',
    sourceCatalogSchema: COMMERCE_WORKSPACE_SCHEMA,
    storeName,
    summary,
    currency: 'MMK',
    items,
  }
}

export async function storefrontPreviewDigest(preview: StorefrontPreview) {
  const validated = validateStorefrontPreview(preview)
  if (!globalThis.crypto?.subtle) throw new Error('Secure preview digest is unavailable.')
  const bytes = new TextEncoder().encode(JSON.stringify(validated))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}
