// Shop supplier sourcing tolerance brief: unitCostToleranceBasisPoints and deliveryToleranceDays.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopSupplierSourcingToleranceBrief } from './shop-supplier-sourcing-tolerance-brief.ts'`,
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

const { projectShopSupplierSourcingToleranceBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let sdId = 0
function decision({ costBp = 500, deliveryDays = 7 } = {}) {
  sdId++
  return {
    id: `sd-${sdId}`,
    createdAt: '2026-08-11T08:00:00Z',
    sku: 'SKU-01',
    quantity: 100,
    quotes: [{ supplier: 's-01', quoteReference: `q-${sdId}`, vendorApprovalReference: '', unitCostMmk: 1000, deliveryAt: '2026-09-01', validUntil: '2026-08-31' }],
    selectedQuoteReference: `q-${sdId}`,
    unitCostToleranceBasisPoints: costBp,
    deliveryToleranceDays: deliveryDays,
    approval: { actionId: `act-${sdId}`, savedAt: '2026-08-11T08:00:00Z', savedBy: 'buyer-01' },
  }
}

function state(decisions) {
  return {
    schema: 'supermega.commerce.workspace.v3',
    revision: 1,
    orders: [],
    purchaseOrders: [],
    movements: [],
    taxConfigurations: [],
    customerCreditPolicies: [],
    promotionPolicies: [],
    shippingPolicies: [],
    paymentPolicies: [],
    catalogChanges: [],
    purchaseBudgetEnvelopes: [],
    purchaseRequisitions: [],
    supplierSourcingDecisions: decisions ?? [],
    websiteIntakes: [],
  }
}

// 1. Empty → all zeros / nulls
{
  const r = projectShopSupplierSourcingToleranceBrief(state([]))
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.totalUnitCostToleranceBasisPoints === 0, 'empty: totalCostBp 0')
  check(r.averageUnitCostToleranceBasisPoints === 0, 'empty: avgCostBp 0')
  check(r.minUnitCostToleranceBasisPoints === null, 'empty: minCostBp null')
  check(r.maxUnitCostToleranceBasisPoints === null, 'empty: maxCostBp null')
  check(r.totalDeliveryToleranceDays === 0, 'empty: totalDays 0')
  check(r.averageDeliveryToleranceDays === 0, 'empty: avgDays 0')
  check(r.minDeliveryToleranceDays === null, 'empty: minDays null')
  check(r.maxDeliveryToleranceDays === null, 'empty: maxDays null')
}

// 2. Single decision
{
  const r = projectShopSupplierSourcingToleranceBrief(state([decision({ costBp: 300, deliveryDays: 5 })]))
  check(r.totalDecisions === 1, 'single: totalDecisions 1')
  check(r.totalUnitCostToleranceBasisPoints === 300, 'single: totalCostBp 300')
  check(r.averageUnitCostToleranceBasisPoints === 300, 'single: avgCostBp 300')
  check(r.minUnitCostToleranceBasisPoints === 300, 'single: minCostBp 300')
  check(r.maxUnitCostToleranceBasisPoints === 300, 'single: maxCostBp 300')
  check(r.totalDeliveryToleranceDays === 5, 'single: totalDays 5')
  check(r.averageDeliveryToleranceDays === 5, 'single: avgDays 5')
  check(r.minDeliveryToleranceDays === 5, 'single: minDays 5')
  check(r.maxDeliveryToleranceDays === 5, 'single: maxDays 5')
}

// 3. Two decisions: totals, min/max, avg
{
  const r = projectShopSupplierSourcingToleranceBrief(state([
    decision({ costBp: 200, deliveryDays: 3 }),
    decision({ costBp: 600, deliveryDays: 9 }),
  ]))
  check(r.totalDecisions === 2, 'two: totalDecisions 2')
  check(r.totalUnitCostToleranceBasisPoints === 800, 'two: totalCostBp 800')
  check(r.averageUnitCostToleranceBasisPoints === 400, 'two: avgCostBp 400')
  check(r.minUnitCostToleranceBasisPoints === 200, 'two: minCostBp 200')
  check(r.maxUnitCostToleranceBasisPoints === 600, 'two: maxCostBp 600')
  check(r.totalDeliveryToleranceDays === 12, 'two: totalDays 12')
  check(r.averageDeliveryToleranceDays === 6, 'two: avgDays 6')
  check(r.minDeliveryToleranceDays === 3, 'two: minDays 3')
  check(r.maxDeliveryToleranceDays === 9, 'two: maxDays 9')
}

// 4. Three decisions: rounding on avg
{
  const r = projectShopSupplierSourcingToleranceBrief(state([
    decision({ costBp: 100, deliveryDays: 1 }),
    decision({ costBp: 200, deliveryDays: 2 }),
    decision({ costBp: 300, deliveryDays: 3 }),
  ]))
  check(r.totalDecisions === 3, 'three: totalDecisions 3')
  check(r.averageUnitCostToleranceBasisPoints === 200, 'three: avgCostBp 200')
  check(r.averageDeliveryToleranceDays === 2, 'three: avgDays 2')
  check(r.minUnitCostToleranceBasisPoints === 100, 'three: minCostBp 100')
  check(r.maxUnitCostToleranceBasisPoints === 300, 'three: maxCostBp 300')
  check(r.minDeliveryToleranceDays === 1, 'three: minDays 1')
  check(r.maxDeliveryToleranceDays === 3, 'three: maxDays 3')
}

// 5. Null guard
{
  const r = projectShopSupplierSourcingToleranceBrief({ ...state([]), supplierSourcingDecisions: undefined })
  check(r.totalDecisions === 0, 'null-guard: totalDecisions 0')
  check(r.minUnitCostToleranceBasisPoints === null, 'null-guard: minCostBp null')
}

console.log(JSON.stringify({ ok: true, checks }))
