// Website page slug depth brief: root/shallow/nested/deep distribution + avg depth.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsitePageSlugDepthBrief } from './website-page-slug-depth-brief.ts'`,
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

const { projectWebsitePageSlugDepthBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let pageId = 0
function page(slug = '/home') {
  pageId++
  return {
    id: `PG-${pageId}`,
    internalName: `Page ${pageId}`,
    slug,
    stage: 'draft',
    navigation: { label: 'Nav', visible: false },
    hero: { eyebrow: '', headline: 'H', summary: 'S', ctaLabel: 'CTA', ctaHref: '/cta' },
    sections: [],
    seo: { title: 'T', description: 'D' },
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
  const r = projectWebsitePageSlugDepthBrief(workspace([]))
  check(r.totalPages === 0, 'empty: totalPages 0')
  check(r.rootCount === 0, 'empty: rootCount 0')
  check(r.shallowCount === 0, 'empty: shallowCount 0')
  check(r.averageSlugDepth === 0, 'empty: avg 0')
  check(r.uniqueSlugs === 0, 'empty: uniqueSlugs 0')
}

// 2. Root slug '/' → depth 0
{
  const r = projectWebsitePageSlugDepthBrief(workspace([page('/')]))
  check(r.rootCount === 1, 'root: rootCount 1')
  check(r.shallowCount === 0, 'root: shallowCount 0')
  check(r.averageSlugDepth === 0, 'root: avg 0')
}

// 3. Shallow slugs '/home' → depth 1
{
  const r = projectWebsitePageSlugDepthBrief(workspace([page('/home'), page('/about')]))
  check(r.shallowCount === 2, 'shallow: shallowCount 2')
  check(r.shallowRate === 100, 'shallow: shallowRate 100')
  check(r.averageSlugDepth === 1, 'shallow: avg 1')
}

// 4. Nested slugs '/products/shoes' → depth 2
{
  const r = projectWebsitePageSlugDepthBrief(workspace([page('/products/shoes')]))
  check(r.nestedCount === 1, 'nested: nestedCount 1')
  check(r.nestedRate === 100, 'nested: nestedRate 100')
  check(r.averageSlugDepth === 2, 'nested: avg 2')
}

// 5. Deep slugs '/blog/2026/aug' → depth 3
{
  const r = projectWebsitePageSlugDepthBrief(workspace([page('/blog/2026/aug')]))
  check(r.deepCount === 1, 'deep: deepCount 1')
  check(r.deepRate === 100, 'deep: deepRate 100')
  check(r.averageSlugDepth === 3, 'deep: avg 3')
}

// 6. Mixed — depth counts sum to total
{
  const r = projectWebsitePageSlugDepthBrief(
    workspace([page('/'), page('/home'), page('/products/shoes'), page('/blog/2026/aug')]),
  )
  check(r.rootCount + r.shallowCount + r.nestedCount + r.deepCount === r.totalPages, 'invariant: depth counts sum')
}

// 7. Average slug depth across mix
{
  // depths: 0 + 1 + 2 = 3 / 3 = 1
  const r = projectWebsitePageSlugDepthBrief(
    workspace([page('/'), page('/home'), page('/products/shoes')]),
  )
  check(r.averageSlugDepth === 1, 'avg-mix: avg 1 (round(3/3))')
}

// 8. Unique slugs count
{
  const r = projectWebsitePageSlugDepthBrief(
    workspace([page('/home'), page('/home'), page('/about')]),
  )
  check(r.uniqueSlugs === 2, 'unique: uniqueSlugs 2')
  check(r.totalPages === 3, 'unique: totalPages 3 (duplicates counted)')
}

// 9. Rounding: avg depth 2+3+3 = 8/3 = 2.67 → 3
{
  const r = projectWebsitePageSlugDepthBrief(
    workspace([page('/a/b'), page('/a/b/c'), page('/a/b/c')]),
  )
  check(r.averageSlugDepth === 3, 'round-avg: avg 3 (round(8/3))')
}

// 10. Rate rounding
{
  const r = projectWebsitePageSlugDepthBrief(
    workspace([page('/home'), page('/home'), page('/about/team')]),
  )
  check(r.shallowRate === 67, 'rate-round: shallowRate 67')
  check(r.nestedRate === 33, 'rate-round: nestedRate 33')
}

console.log(JSON.stringify({ ok: true, checks }))
