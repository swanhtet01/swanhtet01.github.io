import { clientCapabilityIdsForProducts, type ClientCapabilityDomain } from './client-capability-plan.ts'
import type { ClientDemoBlueprint, ClientSolutionId } from './client-onboarding.ts'
import {
  MANAGED_CONTEXT_ALLOWED_USES,
  MANAGED_CONTEXT_FORBIDDEN_ACTIONS,
  type ManagedContextProfile,
} from './managed-context.ts'

export const CLIENT_EXTENSION_MANIFEST_SCHEMA = 'supermega.client_extension_manifest.v1' as const
export const CLIENT_EXTENSION_ACTIVATION_PLAN_SCHEMA = 'supermega.client_extension_activation_plan.v1' as const
export const CLIENT_EXTENSION_PORTAL_BINDING_SCHEMA = 'supermega.client_extension_portal_binding.v1' as const
export const CLIENT_EXTENSION_RUNTIME_AUTHORIZATION_SCHEMA = 'supermega.client_extension_runtime_authorization.v1' as const
export const CLIENT_EXTENSION_ACTIVATION_RECEIPT_SCHEMA = 'supermega.client_extension_activation_receipt.v1' as const
export const CLIENT_EXTENSION_AGENT_CONTEXT_SCHEMA = 'supermega.client_extension_agent_context.v1' as const

export const CLIENT_EXTENSION_AGENT_FORBIDDEN_ACTIONS = [
  ...MANAGED_CONTEXT_FORBIDDEN_ACTIONS,
  'extension_configuration_write',
  'customer_record_write',
  'external_tool_call',
] as const

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

export type ClientExtensionRuntimeAuthorizationEvidence = {
  environment: 'pilot' | 'production'
  releaseCommit: string
  approvedBy: string
  approvedByActorId: string
  approvedAt: string
  expiresAt: string
  idempotencyKey: string
}

export type ClientExtensionRuntimeAuthorization = {
  schema: typeof CLIENT_EXTENSION_RUNTIME_AUTHORIZATION_SCHEMA
  portalBindingDigest: string
  extensionActivationPlanDigest: string
  tenant: ClientExtensionPortalBinding['tenant']
  module: ClientExtensionPortalBinding['module']
  target: {
    environment: ClientExtensionRuntimeAuthorizationEvidence['environment']
    releaseCommit: string
    idempotencyKey: string
  }
  approval: {
    approvedBy: string
    approvedByActorId: string
    approvedAt: string
    expiresAt: string
  }
  authority: {
    status: 'authorized-not-applied'
    tenantConfigurationWriteAllowed: true
    customerRecordWritesAllowed: false
    crossTenantWritesAllowed: false
    crossProductWritesAllowed: false
    providerCallsAllowed: false
    deploymentAllowed: false
    externalMessagesAllowed: false
    writesPerformed: false
  }
  controls: {
    exactPortalBindingRequired: true
    exactLiveReleaseRequiredAtExecution: true
    oneTimeIdempotencyRequired: true
    expiresWithinHours: 24
    rollbackDigest: string
    receiptRequired: true
  }
  digest: string
}

export type ClientExtensionActivationReceiptEvidence = {
  activatedAt: string
  activatedByActorId: string
  idempotencyKey: string
  runtimeRelease: {
    commit: string
    brandVersion: string
    contextVersion: string
    catalogVersion: string
  }
  tenantConfigRevision: number
  tenantConfigDigest: string
  executionEvidenceDigest: string
  rollbackReady: boolean
  customerRecordWritesPerformed: boolean
  providerCallsPerformed: boolean
  deploymentPerformed: boolean
  externalMessagesSent: boolean
  crossTenantWritesPerformed: boolean
  crossProductWritesPerformed: boolean
}

export type ClientExtensionActivationReceipt = {
  schema: typeof CLIENT_EXTENSION_ACTIVATION_RECEIPT_SCHEMA
  authorizationDigest: string
  portalBindingDigest: string
  tenant: ClientExtensionPortalBinding['tenant']
  module: ClientExtensionPortalBinding['module']
  execution: {
    status: 'active'
    activatedAt: string
    activatedByActorId: string
    idempotencyKey: string
    runtimeRelease: ClientExtensionActivationReceiptEvidence['runtimeRelease'] & {
      recordDigest: string
    }
    tenantConfigRevision: number
    tenantConfigDigest: string
    evidenceDigest: string
    rollbackReady: true
  }
  authority: {
    tenantConfigurationWritePerformed: true
    customerRecordWritesPerformed: false
    providerCallsPerformed: false
    deploymentPerformed: false
    externalMessagesSent: false
    crossTenantWritesPerformed: false
    crossProductWritesPerformed: false
  }
  digest: string
}

export type ClientExtensionAgentContext = {
  schema: typeof CLIENT_EXTENSION_AGENT_CONTEXT_SCHEMA
  activationReceiptDigest: string
  managedContextProfileDigest: string
  approvedContextDigest: string
  tenant: {
    workspaceId: string
    ownerActorId: string
  }
  module: {
    id: string
    baseProduct: ClientSolutionId
    domain: ClientCapabilityDomain
    mode: ClientExtensionMode
    implementationVersion: number
    implementationDigest: string
  }
  agentPolicy: {
    status: 'context-ready-advisory'
    allowedUses: [...typeof MANAGED_CONTEXT_ALLOWED_USES]
    requestedActions: ClientExtensionRequestedAction[]
    forbiddenActions: [...typeof CLIENT_EXTENSION_AGENT_FORBIDDEN_ACTIONS]
    extensionActive: true
    writeExecutionAllowed: false
    externalToolCallsAllowed: false
    humanReviewRequired: true
  }
  privacyBoundary: {
    rawProductRecordsIncluded: false
    rawBehaviorEntriesIncluded: false
    rawDecisionRecordsIncluded: false
    customerRecordsIncluded: false
    modelTrainingAllowed: false
  }
  digest: string
}

const ID = /^ext-[a-z][a-z0-9-]{1,58}$/
const RECORD_ID = /^[a-z][a-z0-9_]{1,63}$/
const DOMAIN: readonly ClientCapabilityDomain[] = ['operations', 'master-data', 'finance', 'customer', 'supply-chain', 'quality', 'workforce', 'governance', 'intelligence', 'integration']
const MODE: readonly ClientExtensionMode[] = ['read-only', 'draft-only', 'reviewed-write']
const SHA256 = /^sha256:[a-f0-9]{64}$/
const GIT_COMMIT = /^[a-f0-9]{40}$/
const IDEMPOTENCY_KEY = /^[a-z0-9][a-z0-9:._-]{15,179}$/
const RELEASE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/
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

export async function buildClientExtensionRuntimeAuthorization(
  binding: ClientExtensionPortalBinding,
  manifest: ClientExtensionManifest,
  activationPlan: ClientExtensionActivationPlan,
  blueprint: ClientDemoBlueprint,
  portal: ClientExtensionPortalContext,
  evidence: ClientExtensionRuntimeAuthorizationEvidence,
): Promise<ClientExtensionRuntimeAuthorization> {
  const bindingVerification = await verifyClientExtensionPortalBinding(binding, manifest, activationPlan, blueprint, portal)
  const releaseCommit = bounded(evidence.releaseCommit, 'Runtime release commit', 40)
  if (!GIT_COMMIT.test(releaseCommit)) throw new Error('Runtime activation requires an exact lowercase 40-character release commit.')
  if (!['pilot', 'production'].includes(evidence.environment)) throw new Error('Runtime activation environment must be pilot or production.')
  const approvedBy = bounded(evidence.approvedBy, 'Runtime activation approver', 80)
  const approvedByActorId = bounded(evidence.approvedByActorId, 'Runtime activation approver actor id', 160)
  if (approvedBy !== binding.tenant.ownerLabel || approvedByActorId !== binding.tenant.ownerActorId) {
    throw new Error('Runtime activation approval must come from the exact tenant portal owner.')
  }
  const approvedAt = canonicalTimestamp(evidence.approvedAt)
  const expiresAt = canonicalTimestamp(evidence.expiresAt)
  const approvedAtMs = Date.parse(approvedAt)
  const expiresAtMs = Date.parse(expiresAt)
  if (approvedAtMs < Date.parse(activationPlan.reviews.ownerActivation.approvedAt)) {
    throw new Error('Runtime activation approval cannot predate the reviewed extension plan.')
  }
  if (expiresAtMs <= approvedAtMs || expiresAtMs - approvedAtMs > 24 * 60 * 60 * 1000) {
    throw new Error('Runtime activation authorization must expire after approval and within 24 hours.')
  }
  const idempotencyKey = bounded(evidence.idempotencyKey, 'Runtime activation idempotency key', 180)
  if (!IDEMPOTENCY_KEY.test(idempotencyKey)) throw new Error('Runtime activation idempotency key is invalid.')

  const payload: Omit<ClientExtensionRuntimeAuthorization, 'digest'> = {
    schema: CLIENT_EXTENSION_RUNTIME_AUTHORIZATION_SCHEMA,
    portalBindingDigest: bindingVerification.digest,
    extensionActivationPlanDigest: activationPlan.digest,
    tenant: { ...binding.tenant },
    module: { ...binding.module, records: [...binding.module.records], roles: [...binding.module.roles] },
    target: {
      environment: evidence.environment,
      releaseCommit,
      idempotencyKey,
    },
    approval: {
      approvedBy,
      approvedByActorId,
      approvedAt,
      expiresAt,
    },
    authority: {
      status: 'authorized-not-applied',
      tenantConfigurationWriteAllowed: true,
      customerRecordWritesAllowed: false,
      crossTenantWritesAllowed: false,
      crossProductWritesAllowed: false,
      providerCallsAllowed: false,
      deploymentAllowed: false,
      externalMessagesAllowed: false,
      writesPerformed: false,
    },
    controls: {
      exactPortalBindingRequired: true,
      exactLiveReleaseRequiredAtExecution: true,
      oneTimeIdempotencyRequired: true,
      expiresWithinHours: 24,
      rollbackDigest: activationPlan.implementation.rollbackDigest,
      receiptRequired: true,
    },
  }
  return { ...payload, digest: await sha256(payload) }
}

export async function verifyClientExtensionRuntimeAuthorization(
  value: unknown,
  binding: ClientExtensionPortalBinding,
  manifest: ClientExtensionManifest,
  activationPlan: ClientExtensionActivationPlan,
  blueprint: ClientDemoBlueprint,
  portal: ClientExtensionPortalContext,
  executionAtValue?: string,
) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid')
    const candidate = value as Partial<ClientExtensionRuntimeAuthorization>
    const rebuilt = await buildClientExtensionRuntimeAuthorization(binding, manifest, activationPlan, blueprint, portal, {
      environment: candidate.target?.environment as ClientExtensionRuntimeAuthorizationEvidence['environment'],
      releaseCommit: candidate.target?.releaseCommit as string,
      approvedBy: candidate.approval?.approvedBy as string,
      approvedByActorId: candidate.approval?.approvedByActorId as string,
      approvedAt: candidate.approval?.approvedAt as string,
      expiresAt: candidate.approval?.expiresAt as string,
      idempotencyKey: candidate.target?.idempotencyKey as string,
    })
    if (JSON.stringify(rebuilt) !== JSON.stringify(value)) throw new Error('invalid')
    const executionAt = executionAtValue === undefined ? null : canonicalTimestamp(executionAtValue)
    if (executionAt !== null && (Date.parse(executionAt) < Date.parse(rebuilt.approval.approvedAt) || Date.parse(executionAt) > Date.parse(rebuilt.approval.expiresAt))) {
      throw new Error('expired')
    }
    return {
      ok: true as const,
      contract: CLIENT_EXTENSION_RUNTIME_AUTHORIZATION_SCHEMA,
      digest: rebuilt.digest,
      portalBindingDigest: rebuilt.portalBindingDigest,
      workspaceId: rebuilt.tenant.workspaceId,
      releaseCommit: rebuilt.target.releaseCommit,
      expiresAt: rebuilt.approval.expiresAt,
      executionAt,
      executable: executionAt === null ? null : true,
      status: rebuilt.authority.status,
    }
  } catch {
    throw new Error('The client extension runtime authorization is invalid, expired by contract, cross-tenant, stale, or changed after approval.')
  }
}

export async function buildClientExtensionActivationReceipt(
  authorization: ClientExtensionRuntimeAuthorization,
  binding: ClientExtensionPortalBinding,
  manifest: ClientExtensionManifest,
  activationPlan: ClientExtensionActivationPlan,
  blueprint: ClientDemoBlueprint,
  portal: ClientExtensionPortalContext,
  evidence: ClientExtensionActivationReceiptEvidence,
): Promise<ClientExtensionActivationReceipt> {
  const activatedAt = canonicalTimestamp(evidence.activatedAt)
  const authorizationVerification = await verifyClientExtensionRuntimeAuthorization(authorization, binding, manifest, activationPlan, blueprint, portal, activatedAt)
  const activatedAtMs = Date.parse(activatedAt)
  if (activatedAtMs < Date.parse(authorization.approval.approvedAt) || activatedAtMs > Date.parse(authorization.approval.expiresAt)) {
    throw new Error('Extension activation must occur inside the authorized time window.')
  }
  const activatedByActorId = bounded(evidence.activatedByActorId, 'Extension activation actor id', 160)
  if (activatedByActorId !== authorization.approval.approvedByActorId) throw new Error('Extension activation actor does not match the authorized tenant owner.')
  const idempotencyKey = bounded(evidence.idempotencyKey, 'Extension activation idempotency key', 180)
  if (idempotencyKey !== authorization.target.idempotencyKey) throw new Error('Extension activation idempotency key does not match the authorization.')
  const runtimeRelease = {
    commit: bounded(evidence.runtimeRelease?.commit, 'Runtime release commit', 40),
    brandVersion: bounded(evidence.runtimeRelease?.brandVersion, 'Runtime brand version', 80),
    contextVersion: bounded(evidence.runtimeRelease?.contextVersion, 'Runtime context version', 80),
    catalogVersion: bounded(evidence.runtimeRelease?.catalogVersion, 'Runtime catalog version', 80),
  }
  if (runtimeRelease.commit !== authorization.target.releaseCommit || !GIT_COMMIT.test(runtimeRelease.commit)) throw new Error('Extension activation did not run on the exact authorized release.')
  if (![runtimeRelease.brandVersion, runtimeRelease.contextVersion, runtimeRelease.catalogVersion].every((value) => RELEASE_VERSION.test(value))) {
    throw new Error('Extension activation runtime release versions are invalid.')
  }
  if (!Number.isInteger(evidence.tenantConfigRevision) || evidence.tenantConfigRevision < 1 || evidence.tenantConfigRevision > 2_147_483_647) {
    throw new Error('Tenant configuration revision must be a positive integer.')
  }
  if (evidence.rollbackReady !== true) throw new Error('Extension activation requires rollback readiness.')
  if (evidence.customerRecordWritesPerformed !== false
    || evidence.providerCallsPerformed !== false
    || evidence.deploymentPerformed !== false
    || evidence.externalMessagesSent !== false
    || evidence.crossTenantWritesPerformed !== false
    || evidence.crossProductWritesPerformed !== false) {
    throw new Error('Extension activation evidence exceeds the tenant configuration write authority.')
  }
  const runtimeReleaseRecordDigest = await canonicalDigest(runtimeRelease)
  const tenantConfigDigest = evidenceDigest(evidence.tenantConfigDigest, 'Tenant configuration digest')
  const executionEvidenceDigest = evidenceDigest(evidence.executionEvidenceDigest, 'Activation execution evidence digest')
  if (new Set([runtimeReleaseRecordDigest, tenantConfigDigest, executionEvidenceDigest, activationPlan.implementation.rollbackDigest]).size !== 4) {
    throw new Error('Release, tenant configuration, execution, and rollback evidence must be independently digest-bound.')
  }

  const payload: Omit<ClientExtensionActivationReceipt, 'digest'> = {
    schema: CLIENT_EXTENSION_ACTIVATION_RECEIPT_SCHEMA,
    authorizationDigest: authorizationVerification.digest,
    portalBindingDigest: binding.digest,
    tenant: { ...binding.tenant },
    module: { ...binding.module, records: [...binding.module.records], roles: [...binding.module.roles] },
    execution: {
      status: 'active',
      activatedAt,
      activatedByActorId,
      idempotencyKey,
      runtimeRelease: { ...runtimeRelease, recordDigest: runtimeReleaseRecordDigest },
      tenantConfigRevision: evidence.tenantConfigRevision,
      tenantConfigDigest,
      evidenceDigest: executionEvidenceDigest,
      rollbackReady: true,
    },
    authority: {
      tenantConfigurationWritePerformed: true,
      customerRecordWritesPerformed: false,
      providerCallsPerformed: false,
      deploymentPerformed: false,
      externalMessagesSent: false,
      crossTenantWritesPerformed: false,
      crossProductWritesPerformed: false,
    },
  }
  return { ...payload, digest: await sha256(payload) }
}

export async function verifyClientExtensionActivationReceipt(
  value: unknown,
  authorization: ClientExtensionRuntimeAuthorization,
  binding: ClientExtensionPortalBinding,
  manifest: ClientExtensionManifest,
  activationPlan: ClientExtensionActivationPlan,
  blueprint: ClientDemoBlueprint,
  portal: ClientExtensionPortalContext,
) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid')
    const candidate = value as Partial<ClientExtensionActivationReceipt>
    const execution = candidate.execution as ClientExtensionActivationReceipt['execution']
    const authority = candidate.authority as ClientExtensionActivationReceipt['authority']
    const rebuilt = await buildClientExtensionActivationReceipt(authorization, binding, manifest, activationPlan, blueprint, portal, {
      activatedAt: execution?.activatedAt,
      activatedByActorId: execution?.activatedByActorId,
      idempotencyKey: execution?.idempotencyKey,
      runtimeRelease: {
        commit: execution?.runtimeRelease?.commit,
        brandVersion: execution?.runtimeRelease?.brandVersion,
        contextVersion: execution?.runtimeRelease?.contextVersion,
        catalogVersion: execution?.runtimeRelease?.catalogVersion,
      },
      tenantConfigRevision: execution?.tenantConfigRevision,
      tenantConfigDigest: execution?.tenantConfigDigest,
      executionEvidenceDigest: execution?.evidenceDigest,
      rollbackReady: execution?.rollbackReady,
      customerRecordWritesPerformed: authority?.customerRecordWritesPerformed,
      providerCallsPerformed: authority?.providerCallsPerformed,
      deploymentPerformed: authority?.deploymentPerformed,
      externalMessagesSent: authority?.externalMessagesSent,
      crossTenantWritesPerformed: authority?.crossTenantWritesPerformed,
      crossProductWritesPerformed: authority?.crossProductWritesPerformed,
    })
    if (JSON.stringify(rebuilt) !== JSON.stringify(value)) throw new Error('invalid')
    return {
      ok: true as const,
      contract: CLIENT_EXTENSION_ACTIVATION_RECEIPT_SCHEMA,
      digest: rebuilt.digest,
      authorizationDigest: rebuilt.authorizationDigest,
      workspaceId: rebuilt.tenant.workspaceId,
      tenantConfigRevision: rebuilt.execution.tenantConfigRevision,
      status: rebuilt.execution.status,
    }
  } catch {
    throw new Error('The client extension activation receipt is invalid, unauthorized, cross-tenant, stale, or changed after execution.')
  }
}

function sameOrderedStrings(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

export async function buildClientExtensionAgentContext(
  receipt: ClientExtensionActivationReceipt,
  authorization: ClientExtensionRuntimeAuthorization,
  binding: ClientExtensionPortalBinding,
  manifest: ClientExtensionManifest,
  activationPlan: ClientExtensionActivationPlan,
  blueprint: ClientDemoBlueprint,
  portal: ClientExtensionPortalContext,
  profile: ManagedContextProfile,
): Promise<ClientExtensionAgentContext> {
  const receiptVerification = await verifyClientExtensionActivationReceipt(
    receipt, authorization, binding, manifest, activationPlan, blueprint, portal,
  )
  if (profile.contract !== 'supermega.managed_context_profile.v2'
    || profile.version !== 2
    || profile.workspaceId !== receipt.tenant.workspaceId
    || profile.retainedBy !== receipt.tenant.ownerActorId
    || !SHA256.test(profile.profileDigest)
    || !SHA256.test(profile.approvedContextDigest)
    || !sameOrderedStrings(profile.allowedUses, MANAGED_CONTEXT_ALLOWED_USES)
    || !sameOrderedStrings(profile.forbiddenActions, MANAGED_CONTEXT_FORBIDDEN_ACTIONS)
    || profile.rawProductRecordsIncluded !== false
    || profile.rawBehaviorEntriesIncluded !== false
    || profile.rawDecisionRecordsIncluded !== false
    || profile.modelTrainingAllowed !== false) {
    throw new Error('The managed context profile is invalid, cross-tenant, cross-owner, or exceeds the extension agent privacy boundary.')
  }

  const payload: Omit<ClientExtensionAgentContext, 'digest'> = {
    schema: CLIENT_EXTENSION_AGENT_CONTEXT_SCHEMA,
    activationReceiptDigest: receiptVerification.digest,
    managedContextProfileDigest: profile.profileDigest,
    approvedContextDigest: profile.approvedContextDigest,
    tenant: {
      workspaceId: receipt.tenant.workspaceId,
      ownerActorId: receipt.tenant.ownerActorId,
    },
    module: {
      id: receipt.module.id,
      baseProduct: receipt.module.baseProduct,
      domain: receipt.module.domain,
      mode: receipt.module.mode,
      implementationVersion: receipt.module.implementationVersion,
      implementationDigest: receipt.module.implementationDigest,
    },
    agentPolicy: {
      status: 'context-ready-advisory',
      allowedUses: [...MANAGED_CONTEXT_ALLOWED_USES],
      requestedActions: [...manifest.authority.requestedActions],
      forbiddenActions: [...CLIENT_EXTENSION_AGENT_FORBIDDEN_ACTIONS],
      extensionActive: true,
      writeExecutionAllowed: false,
      externalToolCallsAllowed: false,
      humanReviewRequired: true,
    },
    privacyBoundary: {
      rawProductRecordsIncluded: false,
      rawBehaviorEntriesIncluded: false,
      rawDecisionRecordsIncluded: false,
      customerRecordsIncluded: false,
      modelTrainingAllowed: false,
    },
  }
  return { ...payload, digest: await sha256(payload) }
}

export async function verifyClientExtensionAgentContext(
  value: unknown,
  receipt: ClientExtensionActivationReceipt,
  authorization: ClientExtensionRuntimeAuthorization,
  binding: ClientExtensionPortalBinding,
  manifest: ClientExtensionManifest,
  activationPlan: ClientExtensionActivationPlan,
  blueprint: ClientDemoBlueprint,
  portal: ClientExtensionPortalContext,
  profile: ManagedContextProfile,
) {
  try {
    const rebuilt = await buildClientExtensionAgentContext(
      receipt, authorization, binding, manifest, activationPlan, blueprint, portal, profile,
    )
    if (JSON.stringify(rebuilt) !== JSON.stringify(value)) throw new Error('invalid')
    return {
      ok: true as const,
      contract: CLIENT_EXTENSION_AGENT_CONTEXT_SCHEMA,
      digest: rebuilt.digest,
      activationReceiptDigest: rebuilt.activationReceiptDigest,
      managedContextProfileDigest: rebuilt.managedContextProfileDigest,
      workspaceId: rebuilt.tenant.workspaceId,
      status: rebuilt.agentPolicy.status,
    }
  } catch {
    throw new Error('The client extension agent context is invalid, unactivated, cross-tenant, cross-owner, stale, or changed after review.')
  }
}
