import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentSourceCountKindBrief } from './ecommerce-correction-intent-source-count-kind-brief.ts'`,
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

const { projectEcommerceCorrectionIntentSourceCountKindBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(sourceCorrectionCount = 0, requestedKind = 'credit') {
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
  const r = projectEcommerceCorrectionIntentSourceCountKindBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.firstCorrectionCount === 0, 'empty: firstCorrectionCount 0')
  check(r.repeatCorrectionCount === 0, 'empty: repeatCorrectionCount 0')
}

// 2. Single first credit (sourceCorrectionCount=0)
{
  const r = projectEcommerceCorrectionIntentSourceCountKindBrief(state([
    correctionIntent(0, 'credit'),
  ]))
  check(r.totalIntents === 1, 'first-credit: totalIntents 1')
  check(r.firstCorrectionCount === 1, 'first-credit: firstCorrectionCount 1')
  check(r.firstCreditCount === 1, 'first-credit: firstCreditCount 1')
  check(r.repeatCreditCount === 0, 'first-credit: repeatCreditCount 0')
}

// 3. Single repeat debit (sourceCorrectionCount=2)
{
  const r = projectEcommerceCorrectionIntentSourceCountKindBrief(state([
    correctionIntent(2, 'debit'),
  ]))
  check(r.repeatCorrectionCount === 1, 'repeat-debit: repeatCorrectionCount 1')
  check(r.repeatDebitCount === 1, 'repeat-debit: repeatDebitCount 1')
  check(r.firstDebitCount === 0, 'repeat-debit: firstDebitCount 0')
  check(r.firstCorrectionCount === 0, 'repeat-debit: firstCorrectionCount 0')
}

// 4. Two first: credit + debit
{
  const r = projectEcommerceCorrectionIntentSourceCountKindBrief(state([
    correctionIntent(0, 'credit'),
    correctionIntent(0, 'debit'),
  ]))
  check(r.firstCorrectionCount === 2, 'two-first: firstCorrectionCount 2')
  check(r.firstCreditCount === 1, 'two-first: firstCreditCount 1')
  check(r.firstDebitCount === 1, 'two-first: firstDebitCount 1')
}

// 5. Two repeat, both credit
{
  const r = projectEcommerceCorrectionIntentSourceCountKindBrief(state([
    correctionIntent(1, 'credit'),
    correctionIntent(3, 'credit'),
  ]))
  check(r.repeatCorrectionCount === 2, 'two-repeat-credit: repeatCorrectionCount 2')
  check(r.repeatCreditCount === 2, 'two-repeat-credit: repeatCreditCount 2')
  check(r.repeatDebitCount === 0, 'two-repeat-credit: repeatDebitCount 0')
}

// 6. All 4 cells: first-credit, first-debit, repeat-credit, repeat-debit
{
  const r = projectEcommerceCorrectionIntentSourceCountKindBrief(state([
    correctionIntent(0, 'credit'),
    correctionIntent(0, 'debit'),
    correctionIntent(1, 'credit'),
    correctionIntent(1, 'debit'),
  ]))
  check(r.totalIntents === 4, 'all-cells: totalIntents 4')
  check(r.firstCorrectionCount === 2, 'all-cells: firstCorrectionCount 2')
  check(r.repeatCorrectionCount === 2, 'all-cells: repeatCorrectionCount 2')
  check(r.firstCreditCount === 1, 'all-cells: firstCreditCount 1')
}

// 7. Additional invariant checks for case 6
{
  const r = projectEcommerceCorrectionIntentSourceCountKindBrief(state([
    correctionIntent(0, 'credit'),
    correctionIntent(0, 'debit'),
    correctionIntent(1, 'credit'),
    correctionIntent(1, 'debit'),
  ]))
  check(r.firstDebitCount === 1, 'invariant: firstDebitCount 1')
  check(r.repeatCreditCount === 1, 'invariant: repeatCreditCount 1')
}

console.log(`ecommerce-correction-intent-source-count-kind-brief: ${checks} checks passed`)
