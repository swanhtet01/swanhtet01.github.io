// Plant issue kind brief: quality/maintenance/materials/operations distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantIssueKindBrief } from './plant-issue-kind-brief.ts'`,
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

const { projectPlantIssueKindBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let issueId = 0
function issue(kind) {
  issueId++
  return {
    id: `ISS-${issueId}`,
    createdAt: '2026-08-01T08:00:00Z',
    area: 'Line A',
    kind,
    summary: `Issue ${issueId}`,
    status: 'open',
  }
}

function state(issues) {
  return { schema: 'supermega.production.workspace.v2', jobs: [], events: [], issues, machines: [] }
}

// 1. No issues → all zeros
{
  const r = projectPlantIssueKindBrief(state([]))
  check(r.totalIssues === 0, 'empty: totalIssues 0')
  check(r.qualityCount === 0, 'empty: qualityCount 0')
  check(r.maintenanceCount === 0, 'empty: maintenanceCount 0')
  check(r.materialsCount === 0, 'empty: materialsCount 0')
  check(r.operationsCount === 0, 'empty: operationsCount 0')
  check(r.qualityRate === 0, 'empty: qualityRate 0')
  check(r.maintenanceRate === 0, 'empty: maintenanceRate 0')
  check(r.materialsRate === 0, 'empty: materialsRate 0')
  check(r.operationsRate === 0, 'empty: operationsRate 0')
}

// 2. Single quality issue
{
  const r = projectPlantIssueKindBrief(state([issue('quality')]))
  check(r.totalIssues === 1, 'quality-only: totalIssues 1')
  check(r.qualityCount === 1, 'quality-only: qualityCount 1')
  check(r.qualityRate === 100, 'quality-only: qualityRate 100')
  check(r.maintenanceCount === 0, 'quality-only: maintenanceCount 0')
}

// 3. Single maintenance issue
{
  const r = projectPlantIssueKindBrief(state([issue('maintenance')]))
  check(r.maintenanceCount === 1, 'maintenance-only: maintenanceCount 1')
  check(r.maintenanceRate === 100, 'maintenance-only: maintenanceRate 100')
  check(r.qualityCount === 0, 'maintenance-only: qualityCount 0')
}

// 4. Single materials issue
{
  const r = projectPlantIssueKindBrief(state([issue('materials')]))
  check(r.materialsCount === 1, 'materials-only: materialsCount 1')
  check(r.materialsRate === 100, 'materials-only: materialsRate 100')
}

// 5. Single operations issue
{
  const r = projectPlantIssueKindBrief(state([issue('operations')]))
  check(r.operationsCount === 1, 'operations-only: operationsCount 1')
  check(r.operationsRate === 100, 'operations-only: operationsRate 100')
}

// 6. Mixed: 2 quality, 1 maintenance, 1 materials, 1 operations
{
  const issues = [issue('quality'), issue('quality'), issue('maintenance'), issue('materials'), issue('operations')]
  const r = projectPlantIssueKindBrief(state(issues))
  check(r.totalIssues === 5, 'mixed: totalIssues 5')
  check(r.qualityCount === 2, 'mixed: qualityCount 2')
  check(r.maintenanceCount === 1, 'mixed: maintenanceCount 1')
  check(r.materialsCount === 1, 'mixed: materialsCount 1')
  check(r.operationsCount === 1, 'mixed: operationsCount 1')
  check(r.qualityRate === 40, 'mixed: qualityRate 40')
  check(r.maintenanceRate === 20, 'mixed: maintenanceRate 20')
  check(r.materialsRate === 20, 'mixed: materialsRate 20')
  check(r.operationsRate === 20, 'mixed: operationsRate 20')
}

// 7. Math.round: 1 of each kind out of 4 → all 25%
{
  const r = projectPlantIssueKindBrief(state([issue('quality'), issue('maintenance'), issue('materials'), issue('operations')]))
  check(r.qualityRate === 25, 'equal: qualityRate 25')
  check(r.maintenanceRate === 25, 'equal: maintenanceRate 25')
  check(r.materialsRate === 25, 'equal: materialsRate 25')
  check(r.operationsRate === 25, 'equal: operationsRate 25')
}

console.log(JSON.stringify({ ok: true, checks }))
