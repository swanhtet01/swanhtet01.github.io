// Ecommerce delivery address brief: geographic distribution by township.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceDeliveryAddressBrief } from './ecommerce-delivery-address-brief.ts'`,
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

const { projectEcommerceDeliveryAddressBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.ecommerce.buying.v1'
let reqId = 0

function addr(township) {
  return {
    schema: 'supermega.ecommerce.delivery-address.v1',
    id: `addr-${reqId}`,
    revision: 1,
    line1: '123 Main St',
    township,
    city: 'Yangon',
    instructions: null,
    savedAt: '2026-08-01T00:00:00Z',
    previousDigest: null,
    addressDigest: `digest-${reqId}`,
  }
}

function req(totalMmk, township) {
  reqId++
  return {
    schema: 'supermega.ecommerce.order-request.v2',
    mode: 'browser-local-request',
    state: 'pending_shop_review',
    scope: 'test-scope',
    id: `req-${reqId}`,
    idempotencyKey: `ik-${reqId}`,
    createdAt: '2026-08-11T10:00:00Z',
    sourcePreviewDigest: 'digest',
    sourceStorefrontRevision: null,
    sourceStorefrontActionId: null,
    customerReference: `cust-${reqId}`,
    fulfilment: township !== null ? 'delivery' : 'pickup',
    deliveryAddress: township !== null ? addr(township) : null,
    currency: 'MMK',
    lines: [],
    quote: { schema: 'supermega.ecommerce.quote.v1', subtotalMmk: totalMmk, totalMmk },
    totalMmk,
  }
}

function state(...requests) {
  return {
    schema: SCHEMA,
    scope: 'test-scope',
    revision: 1,
    headDigest: 'abc',
    requests,
    returnIntents: [],
    supportIntents: [],
    correctionIntents: [],
    cancellationIntents: [],
    cancellationDecisions: [],
    events: [],
  }
}

// 1. Empty → all zeros
{
  const r = projectEcommerceDeliveryAddressBrief(state())
  check(r.totalRequests === 0, 'empty: totalRequests 0')
  check(r.requestsWithDeliveryAddress === 0, 'empty: requestsWithDeliveryAddress 0')
  check(r.requestsWithoutDeliveryAddress === 0, 'empty: requestsWithoutDeliveryAddress 0')
  check(r.uniqueTownships === 0, 'empty: uniqueTownships 0')
  check(r.topTownships.length === 0, 'empty: topTownships []')
  check(r.topTownshipByValue === null, 'empty: topTownshipByValue null')
}

// 2. Request without delivery address (pickup)
{
  const r = projectEcommerceDeliveryAddressBrief(state(req(5000, null)))
  check(r.totalRequests === 1, 'no-addr: totalRequests 1')
  check(r.requestsWithoutDeliveryAddress === 1, 'no-addr: requestsWithoutDeliveryAddress 1')
  check(r.requestsWithDeliveryAddress === 0, 'no-addr: requestsWithDeliveryAddress 0')
  check(r.uniqueTownships === 0, 'no-addr: uniqueTownships 0')
}

// 3. Single delivery request
{
  const r = projectEcommerceDeliveryAddressBrief(state(req(10000, 'Hlaing')))
  check(r.requestsWithDeliveryAddress === 1, 'single: requestsWithDeliveryAddress 1')
  check(r.uniqueTownships === 1, 'single: uniqueTownships 1')
  check(r.topTownships[0].township === 'Hlaing', 'single: topTownships[0] Hlaing')
  check(r.topTownships[0].requestCount === 1, 'single: requestCount 1')
  check(r.topTownships[0].totalValueMmk === 10000, 'single: totalValueMmk 10000')
  check(r.topTownshipByValue === 'Hlaing', 'single: topTownshipByValue Hlaing')
}

// 4. Accumulation by township
{
  const r = projectEcommerceDeliveryAddressBrief(state(
    req(5000, 'Hlaing'),
    req(3000, 'Hlaing'),
  ))
  check(r.uniqueTownships === 1, 'accum: uniqueTownships 1')
  check(r.topTownships[0].requestCount === 2, 'accum: requestCount 2')
  check(r.topTownships[0].totalValueMmk === 8000, 'accum: totalValueMmk 8000')
}

// 5. Sort by requestCount desc
{
  const r = projectEcommerceDeliveryAddressBrief(state(
    req(1000, 'Bahan'),
    req(1000, 'Hlaing'),
    req(1000, 'Hlaing'),
  ))
  check(r.topTownships[0].township === 'Hlaing', 'sort-count: Hlaing first (2 requests)')
  check(r.topTownships[1].township === 'Bahan', 'sort-count: Bahan second')
}

// 6. topTownshipByValue — most valuable, not most frequent
{
  const r = projectEcommerceDeliveryAddressBrief(state(
    req(1000, 'Bahan'),
    req(1000, 'Bahan'),
    req(50000, 'Hlaing'),
  ))
  check(r.topTownships[0].township === 'Bahan', 'value-diverge: topTownships[0] Bahan (most requests)')
  check(r.topTownshipByValue === 'Hlaing', 'value-diverge: topTownshipByValue Hlaing (highest value)')
}

// 7. Top-5 cap
{
  const r = projectEcommerceDeliveryAddressBrief(state(
    req(1000, 'T1'), req(1000, 'T2'), req(1000, 'T3'),
    req(1000, 'T4'), req(1000, 'T5'), req(1000, 'T6'),
  ))
  check(r.topTownships.length === 5, 'top5-cap: topTownships capped at 5')
  check(r.uniqueTownships === 6, 'top5-cap: uniqueTownships 6')
}

// 8. Identity: with + without = total
{
  const r = projectEcommerceDeliveryAddressBrief(state(
    req(5000, 'Hlaing'),
    req(3000, null),
  ))
  check(r.totalRequests === 2, 'identity: totalRequests 2')
  check(r.requestsWithDeliveryAddress + r.requestsWithoutDeliveryAddress === r.totalRequests, 'identity: with + without = total')
}

console.log(JSON.stringify({ ok: true, checks }))
