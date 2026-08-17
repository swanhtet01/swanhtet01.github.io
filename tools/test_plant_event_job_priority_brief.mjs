// Plant event job priority brief: jobPriority (to) + fromJobPriority enum distributions on priority-change events.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEventJobPriorityBrief } from './plant-event-job-priority-brief.ts'`,
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

const { projectPlantEventJobPriorityBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.production.workspace.v2'

let eventId = 0
function priorityEvent(jobPriority, fromJobPriority) {
  eventId++
  const obj = {
    id: `EVT-${eventId}`,
    actionId: 'ACT-1',
    createdAt: '2026-08-01T09:00:00Z',
    actor: 'manager-1',
    reason: 'Priority changed.',
    evidenceReference: 'EVD-1',
    kind: 'job_priority_changed',
    subjectId: 'JOB-1',
    summary: 'Priority changed.',
    jobPriority,
  }
  if (fromJobPriority !== undefined) obj.fromJobPriority = fromJobPriority
  return obj
}

function nonPriorityEvent() {
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

// 1. No events → all zeros
{
  const r = projectPlantEventJobPriorityBrief(state([]))
  check(r.totalPriorityEvents === 0, 'empty: totalPriorityEvents 0')
  check(r.toUrgentCount === 0, 'empty: toUrgentCount 0')
  check(r.toNormalCount === 0, 'empty: toNormalCount 0')
  check(r.toLowCount === 0, 'empty: toLowCount 0')
  check(r.fromUrgentCount === 0, 'empty: fromUrgentCount 0')
  check(r.fromNormalCount === 0, 'empty: fromNormalCount 0')
  check(r.fromLowCount === 0, 'empty: fromLowCount 0')
}

// 2. Non-priority events skipped
{
  const r = projectPlantEventJobPriorityBrief(state([nonPriorityEvent()]))
  check(r.totalPriorityEvents === 0, 'non-priority: totalPriorityEvents 0')
}

// 3. All 3 to-priority values
{
  const r = projectPlantEventJobPriorityBrief(
    state([
      priorityEvent('urgent', undefined),
      priorityEvent('normal', undefined),
      priorityEvent('low', undefined),
    ]),
  )
  check(r.totalPriorityEvents === 3, 'to-values: total 3')
  check(r.toUrgentCount === 1, 'to-values: toUrgentCount 1')
  check(r.toNormalCount === 1, 'to-values: toNormalCount 1')
  check(r.toLowCount === 1, 'to-values: toLowCount 1')
}

// 4. fromJobPriority distribution
{
  const r = projectPlantEventJobPriorityBrief(
    state([
      priorityEvent('urgent', 'normal'),
      priorityEvent('urgent', 'low'),
      priorityEvent('normal', 'urgent'),
    ]),
  )
  check(r.fromNormalCount === 1, 'from-dist: fromNormalCount 1')
  check(r.fromLowCount === 1, 'from-dist: fromLowCount 1')
  check(r.fromUrgentCount === 1, 'from-dist: fromUrgentCount 1')
}

// 5. Event with no fromJobPriority → from counters not incremented
{
  const r = projectPlantEventJobPriorityBrief(
    state([priorityEvent('urgent', undefined)]),
  )
  check(r.toUrgentCount === 1, 'no-from: toUrgentCount 1')
  check(r.fromUrgentCount === 0, 'no-from: fromUrgentCount 0')
  check(r.fromNormalCount === 0, 'no-from: fromNormalCount 0')
}

// 6. Multiple events accumulate correctly
{
  const r = projectPlantEventJobPriorityBrief(
    state([
      priorityEvent('urgent', 'normal'),
      priorityEvent('urgent', 'normal'),
      priorityEvent('normal', 'urgent'),
      nonPriorityEvent(),
    ]),
  )
  check(r.totalPriorityEvents === 3, 'accum: totalPriorityEvents 3')
  check(r.toUrgentCount === 2, 'accum: toUrgentCount 2')
  check(r.fromNormalCount === 2, 'accum: fromNormalCount 2')
}

console.log(JSON.stringify({ ok: true, checks }))
