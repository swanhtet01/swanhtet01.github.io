// Website SEO completeness brief: SEO field coverage and ready-page completeness.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteSeoCompletenessBrief } from './website-seo-completeness-brief.ts'`,
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

const { projectWebsiteSeoCompletenessBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.website.workspace.v2'

function page({ id = 'p1', stage = 'draft', seoTitle = 'My Title', seoDesc = 'My Description' } = {}) {
  return {
    id, internalName: `Page ${id}`, slug: `/${id}`, stage,
    navigation: { label: 'Nav', visible: true },
    hero: { eyebrow: '', headline: 'Headline', summary: '', ctaLabel: 'CTA', ctaHref: '/' },
    sections: [],
    seo: { title: seoTitle, description: seoDesc },
    updatedAt: '2026-01-01T00:00:00Z',
  }
}

function state(pages = []) {
  return {
    schema: SCHEMA, version: 2, revision: 1, contentRevision: 1,
    siteName: 'Test Shop', pages, selectedPageId: '', evidence: [], approvals: [],
  }
}

// 1. Empty state
{
  const r = projectWebsiteSeoCompletenessBrief(state([]))
  check(r.totalPages === 0, 'empty: totalPages 0')
  check(r.pagesWithSeoTitle === 0, 'empty: pagesWithSeoTitle 0')
  check(r.pagesWithSeoDescription === 0, 'empty: pagesWithSeoDescription 0')
  check(r.pagesFullySeoComplete === 0, 'empty: pagesFullySeoComplete 0')
  check(r.seoCoverage === 0, 'empty: seoCoverage 0')
  check(r.readyPagesTotal === 0, 'empty: readyPagesTotal 0')
  check(r.readySeoCoverage === 0, 'empty: readySeoCoverage 0')
}

// 2. One fully SEO-complete page
{
  const r = projectWebsiteSeoCompletenessBrief(state([page({ id: 'p1', seoTitle: 'Title', seoDesc: 'Desc' })]))
  check(r.totalPages === 1, 'full-seo: totalPages 1')
  check(r.pagesWithSeoTitle === 1, 'full-seo: pagesWithSeoTitle 1')
  check(r.pagesWithSeoDescription === 1, 'full-seo: pagesWithSeoDescription 1')
  check(r.pagesFullySeoComplete === 1, 'full-seo: pagesFullySeoComplete 1')
  check(r.seoCoverage === 100, 'full-seo: seoCoverage 100')
}

// 3. Page with empty seo.title
{
  const r = projectWebsiteSeoCompletenessBrief(state([page({ seoTitle: '', seoDesc: 'Desc' })]))
  check(r.pagesWithSeoTitle === 0, 'empty-title: pagesWithSeoTitle 0')
  check(r.pagesWithSeoDescription === 1, 'empty-title: pagesWithSeoDescription 1')
  check(r.pagesFullySeoComplete === 0, 'empty-title: pagesFullySeoComplete 0')
}

// 4. Page with whitespace-only seo.description
{
  const r = projectWebsiteSeoCompletenessBrief(state([page({ seoTitle: 'Title', seoDesc: '   ' })]))
  check(r.pagesWithSeoDescription === 0, 'whitespace-desc: pagesWithSeoDescription 0 (trim)')
  check(r.pagesFullySeoComplete === 0, 'whitespace-desc: pagesFullySeoComplete 0')
}

// 5. seoCoverage rounds: 2/3 pages complete → 67
{
  const r = projectWebsiteSeoCompletenessBrief(state([
    page({ id: 'p1', seoTitle: 'T', seoDesc: 'D' }),
    page({ id: 'p2', seoTitle: 'T', seoDesc: 'D' }),
    page({ id: 'p3', seoTitle: '', seoDesc: '' }),
  ]))
  check(r.seoCoverage === 67, 'coverage-round: seoCoverage 67 (round 2/3×100)')
}

// 6. readyPagesTotal and readySeoCoverage
{
  const r = projectWebsiteSeoCompletenessBrief(state([
    page({ id: 'p1', stage: 'ready', seoTitle: 'T', seoDesc: 'D' }),
    page({ id: 'p2', stage: 'ready', seoTitle: '', seoDesc: '' }),
    page({ id: 'p3', stage: 'draft', seoTitle: 'T', seoDesc: 'D' }),
  ]))
  check(r.readyPagesTotal === 2, 'ready: readyPagesTotal 2')
  check(r.readyPagesFullySeoComplete === 1, 'ready: readyPagesFullySeoComplete 1')
  check(r.readySeoCoverage === 50, 'ready: readySeoCoverage 50')
}

// 7. readySeoCoverage = 0 when no ready pages (guard)
{
  const r = projectWebsiteSeoCompletenessBrief(state([
    page({ id: 'p1', stage: 'draft', seoTitle: 'T', seoDesc: 'D' }),
  ]))
  check(r.readyPagesTotal === 0, 'no-ready: readyPagesTotal 0')
  check(r.readySeoCoverage === 0, 'no-ready: readySeoCoverage 0')
}

console.log(JSON.stringify({ ok: true, checks }))
