import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentOrderChangedPaymentChangedBrief } from './ecommerce-correction-intent-order-changed-payment-changed-brief.ts'`,
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

const { projectEcommerceCorrectionIntentOrderChangedPaymentChangedBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(orderChanged = false, paymentChanged = false) {
  intentId++
  return {
    schema: 'supermega.ecommerce.correction_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `ECI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceCalculationDigest: `scd-${intentId}`,
    sourceCorrectionCount: 0,
    originalBalanceMmk: 10000,
    paymentStatus: 'reconciled',
    refundStatus: 'none',
    requestedKind: 'credit',
    reasonCode: 'pricing_error',
    listedAmountMmk: 500,
    reason: 'Correction reason',
    orderChanged,
    paymentChanged,
    refundStarted: false,
    ledgerPosted: false,
    taxFiled: false,
    customerMessageSent: false,
    providerCalled: false,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(correctionIntents = []) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: 0,
    headDigest: 'hd-1',
    requests: [],
    returnIntents: [],
    supportIntents: [],
    correctionIntents,
    cancellationIntents: [],
    cancellationDecisions: [],
    amendmentIntents: [],
    rescheduleIntents: [],
    events: [],
  }
}

// 1. Empty state
{
  const r = projectEcommerceCorrectionIntentOrderChangedPaymentChangedBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.orderChangedPaymentChangedCount === 0, 'empty: orderChangedPaymentChangedCount 0')
  check(r.noOrderChangeNoPaymentChangeCount === 0, 'empty: noOrderChangeNoPaymentChangeCount 0')
}

// 2. Order changed + payment changed
{
  const r = projectEcommerceCorrectionIntentOrderChangedPaymentChangedBrief(state([
    correctionIntent(true, true),
  ]))
  check(r.totalIntents === 1, 'ord-pay: totalIntents 1')
  check(r.orderChangedPaymentChangedCount === 1, 'ord-pay: orderChangedPaymentChangedCount 1')
  check(r.orderChangedNoPaymentChangeCount === 0, 'ord-pay: orderChangedNoPaymentChangeCount 0')
  check(r.noOrderChangePaymentChangedCount === 0, 'ord-pay: noOrderChangePaymentChangedCount 0')
}

// 3. Order changed + no payment change
{
  const r = projectEcommerceCorrectionIntentOrderChangedPaymentChangedBrief(state([
    correctionIntent(true, false),
  ]))
  check(r.totalIntents === 1, 'ord-nopay: totalIntents 1')
  check(r.orderChangedNoPaymentChangeCount === 1, 'ord-nopay: orderChangedNoPaymentChangeCount 1')
  check(r.noOrderChangeNoPaymentChangeCount === 0, 'ord-nopay: noOrderChangeNoPaymentChangeCount 0')
  check(r.orderChangedPaymentChangedCount === 0, 'ord-nopay: orderChangedPaymentChangedCount 0')
}

// 4. No order change + payment changed
{
  const r = projectEcommerceCorrectionIntentOrderChangedPaymentChangedBrief(state([
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 1, 'noord-pay: totalIntents 1')
  check(r.noOrderChangePaymentChangedCount === 1, 'noord-pay: noOrderChangePaymentChangedCount 1')
  check(r.orderChangedPaymentChangedCount === 0, 'noord-pay: orderChangedPaymentChangedCount 0')
}

// 5. No order change + no payment change
{
  const r = projectEcommerceCorrectionIntentOrderChangedPaymentChangedBrief(state([
    correctionIntent(false, false),
  ]))
  check(r.totalIntents === 1, 'noord-nopay: totalIntents 1')
  check(r.noOrderChangeNoPaymentChangeCount === 1, 'noord-nopay: noOrderChangeNoPaymentChangeCount 1')
  check(r.noOrderChangePaymentChangedCount === 0, 'noord-nopay: noOrderChangePaymentChangedCount 0')
}

// 6. Mixed: 2 ord+payChanged, 1 ord+noPay, 1 noOrd+payChanged
{
  const r = projectEcommerceCorrectionIntentOrderChangedPaymentChangedBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.orderChangedPaymentChangedCount === 2, 'mixed: orderChangedPaymentChangedCount 2')
  check(r.orderChangedNoPaymentChangeCount === 1, 'mixed: orderChangedNoPaymentChangeCount 1')
  check(r.noOrderChangePaymentChangedCount === 1, 'mixed: noOrderChangePaymentChangedCount 1')
}

// 7. Row totals
{
  const r = projectEcommerceCorrectionIntentOrderChangedPaymentChangedBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, false),
  ]))
  check(r.orderChangedCount === 2, 'row-totals: orderChangedCount 2')
  check(r.noOrderChangeCount === 1, 'row-totals: noOrderChangeCount 1')
}

console.log(`ecommerce-correction-intent-order-changed-payment-changed-brief: ${checks} checks passed`)
