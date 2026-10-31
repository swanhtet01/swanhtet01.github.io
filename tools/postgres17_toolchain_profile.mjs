import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { lstat, readFile, realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'

export const POSTGRES17_TOOLCHAIN_PROFILE_CONTRACT =
  'supermega.postgres17-toolchain-provenance.v2'
export const POSTGRES17_PUBLISHER_POLICY_CONTRACT =
  'supermega.postgres17-publisher-policy.v1'
export const WINDOWS_AUTHENTICODE_METHOD = 'windows-authenticode-v1'
export const WINDOWS_AUTHENTICODE_OBSERVATION_CONTRACT =
  'supermega.windows-authenticode-observation.v1'
export const WINDOWS_LOAD_CLOSURE_CONTRACT = 'supermega.windows-load-closure.v2'
export const REVIEWED_SOURCE_DIGEST_METHOD = 'reviewed-source-digest-v1'

const SHA256 = /^[0-9a-f]{64}$/
const VERSION = /^17\.[0-9]+(?:-[0-9]+)?$/
const CODE_SIGNING_EKU = '1.3.6.1.5.5.7.3.3'
const TRUST_BOUNDARY = 'isolated-single-purpose-windows-x64-v1'
const SYSTEM_MODULE_POLICY = 'windows-system32-os-component-v1'
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
  'node',
  'git',
])
const POSTGRES_EXECUTABLE_ROLES = new Set([
  'postgres', 'initdb', 'pg_ctl', 'pg_isready', 'pg_dump', 'pg_restore', 'psql',
])
const SINGLETON_ROLES = new Set(REQUIRED_ROLES)
const REQUIRED_COMPONENTS = new Set(['postgresql', 'python', 'psycopg', 'openssl', 'node', 'git'])
const ROLE_COMPONENT = new Map([
  ['postgres', 'postgresql'], ['initdb', 'postgresql'], ['pg_ctl', 'postgresql'],
  ['pg_isready', 'postgresql'], ['pg_dump', 'postgresql'], ['pg_restore', 'postgresql'],
  ['psql', 'postgresql'], ['libpq', 'postgresql'], ['python', 'python'],
  ['psycopg', 'psycopg'], ['openssl', 'openssl'], ['node', 'node'], ['git', 'git'],
])
const ROLE_REQUIRED_USE = new Map([
  ['postgres', 'executed'], ['initdb', 'executed'], ['pg_ctl', 'executed'],
  ['pg_isready', 'executed'], ['pg_dump', 'executed'], ['pg_restore', 'executed'],
  ['psql', 'executed'], ['libpq', 'loaded'], ['python', 'executed'],
  ['psycopg', 'imported'], ['openssl', 'executed'], ['node', 'executed'], ['git', 'executed'],
])
const USE_KINDS = new Set(['executed', 'imported', 'loaded'])
function fail(code) {
  throw new Error(code)
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value, required, optional = []) {
  if (!isObject(value)) return false
  const allowed = new Set([...required, ...optional])
  return required.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => allowed.has(key))
}

function safeRelativePath(value) {
  return typeof value === 'string'
    && value.length > 0
    && !isAbsolute(value)
    && !value.split(/[\\/]/).includes('..')
    && !value.includes(':')
}

function exactBinding(binding) {
  return hasExactKeys(binding, [
    'bindingId', 'role', 'sourceId', 'relativePath', 'bytes', 'sha256',
    'observedVersion', 'versionEvidencePath', 'versionEvidenceBytes',
    'versionOutputSha256', 'uses',
  ])
    && typeof binding.bindingId === 'string'
    && binding.bindingId.length > 0
    && typeof binding.role === 'string'
    && binding.role.length > 0
    && typeof binding.sourceId === 'string'
    && binding.sourceId.length > 0
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
    && Array.isArray(binding.uses)
    && binding.uses.length > 0
    && new Set(binding.uses).size === binding.uses.length
    && binding.uses.every((use) => USE_KINDS.has(use))
}

function exactSource(source) {
  return hasExactKeys(source, [
    'sourceId', 'component', 'fileName', 'bytes', 'sha256', 'authentication',
  ])
    && typeof source.sourceId === 'string'
    && source.sourceId.length > 0
    && typeof source.component === 'string'
    && source.component.length > 0
    && typeof source.fileName === 'string'
    && source.fileName === basename(source.fileName)
    && Number.isSafeInteger(source.bytes)
    && source.bytes > 0
    && SHA256.test(source.sha256 || '')
    && isObject(source.authentication)
    && exactAuthenticationShape(source.authentication)
    && typeof source.authentication.status === 'string'
    && typeof source.authentication.method === 'string'
    && typeof source.authentication.reference === 'string'
    && source.authentication.reference.length > 0
}

function validApproval(approval) {
  return hasExactKeys(approval, ['status', 'reviewedBy', 'reviewedAt'])
    && approval.status === 'reviewed'
    && typeof approval.reviewedBy === 'string'
    && approval.reviewedBy.length > 0
    && Number.isFinite(Date.parse(approval.reviewedAt))
}

function validBoundEvidence(value) {
  return isObject(value)
    && safeRelativePath(value.evidencePath)
    && Number.isSafeInteger(value.evidenceBytes)
    && value.evidenceBytes > 0
    && SHA256.test(value.evidenceSha256 || '')
}

function exactAuthenticationShape(authentication) {
  const required = [
    'status', 'method', 'reference', 'evidencePath', 'evidenceBytes', 'evidenceSha256',
  ]
  const optional = authentication?.method === WINDOWS_AUTHENTICODE_METHOD ? ['policyId'] : []
  return hasExactKeys(authentication, required, optional)
}

function exactAuthenticodeAuthentication(authentication) {
  return exactAuthenticationShape(authentication)
    && authentication.method === WINDOWS_AUTHENTICODE_METHOD
    && typeof authentication.policyId === 'string'
    && authentication.policyId.length > 0
}

function exactApprovedSigner(signer) {
  return hasExactKeys(signer, ['certificateSha256', 'subject', 'issuer'])
    && SHA256.test(signer.certificateSha256 || '')
    && typeof signer.subject === 'string'
    && signer.subject.length > 0
    && typeof signer.issuer === 'string'
    && signer.issuer.length > 0
}

export function inspectPostgres17PublisherPolicy(policy) {
  if (!hasExactKeys(policy, [
    'contract', 'policyId', 'status', 'testOnly', 'method', 'platform',
    'requiredSignatureType', 'timestampRequired', 'requiredEkuOids',
    'approvedSigners', 'approvedTimestampCertificateSha256', 'approval',
  ], ['blockers'])
    || policy.contract !== POSTGRES17_PUBLISHER_POLICY_CONTRACT
    || typeof policy.policyId !== 'string'
    || policy.policyId.length === 0
    || policy.method !== WINDOWS_AUTHENTICODE_METHOD
    || !hasExactKeys(policy.platform, ['os', 'arch'])
    || policy.platform.os !== 'windows'
    || policy.platform.arch !== 'x64'
    || policy.testOnly !== false
    || policy.requiredSignatureType !== 'Authenticode'
    || policy.timestampRequired !== true
    || !Array.isArray(policy.approvedSigners)
    || !policy.approvedSigners.every(exactApprovedSigner)
    || !Array.isArray(policy.requiredEkuOids)
    || !policy.requiredEkuOids.includes(CODE_SIGNING_EKU)
    || !Array.isArray(policy.approvedTimestampCertificateSha256)
    || !policy.approvedTimestampCertificateSha256.every((value) => SHA256.test(value || ''))
    || !hasExactKeys(policy.approval, ['status', 'reviewedBy', 'reviewedAt'])
    || (Object.hasOwn(policy, 'blockers')
      && (!Array.isArray(policy.blockers)
        || !policy.blockers.every((value) => typeof value === 'string')))) {
    fail('database_rehearsal_publisher_policy_invalid')
  }
  const blockers = []
  if (policy.status !== 'reviewed') blockers.push('publisher_policy_not_reviewed')
  if (policy.approvedSigners.length === 0) blockers.push('publisher_signer_not_pinned')
  if (policy.approvedTimestampCertificateSha256.length === 0) {
    blockers.push('publisher_timestamp_signer_not_pinned')
  }
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
  if (!hasExactKeys(profile, [
    'contract', 'profileId', 'status', 'testOnly', 'platform', 'postgres',
    'runtimeRootName', 'trustedBoundary', 'sources', 'bindings',
    'loadClosureComplete', 'loadClosure', 'approval',
  ], ['blockers'])
    || profile.contract !== POSTGRES17_TOOLCHAIN_PROFILE_CONTRACT
    || typeof profile.profileId !== 'string'
    || !hasExactKeys(profile.platform, ['os', 'arch'])
    || profile.platform.os !== 'windows'
    || profile.platform.arch !== 'x64'
    || !hasExactKeys(profile.postgres, ['version'])
    || !VERSION.test(profile.postgres.version || '')
    || !safeRelativePath(profile.runtimeRootName)
    || !Array.isArray(profile.sources)
    || !Array.isArray(profile.bindings)
    || !profile.sources.every(exactSource)
    || !profile.bindings.every(exactBinding)
    || !hasExactKeys(profile.trustedBoundary, [
      'method', 'singlePurpose', 'concurrentSameUserWorkloadsAllowed',
      'interactiveUsersAllowed', 'hostileSameUserMutationInScope',
    ])
    || !hasExactKeys(profile.loadClosure, [
      'status', 'captureMethod', 'evidencePath', 'evidenceBytes', 'evidenceSha256',
      'unexpectedNonSystemModules', 'systemModulePolicy',
    ])
    || !hasExactKeys(profile.approval, ['status', 'reviewedBy', 'reviewedAt'])
    || (Object.hasOwn(profile, 'blockers')
      && (!Array.isArray(profile.blockers)
        || !profile.blockers.every((value) => typeof value === 'string')))) {
    fail('database_rehearsal_toolchain_profile_invalid')
  }

  const sources = new Map()
  for (const source of profile.sources) {
    if (sources.has(source.sourceId)) fail('database_rehearsal_toolchain_source_duplicate')
    sources.set(source.sourceId, source)
  }
  const bindingIds = new Set()
  const foldedPaths = new Set()
  const singletonRoles = new Set()
  const usedSourceIds = new Set()
  const boundComponents = new Set()
  const executionBindings = {}
  for (const binding of profile.bindings) {
    if (bindingIds.has(binding.bindingId)) fail('database_rehearsal_toolchain_binding_duplicate')
    bindingIds.add(binding.bindingId)
    const folded = binding.relativePath.replace(/\\/g, '/').toLowerCase()
    if (foldedPaths.has(folded)) fail('database_rehearsal_toolchain_path_duplicate')
    foldedPaths.add(folded)
    const source = sources.get(binding.sourceId)
    if (!source) {
      blockers.push(`binding_source_missing:${binding.bindingId}`)
    } else {
      usedSourceIds.add(binding.sourceId)
      const expectedComponent = ROLE_COMPONENT.get(binding.role)
      if (expectedComponent && source.component !== expectedComponent) {
        blockers.push(`binding_component_mismatch:${binding.bindingId}`)
      } else if (expectedComponent) {
        boundComponents.add(expectedComponent)
        executionBindings[binding.role] = {
          bindingId: binding.bindingId,
          sourceId: binding.sourceId,
          relativePath: binding.relativePath.replace(/\\/g, '/'),
        }
      }
    }
    const requiredUse = ROLE_REQUIRED_USE.get(binding.role)
    if (requiredUse && !binding.uses.includes(requiredUse)) {
      blockers.push(`binding_use_mismatch:${binding.bindingId}`)
    }
    if (SINGLETON_ROLES.has(binding.role)) {
      if (singletonRoles.has(binding.role)) fail('database_rehearsal_toolchain_role_duplicate')
      singletonRoles.add(binding.role)
    }
    if (POSTGRES_EXECUTABLE_ROLES.has(binding.role)
      && !observedPostgresVersionMatches(binding.observedVersion, profile.postgres.version)) {
      blockers.push(`postgres_version_mismatch:${binding.role}`)
    }
  }

  if (profile.status !== 'reviewed') blockers.push('profile_not_reviewed')
  if (profile.testOnly !== false) blockers.push('synthetic_profile')
  if (profile.trustedBoundary.method !== TRUST_BOUNDARY
    || profile.trustedBoundary.singlePurpose !== true
    || profile.trustedBoundary.concurrentSameUserWorkloadsAllowed !== false
    || profile.trustedBoundary.interactiveUsersAllowed !== false
    || profile.trustedBoundary.hostileSameUserMutationInScope !== false) {
    blockers.push('trusted_boundary_unreviewed')
  }
  for (const component of REQUIRED_COMPONENTS) {
    if (!boundComponents.has(component)) blockers.push(`source_component_missing:${component}`)
  }
  for (const source of profile.sources) {
    if (!usedSourceIds.has(source.sourceId)) blockers.push(`source_unused:${source.sourceId}`)
    const authentication = source.authentication
    if (!exactAuthenticationShape(authentication)) {
      blockers.push(`source_authentication_invalid:${source.sourceId}`)
      continue
    }
    if (authentication.status !== 'reviewed' || !validBoundEvidence(authentication)) {
      blockers.push(`source_authentication_unverified:${source.sourceId}`)
    }
    if (profile.testOnly !== true
      && source.component === 'postgresql'
      && authentication.method !== WINDOWS_AUTHENTICODE_METHOD) {
      blockers.push(`postgresql_source_authentication_invalid:${source.sourceId}`)
    }
    if (authentication.method === WINDOWS_AUTHENTICODE_METHOD) {
      if (!exactAuthenticodeAuthentication(authentication) || !source.fileName.toLowerCase().endsWith('.exe')) {
        blockers.push(`source_authentication_invalid:${source.sourceId}`)
      } else if (profile.testOnly !== true) {
        blockers.push(`source_authentication_runtime_verification_required:${source.sourceId}`)
      }
    } else if (authentication.method === REVIEWED_SOURCE_DIGEST_METHOD) {
      if (profile.testOnly !== true) {
        blockers.push(`source_authentication_production_unsupported:${source.sourceId}`)
      }
    } else {
      blockers.push(`source_authentication_unsupported:${source.sourceId}`)
    }
  }
  if (profile.loadClosureComplete !== true) blockers.push('load_closure_incomplete')
  if (profile.loadClosure.status !== 'reviewed'
    || profile.loadClosure.captureMethod !== 'windows-process-tree-runtime-closure-v1'
    || profile.loadClosure.unexpectedNonSystemModules !== 0
    || profile.loadClosure.systemModulePolicy !== SYSTEM_MODULE_POLICY
    || !validBoundEvidence(profile.loadClosure)) {
    blockers.push('load_closure_evidence_unverified')
  }
  if (!validApproval(profile.approval)) blockers.push('independent_approval_missing')
  for (const role of REQUIRED_ROLES) {
    if (!singletonRoles.has(role)) blockers.push(`binding_missing:${role}`)
  }
  return {
    contract: POSTGRES17_TOOLCHAIN_PROFILE_CONTRACT,
    profileId: profile.profileId,
    ready: blockers.length === 0,
    blockers,
    sourceCount: profile.sources.length,
    bindingCount: profile.bindings.length,
    executionBindings,
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
  return hasExactKeys(value, [
    'contract', 'artifactFileName', 'artifactBytes', 'artifactSha256',
    'signatureStatus', 'signatureType', 'signerCertificateSha256',
    'signerSubject', 'signerIssuer', 'timestampCertificateSha256',
    'timestampSubject', 'ekuOids',
  ])
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
  if (!hasExactKeys(evidence, [
    'contract', 'captureMethod', 'systemModulePolicy',
    'unexpectedNonSystemModules', 'files',
  ])
    || evidence.contract !== WINDOWS_LOAD_CLOSURE_CONTRACT
    || evidence.captureMethod !== 'windows-process-tree-runtime-closure-v1'
    || evidence.systemModulePolicy !== SYSTEM_MODULE_POLICY
    || evidence.unexpectedNonSystemModules !== 0
    || !Array.isArray(evidence.files)) {
    fail('database_rehearsal_load_closure_invalid')
  }
  const normalize = (files) => files.map((file) => {
    if (!hasExactKeys(file, [
      'bindingId', 'sourceId', 'relativePath', 'bytes', 'sha256', 'uses',
    ])
      || typeof file.bindingId !== 'string'
      || typeof file.sourceId !== 'string'
      || !safeRelativePath(file.relativePath)
      || !Number.isSafeInteger(file.bytes) || file.bytes < 0
      || !SHA256.test(file.sha256 || '')
      || !Array.isArray(file.uses) || file.uses.length === 0
      || file.uses.some((use) => !USE_KINDS.has(use))) {
      fail('database_rehearsal_load_closure_invalid')
    }
    return { bindingId: file.bindingId, sourceId: file.sourceId,
      relativePath: file.relativePath.replace(/\\/g, '/'), bytes: file.bytes,
      sha256: file.sha256, uses: [...file.uses].sort() }
  }).sort((left, right) => left.bindingId.localeCompare(right.bindingId))
  const expected = normalize(profile.bindings.map(({
    bindingId, sourceId, relativePath, bytes, sha256, uses,
  }) => ({ bindingId, sourceId, relativePath, bytes, sha256, uses })))
  const observed = normalize(evidence.files)
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
  source,
  policy,
  evidence,
  observed,
}) {
  const authentication = source.authentication
  if (authentication.method !== WINDOWS_AUTHENTICODE_METHOD) {
    fail('database_rehearsal_publisher_authentication_unsupported')
  }
  const policyInspection = inspectPostgres17PublisherPolicy(policy)
  if (!policyInspection.ready || authentication.policyId !== policy.policyId) {
    fail('database_rehearsal_publisher_policy_unapproved')
  }
  if (!exactAuthenticodeObservation(evidence)
    || !exactAuthenticodeObservation(observed)
    || evidence.artifactSha256 !== source.sha256
    || observed.artifactSha256 !== source.sha256
    || evidence.artifactFileName !== source.fileName
    || observed.artifactFileName !== source.fileName
    || evidence.artifactBytes !== source.bytes
    || observed.artifactBytes !== source.bytes
    || !sameAuthenticodeObservation(evidence, observed)) {
    fail('database_rehearsal_authenticode_observation_mismatch')
  }
  const approvedSigner = policy.approvedSigners.find((signer) =>
    signer.certificateSha256 === observed.signerCertificateSha256
    && signer.subject === observed.signerSubject
    && signer.issuer === observed.signerIssuer)
  if (!approvedSigner) fail('database_rehearsal_authenticode_signer_unapproved')
  if (!policy.approvedTimestampCertificateSha256.includes(observed.timestampCertificateSha256)) {
    fail('database_rehearsal_authenticode_timestamp_unapproved')
  }
  for (const requiredEku of policy.requiredEkuOids) {
    if (!observed.ekuOids.includes(requiredEku)) {
      fail('database_rehearsal_authenticode_eku_missing')
    }
  }
  return {
    policyId: policy.policyId,
    sourceId: source.sourceId,
    signerCertificateSha256: observed.signerCertificateSha256,
    sourceArtifactSha256: observed.artifactSha256,
    timestampCertificateSha256: observed.timestampCertificateSha256,
  }
}

async function verifySourceAuthentication({ source, manifestPath, sourcePath, publisherPolicyPath }) {
  const policyBytes = await readFile(publisherPolicyPath)
  const policy = parseJsonEvidence(policyBytes, 'database_rehearsal_publisher_policy_invalid')
  const authentication = source.authentication
  const evidence = parseJsonEvidence(
    await readFile(resolve(dirname(manifestPath), authentication.evidencePath)),
    'database_rehearsal_source_authentication_invalid',
  )
  if (authentication.method === WINDOWS_AUTHENTICODE_METHOD) {
    return {
      ...verifyWindowsAuthenticodePublisherEvidence({
        source, policy, evidence, observed: await inspectWindowsAuthenticode(sourcePath),
      }),
      evidenceSha256: authentication.evidenceSha256,
    }
  }
  if (authentication.method !== REVIEWED_SOURCE_DIGEST_METHOD
    || !hasExactKeys(evidence, [
      'contract', 'status', 'sourceId', 'artifactBytes', 'artifactSha256',
    ])
    || evidence.contract !== 'supermega.reviewed-source-digest.v1'
    || evidence.status !== 'reviewed'
    || evidence.sourceId !== source.sourceId
    || evidence.artifactSha256 !== source.sha256
    || evidence.artifactBytes !== source.bytes) {
    fail('database_rehearsal_source_authentication_invalid')
  }
  return { sourceId: source.sourceId, sourceArtifactSha256: source.sha256,
    evidenceSha256: authentication.evidenceSha256 }
}

export async function verifyPostgres17ToolchainProfile({
  manifestPath,
  archivePath = null,
  sourcePaths = {},
  extractedRoot = null,
  allowSynthetic = false,
  requireHostPlatform = false,
  publisherPolicyPath = defaultPublisherPolicyPath,
}) {
  const manifestMetadata = await lstat(manifestPath)
  if (!manifestMetadata.isFile() || manifestMetadata.isSymbolicLink()) {
    fail('database_rehearsal_toolchain_profile_file_invalid')
  }
  const manifestBytes = await readFile(manifestPath)
  const profile = parseJsonEvidence(manifestBytes, 'database_rehearsal_toolchain_profile_invalid')
  const inspection = inspectPostgres17ToolchainProfile(profile)
  const ignoredBlockers = new Set()
  if (allowSynthetic && profile.testOnly === true) ignoredBlockers.add('synthetic_profile')
  for (const source of profile.sources) {
    if (profile.testOnly === false && source.authentication.method === WINDOWS_AUTHENTICODE_METHOD) {
      ignoredBlockers.add(`source_authentication_runtime_verification_required:${source.sourceId}`)
    }
  }
  const blockers = inspection.blockers.filter((blocker) => !ignoredBlockers.has(blocker))
  if (blockers.length > 0) fail('database_rehearsal_toolchain_provenance_unapproved')
  if (requireHostPlatform
    && (process.platform !== 'win32' || process.arch !== 'x64')) {
    fail('database_rehearsal_toolchain_host_mismatch')
  }
  const primary = profile.sources.find(({ component }) => component === 'postgresql')
  if (!primary) fail('database_rehearsal_toolchain_source_missing')
  if (archivePath !== null) sourcePaths = { ...sourcePaths, [primary.sourceId]: archivePath }
  const sourceAuthentication = []
  for (const source of profile.sources) {
    const sourcePath = sourcePaths[source.sourceId]
    if (typeof sourcePath !== 'string' || basename(sourcePath) !== source.fileName) {
      fail('database_rehearsal_toolchain_source_path_missing')
    }
    await verifyRegularFile(sourcePath, source)
    await verifyRegularFile(
      resolve(dirname(manifestPath), source.authentication.evidencePath),
      { bytes: source.authentication.evidenceBytes, sha256: source.authentication.evidenceSha256 },
      dirname(manifestPath),
    )
    sourceAuthentication.push(await verifySourceAuthentication({
      source, manifestPath, sourcePath, publisherPolicyPath,
    }))
  }
  extractedRoot ??= resolve(dirname(sourcePaths[primary.sourceId]), profile.runtimeRootName)
  const expectedRoot = resolve(extractedRoot)
  const rootMetadata = await lstat(extractedRoot)
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()
    || basename(extractedRoot) !== profile.runtimeRootName
    || await realpath(extractedRoot) !== expectedRoot) {
    fail('database_rehearsal_toolchain_profile_root_mismatch')
  }
  const closurePath = resolve(dirname(manifestPath), profile.loadClosure.evidencePath)
  await verifyRegularFile(closurePath, { bytes: profile.loadClosure.evidenceBytes,
    sha256: profile.loadClosure.evidenceSha256 }, dirname(manifestPath))
  verifyWindowsLoadClosureEvidence(profile,
    parseJsonEvidence(await readFile(closurePath), 'database_rehearsal_load_closure_invalid'))
  const execution = {}
  for (const binding of profile.bindings) {
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
    if (SINGLETON_ROLES.has(binding.role)) {
      execution[binding.role] = resolve(extractedRoot, binding.relativePath)
    }
  }
  const postgresBin = dirname(execution.postgres)
  for (const role of POSTGRES_EXECUTABLE_ROLES) {
    if (dirname(execution[role]) !== postgresBin) {
      fail('database_rehearsal_toolchain_postgres_bin_incomplete')
    }
  }
  const policyBytes = await readFile(publisherPolicyPath)
  const sourceDigest = createHash('sha256').update(JSON.stringify(profile.sources)).digest('hex')
  const bindingDigest = createHash('sha256').update(JSON.stringify(profile.bindings)).digest('hex')
  const verified = {
    ...inspection,
    ready: true,
    profileId: profile.profileId,
    manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
    policySha256: createHash('sha256').update(policyBytes).digest('hex'),
    sourceDigest,
    bindingDigest,
    executionBundleSha256: bindingDigest,
    archiveSha256: primary.sha256,
    archiveBytes: primary.bytes,
    archiveFileName: primary.fileName,
    archivePath: sourcePaths[primary.sourceId],
    postgresVersion: profile.postgres.version,
    sourceAuthenticationEvidenceSha256: primary.authentication.evidenceSha256,
    loadClosureEvidenceSha256: profile.loadClosure.evidenceSha256,
    sourceAuthentication,
    publisherAuthentication: sourceAuthentication.find(({ sourceId }) => sourceId === primary.sourceId),
    execution: {
      root: expectedRoot,
      postgresBin,
      openssl: execution.openssl,
      python: execution.python,
      psycopg: execution.psycopg,
      node: execution.node,
      git: execution.git,
    },
  }
  verified.receiptEvidence = toolchainReceiptEvidence(verified)
  return verified
}

export function toolchainReceiptEvidence(verified) {
  const rawSourceAuthentication = [...(verified.sourceAuthentication || [])]
  const sourceAuthentication = rawSourceAuthentication
    .map((value) => {
      const digestShape = [
        'sourceId', 'sourceArtifactSha256', 'evidenceSha256',
      ]
      const authenticodeShape = [
        ...digestShape, 'policyId', 'signerCertificateSha256',
        'timestampCertificateSha256',
      ]
      if (!hasExactKeys(value, value.policyId === undefined ? digestShape : authenticodeShape)) {
        fail('database_rehearsal_toolchain_receipt_evidence_invalid')
      }
      const base = {
        sourceId: value.sourceId,
        sourceArtifactSha256: value.sourceArtifactSha256,
        evidenceSha256: value.evidenceSha256,
      }
      if (value.policyId === undefined) return base
      return {
        ...base,
        policyId: value.policyId,
        signerCertificateSha256: value.signerCertificateSha256,
        timestampCertificateSha256: value.timestampCertificateSha256,
      }
    })
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId))
  if (typeof verified.profileId !== 'string' || verified.profileId.length === 0
    || ![verified.manifestSha256, verified.policySha256, verified.sourceDigest,
      verified.bindingDigest, verified.executionBundleSha256,
      verified.loadClosureEvidenceSha256].every((value) => SHA256.test(value || ''))
    || sourceAuthentication.length === 0
    || sourceAuthentication.some((value) => typeof value.sourceId !== 'string'
      || !SHA256.test(value.sourceArtifactSha256 || '')
      || !SHA256.test(value.evidenceSha256 || ''))) {
    fail('database_rehearsal_toolchain_receipt_evidence_invalid')
  }
  return {
    contract: 'supermega.postgres17-toolchain-receipt-evidence.v1',
    profileId: verified.profileId,
    manifestSha256: verified.manifestSha256,
    policySha256: verified.policySha256,
    sourceDigest: verified.sourceDigest,
    bindingDigest: verified.bindingDigest,
    executionBundleSha256: verified.executionBundleSha256,
    loadClosureEvidenceSha256: verified.loadClosureEvidenceSha256,
    sourceAuthentication,
  }
}

export async function sourceControlledToolchainReceiptEvidence({
  manifestPath,
  publisherPolicyPath = defaultPublisherPolicyPath,
  allowSynthetic = false,
}) {
  const manifestBytes = await readFile(manifestPath)
  const profile = parseJsonEvidence(manifestBytes, 'database_rehearsal_toolchain_profile_invalid')
  const inspection = inspectPostgres17ToolchainProfile(profile)
  const blockers = inspection.blockers.filter((blocker) =>
    !blocker.startsWith('source_authentication_runtime_verification_required:')
      && !(allowSynthetic && blocker === 'synthetic_profile'))
  if (blockers.length > 0) fail('database_rehearsal_toolchain_provenance_unapproved')
  const policyBytes = await readFile(publisherPolicyPath)
  const policy = parseJsonEvidence(policyBytes, 'database_rehearsal_publisher_policy_invalid')
  if (!inspectPostgres17PublisherPolicy(policy).ready) {
    fail('database_rehearsal_publisher_policy_unapproved')
  }
  const sourceAuthentication = []
  for (const source of profile.sources) {
    const authentication = source.authentication
    const evidencePath = resolve(dirname(manifestPath), authentication.evidencePath)
    await verifyRegularFile(evidencePath, {
      bytes: authentication.evidenceBytes,
      sha256: authentication.evidenceSha256,
    }, dirname(manifestPath))
    const evidence = parseJsonEvidence(
      await readFile(evidencePath),
      'database_rehearsal_source_authentication_invalid',
    )
    if (authentication.method === WINDOWS_AUTHENTICODE_METHOD) {
      sourceAuthentication.push({
        ...verifyWindowsAuthenticodePublisherEvidence({
          source, policy, evidence, observed: evidence,
        }),
        evidenceSha256: authentication.evidenceSha256,
      })
    } else {
      if (authentication.method !== REVIEWED_SOURCE_DIGEST_METHOD
        || !hasExactKeys(evidence, [
          'contract', 'status', 'sourceId', 'artifactBytes', 'artifactSha256',
        ])
        || evidence.contract !== 'supermega.reviewed-source-digest.v1'
        || evidence.status !== 'reviewed'
        || evidence.sourceId !== source.sourceId
        || evidence.artifactSha256 !== source.sha256
        || evidence.artifactBytes !== source.bytes) {
        fail('database_rehearsal_source_authentication_invalid')
      }
      sourceAuthentication.push({ sourceId: source.sourceId,
        sourceArtifactSha256: source.sha256,
        evidenceSha256: authentication.evidenceSha256 })
    }
  }
  const closurePath = resolve(dirname(manifestPath), profile.loadClosure.evidencePath)
  await verifyRegularFile(closurePath, {
    bytes: profile.loadClosure.evidenceBytes,
    sha256: profile.loadClosure.evidenceSha256,
  }, dirname(manifestPath))
  verifyWindowsLoadClosureEvidence(profile,
    parseJsonEvidence(await readFile(closurePath), 'database_rehearsal_load_closure_invalid'))
  return toolchainReceiptEvidence({
    profileId: profile.profileId,
    manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
    policySha256: createHash('sha256').update(policyBytes).digest('hex'),
    sourceDigest: createHash('sha256').update(JSON.stringify(profile.sources)).digest('hex'),
    bindingDigest: createHash('sha256').update(JSON.stringify(profile.bindings)).digest('hex'),
    executionBundleSha256: createHash('sha256').update(JSON.stringify(profile.bindings)).digest('hex'),
    loadClosureEvidenceSha256: profile.loadClosure.evidenceSha256,
    sourceAuthentication,
  })
}
