import { createHash } from 'node:crypto'
import { implementationPaths, proofDigest } from './database-rehearsal-evidence.mjs'

const correctionMigration = '20261024090000_private_trial_backend_v14_shop_correction_consumption.sql'
const correctionChecks = [
  'shopCorrectionTablesAndForcedRlsValidated',
  'shopCorrectionConstraintsAndIndexesValidated',
  'shopCorrectionTriggersAndFunctionsValidated',
  'shopCorrectionPoliciesAndAclValidated',
  'shopCorrectionCatalogPreservedAfterRestore',
]

// Unit-only v14 fixture. It is never written as operational evidence and is
// never a substitute for the required exact-source PostgreSQL 17 rehearsal.
export function unitV14DatabaseFixture(historicalV13DatabaseFixture) {
  const fixture = structuredClone(historicalV13DatabaseFixture)
  const toolchain = {
    contract: 'supermega.postgres17-toolchain-receipt-evidence.v1',
    profileId: 'synthetic-managed-pilot-v14-profile',
    archiveFileName: 'synthetic-postgresql-17-installer.exe',
    archiveBytes: 333_927_270,
    sourceArtifactSha256: fixture.engine.observedArchiveSha256,
    manifestSha256: '1'.repeat(64),
    policySha256: '2'.repeat(64),
    sourceDigest: '3'.repeat(64),
    bindingDigest: '4'.repeat(64),
    loadClosureEvidenceSha256: '6'.repeat(64),
    executionBundleSha256: '4'.repeat(64),
    sourceAuthentication: [{
      sourceId: 'synthetic-postgresql',
      sourceArtifactSha256: fixture.engine.observedArchiveSha256,
      evidenceSha256: '5'.repeat(64),
    }],
    trustedBoundary: 'isolated-single-purpose-windows-x64-v1',
  }
  fixture.engine = {
    ...fixture.engine,
    archive: toolchain.archiveFileName,
    toolchain,
  }
  fixture.migration = {
    ...fixture.migration,
    count: fixture.migration.names.length + 1,
    schemaVersion: 14,
    names: [...fixture.migration.names, correctionMigration],
    schemaProfile: 'v14-shop-correction',
    catalogContract: 'supermega_private_trial_database_v14_shop_correction_v1',
  }
  fixture.recovery.restoredSchemaVersion = 14
  for (const name of correctionChecks) fixture.checks[name] = true
  const digest = `sha256:${'a'.repeat(64)}`
  fixture.implementation = { digest, paths: [...implementationPaths], expectedToolchain: toolchain }
  fixture.implementationDigest = digest
  fixture.implementationFileCount = implementationPaths.length
  fixture.recordedAt = '2026-07-31T10:00:00.000Z'
  fixture.receiptDigest = proofDigest(fixture)
  return fixture
}
