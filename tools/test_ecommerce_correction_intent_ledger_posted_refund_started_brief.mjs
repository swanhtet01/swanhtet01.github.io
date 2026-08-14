import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentLedgerPostedRefundStartedBrief } from './ecommerce-correction-intent-ledger-posted-refund-started-brief.ts'`,
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

const { projectEcommerceCorrectionIntentLedgerPostedRefundStartedBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(ledgerPosted = false, refundStarted = false) {
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
    refundStarted,
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
  const r = projectEcommerceCorrectionIntentLedgerPostedRefundStartedBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.ledgerPostedRefundStartedCount === 0, 'empty: ledgerPostedRefundStartedCount 0')
  check(r.noLedgerNoRefundCount === 0, 'empty: noLedgerNoRefundCount 0')
}

// 2. Both true
{
  const r = projectEcommerceCorrectionIntentLedgerPostedRefundStartedBrief(state([
    correctionIntent(true, true),
  ]))
  check(r.totalIntents === 1, 'both-true: totalIntents 1')
  check(r.ledgerPostedRefundStartedCount === 1, 'both-true: ledgerPostedRefundStartedCount 1')
  check(r.ledgerPostedNoRefundCount === 0, 'both-true: ledgerPostedNoRefundCount 0')
  check(r.noLedgerRefundStartedCount === 0, 'both-true: noLedgerRefundStartedCount 0')
}

// 3. Ledger posted, no refund
{
  const r = projectEcommerceCorrectionIntentLedgerPostedRefundStartedBrief(state([
    correctionIntent(true, false),
  ]))
  check(r.totalIntents === 1, 'ledger-norefund: totalIntents 1')
  check(r.ledgerPostedNoRefundCount === 1, 'ledger-norefund: ledgerPostedNoRefundCount 1')
  check(r.ledgerPostedRefundStartedCount === 0, 'ledger-norefund: ledgerPostedRefundStartedCount 0')
  check(r.noLedgerNoRefundCount === 0, 'ledger-norefund: noLedgerNoRefundCount 0')
}

// 4. No ledger, refund started
{
  const r = projectEcommerceCorrectionIntentLedgerPostedRefundStartedBrief(state([
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 1, 'noledger-refund: totalIntents 1')
  check(r.noLedgerRefundStartedCount === 1, 'noledger-refund: noLedgerRefundStartedCount 1')
  check(r.ledgerPostedRefundStartedCount === 0, 'noledger-refund: ledgerPostedRefundStartedCount 0')
}

// 5. Both false
{
  const r = projectEcommerceCorrectionIntentLedgerPostedRefundStartedBrief(state([
    correctionIntent(false, false),
  ]))
  check(r.totalIntents === 1, 'both-false: totalIntents 1')
  check(r.noLedgerNoRefundCount === 1, 'both-false: noLedgerNoRefundCount 1')
  check(r.ledgerPostedNoRefundCount === 0, 'both-false: ledgerPostedNoRefundCount 0')
}

// 6. Mixed: 2×(T,T), 1×(T,F), 1×(F,T)
{
  const r = projectEcommerceCorrectionIntentLedgerPostedRefundStartedBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.ledgerPostedRefundStartedCount === 2, 'mixed: ledgerPostedRefundStartedCount 2')
  check(r.ledgerPostedNoRefundCount === 1, 'mixed: ledgerPostedNoRefundCount 1')
  check(r.noLedgerRefundStartedCount === 1, 'mixed: noLedgerRefundStartedCount 1')
}

// 7. Row totals
{
  const r = projectEcommerceCorrectionIntentLedgerPostedRefundStartedBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, false),
  ]))
  check(r.ledgerPostedCount === 2, 'row-totals: ledgerPostedCount 2')
  check(r.noLedgerCount === 1, 'row-totals: noLedgerCount 1')
}

console.log(`ecommerce-correction-intent-ledger-posted-refund-started-brief: ${checks} checks passed`)
