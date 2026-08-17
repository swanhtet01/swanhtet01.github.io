// Plant CAPA recurrence brief: failure mode recurrence, cause category breakdown, effectiveness overdue.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantCapaRecurrenceBrief } from './plant-capa-recurrence-brief.ts'`,
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

const { projectPlantCapaRecurrenceBrief } = await import(
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
const FUTURE = '2026-09-01T00:00:00Z'
const CONTRACT = 'supermega.production.quality-capa.v1'

function capa({ failureMode = 'seal-leak', causeCategory = 'machine', effectivenessDue = FUTURE, priorIssueIds = [] } = {}) {
  const token = failureMode.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return {
    contract: CONTRACT,
    failureMode,
    causeCategory,
    rootCause: 'Root cause text',
    correctiveAction: 'Corrective action text',
    verificationResult: 'Verification result text',
    effectivenessOwner: 'quality-lead',
    effectivenessDue,
    recurrenceKey: `${causeCategory}:${token}`,
    priorIssueIds,
  }
}

function issue({ id = 'ISS-1', kind = 'quality', status = 'open', capaObj, resolvedAt = '2026-07-15T10:00:00Z' } = {}) {
  const base = {
    id, createdAt: '2026-07-01T08:00:00Z', area: 'line-a', kind, summary: 'Test', status,
  }
  if (status === 'resolved' && capaObj !== undefined) {
    base.resolution = {
      actionId: 'ACT-1', resolvedAt, resolvedBy: 'op', reason: 'fixed', evidenceReference: 'EV-1',
      qualityCorrectiveAction: capaObj,
    }
  } else if (status === 'resolved') {
    base.resolution = { actionId: 'ACT-1', resolvedAt, resolvedBy: 'op', reason: 'fixed', evidenceReference: 'EV-1' }
  }
  return base
}

function state(issues = []) {
  return { schema: SCHEMA, revision: 1, jobs: [], issues, machines: [], events: [] }
}

// 1. Empty state
{
  const r = projectPlantCapaRecurrenceBrief(state([]), AS_OF)
  check(r.totalQualityCapaIssues === 0, 'empty: totalQualityCapaIssues 0')
  check(r.uniqueFailureModes === 0, 'empty: uniqueFailureModes 0')
  check(r.recurringFailureModes === 0, 'empty: recurringFailureModes 0')
  check(r.topFailureModes.length === 0, 'empty: topFailureModes empty')
  check(r.effectivenessOverdue === 0, 'empty: effectivenessOverdue 0')
  check(r.byCauseCategory.machine === 0, 'empty: byCauseCategory.machine 0')
}

// 2. Open quality issues without resolution are excluded
{
  const r = projectPlantCapaRecurrenceBrief(state([
    issue({ id: 'ISS-1', status: 'open' }),
  ]), AS_OF)
  check(r.totalQualityCapaIssues === 0, 'open-excluded: open issue not counted')
}

// 3. Non-quality issues excluded
{
  const r = projectPlantCapaRecurrenceBrief(state([
    issue({ id: 'ISS-1', kind: 'maintenance', status: 'resolved', resolvedAt: '2026-07-10T00:00:00Z' }),
  ]), AS_OF)
  check(r.totalQualityCapaIssues === 0, 'non-quality: excluded')
}

// 4. Resolved quality issue without CAPA excluded
{
  const r = projectPlantCapaRecurrenceBrief(state([
    issue({ id: 'ISS-1', kind: 'quality', status: 'resolved', resolvedAt: '2026-07-10T00:00:00Z' }),
  ]), AS_OF)
  check(r.totalQualityCapaIssues === 0, 'no-capa: excluded')
}

// 5. Single CAPA issue — first occurrence, not recurring
{
  const r = projectPlantCapaRecurrenceBrief(state([
    issue({ id: 'ISS-1', status: 'resolved', capaObj: capa({ failureMode: 'seal-leak', causeCategory: 'machine' }) }),
  ]), AS_OF)
  check(r.totalQualityCapaIssues === 1, 'single: totalQualityCapaIssues 1')
  check(r.uniqueFailureModes === 1, 'single: uniqueFailureModes 1')
  check(r.recurringFailureModes === 0, 'single: recurringFailureModes 0')
  check(r.topFailureModes[0].occurrenceCount === 1, 'single: occurrence 1')
  check(r.byCauseCategory.machine === 1, 'single: byCauseCategory.machine 1')
}

// 6. Same failure mode twice → recurring
{
  const r = projectPlantCapaRecurrenceBrief(state([
    issue({ id: 'ISS-1', status: 'resolved', capaObj: capa({ failureMode: 'seal-leak', causeCategory: 'machine', priorIssueIds: [] }) }),
    issue({ id: 'ISS-2', status: 'resolved', capaObj: capa({ failureMode: 'seal-leak', causeCategory: 'machine', priorIssueIds: ['ISS-1'] }) }),
  ]), AS_OF)
  check(r.totalQualityCapaIssues === 2, 'recurring: totalQualityCapaIssues 2')
  check(r.uniqueFailureModes === 1, 'recurring: uniqueFailureModes 1')
  check(r.recurringFailureModes === 1, 'recurring: recurringFailureModes 1')
  check(r.topFailureModes[0].occurrenceCount === 2, 'recurring: occurrenceCount 2')
}

// 7. Multiple distinct failure modes, sorted by count desc
{
  const r = projectPlantCapaRecurrenceBrief(state([
    issue({ id: 'ISS-1', status: 'resolved', capaObj: capa({ failureMode: 'seal-leak', causeCategory: 'machine' }) }),
    issue({ id: 'ISS-2', status: 'resolved', capaObj: capa({ failureMode: 'seal-leak', causeCategory: 'machine', priorIssueIds: ['ISS-1'] }) }),
    issue({ id: 'ISS-3', status: 'resolved', capaObj: capa({ failureMode: 'contamination', causeCategory: 'material' }) }),
  ]), AS_OF)
  check(r.uniqueFailureModes === 2, 'sort: uniqueFailureModes 2')
  check(r.topFailureModes[0].recurrenceKey === 'machine:seal-leak', 'sort: first is seal-leak')
  check(r.topFailureModes[0].occurrenceCount === 2, 'sort: first has count 2')
  check(r.topFailureModes[1].recurrenceKey === 'material:contamination', 'sort: second is contamination')
  check(r.byCauseCategory.machine === 2, 'sort: machine 2')
  check(r.byCauseCategory.material === 1, 'sort: material 1')
}

// 8. Effectiveness overdue: effectivenessDue < asOf
{
  const r = projectPlantCapaRecurrenceBrief(state([
    issue({ id: 'ISS-1', status: 'resolved', capaObj: capa({ effectivenessDue: PAST }) }),
    issue({ id: 'ISS-2', status: 'resolved', capaObj: capa({ failureMode: 'bearing-wear', effectivenessDue: FUTURE }) }),
  ]), AS_OF)
  check(r.effectivenessOverdue === 1, 'overdue: effectivenessOverdue 1')
}

// 9. Top-5 cap
{
  const modes = ['mode-a', 'mode-b', 'mode-c', 'mode-d', 'mode-e', 'mode-f']
  const issues = modes.map((fm, i) =>
    issue({ id: `ISS-${i}`, status: 'resolved', capaObj: capa({ failureMode: fm }) })
  )
  const r = projectPlantCapaRecurrenceBrief(state(issues), AS_OF)
  check(r.topFailureModes.length === 5, 'cap: topFailureModes capped at 5')
  check(r.uniqueFailureModes === 6, 'cap: uniqueFailureModes 6')
}

console.log(JSON.stringify({ ok: true, checks }))
