import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentRequestedKindPaymentChangedBrief } from './ecommerce-correction-intent-requested-kind-payment-changed-brief.ts'`,
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

const { projectEcommerceCorrectionIntentRequestedKindPaymentChangedBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(requestedKind = 'credit', paymentChanged = false) {
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
    paymentChanged,
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
  const r = projectEcommerceCorrectionIntentRequestedKindPaymentChangedBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.creditPaymentChangedCount === 0, 'empty: creditPaymentChangedCount 0')
  check(r.debitNoPaymentChangeCount === 0, 'empty: debitNoPaymentChangeCount 0')
}

// 2. Credit + payment changed
{
  const r = projectEcommerceCorrectionIntentRequestedKindPaymentChangedBrief(state([
    correctionIntent('credit', true),
  ]))
  check(r.totalIntents === 1, 'cred-pay: totalIntents 1')
  check(r.creditPaymentChangedCount === 1, 'cred-pay: creditPaymentChangedCount 1')
  check(r.creditNoPaymentChangeCount === 0, 'cred-pay: creditNoPaymentChangeCount 0')
  check(r.debitPaymentChangedCount === 0, 'cred-pay: debitPaymentChangedCount 0')
}

// 3. Credit + no payment change
{
  const r = projectEcommerceCorrectionIntentRequestedKindPaymentChangedBrief(state([
    correctionIntent('credit', false),
  ]))
  check(r.totalIntents === 1, 'cred-nopay: totalIntents 1')
  check(r.creditNoPaymentChangeCount === 1, 'cred-nopay: creditNoPaymentChangeCount 1')
  check(r.debitNoPaymentChangeCount === 0, 'cred-nopay: debitNoPaymentChangeCount 0')
  check(r.creditPaymentChangedCount === 0, 'cred-nopay: creditPaymentChangedCount 0')
}

// 4. Debit + payment changed
{
  const r = projectEcommerceCorrectionIntentRequestedKindPaymentChangedBrief(state([
    correctionIntent('debit', true),
  ]))
  check(r.totalIntents === 1, 'deb-pay: totalIntents 1')
  check(r.debitPaymentChangedCount === 1, 'deb-pay: debitPaymentChangedCount 1')
  check(r.creditPaymentChangedCount === 0, 'deb-pay: creditPaymentChangedCount 0')
}

// 5. Debit + no payment change
{
  const r = projectEcommerceCorrectionIntentRequestedKindPaymentChangedBrief(state([
    correctionIntent('debit', false),
  ]))
  check(r.totalIntents === 1, 'deb-nopay: totalIntents 1')
  check(r.debitNoPaymentChangeCount === 1, 'deb-nopay: debitNoPaymentChangeCount 1')
  check(r.debitPaymentChangedCount === 0, 'deb-nopay: debitPaymentChangedCount 0')
}

// 6. Mixed: 2 credit+payChanged, 1 credit+noPay, 1 debit+payChanged
{
  const r = projectEcommerceCorrectionIntentRequestedKindPaymentChangedBrief(state([
    correctionIntent('credit', true),
    correctionIntent('credit', true),
    correctionIntent('credit', false),
    correctionIntent('debit', true),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.creditPaymentChangedCount === 2, 'mixed: creditPaymentChangedCount 2')
  check(r.creditNoPaymentChangeCount === 1, 'mixed: creditNoPaymentChangeCount 1')
  check(r.debitPaymentChangedCount === 1, 'mixed: debitPaymentChangedCount 1')
}

// 7. Kind totals
{
  const r = projectEcommerceCorrectionIntentRequestedKindPaymentChangedBrief(state([
    correctionIntent('credit', true),
    correctionIntent('credit', false),
    correctionIntent('debit', false),
  ]))
  check(r.creditCount === 2, 'kind-totals: creditCount 2')
  check(r.debitCount === 1, 'kind-totals: debitCount 1')
}

console.log(`ecommerce-correction-intent-requested-kind-payment-changed-brief: ${checks} checks passed`)
