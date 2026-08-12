import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRequestSourceStorefrontRevisionBrief } from './ecommerce-request-source-storefront-revision-brief.ts'`,
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

const { projectEcommerceRequestSourceStorefrontRevisionBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let requestId = 0
function ecommerceRequest(sourceStorefrontRevision = null) {
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
    sourceStorefrontRevision,
    sourceStorefrontActionId: null,
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
  const r = projectEcommerceRequestSourceStorefrontRevisionBrief(state())
  check(r.totalRequests === 0, 'empty: totalRequests 0')
  check(r.nonNullRevisionCount === 0, 'empty: nonNullRevisionCount 0')
  check(r.minSourceStorefrontRevision === null, 'empty: min null')
  check(r.maxSourceStorefrontRevision === null, 'empty: max null')
}

// 2. Single request with null revision
{
  const r = projectEcommerceRequestSourceStorefrontRevisionBrief(state([ecommerceRequest(null)]))
  check(r.totalRequests === 1, 'null-rev: totalRequests 1')
  check(r.nonNullRevisionCount === 0, 'null-rev: nonNullRevisionCount 0')
  check(r.minSourceStorefrontRevision === null, 'null-rev: min null')
  check(r.maxSourceStorefrontRevision === null, 'null-rev: max null')
}

// 3. Single request with revision 3
{
  const r = projectEcommerceRequestSourceStorefrontRevisionBrief(state([ecommerceRequest(3)]))
  check(r.totalRequests === 1, 'single-rev: totalRequests 1')
  check(r.nonNullRevisionCount === 1, 'single-rev: nonNullRevisionCount 1')
  check(r.minSourceStorefrontRevision === 3, 'single-rev: min 3')
  check(r.maxSourceStorefrontRevision === 3, 'single-rev: max 3')
}

// 4. Two requests: one null, one revision=5
{
  const r = projectEcommerceRequestSourceStorefrontRevisionBrief(state([
    ecommerceRequest(null),
    ecommerceRequest(5),
  ]))
  check(r.totalRequests === 2, 'mixed: totalRequests 2')
  check(r.nonNullRevisionCount === 1, 'mixed: nonNullRevisionCount 1')
  check(r.minSourceStorefrontRevision === 5, 'mixed: min 5')
  check(r.maxSourceStorefrontRevision === 5, 'mixed: max 5')
}

// 5. Two requests: both non-null (rev=2, rev=7)
{
  const r = projectEcommerceRequestSourceStorefrontRevisionBrief(state([
    ecommerceRequest(2),
    ecommerceRequest(7),
  ]))
  check(r.totalRequests === 2, 'two-rev: totalRequests 2')
  check(r.nonNullRevisionCount === 2, 'two-rev: nonNullRevisionCount 2')
  check(r.minSourceStorefrontRevision === 2, 'two-rev: min 2')
  check(r.maxSourceStorefrontRevision === 7, 'two-rev: max 7')
}

// 6. Three requests: rev=1, null, rev=4
{
  const r = projectEcommerceRequestSourceStorefrontRevisionBrief(state([
    ecommerceRequest(1),
    ecommerceRequest(null),
    ecommerceRequest(4),
  ]))
  check(r.nonNullRevisionCount === 2, 'three-mix: nonNullRevisionCount 2')
  check(r.minSourceStorefrontRevision === 1, 'three-mix: min 1')
  check(r.maxSourceStorefrontRevision === 4, 'three-mix: max 4')
}

console.log(`ecommerce-request-source-storefront-revision-brief: ${checks} checks passed`)
