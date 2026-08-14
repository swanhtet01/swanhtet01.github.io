// Ecommerce correction intent kind/reason brief: credit/debit + 4-value reason enum.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentKindReasonBrief } from './ecommerce-correction-intent-kind-reason-brief.ts'`,
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

const { projectEcommerceCorrectionIntentKindReasonBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent({ requestedKind = 'credit', reasonCode = 'pricing_error' } = {}) {
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
    refundStatus: 'none',
    requestedKind,
    reasonCode,
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
  const r = projectEcommerceCorrectionIntentKindReasonBrief(state([]))
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.creditCount === 0, 'empty: creditCount 0')
  check(r.debitCount === 0, 'empty: debitCount 0')
  check(r.creditRate === 0, 'empty: creditRate 0')
  check(r.pricingErrorCount === 0, 'empty: pricingErrorCount 0')
}

// 2. All credit
{
  const r = projectEcommerceCorrectionIntentKindReasonBrief(
    state([correctionIntent({ requestedKind: 'credit' }), correctionIntent({ requestedKind: 'credit' })]),
  )
  check(r.creditCount === 2, 'all-credit: creditCount 2')
  check(r.debitCount === 0, 'all-credit: debitCount 0')
  check(r.creditRate === 100, 'all-credit: creditRate 100')
  check(r.debitRate === 0, 'all-credit: debitRate 0')
}

// 3. All debit
{
  const r = projectEcommerceCorrectionIntentKindReasonBrief(
    state([correctionIntent({ requestedKind: 'debit' })]),
  )
  check(r.debitCount === 1, 'all-debit: debitCount 1')
  check(r.debitRate === 100, 'all-debit: debitRate 100')
}

// 4. 50/50 credit/debit
{
  const r = projectEcommerceCorrectionIntentKindReasonBrief(
    state([correctionIntent({ requestedKind: 'credit' }), correctionIntent({ requestedKind: 'debit' })]),
  )
  check(r.creditRate === 50, 'split: creditRate 50')
  check(r.debitRate === 50, 'split: debitRate 50')
}

// 5. All pricing_error
{
  const r = projectEcommerceCorrectionIntentKindReasonBrief(
    state([correctionIntent({ reasonCode: 'pricing_error' })]),
  )
  check(r.pricingErrorCount === 1, 'pe: pricingErrorCount 1')
  check(r.pricingErrorRate === 100, 'pe: pricingErrorRate 100')
}

// 6. All service_recovery
{
  const r = projectEcommerceCorrectionIntentKindReasonBrief(
    state([correctionIntent({ reasonCode: 'service_recovery' })]),
  )
  check(r.serviceRecoveryCount === 1, 'sr: serviceRecoveryCount 1')
  check(r.serviceRecoveryRate === 100, 'sr: serviceRecoveryRate 100')
}

// 7. All fee_adjustment
{
  const r = projectEcommerceCorrectionIntentKindReasonBrief(
    state([correctionIntent({ reasonCode: 'fee_adjustment' })]),
  )
  check(r.feeAdjustmentCount === 1, 'fa: feeAdjustmentCount 1')
  check(r.feeAdjustmentRate === 100, 'fa: feeAdjustmentRate 100')
}

// 8. All other reason
{
  const r = projectEcommerceCorrectionIntentKindReasonBrief(
    state([correctionIntent({ reasonCode: 'other' })]),
  )
  check(r.otherReasonCount === 1, 'other: otherReasonCount 1')
  check(r.otherReasonRate === 100, 'other: otherReasonRate 100')
}

// 9. Reason counts sum to total
{
  const r = projectEcommerceCorrectionIntentKindReasonBrief(
    state([
      correctionIntent({ reasonCode: 'pricing_error' }),
      correctionIntent({ reasonCode: 'service_recovery' }),
      correctionIntent({ reasonCode: 'other' }),
    ]),
  )
  check(
    r.pricingErrorCount + r.serviceRecoveryCount + r.feeAdjustmentCount + r.otherReasonCount === r.totalIntents,
    'invariant: reason counts sum to total',
  )
}

// 10. Kind counts sum to total
{
  const r = projectEcommerceCorrectionIntentKindReasonBrief(
    state([
      correctionIntent({ requestedKind: 'credit' }),
      correctionIntent({ requestedKind: 'credit' }),
      correctionIntent({ requestedKind: 'debit' }),
    ]),
  )
  check(r.creditCount + r.debitCount === r.totalIntents, 'invariant: kind counts sum to total')
  check(r.creditRate === 67, 'round: creditRate 67')
  check(r.debitRate === 33, 'round: debitRate 33')
}

console.log(JSON.stringify({ ok: true, checks }))
