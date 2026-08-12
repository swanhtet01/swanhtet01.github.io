import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentTaxFiledOrderChangedBrief } from './ecommerce-correction-intent-tax-filed-order-changed-brief.ts'`,
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

const { projectEcommerceCorrectionIntentTaxFiledOrderChangedBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(taxFiled = false, orderChanged = false) {
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
  const r = projectEcommerceCorrectionIntentTaxFiledOrderChangedBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.taxFiledOrderChangedCount === 0, 'empty: taxFiledOrderChangedCount 0')
  check(r.noTaxFiledNoOrderChangeCount === 0, 'empty: noTaxFiledNoOrderChangeCount 0')
}

// 2. Both true
{
  const r = projectEcommerceCorrectionIntentTaxFiledOrderChangedBrief(state([
    correctionIntent(true, true),
  ]))
  check(r.totalIntents === 1, 'both-true: totalIntents 1')
  check(r.taxFiledOrderChangedCount === 1, 'both-true: taxFiledOrderChangedCount 1')
  check(r.taxFiledNoOrderChangeCount === 0, 'both-true: taxFiledNoOrderChangeCount 0')
  check(r.noTaxFiledOrderChangedCount === 0, 'both-true: noTaxFiledOrderChangedCount 0')
}

// 3. Tax filed, no order change
{
  const r = projectEcommerceCorrectionIntentTaxFiledOrderChangedBrief(state([
    correctionIntent(true, false),
  ]))
  check(r.totalIntents === 1, 'tax-noorder: totalIntents 1')
  check(r.taxFiledNoOrderChangeCount === 1, 'tax-noorder: taxFiledNoOrderChangeCount 1')
  check(r.taxFiledOrderChangedCount === 0, 'tax-noorder: taxFiledOrderChangedCount 0')
  check(r.noTaxFiledNoOrderChangeCount === 0, 'tax-noorder: noTaxFiledNoOrderChangeCount 0')
}

// 4. No tax filed, order changed
{
  const r = projectEcommerceCorrectionIntentTaxFiledOrderChangedBrief(state([
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 1, 'notax-order: totalIntents 1')
  check(r.noTaxFiledOrderChangedCount === 1, 'notax-order: noTaxFiledOrderChangedCount 1')
  check(r.taxFiledOrderChangedCount === 0, 'notax-order: taxFiledOrderChangedCount 0')
}

// 5. Both false
{
  const r = projectEcommerceCorrectionIntentTaxFiledOrderChangedBrief(state([
    correctionIntent(false, false),
  ]))
  check(r.totalIntents === 1, 'both-false: totalIntents 1')
  check(r.noTaxFiledNoOrderChangeCount === 1, 'both-false: noTaxFiledNoOrderChangeCount 1')
  check(r.taxFiledNoOrderChangeCount === 0, 'both-false: taxFiledNoOrderChangeCount 0')
}

// 6. Mixed: 2×(T,T), 1×(T,F), 1×(F,T)
{
  const r = projectEcommerceCorrectionIntentTaxFiledOrderChangedBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.taxFiledOrderChangedCount === 2, 'mixed: taxFiledOrderChangedCount 2')
  check(r.taxFiledNoOrderChangeCount === 1, 'mixed: taxFiledNoOrderChangeCount 1')
  check(r.noTaxFiledOrderChangedCount === 1, 'mixed: noTaxFiledOrderChangedCount 1')
}

// 7. Row totals
{
  const r = projectEcommerceCorrectionIntentTaxFiledOrderChangedBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, false),
  ]))
  check(r.taxFiledCount === 2, 'row-totals: taxFiledCount 2')
  check(r.noTaxFiledCount === 1, 'row-totals: noTaxFiledCount 1')
}

console.log(`ecommerce-correction-intent-tax-filed-order-changed-brief: ${checks} checks passed`)
