import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRequestCustomerReferenceBrief } from './ecommerce-request-customer-reference-brief.ts'`,
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

const { projectEcommerceRequestCustomerReferenceBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let requestId = 0
function request(customerReference = 'CUST-DEFAULT') {
  requestId++
  return {
    schema: 'supermega.ecommerce.order_request_v2.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `EOR-${requestId}`,
    idempotencyKey: `ik-${requestId}`,
    createdAt: '2026-08-01T09:00:00Z',
    sourcePreviewDigest: `spd-${requestId}`,
    sourceStorefrontRevision: null,
    sourceStorefrontActionId: null,
    customerReference,
    fulfilment: 'delivery',
    currency: 'MMK',
    lines: [],
    quote: { scope: 'scope-1', quotedAt: '2026-08-01T09:00:00Z', idempotencyKey: `ik-${requestId}`, sourcePreviewDigest: `spd-${requestId}`, customerReference, customerProfile: null, deliveryAddress: null, fulfilment: 'delivery', currency: 'MMK', lines: [], taxLines: [], totalMmk: 10000 },
    totalMmk: 10000,
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
  const r = projectEcommerceRequestCustomerReferenceBrief(state())
  check(r.totalRequests === 0, 'empty: totalRequests 0')
  check(r.uniqueCustomers === 0, 'empty: uniqueCustomers 0')
  check(r.topCustomer === null, 'empty: topCustomer null')
  check(r.topCustomerCount === 0, 'empty: topCustomerCount 0')
}

// 2. Single request — one unique customer
{
  const r = projectEcommerceRequestCustomerReferenceBrief(state([request('CUST-001')]))
  check(r.totalRequests === 1, 'single: totalRequests 1')
  check(r.uniqueCustomers === 1, 'single: uniqueCustomers 1')
  check(r.topCustomer === 'CUST-001', 'single: topCustomer')
  check(r.topCustomerCount === 1, 'single: topCustomerCount 1')
}

// 3. Two requests same customer — uniqueCustomers 1, topCount 2
{
  const r = projectEcommerceRequestCustomerReferenceBrief(state([
    request('CUST-002'),
    request('CUST-002'),
  ]))
  check(r.totalRequests === 2, 'same-cust: totalRequests 2')
  check(r.uniqueCustomers === 1, 'same-cust: uniqueCustomers 1')
  check(r.topCustomer === 'CUST-002', 'same-cust: topCustomer')
  check(r.topCustomerCount === 2, 'same-cust: topCustomerCount 2')
}

// 4. Two requests different customers — uniqueCustomers 2
{
  const r = projectEcommerceRequestCustomerReferenceBrief(state([
    request('CUST-003'),
    request('CUST-004'),
  ]))
  check(r.totalRequests === 2, 'two-diff: totalRequests 2')
  check(r.uniqueCustomers === 2, 'two-diff: uniqueCustomers 2')
  check(r.topCustomerCount === 1, 'two-diff: topCustomerCount 1')
  check(r.topCustomer !== null, 'two-diff: topCustomer set')
}

// 5. Three requests: one customer dominant
{
  const r = projectEcommerceRequestCustomerReferenceBrief(state([
    request('CUST-005'),
    request('CUST-006'),
    request('CUST-005'),
  ]))
  check(r.totalRequests === 3, 'dominant: totalRequests 3')
  check(r.uniqueCustomers === 2, 'dominant: uniqueCustomers 2')
  check(r.topCustomer === 'CUST-005', 'dominant: topCustomer')
  check(r.topCustomerCount === 2, 'dominant: topCustomerCount 2')
}

// 6. Three requests all different customers
{
  const r = projectEcommerceRequestCustomerReferenceBrief(state([
    request('CUST-007'),
    request('CUST-008'),
    request('CUST-009'),
  ]))
  check(r.totalRequests === 3, 'all-diff: totalRequests 3')
  check(r.uniqueCustomers === 3, 'all-diff: uniqueCustomers 3')
  check(r.topCustomerCount === 1, 'all-diff: topCustomerCount 1')
}

console.log(`ecommerce-request-customer-reference-brief: ${checks} checks passed`)
