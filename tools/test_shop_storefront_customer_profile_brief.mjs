// Shop storefront customer profile brief: customerProfile presence on v2 requests.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopStorefrontCustomerProfileBrief } from './shop-storefront-customer-profile-brief.ts'`,
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

const { projectShopStorefrontCustomerProfileBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let reqId = 0
function v1Req() {
  reqId++
  return {
    schema: 'supermega.ecommerce.order_request.v1',
    mode: 'browser-local-request',
    state: 'pending_shop_review',
    id: `req-${reqId}`,
    idempotencyKey: `idem-${reqId}`,
    createdAt: '2026-08-11T10:00:00Z',
    sourcePreviewDigest: 'digest',
    customerReference: `cust-${reqId}`,
    fulfilment: 'pickup',
    currency: 'MMK',
    line: { sku: 'SKU-1', name: 'Item', variant: null, quantity: 1, unitPriceMmk: 1000 },
    totalMmk: 1000,
  }
}

let profId = 0
function profile(id) {
  return {
    schema: 'supermega.ecommerce.customer_profile_snapshot.v1',
    id: id ?? `prof-${++profId}`,
    revision: 1,
    name: 'Mg Mg',
    phone: '+95 9123456',
    savedAt: '2026-08-11T09:00:00Z',
    previousDigest: null,
    profileDigest: 'pdigest',
  }
}

function v2Req({ customerProfile } = {}) {
  reqId++
  return {
    schema: 'supermega.ecommerce.order_request.v2',
    mode: 'browser-local-request',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `req-${reqId}`,
    idempotencyKey: `idem-${reqId}`,
    createdAt: '2026-08-11T10:00:00Z',
    sourcePreviewDigest: 'digest',
    sourceStorefrontRevision: 1,
    sourceStorefrontActionId: 'act-1',
    customerReference: `cust-${reqId}`,
    ...(customerProfile !== undefined && { customerProfile }),
    deliveryAddress: null,
    fulfilment: 'pickup',
    currency: 'MMK',
    lines: [{ sku: 'SKU-1', name: 'Item', variant: null, quantity: 1, unitPriceMmk: 1000, lineTotalMmk: 1000 }],
    quote: {
      schema: 'supermega.ecommerce.checkout_quote.v1',
      scope: 'scope-1',
      quoteId: `quote-${reqId}`,
      idempotencyKey: `qidem-${reqId}`,
      quotedAt: '2026-08-11T09:00:00Z',
      expiresAt: '2026-08-11T10:00:00Z',
      sourcePreviewDigest: 'digest',
      pimDigest: 'pim',
      currency: 'MMK',
      customerReference: `cust-${reqId}`,
      fulfilment: 'pickup',
      lines: [{ sku: 'SKU-1', name: 'Item', variant: null, quantity: 1, unitPriceMmk: 1000, lineTotalMmk: 1000 }],
      subtotalMmk: 1000,
      promotion: { adapter: 'shop_promotion_review', status: 'not_requested', code: null, amountMmk: 0 },
      tax: { adapter: 'price_inclusive', status: 'included', amountMmk: 0 },
      shipping: { adapter: 'pickup', status: 'included', amountMmk: 0 },
      payment: { adapter: 'pay_on_pickup', status: 'not_authorized', amountMmk: 0 },
      totalMmk: 1000,
      quoteDigest: 'qdigest',
    },
    totalMmk: 1000,
  }
}

function state(storefrontRequests) {
  return {
    schema: 'supermega.shop.commerce.v1',
    items: [],
    orders: [],
    movements: [],
    closes: [],
    catalogBaselines: [],
    catalogChanges: [],
    promotionPolicies: [],
    shippingPolicies: [],
    paymentPolicies: [],
    websiteIntakes: [],
    storefrontRequests: storefrontRequests ?? [],
    purchaseBudgetEnvelopes: [],
    supplierSourcingDecisions: [],
    purchaseOrders: [],
  }
}

// 1. Empty → all zeros
{
  const r = projectShopStorefrontCustomerProfileBrief(state([]))
  check(r.totalRequests === 0, 'empty: totalRequests 0')
  check(r.v1Requests === 0, 'empty: v1Requests 0')
  check(r.v2Requests === 0, 'empty: v2Requests 0')
  check(r.requestsWithProfile === 0, 'empty: requestsWithProfile 0')
  check(r.requestsWithoutProfile === 0, 'empty: requestsWithoutProfile 0')
  check(r.profileCoverage === 0, 'empty: profileCoverage 0')
  check(r.uniqueProfileIds === 0, 'empty: uniqueProfileIds 0')
}

// 2. Only v1 requests → no profiles possible
{
  const r = projectShopStorefrontCustomerProfileBrief(state([v1Req(), v1Req()]))
  check(r.totalRequests === 2, 'v1-only: totalRequests 2')
  check(r.v1Requests === 2, 'v1-only: v1Requests 2')
  check(r.v2Requests === 0, 'v1-only: v2Requests 0')
  check(r.requestsWithProfile === 0, 'v1-only: requestsWithProfile 0')
  check(r.profileCoverage === 0, 'v1-only: profileCoverage 0 (no v2 requests)')
  check(r.uniqueProfileIds === 0, 'v1-only: uniqueProfileIds 0')
}

// 3. v2 request with profile
{
  const r = projectShopStorefrontCustomerProfileBrief(state([v2Req({ customerProfile: profile() })]))
  check(r.v2Requests === 1, 'v2-with-profile: v2Requests 1')
  check(r.requestsWithProfile === 1, 'v2-with-profile: requestsWithProfile 1')
  check(r.requestsWithoutProfile === 0, 'v2-with-profile: requestsWithoutProfile 0')
  check(r.profileCoverage === 100, 'v2-with-profile: profileCoverage 100')
  check(r.uniqueProfileIds === 1, 'v2-with-profile: uniqueProfileIds 1')
}

// 4. v2 request without profile
{
  const r = projectShopStorefrontCustomerProfileBrief(state([v2Req()]))
  check(r.v2Requests === 1, 'v2-no-profile: v2Requests 1')
  check(r.requestsWithProfile === 0, 'v2-no-profile: requestsWithProfile 0')
  check(r.requestsWithoutProfile === 1, 'v2-no-profile: requestsWithoutProfile 1')
  check(r.profileCoverage === 0, 'v2-no-profile: profileCoverage 0')
  check(r.uniqueProfileIds === 0, 'v2-no-profile: uniqueProfileIds 0')
}

// 5. Mixed v1 + v2, some with profile
{
  const prof1 = profile('prof-A')
  const r = projectShopStorefrontCustomerProfileBrief(state([
    v1Req(),
    v2Req({ customerProfile: prof1 }),
    v2Req(),
  ]))
  check(r.totalRequests === 3, 'mixed: totalRequests 3')
  check(r.v1Requests === 1, 'mixed: v1Requests 1')
  check(r.v2Requests === 2, 'mixed: v2Requests 2')
  check(r.requestsWithProfile === 1, 'mixed: requestsWithProfile 1')
  check(r.requestsWithoutProfile === 1, 'mixed: requestsWithoutProfile 1')
  check(r.profileCoverage === 50, 'mixed: profileCoverage 50 (1/2)')
  check(r.uniqueProfileIds === 1, 'mixed: uniqueProfileIds 1')
}

// 6. Same profile ID on two requests → uniqueProfileIds = 1
{
  const sharedProfile = profile('shared-id')
  const r = projectShopStorefrontCustomerProfileBrief(state([
    v2Req({ customerProfile: sharedProfile }),
    v2Req({ customerProfile: sharedProfile }),
  ]))
  check(r.requestsWithProfile === 2, 'dedup: requestsWithProfile 2')
  check(r.uniqueProfileIds === 1, 'dedup: uniqueProfileIds 1 (same profile ID)')
}

// 7. Two different profile IDs
{
  const r = projectShopStorefrontCustomerProfileBrief(state([
    v2Req({ customerProfile: profile('id-X') }),
    v2Req({ customerProfile: profile('id-Y') }),
  ]))
  check(r.uniqueProfileIds === 2, 'two-profiles: uniqueProfileIds 2')
  check(r.profileCoverage === 100, 'two-profiles: profileCoverage 100')
}

// 8. profileCoverage rounds — 2 of 3 v2 with profile = 67%
{
  const r = projectShopStorefrontCustomerProfileBrief(state([
    v2Req({ customerProfile: profile() }),
    v2Req({ customerProfile: profile() }),
    v2Req(),
  ]))
  check(r.profileCoverage === 67, 'round-67pct: profileCoverage 67')
}

console.log(JSON.stringify({ ok: true, checks }))
