import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentReasonCodeRatesBrief } from './ecommerce-correction-intent-reason-code-rates-brief.ts'`,
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

const { projectEcommerceCorrectionIntentReasonCodeRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent({ reasonCode = 'pricing_error' } = {}) {
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
    requestedKind: 'credit',
    reasonCode,
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

// 1. Empty state — 9 checks
{
  const r = projectEcommerceCorrectionIntentReasonCodeRatesBrief(state())
  check(r.totalIntents === 0, 'empty:totalIntents')
  check(r.pricingErrorCount === 0, 'empty:pricingErrorCount')
  check(r.pricingErrorRate === 0, 'empty:pricingErrorRate')
  check(r.serviceRecoveryCount === 0, 'empty:serviceRecoveryCount')
  check(r.serviceRecoveryRate === 0, 'empty:serviceRecoveryRate')
  check(r.feeAdjustmentCount === 0, 'empty:feeAdjustmentCount')
  check(r.feeAdjustmentRate === 0, 'empty:feeAdjustmentRate')
  check(r.otherReasonCount === 0, 'empty:otherReasonCount')
  check(r.otherReasonRate === 0, 'empty:otherReasonRate')
}

// 2. Single pricing_error — 3 checks
{
  const r = projectEcommerceCorrectionIntentReasonCodeRatesBrief(state([correctionIntent()]))
  check(r.totalIntents === 1, 'pricingError:total')
  check(r.pricingErrorCount === 1, 'pricingError:count')
  check(r.pricingErrorRate === 1, 'pricingError:rate')
}

// 3. Single service_recovery — 3 checks
{
  const r = projectEcommerceCorrectionIntentReasonCodeRatesBrief(state([
    correctionIntent({ reasonCode: 'service_recovery' }),
  ]))
  check(r.totalIntents === 1, 'serviceRecovery:total')
  check(r.serviceRecoveryCount === 1, 'serviceRecovery:count')
  check(r.serviceRecoveryRate === 1, 'serviceRecovery:rate')
}

// 4. Single fee_adjustment — 3 checks
{
  const r = projectEcommerceCorrectionIntentReasonCodeRatesBrief(state([
    correctionIntent({ reasonCode: 'fee_adjustment' }),
  ]))
  check(r.totalIntents === 1, 'feeAdjustment:total')
  check(r.feeAdjustmentCount === 1, 'feeAdjustment:count')
  check(r.feeAdjustmentRate === 1, 'feeAdjustment:rate')
}

// 5. Single other reason — 3 checks
{
  const r = projectEcommerceCorrectionIntentReasonCodeRatesBrief(state([
    correctionIntent({ reasonCode: 'unknown_code' }),
  ]))
  check(r.totalIntents === 1, 'other:total')
  check(r.otherReasonCount === 1, 'other:count')
  check(r.otherReasonRate === 1, 'other:rate')
}

// 6. One of each known + 1 other (5 total) — 1 check
{
  const r = projectEcommerceCorrectionIntentReasonCodeRatesBrief(state([
    correctionIntent(),
    correctionIntent({ reasonCode: 'service_recovery' }),
    correctionIntent({ reasonCode: 'fee_adjustment' }),
    correctionIntent({ reasonCode: 'unknown_code' }),
  ]))
  check(r.totalIntents === 4, 'allFour:total')
}

// 7. Precision: 1 pricing_error + 3 other (1/4 = 0.25) — 1 check
{
  const r = projectEcommerceCorrectionIntentReasonCodeRatesBrief(state([
    correctionIntent(),
    correctionIntent({ reasonCode: 'unknown_code' }),
    correctionIntent({ reasonCode: 'unknown_code' }),
    correctionIntent({ reasonCode: 'unknown_code' }),
  ]))
  check(r.pricingErrorRate === 0.25, 'precision:pricingErrorRate')
}

console.log(`ecommerce-correction-intent-reason-code-rates-brief: ${checks} checks passed`)
