import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentLedgerPostedPaymentChangedBrief } from './ecommerce-correction-intent-ledger-posted-payment-changed-brief.ts'`,
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

const { projectEcommerceCorrectionIntentLedgerPostedPaymentChangedBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(ledgerPosted = false, paymentChanged = false) {
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
    ledgerPosted,
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
  const r = projectEcommerceCorrectionIntentLedgerPostedPaymentChangedBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.ledgerPostedPaymentChangedCount === 0, 'empty: ledgerPostedPaymentChangedCount 0')
  check(r.noLedgerNoPaymentChangeCount === 0, 'empty: noLedgerNoPaymentChangeCount 0')
}

// 2. Both true
{
  const r = projectEcommerceCorrectionIntentLedgerPostedPaymentChangedBrief(state([
    correctionIntent(true, true),
  ]))
  check(r.totalIntents === 1, 'both-true: totalIntents 1')
  check(r.ledgerPostedPaymentChangedCount === 1, 'both-true: ledgerPostedPaymentChangedCount 1')
  check(r.ledgerPostedNoPaymentChangeCount === 0, 'both-true: ledgerPostedNoPaymentChangeCount 0')
  check(r.noLedgerPaymentChangedCount === 0, 'both-true: noLedgerPaymentChangedCount 0')
}

// 3. Ledger posted, no payment change
{
  const r = projectEcommerceCorrectionIntentLedgerPostedPaymentChangedBrief(state([
    correctionIntent(true, false),
  ]))
  check(r.totalIntents === 1, 'ledger-nopayment: totalIntents 1')
  check(r.ledgerPostedNoPaymentChangeCount === 1, 'ledger-nopayment: ledgerPostedNoPaymentChangeCount 1')
  check(r.ledgerPostedPaymentChangedCount === 0, 'ledger-nopayment: ledgerPostedPaymentChangedCount 0')
  check(r.noLedgerNoPaymentChangeCount === 0, 'ledger-nopayment: noLedgerNoPaymentChangeCount 0')
}

// 4. No ledger, payment changed
{
  const r = projectEcommerceCorrectionIntentLedgerPostedPaymentChangedBrief(state([
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 1, 'noledger-payment: totalIntents 1')
  check(r.noLedgerPaymentChangedCount === 1, 'noledger-payment: noLedgerPaymentChangedCount 1')
  check(r.ledgerPostedPaymentChangedCount === 0, 'noledger-payment: ledgerPostedPaymentChangedCount 0')
}

// 5. Both false
{
  const r = projectEcommerceCorrectionIntentLedgerPostedPaymentChangedBrief(state([
    correctionIntent(false, false),
  ]))
  check(r.totalIntents === 1, 'both-false: totalIntents 1')
  check(r.noLedgerNoPaymentChangeCount === 1, 'both-false: noLedgerNoPaymentChangeCount 1')
  check(r.ledgerPostedNoPaymentChangeCount === 0, 'both-false: ledgerPostedNoPaymentChangeCount 0')
}

// 6. Mixed: 2×(T,T), 1×(T,F), 1×(F,T)
{
  const r = projectEcommerceCorrectionIntentLedgerPostedPaymentChangedBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.ledgerPostedPaymentChangedCount === 2, 'mixed: ledgerPostedPaymentChangedCount 2')
  check(r.ledgerPostedNoPaymentChangeCount === 1, 'mixed: ledgerPostedNoPaymentChangeCount 1')
  check(r.noLedgerPaymentChangedCount === 1, 'mixed: noLedgerPaymentChangedCount 1')
}

// 7. Row totals
{
  const r = projectEcommerceCorrectionIntentLedgerPostedPaymentChangedBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, false),
  ]))
  check(r.ledgerPostedCount === 2, 'row-totals: ledgerPostedCount 2')
  check(r.noLedgerCount === 1, 'row-totals: noLedgerCount 1')
}

console.log(`ecommerce-correction-intent-ledger-posted-payment-changed-brief: ${checks} checks passed`)
