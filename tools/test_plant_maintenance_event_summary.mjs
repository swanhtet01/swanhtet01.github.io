// Plant maintenance event summary: pairs maintenance_started/maintenance_completed
// events to compute totalMaintenanceEvents, completedCount, inProgressCount,
// completedWithFindingsCount, duration stats, earliestNextDueAt, and byMachine breakdown.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantMaintenanceEventSummary } from './plant-maintenance-event-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/maintenance-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectPlantMaintenanceEventSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let seq = 0
const STRATEGY = {
  maintenanceStrategyActionId: 'strat-1',
  maintenanceStrategyRevision: 1,
  maintenanceProcedureReference: 'PM-001',
  maintenancePlannedDueAt: '2026-08-11T08:00:00.000Z',
}
const RESULT = {
  maintenanceOutcome: 'completed',
  maintenanceFindings: 'none',
  maintenanceProcedureCompleted: true,
  maintenanceReturnToService: 'recommended',
}

function mkStart(machineId, actionId, isoTs) {
  seq++
  return {
    id: `e${seq}`,
    actionId,
    createdAt: isoTs,
    actor: 'tech1',
    reason: 'PM',
    evidenceReference: 'ref1',
    kind: 'maintenance_started',
    subjectId: machineId,
    summary: `Maintenance started on ${machineId}`,
    maintenanceOwner: 'tech1',
    ...STRATEGY,
  }
}

function mkEnd(machineId, actionId, isoTs, startActionId, nextDueAt = '2026-09-11T08:00:00.000Z', findings = false) {
  seq++
  return {
    id: `e${seq}`,
    actionId,
    createdAt: isoTs,
    actor: 'tech1',
    reason: 'PM done',
    evidenceReference: 'ref1',
    kind: 'maintenance_completed',
    subjectId: machineId,
    summary: `Maintenance completed on ${machineId}`,
    maintenanceStartActionId: startActionId,
    ...STRATEGY,
    ...RESULT,
    ...(findings ? { maintenanceOutcome: 'completed_with_findings', maintenanceFindings: 'wear detected' } : {}),
    nextDueAt,
  }
}

function state(events = []) {
  return { jobs: [], events, issues: [], machines: [] }
}

// 1. Empty state → all zeros, null earliestNextDueAt
{
  const r = projectPlantMaintenanceEventSummary(state())
  check(r.totalMaintenanceEvents === 0, 'empty: totalMaintenanceEvents 0')
  check(r.completedCount === 0, 'empty: completedCount 0')
  check(r.inProgressCount === 0, 'empty: inProgressCount 0')
  check(r.completedWithFindingsCount === 0, 'empty: completedWithFindingsCount 0')
  check(r.totalDurationMinutes === 0, 'empty: totalDurationMinutes 0')
  check(r.averageDurationMinutes === 0, 'empty: averageDurationMinutes 0 (no zero-division)')
  check(r.longestMaintenanceMinutes === 0, 'empty: longestMaintenanceMinutes 0')
  check(r.earliestNextDueAt === null, 'empty: earliestNextDueAt null')
  check(r.byMachine.length === 0, 'empty: byMachine empty')
}

// 2. Single completed 120-minute maintenance
{
  const events = [
    mkStart('M1', 'a1', '2026-08-11T08:00:00.000Z'),
    mkEnd('M1', 'a2', '2026-08-11T10:00:00.000Z', 'a1', '2026-09-11T08:00:00.000Z'),
  ]
  const r = projectPlantMaintenanceEventSummary(state(events))
  check(r.totalMaintenanceEvents === 1, 'single: totalMaintenanceEvents 1')
  check(r.completedCount === 1, 'single: completedCount 1')
  check(r.inProgressCount === 0, 'single: inProgressCount 0')
  check(r.totalDurationMinutes === 120, 'single: totalDurationMinutes 120')
  check(r.averageDurationMinutes === 120, 'single: averageDurationMinutes 120')
  check(r.longestMaintenanceMinutes === 120, 'single: longestMaintenanceMinutes 120')
  check(r.earliestNextDueAt === '2026-09-11T08:00:00.000Z', 'single: earliestNextDueAt')
  check(r.byMachine.length === 1, 'single: byMachine 1 entry')
  check(r.byMachine[0].nextDueAt === '2026-09-11T08:00:00.000Z', 'single: byMachine nextDueAt')
}

// 3. In-progress maintenance (started, not completed)
{
  const r = projectPlantMaintenanceEventSummary(state([
    mkStart('M1', 'b1', '2026-08-11T08:00:00.000Z'),
  ]))
  check(r.totalMaintenanceEvents === 1, 'inprog: totalMaintenanceEvents 1')
  check(r.completedCount === 0, 'inprog: completedCount 0')
  check(r.inProgressCount === 1, 'inprog: inProgressCount 1')
  check(r.byMachine.length === 0, 'inprog: byMachine empty (no completed interval)')
}

// 4. completedWithFindingsCount
{
  const events = [
    mkStart('M1', 'c1', '2026-08-11T08:00:00.000Z'),
    mkEnd('M1', 'c2', '2026-08-11T09:00:00.000Z', 'c1', '2026-09-11T08:00:00.000Z', true),
    mkStart('M2', 'c3', '2026-08-11T08:00:00.000Z'),
    mkEnd('M2', 'c4', '2026-08-11T09:30:00.000Z', 'c3', '2026-09-11T08:00:00.000Z', false),
  ]
  const r = projectPlantMaintenanceEventSummary(state(events))
  check(r.completedWithFindingsCount === 1, 'findings: completedWithFindingsCount 1')
  check(r.byMachine.find(m => m.machineId === 'M1')?.completedWithFindingsCount === 1, 'findings: M1 machine findings 1')
  check(r.byMachine.find(m => m.machineId === 'M2')?.completedWithFindingsCount === 0, 'findings: M2 machine findings 0')
}

// 5. earliestNextDueAt picks the soonest date across machines
{
  const events = [
    mkStart('M1', 'd1', '2026-08-11T08:00:00.000Z'),
    mkEnd('M1', 'd2', '2026-08-11T09:00:00.000Z', 'd1', '2026-10-01T08:00:00.000Z'),
    mkStart('M2', 'd3', '2026-08-11T08:00:00.000Z'),
    mkEnd('M2', 'd4', '2026-08-11T09:30:00.000Z', 'd3', '2026-09-15T08:00:00.000Z'),
  ]
  const r = projectPlantMaintenanceEventSummary(state(events))
  check(r.earliestNextDueAt === '2026-09-15T08:00:00.000Z', 'earliest: picks 2026-09-15 over 2026-10-01')
}

// 6. byMachine sorted by totalDurationMinutes desc
{
  const events = [
    // M-A: 60 minutes
    mkStart('M-A', 'e1', '2026-08-11T08:00:00.000Z'),
    mkEnd('M-A', 'e2', '2026-08-11T09:00:00.000Z', 'e1'),
    // M-B: 180 minutes
    mkStart('M-B', 'e3', '2026-08-11T08:00:00.000Z'),
    mkEnd('M-B', 'e4', '2026-08-11T11:00:00.000Z', 'e3'),
  ]
  const r = projectPlantMaintenanceEventSummary(state(events))
  check(r.byMachine[0].machineId === 'M-B', 'sort: M-B first (180 min)')
  check(r.byMachine[1].machineId === 'M-A', 'sort: M-A second (60 min)')
}

// 7. Tie-break: same duration → alphabetical machineId
{
  const events = [
    mkStart('Zebra', 'f1', '2026-08-11T08:00:00.000Z'),
    mkEnd('Zebra', 'f2', '2026-08-11T09:00:00.000Z', 'f1'),
    mkStart('Alpha', 'f3', '2026-08-11T08:00:00.000Z'),
    mkEnd('Alpha', 'f4', '2026-08-11T09:00:00.000Z', 'f3'),
  ]
  const r = projectPlantMaintenanceEventSummary(state(events))
  check(r.byMachine[0].machineId === 'Alpha', 'tie: Alpha before Zebra')
}

// 8. nextDueAt on byMachine uses LATEST completion per machine
{
  const events = [
    // First maintenance: nextDueAt = Sept 1
    mkStart('M1', 'g1', '2026-08-01T08:00:00.000Z'),
    mkEnd('M1', 'g2', '2026-08-01T10:00:00.000Z', 'g1', '2026-09-01T08:00:00.000Z'),
    // Second (later) maintenance: nextDueAt = Oct 1
    mkStart('M1', 'g3', '2026-08-11T08:00:00.000Z'),
    mkEnd('M1', 'g4', '2026-08-11T10:00:00.000Z', 'g3', '2026-10-01T08:00:00.000Z'),
  ]
  const r = projectPlantMaintenanceEventSummary(state(events))
  check(r.byMachine[0].nextDueAt === '2026-10-01T08:00:00.000Z', 'latest-nextdue: uses most recent completion nextDueAt')
  check(r.byMachine[0].completedCount === 2, 'latest-nextdue: completedCount 2')
  check(r.byMachine[0].totalDurationMinutes === 240, 'latest-nextdue: totalDurationMinutes 240 (120+120)')
}

// 9. Orphan end event (no matching start) → ignored
{
  const r = projectPlantMaintenanceEventSummary(state([
    mkEnd('M1', 'h2', '2026-08-11T09:00:00.000Z', 'nonexistent'),
  ]))
  check(r.totalMaintenanceEvents === 0, 'orphan: no start event counted')
  check(r.completedCount === 0, 'orphan: completedCount 0')
}

// 10. Mixed: 3 started (2 completed, 1 in-progress)
{
  const events = [
    mkStart('M1', 'i1', '2026-08-11T08:00:00.000Z'),
    mkEnd('M1', 'i2', '2026-08-11T09:00:00.000Z', 'i1'),
    mkStart('M2', 'i3', '2026-08-11T10:00:00.000Z'),
    mkEnd('M2', 'i4', '2026-08-11T12:00:00.000Z', 'i3'),
    mkStart('M3', 'i5', '2026-08-11T12:00:00.000Z'), // in progress
  ]
  const r = projectPlantMaintenanceEventSummary(state(events))
  check(r.totalMaintenanceEvents === 3, 'mixed: totalMaintenanceEvents 3')
  check(r.completedCount === 2, 'mixed: completedCount 2')
  check(r.inProgressCount === 1, 'mixed: inProgressCount 1')
}

console.log(JSON.stringify({ ok: true, checks }))
