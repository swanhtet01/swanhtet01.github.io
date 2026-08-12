import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRequestPaymentAdapterPromotionBrief } from './ecommerce-request-payment-adapter-promotion-brief.ts'`,
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

const { projectEcommerceRequestPaymentAdapterPromotionBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let reqId = 0
function req(paymentAdapter = 'cash_on_delivery', hasPromo = false) {
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
    fulfilment: 'delivery',
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
      fulfilment: 'delivery',
      lines: [],
      subtotalMmk: 1000,
      promotion: {
        adapter: 'shop_promotion_review',
        status: hasPromo ? 'pending_shop_review' : 'not_requested',
        code: hasPromo ? 'PROMO10' : null,
        amountMmk: 0,
      },
      tax: { adapter: 'price_inclusive', status: 'included', amountMmk: 0 },
      shipping: { adapter: 'flat_rate', status: 'included', amountMmk: 0 },
      payment: { adapter: paymentAdapter, status: 'not_authorized', amountMmk: 0 },
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
  const r = projectEcommerceRequestPaymentAdapterPromotionBrief(state())
  check(r.totalRequests === 0, 'empty: totalRequests 0')
  check(r.cashOnDeliveryWithPromoCount === 0, 'empty: cashOnDeliveryWithPromoCount 0')
  check(r.payOnPickupWithoutPromoCount === 0, 'empty: payOnPickupWithoutPromoCount 0')
}

// 2. cash_on_delivery + no promo
{
  const r = projectEcommerceRequestPaymentAdapterPromotionBrief(state([
    req('cash_on_delivery', false),
  ]))
  check(r.totalRequests === 1, 'cod-no-promo: totalRequests 1')
  check(r.cashOnDeliveryWithoutPromoCount === 1, 'cod-no-promo: cashOnDeliveryWithoutPromoCount 1')
  check(r.cashOnDeliveryWithPromoCount === 0, 'cod-no-promo: cashOnDeliveryWithPromoCount 0')
  check(r.kbzpayWithoutPromoCount === 0, 'cod-no-promo: kbzpayWithoutPromoCount 0')
}

// 3. kbzpay_manual + with promo
{
  const r = projectEcommerceRequestPaymentAdapterPromotionBrief(state([
    req('kbzpay_manual', true),
  ]))
  check(r.kbzpayWithPromoCount === 1, 'kbzpay-promo: kbzpayWithPromoCount 1')
  check(r.kbzpayWithoutPromoCount === 0, 'kbzpay-promo: kbzpayWithoutPromoCount 0')
  check(r.totalRequests === 1, 'kbzpay-promo: totalRequests 1')
  check(r.cashOnDeliveryWithPromoCount === 0, 'kbzpay-promo: cashOnDeliveryWithPromoCount 0')
}

// 4. pay_on_pickup + no promo
{
  const r = projectEcommerceRequestPaymentAdapterPromotionBrief(state([
    req('pay_on_pickup', false),
  ]))
  check(r.payOnPickupWithoutPromoCount === 1, 'pop-no-promo: payOnPickupWithoutPromoCount 1')
  check(r.payOnPickupWithPromoCount === 0, 'pop-no-promo: payOnPickupWithPromoCount 0')
  check(r.totalRequests === 1, 'pop-no-promo: totalRequests 1')
}

// 5. cash_on_delivery + with promo
{
  const r = projectEcommerceRequestPaymentAdapterPromotionBrief(state([
    req('cash_on_delivery', true),
  ]))
  check(r.cashOnDeliveryWithPromoCount === 1, 'cod-promo: cashOnDeliveryWithPromoCount 1')
  check(r.cashOnDeliveryWithoutPromoCount === 0, 'cod-promo: cashOnDeliveryWithoutPromoCount 0')
  check(r.totalRequests === 1, 'cod-promo: totalRequests 1')
}

// 6. Three adapters each with and without promo
{
  const r = projectEcommerceRequestPaymentAdapterPromotionBrief(state([
    req('cash_on_delivery', false),
    req('cash_on_delivery', true),
    req('kbzpay_manual', false),
    req('kbzpay_manual', true),
    req('pay_on_pickup', false),
    req('pay_on_pickup', true),
  ]))
  check(r.totalRequests === 6, 'all-cells: totalRequests 6')
  check(r.cashOnDeliveryWithPromoCount === 1, 'all-cells: cashOnDeliveryWithPromoCount 1')
  check(r.kbzpayWithPromoCount === 1, 'all-cells: kbzpayWithPromoCount 1')
  check(r.payOnPickupWithoutPromoCount === 1, 'all-cells: payOnPickupWithoutPromoCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceRequestPaymentAdapterPromotionBrief(state([
    req('cash_on_delivery', false),
    req('cash_on_delivery', true),
    req('kbzpay_manual', false),
    req('kbzpay_manual', true),
    req('pay_on_pickup', false),
    req('pay_on_pickup', true),
  ]))
  check(r.cashOnDeliveryWithoutPromoCount === 1, 'sub-buckets: cashOnDeliveryWithoutPromoCount 1')
  check(r.kbzpayWithoutPromoCount === 1, 'sub-buckets: kbzpayWithoutPromoCount 1')
}

console.log(`ecommerce-request-payment-adapter-promotion-brief: ${checks} checks passed`)
