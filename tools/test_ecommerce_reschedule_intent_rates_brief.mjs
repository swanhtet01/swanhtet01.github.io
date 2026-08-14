import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRescheduleIntentRatesBrief } from './ecommerce-reschedule-intent-rates-brief.ts'`,
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

const { projectEcommerceRescheduleIntentRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0

const ORIGINAL = '2026-08-05T10:00:00Z'
const FORWARD = '2026-08-03T10:00:00Z'      // earlier than original → moved forward
const PUSHED_BACK = '2026-08-07T10:00:00Z'

function rescheduleIntent(requestedPromisedAt = PUSHED_BACK, customerMessageSent = false) {
  intentId++
  return {
    schema: 'supermega.ecommerce.order_reschedule_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `RSI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    originalTotalMmk: 18500,
    originalPromisedAt: ORIGINAL,
    replacementRequestId: null,
    replacementRequestDigest: null,
    requestedPromisedAt,
    fulfilment: 'delivery',
    reason: 'Reschedule reason',
    customerMessageSent,
    orderChanged: false,
    stockChanged: false,
    paymentChanged: false,
    refundStarted: false,
    riderBooked: false,
    providerCalled: false,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(rescheduleIntents = []) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: 0,
    headDigest: 'hd-1',
    requests: [],
    returnIntents: [],
    supportIntents: [],
    correctionIntents: [],
    cancellationIntents: [],
    cancellationDecisions: [],
    amendmentIntents: [],
    rescheduleIntents,
    events: [],
  }
}

// 1. Empty state
{
  const r = projectEcommerceRescheduleIntentRatesBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.forwardRate === 0, 'empty: forwardRate 0')
  check(r.pushedBackRate === 0, 'empty: pushedBackRate 0')
}

// 2. One intent moved forward
{
  const r = projectEcommerceRescheduleIntentRatesBrief(state([
    rescheduleIntent(FORWARD),
  ]))
  check(r.totalIntents === 1, 'forward: totalIntents 1')
  check(r.forwardCount === 1, 'forward: forwardCount 1')
  check(r.forwardRate === 1, 'forward: forwardRate 1')
}

// 3. One intent pushed back
{
  const r = projectEcommerceRescheduleIntentRatesBrief(state([
    rescheduleIntent(PUSHED_BACK),
  ]))
  check(r.pushedBackCount === 1, 'pushed-back: pushedBackCount 1')
  check(r.pushedBackRate === 1, 'pushed-back: pushedBackRate 1')
  check(r.forwardCount === 0, 'pushed-back: forwardCount 0')
}

// 4. One intent with customer notification
{
  const r = projectEcommerceRescheduleIntentRatesBrief(state([
    rescheduleIntent(PUSHED_BACK, true),
  ]))
  check(r.customerNotificationCount === 1, 'notified: customerNotificationCount 1')
  check(r.customerNotificationRate === 1, 'notified: customerNotificationRate 1')
  check(r.forwardCount === 0, 'notified: forwardCount 0')
}

// 5. Two intents, one forward one pushed back
{
  const r = projectEcommerceRescheduleIntentRatesBrief(state([
    rescheduleIntent(FORWARD),
    rescheduleIntent(PUSHED_BACK),
  ]))
  check(r.totalIntents === 2, 'split: totalIntents 2')
  check(r.forwardRate === 0.5, 'split: forwardRate 0.5')
  check(r.pushedBackRate === 0.5, 'split: pushedBackRate 0.5')
}

// 6. Four intents, 3 forward, 1 pushed back, 2 notified
{
  const r = projectEcommerceRescheduleIntentRatesBrief(state([
    rescheduleIntent(FORWARD, true),
    rescheduleIntent(FORWARD, true),
    rescheduleIntent(FORWARD, false),
    rescheduleIntent(PUSHED_BACK, false),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.forwardRate === 0.75, 'mixed: forwardRate 0.75')
  check(r.pushedBackRate === 0.25, 'mixed: pushedBackRate 0.25')
  check(r.customerNotificationRate === 0.5, 'mixed: customerNotificationRate 0.5')
}

// 7. Two forward notified + two pushed back unnotified
{
  const r = projectEcommerceRescheduleIntentRatesBrief(state([
    rescheduleIntent(FORWARD, true),
    rescheduleIntent(FORWARD, true),
    rescheduleIntent(PUSHED_BACK, false),
    rescheduleIntent(PUSHED_BACK, false),
  ]))
  check(r.forwardCount === 2, 'fwd-notified: forwardCount 2')
  check(r.pushedBackCount === 2, 'fwd-notified: pushedBackCount 2')
  check(r.customerNotificationCount === 2, 'fwd-notified: customerNotificationCount 2')
  check(r.customerNotificationRate === 0.5, 'fwd-notified: customerNotificationRate 0.5')
}

console.log(`ecommerce-reschedule-intent-rates-brief: ${checks} checks passed`)
