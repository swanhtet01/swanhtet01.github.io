import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceAmendmentIntentStockChangedRatesBrief } from './ecommerce-amendment-intent-stock-changed-rates-brief.ts'`,
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

const { projectEcommerceAmendmentIntentStockChangedRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function amendmentIntent({ stockChanged = false } = {}) {
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
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    originalTotalMmk: 15000,
    replacementRequestId: `REP-${intentId}`,
    replacementRequestDigest: `rrd-${intentId}`,
    lineChanges: [],
    fromFulfilment: 'pickup',
    toFulfilment: 'delivery',
    reason: 'Amendment reason',
    customerMessageSent: false,
    orderChanged: false,
    stockChanged,
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

// 1. Empty state — 5 checks
{
  const r = projectEcommerceAmendmentIntentStockChangedRatesBrief(state())
  check(r.totalIntents === 0, 'empty:totalIntents')
  check(r.stockChangedCount === 0, 'empty:stockChangedCount')
  check(r.stockChangedRate === 0, 'empty:stockChangedRate')
  check(r.notStockChangedCount === 0, 'empty:notStockChangedCount')
  check(r.notStockChangedRate === 0, 'empty:notStockChangedRate')
}

// 2. Single stock changed — 3 checks
{
  const r = projectEcommerceAmendmentIntentStockChangedRatesBrief(state([
    amendmentIntent({ stockChanged: true }),
  ]))
  check(r.totalIntents === 1, 'changed:total')
  check(r.stockChangedCount === 1, 'changed:count')
  check(r.stockChangedRate === 1, 'changed:rate')
}

// 3. Single not changed — 3 checks
{
  const r = projectEcommerceAmendmentIntentStockChangedRatesBrief(state([amendmentIntent()]))
  check(r.totalIntents === 1, 'notChanged:total')
  check(r.notStockChangedCount === 1, 'notChanged:count')
  check(r.notStockChangedRate === 1, 'notChanged:rate')
}

// 4. 2 changed — 3 checks
{
  const r = projectEcommerceAmendmentIntentStockChangedRatesBrief(state([
    amendmentIntent({ stockChanged: true }),
    amendmentIntent({ stockChanged: true }),
  ]))
  check(r.stockChangedCount === 2, 'twoChanged:count')
  check(r.notStockChangedCount === 0, 'twoChanged:notCount')
  check(r.stockChangedRate === 1, 'twoChanged:rate')
}

// 5. 2 not changed — 2 checks
{
  const r = projectEcommerceAmendmentIntentStockChangedRatesBrief(state([
    amendmentIntent(),
    amendmentIntent(),
  ]))
  check(r.notStockChangedCount === 2, 'twoNotChanged:count')
  check(r.stockChangedCount === 0, 'twoNotChanged:changedCount')
}

// 6. 1 changed + 1 not changed — 3 checks
{
  const r = projectEcommerceAmendmentIntentStockChangedRatesBrief(state([
    amendmentIntent({ stockChanged: true }),
    amendmentIntent(),
  ]))
  check(r.totalIntents === 2, 'half:total')
  check(r.stockChangedRate === 0.5, 'half:changedRate')
  check(r.notStockChangedRate === 0.5, 'half:notChangedRate')
}

// 7. Precision: 1 changed + 2 not changed (1/3 = 0.3333) — 4 checks
{
  const r = projectEcommerceAmendmentIntentStockChangedRatesBrief(state([
    amendmentIntent({ stockChanged: true }),
    amendmentIntent(),
    amendmentIntent(),
  ]))
  check(r.totalIntents === 3, 'precision:total')
  check(r.stockChangedCount === 1, 'precision:changedCount')
  check(r.stockChangedRate === 0.3333, 'precision:changedRate')
  check(r.notStockChangedRate === 0.6667, 'precision:notChangedRate')
}

console.log(`ecommerce-amendment-intent-stock-changed-rates-brief: ${checks} checks passed`)
