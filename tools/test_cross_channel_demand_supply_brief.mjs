// Cross-channel demand-supply brief: ecommerce SKU demand vs shop inventory.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectCrossChannelDemandSupplyBrief } from './cross-channel-demand-supply-brief.ts'`,
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

const { projectCrossChannelDemandSupplyBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const COMMERCE_SCHEMA = 'supermega.commerce.workspace.v2'
const BUYING_SCHEMA = 'supermega.ecommerce.buying-state.v2'

function shopItem(sku, onHand, reorderAt = 5) {
  return { sku, name: `Item ${sku}`, onHand, reorderAt, price: 10000 }
}

function line(sku, quantity = 1) {
  return { sku, name: `Item ${sku}`, variant: null, quantity, unitPriceMmk: 10000, lineTotalMmk: quantity * 10000 }
}

function request(id, lines) {
  return {
    schema: 'supermega.ecommerce.order-request.v2', mode: 'browser-local-request',
    state: 'pending_shop_review', scope: 'test-shop', id, idempotencyKey: id,
    createdAt: '2026-01-01T00:00:00Z', sourcePreviewDigest: 'abc',
    sourceStorefrontRevision: null, sourceStorefrontActionId: null,
    customerReference: 'C1', fulfilment: { type: 'pickup' }, currency: 'MMK',
    lines, quote: {}, totalMmk: lines.reduce((s, l) => s + l.lineTotalMmk, 0),
  }
}

function commerce(items = []) {
  return { schema: COMMERCE_SCHEMA, items, orders: [], movements: [], closes: [] }
}

function buying(requests = []) {
  return {
    schema: BUYING_SCHEMA, scope: 'test-shop', revision: 0, headDigest: 'abc',
    requests, returnIntents: [], supportIntents: [], correctionIntents: [],
    cancellationIntents: [], cancellationDecisions: [], amendmentIntents: [], rescheduleIntents: [],
  }
}

// 1. Both empty
{
  const r = projectCrossChannelDemandSupplyBrief(commerce(), buying())
  check(r.totalEcommerceRequestedSkus === 0, 'empty: totalEcommerceRequestedSkus 0')
  check(r.totalShopCatalogSkus === 0, 'empty: totalShopCatalogSkus 0')
  check(r.skusInBothChannels === 0, 'empty: skusInBothChannels 0')
  check(r.skusWithSupplyGap === 0, 'empty: skusWithSupplyGap 0')
  check(r.skusAtRisk.length === 0, 'empty: skusAtRisk empty')
}

// 2. Ecommerce demand for SKU not in shop catalog → not at risk
{
  const r = projectCrossChannelDemandSupplyBrief(
    commerce([]),
    buying([request('REQ-1', [line('SKU-A', 5)])])
  )
  check(r.totalEcommerceRequestedSkus === 1, 'no-catalog: totalEcommerceRequestedSkus 1')
  check(r.skusInBothChannels === 0, 'no-catalog: skusInBothChannels 0')
  check(r.skusWithSupplyGap === 0, 'no-catalog: skusWithSupplyGap 0 (not in catalog)')
}

// 3. Demand exceeds onHand → supply gap
{
  const r = projectCrossChannelDemandSupplyBrief(
    commerce([shopItem('SKU-A', 3)]),
    buying([request('REQ-1', [line('SKU-A', 10)])])
  )
  check(r.skusInBothChannels === 1, 'gap: skusInBothChannels 1')
  check(r.skusWithSupplyGap === 1, 'gap: skusWithSupplyGap 1')
  check(r.skusAtRisk[0].sku === 'SKU-A', 'gap: skusAtRisk[0] SKU-A')
  check(r.skusAtRisk[0].supplyGap === 7, 'gap: supplyGap 7 (10 demanded - 3 on hand)')
  check(r.skusAtRisk[0].shopOnHand === 3, 'gap: shopOnHand 3')
}

// 4. Demand exactly covered → no supply gap
{
  const r = projectCrossChannelDemandSupplyBrief(
    commerce([shopItem('SKU-A', 5)]),
    buying([request('REQ-1', [line('SKU-A', 5)])])
  )
  check(r.skusWithSupplyGap === 0, 'exact-cover: no supply gap when demanded === onHand')
}

// 5. Multiple requests same SKU accumulate demand
{
  const r = projectCrossChannelDemandSupplyBrief(
    commerce([shopItem('SKU-A', 4)]),
    buying([
      request('REQ-1', [line('SKU-A', 3)]),
      request('REQ-2', [line('SKU-A', 3)]),
    ])
  )
  check(r.skusAtRisk[0].ecommerceRequestedQuantity === 6, 'accum: ecommerceRequestedQuantity 6 (3+3)')
  check(r.skusAtRisk[0].supplyGap === 2, 'accum: supplyGap 2 (6-4)')
}

// 6. skusAtRisk sorted by supplyGap descending
{
  const r = projectCrossChannelDemandSupplyBrief(
    commerce([shopItem('SKU-A', 0), shopItem('SKU-B', 2)]),
    buying([
      request('REQ-1', [line('SKU-A', 5), line('SKU-B', 10)]),
    ])
  )
  check(r.skusAtRisk[0].sku === 'SKU-B', 'sort: SKU-B first (gap 8)')
  check(r.skusAtRisk[1].sku === 'SKU-A', 'sort: SKU-A second (gap 5)')
}

// 7. totalShopCatalogSkus counts all catalog items regardless of demand
{
  const r = projectCrossChannelDemandSupplyBrief(
    commerce([shopItem('SKU-A', 10), shopItem('SKU-B', 10), shopItem('SKU-C', 10)]),
    buying([request('REQ-1', [line('SKU-A', 5)])])
  )
  check(r.totalShopCatalogSkus === 3, 'catalog-count: totalShopCatalogSkus 3')
  check(r.skusInBothChannels === 1, 'catalog-count: skusInBothChannels 1')
}

console.log(JSON.stringify({ ok: true, checks }))
