import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationIntentCustomerMessageRefundStatusBrief } from './ecommerce-cancellation-intent-customer-message-refund-status-brief.ts'`,
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

const { projectEcommerceCancellationIntentCustomerMessageRefundStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function cancellationIntent(customerMessageSent = false, refundStatus = 'none') {
  intentId++
  return {
    schema: 'supermega.ecommerce.cancellation_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `ECI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus,
    totalMmk: 10000,
    reasonCode: 'changed_mind',
    reason: 'Cancellation reason',
    customerMessageSent,
    orderCancelled: false,
    refundStarted: false,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(cancellationIntents = []) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: 0,
    headDigest: 'hd-1',
    requests: [],
    returnIntents: [],
    supportIntents: [],
    correctionIntents: [],
    cancellationIntents,
    cancellationDecisions: [],
    amendmentIntents: [],
    rescheduleIntents: [],
    events: [],
  }
}

// 1. Empty state
{
  const r = projectEcommerceCancellationIntentCustomerMessageRefundStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.messageSentNoneCount === 0, 'empty: messageSentNoneCount 0')
  check(r.noMessageNoneCount === 0, 'empty: noMessageNoneCount 0')
}

// 2. Message sent + none
{
  const r = projectEcommerceCancellationIntentCustomerMessageRefundStatusBrief(state([
    cancellationIntent(true, 'none'),
  ]))
  check(r.totalIntents === 1, 'msg-none: totalIntents 1')
  check(r.messageSentNoneCount === 1, 'msg-none: messageSentNoneCount 1')
  check(r.messageSentDueCount === 0, 'msg-none: messageSentDueCount 0')
  check(r.noMessageNoneCount === 0, 'msg-none: noMessageNoneCount 0')
}

// 3. Message sent + due
{
  const r = projectEcommerceCancellationIntentCustomerMessageRefundStatusBrief(state([
    cancellationIntent(true, 'due'),
  ]))
  check(r.totalIntents === 1, 'msg-due: totalIntents 1')
  check(r.messageSentDueCount === 1, 'msg-due: messageSentDueCount 1')
  check(r.messageSentNoneCount === 0, 'msg-due: messageSentNoneCount 0')
  check(r.noMessageDueCount === 0, 'msg-due: noMessageDueCount 0')
}

// 4. Message sent + settled
{
  const r = projectEcommerceCancellationIntentCustomerMessageRefundStatusBrief(state([
    cancellationIntent(true, 'settled'),
  ]))
  check(r.totalIntents === 1, 'msg-settled: totalIntents 1')
  check(r.messageSentSettledCount === 1, 'msg-settled: messageSentSettledCount 1')
  check(r.noMessageSettledCount === 0, 'msg-settled: noMessageSettledCount 0')
}

// 5. No message + none
{
  const r = projectEcommerceCancellationIntentCustomerMessageRefundStatusBrief(state([
    cancellationIntent(false, 'none'),
  ]))
  check(r.totalIntents === 1, 'no-msg-none: totalIntents 1')
  check(r.noMessageNoneCount === 1, 'no-msg-none: noMessageNoneCount 1')
  check(r.messageSentNoneCount === 0, 'no-msg-none: messageSentNoneCount 0')
}

// 6. All 6 cells
{
  const r = projectEcommerceCancellationIntentCustomerMessageRefundStatusBrief(state([
    cancellationIntent(true, 'none'),
    cancellationIntent(true, 'due'),
    cancellationIntent(true, 'settled'),
    cancellationIntent(false, 'none'),
    cancellationIntent(false, 'due'),
    cancellationIntent(false, 'settled'),
  ]))
  check(r.totalIntents === 6, 'all-cells: totalIntents 6')
  check(r.messageSentNoneCount === 1, 'all-cells: messageSentNoneCount 1')
  check(r.messageSentDueCount === 1, 'all-cells: messageSentDueCount 1')
  check(r.noMessageNoneCount === 1, 'all-cells: noMessageNoneCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceCancellationIntentCustomerMessageRefundStatusBrief(state([
    cancellationIntent(true, 'none'),
    cancellationIntent(true, 'due'),
    cancellationIntent(true, 'settled'),
    cancellationIntent(false, 'none'),
    cancellationIntent(false, 'due'),
    cancellationIntent(false, 'settled'),
  ]))
  check(r.noMessageDueCount === 1, 'sub-buckets: noMessageDueCount 1')
  check(r.noMessageSettledCount === 1, 'sub-buckets: noMessageSettledCount 1')
}

console.log(`ecommerce-cancellation-intent-customer-message-refund-status-brief: ${checks} checks passed`)
