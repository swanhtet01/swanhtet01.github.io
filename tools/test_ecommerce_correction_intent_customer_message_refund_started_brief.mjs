import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentCustomerMessageRefundStartedBrief } from './ecommerce-correction-intent-customer-message-refund-started-brief.ts'`,
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

const { projectEcommerceCorrectionIntentCustomerMessageRefundStartedBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(customerMessageSent = false, refundStarted = false) {
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
    paymentChanged: false,
    refundStarted,
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
  const r = projectEcommerceCorrectionIntentCustomerMessageRefundStartedBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.messageSentRefundStartedCount === 0, 'empty: messageSentRefundStartedCount 0')
  check(r.noMessageNoRefundCount === 0, 'empty: noMessageNoRefundCount 0')
}

// 2. Message sent + refund started
{
  const r = projectEcommerceCorrectionIntentCustomerMessageRefundStartedBrief(state([
    correctionIntent(true, true),
  ]))
  check(r.totalIntents === 1, 'msg-ref: totalIntents 1')
  check(r.messageSentRefundStartedCount === 1, 'msg-ref: messageSentRefundStartedCount 1')
  check(r.messageSentNoRefundCount === 0, 'msg-ref: messageSentNoRefundCount 0')
  check(r.noMessageRefundStartedCount === 0, 'msg-ref: noMessageRefundStartedCount 0')
}

// 3. Message sent + no refund
{
  const r = projectEcommerceCorrectionIntentCustomerMessageRefundStartedBrief(state([
    correctionIntent(true, false),
  ]))
  check(r.totalIntents === 1, 'msg-noref: totalIntents 1')
  check(r.messageSentNoRefundCount === 1, 'msg-noref: messageSentNoRefundCount 1')
  check(r.noMessageNoRefundCount === 0, 'msg-noref: noMessageNoRefundCount 0')
  check(r.messageSentRefundStartedCount === 0, 'msg-noref: messageSentRefundStartedCount 0')
}

// 4. No message + refund started
{
  const r = projectEcommerceCorrectionIntentCustomerMessageRefundStartedBrief(state([
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 1, 'nomsg-ref: totalIntents 1')
  check(r.noMessageRefundStartedCount === 1, 'nomsg-ref: noMessageRefundStartedCount 1')
  check(r.messageSentRefundStartedCount === 0, 'nomsg-ref: messageSentRefundStartedCount 0')
}

// 5. No message + no refund
{
  const r = projectEcommerceCorrectionIntentCustomerMessageRefundStartedBrief(state([
    correctionIntent(false, false),
  ]))
  check(r.totalIntents === 1, 'nomsg-noref: totalIntents 1')
  check(r.noMessageNoRefundCount === 1, 'nomsg-noref: noMessageNoRefundCount 1')
  check(r.noMessageRefundStartedCount === 0, 'nomsg-noref: noMessageRefundStartedCount 0')
}

// 6. Mixed: 2 msg+ref, 1 msg+noRef, 1 noMsg+ref
{
  const r = projectEcommerceCorrectionIntentCustomerMessageRefundStartedBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.messageSentRefundStartedCount === 2, 'mixed: messageSentRefundStartedCount 2')
  check(r.messageSentNoRefundCount === 1, 'mixed: messageSentNoRefundCount 1')
  check(r.noMessageRefundStartedCount === 1, 'mixed: noMessageRefundStartedCount 1')
}

// 7. Row totals
{
  const r = projectEcommerceCorrectionIntentCustomerMessageRefundStartedBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, false),
  ]))
  check(r.messageSentCount === 2, 'row-totals: messageSentCount 2')
  check(r.noMessageCount === 1, 'row-totals: noMessageCount 1')
}

console.log(`ecommerce-correction-intent-customer-message-refund-started-brief: ${checks} checks passed`)
