import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentRefundStartedRequestedKindBrief } from './ecommerce-correction-intent-refund-started-requested-kind-brief.ts'`,
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

const { projectEcommerceCorrectionIntentRefundStartedRequestedKindBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(refundStarted = false, requestedKind = 'credit') {
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
    refundStatus: 'none',
    requestedKind,
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
  const r = projectEcommerceCorrectionIntentRefundStartedRequestedKindBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.refundStartedCreditCount === 0, 'empty: refundStartedCreditCount 0')
  check(r.noRefundCreditCount === 0, 'empty: noRefundCreditCount 0')
}

// 2. Refund started + credit
{
  const r = projectEcommerceCorrectionIntentRefundStartedRequestedKindBrief(state([
    correctionIntent(true, 'credit'),
  ]))
  check(r.totalIntents === 1, 'ref-credit: totalIntents 1')
  check(r.refundStartedCreditCount === 1, 'ref-credit: refundStartedCreditCount 1')
  check(r.refundStartedDebitCount === 0, 'ref-credit: refundStartedDebitCount 0')
  check(r.noRefundCreditCount === 0, 'ref-credit: noRefundCreditCount 0')
}

// 3. Refund started + debit
{
  const r = projectEcommerceCorrectionIntentRefundStartedRequestedKindBrief(state([
    correctionIntent(true, 'debit'),
  ]))
  check(r.totalIntents === 1, 'ref-debit: totalIntents 1')
  check(r.refundStartedDebitCount === 1, 'ref-debit: refundStartedDebitCount 1')
  check(r.noRefundDebitCount === 0, 'ref-debit: noRefundDebitCount 0')
  check(r.refundStartedCreditCount === 0, 'ref-debit: refundStartedCreditCount 0')
}

// 4. No refund + credit
{
  const r = projectEcommerceCorrectionIntentRefundStartedRequestedKindBrief(state([
    correctionIntent(false, 'credit'),
  ]))
  check(r.totalIntents === 1, 'noref-credit: totalIntents 1')
  check(r.noRefundCreditCount === 1, 'noref-credit: noRefundCreditCount 1')
  check(r.refundStartedCreditCount === 0, 'noref-credit: refundStartedCreditCount 0')
}

// 5. No refund + debit
{
  const r = projectEcommerceCorrectionIntentRefundStartedRequestedKindBrief(state([
    correctionIntent(false, 'debit'),
  ]))
  check(r.totalIntents === 1, 'noref-debit: totalIntents 1')
  check(r.noRefundDebitCount === 1, 'noref-debit: noRefundDebitCount 1')
  check(r.refundStartedDebitCount === 0, 'noref-debit: refundStartedDebitCount 0')
}

// 6. Mixed: 2 ref+credit, 1 ref+debit, 1 noRef+debit
{
  const r = projectEcommerceCorrectionIntentRefundStartedRequestedKindBrief(state([
    correctionIntent(true, 'credit'),
    correctionIntent(true, 'credit'),
    correctionIntent(true, 'debit'),
    correctionIntent(false, 'debit'),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.refundStartedCreditCount === 2, 'mixed: refundStartedCreditCount 2')
  check(r.refundStartedDebitCount === 1, 'mixed: refundStartedDebitCount 1')
  check(r.noRefundDebitCount === 1, 'mixed: noRefundDebitCount 1')
}

// 7. Row totals
{
  const r = projectEcommerceCorrectionIntentRefundStartedRequestedKindBrief(state([
    correctionIntent(true, 'credit'),
    correctionIntent(true, 'debit'),
    correctionIntent(false, 'credit'),
  ]))
  check(r.refundStartedCount === 2, 'row-totals: refundStartedCount 2')
  check(r.noRefundCount === 1, 'row-totals: noRefundCount 1')
}

console.log(`ecommerce-correction-intent-refund-started-requested-kind-brief: ${checks} checks passed`)
