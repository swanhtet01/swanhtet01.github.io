// Plant event actor brief: actor workload distribution + event-kind breakdown.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEventActorBrief } from './plant-event-actor-brief.ts'`,
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

const { projectPlantEventActorBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.production.workspace.v1'
let evId = 0
function ev(actor, kind) {
  evId++
  return {
    id: `ev-${evId}`,
    actionId: `act-${evId}`,
    createdAt: '2026-08-11T10:00:00Z',
    actor,
    reason: 'recorded',
    evidenceReference: `evref-${evId}`,
    kind,
    subjectId: `job-${evId}`,
    summary: `${kind} by ${actor}`,
  }
}

function state(...events) {
  return { schema: SCHEMA, revision: 1, jobs: [], issues: [], machines: [], events }
}

// 1. Empty → all zeros
{
  const r = projectPlantEventActorBrief(state())
  check(r.totalEvents === 0, 'empty: totalEvents 0')
  check(r.uniqueActors === 0, 'empty: uniqueActors 0')
  check(r.topActors.length === 0, 'empty: topActors []')
  check(r.byEventKind.length === 0, 'empty: byEventKind []')
  check(r.mostCommonEventKind === null, 'empty: mostCommonEventKind null')
}

// 2. Single event
{
  const r = projectPlantEventActorBrief(state(ev('alice', 'job_created')))
  check(r.totalEvents === 1, 'single: totalEvents 1')
  check(r.uniqueActors === 1, 'single: uniqueActors 1')
  check(r.topActors[0].actor === 'alice', 'single: topActors[0] alice')
  check(r.topActors[0].eventCount === 1, 'single: topActors[0].eventCount 1')
  check(r.byEventKind[0].kind === 'job_created', 'single: byEventKind[0] job_created')
  check(r.byEventKind[0].count === 1, 'single: byEventKind[0].count 1')
  check(r.mostCommonEventKind === 'job_created', 'single: mostCommonEventKind job_created')
}

// 3. Top actor by event count
{
  const r = projectPlantEventActorBrief(state(
    ev('alice', 'output_recorded'),
    ev('bob', 'output_recorded'),
    ev('alice', 'shift_closed'),
  ))
  check(r.topActors[0].actor === 'alice', 'sort-actor: alice first (2 events)')
  check(r.topActors[0].eventCount === 2, 'sort-actor: alice eventCount 2')
  check(r.topActors[1].actor === 'bob', 'sort-actor: bob second')
}

// 4. Event kind accumulation and sort
{
  const r = projectPlantEventActorBrief(state(
    ev('alice', 'output_recorded'),
    ev('bob', 'output_recorded'),
    ev('alice', 'issue_opened'),
    ev('bob', 'output_recorded'),
  ))
  check(r.byEventKind[0].kind === 'output_recorded', 'sort-kind: output_recorded first (3 events)')
  check(r.byEventKind[0].count === 3, 'sort-kind: output_recorded count 3')
  check(r.byEventKind[1].kind === 'issue_opened', 'sort-kind: issue_opened second')
  check(r.mostCommonEventKind === 'output_recorded', 'sort-kind: mostCommonEventKind output_recorded')
}

// 5. uniqueActors count
{
  const r = projectPlantEventActorBrief(state(
    ev('alice', 'job_created'),
    ev('bob', 'job_created'),
    ev('carol', 'job_created'),
    ev('alice', 'shift_closed'),
  ))
  check(r.uniqueActors === 3, 'unique-actors: uniqueActors 3')
  check(r.totalEvents === 4, 'unique-actors: totalEvents 4')
}

// 6. Top-5 cap
{
  const r = projectPlantEventActorBrief(state(
    ev('actor-1', 'job_created'),
    ev('actor-2', 'job_created'),
    ev('actor-3', 'job_created'),
    ev('actor-4', 'job_created'),
    ev('actor-5', 'job_created'),
    ev('actor-6', 'job_created'),
  ))
  check(r.topActors.length === 5, 'top5-cap: topActors capped at 5')
  check(r.uniqueActors === 6, 'top5-cap: uniqueActors 6 (all counted)')
}

// 7. Multiple distinct event kinds
{
  const r = projectPlantEventActorBrief(state(
    ev('alice', 'job_created'),
    ev('alice', 'output_recorded'),
    ev('alice', 'issue_opened'),
    ev('alice', 'shift_closed'),
  ))
  check(r.byEventKind.length === 4, 'multi-kind: byEventKind 4 distinct')
}

console.log(JSON.stringify({ ok: true, checks }))
