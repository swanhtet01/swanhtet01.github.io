import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentPaymentChangedRefundStatusBrief } from './ecommerce-correction-intent-payment-changed-refund-status-brief.ts'`,
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

const { projectEcommerceCorrectionIntentPaymentChangedRefundStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(paymentChanged = false, refundStatus = 'none') {
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
    refundStatus,
    requestedKind: 'credit',
    reasonCode: 'pricing_error',
    listedAmountMmk: 500,
    reason: 'Correction reason',
    orderChanged: false,
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
  const r = projectEcommerceCorrectionIntentPaymentChangedRefundStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.paymentChangedNoRefundCount === 0, 'empty: paymentChangedNoRefundCount 0')
  check(r.noPaymentChangeNoRefundCount === 0, 'empty: noPaymentChangeNoRefundCount 0')
}

// 2. Payment changed + none
{
  const r = projectEcommerceCorrectionIntentPaymentChangedRefundStatusBrief(state([
    correctionIntent(true, 'none'),
  ]))
  check(r.totalIntents === 1, 'pay-none: totalIntents 1')
  check(r.paymentChangedNoRefundCount === 1, 'pay-none: paymentChangedNoRefundCount 1')
  check(r.paymentChangedDueCount === 0, 'pay-none: paymentChangedDueCount 0')
  check(r.noPaymentChangeNoRefundCount === 0, 'pay-none: noPaymentChangeNoRefundCount 0')
}

// 3. Payment changed + due
{
  const r = projectEcommerceCorrectionIntentPaymentChangedRefundStatusBrief(state([
    correctionIntent(true, 'due'),
  ]))
  check(r.totalIntents === 1, 'pay-due: totalIntents 1')
  check(r.paymentChangedDueCount === 1, 'pay-due: paymentChangedDueCount 1')
  check(r.paymentChangedSettledCount === 0, 'pay-due: paymentChangedSettledCount 0')
  check(r.paymentChangedNoRefundCount === 0, 'pay-due: paymentChangedNoRefundCount 0')
}

// 4. Payment changed + settled
{
  const r = projectEcommerceCorrectionIntentPaymentChangedRefundStatusBrief(state([
    correctionIntent(true, 'settled'),
  ]))
  check(r.totalIntents === 1, 'pay-settled: totalIntents 1')
  check(r.paymentChangedSettledCount === 1, 'pay-settled: paymentChangedSettledCount 1')
  check(r.noPaymentChangeSettledCount === 0, 'pay-settled: noPaymentChangeSettledCount 0')
}

// 5. No payment change + due
{
  const r = projectEcommerceCorrectionIntentPaymentChangedRefundStatusBrief(state([
    correctionIntent(false, 'due'),
  ]))
  check(r.totalIntents === 1, 'nopay-due: totalIntents 1')
  check(r.noPaymentChangeDueCount === 1, 'nopay-due: noPaymentChangeDueCount 1')
  check(r.paymentChangedDueCount === 0, 'nopay-due: paymentChangedDueCount 0')
}

// 6. Mixed: 2 pay+none, 1 pay+settled, 1 noPay+due
{
  const r = projectEcommerceCorrectionIntentPaymentChangedRefundStatusBrief(state([
    correctionIntent(true, 'none'),
    correctionIntent(true, 'none'),
    correctionIntent(true, 'settled'),
    correctionIntent(false, 'due'),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.paymentChangedNoRefundCount === 2, 'mixed: paymentChangedNoRefundCount 2')
  check(r.paymentChangedSettledCount === 1, 'mixed: paymentChangedSettledCount 1')
  check(r.noPaymentChangeDueCount === 1, 'mixed: noPaymentChangeDueCount 1')
}

// 7. Grand total
{
  const r = projectEcommerceCorrectionIntentPaymentChangedRefundStatusBrief(state([
    correctionIntent(false, 'settled'),
    correctionIntent(false, 'settled'),
    correctionIntent(true, 'none'),
  ]))
  check(r.totalIntents === 3, 'grand-total: totalIntents 3')
  check(r.noPaymentChangeSettledCount === 2, 'grand-total: noPaymentChangeSettledCount 2')
}

console.log(`ecommerce-correction-intent-payment-changed-refund-status-brief: ${checks} checks passed`)
