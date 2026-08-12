import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceReturnIntentQuantityBrief } from './ecommerce-return-intent-quantity-brief.ts'`,
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

const { projectEcommerceReturnIntentQuantityBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function returnIntent(quantity = 1) {
  intentId++
  return {
    schema: 'supermega.ecommerce.return_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `RTI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sku: `SKU-${intentId}`,
    quantity,
    disposition: { action: 'refund', notes: null },
    reason: 'Item not as described',
    refundStatus: 'not_started',
    evidenceReference: `ev-${intentId}`,
  }
}

function state(returnIntents = []) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: 0,
    headDigest: 'hd-1',
    requests: [],
    returnIntents,
    supportIntents: [],
    correctionIntents: [],
    cancellationIntents: [],
    cancellationDecisions: [],
    amendmentIntents: [],
    rescheduleIntents: [],
    events: [],
  }
}

// 1. Empty state
{
  const r = projectEcommerceReturnIntentQuantityBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.minQuantity === null, 'empty: minQuantity null')
  check(r.maxQuantity === null, 'empty: maxQuantity null')
  check(r.sumQuantity === 0, 'empty: sumQuantity 0')
}

// 2. Single intent — quantity 3
{
  const r = projectEcommerceReturnIntentQuantityBrief(state([returnIntent(3)]))
  check(r.totalIntents === 1, 'single: totalIntents 1')
  check(r.minQuantity === 3, 'single: minQuantity 3')
  check(r.maxQuantity === 3, 'single: maxQuantity 3')
  check(r.sumQuantity === 3, 'single: sumQuantity 3')
}

// 3. Two intents — min, max, sum correct
{
  const r = projectEcommerceReturnIntentQuantityBrief(state([
    returnIntent(2),
    returnIntent(5),
  ]))
  check(r.totalIntents === 2, 'two: totalIntents 2')
  check(r.minQuantity === 2, 'two: minQuantity 2')
  check(r.maxQuantity === 5, 'two: maxQuantity 5')
  check(r.sumQuantity === 7, 'two: sumQuantity 7')
}

// 4. Three intents out of order — correct min/max/sum
{
  const r = projectEcommerceReturnIntentQuantityBrief(state([
    returnIntent(4),
    returnIntent(1),
    returnIntent(3),
  ]))
  check(r.totalIntents === 3, 'unsorted: totalIntents 3')
  check(r.minQuantity === 1, 'unsorted: minQuantity 1')
  check(r.maxQuantity === 4, 'unsorted: maxQuantity 4')
  check(r.sumQuantity === 8, 'unsorted: sumQuantity 8')
}

// 5. All same quantity
{
  const r = projectEcommerceReturnIntentQuantityBrief(state([
    returnIntent(2),
    returnIntent(2),
    returnIntent(2),
  ]))
  check(r.totalIntents === 3, 'same: totalIntents 3')
  check(r.minQuantity === 2, 'same: minQuantity 2')
  check(r.maxQuantity === 2, 'same: maxQuantity 2')
  check(r.sumQuantity === 6, 'same: sumQuantity 6')
}

// 6. Large quantities — min equals max for single large value
{
  const r = projectEcommerceReturnIntentQuantityBrief(state([returnIntent(100)]))
  check(r.minQuantity === r.maxQuantity, 'large: min equals max')
  check(r.sumQuantity === 100, 'large: sumQuantity 100')
  check(r.totalIntents === 1, 'large: totalIntents 1')
}

console.log(`ecommerce-return-intent-quantity-brief: ${checks} checks passed`)
