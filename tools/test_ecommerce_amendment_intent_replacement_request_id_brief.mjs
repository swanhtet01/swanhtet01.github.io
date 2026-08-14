import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceAmendmentIntentReplacementRequestIdBrief } from './ecommerce-amendment-intent-replacement-request-id-brief.ts'`,
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

const { projectEcommerceAmendmentIntentReplacementRequestIdBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function amendmentIntent(replacementRequestId = 'REP-DEFAULT') {
  intentId++
  return {
    schema: 'supermega.ecommerce.order_amendment_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `EAI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    originalTotalMmk: 15000,
    replacementRequestId,
    replacementRequestDigest: `rrd-${intentId}`,
    lineChanges: [],
    fromFulfilment: 'pickup',
    toFulfilment: 'delivery',
    reason: 'Amendment reason',
    customerMessageSent: false,
    orderChanged: false,
    stockChanged: false,
    paymentChanged: false,
    refundStarted: false,
    providerCalled: false,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(amendmentIntents = []) {
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
    amendmentIntents,
    rescheduleIntents: [],
    events: [],
  }
}

// 1. Empty state
{
  const r = projectEcommerceAmendmentIntentReplacementRequestIdBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.uniqueReplacements === 0, 'empty: uniqueReplacements 0')
  check(r.topReplacement === null, 'empty: topReplacement null')
  check(r.topReplacementCount === 0, 'empty: topReplacementCount 0')
}

// 2. Single intent — one unique replacement request
{
  const r = projectEcommerceAmendmentIntentReplacementRequestIdBrief(state([amendmentIntent('REP-001')]))
  check(r.totalIntents === 1, 'single: totalIntents 1')
  check(r.uniqueReplacements === 1, 'single: uniqueReplacements 1')
  check(r.topReplacement === 'REP-001', 'single: topReplacement')
  check(r.topReplacementCount === 1, 'single: topReplacementCount 1')
}

// 3. Two intents same replacement request — uniqueReplacements 1, topCount 2
{
  const r = projectEcommerceAmendmentIntentReplacementRequestIdBrief(state([
    amendmentIntent('REP-002'),
    amendmentIntent('REP-002'),
  ]))
  check(r.totalIntents === 2, 'same-rep: totalIntents 2')
  check(r.uniqueReplacements === 1, 'same-rep: uniqueReplacements 1')
  check(r.topReplacement === 'REP-002', 'same-rep: topReplacement')
  check(r.topReplacementCount === 2, 'same-rep: topReplacementCount 2')
}

// 4. Two intents different replacement requests — uniqueReplacements 2
{
  const r = projectEcommerceAmendmentIntentReplacementRequestIdBrief(state([
    amendmentIntent('REP-003'),
    amendmentIntent('REP-004'),
  ]))
  check(r.totalIntents === 2, 'two-diff: totalIntents 2')
  check(r.uniqueReplacements === 2, 'two-diff: uniqueReplacements 2')
  check(r.topReplacementCount === 1, 'two-diff: topReplacementCount 1')
  check(r.topReplacement !== null, 'two-diff: topReplacement set')
}

// 5. Three intents: one replacement appears twice — dominant top
{
  const r = projectEcommerceAmendmentIntentReplacementRequestIdBrief(state([
    amendmentIntent('REP-005'),
    amendmentIntent('REP-006'),
    amendmentIntent('REP-005'),
  ]))
  check(r.totalIntents === 3, 'dominant: totalIntents 3')
  check(r.uniqueReplacements === 2, 'dominant: uniqueReplacements 2')
  check(r.topReplacement === 'REP-005', 'dominant: topReplacement')
  check(r.topReplacementCount === 2, 'dominant: topReplacementCount 2')
}

// 6. Three intents all different — uniqueReplacements 3, topCount 1
{
  const r = projectEcommerceAmendmentIntentReplacementRequestIdBrief(state([
    amendmentIntent('REP-007'),
    amendmentIntent('REP-008'),
    amendmentIntent('REP-009'),
  ]))
  check(r.totalIntents === 3, 'all-diff: totalIntents 3')
  check(r.uniqueReplacements === 3, 'all-diff: uniqueReplacements 3')
  check(r.topReplacementCount === 1, 'all-diff: topReplacementCount 1')
}

console.log(`ecommerce-amendment-intent-replacement-request-id-brief: ${checks} checks passed`)
