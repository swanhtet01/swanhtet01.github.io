// Website release brand brief: body/heading font choices + radiusPx sharp/rounded/very-rounded bands.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteReleaseBrandBrief } from './website-release-brand-brief.ts'`,
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

const { projectWebsiteReleaseBrandBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

function brand({ body = 'system-sans', heading = 'system-sans', radiusPx = 4 } = {}) {
  return {
    schema: 'supermega.website.brand_tokens.v1',
    palette: { accent: '#ff0000', ink: '#000000', surface: '#ffffff' },
    typography: { body, heading },
    radiusPx,
  }
}

function pkg(brandTokens) {
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
    brand: brandTokens,
    locales: [],
    media: [],
    roles: [],
    previousPackageDigest: null,
    migration: null,
    packageDigest: 'pkg-digest-1',
  }
}

// 1. Default system-sans fonts
{
  const r = projectWebsiteReleaseBrandBrief(pkg(brand()))
  check(r.bodyFont === 'system-sans', 'default: bodyFont system-sans')
  check(r.headingFont === 'system-sans', 'default: headingFont system-sans')
  check(r.fontsMatch === true, 'default: fontsMatch true (both system-sans)')
}

// 2. fontsMatch false
{
  const r = projectWebsiteReleaseBrandBrief(pkg(brand({ body: 'system-sans', heading: 'noto-sans-myanmar' })))
  check(r.fontsMatch === false, 'mismatch: fontsMatch false')
  check(r.bodyFont === 'system-sans', 'mismatch: bodyFont system-sans')
  check(r.headingFont === 'noto-sans-myanmar', 'mismatch: headingFont noto-sans-myanmar')
}

// 3. All font combinations
{
  const r = projectWebsiteReleaseBrandBrief(pkg(brand({ body: 'noto-sans-myanmar', heading: 'system-serif' })))
  check(r.bodyFont === 'noto-sans-myanmar', 'fonts: bodyFont noto-sans-myanmar')
  check(r.headingFont === 'system-serif', 'fonts: headingFont system-serif')
  check(r.fontsMatch === false, 'fonts: fontsMatch false')
}

// 4. Sharp: radiusPx === 0
{
  const r = projectWebsiteReleaseBrandBrief(pkg(brand({ radiusPx: 0 })))
  check(r.isSharp === true, 'sharp: isSharp true')
  check(r.isRounded === false, 'sharp: isRounded false')
  check(r.isVeryRounded === false, 'sharp: isVeryRounded false')
  check(r.radiusPx === 0, 'sharp: radiusPx 0')
}

// 5. Rounded: radiusPx 1
{
  const r = projectWebsiteReleaseBrandBrief(pkg(brand({ radiusPx: 1 })))
  check(r.isSharp === false, 'rounded-1: isSharp false')
  check(r.isRounded === true, 'rounded-1: isRounded true')
}

// 6. Rounded: radiusPx 8 (boundary)
{
  const r = projectWebsiteReleaseBrandBrief(pkg(brand({ radiusPx: 8 })))
  check(r.isRounded === true, 'rounded-8: isRounded true (boundary)')
  check(r.isVeryRounded === false, 'rounded-8: isVeryRounded false')
}

// 7. Very rounded: radiusPx 9 (boundary)
{
  const r = projectWebsiteReleaseBrandBrief(pkg(brand({ radiusPx: 9 })))
  check(r.isVeryRounded === true, 'very-9: isVeryRounded true (boundary)')
  check(r.isRounded === false, 'very-9: isRounded false')
}

// 8. Very rounded: radiusPx 16
{
  const r = projectWebsiteReleaseBrandBrief(pkg(brand({ radiusPx: 16 })))
  check(r.isVeryRounded === true, 'very-16: isVeryRounded true')
  check(r.radiusPx === 16, 'very-16: radiusPx 16')
}

// 9. Exactly one radius band is true
{
  for (const radiusPx of [0, 4, 12]) {
    const r = projectWebsiteReleaseBrandBrief(pkg(brand({ radiusPx })))
    const trueCount = [r.isSharp, r.isRounded, r.isVeryRounded].filter(Boolean).length
    check(trueCount === 1, `invariant: exactly one radius band true for radiusPx=${radiusPx}`)
  }
}

console.log(JSON.stringify({ ok: true, checks }))
