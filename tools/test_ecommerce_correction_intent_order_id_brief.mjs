import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentOrderIdBrief } from './ecommerce-correction-intent-order-id-brief.ts'`,
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

const { projectEcommerceCorrectionIntentOrderIdBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(orderId = 'ORD-DEFAULT') {
  intentId++
  return {
    schema: 'supermega.ecommerce.correction_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `ECO-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId,
    sourceRequestId: `REQ-${intentId}`,
    sourceCalculationDigest: `scd-${intentId}`,
    sourceCorrectionCount: 0,
    originalBalanceMmk: 10000,
    paymentStatus: 'reconciled',
    refundStatus: 'none',
    requestedKind: 'credit',
    reasonCode: 'pricing_error',
    listedAmountMmk: 500,
    reason: 'Price correction',
    orderChanged: false,
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
  const r = projectEcommerceCorrectionIntentOrderIdBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.uniqueOrders === 0, 'empty: uniqueOrders 0')
  check(r.topOrder === null, 'empty: topOrder null')
  check(r.topOrderCount === 0, 'empty: topOrderCount 0')
}

// 2. Single intent — one unique order
{
  const r = projectEcommerceCorrectionIntentOrderIdBrief(state([correctionIntent('ORD-001')]))
  check(r.totalIntents === 1, 'single: totalIntents 1')
  check(r.uniqueOrders === 1, 'single: uniqueOrders 1')
  check(r.topOrder === 'ORD-001', 'single: topOrder')
  check(r.topOrderCount === 1, 'single: topOrderCount 1')
}

// 3. Two intents same order — uniqueOrders 1, topCount 2
{
  const r = projectEcommerceCorrectionIntentOrderIdBrief(state([
    correctionIntent('ORD-002'),
    correctionIntent('ORD-002'),
  ]))
  check(r.totalIntents === 2, 'same-order: totalIntents 2')
  check(r.uniqueOrders === 1, 'same-order: uniqueOrders 1')
  check(r.topOrder === 'ORD-002', 'same-order: topOrder')
  check(r.topOrderCount === 2, 'same-order: topOrderCount 2')
}

// 4. Two intents different orders — uniqueOrders 2
{
  const r = projectEcommerceCorrectionIntentOrderIdBrief(state([
    correctionIntent('ORD-003'),
    correctionIntent('ORD-004'),
  ]))
  check(r.totalIntents === 2, 'two-diff: totalIntents 2')
  check(r.uniqueOrders === 2, 'two-diff: uniqueOrders 2')
  check(r.topOrderCount === 1, 'two-diff: topOrderCount 1')
  check(r.topOrder !== null, 'two-diff: topOrder set')
}

// 5. Three intents: one order appears twice — dominant topOrder
{
  const r = projectEcommerceCorrectionIntentOrderIdBrief(state([
    correctionIntent('ORD-005'),
    correctionIntent('ORD-006'),
    correctionIntent('ORD-005'),
  ]))
  check(r.totalIntents === 3, 'dominant: totalIntents 3')
  check(r.uniqueOrders === 2, 'dominant: uniqueOrders 2')
  check(r.topOrder === 'ORD-005', 'dominant: topOrder')
  check(r.topOrderCount === 2, 'dominant: topOrderCount 2')
}

// 6. Three intents all different — uniqueOrders 3, topCount 1
{
  const r = projectEcommerceCorrectionIntentOrderIdBrief(state([
    correctionIntent('ORD-007'),
    correctionIntent('ORD-008'),
    correctionIntent('ORD-009'),
  ]))
  check(r.totalIntents === 3, 'all-diff: totalIntents 3')
  check(r.uniqueOrders === 3, 'all-diff: uniqueOrders 3')
  check(r.topOrderCount === 1, 'all-diff: topOrderCount 1')
}

console.log(`ecommerce-correction-intent-order-id-brief: ${checks} checks passed`)
