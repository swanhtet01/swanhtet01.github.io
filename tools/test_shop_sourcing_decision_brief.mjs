// Shop sourcing decision brief: sku distribution and quantity stats across sourcing decisions.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopSourcingDecisionBrief } from './shop-sourcing-decision-brief.ts'`,
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

const { projectShopSourcingDecisionBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'
const PROOF = { actionId: 'ACT-1', capturedAt: '2026-08-01T09:00:00Z', actor: 'buyer-1', reason: 'Sourcing approval.', evidenceReference: 'EVD-1' }
const QUOTE = { supplier: 'SUP-1', quoteReference: 'QT-1', vendorApprovalReference: 'VA-1', unitCostMmk: 5000, deliveryAt: '2026-09-01', deliveryToleranceDays: 5, validUntil: '2026-08-31' }

let decId = 0
function decision(sku, quantity) {
  decId++
  return {
    id: `SD-${decId}`,
    createdAt: '2026-08-01T09:00:00Z',
    sku,
    quantity,
    quotes: [QUOTE],
    selectedQuoteReference: 'QT-1',
    unitCostToleranceBasisPoints: 200,
    deliveryToleranceDays: 5,
    approval: PROOF,
  }
}

function state(supplierSourcingDecisions) {
  const base = { schema: SCHEMA, items: [], orders: [], movements: [], closes: [] }
  if (supplierSourcingDecisions !== undefined) base.supplierSourcingDecisions = supplierSourcingDecisions
  return base
}

// 1. No decisions (undefined) → zeros
{
  const r = projectShopSourcingDecisionBrief(state(undefined))
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.uniqueSkus === 0, 'empty: uniqueSkus 0')
  check(r.topSkusByCount.length === 0, 'empty: topSkusByCount empty')
  check(r.totalQuantity === 0, 'empty: totalQuantity 0')
  check(r.averageQuantity === 0, 'empty: averageQuantity 0')
}

// 2. Single decision
{
  const r = projectShopSourcingDecisionBrief(state([decision('SKU-A', 100)]))
  check(r.totalDecisions === 1, 'single: totalDecisions 1')
  check(r.uniqueSkus === 1, 'single: uniqueSkus 1')
  check(r.topSkusByCount[0]?.sku === 'SKU-A', 'single: top sku')
  check(r.topSkusByCount[0]?.count === 1, 'single: count 1')
  check(r.totalQuantity === 100, 'single: totalQuantity 100')
  check(r.averageQuantity === 100, 'single: averageQuantity 100')
}

// 3. Multiple decisions, same SKU
{
  const r = projectShopSourcingDecisionBrief(state([decision('SKU-A', 100), decision('SKU-A', 200), decision('SKU-B', 50)]))
  check(r.totalDecisions === 3, 'shared: totalDecisions 3')
  check(r.uniqueSkus === 2, 'shared: uniqueSkus 2')
  check(r.topSkusByCount[0]?.sku === 'SKU-A', 'shared: top sku SKU-A')
  check(r.topSkusByCount[0]?.count === 2, 'shared: count 2')
  check(r.totalQuantity === 350, 'shared: totalQuantity 350')
}

// 4. Average quantity
{
  const r = projectShopSourcingDecisionBrief(state([decision('SKU-A', 100), decision('SKU-B', 200)]))
  check(r.averageQuantity === 150, 'avg: averageQuantity 150')
}

// 5. Math.round: 100+200+300 = 600 / 3 = 200 exactly
{
  const r = projectShopSourcingDecisionBrief(state([decision('SKU-A', 100), decision('SKU-B', 200), decision('SKU-C', 300)]))
  check(r.averageQuantity === 200, 'round: averageQuantity 200')
  check(r.uniqueSkus === 3, 'round: uniqueSkus 3')
}

// 6. Top-5 cap
{
  const skus = ['SKU-F', 'SKU-A', 'SKU-C', 'SKU-B', 'SKU-D', 'SKU-E']
  const r = projectShopSourcingDecisionBrief(state(skus.map(s => decision(s, 10))))
  check(r.topSkusByCount.length === 5, 'top5: capped at 5')
  check(r.topSkusByCount[0]?.sku === 'SKU-A', 'top5: tiebreak alphabetic SKU-A first')
}

console.log(JSON.stringify({ ok: true, checks }))
