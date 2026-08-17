// Ecommerce request line count brief: total/avg/min/max lines per request + single vs multi-line split.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRequestLineCountBrief } from './ecommerce-request-line-count-brief.ts'`,
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

const { projectEcommerceRequestLineCountBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let reqId = 0
function line(sku = 'SKU-001') {
  return {
    sku,
    name: `Item ${sku}`,
    variantId: null,
    variantLabel: null,
    quantity: 1,
    unitPriceMmk: 10000,
    totalMmk: 10000,
  }
}

function request({ lineCount = 1 } = {}) {
  reqId++
  const lines = Array.from({ length: lineCount }, (_, i) => line(`SKU-${i + 1}`))
  return {
    schema: 'supermega.ecommerce.order_request.v2',
    mode: 'browser-local-request',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `REQ-${reqId}`,
    idempotencyKey: `ik-${reqId}`,
    createdAt: '2026-08-01T09:00:00Z',
    sourcePreviewDigest: `spd-${reqId}`,
    sourceStorefrontRevision: null,
    sourceStorefrontActionId: null,
    customerReference: `CUST-${reqId}`,
    fulfilment: 'pickup',
    currency: 'MMK',
    lines,
    quote: {
      schema: 'supermega.ecommerce.checkout_quote.v1',
      scope: 'scope-1',
      quoteId: `QT-${reqId}`,
      idempotencyKey: `qik-${reqId}`,
      quotedAt: '2026-08-01T09:00:00Z',
      expiresAt: '2026-08-01T09:15:00Z',
      sourcePreviewDigest: `spd-${reqId}`,
      pimDigest: `pim-${reqId}`,
      currency: 'MMK',
      customerReference: `CUST-${reqId}`,
      fulfilment: 'pickup',
      lines,
      subtotalMmk: 10000 * lineCount,
      promotion: { adapter: 'shop_promotion_review', status: 'not_requested', code: null, amountMmk: 0 },
      tax: { adapter: 'price_inclusive', status: 'included', amountMmk: 0 },
      shipping: { adapter: 'pickup', status: 'included', amountMmk: 0 },
      payment: { adapter: 'pay_on_pickup', status: 'not_authorized', amountMmk: 0 },
      totalMmk: 10000 * lineCount,
      quoteDigest: `qd-${reqId}`,
    },
    totalMmk: 10000 * lineCount,
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
  const r = projectEcommerceRequestLineCountBrief(state([]))
  check(r.totalRequests === 0, 'empty: totalRequests 0')
  check(r.totalLines === 0, 'empty: totalLines 0')
  check(r.averageLinesPerRequest === 0, 'empty: avg 0')
  check(r.minLinesPerRequest === null, 'empty: min null')
  check(r.maxLinesPerRequest === null, 'empty: max null')
  check(r.singleLineCount === 0, 'empty: singleLineCount 0')
  check(r.multiLineCount === 0, 'empty: multiLineCount 0')
}

// 2. Single request with one line
{
  const r = projectEcommerceRequestLineCountBrief(state([request({ lineCount: 1 })]))
  check(r.totalRequests === 1, 'single: totalRequests 1')
  check(r.totalLines === 1, 'single: totalLines 1')
  check(r.averageLinesPerRequest === 1, 'single: avg 1')
  check(r.minLinesPerRequest === 1, 'single: min 1')
  check(r.maxLinesPerRequest === 1, 'single: max 1')
  check(r.singleLineCount === 1, 'single: singleLineCount 1')
  check(r.multiLineCount === 0, 'single: multiLineCount 0')
  check(r.singleLineRate === 100, 'single: singleLineRate 100')
}

// 3. Multi-line request
{
  const r = projectEcommerceRequestLineCountBrief(state([request({ lineCount: 3 })]))
  check(r.totalLines === 3, 'multi: totalLines 3')
  check(r.multiLineCount === 1, 'multi: multiLineCount 1')
  check(r.singleLineCount === 0, 'multi: singleLineCount 0')
  check(r.multiLineRate === 100, 'multi: multiLineRate 100')
}

// 4. Min/max detection across requests
{
  const r = projectEcommerceRequestLineCountBrief(
    state([request({ lineCount: 1 }), request({ lineCount: 5 }), request({ lineCount: 2 })]),
  )
  check(r.minLinesPerRequest === 1, 'range: min 1')
  check(r.maxLinesPerRequest === 5, 'range: max 5')
  check(r.totalLines === 8, 'range: totalLines 8')
}

// 5. Average rounding: (1 + 2) / 2 = 1.5 → 2
{
  const r = projectEcommerceRequestLineCountBrief(
    state([request({ lineCount: 1 }), request({ lineCount: 2 })]),
  )
  check(r.averageLinesPerRequest === 2, 'round: avg 2')
}

// 6. singleLineCount + multiLineCount === totalRequests
{
  const r = projectEcommerceRequestLineCountBrief(
    state([request({ lineCount: 1 }), request({ lineCount: 3 }), request({ lineCount: 1 })]),
  )
  check(r.singleLineCount + r.multiLineCount === r.totalRequests, 'invariant: single + multi = total')
  check(r.singleLineCount === 2, 'mix: singleLineCount 2')
  check(r.multiLineCount === 1, 'mix: multiLineCount 1')
}

// 7. Rate rounding 1/3 → 33%
{
  const r = projectEcommerceRequestLineCountBrief(
    state([request({ lineCount: 1 }), request({ lineCount: 2 }), request({ lineCount: 3 })]),
  )
  check(r.singleLineRate === 33, 'rate: singleLineRate 33')
  check(r.multiLineRate === 67, 'rate: multiLineRate 67')
}

console.log(JSON.stringify({ ok: true, checks }))
