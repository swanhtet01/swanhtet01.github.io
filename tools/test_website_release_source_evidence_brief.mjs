// Website release source evidence brief: content/links/responsive kind distribution + uniqueVerifiers + hasAllThreeKinds.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteReleaseSourceEvidenceBrief } from './website-release-source-evidence-brief.ts'`,
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

const { projectWebsiteReleaseSourceEvidenceBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let evId = 0
function evidence({ kind = 'content', verifiedBy = 'reviewer-1' } = {}) {
  evId++
  return {
    id: `ev-${evId}`,
    kind,
    reference: `ref-${evId}`,
    verifiedBy,
    verifiedAt: '2026-08-01T09:00:00Z',
  }
}

function pkg(sourceEvidence) {
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
      evidence: sourceEvidence,
    },
    template: { templateId: 'TPL-BUSINESS-001', version: 1, components: [] },
    brand: {
      schema: 'supermega.website.brand_tokens.v1',
      palette: { accent: '#ff0000', ink: '#000000', surface: '#ffffff' },
      typography: { body: 'system-sans', heading: 'system-sans' },
      radiusPx: 4,
    },
    locales: [],
    media: [],
    roles: [],
    previousPackageDigest: null,
    migration: null,
    packageDigest: 'pkg-digest-1',
  }
}

// 1. No evidence
{
  const r = projectWebsiteReleaseSourceEvidenceBrief(pkg([]))
  check(r.totalEvidence === 0, 'empty: totalEvidence 0')
  check(r.contentCount === 0, 'empty: contentCount 0')
  check(r.linksCount === 0, 'empty: linksCount 0')
  check(r.responsiveCount === 0, 'empty: responsiveCount 0')
  check(r.contentRate === 0, 'empty: contentRate 0')
  check(r.uniqueVerifiers === 0, 'empty: uniqueVerifiers 0')
  check(r.hasAllThreeKinds === false, 'empty: hasAllThreeKinds false')
}

// 2. Single content evidence
{
  const r = projectWebsiteReleaseSourceEvidenceBrief(pkg([evidence({ kind: 'content', verifiedBy: 'user-1' })]))
  check(r.totalEvidence === 1, 'single: totalEvidence 1')
  check(r.contentCount === 1, 'single: contentCount 1')
  check(r.linksCount === 0, 'single: linksCount 0')
  check(r.responsiveCount === 0, 'single: responsiveCount 0')
  check(r.contentRate === 100, 'single: contentRate 100')
  check(r.linksRate === 0, 'single: linksRate 0')
  check(r.uniqueVerifiers === 1, 'single: uniqueVerifiers 1')
  check(r.hasAllThreeKinds === false, 'single: hasAllThreeKinds false')
}

// 3. All three kinds present
{
  const r = projectWebsiteReleaseSourceEvidenceBrief(
    pkg([
      evidence({ kind: 'content' }),
      evidence({ kind: 'links' }),
      evidence({ kind: 'responsive' }),
    ]),
  )
  check(r.totalEvidence === 3, 'all3: totalEvidence 3')
  check(r.contentCount === 1, 'all3: contentCount 1')
  check(r.linksCount === 1, 'all3: linksCount 1')
  check(r.responsiveCount === 1, 'all3: responsiveCount 1')
  check(r.hasAllThreeKinds === true, 'all3: hasAllThreeKinds true')
}

// 4. Rate rounding — 1/3 → 33%
{
  const r = projectWebsiteReleaseSourceEvidenceBrief(
    pkg([
      evidence({ kind: 'content' }),
      evidence({ kind: 'links' }),
      evidence({ kind: 'responsive' }),
    ]),
  )
  check(r.contentRate === 33, 'rate: contentRate 33')
  check(r.linksRate === 33, 'rate: linksRate 33')
  check(r.responsiveRate === 33, 'rate: responsiveRate 33')
}

// 5. uniqueVerifiers dedup — same reviewer for multiple items
{
  const r = projectWebsiteReleaseSourceEvidenceBrief(
    pkg([
      evidence({ kind: 'content', verifiedBy: 'reviewer-A' }),
      evidence({ kind: 'links', verifiedBy: 'reviewer-A' }),
      evidence({ kind: 'responsive', verifiedBy: 'reviewer-B' }),
    ]),
  )
  check(r.uniqueVerifiers === 2, 'dedup: uniqueVerifiers 2 (A + B)')
}

// 6. hasAllThreeKinds false when only two kinds present
{
  const r = projectWebsiteReleaseSourceEvidenceBrief(
    pkg([evidence({ kind: 'content' }), evidence({ kind: 'links' })]),
  )
  check(r.hasAllThreeKinds === false, 'two-kinds: hasAllThreeKinds false')
}

// 7. Counts sum to total
{
  const r = projectWebsiteReleaseSourceEvidenceBrief(
    pkg([
      evidence({ kind: 'content' }),
      evidence({ kind: 'content' }),
      evidence({ kind: 'links' }),
      evidence({ kind: 'responsive' }),
    ]),
  )
  check(r.contentCount + r.linksCount + r.responsiveCount === r.totalEvidence, 'invariant: counts sum to total')
}

console.log(JSON.stringify({ ok: true, checks }))
