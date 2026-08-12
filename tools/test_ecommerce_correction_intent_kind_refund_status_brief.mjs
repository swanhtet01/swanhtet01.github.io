import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentKindRefundStatusBrief } from './ecommerce-correction-intent-kind-refund-status-brief.ts'`,
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

const { projectEcommerceCorrectionIntentKindRefundStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(requestedKind = 'credit', refundStatus = 'none') {
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
    requestedKind,
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
  const r = projectEcommerceCorrectionIntentKindRefundStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.creditCount === 0, 'empty: creditCount 0')
  check(r.debitCount === 0, 'empty: debitCount 0')
}

// 2. Single credit/none
{
  const r = projectEcommerceCorrectionIntentKindRefundStatusBrief(state([
    correctionIntent('credit', 'none'),
  ]))
  check(r.totalIntents === 1, 'credit-none: totalIntents 1')
  check(r.creditCount === 1, 'credit-none: creditCount 1')
  check(r.creditNoneCount === 1, 'credit-none: creditNoneCount 1')
}

// 3. Single debit/due
{
  const r = projectEcommerceCorrectionIntentKindRefundStatusBrief(state([
    correctionIntent('debit', 'due'),
  ]))
  check(r.totalIntents === 1, 'debit-due: totalIntents 1')
  check(r.debitCount === 1, 'debit-due: debitCount 1')
  check(r.debitDueCount === 1, 'debit-due: debitDueCount 1')
}

// 4. Two credits: none + due
{
  const r = projectEcommerceCorrectionIntentKindRefundStatusBrief(state([
    correctionIntent('credit', 'none'),
    correctionIntent('credit', 'due'),
  ]))
  check(r.totalIntents === 2, 'two-credit: totalIntents 2')
  check(r.creditCount === 2, 'two-credit: creditCount 2')
  check(r.creditDueCount === 1, 'two-credit: creditDueCount 1')
}

// 5. credit/settled + debit/none
{
  const r = projectEcommerceCorrectionIntentKindRefundStatusBrief(state([
    correctionIntent('credit', 'settled'),
    correctionIntent('debit', 'none'),
  ]))
  check(r.creditSettledCount === 1, 'settled-none: creditSettledCount 1')
  check(r.debitNoneCount === 1, 'settled-none: debitNoneCount 1')
  check(r.debitSettledCount === 0, 'settled-none: debitSettledCount 0')
}

// 6. Mixed: all 6 sub-buckets
{
  const r = projectEcommerceCorrectionIntentKindRefundStatusBrief(state([
    correctionIntent('credit', 'none'),
    correctionIntent('credit', 'due'),
    correctionIntent('credit', 'settled'),
    correctionIntent('debit', 'none'),
    correctionIntent('debit', 'due'),
    correctionIntent('debit', 'settled'),
  ]))
  check(r.totalIntents === 6, 'all-buckets: totalIntents 6')
  check(r.creditCount === 3, 'all-buckets: creditCount 3')
  check(r.debitCount === 3, 'all-buckets: debitCount 3')
  check(r.creditNoneCount === 1, 'all-buckets: creditNoneCount 1')
}

// 7. All debit/settled
{
  const r = projectEcommerceCorrectionIntentKindRefundStatusBrief(state([
    correctionIntent('debit', 'settled'),
    correctionIntent('debit', 'settled'),
  ]))
  check(r.totalIntents === 2, 'all-debit-settled: totalIntents 2')
  check(r.debitCount === 2, 'all-debit-settled: debitCount 2')
  check(r.debitSettledCount === 2, 'all-debit-settled: debitSettledCount 2')
  check(r.creditCount === 0, 'all-debit-settled: creditCount 0')
}

console.log(`ecommerce-correction-intent-kind-refund-status-brief: ${checks} checks passed`)
