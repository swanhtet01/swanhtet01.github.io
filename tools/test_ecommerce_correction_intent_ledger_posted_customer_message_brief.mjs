import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentLedgerPostedCustomerMessageBrief } from './ecommerce-correction-intent-ledger-posted-customer-message-brief.ts'`,
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

const { projectEcommerceCorrectionIntentLedgerPostedCustomerMessageBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(ledgerPosted = false, customerMessageSent = false) {
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
    taxFiled: false,
    customerMessageSent,
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
  const r = projectEcommerceCorrectionIntentLedgerPostedCustomerMessageBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.ledgerPostedMessageSentCount === 0, 'empty: ledgerPostedMessageSentCount 0')
  check(r.noLedgerNoMessageCount === 0, 'empty: noLedgerNoMessageCount 0')
}

// 2. Both true
{
  const r = projectEcommerceCorrectionIntentLedgerPostedCustomerMessageBrief(state([
    correctionIntent(true, true),
  ]))
  check(r.totalIntents === 1, 'both-true: totalIntents 1')
  check(r.ledgerPostedMessageSentCount === 1, 'both-true: ledgerPostedMessageSentCount 1')
  check(r.ledgerPostedNoMessageCount === 0, 'both-true: ledgerPostedNoMessageCount 0')
  check(r.noLedgerMessageSentCount === 0, 'both-true: noLedgerMessageSentCount 0')
}

// 3. Ledger posted, no message
{
  const r = projectEcommerceCorrectionIntentLedgerPostedCustomerMessageBrief(state([
    correctionIntent(true, false),
  ]))
  check(r.totalIntents === 1, 'ledger-nomessage: totalIntents 1')
  check(r.ledgerPostedNoMessageCount === 1, 'ledger-nomessage: ledgerPostedNoMessageCount 1')
  check(r.ledgerPostedMessageSentCount === 0, 'ledger-nomessage: ledgerPostedMessageSentCount 0')
  check(r.noLedgerNoMessageCount === 0, 'ledger-nomessage: noLedgerNoMessageCount 0')
}

// 4. No ledger, message sent
{
  const r = projectEcommerceCorrectionIntentLedgerPostedCustomerMessageBrief(state([
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 1, 'noledger-message: totalIntents 1')
  check(r.noLedgerMessageSentCount === 1, 'noledger-message: noLedgerMessageSentCount 1')
  check(r.ledgerPostedMessageSentCount === 0, 'noledger-message: ledgerPostedMessageSentCount 0')
}

// 5. Both false
{
  const r = projectEcommerceCorrectionIntentLedgerPostedCustomerMessageBrief(state([
    correctionIntent(false, false),
  ]))
  check(r.totalIntents === 1, 'both-false: totalIntents 1')
  check(r.noLedgerNoMessageCount === 1, 'both-false: noLedgerNoMessageCount 1')
  check(r.ledgerPostedNoMessageCount === 0, 'both-false: ledgerPostedNoMessageCount 0')
}

// 6. Mixed: 2×(T,T), 1×(T,F), 1×(F,T)
{
  const r = projectEcommerceCorrectionIntentLedgerPostedCustomerMessageBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.ledgerPostedMessageSentCount === 2, 'mixed: ledgerPostedMessageSentCount 2')
  check(r.ledgerPostedNoMessageCount === 1, 'mixed: ledgerPostedNoMessageCount 1')
  check(r.noLedgerMessageSentCount === 1, 'mixed: noLedgerMessageSentCount 1')
}

// 7. Row totals
{
  const r = projectEcommerceCorrectionIntentLedgerPostedCustomerMessageBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, false),
  ]))
  check(r.ledgerPostedCount === 2, 'row-totals: ledgerPostedCount 2')
  check(r.noLedgerCount === 1, 'row-totals: noLedgerCount 1')
}

console.log(`ecommerce-correction-intent-ledger-posted-customer-message-brief: ${checks} checks passed`)
