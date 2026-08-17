import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentTaxFiledPaymentChangedBrief } from './ecommerce-correction-intent-tax-filed-payment-changed-brief.ts'`,
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

const { projectEcommerceCorrectionIntentTaxFiledPaymentChangedBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(taxFiled = false, paymentChanged = false) {
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
    reasonCode: 'pricing_error',
    listedAmountMmk: 500,
    reason: 'Correction reason',
    orderChanged: false,
    paymentChanged,
    refundStarted: false,
    ledgerPosted: false,
    taxFiled,
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
  const r = projectEcommerceCorrectionIntentTaxFiledPaymentChangedBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.taxFiledPaymentChangedCount === 0, 'empty: taxFiledPaymentChangedCount 0')
  check(r.noTaxFiledNoPaymentChangeCount === 0, 'empty: noTaxFiledNoPaymentChangeCount 0')
}

// 2. Both true
{
  const r = projectEcommerceCorrectionIntentTaxFiledPaymentChangedBrief(state([
    correctionIntent(true, true),
  ]))
  check(r.totalIntents === 1, 'both-true: totalIntents 1')
  check(r.taxFiledPaymentChangedCount === 1, 'both-true: taxFiledPaymentChangedCount 1')
  check(r.taxFiledNoPaymentChangeCount === 0, 'both-true: taxFiledNoPaymentChangeCount 0')
  check(r.noTaxFiledPaymentChangedCount === 0, 'both-true: noTaxFiledPaymentChangedCount 0')
}

// 3. Tax filed, no payment change
{
  const r = projectEcommerceCorrectionIntentTaxFiledPaymentChangedBrief(state([
    correctionIntent(true, false),
  ]))
  check(r.totalIntents === 1, 'tax-nopayment: totalIntents 1')
  check(r.taxFiledNoPaymentChangeCount === 1, 'tax-nopayment: taxFiledNoPaymentChangeCount 1')
  check(r.taxFiledPaymentChangedCount === 0, 'tax-nopayment: taxFiledPaymentChangedCount 0')
  check(r.noTaxFiledNoPaymentChangeCount === 0, 'tax-nopayment: noTaxFiledNoPaymentChangeCount 0')
}

// 4. No tax filed, payment changed
{
  const r = projectEcommerceCorrectionIntentTaxFiledPaymentChangedBrief(state([
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 1, 'notax-payment: totalIntents 1')
  check(r.noTaxFiledPaymentChangedCount === 1, 'notax-payment: noTaxFiledPaymentChangedCount 1')
  check(r.taxFiledPaymentChangedCount === 0, 'notax-payment: taxFiledPaymentChangedCount 0')
}

// 5. Both false
{
  const r = projectEcommerceCorrectionIntentTaxFiledPaymentChangedBrief(state([
    correctionIntent(false, false),
  ]))
  check(r.totalIntents === 1, 'both-false: totalIntents 1')
  check(r.noTaxFiledNoPaymentChangeCount === 1, 'both-false: noTaxFiledNoPaymentChangeCount 1')
  check(r.taxFiledNoPaymentChangeCount === 0, 'both-false: taxFiledNoPaymentChangeCount 0')
}

// 6. Mixed: 2×(T,T), 1×(T,F), 1×(F,T)
{
  const r = projectEcommerceCorrectionIntentTaxFiledPaymentChangedBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.taxFiledPaymentChangedCount === 2, 'mixed: taxFiledPaymentChangedCount 2')
  check(r.taxFiledNoPaymentChangeCount === 1, 'mixed: taxFiledNoPaymentChangeCount 1')
  check(r.noTaxFiledPaymentChangedCount === 1, 'mixed: noTaxFiledPaymentChangedCount 1')
}

// 7. Row totals
{
  const r = projectEcommerceCorrectionIntentTaxFiledPaymentChangedBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, false),
  ]))
  check(r.taxFiledCount === 2, 'row-totals: taxFiledCount 2')
  check(r.noTaxFiledCount === 1, 'row-totals: noTaxFiledCount 1')
}

console.log(`ecommerce-correction-intent-tax-filed-payment-changed-brief: ${checks} checks passed`)
