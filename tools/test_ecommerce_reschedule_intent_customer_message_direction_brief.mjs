import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRescheduleIntentCustomerMessageDirectionBrief } from './ecommerce-reschedule-intent-customer-message-direction-brief.ts'`,
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

const { projectEcommerceRescheduleIntentCustomerMessageDirectionBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const ORIGINAL_DATE = '2026-08-05T10:00:00Z'
const FORWARD_DATE = '2026-08-03T10:00:00Z'   // earlier → moved forward
const PUSHED_BACK_DATE = '2026-08-07T10:00:00Z' // later → pushed back

let intentId = 0
function rescheduleIntent(customerMessageSent = false, requestedPromisedAt = PUSHED_BACK_DATE) {
  intentId++
  return {
    schema: 'supermega.ecommerce.reschedule_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `ERI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    fulfilment: 'delivery',
    originalPromisedAt: ORIGINAL_DATE,
    requestedPromisedAt,
    reason: 'Reschedule reason',
    customerMessageSent,
    replacementRequestId: null,
    originalTotalMmk: 10000,
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
  const r = projectEcommerceRescheduleIntentCustomerMessageDirectionBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.messageSentCount === 0, 'empty: messageSentCount 0')
  check(r.noMessageCount === 0, 'empty: noMessageCount 0')
}

// 2. Message sent + forward (earlier date)
{
  const r = projectEcommerceRescheduleIntentCustomerMessageDirectionBrief(state([
    rescheduleIntent(true, FORWARD_DATE),
  ]))
  check(r.totalIntents === 1, 'msg-forward: totalIntents 1')
  check(r.messageSentForwardCount === 1, 'msg-forward: messageSentForwardCount 1')
  check(r.messageSentPushedBackCount === 0, 'msg-forward: messageSentPushedBackCount 0')
  check(r.messageSentCount === 1, 'msg-forward: messageSentCount 1')
}

// 3. Message sent + pushed back
{
  const r = projectEcommerceRescheduleIntentCustomerMessageDirectionBrief(state([
    rescheduleIntent(true, PUSHED_BACK_DATE),
  ]))
  check(r.totalIntents === 1, 'msg-pushedback: totalIntents 1')
  check(r.messageSentPushedBackCount === 1, 'msg-pushedback: messageSentPushedBackCount 1')
  check(r.messageSentForwardCount === 0, 'msg-pushedback: messageSentForwardCount 0')
  check(r.messageSentCount === 1, 'msg-pushedback: messageSentCount 1')
}

// 4. No message + forward
{
  const r = projectEcommerceRescheduleIntentCustomerMessageDirectionBrief(state([
    rescheduleIntent(false, FORWARD_DATE),
  ]))
  check(r.totalIntents === 1, 'nomsg-forward: totalIntents 1')
  check(r.noMessageForwardCount === 1, 'nomsg-forward: noMessageForwardCount 1')
  check(r.noMessageCount === 1, 'nomsg-forward: noMessageCount 1')
}

// 5. No message + pushed back
{
  const r = projectEcommerceRescheduleIntentCustomerMessageDirectionBrief(state([
    rescheduleIntent(false, PUSHED_BACK_DATE),
  ]))
  check(r.totalIntents === 1, 'nomsg-pushedback: totalIntents 1')
  check(r.noMessagePushedBackCount === 1, 'nomsg-pushedback: noMessagePushedBackCount 1')
  check(r.noMessageCount === 1, 'nomsg-pushedback: noMessageCount 1')
}

// 6. All 4 cells
{
  const r = projectEcommerceRescheduleIntentCustomerMessageDirectionBrief(state([
    rescheduleIntent(true, FORWARD_DATE),
    rescheduleIntent(true, PUSHED_BACK_DATE),
    rescheduleIntent(false, FORWARD_DATE),
    rescheduleIntent(false, PUSHED_BACK_DATE),
  ]))
  check(r.totalIntents === 4, 'all-cells: totalIntents 4')
  check(r.messageSentForwardCount === 1, 'all-cells: messageSentForwardCount 1')
  check(r.noMessagePushedBackCount === 1, 'all-cells: noMessagePushedBackCount 1')
  check(r.messageSentCount === 2, 'all-cells: messageSentCount 2')
}

// 7. Row totals
{
  const r = projectEcommerceRescheduleIntentCustomerMessageDirectionBrief(state([
    rescheduleIntent(true, FORWARD_DATE),
    rescheduleIntent(true, PUSHED_BACK_DATE),
    rescheduleIntent(false, FORWARD_DATE),
    rescheduleIntent(false, PUSHED_BACK_DATE),
  ]))
  check(r.noMessageCount === 2, 'row-totals: noMessageCount 2')
  check(r.messageSentPushedBackCount === 1, 'row-totals: messageSentPushedBackCount 1')
}

console.log(`ecommerce-reschedule-intent-customer-message-direction-brief: ${checks} checks passed`)
