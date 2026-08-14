import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentCustomerMessageOrderChangedBrief } from './ecommerce-correction-intent-customer-message-order-changed-brief.ts'`,
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

const { projectEcommerceCorrectionIntentCustomerMessageOrderChangedBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(customerMessageSent = false, orderChanged = false) {
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
    customerMessageSent,
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
  const r = projectEcommerceCorrectionIntentCustomerMessageOrderChangedBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.messageSentOrderChangedCount === 0, 'empty: messageSentOrderChangedCount 0')
  check(r.noMessageNoOrderChangeCount === 0, 'empty: noMessageNoOrderChangeCount 0')
}

// 2. Message sent + order changed
{
  const r = projectEcommerceCorrectionIntentCustomerMessageOrderChangedBrief(state([
    correctionIntent(true, true),
  ]))
  check(r.totalIntents === 1, 'msg-ord: totalIntents 1')
  check(r.messageSentOrderChangedCount === 1, 'msg-ord: messageSentOrderChangedCount 1')
  check(r.messageSentNoOrderChangeCount === 0, 'msg-ord: messageSentNoOrderChangeCount 0')
  check(r.noMessageOrderChangedCount === 0, 'msg-ord: noMessageOrderChangedCount 0')
}

// 3. Message sent + no order change
{
  const r = projectEcommerceCorrectionIntentCustomerMessageOrderChangedBrief(state([
    correctionIntent(true, false),
  ]))
  check(r.totalIntents === 1, 'msg-noor: totalIntents 1')
  check(r.messageSentNoOrderChangeCount === 1, 'msg-noor: messageSentNoOrderChangeCount 1')
  check(r.noMessageNoOrderChangeCount === 0, 'msg-noor: noMessageNoOrderChangeCount 0')
  check(r.messageSentOrderChangedCount === 0, 'msg-noor: messageSentOrderChangedCount 0')
}

// 4. No message + order changed
{
  const r = projectEcommerceCorrectionIntentCustomerMessageOrderChangedBrief(state([
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 1, 'nomsg-ord: totalIntents 1')
  check(r.noMessageOrderChangedCount === 1, 'nomsg-ord: noMessageOrderChangedCount 1')
  check(r.messageSentOrderChangedCount === 0, 'nomsg-ord: messageSentOrderChangedCount 0')
}

// 5. No message + no order change
{
  const r = projectEcommerceCorrectionIntentCustomerMessageOrderChangedBrief(state([
    correctionIntent(false, false),
  ]))
  check(r.totalIntents === 1, 'nomsg-noor: totalIntents 1')
  check(r.noMessageNoOrderChangeCount === 1, 'nomsg-noor: noMessageNoOrderChangeCount 1')
  check(r.noMessageOrderChangedCount === 0, 'nomsg-noor: noMessageOrderChangedCount 0')
}

// 6. Mixed: 2 msg+orderChanged, 1 msg+noChange, 1 noMsg+orderChanged
{
  const r = projectEcommerceCorrectionIntentCustomerMessageOrderChangedBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.messageSentOrderChangedCount === 2, 'mixed: messageSentOrderChangedCount 2')
  check(r.messageSentNoOrderChangeCount === 1, 'mixed: messageSentNoOrderChangeCount 1')
  check(r.noMessageOrderChangedCount === 1, 'mixed: noMessageOrderChangedCount 1')
}

// 7. Row totals
{
  const r = projectEcommerceCorrectionIntentCustomerMessageOrderChangedBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, false),
  ]))
  check(r.messageSentCount === 2, 'row-totals: messageSentCount 2')
  check(r.noMessageCount === 1, 'row-totals: noMessageCount 1')
}

console.log(`ecommerce-correction-intent-customer-message-order-changed-brief: ${checks} checks passed`)
