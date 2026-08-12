import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceReturnIntentDispositionRatesBrief } from './ecommerce-return-intent-disposition-rates-brief.ts'`,
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

const { projectEcommerceReturnIntentDispositionRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function returnIntent({ disposition = 'restock' } = {}) {
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

// 1. Empty state — 5 checks
{
  const r = projectEcommerceReturnIntentDispositionRatesBrief(state())
  check(r.totalIntents === 0, 'empty:totalIntents')
  check(r.restockCount === 0, 'empty:restockCount')
  check(r.restockRate === 0, 'empty:restockRate')
  check(r.notRestockedCount === 0, 'empty:notRestockedCount')
  check(r.notRestockedRate === 0, 'empty:notRestockedRate')
}

// 2. Single restock — 3 checks
{
  const r = projectEcommerceReturnIntentDispositionRatesBrief(state([returnIntent()]))
  check(r.totalIntents === 1, 'restock:total')
  check(r.restockCount === 1, 'restock:count')
  check(r.restockRate === 1, 'restock:rate')
}

// 3. Single not_restocked — 3 checks
{
  const r = projectEcommerceReturnIntentDispositionRatesBrief(state([
    returnIntent({ disposition: 'not_restocked' }),
  ]))
  check(r.totalIntents === 1, 'notRestocked:total')
  check(r.notRestockedCount === 1, 'notRestocked:count')
  check(r.notRestockedRate === 1, 'notRestocked:rate')
}

// 4. 2 restock — 3 checks
{
  const r = projectEcommerceReturnIntentDispositionRatesBrief(state([
    returnIntent(),
    returnIntent(),
  ]))
  check(r.restockCount === 2, 'twoRestock:count')
  check(r.notRestockedCount === 0, 'twoRestock:notRestockedCount')
  check(r.restockRate === 1, 'twoRestock:rate')
}

// 5. 2 not_restocked — 2 checks
{
  const r = projectEcommerceReturnIntentDispositionRatesBrief(state([
    returnIntent({ disposition: 'not_restocked' }),
    returnIntent({ disposition: 'not_restocked' }),
  ]))
  check(r.notRestockedCount === 2, 'twoNotRestocked:count')
  check(r.restockCount === 0, 'twoNotRestocked:restockCount')
}

// 6. 1 restock + 1 not_restocked — 3 checks
{
  const r = projectEcommerceReturnIntentDispositionRatesBrief(state([
    returnIntent(),
    returnIntent({ disposition: 'not_restocked' }),
  ]))
  check(r.totalIntents === 2, 'half:total')
  check(r.restockRate === 0.5, 'half:restockRate')
  check(r.notRestockedRate === 0.5, 'half:notRestockedRate')
}

// 7. Precision: 1 restock + 2 not_restocked (1/3 = 0.3333) — 4 checks
{
  const r = projectEcommerceReturnIntentDispositionRatesBrief(state([
    returnIntent(),
    returnIntent({ disposition: 'not_restocked' }),
    returnIntent({ disposition: 'not_restocked' }),
  ]))
  check(r.totalIntents === 3, 'precision:total')
  check(r.restockCount === 1, 'precision:restockCount')
  check(r.restockRate === 0.3333, 'precision:restockRate')
  check(r.notRestockedRate === 0.6667, 'precision:notRestockedRate')
}

console.log(`ecommerce-return-intent-disposition-rates-brief: ${checks} checks passed`)
