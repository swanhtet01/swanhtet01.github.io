import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentKindSourceCountBrief } from './ecommerce-correction-intent-kind-source-count-brief.ts'`,
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

const { projectEcommerceCorrectionIntentKindSourceCountBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(requestedKind = 'credit', sourceCorrectionCount = 0) {
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
    sourceCorrectionCount,
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
  const r = projectEcommerceCorrectionIntentKindSourceCountBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.creditFirstCount === 0, 'empty: creditFirstCount 0')
  check(r.debitRepeatCount === 0, 'empty: debitRepeatCount 0')
}

// 2. Credit + first (sourceCorrectionCount=0)
{
  const r = projectEcommerceCorrectionIntentKindSourceCountBrief(state([
    correctionIntent('credit', 0),
  ]))
  check(r.totalIntents === 1, 'credit-first: totalIntents 1')
  check(r.creditFirstCount === 1, 'credit-first: creditFirstCount 1')
  check(r.creditRepeatCount === 0, 'credit-first: creditRepeatCount 0')
  check(r.debitFirstCount === 0, 'credit-first: debitFirstCount 0')
}

// 3. Credit + repeat (sourceCorrectionCount=2)
{
  const r = projectEcommerceCorrectionIntentKindSourceCountBrief(state([
    correctionIntent('credit', 2),
  ]))
  check(r.creditRepeatCount === 1, 'credit-repeat: creditRepeatCount 1')
  check(r.creditFirstCount === 0, 'credit-repeat: creditFirstCount 0')
  check(r.totalIntents === 1, 'credit-repeat: totalIntents 1')
  check(r.debitRepeatCount === 0, 'credit-repeat: debitRepeatCount 0')
}

// 4. Debit + first
{
  const r = projectEcommerceCorrectionIntentKindSourceCountBrief(state([
    correctionIntent('debit', 0),
  ]))
  check(r.debitFirstCount === 1, 'debit-first: debitFirstCount 1')
  check(r.debitRepeatCount === 0, 'debit-first: debitRepeatCount 0')
  check(r.totalIntents === 1, 'debit-first: totalIntents 1')
}

// 5. Debit + repeat
{
  const r = projectEcommerceCorrectionIntentKindSourceCountBrief(state([
    correctionIntent('debit', 1),
  ]))
  check(r.debitRepeatCount === 1, 'debit-repeat: debitRepeatCount 1')
  check(r.debitFirstCount === 0, 'debit-repeat: debitFirstCount 0')
  check(r.totalIntents === 1, 'debit-repeat: totalIntents 1')
}

// 6. All 4 cells: credit×first, credit×repeat, debit×first, debit×repeat
{
  const r = projectEcommerceCorrectionIntentKindSourceCountBrief(state([
    correctionIntent('credit', 0),
    correctionIntent('credit', 1),
    correctionIntent('debit', 0),
    correctionIntent('debit', 3),
  ]))
  check(r.totalIntents === 4, 'all-cells: totalIntents 4')
  check(r.creditFirstCount === 1, 'all-cells: creditFirstCount 1')
  check(r.debitRepeatCount === 1, 'all-cells: debitRepeatCount 1')
  check(r.creditCount === 2, 'all-cells: creditCount 2')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceCorrectionIntentKindSourceCountBrief(state([
    correctionIntent('credit', 0),
    correctionIntent('credit', 1),
    correctionIntent('debit', 0),
    correctionIntent('debit', 3),
  ]))
  check(r.creditRepeatCount === 1, 'sub-buckets: creditRepeatCount 1')
  check(r.debitFirstCount === 1, 'sub-buckets: debitFirstCount 1')
}

console.log(`ecommerce-correction-intent-kind-source-count-brief: ${checks} checks passed`)
