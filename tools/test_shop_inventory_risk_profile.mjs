// Shop inventory risk profile: itemsAtZero, itemsBelowReorder, reorderHealthRate, topZeroStockSkus.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopInventoryRiskProfile } from './shop-inventory-risk-profile.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shop-inventory-risk-profile-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopInventoryRiskProfile } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

function item({ sku = 'SKU-1', onHand = 10, reorderAt = 5, price = 1000 } = {}) {
  return { sku, name: sku, onHand, reorderAt, price }
}

function state(items = []) {
  return { schema: SCHEMA, items, orders: [], movements: [], closes: [] }
}

// 1. Empty items → all zero, empty skus
{
  const r = projectShopInventoryRiskProfile(state([]))
  check(r.totalItems === 0, 'empty: totalItems 0')
  check(r.itemsAtZero === 0, 'empty: itemsAtZero 0')
  check(r.itemsBelowReorder === 0, 'empty: itemsBelowReorder 0')
  check(r.itemsHealthy === 0, 'empty: itemsHealthy 0')
  check(r.reorderHealthRate === 0, 'empty: reorderHealthRate 0')
  check(r.topZeroStockSkus.length === 0, 'empty: topZeroStockSkus empty')
}

// 2. All healthy items → reorderHealthRate 100
{
  const r = projectShopInventoryRiskProfile(state([
    item({ sku: 'A', onHand: 20, reorderAt: 5 }),
    item({ sku: 'B', onHand: 50, reorderAt: 10 }),
  ]))
  check(r.itemsHealthy === 2, 'healthy: itemsHealthy 2')
  check(r.reorderHealthRate === 100, 'healthy: reorderHealthRate 100')
}

// 3. Some items below reorder (not zero)
{
  const r = projectShopInventoryRiskProfile(state([
    item({ sku: 'A', onHand: 3, reorderAt: 5 }),  // below reorder, not zero
    item({ sku: 'B', onHand: 20, reorderAt: 5 }), // healthy
  ]))
  check(r.totalItems === 2, 'below-reorder: totalItems 2')
  check(r.itemsBelowReorder === 1, 'below-reorder: itemsBelowReorder 1')
  check(r.itemsHealthy === 1, 'below-reorder: itemsHealthy 1')
  check(r.reorderHealthRate === 50, 'below-reorder: reorderHealthRate 50')
}

// 4. Items at zero (stockout)
{
  const r = projectShopInventoryRiskProfile(state([
    item({ sku: 'OUT-1', onHand: 0, reorderAt: 5 }),
    item({ sku: 'OUT-2', onHand: 0, reorderAt: 10 }),
    item({ sku: 'GOOD', onHand: 50, reorderAt: 5 }),
  ]))
  check(r.itemsAtZero === 2, 'zero: itemsAtZero 2')
  check(r.topZeroStockSkus.length === 2, 'zero: topZeroStockSkus 2 entries')
  check(r.topZeroStockSkus.includes('OUT-1'), 'zero: topZeroStockSkus includes OUT-1')
  check(r.topZeroStockSkus.includes('OUT-2'), 'zero: topZeroStockSkus includes OUT-2')
}

// 5. topZeroStockSkus capped at 5
{
  const r = projectShopInventoryRiskProfile(state([
    item({ sku: 'Z1', onHand: 0, reorderAt: 1 }),
    item({ sku: 'Z2', onHand: 0, reorderAt: 1 }),
    item({ sku: 'Z3', onHand: 0, reorderAt: 1 }),
    item({ sku: 'Z4', onHand: 0, reorderAt: 1 }),
    item({ sku: 'Z5', onHand: 0, reorderAt: 1 }),
    item({ sku: 'Z6', onHand: 0, reorderAt: 1 }),
  ]))
  check(r.topZeroStockSkus.length === 5, 'cap5: topZeroStockSkus capped at 5')
  check(r.itemsAtZero === 6, 'cap5: itemsAtZero still 6 (not capped)')
}

// 6. reorderHealthRate rounds correctly (2/3 = 66.6 → 67)
{
  const r = projectShopInventoryRiskProfile(state([
    item({ sku: 'A', onHand: 10, reorderAt: 5 }),
    item({ sku: 'B', onHand: 10, reorderAt: 5 }),
    item({ sku: 'C', onHand: 2, reorderAt: 5 }), // below reorder
  ]))
  check(r.reorderHealthRate === 67, 'round: reorderHealthRate 67 (round(2/3 * 100))')
}

// 7. Zero is also below reorder (onHand === 0 < reorderAt → both itemsAtZero and itemsBelowReorder)
{
  const r = projectShopInventoryRiskProfile(state([
    item({ sku: 'OUT', onHand: 0, reorderAt: 5 }),
  ]))
  check(r.itemsAtZero === 1, 'zero-is-below: itemsAtZero 1')
  check(r.itemsBelowReorder === 1, 'zero-is-below: itemsBelowReorder 1 (0 < 5)')
  check(r.itemsHealthy === 0, 'zero-is-below: itemsHealthy 0')
}

console.log(JSON.stringify({ ok: true, checks }))
