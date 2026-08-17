import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRescheduleIntentDirectionOrderStatusBrief } from './ecommerce-reschedule-intent-direction-order-status-brief.ts'`,
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

const { projectEcommerceRescheduleIntentDirectionOrderStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const ORIGINAL_DATE = '2026-08-05T10:00:00Z'
const FORWARD_DATE = '2026-08-03T10:00:00Z'
const PUSHED_BACK_DATE = '2026-08-07T10:00:00Z'

let intentId = 0
function rescheduleIntent(requestedPromisedAt = PUSHED_BACK_DATE, orderStatus = 'confirmed') {
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
    orderStatus,
    paymentStatus: 'pending',
    fulfilment: 'delivery',
    originalPromisedAt: ORIGINAL_DATE,
    requestedPromisedAt,
    reason: 'Reschedule reason',
    customerMessageSent: false,
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
  const r = projectEcommerceRescheduleIntentDirectionOrderStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.forwardConfirmedCount === 0, 'empty: forwardConfirmedCount 0')
  check(r.pushedBackReadyCount === 0, 'empty: pushedBackReadyCount 0')
}

// 2. Forward + confirmed
{
  const r = projectEcommerceRescheduleIntentDirectionOrderStatusBrief(state([
    rescheduleIntent(FORWARD_DATE, 'confirmed'),
  ]))
  check(r.totalIntents === 1, 'forward-confirmed: totalIntents 1')
  check(r.forwardConfirmedCount === 1, 'forward-confirmed: forwardConfirmedCount 1')
  check(r.forwardPreparingCount === 0, 'forward-confirmed: forwardPreparingCount 0')
  check(r.pushedBackConfirmedCount === 0, 'forward-confirmed: pushedBackConfirmedCount 0')
}

// 3. Pushed back + preparing
{
  const r = projectEcommerceRescheduleIntentDirectionOrderStatusBrief(state([
    rescheduleIntent(PUSHED_BACK_DATE, 'preparing'),
  ]))
  check(r.pushedBackPreparingCount === 1, 'pushedback-preparing: pushedBackPreparingCount 1')
  check(r.pushedBackConfirmedCount === 0, 'pushedback-preparing: pushedBackConfirmedCount 0')
  check(r.totalIntents === 1, 'pushedback-preparing: totalIntents 1')
  check(r.forwardPreparingCount === 0, 'pushedback-preparing: forwardPreparingCount 0')
}

// 4. Forward + ready
{
  const r = projectEcommerceRescheduleIntentDirectionOrderStatusBrief(state([
    rescheduleIntent(FORWARD_DATE, 'ready'),
  ]))
  check(r.forwardReadyCount === 1, 'forward-ready: forwardReadyCount 1')
  check(r.forwardConfirmedCount === 0, 'forward-ready: forwardConfirmedCount 0')
  check(r.totalIntents === 1, 'forward-ready: totalIntents 1')
}

// 5. Pushed back + confirmed
{
  const r = projectEcommerceRescheduleIntentDirectionOrderStatusBrief(state([
    rescheduleIntent(PUSHED_BACK_DATE, 'confirmed'),
  ]))
  check(r.pushedBackConfirmedCount === 1, 'pushedback-confirmed: pushedBackConfirmedCount 1')
  check(r.pushedBackPreparingCount === 0, 'pushedback-confirmed: pushedBackPreparingCount 0')
  check(r.totalIntents === 1, 'pushedback-confirmed: totalIntents 1')
}

// 6. All 6 cells
{
  const r = projectEcommerceRescheduleIntentDirectionOrderStatusBrief(state([
    rescheduleIntent(FORWARD_DATE, 'confirmed'),
    rescheduleIntent(FORWARD_DATE, 'preparing'),
    rescheduleIntent(FORWARD_DATE, 'ready'),
    rescheduleIntent(PUSHED_BACK_DATE, 'confirmed'),
    rescheduleIntent(PUSHED_BACK_DATE, 'preparing'),
    rescheduleIntent(PUSHED_BACK_DATE, 'ready'),
  ]))
  check(r.totalIntents === 6, 'all-cells: totalIntents 6')
  check(r.forwardConfirmedCount === 1, 'all-cells: forwardConfirmedCount 1')
  check(r.pushedBackPreparingCount === 1, 'all-cells: pushedBackPreparingCount 1')
  check(r.forwardReadyCount === 1, 'all-cells: forwardReadyCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceRescheduleIntentDirectionOrderStatusBrief(state([
    rescheduleIntent(FORWARD_DATE, 'confirmed'),
    rescheduleIntent(FORWARD_DATE, 'preparing'),
    rescheduleIntent(FORWARD_DATE, 'ready'),
    rescheduleIntent(PUSHED_BACK_DATE, 'confirmed'),
    rescheduleIntent(PUSHED_BACK_DATE, 'preparing'),
    rescheduleIntent(PUSHED_BACK_DATE, 'ready'),
  ]))
  check(r.forwardPreparingCount === 1, 'sub-buckets: forwardPreparingCount 1')
  check(r.pushedBackReadyCount === 1, 'sub-buckets: pushedBackReadyCount 1')
}

console.log(`ecommerce-reschedule-intent-direction-order-status-brief: ${checks} checks passed`)
