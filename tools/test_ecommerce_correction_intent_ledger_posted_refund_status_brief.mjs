import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentLedgerPostedRefundStatusBrief } from './ecommerce-correction-intent-ledger-posted-refund-status-brief.ts'`,
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

const { projectEcommerceCorrectionIntentLedgerPostedRefundStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(ledgerPosted = false, refundStatus = 'none') {
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
    refundStatus,
    requestedKind: 'credit',
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
  const r = projectEcommerceCorrectionIntentLedgerPostedRefundStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.ledgerPostedNoRefundCount === 0, 'empty: ledgerPostedNoRefundCount 0')
  check(r.noLedgerSettledCount === 0, 'empty: noLedgerSettledCount 0')
}

// 2. Ledger posted + no refund
{
  const r = projectEcommerceCorrectionIntentLedgerPostedRefundStatusBrief(state([
    correctionIntent(true, 'none'),
  ]))
  check(r.totalIntents === 1, 'ledger-none: totalIntents 1')
  check(r.ledgerPostedNoRefundCount === 1, 'ledger-none: ledgerPostedNoRefundCount 1')
  check(r.ledgerPostedDueCount === 0, 'ledger-none: ledgerPostedDueCount 0')
  check(r.noLedgerNoRefundCount === 0, 'ledger-none: noLedgerNoRefundCount 0')
}

// 3. Ledger posted + due
{
  const r = projectEcommerceCorrectionIntentLedgerPostedRefundStatusBrief(state([
    correctionIntent(true, 'due'),
  ]))
  check(r.totalIntents === 1, 'ledger-due: totalIntents 1')
  check(r.ledgerPostedDueCount === 1, 'ledger-due: ledgerPostedDueCount 1')
  check(r.ledgerPostedSettledCount === 0, 'ledger-due: ledgerPostedSettledCount 0')
  check(r.noLedgerDueCount === 0, 'ledger-due: noLedgerDueCount 0')
}

// 4. No ledger + settled
{
  const r = projectEcommerceCorrectionIntentLedgerPostedRefundStatusBrief(state([
    correctionIntent(false, 'settled'),
  ]))
  check(r.totalIntents === 1, 'noledger-settled: totalIntents 1')
  check(r.noLedgerSettledCount === 1, 'noledger-settled: noLedgerSettledCount 1')
  check(r.ledgerPostedSettledCount === 0, 'noledger-settled: ledgerPostedSettledCount 0')
}

// 5. No ledger + no refund
{
  const r = projectEcommerceCorrectionIntentLedgerPostedRefundStatusBrief(state([
    correctionIntent(false, 'none'),
  ]))
  check(r.totalIntents === 1, 'noledger-none: totalIntents 1')
  check(r.noLedgerNoRefundCount === 1, 'noledger-none: noLedgerNoRefundCount 1')
  check(r.noLedgerDueCount === 0, 'noledger-none: noLedgerDueCount 0')
}

// 6. Mixed: 2 ledger+none, 1 ledger+due, 1 noLedger+settled
{
  const r = projectEcommerceCorrectionIntentLedgerPostedRefundStatusBrief(state([
    correctionIntent(true, 'none'),
    correctionIntent(true, 'none'),
    correctionIntent(true, 'due'),
    correctionIntent(false, 'settled'),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.ledgerPostedNoRefundCount === 2, 'mixed: ledgerPostedNoRefundCount 2')
  check(r.ledgerPostedDueCount === 1, 'mixed: ledgerPostedDueCount 1')
  check(r.noLedgerSettledCount === 1, 'mixed: noLedgerSettledCount 1')
}

// 7. All 6 cells
{
  const r = projectEcommerceCorrectionIntentLedgerPostedRefundStatusBrief(state([
    correctionIntent(true, 'none'),
    correctionIntent(true, 'due'),
    correctionIntent(true, 'settled'),
    correctionIntent(false, 'none'),
    correctionIntent(false, 'due'),
    correctionIntent(false, 'settled'),
  ]))
  check(r.totalIntents === 6, 'all-cells: totalIntents 6')
  check(r.ledgerPostedSettledCount === 1, 'all-cells: ledgerPostedSettledCount 1')
}

console.log(`ecommerce-correction-intent-ledger-posted-refund-status-brief: ${checks} checks passed`)
