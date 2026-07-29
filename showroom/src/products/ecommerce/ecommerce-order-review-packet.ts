export const ECOMMERCE_ORDER_IMPORT_REVIEW_PACKET_SCHEMA = 'supermega.ecommerce.order_import_review_packet.v1' as const

export const ecommerceOrderImportReviewForbiddenActions = [
  'order_import',
  'customer_message_send',
  'payment_capture',
  'wallet_debit',
  'delivery_booking',
  'stock_move',
  'refund_write',
  'shop_write',
  'managed_activation',
] as const

export const ecommerceOrderImportReviewSupportHandoff = [
  'Review this packet against the saved Shop catalog before any managed queue import.',
  'Enable Shop writes only after Postgres, RLS, auth, audit, and scheduler proof passes.',
] as const

export type EcommerceOrderImportReviewForbiddenAction = typeof ecommerceOrderImportReviewForbiddenActions[number]
export type EcommerceOrderImportReviewMode = 'browser_local_trial' | 'managed_trial'
export type EcommerceOrderImportReview = {
  status: 'ready' | 'blocked'
  totalRows: number
  readyRows: number
  blockedRows: number
  summary: string
}

export type EcommerceOrderImportReviewPacket = {
  schema: typeof ECOMMERCE_ORDER_IMPORT_REVIEW_PACKET_SCHEMA
  version: 1
  generatedAt: string
  product: 'ecommerce'
  storeName: string
  operatingMode: EcommerceOrderImportReviewMode
  catalog: {
    source: 'shop-local' | 'sample' | 'unavailable' | 'managed-shop'
    items: number
    selectedSkus: string[]
  }
  review: EcommerceOrderImportReview
  sourceCsv: string
  supportHandoff: string[]
  forbiddenActions: EcommerceOrderImportReviewForbiddenAction[]
}

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

function isSafeNonNegativeInteger(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

function sameStringArray(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index])
}

export function validateEcommerceOrderImportReviewPacket(value: unknown): EcommerceOrderImportReviewPacket {
  if (!isRecord(value)
    || !hasExactKeys(value, ['schema', 'version', 'generatedAt', 'product', 'storeName', 'operatingMode', 'catalog', 'review', 'sourceCsv', 'supportHandoff', 'forbiddenActions'])
    || value.schema !== ECOMMERCE_ORDER_IMPORT_REVIEW_PACKET_SCHEMA
    || value.version !== 1
    || !isIsoTimestamp(value.generatedAt)
    || value.product !== 'ecommerce'
    || !isCanonicalText(value.storeName, 60)
    || value.operatingMode !== 'browser_local_trial' && value.operatingMode !== 'managed_trial'
    || !isRecord(value.catalog)
    || !hasExactKeys(value.catalog, ['source', 'items', 'selectedSkus'])
    || !['shop-local', 'sample', 'unavailable', 'managed-shop'].includes(String(value.catalog.source))
    || !isSafeNonNegativeInteger(value.catalog.items)
    || !Array.isArray(value.catalog.selectedSkus)
    || value.catalog.selectedSkus.length > 8
    || !value.catalog.selectedSkus.every((sku) => isCanonicalText(sku, 80))
    || !isRecord(value.review)
    || !hasExactKeys(value.review, ['status', 'totalRows', 'readyRows', 'blockedRows', 'summary'])
    || value.review.status !== 'ready' && value.review.status !== 'blocked'
    || !isSafeNonNegativeInteger(value.review.totalRows)
    || !isSafeNonNegativeInteger(value.review.readyRows)
    || !isSafeNonNegativeInteger(value.review.blockedRows)
    || !isCanonicalText(value.review.summary, 220)
    || typeof value.sourceCsv !== 'string'
    || value.sourceCsv.trim().length === 0
    || value.sourceCsv.length > 20000
    || !Array.isArray(value.supportHandoff)
    || !sameStringArray(value.supportHandoff, ecommerceOrderImportReviewSupportHandoff)
    || !Array.isArray(value.forbiddenActions)
    || !sameStringArray(value.forbiddenActions, ecommerceOrderImportReviewForbiddenActions)) {
    throw new Error('Ecommerce order import review packet failed validation.')
  }
  if (value.catalog.selectedSkus.length > Number(value.catalog.items)) {
    throw new Error('Ecommerce order review packet selected more SKUs than the source catalog contains.')
  }
  if (Number(value.review.readyRows) + Number(value.review.blockedRows) !== Number(value.review.totalRows)) {
    throw new Error('Ecommerce order review packet row counts do not reconcile.')
  }
  if (value.review.status === 'ready' && Number(value.review.blockedRows) !== 0) {
    throw new Error('Ready Ecommerce order review packets cannot include blocked rows.')
  }
  if (value.operatingMode === 'managed_trial' && value.catalog.source !== 'managed-shop') {
    throw new Error('Managed Ecommerce order review packets must come from a managed Shop catalog.')
  }
  return value as EcommerceOrderImportReviewPacket
}

export function buildEcommerceOrderImportReviewPacket(input: Omit<EcommerceOrderImportReviewPacket, 'schema' | 'version' | 'supportHandoff' | 'forbiddenActions'>): EcommerceOrderImportReviewPacket {
  return validateEcommerceOrderImportReviewPacket({
    ...input,
    schema: ECOMMERCE_ORDER_IMPORT_REVIEW_PACKET_SCHEMA,
    version: 1,
    supportHandoff: [...ecommerceOrderImportReviewSupportHandoff],
    forbiddenActions: [...ecommerceOrderImportReviewForbiddenActions],
  })
}
