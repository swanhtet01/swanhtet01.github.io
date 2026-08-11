// Aggregate cross-product operating summary: combines Shop order coverage with Plant
// job fulfillment reconciliation into top-level metrics.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectCrossProductOperatingSummary } from './cross-product-report.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/cross-report-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectCrossProductOperatingSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

// --- Helpers ---

function makeCommerce(orders = [], movements = []) {
  return { schema: 'supermega.commerce.workspace.v2', items: [], orders, movements, closes: [] }
}

function makeProduction(jobs = []) {
  return { schema: 'supermega.production.workspace.v2', revision: 1, jobs, issues: [], machines: [], events: [] }
}

function makeOrder(id, extra = {}) {
  return { id, createdAt: '2026-08-11T08:00:00.000Z', customer: 'Acme', item: 'Widget A', itemSku: 'WIDGET-A', quantity: 40, payment: 'Cash', paymentStatus: 'unpaid', refundStatus: 'none', channel: 'counter', ...extra }
}

function makeJob(id, sourceOrderIds = [], extra = {}) {
  return {
    id, line: 'Assembly A', product: 'Widget A', target: 40, output: 0, scrap: 0,
    shopDemandSource: sourceOrderIds.length ? {
      contract: 'supermega.production.shop-demand-source.v1',
      sourceDigest: 'sha256:abc123',
      evidenceReference: `SHOP-DEMAND:sha256:abc123:LOC-MAIN`,
      snapshot: {
        schema: 'supermega.shop_production_demand.v1',
        operatingUnitLocationId: 'LOC-MAIN',
        sku: 'WIDGET-A', productName: 'Widget A',
        sourceOrderIds, activeDemandUnits: 40, uncoveredDemandUnits: 40,
        availableToPromiseUnits: 0, reorderAtUnits: 10,
        replenishmentGapUnits: 10, recommendedBatchUnits: 40,
      },
    } : undefined,
    ...extra,
  }
}

function makeReceipt(id, jobId, qty) {
  return { id, actionId: `ACT-${id}`, createdAt: '2026-08-13T16:00:00.000Z', actor: 'Lead', reason: 'Receipt', evidenceReference: `EV-${id}`, kind: 'production_receipt', sku: 'WIDGET-A', quantityDelta: qty, productionJobId: jobId }
}

const ASOf = '2026-08-11T09:00:00.000Z'

// 1. Empty state → all zeros
{
  const result = projectCrossProductOperatingSummary(makeCommerce(), makeProduction(), ASOf)
  check(result.asOf === ASOf, 'asOf is carried through')
  check(result.ordersWithCoverage === 0, 'ordersWithCoverage 0 for empty state')
  check(result.ordersWithoutCoverage === 0, 'ordersWithoutCoverage 0 for empty state')
  check(result.ordersOnHold === 0, 'ordersOnHold 0 for empty state')
  check(result.ordersAllCompleted === 0, 'ordersAllCompleted 0 for empty state')
  check(result.closedJobsTotal === 0, 'closedJobsTotal 0 for empty state')
  check(result.closedJobsReconciled === 0, 'closedJobsReconciled 0 for empty state')
  check(result.closedJobsWithGap === 0, 'closedJobsWithGap 0 for empty state')
  check(result.totalReceiptGap === 0, 'totalReceiptGap 0 for empty state')
}

// 2. Order with no linked job counts in ordersWithoutCoverage
{
  const result = projectCrossProductOperatingSummary(makeCommerce([makeOrder('C-001')]), makeProduction(), ASOf)
  check(result.ordersWithCoverage === 0, 'no linked jobs → ordersWithCoverage 0')
  check(result.ordersWithoutCoverage === 1, 'unlinked order counted in ordersWithoutCoverage')
}

// 3. Order with a linked active job counts in ordersWithCoverage
{
  const result = projectCrossProductOperatingSummary(
    makeCommerce([makeOrder('C-001')]),
    makeProduction([makeJob('JOB-001', ['C-001'], { output: 10 })]),
    ASOf,
  )
  check(result.ordersWithCoverage === 1, 'linked order counted in ordersWithCoverage')
  check(result.ordersWithoutCoverage === 0, 'no uncovered orders')
}

// 4. Mixed: some orders with coverage, some without
{
  const result = projectCrossProductOperatingSummary(
    makeCommerce([makeOrder('C-001'), makeOrder('C-002')]),
    makeProduction([makeJob('JOB-001', ['C-001'])]),
    ASOf,
  )
  check(result.ordersWithCoverage === 1, 'one covered order')
  check(result.ordersWithoutCoverage === 1, 'one uncovered order')
}

// 5. Job with qualityHold increments ordersOnHold
{
  const job = makeJob('JOB-001', ['C-001'], { qualityHold: { heldBy: 'QC', heldAt: '2026-08-11T08:00:00.000Z', evidenceReference: 'QH-001' } })
  const result = projectCrossProductOperatingSummary(makeCommerce([makeOrder('C-001')]), makeProduction([job]), ASOf)
  check(result.ordersOnHold === 1, 'order with on-hold job increments ordersOnHold')
}

// 6. Completed job increments ordersAllCompleted
{
  const closure = { closedAt: '2026-08-13T16:00:00.000Z', closedBy: 'Lead', shiftRef: 'S-1', remainingUnits: 0 }
  const job = makeJob('JOB-001', ['C-001'], { output: 40, target: 40, closure })
  const result = projectCrossProductOperatingSummary(makeCommerce([makeOrder('C-001')]), makeProduction([job]), ASOf)
  check(result.ordersAllCompleted === 1, 'order with all jobs completed increments ordersAllCompleted')
}

// 7. closed-short also counts as all-done for ordersAllCompleted
{
  const closure = { closedAt: '2026-08-13T16:00:00.000Z', closedBy: 'Lead', shiftRef: 'S-1', remainingUnits: 2 }
  const job = makeJob('JOB-001', ['C-001'], { output: 38, target: 40, closure })
  const result = projectCrossProductOperatingSummary(makeCommerce([makeOrder('C-001')]), makeProduction([job]), ASOf)
  check(result.ordersAllCompleted === 1, 'order with closed-short job counts as all-done')
}

// 8. Order with one active + one on-hold: counts as on-hold, not all-completed
{
  const hold = { heldBy: 'QC', heldAt: '2026-08-11T08:00:00.000Z', evidenceReference: 'QH-001' }
  const result = projectCrossProductOperatingSummary(
    makeCommerce([makeOrder('C-001')]),
    makeProduction([makeJob('JOB-001', ['C-001'], { output: 10 }), makeJob('JOB-002', ['C-001'], { qualityHold: hold, id: 'JOB-002' })]),
    ASOf,
  )
  check(result.ordersOnHold === 1, 'mixed active+hold counts order as on-hold')
  check(result.ordersAllCompleted === 0, 'mixed order not counted as all-completed')
}

// 9. Closed job with no receipts → closedJobsWithGap = 1, totalReceiptGap = output
{
  const closure = { closedAt: '2026-08-13T16:00:00.000Z', closedBy: 'Lead', shiftRef: 'S-1', remainingUnits: 0 }
  const job = makeJob('JOB-001', ['C-001'], { output: 40, closure })
  const result = projectCrossProductOperatingSummary(makeCommerce([makeOrder('C-001')], []), makeProduction([job]), ASOf)
  check(result.closedJobsTotal === 1, 'one closed job')
  check(result.closedJobsWithGap === 1, 'no receipt → closedJobsWithGap')
  check(result.totalReceiptGap === 40, 'totalReceiptGap equals output')
}

// 10. Closed job with full receipts → closedJobsReconciled = 1, gap = 0
{
  const closure = { closedAt: '2026-08-13T16:00:00.000Z', closedBy: 'Lead', shiftRef: 'S-1', remainingUnits: 0 }
  const job = makeJob('JOB-001', ['C-001'], { output: 40, closure })
  const receipt = makeReceipt('REC-001', 'JOB-001', 40)
  const result = projectCrossProductOperatingSummary(makeCommerce([makeOrder('C-001')], [receipt]), makeProduction([job]), ASOf)
  check(result.closedJobsReconciled === 1, 'full receipt → closedJobsReconciled')
  check(result.totalReceiptGap === 0, 'totalReceiptGap is zero when reconciled')
}

// 11. Total receipt gap sums across multiple jobs
{
  const closure = { closedAt: '2026-08-13T16:00:00.000Z', closedBy: 'Lead', shiftRef: 'S-1', remainingUnits: 0 }
  const j1 = makeJob('JOB-001', ['C-001'], { output: 40, closure })
  const j2 = makeJob('JOB-002', ['C-002'], { output: 30, closure: { ...closure, closedAt: '2026-08-14T08:00:00.000Z' } })
  const result = projectCrossProductOperatingSummary(
    makeCommerce([makeOrder('C-001'), makeOrder('C-002')], []),
    makeProduction([j1, j2]),
    ASOf,
  )
  check(result.closedJobsTotal === 2, 'two closed jobs')
  check(result.closedJobsWithGap === 2, 'both have gaps')
  check(result.totalReceiptGap === 70, 'gap sums to 40 + 30 = 70')
}

console.log(`cross-product aggregate report: ${checks} checks passed`)
