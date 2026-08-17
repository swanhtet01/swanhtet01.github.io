import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentRequestedKindOrderChangedBrief } from './ecommerce-correction-intent-requested-kind-order-changed-brief.ts'`,
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

const { projectEcommerceCorrectionIntentRequestedKindOrderChangedBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(requestedKind = 'credit', orderChanged = false) {
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
    orderChanged,
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
  const r = projectEcommerceCorrectionIntentRequestedKindOrderChangedBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.creditOrderChangedCount === 0, 'empty: creditOrderChangedCount 0')
  check(r.debitNoOrderChangeCount === 0, 'empty: debitNoOrderChangeCount 0')
}

// 2. Credit + order changed
{
  const r = projectEcommerceCorrectionIntentRequestedKindOrderChangedBrief(state([
    correctionIntent('credit', true),
  ]))
  check(r.totalIntents === 1, 'cred-ord: totalIntents 1')
  check(r.creditOrderChangedCount === 1, 'cred-ord: creditOrderChangedCount 1')
  check(r.creditNoOrderChangeCount === 0, 'cred-ord: creditNoOrderChangeCount 0')
  check(r.debitOrderChangedCount === 0, 'cred-ord: debitOrderChangedCount 0')
}

// 3. Credit + no order change
{
  const r = projectEcommerceCorrectionIntentRequestedKindOrderChangedBrief(state([
    correctionIntent('credit', false),
  ]))
  check(r.totalIntents === 1, 'cred-noor: totalIntents 1')
  check(r.creditNoOrderChangeCount === 1, 'cred-noor: creditNoOrderChangeCount 1')
  check(r.debitNoOrderChangeCount === 0, 'cred-noor: debitNoOrderChangeCount 0')
  check(r.creditOrderChangedCount === 0, 'cred-noor: creditOrderChangedCount 0')
}

// 4. Debit + order changed
{
  const r = projectEcommerceCorrectionIntentRequestedKindOrderChangedBrief(state([
    correctionIntent('debit', true),
  ]))
  check(r.totalIntents === 1, 'deb-ord: totalIntents 1')
  check(r.debitOrderChangedCount === 1, 'deb-ord: debitOrderChangedCount 1')
  check(r.creditOrderChangedCount === 0, 'deb-ord: creditOrderChangedCount 0')
}

// 5. Debit + no order change
{
  const r = projectEcommerceCorrectionIntentRequestedKindOrderChangedBrief(state([
    correctionIntent('debit', false),
  ]))
  check(r.totalIntents === 1, 'deb-noor: totalIntents 1')
  check(r.debitNoOrderChangeCount === 1, 'deb-noor: debitNoOrderChangeCount 1')
  check(r.debitOrderChangedCount === 0, 'deb-noor: debitOrderChangedCount 0')
}

// 6. Mixed: 2 credit+orderChanged, 1 credit+noChange, 1 debit+orderChanged
{
  const r = projectEcommerceCorrectionIntentRequestedKindOrderChangedBrief(state([
    correctionIntent('credit', true),
    correctionIntent('credit', true),
    correctionIntent('credit', false),
    correctionIntent('debit', true),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.creditOrderChangedCount === 2, 'mixed: creditOrderChangedCount 2')
  check(r.creditNoOrderChangeCount === 1, 'mixed: creditNoOrderChangeCount 1')
  check(r.debitOrderChangedCount === 1, 'mixed: debitOrderChangedCount 1')
}

// 7. Kind totals
{
  const r = projectEcommerceCorrectionIntentRequestedKindOrderChangedBrief(state([
    correctionIntent('credit', true),
    correctionIntent('credit', false),
    correctionIntent('debit', false),
  ]))
  check(r.creditCount === 2, 'kind-totals: creditCount 2')
  check(r.debitCount === 1, 'kind-totals: debitCount 1')
}

console.log(`ecommerce-correction-intent-requested-kind-order-changed-brief: ${checks} checks passed`)
