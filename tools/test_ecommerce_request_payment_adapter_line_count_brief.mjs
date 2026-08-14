import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRequestPaymentAdapterLineCountBrief } from './ecommerce-request-payment-adapter-line-count-brief.ts'`,
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

const { projectEcommerceRequestPaymentAdapterLineCountBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let reqId = 0
function req(paymentAdapter = 'cash_on_delivery', lineCount = 1) {
  reqId++
  const lines = Array.from({ length: lineCount }, (_, i) => ({
    sku: `SKU-${i + 1}`,
    name: `Item ${i + 1}`,
    quantity: 1,
    unitPriceMmk: 500,
    lineTotalMmk: 500,
  }))
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
    lines,
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
      lines,
      subtotalMmk: 1000,
      promotion: { adapter: 'shop_promotion_review', status: 'not_requested', code: null, amountMmk: 0 },
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
  const r = projectEcommerceRequestPaymentAdapterLineCountBrief(state())
  check(r.totalRequests === 0, 'empty: totalRequests 0')
  check(r.cashOnDeliverySingleCount === 0, 'empty: cashOnDeliverySingleCount 0')
  check(r.payOnPickupMultiCount === 0, 'empty: payOnPickupMultiCount 0')
}

// 2. cash_on_delivery + single line
{
  const r = projectEcommerceRequestPaymentAdapterLineCountBrief(state([
    req('cash_on_delivery', 1),
  ]))
  check(r.totalRequests === 1, 'cod-single: totalRequests 1')
  check(r.cashOnDeliverySingleCount === 1, 'cod-single: cashOnDeliverySingleCount 1')
  check(r.cashOnDeliveryMultiCount === 0, 'cod-single: cashOnDeliveryMultiCount 0')
  check(r.kbzpaySingleCount === 0, 'cod-single: kbzpaySingleCount 0')
}

// 3. kbzpay_manual + multi lines
{
  const r = projectEcommerceRequestPaymentAdapterLineCountBrief(state([
    req('kbzpay_manual', 3),
  ]))
  check(r.kbzpayMultiCount === 1, 'kbzpay-multi: kbzpayMultiCount 1')
  check(r.kbzpaySingleCount === 0, 'kbzpay-multi: kbzpaySingleCount 0')
  check(r.totalRequests === 1, 'kbzpay-multi: totalRequests 1')
  check(r.cashOnDeliveryMultiCount === 0, 'kbzpay-multi: cashOnDeliveryMultiCount 0')
}

// 4. pay_on_pickup + single line
{
  const r = projectEcommerceRequestPaymentAdapterLineCountBrief(state([
    req('pay_on_pickup', 1),
  ]))
  check(r.payOnPickupSingleCount === 1, 'pop-single: payOnPickupSingleCount 1')
  check(r.payOnPickupMultiCount === 0, 'pop-single: payOnPickupMultiCount 0')
  check(r.totalRequests === 1, 'pop-single: totalRequests 1')
}

// 5. cash_on_delivery + multi lines
{
  const r = projectEcommerceRequestPaymentAdapterLineCountBrief(state([
    req('cash_on_delivery', 2),
  ]))
  check(r.cashOnDeliveryMultiCount === 1, 'cod-multi: cashOnDeliveryMultiCount 1')
  check(r.cashOnDeliverySingleCount === 0, 'cod-multi: cashOnDeliverySingleCount 0')
  check(r.totalRequests === 1, 'cod-multi: totalRequests 1')
}

// 6. Three adapters with mixed line counts
{
  const r = projectEcommerceRequestPaymentAdapterLineCountBrief(state([
    req('cash_on_delivery', 1),
    req('cash_on_delivery', 2),
    req('kbzpay_manual', 1),
    req('kbzpay_manual', 3),
    req('pay_on_pickup', 1),
    req('pay_on_pickup', 4),
  ]))
  check(r.totalRequests === 6, 'all-cells: totalRequests 6')
  check(r.cashOnDeliverySingleCount === 1, 'all-cells: cashOnDeliverySingleCount 1')
  check(r.kbzpayMultiCount === 1, 'all-cells: kbzpayMultiCount 1')
  check(r.payOnPickupSingleCount === 1, 'all-cells: payOnPickupSingleCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceRequestPaymentAdapterLineCountBrief(state([
    req('cash_on_delivery', 1),
    req('cash_on_delivery', 2),
    req('kbzpay_manual', 1),
    req('kbzpay_manual', 3),
    req('pay_on_pickup', 1),
    req('pay_on_pickup', 4),
  ]))
  check(r.cashOnDeliveryMultiCount === 1, 'sub-buckets: cashOnDeliveryMultiCount 1')
  check(r.kbzpaySingleCount === 1, 'sub-buckets: kbzpaySingleCount 1')
}

console.log(`ecommerce-request-payment-adapter-line-count-brief: ${checks} checks passed`)
