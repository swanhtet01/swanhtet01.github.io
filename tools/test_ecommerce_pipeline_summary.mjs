// Ecommerce pipeline summary: pending requests, return intents, cancellation intents.
// Tests request value aggregation, fulfilment breakdown, intent counts, date filtering.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommercePipelineSummary } from './ecommerce-pipeline-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/ecom-pipeline-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectEcommercePipelineSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.ecommerce.buying.v2'

function makeBuying(requests = [], returnIntents = [], cancellationIntents = []) {
  return {
    schema: SCHEMA,
    scope: 'test',
    revision: 1,
    headDigest: 'sha256:abc',
    requests,
    returnIntents,
    supportIntents: [],
    correctionIntents: [],
    cancellationIntents,
    cancellationDecisions: [],
    amendmentIntents: [],
    rescheduleIntents: [],
    events: [],
  }
}

function makeRequest(id, totalMmk, fulfilment = 'pickup', extra = {}) {
  return {
    schema: 'supermega.ecommerce.order-request.v2',
    mode: 'browser-local-request',
    state: 'pending_shop_review',
    scope: 'test',
    id,
    idempotencyKey: `idem-${id}`,
    createdAt: '2026-08-11T10:00:00.000Z',
    sourcePreviewDigest: 'sha256:abc',
    sourceStorefrontRevision: null,
    sourceStorefrontActionId: null,
    customerReference: 'CUST-001',
    fulfilment,
    currency: 'MMK',
    lines: [],
    quote: { lines: [], discountMmk: 0, subtotalMmk: totalMmk, totalMmk, deliveryMmk: 0 },
    totalMmk,
    ...extra,
  }
}

function makeReturn(id, extra = {}) {
  return {
    schema: 'supermega.ecommerce.return-intent.v1',
    state: 'pending_shop_review',
    scope: 'test',
    id,
    idempotencyKey: `ret-${id}`,
    createdAt: '2026-08-11T10:00:00.000Z',
    orderId: 'ORD-001',
    sourceRequestId: 'REQ-001',
    sourceAcknowledgementDigest: 'sha256:abc',
    totalMmk: 1000,
    reason: 'damaged',
    disposition: 'restock',
    returnStarted: false,
    evidenceReference: 'E-001',
    ...extra,
  }
}

function makeCancel(id, extra = {}) {
  return {
    schema: 'supermega.ecommerce.cancellation-intent.v1',
    state: 'pending_shop_review',
    scope: 'test',
    id,
    idempotencyKey: `can-${id}`,
    createdAt: '2026-08-11T10:00:00.000Z',
    orderId: 'ORD-001',
    sourceRequestId: 'REQ-001',
    sourceAcknowledgementDigest: 'sha256:abc',
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    totalMmk: 1000,
    reasonCode: 'changed_mind',
    reason: 'No longer needed',
    customerMessageSent: false,
    orderCancelled: false,
    refundStarted: false,
    evidenceReference: 'E-001',
    ...extra,
  }
}

// 1. Empty state → all zeros
{
  const r = projectEcommercePipelineSummary(makeBuying())
  check(r.totalRequests === 0, 'totalRequests = 0 for empty state')
  check(r.totalRequestValueMmk === 0, 'totalRequestValueMmk = 0 for empty state')
  check(r.averageRequestValueMmk === 0, 'averageRequestValueMmk = 0 for empty state')
  check(Object.keys(r.byFulfilment).length === 0, 'byFulfilment empty for empty state')
  check(r.pendingReturnIntents === 0, 'pendingReturnIntents = 0 for empty state')
  check(r.pendingCancellationIntents === 0, 'pendingCancellationIntents = 0 for empty state')
}

// 2. Single pickup request
{
  const r = projectEcommercePipelineSummary(makeBuying([makeRequest('REQ-001', 5000, 'pickup')]))
  check(r.totalRequests === 1, 'totalRequests = 1')
  check(r.totalRequestValueMmk === 5000, 'totalRequestValueMmk = 5000')
  check(r.averageRequestValueMmk === 5000, 'averageRequestValueMmk = 5000')
}

// 3. byFulfilment pickup classification
{
  const r = projectEcommercePipelineSummary(makeBuying([makeRequest('REQ-001', 5000, 'pickup')]))
  check(r.byFulfilment['pickup']?.count === 1, 'pickup count = 1')
  check(r.byFulfilment['pickup']?.valueMmk === 5000, 'pickup valueMmk = 5000')
}

// 4. byFulfilment delivery classification
{
  const r = projectEcommercePipelineSummary(makeBuying([makeRequest('REQ-001', 8000, 'delivery')]))
  check(r.byFulfilment['delivery']?.count === 1, 'delivery count = 1')
  check(r.byFulfilment['delivery']?.valueMmk === 8000, 'delivery valueMmk = 8000')
}

// 5. Mixed fulfilment types tracked separately
{
  const r = projectEcommercePipelineSummary(makeBuying([
    makeRequest('REQ-001', 3000, 'pickup'),
    makeRequest('REQ-002', 5000, 'delivery'),
    makeRequest('REQ-003', 2000, 'pickup'),
  ]))
  check(r.byFulfilment['pickup']?.count === 2, 'pickup count = 2')
  check(r.byFulfilment['pickup']?.valueMmk === 5000, 'pickup total value = 5000')
  check(r.byFulfilment['delivery']?.count === 1, 'delivery count = 1')
  check(r.totalRequests === 3, 'totalRequests = 3')
  check(r.totalRequestValueMmk === 10000, 'totalRequestValueMmk = 10000')
}

// 6. averageRequestValueMmk rounds correctly
{
  const r = projectEcommercePipelineSummary(makeBuying([
    makeRequest('REQ-001', 1000),
    makeRequest('REQ-002', 2000),
  ]))
  check(r.averageRequestValueMmk === 1500, 'averageRequestValueMmk = 1500 for 3000/2')
}

// 7. Pending return intents counted
{
  const r = projectEcommercePipelineSummary(makeBuying([], [makeReturn('RET-001'), makeReturn('RET-002')]))
  check(r.pendingReturnIntents === 2, 'pendingReturnIntents = 2')
}

// 8. Pending cancellation intents counted
{
  const r = projectEcommercePipelineSummary(makeBuying([], [], [makeCancel('CAN-001')]))
  check(r.pendingCancellationIntents === 1, 'pendingCancellationIntents = 1')
}

// 9. Date filter includes same-day requests
{
  const r = projectEcommercePipelineSummary(makeBuying([makeRequest('REQ-001', 5000)]), '2026-08-11')
  check(r.totalRequests === 1, 'same-day request included by date filter')
}

// 10. Date filter excludes different-day requests
{
  const r = projectEcommercePipelineSummary(makeBuying([makeRequest('REQ-001', 5000)]), '2026-08-10')
  check(r.totalRequests === 0, 'different-day request excluded by date filter')
}

// 11. Date filter applies to return intents
{
  const r = projectEcommercePipelineSummary(makeBuying([], [makeReturn('RET-001')]), '2026-08-10')
  check(r.pendingReturnIntents === 0, 'different-day return intent excluded by date filter')
}

// 12. Date filter applies to cancellation intents
{
  const r = projectEcommercePipelineSummary(makeBuying([], [], [makeCancel('CAN-001')]), '2026-08-10')
  check(r.pendingCancellationIntents === 0, 'different-day cancellation intent excluded by date filter')
}

// 13. No date filter includes all
{
  const r = projectEcommercePipelineSummary(makeBuying([
    makeRequest('REQ-001', 3000),
    makeRequest('REQ-002', 4000, 'pickup', { createdAt: '2026-08-10T10:00:00.000Z' }),
  ]))
  check(r.totalRequests === 2, 'all requests included without date filter')
  check(r.totalRequestValueMmk === 7000, 'totalRequestValueMmk includes all requests')
}

// 14. averageRequestValueMmk = 0 when no requests
{
  const r = projectEcommercePipelineSummary(makeBuying([], [makeReturn('RET-001')]))
  check(r.averageRequestValueMmk === 0, 'averageRequestValueMmk = 0 when no requests')
}

console.log(`ecommerce pipeline summary: ${checks} checks passed`)
