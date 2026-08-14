// Shop sourcing decision tolerance brief: unitCostToleranceBasisPoints + deliveryToleranceDays numeric stats.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopSourcingDecisionToleranceBrief } from './shop-sourcing-decision-tolerance-brief.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopSourcingDecisionToleranceBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'
const PROOF = { actionId: 'ACT-1', capturedAt: '2026-08-01T09:00:00Z', actor: 'buyer-1', reason: 'Approved.', evidenceReference: 'EVD-1' }
const QUOTE = { supplier: 'SUP-1', quoteReference: 'QT-1', vendorApprovalReference: 'VA-1', unitCostMmk: 5000, deliveryAt: '2026-09-01', validUntil: '2026-08-31' }

let decId = 0
function decision(unitCostToleranceBasisPoints, deliveryToleranceDays) {
  decId++
  return {
    id: `SD-${decId}`,
    createdAt: '2026-08-01T09:00:00Z',
    sku: 'SKU-1',
    quantity: 10,
    quotes: [QUOTE],
    selectedQuoteReference: 'QT-1',
    unitCostToleranceBasisPoints,
    deliveryToleranceDays,
    approval: PROOF,
  }
}

function state(supplierSourcingDecisions) {
  const base = { schema: SCHEMA, items: [], orders: [], movements: [], closes: [] }
  if (supplierSourcingDecisions !== undefined) base.supplierSourcingDecisions = supplierSourcingDecisions
  return base
}

// 1. No decisions → all zeros / nulls
{
  const r = projectShopSourcingDecisionToleranceBrief(state(undefined))
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.totalUnitCostToleranceBasisPoints === 0, 'empty: totalUnitCostToleranceBasisPoints 0')
  check(r.averageUnitCostToleranceBasisPoints === 0, 'empty: averageUnitCostToleranceBasisPoints 0')
  check(r.minUnitCostToleranceBasisPoints === null, 'empty: minUnitCostToleranceBasisPoints null')
  check(r.maxUnitCostToleranceBasisPoints === null, 'empty: maxUnitCostToleranceBasisPoints null')
  check(r.totalDeliveryToleranceDays === 0, 'empty: totalDeliveryToleranceDays 0')
  check(r.averageDeliveryToleranceDays === 0, 'empty: averageDeliveryToleranceDays 0')
  check(r.minDeliveryToleranceDays === null, 'empty: minDeliveryToleranceDays null')
  check(r.maxDeliveryToleranceDays === null, 'empty: maxDeliveryToleranceDays null')
}

// 2. Single decision → all fields populated
{
  const r = projectShopSourcingDecisionToleranceBrief(state([decision(200, 5)]))
  check(r.totalDecisions === 1, 'single: totalDecisions 1')
  check(r.totalUnitCostToleranceBasisPoints === 200, 'single: totalUnitCostToleranceBasisPoints 200')
  check(r.averageUnitCostToleranceBasisPoints === 200, 'single: avg costBp 200')
  check(r.minUnitCostToleranceBasisPoints === 200, 'single: min costBp 200')
  check(r.maxUnitCostToleranceBasisPoints === 200, 'single: max costBp 200')
  check(r.totalDeliveryToleranceDays === 5, 'single: totalDeliveryToleranceDays 5')
  check(r.averageDeliveryToleranceDays === 5, 'single: avg delivDays 5')
  check(r.minDeliveryToleranceDays === 5, 'single: min delivDays 5')
  check(r.maxDeliveryToleranceDays === 5, 'single: max delivDays 5')
}

// 3. Multiple decisions → sum, avg, min, max for cost tolerance
{
  const r = projectShopSourcingDecisionToleranceBrief(
    state([decision(100, 3), decision(300, 7), decision(200, 5)]),
  )
  check(r.totalUnitCostToleranceBasisPoints === 600, 'multi: total costBp 600')
  check(r.averageUnitCostToleranceBasisPoints === 200, 'multi: avg costBp 200')
  check(r.minUnitCostToleranceBasisPoints === 100, 'multi: min costBp 100')
  check(r.maxUnitCostToleranceBasisPoints === 300, 'multi: max costBp 300')
}

// 4. Multiple decisions → sum, avg, min, max for delivery tolerance
{
  const r = projectShopSourcingDecisionToleranceBrief(
    state([decision(200, 2), decision(200, 10), decision(200, 6)]),
  )
  check(r.totalDeliveryToleranceDays === 18, 'multi-deliv: total delivDays 18')
  check(r.averageDeliveryToleranceDays === 6, 'multi-deliv: avg delivDays 6')
  check(r.minDeliveryToleranceDays === 2, 'multi-deliv: min delivDays 2')
  check(r.maxDeliveryToleranceDays === 10, 'multi-deliv: max delivDays 10')
}

// 5. Math.round: 100+201 = 301 / 2 = 150.5 → 151
{
  const r = projectShopSourcingDecisionToleranceBrief(state([decision(100, 3), decision(201, 4)]))
  check(r.averageUnitCostToleranceBasisPoints === 151, 'round-cost: avg round(150.5)=151')
}

// 6. Math.round: 3+4 = 7 / 2 = 3.5 → 4
{
  const r = projectShopSourcingDecisionToleranceBrief(state([decision(200, 3), decision(200, 4)]))
  check(r.averageDeliveryToleranceDays === 4, 'round-deliv: avg round(3.5)=4')
}

console.log(JSON.stringify({ ok: true, checks }))
