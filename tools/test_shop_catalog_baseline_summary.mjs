// Shop catalog baseline summary: totalBaselines, uniqueSkus, averagePriceMmk,
// highestPriceMmk, lowestPriceMmk, averageReorderAt.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopCatalogBaselineSummary } from './shop-catalog-baseline-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/catalog-baseline-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopCatalogBaselineSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const PROOF = { actionId: 'act1', capturedAt: '2026-08-11T08:00:00.000Z', actor: 'op1' }

function baseline({ sku = 'SKU-A', price = 10_000, reorderAt = 5 } = {}) {
  return { sku, price, reorderAt, proof: PROOF, anchorDigest: 'digest' }
}

function state(catalogBaselines = undefined) {
  return {
    items: [], orders: [], movements: [], closes: [],
    ...(catalogBaselines !== undefined ? { catalogBaselines } : {}),
  }
}

// 1. Empty state (no field) → all zeros
{
  const r = projectShopCatalogBaselineSummary(state())
  check(r.totalBaselines === 0, 'empty: totalBaselines 0')
  check(r.uniqueSkus === 0, 'empty: uniqueSkus 0')
  check(r.averagePriceMmk === 0, 'empty: averagePriceMmk 0')
  check(r.highestPriceMmk === 0, 'empty: highestPriceMmk 0')
  check(r.lowestPriceMmk === 0, 'empty: lowestPriceMmk 0')
  check(r.averageReorderAt === 0, 'empty: averageReorderAt 0')
}

// 2. Empty array → totalBaselines 0
{
  const r = projectShopCatalogBaselineSummary(state([]))
  check(r.totalBaselines === 0, 'empty-array: totalBaselines 0')
}

// 3. Single baseline
{
  const r = projectShopCatalogBaselineSummary(state([
    baseline({ sku: 'SKU-X', price: 10_000, reorderAt: 5 }),
  ]))
  check(r.totalBaselines === 1, 'single: totalBaselines 1')
  check(r.uniqueSkus === 1, 'single: uniqueSkus 1')
  check(r.averagePriceMmk === 10_000, 'single: averagePriceMmk 10000')
  check(r.highestPriceMmk === 10_000, 'single: highestPriceMmk 10000')
  check(r.lowestPriceMmk === 10_000, 'single: lowestPriceMmk 10000')
  check(r.averageReorderAt === 5, 'single: averageReorderAt 5')
}

// 4. uniqueSkus: same sku two baselines → uniqueSkus 1, totalBaselines 2
{
  const r = projectShopCatalogBaselineSummary(state([
    baseline({ sku: 'SKU-Z' }),
    baseline({ sku: 'SKU-Z' }),
  ]))
  check(r.uniqueSkus === 1, 'dedup: uniqueSkus 1')
  check(r.totalBaselines === 2, 'dedup: totalBaselines 2')
}

// 5. averagePriceMmk: (10_000 + 20_000) / 2 = 15_000
{
  const r = projectShopCatalogBaselineSummary(state([
    baseline({ price: 10_000 }),
    baseline({ price: 20_000 }),
  ]))
  check(r.averagePriceMmk === 15_000, 'avg-price: (10k+20k)/2=15k')
}

// 6. averagePriceMmk rounds: (10_000 + 11_001) / 2 = 10_500.5 → Math.round → 10_501
{
  const r = projectShopCatalogBaselineSummary(state([
    baseline({ price: 10_000 }),
    baseline({ price: 11_001 }),
  ]))
  check(r.averagePriceMmk === 10_501, 'avg-round: Math.round(10500.5)=10501')
}

// 7. highestPriceMmk: max wins
{
  const r = projectShopCatalogBaselineSummary(state([
    baseline({ price: 5_000 }),
    baseline({ price: 20_000 }),
    baseline({ price: 10_000 }),
  ]))
  check(r.highestPriceMmk === 20_000, 'highest: 20000 wins')
}

// 8. lowestPriceMmk: min wins
{
  const r = projectShopCatalogBaselineSummary(state([
    baseline({ price: 5_000 }),
    baseline({ price: 20_000 }),
    baseline({ price: 10_000 }),
  ]))
  check(r.lowestPriceMmk === 5_000, 'lowest: 5000 wins')
}

// 9. highestPriceMmk and lowestPriceMmk from same list
{
  const r = projectShopCatalogBaselineSummary(state([
    baseline({ price: 3_000 }),
    baseline({ price: 15_000 }),
  ]))
  check(r.highestPriceMmk === 15_000, 'spread: highestPriceMmk 15000')
  check(r.lowestPriceMmk === 3_000, 'spread: lowestPriceMmk 3000')
}

// 10. averageReorderAt: (6 + 8) / 2 = 7
{
  const r = projectShopCatalogBaselineSummary(state([
    baseline({ reorderAt: 6 }),
    baseline({ reorderAt: 8 }),
  ]))
  check(r.averageReorderAt === 7, 'avg-reorder: (6+8)/2=7 (exact)')
}

// 11. averageReorderAt rounds: (5 + 6) / 2 = 5.5 → 6
{
  const r = projectShopCatalogBaselineSummary(state([
    baseline({ reorderAt: 5 }),
    baseline({ reorderAt: 6 }),
  ]))
  check(r.averageReorderAt === 6, 'avg-reorder-round: Math.round(5.5)=6')
}

// 12. Multiple distinct skus → uniqueSkus count
{
  const r = projectShopCatalogBaselineSummary(state([
    baseline({ sku: 'SKU-1' }),
    baseline({ sku: 'SKU-2' }),
    baseline({ sku: 'SKU-3' }),
  ]))
  check(r.uniqueSkus === 3, 'multi-sku: uniqueSkus 3')
}

// 13. averagePriceMmk accumulates across 3 baselines
{
  const r = projectShopCatalogBaselineSummary(state([
    baseline({ price: 6_000 }),
    baseline({ price: 9_000 }),
    baseline({ price: 12_000 }),
  ]))
  check(r.averagePriceMmk === 9_000, 'accum: (6k+9k+12k)/3=9k')
}

console.log(JSON.stringify({ ok: true, checks }))
