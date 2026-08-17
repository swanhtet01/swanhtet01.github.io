// Plant event job due/owner brief: jobDueAt + fromJobDueAt date ranges + jobOwner + fromJobOwner distributions.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEventJobDueOwnerBrief } from './plant-event-job-due-owner-brief.ts'`,
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

const { projectPlantEventJobDueOwnerBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.production.workspace.v2'

let eventId = 0
function updateEvent({ jobDueAt, fromJobDueAt, jobOwner, fromJobOwner }) {
  eventId++
  const obj = {
    id: `EVT-${eventId}`,
    actionId: 'ACT-1',
    createdAt: '2026-08-01T09:00:00Z',
    actor: 'manager-1',
    reason: 'Job updated.',
    evidenceReference: 'EVD-1',
    kind: 'job_due_changed',
    subjectId: 'JOB-1',
    summary: 'Job due date changed.',
  }
  if (jobDueAt !== undefined) obj.jobDueAt = jobDueAt
  if (fromJobDueAt !== undefined) obj.fromJobDueAt = fromJobDueAt
  if (jobOwner !== undefined) obj.jobOwner = jobOwner
  if (fromJobOwner !== undefined) obj.fromJobOwner = fromJobOwner
  return obj
}

function plainEvent() {
  eventId++
  return {
    id: `EVT-${eventId}`,
    actionId: 'ACT-1',
    createdAt: '2026-08-01T09:00:00Z',
    actor: 'operator-1',
    reason: 'Job started.',
    evidenceReference: 'EVD-1',
    kind: 'job_started',
    subjectId: 'JOB-1',
    summary: 'Job started.',
  }
}

function state(events) {
  return { schema: SCHEMA, jobs: [], issues: [], events, closes: [] }
}

// 1. No events → all zeros / nulls
{
  const r = projectPlantEventJobDueOwnerBrief(state([]))
  check(r.totalJobUpdateEvents === 0, 'empty: total 0')
  check(r.earliestJobDueAt === null, 'empty: earliestJobDueAt null')
  check(r.latestJobDueAt === null, 'empty: latestJobDueAt null')
  check(r.earliestFromJobDueAt === null, 'empty: earliestFromJobDueAt null')
  check(r.latestFromJobDueAt === null, 'empty: latestFromJobDueAt null')
  check(r.uniqueJobOwners === 0, 'empty: uniqueJobOwners 0')
  check(r.uniqueFromJobOwners === 0, 'empty: uniqueFromJobOwners 0')
  check(r.topJobOwnersByCount.length === 0, 'empty: topJobOwnersByCount empty')
  check(r.topFromJobOwnersByCount.length === 0, 'empty: topFromJobOwnersByCount empty')
}

// 2. Plain events (no jobDueAt/Owner fields) skipped
{
  const r = projectPlantEventJobDueOwnerBrief(state([plainEvent(), plainEvent()]))
  check(r.totalJobUpdateEvents === 0, 'plain: total 0')
}

// 3. Event with jobDueAt only
{
  const r = projectPlantEventJobDueOwnerBrief(
    state([updateEvent({ jobDueAt: '2026-09-01' })]),
  )
  check(r.totalJobUpdateEvents === 1, 'due-only: total 1')
  check(r.earliestJobDueAt === '2026-09-01', 'due-only: earliestJobDueAt')
  check(r.latestJobDueAt === '2026-09-01', 'due-only: latestJobDueAt')
  check(r.earliestFromJobDueAt === null, 'due-only: earliestFromJobDueAt null')
}

// 4. jobDueAt ordering
{
  const r = projectPlantEventJobDueOwnerBrief(
    state([
      updateEvent({ jobDueAt: '2026-10-01' }),
      updateEvent({ jobDueAt: '2026-09-01' }),
      updateEvent({ jobDueAt: '2026-11-01' }),
    ]),
  )
  check(r.earliestJobDueAt === '2026-09-01', 'due-order: earliest')
  check(r.latestJobDueAt === '2026-11-01', 'due-order: latest')
}

// 5. jobOwner distribution
{
  const r = projectPlantEventJobDueOwnerBrief(
    state([
      updateEvent({ jobOwner: 'op-1' }),
      updateEvent({ jobOwner: 'op-1' }),
      updateEvent({ jobOwner: 'op-2', fromJobOwner: 'op-1' }),
    ]),
  )
  check(r.uniqueJobOwners === 2, 'owner-dist: uniqueJobOwners 2')
  check(r.topJobOwnersByCount[0]?.owner === 'op-1', 'owner-dist: top op-1')
  check(r.topJobOwnersByCount[0]?.count === 2, 'owner-dist: count 2')
  check(r.uniqueFromJobOwners === 1, 'owner-dist: uniqueFromJobOwners 1')
  check(r.topFromJobOwnersByCount[0]?.owner === 'op-1', 'owner-dist: fromTop op-1')
}

// 6. fromJobDueAt ordering
{
  const r = projectPlantEventJobDueOwnerBrief(
    state([
      updateEvent({ fromJobDueAt: '2026-08-01', jobDueAt: '2026-10-01' }),
      updateEvent({ fromJobDueAt: '2026-07-01', jobDueAt: '2026-09-01' }),
    ]),
  )
  check(r.earliestFromJobDueAt === '2026-07-01', 'from-due-order: earliest')
  check(r.latestFromJobDueAt === '2026-08-01', 'from-due-order: latest')
}

console.log(JSON.stringify({ ok: true, checks }))
