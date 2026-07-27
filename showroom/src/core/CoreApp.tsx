import { lazy, Suspense, type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useOutletContext, useSearchParams } from 'react-router'

import siteManifest from '../../../site-manifest.json'
import './core-app.css'
import { WebsiteCommerceIntake } from '../products/WebsiteCommerceIntake'
import type { EcommerceShopDraft } from '../products/ecommerce/ecommerce-shop-handoff'
import {
  LEGACY_WEBSITE_STORAGE_KEY,
  WEBSITE_ECOMMERCE_HANDOFF_KEY,
  WEBSITE_STORAGE_KEY,
  readWebsiteEcommerceHandoff,
  type WebsiteOrderRecord,
} from '../products/product-handoff'
import {
  createManagedApproval,
  currentManagedIdentity,
  currentManagedWorkspace,
  decideManagedApproval,
  loadManagedBootstrap,
  ManagedTrialError,
  managedTrialAuthConfigured,
  requireManagedSurfaceState,
  saveManagedCommerceCommand,
  saveManagedProductionCommand,
  sameManagedIdentity,
  signInManagedTrial,
  signOutManagedTrial,
  type ManagedApprovalRecord,
  type ManagedCommerceEvent,
  type ManagedIdentity,
  type ManagedProductionEvent,
  type ManagedStateRecord,
} from './managed-trial'
import { LEGACY_TEAM_WORK_KEYS, TEAM_WORK_KEY, formatTime, teamDefinitions, useTeamWorkspace } from './team-work'
import {
  COMMERCE_KEY,
  LEGACY_COMMERCE_KEYS,
  advanceCommerceOrder,
  cancelCommercePurchaseOrder,
  cancelCommerceOrder,
  countCommerceStock,
  commerceDailyCloseCsv,
  commerceDailyCloseExport,
  commerceCloseExpectation,
  commerceOrderReturnExpectation,
  commerceOrderItemSummary,
  commerceOrderNeedsAction,
  commerceOrderHasReleasableReservation,
  commerceOrderPromiseUrgency,
  compareCommercePurchaseOrderAttention,
  commercePurchaseOrderArrivalUrgency,
  commercePurchaseOrderProgress,
  commercePurchaseOrders,
  commerceStorefrontRequestLines,
  commerceStorefrontRequests,
  commerceWorkspaceCanWrite,
  commerceWebsiteIntakes,
  convertCommerceWebsiteIntake,
  createCommerceCatalogBaseline,
  createCommercePurchaseOrder,
  createEmptyCommerce,
  loadCommerceWorkspace,
  mutateCommerceWorkspace,
  receiveCommercePurchaseOrder,
  reconcileCommercePayment,
  recordCommerceOrderReturn,
  registerCommerceItem,
  reserveCommerceOrder,
  saveCommerceClose,
  settleCommerceRefund,
  updateCommerceItem,
  validateCommerceState,
  type CommerceActionProof,
  type CommerceItem,
  type CommerceItemUpdate,
  type CommerceOrder,
  type CommerceOrderLine,
  type CommerceOrderStatus,
  type CommerceReturnDisposition,
  type CommerceState,
  type CommerceStockMovement,
  type CommerceWebsiteOrderInput,
} from './commerce-workspace'
import {
  CHANNEL_ORDER_MESSAGE_MAX,
  CHANNEL_ORDER_QUOTE_MAX,
  buildChannelOrderDraft,
  channelOrderChannels,
  channelOrderDraftIsReady,
  channelOrderFields,
  channelOrderPayments,
  type ChannelOrderAttributionInput,
  type ChannelOrderDraft,
  type ChannelOrderField,
} from './channel-order-intake'
import type { ClientSolutionId } from './client-onboarding'
import type {
  CommerceOrderDraft,
  CommerceOrderDraftInput,
  CommerceOrderDraftReadResult,
} from './commerce-order-draft'
import {
  LEGACY_PRODUCTION_KEYS,
  PRODUCTION_KEY,
  buildProductionShiftHandoff,
  closeProductionJob,
  compareProductionJobSchedule,
  completeProductionMaintenance,
  createEmptyProduction,
  endProductionDowntime,
  formatProductionShiftHandoff,
  loadProductionWorkspace,
  mutateProductionWorkspace,
  openProductionIssue,
  parseProductionMaterialQuantity,
  placeProductionQualityHold,
  productionDowntimeIntervals,
  productionIssueSeverities,
  productionJobPriorities,
  productionMaintenanceRecords,
  productionMaterialUnits,
  productionMachineStates,
  productionShiftOutput,
  productionStateCanonical,
  productionWorkspaceCanWrite,
  recordProductionOutput,
  recordProductionScrap,
  recordProductionMaterialConsumption,
  recordProductionMachineState,
  registerProductionJob,
  releaseProductionQualityHold,
  resolveProductionIssue,
  startProductionDowntime,
  startProductionMaintenance,
  updateProductionJobPlan,
  validateProductionState,
  type ProductionActionProof,
  type ProductionDowntimeInterval,
  type ProductionEvent,
  type ProductionIssue,
  type ProductionIssueSeverity,
  type ProductionJob,
  type ProductionJobPriority,
  type ProductionMaintenanceRecord,
  type ProductionMaterialUnit,
  type ProductionMachineState,
  type ProductionOutputKind,
  type ProductionShiftHandoff,
  type ProductionState,
} from './production-workspace'

const ClientDataOnboarding = lazy(() => import('./ClientDataOnboarding').then((module) => ({ default: module.ClientDataOnboarding })))
const ShopInventoryFoundation = lazy(() => import('./ShopInventoryFoundation').then((module) => ({ default: module.ShopInventoryFoundation })))
const PlantOrderFoundation = lazy(() => import('./PlantOrderFoundation').then((module) => ({ default: module.PlantOrderFoundation })))

type DecisionClaim = {
  id: string
  claimType: 'fact' | 'analysis'
  statement: string
  sourceReference: string
  capturedAt: string
  status: 'observed' | 'verified'
  uncertainty: 'low' | 'medium' | 'high'
  visibility: 'private' | 'public'
  digest?: string
}

type DecisionPacket = {
  contract: 'decision_packet.v1'
  subject: { kind: string; id: string; version: 1 }
  decision: string
  claims: DecisionClaim[]
  baseline: string
  target: string
  result: string
  acceptance: string
  artifactReference: string
}

type ManagedDecisionPacket = {
  contract: 'decision_packet.v1'
  subject: { kind: string; id: string; version: 1 }
  decision: string
  claims: Array<{
    id: string
    claim_type: DecisionClaim['claimType']
    statement: string
    source_reference: string
    captured_at: string
    status: DecisionClaim['status']
    uncertainty: DecisionClaim['uncertainty']
    visibility: DecisionClaim['visibility']
    digest?: string
  }>
  baseline: string
  target: string
  result: string
  acceptance: string
  artifact_reference: string
}

type Approval = {
  id: string
  commandId?: string
  createdAt: string
  title: string
  requestedBy: string
  requestedActorKind: 'human' | 'service' | 'agent' | 'unknown'
  packet: DecisionPacket
  packetFingerprint: string
  status: 'pending' | 'approved' | 'declined' | 'superseded'
  decidedAt?: string
  decidedBy?: string
  decidedActorKind?: 'human' | 'service' | 'agent' | 'unknown'
  decisionNote?: string
  managed?: boolean
}

type ActionDomain = 'commerce' | 'production'

type ActionKind =
  | 'order_create'
  | 'order_status'
  | 'order_cancel'
  | 'order_return'
  | 'payment_reconcile'
  | 'refund_settle'
  | 'catalog_item_create'
  | 'catalog_item_update'
  | 'inventory_receipt'
  | 'inventory_count'
  | 'purchase_order_create'
  | 'purchase_order_receive'
  | 'purchase_order_cancel'
  | 'daily_close'
  | 'production_job'
  | 'production_job_schedule'
  | 'production_job_close'
  | 'production_output'
  | 'production_scrap'
  | 'production_material'
  | 'issue_create'
  | 'issue_resolution'
  | 'quality_hold'
  | 'quality_release'
  | 'machine_state'
  | 'downtime_start'
  | 'downtime_end'
  | 'maintenance_start'
  | 'maintenance_complete'

type PurchaseOrderDraft =
  | { mode: 'create'; sku: string; supplier: string; expectedAt: string; quantity: string }
  | { mode: 'receive'; purchaseOrderId: string; quantity: string }

type StockCountDraft = {
  sku: string
  quantity: string
}

type CatalogItemEditDraft = {
  sku: string
  expectedPrice: number
  expectedReorderAt: number
  price: string
  reorderAt: string
}

type CommerceReturnDraft = {
  orderId: string
  sku: string
  quantity: string
  disposition: CommerceReturnDisposition
}

type AccountableAction = {
  id: string
  commandId: string
  capturedAt: string
  domain: ActionDomain
  kind: ActionKind
  subjectId: string
  summary: string
  actorKind: 'human'
  actor: string
  reason: string
  evidenceReference: string
  before: string
  after: string
}

type PendingAccountableAction = Omit<AccountableAction, 'capturedAt' | 'actorKind' | 'actor' | 'reason' | 'evidenceReference'> & {
  apply: (record: AccountableAction) => void | Promise<void>
  confirmation?: AccountableAction
  evidenceReferenceLocked?: boolean
  evidenceReferenceSuggestion?: string
}

type ActionDetails = Pick<AccountableAction, 'actor' | 'reason' | 'evidenceReference'>

class ShopReviewRequiredError extends Error {}
class PlantReviewRequiredError extends Error {}

type ProductId = 'commerce' | 'production'
type SetupProductId = ClientSolutionId

function productDisplayName(product: SetupProductId) {
  return productContracts[product].name
}

function setupProductPreviewPath(product: SetupProductId) {
  if (product === 'commerce') return '/shop/?tab=orders'
  if (product === 'production') return '/plant/?tab=production'
  if (product === 'website') return '/website/'
  return '/ecommerce/'
}

function productCanonicalPath(product: ProductId) {
  return product === 'commerce' ? '/shop/' : '/plant/'
}

type WorkflowTemplate = {
  id: string
  name: string
  outcome: string
  workflow: string[]
  entryPoints: string[]
  metric: string
}

type ProductContract = {
  id: SetupProductId
  slug: string
  name: string
  status: string
  headline: string
  templates: WorkflowTemplate[]
}

type SetupState = {
  product: SetupProductId
  templateId: string
  workspace: string
  owner: string
  entryPoint: string
  currentRecord: string
  baseline: string
  targetOutcome: string
  authorityBoundary: string
  acceptanceEvidence: string
  savedAt?: string
}

type RuntimeStatus = 'checking' | 'enterprise' | 'demo'

type RuntimeHealth = {
  status: RuntimeStatus
  serviceStatus: string
  operatingMode: string
  enterpriseDbReady: boolean
  securityReady: boolean
  writesReady: boolean
  coverageScore: number
  requirements: string[]
}

type CommerceTab = 'orders' | 'inventory'
type ProductionTab = 'production' | 'control'

const APPROVAL_KEY = 'supermega.approvals.v3'
const SETUP_KEY = 'supermega.setup.v3'
const ACTION_KEY = 'supermega.accountable.actions.v1'
const STOREFRONT_DRAFT_RESET_PREFIX = 'supermega.ecommerce.storefront_draft.v2.'
const LEGACY_STOREFRONT_DRAFT_RESET_PREFIX = 'supermega.ecommerce.storefront_draft.v1.'
const LEGACY_STOREFRONT_DRAFT_RESET_KEY = 'supermega.ecommerce.storefront_draft.v1'
const SHOP_ORDER_DRAFT_RESET_PREFIX = 'supermega.shop.order_draft.v1.'
const SHOP_ORDER_DRAFT_RESET_EPOCH_KEY = 'supermega.shop.order_draft_reset.v1'
const WEBSITE_RECOVERY_EXPORT_PREFIX = 'supermega.website.workspace.recovery.v1.'
const LEGACY_APPROVAL_KEYS = ['supermega.approvals.v2']
const LEGACY_SETUP_KEYS = ['supermega.setup.v2']

function collectLocalProductRecords(storage: Pick<Storage, 'getItem' | 'key' | 'length'>) {
  const exactKeys = new Set([
    WEBSITE_STORAGE_KEY,
    LEGACY_WEBSITE_STORAGE_KEY,
    WEBSITE_ECOMMERCE_HANDOFF_KEY,
    LEGACY_STOREFRONT_DRAFT_RESET_KEY,
  ])
  const records: Record<string, string> = {}
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (!key
        || (!exactKeys.has(key)
          && !key.startsWith(STOREFRONT_DRAFT_RESET_PREFIX)
          && !key.startsWith(LEGACY_STOREFRONT_DRAFT_RESET_PREFIX)
          && !key.startsWith(SHOP_ORDER_DRAFT_RESET_PREFIX)
          && !key.startsWith(WEBSITE_RECOVERY_EXPORT_PREFIX))) continue
      const value = storage.getItem(key)
      if (value !== null) records[key] = value
    }
  } catch {
    return {}
  }
  return records
}

function requireProductContract(id: SetupProductId): ProductContract {
  const product = siteManifest.customerProducts.find((candidate) => candidate.runtimeId === id)
  if (!product) throw new Error(`Missing ${id} product contract.`)
  return {
    id,
    slug: product.id,
    name: product.name,
    status: product.status,
    headline: product.headline,
    templates: product.templates,
  }
}

const productContracts: Record<SetupProductId, ProductContract> = {
  commerce: requireProductContract('commerce'),
  production: requireProductContract('production'),
  website: requireProductContract('website'),
  ecommerce: requireProductContract('ecommerce'),
}

function templatesFor(product: SetupProductId) {
  return productContracts[product].templates
}

function templateFor(product: SetupProductId, name: string) {
  const templates = templatesFor(product)
  const fallback = templates[0]
  if (!fallback) throw new Error(`Missing ${product} workflow templates.`)
  return templates.find((template) => template.id === name || template.name === name) ?? fallback
}

const seedCommerceTemplate = templateFor('commerce', '')

const seedSetup: SetupState = {
  product: 'commerce',
  templateId: seedCommerceTemplate.id,
  workspace: '',
  owner: '',
  entryPoint: seedCommerceTemplate.entryPoints[0] ?? '',
  currentRecord: '',
  baseline: '',
  targetOutcome: '',
  authorityBoundary: '',
  acceptanceEvidence: '',
}

const pilotRequiredFields = ['workspace', 'owner', 'entryPoint', 'currentRecord', 'baseline', 'targetOutcome', 'authorityBoundary', 'acceptanceEvidence'] as const

function normalizeSetup(value: SetupState) {
  const source = (value && typeof value === 'object' ? value : seedSetup) as Omit<Partial<SetupState>, 'product'> & { product?: string; template?: string }
  const product: SetupProductId = source.product === 'production' || source.product === 'plant'
    ? 'production'
    : source.product === 'website'
      ? 'website'
      : source.product === 'ecommerce'
        ? 'ecommerce'
        : 'commerce'
  const template = templateFor(product, String(source.templateId || source.template || ''))
  const sourceEntryPoint = String(source.entryPoint || '')
  const normalized: SetupState = {
    product,
    templateId: template.id,
    workspace: typeof source.workspace === 'string' ? source.workspace : '',
    owner: typeof source.owner === 'string' ? source.owner : '',
    entryPoint: template.entryPoints.includes(sourceEntryPoint) ? sourceEntryPoint : template.entryPoints[0] ?? '',
    currentRecord: typeof source.currentRecord === 'string' ? source.currentRecord : '',
    baseline: typeof source.baseline === 'string' ? source.baseline : '',
    targetOutcome: typeof source.targetOutcome === 'string' ? source.targetOutcome : '',
    authorityBoundary: typeof source.authorityBoundary === 'string' ? source.authorityBoundary : '',
    acceptanceEvidence: typeof source.acceptanceEvidence === 'string' ? source.acceptanceEvidence : '',
    ...(typeof source.savedAt === 'string' && source.savedAt ? { savedAt: source.savedAt } : {}),
  }
  return JSON.stringify(normalized) === JSON.stringify(value) ? value : normalized
}

function setupProductFromQuery(value: string | null): SetupProductId | null {
  if (!value) return null
  return Object.values(productContracts).find((product) => product.slug === value || product.id === value)?.id ?? null
}

function clientSetupPath(product: SetupProductId) {
  return `/settings/?product=${encodeURIComponent(productContracts[product].slug)}`
}

function pilotProgress(setup: SetupState) {
  const complete = pilotRequiredFields.filter((field) => setup[field].trim()).length
  return Math.round((complete / pilotRequiredFields.length) * 100)
}

function pilotReady(setup: SetupState) {
  return pilotProgress(setup) === 100 && Boolean(setup.savedAt)
}

const checkingRuntime: RuntimeHealth = {
  status: 'checking',
  serviceStatus: 'checking',
  operatingMode: 'checking',
  enterpriseDbReady: false,
  securityReady: false,
  writesReady: false,
  coverageScore: 0,
  requirements: [],
}

const navigation = [
  { to: '/', label: 'Home', end: true },
  { to: '/work/', label: 'HQ', end: false },
  { to: '/operations/', label: 'Products', end: false },
] as const

const commerceTabs: Array<{ id: CommerceTab; label: string }> = [
  { id: 'orders', label: 'Orders' },
  { id: 'inventory', label: 'Stock' },
]

const productionTabs: Array<{ id: ProductionTab; label: string }> = [
  { id: 'production', label: 'Jobs' },
  { id: 'control', label: 'Problems' },
]

const productionMachineStateLabels: Record<ProductionMachineState, string> = {
  running: 'Running',
  attention: 'Needs attention',
  stopped: 'Stopped',
}

const productionIssueSeverityLabels: Record<ProductionIssueSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

const productionIssueSeverityRank: Record<ProductionIssueSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

const productionJobPriorityLabels: Record<ProductionJobPriority, string> = {
  urgent: 'Urgent',
  normal: 'Normal',
  low: 'Low',
}

const wrappedIssueDetail = { overflow: 'visible', overflowWrap: 'anywhere', textOverflow: 'clip', whiteSpace: 'normal' } as const

function localDateTimeInputValue(value: Date) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function defaultIssueDueInput() {
  return localDateTimeInputValue(new Date(Date.now() + 4 * 60 * 60 * 1000))
}

function defaultOrderPromiseInput() {
  return localDateTimeInputValue(new Date(Date.now() + 2 * 60 * 60 * 1000))
}

function defaultPurchaseOrderExpectedInput() {
  return localDateTimeInputValue(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000))
}

function defaultJobDueInput() {
  return localDateTimeInputValue(new Date(Date.now() + 8 * 60 * 60 * 1000))
}

function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

function commerceOrderPromiseTime(order: CommerceOrder) {
  if (!order.promisedAt) return Number.POSITIVE_INFINITY
  const promisedAt = Date.parse(order.promisedAt)
  return Number.isNaN(promisedAt) ? Number.POSITIVE_INFINITY : promisedAt
}

function compareCommerceOrderPromise(left: CommerceOrder, right: CommerceOrder) {
  return commerceOrderPromiseTime(left) - commerceOrderPromiseTime(right)
    || Date.parse(left.createdAt) - Date.parse(right.createdAt)
}

function shiftReferencePlaceholder() {
  const businessDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Yangon' }).format(new Date())
  return `${businessDate} Day`
}

function formatIssueDue(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function uid(prefix: string) {
  return `${prefix}-${commandUuid()}`.toUpperCase()
}

function commandUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const value = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

function stableFingerprint(value: unknown) {
  const input = JSON.stringify(value)
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function decisionPacketFingerprint(packet: DecisionPacket) {
  return stableFingerprint({
    contract: packet.contract,
    subject: { kind: packet.subject.kind, version: packet.subject.version },
    decision: packet.decision,
    claims: packet.claims.map(({ claimType, statement, sourceReference, status, uncertainty, visibility, digest }) => ({ claimType, statement, sourceReference, status, uncertainty, visibility, digest })),
    baseline: packet.baseline,
    target: packet.target,
    result: packet.result,
    acceptance: packet.acceptance,
    artifactReference: packet.artifactReference,
  })
}

function toManagedDecisionPacket(packet: DecisionPacket): ManagedDecisionPacket {
  return {
    contract: packet.contract,
    subject: packet.subject,
    decision: packet.decision,
    claims: packet.claims.map((claim) => ({
      id: claim.id,
      claim_type: claim.claimType,
      statement: claim.statement,
      source_reference: claim.sourceReference,
      captured_at: claim.capturedAt,
      status: claim.status,
      uncertainty: claim.uncertainty,
      visibility: claim.visibility,
      ...(claim.digest ? { digest: claim.digest } : {}),
    })),
    baseline: packet.baseline,
    target: packet.target,
    result: packet.result,
    acceptance: packet.acceptance,
    artifact_reference: packet.artifactReference,
  }
}

function toManagedApprovalRequest(approval: Approval) {
  if (approval.status !== 'pending' || !approval.commandId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(approval.commandId)) return null
  return {
    command_id: approval.commandId,
    title: approval.title,
    proposal: toManagedDecisionPacket(approval.packet),
    evidence_refs: [...new Set(approval.packet.claims.map((claim) => claim.sourceReference))],
  }
}

function fromManagedApproval(record: ManagedApprovalRecord): Approval {
  const managedPacket = record.proposal as unknown as ManagedDecisionPacket
  if (
    managedPacket.contract !== 'decision_packet.v1'
    || !managedPacket.subject
    || !Array.isArray(managedPacket.claims)
  ) {
    throw new Error('managed_approval_contract_invalid')
  }
  const packet: DecisionPacket = {
    contract: 'decision_packet.v1',
    subject: managedPacket.subject,
    decision: managedPacket.decision,
    claims: managedPacket.claims.map((claim) => ({
      id: claim.id,
      claimType: claim.claim_type,
      statement: claim.statement,
      sourceReference: claim.source_reference,
      capturedAt: claim.captured_at,
      status: claim.status,
      uncertainty: claim.uncertainty,
      visibility: claim.visibility,
      digest: claim.digest,
    })),
    baseline: managedPacket.baseline,
    target: managedPacket.target,
    result: managedPacket.result,
    acceptance: managedPacket.acceptance,
    artifactReference: managedPacket.artifact_reference,
  }
  return {
    id: record.approval_id,
    commandId: record.command_id,
    createdAt: record.requested_at,
    title: record.title,
    requestedBy: record.requested_by,
    requestedActorKind: record.requested_actor_kind,
    packet,
    packetFingerprint: decisionPacketFingerprint(packet),
    status: record.status,
    decidedAt: record.decided_at || undefined,
    decidedBy: record.decided_by || undefined,
    decidedActorKind: record.decided_actor_kind === 'human' || record.decided_actor_kind === 'service' || record.decided_actor_kind === 'agent' ? record.decided_actor_kind : undefined,
    decisionNote: record.decision_note || undefined,
    managed: true,
  }
}

function mergeManagedApprovals(current: Approval[], records: ManagedApprovalRecord[]) {
  const managed = records.map(fromManagedApproval)
  const managedIds = new Set(managed.map((approval) => approval.id))
  return [...managed, ...current.filter((approval) => !approval.managed && !managedIds.has(approval.id))]
}

function normalizeApprovals(value: Approval[]) {
  if (!Array.isArray(value)) return []

  const approvals = value.map((approval) => {
    const candidate = approval as unknown as Record<string, unknown>
    const packetCandidate = candidate.packet && typeof candidate.packet === 'object' ? candidate.packet as Record<string, unknown> : {}
    const subjectCandidate = packetCandidate.subject && typeof packetCandidate.subject === 'object' ? packetCandidate.subject as Record<string, unknown> : {}
    const createdAt = typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString()
    const approvalId = String(candidate.id || 'APR-LEGACY')
    const title = String(candidate.title || 'Review the proposed company action.')
    const legacyEvidence = Array.isArray(candidate.evidence) ? candidate.evidence : []
    const legacyContext = Array.isArray(packetCandidate.context) ? packetCandidate.context.map(String) : []
    const claimCandidates = Array.isArray(packetCandidate.claims) ? packetCandidate.claims : []
    const claims: DecisionClaim[] = (claimCandidates.length ? claimCandidates : legacyContext.length ? legacyContext : legacyEvidence.length ? legacyEvidence : [title]).slice(0, 20).map((item, index) => {
      const claim = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      const legacySource = legacyEvidence[index]
      const legacySourceRecord = legacySource && typeof legacySource === 'object' ? legacySource as Record<string, unknown> : {}
      const legacyLabel = typeof legacySource === 'string' ? legacySource : String(legacySourceRecord.label || '')
      const statement = typeof item === 'string' ? item : String(claim.statement || legacyLabel || `Decision evidence ${index + 1}`)
      const sourceReference = String(claim.sourceReference || legacySourceRecord.reference || `local://legacy-approval/${approvalId}/${index + 1}`)
      const digest = String(claim.digest || '').trim()
      const isVerified = (claim.status === 'verified' || legacySourceRecord.status === 'verified') && /^sha256:[0-9a-f]{64}$/.test(digest)
      return {
        id: String(claim.id || `${approvalId}-CLM-${index + 1}`),
        claimType: claim.claimType === 'analysis' ? 'analysis' as const : 'fact' as const,
        statement,
        sourceReference,
        capturedAt: String(claim.capturedAt || legacySourceRecord.capturedAt || createdAt),
        status: isVerified ? 'verified' as const : 'observed' as const,
        uncertainty: claim.uncertainty === 'high' ? 'high' as const : claim.uncertainty === 'medium' ? 'medium' as const : 'low' as const,
        visibility: claim.visibility === 'public' ? 'public' as const : 'private' as const,
        digest: digest || undefined,
      }
    })
    const packet: DecisionPacket = {
      contract: 'decision_packet.v1',
      subject: {
        kind: String(subjectCandidate.kind || 'company_brief'),
        id: String(subjectCandidate.id || approvalId),
        version: 1,
      },
      decision: String(packetCandidate.decision || title),
      claims,
      baseline: String(packetCandidate.baseline || 'Not recorded'),
      target: String(packetCandidate.target || 'Not recorded'),
      result: String(packetCandidate.result || 'No measured result recorded.'),
      acceptance: String(packetCandidate.acceptance || 'Not recorded'),
      artifactReference: String(packetCandidate.artifactReference || 'local://exports/supermega-trial-evidence'),
    }
    const requestedActorKind: Approval['requestedActorKind'] = candidate.requestedActorKind === 'human' || candidate.requestedActorKind === 'service' || candidate.requestedActorKind === 'agent' ? candidate.requestedActorKind : 'unknown'
    const decidedActorKind: Approval['decidedActorKind'] = candidate.decidedActorKind === 'human' || candidate.decidedActorKind === 'service' || candidate.decidedActorKind === 'agent' ? candidate.decidedActorKind : 'unknown'
    const decidedBy = typeof candidate.decidedBy === 'string' ? candidate.decidedBy.trim() : ''
    const decisionNote = typeof candidate.decisionNote === 'string' ? candidate.decisionNote.trim() : ''
    const isAttributedHumanDecision = decidedActorKind === 'human' && Boolean(decidedBy) && Boolean(decisionNote)
    const requestedStatus = candidate.status === 'approved' || candidate.status === 'declined' || candidate.status === 'superseded' ? candidate.status : 'pending'
    const status: Approval['status'] = requestedStatus === 'approved' || requestedStatus === 'declined'
      ? isAttributedHumanDecision ? requestedStatus : 'pending'
      : requestedStatus

    return {
      id: approvalId,
      commandId: typeof candidate.commandId === 'string' ? candidate.commandId : undefined,
      createdAt,
      title,
      requestedBy: String(candidate.requestedBy || 'Local workspace operator'),
      requestedActorKind,
      packet,
      packetFingerprint: typeof candidate.packetFingerprint === 'string' ? candidate.packetFingerprint : decisionPacketFingerprint(packet),
      status,
      decidedAt: typeof candidate.decidedAt === 'string' ? candidate.decidedAt : undefined,
      decidedBy: decidedBy || undefined,
      decidedActorKind,
      decisionNote: decisionNote || undefined,
      managed: candidate.managed === true,
    }
  })

  return JSON.stringify(approvals) === JSON.stringify(value) ? value : approvals
}

function localApprovalsOnly(approvals: Approval[]) {
  return approvals.some((approval) => approval.managed) ? approvals.filter((approval) => !approval.managed) : approvals
}

function normalizeActions(value: AccountableAction[]) {
  if (!Array.isArray(value)) return []
  return value.filter((action) => action && typeof action.id === 'string' && action.actorKind === 'human').slice(0, 200)
}

function confirmAccountableAction(action: PendingAccountableAction, details: ActionDetails): AccountableAction {
  if (action.confirmation) return action.confirmation
  return {
    id: action.id,
    commandId: action.commandId,
    capturedAt: new Date().toISOString(),
    domain: action.domain,
    kind: action.kind,
    subjectId: action.subjectId,
    summary: action.summary,
    actorKind: 'human',
    actor: details.actor,
    reason: details.reason,
    evidenceReference: details.evidenceReference,
    before: action.before,
    after: action.after,
  }
}

function commerceActionProof(action: AccountableAction): CommerceActionProof {
  return {
    actionId: action.id,
    capturedAt: action.capturedAt,
    actor: action.actor,
    reason: action.reason,
    evidenceReference: action.evidenceReference,
  }
}

function productionActionProof(action: AccountableAction): ProductionActionProof {
  return {
    actionId: action.id,
    capturedAt: action.capturedAt,
    actor: action.actor,
    reason: action.reason,
    evidenceReference: action.evidenceReference,
  }
}

function useStoredState<T>(key: string, seed: T, normalize?: (value: T) => T, legacyKeys: string[] = [], persist?: (value: T) => T) {
  const [state, setState] = useState<T>(() => {
    for (const storageKey of [key, ...legacyKeys]) {
      try {
        const stored = window.localStorage.getItem(storageKey)
        if (!stored) continue
        const value = JSON.parse(stored) as T
        return normalize ? normalize(value) : value
      } catch {
        // Continue to a valid legacy record before falling back to the seed.
      }
    }
    return seed
  })
  const normalizedState = normalize ? normalize(state) : state

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(persist ? persist(normalizedState) : normalizedState))
    } catch {
      // The workspace remains usable in memory when browser storage is unavailable.
    }
  }, [key, normalizedState, persist])

  return [normalizedState, setState] as const
}

type CommerceWorkspaceMode = 'local' | 'managed-loading' | 'managed-ready' | 'managed-unprovisioned' | 'managed-error'

type CommerceWorkspaceView = {
  state: CommerceState
  mode: CommerceWorkspaceMode
  workspaceId: string
  version: number | null
  error: string
  writeReady: boolean
}

function managedCommerceView(record: ManagedStateRecord, workspaceId: string): CommerceWorkspaceView {
  if (record.surface !== 'commerce' || !Number.isSafeInteger(record.version) || record.version < 0) throw new Error('Managed Shop returned an invalid state envelope.')
  if (record.version === 0) {
    if (Object.keys(record.state).length) throw new Error('Managed Shop has state without a valid revision.')
    return { state: createEmptyCommerce(), mode: 'managed-unprovisioned', workspaceId, version: 0, error: 'This managed workspace has no Shop catalog yet.', writeReady: false }
  }
  return { state: validateCommerceState(record.state), mode: 'managed-ready', workspaceId, version: record.version, error: '', writeReady: true }
}

function useCommerceWorkspace(managedIdentity: ManagedIdentity | null = null) {
  const [localSnapshot, setLocalSnapshot] = useState<CommerceWorkspaceView>(() => {
    const local = loadCommerceWorkspace()
    return { state: local.state, mode: 'local', workspaceId: '', version: null, error: local.error, writeReady: !local.error && commerceWorkspaceCanWrite() }
  })
  const [managedSnapshot, setManagedSnapshot] = useState<CommerceWorkspaceView>(() => ({
    state: createEmptyCommerce(), mode: 'managed-loading', workspaceId: '', version: null, error: '', writeReady: false,
  }))
  const snapshotRef = useRef(localSnapshot)
  const identityRef = useRef(managedIdentity)

  useEffect(() => {
    identityRef.current = managedIdentity
    snapshotRef.current = managedIdentity ? managedSnapshot : localSnapshot
  }, [localSnapshot, managedIdentity, managedSnapshot])

  useEffect(() => {
    if (!managedIdentity) return undefined

    let active = true
    loadManagedBootstrap(managedIdentity)
      .then((bootstrap) => {
        if (!active || !identityRef.current || !sameManagedIdentity(identityRef.current, managedIdentity)) return
        const record = requireManagedSurfaceState(bootstrap, 'commerce', 'Shop')
        const next = managedCommerceView(record, managedIdentity.workspaceId)
        snapshotRef.current = next
        setManagedSnapshot(next)
      })
      .catch((error) => {
        if (!active || !identityRef.current || !sameManagedIdentity(identityRef.current, managedIdentity)) return
        const next = { state: createEmptyCommerce(), mode: 'managed-error' as const, workspaceId: managedIdentity.workspaceId, version: null, error: error instanceof Error ? error.message : 'Managed Shop could not be loaded.', writeReady: false }
        snapshotRef.current = next
        setManagedSnapshot(next)
      })
    return () => { active = false }
  }, [managedIdentity])

  async function mutate(
    eventType: ManagedCommerceEvent,
    commandId: string,
    evidence: CommerceActionProof,
    transition: (state: CommerceState) => CommerceState | null,
  ) {
    if (!managedIdentity) {
      if (eventType === 'commerce.workspace.initialized') throw new Error('Browser demo Shop is already initialized.')
      const result = await mutateCommerceWorkspace(transition)
      if (!result.ok) {
        if (result.error === 'The Commerce state changed or the requested transition is not valid. Nothing was written.') {
          const latest = loadCommerceWorkspace()
          const refreshed = { state: latest.state, mode: 'local' as const, workspaceId: '', version: null, error: latest.error, writeReady: !latest.error && commerceWorkspaceCanWrite() }
          snapshotRef.current = refreshed
          setLocalSnapshot(refreshed)
          throw new ShopReviewRequiredError(latest.error
            ? `Shop changed before this action was applied. Nothing was written; reload to recover the current record. ${latest.error}`
            : 'Shop changed before this action was applied. Nothing was written; the latest record is loaded for fresh review.')
        }
        const rejected = { ...snapshotRef.current, error: result.error }
        snapshotRef.current = rejected
        setLocalSnapshot(rejected)
        throw new Error(result.error)
      }
      const accepted = { state: result.state, mode: 'local' as const, workspaceId: '', version: null, error: '', writeReady: true }
      snapshotRef.current = accepted
      setLocalSnapshot(accepted)
      return
    }

    const workspaceId = managedIdentity.workspaceId
    const current = snapshotRef.current
    const initializing = eventType === 'commerce.workspace.initialized'
    const modeReady = initializing ? current.mode === 'managed-unprovisioned' && current.version === 0 : current.mode === 'managed-ready' && current.version !== null
    if (!modeReady || current.workspaceId !== workspaceId || current.version === null) {
      throw new Error(current.error || 'Managed Shop is not ready for writes.')
    }
    const next = transition(current.state)
    if (!next) throw new Error('The Shop state changed or this lifecycle step is no longer valid. Nothing was written.')
    if (next === current.state) return
    const candidate = validateCommerceState(next)

    try {
      const result = await saveManagedCommerceCommand({
        commandId,
        evidence,
        eventType,
        expectedVersion: current.version,
        state: candidate as unknown as Record<string, unknown>,
      })
      if (!identityRef.current || !sameManagedIdentity(identityRef.current, managedIdentity)) throw new Error('The managed workspace changed before the write was confirmed.')
      if (result.surface !== 'commerce' || result.event_type !== eventType || result.version !== current.version + 1) {
        throw new Error('Managed Shop returned an invalid command result.')
      }
      const accepted = validateCommerceState(result.state)
      let nextSnapshot: CommerceWorkspaceView = { state: accepted, mode: 'managed-ready', workspaceId, version: result.version, error: '', writeReady: true }
      if (result.idempotent_replay) {
        const bootstrap = await loadManagedBootstrap(managedIdentity)
        if (!identityRef.current || !sameManagedIdentity(identityRef.current, managedIdentity)) throw new Error('The managed workspace changed before the replay could be reconciled.')
        const refreshed = managedCommerceView(
          requireManagedSurfaceState(bootstrap, 'commerce', 'Shop'),
          workspaceId,
        )
        if (refreshed.mode !== 'managed-ready' || refreshed.version === null || refreshed.version < result.version) {
          throw new Error('Managed Shop could not reconcile the committed command with current state.')
        }
        nextSnapshot = { ...refreshed, error: '' }
      }
      snapshotRef.current = nextSnapshot
      setManagedSnapshot(nextSnapshot)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The managed Shop write was not confirmed.'
      if (error instanceof ManagedTrialError && error.code === 'trial_version_conflict') {
        try {
          const bootstrap = await loadManagedBootstrap(managedIdentity)
          if (!identityRef.current || !sameManagedIdentity(identityRef.current, managedIdentity)) throw new Error('The managed workspace changed before Shop could refresh.', { cause: error })
          const refreshed = managedCommerceView(
            requireManagedSurfaceState(bootstrap, 'commerce', 'Shop'),
            workspaceId,
          )
          const conflict = { ...refreshed, error: '' }
          snapshotRef.current = conflict
          setManagedSnapshot(conflict)
        } catch (refreshError) {
          const refreshMessage = refreshError instanceof Error ? refreshError.message : 'Shop changed and the latest revision could not be loaded.'
          const rejected = { ...snapshotRef.current, error: refreshMessage }
          snapshotRef.current = rejected
          setManagedSnapshot(rejected)
          throw refreshError
        }
        throw new ShopReviewRequiredError('Shop changed in another session. The latest revision is loaded; review and confirm the action again.')
      }
      if (identityRef.current && sameManagedIdentity(identityRef.current, managedIdentity)) {
        const rejected = { ...snapshotRef.current, error: message }
        snapshotRef.current = rejected
        setManagedSnapshot(rejected)
      }
      throw error
    }
  }

  const visible = managedIdentity ? managedSnapshot : localSnapshot
  const canWrite = managedIdentity
    ? visible.mode === 'managed-ready' && visible.version !== null && !visible.error
    : visible.mode === 'local' && !visible.error && visible.writeReady
  return [visible.state, mutate, visible.error, visible.mode, visible.version, visible.workspaceId, canWrite] as const
}

type ProductionWorkspaceMode = 'local' | 'managed-loading' | 'managed-ready' | 'managed-unprovisioned' | 'managed-error'

type ProductionWorkspaceView = {
  state: ProductionState
  mode: ProductionWorkspaceMode
  workspaceId: string
  version: number | null
  error: string
  writeReady: boolean
}

function managedProductionView(record: ManagedStateRecord, workspaceId: string): ProductionWorkspaceView {
  if (record.surface !== 'production' || !Number.isSafeInteger(record.version) || record.version < 0) throw new Error('Managed Plant returned an invalid state envelope.')
  if (record.version === 0) {
    if (Object.keys(record.state).length) throw new Error('Managed Plant has state without a valid revision.')
    return { state: createEmptyProduction(), mode: 'managed-unprovisioned', workspaceId, version: 0, error: 'This managed workspace has no Plant plan yet.', writeReady: false }
  }
  return { state: validateProductionState(record.state), mode: 'managed-ready', workspaceId, version: record.version, error: '', writeReady: true }
}

function useProductionWorkspace(managedIdentity: ManagedIdentity | null = null) {
  const [localSnapshot, setLocalSnapshot] = useState<ProductionWorkspaceView>(() => {
    const local = loadProductionWorkspace()
    return { state: local.state, mode: 'local', workspaceId: '', version: null, error: local.error, writeReady: !local.error && productionWorkspaceCanWrite() }
  })
  const [managedSnapshot, setManagedSnapshot] = useState<ProductionWorkspaceView>(() => ({
    state: createEmptyProduction(), mode: 'managed-loading', workspaceId: '', version: null, error: '', writeReady: false,
  }))
  const snapshotRef = useRef(localSnapshot)
  const identityRef = useRef(managedIdentity)

  useEffect(() => {
    identityRef.current = managedIdentity
    snapshotRef.current = managedIdentity ? managedSnapshot : localSnapshot
  }, [localSnapshot, managedIdentity, managedSnapshot])

  useEffect(() => {
    if (managedIdentity) return undefined
    function refreshFromStorage(event: StorageEvent) {
      if (event.key !== PRODUCTION_KEY) return
      const local = loadProductionWorkspace()
      const next = { state: local.state, mode: 'local' as const, workspaceId: '', version: null, error: local.error, writeReady: !local.error && productionWorkspaceCanWrite() }
      snapshotRef.current = next
      setLocalSnapshot(next)
    }
    window.addEventListener('storage', refreshFromStorage)
    return () => window.removeEventListener('storage', refreshFromStorage)
  }, [managedIdentity])

  useEffect(() => {
    if (!managedIdentity) return undefined

    let active = true
    loadManagedBootstrap(managedIdentity)
      .then((bootstrap) => {
        if (!active || !identityRef.current || !sameManagedIdentity(identityRef.current, managedIdentity)) return
        const record = requireManagedSurfaceState(bootstrap, 'production', 'Plant')
        const next = managedProductionView(record, managedIdentity.workspaceId)
        snapshotRef.current = next
        setManagedSnapshot(next)
      })
      .catch((error) => {
        if (!active || !identityRef.current || !sameManagedIdentity(identityRef.current, managedIdentity)) return
        const next = { state: createEmptyProduction(), mode: 'managed-error' as const, workspaceId: managedIdentity.workspaceId, version: null, error: error instanceof Error ? error.message : 'Managed Plant could not be loaded.', writeReady: false }
        snapshotRef.current = next
        setManagedSnapshot(next)
      })
    return () => { active = false }
  }, [managedIdentity])

  async function mutate(
    eventType: ManagedProductionEvent,
    commandId: string,
    evidence: ProductionActionProof,
    transition: (state: ProductionState) => ProductionState | null,
  ) {
    if (!managedIdentity) {
      if (eventType === 'production.workspace.initialized') throw new Error('Browser demo Plant is already initialized.')
      const result = await mutateProductionWorkspace(transition)
      if (!result.ok) {
        if (result.error === 'The Production state changed or the requested transition is not valid. Nothing was written.') {
          const latest = loadProductionWorkspace()
          const current = {
            state: latest.state,
            mode: 'local' as const,
            workspaceId: '',
            version: null,
            error: latest.error,
            writeReady: !latest.error && productionWorkspaceCanWrite(),
          }
          snapshotRef.current = current
          setLocalSnapshot(current)
          throw new PlantReviewRequiredError(latest.error
            ? `Plant changed before this action was applied. Nothing was written; reload to recover the current record. ${latest.error}`
            : 'Plant changed before this action was applied. Nothing was written; the latest record is loaded for fresh review.')
        }
        const refreshed = loadProductionWorkspace()
        const rejected = {
          state: refreshed.error ? snapshotRef.current.state : refreshed.state,
          mode: 'local' as const,
          workspaceId: '',
          version: null,
          error: result.error,
          writeReady: false,
        }
        snapshotRef.current = rejected
        setLocalSnapshot(rejected)
        throw new Error(result.error)
      }
      const accepted = { state: result.state, mode: 'local' as const, workspaceId: '', version: null, error: '', writeReady: true }
      snapshotRef.current = accepted
      setLocalSnapshot(accepted)
      return
    }

    const workspaceId = managedIdentity.workspaceId
    const current = snapshotRef.current
    const initializing = eventType === 'production.workspace.initialized'
    const modeReady = initializing ? current.mode === 'managed-unprovisioned' && current.version === 0 : current.mode === 'managed-ready' && current.version !== null
    if (!modeReady || current.workspaceId !== workspaceId || current.version === null) {
      throw new Error(current.error || 'Managed Plant is not ready for writes.')
    }
    const next = transition(current.state)
    if (!next) throw new PlantReviewRequiredError('The Plant record changed or this lifecycle step is no longer valid. Nothing was written; review the current record again.')
    if (next === current.state) return
    const candidate = validateProductionState(next)

    try {
      const result = await saveManagedProductionCommand({
        commandId,
        evidence,
        eventType,
        expectedVersion: current.version,
        identity: managedIdentity,
        state: candidate as unknown as Record<string, unknown>,
      })
      if (!identityRef.current || !sameManagedIdentity(identityRef.current, managedIdentity)) throw new Error('The managed workspace changed before the write was confirmed.')
      if (result.surface !== 'production' || result.event_type !== eventType || result.version !== current.version + 1) {
        throw new Error('Managed Plant returned an invalid command result.')
      }
      const accepted = validateProductionState(result.state)
      let nextSnapshot: ProductionWorkspaceView = { state: accepted, mode: 'managed-ready', workspaceId, version: result.version, error: '', writeReady: true }
      if (result.idempotent_replay) {
        const bootstrap = await loadManagedBootstrap(managedIdentity)
        if (!identityRef.current || !sameManagedIdentity(identityRef.current, managedIdentity)) throw new Error('The managed workspace changed before the replay could be reconciled.')
        const refreshed = managedProductionView(
          requireManagedSurfaceState(bootstrap, 'production', 'Plant'),
          workspaceId,
        )
        if (refreshed.mode !== 'managed-ready' || refreshed.version === null || refreshed.version < result.version) {
          throw new Error('Managed Plant could not reconcile the committed command with current state.')
        }
        nextSnapshot = { ...refreshed, error: '' }
      }
      snapshotRef.current = nextSnapshot
      setManagedSnapshot(nextSnapshot)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The managed Plant write was not confirmed.'
      if (error instanceof ManagedTrialError && error.code === 'trial_version_conflict') {
        try {
          const bootstrap = await loadManagedBootstrap(managedIdentity)
          if (!identityRef.current || !sameManagedIdentity(identityRef.current, managedIdentity)) throw new Error('The managed workspace changed before Plant could refresh.', { cause: error })
          const refreshed = managedProductionView(
            requireManagedSurfaceState(bootstrap, 'production', 'Plant'),
            workspaceId,
          )
          const conflict = { ...refreshed, error: '' }
          snapshotRef.current = conflict
          setManagedSnapshot(conflict)
        } catch (refreshError) {
          const refreshMessage = refreshError instanceof Error ? refreshError.message : 'Plant changed and the latest revision could not be loaded.'
          const rejected = { ...snapshotRef.current, error: refreshMessage }
          snapshotRef.current = rejected
          setManagedSnapshot(rejected)
          throw refreshError
        }
        throw new PlantReviewRequiredError('Plant changed in another session. The latest revision is loaded; review and confirm the action again.')
      }
      if (identityRef.current && sameManagedIdentity(identityRef.current, managedIdentity)) {
        const rejected = { ...snapshotRef.current, error: message }
        snapshotRef.current = rejected
        setManagedSnapshot(rejected)
      }
      throw error
    }
  }

  const visible = managedIdentity ? managedSnapshot : localSnapshot
  const canWrite = managedIdentity
    ? visible.mode === 'managed-ready' && visible.version !== null && !visible.error
    : visible.mode === 'local' && !visible.error && visible.writeReady
  return [visible.state, mutate, visible.error, visible.mode, visible.version, visible.workspaceId, canWrite] as const
}

function useApprovalWorkspace() {
  return useStoredState<Approval[]>(APPROVAL_KEY, [], normalizeApprovals, LEGACY_APPROVAL_KEYS, localApprovalsOnly)
}

function useSetupWorkspace() {
  return useStoredState<SetupState>(SETUP_KEY, seedSetup, normalizeSetup, LEGACY_SETUP_KEYS)
}

function useManagedIdentity(enabled: boolean) {
  const [identity, setIdentity] = useState<ManagedIdentity | null>(null)

  useEffect(() => {
    if (!enabled) return undefined
    let active = true
    currentManagedIdentity()
      .then((current) => {
        if (active) setIdentity(current)
      })
      .catch(() => {
        if (active) setIdentity(null)
      })
    return () => { active = false }
  }, [enabled])

  return [enabled ? identity : null, setIdentity] as const
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat('en-US').format(value)} MMK`
}

function fulfilmentLabel(value: string | undefined) {
  if (value === 'pickup') return 'Pickup'
  if (value === 'delivery') return 'Delivery'
  return value ?? ''
}

function commerceOrderReturnLines(order: CommerceOrder) {
  return order.lines?.map((line) => ({
    sku: line.sku,
    name: line.variant ? `${line.name} · ${line.variant}` : line.name,
    quantity: line.quantity,
  })) ?? (order.itemSku ? [{ sku: order.itemSku, name: order.item, quantity: order.quantity }] : [])
}

function AccountableActionGate({ action, authenticatedActor, onCancel, onConfirm, returnFocus }: {
  action: PendingAccountableAction | null
  authenticatedActor?: { id: string; label: string }
  onCancel: () => void
  onConfirm: (details: ActionDetails) => void | Promise<void>
  returnFocus?: HTMLElement | null
}) {
  const [actor, setActor] = useState('')
  const [reason, setReason] = useState('')
  const [evidenceReference, setEvidenceReference] = useState(action?.evidenceReferenceSuggestion ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!action) return undefined
    const dialog = dialogRef.current
    previousFocusRef.current = returnFocus?.isConnected
      ? returnFocus
      : document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (dialog && !dialog.open) dialog.showModal()
    headingRef.current?.focus()
    return () => {
      if (dialog?.open) dialog.close()
      const previousFocus = previousFocusRef.current
      requestAnimationFrame(() => {
        if (previousFocus?.isConnected) previousFocus.focus()
      })
    }
  }, [action, returnFocus])

  if (!action) return null

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!action) return
    const responsibleActor = action.confirmation?.actor ?? authenticatedActor?.id ?? actor.trim()
    const confirmedReason = action.confirmation?.reason ?? reason.trim()
    const confirmedEvidence = action.confirmation?.evidenceReference
      ?? (action.evidenceReferenceLocked ? action.evidenceReferenceSuggestion?.trim() ?? '' : evidenceReference.trim())
    if (!responsibleActor || !confirmedReason || !confirmedEvidence) return
    setBusy(true)
    setError('')
    try {
      await onConfirm({ actor: responsibleActor, reason: confirmedReason, evidenceReference: confirmedEvidence })
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'The change was not applied.')
      setBusy(false)
    }
  }

  return <dialog aria-labelledby="action-confirm-title" className="accountable-action-gate" onCancel={(event) => { event.preventDefault(); if (!busy && !action.confirmation) onCancel() }} ref={dialogRef}>
    <div className="action-change"><span className="core-eyebrow">Confirm change</span><h2 id="action-confirm-title" ref={headingRef} tabIndex={-1}>{action.summary}</h2><dl className="action-change-flow"><div><dt>Current evidence</dt><dd>{action.before}</dd></div><div><dt>After confirmation</dt><dd>{action.after}</dd></div></dl></div>
    <form className="core-form action-confirm-form" onSubmit={(event) => void submit(event)}>
      {authenticatedActor
        ? <label>Your account<input readOnly value={authenticatedActor.label} /></label>
        : <label>Your name<input maxLength={80} readOnly={Boolean(action.confirmation)} required value={action.confirmation?.actor ?? actor} onChange={(event) => setActor(event.target.value)} placeholder="Name or responsible role" /></label>}
      <label>Reason<input maxLength={180} readOnly={Boolean(action.confirmation)} required value={action.confirmation?.reason ?? reason} onChange={(event) => setReason(event.target.value)} placeholder="Why this change is correct now" /></label>
      <label>Reference<input maxLength={180} readOnly={Boolean(action.confirmation) || action.evidenceReferenceLocked} required value={action.confirmation?.evidenceReference ?? (action.evidenceReferenceLocked ? action.evidenceReferenceSuggestion ?? '' : evidenceReference)} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Message ID, receipt, count sheet, or observation" /></label>
      <div className="form-actions"><button className="core-button" disabled={busy || Boolean(action.confirmation)} onClick={onCancel} type="button">Cancel</button><button className="core-button primary" disabled={busy} type="submit">{busy ? 'Applying…' : action.confirmation ? 'Retry same confirmation' : 'Confirm change'}</button></div>
      {error || action.confirmation ? <p className="form-notice" role="status">{error || 'This command proof is frozen. Any retry reuses the same command and evidence; reload can reconcile managed state.'}</p> : null}
    </form>
  </dialog>
}

function ActionHistory({ actions, domain }: { actions: AccountableAction[]; domain: ActionDomain }) {
  const domainActions = actions.filter((action) => action.domain === domain)
  return <details className="core-panel action-history">
    <summary><span>Action history</span><strong>{domainActions.length} accountable records</strong></summary>
    {domainActions.length ? <div className="action-history-list">{domainActions.slice(0, 6).map((action) => <article key={action.id}><div><strong>{action.summary}</strong><small>{action.id} · {action.actor} · {formatTime(action.capturedAt)}</small></div><p>{action.before} → {action.after}</p><small>{action.reason} · Evidence: {action.evidenceReference}</small></article>)}</div> : <p className="panel-copy">No accountable action has been confirmed in this local workspace.</p>}
  </details>
}

function Brand() {
  return (
    <Link className="core-brand" to="/" aria-label="SuperMega app home">
      <span className="core-brand-mark" aria-hidden="true">&gt;_</span>
      <span className="core-brand-name">SUPERMEGA</span>
    </Link>
  )
}

function useRuntimeHealth() {
  const [runtime, setRuntime] = useState<RuntimeHealth>(checkingRuntime)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/health', { headers: { accept: 'application/json' }, signal: controller.signal })
      .then(async (response) => {
        const type = response.headers.get('content-type') ?? ''
        if (!response.ok || !type.includes('application/json')) throw new Error('health_unavailable')
        const body = (await response.json()) as {
          status?: string
          operating_mode?: string
          enterprise_db_ready?: boolean
          security_ready?: boolean
          coverage_score?: number
          trial_backend?: { write_enabled?: boolean }
          enterprise_activation?: { requirements?: string[] }
        }
        const requirements = Array.isArray(body.enterprise_activation?.requirements) ? body.enterprise_activation.requirements : []
        const writesReady = body.trial_backend?.write_enabled === true
        const enterpriseReady = body.status === 'ready'
          && body.operating_mode === 'managed_trial'
          && body.enterprise_db_ready === true
          && body.security_ready === true
          && writesReady
          && requirements.length === 0
        setRuntime({
          status: enterpriseReady ? 'enterprise' : 'demo',
          serviceStatus: body.status ?? 'unknown',
          operatingMode: body.operating_mode ?? 'unknown',
          enterpriseDbReady: body.enterprise_db_ready === true,
          securityReady: body.security_ready === true,
          writesReady,
          coverageScore: Number.isFinite(body.coverage_score) ? Number(body.coverage_score) : 0,
          requirements,
        })
      })
      .catch(() => {
        if (!controller.signal.aborted) setRuntime({ ...checkingRuntime, status: 'demo', serviceStatus: 'unavailable', operatingMode: 'isolated_demo', requirements: ['Restore the application health endpoint before activating a managed workspace.'] })
      })
    return () => controller.abort()
  }, [])

  return runtime
}

function RuntimeBadge({ status }: { status: RuntimeStatus }) {
  return <span className={`runtime-badge ${status}`}><i />{status === 'checking' ? 'Checking' : status === 'enterprise' ? 'Managed' : 'Local trial'}</span>
}

export function CoreLayout() {
  const location = useLocation()
  const runtime = useRuntimeHealth()
  const workspaceMainRef = useRef<HTMLElement>(null)
  const routeName = location.pathname.startsWith('/website/')
    ? 'Website'
    : location.pathname.startsWith('/ecommerce/')
      ? 'Ecommerce'
    : location.pathname.startsWith('/settings/')
      ? 'Client setup'
      : location.pathname.startsWith('/shop/') || location.pathname.startsWith('/operations/commerce/')
        ? 'Shop'
        : location.pathname.startsWith('/plant/') || location.pathname.startsWith('/operations/production/')
          ? 'Plant'
          : navigation.find((item) => item.to !== '/' && location.pathname.startsWith(item.to))?.label ?? 'Home'
  const navigationClass = (to: string, isActive: boolean) => (
    isActive || (to === '/operations/' && (
      location.pathname.startsWith('/website/')
      || location.pathname.startsWith('/ecommerce/')
      || location.pathname.startsWith('/shop/')
      || location.pathname.startsWith('/plant/')
    )) ? 'active' : ''
  )

  useEffect(() => {
    document.title = `${routeName} | SuperMega`
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname, location.search, routeName])

  return (
    <div className="core-shell">
      <a className="core-skip" href="#workspace-main" onClick={() => requestAnimationFrame(() => workspaceMainRef.current?.focus())}>Skip to workspace</a>
      <aside className="core-sidebar">
        <Brand />
        <nav className="core-nav" aria-label="Application">
          {navigation.map((item) => <NavLink className={({ isActive }) => navigationClass(item.to, isActive)} end={item.end} key={item.to} to={item.to}>{item.label}</NavLink>)}
        </nav>
        <div className="sidebar-foot"><RuntimeBadge status={runtime.status} /><NavLink to="/settings/">Client setup</NavLink></div>
      </aside>
      <div className="core-stage">
        <header className="core-topbar"><div className="mobile-brand"><Brand /></div><div className="topbar-title"><strong>{routeName}</strong><span>{location.pathname.startsWith('/work/') ? 'SuperMega HQ' : 'SuperMega'}</span></div><div className="topbar-meta"><NavLink to="/settings/">Setup</NavLink><RuntimeBadge status={runtime.status} /></div></header>
        <nav className="mobile-nav" aria-label="Mobile application">{navigation.map((item) => <NavLink className={({ isActive }) => navigationClass(item.to, isActive)} end={item.end} key={item.to} to={item.to}>{item.label}</NavLink>)}</nav>
        <main id="workspace-main" className="core-main" ref={workspaceMainRef} tabIndex={-1}><Outlet context={runtime} /></main>
      </div>
    </div>
  )
}

export function PageHeading({ eyebrow, title, copy, actions }: { eyebrow?: string; title: string; copy: string; actions?: ReactNode }) {
  return <header className="page-heading"><div>{eyebrow ? <span className="core-eyebrow">{eyebrow}</span> : null}<h1>{title}</h1><p>{copy}</p></div>{actions ? <div className="heading-actions">{actions}</div> : null}</header>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty-state"><span>&gt;_</span><p>{children}</p></div>
}

function ApprovalReviewDialog({ approval, onClose, onDecision }: { approval: Approval; onClose: () => void; onDecision: (status: 'approved' | 'declined', reviewer: string, note: string) => Promise<void> | void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const reviewerInputRef = useRef<HTMLInputElement>(null)
  const [reviewer, setReviewer] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (dialog && !dialog.open) dialog.showModal()
    reviewerInputRef.current?.focus()
    return () => {
      if (dialog?.open) dialog.close()
      returnFocus?.focus()
    }
  }, [])

  async function decide(status: 'approved' | 'declined') {
    if (!reviewer.trim() || !note.trim()) {
      setError('Name the human reviewer and record the reason for this decision.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onDecision(status, reviewer.trim(), note.trim())
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : 'The decision was not recorded. Try again.')
      setBusy(false)
    }
  }

  return (
    <dialog aria-labelledby="decision-dialog-title" className="decision-dialog" onCancel={(event) => { event.preventDefault(); onClose() }} ref={dialogRef}>
      <div className="panel-head"><div><span className="core-eyebrow">Human decision</span><h2 id="decision-dialog-title">{approval.title}</h2></div><button aria-label="Close decision review" className="text-link" onClick={onClose} type="button">Close</button></div>
      <div className="decision-packet-meta"><span><small>Contract</small><strong>{approval.packet.contract}</strong></span><span><small>Subject</small><strong>{approval.packet.subject.kind} · v{approval.packet.subject.version}</strong></span><span><small>Requested by</small><strong>{approval.requestedBy} · {approval.requestedActorKind}</strong></span><span><small>Captured</small><strong>{formatTime(approval.createdAt)}</strong></span></div>
      <div className="decision-packet-copy"><span>Decision requested</span><p>{approval.packet.decision}</p><small>{approval.packet.artifactReference}</small></div>
      <div className="decision-outcomes"><span><small>Baseline</small><strong>{approval.packet.baseline}</strong></span><span><small>Target</small><strong>{approval.packet.target}</strong></span><span><small>Current result</small><strong>{approval.packet.result}</strong></span><span><small>Acceptance</small><strong>{approval.packet.acceptance}</strong></span></div>
      <div className="decision-evidence"><span>Claims and provenance</span>{approval.packet.claims.map((claim) => <article key={claim.id}><div><strong>{claim.statement}</strong><small>{claim.claimType} · {claim.sourceReference} · {claim.uncertainty} uncertainty · {claim.visibility} · {formatTime(claim.capturedAt)}{claim.digest ? ` · ${claim.digest}` : ''}</small></div><span className={`status-pill ${claim.status === 'verified' ? 'approved' : 'pending'}`}>{claim.status}</span></article>)}</div>
      <div className="decision-fields"><label>Human reviewer<input autoFocus maxLength={80} onChange={(event) => setReviewer(event.target.value)} placeholder="Name or accountable role" ref={reviewerInputRef} required value={reviewer} /></label><label>Decision note<textarea maxLength={240} onChange={(event) => setNote(event.target.value)} placeholder="Why this is approved or declined, and any boundary." required value={note} /></label></div>
      <p className="form-notice" role="status">{error || 'Agents and services may prepare this packet; only a named human can make the terminal decision.'}</p>
      <div className="form-actions"><button className="core-button danger" disabled={busy} onClick={() => void decide('declined')} type="button">Decline and record</button><button className="core-button primary" disabled={busy} onClick={() => void decide('approved')} type="button">{busy ? 'Recording…' : 'Approve and record'}</button></div>
    </dialog>
  )
}

export function OverviewPage() {
  const runtime = useOutletContext<RuntimeHealth>()
  const purchaseOrderClock = useMinuteClock()
  const [managedIdentity] = useManagedIdentity(runtime.status === 'enterprise')
  const [commerce] = useCommerceWorkspace(managedIdentity)
  const [production] = useProductionWorkspace(managedIdentity)
  const [approvals, setApprovals] = useApprovalWorkspace()
  const [setup] = useSetupWorkspace()
  const [workspace] = useTeamWorkspace()
  const [brief, setBrief] = useState<string[]>([])
  const [selectedApprovalId, setSelectedApprovalId] = useState('')
  const [briefNotice, setBriefNotice] = useState('')
  const [briefBusy, setBriefBusy] = useState(false)
  const openWork = workspace.items.filter((item) => item.status !== 'done')
  const activeWork = workspace.items.filter((item) => ['in_progress', 'review'].includes(item.status))
  const blockedWork = workspace.items.filter((item) => item.status === 'blocked')
  const visibleWork = workspace.items.filter((item) => ['in_progress', 'review', 'blocked'].includes(item.status))
  const homeWork = visibleWork.slice(0, 3)
  const pendingApprovals = approvals.filter((item) => item.status === 'pending')
  const lowStock = commerce.items.filter((item) => item.onHand <= item.reorderAt)
  const activePurchaseOrderRows = commercePurchaseOrders(commerce)
    .map((purchaseOrder) => ({
      purchaseOrder,
      progress: commercePurchaseOrderProgress(commerce, purchaseOrder),
      item: commerce.items.find((item) => item.sku === purchaseOrder.sku),
    }))
    .filter(({ progress }) => progress.status === 'open' || progress.status === 'partially_received')
    .sort(compareCommercePurchaseOrderAttention)
  const activePurchaseOrderBySku = new Map(
    activePurchaseOrderRows.map((row) => [row.purchaseOrder.sku, row]),
  )
  const uncoveredLowStock = lowStock.filter((item) => !activePurchaseOrderBySku.has(item.sku))
  const purchaseArrivalAttention = activePurchaseOrderRows
    .map((row) => ({
      ...row,
      urgency: commercePurchaseOrderArrivalUrgency(row.purchaseOrder, row.progress, purchaseOrderClock),
    }))
    .filter(({ urgency }) => urgency === 'late' || urgency === 'due_soon' || urgency === 'unrecorded')
  const nextPurchaseArrivalProblem = purchaseArrivalAttention.find(({ urgency }) => urgency === 'late' || urgency === 'unrecorded')
  const nextPurchaseArrivalDueSoon = purchaseArrivalAttention.find(({ urgency }) => urgency === 'due_soon')
  const openProductionIssues = production.issues.filter((issue) => issue.status === 'open')
  const openOrders = commerce.orders
    .filter((order) => order.status !== 'completed' && order.status !== 'cancelled')
    .sort(compareCommerceOrderPromise)
  const nextOperatingOrder = openOrders.find(commerceOrderNeedsAction) ?? openOrders[0]
  const agentHandoffs = workspace.agents.filter((agent) => ['waiting_review', 'blocked'].includes(agent.state) && !blockedWork.some((item) => item.id === agent.assignedWorkItemId))
  const releaseComplete = workspace.release.checks.filter((check) => check.complete).length
  const releasePercent = Math.round((releaseComplete / workspace.release.checks.length) * 100)
  const isPilotReady = pilotReady(setup)
  const stockPriorityCount = uncoveredLowStock.length + purchaseArrivalAttention.length
  const operatingExceptions = stockPriorityCount + openProductionIssues.length
  const ownerAttention = blockedWork.length + pendingApprovals.length + agentHandoffs.length + operatingExceptions + (isPilotReady ? 0 : 1)
  const selectedApproval = pendingApprovals.find((approval) => approval.id === selectedApprovalId)
  function purchaseArrivalPriority(row: typeof purchaseArrivalAttention[number]) {
    const itemName = row.item?.name ?? row.purchaseOrder.sku
    const timing = row.urgency === 'unrecorded'
      ? 'arrival time not recorded'
      : `${row.urgency === 'late' ? 'late since' : 'due'} ${formatIssueDue(row.purchaseOrder.expectedAt as string)}`
    return {
      label: 'Shop purchase',
      title: row.urgency === 'late'
        ? `Check late ${itemName} arrival`
        : row.urgency === 'due_soon'
          ? `Prepare for ${itemName} arrival`
          : `Review ${itemName} purchase`,
      detail: `${row.progress.remaining.toLocaleString()} of ${row.purchaseOrder.quantityOrdered.toLocaleString()} units remaining · ${row.purchaseOrder.supplier} · ${timing}.`,
      action: 'Open purchases',
      href: '/shop/?tab=inventory#purchase-orders',
    }
  }
  const nextPriority: { label: string; title: string; detail: string; action: string; href?: string; approvalId?: string } = nextPurchaseArrivalProblem
    ? purchaseArrivalPriority(nextPurchaseArrivalProblem)
    : uncoveredLowStock[0]
      ? { label: 'Shop stock', title: `Reorder ${uncoveredLowStock[0].name}`, detail: `${uncoveredLowStock[0].onHand} on hand; reorder at ${uncoveredLowStock[0].reorderAt}.`, action: 'Open stock', href: '/shop/?tab=inventory' }
      : nextPurchaseArrivalDueSoon
        ? purchaseArrivalPriority(nextPurchaseArrivalDueSoon)
        : openProductionIssues[0]
          ? { label: 'Plant problem', title: openProductionIssues[0].summary, detail: `${openProductionIssues[0].area} needs review.`, action: 'Review problem', href: '/plant/?tab=control' }
          : nextOperatingOrder
            ? { label: 'Shop order', title: `Continue ${nextOperatingOrder.id}`, detail: `${nextOperatingOrder.customer} · ${nextOperatingOrder.status.replace('_', ' ')} · ${nextOperatingOrder.promisedAt ? `promised ${formatTime(nextOperatingOrder.promisedAt)}` : 'promise not recorded'}.`, action: 'Open orders', href: '/shop/?tab=orders' }
            : !isPilotReady
              ? { label: 'Setup', title: 'Define the measurable workflow', detail: `${pilotProgress(setup)}% complete; add the baseline and acceptance evidence.`, action: 'Finish setup', href: '/settings/' }
              : pendingApprovals[0]
                ? { label: 'HQ approval', title: pendingApprovals[0].title, detail: `${pendingApprovals[0].packet.claims.length} claims are ready for a human decision.`, action: 'Review now', approvalId: pendingApprovals[0].id }
                : blockedWork[0]
                  ? { label: 'HQ blocker', title: blockedWork[0].title, detail: `${blockedWork[0].owner} needs a decision to continue.`, action: 'Open HQ', href: `/work/?team=${blockedWork[0].team}&view=work&item=${blockedWork[0].id}` }
                  : agentHandoffs[0]
                    ? { label: 'HQ handoff', title: `${agentHandoffs[0].name} needs review`, detail: `${agentHandoffs[0].humanOwner} owns the next decision.`, action: 'Open HQ', href: `/work/?team=${agentHandoffs[0].team}&view=agents&agent=${agentHandoffs[0].id}` }
                    : { label: 'Ready', title: 'Start with Shop', detail: 'No operating exception or owner decision is waiting.', action: 'Open Shop', href: '/shop/?tab=orders' }

  useEffect(() => {
    if (!managedIdentity) return undefined
    let active = true
    loadManagedBootstrap(managedIdentity)
      .then((bootstrap) => {
        if (!active) return
        setApprovals((current) => mergeManagedApprovals(current, bootstrap.approvals))
        setBriefNotice(`Connected to ${managedIdentity.workspaceId}; approval records are managed.`)
      })
      .catch((error) => {
        if (active) setBriefNotice(error instanceof Error ? error.message : 'Managed approvals could not be loaded.')
      })
    return () => { active = false }
  }, [managedIdentity, setApprovals])

  function prepareCompanyBrief() {
    setBrief([
      `${openWork.length} company work items remain open; ${activeWork.length} are in delivery or review across ${workspace.agents.length} delegated role records.`,
      `${openOrders.length} Shop orders, ${stockPriorityCount} stock priorities, and ${openProductionIssues.length} Plant issues need operating attention.`,
      `${workspace.release.name} is ${releasePercent}% ready from ${workspace.release.checks.length} explicit checks.`,
      isPilotReady ? `${setup.workspace} pilot starts from ${setup.entryPoint}; baseline: ${setup.baseline}; target: ${setup.targetOutcome}.` : `Pilot definition is ${pilotProgress(setup)}% complete and still needs a baseline, target, authority boundary, and acceptance evidence.`,
    ])
  }

  async function requestBriefApproval() {
    const createdAt = new Date().toISOString()
    const approvalId = uid('APR')
    const claimSources = ['local://teams/work-register', 'local://operations', 'local://teams/product/release-checks', 'local://settings/pilot-definition']
    const claims: DecisionClaim[] = brief.map((statement, index) => ({
      id: `${approvalId}-CLM-${index + 1}`,
      claimType: index === brief.length - 1 ? 'analysis' : 'fact',
      statement,
      sourceReference: claimSources[index] ?? 'local://workspace',
      capturedAt: createdAt,
      status: 'observed',
      uncertainty: index === brief.length - 1 ? 'medium' : 'low',
      visibility: 'private',
    }))
    const packet: DecisionPacket = {
      contract: 'decision_packet.v1',
      subject: { kind: 'company_brief', id: approvalId, version: 1 },
      decision: 'Confirm this operating brief and authorize named owners to proceed inside the recorded human authority boundary.',
      claims,
      baseline: setup.baseline.trim() || 'Not recorded',
      target: setup.targetOutcome.trim() || 'Not recorded',
      result: isPilotReady ? 'Pilot definition ready; no measured operating result is claimed yet.' : 'Pilot definition incomplete; no operating result is claimed.',
      acceptance: setup.acceptanceEvidence.trim() || 'Not recorded',
      artifactReference: 'local://exports/supermega-trial-evidence',
    }
    const packetFingerprint = decisionPacketFingerprint(packet)
    const existing = pendingApprovals.find((approval) => approval.title === 'Review the current company brief and owner decisions' && approval.packetFingerprint === packetFingerprint)
    if (existing) {
      setSelectedApprovalId(existing.id)
      return
    }
    const approval: Approval = {
      id: approvalId,
      commandId: commandUuid(),
      createdAt,
      title: 'Review the current company brief and owner decisions',
      requestedBy: setup.owner.trim() || 'Local workspace operator',
      requestedActorKind: 'human',
      packet,
      packetFingerprint,
      status: 'pending',
    }
    if (!managedIdentity) {
      setApprovals((current) => [approval, ...current.map((candidate) => candidate.status === 'pending' && candidate.title === approval.title ? { ...candidate, status: 'superseded' as const } : candidate)])
      setSelectedApprovalId(approval.id)
      setBriefNotice('Saved in this browser. Sign in from Settings to create a managed approval record.')
      return
    }

    const request = toManagedApprovalRequest(approval)
    if (!request) {
      setBriefNotice('The approval packet is incomplete and was not sent.')
      return
    }
    setBriefBusy(true)
    setBriefNotice('Recording the approval request…')
    try {
      const managedApproval = fromManagedApproval(await createManagedApproval(request))
      setApprovals((current) => [managedApproval, ...current.filter((candidate) => candidate.id !== managedApproval.id).map((candidate) => candidate.status === 'pending' && candidate.title === managedApproval.title ? { ...candidate, status: 'superseded' as const } : candidate)])
      setSelectedApprovalId(managedApproval.id)
      setBriefNotice(`Approval recorded in ${managedIdentity.workspaceId}.`)
    } catch (error) {
      setBriefNotice(error instanceof Error ? error.message : 'The approval was not recorded. No local fallback was claimed.')
    } finally {
      setBriefBusy(false)
    }
  }

  async function setApprovalStatus(id: string, status: 'approved' | 'declined', reviewer: string, note: string) {
    const approval = approvals.find((candidate) => candidate.id === id)
    if (!approval) throw new Error('The approval record is no longer available.')
    if (approval.managed) {
      const updated = fromManagedApproval(await decideManagedApproval(id, {
        command_id: commandUuid(),
        decision: status,
        note,
      }))
      setApprovals((current) => current.map((candidate) => candidate.id === id ? updated : candidate))
      setBriefNotice(`Decision recorded in ${managedIdentity?.workspaceId ?? 'the managed workspace'}.`)
    } else {
      setApprovals((current) => current.map((candidate) => candidate.id === id ? { ...candidate, status, decidedAt: new Date().toISOString(), decidedBy: reviewer, decidedActorKind: 'human', decisionNote: note } : candidate))
    }
    setSelectedApprovalId('')
  }

  return (
    <div className="workspace-screen command-screen">
      <PageHeading copy="Continue the most important operating record, or choose a product below." eyebrow="Home" title="Start here" />
      <section className="core-panel next-task-card">
        <div><div className="next-task-source"><span className="core-eyebrow">{nextPriority.label}</span><span className={`status-pill ${managedIdentity ? 'bounded' : 'pending'}`}>{managedIdentity ? 'Managed records' : 'Sample data'}</span></div><h2>{nextPriority.title}</h2><p>{nextPriority.detail}</p></div>
        {nextPriority.approvalId
          ? <button className="core-button primary" onClick={() => setSelectedApprovalId(nextPriority.approvalId ?? '')} type="button">{nextPriority.action}</button>
          : <Link className="core-button primary" to={nextPriority.href ?? '/'}>{nextPriority.action}</Link>}
      </section>
      <nav aria-label="Products" className="product-launcher home-products">
        <Link to="/shop/?tab=orders">
          <span><strong>Shop</strong><small>Orders, payments, and stock</small></span>
          <b>{openOrders.length ? `${openOrders.length} open` : 'Ready'}</b>
        </Link>
        <Link to={openProductionIssues.length ? '/plant/?tab=control' : '/plant/?tab=production'}>
          <span><strong>Plant</strong><small>Jobs, output, and problems</small></span>
          <b>{openProductionIssues.length ? `${openProductionIssues.length} ${openProductionIssues.length === 1 ? 'issue' : 'issues'}` : 'Ready'}</b>
        </Link>
        <Link to="/website/">
          <span><strong>Website</strong><small>Build and review a website</small></span>
          <b>Open</b>
        </Link>
        <Link to="/ecommerce/">
          <span><strong>Ecommerce</strong><small>Build a Shop-backed storefront</small></span>
          <b>Open</b>
        </Link>
      </nav>
      <details className="home-more">
        <summary><span>SuperMega HQ</span><small>Internal company work</small></summary>
        <div className="command-grid">
        <section className="core-panel command-queue-panel">
          <div className="panel-head"><div><span className="core-eyebrow">Active work</span><h2>{visibleWork.length} items in motion</h2></div><Link className="text-link" to="/work/?team=product&view=work">View all work</Link></div>
          <div className="record-list">{homeWork.map((item) => { const team = teamDefinitions.find((definition) => definition.id === item.team); return <Link className="record-row" key={item.id} to={`/work/?team=${item.team}&view=work&item=${item.id}`}><span className={`record-status ${item.status}`} /><span><strong>{item.title}</strong><small>{team?.label ?? item.team} / {item.owner} / {item.evidence.length} evidence</small></span><span><b>{item.priority}</b><small>{item.status.replace('_', ' ')}</small></span></Link> })}</div>
        </section>
        <section className="core-panel attention-panel" id="owner-priorities">
          <div className="panel-head"><div><span className="core-eyebrow">Needs you</span><h2>{ownerAttention} {ownerAttention === 1 ? 'priority' : 'priorities'}</h2></div></div>
          <div className="attention-list">
            {!isPilotReady ? <Link to="/settings/"><span>Pilot</span><strong>Define the measurable workflow</strong><small>{pilotProgress(setup)}% complete · baseline and acceptance required</small></Link> : null}
            {blockedWork.map((item) => <Link key={item.id} to={`/work/?team=${item.team}&view=work&item=${item.id}`}><span>Work</span><strong>{item.title}</strong><small>{item.owner}</small></Link>)}
            {agentHandoffs.map((agent) => <Link key={agent.id} to={`/work/?team=${agent.team}&view=agents&agent=${agent.id}`}><span>Agent</span><strong>{agent.name} {agent.state === 'waiting_review' ? 'needs review' : 'is blocked'}</strong><small>{agent.humanOwner} / {agent.assignedWorkItemId ?? 'unassigned'}</small></Link>)}
            {pendingApprovals.map((approval) => <button className="attention-action" key={approval.id} onClick={() => setSelectedApprovalId(approval.id)} type="button"><span>{approval.managed ? 'Managed approval' : 'Approval'}</span><strong>{approval.title}</strong><small>{approval.packet.claims.length} claims · {formatTime(approval.createdAt)}</small><b>Review</b></button>)}
            {purchaseArrivalAttention.map((row) => { const priority = purchaseArrivalPriority(row); return <Link key={row.purchaseOrder.id} to={priority.href}><span>Purchase</span><strong>{priority.title}</strong><small>{priority.detail}</small></Link> })}
            {uncoveredLowStock.map((item) => <Link key={item.sku} to="/shop/?tab=inventory"><span>Stock</span><strong>{item.name}</strong><small>{item.onHand} on hand · reorder at {item.reorderAt}</small></Link>)}
            {openProductionIssues.map((issue) => <Link key={issue.id} to="/plant/?tab=control"><span>{issue.kind}</span><strong>{issue.summary}</strong><small>{issue.area}</small></Link>)}
            {!ownerAttention ? <Empty>No owner decision needs attention.</Empty> : null}
          </div>
        </section>
        <section className="core-panel release-brief-panel">
          <div className="release-line"><div><span className="core-eyebrow">Product release</span><h2>{workspace.release.name}</h2></div><strong>{releasePercent}%</strong></div>
          <div className="progress-track"><i style={{ width: `${releasePercent}%` }} /></div>
          <Link className="release-review-link" to="/work/?team=product&view=review">Review release checks</Link>
          <details className="company-brief-disclosure"><summary>Company brief</summary><button className="text-link" onClick={prepareCompanyBrief} type="button">Prepare brief</button>{brief.length ? <div className="brief-output compact">{brief.map((line) => <p key={line}>{line}</p>)}<button className="core-button compact" disabled={briefBusy} onClick={() => void requestBriefApproval()} type="button">{briefBusy ? 'Recording…' : 'Request owner review'}</button></div> : <p className="panel-copy">Prepared locally from visible work and operating records.</p>}{briefNotice ? <p className="form-notice" role="status">{briefNotice}</p> : null}</details>
        </section>
      </div>
      </details>
      {selectedApproval ? <ApprovalReviewDialog approval={selectedApproval} onClose={() => setSelectedApprovalId('')} onDecision={(status, reviewer, note) => setApprovalStatus(selectedApproval.id, status, reviewer, note)} /> : null}
    </div>
  )
}

export function OperationsPage({ product }: { product?: ProductId }) {
  const runtime = useOutletContext<RuntimeHealth>()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [managedIdentity] = useManagedIdentity(runtime.status === 'enterprise')
  const ecommerceNavigationDraft = (location.state as { ecommerceShopDraft?: EcommerceShopDraft } | null)?.ecommerceShopDraft ?? null
  const routeModule = location.pathname.split('/').filter(Boolean)[1]
  const requestedView = searchParams.get('view')
  const requestedSource = searchParams.get('source')
  const requestedRequestId = searchParams.get('request')
  const isProductRoute = Boolean(product) || routeModule === 'commerce' || routeModule === 'production'
  const view: ProductId = product ?? (routeModule === 'production' || requestedView === 'production' || requestedView === 'plant' ? 'production' : 'commerce')
  const requestedTab = searchParams.get('tab')
  const commerceTab = commerceTabs.some((tab) => tab.id === requestedTab) ? requestedTab as CommerceTab : 'orders'
  const productionTab = productionTabs.some((tab) => tab.id === requestedTab) ? requestedTab as ProductionTab : 'production'
  const activeTab = view === 'commerce' ? commerceTab : productionTab
  const requestedTabIsCanonical = requestedTab === activeTab

  useEffect(() => {
    if (!isProductRoute && !requestedView) return
    const canonicalPath = productCanonicalPath(view)
    if (location.pathname !== canonicalPath || requestedView || !requestedTabIsCanonical) navigate(`${canonicalPath}?tab=${activeTab}`, { replace: true })
  }, [activeTab, isProductRoute, location.pathname, navigate, requestedTabIsCanonical, requestedView, view])

  function setTab(tab: CommerceTab | ProductionTab) {
    navigate(`${productCanonicalPath(view)}?tab=${tab}`, { replace: true })
  }

  const tabs = view === 'commerce' ? commerceTabs : productionTabs
  const productCopy = view === 'commerce'
    ? 'Orders, payments, and stock in one place.'
    : 'Jobs, output, equipment, and problems in one place.'

  if (!isProductRoute && !requestedView) {
    return <div className="workspace-screen product-catalog-screen">
      <PageHeading eyebrow="Products" title="Choose a product" copy="Open the product for the job you need to do." actions={<Link className="core-button" to="/settings/">Set up a client</Link>} />
      <nav aria-label="SuperMega apps" className="product-launcher product-catalog">
        <Link to="/shop/?tab=orders"><span><strong>Shop</strong><small>Orders, payments, and stock</small></span><b>Open</b></Link>
        <Link to="/plant/?tab=production"><span><strong>Plant</strong><small>Jobs, output, and problems</small></span><b>Open</b></Link>
        <Link to="/website/"><span><strong>Website</strong><small>Build, preview, and review a site</small></span><b>Open</b></Link>
        <Link to="/ecommerce/"><span><strong>Ecommerce</strong><small>Build a storefront from Shop</small></span><b>Open</b></Link>
      </nav>
    </div>
  }

  return (
    <div className="workspace-screen operations-screen">
      <PageHeading title={productDisplayName(view)} copy={productCopy} actions={<Link className="text-link all-apps-link" to="/operations/">Products</Link>} />
      <nav className="workspace-toolbar view-tabs product-task-tabs" aria-label={`${productDisplayName(view)} tasks`}>{tabs.map((tab) => <button aria-current={activeTab === tab.id ? 'page' : undefined} key={tab.id} onClick={() => setTab(tab.id)} type="button">{tab.label}</button>)}</nav>
      <div className="workspace-view">{view === 'commerce' ? <CommercePage ecommerceNavigationDraft={ecommerceNavigationDraft} managedIdentity={managedIdentity} requestedRequestId={requestedRequestId} requestedSource={requestedSource} tab={commerceTab} /> : <ProductionPage managedIdentity={managedIdentity} tab={productionTab} />}</div>
    </div>
  )
}

type ChannelAttributionDraft = { kind: ChannelOrderAttributionInput['kind']; quote: string }

const channelFieldLabels: Record<ChannelOrderField, string> = {
  customer: 'Customer',
  sku: 'Item',
  quantity: 'Quantity',
  payment: 'Payment',
}

function emptyChannelAttributions(): Record<ChannelOrderField, ChannelAttributionDraft> {
  return {
    customer: { kind: 'quote', quote: '' },
    sku: { kind: 'quote', quote: '' },
    quantity: { kind: 'quote', quote: '' },
    payment: { kind: 'quote', quote: '' },
  }
}

function channelDraftBlockerLabel(blocker: string) {
  const field = channelOrderFields.find((candidate) => blocker.startsWith(`${candidate}_`))
  const fieldLabel = field ? channelFieldLabels[field] : ''
  if (blocker === 'source_label_required') return 'Add a message ID or approved sample label.'
  if (blocker === 'source_message_required') return 'Paste one approved or synthetic message.'
  if (blocker === 'source_message_too_long') return `Keep the single message under ${CHANNEL_ORDER_MESSAGE_MAX.toLocaleString()} characters.`
  if (blocker === 'channel_invalid') return 'Choose Messenger, Viber, or Phone.'
  if (blocker === 'customer_required') return 'Add a customer reference.'
  if (blocker === 'sku_required') return 'Choose a catalog item.'
  if (blocker === 'sku_unknown') return 'The selected item is not in the current catalog.'
  if (blocker === 'quantity_invalid') return 'Enter a whole quantity from 1 to 9,999.'
  if (blocker === 'payment_invalid') return 'Choose a supported payment intent.'
  if (blocker === 'source_quote_required') return 'Map at least one field to exact words from the message.'
  if (blocker.endsWith('_attribution_required')) return `${fieldLabel} needs an exact quote or Operator supplied.`
  if (blocker.endsWith('_quote_required')) return `Add the exact ${fieldLabel.toLowerCase()} words from the message.`
  if (blocker.endsWith('_quote_must_be_excerpt')) return `Use a short ${fieldLabel.toLowerCase()} excerpt, not the full message.`
  if (blocker.endsWith('_quote_not_found')) return `The ${fieldLabel.toLowerCase()} quote is not in this message.`
  if (blocker.endsWith('_quote_ambiguous')) return `Use a longer, unique ${fieldLabel.toLowerCase()} quote.`
  return blocker.replaceAll('_', ' ')
}

function ChannelOrderIntake({ disabled, items, onAcceptedFocus, onUse }: {
  disabled: boolean
  items: CommerceItem[]
  onAcceptedFocus: () => void
  onUse: (draft: ChannelOrderDraft) => void
}) {
  const [sourceLabel, setSourceLabel] = useState('')
  const [message, setMessage] = useState('')
  const [channel, setChannel] = useState('Messenger')
  const [customer, setCustomer] = useState('')
  const [sku, setSku] = useState(items[0]?.sku ?? '')
  const [quantity, setQuantity] = useState('1')
  const [payment, setPayment] = useState('KBZPay')
  const [attributions, setAttributions] = useState(emptyChannelAttributions)
  const [reviewedDraft, setReviewedDraft] = useState<ChannelOrderDraft | null>(null)
  const [mappingField, setMappingField] = useState<ChannelOrderField>('customer')
  const selectedSku = items.some((item) => item.sku === sku) ? sku : items[0]?.sku ?? ''
  const mappingFieldIndex = channelOrderFields.indexOf(mappingField)
  const previousMappingField = mappingFieldIndex > 0 ? channelOrderFields[mappingFieldIndex - 1] : undefined
  const nextMappingField = channelOrderFields[mappingFieldIndex + 1]

  function attributionIsComplete(field: ChannelOrderField) {
    const attribution = attributions[field]
    const valueIsComplete = field === 'customer'
      ? Boolean(customer.trim())
      : field === 'sku'
        ? Boolean(selectedSku)
        : field === 'quantity'
          ? Number.isInteger(Number(quantity)) && Number(quantity) > 0
          : Boolean(payment)
    return valueIsComplete && (attribution.kind === 'operator_supplied' || Boolean(attribution.quote.trim()))
  }

  function invalidateReview() {
    if (reviewedDraft) setReviewedDraft(null)
  }

  function updateAttribution(field: ChannelOrderField, patch: Partial<ChannelAttributionDraft>) {
    setAttributions((current) => ({ ...current, [field]: { ...current[field], ...patch } }))
    invalidateReview()
  }

  function reviewMessage(event: FormEvent) {
    event.preventDefault()
    const normalizedAttributions = Object.fromEntries(channelOrderFields.map((field) => {
      const attribution = attributions[field]
      const value: ChannelOrderAttributionInput = attribution.kind === 'operator_supplied'
        ? { kind: 'operator_supplied' }
        : { kind: 'quote', quote: attribution.quote }
      return [field, value]
    })) as Record<ChannelOrderField, ChannelOrderAttributionInput>
    const draft = buildChannelOrderDraft({
      sourceLabel,
      message,
      channel,
      customer,
      sku: selectedSku,
      quantity: Number(quantity),
      payment,
      catalogSkus: items.map((item) => item.sku),
      attributions: normalizedAttributions,
    })
    setReviewedDraft(draft)
    if (!channelOrderDraftIsReady(draft)) {
      const blockedField = channelOrderFields.find((field) => (
        draft.blockers.some((blocker) => blocker.startsWith(`${field}_`))
      ))
      if (blockedField) setMappingField(blockedField)
    }
  }

  function useReviewedDraft() {
    if (!reviewedDraft || !channelOrderDraftIsReady(reviewedDraft)) return
    onUse(reviewedDraft)
    setSourceLabel('')
    setMessage('')
    setCustomer('')
    setQuantity('1')
    setAttributions(emptyChannelAttributions())
    setMappingField('customer')
    setReviewedDraft(null)
    onAcceptedFocus()
  }

  return <section className="channel-intake-panel">
    <div className="channel-intake-heading"><span className="core-eyebrow">Human-mapped intake</span><h3>Start from a channel message</h3><p>Use one approved or synthetic message, not a full conversation. Map one exact excerpt; nothing is sent, and AI is not connected.</p></div>
    <form className="core-form channel-intake-form" onSubmit={reviewMessage}>
      <div className="form-row">
        <label>Message reference<input disabled={disabled} maxLength={120} onChange={(event) => { setSourceLabel(event.target.value); invalidateReview() }} placeholder="Message ID or approved sample" required value={sourceLabel} /></label>
        <label>Channel<select disabled={disabled} onChange={(event) => { setChannel(event.target.value); invalidateReview() }} value={channel}>{channelOrderChannels.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
      </div>
      <label>Single message<textarea disabled={disabled} maxLength={CHANNEL_ORDER_MESSAGE_MAX} onChange={(event) => { setMessage(event.target.value); invalidateReview() }} placeholder="Paste only the message needed to prepare this order." required value={message} /></label>
      <details className="channel-intake-disclosure">
        <summary><span>Map order details</span><small>4 fields · exact evidence</small></summary>
        <nav aria-label="Message field mapping" className="channel-field-nav">
          {channelOrderFields.map((field) => (
            <button
              aria-current={mappingField === field ? 'step' : undefined}
              className={attributionIsComplete(field) ? 'is-complete' : ''}
              key={field}
              onClick={() => setMappingField(field)}
              type="button"
            >
              {channelFieldLabels[field]}
            </button>
          ))}
        </nav>
        <div className="channel-mapping-list">
          {mappingField === 'customer' ? <div className="channel-mapping-row">
            <label>Customer reference<input disabled={disabled} maxLength={80} onChange={(event) => { setCustomer(event.target.value); invalidateReview() }} placeholder="Name or internal reference" required value={customer} /></label>
            <ChannelAttributionControl attribution={attributions.customer} disabled={disabled} field="customer" onChange={updateAttribution} />
          </div> : null}
          {mappingField === 'sku' ? <div className="channel-mapping-row">
            <label>Catalog item<select disabled={disabled} onChange={(event) => { setSku(event.target.value); invalidateReview() }} value={selectedSku}>{items.map((item) => <option key={item.sku} value={item.sku}>{item.name} / {item.sku}</option>)}</select></label>
            <ChannelAttributionControl attribution={attributions.sku} disabled={disabled} field="sku" onChange={updateAttribution} />
          </div> : null}
          {mappingField === 'quantity' ? <div className="channel-mapping-row">
            <label>Quantity<input disabled={disabled} max="9999" min="1" onChange={(event) => { setQuantity(event.target.value); invalidateReview() }} required step="1" type="number" value={quantity} /></label>
            <ChannelAttributionControl attribution={attributions.quantity} disabled={disabled} field="quantity" onChange={updateAttribution} />
          </div> : null}
          {mappingField === 'payment' ? <div className="channel-mapping-row">
            <label>Payment intent<select disabled={disabled} onChange={(event) => { setPayment(event.target.value); invalidateReview() }} value={payment}>{channelOrderPayments.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
            <ChannelAttributionControl attribution={attributions.payment} disabled={disabled} field="payment" onChange={updateAttribution} />
          </div> : null}
        </div>
        <div className="channel-mapping-actions">
          {previousMappingField ? <button className="text-link" onClick={() => setMappingField(previousMappingField)} type="button">Back</button> : <span />}
          {nextMappingField
            ? <button className="core-button compact" onClick={() => setMappingField(nextMappingField)} type="button">Next: {channelFieldLabels[nextMappingField]}</button>
            : <button className="core-button primary compact" disabled={disabled} type="submit">Review mapping</button>}
        </div>
      </details>
    </form>
    {reviewedDraft ? <div aria-live="polite" className={`channel-draft-result ${channelOrderDraftIsReady(reviewedDraft) ? 'ready' : 'review'}`}>
      <div><span className="core-eyebrow">Ephemeral draft</span><strong>{channelOrderDraftIsReady(reviewedDraft) ? 'Ready for accountable confirmation' : 'Needs review'}</strong></div>
      {channelOrderDraftIsReady(reviewedDraft) ? <>
        <p>{reviewedDraft.sourceRecordId} / {reviewedDraft.provenance.filter((entry) => entry.kind === 'quote').length} exact source mappings</p>
        <button className="core-button primary compact" disabled={disabled} onClick={useReviewedDraft} type="button">Use reviewed draft</button>
      </> : <ul>{reviewedDraft.blockers.slice(0, 4).map((blocker) => <li key={blocker}>{channelDraftBlockerLabel(blocker)}</li>)}</ul>}
      <small>The full message is not part of the order record.</small>
    </div> : null}
  </section>
}

function ChannelAttributionControl({ attribution, disabled, field, onChange }: {
  attribution: ChannelAttributionDraft
  disabled: boolean
  field: ChannelOrderField
  onChange: (field: ChannelOrderField, patch: Partial<ChannelAttributionDraft>) => void
}) {
  return <div className="channel-attribution">
    <label className="channel-operator-check"><input aria-label={`${channelFieldLabels[field]} is operator supplied`} checked={attribution.kind === 'operator_supplied'} disabled={disabled} onChange={(event) => onChange(field, { kind: event.target.checked ? 'operator_supplied' : 'quote' })} type="checkbox" /><span>Operator supplied</span></label>
    {attribution.kind === 'quote' ? <label>Exact words<input aria-label={`${channelFieldLabels[field]} exact source words`} disabled={disabled} maxLength={CHANNEL_ORDER_QUOTE_MAX} onChange={(event) => onChange(field, { quote: event.target.value })} placeholder="Copy a short, unique excerpt" required value={attribution.quote} /></label> : <small>Human-entered; no source quote claimed.</small>}
  </div>
}

function localCommerceOrderDraftScope(workspaceId?: string) {
  return workspaceId ? `managed:${workspaceId}` : 'local'
}

function localCommerceOrderDraftStorageKey(scope: string) {
  return `${SHOP_ORDER_DRAFT_RESET_PREFIX}${encodeURIComponent(scope)}`
}

function localCommerceOrderDraftCatalogState(draft: CommerceOrderDraft, catalog: CommerceItem[]) {
  const currentBySku = new Map(catalog.map((item) => [item.sku, item]))
  const missingSkus: string[] = []
  const insufficientSkus: string[] = []
  const changedSkus: string[] = []
  for (const line of draft.lines) {
    const item = currentBySku.get(line.sku)
    if (!item) {
      missingSkus.push(line.sku)
      continue
    }
    if (item.onHand < line.quantity) insufficientSkus.push(line.sku)
    if (item.price !== line.unitPriceMmk || item.onHand !== line.availableAtSave) changedSkus.push(line.sku)
  }
  return {
    current: missingSkus.length === 0 && insufficientSkus.length === 0 && changedSkus.length === 0,
    canRebind: missingSkus.length === 0 && insufficientSkus.length === 0,
  }
}

function buildCommerceOrderRecoveryInput(
  fields: {
    customer: string
    channel: string
    payment: string
    fulfilment: '' | 'pickup' | 'delivery'
    fulfilmentReference: string
    promisedAt: string
    lines: Array<{ sku: string; quantity: number }>
  },
  catalog: CommerceItem[],
  baseline: CommerceOrderDraft | null,
): CommerceOrderDraftInput | null {
  const lines = fields.lines.map((line) => {
    const retained = baseline?.lines.find((candidate) => (
      candidate.sku === line.sku && candidate.quantity === line.quantity
    ))
    const item = catalog.find((candidate) => candidate.sku === line.sku)
    if (!retained && !item) return null
    return {
      sku: line.sku,
      quantity: line.quantity,
      unitPriceMmk: retained?.unitPriceMmk ?? item?.price ?? 0,
      availableAtSave: retained?.availableAtSave ?? item?.onHand ?? 0,
    }
  })
  if (lines.some((line) => line === null)) return null
  const promisedAt = fields.promisedAt ? new Date(fields.promisedAt) : null
  return {
    customer: fields.customer.trim(),
    channel: fields.channel as CommerceOrderDraftInput['channel'],
    payment: fields.payment as CommerceOrderDraftInput['payment'],
    fulfilment: fields.fulfilment,
    fulfilmentReference: fields.fulfilmentReference.trim(),
    promisedAt: promisedAt && !Number.isNaN(promisedAt.getTime()) ? promisedAt.toISOString() : '',
    lines: lines as CommerceOrderDraftInput['lines'],
  }
}

function CommercePage({ ecommerceNavigationDraft, managedIdentity, requestedRequestId, requestedSource, tab }: {
  ecommerceNavigationDraft: EcommerceShopDraft | null
  managedIdentity: ManagedIdentity | null
  requestedRequestId: string | null
  requestedSource: string | null
  tab: CommerceTab
}) {
  const navigate = useNavigate()
  const commerceLocation = useLocation()
  const purchaseOrderClock = useMinuteClock()
  const [commerce, mutateCommerce, commerceStorageError, workspaceMode, managedVersion, managedWorkspaceId, commerceCanWrite] = useCommerceWorkspace(managedIdentity)
  const orderDraftScope = localCommerceOrderDraftScope(managedIdentity?.workspaceId)
  const [actions, setActions] = useStoredState<AccountableAction[]>(ACTION_KEY, [], normalizeActions)
  const [pendingAction, setPendingAction] = useState<PendingAccountableAction | null>(null)
  const [sku, setSku] = useState(commerce.items[0]?.sku ?? '')
  const [quantity, setQuantity] = useState(1)
  const [extraOrderLines, setExtraOrderLines] = useState<Array<{ sku: string; quantity: number }>>([])
  const [customer, setCustomer] = useState('')
  const [channel, setChannel] = useState('Messenger')
  const [payment, setPayment] = useState('')
  const [fulfilment, setFulfilment] = useState<'' | 'pickup' | 'delivery'>('')
  const [fulfilmentReference, setFulfilmentReference] = useState('')
  const [promisedAt, setPromisedAt] = useState('')
  const [preparedChannelDraft, setPreparedChannelDraft] = useState<ChannelOrderDraft | null>(null)
  const [preparedEcommerceDraft, setPreparedEcommerceDraft] = useState<EcommerceShopDraft | null>(null)
  const [orderEntryMode, setOrderEntryMode] = useState<'manual' | 'message' | 'online'>('manual')
  const [orderDraftRead, setOrderDraftRead] = useState<CommerceOrderDraftReadResult>({ status: 'empty', draft: null, error: '' })
  const [orderDraftActive, setOrderDraftActive] = useState(false)
  const [resumedOrderDraft, setResumedOrderDraft] = useState<CommerceOrderDraft | null>(null)
  const [orderDraftIssue, setOrderDraftIssue] = useState('')
  const [orderDraftSaving, setOrderDraftSaving] = useState(false)
  const [orderDraftConflict, setOrderDraftConflict] = useState(false)
  const [orderDraftInitializedScope, setOrderDraftInitializedScope] = useState('')
  const orderDraftInitialized = orderDraftInitializedScope === orderDraftScope
  const orderComposerRef = useRef<HTMLDialogElement>(null)
  const orderComposerHeadingRef = useRef<HTMLHeadingElement>(null)
  const orderComposerTriggerRef = useRef<HTMLButtonElement>(null)
  const orderReviewRef = useRef<HTMLButtonElement>(null)
  const orderPromiseRef = useRef<HTMLInputElement>(null)
  const orderOptionsRef = useRef<HTMLDetailsElement>(null)
  const orderPaymentRef = useRef<HTMLSelectElement>(null)
  const catalogEditTriggerRefs = useRef(new Map<string, HTMLButtonElement>())
  const catalogEditEditorRef = useRef<HTMLFormElement>(null)
  const purchaseOrderTriggerRefs = useRef(new Map<string, HTMLButtonElement>())
  const purchaseOrderEditorRef = useRef<HTMLFormElement>(null)
  const purchaseOrderHistoryRef = useRef<HTMLDetailsElement>(null)
  const stockCountTriggerRef = useRef<HTMLButtonElement>(null)
  const stockCountEditorRef = useRef<HTMLFormElement>(null)
  const returnTriggerRefs = useRef(new Map<string, HTMLButtonElement>())
  const returnEditorRef = useRef<HTMLFormElement>(null)
  const ecommerceInboxTargetRef = useRef<HTMLButtonElement>(null)
  const preparedChannelRef = useRef<HTMLDivElement>(null)
  const consumedEcommerceDraftId = useRef('')
  const consumedEcommerceInboxSource = useRef('')
  const orderDraftRevisionRef = useRef(orderDraftRead.draft?.revision ?? 0)
  const orderDraftSaveQueueRef = useRef(Promise.resolve())
  const orderDraftCatalogRef = useRef(commerce.items)
  const orderDraftScopeRef = useRef(orderDraftScope)
  const orderDraftOperationEpochRef = useRef(0)
  const orderDraftResetEpochRef = useRef(0)
  const [actionTrigger, setActionTrigger] = useState<HTMLElement | null>(null)
  const [notice, setNotice] = useState('')
  const [catalogDraft, setCatalogDraft] = useState({ sku: '', name: '', onHand: '', reorderAt: '', price: '', reason: '', evidenceReference: '' })
  const [itemDraft, setItemDraft] = useState({ sku: '', name: '', onHand: '', reorderAt: '', price: '' })
  const [catalogEditDraft, setCatalogEditDraft] = useState<CatalogItemEditDraft | null>(null)
  const [purchaseOrderDraft, setPurchaseOrderDraft] = useState<PurchaseOrderDraft | null>(null)
  const [stockCountDraft, setStockCountDraft] = useState<StockCountDraft | null>(null)
  const [returnDraft, setReturnDraft] = useState<CommerceReturnDraft | null>(null)
  const [catalogBusy, setCatalogBusy] = useState(false)
  const [catalogError, setCatalogError] = useState('')
  const selectedSku = commerce.items.some((item) => item.sku === sku) || (resumedOrderDraft && sku)
    ? sku
    : commerce.items[0]?.sku ?? ''
  const selected = commerce.items.find((item) => item.sku === selectedSku)
  const manualOrderLineDrafts = [{ sku: selectedSku, quantity }, ...extraOrderLines]
  const manualOrderLineItems = manualOrderLineDrafts.map((line) => ({
    ...line,
    item: commerce.items.find((item) => item.sku === line.sku),
  }))
  const manualOrderQuantity = manualOrderLineDrafts.reduce((total, line) => total + Math.max(line.quantity, 0), 0)
  const manualOrderTotal = manualOrderLineItems.reduce((total, line) => total + (line.item?.price ?? 0) * Math.max(line.quantity, 0), 0)
  const orderDraftHasMeaningfulFields = Boolean(customer.trim()
    || channel !== 'Messenger'
    || payment
    || fulfilment
    || fulfilmentReference.trim()
    || promisedAt
    || extraOrderLines.length
    || quantity !== 1
    || selectedSku !== (commerce.items[0]?.sku ?? ''))
  const orderDraftFieldKey = JSON.stringify({
    customer,
    channel,
    payment,
    fulfilment,
    fulfilmentReference,
    promisedAt,
    lines: manualOrderLineDrafts,
  })
  const currentOrderRecoveryInput = buildCommerceOrderRecoveryInput(
    { customer, channel, payment, fulfilment, fulfilmentReference, promisedAt, lines: manualOrderLineDrafts },
    commerce.items,
    null,
  )
  const resumedOrderLinesMatch = Boolean(resumedOrderDraft
    && resumedOrderDraft.lines.length === manualOrderLineDrafts.length
    && resumedOrderDraft.lines.every((line, index) => (
      line.sku === manualOrderLineDrafts[index]?.sku
      && line.quantity === manualOrderLineDrafts[index]?.quantity
    )))
  const resumedOrderCatalogState = resumedOrderDraft
    ? localCommerceOrderDraftCatalogState(resumedOrderDraft, commerce.items)
    : null
  const resumedOrderNeedsReview = Boolean(orderDraftActive
    && resumedOrderDraft
    && (!resumedOrderLinesMatch || !resumedOrderCatalogState?.current))
  const resumedOrderCanRebind = Boolean(currentOrderRecoveryInput
    && currentOrderRecoveryInput.lines.every((line) => line.availableAtSave >= line.quantity))
  const legacyCloseNeedsMigration = commerce.closes.some((close) => !close.orderIds || !close.businessDate)
  const closePreview = commerceCloseExpectation(commerce, new Date().toISOString())
  const closePreviewOrderIds = new Set(closePreview?.orderIds ?? [])
  const closableOrders = commerce.orders.filter((order) => closePreviewOrderIds.has(order.id))
  const reconciledValue = closePreview?.total ?? 0
  const lowStock = commerce.items.filter((item) => item.onHand <= item.reorderAt)
  const stockRows = commerce.items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftNeedsAttention = left.item.onHand <= left.item.reorderAt
      const rightNeedsAttention = right.item.onHand <= right.item.reorderAt
      if (leftNeedsAttention !== rightNeedsAttention) return leftNeedsAttention ? -1 : 1
      if (!leftNeedsAttention) return left.index - right.index
      const leftShortage = left.item.reorderAt - left.item.onHand
      const rightShortage = right.item.reorderAt - right.item.onHand
      return rightShortage - leftShortage || left.index - right.index
    })
  const openOrders = commerce.orders.filter((order) => order.status !== 'completed' && order.status !== 'cancelled')
  const paymentReview = commerce.orders.filter((order) => order.refundStatus === 'due' || (order.status !== 'cancelled' && order.paymentStatus === 'pending'))
  const actionOrders = commerce.orders.filter(commerceOrderNeedsAction).sort(compareCommerceOrderPromise)
  const actionOrderIds = new Set(actionOrders.map((order) => order.id))
  const closedOrders = commerce.orders.filter((order) => !actionOrderIds.has(order.id))
  const latestClose = commerce.closes.find((close) => close.operator)
  const latestCloseDownload = useMemo(() => {
    if (!latestClose) return null
    const artifact = commerceDailyCloseExport(commerce, latestClose.id)
    if (!artifact) return null
    return {
      filename: `supermega-shop-close-${artifact.businessDate}-${artifact.digest.slice(7, 15)}.csv`,
      href: `data:text/csv;charset=utf-8,${encodeURIComponent(`\uFEFF${commerceDailyCloseCsv(artifact)}`)}`,
    }
  }, [commerce, latestClose])
  const importedWebsiteOrderIds = commerce.orders.flatMap((order) => order.sourceRecordId ? [order.sourceRecordId] : [])
  const websiteIntakes = commerceWebsiteIntakes(commerce)
  const localWebsiteIntake = managedIdentity ? null : readWebsiteEcommerceHandoff()
  const legacyWebsiteWorkWaiting = managedIdentity
    ? websiteIntakes.some((intake) => intake.status === 'pending_confirmation')
    : Boolean(localWebsiteIntake && (!localWebsiteIntake.order || !importedWebsiteOrderIds.includes(localWebsiteIntake.order.id)))
  const storefrontRequests = commerceStorefrontRequests(commerce)
  const pendingStorefrontRequests = storefrontRequests.filter((request) => (
    !commerce.orders.some((order) => order.sourceRecordId === request.id)
  ))
  const requestedStorefrontRequestIsWaiting = Boolean(
    requestedRequestId
    && pendingStorefrontRequests.some((request) => request.id === requestedRequestId),
  )
  const purchaseOrderRows = commercePurchaseOrders(commerce)
    .map((purchaseOrder) => ({
      purchaseOrder,
      progress: commercePurchaseOrderProgress(commerce, purchaseOrder),
      item: commerce.items.find((item) => item.sku === purchaseOrder.sku),
    }))
    .sort(compareCommercePurchaseOrderAttention)
  const activePurchaseOrderBySku = new Map(
    purchaseOrderRows
      .filter(({ progress }) => progress.status === 'open' || progress.status === 'partially_received')
      .map((row) => [row.purchaseOrder.sku, row]),
  )
  const purchaseOrderDraftOrder = purchaseOrderDraft?.mode === 'receive'
    ? purchaseOrderRows.find(({ purchaseOrder }) => purchaseOrder.id === purchaseOrderDraft.purchaseOrderId)
    : undefined
  const purchaseOrderDraftItem = purchaseOrderDraft?.mode === 'create'
    ? commerce.items.find((item) => item.sku === purchaseOrderDraft.sku)
    : purchaseOrderDraftOrder?.item
  const purchaseOrderQuantityText = purchaseOrderDraft?.quantity.trim() ?? ''
  const purchaseOrderQuantity = /^\d+$/.test(purchaseOrderQuantityText)
    ? Number(purchaseOrderQuantityText)
    : Number.NaN
  const purchaseOrderQuantityLimit = purchaseOrderDraft?.mode === 'receive'
    ? Math.min(
        purchaseOrderDraftOrder?.progress.remaining ?? 0,
        purchaseOrderDraftItem ? Number.MAX_SAFE_INTEGER - purchaseOrderDraftItem.onHand : 0,
      )
    : Number.MAX_SAFE_INTEGER
  const purchaseOrderQuantityResult = purchaseOrderDraftItem
    && Number.isSafeInteger(purchaseOrderQuantity)
    && purchaseOrderQuantity > 0
    && purchaseOrderQuantity <= purchaseOrderQuantityLimit
    ? purchaseOrderQuantity
    : null
  const purchaseOrderExpectedAtTime = purchaseOrderDraft?.mode === 'create'
    ? new Date(purchaseOrderDraft.expectedAt).getTime()
    : Number.NaN
  const purchaseOrderExpectedAtResult = Number.isFinite(purchaseOrderExpectedAtTime)
    && purchaseOrderExpectedAtTime > purchaseOrderClock
    ? new Date(purchaseOrderExpectedAtTime).toISOString()
    : null
  const catalogEditItem = catalogEditDraft
    ? commerce.items.find((item) => item.sku === catalogEditDraft.sku)
    : undefined
  const catalogEditPriceText = catalogEditDraft?.price.trim() ?? ''
  const catalogEditPrice = /^[0-9]+$/.test(catalogEditPriceText)
    ? Number(catalogEditPriceText)
    : Number.NaN
  const catalogEditPriceResult = Number.isSafeInteger(catalogEditPrice) && catalogEditPrice >= 1
    ? catalogEditPrice
    : null
  const catalogEditReorderText = catalogEditDraft?.reorderAt.trim() ?? ''
  const catalogEditReorder = /^[0-9]+$/.test(catalogEditReorderText)
    ? Number(catalogEditReorderText)
    : Number.NaN
  const catalogEditReorderResult = Number.isSafeInteger(catalogEditReorder) && catalogEditReorder >= 0
    ? catalogEditReorder
    : null
  const catalogEditStale = Boolean(catalogEditDraft && (!catalogEditItem
    || catalogEditItem.price !== catalogEditDraft.expectedPrice
    || catalogEditItem.reorderAt !== catalogEditDraft.expectedReorderAt))
  const catalogEditChanged = Boolean(catalogEditDraft
    && catalogEditPriceResult !== null
    && catalogEditReorderResult !== null
    && (catalogEditPriceResult !== catalogEditDraft.expectedPrice
      || catalogEditReorderResult !== catalogEditDraft.expectedReorderAt))
  const stockCountItem = stockCountDraft
    ? commerce.items.find((item) => item.sku === stockCountDraft.sku)
    : undefined
  const stockCountQuantityText = stockCountDraft?.quantity.trim() ?? ''
  const stockCountQuantity = /^[0-9]+$/.test(stockCountQuantityText)
    ? Number(stockCountQuantityText)
    : Number.NaN
  const stockCountQuantityResult = stockCountItem
    && Number.isSafeInteger(stockCountQuantity)
    && stockCountQuantity >= 0
    ? stockCountQuantity
    : null
  const returnDraftOrder = returnDraft
    ? commerce.orders.find((order) => order.id === returnDraft.orderId)
    : undefined
  const returnDraftLines = returnDraftOrder
    ? commerceOrderReturnLines(returnDraftOrder).map((line) => {
        const returned = (returnDraftOrder.returns ?? [])
          .filter((record) => record.sku === line.sku)
          .reduce((sum, record) => sum + record.quantity, 0)
        return { ...line, returned, remaining: line.quantity - returned }
      }).filter((line) => line.remaining > 0)
    : []
  const selectedReturnLine = returnDraftLines.find((line) => line.sku === returnDraft?.sku)
  const returnQuantityText = returnDraft?.quantity.trim() ?? ''
  const returnQuantity = /^[0-9]+$/.test(returnQuantityText)
    ? Number(returnQuantityText)
    : Number.NaN
  const returnQuantityResult = selectedReturnLine
    && Number.isSafeInteger(returnQuantity)
    && returnQuantity > 0
    && returnQuantity <= selectedReturnLine.remaining
    ? returnQuantity
    : null

  useEffect(() => {
    if (tab !== 'inventory' || commerceLocation.hash !== '#purchase-orders') return
    const frame = window.requestAnimationFrame(() => {
      const history = purchaseOrderHistoryRef.current
      if (history) history.open = true
      history?.scrollIntoView({ block: 'center' })
      history?.querySelector('summary')?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [commerceLocation.hash, tab])

  useEffect(() => {
    let current = true
    const scopeChanged = orderDraftScopeRef.current !== orderDraftScope
    orderDraftOperationEpochRef.current += 1
    orderDraftScopeRef.current = orderDraftScope
    if (scopeChanged) {
      queueMicrotask(() => {
        if (!current || orderDraftScopeRef.current !== orderDraftScope) return
        orderComposerRef.current?.close()
        setOrderDraftActive(false)
        setResumedOrderDraft(null)
        setOrderDraftConflict(false)
        setSku('')
        setQuantity(1)
        setExtraOrderLines([])
        setCustomer('')
        setChannel('Messenger')
        setPayment('')
        setFulfilment('')
        setFulfilmentReference('')
        setPromisedAt('')
        setPreparedChannelDraft(null)
        setPreparedEcommerceDraft(null)
        setOrderEntryMode('manual')
      })
    }
    void import('./commerce-order-draft')
      .then(({ commerceOrderDraftResetEpoch, readCommerceOrderDraft }) => {
        if (!current || orderDraftScopeRef.current !== orderDraftScope) return
        const latest = readCommerceOrderDraft(orderDraftScope)
        orderDraftResetEpochRef.current = commerceOrderDraftResetEpoch()
        orderDraftRevisionRef.current = latest.draft?.revision ?? 0
        setOrderDraftRead(latest)
        setOrderDraftIssue(latest.error)
        setOrderDraftInitializedScope(orderDraftScope)
      })
      .catch(() => {
        if (!current || orderDraftScopeRef.current !== orderDraftScope) return
        const recoveryError = 'Order recovery could not load. Shop records remain available, but new unfinished orders cannot be saved safely.'
        setOrderDraftRead({
          status: 'unavailable',
          draft: null,
          error: recoveryError,
        })
        setOrderDraftIssue(recoveryError)
        setOrderDraftInitializedScope(orderDraftScope)
      })
    return () => { current = false }
  }, [orderDraftScope])

  useEffect(() => {
    orderDraftCatalogRef.current = commerce.items
  }, [commerce.items])

  useEffect(() => {
    const storageKey = localCommerceOrderDraftStorageKey(orderDraftScope)
    function refreshOrderDraft(event: StorageEvent) {
      if (event.key !== storageKey
        && event.key !== SHOP_ORDER_DRAFT_RESET_EPOCH_KEY
        && event.key !== null) return
      orderDraftOperationEpochRef.current += 1
      void import('./commerce-order-draft').then(({ commerceOrderDraftResetEpoch, readCommerceOrderDraft }) => {
        if (orderDraftScopeRef.current !== orderDraftScope) return
        const latest = readCommerceOrderDraft(orderDraftScope)
        orderDraftResetEpochRef.current = commerceOrderDraftResetEpoch()
        orderDraftRevisionRef.current = latest.draft?.revision ?? 0
        setOrderDraftRead(latest)
        if (orderDraftActive) {
          setOrderDraftConflict(true)
          setOrderDraftIssue('The unfinished order changed in another tab. Current fields were kept; close this form to review the latest saved draft.')
          return
        }
        setOrderDraftIssue(latest.error)
      }).catch(() => {
        setOrderDraftIssue('The changed order draft could not be read. Current fields were kept.')
      })
    }
    window.addEventListener('storage', refreshOrderDraft)
    return () => window.removeEventListener('storage', refreshOrderDraft)
  }, [orderDraftActive, orderDraftScope])

  useEffect(() => {
    if (!orderDraftActive
      || !orderDraftInitialized
      || orderEntryMode !== 'manual'
      || preparedChannelDraft
      || preparedEcommerceDraft
      || pendingAction
      || !commerceCanWrite
      || orderDraftConflict
      || orderDraftRead.status === 'invalid'
      || orderDraftRead.status === 'unavailable') return
    const operationEpochAtSchedule = orderDraftOperationEpochRef.current
    const resetEpochAtSchedule = orderDraftResetEpochRef.current
    const recoveryFields = JSON.parse(orderDraftFieldKey) as {
      customer: string
      channel: string
      payment: string
      fulfilment: '' | 'pickup' | 'delivery'
      fulfilmentReference: string
      promisedAt: string
      lines: Array<{ sku: string; quantity: number }>
    }
    const timer = window.setTimeout(() => {
      const scopeAtSave = orderDraftScope
      const operation = async () => {
        if (orderDraftScopeRef.current !== scopeAtSave
          || orderDraftOperationEpochRef.current !== operationEpochAtSchedule) return
        setOrderDraftSaving(true)
        try {
          const expectedRevision = orderDraftRevisionRef.current
          if (!orderDraftHasMeaningfulFields) {
            if (expectedRevision > 0) {
              const { discardCommerceOrderDraft } = await import('./commerce-order-draft')
              if (orderDraftScopeRef.current !== scopeAtSave
                || orderDraftOperationEpochRef.current !== operationEpochAtSchedule) return
              await discardCommerceOrderDraft(scopeAtSave, expectedRevision, {
                expectedResetEpoch: resetEpochAtSchedule,
              })
            }
            if (orderDraftScopeRef.current !== scopeAtSave
              || orderDraftOperationEpochRef.current !== operationEpochAtSchedule) return
            orderDraftRevisionRef.current = 0
            setOrderDraftRead({ status: 'empty', draft: null, error: '' })
            setResumedOrderDraft(null)
            setOrderDraftIssue('')
            return
          }
          const input = buildCommerceOrderRecoveryInput(
            recoveryFields,
            orderDraftCatalogRef.current,
            resumedOrderDraft,
          )
          if (!input) {
            setOrderDraftIssue('Choose current Shop items before this unfinished order can be saved.')
            return
          }
          const { saveCommerceOrderDraft } = await import('./commerce-order-draft')
          if (orderDraftScopeRef.current !== scopeAtSave
            || orderDraftOperationEpochRef.current !== operationEpochAtSchedule) return
          const saved = await saveCommerceOrderDraft(
            input,
            expectedRevision,
            scopeAtSave,
            { expectedResetEpoch: resetEpochAtSchedule },
          )
          if (orderDraftScopeRef.current !== scopeAtSave
            || orderDraftOperationEpochRef.current !== operationEpochAtSchedule) return
          orderDraftRevisionRef.current = saved.revision
          setOrderDraftRead({ status: 'ready', draft: saved, error: '' })
          setOrderDraftIssue('')
        } catch (error) {
          if (orderDraftScopeRef.current === scopeAtSave
            && orderDraftOperationEpochRef.current === operationEpochAtSchedule) {
            setOrderDraftIssue(error instanceof Error ? error.message : 'The unfinished order could not be saved.')
          }
        } finally {
          if (orderDraftScopeRef.current === scopeAtSave) setOrderDraftSaving(false)
        }
      }
      orderDraftSaveQueueRef.current = orderDraftSaveQueueRef.current.then(operation, operation)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [
    commerceCanWrite,
    orderDraftActive,
    orderDraftConflict,
    orderDraftFieldKey,
    orderDraftHasMeaningfulFields,
    orderDraftInitialized,
    orderDraftRead.status,
    orderDraftScope,
    orderEntryMode,
    pendingAction,
    preparedChannelDraft,
    preparedEcommerceDraft,
    resumedOrderDraft,
  ])

  useEffect(() => {
    if (!ecommerceNavigationDraft
      || managedIdentity && workspaceMode !== 'managed-ready'
      || consumedEcommerceDraftId.current === ecommerceNavigationDraft.id) return
    let current = true
    void import('../products/ecommerce/ecommerce-shop-handoff')
      .then(({ ecommerceShopDraftLines, ecommerceShopDraftMatchesCatalog, ecommerceShopDraftPayment }) => {
        if (!current) return
        const navigationDraftId = ecommerceNavigationDraft.id
        if (!ecommerceShopDraftMatchesCatalog(ecommerceNavigationDraft, commerce.items)) {
          consumedEcommerceDraftId.current = navigationDraftId
          if (preparedEcommerceDraft) {
            setFulfilmentReference('')
          }
          setPreparedEcommerceDraft(null)
          navigate({ pathname: '/shop/', search: '?tab=orders' }, { replace: true, state: null })
          setNotice('The Ecommerce request no longer matches the current Shop catalog. Nothing was prepared.')
          return
        }
        setPreparedChannelDraft(null)
        setPreparedEcommerceDraft(ecommerceNavigationDraft)
        setCustomer(ecommerceNavigationDraft.customerReference)
        setChannel('Ecommerce')
        const draftLines = ecommerceShopDraftLines(ecommerceNavigationDraft)
        setSku(draftLines[0].sku)
        setQuantity(draftLines[0].quantity)
        setExtraOrderLines(draftLines.slice(1).map((line) => ({ sku: line.sku, quantity: line.quantity })))
        setPayment(ecommerceShopDraftPayment(ecommerceNavigationDraft))
        setFulfilment(ecommerceNavigationDraft.fulfilment)
        setFulfilmentReference(ecommerceNavigationDraft.sourceRequestId)
        setPromisedAt(defaultOrderPromiseInput())
        setOrderEntryMode('manual')
        setOrderDraftActive(true)
        setResumedOrderDraft(null)
        setOrderDraftConflict(false)
        setNotice(`${ecommerceNavigationDraft.id} is ready for Shop review. Confirm the quote, promise, and payment before the accountable order gate.`)
        requestAnimationFrame(() => {
          const dialog = orderComposerRef.current
          if (dialog && !dialog.open) dialog.showModal()
          orderPaymentRef.current?.focus({ preventScroll: true })
        })
      })
      .catch(() => {
        if (current) setNotice('The Ecommerce request guard could not load. Nothing was prepared.')
      })
    return () => { current = false }
  }, [commerce.items, ecommerceNavigationDraft, managedIdentity, navigate, preparedEcommerceDraft, workspaceMode])

  useEffect(() => {
    const sourceKey = requestedRequestId || 'ecommerce-inbox'
    if (requestedSource !== 'ecommerce-inbox'
      || consumedEcommerceInboxSource.current === sourceKey
      || tab !== 'orders'
      || !managedIdentity
      || workspaceMode !== 'managed-ready') return
    consumedEcommerceInboxSource.current = sourceKey
    setOrderEntryMode('online')
    setOrderDraftActive(true)
    setResumedOrderDraft(null)
    setOrderDraftConflict(false)
    setNotice(requestedStorefrontRequestIsWaiting
      ? `${requestedRequestId} is ready for Shop review. Choose Review to prepare the order.`
      : pendingStorefrontRequests.length
        ? `${pendingStorefrontRequests.length} Ecommerce ${pendingStorefrontRequests.length === 1 ? 'request is' : 'requests are'} waiting for Shop review.`
        : 'The Ecommerce inbox is open. No request currently needs Shop review.')
    const focusFrame = requestAnimationFrame(() => {
      const dialog = orderComposerRef.current
      if (dialog && !dialog.open) dialog.showModal()
      if (requestedStorefrontRequestIsWaiting) ecommerceInboxTargetRef.current?.focus()
      else orderComposerHeadingRef.current?.focus()
      navigate('/shop/?tab=orders', { replace: true })
    })
    return () => cancelAnimationFrame(focusFrame)
  }, [managedIdentity, navigate, pendingStorefrontRequests.length, requestedRequestId, requestedSource, requestedStorefrontRequestIsWaiting, tab, workspaceMode])

  async function initializeManagedCatalog(event: FormEvent) {
    event.preventDefault()
    if (!managedIdentity) return
    const skuValue = catalogDraft.sku.trim().toUpperCase()
    const name = catalogDraft.name.trim()
    const onHand = Number(catalogDraft.onHand)
    const reorderAt = Number(catalogDraft.reorderAt)
    const price = Number(catalogDraft.price)
    const reason = catalogDraft.reason.trim()
    const evidenceReference = catalogDraft.evidenceReference.trim()
    if (!skuValue || !name || !reason || !evidenceReference || ![onHand, reorderAt, price].every(Number.isSafeInteger) || onHand < 0 || reorderAt < 0 || price < 1) {
      setCatalogError('Enter a valid item, whole-number stock boundaries, price, reason, and evidence reference.')
      return
    }
    const proof: CommerceActionProof = {
      actionId: uid('ACT'),
      capturedAt: new Date().toISOString(),
      actor: managedIdentity.userId,
      reason,
      evidenceReference,
    }
    setCatalogBusy(true)
    setCatalogError('')
    try {
      await mutateCommerce('commerce.workspace.initialized', commandUuid(), proof, (current) => current.items.length || current.orders.length || current.movements.length || current.closes.length || commerceWebsiteIntakes(current).length ? null : validateCommerceState({
        ...current,
        items: [{ sku: skuValue, name, onHand, reorderAt, price }],
        catalogBaselines: [createCommerceCatalogBaseline({ sku: skuValue, price, reorderAt }, proof)],
      }))
      setNotice(`Managed catalog initialized with ${skuValue}.`)
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : 'The managed catalog was not initialized.')
    } finally {
      setCatalogBusy(false)
    }
  }

  const effectiveMode = managedIdentity && (workspaceMode === 'local' || managedWorkspaceId !== managedIdentity.workspaceId) ? 'managed-loading' : workspaceMode
  if (managedIdentity && effectiveMode !== 'managed-ready') {
    const unprovisioned = effectiveMode === 'managed-unprovisioned'
    if (unprovisioned) return <section className="core-panel managed-commerce-boundary">
      <div className="panel-head"><div><span className="core-eyebrow">Managed Shop setup</span><h2>Create the real catalog</h2></div><span className="status-pill pending">Not provisioned</span></div>
      <p className="panel-copy">Start with the first real inventory item. No browser demo orders, customers, or stock records are copied into this workspace.</p>
      <form className="core-form compact-form" onSubmit={(formEvent) => void initializeManagedCatalog(formEvent)}>
        <div className="form-row"><label>SKU<input maxLength={80} onChange={(inputEvent) => setCatalogDraft((current) => ({ ...current, sku: inputEvent.target.value }))} placeholder="SKU-001" required value={catalogDraft.sku} /></label><label>Item name<input maxLength={180} onChange={(inputEvent) => setCatalogDraft((current) => ({ ...current, name: inputEvent.target.value }))} placeholder="Real item name" required value={catalogDraft.name} /></label></div>
        <div className="form-row"><label>Opening stock<input min="0" onChange={(inputEvent) => setCatalogDraft((current) => ({ ...current, onHand: inputEvent.target.value }))} required step="1" type="number" value={catalogDraft.onHand} /></label><label>Reorder at<input min="0" onChange={(inputEvent) => setCatalogDraft((current) => ({ ...current, reorderAt: inputEvent.target.value }))} required step="1" type="number" value={catalogDraft.reorderAt} /></label></div>
        <label>Price (MMK)<input min="1" onChange={(inputEvent) => setCatalogDraft((current) => ({ ...current, price: inputEvent.target.value }))} required step="1" type="number" value={catalogDraft.price} /></label>
        <label>Opening balance reason<input maxLength={180} onChange={(inputEvent) => setCatalogDraft((current) => ({ ...current, reason: inputEvent.target.value }))} placeholder="How the opening count was verified" required value={catalogDraft.reason} /></label>
        <label>Evidence reference<input maxLength={180} onChange={(inputEvent) => setCatalogDraft((current) => ({ ...current, evidenceReference: inputEvent.target.value }))} placeholder="Count sheet, stocktake, or source record" required value={catalogDraft.evidenceReference} /></label>
        <div className="form-actions"><Link className="text-link" to="/settings/">Workspace settings</Link><button className="core-button primary" disabled={catalogBusy} type="submit">{catalogBusy ? 'Creating…' : 'Create managed catalog'}</button></div>
        <p className="form-notice" role="status">{catalogError || commerceStorageError || `Authenticated as ${managedIdentity.email}. The tenant API records this initialization.`}</p>
      </form>
    </section>
    return <section className="core-panel managed-commerce-boundary">
      <div className="panel-head"><div><span className="core-eyebrow">Managed Shop</span><h2>{effectiveMode === 'managed-error' ? 'Managed workspace unavailable' : 'Loading authenticated workspace'}</h2></div><span className="status-pill bounded">{effectiveMode === 'managed-error' ? 'Blocked' : 'Checking'}</span></div>
      <p className="panel-copy">{commerceStorageError || 'Shop remains read-only until the authenticated tenant state is confirmed.'}</p>
      <div className="form-actions"><Link className="core-button" to="/settings/">Open workspace settings</Link></div>
    </section>
  }

  const commerceBoundary = <div className="production-mode-banner commerce-mode-banner" data-write={commerceCanWrite ? 'ready' : 'blocked'} role={commerceCanWrite ? 'status' : 'alert'}>
    <span className={`status-pill ${commerceCanWrite ? 'bounded' : 'pending'}`}>{managedIdentity ? 'Managed records' : 'Sample data'}</span>
    <p>{commerceStorageError
      ? `Writes paused: ${commerceStorageError}`
      : !commerceCanWrite
        ? 'Writes paused: this browser could not confirm durable local storage and write locking.'
        : notice || (managedIdentity
          ? `Workspace ${managedIdentity.workspaceId} · revision ${managedVersion ?? 0}. Writes are confirmed by the tenant API.`
          : 'Sample records saved only in this browser. Connect a managed workspace before using shared operational data.')}</p>
    {!commerceCanWrite ? <Link to="/settings/#controls">Open Settings</Link> : null}
  </div>
  const orderNotice = notice || commerceStorageError
  const commerceControlsDisabled = !commerceCanWrite || Boolean(pendingAction)

  function showOrderComposer() {
    const dialog = orderComposerRef.current
    if (dialog && !dialog.open) dialog.showModal()
    requestAnimationFrame(() => orderComposerHeadingRef.current?.focus())
  }

  function resetOrderDraftFields() {
    setSku(commerce.items[0]?.sku ?? '')
    setQuantity(1)
    setExtraOrderLines([])
    setCustomer('')
    setChannel('Messenger')
    setPayment('')
    setFulfilment('')
    setFulfilmentReference('')
    setPromisedAt('')
    setPreparedChannelDraft(null)
    setPreparedEcommerceDraft(null)
    setOrderEntryMode('manual')
  }

  function detachPreparedOrderSources(options: { channel?: boolean; ecommerce?: boolean } = {}) {
    const removeChannel = options.channel ?? true
    const removeEcommerce = options.ecommerce ?? true
    const removed = (removeChannel && Boolean(preparedChannelDraft))
      || (removeEcommerce && Boolean(preparedEcommerceDraft))
    if (removeEcommerce && preparedEcommerceDraft) {
      consumedEcommerceDraftId.current = preparedEcommerceDraft.id
      navigate({ pathname: '/shop/', search: '?tab=orders' }, { replace: true, state: null })
    }
    if (removeChannel) setPreparedChannelDraft(null)
    if (removeEcommerce) setPreparedEcommerceDraft(null)
    if (removed) setFulfilmentReference('')
    return removed
  }

  function openOrderComposer() {
    if (!commerceCanWrite) {
      setNotice('Shop changes are paused. Open Settings before adding an order.')
      return
    }
    if (!orderDraftInitialized) {
      setNotice('Order recovery is still loading. Try again in a moment.')
      return
    }
    if (orderDraftRead.status === 'unavailable') {
      setNotice(orderDraftRead.error || 'Order recovery is unavailable. Open Settings before starting a manual order.')
      return
    }
    if (!promisedAt) setPromisedAt(defaultOrderPromiseInput())
    setOrderDraftActive(true)
    setResumedOrderDraft(null)
    setOrderDraftConflict(false)
    setOrderDraftIssue('')
    showOrderComposer()
  }

  function closeOrderComposer() {
    orderComposerRef.current?.close()
    setOrderDraftActive(false)
    setResumedOrderDraft(null)
    setOrderDraftConflict(false)
    setOrderDraftIssue(orderDraftRead.error)
  }

  function focusNextOrderRequirement() {
    if (!promisedAt) {
      orderPromiseRef.current?.scrollIntoView({ block: 'center' })
      orderPromiseRef.current?.focus({ preventScroll: true })
      return
    }
    if (!payment) {
      if (orderOptionsRef.current) orderOptionsRef.current.open = true
      requestAnimationFrame(() => {
        orderPaymentRef.current?.scrollIntoView({ block: 'center' })
        orderPaymentRef.current?.focus({ preventScroll: true })
      })
    }
  }

  function resumeSavedOrderDraft() {
    const draft = orderDraftRead.status === 'ready' ? orderDraftRead.draft : null
    if (!draft) {
      setOrderDraftIssue(orderDraftRead.error || 'No saved order draft is available to resume.')
      return
    }
    const [firstLine, ...remainingLines] = draft.lines
    if (!firstLine) {
      setOrderDraftIssue('The saved order draft has no item to resume.')
      return
    }
    setCustomer(draft.customer)
    setChannel(draft.channel)
    setPayment(draft.payment)
    setFulfilment(draft.fulfilment)
    setFulfilmentReference(draft.fulfilmentReference)
    setPromisedAt(draft.promisedAt ? localDateTimeInputValue(new Date(draft.promisedAt)) : '')
    setSku(firstLine.sku)
    setQuantity(firstLine.quantity)
    setExtraOrderLines(remainingLines.map((line) => ({ sku: line.sku, quantity: line.quantity })))
    setPreparedChannelDraft(null)
    setPreparedEcommerceDraft(null)
    setOrderEntryMode('manual')
    setResumedOrderDraft(draft)
    setOrderDraftActive(true)
    setOrderDraftConflict(false)
    const catalogState = localCommerceOrderDraftCatalogState(draft, commerce.items)
    setOrderDraftIssue(catalogState.current
      ? 'Unfinished order restored. Source-message and Ecommerce links are never recovered.'
      : 'Shop price or availability changed. Review current Shop values before this order can continue.')
    showOrderComposer()
  }

  async function discardSavedOrderDraft() {
    if (orderDraftConflict) {
      setOrderDraftIssue('The saved draft changed in another tab. Close this form before discarding the latest saved copy.')
      return
    }
    const scopeAtDiscard = orderDraftScope
    const operationEpochAtDiscard = orderDraftOperationEpochRef.current
    const resetEpochAtDiscard = orderDraftResetEpochRef.current
    const discardInvalidDraft = orderDraftRead.status === 'invalid'
    const invalidFingerprintAtDiscard = discardInvalidDraft
      ? orderDraftRead.invalidFingerprint
      : undefined
    setOrderDraftActive(false)
    setOrderDraftSaving(true)
    try {
      await orderDraftSaveQueueRef.current
      if (orderDraftScopeRef.current !== scopeAtDiscard
        || orderDraftOperationEpochRef.current !== operationEpochAtDiscard) {
        throw new Error('The unfinished order changed while discard was waiting. Review the latest saved draft.')
      }
      const expectedRevision = discardInvalidDraft ? undefined : orderDraftRevisionRef.current
      const { discardCommerceOrderDraft } = await import('./commerce-order-draft')
      if (discardInvalidDraft || (expectedRevision ?? 0) > 0) {
        await discardCommerceOrderDraft(scopeAtDiscard, expectedRevision || undefined, {
          expectedResetEpoch: resetEpochAtDiscard,
          expectedInvalidFingerprint: invalidFingerprintAtDiscard,
        })
      }
      if (orderDraftScopeRef.current !== scopeAtDiscard
        || orderDraftOperationEpochRef.current !== operationEpochAtDiscard) {
        throw new Error('The unfinished order changed while discard was being confirmed. Review the latest saved draft.')
      }
      orderDraftOperationEpochRef.current += 1
      orderDraftRevisionRef.current = 0
      setOrderDraftRead({ status: 'empty', draft: null, error: '' })
      setResumedOrderDraft(null)
      setOrderDraftConflict(false)
      setOrderDraftIssue('')
      resetOrderDraftFields()
      orderComposerRef.current?.close()
      setNotice('Unfinished order discarded. No Shop order, stock, or payment record changed.')
    } catch (error) {
      if (orderComposerRef.current?.open) setOrderDraftActive(true)
      setOrderDraftIssue(error instanceof Error ? error.message : 'The unfinished order could not be discarded.')
    } finally {
      setOrderDraftSaving(false)
    }
  }

  async function acceptCurrentOrderDraftCatalog() {
    if (!resumedOrderDraft || !currentOrderRecoveryInput || !resumedOrderCanRebind || orderDraftSaving) return
    const scopeAtRebind = orderDraftScope
    const operationEpochAtRebind = orderDraftOperationEpochRef.current
    const resetEpochAtRebind = orderDraftResetEpochRef.current
    const inputAtRebind = currentOrderRecoveryInput
    setOrderDraftSaving(true)
    try {
      await orderDraftSaveQueueRef.current
      if (orderDraftScopeRef.current !== scopeAtRebind
        || orderDraftOperationEpochRef.current !== operationEpochAtRebind) {
        throw new Error('The unfinished order changed while Shop values were being reviewed. Reload the saved draft.')
      }
      const expectedRevision = orderDraftRevisionRef.current
      const { saveCommerceOrderDraft } = await import('./commerce-order-draft')
      const saved = await saveCommerceOrderDraft(
        inputAtRebind,
        expectedRevision,
        scopeAtRebind,
        { expectedResetEpoch: resetEpochAtRebind },
      )
      if (orderDraftScopeRef.current !== scopeAtRebind
        || orderDraftOperationEpochRef.current !== operationEpochAtRebind) {
        throw new Error('The unfinished order changed while Shop values were being recorded. Reload the saved draft.')
      }
      orderDraftRevisionRef.current = saved.revision
      setOrderDraftRead({ status: 'ready', draft: saved, error: '' })
      setResumedOrderDraft(saved)
      setOrderDraftConflict(false)
      setOrderDraftIssue('Current Shop prices and availability reviewed. The order can continue.')
    } catch (error) {
      setOrderDraftIssue(error instanceof Error ? error.message : 'Current Shop values could not be recorded.')
    } finally {
      setOrderDraftSaving(false)
    }
  }

  function queueAction(
    action: Omit<PendingAccountableAction, 'id' | 'commandId' | 'domain'>,
    returnFocus?: HTMLElement | null,
  ): boolean {
    if (!commerceCanWrite) {
      setNotice('Shop changes are paused because this workspace cannot confirm writes. Reload or open Settings before retrying.')
      return false
    }
    if (pendingAction) {
      setNotice(`Finish or cancel ${pendingAction.id} before reviewing another change.`)
      return false
    }
    const trigger = returnFocus?.isConnected
      ? returnFocus
      : action.kind === 'order_create'
        ? preparedEcommerceDraft && orderReviewRef.current?.isConnected
          ? orderReviewRef.current
          : orderComposerTriggerRef.current
        : document.activeElement instanceof HTMLElement ? document.activeElement : null
    setActionTrigger(trigger)
    if (action.kind === 'order_create' && orderComposerRef.current?.open) orderComposerRef.current.close()
    setPendingAction({ ...action, id: uid('ACT'), commandId: commandUuid(), domain: 'commerce' })
    setNotice('Review the change, accountable operator, and evidence before it is applied.')
    return true
  }

  function queueCatalogItem(event: FormEvent) {
    event.preventDefault()
    const itemSku = itemDraft.sku.trim().toUpperCase()
    const name = itemDraft.name.trim()
    const onHand = Number(itemDraft.onHand)
    const reorderAt = Number(itemDraft.reorderAt)
    const price = Number(itemDraft.price)
    if (!itemSku || !name
      || !Number.isSafeInteger(onHand) || onHand < 0
      || !Number.isSafeInteger(reorderAt) || reorderAt < 0
      || !Number.isSafeInteger(price) || price < 1) {
      setNotice('Enter a SKU, item name, non-negative opening and reorder quantities, and a whole-MMK price.')
      return
    }
    if (commerce.items.some((item) => item.sku === itemSku)) {
      setNotice(`${itemSku} already exists. No catalog item was queued.`)
      return
    }
    const item: CommerceItem = { sku: itemSku, name, onHand, reorderAt, price }
    queueAction({
      kind: 'catalog_item_create',
      subjectId: item.sku,
      summary: `Add ${item.sku} to the catalog`,
      before: 'No catalog item',
      after: `${item.name} · ${item.onHand.toLocaleString()} opening units`,
      apply: async (action) => {
        const proof = commerceActionProof(action)
        await mutateCommerce('commerce.item.created', action.commandId, proof, (current) => registerCommerceItem(current, item, proof))
        setItemDraft({ sku: '', name: '', onHand: '', reorderAt: '', price: '' })
        setSku(item.sku)
      },
    })
  }

  function openCatalogItemEditor(itemSku: string) {
    const item = commerce.items.find((candidate) => candidate.sku === itemSku)
    if (!item) return
    if (stockCountDraft) {
      const selector = stockCountDraft.sku ? '#stock-count-quantity' : '#stock-count-sku'
      requestAnimationFrame(() => stockCountEditorRef.current?.querySelector<HTMLElement>(selector)?.focus())
      setNotice('Finish or cancel the stock count before editing catalog values. Your count draft was preserved.')
      return
    }
    if (purchaseOrderDraft) {
      requestAnimationFrame(() => purchaseOrderEditorRef.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus())
      setNotice('Finish or cancel the stock order before editing catalog values. Your stock-order draft was preserved.')
      return
    }
    const alreadyEditingCurrent = catalogEditDraft?.sku === item.sku
      && catalogEditDraft.expectedPrice === item.price
      && catalogEditDraft.expectedReorderAt === item.reorderAt
    if (alreadyEditingCurrent) {
      requestAnimationFrame(() => catalogEditEditorRef.current?.querySelector<HTMLInputElement>('#catalog-edit-price')?.focus())
      setNotice(`Continue editing ${item.sku} below. Your draft was preserved.`)
      return
    }
    setCatalogEditDraft({
      sku: item.sku,
      expectedPrice: item.price,
      expectedReorderAt: item.reorderAt,
      price: String(item.price),
      reorderAt: String(item.reorderAt),
    })
    setNotice(`Edit only the current price and reorder level for ${item.name}. Stock and prior orders stay unchanged.`)
    requestAnimationFrame(() => catalogEditEditorRef.current?.querySelector<HTMLInputElement>('#catalog-edit-price')?.focus())
  }

  function cancelCatalogItemEditor() {
    const itemSku = catalogEditDraft?.sku
    setCatalogEditDraft(null)
    setNotice('Catalog editing closed. Shop data was not modified.')
    requestAnimationFrame(() => {
      if (itemSku) catalogEditTriggerRefs.current.get(itemSku)?.focus()
    })
  }

  function reviewCatalogItemUpdate(event: FormEvent) {
    event.preventDefault()
    if (!catalogEditDraft || !catalogEditItem
      || catalogEditPriceResult === null || catalogEditReorderResult === null) {
      setNotice('Enter a whole-MMK price of at least 1 and a non-negative whole reorder level.')
      return
    }
    if (catalogEditStale) {
      setNotice('Catalog values changed while this editor was open. Reload current values before review.')
      return
    }
    if (!catalogEditChanged) {
      setNotice('Change the price or reorder level before review. Nothing was queued.')
      return
    }
    const item = catalogEditItem
    const update: CommerceItemUpdate = {
      sku: item.sku,
      expectedPrice: catalogEditDraft.expectedPrice,
      nextPrice: catalogEditPriceResult,
      expectedReorderAt: catalogEditDraft.expectedReorderAt,
      nextReorderAt: catalogEditReorderResult,
    }
    queueAction({
      kind: 'catalog_item_update',
      subjectId: item.sku,
      summary: `Update catalog values for ${item.name}`,
      before: `${item.sku} · ${formatMoney(update.expectedPrice)} · reorder at ${update.expectedReorderAt.toLocaleString()}`,
      after: `${item.sku} · ${formatMoney(update.nextPrice)} · reorder at ${update.nextReorderAt.toLocaleString()} · stock unchanged`,
      apply: async (action) => {
        const proof = commerceActionProof(action)
        let reviewRequired = false
        try {
          await mutateCommerce('commerce.item.updated', action.commandId, proof, (current) => {
            const next = updateCommerceItem(current, update, proof)
            if (!next) reviewRequired = true
            return next
          })
          setCatalogEditDraft((current) => current?.sku === item.sku ? null : current)
        } catch (error) {
          if (reviewRequired || error instanceof ShopReviewRequiredError) {
            setCatalogEditDraft(null)
            requestAnimationFrame(() => catalogEditTriggerRefs.current.get(item.sku)?.focus())
            throw new ShopReviewRequiredError(`Catalog values changed while ${item.sku} was under review. Nothing was applied; reopen Edit item to use the current values.`)
          }
          throw error
        }
      },
    }, catalogEditTriggerRefs.current.get(item.sku))
  }

  async function confirmAction(details: ActionDetails) {
    if (!pendingAction) return
    if (pendingAction.evidenceReferenceLocked
      && details.evidenceReference.trim() !== pendingAction.evidenceReferenceSuggestion) {
      throw new Error('Source-backed evidence is fixed to the reviewed message mapping. Cancel and review the source again to change it.')
    }
    const record = confirmAccountableAction(
      pendingAction,
      managedIdentity ? { ...details, actor: managedIdentity.userId } : details,
    )
    if (!pendingAction.confirmation) {
      setPendingAction((current) => current?.id === pendingAction.id
        ? { ...current, confirmation: record }
        : current)
    }
    try {
      await pendingAction.apply(record)
    } catch (error) {
      if (error instanceof ShopReviewRequiredError) {
        setPendingAction(null)
        setNotice(error.message)
      }
      throw error
    }
    if (!managedIdentity) setActions((current) => [record, ...current])
    setNotice(managedIdentity ? `${record.id} confirmed by the managed Shop API.` : `${record.id} applied and added to the action history.`)
    setPendingAction(null)
  }

  function useChannelDraft(draft: ChannelOrderDraft) {
    if (!commerceCanWrite) {
      setNotice('Shop changes are paused because this workspace cannot confirm writes.')
      return
    }
    if (pendingAction || !channelOrderDraftIsReady(draft)) {
      setNotice('Finish the current accountable action before using another channel draft.')
      return
    }
    setCustomer(draft.customer)
    setChannel(draft.channel)
    setSku(draft.sku)
    setQuantity(draft.quantity)
    setExtraOrderLines([])
    setPayment(draft.payment)
    setFulfilment('')
    setFulfilmentReference(draft.sourceRecordId)
    setPromisedAt(defaultOrderPromiseInput())
    setPreparedChannelDraft(draft)
    setPreparedEcommerceDraft(null)
    setOrderEntryMode('manual')
    setNotice(`${draft.sourceRecordId} mapped locally. Review the structured order before any stock changes.`)
  }

  async function reviewStorefrontRequest(requestId: string) {
    if (!commerceCanWrite || pendingAction) {
      setNotice('Finish the current Shop action before reviewing an Ecommerce request.')
      return
    }
    const request = pendingStorefrontRequests.find((candidate) => candidate.id === requestId)
    if (!request) {
      setNotice('The Ecommerce request is no longer waiting in this Shop inbox.')
      return
    }
    try {
      if (request.schema === 'supermega.ecommerce.order_request.v2') {
        const { prepareManagedEcommerceShopDraftV2 } = await import('../products/ecommerce/ecommerce-buying-lifecycle')
        const draft = await prepareManagedEcommerceShopDraftV2({
          request,
          currentCatalog: commerce.items,
          confirmedAt: new Date().toISOString(),
        })
        const [firstLine, ...remainingLines] = draft.lines
        if (!firstLine) throw new Error('The managed Ecommerce request has no reviewed item.')
        setPreparedChannelDraft(null)
        setPreparedEcommerceDraft(draft)
        setCustomer(draft.customerReference)
        setChannel('Ecommerce')
        setSku(firstLine.sku)
        setQuantity(firstLine.quantity)
        setExtraOrderLines(remainingLines.map((line) => ({ sku: line.sku, quantity: line.quantity })))
        setPayment('')
        setFulfilment(draft.fulfilment)
        setFulfilmentReference(draft.sourceRequestId)
        setPromisedAt(defaultOrderPromiseInput())
        setOrderEntryMode('manual')
        setNotice(`${request.id} loaded from the authenticated inbox with ${draft.lines.length} ${draft.lines.length === 1 ? 'item' : 'items'}. Confirm the promise and payment, then use the separate Shop action gate.`)
        return
      }
      const { recordEcommerceShopDraft } = await import('../products/ecommerce/ecommerce-shop-handoff')
      const draft = recordEcommerceShopDraft({
        request,
        currentCatalog: commerce.items,
        confirmedAt: new Date().toISOString(),
      })
      setPreparedChannelDraft(null)
      setPreparedEcommerceDraft(draft)
      setCustomer(draft.customerReference)
      setChannel('Ecommerce')
      setSku(draft.line.sku)
      setQuantity(draft.line.quantity)
      setExtraOrderLines([])
      setPayment('')
      setFulfilment(draft.fulfilment)
      setFulfilmentReference(draft.sourceRequestId)
      setPromisedAt(defaultOrderPromiseInput())
      setOrderEntryMode('manual')
      setNotice(`${request.id} loaded from the authenticated inbox. Confirm the promise and payment, then use the separate Shop action gate.`)
    } catch (error) {
      detachPreparedOrderSources({ channel: false })
      setNotice(error instanceof Error ? error.message : 'The Ecommerce inbox request failed closed.')
    }
  }

  function addOrderLine() {
    const usedSkus = new Set(manualOrderLineDrafts.map((line) => line.sku))
    const nextItem = commerce.items.find((item) => !usedSkus.has(item.sku))
    if (!nextItem || manualOrderLineDrafts.length >= 20) {
      setNotice('Every available catalog item is already in this order.')
      return
    }
    setExtraOrderLines((current) => [...current, { sku: nextItem.sku, quantity: 1 }])
    detachPreparedOrderSources()
    setNotice(`${nextItem.name} added. Each item can appear once in an order.`)
  }

  function updateExtraOrderLine(index: number, patch: Partial<{ sku: string; quantity: number }>) {
    setExtraOrderLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line))
    detachPreparedOrderSources()
  }

  function removeExtraOrderLine(index: number) {
    setExtraOrderLines((current) => current.filter((_, lineIndex) => lineIndex !== index))
    detachPreparedOrderSources()
    setNotice('Item removed from this order draft. Shop data has not changed.')
  }

  function recordOrder(event: FormEvent) {
    event.preventDefault()
    if (orderDraftConflict || resumedOrderNeedsReview) {
      setOrderDraftIssue(orderDraftConflict
        ? 'Close this form and resume the latest saved order before review.'
        : 'Review current Shop prices and availability before preparing this recovered order.')
      return
    }
    if (!payment) {
      setNotice('Choose how payment will be reviewed before preparing this order.')
      return
    }
    const handoffReference = fulfilmentReference.trim()
    if (!fulfilment || !handoffReference) {
      setNotice('Choose pickup or delivery and enter its handoff reference before reviewing this order.')
      return
    }
    const reviewedAt = new Date()
    const promisedTime = new Date(promisedAt)
    if (!promisedAt || Number.isNaN(promisedTime.getTime()) || promisedTime.getTime() <= reviewedAt.getTime()) {
      setNotice('Choose a promised pickup or delivery time that is still in the future.')
      return
    }
    const canonicalPromisedAt = promisedTime.toISOString()
    const sourceDraft = preparedChannelDraft && channelOrderDraftIsReady(preparedChannelDraft) ? preparedChannelDraft : null
    const ecommerceDraft = preparedEcommerceDraft
    if (sourceDraft && ecommerceDraft) {
      detachPreparedOrderSources()
      setNotice('Two source drafts were present. Both links were removed and nothing was queued.')
      return
    }
    const orderLineSkus = new Set<string>()
    const orderLines: CommerceOrderLine[] = []
    let orderQuantity = 0
    let orderTotal = 0
    for (const line of manualOrderLineItems) {
      if (!line.item
        || !Number.isSafeInteger(line.quantity)
        || line.quantity < 1
        || line.item.onHand < line.quantity
        || orderLineSkus.has(line.item.sku)) {
        setNotice('Each order item must be unique, in stock, and use a whole quantity of at least 1.')
        return
      }
      const lineTotal = line.item.price * line.quantity
      const nextQuantity = orderQuantity + line.quantity
      const nextTotal = orderTotal + lineTotal
      if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(nextQuantity) || !Number.isSafeInteger(nextTotal)) {
        setNotice('This order exceeds the supported whole-MMK or quantity limit.')
        return
      }
      orderLineSkus.add(line.item.sku)
      orderQuantity = nextQuantity
      orderTotal = nextTotal
      orderLines.push({
        sku: line.item.sku,
        name: line.item.name,
        ...(line.item.variant ? { variant: line.item.variant } : {}),
        quantity: line.quantity,
        unitPriceMmk: line.item.price,
      })
    }
    const selectedLine = orderLines[0]
    const selectedItem = manualOrderLineItems[0]?.item
    if (!selectedLine || !selectedItem) {
      setNotice('Add at least one available catalog item before reviewing the order.')
      return
    }
    if (sourceDraft && orderLines.length !== 1) {
      detachPreparedOrderSources({ ecommerce: false })
      setNotice('This channel source contains one reviewed item. Its source link was removed; review the multi-item order manually.')
      return
    }
    if (sourceDraft && (customer.trim() !== sourceDraft.customer
      || channel !== sourceDraft.channel
      || selectedLine.sku !== sourceDraft.sku
      || selectedLine.quantity !== sourceDraft.quantity
      || payment !== sourceDraft.payment)) {
      detachPreparedOrderSources({ ecommerce: false })
      setNotice('The structured order changed after source review. Review the channel mapping again or continue as a manual order.')
      return
    }
    const ecommerceLines = ecommerceDraft
      ? ecommerceDraft.schema === 'supermega.ecommerce.shop_draft.v2'
        ? ecommerceDraft.lines
        : [ecommerceDraft.line]
      : []
    const ecommercePayment = ecommerceDraft?.schema === 'supermega.ecommerce.shop_draft.v2'
      ? ecommerceDraft.pricing.payment.adapter === 'cash_on_delivery'
        ? 'Cash on delivery'
        : ecommerceDraft.pricing.payment.adapter === 'kbzpay_manual'
          ? 'KBZPay'
          : 'Cash'
      : ''
    if (ecommerceDraft && (customer.trim() !== ecommerceDraft.customerReference
      || channel !== 'Ecommerce'
      || fulfilment !== ecommerceDraft.fulfilment
      || Boolean(ecommercePayment && payment !== ecommercePayment)
      || orderLines.length !== ecommerceLines.length
      || orderLines.some((line, index) => {
        const expected = ecommerceLines[index]
        return !expected
          || line.sku !== expected.sku
          || line.quantity !== expected.quantity
          || line.name !== expected.name
          || (line.variant ?? null) !== expected.variant
          || line.unitPriceMmk !== expected.unitPriceMmk
      })
      || orderTotal !== ecommerceDraft.totalMmk)) {
      detachPreparedOrderSources({ channel: false })
      setNotice('The Ecommerce request changed after confirmation. Return to Ecommerce or continue as a manual order.')
      return
    }
    const sourceRecordId = sourceDraft?.sourceRecordId ?? ecommerceDraft?.sourceRequestId
    const sourceEvidence = sourceDraft?.evidenceReference ?? ecommerceDraft?.evidenceReference
    if (sourceRecordId && commerce.orders.some((candidate) => candidate.sourceRecordId === sourceRecordId)) {
      setNotice(`${sourceRecordId} is already linked to an order. No duplicate was queued.`)
      return
    }
    const sourceBacked = Boolean(sourceRecordId)
    const recoveryInputAtReview = sourceBacked ? null : currentOrderRecoveryInput
    const recoveryScopeAtReview = orderDraftScope
    const recoveryOperationEpochAtReview = orderDraftOperationEpochRef.current
    const recoveryResetEpochAtReview = orderDraftResetEpochRef.current
    const order: CommerceOrder = {
      id: uid('ORD'),
      createdAt: reviewedAt.toISOString(),
      customer: customer.trim() || 'Guest',
      channel,
      item: orderLines.length === 1 ? selectedLine.name : commerceOrderItemSummary(orderLines),
      ...(orderLines.length === 1 ? { itemSku: selectedLine.sku } : {}),
      quantity: orderQuantity,
      payment,
      paymentStatus: 'pending',
      refundStatus: 'none',
      fulfilment,
      fulfilmentReference: handoffReference,
      promisedAt: canonicalPromisedAt,
      sourceRecordId,
      evidenceReference: sourceEvidence,
      ...(!sourceBacked || orderLines.length > 1 ? { lines: orderLines } : {}),
      total: orderTotal,
      status: 'confirmed',
    }
    const lineReview = orderLines.map((line) => `${line.sku} × ${line.quantity} @ ${line.unitPriceMmk.toLocaleString()} MMK`).join(', ')
    const reservationReview = orderLines.map((line) => {
      const item = commerce.items.find((candidate) => candidate.sku === line.sku)
      return `${line.sku} ${item?.onHand ?? 0} → ${(item?.onHand ?? 0) - line.quantity}`
    }).join(', ')
    queueAction({
      kind: 'order_create',
      subjectId: order.id,
      summary: ecommerceDraft ? 'Review Ecommerce order' : `Confirm ${order.id} with ${orderLines.length} item ${orderLines.length === 1 ? 'line' : 'lines'}`,
      before: `${sourceRecordId ? `Request ${sourceRecordId} · ` : ''}Customer ${order.customer} · ${lineReview}`,
      after: `Order ${order.id} · Subtotal ${formatMoney(orderTotal)} · Tax not configured · Payment ${payment} · Owner confirming operator · Promise ${formatIssueDue(canonicalPromisedAt)} · ${fulfilmentLabel(order.fulfilment)} · Stock ${reservationReview}`,
      evidenceReferenceSuggestion: sourceEvidence,
      evidenceReferenceLocked: Boolean(sourceRecordId),
      apply: async (action) => {
        const ownedOrder = { ...order, owner: action.actor }
        await mutateCommerce('commerce.order.created', action.commandId, commerceActionProof(action), (current) => reserveCommerceOrder(current, ownedOrder, commerceActionProof(action)))
        if (ecommerceDraft) {
          consumedEcommerceDraftId.current = ecommerceDraft.id
          navigate({ pathname: '/shop/', search: '?tab=orders' }, { replace: true, state: null })
        }
        if (recoveryInputAtReview) {
          try {
            await orderDraftSaveQueueRef.current
            if (orderDraftScopeRef.current !== recoveryScopeAtReview
              || orderDraftOperationEpochRef.current !== recoveryOperationEpochAtReview) {
              throw new Error('a newer or different unfinished order is now saved')
            }
            const {
              commerceOrderDraftMatchesInput,
              discardCommerceOrderDraft,
              readCommerceOrderDraft,
            } = await import('./commerce-order-draft')
            const latestRecovery = readCommerceOrderDraft(recoveryScopeAtReview)
            if (latestRecovery.status === 'ready'
              && latestRecovery.draft
              && commerceOrderDraftMatchesInput(latestRecovery.draft, recoveryInputAtReview)) {
              await discardCommerceOrderDraft(
                recoveryScopeAtReview,
                latestRecovery.draft.revision,
                { expectedResetEpoch: recoveryResetEpochAtReview },
              )
              if (orderDraftScopeRef.current !== recoveryScopeAtReview
                || orderDraftOperationEpochRef.current !== recoveryOperationEpochAtReview) {
                throw new Error('a newer unfinished order arrived while the confirmed copy was being cleared')
              }
              orderDraftOperationEpochRef.current += 1
              orderDraftRevisionRef.current = 0
              setOrderDraftRead({ status: 'empty', draft: null, error: '' })
              setOrderDraftIssue('')
            } else if (latestRecovery.status === 'empty') {
              orderDraftRevisionRef.current = 0
              setOrderDraftRead(latestRecovery)
              setOrderDraftIssue('')
            } else {
              orderDraftRevisionRef.current = latestRecovery.draft?.revision ?? 0
              setOrderDraftRead(latestRecovery)
              throw new Error('the saved recovery copy does not exactly match the confirmed manual order')
            }
          } catch (error) {
            setOrderDraftIssue(error instanceof Error
              ? `Order confirmed, but its local recovery copy remains: ${error.message}`
              : 'Order confirmed, but its local recovery copy could not be cleared.')
          }
        }
        setOrderDraftActive(false)
        setResumedOrderDraft(null)
        setOrderDraftConflict(false)
        resetOrderDraftFields()
      },
    })
  }

  function queueWebsiteOrder(record: WebsiteOrderRecord, promisedAtInput: string) {
    if (commerce.orders.some((order) => order.id === record.id || order.sourceRecordId === record.id)) {
      setNotice(`${record.id} is already in the Shop order queue.`)
      return
    }
    if (pendingAction?.kind === 'order_create' && pendingAction.subjectId === record.id) {
      setNotice(`${record.id} is already waiting for accountable confirmation.`)
      return
    }

    const line = record.lines.length === 1 ? record.lines[0] : null
    const matchingItems = line ? commerce.items.filter((item) => item.sku === line.sku) : []
    const item = matchingItems.length === 1 ? matchingItems[0] : null
    if (!line || !item || line.quantity < 1 || item.onHand < line.quantity || item.price !== line.unitPriceMmk || record.totalMmk !== line.quantity * line.unitPriceMmk) {
      setNotice('Website order confirmation failed closed. Recheck the item, immutable price, quantity, and available stock.')
      return
    }
    const promisedTime = new Date(promisedAtInput)
    const reviewedAt = new Date()
    if (!promisedAtInput || Number.isNaN(promisedTime.getTime()) || promisedTime.getTime() <= reviewedAt.getTime()) {
      setNotice('Choose a promised pickup or delivery time that is still in the future.')
      return
    }
    const canonicalPromisedAt = promisedTime.toISOString()

    const paymentLabel = record.paymentMethod === 'cash_on_delivery' ? 'Cash on delivery' : record.paymentMethod === 'manual_qr' ? 'Manual QR review' : 'Manual bank transfer'
    const orderFulfilment = record.fulfilmentMethod === 'pickup' ? 'pickup' : 'delivery'
    const order: CommerceOrder = {
      id: record.id,
      createdAt: record.createdAt,
      customer: record.customerReference,
      channel: 'Website',
      item: line.itemName,
      itemSku: line.sku,
      quantity: line.quantity,
      payment: paymentLabel,
      paymentStatus: 'pending',
      refundStatus: 'none',
      fulfilment: orderFulfilment,
      fulfilmentReference: record.id,
      promisedAt: canonicalPromisedAt,
      sourceRecordId: record.id,
      evidenceReference: record.completion.evidenceReference,
      total: record.totalMmk,
      status: 'confirmed',
    }
    const beforeStock = item.onHand
    queueAction({
      kind: 'order_create',
      subjectId: record.id,
      summary: `Confirm ${record.id} from Website`,
      before: `ready for confirmation · ${item.sku} · ${beforeStock} on hand`,
      after: `confirmed · owner: confirming operator · promised ${formatTime(canonicalPromisedAt)} · ${fulfilmentLabel(orderFulfilment)} · ${record.id} · ${beforeStock - line.quantity} on hand`,
      apply: (action) => mutateCommerce('commerce.order.created', action.commandId, commerceActionProof(action), (current) => reserveCommerceOrder(current, { ...order, owner: action.actor }, commerceActionProof(action))),
    })
  }

  function queueManagedWebsiteIntake(intakeId: string, input: CommerceWebsiteOrderInput): boolean {
    const intake = websiteIntakes.find((candidate) => candidate.id === intakeId && candidate.status === 'pending_confirmation')
    const item = intake ? commerce.items.find((candidate) => candidate.sku === intake.sku) : null
    if (!intake || !item || item.onHand < intake.quantity || item.price !== intake.unitPrice) {
      setNotice('Managed Website intake failed closed. Recheck the retained intake, catalog price, and available stock.')
      return false
    }
    const orderId = `ORD-WEB-${intake.id.slice(5)}`
    if (pendingAction?.kind === 'order_create' && pendingAction.subjectId === orderId) {
      setNotice(`${orderId} is already waiting for authenticated confirmation.`)
      return true
    }
    const fulfilment = input.fulfilmentMethod === 'pickup' ? 'Customer pickup' : 'Local delivery'
    return queueAction({
      kind: 'order_create',
      subjectId: orderId,
      summary: `Confirm ${orderId} from Website`,
      before: `${intake.id} waiting · ${item.onHand} on hand`,
      after: `${fulfilment} · owner: confirming operator · promised ${formatTime(input.promisedAt)} · ${item.onHand - intake.quantity} on hand`,
      apply: (action) => mutateCommerce(
        'commerce.website_intake.converted',
        action.commandId,
        commerceActionProof(action),
        (current) => convertCommerceWebsiteIntake(current, intake.id, input, commerceActionProof(action)),
      ),
    })
  }

  function advanceOrder(orderId: string) {
    const order = commerce.orders.find((candidate) => candidate.id === orderId)
    if (!order || order.status === 'completed' || order.status === 'cancelled') return
    if (order.status === 'ready' && order.paymentStatus !== 'reconciled') {
      setNotice(`Reconcile ${order.id} payment before completion.`)
      return
    }
    const next: Record<'confirmed' | 'preparing' | 'ready', CommerceOrderStatus> = { confirmed: 'preparing', preparing: 'ready', ready: 'completed' }
    const nextStatus = next[order.status]
    queueAction({ kind: 'order_status', subjectId: orderId, summary: `Advance ${orderId} fulfilment`, before: order.status, after: nextStatus, apply: (action) => mutateCommerce('commerce.order.advanced', action.commandId, commerceActionProof(action), (current) => advanceCommerceOrder(current, orderId, order.status, commerceActionProof(action), managedIdentity ? 'managed-server' : 'client')) })
  }

  function reconcilePayment(orderId: string) {
    const order = commerce.orders.find((candidate) => candidate.id === orderId)
    if (!order || order.status === 'cancelled') return
    if (order.paymentStatus === 'reconciled') {
      setNotice(`${order.id} payment is already reconciled.`)
      return
    }
    queueAction({ kind: 'payment_reconcile', subjectId: orderId, summary: `Reconcile ${order.id} payment`, before: `${order.payment} · ${order.paymentStatus}`, after: `${order.payment} · reconciled`, apply: (action) => mutateCommerce('commerce.payment.reconciled', action.commandId, commerceActionProof(action), (current) => reconcileCommercePayment(current, orderId, commerceActionProof(action))) })
  }

  function settleRefund(orderId: string) {
    const order = commerce.orders.find((candidate) => candidate.id === orderId)
    if (!order || order.refundStatus !== 'due') {
      setNotice('Only a refund currently marked due can be recorded as settled.')
      return
    }
    queueAction({
      kind: 'refund_settle',
      subjectId: orderId,
      summary: `Record ${order.id} refund settlement`,
      before: 'refund due',
      after: 'refund settled · external provider evidence recorded · no money sent',
      apply: (action) => mutateCommerce(
        'commerce.refund.settled',
        action.commandId,
        commerceActionProof(action),
        (current) => settleCommerceRefund(current, orderId, commerceActionProof(action)),
      ),
    })
  }

  function canReturnOrder(orderId: string) {
    const order = commerce.orders.find((candidate) => candidate.id === orderId)
    return Boolean(order?.completion && commerceOrderReturnLines(order).some((line) => (
      commerceOrderReturnExpectation(commerce, orderId, line.sku, 'not_restocked')
    )))
  }

  function openReturnEditor(orderId: string) {
    if (pendingAction) {
      setNotice('Finish or cancel the current Shop action before recording a return.')
      return
    }
    const order = commerce.orders.find((candidate) => candidate.id === orderId)
    const line = order?.completion
      ? commerceOrderReturnLines(order).find((candidate) => (
          commerceOrderReturnExpectation(commerce, orderId, candidate.sku, 'not_restocked')
        ))
      : undefined
    if (!order || order.status !== 'completed' || !line) {
      setNotice(order?.status === 'completed' && !order.completion
        ? `${order.id} predates attributable completion records, so its return workflow is read-only.`
        : 'This order has no proven sold quantity left to return.')
      return
    }
    setReturnDraft((current) => current?.orderId === orderId && current.sku === line.sku
      ? current
      : { orderId, sku: line.sku, quantity: '1', disposition: 'restock' })
    requestAnimationFrame(() => returnEditorRef.current?.querySelector<HTMLElement>('#order-return-quantity')?.focus())
  }

  function cancelReturnEditor() {
    const orderId = returnDraft?.orderId
    setReturnDraft(null)
    setNotice('Return draft closed. Shop data was not modified.')
    requestAnimationFrame(() => orderId && returnTriggerRefs.current.get(orderId)?.focus())
  }

  function reviewOrderReturn(event: FormEvent) {
    event.preventDefault()
    if (!returnDraft || !returnDraftOrder || !selectedReturnLine || returnDraft.sku !== selectedReturnLine.sku || returnQuantityResult === null) {
      setNotice('Choose an order item and a whole return quantity within the remaining sold quantity.')
      return
    }
    const expected = commerceOrderReturnExpectation(
      commerce,
      returnDraft.orderId,
      returnDraft.sku,
      returnDraft.disposition,
    )
    if (!expected || returnQuantityResult > expected.soldQuantity - expected.returnedQuantity) {
      setNotice('The order or its remaining return quantity changed. Review the latest order record.')
      return
    }
    const item = commerce.items.find((candidate) => candidate.sku === returnDraft.sku)
    if (!item) {
      setNotice('The returned item is no longer in the Shop catalog. Nothing was queued.')
      return
    }
    const nextReturned = expected.returnedQuantity + returnQuantityResult
    const dispositionAfter = returnDraft.disposition === 'restock'
      ? `${item.onHand} → ${item.onHand + returnQuantityResult} sellable units`
      : `${item.onHand} sellable units unchanged · item not restocked`
    const input = {
      orderId: returnDraft.orderId,
      sku: returnDraft.sku,
      quantity: returnQuantityResult,
      disposition: returnDraft.disposition,
    } as const
    queueAction({
      kind: 'order_return',
      subjectId: `${input.orderId}:${input.sku}`,
      summary: `Record ${input.quantity} ${input.sku} returned from ${input.orderId}`,
      before: `${expected.returnedQuantity} of ${expected.soldQuantity} returned · ${item.onHand} sellable units`,
      after: `${nextReturned} of ${expected.soldQuantity} returned · ${dispositionAfter} · payment and order total unchanged`,
      apply: async (action) => {
        const proof = commerceActionProof(action)
        await mutateCommerce(
          'commerce.order.return_recorded',
          action.commandId,
          proof,
          (current) => recordCommerceOrderReturn(current, input, proof, expected),
        )
        setReturnDraft(null)
      },
    }, returnTriggerRefs.current.get(input.orderId))
  }

  function cancelOrder(orderId: string) {
    const order = commerce.orders.find((candidate) => candidate.id === orderId)
    if (!order || order.status === 'completed' || order.status === 'cancelled') return
    if (!commerceOrderHasReleasableReservation(commerce, orderId)) return setNotice(`${order.id} has no unmatched, attributable reservation. Cancellation failed closed without changing stock.`)
    const lines = order.lines ?? (order.itemSku ? [{ sku: order.itemSku, quantity: order.quantity }] : [])
    const stockLines = lines.map((line) => {
      const item = commerce.items.find((candidate) => candidate.sku === line.sku)
      return item ? { sku: line.sku, quantity: line.quantity, onHand: item.onHand } : null
    })
    if (!lines.length || stockLines.some((line) => !line)) {
      setNotice(`${order.id} inventory references are unavailable, so cancellation failed closed.`)
      return
    }
    const paymentAfter = order.paymentStatus === 'reconciled' ? 'reconciled · refund due' : 'pending'
    queueAction({
      kind: 'order_cancel',
      subjectId: orderId,
      summary: `Cancel ${order.id} and release ${lines.length} stock ${lines.length === 1 ? 'line' : 'lines'}`,
      before: `${order.status} · ${order.paymentStatus} · ${stockLines.map((line) => `${line?.sku} ${line?.onHand}`).join(', ')}`,
      after: `cancelled · ${paymentAfter} · ${stockLines.map((line) => `${line?.sku} ${(line?.onHand ?? 0) + (line?.quantity ?? 0)}`).join(', ')}`,
      apply: (action) => mutateCommerce('commerce.order.cancelled', action.commandId, commerceActionProof(action), (current) => cancelCommerceOrder(current, orderId, commerceActionProof(action))),
    })
  }

  function openPurchaseOrder(itemSku: string) {
    const item = commerce.items.find((candidate) => candidate.sku === itemSku)
    if (!item) return
    if (catalogEditDraft) {
      requestAnimationFrame(() => catalogEditEditorRef.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus())
      setNotice('Finish or cancel the catalog edit before opening a stock order. Your catalog draft was preserved.')
      return
    }
    if (stockCountDraft) {
      const selector = stockCountDraft.sku ? '#stock-count-quantity' : '#stock-count-sku'
      requestAnimationFrame(() => stockCountEditorRef.current?.querySelector<HTMLElement>(selector)?.focus())
      setNotice('Finish or cancel the stock count before opening a stock order. Your count draft was preserved.')
      return
    }
    const active = activePurchaseOrderBySku.get(itemSku)
    const alreadyEditing = purchaseOrderDraft?.mode === 'create'
      ? purchaseOrderDraft.sku === itemSku
      : purchaseOrderDraft?.mode === 'receive'
        ? purchaseOrderDraft.purchaseOrderId === active?.purchaseOrder.id
        : false
    if (alreadyEditing) {
      requestAnimationFrame(() => purchaseOrderEditorRef.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus())
      setNotice(`Continue the ${active ? 'receipt' : 'stock order'} below. Your draft was preserved.`)
      return
    }
    setPurchaseOrderDraft(active
      ? { mode: 'receive', purchaseOrderId: active.purchaseOrder.id, quantity: '' }
      : { mode: 'create', sku: itemSku, supplier: '', expectedAt: defaultPurchaseOrderExpectedInput(), quantity: '' })
    setNotice(active
      ? `Record only units counted against ${active.purchaseOrder.id}. Nothing changes until confirmation.`
      : `Create an internal order for ${item.name}. This does not contact a supplier or create a payment.`)
  }

  function cancelPurchaseOrderEditor() {
    const itemSku = purchaseOrderDraft?.mode === 'create'
      ? purchaseOrderDraft.sku
      : purchaseOrderDraftOrder?.purchaseOrder.sku
    setPurchaseOrderDraft(null)
    setNotice('Stock order editing closed. Shop data was not modified.')
    requestAnimationFrame(() => {
      if (itemSku) purchaseOrderTriggerRefs.current.get(itemSku)?.focus()
    })
  }

  function reviewPurchaseOrder(event: FormEvent) {
    event.preventDefault()
    if (!purchaseOrderDraft || !purchaseOrderDraftItem || purchaseOrderQuantityResult === null) {
      setNotice('Enter a positive whole-unit quantity within the available order balance.')
      return
    }

    if (purchaseOrderDraft.mode === 'create') {
      const supplier = purchaseOrderDraft.supplier.trim()
      if (!supplier || supplier.length > 120) {
        setNotice('Enter a supplier reference of 120 characters or fewer.')
        return
      }
      const expectedAtTime = new Date(purchaseOrderDraft.expectedAt).getTime()
      if (!Number.isFinite(expectedAtTime) || expectedAtTime <= purchaseOrderClock) {
        setNotice('Choose an expected arrival later than the current time.')
        return
      }
      const expectedAt = new Date(expectedAtTime).toISOString()
      const item = purchaseOrderDraftItem
      const quantityOrdered = purchaseOrderQuantityResult
      const purchaseOrderId = uid('PO')
      queueAction({
        kind: 'purchase_order_create',
        subjectId: purchaseOrderId,
        summary: `Create internal order for ${quantityOrdered.toLocaleString()} units of ${item.name}`,
        before: `${item.onHand.toLocaleString()} on hand · no active stock order · supplier not contacted`,
        after: `${purchaseOrderId} · ${supplier} · ${quantityOrdered.toLocaleString()} ordered internally · expected ${formatIssueDue(expectedAt)} · no message or payment created`,
        apply: async (action) => {
          const proof = commerceActionProof(action)
          await mutateCommerce('commerce.purchase_order.created', action.commandId, proof, (current) => createCommercePurchaseOrder(
            current,
            { id: purchaseOrderId, expectedAt, supplier, sku: item.sku, quantityOrdered },
            proof,
          ))
          setPurchaseOrderDraft((current) => current?.mode === 'create' && current.sku === item.sku ? null : current)
        },
      }, purchaseOrderTriggerRefs.current.get(item.sku))
      return
    }

    const purchaseOrderRow = purchaseOrderDraftOrder
    if (!purchaseOrderRow?.item) {
      setNotice('The active stock order is no longer available. Nothing was changed.')
      return
    }
    const { purchaseOrder, progress, item } = purchaseOrderRow
    const receiptQuantity = purchaseOrderQuantityResult
    const expectedOnHand = item.onHand
    const expectedRemaining = progress.remaining
    queueAction({
      kind: 'purchase_order_receive',
      subjectId: purchaseOrder.id,
      summary: `Receive ${receiptQuantity.toLocaleString()} units against ${purchaseOrder.id}`,
      before: `${progress.received.toLocaleString()} of ${purchaseOrder.quantityOrdered.toLocaleString()} received · ${expectedOnHand.toLocaleString()} on hand`,
      after: `${(progress.received + receiptQuantity).toLocaleString()} of ${purchaseOrder.quantityOrdered.toLocaleString()} received · ${(expectedOnHand + receiptQuantity).toLocaleString()} on hand`,
      apply: async (action) => {
        const proof = commerceActionProof(action)
        await mutateCommerce('commerce.purchase_order.received', action.commandId, proof, (current) => {
          const currentPurchaseOrder = commercePurchaseOrders(current).find((candidate) => candidate.id === purchaseOrder.id)
          const currentItem = current.items.find((candidate) => candidate.sku === item.sku)
          if (!currentPurchaseOrder
            || !currentItem
            || currentItem.onHand !== expectedOnHand
            || commercePurchaseOrderProgress(current, currentPurchaseOrder).remaining !== expectedRemaining) return null
          return receiveCommercePurchaseOrder(current, purchaseOrder.id, receiptQuantity, proof)
        })
        setPurchaseOrderDraft((current) => current?.mode === 'receive' && current.purchaseOrderId === purchaseOrder.id ? null : current)
      },
    }, purchaseOrderTriggerRefs.current.get(item.sku))
  }

  function openStockCount() {
    if (stockCountDraft) {
      const selector = stockCountDraft.sku ? '#stock-count-quantity' : '#stock-count-sku'
      requestAnimationFrame(() => stockCountEditorRef.current?.querySelector<HTMLElement>(selector)?.focus())
      setNotice('Continue the available-stock count below. Your draft was preserved.')
      return
    }
    if (purchaseOrderDraft) {
      requestAnimationFrame(() => purchaseOrderEditorRef.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus())
      setNotice('Finish or cancel the stock order before starting a count. Your stock-order draft was preserved.')
      return
    }
    if (catalogEditDraft) {
      requestAnimationFrame(() => catalogEditEditorRef.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus())
      setNotice('Finish or cancel the catalog edit before starting a count. Your catalog draft was preserved.')
      return
    }
    setStockCountDraft({ sku: '', quantity: '' })
    setNotice('Count sellable units after excluding anything already set aside for open orders. Nothing changes until confirmation.')
    requestAnimationFrame(() => stockCountEditorRef.current?.querySelector<HTMLSelectElement>('#stock-count-sku')?.focus())
  }

  function cancelStockCount() {
    setStockCountDraft(null)
    setNotice('Stock count closed. Shop data was not modified.')
    requestAnimationFrame(() => stockCountTriggerRef.current?.focus())
  }

  function reviewStockCount(event: FormEvent) {
    event.preventDefault()
    if (!stockCountDraft || !stockCountItem || stockCountQuantityResult === null) {
      setNotice('Choose one item and enter a non-negative whole-unit available count.')
      return
    }
    const item = stockCountItem
    const countedQuantity = stockCountQuantityResult
    const expectedOnHand = item.onHand
    const variance = countedQuantity - expectedOnHand
    const varianceLabel = variance === 0
      ? 'no variance'
      : `${variance > 0 ? '+' : ''}${variance.toLocaleString()} variance`
    queueAction({
      kind: 'inventory_count',
      subjectId: item.sku,
      summary: `Count available stock for ${item.name}`,
      before: `${item.sku} · ${expectedOnHand.toLocaleString()} recorded available`,
      after: `${countedQuantity.toLocaleString()} counted available · ${varianceLabel} · count evidence only`,
      apply: async (action) => {
        const proof = commerceActionProof(action)
        let staleCount = false
        try {
          await mutateCommerce('commerce.stock.counted', action.commandId, proof, (current) => {
            const replay = current.movements.find((movement) => movement.actionId === proof.actionId)
            if (replay) return countCommerceStock(current, item.sku, countedQuantity, proof)
            const currentItems = current.items.filter((candidate) => candidate.sku === item.sku)
            if (currentItems.length !== 1 || currentItems[0].onHand !== expectedOnHand) {
              staleCount = true
              return null
            }
            return countCommerceStock(current, item.sku, countedQuantity, proof)
          })
          setStockCountDraft((current) => current?.sku === item.sku ? null : current)
        } catch (error) {
          if (staleCount || error instanceof ShopReviewRequiredError) {
            setStockCountDraft({ sku: item.sku, quantity: '' })
            requestAnimationFrame(() => stockCountEditorRef.current?.querySelector<HTMLInputElement>('#stock-count-quantity')?.focus())
            throw new ShopReviewRequiredError(`Stock changed while you were reviewing. Nothing was applied. Recount ${item.sku} against the latest available-stock record.`)
          }
          throw error
        }
      },
    }, stockCountTriggerRef.current)
  }

  function reviewPurchaseOrderCancellation(purchaseOrderId: string) {
    const row = purchaseOrderRows.find(({ purchaseOrder }) => purchaseOrder.id === purchaseOrderId)
    if (!row || row.progress.remaining < 1 || row.progress.status === 'cancelled') return
    const expectedRemaining = row.progress.remaining
    queueAction({
      kind: 'purchase_order_cancel',
      subjectId: row.purchaseOrder.id,
      summary: `Cancel ${expectedRemaining.toLocaleString()} outstanding units on ${row.purchaseOrder.id}`,
      before: `${row.progress.received.toLocaleString()} of ${row.purchaseOrder.quantityOrdered.toLocaleString()} received · ${expectedRemaining.toLocaleString()} still open`,
      after: `outstanding remainder cancelled internally · no supplier message, payment, or accounting entry created`,
      apply: async (action) => {
        const proof = commerceActionProof(action)
        await mutateCommerce('commerce.purchase_order.cancelled', action.commandId, proof, (current) => {
          const currentPurchaseOrder = commercePurchaseOrders(current).find((candidate) => candidate.id === purchaseOrderId)
          if (!currentPurchaseOrder
            || commercePurchaseOrderProgress(current, currentPurchaseOrder).remaining !== expectedRemaining) return null
          return cancelCommercePurchaseOrder(current, purchaseOrderId, proof)
        })
        setPurchaseOrderDraft((current) => current?.mode === 'receive' && current.purchaseOrderId === purchaseOrderId ? null : current)
      },
    }, purchaseOrderTriggerRefs.current.get(row.purchaseOrder.sku))
  }

  function closeDay() {
    const queuedAt = new Date().toISOString()
    const expected = commerceCloseExpectation(commerce, queuedAt)
    if (!expected) {
      setNotice(legacyCloseNeedsMigration
        ? 'Legacy close history must be migrated before another daily close can be saved.'
        : 'This business date already has a close. Review the latest snapshot instead of closing it again.')
      return
    }
    const closeId = uid('CLOSE')
    const paymentExceptions = expected.paymentExceptionOrderIds.length ? expected.paymentExceptionOrderIds.join(', ') : 'none'
    const stockExceptions = expected.stockExceptionSkus.length ? expected.stockExceptionSkus.join(', ') : 'none'
    queueAction({
      kind: 'daily_close',
      subjectId: closeId,
      summary: `Close ${expected.businessDate}`,
      before: `${commerce.closes.length} snapshots`,
      after: `${expected.orderIds.length} orders (${expected.orderIds.length ? expected.orderIds.join(', ') : 'none'}) · ${formatMoney(expected.total)} · payment exceptions: ${paymentExceptions} · stock exceptions: ${stockExceptions}`,
      apply: (action) => mutateCommerce(
        'commerce.close.saved',
        action.commandId,
        commerceActionProof(action),
        (current) => saveCommerceClose(current, closeId, commerceActionProof(action), expected),
      ),
    })
  }

  function cancelCommerceActionReview() {
    const restorePreparedEcommerce = pendingAction?.kind === 'order_create' && Boolean(preparedEcommerceDraft)
    if (pendingAction?.kind === 'order_create' && !restorePreparedEcommerce) {
      setOrderDraftActive(false)
      setResumedOrderDraft(null)
    }
    setPendingAction(null)
    if (!restorePreparedEcommerce) {
      setNotice('Change cancelled. Shop data was not modified.')
      return
    }
    setNotice('Review cancelled. The prepared Ecommerce request and Payment are unchanged; Shop data was not modified.')
    requestAnimationFrame(() => {
      const dialog = orderComposerRef.current
      if (dialog && !dialog.open) dialog.showModal()
      orderReviewRef.current?.focus({ preventScroll: true })
    })
  }

  const actionGate = <AccountableActionGate authenticatedActor={managedIdentity ? { id: managedIdentity.userId, label: managedIdentity.email } : undefined} key={pendingAction?.id ?? 'commerce-idle'} action={pendingAction} onCancel={cancelCommerceActionReview} onConfirm={confirmAction} returnFocus={actionTrigger} />
  const actionHistory = managedIdentity ? null : <ActionHistory actions={actions} domain="commerce" />
  const orderDraftRecoveryWarning = orderDraftRead.status === 'ready'
    && orderDraftIssue.startsWith('Order confirmed, but its local recovery copy remains:')
  const orderDraftRecoveryBlocked = orderDraftRead.status === 'invalid'
    || orderDraftRead.status === 'unavailable'

  if (tab === 'orders') return <div className={`operation-module orders-module${returnDraft && selectedReturnLine ? ' has-return-draft' : ''}`}>
    {commerceBoundary}
    <section className="core-panel order-queue-panel order-workspace">
      <div className="panel-head"><div><span className="core-eyebrow">Orders</span><h2>{actionOrders.length} {actionOrders.length === 1 ? 'order needs' : 'orders need'} action</h2></div><div className="order-queue-actions"><span className="panel-note">{openOrders.length} in fulfilment</span><button className="core-button primary compact" disabled={!commerceCanWrite || Boolean(pendingAction) || !orderDraftInitialized || orderDraftRecoveryBlocked} onClick={orderDraftRead.status === 'ready' && !orderDraftActive ? resumeSavedOrderDraft : openOrderComposer} ref={orderComposerTriggerRef} type="button">{!orderDraftInitialized ? 'Loading orders' : orderDraftRead.status === 'unavailable' ? 'Recovery unavailable' : orderDraftRead.status === 'ready' && !orderDraftActive ? 'Resume order' : 'New order'}</button></div></div>
      {!orderDraftActive && !pendingAction && (orderDraftRead.status === 'ready' || orderDraftRecoveryBlocked) ? <div className={`order-draft-recovery ${orderDraftRecoveryBlocked || orderDraftRecoveryWarning ? 'is-blocked' : ''}`} role={orderDraftRecoveryBlocked || orderDraftRecoveryWarning ? 'alert' : 'status'}>
        <div>
          <strong>{orderDraftRecoveryWarning
            ? 'Confirmed order left a saved recovery copy'
            : orderDraftRead.status === 'ready'
              ? 'Unfinished order saved on this device'
              : orderDraftRead.status === 'invalid'
                ? 'Saved order draft needs recovery'
                : 'Order recovery unavailable'}</strong>
          <small>{orderDraftRecoveryWarning
            ? orderDraftIssue
            : orderDraftRead.status === 'ready' && orderDraftRead.draft
            ? `${orderDraftRead.draft.lines.length} ${orderDraftRead.draft.lines.length === 1 ? 'item' : 'items'} · revision ${orderDraftRead.draft.revision} · ${new Date(orderDraftRead.draft.savedAt).toLocaleString()}`
            : orderDraftRead.error}</small>
          {orderDraftRecoveryWarning && orderDraftRead.draft ? <small>{orderDraftRead.draft.lines.length} {orderDraftRead.draft.lines.length === 1 ? 'item' : 'items'} · revision {orderDraftRead.draft.revision} · review before creating another order</small> : null}
        </div>
        <div className="order-draft-recovery-actions">
          {orderDraftRead.status === 'ready' ? <button className="core-button compact" onClick={resumeSavedOrderDraft} type="button">Resume</button> : <Link className="text-link" to="/settings/#controls">{orderDraftRead.status === 'invalid' ? 'Export evidence' : 'Open Settings'}</Link>}
          {orderDraftRead.status !== 'unavailable' ? <button className="text-link danger-text" disabled={orderDraftSaving} onClick={() => void discardSavedOrderDraft()} type="button">{orderDraftRead.status === 'ready' ? 'Discard' : 'Discard unreadable draft'}</button> : null}
        </div>
      </div> : null}
      <OrderList canCancel={(orderId) => commerceOrderHasReleasableReservation(commerce, orderId)} disabled={commerceControlsDisabled} onAdvance={advanceOrder} onCancel={cancelOrder} onReconcilePayment={reconcilePayment} onSettleRefund={settleRefund} orders={actionOrders} />
    </section>
    <dialog aria-labelledby="order-composer-title" className="order-composer-dialog" onClose={() => {
      setOrderDraftActive(false)
      setResumedOrderDraft(null)
      setOrderDraftConflict(false)
    }} ref={orderComposerRef}>
      <div className="order-composer-head"><div><span className="core-eyebrow">New order</span><h2 id="order-composer-title" ref={orderComposerHeadingRef} tabIndex={-1}>Add an order</h2><p>Choose the fastest source. Nothing changes until the separate confirmation step.</p></div><div className="order-composer-actions">{orderDraftHasMeaningfulFields && !preparedChannelDraft && !preparedEcommerceDraft ? <button className="text-link danger-text" disabled={orderDraftSaving || orderDraftConflict} onClick={() => void discardSavedOrderDraft()} type="button">Discard draft</button> : null}<button aria-label="Close new order" className="core-button compact" onClick={closeOrderComposer} type="button">Close</button></div></div>
      {orderDraftActive && orderEntryMode === 'manual' && !preparedChannelDraft && !preparedEcommerceDraft && (orderDraftHasMeaningfulFields || resumedOrderDraft || orderDraftIssue) ? <div className={`order-draft-status ${orderDraftConflict || resumedOrderNeedsReview ? 'needs-review' : ''}`} role={orderDraftConflict ? 'alert' : 'status'}>
        <div>
          <strong>{orderDraftConflict
            ? 'Saved draft changed in another tab'
            : resumedOrderNeedsReview
              ? 'Review current Shop values'
              : orderDraftSaving
                ? 'Saving unfinished order'
                : orderDraftRead.status === 'ready'
                  ? 'Draft saved on this device'
                  : 'Unfinished order'}</strong>
          <small>{orderDraftIssue || (orderDraftRead.status === 'ready'
            ? 'Customer, promise, fulfilment, item quantities, and payment can be resumed after reload.'
            : 'This structured manual draft stays on this device. Raw messages and source links are never stored.')}</small>
        </div>
        {resumedOrderNeedsReview ? <button className="core-button compact" disabled={!resumedOrderCanRebind || orderDraftSaving || orderDraftConflict} onClick={() => void acceptCurrentOrderDraftCatalog()} type="button">Use current Shop values</button> : null}
      </div> : null}
      <div aria-label="Order source" className="order-entry-methods" role="group">
        <button aria-pressed={orderEntryMode === 'manual'} disabled={Boolean(pendingAction)} onClick={() => setOrderEntryMode('manual')} type="button">Enter order</button>
        <button aria-pressed={orderEntryMode === 'message'} disabled={Boolean(pendingAction)} onClick={() => setOrderEntryMode('message')} type="button">From message</button>
        <button aria-pressed={orderEntryMode === 'online'} disabled={Boolean(pendingAction)} onClick={() => setOrderEntryMode('online')} type="button">Online request</button>
      </div>
      {orderNotice ? <p className="form-notice order-entry-notice" aria-live="polite">{orderNotice}</p> : null}
      {orderEntryMode === 'message' ? <div className="order-entry-panel" data-mode="message"><ChannelOrderIntake disabled={commerceControlsDisabled} items={commerce.items} onAcceptedFocus={() => requestAnimationFrame(() => preparedChannelRef.current?.focus())} onUse={useChannelDraft} /></div> : null}
      {orderEntryMode === 'online' ? <div className="order-entry-panel" data-mode="online">
        <section className="website-intake">
          <div className="website-intake-head"><div><span className="core-eyebrow">Ecommerce inbox</span><strong>{pendingStorefrontRequests.length} requests waiting</strong></div><span className={`status-pill ${managedIdentity ? 'bounded' : 'pending'}`}>{managedIdentity ? 'Managed' : 'Not connected'}</span></div>
          {managedIdentity && pendingStorefrontRequests.length ? pendingStorefrontRequests.slice(0, 20).map((request) => {
            const lines = commerceStorefrontRequestLines(request)
            const itemSummary = lines.length === 1 ? `${lines[0].name} × ${lines[0].quantity}` : `${lines.length} items · ${lines.reduce((total, line) => total + line.quantity, 0)} units`
            return <div className="website-intake-ready" key={request.id}>
              <div><strong>{request.customerReference} · {itemSummary}</strong><small>{request.id} · {request.totalMmk.toLocaleString()} MMK · {request.fulfilment}</small></div>
              <button className="core-button compact" disabled={commerceControlsDisabled} onClick={() => void reviewStorefrontRequest(request.id)} ref={request.id === requestedRequestId ? ecommerceInboxTargetRef : undefined} type="button">Review</button>
            </div>
          }) : <div className="website-intake-record"><strong>{managedIdentity ? 'No Ecommerce request needs Shop review.' : 'Connect a managed workspace to use the shared inbox.'}</strong><small>No request creates an order, reserves stock, starts payment, sends a message, or requests delivery.</small></div>}
          <Link className="text-link" to="/ecommerce/">Open Ecommerce</Link>
        </section>
        {legacyWebsiteWorkWaiting ? <details className="legacy-website-intake"><summary>Older Website order needs review</summary><WebsiteCommerceIntake catalog={commerce.items} disabled={commerceControlsDisabled} importedSourceIds={importedWebsiteOrderIds} key={`${managedIdentity ? 'managed' : 'local'}:${websiteIntakes.find((intake) => intake.status === 'pending_confirmation')?.id ?? 'none'}`} managedIntakes={websiteIntakes} mode={managedIdentity ? 'managed' : 'local'} onQueueManagedIntake={queueManagedWebsiteIntake} onQueueReadyOrder={queueWebsiteOrder} /></details> : null}
      </div> : null}
      {orderEntryMode === 'manual' ? <>
        <div className="order-entry-panel" data-mode="manual">
        {preparedEcommerceDraft ? <div className="channel-source-ready">
          <div><span className="core-eyebrow">Ecommerce request</span><strong>{preparedEcommerceDraft.sourceRequestId}</strong><small>{preparedEcommerceDraft.fulfilment} · price locked · no stock reserved</small></div>
          <button className="text-link" disabled={Boolean(pendingAction)} onClick={() => { detachPreparedOrderSources({ channel: false }); setNotice('Ecommerce source link removed. Enter a manual handoff reference before recovery can save this order.') }} type="button">Remove source link</button>
        </div> : null}
        {preparedChannelDraft && channelOrderDraftIsReady(preparedChannelDraft) ? <div className="channel-source-ready" ref={preparedChannelRef} tabIndex={-1}>
          <div><span className="core-eyebrow">Mapped source</span><strong>{preparedChannelDraft.sourceRecordId}</strong><small>Exact excerpts reviewed; the full message was discarded.</small></div>
          <button className="text-link" disabled={Boolean(pendingAction)} onClick={() => { detachPreparedOrderSources({ ecommerce: false }); setNotice('Source link removed. Enter a manual handoff reference before recovery can save this order.') }} type="button">Remove source link</button>
        </div> : null}
        <form className="core-form compact-form commerce-order-form" id="commerce-manual-order-form" onSubmit={recordOrder}>
          <div className="order-essential-fields">
            <label>Customer<input disabled={commerceControlsDisabled} maxLength={80} value={customer} onChange={(event) => { setCustomer(event.target.value); detachPreparedOrderSources() }} placeholder="Name or reference" /></label>
            <label>Fulfilment<select disabled={commerceControlsDisabled} required value={fulfilment} onChange={(event) => {
              setFulfilment(event.target.value as '' | 'pickup' | 'delivery')
              if (preparedEcommerceDraft) {
                detachPreparedOrderSources({ channel: false })
                setNotice('Fulfilment changed. The Ecommerce source link was removed; review this as a manual order.')
              }
            }}><option value="">Choose pickup or delivery</option><option value="pickup">Pickup</option><option value="delivery">Delivery</option></select></label>
            <label>Promised for<input autoComplete="off" disabled={commerceControlsDisabled} id="commerce-order-promise" min={localDateTimeInputValue(new Date())} onChange={(event) => setPromisedAt(event.target.value)} ref={orderPromiseRef} required type="datetime-local" value={promisedAt} /></label>
            <label>Handoff reference<input disabled={commerceControlsDisabled} maxLength={160} onChange={(event) => setFulfilmentReference(event.target.value)} placeholder="Pickup ticket or delivery route" required value={fulfilmentReference} /></label>
            <label>{extraOrderLines.length ? 'Item 1' : 'Item'}<select disabled={commerceControlsDisabled} value={selectedSku} onChange={(event) => { setSku(event.target.value); detachPreparedOrderSources() }}>{!commerce.items.some((item) => item.sku === selectedSku) && selectedSku ? <option disabled value={selectedSku}>{selectedSku} · no longer in Shop</option> : null}{commerce.items.map((item) => <option key={item.sku} value={item.sku}>{item.name} · {item.onHand} available</option>)}</select></label>
            <label>{extraOrderLines.length ? 'Quantity 1' : 'Quantity'}<input disabled={commerceControlsDisabled} min="1" max={selected?.onHand ?? 1} type="number" value={quantity} onChange={(event) => { setQuantity(Number(event.target.value)); detachPreparedOrderSources() }} /></label>
            <div className="order-total"><span>{manualOrderLineDrafts.length} {manualOrderLineDrafts.length === 1 ? 'item' : 'items'} · {manualOrderQuantity} units</span><strong>{formatMoney(manualOrderTotal)}</strong></div>
          </div>
          {extraOrderLines.map((line, index) => {
            const item = commerce.items.find((candidate) => candidate.sku === line.sku)
            const lineNumber = index + 2
            return <div className="form-row" key={`${index}:${line.sku}`}>
              <label>Item {lineNumber}<select disabled={commerceControlsDisabled} value={line.sku} onChange={(event) => updateExtraOrderLine(index, { sku: event.target.value })}>{!commerce.items.some((candidate) => candidate.sku === line.sku) && line.sku ? <option disabled value={line.sku}>{line.sku} · no longer in Shop</option> : null}{commerce.items.map((candidate) => <option key={candidate.sku} value={candidate.sku}>{candidate.name} · {candidate.onHand} available</option>)}</select></label>
              <label>Quantity {lineNumber}<input disabled={commerceControlsDisabled} max={item?.onHand ?? 1} min="1" onChange={(event) => updateExtraOrderLine(index, { quantity: Number(event.target.value) })} type="number" value={line.quantity} /></label>
              <button aria-label={`Remove item ${lineNumber}`} className="core-button compact" disabled={commerceControlsDisabled} onClick={() => removeExtraOrderLine(index)} type="button">Remove</button>
            </div>
          })}
          <button className="core-button compact" disabled={commerceControlsDisabled || manualOrderLineDrafts.length >= commerce.items.length || manualOrderLineDrafts.length >= 20} onClick={addOrderLine} type="button">Add item</button>
          {!preparedEcommerceDraft ? <details className="order-options" id="commerce-order-options" ref={orderOptionsRef}>
            <summary><span>Channel and payment</span><small>{channel} · {payment || 'Choose payment'}</small></summary>
            <div className="form-row order-options-fields">
              <label>Channel<select disabled={commerceControlsDisabled} value={channel} onChange={(event) => { setChannel(event.target.value); detachPreparedOrderSources() }}><option>Messenger</option><option>Viber</option><option>Phone</option><option>Website</option><option>Ecommerce</option><option>Walk-in</option></select></label>
              <label>Payment<select disabled={commerceControlsDisabled} ref={orderPaymentRef} value={payment} onChange={(event) => { setPayment(event.target.value); detachPreparedOrderSources({ ecommerce: false }) }}><option value="">Choose payment</option><option>KBZPay</option><option>WavePay</option><option>Cash on delivery</option><option>Cash</option><option>Card</option></select></label>
            </div>
          </details> : null}
        </form>
        </div>
        <div className="order-submit-bar" data-ecommerce-payment={preparedEcommerceDraft ? 'true' : 'false'}>
          {preparedEcommerceDraft ? <label className="order-ecommerce-payment"><span>Payment</span><select disabled={commerceControlsDisabled} form="commerce-manual-order-form" ref={orderPaymentRef} required value={payment} onChange={(event) => { setPayment(event.target.value); setPreparedChannelDraft(null) }}><option value="">Choose payment</option><option>KBZPay</option><option>WavePay</option><option>Cash on delivery</option><option>Cash</option><option>Card</option></select></label> : null}
          <button aria-controls={!promisedAt ? 'commerce-order-promise' : !payment && !preparedEcommerceDraft ? 'commerce-order-options' : undefined} className="core-button primary" disabled={commerceControlsDisabled || resumedOrderNeedsReview || orderDraftConflict || Boolean(preparedEcommerceDraft && (!payment || !promisedAt))} form="commerce-manual-order-form" onClick={!preparedEcommerceDraft && (!promisedAt || !payment) ? focusNextOrderRequirement : undefined} ref={orderReviewRef} type={!preparedEcommerceDraft && (!promisedAt || !payment) ? 'button' : 'submit'}>{!promisedAt ? 'Choose promise' : !payment ? 'Choose payment' : resumedOrderNeedsReview ? 'Review current Shop values' : orderDraftConflict ? 'Reload saved draft' : 'Review order'}</button>
        </div>
      </> : null}
    </dialog>
  <ClosedOrderHistory
    canReturn={canReturnOrder}
    disabled={commerceControlsDisabled}
    onCancelReturn={cancelReturnEditor}
    onChangeReturn={(patch) => setReturnDraft((current) => current ? { ...current, ...patch } : current)}
    onOpenReturn={openReturnEditor}
    onReviewReturn={reviewOrderReturn}
    onReturnEditor={(node) => { returnEditorRef.current = node }}
    onReturnTrigger={(orderId, node) => {
      if (node) returnTriggerRefs.current.set(orderId, node)
      else returnTriggerRefs.current.delete(orderId)
    }}
    orders={closedOrders}
    returnDraft={returnDraft}
  />
  <details className="core-panel today-more order-daily-controls">
    <summary><span>Close and exceptions</span><small>{paymentReview.length + lowStock.length} {paymentReview.length + lowStock.length === 1 ? 'item needs' : 'items need'} attention</small></summary>
    <div className="today-more-content">
      <div className="exception-summary"><span><strong>{paymentReview.length}</strong><small>payment review</small></span><span><strong>{lowStock.length}</strong><small>reorder boundaries</small></span></div>
      <div className="boundary-list">{lowStock.map((item) => <Link key={item.sku} to="/shop/?tab=inventory"><strong>{item.name}</strong><small>{item.onHand} on hand</small></Link>)}</div>
      <p className="form-notice">Orders ready: {closePreview?.orderIds.length ? closePreview.orderIds.join(', ') : 'none'} · Payment exceptions: {paymentReview.length ? paymentReview.map((order) => order.id).join(', ') : 'none'} · Stock exceptions: {lowStock.length ? lowStock.map((item) => item.sku).join(', ') : 'none'}</p>
      <button className="core-button" disabled={commerceControlsDisabled || !closePreview} onClick={closeDay} type="button">{closePreview ? 'Save daily close' : legacyCloseNeedsMigration ? 'Close history needs migration' : 'Today is closed'}</button>
      <p className="form-notice" aria-live="polite">{`${closableOrders.length} completed, reconciled orders · ${formatMoney(reconciledValue)} ready to close.`}</p>
      {latestClose?.operator ? <details className="compact-disclosure">
        <summary><span>Last close · {latestClose.businessDate}</span><small>{latestClose.orders} orders · {formatMoney(latestClose.total)}</small></summary>
        <p className="form-notice">{latestClose.operator} · {formatTime(latestClose.createdAt)} · evidence {latestClose.evidenceReference}</p>
        <p className="form-notice">Orders: {latestClose.orderIds?.length ? latestClose.orderIds.join(', ') : 'none'} · Payment exceptions: {latestClose.paymentExceptionOrderIds?.length ? latestClose.paymentExceptionOrderIds.join(', ') : 'none'} · Stock exceptions: {latestClose.stockExceptionSkus?.length ? latestClose.stockExceptionSkus.join(', ') : 'none'}</p>
        {latestCloseDownload ? <a className="core-button" data-close-export="accounting-csv-v1" download={latestCloseDownload.filename} href={latestCloseDownload.href}>Download close CSV</a> : null}
      </details> : null}
      {actionHistory}
    </div>
  </details>
  {actionGate}</div>

  if (tab === 'inventory') return <div className="operation-module">
    {commerceBoundary}
    <section className="core-panel inventory-panel">
      <div className="panel-head"><div><span className="core-eyebrow">Stock</span><h2>Available stock</h2></div><div className="order-queue-actions"><span className="panel-note">{lowStock.length} need attention</span><button aria-controls="stock-count-editor" aria-expanded={Boolean(stockCountDraft)} className="core-button" disabled={commerceControlsDisabled} onClick={openStockCount} ref={stockCountTriggerRef} type="button">{stockCountDraft ? 'Continue count' : 'Count stock'}</button></div></div>
      {stockCountDraft ? <form aria-labelledby="stock-count-title" className="stock-receipt-editor stock-count-editor" id="stock-count-editor" onSubmit={reviewStockCount} ref={stockCountEditorRef}>
        <div className="stock-receipt-copy">
          <span className="core-eyebrow">Stock check</span>
          <h3 id="stock-count-title">Count available units</h3>
          <small id="stock-count-help">Exclude units already set aside for open orders. This records count evidence only.</small>
          <strong aria-live="polite" id="stock-count-preview">{!stockCountItem
            ? 'Choose one item'
            : stockCountQuantityResult === null
              ? `${stockCountItem.onHand.toLocaleString()} recorded · enter counted units`
              : `${stockCountItem.onHand.toLocaleString()} recorded → ${stockCountQuantityResult.toLocaleString()} counted · ${stockCountQuantityResult === stockCountItem.onHand ? 'no variance' : `${stockCountQuantityResult > stockCountItem.onHand ? '+' : ''}${(stockCountQuantityResult - stockCountItem.onHand).toLocaleString()} variance`}`}</strong>
        </div>
        <label>Item<select aria-describedby="stock-count-help" disabled={commerceControlsDisabled} id="stock-count-sku" onChange={(event) => setStockCountDraft((current) => current ? { sku: event.target.value, quantity: '' } : current)} required value={stockCountDraft.sku}><option value="">Choose an item</option>{commerce.items.map((item) => <option key={item.sku} value={item.sku}>{item.name} · {item.sku}</option>)}</select></label>
        <label>Counted available units<input aria-describedby="stock-count-help stock-count-preview" aria-invalid={Boolean(stockCountQuantityText) && stockCountQuantityResult === null} disabled={commerceControlsDisabled || !stockCountItem} id="stock-count-quantity" inputMode="numeric" max={Number.MAX_SAFE_INTEGER} min="0" onChange={(event) => setStockCountDraft((current) => current ? { ...current, quantity: event.target.value } : current)} placeholder="0" required step="1" type="number" value={stockCountDraft.quantity} /></label>
        <div className="form-actions"><button className="core-button" disabled={Boolean(pendingAction)} onClick={cancelStockCount} type="button">Cancel</button><button className="core-button primary" disabled={commerceControlsDisabled || stockCountQuantityResult === null} type="submit">Review count</button></div>
      </form> : null}
      <Suspense fallback={<p className="form-notice" role="status">Loading location stock…</p>}><ShopInventoryFoundation actor={managedIdentity?.email ?? 'Local Shop operator'} catalog={commerce.items} disabled={commerceControlsDisabled} key={`${orderDraftScope}:${commerce.items.map((item) => item.sku).sort().join('|')}`} scope={orderDraftScope} /></Suspense>
      <div className="data-table" role="table" aria-label="Shop stock">
        <div className="data-row table-head" role="row"><span role="columnheader">Item</span><span role="columnheader">Available</span><span role="columnheader">Reorder</span><span role="columnheader">Price</span><span role="columnheader">Next step</span></div>
        {stockRows.map(({ item }) => {
          const active = activePurchaseOrderBySku.get(item.sku)
          const catalogEditing = catalogEditDraft?.sku === item.sku
          const editing = purchaseOrderDraft?.mode === 'create'
            ? purchaseOrderDraft.sku === item.sku
            : purchaseOrderDraft?.mode === 'receive'
              ? purchaseOrderDraft.purchaseOrderId === active?.purchaseOrder.id
              : false
          const stockNeedsAttention = item.onHand <= item.reorderAt
          const stockAttentionLabel = stockNeedsAttention
            ? item.onHand === item.reorderAt ? 'At reorder level' : `${item.reorderAt - item.onHand} below reorder`
            : null
          return <div className="data-row" data-receiving={editing || catalogEditing} data-stock-attention={stockNeedsAttention ? 'true' : 'false'} role="row" key={item.sku}>
            <span role="rowheader"><strong>{item.name}</strong>{stockAttentionLabel ? <small className="stock-attention-label">{stockAttentionLabel}</small> : null}<small>{item.sku}</small></span>
            <span className={stockNeedsAttention ? 'warning-text' : ''} role="cell">{item.onHand}</span>
            <span role="cell">{item.reorderAt}</span>
            <span role="cell">{formatMoney(item.price)}</span>
            <span className="catalog-row-actions" role="cell">
              <button aria-controls="catalog-item-editor" aria-expanded={catalogEditing} aria-label={`Edit price and reorder level for ${item.name}`} className="text-link" disabled={commerceControlsDisabled} ref={(node) => { if (node) catalogEditTriggerRefs.current.set(item.sku, node); else catalogEditTriggerRefs.current.delete(item.sku) }} type="button" onClick={() => openCatalogItemEditor(item.sku)}>{catalogEditing ? 'Editing' : 'Edit'}</button>
              <button aria-expanded={editing} aria-label={active ? `Receive stock for ${item.name}` : `Order stock for ${item.name}`} className="text-link" disabled={commerceControlsDisabled} ref={(node) => { if (node) purchaseOrderTriggerRefs.current.set(item.sku, node); else purchaseOrderTriggerRefs.current.delete(item.sku) }} type="button" onClick={() => openPurchaseOrder(item.sku)}>{editing ? 'Continue' : active ? 'Receive' : stockNeedsAttention ? 'Reorder' : 'Order'}</button>
            </span>
          </div>
        })}
      </div>
      {catalogEditDraft && catalogEditItem ? <form aria-labelledby="catalog-item-editor-title" className="stock-receipt-editor" id="catalog-item-editor" onSubmit={reviewCatalogItemUpdate} ref={catalogEditEditorRef}>
        <div className="stock-receipt-copy">
          <span className="core-eyebrow">Edit item</span>
          <h3 id="catalog-item-editor-title">{catalogEditItem.name}</h3>
          <small>{catalogEditItem.sku} · Only price and reorder level change{catalogEditStale ? ' · reload current values' : ''}</small>
        </div>
        <label>Price (MMK)<input aria-invalid={Boolean(catalogEditPriceText) && catalogEditPriceResult === null} autoFocus disabled={commerceControlsDisabled || catalogEditStale} id="catalog-edit-price" inputMode="numeric" max={Number.MAX_SAFE_INTEGER} min="1" onChange={(event) => setCatalogEditDraft((current) => current ? { ...current, price: event.target.value } : current)} required step="1" type="number" value={catalogEditDraft.price} /></label>
        <label>Reorder at<input aria-invalid={Boolean(catalogEditReorderText) && catalogEditReorderResult === null} disabled={commerceControlsDisabled || catalogEditStale} inputMode="numeric" max={Number.MAX_SAFE_INTEGER} min="0" onChange={(event) => setCatalogEditDraft((current) => current ? { ...current, reorderAt: event.target.value } : current)} required step="1" type="number" value={catalogEditDraft.reorderAt} /></label>
        <div className="form-actions"><button className="core-button" disabled={Boolean(pendingAction)} onClick={cancelCatalogItemEditor} type="button">Cancel</button><button className="core-button primary" disabled={catalogEditStale ? Boolean(pendingAction) || !commerceCanWrite : commerceControlsDisabled || !catalogEditChanged} onClick={catalogEditStale ? () => openCatalogItemEditor(catalogEditItem.sku) : undefined} type={catalogEditStale ? 'button' : 'submit'}>{catalogEditStale ? 'Reload values' : 'Review changes'}</button></div>
      </form> : null}
      {purchaseOrderDraft && purchaseOrderDraftItem ? <form aria-labelledby="purchase-order-title" className="stock-receipt-editor purchase-order-editor" data-mode={purchaseOrderDraft.mode} onSubmit={reviewPurchaseOrder} ref={purchaseOrderEditorRef}>
        <div className="stock-receipt-copy">
          <span className="core-eyebrow">{purchaseOrderDraft.mode === 'create' ? 'Order stock' : 'Receive order'}</span>
          <h3 id="purchase-order-title">{purchaseOrderDraftItem.name}</h3>
          <small>{purchaseOrderDraft.mode === 'create'
            ? `${purchaseOrderDraftItem.sku} · internal record only`
            : `${purchaseOrderDraftOrder?.purchaseOrder.id} · ${purchaseOrderDraftOrder?.purchaseOrder.supplier} · ${purchaseOrderDraftOrder?.purchaseOrder.expectedAt ? `expected ${formatIssueDue(purchaseOrderDraftOrder.purchaseOrder.expectedAt)}` : 'arrival not recorded'}`}</small>
        </div>
        {purchaseOrderDraft.mode === 'create' ? <label>Supplier reference<input autoFocus disabled={commerceControlsDisabled} maxLength={120} onChange={(event) => setPurchaseOrderDraft((current) => current?.mode === 'create' ? { ...current, supplier: event.target.value } : current)} placeholder="Supplier name" required value={purchaseOrderDraft.supplier} /></label> : null}
        {purchaseOrderDraft.mode === 'create' ? <label>Expected arrival<input autoComplete="off" disabled={commerceControlsDisabled} min={localDateTimeInputValue(new Date())} onChange={(event) => setPurchaseOrderDraft((current) => current?.mode === 'create' ? { ...current, expectedAt: event.target.value } : current)} required type="datetime-local" value={purchaseOrderDraft.expectedAt} /></label> : null}
        <label>{purchaseOrderDraft.mode === 'create' ? 'Quantity to order' : 'Quantity received'}<input aria-describedby="stock-receipt-preview" autoFocus={purchaseOrderDraft.mode === 'receive'} disabled={commerceControlsDisabled} inputMode="numeric" max={purchaseOrderQuantityLimit} min="1" onChange={(event) => setPurchaseOrderDraft((current) => current ? { ...current, quantity: event.target.value } : current)} placeholder="10" required step="1" type="number" value={purchaseOrderDraft.quantity} /></label>
        <div aria-live="polite" className="stock-receipt-preview" id="stock-receipt-preview"><small>{purchaseOrderDraft.mode === 'create' ? 'Internal order' : 'New on hand'}</small><strong>{purchaseOrderQuantityResult === null
          ? 'Enter whole units'
          : purchaseOrderDraft.mode === 'create'
            ? `${purchaseOrderQuantityResult.toLocaleString()} units`
            : `${purchaseOrderDraftItem.onHand.toLocaleString()} → ${(purchaseOrderDraftItem.onHand + purchaseOrderQuantityResult).toLocaleString()}`}</strong></div>
        <div className="form-actions"><button className="core-button" disabled={Boolean(pendingAction)} onClick={cancelPurchaseOrderEditor} type="button">Cancel</button><button className="core-button primary" disabled={commerceControlsDisabled || purchaseOrderQuantityResult === null || (purchaseOrderDraft.mode === 'create' && (!purchaseOrderDraft.supplier.trim() || purchaseOrderExpectedAtResult === null))} type="submit">{purchaseOrderDraft.mode === 'create' ? 'Review order' : 'Review receipt'}</button></div>
      </form> : null}
      <details className="compact-disclosure purchase-order-history" id="purchase-orders" ref={purchaseOrderHistoryRef}>
        <summary><span>Purchase orders</span><strong>{purchaseOrderRows.filter(({ progress }) => progress.status === 'open' || progress.status === 'partially_received').length} active · {purchaseOrderRows.length} total</strong></summary>
        {purchaseOrderRows.length ? <div className="purchase-order-list">{purchaseOrderRows.map(({ purchaseOrder, progress, item }) => {
          const arrivalUrgency = commercePurchaseOrderArrivalUrgency(purchaseOrder, progress, purchaseOrderClock)
          return <article key={purchaseOrder.id}>
            <div><strong>{item?.name ?? purchaseOrder.sku}</strong><small>{purchaseOrder.supplier} · {purchaseOrder.id}</small><small data-arrival-risk={arrivalUrgency}>{purchaseOrder.expectedAt
              ? `Expected ${formatIssueDue(purchaseOrder.expectedAt)}${arrivalUrgency === 'late' ? ' · Late' : arrivalUrgency === 'due_soon' ? ' · Due soon' : ''}`
              : 'Arrival not recorded · legacy order'}</small></div>
            <span><strong>{progress.received}/{purchaseOrder.quantityOrdered}</strong><small>{progress.status.replace('_', ' ')}</small></span>
            {progress.remaining > 0 && progress.status !== 'cancelled' ? <button aria-label={`Cancel remainder for ${purchaseOrder.id}`} className="text-link" disabled={commerceControlsDisabled} onClick={() => reviewPurchaseOrderCancellation(purchaseOrder.id)} type="button">Cancel remainder</button> : <small className="purchase-order-closed">{progress.status === 'received' ? 'Complete' : 'Closed'}</small>}
          </article>
        })}</div> : <p className="empty-state">No purchase orders yet. Use Order stock on an item when replenishment is needed.</p>}
      </details>
      <section className="catalog-onboarding-bridge">
        <div><span className="core-eyebrow">Client setup</span><strong>Bring in a catalog through the shared import flow.</strong><p>Use one checked, accountable path for Shop, Plant, Website, and Ecommerce instead of a second Shop-only dry run.</p></div>
        <Link className="core-button" to={clientSetupPath('commerce')}>Set up Shop data</Link>
      </section>
      <details className="compact-disclosure catalog-disclosure">
        <summary>Add catalog item</summary>
        <form className="core-form compact-form catalog-create-form" onSubmit={queueCatalogItem}>
          <div className="form-row"><label>SKU<input disabled={commerceControlsDisabled} maxLength={80} onChange={(event) => setItemDraft((current) => ({ ...current, sku: event.target.value }))} placeholder="SKU-002" required value={itemDraft.sku} /></label><label>Item name<input disabled={commerceControlsDisabled} maxLength={180} onChange={(event) => setItemDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Real item name" required value={itemDraft.name} /></label></div>
          <div className="form-row"><label>Opening stock<input disabled={commerceControlsDisabled} min="0" onChange={(event) => setItemDraft((current) => ({ ...current, onHand: event.target.value }))} required step="1" type="number" value={itemDraft.onHand} /></label><label>Reorder at<input disabled={commerceControlsDisabled} min="0" onChange={(event) => setItemDraft((current) => ({ ...current, reorderAt: event.target.value }))} required step="1" type="number" value={itemDraft.reorderAt} /></label></div>
          <label>Price (MMK)<input disabled={commerceControlsDisabled} min="1" onChange={(event) => setItemDraft((current) => ({ ...current, price: event.target.value }))} required step="1" type="number" value={itemDraft.price} /></label>
          <div className="form-actions"><button className="core-button primary compact" disabled={commerceControlsDisabled} type="submit">Review catalog item</button></div>
          <p className="panel-copy">The opening balance may be zero. A named operator, reason, and evidence are required before the SKU is recorded.</p>
        </form>
      </details>
      <p className="form-notice" aria-live="polite">{commerceStorageError || 'Catalog values, counts, stock orders, receipts, and cancellations require attributable confirmation. Supplier contact, payment, and accounting remain outside this workflow.'}</p>
    </section>
    <StockMovementHistory movements={commerce.movements} />
    {actionGate}
    {actionHistory}
  </div>

  return null
}

function OrderCalculationNote({ order }: { order: CommerceOrder }) {
  if (!order.calculation) return <small data-order-calculation-note="true" data-order-calculation-status="legacy">Recorded total {formatMoney(order.total)} · Tax status not recorded</small>
  return <small data-order-calculation-note="true">Subtotal {formatMoney(order.calculation.subtotalMmk)} · Tax not configured</small>
}

function OrderList({
  orders,
  canCancel,
  disabled,
  onAdvance,
  onCancel,
  onReconcilePayment,
  onSettleRefund,
}: {
  orders: CommerceOrder[]
  canCancel: (id: string) => boolean
  disabled: boolean
  onAdvance: (id: string) => void
  onCancel: (id: string) => void
  onReconcilePayment: (id: string) => void
  onSettleRefund: (id: string) => void
}) {
  const promiseNow = useMinuteClock()
  if (!orders.length) return <Empty>No orders need action.</Empty>
  const nextAction: Record<'confirmed' | 'preparing' | 'ready', string> = { confirmed: 'Start preparing', preparing: 'Mark ready', ready: 'Complete' }
  return <div className="order-list">{orders.map((order) => {
    const active = order.status === 'confirmed' || order.status === 'preparing' || order.status === 'ready'
    const needsPayment = order.paymentStatus === 'pending'
    const reconcileIsPrimary = needsPayment && (order.status === 'ready' || order.status === 'completed')
    const canAdvance = active && !reconcileIsPrimary
    const promiseUrgency = active ? commerceOrderPromiseUrgency(order, promiseNow) : 'scheduled'
    return <article key={order.id}>
      <div>
        <div className="order-statuses">
          <span className={`status-pill ${order.status === 'completed' ? 'approved' : order.status === 'cancelled' ? 'pending' : 'bounded'}`}>{order.status}</span>
          <span className={`status-pill ${order.paymentStatus === 'reconciled' ? 'approved' : 'pending'}`}>payment {order.paymentStatus}</span>
          {order.refundStatus === 'due' ? <span className="status-pill pending">refund due</span> : null}
          {promiseUrgency === 'late' ? <span className="status-pill pending">late</span> : null}
          {promiseUrgency === 'due_soon' ? <span className="status-pill bounded">due soon</span> : null}
          {promiseUrgency === 'unrecorded' ? <span className="status-pill pending">promise missing</span> : null}
        </div>
        <strong>{order.customer} · {order.lines
          ? order.lines.length === 1
            ? `${order.lines[0].name} × ${order.quantity}`
            : `${order.lines.length} items · ${order.quantity} units`
          : `${order.item} × ${order.quantity}`}</strong>
        {order.lines ? <small>{order.lines.map((line) => `${line.name} × ${line.quantity} @ ${line.unitPriceMmk.toLocaleString()} MMK`).join(' · ')}</small> : null}
        <OrderCalculationNote order={order} />
        <small>{order.id} · {order.owner ? `owner ${order.owner}` : 'owner not recorded'} · {order.channel} · {order.payment}{order.fulfilment ? ` · ${fulfilmentLabel(order.fulfilment)}` : ''}{order.fulfilmentReference ? ` · ${order.fulfilmentReference}` : ''} · {order.promisedAt ? `promised ${formatTime(order.promisedAt)}` : 'promise not recorded'} · created {formatTime(order.createdAt)}</small>
        {order.refundStatus === 'due' ? <small role="note">Record a refund already completed with the external payment provider. This does not send money.</small> : null}
      </div>
      <div className="order-row-actions">
        <b>{formatMoney(order.total)}</b>
        {reconcileIsPrimary ? <button className="text-link" disabled={disabled} onClick={() => onReconcilePayment(order.id)} type="button">Reconcile payment</button> : null}
        {order.refundStatus === 'due' ? <button className="text-link" disabled={disabled} onClick={() => onSettleRefund(order.id)} type="button">Record settled refund</button> : null}
        {canAdvance ? <button className="text-link" disabled={disabled} onClick={() => onAdvance(order.id)} type="button">{nextAction[order.status as 'confirmed' | 'preparing' | 'ready']}</button> : null}
        {active && canCancel(order.id) ? <button className="text-link subtle" disabled={disabled} onClick={() => onCancel(order.id)} type="button">Cancel</button> : null}
      </div>
    </article>
  })}</div>
}

function ClosedOrderHistory({
  canReturn,
  disabled,
  onCancelReturn,
  onChangeReturn,
  onOpenReturn,
  onReviewReturn,
  onReturnEditor,
  onReturnTrigger,
  orders,
  returnDraft,
}: {
  canReturn: (orderId: string) => boolean
  disabled: boolean
  onCancelReturn: () => void
  onChangeReturn: (patch: Partial<CommerceReturnDraft>) => void
  onOpenReturn: (orderId: string) => void
  onReviewReturn: (event: FormEvent) => void
  onReturnEditor: (node: HTMLFormElement | null) => void
  onReturnTrigger: (orderId: string, node: HTMLButtonElement | null) => void
  orders: CommerceOrder[]
  returnDraft: CommerceReturnDraft | null
}) {
  const [page, setPage] = useState(0)
  if (!orders.length) return null
  const pageSize = 8
  const pageCount = Math.ceil(orders.length / pageSize)
  const currentPage = Math.min(page, pageCount - 1)
  const visibleOrders = orders.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
  return <details className="order-archive">
    <summary><span>Completed and cancelled orders</span><small>{orders.length} {orders.length === 1 ? 'record' : 'records'} · returns here</small></summary>
    <div className="order-archive-list">{visibleOrders.map((order) => {
      const lines = commerceOrderReturnLines(order).map((line) => {
        const returned = (order.returns ?? [])
          .filter((record) => record.sku === line.sku)
          .reduce((sum, record) => sum + record.quantity, 0)
        return { ...line, returned, remaining: line.quantity - returned }
      })
      const availableLines = lines.filter((line) => line.remaining > 0)
      const draftedLine = returnDraft?.orderId === order.id
        ? availableLines.find((line) => line.sku === returnDraft.sku)
        : undefined
      const activeReturnDraft = draftedLine && returnDraft?.orderId === order.id ? returnDraft : null
      const editing = activeReturnDraft !== null
      const selectedLine = draftedLine ?? availableLines[0]
      const returnable = canReturn(order.id)
      return <article className={editing ? 'is-returning' : undefined} key={order.id}>
      <div className="order-archive-main">
        <strong>{order.customer} · {order.lines
          ? order.lines.length === 1
            ? `${order.lines[0].name} × ${order.quantity}`
            : `${order.lines.length} items · ${order.quantity} units`
          : `${order.item} × ${order.quantity}`}</strong>
        {order.lines ? <small>{order.lines.map((line) => `${line.name} × ${line.quantity} @ ${line.unitPriceMmk.toLocaleString()} MMK`).join(' · ')}</small> : null}
        <OrderCalculationNote order={order} />
        <small>{order.id} · {order.owner ? `owner ${order.owner}` : 'owner not recorded'} · {order.status} · payment {order.paymentStatus}{order.refundStatus !== 'none' ? ` · refund ${order.refundStatus}` : ''}{order.fulfilment ? ` · ${fulfilmentLabel(order.fulfilment)}` : ''}{order.fulfilmentReference ? ` · ${order.fulfilmentReference}` : ''} · {order.promisedAt ? `promised ${formatTime(order.promisedAt)}` : 'promise not recorded'} · created {formatTime(order.createdAt)}</small>
        {order.refundStatus === 'settled' && order.refundSettledAt && order.refundSettledBy && order.refundEvidenceReference ? <small role="note">{order.refundSettledBy} · {formatTime(order.refundSettledAt)} · evidence {order.refundEvidenceReference}</small> : null}
        {order.status === 'completed' && order.completion ? <small role="note">Completed by {order.completion.actor} · {formatTime(order.completion.capturedAt)} · evidence {order.completion.evidenceReference}</small> : null}
        {order.status === 'completed' && !order.completion ? <small role="note">Return unavailable: this older order has no attributable completion proof.</small> : null}
        {order.status === 'completed' && order.completion && availableLines.length > 0 && !returnable ? <small role="note">Return unavailable: the sold quantity cannot be matched to an attributable stock reservation.</small> : null}
      </div>
      <div className="order-archive-actions">
        <b>{formatMoney(order.total)}</b>
        {order.status === 'completed' && (returnable || editing) ? <button
          aria-expanded={editing}
          className="text-link"
          disabled={disabled}
          onClick={() => editing ? onCancelReturn() : onOpenReturn(order.id)}
          ref={(node) => { onReturnTrigger(order.id, node) }}
          type="button"
        >{editing ? 'Close return' : 'Record return'}</button> : null}
      </div>
      {order.returns?.length ? <div className="order-return-records" role="list">
        {order.returns.map((record) => <div key={record.actionId} role="listitem">
          <strong>{record.quantity} {record.sku} returned · {record.disposition === 'restock' ? 'restocked' : 'not restocked'}</strong>
          <small>{record.actor} · {formatTime(record.createdAt)} · evidence {record.evidenceReference}</small>
        </div>)}
      </div> : null}
      {activeReturnDraft && selectedLine ? <form aria-label={`Return items from ${order.id}`} className="order-return-editor" onSubmit={onReviewReturn} ref={onReturnEditor}>
        <div className="order-return-copy"><span className="core-eyebrow">Return</span><strong>{order.id}</strong><small>Record received goods only. Payment and order totals do not change.</small></div>
        <label>Item<select disabled={disabled || availableLines.length === 1} onChange={(event) => onChangeReturn({ sku: event.target.value, quantity: '1' })} value={selectedLine.sku}>{availableLines.map((line) => <option key={line.sku} value={line.sku}>{line.name} · {line.remaining} left</option>)}</select></label>
        <label>Quantity<input disabled={disabled} id="order-return-quantity" max={selectedLine.remaining} min="1" onChange={(event) => onChangeReturn({ quantity: event.target.value })} required step="1" type="number" value={activeReturnDraft.quantity} /></label>
        <label>Stock result<select disabled={disabled} onChange={(event) => onChangeReturn({ disposition: event.target.value as CommerceReturnDisposition })} value={activeReturnDraft.disposition}><option value="restock">Sellable · add to stock</option><option value="not_restocked">Not sellable · stock unchanged</option></select></label>
        <div className="form-actions"><button className="core-button primary compact" disabled={disabled} type="submit">Review return</button><button className="core-button compact" disabled={disabled} onClick={onCancelReturn} type="button">Cancel</button></div>
      </form> : null}
    </article>})}</div>
    {pageCount > 1 ? <nav aria-label="Closed order pages" className="order-archive-pagination">
      <button className="text-link" disabled={currentPage === 0} onClick={() => setPage((current) => Math.max(0, current - 1))} type="button">Previous</button>
      <span>Page {currentPage + 1} of {pageCount}</span>
      <button className="text-link" disabled={currentPage === pageCount - 1} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} type="button">Next</button>
    </nav> : null}
  </details>
}

function StockMovementHistory({ movements }: { movements: CommerceStockMovement[] }) {
  return <details className="core-panel action-history stock-movement-history">
    <summary><span>Stock movements</span><strong>{movements.length} attributable entries</strong></summary>
    {movements.length ? <div className="action-history-list">{movements.map((movement) => <article key={movement.id}>
      <div>
        <strong>{movement.kind === 'count'
          ? `count · ${movement.sku} · ${movement.expectedQuantity} → ${movement.countedQuantity} · ${movement.quantityDelta === 0 ? 'no variance' : `${movement.quantityDelta > 0 ? '+' : ''}${movement.quantityDelta}`}`
          : `${movement.kind} · ${movement.sku} · ${movement.quantityDelta > 0 ? '+' : ''}${movement.quantityDelta}`}</strong>
        <small>{movement.orderId ? `${movement.orderId} · ` : ''}{movement.actionId} · {movement.actor}</small>
        <p>{movement.reason} · Evidence: {movement.evidenceReference}</p>
      </div>
      <small>{formatTime(movement.createdAt)}</small>
    </article>)}</div> : <Empty>No attributable stock movements yet.</Empty>}
  </details>
}

const productionEventLabels: Record<ProductionEvent['kind'], string> = {
  job_created: 'Job created',
  job_schedule_updated: 'Job plan updated',
  job_closed: 'Job closed short',
  output_recorded: 'Output recorded',
  material_consumed: 'Material used',
  issue_opened: 'Issue opened',
  issue_resolved: 'Issue resolved',
  quality_hold_placed: 'Quality hold placed',
  quality_hold_released: 'Quality hold released',
  machine_state_changed: 'Machine state changed',
  downtime_started: 'Downtime started',
  downtime_ended: 'Downtime ended',
  maintenance_started: 'Maintenance started',
  maintenance_completed: 'Maintenance completed',
}

const productionMaterialUnitLabels: Record<ProductionMaterialUnit, string> = {
  kg: 'kg',
  g: 'g',
  l: 'L',
  ml: 'ml',
  pcs: 'pieces',
  pack: 'packs',
  bag: 'bags',
  roll: 'rolls',
  sheet: 'sheets',
  m: 'm',
  cm: 'cm',
}

function formatDowntimeDuration(durationMs: number) {
  const totalMinutes = Math.max(0, Math.floor(durationMs / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (!hours) return `${totalMinutes} min`
  return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`
}

function productionJobPlanEventDetail(event: ProductionEvent) {
  const previousSchedule = event.fromJobPriority && event.fromJobDueAt
    ? `${productionJobPriorityLabels[event.fromJobPriority]} / ${formatIssueDue(event.fromJobDueAt)}`
    : 'Legacy unscheduled'
  const nextSchedule = `${productionJobPriorityLabels[event.jobPriority ?? 'normal']} / ${formatIssueDue(event.jobDueAt ?? event.createdAt)}`
  const previousOwner = event.fromJobOwner ? `owner ${event.fromJobOwner}` : 'owner not recorded'
  const nextOwner = event.jobOwner ? `owner ${event.jobOwner}` : 'owner not recorded (legacy)'
  return ` - ${previousSchedule} / ${previousOwner} to ${nextSchedule} / ${nextOwner}`
}

function ProductionEventHistory({ events }: { events: ProductionEvent[] }) {
  const [showAll, setShowAll] = useState(false)
  const visibleEvents = showAll ? events : events.slice(0, 8)
  return <details className="core-panel action-history production-event-history">
    <summary><span>Plant record</span><strong>{events.length} attributed events</strong></summary>
    {visibleEvents.length ? <div className="action-history-list">{visibleEvents.map((event) => <article key={event.id}>
      <div>
        <strong>{event.kind === 'output_recorded' ? event.outputKind === 'scrap' ? 'Scrap recorded' : 'Good output recorded' : productionEventLabels[event.kind]} - {event.summary}</strong>
        <small>{event.subjectId} - {event.actionId} - {event.actor}{event.kind === 'output_recorded' ? ` - Shift: ${event.shiftRef ?? 'Unassigned (legacy)'}` : event.kind === 'material_consumed' ? ` - Shift: ${event.shiftRef} - ${event.quantity} ${event.materialUnit} ${event.materialRef}${event.materialLot ? ` - Lot: ${event.materialLot}` : ''}` : event.kind === 'job_schedule_updated' ? productionJobPlanEventDetail(event) : event.kind === 'job_closed' ? ` - Shift: ${event.shiftRef} - ${event.remainingQuantity} not produced` : event.kind === 'maintenance_started' ? ` - Owner: ${event.maintenanceOwner}` : event.kind === 'maintenance_completed' ? ` - Start action: ${event.maintenanceStartActionId}` : ''}</small>
        <p>{event.reason} - Evidence: {event.evidenceReference}</p>
      </div>
      <small>{formatTime(event.createdAt)}</small>
    </article>)}</div> : <Empty>No attributed Plant event has been recorded yet.</Empty>}
    {events.length > 8 ? <button className="text-link" type="button" onClick={() => setShowAll((current) => !current)}>{showAll ? 'Show latest 8' : `Show all ${events.length}`}</button> : null}
  </details>
}

function ProductionPage({ managedIdentity, tab }: { managedIdentity: ManagedIdentity | null; tab: ProductionTab }) {
  const [production, mutateProduction, productionStorageError, workspaceMode, managedVersion, managedWorkspaceId, productionCanWrite] = useProductionWorkspace(managedIdentity)
  const [, setActions] = useStoredState<AccountableAction[]>(ACTION_KEY, [], normalizeActions)
  const [pendingAction, setPendingAction] = useState<PendingAccountableAction | null>(null)
  const [jobId, setJobId] = useState(production.jobs[0]?.id ?? '')
  const [holdJobId, setHoldJobId] = useState(production.jobs.find((job) => !job.qualityHold && !job.closure)?.id ?? '')
  const [handoffShiftRef, setHandoffShiftRef] = useState('')
  const [shiftHandoff, setShiftHandoff] = useState<ProductionShiftHandoff | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [outputKind, setOutputKind] = useState<ProductionOutputKind>('good')
  const [shiftRef, setShiftRef] = useState('')
  const [materialDraft, setMaterialDraft] = useState({
    jobId: production.jobs.find((job) => !job.closure && job.output + (job.scrap ?? 0) < job.target)?.id ?? '',
    materialRef: '',
    materialLot: '',
    quantity: '1',
    materialUnit: 'kg' as ProductionMaterialUnit,
  })
  const [area, setArea] = useState('Line 01')
  const [kind, setKind] = useState<ProductionIssue['kind']>('quality')
  const [severity, setSeverity] = useState<ProductionIssueSeverity>('medium')
  const [issueOwner, setIssueOwner] = useState('')
  const [issueDueInput, setIssueDueInput] = useState(defaultIssueDueInput)
  const [containment, setContainment] = useState('')
  const [summary, setSummary] = useState('')
  const [issueClock, setIssueClock] = useState(Date.now)
  const [issueDialogOpen, setIssueDialogOpen] = useState(false)
  const [machineObservation, setMachineObservation] = useState<{ machineId: string; toState: ProductionMachineState } | null>(null)
  const [downtimeDialogOpen, setDowntimeDialogOpen] = useState(false)
  const [downtimeMachineId, setDowntimeMachineId] = useState(production.machines[0]?.id ?? '')
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false)
  const [maintenanceMachineId, setMaintenanceMachineId] = useState(production.machines[0]?.id ?? '')
  const [maintenanceOwner, setMaintenanceOwner] = useState('')
  const [jobDraft, setJobDraft] = useState<{ id: string; line: string; product: string; target: string; owner: string; priority: ProductionJobPriority; dueAt: string }>({
    id: '',
    line: '',
    product: '',
    target: '',
    owner: '',
    priority: 'normal',
    dueAt: defaultJobDueInput(),
  })
  const [scheduleDraft, setScheduleDraft] = useState<{ jobId: string; owner: string; priority: ProductionJobPriority; dueAt: string } | null>(null)
  const [notice, setNotice] = useState('')
  const [actionTrigger, setActionTrigger] = useState<HTMLElement | null>(null)
  const [planDraft, setPlanDraft] = useState<{ jobId: string; line: string; product: string; target: string; owner: string; priority: ProductionJobPriority; dueAt: string; machineId: string; machineName: string; reason: string; evidenceReference: string }>({
    jobId: '',
    line: '',
    product: '',
    target: '',
    owner: '',
    priority: 'normal',
    dueAt: defaultJobDueInput(),
    machineId: '',
    machineName: '',
    reason: '',
    evidenceReference: '',
  })
  const [planBusy, setPlanBusy] = useState(false)
  const [planError, setPlanError] = useState('')
  const issueDialogRef = useRef<HTMLDialogElement>(null)
  const issueTriggerRef = useRef<HTMLButtonElement>(null)
  const machineDialogRef = useRef<HTMLDialogElement>(null)
  const machineTriggerRef = useRef<HTMLButtonElement | null>(null)
  const downtimeDialogRef = useRef<HTMLDialogElement>(null)
  const downtimeTriggerRef = useRef<HTMLButtonElement>(null)
  const maintenanceDialogRef = useRef<HTMLDialogElement>(null)
  const maintenanceTriggerRef = useRef<HTMLButtonElement>(null)
  const scheduleDialogRef = useRef<HTMLDialogElement>(null)
  const scheduleTriggerRef = useRef<HTMLButtonElement | null>(null)
  const outputJobSelectRef = useRef<HTMLSelectElement>(null)
  const openIssues = production.issues
    .filter((issue) => issue.status === 'open')
    .sort((left, right) => {
      const severityDifference = (left.severity ? productionIssueSeverityRank[left.severity] : 4)
        - (right.severity ? productionIssueSeverityRank[right.severity] : 4)
      if (severityDifference) return severityDifference
      return (left.dueAt ? Date.parse(left.dueAt) : Number.POSITIVE_INFINITY)
        - (right.dueAt ? Date.parse(right.dueAt) : Number.POSITIVE_INFINITY)
    })
  const resolvedIssues = production.issues.filter((issue) => issue.status === 'resolved')
  const urgentIssueCount = openIssues.filter((issue) => issue.severity === 'critical' || issue.severity === 'high').length
  const heldJobs = production.jobs.filter((job) => Boolean(job.qualityHold))
  const holdableJobs = production.jobs.filter((job) => !job.qualityHold && !job.closure)
  const selectedHoldJobId = holdableJobs.some((job) => job.id === holdJobId) ? holdJobId : holdableJobs[0]?.id ?? ''
  const selectedHoldJob = holdableJobs.find((job) => job.id === selectedHoldJobId)
  const activeJobs = production.jobs
    .filter((job) => !job.closure && job.output + (job.scrap ?? 0) < job.target)
    .sort(compareProductionJobSchedule)
  const completedJobs = production.jobs.filter((job) => Boolean(job.closure) || job.output + (job.scrap ?? 0) >= job.target)
  const selectedJobId = activeJobs.some((job) => job.id === jobId) ? jobId : activeJobs[0]?.id ?? ''
  const selectedJob = activeJobs.find((job) => job.id === selectedJobId)
  const selectedRemaining = selectedJob ? selectedJob.target - selectedJob.output - (selectedJob.scrap ?? 0) : 0
  const selectedMaterialJob = activeJobs.find((job) => job.id === materialDraft.jobId)
  const materialJobIsStale = Boolean(materialDraft.jobId && !selectedMaterialJob)
  const parsedMaterialQuantity = parseProductionMaterialQuantity(materialDraft.quantity)
  const materialQuantityError = parsedMaterialQuantity === null
    ? 'Enter a positive amount with up to three decimals that can be stored exactly (maximum 9,007,199,254,740.99).'
    : ''
  const materialEntries = production.events.filter((event) => event.kind === 'material_consumed')
  const recentMaterialEntries = materialEntries.slice(0, 5)
  const canonicalShiftRef = shiftRef.trim()
  const currentShiftOutput = productionShiftOutput(production, canonicalShiftRef)
  const currentProductionCanonical = shiftHandoff ? productionStateCanonical(production) : ''
  const shiftHandoffIsCurrent = Boolean(shiftHandoff
    && shiftHandoff.sourceRevision === production.revision
    && shiftHandoff.sourceCanonical === currentProductionCanonical
    && shiftHandoff.shiftRef === handoffShiftRef.trim())
  const observedMachine = machineObservation
    ? production.machines.find((machine) => machine.id === machineObservation.machineId)
    : undefined
  const machineObservationTargets = observedMachine
    ? productionMachineStates.filter((state) => state !== observedMachine.state)
    : []
  const downtimeIntervals = productionDowntimeIntervals(production)
  const openDowntimeIntervals = downtimeIntervals.filter((interval) => !interval.end)
  const recentDowntimeIntervals = downtimeIntervals.filter((interval) => interval.end).slice(0, 3)
  const downtimeMachineIds = new Set(openDowntimeIntervals.map((interval) => interval.machineId))
  const availableDowntimeMachines = production.machines.filter((machine) => !downtimeMachineIds.has(machine.id))
  const selectedDowntimeMachineId = availableDowntimeMachines.some((machine) => machine.id === downtimeMachineId)
    ? downtimeMachineId
    : availableDowntimeMachines[0]?.id ?? ''
  const selectedDowntimeMachine = availableDowntimeMachines.find((machine) => machine.id === selectedDowntimeMachineId)
  const maintenanceRecords = productionMaintenanceRecords(production)
  const openMaintenanceRecords = maintenanceRecords.filter((record) => !record.completion)
  const recentMaintenanceRecords = maintenanceRecords.filter((record) => record.completion).slice(0, 3)
  const maintenanceMachineIds = new Set(openMaintenanceRecords.map((record) => record.machineId))
  const availableMaintenanceMachines = production.machines.filter((machine) => !maintenanceMachineIds.has(machine.id))
  const selectedMaintenanceMachineId = availableMaintenanceMachines.some((machine) => machine.id === maintenanceMachineId)
    ? maintenanceMachineId
    : availableMaintenanceMachines[0]?.id ?? ''
  const selectedMaintenanceMachine = availableMaintenanceMachines.find((machine) => machine.id === selectedMaintenanceMachineId)

  useEffect(() => {
    const timer = window.setInterval(() => setIssueClock(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const dialog = issueDialogRef.current
    if (!dialog) return
    if (issueDialogOpen && !dialog.open) {
      dialog.showModal()
      requestAnimationFrame(() => dialog.querySelector('textarea')?.focus())
    }
    if (!issueDialogOpen && dialog.open) dialog.close()
  }, [issueDialogOpen, tab])

  useEffect(() => {
    const dialog = machineDialogRef.current
    if (!dialog) return
    if (machineObservation && !dialog.open) {
      dialog.showModal()
      requestAnimationFrame(() => dialog.querySelector('select')?.focus())
    }
    if (!machineObservation && dialog.open) dialog.close()
  }, [machineObservation, tab])

  useEffect(() => {
    const dialog = downtimeDialogRef.current
    if (!dialog) return
    if (downtimeDialogOpen && !dialog.open) {
      dialog.showModal()
      requestAnimationFrame(() => dialog.querySelector<HTMLElement>('[data-downtime-primary]')?.focus())
    }
    if (!downtimeDialogOpen && dialog.open) dialog.close()
  }, [downtimeDialogOpen, tab])

  useEffect(() => {
    const dialog = maintenanceDialogRef.current
    if (!dialog) return
    if (maintenanceDialogOpen && !dialog.open) {
      dialog.showModal()
      requestAnimationFrame(() => dialog.querySelector<HTMLElement>('[data-maintenance-primary]')?.focus())
    }
    if (!maintenanceDialogOpen && dialog.open) dialog.close()
  }, [maintenanceDialogOpen, tab])

  useEffect(() => {
    const dialog = scheduleDialogRef.current
    if (!dialog) return
    if (scheduleDraft && !dialog.open) {
      dialog.showModal()
      requestAnimationFrame(() => dialog.querySelector('select')?.focus())
    }
    if (!scheduleDraft && dialog.open) dialog.close()
  }, [scheduleDraft, tab])

  async function initializeManagedProduction(event: FormEvent) {
    event.preventDefault()
    if (!managedIdentity) return
    const firstJobId = planDraft.jobId.trim().toUpperCase()
    const line = planDraft.line.trim()
    const product = planDraft.product.trim()
    const owner = planDraft.owner.trim()
    const jobTarget = Number(planDraft.target)
    const jobDueAt = new Date(planDraft.dueAt)
    const machineId = planDraft.machineId.trim().toUpperCase()
    const machineName = planDraft.machineName.trim()
    const reason = planDraft.reason.trim()
    const evidenceReference = planDraft.evidenceReference.trim()
    if (!firstJobId || !line || !product || !owner || owner.length > 120 || !machineId || !machineName || !reason || !evidenceReference || !Number.isSafeInteger(jobTarget) || jobTarget < 1 || Number.isNaN(jobDueAt.getTime()) || jobDueAt.getTime() <= Date.now()) {
      setPlanError('Enter one real job with an owner and future due time, one machine, a whole-number target, reason, and evidence reference.')
      return
    }
    const proof: ProductionActionProof = {
      actionId: uid('ACT'),
      capturedAt: new Date().toISOString(),
      actor: managedIdentity.userId,
      reason,
      evidenceReference,
    }
    setPlanBusy(true)
    setPlanError('')
    try {
      await mutateProduction('production.workspace.initialized', commandUuid(), proof, (current) => current.jobs.length || current.issues.length || current.machines.length || current.events.length ? null : validateProductionState({
        ...current,
        jobs: [{ id: firstJobId, line, product, target: jobTarget, output: 0, owner, priority: planDraft.priority, dueAt: jobDueAt.toISOString() }],
        machines: [{ id: machineId, name: machineName, state: 'running' }],
      }))
      setJobId(firstJobId)
      setNotice(`Managed Plant initialized with ${firstJobId}.`)
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : 'The managed Plant plan was not initialized.')
    } finally {
      setPlanBusy(false)
    }
  }

  const effectiveMode = managedIdentity && (workspaceMode === 'local' || managedWorkspaceId !== managedIdentity.workspaceId) ? 'managed-loading' : workspaceMode
  if (managedIdentity && effectiveMode !== 'managed-ready') {
    const unprovisioned = effectiveMode === 'managed-unprovisioned'
    if (unprovisioned) return <section className="core-panel managed-commerce-boundary">
      <div className="panel-head"><div><span className="core-eyebrow">Managed Plant setup</span><h2>Create the real operating plan</h2></div><span className="status-pill pending">Not provisioned</span></div>
      <p className="panel-copy">Start with one real job and one machine. No browser demo jobs, issues, equipment, or output are copied into this workspace.</p>
      <form className="core-form compact-form" onSubmit={(formEvent) => void initializeManagedProduction(formEvent)}>
        <div className="form-row"><label>Job ID<input maxLength={80} onChange={(inputEvent) => setPlanDraft((current) => ({ ...current, jobId: inputEvent.target.value }))} placeholder="JOB-001" required value={planDraft.jobId} /></label><label>Line or team<input maxLength={120} onChange={(inputEvent) => setPlanDraft((current) => ({ ...current, line: inputEvent.target.value }))} placeholder="Line 01" required value={planDraft.line} /></label></div>
        <div className="form-row"><label>Product or batch<input maxLength={180} onChange={(inputEvent) => setPlanDraft((current) => ({ ...current, product: inputEvent.target.value }))} placeholder="Product name" required value={planDraft.product} /></label><label>Target units<input min="1" onChange={(inputEvent) => setPlanDraft((current) => ({ ...current, target: inputEvent.target.value }))} required step="1" type="number" value={planDraft.target} /></label></div>
        <div className="form-row"><label>Priority<select onChange={(inputEvent) => setPlanDraft((current) => ({ ...current, priority: inputEvent.target.value as ProductionJobPriority }))} value={planDraft.priority}>{productionJobPriorities.map((priority) => <option key={priority} value={priority}>{productionJobPriorityLabels[priority]}</option>)}</select></label><label>Due time<input autoComplete="off" min={localDateTimeInputValue(new Date())} onChange={(inputEvent) => setPlanDraft((current) => ({ ...current, dueAt: inputEvent.target.value }))} required type="datetime-local" value={planDraft.dueAt} /></label></div>
        <label>Responsible owner<input autoComplete="off" maxLength={120} onChange={(inputEvent) => setPlanDraft((current) => ({ ...current, owner: inputEvent.target.value }))} placeholder="Named person or role" required value={planDraft.owner} /></label>
        <div className="form-row"><label>Machine ID<input maxLength={80} onChange={(inputEvent) => setPlanDraft((current) => ({ ...current, machineId: inputEvent.target.value }))} placeholder="MC-01" required value={planDraft.machineId} /></label><label>Machine name<input maxLength={180} onChange={(inputEvent) => setPlanDraft((current) => ({ ...current, machineName: inputEvent.target.value }))} placeholder="Mixer 01" required value={planDraft.machineName} /></label></div>
        <label>Opening plan reason<input maxLength={180} onChange={(inputEvent) => setPlanDraft((current) => ({ ...current, reason: inputEvent.target.value }))} placeholder="How this job and target were confirmed" required value={planDraft.reason} /></label>
        <label>Evidence reference<input maxLength={180} onChange={(inputEvent) => setPlanDraft((current) => ({ ...current, evidenceReference: inputEvent.target.value }))} placeholder="Shift plan, work order, or count sheet" required value={planDraft.evidenceReference} /></label>
        <div className="form-actions"><Link className="text-link" to="/settings/">Workspace settings</Link><button className="core-button primary" disabled={planBusy} type="submit">{planBusy ? 'Creating…' : 'Create managed plan'}</button></div>
        <p className="form-notice" role="status">{planError || productionStorageError || `Authenticated as ${managedIdentity.email}. The tenant API records this initialization.`}</p>
      </form>
    </section>
    return <section className="core-panel managed-commerce-boundary">
      <div className="panel-head"><div><span className="core-eyebrow">Managed Plant</span><h2>{effectiveMode === 'managed-error' ? 'Managed workspace unavailable' : 'Loading authenticated workspace'}</h2></div><span className="status-pill bounded">{effectiveMode === 'managed-error' ? 'Blocked' : 'Checking'}</span></div>
      <p className="panel-copy">{productionStorageError || 'Plant remains read-only until the authenticated tenant state is confirmed.'}</p>
      <div className="form-actions"><Link className="core-button" to="/settings/">Open workspace settings</Link></div>
    </section>
  }

  function queueAction(
    action: Omit<PendingAccountableAction, 'id' | 'commandId' | 'domain'>,
    trigger?: HTMLElement | null,
  ): boolean {
    if (!productionCanWrite) {
      setNotice('Plant changes are paused because this workspace cannot confirm writes. Reload or open Settings before retrying.')
      return false
    }
    if (pendingAction) {
      setNotice(`Finish or cancel ${pendingAction.id} before reviewing another change.`)
      return false
    }
    setActionTrigger(trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null))
    setPendingAction({ ...action, id: uid('ACT'), commandId: commandUuid(), domain: 'production' })
    setNotice('Review the change, accountable operator, and evidence before it is applied.')
    return true
  }

  async function confirmAction(details: ActionDetails) {
    if (!pendingAction) return
    const action = pendingAction
    const record = confirmAccountableAction(action, details)
    if (!action.confirmation) {
      setPendingAction((current) => current?.id === action.id
        ? { ...current, confirmation: record }
        : current)
    }
    try {
      await action.apply(record)
    } catch (error) {
      if (error instanceof PlantReviewRequiredError) {
        setPendingAction(null)
        setNotice(error.message)
      }
      throw error
    }
    if (!managedIdentity) setActions((current) => [record, ...current])
    setNotice(managedIdentity ? `${record.id} confirmed by the managed Plant API.` : `${record.id} persisted with attributed Plant evidence.`)
    setPendingAction(null)
  }

  function recordOutput(event: FormEvent) {
    event.preventDefault()
    const recordedShiftRef = shiftRef.trim()
    if (!recordedShiftRef || recordedShiftRef.length > 80) return setNotice('Enter a shift reference of 1 to 80 characters.')
    if (!Number.isSafeInteger(quantity) || quantity < 1) return setNotice('Enter a whole-unit quantity of at least 1.')
    if (!selectedJob) return setNotice('Choose an active job before recording output.')
    if (selectedRemaining < 1) return setNotice(`${selectedJob.id} is already at target.`)
    if (quantity > selectedRemaining) return setNotice(`Only ${selectedRemaining} units remain for ${selectedJob.id}. Nothing was recorded.`)
    const recordedJobId = selectedJob.id
    const recordedQuantity = quantity
    const recordedOutputKind = outputKind
    const recordedScrap = selectedJob.scrap ?? 0
    const recordedShiftOutput = productionShiftOutput(production, recordedShiftRef)
    const resultLabel = recordedOutputKind === 'scrap' ? 'scrap units' : 'good units'
    const nextGood = selectedJob.output + (recordedOutputKind === 'good' ? recordedQuantity : 0)
    const nextScrap = recordedScrap + (recordedOutputKind === 'scrap' ? recordedQuantity : 0)
    setShiftRef(recordedShiftRef)
    queueAction({
      kind: recordedOutputKind === 'scrap' ? 'production_scrap' : 'production_output',
      subjectId: recordedJobId,
      summary: `Record ${recordedQuantity} ${resultLabel} for ${recordedJobId} · ${recordedShiftRef}`,
      before: `${selectedJob.output} good · ${recordedScrap} scrap · ${recordedShiftOutput.goodUnits} good / ${recordedShiftOutput.scrapUnits} scrap this shift`,
      after: `${nextGood} good · ${nextScrap} scrap · ${recordedShiftOutput.goodUnits + (recordedOutputKind === 'good' ? recordedQuantity : 0)} good / ${recordedShiftOutput.scrapUnits + (recordedOutputKind === 'scrap' ? recordedQuantity : 0)} scrap this shift`,
      apply: async (record) => {
        await mutateProduction('production.output.recorded', record.commandId, productionActionProof(record), (current) => recordedOutputKind === 'scrap'
          ? recordProductionScrap(current, recordedJobId, recordedQuantity, recordedShiftRef, productionActionProof(record))
          : recordProductionOutput(current, recordedJobId, recordedQuantity, recordedShiftRef, productionActionProof(record)))
      },
    })
  }

  function openJobOutput(job: ProductionJob) {
    setJobId(job.id)
    requestAnimationFrame(() => {
      outputJobSelectRef.current?.scrollIntoView({ block: 'center' })
      outputJobSelectRef.current?.focus({ preventScroll: true })
    })
  }

  function closeSelectedJobShort(trigger: HTMLButtonElement) {
    const recordedShiftRef = shiftRef.trim()
    if (!recordedShiftRef || recordedShiftRef.length > 80) return setNotice('Enter a shift reference of 1 to 80 characters before closing a job short.')
    if (!selectedJob) return setNotice('Choose an active job before reviewing a short close.')
    const recordedJobId = selectedJob.id
    const expectedRevision = production.revision
    const expectedGood = selectedJob.output
    const expectedScrap = selectedJob.scrap ?? 0
    const expectedRemaining = selectedJob.target - expectedGood - expectedScrap
    if (expectedRemaining < 1) return setNotice(`${recordedJobId} has no remaining units to close short.`)
    setShiftRef(recordedShiftRef)
    queueAction({
      kind: 'production_job_close',
      subjectId: recordedJobId,
      summary: `Close ${recordedJobId} short · ${recordedShiftRef}`,
      before: `${expectedGood.toLocaleString()} good · ${expectedScrap.toLocaleString()} scrap · ${expectedRemaining.toLocaleString()} remaining`,
      after: `Closed short · ${expectedRemaining.toLocaleString()} not produced · target and output unchanged${selectedJob.qualityHold ? ' · quality hold remains' : ''}`,
      apply: async (record) => {
        await mutateProduction('production.job.closed', record.commandId, productionActionProof(record), (current) => {
          const currentJob = current.jobs.find((candidate) => candidate.id === recordedJobId)
          if (current.revision !== expectedRevision
            || !currentJob
            || currentJob.closure
            || currentJob.output !== expectedGood
            || (currentJob.scrap ?? 0) !== expectedScrap
            || currentJob.target - currentJob.output - (currentJob.scrap ?? 0) !== expectedRemaining) return null
          return closeProductionJob(current, recordedJobId, recordedShiftRef, productionActionProof(record))
        })
      },
    }, trigger)
  }

  function recordMaterialUse(event: FormEvent) {
    event.preventDefault()
    const materialRef = materialDraft.materialRef.trim()
    const materialLot = materialDraft.materialLot.trim() || undefined
    const recordedShiftRef = shiftRef.trim()
    const recordedQuantity = parsedMaterialQuantity
    const materialUnit = materialDraft.materialUnit
    if (!selectedMaterialJob) return setNotice('Choose an active job before recording material use.')
    if (!materialRef || materialRef.length > 120) return setNotice('Enter a material reference of 1 to 120 characters.')
    if (materialLot && materialLot.length > 120) return setNotice('Enter a lot or batch reference of at most 120 characters.')
    if (!recordedShiftRef || recordedShiftRef.length > 80) return setNotice('Enter a shift reference of 1 to 80 characters.')
    if (!productionMaterialUnits.includes(materialUnit)) return setNotice('Choose a supported material unit.')
    if (recordedQuantity === null) return setNotice('Enter a positive material quantity with no more than three decimal places.')
    const recordedJobId = selectedMaterialJob.id
    const recordedProduct = selectedMaterialJob.product
    const held = Boolean(selectedMaterialJob.qualityHold)
    const lotSummary = materialLot ? ` · lot ${materialLot}` : ''
    queueAction({
      kind: 'production_material',
      subjectId: recordedJobId,
      summary: `Record ${recordedQuantity} ${materialUnit} ${materialRef}${lotSummary} for ${recordedJobId}`,
      before: `${recordedProduct} · no material-use event for this action${held ? ' · QUALITY HOLD remains active' : ''}`,
      after: `${recordedQuantity} ${materialUnit} ${materialRef}${lotSummary} · ${recordedShiftRef} · internal traceability only${held ? ' · QUALITY HOLD remains active' : ''}`,
      apply: async (record) => {
        await mutateProduction('production.material.consumed', record.commandId, productionActionProof(record), (current) => recordProductionMaterialConsumption(
          current,
          recordedJobId,
          materialRef,
          materialLot,
          recordedQuantity,
          materialUnit,
          recordedShiftRef,
          productionActionProof(record),
        ))
        setMaterialDraft((current) => ({ ...current, jobId: recordedJobId, materialRef: '', materialLot: '', quantity: '1' }))
      },
    })
  }

  function createJob(event: FormEvent) {
    event.preventDefault()
    const id = jobDraft.id.trim().toUpperCase()
    const line = jobDraft.line.trim()
    const product = jobDraft.product.trim()
    const owner = jobDraft.owner.trim()
    const jobTarget = Number(jobDraft.target)
    const dueAt = new Date(jobDraft.dueAt)
    if (!id || !line || !product || !owner || owner.length > 120 || !Number.isSafeInteger(jobTarget) || jobTarget < 1 || Number.isNaN(dueAt.getTime()) || dueAt.getTime() <= Date.now()) {
      setNotice('Enter a unique job ID, line or team, product or batch, responsible owner, whole-number target, and future due time.')
      return
    }
    const canonicalDueAt = dueAt.toISOString()
    const job: ProductionJob = { id, line, product, target: jobTarget, output: 0, owner, priority: jobDraft.priority, dueAt: canonicalDueAt }
    queueAction({
      kind: 'production_job',
      subjectId: id,
      summary: `Create ${id} for ${product}`,
      before: 'No production job',
      after: `${line} · owner ${owner} · ${productionJobPriorityLabels[jobDraft.priority]} · due ${formatIssueDue(canonicalDueAt)} · target ${jobTarget.toLocaleString()}`,
      apply: async (record) => {
        await mutateProduction('production.job.created', record.commandId, productionActionProof(record), (current) => registerProductionJob(current, job, productionActionProof(record)))
        setJobId(id)
        setJobDraft({ id: '', line: '', product: '', target: '', owner: '', priority: 'normal', dueAt: defaultJobDueInput() })
      },
    })
  }

  function openJobSchedule(job: ProductionJob, trigger: HTMLButtonElement) {
    if (job.closure || job.output + (job.scrap ?? 0) >= job.target) return
    scheduleTriggerRef.current = trigger
    setScheduleDraft({
      jobId: job.id,
      owner: job.owner ?? '',
      priority: job.priority ?? 'normal',
      dueAt: job.dueAt ? localDateTimeInputValue(new Date(job.dueAt)) : defaultJobDueInput(),
    })
  }

  function closeJobSchedule() {
    setScheduleDraft(null)
    requestAnimationFrame(() => scheduleTriggerRef.current?.focus())
  }

  function reviewJobSchedule(event: FormEvent) {
    event.preventDefault()
    if (!scheduleDraft) return
    const job = production.jobs.find((candidate) => candidate.id === scheduleDraft.jobId)
    const dueAt = new Date(scheduleDraft.dueAt)
    const owner = scheduleDraft.owner.trim()
    if (!job || job.closure || job.output + (job.scrap ?? 0) >= job.target) {
      setNotice(`${scheduleDraft.jobId} is no longer active. Reload its current plan before review.`)
      return
    }
    if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() <= Date.now()) {
      setNotice('Choose a future due time before reviewing the schedule.')
      return
    }
    if (!owner || owner.length > 120) {
      setNotice('Name one responsible owner of 1 to 120 characters before reviewing the plan.')
      return
    }
    const priority = scheduleDraft.priority
    const canonicalDueAt = dueAt.toISOString()
    if (job.priority === priority && job.dueAt === canonicalDueAt && job.owner === owner) {
      setNotice('Change the owner, priority, or due time before review.')
      return
    }
    const expectedRevision = production.revision
    const expectedPriority = job.priority
    const expectedDueAt = job.dueAt
    const expectedOwner = job.owner
    const beforeSchedule = expectedPriority && expectedDueAt
      ? `${productionJobPriorityLabels[expectedPriority]} · due ${formatIssueDue(expectedDueAt)}`
      : 'Schedule not recorded · legacy job'
    const beforeOwner = expectedOwner ? `owner ${expectedOwner}` : 'owner not recorded · legacy job'
    const queued = queueAction({
      kind: 'production_job_schedule',
      subjectId: job.id,
      summary: `Update ${job.id} plan`,
      before: `${beforeOwner} · ${beforeSchedule}`,
      after: `owner ${owner} · ${productionJobPriorityLabels[priority]} · due ${formatIssueDue(canonicalDueAt)} · target and output unchanged`,
      apply: async (record) => {
        await mutateProduction('production.job.schedule_updated', record.commandId, productionActionProof(record), (current) => {
          const currentJob = current.jobs.find((candidate) => candidate.id === job.id)
          if (current.revision !== expectedRevision
            || !currentJob
            || currentJob.priority !== expectedPriority
            || currentJob.dueAt !== expectedDueAt
            || currentJob.owner !== expectedOwner) return null
          return updateProductionJobPlan(current, job.id, priority, canonicalDueAt, owner, productionActionProof(record))
        })
      },
    }, scheduleTriggerRef.current)
    if (queued) setScheduleDraft(null)
  }

  function createIssue(event: FormEvent) {
    event.preventDefault()
    const createdAt = new Date()
    const dueAt = new Date(issueDueInput)
    const canonicalOwner = issueOwner.trim()
    const canonicalContainment = containment.trim()
    const canonicalSummary = summary.trim()
    if (!canonicalSummary || !canonicalOwner || !canonicalContainment || Number.isNaN(dueAt.getTime()) || dueAt.getTime() <= createdAt.getTime()) {
      setNotice('Add an owner, a future due time, and the next containment action before review.')
      return
    }
    const issue: ProductionIssue = {
      id: uid('ISS'),
      createdAt: createdAt.toISOString(),
      area,
      kind,
      summary: canonicalSummary,
      status: 'open',
      severity,
      owner: canonicalOwner,
      dueAt: dueAt.toISOString(),
      containment: canonicalContainment,
    }
    issueDialogRef.current?.close()
    setIssueDialogOpen(false)
    queueAction({
      kind: 'issue_create',
      subjectId: issue.id,
      summary: `Open ${productionIssueSeverityLabels[issue.severity ?? 'medium'].toLowerCase()} ${issue.kind} issue for ${issue.area}`,
      before: 'No issue record',
      after: `${issue.id} · ${issue.owner} · due ${formatIssueDue(issue.dueAt ?? issue.createdAt)} · containment recorded`,
      apply: async (record) => {
        await mutateProduction('production.issue.opened', record.commandId, productionActionProof(record), (current) => openProductionIssue(current, issue, productionActionProof(record)))
        setSummary('')
        setIssueOwner('')
        setContainment('')
        setSeverity('medium')
        setIssueDueInput(defaultIssueDueInput())
      },
    }, issueTriggerRef.current)
  }

  function resolveIssue(issueId: string) {
    const issue = production.issues.find((candidate) => candidate.id === issueId)
    if (!issue || issue.status === 'resolved') return
    queueAction({
      kind: 'issue_resolution',
      subjectId: issueId,
      summary: `Resolve ${issueId}`,
      before: issue.owner && issue.containment ? `${issue.status} · owner ${issue.owner} · containment: ${issue.containment}` : `${issue.status} · legacy issue without assigned owner`,
      after: 'resolved with operator evidence',
      apply: async (record) => {
        await mutateProduction('production.issue.resolved', record.commandId, productionActionProof(record), (current) => resolveProductionIssue(current, issueId, productionActionProof(record)))
      },
    })
  }

  function placeQualityHold(event: FormEvent) {
    event.preventDefault()
    if (!selectedHoldJob) return setNotice('Choose an existing job or batch before reviewing a quality hold.')
    const heldJobId = selectedHoldJob.id
    const heldProduct = selectedHoldJob.product
    queueAction({
      kind: 'quality_hold',
      subjectId: heldJobId,
      summary: `Place quality hold on ${heldJobId}`,
      before: `${heldProduct} · no quality hold`,
      after: `${heldProduct} · held by the accountable operator with reason and evidence`,
      apply: async (record) => {
        await mutateProduction('production.quality_hold.placed', record.commandId, productionActionProof(record), (current) => placeProductionQualityHold(current, heldJobId, productionActionProof(record)))
        setHoldJobId('')
      },
    })
  }

  function releaseQualityHold(jobId: string, trigger: HTMLButtonElement) {
    const job = production.jobs.find((candidate) => candidate.id === jobId)
    if (!job?.qualityHold) return
    queueAction({
      kind: 'quality_release',
      subjectId: jobId,
      summary: `Release quality hold on ${jobId}`,
      before: `${job.product} · held by ${job.qualityHold.heldBy} · ${job.qualityHold.reason}`,
      after: `${job.product} · released by a named human with new evidence`,
      apply: async (record) => {
        await mutateProduction('production.quality_hold.released', record.commandId, productionActionProof(record), (current) => releaseProductionQualityHold(current, jobId, productionActionProof(record)))
      },
    }, trigger)
  }

  function buildShiftHandoff(event: FormEvent) {
    event.preventDefault()
    const canonicalHandoffShiftRef = handoffShiftRef.trim()
    const draft = buildProductionShiftHandoff(production, canonicalHandoffShiftRef)
    if (!draft) return setNotice('Enter one named shift reference of at most 80 characters.')
    setHandoffShiftRef(canonicalHandoffShiftRef)
    setShiftHandoff(draft)
    setNotice(`Read-only handoff built from Plant revision ${draft.sourceRevision}. No Plant record changed.`)
  }

  async function copyShiftHandoff() {
    if (!shiftHandoff || !shiftHandoffIsCurrent) return setNotice('Plant records or the shift reference changed. Build the handoff again before copying it.')
    if (!navigator.clipboard?.writeText) return setNotice('Clipboard copy is unavailable in this browser. No Plant record changed.')
    try {
      await navigator.clipboard.writeText(formatProductionShiftHandoff(shiftHandoff))
      setNotice('Shift handoff copied. No Plant record changed.')
    } catch {
      setNotice('Clipboard copy was not permitted. No Plant record changed.')
    }
  }

  function openMachineObservation(machineId: string, trigger: HTMLButtonElement) {
    const machine = production.machines.find((candidate) => candidate.id === machineId)
    if (!machine) return
    const firstAlternative = productionMachineStates.find((state) => state !== machine.state)
    if (!firstAlternative) return
    machineTriggerRef.current = trigger
    setMachineObservation({ machineId, toState: firstAlternative })
  }

  function closeMachineObservation() {
    setMachineObservation(null)
    requestAnimationFrame(() => machineTriggerRef.current?.focus())
  }

  function reviewMachineObservation(event: FormEvent) {
    event.preventDefault()
    if (!machineObservation) return
    const machine = production.machines.find((candidate) => candidate.id === machineObservation.machineId)
    if (!machine
      || machineObservation.toState === machine.state
      || !productionMachineStates.includes(machineObservation.toState)) {
      setNotice('Choose a different recorded status for an existing machine.')
      return
    }
    const expectedState = machine.state
    const observedState = machineObservation.toState
    const trigger = machineTriggerRef.current
    machineDialogRef.current?.close()
    setMachineObservation(null)
    queueAction({
      kind: 'machine_state',
      subjectId: machine.id,
      summary: `Record ${productionMachineStateLabels[observedState].toLowerCase()} for ${machine.name}`,
      before: `Recorded: ${productionMachineStateLabels[expectedState]}`,
      after: `Recorded: ${productionMachineStateLabels[observedState]}`,
      apply: async (record) => {
        await mutateProduction('production.machine_state.changed', record.commandId, productionActionProof(record), (current) => recordProductionMachineState(current, machine.id, expectedState, observedState, productionActionProof(record)))
      },
    }, trigger)
  }

  function reviewDowntimeStart(event: FormEvent) {
    event.preventDefault()
    if (!selectedDowntimeMachine) return setNotice('Choose one recorded machine without open downtime.')
    const machine = selectedDowntimeMachine
    downtimeDialogRef.current?.close()
    setDowntimeDialogOpen(false)
    queueAction({
      kind: 'downtime_start',
      subjectId: machine.id,
      summary: `Start downtime record for ${machine.name}`,
      before: `${machine.name} · no open downtime · machine status record unchanged by this action`,
      after: `${machine.name} · downtime open with human evidence · machine status record unchanged`,
      apply: async (record) => {
        await mutateProduction('production.downtime.started', record.commandId, productionActionProof(record), (current) => startProductionDowntime(current, machine.id, productionActionProof(record)))
        setDowntimeMachineId('')
      },
    }, downtimeTriggerRef.current)
  }

  function reviewDowntimeEnd(interval: ProductionDowntimeInterval) {
    const machine = production.machines.find((candidate) => candidate.id === interval.machineId)
    if (!machine || interval.end) return
    downtimeDialogRef.current?.close()
    setDowntimeDialogOpen(false)
    queueAction({
      kind: 'downtime_end',
      subjectId: machine.id,
      summary: `End downtime record for ${machine.name}`,
      before: `${machine.name} · downtime open since ${formatTime(interval.startedAt)} · machine status record unchanged by this action`,
      after: `${machine.name} · downtime closed with new human evidence · machine status record unchanged`,
      apply: async (record) => {
        await mutateProduction('production.downtime.ended', record.commandId, productionActionProof(record), (current) => endProductionDowntime(current, machine.id, interval.startActionId, productionActionProof(record)))
      },
    }, downtimeTriggerRef.current)
  }

  function closeDowntimeDialog() {
    setDowntimeDialogOpen(false)
    requestAnimationFrame(() => downtimeTriggerRef.current?.focus())
  }

  function reviewMaintenanceStart(event: FormEvent) {
    event.preventDefault()
    const owner = maintenanceOwner.trim()
    if (!selectedMaintenanceMachine || !owner || owner.length > 120) {
      setNotice('Choose one recorded machine and a named maintenance owner.')
      return
    }
    const machine = selectedMaintenanceMachine
    maintenanceDialogRef.current?.close()
    setMaintenanceDialogOpen(false)
    queueAction({
      kind: 'maintenance_start',
      subjectId: machine.id,
      summary: `Start maintenance for ${machine.name}`,
      before: `${machine.name} · no open maintenance work · machine status and downtime records unchanged`,
      after: `${machine.name} · maintenance owned by ${owner} with scope and evidence · no equipment command`,
      apply: async (record) => {
        await mutateProduction('production.maintenance.started', record.commandId, productionActionProof(record), (current) => startProductionMaintenance(current, machine.id, owner, productionActionProof(record)))
        setMaintenanceMachineId('')
        setMaintenanceOwner('')
      },
    }, maintenanceTriggerRef.current)
  }

  function reviewMaintenanceCompletion(record: ProductionMaintenanceRecord) {
    const machine = production.machines.find((candidate) => candidate.id === record.machineId)
    if (!machine || record.completion) return
    maintenanceDialogRef.current?.close()
    setMaintenanceDialogOpen(false)
    queueAction({
      kind: 'maintenance_complete',
      subjectId: machine.id,
      summary: `Complete maintenance for ${machine.name}`,
      before: `${machine.name} · open maintenance owned by ${record.owner} since ${formatTime(record.startedAt)}`,
      after: `${machine.name} · maintenance completed with outcome and evidence · machine status and downtime records unchanged`,
      apply: async (action) => {
        await mutateProduction('production.maintenance.completed', action.commandId, productionActionProof(action), (current) => completeProductionMaintenance(current, machine.id, record.startActionId, productionActionProof(action)))
      },
    }, maintenanceTriggerRef.current)
  }

  function closeMaintenanceDialog() {
    setMaintenanceDialogOpen(false)
    requestAnimationFrame(() => maintenanceTriggerRef.current?.focus())
  }

  const productionBoundary = <div className="production-mode-banner" data-write={productionCanWrite ? 'ready' : 'blocked'} role={productionCanWrite ? 'status' : 'alert'}>
    <span className={`status-pill ${productionCanWrite ? 'bounded' : 'pending'}`}>{managedIdentity ? 'Managed records' : 'Local sample'}</span>
    <p>{productionStorageError
      ? `Writes paused: ${productionStorageError}`
      : !productionCanWrite
        ? 'Writes paused: this browser could not confirm durable local storage and write locking.'
        : notice || (managedIdentity
          ? `Workspace ${managedIdentity.workspaceId} · revision ${managedVersion ?? 0}. Records are confirmed by the tenant API; no equipment control is connected.`
          : 'Sample records saved on this device. Status changes record operator observations only; they do not control equipment.')}</p>
    {!productionCanWrite ? <Link to="/settings/#controls">Open Settings</Link> : null}
  </div>

  const actionControls = <>
    <AccountableActionGate authenticatedActor={managedIdentity ? { id: managedIdentity.userId, label: managedIdentity.email } : undefined} key={pendingAction?.id ?? 'production-idle'} action={pendingAction} onCancel={() => { setPendingAction(null); setNotice('Change cancelled. Plant data was not modified.') }} onConfirm={confirmAction} returnFocus={actionTrigger} />
    <ProductionEventHistory events={production.events} />
  </>

  if (tab === 'production') return <div className="operation-module">
    {productionBoundary}
    <Suspense fallback={<p className="form-notice" role="status">Loading execution control…</p>}><PlantOrderFoundation actor={managedIdentity?.userId ?? 'Local Plant supervisor'} disabled={!productionCanWrite || Boolean(pendingAction)} jobs={production.jobs} key={`plant-order:${managedWorkspaceId ?? managedIdentity?.workspaceId ?? 'local-sample'}:${production.orderExecution?.headDigest ?? 'empty'}`} managedState={managedIdentity ? production.orderExecution ?? null : undefined} onManagedCommand={managedIdentity ? mutateProduction : undefined} scope={`plant:${managedWorkspaceId ?? managedIdentity?.workspaceId ?? 'local-sample'}`} /></Suspense>
    <div className="split-workspace production-view">
      <section className="core-panel job-panel">
        <div className="panel-head"><div><span className="core-eyebrow">Plant plan</span><h2>Jobs to finish</h2></div><span className="panel-note">{activeJobs.length} active · {completedJobs.length} finished</span></div>
        <JobList disabled={!productionCanWrite || Boolean(pendingAction)} jobs={activeJobs} now={issueClock} onOutput={openJobOutput} onSchedule={openJobSchedule} />
        <CompletedJobHistory jobs={completedJobs} now={issueClock} />
        <details className="compact-disclosure catalog-disclosure">
          <summary>Add job</summary>
          <form className="core-form compact-form" onSubmit={createJob}>
            <div className="form-row"><label>Job ID<input disabled={!productionCanWrite || Boolean(pendingAction)} maxLength={80} onChange={(event) => setJobDraft((current) => ({ ...current, id: event.target.value }))} placeholder="JOB-002" required value={jobDraft.id} /></label><label>Line or team<input disabled={!productionCanWrite || Boolean(pendingAction)} maxLength={120} onChange={(event) => setJobDraft((current) => ({ ...current, line: event.target.value }))} placeholder="Line 02" required value={jobDraft.line} /></label></div>
            <div className="form-row"><label>Product or batch<input disabled={!productionCanWrite || Boolean(pendingAction)} maxLength={180} onChange={(event) => setJobDraft((current) => ({ ...current, product: event.target.value }))} placeholder="Product name" required value={jobDraft.product} /></label><label>Target units<input disabled={!productionCanWrite || Boolean(pendingAction)} min="1" onChange={(event) => setJobDraft((current) => ({ ...current, target: event.target.value }))} required step="1" type="number" value={jobDraft.target} /></label></div>
            <div className="form-row"><label>Priority<select disabled={!productionCanWrite || Boolean(pendingAction)} onChange={(event) => setJobDraft((current) => ({ ...current, priority: event.target.value as ProductionJobPriority }))} value={jobDraft.priority}>{productionJobPriorities.map((priority) => <option key={priority} value={priority}>{productionJobPriorityLabels[priority]}</option>)}</select></label><label>Due time<input autoComplete="off" disabled={!productionCanWrite || Boolean(pendingAction)} min={localDateTimeInputValue(new Date())} onChange={(event) => setJobDraft((current) => ({ ...current, dueAt: event.target.value }))} required type="datetime-local" value={jobDraft.dueAt} /></label></div>
            <label>Responsible owner<input autoComplete="off" disabled={!productionCanWrite || Boolean(pendingAction)} maxLength={120} onChange={(event) => setJobDraft((current) => ({ ...current, owner: event.target.value }))} placeholder="Named person or role" required value={jobDraft.owner} /></label>
            <button className="core-button" disabled={!productionCanWrite || Boolean(pendingAction)} type="submit">Review job</button>
            <p className="panel-copy">Owner, priority, and due time make responsibility and run order visible. The accountable operator, reason, and source record are confirmed in the next step.</p>
          </form>
        </details>
      </section>
      <section className="core-panel output-panel">
        <span className="core-eyebrow">Job output</span><h2>Record good or scrap</h2>
        <form autoComplete="off" className="core-form compact-form" id="plant-output-form" onSubmit={recordOutput}>
          <label>Job<select disabled={!productionCanWrite || Boolean(pendingAction) || !activeJobs.length} ref={outputJobSelectRef} value={selectedJobId} onChange={(event) => setJobId(event.target.value)}>{activeJobs.length ? activeJobs.map((job) => <option key={job.id} value={job.id}>{job.id} · {job.product} · {job.line} · {(job.target - job.output - (job.scrap ?? 0)).toLocaleString()} left{job.qualityHold ? ' · QUALITY HOLD' : ''}</option>) : <option value="">No active jobs</option>}</select></label>
          <label>Result<select disabled={!productionCanWrite || Boolean(pendingAction) || !selectedJob} value={outputKind} onChange={(event) => setOutputKind(event.target.value as ProductionOutputKind)}><option value="good">Good output</option><option value="scrap">Scrap</option></select></label>
          <div className="form-row"><label>Shift reference<input autoComplete="off" disabled={!productionCanWrite || Boolean(pendingAction) || !selectedJob} maxLength={80} name="plant-output-shift-reference" placeholder={shiftReferencePlaceholder()} required value={shiftRef} onChange={(event) => setShiftRef(event.target.value)} /></label><label>{outputKind === 'scrap' ? 'Scrap units' : 'Good units'}<input autoComplete="off" disabled={!productionCanWrite || Boolean(pendingAction) || !selectedJob} max={selectedRemaining} min="1" name="plant-output-quantity" step="1" type="number" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label></div>
          {selectedJob?.qualityHold ? <p className="form-notice" role="alert">QUALITY HOLD · Held by {selectedJob.qualityHold.heldBy}. Recording a result does not release this hold; verify the hold and evidence before review.</p> : null}
          <p className="form-notice" role="status">{canonicalShiftRef && canonicalShiftRef.length <= 80 ? `This shift: ${currentShiftOutput.goodUnits.toLocaleString()} good · ${currentShiftOutput.scrapUnits.toLocaleString()} scrap across ${currentShiftOutput.entryCount} ${currentShiftOutput.entryCount === 1 ? 'entry' : 'entries'}.` : 'Enter a shift reference to see its recorded subtotal.'}</p>
          <div className="form-actions">
            <button className="core-button primary" disabled={!productionCanWrite || Boolean(pendingAction) || !selectedJob || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > selectedRemaining || selectedRemaining < 1 || !canonicalShiftRef || canonicalShiftRef.length > 80} type="submit">Review {outputKind === 'scrap' ? 'scrap' : 'good output'}</button>
            <button aria-describedby="plant-short-close-boundary" className="core-button" disabled={!productionCanWrite || Boolean(pendingAction) || !selectedJob || selectedRemaining < 1 || !canonicalShiftRef || canonicalShiftRef.length > 80} onClick={(event) => closeSelectedJobShort(event.currentTarget)} type="button">Review short close</button>
          </div>
          <p className="panel-copy" id="plant-short-close-boundary">{selectedJob ? `${selectedJob.id} · ${selectedJob.product} · ${selectedJob.line} · ${selectedJob.output.toLocaleString()} good · ${(selectedJob.scrap ?? 0).toLocaleString()} scrap · ${selectedRemaining.toLocaleString()} left.` : 'Add or choose an active job.'} Results are append-only. Short close ends the selected job without changing its target, output, hold, inventory, costing, or accounting.</p>
        </form>
        <details className="compact-disclosure production-history">
          <summary>Material use <span>{materialEntries.length}</span></summary>
          <form autoComplete="off" className="core-form compact-form" onSubmit={recordMaterialUse}>
            <label>Job<select disabled={!productionCanWrite || Boolean(pendingAction) || !activeJobs.length} onChange={(event) => setMaterialDraft((current) => ({ ...current, jobId: event.target.value }))} value={materialDraft.jobId}>
              {!materialDraft.jobId ? <option value="">Choose an active job</option> : null}
              {materialJobIsStale ? <option disabled value={materialDraft.jobId}>{materialDraft.jobId} · no longer active</option> : null}
              {activeJobs.map((job) => <option key={job.id} value={job.id}>{job.id} · {job.product} · {job.line}{job.qualityHold ? ' · QUALITY HOLD' : ''}</option>)}
            </select></label>
            {materialJobIsStale ? <p className="form-notice" role="alert">The selected job {materialDraft.jobId} is no longer active. Your draft is preserved; choose another job before review.</p> : null}
            <label>Material reference<input disabled={!productionCanWrite || Boolean(pendingAction) || !selectedMaterialJob} maxLength={120} onChange={(event) => setMaterialDraft((current) => ({ ...current, materialRef: event.target.value }))} placeholder="RM-001 or Resin A" required value={materialDraft.materialRef} /></label>
            <label>Lot or batch (optional)<input disabled={!productionCanWrite || Boolean(pendingAction) || !selectedMaterialJob} maxLength={120} onChange={(event) => setMaterialDraft((current) => ({ ...current, materialLot: event.target.value }))} placeholder="LOT-24" value={materialDraft.materialLot} /></label>
            <div className="form-row">
              <label>Quantity<input aria-describedby={materialQuantityError ? 'plant-material-quantity-error' : undefined} aria-invalid={materialQuantityError ? true : undefined} disabled={!productionCanWrite || Boolean(pendingAction) || !selectedMaterialJob} min="0.001" onChange={(event) => setMaterialDraft((current) => ({ ...current, quantity: event.target.value }))} required step="0.001" type="number" value={materialDraft.quantity} /></label>
              <label>Unit<select disabled={!productionCanWrite || Boolean(pendingAction) || !selectedMaterialJob} onChange={(event) => setMaterialDraft((current) => ({ ...current, materialUnit: event.target.value as ProductionMaterialUnit }))} value={materialDraft.materialUnit}>{productionMaterialUnits.map((unit) => <option key={unit} value={unit}>{productionMaterialUnitLabels[unit]}</option>)}</select></label>
            </div>
            {materialQuantityError ? <p className="form-notice" id="plant-material-quantity-error" role="alert">{materialQuantityError}</p> : null}
            <label>Shift reference<input disabled={!productionCanWrite || Boolean(pendingAction) || !selectedMaterialJob} maxLength={80} onChange={(event) => setShiftRef(event.target.value)} placeholder={shiftReferencePlaceholder()} required value={shiftRef} /></label>
            {selectedMaterialJob?.qualityHold ? <p className="form-notice" role="alert">QUALITY HOLD · This records observed material use only. It does not release the hold.</p> : null}
            <button className="core-button" disabled={!productionCanWrite || Boolean(pendingAction) || !selectedMaterialJob || !materialDraft.materialRef.trim() || materialDraft.materialRef.trim().length > 120 || materialDraft.materialLot.trim().length > 120 || !shiftRef.trim() || shiftRef.trim().length > 80 || parsedMaterialQuantity === null} type="submit">Review material use</button>
            <p className="panel-copy">Creates one job-linked material-use record with up to three decimal places. It does not adjust raw-material inventory, purchasing, costing, accounting, or equipment.</p>
          </form>
          {recentMaterialEntries.length ? <div className="issue-list">{recentMaterialEntries.map((entry) => <article key={entry.actionId}>
            <span aria-hidden="true" className="issue-mark resolved">M</span>
            <div><strong>{entry.quantity?.toLocaleString(undefined, { maximumFractionDigits: 3 })} {entry.materialUnit} · {entry.materialRef}{entry.materialLot ? ` · lot ${entry.materialLot}` : ''}</strong><small style={wrappedIssueDetail}>{entry.subjectId} · {entry.shiftRef} · {formatIssueDue(entry.createdAt)} · {entry.actor}</small><small style={wrappedIssueDetail}>Evidence: {entry.evidenceReference} · Action: {entry.actionId}</small></div>
          </article>)}</div> : <Empty>No material use is recorded yet.</Empty>}
          {materialEntries.length > recentMaterialEntries.length ? <p className="panel-copy">Showing the latest {recentMaterialEntries.length} material entries. The complete attributed record remains in Plant record.</p> : null}
        </details>
      </section>
    </div>
    <dialog aria-labelledby="job-schedule-title" className="production-issue-dialog" onCancel={(event) => { event.preventDefault(); closeJobSchedule() }} ref={scheduleDialogRef}>
      {scheduleDraft ? <>
        <div className="panel-head"><div><span className="core-eyebrow">Plant plan</span><h2 id="job-schedule-title">Change {scheduleDraft.jobId} plan</h2></div><button aria-label="Close job schedule" className="text-link" onClick={closeJobSchedule} type="button">Close</button></div>
        <form autoComplete="off" className="core-form" onSubmit={reviewJobSchedule}>
          <div className="form-row"><label>Priority<select disabled={!productionCanWrite || Boolean(pendingAction)} onChange={(event) => setScheduleDraft((current) => current ? { ...current, priority: event.target.value as ProductionJobPriority } : current)} value={scheduleDraft.priority}>{productionJobPriorities.map((priority) => <option key={priority} value={priority}>{productionJobPriorityLabels[priority]}</option>)}</select></label><label>Due time<input autoComplete="off" disabled={!productionCanWrite || Boolean(pendingAction)} min={localDateTimeInputValue(new Date())} onChange={(event) => setScheduleDraft((current) => current ? { ...current, dueAt: event.target.value } : current)} required type="datetime-local" value={scheduleDraft.dueAt} /></label></div>
          <label>Responsible owner<input autoComplete="off" disabled={!productionCanWrite || Boolean(pendingAction)} maxLength={120} onChange={(event) => setScheduleDraft((current) => current ? { ...current, owner: event.target.value } : current)} placeholder="Named person or role" required value={scheduleDraft.owner} /></label>
          <p className="panel-copy">This records responsibility and run order only. It grants no access, assigns no machine, and dispatches no work. Target, output, quality hold, materials, and accounting stay unchanged.</p>
          <p className="panel-copy">Nothing changes until the accountable operator confirms a reason and evidence.</p>
          <div className="form-actions"><button className="core-button" onClick={closeJobSchedule} type="button">Cancel</button><button className="core-button primary" disabled={!productionCanWrite || Boolean(pendingAction)} type="submit">Review plan</button></div>
        </form>
      </> : null}
    </dialog>
    {actionControls}
  </div>

  if (tab === 'control') return <div className="operation-module">
    {productionBoundary}
    <div className="control-workspace">
      <div className="split-workspace">
        <section className="core-panel production-issue-launcher">
          <div className="panel-head"><div><span className="core-eyebrow">Shift review</span><h2>Open problems</h2></div><span className="panel-note">{urgentIssueCount ? `${urgentIssueCount} urgent · ` : ''}{openIssues.length} open</span></div>
          <IssueList disabled={!productionCanWrite || Boolean(pendingAction)} issues={openIssues} now={issueClock} onResolve={resolveIssue} />
          <ResolvedIssueHistory issues={resolvedIssues} now={issueClock} />
          <button className="core-button primary" disabled={!productionCanWrite || Boolean(pendingAction)} onClick={() => setIssueDialogOpen(true)} ref={issueTriggerRef} type="button">Record problem</button>
          <details className="compact-disclosure production-history" open={heldJobs.length ? true : undefined}>
            <summary>Quality holds <span>{heldJobs.length}</span></summary>
            <QualityHoldList disabled={!productionCanWrite || Boolean(pendingAction)} jobs={heldJobs} onRelease={releaseQualityHold} />
            {holdableJobs.length ? <form autoComplete="off" className="core-form compact-form" onSubmit={placeQualityHold}>
              <label>Job or batch<select disabled={!productionCanWrite || Boolean(pendingAction)} onChange={(event) => setHoldJobId(event.target.value)} value={selectedHoldJobId}>{holdableJobs.map((job) => <option key={job.id} value={job.id}>{job.id} · {job.product} · {job.line}</option>)}</select></label>
              <button className="core-button" disabled={!productionCanWrite || Boolean(pendingAction) || !selectedHoldJob} type="submit">Review hold</button>
              <p className="panel-copy">The next review records who placed the hold, why, and the source evidence. It does not change output or control equipment.</p>
            </form> : <p className="panel-copy">Every recorded job is currently held. Release one with evidence before placing another hold.</p>}
          </details>
          <details className="compact-disclosure production-history" open={shiftHandoff ? true : undefined}>
            <summary>Shift handoff <span>{shiftHandoffIsCurrent ? 'Ready' : 'Build'}</span></summary>
            <form autoComplete="off" className="core-form compact-form" onSubmit={buildShiftHandoff}>
              <label>Shift reference<input maxLength={80} onChange={(event) => setHandoffShiftRef(event.target.value)} placeholder={shiftReferencePlaceholder()} required value={handoffShiftRef} /></label>
              <button className="core-button" type="submit">Build handoff</button>
              <p className="panel-copy">Builds a read-only briefing from the current Plant revision. It creates no event, message, or saved copy.</p>
            </form>
            {shiftHandoff && !shiftHandoffIsCurrent ? <p className="form-notice" role="alert">Plant records or the shift reference changed after this handoff was built. Build it again before use.</p> : null}
            {shiftHandoff && shiftHandoffIsCurrent ? <ShiftHandoffView handoff={shiftHandoff} onCopy={copyShiftHandoff} /> : null}
          </details>
        </section>
        <section className="core-panel" style={{ overflowY: 'auto' }}>
          <div className="panel-head"><div><span className="core-eyebrow">Equipment</span><h2>Recorded status</h2></div></div>
          <p className="panel-copy production-control-boundary" style={{ fontSize: 11, lineHeight: 1.35, marginTop: 6 }}>Records operator observations only. No equipment control.</p>
          <button aria-label={`Review downtime records; ${openDowntimeIntervals.length} open`} className="core-button" onClick={() => setDowntimeDialogOpen(true)} ref={downtimeTriggerRef} style={{ justifyContent: 'space-between', margin: '8px 0', width: '100%' }} type="button"><span>Downtime</span><small>{openDowntimeIntervals.length ? `${openDowntimeIntervals.length} open` : `${recentDowntimeIntervals.length} recent`}</small></button>
          <button aria-label={`Review maintenance work; ${openMaintenanceRecords.length} open`} className="core-button" onClick={() => setMaintenanceDialogOpen(true)} ref={maintenanceTriggerRef} style={{ justifyContent: 'space-between', margin: '0 0 8px', width: '100%' }} type="button"><span>Maintenance</span><small>{openMaintenanceRecords.length ? `${openMaintenanceRecords.length} open` : `${recentMaintenanceRecords.length} recent`}</small></button>
          {production.machines.length ? <div className="machine-list">{production.machines.map((machine) => <button aria-label={`Review recorded status for ${machine.name}; currently ${productionMachineStateLabels[machine.state]}`} disabled={!productionCanWrite || Boolean(pendingAction)} key={machine.id} type="button" onClick={(event) => openMachineObservation(machine.id, event.currentTarget)}><span className={`machine-dot ${machine.state}`} /><span><strong>{machine.name}</strong><small>{machine.id} - Recorded: {productionMachineStateLabels[machine.state]}</small></span><b>Record status</b></button>)}</div> : <Empty>No equipment records exist in this workspace.</Empty>}
        </section>
      </div>
    </div>
    <dialog aria-labelledby="downtime-dialog-title" className="production-issue-dialog" onCancel={(event) => { event.preventDefault(); closeDowntimeDialog() }} ref={downtimeDialogRef}>
      <div className="panel-head"><div><span className="core-eyebrow">Equipment record</span><h2 id="downtime-dialog-title">Machine downtime</h2></div><button aria-label="Close downtime records" className="text-link" onClick={closeDowntimeDialog} style={{ minHeight: 44, minWidth: 44 }} type="button">Close</button></div>
      {openDowntimeIntervals.length ? <div className="issue-list">{openDowntimeIntervals.map((interval, index) => <article key={interval.startActionId}>
        <span aria-hidden="true" className="issue-mark">DT</span>
        <div><strong>{interval.machineName} · downtime open</strong><small style={wrappedIssueDetail}>Started {formatTime(interval.startedAt)} by {interval.startedBy} · {formatDowntimeDuration(issueClock - Date.parse(interval.startedAt))} elapsed</small><small style={wrappedIssueDetail}>Reason: {interval.startReason}</small><small style={wrappedIssueDetail}>Evidence: {interval.startEvidenceReference} · Action: {interval.startActionId}</small></div>
        <button className="core-button" data-downtime-primary={index === 0 ? true : undefined} disabled={!productionCanWrite || Boolean(pendingAction)} onClick={() => reviewDowntimeEnd(interval)} type="button">Review end</button>
      </article>)}</div> : <p className="panel-copy">No machine has an open downtime record.</p>}
      {availableDowntimeMachines.length ? <form autoComplete="off" className="core-form compact-form" onSubmit={reviewDowntimeStart}>
        <label>Machine<select data-downtime-primary={!openDowntimeIntervals.length ? true : undefined} disabled={!productionCanWrite || Boolean(pendingAction)} onChange={(event) => setDowntimeMachineId(event.target.value)} value={selectedDowntimeMachineId}>{availableDowntimeMachines.map((machine) => <option key={machine.id} value={machine.id}>{machine.name} · {machine.id} · recorded {productionMachineStateLabels[machine.state]}</option>)}</select></label>
        <button className="core-button" disabled={!productionCanWrite || Boolean(pendingAction) || !selectedDowntimeMachine} type="submit">Review start</button>
      </form> : <p className="panel-copy">Every recorded machine already has open downtime.</p>}
      {recentDowntimeIntervals.length ? <><p className="panel-copy"><strong>Recent closed intervals</strong></p><div className="action-history-list">{recentDowntimeIntervals.map((interval) => <article key={interval.startActionId}><div><strong>{interval.machineName} · {formatDowntimeDuration(interval.durationMs ?? 0)}</strong><small style={wrappedIssueDetail}>{formatTime(interval.startedAt)} to {formatTime(interval.end?.endedAt ?? interval.startedAt)}</small><small style={wrappedIssueDetail}>Start: {interval.startedBy} · {interval.startReason} · {interval.startEvidenceReference}</small><small style={wrappedIssueDetail}>End: {interval.end?.endedBy} · {interval.end?.reason} · {interval.end?.evidenceReference}</small></div></article>)}</div></> : null}
      <p className="panel-copy">This human record is separate from machine status. It sends no equipment command and changes no job or output.</p>
    </dialog>
    <dialog aria-labelledby="maintenance-dialog-title" className="production-issue-dialog" onCancel={(event) => { event.preventDefault(); closeMaintenanceDialog() }} ref={maintenanceDialogRef}>
      <div className="panel-head"><div><span className="core-eyebrow">Owned work</span><h2 id="maintenance-dialog-title">Machine maintenance</h2></div><button aria-label="Close maintenance work" className="text-link" onClick={closeMaintenanceDialog} style={{ minHeight: 44, minWidth: 44 }} type="button">Close</button></div>
      {openMaintenanceRecords.length ? <div className="issue-list">{openMaintenanceRecords.map((record, index) => <article key={record.startActionId}>
        <span aria-hidden="true" className="issue-mark">MX</span>
        <div><strong>{record.machineName} · {record.owner}</strong><small style={wrappedIssueDetail}>Started {formatTime(record.startedAt)} by {record.startedBy}</small><small style={wrappedIssueDetail}>Scope: {record.scope}</small><small style={wrappedIssueDetail}>Evidence: {record.startEvidenceReference} · Action: {record.startActionId}</small></div>
        <button className="core-button" data-maintenance-primary={index === 0 ? true : undefined} disabled={!productionCanWrite || Boolean(pendingAction)} onClick={() => reviewMaintenanceCompletion(record)} type="button">Review complete</button>
      </article>)}</div> : <p className="panel-copy">No machine has open maintenance work.</p>}
      {availableMaintenanceMachines.length ? <form autoComplete="off" className="core-form compact-form" onSubmit={reviewMaintenanceStart}>
        <label>Machine<select data-maintenance-primary={!openMaintenanceRecords.length ? true : undefined} disabled={!productionCanWrite || Boolean(pendingAction)} onChange={(event) => setMaintenanceMachineId(event.target.value)} value={selectedMaintenanceMachineId}>{availableMaintenanceMachines.map((machine) => <option key={machine.id} value={machine.id}>{machine.name} · {machine.id} · recorded {productionMachineStateLabels[machine.state]}</option>)}</select></label>
        <label>Owner<input autoComplete="off" disabled={!productionCanWrite || Boolean(pendingAction)} maxLength={120} onChange={(event) => setMaintenanceOwner(event.target.value)} placeholder="Named person or role" required value={maintenanceOwner} /></label>
        <button className="core-button" disabled={!productionCanWrite || Boolean(pendingAction) || !selectedMaintenanceMachine || !maintenanceOwner.trim() || maintenanceOwner.trim().length > 120} type="submit">Review start</button>
      </form> : <p className="panel-copy">Every recorded machine already has open maintenance work.</p>}
      {recentMaintenanceRecords.length ? <><p className="panel-copy"><strong>Recent completed work</strong></p><div className="action-history-list">{recentMaintenanceRecords.map((record) => <article key={record.startActionId}><div><strong>{record.machineName} · {record.owner}</strong><small style={wrappedIssueDetail}>Started: {record.startedBy} · {record.scope} · {record.startEvidenceReference}</small><small style={wrappedIssueDetail}>Completed: {record.completion?.completedBy} · {record.completion?.outcome} · {record.completion?.evidenceReference}</small><small style={wrappedIssueDetail}>{formatTime(record.startedAt)} to {formatTime(record.completion?.completedAt ?? record.startedAt)}</small></div></article>)}</div></> : null}
      <p className="panel-copy">The accountable review records work scope or completion outcome. It does not control equipment, change machine status, open downtime, buy parts, or change jobs.</p>
    </dialog>
    <dialog aria-labelledby="machine-observation-title" className="production-issue-dialog" onCancel={(event) => { event.preventDefault(); closeMachineObservation() }} ref={machineDialogRef}>
      {observedMachine && machineObservation ? <>
        <div className="panel-head"><div><span className="core-eyebrow">Equipment observation</span><h2 id="machine-observation-title">{observedMachine.name}</h2></div><button aria-label="Close equipment observation" className="text-link" onClick={closeMachineObservation} type="button">Close</button></div>
        <form className="core-form" onSubmit={reviewMachineObservation}>
          <label>New recorded status<select onChange={(event) => setMachineObservation((current) => current ? { ...current, toState: event.target.value as ProductionMachineState } : current)} value={machineObservation.toState}>{machineObservationTargets.map((state) => <option key={state} value={state}>{productionMachineStateLabels[state]}</option>)}</select></label>
          <p className="panel-copy">Currently recorded as {productionMachineStateLabels[observedMachine.state]}. This records an operator observation only; it does not start, stop, or control equipment.</p>
          <p className="panel-copy">Nothing changes until the accountable review is confirmed.</p>
          <div className="form-actions"><button className="core-button" onClick={closeMachineObservation} type="button">Cancel</button><button className="core-button primary" type="submit">Review observation</button></div>
        </form>
      </> : null}
    </dialog>
    <dialog aria-labelledby="production-issue-title" className="production-issue-dialog" onCancel={(event) => { event.preventDefault(); setIssueDialogOpen(false); requestAnimationFrame(() => issueTriggerRef.current?.focus()) }} ref={issueDialogRef}>
      <div className="panel-head"><div><span className="core-eyebrow">Plant problem</span><h2 id="production-issue-title">Record an observation</h2></div><button aria-label="Close problem form" className="text-link" onClick={() => { setIssueDialogOpen(false); requestAnimationFrame(() => issueTriggerRef.current?.focus()) }} type="button">Close</button></div>
      <form autoComplete="off" className="core-form" onSubmit={createIssue}>
        <div className="form-row"><label>Type<select value={kind} onChange={(event) => setKind(event.target.value as ProductionIssue['kind'])}><option value="quality">Quality</option><option value="maintenance">Maintenance</option><option value="materials">Materials</option><option value="operations">Operations</option></select></label><label>Area<select value={area} onChange={(event) => setArea(event.target.value)}><option>Line 01</option><option>Line 02</option><option>Line 03</option><option>Materials</option><option>Quality</option></select></label></div>
        <label>Observation<textarea autoFocus maxLength={240} required value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Describe what happened, not the assumption." /></label>
        <div className="form-row"><label>Priority<select value={severity} onChange={(event) => setSeverity(event.target.value as ProductionIssueSeverity)}>{productionIssueSeverities.map((candidate) => <option key={candidate} value={candidate}>{productionIssueSeverityLabels[candidate]}</option>)}</select></label><label>Owner<input autoComplete="off" maxLength={120} name="plant-issue-owner" onChange={(event) => setIssueOwner(event.target.value)} placeholder="Named person or role" required value={issueOwner} /></label></div>
        <label>Due time<input autoComplete="off" min={localDateTimeInputValue(new Date())} name="plant-issue-due" onChange={(event) => setIssueDueInput(event.target.value)} required type="datetime-local" value={issueDueInput} /></label>
        <label>Containment / next action<textarea maxLength={240} onChange={(event) => setContainment(event.target.value)} placeholder="What happens next, and what stays on hold?" required value={containment} /></label>
        <p className="panel-copy">Nothing is saved until the next accountable review is confirmed.</p>
        <div className="form-actions"><button className="core-button" onClick={() => { setIssueDialogOpen(false); requestAnimationFrame(() => issueTriggerRef.current?.focus()) }} type="button">Cancel</button><button className="core-button primary" type="submit">Review problem</button></div>
      </form>
    </dialog>
    {actionControls}
  </div>

  return null
}

function JobList({ disabled = false, jobs, now, onOutput, onSchedule }: { disabled?: boolean; jobs: ProductionJob[]; now: number; onOutput?: (job: ProductionJob) => void; onSchedule?: (job: ProductionJob, trigger: HTMLButtonElement) => void }) {
  if (!jobs.length) return <Empty>No active jobs. Add a job below to start recording output.</Empty>
  return <div className="job-list">{jobs.map((job) => {
    const scrap = job.scrap ?? 0
    const accounted = job.output + scrap
    const progress = Math.min(100, Math.round((accounted / job.target) * 100))
    const scheduled = Boolean(job.priority && job.dueAt)
    const overdue = Boolean(!job.closure && job.dueAt && Date.parse(job.dueAt) <= now)
    const scheduleLabel = scheduled
      ? `${productionJobPriorityLabels[job.priority ?? 'normal']} · ${overdue ? 'OVERDUE ' : job.closure ? 'Was due ' : 'Due '}${formatIssueDue(job.dueAt ?? '')}`
      : 'Schedule not recorded · legacy job'
    const ownerLabel = job.owner ? `Owner ${job.owner}` : 'Owner not recorded · legacy job'
    return <article key={job.id}><div><span>{job.id} · {job.line}{job.qualityHold ? ' · QUALITY HOLD' : ''}{job.closure ? ' · CLOSED SHORT' : ''}</span><strong>{job.product}</strong><small className={`job-schedule${overdue ? ' overdue' : ''}`} data-priority={job.priority ?? 'legacy'}>{ownerLabel} · {scheduleLabel}</small>{job.closure ? <small>Closed {formatIssueDue(job.closure.closedAt)} by {job.closure.closedBy} · Shift {job.closure.shiftRef} · {job.closure.remainingUnits.toLocaleString()} not produced</small> : null}{job.qualityHold ? <small>Held by {job.qualityHold.heldBy} · Evidence: {job.qualityHold.evidenceReference}</small> : null}{!job.closure && accounted < job.target && (onOutput || onSchedule) ? <div className="job-row-actions">{onOutput ? <button aria-controls="plant-output-form" className="text-link job-output-link" disabled={disabled} onClick={() => onOutput(job)} type="button">Record output</button> : null}{onSchedule ? <button className="text-link" disabled={disabled} onClick={(event) => onSchedule(job, event.currentTarget)} type="button">Change plan</button> : null}</div> : null}</div><div className="job-progress"><span><i style={{ width: `${progress}%` }} /></span><small>{job.output.toLocaleString()} good · {scrap.toLocaleString()} scrap · {accounted.toLocaleString()} / {job.target.toLocaleString()}{job.closure ? ` · ${job.closure.remainingUnits.toLocaleString()} closed short` : ''}</small></div></article>
  })}</div>
}

function CompletedJobHistory({ jobs, now }: { jobs: ProductionJob[]; now: number }) {
  if (!jobs.length) return null
  return <details className="compact-disclosure production-history">
    <summary>Finished jobs <span>{jobs.length}</span></summary>
    <JobList jobs={jobs.slice(0, 8)} now={now} />
    {jobs.length > 8 ? <p>Showing the latest 8 completed jobs.</p> : null}
  </details>
}

function IssueList({ disabled = false, issues, now, onResolve }: { disabled?: boolean; issues: ProductionIssue[]; now: number; onResolve: (id: string) => void }) {
  if (!issues.length) return <Empty>No production issue is open.</Empty>
  return <div className="issue-list">{issues.map((issue) => {
    const actionable = Boolean(issue.severity && issue.owner && issue.dueAt && issue.containment)
    const overdue = issue.status === 'open' && Boolean(issue.dueAt) && Date.parse(issue.dueAt ?? '') < now
    const severityLabel = issue.severity ? productionIssueSeverityLabels[issue.severity] : 'Legacy'
    return <article key={issue.id} title={issue.id}>
      <span className={`issue-mark ${issue.status}`}>{issue.status === 'open' ? issue.severity?.charAt(0).toUpperCase() ?? '!' : '✓'}</span>
      <div>
        <strong>{issue.summary}</strong>
        <small style={wrappedIssueDetail}>{severityLabel} · {issue.kind} · {issue.area} · opened {formatTime(issue.createdAt)}</small>
        {actionable ? <>
          <small style={wrappedIssueDetail}>{overdue ? 'OVERDUE' : `Due ${formatIssueDue(issue.dueAt ?? '')}`} · Owner {issue.owner}</small>
          <small style={wrappedIssueDetail}>Next: {issue.containment}</small>
        </> : <small style={wrappedIssueDetail}>Legacy problem · owner, due time, and containment were not recorded</small>}
        {issue.status === 'resolved' ? <small style={wrappedIssueDetail}>{issue.resolution ? `Resolved by ${issue.resolution.resolvedBy} · Evidence: ${issue.resolution.evidenceReference}` : 'Legacy resolution · no attributed proof was available'}</small> : null}
      </div>
      {issue.status === 'open' ? <button className="text-link" disabled={disabled} onClick={() => onResolve(issue.id)} type="button">Review close</button> : <b>Resolved</b>}
    </article>
  })}</div>
}

function ResolvedIssueHistory({ issues, now }: { issues: ProductionIssue[]; now: number }) {
  if (!issues.length) return null
  return <details className="compact-disclosure production-history resolved-issue-history">
    <summary>Resolved problems <span>{issues.length}</span></summary>
    <IssueList issues={issues.slice(0, 8)} now={now} onResolve={() => undefined} />
    {issues.length > 8 ? <p>Showing the latest 8 resolved problems.</p> : null}
  </details>
}

function QualityHoldList({ disabled, jobs, onRelease }: { disabled: boolean; jobs: ProductionJob[]; onRelease: (id: string, trigger: HTMLButtonElement) => void }) {
  if (!jobs.length) return <Empty>No job or batch is on quality hold.</Empty>
  return <div className="issue-list">{jobs.map((job) => {
    const hold = job.qualityHold
    if (!hold) return null
    return <article key={job.id}>
      <span className="issue-mark open">H</span>
      <div>
        <strong>{job.product} · {job.id}</strong>
        <small style={wrappedIssueDetail}>Held by {hold.heldBy} · {formatIssueDue(hold.heldAt)}</small>
        <small style={wrappedIssueDetail}>Reason: {hold.reason}</small>
        <small style={wrappedIssueDetail}>Evidence: {hold.evidenceReference}</small>
      </div>
      <button className="text-link" disabled={disabled} onClick={(event) => onRelease(job.id, event.currentTarget)} type="button">Review release</button>
    </article>
  })}</div>
}

function ShiftHandoffView({ handoff, onCopy }: { handoff: ProductionShiftHandoff; onCopy: () => void }) {
  const visibleMaterialEntries = handoff.materialEntries.slice(0, 8)
  return <div>
    <p className="form-notice" role="status">{handoff.shiftRef} · revision {handoff.sourceRevision} · {handoff.shiftOutput.goodUnits.toLocaleString()} good · {handoff.shiftOutput.scrapUnits.toLocaleString()} scrap · {handoff.materialTotals.length} material totals · {handoff.shortCloses.length} closed short · {handoff.unfinishedJobs.length} unfinished · {handoff.activeHolds.length} held · {handoff.priorityProblems.length} critical/high · {handoff.activeMaintenance.length} maintenance open.</p>
    <details className="compact-disclosure production-history">
      <summary>Shift entries <span>{handoff.shiftEntries.length}</span></summary>
      <div className="issue-list">
        {handoff.shiftEntries.map((entry) => <article key={entry.actionId}>
          <span className="issue-mark resolved">{entry.outputKind === 'scrap' ? 'S' : 'G'}</span>
          <div><strong>{entry.quantity.toLocaleString()} {entry.outputKind} · {entry.product}</strong><small style={wrappedIssueDetail}>{entry.jobId} · {formatIssueDue(entry.recordedAt)} · {entry.recordedBy}</small><small style={wrappedIssueDetail}>Reason: {entry.reason}</small><small style={wrappedIssueDetail}>Evidence: {entry.evidenceReference} · Action: {entry.actionId}</small></div>
        </article>)}
        {!handoff.shiftEntries.length ? <Empty>No output entry is attributed to this shift reference.</Empty> : null}
      </div>
    </details>
    <details className="compact-disclosure production-history">
      <summary>Material use <span>{handoff.materialEntries.length}</span></summary>
      <p className="panel-copy"><strong>Shift totals</strong></p>
      <div className="issue-list">
        {handoff.materialTotals.map((total) => <article key={`${total.materialRef}-${total.materialUnit}`}>
          <span aria-hidden="true" className="issue-mark resolved">Σ</span>
          <div><strong>{total.quantity.toLocaleString(undefined, { maximumFractionDigits: 3 })} {total.materialUnit} · {total.materialRef}</strong><small style={wrappedIssueDetail}>{total.entryCount} {total.entryCount === 1 ? 'entry' : 'entries'} in this shift</small></div>
        </article>)}
        {!handoff.materialTotals.length ? <Empty>No material use is attributed to this shift reference.</Empty> : null}
      </div>
      {visibleMaterialEntries.length ? <><p className="panel-copy"><strong>Recent evidence</strong></p><div className="issue-list">{visibleMaterialEntries.map((entry) => <article key={entry.actionId}>
        <span aria-hidden="true" className="issue-mark resolved">M</span>
        <div><strong>{entry.quantity.toLocaleString(undefined, { maximumFractionDigits: 3 })} {entry.materialUnit} · {entry.materialRef}{entry.materialLot ? ` · lot ${entry.materialLot}` : ''}</strong><small style={wrappedIssueDetail}>{entry.jobId} · {entry.product} · {formatIssueDue(entry.recordedAt)} · {entry.recordedBy}</small><small style={wrappedIssueDetail}>Reason: {entry.reason}</small><small style={wrappedIssueDetail}>Evidence: {entry.evidenceReference} · Action: {entry.actionId}</small></div>
      </article>)}</div></> : null}
      {handoff.materialEntries.length > visibleMaterialEntries.length ? <p className="panel-copy">Showing the latest {visibleMaterialEntries.length} of {handoff.materialEntries.length} entries. Copy handoff retains every attributed entry.</p> : null}
    </details>
    <details className="compact-disclosure production-history">
      <summary>Closed short <span>{handoff.shortCloses.length}</span></summary>
      <div className="issue-list">
        {handoff.shortCloses.map((entry) => <article key={entry.actionId}>
          <span aria-hidden="true" className="issue-mark resolved">C</span>
          <div><strong>{entry.product} · {entry.jobId}</strong><small style={wrappedIssueDetail}>{entry.goodUnits.toLocaleString()} good · {entry.scrapUnits.toLocaleString()} scrap · {entry.remainingUnits.toLocaleString()} not produced</small><small style={wrappedIssueDetail}>Closed {formatIssueDue(entry.recordedAt)} by {entry.recordedBy} · Shift {entry.shiftRef}</small><small style={wrappedIssueDetail}>Reason: {entry.reason}</small><small style={wrappedIssueDetail}>Evidence: {entry.evidenceReference} · Action: {entry.actionId}</small></div>
        </article>)}
        {!handoff.shortCloses.length ? <Empty>No job was closed short in this shift.</Empty> : null}
      </div>
    </details>
    <details className="compact-disclosure production-history">
      <summary>Unfinished jobs <span>{handoff.unfinishedJobs.length}</span></summary>
      <div className="issue-list">
        {handoff.unfinishedJobs.map((job) => <article key={job.id}>
          <span className={`issue-mark ${job.qualityHold ? 'open' : 'resolved'}`}>{job.qualityHold ? 'H' : 'J'}</span>
          <div><strong>{job.product} · {job.id}</strong><small style={wrappedIssueDetail}>{job.line} · {job.remainingUnits.toLocaleString()} remaining · {job.goodUnits.toLocaleString()} good · {job.scrapUnits.toLocaleString()} scrap</small><small style={wrappedIssueDetail}>{job.priority && job.dueAt ? `${productionJobPriorityLabels[job.priority]} · Due ${formatIssueDue(job.dueAt)}` : 'Schedule not recorded · legacy job'}</small>{job.qualityHold ? <small style={wrappedIssueDetail}>QUALITY HOLD · {job.qualityHold.heldBy} · Evidence: {job.qualityHold.evidenceReference}</small> : null}</div>
        </article>)}
        {!handoff.unfinishedJobs.length ? <Empty>No unfinished job is recorded.</Empty> : null}
      </div>
    </details>
    <details className="compact-disclosure production-history">
      <summary>Active quality holds <span>{handoff.activeHolds.length}</span></summary>
      <div className="issue-list">
        {handoff.activeHolds.map((heldJob) => <article key={heldJob.id}>
          <span className="issue-mark open">H</span>
          <div><strong>{heldJob.product} · {heldJob.id}</strong><small style={wrappedIssueDetail}>{heldJob.line} · target {heldJob.target.toLocaleString()} · {heldJob.goodUnits.toLocaleString()} good · {heldJob.scrapUnits.toLocaleString()} scrap · {heldJob.remainingUnits.toLocaleString()} remaining</small><small style={wrappedIssueDetail}>Held {formatIssueDue(heldJob.qualityHold.heldAt)} by {heldJob.qualityHold.heldBy}</small><small style={wrappedIssueDetail}>Reason: {heldJob.qualityHold.reason}</small><small style={wrappedIssueDetail}>Evidence: {heldJob.qualityHold.evidenceReference} · Action: {heldJob.qualityHold.actionId}</small></div>
        </article>)}
        {!handoff.activeHolds.length ? <Empty>No active quality hold is recorded.</Empty> : null}
      </div>
    </details>
    <details className="compact-disclosure production-history">
      <summary>Critical/high problems <span>{handoff.priorityProblems.length}</span></summary>
      <div className="issue-list">
        {handoff.priorityProblems.map((problem) => <article key={problem.id}>
          <span className="issue-mark open">{problem.severity.charAt(0).toUpperCase()}</span>
          <div><strong>{problem.summary}</strong><small style={wrappedIssueDetail}>{productionIssueSeverityLabels[problem.severity]} · {problem.area} · Opened {formatIssueDue(problem.openedAt)} by {problem.openedBy}</small><small style={wrappedIssueDetail}>Owner {problem.owner} · Due {formatIssueDue(problem.dueAt)}</small><small style={wrappedIssueDetail}>Next: {problem.containment}</small><small style={wrappedIssueDetail}>Evidence: {problem.evidenceReference} · Action: {problem.actionId}</small></div>
        </article>)}
        {!handoff.priorityProblems.length ? <Empty>No open critical or high problem is recorded.</Empty> : null}
      </div>
    </details>
    <details className="compact-disclosure production-history">
      <summary>Active maintenance <span>{handoff.activeMaintenance.length}</span></summary>
      <div className="issue-list">
        {handoff.activeMaintenance.map((record) => <article key={record.startActionId}>
          <span className="issue-mark open">MX</span>
          <div><strong>{record.machineName} · {record.owner}</strong><small style={wrappedIssueDetail}>{record.machineId} · Started {formatIssueDue(record.startedAt)} by {record.startedBy}</small><small style={wrappedIssueDetail}>Scope: {record.scope}</small><small style={wrappedIssueDetail}>Evidence: {record.startEvidenceReference} · Action: {record.startActionId}</small></div>
        </article>)}
        {!handoff.activeMaintenance.length ? <Empty>No active maintenance work is recorded.</Empty> : null}
      </div>
    </details>
    <details className="compact-disclosure production-history">
      <summary>Machine observations <span>{handoff.machineObservations.length}</span></summary>
      <div className="issue-list">
        {handoff.machineObservations.map((machine) => <article key={machine.id}>
          <span className={`machine-dot ${machine.state}`} />
          <div><strong>{machine.name}</strong><small style={wrappedIssueDetail}>{machine.id} · Recorded: {productionMachineStateLabels[machine.state]}</small>{machine.observation ? <><small style={wrappedIssueDetail}>Observed {formatIssueDue(machine.observation.observedAt)} by {machine.observation.observedBy}</small><small style={wrappedIssueDetail}>Reason: {machine.observation.reason}</small><small style={wrappedIssueDetail}>Evidence: {machine.observation.evidenceReference} · Action: {machine.observation.actionId}</small></> : <small style={wrappedIssueDetail}>No attributed observation recorded</small>}</div>
        </article>)}
        {!handoff.machineObservations.length ? <Empty>No machine record exists.</Empty> : null}
      </div>
    </details>
    <button className="core-button" onClick={onCopy} type="button">Copy handoff</button>
  </div>
}

export function SettingsPage() {
  const runtime = useOutletContext<RuntimeHealth>()
  const location = useLocation()
  const navigate = useNavigate()
  const [setupSearchParams] = useSearchParams()
  const [setup, setSetup] = useSetupWorkspace()
  const [commerce] = useCommerceWorkspace()
  const [production] = useProductionWorkspace()
  const [approvals, setApprovals] = useApprovalWorkspace()
  const [actions] = useStoredState<AccountableAction[]>(ACTION_KEY, [], normalizeActions)
  const [teamWorkspace] = useTeamWorkspace()
  const [notice, setNotice] = useState('')
  const [resetArmed, setResetArmed] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const [settingsStep, setSettingsStep] = useState<'workflow' | 'success'>('workflow')
  const [managedIdentity, setManagedIdentity] = useManagedIdentity(runtime.status === 'enterprise')
  const [managedEmail, setManagedEmail] = useState('')
  const [managedPassword, setManagedPassword] = useState('')
  const [managedWorkspace, setManagedWorkspace] = useState(currentManagedWorkspace())
  const [managedNotice, setManagedNotice] = useState('')
  const [managedBusy, setManagedBusy] = useState(false)
  const completion = pilotProgress(setup)
  const isPilotReady = pilotReady(setup)
  const workflowReady = Boolean(setup.workspace.trim() && setup.owner.trim() && setup.entryPoint.trim())
  const requestedProduct = setupProductFromQuery(setupSearchParams.get('product'))
  const selectedProduct = productContracts[setup.product]
  const selectedTemplate = templateFor(setup.product, setup.templateId)
  const evidenceDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Yangon' }).format(new Date())
  const evidenceFilename = `supermega-trial-evidence-${evidenceDate}.json`
  const managedApprovalRequests = approvals.map(toManagedApprovalRequest).filter((request): request is NonNullable<typeof request> => Boolean(request))
  const localProductRecords = collectLocalProductRecords(window.localStorage)
  const evidenceHref = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ contract: 'supermega_trial_evidence', version: 10, exportedAt: new Date().toISOString(), environment: 'isolated_demo', pilotReady: isPilotReady, setup, workflowProfile: selectedTemplate, commerce, production, accountableActions: actions, approvals, managedApprovalRequests, teams: teamWorkspace, localProductRecords }, null, 2))}`

  useEffect(() => {
    if (!requestedProduct || requestedProduct === setup.product) return
    const template = templateFor(requestedProduct, '')
    const selectionTimer = window.setTimeout(() => {
      setSetup((current) => ({
        ...current,
        product: requestedProduct,
        templateId: template.id,
        entryPoint: template.entryPoints.includes(current.entryPoint) ? current.entryPoint : template.entryPoints[0] ?? '',
        savedAt: undefined,
      }))
      setSettingsStep('workflow')
      setNotice(`Selected ${productDisplayName(requestedProduct)}. Your client details were kept.`)
    }, 0)
    return () => window.clearTimeout(selectionTimer)
  }, [requestedProduct, setSetup, setup.product])

  function updateSetup(patch: Partial<SetupState>) {
    setSetup((current) => ({ ...current, ...patch, savedAt: undefined }))
  }

  function chooseSettingsStep(step: 'workflow' | 'success') {
    setSettingsStep(step)
    if (location.hash) navigate('/settings/', { replace: true })
  }

  function changeProduct(product: SetupState['product']) {
    const template = templateFor(product, '')
    navigate(clientSetupPath(product), { replace: true })
    setSetup((current) => ({
      ...current,
      product,
      templateId: template.id,
      entryPoint: template.entryPoints.includes(current.entryPoint) ? current.entryPoint : template.entryPoints[0] ?? '',
      savedAt: undefined,
    }))
    setNotice(`Selected ${productDisplayName(product)}. Your client details were kept.`)
  }

  function changeTemplate(templateId: string) {
    const template = templateFor(setup.product, templateId)
    updateSetup({ templateId: template.id, entryPoint: template.entryPoints.includes(setup.entryPoint) ? setup.entryPoint : template.entryPoints[0] ?? '' })
  }

  function save(event: FormEvent) {
    event.preventDefault()
    if (!workflowReady) {
      setNotice('Complete the workflow name and responsible owner first.')
      chooseSettingsStep('workflow')
      return
    }
    setSetup((current) => ({ ...current, savedAt: new Date().toISOString() }))
    setNotice('Client setup saved in this browser. No source, account, or external action was connected.')
  }

  async function resetDemoWorkspace() {
    setResetBusy(true)
    try {
      const { resetCommerceOrderDraftRecovery } = await import('./commerce-order-draft')
      await resetCommerceOrderDraftRecovery()
      const retainedKeys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
        .filter((key): key is string => Boolean(key?.startsWith(STOREFRONT_DRAFT_RESET_PREFIX)
          || key?.startsWith(LEGACY_STOREFRONT_DRAFT_RESET_PREFIX)))
      ;[
        COMMERCE_KEY,
        PRODUCTION_KEY,
        APPROVAL_KEY,
        SETUP_KEY,
        ACTION_KEY,
        TEAM_WORK_KEY,
        WEBSITE_STORAGE_KEY,
        LEGACY_WEBSITE_STORAGE_KEY,
        WEBSITE_ECOMMERCE_HANDOFF_KEY,
        LEGACY_STOREFRONT_DRAFT_RESET_KEY,
        ...retainedKeys,
        ...LEGACY_TEAM_WORK_KEYS,
        ...LEGACY_COMMERCE_KEYS,
        ...LEGACY_PRODUCTION_KEYS,
        ...LEGACY_APPROVAL_KEYS,
        ...LEGACY_SETUP_KEYS,
      ].forEach((key) => window.localStorage.removeItem(key))
      window.location.assign('/')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The local trial could not be reset safely.')
      setResetBusy(false)
    }
  }

  async function connectManagedWorkspace(event: FormEvent) {
    event.preventDefault()
    setManagedBusy(true)
    setManagedNotice('Signing in and checking workspace membership…')
    try {
      const identity = await signInManagedTrial(managedEmail, managedPassword, managedWorkspace)
      setManagedIdentity(identity)
      setManagedPassword('')
      try {
        const bootstrap = await loadManagedBootstrap(identity)
        setApprovals((current) => mergeManagedApprovals(current, bootstrap.approvals))
        setManagedNotice(`Connected to ${identity.workspaceId}. Managed approvals are ready.`)
      } catch (workspaceError) {
        setManagedNotice(workspaceError instanceof Error ? workspaceError.message : 'Signed in, but this workspace is not ready.')
      }
    } catch (error) {
      setManagedNotice(error instanceof Error ? error.message : 'Managed sign-in failed.')
    } finally {
      setManagedBusy(false)
    }
  }

  async function disconnectManagedWorkspace() {
    setManagedBusy(true)
    await signOutManagedTrial()
    setManagedIdentity(null)
    setApprovals((current) => current.filter((approval) => !approval.managed))
    setManagedNotice('Managed account disconnected from this browser.')
    setManagedBusy(false)
  }

  return (
    <div className="workspace-screen settings-screen">
      <PageHeading eyebrow="Client setup" title="Set up one client solution" copy="Choose a proven workflow, bring existing data safely, and define what success means." />
      <nav aria-label="Setup steps" className="settings-step-nav">
        <button aria-current={settingsStep === 'workflow' ? 'step' : undefined} onClick={() => chooseSettingsStep('workflow')} type="button"><span>1</span>Solution</button>
        <button aria-current={settingsStep === 'success' ? 'step' : undefined} onClick={() => chooseSettingsStep('success')} type="button"><span>2</span>Success</button>
      </nav>
      <div className="settings-grid settings-step-content">
        <form className="core-panel setup-form" onSubmit={save}>
          <div className="panel-head"><div><span className="core-eyebrow">Client solution</span><h2>{settingsStep === 'workflow' ? 'Choose what to set up' : 'Define success and authority'}</h2></div><span className={`status-pill ${isPilotReady ? 'approved' : 'bounded'}`}>{isPilotReady ? 'ready' : `${completion}%`}</span></div>
          <div className="pilot-progress"><div className="progress-track"><i style={{ width: `${completion}%` }} /></div><small>{settingsStep === 'workflow' ? 'Solution · template · starting point · owner' : 'Current record · baseline · target · authority · evidence'}</small></div>
          <fieldset className="settings-step-fields" disabled={settingsStep !== 'workflow'} hidden={settingsStep !== 'workflow'}>
          <div aria-label="Choose solution" className="setup-product-grid" role="group">{Object.values(productContracts).map((product) => <button aria-pressed={setup.product === product.id} key={product.id} onClick={() => changeProduct(product.id)} type="button"><span><strong>{product.name}</strong><small>{product.headline}</small></span><b>{product.templates.length} templates</b></button>)}</div>
          <div className="form-row"><label>Starting template<select value={setup.templateId} onChange={(event) => changeTemplate(event.target.value)}>{templatesFor(setup.product).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label><label>Starting point<select value={setup.entryPoint} onChange={(event) => updateSetup({ entryPoint: event.target.value })}>{selectedTemplate.entryPoints.map((entryPoint) => <option key={entryPoint}>{entryPoint}</option>)}</select></label></div>
          <div className="setup-template-summary"><div><span>Outcome</span><strong>{selectedTemplate.outcome}</strong></div><ol aria-label={`${selectedTemplate.name} workflow`}>{selectedTemplate.workflow.map((step) => <li key={step}>{step}</li>)}</ol><small>Measure success with {selectedTemplate.metric.toLowerCase()}.</small></div>
          <div className="form-row"><label>Workspace name<input maxLength={80} required value={setup.workspace} onChange={(event) => updateSetup({ workspace: event.target.value })} placeholder={setup.product === 'commerce' ? 'Example: Social sales team' : setup.product === 'production' ? 'Example: Main plant' : setup.product === 'website' ? 'Example: Company website' : 'Example: Online order desk'} /></label><label>Responsible owner<input maxLength={80} required value={setup.owner} onChange={(event) => updateSetup({ owner: event.target.value })} placeholder="Name or role" /></label></div>
          <Suspense fallback={<p className="form-notice" role="status">Loading the client data template…</p>}><ClientDataOnboarding managedIdentity={managedIdentity} owner={setup.owner} product={setup.product} productName={selectedProduct.name} productSlug={selectedProduct.slug} workflowTemplateId={selectedTemplate.id} workspace={setup.workspace} /></Suspense>
          <div className="settings-step-actions"><span>Step 1 of 2</span><button className="core-button primary" disabled={!workflowReady} onClick={() => chooseSettingsStep('success')} type="button">Continue to success</button></div>
          </fieldset>
          <fieldset className="settings-step-fields" disabled={settingsStep !== 'success'} hidden={settingsStep !== 'success'}>
          <div className="template-contract settings-workflow-summary"><span>{productDisplayName(setup.product)}</span><strong>{setup.workspace || 'Unnamed workspace'}</strong><small>{selectedTemplate.name} · {setup.owner || 'Owner needed'}</small></div>
          <label>Current record<input maxLength={180} required value={setup.currentRecord} onChange={(event) => updateSetup({ currentRecord: event.target.value })} placeholder="What is used today: chat, paper, spreadsheet, system, or machine log?" /></label>
          <div className="form-row pilot-text-row"><label>Baseline<textarea maxLength={240} required value={setup.baseline} onChange={(event) => updateSetup({ baseline: event.target.value })} placeholder="Current time, error rate, backlog, or output." /></label><label>Target outcome<textarea maxLength={240} required value={setup.targetOutcome} onChange={(event) => updateSetup({ targetOutcome: event.target.value })} placeholder={`Set a target for ${selectedTemplate.metric.toLowerCase()}.`} /></label></div>
          <div className="form-row pilot-text-row"><label>Human authority boundary<textarea maxLength={240} required value={setup.authorityBoundary} onChange={(event) => updateSetup({ authorityBoundary: event.target.value })} placeholder="Which sends, payments, approvals, or production changes require an owner?" /></label><label>Acceptance evidence<textarea maxLength={240} required value={setup.acceptanceEvidence} onChange={(event) => updateSetup({ acceptanceEvidence: event.target.value })} placeholder="What record or result proves the pilot works?" /></label></div>
          <div className="settings-step-actions"><button className="text-link" onClick={() => chooseSettingsStep('workflow')} type="button">Back</button><button className="core-button primary" type="submit">Save client setup</button></div>
          {setup.savedAt ? <div className="setup-complete"><div><strong>Client setup saved.</strong><small>Reviewed records stay separate from sample data until a managed import is confirmed.</small></div><Link className="core-button" to={setupProductPreviewPath(setup.product)}>Open {productDisplayName(setup.product)}</Link></div> : null}
          </fieldset>
          <p className="form-notice" aria-live="polite">{notice || (setup.savedAt ? `Last saved ${formatTime(setup.savedAt)}` : 'The draft stays in this browser until exported or managed mode is activated.')}</p>
        </form>
      </div>
      <details className="settings-advanced" id="controls" open={location.hash === '#controls' || undefined}>
        <summary><span>Advanced controls</span><small>Managed account, security, evidence, and reset</small></summary>
        <div className="settings-advanced-content">
          <section className="core-panel system-boundary-panel">
            <div className="panel-head"><div><span className="core-eyebrow">System boundary</span><h2>{runtime.status === 'enterprise' ? 'Managed mode ready' : 'Managed mode locked'}</h2></div><RuntimeBadge status={runtime.status} /></div>
            {runtime.status === 'enterprise' && managedTrialAuthConfigured() ? managedIdentity ? <div className="template-contract"><span>Managed account</span><strong>{managedIdentity.email}</strong><small>{managedIdentity.workspaceId} · membership and capabilities are checked by the API</small><button className="text-link" disabled={managedBusy} onClick={() => void disconnectManagedWorkspace()} type="button">Disconnect</button></div> : <form className="core-form compact-form" onSubmit={(event) => void connectManagedWorkspace(event)}><span className="core-eyebrow">Managed workspace</span><div className="form-row"><label>Email<input autoComplete="username" maxLength={160} onChange={(event) => setManagedEmail(event.target.value)} required type="email" value={managedEmail} /></label><label>Password<input autoComplete="current-password" minLength={8} onChange={(event) => setManagedPassword(event.target.value)} required type="password" value={managedPassword} /></label></div><label>Workspace ID<input maxLength={128} onChange={(event) => setManagedWorkspace(event.target.value)} placeholder="Your provisioned workspace" required value={managedWorkspace} /></label><button className="core-button primary" disabled={managedBusy} type="submit">{managedBusy ? 'Checking…' : 'Connect workspace'}</button></form> : null}
            {managedNotice ? <p className="form-notice" role="status">{managedNotice}</p> : null}
            <div className="readiness-list"><span><small>Client setup</small><strong>{isPilotReady ? 'Ready' : `${completion}% complete`}</strong></span><span><small>Runtime</small><strong>{runtime.serviceStatus}</strong></span><span><small>Operating mode</small><strong>{runtime.operatingMode.replace('_', ' ')}</strong></span><span><small>Managed data</small><strong>{runtime.enterpriseDbReady ? 'Ready' : 'Not connected'}</strong></span><span><small>Security</small><strong>{runtime.securityReady ? 'Ready' : 'Not ready'}</strong></span><span><small>Write path</small><strong>{runtime.writesReady ? 'Enabled' : 'Locked'}</strong></span><span><small>Source coverage</small><strong>{runtime.coverageScore}%</strong></span><span><small>External action</small><strong>Owner controlled</strong></span></div>
            {runtime.status !== 'enterprise' ? <ul className="requirement-list">{(runtime.requirements.length ? runtime.requirements : ['Configure managed tenant persistence.', 'Verify production identity and source coverage.']).map((requirement) => <li key={requirement}>{requirement}</li>)}</ul> : null}
            <p className="authority-note">External sends, payments, publishing, access changes, and production writes remain owner-approved and auditable.</p>
          </section>
          <section className="core-panel trial-control-panel"><div><span className="core-eyebrow">Local evidence</span><h2>Export or reset deliberately.</h2><p>Export the client setup and browser workspace for review. Reset clears Company, Shop, unfinished order drafts, Plant, Website, Ecommerce setup, and handoff records only after confirmation.</p></div><div className="trial-actions"><a className="core-button" download={evidenceFilename} href={evidenceHref}>Export evidence</a>{resetArmed ? <><button className="text-link" disabled={resetBusy} onClick={() => setResetArmed(false)} type="button">Cancel</button><button className="core-button danger" disabled={resetBusy} onClick={() => void resetDemoWorkspace()} type="button">{resetBusy ? 'Resetting…' : 'Confirm reset'}</button></> : <button className="text-link danger-text" onClick={() => setResetArmed(true)} type="button">Reset local trial</button>}</div></section>
        </div>
      </details>
    </div>
  )
}
