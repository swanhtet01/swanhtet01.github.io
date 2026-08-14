import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentSourceCountRefundStatusBrief } from './ecommerce-correction-intent-source-count-refund-status-brief.ts'`,
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

const { projectEcommerceCorrectionIntentSourceCountRefundStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(sourceCorrectionCount = 0, refundStatus = 'none') {
  intentId++
  return {
    schema: 'supermega.ecommerce.correction_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `ECI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceCalculationDigest: `scd-${intentId}`,
    sourceCorrectionCount,
    originalBalanceMmk: 10000,
    paymentStatus: 'reconciled',
    refundStatus,
    requestedKind: 'credit',
    reasonCode: 'pricing_error',
    listedAmountMmk: 500,
    reason: 'Correction reason',
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
  const r = projectEcommerceCorrectionIntentSourceCountRefundStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.firstNoneCount === 0, 'empty: firstNoneCount 0')
  check(r.repeatSettledCount === 0, 'empty: repeatSettledCount 0')
}

// 2. First correction + refund none (sourceCorrectionCount=0, refundStatus='none')
{
  const r = projectEcommerceCorrectionIntentSourceCountRefundStatusBrief(state([
    correctionIntent(0, 'none'),
  ]))
  check(r.totalIntents === 1, 'first-none: totalIntents 1')
  check(r.firstNoneCount === 1, 'first-none: firstNoneCount 1')
  check(r.firstDueCount === 0, 'first-none: firstDueCount 0')
  check(r.repeatNoneCount === 0, 'first-none: repeatNoneCount 0')
}

// 3. First correction + refund settled
{
  const r = projectEcommerceCorrectionIntentSourceCountRefundStatusBrief(state([
    correctionIntent(0, 'settled'),
  ]))
  check(r.firstSettledCount === 1, 'first-settled: firstSettledCount 1')
  check(r.firstNoneCount === 0, 'first-settled: firstNoneCount 0')
  check(r.totalIntents === 1, 'first-settled: totalIntents 1')
  check(r.repeatSettledCount === 0, 'first-settled: repeatSettledCount 0')
}

// 4. Repeat correction + refund due (sourceCorrectionCount=2)
{
  const r = projectEcommerceCorrectionIntentSourceCountRefundStatusBrief(state([
    correctionIntent(2, 'due'),
  ]))
  check(r.repeatDueCount === 1, 'repeat-due: repeatDueCount 1')
  check(r.repeatNoneCount === 0, 'repeat-due: repeatNoneCount 0')
  check(r.totalIntents === 1, 'repeat-due: totalIntents 1')
}

// 5. Repeat correction + refund none
{
  const r = projectEcommerceCorrectionIntentSourceCountRefundStatusBrief(state([
    correctionIntent(1, 'none'),
  ]))
  check(r.repeatNoneCount === 1, 'repeat-none: repeatNoneCount 1')
  check(r.repeatDueCount === 0, 'repeat-none: repeatDueCount 0')
  check(r.totalIntents === 1, 'repeat-none: totalIntents 1')
}

// 6. All 6 cells: first×{none,due,settled}, repeat×{none,due,settled}
{
  const r = projectEcommerceCorrectionIntentSourceCountRefundStatusBrief(state([
    correctionIntent(0, 'none'),
    correctionIntent(0, 'due'),
    correctionIntent(0, 'settled'),
    correctionIntent(1, 'none'),
    correctionIntent(1, 'due'),
    correctionIntent(1, 'settled'),
  ]))
  check(r.totalIntents === 6, 'all-cells: totalIntents 6')
  check(r.firstDueCount === 1, 'all-cells: firstDueCount 1')
  check(r.repeatSettledCount === 1, 'all-cells: repeatSettledCount 1')
  check(r.firstNoneCount === 1, 'all-cells: firstNoneCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceCorrectionIntentSourceCountRefundStatusBrief(state([
    correctionIntent(0, 'none'),
    correctionIntent(0, 'due'),
    correctionIntent(0, 'settled'),
    correctionIntent(1, 'none'),
    correctionIntent(1, 'due'),
    correctionIntent(1, 'settled'),
  ]))
  check(r.repeatNoneCount === 1, 'sub-buckets: repeatNoneCount 1')
  check(r.firstSettledCount === 1, 'sub-buckets: firstSettledCount 1')
}

console.log(`ecommerce-correction-intent-source-count-refund-status-brief: ${checks} checks passed`)
