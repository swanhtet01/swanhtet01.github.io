// Ecommerce customer repeat summary: totalRequests, uniqueCustomers, repeatCustomers,
// newCustomers, averageRequestsPerCustomer, topCustomers (top 5 desc requestCount then alpha).
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCustomerRepeatSummary } from './ecommerce-customer-repeat-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/customer-repeat-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectEcommerceCustomerRepeatSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let seq = 0
function req(customerReference, totalMmk = 50_000) {
  seq++
  return {
    schema: 'supermega.ecommerce.order_request.v2',
    mode: 'browser-local-request',
    state: 'pending_shop_review',
    scope: 'scope1',
    id: `req-${seq}`,
    idempotencyKey: `key-${seq}`,
    createdAt: '2026-08-11T08:00:00.000Z',
    sourcePreviewDigest: 'digest1',
    sourceStorefrontRevision: null,
    sourceStorefrontActionId: null,
    customerReference,
    fulfilment: 'pickup',
    currency: 'MMK',
    lines: [],
    quote: {},
    totalMmk,
  }
}

function state(requests = []) {
  return { requests, returnIntents: [], supportIntents: [], correctionIntents: [], cancellationIntents: [], cancellationDecisions: [], orderAmendmentIntents: [], orderRescheduleIntents: [] }
}

// 1. Empty state → all zeros
{
  const r = projectEcommerceCustomerRepeatSummary(state())
  check(r.totalRequests === 0, 'empty: totalRequests 0')
  check(r.uniqueCustomers === 0, 'empty: uniqueCustomers 0')
  check(r.repeatCustomers === 0, 'empty: repeatCustomers 0')
  check(r.newCustomers === 0, 'empty: newCustomers 0')
  check(r.averageRequestsPerCustomer === 0, 'empty: averageRequestsPerCustomer 0')
  check(r.topCustomers.length === 0, 'empty: topCustomers empty')
}

// 2. Single request, single new customer
{
  const r = projectEcommerceCustomerRepeatSummary(state([
    req('cust-alpha'),
  ]))
  check(r.totalRequests === 1, 'single: totalRequests 1')
  check(r.uniqueCustomers === 1, 'single: uniqueCustomers 1')
  check(r.repeatCustomers === 0, 'single: repeatCustomers 0')
  check(r.newCustomers === 1, 'single: newCustomers 1')
  check(r.averageRequestsPerCustomer === 1, 'single: averageRequestsPerCustomer 1')
  check(r.topCustomers.length === 1, 'single: topCustomers 1 entry')
  check(r.topCustomers[0].customerReference === 'cust-alpha', 'single: topCustomers[0] is cust-alpha')
  check(r.topCustomers[0].requestCount === 1, 'single: requestCount 1')
}

// 3. Two distinct customers → both new
{
  const r = projectEcommerceCustomerRepeatSummary(state([
    req('cust-a'),
    req('cust-b'),
  ]))
  check(r.uniqueCustomers === 2, 'two-new: uniqueCustomers 2')
  check(r.newCustomers === 2, 'two-new: newCustomers 2')
  check(r.repeatCustomers === 0, 'two-new: repeatCustomers 0')
  check(r.averageRequestsPerCustomer === 1, 'two-new: averageRequestsPerCustomer 1')
}

// 4. Same customer twice → 1 repeat, 0 new
{
  const r = projectEcommerceCustomerRepeatSummary(state([
    req('loyal-customer'),
    req('loyal-customer'),
  ]))
  check(r.totalRequests === 2, 'repeat: totalRequests 2')
  check(r.uniqueCustomers === 1, 'repeat: uniqueCustomers 1')
  check(r.repeatCustomers === 1, 'repeat: repeatCustomers 1')
  check(r.newCustomers === 0, 'repeat: newCustomers 0')
  check(r.averageRequestsPerCustomer === 2, 'repeat: averageRequestsPerCustomer 2')
}

// 5. averageRequestsPerCustomer rounds: 5 requests, 3 customers → 5/3=1.67 → rounds to 2
{
  const r = projectEcommerceCustomerRepeatSummary(state([
    req('c-1'), req('c-1'), req('c-1'),
    req('c-2'), req('c-2'),
    req('c-3'),
  ]))
  check(r.totalRequests === 6, 'avg-round: totalRequests 6')
  check(r.uniqueCustomers === 3, 'avg-round: uniqueCustomers 3')
  check(r.repeatCustomers === 2, 'avg-round: repeatCustomers 2 (c-1 and c-2)')
  check(r.newCustomers === 1, 'avg-round: newCustomers 1 (c-3)')
  check(r.averageRequestsPerCustomer === 2, 'avg-round: Math.round(6/3)=2')
}

// 6. averageRequestsPerCustomer rounds half up: 5 requests, 2 customers → 5/2=2.5 → rounds to 3
{
  const r = projectEcommerceCustomerRepeatSummary(state([
    req('c-heavy'), req('c-heavy'), req('c-heavy'),
    req('c-light'), req('c-light'),
  ]))
  check(r.averageRequestsPerCustomer === 3, 'avg-half-up: Math.round(2.5)=3 (rounds half up)')
}

// 7. topCustomers capped at 5
{
  const r = projectEcommerceCustomerRepeatSummary(state([
    req('c-6-rank'),
    req('c-5-rank'), req('c-5-rank'),
    req('c-4-rank'), req('c-4-rank'), req('c-4-rank'),
    req('c-3-rank'), req('c-3-rank'), req('c-3-rank'), req('c-3-rank'),
    req('c-2-rank'), req('c-2-rank'), req('c-2-rank'), req('c-2-rank'), req('c-2-rank'),
    req('c-1-rank'), req('c-1-rank'), req('c-1-rank'), req('c-1-rank'), req('c-1-rank'), req('c-1-rank'),
  ]))
  check(r.uniqueCustomers === 6, 'top5-cap: uniqueCustomers 6')
  check(r.topCustomers.length === 5, 'top5-cap: topCustomers capped at 5')
  check(r.topCustomers[0].customerReference === 'c-1-rank', 'top5-cap: highest rank first (6 requests)')
  check(r.topCustomers[4].customerReference === 'c-5-rank', 'top5-cap: 5th entry (2 requests)')
}

// 8. Tie-break alpha: same requestCount → alphabetical customerReference
{
  const r = projectEcommerceCustomerRepeatSummary(state([
    req('zebra-co'), req('zebra-co'),
    req('alpha-co'), req('alpha-co'),
  ]))
  check(r.topCustomers[0].customerReference === 'alpha-co', 'tie: alpha-co first')
  check(r.topCustomers[1].customerReference === 'zebra-co', 'tie: zebra-co second')
}

// 9. Mixed: some repeat some new, requestCount accumulation
{
  const r = projectEcommerceCustomerRepeatSummary(state([
    req('vip'), req('vip'), req('vip'), req('vip'),
    req('regular'), req('regular'),
    req('first-time'),
  ]))
  check(r.totalRequests === 7, 'mixed: totalRequests 7')
  check(r.uniqueCustomers === 3, 'mixed: uniqueCustomers 3')
  check(r.repeatCustomers === 2, 'mixed: repeatCustomers 2 (vip and regular)')
  check(r.newCustomers === 1, 'mixed: newCustomers 1 (first-time)')
  check(r.topCustomers[0].customerReference === 'vip', 'mixed: vip first (4 requests)')
  check(r.topCustomers[0].requestCount === 4, 'mixed: vip requestCount 4')
  check(r.topCustomers[1].requestCount === 2, 'mixed: regular requestCount 2')
  check(r.topCustomers[2].requestCount === 1, 'mixed: first-time requestCount 1')
}

console.log(JSON.stringify({ ok: true, checks }))
