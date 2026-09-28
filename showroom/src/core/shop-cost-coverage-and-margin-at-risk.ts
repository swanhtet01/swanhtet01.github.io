import {
  commerceSupplierInvoiceMatch,
  type CommerceOrder,
  type CommerceState,
  type CommerceStockMovement,
} from './commerce-workspace'

export const SHOP_COST_EVIDENCE_MAX_AGE_DAYS = 180
export const SHOP_MARGIN_FLOOR_BASIS_POINTS = 1_500

const DAY_MS = 24 * 60 * 60 * 1_000
const MAX_COUNT = 100_000
const MAX_MMK = 1_000_000_000_000

export type ShopMarginAtRiskPriority = {
  id: string
  sku: string
  itemName: string
  severity: 'critical' | 'attention'
  marginBasisPoints: number | null
  marginMmk: number
  exposureMmk: number
  ownerRole: 'Shop owner'
  dueLabel: 'Before the next daily close'
  actionLabel: 'Review price and cost evidence'
  target: '/shop/?tab=inventory#purchase-orders'
  closureCondition: string
}

export type ShopCostCoverageAndMarginAtRisk = {
  contract: 'supermega.shop.cost_coverage_and_margin_at_risk.v1'
  state: 'no_retained_sales' | 'collecting_cost_evidence' | 'review_adjustments' | 'margin_at_risk' | 'controlled'
  costCoverage: {
    state: 'no_retained_sales' | 'incomplete' | 'complete'
    method: 'single_reviewed_unit_cost_per_sku_fifo_by_receipt'
    soldValueMmk: number
    coveredSoldValueMmk: number
    coverageBasisPoints: number
    retainedNonSampleCompletedSaleCount: number
    countedLineCount: number
    fullyCostedLineCount: number
    gaps: {
      missingLineCount: number
      staleLineCount: number
      unlinkedLineCount: number
      unreviewedLineCount: number
      partialLineCount: number
      costMethodLineCount: number
    }
  }
  profit: {
    status: 'withheld' | 'available'
    grossProfitMmk: number | null
    marginBasisPoints: number | null
    reason: string
  }
  activity: {
    retainedNonSampleCompletedSales: number
    openOrders: number
    cancelledOrders: number
    sampleOrders: number
    sampleCompletedSales: number
    sampleSoldValueMmk: number
    returnRecords: number
    correctionRecords: number
    adjustmentBlockedSales: number
  }
  scaling: {
    movementTraversalCount: number
    movementTraversalBound: number
    purchaseOrderTraversalCount: number
    purchaseOrderTraversalBound: number
    costLotTraversalCount: number
    costLotTraversalBound: number
  }
  marginAtRiskMmk: number | null
  priorities: ShopMarginAtRiskPriority[]
  boundary: string
  authority: {
    paymentWrite: false
    stockWrite: false
    supplierWrite: false
    accountingWrite: false
    customerWrite: false
    hostedWrite: false
    modelUsed: false
  }
}

type CostLot = {
  active: boolean
  expired: boolean
  movementId: string
  purchaseOrderId: string
  receivedAtMs: number
  reviewedAtMs: number
  remainingQuantity: number
  sku: string
  unitCostMmk: number
}

type CostAllocator = {
  activeLotCountByUnitCost: Map<number, number>
  activationIndex: number
  allocationIndex: number
  byReceipt: CostLot[]
  byReview: CostLot[]
  expiryIndex: number
  maxReviewedAtMs: number
  minReceivedAtMs: number
}

type CostSourceStatus = {
  source: boolean
  priced: boolean
  linked: boolean
  reviewed: boolean
}

type CountedLine = {
  completedAtMs: number
  itemName: string
  orderId: string
  quantity: number
  saleValueMmk: number
  sequence: number
  sku: string
}

type MarginGroup = {
  itemName: string
  saleValueMmk: number
  costMmk: number
}

function assertWhole(value: number, label: string, maximum = MAX_MMK) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw new Error(`${label} must be a safe non-negative whole number.`)
}

function safeTimestamp(value: string | undefined, label: string) {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp.`)
  return parsed
}

function safeNumber(value: bigint, label: string) {
  if (value < BigInt(-MAX_MMK) || value > BigInt(MAX_MMK)) throw new Error(`${label} exceeds the supported MMK range.`)
  return Number(value)
}

function safeAdd(left: number, right: number, label: string) {
  return safeNumber(BigInt(left) + BigInt(right), label)
}

function safeMultiply(left: number, right: number, label: string) {
  assertWhole(left, `${label} left`)
  assertWhole(right, `${label} right`, MAX_COUNT)
  return safeNumber(BigInt(left) * BigInt(right), label)
}

function basisPoints(numerator: number, denominator: number) {
  if (!denominator) throw new Error('Basis-point denominator must be positive.')
  const scaled = BigInt(numerator) * 10_000n
  const divisor = BigInt(denominator)
  const quotient = scaled >= 0n ? scaled / divisor : -((-scaled + divisor - 1n) / divisor)
  if (quotient < -100_000_000n || quotient > 100_000_000n) throw new Error('Margin basis points exceed the supported range.')
  return Number(quotient)
}

function ceilBasisPointAmount(value: number, rateBasisPoints: number) {
  const numerator = BigInt(value) * BigInt(rateBasisPoints)
  return safeNumber((numerator + 9_999n) / 10_000n, 'Margin-floor amount')
}

function syntheticMarker(value: string | undefined) {
  const marker = String(value ?? '').toUpperCase()
  return marker.startsWith('ACT-DEMO-') || marker.startsWith('SETUP-') || marker.startsWith('SEED-')
}

function sampleOrder(order: CommerceOrder, sampleOrderIds: ReadonlySet<string>) {
  return order.id.startsWith('SETUP-SAMPLE-')
    || sampleOrderIds.has(order.id)
    || syntheticMarker(order.sourceRecordId)
    || syntheticMarker(order.evidenceReference)
    || syntheticMarker(order.completion?.actionId)
    || syntheticMarker(order.completion?.evidenceReference)
    || syntheticMarker(order.paymentReconciliationActionId)
    || syntheticMarker(order.paymentEvidenceReference)
}

function recordedOrderValue(order: CommerceOrder) {
  const value = order.calculation?.subtotalMmk ?? order.total
  assertWhole(value, `Order ${order.id} value`)
  return value
}

function allocateWholeAmount(total: number, weights: number[], label: string) {
  assertWhole(total, label)
  for (const [index, weight] of weights.entries()) assertWhole(weight, `${label} weight ${index}`)
  const weightTotal = weights.reduce((sum, weight) => safeAdd(sum, weight, `${label} weight total`), 0)
  if (!weightTotal) {
    if (total) throw new Error(`${label} cannot be allocated without weight.`)
    return weights.map(() => 0)
  }
  if (total > weightTotal) throw new Error(`${label} exceeds its allocation base.`)
  const denominator = BigInt(weightTotal)
  const rows = weights.map((weight, index) => {
    const numerator = BigInt(total) * BigInt(weight)
    return { index, value: Number(numerator / denominator), remainder: numerator % denominator }
  })
  const remainder = total - rows.reduce((sum, row) => sum + row.value, 0)
  const order = [...rows].sort((left, right) => left.remainder === right.remainder
    ? left.index - right.index
    : left.remainder > right.remainder ? -1 : 1)
  for (let index = 0; index < remainder; index += 1) rows[order[index].index].value += 1
  return rows.sort((left, right) => left.index - right.index).map((row) => row.value)
}

function indexShopMovements(movements: CommerceStockMovement[]) {
  const receiptsByPurchaseOrderId = new Map<string, CommerceStockMovement[]>()
  const sampleOrderIds = new Set<string>()
  let movementTraversalCount = 0
  for (const movement of movements) {
    movementTraversalCount += 1
    if (movement.orderId && (syntheticMarker(movement.actionId) || syntheticMarker(movement.evidenceReference))) sampleOrderIds.add(movement.orderId)
    if (movement.kind !== 'receipt' || !movement.purchaseOrderId) continue
    const receipts = receiptsByPurchaseOrderId.get(movement.purchaseOrderId)
    if (receipts) receipts.push(movement)
    else receiptsByPurchaseOrderId.set(movement.purchaseOrderId, [movement])
  }
  if (movementTraversalCount !== movements.length) throw new Error('Shop movement indexing exceeded its linear traversal contract.')
  return { movementTraversalCount, receiptsByPurchaseOrderId, sampleOrderIds }
}

function costEvidence(state: CommerceState, receiptsByPurchaseOrderId: ReadonlyMap<string, CommerceStockMovement[]>) {
  const lots = new Map<string, CostLot[]>()
  const status = new Map<string, CostSourceStatus>()
  const purchaseOrderIds = new Set<string>()
  let purchaseOrderTraversalCount = 0
  for (const purchaseOrder of state.purchaseOrders ?? []) {
    purchaseOrderTraversalCount += 1
    if (purchaseOrderIds.has(purchaseOrder.id)) throw new Error('Purchase-order IDs must be unique for cost coverage.')
    purchaseOrderIds.add(purchaseOrder.id)
    if (purchaseOrder.cancellation || syntheticMarker(purchaseOrder.creation.actionId) || syntheticMarker(purchaseOrder.creation.evidenceReference)) continue
    const source = status.get(purchaseOrder.sku) ?? { source: false, priced: false, linked: false, reviewed: false }
    source.source = true
    status.set(purchaseOrder.sku, source)
    if (purchaseOrder.unitCostMmk === undefined || !purchaseOrder.supplierInvoice) continue
    source.priced = true
    assertWhole(purchaseOrder.unitCostMmk, `${purchaseOrder.id} unit cost`)
    const receipts = receiptsByPurchaseOrderId.get(purchaseOrder.id) ?? []
    if (!receipts.length || receipts.some((movement) => movement.sku !== purchaseOrder.sku
      || syntheticMarker(movement.actionId)
      || syntheticMarker(movement.evidenceReference))) continue
    source.linked = true
    let match
    try { match = commerceSupplierInvoiceMatch({ ...state, movements: receipts }, purchaseOrder) } catch { continue }
    const review = purchaseOrder.supplierInvoice.payableReview
    if (!review
      || syntheticMarker(purchaseOrder.supplierInvoice.recording.actionId)
      || syntheticMarker(purchaseOrder.supplierInvoice.recording.evidenceReference)
      || syntheticMarker(review.actionId)
      || syntheticMarker(review.evidenceReference)) continue
    source.reviewed = true
    if (!match.payableReady || match.acceptedQuantity < 1) continue
    assertWhole(match.acceptedQuantity, `${purchaseOrder.id} accepted quantity`, MAX_COUNT)
    const reviewedAtMs = safeTimestamp(review.capturedAt, `${purchaseOrder.id} cost review`)
    for (const receipt of receipts) {
      assertWhole(receipt.quantityDelta, `${receipt.id} accepted receipt quantity`, MAX_COUNT)
      if (!receipt.quantityDelta) continue
      const lot: CostLot = {
        active: false,
        expired: false,
        movementId: receipt.id,
        purchaseOrderId: purchaseOrder.id,
        receivedAtMs: safeTimestamp(receipt.createdAt, `${receipt.id} receipt`),
        reviewedAtMs,
        remainingQuantity: receipt.quantityDelta,
        sku: purchaseOrder.sku,
        unitCostMmk: purchaseOrder.unitCostMmk,
      }
      const skuLots = lots.get(purchaseOrder.sku)
      if (skuLots) skuLots.push(lot)
      else lots.set(purchaseOrder.sku, [lot])
    }
  }
  if (purchaseOrderTraversalCount !== (state.purchaseOrders?.length ?? 0)) throw new Error('Shop purchase-order indexing exceeded its linear traversal contract.')
  for (const entries of lots.values()) entries.sort((left, right) => left.receivedAtMs - right.receivedAtMs
    || left.reviewedAtMs - right.reviewedAtMs
    || left.purchaseOrderId.localeCompare(right.purchaseOrderId)
    || left.movementId.localeCompare(right.movementId))
  return { lots, purchaseOrderTraversalCount, status }
}

function createCostAllocators(lotsBySku: ReadonlyMap<string, CostLot[]>) {
  const allocators = new Map<string, CostAllocator>()
  let costLotIndexTraversalCount = 0
  let costLotCount = 0
  for (const [sku, byReceipt] of lotsBySku) {
    let maxReviewedAtMs = Number.NEGATIVE_INFINITY
    let minReceivedAtMs = Number.POSITIVE_INFINITY
    for (const lot of byReceipt) {
      costLotIndexTraversalCount += 1
      costLotCount += 1
      maxReviewedAtMs = Math.max(maxReviewedAtMs, lot.reviewedAtMs)
      minReceivedAtMs = Math.min(minReceivedAtMs, lot.receivedAtMs)
    }
    allocators.set(sku, {
      activeLotCountByUnitCost: new Map(),
      activationIndex: 0,
      allocationIndex: 0,
      byReceipt,
      byReview: [...byReceipt].sort((left, right) => left.reviewedAtMs - right.reviewedAtMs
        || left.receivedAtMs - right.receivedAtMs
        || left.purchaseOrderId.localeCompare(right.purchaseOrderId)
        || left.movementId.localeCompare(right.movementId)),
      expiryIndex: 0,
      maxReviewedAtMs,
      minReceivedAtMs,
    })
  }
  return { allocators, costLotCount, costLotIndexTraversalCount }
}

function changeActiveLotCount(allocator: CostAllocator, unitCostMmk: number, delta: 1 | -1) {
  const next = (allocator.activeLotCountByUnitCost.get(unitCostMmk) ?? 0) + delta
  if (next < 0) throw new Error('Shop cost allocator active-lot count became negative.')
  if (next) allocator.activeLotCountByUnitCost.set(unitCostMmk, next)
  else allocator.activeLotCountByUnitCost.delete(unitCostMmk)
}

function prepareCostAllocator(allocator: CostAllocator, completedAtMs: number, traversal: { count: number }) {
  const staleBeforeMs = completedAtMs - SHOP_COST_EVIDENCE_MAX_AGE_DAYS * DAY_MS
  while (allocator.expiryIndex < allocator.byReview.length && allocator.byReview[allocator.expiryIndex].reviewedAtMs < staleBeforeMs) {
    traversal.count += 1
    const lot = allocator.byReview[allocator.expiryIndex]
    allocator.expiryIndex += 1
    lot.expired = true
    if (!lot.active || !lot.remainingQuantity) continue
    lot.active = false
    changeActiveLotCount(allocator, lot.unitCostMmk, -1)
  }
  while (allocator.activationIndex < allocator.byReceipt.length && allocator.byReceipt[allocator.activationIndex].receivedAtMs <= completedAtMs) {
    traversal.count += 1
    const lot = allocator.byReceipt[allocator.activationIndex]
    allocator.activationIndex += 1
    if (lot.expired || !lot.remainingQuantity) continue
    lot.active = true
    changeActiveLotCount(allocator, lot.unitCostMmk, 1)
  }
}

function allocateCost(
  allocator: CostAllocator,
  line: CountedLine,
  traversal: { count: number },
) {
  let remaining = line.quantity
  let lineCostMmk = 0
  while (remaining && allocator.allocationIndex < allocator.byReceipt.length) {
    traversal.count += 1
    const lot = allocator.byReceipt[allocator.allocationIndex]
    if (lot.receivedAtMs > line.completedAtMs) break
    if (lot.expired || !lot.active || !lot.remainingQuantity) {
      allocator.allocationIndex += 1
      continue
    }
    const allocated = Math.min(remaining, lot.remainingQuantity)
    lineCostMmk = safeAdd(lineCostMmk, safeMultiply(lot.unitCostMmk, allocated, `${line.orderId} allocated cost`), `${line.orderId} line cost`)
    lot.remainingQuantity -= allocated
    remaining -= allocated
    if (!lot.remainingQuantity) {
      lot.active = false
      changeActiveLotCount(allocator, lot.unitCostMmk, -1)
      allocator.allocationIndex += 1
    }
  }
  return { lineCostMmk, remaining }
}

function completedLines(order: CommerceOrder, sequenceStart: number) {
  const returnBySku = new Map<string, number>()
  for (const record of order.returns ?? []) {
    assertWhole(record.quantity, `${order.id} return quantity`, MAX_COUNT)
    returnBySku.set(record.sku, safeAdd(returnBySku.get(record.sku) ?? 0, record.quantity, `${order.id} returned quantity`))
  }
  const sourceLines = order.lines ?? []
  if (!sourceLines.length) return { lines: [] as CountedLine[], unlinkedValueMmk: recordedOrderValue(order), invalidReturnLink: Boolean(order.returns?.length), discountBlocked: false }
  const completedAtMs = safeTimestamp(order.completion?.capturedAt, `${order.id} completion`)
  const prepared = sourceLines.map((line, index) => {
    assertWhole(line.quantity, `${order.id} line ${index + 1} quantity`, MAX_COUNT)
    assertWhole(line.unitPriceMmk, `${order.id} line ${index + 1} unit price`)
    const returned = Math.min(line.quantity, returnBySku.get(line.sku) ?? 0)
    returnBySku.set(line.sku, (returnBySku.get(line.sku) ?? 0) - returned)
    const quantity = line.quantity - returned
    return { line, quantity, listedValueMmk: safeMultiply(line.unitPriceMmk, quantity, `${order.id} line ${index + 1} sold value`), index }
  })
  const invalidReturnLink = [...returnBySku.values()].some((quantity) => quantity !== 0)
  const netLines = prepared.filter((entry) => entry.quantity > 0)
  const discountMmk = order.promotionDecision?.status === 'approved' ? order.promotionDecision.discountMmk : 0
  assertWhole(discountMmk, `${order.id} discount`)
  const hasReturns = (order.returns?.length ?? 0) > 0
  const discounts = hasReturns && discountMmk
    ? netLines.map(() => 0)
    : allocateWholeAmount(discountMmk, netLines.map((entry) => entry.listedValueMmk), `${order.id} discount`)
  const lines = netLines.map((entry, index): CountedLine => ({
    completedAtMs,
    itemName: entry.line.name,
    orderId: order.id,
    quantity: entry.quantity,
    saleValueMmk: entry.listedValueMmk - discounts[index],
    sequence: sequenceStart + entry.index,
    sku: entry.line.sku,
  }))
  const listedTotalMmk = prepared.reduce((sum, entry) => safeAdd(sum, safeMultiply(entry.line.unitPriceMmk, entry.line.quantity, `${order.id} original line value`), `${order.id} listed total`), 0)
  const expectedSubtotalMmk = listedTotalMmk - discountMmk
  const recordedSubtotalMmk = order.calculation?.subtotalMmk ?? expectedSubtotalMmk
  assertWhole(recordedSubtotalMmk, `${order.id} recorded subtotal`)
  const discountBlocked = Boolean(hasReturns && discountMmk) || recordedSubtotalMmk !== expectedSubtotalMmk
  return { lines, unlinkedValueMmk: 0, invalidReturnLink, discountBlocked }
}

export function formatShopCostCoverage(basisPointValue: number) {
  if (!Number.isInteger(basisPointValue) || basisPointValue < 0 || basisPointValue > 10_000) throw new Error('Cost coverage basis points must be between zero and 10,000.')
  const percentage = basisPointValue / 100
  return `${percentage.toLocaleString('en-US', { minimumFractionDigits: percentage % 1 ? 1 : 0, maximumFractionDigits: 1 })}%`
}

export function formatShopMarginRate(basisPointValue: number) {
  if (!Number.isInteger(basisPointValue)) throw new Error('Margin basis points must be a whole number.')
  const percentage = basisPointValue / 100
  return `${percentage.toLocaleString('en-US', { minimumFractionDigits: percentage % 1 ? 1 : 0, maximumFractionDigits: 1 })}%`
}

export function projectShopCostCoverageAndMarginAtRisk(
  state: CommerceState,
  options: { marginFloorBasisPoints?: number } = {},
): ShopCostCoverageAndMarginAtRisk {
  const marginFloorBasisPoints = options.marginFloorBasisPoints ?? SHOP_MARGIN_FLOOR_BASIS_POINTS
  if (!Number.isInteger(marginFloorBasisPoints) || marginFloorBasisPoints < 0 || marginFloorBasisPoints > 10_000) throw new Error('Margin floor must be between zero and 10,000 basis points.')
  if (!state || !Array.isArray(state.orders) || !Array.isArray(state.movements) || !Array.isArray(state.purchaseOrders ?? [])) throw new Error('Shop cost coverage requires retained Shop orders, movements, and purchase orders.')
  if (state.orders.length > MAX_COUNT || state.movements.length > MAX_COUNT || (state.purchaseOrders?.length ?? 0) > MAX_COUNT) throw new Error('Shop cost coverage input exceeds the supported record count.')

  const movementIndex = indexShopMovements(state.movements)
  const evidence = costEvidence(state, movementIndex.receiptsByPurchaseOrderId)
  const sampleOrders: CommerceOrder[] = []
  const completed: CommerceOrder[] = []
  const openOrders: CommerceOrder[] = []
  const cancelledOrders: CommerceOrder[] = []
  for (const order of state.orders) {
    if (sampleOrder(order, movementIndex.sampleOrderIds)) sampleOrders.push(order)
    else if (order.status === 'completed' && order.paymentStatus === 'reconciled' && order.completion) completed.push(order)
    else if (order.status === 'cancelled') cancelledOrders.push(order)
    else if (order.status !== 'completed') openOrders.push(order)
  }
  const countedLines: CountedLine[] = []
  let unlinkedValueMmk = 0
  let adjustmentBlockedSales = 0
  let returnRecords = 0
  let correctionRecords = 0
  for (const [orderIndex, order] of [...completed].sort((left, right) => {
    const leftAt = safeTimestamp(left.completion?.capturedAt, `${left.id} completion`)
    const rightAt = safeTimestamp(right.completion?.capturedAt, `${right.id} completion`)
    return leftAt - rightAt || left.id.localeCompare(right.id)
  }).entries()) {
    const projected = completedLines(order, orderIndex * 1_000)
    countedLines.push(...projected.lines)
    unlinkedValueMmk = safeAdd(unlinkedValueMmk, projected.unlinkedValueMmk, 'Unlinked sold value')
    returnRecords = safeAdd(returnRecords, order.returns?.length ?? 0, 'Return record count')
    correctionRecords = safeAdd(correctionRecords, order.corrections?.length ?? 0, 'Correction record count')
    if (projected.invalidReturnLink || projected.discountBlocked || (order.returns?.length ?? 0) > 0 || (order.corrections?.length ?? 0) > 0 || order.refundStatus !== 'none') adjustmentBlockedSales += 1
  }
  if (countedLines.length > MAX_COUNT) throw new Error('Shop cost coverage input exceeds the supported completed-line count.')
  countedLines.sort((left, right) => left.completedAtMs - right.completedAtMs || left.orderId.localeCompare(right.orderId) || left.sequence - right.sequence)

  let soldValueMmk = unlinkedValueMmk
  let coveredSoldValueMmk = 0
  let fullyCostedLineCount = 0
  let totalCostMmk = 0
  const gaps = { missingLineCount: unlinkedValueMmk ? 1 : 0, staleLineCount: 0, unlinkedLineCount: unlinkedValueMmk ? 1 : 0, unreviewedLineCount: 0, partialLineCount: 0, costMethodLineCount: 0 }
  const marginGroups = new Map<string, MarginGroup>()
  const allocatorIndex = createCostAllocators(evidence.lots)
  const costLotTraversal = { count: allocatorIndex.costLotIndexTraversalCount }
  const costLotTraversalBound = allocatorIndex.costLotCount * 4 + countedLines.length
  for (const line of countedLines) {
    soldValueMmk = safeAdd(soldValueMmk, line.saleValueMmk, 'Counted sold value')
    const allocator = allocatorIndex.allocators.get(line.sku)
    if (allocator) prepareCostAllocator(allocator, line.completedAtMs, costLotTraversal)
    if (allocator && allocator.activeLotCountByUnitCost.size > 1) {
      gaps.costMethodLineCount += 1
      continue
    }
    const { lineCostMmk, remaining } = allocator
      ? allocateCost(allocator, line, costLotTraversal)
      : { lineCostMmk: 0, remaining: line.quantity }
    const coveredQuantity = line.quantity - remaining
    const coveredValueMmk = coveredQuantity === line.quantity
      ? line.saleValueMmk
      : safeNumber(BigInt(line.saleValueMmk) * BigInt(coveredQuantity) / BigInt(line.quantity), `${line.orderId} covered sold value`)
    coveredSoldValueMmk = safeAdd(coveredSoldValueMmk, coveredValueMmk, 'Covered sold value')
    totalCostMmk = safeAdd(totalCostMmk, lineCostMmk, 'Covered cost')
    if (!remaining) {
      fullyCostedLineCount += 1
      const group = marginGroups.get(line.sku) ?? { itemName: line.itemName, saleValueMmk: 0, costMmk: 0 }
      group.saleValueMmk = safeAdd(group.saleValueMmk, line.saleValueMmk, `${line.sku} sold value`)
      group.costMmk = safeAdd(group.costMmk, lineCostMmk, `${line.sku} cost`)
      marginGroups.set(line.sku, group)
      continue
    }
    if (coveredQuantity) {
      gaps.partialLineCount += 1
      continue
    }
    if (allocator && allocator.maxReviewedAtMs < line.completedAtMs - SHOP_COST_EVIDENCE_MAX_AGE_DAYS * DAY_MS) {
      gaps.staleLineCount += 1
      continue
    }
    if (allocator && allocator.minReceivedAtMs > line.completedAtMs) {
      gaps.unlinkedLineCount += 1
      continue
    }
    const source = evidence.status.get(line.sku)
    if (!source?.source || !source.priced) gaps.missingLineCount += 1
    else if (!source.linked) gaps.unlinkedLineCount += 1
    else if (!source.reviewed) gaps.unreviewedLineCount += 1
    else gaps.partialLineCount += 1
  }
  if (costLotTraversal.count > costLotTraversalBound) throw new Error('Shop cost allocation exceeded its bounded traversal contract.')

  const countedLineCount = countedLines.length + (unlinkedValueMmk ? 1 : 0)
  const costCoverageComplete = countedLineCount > 0
    && fullyCostedLineCount === countedLines.length
    && !unlinkedValueMmk
    && Object.values(gaps).every((count) => count === 0)
    && coveredSoldValueMmk === soldValueMmk
  const profitAvailable = soldValueMmk > 0 && costCoverageComplete && adjustmentBlockedSales === 0
  const grossProfitMmk = profitAvailable ? safeNumber(BigInt(soldValueMmk) - BigInt(totalCostMmk), 'Gross profit') : null
  const marginBasisPoints = grossProfitMmk === null ? null : basisPoints(grossProfitMmk, soldValueMmk)
  const priorities: ShopMarginAtRiskPriority[] = profitAvailable
    ? [...marginGroups.entries()].flatMap(([sku, group]) => {
      const marginMmk = safeNumber(BigInt(group.saleValueMmk) - BigInt(group.costMmk), `${sku} margin`)
      const rate = group.saleValueMmk === 0 ? null : basisPoints(marginMmk, group.saleValueMmk)
      if (rate === null ? marginMmk >= 0 : rate >= marginFloorBasisPoints) return []
      const targetMarginMmk = ceilBasisPointAmount(group.saleValueMmk, marginFloorBasisPoints)
      const exposureMmk = safeNumber(BigInt(targetMarginMmk) - BigInt(marginMmk), `${sku} margin exposure`)
      return [{
        id: `margin-risk:${sku}`,
        sku,
        itemName: group.itemName,
        severity: marginMmk < 0 ? 'critical' as const : 'attention' as const,
        marginBasisPoints: rate,
        marginMmk,
        exposureMmk,
        ownerRole: 'Shop owner' as const,
        dueLabel: 'Before the next daily close' as const,
        actionLabel: 'Review price and cost evidence' as const,
        target: '/shop/?tab=inventory#purchase-orders' as const,
        closureCondition: `Reviewed retained cost and sell value produce a margin at or above ${formatShopMarginRate(marginFloorBasisPoints)} for ${sku}.`,
      }]
    }).sort((left, right) => {
      const severity = (left.severity === 'critical' ? 0 : 1) - (right.severity === 'critical' ? 0 : 1)
      const rateAvailability = left.marginBasisPoints === null
        ? right.marginBasisPoints === null ? 0 : -1
        : right.marginBasisPoints === null ? 1 : left.marginBasisPoints - right.marginBasisPoints
      return severity || rateAvailability || right.exposureMmk - left.exposureMmk || left.sku.localeCompare(right.sku)
    })
    : []
  const marginAtRiskMmk = profitAvailable
    ? priorities.reduce((sum, priority) => safeAdd(sum, priority.exposureMmk, 'Margin at risk'), 0)
    : null
  const sampleCompletedSales = sampleOrders.filter((order) => order.status === 'completed').length
  const sampleSoldValueMmk = sampleOrders.filter((order) => order.status === 'completed').reduce((sum, order) => safeAdd(sum, recordedOrderValue(order), 'Sample sold value'), 0)
  const profitReason = !soldValueMmk
    ? 'Gross profit is withheld until a retained non-sample completed sale exists.'
    : !costCoverageComplete
      ? 'Gross profit is withheld until every counted completed-sale line has acceptable reviewed cost evidence.'
      : adjustmentBlockedSales
        ? 'Gross profit is withheld until returns, corrections, and refund exposure are linked to exact retained line values.'
        : 'Every counted completed-sale line has acceptable reviewed retained cost evidence.'
  const stateValue: ShopCostCoverageAndMarginAtRisk['state'] = !soldValueMmk
    ? 'no_retained_sales'
    : !costCoverageComplete
      ? 'collecting_cost_evidence'
      : adjustmentBlockedSales
        ? 'review_adjustments'
        : priorities.length
          ? 'margin_at_risk'
          : 'controlled'

  return {
    contract: 'supermega.shop.cost_coverage_and_margin_at_risk.v1',
    state: stateValue,
    costCoverage: {
      state: !soldValueMmk ? 'no_retained_sales' : costCoverageComplete ? 'complete' : 'incomplete',
      method: 'single_reviewed_unit_cost_per_sku_fifo_by_receipt',
      soldValueMmk,
      coveredSoldValueMmk,
      coverageBasisPoints: soldValueMmk ? basisPoints(coveredSoldValueMmk, soldValueMmk) : 0,
      retainedNonSampleCompletedSaleCount: completed.length,
      countedLineCount,
      fullyCostedLineCount,
      gaps,
    },
    profit: { status: profitAvailable ? 'available' : 'withheld', grossProfitMmk, marginBasisPoints, reason: profitReason },
    activity: {
      retainedNonSampleCompletedSales: completed.length,
      openOrders: openOrders.length,
      cancelledOrders: cancelledOrders.length,
      sampleOrders: sampleOrders.length,
      sampleCompletedSales,
      sampleSoldValueMmk,
      returnRecords,
      correctionRecords,
      adjustmentBlockedSales,
    },
    scaling: {
      movementTraversalCount: movementIndex.movementTraversalCount,
      movementTraversalBound: state.movements.length,
      purchaseOrderTraversalCount: evidence.purchaseOrderTraversalCount,
      purchaseOrderTraversalBound: state.purchaseOrders?.length ?? 0,
      costLotTraversalCount: costLotTraversal.count,
      costLotTraversalBound,
    },
    marginAtRiskMmk,
    priorities,
    boundary: 'Deterministic read-only projection from retained local Shop evidence. Non-sample classification is not pilot, customer, or commercial proof. No payment, stock, supplier, accounting, customer, hosted, or model action runs here.',
    authority: { paymentWrite: false, stockWrite: false, supplierWrite: false, accountingWrite: false, customerWrite: false, hostedWrite: false, modelUsed: false },
  }
}
