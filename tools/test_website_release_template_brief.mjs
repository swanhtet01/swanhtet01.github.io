// Website release template brief: templateId, version (v1/v2), componentCount, uniqueComponentIds.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteReleaseTemplateBrief } from './website-release-template-brief.ts'`,
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

const { projectWebsiteReleaseTemplateBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

function pkg({ version = 1, components = [] } = {}) {
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
    template: { templateId: 'TPL-BUSINESS-001', version, components },
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

// 1. v1 template with no components
{
  const r = projectWebsiteReleaseTemplateBrief(pkg({ version: 1, components: [] }))
  check(r.templateId === 'TPL-BUSINESS-001', 'v1: templateId correct')
  check(r.templateVersion === 1, 'v1: version 1')
  check(r.isV1 === true, 'v1: isV1 true')
  check(r.isV2 === false, 'v1: isV2 false')
  check(r.componentCount === 0, 'v1: componentCount 0')
  check(r.uniqueComponentIds === 0, 'v1: uniqueComponentIds 0')
}

// 2. v2 template
{
  const r = projectWebsiteReleaseTemplateBrief(pkg({ version: 2, components: [] }))
  check(r.templateVersion === 2, 'v2: version 2')
  check(r.isV1 === false, 'v2: isV1 false')
  check(r.isV2 === true, 'v2: isV2 true')
}

// 3. isV1 and isV2 are mutually exclusive
{
  const r1 = projectWebsiteReleaseTemplateBrief(pkg({ version: 1 }))
  const r2 = projectWebsiteReleaseTemplateBrief(pkg({ version: 2 }))
  check(r1.isV1 !== r1.isV2, 'exclusive: v1 flags mutually exclusive')
  check(r2.isV1 !== r2.isV2, 'exclusive: v2 flags mutually exclusive')
}

// 4. componentCount
{
  const r = projectWebsiteReleaseTemplateBrief(
    pkg({
      version: 2,
      components: [
        { componentId: 'CMP-HERO', version: 2 },
        { componentId: 'CMP-FOOTER', version: 1 },
        { componentId: 'CMP-NAV', version: 1 },
      ],
    }),
  )
  check(r.componentCount === 3, 'components: componentCount 3')
}

// 5. uniqueComponentIds — no duplicates
{
  const r = projectWebsiteReleaseTemplateBrief(
    pkg({
      version: 2,
      components: [
        { componentId: 'CMP-HERO', version: 1 },
        { componentId: 'CMP-HERO', version: 2 },
        { componentId: 'CMP-FOOTER', version: 1 },
      ],
    }),
  )
  check(r.componentCount === 3, 'dedup: componentCount 3 (all entries)')
  check(r.uniqueComponentIds === 2, 'dedup: uniqueComponentIds 2 (CMP-HERO deduped)')
}

// 6. Single component — uniqueComponentIds = componentCount
{
  const r = projectWebsiteReleaseTemplateBrief(
    pkg({ version: 1, components: [{ componentId: 'CMP-HERO', version: 1 }] }),
  )
  check(r.componentCount === 1, 'single: componentCount 1')
  check(r.uniqueComponentIds === 1, 'single: uniqueComponentIds 1')
}

console.log(JSON.stringify({ ok: true, checks }))
