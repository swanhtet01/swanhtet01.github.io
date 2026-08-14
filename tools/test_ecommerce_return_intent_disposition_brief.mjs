import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceReturnIntentDispositionBrief } from './ecommerce-return-intent-disposition-brief.ts'`,
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

const { projectEcommerceReturnIntentDispositionBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function returnIntent(disposition = 'restock') {
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
    quantity: 1,
    disposition,
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
  const r = projectEcommerceReturnIntentDispositionBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.restockCount === 0, 'empty: restockCount 0')
  check(r.notRestockedCount === 0, 'empty: notRestockedCount 0')
}

// 2. Single restock
{
  const r = projectEcommerceReturnIntentDispositionBrief(state([returnIntent('restock')]))
  check(r.totalIntents === 1, 'single-restock: totalIntents 1')
  check(r.restockCount === 1, 'single-restock: restockCount 1')
  check(r.notRestockedCount === 0, 'single-restock: notRestockedCount 0')
}

// 3. Single not_restocked
{
  const r = projectEcommerceReturnIntentDispositionBrief(state([returnIntent('not_restocked')]))
  check(r.totalIntents === 1, 'single-not-restocked: totalIntents 1')
  check(r.restockCount === 0, 'single-not-restocked: restockCount 0')
  check(r.notRestockedCount === 1, 'single-not-restocked: notRestockedCount 1')
}

// 4. Two restock
{
  const r = projectEcommerceReturnIntentDispositionBrief(state([
    returnIntent('restock'),
    returnIntent('restock'),
  ]))
  check(r.totalIntents === 2, 'two-restock: totalIntents 2')
  check(r.restockCount === 2, 'two-restock: restockCount 2')
  check(r.notRestockedCount === 0, 'two-restock: notRestockedCount 0')
}

// 5. Two not_restocked
{
  const r = projectEcommerceReturnIntentDispositionBrief(state([
    returnIntent('not_restocked'),
    returnIntent('not_restocked'),
  ]))
  check(r.totalIntents === 2, 'two-not-restocked: totalIntents 2')
  check(r.restockCount === 0, 'two-not-restocked: restockCount 0')
  check(r.notRestockedCount === 2, 'two-not-restocked: notRestockedCount 2')
}

// 6. Mixed: 2 restock + 1 not_restocked
{
  const r = projectEcommerceReturnIntentDispositionBrief(state([
    returnIntent('restock'),
    returnIntent('not_restocked'),
    returnIntent('restock'),
  ]))
  check(r.totalIntents === 3, 'mixed: totalIntents 3')
  check(r.restockCount === 2, 'mixed: restockCount 2')
  check(r.notRestockedCount === 1, 'mixed: notRestockedCount 1')
  check(r.restockCount + r.notRestockedCount === r.totalIntents, 'mixed: counts sum to total')
}

// 7. All not_restocked
{
  const r = projectEcommerceReturnIntentDispositionBrief(state([
    returnIntent('not_restocked'),
    returnIntent('not_restocked'),
    returnIntent('not_restocked'),
  ]))
  check(r.totalIntents === 3, 'all-not-restocked: totalIntents 3')
  check(r.restockCount === 0, 'all-not-restocked: restockCount 0')
  check(r.notRestockedCount === 3, 'all-not-restocked: notRestockedCount 3')
  check(r.restockCount + r.notRestockedCount === r.totalIntents, 'all-not-restocked: counts sum to total')
}

console.log(`ecommerce-return-intent-disposition-brief: ${checks} checks passed`)
