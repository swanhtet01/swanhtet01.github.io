import type { CommerceItem } from '../../core/commerce-workspace.ts'
import {
  storefrontPreviewDigest,
  validateStorefrontPreview,
  type StorefrontPreview,
} from './storefront-model.ts'

export const ECOMMERCE_PIM_SCHEMA = 'supermega.ecommerce.pim_projection.v1' as const
export const ECOMMERCE_QUOTE_SCHEMA = 'supermega.ecommerce.checkout_quote.v1' as const
export const ECOMMERCE_REQUEST_SCHEMA_V2 = 'supermega.ecommerce.order_request.v2' as const
export const ECOMMERCE_SHOP_DRAFT_SCHEMA_V2 = 'supermega.ecommerce.shop_draft.v2' as const
export const ECOMMERCE_RETURN_INTENT_SCHEMA = 'supermega.ecommerce.return_intent.v1' as const
export const ECOMMERCE_BUYING_STATE_SCHEMA = 'supermega.ecommerce.buying_lifecycle.v1' as const
export const ECOMMERCE_BUYING_EVENT_SCHEMA = 'supermega.ecommerce.buying_event.v1' as const
export const ECOMMERCE_BUYING_STATE_KEY_PREFIX = 'supermega.ecommerce.buying_lifecycle.v1.'
export const EMPTY_ECOMMERCE_BUYING_DIGEST = `sha256:${'0'.repeat(64)}`

export type EcommercePaymentAdapter = 'pay_on_pickup' | 'cash_on_delivery' | 'kbzpay_manual'
export type EcommerceFulfilment = 'pickup' | 'delivery'
export type EcommerceReturnDisposition = 'restock' | 'not_restocked'

export type EcommercePimItem = {
  sku: string
  name: string
  variant: string | null
  unitPriceMmk: number
  availability: 'available' | 'sold_out'
}

export type EcommercePimProjection = {
  schema: typeof ECOMMERCE_PIM_SCHEMA
  scope: string
  sourcePreviewDigest: string
  items: EcommercePimItem[]
  pimDigest: string
}

export type EcommerceCartLine = {
  sku: string
  quantity: number
}

export type EcommerceQuoteLine = {
  sku: string
  name: string
  variant: string | null
  quantity: number
  unitPriceMmk: number
  lineTotalMmk: number
}

export type EcommerceCheckoutQuote = {
  schema: typeof ECOMMERCE_QUOTE_SCHEMA
  scope: string
  quoteId: string
  idempotencyKey: string
  quotedAt: string
  expiresAt: string
  sourcePreviewDigest: string
  pimDigest: string
  currency: 'MMK'
  customerReference: string
  fulfilment: EcommerceFulfilment
  lines: EcommerceQuoteLine[]
  subtotalMmk: number
  promotion: {
    adapter: 'shop_promotion_review'
    status: 'not_requested' | 'pending_shop_review'
    code: string | null
    amountMmk: 0
  }
  tax: {
    adapter: 'price_inclusive'
    status: 'included'
    amountMmk: 0
  }
  shipping: {
    adapter: 'pickup' | 'shop_delivery_review'
    status: 'included' | 'pending_shop_review'
    amountMmk: 0
  }
  payment: {
    adapter: EcommercePaymentAdapter
    status: 'not_authorized'
    amountMmk: 0
  }
  totalMmk: number
  quoteDigest: string
}

export type EcommerceOrderRequestV2 = {
  schema: typeof ECOMMERCE_REQUEST_SCHEMA_V2
  mode: 'browser-local-request'
  state: 'pending_shop_review'
  scope: string
  id: string
  idempotencyKey: string
  createdAt: string
  sourcePreviewDigest: string
  sourceStorefrontRevision: number | null
  sourceStorefrontActionId: string | null
  customerReference: string
  fulfilment: EcommerceFulfilment
  currency: 'MMK'
  lines: EcommerceQuoteLine[]
  quote: EcommerceCheckoutQuote
  totalMmk: number
}

export type EcommerceShopDraftV2 = {
  schema: typeof ECOMMERCE_SHOP_DRAFT_SCHEMA_V2
  mode: 'browser-memory-shop-draft'
  state: 'review_required'
  id: string
  sourceRequestId: string
  sourcePreviewDigest: string
  quoteDigest: string
  quoteExpiresAt: string
  createdAt: string
  confirmedAt: string
  customerReference: string
  fulfilment: EcommerceFulfilment
  currency: 'MMK'
  lines: EcommerceQuoteLine[]
  pricing: {
    subtotalMmk: number
    promotion: EcommerceCheckoutQuote['promotion']
    tax: EcommerceCheckoutQuote['tax']
    shipping: EcommerceCheckoutQuote['shipping']
    payment: EcommerceCheckoutQuote['payment']
    totalMmk: number
  }
  totalMmk: number
  evidenceReference: string
}

export type EcommerceReturnIntent = {
  schema: typeof ECOMMERCE_RETURN_INTENT_SCHEMA
  state: 'pending_shop_review'
  scope: string
  id: string
  idempotencyKey: string
  createdAt: string
  orderId: string
  sourceRequestId: string
  sku: string
  quantity: number
  disposition: EcommerceReturnDisposition
  reason: string
  refundStatus: 'not_started'
  evidenceReference: string
}

export type EcommerceBuyingEvent = {
  schema: typeof ECOMMERCE_BUYING_EVENT_SCHEMA
  sequence: number
  action: 'request_recorded' | 'return_intent_recorded'
  subjectId: string
  idempotencyKey: string
  payloadDigest: string
  previousDigest: string
  eventDigest: string
}

export type EcommerceBuyingState = {
  schema: typeof ECOMMERCE_BUYING_STATE_SCHEMA
  scope: string
  revision: number
  headDigest: string
  requests: EcommerceOrderRequestV2[]
  returnIntents: EcommerceReturnIntent[]
  events: EcommerceBuyingEvent[]
}

export type EcommerceBuyingReadResult = {
  status: 'empty' | 'ready' | 'invalid' | 'unavailable'
  state: EcommerceBuyingState | null
  error: string
}

export type EcommerceBuyingStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

export type EcommerceBuyingLocks = {
  request: <T>(
    name: string,
    options: { mode: 'exclusive' },
    callback: () => T | Promise<T>,
  ) => Promise<T>
}

const digestPattern = /^sha256:[0-9a-f]{64}$/
const tokenPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,179}$/
const uuidPattern = '[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}'
const quoteIdPattern = new RegExp(`^ECQ-${uuidPattern}$`)
const requestIdPattern = new RegExp(`^ECR-${uuidPattern}$`)
const checkoutKeyPattern = new RegExp(`^ECI-${uuidPattern}$`)
const returnIdPattern = new RegExp(`^ERR-${uuidPattern}$`)
const returnKeyPattern = new RegExp(`^ERI-${uuidPattern}$`)
const timestampPattern = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])$/
const paymentAdapters: EcommercePaymentAdapter[] = ['cash_on_delivery', 'kbzpay_manual', 'pay_on_pickup']
const fulfilmentMethods: EcommerceFulfilment[] = ['delivery', 'pickup']
const returnDispositions: EcommerceReturnDisposition[] = ['not_restocked', 'restock']
const maxSafeInteger = Number.MAX_SAFE_INTEGER
const maxLines = 20
const maxQuantity = 99
const maxRecords = 100

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function exactObject(value: unknown, field: string, keys: string[]) {
  if (!isRecord(value)) throw new Error(`${field} must be an object.`)
  const actual = Object.keys(value)
  if (actual.length !== keys.length || !keys.every((key) => actual.includes(key))) {
    throw new Error(`${field} fields do not match the contract.`)
  }
  return value
}

function canonicalText(value: unknown, field: string, maximum = 240, allowBlank = false) {
  if (typeof value !== 'string'
    || value !== value.trim()
    || (!allowBlank && !value)
    || value.normalize('NFC') !== value
    || Array.from(value).some((character) => {
      const code = character.charCodeAt(0)
      return code <= 31 || code === 127
    })
    || value.length > maximum) {
    throw new Error(`${field} must be canonical visible text of at most ${maximum} characters.`)
  }
  return value
}

function optionalText(value: unknown, field: string, maximum: number) {
  return value === null ? null : canonicalText(value, field, maximum)
}

function canonicalToken(value: unknown, field: string) {
  const candidate = canonicalText(value, field, 180)
  if (!tokenPattern.test(candidate)) throw new Error(`${field} must be a canonical token.`)
  return candidate
}

function safeInteger(value: unknown, field: string, minimum = 0, maximum = maxSafeInteger) {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`${field} must be a supported integer.`)
  }
  return Number(value)
}

function canonicalDigest(value: unknown, field: string) {
  const candidate = canonicalText(value, field, 71)
  if (!digestPattern.test(candidate)) throw new Error(`${field} must be a SHA-256 digest.`)
  return candidate
}

function canonicalTimestamp(value: unknown, field: string) {
  const candidate = canonicalText(value, field, 40)
  if (!timestampPattern.test(candidate) || !Number.isFinite(Date.parse(candidate))) {
    throw new Error(`${field} must be a real ISO timestamp with an explicit offset.`)
  }
  return candidate
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, nested]) => [key, canonicalValue(nested)]),
    )
  }
  return value
}

function canonicalJson(value: unknown) {
  const serialized = JSON.stringify(canonicalValue(value))
  if (typeof serialized !== 'string') throw new Error('Ecommerce lifecycle evidence is not canonical JSON.')
  return serialized
}

function canonicalCopy<T>(value: T): T {
  return JSON.parse(canonicalJson(value)) as T
}

export async function ecommerceLifecycleDigest(value: unknown) {
  if (!globalThis.crypto?.subtle) throw new Error('Secure SHA-256 is unavailable.')
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value)))
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function browserStorage(): EcommerceBuyingStorage | undefined {
  try {
    return globalThis.localStorage as EcommerceBuyingStorage | undefined
  } catch {
    return undefined
  }
}

function browserLocks(): EcommerceBuyingLocks | undefined {
  try {
    const locks = globalThis.navigator?.locks as EcommerceBuyingLocks | undefined
    return typeof locks?.request === 'function' ? locks : undefined
  } catch {
    return undefined
  }
}

export function ecommerceBuyingStateStorageKey(scope: string) {
  return `${ECOMMERCE_BUYING_STATE_KEY_PREFIX}${encodeURIComponent(canonicalToken(scope, 'scope'))}`
}

function pimItem(value: unknown, field: string): EcommercePimItem {
  const source = exactObject(value, field, ['sku', 'name', 'variant', 'unitPriceMmk', 'availability'])
  if (source.availability !== 'available' && source.availability !== 'sold_out') {
    throw new Error(`${field}.availability is unsupported.`)
  }
  return {
    sku: canonicalToken(source.sku, `${field}.sku`),
    name: canonicalText(source.name, `${field}.name`, 180),
    variant: optionalText(source.variant, `${field}.variant`, 180),
    unitPriceMmk: safeInteger(source.unitPriceMmk, `${field}.unitPriceMmk`, 1),
    availability: source.availability,
  }
}

export async function buildEcommercePimProjection(
  scope: string,
  sourcePreviewDigest: string,
  previewValue: StorefrontPreview,
): Promise<EcommercePimProjection> {
  const preview = validateStorefrontPreview(previewValue)
  const canonicalSourceDigest = canonicalDigest(sourcePreviewDigest, 'sourcePreviewDigest')
  if (await storefrontPreviewDigest(preview) !== canonicalSourceDigest) {
    throw new Error('Storefront preview digest is stale or invalid.')
  }
  const core = {
    schema: ECOMMERCE_PIM_SCHEMA,
    scope: canonicalToken(scope, 'scope'),
    sourcePreviewDigest: canonicalSourceDigest,
    items: preview.items.map((item) => pimItem({
      sku: item.sku,
      name: item.name,
      variant: item.variant,
      unitPriceMmk: item.unitPriceMmk,
      availability: item.availability,
    }, `items.${item.sku}`)).sort((left, right) => left.sku.localeCompare(right.sku)),
  }
  if (new Set(core.items.map((item) => item.sku)).size !== core.items.length) {
    throw new Error('PIM item SKUs must be unique.')
  }
  return { ...core, pimDigest: await ecommerceLifecycleDigest(core) }
}

export async function validateEcommercePimProjection(value: unknown): Promise<EcommercePimProjection> {
  const source = exactObject(value, 'PIM projection', ['schema', 'scope', 'sourcePreviewDigest', 'items', 'pimDigest'])
  if (source.schema !== ECOMMERCE_PIM_SCHEMA || !Array.isArray(source.items) || source.items.length < 1 || source.items.length > 100) {
    throw new Error('PIM projection contract is invalid.')
  }
  const items = source.items.map((item, index) => pimItem(item, `PIM projection.items[${index}]`))
  if (items.some((item, index) => index > 0 && items[index - 1].sku >= item.sku)) {
    throw new Error('PIM projection items must use unique canonical SKU order.')
  }
  const core = {
    schema: ECOMMERCE_PIM_SCHEMA,
    scope: canonicalToken(source.scope, 'PIM projection.scope'),
    sourcePreviewDigest: canonicalDigest(source.sourcePreviewDigest, 'PIM projection.sourcePreviewDigest'),
    items,
  }
  const digest = canonicalDigest(source.pimDigest, 'PIM projection.pimDigest')
  if (await ecommerceLifecycleDigest(core) !== digest) throw new Error('PIM projection digest is invalid.')
  return { ...core, pimDigest: digest }
}

function quoteLine(value: unknown, field: string): EcommerceQuoteLine {
  const source = exactObject(value, field, ['sku', 'name', 'variant', 'quantity', 'unitPriceMmk', 'lineTotalMmk'])
  const quantity = safeInteger(source.quantity, `${field}.quantity`, 1, maxQuantity)
  const unitPriceMmk = safeInteger(source.unitPriceMmk, `${field}.unitPriceMmk`, 1)
  const lineTotalMmk = safeInteger(source.lineTotalMmk, `${field}.lineTotalMmk`, 1)
  if (lineTotalMmk !== quantity * unitPriceMmk) throw new Error(`${field}.lineTotalMmk is invalid.`)
  return {
    sku: canonicalToken(source.sku, `${field}.sku`),
    name: canonicalText(source.name, `${field}.name`, 180),
    variant: optionalText(source.variant, `${field}.variant`, 180),
    quantity,
    unitPriceMmk,
    lineTotalMmk,
  }
}

function quoteCore(value: unknown): Omit<EcommerceCheckoutQuote, 'quoteDigest'> {
  const source = exactObject(value, 'checkout quote', [
    'schema', 'scope', 'quoteId', 'idempotencyKey', 'quotedAt', 'expiresAt',
    'sourcePreviewDigest', 'pimDigest', 'currency', 'customerReference', 'fulfilment',
    'lines', 'subtotalMmk', 'promotion', 'tax', 'shipping', 'payment', 'totalMmk',
  ])
  const quoteId = canonicalText(source.quoteId, 'checkout quote.quoteId', 40)
  const idempotencyKey = canonicalText(source.idempotencyKey, 'checkout quote.idempotencyKey', 40)
  if (!quoteIdPattern.test(quoteId)
    || !checkoutKeyPattern.test(idempotencyKey)
    || quoteId.slice(4) !== idempotencyKey.slice(4)) throw new Error('Checkout quote identity is invalid.')
  const quotedAt = canonicalTimestamp(source.quotedAt, 'checkout quote.quotedAt')
  const expiresAt = canonicalTimestamp(source.expiresAt, 'checkout quote.expiresAt')
  const duration = Date.parse(expiresAt) - Date.parse(quotedAt)
  if (duration <= 0 || duration > 30 * 60 * 1000) throw new Error('Checkout quote expiry is invalid.')
  if (!fulfilmentMethods.includes(source.fulfilment as EcommerceFulfilment)) throw new Error('Checkout fulfilment is unsupported.')
  if (!Array.isArray(source.lines) || source.lines.length < 1 || source.lines.length > maxLines) {
    throw new Error('Checkout quote lines are invalid.')
  }
  const lines = source.lines.map((line, index) => quoteLine(line, `checkout quote.lines[${index}]`))
  if (lines.some((line, index) => index > 0 && lines[index - 1].sku >= line.sku)) {
    throw new Error('Checkout quote lines must use unique canonical SKU order.')
  }
  const subtotalMmk = safeInteger(source.subtotalMmk, 'checkout quote.subtotalMmk', 1)
  if (subtotalMmk !== lines.reduce((total, line) => total + line.lineTotalMmk, 0)) {
    throw new Error('Checkout quote subtotal is invalid.')
  }
  const promotion = exactObject(source.promotion, 'checkout quote.promotion', ['adapter', 'status', 'code', 'amountMmk'])
  const promotionCode = optionalText(promotion.code, 'checkout quote.promotion.code', 40)
  const promotionStatus = promotionCode ? 'pending_shop_review' : 'not_requested'
  if (promotion.adapter !== 'shop_promotion_review' || promotion.status !== promotionStatus || promotion.amountMmk !== 0) {
    throw new Error('Checkout promotion boundary is invalid.')
  }
  const tax = exactObject(source.tax, 'checkout quote.tax', ['adapter', 'status', 'amountMmk'])
  if (tax.adapter !== 'price_inclusive' || tax.status !== 'included' || tax.amountMmk !== 0) {
    throw new Error('Checkout tax boundary is invalid.')
  }
  const fulfilment = source.fulfilment as EcommerceFulfilment
  const shipping = exactObject(source.shipping, 'checkout quote.shipping', ['adapter', 'status', 'amountMmk'])
  const expectedShipping = fulfilment === 'pickup'
    ? { adapter: 'pickup', status: 'included', amountMmk: 0 }
    : { adapter: 'shop_delivery_review', status: 'pending_shop_review', amountMmk: 0 }
  if (canonicalJson(shipping) !== canonicalJson(expectedShipping)) throw new Error('Checkout shipping boundary is invalid.')
  const payment = exactObject(source.payment, 'checkout quote.payment', ['adapter', 'status', 'amountMmk'])
  if (!paymentAdapters.includes(payment.adapter as EcommercePaymentAdapter)
    || payment.status !== 'not_authorized'
    || payment.amountMmk !== 0) throw new Error('Checkout payment boundary is invalid.')
  const totalMmk = safeInteger(source.totalMmk, 'checkout quote.totalMmk', 1)
  if (totalMmk !== subtotalMmk) throw new Error('Checkout total must remain the product subtotal until Shop review.')
  if (source.currency !== 'MMK') throw new Error('Checkout currency must be MMK.')
  return {
    schema: ECOMMERCE_QUOTE_SCHEMA,
    scope: canonicalToken(source.scope, 'checkout quote.scope'),
    quoteId,
    idempotencyKey,
    quotedAt,
    expiresAt,
    sourcePreviewDigest: canonicalDigest(source.sourcePreviewDigest, 'checkout quote.sourcePreviewDigest'),
    pimDigest: canonicalDigest(source.pimDigest, 'checkout quote.pimDigest'),
    currency: 'MMK',
    customerReference: canonicalText(source.customerReference, 'checkout quote.customerReference', 80),
    fulfilment,
    lines,
    subtotalMmk,
    promotion: {
      adapter: 'shop_promotion_review',
      status: promotionStatus,
      code: promotionCode,
      amountMmk: 0,
    },
    tax: { adapter: 'price_inclusive', status: 'included', amountMmk: 0 },
    shipping: expectedShipping as EcommerceCheckoutQuote['shipping'],
    payment: {
      adapter: payment.adapter as EcommercePaymentAdapter,
      status: 'not_authorized',
      amountMmk: 0,
    },
    totalMmk,
  }
}

export async function buildEcommerceCheckoutQuote(input: {
  pim: EcommercePimProjection
  cart: EcommerceCartLine[]
  customerReference: string
  fulfilment: EcommerceFulfilment
  paymentAdapter: EcommercePaymentAdapter
  promotionCode: string | null
  idempotencyKey: string
  quotedAt: string
  expiresAt: string
}): Promise<EcommerceCheckoutQuote> {
  const pim = await validateEcommercePimProjection(input.pim)
  const key = canonicalText(input.idempotencyKey, 'idempotencyKey', 40)
  if (!checkoutKeyPattern.test(key)) throw new Error('Checkout idempotency key is invalid.')
  if (!fulfilmentMethods.includes(input.fulfilment)) throw new Error('Checkout fulfilment is unsupported.')
  if (!paymentAdapters.includes(input.paymentAdapter)) throw new Error('Checkout payment adapter is unsupported.')
  const code = optionalText(input.promotionCode, 'promotionCode', 40)
  if (!Array.isArray(input.cart) || input.cart.length < 1 || input.cart.length > maxLines) throw new Error('Cart is empty or too large.')
  const quantities = new Map<string, number>()
  input.cart.forEach((candidate, index) => {
    const row = exactObject(candidate, `cart[${index}]`, ['sku', 'quantity'])
    const sku = canonicalToken(row.sku, `cart[${index}].sku`)
    if (quantities.has(sku)) throw new Error('Cart SKUs must be unique.')
    quantities.set(sku, safeInteger(row.quantity, `cart[${index}].quantity`, 1, maxQuantity))
  })
  const itemBySku = new Map(pim.items.map((item) => [item.sku, item]))
  const lines = [...quantities.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([sku, quantity]) => {
    const item = itemBySku.get(sku)
    if (!item) throw new Error(`Cart SKU ${sku} is not in the PIM projection.`)
    if (item.availability !== 'available') throw new Error(`Cart SKU ${sku} is sold out.`)
    const lineTotalMmk = item.unitPriceMmk * quantity
    if (!Number.isSafeInteger(lineTotalMmk)) throw new Error('Cart line exceeds the supported whole-MMK range.')
    return {
      sku,
      name: item.name,
      variant: item.variant,
      quantity,
      unitPriceMmk: item.unitPriceMmk,
      lineTotalMmk,
    }
  })
  const subtotalMmk = lines.reduce((total, line) => total + line.lineTotalMmk, 0)
  if (!Number.isSafeInteger(subtotalMmk)) throw new Error('Cart exceeds the supported whole-MMK range.')
  const core = quoteCore({
    schema: ECOMMERCE_QUOTE_SCHEMA,
    scope: pim.scope,
    quoteId: `ECQ-${key.slice(4)}`,
    idempotencyKey: key,
    quotedAt: input.quotedAt,
    expiresAt: input.expiresAt,
    sourcePreviewDigest: pim.sourcePreviewDigest,
    pimDigest: pim.pimDigest,
    currency: 'MMK',
    customerReference: input.customerReference,
    fulfilment: input.fulfilment,
    lines,
    subtotalMmk,
    promotion: {
      adapter: 'shop_promotion_review',
      status: code ? 'pending_shop_review' : 'not_requested',
      code,
      amountMmk: 0,
    },
    tax: { adapter: 'price_inclusive', status: 'included', amountMmk: 0 },
    shipping: input.fulfilment === 'pickup'
      ? { adapter: 'pickup', status: 'included', amountMmk: 0 }
      : { adapter: 'shop_delivery_review', status: 'pending_shop_review', amountMmk: 0 },
    payment: { adapter: input.paymentAdapter, status: 'not_authorized', amountMmk: 0 },
    totalMmk: subtotalMmk,
  })
  return { ...core, quoteDigest: await ecommerceLifecycleDigest(core) }
}

export async function validateEcommerceCheckoutQuote(value: unknown): Promise<EcommerceCheckoutQuote> {
  const source = exactObject(value, 'checkout quote', [
    'schema', 'scope', 'quoteId', 'idempotencyKey', 'quotedAt', 'expiresAt',
    'sourcePreviewDigest', 'pimDigest', 'currency', 'customerReference', 'fulfilment',
    'lines', 'subtotalMmk', 'promotion', 'tax', 'shipping', 'payment', 'totalMmk', 'quoteDigest',
  ])
  const { quoteDigest: rawDigest, ...rawCore } = source
  const core = quoteCore(rawCore)
  const quoteDigest = canonicalDigest(rawDigest, 'checkout quote.quoteDigest')
  if (await ecommerceLifecycleDigest(core) !== quoteDigest) throw new Error('Checkout quote digest is invalid.')
  return { ...core, quoteDigest }
}

export async function buildEcommerceOrderRequestV2(
  quoteValue: EcommerceCheckoutQuote,
  sourceStorefront: { revision: number; actionId: string } | null = null,
): Promise<EcommerceOrderRequestV2> {
  const quote = await validateEcommerceCheckoutQuote(quoteValue)
  const request: EcommerceOrderRequestV2 = {
    schema: ECOMMERCE_REQUEST_SCHEMA_V2,
    mode: 'browser-local-request',
    state: 'pending_shop_review',
    scope: quote.scope,
    id: `ECR-${quote.idempotencyKey.slice(4)}`,
    idempotencyKey: quote.idempotencyKey,
    createdAt: quote.quotedAt,
    sourcePreviewDigest: quote.sourcePreviewDigest,
    sourceStorefrontRevision: sourceStorefront ? safeInteger(sourceStorefront.revision, 'sourceStorefront.revision', 1) : null,
    sourceStorefrontActionId: sourceStorefront ? canonicalToken(sourceStorefront.actionId, 'sourceStorefront.actionId') : null,
    customerReference: quote.customerReference,
    fulfilment: quote.fulfilment,
    currency: 'MMK',
    lines: canonicalCopy(quote.lines),
    quote,
    totalMmk: quote.totalMmk,
  }
  return validateEcommerceOrderRequestV2(request)
}

export async function validateEcommerceOrderRequestV2(value: unknown): Promise<EcommerceOrderRequestV2> {
  const source = exactObject(value, 'Ecommerce request', [
    'schema', 'mode', 'state', 'scope', 'id', 'idempotencyKey', 'createdAt',
    'sourcePreviewDigest', 'sourceStorefrontRevision', 'sourceStorefrontActionId',
    'customerReference', 'fulfilment', 'currency', 'lines', 'quote', 'totalMmk',
  ])
  if (source.schema !== ECOMMERCE_REQUEST_SCHEMA_V2
    || source.mode !== 'browser-local-request'
    || source.state !== 'pending_shop_review') throw new Error('Ecommerce request boundary is invalid.')
  const id = canonicalText(source.id, 'Ecommerce request.id', 40)
  const idempotencyKey = canonicalText(source.idempotencyKey, 'Ecommerce request.idempotencyKey', 40)
  if (!requestIdPattern.test(id)
    || !checkoutKeyPattern.test(idempotencyKey)
    || id.slice(4) !== idempotencyKey.slice(4)) throw new Error('Ecommerce request identity is invalid.')
  const quote = await validateEcommerceCheckoutQuote(source.quote)
  if (!Array.isArray(source.lines) || source.lines.length < 1 || source.lines.length > maxLines) throw new Error('Ecommerce request lines are invalid.')
  const lines = source.lines.map((line, index) => quoteLine(line, `Ecommerce request.lines[${index}]`))
  const revision = source.sourceStorefrontRevision === null
    ? null
    : safeInteger(source.sourceStorefrontRevision, 'sourceStorefrontRevision', 1)
  const actionId = source.sourceStorefrontActionId === null
    ? null
    : canonicalToken(source.sourceStorefrontActionId, 'sourceStorefrontActionId')
  if ((revision === null) !== (actionId === null)) throw new Error('Ecommerce request storefront provenance is incomplete.')
  const request: EcommerceOrderRequestV2 = {
    schema: ECOMMERCE_REQUEST_SCHEMA_V2,
    mode: 'browser-local-request',
    state: 'pending_shop_review',
    scope: canonicalToken(source.scope, 'Ecommerce request.scope'),
    id,
    idempotencyKey,
    createdAt: canonicalTimestamp(source.createdAt, 'Ecommerce request.createdAt'),
    sourcePreviewDigest: canonicalDigest(source.sourcePreviewDigest, 'Ecommerce request.sourcePreviewDigest'),
    sourceStorefrontRevision: revision,
    sourceStorefrontActionId: actionId,
    customerReference: canonicalText(source.customerReference, 'Ecommerce request.customerReference', 80),
    fulfilment: source.fulfilment as EcommerceFulfilment,
    currency: source.currency as 'MMK',
    lines,
    quote,
    totalMmk: safeInteger(source.totalMmk, 'Ecommerce request.totalMmk', 1),
  }
  if (request.scope !== quote.scope
    || request.createdAt !== quote.quotedAt
    || request.idempotencyKey !== quote.idempotencyKey
    || request.sourcePreviewDigest !== quote.sourcePreviewDigest
    || request.customerReference !== quote.customerReference
    || request.fulfilment !== quote.fulfilment
    || request.currency !== 'MMK'
    || canonicalJson(request.lines) !== canonicalJson(quote.lines)
    || request.totalMmk !== quote.totalMmk) throw new Error('Ecommerce request does not preserve its exact quote.')
  return request
}

export function createEmptyEcommerceBuyingState(scope: string): EcommerceBuyingState {
  return {
    schema: ECOMMERCE_BUYING_STATE_SCHEMA,
    scope: canonicalToken(scope, 'scope'),
    revision: 0,
    headDigest: EMPTY_ECOMMERCE_BUYING_DIGEST,
    requests: [],
    returnIntents: [],
    events: [],
  }
}

async function validateBuyingEvent(value: unknown, field: string): Promise<EcommerceBuyingEvent> {
  const source = exactObject(value, field, [
    'schema', 'sequence', 'action', 'subjectId', 'idempotencyKey', 'payloadDigest',
    'previousDigest', 'eventDigest',
  ])
  if (source.schema !== ECOMMERCE_BUYING_EVENT_SCHEMA
    || source.action !== 'request_recorded' && source.action !== 'return_intent_recorded') {
    throw new Error(`${field} boundary is invalid.`)
  }
  const core = {
    schema: ECOMMERCE_BUYING_EVENT_SCHEMA,
    sequence: safeInteger(source.sequence, `${field}.sequence`, 1),
    action: source.action,
    subjectId: canonicalToken(source.subjectId, `${field}.subjectId`),
    idempotencyKey: canonicalText(source.idempotencyKey, `${field}.idempotencyKey`, 40),
    payloadDigest: canonicalDigest(source.payloadDigest, `${field}.payloadDigest`),
    previousDigest: canonicalDigest(source.previousDigest, `${field}.previousDigest`),
  } as Omit<EcommerceBuyingEvent, 'eventDigest'>
  const eventDigest = canonicalDigest(source.eventDigest, `${field}.eventDigest`)
  if (await ecommerceLifecycleDigest(core) !== eventDigest) throw new Error(`${field}.eventDigest is invalid.`)
  return { ...core, eventDigest }
}

export async function validateEcommerceBuyingState(value: unknown, expectedScope?: string): Promise<EcommerceBuyingState> {
  const source = exactObject(value, 'buying state', [
    'schema', 'scope', 'revision', 'headDigest', 'requests', 'returnIntents', 'events',
  ])
  if (source.schema !== ECOMMERCE_BUYING_STATE_SCHEMA
    || !Array.isArray(source.requests)
    || !Array.isArray(source.returnIntents)
    || !Array.isArray(source.events)
    || source.requests.length > maxRecords
    || source.returnIntents.length > maxRecords
    || source.events.length > maxRecords * 2) throw new Error('Buying state contract is invalid.')
  const scope = canonicalToken(source.scope, 'buying state.scope')
  if (expectedScope && scope !== canonicalToken(expectedScope, 'expectedScope')) throw new Error('Buying state belongs to a different workspace.')
  const requests = await Promise.all(source.requests.map((request) => validateEcommerceOrderRequestV2(request)))
  const returnIntents = source.returnIntents.map((intent) => validateEcommerceReturnIntent(intent))
  const events = await Promise.all(source.events.map((event, index) => validateBuyingEvent(event, `buying state.events[${index}]`)))
  const revision = safeInteger(source.revision, 'buying state.revision')
  if (revision !== events.length) throw new Error('Buying state revision does not match its history.')
  let previousDigest = EMPTY_ECOMMERCE_BUYING_DIGEST
  events.forEach((event, index) => {
    if (event.sequence !== index + 1 || event.previousDigest !== previousDigest) throw new Error('Buying state event chain is invalid.')
    previousDigest = event.eventDigest
  })
  const headDigest = canonicalDigest(source.headDigest, 'buying state.headDigest')
  if (headDigest !== previousDigest) throw new Error('Buying state head digest is invalid.')
  const records: Array<EcommerceOrderRequestV2 | EcommerceReturnIntent> = [...requests, ...returnIntents]
  if (records.some((record) => record.scope !== scope)
    || new Set(records.map((record) => record.id)).size !== records.length
    || new Set(records.map((record) => record.idempotencyKey)).size !== records.length
    || events.length !== records.length) throw new Error('Buying state records are not unique and scope-bound.')
  const byId = new Map(records.map((record) => [record.id, record]))
  for (const event of events) {
    const record = byId.get(event.subjectId)
    if (!record
      || record.idempotencyKey !== event.idempotencyKey
      || await ecommerceLifecycleDigest(record) !== event.payloadDigest) throw new Error('Buying event does not match its record.')
  }
  return { schema: ECOMMERCE_BUYING_STATE_SCHEMA, scope, revision, headDigest, requests, returnIntents, events }
}

async function appendBuyingRecord(
  stateValue: EcommerceBuyingState,
  record: EcommerceOrderRequestV2 | EcommerceReturnIntent,
  collection: 'requests' | 'returnIntents',
  action: EcommerceBuyingEvent['action'],
  expectedHeadDigest: string,
) {
  const state = await validateEcommerceBuyingState(stateValue)
  if (canonicalDigest(expectedHeadDigest, 'expectedHeadDigest') !== state.headDigest) throw new Error('Buying state changed before this record was applied.')
  if (record.scope !== state.scope) throw new Error('Buying record belongs to a different workspace.')
  const allRecords: Array<EcommerceOrderRequestV2 | EcommerceReturnIntent> = [...state.requests, ...state.returnIntents]
  const existing = allRecords.find((candidate) => candidate.id === record.id || candidate.idempotencyKey === record.idempotencyKey)
  if (existing) {
    if (canonicalJson(existing) !== canonicalJson(record)) throw new Error('Buying idempotency key conflicts with a different record.')
    return state
  }
  if (state[collection].length >= maxRecords) throw new Error('Buying record limit is reached.')
  const core: Omit<EcommerceBuyingEvent, 'eventDigest'> = {
    schema: ECOMMERCE_BUYING_EVENT_SCHEMA,
    sequence: state.revision + 1,
    action,
    subjectId: record.id,
    idempotencyKey: record.idempotencyKey,
    payloadDigest: await ecommerceLifecycleDigest(record),
    previousDigest: state.headDigest,
  }
  const event: EcommerceBuyingEvent = { ...core, eventDigest: await ecommerceLifecycleDigest(core) }
  const next = {
    ...state,
    revision: state.revision + 1,
    headDigest: event.eventDigest,
    [collection]: [record, ...state[collection]],
    events: [...state.events, event],
  } as EcommerceBuyingState
  return validateEcommerceBuyingState(next)
}

export async function recordEcommerceOrderRequestV2(
  state: EcommerceBuyingState,
  requestValue: EcommerceOrderRequestV2,
  expectedHeadDigest: string,
) {
  const request = await validateEcommerceOrderRequestV2(requestValue)
  return appendBuyingRecord(state, request, 'requests', 'request_recorded', expectedHeadDigest)
}

export function validateEcommerceReturnIntent(value: unknown): EcommerceReturnIntent {
  const source = exactObject(value, 'return intent', [
    'schema', 'state', 'scope', 'id', 'idempotencyKey', 'createdAt', 'orderId',
    'sourceRequestId', 'sku', 'quantity', 'disposition', 'reason', 'refundStatus', 'evidenceReference',
  ])
  const id = canonicalText(source.id, 'return intent.id', 40)
  const idempotencyKey = canonicalText(source.idempotencyKey, 'return intent.idempotencyKey', 40)
  const sourceRequestId = canonicalText(source.sourceRequestId, 'return intent.sourceRequestId', 40)
  const orderId = canonicalToken(source.orderId, 'return intent.orderId')
  const evidenceReference = `ECOMMERCE-RETURN:${idempotencyKey.slice(4)}:${orderId}:${sourceRequestId}`
  if (source.schema !== ECOMMERCE_RETURN_INTENT_SCHEMA
    || source.state !== 'pending_shop_review'
    || !returnIdPattern.test(id)
    || !returnKeyPattern.test(idempotencyKey)
    || id.slice(4) !== idempotencyKey.slice(4)
    || !requestIdPattern.test(sourceRequestId)
    || source.refundStatus !== 'not_started'
    || !returnDispositions.includes(source.disposition as EcommerceReturnDisposition)
    || source.evidenceReference !== evidenceReference) throw new Error('Return intent boundary is invalid.')
  return {
    schema: ECOMMERCE_RETURN_INTENT_SCHEMA,
    state: 'pending_shop_review',
    scope: canonicalToken(source.scope, 'return intent.scope'),
    id,
    idempotencyKey,
    createdAt: canonicalTimestamp(source.createdAt, 'return intent.createdAt'),
    orderId,
    sourceRequestId,
    sku: canonicalToken(source.sku, 'return intent.sku'),
    quantity: safeInteger(source.quantity, 'return intent.quantity', 1, maxQuantity),
    disposition: source.disposition as EcommerceReturnDisposition,
    reason: canonicalText(source.reason, 'return intent.reason', 300),
    refundStatus: 'not_started',
    evidenceReference,
  }
}

export async function recordEcommerceReturnIntent(
  state: EcommerceBuyingState,
  intentValue: EcommerceReturnIntent,
  expectedHeadDigest: string,
) {
  return appendBuyingRecord(state, validateEcommerceReturnIntent(intentValue), 'returnIntents', 'return_intent_recorded', expectedHeadDigest)
}

export async function readEcommerceBuyingState(
  scope: string,
  storage = browserStorage(),
): Promise<EcommerceBuyingReadResult> {
  const canonicalScope = canonicalToken(scope, 'scope')
  if (!storage) return { status: 'unavailable', state: null, error: 'Browser recovery is unavailable.' }
  let raw: string | null
  try {
    raw = storage.getItem(ecommerceBuyingStateStorageKey(canonicalScope))
  } catch {
    return { status: 'unavailable', state: null, error: 'Saved checkout recovery could not be read.' }
  }
  if (raw === null) return { status: 'empty', state: createEmptyEcommerceBuyingState(canonicalScope), error: '' }
  try {
    return { status: 'ready', state: await validateEcommerceBuyingState(JSON.parse(raw), canonicalScope), error: '' }
  } catch {
    return { status: 'invalid', state: null, error: 'Saved checkout recovery is invalid and was left unchanged.' }
  }
}

export async function saveEcommerceOrderRequestV2(
  scope: string,
  request: EcommerceOrderRequestV2,
  expectedHeadDigest: string,
  options: { storage?: EcommerceBuyingStorage; locks?: EcommerceBuyingLocks } = {},
) {
  const canonicalScope = canonicalToken(scope, 'scope')
  const storage = options.storage ?? browserStorage()
  const locks = options.locks ?? browserLocks()
  if (!storage) throw new Error('Browser recovery is unavailable. The quote receipt was not saved.')
  if (!locks) throw new Error('Safe browser locking is unavailable. The quote receipt was not saved.')
  const storageKey = ecommerceBuyingStateStorageKey(canonicalScope)
  return locks.request(`supermega:ecommerce:buying-lifecycle:${encodeURIComponent(canonicalScope)}`, { mode: 'exclusive' }, async () => {
    const currentRead = await readEcommerceBuyingState(canonicalScope, storage)
    if (!currentRead.state || currentRead.status === 'invalid' || currentRead.status === 'unavailable') {
      throw new Error(currentRead.error || 'Saved checkout recovery cannot be updated safely.')
    }
    const next = await recordEcommerceOrderRequestV2(currentRead.state, request, expectedHeadDigest)
    if (next === currentRead.state || canonicalJson(next) === canonicalJson(currentRead.state)) return next
    const previousRaw = storage.getItem(storageKey)
    const nextRaw = canonicalJson(next)
    try {
      storage.setItem(storageKey, nextRaw)
      if (storage.getItem(storageKey) !== nextRaw) throw new Error('Checkout recovery write could not be confirmed.')
      return next
    } catch (error) {
      try {
        if (previousRaw === null) storage.removeItem(storageKey)
        else storage.setItem(storageKey, previousRaw)
        if (storage.getItem(storageKey) !== previousRaw) throw new Error('rollback confirmation failed', { cause: error })
      } catch (rollbackError) {
        throw new Error('Checkout recovery write failed and rollback could not be confirmed. Stop and export local evidence.', { cause: rollbackError })
      }
      throw error instanceof Error
        ? error
        : new Error('Checkout recovery write failed. The previous value was restored.', { cause: error })
    }
  })
}

export function ecommerceBuyingStateContains(state: EcommerceBuyingState, request: EcommerceOrderRequestV2) {
  const matches = state.requests.filter((candidate) => candidate.id === request.id && candidate.idempotencyKey === request.idempotencyKey)
  return matches.length === 1 && canonicalJson(matches[0]) === canonicalJson(request)
}

function currentCatalogItem(value: CommerceItem) {
  return {
    sku: canonicalToken(value.sku, 'catalog.sku'),
    name: canonicalText(value.name, 'catalog.name', 180),
    variant: optionalText(value.variant ?? null, 'catalog.variant', 180),
    price: safeInteger(value.price, 'catalog.price', 1),
    onHand: safeInteger(value.onHand, 'catalog.onHand'),
  }
}

export async function prepareEcommerceShopDraftV2(input: {
  request: EcommerceOrderRequestV2
  state: EcommerceBuyingState
  currentCatalog: CommerceItem[]
  confirmedAt: string
}): Promise<EcommerceShopDraftV2> {
  const request = await validateEcommerceOrderRequestV2(input.request)
  const state = await validateEcommerceBuyingState(input.state, request.scope)
  if (!ecommerceBuyingStateContains(state, request)) throw new Error('The quote receipt is not the exact recovered Ecommerce record.')
  const confirmedAt = canonicalTimestamp(input.confirmedAt, 'confirmedAt')
  if (Date.parse(confirmedAt) < Date.parse(request.createdAt)) throw new Error('Shop handoff confirmation precedes the request.')
  if (Date.parse(confirmedAt) > Date.parse(request.quote.expiresAt)) throw new Error('Checkout quote expired before Shop review.')
  const catalog = input.currentCatalog.map(currentCatalogItem)
  const bySku = new Map(catalog.map((item) => [item.sku, item]))
  if (bySku.size !== catalog.length) throw new Error('Current Shop catalog SKUs must be unique.')
  request.lines.forEach((line) => {
    const item = bySku.get(line.sku)
    if (!item
      || item.name !== line.name
      || item.variant !== line.variant
      || item.price !== line.unitPriceMmk
      || item.onHand < line.quantity) throw new Error('A quoted item, variant, price, or availability changed.')
  })
  return {
    schema: ECOMMERCE_SHOP_DRAFT_SCHEMA_V2,
    mode: 'browser-memory-shop-draft',
    state: 'review_required',
    id: `ESD-${request.id.slice(4)}`,
    sourceRequestId: request.id,
    sourcePreviewDigest: request.sourcePreviewDigest,
    quoteDigest: request.quote.quoteDigest,
    quoteExpiresAt: request.quote.expiresAt,
    createdAt: request.createdAt,
    confirmedAt,
    customerReference: request.customerReference,
    fulfilment: request.fulfilment,
    currency: 'MMK',
    lines: canonicalCopy(request.lines),
    pricing: {
      subtotalMmk: request.quote.subtotalMmk,
      promotion: canonicalCopy(request.quote.promotion),
      tax: canonicalCopy(request.quote.tax),
      shipping: canonicalCopy(request.quote.shipping),
      payment: canonicalCopy(request.quote.payment),
      totalMmk: request.quote.totalMmk,
    },
    totalMmk: request.totalMmk,
    evidenceReference: `ECOMMERCE:${request.id}:${request.sourcePreviewDigest}:${request.quote.quoteDigest}`,
  }
}

export function ecommerceShopDraftV2MatchesCatalog(value: unknown, catalogValue: CommerceItem[]): value is EcommerceShopDraftV2 {
  try {
    const draft = validateEcommerceShopDraftV2(value)
    const catalog = catalogValue.map(currentCatalogItem)
    const bySku = new Map(catalog.map((item) => [item.sku, item]))
    if (bySku.size !== catalog.length) return false
    return draft.lines.every((line) => {
        const item = bySku.get(line.sku)
        return Boolean(item
          && item.name === line.name
          && item.variant === line.variant
          && item.price === line.unitPriceMmk
          && item.onHand >= line.quantity)
      })
  } catch {
    return false
  }
}

export function validateEcommerceShopDraftV2(value: unknown): EcommerceShopDraftV2 {
  const source = exactObject(value, 'Shop draft', [
    'schema', 'mode', 'state', 'id', 'sourceRequestId', 'sourcePreviewDigest',
    'quoteDigest', 'quoteExpiresAt', 'createdAt', 'confirmedAt', 'customerReference',
    'fulfilment', 'currency', 'lines', 'pricing', 'totalMmk', 'evidenceReference',
  ])
  if (source.schema !== ECOMMERCE_SHOP_DRAFT_SCHEMA_V2
    || source.mode !== 'browser-memory-shop-draft'
    || source.state !== 'review_required'
    || !Array.isArray(source.lines)
    || source.lines.length < 1
    || source.lines.length > maxLines) throw new Error('Shop draft boundary is invalid.')
  const sourceRequestId = canonicalText(source.sourceRequestId, 'Shop draft.sourceRequestId', 40)
  const id = canonicalText(source.id, 'Shop draft.id', 40)
  if (!requestIdPattern.test(sourceRequestId) || id !== `ESD-${sourceRequestId.slice(4)}`) {
    throw new Error('Shop draft identity is invalid.')
  }
  const sourcePreviewDigest = canonicalDigest(source.sourcePreviewDigest, 'Shop draft.sourcePreviewDigest')
  const quoteDigest = canonicalDigest(source.quoteDigest, 'Shop draft.quoteDigest')
  const createdAt = canonicalTimestamp(source.createdAt, 'Shop draft.createdAt')
  const confirmedAt = canonicalTimestamp(source.confirmedAt, 'Shop draft.confirmedAt')
  const quoteExpiresAt = canonicalTimestamp(source.quoteExpiresAt, 'Shop draft.quoteExpiresAt')
  if (Date.parse(createdAt) > Date.parse(confirmedAt) || Date.parse(confirmedAt) > Date.parse(quoteExpiresAt)) {
    throw new Error('Shop draft timing is invalid.')
  }
  const fulfilment = source.fulfilment
  if (!fulfilmentMethods.includes(fulfilment as EcommerceFulfilment)) throw new Error('Shop draft fulfilment is invalid.')
  if (source.currency !== 'MMK') throw new Error('Shop draft currency is invalid.')
  const lines = source.lines.map((line, index) => quoteLine(line, `Shop draft.lines[${index}]`))
  if (lines.some((line, index) => index > 0 && lines[index - 1].sku >= line.sku)) {
    throw new Error('Shop draft lines must use unique canonical SKU order.')
  }
  const productTotal = lines.reduce((total, line) => total + line.lineTotalMmk, 0)
  const pricing = exactObject(source.pricing, 'Shop draft.pricing', [
    'subtotalMmk', 'promotion', 'tax', 'shipping', 'payment', 'totalMmk',
  ])
  const subtotalMmk = safeInteger(pricing.subtotalMmk, 'Shop draft.pricing.subtotalMmk', 1)
  const totalMmk = safeInteger(source.totalMmk, 'Shop draft.totalMmk', 1)
  const pricingTotal = safeInteger(pricing.totalMmk, 'Shop draft.pricing.totalMmk', 1)
  if (subtotalMmk !== productTotal || totalMmk !== productTotal || pricingTotal !== productTotal) {
    throw new Error('Shop draft pricing total is invalid.')
  }
  const promotion = exactObject(pricing.promotion, 'Shop draft.pricing.promotion', ['adapter', 'status', 'code', 'amountMmk'])
  const promotionCode = optionalText(promotion.code, 'Shop draft.pricing.promotion.code', 40)
  const promotionStatus = promotionCode ? 'pending_shop_review' : 'not_requested'
  if (promotion.adapter !== 'shop_promotion_review' || promotion.status !== promotionStatus || promotion.amountMmk !== 0) {
    throw new Error('Shop draft promotion boundary is invalid.')
  }
  const tax = exactObject(pricing.tax, 'Shop draft.pricing.tax', ['adapter', 'status', 'amountMmk'])
  if (tax.adapter !== 'price_inclusive' || tax.status !== 'included' || tax.amountMmk !== 0) {
    throw new Error('Shop draft tax boundary is invalid.')
  }
  const shipping = exactObject(pricing.shipping, 'Shop draft.pricing.shipping', ['adapter', 'status', 'amountMmk'])
  const expectedShipping = fulfilment === 'pickup'
    ? { adapter: 'pickup', status: 'included', amountMmk: 0 }
    : { adapter: 'shop_delivery_review', status: 'pending_shop_review', amountMmk: 0 }
  if (canonicalJson(shipping) !== canonicalJson(expectedShipping)) throw new Error('Shop draft shipping boundary is invalid.')
  const payment = exactObject(pricing.payment, 'Shop draft.pricing.payment', ['adapter', 'status', 'amountMmk'])
  if (!paymentAdapters.includes(payment.adapter as EcommercePaymentAdapter)
    || payment.status !== 'not_authorized'
    || payment.amountMmk !== 0) throw new Error('Shop draft payment boundary is invalid.')
  const evidenceReference = `ECOMMERCE:${sourceRequestId}:${sourcePreviewDigest}:${quoteDigest}`
  if (source.evidenceReference !== evidenceReference) throw new Error('Shop draft evidence reference is invalid.')
  return {
    schema: ECOMMERCE_SHOP_DRAFT_SCHEMA_V2,
    mode: 'browser-memory-shop-draft',
    state: 'review_required',
    id,
    sourceRequestId,
    sourcePreviewDigest,
    quoteDigest,
    quoteExpiresAt,
    createdAt,
    confirmedAt,
    customerReference: canonicalText(source.customerReference, 'Shop draft.customerReference', 80),
    fulfilment: fulfilment as EcommerceFulfilment,
    currency: 'MMK',
    lines,
    pricing: {
      subtotalMmk,
      promotion: {
        adapter: 'shop_promotion_review',
        status: promotionStatus,
        code: promotionCode,
        amountMmk: 0,
      },
      tax: { adapter: 'price_inclusive', status: 'included', amountMmk: 0 },
      shipping: expectedShipping as EcommerceCheckoutQuote['shipping'],
      payment: {
        adapter: payment.adapter as EcommercePaymentAdapter,
        status: 'not_authorized',
        amountMmk: 0,
      },
      totalMmk: pricingTotal,
    },
    totalMmk,
    evidenceReference,
  }
}

export function ecommercePaymentLabel(adapter: EcommercePaymentAdapter) {
  if (adapter === 'cash_on_delivery') return 'Cash on delivery'
  if (adapter === 'kbzpay_manual') return 'KBZPay'
  return 'Cash'
}
