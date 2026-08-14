import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsitePublishApprovalApprovedAtBrief } from './website-publish-approval-approved-at-brief.ts'`,
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

const { projectWebsitePublishApprovalApprovedAtBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let apId = 0
function approval(approvedAt) {
  apId++
  return {
    id: `ap-${apId}`,
    reviewer: 'alice',
    note: '',
    approvedAt,
    fingerprint: `fp-${apId}`,
    evidenceIds: [],
    source: { contentRevision: 1, digest: `d-${apId}` },
    migratedFromV1: false,
  }
}

function workspace(approvals = []) {
  return {
    schema: 'supermega.website.workspace.v2',
    version: 2,
    revision: 1,
    contentRevision: 1,
    siteName: 'Test Site',
    pages: [],
    selectedPageId: 'pg-1',
    evidence: [],
    approvals,
    localPublishes: [],
    events: [],
  }
}

// 1. No approvals
{
  const r = projectWebsitePublishApprovalApprovedAtBrief(workspace())
  check(r.totalApprovals === 0, 'empty: totalApprovals 0')
  check(r.earliestApprovedAt === null, 'empty: earliestApprovedAt null')
  check(r.latestApprovedAt === null, 'empty: latestApprovedAt null')
  check(r.spannedDays === 0, 'empty: spannedDays 0')
}

// 2. Single approval — spannedDays is 0 for a single record
{
  const r = projectWebsitePublishApprovalApprovedAtBrief(workspace([
    approval('2026-08-01T10:00:00Z'),
  ]))
  check(r.totalApprovals === 1, 'single: totalApprovals 1')
  check(r.earliestApprovedAt === '2026-08-01T10:00:00Z', 'single: earliestApprovedAt')
  check(r.latestApprovedAt === '2026-08-01T10:00:00Z', 'single: latestApprovedAt')
  check(r.spannedDays === 0, 'single: spannedDays 0')
}

// 3. Two approvals on the same day — spannedDays 0
{
  const r = projectWebsitePublishApprovalApprovedAtBrief(workspace([
    approval('2026-08-05T09:00:00Z'),
    approval('2026-08-05T17:00:00Z'),
  ]))
  check(r.totalApprovals === 2, 'same-day: totalApprovals 2')
  check(r.earliestApprovedAt === '2026-08-05T09:00:00Z', 'same-day: earliestApprovedAt')
  check(r.latestApprovedAt === '2026-08-05T17:00:00Z', 'same-day: latestApprovedAt')
  check(r.spannedDays === 0, 'same-day: spannedDays 0')
}

// 4. Two approvals 30 days apart
{
  const r = projectWebsitePublishApprovalApprovedAtBrief(workspace([
    approval('2026-07-01T00:00:00Z'),
    approval('2026-07-31T00:00:00Z'),
  ]))
  check(r.totalApprovals === 2, '30-days: totalApprovals 2')
  check(r.earliestApprovedAt === '2026-07-01T00:00:00Z', '30-days: earliestApprovedAt')
  check(r.latestApprovedAt === '2026-07-31T00:00:00Z', '30-days: latestApprovedAt')
  check(r.spannedDays === 30, '30-days: spannedDays 30')
}

// 5. Three approvals out of chronological order — earliest/latest still correct
{
  const r = projectWebsitePublishApprovalApprovedAtBrief(workspace([
    approval('2026-08-10T08:00:00Z'),
    approval('2026-08-03T12:00:00Z'),
    approval('2026-08-07T15:00:00Z'),
  ]))
  check(r.totalApprovals === 3, 'unsorted: totalApprovals 3')
  check(r.earliestApprovedAt === '2026-08-03T12:00:00Z', 'unsorted: earliestApprovedAt')
  check(r.latestApprovedAt === '2026-08-10T08:00:00Z', 'unsorted: latestApprovedAt')
  check(r.spannedDays === Math.round((Date.parse('2026-08-10T08:00:00Z') - Date.parse('2026-08-03T12:00:00Z')) / (1000 * 60 * 60 * 24)), 'unsorted: spannedDays')
}

// 6. Approvals across two months — span > 30
{
  const r = projectWebsitePublishApprovalApprovedAtBrief(workspace([
    approval('2026-06-01T00:00:00Z'),
    approval('2026-08-01T00:00:00Z'),
  ]))
  check(r.spannedDays === 61, '61-days: spannedDays 61')
  check(r.earliestApprovedAt === '2026-06-01T00:00:00Z', '61-days: earliestApprovedAt')
  check(r.latestApprovedAt === '2026-08-01T00:00:00Z', '61-days: latestApprovedAt')
}

// 7. All same timestamp — span 0
{
  const r = projectWebsitePublishApprovalApprovedAtBrief(workspace([
    approval('2026-08-08T00:00:00Z'),
    approval('2026-08-08T00:00:00Z'),
    approval('2026-08-08T00:00:00Z'),
  ]))
  check(r.totalApprovals === 3, 'same-ts: totalApprovals 3')
  check(r.spannedDays === 0, 'same-ts: spannedDays 0')
  check(r.earliestApprovedAt === r.latestApprovedAt, 'same-ts: earliest equals latest')
}

console.log(`website-publish-approval-approved-at-brief: ${checks} checks passed`)
