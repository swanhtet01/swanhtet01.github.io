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
function correctionIntent(customerMessageSent = false, refundStatus = 'none') {
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
  check(r.messageSentPartialRefundCount === 0, 'msg-none: messageSentPartialRefundCount 0')
  check(r.noMessageNoRefundCount === 0, 'msg-none: noMessageNoRefundCount 0')
}

// 3. Message sent + partial refund
{
  const r = projectEcommerceCorrectionIntentCustomerMessageRefundStatusBrief(state([
    correctionIntent(true, 'partial'),
  ]))
  check(r.totalIntents === 1, 'msg-partial: totalIntents 1')
  check(r.messageSentPartialRefundCount === 1, 'msg-partial: messageSentPartialRefundCount 1')
  check(r.messageSentFullRefundCount === 0, 'msg-partial: messageSentFullRefundCount 0')
  check(r.messageSentNoRefundCount === 0, 'msg-partial: messageSentNoRefundCount 0')
}

// 4. Message sent + full refund
{
  const r = projectEcommerceCorrectionIntentCustomerMessageRefundStatusBrief(state([
    correctionIntent(true, 'full'),
  ]))
  check(r.totalIntents === 1, 'msg-full: totalIntents 1')
  check(r.messageSentFullRefundCount === 1, 'msg-full: messageSentFullRefundCount 1')
  check(r.noMessageFullRefundCount === 0, 'msg-full: noMessageFullRefundCount 0')
}

// 5. No message + partial refund
{
  const r = projectEcommerceCorrectionIntentCustomerMessageRefundStatusBrief(state([
    correctionIntent(false, 'partial'),
  ]))
  check(r.totalIntents === 1, 'nomsg-partial: totalIntents 1')
  check(r.noMessagePartialRefundCount === 1, 'nomsg-partial: noMessagePartialRefundCount 1')
  check(r.messageSentPartialRefundCount === 0, 'nomsg-partial: messageSentPartialRefundCount 0')
}

// 6. Mixed: 2 msg+none, 1 msg+full, 1 noMsg+partial
{
  const r = projectEcommerceCorrectionIntentCustomerMessageRefundStatusBrief(state([
    correctionIntent(true, 'none'),
    correctionIntent(true, 'none'),
    correctionIntent(true, 'full'),
    correctionIntent(false, 'partial'),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.messageSentNoRefundCount === 2, 'mixed: messageSentNoRefundCount 2')
  check(r.messageSentFullRefundCount === 1, 'mixed: messageSentFullRefundCount 1')
  check(r.noMessagePartialRefundCount === 1, 'mixed: noMessagePartialRefundCount 1')
}

// 7. Grand total
{
  const r = projectEcommerceCorrectionIntentCustomerMessageRefundStatusBrief(state([
    correctionIntent(true, 'none'),
    correctionIntent(false, 'full'),
    correctionIntent(false, 'full'),
  ]))
  check(r.totalIntents === 3, 'grand-total: totalIntents 3')
  check(r.noMessageFullRefundCount === 2, 'grand-total: noMessageFullRefundCount 2')
}

console.log(`ecommerce-correction-intent-customer-message-refund-status-brief: ${checks} checks passed`)
