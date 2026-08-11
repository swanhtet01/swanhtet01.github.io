// Website release migration brief: hasMigration, isFirstRelease, hasChain, operationCount, fromTemplateVersion, toTemplateVersion.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteReleaseMigrationBrief } from './website-release-migration-brief.ts'`,
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

const { projectWebsiteReleaseMigrationBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

function migration({ operations = [], fromPackageDigest = 'prev-digest' } = {}) {
  return {
    migrationId: 'MIG-001',
    fromPackageDigest,
    fromTemplateVersion: 1,
    toTemplateVersion: 2,
    operations,
    preserved: { source: 'yes', brand: 'yes', locales: 'yes', media: 'yes', roles: 'yes' },
  }
}

function pkg({ previousPackageDigest = null, migrationRecord = null } = {}) {
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
    media: [],
    roles: [],
    previousPackageDigest,
    migration: migrationRecord,
    packageDigest: 'pkg-digest-1',
  }
}

// 1. First release — no migration, no previous digest
{
  const r = projectWebsiteReleaseMigrationBrief(pkg({ previousPackageDigest: null, migrationRecord: null }))
  check(r.hasMigration === false, 'first: hasMigration false')
  check(r.isFirstRelease === true, 'first: isFirstRelease true')
  check(r.hasChain === false, 'first: hasChain false')
  check(r.operationCount === 0, 'first: operationCount 0')
  check(r.fromTemplateVersion === null, 'first: fromTemplateVersion null')
  check(r.toTemplateVersion === null, 'first: toTemplateVersion null')
}

// 2. Chain without migration — previous digest present, no migration record
{
  const r = projectWebsiteReleaseMigrationBrief(
    pkg({ previousPackageDigest: 'prev-digest-xyz', migrationRecord: null }),
  )
  check(r.hasMigration === false, 'chain-no-mig: hasMigration false')
  check(r.isFirstRelease === false, 'chain-no-mig: isFirstRelease false')
  check(r.hasChain === true, 'chain-no-mig: hasChain true')
  check(r.operationCount === 0, 'chain-no-mig: operationCount 0')
}

// 3. Migration present — with operations
{
  const r = projectWebsiteReleaseMigrationBrief(
    pkg({
      previousPackageDigest: 'prev-abc',
      migrationRecord: migration({ operations: ['migrate_hero', 'migrate_footer', 'migrate_nav'] }),
    }),
  )
  check(r.hasMigration === true, 'mig: hasMigration true')
  check(r.isFirstRelease === false, 'mig: isFirstRelease false')
  check(r.hasChain === true, 'mig: hasChain true')
  check(r.operationCount === 3, 'mig: operationCount 3')
  check(r.fromTemplateVersion === 1, 'mig: fromTemplateVersion 1')
  check(r.toTemplateVersion === 2, 'mig: toTemplateVersion 2')
}

// 4. Migration with zero operations
{
  const r = projectWebsiteReleaseMigrationBrief(
    pkg({
      previousPackageDigest: 'prev-def',
      migrationRecord: migration({ operations: [] }),
    }),
  )
  check(r.hasMigration === true, 'zero-ops: hasMigration true')
  check(r.operationCount === 0, 'zero-ops: operationCount 0')
}

// 5. isFirstRelease and hasChain are mutually exclusive
{
  const first = projectWebsiteReleaseMigrationBrief(pkg({ previousPackageDigest: null }))
  const chained = projectWebsiteReleaseMigrationBrief(pkg({ previousPackageDigest: 'prev-digest' }))
  check(first.isFirstRelease && !first.hasChain, 'exclusive: first release is not chained')
  check(!chained.isFirstRelease && chained.hasChain, 'exclusive: chained is not first release')
}

console.log(JSON.stringify({ ok: true, checks }))
