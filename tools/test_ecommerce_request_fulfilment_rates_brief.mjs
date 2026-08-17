import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRequestFulfilmentRatesBrief } from './ecommerce-request-fulfilment-rates-brief.ts'`,
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

const { projectEcommerceRequestFulfilmentRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let reqId = 0
function req({ fulfilment = 'pickup' } = {}) {
  reqId++
  return {
    schema: 'supermega.ecommerce.order_request.v2',
    mode: 'browser-local-request',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `req-${reqId}`,
    idempotencyKey: `key-${reqId}`,
    createdAt: '2026-08-01T09:00:00Z',
    sourcePreviewDigest: 'abc',
    sourceStorefrontRevision: 1,
    sourceStorefrontActionId: 'a1',
    customerReference: 'Customer A',
    fulfilment,
    currency: 'MMK',
    lines: [],
    quote: {},
    totalMmk: 10000,
  }
}

function state(requests = []) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: 0,
    headDigest: 'hd-1',
    requests,
    returnIntents: [],
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
  const r = projectEcommerceRequestFulfilmentRatesBrief(state())
  check(r.totalRequests === 0, 'empty:totalRequests')
  check(r.deliveryCount === 0, 'empty:deliveryCount')
  check(r.deliveryRate === 0, 'empty:deliveryRate')
  check(r.pickupCount === 0, 'empty:pickupCount')
  check(r.pickupRate === 0, 'empty:pickupRate')
}

// 2. Single delivery — 3 checks
{
  const r = projectEcommerceRequestFulfilmentRatesBrief(state([req({ fulfilment: 'delivery' })]))
  check(r.totalRequests === 1, 'delivery:total')
  check(r.deliveryCount === 1, 'delivery:count')
  check(r.deliveryRate === 1, 'delivery:rate')
}

// 3. Single pickup — 3 checks
{
  const r = projectEcommerceRequestFulfilmentRatesBrief(state([req()]))
  check(r.totalRequests === 1, 'pickup:total')
  check(r.pickupCount === 1, 'pickup:count')
  check(r.pickupRate === 1, 'pickup:rate')
}

// 4. 2 delivery, 0 pickup — 3 checks
{
  const r = projectEcommerceRequestFulfilmentRatesBrief(state([
    req({ fulfilment: 'delivery' }),
    req({ fulfilment: 'delivery' }),
  ]))
  check(r.deliveryCount === 2, 'allDelivery:count')
  check(r.pickupCount === 0, 'allDelivery:pickupCount')
  check(r.deliveryRate === 1, 'allDelivery:rate')
}

// 5. 2 pickup, 0 delivery — 2 checks
{
  const r = projectEcommerceRequestFulfilmentRatesBrief(state([req(), req()]))
  check(r.pickupCount === 2, 'allPickup:count')
  check(r.deliveryCount === 0, 'allPickup:deliveryCount')
}

// 6. 1 delivery + 1 pickup — 3 checks
{
  const r = projectEcommerceRequestFulfilmentRatesBrief(state([
    req({ fulfilment: 'delivery' }),
    req(),
  ]))
  check(r.totalRequests === 2, 'half:total')
  check(r.deliveryRate === 0.5, 'half:deliveryRate')
  check(r.pickupRate === 0.5, 'half:pickupRate')
}

// 7. Precision: 1 delivery + 2 pickup (1/3 = 0.3333) — 4 checks
{
  const r = projectEcommerceRequestFulfilmentRatesBrief(state([
    req({ fulfilment: 'delivery' }),
    req(),
    req(),
  ]))
  check(r.totalRequests === 3, 'precision:total')
  check(r.deliveryCount === 1, 'precision:deliveryCount')
  check(r.deliveryRate === 0.3333, 'precision:deliveryRate')
  check(r.pickupRate === 0.6667, 'precision:pickupRate')
}

console.log(`ecommerce-request-fulfilment-rates-brief: ${checks} checks passed`)
