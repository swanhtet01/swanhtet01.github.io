// Website section depth brief: per-page sections distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteSectionDepthBrief } from './website-section-depth-brief.ts'`,
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

const { projectWebsiteSectionDepthBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let pageId = 0
function section(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `sec-${pageId}-${i}`,
    eyebrow: '',
    title: `Section ${i + 1}`,
    body: 'Body text.',
  }))
}

function page(sectionCount = 0) {
  pageId++
  return {
    id: `page-${pageId}`,
    internalName: `Page ${pageId}`,
    slug: `page-${pageId}`,
    stage: 'ready',
    navigation: { label: `Page ${pageId}`, visible: true },
    hero: { eyebrow: '', headline: '', summary: '', ctaLabel: '', ctaHref: '' },
    sections: section(sectionCount),
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

// 1. Empty → all zeros
{
  const r = projectWebsiteSectionDepthBrief(workspace())
  check(r.totalPages === 0, 'empty: totalPages 0')
  check(r.pagesWithNoSections === 0, 'empty: pagesWithNoSections 0')
  check(r.pagesWithSections === 0, 'empty: pagesWithSections 0')
  check(r.sectionCoverage === 0, 'empty: sectionCoverage 0')
  check(r.pagesWithOnlyOneSection === 0, 'empty: pagesWithOnlyOneSection 0')
  check(r.pagesWithTwoToFive === 0, 'empty: pagesWithTwoToFive 0')
  check(r.pagesWithSixPlus === 0, 'empty: pagesWithSixPlus 0')
  check(r.maxSectionsPerPage === 0, 'empty: maxSectionsPerPage 0')
}

// 2. Page with 0 sections
{
  const r = projectWebsiteSectionDepthBrief(workspace(page(0)))
  check(r.totalPages === 1, 'no-sections: totalPages 1')
  check(r.pagesWithNoSections === 1, 'no-sections: pagesWithNoSections 1')
  check(r.pagesWithSections === 0, 'no-sections: pagesWithSections 0')
  check(r.sectionCoverage === 0, 'no-sections: sectionCoverage 0')
  check(r.maxSectionsPerPage === 0, 'no-sections: maxSectionsPerPage 0')
}

// 3. Page with exactly 1 section
{
  const r = projectWebsiteSectionDepthBrief(workspace(page(1)))
  check(r.pagesWithSections === 1, 'one-section: pagesWithSections 1')
  check(r.pagesWithOnlyOneSection === 1, 'one-section: pagesWithOnlyOneSection 1')
  check(r.sectionCoverage === 100, 'one-section: sectionCoverage 100')
  check(r.maxSectionsPerPage === 1, 'one-section: maxSectionsPerPage 1')
}

// 4. Page with 2 sections → pagesWithTwoToFive
{
  const r = projectWebsiteSectionDepthBrief(workspace(page(2)))
  check(r.pagesWithTwoToFive === 1, 'two-sections: pagesWithTwoToFive 1')
  check(r.pagesWithOnlyOneSection === 0, 'two-sections: pagesWithOnlyOneSection 0')
  check(r.maxSectionsPerPage === 2, 'two-sections: maxSectionsPerPage 2')
}

// 5. Page with 5 sections → pagesWithTwoToFive (boundary)
{
  const r = projectWebsiteSectionDepthBrief(workspace(page(5)))
  check(r.pagesWithTwoToFive === 1, 'five-sections: pagesWithTwoToFive 1 (upper boundary)')
  check(r.pagesWithSixPlus === 0, 'five-sections: pagesWithSixPlus 0')
  check(r.maxSectionsPerPage === 5, 'five-sections: maxSectionsPerPage 5')
}

// 6. Page with 6 sections → pagesWithSixPlus
{
  const r = projectWebsiteSectionDepthBrief(workspace(page(6)))
  check(r.pagesWithSixPlus === 1, 'six-sections: pagesWithSixPlus 1')
  check(r.pagesWithTwoToFive === 0, 'six-sections: pagesWithTwoToFive 0')
  check(r.maxSectionsPerPage === 6, 'six-sections: maxSectionsPerPage 6')
}

// 7. Mixed: 0, 1, 3, 8 sections
{
  const r = projectWebsiteSectionDepthBrief(workspace(
    page(0),
    page(1),
    page(3),
    page(8),
  ))
  check(r.totalPages === 4, 'mixed: totalPages 4')
  check(r.pagesWithNoSections === 1, 'mixed: pagesWithNoSections 1')
  check(r.pagesWithSections === 3, 'mixed: pagesWithSections 3')
  check(r.sectionCoverage === 75, 'mixed: sectionCoverage 75 (3/4)')
  check(r.pagesWithOnlyOneSection === 1, 'mixed: pagesWithOnlyOneSection 1')
  check(r.pagesWithTwoToFive === 1, 'mixed: pagesWithTwoToFive 1')
  check(r.pagesWithSixPlus === 1, 'mixed: pagesWithSixPlus 1')
  check(r.maxSectionsPerPage === 8, 'mixed: maxSectionsPerPage 8')
}

// 8. sectionCoverage rounds — 2 of 3 pages have sections = 67%
{
  const r = projectWebsiteSectionDepthBrief(workspace(page(1), page(2), page(0)))
  check(r.sectionCoverage === 67, 'round-67pct: sectionCoverage 67')
}

// 9. All pages have sections → 100% coverage
{
  const r = projectWebsiteSectionDepthBrief(workspace(page(1), page(3)))
  check(r.sectionCoverage === 100, 'all-covered: sectionCoverage 100')
  check(r.pagesWithNoSections === 0, 'all-covered: pagesWithNoSections 0')
}

console.log(JSON.stringify({ ok: true, checks }))
