// Shop inventory movement summary: byKind counts, totalQuantityIn/Out,
// and top-5 SKUs by totalMovements from CommerceState.movements.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopInventoryMovementSummary } from './shop-inventory-movement-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/inv-movement-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopInventoryMovementSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let seq = 0
function mvmt(kind, sku, quantityDelta) {
  seq++
  return { id: `m${seq}`, actionId: `a${seq}`, createdAt: '2026-08-11T08:00:00.000Z', actor: 'op1', reason: 'stock', evidenceReference: 'ref1', kind, sku, quantityDelta }
}

function state(movements = []) {
  return { items: [], orders: [], movements, closes: [], catalogBaselines: [], catalogChanges: [], promotionPolicies: [], shippingPolicies: [], paymentPolicies: [], websiteIntakes: [], storefrontRequests: [], purchaseBudgetEnvelopes: [], supplierSourcingDecisions: [], purchaseOrders: [] }
}

// 1. Empty state → all zeros, byKind all zeros
{
  const r = projectShopInventoryMovementSummary(state())
  check(r.totalMovements === 0, 'empty: totalMovements 0')
  check(r.totalQuantityIn === 0, 'empty: totalQuantityIn 0')
  check(r.totalQuantityOut === 0, 'empty: totalQuantityOut 0')
  check(r.topMoversbyActivity.length === 0, 'empty: topMovers empty')
  check(r.byKind.reserve === 0, 'empty: byKind.reserve 0')
  check(r.byKind.receipt === 0, 'empty: byKind.receipt 0')
}

// 2. byKind counts
{
  const r = projectShopInventoryMovementSummary(state([
    mvmt('reserve', 'SKU-A', -2),
    mvmt('reserve', 'SKU-A', -1),
    mvmt('release', 'SKU-A', 1),
    mvmt('receipt', 'SKU-B', 10),
    mvmt('opening', 'SKU-C', 50),
    mvmt('count', 'SKU-A', 0),
    mvmt('return', 'SKU-A', 1),
    mvmt('production_issue', 'SKU-B', -5),
    mvmt('production_return', 'SKU-B', 2),
    mvmt('production_receipt', 'SKU-D', 20),
  ]))
  check(r.byKind.reserve === 2, 'byKind: reserve 2')
  check(r.byKind.release === 1, 'byKind: release 1')
  check(r.byKind.receipt === 1, 'byKind: receipt 1')
  check(r.byKind.opening === 1, 'byKind: opening 1')
  check(r.byKind.count === 1, 'byKind: count 1')
  check(r.byKind.return === 1, 'byKind: return 1')
  check(r.byKind.production_issue === 1, 'byKind: production_issue 1')
  check(r.byKind.production_return === 1, 'byKind: production_return 1')
  check(r.byKind.production_receipt === 1, 'byKind: production_receipt 1')
  check(r.totalMovements === 10, 'byKind: totalMovements 10')
}

// 3. totalQuantityIn: sum of positive deltas only
{
  const r = projectShopInventoryMovementSummary(state([
    mvmt('receipt', 'SKU-A', 10),
    mvmt('receipt', 'SKU-B', 20),
    mvmt('reserve', 'SKU-A', -5),
  ]))
  check(r.totalQuantityIn === 30, 'qty-in: 30')
  check(r.totalQuantityOut === 5, 'qty-out: 5')
}

// 4. Zero-delta movements don't affect in or out
{
  const r = projectShopInventoryMovementSummary(state([
    mvmt('count', 'SKU-A', 0),
  ]))
  check(r.totalQuantityIn === 0, 'zero-delta: no in')
  check(r.totalQuantityOut === 0, 'zero-delta: no out')
}

// 5. netQuantityDelta per SKU: sum of all deltas for that SKU
{
  const r = projectShopInventoryMovementSummary(state([
    mvmt('receipt', 'SKU-A', 10),
    mvmt('reserve', 'SKU-A', -3),
    mvmt('release', 'SKU-A', 1),
  ]))
  const skuA = r.topMoversbyActivity.find(m => m.sku === 'SKU-A')
  check(skuA?.netQuantityDelta === 8, 'net: SKU-A netDelta 10-3+1=8')
  check(skuA?.totalMovements === 3, 'net: SKU-A totalMovements 3')
}

// 6. topMoversbyActivity sorted by totalMovements desc
{
  const r = projectShopInventoryMovementSummary(state([
    mvmt('reserve', 'SKU-A', -1),
    mvmt('receipt', 'SKU-B', 10),
    mvmt('reserve', 'SKU-B', -2),
    mvmt('release', 'SKU-B', 1),
  ]))
  check(r.topMoversbyActivity[0].sku === 'SKU-B', 'sort: SKU-B first (3 movements)')
  check(r.topMoversbyActivity[1].sku === 'SKU-A', 'sort: SKU-A second (1 movement)')
}

// 7. Tie-break on sku alpha
{
  const r = projectShopInventoryMovementSummary(state([
    mvmt('reserve', 'Z-SKU', -1),
    mvmt('reserve', 'A-SKU', -1),
  ]))
  check(r.topMoversbyActivity[0].sku === 'A-SKU', 'tie-break: A-SKU before Z-SKU')
  check(r.topMoversbyActivity[1].sku === 'Z-SKU', 'tie-break: Z-SKU after A-SKU')
}

// 8. topMoversbyActivity capped at 5
{
  const movements = ['SKU-1', 'SKU-2', 'SKU-3', 'SKU-4', 'SKU-5', 'SKU-6'].map(
    (sku) => mvmt('receipt', sku, 10)
  )
  const r = projectShopInventoryMovementSummary(state(movements))
  check(r.topMoversbyActivity.length === 5, 'cap: topMovers capped at 5')
}

// 9. Single movement of each in/out type
{
  const r = projectShopInventoryMovementSummary(state([
    mvmt('opening', 'SKU-A', 100),   // in
    mvmt('reserve', 'SKU-A', -30),   // out
  ]))
  check(r.totalQuantityIn === 100, 'single: in 100')
  check(r.totalQuantityOut === 30, 'single: out 30')
}

console.log(JSON.stringify({ ok: true, checks }))
