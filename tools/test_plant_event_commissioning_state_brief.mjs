// Plant event commissioning state brief: toState enum distribution on equipment_commissioned events.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEventCommissioningStateBrief } from './plant-event-commissioning-state-brief.ts'`,
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

const { projectPlantEventCommissioningStateBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let eventId = 0
function commissionEvent(toState) {
  eventId++
  const obj = {
    id: `EVT-${eventId}`,
    actionId: `ACT-${eventId}`,
    createdAt: '2026-08-01T09:00:00Z',
    actor: 'engineer-1',
    kind: 'equipment_commissioned',
    subjectId: `EQ-${eventId}`,
    reason: 'New installation',
    evidenceReference: `REF-${eventId}`,
    summary: `Equipment EQ-${eventId} commissioned`,
  }
  if (toState !== undefined) obj.toState = toState
  return obj
}
function otherEvent() {
  eventId++
  return {
    id: `EVT-${eventId}`,
    actionId: `ACT-O-${eventId}`,
    createdAt: '2026-08-01T08:00:00Z',
    actor: 'worker-1',
    kind: 'output_recorded',
    quantity: 5,
    shiftRef: 'S1',
    outputKind: 'good',
  }
}

function state(events) {
  return {
    schema: 'supermega.production.workspace.v2',
    revision: 0,
    jobs: [],
    issues: [],
    machines: [],
    events,
    openingPlan: null,
    orderExecution: null,
    orderPortfolio: null,
    equipmentMaster: null,
  }
}

// 1. No events → all zeros
{
  const r = projectPlantEventCommissioningStateBrief(state([]))
  check(r.totalCommissioningEvents === 0, 'empty: totalCommissioningEvents 0')
  check(r.eventsWithToState === 0, 'empty: eventsWithToState 0')
  check(r.toStatePresenceRate === 0, 'empty: toStatePresenceRate 0')
  check(r.runningCount === 0, 'empty: runningCount 0')
  check(r.attentionCount === 0, 'empty: attentionCount 0')
  check(r.stoppedCount === 0, 'empty: stoppedCount 0')
}

// 2. Other events not counted
{
  const r = projectPlantEventCommissioningStateBrief(state([otherEvent(), otherEvent()]))
  check(r.totalCommissioningEvents === 0, 'other: totalCommissioningEvents 0')
  check(r.toStatePresenceRate === 0, 'other: toStatePresenceRate 0')
}

// 3. Commissioning events without toState
{
  const r = projectPlantEventCommissioningStateBrief(
    state([commissionEvent(), commissionEvent()]),
  )
  check(r.totalCommissioningEvents === 2, 'no-state: totalCommissioningEvents 2')
  check(r.eventsWithToState === 0, 'no-state: eventsWithToState 0')
  check(r.toStatePresenceRate === 0, 'no-state: toStatePresenceRate 0')
  check(r.runningCount === 0, 'no-state: runningCount 0')
}

// 4. Single event — running
{
  const r = projectPlantEventCommissioningStateBrief(state([commissionEvent('running')]))
  check(r.totalCommissioningEvents === 1, 'running: totalCommissioningEvents 1')
  check(r.eventsWithToState === 1, 'running: eventsWithToState 1')
  check(r.toStatePresenceRate === 100, 'running: toStatePresenceRate 100')
  check(r.runningCount === 1, 'running: runningCount 1')
  check(r.attentionCount === 0, 'running: attentionCount 0')
  check(r.stoppedCount === 0, 'running: stoppedCount 0')
}

// 5. Single event — attention
{
  const r = projectPlantEventCommissioningStateBrief(state([commissionEvent('attention')]))
  check(r.attentionCount === 1, 'attention: attentionCount 1')
  check(r.runningCount === 0, 'attention: runningCount 0')
  check(r.stoppedCount === 0, 'attention: stoppedCount 0')
}

// 6. Single event — stopped
{
  const r = projectPlantEventCommissioningStateBrief(state([commissionEvent('stopped')]))
  check(r.stoppedCount === 1, 'stopped: stoppedCount 1')
  check(r.runningCount === 0, 'stopped: runningCount 0')
  check(r.attentionCount === 0, 'stopped: attentionCount 0')
}

// 7. Mixed — all three states
{
  const r = projectPlantEventCommissioningStateBrief(
    state([
      commissionEvent('running'),
      commissionEvent('running'),
      commissionEvent('attention'),
      commissionEvent('stopped'),
    ]),
  )
  check(r.totalCommissioningEvents === 4, 'mixed: totalCommissioningEvents 4')
  check(r.eventsWithToState === 4, 'mixed: eventsWithToState 4')
  check(r.toStatePresenceRate === 100, 'mixed: toStatePresenceRate 100')
  check(r.runningCount === 2, 'mixed: runningCount 2')
  check(r.attentionCount === 1, 'mixed: attentionCount 1')
  check(r.stoppedCount === 1, 'mixed: stoppedCount 1')
}

// 8. Mixed — some with toState, some without
{
  const r = projectPlantEventCommissioningStateBrief(
    state([
      commissionEvent('running'),
      commissionEvent(),
      commissionEvent('stopped'),
      commissionEvent(),
    ]),
  )
  check(r.totalCommissioningEvents === 4, 'partial: totalCommissioningEvents 4')
  check(r.eventsWithToState === 2, 'partial: eventsWithToState 2')
  check(r.toStatePresenceRate === 50, 'partial: toStatePresenceRate 50')
  check(r.runningCount === 1, 'partial: runningCount 1')
  check(r.stoppedCount === 1, 'partial: stoppedCount 1')
}

// 9. Mixed with other events — only equipment_commissioned counted
{
  const r = projectPlantEventCommissioningStateBrief(
    state([
      otherEvent(),
      commissionEvent('running'),
      otherEvent(),
      commissionEvent('attention'),
    ]),
  )
  check(r.totalCommissioningEvents === 2, 'mixed-other: totalCommissioningEvents 2')
  check(r.runningCount === 1, 'mixed-other: runningCount 1')
  check(r.attentionCount === 1, 'mixed-other: attentionCount 1')
}

// 10. Presence rate rounds correctly: 1 of 3 = 33%
{
  const r = projectPlantEventCommissioningStateBrief(
    state([commissionEvent('running'), commissionEvent(), commissionEvent()]),
  )
  check(r.toStatePresenceRate === 33, 'round: presenceRate 33')
}

console.log(JSON.stringify({ ok: true, checks }))
