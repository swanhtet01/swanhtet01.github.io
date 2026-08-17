// Shop storefront merchandising brief: featured/collection/note distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopStorefrontMerchandisingBrief } from './shop-storefront-merchandising-brief.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopStorefrontMerchandisingBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

function item({ sku = 'SKU-01', featured = false, collection = 'General', displayName = 'Item', note = '' } = {}) {
  return { sku, featured, collection, displayName, note }
}

function state(merchandising) {
  return {
    schema: 'supermega.commerce.workspace.v3',
    revision: 1,
    orders: [],
    purchaseOrders: [],
    movements: [],
    taxConfigurations: [],
    customerCreditPolicies: [],
    promotionPolicies: [],
    shippingPolicies: [],
    paymentPolicies: [],
    catalogChanges: [],
    purchaseBudgetEnvelopes: [],
    purchaseRequisitions: [],
    supplierSourcingDecisions: [],
    websiteIntakes: [],
    ...(merchandising !== undefined && {
      storefrontConfiguration: {
        revision: 1,
        storeName: 'Test Store',
        summary: 'A store.',
        selectedSkus: [],
        shopCatalogSnapshotRevision: 1,
        merchandising,
        saved: { actionId: 'act-1', savedAt: '2026-08-11T08:00:00Z', savedBy: 'admin-01' },
      },
    }),
  }
}

// 1. No storefrontConfiguration → all zeros
{
  const r = projectShopStorefrontMerchandisingBrief(state(undefined))
  check(r.totalItems === 0, 'no-config: totalItems 0')
  check(r.featuredCount === 0, 'no-config: featuredCount 0')
  check(r.featuredRate === 0, 'no-config: featuredRate 0')
  check(r.uniqueCollections === 0, 'no-config: uniqueCollections 0')
  check(r.itemsWithNote === 0, 'no-config: itemsWithNote 0')
  check(r.noteRate === 0, 'no-config: noteRate 0')
  check(r.topCollectionsByItems.length === 0, 'no-config: topCollections empty')
}

// 2. Empty merchandising array
{
  const r = projectShopStorefrontMerchandisingBrief(state([]))
  check(r.totalItems === 0, 'empty-array: totalItems 0')
}

// 3. Single item, not featured, no note
{
  const r = projectShopStorefrontMerchandisingBrief(state([item()]))
  check(r.totalItems === 1, 'single: totalItems 1')
  check(r.featuredCount === 0, 'single: featuredCount 0')
  check(r.featuredRate === 0, 'single: featuredRate 0')
  check(r.uniqueCollections === 1, 'single: uniqueCollections 1')
  check(r.itemsWithNote === 0, 'single: itemsWithNote 0')
}

// 4. Single featured item
{
  const r = projectShopStorefrontMerchandisingBrief(state([item({ featured: true })]))
  check(r.featuredCount === 1, 'featured: count 1')
  check(r.featuredRate === 100, 'featured: rate 100')
}

// 5. Item with note
{
  const r = projectShopStorefrontMerchandisingBrief(state([item({ note: 'Best seller.' })]))
  check(r.itemsWithNote === 1, 'with-note: count 1')
  check(r.noteRate === 100, 'with-note: noteRate 100')
}

// 6. Item with empty note → not counted
{
  const r = projectShopStorefrontMerchandisingBrief(state([item({ note: '' })]))
  check(r.itemsWithNote === 0, 'empty-note: not counted')
  check(r.noteRate === 0, 'empty-note: noteRate 0')
}

// 7. Multiple items, same collection
{
  const r = projectShopStorefrontMerchandisingBrief(state([
    item({ collection: 'Tyres' }),
    item({ sku: 'SKU-02', collection: 'Tyres' }),
  ]))
  check(r.uniqueCollections === 1, 'same-collection: unique 1')
  check(r.topCollectionsByItems[0].collection === 'Tyres', 'same-collection: Tyres in top')
  check(r.topCollectionsByItems[0].count === 2, 'same-collection: count 2')
}

// 8. Two different collections
{
  const r = projectShopStorefrontMerchandisingBrief(state([
    item({ collection: 'Tyres' }),
    item({ sku: 'SKU-02', collection: 'Oils' }),
  ]))
  check(r.uniqueCollections === 2, 'two-collections: unique 2')
}

// 9. Sort: more items first, secondary alphabetical
{
  const r = projectShopStorefrontMerchandisingBrief(state([
    item({ collection: 'Zulu', sku: 'Z1' }),
    item({ collection: 'Alpha', sku: 'A1' }),
    item({ collection: 'Alpha', sku: 'A2' }),
  ]))
  check(r.topCollectionsByItems[0].collection === 'Alpha', 'sort: Alpha first (count 2)')
  check(r.topCollectionsByItems[1].collection === 'Zulu', 'sort: Zulu second (count 1)')
}

// 10. Secondary sort: same count → alphabetical
{
  const r = projectShopStorefrontMerchandisingBrief(state([
    item({ collection: 'Zulu', sku: 'Z1' }),
    item({ collection: 'Alpha', sku: 'A1' }),
  ]))
  check(r.topCollectionsByItems[0].collection === 'Alpha', 'secondary: Alpha before Zulu')
}

// 11. 6 collections → top 5
{
  const items = ['A', 'B', 'C', 'D', 'E', 'F'].map((c, i) => item({ collection: c, sku: `SKU-${i}` }))
  const r = projectShopStorefrontMerchandisingBrief(state(items))
  check(r.uniqueCollections === 6, 'top-5: unique 6')
  check(r.topCollectionsByItems.length === 5, 'top-5: top capped at 5')
}

// 12. featuredRate rounds — 1 of 3 = 33%
{
  const r = projectShopStorefrontMerchandisingBrief(state([
    item({ featured: true }),
    item({ sku: 'B', featured: false }),
    item({ sku: 'C', featured: false }),
  ]))
  check(r.featuredRate === 33, 'rate-33: featuredRate 33')
}

// 13. noteRate rounds — 2 of 3 = 67%
{
  const r = projectShopStorefrontMerchandisingBrief(state([
    item({ note: 'Note A.' }),
    item({ sku: 'B', note: 'Note B.' }),
    item({ sku: 'C', note: '' }),
  ]))
  check(r.noteRate === 67, 'note-rate-67: noteRate 67')
}

// 14. Mixed: featured + notes + collections
{
  const r = projectShopStorefrontMerchandisingBrief(state([
    item({ sku: 'A', featured: true, collection: 'Tyres', note: 'Top tyre.' }),
    item({ sku: 'B', featured: true, collection: 'Tyres', note: '' }),
    item({ sku: 'C', featured: false, collection: 'Oils', note: 'Engine oil.' }),
  ]))
  check(r.totalItems === 3, 'mixed: totalItems 3')
  check(r.featuredCount === 2, 'mixed: featuredCount 2')
  check(r.uniqueCollections === 2, 'mixed: uniqueCollections 2')
  check(r.itemsWithNote === 2, 'mixed: itemsWithNote 2')
  check(r.topCollectionsByItems[0].collection === 'Tyres', 'mixed: Tyres top (count 2)')
}

console.log(JSON.stringify({ ok: true, checks }))
