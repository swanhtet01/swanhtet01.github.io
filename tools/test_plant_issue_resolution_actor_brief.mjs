// Plant issue resolution actor brief: resolvedBy distribution on issue resolutions.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantIssueResolutionActorBrief } from './plant-issue-resolution-actor-brief.ts'`,
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

const { projectPlantIssueResolutionActorBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let issueId = 0
function issue({ resolvedBy, hasResolution = true } = {}) {
  issueId++
  return {
    id: `issue-${issueId}`,
    createdAt: '2026-08-11T08:00:00Z',
    area: 'line-01',
    kind: 'quality',
    summary: 'Quality concern.',
    status: hasResolution ? 'resolved' : 'open',
    ...(hasResolution && {
      resolution: {
        actionId: `res-${issueId}`,
        resolvedAt: '2026-08-11T10:00:00Z',
        resolvedBy: resolvedBy ?? 'qa-01',
        reason: 'Root cause identified and corrected.',
        evidenceReference: '',
      },
    }),
  }
}

function state(issues) {
  return {
    schema: 'supermega.production.workspace.v2',
    revision: 1,
    jobs: [],
    issues: issues ?? [],
    machines: [],
    events: [],
  }
}

// 1. Empty → all zeros
{
  const r = projectPlantIssueResolutionActorBrief(state([]))
  check(r.totalResolutions === 0, 'empty: totalResolutions 0')
  check(r.uniqueActors === 0, 'empty: uniqueActors 0')
  check(r.topActorsByCount.length === 0, 'empty: topActors empty')
}

// 2. Issue without resolution
{
  const r = projectPlantIssueResolutionActorBrief(state([issue({ hasResolution: false })]))
  check(r.totalResolutions === 0, 'no-resolution: totalResolutions 0')
  check(r.uniqueActors === 0, 'no-resolution: uniqueActors 0')
}

// 3. Single issue with resolution
{
  const r = projectPlantIssueResolutionActorBrief(state([issue({ resolvedBy: 'qa-01' })]))
  check(r.totalResolutions === 1, 'single: totalResolutions 1')
  check(r.uniqueActors === 1, 'single: uniqueActors 1')
  check(r.topActorsByCount[0].actor === 'qa-01', 'single: qa-01 in top')
  check(r.topActorsByCount[0].count === 1, 'single: count 1')
}

// 4. Same actor on multiple resolutions
{
  const r = projectPlantIssueResolutionActorBrief(state([
    issue({ resolvedBy: 'qa-01' }),
    issue({ resolvedBy: 'qa-01' }),
  ]))
  check(r.totalResolutions === 2, 'same-actor: total 2')
  check(r.uniqueActors === 1, 'same-actor: unique 1')
  check(r.topActorsByCount[0].count === 2, 'same-actor: count 2')
}

// 5. Two actors
{
  const r = projectPlantIssueResolutionActorBrief(state([
    issue({ resolvedBy: 'qa-01' }),
    issue({ resolvedBy: 'qa-02' }),
  ]))
  check(r.totalResolutions === 2, 'two-actors: total 2')
  check(r.uniqueActors === 2, 'two-actors: unique 2')
}

// 6. Sort by count desc
{
  const r = projectPlantIssueResolutionActorBrief(state([
    issue({ resolvedBy: 'qa-A' }),
    issue({ resolvedBy: 'qa-B' }),
    issue({ resolvedBy: 'qa-B' }),
  ]))
  check(r.topActorsByCount[0].actor === 'qa-B', 'sort: qa-B first (count 2)')
  check(r.topActorsByCount[1].actor === 'qa-A', 'sort: qa-A second (count 1)')
}

// 7. Secondary sort: same count → alphabetical
{
  const r = projectPlantIssueResolutionActorBrief(state([
    issue({ resolvedBy: 'zz-qa' }),
    issue({ resolvedBy: 'aa-qa' }),
  ]))
  check(r.topActorsByCount[0].actor === 'aa-qa', 'secondary: aa before zz')
}

// 8. 6 actors → top 5
{
  const issues = ['A', 'B', 'C', 'D', 'E', 'F'].map(a => issue({ resolvedBy: `qa-${a}` }))
  const r = projectPlantIssueResolutionActorBrief(state(issues))
  check(r.uniqueActors === 6, 'top-5: unique 6')
  check(r.topActorsByCount.length === 5, 'top-5: capped at 5')
}

// 9. Mixed: issues with and without resolutions
{
  const r = projectPlantIssueResolutionActorBrief(state([
    issue({ resolvedBy: 'qa-01' }),
    issue({ hasResolution: false }),
    issue({ resolvedBy: 'qa-02' }),
    issue({ resolvedBy: 'qa-01' }),
  ]))
  check(r.totalResolutions === 3, 'mixed: total 3')
  check(r.uniqueActors === 2, 'mixed: unique 2')
  check(r.topActorsByCount[0].actor === 'qa-01', 'mixed: qa-01 top (count 2)')
  check(r.topActorsByCount[0].count === 2, 'mixed: qa-01 count 2')
  check(r.topActorsByCount[1].actor === 'qa-02', 'mixed: qa-02 second')
}

// 10. Null issues guard (undefined issues array)
{
  const r = projectPlantIssueResolutionActorBrief({
    schema: 'supermega.production.workspace.v2',
    revision: 1,
    jobs: [],
    issues: undefined,
    machines: [],
    events: [],
  })
  check(r.totalResolutions === 0, 'null-guard: totalResolutions 0')
}

console.log(JSON.stringify({ ok: true, checks }))
