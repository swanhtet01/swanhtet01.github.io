// Plant job schedule brief: dueAt coverage + overdue/due-soon/future breakdown.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantJobScheduleBrief } from './plant-job-schedule-brief.ts'`,
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

const { projectPlantJobScheduleBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const AS_OF = '2026-08-11T12:00:00Z'
const PAST = '2026-08-10T00:00:00Z'       // overdue
const SOON = '2026-08-11T20:00:00Z'        // within 24h of AS_OF
const FUTURE = '2026-08-20T00:00:00Z'      // future

let jobId = 0
function job({ dueAt, closed = false, priority } = {}) {
  jobId++
  return {
    id: `job-${jobId}`,
    line: 'Line A',
    product: 'SKU-1',
    target: 100,
    output: 0,
    ...(priority !== undefined && { priority }),
    ...(dueAt !== undefined && { dueAt }),
    ...(closed && { closure: { actionId: 'act-1', capturedAt: AS_OF, summary: 'Closed', evidence: [] } }),
  }
}

function state(...jobs) {
  return {
    revision: 1,
    jobs,
    shifts: [],
    events: [],
    issues: [],
    equipment: [],
    openingPlan: null,
  }
}

// 1. Empty → all zeros
{
  const r = projectPlantJobScheduleBrief(state(), AS_OF)
  check(r.totalJobs === 0, 'empty: totalJobs 0')
  check(r.jobsWithDueAt === 0, 'empty: jobsWithDueAt 0')
  check(r.jobsWithoutDueAt === 0, 'empty: jobsWithoutDueAt 0')
  check(r.scheduledRate === 0, 'empty: scheduledRate 0')
  check(r.openJobs === 0, 'empty: openJobs 0')
  check(r.openScheduled === 0, 'empty: openScheduled 0')
  check(r.overdueJobs === 0, 'empty: overdueJobs 0')
  check(r.dueSoonJobs === 0, 'empty: dueSoonJobs 0')
  check(r.futureJobs === 0, 'empty: futureJobs 0')
  check(r.overdueRate === 0, 'empty: overdueRate 0')
}

// 2. Single open job with no dueAt → unscheduled
{
  const r = projectPlantJobScheduleBrief(state(job()), AS_OF)
  check(r.totalJobs === 1, 'no-dueAt: totalJobs 1')
  check(r.jobsWithDueAt === 0, 'no-dueAt: jobsWithDueAt 0')
  check(r.jobsWithoutDueAt === 1, 'no-dueAt: jobsWithoutDueAt 1')
  check(r.scheduledRate === 0, 'no-dueAt: scheduledRate 0')
  check(r.openJobs === 1, 'no-dueAt: openJobs 1')
  check(r.openScheduled === 0, 'no-dueAt: openScheduled 0')
  check(r.overdueJobs === 0, 'no-dueAt: overdueJobs 0')
  check(r.overdueRate === 0, 'no-dueAt: overdueRate 0 (no scheduled open jobs)')
}

// 3. Single open overdue job
{
  const r = projectPlantJobScheduleBrief(state(job({ dueAt: PAST })), AS_OF)
  check(r.jobsWithDueAt === 1, 'overdue: jobsWithDueAt 1')
  check(r.scheduledRate === 100, 'overdue: scheduledRate 100')
  check(r.openScheduled === 1, 'overdue: openScheduled 1')
  check(r.overdueJobs === 1, 'overdue: overdueJobs 1')
  check(r.dueSoonJobs === 0, 'overdue: dueSoonJobs 0')
  check(r.futureJobs === 0, 'overdue: futureJobs 0')
  check(r.overdueRate === 100, 'overdue: overdueRate 100')
}

// 4. Single open due-soon job
{
  const r = projectPlantJobScheduleBrief(state(job({ dueAt: SOON })), AS_OF)
  check(r.overdueJobs === 0, 'due-soon: overdueJobs 0')
  check(r.dueSoonJobs === 1, 'due-soon: dueSoonJobs 1')
  check(r.futureJobs === 0, 'due-soon: futureJobs 0')
  check(r.overdueRate === 0, 'due-soon: overdueRate 0')
}

// 5. Single open future job
{
  const r = projectPlantJobScheduleBrief(state(job({ dueAt: FUTURE })), AS_OF)
  check(r.overdueJobs === 0, 'future: overdueJobs 0')
  check(r.dueSoonJobs === 0, 'future: dueSoonJobs 0')
  check(r.futureJobs === 1, 'future: futureJobs 1')
}

// 6. Closed overdue job → does NOT count toward overdueJobs (already closed)
{
  const r = projectPlantJobScheduleBrief(state(job({ dueAt: PAST, closed: true })), AS_OF)
  check(r.openJobs === 0, 'closed-overdue: openJobs 0')
  check(r.openScheduled === 0, 'closed-overdue: openScheduled 0')
  check(r.overdueJobs === 0, 'closed-overdue: overdueJobs 0 (closed jobs not counted)')
  check(r.jobsWithDueAt === 1, 'closed-overdue: jobsWithDueAt still 1 (field present)')
}

// 7. Mixed: 1 overdue, 1 due-soon, 1 future, 1 no-dueAt, 1 closed
{
  const r = projectPlantJobScheduleBrief(state(
    job({ dueAt: PAST }),
    job({ dueAt: SOON }),
    job({ dueAt: FUTURE }),
    job(),
    job({ dueAt: PAST, closed: true }),
  ), AS_OF)
  check(r.totalJobs === 5, 'mixed: totalJobs 5')
  check(r.jobsWithDueAt === 4, 'mixed: jobsWithDueAt 4 (closed one still has dueAt)')
  check(r.jobsWithoutDueAt === 1, 'mixed: jobsWithoutDueAt 1')
  check(r.scheduledRate === 80, 'mixed: scheduledRate 80 (4/5)')
  check(r.openJobs === 4, 'mixed: openJobs 4')
  check(r.openScheduled === 3, 'mixed: openScheduled 3 (overdue+soon+future)')
  check(r.overdueJobs === 1, 'mixed: overdueJobs 1')
  check(r.dueSoonJobs === 1, 'mixed: dueSoonJobs 1')
  check(r.futureJobs === 1, 'mixed: futureJobs 1')
  check(r.overdueRate === 33, 'mixed: overdueRate 33 (1/3 rounded)')
}

// 8. overdueRate rounds — 2 of 3 scheduled open jobs overdue = 67%
{
  const r = projectPlantJobScheduleBrief(state(
    job({ dueAt: PAST }),
    job({ dueAt: PAST }),
    job({ dueAt: FUTURE }),
  ), AS_OF)
  check(r.overdueRate === 67, 'round-67pct: overdueRate 67')
}

console.log(JSON.stringify({ ok: true, checks }))
