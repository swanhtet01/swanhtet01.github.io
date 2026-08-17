import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRequestFulfilmentPromotionBrief } from './ecommerce-request-fulfilment-promotion-brief.ts'`,
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

const { projectEcommerceRequestFulfilmentPromotionBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let reqId = 0
function req(fulfilment = 'delivery', hasPromo = false) {
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
      promotion: {
        adapter: 'shop_promotion_review',
        status: hasPromo ? 'pending_shop_review' : 'not_requested',
        code: hasPromo ? 'PROMO10' : null,
        amountMmk: 0,
      },
      tax: { adapter: 'price_inclusive', status: 'included', amountMmk: 0 },
      shipping: { adapter: fulfilment === 'pickup' ? 'pickup' : 'flat_rate', status: 'included', amountMmk: 0 },
      payment: { adapter: fulfilment === 'pickup' ? 'pay_on_pickup' : 'cash_on_delivery', status: 'not_authorized', amountMmk: 0 },
      totalMmk: 1000,
      quoteDigest: `qd-${reqId}`,
    },
    totalMmk: 1000,
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
  const r = projectEcommerceRequestFulfilmentPromotionBrief(state())
  check(r.totalRequests === 0, 'empty: totalRequests 0')
  check(r.deliveryWithPromoCount === 0, 'empty: deliveryWithPromoCount 0')
  check(r.pickupWithoutPromoCount === 0, 'empty: pickupWithoutPromoCount 0')
}

// 2. Delivery without promo
{
  const r = projectEcommerceRequestFulfilmentPromotionBrief(state([
    req('delivery', false),
  ]))
  check(r.totalRequests === 1, 'delivery-no-promo: totalRequests 1')
  check(r.deliveryWithoutPromoCount === 1, 'delivery-no-promo: deliveryWithoutPromoCount 1')
  check(r.deliveryWithPromoCount === 0, 'delivery-no-promo: deliveryWithPromoCount 0')
  check(r.pickupWithoutPromoCount === 0, 'delivery-no-promo: pickupWithoutPromoCount 0')
}

// 3. Delivery with promo
{
  const r = projectEcommerceRequestFulfilmentPromotionBrief(state([
    req('delivery', true),
  ]))
  check(r.deliveryWithPromoCount === 1, 'delivery-promo: deliveryWithPromoCount 1')
  check(r.deliveryWithoutPromoCount === 0, 'delivery-promo: deliveryWithoutPromoCount 0')
  check(r.totalRequests === 1, 'delivery-promo: totalRequests 1')
  check(r.pickupWithPromoCount === 0, 'delivery-promo: pickupWithPromoCount 0')
}

// 4. Pickup without promo
{
  const r = projectEcommerceRequestFulfilmentPromotionBrief(state([
    req('pickup', false),
  ]))
  check(r.pickupWithoutPromoCount === 1, 'pickup-no-promo: pickupWithoutPromoCount 1')
  check(r.pickupWithPromoCount === 0, 'pickup-no-promo: pickupWithPromoCount 0')
  check(r.totalRequests === 1, 'pickup-no-promo: totalRequests 1')
}

// 5. Pickup with promo
{
  const r = projectEcommerceRequestFulfilmentPromotionBrief(state([
    req('pickup', true),
  ]))
  check(r.pickupWithPromoCount === 1, 'pickup-promo: pickupWithPromoCount 1')
  check(r.pickupWithoutPromoCount === 0, 'pickup-promo: pickupWithoutPromoCount 0')
  check(r.totalRequests === 1, 'pickup-promo: totalRequests 1')
}

// 6. All 4 cells
{
  const r = projectEcommerceRequestFulfilmentPromotionBrief(state([
    req('delivery', false),
    req('delivery', true),
    req('pickup', false),
    req('pickup', true),
  ]))
  check(r.totalRequests === 4, 'all-cells: totalRequests 4')
  check(r.deliveryWithPromoCount === 1, 'all-cells: deliveryWithPromoCount 1')
  check(r.pickupWithoutPromoCount === 1, 'all-cells: pickupWithoutPromoCount 1')
  check(r.deliveryCount === 2, 'all-cells: deliveryCount 2')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceRequestFulfilmentPromotionBrief(state([
    req('delivery', false),
    req('delivery', true),
    req('pickup', false),
    req('pickup', true),
  ]))
  check(r.deliveryWithoutPromoCount === 1, 'sub-buckets: deliveryWithoutPromoCount 1')
  check(r.pickupWithPromoCount === 1, 'sub-buckets: pickupWithPromoCount 1')
}

console.log(`ecommerce-request-fulfilment-promotion-brief: ${checks} checks passed`)
