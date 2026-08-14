// Plant event maintenance strategy save brief: strategyRevision + intervalDays + procedureReference.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEventMaintenanceStrategySaveBrief } from './plant-event-maintenance-strategy-save-brief.ts'`,
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

const { projectPlantEventMaintenanceStrategySaveBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let eventId = 0
function saveEvent({ strategyRevision, intervalDays, procedureReference } = {}) {
  eventId++
  const obj = {
    id: `EVT-${eventId}`,
    actionId: `ACT-${eventId}`,
    createdAt: '2026-08-01T09:00:00Z',
    actor: 'engineer-1',
    kind: 'equipment_maintenance_strategy_saved',
    maintenanceOwner: 'maint-1',
    nextDueAt: '2026-09-01T00:00:00Z',
  }
  if (strategyRevision !== undefined) obj.strategyRevision = strategyRevision
  if (intervalDays !== undefined) obj.intervalDays = intervalDays
  if (procedureReference !== undefined) obj.procedureReference = procedureReference
  return obj
}
function otherEvent() {
  eventId++
  return { id: `EVT-${eventId}`, actionId: `ACT-O-${eventId}`, createdAt: '2026-08-01T08:00:00Z', actor: 'worker-1', kind: 'output_recorded', quantity: 10, shiftRef: 'S1', outputKind: 'good' }
}

function state(events) {
  return { schema: 'supermega.production.workspace.v2', revision: 0, jobs: [], issues: [], machines: [], events, openingPlan: null, orderExecution: null, orderPortfolio: null, equipmentMaster: null }
}

// 1. No events → all zeros
{
  const r = projectPlantEventMaintenanceStrategySaveBrief(state([]))
  check(r.totalStrategyEvents === 0, 'empty: totalStrategyEvents 0')
  check(r.totalStrategyRevisions === 0, 'empty: totalStrategyRevisions 0')
  check(r.averageStrategyRevision === 0, 'empty: averageStrategyRevision 0')
  check(r.maxStrategyRevision === 0, 'empty: maxStrategyRevision 0')
  check(r.totalIntervalDays === 0, 'empty: totalIntervalDays 0')
  check(r.averageIntervalDays === 0, 'empty: averageIntervalDays 0')
  check(r.maxIntervalDays === 0, 'empty: maxIntervalDays 0')
  check(r.uniqueProcedureReferences === 0, 'empty: uniqueProcedureReferences 0')
  check(r.topProcedureReferencesByCount.length === 0, 'empty: top empty')
}

// 2. Other events not counted
{
  const r = projectPlantEventMaintenanceStrategySaveBrief(state([otherEvent(), otherEvent()]))
  check(r.totalStrategyEvents === 0, 'other: totalStrategyEvents 0')
}

// 3. Single save event with all fields
{
  const r = projectPlantEventMaintenanceStrategySaveBrief(
    state([saveEvent({ strategyRevision: 2, intervalDays: 90, procedureReference: 'PROC-001' })]),
  )
  check(r.totalStrategyEvents === 1, 'single: totalStrategyEvents 1')
  check(r.totalStrategyRevisions === 2, 'single: totalStrategyRevisions 2')
  check(r.averageStrategyRevision === 2, 'single: averageStrategyRevision 2')
  check(r.maxStrategyRevision === 2, 'single: maxStrategyRevision 2')
  check(r.totalIntervalDays === 90, 'single: totalIntervalDays 90')
  check(r.averageIntervalDays === 90, 'single: averageIntervalDays 90')
  check(r.maxIntervalDays === 90, 'single: maxIntervalDays 90')
  check(r.uniqueProcedureReferences === 1, 'single: uniqueProcedureReferences 1')
  check(r.topProcedureReferencesByCount[0]?.reference === 'PROC-001', 'single: top reference')
}

// 4. Multiple events — revision and interval numeric stats
{
  const r = projectPlantEventMaintenanceStrategySaveBrief(
    state([
      saveEvent({ strategyRevision: 1, intervalDays: 30 }),
      saveEvent({ strategyRevision: 3, intervalDays: 90 }),
      saveEvent({ strategyRevision: 2, intervalDays: 60 }),
    ]),
  )
  check(r.totalStrategyEvents === 3, 'multi: totalStrategyEvents 3')
  check(r.totalStrategyRevisions === 6, 'multi: totalStrategyRevisions 6 (1+3+2)')
  check(r.averageStrategyRevision === 2, 'multi: averageStrategyRevision 2')
  check(r.maxStrategyRevision === 3, 'multi: maxStrategyRevision 3')
  check(r.totalIntervalDays === 180, 'multi: totalIntervalDays 180')
  check(r.averageIntervalDays === 60, 'multi: averageIntervalDays 60')
  check(r.maxIntervalDays === 90, 'multi: maxIntervalDays 90')
}

// 5. Procedure reference distribution
{
  const r = projectPlantEventMaintenanceStrategySaveBrief(
    state([
      saveEvent({ procedureReference: 'PROC-001' }),
      saveEvent({ procedureReference: 'PROC-001' }),
      saveEvent({ procedureReference: 'PROC-002' }),
    ]),
  )
  check(r.uniqueProcedureReferences === 2, 'proc-dist: uniqueProcedureReferences 2')
  check(r.topProcedureReferencesByCount[0]?.reference === 'PROC-001', 'proc-dist: top PROC-001')
  check(r.topProcedureReferencesByCount[0]?.count === 2, 'proc-dist: count 2')
}

// 6. Top-5 cap + tiebreak
{
  const refs = ['Z-PROC', 'A-PROC', 'C-PROC', 'B-PROC', 'D-PROC', 'E-PROC']
  const r = projectPlantEventMaintenanceStrategySaveBrief(
    state(refs.map(ref => saveEvent({ procedureReference: ref }))),
  )
  check(r.topProcedureReferencesByCount.length === 5, 'top5: capped at 5')
  check(r.topProcedureReferencesByCount[0]?.reference === 'A-PROC', 'top5: tiebreak A-PROC first')
}

// 7. Average revision rounded: 3 events total 7 → avg 2.33 → rounds to 2
{
  const r = projectPlantEventMaintenanceStrategySaveBrief(
    state([saveEvent({ strategyRevision: 1, intervalDays: 1 }), saveEvent({ strategyRevision: 3, intervalDays: 1 }), saveEvent({ strategyRevision: 3, intervalDays: 1 })]),
  )
  check(r.averageStrategyRevision === 2, 'round: averageStrategyRevision rounds down')
}

console.log(JSON.stringify({ ok: true, checks }))
