// Ecommerce delivery address city brief: unique cities + top-5 distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceDeliveryAddressCityBrief } from './ecommerce-delivery-address-city-brief.ts'`,
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

const { projectEcommerceDeliveryAddressCityBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let reqId = 0
function addr(city = 'Yangon') {
  return {
    schema: 'supermega.ecommerce.delivery_address_snapshot.v1',
    id: `ADDR-${++reqId}`,
    revision: 1,
    line1: '123 Main St',
    township: 'Hlaing',
    city,
    instructions: null,
    savedAt: '2026-08-01T00:00:00Z',
    previousDigest: null,
    addressDigest: `digest-${reqId}`,
  }
}

function req({ deliveryAddress } = {}) {
  reqId++
  const obj = {
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
      fulfilment: 'delivery',
      lines: [],
      subtotalMmk: 1000,
      promotion: { adapter: 'shop_promotion_review', status: 'not_requested', code: null, amountMmk: 0 },
      tax: { adapter: 'price_inclusive', status: 'included', amountMmk: 0 },
      shipping: { adapter: 'shop_delivery_review', status: 'pending_shop_review', amountMmk: 0 },
      payment: { adapter: 'cash_on_delivery', status: 'not_authorized', amountMmk: 0 },
      totalMmk: 1000,
      quoteDigest: `qd-${reqId}`,
    },
    totalMmk: 1000,
  }
  if (deliveryAddress !== undefined) obj.deliveryAddress = deliveryAddress
  return obj
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
  const r = projectEcommerceDeliveryAddressCityBrief(state([]))
  check(r.totalRequests === 0, 'empty: totalRequests 0')
  check(r.requestsWithDeliveryAddress === 0, 'empty: withAddr 0')
  check(r.uniqueCities === 0, 'empty: uniqueCities 0')
  check(r.topCitiesByCount.length === 0, 'empty: top empty')
}

// 2. Requests without delivery address
{
  const r = projectEcommerceDeliveryAddressCityBrief(state([req(), req()]))
  check(r.totalRequests === 2, 'no-addr: totalRequests 2')
  check(r.requestsWithDeliveryAddress === 0, 'no-addr: withAddr 0')
  check(r.uniqueCities === 0, 'no-addr: uniqueCities 0')
}

// 3. Single request with delivery address
{
  const r = projectEcommerceDeliveryAddressCityBrief(
    state([req({ deliveryAddress: addr('Yangon') })]),
  )
  check(r.totalRequests === 1, 'single: totalRequests 1')
  check(r.requestsWithDeliveryAddress === 1, 'single: withAddr 1')
  check(r.uniqueCities === 1, 'single: uniqueCities 1')
  check(r.topCitiesByCount[0]?.city === 'Yangon', 'single: top city Yangon')
  check(r.topCitiesByCount[0]?.count === 1, 'single: top count 1')
}

// 4. City distribution
{
  const r = projectEcommerceDeliveryAddressCityBrief(
    state([
      req({ deliveryAddress: addr('Yangon') }),
      req({ deliveryAddress: addr('Yangon') }),
      req({ deliveryAddress: addr('Mandalay') }),
    ]),
  )
  check(r.uniqueCities === 2, 'dist: uniqueCities 2')
  check(r.topCitiesByCount[0]?.city === 'Yangon', 'dist: top city Yangon')
  check(r.topCitiesByCount[0]?.count === 2, 'dist: Yangon count 2')
  check(r.topCitiesByCount[1]?.city === 'Mandalay', 'dist: second Mandalay')
}

// 5. null deliveryAddress counts as no address
{
  const obj = req()
  obj.deliveryAddress = null
  const r = projectEcommerceDeliveryAddressCityBrief(state([obj]))
  check(r.requestsWithDeliveryAddress === 0, 'null-addr: not counted')
  check(r.uniqueCities === 0, 'null-addr: uniqueCities 0')
}

// 6. Top-5 cap + tiebreak
{
  const cities = ['Pathein', 'Bago', 'Mawlamyine', 'Taunggyi', 'Meiktila', 'Lashio']
  const r = projectEcommerceDeliveryAddressCityBrief(
    state(cities.map(c => req({ deliveryAddress: addr(c) }))),
  )
  check(r.topCitiesByCount.length === 5, 'top5: capped at 5')
  check(r.topCitiesByCount[0]?.city === 'Bago', 'top5: tiebreak Bago first')
}

// 7. Mixed: with and without address
{
  const r = projectEcommerceDeliveryAddressCityBrief(
    state([
      req({ deliveryAddress: addr('Yangon') }),
      req(),
      req({ deliveryAddress: addr('Naypyidaw') }),
    ]),
  )
  check(r.totalRequests === 3, 'mixed: totalRequests 3')
  check(r.requestsWithDeliveryAddress === 2, 'mixed: withAddr 2')
  check(r.uniqueCities === 2, 'mixed: uniqueCities 2')
}

console.log(JSON.stringify({ ok: true, checks }))
