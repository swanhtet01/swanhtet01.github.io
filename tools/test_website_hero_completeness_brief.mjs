// Website hero completeness brief: hero field presence analytics per page.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteHeroCompletenessBrief } from './website-hero-completeness-brief.ts'`,
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

const { projectWebsiteHeroCompletenessBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let pageId = 0
function page({ eyebrow = '', headline = '', summary = '', ctaLabel = '', ctaHref = '' } = {}) {
  pageId++
  return {
    id: `page-${pageId}`,
    internalName: `Page ${pageId}`,
    slug: `page-${pageId}`,
    stage: 'ready',
    navigation: { label: `Page ${pageId}`, visible: true },
    hero: { eyebrow, headline, summary, ctaLabel, ctaHref },
    sections: [],
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
  const r = projectWebsiteHeroCompletenessBrief(workspace())
  check(r.totalPages === 0, 'empty: totalPages 0')
  check(r.pagesWithEyebrow === 0, 'empty: pagesWithEyebrow 0')
  check(r.pagesWithHeadline === 0, 'empty: pagesWithHeadline 0')
  check(r.pagesWithSummary === 0, 'empty: pagesWithSummary 0')
  check(r.pagesWithCtaLabel === 0, 'empty: pagesWithCtaLabel 0')
  check(r.pagesWithCtaHref === 0, 'empty: pagesWithCtaHref 0')
  check(r.pagesWithFullHero === 0, 'empty: pagesWithFullHero 0')
  check(r.heroCoverage === 0, 'empty: heroCoverage 0')
}

// 2. Page with all hero fields → full hero
{
  const r = projectWebsiteHeroCompletenessBrief(workspace(page({
    eyebrow: 'Enterprise',
    headline: 'SuperMega AI',
    summary: 'Run your business with AI.',
    ctaLabel: 'Get started',
    ctaHref: '/start',
  })))
  check(r.totalPages === 1, 'full-hero: totalPages 1')
  check(r.pagesWithEyebrow === 1, 'full-hero: pagesWithEyebrow 1')
  check(r.pagesWithHeadline === 1, 'full-hero: pagesWithHeadline 1')
  check(r.pagesWithSummary === 1, 'full-hero: pagesWithSummary 1')
  check(r.pagesWithCtaLabel === 1, 'full-hero: pagesWithCtaLabel 1')
  check(r.pagesWithCtaHref === 1, 'full-hero: pagesWithCtaHref 1')
  check(r.pagesWithFullHero === 1, 'full-hero: pagesWithFullHero 1')
  check(r.heroCoverage === 100, 'full-hero: heroCoverage 100')
}

// 3. Page with empty hero fields
{
  const r = projectWebsiteHeroCompletenessBrief(workspace(page()))
  check(r.pagesWithFullHero === 0, 'empty-hero: pagesWithFullHero 0')
  check(r.heroCoverage === 0, 'empty-hero: heroCoverage 0')
}

// 4. Partial hero — only headline set
{
  const r = projectWebsiteHeroCompletenessBrief(workspace(page({ headline: 'Hello' })))
  check(r.pagesWithHeadline === 1, 'partial: pagesWithHeadline 1')
  check(r.pagesWithEyebrow === 0, 'partial: pagesWithEyebrow 0')
  check(r.pagesWithFullHero === 0, 'partial: pagesWithFullHero 0 (missing other fields)')
}

// 5. Whitespace-only fields treated as empty
{
  const r = projectWebsiteHeroCompletenessBrief(workspace(page({ headline: '   ', summary: '\t' })))
  check(r.pagesWithHeadline === 0, 'whitespace: headline not counted')
  check(r.pagesWithSummary === 0, 'whitespace: summary not counted')
}

// 6. Mixed — 1 of 2 pages has full hero → 50% coverage
{
  const r = projectWebsiteHeroCompletenessBrief(workspace(
    page({ eyebrow: 'A', headline: 'B', summary: 'C', ctaLabel: 'D', ctaHref: '/e' }),
    page(),
  ))
  check(r.pagesWithFullHero === 1, 'mixed-50pct: pagesWithFullHero 1')
  check(r.heroCoverage === 50, 'mixed-50pct: heroCoverage 50')
}

// 7. heroCoverage rounds — 2 of 3 = 67%
{
  const r = projectWebsiteHeroCompletenessBrief(workspace(
    page({ eyebrow: 'A', headline: 'B', summary: 'C', ctaLabel: 'D', ctaHref: '/e' }),
    page({ eyebrow: 'F', headline: 'G', summary: 'H', ctaLabel: 'I', ctaHref: '/j' }),
    page(),
  ))
  check(r.heroCoverage === 67, 'round-67pct: heroCoverage 67')
  check(r.totalPages === 3, 'round-67pct: totalPages 3')
}

console.log(JSON.stringify({ ok: true, checks }))
