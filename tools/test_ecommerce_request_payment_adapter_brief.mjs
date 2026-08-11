// Ecommerce request payment adapter brief: pay_on_pickup / cash_on_delivery / kbzpay_manual distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRequestPaymentAdapterBrief } from './ecommerce-request-payment-adapter-brief.ts'`,
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

const { projectEcommerceRequestPaymentAdapterBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let reqId = 0
function req(paymentAdapter = 'pay_on_pickup') {
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
    fulfilment: 'pickup',
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
      fulfilment: 'pickup',
      lines: [],
      subtotalMmk: 1000,
      promotion: { adapter: 'shop_promotion_review', status: 'not_requested', code: null, amountMmk: 0 },
      tax: { adapter: 'price_inclusive', status: 'included', amountMmk: 0 },
      shipping: { adapter: 'pickup', status: 'included', amountMmk: 0 },
      payment: { adapter: paymentAdapter, status: 'not_authorized', amountMmk: 0 },
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
  const r = projectEcommerceRequestPaymentAdapterBrief(state([]))
  check(r.totalRequests === 0, 'empty: totalRequests 0')
  check(r.payOnPickupCount === 0, 'empty: payOnPickupCount 0')
  check(r.cashOnDeliveryCount === 0, 'empty: cashOnDeliveryCount 0')
  check(r.kbzpayManualCount === 0, 'empty: kbzpayManualCount 0')
  check(r.payOnPickupRate === 0, 'empty: payOnPickupRate 0')
  check(r.cashOnDeliveryRate === 0, 'empty: cashOnDeliveryRate 0')
  check(r.kbzpayManualRate === 0, 'empty: kbzpayManualRate 0')
}

// 2. All pay_on_pickup
{
  const r = projectEcommerceRequestPaymentAdapterBrief(
    state([req('pay_on_pickup'), req('pay_on_pickup')]),
  )
  check(r.totalRequests === 2, 'all-pop: totalRequests 2')
  check(r.payOnPickupCount === 2, 'all-pop: payOnPickupCount 2')
  check(r.cashOnDeliveryCount === 0, 'all-pop: cashOnDeliveryCount 0')
  check(r.kbzpayManualCount === 0, 'all-pop: kbzpayManualCount 0')
  check(r.payOnPickupRate === 100, 'all-pop: payOnPickupRate 100')
  check(r.cashOnDeliveryRate === 0, 'all-pop: cashOnDeliveryRate 0')
  check(r.kbzpayManualRate === 0, 'all-pop: kbzpayManualRate 0')
}

// 3. All cash_on_delivery
{
  const r = projectEcommerceRequestPaymentAdapterBrief(
    state([req('cash_on_delivery'), req('cash_on_delivery'), req('cash_on_delivery')]),
  )
  check(r.totalRequests === 3, 'all-cod: totalRequests 3')
  check(r.payOnPickupCount === 0, 'all-cod: payOnPickupCount 0')
  check(r.cashOnDeliveryCount === 3, 'all-cod: cashOnDeliveryCount 3')
  check(r.kbzpayManualCount === 0, 'all-cod: kbzpayManualCount 0')
  check(r.cashOnDeliveryRate === 100, 'all-cod: cashOnDeliveryRate 100')
}

// 4. All kbzpay_manual
{
  const r = projectEcommerceRequestPaymentAdapterBrief(state([req('kbzpay_manual')]))
  check(r.totalRequests === 1, 'all-kbz: totalRequests 1')
  check(r.kbzpayManualCount === 1, 'all-kbz: kbzpayManualCount 1')
  check(r.kbzpayManualRate === 100, 'all-kbz: kbzpayManualRate 100')
  check(r.payOnPickupRate === 0, 'all-kbz: payOnPickupRate 0')
  check(r.cashOnDeliveryRate === 0, 'all-kbz: cashOnDeliveryRate 0')
}

// 5. Even split: 1 of each
{
  const r = projectEcommerceRequestPaymentAdapterBrief(
    state([req('pay_on_pickup'), req('cash_on_delivery'), req('kbzpay_manual')]),
  )
  check(r.totalRequests === 3, 'split: totalRequests 3')
  check(r.payOnPickupCount === 1, 'split: payOnPickupCount 1')
  check(r.cashOnDeliveryCount === 1, 'split: cashOnDeliveryCount 1')
  check(r.kbzpayManualCount === 1, 'split: kbzpayManualCount 1')
  check(r.payOnPickupRate === 33, 'split: payOnPickupRate 33')
  check(r.cashOnDeliveryRate === 33, 'split: cashOnDeliveryRate 33')
  check(r.kbzpayManualRate === 33, 'split: kbzpayManualRate 33')
}

// 6. Mixed: 2 pop, 1 cod → rates 67% / 33% / 0%
{
  const r = projectEcommerceRequestPaymentAdapterBrief(
    state([req('pay_on_pickup'), req('pay_on_pickup'), req('cash_on_delivery')]),
  )
  check(r.payOnPickupRate === 67, 'mixed: payOnPickupRate 67')
  check(r.cashOnDeliveryRate === 33, 'mixed: cashOnDeliveryRate 33')
  check(r.kbzpayManualRate === 0, 'mixed: kbzpayManualRate 0')
}

// 7. Counts sum to totalRequests
{
  const r = projectEcommerceRequestPaymentAdapterBrief(
    state([
      req('pay_on_pickup'),
      req('cash_on_delivery'),
      req('kbzpay_manual'),
      req('pay_on_pickup'),
    ]),
  )
  check(
    r.payOnPickupCount + r.cashOnDeliveryCount + r.kbzpayManualCount === r.totalRequests,
    'invariant: counts sum to totalRequests',
  )
  check(r.totalRequests === 4, 'invariant: totalRequests 4')
}

// 8. Rounding: 1 kbzpay out of 4 → 25%
{
  const r = projectEcommerceRequestPaymentAdapterBrief(
    state([
      req('pay_on_pickup'),
      req('pay_on_pickup'),
      req('pay_on_pickup'),
      req('kbzpay_manual'),
    ]),
  )
  check(r.kbzpayManualRate === 25, 'round: kbzpayManualRate 25')
  check(r.payOnPickupRate === 75, 'round: payOnPickupRate 75')
}

console.log(JSON.stringify({ ok: true, checks }))
