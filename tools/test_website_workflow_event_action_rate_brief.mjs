import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteWorkflowEventActionRateBrief } from './website-workflow-event-action-rate-brief.ts'`,
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

const { projectWebsiteWorkflowEventActionRateBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let eventId = 0
function workflowEvent(action = 'publish_evidence_recorded') {
  eventId++
  return {
    id: `ev-${eventId}`,
    createdAt: '2026-08-01T09:00:00Z',
    actorKind: 'human',
    actor: 'alice',
    action,
    subjectId: `subj-${eventId}`,
    reason: 'Action taken',
    evidenceReference: `ref-${eventId}`,
    source: { contentRevision: 1, digest: 'digest-1' },
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

// 1. Empty workspace — all zeros
{
  const r = projectWebsiteWorkflowEventActionRateBrief(workspace())
  check(r.totalEvents === 0, 'empty: totalEvents 0')
  check(r.publishEvidenceRecorded === 0, 'empty: publishEvidenceRecorded 0')
  check(r.websiteRevisionApproved === 0, 'empty: websiteRevisionApproved 0')
  check(r.localSnapshotRecorded === 0, 'empty: localSnapshotRecorded 0')
  check(r.publishEvidenceRate === 0, 'empty: publishEvidenceRate 0')
  check(r.websiteRevisionApprovedRate === 0, 'empty: websiteRevisionApprovedRate 0')
  check(r.localSnapshotRate === 0, 'empty: localSnapshotRate 0')
}

// 2. Single publish_evidence_recorded — rate 100
{
  const r = projectWebsiteWorkflowEventActionRateBrief(workspace([
    workflowEvent('publish_evidence_recorded'),
  ]))
  check(r.totalEvents === 1, 'all-pub: totalEvents 1')
  check(r.publishEvidenceRecorded === 1, 'all-pub: publishEvidenceRecorded 1')
  check(r.publishEvidenceRate === 100, 'all-pub: publishEvidenceRate 100')
  check(r.websiteRevisionApprovedRate === 0, 'all-pub: websiteRevisionApprovedRate 0')
}

// 3. Single website_revision_approved — rate 100
{
  const r = projectWebsiteWorkflowEventActionRateBrief(workspace([
    workflowEvent('website_revision_approved'),
  ]))
  check(r.websiteRevisionApproved === 1, 'all-approved: websiteRevisionApproved 1')
  check(r.websiteRevisionApprovedRate === 100, 'all-approved: websiteRevisionApprovedRate 100')
  check(r.localSnapshotRate === 0, 'all-approved: localSnapshotRate 0')
}

// 4. 2 pub + 2 local = 4 total → rates 50/0/50
{
  const r = projectWebsiteWorkflowEventActionRateBrief(workspace([
    workflowEvent('publish_evidence_recorded'),
    workflowEvent('publish_evidence_recorded'),
    workflowEvent('local_snapshot_recorded'),
    workflowEvent('local_snapshot_recorded'),
  ]))
  check(r.totalEvents === 4, 'half: totalEvents 4')
  check(r.publishEvidenceRate === 50, 'half: publishEvidenceRate 50')
  check(r.websiteRevisionApprovedRate === 0, 'half: websiteRevisionApprovedRate 0')
  check(r.localSnapshotRate === 50, 'half: localSnapshotRate 50')
}

// 5. 2 approved + 1 local = 3 total → approved 67%, local 33%
{
  const r = projectWebsiteWorkflowEventActionRateBrief(workspace([
    workflowEvent('website_revision_approved'),
    workflowEvent('website_revision_approved'),
    workflowEvent('local_snapshot_recorded'),
  ]))
  check(r.totalEvents === 3, 'two-thirds: totalEvents 3')
  check(r.websiteRevisionApprovedRate === 67, 'two-thirds: websiteRevisionApprovedRate 67')
  check(r.localSnapshotRate === 33, 'two-thirds: localSnapshotRate 33')
}

// 6. 1 of each = 3 total → each 33%
{
  const r = projectWebsiteWorkflowEventActionRateBrief(workspace([
    workflowEvent('publish_evidence_recorded'),
    workflowEvent('website_revision_approved'),
    workflowEvent('local_snapshot_recorded'),
  ]))
  check(r.publishEvidenceRate === 33, 'one-each: publishEvidenceRate 33')
  check(r.websiteRevisionApprovedRate === 33, 'one-each: websiteRevisionApprovedRate 33')
}

console.log(`website-workflow-event-action-rate-brief: ${checks} checks passed`)
