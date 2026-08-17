// Shop sourcing decision date/actor brief: createdAt date range + approval.actor distribution across sourcing decisions.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopSourcingDecisionDateActorBrief } from './shop-sourcing-decision-date-actor-brief.ts'`,
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

const { projectShopSourcingDecisionDateActorBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'
const QUOTE = { supplier: 'SUP-1', quoteReference: 'QT-1', vendorApprovalReference: 'VA-1', unitCostMmk: 5000, deliveryAt: '2026-09-01', validUntil: '2026-08-31' }

function proof(actor) {
  return { actionId: 'ACT-1', capturedAt: '2026-08-01T09:00:00Z', actor, reason: 'Approved.', evidenceReference: 'EVD-1' }
}

let decId = 0
function decision(createdAt, approvalActor) {
  decId++
  return {
    id: `SD-${decId}`,
    createdAt,
    sku: 'SKU-1',
    quantity: 10,
    quotes: [QUOTE],
    selectedQuoteReference: 'QT-1',
    unitCostToleranceBasisPoints: 200,
    deliveryToleranceDays: 5,
    approval: proof(approvalActor),
  }
}

function state(supplierSourcingDecisions) {
  const base = { schema: SCHEMA, items: [], orders: [], movements: [], closes: [] }
  if (supplierSourcingDecisions !== undefined) base.supplierSourcingDecisions = supplierSourcingDecisions
  return base
}

// 1. No decisions → all zeros / nulls
{
  const r = projectShopSourcingDecisionDateActorBrief(state(undefined))
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.earliestCreatedAt === null, 'empty: earliestCreatedAt null')
  check(r.latestCreatedAt === null, 'empty: latestCreatedAt null')
  check(r.uniqueApprovalActors === 0, 'empty: uniqueApprovalActors 0')
  check(r.topApprovalActorsByCount.length === 0, 'empty: topApprovalActorsByCount empty')
}

// 2. Single decision → all fields populated
{
  const r = projectShopSourcingDecisionDateActorBrief(
    state([decision('2026-08-05T09:00:00Z', 'manager-1')]),
  )
  check(r.totalDecisions === 1, 'single: totalDecisions 1')
  check(r.earliestCreatedAt === '2026-08-05T09:00:00Z', 'single: earliestCreatedAt')
  check(r.latestCreatedAt === '2026-08-05T09:00:00Z', 'single: latestCreatedAt')
  check(r.uniqueApprovalActors === 1, 'single: uniqueApprovalActors 1')
  check(r.topApprovalActorsByCount[0]?.actor === 'manager-1', 'single: top actor manager-1')
}

// 3. Date ordering across multiple decisions
{
  const r = projectShopSourcingDecisionDateActorBrief(
    state([
      decision('2026-08-10T09:00:00Z', 'manager-1'),
      decision('2026-08-01T09:00:00Z', 'manager-1'),
      decision('2026-08-05T09:00:00Z', 'manager-1'),
    ]),
  )
  check(r.earliestCreatedAt === '2026-08-01T09:00:00Z', 'dates: earliestCreatedAt')
  check(r.latestCreatedAt === '2026-08-10T09:00:00Z', 'dates: latestCreatedAt')
}

// 4. Multiple actors → distribution
{
  const r = projectShopSourcingDecisionDateActorBrief(
    state([
      decision('2026-08-01T09:00:00Z', 'manager-1'),
      decision('2026-08-02T09:00:00Z', 'manager-1'),
      decision('2026-08-03T09:00:00Z', 'director-1'),
    ]),
  )
  check(r.uniqueApprovalActors === 2, 'multi-actor: uniqueApprovalActors 2')
  check(r.topApprovalActorsByCount[0]?.actor === 'manager-1', 'multi-actor: top manager-1')
  check(r.topApprovalActorsByCount[0]?.count === 2, 'multi-actor: count 2')
}

// 5. Top-5 cap
{
  const actors = ['Z-mgr', 'A-mgr', 'C-mgr', 'B-mgr', 'D-mgr', 'E-mgr']
  const r = projectShopSourcingDecisionDateActorBrief(
    state(actors.map(a => decision('2026-08-01T09:00:00Z', a))),
  )
  check(r.topApprovalActorsByCount.length === 5, 'top5: capped at 5')
  check(r.topApprovalActorsByCount[0]?.actor === 'A-mgr', 'top5: tiebreak A-mgr first')
}

console.log(JSON.stringify({ ok: true, checks }))
