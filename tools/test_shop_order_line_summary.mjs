// Shop order line summary: ordersWithLines, totalLineItems, totalQuantityFromLines, uniqueSkusFromLines, topSkuByQuantity.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderLineSummary } from './shop-order-line-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shop-order-line-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopOrderLineSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

function line({ sku = 'SKU-A', quantity = 1, unitPriceMmk = 1000, name = 'Item' } = {}) {
  return { sku, name, quantity, unitPriceMmk }
}

function order({ lines = undefined, id = 'ORD-1' } = {}) {
  return {
    id, createdAt: '2026-01-01T00:00:00Z', customer: 'cust-1', channel: 'counter',
    item: 'item-1', quantity: 1, payment: 'cash',
    paymentStatus: 'pending', refundStatus: 'none', total: 1000, status: 'confirmed',
    ...(lines !== undefined ? { lines } : {}),
  }
}

function state(orders = []) {
  return { schema: SCHEMA, items: [], orders, movements: [], closes: [] }
}

// 1. No orders → all defaults
{
  const r = projectShopOrderLineSummary(state([]))
  check(r.ordersWithLines === 0, 'empty: ordersWithLines 0')
  check(r.totalLineItems === 0, 'empty: totalLineItems 0')
  check(r.totalQuantityFromLines === 0, 'empty: totalQuantityFromLines 0')
  check(r.uniqueSkusFromLines === 0, 'empty: uniqueSkusFromLines 0')
  check(r.topSkuByQuantity === null, 'empty: topSkuByQuantity null')
}

// 2. Orders without lines (lines field absent)
{
  const r = projectShopOrderLineSummary(state([
    order({ id: 'ORD-1' }),
    order({ id: 'ORD-2' }),
  ]))
  check(r.ordersWithLines === 0, 'no-lines: ordersWithLines 0')
  check(r.totalLineItems === 0, 'no-lines: totalLineItems 0')
  check(r.topSkuByQuantity === null, 'no-lines: topSkuByQuantity null')
  check(r.uniqueSkusFromLines === 0, 'no-lines: uniqueSkusFromLines 0')
}

// 3. Single order with 2 lines
{
  const r = projectShopOrderLineSummary(state([
    order({ id: 'ORD-1', lines: [
      line({ sku: 'SKU-A', quantity: 3 }),
      line({ sku: 'SKU-B', quantity: 2 }),
    ]}),
  ]))
  check(r.ordersWithLines === 1, 'one-order: ordersWithLines 1')
  check(r.totalLineItems === 2, 'one-order: totalLineItems 2')
  check(r.totalQuantityFromLines === 5, 'one-order: totalQuantityFromLines 5')
  check(r.uniqueSkusFromLines === 2, 'one-order: uniqueSkusFromLines 2')
  check(r.topSkuByQuantity === 'SKU-A', 'one-order: topSkuByQuantity SKU-A (qty 3 > 2)')
}

// 4. Two orders, each with lines
{
  const r = projectShopOrderLineSummary(state([
    order({ id: 'ORD-1', lines: [line({ sku: 'SKU-A', quantity: 5 })] }),
    order({ id: 'ORD-2', lines: [line({ sku: 'SKU-B', quantity: 1 })] }),
  ]))
  check(r.ordersWithLines === 2, '2orders: ordersWithLines 2')
  check(r.totalLineItems === 2, '2orders: totalLineItems 2')
  check(r.totalQuantityFromLines === 6, '2orders: totalQuantityFromLines 6')
}

// 5. uniqueSkusFromLines dedup across orders
{
  const r = projectShopOrderLineSummary(state([
    order({ id: 'ORD-1', lines: [line({ sku: 'SKU-A', quantity: 2 })] }),
    order({ id: 'ORD-2', lines: [line({ sku: 'SKU-A', quantity: 3 })] }),
  ]))
  check(r.uniqueSkusFromLines === 1, 'dedup: uniqueSkusFromLines 1')
  check(r.totalQuantityFromLines === 5, 'dedup: totalQuantityFromLines 5 (2+3)')
}

// 6. topSkuByQuantity picks highest total across orders
{
  const r = projectShopOrderLineSummary(state([
    order({ id: 'ORD-1', lines: [
      line({ sku: 'SKU-A', quantity: 2 }),
      line({ sku: 'SKU-B', quantity: 10 }),
    ]}),
  ]))
  check(r.topSkuByQuantity === 'SKU-B', 'top: topSkuByQuantity SKU-B (qty 10 > 2)')
  check(r.uniqueSkusFromLines === 2, 'top: uniqueSkusFromLines 2')
}

// 7. Mixed: orders with and without lines — only with-lines orders counted
{
  const r = projectShopOrderLineSummary(state([
    order({ id: 'ORD-1' }),
    order({ id: 'ORD-2', lines: [line({ sku: 'SKU-C', quantity: 4 })] }),
    order({ id: 'ORD-3' }),
  ]))
  check(r.ordersWithLines === 1, 'mixed: ordersWithLines 1 (only ORD-2)')
  check(r.totalLineItems === 1, 'mixed: totalLineItems 1')
}

// 8. topSkuByQuantity ties broken by lexicographic order
{
  const r = projectShopOrderLineSummary(state([
    order({ id: 'ORD-1', lines: [
      line({ sku: 'SKU-B', quantity: 5 }),
      line({ sku: 'SKU-A', quantity: 5 }),
    ]}),
  ]))
  check(r.topSkuByQuantity === 'SKU-A', 'tie: topSkuByQuantity SKU-A (lex earlier at equal qty)')
}

// 9. totalQuantityFromLines with multiple orders and lines
{
  const r = projectShopOrderLineSummary(state([
    order({ id: 'ORD-1', lines: [line({ sku: 'X', quantity: 10 }), line({ sku: 'Y', quantity: 3 })] }),
    order({ id: 'ORD-2', lines: [line({ sku: 'X', quantity: 7 })] }),
  ]))
  check(r.totalLineItems === 3, 'multi: totalLineItems 3')
  check(r.totalQuantityFromLines === 20, 'multi: totalQuantityFromLines 20')
}

console.log(JSON.stringify({ ok: true, checks }))
