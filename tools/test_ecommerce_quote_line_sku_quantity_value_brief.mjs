// Ecommerce quote line sku/quantity/lineTotalMmk brief: SKU top-5 + qty bands + line value stats.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceQuoteLineSkuQuantityValueBrief } from './ecommerce-quote-line-sku-quantity-value-brief.ts'`,
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

const { projectEcommerceQuoteLineSkuQuantityValueBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let reqId = 0
function line(sku = 'SKU-1', quantity = 1, unitPriceMmk = 1000) {
  return { sku, name: 'Product', variant: null, quantity, unitPriceMmk, lineTotalMmk: unitPriceMmk * quantity }
}

function req(lines = []) {
  reqId++
  return {
    schema: 'supermega.ecommerce.order_request.v2',
    mode: 'browser-local-request',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `REQ-${reqId}`,
    idempotencyKey: `ik-${reqId}`,
    createdAt: '2026-08-01T09:00:00Z',
    sourcePreviewDigest: 'spd-1',
    sourceStorefrontRevision: null,
    sourceStorefrontActionId: null,
    customerReference: `CUST-${reqId}`,
    fulfilment: 'pickup',
    currency: 'MMK',
    lines,
    quote: {
      schema: 'supermega.ecommerce.checkout_quote.v1',
      scope: 'scope-1',
      quoteId: `QID-${reqId}`,
      idempotencyKey: `ik-q-${reqId}`,
      quotedAt: '2026-08-01T09:00:00Z',
      expiresAt: '2026-08-01T10:00:00Z',
      sourcePreviewDigest: 'spd-1',
      pimDigest: 'pim-1',
      currency: 'MMK',
      customerReference: `CUST-${reqId}`,
      fulfilment: 'pickup',
      lines,
      subtotalMmk: 1000,
      promotion: { adapter: 'shop_promotion_review', status: 'not_requested', code: null, amountMmk: 0 },
      tax: { adapter: 'price_inclusive', status: 'included', amountMmk: 0 },
      shipping: { adapter: 'pickup', status: 'included', amountMmk: 0 },
      payment: { adapter: 'pay_on_pickup', status: 'not_authorized', amountMmk: 0 },
      totalMmk: 1000,
      quoteDigest: `qd-${reqId}`,
    },
    totalMmk: 1000,
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
  const r = projectEcommerceQuoteLineSkuQuantityValueBrief(state([]))
  check(r.totalLines === 0, 'empty: totalLines 0')
  check(r.uniqueSkus === 0, 'empty: uniqueSkus 0')
  check(r.topSkusByCount.length === 0, 'empty: top empty')
  check(r.singleUnitLines === 0, 'empty: singleUnitLines 0')
  check(r.singleUnitRate === 0, 'empty: singleUnitRate 0')
  check(r.minLineTotalMmk === null, 'empty: min null')
  check(r.maxLineTotalMmk === null, 'empty: max null')
  check(r.averageLineTotalMmk === 0, 'empty: avg 0')
}

// 2. Request with no lines
{
  const r = projectEcommerceQuoteLineSkuQuantityValueBrief(state([req([])]))
  check(r.totalLines === 0, 'no-lines: totalLines 0')
  check(r.uniqueSkus === 0, 'no-lines: uniqueSkus 0')
}

// 3. Single unit line
{
  const r = projectEcommerceQuoteLineSkuQuantityValueBrief(state([req([line('SKU-A', 1, 2000)])]))
  check(r.totalLines === 1, 'single: totalLines 1')
  check(r.singleUnitLines === 1, 'single: singleUnitLines 1')
  check(r.smallBatchLines === 0, 'single: smallBatchLines 0')
  check(r.bulkLines === 0, 'single: bulkLines 0')
  check(r.singleUnitRate === 100, 'single: singleUnitRate 100')
  check(r.minLineTotalMmk === 2000, 'single: min 2000')
  check(r.maxLineTotalMmk === 2000, 'single: max 2000')
  check(r.averageLineTotalMmk === 2000, 'single: avg 2000')
}

// 4. Small batch line (qty 2–5)
{
  const r = projectEcommerceQuoteLineSkuQuantityValueBrief(state([req([line('SKU-A', 3, 1000)])]))
  check(r.smallBatchLines === 1, 'small: smallBatchLines 1')
  check(r.singleUnitLines === 0, 'small: singleUnitLines 0')
  check(r.bulkLines === 0, 'small: bulkLines 0')
}

// 5. Bulk line (qty 6+)
{
  const r = projectEcommerceQuoteLineSkuQuantityValueBrief(state([req([line('SKU-A', 10, 500)])]))
  check(r.bulkLines === 1, 'bulk: bulkLines 1')
  check(r.singleUnitLines === 0, 'bulk: singleUnitLines 0')
}

// 6. SKU frequency distribution
{
  const r = projectEcommerceQuoteLineSkuQuantityValueBrief(
    state([
      req([line('SKU-A', 1, 1000), line('SKU-A', 1, 1000), line('SKU-B', 1, 1000)]),
    ]),
  )
  check(r.uniqueSkus === 2, 'sku-dist: uniqueSkus 2')
  check(r.topSkusByCount[0]?.sku === 'SKU-A', 'sku-dist: top sku SKU-A')
  check(r.topSkusByCount[0]?.count === 2, 'sku-dist: top count 2')
  check(r.topSkusByCount[1]?.sku === 'SKU-B', 'sku-dist: second SKU-B')
}

// 7. Top-5 cap + alphabetical tiebreak
{
  const skus = ['SKU-Z', 'SKU-A', 'SKU-C', 'SKU-B', 'SKU-D', 'SKU-E']
  const r = projectEcommerceQuoteLineSkuQuantityValueBrief(
    state([req(skus.map(s => line(s, 1, 1000)))]),
  )
  check(r.topSkusByCount.length === 5, 'top5: capped at 5')
  check(r.topSkusByCount[0]?.sku === 'SKU-A', 'top5: alpha tiebreak SKU-A first')
}

// 8. lineTotalMmk min/max
{
  const r = projectEcommerceQuoteLineSkuQuantityValueBrief(
    state([req([line('SKU-A', 1, 500), line('SKU-B', 2, 3000)])]),
  )
  check(r.minLineTotalMmk === 500, 'lt: min 500')
  check(r.maxLineTotalMmk === 6000, 'lt: max 6000')
  check(r.totalLineTotalMmk === 6500, 'lt: total 6500')
}

// 9. singleUnitRate rounding: 1 single + 2 small → 33%
{
  const r = projectEcommerceQuoteLineSkuQuantityValueBrief(
    state([req([line('SKU-A', 1, 1000), line('SKU-B', 2, 1000), line('SKU-C', 3, 1000)])]),
  )
  check(r.singleUnitRate === 33, 'rate: singleUnitRate 33')
}

// 10. Multi-request cross
{
  const r = projectEcommerceQuoteLineSkuQuantityValueBrief(
    state([
      req([line('SKU-A', 1, 1000)]),
      req([line('SKU-A', 6, 500), line('SKU-B', 1, 2000)]),
    ]),
  )
  check(r.totalLines === 3, 'multi: totalLines 3')
  check(r.singleUnitLines === 2, 'multi: singleUnitLines 2')
  check(r.bulkLines === 1, 'multi: bulkLines 1')
  check(r.topSkusByCount[0]?.sku === 'SKU-A', 'multi: top sku SKU-A')
  check(r.topSkusByCount[0]?.count === 2, 'multi: SKU-A count 2')
}

console.log(JSON.stringify({ ok: true, checks }))
