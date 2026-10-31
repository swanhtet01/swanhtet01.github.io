import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { lstat, readFile, realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'

import {
  inspectPostgres17MaterializationEvidence,
  verifyTwoPassMaterializationRoots,
} from './postgres17_materialization.mjs'

export const POSTGRES17_TOOLCHAIN_PROFILE_CONTRACT =
  'supermega.postgres17-toolchain-provenance.v1'
export const POSTGRES17_PUBLISHER_POLICY_CONTRACT =
  'supermega.postgres17-publisher-policy.v1'
export const WINDOWS_AUTHENTICODE_METHOD = 'windows-authenticode-v1'
export const WINDOWS_AUTHENTICODE_OBSERVATION_CONTRACT =
  'supermega.windows-authenticode-observation.v1'
export const WINDOWS_LOAD_CLOSURE_CONTRACT = 'supermega.windows-load-closure.v1'

const SHA256 = /^[0-9a-f]{64}$/
const VERSION = /^17\.[0-9]+(?:-[0-9]+)?$/
const CODE_SIGNING_EKU = '1.3.6.1.5.5.7.3.3'
const defaultPublisherPolicyPath = resolve(
  import.meta.dirname,
  '..',
  'hq',
  'research',
  'postgres17-publisher-policy.json',
)
const authenticodeInspectorPath = resolve(import.meta.dirname, 'inspect_windows_authenticode.ps1')
const REQUIRED_ROLES = new Set([
  'postgres',
  'initdb',
  'pg_ctl',
  'pg_isready',
  'pg_dump',
  'pg_restore',
  'psql',
  'libpq',
  'openssl',
  'python',
  'psycopg',
])
const POSTGRES_EXECUTABLE_ROLES = new Set([
  'postgres', 'initdb', 'pg_ctl', 'pg_isready', 'pg_dump', 'pg_restore', 'psql',
])
// Production authentication is never established by a profile assertion. The
// method below requires a canonical reviewed signer policy plus a fresh Windows
// Authenticode observation of the exact source artifact bytes.
const TRUSTED_PRODUCTION_AUTHENTICATION_METHODS = new Set([
  WINDOWS_AUTHENTICODE_METHOD,
])

function fail(code) {
  throw new Error(code)
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function safeRelativePath(value) {
  return typeof value === 'string'
    && value.length > 0
    && !isAbsolute(value)
    && !value.split(/[\\/]/).includes('..')
}

function exactBinding(binding) {
  return isObject(binding)
    && typeof binding.role === 'string'
    && binding.role.length > 0
    && safeRelativePath(binding.relativePath)
    && Number.isSafeInteger(binding.bytes)
    && binding.bytes >= 0
    && SHA256.test(binding.sha256 || '')
    && typeof binding.observedVersion === 'string'
    && binding.observedVersion.length > 0
    && safeRelativePath(binding.versionEvidencePath)
    && Number.isSafeInteger(binding.versionEvidenceBytes)
    && binding.versionEvidenceBytes > 0
    && SHA256.test(binding.versionOutputSha256 || '')
}

function exactAuthenticodeAuthentication(authentication) {
  return isObject(authentication)
    && authentication.method === WINDOWS_AUTHENTICODE_METHOD
    && typeof authentication.policyId === 'string'
    && authentication.policyId.length > 0
}

function exactApprovedSigner(signer) {
  return isObject(signer)
    && SHA256.test(signer.certificateSha256 || '')
    && typeof signer.subject === 'string'
    && signer.subject.length > 0
    && typeof signer.issuer === 'string'
    && signer.issuer.length > 0
}

export function inspectPostgres17PublisherPolicy(policy) {
  if (!isObject(policy)
    || policy.contract !== POSTGRES17_PUBLISHER_POLICY_CONTRACT
    || typeof policy.policyId !== 'string'
    || policy.policyId.length === 0
    || policy.method !== WINDOWS_AUTHENTICODE_METHOD
    || !isObject(policy.platform)
    || policy.platform.os !== 'windows'
    || policy.platform.arch !== 'x64'
    || policy.testOnly !== false
    || policy.requiredSignatureType !== 'Authenticode'
    || policy.timestampRequired !== true
    || !Array.isArray(policy.approvedSigners)
    || !policy.approvedSigners.every(exactApprovedSigner)
    || !Array.isArray(policy.requiredEkuOids)
    || !policy.requiredEkuOids.includes(CODE_SIGNING_EKU)
    || !isObject(policy.approval)) {
    fail('database_rehearsal_publisher_policy_invalid')
  }
  const blockers = []
  if (policy.status !== 'reviewed') blockers.push('publisher_policy_not_reviewed')
  if (policy.approvedSigners.length === 0) blockers.push('publisher_signer_not_pinned')
  if (policy.approval.status !== 'reviewed'
    || typeof policy.approval.reviewedBy !== 'string'
    || policy.approval.reviewedBy.length === 0
    || !Number.isFinite(Date.parse(policy.approval.reviewedAt))) {
    blockers.push('publisher_policy_independent_approval_missing')
  }
  const fingerprints = new Set(policy.approvedSigners.map(({ certificateSha256 }) => certificateSha256))
  if (fingerprints.size !== policy.approvedSigners.length) blockers.push('publisher_signer_duplicate')
  return {
    contract: POSTGRES17_PUBLISHER_POLICY_CONTRACT,
    policyId: policy.policyId,
    ready: blockers.length === 0,
    blockers,
    signerCount: policy.approvedSigners.length,
  }
}

function observedPostgresVersionMatches(observedVersion, declaredVersion) {
  const upstreamVersion = declaredVersion.replace(/-[0-9]+$/, '')
  const escapedVersion = upstreamVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^0-9.])${escapedVersion}(?:$|[^0-9.])`).test(observedVersion)
}

export function inspectPostgres17ToolchainProfile(profile) {
  const blockers = []
  if (!isObject(profile)
    || profile.contract !== POSTGRES17_TOOLCHAIN_PROFILE_CONTRACT
    || typeof profile.profileId !== 'string'
    || !isObject(profile.platform)
    || profile.platform.os !== 'windows'
    || profile.platform.arch !== 'x64'
    || !isObject(profile.postgres)
    || !VERSION.test(profile.postgres.version || '')
    || !isObject(profile.archive)
    || typeof profile.archive.fileName !== 'string'
    || !Number.isSafeInteger(profile.archive.bytes)
    || profile.archive.bytes <= 0
    || !SHA256.test(profile.archive.sha256 || '')
    || !safeRelativePath(profile.extractedRootName)
    || !Array.isArray(profile.artifacts)
    || !Array.isArray(profile.dependencies)
    || !isObject(profile.sourceAuthentication)
    || !isObject(profile.approval)) {
    fail('database_rehearsal_toolchain_profile_invalid')
  }

  const bindings = [...profile.artifacts, ...profile.dependencies]
  if (!bindings.every(exactBinding)) {
    fail('database_rehearsal_toolchain_profile_binding_invalid')
  }
  const roles = new Set(bindings.map(({ role }) => role))
  if (roles.size !== bindings.length) {
    fail('database_rehearsal_toolchain_profile_role_duplicate')
  }

  for (const binding of bindings) {
    if (POSTGRES_EXECUTABLE_ROLES.has(binding.role)
      && !observedPostgresVersionMatches(binding.observedVersion, profile.postgres.version)) {
      blockers.push(`postgres_version_mismatch:${binding.role}`)
    }
  }

  if (profile.testOnly === false && bindings.some((binding) =>
    binding.sourceArtifactSha256 !== profile.archive.sha256)) {
    blockers.push('binding_source_artifact_unverified')
  }

  if (profile.status !== 'reviewed') blockers.push('profile_not_reviewed')
  if (profile.testOnly !== false) blockers.push('synthetic_profile')
  if (profile.loadClosureComplete !== true) blockers.push('load_closure_incomplete')
  if (profile.testOnly !== true && (!isObject(profile.loadClosure)
    || profile.loadClosure.status !== 'reviewed'
    || profile.loadClosure.captureMethod !== 'windows-loaded-module-capture-v1'
    || !safeRelativePath(profile.loadClosure.evidencePath)
    || !Number.isSafeInteger(profile.loadClosure.evidenceBytes)
    || profile.loadClosure.evidenceBytes <= 0
    || !SHA256.test(profile.loadClosure.evidenceSha256 || '')
    || profile.loadClosure.unexpectedNonSystemModules !== 0
    || profile.loadClosure.systemModulePolicy !== 'windows-system32-os-component-v1')) {
    blockers.push('load_closure_evidence_unverified')
  }
  if (profile.testOnly !== true && (!isObject(profile.materialization)
    || profile.materialization.status !== 'reviewed'
    || profile.materialization.method !== 'two-pass-reviewed-installer-v1'
    || !safeRelativePath(profile.materialization.evidencePath)
    || !Number.isSafeInteger(profile.materialization.evidenceBytes)
    || profile.materialization.evidenceBytes <= 0
    || !SHA256.test(profile.materialization.evidenceSha256 || ''))) {
    blockers.push('materialization_evidence_unverified')
  }
  // The source verifier can validate an exact reviewed inventory and compare
  // two materialization passes, but no reviewed Windows executor currently
  // performs those passes from the authenticated installer. A manifest is not
  // proof that the installer produced a tree, so production stays blocked.
  if (profile.testOnly !== true) blockers.push('materialization_executor_unavailable')
  if (profile.sourceAuthentication.status !== 'reviewed'
    || typeof profile.sourceAuthentication.method !== 'string'
    || profile.sourceAuthentication.method.length === 0
    || typeof profile.sourceAuthentication.reference !== 'string'
    || profile.sourceAuthentication.reference.length === 0
    || !safeRelativePath(profile.sourceAuthentication.evidencePath)
    || !Number.isSafeInteger(profile.sourceAuthentication.evidenceBytes)
    || profile.sourceAuthentication.evidenceBytes <= 0
    || !SHA256.test(profile.sourceAuthentication.evidenceSha256 || '')) {
    blockers.push('publisher_authentication_unverified')
  }
  if (profile.testOnly !== true
    && !TRUSTED_PRODUCTION_AUTHENTICATION_METHODS.has(profile.sourceAuthentication.method)) {
    blockers.push('publisher_authentication_verifier_unavailable')
  }
  if (profile.testOnly !== true
    && profile.sourceAuthentication.method === WINDOWS_AUTHENTICODE_METHOD) {
    if (!exactAuthenticodeAuthentication(profile.sourceAuthentication)
      || !profile.archive.fileName.toLowerCase().endsWith('.exe')) {
      blockers.push('publisher_authentication_unverified')
    } else {
      blockers.push('publisher_authentication_runtime_verification_required')
    }
  }
  if (profile.approval.status !== 'reviewed'
    || typeof profile.approval.reviewedBy !== 'string'
    || profile.approval.reviewedBy.length === 0
    || !Number.isFinite(Date.parse(profile.approval.reviewedAt))) {
    blockers.push('independent_approval_missing')
  }
  for (const role of REQUIRED_ROLES) {
    if (!roles.has(role)) blockers.push(`binding_missing:${role}`)
  }
  return {
    contract: POSTGRES17_TOOLCHAIN_PROFILE_CONTRACT,
    profileId: profile.profileId,
    ready: blockers.length === 0,
    blockers,
    bindingCount: bindings.length,
  }
}

async function sha256File(path) {
  const digest = createHash('sha256')
  await new Promise((resolveStream, rejectStream) => {
    const stream = createReadStream(path)
    stream.on('data', (chunk) => digest.update(chunk))
    stream.on('error', rejectStream)
    stream.on('end', resolveStream)
  })
  return digest.digest('hex')
}

async function verifyRegularFile(path, expected, root = null) {
  const metadata = await lstat(path)
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    fail('database_rehearsal_toolchain_profile_file_invalid')
  }
  if (root) {
    const resolvedRoot = await realpath(root)
    const resolvedPath = await realpath(path)
    const child = relative(resolvedRoot, resolvedPath)
    if (!child || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) {
      fail('database_rehearsal_toolchain_profile_path_escape')
    }
  }
  const observed = await stat(path)
  if (observed.size !== expected.bytes || await sha256File(path) !== expected.sha256) {
    fail('database_rehearsal_toolchain_profile_file_mismatch')
  }
}

function parseJsonEvidence(bytes, code) {
  let value
  try { value = JSON.parse(bytes.toString('utf8')) } catch { fail(code) }
  if (!isObject(value)) fail(code)
  return value
}

function exactAuthenticodeObservation(value) {
  return isObject(value)
    && value.contract === WINDOWS_AUTHENTICODE_OBSERVATION_CONTRACT
    && value.signatureStatus === 'Valid'
    && value.signatureType === 'Authenticode'
    && typeof value.artifactFileName === 'string'
    && value.artifactFileName === basename(value.artifactFileName)
    && Number.isSafeInteger(value.artifactBytes)
    && value.artifactBytes > 0
    && SHA256.test(value.artifactSha256 || '')
    && SHA256.test(value.signerCertificateSha256 || '')
    && typeof value.signerSubject === 'string'
    && value.signerSubject.length > 0
    && typeof value.signerIssuer === 'string'
    && value.signerIssuer.length > 0
    && SHA256.test(value.timestampCertificateSha256 || '')
    && typeof value.timestampSubject === 'string'
    && value.timestampSubject.length > 0
    && Array.isArray(value.ekuOids)
    && value.ekuOids.every((oid) => typeof oid === 'string' && oid.length > 0)
}

function sameAuthenticodeObservation(left, right) {
  return left.contract === right.contract
    && left.signatureStatus === right.signatureStatus
    && left.signatureType === right.signatureType
    && left.artifactFileName === right.artifactFileName
    && left.artifactBytes === right.artifactBytes
    && left.artifactSha256 === right.artifactSha256
    && left.signerCertificateSha256 === right.signerCertificateSha256
    && left.signerSubject === right.signerSubject
    && left.signerIssuer === right.signerIssuer
    && left.timestampCertificateSha256 === right.timestampCertificateSha256
    && left.timestampSubject === right.timestampSubject
    && JSON.stringify([...left.ekuOids].sort()) === JSON.stringify([...right.ekuOids].sort())
}

export function verifyWindowsLoadClosureEvidence(profile, evidence) {
  if (!isObject(evidence)
    || evidence.contract !== WINDOWS_LOAD_CLOSURE_CONTRACT
    || evidence.sourceArtifactSha256 !== profile.archive.sha256
    || evidence.captureMethod !== 'windows-loaded-module-capture-v1'
    || evidence.systemModulePolicy !== 'windows-system32-os-component-v1'
    || evidence.unexpectedNonSystemModules !== 0
    || !Array.isArray(evidence.files)) {
    fail('database_rehearsal_load_closure_invalid')
  }
  const expected = [...profile.artifacts, ...profile.dependencies]
    .map(({ relativePath, bytes, sha256 }) => ({ relativePath, bytes, sha256 }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  const observed = evidence.files.map((file) => {
    if (!isObject(file) || !safeRelativePath(file.relativePath)
      || !Number.isSafeInteger(file.bytes) || file.bytes < 0
      || !SHA256.test(file.sha256 || '')) {
      fail('database_rehearsal_load_closure_invalid')
    }
    return { relativePath: file.relativePath, bytes: file.bytes, sha256: file.sha256 }
  }).sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  if (JSON.stringify(observed) !== JSON.stringify(expected)) {
    fail('database_rehearsal_load_closure_incomplete')
  }
  return { fileCount: observed.length, evidenceSha256: profile.loadClosure.evidenceSha256 }
}

export async function inspectWindowsAuthenticode(artifactPath) {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    fail('database_rehearsal_authenticode_host_mismatch')
  }
  // Do not accept a caller-controlled PATH/SystemRoot as the trust inspector.
  // Non-standard Windows installations fail closed until explicitly reviewed.
  const powershellPath = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
  const inspectorSource = await readFile(authenticodeInspectorPath, 'utf8')
  const result = spawnSync(
    powershellPath,
    [
      '-NoLogo', '-NoProfile', '-NonInteractive',
      '-Command', '-',
    ],
    {
      encoding: 'utf8',
      input: inspectorSource,
      timeout: 30_000,
      windowsHide: true,
      env: { ...process.env, SUPERMEGA_AUTHENTICODE_TARGET: artifactPath },
    },
  )
  if (result.error || result.status !== 0 || !result.stdout?.trim()) {
    fail('database_rehearsal_authenticode_inspection_failed')
  }
  const observation = parseJsonEvidence(
    Buffer.from(result.stdout.trim(), 'utf8'),
    'database_rehearsal_authenticode_observation_invalid',
  )
  return observation
}

export function verifyWindowsAuthenticodePublisherEvidence({
  profile,
  policy,
  evidence,
  observed,
}) {
  const authentication = profile.sourceAuthentication
  if (authentication.method !== WINDOWS_AUTHENTICODE_METHOD) {
    fail('database_rehearsal_publisher_authentication_unsupported')
  }
  const policyInspection = inspectPostgres17PublisherPolicy(policy)
  if (!policyInspection.ready || authentication.policyId !== policy.policyId) {
    fail('database_rehearsal_publisher_policy_unapproved')
  }
  if (!exactAuthenticodeObservation(evidence)
    || !exactAuthenticodeObservation(observed)
    || evidence.artifactSha256 !== profile.archive.sha256
    || observed.artifactSha256 !== profile.archive.sha256
    || evidence.artifactFileName !== profile.archive.fileName
    || observed.artifactFileName !== profile.archive.fileName
    || evidence.artifactBytes !== profile.archive.bytes
    || observed.artifactBytes !== profile.archive.bytes
    || !sameAuthenticodeObservation(evidence, observed)) {
    fail('database_rehearsal_authenticode_observation_mismatch')
  }
  const approvedSigner = policy.approvedSigners.find((signer) =>
    signer.certificateSha256 === observed.signerCertificateSha256
    && signer.subject === observed.signerSubject
    && signer.issuer === observed.signerIssuer)
  if (!approvedSigner) fail('database_rehearsal_authenticode_signer_unapproved')
  for (const requiredEku of policy.requiredEkuOids) {
    if (!observed.ekuOids.includes(requiredEku)) {
      fail('database_rehearsal_authenticode_eku_missing')
    }
  }
  return {
    policyId: policy.policyId,
    signerCertificateSha256: observed.signerCertificateSha256,
    sourceArtifactSha256: observed.artifactSha256,
    timestampCertificateSha256: observed.timestampCertificateSha256,
  }
}

async function verifyPublisherAuthentication({ profile, manifestPath, archivePath, publisherPolicyPath }) {
  const policyBytes = await readFile(publisherPolicyPath)
  const policy = parseJsonEvidence(policyBytes, 'database_rehearsal_publisher_policy_invalid')
  const policyInspection = inspectPostgres17PublisherPolicy(policy)
  if (!policyInspection.ready || profile.sourceAuthentication.policyId !== policy.policyId) {
    fail('database_rehearsal_publisher_policy_unapproved')
  }
  const evidence = parseJsonEvidence(
    await readFile(resolve(dirname(manifestPath), profile.sourceAuthentication.evidencePath)),
    'database_rehearsal_authenticode_observation_invalid',
  )
  const observed = await inspectWindowsAuthenticode(archivePath)
  return {
    ...verifyWindowsAuthenticodePublisherEvidence({ profile, policy, evidence, observed }),
    policySha256: createHash('sha256').update(policyBytes).digest('hex'),
  }
}

export async function verifyPostgres17ToolchainProfile({
  manifestPath,
  archivePath,
  extractedRoot = null,
  secondExtractedRoot = null,
  allowSynthetic = false,
  requireHostPlatform = false,
}) {
  const manifestMetadata = await lstat(manifestPath)
  if (!manifestMetadata.isFile() || manifestMetadata.isSymbolicLink()) {
    fail('database_rehearsal_toolchain_profile_file_invalid')
  }
  const manifestBytes = await readFile(manifestPath)
  let profile
  try {
    profile = JSON.parse(manifestBytes.toString('utf8'))
  } catch {
    fail('database_rehearsal_toolchain_profile_invalid')
  }
  const inspection = inspectPostgres17ToolchainProfile(profile)
  const ignoredBlockers = new Set()
  if (allowSynthetic && profile.testOnly === true) ignoredBlockers.add('synthetic_profile')
  if (profile.testOnly === false
    && profile.sourceAuthentication.method === WINDOWS_AUTHENTICODE_METHOD) {
    ignoredBlockers.add('publisher_authentication_runtime_verification_required')
  }
  const blockers = inspection.blockers.filter((blocker) => !ignoredBlockers.has(blocker))
  if (blockers.length > 0) fail('database_rehearsal_toolchain_provenance_unapproved')
  if (requireHostPlatform
    && (process.platform !== 'win32' || process.arch !== 'x64')) {
    fail('database_rehearsal_toolchain_host_mismatch')
  }
  if (profile.archive.fileName !== archivePath.split(/[\\/]/).at(-1)) {
    fail('database_rehearsal_toolchain_profile_archive_name_mismatch')
  }
  extractedRoot ??= resolve(dirname(archivePath), profile.extractedRootName)
  const expectedRoot = resolve(dirname(archivePath), profile.extractedRootName)
  const rootMetadata = await lstat(extractedRoot)
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()
    || basename(extractedRoot) !== profile.extractedRootName
    || resolve(extractedRoot) !== expectedRoot
    || await realpath(extractedRoot) !== expectedRoot) {
    fail('database_rehearsal_toolchain_profile_root_mismatch')
  }
  await verifyRegularFile(archivePath, profile.archive)
  await verifyRegularFile(
    resolve(dirname(manifestPath), profile.sourceAuthentication.evidencePath),
    {
      bytes: profile.sourceAuthentication.evidenceBytes,
      sha256: profile.sourceAuthentication.evidenceSha256,
    },
    dirname(manifestPath),
  )
  let materializationInventory = null
  if (profile.testOnly === false) {
    const closurePath = resolve(dirname(manifestPath), profile.loadClosure.evidencePath)
    await verifyRegularFile(
      closurePath,
      { bytes: profile.loadClosure.evidenceBytes, sha256: profile.loadClosure.evidenceSha256 },
      dirname(manifestPath),
    )
    verifyWindowsLoadClosureEvidence(
      profile,
      parseJsonEvidence(await readFile(closurePath), 'database_rehearsal_load_closure_invalid'),
    )
    const materializationPath = resolve(
      dirname(manifestPath),
      profile.materialization.evidencePath,
    )
    await verifyRegularFile(
      materializationPath,
      {
        bytes: profile.materialization.evidenceBytes,
        sha256: profile.materialization.evidenceSha256,
      },
      dirname(manifestPath),
    )
    const materializationEvidence = parseJsonEvidence(
      await readFile(materializationPath),
      'database_rehearsal_materialization_manifest_invalid',
    )
    inspectPostgres17MaterializationEvidence(profile, materializationEvidence)
    if (typeof secondExtractedRoot !== 'string') {
      fail('database_rehearsal_materialization_second_pass_missing')
    }
    materializationInventory = await verifyTwoPassMaterializationRoots({
      profile,
      evidence: materializationEvidence,
      firstRoot: extractedRoot,
      secondRoot: secondExtractedRoot,
    })
  }
  let publisherAuthentication = null
  if (profile.testOnly === false) {
    publisherAuthentication = await verifyPublisherAuthentication({
      profile,
      manifestPath,
      archivePath,
      publisherPolicyPath: defaultPublisherPolicyPath,
    })
  }
  const execution = {}
  const seenPaths = new Set()
  const seenHashes = new Set()
  for (const binding of [...profile.artifacts, ...profile.dependencies]) {
    if (seenPaths.has(binding.relativePath) || seenHashes.has(binding.sha256)) {
      fail('database_rehearsal_toolchain_profile_binding_duplicate')
    }
    seenPaths.add(binding.relativePath)
    seenHashes.add(binding.sha256)
    await verifyRegularFile(resolve(extractedRoot, binding.relativePath), binding, extractedRoot)
    const versionEvidence = {
      bytes: binding.versionEvidenceBytes,
      sha256: binding.versionOutputSha256,
    }
    const versionPath = resolve(extractedRoot, binding.versionEvidencePath)
    await verifyRegularFile(versionPath, versionEvidence, extractedRoot)
    const versionBytes = await readFile(versionPath)
    if (versionBytes.toString('utf8') !== binding.observedVersion) {
      fail('database_rehearsal_toolchain_profile_version_evidence_mismatch')
    }
    execution[binding.role] = resolve(extractedRoot, binding.relativePath)
  }
  const postgresBin = dirname(execution.postgres)
  for (const role of POSTGRES_EXECUTABLE_ROLES) {
    if (dirname(execution[role]) !== postgresBin) {
      fail('database_rehearsal_toolchain_postgres_bin_incomplete')
    }
  }
  return {
    ...inspection,
    ready: true,
    profileId: profile.profileId,
    manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
    archiveSha256: profile.archive.sha256,
    archiveBytes: profile.archive.bytes,
    archiveFileName: profile.archive.fileName,
    archivePath,
    postgresVersion: profile.postgres.version,
    sourceAuthenticationEvidenceSha256: profile.sourceAuthentication.evidenceSha256,
    loadClosureEvidenceSha256: profile.testOnly === false
      ? profile.loadClosure.evidenceSha256
      : profile.sourceAuthentication.evidenceSha256,
    materializationEvidenceSha256: profile.testOnly === false
      ? profile.materialization.evidenceSha256
      : profile.sourceAuthentication.evidenceSha256,
    materializationInventorySha256: materializationInventory === null
      ? createHash('sha256').update('synthetic-materialization-not-authoritative').digest('hex')
      : createHash('sha256').update(JSON.stringify(materializationInventory)).digest('hex'),
    executionBundleSha256: createHash('sha256').update(JSON.stringify(
      [...profile.artifacts, ...profile.dependencies].map((binding) => ({
        role: binding.role,
        relativePath: binding.relativePath,
        bytes: binding.bytes,
        sha256: binding.sha256,
        sourceArtifactSha256: binding.sourceArtifactSha256,
        observedVersion: binding.observedVersion,
        versionOutputSha256: binding.versionOutputSha256,
      })),
    )).digest('hex'),
    publisherAuthentication,
    execution: {
      root: expectedRoot,
      materializationRoots: profile.testOnly === false
        ? [expectedRoot, resolve(secondExtractedRoot)]
        : [expectedRoot],
      postgresBin,
      openssl: execution.openssl,
      python: execution.python,
      psycopg: execution.psycopg,
    },
  }
}
