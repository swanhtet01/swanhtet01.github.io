// Ecommerce cancellation decision value brief: totalMmk sum/min/max/avg.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionValueBrief } from './ecommerce-cancellation-decision-value-brief.ts'`,
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

const { projectEcommerceCancellationDecisionValueBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision({ totalMmk = 10000 } = {}) {
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
    totalMmk,
    actor: 'user-1',
    reason: 'Shop decided to keep order',
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
  const r = projectEcommerceCancellationDecisionValueBrief(state([]))
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.totalValueMmk === 0, 'empty: totalValueMmk 0')
  check(r.minValueMmk === null, 'empty: min null')
  check(r.maxValueMmk === null, 'empty: max null')
  check(r.averageValueMmk === 0, 'empty: avg 0')
}

// 2. Single decision
{
  const r = projectEcommerceCancellationDecisionValueBrief(state([cancellationDecision({ totalMmk: 15000 })]))
  check(r.totalDecisions === 1, 'single: totalDecisions 1')
  check(r.totalValueMmk === 15000, 'single: totalValueMmk 15000')
  check(r.minValueMmk === 15000, 'single: min 15000')
  check(r.maxValueMmk === 15000, 'single: max 15000')
  check(r.averageValueMmk === 15000, 'single: avg 15000')
}

// 3. Min/max detection
{
  const r = projectEcommerceCancellationDecisionValueBrief(
    state([
      cancellationDecision({ totalMmk: 5000 }),
      cancellationDecision({ totalMmk: 20000 }),
      cancellationDecision({ totalMmk: 12000 }),
    ]),
  )
  check(r.minValueMmk === 5000, 'min-max: min 5000')
  check(r.maxValueMmk === 20000, 'min-max: max 20000')
  check(r.totalValueMmk === 37000, 'min-max: total 37000')
}

// 4. Average rounding
{
  const r = projectEcommerceCancellationDecisionValueBrief(
    state([cancellationDecision({ totalMmk: 1000 }), cancellationDecision({ totalMmk: 2000 }), cancellationDecision({ totalMmk: 2000 })]),
  )
  check(r.averageValueMmk === 1667, 'round: avg 1667 (round(5000/3))')
}

// 5. Two decisions, equal value
{
  const r = projectEcommerceCancellationDecisionValueBrief(
    state([cancellationDecision({ totalMmk: 8000 }), cancellationDecision({ totalMmk: 8000 })]),
  )
  check(r.minValueMmk === 8000, 'equal: min 8000')
  check(r.maxValueMmk === 8000, 'equal: max 8000')
  check(r.averageValueMmk === 8000, 'equal: avg 8000')
}

console.log(JSON.stringify({ ok: true, checks }))
