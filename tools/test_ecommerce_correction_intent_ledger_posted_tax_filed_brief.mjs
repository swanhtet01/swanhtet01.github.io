import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentLedgerPostedTaxFiledBrief } from './ecommerce-correction-intent-ledger-posted-tax-filed-brief.ts'`,
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

const { projectEcommerceCorrectionIntentLedgerPostedTaxFiledBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(ledgerPosted = false, taxFiled = false) {
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
    paymentChanged: false,
    refundStarted: false,
    ledgerPosted,
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
  const r = projectEcommerceCorrectionIntentLedgerPostedTaxFiledBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.ledgerPostedTaxFiledCount === 0, 'empty: ledgerPostedTaxFiledCount 0')
  check(r.noLedgerNoTaxCount === 0, 'empty: noLedgerNoTaxCount 0')
}

// 2. Both true
{
  const r = projectEcommerceCorrectionIntentLedgerPostedTaxFiledBrief(state([
    correctionIntent(true, true),
  ]))
  check(r.totalIntents === 1, 'both-true: totalIntents 1')
  check(r.ledgerPostedTaxFiledCount === 1, 'both-true: ledgerPostedTaxFiledCount 1')
  check(r.ledgerPostedNoTaxCount === 0, 'both-true: ledgerPostedNoTaxCount 0')
  check(r.noLedgerTaxFiledCount === 0, 'both-true: noLedgerTaxFiledCount 0')
}

// 3. Ledger posted, no tax
{
  const r = projectEcommerceCorrectionIntentLedgerPostedTaxFiledBrief(state([
    correctionIntent(true, false),
  ]))
  check(r.totalIntents === 1, 'ledger-notax: totalIntents 1')
  check(r.ledgerPostedNoTaxCount === 1, 'ledger-notax: ledgerPostedNoTaxCount 1')
  check(r.ledgerPostedTaxFiledCount === 0, 'ledger-notax: ledgerPostedTaxFiledCount 0')
  check(r.noLedgerNoTaxCount === 0, 'ledger-notax: noLedgerNoTaxCount 0')
}

// 4. No ledger, tax filed
{
  const r = projectEcommerceCorrectionIntentLedgerPostedTaxFiledBrief(state([
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 1, 'noledger-tax: totalIntents 1')
  check(r.noLedgerTaxFiledCount === 1, 'noledger-tax: noLedgerTaxFiledCount 1')
  check(r.ledgerPostedTaxFiledCount === 0, 'noledger-tax: ledgerPostedTaxFiledCount 0')
}

// 5. Both false
{
  const r = projectEcommerceCorrectionIntentLedgerPostedTaxFiledBrief(state([
    correctionIntent(false, false),
  ]))
  check(r.totalIntents === 1, 'both-false: totalIntents 1')
  check(r.noLedgerNoTaxCount === 1, 'both-false: noLedgerNoTaxCount 1')
  check(r.ledgerPostedNoTaxCount === 0, 'both-false: ledgerPostedNoTaxCount 0')
}

// 6. Mixed: 2×(T,T), 1×(T,F), 1×(F,T)
{
  const r = projectEcommerceCorrectionIntentLedgerPostedTaxFiledBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.ledgerPostedTaxFiledCount === 2, 'mixed: ledgerPostedTaxFiledCount 2')
  check(r.ledgerPostedNoTaxCount === 1, 'mixed: ledgerPostedNoTaxCount 1')
  check(r.noLedgerTaxFiledCount === 1, 'mixed: noLedgerTaxFiledCount 1')
}

// 7. Row totals
{
  const r = projectEcommerceCorrectionIntentLedgerPostedTaxFiledBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, false),
  ]))
  check(r.ledgerPostedCount === 2, 'row-totals: ledgerPostedCount 2')
  check(r.noLedgerCount === 1, 'row-totals: noLedgerCount 1')
}

console.log(`ecommerce-correction-intent-ledger-posted-tax-filed-brief: ${checks} checks passed`)
