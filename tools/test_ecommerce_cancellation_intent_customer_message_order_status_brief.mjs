import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationIntentCustomerMessageOrderStatusBrief } from './ecommerce-cancellation-intent-customer-message-order-status-brief.ts'`,
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

const { projectEcommerceCancellationIntentCustomerMessageOrderStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function cancellationIntent(customerMessageSent = false, orderStatus = 'confirmed') {
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
    orderStatus,
    paymentStatus: 'pending',
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
  const r = projectEcommerceCancellationIntentCustomerMessageOrderStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.messageSentConfirmedCount === 0, 'empty: messageSentConfirmedCount 0')
  check(r.noMessageConfirmedCount === 0, 'empty: noMessageConfirmedCount 0')
}

// 2. Message sent + confirmed
{
  const r = projectEcommerceCancellationIntentCustomerMessageOrderStatusBrief(state([
    cancellationIntent(true, 'confirmed'),
  ]))
  check(r.totalIntents === 1, 'msg-confirmed: totalIntents 1')
  check(r.messageSentConfirmedCount === 1, 'msg-confirmed: messageSentConfirmedCount 1')
  check(r.messageSentPreparingCount === 0, 'msg-confirmed: messageSentPreparingCount 0')
  check(r.noMessageConfirmedCount === 0, 'msg-confirmed: noMessageConfirmedCount 0')
}

// 3. Message sent + preparing
{
  const r = projectEcommerceCancellationIntentCustomerMessageOrderStatusBrief(state([
    cancellationIntent(true, 'preparing'),
  ]))
  check(r.totalIntents === 1, 'msg-preparing: totalIntents 1')
  check(r.messageSentPreparingCount === 1, 'msg-preparing: messageSentPreparingCount 1')
  check(r.messageSentConfirmedCount === 0, 'msg-preparing: messageSentConfirmedCount 0')
  check(r.noMessagePreparingCount === 0, 'msg-preparing: noMessagePreparingCount 0')
}

// 4. Message sent + ready
{
  const r = projectEcommerceCancellationIntentCustomerMessageOrderStatusBrief(state([
    cancellationIntent(true, 'ready'),
  ]))
  check(r.totalIntents === 1, 'msg-ready: totalIntents 1')
  check(r.messageSentReadyCount === 1, 'msg-ready: messageSentReadyCount 1')
  check(r.noMessageReadyCount === 0, 'msg-ready: noMessageReadyCount 0')
}

// 5. No message + confirmed
{
  const r = projectEcommerceCancellationIntentCustomerMessageOrderStatusBrief(state([
    cancellationIntent(false, 'confirmed'),
  ]))
  check(r.totalIntents === 1, 'no-msg-confirmed: totalIntents 1')
  check(r.noMessageConfirmedCount === 1, 'no-msg-confirmed: noMessageConfirmedCount 1')
  check(r.messageSentConfirmedCount === 0, 'no-msg-confirmed: messageSentConfirmedCount 0')
}

// 6. All 6 cells
{
  const r = projectEcommerceCancellationIntentCustomerMessageOrderStatusBrief(state([
    cancellationIntent(true, 'confirmed'),
    cancellationIntent(true, 'preparing'),
    cancellationIntent(true, 'ready'),
    cancellationIntent(false, 'confirmed'),
    cancellationIntent(false, 'preparing'),
    cancellationIntent(false, 'ready'),
  ]))
  check(r.totalIntents === 6, 'all-cells: totalIntents 6')
  check(r.messageSentConfirmedCount === 1, 'all-cells: messageSentConfirmedCount 1')
  check(r.messageSentPreparingCount === 1, 'all-cells: messageSentPreparingCount 1')
  check(r.noMessageConfirmedCount === 1, 'all-cells: noMessageConfirmedCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceCancellationIntentCustomerMessageOrderStatusBrief(state([
    cancellationIntent(true, 'confirmed'),
    cancellationIntent(true, 'preparing'),
    cancellationIntent(true, 'ready'),
    cancellationIntent(false, 'confirmed'),
    cancellationIntent(false, 'preparing'),
    cancellationIntent(false, 'ready'),
  ]))
  check(r.noMessagePreparingCount === 1, 'sub-buckets: noMessagePreparingCount 1')
  check(r.noMessageReadyCount === 1, 'sub-buckets: noMessageReadyCount 1')
}

console.log(`ecommerce-cancellation-intent-customer-message-order-status-brief: ${checks} checks passed`)
