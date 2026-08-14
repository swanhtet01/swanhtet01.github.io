import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRescheduleIntentReasonLengthOrderStatusBrief } from './ecommerce-reschedule-intent-reason-length-order-status-brief.ts'`,
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

const { projectEcommerceRescheduleIntentReasonLengthOrderStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SHORT_REASON = 'Short reason'
const DETAILED_REASON = 'Very detailed explanation of why the order needs to be rescheduled here'

let intentId = 0
function rescheduleIntent(reason = SHORT_REASON, orderStatus = 'confirmed') {
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
    originalPromisedAt: '2026-08-05T10:00:00Z',
    requestedPromisedAt: '2026-08-07T10:00:00Z',
    reason,
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
  const r = projectEcommerceRescheduleIntentReasonLengthOrderStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.shortConfirmedCount === 0, 'empty: shortConfirmedCount 0')
  check(r.detailedReadyCount === 0, 'empty: detailedReadyCount 0')
}

// 2. Short + confirmed
{
  const r = projectEcommerceRescheduleIntentReasonLengthOrderStatusBrief(state([
    rescheduleIntent(SHORT_REASON, 'confirmed'),
  ]))
  check(r.totalIntents === 1, 'short-confirmed: totalIntents 1')
  check(r.shortConfirmedCount === 1, 'short-confirmed: shortConfirmedCount 1')
  check(r.shortPreparingCount === 0, 'short-confirmed: shortPreparingCount 0')
  check(r.detailedConfirmedCount === 0, 'short-confirmed: detailedConfirmedCount 0')
}

// 3. Detailed + preparing
{
  const r = projectEcommerceRescheduleIntentReasonLengthOrderStatusBrief(state([
    rescheduleIntent(DETAILED_REASON, 'preparing'),
  ]))
  check(r.detailedPreparingCount === 1, 'detailed-preparing: detailedPreparingCount 1')
  check(r.detailedConfirmedCount === 0, 'detailed-preparing: detailedConfirmedCount 0')
  check(r.totalIntents === 1, 'detailed-preparing: totalIntents 1')
  check(r.shortPreparingCount === 0, 'detailed-preparing: shortPreparingCount 0')
}

// 4. Short + ready
{
  const r = projectEcommerceRescheduleIntentReasonLengthOrderStatusBrief(state([
    rescheduleIntent(SHORT_REASON, 'ready'),
  ]))
  check(r.shortReadyCount === 1, 'short-ready: shortReadyCount 1')
  check(r.shortConfirmedCount === 0, 'short-ready: shortConfirmedCount 0')
  check(r.totalIntents === 1, 'short-ready: totalIntents 1')
}

// 5. Detailed + confirmed
{
  const r = projectEcommerceRescheduleIntentReasonLengthOrderStatusBrief(state([
    rescheduleIntent(DETAILED_REASON, 'confirmed'),
  ]))
  check(r.detailedConfirmedCount === 1, 'detailed-confirmed: detailedConfirmedCount 1')
  check(r.detailedPreparingCount === 0, 'detailed-confirmed: detailedPreparingCount 0')
  check(r.totalIntents === 1, 'detailed-confirmed: totalIntents 1')
}

// 6. All 6 cells
{
  const r = projectEcommerceRescheduleIntentReasonLengthOrderStatusBrief(state([
    rescheduleIntent(SHORT_REASON, 'confirmed'),
    rescheduleIntent(SHORT_REASON, 'preparing'),
    rescheduleIntent(SHORT_REASON, 'ready'),
    rescheduleIntent(DETAILED_REASON, 'confirmed'),
    rescheduleIntent(DETAILED_REASON, 'preparing'),
    rescheduleIntent(DETAILED_REASON, 'ready'),
  ]))
  check(r.totalIntents === 6, 'all-cells: totalIntents 6')
  check(r.shortConfirmedCount === 1, 'all-cells: shortConfirmedCount 1')
  check(r.detailedPreparingCount === 1, 'all-cells: detailedPreparingCount 1')
  check(r.shortReadyCount === 1, 'all-cells: shortReadyCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceRescheduleIntentReasonLengthOrderStatusBrief(state([
    rescheduleIntent(SHORT_REASON, 'confirmed'),
    rescheduleIntent(SHORT_REASON, 'preparing'),
    rescheduleIntent(SHORT_REASON, 'ready'),
    rescheduleIntent(DETAILED_REASON, 'confirmed'),
    rescheduleIntent(DETAILED_REASON, 'preparing'),
    rescheduleIntent(DETAILED_REASON, 'ready'),
  ]))
  check(r.shortPreparingCount === 1, 'sub-buckets: shortPreparingCount 1')
  check(r.detailedReadyCount === 1, 'sub-buckets: detailedReadyCount 1')
}

console.log(`ecommerce-reschedule-intent-reason-length-order-status-brief: ${checks} checks passed`)
