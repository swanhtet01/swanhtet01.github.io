// Website local publish artifact brief: artifact presence, page counts, site name distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteLocalPublishArtifactBrief } from './website-local-publish-artifact-brief.ts'`,
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

const { projectWebsiteLocalPublishArtifactBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let recId = 0
const SOURCE_REF = { schema: 'supermega.website.source-ref.v1', kind: 'local', id: 'src-1' }

function artifact(siteName = 'My Site', pageCount = 3) {
  const pages = Array.from({ length: pageCount }, (_, i) => ({
    id: `pg-${i}`,
    slug: `page-${i}`,
    navigation: {},
    hero: null,
    sections: [],
    seo: {},
  }))
  return {
    schema: 'supermega.website.artifact.v1',
    siteName,
    fingerprint: `fp-${siteName}`,
    contentDigest: `cd-${siteName}`,
    source: SOURCE_REF,
    pages,
  }
}

function record(art = null) {
  recId++
  return {
    id: `REC-${recId}`,
    recordedAt: '2026-08-01T00:00:00Z',
    recordedBy: 'admin',
    fingerprint: `fp-rec-${recId}`,
    readyPageIds: [],
    approvalId: null,
    evidenceIds: [],
    source: SOURCE_REF,
    migratedFromV1: false,
    artifact: art,
  }
}

function ws(localPublishes = []) {
  return {
    schema: 'supermega.website.v2',
    version: 2,
    revision: 1,
    contentRevision: 1,
    siteName: 'Workspace Site',
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
  const r = projectWebsiteLocalPublishArtifactBrief(ws([]))
  check(r.totalPublishes === 0, 'empty: totalPublishes 0')
  check(r.publishesWithArtifact === 0, 'empty: publishesWithArtifact 0')
  check(r.artifactPresenceRate === 0, 'empty: artifactPresenceRate 0')
  check(r.totalArtifactPages === 0, 'empty: totalArtifactPages 0')
  check(r.averageArtifactPageCount === 0, 'empty: averageArtifactPageCount 0')
  check(r.uniqueArtifactSiteNames === 0, 'empty: uniqueArtifactSiteNames 0')
  check(r.topArtifactSiteNamesByCount.length === 0, 'empty: top empty')
}

// 2. Publishes without artifact (null)
{
  const r = projectWebsiteLocalPublishArtifactBrief(ws([record(), record()]))
  check(r.totalPublishes === 2, 'no-art: totalPublishes 2')
  check(r.publishesWithArtifact === 0, 'no-art: publishesWithArtifact 0')
  check(r.artifactPresenceRate === 0, 'no-art: artifactPresenceRate 0')
  check(r.totalArtifactPages === 0, 'no-art: totalArtifactPages 0')
}

// 3. Single publish with artifact
{
  const r = projectWebsiteLocalPublishArtifactBrief(ws([record(artifact('Shop', 4))]))
  check(r.totalPublishes === 1, 'single: totalPublishes 1')
  check(r.publishesWithArtifact === 1, 'single: publishesWithArtifact 1')
  check(r.artifactPresenceRate === 100, 'single: artifactPresenceRate 100')
  check(r.totalArtifactPages === 4, 'single: totalArtifactPages 4')
  check(r.averageArtifactPageCount === 4, 'single: averageArtifactPageCount 4')
  check(r.uniqueArtifactSiteNames === 1, 'single: uniqueArtifactSiteNames 1')
  check(r.topArtifactSiteNamesByCount[0]?.name === 'Shop', 'single: top site Shop')
  check(r.topArtifactSiteNamesByCount[0]?.count === 1, 'single: top count 1')
}

// 4. Page count aggregation
{
  const r = projectWebsiteLocalPublishArtifactBrief(
    ws([record(artifact('Site', 2)), record(artifact('Site', 4))]),
  )
  check(r.totalArtifactPages === 6, 'page-agg: totalArtifactPages 6')
  check(r.averageArtifactPageCount === 3, 'page-agg: averageArtifactPageCount 3')
}

// 5. Average rounds correctly: 1 page + 2 pages = 3 total, 2 records → 1.5 → rounds to 2
{
  const r = projectWebsiteLocalPublishArtifactBrief(
    ws([record(artifact('A', 1)), record(artifact('B', 2))]),
  )
  check(r.averageArtifactPageCount === 2, 'round-avg: 1.5 rounds to 2')
}

// 6. Site name distribution
{
  const r = projectWebsiteLocalPublishArtifactBrief(
    ws([
      record(artifact('Alpha Site', 1)),
      record(artifact('Alpha Site', 2)),
      record(artifact('Beta Site', 3)),
    ]),
  )
  check(r.uniqueArtifactSiteNames === 2, 'name-dist: uniqueArtifactSiteNames 2')
  check(r.topArtifactSiteNamesByCount[0]?.name === 'Alpha Site', 'name-dist: top Alpha Site')
  check(r.topArtifactSiteNamesByCount[0]?.count === 2, 'name-dist: top count 2')
}

// 7. Mixed — some with artifact, some without
{
  const r = projectWebsiteLocalPublishArtifactBrief(
    ws([record(artifact('Site', 3)), record(), record(artifact('Site', 5)), record()]),
  )
  check(r.totalPublishes === 4, 'mixed: totalPublishes 4')
  check(r.publishesWithArtifact === 2, 'mixed: publishesWithArtifact 2')
  check(r.artifactPresenceRate === 50, 'mixed: artifactPresenceRate 50')
  check(r.totalArtifactPages === 8, 'mixed: totalArtifactPages 8')
}

// 8. Top-5 cap + tiebreak
{
  const names = ['Z-Site', 'A-Site', 'C-Site', 'B-Site', 'D-Site', 'E-Site']
  const r = projectWebsiteLocalPublishArtifactBrief(
    ws(names.map(n => record(artifact(n, 1)))),
  )
  check(r.topArtifactSiteNamesByCount.length === 5, 'top5: capped at 5')
  check(r.topArtifactSiteNamesByCount[0]?.name === 'A-Site', 'top5: tiebreak A-Site first')
}

// 9. Presence rate rounds: 1 of 3 → 33%
{
  const r = projectWebsiteLocalPublishArtifactBrief(
    ws([record(artifact('X', 1)), record(), record()]),
  )
  check(r.artifactPresenceRate === 33, 'round: artifactPresenceRate 33')
}

// 10. Zero page artifact
{
  const r = projectWebsiteLocalPublishArtifactBrief(ws([record(artifact('Empty', 0))]))
  check(r.totalArtifactPages === 0, 'zero-pages: totalArtifactPages 0')
  check(r.averageArtifactPageCount === 0, 'zero-pages: averageArtifactPageCount 0')
  check(r.publishesWithArtifact === 1, 'zero-pages: artifact still counted')
}

console.log(JSON.stringify({ ok: true, checks }))
