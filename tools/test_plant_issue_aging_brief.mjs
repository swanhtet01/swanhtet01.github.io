// Plant issue aging brief: SLA adherence on dueAt vs resolvedAt, past-due open issues.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantIssueAgingBrief } from './plant-issue-aging-brief.ts'`,
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

const { projectPlantIssueAgingBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.production.workspace.v1'
const AS_OF = '2026-08-11T12:00:00Z'
const PAST = '2026-08-01T00:00:00Z'
const FUTURE = '2026-08-20T00:00:00Z'

function issue({ id = 'ISS-1', status = 'open', severity, dueAt, resolvedAt } = {}) {
  const base = {
    id, createdAt: '2026-07-01T08:00:00Z', area: 'line-a',
    kind: 'quality', summary: 'Test issue', status,
  }
  if (severity !== undefined) base.severity = severity
  if (dueAt !== undefined) base.dueAt = dueAt
  if (status === 'resolved' && resolvedAt !== undefined) {
    base.resolution = {
      actionId: 'ACT-1', resolvedAt, resolvedBy: 'op', reason: 'fixed',
      evidenceReference: 'EV-1',
    }
  }
  return base
}

function state(issues = []) {
  return { schema: SCHEMA, revision: 1, jobs: [], issues, machines: [], events: [] }
}

// 1. Empty state
{
  const r = projectPlantIssueAgingBrief(state([]), AS_OF)
  check(r.totalIssues === 0, 'empty: totalIssues 0')
  check(r.openIssues === 0, 'empty: openIssues 0')
  check(r.resolvedIssues === 0, 'empty: resolvedIssues 0')
  check(r.issuesWithDueDate === 0, 'empty: issuesWithDueDate 0')
  check(r.openPastDue === 0, 'empty: openPastDue 0')
  check(r.criticalOrHighPastDue === 0, 'empty: criticalOrHighPastDue 0')
  check(r.slaAdherenceRate === 0, 'empty: slaAdherenceRate 0')
}

// 2. Open issue with no due date — not counted as past due
{
  const r = projectPlantIssueAgingBrief(state([issue({ id: 'ISS-1', status: 'open' })]), AS_OF)
  check(r.openIssues === 1, 'open-no-due: openIssues 1')
  check(r.issuesWithDueDate === 0, 'open-no-due: issuesWithDueDate 0')
  check(r.openPastDue === 0, 'open-no-due: openPastDue 0')
}

// 3. Open issue with past due date
{
  const r = projectPlantIssueAgingBrief(state([issue({ id: 'ISS-1', status: 'open', dueAt: PAST })]), AS_OF)
  check(r.openPastDue === 1, 'open-past-due: openPastDue 1')
  check(r.issuesWithDueDate === 1, 'open-past-due: issuesWithDueDate 1')
}

// 4. Open issue with future due date — not past due
{
  const r = projectPlantIssueAgingBrief(state([issue({ id: 'ISS-1', status: 'open', dueAt: FUTURE })]), AS_OF)
  check(r.openPastDue === 0, 'open-future: openPastDue 0')
}

// 5. Critical/high severity past-due open issue
{
  const r = projectPlantIssueAgingBrief(state([
    issue({ id: 'ISS-1', status: 'open', severity: 'critical', dueAt: PAST }),
    issue({ id: 'ISS-2', status: 'open', severity: 'high', dueAt: PAST }),
    issue({ id: 'ISS-3', status: 'open', severity: 'medium', dueAt: PAST }),
  ]), AS_OF)
  check(r.openPastDue === 3, 'severity: openPastDue 3')
  check(r.criticalOrHighPastDue === 2, 'severity: criticalOrHighPastDue 2')
}

// 6. Resolved on time (resolvedAt <= dueAt)
{
  const r = projectPlantIssueAgingBrief(state([
    issue({ id: 'ISS-1', status: 'resolved', dueAt: FUTURE, resolvedAt: '2026-08-10T00:00:00Z' }),
  ]), AS_OF)
  check(r.resolvedIssues === 1, 'on-time: resolvedIssues 1')
  check(r.resolvedOnTime === 1, 'on-time: resolvedOnTime 1')
  check(r.resolvedLate === 0, 'on-time: resolvedLate 0')
  check(r.slaAdherenceRate === 100, 'on-time: slaAdherenceRate 100')
}

// 7. Resolved late (resolvedAt > dueAt)
{
  const r = projectPlantIssueAgingBrief(state([
    issue({ id: 'ISS-1', status: 'resolved', dueAt: PAST, resolvedAt: AS_OF }),
  ]), AS_OF)
  check(r.resolvedLate === 1, 'late: resolvedLate 1')
  check(r.resolvedOnTime === 0, 'late: resolvedOnTime 0')
  check(r.slaAdherenceRate === 0, 'late: slaAdherenceRate 0')
}

// 8. Resolved with no due date — not counted in SLA
{
  const r = projectPlantIssueAgingBrief(state([
    issue({ id: 'ISS-1', status: 'resolved', resolvedAt: AS_OF }),
  ]), AS_OF)
  check(r.resolvedIssues === 1, 'no-due-resolved: resolvedIssues 1')
  check(r.issuesWithDueDate === 0, 'no-due-resolved: issuesWithDueDate 0')
  check(r.slaAdherenceRate === 0, 'no-due-resolved: slaAdherenceRate 0 (no SLA data)')
}

// 9. Mixed: 2 on-time, 1 late → 67% SLA rate
{
  const r = projectPlantIssueAgingBrief(state([
    issue({ id: 'ISS-1', status: 'resolved', dueAt: FUTURE, resolvedAt: '2026-08-05T00:00:00Z' }),
    issue({ id: 'ISS-2', status: 'resolved', dueAt: FUTURE, resolvedAt: '2026-08-05T00:00:00Z' }),
    issue({ id: 'ISS-3', status: 'resolved', dueAt: PAST, resolvedAt: AS_OF }),
    issue({ id: 'ISS-4', status: 'open', dueAt: PAST }),
  ]), AS_OF)
  check(r.totalIssues === 4, 'mixed: totalIssues 4')
  check(r.resolvedOnTime === 2, 'mixed: resolvedOnTime 2')
  check(r.resolvedLate === 1, 'mixed: resolvedLate 1')
  check(r.openPastDue === 1, 'mixed: openPastDue 1')
  check(r.slaAdherenceRate === 67, 'mixed: slaAdherenceRate 67 (2/3×100)')
}

console.log(JSON.stringify({ ok: true, checks }))
