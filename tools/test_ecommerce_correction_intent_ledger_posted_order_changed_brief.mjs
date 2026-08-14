import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentLedgerPostedOrderChangedBrief } from './ecommerce-correction-intent-ledger-posted-order-changed-brief.ts'`,
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

const { projectEcommerceCorrectionIntentLedgerPostedOrderChangedBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(ledgerPosted = false, orderChanged = false) {
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
    orderChanged,
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
  const r = projectEcommerceCorrectionIntentLedgerPostedOrderChangedBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.ledgerPostedOrderChangedCount === 0, 'empty: ledgerPostedOrderChangedCount 0')
  check(r.noLedgerNoOrderChangeCount === 0, 'empty: noLedgerNoOrderChangeCount 0')
}

// 2. Both true
{
  const r = projectEcommerceCorrectionIntentLedgerPostedOrderChangedBrief(state([
    correctionIntent(true, true),
  ]))
  check(r.totalIntents === 1, 'both-true: totalIntents 1')
  check(r.ledgerPostedOrderChangedCount === 1, 'both-true: ledgerPostedOrderChangedCount 1')
  check(r.ledgerPostedNoOrderChangeCount === 0, 'both-true: ledgerPostedNoOrderChangeCount 0')
  check(r.noLedgerOrderChangedCount === 0, 'both-true: noLedgerOrderChangedCount 0')
}

// 3. Ledger posted, no order change
{
  const r = projectEcommerceCorrectionIntentLedgerPostedOrderChangedBrief(state([
    correctionIntent(true, false),
  ]))
  check(r.totalIntents === 1, 'ledger-noorder: totalIntents 1')
  check(r.ledgerPostedNoOrderChangeCount === 1, 'ledger-noorder: ledgerPostedNoOrderChangeCount 1')
  check(r.ledgerPostedOrderChangedCount === 0, 'ledger-noorder: ledgerPostedOrderChangedCount 0')
  check(r.noLedgerNoOrderChangeCount === 0, 'ledger-noorder: noLedgerNoOrderChangeCount 0')
}

// 4. No ledger, order changed
{
  const r = projectEcommerceCorrectionIntentLedgerPostedOrderChangedBrief(state([
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 1, 'noledger-order: totalIntents 1')
  check(r.noLedgerOrderChangedCount === 1, 'noledger-order: noLedgerOrderChangedCount 1')
  check(r.ledgerPostedOrderChangedCount === 0, 'noledger-order: ledgerPostedOrderChangedCount 0')
}

// 5. Both false
{
  const r = projectEcommerceCorrectionIntentLedgerPostedOrderChangedBrief(state([
    correctionIntent(false, false),
  ]))
  check(r.totalIntents === 1, 'both-false: totalIntents 1')
  check(r.noLedgerNoOrderChangeCount === 1, 'both-false: noLedgerNoOrderChangeCount 1')
  check(r.ledgerPostedNoOrderChangeCount === 0, 'both-false: ledgerPostedNoOrderChangeCount 0')
}

// 6. Mixed: 2×(T,T), 1×(T,F), 1×(F,T)
{
  const r = projectEcommerceCorrectionIntentLedgerPostedOrderChangedBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.ledgerPostedOrderChangedCount === 2, 'mixed: ledgerPostedOrderChangedCount 2')
  check(r.ledgerPostedNoOrderChangeCount === 1, 'mixed: ledgerPostedNoOrderChangeCount 1')
  check(r.noLedgerOrderChangedCount === 1, 'mixed: noLedgerOrderChangedCount 1')
}

// 7. Row totals
{
  const r = projectEcommerceCorrectionIntentLedgerPostedOrderChangedBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, false),
  ]))
  check(r.ledgerPostedCount === 2, 'row-totals: ledgerPostedCount 2')
  check(r.noLedgerCount === 1, 'row-totals: noLedgerCount 1')
}

console.log(`ecommerce-correction-intent-ledger-posted-order-changed-brief: ${checks} checks passed`)
