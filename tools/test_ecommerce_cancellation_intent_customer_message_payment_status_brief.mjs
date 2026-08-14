import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationIntentCustomerMessagePaymentStatusBrief } from './ecommerce-cancellation-intent-customer-message-payment-status-brief.ts'`,
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

const { projectEcommerceCancellationIntentCustomerMessagePaymentStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function cancellationIntent(customerMessageSent = false, paymentStatus = 'pending') {
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
    paymentStatus,
    refundStatus: 'none',
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
  const r = projectEcommerceCancellationIntentCustomerMessagePaymentStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.messageSentCount === 0, 'empty: messageSentCount 0')
  check(r.noMessageCount === 0, 'empty: noMessageCount 0')
}

// 2. Message sent + pending
{
  const r = projectEcommerceCancellationIntentCustomerMessagePaymentStatusBrief(state([
    cancellationIntent(true, 'pending'),
  ]))
  check(r.totalIntents === 1, 'msg-pending: totalIntents 1')
  check(r.messageSentPendingCount === 1, 'msg-pending: messageSentPendingCount 1')
  check(r.messageSentCount === 1, 'msg-pending: messageSentCount 1')
  check(r.noMessageCount === 0, 'msg-pending: noMessageCount 0')
}

// 3. Message sent + reconciled
{
  const r = projectEcommerceCancellationIntentCustomerMessagePaymentStatusBrief(state([
    cancellationIntent(true, 'reconciled'),
  ]))
  check(r.totalIntents === 1, 'msg-reconciled: totalIntents 1')
  check(r.messageSentReconciledCount === 1, 'msg-reconciled: messageSentReconciledCount 1')
  check(r.messageSentCount === 1, 'msg-reconciled: messageSentCount 1')
  check(r.noMessageCount === 0, 'msg-reconciled: noMessageCount 0')
}

// 4. No message + pending
{
  const r = projectEcommerceCancellationIntentCustomerMessagePaymentStatusBrief(state([
    cancellationIntent(false, 'pending'),
  ]))
  check(r.totalIntents === 1, 'no-msg-pending: totalIntents 1')
  check(r.noMessagePendingCount === 1, 'no-msg-pending: noMessagePendingCount 1')
  check(r.noMessageCount === 1, 'no-msg-pending: noMessageCount 1')
}

// 5. No message + reconciled
{
  const r = projectEcommerceCancellationIntentCustomerMessagePaymentStatusBrief(state([
    cancellationIntent(false, 'reconciled'),
  ]))
  check(r.totalIntents === 1, 'no-msg-reconciled: totalIntents 1')
  check(r.noMessageReconciledCount === 1, 'no-msg-reconciled: noMessageReconciledCount 1')
  check(r.noMessageCount === 1, 'no-msg-reconciled: noMessageCount 1')
}

// 6. All 4 cells
{
  const r = projectEcommerceCancellationIntentCustomerMessagePaymentStatusBrief(state([
    cancellationIntent(true, 'pending'),
    cancellationIntent(true, 'reconciled'),
    cancellationIntent(false, 'pending'),
    cancellationIntent(false, 'reconciled'),
  ]))
  check(r.totalIntents === 4, 'all-cells: totalIntents 4')
  check(r.messageSentPendingCount === 1, 'all-cells: messageSentPendingCount 1')
  check(r.noMessagePendingCount === 1, 'all-cells: noMessagePendingCount 1')
  check(r.messageSentReconciledCount === 1, 'all-cells: messageSentReconciledCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceCancellationIntentCustomerMessagePaymentStatusBrief(state([
    cancellationIntent(true, 'pending'),
    cancellationIntent(true, 'reconciled'),
    cancellationIntent(false, 'pending'),
    cancellationIntent(false, 'reconciled'),
  ]))
  check(r.messageSentCount === 2, 'sub-buckets: messageSentCount 2')
  check(r.noMessageCount === 2, 'sub-buckets: noMessageCount 2')
}

console.log(`ecommerce-cancellation-intent-customer-message-payment-status-brief: ${checks} checks passed`)
