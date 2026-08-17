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
    id: `ERI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sku: `SKU-${intentId}`,
    quantity,
    disposition: 'restock',
    reason: 'Return reason',
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
  check(r.singleItemCount === 0, 'empty: singleItemCount 0')
  check(r.multiItemCount === 0, 'empty: multiItemCount 0')
}

// 2. Single qty-1 return
{
  const r = projectEcommerceReturnIntentQuantityBrief(state([returnIntent(1)]))
  check(r.totalIntents === 1, 'qty1: totalIntents 1')
  check(r.singleItemCount === 1, 'qty1: singleItemCount 1')
  check(r.multiItemCount === 0, 'qty1: multiItemCount 0')
}

// 3. Single qty-2 return
{
  const r = projectEcommerceReturnIntentQuantityBrief(state([returnIntent(2)]))
  check(r.totalIntents === 1, 'qty2: totalIntents 1')
  check(r.singleItemCount === 0, 'qty2: singleItemCount 0')
  check(r.multiItemCount === 1, 'qty2: multiItemCount 1')
}

// 4. Two qty-1 returns
{
  const r = projectEcommerceReturnIntentQuantityBrief(state([returnIntent(1), returnIntent(1)]))
  check(r.totalIntents === 2, 'two-qty1: totalIntents 2')
  check(r.singleItemCount === 2, 'two-qty1: singleItemCount 2')
  check(r.multiItemCount === 0, 'two-qty1: multiItemCount 0')
}

// 5. Two multi-item returns (different quantities)
{
  const r = projectEcommerceReturnIntentQuantityBrief(state([returnIntent(3), returnIntent(5)]))
  check(r.totalIntents === 2, 'two-multi: totalIntents 2')
  check(r.singleItemCount === 0, 'two-multi: singleItemCount 0')
  check(r.multiItemCount === 2, 'two-multi: multiItemCount 2')
}

// 6. Mixed: 2 single + 1 multi
{
  const r = projectEcommerceReturnIntentQuantityBrief(state([
    returnIntent(1),
    returnIntent(4),
    returnIntent(1),
  ]))
  check(r.totalIntents === 3, 'mixed: totalIntents 3')
  check(r.singleItemCount === 2, 'mixed: singleItemCount 2')
  check(r.multiItemCount === 1, 'mixed: multiItemCount 1')
  check(r.singleItemCount + r.multiItemCount === r.totalIntents, 'mixed: counts sum to total')
}

// 7. All multi-item (qty >= 2)
{
  const r = projectEcommerceReturnIntentQuantityBrief(state([
    returnIntent(2),
    returnIntent(10),
    returnIntent(3),
  ]))
  check(r.totalIntents === 3, 'all-multi: totalIntents 3')
  check(r.singleItemCount === 0, 'all-multi: singleItemCount 0')
  check(r.multiItemCount === 3, 'all-multi: multiItemCount 3')
  check(r.singleItemCount + r.multiItemCount === r.totalIntents, 'all-multi: counts sum to total')
}

console.log(`ecommerce-return-intent-quantity-brief: ${checks} checks passed`)
