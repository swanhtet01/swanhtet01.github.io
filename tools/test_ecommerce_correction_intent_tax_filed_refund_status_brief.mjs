import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentTaxFiledRefundStatusBrief } from './ecommerce-correction-intent-tax-filed-refund-status-brief.ts'`,
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

const { projectEcommerceCorrectionIntentTaxFiledRefundStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(taxFiled = false, refundStatus = 'none') {
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
  const r = projectEcommerceCorrectionIntentTaxFiledRefundStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.taxFiledNoRefundCount === 0, 'empty: taxFiledNoRefundCount 0')
  check(r.noTaxFiledSettledCount === 0, 'empty: noTaxFiledSettledCount 0')
}

// 2. Tax filed + no refund
{
  const r = projectEcommerceCorrectionIntentTaxFiledRefundStatusBrief(state([
    correctionIntent(true, 'none'),
  ]))
  check(r.totalIntents === 1, 'tax-none: totalIntents 1')
  check(r.taxFiledNoRefundCount === 1, 'tax-none: taxFiledNoRefundCount 1')
  check(r.taxFiledDueCount === 0, 'tax-none: taxFiledDueCount 0')
  check(r.noTaxFiledNoRefundCount === 0, 'tax-none: noTaxFiledNoRefundCount 0')
}

// 3. Tax filed + due
{
  const r = projectEcommerceCorrectionIntentTaxFiledRefundStatusBrief(state([
    correctionIntent(true, 'due'),
  ]))
  check(r.totalIntents === 1, 'tax-due: totalIntents 1')
  check(r.taxFiledDueCount === 1, 'tax-due: taxFiledDueCount 1')
  check(r.taxFiledSettledCount === 0, 'tax-due: taxFiledSettledCount 0')
  check(r.noTaxFiledDueCount === 0, 'tax-due: noTaxFiledDueCount 0')
}

// 4. No tax + settled
{
  const r = projectEcommerceCorrectionIntentTaxFiledRefundStatusBrief(state([
    correctionIntent(false, 'settled'),
  ]))
  check(r.totalIntents === 1, 'notax-settled: totalIntents 1')
  check(r.noTaxFiledSettledCount === 1, 'notax-settled: noTaxFiledSettledCount 1')
  check(r.taxFiledSettledCount === 0, 'notax-settled: taxFiledSettledCount 0')
}

// 5. No tax + no refund
{
  const r = projectEcommerceCorrectionIntentTaxFiledRefundStatusBrief(state([
    correctionIntent(false, 'none'),
  ]))
  check(r.totalIntents === 1, 'notax-none: totalIntents 1')
  check(r.noTaxFiledNoRefundCount === 1, 'notax-none: noTaxFiledNoRefundCount 1')
  check(r.noTaxFiledDueCount === 0, 'notax-none: noTaxFiledDueCount 0')
}

// 6. Mixed: 2 tax+none, 1 tax+due, 1 noTax+settled
{
  const r = projectEcommerceCorrectionIntentTaxFiledRefundStatusBrief(state([
    correctionIntent(true, 'none'),
    correctionIntent(true, 'none'),
    correctionIntent(true, 'due'),
    correctionIntent(false, 'settled'),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.taxFiledNoRefundCount === 2, 'mixed: taxFiledNoRefundCount 2')
  check(r.taxFiledDueCount === 1, 'mixed: taxFiledDueCount 1')
  check(r.noTaxFiledSettledCount === 1, 'mixed: noTaxFiledSettledCount 1')
}

// 7. All 6 cells
{
  const r = projectEcommerceCorrectionIntentTaxFiledRefundStatusBrief(state([
    correctionIntent(true, 'none'),
    correctionIntent(true, 'due'),
    correctionIntent(true, 'settled'),
    correctionIntent(false, 'none'),
    correctionIntent(false, 'due'),
    correctionIntent(false, 'settled'),
  ]))
  check(r.totalIntents === 6, 'all-cells: totalIntents 6')
  check(r.taxFiledSettledCount === 1, 'all-cells: taxFiledSettledCount 1')
}

console.log(`ecommerce-correction-intent-tax-filed-refund-status-brief: ${checks} checks passed`)
