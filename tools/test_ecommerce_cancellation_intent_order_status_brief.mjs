import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationIntentOrderStatusBrief } from './ecommerce-cancellation-intent-order-status-brief.ts'`,
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

const { projectEcommerceCancellationIntentOrderStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function cancellationIntent(orderStatus = 'confirmed') {
  intentId++
  return {
    schema: 'supermega.ecommerce.cancellation_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `ECN-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus,
    paymentStatus: 'pending',
    refundStatus: 'none',
    totalMmk: 10000,
    reasonCode: 'changed_mind',
    reason: 'Cancellation reason',
    customerMessageSent: false,
    orderCancelled: false,
    refundStarted: false,
    providerCalled: false,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(cancellationIntents = []) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: 0,
    headDigest: 'hd-1',
    requests: [],
    returnIntents: [],
    supportIntents: [],
    correctionIntents: [],
    cancellationIntents,
    cancellationDecisions: [],
    amendmentIntents: [],
    rescheduleIntents: [],
    events: [],
  }
}

// 1. Empty state
{
  const r = projectEcommerceCancellationIntentOrderStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.confirmedCount === 0, 'empty: confirmedCount 0')
  check(r.preparingCount === 0, 'empty: preparingCount 0')
  check(r.readyCount === 0, 'empty: readyCount 0')
}

// 2. Three confirmed — all confirmed
{
  const r = projectEcommerceCancellationIntentOrderStatusBrief(state([
    cancellationIntent('confirmed'),
    cancellationIntent('confirmed'),
    cancellationIntent('confirmed'),
  ]))
  check(r.totalIntents === 3, 'all-confirmed: totalIntents 3')
  check(r.confirmedCount === 3, 'all-confirmed: confirmedCount 3')
  check(r.preparingCount === 0, 'all-confirmed: preparingCount 0')
  check(r.confirmedCount + r.preparingCount + r.readyCount === r.totalIntents, 'all-confirmed: sum = total')
}

// 3. All preparing
{
  const r = projectEcommerceCancellationIntentOrderStatusBrief(state([
    cancellationIntent('preparing'),
    cancellationIntent('preparing'),
  ]))
  check(r.totalIntents === 2, 'all-preparing: totalIntents 2')
  check(r.confirmedCount === 0, 'all-preparing: confirmedCount 0')
  check(r.preparingCount === 2, 'all-preparing: preparingCount 2')
  check(r.readyCount === 0, 'all-preparing: readyCount 0')
}

// 4. All ready
{
  const r = projectEcommerceCancellationIntentOrderStatusBrief(state([
    cancellationIntent('ready'),
    cancellationIntent('ready'),
  ]))
  check(r.totalIntents === 2, 'all-ready: totalIntents 2')
  check(r.confirmedCount === 0, 'all-ready: confirmedCount 0')
  check(r.preparingCount === 0, 'all-ready: preparingCount 0')
  check(r.readyCount === 2, 'all-ready: readyCount 2')
}

// 5. Mixed one of each
{
  const r = projectEcommerceCancellationIntentOrderStatusBrief(state([
    cancellationIntent('confirmed'),
    cancellationIntent('preparing'),
    cancellationIntent('ready'),
  ]))
  check(r.totalIntents === 3, 'mixed: totalIntents 3')
  check(r.confirmedCount === 1, 'mixed: confirmedCount 1')
  check(r.preparingCount === 1, 'mixed: preparingCount 1')
  check(r.confirmedCount + r.preparingCount + r.readyCount === r.totalIntents, 'mixed: sum = total')
}

// 6. Single confirmed
{
  const r = projectEcommerceCancellationIntentOrderStatusBrief(state([cancellationIntent('confirmed')]))
  check(r.totalIntents === 1, 'single: totalIntents 1')
  check(r.confirmedCount === 1, 'single: confirmedCount 1')
  check(r.preparingCount === 0, 'single: preparingCount 0')
}

console.log(`ecommerce-cancellation-intent-order-status-brief: ${checks} checks passed`)
