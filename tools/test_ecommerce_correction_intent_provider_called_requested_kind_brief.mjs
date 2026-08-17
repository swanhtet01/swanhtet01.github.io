import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentProviderCalledRequestedKindBrief } from './ecommerce-correction-intent-provider-called-requested-kind-brief.ts'`,
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

const { projectEcommerceCorrectionIntentProviderCalledRequestedKindBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(providerCalled = false, requestedKind = 'credit') {
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
  const r = projectEcommerceCorrectionIntentProviderCalledRequestedKindBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.providerCalledCreditCount === 0, 'empty: providerCalledCreditCount 0')
  check(r.noProviderCreditCount === 0, 'empty: noProviderCreditCount 0')
}

// 2. Provider called + credit
{
  const r = projectEcommerceCorrectionIntentProviderCalledRequestedKindBrief(state([
    correctionIntent(true, 'credit'),
  ]))
  check(r.totalIntents === 1, 'prov-credit: totalIntents 1')
  check(r.providerCalledCreditCount === 1, 'prov-credit: providerCalledCreditCount 1')
  check(r.providerCalledDebitCount === 0, 'prov-credit: providerCalledDebitCount 0')
  check(r.noProviderCreditCount === 0, 'prov-credit: noProviderCreditCount 0')
}

// 3. Provider called + debit
{
  const r = projectEcommerceCorrectionIntentProviderCalledRequestedKindBrief(state([
    correctionIntent(true, 'debit'),
  ]))
  check(r.totalIntents === 1, 'prov-debit: totalIntents 1')
  check(r.providerCalledDebitCount === 1, 'prov-debit: providerCalledDebitCount 1')
  check(r.noProviderDebitCount === 0, 'prov-debit: noProviderDebitCount 0')
  check(r.providerCalledCreditCount === 0, 'prov-debit: providerCalledCreditCount 0')
}

// 4. No provider + credit
{
  const r = projectEcommerceCorrectionIntentProviderCalledRequestedKindBrief(state([
    correctionIntent(false, 'credit'),
  ]))
  check(r.totalIntents === 1, 'noprov-credit: totalIntents 1')
  check(r.noProviderCreditCount === 1, 'noprov-credit: noProviderCreditCount 1')
  check(r.providerCalledCreditCount === 0, 'noprov-credit: providerCalledCreditCount 0')
}

// 5. No provider + debit
{
  const r = projectEcommerceCorrectionIntentProviderCalledRequestedKindBrief(state([
    correctionIntent(false, 'debit'),
  ]))
  check(r.totalIntents === 1, 'noprov-debit: totalIntents 1')
  check(r.noProviderDebitCount === 1, 'noprov-debit: noProviderDebitCount 1')
  check(r.providerCalledDebitCount === 0, 'noprov-debit: providerCalledDebitCount 0')
}

// 6. Mixed: 2 prov+credit, 1 prov+debit, 1 noProvider+debit
{
  const r = projectEcommerceCorrectionIntentProviderCalledRequestedKindBrief(state([
    correctionIntent(true, 'credit'),
    correctionIntent(true, 'credit'),
    correctionIntent(true, 'debit'),
    correctionIntent(false, 'debit'),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.providerCalledCreditCount === 2, 'mixed: providerCalledCreditCount 2')
  check(r.providerCalledDebitCount === 1, 'mixed: providerCalledDebitCount 1')
  check(r.noProviderDebitCount === 1, 'mixed: noProviderDebitCount 1')
}

// 7. Row totals
{
  const r = projectEcommerceCorrectionIntentProviderCalledRequestedKindBrief(state([
    correctionIntent(true, 'credit'),
    correctionIntent(true, 'debit'),
    correctionIntent(false, 'credit'),
  ]))
  check(r.providerCalledCount === 2, 'row-totals: providerCalledCount 2')
  check(r.noProviderCount === 1, 'row-totals: noProviderCount 1')
}

console.log(`ecommerce-correction-intent-provider-called-requested-kind-brief: ${checks} checks passed`)
