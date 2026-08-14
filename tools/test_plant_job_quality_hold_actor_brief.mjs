// Plant job quality hold actor brief: heldBy distribution on quality holds.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantJobQualityHoldActorBrief } from './plant-job-quality-hold-actor-brief.ts'`,
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

const { projectPlantJobQualityHoldActorBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let jobId = 0
function job({ heldBy, hasHold = true } = {}) {
  jobId++
  return {
    id: `job-${jobId}`,
    line: 'line-01',
    product: 'product-01',
    target: 100,
    output: 80,
    ...(hasHold && {
      qualityHold: {
        actionId: `hold-${jobId}`,
        heldAt: '2026-08-11T08:00:00Z',
        heldBy: heldBy ?? 'qa-01',
        reason: 'Quality issue.',
        evidenceReference: '',
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
  const r = projectPlantJobQualityHoldActorBrief(state([]))
  check(r.totalHolds === 0, 'empty: totalHolds 0')
  check(r.uniqueActors === 0, 'empty: uniqueActors 0')
  check(r.topActorsByCount.length === 0, 'empty: topActors empty')
}

// 2. Job without hold
{
  const r = projectPlantJobQualityHoldActorBrief(state([job({ hasHold: false })]))
  check(r.totalHolds === 0, 'no-hold: totalHolds 0')
}

// 3. Single job with hold
{
  const r = projectPlantJobQualityHoldActorBrief(state([job({ heldBy: 'qa-01' })]))
  check(r.totalHolds === 1, 'single: totalHolds 1')
  check(r.uniqueActors === 1, 'single: uniqueActors 1')
  check(r.topActorsByCount[0].actor === 'qa-01', 'single: qa-01 in top')
  check(r.topActorsByCount[0].count === 1, 'single: count 1')
}

// 4. Same actor on multiple holds
{
  const r = projectPlantJobQualityHoldActorBrief(state([
    job({ heldBy: 'qa-01' }),
    job({ heldBy: 'qa-01' }),
  ]))
  check(r.totalHolds === 2, 'same-actor: total 2')
  check(r.uniqueActors === 1, 'same-actor: unique 1')
  check(r.topActorsByCount[0].count === 2, 'same-actor: count 2')
}

// 5. Two actors
{
  const r = projectPlantJobQualityHoldActorBrief(state([
    job({ heldBy: 'qa-01' }),
    job({ heldBy: 'qa-02' }),
  ]))
  check(r.uniqueActors === 2, 'two-actors: unique 2')
}

// 6. Sort by count desc
{
  const r = projectPlantJobQualityHoldActorBrief(state([
    job({ heldBy: 'qa-A' }),
    job({ heldBy: 'qa-B' }),
    job({ heldBy: 'qa-B' }),
  ]))
  check(r.topActorsByCount[0].actor === 'qa-B', 'sort: qa-B first (count 2)')
  check(r.topActorsByCount[1].actor === 'qa-A', 'sort: qa-A second (count 1)')
}

// 7. Secondary sort: same count → alphabetical
{
  const r = projectPlantJobQualityHoldActorBrief(state([
    job({ heldBy: 'zz-qa' }),
    job({ heldBy: 'aa-qa' }),
  ]))
  check(r.topActorsByCount[0].actor === 'aa-qa', 'secondary: aa before zz')
}

// 8. 6 actors → top 5
{
  const jobs = ['A', 'B', 'C', 'D', 'E', 'F'].map(a => job({ heldBy: `qa-${a}` }))
  const r = projectPlantJobQualityHoldActorBrief(state(jobs))
  check(r.uniqueActors === 6, 'top-5: unique 6')
  check(r.topActorsByCount.length === 5, 'top-5: capped at 5')
}

// 9. Mixed: jobs with and without holds
{
  const r = projectPlantJobQualityHoldActorBrief(state([
    job({ heldBy: 'qa-01' }),
    job({ hasHold: false }),
    job({ heldBy: 'qa-02' }),
    job({ heldBy: 'qa-01' }),
  ]))
  check(r.totalHolds === 3, 'mixed: total 3')
  check(r.uniqueActors === 2, 'mixed: unique 2')
  check(r.topActorsByCount[0].actor === 'qa-01', 'mixed: qa-01 top (count 2)')
}

console.log(JSON.stringify({ ok: true, checks }))
