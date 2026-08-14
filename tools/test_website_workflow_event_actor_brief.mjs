import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteWorkflowEventActorBrief } from './website-workflow-event-actor-brief.ts'`,
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

const { projectWebsiteWorkflowEventActorBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let evtId = 0
function event(actor = 'alice', action = 'publish_evidence_recorded') {
  evtId++
  return {
    id: `WE-${evtId}`,
    createdAt: '2026-08-01T10:00:00Z',
    actorKind: 'human',
    actor,
    action,
    subjectId: `subj-${evtId}`,
    reason: 'Routine check',
    evidenceReference: `ev-${evtId}`,
    source: { contentRevision: 1, digest: `d-${evtId}` },
  }
}

function workspace(events = []) {
  return {
    schema: 'supermega.website.workspace.v2',
    version: 2,
    revision: 1,
    contentRevision: 1,
    siteName: 'Test Site',
    pages: [],
    selectedPageId: 'pg-1',
    evidence: [],
    approvals: [],
    localPublishes: [],
    events,
  }
}

// 1. No events
{
  const r = projectWebsiteWorkflowEventActorBrief(workspace())
  check(r.totalEvents === 0, 'empty: totalEvents 0')
  check(r.uniqueActors === 0, 'empty: uniqueActors 0')
  check(r.topActor === null, 'empty: topActor null')
  check(r.topActorCount === 0, 'empty: topActorCount 0')
}

// 2. Single event by alice
{
  const r = projectWebsiteWorkflowEventActorBrief(workspace([event('alice')]))
  check(r.totalEvents === 1, 'single: totalEvents 1')
  check(r.uniqueActors === 1, 'single: uniqueActors 1')
  check(r.topActor === 'alice', 'single: topActor alice')
  check(r.topActorCount === 1, 'single: topActorCount 1')
}

// 3. All events by same actor
{
  const r = projectWebsiteWorkflowEventActorBrief(workspace([
    event('alice', 'publish_evidence_recorded'),
    event('alice', 'website_revision_approved'),
    event('alice', 'local_snapshot_recorded'),
  ]))
  check(r.totalEvents === 3, 'all-same: totalEvents 3')
  check(r.uniqueActors === 1, 'all-same: uniqueActors 1')
  check(r.topActor === 'alice', 'all-same: topActor alice')
  check(r.topActorCount === 3, 'all-same: topActorCount 3')
}

// 4. Two actors — bob more frequent
{
  const r = projectWebsiteWorkflowEventActorBrief(workspace([
    event('alice'),
    event('bob'),
    event('bob'),
    event('bob'),
  ]))
  check(r.totalEvents === 4, 'two-actors: totalEvents 4')
  check(r.uniqueActors === 2, 'two-actors: uniqueActors 2')
  check(r.topActor === 'bob', 'two-actors: topActor bob')
  check(r.topActorCount === 3, 'two-actors: topActorCount 3')
}

// 5. Three actors — carol most frequent
{
  const r = projectWebsiteWorkflowEventActorBrief(workspace([
    event('alice'),
    event('carol'),
    event('carol'),
    event('bob'),
    event('carol'),
  ]))
  check(r.totalEvents === 5, 'three-actors: totalEvents 5')
  check(r.uniqueActors === 3, 'three-actors: uniqueActors 3')
  check(r.topActor === 'carol', 'three-actors: topActor carol')
  check(r.topActorCount === 3, 'three-actors: topActorCount 3')
}

// 6. Each actor appears once — uniqueActors = totalEvents
{
  const r = projectWebsiteWorkflowEventActorBrief(workspace([
    event('alpha'),
    event('beta'),
    event('gamma'),
  ]))
  check(r.totalEvents === 3, 'all-unique: totalEvents 3')
  check(r.uniqueActors === 3, 'all-unique: uniqueActors 3')
  check(r.topActorCount === 1, 'all-unique: topActorCount 1')
}

// 7. topActor is null only when no events
{
  const r1 = projectWebsiteWorkflowEventActorBrief(workspace())
  check(r1.topActor === null, 'null-guard: topActor null when empty')
  const r2 = projectWebsiteWorkflowEventActorBrief(workspace([event('dave')]))
  check(r2.topActor === 'dave', 'null-guard: topActor non-null when events exist')
}

console.log(`website-workflow-event-actor-brief: ${checks} checks passed`)
