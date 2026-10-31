import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

export const OFFICIAL_REGISTRY_SOURCE_METHOD = 'official-registry-artifact-v1'
export const OFFICIAL_REGISTRY_POLICY_CONTRACT =
  'supermega.postgres17-official-registry-policy.v1'
export const OFFICIAL_REGISTRY_OBSERVATION_CONTRACT =
  'supermega.postgres17-official-registry-observation.v1'
export const PYPI_RELEASE_JSON_METHOD = 'pypi-release-json-v1'
export const WINDOWS_AUTHENTICODE_ARTIFACT_METHOD = 'windows-authenticode-artifact-v1'
export const AUTHENTICATED_BUNDLE_MEMBER_METHOD = 'authenticated-bundle-member-v1'

const COMPONENT_METHODS = new Map([
  ['postgresql', new Set([WINDOWS_AUTHENTICODE_ARTIFACT_METHOD])],
  ['python', new Set([WINDOWS_AUTHENTICODE_ARTIFACT_METHOD])],
  ['psycopg', new Set([PYPI_RELEASE_JSON_METHOD])],
  ['psycopg_binary', new Set([PYPI_RELEASE_JSON_METHOD])],
  ['openssl', new Set([AUTHENTICATED_BUNDLE_MEMBER_METHOD])],
  ['node', new Set([WINDOWS_AUTHENTICODE_ARTIFACT_METHOD])],
  ['git', new Set([WINDOWS_AUTHENTICODE_ARTIFACT_METHOD])],
])
const REQUIRED_COMPONENTS = Object.freeze([
  'python', 'psycopg', 'psycopg_binary', 'openssl', 'node', 'git',
])

const SHA256 = /^[0-9a-f]{64}$/
const HTTPS_URL = /^https:\/\/([^/]+)\/(.+)$/

function fail(code) { throw new Error(code) }
function object(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) }
function exact(value, required, optional = []) {
  if (!object(value)) return false
  const allowed = new Set([...required, ...optional])
  return required.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => allowed.has(key))
}
function validUrl(value, expectedHost) {
  const match = typeof value === 'string' && value.match(HTTPS_URL)
  return Boolean(match) && match[1].toLowerCase() === expectedHost.toLowerCase()
    && !value.includes('#') && !value.includes('?')
}
function validApproval(value) {
  return exact(value, ['status', 'reviewedBy', 'reviewedAt'])
    && value.status === 'reviewed'
    && typeof value.reviewedBy === 'string' && value.reviewedBy.trim().length > 0
    && value.reviewedBy === value.reviewedBy.trim()
    && Number.isFinite(Date.parse(value.reviewedAt))
}
function exactOfficialAuthenticodeLocation(value) {
  const required = {
    postgresql: ['get.enterprisedb.com', 'PostgreSQL'],
    python: ['www.python.org', 'Python'],
    node: ['nodejs.org', 'Node.js'],
    git: ['github.com', 'Git for Windows'],
  }[value.component]
  return Boolean(required) && value.artifactHost === required[0]
    && value.metadataHost === required[0] && value.packageName === required[1]
}
function exactArtifact(value) {
  return exact(value, [
    'sourceId', 'component', 'artifactHost', 'metadataHost', 'artifactUrl', 'metadataUrl',
    'packageName', 'packageVersion', 'platform', 'fileName', 'bytes', 'sha256',
    'metadataKind', 'metadataBytes', 'metadataSha256', 'authenticationMethod',
    'authenticationRequirements',
  ])
    && typeof value.sourceId === 'string' && value.sourceId.length > 0
    && COMPONENT_METHODS.has(value.component)
    && typeof value.artifactHost === 'string' && value.artifactHost.length > 0
    && typeof value.metadataHost === 'string' && value.metadataHost.length > 0
    && validUrl(value.artifactUrl, value.artifactHost)
    && validUrl(value.metadataUrl, value.metadataHost)
    && COMPONENT_METHODS.get(value.component)?.has(value.authenticationMethod)
    && typeof value.packageName === 'string' && value.packageName.length > 0
    && typeof value.packageVersion === 'string' && value.packageVersion.length > 0
    && typeof value.platform === 'string' && value.platform.length > 0
    && value.fileName === basename(value.fileName || '')
    && (value.authenticationMethod === AUTHENTICATED_BUNDLE_MEMBER_METHOD
      || value.artifactUrl.endsWith(`/${value.fileName}`))
    && Number.isSafeInteger(value.bytes) && value.bytes > 0
    && Number.isSafeInteger(value.metadataBytes) && value.metadataBytes > 0
    && ((['psycopg', 'psycopg_binary'].includes(value.component)
      && value.metadataKind === 'pypi-json-v1'
      && value.authenticationMethod === PYPI_RELEASE_JSON_METHOD
      && value.artifactHost === 'files.pythonhosted.org' && value.metadataHost === 'pypi.org')
      || (['postgresql', 'python', 'node', 'git'].includes(value.component)
        && value.metadataKind === 'windows-authenticode-observation-v1'
        && value.authenticationMethod === WINDOWS_AUTHENTICODE_ARTIFACT_METHOD
        && exactOfficialAuthenticodeLocation(value))
      || (value.component === 'openssl' && value.metadataKind === 'bundle-entry-manifest-v1'
        && value.authenticationMethod === AUTHENTICATED_BUNDLE_MEMBER_METHOD))
    && exactAuthenticationRequirements(value)
    && (value.authenticationMethod !== WINDOWS_AUTHENTICODE_ARTIFACT_METHOD
      || (value.metadataUrl === value.artifactUrl
        && value.authenticationRequirements.evidenceBytes === value.metadataBytes
        && value.authenticationRequirements.evidenceSha256 === value.metadataSha256))
    && (value.authenticationMethod !== AUTHENTICATED_BUNDLE_MEMBER_METHOD
      || (value.authenticationRequirements.inventoryEvidenceBytes === value.metadataBytes
        && value.authenticationRequirements.inventoryEvidenceSha256 === value.metadataSha256))
    && SHA256.test(value.sha256 || '') && SHA256.test(value.metadataSha256 || '')
}

function exactAuthenticationRequirements(value) {
  const requirements = value.authenticationRequirements
  if (!object(requirements)) return false
  if (value.authenticationMethod === PYPI_RELEASE_JSON_METHOD) {
    return exact(requirements, ['nonYanked', 'packageType', 'requiredWheelTag'])
      && requirements.nonYanked === true && requirements.packageType === 'bdist_wheel'
      && typeof requirements.requiredWheelTag === 'string'
      && /^[a-z0-9_.]+-[a-z0-9_.]+-[a-z0-9_.]+$/i.test(requirements.requiredWheelTag)
      && value.fileName.toLowerCase().endsWith(
        `-${requirements.requiredWheelTag.toLowerCase()}.whl`)
  }
  if (value.authenticationMethod === WINDOWS_AUTHENTICODE_ARTIFACT_METHOD) {
    return exact(requirements, ['evidencePath', 'evidenceBytes',
      'evidenceSha256', 'requiredEkuOids', 'signerCertificateSha256',
      'timestampCertificateSha256'])
      && /\.(?:exe|msi)$/i.test(value.fileName)
      && typeof requirements.evidencePath === 'string' && requirements.evidencePath.length > 0
      && Number.isSafeInteger(requirements.evidenceBytes) && requirements.evidenceBytes > 0
      && SHA256.test(requirements.evidenceSha256 || '')
      && Array.isArray(requirements.requiredEkuOids)
      && requirements.requiredEkuOids.includes('1.3.6.1.5.5.7.3.3')
      && SHA256.test(requirements.signerCertificateSha256 || '')
      && SHA256.test(requirements.timestampCertificateSha256 || '')
  }
  if (value.authenticationMethod === AUTHENTICATED_BUNDLE_MEMBER_METHOD) {
    return exact(requirements, ['parentSourceId', 'bundleRelativePath', 'inventoryEvidencePath',
      'inventoryEvidenceBytes', 'inventoryEvidenceSha256'])
      && typeof requirements.parentSourceId === 'string'
      && requirements.parentSourceId.length > 0
      && typeof requirements.bundleRelativePath === 'string'
      && requirements.bundleRelativePath.length > 0
      && !requirements.bundleRelativePath.startsWith('/')
      && !requirements.bundleRelativePath.startsWith('\\')
      && !requirements.bundleRelativePath.includes(':')
      && !requirements.bundleRelativePath.split(/[\\/]/).includes('..')
      && typeof requirements.inventoryEvidencePath === 'string'
      && requirements.inventoryEvidencePath.length > 0
      && Number.isSafeInteger(requirements.inventoryEvidenceBytes)
      && requirements.inventoryEvidenceBytes > 0
      && SHA256.test(requirements.inventoryEvidenceSha256 || '')
  }
  return false
}

export function inspectOfficialRegistryPolicy(policy) {
  if (!exact(policy, [
    'contract', 'policyId', 'status', 'testOnly', 'requiredComponents', 'artifacts', 'approval',
  ], ['blockers'])
    || policy.contract !== OFFICIAL_REGISTRY_POLICY_CONTRACT
    || typeof policy.policyId !== 'string' || policy.policyId.length === 0
    || policy.testOnly !== false || !Array.isArray(policy.requiredComponents)
    || policy.requiredComponents.length !== REQUIRED_COMPONENTS.length
    || new Set(policy.requiredComponents).size !== policy.requiredComponents.length
    || !REQUIRED_COMPONENTS.every((value) =>
      policy.requiredComponents.includes(value))
    || !Array.isArray(policy.artifacts)
    || !policy.artifacts.every(exactArtifact)
    || (Object.hasOwn(policy, 'blockers')
      && (!Array.isArray(policy.blockers)
        || !policy.blockers.every((value) => typeof value === 'string')))) {
    fail('database_rehearsal_registry_policy_invalid')
  }
  const blockers = []
  if (policy.status !== 'reviewed') blockers.push('registry_policy_not_reviewed')
  if (!validApproval(policy.approval)) blockers.push('registry_policy_independent_approval_missing')
  const ids = new Set()
  const urls = new Set()
  const components = new Set()
  const componentCounts = new Map()
  for (const artifact of policy.artifacts) {
    if (ids.has(artifact.sourceId)) blockers.push(`registry_source_duplicate:${artifact.sourceId}`)
    if (artifact.authenticationMethod !== AUTHENTICATED_BUNDLE_MEMBER_METHOD) {
      if (urls.has(artifact.artifactUrl)) blockers.push(`registry_artifact_duplicate:${artifact.sourceId}`)
      urls.add(artifact.artifactUrl)
    }
    ids.add(artifact.sourceId); components.add(artifact.component)
    componentCounts.set(artifact.component, (componentCounts.get(artifact.component) || 0) + 1)
  }
  for (const component of policy.requiredComponents) {
    if (!components.has(component)) blockers.push(`registry_component_missing:${component}`)
    if ((componentCounts.get(component) || 0) > 1) {
      blockers.push(`registry_component_duplicate:${component}`)
    }
  }
  if ((componentCounts.get('postgresql') || 0) !== 1) {
    blockers.push((componentCounts.get('postgresql') || 0) === 0
      ? 'registry_bundle_parent_missing:postgresql'
      : 'registry_component_duplicate:postgresql')
  }
  const psycopg = policy.artifacts.find(({ component }) => component === 'psycopg')
  const psycopgBinary = policy.artifacts.find(({ component }) => component === 'psycopg_binary')
  if (psycopg && psycopgBinary
    && psycopg.packageVersion !== psycopgBinary.packageVersion) {
    blockers.push('registry_psycopg_pair_mismatch')
  }
  for (const artifact of policy.artifacts) {
    if (artifact.authenticationMethod === AUTHENTICATED_BUNDLE_MEMBER_METHOD) {
      const parent = policy.artifacts.find(({ sourceId }) =>
        sourceId === artifact.authenticationRequirements.parentSourceId)
      if (!parent || parent.component !== 'postgresql'
        || parent.authenticationMethod !== WINDOWS_AUTHENTICODE_ARTIFACT_METHOD) {
        blockers.push(`registry_bundle_parent_invalid:${artifact.sourceId}`)
      } else if (artifact.artifactUrl !== parent.artifactUrl
        || artifact.artifactHost !== parent.artifactHost
        || artifact.packageVersion !== parent.packageVersion
        || artifact.platform !== parent.platform) {
        blockers.push(`registry_bundle_parent_mismatch:${artifact.sourceId}`)
      }
    }
  }
  return { policyId: policy.policyId, ready: blockers.length === 0, blockers,
    artifactCount: policy.artifacts.length }
}

function verifyOfficialRegistryEvidenceInternal({
  source, authentication, policy, evidence, observedAuthentication = null,
  verifiedParentAuthentication = null,
  reconstructionOnly = false,
}) {
  const inspection = inspectOfficialRegistryPolicy(policy)
  if (!inspection.ready || authentication.method !== OFFICIAL_REGISTRY_SOURCE_METHOD
    || authentication.policyId !== policy.policyId) {
    fail('database_rehearsal_registry_policy_unapproved')
  }
  if (!exact(evidence, [
    'contract', 'status', 'sourceId', 'component', 'artifactHost', 'metadataHost', 'artifactUrl',
    'metadataUrl', 'packageName', 'packageVersion', 'platform', 'fileName',
    'artifactBytes', 'artifactSha256', 'metadataKind', 'metadataBytes',
    'metadataSha256', 'authenticationMethod', 'authenticationRequirements', 'retainedMetadata',
    'retainedAuthenticationEvidence', 'approval',
  ])
    || evidence.contract !== OFFICIAL_REGISTRY_OBSERVATION_CONTRACT
    || evidence.status !== 'reviewed' || !validApproval(evidence.approval)
    || evidence.approval.reviewedBy.toLowerCase() === policy.approval.reviewedBy.toLowerCase()
    || !exact(evidence.retainedMetadata, ['mediaType', 'bodyBase64'])
    || typeof evidence.retainedMetadata.mediaType !== 'string'
    || !['application/json', 'text/plain'].includes(evidence.retainedMetadata.mediaType)
    || typeof evidence.retainedMetadata.bodyBase64 !== 'string'
    || evidence.retainedMetadata.bodyBase64.length === 0) {
    fail('database_rehearsal_registry_evidence_invalid')
  }
  const allowed = policy.artifacts.find(({ sourceId }) => sourceId === source.sourceId)
  if (!allowed || allowed.component !== source.component || allowed.fileName !== source.fileName
    || allowed.bytes !== source.bytes || allowed.sha256 !== source.sha256) {
    fail('database_rehearsal_registry_source_unapproved')
  }
  const expected = {
    sourceId: allowed.sourceId, component: allowed.component,
    artifactHost: allowed.artifactHost, metadataHost: allowed.metadataHost,
    artifactUrl: allowed.artifactUrl,
    metadataUrl: allowed.metadataUrl, packageName: allowed.packageName,
    packageVersion: allowed.packageVersion, platform: allowed.platform,
    fileName: allowed.fileName, artifactBytes: allowed.bytes,
    artifactSha256: allowed.sha256, metadataKind: allowed.metadataKind,
    metadataBytes: allowed.metadataBytes, metadataSha256: allowed.metadataSha256,
    authenticationMethod: allowed.authenticationMethod,
    authenticationRequirements: allowed.authenticationRequirements,
  }
  for (const [key, value] of Object.entries(expected)) {
    const matches = object(value)
      ? JSON.stringify(evidence[key]) === JSON.stringify(value)
      : evidence[key] === value
    if (!matches) fail('database_rehearsal_registry_evidence_mismatch')
  }
  // A URL and digest alone never authenticate production input. Both retained
  // official metadata and a separate human approval are mandatory and bound.
  let retainedMetadata
  try { retainedMetadata = Buffer.from(evidence.retainedMetadata.bodyBase64, 'base64') } catch {
    fail('database_rehearsal_registry_metadata_unretained')
  }
  if (retainedMetadata.length !== allowed.metadataBytes || retainedMetadata.length > 1024 * 1024
    || retainedMetadata.toString('base64') !== evidence.retainedMetadata.bodyBase64
    || createHash('sha256').update(retainedMetadata).digest('hex') !== allowed.metadataSha256) {
    fail('database_rehearsal_registry_metadata_unretained')
  }
  const separateEvidence = (() => {
    const requirements = allowed.authenticationRequirements
    if (allowed.authenticationMethod === WINDOWS_AUTHENTICODE_ARTIFACT_METHOD) {
      return { bytes: requirements.evidenceBytes, sha256: requirements.evidenceSha256 }
    }
    return null
  })()
  if (separateEvidence) {
    if (!exact(evidence.retainedAuthenticationEvidence, ['mediaType', 'bodyBase64'])
      || evidence.retainedAuthenticationEvidence.mediaType !== 'application/json'
      || typeof evidence.retainedAuthenticationEvidence.bodyBase64 !== 'string') {
      fail('database_rehearsal_registry_authentication_evidence_unretained')
    }
    const authenticationBytes = Buffer.from(
      evidence.retainedAuthenticationEvidence.bodyBase64,
      'base64',
    )
    if (authenticationBytes.length !== separateEvidence.bytes
      || authenticationBytes.length > 1024 * 1024
      || authenticationBytes.toString('base64')
        !== evidence.retainedAuthenticationEvidence.bodyBase64
      || createHash('sha256').update(authenticationBytes).digest('hex')
        !== separateEvidence.sha256) {
      fail('database_rehearsal_registry_authentication_evidence_unretained')
    }
  } else if (evidence.retainedAuthenticationEvidence !== null) {
    fail('database_rehearsal_registry_authentication_evidence_unexpected')
  }
  let authenticationEvidence = null
  if (separateEvidence) {
    try {
      authenticationEvidence = JSON.parse(Buffer.from(
        evidence.retainedAuthenticationEvidence.bodyBase64,
        'base64',
      ).toString('utf8'))
    } catch { fail('database_rehearsal_registry_authentication_evidence_invalid') }
  }
  if (allowed.authenticationMethod === PYPI_RELEASE_JSON_METHOD) {
    let metadata
    try { metadata = JSON.parse(retainedMetadata.toString('utf8')) } catch {
      fail('database_rehearsal_registry_metadata_invalid')
    }
    const file = metadata?.urls?.find((candidate) => candidate?.filename === allowed.fileName)
    const expectedPackage = allowed.component === 'psycopg'
      ? 'psycopg' : allowed.component === 'psycopg_binary' ? 'psycopg-binary' : null
    if (allowed.packageName !== expectedPackage || metadata?.info?.name !== allowed.packageName
      || metadata?.info?.version !== allowed.packageVersion
      || file?.packagetype !== 'bdist_wheel'
      || file?.url !== allowed.artifactUrl
      || file?.yanked !== false
      || file?.size !== allowed.bytes
      || file?.digests?.sha256 !== allowed.sha256
      || !allowed.fileName.toLowerCase().includes(allowed.platform.toLowerCase())) {
      fail('database_rehearsal_registry_metadata_binding_invalid')
    }
  } else if (allowed.authenticationMethod === WINDOWS_AUTHENTICODE_ARTIFACT_METHOD) {
    const requirements = allowed.authenticationRequirements
    const observationKeys = ['contract', 'artifactFileName', 'artifactBytes',
      'artifactSha256', 'signatureStatus', 'signatureType', 'signerCertificateSha256',
      'signerSubject', 'signerIssuer', 'timestampCertificateSha256', 'timestampSubject',
      'ekuOids']
    const effectiveObservation = reconstructionOnly
      ? authenticationEvidence : observedAuthentication
    if (!retainedMetadata.equals(Buffer.from(
      evidence.retainedAuthenticationEvidence.bodyBase64,
      'base64',
    )) || !exact(authenticationEvidence, observationKeys)
      || !exact(effectiveObservation, observationKeys)
      || authenticationEvidence.contract !== 'supermega.windows-authenticode-observation.v1'
      || effectiveObservation.contract !== authenticationEvidence.contract
      || !observationKeys.every((key) => object(authenticationEvidence[key])
        || Array.isArray(authenticationEvidence[key])
        ? JSON.stringify(effectiveObservation[key]) === JSON.stringify(authenticationEvidence[key])
        : effectiveObservation[key] === authenticationEvidence[key])
      || authenticationEvidence.artifactFileName !== allowed.fileName
      || authenticationEvidence.artifactBytes !== allowed.bytes
      || authenticationEvidence.artifactSha256 !== allowed.sha256
      || authenticationEvidence.signatureStatus !== 'Valid'
      || authenticationEvidence.signatureType !== 'Authenticode'
      || typeof authenticationEvidence.signerSubject !== 'string'
      || authenticationEvidence.signerSubject.length === 0
      || typeof authenticationEvidence.signerIssuer !== 'string'
      || authenticationEvidence.signerIssuer.length === 0
      || typeof authenticationEvidence.timestampSubject !== 'string'
      || authenticationEvidence.timestampSubject.length === 0
      || !Array.isArray(authenticationEvidence.ekuOids)
      || !requirements.requiredEkuOids.every((oid) => authenticationEvidence.ekuOids.includes(oid))
      || authenticationEvidence.signerCertificateSha256
        !== requirements.signerCertificateSha256
      || authenticationEvidence.timestampCertificateSha256
        !== requirements.timestampCertificateSha256) {
      fail('database_rehearsal_registry_metadata_binding_invalid')
    }
  } else if (allowed.authenticationMethod === AUTHENTICATED_BUNDLE_MEMBER_METHOD) {
    let metadata
    try { metadata = JSON.parse(retainedMetadata.toString('utf8')) } catch {
      fail('database_rehearsal_registry_metadata_invalid')
    }
    const requirements = allowed.authenticationRequirements
    const parent = policy.artifacts.find(({ sourceId }) =>
      sourceId === requirements.parentSourceId)
    if (!exact(metadata, ['contract', 'status', 'sourceId', 'parentSourceId',
      'parentArtifactSha256', 'bundleRelativePath', 'artifactSha256', 'artifactBytes',
      'entries'])
      || metadata.contract !== `supermega.${allowed.authenticationMethod}.v1`
      || metadata.sourceId !== allowed.sourceId
      || metadata.artifactSha256 !== allowed.sha256
      || metadata.artifactBytes !== allowed.bytes
      || metadata.status !== 'reviewed'
      || metadata.parentSourceId !== requirements.parentSourceId
      || metadata.parentArtifactSha256 !== parent?.sha256
      || !object(verifiedParentAuthentication)
      || verifiedParentAuthentication.sourceId !== parent?.sourceId
      || verifiedParentAuthentication.sourceArtifactSha256 !== parent?.sha256
      || verifiedParentAuthentication.signerCertificateSha256
        !== parent?.authenticationRequirements?.signerCertificateSha256
      || verifiedParentAuthentication.timestampCertificateSha256
        !== parent?.authenticationRequirements?.timestampCertificateSha256
      || metadata.bundleRelativePath !== requirements.bundleRelativePath
      || !Array.isArray(metadata.entries) || metadata.entries.length < 1
      || new Set(metadata.entries.map(({ relativePath }) =>
        typeof relativePath === 'string' ? relativePath.toLowerCase() : '')).size
        !== metadata.entries.length
      || !metadata.entries.every((entry) => exact(entry, ['relativePath', 'bytes', 'sha256'])
        && typeof entry.relativePath === 'string' && entry.relativePath.length > 0
        && !entry.relativePath.startsWith('/') && !entry.relativePath.startsWith('\\')
        && !entry.relativePath.includes(':')
        && !entry.relativePath.split(/[\\/]/).includes('..')
        && Number.isSafeInteger(entry.bytes) && entry.bytes > 0
        && SHA256.test(entry.sha256 || ''))
      || !metadata.entries.some((entry) =>
        entry.relativePath === requirements.bundleRelativePath
          && entry.bytes === allowed.bytes && entry.sha256 === allowed.sha256)) {
      fail('database_rehearsal_registry_metadata_binding_invalid')
    }
  } else {
    fail('database_rehearsal_registry_metadata_kind_unsupported')
  }
  return {
    sourceId: source.sourceId,
    sourceArtifactSha256: source.sha256,
    registryPolicyId: policy.policyId,
    metadataSha256: allowed.metadataSha256,
  }
}

export function verifyOfficialRegistryEvidence(input) {
  return verifyOfficialRegistryEvidenceInternal({ ...input, reconstructionOnly: false })
}

// Receipt reconstruction verifies the exact retained, independently reviewed
// evidence and policy tuple, but deliberately does not claim to have reproduced
// a fresh Windows signature observation. Runtime authority must use
// verifyOfficialRegistryEvidence(), which requires the fresh observation.
export function reconstructOfficialRegistryEvidence(input) {
  const { observedAuthentication: ignored, ...bounded } = input
  return verifyOfficialRegistryEvidenceInternal({
    ...bounded,
    observedAuthentication: null,
    reconstructionOnly: true,
  })
}

export async function readOfficialRegistryPolicy(path) {
  let policy
  try { policy = JSON.parse(await readFile(path, 'utf8')) } catch {
    fail('database_rehearsal_registry_policy_invalid')
  }
  inspectOfficialRegistryPolicy(policy)
  return policy
}

export function registryPolicySha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

export function combinedPolicySha256(publisherPolicyBytes, registryPolicyBytes) {
  const digest = createHash('sha256')
  digest.update('supermega.postgres17-policy-tuple.v1\0', 'utf8')
  for (const [label, bytes] of [
    ['publisher', Buffer.from(publisherPolicyBytes)],
    ['registry', Buffer.from(registryPolicyBytes)],
  ]) {
    const length = Buffer.alloc(8)
    length.writeBigUInt64BE(BigInt(bytes.length))
    digest.update(label, 'utf8').update('\0', 'utf8').update(length).update(bytes)
  }
  return digest.digest('hex')
}
