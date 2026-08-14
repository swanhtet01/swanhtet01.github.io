// Plant issue status brief: open/resolved distribution across production issues.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantIssueStatusBrief } from './plant-issue-status-brief.ts'`,
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

const { projectPlantIssueStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let issueId = 0
function issue(status) {
  issueId++
  return {
    id: `ISS-${issueId}`,
    createdAt: '2026-08-01T08:00:00Z',
    area: 'Line A',
    kind: 'quality',
    summary: `Issue ${issueId}`,
    status,
  }
}

function state(issues) {
  return { schema: 'supermega.production.workspace.v2', jobs: [], events: [], issues, machines: [] }
}

// 1. No issues → all zeros
{
  const r = projectPlantIssueStatusBrief(state([]))
  check(r.totalIssues === 0, 'empty: totalIssues 0')
  check(r.openCount === 0, 'empty: openCount 0')
  check(r.resolvedCount === 0, 'empty: resolvedCount 0')
  check(r.openRate === 0, 'empty: openRate 0')
  check(r.resolvedRate === 0, 'empty: resolvedRate 0')
}

// 2. Single open issue
{
  const r = projectPlantIssueStatusBrief(state([issue('open')]))
  check(r.totalIssues === 1, 'open-only: totalIssues 1')
  check(r.openCount === 1, 'open-only: openCount 1')
  check(r.resolvedCount === 0, 'open-only: resolvedCount 0')
  check(r.openRate === 100, 'open-only: openRate 100')
  check(r.resolvedRate === 0, 'open-only: resolvedRate 0')
}

// 3. Single resolved issue
{
  const r = projectPlantIssueStatusBrief(state([issue('resolved')]))
  check(r.resolvedCount === 1, 'resolved-only: resolvedCount 1')
  check(r.resolvedRate === 100, 'resolved-only: resolvedRate 100')
  check(r.openRate === 0, 'resolved-only: openRate 0')
}

// 4. Mixed: 2 open, 1 resolved
{
  const r = projectPlantIssueStatusBrief(state([issue('open'), issue('open'), issue('resolved')]))
  check(r.totalIssues === 3, 'mixed: totalIssues 3')
  check(r.openCount === 2, 'mixed: openCount 2')
  check(r.resolvedCount === 1, 'mixed: resolvedCount 1')
  check(r.openRate === 67, 'mixed: openRate round(66.7)=67')
  check(r.resolvedRate === 33, 'mixed: resolvedRate round(33.3)=33')
}

// 5. Equal split: 2 open, 2 resolved
{
  const r = projectPlantIssueStatusBrief(state([issue('open'), issue('resolved'), issue('open'), issue('resolved')]))
  check(r.openRate === 50, 'equal: openRate 50')
  check(r.resolvedRate === 50, 'equal: resolvedRate 50')
}

// 6. All resolved
{
  const r = projectPlantIssueStatusBrief(state([issue('resolved'), issue('resolved')]))
  check(r.openCount === 0, 'all-resolved: openCount 0')
  check(r.resolvedCount === 2, 'all-resolved: resolvedCount 2')
  check(r.resolvedRate === 100, 'all-resolved: resolvedRate 100')
}

console.log(JSON.stringify({ ok: true, checks }))
