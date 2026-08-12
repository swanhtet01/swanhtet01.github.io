import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteLocalPublishRecordedAtBrief } from './website-local-publish-recorded-at-brief.ts'`,
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

const { projectWebsiteLocalPublishRecordedAtBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let pubId = 0
function publish(recordedAt) {
  pubId++
  return {
    id: `pub-${pubId}`,
    recordedAt,
    recordedBy: 'alice',
    fingerprint: `fp-${pubId}`,
    readyPageIds: [],
    approvalId: null,
    evidenceIds: [],
    source: { contentRevision: 1, digest: `d-${pubId}` },
    migratedFromV1: false,
    artifact: null,
  }
}

function workspace(localPublishes = []) {
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
    localPublishes,
    events: [],
  }
}

// 1. No publishes
{
  const r = projectWebsiteLocalPublishRecordedAtBrief(workspace())
  check(r.totalPublishes === 0, 'empty: totalPublishes 0')
  check(r.earliestRecordedAt === null, 'empty: earliestRecordedAt null')
  check(r.latestRecordedAt === null, 'empty: latestRecordedAt null')
  check(r.spannedDays === 0, 'empty: spannedDays 0')
}

// 2. Single publish — spannedDays 0
{
  const r = projectWebsiteLocalPublishRecordedAtBrief(workspace([
    publish('2026-08-01T10:00:00Z'),
  ]))
  check(r.totalPublishes === 1, 'single: totalPublishes 1')
  check(r.earliestRecordedAt === '2026-08-01T10:00:00Z', 'single: earliestRecordedAt')
  check(r.latestRecordedAt === '2026-08-01T10:00:00Z', 'single: latestRecordedAt')
  check(r.spannedDays === 0, 'single: spannedDays 0')
}

// 3. Two publishes same day — spannedDays 0
{
  const r = projectWebsiteLocalPublishRecordedAtBrief(workspace([
    publish('2026-08-05T09:00:00Z'),
    publish('2026-08-05T16:30:00Z'),
  ]))
  check(r.totalPublishes === 2, 'same-day: totalPublishes 2')
  check(r.earliestRecordedAt === '2026-08-05T09:00:00Z', 'same-day: earliestRecordedAt')
  check(r.latestRecordedAt === '2026-08-05T16:30:00Z', 'same-day: latestRecordedAt')
  check(r.spannedDays === 0, 'same-day: spannedDays 0')
}

// 4. Two publishes 14 days apart
{
  const r = projectWebsiteLocalPublishRecordedAtBrief(workspace([
    publish('2026-07-15T00:00:00Z'),
    publish('2026-07-29T00:00:00Z'),
  ]))
  check(r.totalPublishes === 2, '14-days: totalPublishes 2')
  check(r.earliestRecordedAt === '2026-07-15T00:00:00Z', '14-days: earliestRecordedAt')
  check(r.latestRecordedAt === '2026-07-29T00:00:00Z', '14-days: latestRecordedAt')
  check(r.spannedDays === 14, '14-days: spannedDays 14')
}

// 5. Three publishes out of order — earliest/latest correct
{
  const r = projectWebsiteLocalPublishRecordedAtBrief(workspace([
    publish('2026-08-10T08:00:00Z'),
    publish('2026-08-02T10:00:00Z'),
    publish('2026-08-06T14:00:00Z'),
  ]))
  check(r.totalPublishes === 3, 'unsorted: totalPublishes 3')
  check(r.earliestRecordedAt === '2026-08-02T10:00:00Z', 'unsorted: earliestRecordedAt')
  check(r.latestRecordedAt === '2026-08-10T08:00:00Z', 'unsorted: latestRecordedAt')
  check(r.spannedDays === Math.round((Date.parse('2026-08-10T08:00:00Z') - Date.parse('2026-08-02T10:00:00Z')) / (1000 * 60 * 60 * 24)), 'unsorted: spannedDays')
}

// 6. Span across months
{
  const r = projectWebsiteLocalPublishRecordedAtBrief(workspace([
    publish('2026-05-01T00:00:00Z'),
    publish('2026-08-01T00:00:00Z'),
  ]))
  check(r.spannedDays === 92, '92-days: spannedDays 92')
  check(r.earliestRecordedAt === '2026-05-01T00:00:00Z', '92-days: earliestRecordedAt')
}

// 7. All same timestamp — spannedDays 0
{
  const r = projectWebsiteLocalPublishRecordedAtBrief(workspace([
    publish('2026-08-08T00:00:00Z'),
    publish('2026-08-08T00:00:00Z'),
  ]))
  check(r.totalPublishes === 2, 'same-ts: totalPublishes 2')
  check(r.spannedDays === 0, 'same-ts: spannedDays 0')
  check(r.earliestRecordedAt === r.latestRecordedAt, 'same-ts: earliest equals latest')
}

console.log(`website-local-publish-recorded-at-brief: ${checks} checks passed`)
