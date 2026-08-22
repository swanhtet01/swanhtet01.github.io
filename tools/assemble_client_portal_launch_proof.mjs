#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { open, lstat, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateReleaseHandoffPacket } from './prepare_release_handoff.mjs'
import { portalEvidenceBindingDigest } from './verify_hosted_product_acceptance.mjs'

export const CLIENT_PORTAL_LAUNCH_PROOF_CONTRACT = 'supermega.client_portal_launch_proof.v1'

const ACTIVATION_CONTRACT = 'supermega.managed_workspace_activation_requery_evidence.v2'
const PORTAL_CONTRACT = 'supermega.hosted_client_portal_smoke.v1'
const ACCEPTANCE_CONTRACT = 'supermega.hosted_product_acceptance_smoke.v2'
const PRODUCT_ORDER = ['commerce', 'production', 'website', 'ecommerce']
const PRODUCT_ALIASES = new Map([['shop', 'commerce'], ['plant', 'production']])
const PRODUCT_ROUTES = new Map([
  ['commerce', { productId: 'shop', appPath: '/shop/' }],
  ['production', { productId: 'plant', appPath: '/plant/' }],
  ['website', { productId: 'website', appPath: '/website/' }],
  ['ecommerce', { productId: 'ecommerce', appPath: '/ecommerce/' }],
])
const MAX_ARTIFACT_BYTES = 1_000_000

function fail(code) {
  throw new Error(code)
}

function assert(condition, code) {
  if (!condition) fail(code)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function exactTimestamp(value, code) {
  const text = String(value || '')
  const parsed = Date.parse(text)
  assert(Number.isFinite(parsed) && /(Z|[+-]\d{2}:\d{2})$/.test(text), code)
  return text
}

function exactDigest(value, code) {
  const text = String(value || '').toLowerCase()
  assert(/^sha256:[0-9a-f]{64}$/.test(text), code)
  return text
}

function exactCommit(value, code) {
  const text = String(value || '').toLowerCase()
  assert(/^[0-9a-f]{40}$/.test(text), code)
  return text
}

function canonicalProducts(value, code) {
  assert(Array.isArray(value) && value.length > 0, code)
  const normalized = value.map((item) => PRODUCT_ALIASES.get(String(item || '').toLowerCase()) || String(item || '').toLowerCase())
  assert(normalized.every((item) => PRODUCT_ORDER.includes(item)) && new Set(normalized).size === normalized.length, code)
  const ordered = PRODUCT_ORDER.filter((item) => normalized.includes(item))
  assert(JSON.stringify(normalized) === JSON.stringify(ordered), code)
  return ordered
}

function validateActivation(value) {
  assert(isRecord(value)
    && value.contract === ACTIVATION_CONTRACT
    && value.version === 2
    && value.status === 'database_activation_verified'
    && isRecord(value.activation)
    && isRecord(value.target)
    && isRecord(value.proofs)
    && isRecord(value.controls), 'launch_activation_invalid')
  const { evidenceDigest, ...body } = value
  assert(exactDigest(evidenceDigest, 'launch_activation_digest_invalid') === sha256(canonical(body)), 'launch_activation_digest_mismatch')
  const products = canonicalProducts(value.activation.products, 'launch_activation_products_invalid')
  assert(typeof value.activation.workspaceId === 'string' && value.activation.workspaceId.length >= 3
    && typeof value.activation.ownerActorId === 'string' && value.activation.ownerActorId.length >= 3
    && exactDigest(value.activation.planDigest, 'launch_activation_plan_digest_invalid')
    && exactDigest(value.activation.receiptDigest, 'launch_activation_receipt_digest_invalid')
    && value.target.postgresMajor === 17
    && Number.isInteger(value.target.schemaVersion) && value.target.schemaVersion >= 11
    && value.proofs.ownerAuthorizationRequeried === true
    && value.proofs.workspaceAccessRequeried === true
    && value.proofs.singleOwnerMembershipRequeried === true
    && value.proofs.immutableActivationEventRequeried === true
    && value.proofs.databaseMutationStatementsExecuted === 0
    && value.controls.hostedDatabaseReadPerformed === true
    && value.controls.databaseReadOnly === true
    && value.controls.containsSecrets === false
    && value.controls.containsRawClientRows === false, 'launch_activation_proof_invalid')
  assert(JSON.stringify(value.remainingGates) === JSON.stringify([
    'exact_release_live_verification_required',
    'named_owner_portal_smoke_required',
    'cross_tenant_denial_smoke_required',
  ]), 'launch_activation_remaining_gates_invalid')
  exactTimestamp(value.observedAt, 'launch_activation_time_invalid')
  return { value, products }
}

function validatePortal(value) {
  assert(isRecord(value)
    && value.contract === PORTAL_CONTRACT
    && value.status === 'passed'
    && isRecord(value.target)
    && isRecord(value.release)
    && isRecord(value.runtime)
    && isRecord(value.ownerPortal)
    && isRecord(value.crossTenant)
    && isRecord(value.boundaries), 'launch_portal_invalid')
  const products = canonicalProducts(value.target.expectedProducts, 'launch_portal_products_invalid')
  assert(value.release.exactCommitMatched === true
    && value.runtime.managedDatabaseReady === true
    && value.runtime.namedUserAuthReady === true
    && value.runtime.writesEnabled === true
    && value.ownerPortal.namedOwnerVerified === true
    && value.ownerPortal.ownerWorkspaceVisible === true
    && value.ownerPortal.access === 'owner'
    && value.ownerPortal.readReady === true
    && value.ownerPortal.writeReady === true
    && JSON.stringify(value.ownerPortal.productEntitlements) === JSON.stringify(products)
    && value.crossTenant.independentNamedPrincipalVerified === true
    && value.crossTenant.ownerWorkspaceAbsentFromDirectory === true
    && value.crossTenant.ownerWorkspaceBootstrapDenied === true
    && value.crossTenant.denialStatus === 403
    && value.crossTenant.denialCode === 'trial_membership_required'
    && value.boundaries.tenantWritesPerformed === false
    && value.boundaries.credentialsPersisted === false
    && value.boundaries.clientIdentifiersPersisted === false
    && value.boundaries.secretValuesExposed === false, 'launch_portal_proof_invalid')
  exactTimestamp(value.capturedAt, 'launch_portal_time_invalid')
  return { value, products }
}

function validateAcceptance(value) {
  assert(isRecord(value)
    && value.contract === ACCEPTANCE_CONTRACT
    && value.status === 'passed'
    && isRecord(value.target)
    && Array.isArray(value.products)
    && isRecord(value.summary)
    && isRecord(value.boundaries)
    && exactDigest(value.prerequisitePortalArtifactDigest, 'launch_acceptance_portal_artifact_digest_invalid')
    && exactDigest(value.prerequisitePortalBindingDigest, 'launch_acceptance_portal_binding_digest_invalid'), 'launch_acceptance_invalid')
  const products = canonicalProducts(value.target.expectedProducts, 'launch_acceptance_products_invalid')
  assert(value.products.length === products.length
    && value.summary.productCount === products.length
    && value.summary.ownerReadbacksPassed === products.length
    && value.summary.crossTenantDenialsPassed === products.length
    && value.summary.replaysPassed === products.length
    && value.boundaries.productStateMutationsPerformed === false
    && value.boundaries.deploymentPerformed === false
    && value.boundaries.billingActivated === false
    && value.boundaries.customerMessagesSent === false
    && value.boundaries.scheduledAutomationEnabled === false
    && value.boundaries.credentialsPersisted === false
    && value.boundaries.clientIdentifiersPersisted === false
    && value.boundaries.secretValuesExposed === false, 'launch_acceptance_proof_invalid')
  for (let index = 0; index < products.length; index += 1) {
    const item = value.products[index]
    assert(isRecord(item)
      && item.product === products[index]
      && PRODUCT_ROUTES.has(item.product)
      && item.ownerReadbackPassed === true
      && item.crossTenantDenied === true
      && item.replayPassed === true
      && /^sha256:[0-9a-f]{64}$/.test(String(item.stateDigest || '')), 'launch_acceptance_product_invalid')
  }
  exactTimestamp(value.capturedAt, 'launch_acceptance_time_invalid')
  return { value, products }
}

export function buildClientPortalLaunchProof({ releaseHandoff, activationRequery, portalSmoke, productAcceptance, assembledAt = new Date().toISOString(), artifactDigests = {} }) {
  const release = validateReleaseHandoffPacket(releaseHandoff)
  const activation = validateActivation(activationRequery)
  const portal = validatePortal(portalSmoke)
  const acceptance = validateAcceptance(productAcceptance)
  const commit = exactCommit(release.candidate.commit, 'launch_release_commit_invalid')
  assert(commit === exactCommit(activation.value.target.releaseCommit, 'launch_activation_commit_invalid')
    && commit === exactCommit(portal.value.target.exactReleaseCommit, 'launch_portal_commit_invalid')
    && commit === exactCommit(acceptance.value.target.exactReleaseCommit, 'launch_acceptance_commit_invalid'), 'launch_release_mismatch')
  assert(JSON.stringify(activation.products) === JSON.stringify(portal.products)
    && JSON.stringify(portal.products) === JSON.stringify(acceptance.products), 'launch_product_set_mismatch')
  const workspaceDigest = sha256(activation.value.activation.workspaceId)
  const ownerDigest = sha256(activation.value.activation.ownerActorId)
  assert(workspaceDigest === exactDigest(portal.value.target.workspaceDigest, 'launch_portal_workspace_digest_invalid')
    && workspaceDigest === exactDigest(acceptance.value.target.workspaceDigest, 'launch_acceptance_workspace_digest_invalid'), 'launch_workspace_mismatch')
  assert(ownerDigest === exactDigest(portal.value.target.ownerDigest, 'launch_portal_owner_digest_invalid')
    && ownerDigest === exactDigest(acceptance.value.target.ownerDigest, 'launch_acceptance_owner_digest_invalid'), 'launch_owner_mismatch')
  const ownerApprovalDigest = exactDigest(activation.value.activation.ownerApprovalDigest, 'launch_activation_approval_digest_invalid')
  assert(ownerApprovalDigest === exactDigest(acceptance.value.target.ownerApprovalDigest, 'launch_acceptance_approval_digest_invalid'), 'launch_owner_approval_mismatch')
  const activationTime = Date.parse(activation.value.observedAt)
  const portalTime = Date.parse(portal.value.capturedAt)
  const acceptanceTime = Date.parse(acceptance.value.capturedAt)
  assert(activationTime <= portalTime && portalTime <= acceptanceTime, 'launch_evidence_time_order_invalid')
  exactTimestamp(assembledAt, 'launch_assembled_time_invalid')
  const baseUrl = new URL(portal.value.target.baseUrl)
  assert(baseUrl.protocol === 'https:' && baseUrl.origin === 'https://app.supermega.dev', 'launch_portal_origin_invalid')
  const artifacts = ['releaseHandoff', 'activationRequery', 'portalSmoke', 'productAcceptance']
  assert(artifacts.every((key) => /^sha256:[0-9a-f]{64}$/.test(String(artifactDigests[key] || ''))), 'launch_artifact_digests_invalid')
  assert(acceptance.value.prerequisitePortalArtifactDigest === artifactDigests.portalSmoke,
    'launch_acceptance_portal_artifact_mismatch')
  assert(acceptance.value.prerequisitePortalBindingDigest === portalEvidenceBindingDigest(portal.value),
    'launch_acceptance_portal_binding_mismatch')

  return {
    contract: CLIENT_PORTAL_LAUNCH_PROOF_CONTRACT,
    status: 'ready_for_named_use',
    assembledAt,
    exactReleaseCommit: commit,
    tenant: {
      workspaceDigest,
      ownerDigest,
      ownerApprovalDigest,
      isolated: true,
      namedOwnerVerified: true,
      databaseActivationVerified: true,
      crossTenantDenialVerified: true,
    },
    portal: {
      baseUrl: baseUrl.origin,
      products: activation.products.map((product) => ({ product, ...PRODUCT_ROUTES.get(product), url: `${baseUrl.origin}${PRODUCT_ROUTES.get(product).appPath}` })),
      sharedAuthenticatedWorkspace: true,
      productEntitlementsEnforced: true,
      writeReadbackVerifiedPerProduct: true,
      acceptanceBoundToPortalArtifact: true,
    },
    customSolutions: {
      lifecycle: 'available_post_launch',
      requestContract: 'supermega.client_extension_manifest.v1',
      activationPlanContract: 'supermega.client_extension_activation_plan.v1',
      activatedByThisProof: false,
    },
    sourceArtifacts: Object.fromEntries(artifacts.map((key) => [key, { digest: artifactDigests[key] }])),
    boundaries: {
      externalWritesPerformedByAssembly: false,
      localProofArtifactWritten: true,
      productStateMutationsPerformedByAcceptance: false,
      billingActivated: false,
      customerMessagesSent: false,
      scheduledAutomationEnabled: false,
      customExtensionsActivated: false,
      rawClientIdentifiersPersisted: false,
      secretValuesExposed: false,
    },
  }
}

async function readArtifact(pathValue, code) {
  const path = resolve(String(pathValue || ''))
  const metadata = await lstat(path).catch(() => null)
  assert(metadata?.isFile() && !metadata.isSymbolicLink() && metadata.size > 0 && metadata.size <= MAX_ARTIFACT_BYTES, code)
  const raw = await readFile(path)
  assert(raw.length === metadata.size, `${code}_changed`)
  let value
  try { value = JSON.parse(raw.toString('utf8')) } catch { fail(`${code}_json_invalid`) }
  return { value, digest: sha256(raw) }
}

async function writeExclusive(pathValue, value) {
  const path = resolve(String(pathValue || ''))
  const payload = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
  assert(payload.length <= MAX_ARTIFACT_BYTES, 'launch_output_too_large')
  const handle = await open(path, 'wx', 0o600)
  try { await handle.writeFile(payload) } finally { await handle.close() }
  return { path, bytes: payload.length, digest: sha256(payload) }
}

function parseArgs(argv) {
  const required = ['--release-handoff', '--activation-requery', '--portal-smoke', '--product-acceptance', '--output']
  const result = {}
  for (const flag of required) {
    const index = argv.indexOf(flag)
    assert(index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--'), 'launch_usage_invalid')
    result[flag.slice(2).replaceAll('-', '_')] = argv[index + 1]
  }
  assert(argv.length === required.length * 2, 'launch_usage_invalid')
  return result
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const [release, activation, portal, acceptance] = await Promise.all([
    readArtifact(args.release_handoff, 'launch_release_file_invalid'),
    readArtifact(args.activation_requery, 'launch_activation_file_invalid'),
    readArtifact(args.portal_smoke, 'launch_portal_file_invalid'),
    readArtifact(args.product_acceptance, 'launch_acceptance_file_invalid'),
  ])
  const proof = buildClientPortalLaunchProof({
    releaseHandoff: release.value,
    activationRequery: activation.value,
    portalSmoke: portal.value,
    productAcceptance: acceptance.value,
    artifactDigests: {
      releaseHandoff: release.digest,
      activationRequery: activation.digest,
      portalSmoke: portal.digest,
      productAcceptance: acceptance.digest,
    },
  })
  const receipt = await writeExclusive(args.output, proof)
  process.stdout.write(`${JSON.stringify({ ok: true, contract: proof.contract, status: proof.status, products: proof.portal.products.map((item) => item.productId), ...receipt, externalWritesPerformed: false, secretValuesExposed: false })}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, contract: CLIENT_PORTAL_LAUNCH_PROOF_CONTRACT, error: String(error?.message || error).slice(0, 240), secretValuesExposed: false })}\n`)
    process.exitCode = 1
  })
}
