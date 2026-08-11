// Website page hero/SEO brief: eyebrow/CTA presence + headline/summary length averages + SEO completeness.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsitePageHeroSeoBrief } from './website-page-hero-seo-brief.ts'`,
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

const { projectWebsitePageHeroSeoBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let pageId = 0
function page({
  eyebrow = '',
  headline = 'Main Headline',
  summary = 'Page summary text here',
  ctaLabel = 'Get Started',
  ctaHref = '/contact',
  seoTitle = 'SEO Title',
  seoDescription = 'SEO description for this page',
} = {}) {
  pageId++
  return {
    id: `PG-${pageId}`,
    internalName: `Page ${pageId}`,
    slug: `/page-${pageId}`,
    stage: 'draft',
    navigation: { label: 'Nav', visible: false },
    hero: { eyebrow, headline, summary, ctaLabel, ctaHref },
    sections: [],
    seo: { title: seoTitle, description: seoDescription },
    updatedAt: '2026-08-01T09:00:00Z',
  }
}

function workspace(pages) {
  return {
    schema: 'supermega.website.workspace.v1',
    scope: 'scope-1',
    revision: 0,
    contentRevision: 0,
    headDigest: 'hd-1',
    pages,
    publishApprovals: [],
    evidence: [],
    localPublishRecords: [],
    events: [],
    openingPlan: undefined,
    workingSample: undefined,
  }
}

// 1. Empty workspace
{
  const r = projectWebsitePageHeroSeoBrief(workspace([]))
  check(r.totalPages === 0, 'empty: totalPages 0')
  check(r.hasEyebrowCount === 0, 'empty: hasEyebrowCount 0')
  check(r.hasEyebrowRate === 0, 'empty: hasEyebrowRate 0')
  check(r.averageHeadlineLength === 0, 'empty: avgHeadline 0')
  check(r.hasCtaCount === 0, 'empty: hasCtaCount 0')
  check(r.seoTitleCompleteCount === 0, 'empty: seoTitleCount 0')
  check(r.seoDescriptionCompleteCount === 0, 'empty: seoDescCount 0')
}

// 2. Page with eyebrow
{
  const r = projectWebsitePageHeroSeoBrief(workspace([page({ eyebrow: 'Featured' })]))
  check(r.hasEyebrowCount === 1, 'eyebrow: hasEyebrowCount 1')
  check(r.hasEyebrowRate === 100, 'eyebrow: hasEyebrowRate 100')
}

// 3. Page without eyebrow (empty string)
{
  const r = projectWebsitePageHeroSeoBrief(workspace([page({ eyebrow: '' })]))
  check(r.hasEyebrowCount === 0, 'no-eyebrow: hasEyebrowCount 0')
  check(r.hasEyebrowRate === 0, 'no-eyebrow: hasEyebrowRate 0')
}

// 4. CTA presence — both label AND href required
{
  const r = projectWebsitePageHeroSeoBrief(workspace([page({ ctaLabel: 'Click', ctaHref: '/go' })]))
  check(r.hasCtaCount === 1, 'cta: hasCtaCount 1')
  check(r.hasCtaRate === 100, 'cta: hasCtaRate 100')
}
{
  const r = projectWebsitePageHeroSeoBrief(workspace([page({ ctaLabel: '', ctaHref: '/go' })]))
  check(r.hasCtaCount === 0, 'cta-no-label: hasCtaCount 0')
}
{
  const r = projectWebsitePageHeroSeoBrief(workspace([page({ ctaLabel: 'Click', ctaHref: '' })]))
  check(r.hasCtaCount === 0, 'cta-no-href: hasCtaCount 0')
}

// 5. SEO title complete (non-empty)
{
  const r = projectWebsitePageHeroSeoBrief(workspace([page({ seoTitle: 'My Page', seoDescription: '' })]))
  check(r.seoTitleCompleteCount === 1, 'seo: titleComplete 1')
  check(r.seoDescriptionCompleteCount === 0, 'seo: descComplete 0')
}

// 6. Headline and summary averages
{
  const r = projectWebsitePageHeroSeoBrief(workspace([
    page({ headline: '12345', summary: '1234567890' }),
    page({ headline: '1234567890', summary: '12345' }),
  ]))
  check(r.averageHeadlineLength === 8, 'avg: headline avg 8 (round((5+10)/2))')
  check(r.averageSummaryLength === 8, 'avg: summary avg 8')
}

// 7. SEO completeness rate
{
  const r = projectWebsitePageHeroSeoBrief(workspace([
    page({ seoTitle: 'Title', seoDescription: 'Desc' }),
    page({ seoTitle: '', seoDescription: '' }),
    page({ seoTitle: 'Title2', seoDescription: '' }),
  ]))
  check(r.seoTitleCompleteRate === 67, 'seo-rate: titleRate 67')
  check(r.seoDescriptionCompleteRate === 33, 'seo-rate: descRate 33')
}

// 8. Mixed eyebrow presence rate
{
  const r = projectWebsitePageHeroSeoBrief(workspace([
    page({ eyebrow: 'New' }),
    page({ eyebrow: '' }),
    page({ eyebrow: '' }),
  ]))
  check(r.hasEyebrowRate === 33, 'eyebrow-rate: rate 33')
}

console.log(JSON.stringify({ ok: true, checks }))
