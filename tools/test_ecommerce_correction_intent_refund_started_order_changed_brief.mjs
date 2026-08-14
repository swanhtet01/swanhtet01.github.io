import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentRefundStartedOrderChangedBrief } from './ecommerce-correction-intent-refund-started-order-changed-brief.ts'`,
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

const { projectEcommerceCorrectionIntentRefundStartedOrderChangedBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(refundStarted = false, orderChanged = false) {
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
    refundStarted,
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
  const r = projectEcommerceCorrectionIntentRefundStartedOrderChangedBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.refundStartedOrderChangedCount === 0, 'empty: refundStartedOrderChangedCount 0')
  check(r.noRefundStartedNoOrderChangeCount === 0, 'empty: noRefundStartedNoOrderChangeCount 0')
}

// 2. Refund started + order changed
{
  const r = projectEcommerceCorrectionIntentRefundStartedOrderChangedBrief(state([
    correctionIntent(true, true),
  ]))
  check(r.totalIntents === 1, 'ref-ord: totalIntents 1')
  check(r.refundStartedOrderChangedCount === 1, 'ref-ord: refundStartedOrderChangedCount 1')
  check(r.refundStartedNoOrderChangeCount === 0, 'ref-ord: refundStartedNoOrderChangeCount 0')
  check(r.noRefundStartedOrderChangedCount === 0, 'ref-ord: noRefundStartedOrderChangedCount 0')
}

// 3. Refund started + no order change
{
  const r = projectEcommerceCorrectionIntentRefundStartedOrderChangedBrief(state([
    correctionIntent(true, false),
  ]))
  check(r.totalIntents === 1, 'ref-noor: totalIntents 1')
  check(r.refundStartedNoOrderChangeCount === 1, 'ref-noor: refundStartedNoOrderChangeCount 1')
  check(r.noRefundStartedNoOrderChangeCount === 0, 'ref-noor: noRefundStartedNoOrderChangeCount 0')
  check(r.refundStartedOrderChangedCount === 0, 'ref-noor: refundStartedOrderChangedCount 0')
}

// 4. No refund + order changed
{
  const r = projectEcommerceCorrectionIntentRefundStartedOrderChangedBrief(state([
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 1, 'noref-ord: totalIntents 1')
  check(r.noRefundStartedOrderChangedCount === 1, 'noref-ord: noRefundStartedOrderChangedCount 1')
  check(r.refundStartedOrderChangedCount === 0, 'noref-ord: refundStartedOrderChangedCount 0')
}

// 5. No refund + no order change
{
  const r = projectEcommerceCorrectionIntentRefundStartedOrderChangedBrief(state([
    correctionIntent(false, false),
  ]))
  check(r.totalIntents === 1, 'noref-noor: totalIntents 1')
  check(r.noRefundStartedNoOrderChangeCount === 1, 'noref-noor: noRefundStartedNoOrderChangeCount 1')
  check(r.noRefundStartedOrderChangedCount === 0, 'noref-noor: noRefundStartedOrderChangedCount 0')
}

// 6. Mixed: 2 ref+orderChanged, 1 ref+noChange, 1 noRef+orderChanged
{
  const r = projectEcommerceCorrectionIntentRefundStartedOrderChangedBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.refundStartedOrderChangedCount === 2, 'mixed: refundStartedOrderChangedCount 2')
  check(r.refundStartedNoOrderChangeCount === 1, 'mixed: refundStartedNoOrderChangeCount 1')
  check(r.noRefundStartedOrderChangedCount === 1, 'mixed: noRefundStartedOrderChangedCount 1')
}

// 7. Row totals
{
  const r = projectEcommerceCorrectionIntentRefundStartedOrderChangedBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, false),
  ]))
  check(r.refundStartedCount === 2, 'row-totals: refundStartedCount 2')
  check(r.noRefundStartedCount === 1, 'row-totals: noRefundStartedCount 1')
}

console.log(`ecommerce-correction-intent-refund-started-order-changed-brief: ${checks} checks passed`)
