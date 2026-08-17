// Plant issue area brief: area text distribution across production issues.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantIssueAreaBrief } from './plant-issue-area-brief.ts'`,
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

const { projectPlantIssueAreaBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let issueId = 0
function issue(area) {
  issueId++
  return {
    id: `ISS-${issueId}`,
    createdAt: '2026-08-01T08:00:00Z',
    area,
    kind: 'quality',
    summary: `Issue ${issueId}`,
    status: 'open',
  }
}

function state(issues) {
  return { schema: 'supermega.production.workspace.v2', jobs: [], events: [], issues, machines: [] }
}

// 1. No issues → zeros
{
  const r = projectPlantIssueAreaBrief(state([]))
  check(r.totalIssues === 0, 'empty: totalIssues 0')
  check(r.uniqueAreas === 0, 'empty: uniqueAreas 0')
  check(r.topAreasByCount.length === 0, 'empty: topAreasByCount empty')
}

// 2. Single issue
{
  const r = projectPlantIssueAreaBrief(state([issue('Line A')]))
  check(r.totalIssues === 1, 'single: totalIssues 1')
  check(r.uniqueAreas === 1, 'single: uniqueAreas 1')
  check(r.topAreasByCount[0]?.area === 'Line A', 'single: top area')
  check(r.topAreasByCount[0]?.count === 1, 'single: top area count 1')
}

// 3. Multiple issues in same area
{
  const r = projectPlantIssueAreaBrief(state([issue('Line A'), issue('Line A'), issue('Line B')]))
  check(r.totalIssues === 3, 'shared: totalIssues 3')
  check(r.uniqueAreas === 2, 'shared: uniqueAreas 2')
  check(r.topAreasByCount[0]?.area === 'Line A', 'shared: top area Line A')
  check(r.topAreasByCount[0]?.count === 2, 'shared: top area count 2')
  check(r.topAreasByCount[1]?.area === 'Line B', 'shared: second area Line B')
}

// 4. Top-5 cap: 6 distinct areas → capped at 5 with alphabetic tiebreak
{
  const areas = ['Zone F', 'Zone A', 'Zone C', 'Zone B', 'Zone D', 'Zone E']
  const r = projectPlantIssueAreaBrief(state(areas.map(a => issue(a))))
  check(r.uniqueAreas === 6, 'top5: uniqueAreas 6')
  check(r.topAreasByCount.length === 5, 'top5: capped at 5')
  check(r.topAreasByCount[0]?.area === 'Zone A', 'top5: tiebreak alphabetic Zone A first')
}

// 5. Sort order: highest count first
{
  const issues = [issue('Area X'), issue('Area Y'), issue('Area Y'), issue('Area Y')]
  const r = projectPlantIssueAreaBrief(state(issues))
  check(r.topAreasByCount[0]?.area === 'Area Y', 'sort: Area Y first')
  check(r.topAreasByCount[0]?.count === 3, 'sort: Area Y count 3')
  check(r.topAreasByCount[1]?.area === 'Area X', 'sort: Area X second')
}

console.log(JSON.stringify({ ok: true, checks }))
