import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationIntentReasonTextBrief } from './ecommerce-cancellation-intent-reason-text-brief.ts'`,
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

const { projectEcommerceCancellationIntentReasonTextBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function cancellationIntent({ reason = 'No longer needed' } = {}) {
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
    totalMmk: 5000,
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
  const r = projectEcommerceCancellationIntentReasonTextBrief(state([]))
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.shortCount === 0, 'empty: shortCount 0')
  check(r.mediumCount === 0, 'empty: mediumCount 0')
  check(r.longCount === 0, 'empty: longCount 0')
  check(r.shortRate === 0, 'empty: shortRate 0')
  check(r.mediumRate === 0, 'empty: mediumRate 0')
  check(r.longRate === 0, 'empty: longRate 0')
  check(r.minReasonLength === null, 'empty: minReasonLength null')
  check(r.maxReasonLength === null, 'empty: maxReasonLength null')
  check(r.averageReasonLength === 0, 'empty: averageReasonLength 0')
}

// 2. Single short reason (≤40 chars)
{
  const r = projectEcommerceCancellationIntentReasonTextBrief(state([
    cancellationIntent({ reason: 'Too expensive' }), // 13 chars
  ]))
  check(r.totalIntents === 1, 'single-short: totalIntents 1')
  check(r.shortCount === 1, 'single-short: shortCount 1')
  check(r.mediumCount === 0, 'single-short: mediumCount 0')
  check(r.longCount === 0, 'single-short: longCount 0')
  check(r.shortRate === 100, 'single-short: shortRate 100')
  check(r.minReasonLength === 13, 'single-short: minReasonLength 13')
  check(r.maxReasonLength === 13, 'single-short: maxReasonLength 13')
}

// 3. Boundary: exactly 40 chars = short
{
  const fortyChars = 'A'.repeat(40)
  const r = projectEcommerceCancellationIntentReasonTextBrief(state([
    cancellationIntent({ reason: fortyChars }),
  ]))
  check(r.shortCount === 1, 'boundary-40: shortCount 1')
  check(r.mediumCount === 0, 'boundary-40: mediumCount 0')
  check(r.minReasonLength === 40, 'boundary-40: minReasonLength 40')
}

// 4. Boundary: exactly 41 chars = medium
{
  const fortyOneChars = 'A'.repeat(41)
  const r = projectEcommerceCancellationIntentReasonTextBrief(state([
    cancellationIntent({ reason: fortyOneChars }),
  ]))
  check(r.shortCount === 0, 'boundary-41: shortCount 0')
  check(r.mediumCount === 1, 'boundary-41: mediumCount 1')
}

// 5. Boundary: exactly 120 chars = medium
{
  const medMax = 'B'.repeat(120)
  const r = projectEcommerceCancellationIntentReasonTextBrief(state([
    cancellationIntent({ reason: medMax }),
  ]))
  check(r.mediumCount === 1, 'boundary-120: mediumCount 1')
  check(r.longCount === 0, 'boundary-120: longCount 0')
}

// 6. Boundary: exactly 121 chars = long
{
  const longStr = 'C'.repeat(121)
  const r = projectEcommerceCancellationIntentReasonTextBrief(state([
    cancellationIntent({ reason: longStr }),
  ]))
  check(r.longCount === 1, 'boundary-121: longCount 1')
  check(r.mediumCount === 0, 'boundary-121: mediumCount 0')
  check(r.longRate === 100, 'boundary-121: longRate 100')
}

// 7. Mixed bands + rates + min/max/avg
{
  const shortReason = 'Changed mind' // 12 chars
  const medReason = 'D'.repeat(80) // 80 chars
  const longReason = 'E'.repeat(200) // 200 chars
  const r = projectEcommerceCancellationIntentReasonTextBrief(state([
    cancellationIntent({ reason: shortReason }),
    cancellationIntent({ reason: medReason }),
    cancellationIntent({ reason: longReason }),
  ]))
  check(r.totalIntents === 3, 'mixed: totalIntents 3')
  check(r.shortCount === 1, 'mixed: shortCount 1')
  check(r.mediumCount === 1, 'mixed: mediumCount 1')
  check(r.longCount === 1, 'mixed: longCount 1')
  check(r.shortRate === 33, 'mixed: shortRate 33')
  check(r.mediumRate === 33, 'mixed: mediumRate 33')
  check(r.longRate === 33, 'mixed: longRate 33')
  check(r.minReasonLength === 12, 'mixed: minReasonLength 12')
  check(r.maxReasonLength === 200, 'mixed: maxReasonLength 200')
  check(r.averageReasonLength === Math.round((12 + 80 + 200) / 3), 'mixed: averageReasonLength')
}

console.log(`ecommerce-cancellation-intent-reason-text-brief: ${checks} checks passed`)
