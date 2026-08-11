// Plant job closure actor brief: closedBy distribution on job closures.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantJobClosureActorBrief } from './plant-job-closure-actor-brief.ts'`,
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

const { projectPlantJobClosureActorBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let jobId = 0
function job({ closedBy, hasClosure = true } = {}) {
  jobId++
  return {
    id: `job-${jobId}`,
    line: 'line-01',
    product: 'product-01',
    target: 100,
    output: 80,
    ...(hasClosure && {
      closure: {
        actionId: `closure-${jobId}`,
        closedAt: '2026-08-11T10:00:00Z',
        closedBy: closedBy ?? 'op-01',
        reason: 'Shift end.',
        evidenceReference: '',
        shiftRef: 'shift-01',
        remainingUnits: 20,
      },
    }),
  }
}

function state(jobs) {
  return {
    schema: 'supermega.production.workspace.v2',
    revision: 1,
    jobs: jobs ?? [],
    issues: [],
    machines: [],
    events: [],
  }
}

// 1. Empty → all zeros
{
  const r = projectPlantJobClosureActorBrief(state([]))
  check(r.totalClosures === 0, 'empty: totalClosures 0')
  check(r.uniqueActors === 0, 'empty: uniqueActors 0')
  check(r.topActorsByCount.length === 0, 'empty: topActors empty')
}

// 2. Job without closure
{
  const r = projectPlantJobClosureActorBrief(state([job({ hasClosure: false })]))
  check(r.totalClosures === 0, 'no-closure: totalClosures 0')
  check(r.uniqueActors === 0, 'no-closure: uniqueActors 0')
}

// 3. Single job with closure
{
  const r = projectPlantJobClosureActorBrief(state([job({ closedBy: 'op-01' })]))
  check(r.totalClosures === 1, 'single: totalClosures 1')
  check(r.uniqueActors === 1, 'single: uniqueActors 1')
  check(r.topActorsByCount[0].actor === 'op-01', 'single: op-01 in top')
  check(r.topActorsByCount[0].count === 1, 'single: count 1')
}

// 4. Same actor on multiple closures
{
  const r = projectPlantJobClosureActorBrief(state([
    job({ closedBy: 'op-01' }),
    job({ closedBy: 'op-01' }),
  ]))
  check(r.totalClosures === 2, 'same-actor: total 2')
  check(r.uniqueActors === 1, 'same-actor: unique 1')
  check(r.topActorsByCount[0].count === 2, 'same-actor: count 2')
}

// 5. Two actors
{
  const r = projectPlantJobClosureActorBrief(state([
    job({ closedBy: 'op-01' }),
    job({ closedBy: 'op-02' }),
  ]))
  check(r.totalClosures === 2, 'two-actors: total 2')
  check(r.uniqueActors === 2, 'two-actors: unique 2')
}

// 6. Sort by count desc
{
  const r = projectPlantJobClosureActorBrief(state([
    job({ closedBy: 'op-A' }),
    job({ closedBy: 'op-B' }),
    job({ closedBy: 'op-B' }),
  ]))
  check(r.topActorsByCount[0].actor === 'op-B', 'sort: op-B first (count 2)')
  check(r.topActorsByCount[1].actor === 'op-A', 'sort: op-A second (count 1)')
}

// 7. Secondary sort: same count → alphabetical
{
  const r = projectPlantJobClosureActorBrief(state([
    job({ closedBy: 'zz-op' }),
    job({ closedBy: 'aa-op' }),
  ]))
  check(r.topActorsByCount[0].actor === 'aa-op', 'secondary: aa before zz')
}

// 8. 6 actors → top 5
{
  const jobs = ['A', 'B', 'C', 'D', 'E', 'F'].map(a => job({ closedBy: `op-${a}` }))
  const r = projectPlantJobClosureActorBrief(state(jobs))
  check(r.uniqueActors === 6, 'top-5: unique 6')
  check(r.topActorsByCount.length === 5, 'top-5: capped at 5')
}

// 9. Mixed: jobs with and without closures
{
  const r = projectPlantJobClosureActorBrief(state([
    job({ closedBy: 'op-01' }),
    job({ hasClosure: false }),
    job({ closedBy: 'op-02' }),
    job({ closedBy: 'op-01' }),
  ]))
  check(r.totalClosures === 3, 'mixed: total 3')
  check(r.uniqueActors === 2, 'mixed: unique 2')
  check(r.topActorsByCount[0].actor === 'op-01', 'mixed: op-01 top (count 2)')
  check(r.topActorsByCount[0].count === 2, 'mixed: op-01 count 2')
  check(r.topActorsByCount[1].actor === 'op-02', 'mixed: op-02 second')
}

console.log(JSON.stringify({ ok: true, checks }))
