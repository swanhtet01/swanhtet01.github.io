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
export type CommerceRefundStatus = 'none' | 'due'

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
  fulfilment?: string
  sourceRecordId?: string
  evidenceReference?: string
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

export type CommerceState = {
  schema: typeof COMMERCE_WORKSPACE_SCHEMA
  items: CommerceItem[]
  orders: CommerceOrder[]
  movements: CommerceStockMovement[]
  closes: Array<{ id: string; createdAt: string; total: number; orders: number }>
  websiteIntakes?: CommerceWebsiteIntake[]
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
const refundStatuses: CommerceRefundStatus[] = ['none', 'due']
const movementKinds: CommerceStockMovementKind[] = ['opening', 'reserve', 'release', 'receipt']
const websiteIntakeStatuses: CommerceWebsiteIntakeStatus[] = ['pending_confirmation', 'converted']
const websiteIntakeIdPattern = /^WINT-[A-Z0-9-]{8,80}$/
const websiteFingerprintPattern = /^web-[a-f0-9]{8}$/
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

export function createEmptyCommerce(): CommerceState {
  return { schema: COMMERCE_WORKSPACE_SCHEMA, items: [], orders: [], movements: [], closes: [], websiteIntakes: [] }
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
  }
}

export function validateCommerceState(value: unknown): CommerceState {
  if (!isRecord(value) || value.schema !== COMMERCE_WORKSPACE_SCHEMA) throw new Error('Commerce workspace schema is not v2.')
  if (!Array.isArray(value.items) || !Array.isArray(value.orders) || !Array.isArray(value.movements) || !Array.isArray(value.closes)) throw new Error('Commerce workspace collections are incomplete.')
  if (value.websiteIntakes !== undefined && !Array.isArray(value.websiteIntakes)) throw new Error('Commerce Website intakes must be an array when present.')

  const items = value.items as unknown[]
  const orders = value.orders as unknown[]
  const movements = value.movements as unknown[]
  const closes = value.closes as unknown[]
  const websiteIntakes = (value.websiteIntakes ?? []) as unknown[]
  const itemSkus: string[] = []
  const itemBySku = new Map<string, Record<string, unknown>>()
  const orderIds: string[] = []
  const orderById = new Map<string, Record<string, unknown>>()
  const sourceRecordIds: string[] = []
  const movementIds: string[] = []
  const movementActionIds: string[] = []
  const reconciliationActionIds: string[] = []
  const websiteIntakeCreationActionIds: string[] = []
  const websiteIntakeConversionActionIds: string[] = []

  for (const [index, candidate] of items.entries()) {
    if (!isRecord(candidate)) throw new Error(`items[${index}] is invalid.`)
    const sku = requiredText(candidate.sku, `items[${index}].sku`)
    itemSkus.push(sku)
    itemBySku.set(sku, candidate)
    requiredText(candidate.name, `items[${index}].name`)
    if (candidate.variant !== undefined) requiredText(candidate.variant, `items[${index}].variant`)
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
    if (!orderStatuses.includes(candidate.status as CommerceOrderStatus)) throw new Error(`orders[${index}].status is invalid.`)
    if (!paymentStatuses.includes(candidate.paymentStatus as CommercePaymentStatus)) throw new Error(`orders[${index}].paymentStatus is invalid.`)
    if (!refundStatuses.includes(candidate.refundStatus as CommerceRefundStatus)) throw new Error(`orders[${index}].refundStatus is invalid.`)
    for (const field of ['fulfilment', 'sourceRecordId', 'evidenceReference'] as const) {
      if (candidate[field] !== undefined) {
        const fieldValue = requiredText(candidate[field], `orders[${index}].${field}`)
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
    if (candidate.refundStatus === 'due' && (candidate.status !== 'cancelled' || candidate.paymentStatus !== 'reconciled')) throw new Error(`orders[${index}] has an invalid refund exception.`)
    if (candidate.status === 'cancelled' && candidate.paymentStatus === 'reconciled' && candidate.refundStatus !== 'due') throw new Error(`orders[${index}] must preserve the refund due exception.`)
    orderById.set(candidate.id as string, candidate)
  }
  assertUnique(orderIds, 'Order ID')
  assertUnique(sourceRecordIds, 'Order source record ID')
  assertUnique(reconciliationActionIds, 'Payment reconciliation action ID')

  const reserveByOrder = new Map<string, number>()
  const releaseByOrder = new Map<string, number>()
  for (const [index, candidate] of movements.entries()) {
    if (!isRecord(candidate)) throw new Error(`movements[${index}] is invalid.`)
    movementIds.push(requiredText(candidate.id, `movements[${index}].id`))
    movementActionIds.push(requiredText(candidate.actionId, `movements[${index}].actionId`))
    if (!validTimestamp(candidate.createdAt)) throw new Error(`movements[${index}].createdAt is invalid.`)
    for (const field of ['actor', 'reason', 'evidenceReference', 'sku'] as const) requiredText(candidate[field], `movements[${index}].${field}`)
    if (!itemSkus.includes(candidate.sku as string)) throw new Error(`movements[${index}].sku is unknown.`)
    if (!movementKinds.includes(candidate.kind as CommerceStockMovementKind)) throw new Error(`movements[${index}].kind is invalid.`)
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
    if (!order || order.itemSku !== candidate.sku || Math.abs(Number(candidate.quantityDelta)) !== order.quantity) throw new Error(`movements[${index}] does not match its order reservation.`)
    const counter = candidate.kind === 'reserve' ? reserveByOrder : releaseByOrder
    counter.set(orderId, (counter.get(orderId) ?? 0) + 1)
    if (candidate.kind === 'release' && order.status !== 'cancelled') throw new Error(`movements[${index}] release requires a cancelled order.`)
  }
  assertUnique(movementIds, 'Stock movement ID')
  assertUnique(movementActionIds, 'Stock movement action ID')
  for (const [orderId, count] of reserveByOrder) if (count !== 1) throw new Error(`${orderId} has more than one reservation.`)
  for (const [orderId, count] of releaseByOrder) {
    if (count !== 1 || reserveByOrder.get(orderId) !== 1) throw new Error(`${orderId} has an unproven stock release.`)
  }

  const closeIds: string[] = []
  for (const [index, candidate] of closes.entries()) {
    if (!isRecord(candidate)) throw new Error(`closes[${index}] is invalid.`)
    closeIds.push(requiredText(candidate.id, `closes[${index}].id`))
    if (!validTimestamp(candidate.createdAt)) throw new Error(`closes[${index}].createdAt is invalid.`)
    assertSafeInteger(candidate.total, `closes[${index}].total`)
    assertSafeInteger(candidate.orders, `closes[${index}].orders`)
  }
  assertUnique(closeIds, 'Daily close ID')

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
  assertUnique([...movementActionIds, ...reconciliationActionIds, ...websiteIntakeCreationActionIds], 'Commerce action ID')
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
  return validateCommerceState({ schema: COMMERCE_WORKSPACE_SCHEMA, items, orders, movements: [], closes, websiteIntakes: [] })
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

function movementFor(proof: CommerceActionProof, input: Omit<CommerceStockMovement, 'id' | 'actionId' | 'createdAt' | 'actor' | 'reason' | 'evidenceReference'>): CommerceStockMovement {
  return {
    id: `MOV-${proof.actionId}`,
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
    || state.orders.some((order) => order.paymentReconciliationActionId === actionId)
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
      && order.fulfilment === (input.fulfilmentMethod === 'pickup' ? 'Customer pickup' : 'Local delivery')
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
  const fulfilment = input.fulfilmentMethod === 'pickup' ? 'Customer pickup' : 'Local delivery'
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
    || !sku || sku !== item.sku
    || !name || name !== item.name
    || (item.variant !== undefined && variant !== item.variant)
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

export function reserveCommerceOrder(state: CommerceState, order: CommerceOrder, proof: CommerceActionProof) {
  if (!validProof(proof) || order.status !== 'confirmed' || !order.itemSku || order.quantity < 1 || order.paymentStatus !== 'pending' || order.refundStatus !== 'none') return null
  if (Boolean(order.sourceRecordId) !== Boolean(order.evidenceReference)
    || (order.evidenceReference && order.evidenceReference !== proof.evidenceReference)) return null
  const proofMovement = state.movements.find((movement) => movement.actionId === proof.actionId)
  if (proofMovement) {
    const storedOrder = state.orders.find((candidate) => candidate.id === order.id)
    return proofMovement.kind === 'reserve'
      && proofMovement.orderId === order.id
      && proofMovement.sku === order.itemSku
      && proofMovement.quantityDelta === -order.quantity
      && sameProof(proofMovement, proof)
      && JSON.stringify(storedOrder) === JSON.stringify(order) ? state : null
  }
  if (actionIdIsUsed(state, proof.actionId)) return null
  const duplicate = state.orders.some((candidate) => candidate.id === order.id || Boolean(order.sourceRecordId && candidate.sourceRecordId === order.sourceRecordId))
  if (duplicate) return null
  const matchingItems = state.items.filter((candidate) => candidate.sku === order.itemSku)
  const item = matchingItems.length === 1 ? matchingItems[0] : undefined
  if (!item || item.onHand < order.quantity || item.price * order.quantity !== order.total) return null
  const nextBalance = safeBalance(item.onHand, -order.quantity)
  if (nextBalance === null) return null
  const movement = movementFor(proof, { kind: 'reserve', sku: item.sku, quantityDelta: -order.quantity, orderId: order.id })
  return validateCommerceState({
    ...state,
    items: state.items.map((candidate) => candidate.sku === item.sku ? { ...candidate, onHand: nextBalance } : candidate),
    orders: [order, ...state.orders],
    movements: [movement, ...state.movements],
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
  if (!order || !order.itemSku || order.status === 'completed' || order.status === 'cancelled') return false
  const reserves = state.movements.filter((movement) => movement.kind === 'reserve' && movement.orderId === orderId && movement.sku === order.itemSku && movement.quantityDelta === -order.quantity)
  const releases = state.movements.filter((movement) => movement.kind === 'release' && movement.orderId === orderId)
  return reserves.length === 1 && releases.length === 0
}

export function cancelCommerceOrder(state: CommerceState, orderId: string, proof: CommerceActionProof) {
  if (!validProof(proof)) return null
  const proofMovement = state.movements.find((movement) => movement.actionId === proof.actionId)
  if (proofMovement) {
    const order = state.orders.find((candidate) => candidate.id === orderId)
    return order?.status === 'cancelled'
      && proofMovement.kind === 'release'
      && proofMovement.orderId === orderId
      && proofMovement.sku === order.itemSku
      && proofMovement.quantityDelta === order.quantity
      && sameProof(proofMovement, proof) ? state : null
  }
  if (actionIdIsUsed(state, proof.actionId) || !commerceOrderHasReleasableReservation(state, orderId)) return null
  const order = state.orders.find((candidate) => candidate.id === orderId)
  if (!order?.itemSku) return null
  const item = state.items.find((candidate) => candidate.sku === order.itemSku)
  if (!item) return null
  const nextBalance = safeBalance(item.onHand, order.quantity)
  if (nextBalance === null) return null
  const movement = movementFor(proof, { kind: 'release', sku: item.sku, quantityDelta: order.quantity, orderId })
  return validateCommerceState({
    ...state,
    items: state.items.map((candidate) => candidate.sku === item.sku ? { ...candidate, onHand: nextBalance } : candidate),
    orders: state.orders.map((candidate) => candidate.id === orderId ? {
      ...candidate,
      status: 'cancelled' as const,
      refundStatus: candidate.paymentStatus === 'reconciled' ? 'due' as const : 'none' as const,
    } : candidate),
    movements: [movement, ...state.movements],
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
