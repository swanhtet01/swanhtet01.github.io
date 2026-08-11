// Cross-product reporting contract: Shop orders linked to Plant jobs via shopDemandSource.
// Tests projectShopOrderProductionStatus and projectJobFulfillmentReconciliation.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export {
      projectShopOrderProductionStatus,
      projectJobFulfillmentReconciliation,
    } from './shop-production-status.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/cross-product-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopOrderProductionStatus, projectJobFulfillmentReconciliation } = await import(
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
  return { id, createdAt: '2026-08-11T08:00:00.000Z', customer: 'Acme Co', item: 'Widget A', itemSku: 'WIDGET-A', quantity: 40, payment: 'Cash', paymentStatus: 'unpaid', refundStatus: 'none', channel: 'counter', ...extra }
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
        sourceOrderIds,
        activeDemandUnits: 40, uncoveredDemandUnits: 40,
        availableToPromiseUnits: 0, reorderAtUnits: 10,
        replenishmentGapUnits: 10, recommendedBatchUnits: 40,
      },
    } : undefined,
    ...extra,
  }
}

function makeMovement(kind, extra = {}) {
  return { id: `MOV-${kind}`, actionId: `ACT-${kind}`, createdAt: '2026-08-11T10:00:00.000Z', actor: 'Plant Supervisor', reason: 'Production receipt', evidenceReference: `EV-${kind}`, kind, sku: 'WIDGET-A', quantityDelta: 0, ...extra }
}

// --- projectShopOrderProductionStatus tests ---

// 1. Returns empty array when no Plant jobs exist
check(projectShopOrderProductionStatus(makeCommerce([makeOrder('C-001')]), makeProduction([])).length === 0, 'no jobs → empty result')

// 2. Returns empty array when jobs have no shopDemandSource
check(projectShopOrderProductionStatus(makeCommerce([makeOrder('C-001')]), makeProduction([makeJob('JOB-001', [])])).length === 0, 'job without shopDemandSource → not linked')

// 3. Returns empty array when no orders match job source IDs
check(projectShopOrderProductionStatus(makeCommerce([makeOrder('C-999')]), makeProduction([makeJob('JOB-001', ['C-001'])])).length === 0, 'order id mismatch → no link')

// 4. Links one order to one job
{
  const result = projectShopOrderProductionStatus(makeCommerce([makeOrder('C-001')]), makeProduction([makeJob('JOB-001', ['C-001'])]))
  check(result.length === 1, 'one order linked to one job → one result')
  check(result[0].orderId === 'C-001', 'orderId is correct')
  check(result[0].linkedJobs.length === 1, 'one linked job')
  check(result[0].linkedJobs[0].jobId === 'JOB-001', 'linkedJob jobId correct')
}

// 5. Links one order to multiple jobs
{
  const result = projectShopOrderProductionStatus(
    makeCommerce([makeOrder('C-001')]),
    makeProduction([makeJob('JOB-001', ['C-001']), makeJob('JOB-002', ['C-001'])]),
  )
  check(result.length === 1, 'one order with two linked jobs → one result')
  check(result[0].linkedJobs.length === 2, 'two linked jobs')
}

// 6. Links one job to multiple orders
{
  const result = projectShopOrderProductionStatus(
    makeCommerce([makeOrder('C-001'), makeOrder('C-002')]),
    makeProduction([makeJob('JOB-001', ['C-001', 'C-002'])]),
  )
  check(result.length === 2, 'one job covering two orders → two result rows')
  check(result.every((r) => r.linkedJobs[0].jobId === 'JOB-001'), 'both rows link to JOB-001')
}

// 7. Only orders with linked jobs are returned
{
  const result = projectShopOrderProductionStatus(
    makeCommerce([makeOrder('C-001'), makeOrder('C-002')]),
    makeProduction([makeJob('JOB-001', ['C-001'])]),
  )
  check(result.length === 1, 'only linked order returned')
  check(result[0].orderId === 'C-001', 'returned order is C-001')
}

// 8. Progress is 0 for new job (no output)
{
  const result = projectShopOrderProductionStatus(makeCommerce([makeOrder('C-001')]), makeProduction([makeJob('JOB-001', ['C-001'], { output: 0, scrap: 0 })]))
  check(result[0].linkedJobs[0].progress === 0, 'progress 0 when no output')
}

// 9. Progress is computed from output + scrap / target
{
  const result = projectShopOrderProductionStatus(makeCommerce([makeOrder('C-001')]), makeProduction([makeJob('JOB-001', ['C-001'], { output: 20, scrap: 5, target: 50 })]))
  check(result[0].linkedJobs[0].progress === 50, 'progress 50% when 25/50 accounted')
}

// 10. Progress capped at 100
{
  const result = projectShopOrderProductionStatus(makeCommerce([makeOrder('C-001')]), makeProduction([makeJob('JOB-001', ['C-001'], { output: 60, scrap: 0, target: 40 })]))
  check(result[0].linkedJobs[0].progress === 100, 'progress capped at 100')
}

// 11. Status is 'active' for an in-progress job
{
  const result = projectShopOrderProductionStatus(makeCommerce([makeOrder('C-001')]), makeProduction([makeJob('JOB-001', ['C-001'], { output: 10, target: 40 })]))
  check(result[0].linkedJobs[0].status === 'active', 'in-progress job has status active')
}

// 12. Status is 'on-hold' for a job with qualityHold
{
  const job = makeJob('JOB-001', ['C-001'], { qualityHold: { heldBy: 'QC', heldAt: '2026-08-11T08:00:00.000Z', evidenceReference: 'QH-001' } })
  const result = projectShopOrderProductionStatus(makeCommerce([makeOrder('C-001')]), makeProduction([job]))
  check(result[0].linkedJobs[0].status === 'on-hold', 'job with qualityHold has status on-hold')
}

// 13. Status is 'completed' for a closed job meeting target
{
  const job = makeJob('JOB-001', ['C-001'], { output: 40, target: 40, closure: { closedAt: '2026-08-13T16:00:00.000Z', closedBy: 'Plant Lead', shiftRef: 'SHIFT-1', remainingUnits: 0 } })
  const result = projectShopOrderProductionStatus(makeCommerce([makeOrder('C-001')]), makeProduction([job]))
  check(result[0].linkedJobs[0].status === 'completed', 'closed job at target has status completed')
}

// 14. Status is 'closed-short' for a job closed below target
{
  const job = makeJob('JOB-001', ['C-001'], { output: 38, target: 40, closure: { closedAt: '2026-08-13T16:00:00.000Z', closedBy: 'Plant Lead', shiftRef: 'SHIFT-1', remainingUnits: 2 } })
  const result = projectShopOrderProductionStatus(makeCommerce([makeOrder('C-001')]), makeProduction([job]))
  check(result[0].linkedJobs[0].status === 'closed-short', 'job closed below target has status closed-short')
}

// 15. Customer, item, quantity, createdAt are carried through from the order
{
  const result = projectShopOrderProductionStatus(
    makeCommerce([makeOrder('C-001', { customer: 'Yangon Tyre', item: 'Tyre Patch Kit', quantity: 200 })]),
    makeProduction([makeJob('JOB-001', ['C-001'])]),
  )
  check(result[0].customer === 'Yangon Tyre', 'customer carried through')
  check(result[0].item === 'Tyre Patch Kit', 'item carried through')
  check(result[0].quantity === 200, 'quantity carried through')
}

// 16. dueAt and owner carried through from job
{
  const job = makeJob('JOB-001', ['C-001'], { dueAt: '2026-08-14T08:00:00.000Z', owner: 'Plant Supervisor' })
  const result = projectShopOrderProductionStatus(makeCommerce([makeOrder('C-001')]), makeProduction([job]))
  check(result[0].linkedJobs[0].dueAt === '2026-08-14T08:00:00.000Z', 'dueAt carried through')
  check(result[0].linkedJobs[0].owner === 'Plant Supervisor', 'owner carried through')
}

// 17. scrap is reported separately from output
{
  const job = makeJob('JOB-001', ['C-001'], { output: 35, scrap: 3 })
  const result = projectShopOrderProductionStatus(makeCommerce([makeOrder('C-001')]), makeProduction([job]))
  check(result[0].linkedJobs[0].output === 35, 'output reported correctly')
  check(result[0].linkedJobs[0].scrap === 3, 'scrap reported separately')
}

// --- projectJobFulfillmentReconciliation tests ---

// 18. Returns empty array when no closed jobs
check(projectJobFulfillmentReconciliation(makeProduction([makeJob('JOB-001', ['C-001'])]), makeCommerce()).length === 0, 'no closed jobs → empty reconciliation')

// 19. Closed job with no receipts has gap = output
{
  const job = makeJob('JOB-001', ['C-001'], { output: 40, closure: { closedAt: '2026-08-13T16:00:00.000Z', closedBy: 'Lead', shiftRef: 'S-1', remainingUnits: 0 } })
  const result = projectJobFulfillmentReconciliation(makeProduction([job]), makeCommerce())
  check(result.length === 1, 'one closed job → one reconciliation')
  check(result[0].gap === 40, 'no receipts → gap equals output')
  check(result[0].reconciled === false, 'not reconciled when gap > 0')
}

// 20. Closed job with matching receipt is reconciled
{
  const closure = { closedAt: '2026-08-13T16:00:00.000Z', closedBy: 'Lead', shiftRef: 'S-1', remainingUnits: 0 }
  const job = makeJob('JOB-001', ['C-001'], { output: 40, closure })
  const receipt = makeMovement('production_receipt', { productionJobId: 'JOB-001', quantityDelta: 40 })
  const result = projectJobFulfillmentReconciliation(makeProduction([job]), makeCommerce([], [receipt]))
  check(result[0].received === 40, 'received equals receipt quantityDelta')
  check(result[0].gap === 0, 'gap is zero when received matches output')
  check(result[0].reconciled === true, 'reconciled when gap is zero')
}

// 21. Receipts for other jobs are not counted
{
  const closure = { closedAt: '2026-08-13T16:00:00.000Z', closedBy: 'Lead', shiftRef: 'S-1', remainingUnits: 0 }
  const job = makeJob('JOB-001', ['C-001'], { output: 40, closure })
  const otherReceipt = makeMovement('production_receipt', { productionJobId: 'JOB-999', quantityDelta: 40 })
  const result = projectJobFulfillmentReconciliation(makeProduction([job]), makeCommerce([], [otherReceipt]))
  check(result[0].received === 0, 'receipt for different jobId not counted')
}

// 22. Multiple partial receipts are summed
{
  const closure = { closedAt: '2026-08-13T16:00:00.000Z', closedBy: 'Lead', shiftRef: 'S-1', remainingUnits: 0 }
  const job = makeJob('JOB-001', ['C-001'], { output: 40, closure })
  const r1 = makeMovement('production_receipt', { id: 'MOV-R1', productionJobId: 'JOB-001', quantityDelta: 25 })
  const r2 = makeMovement('production_receipt', { id: 'MOV-R2', productionJobId: 'JOB-001', quantityDelta: 15 })
  const result = projectJobFulfillmentReconciliation(makeProduction([job]), makeCommerce([], [r1, r2]))
  check(result[0].received === 40, 'multiple receipts summed correctly')
  check(result[0].receiptCount === 2, 'receiptCount is 2')
  check(result[0].reconciled === true, 'reconciled after summing both receipts')
}

// 23. Non-receipt movements do not affect reconciliation
{
  const closure = { closedAt: '2026-08-13T16:00:00.000Z', closedBy: 'Lead', shiftRef: 'S-1', remainingUnits: 0 }
  const job = makeJob('JOB-001', ['C-001'], { output: 40, closure })
  const issue = makeMovement('production_issue', { productionJobId: 'JOB-001', quantityDelta: 50 })
  const result = projectJobFulfillmentReconciliation(makeProduction([job]), makeCommerce([], [issue]))
  check(result[0].received === 0, 'production_issue movement excluded from reconciliation')
}

// 24. closedAt is carried through from closure
{
  const closure = { closedAt: '2026-08-13T16:00:00.000Z', closedBy: 'Lead', shiftRef: 'S-1', remainingUnits: 0 }
  const job = makeJob('JOB-001', ['C-001'], { output: 40, closure })
  const result = projectJobFulfillmentReconciliation(makeProduction([job]), makeCommerce())
  check(result[0].closedAt === '2026-08-13T16:00:00.000Z', 'closedAt carried through from closure')
}

// 25. product field is carried through
{
  const closure = { closedAt: '2026-08-13T16:00:00.000Z', closedBy: 'Lead', shiftRef: 'S-1', remainingUnits: 0 }
  const job = makeJob('JOB-001', ['C-001'], { product: 'Tyre Patch Kit', output: 10, closure })
  const result = projectJobFulfillmentReconciliation(makeProduction([job]), makeCommerce())
  check(result[0].product === 'Tyre Patch Kit', 'product carried through from job')
}

console.log(`cross-product shop-production reporting: ${checks} checks passed`)
