import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentCustomerMessageRefundStatusBrief } from './ecommerce-correction-intent-customer-message-refund-status-brief.ts'`,
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

const { projectEcommerceCorrectionIntentCustomerMessageRefundStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(customerMessageSent = false, refundStatus = 'none') {  // refundStatus: none/due/settled
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
    paymentChanged: false,
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
  const r = projectEcommerceCorrectionIntentCustomerMessageRefundStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.messageSentNoRefundCount === 0, 'empty: messageSentNoRefundCount 0')
  check(r.noMessageNoRefundCount === 0, 'empty: noMessageNoRefundCount 0')
}

// 2. Message sent + no refund
{
  const r = projectEcommerceCorrectionIntentCustomerMessageRefundStatusBrief(state([
    correctionIntent(true, 'none'),
  ]))
  check(r.totalIntents === 1, 'msg-none: totalIntents 1')
  check(r.messageSentNoRefundCount === 1, 'msg-none: messageSentNoRefundCount 1')
  check(r.messageSentDueCount === 0, 'msg-none: messageSentDueCount 0')
  check(r.noMessageNoRefundCount === 0, 'msg-none: noMessageNoRefundCount 0')
}

// 3. Message sent + due
{
  const r = projectEcommerceCorrectionIntentCustomerMessageRefundStatusBrief(state([
    correctionIntent(true, 'due'),
  ]))
  check(r.totalIntents === 1, 'msg-due: totalIntents 1')
  check(r.messageSentDueCount === 1, 'msg-due: messageSentDueCount 1')
  check(r.messageSentSettledCount === 0, 'msg-due: messageSentSettledCount 0')
  check(r.messageSentNoRefundCount === 0, 'msg-due: messageSentNoRefundCount 0')
}

// 4. Message sent + settled
{
  const r = projectEcommerceCorrectionIntentCustomerMessageRefundStatusBrief(state([
    correctionIntent(true, 'settled'),
  ]))
  check(r.totalIntents === 1, 'msg-settled: totalIntents 1')
  check(r.messageSentSettledCount === 1, 'msg-settled: messageSentSettledCount 1')
  check(r.noMessageSettledCount === 0, 'msg-settled: noMessageSettledCount 0')
}

// 5. No message + due
{
  const r = projectEcommerceCorrectionIntentCustomerMessageRefundStatusBrief(state([
    correctionIntent(false, 'due'),
  ]))
  check(r.totalIntents === 1, 'nomsg-due: totalIntents 1')
  check(r.noMessageDueCount === 1, 'nomsg-due: noMessageDueCount 1')
  check(r.messageSentDueCount === 0, 'nomsg-due: messageSentDueCount 0')
}

// 6. Mixed: 2 msg+none, 1 msg+settled, 1 noMsg+due
{
  const r = projectEcommerceCorrectionIntentCustomerMessageRefundStatusBrief(state([
    correctionIntent(true, 'none'),
    correctionIntent(true, 'none'),
    correctionIntent(true, 'settled'),
    correctionIntent(false, 'due'),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.messageSentNoRefundCount === 2, 'mixed: messageSentNoRefundCount 2')
  check(r.messageSentSettledCount === 1, 'mixed: messageSentSettledCount 1')
  check(r.noMessageDueCount === 1, 'mixed: noMessageDueCount 1')
}

// 7. Grand total
{
  const r = projectEcommerceCorrectionIntentCustomerMessageRefundStatusBrief(state([
    correctionIntent(true, 'none'),
    correctionIntent(false, 'settled'),
    correctionIntent(false, 'settled'),
  ]))
  check(r.totalIntents === 3, 'grand-total: totalIntents 3')
  check(r.noMessageSettledCount === 2, 'grand-total: noMessageSettledCount 2')
}

console.log(`ecommerce-correction-intent-customer-message-refund-status-brief: ${checks} checks passed`)
