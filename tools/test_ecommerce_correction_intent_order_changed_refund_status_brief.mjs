import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentOrderChangedRefundStatusBrief } from './ecommerce-correction-intent-order-changed-refund-status-brief.ts'`,
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

const { projectEcommerceCorrectionIntentOrderChangedRefundStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(orderChanged = false, refundStatus = 'none') {
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
  const r = projectEcommerceCorrectionIntentOrderChangedRefundStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.orderChangedNoRefundCount === 0, 'empty: orderChangedNoRefundCount 0')
  check(r.noOrderChangeNoRefundCount === 0, 'empty: noOrderChangeNoRefundCount 0')
}

// 2. Order changed + none
{
  const r = projectEcommerceCorrectionIntentOrderChangedRefundStatusBrief(state([
    correctionIntent(true, 'none'),
  ]))
  check(r.totalIntents === 1, 'ord-none: totalIntents 1')
  check(r.orderChangedNoRefundCount === 1, 'ord-none: orderChangedNoRefundCount 1')
  check(r.orderChangedDueCount === 0, 'ord-none: orderChangedDueCount 0')
  check(r.noOrderChangeNoRefundCount === 0, 'ord-none: noOrderChangeNoRefundCount 0')
}

// 3. Order changed + due
{
  const r = projectEcommerceCorrectionIntentOrderChangedRefundStatusBrief(state([
    correctionIntent(true, 'due'),
  ]))
  check(r.totalIntents === 1, 'ord-due: totalIntents 1')
  check(r.orderChangedDueCount === 1, 'ord-due: orderChangedDueCount 1')
  check(r.orderChangedSettledCount === 0, 'ord-due: orderChangedSettledCount 0')
  check(r.orderChangedNoRefundCount === 0, 'ord-due: orderChangedNoRefundCount 0')
}

// 4. Order changed + settled
{
  const r = projectEcommerceCorrectionIntentOrderChangedRefundStatusBrief(state([
    correctionIntent(true, 'settled'),
  ]))
  check(r.totalIntents === 1, 'ord-settled: totalIntents 1')
  check(r.orderChangedSettledCount === 1, 'ord-settled: orderChangedSettledCount 1')
  check(r.noOrderChangeSettledCount === 0, 'ord-settled: noOrderChangeSettledCount 0')
}

// 5. No order change + due
{
  const r = projectEcommerceCorrectionIntentOrderChangedRefundStatusBrief(state([
    correctionIntent(false, 'due'),
  ]))
  check(r.totalIntents === 1, 'noord-due: totalIntents 1')
  check(r.noOrderChangeDueCount === 1, 'noord-due: noOrderChangeDueCount 1')
  check(r.orderChangedDueCount === 0, 'noord-due: orderChangedDueCount 0')
}

// 6. Mixed: 2 ord+none, 1 ord+settled, 1 noOrd+due
{
  const r = projectEcommerceCorrectionIntentOrderChangedRefundStatusBrief(state([
    correctionIntent(true, 'none'),
    correctionIntent(true, 'none'),
    correctionIntent(true, 'settled'),
    correctionIntent(false, 'due'),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.orderChangedNoRefundCount === 2, 'mixed: orderChangedNoRefundCount 2')
  check(r.orderChangedSettledCount === 1, 'mixed: orderChangedSettledCount 1')
  check(r.noOrderChangeDueCount === 1, 'mixed: noOrderChangeDueCount 1')
}

// 7. Grand total
{
  const r = projectEcommerceCorrectionIntentOrderChangedRefundStatusBrief(state([
    correctionIntent(false, 'settled'),
    correctionIntent(false, 'settled'),
    correctionIntent(true, 'none'),
  ]))
  check(r.totalIntents === 3, 'grand-total: totalIntents 3')
  check(r.noOrderChangeSettledCount === 2, 'grand-total: noOrderChangeSettledCount 2')
}

console.log(`ecommerce-correction-intent-order-changed-refund-status-brief: ${checks} checks passed`)
