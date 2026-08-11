// Ecommerce cancellation intent value brief: totalMmk numeric stats + reason length bands.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationIntentValueBrief } from './ecommerce-cancellation-intent-value-brief.ts'`,
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

const { projectEcommerceCancellationIntentValueBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function cancellationIntent({ totalMmk = 5000, reason = 'No longer needed' } = {}) {
  intentId++
  return {
    schema: 'supermega.ecommerce.cancellation_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `CI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    totalMmk,
    reasonCode: 'changed_mind',
    reason,
    customerMessageSent: false,
    orderCancelled: false,
    refundStarted: false,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(cancellationIntents) {
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
  const r = projectEcommerceCancellationIntentValueBrief(state([]))
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.totalValueMmk === 0, 'empty: totalValueMmk 0')
  check(r.minValueMmk === null, 'empty: minValueMmk null')
  check(r.maxValueMmk === null, 'empty: maxValueMmk null')
  check(r.averageValueMmk === 0, 'empty: averageValueMmk 0')
  check(r.shortReasonCount === 0, 'empty: shortReasonCount 0')
  check(r.averageReasonLength === 0, 'empty: averageReasonLength 0')
}

// 2. Single intent
{
  const r = projectEcommerceCancellationIntentValueBrief(state([cancellationIntent({ totalMmk: 10000 })]))
  check(r.totalIntents === 1, 'single: totalIntents 1')
  check(r.totalValueMmk === 10000, 'single: totalValueMmk 10000')
  check(r.minValueMmk === 10000, 'single: minValueMmk 10000')
  check(r.maxValueMmk === 10000, 'single: maxValueMmk 10000')
  check(r.averageValueMmk === 10000, 'single: averageValueMmk 10000')
}

// 3. Min/max detection
{
  const r = projectEcommerceCancellationIntentValueBrief(
    state([
      cancellationIntent({ totalMmk: 1000 }),
      cancellationIntent({ totalMmk: 5000 }),
      cancellationIntent({ totalMmk: 3000 }),
    ]),
  )
  check(r.minValueMmk === 1000, 'minmax: minValueMmk 1000')
  check(r.maxValueMmk === 5000, 'minmax: maxValueMmk 5000')
  check(r.totalValueMmk === 9000, 'minmax: totalValueMmk 9000')
}

// 4. Average rounding: (1000 + 2000) / 2 = 1500 exact
{
  const r = projectEcommerceCancellationIntentValueBrief(
    state([cancellationIntent({ totalMmk: 1000 }), cancellationIntent({ totalMmk: 2000 })]),
  )
  check(r.averageValueMmk === 1500, 'avg: averageValueMmk 1500')
}

// 5. Short reason (≤40 chars)
{
  const r = projectEcommerceCancellationIntentValueBrief(
    state([cancellationIntent({ reason: 'Changed mind' })]),
  )
  check(r.shortReasonCount === 1, 'short: shortReasonCount 1')
  check(r.mediumReasonCount === 0, 'short: mediumReasonCount 0')
  check(r.longReasonCount === 0, 'short: longReasonCount 0')
}

// 6. Medium reason (41–120 chars)
{
  const r = projectEcommerceCancellationIntentValueBrief(
    state([cancellationIntent({ reason: 'A'.repeat(80) })]),
  )
  check(r.mediumReasonCount === 1, 'medium: mediumReasonCount 1')
}

// 7. Long reason (>120 chars)
{
  const r = projectEcommerceCancellationIntentValueBrief(
    state([cancellationIntent({ reason: 'B'.repeat(150) })]),
  )
  check(r.longReasonCount === 1, 'long: longReasonCount 1')
}

// 8. Mixed reason bands
{
  const r = projectEcommerceCancellationIntentValueBrief(
    state([
      cancellationIntent({ reason: 'Short' }),          // 5 → short
      cancellationIntent({ reason: 'A'.repeat(60) }),   // 60 → medium
      cancellationIntent({ reason: 'B'.repeat(130) }),  // 130 → long
    ]),
  )
  check(r.shortReasonCount === 1, 'mixed: short 1')
  check(r.mediumReasonCount === 1, 'mixed: medium 1')
  check(r.longReasonCount === 1, 'mixed: long 1')
}

// 9. Average reason length: (5 + 60 + 130) / 3 = 65
{
  const r = projectEcommerceCancellationIntentValueBrief(
    state([
      cancellationIntent({ reason: 'Short' }),
      cancellationIntent({ reason: 'A'.repeat(60) }),
      cancellationIntent({ reason: 'B'.repeat(130) }),
    ]),
  )
  check(r.averageReasonLength === 65, 'avg-reason: averageReasonLength 65')
}

console.log(JSON.stringify({ ok: true, checks }))
