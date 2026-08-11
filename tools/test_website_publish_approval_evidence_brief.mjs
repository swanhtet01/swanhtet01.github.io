import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsitePublishApprovalEvidenceBrief } from './website-publish-approval-evidence-brief.ts'`,
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

const { projectWebsitePublishApprovalEvidenceBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let approvalId = 0
function approval({ reviewer = 'user-1', evidenceIds = ['ev-1'], migratedFromV1 = false } = {}) {
  approvalId++
  return {
    id: `PA-${approvalId}`,
    reviewer,
    note: 'LGTM',
    approvedAt: '2026-08-01T10:00:00Z',
    fingerprint: `fp-${approvalId}`,
    evidenceIds,
    source: { contentRevision: 1, digest: `dig-${approvalId}` },
    migratedFromV1,
  }
}

function workspace(approvals) {
  return {
    schema: 'supermega.website.workspace.v2',
    version: 2,
    revision: 1,
    contentRevision: 1,
    siteName: 'Test Site',
    pages: [],
    selectedPageId: 'page-1',
    evidence: [],
    approvals,
    localPublishes: [],
    events: [],
  }
}

// 1. Empty — no approvals
{
  const r = projectWebsitePublishApprovalEvidenceBrief(workspace([]))
  check(r.totalApprovals === 0, 'empty: totalApprovals 0')
  check(r.totalEvidenceIds === 0, 'empty: totalEvidenceIds 0')
  check(r.averageEvidenceIdsPerApproval === 0, 'empty: averageEvidenceIdsPerApproval 0')
  check(r.minEvidenceIds === null, 'empty: minEvidenceIds null')
  check(r.maxEvidenceIds === null, 'empty: maxEvidenceIds null')
  check(r.uniqueReviewers === 0, 'empty: uniqueReviewers 0')
  check(r.migratedCount === 0, 'empty: migratedCount 0')
  check(r.migratedRate === 0, 'empty: migratedRate 0')
}

// 2. Single approval with 2 evidenceIds, not migrated
{
  const r = projectWebsitePublishApprovalEvidenceBrief(workspace([
    approval({ reviewer: 'alice', evidenceIds: ['ev-a', 'ev-b'], migratedFromV1: false }),
  ]))
  check(r.totalApprovals === 1, 'single: totalApprovals 1')
  check(r.totalEvidenceIds === 2, 'single: totalEvidenceIds 2')
  check(r.averageEvidenceIdsPerApproval === 2, 'single: averageEvidenceIdsPerApproval 2')
  check(r.minEvidenceIds === 2, 'single: minEvidenceIds 2')
  check(r.maxEvidenceIds === 2, 'single: maxEvidenceIds 2')
  check(r.uniqueReviewers === 1, 'single: uniqueReviewers 1')
  check(r.migratedCount === 0, 'single: migratedCount 0')
  check(r.migratedRate === 0, 'single: migratedRate 0')
}

// 3. Single migrated approval
{
  const r = projectWebsitePublishApprovalEvidenceBrief(workspace([
    approval({ reviewer: 'bob', evidenceIds: ['ev-x'], migratedFromV1: true }),
  ]))
  check(r.migratedCount === 1, 'migrated: migratedCount 1')
  check(r.migratedRate === 100, 'migrated: migratedRate 100')
}

// 4. Mixed — min/max evidenceIds
{
  const r = projectWebsitePublishApprovalEvidenceBrief(workspace([
    approval({ reviewer: 'alice', evidenceIds: ['e1'], migratedFromV1: false }),
    approval({ reviewer: 'bob', evidenceIds: ['e2', 'e3', 'e4'], migratedFromV1: false }),
    approval({ reviewer: 'alice', evidenceIds: ['e5', 'e6'], migratedFromV1: true }),
  ]))
  check(r.totalApprovals === 3, 'mixed: totalApprovals 3')
  check(r.totalEvidenceIds === 6, 'mixed: totalEvidenceIds 6')
  check(r.averageEvidenceIdsPerApproval === 2, 'mixed: averageEvidenceIdsPerApproval 2')
  check(r.minEvidenceIds === 1, 'mixed: minEvidenceIds 1')
  check(r.maxEvidenceIds === 3, 'mixed: maxEvidenceIds 3')
  check(r.migratedCount === 1, 'mixed: migratedCount 1')
  check(r.migratedRate === 33, 'mixed: migratedRate 33')
}

// 5. Unique reviewers deduplication
{
  const r = projectWebsitePublishApprovalEvidenceBrief(workspace([
    approval({ reviewer: 'alice', evidenceIds: ['e1'] }),
    approval({ reviewer: 'alice', evidenceIds: ['e2'] }),
    approval({ reviewer: 'carol', evidenceIds: ['e3'] }),
  ]))
  check(r.uniqueReviewers === 2, 'dedup-reviewers: uniqueReviewers 2')
}

// 6. All migrated rate = 100
{
  const r = projectWebsitePublishApprovalEvidenceBrief(workspace([
    approval({ evidenceIds: ['e1'], migratedFromV1: true }),
    approval({ evidenceIds: ['e2'], migratedFromV1: true }),
  ]))
  check(r.migratedCount === 2, 'all-migrated: migratedCount 2')
  check(r.migratedRate === 100, 'all-migrated: migratedRate 100')
}

// 7. Zero evidenceIds on one approval
{
  const r = projectWebsitePublishApprovalEvidenceBrief(workspace([
    approval({ reviewer: 'dave', evidenceIds: [] }),
    approval({ reviewer: 'eve', evidenceIds: ['e1', 'e2'] }),
  ]))
  check(r.minEvidenceIds === 0, 'zero-evidence: minEvidenceIds 0')
  check(r.maxEvidenceIds === 2, 'zero-evidence: maxEvidenceIds 2')
  check(r.totalEvidenceIds === 2, 'zero-evidence: totalEvidenceIds 2')
}

console.log(`website-publish-approval-evidence-brief: ${checks} checks passed`)
