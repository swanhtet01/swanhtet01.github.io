// Shop item sales velocity brief: top items by quantity/revenue, zero-sales count.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopItemSalesVelocityBrief } from './shop-item-sales-velocity-brief.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shop-item-sales-velocity-brief-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopItemSalesVelocityBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

function item(sku, price = 10000) {
  return { sku, name: `Item ${sku}`, onHand: 10, reorderAt: 5, price }
}

function order({ id = 'ORD-1', itemSku = 'SKU-A', quantity = 1, total = 10000, status = 'confirmed' } = {}) {
  return {
    id, createdAt: '2026-01-01T00:00:00Z', customer: 'cust-1', channel: 'counter',
    item: itemSku, quantity, payment: 'cash',
    paymentStatus: 'pending', refundStatus: 'none', total, status,
  }
}

function state(items = [], orders = []) {
  return { schema: SCHEMA, items, orders, movements: [], closes: [] }
}

// 1. Empty state
{
  const r = projectShopItemSalesVelocityBrief(state([], []))
  check(r.totalItemsInCatalog === 0, 'empty: totalItemsInCatalog 0')
  check(r.itemsWithSales === 0, 'empty: itemsWithSales 0')
  check(r.itemsWithZeroSales === 0, 'empty: itemsWithZeroSales 0')
  check(r.totalUnitsSold === 0, 'empty: totalUnitsSold 0')
  check(r.totalSalesRevenueMmk === 0, 'empty: totalSalesRevenueMmk 0')
  check(r.topItemsByQuantity.length === 0, 'empty: topItemsByQuantity empty')
  check(r.topItemsByRevenue.length === 0, 'empty: topItemsByRevenue empty')
}

// 2. Catalog with no orders
{
  const r = projectShopItemSalesVelocityBrief(state([item('SKU-A'), item('SKU-B')], []))
  check(r.totalItemsInCatalog === 2, 'no-orders: totalItemsInCatalog 2')
  check(r.itemsWithZeroSales === 2, 'no-orders: itemsWithZeroSales 2')
  check(r.itemsWithSales === 0, 'no-orders: itemsWithSales 0')
}

// 3. Single order
{
  const r = projectShopItemSalesVelocityBrief(state(
    [item('SKU-A')],
    [order({ id: 'ORD-1', itemSku: 'SKU-A', quantity: 3, total: 30000 })]
  ))
  check(r.itemsWithSales === 1, 'single: itemsWithSales 1')
  check(r.totalUnitsSold === 3, 'single: totalUnitsSold 3')
  check(r.totalSalesRevenueMmk === 30000, 'single: totalSalesRevenueMmk 30000')
  check(r.topItemsByQuantity[0].item === 'SKU-A', 'single: topByQty[0] SKU-A')
  check(r.topItemsByQuantity[0].totalQuantitySold === 3, 'single: topByQty[0] qty 3')
}

// 4. Cancelled orders excluded
{
  const r = projectShopItemSalesVelocityBrief(state(
    [item('SKU-A')],
    [
      order({ id: 'ORD-1', itemSku: 'SKU-A', quantity: 2, total: 20000, status: 'confirmed' }),
      order({ id: 'ORD-2', itemSku: 'SKU-A', quantity: 5, total: 50000, status: 'cancelled' }),
    ]
  ))
  check(r.totalUnitsSold === 2, 'cancelled-excluded: totalUnitsSold 2')
  check(r.totalSalesRevenueMmk === 20000, 'cancelled-excluded: totalSalesRevenueMmk 20000')
}

// 5. topItemsByQuantity ranked correctly (2 items, different quantities)
{
  const r = projectShopItemSalesVelocityBrief(state(
    [item('SKU-A'), item('SKU-B')],
    [
      order({ id: 'ORD-1', itemSku: 'SKU-A', quantity: 1, total: 10000 }),
      order({ id: 'ORD-2', itemSku: 'SKU-B', quantity: 5, total: 25000 }),
    ]
  ))
  check(r.topItemsByQuantity[0].item === 'SKU-B', 'rank-qty: SKU-B first (5 units)')
  check(r.topItemsByQuantity[1].item === 'SKU-A', 'rank-qty: SKU-A second (1 unit)')
}

// 6. topItemsByRevenue ranked correctly (different revenue per unit)
{
  const r = projectShopItemSalesVelocityBrief(state(
    [item('SKU-A'), item('SKU-B')],
    [
      order({ id: 'ORD-1', itemSku: 'SKU-A', quantity: 10, total: 10000 }),
      order({ id: 'ORD-2', itemSku: 'SKU-B', quantity: 1, total: 50000 }),
    ]
  ))
  check(r.topItemsByRevenue[0].item === 'SKU-B', 'rank-rev: SKU-B first (50k revenue)')
  check(r.topItemsByRevenue[1].item === 'SKU-A', 'rank-rev: SKU-A second (10k revenue)')
}

// 7. itemsWithZeroSales: catalog items without any non-cancelled order
{
  const r = projectShopItemSalesVelocityBrief(state(
    [item('SKU-A'), item('SKU-B'), item('SKU-C')],
    [order({ id: 'ORD-1', itemSku: 'SKU-A', quantity: 1, total: 10000 })]
  ))
  check(r.itemsWithZeroSales === 2, 'zero-sales: SKU-B and SKU-C have zero sales')
  check(r.itemsWithSales === 1, 'zero-sales: only SKU-A has sales')
}

// 8. Multiple orders for same item accumulate correctly
{
  const r = projectShopItemSalesVelocityBrief(state(
    [item('SKU-A')],
    [
      order({ id: 'ORD-1', itemSku: 'SKU-A', quantity: 2, total: 20000 }),
      order({ id: 'ORD-2', itemSku: 'SKU-A', quantity: 3, total: 30000 }),
    ]
  ))
  check(r.totalUnitsSold === 5, 'accum: totalUnitsSold 5')
  check(r.totalSalesRevenueMmk === 50000, 'accum: totalSalesRevenueMmk 50000')
  check(r.topItemsByQuantity[0].totalQuantitySold === 5, 'accum: SKU-A totalQuantitySold 5')
}

// 9. topItemsByQuantity capped at 5
{
  const items = ['A','B','C','D','E','F'].map(s => item(`SKU-${s}`))
  const orders = ['A','B','C','D','E','F'].map((s, i) =>
    order({ id: `ORD-${i}`, itemSku: `SKU-${s}`, quantity: i + 1, total: (i + 1) * 10000 })
  )
  const r = projectShopItemSalesVelocityBrief(state(items, orders))
  check(r.topItemsByQuantity.length === 5, 'cap5-qty: topItemsByQuantity capped at 5')
  check(r.topItemsByRevenue.length === 5, 'cap5-rev: topItemsByRevenue capped at 5')
  check(r.itemsWithSales === 6, 'cap5: itemsWithSales still 6 (not capped)')
}

console.log(JSON.stringify({ ok: true, checks }))
