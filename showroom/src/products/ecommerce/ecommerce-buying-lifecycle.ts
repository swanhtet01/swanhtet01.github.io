import {
  commercePromotionDecision,
  commerceShippingDecision,
  commercePaymentDecision,
  type CommerceItem,
  type CommerceOrder,
  type CommercePromotionDecision,
  type CommercePromotionPolicy,
  type CommerceShippingDecision,
  type CommerceShippingPolicy,
  type CommercePaymentDecision,
  type CommercePaymentPolicy,
} from '../../core/commerce-workspace.ts'
import {
  storefrontPreviewDigest,
  validateStorefrontPreview,
  type StorefrontPreview,
} from './storefront-model.ts'

export const ECOMMERCE_PIM_SCHEMA = 'supermega.ecommerce.pim_projection.v1' as const
export const ECOMMERCE_QUOTE_SCHEMA = 'supermega.ecommerce.checkout_quote.v1' as const
export const ECOMMERCE_CUSTOMER_PROFILE_SCHEMA = 'supermega.ecommerce.customer_profile_snapshot.v1' as const
export const ECOMMERCE_DELIVERY_ADDRESS_SCHEMA = 'supermega.ecommerce.delivery_address_snapshot.v1' as const
export const ECOMMERCE_REQUEST_SCHEMA_V2 = 'supermega.ecommerce.order_request.v2' as const
export const ECOMMERCE_SHOP_DRAFT_SCHEMA_V6 = 'supermega.ecommerce.shop_draft.v6' as const
export const ECOMMERCE_SHOP_DRAFT_SCHEMA_V5 = ECOMMERCE_SHOP_DRAFT_SCHEMA_V6
export const ECOMMERCE_SHOP_DRAFT_SCHEMA_V4 = ECOMMERCE_SHOP_DRAFT_SCHEMA_V6
export const ECOMMERCE_SHOP_DRAFT_SCHEMA_V3 = ECOMMERCE_SHOP_DRAFT_SCHEMA_V6
export const ECOMMERCE_SHOP_DRAFT_SCHEMA_V2 = ECOMMERCE_SHOP_DRAFT_SCHEMA_V6
export const ECOMMERCE_RETURN_INTENT_SCHEMA = 'supermega.ecommerce.return_intent.v1' as const
export const ECOMMERCE_SUPPORT_INTENT_SCHEMA = 'supermega.ecommerce.support_intent.v1' as const
export const ECOMMERCE_BUYING_STATE_SCHEMA = 'supermega.ecommerce.buying_lifecycle.v1' as const
export const ECOMMERCE_BUYING_EVENT_SCHEMA = 'supermega.ecommerce.buying_event.v1' as const
export const ECOMMERCE_BUYING_STATE_KEY_PREFIX = 'supermega.ecommerce.buying_lifecycle.v1.'
export const EMPTY_ECOMMERCE_BUYING_DIGEST = `sha256:${'0'.repeat(64)}`

export type EcommercePaymentAdapter = 'pay_on_pickup' | 'cash_on_delivery' | 'kbzpay_manual'
export type EcommerceFulfilment = 'pickup' | 'delivery'
export type EcommerceReturnDisposition = 'restock' | 'not_restocked'
export type EcommerceSupportCategory = 'order_status' | 'delivery_issue' | 'payment_question' | 'item_issue' | 'other'

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

export type EcommerceCustomerProfileSnapshot = {
  schema: typeof ECOMMERCE_CUSTOMER_PROFILE_SCHEMA
  id: string
  revision: number
  name: string
  phone: string
  savedAt: string
  previousDigest: string | null
  profileDigest: string
}

export type EcommerceDeliveryAddressSnapshot = {
  schema: typeof ECOMMERCE_DELIVERY_ADDRESS_SCHEMA
  id: string
  revision: number
  line1: string
  township: string
  city: string
  instructions: string | null
  savedAt: string
  previousDigest: string | null
  addressDigest: string
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
  customerProfile?: EcommerceCustomerProfileSnapshot
  deliveryAddress?: EcommerceDeliveryAddressSnapshot | null
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
  customerProfile?: EcommerceCustomerProfileSnapshot
  deliveryAddress?: EcommerceDeliveryAddressSnapshot | null
  fulfilment: EcommerceFulfilment
  currency: 'MMK'
  lines: EcommerceQuoteLine[]
  quote: EcommerceCheckoutQuote
  totalMmk: number
}

export type EcommerceShopDraftV2 = {
  schema: typeof ECOMMERCE_SHOP_DRAFT_SCHEMA_V6
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
  customerProfile?: EcommerceCustomerProfileSnapshot
  deliveryAddress?: EcommerceDeliveryAddressSnapshot | null
  fulfilment: EcommerceFulfilment
  currency: 'MMK'
  operatingContext: {
    organizationScope: string
    operatingUnitLocationId: 'LOC-MAIN'
    sourceAuthority: 'ecommerce'
    targetAuthority: 'commerce'
    recordType: 'order_request'
    writePolicy: 'human_review_required'
  }
  lines: EcommerceQuoteLine[]
  pricing: {
    subtotalMmk: number
    promotion: CommercePromotionDecision
    tax: EcommerceCheckoutQuote['tax']
    shipping: CommerceShippingDecision
    payment: CommercePaymentDecision
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

export type EcommerceSupportIntent = {
  schema: typeof ECOMMERCE_SUPPORT_INTENT_SCHEMA
  state: 'pending_shop_review'
  scope: string
  id: string
  idempotencyKey: string
  createdAt: string
  orderId: string
  sourceRequestId: string
  category: EcommerceSupportCategory
  description: string
  externalMessageSent: false
  refundStarted: false
  evidenceReference: string
}

export type EcommerceBuyingEvent = {
  schema: typeof ECOMMERCE_BUYING_EVENT_SCHEMA
  sequence: number
  action: 'request_recorded' | 'return_intent_recorded' | 'support_intent_recorded'
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
  supportIntents: EcommerceSupportIntent[]
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
const customerIdPattern = new RegExp(`^CUS-${uuidPattern}$`)
const addressIdPattern = new RegExp(`^ADR-${uuidPattern}$`)
const returnIdPattern = new RegExp(`^ERR-${uuidPattern}$`)
const returnKeyPattern = new RegExp(`^ERI-${uuidPattern}$`)
const supportIdPattern = new RegExp(`^ESR-${uuidPattern}$`)
const supportKeyPattern = new RegExp(`^ESI-${uuidPattern}$`)
const timestampPattern = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])$/
const paymentAdapters: EcommercePaymentAdapter[] = ['cash_on_delivery', 'kbzpay_manual', 'pay_on_pickup']
const fulfilmentMethods: EcommerceFulfilment[] = ['delivery', 'pickup']
const returnDispositions: EcommerceReturnDisposition[] = ['not_restocked', 'restock']
const supportCategories: EcommerceSupportCategory[] = ['delivery_issue', 'item_issue', 'order_status', 'other', 'payment_question']
const maxSafeInteger = Number.MAX_SAFE_INTEGER
const maxLines = 20
const maxQuantity = 99
const maxRecords = 100
const phonePattern = /^\+?[0-9][0-9 ()-]{5,31}$/

export function ecommercePaymentMatchesFulfilment(
  fulfilment: EcommerceFulfilment,
  paymentAdapter: EcommercePaymentAdapter,
) {
  return paymentAdapter === 'kbzpay_manual'
    || (fulfilment === 'pickup' ? paymentAdapter === 'pay_on_pickup' : paymentAdapter === 'cash_on_delivery')
}

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

function customerPhone(value: unknown, field: string) {
  const phone = canonicalText(value, field, 32)
  const digitCount = phone.replace(/\D/g, '').length
  if (!phonePattern.test(phone) || digitCount < 6 || digitCount > 15) {
    throw new Error(`${field} must be a usable phone number.`)
  }
  return phone
}

function customerProfileSnapshotShape(value: unknown, field = 'customer profile'): EcommerceCustomerProfileSnapshot {
  const source = exactObject(value, field, [
    'schema', 'id', 'revision', 'name', 'phone', 'savedAt', 'previousDigest', 'profileDigest',
  ])
  const id = canonicalText(source.id, `${field}.id`, 40)
  if (source.schema !== ECOMMERCE_CUSTOMER_PROFILE_SCHEMA || !customerIdPattern.test(id)) {
    throw new Error(`${field} identity is invalid.`)
  }
  const core = {
    schema: ECOMMERCE_CUSTOMER_PROFILE_SCHEMA,
    id,
    revision: safeInteger(source.revision, `${field}.revision`, 1),
    name: canonicalText(source.name, `${field}.name`, 80),
    phone: customerPhone(source.phone, `${field}.phone`),
    savedAt: canonicalTimestamp(source.savedAt, `${field}.savedAt`),
    previousDigest: source.previousDigest === null ? null : canonicalDigest(source.previousDigest, `${field}.previousDigest`),
  }
  const profileDigest = canonicalDigest(source.profileDigest, `${field}.profileDigest`)
  return { ...core, profileDigest }
}

async function customerProfileSnapshot(value: unknown, field = 'customer profile'): Promise<EcommerceCustomerProfileSnapshot> {
  const profile = customerProfileSnapshotShape(value, field)
  const { profileDigest, ...core } = profile
  if (await ecommerceLifecycleDigest(core) !== profileDigest) throw new Error(`${field} digest is invalid.`)
  return profile
}

function deliveryAddressSnapshotShape(value: unknown, field = 'delivery address'): EcommerceDeliveryAddressSnapshot {
  const source = exactObject(value, field, [
    'schema', 'id', 'revision', 'line1', 'township', 'city', 'instructions',
    'savedAt', 'previousDigest', 'addressDigest',
  ])
  const id = canonicalText(source.id, `${field}.id`, 40)
  if (source.schema !== ECOMMERCE_DELIVERY_ADDRESS_SCHEMA || !addressIdPattern.test(id)) {
    throw new Error(`${field} identity is invalid.`)
  }
  const core = {
    schema: ECOMMERCE_DELIVERY_ADDRESS_SCHEMA,
    id,
    revision: safeInteger(source.revision, `${field}.revision`, 1),
    line1: canonicalText(source.line1, `${field}.line1`, 120),
    township: canonicalText(source.township, `${field}.township`, 80),
    city: canonicalText(source.city, `${field}.city`, 80),
    instructions: source.instructions === null ? null : canonicalText(source.instructions, `${field}.instructions`, 160),
    savedAt: canonicalTimestamp(source.savedAt, `${field}.savedAt`),
    previousDigest: source.previousDigest === null ? null : canonicalDigest(source.previousDigest, `${field}.previousDigest`),
  }
  const addressDigest = canonicalDigest(source.addressDigest, `${field}.addressDigest`)
  return { ...core, addressDigest }
}

async function deliveryAddressSnapshot(value: unknown, field = 'delivery address'): Promise<EcommerceDeliveryAddressSnapshot> {
  const address = deliveryAddressSnapshotShape(value, field)
  const { addressDigest, ...core } = address
  if (await ecommerceLifecycleDigest(core) !== addressDigest) throw new Error(`${field} digest is invalid.`)
  return address
}

export async function buildEcommerceCustomerProfileSnapshot(input: {
  name: string
  phone: string
  savedAt: string
  idempotencyKey: string
  previous?: EcommerceCustomerProfileSnapshot | null
}) {
  const key = canonicalText(input.idempotencyKey, 'customer profile.idempotencyKey', 40)
  if (!checkoutKeyPattern.test(key)) throw new Error('Customer profile checkout identity is invalid.')
  const name = canonicalText(input.name, 'customer profile.name', 80)
  const phone = customerPhone(input.phone, 'customer profile.phone')
  const savedAt = canonicalTimestamp(input.savedAt, 'customer profile.savedAt')
  const previous = input.previous ? await customerProfileSnapshot(input.previous) : null
  if (previous && previous.name === name && previous.phone === phone) return previous
  const core = {
    schema: ECOMMERCE_CUSTOMER_PROFILE_SCHEMA,
    id: previous?.id ?? `CUS-${key.slice(4)}`,
    revision: (previous?.revision ?? 0) + 1,
    name,
    phone,
    savedAt,
    previousDigest: previous?.profileDigest ?? null,
  }
  return customerProfileSnapshot({ ...core, profileDigest: await ecommerceLifecycleDigest(core) })
}

export async function buildEcommerceDeliveryAddressSnapshot(input: {
  line1: string
  township: string
  city: string
  instructions: string | null
  savedAt: string
  idempotencyKey: string
  previous?: EcommerceDeliveryAddressSnapshot | null
}) {
  const key = canonicalText(input.idempotencyKey, 'delivery address.idempotencyKey', 40)
  if (!checkoutKeyPattern.test(key)) throw new Error('Delivery address checkout identity is invalid.')
  const values = {
    line1: canonicalText(input.line1, 'delivery address.line1', 120),
    township: canonicalText(input.township, 'delivery address.township', 80),
    city: canonicalText(input.city, 'delivery address.city', 80),
    instructions: input.instructions === null ? null : canonicalText(input.instructions, 'delivery address.instructions', 160),
  }
  const savedAt = canonicalTimestamp(input.savedAt, 'delivery address.savedAt')
  const previous = input.previous ? await deliveryAddressSnapshot(input.previous) : null
  if (previous
    && previous.line1 === values.line1
    && previous.township === values.township
    && previous.city === values.city
    && previous.instructions === values.instructions) return previous
  const core = {
    schema: ECOMMERCE_DELIVERY_ADDRESS_SCHEMA,
    id: previous?.id ?? `ADR-${key.slice(4)}`,
    revision: (previous?.revision ?? 0) + 1,
    ...values,
    savedAt,
    previousDigest: previous?.addressDigest ?? null,
  }
  return deliveryAddressSnapshot({ ...core, addressDigest: await ecommerceLifecycleDigest(core) })
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

async function quoteCore(value: unknown): Promise<Omit<EcommerceCheckoutQuote, 'quoteDigest'>> {
  const baseFields = [
    'schema', 'scope', 'quoteId', 'idempotencyKey', 'quotedAt', 'expiresAt',
    'sourcePreviewDigest', 'pimDigest', 'currency', 'customerReference', 'fulfilment',
    'lines', 'subtotalMmk', 'promotion', 'tax', 'shipping', 'payment', 'totalMmk',
  ]
  const structuredFields = ['customerProfile', 'deliveryAddress']
  const structured = isRecord(value) && structuredFields.some((field) => field in value)
  const source = exactObject(value, 'checkout quote', structured ? [...baseFields, ...structuredFields] : baseFields)
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
  const customerProfile = structured
    ? await customerProfileSnapshot(source.customerProfile, 'checkout quote.customerProfile')
    : undefined
  const deliveryAddress = structured
    ? source.deliveryAddress === null
      ? null
      : await deliveryAddressSnapshot(source.deliveryAddress, 'checkout quote.deliveryAddress')
    : undefined
  if (structured
    && (Date.parse(customerProfile!.savedAt) > Date.parse(quotedAt)
      || (deliveryAddress && Date.parse(deliveryAddress.savedAt) > Date.parse(quotedAt))
      || (fulfilment === 'delivery') !== Boolean(deliveryAddress))) {
    throw new Error('Checkout customer and delivery identity are inconsistent.')
  }
  const shipping = exactObject(source.shipping, 'checkout quote.shipping', ['adapter', 'status', 'amountMmk'])
  const expectedShipping = fulfilment === 'pickup'
    ? { adapter: 'pickup', status: 'included', amountMmk: 0 }
    : { adapter: 'shop_delivery_review', status: 'pending_shop_review', amountMmk: 0 }
  if (canonicalJson(shipping) !== canonicalJson(expectedShipping)) throw new Error('Checkout shipping boundary is invalid.')
  const payment = exactObject(source.payment, 'checkout quote.payment', ['adapter', 'status', 'amountMmk'])
  if (!paymentAdapters.includes(payment.adapter as EcommercePaymentAdapter)
    || payment.status !== 'not_authorized'
    || payment.amountMmk !== 0) throw new Error('Checkout payment boundary is invalid.')
  if (!ecommercePaymentMatchesFulfilment(fulfilment, payment.adapter as EcommercePaymentAdapter)) {
    throw new Error('Checkout payment does not match how the customer receives the order.')
  }
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
    ...(customerProfile ? { customerProfile, deliveryAddress: deliveryAddress ?? null } : {}),
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
  customerProfile?: { name: string; phone: string; previous?: EcommerceCustomerProfileSnapshot | null }
  deliveryAddress?: { line1: string; township: string; city: string; instructions: string | null; previous?: EcommerceDeliveryAddressSnapshot | null } | null
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
  if (!ecommercePaymentMatchesFulfilment(input.fulfilment, input.paymentAdapter)) {
    throw new Error('Checkout payment does not match how the customer receives the order.')
  }
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
  const customerProfile = input.customerProfile
    ? await buildEcommerceCustomerProfileSnapshot({
        ...input.customerProfile,
        savedAt: input.quotedAt,
        idempotencyKey: key,
      })
    : undefined
  const deliveryAddress = input.customerProfile
    ? input.fulfilment === 'delivery'
      ? await buildEcommerceDeliveryAddressSnapshot({
          ...(input.deliveryAddress ?? { line1: '', township: '', city: '', instructions: null }),
          savedAt: input.quotedAt,
          idempotencyKey: key,
        })
      : null
    : undefined
  const core = await quoteCore({
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
    ...(customerProfile ? { customerProfile, deliveryAddress } : {}),
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
  const baseFields = [
    'schema', 'scope', 'quoteId', 'idempotencyKey', 'quotedAt', 'expiresAt',
    'sourcePreviewDigest', 'pimDigest', 'currency', 'customerReference', 'fulfilment',
    'lines', 'subtotalMmk', 'promotion', 'tax', 'shipping', 'payment', 'totalMmk', 'quoteDigest',
  ]
  const structuredFields = ['customerProfile', 'deliveryAddress']
  const structured = isRecord(value) && structuredFields.some((field) => field in value)
  const source = exactObject(value, 'checkout quote', structured ? [...baseFields, ...structuredFields] : baseFields)
  const { quoteDigest: rawDigest, ...rawCore } = source
  const core = await quoteCore(rawCore)
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
    ...(quote.customerProfile ? {
      customerProfile: canonicalCopy(quote.customerProfile),
      deliveryAddress: quote.deliveryAddress ? canonicalCopy(quote.deliveryAddress) : null,
    } : {}),
    fulfilment: quote.fulfilment,
    currency: 'MMK',
    lines: canonicalCopy(quote.lines),
    quote,
    totalMmk: quote.totalMmk,
  }
  return validateEcommerceOrderRequestV2(request)
}

export async function validateEcommerceOrderRequestV2(value: unknown): Promise<EcommerceOrderRequestV2> {
  const baseFields = [
    'schema', 'mode', 'state', 'scope', 'id', 'idempotencyKey', 'createdAt',
    'sourcePreviewDigest', 'sourceStorefrontRevision', 'sourceStorefrontActionId',
    'customerReference', 'fulfilment', 'currency', 'lines', 'quote', 'totalMmk',
  ]
  const structuredFields = ['customerProfile', 'deliveryAddress']
  const structured = isRecord(value) && structuredFields.some((field) => field in value)
  const source = exactObject(value, 'Ecommerce request', structured ? [...baseFields, ...structuredFields] : baseFields)
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
  const customerProfile = structured
    ? await customerProfileSnapshot(source.customerProfile, 'Ecommerce request.customerProfile')
    : undefined
  const deliveryAddress = structured
    ? source.deliveryAddress === null
      ? null
      : await deliveryAddressSnapshot(source.deliveryAddress, 'Ecommerce request.deliveryAddress')
    : undefined
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
    ...(customerProfile ? { customerProfile, deliveryAddress: deliveryAddress ?? null } : {}),
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
    || canonicalJson(request.customerProfile ?? null) !== canonicalJson(quote.customerProfile ?? null)
    || canonicalJson(request.deliveryAddress ?? null) !== canonicalJson(quote.deliveryAddress ?? null)
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
    supportIntents: [],
    events: [],
  }
}

async function validateBuyingEvent(value: unknown, field: string): Promise<EcommerceBuyingEvent> {
  const source = exactObject(value, field, [
    'schema', 'sequence', 'action', 'subjectId', 'idempotencyKey', 'payloadDigest',
    'previousDigest', 'eventDigest',
  ])
  if (source.schema !== ECOMMERCE_BUYING_EVENT_SCHEMA
    || !['request_recorded', 'return_intent_recorded', 'support_intent_recorded'].includes(String(source.action))) {
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
  if (!isRecord(value)) throw new Error('Buying state must be an object.')
  const legacyKeys = ['schema', 'scope', 'revision', 'headDigest', 'requests', 'returnIntents', 'events']
  const currentKeys = [...legacyKeys.slice(0, 6), 'supportIntents', 'events']
  const actualKeys = Object.keys(value)
  const hasExactShape = (keys: string[]) => actualKeys.length === keys.length && keys.every((key) => actualKeys.includes(key))
  if (!hasExactShape(legacyKeys) && !hasExactShape(currentKeys)) throw new Error('Buying state fields do not match the contract.')
  const source = value
  if (source.schema !== ECOMMERCE_BUYING_STATE_SCHEMA
    || !Array.isArray(source.requests)
    || !Array.isArray(source.returnIntents)
    || source.supportIntents !== undefined && !Array.isArray(source.supportIntents)
    || !Array.isArray(source.events)
    || source.requests.length > maxRecords
    || source.returnIntents.length > maxRecords
    || (source.supportIntents?.length ?? 0) > maxRecords
    || source.events.length > maxRecords * 3) throw new Error('Buying state contract is invalid.')
  const scope = canonicalToken(source.scope, 'buying state.scope')
  if (expectedScope && scope !== canonicalToken(expectedScope, 'expectedScope')) throw new Error('Buying state belongs to a different workspace.')
  const requests = await Promise.all(source.requests.map((request) => validateEcommerceOrderRequestV2(request)))
  const returnIntents = source.returnIntents.map((intent) => validateEcommerceReturnIntent(intent))
  const supportIntents = (source.supportIntents ?? []).map((intent) => validateEcommerceSupportIntent(intent))
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
  const records: Array<EcommerceOrderRequestV2 | EcommerceReturnIntent | EcommerceSupportIntent> = [...requests, ...returnIntents, ...supportIntents]
  if (records.some((record) => record.scope !== scope)
    || new Set(records.map((record) => record.id)).size !== records.length
    || new Set(records.map((record) => record.idempotencyKey)).size !== records.length
    || events.length !== records.length) throw new Error('Buying state records are not unique and scope-bound.')
  const requestIds = new Set(requests.map((request) => request.id))
  if (returnIntents.some((intent) => !requestIds.has(intent.sourceRequestId))) {
    throw new Error('Return intent is not attributable to one recovered Ecommerce request.')
  }
  if (supportIntents.some((intent) => !requestIds.has(intent.sourceRequestId))) {
    throw new Error('Support intent is not attributable to one recovered Ecommerce request.')
  }
  const byId = new Map(records.map((record) => [record.id, record]))
  for (const event of events) {
    const record = byId.get(event.subjectId)
    if (!record
      || record.idempotencyKey !== event.idempotencyKey
      || await ecommerceLifecycleDigest(record) !== event.payloadDigest) throw new Error('Buying event does not match its record.')
  }
  return { schema: ECOMMERCE_BUYING_STATE_SCHEMA, scope, revision, headDigest, requests, returnIntents, supportIntents, events }
}

async function appendBuyingRecord(
  stateValue: EcommerceBuyingState,
  record: EcommerceOrderRequestV2 | EcommerceReturnIntent | EcommerceSupportIntent,
  collection: 'requests' | 'returnIntents' | 'supportIntents',
  action: EcommerceBuyingEvent['action'],
  expectedHeadDigest: string,
) {
  const state = await validateEcommerceBuyingState(stateValue)
  if (canonicalDigest(expectedHeadDigest, 'expectedHeadDigest') !== state.headDigest) throw new Error('Buying state changed before this record was applied.')
  if (record.scope !== state.scope) throw new Error('Buying record belongs to a different workspace.')
  const allRecords: Array<EcommerceOrderRequestV2 | EcommerceReturnIntent | EcommerceSupportIntent> = [...state.requests, ...state.returnIntents, ...state.supportIntents]
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

export function buildEcommerceReturnIntent(input: {
  scope: string
  orderSnapshot: CommerceOrder
  sku: string
  quantity: number
  disposition: EcommerceReturnDisposition
  reason: string
  idempotencyKey: string
  createdAt: string
}): EcommerceReturnIntent {
  const order = input.orderSnapshot
  if (!isRecord(order)
    || order.status !== 'completed'
    || !isRecord(order.completion)
    || !Array.isArray(order.lines)
    || order.lines.length < 1
    || order.lines.length > maxLines) {
    throw new Error('Returns require a completed Shop order with completion proof and exact sold lines.')
  }
  const orderId = canonicalToken(order.id, 'orderSnapshot.id')
  const sourceRequestId = canonicalText(order.sourceRecordId, 'orderSnapshot.sourceRecordId', 40)
  if (!requestIdPattern.test(sourceRequestId)) throw new Error('Return order is not attributable to an Ecommerce request.')
  const lines = order.lines.map((line, index) => ({
    sku: canonicalToken(line?.sku, `orderSnapshot.lines[${index}].sku`),
    quantity: safeInteger(line?.quantity, `orderSnapshot.lines[${index}].quantity`, 1, maxQuantity),
  }))
  const sku = canonicalToken(input.sku, 'sku')
  const matching = lines.filter((line) => line.sku === sku)
  if (matching.length !== 1) throw new Error('Return SKU is not one exact sold line.')
  const returned = (order.returns ?? []).reduce((total, record, index) => {
    const recordSku = canonicalToken(record?.sku, `orderSnapshot.returns[${index}].sku`)
    const recordQuantity = safeInteger(record?.quantity, `orderSnapshot.returns[${index}].quantity`, 1, maxQuantity)
    return recordSku === sku ? total + recordQuantity : total
  }, 0)
  const quantity = safeInteger(input.quantity, 'quantity', 1, maxQuantity)
  if (quantity > matching[0].quantity - returned) throw new Error('Return quantity exceeds the remaining sold quantity.')
  if (!returnDispositions.includes(input.disposition)) throw new Error('Return disposition is unsupported.')
  const idempotencyKey = canonicalText(input.idempotencyKey, 'idempotencyKey', 40)
  if (!returnKeyPattern.test(idempotencyKey)) throw new Error('Return idempotency key is invalid.')
  return validateEcommerceReturnIntent({
    schema: ECOMMERCE_RETURN_INTENT_SCHEMA,
    state: 'pending_shop_review',
    scope: canonicalToken(input.scope, 'scope'),
    id: `ERR-${idempotencyKey.slice(4)}`,
    idempotencyKey,
    createdAt: canonicalTimestamp(input.createdAt, 'createdAt'),
    orderId,
    sourceRequestId,
    sku,
    quantity,
    disposition: input.disposition,
    reason: canonicalText(input.reason, 'reason', 300),
    refundStatus: 'not_started',
    evidenceReference: `ECOMMERCE-RETURN:${idempotencyKey.slice(4)}:${orderId}:${sourceRequestId}`,
  })
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

export function buildEcommerceSupportIntent(input: {
  scope: string
  orderSnapshot: CommerceOrder
  category: EcommerceSupportCategory
  description: string
  idempotencyKey: string
  createdAt: string
}): EcommerceSupportIntent {
  const order = input.orderSnapshot
  if (!isRecord(order) || order.status !== 'completed' || !isRecord(order.completion)) {
    throw new Error('Support requests require a completed Shop order with completion proof.')
  }
  const orderId = canonicalToken(order.id, 'orderSnapshot.id')
  const sourceRequestId = canonicalText(order.sourceRecordId, 'orderSnapshot.sourceRecordId', 40)
  if (!requestIdPattern.test(sourceRequestId)) throw new Error('Support order is not attributable to an Ecommerce request.')
  if (!supportCategories.includes(input.category)) throw new Error('Support category is unsupported.')
  const idempotencyKey = canonicalText(input.idempotencyKey, 'idempotencyKey', 40)
  if (!supportKeyPattern.test(idempotencyKey)) throw new Error('Support idempotency key is invalid.')
  return validateEcommerceSupportIntent({
    schema: ECOMMERCE_SUPPORT_INTENT_SCHEMA,
    state: 'pending_shop_review',
    scope: canonicalToken(input.scope, 'scope'),
    id: `ESR-${idempotencyKey.slice(4)}`,
    idempotencyKey,
    createdAt: canonicalTimestamp(input.createdAt, 'createdAt'),
    orderId,
    sourceRequestId,
    category: input.category,
    description: canonicalText(input.description, 'description', 300),
    externalMessageSent: false,
    refundStarted: false,
    evidenceReference: `ECOMMERCE-SUPPORT:${idempotencyKey.slice(4)}:${orderId}:${sourceRequestId}`,
  })
}

export function validateEcommerceSupportIntent(value: unknown): EcommerceSupportIntent {
  const source = exactObject(value, 'support intent', [
    'schema', 'state', 'scope', 'id', 'idempotencyKey', 'createdAt', 'orderId',
    'sourceRequestId', 'category', 'description', 'externalMessageSent', 'refundStarted', 'evidenceReference',
  ])
  const id = canonicalText(source.id, 'support intent.id', 40)
  const idempotencyKey = canonicalText(source.idempotencyKey, 'support intent.idempotencyKey', 40)
  const sourceRequestId = canonicalText(source.sourceRequestId, 'support intent.sourceRequestId', 40)
  const orderId = canonicalToken(source.orderId, 'support intent.orderId')
  const evidenceReference = `ECOMMERCE-SUPPORT:${idempotencyKey.slice(4)}:${orderId}:${sourceRequestId}`
  if (source.schema !== ECOMMERCE_SUPPORT_INTENT_SCHEMA
    || source.state !== 'pending_shop_review'
    || !supportIdPattern.test(id)
    || !supportKeyPattern.test(idempotencyKey)
    || id.slice(4) !== idempotencyKey.slice(4)
    || !requestIdPattern.test(sourceRequestId)
    || !supportCategories.includes(source.category as EcommerceSupportCategory)
    || source.externalMessageSent !== false
    || source.refundStarted !== false
    || source.evidenceReference !== evidenceReference) throw new Error('Support intent boundary is invalid.')
  return {
    schema: ECOMMERCE_SUPPORT_INTENT_SCHEMA,
    state: 'pending_shop_review',
    scope: canonicalToken(source.scope, 'support intent.scope'),
    id,
    idempotencyKey,
    createdAt: canonicalTimestamp(source.createdAt, 'support intent.createdAt'),
    orderId,
    sourceRequestId,
    category: source.category as EcommerceSupportCategory,
    description: canonicalText(source.description, 'support intent.description', 300),
    externalMessageSent: false,
    refundStarted: false,
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

export async function recordEcommerceSupportIntent(
  state: EcommerceBuyingState,
  intentValue: EcommerceSupportIntent,
  expectedHeadDigest: string,
) {
  return appendBuyingRecord(state, validateEcommerceSupportIntent(intentValue), 'supportIntents', 'support_intent_recorded', expectedHeadDigest)
}

export async function saveEcommerceReturnIntent(
  scope: string,
  intent: EcommerceReturnIntent,
  expectedHeadDigest: string,
  options: { storage?: EcommerceBuyingStorage; locks?: EcommerceBuyingLocks } = {},
) {
  const canonicalScope = canonicalToken(scope, 'scope')
  const storage = options.storage ?? browserStorage()
  const locks = options.locks ?? browserLocks()
  if (!storage) throw new Error('Browser recovery is unavailable. The return request was not saved.')
  if (!locks) throw new Error('Safe browser locking is unavailable. The return request was not saved.')
  const storageKey = ecommerceBuyingStateStorageKey(canonicalScope)
  return locks.request(`supermega:ecommerce:buying-lifecycle:${encodeURIComponent(canonicalScope)}`, { mode: 'exclusive' }, async () => {
    const currentRead = await readEcommerceBuyingState(canonicalScope, storage)
    if (!currentRead.state || currentRead.status === 'invalid' || currentRead.status === 'unavailable') {
      throw new Error(currentRead.error || 'Saved Ecommerce recovery cannot be updated safely.')
    }
    const next = await recordEcommerceReturnIntent(currentRead.state, intent, expectedHeadDigest)
    if (next === currentRead.state || canonicalJson(next) === canonicalJson(currentRead.state)) return next
    const previousRaw = storage.getItem(storageKey)
    const nextRaw = canonicalJson(next)
    try {
      storage.setItem(storageKey, nextRaw)
      if (storage.getItem(storageKey) !== nextRaw) throw new Error('Return request recovery write could not be confirmed.')
      return next
    } catch (error) {
      try {
        if (previousRaw === null) storage.removeItem(storageKey)
        else storage.setItem(storageKey, previousRaw)
        if (storage.getItem(storageKey) !== previousRaw) throw new Error('rollback confirmation failed', { cause: error })
      } catch (rollbackError) {
        throw new Error('Return request recovery write failed and rollback could not be confirmed. Stop and export local evidence.', { cause: rollbackError })
      }
      throw error instanceof Error
        ? error
        : new Error('Return request recovery write failed. The previous value was restored.', { cause: error })
    }
  })
}

export async function saveEcommerceSupportIntent(
  scope: string,
  intent: EcommerceSupportIntent,
  expectedHeadDigest: string,
  options: { storage?: EcommerceBuyingStorage; locks?: EcommerceBuyingLocks } = {},
) {
  const canonicalScope = canonicalToken(scope, 'scope')
  const storage = options.storage ?? browserStorage()
  const locks = options.locks ?? browserLocks()
  if (!storage) throw new Error('Browser recovery is unavailable. The support request was not saved.')
  if (!locks) throw new Error('Safe browser locking is unavailable. The support request was not saved.')
  const storageKey = ecommerceBuyingStateStorageKey(canonicalScope)
  return locks.request(`supermega:ecommerce:buying-lifecycle:${encodeURIComponent(canonicalScope)}`, { mode: 'exclusive' }, async () => {
    const currentRead = await readEcommerceBuyingState(canonicalScope, storage)
    if (!currentRead.state || currentRead.status === 'invalid' || currentRead.status === 'unavailable') {
      throw new Error(currentRead.error || 'Saved Ecommerce recovery cannot be updated safely.')
    }
    const next = await recordEcommerceSupportIntent(currentRead.state, intent, expectedHeadDigest)
    if (next === currentRead.state || canonicalJson(next) === canonicalJson(currentRead.state)) return next
    const previousRaw = storage.getItem(storageKey)
    const nextRaw = canonicalJson(next)
    try {
      storage.setItem(storageKey, nextRaw)
      if (storage.getItem(storageKey) !== nextRaw) throw new Error('Support request recovery write could not be confirmed.')
      return next
    } catch (error) {
      try {
        if (previousRaw === null) storage.removeItem(storageKey)
        else storage.setItem(storageKey, previousRaw)
        if (storage.getItem(storageKey) !== previousRaw) throw new Error('rollback confirmation failed', { cause: error })
      } catch (rollbackError) {
        throw new Error('Support request recovery write failed and rollback could not be confirmed. Stop and export local evidence.', { cause: rollbackError })
      }
      throw error instanceof Error
        ? error
        : new Error('Support request recovery write failed. The previous value was restored.', { cause: error })
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
  currentPromotionPolicies: readonly CommercePromotionPolicy[]
  currentShippingPolicies: readonly CommerceShippingPolicy[]
  currentPaymentPolicies: readonly CommercePaymentPolicy[]
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
  const promotion = commercePromotionDecision(
    input.currentPromotionPolicies,
    request.quote.promotion.code,
    request.quote.subtotalMmk,
    confirmedAt,
  )
  if (!promotion) throw new Error('The Shop promotion decision is invalid.')
  const shipping = commerceShippingDecision(
    input.currentShippingPolicies,
    request.fulfilment,
    request.deliveryAddress?.township ?? null,
    confirmedAt,
  )
  if (!shipping) throw new Error('The Shop shipping decision is invalid.')
  if (shipping.status === 'rejected') throw new Error(`Shop delivery is unavailable for ${shipping.township ?? 'this township'} (${shipping.reason}).`)
  const totalMmk = promotion.netSubtotalMmk + shipping.feeMmk
  if (!Number.isSafeInteger(totalMmk) || totalMmk < 1) throw new Error('The Shop total exceeds the safe MMK boundary.')
  const payment = commercePaymentDecision(
    input.currentPaymentPolicies,
    request.quote.payment.adapter,
    request.fulfilment,
    totalMmk,
    confirmedAt,
  )
  if (!payment) throw new Error('The Shop payment decision is invalid.')
  if (payment.status === 'rejected') throw new Error(`Shop payment method is unavailable (${payment.reason}).`)
  return {
    schema: ECOMMERCE_SHOP_DRAFT_SCHEMA_V6,
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
    ...(request.customerProfile ? {
      customerProfile: canonicalCopy(request.customerProfile),
      deliveryAddress: request.deliveryAddress ? canonicalCopy(request.deliveryAddress) : null,
    } : {}),
    fulfilment: request.fulfilment,
    currency: 'MMK',
    operatingContext: {
      organizationScope: request.scope,
      operatingUnitLocationId: 'LOC-MAIN',
      sourceAuthority: 'ecommerce',
      targetAuthority: 'commerce',
      recordType: 'order_request',
      writePolicy: 'human_review_required',
    },
    lines: canonicalCopy(request.lines),
    pricing: {
      subtotalMmk: request.quote.subtotalMmk,
      promotion,
      tax: canonicalCopy(request.quote.tax),
      shipping,
      payment,
      totalMmk,
    },
    totalMmk,
    evidenceReference: `ECOMMERCE:${request.id}:${request.sourcePreviewDigest}:${request.quote.quoteDigest}:${request.scope}:LOC-MAIN:ecommerce>commerce:human_review_required:${promotion.status}:${promotion.policyRevision ?? 'none'}:${promotion.discountMmk}:shipping:${shipping.status}:${shipping.policyRevision ?? 'none'}:${shipping.feeMmk}:payment:${payment.status}:${payment.policyRevision ?? 'none'}:${payment.adapter}`,
  }
}

export async function prepareManagedEcommerceShopDraftV2(input: {
  request: EcommerceOrderRequestV2
  currentCatalog: CommerceItem[]
  currentPromotionPolicies: readonly CommercePromotionPolicy[]
  currentShippingPolicies: readonly CommerceShippingPolicy[]
  currentPaymentPolicies: readonly CommercePaymentPolicy[]
  confirmedAt: string
}) {
  const request = await validateEcommerceOrderRequestV2(input.request)
  const empty = createEmptyEcommerceBuyingState(request.scope)
  const retained = await recordEcommerceOrderRequestV2(empty, request, empty.headDigest)
  return prepareEcommerceShopDraftV2({ ...input, request, state: retained })
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
  const baseFields = [
    'schema', 'mode', 'state', 'id', 'sourceRequestId', 'sourcePreviewDigest',
    'quoteDigest', 'quoteExpiresAt', 'createdAt', 'confirmedAt', 'customerReference',
    'fulfilment', 'currency', 'operatingContext', 'lines', 'pricing', 'totalMmk', 'evidenceReference',
  ]
  const structuredFields = ['customerProfile', 'deliveryAddress']
  const structured = isRecord(value) && structuredFields.some((field) => field in value)
  const source = exactObject(value, 'Shop draft', structured ? [...baseFields, ...structuredFields] : baseFields)
  if (source.schema !== ECOMMERCE_SHOP_DRAFT_SCHEMA_V6
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
  const customerProfile = structured
    ? customerProfileSnapshotShape(source.customerProfile, 'Shop draft.customerProfile')
    : undefined
  const deliveryAddress = structured
    ? source.deliveryAddress === null
      ? null
      : deliveryAddressSnapshotShape(source.deliveryAddress, 'Shop draft.deliveryAddress')
    : undefined
  if (structured && (fulfilment === 'delivery') !== Boolean(deliveryAddress)) {
    throw new Error('Shop draft customer and delivery identity are invalid.')
  }
  if (source.currency !== 'MMK') throw new Error('Shop draft currency is invalid.')
  const operatingContext = exactObject(source.operatingContext, 'Shop draft.operatingContext', [
    'organizationScope', 'operatingUnitLocationId', 'sourceAuthority', 'targetAuthority', 'recordType', 'writePolicy',
  ])
  const organizationScope = canonicalToken(operatingContext.organizationScope, 'Shop draft.operatingContext.organizationScope')
  if (operatingContext.operatingUnitLocationId !== 'LOC-MAIN'
    || operatingContext.sourceAuthority !== 'ecommerce'
    || operatingContext.targetAuthority !== 'commerce'
    || operatingContext.recordType !== 'order_request'
    || operatingContext.writePolicy !== 'human_review_required') throw new Error('Shop draft operating authority is invalid.')
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
  if (subtotalMmk !== productTotal) throw new Error('Shop draft pricing subtotal is invalid.')
  const promotion = exactObject(pricing.promotion, 'Shop draft.pricing.promotion', [
    'schema', 'status', 'code', 'policyRevision', 'policyActionId', 'discountBasisPoints',
    'grossSubtotalMmk', 'discountMmk', 'netSubtotalMmk', 'reviewedAt', 'reason',
  ])
  const promotionCode = optionalText(promotion.code, 'Shop draft.pricing.promotion.code', 40)
  const policyRevision = promotion.policyRevision === null ? null : safeInteger(promotion.policyRevision, 'Shop draft.pricing.promotion.policyRevision', 1)
  const policyActionId = promotion.policyActionId === null ? null : canonicalText(promotion.policyActionId, 'Shop draft.pricing.promotion.policyActionId', 160)
  const discountBasisPoints = safeInteger(promotion.discountBasisPoints, 'Shop draft.pricing.promotion.discountBasisPoints')
  const grossSubtotalMmk = safeInteger(promotion.grossSubtotalMmk, 'Shop draft.pricing.promotion.grossSubtotalMmk', 1)
  const discountMmk = safeInteger(promotion.discountMmk, 'Shop draft.pricing.promotion.discountMmk')
  const netSubtotalMmk = safeInteger(promotion.netSubtotalMmk, 'Shop draft.pricing.promotion.netSubtotalMmk', 1)
  const reviewedAt = canonicalTimestamp(promotion.reviewedAt, 'Shop draft.pricing.promotion.reviewedAt')
  const promotionStatus = promotion.status
  const promotionReason = promotion.reason
  const approved = promotionStatus === 'approved'
    && promotionReason === 'approved'
    && promotionCode !== null
    && policyRevision !== null
    && policyActionId !== null
    && discountBasisPoints >= 1
    && discountBasisPoints <= 10_000
    && discountMmk >= 1
  const notRequested = promotionStatus === 'not_requested'
    && promotionReason === 'not_requested'
    && promotionCode === null
    && policyRevision === null
    && policyActionId === null
    && discountBasisPoints === 0
    && discountMmk === 0
  const rejected = promotionStatus === 'rejected'
    && ['not_found', 'inactive', 'not_effective', 'minimum_not_met'].includes(String(promotionReason))
    && promotionCode !== null
    && discountMmk === 0
  if (promotion.schema !== 'supermega.commerce.promotion-decision.v1'
    || (!approved && !notRequested && !rejected)
    || grossSubtotalMmk !== subtotalMmk
    || netSubtotalMmk !== grossSubtotalMmk - discountMmk
    || reviewedAt !== confirmedAt
    ) throw new Error('Shop draft promotion boundary is invalid.')
  const tax = exactObject(pricing.tax, 'Shop draft.pricing.tax', ['adapter', 'status', 'amountMmk'])
  if (tax.adapter !== 'price_inclusive' || tax.status !== 'included' || tax.amountMmk !== 0) {
    throw new Error('Shop draft tax boundary is invalid.')
  }
  const shipping = exactObject(pricing.shipping, 'Shop draft.pricing.shipping', [
    'schema', 'status', 'reason', 'township', 'zoneCode', 'policyRevision', 'policyActionId', 'feeMmk', 'promiseMinutes', 'reviewedAt',
  ])
  const shippingTownship = shipping.township === null ? null : canonicalText(shipping.township, 'Shop draft.pricing.shipping.township', 80)
  const shippingZoneCode = shipping.zoneCode === null ? null : canonicalText(shipping.zoneCode, 'Shop draft.pricing.shipping.zoneCode', 40)
  const shippingPolicyRevision = shipping.policyRevision === null ? null : safeInteger(shipping.policyRevision, 'Shop draft.pricing.shipping.policyRevision', 1)
  const shippingPolicyActionId = shipping.policyActionId === null ? null : canonicalText(shipping.policyActionId, 'Shop draft.pricing.shipping.policyActionId', 160)
  const shippingFeeMmk = safeInteger(shipping.feeMmk, 'Shop draft.pricing.shipping.feeMmk')
  const shippingPromiseMinutes = shipping.promiseMinutes === null ? null : safeInteger(shipping.promiseMinutes, 'Shop draft.pricing.shipping.promiseMinutes', 15)
  const shippingReviewedAt = canonicalTimestamp(shipping.reviewedAt, 'Shop draft.pricing.shipping.reviewedAt')
  const pickupShipping = fulfilment === 'pickup'
    && shipping.status === 'pickup' && shipping.reason === 'pickup' && shippingTownship === null && shippingZoneCode === null
    && shippingPolicyRevision === null && shippingPolicyActionId === null && shippingFeeMmk === 0 && shippingPromiseMinutes === null
  const approvedShipping = fulfilment === 'delivery'
    && shipping.status === 'approved' && shipping.reason === 'approved' && shippingTownship === deliveryAddress?.township
    && shippingZoneCode !== null && shippingPolicyRevision !== null && shippingPolicyActionId !== null
    && shippingPromiseMinutes !== null && shippingPromiseMinutes <= 10_080
  if (shipping.schema !== 'supermega.commerce.shipping-decision.v1'
    || (!pickupShipping && !approvedShipping)
    || shippingReviewedAt !== confirmedAt
    || pricingTotal !== netSubtotalMmk + shippingFeeMmk
    || totalMmk !== pricingTotal) throw new Error('Shop draft shipping boundary is invalid.')
  const payment = exactObject(pricing.payment, 'Shop draft.pricing.payment', [
    'schema', 'status', 'reason', 'adapter', 'policyRevision', 'policyActionId', 'maximumOrderMmk', 'instructions', 'reviewedAt', 'authorized',
  ])
  if (!paymentAdapters.includes(payment.adapter as EcommercePaymentAdapter)) throw new Error('Shop draft payment boundary is invalid.')
  const paymentPolicyRevision = payment.policyRevision === null ? null : safeInteger(payment.policyRevision, 'Shop draft.pricing.payment.policyRevision', 1)
  const paymentPolicyActionId = payment.policyActionId === null ? null : canonicalText(payment.policyActionId, 'Shop draft.pricing.payment.policyActionId', 160)
  const paymentMaximumOrderMmk = payment.maximumOrderMmk === null ? null : safeInteger(payment.maximumOrderMmk, 'Shop draft.pricing.payment.maximumOrderMmk', 1)
  const paymentInstructions = payment.instructions === null ? null : canonicalText(payment.instructions, 'Shop draft.pricing.payment.instructions', 240)
  const paymentReviewedAt = canonicalTimestamp(payment.reviewedAt, 'Shop draft.pricing.payment.reviewedAt')
  if (payment.schema !== 'supermega.commerce.payment-decision.v1'
    || payment.status !== 'approved' || payment.reason !== 'approved'
    || paymentPolicyRevision === null || paymentPolicyActionId === null || paymentInstructions === null
    || paymentReviewedAt !== confirmedAt || payment.authorized !== false
    || !ecommercePaymentMatchesFulfilment(fulfilment as EcommerceFulfilment, payment.adapter as EcommercePaymentAdapter)
    || paymentMaximumOrderMmk !== null && totalMmk > paymentMaximumOrderMmk) throw new Error('Shop draft payment boundary is invalid.')
  const evidenceReference = `ECOMMERCE:${sourceRequestId}:${sourcePreviewDigest}:${quoteDigest}:${organizationScope}:LOC-MAIN:ecommerce>commerce:human_review_required:${promotionStatus}:${policyRevision ?? 'none'}:${discountMmk}:shipping:${shipping.status}:${shippingPolicyRevision ?? 'none'}:${shippingFeeMmk}:payment:${payment.status}:${paymentPolicyRevision}:${payment.adapter}`
  if (source.evidenceReference !== evidenceReference) throw new Error('Shop draft evidence reference is invalid.')
  return {
    schema: ECOMMERCE_SHOP_DRAFT_SCHEMA_V6,
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
    ...(customerProfile ? { customerProfile, deliveryAddress: deliveryAddress ?? null } : {}),
    fulfilment: fulfilment as EcommerceFulfilment,
    currency: 'MMK',
    operatingContext: {
      organizationScope,
      operatingUnitLocationId: 'LOC-MAIN',
      sourceAuthority: 'ecommerce',
      targetAuthority: 'commerce',
      recordType: 'order_request',
      writePolicy: 'human_review_required',
    },
    lines,
    pricing: {
      subtotalMmk,
      promotion: {
        schema: 'supermega.commerce.promotion-decision.v1',
        status: promotionStatus as CommercePromotionDecision['status'],
        code: promotionCode,
        policyRevision,
        policyActionId,
        discountBasisPoints,
        grossSubtotalMmk,
        discountMmk,
        netSubtotalMmk,
        reviewedAt,
        reason: promotionReason as CommercePromotionDecision['reason'],
      },
      tax: { adapter: 'price_inclusive', status: 'included', amountMmk: 0 },
      shipping: {
        schema: 'supermega.commerce.shipping-decision.v1',
        status: shipping.status as CommerceShippingDecision['status'],
        reason: shipping.reason as CommerceShippingDecision['reason'],
        township: shippingTownship,
        zoneCode: shippingZoneCode,
        policyRevision: shippingPolicyRevision,
        policyActionId: shippingPolicyActionId,
        feeMmk: shippingFeeMmk,
        promiseMinutes: shippingPromiseMinutes,
        reviewedAt: shippingReviewedAt,
      },
      payment: {
        schema: 'supermega.commerce.payment-decision.v1',
        status: 'approved',
        reason: 'approved',
        adapter: payment.adapter as EcommercePaymentAdapter,
        policyRevision: paymentPolicyRevision,
        policyActionId: paymentPolicyActionId,
        maximumOrderMmk: paymentMaximumOrderMmk,
        instructions: paymentInstructions,
        reviewedAt: paymentReviewedAt,
        authorized: false,
      } as CommercePaymentDecision,
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
