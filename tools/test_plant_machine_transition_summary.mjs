// Plant machine transition summary: analyses machine_state_changed events to compute
// totalTransitions, toStoppedCount/toAttentionCount/toRunningCount, byTransition
// (sorted desc by count then from/to alpha), and byMachine (sorted desc by transitionCount).
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantMachineTransitionSummary } from './plant-machine-transition-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/transition-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectPlantMachineTransitionSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let seq = 0
function mkTransition(machineId, from, to) {
  seq++
  return {
    id: `e${seq}`, actionId: `a${seq}`, createdAt: '2026-08-11T08:00:00.000Z',
    actor: 'system', reason: 'state change', evidenceReference: 'ref1',
    kind: 'machine_state_changed', subjectId: machineId,
    summary: `${machineId} changed to ${to}`, fromState: from, toState: to,
  }
}

function state(events = []) {
  return { jobs: [], events, issues: [], machines: [] }
}

// 1. Empty state → all zeros
{
  const r = projectPlantMachineTransitionSummary(state())
  check(r.totalTransitions === 0, 'empty: totalTransitions 0')
  check(r.toStoppedCount === 0, 'empty: toStoppedCount 0')
  check(r.toAttentionCount === 0, 'empty: toAttentionCount 0')
  check(r.toRunningCount === 0, 'empty: toRunningCount 0')
  check(r.byTransition.length === 0, 'empty: byTransition empty')
  check(r.byMachine.length === 0, 'empty: byMachine empty')
}

// 2. Non-machine events are ignored
{
  const r = projectPlantMachineTransitionSummary(state([
    { id: 'e1', actionId: 'a1', createdAt: '2026-08-11T08:00:00.000Z', actor: 'op1', reason: 'work', evidenceReference: 'ref1', kind: 'job_created', subjectId: 'J1', summary: 'job created' },
  ]))
  check(r.totalTransitions === 0, 'non-machine: ignored')
}

// 3. Single running→stopped transition
{
  const r = projectPlantMachineTransitionSummary(state([
    mkTransition('M1', 'running', 'stopped'),
  ]))
  check(r.totalTransitions === 1, 'single: totalTransitions 1')
  check(r.toStoppedCount === 1, 'single: toStoppedCount 1')
  check(r.toAttentionCount === 0, 'single: toAttentionCount 0')
  check(r.toRunningCount === 0, 'single: toRunningCount 0')
  check(r.byTransition.length === 1, 'single: byTransition 1 entry')
  check(r.byTransition[0].from === 'running', 'single: from running')
  check(r.byTransition[0].to === 'stopped', 'single: to stopped')
  check(r.byTransition[0].count === 1, 'single: count 1')
}

// 4. toAttentionCount and toRunningCount
{
  const r = projectPlantMachineTransitionSummary(state([
    mkTransition('M1', 'running', 'attention'),
    mkTransition('M1', 'attention', 'running'),
    mkTransition('M1', 'attention', 'stopped'),
  ]))
  check(r.toAttentionCount === 1, 'counts: toAttentionCount 1')
  check(r.toRunningCount === 1, 'counts: toRunningCount 1')
  check(r.toStoppedCount === 1, 'counts: toStoppedCount 1')
  check(r.totalTransitions === 3, 'counts: totalTransitions 3')
}

// 5. byTransition sorted desc by count
{
  const events = [
    mkTransition('M1', 'running', 'attention'),
    mkTransition('M2', 'running', 'attention'),
    mkTransition('M3', 'running', 'attention'),
    mkTransition('M1', 'running', 'stopped'),
  ]
  const r = projectPlantMachineTransitionSummary(state(events))
  check(r.byTransition[0].from === 'running', 'sort: most frequent first (running→attention)')
  check(r.byTransition[0].to === 'attention', 'sort: most frequent to attention')
  check(r.byTransition[0].count === 3, 'sort: count 3')
  check(r.byTransition[1].count === 1, 'sort: second count 1')
}

// 6. Tie-break: same count → from alpha, then to alpha
{
  const events = [
    mkTransition('M1', 'stopped', 'running'),
    mkTransition('M2', 'attention', 'running'),
  ]
  const r = projectPlantMachineTransitionSummary(state(events))
  // 'attention' < 'stopped' alphabetically
  check(r.byTransition[0].from === 'attention', 'tie-from: attention before stopped')
  check(r.byTransition[1].from === 'stopped', 'tie-from: stopped after attention')
}

// 7. Tie-break on to: same from, same count → to alpha
{
  const events = [
    mkTransition('M1', 'running', 'stopped'),
    mkTransition('M2', 'running', 'attention'),
  ]
  const r = projectPlantMachineTransitionSummary(state(events))
  // 'attention' < 'stopped' alphabetically
  check(r.byTransition[0].to === 'attention', 'tie-to: attention before stopped')
}

// 8. byMachine sorted desc by transitionCount
{
  const events = [
    mkTransition('M-A', 'running', 'attention'),
    mkTransition('M-B', 'running', 'attention'),
    mkTransition('M-B', 'attention', 'stopped'),
    mkTransition('M-B', 'stopped', 'running'),
  ]
  const r = projectPlantMachineTransitionSummary(state(events))
  check(r.byMachine[0].machineId === 'M-B', 'machine-sort: M-B first (3 transitions)')
  check(r.byMachine[0].transitionCount === 3, 'machine-sort: M-B count 3')
  check(r.byMachine[1].machineId === 'M-A', 'machine-sort: M-A second')
}

// 9. stoppedCount per machine
{
  const events = [
    mkTransition('M1', 'running', 'stopped'),
    mkTransition('M1', 'stopped', 'running'),
    mkTransition('M1', 'running', 'stopped'),
  ]
  const r = projectPlantMachineTransitionSummary(state(events))
  check(r.byMachine[0].stoppedCount === 2, 'stopped-count: M1 stopped twice')
  check(r.toStoppedCount === 2, 'stopped-count: global toStoppedCount 2')
}

// 10. Tie-break byMachine: same transitionCount → alpha
{
  const events = [
    mkTransition('Zebra', 'running', 'attention'),
    mkTransition('Alpha', 'running', 'attention'),
  ]
  const r = projectPlantMachineTransitionSummary(state(events))
  check(r.byMachine[0].machineId === 'Alpha', 'machine-tie: Alpha before Zebra')
  check(r.byMachine[1].machineId === 'Zebra', 'machine-tie: Zebra after Alpha')
}

console.log(JSON.stringify({ ok: true, checks }))
