import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteLocalPublishReadyPagesBrief } from './website-local-publish-ready-pages-brief.ts'`,
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

const { projectWebsiteLocalPublishReadyPagesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let recordId = 0
function publishRecord({
  recordedBy = 'user-1',
  readyPageIds = ['page-1'],
  approvalId = null,
  evidenceIds = [],
  migratedFromV1 = false,
} = {}) {
  recordId++
  return {
    id: `LP-${recordId}`,
    recordedAt: '2026-08-01T10:00:00Z',
    recordedBy,
    fingerprint: `fp-${recordId}`,
    readyPageIds,
    approvalId,
    evidenceIds,
    source: { contentRevision: 1, digest: `dig-${recordId}` },
    migratedFromV1,
    artifact: null,
  }
}

function workspace(localPublishes) {
  return {
    schema: 'supermega.website.workspace.v2',
    version: 2,
    revision: 1,
    contentRevision: 1,
    siteName: 'Test Site',
    pages: [],
    selectedPageId: 'page-1',
    evidence: [],
    approvals: [],
    localPublishes,
    events: [],
  }
}

// 1. Empty
{
  const r = projectWebsiteLocalPublishReadyPagesBrief(workspace([]))
  check(r.totalPublishes === 0, 'empty: totalPublishes 0')
  check(r.totalReadyPages === 0, 'empty: totalReadyPages 0')
  check(r.averageReadyPagesPerPublish === 0, 'empty: averageReadyPagesPerPublish 0')
  check(r.minReadyPages === null, 'empty: minReadyPages null')
  check(r.maxReadyPages === null, 'empty: maxReadyPages null')
  check(r.withApprovalCount === 0, 'empty: withApprovalCount 0')
  check(r.withApprovalRate === 0, 'empty: withApprovalRate 0')
  check(r.totalEvidenceIds === 0, 'empty: totalEvidenceIds 0')
  check(r.averageEvidenceIdsPerPublish === 0, 'empty: averageEvidenceIdsPerPublish 0')
  check(r.migratedCount === 0, 'empty: migratedCount 0')
  check(r.migratedRate === 0, 'empty: migratedRate 0')
  check(r.uniquePublishers === 0, 'empty: uniquePublishers 0')
}

// 2. Single publish — 3 ready pages, no approval, 2 evidence, not migrated
{
  const r = projectWebsiteLocalPublishReadyPagesBrief(workspace([
    publishRecord({ recordedBy: 'alice', readyPageIds: ['p1', 'p2', 'p3'], approvalId: null, evidenceIds: ['e1', 'e2'], migratedFromV1: false }),
  ]))
  check(r.totalPublishes === 1, 'single: totalPublishes 1')
  check(r.totalReadyPages === 3, 'single: totalReadyPages 3')
  check(r.averageReadyPagesPerPublish === 3, 'single: averageReadyPagesPerPublish 3')
  check(r.minReadyPages === 3, 'single: minReadyPages 3')
  check(r.maxReadyPages === 3, 'single: maxReadyPages 3')
  check(r.withApprovalCount === 0, 'single: withApprovalCount 0')
  check(r.withApprovalRate === 0, 'single: withApprovalRate 0')
  check(r.totalEvidenceIds === 2, 'single: totalEvidenceIds 2')
  check(r.migratedCount === 0, 'single: migratedCount 0')
  check(r.uniquePublishers === 1, 'single: uniquePublishers 1')
}

// 3. Single approved + migrated publish
{
  const r = projectWebsiteLocalPublishReadyPagesBrief(workspace([
    publishRecord({ approvalId: 'PA-1', migratedFromV1: true, evidenceIds: ['e1'] }),
  ]))
  check(r.withApprovalCount === 1, 'approved: withApprovalCount 1')
  check(r.withApprovalRate === 100, 'approved: withApprovalRate 100')
  check(r.migratedCount === 1, 'migrated: migratedCount 1')
  check(r.migratedRate === 100, 'migrated: migratedRate 100')
}

// 4. Mixed — min/max ready pages, approval rate, evidence total
{
  const r = projectWebsiteLocalPublishReadyPagesBrief(workspace([
    publishRecord({ recordedBy: 'alice', readyPageIds: [], approvalId: null, evidenceIds: [] }),
    publishRecord({ recordedBy: 'bob', readyPageIds: ['p1', 'p2'], approvalId: 'PA-2', evidenceIds: ['e1', 'e2', 'e3'] }),
    publishRecord({ recordedBy: 'alice', readyPageIds: ['p1', 'p2', 'p3', 'p4'], approvalId: 'PA-3', evidenceIds: ['e4'] }),
  ]))
  check(r.totalPublishes === 3, 'mixed: totalPublishes 3')
  check(r.totalReadyPages === 6, 'mixed: totalReadyPages 6')
  check(r.averageReadyPagesPerPublish === 2, 'mixed: averageReadyPagesPerPublish 2')
  check(r.minReadyPages === 0, 'mixed: minReadyPages 0')
  check(r.maxReadyPages === 4, 'mixed: maxReadyPages 4')
  check(r.withApprovalCount === 2, 'mixed: withApprovalCount 2')
  check(r.withApprovalRate === 67, 'mixed: withApprovalRate 67')
  check(r.totalEvidenceIds === 4, 'mixed: totalEvidenceIds 4')
  check(r.averageEvidenceIdsPerPublish === 1, 'mixed: averageEvidenceIdsPerPublish 1')
}

// 5. Unique publishers deduplication
{
  const r = projectWebsiteLocalPublishReadyPagesBrief(workspace([
    publishRecord({ recordedBy: 'alice' }),
    publishRecord({ recordedBy: 'alice' }),
    publishRecord({ recordedBy: 'carol' }),
  ]))
  check(r.uniquePublishers === 2, 'dedup: uniquePublishers 2')
}

// 6. All migrated rate = 100
{
  const r = projectWebsiteLocalPublishReadyPagesBrief(workspace([
    publishRecord({ migratedFromV1: true }),
    publishRecord({ migratedFromV1: true }),
  ]))
  check(r.migratedCount === 2, 'all-migrated: migratedCount 2')
  check(r.migratedRate === 100, 'all-migrated: migratedRate 100')
}

console.log(`website-local-publish-ready-pages-brief: ${checks} checks passed`)
