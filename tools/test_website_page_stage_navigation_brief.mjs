// Website page stage/navigation brief: draft/ready distribution + visibility rate + label top-5.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsitePageStageNavigationBrief } from './website-page-stage-navigation-brief.ts'`,
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

const { projectWebsitePageStageNavigationBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let pageId = 0
function page({ stage = 'draft', navVisible = false, navLabel = 'Home' } = {}) {
  pageId++
  return {
    id: `PG-${pageId}`,
    internalName: `Page ${pageId}`,
    slug: `/page-${pageId}`,
    stage,
    navigation: { label: navLabel, visible: navVisible },
    hero: { eyebrow: '', headline: 'Headline', summary: 'Summary', ctaLabel: 'CTA', ctaHref: '/cta' },
    sections: [],
    seo: { title: 'Title', description: 'Description' },
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
  const r = projectWebsitePageStageNavigationBrief(workspace([]))
  check(r.totalPages === 0, 'empty: totalPages 0')
  check(r.draftCount === 0, 'empty: draftCount 0')
  check(r.readyCount === 0, 'empty: readyCount 0')
  check(r.draftRate === 0, 'empty: draftRate 0')
  check(r.visibleInNavigationCount === 0, 'empty: visible 0')
  check(r.navigationVisibilityRate === 0, 'empty: visRate 0')
  check(r.uniqueNavigationLabels === 0, 'empty: uniqueLabels 0')
  check(r.topNavigationLabelsByCount.length === 0, 'empty: top empty')
}

// 2. All draft
{
  const r = projectWebsitePageStageNavigationBrief(workspace([page({ stage: 'draft' }), page({ stage: 'draft' })]))
  check(r.draftCount === 2, 'all-draft: draftCount 2')
  check(r.readyCount === 0, 'all-draft: readyCount 0')
  check(r.draftRate === 100, 'all-draft: draftRate 100')
  check(r.readyRate === 0, 'all-draft: readyRate 0')
}

// 3. All ready
{
  const r = projectWebsitePageStageNavigationBrief(workspace([page({ stage: 'ready' })]))
  check(r.readyCount === 1, 'all-ready: readyCount 1')
  check(r.readyRate === 100, 'all-ready: readyRate 100')
}

// 4. Stage counts sum to total
{
  const r = projectWebsitePageStageNavigationBrief(
    workspace([page({ stage: 'draft' }), page({ stage: 'ready' }), page({ stage: 'ready' })]),
  )
  check(r.draftCount + r.readyCount === r.totalPages, 'invariant: stage counts sum to total')
  check(r.draftRate === 33, 'round: draftRate 33')
  check(r.readyRate === 67, 'round: readyRate 67')
}

// 5. Navigation visibility — all visible
{
  const r = projectWebsitePageStageNavigationBrief(
    workspace([page({ navVisible: true }), page({ navVisible: true })]),
  )
  check(r.visibleInNavigationCount === 2, 'nav-vis: count 2')
  check(r.navigationVisibilityRate === 100, 'nav-vis: rate 100')
}

// 6. Navigation visibility — mixed
{
  const r = projectWebsitePageStageNavigationBrief(
    workspace([page({ navVisible: true }), page({ navVisible: false }), page({ navVisible: false })]),
  )
  check(r.visibleInNavigationCount === 1, 'nav-mix: count 1')
  check(r.navigationVisibilityRate === 33, 'nav-mix: rate 33')
}

// 7. Navigation label distribution
{
  const r = projectWebsitePageStageNavigationBrief(
    workspace([
      page({ navLabel: 'Home' }),
      page({ navLabel: 'Home' }),
      page({ navLabel: 'Contact' }),
    ]),
  )
  check(r.uniqueNavigationLabels === 2, 'label-dist: uniqueLabels 2')
  check(r.topNavigationLabelsByCount[0]?.label === 'Home', 'label-dist: top Home')
  check(r.topNavigationLabelsByCount[0]?.count === 2, 'label-dist: Home count 2')
}

// 8. Top-5 label cap + alpha tiebreak
{
  const labels = ['Zebra', 'Alpha', 'Charlie', 'Bravo', 'Delta', 'Echo']
  const r = projectWebsitePageStageNavigationBrief(workspace(labels.map(l => page({ navLabel: l }))))
  check(r.topNavigationLabelsByCount.length === 5, 'top5: capped at 5')
  check(r.topNavigationLabelsByCount[0]?.label === 'Alpha', 'top5: Alpha first (tiebreak)')
}

console.log(JSON.stringify({ ok: true, checks }))
