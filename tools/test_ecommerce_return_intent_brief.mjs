// Ecommerce return intent brief: disposition + SKU breakdown from EcommerceBuyingState.returnIntents.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceReturnIntentBrief } from './ecommerce-return-intent-brief.ts'`,
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

const { projectEcommerceReturnIntentBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.ecommerce.buying.v1'
let intentId = 0
function intent(sku, quantity, disposition) {
  intentId++
  return {
    schema: 'supermega.ecommerce.return-intent.v1',
    state: 'pending_shop_review',
    scope: 'test-scope',
    id: `ri-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-11T10:00:00Z',
    orderId: `ord-${intentId}`,
    sourceRequestId: `req-${intentId}`,
    sku,
    quantity,
    disposition,
    reason: 'defective',
    refundStatus: 'not_started',
    evidenceReference: `ev-${intentId}`,
  }
}

function state(...returnIntents) {
  return {
    schema: SCHEMA,
    scope: 'test-scope',
    revision: 1,
    headDigest: 'abc',
    requests: [],
    returnIntents,
    supportIntents: [],
    correctionIntents: [],
    cancellationIntents: [],
    cancellationDecisions: [],
    events: [],
  }
}

// 1. Empty — all zeros
{
  const r = projectEcommerceReturnIntentBrief(state())
  check(r.totalReturnIntents === 0, 'empty: totalReturnIntents 0')
  check(r.totalQuantity === 0, 'empty: totalQuantity 0')
  check(r.uniqueSkus === 0, 'empty: uniqueSkus 0')
  check(r.byDisposition.restock === 0, 'empty: byDisposition.restock 0')
  check(r.byDisposition.notRestocked === 0, 'empty: byDisposition.notRestocked 0')
  check(r.restockRate === 0, 'empty: restockRate 0')
  check(r.topSkus.length === 0, 'empty: topSkus []')
}

// 2. Single restock intent
{
  const r = projectEcommerceReturnIntentBrief(state(intent('SKU-A', 2, 'restock')))
  check(r.totalReturnIntents === 1, 'single-restock: totalReturnIntents 1')
  check(r.totalQuantity === 2, 'single-restock: totalQuantity 2')
  check(r.uniqueSkus === 1, 'single-restock: uniqueSkus 1')
  check(r.byDisposition.restock === 1, 'single-restock: restock 1')
  check(r.byDisposition.notRestocked === 0, 'single-restock: notRestocked 0')
  check(r.restockRate === 100, 'single-restock: restockRate 100')
  check(r.topSkus[0].sku === 'SKU-A', 'single-restock: topSkus[0] SKU-A')
  check(r.topSkus[0].intentCount === 1, 'single-restock: topSkus[0].intentCount 1')
  check(r.topSkus[0].totalQuantity === 2, 'single-restock: topSkus[0].totalQuantity 2')
}

// 3. Single not_restocked intent
{
  const r = projectEcommerceReturnIntentBrief(state(intent('SKU-B', 1, 'not_restocked')))
  check(r.byDisposition.notRestocked === 1, 'not-restocked: notRestocked 1')
  check(r.byDisposition.restock === 0, 'not-restocked: restock 0')
  check(r.restockRate === 0, 'not-restocked: restockRate 0')
}

// 4. Mixed disposition — 50% restock rate
{
  const r = projectEcommerceReturnIntentBrief(state(
    intent('SKU-A', 1, 'restock'),
    intent('SKU-B', 1, 'not_restocked'),
  ))
  check(r.byDisposition.restock === 1, 'mixed-50pct: restock 1')
  check(r.byDisposition.notRestocked === 1, 'mixed-50pct: notRestocked 1')
  check(r.restockRate === 50, 'mixed-50pct: restockRate 50')
}

// 5. Quantity accumulation across multiple intents for same SKU
{
  const r = projectEcommerceReturnIntentBrief(state(
    intent('SKU-A', 3, 'restock'),
    intent('SKU-A', 2, 'not_restocked'),
  ))
  check(r.totalQuantity === 5, 'qty-accum: totalQuantity 5')
  check(r.uniqueSkus === 1, 'qty-accum: uniqueSkus 1')
  check(r.topSkus[0].intentCount === 2, 'qty-accum: intentCount 2')
  check(r.topSkus[0].totalQuantity === 5, 'qty-accum: totalQuantity 5')
}

// 6. Sort by intentCount desc — SKU with more intents comes first
{
  const r = projectEcommerceReturnIntentBrief(state(
    intent('SKU-B', 1, 'restock'),
    intent('SKU-A', 1, 'restock'),
    intent('SKU-A', 1, 'restock'),
  ))
  check(r.topSkus[0].sku === 'SKU-A', 'sort: SKU-A first (2 intents)')
  check(r.topSkus[1].sku === 'SKU-B', 'sort: SKU-B second')
}

// 7. Top-5 cap
{
  const r = projectEcommerceReturnIntentBrief(state(
    intent('SKU-1', 1, 'restock'),
    intent('SKU-2', 1, 'restock'),
    intent('SKU-3', 1, 'restock'),
    intent('SKU-4', 1, 'restock'),
    intent('SKU-5', 1, 'restock'),
    intent('SKU-6', 1, 'restock'),
  ))
  check(r.topSkus.length === 5, 'top5-cap: topSkus capped at 5')
  check(r.uniqueSkus === 6, 'top5-cap: uniqueSkus 6 (all counted)')
}

// 8. restockRate rounds correctly — 1 of 3 = 33%
{
  const r = projectEcommerceReturnIntentBrief(state(
    intent('SKU-A', 1, 'restock'),
    intent('SKU-B', 1, 'not_restocked'),
    intent('SKU-C', 1, 'not_restocked'),
  ))
  check(r.restockRate === 33, 'round-33pct: restockRate 33')
}

console.log(JSON.stringify({ ok: true, checks }))
