import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionReasonTextBrief } from './ecommerce-cancellation-decision-reason-text-brief.ts'`,
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

const { projectEcommerceCancellationDecisionReasonTextBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision({ reason = 'Shop decided to keep order' } = {}) {
  decisionId++
  return {
    schema: 'supermega.ecommerce.cancellation_decision.v1',
    state: 'kept_by_shop',
    scope: 'scope-1',
    id: `CD-${decisionId}`,
    idempotencyKey: `ik-${decisionId}`,
    createdAt: '2026-08-01T09:00:00Z',
    intentId: `CI-${decisionId}`,
    intentDigest: `cid-${decisionId}`,
    orderId: `ORD-${decisionId}`,
    sourceRequestId: `REQ-${decisionId}`,
    sourceAcknowledgementDigest: `sad-${decisionId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    totalMmk: 10000,
    actor: 'user-1',
    reason,
    evidenceReference: `ev-${decisionId}`,
    customerMessageSent: false,
    orderCancelled: false,
    refundStarted: false,
    providerCalled: false,
  }
}

function state(cancellationDecisions) {
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
    cancellationDecisions,
    amendmentIntents: [],
    rescheduleIntents: [],
    events: [],
  }
}

// 1. Empty state
{
  const r = projectEcommerceCancellationDecisionReasonTextBrief(state([]))
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
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
  const r = projectEcommerceCancellationDecisionReasonTextBrief(state([
    cancellationDecision({ reason: 'Order kept by shop' }), // 18 chars
  ]))
  check(r.totalDecisions === 1, 'single-short: totalDecisions 1')
  check(r.shortCount === 1, 'single-short: shortCount 1')
  check(r.mediumCount === 0, 'single-short: mediumCount 0')
  check(r.longCount === 0, 'single-short: longCount 0')
  check(r.shortRate === 100, 'single-short: shortRate 100')
  check(r.minReasonLength === 18, 'single-short: minReasonLength 18')
  check(r.maxReasonLength === 18, 'single-short: maxReasonLength 18')
}

// 3. Boundary: exactly 40 chars = short
{
  const fortyChars = 'A'.repeat(40)
  const r = projectEcommerceCancellationDecisionReasonTextBrief(state([
    cancellationDecision({ reason: fortyChars }),
  ]))
  check(r.shortCount === 1, 'boundary-40: shortCount 1')
  check(r.mediumCount === 0, 'boundary-40: mediumCount 0')
  check(r.minReasonLength === 40, 'boundary-40: minReasonLength 40')
}

// 4. Boundary: exactly 41 chars = medium
{
  const fortyOneChars = 'A'.repeat(41)
  const r = projectEcommerceCancellationDecisionReasonTextBrief(state([
    cancellationDecision({ reason: fortyOneChars }),
  ]))
  check(r.shortCount === 0, 'boundary-41: shortCount 0')
  check(r.mediumCount === 1, 'boundary-41: mediumCount 1')
}

// 5. Boundary: exactly 120 chars = medium
{
  const medMax = 'B'.repeat(120)
  const r = projectEcommerceCancellationDecisionReasonTextBrief(state([
    cancellationDecision({ reason: medMax }),
  ]))
  check(r.mediumCount === 1, 'boundary-120: mediumCount 1')
  check(r.longCount === 0, 'boundary-120: longCount 0')
}

// 6. Boundary: exactly 121 chars = long
{
  const longStr = 'C'.repeat(121)
  const r = projectEcommerceCancellationDecisionReasonTextBrief(state([
    cancellationDecision({ reason: longStr }),
  ]))
  check(r.longCount === 1, 'boundary-121: longCount 1')
  check(r.mediumCount === 0, 'boundary-121: mediumCount 0')
  check(r.longRate === 100, 'boundary-121: longRate 100')
}

// 7. Mixed bands + rates + min/max/avg
{
  const shortReason = 'Kept: in stock' // 14 chars
  const medReason = 'D'.repeat(80) // 80 chars
  const longReason = 'E'.repeat(200) // 200 chars
  const r = projectEcommerceCancellationDecisionReasonTextBrief(state([
    cancellationDecision({ reason: shortReason }),
    cancellationDecision({ reason: medReason }),
    cancellationDecision({ reason: longReason }),
  ]))
  check(r.totalDecisions === 3, 'mixed: totalDecisions 3')
  check(r.shortCount === 1, 'mixed: shortCount 1')
  check(r.mediumCount === 1, 'mixed: mediumCount 1')
  check(r.longCount === 1, 'mixed: longCount 1')
  check(r.shortRate === 33, 'mixed: shortRate 33')
  check(r.mediumRate === 33, 'mixed: mediumRate 33')
  check(r.longRate === 33, 'mixed: longRate 33')
  check(r.minReasonLength === 14, 'mixed: minReasonLength 14')
  check(r.maxReasonLength === 200, 'mixed: maxReasonLength 200')
  check(r.averageReasonLength === Math.round((14 + 80 + 200) / 3), 'mixed: averageReasonLength')
}

console.log(`ecommerce-cancellation-decision-reason-text-brief: ${checks} checks passed`)
