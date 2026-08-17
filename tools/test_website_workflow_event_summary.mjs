// Website workflow event summary: totalEvents, byAction, uniqueActors, uniqueSubjects.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteWorkflowEventSummary } from './website-workflow-event-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/website-workflow-event-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectWebsiteWorkflowEventSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.website.workspace.v2'

function event({ action = 'publish_evidence_recorded', actor = 'alice', subjectId = 'sub-1' } = {}) {
  return {
    id: `evt-${Math.random()}`,
    createdAt: '2026-01-01T00:00:00Z',
    actorKind: 'human',
    actor,
    action,
    subjectId,
    reason: 'test',
    evidenceReference: 'ref-1',
    source: { contentRevision: 1, digest: 'digest-1' },
  }
}

function workspace(events = []) {
  return {
    schema: SCHEMA,
    version: 2,
    revision: 1,
    contentRevision: 1,
    siteName: 'Test Site',
    pages: [],
    selectedPageId: 'page-1',
    evidence: [],
    approvals: [],
    localPublishes: [],
    events,
  }
}

// 1. Empty events
{
  const r = projectWebsiteWorkflowEventSummary(workspace([]))
  check(r.totalEvents === 0, 'empty: totalEvents 0')
  check(r.byAction.publish_evidence_recorded === 0, 'empty: publish_evidence_recorded 0')
  check(r.byAction.website_revision_approved === 0, 'empty: website_revision_approved 0')
  check(r.byAction.local_snapshot_recorded === 0, 'empty: local_snapshot_recorded 0')
  check(r.uniqueActors === 0, 'empty: uniqueActors 0')
  check(r.uniqueSubjects === 0, 'empty: uniqueSubjects 0')
}

// 2. Single publish_evidence_recorded
{
  const r = projectWebsiteWorkflowEventSummary(workspace([
    event({ action: 'publish_evidence_recorded', actor: 'alice', subjectId: 'sub-1' }),
  ]))
  check(r.totalEvents === 1, 'single-publish: totalEvents 1')
  check(r.byAction.publish_evidence_recorded === 1, 'single-publish: publish_evidence_recorded 1')
  check(r.byAction.website_revision_approved === 0, 'single-publish: website_revision_approved 0')
  check(r.byAction.local_snapshot_recorded === 0, 'single-publish: local_snapshot_recorded 0')
  check(r.uniqueActors === 1, 'single-publish: uniqueActors 1')
  check(r.uniqueSubjects === 1, 'single-publish: uniqueSubjects 1')
}

// 3. Single website_revision_approved
{
  const r = projectWebsiteWorkflowEventSummary(workspace([
    event({ action: 'website_revision_approved' }),
  ]))
  check(r.byAction.website_revision_approved === 1, 'single-approved: website_revision_approved 1')
}

// 4. Single local_snapshot_recorded
{
  const r = projectWebsiteWorkflowEventSummary(workspace([
    event({ action: 'local_snapshot_recorded' }),
  ]))
  check(r.byAction.local_snapshot_recorded === 1, 'single-snapshot: local_snapshot_recorded 1')
}

// 5. Actor deduplication: 2 events same actor, different subjects
{
  const r = projectWebsiteWorkflowEventSummary(workspace([
    event({ actor: 'alice', subjectId: 'sub-1' }),
    event({ actor: 'alice', subjectId: 'sub-2' }),
  ]))
  check(r.totalEvents === 2, 'actor-dedup: totalEvents 2')
  check(r.uniqueActors === 1, 'actor-dedup: uniqueActors 1')
  check(r.uniqueSubjects === 2, 'actor-dedup: uniqueSubjects 2')
}

// 6. Subject deduplication: 3 events different actors, same subject
{
  const r = projectWebsiteWorkflowEventSummary(workspace([
    event({ actor: 'alice', subjectId: 'sub-x' }),
    event({ actor: 'bob', subjectId: 'sub-x' }),
    event({ actor: 'carol', subjectId: 'sub-x' }),
  ]))
  check(r.uniqueActors === 3, 'subject-dedup: uniqueActors 3')
  check(r.uniqueSubjects === 1, 'subject-dedup: uniqueSubjects 1')
}

// 7. All 3 action kinds, distinct actors and subjects
{
  const r = projectWebsiteWorkflowEventSummary(workspace([
    event({ action: 'publish_evidence_recorded', actor: 'alice', subjectId: 'sub-1' }),
    event({ action: 'website_revision_approved', actor: 'bob', subjectId: 'sub-2' }),
    event({ action: 'local_snapshot_recorded', actor: 'carol', subjectId: 'sub-3' }),
  ]))
  check(r.totalEvents === 3, 'mixed: totalEvents 3')
  check(r.byAction.publish_evidence_recorded === 1, 'mixed: publish_evidence_recorded 1')
  check(r.byAction.website_revision_approved === 1, 'mixed: website_revision_approved 1')
  check(r.byAction.local_snapshot_recorded === 1, 'mixed: local_snapshot_recorded 1')
  check(r.uniqueActors === 3, 'mixed: uniqueActors 3')
  check(r.uniqueSubjects === 3, 'mixed: uniqueSubjects 3')
}

console.log(JSON.stringify({ ok: true, checks }))
