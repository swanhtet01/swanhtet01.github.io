import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentTaxFiledRequestedKindBrief } from './ecommerce-correction-intent-tax-filed-requested-kind-brief.ts'`,
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

const { projectEcommerceCorrectionIntentTaxFiledRequestedKindBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(taxFiled = false, requestedKind = 'credit') {
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
    ledgerPosted: false,
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
  const r = projectEcommerceCorrectionIntentTaxFiledRequestedKindBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.taxFiledCreditCount === 0, 'empty: taxFiledCreditCount 0')
  check(r.noTaxFiledDebitCount === 0, 'empty: noTaxFiledDebitCount 0')
}

// 2. Tax filed + credit
{
  const r = projectEcommerceCorrectionIntentTaxFiledRequestedKindBrief(state([
    correctionIntent(true, 'credit'),
  ]))
  check(r.totalIntents === 1, 'tax-credit: totalIntents 1')
  check(r.taxFiledCreditCount === 1, 'tax-credit: taxFiledCreditCount 1')
  check(r.taxFiledDebitCount === 0, 'tax-credit: taxFiledDebitCount 0')
  check(r.noTaxFiledCreditCount === 0, 'tax-credit: noTaxFiledCreditCount 0')
}

// 3. Tax filed + debit
{
  const r = projectEcommerceCorrectionIntentTaxFiledRequestedKindBrief(state([
    correctionIntent(true, 'debit'),
  ]))
  check(r.totalIntents === 1, 'tax-debit: totalIntents 1')
  check(r.taxFiledDebitCount === 1, 'tax-debit: taxFiledDebitCount 1')
  check(r.noTaxFiledDebitCount === 0, 'tax-debit: noTaxFiledDebitCount 0')
  check(r.taxFiledCreditCount === 0, 'tax-debit: taxFiledCreditCount 0')
}

// 4. No tax + credit
{
  const r = projectEcommerceCorrectionIntentTaxFiledRequestedKindBrief(state([
    correctionIntent(false, 'credit'),
  ]))
  check(r.totalIntents === 1, 'notax-credit: totalIntents 1')
  check(r.noTaxFiledCreditCount === 1, 'notax-credit: noTaxFiledCreditCount 1')
  check(r.taxFiledCreditCount === 0, 'notax-credit: taxFiledCreditCount 0')
}

// 5. No tax + debit
{
  const r = projectEcommerceCorrectionIntentTaxFiledRequestedKindBrief(state([
    correctionIntent(false, 'debit'),
  ]))
  check(r.totalIntents === 1, 'notax-debit: totalIntents 1')
  check(r.noTaxFiledDebitCount === 1, 'notax-debit: noTaxFiledDebitCount 1')
  check(r.noTaxFiledCreditCount === 0, 'notax-debit: noTaxFiledCreditCount 0')
}

// 6. Mixed: 2 tax+credit, 1 tax+debit, 1 noTax+credit
{
  const r = projectEcommerceCorrectionIntentTaxFiledRequestedKindBrief(state([
    correctionIntent(true, 'credit'),
    correctionIntent(true, 'credit'),
    correctionIntent(true, 'debit'),
    correctionIntent(false, 'credit'),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.taxFiledCreditCount === 2, 'mixed: taxFiledCreditCount 2')
  check(r.taxFiledDebitCount === 1, 'mixed: taxFiledDebitCount 1')
  check(r.noTaxFiledCreditCount === 1, 'mixed: noTaxFiledCreditCount 1')
}

// 7. Row totals
{
  const r = projectEcommerceCorrectionIntentTaxFiledRequestedKindBrief(state([
    correctionIntent(true, 'credit'),
    correctionIntent(true, 'debit'),
    correctionIntent(false, 'credit'),
  ]))
  check(r.taxFiledCount === 2, 'row-totals: taxFiledCount 2')
  check(r.noTaxFiledCount === 1, 'row-totals: noTaxFiledCount 1')
}

console.log(`ecommerce-correction-intent-tax-filed-requested-kind-brief: ${checks} checks passed`)
