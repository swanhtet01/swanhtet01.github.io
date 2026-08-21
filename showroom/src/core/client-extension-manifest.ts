import { clientCapabilityIdsForProducts, type ClientCapabilityDomain } from './client-capability-plan.ts'
import type { ClientDemoBlueprint, ClientSolutionId } from './client-onboarding.ts'

export const CLIENT_EXTENSION_MANIFEST_SCHEMA = 'supermega.client_extension_manifest.v1' as const
export const CLIENT_EXTENSION_ACTIVATION_PLAN_SCHEMA = 'supermega.client_extension_activation_plan.v1' as const
export const CLIENT_EXTENSION_PORTAL_BINDING_SCHEMA = 'supermega.client_extension_portal_binding.v1' as const

export type ClientExtensionMode = 'read-only' | 'draft-only' | 'reviewed-write'
export type ClientExtensionRequestedAction = 'read' | 'draft' | 'propose-write'

export type ClientExtensionRequest = {
  id: string
  label: string
  outcome: string
  baseProduct: ClientSolutionId
  domain: ClientCapabilityDomain
  mode: ClientExtensionMode
  records: readonly string[]
  roles: readonly string[]
  dependsOn: readonly string[]
  acceptanceCriteria: readonly string[]
}

export type ClientExtensionManifest = {
  schema: typeof CLIENT_EXTENSION_MANIFEST_SCHEMA
  id: string
  createdAt: string
  blueprintDigest: string
  workspace: string
  presetId: ClientDemoBlueprint['client']['presetId']
  baseProduct: ClientSolutionId
  label: string
  outcome: string
  domain: ClientCapabilityDomain
  records: string[]
  roles: string[]
  dependsOn: string[]
  acceptanceCriteria: string[]
  authority: {
    recordOwner: ClientSolutionId
    requestedMode: ClientExtensionMode
    requestedActions: ClientExtensionRequestedAction[]
    crossProductWritesAllowed: false
  }
  lifecycle: {
    status: 'requested'
    implementationProof: null
    securityReview: null
    activationApproval: null
  }
  controls: {
    activationStatus: 'not-implemented'
    tenantIsolationRequired: true
    humanApprovalRequired: true
    rollbackProofRequired: true
    externalWritesPerformed: false
  }
  digest: string
}

export type ClientExtensionActivationEvidence = {
  implementationVersion: number
  implementationDigest: string
  migrationDigest: string
  rollbackDigest: string
  securityReviewDigest: string
  securityReviewedBy: string
  securityReviewedAt: string
  approvedBy: string
  approvedAt: string
}

export type ClientExtensionActivationPlan = {
  schema: typeof CLIENT_EXTENSION_ACTIVATION_PLAN_SCHEMA
  manifestDigest: string
  blueprintDigest: string
  workspace: string
  baseProduct: ClientSolutionId
  implementation: {
    version: number
    digest: string
    migrationDigest: string
    rollbackDigest: string
  }
  reviews: {
    security: {
      reviewedBy: string
      reviewedAt: string
      decision: 'approved'
      evidenceDigest: string
    }
    ownerActivation: {
      approvedBy: string
      approvedAt: string
      decision: 'approved'
      manifestDigest: string
      implementationDigest: string
    }
  }
  authority: {
    status: 'planned-not-applied'
    tenantWritesPerformed: false
    providerCallsPerformed: false
    deploymentPerformed: false
    productionActivationPerformed: false
  }
  controls: {
    exactManifestRequired: true
    purchasedBaseProductRequired: true
    versionedMigrationRequired: true
    digestBoundRollbackRequired: true
    securityReviewRequired: true
    namedOwnerApprovalRequired: true
    crossProductWritesAllowed: false
  }
  digest: string
}

export type ClientExtensionPortalContext = {
  contract: 'supermega.client_portal_activation_manifest.v1'
  manifestDigest: string
  status: 'approved_plan_not_applied'
  tenant: {
    workspaceId: string
    workspaceLabel: string
    ownerActorId: string
    ownerLabel: string
    products: string[]
  }
  portal: {
    bundleDigest: string
    productBindings: Array<{
      product: string
      runtimeProduct: ClientSolutionId
    }>
    crossTenantReadsAllowed: false
    crossProductWritesAllowed: false
  }
  customSolutions: {
    activationStatus: 'not_applied'
    tenantBound: true
    purchasedBaseProductRequired: true
    securityReviewRequired: true
    namedOwnerApprovalRequired: true
    crossProductWritesAllowed: false
  }
  authority: {
    humanApprovalBound: true
    tenantWritesPerformed: false
    providerCallsPerformed: false
    externalMessagesSent: false
    deploymentPerformed: false
    productionActivationPerformed: false
  }
  [key: string]: unknown
}

export type ClientExtensionPortalBinding = {
  schema: typeof CLIENT_EXTENSION_PORTAL_BINDING_SCHEMA
  extensionManifestDigest: string
  extensionActivationPlanDigest: string
  blueprintDigest: string
  portalManifestDigest: string
  portalBundleDigest: string
  tenant: {
    workspaceId: string
    workspaceLabel: string
    ownerActorId: string
    ownerLabel: string
  }
  module: {
    id: string
    label: string
    baseProduct: ClientSolutionId
    productEntitlement: string
    domain: ClientCapabilityDomain
    mode: ClientExtensionMode
    records: string[]
    roles: string[]
    implementationVersion: number
    implementationDigest: string
  }
  authority: {
    status: 'approved-not-applied'
    tenantScoped: true
    baseProductPurchased: true
    crossProductWritesAllowed: false
    tenantWritesPerformed: false
    providerCallsPerformed: false
    deploymentPerformed: false
    productionActivationPerformed: false
  }
  controls: {
    exactPortalManifestRequired: true
    exactExtensionPlanRequired: true
    workspaceIdBindingRequired: true
    namedOwnerBindingRequired: true
    purchasedBaseProductRequired: true
    separateActivationRequired: true
  }
  digest: string
}

const ID = /^ext-[a-z][a-z0-9-]{1,58}$/
const RECORD_ID = /^[a-z][a-z0-9_]{1,63}$/
const DOMAIN: readonly ClientCapabilityDomain[] = ['operations', 'master-data', 'finance', 'customer', 'supply-chain', 'quality', 'workforce', 'governance', 'intelligence', 'integration']
const MODE: readonly ClientExtensionMode[] = ['read-only', 'draft-only', 'reviewed-write']
const SHA256 = /^sha256:[a-f0-9]{64}$/
const PRODUCT_ENTITLEMENT: Record<ClientSolutionId, string> = {
  commerce: 'shop',
  production: 'plant',
  website: 'website',
  ecommerce: 'ecommerce',
}

function bounded(value: string, label: string, maximum: number) {
  const normalized = value.trim()
  if (!normalized || normalized.length > maximum || Array.from(normalized).some((character) => {
    const point = character.codePointAt(0) as number
    return point <= 31 || point === 127
  })) throw new Error(`${label} is invalid.`)
  return normalized
}

function uniqueText(values: readonly string[], label: string, minimum: number, maximum: number, itemMaximum: number) {
  if (!Array.isArray(values) || values.length < minimum || values.length > maximum) throw new Error(`${label} is invalid.`)
  const normalized = values.map((value) => bounded(value, label, itemMaximum))
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label} contains duplicates.`)
  return normalized
}

function canonicalTimestamp(value: string) {
  const normalized = bounded(value, 'Created at', 32)
  if (new Date(normalized).toISOString() !== normalized) throw new Error('Created at must be a canonical ISO timestamp.')
  return normalized
}

function requestedActions(mode: ClientExtensionMode): ClientExtensionRequestedAction[] {
  if (mode === 'read-only') return ['read']
  if (mode === 'draft-only') return ['read', 'draft']
  return ['read', 'draft', 'propose-write']
}

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
  }
  throw new Error('Portal manifest contains a non-canonical value.')
}

async function canonicalDigest(value: unknown) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value)))
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function evidenceDigest(value: string, label: string) {
  const normalized = bounded(value, label, 71)
  if (!SHA256.test(normalized)) throw new Error(`${label} must be a SHA-256 digest.`)
  return normalized
}

export async function buildClientExtensionManifest(
  blueprint: ClientDemoBlueprint,
  request: ClientExtensionRequest,
  createdAtValue: string,
): Promise<ClientExtensionManifest> {
  const selectedProducts = blueprint.products.map((product) => product.product)
  if (!selectedProducts.includes(request.baseProduct)) throw new Error('The extension base product is not selected for this client.')
  if (!ID.test(request.id)) throw new Error('The extension id must start with ext- and use lowercase letters numbers or hyphens.')
  if (!DOMAIN.includes(request.domain)) throw new Error('Choose a supported extension domain.')
  if (!MODE.includes(request.mode)) throw new Error('Choose a supported extension mode.')

  const records = uniqueText(request.records, 'Extension records', 1, 16, 64)
  if (records.some((record) => !RECORD_ID.test(record))) throw new Error('Extension record ids must use lowercase snake_case.')
  const roles = uniqueText(request.roles, 'Extension roles', 1, 12, 80)
  const dependsOn = uniqueText(request.dependsOn, 'Extension dependencies', 1, 16, 80)
  const knownCapabilities = clientCapabilityIdsForProducts(selectedProducts)
  if (dependsOn.some((dependency) => !knownCapabilities.has(dependency))) {
    throw new Error('Every extension dependency must be a known capability available to this client.')
  }
  const acceptanceCriteria = uniqueText(request.acceptanceCriteria, 'Extension acceptance criteria', 2, 12, 240)

  const payload: Omit<ClientExtensionManifest, 'digest'> = {
    schema: CLIENT_EXTENSION_MANIFEST_SCHEMA,
    id: request.id,
    createdAt: canonicalTimestamp(createdAtValue),
    blueprintDigest: await sha256(blueprint),
    workspace: bounded(blueprint.client.workspace, 'Workspace', 60),
    presetId: blueprint.client.presetId,
    baseProduct: request.baseProduct,
    label: bounded(request.label, 'Extension label', 80),
    outcome: bounded(request.outcome, 'Extension outcome', 240),
    domain: request.domain,
    records,
    roles,
    dependsOn,
    acceptanceCriteria,
    authority: {
      recordOwner: request.baseProduct,
      requestedMode: request.mode,
      requestedActions: requestedActions(request.mode),
      crossProductWritesAllowed: false,
    },
    lifecycle: {
      status: 'requested',
      implementationProof: null,
      securityReview: null,
      activationApproval: null,
    },
    controls: {
      activationStatus: 'not-implemented',
      tenantIsolationRequired: true,
      humanApprovalRequired: true,
      rollbackProofRequired: true,
      externalWritesPerformed: false,
    },
  }
  return { ...payload, digest: await sha256(payload) }
}

export async function verifyClientExtensionManifest(value: unknown, blueprint: ClientDemoBlueprint) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid')
    const candidate = value as Partial<ClientExtensionManifest>
    if (!candidate.authority || typeof candidate.authority !== 'object' || Array.isArray(candidate.authority)) throw new Error('invalid')
    const rebuilt = await buildClientExtensionManifest(blueprint, {
      id: candidate.id as string,
      label: candidate.label as string,
      outcome: candidate.outcome as string,
      baseProduct: candidate.baseProduct as ClientSolutionId,
      domain: candidate.domain as ClientCapabilityDomain,
      mode: candidate.authority.requestedMode as ClientExtensionMode,
      records: candidate.records as string[],
      roles: candidate.roles as string[],
      dependsOn: candidate.dependsOn as string[],
      acceptanceCriteria: candidate.acceptanceCriteria as string[],
    }, candidate.createdAt as string)
    if (JSON.stringify(rebuilt) !== JSON.stringify(value)) throw new Error('invalid')
    return { ok: true as const, contract: CLIENT_EXTENSION_MANIFEST_SCHEMA, digest: rebuilt.digest, blueprintDigest: rebuilt.blueprintDigest }
  } catch {
    throw new Error('The client extension manifest is invalid, belongs to another client blueprint, or changed after review.')
  }
}

export async function buildClientExtensionActivationPlan(
  manifest: ClientExtensionManifest,
  blueprint: ClientDemoBlueprint,
  evidence: ClientExtensionActivationEvidence,
): Promise<ClientExtensionActivationPlan> {
  const verified = await verifyClientExtensionManifest(manifest, blueprint)
  if (!Number.isInteger(evidence.implementationVersion) || evidence.implementationVersion < 1 || evidence.implementationVersion > 1000) {
    throw new Error('Implementation version must be an integer from 1 to 1000.')
  }
  const implementationDigest = evidenceDigest(evidence.implementationDigest, 'Implementation digest')
  const migrationDigest = evidenceDigest(evidence.migrationDigest, 'Migration digest')
  const rollbackDigest = evidenceDigest(evidence.rollbackDigest, 'Rollback digest')
  const securityReviewDigest = evidenceDigest(evidence.securityReviewDigest, 'Security review digest')
  if (new Set([implementationDigest, migrationDigest, rollbackDigest, securityReviewDigest]).size !== 4) {
    throw new Error('Implementation, migration, rollback, and security evidence must be independently digest-bound.')
  }
  const securityReviewedAt = canonicalTimestamp(evidence.securityReviewedAt)
  const approvedAt = canonicalTimestamp(evidence.approvedAt)
  if (Date.parse(approvedAt) < Date.parse(securityReviewedAt)) {
    throw new Error('Owner activation approval cannot predate the security review.')
  }
  const approvedBy = bounded(evidence.approvedBy, 'Activation approver', 80)
  const blueprintOwner = bounded(blueprint.client.owner, 'Blueprint owner', 80)
  if (approvedBy !== blueprintOwner) throw new Error('Activation approval must come from the named client owner.')

  const payload: Omit<ClientExtensionActivationPlan, 'digest'> = {
    schema: CLIENT_EXTENSION_ACTIVATION_PLAN_SCHEMA,
    manifestDigest: verified.digest,
    blueprintDigest: verified.blueprintDigest,
    workspace: manifest.workspace,
    baseProduct: manifest.baseProduct,
    implementation: {
      version: evidence.implementationVersion,
      digest: implementationDigest,
      migrationDigest,
      rollbackDigest,
    },
    reviews: {
      security: {
        reviewedBy: bounded(evidence.securityReviewedBy, 'Security reviewer', 80),
        reviewedAt: securityReviewedAt,
        decision: 'approved',
        evidenceDigest: securityReviewDigest,
      },
      ownerActivation: {
        approvedBy,
        approvedAt,
        decision: 'approved',
        manifestDigest: verified.digest,
        implementationDigest,
      },
    },
    authority: {
      status: 'planned-not-applied',
      tenantWritesPerformed: false,
      providerCallsPerformed: false,
      deploymentPerformed: false,
      productionActivationPerformed: false,
    },
    controls: {
      exactManifestRequired: true,
      purchasedBaseProductRequired: true,
      versionedMigrationRequired: true,
      digestBoundRollbackRequired: true,
      securityReviewRequired: true,
      namedOwnerApprovalRequired: true,
      crossProductWritesAllowed: false,
    },
  }
  return { ...payload, digest: await sha256(payload) }
}

export async function verifyClientExtensionActivationPlan(
  value: unknown,
  manifest: ClientExtensionManifest,
  blueprint: ClientDemoBlueprint,
) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid')
    const candidate = value as Partial<ClientExtensionActivationPlan>
    const implementation = candidate.implementation as ClientExtensionActivationPlan['implementation']
    const security = candidate.reviews?.security as ClientExtensionActivationPlan['reviews']['security']
    const approval = candidate.reviews?.ownerActivation as ClientExtensionActivationPlan['reviews']['ownerActivation']
    const rebuilt = await buildClientExtensionActivationPlan(manifest, blueprint, {
      implementationVersion: implementation?.version,
      implementationDigest: implementation?.digest,
      migrationDigest: implementation?.migrationDigest,
      rollbackDigest: implementation?.rollbackDigest,
      securityReviewDigest: security?.evidenceDigest,
      securityReviewedBy: security?.reviewedBy,
      securityReviewedAt: security?.reviewedAt,
      approvedBy: approval?.approvedBy,
      approvedAt: approval?.approvedAt,
    })
    if (JSON.stringify(rebuilt) !== JSON.stringify(value)) throw new Error('invalid')
    return {
      ok: true as const,
      contract: CLIENT_EXTENSION_ACTIVATION_PLAN_SCHEMA,
      digest: rebuilt.digest,
      manifestDigest: rebuilt.manifestDigest,
      status: rebuilt.authority.status,
    }
  } catch {
    throw new Error('The client extension activation plan is invalid, stale, approved by another owner, or changed after review.')
  }
}

export async function buildClientExtensionPortalBinding(
  manifest: ClientExtensionManifest,
  activationPlan: ClientExtensionActivationPlan,
  blueprint: ClientDemoBlueprint,
  portal: ClientExtensionPortalContext,
): Promise<ClientExtensionPortalBinding> {
  const manifestVerification = await verifyClientExtensionManifest(manifest, blueprint)
  const planVerification = await verifyClientExtensionActivationPlan(activationPlan, manifest, blueprint)
  const portalDigest = evidenceDigest(portal.manifestDigest, 'Portal manifest digest')
  const portalPayload = { ...portal } as Record<string, unknown>
  delete portalPayload.manifestDigest
  if (await canonicalDigest(portalPayload) !== portalDigest) throw new Error('The client portal manifest digest is invalid.')
  if (portal.contract !== 'supermega.client_portal_activation_manifest.v1'
    || portal.status !== 'approved_plan_not_applied'
    || portal.authority?.humanApprovalBound !== true
    || portal.authority?.tenantWritesPerformed !== false
    || portal.authority?.providerCallsPerformed !== false
    || portal.authority?.externalMessagesSent !== false
    || portal.authority?.deploymentPerformed !== false
    || portal.authority?.productionActivationPerformed !== false
    || portal.portal?.crossTenantReadsAllowed !== false
    || portal.portal?.crossProductWritesAllowed !== false
    || portal.customSolutions?.activationStatus !== 'not_applied'
    || portal.customSolutions?.tenantBound !== true
    || portal.customSolutions?.purchasedBaseProductRequired !== true
    || portal.customSolutions?.securityReviewRequired !== true
    || portal.customSolutions?.namedOwnerApprovalRequired !== true
    || portal.customSolutions?.crossProductWritesAllowed !== false) {
    throw new Error('The client portal is not an approved no-write custom-solution target.')
  }
  const workspaceLabel = bounded(portal.tenant?.workspaceLabel, 'Portal workspace label', 60)
  const ownerLabel = bounded(portal.tenant?.ownerLabel, 'Portal owner label', 80)
  if (workspaceLabel !== manifest.workspace || workspaceLabel !== blueprint.client.workspace) throw new Error('The extension workspace does not match the tenant portal.')
  if (ownerLabel !== blueprint.client.owner || activationPlan.reviews.ownerActivation.approvedBy !== ownerLabel) throw new Error('The extension owner approval does not match the tenant portal owner.')
  const productEntitlement = PRODUCT_ENTITLEMENT[manifest.baseProduct]
  const productBindings = portal.portal?.productBindings
  if (!Array.isArray(portal.tenant?.products)
    || !portal.tenant.products.includes(productEntitlement)
    || !Array.isArray(productBindings)
    || !productBindings.some((binding) => binding?.product === productEntitlement && binding.runtimeProduct === manifest.baseProduct)) {
    throw new Error('The extension base product is not purchased and bound to this tenant portal.')
  }
  const payload: Omit<ClientExtensionPortalBinding, 'digest'> = {
    schema: CLIENT_EXTENSION_PORTAL_BINDING_SCHEMA,
    extensionManifestDigest: manifestVerification.digest,
    extensionActivationPlanDigest: planVerification.digest,
    blueprintDigest: manifestVerification.blueprintDigest,
    portalManifestDigest: portalDigest,
    portalBundleDigest: evidenceDigest(portal.portal.bundleDigest, 'Portal bundle digest'),
    tenant: {
      workspaceId: bounded(portal.tenant.workspaceId, 'Portal workspace id', 80),
      workspaceLabel,
      ownerActorId: bounded(portal.tenant.ownerActorId, 'Portal owner actor id', 160),
      ownerLabel,
    },
    module: {
      id: manifest.id,
      label: manifest.label,
      baseProduct: manifest.baseProduct,
      productEntitlement,
      domain: manifest.domain,
      mode: manifest.authority.requestedMode,
      records: [...manifest.records],
      roles: [...manifest.roles],
      implementationVersion: activationPlan.implementation.version,
      implementationDigest: activationPlan.implementation.digest,
    },
    authority: {
      status: 'approved-not-applied',
      tenantScoped: true,
      baseProductPurchased: true,
      crossProductWritesAllowed: false,
      tenantWritesPerformed: false,
      providerCallsPerformed: false,
      deploymentPerformed: false,
      productionActivationPerformed: false,
    },
    controls: {
      exactPortalManifestRequired: true,
      exactExtensionPlanRequired: true,
      workspaceIdBindingRequired: true,
      namedOwnerBindingRequired: true,
      purchasedBaseProductRequired: true,
      separateActivationRequired: true,
    },
  }
  return { ...payload, digest: await sha256(payload) }
}

export async function verifyClientExtensionPortalBinding(
  value: unknown,
  manifest: ClientExtensionManifest,
  activationPlan: ClientExtensionActivationPlan,
  blueprint: ClientDemoBlueprint,
  portal: ClientExtensionPortalContext,
) {
  try {
    const rebuilt = await buildClientExtensionPortalBinding(manifest, activationPlan, blueprint, portal)
    if (JSON.stringify(rebuilt) !== JSON.stringify(value)) throw new Error('invalid')
    return {
      ok: true as const,
      contract: CLIENT_EXTENSION_PORTAL_BINDING_SCHEMA,
      digest: rebuilt.digest,
      portalManifestDigest: rebuilt.portalManifestDigest,
      workspaceId: rebuilt.tenant.workspaceId,
      status: rebuilt.authority.status,
    }
  } catch {
    throw new Error('The client extension portal binding is invalid, cross-tenant, unentitled, stale, or changed after review.')
  }
}
