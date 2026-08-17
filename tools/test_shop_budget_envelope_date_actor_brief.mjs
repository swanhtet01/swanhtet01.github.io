// Shop budget envelope date/actor brief: createdAt date range + approval.actor distribution across purchase budget envelopes.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopBudgetEnvelopeDateActorBrief } from './shop-budget-envelope-date-actor-brief.ts'`,
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

const { projectShopBudgetEnvelopeDateActorBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

function proof(actor) {
  return { actionId: 'ACT-1', capturedAt: '2026-08-01T09:00:00Z', actor, reason: 'Approved.', evidenceReference: 'EVD-1' }
}

let envId = 0
function env(createdAt, approvalActor) {
  envId++
  return {
    id: `ENV-${envId}`,
    createdAt,
    budgetCode: `BC-${envId}`,
    label: `Budget ${envId}`,
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    ceilingMmk: 10000000,
    perRequisitionLimitMmk: 500000,
    approval: proof(approvalActor),
  }
}

function state(purchaseBudgetEnvelopes) {
  const base = { schema: SCHEMA, items: [], orders: [], movements: [], closes: [] }
  if (purchaseBudgetEnvelopes !== undefined) base.purchaseBudgetEnvelopes = purchaseBudgetEnvelopes
  return base
}

// 1. No envelopes → all zeros / nulls
{
  const r = projectShopBudgetEnvelopeDateActorBrief(state(undefined))
  check(r.totalEnvelopes === 0, 'empty: totalEnvelopes 0')
  check(r.earliestCreatedAt === null, 'empty: earliestCreatedAt null')
  check(r.latestCreatedAt === null, 'empty: latestCreatedAt null')
  check(r.uniqueApprovalActors === 0, 'empty: uniqueApprovalActors 0')
  check(r.topApprovalActorsByCount.length === 0, 'empty: topApprovalActorsByCount empty')
}

// 2. Single envelope → all fields populated
{
  const r = projectShopBudgetEnvelopeDateActorBrief(
    state([env('2026-08-03T09:00:00Z', 'cfo-1')]),
  )
  check(r.totalEnvelopes === 1, 'single: totalEnvelopes 1')
  check(r.earliestCreatedAt === '2026-08-03T09:00:00Z', 'single: earliestCreatedAt')
  check(r.latestCreatedAt === '2026-08-03T09:00:00Z', 'single: latestCreatedAt')
  check(r.uniqueApprovalActors === 1, 'single: uniqueApprovalActors 1')
  check(r.topApprovalActorsByCount[0]?.actor === 'cfo-1', 'single: top actor cfo-1')
}

// 3. Date ordering
{
  const r = projectShopBudgetEnvelopeDateActorBrief(
    state([
      env('2026-08-10T09:00:00Z', 'cfo-1'),
      env('2026-08-01T09:00:00Z', 'cfo-1'),
      env('2026-08-05T09:00:00Z', 'cfo-1'),
    ]),
  )
  check(r.earliestCreatedAt === '2026-08-01T09:00:00Z', 'dates: earliestCreatedAt')
  check(r.latestCreatedAt === '2026-08-10T09:00:00Z', 'dates: latestCreatedAt')
}

// 4. Multiple actors → distribution
{
  const r = projectShopBudgetEnvelopeDateActorBrief(
    state([
      env('2026-08-01T09:00:00Z', 'cfo-1'),
      env('2026-08-02T09:00:00Z', 'cfo-1'),
      env('2026-08-03T09:00:00Z', 'vp-finance-1'),
    ]),
  )
  check(r.uniqueApprovalActors === 2, 'multi-actor: uniqueApprovalActors 2')
  check(r.topApprovalActorsByCount[0]?.actor === 'cfo-1', 'multi-actor: top cfo-1')
  check(r.topApprovalActorsByCount[0]?.count === 2, 'multi-actor: count 2')
}

// 5. Top-5 cap + tiebreak
{
  const actors = ['Z-cfo', 'A-cfo', 'C-cfo', 'B-cfo', 'D-cfo', 'E-cfo']
  const r = projectShopBudgetEnvelopeDateActorBrief(
    state(actors.map(a => env('2026-08-01T09:00:00Z', a))),
  )
  check(r.topApprovalActorsByCount.length === 5, 'top5: capped at 5')
  check(r.topApprovalActorsByCount[0]?.actor === 'A-cfo', 'top5: tiebreak A-cfo first')
}

console.log(JSON.stringify({ ok: true, checks }))
