import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentProviderCalledOrderChangedBrief } from './ecommerce-correction-intent-provider-called-order-changed-brief.ts'`,
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

const { projectEcommerceCorrectionIntentProviderCalledOrderChangedBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(providerCalled = false, orderChanged = false) {
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
  const r = projectEcommerceCorrectionIntentProviderCalledOrderChangedBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.providerCalledOrderChangedCount === 0, 'empty: providerCalledOrderChangedCount 0')
  check(r.noProviderNoOrderChangeCount === 0, 'empty: noProviderNoOrderChangeCount 0')
}

// 2. Provider called + order changed
{
  const r = projectEcommerceCorrectionIntentProviderCalledOrderChangedBrief(state([
    correctionIntent(true, true),
  ]))
  check(r.totalIntents === 1, 'prov-ord: totalIntents 1')
  check(r.providerCalledOrderChangedCount === 1, 'prov-ord: providerCalledOrderChangedCount 1')
  check(r.providerCalledNoOrderChangeCount === 0, 'prov-ord: providerCalledNoOrderChangeCount 0')
  check(r.noProviderOrderChangedCount === 0, 'prov-ord: noProviderOrderChangedCount 0')
}

// 3. Provider called + no order change
{
  const r = projectEcommerceCorrectionIntentProviderCalledOrderChangedBrief(state([
    correctionIntent(true, false),
  ]))
  check(r.totalIntents === 1, 'prov-noor: totalIntents 1')
  check(r.providerCalledNoOrderChangeCount === 1, 'prov-noor: providerCalledNoOrderChangeCount 1')
  check(r.noProviderNoOrderChangeCount === 0, 'prov-noor: noProviderNoOrderChangeCount 0')
  check(r.providerCalledOrderChangedCount === 0, 'prov-noor: providerCalledOrderChangedCount 0')
}

// 4. No provider + order changed
{
  const r = projectEcommerceCorrectionIntentProviderCalledOrderChangedBrief(state([
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 1, 'noprov-ord: totalIntents 1')
  check(r.noProviderOrderChangedCount === 1, 'noprov-ord: noProviderOrderChangedCount 1')
  check(r.providerCalledOrderChangedCount === 0, 'noprov-ord: providerCalledOrderChangedCount 0')
}

// 5. No provider + no order change
{
  const r = projectEcommerceCorrectionIntentProviderCalledOrderChangedBrief(state([
    correctionIntent(false, false),
  ]))
  check(r.totalIntents === 1, 'noprov-noor: totalIntents 1')
  check(r.noProviderNoOrderChangeCount === 1, 'noprov-noor: noProviderNoOrderChangeCount 1')
  check(r.noProviderOrderChangedCount === 0, 'noprov-noor: noProviderOrderChangedCount 0')
}

// 6. Mixed: 2 prov+orderChanged, 1 prov+noChange, 1 noProv+orderChanged
{
  const r = projectEcommerceCorrectionIntentProviderCalledOrderChangedBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.providerCalledOrderChangedCount === 2, 'mixed: providerCalledOrderChangedCount 2')
  check(r.providerCalledNoOrderChangeCount === 1, 'mixed: providerCalledNoOrderChangeCount 1')
  check(r.noProviderOrderChangedCount === 1, 'mixed: noProviderOrderChangedCount 1')
}

// 7. Row totals
{
  const r = projectEcommerceCorrectionIntentProviderCalledOrderChangedBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, false),
  ]))
  check(r.providerCalledCount === 2, 'row-totals: providerCalledCount 2')
  check(r.noProviderCount === 1, 'row-totals: noProviderCount 1')
}

console.log(`ecommerce-correction-intent-provider-called-order-changed-brief: ${checks} checks passed`)
