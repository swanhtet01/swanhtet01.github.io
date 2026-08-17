// Plant machine name brief: ProductionMachine.name uniqueness and distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantMachineNameBrief } from './plant-machine-name-brief.ts'`,
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

const { projectPlantMachineNameBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let machineSeq = 0
function machine(name = 'Mixer', state = 'running') {
  machineSeq++
  return { id: `MCH-${machineSeq}`, name, state }
}

function state(machines = []) {
  return { schema: 'supermega.production.workspace.v2', issues: [], machines, jobs: [], events: [] }
}

// 1. Empty machines → zeros
{
  const r = projectPlantMachineNameBrief(state([]))
  check(r.totalMachines === 0, 'empty: totalMachines 0')
  check(r.uniqueNames === 0, 'empty: uniqueNames 0')
  check(r.topNamesByCount.length === 0, 'empty: topNames empty')
}

// 2. Single machine
{
  const r = projectPlantMachineNameBrief(state([machine('Lathe')]))
  check(r.totalMachines === 1, 'single: totalMachines 1')
  check(r.uniqueNames === 1, 'single: uniqueNames 1')
  check(r.topNamesByCount[0].name === 'Lathe', 'single: top name Lathe')
  check(r.topNamesByCount[0].count === 1, 'single: count 1')
}

// 3. All unique names
{
  const r = projectPlantMachineNameBrief(state([machine('A'), machine('B'), machine('C')]))
  check(r.totalMachines === 3, 'all-unique: totalMachines 3')
  check(r.uniqueNames === 3, 'all-unique: uniqueNames 3')
}

// 4. Repeated names: count accumulation and sort order
{
  const r = projectPlantMachineNameBrief(state([
    machine('Mixer'), machine('Lathe'), machine('Mixer'), machine('Mixer'), machine('Lathe'),
  ]))
  check(r.totalMachines === 5, 'repeated: totalMachines 5')
  check(r.uniqueNames === 2, 'repeated: uniqueNames 2')
  check(r.topNamesByCount[0].name === 'Mixer', 'repeated: Mixer first')
  check(r.topNamesByCount[0].count === 3, 'repeated: Mixer count 3')
  check(r.topNamesByCount[1].name === 'Lathe', 'repeated: Lathe second')
  check(r.topNamesByCount[1].count === 2, 'repeated: Lathe count 2')
}

// 5. Alphabetical tie-break for equal counts
{
  const r = projectPlantMachineNameBrief(state([machine('Zebra'), machine('Apple')]))
  check(r.topNamesByCount[0].name === 'Apple', 'tiebreak: Apple before Zebra')
}

// 6. Top-5 cap: 6 distinct names → length 5
{
  const r = projectPlantMachineNameBrief(state(
    ['A', 'B', 'C', 'D', 'E', 'F'].map(n => machine(n)),
  ))
  check(r.topNamesByCount.length === 5, 'top5: capped at 5')
  check(r.totalMachines === 6, 'top5: totalMachines 6')
  check(r.uniqueNames === 6, 'top5: uniqueNames 6')
}

console.log(JSON.stringify({ ok: true, checks }))
