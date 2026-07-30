import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { buildClientImportStagingPackage } from './client-onboarding'
import {
  commerceCatalogDigest,
  commerceStorefrontConfigurationActionId,
  validateCommerceState,
  type CommerceState,
} from './commerce-workspace.ts'
import type { EcommerceOrderQueueReadinessPacket } from '../products/ecommerce/ecommerce-order-review-packet'
import {
  managedContextProfileProjection,
  managedContextValidationProjection,
  structurallyValidManagedContextBriefProjection,
  structurallyValidManagedContextProfile,
  type ManagedContextBriefProjection,
  type ManagedContextProfile,
  type ManagedContextProfileRequest,
  type ManagedContextRetention,
  type ManagedContextValidation,
} from './managed-context.ts'
import {
  structurallyValidOperatingBaseline,
  structurallyValidOperatingBaselineChange,
  type OperatingBaseline,
  type OperatingBaselineChange,
} from './operating-baseline.ts'


const WORKSPACE_STORAGE_KEY = 'supermega.managed.workspace.v1'
const BUILD_ENV = import.meta.env ?? {}
const SUPABASE_URL = String(BUILD_ENV.VITE_SUPABASE_URL ?? '').trim()
const SUPABASE_PUBLISHABLE_KEY = String(BUILD_ENV.VITE_SUPABASE_PUBLISHABLE_KEY ?? BUILD_ENV.VITE_SUPABASE_ANON_KEY ?? '').trim()
const DEFAULT_WORKSPACE_ID = String(BUILD_ENV.VITE_SUPERMEGA_TRIAL_WORKSPACE_ID ?? '').trim()
const WORKSPACE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const AUTH_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const AUTH_CODE = /^[A-Za-z0-9._~-]{16,2048}$/
const AUTH_TOKEN = /^[A-Za-z0-9._~-]{16,16384}$/

export type ManagedIdentity = {
  userId: string
  email: string
  workspaceId: string
}

export type ManagedWorkspaceDirectoryEntry = {
  workspaceId: string
  label: string
  access: 'owner' | 'operator' | 'viewer'
}

export type ManagedWorkspaceSignIn = {
  userId: string
  email: string
  workspaces: ManagedWorkspaceDirectoryEntry[]
}

export type ManagedAccountSetup = {
  purpose: 'account' | 'invite' | 'recovery'
  email: string
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
  | 'commerce.storefront.merchandising.imported'
  | 'commerce.storefront_request.received'
  | 'commerce.order.created'
  | 'commerce.order.advanced'
  | 'commerce.order.cancelled'
  | 'commerce.order.return_recorded'
  | 'commerce.payment.reconciled'
  | 'commerce.refund.settled'
  | 'commerce.stock.received'
  | 'commerce.stock.counted'
  | 'commerce.production_material.issued'
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

export type ManagedCompanyBriefIntent =
  | 'attention'
  | 'shop_inventory'
  | 'plant_control'
  | 'website_readiness'
  | 'ecommerce_readiness'

export type ManagedCompanyBrief = {
  contract: 'supermega.managed_company_brief.v1'
  intent: ManagedCompanyBriefIntent
  sourceCount: number
  title: string
  summary: string
  facts: Array<{ label: string; value: string; detail: string }>
  nextAction: {
    product: 'shop' | 'plant' | 'website' | 'ecommerce'
    path: string
    label: string
  }
  boundary: string
  sourceVersions: Array<{
    surface: 'commerce' | 'production' | 'website'
    version: number
    updatedAt: string
    projectionDigest: string
  }>
  approvalSummary: { pending: number; approved: number; declined: number }
  ownerContext: ManagedContextBriefProjection | null
  operatingBaseline: OperatingBaseline
  operatingChange: OperatingBaselineChange
  briefDigest: string
  companyVersion: number
  retention: 'reproducible_not_persisted' | 'persisted_managed_audit'
  externalWritesPerformed: false
}

export type ManagedCompanyBriefRetention = {
  contract: 'supermega.managed_company_brief_retention.v1'
  status: 'retained' | 'already_retained'
  briefDigest: string
  internalWritePerformed: boolean
  externalWritesPerformed: false
  idempotentReplay: boolean
}

export type ManagedOwnerControlItem = {
  itemId: string
  intent: Exclude<ManagedCompanyBriefIntent, 'attention'>
  product: 'shop' | 'plant' | 'website' | 'ecommerce'
  priority: 'critical' | 'high' | 'routine'
  title: string
  summary: string
  facts: ManagedCompanyBrief['facts']
  nextAction: ManagedCompanyBrief['nextAction']
  status: 'pending' | 'acknowledged'
}

export type ManagedOwnerControlRun = {
  contract: 'supermega.managed_owner_control_run.v1'
  workspaceId: string
  sourceVersions: ManagedCompanyBrief['sourceVersions']
  operatingBaselineDigest: string
  items: ManagedOwnerControlItem[]
  runDigest: string
  sourceCount: number
  pendingCount: number
  acknowledgedCount: number
  primaryItemId: string | null
  title: string
  summary: string
  operatingBaseline: OperatingBaseline
  boundary: string
  companyVersion: number
  externalWritesPerformed: false
}

export type ManagedOwnerControlRetention = {
  contract: 'supermega.managed_owner_control_retention.v1'
  status: 'acknowledged' | 'already_acknowledged'
  runDigest: string
  itemId: string
  companyVersion: number
  internalWritePerformed: boolean
  externalWritesPerformed: false
  idempotentReplay: boolean
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

export const MANAGED_CLIENT_IMPORT_PREFLIGHT_CHECKS = [
  'trusted_managed_identity',
  'human_actor',
  'setup_write_capability',
  'product_write_capability',
  'package_digest_bound',
  'current_revision_bound',
  'atomic_adapter_ready',
] as const

export type ManagedClientImportApplyPreflight = {
  contract: 'supermega.client_import_apply_preflight.v1'
  status: 'ready_for_owner_confirmation'
  workspace_id: string
  actor_id: string
  product: ManagedClientImportPackage['product']
  object: string
  workflow_template_id: string
  target_surface: 'commerce' | 'production' | 'website'
  required_capability: 'commerce.write' | 'production.write' | 'website.write'
  package_digest: string
  row_count: number
  expected_version: number
  current_version: number
  preflight_digest: string
  confirmation: string
  checks: typeof MANAGED_CLIENT_IMPORT_PREFLIGHT_CHECKS
  external_writes_performed: false
  next_step: string
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

export type ManagedClientImportProvisioningPlan = {
  contract: 'supermega.client_import_provisioning_plan.v1'
  status: 'ready_for_owner_review' | 'blocked'
  product: ManagedClientImportPackage['product']
  target_surface: 'commerce' | 'production' | 'website'
  workspace_id: string
  package_digest: string
  row_count: number
  expected_version: number
  required_controls: readonly [
    'managed_identity_confirmed',
    'package_digest_bound',
    'zero_write_validation_receipt',
    'owner_import_approval',
    'atomic_adapter_receipt',
    'durable_revision_confirmation',
  ]
  forbidden_until_applied: readonly [
    'copy_browser_storage_to_production',
    'customer_message_send',
    'payment_capture',
    'domain_publish',
    'scheduler_autopilot',
  ]
  next_step: string
}

export type ManagedEcommerceOrderQueueValidation = {
  contract: 'supermega.ecommerce.order_queue_readiness_validation.v1'
  status: 'ready_for_owner_review' | 'blocked'
  workspace_id: string
  product: 'ecommerce'
  target_surface: 'commerce'
  required_capability: 'commerce.write'
  packet_schema: 'supermega.ecommerce.order_queue_readiness.v1'
  row_count: number
  ready_rows: number
  blocked_rows: number
  required_controls: string[]
  forbidden_until_applied: string[]
  human_approval_required: true
  external_writes_performed: false
  next_step: string
}

export type ManagedEcommerceOrderQueueImportPlan = {
  contract: 'supermega.ecommerce.shop_queue_import_plan.v1'
  status: 'ready_for_managed_apply' | 'blocked'
  workspace_id: string
  product: 'ecommerce'
  target_surface: 'commerce'
  target_adapter: 'shop_order_queue'
  required_capability: 'commerce.write'
  idempotency_key: string
  plan_digest: string
  store_name: string
  row_count: number
  ready_rows: number
  blocked_rows: number
  selected_skus: string[]
  required_controls: string[]
  required_approval_contract: 'supermega.ecommerce.order_queue_owner_approval.v1'
  external_writes_performed: false
  forbidden_until_applied: string[]
  apply_boundary: string
  next_step: string
}

export type ManagedEcommerceOrderQueueApplyPreflight = {
  contract: 'supermega.ecommerce.shop_queue_apply_preflight.v1'
  status: 'ready_for_idempotent_apply'
  workspace_id: string
  approval_id: string
  approved_by: string
  approved_at: string
  plan_digest: string
  idempotency_key: string
  required_capability: 'commerce.write'
  target_adapter: 'shop_order_queue'
  external_writes_performed: false
  apply_boundary: string
  next_step: string
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

function exactRecordKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort()
  const sorted = [...expected].sort()
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index])
}

const MANAGED_COMPANY_BRIEF_INTENTS = new Set<ManagedCompanyBriefIntent>([
  'attention',
  'shop_inventory',
  'plant_control',
  'website_readiness',
  'ecommerce_readiness',
])
const MANAGED_COMPANY_BRIEF_ROUTES = new Map([
  ['shop', new Set(['/shop/?tab=inventory', '/settings/?product=shop'])],
  ['plant', new Set(['/plant/?tab=production', '/settings/?product=plant'])],
  ['website', new Set(['/website/', '/settings/?product=website'])],
  ['ecommerce', new Set(['/ecommerce/', '/settings/?product=ecommerce'])],
] as const)
const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/

function boundedManagedBriefText(value: unknown, maximum: number) {
  return typeof value === 'string' && value === value.trim() && value.length > 0 && value.length <= maximum
}

function managedBriefCount(value: unknown, maximum = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maximum
}

function assertManagedCompanyBrief(value: unknown, expectedIdentity: ManagedIdentity): ManagedCompanyBrief {
  if (!isRecord(value)
    || !exactRecordKeys(value, ['brief', 'identity'])
    || !isRecord(value.brief)
    || !isRecord(value.identity)
    || !exactRecordKeys(value.identity, ['actor_id', 'actor_kind', 'workspace_id'])) {
    throw new ManagedTrialError('Managed Company Brief response is invalid.', { code: 'managed_company_brief_invalid' })
  }
  const brief = value.brief
  const responseIdentity = value.identity
  const nextAction = brief.nextAction
  const approvalSummary = brief.approvalSummary
  const sourceVersions = brief.sourceVersions
  const facts = brief.facts
  const validOwnerContext = brief.ownerContext === null
    || structurallyValidManagedContextBriefProjection(brief.ownerContext)
  const validOperatingBaseline = structurallyValidOperatingBaseline(brief.operatingBaseline, expectedIdentity.workspaceId)
  const validOperatingChange = validOperatingBaseline
    && structurallyValidOperatingBaselineChange(brief.operatingChange, brief.operatingBaseline as OperatingBaseline)
  const actionRoutes = isRecord(nextAction) && typeof nextAction.product === 'string'
    ? MANAGED_COMPANY_BRIEF_ROUTES.get(nextAction.product as 'shop' | 'plant' | 'website' | 'ecommerce')
    : undefined
  const validSources = Array.isArray(sourceVersions)
    && sourceVersions.length <= 3
    && new Set(sourceVersions.map((source) => isRecord(source) ? source.surface : '')).size === sourceVersions.length
    && sourceVersions.every((source) => isRecord(source)
      && exactRecordKeys(source, ['projectionDigest', 'surface', 'updatedAt', 'version'])
      && ['commerce', 'production', 'website'].includes(String(source.surface))
      && managedBriefCount(source.version)
      && typeof source.updatedAt === 'string'
      && source.updatedAt.length <= 64
      && typeof source.projectionDigest === 'string'
      && SHA256_DIGEST.test(source.projectionDigest))
  const validBaselineSources = validSources
    && validOperatingBaseline
    && sourceVersions.length === (brief.operatingBaseline as OperatingBaseline).sourceVersions.length
    && sourceVersions.every((source, index) => {
      if (!isRecord(source)) return false
      const baselineSource = (brief.operatingBaseline as OperatingBaseline).sourceVersions[index]
      return source.surface === baselineSource.surface
        && source.version === baselineSource.version
        && source.updatedAt === baselineSource.updatedAt
        && source.projectionDigest === baselineSource.projectionDigest
    })
  const validFacts = Array.isArray(facts)
    && facts.length === 4
    && facts.every((fact) => isRecord(fact)
      && exactRecordKeys(fact, ['detail', 'label', 'value'])
      && boundedManagedBriefText(fact.label, 80)
      && boundedManagedBriefText(fact.value, 120)
      && boundedManagedBriefText(fact.detail, 240))
  if (!exactRecordKeys(brief, [
      'approvalSummary', 'boundary', 'briefDigest', 'companyVersion', 'contract', 'externalWritesPerformed',
      'facts', 'intent', 'nextAction', 'operatingBaseline', 'operatingChange', 'ownerContext', 'retention',
      'sourceCount', 'sourceVersions', 'summary', 'title',
    ])
    || brief.contract !== 'supermega.managed_company_brief.v1'
    || !MANAGED_COMPANY_BRIEF_INTENTS.has(brief.intent as ManagedCompanyBriefIntent)
    || !managedBriefCount(brief.sourceCount, 4)
    || !boundedManagedBriefText(brief.title, 180)
    || !boundedManagedBriefText(brief.summary, 500)
    || !validFacts
    || !isRecord(nextAction)
    || !exactRecordKeys(nextAction, ['label', 'path', 'product'])
    || !actionRoutes?.has(String(nextAction.path) as never)
    || !boundedManagedBriefText(nextAction.label, 80)
    || !boundedManagedBriefText(brief.boundary, 600)
    || !validSources
    || !isRecord(approvalSummary)
    || !exactRecordKeys(approvalSummary, ['approved', 'declined', 'pending'])
    || !managedBriefCount(approvalSummary.pending)
    || !managedBriefCount(approvalSummary.approved)
    || !managedBriefCount(approvalSummary.declined)
    || !validOwnerContext
    || !validOperatingBaseline
    || !validOperatingChange
    || !validBaselineSources
    || typeof brief.briefDigest !== 'string'
    || !SHA256_DIGEST.test(brief.briefDigest)
    || !managedBriefCount(brief.companyVersion)
    || !['reproducible_not_persisted', 'persisted_managed_audit'].includes(String(brief.retention))
    || brief.externalWritesPerformed !== false
    || responseIdentity.workspace_id !== expectedIdentity.workspaceId
    || responseIdentity.actor_id !== expectedIdentity.userId
    || responseIdentity.actor_kind !== 'human') {
    throw new ManagedTrialError('Managed Company Brief failed its tenant and evidence checks.', { code: 'managed_company_brief_invalid' })
  }
  return brief as unknown as ManagedCompanyBrief
}

function expectedManagedOwnerControlRank(baseline: OperatingBaseline) {
  const ranked = ([
    ['shop_inventory', 'shop', 0],
    ['plant_control', 'plant', 1],
    ['website_readiness', 'website', 2],
    ['ecommerce_readiness', 'ecommerce', 3],
  ] as const)
    .filter(([, product]) => baseline.products[product].status !== 'missing'
      && !(product === 'ecommerce'
        && baseline.products.ecommerce.status === 'invalid'
        && baseline.products.shop.status === 'invalid'))
    .map(([intent, product, order]) => {
      const current = baseline.products[product]
      const level = current.status === 'invalid' ? (product === 'plant' ? 5 : 3) : current.attentionLevel
      return { intent, product, order, level, load: current.reviewLoad }
    })
    .sort((left, right) => right.level - left.level || right.load - left.load || left.order - right.order)
    .slice(0, 3)
  const selected = ranked.length ? ranked : [{ intent: 'shop_inventory' as const, product: 'shop' as const, order: 0, level: 0, load: 0 }]
  return selected.map((item) => ({
    ...item,
    priority: item.level >= 4 ? 'critical' : item.level >= 2 ? 'high' : 'routine',
  }))
}

export function assertManagedOwnerControlRun(value: unknown, expectedIdentity: ManagedIdentity): ManagedOwnerControlRun {
  if (!isRecord(value)
    || !exactRecordKeys(value, ['identity', 'run'])
    || !isRecord(value.identity)
    || !isRecord(value.run)
    || !exactRecordKeys(value.identity, ['actor_id', 'actor_kind', 'workspace_id'])) {
    throw new ManagedTrialError('Managed Owner Control response is invalid.', { code: 'managed_owner_control_invalid' })
  }
  const run = value.run
  const identity = value.identity
  const sourceVersions = run.sourceVersions
  const baseline = run.operatingBaseline
  const items = run.items
  const validBaseline = structurallyValidOperatingBaseline(baseline, expectedIdentity.workspaceId)
  const expectedRank = validBaseline ? expectedManagedOwnerControlRank(baseline as OperatingBaseline) : []
  const validSources = Array.isArray(sourceVersions)
    && sourceVersions.length <= 3
    && new Set(sourceVersions.map((source) => isRecord(source) ? source.surface : '')).size === sourceVersions.length
    && sourceVersions.every((source) => isRecord(source)
      && exactRecordKeys(source, ['projectionDigest', 'surface', 'updatedAt', 'version'])
      && ['commerce', 'production', 'website'].includes(String(source.surface))
      && managedBriefCount(source.version)
      && typeof source.updatedAt === 'string'
      && source.updatedAt.length <= 64
      && typeof source.projectionDigest === 'string'
      && SHA256_DIGEST.test(source.projectionDigest))
  const validBaselineSources = validBaseline
    && validSources
    && sourceVersions.length === (baseline as OperatingBaseline).sourceVersions.length
    && sourceVersions.every((source, index) => {
      if (!isRecord(source)) return false
      const expected = (baseline as OperatingBaseline).sourceVersions[index]
      return source.surface === expected.surface
        && source.version === expected.version
        && source.updatedAt === expected.updatedAt
        && source.projectionDigest === expected.projectionDigest
    })
  const validItems = Array.isArray(items)
    && items.length >= 1
    && items.length <= 3
    && new Set(items.map((item) => isRecord(item) ? item.itemId : '')).size === items.length
    && items.length === expectedRank.length
    && items.every((item, index) => {
      if (!isRecord(item)
        || !exactRecordKeys(item, ['facts', 'intent', 'itemId', 'nextAction', 'priority', 'product', 'status', 'summary', 'title'])
        || !MANAGED_COMPANY_BRIEF_INTENTS.has(item.intent as ManagedCompanyBriefIntent)
        || item.intent === 'attention'
        || !['shop', 'plant', 'website', 'ecommerce'].includes(String(item.product))
        || !['critical', 'high', 'routine'].includes(String(item.priority))
        || !['pending', 'acknowledged'].includes(String(item.status))
        || typeof item.itemId !== 'string'
        || !SHA256_DIGEST.test(item.itemId)
        || !boundedManagedBriefText(item.title, 180)
        || !boundedManagedBriefText(item.summary, 500)
        || !Array.isArray(item.facts)
        || item.facts.length !== 4
        || !item.facts.every((fact) => isRecord(fact)
          && exactRecordKeys(fact, ['detail', 'label', 'value'])
          && boundedManagedBriefText(fact.label, 80)
          && boundedManagedBriefText(fact.value, 120)
          && boundedManagedBriefText(fact.detail, 240))
        || !isRecord(item.nextAction)
        || !exactRecordKeys(item.nextAction, ['label', 'path', 'product'])
        || item.nextAction.product !== item.product
        || !boundedManagedBriefText(item.nextAction.label, 80)) return false
      const routes = MANAGED_COMPANY_BRIEF_ROUTES.get(item.product as ManagedOwnerControlItem['product'])
      const expectedProduct = {
        shop_inventory: 'shop',
        plant_control: 'plant',
        website_readiness: 'website',
        ecommerce_readiness: 'ecommerce',
      }[String(item.intent)]
      const expected = expectedRank[index]
      return item.product === expectedProduct
        && item.intent === expected?.intent
        && item.product === expected?.product
        && item.priority === expected?.priority
        && routes?.has(String(item.nextAction.path) as never)
    })
  const pendingItems = validItems
    ? (items as Array<Record<string, unknown>>).filter((item) => item.status === 'pending')
    : []
  const acknowledgedItems = validItems
    ? (items as Array<Record<string, unknown>>).filter((item) => item.status === 'acknowledged')
    : []
  const primaryItemId = pendingItems[0]?.itemId ?? null
  if (!exactRecordKeys(run, [
      'acknowledgedCount', 'boundary', 'companyVersion', 'contract', 'externalWritesPerformed',
      'items', 'operatingBaseline', 'operatingBaselineDigest', 'pendingCount', 'primaryItemId', 'runDigest',
      'sourceCount', 'sourceVersions', 'summary', 'title', 'workspaceId',
    ])
    || run.contract !== 'supermega.managed_owner_control_run.v1'
    || run.workspaceId !== expectedIdentity.workspaceId
    || !validSources
    || !validBaseline
    || !validBaselineSources
    || typeof run.operatingBaselineDigest !== 'string'
    || !SHA256_DIGEST.test(run.operatingBaselineDigest)
    || run.operatingBaselineDigest !== (baseline as OperatingBaseline).baselineDigest
    || !validItems
    || typeof run.runDigest !== 'string'
    || !SHA256_DIGEST.test(run.runDigest)
    || !managedBriefCount(run.sourceCount, 4)
    || run.sourceCount !== (baseline as OperatingBaseline).coverage.readyProducts
    || run.pendingCount !== pendingItems.length
    || run.acknowledgedCount !== acknowledgedItems.length
    || run.primaryItemId !== primaryItemId
    || !boundedManagedBriefText(run.title, 180)
    || !boundedManagedBriefText(run.summary, 500)
    || !boundedManagedBriefText(run.boundary, 600)
    || !managedBriefCount(run.companyVersion)
    || run.externalWritesPerformed !== false
    || identity.workspace_id !== expectedIdentity.workspaceId
    || identity.actor_id !== expectedIdentity.userId
    || identity.actor_kind !== 'human') {
    throw new ManagedTrialError('Managed Owner Control failed its tenant and evidence checks.', { code: 'managed_owner_control_invalid' })
  }
  return run as unknown as ManagedOwnerControlRun
}

function canonicalManagedJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalManagedJson(item)).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalManagedJson(value[key])}`).join(',')}}`
  }
  const serialized = JSON.stringify(value)
  if (serialized === undefined) throw new ManagedTrialError('Managed Owner Control digest input is invalid.', { code: 'managed_owner_control_digest_invalid' })
  return serialized
}

export async function assertManagedOwnerControlIntegrity(run: ManagedOwnerControlRun) {
  const baselineBasis: Record<string, unknown> = { ...run.operatingBaseline }
  delete baselineBasis.baselineDigest
  const expectedBaselineDigest = await sha256Text(canonicalManagedJson(baselineBasis))
  if (run.operatingBaseline.baselineDigest !== expectedBaselineDigest
    || run.operatingBaselineDigest !== expectedBaselineDigest) {
    throw new ManagedTrialError('Managed Owner Control baseline digest is invalid.', { code: 'managed_owner_control_digest_invalid' })
  }
  for (const item of run.items) {
    const expectedItemId = await sha256Text(canonicalManagedJson({
      action: item.nextAction,
      baselineDigest: run.operatingBaselineDigest,
      contract: 'supermega.managed_owner_control_item.v1',
      intent: item.intent,
    }))
    if (item.itemId !== expectedItemId) {
      throw new ManagedTrialError('Managed Owner Control item digest is invalid.', { code: 'managed_owner_control_digest_invalid' })
    }
  }
  const expectedRunDigest = await sha256Text(canonicalManagedJson({
    contract: run.contract,
    items: run.items.map((item) => ({
      facts: item.facts,
      intent: item.intent,
      itemId: item.itemId,
      nextAction: item.nextAction,
      priority: item.priority,
      product: item.product,
      summary: item.summary,
      title: item.title,
    })),
    operatingBaselineDigest: run.operatingBaselineDigest,
    sourceVersions: run.sourceVersions,
    workspaceId: run.workspaceId,
  }))
  if (run.runDigest !== expectedRunDigest) {
    throw new ManagedTrialError('Managed Owner Control run digest is invalid.', { code: 'managed_owner_control_digest_invalid' })
  }
  return run
}

function assertManagedOwnerControlRetention(
  value: unknown,
  expectedIdentity: ManagedIdentity,
  expectedRunDigest: string,
  expectedItemId: string,
) {
  if (!isRecord(value) || !isRecord(value.retention)) {
    throw new ManagedTrialError('Managed Owner Control acknowledgement is invalid.', { code: 'managed_owner_control_retention_invalid' })
  }
  const run = assertManagedOwnerControlRun({ identity: value.identity, run: value.run }, expectedIdentity)
  const retention = value.retention
  const wrote = retention.status === 'acknowledged'
    && retention.internalWritePerformed === true
    && retention.idempotentReplay === false
  const replay = retention.status === 'already_acknowledged'
    && retention.internalWritePerformed === false
    && retention.idempotentReplay === true
  const item = run.items.find((candidate) => candidate.itemId === expectedItemId)
  if (!exactRecordKeys(value, ['identity', 'retention', 'run'])
    || !exactRecordKeys(retention, [
      'companyVersion', 'contract', 'externalWritesPerformed', 'idempotentReplay', 'internalWritePerformed',
      'itemId', 'runDigest', 'status',
    ])
    || retention.contract !== 'supermega.managed_owner_control_retention.v1'
    || (!wrote && !replay)
    || retention.runDigest !== expectedRunDigest
    || retention.itemId !== expectedItemId
    || retention.companyVersion !== run.companyVersion
    || retention.externalWritesPerformed !== false
    || item?.status !== 'acknowledged') {
    throw new ManagedTrialError('Managed Owner Control acknowledgement failed verification.', { code: 'managed_owner_control_retention_invalid' })
  }
  return { run, retention: retention as unknown as ManagedOwnerControlRetention }
}

export async function assertManagedContextValidation(
  value: unknown,
  request: ManagedContextProfileRequest,
  expectedIdentity: ManagedIdentity,
) {
  if (!isRecord(value)
    || !isRecord(value.identity)
    || !isRecord(value.validation)
    || !structurallyValidManagedContextProfile(value.profile, request, expectedIdentity)) {
    throw new ManagedTrialError('The managed context validation response is invalid.', {
      code: 'managed_context_validation_invalid',
    })
  }
  const validation = value.validation
  const profile = value.profile
  const identity = value.identity
  const expectedProfileDigest = await sha256Text(JSON.stringify(managedContextProfileProjection(request, expectedIdentity)))
  if (profile.profileDigest !== expectedProfileDigest
    || validation.contract !== 'supermega.managed_context_profile_validation.v1'
    || validation.status !== 'ready_for_owner_confirmation'
    || validation.profileDigest !== expectedProfileDigest
    || !managedBriefCount(validation.companyVersion)
    || typeof validation.validationDigest !== 'string'
    || !SHA256_DIGEST.test(validation.validationDigest)
    || validation.internalWritePerformed !== false
    || validation.externalWritesPerformed !== false
    || identity.workspace_id !== expectedIdentity.workspaceId
    || identity.actor_id !== expectedIdentity.userId
    || identity.actor_kind !== 'human'
    || value.secretValuesExposed !== false) {
    throw new ManagedTrialError('Managed context validation failed its tenant and evidence checks.', {
      code: 'managed_context_validation_invalid',
    })
  }
  const expectedValidationDigest = await sha256Text(JSON.stringify(managedContextValidationProjection(
    expectedProfileDigest,
    Number(validation.companyVersion),
    expectedIdentity,
  )))
  if (validation.validationDigest !== expectedValidationDigest) {
    throw new ManagedTrialError('Managed context validation no longer matches the company revision.', {
      code: 'managed_context_validation_changed',
    })
  }
  return {
    profile: profile as ManagedContextProfile,
    validation: validation as unknown as ManagedContextValidation,
  }
}

export async function assertManagedContextRetention(
  value: unknown,
  request: ManagedContextProfileRequest,
  validation: ManagedContextValidation,
  expectedIdentity: ManagedIdentity,
) {
  if (!isRecord(value)
    || !isRecord(value.identity)
    || !isRecord(value.retention)
    || !isRecord(value.result)
    || !structurallyValidManagedContextProfile(value.profile, request, expectedIdentity)) {
    throw new ManagedTrialError('The managed context retention response is invalid.', {
      code: 'managed_context_retention_invalid',
    })
  }
  const profile = value.profile
  const retention = value.retention
  const identity = value.identity
  const expectedProfileDigest = await sha256Text(JSON.stringify(managedContextProfileProjection(request, expectedIdentity)))
  if (profile.profileDigest !== expectedProfileDigest
    || validation.profileDigest !== expectedProfileDigest
    || retention.contract !== 'supermega.managed_context_profile_retention.v1'
    || retention.status !== 'retained'
    || retention.profileDigest !== expectedProfileDigest
    || !managedBriefCount(retention.companyVersion, Number.MAX_SAFE_INTEGER)
    || retention.companyVersion !== Number(value.result.version)
    || retention.internalWritePerformed !== true
    || retention.externalWritesPerformed !== false
    || typeof retention.idempotentReplay !== 'boolean'
    || identity.workspace_id !== expectedIdentity.workspaceId
    || identity.actor_id !== expectedIdentity.userId
    || identity.actor_kind !== 'human'
    || value.secretValuesExposed !== false) {
    throw new ManagedTrialError('Managed context retention failed its tenant and evidence checks.', {
      code: 'managed_context_retention_invalid',
    })
  }
  return {
    profile: profile as ManagedContextProfile,
    retention: retention as unknown as ManagedContextRetention,
  }
}

function assertManagedCompanyBriefRetention(
  value: unknown,
  expectedIdentity: ManagedIdentity,
  expectedDigest: string,
) {
  if (!isRecord(value) || !isRecord(value.retention)) {
    throw new ManagedTrialError('Managed Company Brief retention response is invalid.', { code: 'managed_company_brief_retention_invalid' })
  }
  const retention = value.retention
  const brief = assertManagedCompanyBrief({ brief: value.brief, identity: value.identity }, expectedIdentity)
  const retainedWrite = retention.status === 'retained'
    && retention.internalWritePerformed === true
    && retention.idempotentReplay === false
  const alreadyRetained = retention.status === 'already_retained'
    && retention.internalWritePerformed === false
    && retention.idempotentReplay === true
  const validEnvelope = retainedWrite
    ? exactRecordKeys(value, ['brief', 'identity', 'result', 'retention'])
    : exactRecordKeys(value, ['brief', 'identity', 'retention'])
  if (!validEnvelope
    || retention.contract !== 'supermega.managed_company_brief_retention.v1'
    || (!retainedWrite && !alreadyRetained)
    || retention.briefDigest !== expectedDigest
    || retention.externalWritesPerformed !== false
    || typeof retention.idempotentReplay !== 'boolean'
    || brief.briefDigest !== expectedDigest
    || brief.retention !== 'persisted_managed_audit') {
    throw new ManagedTrialError('Managed Company Brief receipt failed verification.', { code: 'managed_company_brief_retention_invalid' })
  }
  return { brief, retention: retention as unknown as ManagedCompanyBriefRetention }
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

const ECOMMERCE_ORDER_QUEUE_REQUIRED_CONTROLS = [
  'managed_postgres_rls',
  'workspace_identity',
  'shop_catalog_match',
  'source_message_retention',
  'owner_queue_approval',
  'audit_log',
  'scheduler_proof',
] as const

const ECOMMERCE_ORDER_QUEUE_FORBIDDEN_UNTIL_APPLIED = [
  'order_import',
  'production_queue_write',
  'customer_message_send',
  'payment_capture',
  'wallet_debit',
  'delivery_booking',
  'stock_move',
  'refund_write',
  'shop_write',
  'managed_activation',
] as const

function sameManagedStringArray(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index])
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

export function buildManagedClientImportProvisioningPlan(
  stagingPackage: ManagedClientImportPackage,
  validation: ManagedClientImportValidation,
  expectedIdentity: ManagedIdentity,
  activationContext: ManagedClientImportActivationContext,
): ManagedClientImportProvisioningPlan {
  const expectedActivation = CLIENT_IMPORT_ACTIVATION[stagingPackage.product]
  const adapterReady = validation.activation.atomic_adapter_ready === true
  const identityReady = validation.workspace_id === expectedIdentity.workspaceId
  const digestReady = validation.package_digest.length === 71
    && validation.package_digest.startsWith('sha256:')
  const versionReady = stagingPackage.product === 'ecommerce'
    ? activationContext.expectedVersion >= 1 && Boolean(activationContext.priorState)
    : activationContext.expectedVersion === 0 && activationContext.priorState === undefined
  const ready = validation.status === 'valid'
    && identityReady
    && digestReady
    && adapterReady
    && versionReady
    && validation.activation.external_writes_performed === false
  return {
    contract: 'supermega.client_import_provisioning_plan.v1',
    status: ready ? 'ready_for_owner_review' : 'blocked',
    product: stagingPackage.product,
    target_surface: expectedActivation.target,
    workspace_id: expectedIdentity.workspaceId,
    package_digest: validation.package_digest,
    row_count: stagingPackage.rows.length,
    expected_version: activationContext.expectedVersion,
    required_controls: [
      'managed_identity_confirmed',
      'package_digest_bound',
      'zero_write_validation_receipt',
      'owner_import_approval',
      'atomic_adapter_receipt',
      'durable_revision_confirmation',
    ],
    forbidden_until_applied: [
      'copy_browser_storage_to_production',
      'customer_message_send',
      'payment_capture',
      'domain_publish',
      'scheduler_autopilot',
    ],
    next_step: ready
      ? 'Owner reviews the checked package, confirms approval, then SuperMega applies one idempotent managed revision.'
      : 'Resolve identity, digest, adapter, or version blockers before asking the owner to approve.',
  }
}

export function buildManagedEcommerceOrderQueueValidation(
  packet: EcommerceOrderQueueReadinessPacket,
  expectedIdentity: ManagedIdentity,
): ManagedEcommerceOrderQueueValidation {
  const rowCount = packet.sourceReview.totalRows
  const readyRows = packet.sourceReview.readyRows
  const blockedRows = packet.sourceReview.blockedRows
  const rowsReconcile = readyRows + blockedRows === rowCount
  const controlsMatch = sameManagedStringArray(packet.requiredControls, ECOMMERCE_ORDER_QUEUE_REQUIRED_CONTROLS)
  const forbiddenMatch = sameManagedStringArray(packet.forbiddenUntilReady, ECOMMERCE_ORDER_QUEUE_FORBIDDEN_UNTIL_APPLIED)
  const sourceReady = packet.readiness.status === 'ready_for_support'
    && blockedRows === 0
    && rowCount > 0
    && packet.sourceReview.selectedSkus.length > 0
    && packet.sourceReview.catalogSource !== 'unavailable'
  const ready = rowsReconcile && controlsMatch && forbiddenMatch && sourceReady
  return {
    contract: 'supermega.ecommerce.order_queue_readiness_validation.v1',
    status: ready ? 'ready_for_owner_review' : 'blocked',
    workspace_id: expectedIdentity.workspaceId,
    product: 'ecommerce',
    target_surface: 'commerce',
    required_capability: 'commerce.write',
    packet_schema: packet.schema,
    row_count: rowCount,
    ready_rows: readyRows,
    blocked_rows: blockedRows,
    required_controls: [...ECOMMERCE_ORDER_QUEUE_REQUIRED_CONTROLS],
    forbidden_until_applied: [...ECOMMERCE_ORDER_QUEUE_FORBIDDEN_UNTIL_APPLIED],
    human_approval_required: true,
    external_writes_performed: false,
    next_step: ready
      ? 'Owner reviews this zero-write receipt, then support may prepare one managed Shop queue import approval.'
      : 'Repair packet rows, controls, catalog source, or evidence before managed queue approval.',
  }
}

export function assertManagedEcommerceOrderQueueValidation(
  response: unknown,
  packet: EcommerceOrderQueueReadinessPacket,
  expectedIdentity: ManagedIdentity,
): ManagedEcommerceOrderQueueValidation {
  if (!isRecord(response) || !isRecord(response.validation)) {
    throw new ManagedTrialError('The managed workspace returned an invalid Ecommerce order queue validation.', {
      code: 'managed_ecommerce_order_queue_validation_invalid',
    })
  }
  if (response.identity_authority !== 'trusted_managed_identity') {
    throw new ManagedTrialError('The managed Ecommerce queue check was not bound to trusted workspace identity.', {
      code: 'managed_ecommerce_order_queue_identity_untrusted',
    })
  }
  const validation = response.validation as Record<string, unknown>
  const expected = buildManagedEcommerceOrderQueueValidation(packet, expectedIdentity)
  if (validation.contract !== expected.contract
    || validation.status !== expected.status
    || validation.workspace_id !== expected.workspace_id
    || validation.product !== expected.product
    || validation.target_surface !== expected.target_surface
    || validation.required_capability !== expected.required_capability
    || validation.packet_schema !== expected.packet_schema
    || validation.row_count !== expected.row_count
    || validation.ready_rows !== expected.ready_rows
    || validation.blocked_rows !== expected.blocked_rows
    || JSON.stringify(validation.required_controls) !== JSON.stringify(expected.required_controls)
    || JSON.stringify(validation.forbidden_until_applied) !== JSON.stringify(expected.forbidden_until_applied)
    || validation.human_approval_required !== true
    || validation.external_writes_performed !== false
    || validation.next_step !== expected.next_step) {
    throw new ManagedTrialError('The managed Ecommerce order queue validation does not match the packet.', {
      code: 'managed_ecommerce_order_queue_validation_invalid',
    })
  }
  return validation as unknown as ManagedEcommerceOrderQueueValidation
}

export function assertManagedEcommerceOrderQueueImportPlan(
  response: unknown,
  packet: EcommerceOrderQueueReadinessPacket,
  approvalPacket: Record<string, unknown>,
  expectedIdentity: ManagedIdentity,
): ManagedEcommerceOrderQueueImportPlan {
  if (!isRecord(response) || !isRecord(response.plan)) {
    throw new ManagedTrialError('The managed workspace returned an invalid Ecommerce import plan.', {
      code: 'managed_ecommerce_order_queue_import_plan_invalid',
    })
  }
  if (response.identity_authority !== 'trusted_managed_identity') {
    throw new ManagedTrialError('The managed Ecommerce import plan was not bound to trusted workspace identity.', {
      code: 'managed_ecommerce_order_queue_identity_untrusted',
    })
  }
  const plan = response.plan as Record<string, unknown>
  const validation = buildManagedEcommerceOrderQueueValidation(packet, expectedIdentity)
  const selectedSkus = Array.isArray(approvalPacket.selectedSkus) ? approvalPacket.selectedSkus : []
  const ready = validation.status === 'ready_for_owner_review' && validation.blocked_rows === 0
  if (plan.contract !== 'supermega.ecommerce.shop_queue_import_plan.v1'
    || plan.status !== (ready ? 'ready_for_managed_apply' : 'blocked')
    || plan.workspace_id !== expectedIdentity.workspaceId
    || plan.product !== 'ecommerce'
    || plan.target_surface !== 'commerce'
    || plan.target_adapter !== 'shop_order_queue'
    || plan.required_capability !== 'commerce.write'
    || typeof plan.idempotency_key !== 'string'
    || !plan.idempotency_key.startsWith('ecommerce-shop-queue:')
    || typeof plan.plan_digest !== 'string'
    || !plan.plan_digest.startsWith('sha256:')
    || plan.store_name !== packet.storeName
    || plan.row_count !== validation.row_count
    || plan.ready_rows !== validation.ready_rows
    || plan.blocked_rows !== validation.blocked_rows
    || JSON.stringify(plan.selected_skus) !== JSON.stringify(selectedSkus)
    || JSON.stringify(plan.required_controls) !== JSON.stringify([...ECOMMERCE_ORDER_QUEUE_REQUIRED_CONTROLS])
    || plan.required_approval_contract !== 'supermega.ecommerce.order_queue_owner_approval.v1'
    || plan.external_writes_performed !== false
    || JSON.stringify(plan.forbidden_until_applied) !== JSON.stringify([...ECOMMERCE_ORDER_QUEUE_FORBIDDEN_UNTIL_APPLIED])
    || typeof plan.apply_boundary !== 'string'
    || !plan.apply_boundary.includes('Apply requires a decided human approval record')
    || typeof plan.next_step !== 'string') {
    throw new ManagedTrialError('The managed Ecommerce import plan does not match the approved queue packet.', {
      code: 'managed_ecommerce_order_queue_import_plan_invalid',
    })
  }
  return plan as unknown as ManagedEcommerceOrderQueueImportPlan
}

export function assertManagedEcommerceOrderQueueApplyPreflight(
  response: unknown,
  plan: ManagedEcommerceOrderQueueImportPlan,
  approval: { approval_id: string; decided_by: string; decided_at: string },
  expectedIdentity: ManagedIdentity,
): ManagedEcommerceOrderQueueApplyPreflight {
  if (!isRecord(response) || !isRecord(response.preflight)) {
    throw new ManagedTrialError('The managed workspace returned an invalid Ecommerce apply preflight.', {
      code: 'managed_ecommerce_order_queue_apply_preflight_invalid',
    })
  }
  if (response.identity_authority !== 'trusted_managed_identity') {
    throw new ManagedTrialError('The managed Ecommerce apply preflight was not bound to trusted workspace identity.', {
      code: 'managed_ecommerce_order_queue_identity_untrusted',
    })
  }
  const preflight = response.preflight as Record<string, unknown>
  if (preflight.contract !== 'supermega.ecommerce.shop_queue_apply_preflight.v1'
    || preflight.status !== 'ready_for_idempotent_apply'
    || preflight.workspace_id !== expectedIdentity.workspaceId
    || preflight.approval_id !== approval.approval_id
    || preflight.approved_by !== approval.decided_by
    || preflight.approved_at !== approval.decided_at
    || preflight.plan_digest !== plan.plan_digest
    || preflight.idempotency_key !== plan.idempotency_key
    || preflight.required_capability !== 'commerce.write'
    || preflight.target_adapter !== 'shop_order_queue'
    || preflight.external_writes_performed !== false
    || typeof preflight.apply_boundary !== 'string'
    || !preflight.apply_boundary.includes('Preflight only')
    || typeof preflight.next_step !== 'string') {
    throw new ManagedTrialError('The managed Ecommerce apply preflight does not match the approved import plan.', {
      code: 'managed_ecommerce_order_queue_apply_preflight_invalid',
    })
  }
  return preflight as unknown as ManagedEcommerceOrderQueueApplyPreflight
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

export async function managedClientImportApplyPreflightDigest(input: {
  expectedVersion: number
  identity: ManagedIdentity
  validation: ManagedClientImportValidation
}) {
  const projection = [
    'supermega.client_import_apply_preflight.v1',
    1,
    input.identity.workspaceId,
    input.identity.userId,
    input.validation.product,
    input.validation.object,
    input.validation.workflow_template_id,
    input.validation.activation.target_surface,
    input.validation.activation.required_capability,
    input.validation.package_digest,
    input.validation.row_count,
    input.expectedVersion,
  ]
  return sha256Text(JSON.stringify(projection))
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

export async function assertManagedClientImportApplyPreflight(
  response: unknown,
  stagingPackage: ManagedClientImportPackage,
  validation: ManagedClientImportValidation,
  expectedIdentity: ManagedIdentity,
  expectedVersion: number,
): Promise<ManagedClientImportApplyPreflight> {
  if (!isRecord(response)
    || !isRecord(response.preflight)
    || response.identity_authority !== 'trusted_managed_identity'
    || response.external_writes_performed !== false
    || response.secret_values_exposed !== false) {
    throw new ManagedTrialError('The managed import preflight was not bound to trusted workspace authority.', {
      code: 'managed_client_import_apply_preflight_invalid',
    })
  }
  const preflight = response.preflight
  const expectedDigest = await managedClientImportApplyPreflightDigest({
    expectedVersion,
    identity: expectedIdentity,
    validation,
  })
  const checks = preflight.checks
  if (!hasExactKeys(preflight, [
    'actor_id',
    'checks',
    'confirmation',
    'contract',
    'current_version',
    'expected_version',
    'external_writes_performed',
    'next_step',
    'object',
    'package_digest',
    'preflight_digest',
    'product',
    'required_capability',
    'row_count',
    'status',
    'target_surface',
    'workflow_template_id',
    'workspace_id',
  ])
    || preflight.contract !== 'supermega.client_import_apply_preflight.v1'
    || preflight.status !== 'ready_for_owner_confirmation'
    || preflight.workspace_id !== expectedIdentity.workspaceId
    || preflight.actor_id !== expectedIdentity.userId
    || preflight.product !== stagingPackage.product
    || preflight.object !== stagingPackage.object
    || preflight.workflow_template_id !== stagingPackage.workflowTemplateId
    || preflight.target_surface !== validation.activation.target_surface
    || preflight.required_capability !== validation.activation.required_capability
    || preflight.package_digest !== validation.package_digest
    || preflight.row_count !== stagingPackage.rows.length
    || preflight.expected_version !== expectedVersion
    || preflight.current_version !== expectedVersion
    || preflight.preflight_digest !== expectedDigest
    || preflight.confirmation !== `APPLY ${validation.package_digest}`
    || !Array.isArray(checks)
    || checks.length !== MANAGED_CLIENT_IMPORT_PREFLIGHT_CHECKS.length
    || !MANAGED_CLIENT_IMPORT_PREFLIGHT_CHECKS.every((check, index) => checks[index] === check)
    || preflight.external_writes_performed !== false
    || typeof preflight.next_step !== 'string'
    || !preflight.next_step.includes('idempotent managed import')) {
    throw new ManagedTrialError('The managed import preflight does not match the reviewed package and workspace revision.', {
      code: 'managed_client_import_apply_preflight_invalid',
    })
  }
  return preflight as unknown as ManagedClientImportApplyPreflight
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

function plantImportDueAt(value: unknown) {
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
  const openingPlanKeys = ['confirmedAt', 'contract', 'jobIds', 'machineIds', 'packageDigest'] as const
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
) {
  const stateKeys = ['approvals', 'contentRevision', 'events', 'evidence', 'localPublishes', 'pages', 'revision', 'schema', 'selectedPageId', 'siteName', 'version'] as const
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
  if (acceptedConfiguration.revision !== expectedRevision
    || acceptedConfiguration.shopCatalogSnapshotRevision !== expectedCatalogRevision
    || acceptedConfiguration.shopCatalogDigest !== catalogDigest
    || acceptedConfiguration.storeName !== previousConfiguration.storeName
    || acceptedConfiguration.summary !== previousConfiguration.summary
    || JSON.stringify(acceptedConfiguration.selectedSkus) !== JSON.stringify(expectedSelectedSkus)
    || JSON.stringify(acceptedConfiguration.merchandising) !== JSON.stringify(expectedMerchandising)
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
  if (stagingPackage.product === 'website') return assertManagedWebsiteImportState(state, stagingPackage)
  if (stagingPackage.product === 'ecommerce' && context?.expectedIdentity && context.priorState) {
    return assertManagedEcommerceImportState(state, context.priorState, stagingPackage, context.expectedIdentity)
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
let pendingManagedAccountSetup: Promise<ManagedAccountSetup> | undefined

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

function forgetWorkspace() {
  try {
    window.localStorage.removeItem(WORKSPACE_STORAGE_KEY)
  } catch {
    // The server still checks every workspace request when storage is disabled.
  }
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

function parseWorkspaceDirectory(value: unknown): ManagedWorkspaceDirectoryEntry[] {
  if (!isRecord(value)
    || value.contract !== 'supermega.managed_workspace_directory.v1'
    || value.status !== 'ready'
    || value.external_writes_performed !== false
    || value.secret_values_exposed !== false
    || !Array.isArray(value.workspaces)
    || value.workspaces.length > 50) {
    throw new ManagedTrialError('The managed workspace directory returned an invalid response.', {
      code: 'workspace_directory_invalid',
    })
  }
  const workspaces = value.workspaces.map((entry) => {
    if (!isRecord(entry)
      || typeof entry.workspace_id !== 'string'
      || !WORKSPACE_ID.test(entry.workspace_id)
      || typeof entry.label !== 'string'
      || !entry.label.trim()
      || entry.label.length > 120
      || !['owner', 'operator', 'viewer'].includes(String(entry.access))) {
      throw new ManagedTrialError('The managed workspace directory returned an invalid company.', {
        code: 'workspace_directory_invalid',
      })
    }
    return {
      workspaceId: entry.workspace_id,
      label: entry.label.trim(),
      access: entry.access as ManagedWorkspaceDirectoryEntry['access'],
    }
  })
  if (new Set(workspaces.map((entry) => entry.workspaceId)).size !== workspaces.length) {
    throw new ManagedTrialError('The managed workspace directory returned duplicate companies.', {
      code: 'workspace_directory_invalid',
    })
  }
  return workspaces
}

function normalizeAuthEmail(value: string) {
  const email = value.trim().toLowerCase()
  if (!AUTH_EMAIL.test(email) || email.length > 160) {
    throw new ManagedTrialError('Enter a valid work email.', { code: 'auth_email_invalid' })
  }
  return email
}

function managedAccountRedirectUrl() {
  const origin = new URL(window.location.origin)
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
  if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && loopback)) {
    throw new ManagedTrialError('Password recovery requires a secure SuperMega address.', {
      code: 'auth_redirect_insecure',
    })
  }
  const redirect = new URL('/account/setup', origin)
  redirect.searchParams.set('mode', 'recovery')
  return redirect.toString()
}

function accountLinkError() {
  return new ManagedTrialError('This account link is invalid or expired. Request a new link.', {
    code: 'account_link_invalid',
  })
}

function exactAuthParameters(parameters: URLSearchParams, allowed: readonly string[]) {
  const keys = [...parameters.keys()]
  return keys.every((key, index) => allowed.includes(key) && keys.indexOf(key) === index)
}

function scrubManagedAccountCallback() {
  window.history.replaceState(window.history.state, '', '/account/setup')
}

function accountPurpose(...values: Array<string | null>): ManagedAccountSetup['purpose'] {
  const purposes = values.filter((value): value is string => Boolean(value))
  if (purposes.some((value) => value !== 'invite' && value !== 'recovery') || new Set(purposes).size > 1) {
    throw accountLinkError()
  }
  return (purposes[0] as ManagedAccountSetup['purpose'] | undefined) ?? 'account'
}

function validNamedUserSession(session: Session | null): session is Session {
  return Boolean(session && session.user.is_anonymous === false && session.user.id)
}

export async function requestManagedPasswordRecovery(email: string) {
  const supabase = await authClient()
  if (!supabase) {
    throw new ManagedTrialError('Managed password recovery is not configured in this app build.', {
      code: 'auth_not_configured',
    })
  }
  const { error } = await supabase.auth.resetPasswordForEmail(normalizeAuthEmail(email), {
    redirectTo: managedAccountRedirectUrl(),
  })
  if (error) {
    throw new ManagedTrialError('A recovery link could not be sent. Wait a moment and try again.', {
      status: error.status,
      code: 'password_recovery_failed',
    })
  }
}

async function initializeManagedAccountSetup(): Promise<ManagedAccountSetup> {
  const supabase = await authClient()
  if (!supabase) {
    throw new ManagedTrialError('Managed account setup is not configured in this app build.', {
      code: 'auth_not_configured',
    })
  }

  const rawQuery = window.location.search
  const rawFragment = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
  const hasCallback = Boolean(rawQuery || rawFragment)
  if (rawQuery.length > 4096 || rawFragment.length > 40000) {
    if (hasCallback) scrubManagedAccountCallback()
    throw accountLinkError()
  }
  const query = new URLSearchParams(rawQuery)
  const fragment = new URLSearchParams(rawFragment)
  const purpose = accountPurpose(query.get('mode'), fragment.get('type'))
  const queryAllowed = exactAuthParameters(query, ['code', 'mode', 'error', 'error_code', 'error_description'])
  const fragmentAllowed = exactAuthParameters(fragment, ['access_token', 'refresh_token', 'expires_at', 'expires_in', 'token_type', 'type', 'error', 'error_code', 'error_description'])
  const code = query.get('code') ?? ''
  const accessToken = fragment.get('access_token') ?? ''
  const refreshToken = fragment.get('refresh_token') ?? ''
  const tokenType = fragment.get('token_type')
  const expiresIn = fragment.get('expires_in')
  const expiresAt = fragment.get('expires_at')
  const providerError = query.has('error') || query.has('error_code') || query.has('error_description')
    || fragment.has('error') || fragment.has('error_code') || fragment.has('error_description')

  if (hasCallback) scrubManagedAccountCallback()
  if (!queryAllowed
    || !fragmentAllowed
    || providerError
    || (tokenType !== null && tokenType !== 'bearer')
    || (expiresIn !== null && !/^\d{1,10}$/.test(expiresIn))
    || (expiresAt !== null && !/^\d{1,12}$/.test(expiresAt))) throw accountLinkError()

  let session: Session
  if (code) {
    if (!AUTH_CODE.test(code) || accessToken || refreshToken) throw accountLinkError()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error || !validNamedUserSession(data.session)) throw accountLinkError()
    session = data.session
  } else if (accessToken || refreshToken) {
    if (!AUTH_TOKEN.test(accessToken) || !AUTH_TOKEN.test(refreshToken)) throw accountLinkError()
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    if (error || !validNamedUserSession(data.session)) throw accountLinkError()
    session = data.session
  } else {
    const { data, error } = await supabase.auth.getSession()
    if (error || !validNamedUserSession(data.session)) throw accountLinkError()
    session = data.session
  }

  forgetWorkspace()
  return { purpose, email: session.user.email ?? 'Named user' }
}

export function beginManagedAccountSetup(): Promise<ManagedAccountSetup> {
  if (pendingManagedAccountSetup) return pendingManagedAccountSetup
  const attempt = initializeManagedAccountSetup()
  pendingManagedAccountSetup = attempt
  const release = () => {
    if (pendingManagedAccountSetup === attempt) pendingManagedAccountSetup = undefined
  }
  void attempt.then(release, release)
  return attempt
}

async function discoverManagedWorkspaces(session: Session): Promise<ManagedWorkspaceSignIn> {
  const response = await fetch('/api/trial/v1/workspaces', {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${session.access_token}`,
    },
  })
  if (!response.ok) throw await parseError(response)
  const workspaces = parseWorkspaceDirectory(await response.json())
  if (!workspaces.length) {
    throw new ManagedTrialError('This account has no active SuperMega company. Ask the company owner to activate access.', {
      code: 'workspace_membership_missing',
    })
  }
  return {
    userId: session.user.id,
    email: session.user.email ?? 'Named user',
    workspaces,
  }
}

export async function discoverManagedWorkspacesForCurrentSession(): Promise<ManagedWorkspaceSignIn> {
  const supabase = await authClient()
  if (!supabase) {
    throw new ManagedTrialError('Managed sign-in is not configured in this app build.', { code: 'auth_not_configured' })
  }
  const { data, error } = await supabase.auth.getSession()
  if (error || !validNamedUserSession(data.session)) throw accountLinkError()
  try {
    return await discoverManagedWorkspaces(data.session)
  } catch (discoveryError) {
    await supabase.auth.signOut({ scope: 'local' })
    forgetWorkspace()
    throw discoveryError
  }
}

export async function completeManagedAccountPassword(password: string): Promise<ManagedWorkspaceSignIn> {
  if (password.length < 12 || password.length > 128 || !password.trim()) {
    throw new ManagedTrialError('Use a password with at least 12 characters.', {
      code: 'password_too_weak',
    })
  }
  const supabase = await authClient()
  if (!supabase) {
    throw new ManagedTrialError('Managed account setup is not configured in this app build.', {
      code: 'auth_not_configured',
    })
  }
  const { data, error } = await supabase.auth.updateUser({ password })
  if (error || data.user.is_anonymous !== false) {
    throw new ManagedTrialError('The password could not be saved. Request a new account link and try again.', {
      status: error?.status,
      code: 'password_update_failed',
    })
  }
  return discoverManagedWorkspacesForCurrentSession()
}

export async function signInAndDiscoverManagedWorkspaces(email: string, password: string): Promise<ManagedWorkspaceSignIn> {
  const supabase = await authClient()
  if (!supabase) {
    throw new ManagedTrialError('Managed sign-in is not configured in this app build.', { code: 'auth_not_configured' })
  }
  forgetWorkspace()
  const { data, error } = await supabase.auth.signInWithPassword({ email: normalizeAuthEmail(email), password })
  if (error || !data.session || data.user.is_anonymous !== false) {
    throw new ManagedTrialError('Sign-in failed. Check the account and password.', {
      status: error?.status,
      code: error?.code ?? 'sign_in_failed',
    })
  }
  try {
    return await discoverManagedWorkspaces(data.session)
  } catch (discoveryError) {
    await supabase.auth.signOut({ scope: 'local' })
    forgetWorkspace()
    throw discoveryError
  }
}

export async function completeManagedWorkspaceSignIn(
  signIn: ManagedWorkspaceSignIn,
  workspace: string,
): Promise<ManagedIdentity> {
  const workspaceId = normalizeWorkspaceId(workspace)
  if (!signIn.workspaces.some((entry) => entry.workspaceId === workspaceId)) {
    throw new ManagedTrialError('Choose one of the companies assigned to this account.', {
      code: 'workspace_membership_missing',
    })
  }
  const supabase = await authClient()
  const { data, error } = await supabase?.auth.getSession() ?? { data: { session: null }, error: null }
  if (error || !data.session || data.session.user.id !== signIn.userId || data.session.user.is_anonymous !== false) {
    throw new ManagedTrialError('The managed session changed. Sign in again.', {
      code: 'managed_identity_changed',
    })
  }
  rememberWorkspace(workspaceId)
  return identity(data.session, workspaceId)
}

export async function signInManagedTrial(email: string, password: string, workspace: string) {
  const signIn = await signInAndDiscoverManagedWorkspaces(email, password)
  return completeManagedWorkspaceSignIn(signIn, workspace)
}

export async function signOutManagedTrial() {
  const supabase = await authClient()
  if (supabase) await supabase.auth.signOut({ scope: 'local' })
  forgetWorkspace()
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

export async function preflightManagedClientImport(request: {
  expectedVersion: number
  identity: ManagedIdentity
  stagingPackage: ManagedClientImportPackage
  validation: ManagedClientImportValidation
}) {
  const body = serializeManagedClientImportPackage(request.stagingPackage)
  const submittedPackage = JSON.parse(body) as ManagedClientImportPackage
  const currentDigest = await sha256Text(body)
  if (request.validation.workspace_id !== request.identity.workspaceId
    || request.validation.package_digest !== currentDigest
    || request.validation.product !== submittedPackage.product) {
    throw new ManagedTrialError('The validated import changed before preflight.', {
      code: 'managed_client_import_package_changed',
    })
  }
  const response = await authorizedRequest<unknown>(
    '/api/trial/v1/imports/apply-preflight',
    {
      method: 'POST',
      body: JSON.stringify({
        expected_version: request.expectedVersion,
        package: submittedPackage,
      }),
    },
    true,
    request.identity,
  )
  return await assertManagedClientImportApplyPreflight(
    response,
    submittedPackage,
    request.validation,
    request.identity,
    request.expectedVersion,
  )
}

export async function validateManagedEcommerceOrderQueue(
  packet: EcommerceOrderQueueReadinessPacket,
  expectedIdentity: ManagedIdentity,
) {
  const response = await authorizedRequest<unknown>(
    '/api/trial/v1/ecommerce/order-queue/validate',
    {
      method: 'POST',
      body: JSON.stringify({
        workspace_id: expectedIdentity.workspaceId,
        packet,
      }),
    },
    true,
    expectedIdentity,
  )
  return assertManagedEcommerceOrderQueueValidation(response, packet, expectedIdentity)
}

export async function planManagedEcommerceOrderQueueImport(request: {
  approvalPacket: Record<string, unknown>
  identity: ManagedIdentity
  packet: EcommerceOrderQueueReadinessPacket
}) {
  const response = await authorizedRequest<unknown>(
    '/api/trial/v1/ecommerce/order-queue/import-plan',
    {
      method: 'POST',
      body: JSON.stringify({
        workspace_id: request.identity.workspaceId,
        packet: request.packet,
        approval_packet: request.approvalPacket,
      }),
    },
    true,
    request.identity,
  )
  return assertManagedEcommerceOrderQueueImportPlan(response, request.packet, request.approvalPacket, request.identity)
}

export async function preflightManagedEcommerceOrderQueueApply(request: {
  approval: { approval_id: string; decided_by: string; decided_at: string }
  identity: ManagedIdentity
  plan: ManagedEcommerceOrderQueueImportPlan
}) {
  const response = await authorizedRequest<unknown>(
    '/api/trial/v1/ecommerce/order-queue/apply-preflight',
    {
      method: 'POST',
      body: JSON.stringify({
        approval_id: request.approval.approval_id,
        plan: request.plan,
      }),
    },
    true,
    request.identity,
  )
  return assertManagedEcommerceOrderQueueApplyPreflight(response, request.plan, request.approval, request.identity)
}

export async function applyManagedClientImport(request: {
  commandId: string
  expectedVersion: number
  identity: ManagedIdentity
  preflight: ManagedClientImportApplyPreflight
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
  const expectedPreflightDigest = await managedClientImportApplyPreflightDigest({
    expectedVersion: request.expectedVersion,
    identity: request.identity,
    validation: request.validation,
  })
  if (!clientImportAtomicAdapter(submittedPackage.product)
    || !activationVersionIsValid
    || request.validation.product !== submittedPackage.product
    || request.validation.activation.atomic_adapter_ready !== true
    || request.validation.workspace_id !== request.identity.workspaceId
    || request.validation.package_digest !== currentDigest
    || request.preflight.contract !== 'supermega.client_import_apply_preflight.v1'
    || request.preflight.workspace_id !== request.identity.workspaceId
    || request.preflight.actor_id !== request.identity.userId
    || request.preflight.product !== submittedPackage.product
    || request.preflight.package_digest !== currentDigest
    || request.preflight.expected_version !== request.expectedVersion
    || request.preflight.current_version !== request.expectedVersion
    || request.preflight.preflight_digest !== expectedPreflightDigest
    || request.preflight.external_writes_performed !== false
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
        preflight_digest: request.preflight.preflight_digest,
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

export async function loadManagedCompanyBrief(
  intent: ManagedCompanyBriefIntent,
  expectedIdentity: ManagedIdentity,
) {
  const response = await authorizedRequest<unknown>(
    '/api/trial/v1/company-brief',
    { method: 'POST', body: JSON.stringify({ intent }) },
    true,
    expectedIdentity,
  )
  return assertManagedCompanyBrief(response, expectedIdentity)
}

export async function retainManagedCompanyBrief(request: {
  brief: ManagedCompanyBrief
  commandId: string
  identity: ManagedIdentity
}) {
  if (!CLIENT_IMPORT_COMMAND_ID.test(request.commandId)) {
    throw new ManagedTrialError('Managed Company Brief command ID is invalid.', { code: 'managed_company_brief_command_invalid' })
  }
  const response = await authorizedRequest<unknown>(
    '/api/trial/v1/company-brief/receipts',
    {
      method: 'POST',
      body: JSON.stringify({
        command_id: request.commandId,
        intent: request.brief.intent,
        brief_digest: request.brief.briefDigest,
        expected_company_version: request.brief.companyVersion,
      }),
    },
    true,
    request.identity,
  )
  return assertManagedCompanyBriefRetention(response, request.identity, request.brief.briefDigest)
}

export async function loadManagedOwnerControlRun(expectedIdentity: ManagedIdentity) {
  const response = await authorizedRequest<unknown>(
    '/api/trial/v1/owner-control',
    { method: 'GET' },
    true,
    expectedIdentity,
  )
  return assertManagedOwnerControlIntegrity(assertManagedOwnerControlRun(response, expectedIdentity))
}

export async function acknowledgeManagedOwnerControlItem(request: {
  run: ManagedOwnerControlRun
  itemId: string
  commandId: string
  identity: ManagedIdentity
}) {
  if (!CLIENT_IMPORT_COMMAND_ID.test(request.commandId)
    || !SHA256_DIGEST.test(request.itemId)
    || !request.run.items.some((item) => item.itemId === request.itemId && item.status === 'pending')) {
    throw new ManagedTrialError('Managed Owner Control acknowledgement request is invalid.', { code: 'managed_owner_control_command_invalid' })
  }
  const response = await authorizedRequest<unknown>(
    '/api/trial/v1/owner-control/acknowledgements',
    {
      method: 'POST',
      body: JSON.stringify({
        command_id: request.commandId,
        expected_company_version: request.run.companyVersion,
        run_digest: request.run.runDigest,
        item_id: request.itemId,
      }),
    },
    true,
    request.identity,
  )
  const validated = assertManagedOwnerControlRetention(response, request.identity, request.run.runDigest, request.itemId)
  await assertManagedOwnerControlIntegrity(validated.run)
  return validated
}

export async function validateManagedContextProfile(
  contextPackage: ManagedContextProfileRequest,
  identity: ManagedIdentity,
) {
  const response = await authorizedRequest<unknown>(
    '/api/trial/v1/managed-context/validate',
    { method: 'POST', body: JSON.stringify({ package: contextPackage }) },
    true,
    identity,
  )
  return assertManagedContextValidation(response, contextPackage, identity)
}

export async function retainManagedContextProfile(request: {
  commandId: string
  contextPackage: ManagedContextProfileRequest
  identity: ManagedIdentity
  validation: ManagedContextValidation
}) {
  if (!CLIENT_IMPORT_COMMAND_ID.test(request.commandId)) {
    throw new ManagedTrialError('Managed context command ID is invalid.', { code: 'managed_context_command_invalid' })
  }
  const response = await authorizedRequest<unknown>(
    '/api/trial/v1/managed-context/retain',
    {
      method: 'POST',
      body: JSON.stringify({
        command_id: request.commandId,
        expected_company_version: request.validation.companyVersion,
        profile_digest: request.validation.profileDigest,
        validation_digest: request.validation.validationDigest,
        package: request.contextPackage,
      }),
    },
    true,
    request.identity,
  )
  return assertManagedContextRetention(
    response,
    request.contextPackage,
    request.validation,
    request.identity,
  )
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
