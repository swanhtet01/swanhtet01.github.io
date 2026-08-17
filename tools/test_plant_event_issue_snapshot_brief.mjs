// Plant event issue snapshot brief: issueSeverity enum distribution + issueOwner text distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEventIssueSnapshotBrief } from './plant-event-issue-snapshot-brief.ts'`,
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

const { projectPlantEventIssueSnapshotBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.production.workspace.v2'

let eventId = 0
function issueSnapshotEvent(severity, owner) {
  eventId++
  const obj = {
    id: `EVT-${eventId}`,
    actionId: 'ACT-1',
    createdAt: '2026-08-01T09:00:00Z',
    actor: 'operator-1',
    reason: 'Issue escalated.',
    evidenceReference: 'EVD-1',
    kind: 'issue_escalated',
    subjectId: `ISSUE-${eventId}`,
    summary: 'Issue escalated.',
    issueSeverity: severity,
  }
  if (owner !== undefined) obj.issueOwner = owner
  return obj
}

function nonIssueEvent() {
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
  const r = projectPlantEventIssueSnapshotBrief(state([]))
  check(r.totalIssueSnapshotEvents === 0, 'empty: totalIssueSnapshotEvents 0')
  check(r.criticalCount === 0, 'empty: criticalCount 0')
  check(r.highCount === 0, 'empty: highCount 0')
  check(r.mediumCount === 0, 'empty: mediumCount 0')
  check(r.lowCount === 0, 'empty: lowCount 0')
  check(r.uniqueIssueOwners === 0, 'empty: uniqueIssueOwners 0')
  check(r.topIssueOwnersByCount.length === 0, 'empty: topIssueOwnersByCount empty')
}

// 2. Non-issue events skipped
{
  const r = projectPlantEventIssueSnapshotBrief(state([nonIssueEvent(), nonIssueEvent()]))
  check(r.totalIssueSnapshotEvents === 0, 'non-issue: totalIssueSnapshotEvents 0')
}

// 3. All 4 severity values
{
  const r = projectPlantEventIssueSnapshotBrief(
    state([
      issueSnapshotEvent('critical', 'eng-1'),
      issueSnapshotEvent('high', 'eng-1'),
      issueSnapshotEvent('medium', 'eng-2'),
      issueSnapshotEvent('low', 'eng-2'),
    ]),
  )
  check(r.totalIssueSnapshotEvents === 4, 'severities: total 4')
  check(r.criticalCount === 1, 'severities: criticalCount 1')
  check(r.highCount === 1, 'severities: highCount 1')
  check(r.mediumCount === 1, 'severities: mediumCount 1')
  check(r.lowCount === 1, 'severities: lowCount 1')
}

// 4. issueOwner distribution
{
  const r = projectPlantEventIssueSnapshotBrief(
    state([
      issueSnapshotEvent('critical', 'eng-1'),
      issueSnapshotEvent('high', 'eng-1'),
      issueSnapshotEvent('medium', 'eng-2'),
    ]),
  )
  check(r.uniqueIssueOwners === 2, 'owner-dist: uniqueIssueOwners 2')
  check(r.topIssueOwnersByCount[0]?.owner === 'eng-1', 'owner-dist: top eng-1')
  check(r.topIssueOwnersByCount[0]?.count === 2, 'owner-dist: count 2')
}

// 5. Issue with no owner → no owner counted
{
  const r = projectPlantEventIssueSnapshotBrief(
    state([issueSnapshotEvent('critical', undefined)]),
  )
  check(r.totalIssueSnapshotEvents === 1, 'no-owner: total 1')
  check(r.uniqueIssueOwners === 0, 'no-owner: uniqueIssueOwners 0')
}

// 6. Top-5 cap + tiebreak
{
  const owners = ['Z-eng', 'A-eng', 'C-eng', 'B-eng', 'D-eng', 'E-eng']
  const r = projectPlantEventIssueSnapshotBrief(
    state(owners.map(o => issueSnapshotEvent('high', o))),
  )
  check(r.topIssueOwnersByCount.length === 5, 'top5: capped at 5')
  check(r.topIssueOwnersByCount[0]?.owner === 'A-eng', 'top5: tiebreak A-eng first')
}

console.log(JSON.stringify({ ok: true, checks }))
