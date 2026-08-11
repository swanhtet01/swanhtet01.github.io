// Ecommerce correction intent refund status brief: none/due/settled 3-value enum.
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
function correctionIntent({ refundStatus = 'none' } = {}) {
  intentId++
  return {
    schema: 'supermega.ecommerce.correction_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `COR-${intentId}`,
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
    listedAmountMmk: 1000,
    reason: 'Test reason',
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

function state(correctionIntents) {
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
  const r = projectEcommerceCorrectionIntentRefundStatusBrief(state([]))
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.noneCount === 0, 'empty: noneCount 0')
  check(r.dueCount === 0, 'empty: dueCount 0')
  check(r.settledCount === 0, 'empty: settledCount 0')
  check(r.noneRate === 0, 'empty: noneRate 0')
}

// 2. All none
{
  const r = projectEcommerceCorrectionIntentRefundStatusBrief(
    state([correctionIntent({ refundStatus: 'none' }), correctionIntent({ refundStatus: 'none' })]),
  )
  check(r.noneCount === 2, 'all-none: noneCount 2')
  check(r.noneRate === 100, 'all-none: noneRate 100')
  check(r.dueRate === 0, 'all-none: dueRate 0')
}

// 3. All due
{
  const r = projectEcommerceCorrectionIntentRefundStatusBrief(
    state([correctionIntent({ refundStatus: 'due' })]),
  )
  check(r.dueCount === 1, 'all-due: dueCount 1')
  check(r.dueRate === 100, 'all-due: dueRate 100')
}

// 4. All settled
{
  const r = projectEcommerceCorrectionIntentRefundStatusBrief(
    state([correctionIntent({ refundStatus: 'settled' })]),
  )
  check(r.settledCount === 1, 'all-settled: settledCount 1')
  check(r.settledRate === 100, 'all-settled: settledRate 100')
}

// 5. Counts sum to total
{
  const r = projectEcommerceCorrectionIntentRefundStatusBrief(
    state([
      correctionIntent({ refundStatus: 'none' }),
      correctionIntent({ refundStatus: 'due' }),
      correctionIntent({ refundStatus: 'settled' }),
    ]),
  )
  check(r.noneCount + r.dueCount + r.settledCount === r.totalIntents, 'invariant: counts sum to total')
}

// 6. Rounding: 2/3 → 67%, 1/3 → 33%
{
  const r = projectEcommerceCorrectionIntentRefundStatusBrief(
    state([
      correctionIntent({ refundStatus: 'none' }),
      correctionIntent({ refundStatus: 'none' }),
      correctionIntent({ refundStatus: 'due' }),
    ]),
  )
  check(r.noneRate === 67, 'round: noneRate 67')
  check(r.dueRate === 33, 'round: dueRate 33')
  check(r.settledRate === 0, 'round: settledRate 0')
}

// 7. Mixed: none=1, due=2, settled=1
{
  const r = projectEcommerceCorrectionIntentRefundStatusBrief(
    state([
      correctionIntent({ refundStatus: 'none' }),
      correctionIntent({ refundStatus: 'due' }),
      correctionIntent({ refundStatus: 'due' }),
      correctionIntent({ refundStatus: 'settled' }),
    ]),
  )
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.dueCount === 2, 'mixed: dueCount 2')
  check(r.dueRate === 50, 'mixed: dueRate 50')
}

console.log(JSON.stringify({ ok: true, checks }))
