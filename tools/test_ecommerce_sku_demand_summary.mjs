// Ecommerce SKU demand summary: aggregate line items across ecommerce requests.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceSkuDemandSummary } from './ecommerce-sku-demand-summary.ts'`,
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

const { projectEcommerceSkuDemandSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.ecommerce.buying-state.v2'

function line({ sku = 'SKU-A', quantity = 1, unitPriceMmk = 10000 } = {}) {
  return { sku, name: `Item ${sku}`, variant: null, quantity, unitPriceMmk, lineTotalMmk: quantity * unitPriceMmk }
}

function request({ id = 'REQ-1', lines = [line()] } = {}) {
  return {
    schema: 'supermega.ecommerce.order-request.v2',
    mode: 'browser-local-request',
    state: 'pending_shop_review',
    scope: 'test-shop',
    id, idempotencyKey: id, createdAt: '2026-01-01T00:00:00Z',
    sourcePreviewDigest: 'abc', sourceStorefrontRevision: null, sourceStorefrontActionId: null,
    customerReference: 'CUST-1', fulfilment: { type: 'pickup' }, currency: 'MMK',
    lines, quote: { subtotalMmk: 10000, promotion: { adapter: 'shop_promotion_review', status: 'not_requested', code: null, amountMmk: 0 }, tax: { adapter: 'price_inclusive', status: 'included', amountMmk: 0 }, shipping: { adapter: 'pickup', status: 'included', amountMmk: 0 }, payment: { adapter: 'pay_on_pickup', status: 'not_authorized', amountMmk: 0 }, totalMmk: 10000, quoteDigest: 'q1' },
    totalMmk: lines.reduce((sum, l) => sum + l.lineTotalMmk, 0),
  }
}

function state(requests = []) {
  return {
    schema: SCHEMA, scope: 'test-shop', revision: 0, headDigest: 'abc',
    requests, returnIntents: [], supportIntents: [], correctionIntents: [],
    cancellationIntents: [], cancellationDecisions: [], amendmentIntents: [], rescheduleIntents: [],
  }
}

// 1. Empty state
{
  const r = projectEcommerceSkuDemandSummary(state([]))
  check(r.totalRequests === 0, 'empty: totalRequests 0')
  check(r.totalRequestLines === 0, 'empty: totalRequestLines 0')
  check(r.uniqueSkus === 0, 'empty: uniqueSkus 0')
  check(r.averageLinesPerRequest === 0, 'empty: averageLinesPerRequest 0')
  check(r.topSkusByQuantity.length === 0, 'empty: topSkusByQuantity empty')
  check(r.topSkusByRequestCount.length === 0, 'empty: topSkusByRequestCount empty')
}

// 2. Single request, single line
{
  const r = projectEcommerceSkuDemandSummary(state([
    request({ id: 'REQ-1', lines: [line({ sku: 'SKU-A', quantity: 2, unitPriceMmk: 10000 })] })
  ]))
  check(r.totalRequests === 1, 'single: totalRequests 1')
  check(r.totalRequestLines === 1, 'single: totalRequestLines 1')
  check(r.uniqueSkus === 1, 'single: uniqueSkus 1')
  check(r.averageLinesPerRequest === 1, 'single: averageLinesPerRequest 1')
  check(r.topSkusByQuantity[0].sku === 'SKU-A', 'single: topByQty[0] SKU-A')
  check(r.topSkusByQuantity[0].totalQuantityRequested === 2, 'single: totalQuantityRequested 2')
  check(r.topSkusByQuantity[0].totalRevenueMmk === 20000, 'single: totalRevenueMmk 20000')
}

// 3. One request, two lines with different SKUs
{
  const r = projectEcommerceSkuDemandSummary(state([
    request({ id: 'REQ-1', lines: [
      line({ sku: 'SKU-A', quantity: 1 }),
      line({ sku: 'SKU-B', quantity: 3 }),
    ]})
  ]))
  check(r.uniqueSkus === 2, 'two-skus: uniqueSkus 2')
  check(r.totalRequestLines === 2, 'two-skus: totalRequestLines 2')
  check(r.topSkusByQuantity[0].sku === 'SKU-B', 'two-skus: SKU-B first by quantity (3)')
}

// 4. Two requests, same SKU accumulates
{
  const r = projectEcommerceSkuDemandSummary(state([
    request({ id: 'REQ-1', lines: [line({ sku: 'SKU-A', quantity: 2 })] }),
    request({ id: 'REQ-2', lines: [line({ sku: 'SKU-A', quantity: 3 })] }),
  ]))
  check(r.totalRequests === 2, 'accum: totalRequests 2')
  check(r.uniqueSkus === 1, 'accum: uniqueSkus 1 (same SKU)')
  check(r.topSkusByQuantity[0].totalQuantityRequested === 5, 'accum: totalQuantityRequested 5')
  check(r.topSkusByQuantity[0].requestCount === 2, 'accum: requestCount 2')
}

// 5. topSkusByRequestCount — SKU in more requests wins over higher quantity
{
  const r = projectEcommerceSkuDemandSummary(state([
    request({ id: 'REQ-1', lines: [line({ sku: 'SKU-A', quantity: 10 })] }),
    request({ id: 'REQ-2', lines: [line({ sku: 'SKU-B', quantity: 1 })] }),
    request({ id: 'REQ-3', lines: [line({ sku: 'SKU-B', quantity: 1 })] }),
  ]))
  check(r.topSkusByQuantity[0].sku === 'SKU-A', 'rank: SKU-A top by quantity (10)')
  check(r.topSkusByRequestCount[0].sku === 'SKU-B', 'rank: SKU-B top by requestCount (2)')
}

// 6. averageLinesPerRequest rounds correctly (2 requests, 3 total lines → 2 rounded)
{
  const r = projectEcommerceSkuDemandSummary(state([
    request({ id: 'REQ-1', lines: [line({ sku: 'A' }), line({ sku: 'B' })] }),
    request({ id: 'REQ-2', lines: [line({ sku: 'C' })] }),
  ]))
  check(r.averageLinesPerRequest === 2, 'avg: Math.round(3/2) = 2')
}

// 7. topSkusByQuantity capped at 5
{
  const lines6 = ['A','B','C','D','E','F'].map((s, i) => line({ sku: `SKU-${s}`, quantity: i + 1 }))
  const r = projectEcommerceSkuDemandSummary(state([
    request({ id: 'REQ-1', lines: lines6 })
  ]))
  check(r.topSkusByQuantity.length === 5, 'cap5-qty: capped at 5')
  check(r.topSkusByRequestCount.length === 5, 'cap5-rc: capped at 5')
  check(r.uniqueSkus === 6, 'cap5: uniqueSkus still 6')
}

console.log(JSON.stringify({ ok: true, checks }))
