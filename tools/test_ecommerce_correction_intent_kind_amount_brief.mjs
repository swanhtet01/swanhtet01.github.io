import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentKindAmountBrief } from './ecommerce-correction-intent-kind-amount-brief.ts'`,
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

const { projectEcommerceCorrectionIntentKindAmountBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(requestedKind = 'credit', listedAmountMmk = 5000) {
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
    listedAmountMmk,
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
  const r = projectEcommerceCorrectionIntentKindAmountBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.creditCount === 0, 'empty: creditCount 0')
  check(r.debitCount === 0, 'empty: debitCount 0')
}

// 2. Single credit 5000 MMK
{
  const r = projectEcommerceCorrectionIntentKindAmountBrief(state([correctionIntent('credit', 5000)]))
  check(r.totalIntents === 1, 'credit-5k: totalIntents 1')
  check(r.creditCount === 1, 'credit-5k: creditCount 1')
  check(r.creditTotalMmk === 5000, 'credit-5k: creditTotalMmk 5000')
  check(r.creditAverageMmk === 5000, 'credit-5k: creditAverageMmk 5000')
}

// 3. Single debit 3000 MMK
{
  const r = projectEcommerceCorrectionIntentKindAmountBrief(state([correctionIntent('debit', 3000)]))
  check(r.totalIntents === 1, 'debit-3k: totalIntents 1')
  check(r.debitCount === 1, 'debit-3k: debitCount 1')
  check(r.debitTotalMmk === 3000, 'debit-3k: debitTotalMmk 3000')
  check(r.debitAverageMmk === 3000, 'debit-3k: debitAverageMmk 3000')
}

// 4. Two credits with different amounts (4000 + 6000)
{
  const r = projectEcommerceCorrectionIntentKindAmountBrief(state([
    correctionIntent('credit', 4000),
    correctionIntent('credit', 6000),
  ]))
  check(r.creditCount === 2, 'two-credit: creditCount 2')
  check(r.creditTotalMmk === 10000, 'two-credit: creditTotalMmk 10000')
  check(r.creditAverageMmk === 5000, 'two-credit: creditAverageMmk 5000')
  check(r.debitCount === 0, 'two-credit: debitCount 0')
}

// 5. Two debits (2000 + 8000)
{
  const r = projectEcommerceCorrectionIntentKindAmountBrief(state([
    correctionIntent('debit', 2000),
    correctionIntent('debit', 8000),
  ]))
  check(r.debitCount === 2, 'two-debit: debitCount 2')
  check(r.debitTotalMmk === 10000, 'two-debit: debitTotalMmk 10000')
  check(r.debitAverageMmk === 5000, 'two-debit: debitAverageMmk 5000')
  check(r.creditCount === 0, 'two-debit: creditCount 0')
}

// 6. Mixed: 1 credit (9000) + 1 debit (3000)
{
  const r = projectEcommerceCorrectionIntentKindAmountBrief(state([
    correctionIntent('credit', 9000),
    correctionIntent('debit', 3000),
  ]))
  check(r.totalIntents === 2, 'mixed: totalIntents 2')
  check(r.creditCount === 1, 'mixed: creditCount 1')
  check(r.debitCount === 1, 'mixed: debitCount 1')
  check(r.creditTotalMmk === 9000, 'mixed: creditTotalMmk 9000')
}

console.log(`ecommerce-correction-intent-kind-amount-brief: ${checks} checks passed`)
