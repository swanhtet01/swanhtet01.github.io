// Website section content brief: per-section title/body/eyebrow fill rates.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteSectionContentBrief } from './website-section-content-brief.ts'`,
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

const { projectWebsiteSectionContentBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let secId = 0
function section({ eyebrow = '', title = '', body = '' } = {}) {
  secId++
  return { id: `sec-${secId}`, eyebrow, title, body }
}

let pageId = 0
function page(...sections) {
  pageId++
  return {
    id: `page-${pageId}`,
    internalName: `Page ${pageId}`,
    slug: `page-${pageId}`,
    stage: 'ready',
    navigation: { label: `Page ${pageId}`, visible: true },
    hero: { eyebrow: '', headline: '', summary: '', ctaLabel: '', ctaHref: '' },
    sections,
    seo: { title: '', description: '' },
    updatedAt: '2026-08-11T10:00:00Z',
  }
}

function workspace(...pages) {
  return {
    version: 2,
    revision: 1,
    contentRevision: 1,
    siteName: 'Test Site',
    pages,
    selectedPageId: pages[0]?.id ?? '',
    evidence: [],
    approvals: [],
  }
}

// 1. Empty workspace → all zeros
{
  const r = projectWebsiteSectionContentBrief(workspace())
  check(r.totalSections === 0, 'empty: totalSections 0')
  check(r.sectionsWithTitle === 0, 'empty: sectionsWithTitle 0')
  check(r.sectionsWithBody === 0, 'empty: sectionsWithBody 0')
  check(r.sectionsWithEyebrow === 0, 'empty: sectionsWithEyebrow 0')
  check(r.sectionsComplete === 0, 'empty: sectionsComplete 0')
  check(r.titleCoverage === 0, 'empty: titleCoverage 0')
  check(r.bodyCoverage === 0, 'empty: bodyCoverage 0')
  check(r.eyebrowCoverage === 0, 'empty: eyebrowCoverage 0')
  check(r.completionRate === 0, 'empty: completionRate 0')
}

// 2. Page with no sections → still all zeros
{
  const r = projectWebsiteSectionContentBrief(workspace(page()))
  check(r.totalSections === 0, 'no-sections: totalSections 0')
  check(r.completionRate === 0, 'no-sections: completionRate 0')
}

// 3. Complete section (title + body + eyebrow)
{
  const r = projectWebsiteSectionContentBrief(workspace(page(section({
    eyebrow: 'Features',
    title: 'What we do',
    body: 'SuperMega runs your business.',
  }))))
  check(r.totalSections === 1, 'complete: totalSections 1')
  check(r.sectionsWithTitle === 1, 'complete: sectionsWithTitle 1')
  check(r.sectionsWithBody === 1, 'complete: sectionsWithBody 1')
  check(r.sectionsWithEyebrow === 1, 'complete: sectionsWithEyebrow 1')
  check(r.sectionsComplete === 1, 'complete: sectionsComplete 1 (title+body)')
  check(r.completionRate === 100, 'complete: completionRate 100')
  check(r.eyebrowCoverage === 100, 'complete: eyebrowCoverage 100')
}

// 4. Section with title only — not complete
{
  const r = projectWebsiteSectionContentBrief(workspace(page(section({ title: 'Title only' }))))
  check(r.sectionsWithTitle === 1, 'title-only: sectionsWithTitle 1')
  check(r.sectionsWithBody === 0, 'title-only: sectionsWithBody 0')
  check(r.sectionsComplete === 0, 'title-only: sectionsComplete 0 (body missing)')
  check(r.completionRate === 0, 'title-only: completionRate 0')
}

// 5. Section with body only — not complete
{
  const r = projectWebsiteSectionContentBrief(workspace(page(section({ body: 'Body only' }))))
  check(r.sectionsComplete === 0, 'body-only: sectionsComplete 0 (title missing)')
  check(r.bodyCoverage === 100, 'body-only: bodyCoverage 100')
}

// 6. Whitespace-only fields treated as empty
{
  const r = projectWebsiteSectionContentBrief(workspace(page(section({ title: '  ', body: '\t' }))))
  check(r.sectionsWithTitle === 0, 'whitespace: title not counted')
  check(r.sectionsWithBody === 0, 'whitespace: body not counted')
  check(r.sectionsComplete === 0, 'whitespace: not complete')
}

// 7. Two sections, one complete, one empty → 50% rates
{
  const r = projectWebsiteSectionContentBrief(workspace(page(
    section({ title: 'T', body: 'B', eyebrow: 'E' }),
    section(),
  )))
  check(r.totalSections === 2, 'mixed-50: totalSections 2')
  check(r.sectionsWithTitle === 1, 'mixed-50: sectionsWithTitle 1')
  check(r.sectionsComplete === 1, 'mixed-50: sectionsComplete 1')
  check(r.completionRate === 50, 'mixed-50: completionRate 50')
  check(r.titleCoverage === 50, 'mixed-50: titleCoverage 50')
  check(r.eyebrowCoverage === 50, 'mixed-50: eyebrowCoverage 50')
}

// 8. Sections across multiple pages — accumulate correctly
{
  const r = projectWebsiteSectionContentBrief(workspace(
    page(
      section({ title: 'T1', body: 'B1' }),
      section({ title: 'T2', body: 'B2' }),
    ),
    page(
      section({ title: 'T3', body: 'B3' }),
    ),
  ))
  check(r.totalSections === 3, 'multi-page: totalSections 3 (across 2 pages)')
  check(r.sectionsComplete === 3, 'multi-page: sectionsComplete 3')
  check(r.completionRate === 100, 'multi-page: completionRate 100')
}

// 9. completionRate rounds — 2 of 3 = 67%
{
  const r = projectWebsiteSectionContentBrief(workspace(page(
    section({ title: 'T', body: 'B' }),
    section({ title: 'T', body: 'B' }),
    section(),
  )))
  check(r.completionRate === 67, 'round-67pct: completionRate 67')
  check(r.totalSections === 3, 'round-67pct: totalSections 3')
}

console.log(JSON.stringify({ ok: true, checks }))
