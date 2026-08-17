// Plant job owner brief: ownership distribution, unassigned jobs, top owners.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantJobOwnerBrief } from './plant-job-owner-brief.ts'`,
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

const { projectPlantJobOwnerBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.production.workspace.v1'
const CLOSURE = { actionId: 'ACT-1', closedAt: '2026-01-01T14:00:00Z', closedBy: 'op', reason: 'done', evidenceReference: 'EV-1', shiftRef: 'S-1' }

function job({ id = 'JOB-1', owner, closure } = {}) {
  const base = {
    id, line: 'line-a', product: 'P-1', target: 10, output: 0,
    startAt: '2026-01-01T06:00:00Z', dueAt: '2026-01-01T14:00:00Z',
  }
  if (owner !== undefined) base.owner = owner
  if (closure !== undefined) base.closure = closure
  return base
}

function state(jobs = []) {
  return { schema: SCHEMA, revision: 1, jobs, issues: [], machines: [], events: [] }
}

// 1. Empty state
{
  const r = projectPlantJobOwnerBrief(state([]))
  check(r.totalJobs === 0, 'empty: totalJobs 0')
  check(r.jobsWithOwner === 0, 'empty: jobsWithOwner 0')
  check(r.jobsWithoutOwner === 0, 'empty: jobsWithoutOwner 0')
  check(r.uniqueOwners === 0, 'empty: uniqueOwners 0')
  check(r.topOwners.length === 0, 'empty: topOwners empty')
  check(r.openJobsWithoutOwner === 0, 'empty: openJobsWithoutOwner 0')
}

// 2. Job with no owner
{
  const r = projectPlantJobOwnerBrief(state([job({ id: 'JOB-1' })]))
  check(r.totalJobs === 1, 'no-owner: totalJobs 1')
  check(r.jobsWithoutOwner === 1, 'no-owner: jobsWithoutOwner 1')
  check(r.jobsWithOwner === 0, 'no-owner: jobsWithOwner 0')
  check(r.openJobsWithoutOwner === 1, 'no-owner: openJobsWithoutOwner 1 (open job)')
}

// 3. Completed job without owner → not counted in openJobsWithoutOwner
{
  const r = projectPlantJobOwnerBrief(state([job({ id: 'JOB-1', closure: CLOSURE })]))
  check(r.jobsWithoutOwner === 1, 'closed-no-owner: jobsWithoutOwner 1')
  check(r.openJobsWithoutOwner === 0, 'closed-no-owner: openJobsWithoutOwner 0 (job is closed)')
}

// 4. Single owner — open and closed
{
  const r = projectPlantJobOwnerBrief(state([
    job({ id: 'JOB-1', owner: 'alice' }),
    job({ id: 'JOB-2', owner: 'alice', closure: CLOSURE }),
  ]))
  check(r.jobsWithOwner === 2, 'single-owner: jobsWithOwner 2')
  check(r.uniqueOwners === 1, 'single-owner: uniqueOwners 1')
  check(r.topOwners[0].owner === 'alice', 'single-owner: topOwner alice')
  check(r.topOwners[0].jobCount === 2, 'single-owner: jobCount 2')
  check(r.topOwners[0].openJobs === 1, 'single-owner: openJobs 1')
  check(r.topOwners[0].completedJobs === 1, 'single-owner: completedJobs 1')
}

// 5. Multiple owners sorted by jobCount desc
{
  const r = projectPlantJobOwnerBrief(state([
    job({ id: 'JOB-1', owner: 'bob' }),
    job({ id: 'JOB-2', owner: 'alice' }),
    job({ id: 'JOB-3', owner: 'alice' }),
    job({ id: 'JOB-4', owner: 'charlie' }),
    job({ id: 'JOB-5', owner: 'alice' }),
  ]))
  check(r.topOwners[0].owner === 'alice', 'sort: first is alice (3 jobs)')
  check(r.topOwners[0].jobCount === 3, 'sort: alice jobCount 3')
  check(r.uniqueOwners === 3, 'sort: uniqueOwners 3')
}

// 6. Top 5 cap
{
  const jobs = ['alice', 'bob', 'charlie', 'dave', 'eve', 'frank'].map((owner, i) =>
    job({ id: `JOB-${i}`, owner })
  )
  const r = projectPlantJobOwnerBrief(state(jobs))
  check(r.topOwners.length === 5, 'cap: topOwners capped at 5')
  check(r.uniqueOwners === 6, 'cap: uniqueOwners 6')
}

// 7. Mix: owned + unowned, open + closed
{
  const r = projectPlantJobOwnerBrief(state([
    job({ id: 'JOB-1', owner: 'alice' }),
    job({ id: 'JOB-2' }),
    job({ id: 'JOB-3', closure: CLOSURE }),
    job({ id: 'JOB-4', owner: 'bob', closure: CLOSURE }),
  ]))
  check(r.totalJobs === 4, 'mix: totalJobs 4')
  check(r.jobsWithOwner === 2, 'mix: jobsWithOwner 2')
  check(r.jobsWithoutOwner === 2, 'mix: jobsWithoutOwner 2')
  check(r.openJobsWithoutOwner === 1, 'mix: openJobsWithoutOwner 1 (JOB-2 open; JOB-3 closed)')
}

console.log(JSON.stringify({ ok: true, checks }))
