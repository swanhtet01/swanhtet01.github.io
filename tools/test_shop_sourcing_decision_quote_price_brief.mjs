// Shop sourcing decision quote price brief: quote count stats + unitCostMmk numeric stats across sourcing decision quotes.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopSourcingDecisionQuotePriceBrief } from './shop-sourcing-decision-quote-price-brief.ts'`,
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

const { projectShopSourcingDecisionQuotePriceBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'
const PROOF = { actionId: 'ACT-1', capturedAt: '2026-08-01T09:00:00Z', actor: 'buyer-1', reason: 'Approved.', evidenceReference: 'EVD-1' }

let decId = 0
function decision(quotes) {
  decId++
  return {
    id: `SD-${decId}`,
    createdAt: '2026-08-01T09:00:00Z',
    sku: 'SKU-1',
    quantity: 10,
    quotes,
    selectedQuoteReference: quotes[0]?.quoteReference ?? 'QT-X',
    unitCostToleranceBasisPoints: 200,
    deliveryToleranceDays: 5,
    approval: PROOF,
  }
}

function quote(unitCostMmk, ref = 'QT-1') {
  return { supplier: 'SUP-1', quoteReference: ref, vendorApprovalReference: 'VA-1', unitCostMmk, deliveryAt: '2026-09-01', validUntil: '2026-08-31' }
}

function state(supplierSourcingDecisions) {
  const base = { schema: SCHEMA, items: [], orders: [], movements: [], closes: [] }
  if (supplierSourcingDecisions !== undefined) base.supplierSourcingDecisions = supplierSourcingDecisions
  return base
}

// 1. No decisions → all zeros / nulls
{
  const r = projectShopSourcingDecisionQuotePriceBrief(state(undefined))
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.totalQuotes === 0, 'empty: totalQuotes 0')
  check(r.averageQuotesPerDecision === 0, 'empty: averageQuotesPerDecision 0')
  check(r.totalQuoteValueMmk === 0, 'empty: totalQuoteValueMmk 0')
  check(r.averageQuoteUnitCostMmk === 0, 'empty: averageQuoteUnitCostMmk 0')
  check(r.minQuoteUnitCostMmk === null, 'empty: minQuoteUnitCostMmk null')
  check(r.maxQuoteUnitCostMmk === null, 'empty: maxQuoteUnitCostMmk null')
}

// 2. Decision with empty quotes array → counted as decision, zero quotes
{
  const r = projectShopSourcingDecisionQuotePriceBrief(state([decision([])]))
  check(r.totalDecisions === 1, 'no-quotes: totalDecisions 1')
  check(r.totalQuotes === 0, 'no-quotes: totalQuotes 0')
  check(r.minQuoteUnitCostMmk === null, 'no-quotes: minQuoteUnitCostMmk null')
}

// 3. Single decision, single quote → all fields populated
{
  const r = projectShopSourcingDecisionQuotePriceBrief(state([decision([quote(5000)])]))
  check(r.totalDecisions === 1, 'single-q: totalDecisions 1')
  check(r.totalQuotes === 1, 'single-q: totalQuotes 1')
  check(r.averageQuotesPerDecision === 1, 'single-q: averageQuotesPerDecision 1')
  check(r.totalQuoteValueMmk === 5000, 'single-q: totalQuoteValueMmk 5000')
  check(r.averageQuoteUnitCostMmk === 5000, 'single-q: averageQuoteUnitCostMmk 5000')
  check(r.minQuoteUnitCostMmk === 5000, 'single-q: minQuoteUnitCostMmk 5000')
  check(r.maxQuoteUnitCostMmk === 5000, 'single-q: maxQuoteUnitCostMmk 5000')
}

// 4. Single decision, multiple quotes → price spread
{
  const r = projectShopSourcingDecisionQuotePriceBrief(
    state([decision([quote(4000, 'QT-1'), quote(6000, 'QT-2'), quote(5000, 'QT-3')])]),
  )
  check(r.totalQuotes === 3, 'spread: totalQuotes 3')
  check(r.minQuoteUnitCostMmk === 4000, 'spread: min 4000')
  check(r.maxQuoteUnitCostMmk === 6000, 'spread: max 6000')
  check(r.averageQuoteUnitCostMmk === 5000, 'spread: avg 5000')
}

// 5. Multiple decisions → quotes accumulate across decisions
{
  const r = projectShopSourcingDecisionQuotePriceBrief(
    state([
      decision([quote(3000, 'QT-1'), quote(4000, 'QT-2')]),
      decision([quote(5000, 'QT-3')]),
    ]),
  )
  check(r.totalDecisions === 2, 'multi-dec: totalDecisions 2')
  check(r.totalQuotes === 3, 'multi-dec: totalQuotes 3')
  check(r.minQuoteUnitCostMmk === 3000, 'multi-dec: global min 3000')
  check(r.maxQuoteUnitCostMmk === 5000, 'multi-dec: global max 5000')
}

// 6. Math.round for averageQuoteUnitCostMmk: 3000+4000 = 7000 / 2 = 3500 (exact)
{
  const r = projectShopSourcingDecisionQuotePriceBrief(
    state([decision([quote(3000, 'QT-1'), quote(4000, 'QT-2')])]),
  )
  check(r.averageQuoteUnitCostMmk === 3500, 'round-price: avg 3500 exact')
}

// 7. Math.round for averageQuotesPerDecision: 3 quotes / 2 decisions = 1.5 → 2
{
  const r = projectShopSourcingDecisionQuotePriceBrief(
    state([
      decision([quote(5000, 'QT-1'), quote(6000, 'QT-2')]),
      decision([quote(5000, 'QT-3')]),
    ]),
  )
  check(r.averageQuotesPerDecision === 2, 'round-avg-q: round(1.5)=2')
}

console.log(JSON.stringify({ ok: true, checks }))
