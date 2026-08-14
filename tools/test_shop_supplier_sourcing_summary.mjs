// Shop supplier sourcing summary: totalDecisions, totalQuantitySourced, uniqueSkus,
// totalQuotesEvaluated, averageQuotesPerDecision, bySupplier sorted desc winsCount then alpha.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopSupplierSourcingSummary } from './shop-supplier-sourcing-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/sourcing-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopSupplierSourcingSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decSeq = 0
const PROOF = { actionId: 'act1', capturedAt: '2026-08-11T08:00:00.000Z', actor: 'op1' }

function quote(supplier, ref, unitCostMmk = 5_000) {
  return {
    supplier,
    quoteReference: ref,
    vendorApprovalReference: `VAR-${ref}`,
    unitCostMmk,
    deliveryAt: '2026-09-01T00:00:00.000Z',
    validUntil: '2026-08-31T00:00:00.000Z',
  }
}

function decision({ sku = 'SKU-A', qty, quotes, selectedRef }) {
  decSeq++
  return {
    id: `SSD-${String(decSeq).padStart(8, '0')}-0000-4000-A000-000000000001`,
    createdAt: '2026-08-11T08:00:00.000Z',
    sku,
    quantity: qty,
    quotes,
    selectedQuoteReference: selectedRef,
    unitCostToleranceBasisPoints: 500,
    deliveryToleranceDays: 3,
    approval: PROOF,
  }
}

function state(supplierSourcingDecisions = undefined) {
  return {
    items: [], orders: [], movements: [], closes: [],
    ...(supplierSourcingDecisions !== undefined ? { supplierSourcingDecisions } : {}),
  }
}

// 1. Empty state (no field) → all zeros
{
  const r = projectShopSupplierSourcingSummary(state())
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.totalQuantitySourced === 0, 'empty: totalQuantitySourced 0')
  check(r.uniqueSkus === 0, 'empty: uniqueSkus 0')
  check(r.totalQuotesEvaluated === 0, 'empty: totalQuotesEvaluated 0')
  check(r.averageQuotesPerDecision === 0, 'empty: averageQuotesPerDecision 0')
  check(r.bySupplier.length === 0, 'empty: bySupplier empty')
}

// 2. Empty array
{
  const r = projectShopSupplierSourcingSummary(state([]))
  check(r.totalDecisions === 0, 'empty-array: totalDecisions 0')
}

// 3. Single decision, two quotes, one selected
{
  const q1 = quote('Sup-Alpha', 'Q-001', 4_000)
  const q2 = quote('Sup-Beta', 'Q-002', 5_000)
  const r = projectShopSupplierSourcingSummary(state([
    decision({ sku: 'SKU-A', qty: 100, quotes: [q1, q2], selectedRef: 'Q-001' }),
  ]))
  check(r.totalDecisions === 1, 'single: totalDecisions 1')
  check(r.totalQuantitySourced === 100, 'single: totalQuantitySourced 100')
  check(r.uniqueSkus === 1, 'single: uniqueSkus 1')
  check(r.totalQuotesEvaluated === 2, 'single: totalQuotesEvaluated 2')
  check(r.averageQuotesPerDecision === 2, 'single: averageQuotesPerDecision 2')
  check(r.bySupplier.length === 1, 'single: bySupplier 1 entry (only selected supplier)')
  check(r.bySupplier[0].supplier === 'Sup-Alpha', 'single: selected supplier is Sup-Alpha')
  check(r.bySupplier[0].winsCount === 1, 'single: winsCount 1')
  check(r.bySupplier[0].totalQuantityWon === 100, 'single: totalQuantityWon 100')
}

// 4. uniqueSkus: same sku in multiple decisions → counted once
{
  const r = projectShopSupplierSourcingSummary(state([
    decision({ sku: 'SKU-A', qty: 50, quotes: [quote('Sup-A', 'Q-A1')], selectedRef: 'Q-A1' }),
    decision({ sku: 'SKU-A', qty: 30, quotes: [quote('Sup-A', 'Q-A2')], selectedRef: 'Q-A2' }),
  ]))
  check(r.uniqueSkus === 1, 'unique-sku: same SKU counted once')
  check(r.totalDecisions === 2, 'unique-sku: totalDecisions 2')
}

// 5. uniqueSkus: different skus counted separately
{
  const r = projectShopSupplierSourcingSummary(state([
    decision({ sku: 'SKU-A', qty: 50, quotes: [quote('Sup-A', 'Q-A1')], selectedRef: 'Q-A1' }),
    decision({ sku: 'SKU-B', qty: 30, quotes: [quote('Sup-B', 'Q-B1')], selectedRef: 'Q-B1' }),
    decision({ sku: 'SKU-C', qty: 20, quotes: [quote('Sup-C', 'Q-C1')], selectedRef: 'Q-C1' }),
  ]))
  check(r.uniqueSkus === 3, 'multi-sku: 3 distinct SKUs')
  check(r.totalQuantitySourced === 100, 'multi-sku: totalQuantitySourced 100')
}

// 6. averageQuotesPerDecision rounds correctly — 3 decisions with 4, 2, 3 quotes = 9/3 = 3
{
  const r = projectShopSupplierSourcingSummary(state([
    decision({ qty: 10, quotes: [quote('A', 'r1'), quote('B', 'r2'), quote('C', 'r3'), quote('D', 'r4')], selectedRef: 'r1' }),
    decision({ qty: 10, quotes: [quote('A', 'r5'), quote('B', 'r6')], selectedRef: 'r5' }),
    decision({ qty: 10, quotes: [quote('A', 'r7'), quote('B', 'r8'), quote('C', 'r9')], selectedRef: 'r7' }),
  ]))
  check(r.totalQuotesEvaluated === 9, 'avg-quotes: totalQuotesEvaluated 9')
  check(r.averageQuotesPerDecision === 3, 'avg-quotes: 9/3=3 exactly')
}

// 7. averageQuotesPerDecision rounds — 2 decisions with 3+2=5 quotes → 5/2=2.5 → rounds to 3
{
  const r = projectShopSupplierSourcingSummary(state([
    decision({ qty: 10, quotes: [quote('A', 'r10'), quote('B', 'r11'), quote('C', 'r12')], selectedRef: 'r10' }),
    decision({ qty: 10, quotes: [quote('A', 'r13'), quote('B', 'r14')], selectedRef: 'r13' }),
  ]))
  check(r.averageQuotesPerDecision === 3, 'avg-round: Math.round(2.5)=3 (rounds half up)')
}

// 8. No matching selectedQuoteReference → no bySupplier entry for that decision
{
  const r = projectShopSupplierSourcingSummary(state([
    decision({ qty: 50, quotes: [quote('Sup-X', 'Q-X1')], selectedRef: 'Q-MISSING' }),
  ]))
  check(r.totalDecisions === 1, 'no-match: totalDecisions 1')
  check(r.bySupplier.length === 0, 'no-match: no bySupplier entry for unmatched selected ref')
}

// 9. One supplier wins multiple decisions
{
  const r = projectShopSupplierSourcingSummary(state([
    decision({ sku: 'SKU-A', qty: 100, quotes: [quote('Sup-Alpha', 'Q-1'), quote('Sup-Beta', 'Q-2')], selectedRef: 'Q-1' }),
    decision({ sku: 'SKU-B', qty: 50, quotes: [quote('Sup-Alpha', 'Q-3'), quote('Sup-Gamma', 'Q-4')], selectedRef: 'Q-3' }),
    decision({ sku: 'SKU-C', qty: 25, quotes: [quote('Sup-Alpha', 'Q-5')], selectedRef: 'Q-5' }),
  ]))
  check(r.bySupplier.length === 1, 'one-supplier: only Sup-Alpha wins')
  check(r.bySupplier[0].supplier === 'Sup-Alpha', 'one-supplier: name correct')
  check(r.bySupplier[0].winsCount === 3, 'one-supplier: winsCount 3')
  check(r.bySupplier[0].totalQuantityWon === 175, 'one-supplier: totalQuantityWon 175')
}

// 10. Sort: bySupplier sorted desc by winsCount
{
  const r = projectShopSupplierSourcingSummary(state([
    decision({ qty: 10, quotes: [quote('Sup-A', 'q1')], selectedRef: 'q1' }),
    decision({ qty: 10, quotes: [quote('Sup-B', 'q2')], selectedRef: 'q2' }),
    decision({ qty: 10, quotes: [quote('Sup-B', 'q3')], selectedRef: 'q3' }),
    decision({ qty: 10, quotes: [quote('Sup-B', 'q4')], selectedRef: 'q4' }),
  ]))
  check(r.bySupplier[0].supplier === 'Sup-B', 'sort: Sup-B first (3 wins)')
  check(r.bySupplier[0].winsCount === 3, 'sort: Sup-B winsCount 3')
  check(r.bySupplier[1].supplier === 'Sup-A', 'sort: Sup-A second (1 win)')
}

// 11. Tie-break alpha: same winsCount → alphabetical supplier
{
  const r = projectShopSupplierSourcingSummary(state([
    decision({ qty: 20, quotes: [quote('Zebra-Supply', 'q5')], selectedRef: 'q5' }),
    decision({ qty: 20, quotes: [quote('Alpha-Supply', 'q6')], selectedRef: 'q6' }),
  ]))
  check(r.bySupplier[0].supplier === 'Alpha-Supply', 'tie: Alpha-Supply before Zebra-Supply')
  check(r.bySupplier[1].supplier === 'Zebra-Supply', 'tie: Zebra-Supply second')
}

// 12. totalQuantityWon accumulates per supplier across decisions
{
  const r = projectShopSupplierSourcingSummary(state([
    decision({ qty: 200, quotes: [quote('Sup-X', 'qx1'), quote('Sup-Y', 'qy1')], selectedRef: 'qx1' }),
    decision({ qty: 300, quotes: [quote('Sup-X', 'qx2'), quote('Sup-Y', 'qy2')], selectedRef: 'qy2' }),
    decision({ qty: 400, quotes: [quote('Sup-X', 'qx3')], selectedRef: 'qx3' }),
  ]))
  const supX = r.bySupplier.find(s => s.supplier === 'Sup-X')
  const supY = r.bySupplier.find(s => s.supplier === 'Sup-Y')
  check(supX?.winsCount === 2, 'qty-won: Sup-X winsCount 2')
  check(supX?.totalQuantityWon === 600, 'qty-won: Sup-X totalQuantityWon 200+400=600')
  check(supY?.winsCount === 1, 'qty-won: Sup-Y winsCount 1')
  check(supY?.totalQuantityWon === 300, 'qty-won: Sup-Y totalQuantityWon 300')
}

console.log(JSON.stringify({ ok: true, checks }))
