// Ecommerce order amendment intent summary: totalAmendments, uniqueOrders,
// totalOriginalValueMmk, fulfilmentChangedCount, byFulfilmentTransition sorted desc count.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceAmendmentIntentSummary } from './ecommerce-amendment-intent-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/amendment-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectEcommerceAmendmentIntentSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let seq = 0
function amendment({ orderId = 'ord-1', originalTotalMmk = 100_000, fromFulfilment = 'pickup', toFulfilment = 'pickup' } = {}) {
  seq++
  return {
    schema: 'supermega.ecommerce.order_amendment_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope1',
    id: `ami-${seq}`,
    idempotencyKey: `key-${seq}`,
    createdAt: '2026-08-11T08:00:00.000Z',
    orderId,
    sourceRequestId: `req-${seq}`,
    sourceAcknowledgementDigest: `digest-${seq}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    originalTotalMmk,
    replacementRequestId: `rep-${seq}`,
    replacementRequestDigest: `rdigest-${seq}`,
    lineChanges: [],
    fromFulfilment,
    toFulfilment,
    reason: `Amendment reason ${seq}`,
    customerMessageSent: false,
    orderChanged: false,
    stockChanged: false,
    paymentChanged: false,
    refundStarted: false,
    providerCalled: false,
    evidenceReference: `ev-${seq}`,
  }
}

function state(amendmentIntents = []) {
  return { requests: [], returnIntents: [], supportIntents: [], correctionIntents: [], cancellationIntents: [], cancellationDecisions: [], amendmentIntents, rescheduleIntents: [] }
}

// 1. Empty state → all zeros
{
  const r = projectEcommerceAmendmentIntentSummary(state())
  check(r.totalAmendments === 0, 'empty: totalAmendments 0')
  check(r.uniqueOrders === 0, 'empty: uniqueOrders 0')
  check(r.totalOriginalValueMmk === 0, 'empty: totalOriginalValueMmk 0')
  check(r.fulfilmentChangedCount === 0, 'empty: fulfilmentChangedCount 0')
  check(r.byFulfilmentTransition.length === 0, 'empty: byFulfilmentTransition empty')
}

// 2. Single amendment: same fulfilment (no fulfilment change)
{
  const r = projectEcommerceAmendmentIntentSummary(state([
    amendment({ orderId: 'ord-1', originalTotalMmk: 200_000, fromFulfilment: 'pickup', toFulfilment: 'pickup' }),
  ]))
  check(r.totalAmendments === 1, 'single-same: totalAmendments 1')
  check(r.uniqueOrders === 1, 'single-same: uniqueOrders 1')
  check(r.totalOriginalValueMmk === 200_000, 'single-same: totalOriginalValueMmk 200000')
  check(r.fulfilmentChangedCount === 0, 'single-same: fulfilmentChangedCount 0 (same mode)')
  check(r.byFulfilmentTransition.length === 1, 'single-same: byFulfilmentTransition 1 entry')
  check(r.byFulfilmentTransition[0].fromFulfilment === 'pickup', 'single-same: fromFulfilment pickup')
  check(r.byFulfilmentTransition[0].toFulfilment === 'pickup', 'single-same: toFulfilment pickup')
  check(r.byFulfilmentTransition[0].count === 1, 'single-same: transition count 1')
}

// 3. Single amendment: fulfilment change delivery → pickup
{
  const r = projectEcommerceAmendmentIntentSummary(state([
    amendment({ fromFulfilment: 'delivery', toFulfilment: 'pickup', originalTotalMmk: 150_000 }),
  ]))
  check(r.fulfilmentChangedCount === 1, 'change: fulfilmentChangedCount 1')
  check(r.byFulfilmentTransition[0].fromFulfilment === 'delivery', 'change: fromFulfilment delivery')
  check(r.byFulfilmentTransition[0].toFulfilment === 'pickup', 'change: toFulfilment pickup')
}

// 4. Multiple amendments: totalOriginalValueMmk accumulates
{
  const r = projectEcommerceAmendmentIntentSummary(state([
    amendment({ originalTotalMmk: 100_000 }),
    amendment({ originalTotalMmk: 200_000 }),
    amendment({ originalTotalMmk: 300_000 }),
  ]))
  check(r.totalOriginalValueMmk === 600_000, 'accum-value: 100k+200k+300k=600k')
  check(r.totalAmendments === 3, 'accum-value: totalAmendments 3')
}

// 5. uniqueOrders: same orderId counted once
{
  const r = projectEcommerceAmendmentIntentSummary(state([
    amendment({ orderId: 'ord-X' }),
    amendment({ orderId: 'ord-X' }),
    amendment({ orderId: 'ord-Y' }),
  ]))
  check(r.uniqueOrders === 2, 'unique-orders: ord-X and ord-Y → 2')
}

// 6. byFulfilmentTransition: sorted desc by count
{
  const r = projectEcommerceAmendmentIntentSummary(state([
    amendment({ fromFulfilment: 'delivery', toFulfilment: 'pickup' }),
    amendment({ fromFulfilment: 'pickup', toFulfilment: 'delivery' }),
    amendment({ fromFulfilment: 'pickup', toFulfilment: 'delivery' }),
    amendment({ fromFulfilment: 'pickup', toFulfilment: 'delivery' }),
  ]))
  check(r.byFulfilmentTransition[0].fromFulfilment === 'pickup', 'sort: pickup→delivery first (3 vs 1)')
  check(r.byFulfilmentTransition[0].toFulfilment === 'delivery', 'sort: transition to delivery')
  check(r.byFulfilmentTransition[0].count === 3, 'sort: count 3')
  check(r.byFulfilmentTransition[1].count === 1, 'sort: second entry count 1')
  check(r.fulfilmentChangedCount === 4, 'sort: fulfilmentChangedCount 4 (all changed)')
}

// 7. Tie-break: same count → alpha fromFulfilment
{
  const r = projectEcommerceAmendmentIntentSummary(state([
    amendment({ fromFulfilment: 'pickup', toFulfilment: 'delivery' }),
    amendment({ fromFulfilment: 'delivery', toFulfilment: 'pickup' }),
  ]))
  // 'delivery' < 'pickup' alphabetically
  check(r.byFulfilmentTransition[0].fromFulfilment === 'delivery', 'tie: delivery→pickup first (d before p)')
  check(r.byFulfilmentTransition[1].fromFulfilment === 'pickup', 'tie: pickup→delivery second')
}

// 8. Mixed fulfilment changes vs same
{
  const r = projectEcommerceAmendmentIntentSummary(state([
    amendment({ fromFulfilment: 'pickup', toFulfilment: 'pickup' }),
    amendment({ fromFulfilment: 'pickup', toFulfilment: 'pickup' }),
    amendment({ fromFulfilment: 'delivery', toFulfilment: 'pickup' }),
  ]))
  check(r.fulfilmentChangedCount === 1, 'mixed: 1 actual fulfilment change')
  check(r.byFulfilmentTransition.length === 2, 'mixed: 2 distinct transitions')
}

console.log(JSON.stringify({ ok: true, checks }))
