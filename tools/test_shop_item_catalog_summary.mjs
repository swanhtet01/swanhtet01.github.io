// Shop item catalog summary: totalItems, uniqueSkus, totalOnHand, itemsBelowReorder, averagePriceMmk, highestPriceMmk.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopItemCatalogSummary } from './shop-item-catalog-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shop-item-catalog-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopItemCatalogSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

function item({ sku = 'SKU-001', onHand = 10, reorderAt = 5, price = 1000, name = 'Item' } = {}) {
  return { sku, name, onHand, reorderAt, price }
}

function state(items = []) {
  return { schema: SCHEMA, items, orders: [], movements: [], closes: [] }
}

// 1. Empty items
{
  const r = projectShopItemCatalogSummary(state([]))
  check(r.totalItems === 0, 'empty: totalItems 0')
  check(r.uniqueSkus === 0, 'empty: uniqueSkus 0')
  check(r.totalOnHand === 0, 'empty: totalOnHand 0')
  check(r.itemsBelowReorder === 0, 'empty: itemsBelowReorder 0')
  check(r.averagePriceMmk === 0, 'empty: averagePriceMmk 0')
  check(r.highestPriceMmk === 0, 'empty: highestPriceMmk 0')
}

// 2. Single item above reorder
{
  const r = projectShopItemCatalogSummary(state([
    item({ sku: 'A', onHand: 10, reorderAt: 5, price: 1000 }),
  ]))
  check(r.totalItems === 1, 'single: totalItems 1')
  check(r.uniqueSkus === 1, 'single: uniqueSkus 1')
  check(r.totalOnHand === 10, 'single: totalOnHand 10')
  check(r.itemsBelowReorder === 0, 'single: itemsBelowReorder 0')
  check(r.averagePriceMmk === 1000, 'single: averagePriceMmk 1000')
  check(r.highestPriceMmk === 1000, 'single: highestPriceMmk 1000')
}

// 3. Single item below reorder (onHand < reorderAt)
{
  const r = projectShopItemCatalogSummary(state([
    item({ onHand: 3, reorderAt: 5 }),
  ]))
  check(r.itemsBelowReorder === 1, 'below-reorder: itemsBelowReorder 1')
}

// 4. At exactly reorderAt → NOT below (onHand === reorderAt is not < reorderAt)
{
  const r = projectShopItemCatalogSummary(state([
    item({ onHand: 5, reorderAt: 5 }),
  ]))
  check(r.itemsBelowReorder === 0, 'at-reorder: itemsBelowReorder 0')
}

// 5. Two items, different prices
{
  const r = projectShopItemCatalogSummary(state([
    item({ sku: 'A', price: 1000, onHand: 5, reorderAt: 10 }),
    item({ sku: 'B', price: 2000, onHand: 5, reorderAt: 10 }),
  ]))
  check(r.totalItems === 2, '2items: totalItems 2')
  check(r.averagePriceMmk === 1500, '2items: averagePriceMmk 1500')
  check(r.highestPriceMmk === 2000, '2items: highestPriceMmk 2000')
}

// 6. totalOnHand sums correctly
{
  const r = projectShopItemCatalogSummary(state([
    item({ sku: 'A', onHand: 5, reorderAt: 1 }),
    item({ sku: 'B', onHand: 8, reorderAt: 1 }),
  ]))
  check(r.totalOnHand === 13, 'sum: totalOnHand 13')
}

// 7. uniqueSkus deduplication (2 items same sku)
{
  const r = projectShopItemCatalogSummary(state([
    item({ sku: 'DUPE', onHand: 5, reorderAt: 1 }),
    item({ sku: 'DUPE', onHand: 3, reorderAt: 1 }),
  ]))
  check(r.totalItems === 2, 'dedup: totalItems 2')
  check(r.uniqueSkus === 1, 'dedup: uniqueSkus 1')
}

// 8. 3 items: 2 below reorder
{
  const r = projectShopItemCatalogSummary(state([
    item({ sku: 'A', onHand: 2, reorderAt: 5 }),
    item({ sku: 'B', onHand: 10, reorderAt: 5 }),
    item({ sku: 'C', onHand: 1, reorderAt: 5 }),
  ]))
  check(r.totalItems === 3, '3items: totalItems 3')
  check(r.itemsBelowReorder === 2, '3items: itemsBelowReorder 2')
}

// 9. highestPriceMmk picks max of 3
{
  const r = projectShopItemCatalogSummary(state([
    item({ sku: 'A', price: 500 }),
    item({ sku: 'B', price: 3000 }),
    item({ sku: 'C', price: 1200 }),
  ]))
  check(r.highestPriceMmk === 3000, 'max-price: highestPriceMmk 3000')
}

// 10. averagePriceMmk rounds: 3 items 100+100+200 = 400 / 3 = 133.33 → 133
{
  const r = projectShopItemCatalogSummary(state([
    item({ sku: 'A', price: 100 }),
    item({ sku: 'B', price: 100 }),
    item({ sku: 'C', price: 200 }),
  ]))
  check(r.averagePriceMmk === 133, 'avg-round: averagePriceMmk 133')
}

console.log(JSON.stringify({ ok: true, checks }))
