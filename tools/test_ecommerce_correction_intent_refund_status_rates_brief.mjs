import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentRefundStatusRatesBrief } from './ecommerce-correction-intent-refund-status-rates-brief.ts'`,
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

const { projectEcommerceCorrectionIntentRefundStatusRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent({ refundStatus = 'none' } = {}) {
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

// 1. Empty state — 7 checks
{
  const r = projectEcommerceCorrectionIntentRefundStatusRatesBrief(state())
  check(r.totalIntents === 0, 'empty:totalIntents')
  check(r.noneCount === 0, 'empty:noneCount')
  check(r.noneRate === 0, 'empty:noneRate')
  check(r.dueCount === 0, 'empty:dueCount')
  check(r.dueRate === 0, 'empty:dueRate')
  check(r.settledCount === 0, 'empty:settledCount')
  check(r.settledRate === 0, 'empty:settledRate')
}

// 2. Single none — 3 checks
{
  const r = projectEcommerceCorrectionIntentRefundStatusRatesBrief(state([correctionIntent()]))
  check(r.totalIntents === 1, 'none:total')
  check(r.noneCount === 1, 'none:count')
  check(r.noneRate === 1, 'none:rate')
}

// 3. Single due — 3 checks
{
  const r = projectEcommerceCorrectionIntentRefundStatusRatesBrief(state([
    correctionIntent({ refundStatus: 'due' }),
  ]))
  check(r.totalIntents === 1, 'due:total')
  check(r.dueCount === 1, 'due:count')
  check(r.dueRate === 1, 'due:rate')
}

// 4. Single settled — 3 checks
{
  const r = projectEcommerceCorrectionIntentRefundStatusRatesBrief(state([
    correctionIntent({ refundStatus: 'settled' }),
  ]))
  check(r.totalIntents === 1, 'settled:total')
  check(r.settledCount === 1, 'settled:count')
  check(r.settledRate === 1, 'settled:rate')
}

// 5. One of each — 3 checks
{
  const r = projectEcommerceCorrectionIntentRefundStatusRatesBrief(state([
    correctionIntent(),
    correctionIntent({ refundStatus: 'due' }),
    correctionIntent({ refundStatus: 'settled' }),
  ]))
  check(r.totalIntents === 3, 'allThree:total')
  check(r.noneCount === 1, 'allThree:noneCount')
  check(r.dueCount === 1, 'allThree:dueCount')
}

// 6. 2 none + 1 due — 2 checks
{
  const r = projectEcommerceCorrectionIntentRefundStatusRatesBrief(state([
    correctionIntent(),
    correctionIntent(),
    correctionIntent({ refundStatus: 'due' }),
  ]))
  check(r.noneCount === 2, 'twoPlusOne:noneCount')
  check(r.noneRate === 0.6667, 'twoPlusOne:noneRate')
}

// 7. 1 none + 2 settled — 2 checks
{
  const r = projectEcommerceCorrectionIntentRefundStatusRatesBrief(state([
    correctionIntent(),
    correctionIntent({ refundStatus: 'settled' }),
    correctionIntent({ refundStatus: 'settled' }),
  ]))
  check(r.settledRate === 0.6667, 'precision:settledRate')
  check(r.noneRate === 0.3333, 'precision:noneRate')
}

console.log(`ecommerce-correction-intent-refund-status-rates-brief: ${checks} checks passed`)
