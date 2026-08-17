// Plant event downtime brief: downtime_started / downtime_ended counts + downtimeStartActionId uniqueness.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEventDowntimeBrief } from './plant-event-downtime-brief.ts'`,
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

const { projectPlantEventDowntimeBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let eventId = 0
function startEvent() {
  eventId++
  return { id: `EVT-${eventId}`, actionId: `ACT-S-${eventId}`, createdAt: '2026-08-01T09:00:00Z', actor: 'operator-1', kind: 'downtime_started' }
}
function endEvent(downtimeStartActionId) {
  eventId++
  return { id: `EVT-${eventId}`, actionId: `ACT-E-${eventId}`, createdAt: '2026-08-01T10:00:00Z', actor: 'operator-1', kind: 'downtime_ended', downtimeStartActionId }
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
  const r = projectPlantEventDowntimeBrief(state([]))
  check(r.totalDowntimeStartEvents === 0, 'empty: totalDowntimeStartEvents 0')
  check(r.totalDowntimeEndEvents === 0, 'empty: totalDowntimeEndEvents 0')
  check(r.downtimePairCompletionRate === 0, 'empty: downtimePairCompletionRate 0')
  check(r.uniqueDowntimeStartActionIds === 0, 'empty: uniqueDowntimeStartActionIds 0')
}

// 2. Only other events → zero downtime counts
{
  const r = projectPlantEventDowntimeBrief(state([otherEvent(), otherEvent()]))
  check(r.totalDowntimeStartEvents === 0, 'other: totalDowntimeStartEvents 0')
  check(r.totalDowntimeEndEvents === 0, 'other: totalDowntimeEndEvents 0')
  check(r.downtimePairCompletionRate === 0, 'other: rate 0')
}

// 3. Only start events → rate 0
{
  const r = projectPlantEventDowntimeBrief(state([startEvent(), startEvent()]))
  check(r.totalDowntimeStartEvents === 2, 'starts-only: totalDowntimeStartEvents 2')
  check(r.totalDowntimeEndEvents === 0, 'starts-only: totalDowntimeEndEvents 0')
  check(r.downtimePairCompletionRate === 0, 'starts-only: rate 0')
  check(r.uniqueDowntimeStartActionIds === 0, 'starts-only: uniqueDowntimeStartActionIds 0')
}

// 4. Balanced pairs → rate 100
{
  const s1 = startEvent()
  const s2 = startEvent()
  const r = projectPlantEventDowntimeBrief(state([s1, s2, endEvent(s1.actionId), endEvent(s2.actionId)]))
  check(r.totalDowntimeStartEvents === 2, 'balanced: totalDowntimeStartEvents 2')
  check(r.totalDowntimeEndEvents === 2, 'balanced: totalDowntimeEndEvents 2')
  check(r.downtimePairCompletionRate === 100, 'balanced: rate 100')
  check(r.uniqueDowntimeStartActionIds === 2, 'balanced: uniqueDowntimeStartActionIds 2')
}

// 5. More starts than ends → partial rate
{
  const s1 = startEvent()
  const r = projectPlantEventDowntimeBrief(state([s1, startEvent(), startEvent(), endEvent(s1.actionId)]))
  check(r.totalDowntimeStartEvents === 3, 'partial: totalDowntimeStartEvents 3')
  check(r.totalDowntimeEndEvents === 1, 'partial: totalDowntimeEndEvents 1')
  check(r.downtimePairCompletionRate === 33, 'partial: rate 33')
}

// 6. Duplicate downtimeStartActionId references → uniqueDowntimeStartActionIds counts unique IDs
{
  const s = startEvent()
  const r = projectPlantEventDowntimeBrief(state([s, endEvent(s.actionId), endEvent(s.actionId)]))
  check(r.totalDowntimeEndEvents === 2, 'dup-ref: totalDowntimeEndEvents 2')
  check(r.uniqueDowntimeStartActionIds === 1, 'dup-ref: uniqueDowntimeStartActionIds 1 (deduped)')
}

// 7. Mix of event kinds → only downtime events counted
{
  const s = startEvent()
  const r = projectPlantEventDowntimeBrief(state([otherEvent(), s, otherEvent(), endEvent(s.actionId), otherEvent()]))
  check(r.totalDowntimeStartEvents === 1, 'mix: totalDowntimeStartEvents 1')
  check(r.totalDowntimeEndEvents === 1, 'mix: totalDowntimeEndEvents 1')
  check(r.downtimePairCompletionRate === 100, 'mix: rate 100')
}

console.log(JSON.stringify({ ok: true, checks }))
