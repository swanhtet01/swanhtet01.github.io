import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentProviderCalledRefundStatusBrief } from './ecommerce-correction-intent-provider-called-refund-status-brief.ts'`,
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

const { projectEcommerceCorrectionIntentProviderCalledRefundStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(providerCalled = false, refundStatus = 'none') {
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
  const r = projectEcommerceCorrectionIntentProviderCalledRefundStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.providerCalledNoRefundCount === 0, 'empty: providerCalledNoRefundCount 0')
  check(r.noProviderNoRefundCount === 0, 'empty: noProviderNoRefundCount 0')
}

// 2. Provider called + none
{
  const r = projectEcommerceCorrectionIntentProviderCalledRefundStatusBrief(state([
    correctionIntent(true, 'none'),
  ]))
  check(r.totalIntents === 1, 'prov-none: totalIntents 1')
  check(r.providerCalledNoRefundCount === 1, 'prov-none: providerCalledNoRefundCount 1')
  check(r.providerCalledDueCount === 0, 'prov-none: providerCalledDueCount 0')
  check(r.noProviderNoRefundCount === 0, 'prov-none: noProviderNoRefundCount 0')
}

// 3. Provider called + due
{
  const r = projectEcommerceCorrectionIntentProviderCalledRefundStatusBrief(state([
    correctionIntent(true, 'due'),
  ]))
  check(r.totalIntents === 1, 'prov-due: totalIntents 1')
  check(r.providerCalledDueCount === 1, 'prov-due: providerCalledDueCount 1')
  check(r.providerCalledSettledCount === 0, 'prov-due: providerCalledSettledCount 0')
  check(r.providerCalledNoRefundCount === 0, 'prov-due: providerCalledNoRefundCount 0')
}

// 4. Provider called + settled
{
  const r = projectEcommerceCorrectionIntentProviderCalledRefundStatusBrief(state([
    correctionIntent(true, 'settled'),
  ]))
  check(r.totalIntents === 1, 'prov-settled: totalIntents 1')
  check(r.providerCalledSettledCount === 1, 'prov-settled: providerCalledSettledCount 1')
  check(r.noProviderSettledCount === 0, 'prov-settled: noProviderSettledCount 0')
}

// 5. No provider + due
{
  const r = projectEcommerceCorrectionIntentProviderCalledRefundStatusBrief(state([
    correctionIntent(false, 'due'),
  ]))
  check(r.totalIntents === 1, 'noprov-due: totalIntents 1')
  check(r.noProviderDueCount === 1, 'noprov-due: noProviderDueCount 1')
  check(r.providerCalledDueCount === 0, 'noprov-due: providerCalledDueCount 0')
}

// 6. Mixed: 2 prov+none, 1 prov+settled, 1 noProvider+due
{
  const r = projectEcommerceCorrectionIntentProviderCalledRefundStatusBrief(state([
    correctionIntent(true, 'none'),
    correctionIntent(true, 'none'),
    correctionIntent(true, 'settled'),
    correctionIntent(false, 'due'),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.providerCalledNoRefundCount === 2, 'mixed: providerCalledNoRefundCount 2')
  check(r.providerCalledSettledCount === 1, 'mixed: providerCalledSettledCount 1')
  check(r.noProviderDueCount === 1, 'mixed: noProviderDueCount 1')
}

// 7. Grand total
{
  const r = projectEcommerceCorrectionIntentProviderCalledRefundStatusBrief(state([
    correctionIntent(false, 'settled'),
    correctionIntent(false, 'settled'),
    correctionIntent(true, 'none'),
  ]))
  check(r.totalIntents === 3, 'grand-total: totalIntents 3')
  check(r.noProviderSettledCount === 2, 'grand-total: noProviderSettledCount 2')
}

console.log(`ecommerce-correction-intent-provider-called-refund-status-brief: ${checks} checks passed`)
