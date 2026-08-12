import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentRefundStartedPaymentChangedBrief } from './ecommerce-correction-intent-refund-started-payment-changed-brief.ts'`,
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

const { projectEcommerceCorrectionIntentRefundStartedPaymentChangedBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(refundStarted = false, paymentChanged = false) {
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
    refundStarted,
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
  const r = projectEcommerceCorrectionIntentRefundStartedPaymentChangedBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.refundStartedPaymentChangedCount === 0, 'empty: refundStartedPaymentChangedCount 0')
  check(r.noRefundStartedNoPaymentChangeCount === 0, 'empty: noRefundStartedNoPaymentChangeCount 0')
}

// 2. Refund started + payment changed
{
  const r = projectEcommerceCorrectionIntentRefundStartedPaymentChangedBrief(state([
    correctionIntent(true, true),
  ]))
  check(r.totalIntents === 1, 'ref-pay: totalIntents 1')
  check(r.refundStartedPaymentChangedCount === 1, 'ref-pay: refundStartedPaymentChangedCount 1')
  check(r.refundStartedNoPaymentChangeCount === 0, 'ref-pay: refundStartedNoPaymentChangeCount 0')
  check(r.noRefundStartedPaymentChangedCount === 0, 'ref-pay: noRefundStartedPaymentChangedCount 0')
}

// 3. Refund started + no payment change
{
  const r = projectEcommerceCorrectionIntentRefundStartedPaymentChangedBrief(state([
    correctionIntent(true, false),
  ]))
  check(r.totalIntents === 1, 'ref-nopay: totalIntents 1')
  check(r.refundStartedNoPaymentChangeCount === 1, 'ref-nopay: refundStartedNoPaymentChangeCount 1')
  check(r.noRefundStartedNoPaymentChangeCount === 0, 'ref-nopay: noRefundStartedNoPaymentChangeCount 0')
  check(r.refundStartedPaymentChangedCount === 0, 'ref-nopay: refundStartedPaymentChangedCount 0')
}

// 4. No refund + payment changed
{
  const r = projectEcommerceCorrectionIntentRefundStartedPaymentChangedBrief(state([
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 1, 'noref-pay: totalIntents 1')
  check(r.noRefundStartedPaymentChangedCount === 1, 'noref-pay: noRefundStartedPaymentChangedCount 1')
  check(r.refundStartedPaymentChangedCount === 0, 'noref-pay: refundStartedPaymentChangedCount 0')
}

// 5. No refund + no payment change
{
  const r = projectEcommerceCorrectionIntentRefundStartedPaymentChangedBrief(state([
    correctionIntent(false, false),
  ]))
  check(r.totalIntents === 1, 'noref-nopay: totalIntents 1')
  check(r.noRefundStartedNoPaymentChangeCount === 1, 'noref-nopay: noRefundStartedNoPaymentChangeCount 1')
  check(r.noRefundStartedPaymentChangedCount === 0, 'noref-nopay: noRefundStartedPaymentChangedCount 0')
}

// 6. Mixed: 2 ref+payChanged, 1 ref+noPay, 1 noRef+payChanged
{
  const r = projectEcommerceCorrectionIntentRefundStartedPaymentChangedBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.refundStartedPaymentChangedCount === 2, 'mixed: refundStartedPaymentChangedCount 2')
  check(r.refundStartedNoPaymentChangeCount === 1, 'mixed: refundStartedNoPaymentChangeCount 1')
  check(r.noRefundStartedPaymentChangedCount === 1, 'mixed: noRefundStartedPaymentChangedCount 1')
}

// 7. Row totals
{
  const r = projectEcommerceCorrectionIntentRefundStartedPaymentChangedBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, false),
  ]))
  check(r.refundStartedCount === 2, 'row-totals: refundStartedCount 2')
  check(r.noRefundStartedCount === 1, 'row-totals: noRefundStartedCount 1')
}

console.log(`ecommerce-correction-intent-refund-started-payment-changed-brief: ${checks} checks passed`)
