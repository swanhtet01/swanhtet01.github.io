import {
  storefrontPreviewDigest,
  validateStorefrontPreview,
  type StorefrontPreview,
} from './storefront-model.ts'

export const STOREFRONT_REQUEST_SCHEMA = 'supermega.ecommerce.order_request.v1' as const
export const STOREFRONT_REQUEST_LEDGER_SCHEMA = 'supermega.ecommerce.order_request_ledger.v1' as const

export type StorefrontRequestInput = {
  idempotencyKey: string
  customerReference: string
  sku: string
  quantity: number
  fulfilment: 'pickup' | 'delivery'
  createdAt: string
}

export type StorefrontOrderRequest = {
  schema: typeof STOREFRONT_REQUEST_SCHEMA
  mode: 'browser-local-request'
  state: 'pending_shop_review'
  id: string
  idempotencyKey: string
  createdAt: string
  sourcePreviewDigest: string
  customerReference: string
  fulfilment: 'pickup' | 'delivery'
  currency: 'MMK'
  line: {
    sku: string
    name: string
    variant: string | null
    quantity: number
    unitPriceMmk: number
  }
  totalMmk: number
}

export type StorefrontRequestLedger = {
  schema: typeof STOREFRONT_REQUEST_LEDGER_SCHEMA
  requests: StorefrontOrderRequest[]
}

const idempotencyPattern = /^ECI-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const requestIdPattern = /^ECR-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const digestPattern = /^sha256:[a-f0-9]{64}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value)
  return actual.length === keys.length && keys.every((key) => actual.includes(key))
}

function canonicalText(value: unknown, field: string, maximum: number) {
  if (typeof value !== 'string'
    || value !== value.trim()
    || !value
    || value.length > maximum
    || Array.from(value).some((character) => {
      const code = character.charCodeAt(0)
      return code <= 31 || code === 127
    })) {
    throw new Error(`${field} must be visible canonical text of at most ${maximum} characters.`)
  }
  return value
}

function validTimestamp(value: unknown) {
  return typeof value === 'string'
    && value === value.trim()
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value
}

function requestMatches(left: StorefrontOrderRequest, right: StorefrontOrderRequest) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function validateStorefrontOrderRequest(value: unknown): StorefrontOrderRequest | null {
  if (!isRecord(value)
    || !hasExactKeys(value, ['schema', 'mode', 'state', 'id', 'idempotencyKey', 'createdAt', 'sourcePreviewDigest', 'customerReference', 'fulfilment', 'currency', 'line', 'totalMmk'])
    || value.schema !== STOREFRONT_REQUEST_SCHEMA
    || value.mode !== 'browser-local-request'
    || value.state !== 'pending_shop_review'
    || typeof value.id !== 'string'
    || !requestIdPattern.test(value.id)
    || typeof value.idempotencyKey !== 'string'
    || !idempotencyPattern.test(value.idempotencyKey)
    || value.id !== `ECR-${value.idempotencyKey.slice(4)}`
    || !validTimestamp(value.createdAt)
    || typeof value.sourcePreviewDigest !== 'string'
    || !digestPattern.test(value.sourcePreviewDigest)
    || value.fulfilment !== 'pickup' && value.fulfilment !== 'delivery'
    || value.currency !== 'MMK'
    || !isRecord(value.line)
    || !hasExactKeys(value.line, ['sku', 'name', 'variant', 'quantity', 'unitPriceMmk'])
    || !Number.isSafeInteger(value.line.quantity)
    || Number(value.line.quantity) < 1
    || Number(value.line.quantity) > 99
    || !Number.isSafeInteger(value.line.unitPriceMmk)
    || Number(value.line.unitPriceMmk) < 1
    || !Number.isSafeInteger(value.totalMmk)
    || Number(value.totalMmk) < 1
    || Number(value.totalMmk) !== Number(value.line.quantity) * Number(value.line.unitPriceMmk)) return null
  try {
    canonicalText(value.customerReference, 'Customer reference', 80)
    canonicalText(value.line.sku, 'Requested SKU', 80)
    canonicalText(value.line.name, 'Requested item name', 180)
    if (value.line.variant !== null) canonicalText(value.line.variant, 'Requested item variant', 180)
  } catch {
    return null
  }
  return value as StorefrontOrderRequest
}

export function createEmptyStorefrontRequestLedger(): StorefrontRequestLedger {
  return { schema: STOREFRONT_REQUEST_LEDGER_SCHEMA, requests: [] }
}

export async function buildStorefrontOrderRequest(
  previewValue: StorefrontPreview,
  sourcePreviewDigest: string,
  input: StorefrontRequestInput,
): Promise<StorefrontOrderRequest> {
  const preview = validateStorefrontPreview(previewValue)
  if (!digestPattern.test(sourcePreviewDigest) || await storefrontPreviewDigest(preview) !== sourcePreviewDigest) {
    throw new Error('Storefront preview digest is stale or invalid.')
  }
  if (!idempotencyPattern.test(input.idempotencyKey)) throw new Error('Request idempotency key is invalid.')
  if (!validTimestamp(input.createdAt)) throw new Error('Request time must be an ISO timestamp with timezone.')
  const customerReference = canonicalText(input.customerReference, 'Customer reference', 80)
  const sku = canonicalText(input.sku, 'Requested SKU', 80)
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 99) {
    throw new Error('Request quantity must be a whole number from 1 to 99.')
  }
  if (input.fulfilment !== 'pickup' && input.fulfilment !== 'delivery') {
    throw new Error('Request fulfilment is invalid.')
  }
  const matches = preview.items.filter((item) => item.sku === sku)
  if (matches.length !== 1) throw new Error('Requested SKU is not in this storefront preview.')
  const item = matches[0]
  if (item.availability !== 'available') throw new Error('Requested item is not available in this preview.')
  const id = `ECR-${input.idempotencyKey.slice(4)}`
  const totalMmk = item.unitPriceMmk * input.quantity
  if (!Number.isSafeInteger(totalMmk)) throw new Error('Request total is outside the supported MMK range.')
  return {
    schema: STOREFRONT_REQUEST_SCHEMA,
    mode: 'browser-local-request',
    state: 'pending_shop_review',
    id,
    idempotencyKey: input.idempotencyKey,
    createdAt: input.createdAt,
    sourcePreviewDigest,
    customerReference,
    fulfilment: input.fulfilment,
    currency: 'MMK',
    line: {
      sku: item.sku,
      name: item.name,
      variant: item.variant,
      quantity: input.quantity,
      unitPriceMmk: item.unitPriceMmk,
    },
    totalMmk,
  }
}

export function recordStorefrontOrderRequest(
  ledger: StorefrontRequestLedger,
  request: StorefrontOrderRequest,
): StorefrontRequestLedger | null {
  if (!isRecord(ledger)
    || !hasExactKeys(ledger, ['schema', 'requests'])
    || ledger.schema !== STOREFRONT_REQUEST_LEDGER_SCHEMA
    || !Array.isArray(ledger.requests)
    || ledger.requests.length > 20) return null
  const validatedRequests = ledger.requests.map(validateStorefrontOrderRequest)
  const validatedRequest = validateStorefrontOrderRequest(request)
  if (!validatedRequest || validatedRequests.some((candidate) => !candidate)) return null
  const existing = validatedRequests.find((candidate) => candidate?.idempotencyKey === validatedRequest.idempotencyKey)
  if (existing) return requestMatches(existing, validatedRequest) ? ledger : null
  if (validatedRequests.length >= 20 || validatedRequests.some((candidate) => candidate?.id === validatedRequest.id)) return null
  return {
    schema: STOREFRONT_REQUEST_LEDGER_SCHEMA,
    requests: [validatedRequest, ...validatedRequests as StorefrontOrderRequest[]],
  }
}
