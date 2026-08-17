// Plant CAPA content brief: failureMode and rootCause raw text coverage.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantCapaContentBrief } from './plant-capa-content-brief.ts'`,
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

const { projectPlantCapaContentBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.production.workspace.v1'
const CONTRACT = 'supermega.production.quality-capa.v1'
const FUTURE = '2026-09-01T00:00:00Z'

function capa({ failureMode = 'seal-leak', rootCause = 'worn seal', causeCategory = 'machine' } = {}) {
  const token = failureMode.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return {
    contract: CONTRACT,
    failureMode,
    causeCategory,
    rootCause,
    correctiveAction: 'Replace component',
    verificationResult: 'Verified OK',
    effectivenessOwner: 'quality-lead',
    effectivenessDue: FUTURE,
    recurrenceKey: `${causeCategory}:${token}`,
    priorIssueIds: [],
  }
}

let issueId = 0
function issue({ kind = 'quality', status = 'open', capaObj } = {}) {
  issueId++
  const base = {
    id: `ISS-${issueId}`,
    createdAt: '2026-07-01T08:00:00Z',
    area: 'line-a',
    kind,
    summary: 'Test issue',
    status,
  }
  if (status === 'resolved' && capaObj !== undefined) {
    base.resolution = {
      actionId: `ACT-${issueId}`,
      resolvedAt: '2026-07-15T10:00:00Z',
      resolvedBy: 'op',
      reason: 'fixed',
      evidenceReference: `EV-${issueId}`,
      qualityCorrectiveAction: capaObj,
    }
  } else if (status === 'resolved') {
    base.resolution = {
      actionId: `ACT-${issueId}`,
      resolvedAt: '2026-07-15T10:00:00Z',
      resolvedBy: 'op',
      reason: 'fixed',
      evidenceReference: `EV-${issueId}`,
    }
  }
  return base
}

function state(issues = []) {
  return { schema: SCHEMA, revision: 1, jobs: [], issues, machines: [], events: [] }
}

// 1. Empty → all zeros
{
  const r = projectPlantCapaContentBrief(state([]))
  check(r.totalCapa === 0, 'empty: totalCapa 0')
  check(r.uniqueFailureModes === 0, 'empty: uniqueFailureModes 0')
  check(r.topFailureModesByCount.length === 0, 'empty: topFM empty')
  check(r.uniqueRootCauses === 0, 'empty: uniqueRootCauses 0')
  check(r.topRootCausesByCount.length === 0, 'empty: topRC empty')
}

// 2. Non-quality issue → not counted
{
  const r = projectPlantCapaContentBrief(state([issue({ kind: 'maintenance', status: 'open' })]))
  check(r.totalCapa === 0, 'non-quality: totalCapa 0')
}

// 3. Open quality issue (no resolution) → not counted
{
  const r = projectPlantCapaContentBrief(state([issue({ kind: 'quality', status: 'open' })]))
  check(r.totalCapa === 0, 'open-quality: totalCapa 0')
}

// 4. Resolved issue without CAPA → not counted
{
  const r = projectPlantCapaContentBrief(state([issue({ status: 'resolved' })]))
  check(r.totalCapa === 0, 'resolved-no-capa: totalCapa 0')
}

// 5. Single CAPA
{
  const r = projectPlantCapaContentBrief(state([
    issue({ status: 'resolved', capaObj: capa({ failureMode: 'seal-leak', rootCause: 'worn seal' }) }),
  ]))
  check(r.totalCapa === 1, 'single: totalCapa 1')
  check(r.uniqueFailureModes === 1, 'single: uniqueFailureModes 1')
  check(r.topFailureModesByCount[0].failureMode === 'seal-leak', 'single: topFM name')
  check(r.topFailureModesByCount[0].count === 1, 'single: topFM count 1')
  check(r.uniqueRootCauses === 1, 'single: uniqueRootCauses 1')
  check(r.topRootCausesByCount[0].rootCause === 'worn seal', 'single: topRC name')
  check(r.topRootCausesByCount[0].count === 1, 'single: topRC count 1')
}

// 6. Same failureMode, different rootCause → uniqueFailureModes=1, uniqueRootCauses=2
{
  const r = projectPlantCapaContentBrief(state([
    issue({ status: 'resolved', capaObj: capa({ failureMode: 'seal-leak', rootCause: 'worn seal' }) }),
    issue({ status: 'resolved', capaObj: capa({ failureMode: 'seal-leak', rootCause: 'incorrect torque' }) }),
  ]))
  check(r.totalCapa === 2, 'same-fm: totalCapa 2')
  check(r.uniqueFailureModes === 1, 'same-fm: uniqueFailureModes 1')
  check(r.topFailureModesByCount[0].count === 2, 'same-fm: topFM count 2')
  check(r.uniqueRootCauses === 2, 'same-fm: uniqueRootCauses 2')
}

// 7. Top-5 ordering by count: mode A×3 should beat mode B×2
{
  const r = projectPlantCapaContentBrief(state([
    issue({ status: 'resolved', capaObj: capa({ failureMode: 'mode-B' }) }),
    issue({ status: 'resolved', capaObj: capa({ failureMode: 'mode-A' }) }),
    issue({ status: 'resolved', capaObj: capa({ failureMode: 'mode-A' }) }),
    issue({ status: 'resolved', capaObj: capa({ failureMode: 'mode-B' }) }),
    issue({ status: 'resolved', capaObj: capa({ failureMode: 'mode-A' }) }),
  ]))
  check(r.totalCapa === 5, 'top5: totalCapa 5')
  check(r.uniqueFailureModes === 2, 'top5: uniqueFailureModes 2')
  check(r.topFailureModesByCount[0].failureMode === 'mode-A', 'top5: first is mode-A')
  check(r.topFailureModesByCount[0].count === 3, 'top5: mode-A count 3')
  check(r.topFailureModesByCount[1].failureMode === 'mode-B', 'top5: second is mode-B')
  check(r.topFailureModesByCount[1].count === 2, 'top5: mode-B count 2')
}

// 8. Tie-break: lexicographic on failureMode
{
  const r = projectPlantCapaContentBrief(state([
    issue({ status: 'resolved', capaObj: capa({ failureMode: 'zebra' }) }),
    issue({ status: 'resolved', capaObj: capa({ failureMode: 'alpha' }) }),
  ]))
  check(r.topFailureModesByCount[0].failureMode === 'alpha', 'tiebreak: alpha before zebra')
}

console.log(JSON.stringify({ ok: true, checks }))
