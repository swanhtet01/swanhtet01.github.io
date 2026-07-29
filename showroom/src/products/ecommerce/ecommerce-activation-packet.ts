export const ECOMMERCE_MANAGED_STORE_ACTIVATION_PACKET_SCHEMA = 'supermega.ecommerce.managed_store_activation_packet.v1' as const

export const ecommerceManagedStoreActivationForbiddenActions = [
  'product_publish',
  'customer_message_send',
  'payment_capture',
  'wallet_debit',
  'delivery_booking',
  'stock_move',
  'refund_write',
  'shop_write',
  'managed_activation',
] as const

export const ecommerceManagedStoreActivationSupportHandoff = [
  'Confirm catalog import and selected sellable SKUs.',
  'Confirm storefront fingerprint and saved revision.',
  'Confirm checkout quote controls before customer use.',
  'Confirm manual payment and delivery review rules.',
  'Clear the Shop review queue before managed activation.',
  'Enable managed writes only after Postgres, RLS, auth, audit, and scheduler proof passes.',
] as const

export type EcommerceManagedStoreActivationForbiddenAction = typeof ecommerceManagedStoreActivationForbiddenActions[number]
export type EcommerceManagedStoreActivationMode = 'browser_local_trial' | 'managed_trial'
export type EcommerceManagedStoreActivationReadiness = Record<'Catalog' | 'Storefront' | 'Checkout' | 'Payments' | 'Delivery' | 'Shop gate' | 'Activation', string>

export type EcommerceManagedStoreActivationPacket = {
  schema: typeof ECOMMERCE_MANAGED_STORE_ACTIVATION_PACKET_SCHEMA
  version: 1
  generatedAt: string
  product: 'ecommerce'
  storeName: string
  stage: string
  operatingMode: EcommerceManagedStoreActivationMode
  source: {
    catalogSource: 'shop-local' | 'sample' | 'unavailable' | 'managed-shop'
    catalogItems: number
    selectedSkus: string[]
    previewDigest: string | null
    managedCatalogDigest: string | null
    savedRevision: number | null
    savedAt: string | null
  }
  readiness: EcommerceManagedStoreActivationReadiness
  orderQueue: {
    pendingShopReviews: number
    stockRisk: number
    expiringQuotes: number
    manualPaymentReview: number
    deliveryReview: number
    pickupReview: number
  }
  supportHandoff: string[]
  forbiddenActions: EcommerceManagedStoreActivationForbiddenAction[]
}

const digestPattern = /^sha256:[a-f0-9]{64}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value)
  return actual.length === keys.length && keys.every((key) => actual.includes(key))
}

function isIsoTimestamp(value: unknown) {
  return typeof value === 'string'
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value
}

function isCanonicalText(value: unknown, maximum: number) {
  return typeof value === 'string'
    && value === value.trim()
    && value.length > 0
    && value.length <= maximum
}

function isDigestOrNull(value: unknown) {
  return value === null || (typeof value === 'string' && digestPattern.test(value))
}

function isSafeNonNegativeInteger(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

function sameStringArray(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index])
}

export function validateEcommerceManagedStoreActivationPacket(value: unknown): EcommerceManagedStoreActivationPacket {
  if (!isRecord(value)
    || !hasExactKeys(value, ['schema', 'version', 'generatedAt', 'product', 'storeName', 'stage', 'operatingMode', 'source', 'readiness', 'orderQueue', 'supportHandoff', 'forbiddenActions'])
    || value.schema !== ECOMMERCE_MANAGED_STORE_ACTIVATION_PACKET_SCHEMA
    || value.version !== 1
    || !isIsoTimestamp(value.generatedAt)
    || value.product !== 'ecommerce'
    || !isCanonicalText(value.storeName, 60)
    || !isCanonicalText(value.stage, 80)
    || value.operatingMode !== 'browser_local_trial' && value.operatingMode !== 'managed_trial'
    || !isRecord(value.source)
    || !hasExactKeys(value.source, ['catalogSource', 'catalogItems', 'selectedSkus', 'previewDigest', 'managedCatalogDigest', 'savedRevision', 'savedAt'])
    || !['shop-local', 'sample', 'unavailable', 'managed-shop'].includes(String(value.source.catalogSource))
    || !isSafeNonNegativeInteger(value.source.catalogItems)
    || !Array.isArray(value.source.selectedSkus)
    || value.source.selectedSkus.length > 8
    || !value.source.selectedSkus.every((sku) => isCanonicalText(sku, 80))
    || !isDigestOrNull(value.source.previewDigest)
    || !isDigestOrNull(value.source.managedCatalogDigest)
    || value.source.savedRevision !== null && (!Number.isSafeInteger(value.source.savedRevision) || Number(value.source.savedRevision) < 1)
    || value.source.savedAt !== null && !isIsoTimestamp(value.source.savedAt)
    || !isRecord(value.readiness)
    || !hasExactKeys(value.readiness, ['Catalog', 'Storefront', 'Checkout', 'Payments', 'Delivery', 'Shop gate', 'Activation'])
    || !Object.values(value.readiness).every((entry) => isCanonicalText(entry, 80))
    || !isRecord(value.orderQueue)
    || !hasExactKeys(value.orderQueue, ['pendingShopReviews', 'stockRisk', 'expiringQuotes', 'manualPaymentReview', 'deliveryReview', 'pickupReview'])
    || !Object.values(value.orderQueue).every(isSafeNonNegativeInteger)
    || !Array.isArray(value.supportHandoff)
    || !sameStringArray(value.supportHandoff, ecommerceManagedStoreActivationSupportHandoff)
    || !Array.isArray(value.forbiddenActions)
    || !sameStringArray(value.forbiddenActions, ecommerceManagedStoreActivationForbiddenActions)) {
    throw new Error('Ecommerce managed store activation packet failed validation.')
  }
  if (value.operatingMode === 'managed_trial' && value.source.catalogSource !== 'managed-shop') {
    throw new Error('Managed Ecommerce activation packets must come from a managed Shop catalog.')
  }
  if (value.source.selectedSkus.length > Number(value.source.catalogItems)) {
    throw new Error('Ecommerce activation packet selected more SKUs than the source catalog contains.')
  }
  return value as EcommerceManagedStoreActivationPacket
}

export function buildEcommerceManagedStoreActivationPacket(input: Omit<EcommerceManagedStoreActivationPacket, 'schema' | 'version' | 'supportHandoff' | 'forbiddenActions'>): EcommerceManagedStoreActivationPacket {
  return validateEcommerceManagedStoreActivationPacket({
    ...input,
    schema: ECOMMERCE_MANAGED_STORE_ACTIVATION_PACKET_SCHEMA,
    version: 1,
    supportHandoff: [...ecommerceManagedStoreActivationSupportHandoff],
    forbiddenActions: [...ecommerceManagedStoreActivationForbiddenActions],
  })
}
