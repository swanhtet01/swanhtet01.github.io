// Plant machine state brief: running/attention/stopped distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantMachineStateBrief } from './plant-machine-state-brief.ts'`,
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

const { projectPlantMachineStateBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let machineId = 0
function machine(state) {
  machineId++
  return { id: `MCH-${machineId}`, name: `Machine ${machineId}`, state }
}

function state(machines) {
  return { schema: 'supermega.production.workspace.v2', jobs: [], events: [], issues: [], machines }
}

// 1. No machines → all zeros
{
  const r = projectPlantMachineStateBrief(state([]))
  check(r.totalMachines === 0, 'empty: totalMachines 0')
  check(r.runningCount === 0, 'empty: runningCount 0')
  check(r.attentionCount === 0, 'empty: attentionCount 0')
  check(r.stoppedCount === 0, 'empty: stoppedCount 0')
  check(r.runningRate === 0, 'empty: runningRate 0')
  check(r.attentionRate === 0, 'empty: attentionRate 0')
  check(r.stoppedRate === 0, 'empty: stoppedRate 0')
}

// 2. Single running machine
{
  const r = projectPlantMachineStateBrief(state([machine('running')]))
  check(r.totalMachines === 1, 'running-only: totalMachines 1')
  check(r.runningCount === 1, 'running-only: runningCount 1')
  check(r.attentionCount === 0, 'running-only: attentionCount 0')
  check(r.stoppedCount === 0, 'running-only: stoppedCount 0')
  check(r.runningRate === 100, 'running-only: runningRate 100')
  check(r.attentionRate === 0, 'running-only: attentionRate 0')
  check(r.stoppedRate === 0, 'running-only: stoppedRate 0')
}

// 3. Single attention machine
{
  const r = projectPlantMachineStateBrief(state([machine('attention')]))
  check(r.attentionCount === 1, 'attention-only: attentionCount 1')
  check(r.attentionRate === 100, 'attention-only: attentionRate 100')
  check(r.runningRate === 0, 'attention-only: runningRate 0')
}

// 4. Single stopped machine
{
  const r = projectPlantMachineStateBrief(state([machine('stopped')]))
  check(r.stoppedCount === 1, 'stopped-only: stoppedCount 1')
  check(r.stoppedRate === 100, 'stopped-only: stoppedRate 100')
}

// 5. Mixed: 2 running, 1 attention, 1 stopped
{
  const machines = [machine('running'), machine('running'), machine('attention'), machine('stopped')]
  const r = projectPlantMachineStateBrief(state(machines))
  check(r.totalMachines === 4, 'mixed: totalMachines 4')
  check(r.runningCount === 2, 'mixed: runningCount 2')
  check(r.attentionCount === 1, 'mixed: attentionCount 1')
  check(r.stoppedCount === 1, 'mixed: stoppedCount 1')
  check(r.runningRate === 50, 'mixed: runningRate 50')
  check(r.attentionRate === 25, 'mixed: attentionRate 25')
  check(r.stoppedRate === 25, 'mixed: stoppedRate 25')
}

// 6. Math.round: 1 running out of 3 → round(33.33) = 33
{
  const r = projectPlantMachineStateBrief(state([machine('running'), machine('attention'), machine('stopped')]))
  check(r.runningRate === 33, 'round: runningRate 33')
  check(r.attentionRate === 33, 'round: attentionRate 33')
  check(r.stoppedRate === 33, 'round: stoppedRate 33')
}

// 7. All running
{
  const r = projectPlantMachineStateBrief(state([machine('running'), machine('running')]))
  check(r.runningCount === 2, 'all-running: runningCount 2')
  check(r.runningRate === 100, 'all-running: runningRate 100')
  check(r.attentionCount === 0, 'all-running: attentionCount 0')
  check(r.stoppedCount === 0, 'all-running: stoppedCount 0')
}

console.log(JSON.stringify({ ok: true, checks }))
