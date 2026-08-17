import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentRefundStatusBrief } from './ecommerce-correction-intent-refund-status-brief.ts'`,
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

const { projectEcommerceCorrectionIntentRefundStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(refundStatus = 'none') {
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
  const r = projectEcommerceCorrectionIntentRefundStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.noneCount === 0, 'empty: noneCount 0')
  check(r.dueCount === 0, 'empty: dueCount 0')
  check(r.settledCount === 0, 'empty: settledCount 0')
}

// 2. All none
{
  const r = projectEcommerceCorrectionIntentRefundStatusBrief(state([
    correctionIntent('none'),
    correctionIntent('none'),
    correctionIntent('none'),
  ]))
  check(r.totalIntents === 3, 'all-none: totalIntents 3')
  check(r.noneCount === 3, 'all-none: noneCount 3')
  check(r.dueCount === 0, 'all-none: dueCount 0')
  check(r.noneCount + r.dueCount + r.settledCount === r.totalIntents, 'all-none: sum = total')
}

// 3. All due
{
  const r = projectEcommerceCorrectionIntentRefundStatusBrief(state([
    correctionIntent('due'),
    correctionIntent('due'),
  ]))
  check(r.totalIntents === 2, 'all-due: totalIntents 2')
  check(r.noneCount === 0, 'all-due: noneCount 0')
  check(r.dueCount === 2, 'all-due: dueCount 2')
  check(r.settledCount === 0, 'all-due: settledCount 0')
}

// 4. All settled
{
  const r = projectEcommerceCorrectionIntentRefundStatusBrief(state([
    correctionIntent('settled'),
    correctionIntent('settled'),
  ]))
  check(r.totalIntents === 2, 'all-settled: totalIntents 2')
  check(r.noneCount === 0, 'all-settled: noneCount 0')
  check(r.dueCount === 0, 'all-settled: dueCount 0')
  check(r.settledCount === 2, 'all-settled: settledCount 2')
}

// 5. Mixed one of each
{
  const r = projectEcommerceCorrectionIntentRefundStatusBrief(state([
    correctionIntent('none'),
    correctionIntent('due'),
    correctionIntent('settled'),
  ]))
  check(r.totalIntents === 3, 'mixed: totalIntents 3')
  check(r.noneCount === 1, 'mixed: noneCount 1')
  check(r.dueCount === 1, 'mixed: dueCount 1')
  check(r.noneCount + r.dueCount + r.settledCount === r.totalIntents, 'mixed: sum = total')
}

// 6. Single none
{
  const r = projectEcommerceCorrectionIntentRefundStatusBrief(state([correctionIntent('none')]))
  check(r.totalIntents === 1, 'single: totalIntents 1')
  check(r.noneCount === 1, 'single: noneCount 1')
  check(r.dueCount === 0, 'single: dueCount 0')
}

console.log(`ecommerce-correction-intent-refund-status-brief: ${checks} checks passed`)
