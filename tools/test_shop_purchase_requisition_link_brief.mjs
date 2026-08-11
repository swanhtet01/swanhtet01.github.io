// Shop purchase requisition link brief: budgetEnvelopeId + sourceSourcingDecisionId presence rates + createdAt/expectedAt date ranges.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopPurchaseRequisitionLinkBrief } from './shop-purchase-requisition-link-brief.ts'`,
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

const { projectShopPurchaseRequisitionLinkBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'
const PROOF = { actionId: 'ACT-1', capturedAt: '2026-08-01T09:00:00Z', actor: 'buyer-1', reason: 'Approved.', evidenceReference: 'EVD-1' }
const DIGEST = 'sha256:' + 'a'.repeat(64)

let reqId = 0
function req({ createdAt = '2026-08-01T09:00:00Z', expectedAt = '2026-09-01', budgetEnvelopeId, sourceSourcingDecisionId } = {}) {
  reqId++
  const r = {
    id: `REQ-${reqId}`,
    createdAt,
    expectedAt,
    supplier: 'SUP-1',
    sku: 'SKU-1',
    quantityRequested: 100,
    unitCostMmk: 5000,
    totalMmk: 500000,
    sourceDecisionDigest: DIGEST,
    sourceReplenishmentDigest: DIGEST,
    approval: PROOF,
  }
  if (budgetEnvelopeId !== undefined) r.budgetEnvelopeId = budgetEnvelopeId
  if (sourceSourcingDecisionId !== undefined) r.sourceSourcingDecisionId = sourceSourcingDecisionId
  return r
}

function state(purchaseRequisitions) {
  const base = { schema: SCHEMA, items: [], orders: [], movements: [], closes: [] }
  if (purchaseRequisitions !== undefined) base.purchaseRequisitions = purchaseRequisitions
  return base
}

// 1. No requisitions → all zeros / nulls
{
  const r = projectShopPurchaseRequisitionLinkBrief(state(undefined))
  check(r.totalRequisitions === 0, 'empty: totalRequisitions 0')
  check(r.requisitionsWithBudgetEnvelope === 0, 'empty: requisitionsWithBudgetEnvelope 0')
  check(r.budgetEnvelopeRate === 0, 'empty: budgetEnvelopeRate 0')
  check(r.requisitionsWithSourcingDecision === 0, 'empty: requisitionsWithSourcingDecision 0')
  check(r.sourcingDecisionRate === 0, 'empty: sourcingDecisionRate 0')
  check(r.earliestCreatedAt === null, 'empty: earliestCreatedAt null')
  check(r.latestCreatedAt === null, 'empty: latestCreatedAt null')
  check(r.earliestExpectedAt === null, 'empty: earliestExpectedAt null')
  check(r.latestExpectedAt === null, 'empty: latestExpectedAt null')
}

// 2. Single requisition, no optional links → dates populated, rates 0
{
  const r = projectShopPurchaseRequisitionLinkBrief(
    state([req({ createdAt: '2026-08-05T09:00:00Z', expectedAt: '2026-09-15' })]),
  )
  check(r.totalRequisitions === 1, 'single: totalRequisitions 1')
  check(r.requisitionsWithBudgetEnvelope === 0, 'single: requisitionsWithBudgetEnvelope 0')
  check(r.budgetEnvelopeRate === 0, 'single: budgetEnvelopeRate 0')
  check(r.requisitionsWithSourcingDecision === 0, 'single: requisitionsWithSourcingDecision 0')
  check(r.sourcingDecisionRate === 0, 'single: sourcingDecisionRate 0')
  check(r.earliestCreatedAt === '2026-08-05T09:00:00Z', 'single: earliestCreatedAt')
  check(r.latestCreatedAt === '2026-08-05T09:00:00Z', 'single: latestCreatedAt')
  check(r.earliestExpectedAt === '2026-09-15', 'single: earliestExpectedAt')
  check(r.latestExpectedAt === '2026-09-15', 'single: latestExpectedAt')
}

// 3. Requisition with budgetEnvelopeId → counted + 100% rate
{
  const r = projectShopPurchaseRequisitionLinkBrief(state([req({ budgetEnvelopeId: 'ENV-1' })]))
  check(r.requisitionsWithBudgetEnvelope === 1, 'budget-link: requisitionsWithBudgetEnvelope 1')
  check(r.budgetEnvelopeRate === 100, 'budget-link: budgetEnvelopeRate 100')
}

// 4. Requisition with sourceSourcingDecisionId → counted + 100% rate
{
  const r = projectShopPurchaseRequisitionLinkBrief(
    state([req({ sourceSourcingDecisionId: 'SD-1' })]),
  )
  check(r.requisitionsWithSourcingDecision === 1, 'sourcing-link: requisitionsWithSourcingDecision 1')
  check(r.sourcingDecisionRate === 100, 'sourcing-link: sourcingDecisionRate 100')
}

// 5. Date ordering across multiple requisitions
{
  const r = projectShopPurchaseRequisitionLinkBrief(
    state([
      req({ createdAt: '2026-08-10T09:00:00Z', expectedAt: '2026-10-01' }),
      req({ createdAt: '2026-08-01T09:00:00Z', expectedAt: '2026-09-01' }),
      req({ createdAt: '2026-08-05T09:00:00Z', expectedAt: '2026-09-20' }),
    ]),
  )
  check(r.earliestCreatedAt === '2026-08-01T09:00:00Z', 'dates: earliestCreatedAt')
  check(r.latestCreatedAt === '2026-08-10T09:00:00Z', 'dates: latestCreatedAt')
}

// 6. Partial budgetEnvelopeRate: 1 of 2 → 50
{
  const r = projectShopPurchaseRequisitionLinkBrief(
    state([req({ budgetEnvelopeId: 'ENV-1' }), req()]),
  )
  check(r.budgetEnvelopeRate === 50, 'partial-budget: budgetEnvelopeRate 50')
}

// 7. Partial sourcingDecisionRate: 1 of 2 → 50
{
  const r = projectShopPurchaseRequisitionLinkBrief(
    state([req({ sourceSourcingDecisionId: 'SD-1' }), req()]),
  )
  check(r.sourcingDecisionRate === 50, 'partial-sourcing: sourcingDecisionRate 50')
}

console.log(JSON.stringify({ ok: true, checks }))
