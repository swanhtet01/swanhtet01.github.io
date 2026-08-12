import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteLocalPublishRecordedByBrief } from './website-local-publish-recorded-by-brief.ts'`,
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

const { projectWebsiteLocalPublishRecordedByBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let pubId = 0
function publish(recordedBy = 'alice') {
  pubId++
  return {
    id: `pub-${pubId}`,
    recordedAt: '2026-08-01T10:00:00Z',
    recordedBy,
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
  const r = projectWebsiteLocalPublishRecordedByBrief(workspace())
  check(r.totalPublishes === 0, 'empty: totalPublishes 0')
  check(r.uniquePublishers === 0, 'empty: uniquePublishers 0')
  check(r.topPublisher === null, 'empty: topPublisher null')
  check(r.topPublisherCount === 0, 'empty: topPublisherCount 0')
}

// 2. Single publish by alice
{
  const r = projectWebsiteLocalPublishRecordedByBrief(workspace([publish('alice')]))
  check(r.totalPublishes === 1, 'single: totalPublishes 1')
  check(r.uniquePublishers === 1, 'single: uniquePublishers 1')
  check(r.topPublisher === 'alice', 'single: topPublisher alice')
  check(r.topPublisherCount === 1, 'single: topPublisherCount 1')
}

// 3. All same publisher
{
  const r = projectWebsiteLocalPublishRecordedByBrief(workspace([
    publish('alice'),
    publish('alice'),
    publish('alice'),
  ]))
  check(r.totalPublishes === 3, 'all-same: totalPublishes 3')
  check(r.uniquePublishers === 1, 'all-same: uniquePublishers 1')
  check(r.topPublisher === 'alice', 'all-same: topPublisher alice')
  check(r.topPublisherCount === 3, 'all-same: topPublisherCount 3')
}

// 4. Two publishers — alice more frequent
{
  const r = projectWebsiteLocalPublishRecordedByBrief(workspace([
    publish('alice'),
    publish('bob'),
    publish('alice'),
    publish('alice'),
  ]))
  check(r.totalPublishes === 4, 'two-pub: totalPublishes 4')
  check(r.uniquePublishers === 2, 'two-pub: uniquePublishers 2')
  check(r.topPublisher === 'alice', 'two-pub: topPublisher alice')
  check(r.topPublisherCount === 3, 'two-pub: topPublisherCount 3')
}

// 5. Three publishers — carol most frequent
{
  const r = projectWebsiteLocalPublishRecordedByBrief(workspace([
    publish('alice'),
    publish('carol'),
    publish('carol'),
    publish('bob'),
    publish('carol'),
  ]))
  check(r.totalPublishes === 5, 'three-pub: totalPublishes 5')
  check(r.uniquePublishers === 3, 'three-pub: uniquePublishers 3')
  check(r.topPublisher === 'carol', 'three-pub: topPublisher carol')
  check(r.topPublisherCount === 3, 'three-pub: topPublisherCount 3')
}

// 6. Each publisher appears once — uniquePublishers = totalPublishes
{
  const r = projectWebsiteLocalPublishRecordedByBrief(workspace([
    publish('alpha'),
    publish('beta'),
    publish('gamma'),
  ]))
  check(r.totalPublishes === 3, 'all-unique: totalPublishes 3')
  check(r.uniquePublishers === 3, 'all-unique: uniquePublishers 3')
  check(r.topPublisherCount === 1, 'all-unique: topPublisherCount 1')
}

// 7. topPublisher is null only when no publishes
{
  const r = projectWebsiteLocalPublishRecordedByBrief(workspace())
  check(r.topPublisher === null, 'null-guard: topPublisher null when empty')
  const r2 = projectWebsiteLocalPublishRecordedByBrief(workspace([publish('dave')]))
  check(r2.topPublisher === 'dave', 'null-guard: topPublisher non-null when publishes exist')
}

console.log(`website-local-publish-recorded-by-brief: ${checks} checks passed`)
