// Ecommerce reschedule intent reason length brief: short/medium/long bands + min/max/avg.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRescheduleIntentReasonLengthBrief } from './ecommerce-reschedule-intent-reason-length-brief.ts'`,
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

const { projectEcommerceRescheduleIntentReasonLengthBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function rescheduleIntent({ reason = 'Change delivery time' } = {}) {
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
    originalPromisedAt: '2026-08-01T12:00:00Z',
    replacementRequestId: `RRP-${intentId}`,
    replacementRequestDigest: `rrd-${intentId}`,
    requestedPromisedAt: '2026-08-02T12:00:00Z',
    fulfilment: 'pickup',
    reason,
    customerMessageSent: false,
    orderChanged: false,
    stockChanged: false,
    paymentChanged: false,
    refundStarted: false,
    riderBooked: false,
    providerCalled: false,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(rescheduleIntents) {
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

const SHORT = 'Bad'
const MEDIUM = 'A'.repeat(50)
const LONG = 'B'.repeat(150)
const EXACT_40 = 'C'.repeat(40)
const EXACT_41 = 'D'.repeat(41)
const EXACT_120 = 'E'.repeat(120)
const EXACT_121 = 'F'.repeat(121)

// 1. Empty state
{
  const r = projectEcommerceRescheduleIntentReasonLengthBrief(state([]))
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.shortCount === 0, 'empty: shortCount 0')
  check(r.minReasonLength === null, 'empty: min null')
  check(r.maxReasonLength === null, 'empty: max null')
  check(r.averageReasonLength === 0, 'empty: avg 0')
}

// 2. Boundary checks
{
  check(
    projectEcommerceRescheduleIntentReasonLengthBrief(state([rescheduleIntent({ reason: EXACT_40 })])).shortCount === 1,
    'bound: ≤40 is short',
  )
  check(
    projectEcommerceRescheduleIntentReasonLengthBrief(state([rescheduleIntent({ reason: EXACT_41 })])).mediumCount === 1,
    'bound: 41 is medium',
  )
  check(
    projectEcommerceRescheduleIntentReasonLengthBrief(state([rescheduleIntent({ reason: EXACT_120 })])).mediumCount === 1,
    'bound: 120 is medium',
  )
  check(
    projectEcommerceRescheduleIntentReasonLengthBrief(state([rescheduleIntent({ reason: EXACT_121 })])).longCount === 1,
    'bound: 121 is long',
  )
}

// 3. Band counts sum to total
{
  const r = projectEcommerceRescheduleIntentReasonLengthBrief(
    state([
      rescheduleIntent({ reason: SHORT }),
      rescheduleIntent({ reason: MEDIUM }),
      rescheduleIntent({ reason: LONG }),
    ]),
  )
  check(r.shortCount + r.mediumCount + r.longCount === r.totalIntents, 'invariant: bands sum to total')
}

// 4. Min/max detection
{
  const r = projectEcommerceRescheduleIntentReasonLengthBrief(
    state([
      rescheduleIntent({ reason: SHORT }),
      rescheduleIntent({ reason: LONG }),
      rescheduleIntent({ reason: MEDIUM }),
    ]),
  )
  check(r.minReasonLength === SHORT.length, 'min-max: min is SHORT.length')
  check(r.maxReasonLength === LONG.length, 'min-max: max is LONG.length')
}

// 5. Average rounding: (2 + 3) / 2 = 2.5 → 3
{
  const r = projectEcommerceRescheduleIntentReasonLengthBrief(
    state([rescheduleIntent({ reason: 'AB' }), rescheduleIntent({ reason: 'ABC' })]),
  )
  check(r.averageReasonLength === 3, 'round: avg 3')
}

// 6. Rate rounding 1/3 → 33%
{
  const r = projectEcommerceRescheduleIntentReasonLengthBrief(
    state([
      rescheduleIntent({ reason: SHORT }),
      rescheduleIntent({ reason: MEDIUM }),
      rescheduleIntent({ reason: LONG }),
    ]),
  )
  check(r.shortRate === 33, 'rate: shortRate 33')
  check(r.mediumRate === 33, 'rate: mediumRate 33')
  check(r.longRate === 33, 'rate: longRate 33')
}

console.log(JSON.stringify({ ok: true, checks }))
