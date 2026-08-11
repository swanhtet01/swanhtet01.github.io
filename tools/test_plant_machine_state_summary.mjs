// Plant machine state snapshot: running/attention/stopped counts + availabilityRate from
// ProductionState.machines. Tests all states, boundaries, and zero-division guard.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantMachineStateSummary } from './plant-machine-state-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/machine-state-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectPlantMachineStateSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let seq = 0
function machine(state = 'running') {
  seq += 1
  return { id: `machine-${seq}`, name: `Machine ${seq}`, state }
}

function state(machines = []) {
  return { jobs: [], events: [], issues: [], machines }
}

// 1. Empty state → all zeros
{
  const r = projectPlantMachineStateSummary(state())
  check(r.total === 0, 'empty: total is 0')
  check(r.running === 0, 'empty: running is 0')
  check(r.attention === 0, 'empty: attention is 0')
  check(r.stopped === 0, 'empty: stopped is 0')
  check(r.availabilityRate === 0, 'empty: availabilityRate is 0 (no zero-division)')
}

// 2. All machines running → availabilityRate 100
{
  const r = projectPlantMachineStateSummary(state([machine('running'), machine('running'), machine('running')]))
  check(r.total === 3, 'all-running: total is 3')
  check(r.running === 3, 'all-running: running is 3')
  check(r.attention === 0, 'all-running: attention is 0')
  check(r.stopped === 0, 'all-running: stopped is 0')
  check(r.availabilityRate === 100, 'all-running: availabilityRate is 100')
}

// 3. All stopped → availabilityRate 0
{
  const r = projectPlantMachineStateSummary(state([machine('stopped'), machine('stopped')]))
  check(r.running === 0, 'all-stopped: running is 0')
  check(r.stopped === 2, 'all-stopped: stopped is 2')
  check(r.availabilityRate === 0, 'all-stopped: availabilityRate is 0')
}

// 4. Attention machines counted correctly
{
  const r = projectPlantMachineStateSummary(state([machine('attention'), machine('attention'), machine('running')]))
  check(r.attention === 2, 'attention: attention count is 2')
  check(r.running === 1, 'attention: running is 1')
  // availabilityRate = round(1/3 * 100) = 33
  check(r.availabilityRate === 33, 'attention: availabilityRate is 33')
}

// 5. Mixed running/attention/stopped
{
  const machines = [
    machine('running'), machine('running'),
    machine('attention'),
    machine('stopped'), machine('stopped'), machine('stopped'),
  ]
  const r = projectPlantMachineStateSummary(state(machines))
  check(r.total === 6, 'mixed: total is 6')
  check(r.running === 2, 'mixed: running is 2')
  check(r.attention === 1, 'mixed: attention is 1')
  check(r.stopped === 3, 'mixed: stopped is 3')
  // round(2/6 * 100) = round(33.33) = 33
  check(r.availabilityRate === 33, 'mixed: availabilityRate is 33')
}

// 6. Single running machine → 100%
{
  const r = projectPlantMachineStateSummary(state([machine('running')]))
  check(r.total === 1, 'single-running: total is 1')
  check(r.availabilityRate === 100, 'single-running: availabilityRate is 100')
}

// 7. 2 running out of 3 → 67%
{
  const r = projectPlantMachineStateSummary(state([machine('running'), machine('running'), machine('stopped')]))
  // round(2/3 * 100) = round(66.67) = 67
  check(r.availabilityRate === 67, 'two-of-three: availabilityRate is 67')
}

console.log(JSON.stringify({ ok: true, checks }))
