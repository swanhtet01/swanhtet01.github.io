import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRequestPaymentAdapterFulfilmentBrief } from './ecommerce-request-payment-adapter-fulfilment-brief.ts'`,
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

const { projectEcommerceRequestPaymentAdapterFulfilmentBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let reqId = 0
function req(paymentAdapter = 'pay_on_pickup', fulfilment = 'pickup') {
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
      shipping: { adapter: fulfilment === 'pickup' ? 'pickup' : 'flat_rate', status: 'included', amountMmk: 0 },
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
  const r = projectEcommerceRequestPaymentAdapterFulfilmentBrief(state())
  check(r.totalRequests === 0, 'empty: totalRequests 0')
  check(r.payOnPickupPickupCount === 0, 'empty: payOnPickupPickupCount 0')
  check(r.cashOnDeliveryDeliveryCount === 0, 'empty: cashOnDeliveryDeliveryCount 0')
}

// 2. Single pay_on_pickup + pickup
{
  const r = projectEcommerceRequestPaymentAdapterFulfilmentBrief(state([
    req('pay_on_pickup', 'pickup'),
  ]))
  check(r.totalRequests === 1, 'pop-pickup: totalRequests 1')
  check(r.payOnPickupPickupCount === 1, 'pop-pickup: payOnPickupPickupCount 1')
  check(r.payOnPickupDeliveryCount === 0, 'pop-pickup: payOnPickupDeliveryCount 0')
}

// 3. Single cash_on_delivery + delivery
{
  const r = projectEcommerceRequestPaymentAdapterFulfilmentBrief(state([
    req('cash_on_delivery', 'delivery'),
  ]))
  check(r.cashOnDeliveryDeliveryCount === 1, 'cod-delivery: cashOnDeliveryDeliveryCount 1')
  check(r.cashOnDeliveryPickupCount === 0, 'cod-delivery: cashOnDeliveryPickupCount 0')
  check(r.payOnPickupPickupCount === 0, 'cod-delivery: payOnPickupPickupCount 0')
}

// 4. Single kbzpay_manual + pickup
{
  const r = projectEcommerceRequestPaymentAdapterFulfilmentBrief(state([
    req('kbzpay_manual', 'pickup'),
  ]))
  check(r.kbzpayManualPickupCount === 1, 'kbz-pickup: kbzpayManualPickupCount 1')
  check(r.kbzpayManualDeliveryCount === 0, 'kbz-pickup: kbzpayManualDeliveryCount 0')
  check(r.totalRequests === 1, 'kbz-pickup: totalRequests 1')
}

// 5. pay_on_pickup: one pickup + one delivery
{
  const r = projectEcommerceRequestPaymentAdapterFulfilmentBrief(state([
    req('pay_on_pickup', 'pickup'),
    req('pay_on_pickup', 'delivery'),
  ]))
  check(r.payOnPickupPickupCount === 1, 'pop-both: payOnPickupPickupCount 1')
  check(r.payOnPickupDeliveryCount === 1, 'pop-both: payOnPickupDeliveryCount 1')
  check(r.cashOnDeliveryPickupCount === 0, 'pop-both: cashOnDeliveryPickupCount 0')
  check(r.kbzpayManualPickupCount === 0, 'pop-both: kbzpayManualPickupCount 0')
}

// 6. All 6 cells filled (one each)
{
  const r = projectEcommerceRequestPaymentAdapterFulfilmentBrief(state([
    req('pay_on_pickup', 'pickup'),
    req('pay_on_pickup', 'delivery'),
    req('cash_on_delivery', 'pickup'),
    req('cash_on_delivery', 'delivery'),
    req('kbzpay_manual', 'pickup'),
    req('kbzpay_manual', 'delivery'),
  ]))
  check(r.totalRequests === 6, 'all-cells: totalRequests 6')
  check(r.payOnPickupPickupCount === 1, 'all-cells: payOnPickupPickupCount 1')
  check(r.cashOnDeliveryDeliveryCount === 1, 'all-cells: cashOnDeliveryDeliveryCount 1')
  check(r.kbzpayManualDeliveryCount === 1, 'all-cells: kbzpayManualDeliveryCount 1')
}

// 7. Pickup and delivery columns sum to totalRequests
{
  const r = projectEcommerceRequestPaymentAdapterFulfilmentBrief(state([
    req('pay_on_pickup', 'pickup'),
    req('cash_on_delivery', 'delivery'),
    req('kbzpay_manual', 'pickup'),
  ]))
  const pickupTotal = r.payOnPickupPickupCount + r.cashOnDeliveryPickupCount + r.kbzpayManualPickupCount
  const deliveryTotal = r.payOnPickupDeliveryCount + r.cashOnDeliveryDeliveryCount + r.kbzpayManualDeliveryCount
  check(pickupTotal + deliveryTotal === r.totalRequests, 'invariant: pickup+delivery=total')
  check(pickupTotal === 2, 'invariant: pickupTotal 2')
  check(deliveryTotal === 1, 'invariant: deliveryTotal 1')
}

console.log(`ecommerce-request-payment-adapter-fulfilment-brief: ${checks} checks passed`)
