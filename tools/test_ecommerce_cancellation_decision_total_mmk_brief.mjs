import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionTotalMmkBrief } from './ecommerce-cancellation-decision-total-mmk-brief.ts'`,
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

const { projectEcommerceCancellationDecisionTotalMmkBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision(totalMmk = 10000) {
  decisionId++
  return {
    schema: 'supermega.ecommerce.cancellation_decision.v1',
    state: 'kept_by_shop',
    scope: 'scope-1',
    id: `CXD-${decisionId}`,
    idempotencyKey: `ik-${decisionId}`,
    createdAt: '2026-08-01T09:00:00Z',
    intentId: `CXI-${decisionId}`,
    intentDigest: `id-${decisionId}`,
    orderId: `ORD-${decisionId}`,
    sourceRequestId: `REQ-${decisionId}`,
    sourceAcknowledgementDigest: `sad-${decisionId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    totalMmk,
    actor: `actor-${decisionId}`,
    reason: 'Order is valid',
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
  const r = projectEcommerceCancellationDecisionTotalMmkBrief(state())
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.minTotalMmk === null, 'empty: minTotalMmk null')
  check(r.maxTotalMmk === null, 'empty: maxTotalMmk null')
  check(r.sumTotalMmk === 0, 'empty: sumTotalMmk 0')
}

// 2. Single decision — min = max = sum
{
  const r = projectEcommerceCancellationDecisionTotalMmkBrief(state([cancellationDecision(7500)]))
  check(r.totalDecisions === 1, 'single: totalDecisions 1')
  check(r.minTotalMmk === 7500, 'single: minTotalMmk 7500')
  check(r.maxTotalMmk === 7500, 'single: maxTotalMmk 7500')
  check(r.sumTotalMmk === 7500, 'single: sumTotalMmk 7500')
}

// 3. Two decisions — min, max, sum correct
{
  const r = projectEcommerceCancellationDecisionTotalMmkBrief(state([
    cancellationDecision(5000),
    cancellationDecision(9000),
  ]))
  check(r.totalDecisions === 2, 'two: totalDecisions 2')
  check(r.minTotalMmk === 5000, 'two: minTotalMmk 5000')
  check(r.maxTotalMmk === 9000, 'two: maxTotalMmk 9000')
  check(r.sumTotalMmk === 14000, 'two: sumTotalMmk 14000')
}

// 4. Three decisions out of order — correct min/max/sum
{
  const r = projectEcommerceCancellationDecisionTotalMmkBrief(state([
    cancellationDecision(15000),
    cancellationDecision(3000),
    cancellationDecision(8000),
  ]))
  check(r.totalDecisions === 3, 'unsorted: totalDecisions 3')
  check(r.minTotalMmk === 3000, 'unsorted: minTotalMmk 3000')
  check(r.maxTotalMmk === 15000, 'unsorted: maxTotalMmk 15000')
  check(r.sumTotalMmk === 26000, 'unsorted: sumTotalMmk 26000')
}

// 5. All same value
{
  const r = projectEcommerceCancellationDecisionTotalMmkBrief(state([
    cancellationDecision(4000),
    cancellationDecision(4000),
    cancellationDecision(4000),
  ]))
  check(r.totalDecisions === 3, 'same: totalDecisions 3')
  check(r.minTotalMmk === 4000, 'same: minTotalMmk 4000')
  check(r.maxTotalMmk === 4000, 'same: maxTotalMmk 4000')
  check(r.sumTotalMmk === 12000, 'same: sumTotalMmk 12000')
}

// 6. Single large value — min equals max, sum equals value
{
  const r = projectEcommerceCancellationDecisionTotalMmkBrief(state([cancellationDecision(88000)]))
  check(r.minTotalMmk === r.maxTotalMmk, 'large: min equals max')
  check(r.sumTotalMmk === 88000, 'large: sumTotalMmk 88000')
  check(r.totalDecisions === 1, 'large: totalDecisions 1')
}

console.log(`ecommerce-cancellation-decision-total-mmk-brief: ${checks} checks passed`)
