// Plant job priority brief: urgent/normal/low breakdown, urgent quality holds.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantJobPriorityBrief } from './plant-job-priority-brief.ts'`,
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

const { projectPlantJobPriorityBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.production.workspace.v1'

function job({ id = 'JOB-1', priority, closure, qualityHold } = {}) {
  const base = {
    id, line: 'line-a', product: 'P-1', target: 10, output: 0,
    startAt: '2026-01-01T06:00:00Z', dueAt: '2026-01-01T14:00:00Z',
  }
  if (priority !== undefined) base.priority = priority
  if (closure !== undefined) base.closure = closure
  if (qualityHold !== undefined) base.qualityHold = qualityHold
  return base
}

const CLOSURE = { actionId: 'ACT-1', closedAt: '2026-01-01T14:00:00Z', closedBy: 'op', reason: 'done', evidenceReference: 'EV-1', shiftRef: 'S-1' }
const HOLD = { actionId: 'ACT-H', heldAt: '2026-01-01T10:00:00Z', heldBy: 'qc', reason: 'defect', evidenceReference: 'EV-H' }

function state(jobs = []) {
  return { schema: SCHEMA, revision: 1, jobs, issues: [], machines: [], events: [] }
}

// 1. Empty state
{
  const r = projectPlantJobPriorityBrief(state([]))
  check(r.totalJobs === 0, 'empty: totalJobs 0')
  check(r.byPriority.urgent === 0, 'empty: byPriority.urgent 0')
  check(r.byPriority.normal === 0, 'empty: byPriority.normal 0')
  check(r.byPriority.low === 0, 'empty: byPriority.low 0')
  check(r.byPriority.unspecified === 0, 'empty: byPriority.unspecified 0')
  check(r.urgentRate === 0, 'empty: urgentRate 0')
  check(r.urgentOpenJobs === 0, 'empty: urgentOpenJobs 0')
}

// 2. Job with no priority → unspecified
{
  const r = projectPlantJobPriorityBrief(state([job({ id: 'JOB-1' })]))
  check(r.byPriority.unspecified === 1, 'unspecified: byPriority.unspecified 1')
  check(r.byPriority.urgent === 0, 'unspecified: byPriority.urgent 0')
}

// 3. Urgent open job
{
  const r = projectPlantJobPriorityBrief(state([job({ id: 'JOB-1', priority: 'urgent' })]))
  check(r.byPriority.urgent === 1, 'urgent-open: byPriority.urgent 1')
  check(r.urgentOpenJobs === 1, 'urgent-open: urgentOpenJobs 1')
  check(r.urgentCompletedJobs === 0, 'urgent-open: urgentCompletedJobs 0')
  check(r.urgentRate === 100, 'urgent-open: urgentRate 100')
}

// 4. Urgent completed job
{
  const r = projectPlantJobPriorityBrief(state([job({ id: 'JOB-1', priority: 'urgent', closure: CLOSURE })]))
  check(r.urgentCompletedJobs === 1, 'urgent-closed: urgentCompletedJobs 1')
  check(r.urgentOpenJobs === 0, 'urgent-closed: urgentOpenJobs 0')
}

// 5. Urgent job with quality hold
{
  const r = projectPlantJobPriorityBrief(state([job({ id: 'JOB-1', priority: 'urgent', qualityHold: HOLD })]))
  check(r.urgentWithQualityHold === 1, 'urgent-hold: urgentWithQualityHold 1')
}

// 6. urgentRate rounds: 1 urgent out of 3 = 33
{
  const r = projectPlantJobPriorityBrief(state([
    job({ id: 'JOB-1', priority: 'urgent' }),
    job({ id: 'JOB-2', priority: 'normal' }),
    job({ id: 'JOB-3', priority: 'low' }),
  ]))
  check(r.urgentRate === 33, 'rate-round: urgentRate 33 (round 1/3×100)')
  check(r.byPriority.urgent === 1, 'rate-round: urgent 1')
  check(r.byPriority.normal === 1, 'rate-round: normal 1')
  check(r.byPriority.low === 1, 'rate-round: low 1')
}

// 7. Non-urgent quality hold does NOT increment urgentWithQualityHold
{
  const r = projectPlantJobPriorityBrief(state([job({ id: 'JOB-1', priority: 'normal', qualityHold: HOLD })]))
  check(r.urgentWithQualityHold === 0, 'non-urgent-hold: urgentWithQualityHold 0')
}

console.log(JSON.stringify({ ok: true, checks }))
