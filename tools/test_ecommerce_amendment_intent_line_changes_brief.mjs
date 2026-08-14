// Ecommerce amendment intent line changes brief: SKU distribution + qty change direction.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceAmendmentIntentLineChangesBrief } from './ecommerce-amendment-intent-line-changes-brief.ts'`,
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

const { projectEcommerceAmendmentIntentLineChangesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function lineChange(sku = 'SKU-1', fromQuantity = 2, toQuantity = 1) {
  return { sku, name: 'Product', fromQuantity, toQuantity }
}

function amendmentIntent(lineChanges = []) {
  intentId++
  return {
    schema: 'supermega.ecommerce.order_amendment_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `AMI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    originalTotalMmk: 5000,
    replacementRequestId: `RPL-${intentId}`,
    replacementRequestDigest: `rpd-${intentId}`,
    lineChanges,
    fromFulfilment: 'pickup',
    toFulfilment: 'pickup',
    reason: 'Customer request',
    customerMessageSent: false,
    orderChanged: false,
    stockChanged: false,
    paymentChanged: false,
    refundStarted: false,
    providerCalled: false,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(amendmentIntents) {
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
  const r = projectEcommerceAmendmentIntentLineChangesBrief(state([]))
  check(r.totalAmendmentIntents === 0, 'empty: totalAmendmentIntents 0')
  check(r.totalLineChanges === 0, 'empty: totalLineChanges 0')
  check(r.intentsWithLineChanges === 0, 'empty: intentsWithLineChanges 0')
  check(r.uniqueAlteredSkus === 0, 'empty: uniqueAlteredSkus 0')
  check(r.topAlteredSkusByCount.length === 0, 'empty: top empty')
  check(r.quantityIncreasedLines === 0, 'empty: quantityIncreasedLines 0')
  check(r.quantityDecreasedLines === 0, 'empty: quantityDecreasedLines 0')
  check(r.quantityUnchangedLines === 0, 'empty: quantityUnchangedLines 0')
}

// 2. Amendment intent with no line changes
{
  const r = projectEcommerceAmendmentIntentLineChangesBrief(state([amendmentIntent([])]))
  check(r.totalAmendmentIntents === 1, 'no-changes: totalAmendmentIntents 1')
  check(r.totalLineChanges === 0, 'no-changes: totalLineChanges 0')
  check(r.intentsWithLineChanges === 0, 'no-changes: intentsWithLineChanges 0')
}

// 3. Single line change — quantity decrease
{
  const r = projectEcommerceAmendmentIntentLineChangesBrief(
    state([amendmentIntent([lineChange('SKU-1', 3, 1)])]),
  )
  check(r.totalAmendmentIntents === 1, 'single-dec: totalAmendmentIntents 1')
  check(r.totalLineChanges === 1, 'single-dec: totalLineChanges 1')
  check(r.intentsWithLineChanges === 1, 'single-dec: intentsWithLineChanges 1')
  check(r.uniqueAlteredSkus === 1, 'single-dec: uniqueAlteredSkus 1')
  check(r.topAlteredSkusByCount[0]?.sku === 'SKU-1', 'single-dec: top sku SKU-1')
  check(r.topAlteredSkusByCount[0]?.count === 1, 'single-dec: top count 1')
  check(r.quantityDecreasedLines === 1, 'single-dec: quantityDecreasedLines 1')
  check(r.quantityIncreasedLines === 0, 'single-dec: quantityIncreasedLines 0')
  check(r.quantityUnchangedLines === 0, 'single-dec: quantityUnchangedLines 0')
}

// 4. Single line change — quantity increase
{
  const r = projectEcommerceAmendmentIntentLineChangesBrief(
    state([amendmentIntent([lineChange('SKU-2', 1, 3)])]),
  )
  check(r.quantityIncreasedLines === 1, 'inc: quantityIncreasedLines 1')
  check(r.quantityDecreasedLines === 0, 'inc: quantityDecreasedLines 0')
}

// 5. Single line change — quantity unchanged
{
  const r = projectEcommerceAmendmentIntentLineChangesBrief(
    state([amendmentIntent([lineChange('SKU-3', 2, 2)])]),
  )
  check(r.quantityUnchangedLines === 1, 'same: quantityUnchangedLines 1')
  check(r.quantityIncreasedLines === 0, 'same: quantityIncreasedLines 0')
  check(r.quantityDecreasedLines === 0, 'same: quantityDecreasedLines 0')
}

// 6. SKU frequency distribution across intents
{
  const r = projectEcommerceAmendmentIntentLineChangesBrief(
    state([
      amendmentIntent([lineChange('SKU-A', 2, 1), lineChange('SKU-B', 3, 2)]),
      amendmentIntent([lineChange('SKU-A', 1, 2)]),
    ]),
  )
  check(r.totalAmendmentIntents === 2, 'freq: totalAmendmentIntents 2')
  check(r.totalLineChanges === 3, 'freq: totalLineChanges 3')
  check(r.intentsWithLineChanges === 2, 'freq: intentsWithLineChanges 2')
  check(r.uniqueAlteredSkus === 2, 'freq: uniqueAlteredSkus 2')
  check(r.topAlteredSkusByCount[0]?.sku === 'SKU-A', 'freq: top sku SKU-A')
  check(r.topAlteredSkusByCount[0]?.count === 2, 'freq: top count 2')
  check(r.quantityDecreasedLines === 2, 'freq: quantityDecreasedLines 2')
  check(r.quantityIncreasedLines === 1, 'freq: quantityIncreasedLines 1')
}

// 7. Top-5 cap + tiebreak
{
  const skus = ['SKU-Z', 'SKU-A', 'SKU-C', 'SKU-B', 'SKU-D', 'SKU-E']
  const r = projectEcommerceAmendmentIntentLineChangesBrief(
    state([amendmentIntent(skus.map(s => lineChange(s, 2, 1)))]),
  )
  check(r.topAlteredSkusByCount.length === 5, 'top5: capped at 5')
  check(r.topAlteredSkusByCount[0]?.sku === 'SKU-A', 'top5: tiebreak SKU-A first')
}

console.log(JSON.stringify({ ok: true, checks }))
