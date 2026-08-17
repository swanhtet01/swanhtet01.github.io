// Shop purchase requisition summary: totalRequisitions, uniqueSuppliers, uniqueSkus,
// totalQuantityRequested, totalValueMmk, averageUnitCostMmk, topSupplier, linkedToBudget.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopPurchaseRequisitionSummary } from './shop-purchase-requisition-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/purchase-requisition-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopPurchaseRequisitionSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const PROOF = { actionId: 'act1', capturedAt: '2026-08-11T08:00:00.000Z', actor: 'op1' }
let seq = 0

function requisition({ supplier = 'SUP-A', sku = 'SKU-1', quantityRequested = 5, unitCostMmk = 10_000, budgetEnvelopeId = undefined } = {}) {
  seq++
  return {
    id: `pr-${seq}`,
    ...(budgetEnvelopeId !== undefined ? { budgetEnvelopeId } : {}),
    createdAt: '2026-08-11T08:00:00.000Z',
    expectedAt: '2026-08-20T00:00:00.000Z',
    supplier,
    sku,
    quantityRequested,
    unitCostMmk,
    totalMmk: quantityRequested * unitCostMmk,
    sourceDecisionDigest: 'digest',
    sourceReplenishmentDigest: 'digest',
    approval: PROOF,
  }
}

function state(purchaseRequisitions = undefined) {
  return {
    items: [], orders: [], movements: [], closes: [],
    ...(purchaseRequisitions !== undefined ? { purchaseRequisitions } : {}),
  }
}

// 1. Empty state (no field) → all zeros, topSupplier null
{
  const r = projectShopPurchaseRequisitionSummary(state())
  check(r.totalRequisitions === 0, 'empty: totalRequisitions 0')
  check(r.uniqueSuppliers === 0, 'empty: uniqueSuppliers 0')
  check(r.uniqueSkus === 0, 'empty: uniqueSkus 0')
  check(r.totalQuantityRequested === 0, 'empty: totalQuantityRequested 0')
  check(r.totalValueMmk === 0, 'empty: totalValueMmk 0')
  check(r.averageUnitCostMmk === 0, 'empty: averageUnitCostMmk 0')
  check(r.topSupplier === null, 'empty: topSupplier null')
  check(r.linkedToBudget === 0, 'empty: linkedToBudget 0')
}

// 2. Empty array → totalRequisitions 0
{
  const r = projectShopPurchaseRequisitionSummary(state([]))
  check(r.totalRequisitions === 0, 'empty-array: totalRequisitions 0')
}

// 3. Single requisition, linked to budget
{
  const r = projectShopPurchaseRequisitionSummary(state([
    requisition({ supplier: 'SUP-A', sku: 'SKU-1', quantityRequested: 5, unitCostMmk: 10_000, budgetEnvelopeId: 'BUD-1' }),
  ]))
  check(r.totalRequisitions === 1, 'single: totalRequisitions 1')
  check(r.uniqueSuppliers === 1, 'single: uniqueSuppliers 1')
  check(r.uniqueSkus === 1, 'single: uniqueSkus 1')
  check(r.totalQuantityRequested === 5, 'single: totalQuantityRequested 5')
  check(r.totalValueMmk === 50_000, 'single: totalValueMmk 5*10k=50k')
  check(r.averageUnitCostMmk === 10_000, 'single: averageUnitCostMmk 10000')
  check(r.topSupplier === 'SUP-A', 'single: topSupplier SUP-A')
  check(r.linkedToBudget === 1, 'single: linkedToBudget 1')
}

// 4. No budget link → linkedToBudget 0
{
  const r = projectShopPurchaseRequisitionSummary(state([
    requisition({ budgetEnvelopeId: undefined }),
  ]))
  check(r.linkedToBudget === 0, 'no-budget: linkedToBudget 0')
}

// 5. uniqueSuppliers dedup: same supplier 2 reqs → 1
{
  const r = projectShopPurchaseRequisitionSummary(state([
    requisition({ supplier: 'SUP-X' }),
    requisition({ supplier: 'SUP-X' }),
  ]))
  check(r.uniqueSuppliers === 1, 'dedup-sup: uniqueSuppliers 1')
  check(r.totalRequisitions === 2, 'dedup-sup: totalRequisitions 2')
}

// 6. uniqueSkus dedup: same sku 2 reqs → 1
{
  const r = projectShopPurchaseRequisitionSummary(state([
    requisition({ sku: 'SKU-Z' }),
    requisition({ sku: 'SKU-Z' }),
  ]))
  check(r.uniqueSkus === 1, 'dedup-sku: uniqueSkus 1')
}

// 7. totalQuantityRequested accumulates
{
  const r = projectShopPurchaseRequisitionSummary(state([
    requisition({ quantityRequested: 5 }),
    requisition({ quantityRequested: 3 }),
  ]))
  check(r.totalQuantityRequested === 8, 'qty-accum: 5+3=8')
}

// 8. totalValueMmk accumulates
{
  const r = projectShopPurchaseRequisitionSummary(state([
    requisition({ quantityRequested: 5, unitCostMmk: 10_000 }),
    requisition({ quantityRequested: 3, unitCostMmk: 10_000 }),
  ]))
  check(r.totalValueMmk === 80_000, 'value-accum: 50k+30k=80k')
}

// 9. topSupplier: most requisitions wins
{
  const r = projectShopPurchaseRequisitionSummary(state([
    requisition({ supplier: 'SUP-A' }),
    requisition({ supplier: 'SUP-B' }),
    requisition({ supplier: 'SUP-B' }),
  ]))
  check(r.topSupplier === 'SUP-B', 'top-sup: SUP-B (2) wins')
}

// 10. topSupplier: alpha tie-break (AAA < ZZZ)
{
  const r = projectShopPurchaseRequisitionSummary(state([
    requisition({ supplier: 'ZZZ' }),
    requisition({ supplier: 'AAA' }),
  ]))
  check(r.topSupplier === 'AAA', 'tie-sup: AAA < ZZZ')
}

// 11. linkedToBudget accumulates: 2 with budget, 1 without
{
  const r = projectShopPurchaseRequisitionSummary(state([
    requisition({ budgetEnvelopeId: 'BUD-1' }),
    requisition({ budgetEnvelopeId: 'BUD-2' }),
    requisition({ budgetEnvelopeId: undefined }),
  ]))
  check(r.linkedToBudget === 2, 'budget-accum: linkedToBudget 2')
}

// 12. averageUnitCostMmk: (10k + 20k) / 2 = 15k
{
  const r = projectShopPurchaseRequisitionSummary(state([
    requisition({ unitCostMmk: 10_000 }),
    requisition({ unitCostMmk: 20_000 }),
  ]))
  check(r.averageUnitCostMmk === 15_000, 'avg-cost: (10k+20k)/2=15k')
}

// 13. averageUnitCostMmk rounds: (10k + 11001) / 2 = 10500.5 → 10501
{
  const r = projectShopPurchaseRequisitionSummary(state([
    requisition({ unitCostMmk: 10_000 }),
    requisition({ unitCostMmk: 11_001 }),
  ]))
  check(r.averageUnitCostMmk === 10_501, 'avg-round: Math.round(10500.5)=10501')
}

// 14. Multiple distinct skus and suppliers
{
  const r = projectShopPurchaseRequisitionSummary(state([
    requisition({ supplier: 'SUP-1', sku: 'SKU-A' }),
    requisition({ supplier: 'SUP-2', sku: 'SKU-B' }),
    requisition({ supplier: 'SUP-3', sku: 'SKU-C' }),
  ]))
  check(r.uniqueSuppliers === 3, 'multi: uniqueSuppliers 3')
  check(r.uniqueSkus === 3, 'multi: uniqueSkus 3')
}

console.log(JSON.stringify({ ok: true, checks }))
