// Plant event maintenance strategy brief: maintenanceStrategyRevision numeric stats + maintenanceFindings distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEventMaintenanceStrategyBrief } from './plant-event-maintenance-strategy-brief.ts'`,
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

const { projectPlantEventMaintenanceStrategyBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let eventId = 0
function startEvent(revision) {
  eventId++
  const obj = {
    id: `EVT-${eventId}`,
    actionId: `ACT-MS-${eventId}`,
    createdAt: '2026-08-01T09:00:00Z',
    actor: 'operator-1',
    kind: 'maintenance_started',
    maintenanceOwner: 'eng-1',
    maintenanceStrategyActionId: `STRAT-${eventId}`,
    maintenanceProcedureReference: 'PROC-001',
    maintenancePlannedDueAt: '2026-08-10T00:00:00Z',
  }
  if (revision !== undefined) obj.maintenanceStrategyRevision = revision
  return obj
}
function completeEvent({ revision, findings } = {}) {
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
    maintenanceProcedureReference: 'PROC-001',
    maintenancePlannedDueAt: '2026-08-10T00:00:00Z',
    maintenanceOutcome: 'completed',
    maintenanceProcedureCompleted: true,
    maintenanceReturnToService: 'recommended',
    nextDueAt: '2026-09-10T00:00:00Z',
  }
  if (revision !== undefined) obj.maintenanceStrategyRevision = revision
  if (findings !== undefined) obj.maintenanceFindings = findings
  return obj
}

function state(events) {
  return { schema: 'supermega.production.workspace.v2', revision: 0, jobs: [], issues: [], machines: [], events, openingPlan: null, orderExecution: null, orderPortfolio: null, equipmentMaster: null }
}

// 1. No events → all zeros
{
  const r = projectPlantEventMaintenanceStrategyBrief(state([]))
  check(r.totalMaintenanceEvents === 0, 'empty: totalMaintenanceEvents 0')
  check(r.totalRevisions === 0, 'empty: totalRevisions 0')
  check(r.averageRevision === 0, 'empty: averageRevision 0')
  check(r.maxRevision === 0, 'empty: maxRevision 0')
  check(r.eventsWithFindings === 0, 'empty: eventsWithFindings 0')
  check(r.uniqueFindings === 0, 'empty: uniqueFindings 0')
  check(r.topFindingsByCount.length === 0, 'empty: top empty')
}

// 2. Single start event with revision 1
{
  const r = projectPlantEventMaintenanceStrategyBrief(state([startEvent(1)]))
  check(r.totalMaintenanceEvents === 1, 'single: totalMaintenanceEvents 1')
  check(r.totalRevisions === 1, 'single: totalRevisions 1')
  check(r.averageRevision === 1, 'single: averageRevision 1')
  check(r.maxRevision === 1, 'single: maxRevision 1')
}

// 3. Multiple events with different revisions → max + average
{
  const r = projectPlantEventMaintenanceStrategyBrief(
    state([startEvent(1), startEvent(3), completeEvent({ revision: 2 })]),
  )
  check(r.totalMaintenanceEvents === 3, 'multi-rev: totalMaintenanceEvents 3')
  check(r.totalRevisions === 6, 'multi-rev: totalRevisions 6 (1+3+2)')
  check(r.averageRevision === 2, 'multi-rev: averageRevision 2 (6/3=2)')
  check(r.maxRevision === 3, 'multi-rev: maxRevision 3')
}

// 4. Complete events without findings → eventsWithFindings 0
{
  const r = projectPlantEventMaintenanceStrategyBrief(
    state([completeEvent({ revision: 1 }), completeEvent({ revision: 2 })]),
  )
  check(r.eventsWithFindings === 0, 'no-findings: eventsWithFindings 0')
  check(r.uniqueFindings === 0, 'no-findings: uniqueFindings 0')
}

// 5. Complete events with findings
{
  const r = projectPlantEventMaintenanceStrategyBrief(
    state([
      completeEvent({ revision: 1, findings: 'Worn bearing detected.' }),
      completeEvent({ revision: 2, findings: 'Worn bearing detected.' }),
      completeEvent({ revision: 1, findings: 'Loose belt.' }),
    ]),
  )
  check(r.eventsWithFindings === 3, 'findings: eventsWithFindings 3')
  check(r.uniqueFindings === 2, 'findings: uniqueFindings 2')
  check(r.topFindingsByCount[0]?.finding === 'Worn bearing detected.', 'findings: top finding')
  check(r.topFindingsByCount[0]?.count === 2, 'findings: top count 2')
}

// 6. Only start events do not contribute to findings
{
  const r = projectPlantEventMaintenanceStrategyBrief(
    state([startEvent(1), startEvent(2)]),
  )
  check(r.eventsWithFindings === 0, 'start-no-findings: eventsWithFindings 0')
}

// 7. Top-5 cap + tiebreak for findings
{
  const findingsArr = ['Z-finding', 'A-finding', 'C-finding', 'B-finding', 'D-finding', 'E-finding']
  const r = projectPlantEventMaintenanceStrategyBrief(
    state(findingsArr.map(f => completeEvent({ revision: 1, findings: f }))),
  )
  check(r.topFindingsByCount.length === 5, 'top5: capped at 5')
  check(r.topFindingsByCount[0]?.finding === 'A-finding', 'top5: tiebreak A-finding first')
}

// 8. Average revision rounded: 3 events total 7 → avg 2.33 → rounds to 2
{
  const r = projectPlantEventMaintenanceStrategyBrief(
    state([startEvent(1), startEvent(3), startEvent(3)]),
  )
  check(r.totalRevisions === 7, 'round-avg: totalRevisions 7')
  check(r.averageRevision === 2, 'round-avg: averageRevision 2 (7/3=2.33→2)')
}

console.log(JSON.stringify({ ok: true, checks }))
