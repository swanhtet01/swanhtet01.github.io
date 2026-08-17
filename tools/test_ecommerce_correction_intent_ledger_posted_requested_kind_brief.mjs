import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentLedgerPostedRequestedKindBrief } from './ecommerce-correction-intent-ledger-posted-requested-kind-brief.ts'`,
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

const { projectEcommerceCorrectionIntentLedgerPostedRequestedKindBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(ledgerPosted = false, requestedKind = 'credit') {
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
  const r = projectEcommerceCorrectionIntentLedgerPostedRequestedKindBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.ledgerPostedCreditCount === 0, 'empty: ledgerPostedCreditCount 0')
  check(r.noLedgerDebitCount === 0, 'empty: noLedgerDebitCount 0')
}

// 2. Ledger posted + credit
{
  const r = projectEcommerceCorrectionIntentLedgerPostedRequestedKindBrief(state([
    correctionIntent(true, 'credit'),
  ]))
  check(r.totalIntents === 1, 'ledger-credit: totalIntents 1')
  check(r.ledgerPostedCreditCount === 1, 'ledger-credit: ledgerPostedCreditCount 1')
  check(r.ledgerPostedDebitCount === 0, 'ledger-credit: ledgerPostedDebitCount 0')
  check(r.noLedgerCreditCount === 0, 'ledger-credit: noLedgerCreditCount 0')
}

// 3. Ledger posted + debit
{
  const r = projectEcommerceCorrectionIntentLedgerPostedRequestedKindBrief(state([
    correctionIntent(true, 'debit'),
  ]))
  check(r.totalIntents === 1, 'ledger-debit: totalIntents 1')
  check(r.ledgerPostedDebitCount === 1, 'ledger-debit: ledgerPostedDebitCount 1')
  check(r.noLedgerDebitCount === 0, 'ledger-debit: noLedgerDebitCount 0')
  check(r.ledgerPostedCreditCount === 0, 'ledger-debit: ledgerPostedCreditCount 0')
}

// 4. No ledger + credit
{
  const r = projectEcommerceCorrectionIntentLedgerPostedRequestedKindBrief(state([
    correctionIntent(false, 'credit'),
  ]))
  check(r.totalIntents === 1, 'noledger-credit: totalIntents 1')
  check(r.noLedgerCreditCount === 1, 'noledger-credit: noLedgerCreditCount 1')
  check(r.ledgerPostedCreditCount === 0, 'noledger-credit: ledgerPostedCreditCount 0')
}

// 5. No ledger + debit
{
  const r = projectEcommerceCorrectionIntentLedgerPostedRequestedKindBrief(state([
    correctionIntent(false, 'debit'),
  ]))
  check(r.totalIntents === 1, 'noledger-debit: totalIntents 1')
  check(r.noLedgerDebitCount === 1, 'noledger-debit: noLedgerDebitCount 1')
  check(r.noLedgerCreditCount === 0, 'noledger-debit: noLedgerCreditCount 0')
}

// 6. Mixed: 2 ledger+credit, 1 ledger+debit, 1 noLedger+credit
{
  const r = projectEcommerceCorrectionIntentLedgerPostedRequestedKindBrief(state([
    correctionIntent(true, 'credit'),
    correctionIntent(true, 'credit'),
    correctionIntent(true, 'debit'),
    correctionIntent(false, 'credit'),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.ledgerPostedCreditCount === 2, 'mixed: ledgerPostedCreditCount 2')
  check(r.ledgerPostedDebitCount === 1, 'mixed: ledgerPostedDebitCount 1')
  check(r.noLedgerCreditCount === 1, 'mixed: noLedgerCreditCount 1')
}

// 7. Row totals
{
  const r = projectEcommerceCorrectionIntentLedgerPostedRequestedKindBrief(state([
    correctionIntent(true, 'credit'),
    correctionIntent(true, 'debit'),
    correctionIntent(false, 'credit'),
  ]))
  check(r.ledgerPostedCount === 2, 'row-totals: ledgerPostedCount 2')
  check(r.noLedgerCount === 1, 'row-totals: noLedgerCount 1')
}

console.log(`ecommerce-correction-intent-ledger-posted-requested-kind-brief: ${checks} checks passed`)
