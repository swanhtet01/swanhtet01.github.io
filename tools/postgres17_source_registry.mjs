import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

export const OFFICIAL_REGISTRY_SOURCE_METHOD = 'official-registry-artifact-v1'
export const OFFICIAL_REGISTRY_POLICY_CONTRACT =
  'supermega.postgres17-official-registry-policy.v1'
export const OFFICIAL_REGISTRY_OBSERVATION_CONTRACT =
  'supermega.postgres17-official-registry-observation.v1'

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
function exactArtifact(value) {
  return exact(value, [
    'sourceId', 'component', 'artifactHost', 'metadataHost', 'artifactUrl', 'metadataUrl',
    'packageName', 'packageVersion', 'platform', 'fileName', 'bytes', 'sha256',
    'metadataKind', 'metadataBytes', 'metadataSha256',
  ])
    && typeof value.sourceId === 'string' && value.sourceId.length > 0
    && ['python', 'psycopg', 'openssl', 'node', 'git'].includes(value.component)
    && typeof value.artifactHost === 'string' && value.artifactHost.length > 0
    && typeof value.metadataHost === 'string' && value.metadataHost.length > 0
    && validUrl(value.artifactUrl, value.artifactHost)
    && validUrl(value.metadataUrl, value.metadataHost)
    && ((value.component === 'psycopg'
      && value.artifactHost === 'files.pythonhosted.org' && value.metadataHost === 'pypi.org')
      || (value.component === 'node'
        && value.artifactHost === 'nodejs.org' && value.metadataHost === 'nodejs.org'))
    && typeof value.packageName === 'string' && value.packageName.length > 0
    && typeof value.packageVersion === 'string' && value.packageVersion.length > 0
    && typeof value.platform === 'string' && value.platform.length > 0
    && value.fileName === basename(value.fileName || '')
    && Number.isSafeInteger(value.bytes) && value.bytes > 0
    && Number.isSafeInteger(value.metadataBytes) && value.metadataBytes > 0
    && ((value.component === 'psycopg' && value.metadataKind === 'pypi-json-v1')
      || (value.component === 'node' && value.metadataKind === 'node-shasums-v1'))
    && SHA256.test(value.sha256 || '') && SHA256.test(value.metadataSha256 || '')
}

export function inspectOfficialRegistryPolicy(policy) {
  if (!exact(policy, [
    'contract', 'policyId', 'status', 'testOnly', 'artifacts', 'approval',
  ], ['blockers'])
    || policy.contract !== OFFICIAL_REGISTRY_POLICY_CONTRACT
    || typeof policy.policyId !== 'string' || policy.policyId.length === 0
    || policy.testOnly !== false || !Array.isArray(policy.artifacts)
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
  for (const artifact of policy.artifacts) {
    if (ids.has(artifact.sourceId)) blockers.push(`registry_source_duplicate:${artifact.sourceId}`)
    if (urls.has(artifact.artifactUrl)) blockers.push(`registry_artifact_duplicate:${artifact.sourceId}`)
    ids.add(artifact.sourceId); urls.add(artifact.artifactUrl)
  }
  return { policyId: policy.policyId, ready: blockers.length === 0, blockers,
    artifactCount: policy.artifacts.length }
}

export function verifyOfficialRegistryEvidence({ source, authentication, policy, evidence }) {
  const inspection = inspectOfficialRegistryPolicy(policy)
  if (!inspection.ready || authentication.method !== OFFICIAL_REGISTRY_SOURCE_METHOD
    || authentication.policyId !== policy.policyId) {
    fail('database_rehearsal_registry_policy_unapproved')
  }
  if (!exact(evidence, [
    'contract', 'status', 'sourceId', 'component', 'artifactHost', 'metadataHost', 'artifactUrl',
    'metadataUrl', 'packageName', 'packageVersion', 'platform', 'fileName',
    'artifactBytes', 'artifactSha256', 'metadataKind', 'metadataBytes',
    'metadataSha256', 'retainedMetadata',
    'approval',
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
  }
  for (const [key, value] of Object.entries(expected)) {
    if (evidence[key] !== value) fail('database_rehearsal_registry_evidence_mismatch')
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
  if (allowed.metadataKind === 'pypi-json-v1') {
    let metadata
    try { metadata = JSON.parse(retainedMetadata.toString('utf8')) } catch {
      fail('database_rehearsal_registry_metadata_invalid')
    }
    const file = metadata?.urls?.find((candidate) => candidate?.filename === allowed.fileName)
    if (metadata?.info?.name !== allowed.packageName
      || metadata?.info?.version !== allowed.packageVersion
      || file?.packagetype !== 'bdist_wheel'
      || file?.url !== allowed.artifactUrl
      || file?.yanked !== false
      || file?.size !== allowed.bytes
      || file?.digests?.sha256 !== allowed.sha256
      || !allowed.fileName.toLowerCase().includes(allowed.platform.toLowerCase())) {
      fail('database_rehearsal_registry_metadata_binding_invalid')
    }
  } else if (allowed.metadataKind === 'node-shasums-v1') {
    const lines = retainedMetadata.toString('utf8').split(/\r?\n/)
    const matches = lines.filter((line) => line === `${allowed.sha256}  ${allowed.fileName}`)
    if (allowed.component !== 'node' || allowed.packageName !== 'Node.js'
      || matches.length !== 1 || !allowed.artifactUrl.includes(`/v${allowed.packageVersion}/`)
      || !allowed.metadataUrl.endsWith(`/v${allowed.packageVersion}/SHASUMS256.txt`)) {
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
