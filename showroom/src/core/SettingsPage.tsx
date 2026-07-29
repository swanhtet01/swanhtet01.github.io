import { lazy, Suspense, type FormEvent, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useOutletContext, useSearchParams } from 'react-router'

import {
  LEGACY_WEBSITE_STORAGE_KEY,
  WEBSITE_ECOMMERCE_HANDOFF_KEY,
  WEBSITE_STORAGE_KEY,
} from '../products/product-handoff'
import { COMMERCE_KEY, LEGACY_COMMERCE_KEYS } from './commerce-workspace'
import { BEHAVIOR_TRAIL_KEY, readBehaviorTrail } from './behavior-trail'
import {
  ACTION_KEY,
  APPROVAL_KEY,
  collectLocalProductRecords,
  clientSetupPath,
  LEGACY_APPROVAL_KEYS,
  LEGACY_SETUP_KEYS,
  LEGACY_STOREFRONT_DRAFT_RESET_KEY,
  LEGACY_STOREFRONT_DRAFT_RESET_PREFIX,
  managedTrialRequestUrl,
  mergeManagedApprovals,
  PageHeading,
  pilotProgress,
  pilotReady,
  productContracts,
  productDisplayName,
  RuntimeBadge,
  SETUP_KEY,
  setupProductFromQuery,
  setupProductPreviewPath,
  SHOP_ORDER_DRAFT_RESET_EPOCH_KEY,
  SHOP_ORDER_DRAFT_RESET_PREFIX,
  STOREFRONT_DRAFT_RESET_PREFIX,
  templateFor,
  templatesFor,
  toManagedApprovalRequest,
  useAccountableActions,
  useApprovalWorkspace,
  useCommerceWorkspace,
  useManagedIdentity,
  useProductionWorkspace,
  useSetupWorkspace,
  type RuntimeHealth,
  type SetupState,
  type SetupProductId,
} from './CoreApp'
import {
  type ManagedEcommerceOrderQueueApplyPreflight,
  type ManagedEcommerceOrderQueueImportPlan,
  type ManagedEcommerceOrderQueueValidation,
  buildManagedEcommerceOrderQueueValidation,
  createManagedApproval,
  currentManagedWorkspace,
  loadManagedBootstrap,
  managedTrialAuthConfigured,
  planManagedEcommerceOrderQueueImport,
  preflightManagedEcommerceOrderQueueApply,
  signInManagedTrial,
  signOutManagedTrial,
  validateManagedEcommerceOrderQueue,
} from './managed-trial'
import {
  buildEcommerceManagedStoreActivationPacket,
  validateEcommerceManagedStoreActivationPacket,
} from '../products/ecommerce/ecommerce-activation-packet'
import {
  buildEcommerceOrderImportReviewPacket,
  buildEcommerceOrderQueueReadinessPacket,
  validateEcommerceOrderImportReviewPacket,
  type EcommerceOrderQueueReadinessPacket,
} from '../products/ecommerce/ecommerce-order-review-packet'
import { LEGACY_PRODUCTION_KEYS, PRODUCTION_KEY } from './production-workspace'
import { formatTime, LEGACY_TEAM_WORK_KEYS, TEAM_WORK_KEY, useTeamWorkspace } from './team-work'

const ClientDataOnboarding = lazy(() => import('./ClientDataOnboarding').then((module) => ({ default: module.ClientDataOnboarding })))
const ManagedActivationRunbook = lazy(() => import('./ManagedActivationRunbook').then((module) => ({ default: module.ManagedActivationRunbook })))

type SchedulerActivation = {
  status: string
  configured: boolean
  activationRequested: boolean
  activationEnabled: boolean
  activationEvidenceContract: string
  activationEvidenceEnvironmentKey: string
  activationEvidenceCount: number
  activationEvidenceDigest: string | null
  configurationErrors: string[]
  queueJobTypes: string[]
  dailyJobTypes: string[]
  maxJobsPerRun: number
  budgetGrantsRequired: boolean
  redirectsAllowed: boolean
  nextAction: string
}

function normalizeSchedulerActivation(body: unknown): SchedulerActivation | null {
  if (!body || typeof body !== 'object') return null
  const cloud = body as { status?: unknown; scheduler?: Record<string, unknown> }
  const scheduler = cloud.scheduler
  if (!scheduler
    || typeof cloud.status !== 'string'
    || typeof scheduler.configured !== 'boolean'
    || typeof scheduler.activation_requested !== 'boolean'
    || typeof scheduler.activation_enabled !== 'boolean'
    || typeof scheduler.activation_evidence_contract !== 'string'
    || typeof scheduler.activation_evidence_environment_key !== 'string'
    || !Array.isArray(scheduler.configuration_errors)
    || !Array.isArray(scheduler.queue_job_types)
    || !Array.isArray(scheduler.daily_job_types)
    || typeof scheduler.max_jobs_per_run !== 'number'
    || typeof scheduler.budget_grants_required !== 'boolean'
    || scheduler.redirects_allowed !== false) return null
  return {
    status: cloud.status,
    configured: scheduler.configured,
    activationRequested: scheduler.activation_requested,
    activationEnabled: scheduler.activation_enabled,
    activationEvidenceContract: scheduler.activation_evidence_contract,
    activationEvidenceEnvironmentKey: scheduler.activation_evidence_environment_key,
    activationEvidenceCount: Number.isFinite(scheduler.activation_evidence_count) ? Number(scheduler.activation_evidence_count) : 0,
    activationEvidenceDigest: typeof scheduler.activation_evidence_digest === 'string' ? scheduler.activation_evidence_digest : null,
    configurationErrors: scheduler.configuration_errors.filter((item): item is string => typeof item === 'string'),
    queueJobTypes: scheduler.queue_job_types.filter((item): item is string => typeof item === 'string'),
    dailyJobTypes: scheduler.daily_job_types.filter((item): item is string => typeof item === 'string'),
    maxJobsPerRun: Number.isFinite(scheduler.max_jobs_per_run) ? Number(scheduler.max_jobs_per_run) : 0,
    budgetGrantsRequired: scheduler.budget_grants_required,
    redirectsAllowed: scheduler.redirects_allowed,
    nextAction: scheduler.configured ? 'Hosted scheduler can run bounded queues.' : 'Attach signed scheduler evidence, protected cron secret, worker URL, and host allowlist before autopilot runs.',
  }
}

function safePacketFilename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'store'
}

function settingsCommandUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const value = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

function settingsFingerprint(value: unknown) {
  const input = JSON.stringify(value)
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function useSchedulerActivation() {
  const [schedulerActivation, setSchedulerActivation] = useState<SchedulerActivation | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/cloud-autonomy/status', { headers: { accept: 'application/json' }, signal: controller.signal })
      .then(async (response) => {
        const type = response.headers.get('content-type') ?? ''
        if (!response.ok || !type.includes('application/json')) throw new Error('cloud_status_unavailable')
        setSchedulerActivation(normalizeSchedulerActivation(await response.json()))
      })
      .catch(() => {
        if (!controller.signal.aborted) setSchedulerActivation(null)
      })
    return () => controller.abort()
  }, [])

  return schedulerActivation
}

export function SettingsPage() {
  const runtime = useOutletContext<RuntimeHealth>()
  const schedulerActivation = useSchedulerActivation()
  const location = useLocation()
  const navigate = useNavigate()
  const [setupSearchParams] = useSearchParams()
  const [setup, setSetup] = useSetupWorkspace()
  const [commerce] = useCommerceWorkspace()
  const [production] = useProductionWorkspace()
  const [approvals, setApprovals] = useApprovalWorkspace()
  const [actions] = useAccountableActions()
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
  const [ecommerceActivationPacketText, setEcommerceActivationPacketText] = useState('')
  const [ecommerceActivationPacketReview, setEcommerceActivationPacketReview] = useState<Array<readonly [string, string]>>([
    ['Status', 'Waiting for packet'],
    ['Boundary', 'Review only'],
  ])
  const [ecommerceOrderReviewPacketText, setEcommerceOrderReviewPacketText] = useState('')
  const [ecommerceOrderReviewPacketReview, setEcommerceOrderReviewPacketReview] = useState<Array<readonly [string, string]>>([
    ['Status', 'Waiting for packet'],
    ['Boundary', 'Review only'],
  ])
  const [ecommerceOrderQueueReadinessPacket, setEcommerceOrderQueueReadinessPacket] = useState<EcommerceOrderQueueReadinessPacket | null>(null)
  const [ecommerceOrderQueueServerValidation, setEcommerceOrderQueueServerValidation] = useState<ManagedEcommerceOrderQueueValidation | null>(null)
  const [ecommerceOrderQueueImportPlan, setEcommerceOrderQueueImportPlan] = useState<ManagedEcommerceOrderQueueImportPlan | null>(null)
  const [ecommerceOrderQueueApplyPreflight, setEcommerceOrderQueueApplyPreflight] = useState<ManagedEcommerceOrderQueueApplyPreflight | null>(null)
  const [ecommerceOrderQueueServerBusy, setEcommerceOrderQueueServerBusy] = useState(false)
  const [ecommerceOrderQueueApprovalBusy, setEcommerceOrderQueueApprovalBusy] = useState(false)
  const [ecommerceOrderQueueImportPlanBusy, setEcommerceOrderQueueImportPlanBusy] = useState(false)
  const [ecommerceOrderQueueApplyPreflightBusy, setEcommerceOrderQueueApplyPreflightBusy] = useState(false)
  const completion = pilotProgress(setup)
  const isPilotReady = pilotReady(setup)
  const workflowReady = Boolean(setup.workspace.trim() && setup.owner.trim() && setup.entryPoint.trim())
  const workflowCompletion = Math.round(([setup.templateId, setup.entryPoint, setup.workspace.trim(), setup.owner.trim()].filter(Boolean).length / 4) * 100)
  const displayedCompletion = settingsStep === 'workflow' ? workflowCompletion : completion
  const displayedReady = settingsStep === 'workflow' ? workflowReady : isPilotReady
  const requestedProduct = setupProductFromQuery(setupSearchParams.get('product'))
  const selectedProduct = productContracts[setup.product]
  const selectedTemplate = templateFor(setup.product, setup.templateId)
  const launchPackRows: Array<readonly [string, string, string]> = setup.product === 'commerce'
    ? [
      ['Bring', 'Product CSV, stock count, payment proof', 'Start from products, on-hand units, prices, and recent payment exceptions.'],
      ['AI prepares', 'Catalog, reorder, order, accounting packets', 'The workspace maps SKU data, ranks stock risk, drafts Shop work, and keeps receipts reviewable.'],
      ['First proof', 'One clean sale or stock review', 'Show the owner a reviewed queue before any stock, supplier, refund, or ledger write.'],
      ['Gate', 'Owner approves writes', 'No sale, payment, supplier message, stock move, or accounting export runs from setup.'],
    ]
    : setup.product === 'production'
      ? [
        ['Bring', 'Job CSV, material list, quality holds', 'Start from planned work, BOM/material needs, WCM/maintenance issues, and ISO evidence.'],
        ['AI prepares', 'MES queue, MRP check, ISO handoff', 'The workspace ranks jobs, blockers, material proof, quality release, and cost-readiness.'],
        ['First proof', 'One shift handoff packet', 'Show production, quality, maintenance, trace, and cost evidence before any plant write.'],
        ['Gate', 'Owner approves production', 'No equipment command, material issue, quality release, costing, or production write runs from setup.'],
      ]
      : setup.product === 'website'
        ? [
          ['Bring', 'Facts, offers, proof, photos, links', 'Start from the buyer proof needed to generate a useful website package.'],
          ['AI prepares', 'Pages, copy, CTAs, SEO, release checklist', 'The workspace creates a reviewable static package and rollout plan without touching DNS.'],
          ['First proof', 'One reviewed site package', 'Show the owner a package with contact route, claims, proof, and publish blockers.'],
          ['Gate', 'Owner approves launch', 'No domain, form send, analytics install, CRM write, or publish action runs from setup.'],
        ]
        : [
          ['Bring', 'Catalog rows, order CSV, channel samples', 'Start from products plus Viber, LINE, WeChat, email, form, or CSV order examples.'],
          ['AI prepares', 'Storefront, quote, order review, Shop handoff', 'The workspace normalizes customer, SKU, quantity, fulfilment, payment, and source proof.'],
          ['First proof', 'One Shop-ready order packet', 'Show ready/blocked order rows and the owner handoff before customer contact or fulfilment.'],
          ['Gate', 'Owner approves fulfilment', 'No customer message, payment capture, delivery booking, stock move, refund, or Shop write runs from setup.'],
        ]
  const launchPackManifest = {
    contract: 'supermega.launch_pack_manifest.v1',
    version: 1,
    createdAt: new Date().toISOString(),
    product: selectedProduct.name,
    productSlug: selectedProduct.slug,
    templateId: selectedTemplate.id,
    templateName: selectedTemplate.name,
    workspace: setup.workspace || 'Workspace not named',
    owner: setup.owner || 'Owner not assigned',
    rows: launchPackRows.map(([label, value, detail]) => ({ label, value, detail })),
    allowedAiUses: ['map_starting_data', 'rank_first_workflow', 'draft_review_packet', 'summarize_missing_proof'],
    ownerGate: launchPackRows.find(([label]) => label === 'Gate')?.[1] ?? 'Owner approval required',
    forbiddenActions: ['customer_message_send', 'payment_capture', 'wallet_debit', 'delivery_booking', 'stock_move', 'supplier_message', 'quality_release', 'production_write', 'domain_publish', 'crm_write', 'accounting_post', 'model_training_without_owner_approval'],
    activationRequired: true,
  }
  const evidenceDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Yangon' }).format(new Date())
  const evidenceFilename = `supermega-trial-evidence-${evidenceDate}.json`
  const managedTrialRequestFilename = `supermega-managed-trial-request-${evidenceDate}.json`
  const managedApprovalRequests = approvals.map(toManagedApprovalRequest).filter((request): request is NonNullable<typeof request> => Boolean(request))
  const localProductRecords = collectLocalProductRecords(window.localStorage)
  const localRecordCount = Object.keys(localProductRecords).length
  const localProductRecordKeys = Object.keys(localProductRecords)
  const websiteLocalRecordCount = localProductRecordKeys.filter((key) => key === WEBSITE_STORAGE_KEY || key === LEGACY_WEBSITE_STORAGE_KEY || key.startsWith('supermega.website.workspace.recovery.v1.')).length
  const ecommerceLocalRecordCount = localProductRecordKeys.filter((key) => key === WEBSITE_ECOMMERCE_HANDOFF_KEY || key.startsWith(STOREFRONT_DRAFT_RESET_PREFIX) || key.startsWith(LEGACY_STOREFRONT_DRAFT_RESET_PREFIX)).length
  const behaviorTrail = readBehaviorTrail(window.localStorage)
  const behaviorSignalCount = behaviorTrail.length
  const agentBehaviorSignals = behaviorTrail.filter((entry) => entry.event === 'agent_job_seen' || entry.event === 'agent_job_chosen')
  const chosenAgentSignals = agentBehaviorSignals.filter((entry) => entry.event === 'agent_job_chosen')
  const agentJobCounts = new Map<string, { product: string; job: string; seen: number; chosen: number; lastAt: string }>()
  agentBehaviorSignals.forEach((entry) => {
    const key = `${entry.product}:${entry.detail}`
    const current = agentJobCounts.get(key) ?? { product: entry.product, job: entry.detail, seen: 0, chosen: 0, lastAt: entry.createdAt }
    if (entry.event === 'agent_job_seen') current.seen += 1
    if (entry.event === 'agent_job_chosen') current.chosen += 1
    if (entry.createdAt > current.lastAt) current.lastAt = entry.createdAt
    agentJobCounts.set(key, current)
  })
  const rankedAgentJobs = [...agentJobCounts.values()].sort((left, right) => (
    right.chosen - left.chosen
    || right.seen - left.seen
    || right.lastAt.localeCompare(left.lastAt)
  ))
  const agentProductName = (product: string) => (
    product === 'commerce'
    || product === 'production'
    || product === 'website'
    || product === 'ecommerce'
      ? productDisplayName(product)
      : productDisplayName(setup.product)
  )
  const topAgentJob = rankedAgentJobs[0]
  const lastChosenAgentJob = chosenAgentSignals.at(-1)
  const agentBehaviorRows = [
    ['Signals', agentBehaviorSignals.length ? `${agentBehaviorSignals.length} queue signals` : 'No queue signals', agentBehaviorSignals.length ? 'Seen and chosen recommendations are saved locally for export.' : 'Open a product queue to start behavior memory.'],
    ['Top job', topAgentJob ? `${agentProductName(topAgentJob.product)}: ${topAgentJob.job}` : 'No pattern yet', topAgentJob ? `${topAgentJob.seen} seen - ${topAgentJob.chosen} chosen.` : 'The system waits for repeated owner behavior before ranking work.'],
    ['Last chosen', lastChosenAgentJob ? `${agentProductName(lastChosenAgentJob.product)}: ${lastChosenAgentJob.detail}` : 'Nothing chosen yet', lastChosenAgentJob ? `Captured ${formatTime(lastChosenAgentJob.createdAt)}.` : 'Click a recommended agent job to teach the next handoff.'],
  ] as const
  const learningRows = [
    ['Data', localRecordCount ? `${localRecordCount} records` : 'Import'],
    ['Trust', `${runtime.coverageScore}%`],
    ['Review', `${managedApprovalRequests.length || approvals.length} packets`],
    ['Behavior', behaviorSignalCount ? `${behaviorSignalCount} signals` : 'Local only'],
  ] as const
  const learningPlanRows = [
    ['Source graph', localRecordCount ? `${localRecordCount} local records prepared` : 'No local records yet', localRecordCount ? 'Exported evidence keeps the browser-local source package for managed validation.' : 'Use Shop, Plant, Website, Ecommerce, or import setup to create the first record.'],
    ['Behavior trail', behaviorSignalCount ? `${behaviorSignalCount} local signals` : 'No local signals yet', behaviorSignalCount ? 'Premium can rank next actions from reviewed workspace behavior after import.' : 'Open Shop, Plant, Website, Ecommerce, or setup so the system can capture local activity history.'],
    ['Decision memory', managedApprovalRequests.length || approvals.length ? `${managedApprovalRequests.length || approvals.length} review packets` : 'No review packets yet', managedApprovalRequests.length || approvals.length ? 'Human approvals become reusable context after managed activation.' : 'Approve or decline at least one prepared decision before relying on AI context.'],
    ['Owner gate', isPilotReady ? 'Ready for managed review' : `${completion}% trial evidence`, isPilotReady ? 'Export evidence, then request managed trial; writes stay locked until server controls pass.' : 'Complete baseline, target, authority boundary, and acceptance evidence first.'],
  ] as const
  const agentPlanRows = [
    ['Agent worker', `${selectedProduct.name} operator`, `Prepares ${selectedTemplate.name.toLowerCase()} from approved sources.`],
    ['First job', selectedTemplate.workflow[0] ?? selectedTemplate.outcome, selectedTemplate.outcome],
    ['Tool boundary', runtime.writesReady ? 'Write gate ready' : 'Writes locked', 'Drafts, imports, messages, publishes, payments, and production changes wait for human approval.'],
    ['Learning loop', localRecordCount || actions.length || behaviorSignalCount ? `${localRecordCount + actions.length + behaviorSignalCount} signals` : 'No signals yet', 'Premium learns only from exported records, local behavior, accountable actions, and reviewed decisions.'],
  ] as const
  const evidencePlanReady = runtime.evidencePlan.length > 0 && runtime.evidencePlan.every((item) => item.ready)
  const aiContextQualityRows = [
    ['Source data', localRecordCount ? `${localRecordCount} prepared` : 'Need records', localRecordCount ? 'Local product records are ready for managed validation.' : 'Import or use a product workspace before premium learning.'],
    ['Behavior', agentBehaviorSignals.length ? `${agentBehaviorSignals.length} signals` : 'Need usage', agentBehaviorSignals.length ? 'Agent queue views and choices can teach ranking after approval.' : 'Open and choose product agent jobs to create behavior memory.'],
    ['Decisions', managedApprovalRequests.length || approvals.length ? `${managedApprovalRequests.length || approvals.length} reviewed` : 'Need review', managedApprovalRequests.length || approvals.length ? 'Human decisions can become reusable context.' : 'Record at least one approval or decline before learning from decisions.'],
    ['Controls', runtime.writesReady && evidencePlanReady ? 'Ready' : 'Locked', runtime.writesReady && evidencePlanReady ? 'Managed writes and evidence gates are ready.' : 'Managed activation gates must pass before AI can learn from customer data.'],
    ['Next handoff', localRecordCount && agentBehaviorSignals.length && (managedApprovalRequests.length || approvals.length) ? 'Export context' : 'Collect proof', 'Export stays browser-local until the owner requests managed activation.'],
  ] as const
  const aiProductSourceRows = [
    ['Shop', commerce.items.length || commerce.orders.length ? `${commerce.items.length} SKU / ${commerce.orders.length} orders` : 'Need Shop use', 'Premium can learn stock, order, payment, purchase, and counter patterns after managed import.'],
    ['Plant', production.jobs.length || production.events.length ? `${production.jobs.length} jobs / ${production.events.length} events` : 'Need Plant use', 'Premium can learn MES, quality, WCM, trace, and handoff patterns after managed import.'],
    ['Website', websiteLocalRecordCount ? `${websiteLocalRecordCount} local records` : 'Need website save', 'Premium can learn content, lead capture, approval, package, and rollout readiness after managed import.'],
    ['Ecommerce', ecommerceLocalRecordCount ? `${ecommerceLocalRecordCount} handoff records` : 'Need store handoff', 'Premium can learn catalog, storefront, order review, and Shop queue handoff after managed import.'],
    ['Behavior', agentBehaviorSignals.length ? `${agentBehaviorSignals.length} agent signals` : 'Need usage', 'Premium ranks next actions only from exported local choices and approved decisions.'],
  ] as const
  const aiProductSourceMap = {
    contract: 'supermega.ai_product_source_map.v1',
    version: 1,
    createdAt: new Date().toISOString(),
    evidenceVersion: 23,
    products: [
      {
        product: 'Shop',
        source: 'commerce_workspace',
        prepared: commerce.items.length > 0 || commerce.orders.length > 0,
        records: { skus: commerce.items.length, orders: commerce.orders.length, purchaseOrders: commerce.purchaseOrders?.length ?? 0 },
        allowedLearning: ['stock_patterns', 'order_queue_priority', 'payment_exception_summary', 'purchase_reorder_recommendations'],
      },
      {
        product: 'Plant',
        source: 'production_workspace',
        prepared: production.jobs.length > 0 || production.events.length > 0,
        records: { jobs: production.jobs.length, machines: production.machines.length, issues: production.issues.length, events: production.events.length },
        allowedLearning: ['mes_next_action_rank', 'quality_hold_summary', 'wcm_exception_triage', 'material_trace_handoff'],
      },
      {
        product: 'Website',
        source: 'website_local_records',
        prepared: websiteLocalRecordCount > 0,
        records: { localRecords: websiteLocalRecordCount },
        allowedLearning: ['content_gap_summary', 'lead_capture_readiness', 'release_package_review', 'rollout_blocker_summary'],
      },
      {
        product: 'Ecommerce',
        source: 'ecommerce_handoff_records',
        prepared: ecommerceLocalRecordCount > 0,
        records: { localRecords: ecommerceLocalRecordCount },
        allowedLearning: ['storefront_readiness', 'catalog_match_summary', 'order_queue_review', 'shop_handoff_rank'],
      },
    ],
    behaviorSignals: agentBehaviorSignals.length,
    decisionPackets: managedApprovalRequests.length || approvals.length,
    allowedUses: ['summarize_product_sources', 'rank_product_next_actions', 'prepare_import_mapping', 'draft_operator_recommendations'],
    forbiddenActions: ['customer_message_send', 'payment_capture', 'stock_move', 'production_write', 'domain_publish', 'crm_write', 'model_training_without_owner_approval'],
    activationRequired: true,
  }
  const contextHandoffReady = localRecordCount > 0 && agentBehaviorSignals.length > 0 && (managedApprovalRequests.length > 0 || approvals.length > 0)
  const contextHandoffManifest = {
    contract: 'supermega.ai_context_handoff.v1',
    version: 1,
    createdAt: new Date().toISOString(),
    evidenceVersion: 23,
    product: selectedProduct.name,
    productSlug: selectedProduct.slug,
    templateId: selectedTemplate.id,
    templateName: selectedTemplate.name,
    workspace: setup.workspace || 'Workspace not named',
    owner: setup.owner || 'Owner not assigned',
    sourceCounts: {
      localRecords: localRecordCount,
      behaviorSignals: agentBehaviorSignals.length,
      approvalPackets: managedApprovalRequests.length || approvals.length,
      accountableActions: actions.length,
    },
    productSourceMap: aiProductSourceMap,
    allowedUses: ['rank_next_actions', 'draft_internal_recommendations', 'prepare_import_mapping', 'summarize_workspace_evidence'],
    forbiddenActions: ['customer_message_send', 'payment_capture', 'domain_deploy', 'production_write', 'training_without_owner_approval'],
    activationRequired: !runtime.writesReady || !evidencePlanReady,
    nextAction: contextHandoffReady ? (runtime.writesReady && evidencePlanReady ? 'Ready for managed import review.' : 'Request managed activation with this context package.') : 'Collect records, behavior, and reviewed decisions before premium activation.',
  }
  const contextHandoffRows = [
    ['Package', `${localRecordCount} records / ${agentBehaviorSignals.length} signals`, contextHandoffReady ? 'Enough context exists for a support review.' : 'Use the product and review at least one decision first.'],
    ['Allowed use', 'Draft and rank only', 'AI may summarize, map imports, and recommend next actions after import.'],
    ['Forbidden', 'No send/write/train', 'Customer messages, payments, publishing, production writes, and model training stay blocked.'],
    ['Activation', contextHandoffManifest.activationRequired ? 'Required' : 'Ready', contextHandoffManifest.activationRequired ? 'Managed controls must pass before premium learns from customer data.' : 'Managed evidence gates are ready for import review.'],
    ['Owner action', contextHandoffReady ? 'Export context' : 'Collect proof', contextHandoffManifest.nextAction],
  ] as const
  const aiContextReadinessGates = [
    ['Records', localRecordCount > 0, localRecordCount ? `${localRecordCount} local records prepared.` : 'Use or import one product workspace first.'],
    ['Behavior', agentBehaviorSignals.length > 0, agentBehaviorSignals.length ? `${agentBehaviorSignals.length} agent queue signals captured.` : 'Open product queues and choose a recommended action.'],
    ['Decisions', managedApprovalRequests.length + approvals.length > 0, managedApprovalRequests.length || approvals.length ? `${managedApprovalRequests.length || approvals.length} human review packets ready.` : 'Record one approval or decline before premium learns from decisions.'],
    ['Controls', runtime.writesReady && evidencePlanReady, runtime.writesReady && evidencePlanReady ? 'Managed evidence gates are ready.' : 'Managed Postgres, identity, audit, and write gates remain locked.'],
    ['Products', aiProductSourceMap.products.some((product) => product.prepared), aiProductSourceMap.products.some((product) => product.prepared) ? 'At least one product has a usable source package.' : 'Create Shop, Plant, Website, or Ecommerce evidence.'],
    ['Owner setup', Boolean(setup.savedAt), setup.savedAt ? 'Trial plan is saved for handoff.' : 'Save the trial plan before requesting managed activation.'],
  ] as const
  const aiContextReadyGateCount = aiContextReadinessGates.filter(([, ready]) => ready).length
  const aiContextReadinessScore = Math.round((aiContextReadyGateCount / aiContextReadinessGates.length) * 100)
  const aiContextNextMove = !localRecordCount
    ? 'Create or import product records'
    : !agentBehaviorSignals.length
      ? 'Use agent queues'
      : !(managedApprovalRequests.length || approvals.length)
        ? 'Record owner decision'
        : !setup.savedAt
          ? 'Save trial plan'
          : !runtime.writesReady || !evidencePlanReady
            ? 'Request managed activation'
            : 'Export context for review'
  const aiContextReadinessScoreRows = [
    ['Score', `${aiContextReadinessScore}%`, `${aiContextReadyGateCount}/${aiContextReadinessGates.length} gates ready for premium context review.`],
    ['Next move', aiContextNextMove, 'Follow this before asking premium AI to learn from customer data.'],
    ['Records', localRecordCount ? `${localRecordCount} prepared` : 'Need records', aiContextReadinessGates[0][2]],
    ['Behavior', agentBehaviorSignals.length ? `${agentBehaviorSignals.length} signals` : 'Need usage', aiContextReadinessGates[1][2]],
    ['Controls', runtime.writesReady && evidencePlanReady ? 'Ready' : 'Locked', aiContextReadinessGates[3][2]],
  ] as const
  const provisioningReady = isPilotReady && localRecordCount > 0 && managedApprovalRequests.length + approvals.length > 0
  const managedWorkspaceProvisioningPacket = {
    contract: 'supermega.managed_workspace_provisioning.v1',
    version: 1,
    createdAt: new Date().toISOString(),
    evidenceVersion: 23,
    workspace: setup.workspace || 'Workspace not named',
    owner: setup.owner || 'Owner not assigned',
    product: selectedProduct.name,
    template: selectedTemplate.name,
    tenantMode: runtime.status === 'enterprise' ? 'managed_ready' : 'managed_required',
    dataPackage: {
      evidenceFilename,
      localRecords: localRecordCount,
      productSources: Object.keys(localProductRecords),
      approvalPackets: managedApprovalRequests.length || approvals.length,
      behaviorSignals: behaviorSignalCount,
    },
    requiredControls: ['dedicated_postgres_rls', 'trusted_identity_gateway', 'private_storage', 'audit_trail', 'owner_write_approvals', 'scheduler_budget_limits'],
    firstSafeActivation: provisioningReady ? 'Create managed tenant from exported evidence after activation gates pass.' : 'Finish trial evidence, local records, and owner-reviewed decisions before provisioning.',
    forbiddenUntilProvisioned: ['copy_browser_storage_to_production', 'enable_hosted_scheduler', 'send_customer_messages', 'capture_payments', 'publish_domains'],
  }
  const importProvisioningRows = runtime.importProvisioning?.checks.length
    ? runtime.importProvisioning.checks.map((check) => [check.label, check.ready ? 'Ready' : 'Blocked', check.action] as const)
    : [
      ['Managed identity', runtime.authReady ? 'Ready' : 'Blocked', 'Verify trusted gateway or Supabase named-user identity before import approval.'] as const,
      ['Private workspace schema', runtime.enterpriseDbReady ? 'Ready' : 'Blocked', 'Apply the private trial schema with a non-BYPASSRLS runtime role.'] as const,
      ['Zero-write validation', runtime.auditReady ? 'Ready' : 'Blocked', 'Run the managed import validation endpoint and prove external_writes_performed is false.'] as const,
      ['Owner approval', managedApprovalRequests.length || approvals.length ? 'Ready' : 'Blocked', 'Capture a named owner approval before any import apply request.'] as const,
      ['Atomic adapter', runtime.writesReady ? 'Ready' : 'Blocked', 'Confirm the product adapter can create one idempotent managed revision.'] as const,
      ['Durable revision', runtime.writesReady ? 'Ready' : 'Blocked', 'Read back workspace state after apply and compare the revision digest.'] as const,
    ]
  const importProvisioningPacket = {
    contract: runtime.importProvisioning?.contract ?? 'supermega.import_provisioning_readiness.v1',
    evidenceVersion: 23,
    status: runtime.importProvisioning?.status ?? 'blocked',
    ready: runtime.importProvisioning?.ready === true,
    checks: runtime.importProvisioning?.checks ?? [],
    forbiddenUntilReady: runtime.importProvisioning?.forbidden_until_ready ?? ['copy_browser_storage_to_production', 'customer_message_send', 'payment_capture', 'domain_publish', 'scheduler_autopilot'],
    nextAction: runtime.importProvisioning?.next_action ?? 'Validate a staged client import package inside a managed workspace before any activation write.',
    secretValuesExposed: false,
  }
  const provisioningRows = [
    ['Tenant', managedWorkspaceProvisioningPacket.tenantMode === 'managed_ready' ? 'Ready' : 'Required', runtime.requirements[0] ?? 'Managed controls must be verified before customer data import.'],
    ['Data package', `${localRecordCount} records`, localRecordCount ? 'Exported evidence can seed a reviewed managed workspace.' : 'Import or use a product workspace before provisioning.'],
    ['Roles', managedApprovalRequests.length + approvals.length ? `${managedApprovalRequests.length + approvals.length} reviewed` : 'Need owner review', 'Owner decisions define who can approve writes after activation.'],
    ['Controls', runtime.writesReady && evidencePlanReady ? 'Ready' : 'Locked', 'RLS, identity, storage privacy, audit, write approvals, and scheduler budgets are required.'],
    ['First safe step', provisioningReady ? 'Create tenant' : 'Finish proof', managedWorkspaceProvisioningPacket.firstSafeActivation],
  ] as const
  const activationManifestRows = [
    ['Next action', runtime.activationManifest?.next_action ?? runtime.requirements[0] ?? 'Checking managed activation.'],
    ['Blocked gates', runtime.activationManifest?.blocked_gate_ids.length ? runtime.activationManifest.blocked_gate_ids.join(', ') : 'No blocked gates'],
    ['Safe enables', runtime.activationManifest?.safe_enable.length ? runtime.activationManifest.safe_enable.join(', ') : 'Browser-local trial only'],
  ] as const
  const schedulerActivationRows = [
    ['Scheduler', schedulerActivation?.configured ? 'Ready' : schedulerActivation?.status ?? 'Blocked'],
    ['Evidence', schedulerActivation?.activationEvidenceCount ? `${schedulerActivation.activationEvidenceCount} signed proofs` : schedulerActivation?.activationEvidenceContract ?? 'Evidence contract unavailable'],
    ['Queue jobs', schedulerActivation?.queueJobTypes.length ? schedulerActivation.queueJobTypes.join(', ') : 'task_triage, ops_watch'],
    ['Daily jobs', schedulerActivation?.dailyJobTypes.length ? schedulerActivation.dailyJobTypes.join(', ') : 'founder_brief, github_release_watch'],
    ['Run limit', schedulerActivation ? `${schedulerActivation.maxJobsPerRun} jobs per invocation` : '2 jobs per invocation'],
    ['Next action', schedulerActivation?.nextAction ?? 'Restore cloud status before enabling scheduler autopilot.'],
  ] as const
  const managedTrialRequest = {
    contract: 'supermega.managed_trial_request.v1',
    version: 1,
    createdAt: new Date().toISOString(),
    product: selectedProduct.name,
    productSlug: selectedProduct.slug,
    templateId: selectedTemplate.id,
    templateName: selectedTemplate.name,
    workspace: setup.workspace || 'Workspace not named',
    owner: setup.owner || 'Owner not assigned',
    entryPoint: setup.entryPoint || selectedTemplate.entryPoints[0] || '',
    currentRecord: setup.currentRecord,
    targetOutcome: setup.targetOutcome,
    acceptanceEvidence: setup.acceptanceEvidence,
    evidenceFilename,
    evidenceVersion: 23,
    pilotReady: isPilotReady,
    localRecords: localRecordCount,
    approvalPackets: managedApprovalRequests.length || approvals.length,
    behaviorSignals: behaviorSignalCount,
    launchPackManifest,
    productSourceMap: aiProductSourceMap,
    contextHandoffManifest,
    managedWorkspaceProvisioningPacket,
    importProvisioningPacket,
    activationManifest: runtime.activationManifest,
    importProvisioning: runtime.importProvisioning,
    schedulerActivation,
    blockedGateIds: runtime.activationManifest?.blocked_gate_ids ?? [],
    safeEnable: runtime.activationManifest?.safe_enable ?? ['browser_local_trial', 'evidence_export'],
    nextHostedBlocker: runtime.activationManifest?.next_action ?? runtime.requirements[0] ?? 'Configure managed activation.',
    automationBoundary: runtime.activationManifest?.automation_boundary ?? 'Human approval is required before external sends, payments, publishing, imports, or managed writes.',
    noExternalSend: true,
  }
  const managedTrialRequestRows = [
    ['Workspace', managedTrialRequest.workspace],
    ['Product', `${managedTrialRequest.product} / ${managedTrialRequest.templateName}`],
    ['Evidence', `${managedTrialRequest.evidenceFilename} v${managedTrialRequest.evidenceVersion}`],
    ['Scheduler', schedulerActivation?.configured ? 'Ready for bounded autopilot' : schedulerActivation?.nextAction ?? 'Scheduler proof required'],
    ['Hosted blocker', managedTrialRequest.nextHostedBlocker],
    ['Safe enables', managedTrialRequest.safeEnable.join(', ')],
    ['Write boundary', 'No external send or managed write from this packet'],
  ] as const
  const activationRows: Array<readonly [string, string]> = [
    ['Trial', isPilotReady ? 'Ready' : `${completion}%`],
    ['Runtime', runtime.serviceStatus],
    ['Mode', runtime.operatingMode.replace('_', ' ')],
    ...(runtime.activationSteps.length
      ? runtime.activationSteps.map((step) => [step.label, step.ready ? 'Ready' : 'Needed'] as const)
      : [
        ['Database', runtime.enterpriseDbReady ? 'Ready' : 'Needed'] as const,
        ['Identity', runtime.authReady ? 'Ready' : 'Needed'] as const,
        ['Audit', runtime.auditReady ? 'Ready' : 'Needed'] as const,
        ['Writes', runtime.writesReady ? 'Ready' : 'Needed'] as const,
      ]),
    ['Coverage', `${runtime.coverageScore}%`],
  ]
  const selectedProductSource = aiProductSourceMap.products.find((product) => product.product === selectedProduct.name)
  const selectedProductRecordCount = Object.values(selectedProductSource?.records ?? {}).reduce((total, count) => total + count, 0)
  const aiMemorySourceRecordCount = Math.max(localRecordCount, selectedProductRecordCount)
  const aiMemoryReadinessGates = aiContextReadinessGates.map(([label, ready, detail]) => (
    label === 'Records'
      ? [label, aiMemorySourceRecordCount > 0, aiMemorySourceRecordCount ? `${aiMemorySourceRecordCount} ${selectedProduct.name} records prepared.` : detail] as const
      : [label, ready, detail] as const
  ))
  const aiMemoryReadyGateCount = aiMemoryReadinessGates.filter(([, ready]) => ready).length
  const aiMemoryReadinessScore = Math.round((aiMemoryReadyGateCount / aiMemoryReadinessGates.length) * 100)
  const aiMemoryNextMove = !aiMemorySourceRecordCount
    ? 'Create or import product records'
    : !agentBehaviorSignals.length
      ? 'Use agent queues'
      : !(managedApprovalRequests.length || approvals.length)
        ? 'Record owner decision'
        : !setup.savedAt
          ? 'Save trial plan'
          : !runtime.writesReady || !evidencePlanReady
            ? 'Request managed activation'
            : 'Export context for review'
  const aiMemoryFilename = `supermega-ai-memory-${selectedProduct.slug}-${evidenceDate}.json`
  const aiMemoryPreview = {
    contract: 'supermega.ai_memory_preview.v1',
    version: 1,
    createdAt: new Date().toISOString(),
    workspace: setup.workspace || 'Workspace not named',
    owner: setup.owner || 'Owner not assigned',
    product: selectedProduct.name,
    template: selectedTemplate.name,
    objective: {
      startingPoint: setup.entryPoint || selectedTemplate.entryPoints[0] || '',
      currentRecord: setup.currentRecord,
      baseline: setup.baseline,
      targetOutcome: setup.targetOutcome,
      acceptanceEvidence: setup.acceptanceEvidence,
      ownerGate: setup.authorityBoundary || launchPackManifest.ownerGate,
    },
    sourceSummary: {
      localProductRecords: localRecordCount,
      summarizedRecords: aiMemorySourceRecordCount,
      selectedProductPrepared: selectedProductSource?.prepared === true,
      selectedProductRecordCounts: selectedProductSource?.records ?? {},
      accountableActions: actions.length,
      behaviorSignals: agentBehaviorSignals.length,
      decisionPackets: managedApprovalRequests.length || approvals.length,
    },
    ownerBehavior: {
      topRecommendedJob: topAgentJob ? `${agentProductName(topAgentJob.product)}: ${topAgentJob.job}` : null,
      lastChosenJob: lastChosenAgentJob ? `${agentProductName(lastChosenAgentJob.product)}: ${lastChosenAgentJob.detail}` : null,
    },
    readiness: {
      score: aiMemoryReadinessScore,
      readyGates: aiMemoryReadyGateCount,
      totalGates: aiMemoryReadinessGates.length,
      nextMove: aiMemoryNextMove,
    },
    allowedUses: contextHandoffManifest.allowedUses,
    forbiddenActions: contextHandoffManifest.forbiddenActions,
    privacyBoundary: {
      summaryOnly: true,
      rawProductRecordsIncluded: false,
      externalSendPerformed: false,
      managedWritePerformed: false,
      modelTrainingAllowed: false,
    },
    managedNextAction: contextHandoffManifest.nextAction,
  }
  const aiMemoryRows = [
    ['Sources', aiMemorySourceRecordCount ? `${aiMemorySourceRecordCount} prepared` : 'Start using a product', aiMemorySourceRecordCount ? `${selectedProduct.name} and shared local evidence are summarized without raw records.` : 'Create or import product evidence to teach the operator.'],
    ['Behavior', agentBehaviorSignals.length ? `${agentBehaviorSignals.length} signals` : 'No pattern yet', topAgentJob ? `${agentProductName(topAgentJob.product)}: ${topAgentJob.job}` : 'Choose a recommended product action to start owner preference memory.'],
    ['Decisions', managedApprovalRequests.length || approvals.length ? `${managedApprovalRequests.length || approvals.length} reviewed` : 'Needs one review', 'Only accountable owner decisions can become reusable premium context.'],
    ['Readiness', `${aiMemoryReadinessScore}%`, aiMemoryNextMove],
  ] as const
  const aiMemoryHref = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(aiMemoryPreview, null, 2))}`
  const evidenceHref = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ contract: 'supermega_trial_evidence', version: 23, exportedAt: new Date().toISOString(), environment: 'isolated_demo', pilotReady: isPilotReady, setup, workflowProfile: selectedTemplate, launchPackManifest, commerce, production, accountableActions: actions, approvals, managedApprovalRequests, teams: teamWorkspace, localProductRecords, behaviorTrail, agentBehaviorRows, activationRows, activationSteps: runtime.activationSteps, activationEvidencePlan: runtime.evidencePlan, activationManifest: runtime.activationManifest, activationManifestRows, importProvisioning: runtime.importProvisioning, importProvisioningPacket, importProvisioningRows, schedulerActivation, schedulerActivationRows, managedTrialRequest, managedTrialRequestRows, learningRows, learningPlanRows, agentPlanRows, aiContextQualityRows, aiProductSourceRows, aiProductSourceMap, contextHandoffManifest, contextHandoffRows, aiContextReadinessScore, aiContextReadyGateCount, aiContextReadinessGates, aiContextReadinessScoreRows, managedWorkspaceProvisioningPacket, provisioningRows }, null, 2))}`
  const managedTrialRequestHref = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(managedTrialRequest, null, 2))}`
  const ecommerceOrderQueueReadinessFilename = ecommerceOrderQueueReadinessPacket
    ? `supermega-ecommerce-order-queue-${safePacketFilename(ecommerceOrderQueueReadinessPacket.storeName)}.json`
    : 'supermega-ecommerce-order-queue.json'
  const ecommerceOrderQueueManagedValidation = ecommerceOrderQueueReadinessPacket && managedIdentity
    ? ecommerceOrderQueueServerValidation ?? buildManagedEcommerceOrderQueueValidation(ecommerceOrderQueueReadinessPacket, managedIdentity)
    : null
  const ecommerceOrderQueueManagedRows: Array<readonly [string, string, string]> = ecommerceOrderQueueReadinessPacket
    ? [
        ['Workspace', managedIdentity?.workspaceId ?? 'Connect workspace', managedIdentity ? 'Identity selected for zero-write check.' : 'Premium check waits for managed sign-in.'],
        ['Rows', `${ecommerceOrderQueueReadinessPacket.sourceReview.readyRows}/${ecommerceOrderQueueReadinessPacket.sourceReview.totalRows} ready`, `${ecommerceOrderQueueReadinessPacket.sourceReview.blockedRows} blocked rows.`],
        ['Managed check', ecommerceOrderQueueServerBusy ? 'Checking' : ecommerceOrderQueueManagedValidation?.status ?? 'Waiting', ecommerceOrderQueueServerValidation ? 'Server validation passed with zero records written.' : ecommerceOrderQueueManagedValidation ? 'Local receipt ready; run managed check before owner approval.' : 'No managed request or write has run.'],
        ['Boundary', ecommerceOrderQueueManagedValidation?.external_writes_performed === false ? 'Zero write' : 'Locked', 'Order import, customer send, payment, delivery, stock, and Shop writes remain blocked.'],
      ]
    : [
        ['Workspace', managedIdentity?.workspaceId ?? 'Connect workspace', 'Validate an order packet first.'],
        ['Managed check', 'Waiting', 'No managed request or write has run.'],
      ]
  const ecommerceOrderQueueApprovalPacket = ecommerceOrderQueueReadinessPacket && ecommerceOrderQueueServerValidation
    ? {
        contract: 'supermega.ecommerce.order_queue_owner_approval.v1',
        version: 1,
        createdAt: new Date().toISOString(),
        product: 'ecommerce',
        workspaceId: ecommerceOrderQueueServerValidation.workspace_id,
        storeName: ecommerceOrderQueueReadinessPacket.storeName,
        queuePacketSchema: ecommerceOrderQueueReadinessPacket.schema,
        validationContract: ecommerceOrderQueueServerValidation.contract,
        validationStatus: ecommerceOrderQueueServerValidation.status,
        targetSurface: ecommerceOrderQueueServerValidation.target_surface,
        requiredCapability: ecommerceOrderQueueServerValidation.required_capability,
        rowCount: ecommerceOrderQueueServerValidation.row_count,
        readyRows: ecommerceOrderQueueServerValidation.ready_rows,
        blockedRows: ecommerceOrderQueueServerValidation.blocked_rows,
        selectedSkus: ecommerceOrderQueueReadinessPacket.sourceReview.selectedSkus,
        sourceEvidence: {
          sourceReviewGeneratedAt: ecommerceOrderQueueReadinessPacket.sourceReview.generatedAt,
          sourceCatalog: ecommerceOrderQueueReadinessPacket.sourceReview.catalogSource,
          sourceMessagesRetained: true,
        },
        ownerDecision: 'Approve one managed Shop queue import after reviewing source messages, catalog match, and zero-write receipt.',
        ownerApprovalRequired: true,
        forbiddenUntilApproved: ecommerceOrderQueueServerValidation.forbidden_until_applied,
        externalWritesPerformed: false,
        nextAction: ecommerceOrderQueueServerValidation.status === 'ready_for_owner_review'
          ? 'Owner reviews this packet, then support records a named approval before one idempotent Shop queue import.'
          : 'Repair the order queue packet before requesting owner approval.',
      }
    : null
  const ecommerceOrderQueueApprovalFilename = ecommerceOrderQueueApprovalPacket
    ? `supermega-ecommerce-order-approval-${safePacketFilename(ecommerceOrderQueueApprovalPacket.storeName)}.json`
    : 'supermega-ecommerce-order-approval.json'
  const ecommerceOrderQueueApprovalHref = ecommerceOrderQueueApprovalPacket
    ? `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(ecommerceOrderQueueApprovalPacket, null, 2))}`
    : ''
  const ecommerceOrderQueueApprovalRows: Array<readonly [string, string, string]> = ecommerceOrderQueueApprovalPacket
    ? [
        ['Approval packet', ecommerceOrderQueueApprovalPacket.validationStatus, 'Backend receipt is packaged for named owner review.'],
        ['Rows', `${ecommerceOrderQueueApprovalPacket.readyRows}/${ecommerceOrderQueueApprovalPacket.rowCount} ready`, `${ecommerceOrderQueueApprovalPacket.blockedRows} blocked rows before approval.`],
        ['Capability', ecommerceOrderQueueApprovalPacket.requiredCapability, 'Approval may unlock only one managed Shop queue import.'],
        ['Boundary', ecommerceOrderQueueApprovalPacket.externalWritesPerformed ? 'Unsafe' : 'Zero write', 'The packet itself sends nothing and writes nothing.'],
      ]
    : [
        ['Approval packet', 'Waiting', 'Run managed queue check before preparing owner approval.'],
        ['Boundary', 'Locked', 'No import or approval record has been created.'],
      ]
  const ecommerceOrderQueueImportPlanRows: Array<readonly [string, string, string]> = ecommerceOrderQueueImportPlan
    ? [
        ['Import plan', ecommerceOrderQueueImportPlan.status, 'Backend returned an idempotent Shop queue plan.'],
        ['Rows', `${ecommerceOrderQueueImportPlan.ready_rows}/${ecommerceOrderQueueImportPlan.row_count} ready`, `${ecommerceOrderQueueImportPlan.blocked_rows} blocked rows before apply.`],
        ['Adapter', ecommerceOrderQueueImportPlan.target_adapter, ecommerceOrderQueueImportPlan.required_capability],
        ['Idempotency', ecommerceOrderQueueImportPlan.idempotency_key, 'Retry-safe key for the future managed apply command.'],
        ['Boundary', ecommerceOrderQueueImportPlan.external_writes_performed ? 'Unsafe' : 'Zero write', 'Plan only; no Shop queue import or customer action ran.'],
      ]
    : [
        ['Import plan', 'Waiting', 'Prepare after managed queue check and owner approval packet.'],
        ['Boundary', 'Locked', 'No Shop queue import command has been created.'],
      ]
  const approvedEcommerceQueueApproval = ecommerceOrderQueueImportPlan
    ? approvals.find((approval) => approval.managed
      && approval.status === 'approved'
      && approval.decidedActorKind === 'human'
      && approval.packet.subject.kind === 'ecommerce_order_queue'
      && approval.packet.subject.id === ecommerceOrderQueueImportPlan.store_name)
    : undefined
  const ecommerceOrderQueueApplyPreflightRows: Array<readonly [string, string, string]> = ecommerceOrderQueueApplyPreflight
    ? [
        ['Apply preflight', ecommerceOrderQueueApplyPreflight.status, 'Approved owner decision is bound to this plan.'],
        ['Approval', ecommerceOrderQueueApplyPreflight.approval_id, `${ecommerceOrderQueueApplyPreflight.approved_by} at ${formatTime(ecommerceOrderQueueApplyPreflight.approved_at)}`],
        ['Idempotency', ecommerceOrderQueueApplyPreflight.idempotency_key, 'Future apply must use this retry-safe key.'],
        ['Boundary', ecommerceOrderQueueApplyPreflight.external_writes_performed ? 'Unsafe' : 'Zero write', 'Preflight only; no Shop queue import ran.'],
      ]
    : [
        ['Apply preflight', approvedEcommerceQueueApproval ? 'Ready to check' : 'Waiting', approvedEcommerceQueueApproval ? 'Run preflight before any managed apply command.' : 'Approve the managed owner decision before apply preflight.'],
        ['Boundary', 'Locked', 'No Shop queue import apply command has been created.'],
      ]

  useEffect(() => {
    if (!requestedProduct || requestedProduct === setup.product) return
    const template = templateFor(requestedProduct, '')
    const selectionTimer = window.setTimeout(() => {
      setSetup((current) => ({
        ...current,
        product: requestedProduct,
        templateId: template.id,
        entryPoint: template.entryPoints.includes(current.entryPoint) ? current.entryPoint : template.entryPoints[0] ?? '',
        startedAt: undefined,
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

  function changeProduct(product: SetupProductId) {
    const template = templateFor(product, '')
    navigate(clientSetupPath(product), { replace: true })
    setSetup((current) => ({
      ...current,
      product,
      templateId: template.id,
      entryPoint: template.entryPoints.includes(current.entryPoint) ? current.entryPoint : template.entryPoints[0] ?? '',
      startedAt: undefined,
      savedAt: undefined,
    }))
    setNotice(`Selected ${productDisplayName(product)}. Your client details were kept.`)
  }

  function changeTemplate(templateId: string) {
    const template = templateFor(setup.product, templateId)
    updateSetup({ templateId: template.id, entryPoint: template.entryPoints.includes(setup.entryPoint) ? setup.entryPoint : template.entryPoints[0] ?? '', startedAt: undefined })
  }

  function startGuidedTrial() {
    if (!workflowReady) {
      setNotice('Name the trial workspace and responsible owner first.')
      chooseSettingsStep('workflow')
      return
    }
    const startedAt = new Date().toISOString()
    setSetup((current) => ({ ...current, startedAt }))
    navigate(setupProductPreviewPath(setup.product))
  }

  function save(event: FormEvent) {
    event.preventDefault()
    if (!workflowReady) {
      setNotice('Complete the workflow name and responsible owner first.')
      chooseSettingsStep('workflow')
      return
    }
    const savedAt = new Date().toISOString()
    setSetup((current) => ({ ...current, startedAt: current.startedAt || savedAt, savedAt }))
    setNotice('Trial plan saved locally. No external action was connected.')
  }

  function reviewEcommerceActivationPacket() {
    try {
      const packet = validateEcommerceManagedStoreActivationPacket(JSON.parse(ecommerceActivationPacketText))
      setEcommerceActivationPacketReview([
        ['Status', 'Valid packet'],
        ['Schema', packet.schema],
        ['Store', packet.storeName],
        ['Source', `${packet.source.catalogSource} / ${packet.source.selectedSkus.length} SKUs`],
        ['Queue', `${packet.orderQueue.pendingShopReviews} Shop review`],
        ['Boundary', packet.forbiddenActions.includes('managed_activation') ? 'Managed activation blocked' : 'Unsafe'],
      ])
      setNotice('Ecommerce activation packet reviewed locally. No import, managed activation, Shop write, payment, delivery, stock, or customer action ran.')
    } catch (error) {
      setEcommerceActivationPacketReview([
        ['Status', 'Rejected'],
        ['Reason', error instanceof Error ? error.message : 'Invalid packet'],
        ['Boundary', 'No import'],
      ])
      setNotice('Ecommerce activation packet rejected locally. No managed action ran.')
    }
  }

  function loadSampleEcommerceActivationPacket() {
    const packet = buildEcommerceManagedStoreActivationPacket({
      generatedAt: new Date().toISOString(),
      product: 'ecommerce',
      storeName: 'Sample Ecommerce Store',
      stage: 'Support review sample',
      operatingMode: 'browser_local_trial',
      source: {
        catalogSource: 'sample',
        catalogItems: 2,
        selectedSkus: ['DEMO-SKU-01', 'DEMO-SKU-02'],
        previewDigest: null,
        managedCatalogDigest: null,
        savedRevision: null,
        savedAt: null,
      },
      readiness: {
        Catalog: 'Sample catalog ready',
        Storefront: 'Sample fingerprint',
        Checkout: 'Quote review only',
        Payments: 'Manual review only',
        Delivery: 'Template review only',
        'Shop gate': 'No live queue',
        Activation: 'Free local only',
      },
      orderQueue: {
        pendingShopReviews: 0,
        stockRisk: 0,
        expiringQuotes: 0,
        manualPaymentReview: 0,
        deliveryReview: 0,
        pickupReview: 0,
      },
    })
    setEcommerceActivationPacketText(`${JSON.stringify(packet, null, 2)}\n`)
    setEcommerceActivationPacketReview([
      ['Status', 'Sample loaded'],
      ['Store', packet.storeName],
      ['Boundary', 'Review only'],
    ])
    setNotice('Sample Ecommerce activation packet loaded locally. Review it to test the handoff gate.')
  }

  function clearEcommerceActivationPacketReview() {
    setEcommerceActivationPacketText('')
    setEcommerceActivationPacketReview([
      ['Status', 'Waiting for packet'],
      ['Boundary', 'Review only'],
    ])
    setNotice('Ecommerce activation packet review cleared locally.')
  }

  function downloadJsonPacket(packet: unknown, filename: string) {
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(packet, null, 2)}\n`], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.hidden = true
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  function reviewEcommerceOrderReviewPacket() {
    try {
      const packet = validateEcommerceOrderImportReviewPacket(JSON.parse(ecommerceOrderReviewPacketText))
      const queueReadinessPacket = buildEcommerceOrderQueueReadinessPacket({
        generatedAt: new Date().toISOString(),
        reviewPacket: packet,
      })
      setEcommerceOrderQueueReadinessPacket(queueReadinessPacket)
      setEcommerceOrderQueueServerValidation(null)
      setEcommerceOrderQueueImportPlan(null)
      setEcommerceOrderQueueApplyPreflight(null)
      setEcommerceOrderReviewPacketReview([
        ['Status', packet.review.status === 'ready' ? 'Ready packet' : 'Blocked packet'],
        ['Schema', packet.schema],
        ['Store', packet.storeName],
        ['Rows', `${packet.review.readyRows} ready / ${packet.review.blockedRows} blocked`],
        ['Catalog', `${packet.catalog.source} / ${packet.catalog.selectedSkus.length} SKUs`],
        ['Queue handoff', queueReadinessPacket.readiness.status === 'ready_for_support' ? 'Ready to package' : 'Repair first'],
        ['Boundary', packet.forbiddenActions.includes('order_import') && packet.forbiddenActions.includes('managed_activation') ? 'Import and activation blocked' : 'Unsafe'],
      ])
      setNotice('Ecommerce order review packet checked locally. No order import, customer message, payment, delivery, stock, Shop write, or managed activation ran.')
    } catch (error) {
      setEcommerceOrderQueueReadinessPacket(null)
      setEcommerceOrderQueueServerValidation(null)
      setEcommerceOrderQueueImportPlan(null)
      setEcommerceOrderQueueApplyPreflight(null)
      setEcommerceOrderReviewPacketReview([
        ['Status', 'Rejected'],
        ['Reason', error instanceof Error ? error.message : 'Invalid order review packet'],
        ['Boundary', 'No import'],
      ])
      setNotice('Ecommerce order review packet rejected locally. No order or managed action ran.')
    }
  }

  function loadSampleEcommerceOrderReviewPacket() {
    const packet = buildEcommerceOrderImportReviewPacket({
      generatedAt: new Date().toISOString(),
      product: 'ecommerce',
      storeName: 'Sample Ecommerce Store',
      operatingMode: 'browser_local_trial',
      catalog: {
        source: 'sample',
        items: 2,
        selectedSkus: ['DEMO-SKU-01', 'DEMO-SKU-02'],
      },
      review: {
        status: 'ready',
        totalRows: 2,
        readyRows: 2,
        blockedRows: 0,
        summary: '2 rows ready for owner review.',
      },
      sourceCsv: 'customer_reference,channel,sku,quantity,fulfilment,payment,source_message\nDaw Mya - Yangon,viber,DEMO-SKU-01,1,delivery,manual_review,Viber screenshot retained\nKo Min - pickup,line,DEMO-SKU-02,2,pickup,cash_on_pickup,LINE order retained\n',
    })
    setEcommerceOrderReviewPacketText(`${JSON.stringify(packet, null, 2)}\n`)
    setEcommerceOrderReviewPacketReview([
      ['Status', 'Sample loaded'],
      ['Store', packet.storeName],
      ['Rows', `${packet.review.readyRows} ready / ${packet.review.blockedRows} blocked`],
      ['Boundary', 'Review only'],
    ])
    setEcommerceOrderQueueReadinessPacket(null)
    setEcommerceOrderQueueServerValidation(null)
    setEcommerceOrderQueueImportPlan(null)
    setEcommerceOrderQueueApplyPreflight(null)
    setNotice('Sample Ecommerce order review packet loaded locally. Review it to test the order handoff gate.')
  }

  function clearEcommerceOrderReviewPacketReview() {
    setEcommerceOrderReviewPacketText('')
    setEcommerceOrderQueueReadinessPacket(null)
    setEcommerceOrderQueueServerValidation(null)
    setEcommerceOrderQueueImportPlan(null)
    setEcommerceOrderQueueApplyPreflight(null)
    setEcommerceOrderReviewPacketReview([
      ['Status', 'Waiting for packet'],
      ['Boundary', 'Review only'],
    ])
    setNotice('Ecommerce order review packet cleared locally.')
  }

  function downloadEcommerceOrderQueueReadinessPacket() {
    if (!ecommerceOrderQueueReadinessPacket) return
    downloadJsonPacket(ecommerceOrderQueueReadinessPacket, ecommerceOrderQueueReadinessFilename)
    setNotice('Ecommerce order queue readiness packet downloaded. No order import, customer message, payment, delivery, stock, Shop write, or managed activation ran.')
  }

  async function runManagedEcommerceOrderQueueCheck() {
    if (!managedIdentity || !ecommerceOrderQueueReadinessPacket) {
      setNotice('Connect a managed workspace and validate an order packet first.')
      return
    }
    setEcommerceOrderQueueServerBusy(true)
    try {
      const validation = await validateManagedEcommerceOrderQueue(ecommerceOrderQueueReadinessPacket, managedIdentity)
      setEcommerceOrderQueueServerValidation(validation)
      setEcommerceOrderQueueImportPlan(null)
      setEcommerceOrderQueueApplyPreflight(null)
      setNotice('Managed Ecommerce order queue check passed with zero records written. Owner approval is still required before any Shop queue import.')
    } catch (error) {
      setEcommerceOrderQueueServerValidation(null)
      setEcommerceOrderQueueImportPlan(null)
      setEcommerceOrderQueueApplyPreflight(null)
      setNotice(error instanceof Error ? error.message : 'Managed Ecommerce order queue check failed. No write ran.')
    } finally {
      setEcommerceOrderQueueServerBusy(false)
    }
  }

  async function requestManagedEcommerceOrderQueueApproval() {
    if (!managedIdentity || !ecommerceOrderQueueApprovalPacket || !ecommerceOrderQueueServerValidation) {
      setNotice('Run the managed queue check before requesting owner approval.')
      return
    }
    setEcommerceOrderQueueApprovalBusy(true)
    try {
      const createdAt = new Date().toISOString()
      const packet = {
        contract: 'decision_packet.v1' as const,
        subject: { kind: 'ecommerce_order_queue', id: ecommerceOrderQueueApprovalPacket.storeName, version: 1 as const },
        decision: ecommerceOrderQueueApprovalPacket.ownerDecision,
        claims: [
          {
            id: 'queue-validation-zero-write',
            claimType: 'fact' as const,
            statement: `Backend validation ${ecommerceOrderQueueApprovalPacket.validationContract} returned ${ecommerceOrderQueueApprovalPacket.validationStatus} with zero external writes.`,
            sourceReference: ecommerceOrderQueueApprovalFilename,
            capturedAt: createdAt,
            status: 'verified' as const,
            uncertainty: 'low' as const,
            visibility: 'private' as const,
            digest: settingsFingerprint(ecommerceOrderQueueServerValidation),
          },
          {
            id: 'queue-row-counts',
            claimType: 'fact' as const,
            statement: `${ecommerceOrderQueueApprovalPacket.readyRows} of ${ecommerceOrderQueueApprovalPacket.rowCount} Ecommerce order rows are ready; ${ecommerceOrderQueueApprovalPacket.blockedRows} remain blocked.`,
            sourceReference: ecommerceOrderQueueApprovalFilename,
            capturedAt: createdAt,
            status: 'verified' as const,
            uncertainty: 'low' as const,
            visibility: 'private' as const,
          },
          {
            id: 'queue-write-boundary',
            claimType: 'analysis' as const,
            statement: `Approval may unlock only ${ecommerceOrderQueueApprovalPacket.requiredCapability}; ${ecommerceOrderQueueApprovalPacket.forbiddenUntilApproved.join(', ')} remain forbidden until a named owner decision exists.`,
            sourceReference: ecommerceOrderQueueApprovalFilename,
            capturedAt: createdAt,
            status: 'observed' as const,
            uncertainty: 'low' as const,
            visibility: 'private' as const,
          },
        ],
        baseline: 'Order queue import is blocked after zero-write validation.',
        target: 'Named owner approves exactly one managed Shop queue import.',
        result: `${ecommerceOrderQueueApprovalPacket.readyRows}/${ecommerceOrderQueueApprovalPacket.rowCount} rows ready for owner review.`,
        acceptance: 'Support records owner approval before any idempotent managed Shop queue import runs.',
        artifactReference: ecommerceOrderQueueApprovalFilename,
      }
      const approval = {
        id: `APR-${settingsCommandUuid()}`.toUpperCase(),
        commandId: settingsCommandUuid(),
        createdAt,
        title: `Approve Ecommerce queue import for ${ecommerceOrderQueueApprovalPacket.storeName}`,
        requestedBy: managedIdentity.email,
        requestedActorKind: 'human' as const,
        packet,
        packetFingerprint: settingsFingerprint(packet),
        status: 'pending' as const,
      }
      const request = toManagedApprovalRequest(approval)
      if (!request) throw new Error('The owner approval request packet is incomplete.')
      const managedRecord = await createManagedApproval(request)
      setApprovals((current) => mergeManagedApprovals(current, [managedRecord]))
      setNotice('Managed owner approval request recorded. No Shop queue import, customer message, payment, delivery, stock move, or activation ran.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Managed owner approval request failed. No Shop import ran.')
    } finally {
      setEcommerceOrderQueueApprovalBusy(false)
    }
  }

  async function prepareManagedEcommerceOrderQueueImportPlan() {
    if (!managedIdentity || !ecommerceOrderQueueReadinessPacket || !ecommerceOrderQueueApprovalPacket) {
      setNotice('Run the managed queue check and prepare owner approval before building an import plan.')
      return
    }
    setEcommerceOrderQueueImportPlanBusy(true)
    try {
      const plan = await planManagedEcommerceOrderQueueImport({
        identity: managedIdentity,
        packet: ecommerceOrderQueueReadinessPacket,
        approvalPacket: ecommerceOrderQueueApprovalPacket,
      })
      setEcommerceOrderQueueImportPlan(plan)
      setEcommerceOrderQueueApplyPreflight(null)
      setNotice('Managed Shop queue import plan prepared with zero external writes. Apply still requires a decided human approval record and managed write gates.')
    } catch (error) {
      setEcommerceOrderQueueImportPlan(null)
      setEcommerceOrderQueueApplyPreflight(null)
      setNotice(error instanceof Error ? error.message : 'Managed Shop queue import plan failed. No Shop import ran.')
    } finally {
      setEcommerceOrderQueueImportPlanBusy(false)
    }
  }

  async function runManagedEcommerceOrderQueueApplyPreflight() {
    if (!managedIdentity || !ecommerceOrderQueueImportPlan || !approvedEcommerceQueueApproval?.decidedBy || !approvedEcommerceQueueApproval.decidedAt) {
      setNotice('Approve the managed owner decision and prepare the import plan before apply preflight.')
      return
    }
    setEcommerceOrderQueueApplyPreflightBusy(true)
    try {
      const preflight = await preflightManagedEcommerceOrderQueueApply({
        identity: managedIdentity,
        plan: ecommerceOrderQueueImportPlan,
        approval: {
          approval_id: approvedEcommerceQueueApproval.id,
          decided_by: approvedEcommerceQueueApproval.decidedBy,
          decided_at: approvedEcommerceQueueApproval.decidedAt,
        },
      })
      setEcommerceOrderQueueApplyPreflight(preflight)
      setNotice('Managed Ecommerce apply preflight passed with zero external writes. The future Shop queue apply must use the approved digest and idempotency key.')
    } catch (error) {
      setEcommerceOrderQueueApplyPreflight(null)
      setNotice(error instanceof Error ? error.message : 'Managed Ecommerce apply preflight failed. No Shop import ran.')
    } finally {
      setEcommerceOrderQueueApplyPreflightBusy(false)
    }
  }

  async function resetDemoWorkspace() {
    setResetBusy(true)
    try {
      const { resetCommerceOrderDraftRecovery } = await import('./commerce-order-draft')
      await resetCommerceOrderDraftRecovery()
      const retainedKeys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
        .filter((key): key is string => Boolean(key?.startsWith(STOREFRONT_DRAFT_RESET_PREFIX)
          || key?.startsWith(LEGACY_STOREFRONT_DRAFT_RESET_PREFIX)
          || key?.startsWith(SHOP_ORDER_DRAFT_RESET_PREFIX)))
      ;[
        COMMERCE_KEY,
        PRODUCTION_KEY,
        APPROVAL_KEY,
        SETUP_KEY,
        ACTION_KEY,
        BEHAVIOR_TRAIL_KEY,
        SHOP_ORDER_DRAFT_RESET_EPOCH_KEY,
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
    setManagedNotice('Checking workspace membership...')
    try {
      const identity = await signInManagedTrial(managedEmail, managedPassword, managedWorkspace)
      setManagedIdentity(identity)
      setEcommerceOrderQueueServerValidation(null)
      setEcommerceOrderQueueImportPlan(null)
      setEcommerceOrderQueueApplyPreflight(null)
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
    setEcommerceOrderQueueServerValidation(null)
    setEcommerceOrderQueueImportPlan(null)
    setEcommerceOrderQueueApplyPreflight(null)
    setEcommerceOrderQueueApprovalBusy(false)
    setEcommerceOrderQueueImportPlanBusy(false)
    setEcommerceOrderQueueApplyPreflightBusy(false)
    setApprovals((current) => current.filter((approval) => !approval.managed))
    setManagedNotice('Managed account disconnected.')
    setManagedBusy(false)
  }

  return (
    <div className="workspace-screen settings-screen">
      <PageHeading eyebrow="Guided trial" title="Start with one workflow" copy="Pick template, owner, sample." />
      <nav aria-label="Setup steps" className="settings-step-nav">
        <button aria-current={settingsStep === 'workflow' ? 'step' : undefined} onClick={() => chooseSettingsStep('workflow')} type="button"><span>1</span>Template</button>
        <button aria-current={settingsStep === 'success' ? 'step' : undefined} onClick={() => chooseSettingsStep('success')} type="button"><span>2</span>Trial plan</button>
      </nav>
      <div className="settings-grid settings-step-content">
        <form className="core-panel setup-form" onSubmit={save}>
          <div className="panel-head"><div><span className="core-eyebrow">One product</span><h2>{settingsStep === 'workflow' ? 'Choose the trial' : 'Define success'}</h2></div><span className={`status-pill ${displayedReady ? 'approved' : 'bounded'}`}>{displayedReady ? 'ready' : `${displayedCompletion}%`}</span></div>
          <div className="pilot-progress"><div className="progress-track"><i style={{ width: `${displayedCompletion}%` }} /></div><small>{settingsStep === 'workflow' ? 'Template - owner' : 'Record - target - evidence'}</small></div>
          <fieldset className="settings-step-fields" disabled={settingsStep !== 'workflow'} hidden={settingsStep !== 'workflow'}>
          {requestedProduct ? <div className="setup-selected-product"><span><small>Selected product</small><strong>{selectedProduct.name}</strong></span><Link className="text-link" to="/">Change product</Link></div> : <div aria-label="Choose solution" className="setup-product-grid" role="group">{Object.values(productContracts).map((product) => <button aria-pressed={setup.product === product.id} key={product.id} onClick={() => changeProduct(product.id)} type="button"><span><strong>{product.name}</strong><small>{product.headline}</small></span><b>{product.templates.length} templates</b></button>)}</div>}
          <section aria-label="Selected launch pack checklist" className="setup-launch-pack">
            <div><span className="core-eyebrow">Launch pack checklist</span><strong>{selectedProduct.name} setup</strong><small>Bring the starting data. AI prepares the packet. Owner keeps the gate.</small></div>
            <div className="setup-launch-pack-rows">{launchPackRows.map(([label, value, detail]) => <span key={label}><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>)}</div>
          </section>
          <div className="form-row"><label>Starting template<select value={setup.templateId} onChange={(event) => changeTemplate(event.target.value)}>{templatesFor(setup.product).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label><label>Starting point<select value={setup.entryPoint} onChange={(event) => updateSetup({ entryPoint: event.target.value })}>{selectedTemplate.entryPoints.map((entryPoint) => <option key={entryPoint}>{entryPoint}</option>)}</select></label></div>
          <div className="setup-template-summary"><div><span>Outcome</span><strong>{selectedTemplate.outcome}</strong></div><ol aria-label={`${selectedTemplate.name} workflow`}>{selectedTemplate.workflow.map((step) => <li key={step}>{step}</li>)}</ol><small>Measure success with {selectedTemplate.metric.toLowerCase()}.</small></div>
          <div className="form-row"><label>Workspace name<input maxLength={80} required value={setup.workspace} onChange={(event) => updateSetup({ workspace: event.target.value })} placeholder={setup.product === 'commerce' ? 'Example: Social sales team' : setup.product === 'production' ? 'Example: Main plant' : setup.product === 'website' ? 'Example: Company website' : 'Example: Online order desk'} /></label><label>Responsible owner<input maxLength={80} required value={setup.owner} onChange={(event) => updateSetup({ owner: event.target.value })} placeholder="Name or role" /></label></div>
          <Suspense fallback={<p className="form-notice" role="status">Loading the client data template...</p>}><ClientDataOnboarding managedIdentity={managedIdentity} owner={setup.owner} product={setup.product} productName={selectedProduct.name} productSlug={selectedProduct.slug} workflowTemplateId={selectedTemplate.id} workspace={setup.workspace} /></Suspense>
          <div className="settings-step-actions"><span>Sample first. Plan when needed.</span><div className="setup-action-group"><button className="text-link" disabled={!workflowReady} onClick={() => chooseSettingsStep('success')} type="button">Add trial plan</button><button className="core-button primary" disabled={!workflowReady} onClick={startGuidedTrial} type="button">Start guided sample</button></div></div>
          </fieldset>
          <fieldset className="settings-step-fields" disabled={settingsStep !== 'success'} hidden={settingsStep !== 'success'}>
          <div className="template-contract settings-workflow-summary"><span>{productDisplayName(setup.product)}</span><strong>{setup.workspace || 'Unnamed workspace'}</strong><small>{selectedTemplate.name} - {setup.owner || 'Owner needed'}</small></div>
          <label>Current record<input maxLength={180} required value={setup.currentRecord} onChange={(event) => updateSetup({ currentRecord: event.target.value })} placeholder="Chat, paper, sheet, system, or log." /></label>
          <div className="form-row pilot-text-row"><label>Baseline<textarea maxLength={240} required value={setup.baseline} onChange={(event) => updateSetup({ baseline: event.target.value })} placeholder="Current time, error rate, backlog, output." /></label><label>Target outcome<textarea maxLength={240} required value={setup.targetOutcome} onChange={(event) => updateSetup({ targetOutcome: event.target.value })} placeholder={`Target for ${selectedTemplate.metric.toLowerCase()}.`} /></label></div>
          <div className="form-row pilot-text-row"><label>Human authority boundary<textarea maxLength={240} required value={setup.authorityBoundary} onChange={(event) => updateSetup({ authorityBoundary: event.target.value })} placeholder="Which actions need owner approval?" /></label><label>Acceptance evidence<textarea maxLength={240} required value={setup.acceptanceEvidence} onChange={(event) => updateSetup({ acceptanceEvidence: event.target.value })} placeholder="What proves the pilot works?" /></label></div>
          <div className="settings-step-actions"><button className="text-link" onClick={() => chooseSettingsStep('workflow')} type="button">Back</button><button className="core-button primary" type="submit">Save client setup</button></div>
          {setup.savedAt ? <>
            <div className="setup-complete"><div><strong>Trial plan saved.</strong><small>Your AI memory preview is ready.</small></div><div className="setup-complete-actions"><Link className="core-button" to={setupProductPreviewPath(setup.product)}>Open {productDisplayName(setup.product)}</Link><a className="core-button" download={aiMemoryFilename} href={aiMemoryHref}>Download AI memory</a><a className="core-button primary" href={managedTrialRequestUrl(setup.product, selectedTemplate.id)}>Request managed AI</a></div></div>
            <section aria-label="AI memory preview" className="ai-memory-preview">
              <div className="ai-memory-preview-heading"><div><span className="core-eyebrow">AI memory preview</span><h3>{selectedProduct.name} context is {aiMemoryReadinessScore}% ready</h3><p>SuperMega summarizes business goals, source counts, owner choices, and reviewed decisions. Raw product records stay out of this preview.</p></div><strong>{aiMemoryReadyGateCount}/{aiMemoryReadinessGates.length} gates</strong></div>
              <div className="ai-memory-preview-rows">{aiMemoryRows.map(([label, value, detail]) => <span key={label}><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>)}</div>
              <p className="ai-memory-next"><strong>Next:</strong> {aiMemoryNextMove}. No customer message, payment, stock move, production write, domain publish, managed write, or model training runs from this preview.</p>
            </section>
          </> : null}
          </fieldset>
          <p className="form-notice" aria-live="polite">{notice || (setup.savedAt ? `Last saved ${formatTime(setup.savedAt)}` : setup.startedAt ? `Guided ${selectedTemplate.name} sample started.` : 'Draft stays local.')}</p>
        </form>
      </div>
      <details className="settings-advanced" id="controls" open={location.hash === '#controls' || undefined}>
        <summary><span>Advanced controls</span><small>Security, evidence, reset</small></summary>
        <div className="settings-advanced-content">
          <section className="core-panel system-boundary-panel">
            <div className="panel-head"><div><span className="core-eyebrow">System boundary</span><h2>{runtime.status === 'enterprise' ? 'Managed mode ready' : 'Managed mode locked'}</h2></div><RuntimeBadge status={runtime.status} /></div>
            {runtime.status === 'enterprise' && managedTrialAuthConfigured() ? managedIdentity ? <div className="template-contract"><span>Managed account</span><strong>{managedIdentity.email}</strong><small>{managedIdentity.workspaceId} - API checked</small><button className="text-link" disabled={managedBusy} onClick={() => void disconnectManagedWorkspace()} type="button">Disconnect</button></div> : <form className="core-form compact-form" onSubmit={(event) => void connectManagedWorkspace(event)}><span className="core-eyebrow">Managed workspace</span><div className="form-row"><label>Email<input autoComplete="username" maxLength={160} onChange={(event) => setManagedEmail(event.target.value)} required type="email" value={managedEmail} /></label><label>Password<input autoComplete="current-password" minLength={8} onChange={(event) => setManagedPassword(event.target.value)} required type="password" value={managedPassword} /></label></div><label>Workspace ID<input maxLength={128} onChange={(event) => setManagedWorkspace(event.target.value)} placeholder="Provisioned workspace" required value={managedWorkspace} /></label><button className="core-button primary" disabled={managedBusy} type="submit">{managedBusy ? 'Checking...' : 'Connect workspace'}</button></form> : null}
            {managedNotice ? <p className="form-notice" role="status">{managedNotice}</p> : null}
            <div className="readiness-list" aria-label="Managed activation readiness">{activationRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div>
            <div className="readiness-list" aria-label="AI learning readiness">{learningRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div>
            <div className="learning-plan" aria-label="Premium AI context plan">
              <div><span className="core-eyebrow">Premium AI context</span><h3>What the system can learn</h3><p>Free mode prepares the evidence package. Premium imports approved data, behavior, and decisions only after managed controls pass.</p></div>
              <div className="learning-plan-rows">{learningPlanRows.map(([label, value, detail]) => <span key={label}><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>)}</div>
              <div aria-label="Premium agent operating plan" className="learning-plan-agent">
                <div><span className="core-eyebrow">Premium agent plan</span><h3>What the agent can run</h3><p>The agent prepares the next workflow from this product setup; managed writes stay locked until the activation gates pass.</p></div>
                <div className="learning-plan-rows">{agentPlanRows.map(([label, value, detail]) => <span key={label}><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>)}</div>
              </div>
              <div aria-label="AI context quality cockpit" className="learning-plan-agent context-quality-panel">
                <div><span className="core-eyebrow">AI context quality</span><h3>What premium can safely use</h3><p>Premium learning starts only when source records, behavior, decisions, and managed controls are present in the exported evidence.</p></div>
                <div className="context-quality-rows">{aiContextQualityRows.map(([label, value, detail]) => <span key={label}><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>)}</div>
              </div>
              <div aria-label="AI product source map" className="learning-plan-agent context-quality-panel">
                <div><span className="core-eyebrow">AI product source map</span><h3>What each product can teach</h3><p>Premium receives an explicit map of Shop, Plant, Website, Ecommerce, behavior, and decision sources. It may summarize and rank only after managed activation; no customer send, payment, stock move, production write, domain publish, CRM write, or model training runs from this map.</p></div>
                <div className="context-quality-rows">{aiProductSourceRows.map(([label, value, detail]) => <span key={label}><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>)}</div>
              </div>
              <div aria-label="AI context handoff manifest" className="learning-plan-agent context-quality-panel">
                <div><span className="core-eyebrow">AI context handoff</span><h3>What premium receives</h3><p>This manifest tells support and the managed agent what it may use, what it must ignore, and which actions remain forbidden.</p></div>
                <div className="context-quality-rows">{contextHandoffRows.map(([label, value, detail]) => <span key={label}><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>)}</div>
              </div>
              <div aria-label="AI context readiness score" className="learning-plan-agent context-quality-panel">
                <div><span className="core-eyebrow">AI context score</span><h3>{aiContextNextMove}</h3><p>This score explains whether premium can safely review the exported context package. It does not activate learning, train models, send messages, move stock, write production records, publish domains, or call managed APIs.</p></div>
                <div className="context-quality-rows">{aiContextReadinessScoreRows.map(([label, value, detail]) => <span key={label}><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>)}</div>
              </div>
              <div aria-label="Managed workspace provisioning packet" className="learning-plan-agent context-quality-panel">
                <div><span className="core-eyebrow">Provisioning packet</span><h3>How this becomes a real workspace</h3><p>Premium activation creates a managed tenant from exported evidence only after roles, data, controls, and write gates are verified.</p></div>
                <div className="context-quality-rows">{provisioningRows.map(([label, value, detail]) => <span key={label}><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>)}</div>
              </div>
              <div aria-label="Managed import provisioning readiness" className="learning-plan-agent context-quality-panel">
                <div><span className="core-eyebrow">Import provisioning</span><h3>What must pass before real imports</h3><p>Backend health owns this checklist. Uploaded files stay local or export-only until identity, schema, validation, approval, adapter, and revision proof are ready.</p></div>
                <div className="context-quality-rows">{importProvisioningRows.map(([label, value, detail]) => <span key={label}><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>)}</div>
              </div>
              {setup.product === 'ecommerce' ? <>
                <div aria-label="Ecommerce order review packet check" className="learning-plan-agent context-quality-panel">
                  <div><span className="core-eyebrow">Order review packet</span><h3>Check before Shop queue</h3><p>Paste the Ecommerce order review JSON. The browser checks schema, row counts, catalog source, source CSV, and forbidden actions locally; no order import, customer message, payment, delivery, stock, Shop write, or managed activation runs.</p></div>
                  <label className="packet-review-field">Order review packet JSON<textarea maxLength={24000} onChange={(event) => setEcommerceOrderReviewPacketText(event.target.value)} placeholder="Paste supermega.ecommerce.order_import_review_packet.v1 JSON" rows={5} value={ecommerceOrderReviewPacketText} /></label>
                  <div className="context-quality-rows">{ecommerceOrderReviewPacketReview.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong><em>{label === 'Boundary' ? 'Review only; Shop queue still requires managed proof.' : 'Local order packet check'}</em></span>)}</div>
                  <div aria-label="Managed order queue check" className="context-quality-rows">{ecommerceOrderQueueManagedRows.map(([label, value, detail]) => <span key={label}><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>)}</div>
                  <div aria-label="Order queue owner approval packet" className="context-quality-rows">{ecommerceOrderQueueApprovalRows.map(([label, value, detail]) => <span key={label}><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>)}</div>
                  <div aria-label="Shop queue import plan" className="context-quality-rows">{ecommerceOrderQueueImportPlanRows.map(([label, value, detail]) => <span key={label}><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>)}</div>
                  <div aria-label="Shop queue apply preflight" className="context-quality-rows">{ecommerceOrderQueueApplyPreflightRows.map(([label, value, detail]) => <span key={label}><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>)}</div>
                  <div className="learning-plan-actions"><button className="core-button" onClick={loadSampleEcommerceOrderReviewPacket} type="button">Load sample order packet</button><button className="core-button" disabled={!ecommerceOrderReviewPacketText.trim()} onClick={reviewEcommerceOrderReviewPacket} type="button">Check order packet locally</button><button className="core-button" disabled={!managedIdentity || !ecommerceOrderQueueReadinessPacket || ecommerceOrderQueueServerBusy} onClick={() => void runManagedEcommerceOrderQueueCheck()} type="button">{ecommerceOrderQueueServerBusy ? 'Checking managed queue...' : 'Run managed queue check'}</button><button className="core-button" disabled={!ecommerceOrderQueueReadinessPacket} onClick={downloadEcommerceOrderQueueReadinessPacket} type="button">Download queue packet</button>{ecommerceOrderQueueApprovalPacket ? <a className="core-button" download={ecommerceOrderQueueApprovalFilename} href={ecommerceOrderQueueApprovalHref}>Download approval packet</a> : <button className="core-button" disabled type="button">Download approval packet</button>}<button className="core-button" disabled={!managedIdentity || !ecommerceOrderQueueApprovalPacket || ecommerceOrderQueueApprovalBusy} onClick={() => void requestManagedEcommerceOrderQueueApproval()} type="button">{ecommerceOrderQueueApprovalBusy ? 'Recording approval...' : 'Record owner approval request'}</button><button className="core-button" disabled={!managedIdentity || !ecommerceOrderQueueApprovalPacket || ecommerceOrderQueueImportPlanBusy} onClick={() => void prepareManagedEcommerceOrderQueueImportPlan()} type="button">{ecommerceOrderQueueImportPlanBusy ? 'Preparing plan...' : 'Prepare import plan'}</button><button className="core-button" disabled={!managedIdentity || !ecommerceOrderQueueImportPlan || !approvedEcommerceQueueApproval || ecommerceOrderQueueApplyPreflightBusy} onClick={() => void runManagedEcommerceOrderQueueApplyPreflight()} type="button">{ecommerceOrderQueueApplyPreflightBusy ? 'Checking apply...' : 'Run apply preflight'}</button><button className="text-link" disabled={!ecommerceOrderReviewPacketText.trim()} onClick={clearEcommerceOrderReviewPacketReview} type="button">Clear order packet</button></div>
                </div>
                <div aria-label="Ecommerce activation packet review" className="learning-plan-agent context-quality-panel">
                  <div><span className="core-eyebrow">Ecommerce activation packet</span><h3>Review before managed setup</h3><p>Paste the downloaded Ecommerce activation JSON. The browser validates schema, source, queue, and forbidden actions locally; no import, managed activation, Shop write, payment, delivery, stock, or customer action runs.</p></div>
                  <label className="packet-review-field">Activation packet JSON<textarea maxLength={12000} onChange={(event) => setEcommerceActivationPacketText(event.target.value)} placeholder="Paste supermega.ecommerce.managed_store_activation_packet.v1 JSON" rows={5} value={ecommerceActivationPacketText} /></label>
                  <div className="context-quality-rows">{ecommerceActivationPacketReview.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong><em>{label === 'Boundary' ? 'Review only; production setup still requires managed proof.' : 'Local packet check'}</em></span>)}</div>
                  <div className="learning-plan-actions"><button className="core-button" onClick={loadSampleEcommerceActivationPacket} type="button">Load sample packet</button><button className="core-button" disabled={!ecommerceActivationPacketText.trim()} onClick={reviewEcommerceActivationPacket} type="button">Review packet locally</button><button className="text-link" disabled={!ecommerceActivationPacketText.trim()} onClick={clearEcommerceActivationPacketReview} type="button">Clear packet</button></div>
                </div>
              </> : null}
              <div aria-label="Agent behavior memory" className="learning-plan-agent">
                <div><span className="core-eyebrow">Behavior memory</span><h3>What owners keep choosing</h3><p>Free mode keeps this local. Premium can use approved queue behavior after managed import.</p></div>
                <div className="learning-plan-rows">{agentBehaviorRows.map(([label, value, detail]) => <span key={label}><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>)}</div>
              </div>
              <div aria-label="Activation automation manifest" className="learning-plan-agent">
                <div><span className="core-eyebrow">Activation manifest</span><h3>What automation may do next</h3><p>{runtime.activationManifest?.automation_boundary ?? 'Agents may prepare evidence and drafts; managed writes stay locked until runtime health confirms activation.'}</p></div>
                <div className="learning-plan-rows">{activationManifestRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div>
              </div>
              <div aria-label="Scheduler activation packet" className="learning-plan-agent managed-request-panel">
                <div><span className="core-eyebrow">Scheduler activation</span><h3>Autopilot stays blocked until proof passes</h3><p>Hosted agents can run only after signed evidence, protected secrets, worker allowlist, budget grants, and no-redirect checks are ready.</p></div>
                <div className="managed-request-rows">{schedulerActivationRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div>
              </div>
              <div aria-label="Managed trial request packet" className="learning-plan-agent managed-request-panel">
                <div><span className="core-eyebrow">Managed trial request</span><h3>What support needs</h3><p>This packet is local. It packages the workspace, product, evidence file, blocked gates, and safe automation boundary for handoff.</p></div>
                <div className="managed-request-rows">{managedTrialRequestRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div>
              </div>
              <div className="learning-plan-actions"><a className="core-button" download={evidenceFilename} href={evidenceHref}>Export AI context package</a>{setup.savedAt ? <><a className="core-button" download={managedTrialRequestFilename} href={managedTrialRequestHref}>Download request packet</a><a className="core-button primary" href={managedTrialRequestUrl(setup.product, selectedTemplate.id)}>Request managed trial</a></> : <button className="core-button primary" disabled type="button">Save trial first</button>}</div>
            </div>
            <Suspense fallback={<p className="form-notice" role="status">Loading managed activation plan...</p>}><ManagedActivationRunbook runtime={runtime} /></Suspense>
            {runtime.status !== 'enterprise' ? <ul className="requirement-list">{(runtime.requirements.length ? runtime.requirements : ['Configure managed tenant persistence.', 'Verify production identity and source coverage.']).map((requirement) => <li key={requirement}>{requirement}</li>)}</ul> : null}
            <p className="authority-note">AI learns from imported records; owners approve consequential actions.</p>
          </section>
          <section className="core-panel trial-control-panel"><div><span className="core-eyebrow">Local evidence</span><h2>Export or reset.</h2><p>Reset clears Shop, unfinished order drafts, Plant, Website, Ecommerce setup, and handoff records.</p></div><div className="trial-actions"><a className="core-button" download={evidenceFilename} href={evidenceHref}>Export evidence</a>{resetArmed ? <><button className="text-link" disabled={resetBusy} onClick={() => setResetArmed(false)} type="button">Cancel</button><button className="core-button danger" disabled={resetBusy} onClick={() => void resetDemoWorkspace()} type="button">{resetBusy ? 'Resetting...' : 'Confirm reset'}</button></> : <button className="text-link danger-text" onClick={() => setResetArmed(true)} type="button">Reset local trial</button>}</div></section>
        </div>
      </details>
    </div>
  )
}
