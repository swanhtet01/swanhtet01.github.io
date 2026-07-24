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

  return {
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
  }
}

export async function storefrontPreviewDigest(preview: StorefrontPreview) {
  if (preview.schema !== STOREFRONT_PREVIEW_SCHEMA || preview.mode !== 'browser-local-preview') {
    throw new Error('Storefront preview contract is invalid.')
  }
  if (!globalThis.crypto?.subtle) throw new Error('Secure preview digest is unavailable.')
  const bytes = new TextEncoder().encode(JSON.stringify(preview))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}
