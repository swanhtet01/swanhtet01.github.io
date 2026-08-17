// Plant job short-close brief: units lost from short-closed jobs, yield loss rate.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantJobShortCloseBrief } from './plant-job-short-close-brief.ts'`,
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

const { projectPlantJobShortCloseBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.production.workspace.v1'

function closure(remainingUnits = 10) {
  return {
    actionId: 'ACT-1', closedAt: '2026-01-01T14:00:00Z', closedBy: 'op',
    reason: 'end of shift', evidenceReference: 'EV-1', shiftRef: 'S-1',
    remainingUnits,
  }
}

function job({ id = 'JOB-1', target = 100, output = 0, closureObj } = {}) {
  const base = {
    id, line: 'line-a', product: 'P-1', target, output,
    startAt: '2026-01-01T06:00:00Z', dueAt: '2026-01-01T14:00:00Z',
  }
  if (closureObj !== undefined) base.closure = closureObj
  return base
}

function state(jobs = []) {
  return { schema: SCHEMA, revision: 1, jobs, issues: [], machines: [], events: [] }
}

// 1. Empty state
{
  const r = projectPlantJobShortCloseBrief(state([]))
  check(r.totalJobs === 0, 'empty: totalJobs 0')
  check(r.closedShortJobs === 0, 'empty: closedShortJobs 0')
  check(r.totalTargetUnits === 0, 'empty: totalTargetUnits 0')
  check(r.totalUnitsLost === 0, 'empty: totalUnitsLost 0')
  check(r.unitLossRate === 0, 'empty: unitLossRate 0')
  check(r.averageUnitsLostPerClose === 0, 'empty: averageUnitsLostPerClose 0')
  check(r.largestSingleLoss === 0, 'empty: largestSingleLoss 0')
}

// 2. Job with no closure — no loss
{
  const r = projectPlantJobShortCloseBrief(state([job({ id: 'JOB-1', target: 50 })]))
  check(r.totalTargetUnits === 50, 'no-closure: totalTargetUnits 50')
  check(r.closedShortJobs === 0, 'no-closure: closedShortJobs 0')
  check(r.totalUnitsLost === 0, 'no-closure: totalUnitsLost 0')
  check(r.unitLossRate === 0, 'no-closure: unitLossRate 0')
}

// 3. Single short-closed job: 10 units lost out of 100 target = 10%
{
  const r = projectPlantJobShortCloseBrief(state([
    job({ id: 'JOB-1', target: 100, closureObj: closure(10) }),
  ]))
  check(r.closedShortJobs === 1, 'single: closedShortJobs 1')
  check(r.totalUnitsLost === 10, 'single: totalUnitsLost 10')
  check(r.unitLossRate === 10, 'single: unitLossRate 10')
  check(r.averageUnitsLostPerClose === 10, 'single: averageUnitsLostPerClose 10')
  check(r.largestSingleLoss === 10, 'single: largestSingleLoss 10')
}

// 4. Two short-closed jobs: largestSingleLoss picks max
{
  const r = projectPlantJobShortCloseBrief(state([
    job({ id: 'JOB-1', target: 100, closureObj: closure(5) }),
    job({ id: 'JOB-2', target: 200, closureObj: closure(40) }),
  ]))
  check(r.closedShortJobs === 2, 'two: closedShortJobs 2')
  check(r.totalUnitsLost === 45, 'two: totalUnitsLost 45')
  check(r.largestSingleLoss === 40, 'two: largestSingleLoss 40')
  check(r.averageUnitsLostPerClose === 23, 'two: averageUnitsLostPerClose 23 (round 22.5)')
}

// 5. Loss rate rounds: 1 lost out of 3 total = 33%
{
  const r = projectPlantJobShortCloseBrief(state([
    job({ id: 'JOB-1', target: 3, closureObj: closure(1) }),
  ]))
  check(r.unitLossRate === 33, 'round: unitLossRate 33 (1/3×100)')
}

// 6. Mix of open and short-closed jobs
{
  const r = projectPlantJobShortCloseBrief(state([
    job({ id: 'JOB-1', target: 100 }),
    job({ id: 'JOB-2', target: 100, closureObj: closure(20) }),
    job({ id: 'JOB-3', target: 100, closureObj: closure(30) }),
  ]))
  check(r.totalJobs === 3, 'mix: totalJobs 3')
  check(r.closedShortJobs === 2, 'mix: closedShortJobs 2')
  check(r.totalTargetUnits === 300, 'mix: totalTargetUnits 300')
  check(r.totalUnitsLost === 50, 'mix: totalUnitsLost 50')
  check(r.unitLossRate === 17, 'mix: unitLossRate 17 (50/300×100 ≈ 16.7 → round)')
  check(r.averageUnitsLostPerClose === 25, 'mix: averageUnitsLostPerClose 25')
}

console.log(JSON.stringify({ ok: true, checks }))
