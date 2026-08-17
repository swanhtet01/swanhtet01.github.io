// Plant job reason brief: qualityHold.reason distribution, closure.reason distribution, closure.remainingUnits.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantJobReasonBrief } from './plant-job-reason-brief.ts'`,
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

const { projectPlantJobReasonBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.production.workspace.v2'
const PROOF = { actionId: 'ACT-1', actorId: 'user-1', timestamp: '2026-08-12T09:00:00Z' }

let jobId = 0

function qualityHold(reason) {
  return {
    actionId: 'QH-1',
    heldAt: '2026-08-10T09:00:00Z',
    heldBy: 'inspector-1',
    reason,
    evidenceReference: 'EVD-QH-1',
  }
}

function closure(reason, remainingUnits = 0) {
  return {
    actionId: 'CL-1',
    closedAt: '2026-08-11T17:00:00Z',
    closedBy: 'supervisor-1',
    reason,
    evidenceReference: 'EVD-CL-1',
    shiftRef: 'SHIFT-1',
    remainingUnits,
  }
}

function job({ hold, close } = {}) {
  jobId++
  const base = {
    id: `JOB-${jobId}`,
    openedAt: '2026-08-01T08:00:00Z',
    productionLine: 'Line A',
    item: 'item-1',
    target: 100,
    output: 80,
    scrap: 5,
    status: 'in_progress',
    opening: PROOF,
  }
  if (hold !== undefined) base.qualityHold = hold
  if (close !== undefined) base.closure = close
  return base
}

function state(jobs = []) {
  return {
    schema: SCHEMA,
    revision: 1,
    jobs,
    issues: [],
    machines: [],
    events: [],
  }
}

// 1. Empty jobs → all zeros
{
  const r = projectPlantJobReasonBrief(state([]))
  check(r.totalJobs === 0, 'empty: totalJobs 0')
  check(r.qualityHoldRate === 0, 'empty: qualityHoldRate 0')
  check(r.closureRate === 0, 'empty: closureRate 0')
  check(r.totalRemainingUnits === 0, 'empty: totalRemainingUnits 0')
  check(r.averageRemainingUnits === 0, 'empty: averageRemainingUnits 0')
}

// 2. Job with no hold or closure
{
  const r = projectPlantJobReasonBrief(state([job()]))
  check(r.totalJobs === 1, 'no-hold-close: totalJobs 1')
  check(r.jobsWithQualityHold === 0, 'no-hold-close: jobsWithQualityHold 0')
  check(r.jobsWithClosure === 0, 'no-hold-close: jobsWithClosure 0')
  check(r.totalRemainingUnits === 0, 'no-hold-close: totalRemainingUnits 0')
}

// 3. Job with quality hold only
{
  const r = projectPlantJobReasonBrief(state([job({ hold: qualityHold('Dimension out of spec.') })]))
  check(r.jobsWithQualityHold === 1, 'hold-only: jobsWithQualityHold 1')
  check(r.qualityHoldRate === 100, 'hold-only: qualityHoldRate 100')
  check(r.uniqueQualityHoldReasons === 1, 'hold-only: uniqueQualityHoldReasons 1')
  check(r.topQualityHoldReasonsByCount[0]?.reason === 'Dimension out of spec.', 'hold-only: top reason')
}

// 4. Job with closure only
{
  const r = projectPlantJobReasonBrief(state([job({ close: closure('Target met.', 5) })]))
  check(r.jobsWithClosure === 1, 'close-only: jobsWithClosure 1')
  check(r.closureRate === 100, 'close-only: closureRate 100')
  check(r.uniqueClosureReasons === 1, 'close-only: uniqueClosureReasons 1')
  check(r.totalRemainingUnits === 5, 'close-only: totalRemainingUnits 5')
  check(r.averageRemainingUnits === 5, 'close-only: averageRemainingUnits 5')
}

// 5. Job with both hold and closure
{
  const r = projectPlantJobReasonBrief(state([
    job({ hold: qualityHold('Surface defect.'), close: closure('Shift end.', 10) }),
  ]))
  check(r.jobsWithQualityHold === 1, 'both: jobsWithQualityHold 1')
  check(r.jobsWithClosure === 1, 'both: jobsWithClosure 1')
  check(r.qualityHoldRate === 100, 'both: qualityHoldRate 100')
  check(r.closureRate === 100, 'both: closureRate 100')
}

// 6. Mixed: 4 jobs
{
  const r = projectPlantJobReasonBrief(state([
    job({ hold: qualityHold('Dimension.'), close: closure('Complete.', 0) }),
    job({ hold: qualityHold('Dimension.') }),
    job({ close: closure('Shift end.', 8) }),
    job(),
  ]))
  check(r.totalJobs === 4, 'mixed: totalJobs 4')
  check(r.jobsWithQualityHold === 2, 'mixed: jobsWithQualityHold 2')
  check(r.qualityHoldRate === 50, 'mixed: qualityHoldRate 50')
  check(r.uniqueQualityHoldReasons === 1, 'mixed: uniqueQualityHoldReasons 1')
  check(r.topQualityHoldReasonsByCount[0]?.count === 2, 'mixed: top hold reason count 2')
  check(r.jobsWithClosure === 2, 'mixed: jobsWithClosure 2')
  check(r.closureRate === 50, 'mixed: closureRate 50')
  check(r.totalRemainingUnits === 8, 'mixed: totalRemainingUnits 8')
  check(r.averageRemainingUnits === 4, 'mixed: averageRemainingUnits 4')
}

// 7. Top-5 cap for quality hold reasons
{
  const reasons = ['A', 'B', 'C', 'D', 'E', 'F']
  const jobs = reasons.map(r => job({ hold: qualityHold(r) }))
  const r = projectPlantJobReasonBrief(state(jobs))
  check(r.uniqueQualityHoldReasons === 6, 'top5: uniqueQualityHoldReasons 6')
  check(r.topQualityHoldReasonsByCount.length === 5, 'top5: topQualityHoldReasonsByCount capped at 5')
  check(r.topQualityHoldReasonsByCount[0]?.reason === 'A', 'top5: tiebreak alphabetic first')
}

console.log(JSON.stringify({ ok: true, checks }))
