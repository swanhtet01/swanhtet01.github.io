import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { formatShopCostCoverage, formatShopMarginRate, projectShopCostCoverageAndMarginAtRisk, SHOP_COST_EVIDENCE_MAX_AGE_DAYS } from './shop-cost-coverage-and-margin-at-risk.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shop-cost-coverage-and-margin-at-risk-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  formatShopCostCoverage,
  formatShopMarginRate,
  projectShopCostCoverageAndMarginAtRisk,
  SHOP_COST_EVIDENCE_MAX_AGE_DAYS,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

const HOUR = 60 * 60 * 1_000
const DAY = 24 * HOUR
const BASE = Date.parse('2026-08-29T12:00:00.000Z')
const at = (offsetMs = 0) => new Date(BASE + offsetMs).toISOString()

function proof(actionId, capturedAt = at(), evidenceReference = `EV-${actionId}`) {
  return { actionId, capturedAt, actor: 'Reviewed operator', reason: 'Retain reviewed local evidence.', evidenceReference }
}

function state(overrides = {}) {
  return {
    schema: 'supermega.commerce.workspace.v2',
    items: [],
    orders: [],
    movements: [],
    closes: [],
    purchaseOrders: [],
    ...overrides,
  }
}

function sale({ id = 'ORDER-1', lines = [{ sku: 'SKU-A', name: 'Item A', quantity: 1, unitPriceMmk: 1_000 }], completedAt = at(), sample = false, returns = [], corrections = [], refundStatus = 'none', discountMmk = 0 } = {}) {
  const listedSubtotalMmk = lines.reduce((sum, line) => sum + line.quantity * line.unitPriceMmk, 0)
  const subtotalMmk = listedSubtotalMmk - discountMmk
  return {
    id,
    createdAt: at(-HOUR),
    customer: 'Synthetic buyer',
    owner: 'Reviewed operator',
    channel: 'Counter',
    item: lines.map((line) => line.name).join(', '),
    quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
    payment: 'Cash',
    paymentStatus: 'reconciled',
    refundStatus,
    paymentReconciledAt: at(-30 * 60 * 1_000),
    paymentReconciliationActionId: sample ? `ACT-DEMO-PAY-${id}` : `ACT-PAY-${id}`,
    paymentReconciledBy: 'Reviewed operator',
    paymentReconciliationReason: 'Reviewed settlement.',
    paymentEvidenceReference: sample ? `SEED-PAY-${id}` : `PAY-${id}`,
    lines,
    ...(discountMmk ? { promotionDecision: { status: 'approved', discountMmk } } : {}),
    calculation: { schema: 'supermega.commerce.order-calculation.v1', currency: 'MMK', catalogRevision: 1, subtotalMmk, taxMode: 'not_configured', taxMmk: 0, totalMmk: subtotalMmk },
    total: subtotalMmk,
    status: 'completed',
    completion: proof(sample ? `ACT-DEMO-COMPLETE-${id}` : `ACT-COMPLETE-${id}`, completedAt, sample ? `SEED-COMPLETE-${id}` : `COMPLETE-${id}`),
    ...(returns.length ? { returns } : {}),
    ...(corrections.length ? { corrections } : {}),
  }
}

function nonCompleted(status, id) {
  return {
    id,
    createdAt: at(-HOUR),
    customer: 'Synthetic buyer',
    channel: 'Counter',
    item: 'Item A',
    quantity: 1,
    payment: 'Cash',
    paymentStatus: 'pending',
    refundStatus: 'none',
    total: 1_000,
    status,
  }
}

function costEvidence({ sku = 'SKU-A', unitCostMmk = 600, quantity = 1, reviewedAt = at(-HOUR), receivedAt = at(-75 * 60 * 1_000), linked = true, reviewed = true, id = sku } = {}) {
  const purchaseOrderId = `PO-${id}`
  const purchaseOrder = {
    id: purchaseOrderId,
    createdAt: at(-2 * HOUR),
    supplier: 'Synthetic supplier',
    sku,
    quantityOrdered: quantity,
    unitCostMmk,
    creation: proof(`ACT-PO-${id}`, at(-2 * HOUR)),
    supplierInvoice: {
      id: `INV-${id}`,
      supplierReference: `SUP-${id}`,
      issuedAt: at(-2 * HOUR),
      dueAt: at(DAY),
      quantityInvoiced: quantity,
      unitCostMmk,
      totalMmk: quantity * unitCostMmk,
      recording: proof(`ACT-INV-${id}`, at(-90 * 60 * 1_000)),
      ...(reviewed ? { payableReview: proof(`ACT-PAYABLE-${id}`, reviewedAt) } : {}),
    },
  }
  const movement = {
    id: `MOV-${id}`,
    actionId: `ACT-RECEIPT-${id}`,
    createdAt: receivedAt,
    actor: 'Reviewed operator',
    reason: 'Receive reviewed stock.',
    evidenceReference: `RECEIPT-${id}`,
    kind: 'receipt',
    sku,
    quantityDelta: quantity,
    purchaseOrderId,
  }
  return { purchaseOrder, movements: linked ? [movement] : [] }
}

function withEvidence(orders, evidenceRows) {
  return state({
    orders,
    purchaseOrders: evidenceRows.map((row) => row.purchaseOrder),
    movements: evidenceRows.flatMap((row) => row.movements),
  })
}

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

{
  const sample = sale({ id: 'SAMPLE-1', sample: true })
  const seededOpen = nonCompleted('ready', 'SEED-OPEN-1')
  const projection = projectShopCostCoverageAndMarginAtRisk(state({
    orders: [sample, seededOpen, nonCompleted('ready', 'OPEN-1'), nonCompleted('cancelled', 'CANCEL-1')],
    movements: [{ id: 'MOV-SEED-OPEN-1', actionId: 'ACT-DEMO-OPEN-1', createdAt: at(), actor: 'Sample operator', reason: 'Seed walkthrough.', evidenceReference: 'SEED-OPEN-1', kind: 'reserve', sku: 'SKU-A', quantityDelta: -1, orderId: seededOpen.id }],
  }))
  check(projection.state === 'no_retained_sales', 'sample activity cannot become retained non-sample sales')
  check(projection.activity.retainedNonSampleCompletedSales === 0, 'no retained non-sample completed sale is counted')
  check(projection.activity.sampleOrders === 2 && projection.activity.sampleCompletedSales === 1 && projection.activity.sampleSoldValueMmk === 1_000, 'completed and open sample activity are reported separately')
  check(projection.activity.openOrders === 1 && projection.activity.cancelledOrders === 1, 'open and cancelled retained non-sample orders are separate')
  check(projection.costCoverage.state === 'no_retained_sales' && projection.profit.status === 'withheld', 'profit remains withheld without retained non-sample sales')
}

{
  const projection = projectShopCostCoverageAndMarginAtRisk(withEvidence([sale({ id: 'UNMARKED-FIXTURE' })], [costEvidence()]))
  check(projection.activity.retainedNonSampleCompletedSales === 1, 'absence of a sample marker means retained non-sample, not positive owner observation')
  check(projection.costCoverage.retainedNonSampleCompletedSaleCount === 1, 'the cost-coverage count names its retained non-sample scope explicitly')
  check(projection.boundary.includes('not pilot, customer, or commercial proof'), 'retained non-sample evidence cannot self-assert pilot, customer, or commercial proof')
}

{
  const order = sale({ lines: [
    { sku: 'SKU-A', name: 'Item A', quantity: 2, unitPriceMmk: 1_000 },
    { sku: 'SKU-B', name: 'Item B', quantity: 1, unitPriceMmk: 500 },
  ] })
  const projection = projectShopCostCoverageAndMarginAtRisk(withEvidence([order], [
    costEvidence({ sku: 'SKU-A', unitCostMmk: 900, quantity: 2, id: 'A' }),
    costEvidence({ sku: 'SKU-B', unitCostMmk: 600, quantity: 1, id: 'B' }),
  ]))
  check(projection.costCoverage.state === 'complete' && projection.costCoverage.coverageBasisPoints === 10_000, 'complete reviewed costs produce 100% coverage')
  check(projection.costCoverage.soldValueMmk === 2_500 && projection.costCoverage.coveredSoldValueMmk === 2_500, 'sold-value coverage remains exact')
  check(projection.profit.status === 'available' && projection.profit.grossProfitMmk === 100 && projection.profit.marginBasisPoints === 400, 'aggregate gross profit appears only after complete coverage')
  check(projection.priorities.map((priority) => priority.sku).join(',') === 'SKU-B,SKU-A', 'negative margin ranks before below-floor margin')
  check(projection.priorities[0].severity === 'critical' && projection.priorities[1].severity === 'attention', 'risk severity distinguishes negative and below-floor margins')
  check(projection.marginAtRiskMmk === 275, 'margin-at-risk exposure uses an exact ceil-to-floor calculation')
  check(projection.priorities.every((priority) => priority.ownerRole && priority.dueLabel && priority.actionLabel && priority.closureCondition.includes(priority.sku)), 'each risk has owner, due point, next action, and objective closure')
}

{
  const projection = projectShopCostCoverageAndMarginAtRisk(state({ orders: [sale()] }))
  check(projection.costCoverage.gaps.missingLineCount === 1, 'missing cost evidence is explicit')
  check(projection.costCoverage.coverageBasisPoints === 0 && projection.profit.grossProfitMmk === null, 'missing cost withholds aggregate profit')
  check(projection.priorities.length === 0, 'margin ranking is unavailable while coverage is incomplete')
}

{
  const order = sale({ lines: [{ sku: 'SKU-A', name: 'Item A', quantity: 3, unitPriceMmk: 1_000 }] })
  const projection = projectShopCostCoverageAndMarginAtRisk(withEvidence([order], [costEvidence({ quantity: 2 })]))
  check(projection.costCoverage.coveredSoldValueMmk === 2_000 && projection.costCoverage.coverageBasisPoints === 6_666, 'partial quantity coverage floors sold-value coverage deterministically')
  check(projection.costCoverage.gaps.partialLineCount === 1 && projection.profit.status === 'withheld', 'partial coverage is explicit and withholds profit')
}

{
  const stale = costEvidence({ reviewedAt: at(-(SHOP_COST_EVIDENCE_MAX_AGE_DAYS + 1) * DAY) })
  const projection = projectShopCostCoverageAndMarginAtRisk(withEvidence([sale()], [stale]))
  check(projection.costCoverage.gaps.staleLineCount === 1 && projection.costCoverage.coveredSoldValueMmk === 0, 'stale reviewed cost cannot cover a sale')
}

{
  const projection = projectShopCostCoverageAndMarginAtRisk(withEvidence([sale()], [costEvidence({ linked: false })]))
  check(projection.costCoverage.gaps.unlinkedLineCount === 1, 'cost without a linked receipt is rejected')
}

{
  const projection = projectShopCostCoverageAndMarginAtRisk(withEvidence([sale()], [costEvidence({ receivedAt: at(HOUR) })]))
  check(projection.costCoverage.gaps.unlinkedLineCount === 1 && projection.costCoverage.coverageBasisPoints === 0, 'a receipt after sale completion cannot be linked back to that sale')
}

{
  const projection = projectShopCostCoverageAndMarginAtRisk(withEvidence([sale()], [costEvidence({ reviewed: false })]))
  check(projection.costCoverage.gaps.unreviewedLineCount === 1, 'linked cost without payable review is rejected')
}

{
  const sampleCost = costEvidence()
  sampleCost.movements[0].actionId = 'ACT-DEMO-RECEIPT'
  sampleCost.movements[0].evidenceReference = 'SEED-RECEIPT'
  const projection = projectShopCostCoverageAndMarginAtRisk(withEvidence([sale()], [sampleCost]))
  check(projection.costCoverage.gaps.unlinkedLineCount === 1 && projection.profit.status === 'withheld', 'sample receipt evidence cannot establish reviewed cost coverage')
}

{
  const order = sale({
    lines: [{ sku: 'SKU-A', name: 'Item A', quantity: 2, unitPriceMmk: 1_000 }],
    returns: [{ sku: 'SKU-A', quantity: 1 }],
    corrections: [{}],
    refundStatus: 'due',
  })
  const projection = projectShopCostCoverageAndMarginAtRisk(withEvidence([order, nonCompleted('cancelled', 'CANCELLED')], [costEvidence({ quantity: 1 })]))
  check(projection.costCoverage.state === 'complete' && projection.costCoverage.soldValueMmk === 1_000, 'returned units are removed from sold-value coverage')
  check(projection.activity.returnRecords === 1 && projection.activity.correctionRecords === 1 && projection.activity.adjustmentBlockedSales === 1, 'return, correction, and refund ambiguity is retained')
  check(projection.state === 'review_adjustments' && projection.profit.status === 'withheld' && projection.priorities.length === 0, 'adjustments withhold gross profit and margin ranking')
  check(projection.activity.cancelledOrders === 1, 'cancelled orders remain excluded from retained completed sales')
}

{
  const order = sale({ lines: [
    { sku: 'SKU-A', name: 'Item A', quantity: 1, unitPriceMmk: 2 },
    { sku: 'SKU-B', name: 'Item B', quantity: 1, unitPriceMmk: 3 },
  ], discountMmk: 1 })
  const current = withEvidence([order], [
    costEvidence({ sku: 'SKU-A', unitCostMmk: 1, id: 'ROUND-A' }),
    costEvidence({ sku: 'SKU-B', unitCostMmk: 1, id: 'ROUND-B' }),
  ])
  const before = JSON.stringify(current)
  const first = projectShopCostCoverageAndMarginAtRisk(current, { marginFloorBasisPoints: 0 })
  const second = projectShopCostCoverageAndMarginAtRisk(structuredClone(current), { marginFloorBasisPoints: 0 })
  check(first.costCoverage.soldValueMmk === 4 && first.profit.grossProfitMmk === 2, 'whole-MMK discount allocation preserves exact totals')
  check(JSON.stringify(first) === JSON.stringify(second), 'projection is deterministic across reload-equivalent clones')
  check(JSON.stringify(current) === before, 'projection does not mutate retained Shop state')
}

{
  const projection = projectShopCostCoverageAndMarginAtRisk(withEvidence([sale()], [
    costEvidence({ unitCostMmk: 500, id: 'METHOD-A' }),
    costEvidence({ unitCostMmk: 600, id: 'METHOD-B' }),
  ]))
  check(projection.costCoverage.gaps.costMethodLineCount === 1, 'conflicting reviewed costs fail closed without a cost method')
  check(projection.profit.status === 'withheld' && projection.priorities.length === 0, 'cost-method ambiguity cannot create a profit or risk claim')
}

{
  const size = 64
  const lines = Array.from({ length: size }, (_, index) => ({
    sku: `SCALE-${String(index).padStart(3, '0')}`,
    name: `Scale item ${index}`,
    quantity: 1,
    unitPriceMmk: 1_000,
  }))
  const evidenceRows = lines.map((line, index) => costEvidence({ sku: line.sku, unitCostMmk: 500, id: `SCALE-${index}` }))
  const current = withEvidence([sale({ id: 'SCALE-SALE', lines })], evidenceRows)
  let movementIndexReads = 0
  const movements = new Proxy(current.movements, {
    get(target, property, receiver) {
      if (typeof property === 'string' && /^(0|[1-9]\d*)$/.test(property)) movementIndexReads += 1
      return Reflect.get(target, property, receiver)
    },
  })
  const projection = projectShopCostCoverageAndMarginAtRisk({ ...current, movements })
  check(movementIndexReads === size, 'receipt movements are indexed from retained state in one linear pass')
  check(projection.scaling.movementTraversalCount === size && projection.scaling.movementTraversalBound === size, 'movement traversal diagnostics prove the exact linear bound')
  check(projection.scaling.purchaseOrderTraversalCount === size && projection.scaling.purchaseOrderTraversalBound === size, 'purchase-order traversal is one bounded pass')
  check(projection.scaling.costLotTraversalCount <= projection.scaling.costLotTraversalBound, 'cost-lot traversal remains within the declared linear allocation bound')
  check(projection.costCoverage.state === 'complete' && projection.costCoverage.fullyCostedLineCount === size, 'the scaling fixture retains complete deterministic allocation')
}

for (const badOrder of [
  sale({ lines: [{ sku: 'SKU-A', name: 'Item A', quantity: 1.5, unitPriceMmk: 1_000 }] }),
  sale({ lines: [{ sku: 'SKU-A', name: 'Item A', quantity: 100_000, unitPriceMmk: 1_000_000_000_000 }] }),
]) {
  let threw = false
  try { projectShopCostCoverageAndMarginAtRisk(state({ orders: [badOrder] })) } catch { threw = true }
  check(threw, 'invalid or overflowing sold value fails closed')
}

{
  const projection = projectShopCostCoverageAndMarginAtRisk(state())
  check(Object.values(projection.authority).every((allowed) => allowed === false), 'every external and model authority remains false')
  check(projection.boundary.includes('No payment, stock, supplier, accounting, customer, hosted, or model action'), 'read-only local boundary is explicit')
  check(projection.costCoverage.method === 'single_reviewed_unit_cost_per_sku_fifo_by_receipt', 'the conservative cost allocation method is explicit')
  check(formatShopCostCoverage(6_666) === '66.7%' && formatShopMarginRate(-2_000) === '-20%', 'coverage and margin formatting is deterministic')
}

{
  const source = await readFile('showroom/src/core/ShopToday.tsx', 'utf8')
  const coreSource = await readFile('showroom/src/core/CoreApp.tsx', 'utf8')
  const coverageIndex = source.indexOf('Sold-value cost coverage')
  const profitIndex = source.indexOf('Aggregate gross profit')
  check(coverageIndex >= 0 && profitIndex > coverageIndex, 'UI source places cost coverage before aggregate profit')
  check(source.includes('Retained non-sample completed sales') && source.includes('not pilot, customer, or commercial proof'), 'UI states the retained-local truth boundary without asserting owner observation')
  check(!source.includes('owner-observed'), 'UI does not infer owner observation from an absent sample marker')
  check(source.includes('useMemo(() => projectShopCostCoverageAndMarginAtRisk(commerce), [commerce])'), 'Today memoizes the projection by retained Commerce state')
  check(!coreSource.includes('projectShopCostCoverageAndMarginAtRisk'), 'non-Today Commerce renders do not derive the margin projection')
  check(source.includes('No payment, stock, supplier, accounting, customer, or hosted write runs from this panel.'), 'UI repeats the external-write boundary')
}

console.log(`test_shop_cost_coverage_and_margin_at_risk: ${checks} checks passed`)
