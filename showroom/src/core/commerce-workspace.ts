export const COMMERCE_WORKSPACE_SCHEMA = 'supermega.commerce.workspace.v2' as const
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

export type CommerceOrderLine = {
  sku: string
  name: string
  variant?: string
  quantity: number
  unitPriceMmk: number
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
  total: number
  status: CommerceOrderStatus
}

export type CommerceStockMovementKind = 'opening' | 'reserve' | 'release' | 'receipt'

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

export type CommerceState = {
  schema: typeof COMMERCE_WORKSPACE_SCHEMA
  items: CommerceItem[]
  orders: CommerceOrder[]
  movements: CommerceStockMovement[]
  closes: CommerceClose[]
  websiteIntakes?: CommerceWebsiteIntake[]
  storefrontRequests?: CommerceStorefrontRequest[]
}

export type CommerceActionProof = {
  actionId: string
  capturedAt: string
  actor: string
  reason: string
  evidenceReference: string
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

type CommerceStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
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
const movementKinds: CommerceStockMovementKind[] = ['opening', 'reserve', 'release', 'receipt']
const websiteIntakeStatuses: CommerceWebsiteIntakeStatus[] = ['pending_confirmation', 'converted']
const closeSnapshotFields = ['businessDate', 'orderIds', 'paymentExceptionOrderIds', 'stockExceptionSkus', 'actionId', 'operator', 'reason', 'evidenceReference'] as const
const refundSettlementFields = ['refundSettledAt', 'refundSettlementActionId', 'refundSettledBy', 'refundSettlementReason', 'refundEvidenceReference'] as const
const websiteIntakeIdPattern = /^WINT-[A-Z0-9-]{8,80}$/
const websiteFingerprintPattern = /^web-[a-f0-9]{8}$/
const storefrontRequestIdPattern = /^ECR-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const storefrontIdempotencyPattern = /^ECI-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const sha256DigestPattern = /^sha256:[a-f0-9]{64}$/
const maxStorefrontRequests = 100
const maxOrderLines = 20
const closeIdPattern = /^CLOSE-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const closeActionIdPattern = /^ACT-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const businessDatePattern = /^\d{4}-\d{2}-\d{2}$/
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

function optionalText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function validTimestamp(value: unknown) {
  return typeof value === 'string'
    && value === value.trim()
    && /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value))
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
      && Number.isFinite(Date.parse(proof.capturedAt)),
    )
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
  return { schema: COMMERCE_WORKSPACE_SCHEMA, items: [], orders: [], movements: [], closes: [], websiteIntakes: [], storefrontRequests: [] }
}

export function createSeedCommerce(now = deterministicSeedNow): CommerceState {
  const firstOrderAt = new Date(now - 54 * 60 * 1000).toISOString()
  const secondOrderAt = new Date(now - 29 * 60 * 1000).toISOString()
  return {
    schema: COMMERCE_WORKSPACE_SCHEMA,
    items: [
      { sku: 'SM-1001', name: 'Daily essentials basket', onHand: 34, reorderAt: 10, price: 18500 },
      { sku: 'SM-1002', name: 'Cold drink pack', onHand: 8, reorderAt: 12, price: 6500 },
      { sku: 'SM-1003', name: 'Household refill', onHand: 21, reorderAt: 8, price: 12000 },
      { sku: 'SM-1004', name: 'Personal care set', onHand: 13, reorderAt: 6, price: 22500 },
      { sku: 'SM-CARE-01', name: 'Family care set', variant: 'Standard bundle', onHand: 14, reorderAt: 6, price: 31000 },
    ],
    orders: [
      { id: 'ORD-1042', createdAt: firstOrderAt, customer: 'May', channel: 'Messenger', item: 'Daily essentials basket', itemSku: 'SM-1001', quantity: 2, payment: 'KBZPay', paymentStatus: 'pending', refundStatus: 'none', total: 37000, status: 'preparing' },
      { id: 'ORD-1041', createdAt: secondOrderAt, customer: 'Ko Aung', channel: 'Phone', item: 'Household refill', itemSku: 'SM-1003', quantity: 1, payment: 'Cash on delivery', paymentStatus: 'pending', refundStatus: 'none', total: 12000, status: 'ready' },
    ],
    movements: [
      { id: 'MOV-ACT-DEMO-1042', actionId: 'ACT-DEMO-1042', createdAt: firstOrderAt, actor: 'Demo operator', reason: 'Seed the local Commerce walkthrough.', evidenceReference: 'DEMO-SEED-ORD-1042', kind: 'reserve', sku: 'SM-1001', quantityDelta: -2, orderId: 'ORD-1042' },
      { id: 'MOV-ACT-DEMO-1041', actionId: 'ACT-DEMO-1041', createdAt: secondOrderAt, actor: 'Demo operator', reason: 'Seed the local Commerce walkthrough.', evidenceReference: 'DEMO-SEED-ORD-1041', kind: 'reserve', sku: 'SM-1003', quantityDelta: -1, orderId: 'ORD-1041' },
    ],
    closes: [],
    websiteIntakes: [],
    storefrontRequests: [],
  }
}

export function validateCommerceState(value: unknown): CommerceState {
  if (!isRecord(value) || value.schema !== COMMERCE_WORKSPACE_SCHEMA) throw new Error('Commerce workspace schema is not v2.')
  if (!Array.isArray(value.items) || !Array.isArray(value.orders) || !Array.isArray(value.movements) || !Array.isArray(value.closes)) throw new Error('Commerce workspace collections are incomplete.')
  if (value.websiteIntakes !== undefined && !Array.isArray(value.websiteIntakes)) throw new Error('Commerce Website intakes must be an array when present.')
  if (value.storefrontRequests !== undefined && !Array.isArray(value.storefrontRequests)) throw new Error('Commerce storefront requests must be an array when present.')

  const items = value.items as unknown[]
  const orders = value.orders as unknown[]
  const movements = value.movements as unknown[]
  const closes = value.closes as unknown[]
  const websiteIntakes = (value.websiteIntakes ?? []) as unknown[]
  const storefrontRequests = (value.storefrontRequests ?? []) as unknown[]
  if (storefrontRequests.length > maxStorefrontRequests) throw new Error(`Commerce storefront requests cannot exceed ${maxStorefrontRequests}.`)
  const itemSkus: string[] = []
  const itemBySku = new Map<string, Record<string, unknown>>()
  const orderIds: string[] = []
  const orderById = new Map<string, Record<string, unknown>>()
  const sourceRecordIds: string[] = []
  const movementIds: string[] = []
  const movementActionIds: string[] = []
  const reconciliationActionIds: string[] = []
  const refundSettlementActionIds: string[] = []
  const closeActionIds: string[] = []
  const closeBusinessDates: string[] = []
  const closedOrderIds: string[] = []
  const websiteIntakeCreationActionIds: string[] = []
  const websiteIntakeConversionActionIds: string[] = []

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
    orderById.set(candidate.id as string, candidate)
  }
  assertUnique(orderIds, 'Order ID')
  assertUnique(sourceRecordIds, 'Order source record ID')
  assertUnique(reconciliationActionIds, 'Payment reconciliation action ID')
  assertUnique(refundSettlementActionIds, 'Refund settlement action ID')

  const reserveByOrder = new Map<string, number>()
  const releaseByOrder = new Map<string, number>()
  const reserveActionsByOrder = new Map<string, Set<string>>()
  const releaseActionsByOrder = new Map<string, Set<string>>()
  const movementsByAction = new Map<string, CommerceStockMovement[]>()
  for (const [index, candidate] of movements.entries()) {
    if (!isRecord(candidate)) throw new Error(`movements[${index}] is invalid.`)
    movementIds.push(requiredText(candidate.id, `movements[${index}].id`))
    movementActionIds.push(requiredText(candidate.actionId, `movements[${index}].actionId`))
    if (!validTimestamp(candidate.createdAt)) throw new Error(`movements[${index}].createdAt is invalid.`)
    for (const field of ['actor', 'reason', 'evidenceReference', 'sku'] as const) requiredText(candidate[field], `movements[${index}].${field}`)
    if (!itemSkus.includes(candidate.sku as string)) throw new Error(`movements[${index}].sku is unknown.`)
    if (!movementKinds.includes(candidate.kind as CommerceStockMovementKind)) throw new Error(`movements[${index}].kind is invalid.`)
    const actionMovements = movementsByAction.get(candidate.actionId as string) ?? []
    actionMovements.push(candidate as unknown as CommerceStockMovement)
    movementsByAction.set(candidate.actionId as string, actionMovements)
    if (candidate.kind === 'opening') {
      assertSafeInteger(candidate.quantityDelta, `movements[${index}].quantityDelta`)
      if (candidate.orderId !== undefined) throw new Error(`movements[${index}] opening balance cannot reference an order.`)
      continue
    }
    if (!Number.isSafeInteger(candidate.quantityDelta) || candidate.quantityDelta === 0) throw new Error(`movements[${index}].quantityDelta is invalid.`)
    if (candidate.kind === 'reserve' && Number(candidate.quantityDelta) >= 0) throw new Error(`movements[${index}] reserve must be negative.`)
    if (candidate.kind !== 'reserve' && Number(candidate.quantityDelta) <= 0) throw new Error(`movements[${index}] release or receipt must be positive.`)
    if (candidate.kind === 'receipt') {
      if (candidate.orderId !== undefined) throw new Error(`movements[${index}] receipt cannot reference an order.`)
      continue
    }
    const orderId = requiredText(candidate.orderId, `movements[${index}].orderId`)
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
      ['itemVariant', 'conversion'],
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
    if (itemName !== item.name || itemVariant !== optionalText(item.variant) || candidate.unitPrice !== item.price || candidate.total !== Number(candidate.quantity) * Number(candidate.unitPrice)) {
      throw new Error(`websiteIntakes[${index}] does not match its Commerce catalog record.`)
    }
    if (!isRecord(candidate.creation) || !hasExactKeys(candidate.creation, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])) {
      throw new Error(`websiteIntakes[${index}].creation is invalid.`)
    }
    const creation = candidate.creation as CommerceActionProof
    if (!validProof(creation) || creation.capturedAt !== candidate.createdAt) throw new Error(`websiteIntakes[${index}].creation is invalid.`)
    for (const field of ['actionId', 'actor', 'reason', 'evidenceReference'] as const) canonicalText(creation[field], `websiteIntakes[${index}].creation.${field}`, field === 'actionId' ? 160 : 180)
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
    if (!isRecord(candidate) || !hasExactKeys(
      candidate,
      ['schema', 'mode', 'state', 'id', 'idempotencyKey', 'createdAt', 'sourcePreviewDigest', 'customerReference', 'fulfilment', 'currency', 'line', 'totalMmk'],
    )) throw new Error(`storefrontRequests[${index}] is invalid.`)
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
      || candidate.fulfilment !== 'pickup' && candidate.fulfilment !== 'delivery'
      || candidate.currency !== 'MMK'
      || !isRecord(candidate.line)
      || !hasExactKeys(candidate.line, ['sku', 'name', 'variant', 'quantity', 'unitPriceMmk'])) {
      throw new Error(`storefrontRequests[${index}] is invalid.`)
    }
    canonicalText(candidate.customerReference, `storefrontRequests[${index}].customerReference`, 80)
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
  assertUnique([...new Set(movementActionIds), ...reconciliationActionIds, ...refundSettlementActionIds, ...websiteIntakeCreationActionIds, ...closeActionIds, ...storefrontActionIds], 'Commerce action ID')
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
  return validateCommerceState({ schema: COMMERCE_WORKSPACE_SCHEMA, items, orders, movements: [], closes, websiteIntakes: [], storefrontRequests: [] })
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
    || state.closes.some((close) => close.actionId === actionId)
    || commerceWebsiteIntakes(state).some((intake) => intake.creation.actionId === actionId || intake.conversion?.actionId === actionId)
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

function validWebsiteSource(source: CommerceWebsiteSource) {
  return websiteFingerprintPattern.test(source.fingerprint)
    && [source.approvalId, source.snapshotId, source.pageId, source.siteName, source.pagePath].every((value) => typeof value === 'string' && value === value.trim() && value.length > 0 && value.length <= 160)
    && source.pagePath.startsWith('/')
}

export function commerceWebsiteIntakes(state: CommerceState) {
  return state.websiteIntakes ?? []
}

export function commerceStorefrontRequests(state: CommerceState) {
  return state.storefrontRequests ?? []
}

function sameStorefrontRequest(left: CommerceStorefrontRequest, right: CommerceStorefrontRequest) {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function recordCommerceStorefrontRequest(
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
    return existingById === existingByIdempotency && sameStorefrontRequest(existing, validatedRequest) ? current : null
  }
  if (actionIdIsUsed(current, proof.actionId)
    || current.orders.some((order) => order.sourceRecordId === validatedRequest.id)) return null
  if (requests.length >= maxStorefrontRequests) return null
  const matches = current.items.filter((item) => item.sku === validatedRequest.line.sku)
  if (matches.length !== 1
    || matches[0].name !== validatedRequest.line.name
    || (matches[0].variant ?? null) !== validatedRequest.line.variant
    || matches[0].price !== validatedRequest.line.unitPriceMmk) return null
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
  const intake: CommerceWebsiteIntake = {
    id: input.id,
    createdAt: proof.capturedAt,
    status: 'pending_confirmation',
    source: { ...input.source },
    sku: item.sku,
    quantity: input.quantity,
    itemName: item.name,
    unitPrice: item.price,
    total,
    creation: { ...proof },
  }
  if (item.variant) intake.itemVariant = item.variant
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
    return proofMovement.kind === 'opening'
      && proofMovement.sku === item.sku
      && proofMovement.quantityDelta === item.onHand
      && sameProof(proofMovement, proof)
      && JSON.stringify(storedItem) === JSON.stringify(item) ? state : null
  }
  if (actionIdIsUsed(state, proof.actionId) || state.items.some((candidate) => candidate.sku === item.sku)) return null
  const opening = movementFor(proof, { kind: 'opening', sku: item.sku, quantityDelta: item.onHand })
  return validateCommerceState({ ...state, items: [item, ...state.items], movements: [opening, ...state.movements] })
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

export function advanceCommerceOrder(state: CommerceState, orderId: string, expectedStatus: CommerceOrderStatus) {
  const order = state.orders.find((candidate) => candidate.id === orderId)
  if (!order || order.status !== expectedStatus || order.status === 'completed' || order.status === 'cancelled') return null
  const currentStatus = order.status as 'confirmed' | 'preparing' | 'ready'
  if (order.status === 'ready' && order.paymentStatus !== 'reconciled') return null
  const next: Record<'confirmed' | 'preparing' | 'ready', CommerceOrderStatus> = { confirmed: 'preparing', preparing: 'ready', ready: 'completed' }
  return validateCommerceState({
    ...state,
    orders: state.orders.map((candidate) => candidate.id === orderId ? { ...candidate, status: next[currentStatus] } : candidate),
  })
}
