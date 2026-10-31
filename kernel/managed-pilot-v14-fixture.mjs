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
    profileId: 'synthetic-managed-pilot-v14-profile',
    archiveFileName: 'synthetic-postgresql-17-installer.exe',
    manifestSha256: '1'.repeat(64),
    policyId: 'synthetic-managed-pilot-v14-policy',
    policySha256: '2'.repeat(64),
    sourceArtifactSha256: fixture.engine.observedArchiveSha256,
    signerCertificateSha256: '3'.repeat(64),
    timestampCertificateSha256: '4'.repeat(64),
    sourceAuthenticationEvidenceSha256: '5'.repeat(64),
    loadClosureEvidenceSha256: '6'.repeat(64),
    materializationEvidenceSha256: '7'.repeat(64),
    materializationInventorySha256: '8'.repeat(64),
    executionBundleSha256: '9'.repeat(64),
  }
  const pythonAuthority = {
    contract: 'supermega.postgres17-python-authority.v1',
    authoritative: true,
    independently_verified: true,
    execution_locked: true,
    session_id: 'a'.repeat(32),
    request_digest: 'b'.repeat(64),
    source_artifact_sha256: toolchain.sourceArtifactSha256,
    execution_bundle_sha256: toolchain.executionBundleSha256,
    verification_digest: '',
  }
  pythonAuthority.verification_digest = createHash('sha256').update(JSON.stringify(
    Object.fromEntries(Object.entries(pythonAuthority)
      .filter(([key]) => key !== 'verification_digest')
      .sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)))),
  )).digest('hex')
  fixture.engine = {
    ...fixture.engine,
    archive: toolchain.archiveFileName,
    toolchain,
    pythonAuthority,
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
