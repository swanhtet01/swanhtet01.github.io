// Plant managed OEE window: fail-closed proof projection from existing production records.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantManagedOeeWindow, PLANT_MANAGED_OEE_WINDOW_CONTRACT } from './plant-managed-oee-window.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/plant-managed-oee-window-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectPlantManagedOeeWindow, PLANT_MANAGED_OEE_WINDOW_CONTRACT } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`,
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const START = '2026-08-25T08:00:00.000Z'
const END = '2026-08-25T12:00:00.000Z'
const OPERATOR_DIGEST = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const SUPERVISOR_DIGEST = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

function state({ jobs = [], machines = [], events = [], revision = 7 } = {}) {
  return {
    schema: 'supermega.production.workspace.v2',
    revision,
    jobs,
    issues: [],
    machines,
    events,
  }
}

function job(extra = {}) {
  return {
    id: 'JOB-001',
    line: 'LINE-A',
    product: 'Tea bottle',
    target: 240,
    output: 190,
    scrap: 10,
    closure: {
      actionId: 'ACT-CLOSE-001',
      closedAt: '2026-08-25T11:55:00.000Z',
      closedBy: 'operator-role',
      reason: 'short close reviewed',
      evidenceReference: 'EV-SHIFT-001',
      shiftRef: 'SHIFT-A',
      remainingUnits: 40,
    },
    ...extra,
  }
}

function machine(extra = {}) {
  return { id: 'MIXER-1', name: 'Mixer 1', state: 'running', ...extra }
}

function shiftClose(extra = {}) {
  return {
    id: 'EV-SHIFT',
    actionId: 'ACT-SHIFT',
    createdAt: '2026-08-25T12:00:00.000Z',
    actor: 'supervisor-role',
    reason: 'shift reviewed',
    evidenceReference: 'EV-SHIFT-001',
    kind: 'shift_closed',
    subjectId: 'SHIFT-A',
    summary: 'shift closed',
    shiftRef: 'SHIFT-A',
    sourceRevision: 6,
    sourceDigest: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    goodUnits: 190,
    scrapUnits: 10,
    outputEntryCount: 2,
    materialEntryCount: 1,
    ...extra,
  }
}

function downtimeStart(extra = {}) {
  return {
    id: 'EV-DOWN-START',
    actionId: 'ACT-DOWN-START',
    createdAt: '2026-08-25T09:00:00.000Z',
    actor: 'operator-role',
    reason: 'jam cleared',
    evidenceReference: 'EV-DOWN-001',
    kind: 'downtime_started',
    subjectId: 'MIXER-1',
    summary: 'downtime started',
    ...extra,
  }
}

function downtimeEnd(extra = {}) {
  return {
    id: 'EV-DOWN-END',
    actionId: 'ACT-DOWN-END',
    createdAt: '2026-08-25T09:30:00.000Z',
    actor: 'operator-role',
    reason: 'jam cleared',
    evidenceReference: 'EV-DOWN-002',
    kind: 'downtime_ended',
    subjectId: 'MIXER-1',
    summary: 'downtime ended',
    downtimeStartActionId: 'ACT-DOWN-START',
    ...extra,
  }
}

function outputEvent(extra = {}) {
  return {
    id: 'EV-OUTPUT',
    actionId: 'ACT-OUTPUT',
    createdAt: '2026-08-25T10:00:00.000Z',
    actor: 'operator-role',
    reason: 'output counted',
    evidenceReference: 'EV-OUTPUT-001',
    kind: 'output_recorded',
    subjectId: 'JOB-001',
    summary: 'recorded output',
    quantity: 100,
    shiftRef: 'SHIFT-A',
    outputKind: 'good',
    ...extra,
  }
}

function windowOutputEvents() {
  return [
    outputEvent({
      id: 'EV-OUTPUT-GOOD',
      actionId: 'ACT-OUTPUT-GOOD',
      quantity: 190,
    }),
    outputEvent({
      id: 'EV-OUTPUT-SCRAP',
      actionId: 'ACT-OUTPUT-SCRAP',
      createdAt: '2026-08-25T10:30:00.000Z',
      evidenceReference: 'EV-OUTPUT-002',
      quantity: 10,
      outputKind: 'scrap',
    }),
  ]
}

function input(extra = {}) {
  return {
    windowId: 'OEE-WINDOW-001',
    startedAt: START,
    endedAt: END,
    jobId: 'JOB-001',
    machineId: 'MIXER-1',
    shiftRef: 'SHIFT-A',
    idealUnitsPerHour: 60,
    operatorReviewDigest: OPERATOR_DIGEST,
    supervisorReviewDigest: SUPERVISOR_DIGEST,
    ...extra,
  }
}

function happyState() {
  return state({
    jobs: [job()],
    machines: [machine()],
    events: [...windowOutputEvents(), downtimeStart(), downtimeEnd(), shiftClose()],
  })
}

// 1. Happy path projects full window metrics and digest.
{
  const r = projectPlantManagedOeeWindow(happyState(), input())
  check(r.contract === PLANT_MANAGED_OEE_WINDOW_CONTRACT, 'contract is stable')
  check(r.readyForManagedRehearsal === true, 'happy path is ready')
  check(r.blockingCount === 0, 'happy path has zero blockers')
  check(r.metrics.plannedMinutes === 240, 'planned minutes from window')
  check(r.metrics.downtimeMinutes === 30, 'downtime minutes from completed pair')
  check(r.metrics.runtimeMinutes === 210, 'runtime minutes subtract downtime')
  check(r.metrics.expectedUnitsAtRuntime === 210, 'expected units uses runtime and ideal rate')
  check(r.metrics.availabilityRate === 88, 'availability rounded')
  check(r.metrics.performanceRate === 95, 'performance rounded')
  check(r.metrics.qualityRate === 95, 'quality rounded')
  check(r.metrics.oeeRate === 79, 'OEE is availability * performance * quality')
  check(/^sha256:[0-9a-f]{64}$/.test(r.windowDigest), 'window digest is sha256')
  check(r.gates.find((gate) => gate.id === 'source_quantity_mapping_unambiguous')?.passed === true, 'source quantity mapping is unambiguous')
  check(/^sha256:[0-9a-f]{64}$/.test(r.evidence.sourceMapDigest), 'source map digest is sha256')
  check(r.sourceTrust.passed === true && r.sourceTrust.rejectedQuantityLikeFields.length === 0, 'source trust accepts canonical window output and shift close')
  check(r.evidence.operatorReviewDigest === OPERATOR_DIGEST, 'operator digest retained')
  check(r.evidence.supervisorReviewDigest === SUPERVISOR_DIGEST, 'supervisor digest retained')
}

// 2. Empty state fails closed without throwing.
{
  const r = projectPlantManagedOeeWindow(state(), input())
  check(r.readyForManagedRehearsal === false, 'empty state is not ready')
  check(r.blockingCount >= 4, 'empty state reports blockers')
  check(r.metrics.oeeRate === 0, 'empty state OEE is zero')
}

// 3. Invalid window time blocks projection readiness.
{
  const r = projectPlantManagedOeeWindow(happyState(), input({ endedAt: START }))
  check(r.readyForManagedRehearsal === false, 'invalid time is not ready')
  check(r.gates.find((gate) => gate.id === 'window_time_valid')?.passed === false, 'time gate fails')
  check(r.metrics.plannedMinutes === 0, 'invalid time has zero planned minutes')
}

// 4. Missing reviewer digest blocks managed rehearsal.
{
  const r = projectPlantManagedOeeWindow(happyState(), input({ operatorReviewDigest: undefined }))
  check(r.readyForManagedRehearsal === false, 'missing operator review blocks')
  check(r.gates.find((gate) => gate.id === 'operator_review_digest_present')?.passed === false, 'operator review gate fails')
}

// 5. Same review digest blocks independent review.
{
  const r = projectPlantManagedOeeWindow(happyState(), input({ supervisorReviewDigest: OPERATOR_DIGEST }))
  check(r.readyForManagedRehearsal === false, 'same digest is not independent')
  check(r.gates.find((gate) => gate.id === 'independent_review_digests')?.passed === false, 'independent review gate fails')
}

// 6. Active downtime blocks readiness.
{
  const r = projectPlantManagedOeeWindow(
    state({ jobs: [job()], machines: [machine()], events: [...windowOutputEvents(), downtimeStart(), shiftClose()] }),
    input(),
  )
  check(r.readyForManagedRehearsal === false, 'active downtime blocks')
  check(r.gates.find((gate) => gate.id === 'downtime_pairs_closed')?.passed === false, 'downtime gate fails')
}

// 7. Stopped machine blocks readiness even if metrics exist.
{
  const r = projectPlantManagedOeeWindow(
    state({ jobs: [job()], machines: [machine({ state: 'stopped' })], events: [...windowOutputEvents(), downtimeStart(), downtimeEnd(), shiftClose()] }),
    input(),
  )
  check(r.readyForManagedRehearsal === false, 'stopped machine blocks')
  check(r.gates.find((gate) => gate.id === 'machine_not_stopped')?.passed === false, 'machine state gate fails')
}

// 8. Job can link to shift through output events when closure is absent.
{
  const r = projectPlantManagedOeeWindow(
    state({
      jobs: [job({ closure: undefined })],
      machines: [machine()],
      events: [...windowOutputEvents(), downtimeStart(), downtimeEnd(), shiftClose()],
    }),
    input(),
  )
  check(r.gates.find((gate) => gate.id === 'job_shift_linked')?.passed === true, 'output event links job to shift')
}

// 9. Missing job-to-shift link blocks readiness.
{
  const r = projectPlantManagedOeeWindow(
    state({
      jobs: [job({ closure: undefined })],
      machines: [machine()],
      events: [downtimeStart(), downtimeEnd(), shiftClose()],
    }),
    input(),
  )
  check(r.readyForManagedRehearsal === false, 'unlinked job blocks')
  check(r.gates.find((gate) => gate.id === 'job_shift_linked')?.passed === false, 'job-shift gate fails')
}

// 10. Ambiguous quantity-like source fields block managed readiness and zero trusted unit metrics.
{
  const r = projectPlantManagedOeeWindow(
    state({
      jobs: [job()],
      machines: [machine()],
      events: [...windowOutputEvents(), downtimeStart(), downtimeEnd(), shiftClose({ totalUnits: 200, actualQuantity: 201 })],
    }),
    input(),
  )
  check(r.readyForManagedRehearsal === false, 'ambiguous quantity fields block managed OEE')
  check(r.gates.find((gate) => gate.id === 'source_quantity_mapping_unambiguous')?.passed === false, 'source mapping gate fails on duplicate quantities')
  check(r.sourceTrust.rejectedQuantityLikeFields.join(',') === 'actualQuantity,totalUnits', 'ambiguous quantity fields are reported in stable order')
  check(r.metrics.goodUnits === 0 && r.metrics.scrapUnits === 0 && r.metrics.totalUnits === 0, 'untrusted source units are zeroed')
  check(r.metrics.performanceRate === 0 && r.metrics.qualityRate === 0 && r.metrics.oeeRate === 0, 'untrusted source rates are zeroed')
}

// 11. Performance is capped at 100.
{
  const r = projectPlantManagedOeeWindow(
    state({
      jobs: [job()],
      machines: [machine()],
      events: [
        outputEvent({ quantity: 500 }),
        downtimeStart(),
        downtimeEnd(),
        shiftClose({ goodUnits: 500, scrapUnits: 0, outputEntryCount: 1 }),
      ],
    }),
    input(),
  )
  check(r.metrics.performanceRate === 100, 'performance cap prevents impossible score')
}

// 12. Shift close outside the reviewed window blocks readiness.
{
  const r = projectPlantManagedOeeWindow(
    state({
      jobs: [job()],
      machines: [machine()],
      events: [...windowOutputEvents(), downtimeStart(), downtimeEnd(), shiftClose({ createdAt: '2026-08-25T13:00:00.000Z' })],
    }),
    input(),
  )
  check(r.readyForManagedRehearsal === false, 'outside-window shift close blocks')
  check(r.gates.find((gate) => gate.id === 'shift_close_inside_window')?.passed === false, 'shift close inside-window gate fails')
}

// 13. Complete intervals are clipped at both reviewed-window boundaries.
{
  const events = [
    ...windowOutputEvents(),
    downtimeStart({ id: 'EV-DOWN-START-PRE', actionId: 'ACT-DOWN-START-PRE', createdAt: '2026-08-25T07:30:00.000Z' }),
    downtimeEnd({
      id: 'EV-DOWN-END-PRE',
      actionId: 'ACT-DOWN-END-PRE',
      createdAt: '2026-08-25T08:15:00.000Z',
      downtimeStartActionId: 'ACT-DOWN-START-PRE',
    }),
    downtimeStart({ id: 'EV-DOWN-START-POST', actionId: 'ACT-DOWN-START-POST', createdAt: '2026-08-25T11:45:00.000Z' }),
    downtimeEnd({
      id: 'EV-DOWN-END-POST',
      actionId: 'ACT-DOWN-END-POST',
      createdAt: '2026-08-25T12:30:00.000Z',
      downtimeStartActionId: 'ACT-DOWN-START-POST',
    }),
    shiftClose(),
  ]
  const r = projectPlantManagedOeeWindow(state({ jobs: [job()], machines: [machine()], events }), input())
  check(r.readyForManagedRehearsal === true, 'boundary-clipped complete downtime remains ready')
  check(r.metrics.downtimeMinutes === 30, 'only the two fifteen-minute in-window overlaps count')
  check(r.metrics.runtimeMinutes === 210, 'boundary-clipped downtime reduces only reviewed runtime')
}

// 14. Malformed and unclosed downtime pairs fail closed instead of becoming zero downtime.
{
  const orphan = projectPlantManagedOeeWindow(
    state({
      jobs: [job()],
      machines: [machine()],
      events: [
        ...windowOutputEvents(),
        downtimeEnd({ downtimeStartActionId: 'ACT-MISSING-START' }),
        shiftClose(),
      ],
    }),
    input(),
  )
  check(orphan.readyForManagedRehearsal === false, 'orphan downtime end blocks readiness')
  check(orphan.gates.find((gate) => gate.id === 'downtime_pairs_closed')?.passed === false, 'orphan downtime end fails pair gate')

  const reversed = projectPlantManagedOeeWindow(
    state({
      jobs: [job()],
      machines: [machine()],
      events: [
        ...windowOutputEvents(),
        downtimeStart({ createdAt: '2026-08-25T10:00:00.000Z' }),
        downtimeEnd({ createdAt: '2026-08-25T09:30:00.000Z' }),
        shiftClose(),
      ],
    }),
    input(),
  )
  check(reversed.readyForManagedRehearsal === false, 'end-before-start downtime blocks readiness')
  check(reversed.gates.find((gate) => gate.id === 'downtime_pairs_closed')?.passed === false, 'end-before-start fails pair gate')

  const preWindowOpen = projectPlantManagedOeeWindow(
    state({
      jobs: [job()],
      machines: [machine()],
      events: [
        ...windowOutputEvents(),
        downtimeStart({ createdAt: '2026-08-25T07:30:00.000Z' }),
        shiftClose(),
      ],
    }),
    input(),
  )
  check(preWindowOpen.readyForManagedRehearsal === false, 'pre-window unclosed downtime blocks readiness')
  check(preWindowOpen.gates.find((gate) => gate.id === 'downtime_pairs_closed')?.passed === false, 'pre-window unclosed downtime fails pair gate')
}

// 15. A subwindow uses only output records inside that window, never whole-shift close totals.
{
  const events = [
    outputEvent({ id: 'EV-OUTPUT-BEFORE', actionId: 'ACT-OUTPUT-BEFORE', createdAt: '2026-08-25T09:00:00.000Z', quantity: 150 }),
    outputEvent({ id: 'EV-OUTPUT-IN-GOOD', actionId: 'ACT-OUTPUT-IN-GOOD', createdAt: '2026-08-25T10:30:00.000Z', quantity: 40 }),
    outputEvent({
      id: 'EV-OUTPUT-IN-SCRAP',
      actionId: 'ACT-OUTPUT-IN-SCRAP',
      createdAt: '2026-08-25T11:00:00.000Z',
      quantity: 10,
      outputKind: 'scrap',
    }),
    shiftClose({ outputEntryCount: 3 }),
  ]
  const r = projectPlantManagedOeeWindow(
    state({ jobs: [job()], machines: [machine()], events }),
    input({ startedAt: '2026-08-25T10:00:00.000Z' }),
  )
  check(r.readyForManagedRehearsal === true, 'complete subwindow evidence is ready')
  check(r.metrics.goodUnits === 40 && r.metrics.scrapUnits === 10, 'subwindow excludes pre-window shift output')
  check(r.metrics.totalUnits === 50, 'subwindow total is derived from in-window records')
  check(r.metrics.performanceRate === 42, 'subwindow performance is not inflated by whole-shift close totals')
}

// 16. Output records on both exact time boundaries are included and source-bound.
{
  const events = [
    outputEvent({ id: 'EV-OUTPUT-AT-START', actionId: 'ACT-OUTPUT-AT-START', createdAt: '2026-08-25T10:00:00.000Z', quantity: 20 }),
    outputEvent({
      id: 'EV-OUTPUT-AT-END',
      actionId: 'ACT-OUTPUT-AT-END',
      createdAt: END,
      quantity: 5,
      outputKind: 'scrap',
    }),
    shiftClose({ goodUnits: 20, scrapUnits: 5, outputEntryCount: 2 }),
  ]
  const r = projectPlantManagedOeeWindow(
    state({ jobs: [job()], machines: [machine()], events }),
    input({ startedAt: '2026-08-25T10:00:00.000Z' }),
  )
  check(r.readyForManagedRehearsal === true, 'exact-boundary output evidence is ready')
  check(r.metrics.goodUnits === 20 && r.metrics.scrapUnits === 5, 'both output boundaries are inclusive')
}

// 17. An in-window output without an exact shift binding fails closed and zeros decision units.
{
  const r = projectPlantManagedOeeWindow(
    state({
      jobs: [job()],
      machines: [machine()],
      events: [outputEvent({ shiftRef: undefined }), shiftClose({ outputEntryCount: 1 })],
    }),
    input(),
  )
  check(r.readyForManagedRehearsal === false, 'unbound window output blocks readiness')
  check(r.gates.find((gate) => gate.id === 'source_quantity_mapping_unambiguous')?.passed === false, 'unbound window output fails source gate')
  check(r.metrics.totalUnits === 0 && r.metrics.oeeRate === 0, 'unbound window output cannot expose OEE decision units')
}

// 18. Projection is deterministic across source event ordering.
{
  const events = [
    ...windowOutputEvents(),
    downtimeStart({ id: 'EV-DOWN-START-PRE', actionId: 'ACT-DOWN-START-PRE', createdAt: '2026-08-25T07:30:00.000Z' }),
    downtimeEnd({
      id: 'EV-DOWN-END-PRE',
      actionId: 'ACT-DOWN-END-PRE',
      createdAt: '2026-08-25T08:30:00.000Z',
      downtimeStartActionId: 'ACT-DOWN-START-PRE',
    }),
    shiftClose(),
  ]
  const forward = projectPlantManagedOeeWindow(state({ jobs: [job()], machines: [machine()], events }), input())
  const reversed = projectPlantManagedOeeWindow(state({ jobs: [job()], machines: [machine()], events: [...events].reverse() }), input())
  check(JSON.stringify(forward.metrics) === JSON.stringify(reversed.metrics), 'event order does not change projected metrics')
  check(JSON.stringify(forward.gates) === JSON.stringify(reversed.gates), 'event order does not change gates')
  check(forward.windowDigest === reversed.windowDigest, 'event order does not change the projection digest')
}

console.log(JSON.stringify({ ok: true, checks }))
