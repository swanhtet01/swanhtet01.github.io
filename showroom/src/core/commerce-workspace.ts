export const COMMERCE_WORKSPACE_SCHEMA = 'supermega.commerce.workspace.v2' as const
export const COMMERCE_STOREFRONT_SCHEMA = 'supermega.ecommerce.storefront.v1' as const
const COMMERCE_STOREFRONT_PREVIEW_SCHEMA = 'supermega.ecommerce.storefront_preview.v1' as const
export const COMMERCE_KEY = 'supermega.commerce.workspace.v2'
export const LEGACY_COMMERCE_KEYS = ['supermega.commerce.workspace.v1', 'supermega.shop.workspace.v2']
export const COMMERCE_LOCK = 'supermega-commerce-workspace-v2'

export type CommerceItem = {
  sku: string
  name: string
  variant?: string
  onHand: number
  reorderAt: number
  price: number
}

export type CommerceOrderStatus = 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled'
export type CommercePaymentStatus = 'pending' | 'reconciled'
export type CommerceRefundStatus = 'none' | 'due' | 'settled'
export type CommerceReturnDisposition = 'restock' | 'not_restocked'

export type CommerceOrderLine = {
  sku: string
  name: string
  variant?: string
  quantity: number
  unitPriceMmk: number
}

export type CommerceOrderReturn = {
  actionId: string
  createdAt: string
  actor: string
  reason: string
  evidenceReference: string
  sku: string
  quantity: number
  disposition: CommerceReturnDisposition
}

export type CommerceOrder = {
  id: string
  createdAt: string
  customer: string
  channel: string
  item: string
  itemSku?: string
  quantity: number
  payment: string
  paymentStatus: CommercePaymentStatus
  refundStatus: CommerceRefundStatus
  paymentReconciledAt?: string
  paymentReconciliationActionId?: string
  paymentReconciledBy?: string
  paymentReconciliationReason?: string
  paymentEvidenceReference?: string
  refundSettledAt?: string
  refundSettlementActionId?: string
  refundSettledBy?: string
  refundSettlementReason?: string
  refundEvidenceReference?: string
  fulfilment?: string
  fulfilmentReference?: string
  sourceRecordId?: string
  evidenceReference?: string
  lines?: CommerceOrderLine[]
  advancementActionIds?: string[]
  completion?: CommerceActionProof
  returns?: CommerceOrderReturn[]
  total: number
  status: CommerceOrderStatus
}

export type CommerceStockMovementKind = 'opening' | 'reserve' | 'release' | 'receipt' | 'count' | 'return'

export type CommerceStockMovement = {
  id: string
  actionId: string
  createdAt: string
  actor: string
  reason: string
  evidenceReference: string
  kind: CommerceStockMovementKind
  sku: string
  quantityDelta: number
  orderId?: string
  purchaseOrderId?: string
  expectedQuantity?: number
  countedQuantity?: number
}

export type CommerceClose = {
  id: string
  createdAt: string
  total: number
  orders: number
  businessDate?: string
  orderIds?: string[]
  paymentExceptionOrderIds?: string[]
  stockExceptionSkus?: string[]
  actionId?: string
  operator?: string
  reason?: string
  evidenceReference?: string
}

export type CommerceCloseExpectation = {
  businessDate: string
  orderIds: string[]
  total: number
  paymentExceptionOrderIds: string[]
  stockExceptionSkus: string[]
  stateSnapshot: string
}

export type CommerceWebsiteSource = {
  fingerprint: string
  approvalId: string
  snapshotId: string
  pageId: string
  siteName: string
  pagePath: string
}

export type CommerceWebsiteIntakeStatus = 'pending_confirmation' | 'converted'

export type CommerceWebsiteIntake = {
  id: string
  createdAt: string
  status: CommerceWebsiteIntakeStatus
  source: CommerceWebsiteSource
  sku: string
  quantity: number
  itemName: string
  itemVariant?: string
  unitPrice: number
  total: number
  creation: CommerceActionProof
  snapshotDigest?: string
  conversion?: CommerceActionProof & { orderId: string }
}

export type CommerceStorefrontRequest = {
  schema: 'supermega.ecommerce.order_request.v1'
  mode: 'browser-local-request'
  state: 'pending_shop_review'
  id: string
  idempotencyKey: string
  createdAt: string
  sourcePreviewDigest: string
  sourceStorefrontRevision?: number | null
  sourceStorefrontActionId?: string | null
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

export type CommerceStorefrontConfiguration = {
  schema: typeof COMMERCE_STOREFRONT_SCHEMA
  revision: number
  shopCatalogSnapshotRevision: number
  shopCatalogDigest: string
  storeName: string
  summary: string
  selectedSkus: string[]
  saved: CommerceActionProof
}

export type CommercePurchaseOrder = {
  id: string
  createdAt: string
  supplier: string
  sku: string
  quantityOrdered: number
  creation: CommerceActionProof
  cancellation?: CommerceActionProof
}

export type CommercePurchaseOrderProgress = {
  received: number
  remaining: number
  status: 'open' | 'partially_received' | 'received' | 'cancelled'
}

export type CommerceCatalogChange = {
  sku: string
  previousPrice: number
  nextPrice: number
  previousReorderAt: number
  nextReorderAt: number
  proof: CommerceActionProof
}

export type CommerceCatalogBaseline = {
  sku: string
  price: number
  reorderAt: number
  proof: CommerceActionProof
  anchorDigest: string
}

export type CommerceState = {
  schema: typeof COMMERCE_WORKSPACE_SCHEMA
  items: CommerceItem[]
  orders: CommerceOrder[]
  movements: CommerceStockMovement[]
  closes: CommerceClose[]
  catalogBaselines?: CommerceCatalogBaseline[]
  catalogChanges?: CommerceCatalogChange[]
  websiteIntakes?: CommerceWebsiteIntake[]
  storefrontRequests?: CommerceStorefrontRequest[]
  storefrontConfiguration?: CommerceStorefrontConfiguration
  purchaseOrders?: CommercePurchaseOrder[]
}

export type CommerceActionProof = {
  actionId: string
  capturedAt: string
  actor: string
  reason: string
  evidenceReference: string
}

export type CommerceItemUpdate = {
  sku: string
  expectedPrice: number
  nextPrice: number
  expectedReorderAt: number
  nextReorderAt: number
}

export type CommerceOrderReturnInput = {
  orderId: string
  sku: string
  quantity: number
  disposition: CommerceReturnDisposition
}

export type CommerceOrderReturnExpectation = {
  orderId: string
  sku: string
  soldQuantity: number
  returnedQuantity: number
  stockOnHand: number | null
  orderSnapshot: string
}

export type CommerceWebsiteIntakeInput = {
  id: string
  source: CommerceWebsiteSource
  sku: string
  quantity: number
}

export type CommerceWebsiteOrderInput = {
  customer: string
  fulfilmentMethod: 'pickup' | 'local_delivery'
  paymentMethod: 'cash_on_delivery' | 'manual_qr' | 'manual_bank_transfer'
}

export type CommercePurchaseOrderInput = {
  id: string
  supplier: string
  sku: string
  quantityOrdered: number
}

type CommerceStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

export type CommerceStorefrontConfigurationInput = {
  storeName: string
  summary: string
  selectedSkus: string[]
  shopCatalogDigest: string
}

type CommerceLockManager = {
  request: <T>(name: string, options: { mode: 'exclusive' }, callback: () => T | Promise<T>) => Promise<T>
}

export type CommerceWorkspaceSnapshot = {
  state: CommerceState
  source: 'current' | 'legacy' | 'seed' | 'recovery'
  error: string
}

export type CommerceMutationResult =
  | { ok: true; state: CommerceState; replayed: boolean }
  | { ok: false; error: string }

const orderStatuses: CommerceOrderStatus[] = ['confirmed', 'preparing', 'ready', 'completed', 'cancelled']
const paymentStatuses: CommercePaymentStatus[] = ['pending', 'reconciled']
const refundStatuses: CommerceRefundStatus[] = ['none', 'due', 'settled']
const movementKinds: CommerceStockMovementKind[] = ['opening', 'reserve', 'release', 'receipt', 'count', 'return']
const returnDispositions: CommerceReturnDisposition[] = ['restock', 'not_restocked']
const websiteIntakeStatuses: CommerceWebsiteIntakeStatus[] = ['pending_confirmation', 'converted']
const closeSnapshotFields = ['businessDate', 'orderIds', 'paymentExceptionOrderIds', 'stockExceptionSkus', 'actionId', 'operator', 'reason', 'evidenceReference'] as const
const refundSettlementFields = ['refundSettledAt', 'refundSettlementActionId', 'refundSettledBy', 'refundSettlementReason', 'refundEvidenceReference'] as const
const websiteIntakeIdPattern = /^WINT-[A-Z0-9-]{8,80}$/
const websiteFingerprintPattern = /^web-[a-f0-9]{8}$/
const storefrontRequestIdPattern = /^ECR-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const storefrontIdempotencyPattern = /^ECI-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const sha256DigestPattern = /^sha256:[a-f0-9]{64}$/
const maxStorefrontRequests = 100
const maxPurchaseOrders = 100
const maxCatalogBaselines = 500
const maxCatalogChanges = 500
const maxOrderLines = 20
const maxReturnsPerOrder = 100
const closeIdPattern = /^CLOSE-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const closeActionIdPattern = /^ACT-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const businessDatePattern = /^\d{4}-\d{2}-\d{2}$/
const purchaseOrderIdPattern = /^PO-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const isoTimestampPattern = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/
const myanmarUtcOffsetMs = (6 * 60 + 30) * 60 * 1000
const deterministicSeedNow = Date.parse('2026-07-23T08:00:00.000Z')

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function requiredText(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be a non-empty string.`)
  return value.trim()
}

function canonicalText(value: unknown, field: string, maximum = 180) {
  const text = requiredText(value, field)
  if (value !== text || text.length > maximum) throw new Error(`${field} must be canonical text of at most ${maximum} characters.`)
  return text
}

function compareCanonicalText(left: string, right: string) {
  const leftCodePoints = Array.from(left, (character) => character.codePointAt(0) as number)
  const rightCodePoints = Array.from(right, (character) => character.codePointAt(0) as number)
  const sharedLength = Math.min(leftCodePoints.length, rightCodePoints.length)
  for (let index = 0; index < sharedLength; index += 1) {
    if (leftCodePoints[index] !== rightCodePoints[index]) return leftCodePoints[index] - rightCodePoints[index]
  }
  return leftCodePoints.length - rightCodePoints.length
}

export function commerceStorefrontConfigurationActionId(revision: number, shopCatalogDigest: string) {
  if (!Number.isSafeInteger(revision) || revision < 1 || !sha256DigestPattern.test(shopCatalogDigest)) {
    throw new Error('Storefront configuration action identity is invalid.')
  }
  return `ACT-STOREFRONT-R${revision}-${shopCatalogDigest.slice('sha256:'.length)}`
}

function optionalText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function timestampMicros(value: unknown): bigint | null {
  if (typeof value !== 'string' || value !== value.trim()) return null
  const match = isoTimestampPattern.exec(value)
  if (!match) return null
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText = '', zone] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  if (year < 1) return null
  const local = new Date(0)
  local.setUTCFullYear(year, month - 1, day)
  local.setUTCHours(hour, minute, second, 0)
  if (local.getUTCFullYear() !== year
    || local.getUTCMonth() !== month - 1
    || local.getUTCDate() !== day
    || local.getUTCHours() !== hour
    || local.getUTCMinutes() !== minute
    || local.getUTCSeconds() !== second) return null
  const offsetMinutes = zone === 'Z'
    ? 0
    : (zone.startsWith('+') ? 1 : -1) * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6)))
  return BigInt(local.getTime() - offsetMinutes * 60_000) * 1_000n
    + BigInt(fractionText.padEnd(6, '0'))
}

function validTimestamp(value: unknown) {
  return timestampMicros(value) !== null
}

function assertSafeInteger(value: unknown, field: string, minimum = 0) {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) throw new Error(`${field} must be a safe integer of at least ${minimum}.`)
}

function assertUnique(values: string[], field: string) {
  if (new Set(values).size !== values.length) throw new Error(`${field} values must be unique.`)
}

function sameStringArray(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function hasExactKeys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  const fields = Object.keys(value)
  return required.every((field) => fields.includes(field))
    && fields.every((field) => required.includes(field) || optional.includes(field))
}

function sameProof(movement: CommerceStockMovement, proof: CommerceActionProof) {
  return movement.actionId === proof.actionId
    && movement.createdAt === proof.capturedAt
    && movement.actor === proof.actor
    && movement.reason === proof.reason
    && movement.evidenceReference === proof.evidenceReference
}

function sameReturnProof(record: CommerceOrderReturn, proof: CommerceActionProof) {
  return record.actionId === proof.actionId
    && record.createdAt === proof.capturedAt
    && record.actor === proof.actor
    && record.reason === proof.reason
    && record.evidenceReference === proof.evidenceReference
}

function movementMatchesReturn(movement: CommerceStockMovement, record: CommerceOrderReturn, orderId: string) {
  return movement.id === `MOV2:${encodeURIComponent(record.actionId)}`
    && movement.kind === 'return'
    && movement.orderId === orderId
    && movement.sku === record.sku
    && movement.quantityDelta === record.quantity
    && movement.actionId === record.actionId
    && movement.createdAt === record.createdAt
    && movement.actor === record.actor
    && movement.reason === record.reason
    && movement.evidenceReference === record.evidenceReference
}

function myanmarBusinessDate(timestamp: string) {
  return new Date(Date.parse(timestamp) + myanmarUtcOffsetMs).toISOString().slice(0, 10)
}

function sameCloseProof(close: CommerceClose, proof: CommerceActionProof) {
  return close.actionId === proof.actionId
    && close.createdAt === proof.capturedAt
    && close.operator === proof.actor
    && close.reason === proof.reason
    && close.evidenceReference === proof.evidenceReference
}

function validProof(proof: CommerceActionProof) {
  return typeof proof?.actionId === 'string'
    && typeof proof?.capturedAt === 'string'
    && typeof proof?.actor === 'string'
    && typeof proof?.reason === 'string'
    && typeof proof?.evidenceReference === 'string'
    && Boolean(
      proof.actionId.trim()
      && proof.actor.trim()
      && proof.reason.trim()
      && proof.evidenceReference.trim()
      && validTimestamp(proof.capturedAt),
    )
}

const sha256RoundConstants = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

function rotateRight(value: number, bits: number) {
  return (value >>> bits) | (value << (32 - bits))
}

function sha256Hex(source: string) {
  const input = new TextEncoder().encode(source)
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLength)
  padded.set(input)
  padded[input.length] = 0x80
  const view = new DataView(padded.buffer)
  const bitLength = BigInt(input.length) * 8n
  view.setUint32(paddedLength - 8, Number(bitLength >> 32n), false)
  view.setUint32(paddedLength - 4, Number(bitLength & 0xffffffffn), false)

  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  const words = new Uint32Array(64)
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false)
    for (let index = 16; index < 64; index += 1) {
      const before15 = words[index - 15]
      const before2 = words[index - 2]
      const sigma0 = rotateRight(before15, 7) ^ rotateRight(before15, 18) ^ (before15 >>> 3)
      const sigma1 = rotateRight(before2, 17) ^ rotateRight(before2, 19) ^ (before2 >>> 10)
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0
    }
    let [a, b, c, d, e, f, g, h] = hash
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
      const choice = (e & f) ^ (~e & g)
      const temporary1 = (h + sum1 + choice + sha256RoundConstants[index] + words[index]) >>> 0
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temporary2 = (sum0 + majority) >>> 0
      h = g
      g = f
      f = e
      e = (d + temporary1) >>> 0
      d = c
      c = b
      b = a
      a = (temporary1 + temporary2) >>> 0
    }
    hash[0] = (hash[0] + a) >>> 0
    hash[1] = (hash[1] + b) >>> 0
    hash[2] = (hash[2] + c) >>> 0
    hash[3] = (hash[3] + d) >>> 0
    hash[4] = (hash[4] + e) >>> 0
    hash[5] = (hash[5] + f) >>> 0
    hash[6] = (hash[6] + g) >>> 0
    hash[7] = (hash[7] + h) >>> 0
  }
  return Array.from(hash, (word) => word.toString(16).padStart(8, '0')).join('')
}

function proofDigestProjection(proof: CommerceActionProof) {
  return [proof.actionId, proof.capturedAt, proof.actor, proof.reason, proof.evidenceReference]
}

export function commerceCatalogBaselineDigest(
  baseline: Omit<CommerceCatalogBaseline, 'anchorDigest'>,
) {
  return `sha256:${sha256Hex(JSON.stringify([
    'supermega.commerce.catalog-baseline.v1',
    baseline.sku,
    baseline.price,
    baseline.reorderAt,
    proofDigestProjection(baseline.proof),
  ]))}`
}

export function createCommerceCatalogBaseline(
  item: Pick<CommerceItem, 'sku' | 'price' | 'reorderAt'>,
  proof: CommerceActionProof,
): CommerceCatalogBaseline {
  const baseline = {
    sku: item.sku,
    price: item.price,
    reorderAt: item.reorderAt,
    proof: { ...proof },
  }
  return { ...baseline, anchorDigest: commerceCatalogBaselineDigest(baseline) }
}

export function commerceWebsiteIntakeSnapshotDigest(
  intake: Omit<CommerceWebsiteIntake, 'snapshotDigest' | 'conversion' | 'status'>,
) {
  return `sha256:${sha256Hex(JSON.stringify([
    'supermega.commerce.website-intake.snapshot.v1',
    intake.id,
    intake.createdAt,
    [
      intake.source.fingerprint,
      intake.source.approvalId,
      intake.source.snapshotId,
      intake.source.pageId,
      intake.source.siteName,
      intake.source.pagePath,
    ],
    intake.sku,
    intake.quantity,
    intake.itemName,
    intake.itemVariant ?? null,
    intake.unitPrice,
    intake.total,
    proofDigestProjection(intake.creation),
  ]))}`
}

function safeBalance(value: number, delta: number) {
  const next = value + delta
  return Number.isSafeInteger(next) && next >= 0 ? next : null
}

export function commerceOrderItemSummary(lines: CommerceOrderLine[]) {
  return lines.length === 1 ? lines[0].name : `${lines.length} items`
}

function reservationLinesForOrder(order: CommerceOrder) {
  if (order.lines !== undefined) return order.lines.map((line) => ({ sku: line.sku, quantity: line.quantity }))
  return order.itemSku ? [{ sku: order.itemSku, quantity: order.quantity }] : []
}

export function createEmptyCommerce(): CommerceState {
  return { schema: COMMERCE_WORKSPACE_SCHEMA, items: [], orders: [], movements: [], closes: [], catalogBaselines: [], catalogChanges: [], websiteIntakes: [], storefrontRequests: [], purchaseOrders: [] }
}

export function createSeedCommerce(now = deterministicSeedNow): CommerceState {
  const firstOrderAt = new Date(now - 54 * 60 * 1000).toISOString()
  const secondOrderAt = new Date(now - 29 * 60 * 1000).toISOString()
  const items: CommerceItem[] = [
    { sku: 'SM-1001', name: 'Daily essentials basket', onHand: 34, reorderAt: 10, price: 18500 },
    { sku: 'SM-1002', name: 'Cold drink pack', onHand: 8, reorderAt: 12, price: 6500 },
    { sku: 'SM-1003', name: 'Household refill', onHand: 21, reorderAt: 8, price: 12000 },
    { sku: 'SM-1004', name: 'Personal care set', onHand: 13, reorderAt: 6, price: 22500 },
    { sku: 'SM-CARE-01', name: 'Family care set', variant: 'Standard bundle', onHand: 14, reorderAt: 6, price: 31000 },
  ]
  const baselineProof: CommerceActionProof = {
    actionId: 'ACT-DEMO-CATALOG-BASELINE',
    capturedAt: new Date(now).toISOString(),
    actor: 'Demo operator',
    reason: 'Anchor the seeded Shop catalog values.',
    evidenceReference: 'DEMO-SEED-CATALOG',
  }
  return {
    schema: COMMERCE_WORKSPACE_SCHEMA,
    items,
    orders: [
      { id: 'ORD-1042', createdAt: firstOrderAt, customer: 'May', channel: 'Messenger', item: 'Daily essentials basket', itemSku: 'SM-1001', quantity: 2, payment: 'KBZPay', paymentStatus: 'pending', refundStatus: 'none', total: 37000, status: 'preparing' },
      { id: 'ORD-1041', createdAt: secondOrderAt, customer: 'Ko Aung', channel: 'Phone', item: 'Household refill', itemSku: 'SM-1003', quantity: 1, payment: 'Cash on delivery', paymentStatus: 'pending', refundStatus: 'none', total: 12000, status: 'ready' },
    ],
    movements: [
      { id: 'MOV-ACT-DEMO-1042', actionId: 'ACT-DEMO-1042', createdAt: firstOrderAt, actor: 'Demo operator', reason: 'Seed the local Commerce walkthrough.', evidenceReference: 'DEMO-SEED-ORD-1042', kind: 'reserve', sku: 'SM-1001', quantityDelta: -2, orderId: 'ORD-1042' },
      { id: 'MOV-ACT-DEMO-1041', actionId: 'ACT-DEMO-1041', createdAt: secondOrderAt, actor: 'Demo operator', reason: 'Seed the local Commerce walkthrough.', evidenceReference: 'DEMO-SEED-ORD-1041', kind: 'reserve', sku: 'SM-1003', quantityDelta: -1, orderId: 'ORD-1041' },
    ],
    closes: [],
    catalogBaselines: items.map((item) => createCommerceCatalogBaseline(item, baselineProof)),
    catalogChanges: [],
    websiteIntakes: [],
    storefrontRequests: [],
    purchaseOrders: [],
  }
}

export function validateCommerceState(value: unknown): CommerceState {
  if (!isRecord(value) || value.schema !== COMMERCE_WORKSPACE_SCHEMA) throw new Error('Commerce workspace schema is not v2.')
  if (!Array.isArray(value.items) || !Array.isArray(value.orders) || !Array.isArray(value.movements) || !Array.isArray(value.closes)) throw new Error('Commerce workspace collections are incomplete.')
  if (value.catalogBaselines !== undefined && !Array.isArray(value.catalogBaselines)) throw new Error('Commerce catalog baselines must be an array when present.')
  if (value.catalogChanges !== undefined && !Array.isArray(value.catalogChanges)) throw new Error('Commerce catalog changes must be an array when present.')
  if (value.websiteIntakes !== undefined && !Array.isArray(value.websiteIntakes)) throw new Error('Commerce Website intakes must be an array when present.')
  if (value.storefrontRequests !== undefined && !Array.isArray(value.storefrontRequests)) throw new Error('Commerce storefront requests must be an array when present.')
  if (value.storefrontConfiguration !== undefined && !isRecord(value.storefrontConfiguration)) throw new Error('Commerce storefront configuration must be an object when present.')
  if (value.purchaseOrders !== undefined && !Array.isArray(value.purchaseOrders)) throw new Error('Commerce purchase orders must be an array when present.')

  const items = value.items as unknown[]
  const orders = value.orders as unknown[]
  const movements = value.movements as unknown[]
  const closes = value.closes as unknown[]
  const catalogBaselines = (value.catalogBaselines ?? []) as unknown[]
  const catalogChanges = (value.catalogChanges ?? []) as unknown[]
  const websiteIntakes = (value.websiteIntakes ?? []) as unknown[]
  const storefrontRequests = (value.storefrontRequests ?? []) as unknown[]
  const storefrontConfiguration = value.storefrontConfiguration
  const purchaseOrders = (value.purchaseOrders ?? []) as unknown[]
  if (catalogBaselines.length > maxCatalogBaselines) throw new Error(`Commerce catalog baselines cannot exceed ${maxCatalogBaselines}.`)
  if (catalogChanges.length > maxCatalogChanges) throw new Error(`Commerce catalog changes cannot exceed ${maxCatalogChanges}.`)
  if (storefrontRequests.length > maxStorefrontRequests) throw new Error(`Commerce storefront requests cannot exceed ${maxStorefrontRequests}.`)
  if (purchaseOrders.length > maxPurchaseOrders) throw new Error(`Commerce purchase orders cannot exceed ${maxPurchaseOrders}.`)
  const itemSkus: string[] = []
  const itemBySku = new Map<string, Record<string, unknown>>()
  const orderIds: string[] = []
  const orderById = new Map<string, Record<string, unknown>>()
  const sourceRecordIds: string[] = []
  const movementIds: string[] = []
  const movementActionIds: string[] = []
  const reconciliationActionIds: string[] = []
  const refundSettlementActionIds: string[] = []
  const advancementActionIds: string[] = []
  const completionActionIds: string[] = []
  const returnActionIds: string[] = []
  const orderReturns: Array<{ orderId: string; record: CommerceOrderReturn }> = []
  const closeActionIds: string[] = []
  const closeBusinessDates: string[] = []
  const closedOrderIds: string[] = []
  const websiteIntakeCreationActionIds: string[] = []
  const websiteIntakeConversionActionIds: string[] = []
  const catalogBaselineActionIds: string[] = []
  const catalogChangeActionIds: string[] = []
  const purchaseOrderActionIds: string[] = []
  const purchaseOrderIds: string[] = []
  const activePurchaseOrderSkus: string[] = []
  const purchaseOrderById = new Map<string, CommercePurchaseOrder>()
  let storefrontConfigurationActionId = ''

  for (const [index, candidate] of items.entries()) {
    if (!isRecord(candidate)) throw new Error(`items[${index}] is invalid.`)
    const sku = canonicalText(candidate.sku, `items[${index}].sku`, 80)
    itemSkus.push(sku)
    itemBySku.set(sku, candidate)
    canonicalText(candidate.name, `items[${index}].name`)
    if (candidate.variant !== undefined) canonicalText(candidate.variant, `items[${index}].variant`)
    assertSafeInteger(candidate.onHand, `items[${index}].onHand`)
    assertSafeInteger(candidate.reorderAt, `items[${index}].reorderAt`)
    assertSafeInteger(candidate.price, `items[${index}].price`, 1)
  }
  assertUnique(itemSkus, 'Item SKU')

  const catalogBaselineSkus: string[] = []
  const catalogBaselineBySku = new Map<string, CommerceCatalogBaseline>()
  const catalogBaselineProofByAction = new Map<string, CommerceActionProof>()
  for (const [index, candidate] of catalogBaselines.entries()) {
    if (!isRecord(candidate) || !hasExactKeys(
      candidate,
      ['sku', 'price', 'reorderAt', 'proof', 'anchorDigest'],
    )) throw new Error(`catalogBaselines[${index}] is invalid.`)
    const sku = canonicalText(candidate.sku, `catalogBaselines[${index}].sku`, 80)
    if (!itemBySku.has(sku)) throw new Error(`catalogBaselines[${index}].sku is unknown.`)
    assertSafeInteger(candidate.price, `catalogBaselines[${index}].price`, 1)
    assertSafeInteger(candidate.reorderAt, `catalogBaselines[${index}].reorderAt`)
    if (!isRecord(candidate.proof)
      || !hasExactKeys(candidate.proof, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
      || !validProof(candidate.proof as CommerceActionProof)) {
      throw new Error(`catalogBaselines[${index}].proof is invalid.`)
    }
    const proof = candidate.proof as unknown as CommerceActionProof
    for (const field of ['actionId', 'actor', 'reason', 'evidenceReference'] as const) {
      canonicalText(proof[field], `catalogBaselines[${index}].proof.${field}`, field === 'actionId' ? 160 : 180)
    }
    if (typeof candidate.anchorDigest !== 'string'
      || !sha256DigestPattern.test(candidate.anchorDigest)
      || candidate.anchorDigest !== commerceCatalogBaselineDigest({
        sku,
        price: Number(candidate.price),
        reorderAt: Number(candidate.reorderAt),
        proof,
      })) {
      throw new Error(`catalogBaselines[${index}].anchorDigest is invalid.`)
    }
    const priorProof = catalogBaselineProofByAction.get(proof.actionId)
    if (priorProof && !sameActionProof(priorProof, proof)) {
      throw new Error(`catalogBaselines[${index}].proof conflicts with its shared catalog command.`)
    }
    const baseline = candidate as unknown as CommerceCatalogBaseline
    catalogBaselineSkus.push(sku)
    catalogBaselineActionIds.push(proof.actionId)
    catalogBaselineBySku.set(sku, baseline)
    catalogBaselineProofByAction.set(proof.actionId, proof)
  }
  assertUnique(catalogBaselineSkus, 'Catalog baseline SKU')

  const newerCatalogChangeBySku = new Map<string, CommerceCatalogChange>()
  for (const [index, candidate] of catalogChanges.entries()) {
    if (!isRecord(candidate) || !hasExactKeys(
      candidate,
      ['sku', 'previousPrice', 'nextPrice', 'previousReorderAt', 'nextReorderAt', 'proof'],
    )) throw new Error(`catalogChanges[${index}] is invalid.`)
    const sku = canonicalText(candidate.sku, `catalogChanges[${index}].sku`, 80)
    const item = itemBySku.get(sku)
    if (!item) throw new Error(`catalogChanges[${index}].sku is unknown.`)
    assertSafeInteger(candidate.previousPrice, `catalogChanges[${index}].previousPrice`, 1)
    assertSafeInteger(candidate.nextPrice, `catalogChanges[${index}].nextPrice`, 1)
    assertSafeInteger(candidate.previousReorderAt, `catalogChanges[${index}].previousReorderAt`)
    assertSafeInteger(candidate.nextReorderAt, `catalogChanges[${index}].nextReorderAt`)
    if (candidate.previousPrice === candidate.nextPrice
      && candidate.previousReorderAt === candidate.nextReorderAt) {
      throw new Error(`catalogChanges[${index}] cannot record an unchanged item.`)
    }
    if (!isRecord(candidate.proof)
      || !hasExactKeys(candidate.proof, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
      || !validProof(candidate.proof as CommerceActionProof)) {
      throw new Error(`catalogChanges[${index}].proof is invalid.`)
    }
    const proof = candidate.proof as unknown as CommerceActionProof
    for (const field of ['actionId', 'actor', 'reason', 'evidenceReference'] as const) {
      canonicalText(proof[field], `catalogChanges[${index}].proof.${field}`, field === 'actionId' ? 160 : 180)
    }
    const change = candidate as unknown as CommerceCatalogChange
    const newer = newerCatalogChangeBySku.get(sku)
    if (!newer) {
      if (item.price !== change.nextPrice || item.reorderAt !== change.nextReorderAt) {
        throw new Error(`catalogChanges[${index}] does not match the current catalog item.`)
      }
    } else if (newer.previousPrice !== change.nextPrice
      || newer.previousReorderAt !== change.nextReorderAt
      || (timestampMicros(newer.proof.capturedAt) as bigint) < (timestampMicros(change.proof.capturedAt) as bigint)) {
      throw new Error(`catalogChanges[${index}] breaks the newest-first item history.`)
    }
    newerCatalogChangeBySku.set(sku, change)
    catalogChangeActionIds.push(proof.actionId)
  }
  for (const [sku, oldestChange] of newerCatalogChangeBySku) {
    const baseline = catalogBaselineBySku.get(sku)
    if (!baseline) throw new Error(`Catalog change history for ${sku} has no anchored baseline.`)
    if (baseline.price !== oldestChange.previousPrice
      || baseline.reorderAt !== oldestChange.previousReorderAt
      || (timestampMicros(baseline.proof.capturedAt) as bigint) > (timestampMicros(oldestChange.proof.capturedAt) as bigint)) {
      throw new Error(`Catalog change history for ${sku} does not start from its anchored baseline.`)
    }
  }
  for (const [sku, baseline] of catalogBaselineBySku) {
    if (newerCatalogChangeBySku.has(sku)) continue
    const item = itemBySku.get(sku) as Record<string, unknown>
    if (item.price !== baseline.price || item.reorderAt !== baseline.reorderAt) {
      throw new Error(`Catalog baseline for ${sku} does not match the unchanged catalog item.`)
    }
  }

  for (const [index, candidate] of purchaseOrders.entries()) {
    if (!isRecord(candidate) || !hasExactKeys(
      candidate,
      ['id', 'createdAt', 'supplier', 'sku', 'quantityOrdered', 'creation'],
      ['cancellation'],
    )) throw new Error(`purchaseOrders[${index}] is invalid.`)
    const id = canonicalText(candidate.id, `purchaseOrders[${index}].id`, 80)
    if (!purchaseOrderIdPattern.test(id)) throw new Error(`purchaseOrders[${index}].id is invalid.`)
    if (!validTimestamp(candidate.createdAt)) throw new Error(`purchaseOrders[${index}].createdAt is invalid.`)
    canonicalText(candidate.supplier, `purchaseOrders[${index}].supplier`, 120)
    const sku = canonicalText(candidate.sku, `purchaseOrders[${index}].sku`, 80)
    if (!itemSkus.includes(sku)) throw new Error(`purchaseOrders[${index}].sku is unknown.`)
    assertSafeInteger(candidate.quantityOrdered, `purchaseOrders[${index}].quantityOrdered`, 1)
    if (!isRecord(candidate.creation)
      || !hasExactKeys(candidate.creation, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
      || !validProof(candidate.creation as CommerceActionProof)
      || candidate.creation.capturedAt !== candidate.createdAt) {
      throw new Error(`purchaseOrders[${index}].creation is invalid.`)
    }
    for (const field of ['actionId', 'actor', 'reason', 'evidenceReference'] as const) {
      canonicalText(candidate.creation[field], `purchaseOrders[${index}].creation.${field}`, field === 'actionId' ? 160 : 180)
    }
    purchaseOrderActionIds.push(candidate.creation.actionId as string)
    if (candidate.cancellation !== undefined) {
      if (!isRecord(candidate.cancellation)
        || !hasExactKeys(candidate.cancellation, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
        || !validProof(candidate.cancellation as CommerceActionProof)
        || (timestampMicros(candidate.cancellation.capturedAt) as bigint) < (timestampMicros(candidate.createdAt) as bigint)) {
        throw new Error(`purchaseOrders[${index}].cancellation is invalid.`)
      }
      for (const field of ['actionId', 'actor', 'reason', 'evidenceReference'] as const) {
        canonicalText(candidate.cancellation[field], `purchaseOrders[${index}].cancellation.${field}`, field === 'actionId' ? 160 : 180)
      }
      purchaseOrderActionIds.push(candidate.cancellation.actionId as string)
    }
    purchaseOrderIds.push(id)
    purchaseOrderById.set(id, candidate as unknown as CommercePurchaseOrder)
  }
  assertUnique(purchaseOrderIds, 'Purchase order ID')

  if (storefrontConfiguration !== undefined) {
    if (!hasExactKeys(
      storefrontConfiguration,
      ['schema', 'revision', 'shopCatalogSnapshotRevision', 'shopCatalogDigest', 'storeName', 'summary', 'selectedSkus', 'saved'],
    ) || storefrontConfiguration.schema !== COMMERCE_STOREFRONT_SCHEMA) {
      throw new Error('storefrontConfiguration is invalid.')
    }
    assertSafeInteger(storefrontConfiguration.revision, 'storefrontConfiguration.revision', 1)
    assertSafeInteger(storefrontConfiguration.shopCatalogSnapshotRevision, 'storefrontConfiguration.shopCatalogSnapshotRevision', 1)
    if (typeof storefrontConfiguration.shopCatalogDigest !== 'string' || !sha256DigestPattern.test(storefrontConfiguration.shopCatalogDigest)) {
      throw new Error('storefrontConfiguration.shopCatalogDigest is invalid.')
    }
    canonicalText(storefrontConfiguration.storeName, 'storefrontConfiguration.storeName', 60)
    canonicalText(storefrontConfiguration.summary, 'storefrontConfiguration.summary', 180)
    if (!Array.isArray(storefrontConfiguration.selectedSkus)
      || storefrontConfiguration.selectedSkus.length < 1
      || storefrontConfiguration.selectedSkus.length > 8) {
      throw new Error('storefrontConfiguration.selectedSkus must contain 1 to 8 Shop SKUs.')
    }
    const selectedSkus = storefrontConfiguration.selectedSkus.map((sku, index) => (
      canonicalText(sku, `storefrontConfiguration.selectedSkus[${index}]`, 80)
    ))
    assertUnique(selectedSkus, 'Storefront selected SKU')
    if (selectedSkus.some((sku) => !itemSkus.includes(sku))
      || !sameStringArray(selectedSkus, [...selectedSkus].sort(compareCanonicalText))) {
      throw new Error('storefrontConfiguration.selectedSkus must be sorted current Shop SKUs.')
    }
    if (!isRecord(storefrontConfiguration.saved)
      || !hasExactKeys(storefrontConfiguration.saved, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
      || !validProof(storefrontConfiguration.saved as CommerceActionProof)
      || storefrontConfiguration.saved.evidenceReference !== `ECOMMERCE-STOREFRONT:${storefrontConfiguration.shopCatalogDigest}:R${storefrontConfiguration.revision}`) {
      throw new Error('storefrontConfiguration.saved is invalid.')
    }
    const saved = storefrontConfiguration.saved as CommerceActionProof
    storefrontConfigurationActionId = canonicalText(saved.actionId, 'storefrontConfiguration.saved.actionId', 160)
    if (storefrontConfigurationActionId !== commerceStorefrontConfigurationActionId(
      storefrontConfiguration.revision as number,
      storefrontConfiguration.shopCatalogDigest,
    )) {
      throw new Error('storefrontConfiguration.saved.actionId is invalid.')
    }
    if (!validTimestamp(saved.capturedAt)) throw new Error('storefrontConfiguration.saved.capturedAt is invalid.')
    for (const field of ['actor', 'reason', 'evidenceReference'] as const) {
      canonicalText(saved[field], `storefrontConfiguration.saved.${field}`)
    }
  }

  for (const [index, candidate] of orders.entries()) {
    if (!isRecord(candidate)) throw new Error(`orders[${index}] is invalid.`)
    orderIds.push(requiredText(candidate.id, `orders[${index}].id`))
    if (!validTimestamp(candidate.createdAt)) throw new Error(`orders[${index}].createdAt is invalid.`)
    for (const field of ['customer', 'channel', 'item', 'payment'] as const) requiredText(candidate[field], `orders[${index}].${field}`)
    if (candidate.itemSku !== undefined && !itemSkus.includes(requiredText(candidate.itemSku, `orders[${index}].itemSku`))) throw new Error(`orders[${index}].itemSku is unknown.`)
    assertSafeInteger(candidate.quantity, `orders[${index}].quantity`, 1)
    assertSafeInteger(candidate.total, `orders[${index}].total`)
    if (candidate.lines !== undefined) {
      if (!Array.isArray(candidate.lines) || candidate.lines.length < 1 || candidate.lines.length > maxOrderLines) throw new Error(`orders[${index}].lines must contain 1 to ${maxOrderLines} entries.`)
      const lineSkus: string[] = []
      let capturedQuantity = 0
      let capturedTotal = 0
      for (const [lineIndex, lineCandidate] of candidate.lines.entries()) {
        if (!isRecord(lineCandidate) || !hasExactKeys(lineCandidate, ['sku', 'name', 'quantity', 'unitPriceMmk'], ['variant'])) throw new Error(`orders[${index}].lines[${lineIndex}] is invalid.`)
        const lineSku = canonicalText(lineCandidate.sku, `orders[${index}].lines[${lineIndex}].sku`, 80)
        if (!itemSkus.includes(lineSku)) throw new Error(`orders[${index}].lines[${lineIndex}].sku is unknown.`)
        canonicalText(lineCandidate.name, `orders[${index}].lines[${lineIndex}].name`)
        if (lineCandidate.variant !== undefined) canonicalText(lineCandidate.variant, `orders[${index}].lines[${lineIndex}].variant`)
        assertSafeInteger(lineCandidate.quantity, `orders[${index}].lines[${lineIndex}].quantity`, 1)
        assertSafeInteger(lineCandidate.unitPriceMmk, `orders[${index}].lines[${lineIndex}].unitPriceMmk`, 1)
        const nextQuantity = capturedQuantity + Number(lineCandidate.quantity)
        const lineTotal = Number(lineCandidate.quantity) * Number(lineCandidate.unitPriceMmk)
        const nextTotal = capturedTotal + lineTotal
        if (!Number.isSafeInteger(nextQuantity) || !Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(nextTotal)) throw new Error(`orders[${index}].lines exceed the safe integer limit.`)
        capturedQuantity = nextQuantity
        capturedTotal = nextTotal
        lineSkus.push(lineSku)
      }
      assertUnique(lineSkus, `orders[${index}] line SKU`)
      const capturedLines = candidate.lines as CommerceOrderLine[]
      const expectedItemSku = capturedLines.length === 1 ? capturedLines[0].sku : undefined
      if (candidate.item !== commerceOrderItemSummary(capturedLines)
        || candidate.itemSku !== expectedItemSku
        || candidate.quantity !== capturedQuantity
        || candidate.total !== capturedTotal) throw new Error(`orders[${index}] does not match its immutable line snapshots.`)
    }
    if (!orderStatuses.includes(candidate.status as CommerceOrderStatus)) throw new Error(`orders[${index}].status is invalid.`)
    if (!paymentStatuses.includes(candidate.paymentStatus as CommercePaymentStatus)) throw new Error(`orders[${index}].paymentStatus is invalid.`)
    if (!refundStatuses.includes(candidate.refundStatus as CommerceRefundStatus)) throw new Error(`orders[${index}].refundStatus is invalid.`)
    if (candidate.advancementActionIds !== undefined) {
      if (!Array.isArray(candidate.advancementActionIds)
        || candidate.advancementActionIds.length > 2
        || candidate.advancementActionIds.length > ({ confirmed: 0, preparing: 1, ready: 2, completed: 2, cancelled: 2 }[candidate.status as CommerceOrderStatus])) {
        throw new Error(`orders[${index}].advancementActionIds is invalid.`)
      }
      const orderAdvancementActionIds = candidate.advancementActionIds.map((actionId, actionIndex) => (
        canonicalText(actionId, `orders[${index}].advancementActionIds[${actionIndex}]`, 160)
      ))
      assertUnique(orderAdvancementActionIds, `orders[${index}] advancement action ID`)
      advancementActionIds.push(...orderAdvancementActionIds)
    }
    for (const field of ['fulfilment', 'fulfilmentReference', 'sourceRecordId', 'evidenceReference'] as const) {
      if (candidate[field] !== undefined) {
        const fieldValue = field === 'fulfilmentReference'
          ? canonicalText(candidate[field], `orders[${index}].${field}`, 160)
          : requiredText(candidate[field], `orders[${index}].${field}`)
        if (field === 'sourceRecordId') sourceRecordIds.push(fieldValue)
      }
    }
    if (candidate.paymentStatus === 'reconciled') {
      if (!validTimestamp(candidate.paymentReconciledAt)) throw new Error(`orders[${index}].paymentReconciledAt is invalid.`)
      reconciliationActionIds.push(requiredText(candidate.paymentReconciliationActionId, `orders[${index}].paymentReconciliationActionId`))
      requiredText(candidate.paymentReconciledBy, `orders[${index}].paymentReconciledBy`)
      requiredText(candidate.paymentReconciliationReason, `orders[${index}].paymentReconciliationReason`)
      requiredText(candidate.paymentEvidenceReference, `orders[${index}].paymentEvidenceReference`)
    } else if (candidate.paymentReconciledAt !== undefined || candidate.paymentReconciliationActionId !== undefined || candidate.paymentReconciledBy !== undefined || candidate.paymentReconciliationReason !== undefined || candidate.paymentEvidenceReference !== undefined) {
      throw new Error(`orders[${index}] has reconciliation evidence while payment is pending.`)
    }
    const presentRefundSettlementFields = refundSettlementFields.filter((field) => candidate[field] !== undefined)
    if (candidate.refundStatus === 'settled') {
      if (presentRefundSettlementFields.length !== refundSettlementFields.length) throw new Error(`orders[${index}] requires complete refund settlement evidence.`)
      if (!validTimestamp(candidate.refundSettledAt) || String(candidate.refundSettledAt).length > 40) throw new Error(`orders[${index}].refundSettledAt is invalid.`)
      refundSettlementActionIds.push(canonicalText(candidate.refundSettlementActionId, `orders[${index}].refundSettlementActionId`, 160))
      canonicalText(candidate.refundSettledBy, `orders[${index}].refundSettledBy`)
      canonicalText(candidate.refundSettlementReason, `orders[${index}].refundSettlementReason`)
      canonicalText(candidate.refundEvidenceReference, `orders[${index}].refundEvidenceReference`)
    } else if (presentRefundSettlementFields.length) {
      throw new Error(`orders[${index}] has settlement evidence while refund is ${candidate.refundStatus}.`)
    }
    if ((candidate.refundStatus === 'due' || candidate.refundStatus === 'settled') && (candidate.status !== 'cancelled' || candidate.paymentStatus !== 'reconciled')) throw new Error(`orders[${index}] has an invalid refund exception.`)
    if (candidate.status === 'cancelled' && candidate.paymentStatus === 'reconciled' && candidate.refundStatus !== 'due' && candidate.refundStatus !== 'settled') throw new Error(`orders[${index}] must preserve a due or settled refund.`)
    if (candidate.completion !== undefined) {
      if (candidate.status !== 'completed'
        || !isRecord(candidate.completion)
        || !hasExactKeys(candidate.completion, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
        || !validProof(candidate.completion as CommerceActionProof)) {
        throw new Error(`orders[${index}].completion is invalid.`)
      }
      const completion = candidate.completion as CommerceActionProof
      for (const field of ['actionId', 'actor', 'reason', 'evidenceReference'] as const) {
        canonicalText(completion[field], `orders[${index}].completion.${field}`, field === 'actionId' ? 160 : 180)
      }
      if ((timestampMicros(completion.capturedAt) as bigint) < (timestampMicros(candidate.createdAt) as bigint)
        || (candidate.paymentReconciledAt !== undefined
          && (timestampMicros(completion.capturedAt) as bigint) < (timestampMicros(candidate.paymentReconciledAt) as bigint))) {
        throw new Error(`orders[${index}].completion is outside the order chronology.`)
      }
      completionActionIds.push(completion.actionId)
    } else if (candidate.returns !== undefined) {
      throw new Error(`orders[${index}] cannot retain returns without completion proof.`)
    }
    if (candidate.returns !== undefined) {
      if (!Array.isArray(candidate.returns)
        || candidate.returns.length < 1
        || candidate.returns.length > maxReturnsPerOrder
        || candidate.status !== 'completed') {
        throw new Error(`orders[${index}].returns requires 1 to ${maxReturnsPerOrder} records on a completed order.`)
      }
      const soldBySku = new Map(reservationLinesForOrder(candidate as unknown as CommerceOrder).map((line) => [line.sku, line.quantity]))
      const returnedBySku = new Map<string, number>()
      let newerReturnAt: bigint | null = null
      for (const [returnIndex, returnCandidate] of candidate.returns.entries()) {
        if (!isRecord(returnCandidate) || !hasExactKeys(
          returnCandidate,
          ['actionId', 'createdAt', 'actor', 'reason', 'evidenceReference', 'sku', 'quantity', 'disposition'],
        )) throw new Error(`orders[${index}].returns[${returnIndex}] is invalid.`)
        const returnRecord = returnCandidate as unknown as CommerceOrderReturn
        const actionId = canonicalText(returnRecord.actionId, `orders[${index}].returns[${returnIndex}].actionId`, 160)
        const createdAt = timestampMicros(returnRecord.createdAt)
        if (createdAt === null
          || createdAt < (timestampMicros((candidate.completion as CommerceActionProof).capturedAt) as bigint)
          || (candidate.paymentReconciledAt !== undefined
            && createdAt < (timestampMicros(candidate.paymentReconciledAt) as bigint))
          || (newerReturnAt !== null && createdAt > newerReturnAt)) {
          throw new Error(`orders[${index}].returns[${returnIndex}].createdAt is outside the order chronology.`)
        }
        newerReturnAt = createdAt
        for (const field of ['actor', 'reason', 'evidenceReference'] as const) {
          canonicalText(returnRecord[field], `orders[${index}].returns[${returnIndex}].${field}`)
        }
        const returnSku = canonicalText(returnRecord.sku, `orders[${index}].returns[${returnIndex}].sku`, 80)
        const soldQuantity = soldBySku.get(returnSku)
        assertSafeInteger(returnRecord.quantity, `orders[${index}].returns[${returnIndex}].quantity`, 1)
        if (!returnDispositions.includes(returnRecord.disposition)) {
          throw new Error(`orders[${index}].returns[${returnIndex}].disposition is invalid.`)
        }
        const returnedQuantity = (returnedBySku.get(returnSku) ?? 0) + returnRecord.quantity
        if (!soldQuantity || !Number.isSafeInteger(returnedQuantity) || returnedQuantity > soldQuantity) {
          throw new Error(`orders[${index}].returns exceed the sold quantity for ${returnSku}.`)
        }
        returnedBySku.set(returnSku, returnedQuantity)
        returnActionIds.push(actionId)
        orderReturns.push({ orderId: candidate.id as string, record: returnRecord })
      }
    }
    orderById.set(candidate.id as string, candidate)
  }
  assertUnique(orderIds, 'Order ID')
  assertUnique(sourceRecordIds, 'Order source record ID')
  assertUnique(reconciliationActionIds, 'Payment reconciliation action ID')
  assertUnique(refundSettlementActionIds, 'Refund settlement action ID')
  assertUnique(completionActionIds, 'Order completion action ID')
  assertUnique(returnActionIds, 'Order return action ID')

  const reserveByOrder = new Map<string, number>()
  const releaseByOrder = new Map<string, number>()
  const reserveActionsByOrder = new Map<string, Set<string>>()
  const releaseActionsByOrder = new Map<string, Set<string>>()
  const movementsByAction = new Map<string, CommerceStockMovement[]>()
  const receiptQuantityByPurchaseOrder = new Map<string, number>()
  const latestReceiptAtByPurchaseOrder = new Map<string, bigint>()
  for (const [index, candidate] of movements.entries()) {
    if (!isRecord(candidate) || !hasExactKeys(
      candidate,
      ['id', 'actionId', 'createdAt', 'actor', 'reason', 'evidenceReference', 'kind', 'sku', 'quantityDelta'],
      ['orderId', 'purchaseOrderId', 'expectedQuantity', 'countedQuantity'],
    )) throw new Error(`movements[${index}] is invalid.`)
    movementIds.push(requiredText(candidate.id, `movements[${index}].id`))
    movementActionIds.push(requiredText(candidate.actionId, `movements[${index}].actionId`))
    if (!validTimestamp(candidate.createdAt)) throw new Error(`movements[${index}].createdAt is invalid.`)
    for (const field of ['actor', 'reason', 'evidenceReference', 'sku'] as const) requiredText(candidate[field], `movements[${index}].${field}`)
    if (!itemSkus.includes(candidate.sku as string)) throw new Error(`movements[${index}].sku is unknown.`)
    if (!movementKinds.includes(candidate.kind as CommerceStockMovementKind)) throw new Error(`movements[${index}].kind is invalid.`)
    const actionMovements = movementsByAction.get(candidate.actionId as string) ?? []
    actionMovements.push(candidate as unknown as CommerceStockMovement)
    movementsByAction.set(candidate.actionId as string, actionMovements)
    if (candidate.kind === 'count') {
      if (!Number.isSafeInteger(candidate.quantityDelta)
        || candidate.orderId !== undefined
        || candidate.purchaseOrderId !== undefined) throw new Error(`movements[${index}] count fields are invalid.`)
      assertSafeInteger(candidate.expectedQuantity, `movements[${index}].expectedQuantity`)
      assertSafeInteger(candidate.countedQuantity, `movements[${index}].countedQuantity`)
      if (candidate.quantityDelta !== Number(candidate.countedQuantity) - Number(candidate.expectedQuantity)) throw new Error(`movements[${index}] count variance is invalid.`)
      continue
    }
    if (candidate.expectedQuantity !== undefined || candidate.countedQuantity !== undefined) throw new Error(`movements[${index}] count fields are unsupported for ${String(candidate.kind)}.`)
    if (candidate.kind === 'opening') {
      assertSafeInteger(candidate.quantityDelta, `movements[${index}].quantityDelta`)
      if (candidate.orderId !== undefined || candidate.purchaseOrderId !== undefined) throw new Error(`movements[${index}] opening balance cannot reference an order.`)
      continue
    }
    if (!Number.isSafeInteger(candidate.quantityDelta) || candidate.quantityDelta === 0) throw new Error(`movements[${index}].quantityDelta is invalid.`)
    if (candidate.kind === 'reserve' && Number(candidate.quantityDelta) >= 0) throw new Error(`movements[${index}] reserve must be negative.`)
    if (candidate.kind !== 'reserve' && Number(candidate.quantityDelta) <= 0) throw new Error(`movements[${index}] release, receipt, or return must be positive.`)
    if (candidate.kind === 'receipt') {
      if (candidate.orderId !== undefined) throw new Error(`movements[${index}] receipt cannot reference an order.`)
      if (candidate.purchaseOrderId !== undefined) {
        const purchaseOrderId = canonicalText(candidate.purchaseOrderId, `movements[${index}].purchaseOrderId`, 80)
        const purchaseOrder = purchaseOrderById.get(purchaseOrderId)
        const createdAt = timestampMicros(candidate.createdAt) as bigint
        if (!purchaseOrder
          || purchaseOrder.sku !== candidate.sku
          || createdAt < (timestampMicros(purchaseOrder.createdAt) as bigint)
          || (purchaseOrder.cancellation && createdAt > (timestampMicros(purchaseOrder.cancellation.capturedAt) as bigint))) {
          throw new Error(`movements[${index}] does not match its purchase order.`)
        }
        const received = (receiptQuantityByPurchaseOrder.get(purchaseOrderId) ?? 0) + Number(candidate.quantityDelta)
        if (!Number.isSafeInteger(received) || received > purchaseOrder.quantityOrdered) {
          throw new Error(`movements[${index}] exceeds its purchase order quantity.`)
        }
        receiptQuantityByPurchaseOrder.set(purchaseOrderId, received)
        const latestReceiptAt = latestReceiptAtByPurchaseOrder.get(purchaseOrderId) ?? 0n
        latestReceiptAtByPurchaseOrder.set(purchaseOrderId, createdAt > latestReceiptAt ? createdAt : latestReceiptAt)
      }
      continue
    }
    if (candidate.purchaseOrderId !== undefined) throw new Error(`movements[${index}] sales movement cannot reference a purchase order.`)
    const orderId = requiredText(candidate.orderId, `movements[${index}].orderId`)
    if (candidate.kind === 'return') {
      const matchingReturns = orderReturns.filter(({ orderId: returnOrderId, record }) => (
        returnOrderId === orderId && record.actionId === candidate.actionId
      ))
      if (matchingReturns.length !== 1
        || matchingReturns[0].record.disposition !== 'restock'
        || !movementMatchesReturn(candidate as unknown as CommerceStockMovement, matchingReturns[0].record, orderId)) {
        throw new Error(`movements[${index}] does not match one sellable order return.`)
      }
      continue
    }
    const order = orders.find((entry) => isRecord(entry) && entry.id === orderId) as Record<string, unknown> | undefined
    const orderLines = order ? reservationLinesForOrder(order as unknown as CommerceOrder) : []
    const matchingLines = orderLines.filter((line) => line.sku === candidate.sku)
    if (!order || matchingLines.length !== 1 || Math.abs(Number(candidate.quantityDelta)) !== matchingLines[0].quantity) throw new Error(`movements[${index}] does not match its order reservation.`)
    const counter = candidate.kind === 'reserve' ? reserveByOrder : releaseByOrder
    counter.set(orderId, (counter.get(orderId) ?? 0) + 1)
    const actions = candidate.kind === 'reserve' ? reserveActionsByOrder : releaseActionsByOrder
    const orderActions = actions.get(orderId) ?? new Set<string>()
    orderActions.add(candidate.actionId as string)
    actions.set(orderId, orderActions)
    if (candidate.kind === 'release' && order.status !== 'cancelled') throw new Error(`movements[${index}] release requires a cancelled order.`)
  }
  assertUnique(movementIds, 'Stock movement ID')
  const validatedMovements = movements as unknown as CommerceStockMovement[]
  for (const { orderId, record } of orderReturns) {
    const order = orderById.get(orderId) as unknown as CommerceOrder | undefined
    const lines = order ? reservationLinesForOrder(order) : []
    const reserves = validatedMovements.filter((movement) => movement.kind === 'reserve' && movement.orderId === orderId)
    const releases = validatedMovements.filter((movement) => movement.kind === 'release' && movement.orderId === orderId)
    const latestBasis = [
      order?.createdAt,
      order?.paymentReconciledAt,
      order?.completion?.capturedAt,
      ...reserves.map((movement) => movement.createdAt),
    ].flatMap((timestamp) => timestamp ? [timestampMicros(timestamp) as bigint] : [])
      .reduce((latest, timestamp) => timestamp > latest ? timestamp : latest, 0n)
    const actionMovements = movementsByAction.get(record.actionId) ?? []
    if (!order
      || order.status !== 'completed'
      || !order.completion
      || !lines.length
      || reserves.length !== lines.length
      || releases.length
      || lines.some((line) => reserves.filter((movement) => (
        movement.sku === line.sku && movement.quantityDelta === -line.quantity
      )).length !== 1)
      || (timestampMicros(record.createdAt) as bigint) < latestBasis
      || (record.disposition === 'restock'
        ? actionMovements.length !== 1 || !movementMatchesReturn(actionMovements[0], record, orderId)
        : actionMovements.length !== 0)) {
      throw new Error(`Order return ${record.actionId} is not bound to one completed, reserved sale.`)
    }
  }
  for (const [actionId, actionMovements] of movementsByAction) {
    if (actionMovements.length < 2) continue
    const first = actionMovements[0]
    if ((first.kind !== 'reserve' && first.kind !== 'release')
      || !first.orderId
      || new Set(actionMovements.map((movement) => movement.sku)).size !== actionMovements.length
      || actionMovements.some((movement) => movement.kind !== first.kind
        || movement.orderId !== first.orderId
        || movement.createdAt !== first.createdAt
        || movement.actor !== first.actor
        || movement.reason !== first.reason
        || movement.evidenceReference !== first.evidenceReference)) throw new Error(`Stock movement action ${actionId} is not one exact order reservation group.`)
  }
  for (const [sku, item] of itemBySku) {
    const skuMovements = movements.filter(
      (movement): movement is CommerceStockMovement => isRecord(movement) && movement.sku === sku,
    )
    const oldestCountIndex = skuMovements.map((movement) => movement.kind === 'count').lastIndexOf(true)
    if (oldestCountIndex < 0) continue
    let balance = Number(item.onHand)
    for (const movement of skuMovements.slice(0, oldestCountIndex + 1)) {
      if (movement.kind === 'count' && movement.countedQuantity !== balance) throw new Error(`Stock count ${String(movement.actionId)} does not match the later movement history for ${sku}.`)
      const priorBalance = balance - Number(movement.quantityDelta)
      if (!Number.isSafeInteger(priorBalance) || priorBalance < 0) throw new Error(`Stock movement history for ${sku} has an invalid prior balance.`)
      if (movement.kind === 'count' && movement.expectedQuantity !== priorBalance) throw new Error(`Stock count ${String(movement.actionId)} does not match its expected balance for ${sku}.`)
      balance = priorBalance
    }
  }
  for (const [orderId, count] of reserveByOrder) {
    const order = orderById.get(orderId)
    if (!order
      || count !== reservationLinesForOrder(order as unknown as CommerceOrder).length
      || reserveActionsByOrder.get(orderId)?.size !== 1) throw new Error(`${orderId} does not have one reservation action covering every order line.`)
  }
  for (const [orderId, count] of releaseByOrder) {
    const order = orderById.get(orderId)
    const expected = order ? reservationLinesForOrder(order as unknown as CommerceOrder).length : 0
    if (!expected
      || count !== expected
      || reserveByOrder.get(orderId) !== expected
      || releaseActionsByOrder.get(orderId)?.size !== 1) throw new Error(`${orderId} has an unproven stock release.`)
  }
  for (const purchaseOrder of purchaseOrderById.values()) {
    const received = receiptQuantityByPurchaseOrder.get(purchaseOrder.id) ?? 0
    if (purchaseOrder.cancellation) {
      if (received >= purchaseOrder.quantityOrdered
        || (timestampMicros(purchaseOrder.cancellation.capturedAt) as bigint) < (latestReceiptAtByPurchaseOrder.get(purchaseOrder.id) ?? 0n)) {
        throw new Error(`${purchaseOrder.id} has an invalid cancellation boundary.`)
      }
    } else if (received < purchaseOrder.quantityOrdered) {
      activePurchaseOrderSkus.push(purchaseOrder.sku)
    }
  }
  assertUnique(activePurchaseOrderSkus, 'Active purchase order SKU')

  const closeIds: string[] = []
  for (const [index, candidate] of closes.entries()) {
    if (!isRecord(candidate) || !hasExactKeys(
      candidate,
      ['id', 'createdAt', 'total', 'orders'],
      [...closeSnapshotFields],
    )) throw new Error(`closes[${index}] is invalid.`)
    closeIds.push(requiredText(candidate.id, `closes[${index}].id`))
    if (!validTimestamp(candidate.createdAt)) throw new Error(`closes[${index}].createdAt is invalid.`)
    assertSafeInteger(candidate.total, `closes[${index}].total`)
    assertSafeInteger(candidate.orders, `closes[${index}].orders`)
    const presentSnapshotFields = closeSnapshotFields.filter((field) => candidate[field] !== undefined)
    if (presentSnapshotFields.length && presentSnapshotFields.length !== closeSnapshotFields.length) {
      throw new Error(`closes[${index}] has incomplete exception and operator evidence.`)
    }
    if (presentSnapshotFields.length) {
      if (!Array.isArray(candidate.orderIds) || !Array.isArray(candidate.paymentExceptionOrderIds) || !Array.isArray(candidate.stockExceptionSkus)) {
        throw new Error(`closes[${index}] exception references must be arrays.`)
      }
      const businessDate = canonicalText(candidate.businessDate, `closes[${index}].businessDate`, 10)
      const orderIdsForClose = candidate.orderIds.map((value, referenceIndex) => canonicalText(value, `closes[${index}].orderIds[${referenceIndex}]`, 160))
      const paymentExceptionOrderIds = candidate.paymentExceptionOrderIds.map((value, referenceIndex) => canonicalText(value, `closes[${index}].paymentExceptionOrderIds[${referenceIndex}]`, 160))
      const stockExceptionSkus = candidate.stockExceptionSkus.map((value, referenceIndex) => canonicalText(value, `closes[${index}].stockExceptionSkus[${referenceIndex}]`, 80))
      if (!businessDatePattern.test(businessDate) || businessDate !== myanmarBusinessDate(String(candidate.createdAt))) throw new Error(`closes[${index}].businessDate must match its Myanmar close date.`)
      assertUnique(orderIdsForClose, `closes[${index}] order ID`)
      assertUnique(paymentExceptionOrderIds, `closes[${index}] payment exception order ID`)
      assertUnique(stockExceptionSkus, `closes[${index}] stock exception SKU`)
      if (orderIdsForClose.some((orderId) => !orderIds.includes(orderId))) throw new Error(`closes[${index}] references an unknown closed order.`)
      if (paymentExceptionOrderIds.some((orderId) => !orderIds.includes(orderId))) throw new Error(`closes[${index}] references an unknown payment exception order.`)
      if (stockExceptionSkus.some((sku) => !itemSkus.includes(sku))) throw new Error(`closes[${index}] references an unknown stock exception SKU.`)
      if (!sameStringArray(orderIdsForClose, [...orderIdsForClose].sort())
        || !sameStringArray(paymentExceptionOrderIds, [...paymentExceptionOrderIds].sort())
        || !sameStringArray(stockExceptionSkus, [...stockExceptionSkus].sort())) {
        throw new Error(`closes[${index}] exception references must be sorted.`)
      }
      const memberOrders = orderIdsForClose.map((orderId) => orderById.get(orderId) as Record<string, unknown>)
      if (memberOrders.some((order) => order.status !== 'completed' || order.paymentStatus !== 'reconciled')
        || candidate.orders !== orderIdsForClose.length
        || candidate.total !== memberOrders.reduce((sum, order) => sum + Number(order.total), 0)) {
        throw new Error(`closes[${index}] totals must match its completed, reconciled order membership.`)
      }
      if (!closeIdPattern.test(String(candidate.id))) throw new Error(`closes[${index}].id must be a full close UUID.`)
      const actionId = canonicalText(candidate.actionId, `closes[${index}].actionId`, 160)
      if (!closeActionIdPattern.test(actionId)) throw new Error(`closes[${index}].actionId must be a full action UUID.`)
      closeActionIds.push(actionId)
      closeBusinessDates.push(businessDate)
      closedOrderIds.push(...orderIdsForClose)
      canonicalText(candidate.operator, `closes[${index}].operator`)
      canonicalText(candidate.reason, `closes[${index}].reason`)
      canonicalText(candidate.evidenceReference, `closes[${index}].evidenceReference`)
    }
  }
  assertUnique(closeIds, 'Daily close ID')
  assertUnique(closeBusinessDates, 'Daily close business date')
  assertUnique(closedOrderIds, 'Closed order ID')

  const intakeIds: string[] = []
  const intakeSources: string[] = []
  for (const [index, candidate] of websiteIntakes.entries()) {
    if (!isRecord(candidate) || !hasExactKeys(
      candidate,
      ['id', 'createdAt', 'status', 'source', 'sku', 'quantity', 'itemName', 'unitPrice', 'total', 'creation'],
      ['itemVariant', 'snapshotDigest', 'conversion'],
    )) throw new Error(`websiteIntakes[${index}] is invalid.`)
    const intakeId = canonicalText(candidate.id, `websiteIntakes[${index}].id`, 85)
    if (!websiteIntakeIdPattern.test(intakeId)) throw new Error(`websiteIntakes[${index}].id is invalid.`)
    if (!validTimestamp(candidate.createdAt)) throw new Error(`websiteIntakes[${index}].createdAt is invalid.`)
    if (!websiteIntakeStatuses.includes(candidate.status as CommerceWebsiteIntakeStatus)) throw new Error(`websiteIntakes[${index}].status is invalid.`)
    if (!isRecord(candidate.source) || !hasExactKeys(candidate.source, ['fingerprint', 'approvalId', 'snapshotId', 'pageId', 'siteName', 'pagePath'])) {
      throw new Error(`websiteIntakes[${index}].source is invalid.`)
    }
    const fingerprint = canonicalText(candidate.source.fingerprint, `websiteIntakes[${index}].source.fingerprint`, 12)
    if (!websiteFingerprintPattern.test(fingerprint)) throw new Error(`websiteIntakes[${index}].source.fingerprint is invalid.`)
    const approvalId = canonicalText(candidate.source.approvalId, `websiteIntakes[${index}].source.approvalId`, 160)
    const snapshotId = canonicalText(candidate.source.snapshotId, `websiteIntakes[${index}].source.snapshotId`, 160)
    const pageId = canonicalText(candidate.source.pageId, `websiteIntakes[${index}].source.pageId`, 160)
    canonicalText(candidate.source.siteName, `websiteIntakes[${index}].source.siteName`, 160)
    const pagePath = canonicalText(candidate.source.pagePath, `websiteIntakes[${index}].source.pagePath`, 160)
    if (!pagePath.startsWith('/')) throw new Error(`websiteIntakes[${index}].source.pagePath must be absolute.`)
    const sku = canonicalText(candidate.sku, `websiteIntakes[${index}].sku`, 80)
    assertSafeInteger(candidate.quantity, `websiteIntakes[${index}].quantity`, 1)
    const item = itemBySku.get(sku)
    if (!item) throw new Error(`websiteIntakes[${index}].sku is unknown.`)
    const itemName = canonicalText(candidate.itemName, `websiteIntakes[${index}].itemName`)
    const itemVariant = candidate.itemVariant === undefined ? undefined : canonicalText(candidate.itemVariant, `websiteIntakes[${index}].itemVariant`)
    assertSafeInteger(candidate.unitPrice, `websiteIntakes[${index}].unitPrice`, 1)
    assertSafeInteger(candidate.total, `websiteIntakes[${index}].total`, 1)
    if (itemName !== item.name || itemVariant !== optionalText(item.variant) || candidate.total !== Number(candidate.quantity) * Number(candidate.unitPrice)) {
      throw new Error(`websiteIntakes[${index}] does not match its retained Commerce snapshot.`)
    }
    if (!isRecord(candidate.creation) || !hasExactKeys(candidate.creation, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])) {
      throw new Error(`websiteIntakes[${index}].creation is invalid.`)
    }
    const creation = candidate.creation as CommerceActionProof
    if (!validProof(creation) || creation.capturedAt !== candidate.createdAt) throw new Error(`websiteIntakes[${index}].creation is invalid.`)
    for (const field of ['actionId', 'actor', 'reason', 'evidenceReference'] as const) canonicalText(creation[field], `websiteIntakes[${index}].creation.${field}`, field === 'actionId' ? 160 : 180)
    if (candidate.snapshotDigest !== undefined) {
      const snapshot: Omit<CommerceWebsiteIntake, 'snapshotDigest' | 'conversion' | 'status'> = {
        id: intakeId,
        createdAt: candidate.createdAt as string,
        source: candidate.source as unknown as CommerceWebsiteSource,
        sku,
        quantity: Number(candidate.quantity),
        itemName,
        unitPrice: Number(candidate.unitPrice),
        total: Number(candidate.total),
        creation,
      }
      if (itemVariant !== undefined) snapshot.itemVariant = itemVariant
      if (typeof candidate.snapshotDigest !== 'string'
        || !sha256DigestPattern.test(candidate.snapshotDigest)
        || candidate.snapshotDigest !== commerceWebsiteIntakeSnapshotDigest(snapshot)) {
        throw new Error(`websiteIntakes[${index}].snapshotDigest is invalid.`)
      }
    }
    websiteIntakeCreationActionIds.push(creation.actionId)

    const matchingSourceOrders = orders.filter((order) => isRecord(order) && order.sourceRecordId === intakeId) as Record<string, unknown>[]
    if (candidate.status === 'pending_confirmation') {
      if (candidate.conversion !== undefined || matchingSourceOrders.length) throw new Error(`websiteIntakes[${index}] pending intake has conversion history.`)
    } else {
      if (!isRecord(candidate.conversion) || !hasExactKeys(candidate.conversion, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference', 'orderId'])) {
        throw new Error(`websiteIntakes[${index}].conversion is invalid.`)
      }
      const conversion = candidate.conversion as CommerceActionProof & { orderId: string }
      if (!validProof(conversion)) throw new Error(`websiteIntakes[${index}].conversion is invalid.`)
      for (const field of ['actionId', 'actor', 'reason', 'evidenceReference'] as const) canonicalText(conversion[field], `websiteIntakes[${index}].conversion.${field}`, field === 'actionId' ? 160 : 180)
      const orderId = canonicalText(conversion.orderId, `websiteIntakes[${index}].conversion.orderId`, 160)
      const order = orderById.get(orderId)
      const matchingReservation = movements.filter((movement) => isRecord(movement)
        && movement.kind === 'reserve'
        && movement.orderId === orderId
        && movement.actionId === conversion.actionId)
      if (matchingSourceOrders.length !== 1 || !order || matchingSourceOrders[0] !== order
        || matchingReservation.length !== 1
        || !sameProof(matchingReservation[0] as unknown as CommerceStockMovement, conversion)
        || order.createdAt !== conversion.capturedAt
        || order.channel !== 'Website'
        || order.item !== itemName
        || order.itemSku !== sku
        || order.quantity !== candidate.quantity
        || order.total !== candidate.total
        || order.evidenceReference !== conversion.evidenceReference) {
        throw new Error(`websiteIntakes[${index}] does not match its converted Website order.`)
      }
      websiteIntakeConversionActionIds.push(conversion.actionId)
    }
    intakeIds.push(intakeId)
    intakeSources.push([fingerprint, approvalId, snapshotId, pageId].join('|'))
  }
  assertUnique(intakeIds, 'Website intake ID')
  assertUnique(intakeSources, 'Website intake source')
  assertUnique(websiteIntakeConversionActionIds, 'Website intake conversion action ID')
  const storefrontRequestIds: string[] = []
  const storefrontIdempotencyKeys: string[] = []
  const storefrontActionIds: string[] = []
  for (const [index, candidate] of storefrontRequests.entries()) {
    if (!isRecord(candidate)) throw new Error(`storefrontRequests[${index}] is invalid.`)
    const legacyFields = ['schema', 'mode', 'state', 'id', 'idempotencyKey', 'createdAt', 'sourcePreviewDigest', 'customerReference', 'fulfilment', 'currency', 'line', 'totalMmk']
    const currentFields = [...legacyFields, 'sourceStorefrontRevision', 'sourceStorefrontActionId']
    if (!hasExactKeys(candidate, legacyFields) && !hasExactKeys(candidate, currentFields)) {
      throw new Error(`storefrontRequests[${index}] is invalid.`)
    }
    const hasStorefrontProvenance = 'sourceStorefrontRevision' in candidate
      && 'sourceStorefrontActionId' in candidate
    const requestId = canonicalText(candidate.id, `storefrontRequests[${index}].id`, 40)
    const idempotencyKey = canonicalText(candidate.idempotencyKey, `storefrontRequests[${index}].idempotencyKey`, 40)
    if (candidate.schema !== 'supermega.ecommerce.order_request.v1'
      || candidate.mode !== 'browser-local-request'
      || candidate.state !== 'pending_shop_review'
      || !storefrontRequestIdPattern.test(requestId)
      || !storefrontIdempotencyPattern.test(idempotencyKey)
      || requestId.slice(4) !== idempotencyKey.slice(4)
      || !validTimestamp(candidate.createdAt)
      || typeof candidate.sourcePreviewDigest !== 'string'
      || !sha256DigestPattern.test(candidate.sourcePreviewDigest)
      || (hasStorefrontProvenance
        && (candidate.sourceStorefrontRevision === null) !== (candidate.sourceStorefrontActionId === null))
      || (hasStorefrontProvenance
        && candidate.sourceStorefrontRevision !== null
        && (!Number.isSafeInteger(candidate.sourceStorefrontRevision)
          || Number(candidate.sourceStorefrontRevision) < 1
          || typeof candidate.sourceStorefrontActionId !== 'string'))
      || candidate.fulfilment !== 'pickup' && candidate.fulfilment !== 'delivery'
      || candidate.currency !== 'MMK'
      || !isRecord(candidate.line)
      || !hasExactKeys(candidate.line, ['sku', 'name', 'variant', 'quantity', 'unitPriceMmk'])) {
      throw new Error(`storefrontRequests[${index}] is invalid.`)
    }
    canonicalText(candidate.customerReference, `storefrontRequests[${index}].customerReference`, 80)
    if (hasStorefrontProvenance && candidate.sourceStorefrontActionId !== null) {
      canonicalText(
        candidate.sourceStorefrontActionId,
        `storefrontRequests[${index}].sourceStorefrontActionId`,
        160,
      )
    }
    canonicalText(candidate.line.sku, `storefrontRequests[${index}].line.sku`, 80)
    canonicalText(candidate.line.name, `storefrontRequests[${index}].line.name`)
    if (candidate.line.variant !== null) canonicalText(candidate.line.variant, `storefrontRequests[${index}].line.variant`)
    assertSafeInteger(candidate.line.quantity, `storefrontRequests[${index}].line.quantity`, 1)
    if (Number(candidate.line.quantity) > 99) throw new Error(`storefrontRequests[${index}].line.quantity must be at most 99.`)
    assertSafeInteger(candidate.line.unitPriceMmk, `storefrontRequests[${index}].line.unitPriceMmk`, 1)
    assertSafeInteger(candidate.totalMmk, `storefrontRequests[${index}].totalMmk`, 1)
    if (candidate.totalMmk !== Number(candidate.line.quantity) * Number(candidate.line.unitPriceMmk)) {
      throw new Error(`storefrontRequests[${index}].totalMmk is invalid.`)
    }
    storefrontRequestIds.push(requestId)
    storefrontIdempotencyKeys.push(idempotencyKey)
    storefrontActionIds.push(`ACT-${requestId.slice(4)}`)
  }
  assertUnique(storefrontRequestIds, 'Storefront request ID')
  assertUnique(storefrontIdempotencyKeys, 'Storefront request idempotency key')
  const catalogBaselineActionSet = new Set(catalogBaselineActionIds)
  for (const actionId of catalogBaselineActionSet) {
    const baselines = [...catalogBaselineBySku.values()].filter((baseline) => baseline.proof.actionId === actionId)
    const matchingChanges = catalogChanges.filter((candidate) => isRecord(candidate)
      && isRecord(candidate.proof)
      && candidate.proof.actionId === actionId) as unknown as CommerceCatalogChange[]
    const matchingMovements = movements.filter((candidate) => isRecord(candidate)
      && candidate.actionId === actionId) as unknown as CommerceStockMovement[]
    if (matchingChanges.length && matchingMovements.length) {
      throw new Error(`Catalog baseline action ${actionId} cannot anchor two event types.`)
    }
    if (matchingChanges.length) {
      const [baseline] = baselines
      const [change] = matchingChanges
      if (baselines.length !== 1
        || matchingChanges.length !== 1
        || change !== newerCatalogChangeBySku.get(baseline.sku)
        || change.sku !== baseline.sku
        || !sameActionProof(change.proof, baseline.proof)) {
        throw new Error(`Catalog baseline action ${actionId} does not match its first catalog change.`)
      }
    }
    if (matchingMovements.length) {
      const [baseline] = baselines
      const [movement] = matchingMovements
      if (baselines.length !== 1
        || matchingMovements.length !== 1
        || movement.kind !== 'opening'
        || movement.sku !== baseline.sku
        || !sameProof(movement, baseline.proof)) {
        throw new Error(`Catalog baseline action ${actionId} does not match its opening balance.`)
      }
    }
  }
  assertUnique([
    ...new Set(movementActionIds.filter((actionId) => !returnActionIds.includes(actionId) && !catalogBaselineActionSet.has(actionId))),
    ...reconciliationActionIds,
    ...refundSettlementActionIds,
    ...advancementActionIds,
    ...completionActionIds,
    ...returnActionIds,
    ...catalogChangeActionIds.filter((actionId) => !catalogBaselineActionSet.has(actionId)),
    ...catalogBaselineActionSet,
    ...websiteIntakeCreationActionIds,
    ...closeActionIds,
    ...purchaseOrderActionIds,
    ...storefrontActionIds,
    ...(storefrontConfigurationActionId ? [storefrontConfigurationActionId] : []),
  ], 'Commerce action ID')
  return value as CommerceState
}

function legacyInteger(value: unknown, fallback: number, minimum = 0) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : fallback
}

function legacyTimestamp(value: unknown) {
  return validTimestamp(value) ? value as string : '1970-01-01T00:00:00.000Z'
}

function migrateLegacyCommerce(value: unknown): CommerceState {
  if (!isRecord(value) || !Array.isArray(value.items)) throw new Error('Legacy Commerce workspace has no item collection.')
  const items = value.items.map((candidate, index): CommerceItem => {
    if (!isRecord(candidate)) throw new Error(`Legacy item ${index + 1} is invalid.`)
    const item: CommerceItem = {
      sku: requiredText(candidate.sku, `legacy.items[${index}].sku`),
      name: requiredText(candidate.name, `legacy.items[${index}].name`),
      onHand: legacyInteger(candidate.onHand, 0),
      reorderAt: legacyInteger(candidate.reorderAt, 0),
      price: legacyInteger(candidate.price, 1, 1),
    }
    const variant = optionalText(candidate.variant)
    if (variant) item.variant = variant
    return item
  })
  const rawOrders = Array.isArray(value.orders) ? value.orders : Array.isArray(value.sales) ? value.sales : []
  const fromSales = !Array.isArray(value.orders) && Array.isArray(value.sales)
  const orders = rawOrders.map((candidate, index): CommerceOrder => {
    if (!isRecord(candidate)) throw new Error(`Legacy order ${index + 1} is invalid.`)
    const itemName = optionalText(candidate.item) ?? 'Legacy item'
    const matchingItems = items.filter((item) => item.name === itemName)
    const storedSku = optionalText(candidate.itemSku)
    const itemSku = storedSku && items.some((item) => item.sku === storedSku) ? storedSku : matchingItems.length === 1 ? matchingItems[0].sku : undefined
    const requestedStatus = fromSales ? 'completed' : candidate.status
    const status: Exclude<CommerceOrderStatus, 'cancelled'> = requestedStatus === 'confirmed' || requestedStatus === 'preparing' || requestedStatus === 'ready' || requestedStatus === 'completed' ? requestedStatus : 'completed'
    const order: CommerceOrder = {
      id: optionalText(candidate.id) ?? `ORD-LEGACY-${index + 1}`,
      createdAt: legacyTimestamp(candidate.createdAt),
      customer: (optionalText(candidate.customer) ?? optionalText(candidate.customerName) ?? 'Walk-in customer').replace('Legacy customer unavailable', 'Walk-in customer'),
      channel: (optionalText(candidate.channel) ?? 'Imported sale').replace('Legacy local sale', 'Imported sale'),
      item: itemName,
      quantity: legacyInteger(candidate.quantity, 1, 1),
      payment: optionalText(candidate.payment) ?? 'Payment not recorded',
      paymentStatus: 'pending',
      refundStatus: 'none',
      total: legacyInteger(candidate.total, 0),
      status,
    }
    if (itemSku) order.itemSku = itemSku
    for (const field of ['fulfilment', 'sourceRecordId', 'evidenceReference'] as const) {
      const fieldValue = optionalText(candidate[field])
      if (fieldValue) order[field] = fieldValue
    }
    return order
  })
  const rawCloses = Array.isArray(value.closes) ? value.closes : []
  const closes = rawCloses.map((candidate, index) => {
    if (!isRecord(candidate)) throw new Error(`Legacy close ${index + 1} is invalid.`)
    return {
      id: optionalText(candidate.id) ?? `CLOSE-LEGACY-${index + 1}`,
      createdAt: legacyTimestamp(candidate.createdAt),
      total: legacyInteger(candidate.total, 0),
      orders: legacyInteger(candidate.orders ?? candidate.transactions, 0),
    }
  })
  return validateCommerceState({ schema: COMMERCE_WORKSPACE_SCHEMA, items, orders, movements: [], closes, catalogBaselines: [], catalogChanges: [], websiteIntakes: [], storefrontRequests: [], purchaseOrders: [] })
}

export function normalizeCommerce(value: unknown): CommerceState {
  if (isRecord(value) && value.schema === COMMERCE_WORKSPACE_SCHEMA) return validateCommerceState(value)
  return migrateLegacyCommerce(value)
}

function browserStorage() {
  try { return globalThis.localStorage as CommerceStorage | undefined } catch { return undefined }
}

function persistInitialState(storage: CommerceStorage, state: CommerceState, source: CommerceWorkspaceSnapshot['source']): CommerceWorkspaceSnapshot {
  try {
    const serialized = JSON.stringify(state)
    storage.setItem(COMMERCE_KEY, serialized)
    if (storage.getItem(COMMERCE_KEY) !== serialized) throw new Error('write_not_confirmed')
    return { state, source, error: '' }
  } catch {
    return { state, source, error: 'Commerce storage is unavailable. This workspace is read-only until browser storage is restored.' }
  }
}

export function loadCommerceWorkspace(storage = browserStorage()): CommerceWorkspaceSnapshot {
  if (!storage) return { state: createEmptyCommerce(), source: 'recovery', error: 'Commerce storage is unavailable. No local data was replaced.' }
  let currentRaw: string | null
  try { currentRaw = storage.getItem(COMMERCE_KEY) } catch { return { state: createEmptyCommerce(), source: 'recovery', error: 'Commerce storage could not be read. No local data was replaced.' } }
  if (currentRaw !== null) {
    try {
      return { state: validateCommerceState(JSON.parse(currentRaw)), source: 'current', error: '' }
    } catch {
      return { state: createEmptyCommerce(), source: 'recovery', error: 'Commerce v2 data is malformed. Recovery failed closed without restoring or replacing older data.' }
    }
  }

  let invalidLegacyFound = false
  for (const legacyKey of LEGACY_COMMERCE_KEYS) {
    let legacyRaw: string | null
    try { legacyRaw = storage.getItem(legacyKey) } catch { invalidLegacyFound = true; continue }
    if (legacyRaw === null) continue
    try {
      return persistInitialState(storage, migrateLegacyCommerce(JSON.parse(legacyRaw)), 'legacy')
    } catch {
      invalidLegacyFound = true
    }
  }
  if (invalidLegacyFound) return { state: createEmptyCommerce(), source: 'recovery', error: 'Legacy Commerce data is malformed. Migration failed closed and did not create v2 data.' }
  return persistInitialState(storage, createSeedCommerce(), 'seed')
}

export function commerceWorkspaceCanWrite(
  storage = browserStorage(),
  lockManager = globalThis.navigator?.locks as unknown as CommerceLockManager | undefined,
) {
  if (!storage || !lockManager?.request || !storage.removeItem) return false
  const probeKey = `${COMMERCE_KEY}.write-probe.${Date.now()}.${Math.random().toString(36).slice(2)}`
  const probeValue = `${probeKey}.confirmed`
  try {
    const raw = storage.getItem(COMMERCE_KEY)
    if (raw === null) return false
    validateCommerceState(JSON.parse(raw))
    storage.setItem(probeKey, probeValue)
    const confirmed = storage.getItem(probeKey) === probeValue
    storage.removeItem(probeKey)
    return confirmed && storage.getItem(probeKey) === null
  } catch {
    try { storage.removeItem(probeKey) } catch { /* storage remains blocked */ }
    return false
  }
}

export async function mutateCommerceWorkspace(
  transition: (state: CommerceState) => CommerceState | null,
  storage = browserStorage(),
  lockManager = globalThis.navigator?.locks as unknown as CommerceLockManager | undefined,
): Promise<CommerceMutationResult> {
  if (!storage) return { ok: false, error: 'Commerce storage is unavailable; the change was not applied.' }
  if (!lockManager?.request) return { ok: false, error: 'This browser cannot lock Commerce writes; the change was not applied.' }
  try {
    return await lockManager.request(COMMERCE_LOCK, { mode: 'exclusive' }, async () => {
      let raw: string | null
      try { raw = storage.getItem(COMMERCE_KEY) } catch { return { ok: false, error: 'Commerce data could not be read; the change was not applied.' } as const }
      if (raw === null) return { ok: false, error: 'Commerce v2 is not initialized; reload before making a change.' } as const
      let current: CommerceState
      try { current = validateCommerceState(JSON.parse(raw)) } catch { return { ok: false, error: 'Commerce v2 is malformed; the change failed closed.' } as const }
      const next = transition(current)
      if (!next) return { ok: false, error: 'The Commerce state changed or the requested transition is not valid. Nothing was written.' } as const
      if (next === current) return { ok: true, state: current, replayed: true } as const
      let serialized: string
      try { serialized = JSON.stringify(validateCommerceState(next)) } catch { return { ok: false, error: 'The proposed Commerce state failed integrity checks. Nothing was written.' } as const }
      try {
        storage.setItem(COMMERCE_KEY, serialized)
        if (storage.getItem(COMMERCE_KEY) !== serialized) return { ok: false, error: 'Commerce storage did not confirm the write.' } as const
      } catch {
        return { ok: false, error: 'Commerce storage rejected the write. The interface was not advanced.' } as const
      }
      return { ok: true, state: next, replayed: false } as const
    })
  } catch {
    return { ok: false, error: 'The Commerce write lock failed. Nothing was applied.' }
  }
}

function movementFor(
  proof: CommerceActionProof,
  input: Omit<CommerceStockMovement, 'id' | 'actionId' | 'createdAt' | 'actor' | 'reason' | 'evidenceReference'>,
  idSuffix?: string,
): CommerceStockMovement {
  return {
    id: `MOV2:${encodeURIComponent(proof.actionId)}${idSuffix ? `:${idSuffix}` : ''}`,
    actionId: proof.actionId,
    createdAt: proof.capturedAt,
    actor: proof.actor,
    reason: proof.reason,
    evidenceReference: proof.evidenceReference,
    ...input,
  }
}

function actionIdIsUsed(state: CommerceState, actionId: string) {
  return state.movements.some((movement) => movement.actionId === actionId)
    || state.orders.some((order) => order.paymentReconciliationActionId === actionId || order.refundSettlementActionId === actionId)
    || state.orders.some((order) => order.advancementActionIds?.includes(actionId))
    || state.orders.some((order) => order.completion?.actionId === actionId)
    || state.orders.some((order) => order.returns?.some((record) => record.actionId === actionId))
    || state.closes.some((close) => close.actionId === actionId)
    || commerceCatalogBaselines(state).some((baseline) => baseline.proof.actionId === actionId)
    || commerceCatalogChanges(state).some((change) => change.proof.actionId === actionId)
    || commerceWebsiteIntakes(state).some((intake) => intake.creation.actionId === actionId || intake.conversion?.actionId === actionId)
    || commercePurchaseOrders(state).some((purchaseOrder) => purchaseOrder.creation.actionId === actionId || purchaseOrder.cancellation?.actionId === actionId)
    || state.storefrontConfiguration?.saved.actionId === actionId
}

function sameWebsiteSource(left: CommerceWebsiteSource, right: CommerceWebsiteSource) {
  return left.fingerprint === right.fingerprint
    && left.approvalId === right.approvalId
    && left.snapshotId === right.snapshotId
    && left.pageId === right.pageId
    && left.siteName === right.siteName
    && left.pagePath === right.pagePath
}

function sameActionProof(left: CommerceActionProof, right: CommerceActionProof) {
  return left.actionId === right.actionId
    && left.capturedAt === right.capturedAt
    && left.actor === right.actor
    && left.reason === right.reason
    && left.evidenceReference === right.evidenceReference
}

function sameCatalogChange(left: CommerceCatalogChange, right: CommerceCatalogChange) {
  return left.sku === right.sku
    && left.previousPrice === right.previousPrice
    && left.nextPrice === right.nextPrice
    && left.previousReorderAt === right.previousReorderAt
    && left.nextReorderAt === right.nextReorderAt
    && sameActionProof(left.proof, right.proof)
}

function sameCatalogBaseline(left: CommerceCatalogBaseline, right: CommerceCatalogBaseline) {
  return left.sku === right.sku
    && left.price === right.price
    && left.reorderAt === right.reorderAt
    && left.anchorDigest === right.anchorDigest
    && sameActionProof(left.proof, right.proof)
}

function validWebsiteSource(source: CommerceWebsiteSource) {
  return websiteFingerprintPattern.test(source.fingerprint)
    && [source.approvalId, source.snapshotId, source.pageId, source.siteName, source.pagePath].every((value) => typeof value === 'string' && value === value.trim() && value.length > 0 && value.length <= 160)
    && source.pagePath.startsWith('/')
}

export function commerceWebsiteIntakes(state: CommerceState) {
  return state.websiteIntakes ?? []
}

export function commerceCatalogBaselines(state: CommerceState) {
  return state.catalogBaselines ?? []
}

export function commerceCatalogChanges(state: CommerceState) {
  return state.catalogChanges ?? []
}

export function commerceStorefrontRequests(state: CommerceState) {
  return state.storefrontRequests ?? []
}

export function commerceStorefrontConfiguration(state: CommerceState) {
  return state.storefrontConfiguration ?? null
}

export function commercePurchaseOrders(state: CommerceState) {
  return state.purchaseOrders ?? []
}

export function commercePurchaseOrderProgress(state: CommerceState, purchaseOrder: CommercePurchaseOrder): CommercePurchaseOrderProgress {
  const received = state.movements
    .filter((movement) => movement.kind === 'receipt' && movement.purchaseOrderId === purchaseOrder.id)
    .reduce((total, movement) => total + movement.quantityDelta, 0)
  const remaining = purchaseOrder.quantityOrdered - received
  return {
    received,
    remaining,
    status: purchaseOrder.cancellation
      ? 'cancelled'
      : remaining === 0
        ? 'received'
        : received > 0
          ? 'partially_received'
          : 'open',
  }
}

export function commerceCatalogDigestSource(state: CommerceState) {
  const current = validateCommerceState(state)
  return JSON.stringify(
    [...current.items]
      .sort((left, right) => compareCanonicalText(left.sku, right.sku))
      .map((item) => [item.sku, item.name, item.variant ?? null, item.price]),
  )
}

export async function commerceCatalogDigest(state: CommerceState) {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('SHA-256 is unavailable.')
  const digest = await subtle.digest(
    'SHA-256',
    new TextEncoder().encode(commerceCatalogDigestSource(state)),
  )
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

export async function commerceStorefrontPreviewDigest(state: CommerceState) {
  const current = validateCommerceState(state)
  const configuration = commerceStorefrontConfiguration(current)
  if (!configuration) throw new Error('A saved storefront configuration is required.')
  if (configuration.shopCatalogDigest !== await commerceCatalogDigest(current)) {
    throw new Error('The saved storefront configuration does not match the current Shop catalog.')
  }
  const itemBySku = new Map(current.items.map((item) => [item.sku, item]))
  const source = JSON.stringify({
    schema: COMMERCE_STOREFRONT_PREVIEW_SCHEMA,
    mode: 'browser-local-preview',
    sourceCatalogSchema: COMMERCE_WORKSPACE_SCHEMA,
    storeName: configuration.storeName,
    summary: configuration.summary,
    currency: 'MMK',
    items: configuration.selectedSkus.map((sku) => {
      const item = itemBySku.get(sku)
      if (!item) throw new Error(`Saved storefront SKU ${sku} is unavailable.`)
      return {
        sku: item.sku,
        name: item.name,
        variant: item.variant ?? null,
        unitPriceMmk: item.price,
        availability: item.onHand > 0 ? 'available' : 'sold_out',
      }
    }),
  })
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('SHA-256 is unavailable.')
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(source))
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

export async function saveCommerceStorefrontConfiguration(
  state: CommerceState,
  input: CommerceStorefrontConfigurationInput,
  proof: CommerceActionProof,
) {
  const current = validateCommerceState(structuredClone(state))
  if (!validProof(proof)
    || typeof input.shopCatalogDigest !== 'string'
    || !sha256DigestPattern.test(input.shopCatalogDigest)
    || !Array.isArray(input.selectedSkus)
    || input.selectedSkus.length < 1
    || input.selectedSkus.length > 8) return null
  let currentCatalogDigest: string
  try {
    currentCatalogDigest = await commerceCatalogDigest(current)
  } catch {
    return null
  }
  if (input.shopCatalogDigest !== currentCatalogDigest) return null
  let storeName: string
  let summary: string
  let selectedSkus: string[]
  try {
    storeName = canonicalText(input.storeName, 'Store name', 60)
    summary = canonicalText(input.summary, 'Store summary', 180)
    selectedSkus = input.selectedSkus
      .map((sku, index) => canonicalText(sku, `Selected SKU ${index + 1}`, 80))
      .sort(compareCanonicalText)
  } catch {
    return null
  }
  if (new Set(selectedSkus).size !== selectedSkus.length
    || selectedSkus.some((sku) => !current.items.some((item) => item.sku === sku))) return null
  const existing = commerceStorefrontConfiguration(current)
  if (existing
    && existing.storeName === storeName
    && existing.summary === summary
    && existing.shopCatalogDigest === input.shopCatalogDigest
    && existing.selectedSkus.length === selectedSkus.length
    && existing.selectedSkus.every((sku, index) => sku === selectedSkus[index])) return current
  if (actionIdIsUsed(current, proof.actionId)
    || (existing?.revision ?? 0) >= Number.MAX_SAFE_INTEGER
    || (existing?.shopCatalogSnapshotRevision ?? 0) >= Number.MAX_SAFE_INTEGER) return null
  const revision = (existing?.revision ?? 0) + 1
  const shopCatalogSnapshotRevision = existing
    ? existing.shopCatalogDigest === input.shopCatalogDigest
      ? existing.shopCatalogSnapshotRevision
      : existing.shopCatalogSnapshotRevision + 1
    : 1
  if (proof.actionId !== commerceStorefrontConfigurationActionId(revision, input.shopCatalogDigest)
    || proof.evidenceReference !== `ECOMMERCE-STOREFRONT:${input.shopCatalogDigest}:R${revision}`) return null
  return validateCommerceState({
    ...current,
    storefrontConfiguration: {
      schema: COMMERCE_STOREFRONT_SCHEMA,
      revision,
      shopCatalogSnapshotRevision,
      shopCatalogDigest: input.shopCatalogDigest,
      storeName,
      summary,
      selectedSkus,
      saved: { ...proof },
    },
  })
}

export function commerceStorefrontRequestEquals(
  left: CommerceStorefrontRequest,
  right: CommerceStorefrontRequest,
) {
  return left.schema === right.schema
    && left.mode === right.mode
    && left.state === right.state
    && left.id === right.id
    && left.idempotencyKey === right.idempotencyKey
    && left.createdAt === right.createdAt
    && left.sourcePreviewDigest === right.sourcePreviewDigest
    && (left.sourceStorefrontRevision ?? null) === (right.sourceStorefrontRevision ?? null)
    && (left.sourceStorefrontActionId ?? null) === (right.sourceStorefrontActionId ?? null)
    && left.customerReference === right.customerReference
    && left.fulfilment === right.fulfilment
    && left.currency === right.currency
    && left.line.sku === right.line.sku
    && left.line.name === right.line.name
    && left.line.variant === right.line.variant
    && left.line.quantity === right.line.quantity
    && left.line.unitPriceMmk === right.line.unitPriceMmk
    && left.totalMmk === right.totalMmk
}

export async function recordCommerceStorefrontRequest(
  state: CommerceState,
  request: CommerceStorefrontRequest,
  proof: CommerceActionProof,
) {
  const current = validateCommerceState(state)
  let validatedRequest: CommerceStorefrontRequest
  try {
    validatedRequest = validateCommerceState({
      ...current,
      storefrontRequests: [request],
    }).storefrontRequests?.[0] as CommerceStorefrontRequest
  } catch {
    return null
  }
  if (!validProof(proof)
    || proof.actionId !== `ACT-${validatedRequest.id.slice(4)}`
    || proof.capturedAt !== validatedRequest.createdAt
    || proof.evidenceReference !== `ECOMMERCE:${validatedRequest.id}:${validatedRequest.sourcePreviewDigest}`) return null
  const requests = commerceStorefrontRequests(current)
  const existingById = requests.find((candidate) => candidate.id === validatedRequest.id)
  const existingByIdempotency = requests.find((candidate) => candidate.idempotencyKey === validatedRequest.idempotencyKey)
  if (existingById || existingByIdempotency) {
    const existing = existingById ?? existingByIdempotency as CommerceStorefrontRequest
    return existingById === existingByIdempotency
      && commerceStorefrontRequestEquals(existing, validatedRequest) ? current : null
  }
  if (actionIdIsUsed(current, proof.actionId)
    || current.orders.some((order) => order.sourceRecordId === validatedRequest.id)) return null
  if (requests.length >= maxStorefrontRequests) return null
  const configuration = commerceStorefrontConfiguration(current)
  if (!configuration || !configuration.selectedSkus.includes(validatedRequest.line.sku)) return null
  if (validatedRequest.sourceStorefrontRevision !== configuration.revision
    || validatedRequest.sourceStorefrontActionId !== configuration.saved.actionId
    || (timestampMicros(validatedRequest.createdAt) as bigint) < (timestampMicros(configuration.saved.capturedAt) as bigint)) return null
  let expectedPreviewDigest: string
  try {
    expectedPreviewDigest = await commerceStorefrontPreviewDigest(current)
  } catch {
    return null
  }
  if (validatedRequest.sourcePreviewDigest !== expectedPreviewDigest) return null
  const matches = current.items.filter((item) => item.sku === validatedRequest.line.sku)
  if (matches.length !== 1
    || matches[0].name !== validatedRequest.line.name
    || (matches[0].variant ?? null) !== validatedRequest.line.variant
    || matches[0].price !== validatedRequest.line.unitPriceMmk
    || matches[0].onHand < 1) return null
  return validateCommerceState({
    ...current,
    storefrontRequests: [validatedRequest, ...requests],
  })
}

export function commerceOrderNeedsAction(order: CommerceOrder) {
  return order.refundStatus === 'due'
    || (order.status !== 'completed' && order.status !== 'cancelled')
    || (order.status === 'completed' && order.paymentStatus === 'pending')
}

export function createCommerceWebsiteIntake(
  state: CommerceState,
  input: CommerceWebsiteIntakeInput,
  proof: CommerceActionProof,
) {
  if (!validProof(proof)
    || proof.capturedAt !== proof.capturedAt.trim()
    || !websiteIntakeIdPattern.test(input.id)
    || !validWebsiteSource(input.source)
    || typeof input.sku !== 'string'
    || input.sku !== input.sku.trim()
    || !Number.isSafeInteger(input.quantity)
    || input.quantity < 1
    || input.quantity > 99) return null
  const current = validateCommerceState(state)
  const intakes = commerceWebsiteIntakes(current)
  const existing = intakes.find((intake) => intake.id === input.id)
  if (existing) return sameWebsiteSource(existing.source, input.source)
    && existing.sku === input.sku
    && existing.quantity === input.quantity ? current : null
  const sourceExisting = intakes.find((intake) => [
    intake.source.fingerprint,
    intake.source.approvalId,
    intake.source.snapshotId,
    intake.source.pageId,
  ].join('|') === [
    input.source.fingerprint,
    input.source.approvalId,
    input.source.snapshotId,
    input.source.pageId,
  ].join('|'))
  if (sourceExisting) return sourceExisting.sku === input.sku && sourceExisting.quantity === input.quantity ? current : null
  if (actionIdIsUsed(current, proof.actionId)) return null
  const matchingItems = current.items.filter((item) => item.sku === input.sku)
  const item = matchingItems.length === 1 ? matchingItems[0] : null
  if (!item) return null
  const total = item.price * input.quantity
  if (!Number.isSafeInteger(total) || total < 1) return null
  const snapshot: Omit<CommerceWebsiteIntake, 'snapshotDigest' | 'conversion' | 'status'> = {
    id: input.id,
    createdAt: proof.capturedAt,
    source: { ...input.source },
    sku: item.sku,
    quantity: input.quantity,
    itemName: item.name,
    unitPrice: item.price,
    total,
    creation: { ...proof },
  }
  if (item.variant) snapshot.itemVariant = item.variant
  const intake: CommerceWebsiteIntake = {
    ...snapshot,
    status: 'pending_confirmation',
    snapshotDigest: commerceWebsiteIntakeSnapshotDigest(snapshot),
  }
  return validateCommerceState({
    ...current,
    websiteIntakes: [intake, ...intakes],
  })
}

export function convertCommerceWebsiteIntake(
  state: CommerceState,
  intakeId: string,
  input: CommerceWebsiteOrderInput,
  proof: CommerceActionProof,
) {
  if (!validProof(proof)
    || typeof input?.customer !== 'string'
    || !input.customer.trim()
    || input.customer !== input.customer.trim()
    || input.customer.length > 80
    || !['pickup', 'local_delivery'].includes(input.fulfilmentMethod)
    || !['cash_on_delivery', 'manual_qr', 'manual_bank_transfer'].includes(input.paymentMethod)) return null
  const current = validateCommerceState(state)
  const intakes = commerceWebsiteIntakes(current)
  const intake = intakes.find((candidate) => candidate.id === intakeId)
  if (!intake) return null
  if (intake.status === 'converted') {
    const order = current.orders.find((candidate) => candidate.id === intake.conversion?.orderId)
    return intake.conversion
      && order?.customer === input.customer
      && order.fulfilment === (input.fulfilmentMethod === 'pickup' ? 'pickup' : 'delivery')
      && order.fulfilmentReference === intake.id
      && order.payment === (input.paymentMethod === 'cash_on_delivery' ? 'Cash on delivery' : input.paymentMethod === 'manual_qr' ? 'Manual QR review' : 'Manual bank transfer')
      && sameActionProof(intake.conversion, proof) ? current : null
  }
  if (!intake.snapshotDigest) return null
  if (actionIdIsUsed(current, proof.actionId)) return null
  const item = current.items.find((candidate) => candidate.sku === intake.sku)
  if (!item
    || item.name !== intake.itemName
    || (item.variant ?? undefined) !== (intake.itemVariant ?? undefined)
    || item.price !== intake.unitPrice
    || item.onHand < intake.quantity) return null
  const nextBalance = safeBalance(item.onHand, -intake.quantity)
  if (nextBalance === null) return null
  const orderId = `ORD-WEB-${intake.id.slice(5)}`
  if (current.orders.some((order) => order.id === orderId || order.sourceRecordId === intake.id)) return null
  const fulfilment = input.fulfilmentMethod === 'pickup' ? 'pickup' : 'delivery'
  const payment = input.paymentMethod === 'cash_on_delivery'
    ? 'Cash on delivery'
    : input.paymentMethod === 'manual_qr'
      ? 'Manual QR review'
      : 'Manual bank transfer'
  const order: CommerceOrder = {
    id: orderId,
    createdAt: proof.capturedAt,
    customer: input.customer,
    channel: 'Website',
    item: intake.itemName,
    itemSku: intake.sku,
    quantity: intake.quantity,
    payment,
    paymentStatus: 'pending',
    refundStatus: 'none',
    fulfilment,
    fulfilmentReference: intake.id,
    sourceRecordId: intake.id,
    evidenceReference: proof.evidenceReference,
    total: intake.total,
    status: 'confirmed',
  }
  const movement = movementFor(proof, {
    kind: 'reserve',
    sku: intake.sku,
    quantityDelta: -intake.quantity,
    orderId,
  })
  const conversion = { ...proof, orderId }
  return validateCommerceState({
    ...current,
    items: current.items.map((candidate) => candidate.sku === intake.sku ? { ...candidate, onHand: nextBalance } : candidate),
    orders: [order, ...current.orders],
    movements: [movement, ...current.movements],
    websiteIntakes: intakes.map((candidate) => candidate.id === intake.id ? {
      ...candidate,
      status: 'converted' as const,
      conversion,
    } : candidate),
  })
}

export function registerCommerceItem(state: CommerceState, item: CommerceItem, proof: CommerceActionProof) {
  const sku = optionalText(item.sku)
  const name = optionalText(item.name)
  const variant = item.variant === undefined ? undefined : optionalText(item.variant)
  if (!validProof(proof)
    || !sku || sku !== item.sku || sku.length > 80
    || !name || name !== item.name || name.length > 180
    || (item.variant !== undefined && (variant !== item.variant || item.variant.length > 180))
    || !Number.isSafeInteger(item.onHand) || item.onHand < 0
    || !Number.isSafeInteger(item.reorderAt) || item.reorderAt < 0
    || !Number.isSafeInteger(item.price) || item.price < 1) return null
  const proofMovement = state.movements.find((movement) => movement.actionId === proof.actionId)
  if (proofMovement) {
    const storedItem = state.items.find((candidate) => candidate.sku === item.sku)
    const expectedBaseline = createCommerceCatalogBaseline(item, proof)
    const storedBaseline = commerceCatalogBaselines(state).find((candidate) => candidate.sku === item.sku)
    return proofMovement.kind === 'opening'
      && proofMovement.sku === item.sku
      && proofMovement.quantityDelta === item.onHand
      && sameProof(proofMovement, proof)
      && JSON.stringify(storedItem) === JSON.stringify(item)
      && (!storedBaseline || sameCatalogBaseline(storedBaseline, expectedBaseline)) ? state : null
  }
  if (actionIdIsUsed(state, proof.actionId) || state.items.some((candidate) => candidate.sku === item.sku)) return null
  const opening = movementFor(proof, { kind: 'opening', sku: item.sku, quantityDelta: item.onHand })
  const baseline = createCommerceCatalogBaseline(item, proof)
  return validateCommerceState({
    ...state,
    items: [item, ...state.items],
    movements: [opening, ...state.movements],
    catalogBaselines: [baseline, ...commerceCatalogBaselines(state)],
  })
}

export function updateCommerceItem(state: CommerceState, update: CommerceItemUpdate, proof: CommerceActionProof) {
  if (!validProof(proof)
    || typeof update?.sku !== 'string'
    || !update.sku
    || update.sku !== update.sku.trim()
    || update.sku.length > 80
    || !Number.isSafeInteger(update.expectedPrice)
    || update.expectedPrice < 1
    || !Number.isSafeInteger(update.nextPrice)
    || update.nextPrice < 1
    || !Number.isSafeInteger(update.expectedReorderAt)
    || update.expectedReorderAt < 0
    || !Number.isSafeInteger(update.nextReorderAt)
    || update.nextReorderAt < 0
    || (update.expectedPrice === update.nextPrice
      && update.expectedReorderAt === update.nextReorderAt)) return null
  const current = validateCommerceState(state)
  const change: CommerceCatalogChange = {
    sku: update.sku,
    previousPrice: update.expectedPrice,
    nextPrice: update.nextPrice,
    previousReorderAt: update.expectedReorderAt,
    nextReorderAt: update.nextReorderAt,
    proof: { ...proof },
  }
  const changes = commerceCatalogChanges(current)
  const baselines = commerceCatalogBaselines(current)
  const replay = changes.find((candidate) => candidate.proof.actionId === proof.actionId)
  if (replay) return sameCatalogChange(replay, change) ? current : null
  const existingBaseline = baselines.find((baseline) => baseline.sku === update.sku)
  if (changes.length >= maxCatalogChanges
    || (!existingBaseline && baselines.length >= maxCatalogBaselines)
    || actionIdIsUsed(current, proof.actionId)) return null
  const items = current.items.filter((item) => item.sku === update.sku)
  if (items.length !== 1
    || items[0].price !== update.expectedPrice
    || items[0].reorderAt !== update.expectedReorderAt) return null
  const nextBaselines = existingBaseline
    ? baselines
    : [createCommerceCatalogBaseline(items[0], proof), ...baselines]
  return validateCommerceState({
    ...current,
    items: current.items.map((item) => item.sku === update.sku
      ? { ...item, price: update.nextPrice, reorderAt: update.nextReorderAt }
      : item),
    catalogBaselines: nextBaselines,
    catalogChanges: [change, ...changes],
  })
}

function validatedOrderLineSnapshots(order: CommerceOrder): CommerceOrderLine[] | null {
  if (!Array.isArray(order.lines) || order.lines.length < 1 || order.lines.length > maxOrderLines) return null
  const skus = new Set<string>()
  let quantity = 0
  let total = 0
  for (const line of order.lines) {
    if (!isRecord(line)
      || !hasExactKeys(line, ['sku', 'name', 'quantity', 'unitPriceMmk'], ['variant'])
      || typeof line.sku !== 'string' || line.sku !== line.sku.trim() || !line.sku
      || typeof line.name !== 'string' || line.name !== line.name.trim() || !line.name
      || (line.variant !== undefined && (typeof line.variant !== 'string' || line.variant !== line.variant.trim() || !line.variant))
      || !Number.isSafeInteger(line.quantity) || line.quantity < 1
      || !Number.isSafeInteger(line.unitPriceMmk) || line.unitPriceMmk < 1
      || skus.has(line.sku)) return null
    const lineTotal = line.quantity * line.unitPriceMmk
    const nextQuantity = quantity + line.quantity
    const nextTotal = total + lineTotal
    if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(nextQuantity) || !Number.isSafeInteger(nextTotal)) return null
    skus.add(line.sku)
    quantity = nextQuantity
    total = nextTotal
  }
  const expectedItemSku = order.lines.length === 1 ? order.lines[0].sku : undefined
  return order.item === commerceOrderItemSummary(order.lines)
    && order.itemSku === expectedItemSku
    && order.quantity === quantity
    && order.total === total ? order.lines : null
}

export function reserveCommerceOrder(state: CommerceState, order: CommerceOrder, proof: CommerceActionProof) {
  if (!validProof(proof)
    || order.status !== 'confirmed'
    || !['pickup', 'delivery'].includes(order.fulfilment ?? '')
    || typeof order.fulfilmentReference !== 'string'
    || !order.fulfilmentReference.trim()
    || order.fulfilmentReference !== order.fulfilmentReference.trim()
    || order.fulfilmentReference.length > 160
    || !Number.isSafeInteger(order.quantity)
    || order.quantity < 1
    || !Number.isSafeInteger(order.total)
    || order.total < 1
    || order.paymentStatus !== 'pending'
    || order.refundStatus !== 'none') return null
  if (Boolean(order.sourceRecordId) !== Boolean(order.evidenceReference)
    || (order.evidenceReference && order.evidenceReference !== proof.evidenceReference)) return null
  const capturedLines = order.lines === undefined ? undefined : validatedOrderLineSnapshots(order)
  if (order.lines !== undefined && !capturedLines) return null
  const legacyItem = order.lines === undefined && order.itemSku
    ? state.items.find((candidate) => candidate.sku === order.itemSku)
    : undefined
  const lines = capturedLines ?? (legacyItem ? [{
    sku: legacyItem.sku,
    name: legacyItem.name,
    ...(legacyItem.variant ? { variant: legacyItem.variant } : {}),
    quantity: order.quantity,
    unitPriceMmk: legacyItem.price,
  }] : [])
  if (!lines.length
    || (order.lines === undefined && (order.item !== legacyItem?.name || legacyItem.price * order.quantity !== order.total))) return null
  const proofMovements = state.movements.filter((movement) => movement.actionId === proof.actionId)
  if (proofMovements.length) {
    const storedOrder = state.orders.find((candidate) => candidate.id === order.id)
    return proofMovements.length === lines.length
      && lines.every((line) => proofMovements.some((movement) => movement.kind === 'reserve'
        && movement.orderId === order.id
        && movement.sku === line.sku
        && movement.quantityDelta === -line.quantity
        && sameProof(movement, proof)))
      && JSON.stringify(storedOrder) === JSON.stringify(order) ? state : null
  }
  if (actionIdIsUsed(state, proof.actionId)) return null
  const duplicate = state.orders.some((candidate) => candidate.id === order.id || Boolean(order.sourceRecordId && candidate.sourceRecordId === order.sourceRecordId))
  if (duplicate) return null
  const nextBalances = new Map<string, number>()
  for (const line of lines) {
    const matchingItems = state.items.filter((candidate) => candidate.sku === line.sku)
    const item = matchingItems.length === 1 ? matchingItems[0] : undefined
    if (!item
      || item.name !== line.name
      || item.variant !== line.variant
      || item.price !== line.unitPriceMmk
      || item.onHand < line.quantity) return null
    const nextBalance = safeBalance(item.onHand, -line.quantity)
    if (nextBalance === null) return null
    nextBalances.set(item.sku, nextBalance)
  }
  const movements = lines.map((line, index) => movementFor(
    proof,
    { kind: 'reserve', sku: line.sku, quantityDelta: -line.quantity, orderId: order.id },
    lines.length > 1 ? `L${index + 1}` : undefined,
  ))
  return validateCommerceState({
    ...state,
    items: state.items.map((candidate) => nextBalances.has(candidate.sku) ? { ...candidate, onHand: nextBalances.get(candidate.sku) as number } : candidate),
    orders: [order, ...state.orders],
    movements: [...movements, ...state.movements],
  })
}

export function createCommercePurchaseOrder(
  state: CommerceState,
  input: CommercePurchaseOrderInput,
  proof: CommerceActionProof,
) {
  const supplier = optionalText(input.supplier)
  if (!validProof(proof)
    || !purchaseOrderIdPattern.test(input.id)
    || !supplier
    || supplier !== input.supplier
    || supplier.length > 120
    || typeof input.sku !== 'string'
    || input.sku !== input.sku.trim()
    || input.sku.length > 80
    || !Number.isSafeInteger(input.quantityOrdered)
    || input.quantityOrdered < 1) return null
  const current = validateCommerceState(state)
  const existing = commercePurchaseOrders(current).find((purchaseOrder) => purchaseOrder.id === input.id)
  if (existing) {
    return existing.supplier === input.supplier
      && existing.sku === input.sku
      && existing.quantityOrdered === input.quantityOrdered
      && sameActionProof(existing.creation, proof) ? current : null
  }
  if (actionIdIsUsed(current, proof.actionId)) return null
  const matchingItems = current.items.filter((item) => item.sku === input.sku)
  if (matchingItems.length !== 1) return null
  if (commercePurchaseOrders(current).some((purchaseOrder) => (
    purchaseOrder.sku === input.sku
    && commercePurchaseOrderProgress(current, purchaseOrder).remaining > 0
    && !purchaseOrder.cancellation
  ))) return null
  const purchaseOrder: CommercePurchaseOrder = {
    id: input.id,
    createdAt: proof.capturedAt,
    supplier,
    sku: input.sku,
    quantityOrdered: input.quantityOrdered,
    creation: { ...proof },
  }
  return validateCommerceState({
    ...current,
    purchaseOrders: [purchaseOrder, ...commercePurchaseOrders(current)],
  })
}

export function receiveCommercePurchaseOrder(
  state: CommerceState,
  purchaseOrderId: string,
  quantity: number,
  proof: CommerceActionProof,
) {
  if (!validProof(proof) || !Number.isSafeInteger(quantity) || quantity < 1) return null
  const current = validateCommerceState(state)
  const replayMovement = current.movements.find((movement) => movement.actionId === proof.actionId)
  if (replayMovement) {
    return replayMovement.kind === 'receipt'
      && replayMovement.purchaseOrderId === purchaseOrderId
      && replayMovement.quantityDelta === quantity
      && sameProof(replayMovement, proof) ? current : null
  }
  if (actionIdIsUsed(current, proof.actionId)) return null
  const purchaseOrder = commercePurchaseOrders(current).find((candidate) => candidate.id === purchaseOrderId)
  if (!purchaseOrder
    || purchaseOrder.cancellation
    || (timestampMicros(proof.capturedAt) as bigint) < (timestampMicros(purchaseOrder.createdAt) as bigint)) return null
  const progress = commercePurchaseOrderProgress(current, purchaseOrder)
  if (quantity > progress.remaining) return null
  const item = current.items.find((candidate) => candidate.sku === purchaseOrder.sku)
  if (!item) return null
  const nextBalance = safeBalance(item.onHand, quantity)
  if (nextBalance === null) return null
  const movement = movementFor(proof, {
    kind: 'receipt',
    sku: purchaseOrder.sku,
    quantityDelta: quantity,
    purchaseOrderId,
  })
  return validateCommerceState({
    ...current,
    items: current.items.map((candidate) => candidate.sku === purchaseOrder.sku ? { ...candidate, onHand: nextBalance } : candidate),
    movements: [movement, ...current.movements],
  })
}

export function cancelCommercePurchaseOrder(
  state: CommerceState,
  purchaseOrderId: string,
  proof: CommerceActionProof,
) {
  if (!validProof(proof)) return null
  const current = validateCommerceState(state)
  const purchaseOrder = commercePurchaseOrders(current).find((candidate) => candidate.id === purchaseOrderId)
  if (!purchaseOrder) return null
  if (purchaseOrder.cancellation) return sameActionProof(purchaseOrder.cancellation, proof) ? current : null
  if (actionIdIsUsed(current, proof.actionId)) return null
  const progress = commercePurchaseOrderProgress(current, purchaseOrder)
  const latestReceiptAt = current.movements
    .filter((movement) => movement.purchaseOrderId === purchaseOrderId)
    .reduce((latest, movement) => {
      const movementAt = timestampMicros(movement.createdAt) as bigint
      return movementAt > latest ? movementAt : latest
    }, timestampMicros(purchaseOrder.createdAt) as bigint)
  if (progress.remaining < 1 || (timestampMicros(proof.capturedAt) as bigint) < latestReceiptAt) return null
  return validateCommerceState({
    ...current,
    purchaseOrders: commercePurchaseOrders(current).map((candidate) => candidate.id === purchaseOrderId
      ? { ...candidate, cancellation: { ...proof } }
      : candidate),
  })
}

export function receiveCommerceStock(state: CommerceState, sku: string, quantity: number, proof: CommerceActionProof) {
  if (!validProof(proof) || !Number.isSafeInteger(quantity) || quantity < 1) return null
  const proofMovement = state.movements.find((movement) => movement.actionId === proof.actionId)
  if (proofMovement) return proofMovement.kind === 'receipt' && proofMovement.sku === sku && proofMovement.quantityDelta === quantity && sameProof(proofMovement, proof) ? state : null
  if (actionIdIsUsed(state, proof.actionId)) return null
  const matchingItems = state.items.filter((candidate) => candidate.sku === sku)
  const item = matchingItems.length === 1 ? matchingItems[0] : undefined
  if (!item) return null
  const nextBalance = safeBalance(item.onHand, quantity)
  if (nextBalance === null) return null
  const movement = movementFor(proof, { kind: 'receipt', sku, quantityDelta: quantity })
  return validateCommerceState({
    ...state,
    items: state.items.map((candidate) => candidate.sku === sku ? { ...candidate, onHand: nextBalance } : candidate),
    movements: [movement, ...state.movements],
  })
}

export function countCommerceStock(state: CommerceState, sku: string, countedQuantity: number, proof: CommerceActionProof) {
  if (!validProof(proof) || !Number.isSafeInteger(countedQuantity) || countedQuantity < 0) return null
  const current = validateCommerceState(state)
  const replayMovement = current.movements.find((movement) => movement.actionId === proof.actionId)
  if (replayMovement) {
    return replayMovement.kind === 'count'
      && replayMovement.sku === sku
      && replayMovement.countedQuantity === countedQuantity
      && replayMovement.quantityDelta === countedQuantity - Number(replayMovement.expectedQuantity)
      && sameProof(replayMovement, proof) ? current : null
  }
  if (actionIdIsUsed(current, proof.actionId)) return null
  const matchingItems = current.items.filter((candidate) => candidate.sku === sku)
  const item = matchingItems.length === 1 ? matchingItems[0] : undefined
  if (!item) return null
  const quantityDelta = countedQuantity - item.onHand
  if (!Number.isSafeInteger(quantityDelta)) return null
  const movement = movementFor(proof, {
    kind: 'count',
    sku,
    quantityDelta,
    expectedQuantity: item.onHand,
    countedQuantity,
  })
  return validateCommerceState({
    ...current,
    items: current.items.map((candidate) => candidate.sku === sku ? { ...candidate, onHand: countedQuantity } : candidate),
    movements: [movement, ...current.movements],
  })
}

export function commerceOrderHasReleasableReservation(state: CommerceState, orderId: string) {
  const order = state.orders.find((candidate) => candidate.id === orderId)
  if (!order || order.status === 'completed' || order.status === 'cancelled') return false
  const lines = reservationLinesForOrder(order)
  if (!lines.length) return false
  const reserves = state.movements.filter((movement) => movement.kind === 'reserve' && movement.orderId === orderId)
  const releases = state.movements.filter((movement) => movement.kind === 'release' && movement.orderId === orderId)
  return reserves.length === lines.length
    && releases.length === 0
    && lines.every((line) => reserves.filter((movement) => movement.sku === line.sku && movement.quantityDelta === -line.quantity).length === 1)
}

export function cancelCommerceOrder(state: CommerceState, orderId: string, proof: CommerceActionProof) {
  if (!validProof(proof)) return null
  const proofMovements = state.movements.filter((movement) => movement.actionId === proof.actionId)
  if (proofMovements.length) {
    const order = state.orders.find((candidate) => candidate.id === orderId)
    const lines = order ? reservationLinesForOrder(order) : []
    return order?.status === 'cancelled'
      && proofMovements.length === lines.length
      && lines.every((line) => proofMovements.some((movement) => movement.kind === 'release'
        && movement.orderId === orderId
        && movement.sku === line.sku
        && movement.quantityDelta === line.quantity
        && sameProof(movement, proof))) ? state : null
  }
  if (actionIdIsUsed(state, proof.actionId) || !commerceOrderHasReleasableReservation(state, orderId)) return null
  const order = state.orders.find((candidate) => candidate.id === orderId)
  if (!order) return null
  const lines = reservationLinesForOrder(order)
  const nextBalances = new Map<string, number>()
  for (const line of lines) {
    const matchingItems = state.items.filter((candidate) => candidate.sku === line.sku)
    const item = matchingItems.length === 1 ? matchingItems[0] : undefined
    if (!item) return null
    const nextBalance = safeBalance(item.onHand, line.quantity)
    if (nextBalance === null) return null
    nextBalances.set(item.sku, nextBalance)
  }
  const movements = lines.map((line, index) => movementFor(
    proof,
    { kind: 'release', sku: line.sku, quantityDelta: line.quantity, orderId },
    lines.length > 1 ? `L${index + 1}` : undefined,
  ))
  return validateCommerceState({
    ...state,
    items: state.items.map((candidate) => nextBalances.has(candidate.sku) ? { ...candidate, onHand: nextBalances.get(candidate.sku) as number } : candidate),
    orders: state.orders.map((candidate) => candidate.id === orderId ? {
      ...candidate,
      status: 'cancelled' as const,
      refundStatus: candidate.paymentStatus === 'reconciled' ? 'due' as const : 'none' as const,
    } : candidate),
    movements: [...movements, ...state.movements],
  })
}

export function reconcileCommercePayment(state: CommerceState, orderId: string, proof: CommerceActionProof) {
  if (!validProof(proof)) return null
  const order = state.orders.find((candidate) => candidate.id === orderId)
  if (!order || order.status === 'cancelled') return null
  if (order.paymentStatus === 'reconciled') {
    return order.paymentReconciliationActionId === proof.actionId
      && order.paymentReconciledAt === proof.capturedAt
      && order.paymentReconciledBy === proof.actor
      && order.paymentReconciliationReason === proof.reason
      && order.paymentEvidenceReference === proof.evidenceReference ? state : null
  }
  if (actionIdIsUsed(state, proof.actionId)) return null
  return validateCommerceState({
    ...state,
    orders: state.orders.map((candidate) => candidate.id === orderId ? {
      ...candidate,
      paymentStatus: 'reconciled' as const,
      paymentReconciledAt: proof.capturedAt,
      paymentReconciliationActionId: proof.actionId,
      paymentReconciledBy: proof.actor,
      paymentReconciliationReason: proof.reason,
      paymentEvidenceReference: proof.evidenceReference,
    } : candidate),
  })
}

export function settleCommerceRefund(state: CommerceState, orderId: string, proof: CommerceActionProof) {
  if (!validProof(proof)) return null
  const order = state.orders.find((candidate) => candidate.id === orderId)
  if (!order) return null
  if (order.refundStatus === 'settled') {
    return order.status === 'cancelled'
      && order.paymentStatus === 'reconciled'
      && order.refundSettlementActionId === proof.actionId
      && order.refundSettledAt === proof.capturedAt
      && order.refundSettledBy === proof.actor
      && order.refundSettlementReason === proof.reason
      && order.refundEvidenceReference === proof.evidenceReference ? state : null
  }
  if (order.refundStatus !== 'due'
    || order.status !== 'cancelled'
    || order.paymentStatus !== 'reconciled'
    || actionIdIsUsed(state, proof.actionId)) return null
  return validateCommerceState({
    ...state,
    orders: state.orders.map((candidate) => candidate.id === orderId ? {
      ...candidate,
      refundStatus: 'settled' as const,
      refundSettledAt: proof.capturedAt,
      refundSettlementActionId: proof.actionId,
      refundSettledBy: proof.actor,
      refundSettlementReason: proof.reason,
      refundEvidenceReference: proof.evidenceReference,
    } : candidate),
  })
}

function sameOrderReturnExpectation(
  left: CommerceOrderReturnExpectation,
  right: CommerceOrderReturnExpectation,
) {
  return left.orderId === right.orderId
    && left.sku === right.sku
    && left.soldQuantity === right.soldQuantity
    && left.returnedQuantity === right.returnedQuantity
    && left.stockOnHand === right.stockOnHand
    && left.orderSnapshot === right.orderSnapshot
}

export function commerceOrderReturnExpectation(
  state: CommerceState,
  orderId: string,
  sku: string,
  disposition: CommerceReturnDisposition,
): CommerceOrderReturnExpectation | null {
  if (!returnDispositions.includes(disposition)) return null
  const current = validateCommerceState(state)
  const matchingOrders = current.orders.filter((order) => order.id === orderId)
  const order = matchingOrders.length === 1 ? matchingOrders[0] : undefined
  if (!order || order.status !== 'completed' || !order.completion) return null
  const matchingLines = reservationLinesForOrder(order).filter((line) => line.sku === sku)
  if (matchingLines.length !== 1) return null
  const lines = reservationLinesForOrder(order)
  const reserves = current.movements.filter((movement) => movement.kind === 'reserve' && movement.orderId === orderId)
  const releases = current.movements.filter((movement) => movement.kind === 'release' && movement.orderId === orderId)
  if (reserves.length !== lines.length
    || releases.length
    || lines.some((line) => reserves.filter((movement) => (
      movement.sku === line.sku && movement.quantityDelta === -line.quantity
    )).length !== 1)) return null
  const returnedQuantity = (order.returns ?? [])
    .filter((record) => record.sku === sku)
    .reduce((sum, record) => sum + record.quantity, 0)
  if (!Number.isSafeInteger(returnedQuantity) || returnedQuantity >= matchingLines[0].quantity) return null
  const item = current.items.find((candidate) => candidate.sku === sku)
  if (!item) return null
  return {
    orderId,
    sku,
    soldQuantity: matchingLines[0].quantity,
    returnedQuantity,
    stockOnHand: disposition === 'restock' ? item.onHand : null,
    orderSnapshot: JSON.stringify(order),
  }
}

export function recordCommerceOrderReturn(
  state: CommerceState,
  input: CommerceOrderReturnInput,
  proof: CommerceActionProof,
  expected: CommerceOrderReturnExpectation,
) {
  if (!validProof(proof)
    || typeof input.orderId !== 'string'
    || !input.orderId
    || input.orderId !== input.orderId.trim()
    || input.orderId.length > 160
    || typeof input.sku !== 'string'
    || !input.sku
    || input.sku !== input.sku.trim()
    || input.sku.length > 80
    || !Number.isSafeInteger(input.quantity)
    || input.quantity < 1
    || !returnDispositions.includes(input.disposition)
    || [proof.actionId, proof.actor, proof.reason, proof.evidenceReference].some((value) => value !== value.trim())) return null
  const current = validateCommerceState(state)
  const replayRecords = current.orders.flatMap((order) => (
    (order.returns ?? [])
      .filter((record) => record.actionId === proof.actionId)
      .map((record) => ({ order, record }))
  ))
  if (replayRecords.length) {
    if (replayRecords.length !== 1) return null
    const { order, record } = replayRecords[0]
    const replayMovements = current.movements.filter((movement) => movement.actionId === proof.actionId)
    return order.id === input.orderId
      && record.sku === input.sku
      && record.quantity === input.quantity
      && record.disposition === input.disposition
      && sameReturnProof(record, proof)
      && (record.disposition === 'restock'
        ? replayMovements.length === 1 && movementMatchesReturn(replayMovements[0], record, order.id)
        : replayMovements.length === 0) ? current : null
  }
  if (actionIdIsUsed(current, proof.actionId)) return null
  const actual = commerceOrderReturnExpectation(current, input.orderId, input.sku, input.disposition)
  if (!actual || !expected || !sameOrderReturnExpectation(actual, expected)) return null
  const remaining = actual.soldQuantity - actual.returnedQuantity
  if (input.quantity > remaining) return null
  const order = current.orders.find((candidate) => candidate.id === input.orderId)
  const item = current.items.find((candidate) => candidate.sku === input.sku)
  if (!order || !item || !order.completion) return null
  const latestBasis = [
    order.createdAt,
    order.paymentReconciledAt,
    order.completion.capturedAt,
    ...current.movements.filter((movement) => movement.orderId === order.id).map((movement) => movement.createdAt),
    ...(order.returns ?? []).map((record) => record.createdAt),
  ].flatMap((timestamp) => timestamp ? [timestampMicros(timestamp) as bigint] : [])
    .reduce((latest, timestamp) => timestamp > latest ? timestamp : latest, 0n)
  if ((timestampMicros(proof.capturedAt) as bigint) < latestBasis) return null
  const record: CommerceOrderReturn = {
    actionId: proof.actionId,
    createdAt: proof.capturedAt,
    actor: proof.actor,
    reason: proof.reason,
    evidenceReference: proof.evidenceReference,
    sku: input.sku,
    quantity: input.quantity,
    disposition: input.disposition,
  }
  const nextBalance = input.disposition === 'restock'
    ? safeBalance(item.onHand, input.quantity)
    : item.onHand
  if (nextBalance === null) return null
  const movement = input.disposition === 'restock'
    ? movementFor(proof, {
        kind: 'return',
        sku: input.sku,
        quantityDelta: input.quantity,
        orderId: input.orderId,
      })
    : null
  return validateCommerceState({
    ...current,
    items: input.disposition === 'restock'
      ? current.items.map((candidate) => candidate.sku === input.sku ? { ...candidate, onHand: nextBalance } : candidate)
      : current.items,
    orders: current.orders.map((candidate) => candidate.id === input.orderId
      ? { ...candidate, returns: [record, ...(candidate.returns ?? [])] }
      : candidate),
    movements: movement ? [movement, ...current.movements] : current.movements,
  })
}

function sameCloseExpectation(left: CommerceCloseExpectation, right: CommerceCloseExpectation) {
  return left.businessDate === right.businessDate
    && left.total === right.total
    && left.stateSnapshot === right.stateSnapshot
    && sameStringArray(left.orderIds, right.orderIds)
    && sameStringArray(left.paymentExceptionOrderIds, right.paymentExceptionOrderIds)
    && sameStringArray(left.stockExceptionSkus, right.stockExceptionSkus)
}

export function commerceCloseExpectation(state: CommerceState, capturedAt: string): CommerceCloseExpectation | null {
  if (!validTimestamp(capturedAt)) return null
  const current = validateCommerceState(state)
  if (current.closes.some((close) => !close.orderIds || !close.businessDate)) return null
  const businessDate = myanmarBusinessDate(capturedAt)
  if (current.closes.some((close) => close.businessDate === businessDate)) return null
  const previouslyClosedOrderIds = new Set(current.closes.flatMap((close) => close.orderIds ?? []))
  const orderIds = current.orders
    .filter((order) => order.status === 'completed'
      && order.paymentStatus === 'reconciled'
      && !previouslyClosedOrderIds.has(order.id))
    .map((order) => order.id)
    .sort()
  const total = orderIds.reduce((sum, orderId) => sum + (current.orders.find((order) => order.id === orderId)?.total ?? 0), 0)
  if (!Number.isSafeInteger(total)) return null
  return {
    businessDate,
    orderIds,
    total,
    paymentExceptionOrderIds: current.orders
      .filter((order) => order.refundStatus === 'due' || (order.status !== 'cancelled' && order.paymentStatus === 'pending'))
      .map((order) => order.id)
      .sort(),
    stockExceptionSkus: current.items
      .filter((item) => item.onHand <= item.reorderAt)
      .map((item) => item.sku)
      .sort(),
    stateSnapshot: JSON.stringify(current),
  }
}

export function saveCommerceClose(
  state: CommerceState,
  closeId: string,
  proof: CommerceActionProof,
  expected: CommerceCloseExpectation,
) {
  if (!validProof(proof)
    || !validTimestamp(proof.capturedAt)
    || [proof.actionId, proof.actor, proof.reason, proof.evidenceReference].some((value) => value !== value.trim())
    || !closeActionIdPattern.test(proof.actionId)
    || !closeIdPattern.test(closeId)) return null
  const current = validateCommerceState(state)
  const existing = current.closes.find((close) => close.id === closeId)
  if (existing) return sameCloseProof(existing, proof) ? current : null
  if (actionIdIsUsed(current, proof.actionId)) return null
  const actual = commerceCloseExpectation(current, proof.capturedAt)
  if (!actual || !expected || !sameCloseExpectation(actual, expected)) return null
  const close: CommerceClose = {
    id: closeId,
    createdAt: proof.capturedAt,
    total: actual.total,
    orders: actual.orderIds.length,
    businessDate: actual.businessDate,
    orderIds: actual.orderIds,
    paymentExceptionOrderIds: actual.paymentExceptionOrderIds,
    stockExceptionSkus: actual.stockExceptionSkus,
    actionId: proof.actionId,
    operator: proof.actor,
    reason: proof.reason,
    evidenceReference: proof.evidenceReference,
  }
  return validateCommerceState({ ...current, closes: [close, ...current.closes] })
}

export function advanceCommerceOrder(
  state: CommerceState,
  orderId: string,
  expectedStatus: CommerceOrderStatus,
  proof?: CommerceActionProof,
  timestampAuthority: 'client' | 'managed-server' = 'client',
) {
  const current = validateCommerceState(state)
  const order = current.orders.find((candidate) => candidate.id === orderId)
  if (!order || order.status !== expectedStatus || order.status === 'completed' || order.status === 'cancelled') return null
  const currentStatus = order.status as 'confirmed' | 'preparing' | 'ready'
  if (order.status === 'ready' && order.paymentStatus !== 'reconciled') return null
  if (!proof
    || !validProof(proof)
    || [proof.actionId, proof.actor, proof.reason, proof.evidenceReference].some((value) => value !== value.trim())
    || actionIdIsUsed(current, proof.actionId)) return null
  let retainedProof = proof
  if (order.status === 'ready') {
    const chronology = [
      order.createdAt,
      order.paymentReconciledAt,
      ...current.movements.filter((movement) => movement.orderId === order.id).map((movement) => movement.createdAt),
    ].flatMap((timestamp) => timestamp ? [{ timestamp, micros: timestampMicros(timestamp) as bigint }] : [])
    const latestBasis = chronology.reduce(
      (latest, candidate) => candidate.micros > latest.micros ? candidate : latest,
      { timestamp: proof.capturedAt, micros: 0n },
    )
    if ((timestampMicros(proof.capturedAt) as bigint) < latestBasis.micros) {
      if (timestampAuthority !== 'managed-server') return null
      retainedProof = { ...proof, capturedAt: latestBasis.timestamp }
    }
  }
  const next: Record<'confirmed' | 'preparing' | 'ready', CommerceOrderStatus> = { confirmed: 'preparing', preparing: 'ready', ready: 'completed' }
  return validateCommerceState({
    ...current,
    orders: current.orders.map((candidate) => candidate.id === orderId ? {
      ...candidate,
      status: next[currentStatus],
      ...(currentStatus !== 'ready'
        ? { advancementActionIds: [...(candidate.advancementActionIds ?? []), proof.actionId] }
        : {}),
      ...(currentStatus === 'ready' ? { completion: { ...retainedProof } } : {}),
    } : candidate),
  })
}
