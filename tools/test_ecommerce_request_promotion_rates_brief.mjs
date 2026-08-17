import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRequestPromotionRatesBrief } from './ecommerce-request-promotion-rates-brief.ts'`,
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

const { projectEcommerceRequestPromotionRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let reqId = 0
function req(promoCode = null) {
  reqId++
  const promoStatus = promoCode !== null ? 'pending_shop_review' : 'not_requested'
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
    lines: [],
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
      lines: [],
      subtotalMmk: 1000,
      promotion: { adapter: 'shop_promotion_review', status: promoStatus, code: promoCode, amountMmk: 0 },
      tax: { adapter: 'price_inclusive', status: 'included', amountMmk: 0 },
      shipping: { adapter: 'pickup', status: 'included', amountMmk: 0 },
      payment: { adapter: 'pay_on_pickup', status: 'not_authorized', amountMmk: 0 },
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

// 1. Empty state — 5 checks
{
  const r = projectEcommerceRequestPromotionRatesBrief(state())
  check(r.totalRequests === 0, 'empty:totalRequests')
  check(r.withPromotionCount === 0, 'empty:withPromotionCount')
  check(r.withPromotionRate === 0, 'empty:withPromotionRate')
  check(r.withoutPromotionCount === 0, 'empty:withoutPromotionCount')
  check(r.withoutPromotionRate === 0, 'empty:withoutPromotionRate')
}

// 2. Single request with promotion — 3 checks
{
  const r = projectEcommerceRequestPromotionRatesBrief(state([req('PROMO10')]))
  check(r.totalRequests === 1, 'withPromo:total')
  check(r.withPromotionCount === 1, 'withPromo:count')
  check(r.withPromotionRate === 1, 'withPromo:rate')
}

// 3. Single request without promotion — 3 checks
{
  const r = projectEcommerceRequestPromotionRatesBrief(state([req()]))
  check(r.totalRequests === 1, 'noPromo:total')
  check(r.withoutPromotionCount === 1, 'noPromo:count')
  check(r.withoutPromotionRate === 1, 'noPromo:rate')
}

// 4. 2 with promotion, 0 without — 2 checks
{
  const r = projectEcommerceRequestPromotionRatesBrief(state([req('A'), req('B')]))
  check(r.withPromotionCount === 2, 'allPromo:count')
  check(r.withoutPromotionCount === 0, 'allPromo:withoutCount')
}

// 5. 2 without promotion, 0 with — 2 checks
{
  const r = projectEcommerceRequestPromotionRatesBrief(state([req(), req()]))
  check(r.withPromotionCount === 0, 'allNoPromo:withCount')
  check(r.withoutPromotionCount === 2, 'allNoPromo:count')
}

// 6. 1 with + 1 without — 3 checks
{
  const r = projectEcommerceRequestPromotionRatesBrief(state([req('SUMMER'), req()]))
  check(r.totalRequests === 2, 'half:total')
  check(r.withPromotionRate === 0.5, 'half:withPromoRate')
  check(r.withoutPromotionRate === 0.5, 'half:withoutPromoRate')
}

// 7. Precision: 1 with + 2 without (1/3 = 0.3333) — 5 checks
{
  const r = projectEcommerceRequestPromotionRatesBrief(state([req('CODE1'), req(), req()]))
  check(r.totalRequests === 3, 'precision:total')
  check(r.withPromotionCount === 1, 'precision:withCount')
  check(r.withPromotionRate === 0.3333, 'precision:withRate')
  check(r.withoutPromotionCount === 2, 'precision:withoutCount')
  check(r.withoutPromotionRate === 0.6667, 'precision:withoutRate')
}

console.log(`ecommerce-request-promotion-rates-brief: ${checks} checks passed`)
