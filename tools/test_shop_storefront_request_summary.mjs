// Shop storefront request summary: totalRequests, bySchema (v1/v2),
// byFulfilment (pickup/delivery), totalValueMmk, uniqueCustomers, averageValueMmk.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopStorefrontRequestSummary } from './shop-storefront-request-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/storefront-request-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopStorefrontRequestSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let seq = 0
function v1Request({ customerReference = 'CUST-1', fulfilment = 'pickup', totalMmk = 10_000 } = {}) {
  seq++
  return {
    schema: 'supermega.ecommerce.order_request.v1',
    mode: 'browser-local-request',
    state: 'pending_shop_review',
    id: `req-${seq}`,
    idempotencyKey: `ik-${seq}`,
    createdAt: '2026-08-11T08:00:00.000Z',
    sourcePreviewDigest: 'digest',
    customerReference,
    fulfilment,
    currency: 'MMK',
    line: { sku: 'SKU-A', name: 'Item A', variant: null, quantity: 1, unitPriceMmk: totalMmk },
    totalMmk,
  }
}

function v2Request({ customerReference = 'CUST-1', fulfilment = 'pickup', totalMmk = 10_000 } = {}) {
  seq++
  return {
    schema: 'supermega.ecommerce.order_request.v2',
    mode: 'browser-local-request',
    state: 'pending_shop_review',
    scope: 'supermega',
    id: `req-${seq}`,
    idempotencyKey: `ik-${seq}`,
    createdAt: '2026-08-11T08:00:00.000Z',
    sourcePreviewDigest: 'digest',
    sourceStorefrontRevision: null,
    sourceStorefrontActionId: null,
    customerReference,
    fulfilment,
    currency: 'MMK',
    lines: [{ sku: 'SKU-B', name: 'Item B', variant: null, quantity: 1, unitPriceMmk: totalMmk, lineTotalMmk: totalMmk }],
    quote: {
      schema: 'supermega.ecommerce.checkout_quote.v1',
      scope: 'supermega',
      quoteId: `q-${seq}`,
      idempotencyKey: `iq-${seq}`,
      quotedAt: '2026-08-11T08:00:00.000Z',
      expiresAt: '2026-08-11T09:00:00.000Z',
      sourcePreviewDigest: 'digest',
      pimDigest: 'digest',
      currency: 'MMK',
      customerReference,
      fulfilment,
      lines: [{ sku: 'SKU-B', name: 'Item B', variant: null, quantity: 1, unitPriceMmk: totalMmk, lineTotalMmk: totalMmk }],
      subtotalMmk: totalMmk,
      promotion: { adapter: 'shop_promotion_review', status: 'not_requested', code: null, amountMmk: 0 },
      tax: { adapter: 'price_inclusive', status: 'included', amountMmk: 0 },
      shipping: { adapter: 'pickup', status: 'included', amountMmk: 0 },
      payment: { adapter: 'pay_on_pickup', status: 'not_authorized', amountMmk: 0 },
      totalMmk,
      quoteDigest: 'qd',
    },
    totalMmk,
  }
}

function state(storefrontRequests = undefined) {
  return {
    items: [], orders: [], movements: [], closes: [],
    ...(storefrontRequests !== undefined ? { storefrontRequests } : {}),
  }
}

// 1. Empty state (no field) → all zeros
{
  const r = projectShopStorefrontRequestSummary(state())
  check(r.totalRequests === 0, 'empty: totalRequests 0')
  check(r.bySchema.v1 === 0, 'empty: bySchema.v1 0')
  check(r.bySchema.v2 === 0, 'empty: bySchema.v2 0')
  check(r.byFulfilment.pickup === 0, 'empty: byFulfilment.pickup 0')
  check(r.totalValueMmk === 0, 'empty: totalValueMmk 0')
  check(r.uniqueCustomers === 0, 'empty: uniqueCustomers 0')
}

// 2. Empty array → totalRequests 0
{
  const r = projectShopStorefrontRequestSummary(state([]))
  check(r.totalRequests === 0, 'empty-array: totalRequests 0')
}

// 3. Single V1 request, pickup, CUST-1
{
  const r = projectShopStorefrontRequestSummary(state([
    v1Request({ customerReference: 'CUST-1', fulfilment: 'pickup', totalMmk: 10_000 }),
  ]))
  check(r.totalRequests === 1, 'single-v1: totalRequests 1')
  check(r.bySchema.v1 === 1, 'single-v1: bySchema.v1 1')
  check(r.bySchema.v2 === 0, 'single-v1: bySchema.v2 0')
  check(r.byFulfilment.pickup === 1, 'single-v1: byFulfilment.pickup 1')
  check(r.byFulfilment.delivery === 0, 'single-v1: byFulfilment.delivery 0')
  check(r.totalValueMmk === 10_000, 'single-v1: totalValueMmk 10000')
  check(r.uniqueCustomers === 1, 'single-v1: uniqueCustomers 1')
  check(r.averageValueMmk === 10_000, 'single-v1: averageValueMmk 10000')
}

// 4. V2 request: bySchema.v2 1
{
  const r = projectShopStorefrontRequestSummary(state([
    v2Request({ totalMmk: 20_000 }),
  ]))
  check(r.bySchema.v2 === 1, 'v2: bySchema.v2 1')
}

// 5. Delivery fulfilment
{
  const r = projectShopStorefrontRequestSummary(state([
    v1Request({ fulfilment: 'delivery' }),
  ]))
  check(r.byFulfilment.delivery === 1, 'delivery: byFulfilment.delivery 1')
}

// 6. uniqueCustomers dedup: same customer, 2 requests → 1
{
  const r = projectShopStorefrontRequestSummary(state([
    v1Request({ customerReference: 'CUST-X' }),
    v2Request({ customerReference: 'CUST-X' }),
  ]))
  check(r.uniqueCustomers === 1, 'dedup-cust: uniqueCustomers 1')
  check(r.totalRequests === 2, 'dedup-cust: totalRequests 2')
}

// 7. totalValueMmk accumulates
{
  const r = projectShopStorefrontRequestSummary(state([
    v1Request({ totalMmk: 10_000 }),
    v2Request({ totalMmk: 15_000 }),
  ]))
  check(r.totalValueMmk === 25_000, 'accum: totalValueMmk 10k+15k=25k')
}

// 8. Two distinct customers → uniqueCustomers 2
{
  const r = projectShopStorefrontRequestSummary(state([
    v1Request({ customerReference: 'CUST-A' }),
    v1Request({ customerReference: 'CUST-B' }),
  ]))
  check(r.uniqueCustomers === 2, 'two-custs: uniqueCustomers 2')
}

// 9. averageValueMmk: (10k + 20k) / 2 = 15k
{
  const r = projectShopStorefrontRequestSummary(state([
    v1Request({ totalMmk: 10_000 }),
    v1Request({ totalMmk: 20_000 }),
  ]))
  check(r.averageValueMmk === 15_000, 'avg: (10k+20k)/2=15k')
}

// 10. averageValueMmk rounds: (10k + 11001) / 2 = 10500.5 → 10501
{
  const r = projectShopStorefrontRequestSummary(state([
    v1Request({ totalMmk: 10_000 }),
    v1Request({ totalMmk: 11_001 }),
  ]))
  check(r.averageValueMmk === 10_501, 'avg-round: Math.round(10500.5)=10501')
}

// 11. Mixed V1+V2
{
  const r = projectShopStorefrontRequestSummary(state([
    v1Request(),
    v1Request(),
    v2Request(),
  ]))
  check(r.bySchema.v1 === 2, 'mixed: bySchema.v1 2')
  check(r.bySchema.v2 === 1, 'mixed: bySchema.v2 1')
}

// 12. Mixed pickup+delivery
{
  const r = projectShopStorefrontRequestSummary(state([
    v1Request({ fulfilment: 'pickup' }),
    v2Request({ fulfilment: 'delivery' }),
  ]))
  check(r.byFulfilment.pickup === 1, 'mixed-fulfilment: pickup 1')
  check(r.byFulfilment.delivery === 1, 'mixed-fulfilment: delivery 1')
}

// 13. averageValueMmk 0 when empty (no field)
{
  const r = projectShopStorefrontRequestSummary(state())
  check(r.averageValueMmk === 0, 'avg-zero: averageValueMmk 0 when empty')
}

console.log(JSON.stringify({ ok: true, checks }))
