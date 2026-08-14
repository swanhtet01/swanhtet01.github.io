import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentRefundStartedRefundStatusBrief } from './ecommerce-correction-intent-refund-started-refund-status-brief.ts'`,
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

const { projectEcommerceCorrectionIntentRefundStartedRefundStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(refundStarted = false, refundStatus = 'none') {
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
    sourceCorrectionCount: 0,
    originalBalanceMmk: 10000,
    paymentStatus: 'reconciled',
    refundStatus,
    requestedKind: 'credit',
    reasonCode: 'pricing_error',
    listedAmountMmk: 500,
    reason: 'Correction reason',
    orderChanged: false,
    paymentChanged: false,
    refundStarted,
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
  const r = projectEcommerceCorrectionIntentRefundStartedRefundStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.refundStartedNoRefundCount === 0, 'empty: refundStartedNoRefundCount 0')
  check(r.noRefundStartedNoRefundCount === 0, 'empty: noRefundStartedNoRefundCount 0')
}

// 2. Refund started + none
{
  const r = projectEcommerceCorrectionIntentRefundStartedRefundStatusBrief(state([
    correctionIntent(true, 'none'),
  ]))
  check(r.totalIntents === 1, 'ref-none: totalIntents 1')
  check(r.refundStartedNoRefundCount === 1, 'ref-none: refundStartedNoRefundCount 1')
  check(r.refundStartedDueCount === 0, 'ref-none: refundStartedDueCount 0')
  check(r.noRefundStartedNoRefundCount === 0, 'ref-none: noRefundStartedNoRefundCount 0')
}

// 3. Refund started + due
{
  const r = projectEcommerceCorrectionIntentRefundStartedRefundStatusBrief(state([
    correctionIntent(true, 'due'),
  ]))
  check(r.totalIntents === 1, 'ref-due: totalIntents 1')
  check(r.refundStartedDueCount === 1, 'ref-due: refundStartedDueCount 1')
  check(r.refundStartedSettledCount === 0, 'ref-due: refundStartedSettledCount 0')
  check(r.refundStartedNoRefundCount === 0, 'ref-due: refundStartedNoRefundCount 0')
}

// 4. Refund started + settled
{
  const r = projectEcommerceCorrectionIntentRefundStartedRefundStatusBrief(state([
    correctionIntent(true, 'settled'),
  ]))
  check(r.totalIntents === 1, 'ref-settled: totalIntents 1')
  check(r.refundStartedSettledCount === 1, 'ref-settled: refundStartedSettledCount 1')
  check(r.noRefundStartedSettledCount === 0, 'ref-settled: noRefundStartedSettledCount 0')
}

// 5. No refund started + due
{
  const r = projectEcommerceCorrectionIntentRefundStartedRefundStatusBrief(state([
    correctionIntent(false, 'due'),
  ]))
  check(r.totalIntents === 1, 'noref-due: totalIntents 1')
  check(r.noRefundStartedDueCount === 1, 'noref-due: noRefundStartedDueCount 1')
  check(r.refundStartedDueCount === 0, 'noref-due: refundStartedDueCount 0')
}

// 6. Mixed: 2 ref+none, 1 ref+settled, 1 noRef+due
{
  const r = projectEcommerceCorrectionIntentRefundStartedRefundStatusBrief(state([
    correctionIntent(true, 'none'),
    correctionIntent(true, 'none'),
    correctionIntent(true, 'settled'),
    correctionIntent(false, 'due'),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.refundStartedNoRefundCount === 2, 'mixed: refundStartedNoRefundCount 2')
  check(r.refundStartedSettledCount === 1, 'mixed: refundStartedSettledCount 1')
  check(r.noRefundStartedDueCount === 1, 'mixed: noRefundStartedDueCount 1')
}

// 7. Grand total
{
  const r = projectEcommerceCorrectionIntentRefundStartedRefundStatusBrief(state([
    correctionIntent(false, 'settled'),
    correctionIntent(false, 'settled'),
    correctionIntent(true, 'none'),
  ]))
  check(r.totalIntents === 3, 'grand-total: totalIntents 3')
  check(r.noRefundStartedSettledCount === 2, 'grand-total: noRefundStartedSettledCount 2')
}

console.log(`ecommerce-correction-intent-refund-started-refund-status-brief: ${checks} checks passed`)
