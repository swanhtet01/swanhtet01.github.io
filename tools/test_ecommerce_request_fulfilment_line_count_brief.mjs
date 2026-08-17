import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRequestFulfilmentLineCountBrief } from './ecommerce-request-fulfilment-line-count-brief.ts'`,
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

const { projectEcommerceRequestFulfilmentLineCountBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let reqId = 0
function line(i = 0) {
  return { sku: `SKU-${i}`, name: `Item ${i}`, variantId: null, variantLabel: null, quantity: 1, unitPriceMmk: 5000, totalMmk: 5000 }
}
function req(fulfilment = 'pickup', lineCount = 1) {
  reqId++
  const lines = Array.from({ length: lineCount }, (_, i) => line(i + 1))
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
    lines,
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
      lines,
      subtotalMmk: 5000 * lineCount,
      promotion: { adapter: 'shop_promotion_review', status: 'not_requested', code: null, amountMmk: 0 },
      tax: { adapter: 'price_inclusive', status: 'included', amountMmk: 0 },
      shipping: { adapter: 'pickup', status: 'included', amountMmk: 0 },
      payment: { adapter: 'pay_on_pickup', status: 'not_authorized', amountMmk: 0 },
      totalMmk: 5000 * lineCount,
      quoteDigest: `qd-${reqId}`,
    },
    totalMmk: 5000 * lineCount,
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
  const r = projectEcommerceRequestFulfilmentLineCountBrief(state())
  check(r.totalRequests === 0, 'empty: totalRequests 0')
  check(r.pickupSingleLineCount === 0, 'empty: pickupSingleLineCount 0')
  check(r.deliveryMultiLineCount === 0, 'empty: deliveryMultiLineCount 0')
}

// 2. Pickup + 1 line
{
  const r = projectEcommerceRequestFulfilmentLineCountBrief(state([req('pickup', 1)]))
  check(r.totalRequests === 1, 'pickup-single: totalRequests 1')
  check(r.pickupSingleLineCount === 1, 'pickup-single: pickupSingleLineCount 1')
  check(r.pickupMultiLineCount === 0, 'pickup-single: pickupMultiLineCount 0')
}

// 3. Pickup + 2 lines
{
  const r = projectEcommerceRequestFulfilmentLineCountBrief(state([req('pickup', 2)]))
  check(r.totalRequests === 1, 'pickup-multi: totalRequests 1')
  check(r.pickupSingleLineCount === 0, 'pickup-multi: pickupSingleLineCount 0')
  check(r.pickupMultiLineCount === 1, 'pickup-multi: pickupMultiLineCount 1')
}

// 4. Delivery + 1 line
{
  const r = projectEcommerceRequestFulfilmentLineCountBrief(state([req('delivery', 1)]))
  check(r.totalRequests === 1, 'delivery-single: totalRequests 1')
  check(r.deliverySingleLineCount === 1, 'delivery-single: deliverySingleLineCount 1')
  check(r.deliveryMultiLineCount === 0, 'delivery-single: deliveryMultiLineCount 0')
}

// 5. Delivery + 3 lines
{
  const r = projectEcommerceRequestFulfilmentLineCountBrief(state([req('delivery', 3)]))
  check(r.totalRequests === 1, 'delivery-multi: totalRequests 1')
  check(r.deliverySingleLineCount === 0, 'delivery-multi: deliverySingleLineCount 0')
  check(r.deliveryMultiLineCount === 1, 'delivery-multi: deliveryMultiLineCount 1')
}

// 6. Mixed: all 4 buckets
{
  const r = projectEcommerceRequestFulfilmentLineCountBrief(state([
    req('pickup', 1),
    req('pickup', 3),
    req('delivery', 1),
    req('delivery', 2),
  ]))
  check(r.totalRequests === 4, 'mixed: totalRequests 4')
  check(r.pickupSingleLineCount === 1, 'mixed: pickupSingleLineCount 1')
  check(r.pickupMultiLineCount === 1, 'mixed: pickupMultiLineCount 1')
  check(r.deliverySingleLineCount === 1, 'mixed: deliverySingleLineCount 1')
}

// 7. All delivery multi
{
  const r = projectEcommerceRequestFulfilmentLineCountBrief(state([
    req('delivery', 2),
    req('delivery', 4),
    req('delivery', 5),
  ]))
  check(r.totalRequests === 3, 'all-delivery-multi: totalRequests 3')
  check(r.deliveryMultiLineCount === 3, 'all-delivery-multi: deliveryMultiLineCount 3')
  check(r.pickupSingleLineCount === 0, 'all-delivery-multi: pickupSingleLineCount 0')
  check(
    r.pickupSingleLineCount + r.pickupMultiLineCount + r.deliverySingleLineCount + r.deliveryMultiLineCount === r.totalRequests,
    'all-delivery-multi: counts sum to total',
  )
}

console.log(`ecommerce-request-fulfilment-line-count-brief: ${checks} checks passed`)
