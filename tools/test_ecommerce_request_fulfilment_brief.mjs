// Ecommerce request fulfilment brief: pickup vs delivery enum distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRequestFulfilmentBrief } from './ecommerce-request-fulfilment-brief.ts'`,
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

const { projectEcommerceRequestFulfilmentBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let reqId = 0
function req(fulfilment = 'pickup') {
  reqId++
  return {
    schema: 'supermega.ecommerce.order_request.v2',
    mode: 'browser-local-request',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `REQ-${reqId}`,
    idempotencyKey: `ik-${reqId}`,
    createdAt: '2026-08-01T09:00:00Z',
    sourcePreviewDigest: 'spd-1',
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
      sourcePreviewDigest: 'spd-1',
      pimDigest: 'pim-1',
      currency: 'MMK',
      customerReference: `CUST-${reqId}`,
      fulfilment,
      lines: [],
      subtotalMmk: 1000,
      promotion: { adapter: 'shop_promotion_review', status: 'not_requested', code: null, amountMmk: 0 },
      tax: { adapter: 'price_inclusive', status: 'included', amountMmk: 0 },
      shipping: { adapter: 'pickup', status: 'included', amountMmk: 0 },
      payment: { adapter: 'pay_on_pickup', status: 'not_authorized', amountMmk: 0 },
      totalMmk: 1000,
      quoteDigest: `qd-${reqId}`,
    },
    totalMmk: 1000,
  }
}

function state(requests) {
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
  const r = projectEcommerceRequestFulfilmentBrief(state([]))
  check(r.totalRequests === 0, 'empty: totalRequests 0')
  check(r.pickupCount === 0, 'empty: pickupCount 0')
  check(r.deliveryCount === 0, 'empty: deliveryCount 0')
  check(r.pickupRate === 0, 'empty: pickupRate 0')
  check(r.deliveryRate === 0, 'empty: deliveryRate 0')
}

// 2. All pickup
{
  const r = projectEcommerceRequestFulfilmentBrief(state([req('pickup'), req('pickup'), req('pickup')]))
  check(r.totalRequests === 3, 'all-pickup: totalRequests 3')
  check(r.pickupCount === 3, 'all-pickup: pickupCount 3')
  check(r.deliveryCount === 0, 'all-pickup: deliveryCount 0')
  check(r.pickupRate === 100, 'all-pickup: pickupRate 100')
  check(r.deliveryRate === 0, 'all-pickup: deliveryRate 0')
}

// 3. All delivery
{
  const r = projectEcommerceRequestFulfilmentBrief(state([req('delivery'), req('delivery')]))
  check(r.totalRequests === 2, 'all-delivery: totalRequests 2')
  check(r.pickupCount === 0, 'all-delivery: pickupCount 0')
  check(r.deliveryCount === 2, 'all-delivery: deliveryCount 2')
  check(r.pickupRate === 0, 'all-delivery: pickupRate 0')
  check(r.deliveryRate === 100, 'all-delivery: deliveryRate 100')
}

// 4. 50/50 split
{
  const r = projectEcommerceRequestFulfilmentBrief(state([req('pickup'), req('delivery')]))
  check(r.totalRequests === 2, 'split: totalRequests 2')
  check(r.pickupCount === 1, 'split: pickupCount 1')
  check(r.deliveryCount === 1, 'split: deliveryCount 1')
  check(r.pickupRate === 50, 'split: pickupRate 50')
  check(r.deliveryRate === 50, 'split: deliveryRate 50')
}

// 5. Rounding: 1 pickup out of 3 → 33%, delivery 67%
{
  const r = projectEcommerceRequestFulfilmentBrief(
    state([req('pickup'), req('delivery'), req('delivery')]),
  )
  check(r.pickupRate === 33, 'round: pickupRate 33')
  check(r.deliveryRate === 67, 'round: deliveryRate 67')
}

// 6. Totals add up: pickupCount + deliveryCount === totalRequests
{
  const r = projectEcommerceRequestFulfilmentBrief(
    state([req('pickup'), req('pickup'), req('delivery'), req('pickup'), req('delivery')]),
  )
  check(r.pickupCount + r.deliveryCount === r.totalRequests, 'totals: counts sum to totalRequests')
  check(r.pickupCount === 3, 'totals: pickupCount 3')
  check(r.deliveryCount === 2, 'totals: deliveryCount 2')
}

// 7. Rounding: 2 pickup out of 3 → 67%, delivery 33%
{
  const r = projectEcommerceRequestFulfilmentBrief(
    state([req('pickup'), req('pickup'), req('delivery')]),
  )
  check(r.pickupRate === 67, 'round2: pickupRate 67')
  check(r.deliveryRate === 33, 'round2: deliveryRate 33')
}

// 8. Single pickup request
{
  const r = projectEcommerceRequestFulfilmentBrief(state([req('pickup')]))
  check(r.totalRequests === 1, 'single-pickup: totalRequests 1')
  check(r.pickupRate === 100, 'single-pickup: pickupRate 100')
  check(r.deliveryRate === 0, 'single-pickup: deliveryRate 0')
}

// 9. Single delivery request
{
  const r = projectEcommerceRequestFulfilmentBrief(state([req('delivery')]))
  check(r.totalRequests === 1, 'single-delivery: totalRequests 1')
  check(r.pickupRate === 0, 'single-delivery: pickupRate 0')
  check(r.deliveryRate === 100, 'single-delivery: deliveryRate 100')
}

console.log(JSON.stringify({ ok: true, checks }))
