// Ecommerce return intent disposition/SKU brief: restock/not_restocked split + SKU top-5 + qty stats.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceReturnIntentDispositionSkuBrief } from './ecommerce-return-intent-disposition-sku-brief.ts'`,
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

const { projectEcommerceReturnIntentDispositionSkuBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function returnIntent({ disposition = 'restock', sku = 'SKU-001', quantity = 1 } = {}) {
  intentId++
  return {
    schema: 'supermega.ecommerce.return_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `RI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sku,
    quantity,
    disposition,
    reason: 'Item not as described',
    refundStatus: 'not_started',
    evidenceReference: `ev-${intentId}`,
  }
}

function state(returnIntents) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: 0,
    headDigest: 'hd-1',
    requests: [],
    returnIntents,
    supportIntents: [],
    correctionIntents: [],
    cancellationIntents: [],
    cancellationDecisions: [],
    amendmentIntents: [],
    rescheduleIntents: [],
    events: [],
  }
}

// 1. Empty state
{
  const r = projectEcommerceReturnIntentDispositionSkuBrief(state([]))
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.restockCount === 0, 'empty: restockCount 0')
  check(r.notRestockedCount === 0, 'empty: notRestockedCount 0')
  check(r.uniqueSkus === 0, 'empty: uniqueSkus 0')
  check(r.totalQuantity === 0, 'empty: totalQuantity 0')
  check(r.averageQuantity === 0, 'empty: averageQuantity 0')
}

// 2. All restock
{
  const r = projectEcommerceReturnIntentDispositionSkuBrief(
    state([returnIntent({ disposition: 'restock' }), returnIntent({ disposition: 'restock' })]),
  )
  check(r.restockCount === 2, 'all-restock: restockCount 2')
  check(r.notRestockedCount === 0, 'all-restock: notRestockedCount 0')
  check(r.restockRate === 100, 'all-restock: restockRate 100')
}

// 3. All not_restocked
{
  const r = projectEcommerceReturnIntentDispositionSkuBrief(
    state([returnIntent({ disposition: 'not_restocked' })]),
  )
  check(r.notRestockedCount === 1, 'all-nr: notRestockedCount 1')
  check(r.notRestockedRate === 100, 'all-nr: notRestockedRate 100')
}

// 4. Disposition counts sum to total
{
  const r = projectEcommerceReturnIntentDispositionSkuBrief(
    state([returnIntent({ disposition: 'restock' }), returnIntent({ disposition: 'not_restocked' })]),
  )
  check(r.restockCount + r.notRestockedCount === r.totalIntents, 'invariant: disposition counts sum')
  check(r.restockRate === 50, 'split: restockRate 50')
}

// 5. SKU distribution — unique count and top-5
{
  const r = projectEcommerceReturnIntentDispositionSkuBrief(
    state([
      returnIntent({ sku: 'SKU-A' }),
      returnIntent({ sku: 'SKU-A' }),
      returnIntent({ sku: 'SKU-B' }),
    ]),
  )
  check(r.uniqueSkus === 2, 'sku: uniqueSkus 2')
  check(r.topSkusByCount[0]?.sku === 'SKU-A', 'sku: top is SKU-A')
  check(r.topSkusByCount[0]?.count === 2, 'sku: SKU-A count 2')
}

// 6. Top-5 SKU cap + alphabetical tiebreak
{
  const skus = ['SKU-Z', 'SKU-A', 'SKU-C', 'SKU-B', 'SKU-D', 'SKU-E']
  const r = projectEcommerceReturnIntentDispositionSkuBrief(state(skus.map(sku => returnIntent({ sku }))))
  check(r.topSkusByCount.length === 5, 'top5: capped at 5')
  check(r.topSkusByCount[0]?.sku === 'SKU-A', 'top5: SKU-A first (alpha tiebreak)')
}

// 7. Quantity totals
{
  const r = projectEcommerceReturnIntentDispositionSkuBrief(
    state([
      returnIntent({ quantity: 1 }),
      returnIntent({ quantity: 3 }),
      returnIntent({ quantity: 2 }),
    ]),
  )
  check(r.totalQuantity === 6, 'qty: totalQuantity 6')
  check(r.averageQuantity === 2, 'qty: averageQuantity 2')
}

// 8. Rounding: 2/3 → 67%
{
  const r = projectEcommerceReturnIntentDispositionSkuBrief(
    state([
      returnIntent({ disposition: 'restock' }),
      returnIntent({ disposition: 'restock' }),
      returnIntent({ disposition: 'not_restocked' }),
    ]),
  )
  check(r.restockRate === 67, 'round: restockRate 67')
  check(r.notRestockedRate === 33, 'round: notRestockedRate 33')
}

console.log(JSON.stringify({ ok: true, checks }))
