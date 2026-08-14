import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRequestFulfilmentValueBrief } from './ecommerce-request-fulfilment-value-brief.ts'`,
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

const { projectEcommerceRequestFulfilmentValueBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let reqId = 0
function req(fulfilment = 'pickup', totalMmk = 10000) {
  reqId++
  return {
    schema: 'supermega.ecommerce.order_request.v2',
    mode: 'browser-local-request',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `REQ-${reqId}`,
    idempotencyKey: `ik-${reqId}`,
    createdAt: '2026-08-01T09:00:00Z',
    sourcePreviewDigest: `spd-${reqId}`,
    sourceStorefrontRevision: null,
    sourceStorefrontActionId: null,
    customerReference: `CUST-${reqId}`,
    fulfilment,
    currency: 'MMK',
    lines: [],
    quote: {
      schema: 'supermega.ecommerce.checkout_quote.v1',
      scope: 'scope-1',
      quoteId: `QID-${reqId}`,
      idempotencyKey: `ik-q-${reqId}`,
      quotedAt: '2026-08-01T09:00:00Z',
      expiresAt: '2026-08-01T10:00:00Z',
      sourcePreviewDigest: `spd-${reqId}`,
      pimDigest: `pim-${reqId}`,
      currency: 'MMK',
      customerReference: `CUST-${reqId}`,
      fulfilment,
      lines: [],
      subtotalMmk: totalMmk,
      promotion: { adapter: 'shop_promotion_review', status: 'not_requested', code: null, amountMmk: 0 },
      tax: { adapter: 'price_inclusive', status: 'included', amountMmk: 0 },
      shipping: { adapter: 'pickup', status: 'included', amountMmk: 0 },
      payment: { adapter: 'pay_on_pickup', status: 'not_authorized', amountMmk: 0 },
      totalMmk,
      quoteDigest: `qd-${reqId}`,
    },
    totalMmk,
  }
}

function state(requests = []) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: 0,
    headDigest: 'hd-1',
    requests,
    returnIntents: [],
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
  const r = projectEcommerceRequestFulfilmentValueBrief(state())
  check(r.totalRequests === 0, 'empty: totalRequests 0')
  check(r.pickupCount === 0, 'empty: pickupCount 0')
  check(r.minValueMmk === null, 'empty: minValueMmk null')
  check(r.maxValueMmk === null, 'empty: maxValueMmk null')
  check(r.averageValueMmk === 0, 'empty: averageValueMmk 0')
}

// 2. Single pickup (10000 MMK)
{
  const r = projectEcommerceRequestFulfilmentValueBrief(state([req('pickup', 10000)]))
  check(r.totalRequests === 1, 'single-pickup: totalRequests 1')
  check(r.pickupCount === 1, 'single-pickup: pickupCount 1')
  check(r.totalValueMmk === 10000, 'single-pickup: totalValueMmk 10000')
  check(r.averageValueMmk === 10000, 'single-pickup: averageValueMmk 10000')
}

// 3. Single delivery (20000 MMK)
{
  const r = projectEcommerceRequestFulfilmentValueBrief(state([req('delivery', 20000)]))
  check(r.totalRequests === 1, 'single-delivery: totalRequests 1')
  check(r.deliveryCount === 1, 'single-delivery: deliveryCount 1')
  check(r.pickupRate === 0, 'single-delivery: pickupRate 0')
  check(r.totalValueMmk === 20000, 'single-delivery: totalValueMmk 20000')
}

// 4. All pickup (3 × 10000 MMK)
{
  const r = projectEcommerceRequestFulfilmentValueBrief(state([
    req('pickup', 10000),
    req('pickup', 10000),
    req('pickup', 10000),
  ]))
  check(r.pickupCount === 3, 'all-pickup: pickupCount 3')
  check(r.pickupRate === 100, 'all-pickup: pickupRate 100')
  check(r.deliveryRate === 0, 'all-pickup: deliveryRate 0')
}

// 5. Mixed 2 pickup + 1 delivery — value stats and rates
{
  const r = projectEcommerceRequestFulfilmentValueBrief(state([
    req('pickup', 5000),
    req('pickup', 15000),
    req('delivery', 10000),
  ]))
  check(r.totalRequests === 3, 'mixed: totalRequests 3')
  check(r.pickupCount === 2, 'mixed: pickupCount 2')
  check(r.deliveryCount === 1, 'mixed: deliveryCount 1')
  check(r.totalValueMmk === 30000, 'mixed: totalValueMmk 30000')
  check(r.minValueMmk === 5000, 'mixed: minValueMmk 5000')
  check(r.maxValueMmk === 15000, 'mixed: maxValueMmk 15000')
  check(r.averageValueMmk === 10000, 'mixed: averageValueMmk 10000')
}

console.log(`ecommerce-request-fulfilment-value-brief: ${checks} checks passed`)
