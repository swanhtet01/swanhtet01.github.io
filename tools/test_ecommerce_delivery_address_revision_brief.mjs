import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceDeliveryAddressRevisionBrief } from './ecommerce-delivery-address-revision-brief.ts'`,
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

const { projectEcommerceDeliveryAddressRevisionBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let reqId = 0
function addr(revision = 1) {
  return {
    schema: 'supermega.ecommerce.delivery-address.v1',
    id: `addr-${reqId}`,
    revision,
    line1: '123 Main St',
    township: 'Hlaing',
    city: 'Yangon',
    instructions: null,
    savedAt: '2026-08-01T00:00:00Z',
    previousDigest: null,
    addressDigest: `digest-${reqId}`,
  }
}

function req({ deliveryAddress = addr(), totalMmk = 5000 } = {}) {
  reqId++
  return {
    schema: 'supermega.ecommerce.order-request.v2',
    mode: 'browser-local-request',
    state: 'pending_shop_review',
    scope: 'test-scope',
    id: `req-${reqId}`,
    idempotencyKey: `ik-${reqId}`,
    createdAt: '2026-08-01T10:00:00Z',
    sourcePreviewDigest: 'digest',
    sourceStorefrontRevision: null,
    sourceStorefrontActionId: null,
    customerReference: `cust-${reqId}`,
    fulfilment: deliveryAddress !== null ? 'delivery' : 'pickup',
    deliveryAddress,
    currency: 'MMK',
    lines: [],
    quote: { schema: 'supermega.ecommerce.quote.v1', subtotalMmk: totalMmk, totalMmk },
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
  const r = projectEcommerceDeliveryAddressRevisionBrief(state([]))
  check(r.totalDeliveryRequests === 0, 'empty: totalDeliveryRequests 0')
  check(r.averageRevision === 0, 'empty: averageRevision 0')
  check(r.minRevision === null, 'empty: minRevision null')
  check(r.maxRevision === null, 'empty: maxRevision null')
  check(r.revision1Count === 0, 'empty: revision1Count 0')
  check(r.revision2PlusCount === 0, 'empty: revision2PlusCount 0')
}

// 2. All pickup (null deliveryAddress) — skipped
{
  const r = projectEcommerceDeliveryAddressRevisionBrief(state([
    req({ deliveryAddress: null }),
    req({ deliveryAddress: null }),
  ]))
  check(r.totalDeliveryRequests === 0, 'pickup: totalDeliveryRequests 0')
  check(r.minRevision === null, 'pickup: minRevision null')
}

// 3. Single revision=1 (first save, no edits)
{
  const r = projectEcommerceDeliveryAddressRevisionBrief(state([
    req({ deliveryAddress: addr(1) }),
  ]))
  check(r.totalDeliveryRequests === 1, 'rev1: totalDeliveryRequests 1')
  check(r.averageRevision === 1, 'rev1: averageRevision 1')
  check(r.minRevision === 1, 'rev1: minRevision 1')
  check(r.maxRevision === 1, 'rev1: maxRevision 1')
  check(r.revision1Count === 1, 'rev1: revision1Count 1')
  check(r.revision2PlusCount === 0, 'rev1: revision2PlusCount 0')
}

// 4. Single revision=3 (edited twice)
{
  const r = projectEcommerceDeliveryAddressRevisionBrief(state([
    req({ deliveryAddress: addr(3) }),
  ]))
  check(r.totalDeliveryRequests === 1, 'rev3: totalDeliveryRequests 1')
  check(r.averageRevision === 3, 'rev3: averageRevision 3')
  check(r.minRevision === 3, 'rev3: minRevision 3')
  check(r.maxRevision === 3, 'rev3: maxRevision 3')
  check(r.revision1Count === 0, 'rev3: revision1Count 0')
  check(r.revision2PlusCount === 1, 'rev3: revision2PlusCount 1')
}

// 5. Mix: pickup + rev=1 + rev=1 + rev=4
{
  const r = projectEcommerceDeliveryAddressRevisionBrief(state([
    req({ deliveryAddress: null }),    // pickup — skip
    req({ deliveryAddress: addr(1) }), // rev=1
    req({ deliveryAddress: addr(1) }), // rev=1
    req({ deliveryAddress: addr(4) }), // rev=4
  ]))
  check(r.totalDeliveryRequests === 3, 'mix: totalDeliveryRequests 3')
  check(r.averageRevision === Math.round((1 + 1 + 4) / 3), 'mix: averageRevision 2')
  check(r.minRevision === 1, 'mix: minRevision 1')
  check(r.maxRevision === 4, 'mix: maxRevision 4')
  check(r.revision1Count === 2, 'mix: revision1Count 2')
  check(r.revision2PlusCount === 1, 'mix: revision2PlusCount 1')
}

// 6. All revision=2 (all edited at least once)
{
  const r = projectEcommerceDeliveryAddressRevisionBrief(state([
    req({ deliveryAddress: addr(2) }),
    req({ deliveryAddress: addr(2) }),
  ]))
  check(r.totalDeliveryRequests === 2, 'all-rev2: totalDeliveryRequests 2')
  check(r.revision1Count === 0, 'all-rev2: revision1Count 0')
  check(r.revision2PlusCount === 2, 'all-rev2: revision2PlusCount 2')
  check(r.averageRevision === 2, 'all-rev2: averageRevision 2')
  check(r.minRevision === 2, 'all-rev2: minRevision 2')
  check(r.maxRevision === 2, 'all-rev2: maxRevision 2')
}

// 7. High revision (customer changed address many times)
{
  const r = projectEcommerceDeliveryAddressRevisionBrief(state([
    req({ deliveryAddress: addr(10) }),
  ]))
  check(r.maxRevision === 10, 'high-rev: maxRevision 10')
  check(r.revision2PlusCount === 1, 'high-rev: revision2PlusCount 1')
  check(r.revision1Count === 0, 'high-rev: revision1Count 0')
  check(r.averageRevision === 10, 'high-rev: averageRevision 10')
}

console.log(`ecommerce-delivery-address-revision-brief: ${checks} checks passed`)
