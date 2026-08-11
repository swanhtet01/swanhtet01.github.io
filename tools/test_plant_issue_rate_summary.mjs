// Plant issue rate summary: aggregates ProductionState.issues into open/resolved counts, severity,
// kind, and area breakdowns. Tests filtering, counting, openRate, and sort order.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantIssueRateSummary } from './plant-issue-rate-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/issue-rate-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectPlantIssueRateSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let seq = 0
function issue({
  status = 'open',
  kind = 'quality',
  severity = undefined,
  area = 'Line1',
} = {}) {
  seq += 1
  return {
    id: `issue-${seq}`,
    createdAt: `2026-08-0${(seq % 9) + 1}T08:00:00Z`,
    area,
    kind,
    summary: `Issue ${seq}`,
    status,
    ...(severity !== undefined ? { severity } : {}),
  }
}

function state(issues = []) {
  return { jobs: [], events: [], issues }
}

// 1. Empty state → all zeros
{
  const r = projectPlantIssueRateSummary(state())
  check(r.totalIssues === 0, 'empty: totalIssues is 0')
  check(r.openCount === 0, 'empty: openCount is 0')
  check(r.resolvedCount === 0, 'empty: resolvedCount is 0')
  check(r.criticalOpenCount === 0, 'empty: criticalOpenCount is 0')
  check(r.openRate === 0, 'empty: openRate is 0 (no zero-division)')
  check(r.byArea.length === 0, 'empty: byArea is empty')
}

// 2. Single open issue
{
  const r = projectPlantIssueRateSummary(state([issue({ status: 'open', kind: 'quality', severity: 'critical', area: 'Line1' })]))
  check(r.totalIssues === 1, 'single-open: totalIssues is 1')
  check(r.openCount === 1, 'single-open: openCount is 1')
  check(r.resolvedCount === 0, 'single-open: resolvedCount is 0')
  check(r.criticalOpenCount === 1, 'single-open: criticalOpenCount is 1')
  check(r.openRate === 100, 'single-open: openRate is 100')
  check(r.byKind.quality === 1, 'single-open: byKind.quality is 1')
  check(r.bySeverity.critical === 1, 'single-open: bySeverity.critical is 1')
  check(r.byArea[0].area === 'Line1', 'single-open: byArea[0] is Line1')
}

// 3. Single resolved issue → openRate is 0
{
  const r = projectPlantIssueRateSummary(state([issue({ status: 'resolved', kind: 'maintenance', severity: 'high', area: 'MachineB' })]))
  check(r.openCount === 0, 'single-resolved: openCount is 0')
  check(r.resolvedCount === 1, 'single-resolved: resolvedCount is 1')
  check(r.openRate === 0, 'single-resolved: openRate is 0')
  check(r.criticalOpenCount === 0, 'single-resolved: criticalOpenCount is 0')
}

// 4. Mixed open/resolved → openRate rounding
{
  const issues = [
    issue({ status: 'open', kind: 'quality', area: 'A' }),
    issue({ status: 'open', kind: 'quality', area: 'A' }),
    issue({ status: 'resolved', kind: 'maintenance', area: 'B' }),
  ]
  const r = projectPlantIssueRateSummary(state(issues))
  check(r.totalIssues === 3, 'mixed: totalIssues is 3')
  check(r.openCount === 2, 'mixed: openCount is 2')
  check(r.resolvedCount === 1, 'mixed: resolvedCount is 1')
  // openRate = round(2/3 * 100) = round(66.67) = 67
  check(r.openRate === 67, 'mixed: openRate is 67')
}

// 5. byKind counts all four kinds
{
  const issues = [
    issue({ kind: 'quality' }),
    issue({ kind: 'quality' }),
    issue({ kind: 'maintenance' }),
    issue({ kind: 'materials' }),
    issue({ kind: 'operations' }),
    issue({ kind: 'operations' }),
  ]
  const r = projectPlantIssueRateSummary(state(issues))
  check(r.byKind.quality === 2, 'byKind: quality count is 2')
  check(r.byKind.maintenance === 1, 'byKind: maintenance count is 1')
  check(r.byKind.materials === 1, 'byKind: materials count is 1')
  check(r.byKind.operations === 2, 'byKind: operations count is 2')
}

// 6. bySeverity with all levels
{
  const issues = [
    issue({ severity: 'critical' }),
    issue({ severity: 'high' }),
    issue({ severity: 'high' }),
    issue({ severity: 'medium' }),
    issue({ severity: 'low' }),
  ]
  const r = projectPlantIssueRateSummary(state(issues))
  check(r.bySeverity.critical === 1, 'bySeverity: critical is 1')
  check(r.bySeverity.high === 2, 'bySeverity: high is 2')
  check(r.bySeverity.medium === 1, 'bySeverity: medium is 1')
  check(r.bySeverity.low === 1, 'bySeverity: low is 1')
  check(r.bySeverity.unspecified === 0, 'bySeverity: unspecified is 0')
}

// 7. Issue with no severity → counted as unspecified
{
  const r = projectPlantIssueRateSummary(state([issue()]))
  check(r.bySeverity.unspecified === 1, 'unspecified: issue with no severity goes to unspecified')
  check(r.criticalOpenCount === 0, 'unspecified: no severity is not critical open')
}

// 8. criticalOpenCount counts only open+critical, not resolved+critical
{
  const issues = [
    issue({ status: 'open', severity: 'critical', area: 'A' }),
    issue({ status: 'resolved', severity: 'critical', area: 'B' }),
    issue({ status: 'open', severity: 'high', area: 'C' }),
  ]
  const r = projectPlantIssueRateSummary(state(issues))
  check(r.criticalOpenCount === 1, 'criticalOpen: only open+critical counted')
  check(r.bySeverity.critical === 2, 'criticalOpen: bySeverity.critical counts both open and resolved')
}

// 9. byArea sorted descending by count
{
  const issues = [
    issue({ area: 'Mixing' }),
    issue({ area: 'Assembly' }),
    issue({ area: 'Assembly' }),
    issue({ area: 'Mixing' }),
    issue({ area: 'Mixing' }),
    issue({ area: 'Packaging' }),
  ]
  const r = projectPlantIssueRateSummary(state(issues))
  check(r.byArea[0].area === 'Mixing', 'byArea: Mixing (3) is first')
  check(r.byArea[0].count === 3, 'byArea: Mixing count is 3')
  check(r.byArea[1].area === 'Assembly', 'byArea: Assembly (2) is second')
  check(r.byArea[2].area === 'Packaging', 'byArea: Packaging (1) is third')
}

// 10. byArea ties sorted alphabetically (A before B)
{
  const issues = [
    issue({ area: 'ZoneB' }),
    issue({ area: 'ZoneA' }),
  ]
  const r = projectPlantIssueRateSummary(state(issues))
  check(r.byArea[0].area === 'ZoneA', 'byArea-alpha: ZoneA before ZoneB on tie')
}

// 11. openRate = 50 exactly (round half-up: 1/2 = 50)
{
  const issues = [
    issue({ status: 'open' }),
    issue({ status: 'resolved' }),
  ]
  const r = projectPlantIssueRateSummary(state(issues))
  check(r.openRate === 50, 'openRate: 1/2 = 50')
}

console.log(JSON.stringify({ ok: true, checks }))
