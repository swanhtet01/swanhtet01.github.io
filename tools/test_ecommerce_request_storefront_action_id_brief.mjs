import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRequestStorefrontActionIdBrief } from './ecommerce-request-storefront-action-id-brief.ts'`,
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

const { projectEcommerceRequestStorefrontActionIdBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let requestId = 0
function ecommerceRequest(sourceStorefrontActionId = null) {
  requestId++
  return {
    schema: 'supermega.ecommerce.order_request.v2',
    mode: 'browser-local-request',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `ECR-${requestId}`,
    idempotencyKey: `ik-${requestId}`,
    createdAt: '2026-08-01T09:00:00Z',
    sourcePreviewDigest: `spd-${requestId}`,
    sourceStorefrontRevision: null,
    sourceStorefrontActionId,
    customerReference: 'CUST-001',
    fulfilment: 'pickup',
    currency: 'MMK',
    lines: [],
    quote: {},
    totalMmk: 15000,
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
  const r = projectEcommerceRequestStorefrontActionIdBrief(state())
  check(r.totalRequests === 0, 'empty: totalRequests 0')
  check(r.trackedCount === 0, 'empty: trackedCount 0')
  check(r.uniqueActionIds === 0, 'empty: uniqueActionIds 0')
  check(r.topActionId === null, 'empty: topActionId null')
  check(r.topActionIdCount === 0, 'empty: topActionIdCount 0')
}

// 2. Single request with null action id
{
  const r = projectEcommerceRequestStorefrontActionIdBrief(state([ecommerceRequest(null)]))
  check(r.totalRequests === 1, 'null-action: totalRequests 1')
  check(r.trackedCount === 0, 'null-action: trackedCount 0')
  check(r.uniqueActionIds === 0, 'null-action: uniqueActionIds 0')
  check(r.topActionId === null, 'null-action: topActionId null')
  check(r.topActionIdCount === 0, 'null-action: topActionIdCount 0')
}

// 3. Single request with action id 'SA-001'
{
  const r = projectEcommerceRequestStorefrontActionIdBrief(state([ecommerceRequest('SA-001')]))
  check(r.totalRequests === 1, 'single-tracked: totalRequests 1')
  check(r.trackedCount === 1, 'single-tracked: trackedCount 1')
  check(r.uniqueActionIds === 1, 'single-tracked: uniqueActionIds 1')
  check(r.topActionId === 'SA-001', 'single-tracked: topActionId')
  check(r.topActionIdCount === 1, 'single-tracked: topActionIdCount 1')
}

// 4. Two requests: one null, one 'SA-002' — trackedCount 1
{
  const r = projectEcommerceRequestStorefrontActionIdBrief(state([
    ecommerceRequest(null),
    ecommerceRequest('SA-002'),
  ]))
  check(r.totalRequests === 2, 'mixed: totalRequests 2')
  check(r.trackedCount === 1, 'mixed: trackedCount 1')
  check(r.topActionId === 'SA-002', 'mixed: topActionId')
  check(r.topActionIdCount === 1, 'mixed: topActionIdCount 1')
}

// 5. Two requests both with same action id 'SA-003'
{
  const r = projectEcommerceRequestStorefrontActionIdBrief(state([
    ecommerceRequest('SA-003'),
    ecommerceRequest('SA-003'),
  ]))
  check(r.totalRequests === 2, 'same-action: totalRequests 2')
  check(r.trackedCount === 2, 'same-action: trackedCount 2')
  check(r.uniqueActionIds === 1, 'same-action: uniqueActionIds 1')
  check(r.topActionId === 'SA-003', 'same-action: topActionId')
}

console.log(`ecommerce-request-storefront-action-id-brief: ${checks} checks passed`)
