import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRescheduleIntentOrderChangedRatesBrief } from './ecommerce-reschedule-intent-order-changed-rates-brief.ts'`,
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

const { projectEcommerceRescheduleIntentOrderChangedRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function rescheduleIntent({ orderChanged = false } = {}) {
  intentId++
  return {
    schema: 'supermega.ecommerce.order_reschedule_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `ERI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    originalTotalMmk: 10000,
    originalPromisedAt: '2026-08-05T10:00:00Z',
    replacementRequestId: `REP-${intentId}`,
    replacementRequestDigest: `rrd-${intentId}`,
    requestedPromisedAt: '2026-08-07T10:00:00Z',
    fulfilment: 'delivery',
    reason: 'Reschedule reason',
    customerMessageSent: false,
    orderChanged,
    stockChanged: false,
    paymentChanged: false,
    refundStarted: false,
    riderBooked: false,
    providerCalled: false,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(rescheduleIntents = []) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: 0,
    headDigest: 'hd-1',
    requests: [],
    returnIntents: [],
    supportIntents: [],
    correctionIntents: [],
    cancellationIntents: [],
    cancellationDecisions: [],
    amendmentIntents: [],
    rescheduleIntents,
    events: [],
  }
}

// 1. Empty state — 5 checks
{
  const r = projectEcommerceRescheduleIntentOrderChangedRatesBrief(state())
  check(r.totalIntents === 0, 'empty:totalIntents')
  check(r.orderChangedCount === 0, 'empty:orderChangedCount')
  check(r.orderChangedRate === 0, 'empty:orderChangedRate')
  check(r.notOrderChangedCount === 0, 'empty:notOrderChangedCount')
  check(r.notOrderChangedRate === 0, 'empty:notOrderChangedRate')
}

// 2. Single changed — 3 checks
{
  const r = projectEcommerceRescheduleIntentOrderChangedRatesBrief(state([
    rescheduleIntent({ orderChanged: true }),
  ]))
  check(r.totalIntents === 1, 'changed:total')
  check(r.orderChangedCount === 1, 'changed:count')
  check(r.orderChangedRate === 1, 'changed:rate')
}

// 3. Single not changed — 3 checks
{
  const r = projectEcommerceRescheduleIntentOrderChangedRatesBrief(state([rescheduleIntent()]))
  check(r.totalIntents === 1, 'notChanged:total')
  check(r.notOrderChangedCount === 1, 'notChanged:count')
  check(r.notOrderChangedRate === 1, 'notChanged:rate')
}

// 4. 2 changed — 3 checks
{
  const r = projectEcommerceRescheduleIntentOrderChangedRatesBrief(state([
    rescheduleIntent({ orderChanged: true }),
    rescheduleIntent({ orderChanged: true }),
  ]))
  check(r.orderChangedCount === 2, 'twoChanged:count')
  check(r.notOrderChangedCount === 0, 'twoChanged:notCount')
  check(r.orderChangedRate === 1, 'twoChanged:rate')
}

// 5. 2 not changed — 2 checks
{
  const r = projectEcommerceRescheduleIntentOrderChangedRatesBrief(state([
    rescheduleIntent(),
    rescheduleIntent(),
  ]))
  check(r.notOrderChangedCount === 2, 'twoNotChanged:count')
  check(r.orderChangedCount === 0, 'twoNotChanged:changedCount')
}

// 6. 1 changed + 1 not changed — 3 checks
{
  const r = projectEcommerceRescheduleIntentOrderChangedRatesBrief(state([
    rescheduleIntent({ orderChanged: true }),
    rescheduleIntent(),
  ]))
  check(r.totalIntents === 2, 'half:total')
  check(r.orderChangedRate === 0.5, 'half:changedRate')
  check(r.notOrderChangedRate === 0.5, 'half:notChangedRate')
}

// 7. Precision: 1 changed + 2 not changed (1/3 = 0.3333) — 4 checks
{
  const r = projectEcommerceRescheduleIntentOrderChangedRatesBrief(state([
    rescheduleIntent({ orderChanged: true }),
    rescheduleIntent(),
    rescheduleIntent(),
  ]))
  check(r.totalIntents === 3, 'precision:total')
  check(r.orderChangedCount === 1, 'precision:changedCount')
  check(r.orderChangedRate === 0.3333, 'precision:changedRate')
  check(r.notOrderChangedRate === 0.6667, 'precision:notChangedRate')
}

console.log(`ecommerce-reschedule-intent-order-changed-rates-brief: ${checks} checks passed`)
