import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentTaxFiledProviderCalledBrief } from './ecommerce-correction-intent-tax-filed-provider-called-brief.ts'`,
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

const { projectEcommerceCorrectionIntentTaxFiledProviderCalledBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(taxFiled = false, providerCalled = false) {
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
    ledgerPosted: false,
    taxFiled,
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
  const r = projectEcommerceCorrectionIntentTaxFiledProviderCalledBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.taxFiledProviderCalledCount === 0, 'empty: taxFiledProviderCalledCount 0')
  check(r.noTaxFiledNoProviderCount === 0, 'empty: noTaxFiledNoProviderCount 0')
}

// 2. Both true
{
  const r = projectEcommerceCorrectionIntentTaxFiledProviderCalledBrief(state([
    correctionIntent(true, true),
  ]))
  check(r.totalIntents === 1, 'both-true: totalIntents 1')
  check(r.taxFiledProviderCalledCount === 1, 'both-true: taxFiledProviderCalledCount 1')
  check(r.taxFiledNoProviderCount === 0, 'both-true: taxFiledNoProviderCount 0')
  check(r.noTaxFiledProviderCalledCount === 0, 'both-true: noTaxFiledProviderCalledCount 0')
}

// 3. Tax filed, no provider call
{
  const r = projectEcommerceCorrectionIntentTaxFiledProviderCalledBrief(state([
    correctionIntent(true, false),
  ]))
  check(r.totalIntents === 1, 'tax-noprovider: totalIntents 1')
  check(r.taxFiledNoProviderCount === 1, 'tax-noprovider: taxFiledNoProviderCount 1')
  check(r.taxFiledProviderCalledCount === 0, 'tax-noprovider: taxFiledProviderCalledCount 0')
  check(r.noTaxFiledNoProviderCount === 0, 'tax-noprovider: noTaxFiledNoProviderCount 0')
}

// 4. No tax filed, provider called
{
  const r = projectEcommerceCorrectionIntentTaxFiledProviderCalledBrief(state([
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 1, 'notax-provider: totalIntents 1')
  check(r.noTaxFiledProviderCalledCount === 1, 'notax-provider: noTaxFiledProviderCalledCount 1')
  check(r.taxFiledProviderCalledCount === 0, 'notax-provider: taxFiledProviderCalledCount 0')
}

// 5. Both false
{
  const r = projectEcommerceCorrectionIntentTaxFiledProviderCalledBrief(state([
    correctionIntent(false, false),
  ]))
  check(r.totalIntents === 1, 'both-false: totalIntents 1')
  check(r.noTaxFiledNoProviderCount === 1, 'both-false: noTaxFiledNoProviderCount 1')
  check(r.taxFiledNoProviderCount === 0, 'both-false: taxFiledNoProviderCount 0')
}

// 6. Mixed: 2×(T,T), 1×(T,F), 1×(F,T)
{
  const r = projectEcommerceCorrectionIntentTaxFiledProviderCalledBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.taxFiledProviderCalledCount === 2, 'mixed: taxFiledProviderCalledCount 2')
  check(r.taxFiledNoProviderCount === 1, 'mixed: taxFiledNoProviderCount 1')
  check(r.noTaxFiledProviderCalledCount === 1, 'mixed: noTaxFiledProviderCalledCount 1')
}

// 7. Row totals
{
  const r = projectEcommerceCorrectionIntentTaxFiledProviderCalledBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, false),
  ]))
  check(r.taxFiledCount === 2, 'row-totals: taxFiledCount 2')
  check(r.noTaxFiledCount === 1, 'row-totals: noTaxFiledCount 1')
}

console.log(`ecommerce-correction-intent-tax-filed-provider-called-brief: ${checks} checks passed`)
