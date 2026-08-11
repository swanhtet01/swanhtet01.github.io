// Ecommerce request promotion code brief: promo code presence rate + top-5 distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRequestPromotionCodeBrief } from './ecommerce-request-promotion-code-brief.ts'`,
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

const { projectEcommerceRequestPromotionCodeBrief } = await import(
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
  const r = projectEcommerceRequestPromotionCodeBrief(state([]))
  check(r.totalRequests === 0, 'empty: totalRequests 0')
  check(r.requestsWithPromoCode === 0, 'empty: requestsWithPromoCode 0')
  check(r.promoCodePresenceRate === 0, 'empty: promoCodePresenceRate 0')
  check(r.uniquePromoCodes === 0, 'empty: uniquePromoCodes 0')
  check(r.topPromoCodesByCount.length === 0, 'empty: top empty')
}

// 2. All without promo code (null)
{
  const r = projectEcommerceRequestPromotionCodeBrief(state([req(null), req(null), req(null)]))
  check(r.totalRequests === 3, 'no-promo: totalRequests 3')
  check(r.requestsWithPromoCode === 0, 'no-promo: requestsWithPromoCode 0')
  check(r.promoCodePresenceRate === 0, 'no-promo: promoCodePresenceRate 0')
  check(r.uniquePromoCodes === 0, 'no-promo: uniquePromoCodes 0')
  check(r.topPromoCodesByCount.length === 0, 'no-promo: top empty')
}

// 3. Single request with promo code
{
  const r = projectEcommerceRequestPromotionCodeBrief(state([req('SAVE10')]))
  check(r.totalRequests === 1, 'single: totalRequests 1')
  check(r.requestsWithPromoCode === 1, 'single: requestsWithPromoCode 1')
  check(r.promoCodePresenceRate === 100, 'single: promoCodePresenceRate 100')
  check(r.uniquePromoCodes === 1, 'single: uniquePromoCodes 1')
  check(r.topPromoCodesByCount[0]?.code === 'SAVE10', 'single: top code SAVE10')
  check(r.topPromoCodesByCount[0]?.count === 1, 'single: top count 1')
}

// 4. Code distribution — same code used twice, different code once
{
  const r = projectEcommerceRequestPromotionCodeBrief(
    state([req('SAVE10'), req('SAVE10'), req('WELCOME')]),
  )
  check(r.requestsWithPromoCode === 3, 'dist: requestsWithPromoCode 3')
  check(r.uniquePromoCodes === 2, 'dist: uniquePromoCodes 2')
  check(r.topPromoCodesByCount[0]?.code === 'SAVE10', 'dist: top code SAVE10')
  check(r.topPromoCodesByCount[0]?.count === 2, 'dist: top count 2')
  check(r.topPromoCodesByCount[1]?.code === 'WELCOME', 'dist: second code WELCOME')
}

// 5. Mixed: some with promo code, some without
{
  const r = projectEcommerceRequestPromotionCodeBrief(
    state([req('SAVE10'), req(null), req('VIP20'), req(null)]),
  )
  check(r.totalRequests === 4, 'mixed: totalRequests 4')
  check(r.requestsWithPromoCode === 2, 'mixed: requestsWithPromoCode 2')
  check(r.promoCodePresenceRate === 50, 'mixed: promoCodePresenceRate 50')
  check(r.uniquePromoCodes === 2, 'mixed: uniquePromoCodes 2')
}

// 6. Presence rate rounds: 1 of 3 → 33%
{
  const r = projectEcommerceRequestPromotionCodeBrief(
    state([req('PROMO'), req(null), req(null)]),
  )
  check(r.promoCodePresenceRate === 33, 'round: promoCodePresenceRate 33')
}

// 7. Top-5 cap + tiebreak alphabetical
{
  const codes = ['ZEBRA', 'ALPHA', 'CHARLIE', 'BRAVO', 'DELTA', 'ECHO']
  const r = projectEcommerceRequestPromotionCodeBrief(state(codes.map(c => req(c))))
  check(r.topPromoCodesByCount.length === 5, 'top5: capped at 5')
  check(r.topPromoCodesByCount[0]?.code === 'ALPHA', 'top5: tiebreak ALPHA first')
}

// 8. Same code used many times
{
  const r = projectEcommerceRequestPromotionCodeBrief(
    state([req('BULK'), req('BULK'), req('BULK'), req('BULK'), req('OTHER')]),
  )
  check(r.topPromoCodesByCount[0]?.code === 'BULK', 'freq: BULK is top')
  check(r.topPromoCodesByCount[0]?.count === 4, 'freq: BULK count 4')
  check(r.uniquePromoCodes === 2, 'freq: uniquePromoCodes 2')
}

// 9. Presence rate: 2 of 3 → 67%
{
  const r = projectEcommerceRequestPromotionCodeBrief(
    state([req('A'), req('B'), req(null)]),
  )
  check(r.promoCodePresenceRate === 67, 'round2: promoCodePresenceRate 67')
}

console.log(JSON.stringify({ ok: true, checks }))
