import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceDeliveryAddressLine1Brief } from './ecommerce-delivery-address-line1-brief.ts'`,
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

const { projectEcommerceDeliveryAddressLine1Brief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let reqId = 0
function addr(line1) {
  return {
    schema: 'supermega.ecommerce.delivery-address.v1',
    id: `addr-${reqId}`,
    revision: 1,
    line1,
    township: 'Hlaing',
    city: 'Yangon',
    instructions: null,
    savedAt: '2026-08-01T00:00:00Z',
    previousDigest: null,
    addressDigest: `digest-${reqId}`,
  }
}

function req({ deliveryAddress = addr('123 Main St'), totalMmk = 5000 } = {}) {
  reqId++
  return {
    schema: 'supermega.ecommerce.order-request.v2',
    mode: 'browser-local-request',
    state: 'pending_shop_review',
    scope: 'test-scope',
    id: `req-${reqId}`,
    idempotencyKey: `ik-${reqId}`,
    createdAt: '2026-08-01T10:00:00Z',
    sourcePreviewDigest: 'digest',
    sourceStorefrontRevision: null,
    sourceStorefrontActionId: null,
    customerReference: `cust-${reqId}`,
    fulfilment: deliveryAddress !== null ? 'delivery' : 'pickup',
    deliveryAddress,
    currency: 'MMK',
    lines: [],
    quote: { schema: 'supermega.ecommerce.quote.v1', subtotalMmk: totalMmk, totalMmk },
    totalMmk,
  }
}

function state(requests) {
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

// 1. Empty state
{
  const r = projectEcommerceDeliveryAddressLine1Brief(state([]))
  check(r.totalDeliveryRequests === 0, 'empty: totalDeliveryRequests 0')
  check(r.blankLine1Count === 0, 'empty: blankLine1Count 0')
  check(r.blankLine1Rate === 0, 'empty: blankLine1Rate 0')
  check(r.populatedLine1Count === 0, 'empty: populatedLine1Count 0')
  check(r.averageLine1Length === 0, 'empty: averageLine1Length 0')
  check(r.minLine1Length === null, 'empty: minLine1Length null')
  check(r.maxLine1Length === null, 'empty: maxLine1Length null')
}

// 2. Pickup only (no delivery address) — all skipped
{
  const r = projectEcommerceDeliveryAddressLine1Brief(state([
    req({ deliveryAddress: null }),
    req({ deliveryAddress: null }),
  ]))
  check(r.totalDeliveryRequests === 0, 'pickup: totalDeliveryRequests 0')
  check(r.minLine1Length === null, 'pickup: minLine1Length null')
}

// 3. Single delivery with populated line1
{
  const r = projectEcommerceDeliveryAddressLine1Brief(state([
    req({ deliveryAddress: addr('123 Main Street') }), // 15 chars
  ]))
  check(r.totalDeliveryRequests === 1, 'single: totalDeliveryRequests 1')
  check(r.blankLine1Count === 0, 'single: blankLine1Count 0')
  check(r.blankLine1Rate === 0, 'single: blankLine1Rate 0')
  check(r.populatedLine1Count === 1, 'single: populatedLine1Count 1')
  check(r.averageLine1Length === 15, 'single: averageLine1Length 15')
  check(r.minLine1Length === 15, 'single: minLine1Length 15')
  check(r.maxLine1Length === 15, 'single: maxLine1Length 15')
}

// 4. Blank line1 (data quality case)
{
  const r = projectEcommerceDeliveryAddressLine1Brief(state([
    req({ deliveryAddress: addr('') }),
  ]))
  check(r.totalDeliveryRequests === 1, 'blank-line1: totalDeliveryRequests 1')
  check(r.blankLine1Count === 1, 'blank-line1: blankLine1Count 1')
  check(r.blankLine1Rate === 100, 'blank-line1: blankLine1Rate 100')
  check(r.populatedLine1Count === 0, 'blank-line1: populatedLine1Count 0')
  check(r.minLine1Length === 0, 'blank-line1: minLine1Length 0')
}

// 5. Mixed: pickup + delivery (populated) + delivery (blank)
{
  const r = projectEcommerceDeliveryAddressLine1Brief(state([
    req({ deliveryAddress: null }),               // pickup — skip
    req({ deliveryAddress: addr('456 River Rd') }), // 10 chars
    req({ deliveryAddress: addr('') }),           // blank
    req({ deliveryAddress: addr('789 Lake Ave') }), // 11 chars
  ]))
  check(r.totalDeliveryRequests === 3, 'mixed: totalDeliveryRequests 3')
  check(r.blankLine1Count === 1, 'mixed: blankLine1Count 1')
  check(r.blankLine1Rate === 33, 'mixed: blankLine1Rate 33')
  check(r.populatedLine1Count === 2, 'mixed: populatedLine1Count 2')
  check(r.minLine1Length === 0, 'mixed: minLine1Length 0')
  check(r.maxLine1Length === 12, 'mixed: maxLine1Length 12')
  check(r.averageLine1Length === Math.round((12 + 0 + 12) / 3), 'mixed: averageLine1Length')
}

console.log(`ecommerce-delivery-address-line1-brief: ${checks} checks passed`)
