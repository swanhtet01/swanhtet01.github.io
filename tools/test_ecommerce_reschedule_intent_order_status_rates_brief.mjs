import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRescheduleIntentOrderStatusRatesBrief } from './ecommerce-reschedule-intent-order-status-rates-brief.ts'`,
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

const { projectEcommerceRescheduleIntentOrderStatusRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const ORIGINAL = '2026-08-05T10:00:00Z'
const PUSHED_BACK = '2026-08-07T10:00:00Z'

let intentId = 0
function rescheduleIntent({ orderStatus = 'confirmed' } = {}) {
  intentId++
  return {
    schema: 'supermega.ecommerce.reschedule_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `ERI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus,
    paymentStatus: 'pending',
    fulfilment: 'delivery',
    originalPromisedAt: ORIGINAL,
    requestedPromisedAt: PUSHED_BACK,
    reason: 'Reschedule reason',
    customerMessageSent: false,
    replacementRequestId: null,
    originalTotalMmk: 10000,
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

// 1. Empty state — 7 checks
{
  const r = projectEcommerceRescheduleIntentOrderStatusRatesBrief(state())
  check(r.totalIntents === 0, 'empty:totalIntents')
  check(r.confirmedCount === 0, 'empty:confirmedCount')
  check(r.confirmedRate === 0, 'empty:confirmedRate')
  check(r.preparingCount === 0, 'empty:preparingCount')
  check(r.preparingRate === 0, 'empty:preparingRate')
  check(r.readyCount === 0, 'empty:readyCount')
  check(r.readyRate === 0, 'empty:readyRate')
}

// 2. Single confirmed — 3 checks
{
  const r = projectEcommerceRescheduleIntentOrderStatusRatesBrief(state([rescheduleIntent()]))
  check(r.totalIntents === 1, 'confirmed:total')
  check(r.confirmedCount === 1, 'confirmed:count')
  check(r.confirmedRate === 1, 'confirmed:rate')
}

// 3. Single preparing — 3 checks
{
  const r = projectEcommerceRescheduleIntentOrderStatusRatesBrief(state([
    rescheduleIntent({ orderStatus: 'preparing' }),
  ]))
  check(r.totalIntents === 1, 'preparing:total')
  check(r.preparingCount === 1, 'preparing:count')
  check(r.preparingRate === 1, 'preparing:rate')
}

// 4. Single ready — 3 checks
{
  const r = projectEcommerceRescheduleIntentOrderStatusRatesBrief(state([
    rescheduleIntent({ orderStatus: 'ready' }),
  ]))
  check(r.totalIntents === 1, 'ready:total')
  check(r.readyCount === 1, 'ready:count')
  check(r.readyRate === 1, 'ready:rate')
}

// 5. One of each — 3 checks
{
  const r = projectEcommerceRescheduleIntentOrderStatusRatesBrief(state([
    rescheduleIntent({ orderStatus: 'confirmed' }),
    rescheduleIntent({ orderStatus: 'preparing' }),
    rescheduleIntent({ orderStatus: 'ready' }),
  ]))
  check(r.totalIntents === 3, 'allThree:total')
  check(r.confirmedCount === 1, 'allThree:confirmedCount')
  check(r.preparingCount === 1, 'allThree:preparingCount')
}

// 6. 2 confirmed + 1 preparing — 2 checks
{
  const r = projectEcommerceRescheduleIntentOrderStatusRatesBrief(state([
    rescheduleIntent(),
    rescheduleIntent(),
    rescheduleIntent({ orderStatus: 'preparing' }),
  ]))
  check(r.confirmedCount === 2, 'twoPlusOne:confirmedCount')
  check(r.confirmedRate === 0.6667, 'twoPlusOne:confirmedRate')
}

// 7. 0 confirmed, 2 preparing, 1 ready — 2 checks
{
  const r = projectEcommerceRescheduleIntentOrderStatusRatesBrief(state([
    rescheduleIntent({ orderStatus: 'preparing' }),
    rescheduleIntent({ orderStatus: 'preparing' }),
    rescheduleIntent({ orderStatus: 'ready' }),
  ]))
  check(r.preparingRate === 0.6667, 'precision:preparingRate')
  check(r.readyRate === 0.3333, 'precision:readyRate')
}

console.log(`ecommerce-reschedule-intent-order-status-rates-brief: ${checks} checks passed`)
