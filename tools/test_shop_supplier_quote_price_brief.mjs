// Shop supplier quote price brief: unitCostMmk aggregates across all quotes.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopSupplierQuotePriceBrief } from './shop-supplier-quote-price-brief.ts'`,
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

const { projectShopSupplierQuotePriceBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function quote({ supplier = 'supplier-01', unitCostMmk = 1000 } = {}) {
  decisionId++
  return {
    supplier,
    quoteReference: `quote-${decisionId}`,
    vendorApprovalReference: `vap-${decisionId}`,
    unitCostMmk,
    deliveryAt: '2026-09-01',
    validUntil: '2026-08-31',
  }
}

let sdId = 0
function decision(quotes) {
  sdId++
  const qs = quotes ?? [quote()]
  return {
    id: `sd-${sdId}`,
    createdAt: '2026-08-11T08:00:00Z',
    sku: 'SKU-01',
    quantity: 100,
    quotes: qs,
    selectedQuoteReference: qs[0].quoteReference,
    unitCostToleranceBasisPoints: 500,
    deliveryToleranceDays: 7,
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

// 1. No decisions (undefined) → all zeros, nulls
{
  const r = projectShopSupplierQuotePriceBrief({ ...state([]), supplierSourcingDecisions: undefined })
  check(r.totalSourcingDecisions === 0, 'no-decisions: total 0')
  check(r.totalQuotes === 0, 'no-decisions: totalQuotes 0')
  check(r.averageQuotesPerDecision === 0, 'no-decisions: avgPerDecision 0')
  check(r.totalQuotedUnitCostMmk === 0, 'no-decisions: totalCost 0')
  check(r.averageUnitCostMmk === 0, 'no-decisions: avgCost 0')
  check(r.minUnitCostMmk === null, 'no-decisions: min null')
  check(r.maxUnitCostMmk === null, 'no-decisions: max null')
}

// 2. Empty array
{
  const r = projectShopSupplierQuotePriceBrief(state([]))
  check(r.totalSourcingDecisions === 0, 'empty: total 0')
  check(r.minUnitCostMmk === null, 'empty: min null')
}

// 3. One decision, one quote
{
  const r = projectShopSupplierQuotePriceBrief(state([decision([quote({ unitCostMmk: 5000 })])]))
  check(r.totalSourcingDecisions === 1, 'single: decisions 1')
  check(r.totalQuotes === 1, 'single: quotes 1')
  check(r.averageQuotesPerDecision === 1, 'single: avgPerDecision 1')
  check(r.totalQuotedUnitCostMmk === 5000, 'single: totalCost 5000')
  check(r.averageUnitCostMmk === 5000, 'single: avgCost 5000')
  check(r.minUnitCostMmk === 5000, 'single: min 5000')
  check(r.maxUnitCostMmk === 5000, 'single: max 5000')
}

// 4. One decision, three quotes — min/max tracking
{
  const r = projectShopSupplierQuotePriceBrief(state([
    decision([
      quote({ unitCostMmk: 3000 }),
      quote({ unitCostMmk: 1000 }),
      quote({ unitCostMmk: 5000 }),
    ]),
  ]))
  check(r.totalQuotes === 3, 'three-quotes: quotes 3')
  check(r.minUnitCostMmk === 1000, 'three-quotes: min 1000')
  check(r.maxUnitCostMmk === 5000, 'three-quotes: max 5000')
  check(r.totalQuotedUnitCostMmk === 9000, 'three-quotes: total 9000')
  check(r.averageUnitCostMmk === 3000, 'three-quotes: avg 3000')
}

// 5. averageQuotesPerDecision — 3 quotes / 1 decision = 3
{
  const r = projectShopSupplierQuotePriceBrief(state([
    decision([quote(), quote(), quote()]),
  ]))
  check(r.averageQuotesPerDecision === 3, 'avg-per-decision: 3')
}

// 6. Multiple decisions — aggregates across all quotes
{
  const r = projectShopSupplierQuotePriceBrief(state([
    decision([quote({ unitCostMmk: 1000 }), quote({ unitCostMmk: 2000 })]),
    decision([quote({ unitCostMmk: 500 })]),
  ]))
  check(r.totalSourcingDecisions === 2, 'multi: decisions 2')
  check(r.totalQuotes === 3, 'multi: quotes 3')
  check(r.totalQuotedUnitCostMmk === 3500, 'multi: total 3500')
  check(r.minUnitCostMmk === 500, 'multi: min 500')
  check(r.maxUnitCostMmk === 2000, 'multi: max 2000')
}

// 7. averageUnitCostMmk rounds — 1000 + 1001 = 2001 / 2 = 1000.5 → 1001
{
  const r = projectShopSupplierQuotePriceBrief(state([
    decision([quote({ unitCostMmk: 1000 }), quote({ unitCostMmk: 1001 })]),
  ]))
  check(r.averageUnitCostMmk === 1001, 'round: avgCost 1001 (Math.round(1000.5))')
}

// 8. averageQuotesPerDecision rounds — 5 quotes / 3 decisions = 1.67 → 2
{
  const r = projectShopSupplierQuotePriceBrief(state([
    decision([quote(), quote()]),
    decision([quote(), quote()]),
    decision([quote()]),
  ]))
  check(r.totalSourcingDecisions === 3, 'avg-round: decisions 3')
  check(r.totalQuotes === 5, 'avg-round: quotes 5')
  check(r.averageQuotesPerDecision === 2, 'avg-round: avgPerDecision 2 (Math.round(5/3))')
}

console.log(JSON.stringify({ ok: true, checks }))
