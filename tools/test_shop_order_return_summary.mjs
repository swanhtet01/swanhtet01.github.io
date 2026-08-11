// Shop order return summary: ordersWithReturns, totalReturns, totalQuantityReturned, byDisposition, uniqueSkusReturned.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderReturnSummary } from './shop-order-return-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shop-order-return-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopOrderReturnSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

function ret({ sku = 'SKU-A', quantity = 1, disposition = 'restock', actionId = 'ACT-1' } = {}) {
  return { actionId, createdAt: '2026-01-01T00:00:00Z', actor: 'alice', reason: 'test', evidenceReference: 'ref-1', sku, quantity, disposition }
}

function order({ returns = undefined, id = 'ORD-1' } = {}) {
  return {
    id, createdAt: '2026-01-01T00:00:00Z', customer: 'cust-1', channel: 'counter',
    item: 'item-1', quantity: 1, payment: 'cash',
    paymentStatus: 'pending', refundStatus: 'none', total: 1000, status: 'confirmed',
    ...(returns !== undefined ? { returns } : {}),
  }
}

function state(orders = []) {
  return { schema: SCHEMA, items: [], orders, movements: [], closes: [] }
}

// 1. No orders → all defaults
{
  const r = projectShopOrderReturnSummary(state([]))
  check(r.ordersWithReturns === 0, 'empty: ordersWithReturns 0')
  check(r.totalReturns === 0, 'empty: totalReturns 0')
  check(r.totalQuantityReturned === 0, 'empty: totalQuantityReturned 0')
  check(r.byDisposition.restock === 0, 'empty: byDisposition.restock 0')
  check(r.byDisposition.not_restocked === 0, 'empty: byDisposition.not_restocked 0')
  check(r.uniqueSkusReturned === 0, 'empty: uniqueSkusReturned 0')
}

// 2. Orders without returns
{
  const r = projectShopOrderReturnSummary(state([
    order({ id: 'ORD-1' }),
    order({ id: 'ORD-2' }),
  ]))
  check(r.ordersWithReturns === 0, 'no-returns: ordersWithReturns 0')
  check(r.totalReturns === 0, 'no-returns: totalReturns 0')
}

// 3. Single order with 1 restock return
{
  const r = projectShopOrderReturnSummary(state([
    order({ id: 'ORD-1', returns: [ret({ sku: 'SKU-A', quantity: 3, disposition: 'restock' })] }),
  ]))
  check(r.ordersWithReturns === 1, 'one-return: ordersWithReturns 1')
  check(r.totalReturns === 1, 'one-return: totalReturns 1')
  check(r.totalQuantityReturned === 3, 'one-return: totalQuantityReturned 3')
  check(r.byDisposition.restock === 1, 'one-return: byDisposition.restock 1')
  check(r.byDisposition.not_restocked === 0, 'one-return: byDisposition.not_restocked 0')
  check(r.uniqueSkusReturned === 1, 'one-return: uniqueSkusReturned 1')
}

// 4. not_restocked disposition
{
  const r = projectShopOrderReturnSummary(state([
    order({ id: 'ORD-1', returns: [ret({ disposition: 'not_restocked', quantity: 2 })] }),
  ]))
  check(r.byDisposition.not_restocked === 1, 'not-restock: byDisposition.not_restocked 1')
  check(r.byDisposition.restock === 0, 'not-restock: byDisposition.restock 0')
}

// 5. Mixed returns: two dispositions in one order
{
  const r = projectShopOrderReturnSummary(state([
    order({ id: 'ORD-1', returns: [
      ret({ sku: 'SKU-A', quantity: 2, disposition: 'restock', actionId: 'ACT-1' }),
      ret({ sku: 'SKU-B', quantity: 1, disposition: 'not_restocked', actionId: 'ACT-2' }),
    ]}),
  ]))
  check(r.totalReturns === 2, 'mixed: totalReturns 2')
  check(r.totalQuantityReturned === 3, 'mixed: totalQuantityReturned 3')
  check(r.byDisposition.restock === 1, 'mixed: restock 1')
  check(r.byDisposition.not_restocked === 1, 'mixed: not_restocked 1')
  check(r.uniqueSkusReturned === 2, 'mixed: uniqueSkusReturned 2')
}

// 6. SKU deduplication across orders
{
  const r = projectShopOrderReturnSummary(state([
    order({ id: 'ORD-1', returns: [ret({ sku: 'SKU-X', quantity: 1, actionId: 'A1' })] }),
    order({ id: 'ORD-2', returns: [ret({ sku: 'SKU-X', quantity: 2, actionId: 'A2' })] }),
  ]))
  check(r.ordersWithReturns === 2, 'dedup: ordersWithReturns 2')
  check(r.uniqueSkusReturned === 1, 'dedup: uniqueSkusReturned 1')
  check(r.totalQuantityReturned === 3, 'dedup: totalQuantityReturned 3')
}

// 7. Mixed orders: with and without returns
{
  const r = projectShopOrderReturnSummary(state([
    order({ id: 'ORD-1' }),
    order({ id: 'ORD-2', returns: [ret({ quantity: 5 })] }),
    order({ id: 'ORD-3' }),
  ]))
  check(r.ordersWithReturns === 1, 'mix: ordersWithReturns 1')
  check(r.totalQuantityReturned === 5, 'mix: totalQuantityReturned 5')
}

console.log(JSON.stringify({ ok: true, checks }))
