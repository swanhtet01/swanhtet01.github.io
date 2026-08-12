import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentCustomerMessagePaymentChangedBrief } from './ecommerce-correction-intent-customer-message-payment-changed-brief.ts'`,
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

const { projectEcommerceCorrectionIntentCustomerMessagePaymentChangedBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(customerMessageSent = false, paymentChanged = false) {
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
    orderChanged: false,
    paymentChanged,
    refundStarted: false,
    ledgerPosted: false,
    taxFiled: false,
    customerMessageSent,
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
  const r = projectEcommerceCorrectionIntentCustomerMessagePaymentChangedBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.messageSentPaymentChangedCount === 0, 'empty: messageSentPaymentChangedCount 0')
  check(r.noMessageNoPaymentChangeCount === 0, 'empty: noMessageNoPaymentChangeCount 0')
}

// 2. Message sent + payment changed
{
  const r = projectEcommerceCorrectionIntentCustomerMessagePaymentChangedBrief(state([
    correctionIntent(true, true),
  ]))
  check(r.totalIntents === 1, 'msg-pay: totalIntents 1')
  check(r.messageSentPaymentChangedCount === 1, 'msg-pay: messageSentPaymentChangedCount 1')
  check(r.messageSentNoPaymentChangeCount === 0, 'msg-pay: messageSentNoPaymentChangeCount 0')
  check(r.noMessagePaymentChangedCount === 0, 'msg-pay: noMessagePaymentChangedCount 0')
}

// 3. Message sent + no payment change
{
  const r = projectEcommerceCorrectionIntentCustomerMessagePaymentChangedBrief(state([
    correctionIntent(true, false),
  ]))
  check(r.totalIntents === 1, 'msg-nopay: totalIntents 1')
  check(r.messageSentNoPaymentChangeCount === 1, 'msg-nopay: messageSentNoPaymentChangeCount 1')
  check(r.noMessageNoPaymentChangeCount === 0, 'msg-nopay: noMessageNoPaymentChangeCount 0')
  check(r.messageSentPaymentChangedCount === 0, 'msg-nopay: messageSentPaymentChangedCount 0')
}

// 4. No message + payment changed
{
  const r = projectEcommerceCorrectionIntentCustomerMessagePaymentChangedBrief(state([
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 1, 'nomsg-pay: totalIntents 1')
  check(r.noMessagePaymentChangedCount === 1, 'nomsg-pay: noMessagePaymentChangedCount 1')
  check(r.messageSentPaymentChangedCount === 0, 'nomsg-pay: messageSentPaymentChangedCount 0')
}

// 5. No message + no payment change
{
  const r = projectEcommerceCorrectionIntentCustomerMessagePaymentChangedBrief(state([
    correctionIntent(false, false),
  ]))
  check(r.totalIntents === 1, 'nomsg-nopay: totalIntents 1')
  check(r.noMessageNoPaymentChangeCount === 1, 'nomsg-nopay: noMessageNoPaymentChangeCount 1')
  check(r.noMessagePaymentChangedCount === 0, 'nomsg-nopay: noMessagePaymentChangedCount 0')
}

// 6. Mixed: 2 msg+payChanged, 1 msg+noPay, 1 noMsg+payChanged
{
  const r = projectEcommerceCorrectionIntentCustomerMessagePaymentChangedBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.messageSentPaymentChangedCount === 2, 'mixed: messageSentPaymentChangedCount 2')
  check(r.messageSentNoPaymentChangeCount === 1, 'mixed: messageSentNoPaymentChangeCount 1')
  check(r.noMessagePaymentChangedCount === 1, 'mixed: noMessagePaymentChangedCount 1')
}

// 7. Row totals
{
  const r = projectEcommerceCorrectionIntentCustomerMessagePaymentChangedBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, false),
  ]))
  check(r.messageSentCount === 2, 'row-totals: messageSentCount 2')
  check(r.noMessageCount === 1, 'row-totals: noMessageCount 1')
}

console.log(`ecommerce-correction-intent-customer-message-payment-changed-brief: ${checks} checks passed`)
