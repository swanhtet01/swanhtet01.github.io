// Ecommerce support intent summary: totalIntents, byCategory (5 kinds),
// uniqueOrders, uniqueSourceRequests, topCategory (alpha tie-break, null if empty).
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceSupportIntentSummary } from './ecommerce-support-intent-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/support-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectEcommerceSupportIntentSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let seq = 0
function intent(category, orderId = 'order-1', sourceRequestId = 'req-1') {
  seq++
  return {
    schema: 'supermega.ecommerce.support_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope1',
    id: `si-${seq}`,
    idempotencyKey: `key-${seq}`,
    createdAt: '2026-08-11T08:00:00.000Z',
    orderId,
    sourceRequestId,
    category,
    description: `Support request ${seq}`,
    externalMessageSent: false,
    refundStarted: false,
    evidenceReference: `ev-${seq}`,
  }
}

function state(supportIntents = []) {
  return { requests: [], returnIntents: [], supportIntents, correctionIntents: [], cancellationIntents: [], cancellationDecisions: [], amendmentIntents: [], rescheduleIntents: [] }
}

// 1. Empty state → all zeros, topCategory null
{
  const r = projectEcommerceSupportIntentSummary(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.byCategory.order_status === 0, 'empty: byCategory.order_status 0')
  check(r.byCategory.delivery_issue === 0, 'empty: byCategory.delivery_issue 0')
  check(r.byCategory.payment_question === 0, 'empty: byCategory.payment_question 0')
  check(r.byCategory.item_issue === 0, 'empty: byCategory.item_issue 0')
  check(r.byCategory.other === 0, 'empty: byCategory.other 0')
  check(r.uniqueOrders === 0, 'empty: uniqueOrders 0')
  check(r.uniqueSourceRequests === 0, 'empty: uniqueSourceRequests 0')
  check(r.topCategory === null, 'empty: topCategory null')
}

// 2. Single intent → counts correctly
{
  const r = projectEcommerceSupportIntentSummary(state([
    intent('delivery_issue', 'ord-1', 'req-1'),
  ]))
  check(r.totalIntents === 1, 'single: totalIntents 1')
  check(r.byCategory.delivery_issue === 1, 'single: byCategory.delivery_issue 1')
  check(r.byCategory.order_status === 0, 'single: byCategory.order_status 0')
  check(r.uniqueOrders === 1, 'single: uniqueOrders 1')
  check(r.uniqueSourceRequests === 1, 'single: uniqueSourceRequests 1')
  check(r.topCategory === 'delivery_issue', 'single: topCategory delivery_issue')
}

// 3. All five categories covered
{
  const r = projectEcommerceSupportIntentSummary(state([
    intent('order_status'),
    intent('delivery_issue'),
    intent('payment_question'),
    intent('item_issue'),
    intent('other'),
  ]))
  check(r.totalIntents === 5, 'all-cats: totalIntents 5')
  check(r.byCategory.order_status === 1, 'all-cats: order_status 1')
  check(r.byCategory.delivery_issue === 1, 'all-cats: delivery_issue 1')
  check(r.byCategory.payment_question === 1, 'all-cats: payment_question 1')
  check(r.byCategory.item_issue === 1, 'all-cats: item_issue 1')
  check(r.byCategory.other === 1, 'all-cats: other 1')
}

// 4. topCategory: picks the highest count
{
  const r = projectEcommerceSupportIntentSummary(state([
    intent('order_status'),
    intent('item_issue'),
    intent('item_issue'),
    intent('item_issue'),
    intent('delivery_issue'),
  ]))
  check(r.topCategory === 'item_issue', 'top-cat: item_issue wins (3 vs 1)')
  check(r.byCategory.item_issue === 3, 'top-cat: item_issue count 3')
}

// 5. topCategory tie-break: same count → alphabetical category
{
  // delivery_issue vs item_issue both have 2 — delivery_issue comes before item_issue alphabetically
  const r = projectEcommerceSupportIntentSummary(state([
    intent('item_issue'),
    intent('item_issue'),
    intent('delivery_issue'),
    intent('delivery_issue'),
  ]))
  check(r.topCategory === 'delivery_issue', 'tie: delivery_issue before item_issue (alpha)')
}

// 6. uniqueOrders: same orderId in multiple intents → counted once
{
  const r = projectEcommerceSupportIntentSummary(state([
    intent('order_status', 'ord-1', 'req-1'),
    intent('item_issue', 'ord-1', 'req-2'),
    intent('other', 'ord-2', 'req-3'),
  ]))
  check(r.uniqueOrders === 2, 'unique-orders: ord-1 and ord-2 → 2')
}

// 7. uniqueSourceRequests: same sourceRequestId in multiple intents → counted once
{
  const r = projectEcommerceSupportIntentSummary(state([
    intent('order_status', 'ord-1', 'req-A'),
    intent('delivery_issue', 'ord-2', 'req-A'),
    intent('item_issue', 'ord-3', 'req-B'),
  ]))
  check(r.uniqueSourceRequests === 2, 'unique-reqs: req-A and req-B → 2')
}

// 8. Multiple intents accumulate byCategory
{
  const r = projectEcommerceSupportIntentSummary(state([
    intent('order_status'),
    intent('order_status'),
    intent('order_status'),
    intent('delivery_issue'),
    intent('delivery_issue'),
    intent('other'),
  ]))
  check(r.byCategory.order_status === 3, 'accum: order_status 3')
  check(r.byCategory.delivery_issue === 2, 'accum: delivery_issue 2')
  check(r.byCategory.other === 1, 'accum: other 1')
  check(r.topCategory === 'order_status', 'accum: topCategory order_status (3 wins)')
}

// 9. topCategory tie: 'delivery_issue' vs 'order_status' both 2 — delivery_issue wins (d < o)
{
  const r = projectEcommerceSupportIntentSummary(state([
    intent('order_status'),
    intent('order_status'),
    intent('delivery_issue'),
    intent('delivery_issue'),
    intent('other'),
  ]))
  check(r.topCategory === 'delivery_issue', 'tie-2: delivery_issue (d) before order_status (o)')
}

console.log(JSON.stringify({ ok: true, checks }))
