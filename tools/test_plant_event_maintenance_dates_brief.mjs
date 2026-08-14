// Plant event maintenance dates brief: maintenanceProcedureReference + plannedDueAt/nextDueAt date ranges.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEventMaintenanceDatesBrief } from './plant-event-maintenance-dates-brief.ts'`,
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

const { projectPlantEventMaintenanceDatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let eventId = 0
function startEvent({ procedureRef, plannedDueAt } = {}) {
  eventId++
  const obj = {
    id: `EVT-${eventId}`,
    actionId: `ACT-MS-${eventId}`,
    createdAt: '2026-08-01T09:00:00Z',
    actor: 'operator-1',
    kind: 'maintenance_started',
    maintenanceOwner: 'eng-1',
    maintenanceStrategyActionId: `STRAT-${eventId}`,
    maintenanceStrategyRevision: 1,
  }
  if (procedureRef !== undefined) obj.maintenanceProcedureReference = procedureRef
  if (plannedDueAt !== undefined) obj.maintenancePlannedDueAt = plannedDueAt
  return obj
}
function completeEvent({ procedureRef, plannedDueAt, nextDueAt } = {}) {
  eventId++
  const obj = {
    id: `EVT-${eventId}`,
    actionId: `ACT-MC-${eventId}`,
    createdAt: '2026-08-02T09:00:00Z',
    actor: 'operator-1',
    kind: 'maintenance_completed',
    maintenanceStartActionId: `ACT-MS-${eventId - 1}`,
    maintenanceOwner: 'eng-1',
    maintenanceStrategyActionId: `STRAT-${eventId}`,
    maintenanceStrategyRevision: 1,
    maintenanceOutcome: 'completed',
    maintenanceProcedureCompleted: true,
    maintenanceReturnToService: 'recommended',
  }
  if (procedureRef !== undefined) obj.maintenanceProcedureReference = procedureRef
  if (plannedDueAt !== undefined) obj.maintenancePlannedDueAt = plannedDueAt
  if (nextDueAt !== undefined) obj.nextDueAt = nextDueAt
  return obj
}
function otherEvent() {
  eventId++
  return { id: `EVT-${eventId}`, actionId: `ACT-O-${eventId}`, createdAt: '2026-08-01T08:00:00Z', actor: 'worker-1', kind: 'output_recorded', quantity: 10, shiftRef: 'S1', outputKind: 'good' }
}

function state(events) {
  return { schema: 'supermega.production.workspace.v2', revision: 0, jobs: [], issues: [], machines: [], events, openingPlan: null, orderExecution: null, orderPortfolio: null, equipmentMaster: null }
}

// 1. No events → all zeros/nulls
{
  const r = projectPlantEventMaintenanceDatesBrief(state([]))
  check(r.totalMaintenanceEvents === 0, 'empty: totalMaintenanceEvents 0')
  check(r.uniqueProcedureReferences === 0, 'empty: uniqueProcedureReferences 0')
  check(r.topProcedureReferencesByCount.length === 0, 'empty: top empty')
  check(r.earliestPlannedDueAt === null, 'empty: earliestPlannedDueAt null')
  check(r.latestPlannedDueAt === null, 'empty: latestPlannedDueAt null')
  check(r.earliestNextDueAt === null, 'empty: earliestNextDueAt null')
  check(r.latestNextDueAt === null, 'empty: latestNextDueAt null')
}

// 2. Other events not counted
{
  const r = projectPlantEventMaintenanceDatesBrief(state([otherEvent(), otherEvent()]))
  check(r.totalMaintenanceEvents === 0, 'other: totalMaintenanceEvents 0')
}

// 3. Single start event with procedure reference and plannedDueAt
{
  const r = projectPlantEventMaintenanceDatesBrief(
    state([startEvent({ procedureRef: 'PROC-001', plannedDueAt: '2026-08-10T00:00:00Z' })]),
  )
  check(r.totalMaintenanceEvents === 1, 'single-start: totalMaintenanceEvents 1')
  check(r.uniqueProcedureReferences === 1, 'single-start: uniqueProcedureReferences 1')
  check(r.topProcedureReferencesByCount[0]?.reference === 'PROC-001', 'single-start: top reference PROC-001')
  check(r.earliestPlannedDueAt === '2026-08-10T00:00:00Z', 'single-start: earliestPlannedDueAt')
  check(r.latestPlannedDueAt === '2026-08-10T00:00:00Z', 'single-start: latestPlannedDueAt')
  check(r.earliestNextDueAt === null, 'single-start: earliestNextDueAt null (no complete events)')
}

// 4. Single complete event with nextDueAt
{
  const r = projectPlantEventMaintenanceDatesBrief(
    state([completeEvent({ procedureRef: 'PROC-002', plannedDueAt: '2026-08-05T00:00:00Z', nextDueAt: '2026-09-05T00:00:00Z' })]),
  )
  check(r.totalMaintenanceEvents === 1, 'single-complete: totalMaintenanceEvents 1')
  check(r.earliestPlannedDueAt === '2026-08-05T00:00:00Z', 'single-complete: earliestPlannedDueAt')
  check(r.earliestNextDueAt === '2026-09-05T00:00:00Z', 'single-complete: earliestNextDueAt')
  check(r.latestNextDueAt === '2026-09-05T00:00:00Z', 'single-complete: latestNextDueAt')
}

// 5. Date ordering across multiple events
{
  const r = projectPlantEventMaintenanceDatesBrief(
    state([
      startEvent({ plannedDueAt: '2026-08-20T00:00:00Z' }),
      startEvent({ plannedDueAt: '2026-08-01T00:00:00Z' }),
      completeEvent({ plannedDueAt: '2026-08-10T00:00:00Z', nextDueAt: '2026-09-10T00:00:00Z' }),
      completeEvent({ plannedDueAt: '2026-08-15T00:00:00Z', nextDueAt: '2026-09-01T00:00:00Z' }),
    ]),
  )
  check(r.totalMaintenanceEvents === 4, 'date-order: totalMaintenanceEvents 4')
  check(r.earliestPlannedDueAt === '2026-08-01T00:00:00Z', 'date-order: earliestPlannedDueAt')
  check(r.latestPlannedDueAt === '2026-08-20T00:00:00Z', 'date-order: latestPlannedDueAt')
  check(r.earliestNextDueAt === '2026-09-01T00:00:00Z', 'date-order: earliestNextDueAt')
  check(r.latestNextDueAt === '2026-09-10T00:00:00Z', 'date-order: latestNextDueAt')
}

// 6. Procedure reference distribution across start + complete
{
  const r = projectPlantEventMaintenanceDatesBrief(
    state([
      startEvent({ procedureRef: 'PROC-001' }),
      startEvent({ procedureRef: 'PROC-001' }),
      completeEvent({ procedureRef: 'PROC-002' }),
    ]),
  )
  check(r.uniqueProcedureReferences === 2, 'proc-dist: uniqueProcedureReferences 2')
  check(r.topProcedureReferencesByCount[0]?.reference === 'PROC-001', 'proc-dist: top PROC-001')
  check(r.topProcedureReferencesByCount[0]?.count === 2, 'proc-dist: count 2')
}

// 7. Top-5 cap + tiebreak for procedure references
{
  const refs = ['Z-PROC', 'A-PROC', 'C-PROC', 'B-PROC', 'D-PROC', 'E-PROC']
  const r = projectPlantEventMaintenanceDatesBrief(
    state(refs.map(ref => startEvent({ procedureRef: ref }))),
  )
  check(r.topProcedureReferencesByCount.length === 5, 'top5: capped at 5')
  check(r.topProcedureReferencesByCount[0]?.reference === 'A-PROC', 'top5: tiebreak A-PROC first')
}

// 8. Start event without plannedDueAt → dates stay null
{
  const r = projectPlantEventMaintenanceDatesBrief(state([startEvent()]))
  check(r.totalMaintenanceEvents === 1, 'no-dates: totalMaintenanceEvents 1')
  check(r.earliestPlannedDueAt === null, 'no-dates: earliestPlannedDueAt null')
}

// 9. Complete event without nextDueAt → nextDueAt stays null
{
  const r = projectPlantEventMaintenanceDatesBrief(state([completeEvent()]))
  check(r.earliestNextDueAt === null, 'no-nextDueAt: earliestNextDueAt null')
  check(r.latestNextDueAt === null, 'no-nextDueAt: latestNextDueAt null')
}

console.log(JSON.stringify({ ok: true, checks }))
