import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsitePageStalenessBrief } from './website-page-staleness-brief.ts'`,
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

const { projectWebsitePageStalenessBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

// Reference "now" for all tests
const NOW = '2026-09-01T00:00:00Z'

let pageId = 0
function page({ updatedAt = '2026-08-01T09:00:00Z' } = {}) {
  pageId++
  return {
    id: `PG-${pageId}`,
    internalName: `Page ${pageId}`,
    slug: `/page-${pageId}`,
    stage: 'draft',
    navigation: { label: 'Home', visible: false },
    hero: { eyebrow: '', headline: 'Headline', summary: 'Summary', ctaLabel: 'CTA', ctaHref: '/cta' },
    sections: [],
    seo: { title: 'Title', description: 'Description' },
    updatedAt,
  }
}

function workspace(pages) {
  return {
    schema: 'supermega.website.workspace.v2',
    version: 2,
    revision: 1,
    contentRevision: 1,
    siteName: 'Test Site',
    pages,
    selectedPageId: 'page-1',
    evidence: [],
    approvals: [],
    localPublishes: [],
    events: [],
  }
}

// 1. Empty workspace
{
  const r = projectWebsitePageStalenessBrief(workspace([]), NOW)
  check(r.totalPages === 0, 'empty: totalPages 0')
  check(r.freshCount === 0, 'empty: freshCount 0')
  check(r.recentCount === 0, 'empty: recentCount 0')
  check(r.staleCount === 0, 'empty: staleCount 0')
  check(r.freshRate === 0, 'empty: freshRate 0')
  check(r.recentRate === 0, 'empty: recentRate 0')
  check(r.staleRate === 0, 'empty: staleRate 0')
  check(r.minAgeDays === null, 'empty: minAgeDays null')
  check(r.maxAgeDays === null, 'empty: maxAgeDays null')
  check(r.averageAgeDays === 0, 'empty: averageAgeDays 0')
}

// 2. Single fresh page (1 day ago)
{
  const r = projectWebsitePageStalenessBrief(workspace([
    page({ updatedAt: '2026-08-31T00:00:00Z' }), // 1 day before NOW
  ]), NOW)
  check(r.totalPages === 1, 'fresh: totalPages 1')
  check(r.freshCount === 1, 'fresh: freshCount 1')
  check(r.recentCount === 0, 'fresh: recentCount 0')
  check(r.staleCount === 0, 'fresh: staleCount 0')
  check(r.freshRate === 100, 'fresh: freshRate 100')
  check(r.minAgeDays === 1, 'fresh: minAgeDays 1')
  check(r.maxAgeDays === 1, 'fresh: maxAgeDays 1')
  check(r.averageAgeDays === 1, 'fresh: averageAgeDays 1')
}

// 3. Boundary: exactly 7 days = fresh
{
  const r = projectWebsitePageStalenessBrief(workspace([
    page({ updatedAt: '2026-08-25T00:00:00Z' }), // 7 days before NOW
  ]), NOW)
  check(r.freshCount === 1, 'boundary-7: freshCount 1')
  check(r.recentCount === 0, 'boundary-7: recentCount 0')
}

// 4. Boundary: exactly 8 days = recent
{
  const r = projectWebsitePageStalenessBrief(workspace([
    page({ updatedAt: '2026-08-24T00:00:00Z' }), // 8 days before NOW
  ]), NOW)
  check(r.freshCount === 0, 'boundary-8: freshCount 0')
  check(r.recentCount === 1, 'boundary-8: recentCount 1')
}

// 5. Boundary: exactly 30 days = recent
{
  const r = projectWebsitePageStalenessBrief(workspace([
    page({ updatedAt: '2026-08-02T00:00:00Z' }), // 30 days before NOW
  ]), NOW)
  check(r.recentCount === 1, 'boundary-30: recentCount 1')
  check(r.staleCount === 0, 'boundary-30: staleCount 0')
}

// 6. Boundary: exactly 31 days = stale
{
  const r = projectWebsitePageStalenessBrief(workspace([
    page({ updatedAt: '2026-08-01T00:00:00Z' }), // 31 days before NOW
  ]), NOW)
  check(r.staleCount === 1, 'boundary-31: staleCount 1')
  check(r.recentCount === 0, 'boundary-31: recentCount 0')
  check(r.staleRate === 100, 'boundary-31: staleRate 100')
}

// 7. Mixed: 1 fresh (2d) + 1 recent (15d) + 1 stale (60d)
{
  const r = projectWebsitePageStalenessBrief(workspace([
    page({ updatedAt: '2026-08-30T00:00:00Z' }), // 2d
    page({ updatedAt: '2026-08-17T00:00:00Z' }), // 15d
    page({ updatedAt: '2026-07-03T00:00:00Z' }), // 60d
  ]), NOW)
  check(r.totalPages === 3, 'mixed: totalPages 3')
  check(r.freshCount === 1, 'mixed: freshCount 1')
  check(r.recentCount === 1, 'mixed: recentCount 1')
  check(r.staleCount === 1, 'mixed: staleCount 1')
  check(r.freshRate === 33, 'mixed: freshRate 33')
  check(r.recentRate === 33, 'mixed: recentRate 33')
  check(r.staleRate === 33, 'mixed: staleRate 33')
  check(r.minAgeDays === 2, 'mixed: minAgeDays 2')
  check(r.maxAgeDays === 60, 'mixed: maxAgeDays 60')
  check(r.averageAgeDays === Math.round((2 + 15 + 60) / 3), 'mixed: averageAgeDays')
}

console.log(`website-page-staleness-brief: ${checks} checks passed`)
