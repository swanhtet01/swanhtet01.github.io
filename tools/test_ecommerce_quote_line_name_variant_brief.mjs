// Ecommerce quote line name/variant brief: product name top-5 + variant presence rate.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceQuoteLineNameVariantBrief } from './ecommerce-quote-line-name-variant-brief.ts'`,
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

const { projectEcommerceQuoteLineNameVariantBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let reqId = 0
function line(name = 'Product A', variant = null) {
  return { sku: 'SKU-1', name, variant, quantity: 1, unitPriceMmk: 1000, lineTotalMmk: 1000 }
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
  const r = projectEcommerceQuoteLineNameVariantBrief(state([]))
  check(r.totalLines === 0, 'empty: totalLines 0')
  check(r.linesWithVariant === 0, 'empty: linesWithVariant 0')
  check(r.variantPresenceRate === 0, 'empty: variantPresenceRate 0')
  check(r.uniqueProductNames === 0, 'empty: uniqueProductNames 0')
  check(r.topProductNamesByCount.length === 0, 'empty: top names empty')
  check(r.uniqueVariants === 0, 'empty: uniqueVariants 0')
  check(r.topVariantsByCount.length === 0, 'empty: top variants empty')
}

// 2. Lines without variant
{
  const r = projectEcommerceQuoteLineNameVariantBrief(
    state([req([line('Rice', null), line('Oil', null)])]),
  )
  check(r.totalLines === 2, 'no-var: totalLines 2')
  check(r.linesWithVariant === 0, 'no-var: linesWithVariant 0')
  check(r.variantPresenceRate === 0, 'no-var: variantPresenceRate 0')
  check(r.uniqueProductNames === 2, 'no-var: uniqueProductNames 2')
  check(r.uniqueVariants === 0, 'no-var: uniqueVariants 0')
}

// 3. All lines with variant
{
  const r = projectEcommerceQuoteLineNameVariantBrief(
    state([req([line('Shirt', '500ml'), line('Shirt', '1L')])]),
  )
  check(r.totalLines === 2, 'all-var: totalLines 2')
  check(r.linesWithVariant === 2, 'all-var: linesWithVariant 2')
  check(r.variantPresenceRate === 100, 'all-var: variantPresenceRate 100')
  check(r.uniqueVariants === 2, 'all-var: uniqueVariants 2')
}

// 4. Product name distribution
{
  const r = projectEcommerceQuoteLineNameVariantBrief(
    state([
      req([line('Jasmine Rice'), line('Jasmine Rice'), line('Sunflower Oil')]),
    ]),
  )
  check(r.uniqueProductNames === 2, 'name-dist: uniqueProductNames 2')
  check(r.topProductNamesByCount[0]?.name === 'Jasmine Rice', 'name-dist: top name')
  check(r.topProductNamesByCount[0]?.count === 2, 'name-dist: top count 2')
  check(r.topProductNamesByCount[1]?.name === 'Sunflower Oil', 'name-dist: second name')
}

// 5. Variant presence rate: 1 of 3 lines has variant → 33%
{
  const r = projectEcommerceQuoteLineNameVariantBrief(
    state([req([line('A', '500ml'), line('B', null), line('C', null)])]),
  )
  check(r.variantPresenceRate === 33, 'rate-round: variantPresenceRate 33')
}

// 6. Top-5 name cap + alpha tiebreak
{
  const names = ['Zebra', 'Alpha', 'Charlie', 'Bravo', 'Delta', 'Echo']
  const r = projectEcommerceQuoteLineNameVariantBrief(
    state([req(names.map(n => line(n, null)))]),
  )
  check(r.topProductNamesByCount.length === 5, 'cap: top names capped at 5')
  check(r.topProductNamesByCount[0]?.name === 'Alpha', 'cap: Alpha first (tiebreak)')
}

// 7. Top variant distribution
{
  const r = projectEcommerceQuoteLineNameVariantBrief(
    state([req([line('P', '1kg'), line('P', '1kg'), line('P', '500g')])]),
  )
  check(r.topVariantsByCount[0]?.variant === '1kg', 'var-dist: top variant 1kg')
  check(r.topVariantsByCount[0]?.count === 2, 'var-dist: top count 2')
}

// 8. Lines across multiple requests
{
  const r = projectEcommerceQuoteLineNameVariantBrief(
    state([
      req([line('Product A', '500ml')]),
      req([line('Product A', '1L')]),
      req([line('Product B', null)]),
    ]),
  )
  check(r.totalLines === 3, 'multi-req: totalLines 3')
  check(r.linesWithVariant === 2, 'multi-req: linesWithVariant 2')
  check(r.uniqueProductNames === 2, 'multi-req: uniqueProductNames 2')
}

console.log(JSON.stringify({ ok: true, checks }))
