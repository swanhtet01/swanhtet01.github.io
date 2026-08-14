import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionCreatedAtBrief } from './ecommerce-cancellation-decision-created-at-brief.ts'`,
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

const { projectEcommerceCancellationDecisionCreatedAtBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision(createdAt = '2026-08-01T09:00:00Z') {
  decisionId++
  return {
    schema: 'supermega.ecommerce.cancellation_decision.v1',
    state: 'kept_by_shop',
    scope: 'scope-1',
    id: `CD-${decisionId}`,
    idempotencyKey: `ik-${decisionId}`,
    createdAt,
    intentId: `CI-${decisionId}`,
    intentDigest: `id-${decisionId}`,
    orderId: `ORD-${decisionId}`,
    sourceRequestId: `REQ-${decisionId}`,
    sourceAcknowledgementDigest: `sad-${decisionId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    totalMmk: 5000,
    actor: 'shop-owner',
    reason: 'Order confirmed by customer',
    evidenceReference: `ev-${decisionId}`,
    customerMessageSent: false,
    orderCancelled: false,
    refundStarted: false,
    providerCalled: false,
  }
}

function state(cancellationDecisions = []) {
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
  const r = projectEcommerceCancellationDecisionCreatedAtBrief(state())
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.earliestCreatedAt === null, 'empty: earliestCreatedAt null')
  check(r.latestCreatedAt === null, 'empty: latestCreatedAt null')
  check(r.spannedDays === 0, 'empty: spannedDays 0')
}

// 2. Single decision — spannedDays 0
{
  const r = projectEcommerceCancellationDecisionCreatedAtBrief(state([
    cancellationDecision('2026-08-01T09:00:00Z'),
  ]))
  check(r.totalDecisions === 1, 'single: totalDecisions 1')
  check(r.earliestCreatedAt === '2026-08-01T09:00:00Z', 'single: earliestCreatedAt')
  check(r.latestCreatedAt === '2026-08-01T09:00:00Z', 'single: latestCreatedAt')
  check(r.spannedDays === 0, 'single: spannedDays 0')
}

// 3. Two decisions same day — spannedDays 0
{
  const r = projectEcommerceCancellationDecisionCreatedAtBrief(state([
    cancellationDecision('2026-08-05T08:00:00Z'),
    cancellationDecision('2026-08-05T16:00:00Z'),
  ]))
  check(r.totalDecisions === 2, 'same-day: totalDecisions 2')
  check(r.earliestCreatedAt === '2026-08-05T08:00:00Z', 'same-day: earliestCreatedAt')
  check(r.latestCreatedAt === '2026-08-05T16:00:00Z', 'same-day: latestCreatedAt')
  check(r.spannedDays === 0, 'same-day: spannedDays 0')
}

// 4. Two decisions 7 days apart
{
  const r = projectEcommerceCancellationDecisionCreatedAtBrief(state([
    cancellationDecision('2026-07-25T00:00:00Z'),
    cancellationDecision('2026-08-01T00:00:00Z'),
  ]))
  check(r.totalDecisions === 2, '7-days: totalDecisions 2')
  check(r.earliestCreatedAt === '2026-07-25T00:00:00Z', '7-days: earliestCreatedAt')
  check(r.latestCreatedAt === '2026-08-01T00:00:00Z', '7-days: latestCreatedAt')
  check(r.spannedDays === 7, '7-days: spannedDays 7')
}

// 5. Three decisions out of order — earliest/latest correct
{
  const r = projectEcommerceCancellationDecisionCreatedAtBrief(state([
    cancellationDecision('2026-08-10T08:00:00Z'),
    cancellationDecision('2026-08-02T12:00:00Z'),
    cancellationDecision('2026-08-06T15:00:00Z'),
  ]))
  check(r.totalDecisions === 3, 'unsorted: totalDecisions 3')
  check(r.earliestCreatedAt === '2026-08-02T12:00:00Z', 'unsorted: earliestCreatedAt')
  check(r.latestCreatedAt === '2026-08-10T08:00:00Z', 'unsorted: latestCreatedAt')
  check(r.spannedDays === Math.round((Date.parse('2026-08-10T08:00:00Z') - Date.parse('2026-08-02T12:00:00Z')) / (1000 * 60 * 60 * 24)), 'unsorted: spannedDays')
}

// 6. All same timestamp — spannedDays 0, earliest equals latest
{
  const r = projectEcommerceCancellationDecisionCreatedAtBrief(state([
    cancellationDecision('2026-08-08T00:00:00Z'),
    cancellationDecision('2026-08-08T00:00:00Z'),
  ]))
  check(r.totalDecisions === 2, 'same-ts: totalDecisions 2')
  check(r.spannedDays === 0, 'same-ts: spannedDays 0')
  check(r.earliestCreatedAt === r.latestCreatedAt, 'same-ts: earliest equals latest')
}

console.log(`ecommerce-cancellation-decision-created-at-brief: ${checks} checks passed`)
