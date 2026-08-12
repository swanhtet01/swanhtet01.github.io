import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationIntentRefundStartedRefundStatusBrief } from './ecommerce-cancellation-intent-refund-started-refund-status-brief.ts'`,
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

const { projectEcommerceCancellationIntentRefundStartedRefundStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function cancellationIntent(refundStarted = false, refundStatus = 'none') {
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
    customerMessageSent: false,
    orderCancelled: false,
    refundStarted,
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
  const r = projectEcommerceCancellationIntentRefundStartedRefundStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.refundStartedNoneCount === 0, 'empty: refundStartedNoneCount 0')
  check(r.noRefundNoneCount === 0, 'empty: noRefundNoneCount 0')
}

// 2. Refund started + none
{
  const r = projectEcommerceCancellationIntentRefundStartedRefundStatusBrief(state([
    cancellationIntent(true, 'none'),
  ]))
  check(r.totalIntents === 1, 'refund-none: totalIntents 1')
  check(r.refundStartedNoneCount === 1, 'refund-none: refundStartedNoneCount 1')
  check(r.refundStartedDueCount === 0, 'refund-none: refundStartedDueCount 0')
  check(r.noRefundNoneCount === 0, 'refund-none: noRefundNoneCount 0')
}

// 3. Refund started + due
{
  const r = projectEcommerceCancellationIntentRefundStartedRefundStatusBrief(state([
    cancellationIntent(true, 'due'),
  ]))
  check(r.totalIntents === 1, 'refund-due: totalIntents 1')
  check(r.refundStartedDueCount === 1, 'refund-due: refundStartedDueCount 1')
  check(r.refundStartedNoneCount === 0, 'refund-due: refundStartedNoneCount 0')
  check(r.noRefundDueCount === 0, 'refund-due: noRefundDueCount 0')
}

// 4. Refund started + settled
{
  const r = projectEcommerceCancellationIntentRefundStartedRefundStatusBrief(state([
    cancellationIntent(true, 'settled'),
  ]))
  check(r.totalIntents === 1, 'refund-settled: totalIntents 1')
  check(r.refundStartedSettledCount === 1, 'refund-settled: refundStartedSettledCount 1')
  check(r.noRefundSettledCount === 0, 'refund-settled: noRefundSettledCount 0')
}

// 5. No refund + none
{
  const r = projectEcommerceCancellationIntentRefundStartedRefundStatusBrief(state([
    cancellationIntent(false, 'none'),
  ]))
  check(r.totalIntents === 1, 'no-refund-none: totalIntents 1')
  check(r.noRefundNoneCount === 1, 'no-refund-none: noRefundNoneCount 1')
  check(r.refundStartedNoneCount === 0, 'no-refund-none: refundStartedNoneCount 0')
}

// 6. All 6 cells
{
  const r = projectEcommerceCancellationIntentRefundStartedRefundStatusBrief(state([
    cancellationIntent(true, 'none'),
    cancellationIntent(true, 'due'),
    cancellationIntent(true, 'settled'),
    cancellationIntent(false, 'none'),
    cancellationIntent(false, 'due'),
    cancellationIntent(false, 'settled'),
  ]))
  check(r.totalIntents === 6, 'all-cells: totalIntents 6')
  check(r.refundStartedNoneCount === 1, 'all-cells: refundStartedNoneCount 1')
  check(r.refundStartedDueCount === 1, 'all-cells: refundStartedDueCount 1')
  check(r.noRefundNoneCount === 1, 'all-cells: noRefundNoneCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceCancellationIntentRefundStartedRefundStatusBrief(state([
    cancellationIntent(true, 'none'),
    cancellationIntent(true, 'due'),
    cancellationIntent(true, 'settled'),
    cancellationIntent(false, 'none'),
    cancellationIntent(false, 'due'),
    cancellationIntent(false, 'settled'),
  ]))
  check(r.noRefundDueCount === 1, 'sub-buckets: noRefundDueCount 1')
  check(r.noRefundSettledCount === 1, 'sub-buckets: noRefundSettledCount 1')
}

console.log(`ecommerce-cancellation-intent-refund-started-refund-status-brief: ${checks} checks passed`)
