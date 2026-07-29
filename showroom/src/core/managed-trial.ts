import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { buildClientImportStagingPackage } from './client-onboarding'
import {
  commerceCatalogDigest,
  commerceStorefrontConfigurationActionId,
  validateCommerceState,
  type CommerceState,
} from './commerce-workspace.ts'
import {
  readShopServiceSchedule,
  type ShopServiceSchedule,
} from './shop-service-scheduling.ts'


const WORKSPACE_STORAGE_KEY = 'supermega.managed.workspace.v1'
const BUILD_ENV = import.meta.env ?? {}
const SUPABASE_URL = String(BUILD_ENV.VITE_SUPABASE_URL ?? '').trim()
const SUPABASE_PUBLISHABLE_KEY = String(BUILD_ENV.VITE_SUPABASE_PUBLISHABLE_KEY ?? BUILD_ENV.VITE_SUPABASE_ANON_KEY ?? '').trim()
const DEFAULT_WORKSPACE_ID = String(BUILD_ENV.VITE_SUPERMEGA_TRIAL_WORKSPACE_ID ?? '').trim()
const WORKSPACE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

export type ManagedIdentity = {
  userId: string
  email: string
  workspaceId: string
}

export type ManagedApprovalRecord = {
  approval_id: string
  command_id: string
  title: string
  proposal: Record<string, unknown>
  evidence_refs: string[]
  status: 'pending' | 'approved' | 'declined'
  requested_by: string
  requested_actor_kind: 'human' | 'service' | 'agent'
  requested_at: string
  decided_by: string
  decided_actor_kind: string
  decided_at: string
  decision_note: string
  version: number
  idempotent_replay: boolean
}

export type ManagedSurface = 'company' | 'commerce' | 'production' | 'website' | 'setup'

export type ManagedStateRecord = {
  surface: ManagedSurface
  version: number
  state: Record<string, unknown>
  updated_by: string
  updated_at: string
}

export type ManagedCommerceEvent =
  | 'commerce.workspace.initialized'
  | 'commerce.item.created'
  | 'commerce.item.updated'
  | 'commerce.website_intake.created'
  | 'commerce.website_intake.converted'
  | 'commerce.storefront.configuration.saved'
  | 'commerce.tax_configuration.saved'
  | 'commerce.account_mapping.saved'
  | 'commerce.service_schedule.initialized'
  | 'commerce.service_schedule.saved'
  | 'commerce.storefront.merchandising.imported'
  | 'commerce.storefront_request.received'
  | 'commerce.order.created'
  | 'commerce.order.advanced'
  | 'commerce.order.cancelled'
  | 'commerce.order.return_recorded'
  | 'commerce.order.correction_recorded'
  | 'commerce.payment.reconciled'
  | 'commerce.refund.settled'
  | 'commerce.stock.received'
  | 'commerce.stock.counted'
  | 'commerce.production_material.issued'
  | 'commerce.production_batch.received'
  | 'commerce.inventory.initialized'
  | 'commerce.inventory.transferred'
  | 'commerce.purchase_order.created'
  | 'commerce.purchase_order.received'
  | 'commerce.purchase_order.cancelled'
  | 'commerce.close.saved'

export type ManagedWebsiteEvent =
  | 'website.workspace.initialized'
  | 'website.content.saved'
  | 'website.selection.changed'
  | 'website.evidence.recorded'
  | 'website.revision.approved'
  | 'website.snapshot.recorded'
  | 'website.release.recorded'

export type ManagedProductionEvent =
  | 'production.workspace.initialized'
  | 'production.job.created'
  | 'production.job.schedule_updated'
  | 'production.job.closed'
  | 'production.output.recorded'
  | 'production.material.consumed'
  | 'production.issue.opened'
  | 'production.issue.resolved'
  | 'production.quality_hold.placed'
  | 'production.quality_hold.released'
  | 'production.machine_state.changed'
  | 'production.order_execution.recorded'
  | 'production.downtime.started'
  | 'production.downtime.ended'
  | 'production.maintenance.started'
  | 'production.maintenance.completed'

export type ManagedCommandResult = {
  command_id: string
  surface: 'commerce'
  event_type: ManagedCommerceEvent
  version: number
  state: Record<string, unknown>
  idempotent_replay: boolean
}

export type ManagedWebsiteCommandResult = {
  command_id: string
  surface: 'website'
  event_type: ManagedWebsiteEvent
  version: number
  state: Record<string, unknown>
  idempotent_replay: boolean
}

export type ManagedProductionCommandResult = {
  command_id: string
  surface: 'production'
  event_type: ManagedProductionEvent
  version: number
  state: Record<string, unknown>
  idempotent_replay: boolean
}

export type ManagedCommandEvidence = {
  actionId: string
  capturedAt: string
  actor: string
  reason: string
  evidenceReference: string
}

export type ManagedServiceScheduleRecord = {
  version: number
  schedule: ShopServiceSchedule | null
}

export type ManagedBootstrap = {
  identity: {
    workspace_id: string
    actor_id: string
    actor_kind: 'human' | 'service' | 'agent'
  }
  readiness: Record<string, unknown>
  states: Partial<Record<ManagedSurface, ManagedStateRecord>>
  approvals: ManagedApprovalRecord[]
}

export type ManagedClientImportPackage = ReturnType<typeof buildClientImportStagingPackage>

export type ManagedClientImportValidation = {
  contract: 'supermega.client_import_validation.v1'
  status: 'valid'
  product: ManagedClientImportPackage['product']
  object: string
  workflow_template_id: string
  preview_digest: string
  package_digest: string
  row_count: number
  checks: string[]
  workspace_id: string
  activation: {
    status: 'not_applied'
    target_surface: 'commerce' | 'production' | 'website'
    required_capability: 'commerce.write' | 'production.write' | 'website.write'
    human_approval_required: true
    atomic_adapter_ready: boolean
    external_writes_performed: false
  }
}

export type ManagedClientImportActivation = {
  contract: 'supermega.client_import_activation.v1'
  status: 'applied'
  product: 'commerce' | 'production' | 'website' | 'ecommerce'
  object: 'shop_catalog' | 'plant_jobs' | 'website_pages' | 'storefront_merchandising'
  workflow_template_id: string
  package_digest: string
  row_count: number
  workspace_id: string
  external_writes_performed: true
}

export type ManagedClientImportActivationResult = {
  activation: ManagedClientImportActivation
  result: ManagedCommandResult
}

export type ManagedClientImportActivationContext = {
  expectedVersion: number
  priorState?: CommerceState
}

type ManagedApprovalRequest = {
  command_id: string
  title: string
  proposal: object
  evidence_refs: string[]
}

type ManagedApprovalDecision = {
  command_id: string
  decision: 'approved' | 'declined'
  note: string
}

type ErrorBody = {
  detail?: string | { code?: string; message?: string; blockers?: string[] }
  error_description?: string
  message?: string
}

export class ManagedTrialError extends Error {
  status: number
  code: string

  constructor(message: string, options: { status?: number; code?: string } = {}) {
    super(message)
    this.name = 'ManagedTrialError'
    this.status = options.status ?? 0
    this.code = options.code ?? 'managed_trial_error'
  }
}

export function sameManagedIdentity(left: ManagedIdentity, right: ManagedIdentity) {
  return left.userId === right.userId && left.workspaceId === right.workspaceId
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

const CLIENT_IMPORT_VALIDATION_CHECKS = [
  'contract',
  'workflow_profile',
  'mapping',
  'row_schema',
  'field_values',
  'unique_keys',
  'source_rows',
  'preview_digest',
  'package_digest',
] as const

const CLIENT_IMPORT_ACTIVATION = {
  commerce: { target: 'commerce', capability: 'commerce.write' },
  production: { target: 'production', capability: 'production.write' },
  website: { target: 'website', capability: 'website.write' },
  ecommerce: { target: 'commerce', capability: 'commerce.write' },
} as const

const CLIENT_IMPORT_COMMAND_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MANAGED_IMPORT_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

function clientImportAtomicAdapter(product: ManagedClientImportPackage['product']) {
  if (product === 'commerce') {
    return { eventType: 'commerce.workspace.initialized', surface: 'commerce' } as const
  }
  if (product === 'production') {
    return { eventType: 'production.workspace.initialized', surface: 'production' } as const
  }
  if (product === 'website') {
    return { eventType: 'website.workspace.initialized', surface: 'website' } as const
  }
  if (product === 'ecommerce') {
    return { eventType: 'commerce.storefront.merchandising.imported', surface: 'commerce' } as const
  }
  return null
}

function compareManagedImportText(left: string, right: string) {
  const leftCodePoints = Array.from(left, (character) => character.codePointAt(0) as number)
  const rightCodePoints = Array.from(right, (character) => character.codePointAt(0) as number)
  const sharedLength = Math.min(leftCodePoints.length, rightCodePoints.length)
  for (let index = 0; index < sharedLength; index += 1) {
    if (leftCodePoints[index] !== rightCodePoints[index]) return leftCodePoints[index] - rightCodePoints[index]
  }
  return leftCodePoints.length - rightCodePoints.length
}

function expectedEcommerceMerchandising(stagingPackage: ManagedClientImportPackage) {
  return stagingPackage.rows
    .map((row) => ({
      sku: row.values.sku,
      featured: row.values.featured === 'true',
      collection: row.values.collection,
      displayName: row.values.displayName,
      note: row.values.note,
    }))
    .sort((left, right) => compareManagedImportText(left.sku, right.sku))
}

export function managedClientImportActivationContext(
  stagingPackage: ManagedClientImportPackage,
  bootstrap?: ManagedBootstrap,
): ManagedClientImportActivationContext {
  if (stagingPackage.product !== 'ecommerce') return { expectedVersion: 0 }
  const record = bootstrap?.states.commerce
  if (!record
    || record.surface !== 'commerce'
    || !Number.isSafeInteger(record.version)
    || record.version < 1) {
    throw new ManagedTrialError('Create the managed Shop catalog before applying Ecommerce display details.', {
      code: 'managed_client_import_activation_invalid',
    })
  }
  let priorState: CommerceState
  try {
    priorState = validateCommerceState(record.state)
  } catch {
    throw new ManagedTrialError('The managed Shop catalog is not valid for an Ecommerce import.', {
      code: 'managed_client_import_activation_invalid',
    })
  }
  if (!priorState.storefrontConfiguration) {
    throw new ManagedTrialError('Save the Ecommerce storefront name and summary before applying display details.', {
      code: 'managed_client_import_activation_invalid',
    })
  }
  const currentSkus = new Set(priorState.items.map((item) => item.sku))
  if (stagingPackage.rows.some((row) => !currentSkus.has(row.values.sku))) {
    throw new ManagedTrialError('Every Ecommerce import SKU must exist in the current managed Shop catalog.', {
      code: 'managed_client_import_activation_invalid',
    })
  }
  return { expectedVersion: record.version, priorState }
}

async function sha256Text(value: string) {
  if (!globalThis.crypto?.subtle) {
    throw new ManagedTrialError('Secure package verification is unavailable in this browser.', {
      code: 'managed_client_import_digest_unavailable',
    })
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function serializeManagedClientImportPackage(stagingPackage: ManagedClientImportPackage) {
  try {
    const body = JSON.stringify(stagingPackage)
    if (typeof body === 'string') return body
  } catch {
    // The caller receives the same bounded contract error for every serialization failure.
  }
  throw new ManagedTrialError('The staged import package could not be serialized safely.', {
    code: 'managed_client_import_package_invalid',
  })
}

export async function managedClientImportPackageDigest(stagingPackage: ManagedClientImportPackage) {
  return sha256Text(serializeManagedClientImportPackage(stagingPackage))
}

export function assertManagedClientImportValidation(
  response: unknown,
  stagingPackage: ManagedClientImportPackage,
  expectedIdentity: ManagedIdentity,
  expectedPackageDigest: string,
): ManagedClientImportValidation {
  if (!isRecord(response) || !isRecord(response.validation) || !isRecord(response.validation.activation)) {
    throw new ManagedTrialError('The managed workspace returned an invalid import validation.', {
      code: 'managed_client_import_validation_invalid',
    })
  }
  const validation = response.validation
  const activation = validation.activation as Record<string, unknown>
  const expectedActivation = CLIENT_IMPORT_ACTIVATION[stagingPackage.product]
  const checks = validation.checks
  const checksMatch = Array.isArray(checks)
    && checks.length === CLIENT_IMPORT_VALIDATION_CHECKS.length
    && CLIENT_IMPORT_VALIDATION_CHECKS.every((check, index) => checks[index] === check)
  if (validation.contract !== 'supermega.client_import_validation.v1'
    || validation.status !== 'valid'
    || validation.product !== stagingPackage.product
    || validation.object !== stagingPackage.object
    || validation.workflow_template_id !== stagingPackage.workflowTemplateId
    || validation.preview_digest !== stagingPackage.source.previewDigest
    || typeof validation.row_count !== 'number'
    || !Number.isSafeInteger(validation.row_count)
    || validation.row_count !== stagingPackage.rows.length
    || !checksMatch
    || activation.status !== 'not_applied'
    || activation.target_surface !== expectedActivation.target
    || activation.required_capability !== expectedActivation.capability
    || activation.human_approval_required !== true
    || activation.atomic_adapter_ready !== Boolean(clientImportAtomicAdapter(stagingPackage.product))
    || activation.external_writes_performed !== false) {
    throw new ManagedTrialError('The managed workspace returned a mismatched import validation.', {
      code: 'managed_client_import_validation_invalid',
    })
  }
  if (validation.workspace_id !== expectedIdentity.workspaceId) {
    throw new ManagedTrialError('The managed workspace returned a different identity.', {
      code: 'managed_identity_changed',
    })
  }
  if (validation.package_digest !== expectedPackageDigest) {
    throw new ManagedTrialError('The managed import receipt does not match the package that was sent.', {
      code: 'managed_client_import_package_changed',
    })
  }
  return validation as unknown as ManagedClientImportValidation
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort()
  return actual.length === expected.length && expected.every((key, index) => actual[index] === key)
}

function canonicalManagedStateValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalManagedStateValue)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalManagedStateValue(value[key])]),
  )
}

export function sameManagedClientImportState(left: unknown, right: unknown) {
  return JSON.stringify(canonicalManagedStateValue(left)) === JSON.stringify(canonicalManagedStateValue(right))
}

export function assertManagedShopImportState(
  state: unknown,
  stagingPackage: ManagedClientImportPackage,
) {
  const stateKeys = ['closes', 'items', 'movements', 'orders', 'schema'] as const
  const itemKeys = ['name', 'onHand', 'price', 'reorderAt', 'sku'] as const
  if (stagingPackage.product !== 'commerce'
    || !isRecord(state)
    || !hasExactKeys(state, stateKeys)
    || state.schema !== 'supermega.commerce.workspace.v2'
    || !Array.isArray(state.items)
    || !Array.isArray(state.orders)
    || !Array.isArray(state.movements)
    || !Array.isArray(state.closes)
    || state.orders.length !== 0
    || state.movements.length !== 0
    || state.closes.length !== 0
    || state.items.length !== stagingPackage.rows.length) {
    throw new ManagedTrialError('The managed workspace returned an invalid Shop import state.', {
      code: 'managed_client_import_activation_invalid',
    })
  }
  for (const [index, row] of stagingPackage.rows.entries()) {
    const item = state.items[index]
    const expected = {
      sku: row.values.sku,
      name: row.values.name,
      onHand: Number(row.values.onHand),
      reorderAt: Number(row.values.reorderAt),
      price: Number(row.values.price),
    }
    if (!isRecord(item)
      || !hasExactKeys(item, itemKeys)
      || !Number.isSafeInteger(expected.onHand)
      || !Number.isSafeInteger(expected.reorderAt)
      || !Number.isSafeInteger(expected.price)
      || item.sku !== expected.sku
      || item.name !== expected.name
      || item.onHand !== expected.onHand
      || item.reorderAt !== expected.reorderAt
      || item.price !== expected.price) {
      throw new ManagedTrialError('The managed Shop import does not match the checked rows.', {
        code: 'managed_client_import_activation_invalid',
      })
    }
  }
  return state
}

function isCanonicalManagedImportTimestamp(value: unknown) {
  if (typeof value !== 'string' || !MANAGED_IMPORT_TIMESTAMP.test(value)) return false
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
}

export function plantImportDueAt(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return ''
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return ''
  return `${value}T17:29:59.999Z`
}

export function assertManagedPlantImportState(
  state: unknown,
  stagingPackage: ManagedClientImportPackage,
  expectedPackageDigest: string,
) {
  const stateKeys = ['events', 'issues', 'jobs', 'machines', 'openingPlan', 'revision', 'schema'] as const
  const jobKeys = ['dueAt', 'id', 'line', 'output', 'owner', 'priority', 'product', 'target'] as const
  const machineKeys = ['id', 'name', 'state'] as const
  const openingPlanKeys = ['confirmedAt', 'contract', 'industryPackId', 'jobIds', 'machineIds', 'packageDigest'] as const
  if (stagingPackage.product !== 'production'
    || !/^sha256:[0-9a-f]{64}$/.test(expectedPackageDigest)
    || !isRecord(state)
    || !hasExactKeys(state, stateKeys)
    || state.schema !== 'supermega.production.workspace.v2'
    || state.revision !== 0
    || !Array.isArray(state.jobs)
    || state.jobs.length !== stagingPackage.rows.length
    || !Array.isArray(state.issues)
    || state.issues.length !== 0
    || !Array.isArray(state.machines)
    || !Array.isArray(state.events)
    || state.events.length !== 0
    || !isRecord(state.openingPlan)
    || !hasExactKeys(state.openingPlan, openingPlanKeys)
    || state.openingPlan.contract !== 'supermega.production.opening-plan.v1'
    || state.openingPlan.packageDigest !== expectedPackageDigest
    || state.openingPlan.industryPackId !== stagingPackage.plantIndustryPackId
    || !isCanonicalManagedImportTimestamp(state.openingPlan.confirmedAt)
    || !Array.isArray(state.openingPlan.jobIds)
    || !Array.isArray(state.openingPlan.machineIds)) {
    throw new ManagedTrialError('The managed workspace returned an invalid Plant opening plan.', {
      code: 'managed_client_import_activation_invalid',
    })
  }
  const confirmedAt = state.openingPlan.confirmedAt as string
  for (const [index, row] of stagingPackage.rows.entries()) {
    const job = state.jobs[index]
    const target = Number(row.values.targetQuantity)
    const dueAt = plantImportDueAt(row.values.dueDate)
    if (!isRecord(job)
      || !hasExactKeys(job, jobKeys)
      || !Number.isSafeInteger(target)
      || target < 1
      || !dueAt
      || Date.parse(dueAt) <= Date.parse(confirmedAt)
      || job.id !== row.values.jobCode
      || job.line !== row.values.line
      || job.product !== row.values.productName
      || job.target !== target
      || job.output !== 0
      || job.owner !== stagingPackage.owner
      || job.priority !== 'normal'
      || job.dueAt !== dueAt
      || state.openingPlan.jobIds[index] !== row.values.jobCode) {
      throw new ManagedTrialError('The managed Plant import does not match the checked jobs.', {
        code: 'managed_client_import_activation_invalid',
      })
    }
  }
  if (state.openingPlan.jobIds.length !== stagingPackage.rows.length) {
    throw new ManagedTrialError('The managed Plant opening plan has mismatched job evidence.', {
      code: 'managed_client_import_activation_invalid',
    })
  }
  const expectedLines = [...new Set(stagingPackage.rows.map((row) => row.values.line))]
  if (state.machines.length !== expectedLines.length
    || state.openingPlan.machineIds.length !== expectedLines.length) {
    throw new ManagedTrialError('The managed Plant opening plan has mismatched machine evidence.', {
      code: 'managed_client_import_activation_invalid',
    })
  }
  for (const [index, line] of expectedLines.entries()) {
    const machine = state.machines[index]
    const machineId = `machine-import-${index + 1}`
    if (!isRecord(machine)
      || !hasExactKeys(machine, machineKeys)
      || machine.id !== machineId
      || machine.name !== line
      || machine.state !== 'running'
      || state.openingPlan.machineIds[index] !== machineId) {
      throw new ManagedTrialError('The managed Plant import does not match its production lines.', {
        code: 'managed_client_import_activation_invalid',
      })
    }
  }
  return state
}

export function assertManagedWebsiteImportState(
  state: unknown,
  stagingPackage: ManagedClientImportPackage,
  expectedPackageDigest: string,
) {
  const stateKeys = ['approvals', 'contentRevision', 'events', 'evidence', 'localPublishes', 'openingPlan', 'pages', 'revision', 'schema', 'selectedPageId', 'siteName', 'version'] as const
  const pageKeys = ['hero', 'id', 'internalName', 'navigation', 'sections', 'seo', 'slug', 'stage', 'updatedAt'] as const
  const heroKeys = ['ctaHref', 'ctaLabel', 'eyebrow', 'headline', 'summary'] as const
  if (stagingPackage.product !== 'website'
    || !isRecord(state)
    || !hasExactKeys(state, stateKeys)
    || state.schema !== 'supermega.website.workspace.v2'
    || state.version !== 2
    || state.revision !== 0
    || state.contentRevision !== 0
    || state.siteName !== stagingPackage.workspace
    || !isRecord(state.openingPlan)
    || !hasExactKeys(state.openingPlan, ['confirmedAt', 'contract', 'packageDigest', 'pageIds', 'workflowTemplateId'])
    || state.openingPlan.contract !== 'supermega.website.opening-plan.v1'
    || state.openingPlan.packageDigest !== expectedPackageDigest
    || state.openingPlan.workflowTemplateId !== stagingPackage.workflowTemplateId
    || !isCanonicalManagedImportTimestamp(state.openingPlan.confirmedAt)
    || !Array.isArray(state.openingPlan.pageIds)
    || state.openingPlan.pageIds.length !== stagingPackage.rows.length
    || state.selectedPageId !== 'page-import-1'
    || !Array.isArray(state.pages)
    || state.pages.length !== stagingPackage.rows.length
    || !Array.isArray(state.evidence)
    || state.evidence.length !== 0
    || !Array.isArray(state.approvals)
    || state.approvals.length !== 0
    || !Array.isArray(state.localPublishes)
    || state.localPublishes.length !== 0
    || !Array.isArray(state.events)
    || state.events.length !== 0) {
    throw new ManagedTrialError('The managed workspace returned an invalid Website import state.', {
      code: 'managed_client_import_activation_invalid',
    })
  }
  let serverTimestamp = ''
  for (const [index, row] of stagingPackage.rows.entries()) {
    const page = state.pages[index]
    const expectedId = `page-import-${index + 1}`
    const expectedSlug = row.values.slug === 'home' ? '/' : `/${row.values.slug}`
    const contactUrl = row.values.contactUrl
    if (!isRecord(page)
      || !hasExactKeys(page, pageKeys)
      || page.id !== expectedId
      || state.openingPlan.pageIds[index] !== expectedId
      || page.internalName !== row.values.title
      || page.slug !== expectedSlug
      || page.stage !== 'draft'
      || !isRecord(page.navigation)
      || !hasExactKeys(page.navigation, ['label', 'visible'])
      || page.navigation.label !== row.values.title
      || page.navigation.visible !== false
      || !isRecord(page.hero)
      || !hasExactKeys(page.hero, heroKeys)
      || page.hero.eyebrow !== ''
      || page.hero.headline !== row.values.headline
      || page.hero.summary !== ''
      || page.hero.ctaLabel !== (contactUrl ? 'Contact' : '')
      || page.hero.ctaHref !== contactUrl
      || !Array.isArray(page.sections)
      || page.sections.length !== 1
      || !isRecord(page.sections[0])
      || !hasExactKeys(page.sections[0], ['body', 'eyebrow', 'id', 'title'])
      || page.sections[0].id !== `section-import-${index + 1}`
      || page.sections[0].eyebrow !== ''
      || page.sections[0].title !== row.values.title
      || page.sections[0].body !== row.values.body
      || !isRecord(page.seo)
      || !hasExactKeys(page.seo, ['description', 'title'])
      || page.seo.title !== row.values.title
      || page.seo.description !== ''
      || !isCanonicalManagedImportTimestamp(page.updatedAt)
      || (serverTimestamp && page.updatedAt !== serverTimestamp)) {
      throw new ManagedTrialError('The managed Website import does not match the checked rows.', {
        code: 'managed_client_import_activation_invalid',
      })
    }
    serverTimestamp = page.updatedAt as string
  }
  return state
}

export async function assertManagedEcommerceImportState(
  state: unknown,
  priorState: unknown,
  stagingPackage: ManagedClientImportPackage,
  expectedIdentity: ManagedIdentity,
  expectedPackageDigest: string,
) {
  if (stagingPackage.product !== 'ecommerce') {
    throw new ManagedTrialError('The Ecommerce import state has the wrong product boundary.', {
      code: 'managed_client_import_activation_invalid',
    })
  }
  let accepted: CommerceState
  let previous: CommerceState
  try {
    accepted = validateCommerceState(state)
    previous = validateCommerceState(priorState)
  } catch {
    throw new ManagedTrialError('The managed workspace returned an invalid Ecommerce import state.', {
      code: 'managed_client_import_activation_invalid',
    })
  }
  const previousConfiguration = previous.storefrontConfiguration
  const acceptedConfiguration = accepted.storefrontConfiguration
  if (!previousConfiguration || !acceptedConfiguration) {
    throw new ManagedTrialError('The managed Ecommerce import is missing its saved storefront identity.', {
      code: 'managed_client_import_activation_invalid',
    })
  }
  const unchangedKeys = [
    'schema',
    'items',
    'orders',
    'movements',
    'closes',
    'catalogBaselines',
    'catalogChanges',
    'websiteIntakes',
    'storefrontRequests',
    'purchaseOrders',
  ] as const
  const acceptedRecord = accepted as unknown as Record<string, unknown>
  const previousRecord = previous as unknown as Record<string, unknown>
  if (unchangedKeys.some((key) => JSON.stringify(acceptedRecord[key]) !== JSON.stringify(previousRecord[key]))) {
    throw new ManagedTrialError('The managed Ecommerce receipt changed Shop records and was rejected.', {
      code: 'managed_client_import_activation_invalid',
    })
  }
  let catalogDigest: string
  try {
    catalogDigest = await commerceCatalogDigest(previous)
  } catch {
    throw new ManagedTrialError('The managed Shop catalog fingerprint could not be verified.', {
      code: 'managed_client_import_digest_unavailable',
    })
  }
  const expectedMerchandising = expectedEcommerceMerchandising(stagingPackage)
  const expectedSelectedSkus = expectedMerchandising.map((row) => row.sku)
  const expectedRevision = previousConfiguration.revision + 1
  const expectedCatalogRevision = previousConfiguration.shopCatalogDigest === catalogDigest
    ? previousConfiguration.shopCatalogSnapshotRevision
    : previousConfiguration.shopCatalogSnapshotRevision + 1
  const saved = acceptedConfiguration.saved
  const activation = acceptedConfiguration.activation
  if (acceptedConfiguration.revision !== expectedRevision
    || acceptedConfiguration.shopCatalogSnapshotRevision !== expectedCatalogRevision
    || acceptedConfiguration.shopCatalogDigest !== catalogDigest
    || acceptedConfiguration.storeName !== previousConfiguration.storeName
    || acceptedConfiguration.summary !== previousConfiguration.summary
    || JSON.stringify(acceptedConfiguration.selectedSkus) !== JSON.stringify(expectedSelectedSkus)
    || JSON.stringify(acceptedConfiguration.merchandising) !== JSON.stringify(expectedMerchandising)
    || !activation
    || activation.contract !== 'supermega.ecommerce.activation.v1'
    || activation.packageDigest !== expectedPackageDigest
    || activation.workflowTemplateId !== stagingPackage.workflowTemplateId
    || !isCanonicalManagedImportTimestamp(activation.confirmedAt)
    || JSON.stringify(activation.skus) !== JSON.stringify(expectedSelectedSkus)
    || saved.actionId !== commerceStorefrontConfigurationActionId(expectedRevision, catalogDigest)
    || saved.actor !== expectedIdentity.userId
    || saved.reason !== 'Apply the reviewed Ecommerce merchandising import.'
    || saved.evidenceReference !== `ECOMMERCE-STOREFRONT:${catalogDigest}:R${expectedRevision}`) {
    throw new ManagedTrialError('The managed Ecommerce import does not match the reviewed display details.', {
      code: 'managed_client_import_activation_invalid',
    })
  }
  return state
}

export async function assertManagedClientImportState(
  state: unknown,
  stagingPackage: ManagedClientImportPackage,
  expectedPackageDigest: string,
  context?: {
    expectedIdentity?: ManagedIdentity
    priorState?: unknown
  },
) {
  if (stagingPackage.product === 'commerce') return assertManagedShopImportState(state, stagingPackage)
  if (stagingPackage.product === 'production') return assertManagedPlantImportState(state, stagingPackage, expectedPackageDigest)
  if (stagingPackage.product === 'website') return assertManagedWebsiteImportState(state, stagingPackage, expectedPackageDigest)
  if (stagingPackage.product === 'ecommerce' && context?.expectedIdentity && context.priorState) {
    return assertManagedEcommerceImportState(state, context.priorState, stagingPackage, context.expectedIdentity, expectedPackageDigest)
  }
  throw new ManagedTrialError('This managed import does not have an atomic product adapter.', {
    code: 'managed_client_import_activation_invalid',
  })
}

export async function assertManagedClientImportActivation(
  response: unknown,
  stagingPackage: ManagedClientImportPackage,
  validation: ManagedClientImportValidation,
  expectedIdentity: ManagedIdentity,
  commandId: string,
  expectedVersion: number,
  priorState?: unknown,
): Promise<ManagedClientImportActivationResult> {
  const adapter = clientImportAtomicAdapter(stagingPackage.product)
  const activationVersionIsValid = stagingPackage.product === 'ecommerce'
    ? Number.isSafeInteger(expectedVersion) && expectedVersion >= 1 && Boolean(priorState)
    : expectedVersion === 0 && priorState === undefined
  if (!adapter
    || validation.product !== stagingPackage.product
    || validation.activation.atomic_adapter_ready !== true
    || validation.package_digest.length !== 71
    || !activationVersionIsValid
    || !CLIENT_IMPORT_COMMAND_ID.test(commandId)
    || !isRecord(response)
    || !isRecord(response.activation)
    || !isRecord(response.result)) {
    throw new ManagedTrialError('The managed import activation is invalid.', {
      code: 'managed_client_import_activation_invalid',
    })
  }
  const activation = response.activation
  const result = response.result
  if (!hasExactKeys(activation, [
    'contract',
    'external_writes_performed',
    'object',
    'package_digest',
    'product',
    'row_count',
    'status',
    'workflow_template_id',
    'workspace_id',
  ])
    || activation.contract !== 'supermega.client_import_activation.v1'
    || activation.status !== 'applied'
    || activation.product !== stagingPackage.product
    || activation.object !== stagingPackage.object
    || activation.workflow_template_id !== stagingPackage.workflowTemplateId
    || activation.package_digest !== validation.package_digest
    || activation.row_count !== stagingPackage.rows.length
    || activation.workspace_id !== expectedIdentity.workspaceId
    || activation.external_writes_performed !== true
    || !hasExactKeys(result, ['command_id', 'event_type', 'idempotent_replay', 'state', 'surface', 'version'])
    || result.command_id !== commandId
    || result.surface !== adapter.surface
    || result.event_type !== adapter.eventType
    || result.version !== expectedVersion + 1
    || typeof result.idempotent_replay !== 'boolean') {
    throw new ManagedTrialError('The managed import response does not match the reviewed package.', {
      code: 'managed_client_import_activation_invalid',
    })
  }
  await assertManagedClientImportState(result.state, stagingPackage, validation.package_digest, {
    expectedIdentity,
    priorState,
  })
  return response as unknown as ManagedClientImportActivationResult
}

export function assertManagedBootstrapIdentity(
  bootstrap: unknown,
  expectedIdentity: ManagedIdentity,
): ManagedBootstrap {
  if (!isRecord(bootstrap)
    || !isRecord(bootstrap.identity)
    || !isRecord(bootstrap.readiness)
    || !isRecord(bootstrap.states)
    || !Array.isArray(bootstrap.approvals)) {
    throw new ManagedTrialError('The managed workspace returned an invalid bootstrap response.', {
      code: 'managed_bootstrap_invalid',
    })
  }
  if (bootstrap.identity.workspace_id !== expectedIdentity.workspaceId
    || bootstrap.identity.actor_id !== expectedIdentity.userId
    || bootstrap.identity.actor_kind !== 'human') {
    throw new ManagedTrialError('The managed workspace returned a different identity.', {
      code: 'managed_identity_changed',
    })
  }
  return bootstrap as ManagedBootstrap
}

export function requireManagedSurfaceState(
  bootstrap: ManagedBootstrap,
  surface: ManagedSurface,
  productName: string,
): ManagedStateRecord {
  const record = bootstrap.states[surface]
  if (!record) {
    throw new ManagedTrialError(
      `You do not have access to ${productName} in this workspace. Ask a workspace owner to update your role.`,
      { code: 'trial_capability_required' },
    )
  }
  if (record.surface !== surface
    || !Number.isSafeInteger(record.version)
    || record.version < 0
    || !isRecord(record.state)) {
    throw new ManagedTrialError(`The managed ${productName} workspace returned an invalid state.`, {
      code: 'managed_state_invalid',
    })
  }
  return record
}

let clientPromise: Promise<SupabaseClient | null> | undefined

function validSupabaseUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname))
  } catch {
    return false
  }
}

function decodeLegacyKeyRole(value: string) {
  try {
    const parts = value.split('.')
    if (parts.length !== 3) return ''
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const decoded = JSON.parse(window.atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='))) as { role?: string }
    return decoded.role ?? ''
  } catch {
    return ''
  }
}

function validPublishableKey(value: string) {
  if (value.startsWith('sb_publishable_')) return value.length >= 24
  return decodeLegacyKeyRole(value) === 'anon'
}

export function managedTrialAuthConfigured() {
  return validSupabaseUrl(SUPABASE_URL) && validPublishableKey(SUPABASE_PUBLISHABLE_KEY)
}

function authClient() {
  if (clientPromise) return clientPromise
  if (!managedTrialAuthConfigured()) return Promise.resolve(null)
  clientPromise = import('@supabase/supabase-js').then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      persistSession: true,
      storageKey: 'supermega.auth.session.v1',
    },
  }))
  return clientPromise
}

function normalizeWorkspaceId(value: string) {
  const workspaceId = value.trim()
  if (!WORKSPACE_ID.test(workspaceId)) {
    throw new ManagedTrialError('Enter a valid managed workspace ID.', { code: 'workspace_invalid' })
  }
  return workspaceId
}

export function currentManagedWorkspace() {
  try {
    const stored = window.localStorage.getItem(WORKSPACE_STORAGE_KEY) ?? ''
    if (WORKSPACE_ID.test(stored)) return stored
  } catch {
    // The configured workspace remains available when storage is disabled.
  }
  return WORKSPACE_ID.test(DEFAULT_WORKSPACE_ID) ? DEFAULT_WORKSPACE_ID : ''
}

function rememberWorkspace(value: string) {
  const workspaceId = normalizeWorkspaceId(value)
  try {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, workspaceId)
  } catch {
    // Workspace identity is still sent for this session and rechecked by the server.
  }
  return workspaceId
}

function identity(session: Session, workspaceId: string): ManagedIdentity {
  return {
    userId: session.user.id,
    email: session.user.email ?? 'Named user',
    workspaceId,
  }
}

export async function currentManagedIdentity(): Promise<ManagedIdentity | null> {
  const supabase = await authClient()
  const workspaceId = currentManagedWorkspace()
  if (!supabase || !workspaceId) return null
  // The browser session is used only to forward its JWT. The API verifies the
  // token with Supabase Auth and authorizes it through workspace membership.
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session || data.session.user.is_anonymous !== false) return null
  if (currentManagedWorkspace() !== workspaceId) return null
  return identity(data.session, workspaceId)
}

export async function signInManagedTrial(email: string, password: string, workspace: string) {
  const supabase = await authClient()
  if (!supabase) {
    throw new ManagedTrialError('Managed sign-in is not configured in this app build.', { code: 'auth_not_configured' })
  }
  const workspaceId = rememberWorkspace(workspace)
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error || !data.session || data.user.is_anonymous !== false) {
    throw new ManagedTrialError('Sign-in failed. Check the account and password.', {
      status: error?.status,
      code: error?.code ?? 'sign_in_failed',
    })
  }
  return identity(data.session, workspaceId)
}

export async function signOutManagedTrial() {
  const supabase = await authClient()
  if (supabase) await supabase.auth.signOut({ scope: 'local' })
}

async function parseError(response: Response) {
  let body: ErrorBody = {}
  try {
    body = await response.json() as ErrorBody
  } catch {
    // Use the status fallback when the API did not return its JSON error contract.
  }
  const detail = typeof body.detail === 'object' && body.detail ? body.detail : {}
  const code = detail.code || `http_${response.status}`
  const blockers = Array.isArray(detail.blockers) ? ` (${detail.blockers.join(', ')})` : ''
  const message = detail.message
    || (typeof body.detail === 'string' ? body.detail : '')
    || body.error_description
    || body.message
    || 'Managed workspace request failed.'
  return new ManagedTrialError(`${message}${blockers}`, { status: response.status, code })
}

async function sessionForRequest(expectedIdentity?: ManagedIdentity) {
  const supabase = await authClient()
  if (!supabase) throw new ManagedTrialError('Managed sign-in is not configured.', { code: 'auth_not_configured' })
  const workspaceId = normalizeWorkspaceId(currentManagedWorkspace())
  let { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw new ManagedTrialError('Sign in to the managed workspace first.', { code: 'auth_required' })
  if (data.session.expires_at && data.session.expires_at * 1000 <= Date.now() + 60_000) {
    const refreshed = await supabase.auth.refreshSession()
    data = refreshed.data
    error = refreshed.error
  }
  if (error || !data.session || data.session.user.is_anonymous !== false) {
    throw new ManagedTrialError('The managed session expired. Sign in again.', { code: 'auth_expired' })
  }
  if (currentManagedWorkspace() !== workspaceId) {
    throw new ManagedTrialError('The managed workspace changed during authentication.', {
      code: 'managed_identity_changed',
    })
  }
  const resolvedIdentity = identity(data.session, workspaceId)
  if (expectedIdentity && !sameManagedIdentity(resolvedIdentity, expectedIdentity)) {
    throw new ManagedTrialError('The managed workspace identity changed during the request.', {
      code: 'managed_identity_changed',
    })
  }
  return { session: data.session, workspaceId }
}

async function authorizedRequest<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
  expectedIdentity?: ManagedIdentity,
): Promise<T> {
  const { session, workspaceId } = await sessionForRequest(expectedIdentity)
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')
  headers.set('authorization', `Bearer ${session.access_token}`)
  headers.set('x-supermega-workspace-id', workspaceId)
  if (init.body) headers.set('content-type', 'application/json')
  const response = await fetch(path, { ...init, headers })
  if (response.status === 401 && retry) {
    const supabase = await authClient()
    const refreshed = await supabase?.auth.refreshSession()
    if (refreshed?.data.session && !refreshed.error) {
      return authorizedRequest<T>(path, init, false, expectedIdentity)
    }
  }
  if (expectedIdentity) await sessionForRequest(expectedIdentity)
  if (!response.ok) throw await parseError(response)
  return response.json() as Promise<T>
}

export async function validateManagedClientImport(
  stagingPackage: ManagedClientImportPackage,
  expectedIdentity: ManagedIdentity,
) {
  const body = serializeManagedClientImportPackage(stagingPackage)
  const submittedPackage = JSON.parse(body) as ManagedClientImportPackage
  const expectedPackageDigest = await sha256Text(body)
  const response = await authorizedRequest<unknown>(
    '/api/trial/v1/imports/validate',
    { method: 'POST', body },
    true,
    expectedIdentity,
  )
  return assertManagedClientImportValidation(
    response,
    submittedPackage,
    expectedIdentity,
    expectedPackageDigest,
  )
}

export async function applyManagedClientImport(request: {
  commandId: string
  expectedVersion: number
  identity: ManagedIdentity
  priorState?: CommerceState
  stagingPackage: ManagedClientImportPackage
  validation: ManagedClientImportValidation
}) {
  const body = serializeManagedClientImportPackage(request.stagingPackage)
  const submittedPackage = JSON.parse(body) as ManagedClientImportPackage
  let priorStateSnapshot: unknown
  if (submittedPackage.product === 'ecommerce') {
    try {
      priorStateSnapshot = structuredClone(request.priorState)
    } catch {
      throw new ManagedTrialError('The managed Shop state could not be retained for Ecommerce activation.', {
        code: 'managed_client_import_activation_invalid',
      })
    }
  }
  const currentDigest = await sha256Text(body)
  const activationVersionIsValid = submittedPackage.product === 'ecommerce'
    ? Number.isSafeInteger(request.expectedVersion) && request.expectedVersion >= 1 && Boolean(request.priorState)
    : request.expectedVersion === 0 && request.priorState === undefined
  if (!clientImportAtomicAdapter(submittedPackage.product)
    || !activationVersionIsValid
    || request.validation.product !== submittedPackage.product
    || request.validation.activation.atomic_adapter_ready !== true
    || request.validation.workspace_id !== request.identity.workspaceId
    || request.validation.package_digest !== currentDigest
    || !CLIENT_IMPORT_COMMAND_ID.test(request.commandId)) {
    throw new ManagedTrialError('The validated import changed before activation.', {
      code: 'managed_client_import_package_changed',
    })
  }
  let submittedPriorState: CommerceState | undefined
  if (submittedPackage.product === 'ecommerce') {
    try {
      submittedPriorState = validateCommerceState(priorStateSnapshot)
    } catch {
      throw new ManagedTrialError('The managed Shop state changed before Ecommerce activation.', {
        code: 'managed_client_import_activation_invalid',
      })
    }
    const currentSkus = new Set(submittedPriorState.items.map((item) => item.sku))
    if (!submittedPriorState.storefrontConfiguration
      || submittedPackage.rows.some((row) => !currentSkus.has(row.values.sku))) {
      throw new ManagedTrialError('The managed Ecommerce prerequisites changed before activation.', {
        code: 'managed_client_import_activation_invalid',
      })
    }
  }
  const response = await authorizedRequest<unknown>(
    '/api/trial/v1/imports/apply',
    {
      method: 'POST',
      body: JSON.stringify({
        command_id: request.commandId,
        expected_version: request.expectedVersion,
        confirmation: `APPLY ${request.validation.package_digest}`,
        package: submittedPackage,
      }),
    },
    true,
    request.identity,
  )
  return await assertManagedClientImportActivation(
    response,
    submittedPackage,
    request.validation,
    request.identity,
    request.commandId,
    request.expectedVersion,
    submittedPriorState,
  )
}

export async function loadManagedBootstrap(expectedIdentity?: ManagedIdentity) {
  const bootstrap = await authorizedRequest<ManagedBootstrap>(
    '/api/trial/v1/bootstrap',
    {},
    true,
    expectedIdentity,
  )
  return expectedIdentity ? assertManagedBootstrapIdentity(bootstrap, expectedIdentity) : bootstrap
}

function managedServiceSchedule(value: unknown) {
  try {
    return value === null || value === undefined
      ? null
      : readShopServiceSchedule(JSON.stringify(value))
  } catch {
    throw new ManagedTrialError('The managed appointment schedule is invalid.', {
      code: 'managed_service_schedule_invalid',
    })
  }
}

export async function loadManagedServiceSchedule(
  identity: ManagedIdentity,
): Promise<ManagedServiceScheduleRecord> {
  const response = await authorizedRequest<unknown>(
    '/api/trial/v1/commerce/service-schedule',
    {},
    true,
    identity,
  )
  if (!isRecord(response)
    || response.workspace_id !== identity.workspaceId
    || typeof response.version !== 'number'
    || !Number.isSafeInteger(response.version)
    || response.version < 1) {
    throw new ManagedTrialError('The managed appointment response is invalid.', {
      code: 'managed_service_schedule_response_invalid',
    })
  }
  return {
    version: response.version,
    schedule: managedServiceSchedule(response.schedule),
  }
}

export async function saveManagedServiceSchedule(request: {
  commandId: string
  expectedVersion: number
  identity: ManagedIdentity
  schedule: ShopServiceSchedule
}): Promise<ManagedServiceScheduleRecord> {
  const response = await authorizedRequest<unknown>(
    '/api/trial/v1/commerce/service-schedule',
    {
      method: 'POST',
      body: JSON.stringify({
        command_id: request.commandId,
        expected_version: request.expectedVersion,
        captured_at: new Date().toISOString(),
        schedule: request.schedule,
      }),
    },
    true,
    request.identity,
  )
  const result = isRecord(response) && isRecord(response.result) ? response.result : null
  const state = result && isRecord(result.state) ? result.state : null
  const nextSchedule = state ? managedServiceSchedule(state.serviceSchedule) : null
  const expectedEvent = request.schedule.revision === 0
    ? 'commerce.service_schedule.initialized'
    : 'commerce.service_schedule.saved'
  if (!result
    || result.surface !== 'commerce'
    || result.event_type !== expectedEvent
    || typeof result.version !== 'number'
    || !Number.isSafeInteger(result.version)
    || result.version !== request.expectedVersion + 1
    || !nextSchedule) {
    throw new ManagedTrialError('The managed appointment save response is invalid.', {
      code: 'managed_service_schedule_save_invalid',
    })
  }
  return { version: result.version, schedule: nextSchedule }
}

export async function prepareManagedOrderIntakeDraft(request: {
  identity: ManagedIdentity
  message: string
  sourceLabel: string
}) {
  return authorizedRequest<unknown>(
    '/api/trial/v1/commerce/order-intake/drafts',
    {
      method: 'POST',
      body: JSON.stringify({
        source_label: request.sourceLabel,
        message: request.message,
      }),
    },
    true,
    request.identity,
  )
}

export async function saveManagedCommerceCommand(request: {
  commandId: string
  evidence: ManagedCommandEvidence
  eventType: ManagedCommerceEvent
  expectedVersion: number
  identity?: ManagedIdentity
  state: Record<string, unknown>
}) {
  const response = await authorizedRequest<{ result: ManagedCommandResult }>(
    '/api/trial/v1/commands',
    {
      method: 'POST',
      body: JSON.stringify({
        command_id: request.commandId,
        surface: 'commerce',
        event_type: request.eventType,
        expected_version: request.expectedVersion,
        payload: { state: request.state, evidence: request.evidence },
      }),
    },
    true,
    request.identity,
  )
  return response.result
}

export async function saveManagedProductionCommand(request: {
  commandId: string
  evidence: ManagedCommandEvidence
  eventType: ManagedProductionEvent
  expectedVersion: number
  identity?: ManagedIdentity
  state: Record<string, unknown>
}) {
  const response = await authorizedRequest<{ result: ManagedProductionCommandResult }>(
    '/api/trial/v1/commands',
    {
      method: 'POST',
      body: JSON.stringify({
        command_id: request.commandId,
        surface: 'production',
        event_type: request.eventType,
        expected_version: request.expectedVersion,
        payload: { state: request.state, evidence: request.evidence },
      }),
    },
    true,
    request.identity,
  )
  return response.result
}

export async function saveManagedWebsiteCommand(request: {
  commandId: string
  evidence: ManagedCommandEvidence
  eventType: ManagedWebsiteEvent
  expectedVersion: number
  identity: ManagedIdentity
  state: object
}) {
  const response = await authorizedRequest<{ result: ManagedWebsiteCommandResult }>(
    '/api/trial/v1/commands',
    {
      method: 'POST',
      body: JSON.stringify({
        command_id: request.commandId,
        surface: 'website',
        event_type: request.eventType,
        expected_version: request.expectedVersion,
        payload: { state: request.state, evidence: request.evidence },
      }),
    },
    true,
    request.identity,
  )
  return response.result
}

export async function createManagedApproval(request: ManagedApprovalRequest) {
  const response = await authorizedRequest<{ approval: ManagedApprovalRecord }>('/api/trial/v1/approvals', {
    method: 'POST',
    body: JSON.stringify(request),
  })
  return response.approval
}

export async function decideManagedApproval(approvalId: string, decision: ManagedApprovalDecision) {
  const response = await authorizedRequest<{ approval: ManagedApprovalRecord }>(
    `/api/trial/v1/approvals/${encodeURIComponent(approvalId)}/decision`,
    { method: 'POST', body: JSON.stringify(decision) },
  )
  return response.approval
}
