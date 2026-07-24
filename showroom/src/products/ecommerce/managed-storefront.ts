import {
  commerceCatalogDigest,
  commerceStorefrontConfiguration,
  commerceStorefrontConfigurationActionId,
  saveCommerceStorefrontConfiguration,
  validateCommerceState,
  type CommerceActionProof,
  type CommerceState,
  type CommerceStorefrontConfiguration,
  type CommerceStorefrontConfigurationInput,
} from '../../core/commerce-workspace.ts'

export type ManagedStorefrontSaved = {
  revision: number
  savedAt: string
  storeName: string
  summary: string
  selectedSkus: string[]
}

export type ManagedStorefrontSavePlan = {
  status: 'ready' | 'unchanged'
  current: CommerceState
  next: CommerceState
  evidence: CommerceActionProof
  configuration: CommerceStorefrontConfiguration
}

export type ManagedStorefrontCommandResult = {
  command_id: string
  surface: 'commerce'
  event_type: string
  version: number
  state: Record<string, unknown>
  idempotent_replay: boolean
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function sameStrings(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

export function readManagedStorefront(state: CommerceState): ManagedStorefrontSaved | null {
  const configuration = commerceStorefrontConfiguration(validateCommerceState(state))
  if (!configuration) return null
  return {
    revision: configuration.revision,
    savedAt: new Date(configuration.saved.capturedAt).toISOString(),
    storeName: configuration.storeName,
    summary: configuration.summary,
    selectedSkus: [...configuration.selectedSkus],
  }
}

export async function prepareManagedStorefrontSave(
  state: CommerceState,
  input: Omit<CommerceStorefrontConfigurationInput, 'shopCatalogDigest'>,
  actor: string,
  capturedAt: string,
): Promise<ManagedStorefrontSavePlan> {
  const current = validateCommerceState(structuredClone(state))
  const shopCatalogDigest = await commerceCatalogDigest(current)
  const existing = commerceStorefrontConfiguration(current)
  const revision = (existing?.revision ?? 0) + 1
  const evidence: CommerceActionProof = {
    actionId: commerceStorefrontConfigurationActionId(revision, shopCatalogDigest),
    capturedAt,
    actor,
    reason: 'Save this Ecommerce storefront configuration for the current Shop catalog.',
    evidenceReference: `ECOMMERCE-STOREFRONT:${shopCatalogDigest}:R${revision}`,
  }
  const next = await saveCommerceStorefrontConfiguration(
    current,
    { ...input, shopCatalogDigest },
    evidence,
  )
  if (!next) throw new Error('The storefront configuration does not match the current Shop catalog.')
  const configuration = commerceStorefrontConfiguration(next)
  if (!configuration) throw new Error('The prepared storefront configuration is missing.')
  return {
    status: existing && configuration.revision === existing.revision ? 'unchanged' : 'ready',
    current,
    next,
    evidence,
    configuration,
  }
}

export function acceptManagedStorefrontSave(
  plan: ManagedStorefrontSavePlan,
  returnedState: Record<string, unknown>,
  expectedActor: string,
) {
  if (plan.status !== 'ready') throw new Error('An unchanged storefront configuration cannot be submitted.')
  const accepted = validateCommerceState(returnedState)
  const configuration = commerceStorefrontConfiguration(accepted)
  if (!configuration) throw new Error('The managed workspace did not retain the storefront configuration.')
  const expected = plan.configuration
  if (configuration.schema !== expected.schema
    || configuration.revision !== expected.revision
    || configuration.shopCatalogSnapshotRevision !== expected.shopCatalogSnapshotRevision
    || configuration.shopCatalogDigest !== expected.shopCatalogDigest
    || configuration.storeName !== expected.storeName
    || configuration.summary !== expected.summary
    || !sameStrings(configuration.selectedSkus, expected.selectedSkus)
    || configuration.saved.actionId !== expected.saved.actionId
    || configuration.saved.actor !== expectedActor
    || configuration.saved.reason !== expected.saved.reason
    || configuration.saved.evidenceReference !== expected.saved.evidenceReference) {
    throw new Error('The managed workspace returned a different storefront configuration.')
  }
  for (const field of ['items', 'orders', 'movements', 'closes'] as const) {
    if (!sameJson(accepted[field], plan.current[field])) {
      throw new Error(`The storefront save changed Commerce ${field} and was rejected.`)
    }
  }
  if (!sameJson(accepted.websiteIntakes ?? [], plan.current.websiteIntakes ?? [])
    || !sameJson(accepted.storefrontRequests ?? [], plan.current.storefrontRequests ?? [])) {
    throw new Error('The storefront save changed another Commerce intake and was rejected.')
  }
  return accepted
}

export function acceptManagedStorefrontCommand(
  plan: ManagedStorefrontSavePlan,
  result: ManagedStorefrontCommandResult,
  expected: {
    commandId: string
    priorVersion: number
    actor: string
  },
) {
  if (result.command_id !== expected.commandId
    || result.surface !== 'commerce'
    || result.event_type !== 'commerce.storefront.configuration.saved'
    || result.version !== expected.priorVersion + 1
    || typeof result.idempotent_replay !== 'boolean') {
    throw new Error('The managed workspace returned an unrelated storefront save receipt.')
  }
  return {
    state: acceptManagedStorefrontSave(plan, result.state, expected.actor),
    version: result.version,
    replayed: result.idempotent_replay,
  }
}
