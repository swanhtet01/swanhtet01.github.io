import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  inspectPostgres17PublisherPolicy,
  inspectPostgres17ToolchainProfile,
  sourceControlledToolchainReceiptEvidence,
  toolchainReceiptEvidence,
  verifyPostgres17ToolchainProfile,
  verifyWindowsAuthenticodePublisherEvidence,
  verifyWindowsLoadClosureEvidence,
  WINDOWS_AUTHENTICODE_METHOD,
  WINDOWS_AUTHENTICODE_OBSERVATION_CONTRACT,
} from './postgres17_toolchain_profile.mjs'

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const roles = [
  'postgres', 'initdb', 'pg_ctl', 'pg_isready', 'pg_dump', 'pg_restore', 'psql',
  'libpq', 'openssl', 'python', 'psycopg',
  'node', 'git',
]
const sourceByRole = (role) => {
  if (role === 'python') return 'python-source'
  if (role === 'psycopg') return 'psycopg-source'
  if (role === 'openssl') return 'openssl-source'
  if (role === 'node') return 'node-source'
  if (role === 'git') return 'git-source'
  return 'postgresql-source'
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'supermega-pg17-profile-v2-'))
  const runtimeRoot = join(root, 'runtime')
  const manifestPath = join(root, 'profile.json')
  await mkdir(runtimeRoot)
  const sources = []
  const sourcePaths = {}
  for (const [sourceId, component] of [
    ['postgresql-source', 'postgresql'], ['python-source', 'python'],
    ['psycopg-source', 'psycopg'], ['openssl-source', 'openssl'],
    ['node-source', 'node'], ['git-source', 'git'],
  ]) {
    const fileName = `${sourceId}.bin`
    const artifact = Buffer.from(`artifact:${sourceId}`)
    const artifactPath = join(root, fileName)
    const evidence = {
      contract: 'supermega.reviewed-source-digest.v1', status: 'reviewed', sourceId,
      artifactBytes: artifact.length, artifactSha256: sha256(artifact),
    }
    const evidenceBytes = Buffer.from(`${JSON.stringify(evidence)}\n`)
    const evidencePath = `${sourceId}.evidence.json`
    await writeFile(artifactPath, artifact)
    await writeFile(join(root, evidencePath), evidenceBytes)
    sourcePaths[sourceId] = artifactPath
    sources.push({
      sourceId, component, fileName, bytes: artifact.length, sha256: sha256(artifact),
      authentication: {
        status: 'reviewed', method: 'reviewed-source-digest-v1',
        reference: `fixture://${sourceId}`, evidencePath,
        evidenceBytes: evidenceBytes.length, evidenceSha256: sha256(evidenceBytes),
      },
    })
  }
  const bindings = []
  for (const role of roles) {
    const bindingId = `${role}-binding`
    const bytes = Buffer.from(`runtime:${role}`)
    const observedVersion = `${role} synthetic 17.11`
    const relativePath = `bin/${role}`
    const versionEvidencePath = `versions/${role}.txt`
    await mkdir(join(runtimeRoot, 'bin'), { recursive: true })
    await mkdir(join(runtimeRoot, 'versions'), { recursive: true })
    await writeFile(join(runtimeRoot, relativePath), bytes)
    await writeFile(join(runtimeRoot, versionEvidencePath), observedVersion)
    bindings.push({
      bindingId, role, sourceId: sourceByRole(role), relativePath,
      bytes: bytes.length, sha256: sha256(bytes), observedVersion,
      versionEvidencePath, versionEvidenceBytes: Buffer.byteLength(observedVersion),
      versionOutputSha256: sha256(observedVersion),
      uses: role === 'psycopg' ? ['imported'] : role === 'libpq' ? ['loaded'] : ['executed'],
    })
  }
  const closure = {
    contract: 'supermega.windows-load-closure.v2',
    captureMethod: 'windows-process-tree-runtime-closure-v1',
    systemModulePolicy: 'windows-system32-os-component-v1',
    unexpectedNonSystemModules: 0,
    files: bindings.map(({ bindingId, sourceId, relativePath, bytes, sha256: digest, uses }) =>
      ({ bindingId, sourceId, relativePath, bytes, sha256: digest, uses })),
  }
  const closureBytes = Buffer.from(`${JSON.stringify(closure)}\n`)
  await writeFile(join(root, 'closure.json'), closureBytes)
  const profile = {
    contract: 'supermega.postgres17-toolchain-provenance.v2',
    profileId: 'synthetic-windows-x64-postgresql-17.11', status: 'reviewed', testOnly: true,
    platform: { os: 'windows', arch: 'x64' }, postgres: { version: '17.11-5' },
    runtimeRootName: 'runtime',
    trustedBoundary: {
      method: 'isolated-single-purpose-windows-x64-v1', singlePurpose: true,
      concurrentSameUserWorkloadsAllowed: false, interactiveUsersAllowed: false,
      hostileSameUserMutationInScope: false,
    },
    sources, bindings, loadClosureComplete: true,
    loadClosure: {
      status: 'reviewed', captureMethod: 'windows-process-tree-runtime-closure-v1',
      evidencePath: 'closure.json', evidenceBytes: closureBytes.length,
      evidenceSha256: sha256(closureBytes), unexpectedNonSystemModules: 0,
      systemModulePolicy: 'windows-system32-os-component-v1',
    },
    approval: { status: 'reviewed', reviewedBy: 'fixture-reviewer', reviewedAt: '2026-10-31T00:00:00.000Z' },
  }
  const policyPath = join(root, 'policy.json')
  await writeFile(policyPath, `${JSON.stringify({
    contract: 'supermega.postgres17-publisher-policy.v1', policyId: 'fixture-policy',
    status: 'reviewed', testOnly: false, method: WINDOWS_AUTHENTICODE_METHOD,
    platform: { os: 'windows', arch: 'x64' }, requiredSignatureType: 'Authenticode',
    timestampRequired: true, requiredEkuOids: ['1.3.6.1.5.5.7.3.3'],
    approvedSigners: [{ certificateSha256: sha256('fixture-cert'),
      subject: 'CN=Fixture', issuer: 'CN=Fixture CA' }],
    approvedTimestampCertificateSha256: [sha256('fixture-timestamp')],
    approval: { status: 'reviewed', reviewedBy: 'fixture-reviewer', reviewedAt: '2026-10-31T00:00:00Z' },
  })}\n`)
  await writeFile(manifestPath, `${JSON.stringify(profile, null, 2)}\n`)
  return { root, runtimeRoot, manifestPath, policyPath, sourcePaths, profile, closure }
}

function authenticodeFixture() {
  const signer = {
    certificateSha256: sha256('signer'), subject: 'CN=EnterpriseDB Corporation',
    issuer: 'CN=DigiCert Test Issuer',
  }
  const source = {
    sourceId: 'edb', component: 'postgresql', fileName: 'postgresql.exe', bytes: 5,
    sha256: sha256('bytes'), authentication: {
      status: 'reviewed', method: WINDOWS_AUTHENTICODE_METHOD, reference: 'fixture://edb',
      policyId: 'edb-policy', evidencePath: 'edb.json', evidenceBytes: 1,
      evidenceSha256: sha256('evidence'),
    },
  }
  const observation = {
    contract: WINDOWS_AUTHENTICODE_OBSERVATION_CONTRACT, signatureStatus: 'Valid',
    signatureType: 'Authenticode', artifactFileName: source.fileName,
    artifactBytes: source.bytes, artifactSha256: source.sha256,
    signerCertificateSha256: signer.certificateSha256,
    signerSubject: signer.subject, signerIssuer: signer.issuer,
    timestampCertificateSha256: sha256('timestamp'), timestampSubject: 'CN=Timestamp',
    ekuOids: ['1.3.6.1.5.5.7.3.3'],
  }
  const policy = {
    contract: 'supermega.postgres17-publisher-policy.v1', policyId: 'edb-policy',
    status: 'reviewed', testOnly: false, method: WINDOWS_AUTHENTICODE_METHOD,
    platform: { os: 'windows', arch: 'x64' }, requiredSignatureType: 'Authenticode',
    timestampRequired: true, requiredEkuOids: ['1.3.6.1.5.5.7.3.3'],
    approvedTimestampCertificateSha256: [observation.timestampCertificateSha256],
    approvedSigners: [signer],
    approval: { status: 'reviewed', reviewedBy: 'reviewer', reviewedAt: '2026-10-31T00:00:00Z' },
  }
  return { source, observation, policy }
}

test('pending source-controlled profile pins EDB bytes but stays fail-closed', async () => {
  const profile = JSON.parse(await readFile(new URL('../hq/research/postgres17-toolchain-profile.json', import.meta.url)))
  const result = inspectPostgres17ToolchainProfile(profile)
  assert.equal(result.ready, false)
  assert.equal(profile.sources[0].fileName, 'postgresql-17.11-5-windows-x64.exe')
  assert.equal(profile.sources[0].bytes, 413001200)
  assert.equal(profile.sources[0].sha256, '612c7f5400a003aaffa0372cb273eed52278f93c680ab911eb9cb2229e329072')
  const pendingSourceId = profile.sources[0].sourceId
  for (const blocker of ['profile_not_reviewed', 'load_closure_incomplete',
    'source_component_missing:python', 'source_component_missing:psycopg',
    'source_component_missing:node', 'source_component_missing:git',
    `source_authentication_unverified:${pendingSourceId}`,
    'independent_approval_missing', 'binding_missing:postgres']) assert.ok(result.blockers.includes(blocker), blocker)
  assert.equal(result.blockers.some((value) => value.includes('materialization')), false)
})

test('pending publisher policy pins the observed raw-DER signer without self-approval', async () => {
  const policy = JSON.parse(await readFile(new URL('../hq/research/postgres17-publisher-policy.json', import.meta.url)))
  assert.equal(policy.approvedSigners[0].certificateSha256,
    '558b34d97944a53cefc13c031ea46845be00f0b9bb87f47dc3110eaee07f82d3')
  assert.deepEqual(policy.requiredEkuOids, ['1.3.6.1.5.5.7.3.3'])
  assert.deepEqual(policy.approvedTimestampCertificateSha256,
    ['2da09da7f4131f9fe72db6c5e6e9c9656755af043f1ea742cc0d2120e141ebfc'])
  const result = inspectPostgres17PublisherPolicy(policy)
  assert.equal(result.ready, false)
  assert.ok(result.blockers.includes('publisher_policy_not_reviewed'))
  assert.ok(result.blockers.includes('publisher_policy_independent_approval_missing'))
})

test('publisher policy cannot be ready without a timestamp certificate allowlist', () => {
  const input = authenticodeFixture()
  input.policy.approvedTimestampCertificateSha256 = []
  const result = inspectPostgres17PublisherPolicy(input.policy)
  assert.equal(result.ready, false)
  assert.ok(result.blockers.includes('publisher_timestamp_signer_not_pinned'))
})

test('tracked Windows inspector is dependency-free and explicitly states its host boundary', async () => {
  const source = await readFile(new URL('./inspect_windows_authenticode.ps1', import.meta.url), 'utf8')
  for (const required of ['[System.IO.File]::Open', '[System.Security.Cryptography.SHA256]::Create',
    'Get-AuthenticodeSignature -LiteralPath', 'does not make the separate', 'isolated Windows host']) {
    assert.ok(source.includes(required), required)
  }
  assert.equal(source.includes('Get-FileHash'), false)
  assert.equal(source.includes('Invoke-WebRequest'), false)
  assert.equal(source.includes('Start-Process'), false)
})

test('multi-source synthetic profile verifies complete bindings and closure', async () => {
  const input = await fixture()
  try {
    assert.deepEqual(inspectPostgres17ToolchainProfile(input.profile).blockers, ['synthetic_profile'])
    const verified = await verifyPostgres17ToolchainProfile({
      manifestPath: input.manifestPath, sourcePaths: input.sourcePaths,
      extractedRoot: input.runtimeRoot, allowSynthetic: true,
      publisherPolicyPath: input.policyPath,
    })
    assert.equal(verified.ready, true)
    assert.equal(verified.execution.postgresBin.endsWith('bin'), true)
    assert.equal(verified.sourceAuthentication.length, 6)
    assert.equal(verified.receiptEvidence.sourceAuthentication.length, 6)
    assert.equal(verified.execution.node.endsWith('node'), true)
    assert.equal(verified.execution.git.endsWith('git'), true)
    assert.equal(verified.executionBindings.node.sourceId, 'node-source')
    assert.equal(verified.executionBindings.git.sourceId, 'git-source')
    const reconstructed = await sourceControlledToolchainReceiptEvidence({
      manifestPath: input.manifestPath, publisherPolicyPath: input.policyPath,
      allowSynthetic: true,
    })
    assert.deepEqual(reconstructed, verified.receiptEvidence)
  } finally { await rm(input.root, { recursive: true, force: true }) }
})

test('missing source, duplicate binding ID, and case-folded path collision fail closed', async () => {
  const input = await fixture()
  try {
    const missing = structuredClone(input.profile)
    missing.bindings[0].sourceId = 'missing'
    assert.ok(inspectPostgres17ToolchainProfile(missing).blockers.includes('binding_source_missing:postgres-binding'))
    const duplicate = structuredClone(input.profile)
    duplicate.bindings[1].bindingId = duplicate.bindings[0].bindingId
    assert.throws(() => inspectPostgres17ToolchainProfile(duplicate), /toolchain_binding_duplicate/)
    const collision = structuredClone(input.profile)
    collision.bindings[1].relativePath = collision.bindings[0].relativePath.toUpperCase()
    assert.throws(() => inspectPostgres17ToolchainProfile(collision), /toolchain_path_duplicate/)
  } finally { await rm(input.root, { recursive: true, force: true }) }
})

test('canonical profile, policy, approval, binding, and authentication shapes reject surplus claims', async () => {
  const input = await fixture()
  try {
    for (const mutate of [
      (profile) => { profile.authoritative = true },
      (profile) => { profile.approval.selfApproved = true },
      (profile) => { profile.bindings[0].publisher = 'caller-asserted' },
      (profile) => { profile.sources[0].authentication.runtimePath = 'C:\\untrusted' },
    ]) {
      const profile = structuredClone(input.profile)
      mutate(profile)
      assert.throws(() => inspectPostgres17ToolchainProfile(profile), /toolchain_profile_invalid/)
    }
    const policy = JSON.parse(await readFile(input.policyPath))
    policy.allowAnyValidSigner = true
    assert.throws(() => inspectPostgres17PublisherPolicy(policy), /publisher_policy_invalid/)
  } finally { await rm(input.root, { recursive: true, force: true }) }
})

test('closure binds every runtime file to exact source, path, digest, and use', async () => {
  const input = await fixture()
  try {
    assert.equal(verifyWindowsLoadClosureEvidence(input.profile, input.closure).fileCount, roles.length)
    for (const mutate of [
      (value) => { value.files.pop() },
      (value) => { value.files[0].sourceId = 'other' },
      (value) => { value.files[0].uses = ['loaded'] },
      (value) => { value.files.push({ ...value.files[0], bindingId: 'extra' }) },
      (value) => { value.files[0].trusted = true },
      (value) => { value.authoritative = true },
    ]) {
      const value = structuredClone(input.closure); mutate(value)
      assert.throws(() => verifyWindowsLoadClosureEvidence(input.profile, value), /load_closure/)
    }
  } finally { await rm(input.root, { recursive: true, force: true }) }
})

test('Authenticode evidence binds exact installer, signer, timestamp, and EKU', () => {
  const input = authenticodeFixture()
  assert.equal(verifyWindowsAuthenticodePublisherEvidence({ ...input, evidence: input.observation,
    observed: input.observation }).sourceId, 'edb')
  for (const mutate of [
    (value) => { value.artifactSha256 = sha256('other') },
    (value) => { value.signerCertificateSha256 = sha256('other signer') },
    (value) => { value.timestampCertificateSha256 = null },
    (value) => { value.ekuOids = [] },
    (value) => { value.allowAnyValidSigner = true },
  ]) {
    const observed = structuredClone(input.observation); mutate(observed)
    assert.throws(() => verifyWindowsAuthenticodePublisherEvidence({
      source: input.source, policy: input.policy, evidence: input.observation, observed,
    }), /authenticode/)
  }
})

test('missing or NotSigned Authenticode signature fails closed', () => {
  const input = authenticodeFixture()
  for (const signatureStatus of [null, 'NotSigned']) {
    const observed = structuredClone(input.observation)
    observed.signatureStatus = signatureStatus
    assert.throws(() => verifyWindowsAuthenticodePublisherEvidence({
      source: input.source, policy: input.policy, evidence: input.observation, observed,
    }), /authenticode_observation_mismatch/)
  }
})

test('wrong signer raw-DER SHA-256 is not transferred from another valid observation', () => {
  const input = authenticodeFixture()
  const wrong = structuredClone(input.observation)
  wrong.signerCertificateSha256 = sha256('unapproved signer raw DER')
  assert.throws(() => verifyWindowsAuthenticodePublisherEvidence({
    source: input.source, policy: input.policy, evidence: wrong, observed: wrong,
  }), /authenticode_signer_unapproved/)
})

test('installer digest, size, and name must each match the authenticated source', () => {
  const input = authenticodeFixture()
  for (const mutate of [
    (value) => { value.artifactSha256 = sha256('different installer') },
    (value) => { value.artifactBytes += 1 },
    (value) => { value.artifactFileName = 'other-installer.exe' },
  ]) {
    const value = structuredClone(input.observation)
    mutate(value)
    assert.throws(() => verifyWindowsAuthenticodePublisherEvidence({
      source: input.source, policy: input.policy, evidence: value, observed: value,
    }), /authenticode_observation_mismatch/)
  }
})

test('missing code-signing EKU fails even when installer and signer match', () => {
  const input = authenticodeFixture()
  const value = structuredClone(input.observation)
  value.ekuOids = []
  assert.throws(() => verifyWindowsAuthenticodePublisherEvidence({
    source: input.source, policy: input.policy, evidence: value, observed: value,
  }), /authenticode_eku_missing/)
})

test('unapproved timestamp certificate fails even when signer and EKU match', () => {
  const input = authenticodeFixture()
  const value = structuredClone(input.observation)
  value.timestampCertificateSha256 = sha256('different timestamp certificate')
  assert.throws(() => verifyWindowsAuthenticodePublisherEvidence({
    source: input.source, policy: input.policy, evidence: value, observed: value,
  }), /authenticode_timestamp_unapproved/)
})

test('retained source-authentication evidence digest mismatch fails before execution', async () => {
  const input = await fixture()
  try {
    await writeFile(join(input.root, input.profile.sources[0].authentication.evidencePath), 'tampered')
    await assert.rejects(verifyPostgres17ToolchainProfile({
      manifestPath: input.manifestPath, sourcePaths: input.sourcePaths,
      extractedRoot: input.runtimeRoot, allowSynthetic: true,
      publisherPolicyPath: input.policyPath,
    }), /toolchain_profile_file_mismatch/)
  } finally { await rm(input.root, { recursive: true, force: true }) }
})

test('unauthenticated source method and nonexistent binding source fail closed', async () => {
  const input = await fixture()
  try {
    const unauthenticated = structuredClone(input.profile)
    unauthenticated.sources[0].authentication.method = 'caller-asserted-url'
    assert.ok(inspectPostgres17ToolchainProfile(unauthenticated).blockers.includes(
      'source_authentication_unsupported:postgresql-source'))
    const nonexistent = structuredClone(input.profile)
    nonexistent.bindings[0].sourceId = 'does-not-exist'
    assert.ok(inspectPostgres17ToolchainProfile(nonexistent).blockers.includes(
      'binding_source_missing:postgres-binding'))
  } finally { await rm(input.root, { recursive: true, force: true }) }
})

test('production PostgreSQL requires Authenticode and digest-only sources remain synthetic-only', async () => {
  const input = await fixture()
  try {
    const profile = structuredClone(input.profile)
    profile.testOnly = false
    const result = inspectPostgres17ToolchainProfile(profile)
    assert.ok(result.blockers.includes('postgresql_source_authentication_invalid:postgresql-source'))
    for (const source of profile.sources) {
      assert.ok(result.blockers.includes(`source_authentication_production_unsupported:${source.sourceId}`))
    }
  } finally { await rm(input.root, { recursive: true, force: true }) }
})

test('every required role binds only to its exact source component and unused sources cannot satisfy coverage', async () => {
  const input = await fixture()
  try {
    for (const role of roles) {
      const mismatched = structuredClone(input.profile)
      const binding = mismatched.bindings.find((candidate) => candidate.role === role)
      binding.sourceId = sourceByRole(role) === 'postgresql-source'
        ? 'python-source'
        : 'postgresql-source'
      const mismatchResult = inspectPostgres17ToolchainProfile(mismatched)
      assert.ok(mismatchResult.blockers.includes(`binding_component_mismatch:${role}-binding`), role)
    }

    const missingPython = structuredClone(input.profile)
    missingPython.bindings.find(({ role }) => role === 'python').sourceId = 'postgresql-source'
    const missingPythonResult = inspectPostgres17ToolchainProfile(missingPython)
    assert.ok(missingPythonResult.blockers.includes('source_component_missing:python'))
    assert.ok(missingPythonResult.blockers.includes('source_unused:python-source'))

    const unused = structuredClone(input.profile)
    unused.sources.push({ ...structuredClone(unused.sources[0]),
      sourceId: 'unused-postgresql-source', fileName: 'unused.bin' })
    const unusedResult = inspectPostgres17ToolchainProfile(unused)
    assert.ok(unusedResult.blockers.includes('source_unused:unused-postgresql-source'))
  } finally { await rm(input.root, { recursive: true, force: true }) }
})

test('missing Python, Psycopg, OpenSSL, Node, or Git source components remain explicit blockers', async () => {
  const input = await fixture()
  try {
    for (const component of ['python', 'psycopg', 'openssl', 'node', 'git']) {
      const profile = structuredClone(input.profile)
      profile.sources = profile.sources.filter((source) => source.component !== component)
      const result = inspectPostgres17ToolchainProfile(profile)
      assert.ok(result.blockers.includes(`source_component_missing:${component}`), component)
    }
  } finally { await rm(input.root, { recursive: true, force: true }) }
})

test('incomplete closure and use mismatch cannot be accepted as complete runtime evidence', async () => {
  const input = await fixture()
  try {
    const missing = structuredClone(input.closure)
    missing.files.pop()
    assert.throws(() => verifyWindowsLoadClosureEvidence(input.profile, missing), /load_closure_incomplete/)
    const wrongUse = structuredClone(input.closure)
    wrongUse.files[0].uses = ['loaded']
    assert.throws(() => verifyWindowsLoadClosureEvidence(input.profile, wrongUse), /load_closure_incomplete/)

    const selfConsistentWrongUse = structuredClone(input.profile)
    selfConsistentWrongUse.bindings.find(({ role }) => role === 'node').uses = ['loaded']
    assert.ok(inspectPostgres17ToolchainProfile(selfConsistentWrongUse).blockers.includes(
      'binding_use_mismatch:node-binding'))
  } finally { await rm(input.root, { recursive: true, force: true }) }
})

test('unreviewed isolated-runner boundary cannot enable the profile', async () => {
  const input = await fixture()
  try {
    for (const mutate of [
      (profile) => { profile.trustedBoundary.concurrentSameUserWorkloadsAllowed = true },
      (profile) => { profile.trustedBoundary.interactiveUsersAllowed = true },
      (profile) => { profile.trustedBoundary.hostileSameUserMutationInScope = true },
    ]) {
      const profile = structuredClone(input.profile)
      mutate(profile)
      assert.ok(inspectPostgres17ToolchainProfile(profile).blockers.includes('trusted_boundary_unreviewed'))
    }
  } finally { await rm(input.root, { recursive: true, force: true }) }
})

test('receipt evidence is canonical, path-free, and rejects missing source authentication', () => {
  const digest = 'a'.repeat(64)
  const verified = {
    profileId: 'profile', manifestSha256: digest, policySha256: digest,
    sourceDigest: digest, bindingDigest: digest, executionBundleSha256: digest,
    loadClosureEvidenceSha256: digest,
    sourceAuthentication: [{ sourceId: 'b', sourceArtifactSha256: digest, evidenceSha256: digest },
      { sourceId: 'a', sourceArtifactSha256: digest, evidenceSha256: digest }],
  }
  const evidence = toolchainReceiptEvidence(verified)
  assert.deepEqual(evidence.sourceAuthentication.map(({ sourceId }) => sourceId), ['a', 'b'])
  assert.equal(JSON.stringify(evidence).includes('C:\\'), false)
  assert.throws(() => toolchainReceiptEvidence({ ...verified, sourceAuthentication: [] }), /receipt_evidence_invalid/)
  assert.throws(() => toolchainReceiptEvidence({
    ...verified,
    sourceAuthentication: [{ ...verified.sourceAuthentication[0], runtimePath: 'C:\\untrusted' }],
  }), /receipt_evidence_invalid/)
})
