import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  inspectPostgres17ToolchainProfile,
  inspectPostgres17PublisherPolicy,
  verifyWindowsAuthenticodePublisherEvidence,
  verifyWindowsLoadClosureEvidence,
  verifyPostgres17ToolchainProfile,
  WINDOWS_AUTHENTICODE_METHOD,
  WINDOWS_AUTHENTICODE_OBSERVATION_CONTRACT,
} from './postgres17_toolchain_profile.mjs'

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const roles = [
  'postgres', 'initdb', 'pg_ctl', 'pg_isready', 'pg_dump', 'pg_restore', 'psql',
  'libpq', 'openssl', 'python', 'psycopg',
]
const postgresExecutableRoles = [
  'postgres', 'initdb', 'pg_ctl', 'pg_isready', 'pg_dump', 'pg_restore', 'psql',
]

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'supermega-pg17-profile-'))
  const extractedRoot = join(root, 'postgresql-17.10-test')
  const archivePath = join(root, 'postgresql-17.10-test.zip')
  const manifestPath = join(root, 'profile.json')
  const authenticationEvidence = Buffer.from('synthetic publisher evidence')
  const archiveBytes = Buffer.from('synthetic archive')
  await import('node:fs/promises').then(({ mkdir }) => mkdir(extractedRoot))
  await writeFile(archivePath, archiveBytes)
  await writeFile(join(root, 'publisher-evidence.txt'), authenticationEvidence)
  const bindings = []
  for (const role of roles) {
    const bytes = Buffer.from(`synthetic ${role}`)
    const observedVersion = `${role} synthetic 17.10`
    await writeFile(join(extractedRoot, role), bytes)
    await writeFile(join(extractedRoot, `${role}.version.txt`), observedVersion)
    bindings.push({
      role,
      relativePath: role,
      bytes: bytes.length,
      sha256: sha256(bytes),
      observedVersion,
      versionEvidencePath: `${role}.version.txt`,
      versionEvidenceBytes: Buffer.byteLength(observedVersion),
      versionOutputSha256: sha256(observedVersion),
    })
  }
  const profile = {
    contract: 'supermega.postgres17-toolchain-provenance.v1',
    profileId: 'synthetic-windows-x64-postgresql-17.10',
    status: 'reviewed',
    testOnly: true,
    platform: { os: 'windows', arch: 'x64' },
    postgres: { version: '17.10' },
    archive: {
      fileName: 'postgresql-17.10-test.zip',
      bytes: archiveBytes.length,
      sha256: sha256(archiveBytes),
    },
    extractedRootName: 'postgresql-17.10-test',
    sourceAuthentication: {
      status: 'reviewed',
      method: 'synthetic-test-attestation',
      reference: 'fixture://publisher',
      evidencePath: 'publisher-evidence.txt',
      evidenceBytes: authenticationEvidence.length,
      evidenceSha256: sha256(authenticationEvidence),
    },
    loadClosureComplete: true,
    artifacts: bindings.slice(0, 5),
    dependencies: bindings.slice(5),
    approval: {
      status: 'reviewed',
      reviewedBy: 'synthetic-reviewer',
      reviewedAt: '2026-10-29T00:00:00.000Z',
    },
  }
  await writeFile(manifestPath, `${JSON.stringify(profile, null, 2)}\n`)
  return { root, extractedRoot, archivePath, manifestPath, profile }
}

async function authenticodeFixture() {
  const input = await fixture()
  const archivePath = join(input.root, 'postgresql-17.10-test-installer.exe')
  const evidencePath = join(input.root, 'publisher-authenticode.json')
  const closurePath = join(input.root, 'load-closure.json')
  const policyPath = join(input.root, 'publisher-policy.json')
  const archiveBytes = Buffer.from('synthetic signed installer bytes')
  const signer = {
    certificateSha256: sha256('synthetic signer certificate'),
    subject: 'CN=Synthetic PostgreSQL Publisher',
    issuer: 'CN=Synthetic Test Code Signing CA',
  }
  const observation = {
    contract: WINDOWS_AUTHENTICODE_OBSERVATION_CONTRACT,
    signatureStatus: 'Valid',
    signatureType: 'Authenticode',
    artifactFileName: 'postgresql-17.10-test-installer.exe',
    artifactBytes: archiveBytes.length,
    artifactSha256: sha256(archiveBytes),
    signerCertificateSha256: signer.certificateSha256,
    signerSubject: signer.subject,
    signerIssuer: signer.issuer,
    timestampCertificateSha256: sha256('synthetic timestamp certificate'),
    timestampSubject: 'CN=Synthetic Timestamp Authority',
    ekuOids: ['1.3.6.1.5.5.7.3.3'],
  }
  const evidenceBytes = Buffer.from(`${JSON.stringify(observation, null, 2)}\n`)
  const policy = {
    contract: 'supermega.postgres17-publisher-policy.v1',
    policyId: 'synthetic-postgresql-publisher-policy',
    status: 'reviewed',
    testOnly: false,
    method: WINDOWS_AUTHENTICODE_METHOD,
    platform: { os: 'windows', arch: 'x64' },
    requiredSignatureType: 'Authenticode',
    timestampRequired: true,
    requiredEkuOids: ['1.3.6.1.5.5.7.3.3'],
    approvedSigners: [signer],
    approval: {
      status: 'reviewed',
      reviewedBy: 'synthetic-independent-reviewer',
      reviewedAt: '2026-10-31T00:00:00.000Z',
    },
  }
  await writeFile(archivePath, archiveBytes)
  await writeFile(evidencePath, evidenceBytes)
  await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`)
  input.profile.testOnly = false
  input.profile.archive = {
    fileName: 'postgresql-17.10-test-installer.exe',
    bytes: archiveBytes.length,
    sha256: sha256(archiveBytes),
  }
  for (const binding of [...input.profile.artifacts, ...input.profile.dependencies]) {
    binding.sourceArtifactSha256 = input.profile.archive.sha256
  }
  const closureEvidence = {
    contract: 'supermega.windows-load-closure.v1',
    sourceArtifactSha256: input.profile.archive.sha256,
    captureMethod: 'windows-loaded-module-capture-v1',
    systemModulePolicy: 'windows-system32-os-component-v1',
    unexpectedNonSystemModules: 0,
    files: [...input.profile.artifacts, ...input.profile.dependencies].map(
      ({ relativePath, bytes, sha256: digest }) => ({ relativePath, bytes, sha256: digest }),
    ),
  }
  const closureBytes = Buffer.from(`${JSON.stringify(closureEvidence, null, 2)}\n`)
  await writeFile(closurePath, closureBytes)
  input.profile.sourceAuthentication = {
    status: 'reviewed',
    method: WINDOWS_AUTHENTICODE_METHOD,
    reference: 'https://example.invalid/official-installer',
    policyId: policy.policyId,
    evidencePath: 'publisher-authenticode.json',
    evidenceBytes: evidenceBytes.length,
    evidenceSha256: sha256(evidenceBytes),
  }
  input.profile.loadClosure = {
    status: 'reviewed',
    captureMethod: 'windows-loaded-module-capture-v1',
    evidencePath: 'load-closure.json',
    evidenceBytes: closureBytes.length,
    evidenceSha256: sha256(closureBytes),
    unexpectedNonSystemModules: 0,
    systemModulePolicy: 'windows-system32-os-component-v1',
  }
  input.profile.materialization = {
    status: 'reviewed',
    method: 'deterministic-read-only-extraction-v1',
    evidencePath: 'materialization.json',
    evidenceBytes: 1,
    evidenceSha256: sha256('x'),
  }
  await writeFile(input.manifestPath, `${JSON.stringify(input.profile, null, 2)}\n`)
  return {
    ...input, archivePath, evidencePath, policyPath, policy, observation, closureEvidence,
  }
}

test('pending source-controlled profile states every unresolved trust boundary', async () => {
  const profile = JSON.parse(await readFile(
    new URL('../hq/research/postgres17-toolchain-profile.json', import.meta.url),
    'utf8',
  ))
  const result = inspectPostgres17ToolchainProfile(profile)
  assert.equal(result.ready, false)
  assert.ok(result.blockers.includes('profile_not_reviewed'))
  assert.ok(result.blockers.includes('load_closure_incomplete'))
  assert.ok(result.blockers.includes('publisher_authentication_unverified'))
  assert.ok(result.blockers.includes('independent_approval_missing'))
  assert.ok(result.blockers.includes('binding_missing:postgres'))
})

test('pending publisher policy cannot authenticate a production source', async () => {
  const policy = JSON.parse(await readFile(
    new URL('../hq/research/postgres17-publisher-policy.json', import.meta.url),
    'utf8',
  ))
  const result = inspectPostgres17PublisherPolicy(policy)
  assert.equal(result.ready, false)
  assert.ok(result.blockers.includes('publisher_policy_not_reviewed'))
  assert.ok(result.blockers.includes('publisher_signer_not_pinned'))
  assert.ok(result.blockers.includes('publisher_policy_independent_approval_missing'))
})

test('tracked Windows inspector is fail-closed around the embedded signature and bytes', async () => {
  const source = await readFile(
    new URL('./inspect_windows_authenticode.ps1', import.meta.url),
    'utf8',
  )
  for (const required of [
    'Get-Item -LiteralPath',
    '[IO.FileAttributes]::ReparsePoint',
    'Get-FileHash -LiteralPath',
    'Get-AuthenticodeSignature -LiteralPath',
    'SignatureType',
    'TimeStamperCertificate',
    'artifact_changed_during_inspection',
  ]) assert.ok(source.includes(required), required)
  assert.equal(source.includes('Invoke-WebRequest'), false)
  assert.equal(source.includes('Start-Process'), false)
})

test('reviewed Authenticode policy verifies the exact signed source artifact', async () => {
  const input = await authenticodeFixture()
  try {
    const result = verifyWindowsAuthenticodePublisherEvidence({
      profile: input.profile,
      policy: input.policy,
      evidence: input.observation,
      observed: structuredClone(input.observation),
    })
    assert.equal(result.policyId, input.policy.policyId)
    assert.equal(
      result.signerCertificateSha256,
      input.observation.signerCertificateSha256,
    )
    assert.equal(
      result.sourceArtifactSha256,
      input.observation.artifactSha256,
    )
  } finally {
    await rm(input.root, { recursive: true, force: true })
  }
})

test('missing Authenticode signature fails closed', async () => {
  const input = await authenticodeFixture()
  try {
    assert.throws(
      () => verifyWindowsAuthenticodePublisherEvidence({
        profile: input.profile,
        policy: input.policy,
        evidence: input.observation,
        observed: {
          ...input.observation,
          signatureStatus: 'NotSigned',
          signerCertificateSha256: null,
        },
      }),
      /database_rehearsal_authenticode_observation_mismatch/,
    )
  } finally {
    await rm(input.root, { recursive: true, force: true })
  }
})

test('wrong Authenticode signer fails closed', async () => {
  const input = await authenticodeFixture()
  try {
    const wrongSigner = {
      ...input.observation,
      signerCertificateSha256: sha256('wrong signer certificate'),
    }
    assert.throws(
      () => verifyWindowsAuthenticodePublisherEvidence({
        profile: input.profile,
        policy: input.policy,
        evidence: wrongSigner,
        observed: wrongSigner,
      }),
      /database_rehearsal_authenticode_signer_unapproved/,
    )
  } finally {
    await rm(input.root, { recursive: true, force: true })
  }
})

test('signed source artifact digest mismatch fails before signature acceptance', async () => {
  const input = await authenticodeFixture()
  try {
    assert.throws(
      () => verifyWindowsAuthenticodePublisherEvidence({
        profile: input.profile,
        policy: input.policy,
        evidence: input.observation,
        observed: { ...input.observation, artifactSha256: sha256('different bytes') },
      }),
      /database_rehearsal_authenticode_observation_mismatch/,
    )
  } finally {
    await rm(input.root, { recursive: true, force: true })
  }
})

test('incomplete load closure blocks Authenticode-authenticated profile', async () => {
  const input = await authenticodeFixture()
  try {
    input.profile.loadClosureComplete = false
    assert.ok(inspectPostgres17ToolchainProfile(input.profile).blockers.includes(
      'load_closure_incomplete',
    ))
  } finally {
    await rm(input.root, { recursive: true, force: true })
  }
})

test('load closure must exactly reconcile every bound non-system file', async () => {
  const input = await authenticodeFixture()
  try {
    assert.equal(
      verifyWindowsLoadClosureEvidence(input.profile, input.closureEvidence).fileCount,
      roles.length,
    )
    const incomplete = structuredClone(input.closureEvidence)
    incomplete.files.pop()
    assert.throws(
      () => verifyWindowsLoadClosureEvidence(input.profile, incomplete),
      /database_rehearsal_load_closure_incomplete/,
    )
  } finally {
    await rm(input.root, { recursive: true, force: true })
  }
})

test('unauthenticated source metadata cannot substitute for Authenticode', async () => {
  const input = await authenticodeFixture()
  try {
    input.profile.sourceAuthentication.method = 'publisher-url-and-checksum'
    assert.ok(inspectPostgres17ToolchainProfile(input.profile).blockers.includes(
      'publisher_authentication_verifier_unavailable',
    ))
  } finally {
    await rm(input.root, { recursive: true, force: true })
  }
})

test('a signed sibling installer cannot authenticate an unsigned ZIP materialization root', async () => {
  const input = await authenticodeFixture()
  try {
    input.profile.archive.fileName = 'postgresql-17.10-test.zip'
    assert.ok(inspectPostgres17ToolchainProfile(input.profile).blockers.includes(
      'publisher_authentication_unverified',
    ))
  } finally {
    await rm(input.root, { recursive: true, force: true })
  }
})

test('required trusted timestamp cannot be omitted', async () => {
  const input = await authenticodeFixture()
  try {
    assert.throws(
      () => verifyWindowsAuthenticodePublisherEvidence({
        profile: input.profile,
        policy: input.policy,
        evidence: input.observation,
        observed: {
          ...input.observation,
          timestampCertificateSha256: null,
          timestampSubject: null,
        },
      }),
      /database_rehearsal_authenticode_observation_mismatch/,
    )
  } finally {
    await rm(input.root, { recursive: true, force: true })
  }
})

test('production verifier cannot bypass the unavailable materialization verifier', async () => {
  const input = await authenticodeFixture()
  try {
    await assert.rejects(
      verifyPostgres17ToolchainProfile({
        manifestPath: input.manifestPath,
        archivePath: input.archivePath,
        extractedRoot: input.extractedRoot,
      }),
      /database_rehearsal_toolchain_provenance_unapproved/,
    )
  } finally {
    await rm(input.root, { recursive: true, force: true })
  }
})

test('synthetic complete profile verifies exact archive, files, versions, and closure', async () => {
  const input = await fixture()
  try {
    const result = await verifyPostgres17ToolchainProfile({
      manifestPath: input.manifestPath,
      archivePath: input.archivePath,
      extractedRoot: input.extractedRoot,
      allowSynthetic: true,
    })
    assert.equal(result.ready, true)
    assert.equal(result.bindingCount, roles.length)
    assert.equal(
      result.sourceAuthenticationEvidenceSha256,
      sha256(Buffer.from('synthetic publisher evidence')),
    )
  } finally {
    await rm(input.root, { recursive: true, force: true })
  }
})

test('synthetic authority is rejected by the production verifier', async () => {
  const input = await fixture()
  try {
    await assert.rejects(
      verifyPostgres17ToolchainProfile({
        manifestPath: input.manifestPath,
        archivePath: input.archivePath,
        extractedRoot: input.extractedRoot,
      }),
      /database_rehearsal_toolchain_provenance_unapproved/,
    )
  } finally {
    await rm(input.root, { recursive: true, force: true })
  }
})

test('self-asserted production authentication cannot promote a profile', async () => {
  const input = await fixture()
  try {
    input.profile.testOnly = false
    input.profile.sourceAuthentication.method = 'self-authored-checksum'
    await writeFile(input.manifestPath, `${JSON.stringify(input.profile, null, 2)}\n`)
    assert.ok(inspectPostgres17ToolchainProfile(input.profile).blockers.includes(
      'publisher_authentication_verifier_unavailable',
    ))
    await assert.rejects(
      verifyPostgres17ToolchainProfile({
        manifestPath: input.manifestPath,
        archivePath: input.archivePath,
        extractedRoot: input.extractedRoot,
      }),
      /database_rehearsal_toolchain_provenance_unapproved/,
    )
  } finally {
    await rm(input.root, { recursive: true, force: true })
  }
})

test('an extracted root cannot be relabeled to a different profile directory', async () => {
  const input = await fixture()
  try {
    await assert.rejects(
      verifyPostgres17ToolchainProfile({
        manifestPath: input.manifestPath,
        archivePath: input.archivePath,
        extractedRoot: input.root,
        allowSynthetic: true,
      }),
      /database_rehearsal_toolchain_profile_root_mismatch/,
    )
  } finally {
    await rm(input.root, { recursive: true, force: true })
  }
})

test('an expected-name directory symlink cannot relabel another extraction root', async () => {
  const input = await fixture()
  const alternate = join(input.root, 'alternate-root')
  try {
    await mkdir(alternate)
    await rm(input.extractedRoot, { recursive: true })
    await symlink(alternate, input.extractedRoot, 'dir')
    await assert.rejects(
      verifyPostgres17ToolchainProfile({
        manifestPath: input.manifestPath,
        archivePath: input.archivePath,
        extractedRoot: input.extractedRoot,
        allowSynthetic: true,
      }),
      /database_rehearsal_toolchain_profile_root_mismatch/,
    )
  } finally {
    await rm(input.root, { recursive: true, force: true })
  }
})

test('tampered extracted dependency fails closed', async () => {
  const input = await fixture()
  try {
    await writeFile(join(input.extractedRoot, 'openssl'), 'tampered')
    await assert.rejects(
      verifyPostgres17ToolchainProfile({
        manifestPath: input.manifestPath,
        archivePath: input.archivePath,
        extractedRoot: input.extractedRoot,
        allowSynthetic: true,
      }),
      /database_rehearsal_toolchain_profile_file_mismatch/,
    )
  } finally {
    await rm(input.root, { recursive: true, force: true })
  }
})

test('missing dependency closure binding cannot be reviewed ready', async () => {
  const input = await fixture()
  try {
    input.profile.dependencies = input.profile.dependencies.filter(
      ({ role }) => role !== 'psycopg',
    )
    await writeFile(input.manifestPath, `${JSON.stringify(input.profile, null, 2)}\n`)
    assert.ok(inspectPostgres17ToolchainProfile(input.profile).blockers.includes(
      'binding_missing:psycopg',
    ))
    await assert.rejects(
      verifyPostgres17ToolchainProfile({
        manifestPath: input.manifestPath,
        archivePath: input.archivePath,
        extractedRoot: input.extractedRoot,
        allowSynthetic: true,
      }),
      /database_rehearsal_toolchain_provenance_unapproved/,
    )
  } finally {
    await rm(input.root, { recursive: true, force: true })
  }
})

test('parent path substitution is rejected before filesystem inspection', async () => {
  const input = await fixture()
  try {
    input.profile.dependencies[0].relativePath = '../outside-openssl'
    assert.throws(
      () => inspectPostgres17ToolchainProfile(input.profile),
      /database_rehearsal_toolchain_profile_binding_invalid/,
    )
  } finally {
    await rm(input.root, { recursive: true, force: true })
  }
})

test('swapped PostgreSQL executables fail their exact byte bindings', async () => {
  const input = await fixture()
  try {
    const postgresPath = join(input.extractedRoot, 'postgres')
    const pgCtlPath = join(input.extractedRoot, 'pg_ctl')
    const postgresBytes = await readFile(postgresPath)
    const pgCtlBytes = await readFile(pgCtlPath)
    await writeFile(postgresPath, pgCtlBytes)
    await writeFile(pgCtlPath, postgresBytes)
    await assert.rejects(
      verifyPostgres17ToolchainProfile({
        manifestPath: input.manifestPath,
        archivePath: input.archivePath,
        extractedRoot: input.extractedRoot,
        allowSynthetic: true,
      }),
      /database_rehearsal_toolchain_profile_file_mismatch/,
    )
  } finally {
    await rm(input.root, { recursive: true, force: true })
  }
})

test('every executed PostgreSQL program must share the exact verified bin directory', async () => {
  const input = await fixture()
  try {
    const binding = input.profile.artifacts.find(({ role }) => role === 'pg_ctl')
    await mkdir(join(input.extractedRoot, 'other'))
    await writeFile(join(input.extractedRoot, 'other', 'pg_ctl'), 'synthetic pg_ctl')
    binding.relativePath = 'other/pg_ctl'
    await writeFile(input.manifestPath, `${JSON.stringify(input.profile, null, 2)}\n`)
    await assert.rejects(
      verifyPostgres17ToolchainProfile({
        manifestPath: input.manifestPath,
        archivePath: input.archivePath,
        extractedRoot: input.extractedRoot,
        allowSynthetic: true,
      }),
      /database_rehearsal_toolchain_postgres_bin_incomplete/,
    )
  } finally {
    await rm(input.root, { recursive: true, force: true })
  }
})

test('tampered archive and authentication evidence fail closed', async () => {
  const input = await fixture()
  try {
    await writeFile(input.archivePath, 'changed archive')
    await assert.rejects(
      verifyPostgres17ToolchainProfile({
        manifestPath: input.manifestPath,
        archivePath: input.archivePath,
        extractedRoot: input.extractedRoot,
        allowSynthetic: true,
      }),
      /database_rehearsal_toolchain_profile_file_mismatch/,
    )
    await writeFile(input.archivePath, 'synthetic archive')
    await writeFile(join(input.root, 'publisher-evidence.txt'), 'changed evidence')
    await assert.rejects(
      verifyPostgres17ToolchainProfile({
        manifestPath: input.manifestPath,
        archivePath: input.archivePath,
        extractedRoot: input.extractedRoot,
        allowSynthetic: true,
      }),
      /database_rehearsal_toolchain_profile_file_mismatch/,
    )
  } finally {
    await rm(input.root, { recursive: true, force: true })
  }
})

test('changed version evidence cannot be re-labelled without a new binding', async () => {
  const input = await fixture()
  try {
    input.profile.dependencies.find(({ role }) => role === 'openssl').observedVersion = 'relabeled version'
    await writeFile(input.manifestPath, `${JSON.stringify(input.profile, null, 2)}\n`)
    await assert.rejects(
      verifyPostgres17ToolchainProfile({
        manifestPath: input.manifestPath,
        archivePath: input.archivePath,
        extractedRoot: input.extractedRoot,
        allowSynthetic: true,
      }),
      /database_rehearsal_toolchain_profile_version_evidence_mismatch/,
    )
  } finally {
    await rm(input.root, { recursive: true, force: true })
  }
})

test('self-consistent wrong version evidence fails every PostgreSQL executable role', async (context) => {
  for (const role of postgresExecutableRoles) {
    await context.test(role, async () => {
      const input = await fixture()
      try {
        const binding = [...input.profile.artifacts, ...input.profile.dependencies]
          .find((candidate) => candidate.role === role)
        const observedVersion = `${role} synthetic 16.9`
        await writeFile(join(input.extractedRoot, binding.versionEvidencePath), observedVersion)
        binding.observedVersion = observedVersion
        binding.versionEvidenceBytes = Buffer.byteLength(observedVersion)
        binding.versionOutputSha256 = sha256(observedVersion)
        await writeFile(input.manifestPath, `${JSON.stringify(input.profile, null, 2)}\n`)
        assert.ok(inspectPostgres17ToolchainProfile(input.profile).blockers.includes(
          `postgres_version_mismatch:${role}`,
        ))
        await assert.rejects(
          verifyPostgres17ToolchainProfile({
            manifestPath: input.manifestPath,
            archivePath: input.archivePath,
            extractedRoot: input.extractedRoot,
            allowSynthetic: true,
          }),
          /database_rehearsal_toolchain_provenance_unapproved/,
        )
      } finally {
        await rm(input.root, { recursive: true, force: true })
      }
    })
  }
})

test('package revision accepts exact upstream PostgreSQL version but not a numeric superstring', async () => {
  const input = await fixture()
  try {
    input.profile.postgres.version = '17.10-2'
    await writeFile(input.manifestPath, `${JSON.stringify(input.profile, null, 2)}\n`)
    const accepted = await verifyPostgres17ToolchainProfile({
      manifestPath: input.manifestPath,
      archivePath: input.archivePath,
      extractedRoot: input.extractedRoot,
      allowSynthetic: true,
    })
    assert.equal(accepted.ready, true)

    const binding = input.profile.artifacts.find(({ role }) => role === 'postgres')
    const observedVersion = 'postgres synthetic 117.10'
    await writeFile(join(input.extractedRoot, binding.versionEvidencePath), observedVersion)
    binding.observedVersion = observedVersion
    binding.versionEvidenceBytes = Buffer.byteLength(observedVersion)
    binding.versionOutputSha256 = sha256(observedVersion)
    assert.ok(inspectPostgres17ToolchainProfile(input.profile).blockers.includes(
      'postgres_version_mismatch:postgres',
    ))
  } finally {
    await rm(input.root, { recursive: true, force: true })
  }
})

test('symlinked extracted executable fails closed', async () => {
  const input = await fixture()
  try {
    const outside = join(input.root, 'outside-postgres')
    await writeFile(outside, 'outside')
    await rm(join(input.extractedRoot, 'postgres'))
    await symlink(outside, join(input.extractedRoot, 'postgres'))
    await assert.rejects(
      verifyPostgres17ToolchainProfile({
        manifestPath: input.manifestPath,
        archivePath: input.archivePath,
        extractedRoot: input.extractedRoot,
        allowSynthetic: true,
      }),
      /database_rehearsal_toolchain_profile_file_invalid/,
    )
  } finally {
    await rm(input.root, { recursive: true, force: true })
  }
})
