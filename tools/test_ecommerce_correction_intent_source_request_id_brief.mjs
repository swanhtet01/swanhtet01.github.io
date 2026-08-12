import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentSourceRequestIdBrief } from './ecommerce-correction-intent-source-request-id-brief.ts'`,
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

const { projectEcommerceCorrectionIntentSourceRequestIdBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(sourceRequestId = 'REQ-DEFAULT') {
  intentId++
  return {
    schema: 'supermega.ecommerce.correction_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `ECI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId,
    sourceCalculationDigest: `scd-${intentId}`,
    sourceCorrectionCount: 0,
    originalBalanceMmk: 10000,
    paymentStatus: 'reconciled',
    refundStatus: 'none',
    requestedKind: 'credit',
    reasonCode: 'pricing_error',
    listedAmountMmk: 500,
    reason: 'Price correction',
    orderChanged: false,
    paymentChanged: false,
    refundStarted: false,
    ledgerPosted: false,
    taxFiled: false,
    customerMessageSent: false,
    providerCalled: false,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(correctionIntents = []) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: 0,
    headDigest: 'hd-1',
    requests: [],
    returnIntents: [],
    supportIntents: [],
    correctionIntents,
    cancellationIntents: [],
    cancellationDecisions: [],
    amendmentIntents: [],
    rescheduleIntents: [],
    events: [],
  }
}

// 1. Empty state
{
  const r = projectEcommerceCorrectionIntentSourceRequestIdBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.uniqueSourceRequests === 0, 'empty: uniqueSourceRequests 0')
  check(r.topSourceRequest === null, 'empty: topSourceRequest null')
  check(r.topSourceRequestCount === 0, 'empty: topSourceRequestCount 0')
}

// 2. Single intent — one unique source request
{
  const r = projectEcommerceCorrectionIntentSourceRequestIdBrief(state([correctionIntent('REQ-001')]))
  check(r.totalIntents === 1, 'single: totalIntents 1')
  check(r.uniqueSourceRequests === 1, 'single: uniqueSourceRequests 1')
  check(r.topSourceRequest === 'REQ-001', 'single: topSourceRequest')
  check(r.topSourceRequestCount === 1, 'single: topSourceRequestCount 1')
}

// 3. Two intents same source request — uniqueSourceRequests 1, topCount 2
{
  const r = projectEcommerceCorrectionIntentSourceRequestIdBrief(state([
    correctionIntent('REQ-002'),
    correctionIntent('REQ-002'),
  ]))
  check(r.totalIntents === 2, 'same-req: totalIntents 2')
  check(r.uniqueSourceRequests === 1, 'same-req: uniqueSourceRequests 1')
  check(r.topSourceRequest === 'REQ-002', 'same-req: topSourceRequest')
  check(r.topSourceRequestCount === 2, 'same-req: topSourceRequestCount 2')
}

// 4. Two intents different source requests — uniqueSourceRequests 2
{
  const r = projectEcommerceCorrectionIntentSourceRequestIdBrief(state([
    correctionIntent('REQ-003'),
    correctionIntent('REQ-004'),
  ]))
  check(r.totalIntents === 2, 'two-diff: totalIntents 2')
  check(r.uniqueSourceRequests === 2, 'two-diff: uniqueSourceRequests 2')
  check(r.topSourceRequestCount === 1, 'two-diff: topSourceRequestCount 1')
  check(r.topSourceRequest !== null, 'two-diff: topSourceRequest set')
}

// 5. Three intents: one source request appears twice — dominant top
{
  const r = projectEcommerceCorrectionIntentSourceRequestIdBrief(state([
    correctionIntent('REQ-005'),
    correctionIntent('REQ-006'),
    correctionIntent('REQ-005'),
  ]))
  check(r.totalIntents === 3, 'dominant: totalIntents 3')
  check(r.uniqueSourceRequests === 2, 'dominant: uniqueSourceRequests 2')
  check(r.topSourceRequest === 'REQ-005', 'dominant: topSourceRequest')
  check(r.topSourceRequestCount === 2, 'dominant: topSourceRequestCount 2')
}

// 6. Three intents all different — uniqueSourceRequests 3, topCount 1
{
  const r = projectEcommerceCorrectionIntentSourceRequestIdBrief(state([
    correctionIntent('REQ-007'),
    correctionIntent('REQ-008'),
    correctionIntent('REQ-009'),
  ]))
  check(r.totalIntents === 3, 'all-diff: totalIntents 3')
  check(r.uniqueSourceRequests === 3, 'all-diff: uniqueSourceRequests 3')
  check(r.topSourceRequestCount === 1, 'all-diff: topSourceRequestCount 1')
}

console.log(`ecommerce-correction-intent-source-request-id-brief: ${checks} checks passed`)
