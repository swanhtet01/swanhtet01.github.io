import { clientCapabilityIdsForProducts, type ClientCapabilityDomain } from './client-capability-plan.ts'
import type { ClientDemoBlueprint, ClientSolutionId } from './client-onboarding.ts'

export const CLIENT_EXTENSION_MANIFEST_SCHEMA = 'supermega.client_extension_manifest.v1' as const

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

const ID = /^ext-[a-z][a-z0-9-]{1,58}$/
const RECORD_ID = /^[a-z][a-z0-9_]{1,63}$/
const DOMAIN: readonly ClientCapabilityDomain[] = ['operations', 'master-data', 'finance', 'customer', 'supply-chain', 'quality', 'workforce', 'governance', 'intelligence', 'integration']
const MODE: readonly ClientExtensionMode[] = ['read-only', 'draft-only', 'reviewed-write']

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
