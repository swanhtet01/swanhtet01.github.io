// Shop order support description brief: customerDescription length stats on support cases.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderSupportDescriptionBrief } from './shop-order-support-description-brief.ts'`,
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

const { projectShopOrderSupportDescriptionBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let caseId = 0
function supportCase({ customerDescription = 'Issue with my order' } = {}) {
  caseId++
  return {
    caseId: `CASE-${caseId}`,
    sourceIntentId: `SINT-${caseId}`,
    sourceRequestId: `REQ-${caseId}`,
    customerRequestedAt: '2026-08-11T10:00:00Z',
    category: 'order_status',
    customerDescription,
    status: 'open',
    priority: 'normal',
    owner: 'support-lead',
    dueAt: '2026-08-12T10:00:00Z',
    opening: { actionId: `act-${caseId}`, capturedAt: '2026-08-11T10:00:00Z', actor: 'staff', reason: 'Opened', evidenceReference: '' },
    externalMessageSent: false,
    refundStarted: false,
  }
}

let orderId = 0
function order(supportCases = []) {
  orderId++
  return {
    id: `order-${orderId}`,
    createdAt: '2026-08-11T08:00:00Z',
    customer: `cust-${orderId}`,
    channel: 'walk-in',
    item: 'Item A',
    quantity: 1,
    unitPriceMmk: 5000,
    totalMmk: 5000,
    status: 'confirmed',
    ...(supportCases.length > 0 && { supportCases }),
  }
}

function state(orders) {
  return {
    schema: 'supermega.shop.commerce.v1',
    items: [],
    orders: orders ?? [],
    movements: [],
    closes: [],
  }
}

// 1. Empty orders → all zeros / nulls
{
  const r = projectShopOrderSupportDescriptionBrief(state([]))
  check(r.totalCases === 0, 'empty: totalCases 0')
  check(r.totalDescriptionLength === 0, 'empty: totalLength 0')
  check(r.averageDescriptionLength === 0, 'empty: avgLength 0')
  check(r.minDescriptionLength === null, 'empty: minLength null')
  check(r.maxDescriptionLength === null, 'empty: maxLength null')
}

// 2. Order with no support cases → zero
{
  const r = projectShopOrderSupportDescriptionBrief(state([order([])]))
  check(r.totalCases === 0, 'no-cases: totalCases 0')
}

// 3. Single case: verify length calculation
{
  const desc = 'My order has not arrived'
  const r = projectShopOrderSupportDescriptionBrief(state([order([supportCase({ customerDescription: desc })])]))
  check(r.totalCases === 1, 'single: totalCases 1')
  check(r.totalDescriptionLength === desc.length, `single: totalLength ${desc.length}`)
  check(r.averageDescriptionLength === desc.length, 'single: avgLength equals length')
  check(r.minDescriptionLength === desc.length, 'single: minLength equals length')
  check(r.maxDescriptionLength === desc.length, 'single: maxLength equals length')
}

// 4. Two cases: min/max/avg
{
  const short = 'Problem'     // 7 chars
  const long = 'I never received my package and it has been two weeks'  // 53 chars
  const r = projectShopOrderSupportDescriptionBrief(state([
    order([
      supportCase({ customerDescription: short }),
      supportCase({ customerDescription: long }),
    ]),
  ]))
  check(r.totalCases === 2, 'two: totalCases 2')
  check(r.totalDescriptionLength === short.length + long.length, 'two: totalLength sum')
  check(r.minDescriptionLength === short.length, 'two: minLength is short')
  check(r.maxDescriptionLength === long.length, 'two: maxLength is long')
}

// 5. Cases across multiple orders
{
  const r = projectShopOrderSupportDescriptionBrief(state([
    order([supportCase({ customerDescription: 'abc' })]),
    order([supportCase({ customerDescription: 'defg' }), supportCase({ customerDescription: 'hi' })]),
  ]))
  check(r.totalCases === 3, 'multi-order: totalCases 3')
  check(r.totalDescriptionLength === 3 + 4 + 2, 'multi-order: totalLength 9')
  check(r.averageDescriptionLength === 3, 'multi-order: avgLength 3')
  check(r.minDescriptionLength === 2, 'multi-order: minLength 2')
  check(r.maxDescriptionLength === 4, 'multi-order: maxLength 4')
}

// 6. Rounding: 10/3 → 3
{
  const r = projectShopOrderSupportDescriptionBrief(state([order([
    supportCase({ customerDescription: 'ab' }),
    supportCase({ customerDescription: 'cde' }),
    supportCase({ customerDescription: 'fghij' }),
  ])]))
  check(r.totalCases === 3, 'rounding: totalCases 3')
  check(r.totalDescriptionLength === 10, 'rounding: totalLength 10')
  check(r.averageDescriptionLength === 3, 'rounding: avgLength 3 (Math.round(10/3))')
}

console.log(JSON.stringify({ ok: true, checks }))
