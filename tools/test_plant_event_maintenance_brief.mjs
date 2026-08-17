// Plant event maintenance brief: maintenanceOwner distribution + maintenanceOutcome enum + procedureCompleted rate.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEventMaintenanceBrief } from './plant-event-maintenance-brief.ts'`,
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

const { projectPlantEventMaintenanceBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let eventId = 0
function startEvent(maintenanceOwner) {
  eventId++
  return {
    id: `EVT-${eventId}`,
    actionId: `ACT-MS-${eventId}`,
    createdAt: '2026-08-01T09:00:00Z',
    actor: 'operator-1',
    kind: 'maintenance_started',
    maintenanceOwner,
    maintenanceStrategyActionId: `STRAT-${eventId}`,
    maintenanceStrategyRevision: 1,
    maintenanceProcedureReference: 'PROC-001',
    maintenancePlannedDueAt: '2026-08-10T00:00:00Z',
  }
}
function completeEvent({ maintenanceOwner, maintenanceOutcome, maintenanceProcedureCompleted, startActionId }) {
  eventId++
  return {
    id: `EVT-${eventId}`,
    actionId: `ACT-MC-${eventId}`,
    createdAt: '2026-08-02T09:00:00Z',
    actor: 'operator-1',
    kind: 'maintenance_completed',
    maintenanceStartActionId: startActionId ?? `ACT-MS-${eventId - 1}`,
    maintenanceOwner,
    maintenanceStrategyActionId: `STRAT-${eventId}`,
    maintenanceStrategyRevision: 1,
    maintenanceProcedureReference: 'PROC-001',
    maintenancePlannedDueAt: '2026-08-10T00:00:00Z',
    maintenanceOutcome,
    maintenanceProcedureCompleted,
    maintenanceReturnToService: 'recommended',
    nextDueAt: '2026-09-10T00:00:00Z',
  }
}

function state(events) {
  return { schema: 'supermega.production.workspace.v2', revision: 0, jobs: [], issues: [], machines: [], events, openingPlan: null, orderExecution: null, orderPortfolio: null, equipmentMaster: null }
}

// 1. No events → all zeros
{
  const r = projectPlantEventMaintenanceBrief(state([]))
  check(r.totalMaintenanceStartEvents === 0, 'empty: totalMaintenanceStartEvents 0')
  check(r.totalMaintenanceCompleteEvents === 0, 'empty: totalMaintenanceCompleteEvents 0')
  check(r.uniqueMaintenanceOwners === 0, 'empty: uniqueMaintenanceOwners 0')
  check(r.topMaintenanceOwnersByCount.length === 0, 'empty: top empty')
  check(r.completedOutcomeCount === 0, 'empty: completedOutcomeCount 0')
  check(r.completedWithFindingsOutcomeCount === 0, 'empty: completedWithFindingsOutcomeCount 0')
  check(r.procedureCompletedCount === 0, 'empty: procedureCompletedCount 0')
  check(r.procedureCompletionRate === 0, 'empty: procedureCompletionRate 0')
}

// 2. Only start events → no outcomes, rate 0
{
  const r = projectPlantEventMaintenanceBrief(state([startEvent('eng-1'), startEvent('eng-2')]))
  check(r.totalMaintenanceStartEvents === 2, 'starts-only: totalMaintenanceStartEvents 2')
  check(r.totalMaintenanceCompleteEvents === 0, 'starts-only: totalMaintenanceCompleteEvents 0')
  check(r.uniqueMaintenanceOwners === 2, 'starts-only: uniqueMaintenanceOwners 2')
  check(r.procedureCompletionRate === 0, 'starts-only: rate 0')
}

// 3. Single complete event with completed outcome + procedureCompleted=true
{
  const r = projectPlantEventMaintenanceBrief(
    state([completeEvent({ maintenanceOwner: 'eng-1', maintenanceOutcome: 'completed', maintenanceProcedureCompleted: true })]),
  )
  check(r.totalMaintenanceCompleteEvents === 1, 'single: totalMaintenanceCompleteEvents 1')
  check(r.completedOutcomeCount === 1, 'single: completedOutcomeCount 1')
  check(r.completedWithFindingsOutcomeCount === 0, 'single: completedWithFindingsOutcomeCount 0')
  check(r.procedureCompletedCount === 1, 'single: procedureCompletedCount 1')
  check(r.procedureCompletionRate === 100, 'single: procedureCompletionRate 100')
}

// 4. Mixed outcomes
{
  const r = projectPlantEventMaintenanceBrief(
    state([
      completeEvent({ maintenanceOwner: 'eng-1', maintenanceOutcome: 'completed', maintenanceProcedureCompleted: true }),
      completeEvent({ maintenanceOwner: 'eng-2', maintenanceOutcome: 'completed_with_findings', maintenanceProcedureCompleted: false }),
      completeEvent({ maintenanceOwner: 'eng-1', maintenanceOutcome: 'completed', maintenanceProcedureCompleted: true }),
    ]),
  )
  check(r.totalMaintenanceCompleteEvents === 3, 'mixed: totalMaintenanceCompleteEvents 3')
  check(r.completedOutcomeCount === 2, 'mixed: completedOutcomeCount 2')
  check(r.completedWithFindingsOutcomeCount === 1, 'mixed: completedWithFindingsOutcomeCount 1')
  check(r.procedureCompletedCount === 2, 'mixed: procedureCompletedCount 2')
  check(r.procedureCompletionRate === 67, 'mixed: procedureCompletionRate 67 (2/3 = 66.7 → 67)')
}

// 5. Owner distribution across start + complete events
{
  const r = projectPlantEventMaintenanceBrief(
    state([
      startEvent('eng-1'),
      startEvent('eng-1'),
      completeEvent({ maintenanceOwner: 'eng-2', maintenanceOutcome: 'completed', maintenanceProcedureCompleted: true }),
    ]),
  )
  check(r.uniqueMaintenanceOwners === 2, 'owner-dist: uniqueMaintenanceOwners 2')
  check(r.topMaintenanceOwnersByCount[0]?.owner === 'eng-1', 'owner-dist: eng-1 top')
  check(r.topMaintenanceOwnersByCount[0]?.count === 2, 'owner-dist: eng-1 count 2')
}

// 6. procedureCompleted false not counted
{
  const r = projectPlantEventMaintenanceBrief(
    state([
      completeEvent({ maintenanceOwner: 'eng-1', maintenanceOutcome: 'completed', maintenanceProcedureCompleted: false }),
      completeEvent({ maintenanceOwner: 'eng-1', maintenanceOutcome: 'completed', maintenanceProcedureCompleted: false }),
    ]),
  )
  check(r.procedureCompletedCount === 0, 'proc-false: procedureCompletedCount 0')
  check(r.procedureCompletionRate === 0, 'proc-false: procedureCompletionRate 0')
}

// 7. Top-5 owner cap + tiebreak
{
  const owners = ['Z-eng', 'A-eng', 'C-eng', 'B-eng', 'D-eng', 'E-eng']
  const r = projectPlantEventMaintenanceBrief(
    state(owners.map(o => startEvent(o))),
  )
  check(r.topMaintenanceOwnersByCount.length === 5, 'top5: capped at 5')
  check(r.topMaintenanceOwnersByCount[0]?.owner === 'A-eng', 'top5: tiebreak A-eng first')
}

console.log(JSON.stringify({ ok: true, checks }))
