import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteWorkflowEventContentRevisionBrief } from './website-workflow-event-content-revision-brief.ts'`,
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

const { projectWebsiteWorkflowEventContentRevisionBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let eventId = 0
function workflowEvent(contentRevision = 1) {
  eventId++
  return {
    id: `ev-${eventId}`,
    createdAt: '2026-08-01T09:00:00Z',
    actorKind: 'human',
    actor: 'alice',
    action: 'publish_evidence_recorded',
    subjectId: `subj-${eventId}`,
    reason: 'Evidence recorded',
    evidenceReference: `ref-${eventId}`,
    source: { contentRevision, digest: `digest-${contentRevision}` },
  }
}

function workspace(events = []) {
  return {
    schema: 'supermega.website.workspace.v2',
    version: 2,
    revision: 0,
    contentRevision: 0,
    siteName: 'Test Site',
    pages: [],
    selectedPageId: '',
    evidence: [],
    approvals: [],
    localPublishes: [],
    events,
  }
}

// 1. Empty workspace
{
  const r = projectWebsiteWorkflowEventContentRevisionBrief(workspace())
  check(r.totalEvents === 0, 'empty: totalEvents 0')
  check(r.minContentRevision === null, 'empty: minContentRevision null')
  check(r.maxContentRevision === null, 'empty: maxContentRevision null')
  check(r.uniqueRevisions === 0, 'empty: uniqueRevisions 0')
}

// 2. Single event — revision 1
{
  const r = projectWebsiteWorkflowEventContentRevisionBrief(workspace([workflowEvent(1)]))
  check(r.totalEvents === 1, 'single: totalEvents 1')
  check(r.minContentRevision === 1, 'single: minContentRevision 1')
  check(r.maxContentRevision === 1, 'single: maxContentRevision 1')
  check(r.uniqueRevisions === 1, 'single: uniqueRevisions 1')
}

// 3. Two events same revision — uniqueRevisions 1
{
  const r = projectWebsiteWorkflowEventContentRevisionBrief(workspace([
    workflowEvent(2),
    workflowEvent(2),
  ]))
  check(r.totalEvents === 2, 'same-rev: totalEvents 2')
  check(r.minContentRevision === 2, 'same-rev: minContentRevision 2')
  check(r.maxContentRevision === 2, 'same-rev: maxContentRevision 2')
  check(r.uniqueRevisions === 1, 'same-rev: uniqueRevisions 1')
}

// 4. Two events different revisions
{
  const r = projectWebsiteWorkflowEventContentRevisionBrief(workspace([
    workflowEvent(1),
    workflowEvent(3),
  ]))
  check(r.totalEvents === 2, 'two-diff: totalEvents 2')
  check(r.minContentRevision === 1, 'two-diff: minContentRevision 1')
  check(r.maxContentRevision === 3, 'two-diff: maxContentRevision 3')
  check(r.uniqueRevisions === 2, 'two-diff: uniqueRevisions 2')
}

// 5. Three events out of order — all unique revisions
{
  const r = projectWebsiteWorkflowEventContentRevisionBrief(workspace([
    workflowEvent(3),
    workflowEvent(1),
    workflowEvent(2),
  ]))
  check(r.totalEvents === 3, 'unsorted: totalEvents 3')
  check(r.minContentRevision === 1, 'unsorted: minContentRevision 1')
  check(r.maxContentRevision === 3, 'unsorted: maxContentRevision 3')
  check(r.uniqueRevisions === 3, 'unsorted: uniqueRevisions 3')
}

// 6. Three events with two sharing same revision
{
  const r = projectWebsiteWorkflowEventContentRevisionBrief(workspace([
    workflowEvent(1),
    workflowEvent(2),
    workflowEvent(1),
  ]))
  check(r.totalEvents === 3, 'partial-dup: totalEvents 3')
  check(r.uniqueRevisions === 2, 'partial-dup: uniqueRevisions 2')
  check(r.minContentRevision === 1, 'partial-dup: minContentRevision 1')
}

console.log(`website-workflow-event-content-revision-brief: ${checks} checks passed`)
