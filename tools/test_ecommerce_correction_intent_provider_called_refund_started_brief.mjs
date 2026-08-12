import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentProviderCalledRefundStartedBrief } from './ecommerce-correction-intent-provider-called-refund-started-brief.ts'`,
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

const { projectEcommerceCorrectionIntentProviderCalledRefundStartedBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(providerCalled = false, refundStarted = false) {
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
  const r = projectEcommerceCorrectionIntentProviderCalledRefundStartedBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.providerCalledRefundStartedCount === 0, 'empty: providerCalledRefundStartedCount 0')
  check(r.noProviderNoRefundCount === 0, 'empty: noProviderNoRefundCount 0')
}

// 2. Provider called + refund started
{
  const r = projectEcommerceCorrectionIntentProviderCalledRefundStartedBrief(state([
    correctionIntent(true, true),
  ]))
  check(r.totalIntents === 1, 'prov-ref: totalIntents 1')
  check(r.providerCalledRefundStartedCount === 1, 'prov-ref: providerCalledRefundStartedCount 1')
  check(r.providerCalledNoRefundCount === 0, 'prov-ref: providerCalledNoRefundCount 0')
  check(r.noProviderRefundStartedCount === 0, 'prov-ref: noProviderRefundStartedCount 0')
}

// 3. Provider called + no refund
{
  const r = projectEcommerceCorrectionIntentProviderCalledRefundStartedBrief(state([
    correctionIntent(true, false),
  ]))
  check(r.totalIntents === 1, 'prov-noref: totalIntents 1')
  check(r.providerCalledNoRefundCount === 1, 'prov-noref: providerCalledNoRefundCount 1')
  check(r.noProviderNoRefundCount === 0, 'prov-noref: noProviderNoRefundCount 0')
  check(r.providerCalledRefundStartedCount === 0, 'prov-noref: providerCalledRefundStartedCount 0')
}

// 4. No provider + refund started
{
  const r = projectEcommerceCorrectionIntentProviderCalledRefundStartedBrief(state([
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 1, 'noprov-ref: totalIntents 1')
  check(r.noProviderRefundStartedCount === 1, 'noprov-ref: noProviderRefundStartedCount 1')
  check(r.providerCalledRefundStartedCount === 0, 'noprov-ref: providerCalledRefundStartedCount 0')
}

// 5. No provider + no refund
{
  const r = projectEcommerceCorrectionIntentProviderCalledRefundStartedBrief(state([
    correctionIntent(false, false),
  ]))
  check(r.totalIntents === 1, 'noprov-noref: totalIntents 1')
  check(r.noProviderNoRefundCount === 1, 'noprov-noref: noProviderNoRefundCount 1')
  check(r.noProviderRefundStartedCount === 0, 'noprov-noref: noProviderRefundStartedCount 0')
}

// 6. Mixed: 2 prov+ref, 1 prov+noRef, 1 noProv+ref
{
  const r = projectEcommerceCorrectionIntentProviderCalledRefundStartedBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.providerCalledRefundStartedCount === 2, 'mixed: providerCalledRefundStartedCount 2')
  check(r.providerCalledNoRefundCount === 1, 'mixed: providerCalledNoRefundCount 1')
  check(r.noProviderRefundStartedCount === 1, 'mixed: noProviderRefundStartedCount 1')
}

// 7. Row totals
{
  const r = projectEcommerceCorrectionIntentProviderCalledRefundStartedBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, false),
  ]))
  check(r.providerCalledCount === 2, 'row-totals: providerCalledCount 2')
  check(r.noProviderCount === 1, 'row-totals: noProviderCount 1')
}

console.log(`ecommerce-correction-intent-provider-called-refund-started-brief: ${checks} checks passed`)
