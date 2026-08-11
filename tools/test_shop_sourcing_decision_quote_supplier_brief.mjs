// Shop sourcing decision quote supplier brief: CommerceSupplierQuote.supplier text distribution across all sourcing decisions.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopSourcingDecisionQuoteSupplierBrief } from './shop-sourcing-decision-quote-supplier-brief.ts'`,
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

const { projectShopSourcingDecisionQuoteSupplierBrief } = await import(
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

let qtId = 0
function quote(supplier) {
  qtId++
  return { supplier, quoteReference: `QT-${qtId}`, vendorApprovalReference: `VA-${qtId}`, unitCostMmk: 5000, deliveryAt: '2026-09-01', validUntil: '2026-08-31' }
}

function state(supplierSourcingDecisions) {
  const base = { schema: SCHEMA, items: [], orders: [], movements: [], closes: [] }
  if (supplierSourcingDecisions !== undefined) base.supplierSourcingDecisions = supplierSourcingDecisions
  return base
}

// 1. No decisions → all zeros
{
  const r = projectShopSourcingDecisionQuoteSupplierBrief(state(undefined))
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.totalQuotes === 0, 'empty: totalQuotes 0')
  check(r.uniqueQuoteSuppliers === 0, 'empty: uniqueQuoteSuppliers 0')
  check(r.topQuoteSuppliersByCount.length === 0, 'empty: topQuoteSuppliersByCount empty')
}

// 2. Decision with empty quotes → totalDecisions counted, no suppliers
{
  const r = projectShopSourcingDecisionQuoteSupplierBrief(state([decision([])]))
  check(r.totalDecisions === 1, 'no-quotes: totalDecisions 1')
  check(r.totalQuotes === 0, 'no-quotes: totalQuotes 0')
  check(r.uniqueQuoteSuppliers === 0, 'no-quotes: uniqueQuoteSuppliers 0')
}

// 3. Single decision, single quote
{
  const r = projectShopSourcingDecisionQuoteSupplierBrief(
    state([decision([quote('SUP-A')])]),
  )
  check(r.totalDecisions === 1, 'single-q: totalDecisions 1')
  check(r.totalQuotes === 1, 'single-q: totalQuotes 1')
  check(r.uniqueQuoteSuppliers === 1, 'single-q: uniqueQuoteSuppliers 1')
  check(r.topQuoteSuppliersByCount[0]?.supplier === 'SUP-A', 'single-q: supplier SUP-A')
}

// 4. Same supplier across multiple decisions → counted per quote
{
  const r = projectShopSourcingDecisionQuoteSupplierBrief(
    state([
      decision([quote('SUP-A'), quote('SUP-B')]),
      decision([quote('SUP-A')]),
    ]),
  )
  check(r.totalQuotes === 3, 'multi: totalQuotes 3')
  check(r.uniqueQuoteSuppliers === 2, 'multi: uniqueQuoteSuppliers 2')
  check(r.topQuoteSuppliersByCount[0]?.supplier === 'SUP-A', 'multi: top supplier SUP-A')
  check(r.topQuoteSuppliersByCount[0]?.count === 2, 'multi: SUP-A count 2')
}

// 5. Top-5 cap
{
  const suppliers = ['SUP-F', 'SUP-A', 'SUP-C', 'SUP-B', 'SUP-D', 'SUP-E']
  const r = projectShopSourcingDecisionQuoteSupplierBrief(
    state([decision(suppliers.map(s => quote(s)))]),
  )
  check(r.topQuoteSuppliersByCount.length === 5, 'top5: capped at 5')
}

// 6. Alphabetical tiebreak
{
  const r = projectShopSourcingDecisionQuoteSupplierBrief(
    state([decision([quote('SUP-Z'), quote('SUP-A')])]),
  )
  check(r.topQuoteSuppliersByCount[0]?.supplier === 'SUP-A', 'tiebreak: SUP-A before SUP-Z')
}

console.log(JSON.stringify({ ok: true, checks }))
