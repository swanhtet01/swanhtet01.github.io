import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRescheduleIntentDirectionReasonLengthBrief } from './ecommerce-reschedule-intent-direction-reason-length-brief.ts'`,
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

const { projectEcommerceRescheduleIntentDirectionReasonLengthBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SHORT_REASON = 'Short reschedule reason'                                    // 22 chars ≤ 40
const DETAILED_REASON = 'Very detailed explanation of why the order needs to be rescheduled here' // 71 chars > 40

// originalPromisedAt: '2026-08-05T10:00:00Z'
const FORWARD_DATE = '2026-08-03T10:00:00Z'     // < original → forward
const PUSHED_BACK_DATE = '2026-08-07T10:00:00Z' // > original → pushed back

let intentId = 0
function rescheduleIntent(requestedPromisedAt = PUSHED_BACK_DATE, reason = SHORT_REASON) {
  intentId++
  return {
    schema: 'supermega.ecommerce.order_reschedule_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `ERS-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    originalTotalMmk: 15000,
    originalPromisedAt: '2026-08-05T10:00:00Z',
    replacementRequestId: `REP-${intentId}`,
    replacementRequestDigest: `rrd-${intentId}`,
    requestedPromisedAt,
    fulfilment: 'delivery',
    reason,
    customerMessageSent: false,
    orderChanged: false,
    stockChanged: false,
    paymentChanged: false,
    refundStarted: false,
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
  const r = projectEcommerceRescheduleIntentDirectionReasonLengthBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.forwardShortCount === 0, 'empty: forwardShortCount 0')
  check(r.pushedBackDetailedCount === 0, 'empty: pushedBackDetailedCount 0')
}

// 2. Forward + short reason
{
  const r = projectEcommerceRescheduleIntentDirectionReasonLengthBrief(state([
    rescheduleIntent(FORWARD_DATE, SHORT_REASON),
  ]))
  check(r.totalIntents === 1, 'forward-short: totalIntents 1')
  check(r.forwardShortCount === 1, 'forward-short: forwardShortCount 1')
  check(r.forwardDetailedCount === 0, 'forward-short: forwardDetailedCount 0')
  check(r.pushedBackShortCount === 0, 'forward-short: pushedBackShortCount 0')
}

// 3. Forward + detailed reason
{
  const r = projectEcommerceRescheduleIntentDirectionReasonLengthBrief(state([
    rescheduleIntent(FORWARD_DATE, DETAILED_REASON),
  ]))
  check(r.forwardDetailedCount === 1, 'forward-detailed: forwardDetailedCount 1')
  check(r.forwardShortCount === 0, 'forward-detailed: forwardShortCount 0')
  check(r.totalIntents === 1, 'forward-detailed: totalIntents 1')
  check(r.pushedBackDetailedCount === 0, 'forward-detailed: pushedBackDetailedCount 0')
}

// 4. Pushed back + short reason
{
  const r = projectEcommerceRescheduleIntentDirectionReasonLengthBrief(state([
    rescheduleIntent(PUSHED_BACK_DATE, SHORT_REASON),
  ]))
  check(r.pushedBackShortCount === 1, 'pushedback-short: pushedBackShortCount 1')
  check(r.pushedBackDetailedCount === 0, 'pushedback-short: pushedBackDetailedCount 0')
  check(r.totalIntents === 1, 'pushedback-short: totalIntents 1')
}

// 5. Pushed back + detailed reason
{
  const r = projectEcommerceRescheduleIntentDirectionReasonLengthBrief(state([
    rescheduleIntent(PUSHED_BACK_DATE, DETAILED_REASON),
  ]))
  check(r.pushedBackDetailedCount === 1, 'pushedback-detailed: pushedBackDetailedCount 1')
  check(r.pushedBackShortCount === 0, 'pushedback-detailed: pushedBackShortCount 0')
  check(r.totalIntents === 1, 'pushedback-detailed: totalIntents 1')
}

// 6. All 4 cells
{
  const r = projectEcommerceRescheduleIntentDirectionReasonLengthBrief(state([
    rescheduleIntent(FORWARD_DATE, SHORT_REASON),
    rescheduleIntent(FORWARD_DATE, DETAILED_REASON),
    rescheduleIntent(PUSHED_BACK_DATE, SHORT_REASON),
    rescheduleIntent(PUSHED_BACK_DATE, DETAILED_REASON),
  ]))
  check(r.totalIntents === 4, 'all-cells: totalIntents 4')
  check(r.forwardShortCount === 1, 'all-cells: forwardShortCount 1')
  check(r.pushedBackDetailedCount === 1, 'all-cells: pushedBackDetailedCount 1')
  check(r.forwardCount === 2, 'all-cells: forwardCount 2')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceRescheduleIntentDirectionReasonLengthBrief(state([
    rescheduleIntent(FORWARD_DATE, SHORT_REASON),
    rescheduleIntent(FORWARD_DATE, DETAILED_REASON),
    rescheduleIntent(PUSHED_BACK_DATE, SHORT_REASON),
    rescheduleIntent(PUSHED_BACK_DATE, DETAILED_REASON),
  ]))
  check(r.forwardDetailedCount === 1, 'sub-buckets: forwardDetailedCount 1')
  check(r.pushedBackShortCount === 1, 'sub-buckets: pushedBackShortCount 1')
}

console.log(`ecommerce-reschedule-intent-direction-reason-length-brief: ${checks} checks passed`)
