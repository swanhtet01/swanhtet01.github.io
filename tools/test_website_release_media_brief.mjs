// Website release media brief: bytes stats + decorative rate + unique alt locales.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteReleaseMediaBrief } from './website-release-media-brief.ts'`,
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

const { projectWebsiteReleaseMediaBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let assetId = 0
function mediaItem({ bytes = 50000, decorative = false, altLocales = ['my'] } = {}) {
  assetId++
  return {
    assetId: `asset-${assetId}`,
    kind: 'image',
    digest: `dgst-${assetId}`,
    bytes,
    decorative,
    alt: altLocales.map(locale => ({ locale, text: `Alt text in ${locale}` })),
  }
}

function pkg(media) {
  return {
    contract: 'supermega.website.release_package.v1',
    packageId: 'pkg-1',
    source: {
      scope: 'scope-1',
      snapshotId: 'snap-1',
      websiteFingerprint: 'wfp-1',
      artifactDigest: 'ad-1',
      contentRevision: 1,
      contentApprovalId: 'cap-1',
      contentApprovalActor: 'user-1',
      contentApprovalAt: '2026-08-01T09:00:00Z',
      evidence: [],
    },
    template: { templateId: 'TPL-BUSINESS-001', version: 1, components: [] },
    brand: {
      schema: 'supermega.website.brand_tokens.v1',
      palette: { accent: '#ff0000', ink: '#000000', surface: '#ffffff' },
      typography: { body: 'system-sans', heading: 'system-sans' },
      radiusPx: 4,
    },
    locales: [],
    media,
    roles: [],
    previousPackageDigest: null,
    migration: null,
    packageDigest: 'pkg-digest-1',
  }
}

// 1. Empty media
{
  const r = projectWebsiteReleaseMediaBrief(pkg([]))
  check(r.totalMedia === 0, 'empty: totalMedia 0')
  check(r.totalBytes === 0, 'empty: totalBytes 0')
  check(r.averageBytes === 0, 'empty: averageBytes 0')
  check(r.minBytes === null, 'empty: minBytes null')
  check(r.maxBytes === null, 'empty: maxBytes null')
  check(r.decorativeCount === 0, 'empty: decorativeCount 0')
  check(r.decorativeRate === 0, 'empty: decorativeRate 0')
  check(r.uniqueAltLocales === 0, 'empty: uniqueAltLocales 0')
}

// 2. Single non-decorative item
{
  const r = projectWebsiteReleaseMediaBrief(pkg([mediaItem({ bytes: 100000, decorative: false, altLocales: ['my'] })]))
  check(r.totalMedia === 1, 'single: totalMedia 1')
  check(r.totalBytes === 100000, 'single: totalBytes 100000')
  check(r.averageBytes === 100000, 'single: averageBytes 100000')
  check(r.minBytes === 100000, 'single: minBytes 100000')
  check(r.maxBytes === 100000, 'single: maxBytes 100000')
  check(r.decorativeCount === 0, 'single: decorativeCount 0')
  check(r.nonDecorativeCount === 1, 'single: nonDecorativeCount 1')
  check(r.uniqueAltLocales === 1, 'single: uniqueAltLocales 1')
}

// 3. All decorative
{
  const r = projectWebsiteReleaseMediaBrief(
    pkg([mediaItem({ decorative: true }), mediaItem({ decorative: true })]),
  )
  check(r.decorativeCount === 2, 'all-dec: decorativeCount 2')
  check(r.nonDecorativeCount === 0, 'all-dec: nonDecorativeCount 0')
  check(r.decorativeRate === 100, 'all-dec: decorativeRate 100')
}

// 4. Bytes min/max detection
{
  const r = projectWebsiteReleaseMediaBrief(
    pkg([
      mediaItem({ bytes: 10000 }),
      mediaItem({ bytes: 200000 }),
      mediaItem({ bytes: 50000 }),
    ]),
  )
  check(r.minBytes === 10000, 'bytes: minBytes 10000')
  check(r.maxBytes === 200000, 'bytes: maxBytes 200000')
  check(r.totalBytes === 260000, 'bytes: totalBytes 260000')
}

// 5. Average bytes rounding: (1000 + 2000 + 2000) / 3 = 1667
{
  const r = projectWebsiteReleaseMediaBrief(
    pkg([mediaItem({ bytes: 1000 }), mediaItem({ bytes: 2000 }), mediaItem({ bytes: 2000 })]),
  )
  check(r.averageBytes === 1667, 'round: averageBytes 1667')
}

// 6. Unique alt locales — deduplicated across items
{
  const r = projectWebsiteReleaseMediaBrief(
    pkg([
      mediaItem({ altLocales: ['my', 'en'] }),
      mediaItem({ altLocales: ['my', 'zh'] }),
    ]),
  )
  check(r.uniqueAltLocales === 3, 'locales: uniqueAltLocales 3 (my, en, zh)')
}

// 7. Decorative rate rounding: 1/3 → 33%
{
  const r = projectWebsiteReleaseMediaBrief(
    pkg([
      mediaItem({ decorative: true }),
      mediaItem({ decorative: false }),
      mediaItem({ decorative: false }),
    ]),
  )
  check(r.decorativeRate === 33, 'round-rate: decorativeRate 33')
}

// 8. decorativeCount + nonDecorativeCount === totalMedia
{
  const r = projectWebsiteReleaseMediaBrief(
    pkg([mediaItem({ decorative: true }), mediaItem({ decorative: false }), mediaItem({ decorative: true })]),
  )
  check(r.decorativeCount + r.nonDecorativeCount === r.totalMedia, 'invariant: dec + non-dec = total')
}

console.log(JSON.stringify({ ok: true, checks }))
