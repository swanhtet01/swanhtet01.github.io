// Ecommerce request order value brief: totalMmk min / max / average / total.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRequestOrderValueBrief } from './ecommerce-request-order-value-brief.ts'`,
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

const { projectEcommerceRequestOrderValueBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let reqId = 0
function req(totalMmk = 1000) {
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
      subtotalMmk: totalMmk,
      promotion: { adapter: 'shop_promotion_review', status: 'not_requested', code: null, amountMmk: 0 },
      tax: { adapter: 'price_inclusive', status: 'included', amountMmk: 0 },
      shipping: { adapter: 'pickup', status: 'included', amountMmk: 0 },
      payment: { adapter: 'pay_on_pickup', status: 'not_authorized', amountMmk: 0 },
      totalMmk,
      quoteDigest: `qd-${reqId}`,
    },
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
  const r = projectEcommerceRequestOrderValueBrief(state([]))
  check(r.totalRequests === 0, 'empty: totalRequests 0')
  check(r.totalValueMmk === 0, 'empty: totalValueMmk 0')
  check(r.minValueMmk === null, 'empty: minValueMmk null')
  check(r.maxValueMmk === null, 'empty: maxValueMmk null')
  check(r.averageValueMmk === 0, 'empty: averageValueMmk 0')
}

// 2. Single request
{
  const r = projectEcommerceRequestOrderValueBrief(state([req(5000)]))
  check(r.totalRequests === 1, 'single: totalRequests 1')
  check(r.totalValueMmk === 5000, 'single: totalValueMmk 5000')
  check(r.minValueMmk === 5000, 'single: minValueMmk 5000')
  check(r.maxValueMmk === 5000, 'single: maxValueMmk 5000')
  check(r.averageValueMmk === 5000, 'single: averageValueMmk 5000')
}

// 3. Multiple requests — min/max detection
{
  const r = projectEcommerceRequestOrderValueBrief(state([req(1000), req(5000), req(3000)]))
  check(r.totalRequests === 3, 'multi: totalRequests 3')
  check(r.totalValueMmk === 9000, 'multi: totalValueMmk 9000')
  check(r.minValueMmk === 1000, 'multi: minValueMmk 1000')
  check(r.maxValueMmk === 5000, 'multi: maxValueMmk 5000')
  check(r.averageValueMmk === 3000, 'multi: averageValueMmk 3000')
}

// 4. Average rounds: 1000 + 2000 = 3000 / 2 = 1500 → rounds to 2000? no: 1500 rounds to 2000
// Actually Math.round(1500) = 2000? Let's check: Math.round(1500 / 2) = Math.round(750) = 750
// 1000 + 2000 = 3000 / 2 = 1500. Math.round(1500) = 1500. (no half-rounds issue here)
// Let me test odd total: 1000 + 2000 + 2001 = 5001 / 3 = 1667
{
  const r = projectEcommerceRequestOrderValueBrief(state([req(1000), req(2000), req(2001)]))
  check(r.totalValueMmk === 5001, 'avg-round: totalValueMmk 5001')
  check(r.averageValueMmk === 1667, 'avg-round: averageValueMmk 1667')
}

// 5. Min/max with ascending order
{
  const r = projectEcommerceRequestOrderValueBrief(state([req(100), req(200), req(300), req(400)]))
  check(r.minValueMmk === 100, 'asc: minValueMmk 100')
  check(r.maxValueMmk === 400, 'asc: maxValueMmk 400')
}

// 6. Min/max with descending order
{
  const r = projectEcommerceRequestOrderValueBrief(state([req(9000), req(5000), req(1000)]))
  check(r.minValueMmk === 1000, 'desc: minValueMmk 1000')
  check(r.maxValueMmk === 9000, 'desc: maxValueMmk 9000')
}

// 7. All same value
{
  const r = projectEcommerceRequestOrderValueBrief(
    state([req(2000), req(2000), req(2000)]),
  )
  check(r.minValueMmk === 2000, 'same: minValueMmk 2000')
  check(r.maxValueMmk === 2000, 'same: maxValueMmk 2000')
  check(r.averageValueMmk === 2000, 'same: averageValueMmk 2000')
  check(r.totalValueMmk === 6000, 'same: totalValueMmk 6000')
}

// 8. Average rounds: 1 + 2 = 3, /2 = 1.5 → Math.round(1.5) = 2
{
  const r = projectEcommerceRequestOrderValueBrief(state([req(1), req(2)]))
  check(r.averageValueMmk === 2, 'round-half: averageValueMmk rounds 1.5→2')
}

// 9. Zero-value request
{
  const r = projectEcommerceRequestOrderValueBrief(state([req(0), req(1000)]))
  check(r.minValueMmk === 0, 'zero: minValueMmk 0')
  check(r.maxValueMmk === 1000, 'zero: maxValueMmk 1000')
  check(r.averageValueMmk === 500, 'zero: averageValueMmk 500')
}

console.log(JSON.stringify({ ok: true, checks }))
