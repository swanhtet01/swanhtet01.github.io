import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceAmendmentIntentOrderStatusLineCountBrief } from './ecommerce-amendment-intent-order-status-line-count-brief.ts'`,
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

const { projectEcommerceAmendmentIntentOrderStatusLineCountBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function amendmentIntent(orderStatus = 'confirmed', lineCount = 1) {
  intentId++
  return {
    schema: 'supermega.ecommerce.order_amendment_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `EAM-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus,
    paymentStatus: 'pending',
    refundStatus: 'none',
    originalTotalMmk: 15000,
    replacementRequestId: `REP-${intentId}`,
    replacementRequestDigest: `rrd-${intentId}`,
    lineChanges: Array.from({ length: lineCount }, (_, i) => ({
      sku: `SKU-${i + 1}`,
      name: `Item ${i + 1}`,
      fromQuantity: 2,
      toQuantity: 1,
    })),
    fromFulfilment: 'delivery',
    toFulfilment: 'delivery',
    reason: 'Amendment reason',
    customerMessageSent: false,
    orderChanged: false,
    stockChanged: false,
    paymentChanged: false,
    refundStarted: false,
    providerCalled: false,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(amendmentIntents = []) {
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
    amendmentIntents,
    rescheduleIntents: [],
    events: [],
  }
}

// 1. Empty state
{
  const r = projectEcommerceAmendmentIntentOrderStatusLineCountBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.confirmedSingleCount === 0, 'empty: confirmedSingleCount 0')
  check(r.readyMultiCount === 0, 'empty: readyMultiCount 0')
}

// 2. Confirmed single (lineCount=1)
{
  const r = projectEcommerceAmendmentIntentOrderStatusLineCountBrief(state([
    amendmentIntent('confirmed', 1),
  ]))
  check(r.totalIntents === 1, 'confirmed-single: totalIntents 1')
  check(r.confirmedSingleCount === 1, 'confirmed-single: confirmedSingleCount 1')
  check(r.confirmedMultiCount === 0, 'confirmed-single: confirmedMultiCount 0')
  check(r.preparingSingleCount === 0, 'confirmed-single: preparingSingleCount 0')
}

// 3. Confirmed multi (lineCount=3)
{
  const r = projectEcommerceAmendmentIntentOrderStatusLineCountBrief(state([
    amendmentIntent('confirmed', 3),
  ]))
  check(r.confirmedMultiCount === 1, 'confirmed-multi: confirmedMultiCount 1')
  check(r.confirmedSingleCount === 0, 'confirmed-multi: confirmedSingleCount 0')
  check(r.totalIntents === 1, 'confirmed-multi: totalIntents 1')
  check(r.preparingMultiCount === 0, 'confirmed-multi: preparingMultiCount 0')
}

// 4. Preparing single
{
  const r = projectEcommerceAmendmentIntentOrderStatusLineCountBrief(state([
    amendmentIntent('preparing', 1),
  ]))
  check(r.preparingSingleCount === 1, 'preparing-single: preparingSingleCount 1')
  check(r.preparingMultiCount === 0, 'preparing-single: preparingMultiCount 0')
  check(r.totalIntents === 1, 'preparing-single: totalIntents 1')
}

// 5. Ready multi
{
  const r = projectEcommerceAmendmentIntentOrderStatusLineCountBrief(state([
    amendmentIntent('ready', 2),
  ]))
  check(r.readyMultiCount === 1, 'ready-multi: readyMultiCount 1')
  check(r.readySingleCount === 0, 'ready-multi: readySingleCount 0')
  check(r.totalIntents === 1, 'ready-multi: totalIntents 1')
}

// 6. All 6 cells: confirmed-single, confirmed-multi, preparing-single, preparing-multi, ready-single, ready-multi
{
  const r = projectEcommerceAmendmentIntentOrderStatusLineCountBrief(state([
    amendmentIntent('confirmed', 1),
    amendmentIntent('confirmed', 2),
    amendmentIntent('preparing', 1),
    amendmentIntent('preparing', 3),
    amendmentIntent('ready', 1),
    amendmentIntent('ready', 4),
  ]))
  check(r.totalIntents === 6, 'all-cells: totalIntents 6')
  check(r.confirmedSingleCount === 1, 'all-cells: confirmedSingleCount 1')
  check(r.preparingMultiCount === 1, 'all-cells: preparingMultiCount 1')
  check(r.readySingleCount === 1, 'all-cells: readySingleCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceAmendmentIntentOrderStatusLineCountBrief(state([
    amendmentIntent('confirmed', 1),
    amendmentIntent('confirmed', 2),
    amendmentIntent('preparing', 1),
    amendmentIntent('preparing', 3),
    amendmentIntent('ready', 1),
    amendmentIntent('ready', 4),
  ]))
  check(r.confirmedMultiCount === 1, 'sub-buckets: confirmedMultiCount 1')
  check(r.preparingSingleCount === 1, 'sub-buckets: preparingSingleCount 1')
}

console.log(`ecommerce-amendment-intent-order-status-line-count-brief: ${checks} checks passed`)
