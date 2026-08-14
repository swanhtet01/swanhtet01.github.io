// Website content summary: draft/ready page counts, navigation visibility, sections, lastUpdatedAt.
// Tests all fields, edge cases, and averaging.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteContentSummary } from './website-content-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/website-content-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectWebsiteContentSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let seq = 0
function page({ stage = 'draft', visibleInNav = false, sectionCount = 1, updatedAt = '2026-08-11T08:00:00Z' } = {}) {
  seq += 1
  const sections = Array.from({ length: sectionCount }, (_, i) => ({ id: `sec-${seq}-${i}`, kind: 'text', content: '' }))
  return {
    id: `page-${seq}`,
    internalName: `Page ${seq}`,
    slug: `/page-${seq}`,
    stage,
    navigation: { label: `Page ${seq}`, visible: visibleInNav },
    hero: { eyebrow: '', headline: `Page ${seq}`, summary: '', ctaLabel: '', ctaHref: '' },
    sections,
    seo: { title: `Page ${seq}`, description: '' },
    updatedAt,
  }
}

function workspace(pages = []) {
  return {
    schema: 'supermega.website.workspace.v2',
    version: 2,
    revision: 1,
    contentRevision: 1,
    siteName: 'Test Site',
    pages,
    selectedPageId: '',
    evidence: [],
    approvals: [],
    localPublishes: [],
    events: [],
  }
}

// 1. Empty workspace → all zeros, null lastUpdatedAt
{
  const r = projectWebsiteContentSummary(workspace())
  check(r.totalPages === 0, 'empty: totalPages is 0')
  check(r.draftPages === 0, 'empty: draftPages is 0')
  check(r.readyPages === 0, 'empty: readyPages is 0')
  check(r.visibleInNav === 0, 'empty: visibleInNav is 0')
  check(r.totalSections === 0, 'empty: totalSections is 0')
  check(r.averageSectionsPerPage === 0, 'empty: averageSectionsPerPage is 0 (no zero-division)')
  check(r.lastUpdatedAt === null, 'empty: lastUpdatedAt is null')
}

// 2. Single draft page
{
  const r = projectWebsiteContentSummary(workspace([page({ stage: 'draft', updatedAt: '2026-08-10T00:00:00Z' })]))
  check(r.totalPages === 1, 'single-draft: totalPages is 1')
  check(r.draftPages === 1, 'single-draft: draftPages is 1')
  check(r.readyPages === 0, 'single-draft: readyPages is 0')
  check(r.lastUpdatedAt === '2026-08-10T00:00:00Z', 'single-draft: lastUpdatedAt is set')
}

// 3. Single ready page
{
  const r = projectWebsiteContentSummary(workspace([page({ stage: 'ready' })]))
  check(r.readyPages === 1, 'single-ready: readyPages is 1')
  check(r.draftPages === 0, 'single-ready: draftPages is 0')
}

// 4. Mixed draft and ready
{
  const pages = [page({ stage: 'draft' }), page({ stage: 'ready' }), page({ stage: 'draft' }), page({ stage: 'ready' })]
  const r = projectWebsiteContentSummary(workspace(pages))
  check(r.totalPages === 4, 'mixed: totalPages is 4')
  check(r.draftPages === 2, 'mixed: draftPages is 2')
  check(r.readyPages === 2, 'mixed: readyPages is 2')
}

// 5. Navigation visibility
{
  const pages = [
    page({ visibleInNav: true }),
    page({ visibleInNav: true }),
    page({ visibleInNav: false }),
  ]
  const r = projectWebsiteContentSummary(workspace(pages))
  check(r.visibleInNav === 2, 'nav: visibleInNav is 2')
  check(r.totalPages === 3, 'nav: totalPages is 3')
}

// 6. Section counts aggregated
{
  const pages = [
    page({ sectionCount: 3 }),
    page({ sectionCount: 5 }),
    page({ sectionCount: 2 }),
  ]
  const r = projectWebsiteContentSummary(workspace(pages))
  check(r.totalSections === 10, 'sections: totalSections is 10')
  // round(10 / 3) = 3
  check(r.averageSectionsPerPage === 3, 'sections: averageSectionsPerPage is 3')
}

// 7. Page with no sections
{
  const r = projectWebsiteContentSummary(workspace([page({ sectionCount: 0 })]))
  check(r.totalSections === 0, 'no-sections: totalSections is 0')
  check(r.averageSectionsPerPage === 0, 'no-sections: averageSectionsPerPage is 0')
}

// 8. lastUpdatedAt is most recent across all pages
{
  const pages = [
    page({ updatedAt: '2026-08-09T08:00:00Z' }),
    page({ updatedAt: '2026-08-11T12:00:00Z' }),
    page({ updatedAt: '2026-08-10T20:00:00Z' }),
  ]
  const r = projectWebsiteContentSummary(workspace(pages))
  check(r.lastUpdatedAt === '2026-08-11T12:00:00Z', 'lastUpdated: most recent page updatedAt wins')
}

// 9. averageSectionsPerPage rounds correctly
{
  // 7 sections across 2 pages = 3.5 → rounds to 4
  const pages = [page({ sectionCount: 3 }), page({ sectionCount: 4 })]
  const r = projectWebsiteContentSummary(workspace(pages))
  check(r.totalSections === 7, 'avg-round: totalSections is 7')
  check(r.averageSectionsPerPage === 4, 'avg-round: 7/2=3.5 rounds to 4')
}

console.log(JSON.stringify({ ok: true, checks }))
