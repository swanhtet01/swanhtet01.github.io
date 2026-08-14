import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceReturnIntentEvidenceReferenceBrief } from './ecommerce-return-intent-evidence-reference-brief.ts'`,
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

const { projectEcommerceReturnIntentEvidenceReferenceBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function returnIntent(evidenceReference = 'ev-default') {
  intentId++
  return {
    schema: 'supermega.ecommerce.return_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `RI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sku: `SKU-${intentId}`,
    quantity: 1,
    disposition: 'return_to_stock',
    reason: 'Defective item',
    refundStatus: 'not_started',
    evidenceReference,
  }
}

function state(returnIntents = []) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: 0,
    headDigest: 'hd-1',
    requests: [],
    returnIntents,
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
  const r = projectEcommerceReturnIntentEvidenceReferenceBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.uniqueReferences === 0, 'empty: uniqueReferences 0')
  check(r.topReference === null, 'empty: topReference null')
  check(r.topReferenceCount === 0, 'empty: topReferenceCount 0')
}

// 2. Single intent — one unique reference
{
  const r = projectEcommerceReturnIntentEvidenceReferenceBrief(state([returnIntent('ECOMMERCE-RETURN:A')]))
  check(r.totalIntents === 1, 'single: totalIntents 1')
  check(r.uniqueReferences === 1, 'single: uniqueReferences 1')
  check(r.topReference === 'ECOMMERCE-RETURN:A', 'single: topReference')
  check(r.topReferenceCount === 1, 'single: topReferenceCount 1')
}

// 3. Two intents with same reference — uniqueReferences 1, topCount 2
{
  const r = projectEcommerceReturnIntentEvidenceReferenceBrief(state([
    returnIntent('ECOMMERCE-RETURN:B'),
    returnIntent('ECOMMERCE-RETURN:B'),
  ]))
  check(r.totalIntents === 2, 'same-ref: totalIntents 2')
  check(r.uniqueReferences === 1, 'same-ref: uniqueReferences 1')
  check(r.topReference === 'ECOMMERCE-RETURN:B', 'same-ref: topReference')
  check(r.topReferenceCount === 2, 'same-ref: topReferenceCount 2')
}

// 4. Two intents different references — uniqueReferences 2
{
  const r = projectEcommerceReturnIntentEvidenceReferenceBrief(state([
    returnIntent('ECOMMERCE-RETURN:C'),
    returnIntent('ECOMMERCE-RETURN:D'),
  ]))
  check(r.totalIntents === 2, 'two-diff: totalIntents 2')
  check(r.uniqueReferences === 2, 'two-diff: uniqueReferences 2')
  check(r.topReferenceCount === 1, 'two-diff: topReferenceCount 1')
  check(r.topReference !== null, 'two-diff: topReference set')
}

// 5. Three intents: one reference appears twice — dominant topReference
{
  const r = projectEcommerceReturnIntentEvidenceReferenceBrief(state([
    returnIntent('ECOMMERCE-RETURN:E'),
    returnIntent('ECOMMERCE-RETURN:F'),
    returnIntent('ECOMMERCE-RETURN:E'),
  ]))
  check(r.totalIntents === 3, 'dominant: totalIntents 3')
  check(r.uniqueReferences === 2, 'dominant: uniqueReferences 2')
  check(r.topReference === 'ECOMMERCE-RETURN:E', 'dominant: topReference')
  check(r.topReferenceCount === 2, 'dominant: topReferenceCount 2')
}

// 6. Three intents all different — uniqueReferences 3, topCount 1
{
  const r = projectEcommerceReturnIntentEvidenceReferenceBrief(state([
    returnIntent('ECOMMERCE-RETURN:G'),
    returnIntent('ECOMMERCE-RETURN:H'),
    returnIntent('ECOMMERCE-RETURN:I'),
  ]))
  check(r.totalIntents === 3, 'all-diff: totalIntents 3')
  check(r.uniqueReferences === 3, 'all-diff: uniqueReferences 3')
  check(r.topReferenceCount === 1, 'all-diff: topReferenceCount 1')
}

console.log(`ecommerce-return-intent-evidence-reference-brief: ${checks} checks passed`)
