import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentLedgerPostedProviderCalledBrief } from './ecommerce-correction-intent-ledger-posted-provider-called-brief.ts'`,
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

const { projectEcommerceCorrectionIntentLedgerPostedProviderCalledBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(ledgerPosted = false, providerCalled = false) {
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
  const r = projectEcommerceCorrectionIntentLedgerPostedProviderCalledBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.ledgerPostedProviderCalledCount === 0, 'empty: ledgerPostedProviderCalledCount 0')
  check(r.noLedgerNoProviderCount === 0, 'empty: noLedgerNoProviderCount 0')
}

// 2. Both true
{
  const r = projectEcommerceCorrectionIntentLedgerPostedProviderCalledBrief(state([
    correctionIntent(true, true),
  ]))
  check(r.totalIntents === 1, 'both-true: totalIntents 1')
  check(r.ledgerPostedProviderCalledCount === 1, 'both-true: ledgerPostedProviderCalledCount 1')
  check(r.ledgerPostedNoProviderCount === 0, 'both-true: ledgerPostedNoProviderCount 0')
  check(r.noLedgerProviderCalledCount === 0, 'both-true: noLedgerProviderCalledCount 0')
}

// 3. Ledger posted, no provider call
{
  const r = projectEcommerceCorrectionIntentLedgerPostedProviderCalledBrief(state([
    correctionIntent(true, false),
  ]))
  check(r.totalIntents === 1, 'ledger-noprovider: totalIntents 1')
  check(r.ledgerPostedNoProviderCount === 1, 'ledger-noprovider: ledgerPostedNoProviderCount 1')
  check(r.ledgerPostedProviderCalledCount === 0, 'ledger-noprovider: ledgerPostedProviderCalledCount 0')
  check(r.noLedgerNoProviderCount === 0, 'ledger-noprovider: noLedgerNoProviderCount 0')
}

// 4. No ledger, provider called
{
  const r = projectEcommerceCorrectionIntentLedgerPostedProviderCalledBrief(state([
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 1, 'noledger-provider: totalIntents 1')
  check(r.noLedgerProviderCalledCount === 1, 'noledger-provider: noLedgerProviderCalledCount 1')
  check(r.ledgerPostedProviderCalledCount === 0, 'noledger-provider: ledgerPostedProviderCalledCount 0')
}

// 5. Both false
{
  const r = projectEcommerceCorrectionIntentLedgerPostedProviderCalledBrief(state([
    correctionIntent(false, false),
  ]))
  check(r.totalIntents === 1, 'both-false: totalIntents 1')
  check(r.noLedgerNoProviderCount === 1, 'both-false: noLedgerNoProviderCount 1')
  check(r.ledgerPostedNoProviderCount === 0, 'both-false: ledgerPostedNoProviderCount 0')
}

// 6. Mixed: 2×(T,T), 1×(T,F), 1×(F,T)
{
  const r = projectEcommerceCorrectionIntentLedgerPostedProviderCalledBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.ledgerPostedProviderCalledCount === 2, 'mixed: ledgerPostedProviderCalledCount 2')
  check(r.ledgerPostedNoProviderCount === 1, 'mixed: ledgerPostedNoProviderCount 1')
  check(r.noLedgerProviderCalledCount === 1, 'mixed: noLedgerProviderCalledCount 1')
}

// 7. Row totals
{
  const r = projectEcommerceCorrectionIntentLedgerPostedProviderCalledBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, false),
  ]))
  check(r.ledgerPostedCount === 2, 'row-totals: ledgerPostedCount 2')
  check(r.noLedgerCount === 1, 'row-totals: noLedgerCount 1')
}

console.log(`ecommerce-correction-intent-ledger-posted-provider-called-brief: ${checks} checks passed`)
