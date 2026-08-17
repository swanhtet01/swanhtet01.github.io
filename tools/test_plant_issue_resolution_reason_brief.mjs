// Plant issue resolution reason brief: reason text distribution across resolved issues.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantIssueResolutionReasonBrief } from './plant-issue-resolution-reason-brief.ts'`,
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

const { projectPlantIssueResolutionReasonBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let issueId = 0
function issue(reason) {
  issueId++
  const i = {
    id: `ISS-${issueId}`,
    createdAt: '2026-08-01T08:00:00Z',
    area: 'Line A',
    kind: 'quality',
    summary: `Issue ${issueId}`,
    status: 'resolved',
  }
  if (reason !== undefined) {
    i.resolution = {
      actionId: `ACT-${issueId}`,
      resolvedAt: '2026-08-02T10:00:00Z',
      resolvedBy: 'operator-1',
      reason,
      evidenceReference: `EVD-${issueId}`,
    }
  }
  return i
}

function state(issues) {
  return { schema: 'supermega.production.workspace.v2', jobs: [], events: [], issues, machines: [] }
}

// 1. No issues → zeros
{
  const r = projectPlantIssueResolutionReasonBrief(state([]))
  check(r.totalResolutions === 0, 'empty: totalResolutions 0')
  check(r.uniqueReasons === 0, 'empty: uniqueReasons 0')
  check(r.topReasonsByCount.length === 0, 'empty: topReasonsByCount empty')
}

// 2. Issues with no resolution (open) → not counted
{
  const r = projectPlantIssueResolutionReasonBrief(state([issue(undefined), issue(undefined)]))
  check(r.totalResolutions === 0, 'no-resolution: totalResolutions 0')
}

// 3. Single resolved issue
{
  const r = projectPlantIssueResolutionReasonBrief(state([issue('Root cause fixed.')]))
  check(r.totalResolutions === 1, 'single: totalResolutions 1')
  check(r.uniqueReasons === 1, 'single: uniqueReasons 1')
  check(r.topReasonsByCount[0]?.reason === 'Root cause fixed.', 'single: top reason')
  check(r.topReasonsByCount[0]?.count === 1, 'single: count 1')
}

// 4. Mixed open and resolved
{
  const issues = [issue(undefined), issue('Repaired.'), issue('Repaired.'), issue('Replaced part.')]
  const r = projectPlantIssueResolutionReasonBrief(state(issues))
  check(r.totalResolutions === 3, 'mixed: totalResolutions 3')
  check(r.uniqueReasons === 2, 'mixed: uniqueReasons 2')
  check(r.topReasonsByCount[0]?.reason === 'Repaired.', 'mixed: top reason Repaired.')
  check(r.topReasonsByCount[0]?.count === 2, 'mixed: count 2')
}

// 5. Top-5 cap: 6 reasons → capped with alphabetic tiebreak
{
  const reasons = ['Reason F', 'Reason A', 'Reason C', 'Reason B', 'Reason D', 'Reason E']
  const r = projectPlantIssueResolutionReasonBrief(state(reasons.map(r => issue(r))))
  check(r.uniqueReasons === 6, 'top5: uniqueReasons 6')
  check(r.topReasonsByCount.length === 5, 'top5: capped at 5')
  check(r.topReasonsByCount[0]?.reason === 'Reason A', 'top5: tiebreak Reason A first')
}

console.log(JSON.stringify({ ok: true, checks }))
