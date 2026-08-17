import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionEvidenceReferenceBrief } from './ecommerce-cancellation-decision-evidence-reference-brief.ts'`,
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

const { projectEcommerceCancellationDecisionEvidenceReferenceBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision(evidenceReference = 'ev-default') {
  decisionId++
  return {
    schema: 'supermega.ecommerce.cancellation_decision.v1',
    state: 'kept_by_shop',
    scope: 'scope-1',
    id: `CD-${decisionId}`,
    idempotencyKey: `ik-${decisionId}`,
    createdAt: '2026-08-01T09:00:00Z',
    intentId: `CI-${decisionId}`,
    intentDigest: `id-${decisionId}`,
    orderId: `ORD-${decisionId}`,
    sourceRequestId: `REQ-${decisionId}`,
    sourceAcknowledgementDigest: `sad-${decisionId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    totalMmk: 5000,
    actor: 'shop-owner',
    reason: 'Order confirmed by customer',
    evidenceReference,
    customerMessageSent: false,
    orderCancelled: false,
    refundStarted: false,
    providerCalled: false,
  }
}

function state(cancellationDecisions = []) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: 0,
    headDigest: 'hd-1',
    requests: [],
    returnIntents: [],
    supportIntents: [],
    correctionIntents: [],
    cancellationIntents: [],
    cancellationDecisions,
    amendmentIntents: [],
    rescheduleIntents: [],
    events: [],
  }
}

// 1. Empty state
{
  const r = projectEcommerceCancellationDecisionEvidenceReferenceBrief(state())
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.uniqueReferences === 0, 'empty: uniqueReferences 0')
  check(r.topReference === null, 'empty: topReference null')
  check(r.topReferenceCount === 0, 'empty: topReferenceCount 0')
}

// 2. Single decision — one unique reference
{
  const r = projectEcommerceCancellationDecisionEvidenceReferenceBrief(state([
    cancellationDecision('ECOMMERCE-CANCELLATION:A'),
  ]))
  check(r.totalDecisions === 1, 'single: totalDecisions 1')
  check(r.uniqueReferences === 1, 'single: uniqueReferences 1')
  check(r.topReference === 'ECOMMERCE-CANCELLATION:A', 'single: topReference')
  check(r.topReferenceCount === 1, 'single: topReferenceCount 1')
}

// 3. Two decisions with same reference — uniqueReferences 1, topCount 2
{
  const r = projectEcommerceCancellationDecisionEvidenceReferenceBrief(state([
    cancellationDecision('ECOMMERCE-CANCELLATION:B'),
    cancellationDecision('ECOMMERCE-CANCELLATION:B'),
  ]))
  check(r.totalDecisions === 2, 'same-ref: totalDecisions 2')
  check(r.uniqueReferences === 1, 'same-ref: uniqueReferences 1')
  check(r.topReference === 'ECOMMERCE-CANCELLATION:B', 'same-ref: topReference')
  check(r.topReferenceCount === 2, 'same-ref: topReferenceCount 2')
}

// 4. Two decisions different references — uniqueReferences 2
{
  const r = projectEcommerceCancellationDecisionEvidenceReferenceBrief(state([
    cancellationDecision('ECOMMERCE-CANCELLATION:C'),
    cancellationDecision('ECOMMERCE-CANCELLATION:D'),
  ]))
  check(r.totalDecisions === 2, 'two-diff: totalDecisions 2')
  check(r.uniqueReferences === 2, 'two-diff: uniqueReferences 2')
  check(r.topReferenceCount === 1, 'two-diff: topReferenceCount 1')
  check(r.topReference !== null, 'two-diff: topReference set')
}

// 5. Three decisions: one reference appears twice — dominant topReference
{
  const r = projectEcommerceCancellationDecisionEvidenceReferenceBrief(state([
    cancellationDecision('ECOMMERCE-CANCELLATION:E'),
    cancellationDecision('ECOMMERCE-CANCELLATION:F'),
    cancellationDecision('ECOMMERCE-CANCELLATION:E'),
  ]))
  check(r.totalDecisions === 3, 'dominant: totalDecisions 3')
  check(r.uniqueReferences === 2, 'dominant: uniqueReferences 2')
  check(r.topReference === 'ECOMMERCE-CANCELLATION:E', 'dominant: topReference')
  check(r.topReferenceCount === 2, 'dominant: topReferenceCount 2')
}

// 6. Three decisions all different — uniqueReferences 3, topCount 1
{
  const r = projectEcommerceCancellationDecisionEvidenceReferenceBrief(state([
    cancellationDecision('ECOMMERCE-CANCELLATION:G'),
    cancellationDecision('ECOMMERCE-CANCELLATION:H'),
    cancellationDecision('ECOMMERCE-CANCELLATION:I'),
  ]))
  check(r.totalDecisions === 3, 'all-diff: totalDecisions 3')
  check(r.uniqueReferences === 3, 'all-diff: uniqueReferences 3')
  check(r.topReferenceCount === 1, 'all-diff: topReferenceCount 1')
}

console.log(`ecommerce-cancellation-decision-evidence-reference-brief: ${checks} checks passed`)
