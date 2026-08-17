// Website publish readiness: evidence count, approval count, publish count,
// latestPublishAt, latestApprovalAt, latestPublishHasApproval, readyPageCount.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsitePublishReadinessSummary } from './website-publish-readiness-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/pub-readiness-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectWebsitePublishReadinessSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let seq = 0
const SOURCE = { contentRevision: 1, digest: 'abc' }

function evidence() {
  seq += 1
  return { id: `ev-${seq}`, kind: 'screenshot', finding: 'ok', reference: 'ref', verifiedBy: 'op1', verifiedAt: '2026-08-11T08:00:00Z', fingerprint: 'fp', source: SOURCE, migratedFromV1: false }
}

function approval(approvedAt = '2026-08-11T10:00:00Z') {
  seq += 1
  return { id: `ap-${seq}`, reviewer: 'founder', note: 'LGTM', approvedAt, fingerprint: 'fp', evidenceIds: [], source: SOURCE, migratedFromV1: false }
}

function publish({ recordedAt = '2026-08-11T12:00:00Z', approvalId = null, readyPageIds = ['p1'] } = {}) {
  seq += 1
  return { id: `pub-${seq}`, recordedAt, recordedBy: 'op1', fingerprint: 'fp', readyPageIds, approvalId, evidenceIds: [], source: SOURCE, migratedFromV1: false, artifact: null }
}

function workspace({ evidence: ev = [], approvals: ap = [], localPublishes: lp = [] } = {}) {
  return {
    schema: 'supermega.website.workspace.v2',
    version: 2,
    revision: 1,
    contentRevision: 1,
    siteName: 'Test Site',
    pages: [],
    selectedPageId: '',
    evidence: ev,
    approvals: ap,
    localPublishes: lp,
    events: [],
  }
}

// 1. Empty workspace → all zeros/nulls
{
  const r = projectWebsitePublishReadinessSummary(workspace())
  check(r.totalEvidence === 0, 'empty: totalEvidence is 0')
  check(r.totalApprovals === 0, 'empty: totalApprovals is 0')
  check(r.localPublishCount === 0, 'empty: localPublishCount is 0')
  check(r.latestPublishAt === null, 'empty: latestPublishAt is null')
  check(r.latestApprovalAt === null, 'empty: latestApprovalAt is null')
  check(r.latestPublishHasApproval === false, 'empty: latestPublishHasApproval is false')
  check(r.latestPublishReadyPageCount === 0, 'empty: latestPublishReadyPageCount is 0')
}

// 2. Evidence count
{
  const r = projectWebsitePublishReadinessSummary(workspace({ evidence: [evidence(), evidence(), evidence()] }))
  check(r.totalEvidence === 3, 'evidence: totalEvidence is 3')
}

// 3. Approval count + latestApprovalAt from most recent
{
  const r = projectWebsitePublishReadinessSummary(workspace({
    approvals: [approval('2026-08-09T10:00:00Z'), approval('2026-08-11T14:00:00Z'), approval('2026-08-10T08:00:00Z')],
  }))
  check(r.totalApprovals === 3, 'approvals: totalApprovals is 3')
  check(r.latestApprovalAt === '2026-08-11T14:00:00Z', 'approvals: latestApprovalAt is most recent')
}

// 4. Latest publish: most recent by recordedAt
{
  const r = projectWebsitePublishReadinessSummary(workspace({
    localPublishes: [
      publish({ recordedAt: '2026-08-09T12:00:00Z', readyPageIds: ['p1', 'p2'] }),
      publish({ recordedAt: '2026-08-11T16:00:00Z', readyPageIds: ['p1', 'p2', 'p3'] }),
      publish({ recordedAt: '2026-08-10T08:00:00Z', readyPageIds: ['p1'] }),
    ],
  }))
  check(r.localPublishCount === 3, 'publish: localPublishCount is 3')
  check(r.latestPublishAt === '2026-08-11T16:00:00Z', 'publish: latestPublishAt is most recent')
  check(r.latestPublishReadyPageCount === 3, 'publish: 3 ready pages in latest publish')
}

// 5. latestPublishHasApproval: true when latest publish has non-null approvalId
{
  const r = projectWebsitePublishReadinessSummary(workspace({
    localPublishes: [publish({ approvalId: 'ap-001' })],
  }))
  check(r.latestPublishHasApproval === true, 'approved: latestPublishHasApproval is true')
}

// 6. latestPublishHasApproval: false when approvalId is null
{
  const r = projectWebsitePublishReadinessSummary(workspace({
    localPublishes: [publish({ approvalId: null })],
  }))
  check(r.latestPublishHasApproval === false, 'unapproved: latestPublishHasApproval is false')
}

// 7. Single publish without approval
{
  const r = projectWebsitePublishReadinessSummary(workspace({
    evidence: [evidence()],
    localPublishes: [publish({ readyPageIds: ['p1', 'p2'] })],
  }))
  check(r.totalEvidence === 1, 'single-pub: totalEvidence is 1')
  check(r.localPublishCount === 1, 'single-pub: localPublishCount is 1')
  check(r.latestPublishReadyPageCount === 2, 'single-pub: 2 ready pages')
  check(r.latestPublishAt === '2026-08-11T12:00:00Z', 'single-pub: latestPublishAt set')
}

// 8. Full workspace: evidence + approvals + publishes all populated
{
  const r = projectWebsitePublishReadinessSummary(workspace({
    evidence: [evidence(), evidence()],
    approvals: [approval('2026-08-11T09:00:00Z')],
    localPublishes: [publish({ approvalId: 'ap-001', readyPageIds: ['p1', 'p2', 'p3', 'p4'] })],
  }))
  check(r.totalEvidence === 2, 'full: totalEvidence is 2')
  check(r.totalApprovals === 1, 'full: totalApprovals is 1')
  check(r.localPublishCount === 1, 'full: localPublishCount is 1')
  check(r.latestApprovalAt === '2026-08-11T09:00:00Z', 'full: latestApprovalAt is set')
  check(r.latestPublishHasApproval === true, 'full: latestPublishHasApproval is true')
  check(r.latestPublishReadyPageCount === 4, 'full: 4 ready pages in latest publish')
}

console.log(JSON.stringify({ ok: true, checks }))
