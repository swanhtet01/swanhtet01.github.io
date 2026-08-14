// Ecommerce quote line unit price brief: unitPriceMmk min/max/avg across all lines.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceQuoteLineUnitPriceBrief } from './ecommerce-quote-line-unit-price-brief.ts'`,
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

const { projectEcommerceQuoteLineUnitPriceBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let reqId = 0
function line(unitPriceMmk = 1000, sku = 'SKU-1') {
  return { sku, name: 'Product', variant: null, quantity: 1, unitPriceMmk, lineTotalMmk: unitPriceMmk }
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
      subtotalMmk: lines.reduce((s, l) => s + l.lineTotalMmk, 0),
      promotion: { adapter: 'shop_promotion_review', status: 'not_requested', code: null, amountMmk: 0 },
      tax: { adapter: 'price_inclusive', status: 'included', amountMmk: 0 },
      shipping: { adapter: 'pickup', status: 'included', amountMmk: 0 },
      payment: { adapter: 'pay_on_pickup', status: 'not_authorized', amountMmk: 0 },
      totalMmk: lines.reduce((s, l) => s + l.lineTotalMmk, 0),
      quoteDigest: `qd-${reqId}`,
    },
    totalMmk: lines.reduce((s, l) => s + l.lineTotalMmk, 0),
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
  const r = projectEcommerceQuoteLineUnitPriceBrief(state([]))
  check(r.totalLines === 0, 'empty: totalLines 0')
  check(r.minUnitPriceMmk === null, 'empty: minUnitPriceMmk null')
  check(r.maxUnitPriceMmk === null, 'empty: maxUnitPriceMmk null')
  check(r.averageUnitPriceMmk === 0, 'empty: averageUnitPriceMmk 0')
}

// 2. Request with no lines
{
  const r = projectEcommerceQuoteLineUnitPriceBrief(state([req([])]))
  check(r.totalLines === 0, 'no-lines: totalLines 0')
  check(r.minUnitPriceMmk === null, 'no-lines: minUnitPriceMmk null')
  check(r.maxUnitPriceMmk === null, 'no-lines: maxUnitPriceMmk null')
}

// 3. Single line
{
  const r = projectEcommerceQuoteLineUnitPriceBrief(state([req([line(5000)])]))
  check(r.totalLines === 1, 'single: totalLines 1')
  check(r.minUnitPriceMmk === 5000, 'single: minUnitPriceMmk 5000')
  check(r.maxUnitPriceMmk === 5000, 'single: maxUnitPriceMmk 5000')
  check(r.averageUnitPriceMmk === 5000, 'single: averageUnitPriceMmk 5000')
}

// 4. Multiple lines in one request
{
  const r = projectEcommerceQuoteLineUnitPriceBrief(
    state([req([line(1000), line(3000), line(5000)])]),
  )
  check(r.totalLines === 3, 'multi: totalLines 3')
  check(r.minUnitPriceMmk === 1000, 'multi: minUnitPriceMmk 1000')
  check(r.maxUnitPriceMmk === 5000, 'multi: maxUnitPriceMmk 5000')
  check(r.averageUnitPriceMmk === 3000, 'multi: averageUnitPriceMmk 3000')
}

// 5. Lines across multiple requests
{
  const r = projectEcommerceQuoteLineUnitPriceBrief(
    state([req([line(2000)]), req([line(4000)]), req([line(6000)])]),
  )
  check(r.totalLines === 3, 'cross-req: totalLines 3')
  check(r.minUnitPriceMmk === 2000, 'cross-req: minUnitPriceMmk 2000')
  check(r.maxUnitPriceMmk === 6000, 'cross-req: maxUnitPriceMmk 6000')
  check(r.averageUnitPriceMmk === 4000, 'cross-req: averageUnitPriceMmk 4000')
}

// 6. Rounding: 1000 + 2001 = 3001, /2 = 1500.5 → 1501
{
  const r = projectEcommerceQuoteLineUnitPriceBrief(state([req([line(1000), line(2001)])]))
  check(r.averageUnitPriceMmk === 1501, 'round: averageUnitPriceMmk 1501')
}

// 7. Min/max in descending order
{
  const r = projectEcommerceQuoteLineUnitPriceBrief(
    state([req([line(9000), line(3000), line(500)])]),
  )
  check(r.minUnitPriceMmk === 500, 'desc: minUnitPriceMmk 500')
  check(r.maxUnitPriceMmk === 9000, 'desc: maxUnitPriceMmk 9000')
}

// 8. All same price
{
  const r = projectEcommerceQuoteLineUnitPriceBrief(
    state([req([line(2500), line(2500), line(2500)])]),
  )
  check(r.minUnitPriceMmk === 2500, 'same: minUnitPriceMmk 2500')
  check(r.maxUnitPriceMmk === 2500, 'same: maxUnitPriceMmk 2500')
  check(r.averageUnitPriceMmk === 2500, 'same: averageUnitPriceMmk 2500')
}

// 9. Zero-price line
{
  const r = projectEcommerceQuoteLineUnitPriceBrief(state([req([line(0), line(1000)])]))
  check(r.minUnitPriceMmk === 0, 'zero: minUnitPriceMmk 0')
  check(r.maxUnitPriceMmk === 1000, 'zero: maxUnitPriceMmk 1000')
  check(r.averageUnitPriceMmk === 500, 'zero: averageUnitPriceMmk 500')
}

console.log(JSON.stringify({ ok: true, checks }))
