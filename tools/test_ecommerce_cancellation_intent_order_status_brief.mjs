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
    id: `CXI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus,
    paymentStatus: 'pending',
    refundStatus: 'none',
    totalMmk: 8000,
    reasonCode: 'changed_mind',
    reason: 'Customer changed mind',
    customerMessageSent: false,
    orderCancelled: false,
    refundStarted: false,
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

// 1. Empty state — all zeros
{
  const r = projectEcommerceCancellationIntentOrderStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.confirmed === 0, 'empty: confirmed 0')
  check(r.preparing === 0, 'empty: preparing 0')
  check(r.ready === 0, 'empty: ready 0')
  check(r.confirmedRate === 0, 'empty: confirmedRate 0')
  check(r.preparingRate === 0, 'empty: preparingRate 0')
  check(r.readyRate === 0, 'empty: readyRate 0')
}

// 2. Single confirmed — rate 100
{
  const r = projectEcommerceCancellationIntentOrderStatusBrief(state([cancellationIntent('confirmed')]))
  check(r.totalIntents === 1, 'all-confirmed: totalIntents 1')
  check(r.confirmed === 1, 'all-confirmed: confirmed 1')
  check(r.confirmedRate === 100, 'all-confirmed: confirmedRate 100')
  check(r.preparingRate === 0, 'all-confirmed: preparingRate 0')
}

// 3. Single preparing — rate 100
{
  const r = projectEcommerceCancellationIntentOrderStatusBrief(state([cancellationIntent('preparing')]))
  check(r.preparing === 1, 'all-preparing: preparing 1')
  check(r.preparingRate === 100, 'all-preparing: preparingRate 100')
  check(r.confirmedRate === 0, 'all-preparing: confirmedRate 0')
}

// 4. Single ready — rate 100
{
  const r = projectEcommerceCancellationIntentOrderStatusBrief(state([cancellationIntent('ready')]))
  check(r.ready === 1, 'all-ready: ready 1')
  check(r.readyRate === 100, 'all-ready: readyRate 100')
}

// 5. Mixed: 2 confirmed + 1 preparing + 1 ready = 4 total → 50/25/25
{
  const r = projectEcommerceCancellationIntentOrderStatusBrief(state([
    cancellationIntent('confirmed'),
    cancellationIntent('confirmed'),
    cancellationIntent('preparing'),
    cancellationIntent('ready'),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.confirmed === 2, 'mixed: confirmed 2')
  check(r.confirmedRate === 50, 'mixed: confirmedRate 50')
  check(r.preparingRate === 25, 'mixed: preparingRate 25')
  check(r.readyRate === 25, 'mixed: readyRate 25')
}

// 6. 2 confirmed + 1 ready = 3 total → confirmed 67%, ready 33%
{
  const r = projectEcommerceCancellationIntentOrderStatusBrief(state([
    cancellationIntent('confirmed'),
    cancellationIntent('confirmed'),
    cancellationIntent('ready'),
  ]))
  check(r.confirmedRate === 67, 'two-thirds: confirmedRate 67')
  check(r.readyRate === 33, 'two-thirds: readyRate 33')
}

console.log(`ecommerce-cancellation-intent-order-status-brief: ${checks} checks passed`)
