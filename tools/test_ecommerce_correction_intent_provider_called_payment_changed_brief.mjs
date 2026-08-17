import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentProviderCalledPaymentChangedBrief } from './ecommerce-correction-intent-provider-called-payment-changed-brief.ts'`,
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

const { projectEcommerceCorrectionIntentProviderCalledPaymentChangedBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(providerCalled = false, paymentChanged = false) {
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
    taxFiled: false,
    customerMessageSent: false,
    providerCalled,
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
  const r = projectEcommerceCorrectionIntentProviderCalledPaymentChangedBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.providerCalledPaymentChangedCount === 0, 'empty: providerCalledPaymentChangedCount 0')
  check(r.noProviderNoPaymentChangeCount === 0, 'empty: noProviderNoPaymentChangeCount 0')
}

// 2. Provider called + payment changed
{
  const r = projectEcommerceCorrectionIntentProviderCalledPaymentChangedBrief(state([
    correctionIntent(true, true),
  ]))
  check(r.totalIntents === 1, 'prov-pay: totalIntents 1')
  check(r.providerCalledPaymentChangedCount === 1, 'prov-pay: providerCalledPaymentChangedCount 1')
  check(r.providerCalledNoPaymentChangeCount === 0, 'prov-pay: providerCalledNoPaymentChangeCount 0')
  check(r.noProviderPaymentChangedCount === 0, 'prov-pay: noProviderPaymentChangedCount 0')
}

// 3. Provider called + no payment change
{
  const r = projectEcommerceCorrectionIntentProviderCalledPaymentChangedBrief(state([
    correctionIntent(true, false),
  ]))
  check(r.totalIntents === 1, 'prov-nopay: totalIntents 1')
  check(r.providerCalledNoPaymentChangeCount === 1, 'prov-nopay: providerCalledNoPaymentChangeCount 1')
  check(r.noProviderNoPaymentChangeCount === 0, 'prov-nopay: noProviderNoPaymentChangeCount 0')
  check(r.providerCalledPaymentChangedCount === 0, 'prov-nopay: providerCalledPaymentChangedCount 0')
}

// 4. No provider + payment changed
{
  const r = projectEcommerceCorrectionIntentProviderCalledPaymentChangedBrief(state([
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 1, 'noprov-pay: totalIntents 1')
  check(r.noProviderPaymentChangedCount === 1, 'noprov-pay: noProviderPaymentChangedCount 1')
  check(r.providerCalledPaymentChangedCount === 0, 'noprov-pay: providerCalledPaymentChangedCount 0')
}

// 5. No provider + no payment change
{
  const r = projectEcommerceCorrectionIntentProviderCalledPaymentChangedBrief(state([
    correctionIntent(false, false),
  ]))
  check(r.totalIntents === 1, 'noprov-nopay: totalIntents 1')
  check(r.noProviderNoPaymentChangeCount === 1, 'noprov-nopay: noProviderNoPaymentChangeCount 1')
  check(r.noProviderPaymentChangedCount === 0, 'noprov-nopay: noProviderPaymentChangedCount 0')
}

// 6. Mixed: 2 prov+payChanged, 1 prov+noPay, 1 noProv+payChanged
{
  const r = projectEcommerceCorrectionIntentProviderCalledPaymentChangedBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.providerCalledPaymentChangedCount === 2, 'mixed: providerCalledPaymentChangedCount 2')
  check(r.providerCalledNoPaymentChangeCount === 1, 'mixed: providerCalledNoPaymentChangeCount 1')
  check(r.noProviderPaymentChangedCount === 1, 'mixed: noProviderPaymentChangedCount 1')
}

// 7. Row totals
{
  const r = projectEcommerceCorrectionIntentProviderCalledPaymentChangedBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, false),
  ]))
  check(r.providerCalledCount === 2, 'row-totals: providerCalledCount 2')
  check(r.noProviderCount === 1, 'row-totals: noProviderCount 1')
}

console.log(`ecommerce-correction-intent-provider-called-payment-changed-brief: ${checks} checks passed`)
