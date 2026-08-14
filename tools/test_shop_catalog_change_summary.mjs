// Shop catalog change summary: totalChanges, uniqueSkus, priceIncreases/Decreases/Unchanged,
// topChangedSkus (top 5 by changeCount desc then alpha sku; latest prices tracked).
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopCatalogChangeSummary } from './shop-catalog-change-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/catalog-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopCatalogChangeSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const PROOF = { actionId: 'act1', capturedAt: '2026-08-11T08:00:00.000Z', actor: 'op1' }

function change(sku, previousPrice, nextPrice) {
  return { sku, previousPrice, nextPrice, previousReorderAt: 5, nextReorderAt: 5, proof: PROOF }
}

function state(catalogChanges = undefined) {
  return {
    items: [], orders: [], movements: [], closes: [],
    ...(catalogChanges !== undefined ? { catalogChanges } : {}),
  }
}

// 1. Empty state (no field) → all zeros
{
  const r = projectShopCatalogChangeSummary(state())
  check(r.totalChanges === 0, 'empty: totalChanges 0')
  check(r.uniqueSkus === 0, 'empty: uniqueSkus 0')
  check(r.priceIncreases === 0, 'empty: priceIncreases 0')
  check(r.priceDecreases === 0, 'empty: priceDecreases 0')
  check(r.priceUnchanged === 0, 'empty: priceUnchanged 0')
  check(r.topChangedSkus.length === 0, 'empty: topChangedSkus empty')
}

// 2. Empty array
{
  const r = projectShopCatalogChangeSummary(state([]))
  check(r.totalChanges === 0, 'empty-array: totalChanges 0')
}

// 3. Single price increase
{
  const r = projectShopCatalogChangeSummary(state([
    change('SKU-A', 5_000, 6_000),
  ]))
  check(r.totalChanges === 1, 'increase: totalChanges 1')
  check(r.priceIncreases === 1, 'increase: priceIncreases 1')
  check(r.priceDecreases === 0, 'increase: priceDecreases 0')
  check(r.priceUnchanged === 0, 'increase: priceUnchanged 0')
  check(r.uniqueSkus === 1, 'increase: uniqueSkus 1')
  check(r.topChangedSkus.length === 1, 'increase: topChangedSkus 1 entry')
  check(r.topChangedSkus[0].sku === 'SKU-A', 'increase: topChangedSkus[0].sku SKU-A')
  check(r.topChangedSkus[0].changeCount === 1, 'increase: changeCount 1')
  check(r.topChangedSkus[0].latestPreviousPrice === 5_000, 'increase: latestPreviousPrice 5000')
  check(r.topChangedSkus[0].latestNextPrice === 6_000, 'increase: latestNextPrice 6000')
}

// 4. Price decrease
{
  const r = projectShopCatalogChangeSummary(state([
    change('SKU-B', 10_000, 8_000),
  ]))
  check(r.priceDecreases === 1, 'decrease: priceDecreases 1')
  check(r.priceIncreases === 0, 'decrease: priceIncreases 0')
}

// 5. Price unchanged (same previous and next)
{
  const r = projectShopCatalogChangeSummary(state([
    change('SKU-C', 5_000, 5_000),
  ]))
  check(r.priceUnchanged === 1, 'unchanged: priceUnchanged 1')
}

// 6. Multiple changes to same SKU: changeCount accumulates, latest prices tracked
{
  const r = projectShopCatalogChangeSummary(state([
    change('SKU-X', 5_000, 6_000),
    change('SKU-X', 6_000, 7_000),
    change('SKU-X', 7_000, 8_000),
  ]))
  check(r.uniqueSkus === 1, 'same-sku: uniqueSkus 1')
  check(r.totalChanges === 3, 'same-sku: totalChanges 3')
  check(r.topChangedSkus[0].sku === 'SKU-X', 'same-sku: topChangedSkus[0] SKU-X')
  check(r.topChangedSkus[0].changeCount === 3, 'same-sku: changeCount 3')
  check(r.topChangedSkus[0].latestPreviousPrice === 7_000, 'same-sku: latestPreviousPrice tracks latest 7000')
  check(r.topChangedSkus[0].latestNextPrice === 8_000, 'same-sku: latestNextPrice tracks latest 8000')
}

// 7. topChangedSkus sorted desc by changeCount
{
  const r = projectShopCatalogChangeSummary(state([
    change('SKU-A', 1_000, 2_000),
    change('SKU-B', 1_000, 2_000),
    change('SKU-B', 2_000, 3_000),
    change('SKU-B', 3_000, 4_000),
  ]))
  check(r.topChangedSkus[0].sku === 'SKU-B', 'sort: SKU-B first (3 changes)')
  check(r.topChangedSkus[1].sku === 'SKU-A', 'sort: SKU-A second (1 change)')
}

// 8. Tie-break: same changeCount → alpha sku
{
  const r = projectShopCatalogChangeSummary(state([
    change('ZZZ-SKU', 1_000, 2_000),
    change('AAA-SKU', 1_000, 2_000),
  ]))
  check(r.topChangedSkus[0].sku === 'AAA-SKU', 'tie: AAA-SKU before ZZZ-SKU')
  check(r.topChangedSkus[1].sku === 'ZZZ-SKU', 'tie: ZZZ-SKU second')
}

// 9. topChangedSkus capped at 5
{
  const changes = []
  for (let i = 1; i <= 6; i++) {
    changes.push(change(`SKU-${i}`, 1_000, 2_000))
  }
  const r = projectShopCatalogChangeSummary(state(changes))
  check(r.topChangedSkus.length === 5, 'top5-cap: topChangedSkus capped at 5')
  check(r.uniqueSkus === 6, 'top5-cap: uniqueSkus still 6')
}

// 10. Mixed increases/decreases/unchanged in one state
{
  const r = projectShopCatalogChangeSummary(state([
    change('SKU-UP', 5_000, 6_000),
    change('SKU-UP', 6_000, 7_000),
    change('SKU-DOWN', 10_000, 8_000),
    change('SKU-SAME', 3_000, 3_000),
  ]))
  check(r.priceIncreases === 2, 'mixed: priceIncreases 2')
  check(r.priceDecreases === 1, 'mixed: priceDecreases 1')
  check(r.priceUnchanged === 1, 'mixed: priceUnchanged 1')
  check(r.totalChanges === 4, 'mixed: totalChanges 4')
  check(r.uniqueSkus === 3, 'mixed: uniqueSkus 3')
}

console.log(JSON.stringify({ ok: true, checks }))
