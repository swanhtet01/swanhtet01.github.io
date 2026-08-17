import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentTaxFiledRefundStartedBrief } from './ecommerce-correction-intent-tax-filed-refund-started-brief.ts'`,
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

const { projectEcommerceCorrectionIntentTaxFiledRefundStartedBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(taxFiled = false, refundStarted = false) {
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
  const r = projectEcommerceCorrectionIntentTaxFiledRefundStartedBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.taxFiledRefundStartedCount === 0, 'empty: taxFiledRefundStartedCount 0')
  check(r.noTaxFiledNoRefundCount === 0, 'empty: noTaxFiledNoRefundCount 0')
}

// 2. Both true
{
  const r = projectEcommerceCorrectionIntentTaxFiledRefundStartedBrief(state([
    correctionIntent(true, true),
  ]))
  check(r.totalIntents === 1, 'both-true: totalIntents 1')
  check(r.taxFiledRefundStartedCount === 1, 'both-true: taxFiledRefundStartedCount 1')
  check(r.taxFiledNoRefundCount === 0, 'both-true: taxFiledNoRefundCount 0')
  check(r.noTaxFiledRefundStartedCount === 0, 'both-true: noTaxFiledRefundStartedCount 0')
}

// 3. Tax filed, no refund
{
  const r = projectEcommerceCorrectionIntentTaxFiledRefundStartedBrief(state([
    correctionIntent(true, false),
  ]))
  check(r.totalIntents === 1, 'tax-norefund: totalIntents 1')
  check(r.taxFiledNoRefundCount === 1, 'tax-norefund: taxFiledNoRefundCount 1')
  check(r.taxFiledRefundStartedCount === 0, 'tax-norefund: taxFiledRefundStartedCount 0')
  check(r.noTaxFiledNoRefundCount === 0, 'tax-norefund: noTaxFiledNoRefundCount 0')
}

// 4. No tax filed, refund started
{
  const r = projectEcommerceCorrectionIntentTaxFiledRefundStartedBrief(state([
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 1, 'notax-refund: totalIntents 1')
  check(r.noTaxFiledRefundStartedCount === 1, 'notax-refund: noTaxFiledRefundStartedCount 1')
  check(r.taxFiledRefundStartedCount === 0, 'notax-refund: taxFiledRefundStartedCount 0')
}

// 5. Both false
{
  const r = projectEcommerceCorrectionIntentTaxFiledRefundStartedBrief(state([
    correctionIntent(false, false),
  ]))
  check(r.totalIntents === 1, 'both-false: totalIntents 1')
  check(r.noTaxFiledNoRefundCount === 1, 'both-false: noTaxFiledNoRefundCount 1')
  check(r.taxFiledNoRefundCount === 0, 'both-false: taxFiledNoRefundCount 0')
}

// 6. Mixed: 2×(T,T), 1×(T,F), 1×(F,T)
{
  const r = projectEcommerceCorrectionIntentTaxFiledRefundStartedBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.taxFiledRefundStartedCount === 2, 'mixed: taxFiledRefundStartedCount 2')
  check(r.taxFiledNoRefundCount === 1, 'mixed: taxFiledNoRefundCount 1')
  check(r.noTaxFiledRefundStartedCount === 1, 'mixed: noTaxFiledRefundStartedCount 1')
}

// 7. Row totals
{
  const r = projectEcommerceCorrectionIntentTaxFiledRefundStartedBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, false),
  ]))
  check(r.taxFiledCount === 2, 'row-totals: taxFiledCount 2')
  check(r.noTaxFiledCount === 1, 'row-totals: noTaxFiledCount 1')
}

console.log(`ecommerce-correction-intent-tax-filed-refund-started-brief: ${checks} checks passed`)
