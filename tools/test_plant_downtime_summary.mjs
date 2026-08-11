// Plant downtime summary: pairs downtime_started/downtime_ended events to compute
// totalIncidents, completedIntervals, activeDowntimeCount, totalDowntimeMinutes,
// averageDowntimeMinutes, longestIncidentMinutes, and per-machine byMachine breakdown.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantDowntimeSummary } from './plant-downtime-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/downtime-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectPlantDowntimeSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let seq = 0
function mkStart(machineId, actionId, isoTs) {
  seq++
  return { id: `e${seq}`, actionId, createdAt: isoTs, actor: 'op1', reason: 'down', evidenceReference: 'ref1', kind: 'downtime_started', subjectId: machineId, summary: `Started downtime for ${machineId}` }
}
function mkEnd(machineId, actionId, isoTs, startActionId) {
  seq++
  return { id: `e${seq}`, actionId, createdAt: isoTs, actor: 'op1', reason: 'up', evidenceReference: 'ref1', kind: 'downtime_ended', subjectId: machineId, summary: `Ended downtime for ${machineId}`, downtimeStartActionId: startActionId }
}

function state(events = []) {
  return { jobs: [], events, issues: [], machines: [] }
}

// 1. Empty state → all zeros
{
  const r = projectPlantDowntimeSummary(state())
  check(r.totalIncidents === 0, 'empty: totalIncidents 0')
  check(r.completedIntervals === 0, 'empty: completedIntervals 0')
  check(r.activeDowntimeCount === 0, 'empty: activeDowntimeCount 0')
  check(r.totalDowntimeMinutes === 0, 'empty: totalDowntimeMinutes 0')
  check(r.averageDowntimeMinutes === 0, 'empty: averageDowntimeMinutes 0 (no zero-division)')
  check(r.longestIncidentMinutes === 0, 'empty: longestIncidentMinutes 0')
  check(r.byMachine.length === 0, 'empty: byMachine is empty')
}

// 2. Single completed 60-minute interval
{
  const events = [
    mkStart('M1', 'a1', '2026-08-11T08:00:00.000Z'),
    mkEnd('M1', 'a2', '2026-08-11T09:00:00.000Z', 'a1'),
  ]
  const r = projectPlantDowntimeSummary(state(events))
  check(r.totalIncidents === 1, 'single: totalIncidents 1')
  check(r.completedIntervals === 1, 'single: completedIntervals 1')
  check(r.activeDowntimeCount === 0, 'single: activeDowntimeCount 0')
  check(r.totalDowntimeMinutes === 60, 'single: totalDowntimeMinutes 60')
  check(r.averageDowntimeMinutes === 60, 'single: averageDowntimeMinutes 60')
  check(r.longestIncidentMinutes === 60, 'single: longestIncidentMinutes 60')
  check(r.byMachine.length === 1, 'single: byMachine has 1 entry')
  check(r.byMachine[0].totalDowntimeMinutes === 60, 'single: byMachine entry total 60')
}

// 3. Active downtime (started, no end)
{
  const events = [
    mkStart('M1', 'a1', '2026-08-11T08:00:00.000Z'),
  ]
  const r = projectPlantDowntimeSummary(state(events))
  check(r.totalIncidents === 1, 'active: totalIncidents 1')
  check(r.completedIntervals === 0, 'active: completedIntervals 0')
  check(r.activeDowntimeCount === 1, 'active: activeDowntimeCount 1')
  check(r.totalDowntimeMinutes === 0, 'active: totalDowntimeMinutes 0')
  check(r.byMachine.length === 0, 'active: byMachine empty (no completed interval)')
}

// 4. Two completed intervals on same machine: 30 and 90 minutes
{
  const events = [
    mkStart('M1', 'a1', '2026-08-11T08:00:00.000Z'),
    mkEnd('M1', 'a2', '2026-08-11T08:30:00.000Z', 'a1'),
    mkStart('M1', 'a3', '2026-08-11T10:00:00.000Z'),
    mkEnd('M1', 'a4', '2026-08-11T11:30:00.000Z', 'a3'),
  ]
  const r = projectPlantDowntimeSummary(state(events))
  check(r.totalIncidents === 2, 'same-machine: totalIncidents 2')
  check(r.completedIntervals === 2, 'same-machine: completedIntervals 2')
  check(r.totalDowntimeMinutes === 120, 'same-machine: totalDowntimeMinutes 120')
  check(r.averageDowntimeMinutes === 60, 'same-machine: averageDowntimeMinutes 60')
  check(r.longestIncidentMinutes === 90, 'same-machine: longestIncidentMinutes 90')
  check(r.byMachine.length === 1, 'same-machine: byMachine 1 entry')
  check(r.byMachine[0].completedCount === 2, 'same-machine: completedCount 2')
  check(r.byMachine[0].totalDowntimeMinutes === 120, 'same-machine: total 120')
}

// 5. Two machines: sorted by totalDowntimeMinutes descending
{
  const events = [
    // M-A: 30 minutes
    mkStart('M-A', 'b1', '2026-08-11T08:00:00.000Z'),
    mkEnd('M-A', 'b2', '2026-08-11T08:30:00.000Z', 'b1'),
    // M-B: 120 minutes
    mkStart('M-B', 'b3', '2026-08-11T08:00:00.000Z'),
    mkEnd('M-B', 'b4', '2026-08-11T10:00:00.000Z', 'b3'),
  ]
  const r = projectPlantDowntimeSummary(state(events))
  check(r.byMachine[0].machineId === 'M-B', 'sort: M-B first (120 min)')
  check(r.byMachine[1].machineId === 'M-A', 'sort: M-A second (30 min)')
  check(r.totalDowntimeMinutes === 150, 'sort: combined total 150')
}

// 6. Tie-break: same totalDowntimeMinutes → alphabetical by machineId
{
  const events = [
    mkStart('Zebra', 'c1', '2026-08-11T08:00:00.000Z'),
    mkEnd('Zebra', 'c2', '2026-08-11T09:00:00.000Z', 'c1'),
    mkStart('Alpha', 'c3', '2026-08-11T08:00:00.000Z'),
    mkEnd('Alpha', 'c4', '2026-08-11T09:00:00.000Z', 'c3'),
  ]
  const r = projectPlantDowntimeSummary(state(events))
  check(r.byMachine[0].machineId === 'Alpha', 'tie-break: Alpha before Zebra')
  check(r.byMachine[1].machineId === 'Zebra', 'tie-break: Zebra after Alpha')
}

// 7. Mixed: 3 incidents, 2 completed, 1 active
{
  const events = [
    mkStart('M1', 'd1', '2026-08-11T08:00:00.000Z'),
    mkEnd('M1', 'd2', '2026-08-11T09:00:00.000Z', 'd1'),
    mkStart('M2', 'd3', '2026-08-11T10:00:00.000Z'),
    mkEnd('M2', 'd4', '2026-08-11T11:30:00.000Z', 'd3'),
    mkStart('M3', 'd5', '2026-08-11T12:00:00.000Z'), // still active
  ]
  const r = projectPlantDowntimeSummary(state(events))
  check(r.totalIncidents === 3, 'mixed: totalIncidents 3')
  check(r.completedIntervals === 2, 'mixed: completedIntervals 2')
  check(r.activeDowntimeCount === 1, 'mixed: activeDowntimeCount 1')
}

// 8. End event referencing unknown start → ignored
{
  const events = [
    mkEnd('M1', 'e2', '2026-08-11T09:00:00.000Z', 'nonexistent-action'),
  ]
  const r = projectPlantDowntimeSummary(state(events))
  check(r.totalIncidents === 0, 'orphan-end: totalIncidents 0')
  check(r.completedIntervals === 0, 'orphan-end: completedIntervals 0')
  check(r.totalDowntimeMinutes === 0, 'orphan-end: no duration counted')
}

// 9. Duration rounding: 90 seconds → Math.round(1.5) = 2 minutes
{
  const events = [
    mkStart('M1', 'f1', '2026-08-11T08:00:00.000Z'),
    mkEnd('M1', 'f2', '2026-08-11T08:01:30.000Z', 'f1'), // 90 seconds
  ]
  const r = projectPlantDowntimeSummary(state(events))
  check(r.totalDowntimeMinutes === 2, 'rounding: 90s rounds to 2 minutes')
}

console.log(JSON.stringify({ ok: true, checks }))
