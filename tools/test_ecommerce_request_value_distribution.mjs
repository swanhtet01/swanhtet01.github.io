// Ecommerce request value distribution: buckets pending requests by totalMmk into
// small (<100k), medium (100k–999,999), large (≥1M), and by fulfilment mode.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRequestValueDistribution } from './ecommerce-request-value-distribution.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/ecommerce-value-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectEcommerceRequestValueDistribution } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let seq = 0
function req(totalMmk, fulfilment = 'pickup') {
  seq++
  return {
    schema: 'supermega.ecommerce.order_request.v2',
    mode: 'browser-local-request',
    state: 'pending_shop_review',
    scope: 'scope1',
    id: `req-${seq}`,
    idempotencyKey: `key-${seq}`,
    createdAt: '2026-08-11T08:00:00.000Z',
    sourcePreviewDigest: 'digest1',
    sourceStorefrontRevision: null,
    sourceStorefrontActionId: null,
    customerReference: `cust-${seq}`,
    fulfilment,
    currency: 'MMK',
    lines: [],
    quote: {},
    totalMmk,
  }
}

function state(requests = []) {
  return { requests, returnIntents: [], supportIntents: [], correctionIntents: [], cancellationIntents: [], cancellationDecisions: [], amendmentIntents: [], rescheduleIntents: [] }
}

// 1. Empty state → all zeros
{
  const r = projectEcommerceRequestValueDistribution(state())
  check(r.totalPendingRequests === 0, 'empty: totalPendingRequests 0')
  check(r.totalPendingValueMmk === 0, 'empty: totalPendingValueMmk 0')
  check(r.averageRequestValueMmk === 0, 'empty: averageRequestValueMmk 0 (no zero-division)')
  check(r.highestRequestValueMmk === 0, 'empty: highestRequestValueMmk 0')
  check(r.byValueBucket.small.count === 0, 'empty: small count 0')
  check(r.byValueBucket.medium.count === 0, 'empty: medium count 0')
  check(r.byValueBucket.large.count === 0, 'empty: large count 0')
  check(r.byFulfilment.delivery.count === 0, 'empty: delivery count 0')
  check(r.byFulfilment.pickup.count === 0, 'empty: pickup count 0')
}

// 2. Bucket boundaries: small < 100,000; medium 100,000–999,999; large ≥ 1,000,000
{
  const r = projectEcommerceRequestValueDistribution(state([
    req(99_999),         // small
    req(100_000),        // medium (boundary)
    req(999_999),        // medium
    req(1_000_000),      // large (boundary)
  ]))
  check(r.byValueBucket.small.count === 1, 'buckets: small count 1')
  check(r.byValueBucket.medium.count === 2, 'buckets: medium count 2')
  check(r.byValueBucket.large.count === 1, 'buckets: large count 1')
}

// 3. Small bucket totalMmk
{
  const r = projectEcommerceRequestValueDistribution(state([
    req(50_000),
    req(30_000),
  ]))
  check(r.byValueBucket.small.totalMmk === 80_000, 'small-total: totalMmk 80000')
}

// 4. Medium bucket totalMmk
{
  const r = projectEcommerceRequestValueDistribution(state([
    req(200_000),
    req(500_000),
  ]))
  check(r.byValueBucket.medium.totalMmk === 700_000, 'medium-total: totalMmk 700000')
}

// 5. Large bucket totalMmk
{
  const r = projectEcommerceRequestValueDistribution(state([
    req(2_000_000),
    req(3_000_000),
  ]))
  check(r.byValueBucket.large.totalMmk === 5_000_000, 'large-total: totalMmk 5000000')
}

// 6. totalPendingValueMmk is sum of all requests
{
  const r = projectEcommerceRequestValueDistribution(state([
    req(50_000),
    req(200_000),
    req(2_000_000),
  ]))
  check(r.totalPendingRequests === 3, 'total: totalPendingRequests 3')
  check(r.totalPendingValueMmk === 2_250_000, 'total: totalPendingValueMmk 2250000')
}

// 7. averageRequestValueMmk rounds correctly
{
  // 3 requests totalling 2,250,000 → avg = 750,000
  const r = projectEcommerceRequestValueDistribution(state([
    req(50_000),
    req(200_000),
    req(2_000_000),
  ]))
  check(r.averageRequestValueMmk === 750_000, 'avg: 750000 average')
}

// 8. averageRequestValueMmk rounding: 200,000 / 3 = 66,666.7 → rounds to 66,667
{
  const r = projectEcommerceRequestValueDistribution(state([
    req(100_000),
    req(50_000),
    req(50_000),
  ]))
  // total = 200,000 / 3 = 66,666.67 → Math.round = 66,667
  check(r.averageRequestValueMmk === 66_667, 'avg-rounding: 66667')
}

// 9. highestRequestValueMmk
{
  const r = projectEcommerceRequestValueDistribution(state([
    req(50_000),
    req(2_000_000),
    req(500_000),
  ]))
  check(r.highestRequestValueMmk === 2_000_000, 'highest: 2000000')
}

// 10. Fulfilment breakdown: delivery vs pickup
{
  const r = projectEcommerceRequestValueDistribution(state([
    req(100_000, 'delivery'),
    req(200_000, 'delivery'),
    req(50_000, 'pickup'),
  ]))
  check(r.byFulfilment.delivery.count === 2, 'fulfilment: delivery count 2')
  check(r.byFulfilment.delivery.totalMmk === 300_000, 'fulfilment: delivery total 300000')
  check(r.byFulfilment.pickup.count === 1, 'fulfilment: pickup count 1')
  check(r.byFulfilment.pickup.totalMmk === 50_000, 'fulfilment: pickup total 50000')
}

// 11. Single large delivery request
{
  const r = projectEcommerceRequestValueDistribution(state([
    req(5_000_000, 'delivery'),
  ]))
  check(r.totalPendingRequests === 1, 'single-large: count 1')
  check(r.averageRequestValueMmk === 5_000_000, 'single-large: avg equals only request')
  check(r.highestRequestValueMmk === 5_000_000, 'single-large: highest')
  check(r.byValueBucket.large.count === 1, 'single-large: in large bucket')
  check(r.byFulfilment.delivery.count === 1, 'single-large: delivery')
}

// 12. All pickup: delivery stays zero
{
  const r = projectEcommerceRequestValueDistribution(state([
    req(80_000, 'pickup'),
    req(90_000, 'pickup'),
  ]))
  check(r.byFulfilment.pickup.count === 2, 'all-pickup: pickup count 2')
  check(r.byFulfilment.delivery.count === 0, 'all-pickup: delivery count stays 0')
  check(r.byFulfilment.delivery.totalMmk === 0, 'all-pickup: delivery total stays 0')
}

console.log(JSON.stringify({ ok: true, checks }))
