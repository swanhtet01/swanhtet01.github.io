import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRequestLineCountPromotionBrief } from './ecommerce-request-line-count-promotion-brief.ts'`,
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

const { projectEcommerceRequestLineCountPromotionBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let reqId = 0
function req(lineCount = 1, hasPromo = false) {
  reqId++
  const lines = Array.from({ length: lineCount }, (_, i) => ({
    sku: `SKU-${i + 1}`,
    name: `Item ${i + 1}`,
    quantity: 1,
    unitPriceMmk: 500,
    lineTotalMmk: 500,
  }))
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
    fulfilment: 'delivery',
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
      fulfilment: 'delivery',
      lines,
      subtotalMmk: 1000,
      promotion: {
        adapter: 'shop_promotion_review',
        status: hasPromo ? 'pending_shop_review' : 'not_requested',
        code: hasPromo ? 'PROMO10' : null,
        amountMmk: 0,
      },
      tax: { adapter: 'price_inclusive', status: 'included', amountMmk: 0 },
      shipping: { adapter: 'flat_rate', status: 'included', amountMmk: 0 },
      payment: { adapter: 'cash_on_delivery', status: 'not_authorized', amountMmk: 0 },
      totalMmk: 1000,
      quoteDigest: `qd-${reqId}`,
    },
    totalMmk: 1000,
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

// 1. Empty state
{
  const r = projectEcommerceRequestLineCountPromotionBrief(state())
  check(r.totalRequests === 0, 'empty: totalRequests 0')
  check(r.singleWithPromoCount === 0, 'empty: singleWithPromoCount 0')
  check(r.multiWithoutPromoCount === 0, 'empty: multiWithoutPromoCount 0')
}

// 2. Single line without promo
{
  const r = projectEcommerceRequestLineCountPromotionBrief(state([
    req(1, false),
  ]))
  check(r.totalRequests === 1, 'single-no-promo: totalRequests 1')
  check(r.singleWithoutPromoCount === 1, 'single-no-promo: singleWithoutPromoCount 1')
  check(r.singleWithPromoCount === 0, 'single-no-promo: singleWithPromoCount 0')
  check(r.multiWithoutPromoCount === 0, 'single-no-promo: multiWithoutPromoCount 0')
}

// 3. Single line with promo
{
  const r = projectEcommerceRequestLineCountPromotionBrief(state([
    req(1, true),
  ]))
  check(r.singleWithPromoCount === 1, 'single-promo: singleWithPromoCount 1')
  check(r.singleWithoutPromoCount === 0, 'single-promo: singleWithoutPromoCount 0')
  check(r.totalRequests === 1, 'single-promo: totalRequests 1')
  check(r.multiWithPromoCount === 0, 'single-promo: multiWithPromoCount 0')
}

// 4. Multi line without promo
{
  const r = projectEcommerceRequestLineCountPromotionBrief(state([
    req(3, false),
  ]))
  check(r.multiWithoutPromoCount === 1, 'multi-no-promo: multiWithoutPromoCount 1')
  check(r.multiWithPromoCount === 0, 'multi-no-promo: multiWithPromoCount 0')
  check(r.totalRequests === 1, 'multi-no-promo: totalRequests 1')
}

// 5. Multi line with promo
{
  const r = projectEcommerceRequestLineCountPromotionBrief(state([
    req(2, true),
  ]))
  check(r.multiWithPromoCount === 1, 'multi-promo: multiWithPromoCount 1')
  check(r.multiWithoutPromoCount === 0, 'multi-promo: multiWithoutPromoCount 0')
  check(r.totalRequests === 1, 'multi-promo: totalRequests 1')
}

// 6. All 4 cells
{
  const r = projectEcommerceRequestLineCountPromotionBrief(state([
    req(1, false),
    req(1, true),
    req(3, false),
    req(2, true),
  ]))
  check(r.totalRequests === 4, 'all-cells: totalRequests 4')
  check(r.singleWithPromoCount === 1, 'all-cells: singleWithPromoCount 1')
  check(r.multiWithoutPromoCount === 1, 'all-cells: multiWithoutPromoCount 1')
  check(r.singleCount === 2, 'all-cells: singleCount 2')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceRequestLineCountPromotionBrief(state([
    req(1, false),
    req(1, true),
    req(3, false),
    req(2, true),
  ]))
  check(r.singleWithoutPromoCount === 1, 'sub-buckets: singleWithoutPromoCount 1')
  check(r.multiWithPromoCount === 1, 'sub-buckets: multiWithPromoCount 1')
}

console.log(`ecommerce-request-line-count-promotion-brief: ${checks} checks passed`)
