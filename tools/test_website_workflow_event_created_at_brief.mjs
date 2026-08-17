import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteWorkflowEventCreatedAtBrief } from './website-workflow-event-created-at-brief.ts'`,
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

const { projectWebsiteWorkflowEventCreatedAtBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let eventId = 0
function workflowEvent(createdAt = '2026-08-01T09:00:00Z') {
  eventId++
  return {
    id: `ev-${eventId}`,
    createdAt,
    actorKind: 'human',
    actor: 'alice',
    action: 'publish_evidence_recorded',
    subjectId: `subj-${eventId}`,
    reason: 'Evidence recorded',
    evidenceReference: `ref-${eventId}`,
    source: { contentRevision: 1, digest: 'digest-1' },
  }
}

function workspace(events = []) {
  return {
    schema: 'supermega.website.workspace.v2',
    version: 2,
    revision: 0,
    contentRevision: 0,
    siteName: 'Test Site',
    pages: [],
    selectedPageId: '',
    evidence: [],
    approvals: [],
    localPublishes: [],
    events,
  }
}

// 1. Empty workspace
{
  const r = projectWebsiteWorkflowEventCreatedAtBrief(workspace())
  check(r.totalEvents === 0, 'empty: totalEvents 0')
  check(r.earliestCreatedAt === null, 'empty: earliestCreatedAt null')
  check(r.latestCreatedAt === null, 'empty: latestCreatedAt null')
  check(r.spannedDays === 0, 'empty: spannedDays 0')
}

// 2. Single event — spannedDays 0
{
  const r = projectWebsiteWorkflowEventCreatedAtBrief(workspace([workflowEvent('2026-08-01T09:00:00Z')]))
  check(r.totalEvents === 1, 'single: totalEvents 1')
  check(r.earliestCreatedAt === '2026-08-01T09:00:00Z', 'single: earliestCreatedAt')
  check(r.latestCreatedAt === '2026-08-01T09:00:00Z', 'single: latestCreatedAt')
  check(r.spannedDays === 0, 'single: spannedDays 0')
}

// 3. Two events same day — spannedDays 0 (08:00/16:00 = 8h = 0.33 days → rounds to 0)
{
  const r = projectWebsiteWorkflowEventCreatedAtBrief(workspace([
    workflowEvent('2026-08-05T08:00:00Z'),
    workflowEvent('2026-08-05T16:00:00Z'),
  ]))
  check(r.totalEvents === 2, 'same-day: totalEvents 2')
  check(r.earliestCreatedAt === '2026-08-05T08:00:00Z', 'same-day: earliestCreatedAt')
  check(r.latestCreatedAt === '2026-08-05T16:00:00Z', 'same-day: latestCreatedAt')
  check(r.spannedDays === 0, 'same-day: spannedDays 0')
}

// 4. Two events 14 days apart
{
  const r = projectWebsiteWorkflowEventCreatedAtBrief(workspace([
    workflowEvent('2026-07-18T00:00:00Z'),
    workflowEvent('2026-08-01T00:00:00Z'),
  ]))
  check(r.totalEvents === 2, '14-days: totalEvents 2')
  check(r.earliestCreatedAt === '2026-07-18T00:00:00Z', '14-days: earliestCreatedAt')
  check(r.latestCreatedAt === '2026-08-01T00:00:00Z', '14-days: latestCreatedAt')
  check(r.spannedDays === 14, '14-days: spannedDays 14')
}

// 5. Three events out of order — earliest/latest correct
{
  const r = projectWebsiteWorkflowEventCreatedAtBrief(workspace([
    workflowEvent('2026-08-10T08:00:00Z'),
    workflowEvent('2026-08-02T12:00:00Z'),
    workflowEvent('2026-08-06T15:00:00Z'),
  ]))
  check(r.totalEvents === 3, 'unsorted: totalEvents 3')
  check(r.earliestCreatedAt === '2026-08-02T12:00:00Z', 'unsorted: earliestCreatedAt')
  check(r.latestCreatedAt === '2026-08-10T08:00:00Z', 'unsorted: latestCreatedAt')
  check(r.spannedDays === Math.round((Date.parse('2026-08-10T08:00:00Z') - Date.parse('2026-08-02T12:00:00Z')) / (1000 * 60 * 60 * 24)), 'unsorted: spannedDays')
}

// 6. Two events same timestamp — spannedDays 0, earliest equals latest
{
  const r = projectWebsiteWorkflowEventCreatedAtBrief(workspace([
    workflowEvent('2026-08-08T00:00:00Z'),
    workflowEvent('2026-08-08T00:00:00Z'),
  ]))
  check(r.totalEvents === 2, 'same-ts: totalEvents 2')
  check(r.spannedDays === 0, 'same-ts: spannedDays 0')
  check(r.earliestCreatedAt === r.latestCreatedAt, 'same-ts: earliest equals latest')
}

console.log(`website-workflow-event-created-at-brief: ${checks} checks passed`)
