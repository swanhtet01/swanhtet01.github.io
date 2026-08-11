// Plant event issue due/containment brief: issueDueAt date range + issueContainment presence rate on issue events.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEventIssueDueContainmentBrief } from './plant-event-issue-due-containment-brief.ts'`,
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

const { projectPlantEventIssueDueContainmentBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.production.workspace.v2'

let eventId = 0
function issueEvent({ issueDueAt, issueContainment } = {}) {
  eventId++
  const obj = {
    id: `EVT-${eventId}`,
    actionId: 'ACT-1',
    createdAt: '2026-08-01T09:00:00Z',
    actor: 'manager-1',
    reason: 'Issue raised.',
    evidenceReference: 'EVD-1',
    kind: 'issue_raised',
    subjectId: `ISSUE-${eventId}`,
    summary: 'Issue raised.',
    issueSeverity: 'high',
  }
  if (issueDueAt !== undefined) obj.issueDueAt = issueDueAt
  if (issueContainment !== undefined) obj.issueContainment = issueContainment
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
  const r = projectPlantEventIssueDueContainmentBrief(state([]))
  check(r.totalIssueEvents === 0, 'empty: totalIssueEvents 0')
  check(r.eventsWithDueAt === 0, 'empty: eventsWithDueAt 0')
  check(r.earliestIssueDueAt === null, 'empty: earliestIssueDueAt null')
  check(r.latestIssueDueAt === null, 'empty: latestIssueDueAt null')
  check(r.eventsWithContainment === 0, 'empty: eventsWithContainment 0')
  check(r.containmentRate === 0, 'empty: containmentRate 0')
}

// 2. Non-issue events skipped
{
  const r = projectPlantEventIssueDueContainmentBrief(state([plainEvent()]))
  check(r.totalIssueEvents === 0, 'plain: totalIssueEvents 0')
}

// 3. Issue event with no dueAt or containment
{
  const r = projectPlantEventIssueDueContainmentBrief(state([issueEvent()]))
  check(r.totalIssueEvents === 1, 'no-fields: totalIssueEvents 1')
  check(r.eventsWithDueAt === 0, 'no-fields: eventsWithDueAt 0')
  check(r.earliestIssueDueAt === null, 'no-fields: earliestIssueDueAt null')
  check(r.eventsWithContainment === 0, 'no-fields: eventsWithContainment 0')
  check(r.containmentRate === 0, 'no-fields: containmentRate 0')
}

// 4. issueDueAt date ordering
{
  const r = projectPlantEventIssueDueContainmentBrief(
    state([
      issueEvent({ issueDueAt: '2026-09-10' }),
      issueEvent({ issueDueAt: '2026-09-01' }),
      issueEvent({ issueDueAt: '2026-09-15' }),
    ]),
  )
  check(r.eventsWithDueAt === 3, 'due-order: eventsWithDueAt 3')
  check(r.earliestIssueDueAt === '2026-09-01', 'due-order: earliest')
  check(r.latestIssueDueAt === '2026-09-15', 'due-order: latest')
}

// 5. Containment rate
{
  const r = projectPlantEventIssueDueContainmentBrief(
    state([
      issueEvent({ issueContainment: 'Quarantine affected batch.' }),
      issueEvent({ issueContainment: 'Stop machine.' }),
      issueEvent(),
      issueEvent(),
    ]),
  )
  check(r.totalIssueEvents === 4, 'containment-rate: total 4')
  check(r.eventsWithContainment === 2, 'containment-rate: eventsWithContainment 2')
  check(r.containmentRate === 50, 'containment-rate: containmentRate 50')
}

// 6. All 4 fields present
{
  const r = projectPlantEventIssueDueContainmentBrief(
    state([issueEvent({ issueDueAt: '2026-09-01', issueContainment: 'Isolate.' })]),
  )
  check(r.eventsWithDueAt === 1, 'all-fields: eventsWithDueAt 1')
  check(r.eventsWithContainment === 1, 'all-fields: eventsWithContainment 1')
  check(r.containmentRate === 100, 'all-fields: containmentRate 100')
}

console.log(JSON.stringify({ ok: true, checks }))
