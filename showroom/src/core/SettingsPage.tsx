import { lazy, Suspense, type FormEvent, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useOutletContext, useSearchParams } from 'react-router'

import {
  LEGACY_WEBSITE_STORAGE_KEY,
  WEBSITE_ECOMMERCE_HANDOFF_KEY,
  WEBSITE_STORAGE_KEY,
} from '../products/product-handoff'
import { getCurrentPublish, loadWebsiteWorkspace } from '../products/website/website-model'
import { COMMERCE_KEY, LEGACY_COMMERCE_KEYS } from './commerce-workspace'
import { BEHAVIOR_TRAIL_KEY, readBehaviorTrail } from './behavior-trail'
import {
  ACTION_KEY,
  APPROVAL_KEY,
  collectLocalProductRecords,
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
  currentManagedWorkspace,
  loadManagedBootstrap,
  managedTrialAuthConfigured,
  signInManagedTrial,
  signOutManagedTrial,
} from './managed-trial'
import { LEGACY_PRODUCTION_KEYS, PRODUCTION_KEY } from './production-workspace'
import { formatTime, LEGACY_TEAM_WORK_KEYS, TEAM_WORK_KEY, useTeamWorkspace } from './team-work'
import {
  buildClientDemoBlueprint,
  buildClientDemoKit,
  buildClientDemoRunbook,
  CLIENT_DEMO_KIT_MAX_BYTES,
  CLIENT_DEMO_PREPARATION_MAX_BYTES,
  CLIENT_DEMO_WORKSPACE_STORAGE_KEY,
  clientDemoPreparationBlueprint,
  clientDemoPreparationConfirmationMatches,
  clientDemoPresets,
  clientImportWorkflowTemplateIds,
  createClientDemoWorkspace,
  restoreClientDemoWorkspace,
  restoreClientDemoKit,
  restoreClientDemoPreparationArtifact,
  updateClientDemoWorkspaceProgress,
  type ClientDemoBlueprint,
  type ClientDemoProductProgress,
  type ClientDemoPresetId,
  type ClientDemoPreparationArtifact,
  type ClientDemoWorkspace,
} from './client-onboarding'
import { projectPlantOrder } from './plant-order-foundation'
import {
  SHOP_SERVICE_SCHEDULE_STORAGE_KEY,
  createShopServiceSchedule,
  provisionEmptyShopServiceSchedule,
  readShopServiceSchedule,
  shopIndustryPack,
  shopIndustryPacks,
  type ShopIndustryPackId,
} from './shop-service-scheduling'
import {
  plantIndustryPack,
  plantIndustryPacks,
  readPlantIndustryPackId,
  savePlantIndustryPackId,
  type PlantIndustryPackId,
} from './plant-industry-packs'

const ClientDataOnboarding = lazy(() => import('./ClientDataOnboarding').then((module) => ({ default: module.ClientDataOnboarding })))
const ManagedActivationRunbook = lazy(() => import('./ManagedActivationRunbook').then((module) => ({ default: module.ManagedActivationRunbook })))

function loadClientDemoWorkspace() {
  if (typeof window === 'undefined') return null
  try { return restoreClientDemoWorkspace(JSON.parse(window.localStorage.getItem(CLIENT_DEMO_WORKSPACE_STORAGE_KEY) || 'null')) } catch { return null }
}

function provisionLocalShopIndustryPack(industryPackId: ShopIndustryPackId) {
  const stored = window.localStorage.getItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY)
  const next = stored
    ? provisionEmptyShopServiceSchedule(readShopServiceSchedule(stored), industryPackId)
    : createShopServiceSchedule(industryPackId)
  window.localStorage.setItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY, JSON.stringify(next))
  return next
}

const demoProgressLabels: Record<ClientDemoProductProgress['status'], string> = {
  not_started: 'Not started',
  needs_fix: 'Needs fixes',
  data_ready: 'Data ready',
  workspace_checked: 'Workspace checked',
  applied: 'Applied',
}

const demoRunbookLabels = {
  prepare_data: 'Prepare data',
  needs_fix: 'Fix data',
  ready_to_run: 'Ready to run',
  proven: 'Evidence proven',
} as const

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
  const [demoWorkspace, setDemoWorkspace] = useState<ClientDemoWorkspace | null>(loadClientDemoWorkspace)
  const [demoPresetId, setDemoPresetId] = useState<ClientDemoPresetId>(() => demoWorkspace?.blueprint.client.presetId ?? 'social-seller')
  const [shopIndustryPackId, setShopIndustryPackId] = useState<ShopIndustryPackId>(() => demoWorkspace?.blueprint.client.shopIndustryPackId ?? clientDemoPresets[0].shopIndustryPackId)
  const [plantIndustryPackId, setPlantIndustryPackId] = useState<PlantIndustryPackId>(() => demoWorkspace?.blueprint.client.plantIndustryPackId ?? readPlantIndustryPackId(typeof window === 'undefined' ? undefined : window.localStorage))
  const [demoSelections, setDemoSelections] = useState<Partial<Record<SetupProductId, string>>>(() => Object.fromEntries((demoWorkspace?.blueprint.products ?? clientDemoPresets[0].selections).map((selection) => [selection.product, selection.templateId])))
  const [demoBlueprint, setDemoBlueprint] = useState<ClientDemoBlueprint | null>(() => demoWorkspace?.blueprint ?? null)
  const [preparedArtifact, setPreparedArtifact] = useState<ClientDemoPreparationArtifact | null>(null)
  const [preparedConfirmation, setPreparedConfirmation] = useState('')
  const [preparedBusyProduct, setPreparedBusyProduct] = useState<SetupProductId | null>(null)
  const [preparedInstallStep, setPreparedInstallStep] = useState('')
  const [preparedNotice, setPreparedNotice] = useState('')
  const completion = pilotProgress(setup)
  const isPilotReady = pilotReady(setup)
  const requestedProduct = setupProductFromQuery(setupSearchParams.get('product'))
  const selectedDemoEntries = Object.entries(demoSelections).filter((entry): entry is [SetupProductId, string] => Boolean(entry[1]))
  const selectedDemoPreset = clientDemoPresets.find((preset) => preset.id === demoPresetId) ?? clientDemoPresets[0]
  const selectedShopIndustryPack = shopIndustryPack(shopIndustryPackId)
  const selectedPlantIndustryPack = plantIndustryPack(plantIndustryPackId)
  const selectedDemoProductNames = selectedDemoEntries.map(([product]) => productDisplayName(product))
  const selectedDemoProductSummary = selectedDemoProductNames.length ? selectedDemoProductNames.join(' · ') : 'Choose at least one'
  const demoInputReady = Boolean(setup.workspace.trim() && setup.owner.trim() && selectedDemoEntries.length)
  const workflowReady = requestedProduct
    ? Boolean(setup.workspace.trim() && setup.owner.trim())
    : Boolean(demoWorkspace)
  const workflowCompletion = requestedProduct
    ? Math.round(([setup.templateId, setup.workspace.trim(), setup.owner.trim()].filter(Boolean).length / 3) * 100)
    : Math.round(([setup.workspace.trim(), setup.owner.trim(), selectedDemoEntries.length ? 'products' : '', demoWorkspace ? 'created' : ''].filter(Boolean).length / 4) * 100)
  const displayedCompletion = settingsStep === 'workflow' ? workflowCompletion : completion
  const displayedReady = settingsStep === 'workflow' ? workflowReady : isPilotReady
  const selectedProduct = productContracts[setup.product]
  const selectedTemplate = templateFor(setup.product, setup.templateId)
  const evidenceDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Yangon' }).format(new Date())
  const evidenceFilename = `supermega-trial-evidence-${evidenceDate}.json`
  const demoBlueprintFilename = `supermega-client-demo-${setup.workspace.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || evidenceDate}.json`
  const demoBlueprintHref = demoBlueprint ? `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(buildClientDemoKit(demoBlueprint, new Date().toISOString()), null, 2))}` : ''
  const privatePreparationCommand = `npm run client:prepare -- --kit "${demoBlueprintFilename}" --data-dir "client-data" --out "private-review.json"`
  const demoReadyCount = demoWorkspace?.products.filter((product) => ['data_ready', 'workspace_checked', 'applied'].includes(product.status)).length ?? 0
  const preparedApprovalReady = Boolean(preparedArtifact && clientDemoPreparationConfirmationMatches(preparedArtifact, preparedConfirmation))
  const preparedAppliedProducts = new Set(demoWorkspace?.products.filter((product) => product.status === 'applied').map((product) => product.product) ?? [])
  const preparedRemainingCount = preparedArtifact?.products.filter((product) => !preparedAppliedProducts.has(product.product)).length ?? 0
  const plantReleasedBatches = (() => {
    try { return production.orderExecution && projectPlantOrder(production.orderExecution).status === 'released_to_stock' ? 1 : 0 } catch { return 0 }
  })()
  const approvedWebsiteReleases = (() => {
    const loaded = loadWebsiteWorkspace(window.localStorage)
    return loaded.ok && getCurrentPublish(loaded.workspace) ? 1 : 0
  })()
  const demoRunbook = demoWorkspace ? buildClientDemoRunbook(demoWorkspace, {
    commerce: {
      completedOrders: commerce.orders.filter((order) => order.status === 'completed').length,
      reconciledOrders: commerce.orders.filter((order) => order.paymentStatus === 'reconciled').length,
    },
    production: { releasedBatches: plantReleasedBatches },
    website: { approvedReleases: approvedWebsiteReleases },
    ecommerce: {
      savedStorefronts: commerce.storefrontConfiguration ? 1 : 0,
      reviewedRequests: commerce.storefrontRequests?.length ?? 0,
    },
  }) : null
  const nextDemoMission = demoRunbook?.products.find((product) => product.product === demoRunbook.nextProduct) ?? null
  const managedTrialRequestFilename = `supermega-managed-trial-request-${evidenceDate}.json`
  const managedApprovalRequests = approvals.map(toManagedApprovalRequest).filter((request): request is NonNullable<typeof request> => Boolean(request))
  const localProductRecords = collectLocalProductRecords(window.localStorage)
  const localRecordCount = Object.keys(localProductRecords).length
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
  const evidenceHref = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ contract: 'supermega_trial_evidence', version: 23, exportedAt: new Date().toISOString(), environment: 'isolated_demo', pilotReady: isPilotReady, setup, workflowProfile: selectedTemplate, commerce, production, accountableActions: actions, approvals, managedApprovalRequests, teams: teamWorkspace, localProductRecords, behaviorTrail, agentBehaviorRows, activationRows, activationSteps: runtime.activationSteps, activationEvidencePlan: runtime.evidencePlan, activationManifest: runtime.activationManifest, activationManifestRows, importProvisioning: runtime.importProvisioning, importProvisioningPacket, importProvisioningRows, schedulerActivation, schedulerActivationRows, managedTrialRequest, managedTrialRequestRows, learningRows, learningPlanRows, agentPlanRows, aiContextQualityRows, contextHandoffManifest, contextHandoffRows, managedWorkspaceProvisioningPacket, provisioningRows }, null, 2))}`
  const managedTrialRequestHref = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(managedTrialRequest, null, 2))}`

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

  useEffect(() => {
    if (requestedProduct !== 'commerce' || setup.product !== 'commerce') return
    const template = templateFor('commerce', selectedShopIndustryPack.workflowTemplateId)
    if (setup.templateId === template.id && setup.entryPoint === selectedShopIndustryPack.entryPoint) return
    const packTimer = window.setTimeout(() => {
      setSetup((current) => current.product !== 'commerce'
        || (current.templateId === template.id && current.entryPoint === selectedShopIndustryPack.entryPoint)
        ? current
        : { ...current, templateId: template.id, entryPoint: selectedShopIndustryPack.entryPoint, startedAt: undefined, savedAt: undefined })
    }, 0)
    return () => window.clearTimeout(packTimer)
  }, [requestedProduct, selectedShopIndustryPack.entryPoint, selectedShopIndustryPack.workflowTemplateId, setSetup, setup.entryPoint, setup.product, setup.templateId])

  useEffect(() => {
    let failureNoticeTimer: number | undefined
    try {
      if (demoWorkspace) window.localStorage.setItem(CLIENT_DEMO_WORKSPACE_STORAGE_KEY, JSON.stringify(demoWorkspace))
      else window.localStorage.removeItem(CLIENT_DEMO_WORKSPACE_STORAGE_KEY)
    } catch {
      failureNoticeTimer = window.setTimeout(() => setNotice('This browser could not save the client workspace. The current setup remains open for this session.'), 0)
    }
    return () => { if (failureNoticeTimer !== undefined) window.clearTimeout(failureNoticeTimer) }
  }, [demoWorkspace])

  function updateSetup(patch: Partial<SetupState>) {
    setSetup((current) => ({ ...current, ...patch, savedAt: undefined }))
    setDemoBlueprint(null)
    setDemoWorkspace(null)
  }

  function chooseDemoPreset(presetId: ClientDemoPresetId) {
    const preset = clientDemoPresets.find((candidate) => candidate.id === presetId) ?? clientDemoPresets[0]
    setDemoPresetId(preset.id)
    setShopIndustryPackId(preset.shopIndustryPackId)
    setPlantIndustryPackId(preset.plantIndustryPackId)
    setDemoSelections(Object.fromEntries(preset.selections.map((selection) => [selection.product, selection.templateId])))
    setDemoBlueprint(null)
    setDemoWorkspace(null)
    setNotice(`${preset.name} modules selected. Adjust products only if this client needs a different operating loop.`)
  }

  function toggleDemoProduct(product: SetupProductId) {
    setDemoSelections((current) => {
      const next = { ...current }
      if (next[product]) delete next[product]
      else next[product] = product === 'commerce' ? selectedShopIndustryPack.workflowTemplateId : clientImportWorkflowTemplateIds(product)[0]
      return next
    })
    setDemoBlueprint(null)
    setDemoWorkspace(null)
  }

  function changeDemoTemplate(product: SetupProductId, templateId: string) {
    if (product === 'commerce') {
      setDemoSelections((current) => ({ ...current, commerce: selectedShopIndustryPack.workflowTemplateId }))
      setNotice('Shop workflow is selected by its business pack.')
      return
    }
    setDemoSelections((current) => ({ ...current, [product]: templateId }))
    setDemoBlueprint(null)
    setDemoWorkspace(null)
  }

  function changeShopIndustryPack(industryPackId: ShopIndustryPackId) {
    const pack = shopIndustryPack(industryPackId)
    const template = templateFor('commerce', pack.workflowTemplateId)
    setShopIndustryPackId(pack.id)
    setDemoSelections((current) => current.commerce ? { ...current, commerce: template.id } : current)
    if (requestedProduct === 'commerce') {
      updateSetup({ templateId: template.id, entryPoint: pack.entryPoint, startedAt: undefined })
    }
    setDemoBlueprint(null)
    setDemoWorkspace(null)
    setNotice(`${pack.name} pack selected with the ${template.name} workflow.`)
  }

  function changePlantIndustryPack(industryPackId: PlantIndustryPackId) {
    setPlantIndustryPackId(plantIndustryPack(industryPackId).id)
    setDemoBlueprint(null)
    setDemoWorkspace(null)
    setNotice('Plant pack changed. Create the client demo again to bind this configuration.')
  }

  function configureDemoProduct(product: SetupProductId, templateId: string, openProduct: boolean) {
    const template = templateFor(product, templateId)
    setSetup((current) => ({
      ...current,
      product,
      templateId: template.id,
      entryPoint: template.entryPoints[0] ?? '',
      startedAt: openProduct ? new Date().toISOString() : current.startedAt,
      savedAt: undefined,
    }))
    if (openProduct) navigate(setupProductPreviewPath(product))
    else setNotice(`${productDisplayName(product)} is selected below. Add client data or try the prepared sample.`)
  }

  function prepareDemoProduct(product: SetupProductId, templateId: string) {
    configureDemoProduct(product, templateId, false)
    window.requestAnimationFrame(() => document.getElementById('client-data-setup')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function installDemoBlueprint(blueprint: ClientDemoBlueprint, origin: 'created' | 'loaded') {
    let shopPackNotice = ''
    if (origin === 'created' && blueprint.products.some((product) => product.product === 'commerce')) {
      try {
        const schedule = provisionLocalShopIndustryPack(blueprint.client.shopIndustryPackId)
        shopPackNotice = ` ${shopIndustryPack(schedule.industryPackId).name} Shop data is prepared.`
      } catch (error) {
        shopPackNotice = ` ${error instanceof Error ? error.message : 'Existing Shop appointment data was preserved.'}`
      }
    }
    let plantPackNotice = ''
    if (origin === 'created' && blueprint.products.some((product) => product.product === 'production')) {
      savePlantIndustryPackId(blueprint.client.plantIndustryPackId, window.localStorage)
      plantPackNotice = ` ${plantIndustryPack(blueprint.client.plantIndustryPackId).name} Plant setup is prepared.`
    }
    const first = blueprint.products[0]
    setDemoPresetId(blueprint.client.presetId)
    setShopIndustryPackId(blueprint.client.shopIndustryPackId)
    setPlantIndustryPackId(blueprint.client.plantIndustryPackId)
    setDemoSelections(Object.fromEntries(blueprint.products.map((product) => [product.product, product.templateId])))
    setDemoBlueprint(blueprint)
    setDemoWorkspace(createClientDemoWorkspace(blueprint, new Date().toISOString()))
    if (first) {
      const template = templateFor(first.product, first.templateId)
      setSetup((current) => ({
        ...current,
        workspace: blueprint.client.workspace,
        owner: blueprint.client.owner,
        product: first.product,
        templateId: template.id,
        entryPoint: template.entryPoints[0] ?? '',
        savedAt: undefined,
      }))
    }
    setNotice(origin === 'loaded'
      ? `${blueprint.products.length}-product setup loaded. Client records, product packs, and progress were not changed; prepare the data again on this device.`
      : `${blueprint.products.length}-product demo kit ready.${shopPackNotice}${plantPackNotice} Prepare data or open a product.`)
  }

  async function loadDemoKit(file: File | null) {
    if (!file) return
    try {
      if (file.size < 1 || file.size > CLIENT_DEMO_KIT_MAX_BYTES) throw new Error('Choose a SuperMega setup kit smaller than 128 KB.')
      const kit = restoreClientDemoKit(JSON.parse(await file.text()))
      if (!kit) throw new Error('This setup kit is invalid or has been changed.')
      installDemoBlueprint(kit.blueprint, 'loaded')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The setup kit could not be loaded.')
    }
  }

  async function loadPreparedClientDemo(file: File | null) {
    if (!file) return
    setPreparedNotice('Verifying the private package...')
    try {
      if (file.size < 1 || file.size > CLIENT_DEMO_PREPARATION_MAX_BYTES) throw new Error('Choose a private SuperMega package smaller than 5 MB.')
      const artifact = await restoreClientDemoPreparationArtifact(JSON.parse(await file.text()))
      if (!artifact) throw new Error('This private package is invalid, unsafe, or has been changed.')
      installDemoBlueprint(clientDemoPreparationBlueprint(artifact), 'loaded')
      setPreparedArtifact(artifact)
      setPreparedConfirmation('')
      setPreparedNotice(`${artifact.products.length}-product private package verified. Review it, then approve one serial installation.`)
    } catch (error) {
      setPreparedArtifact(null)
      setPreparedConfirmation('')
      setPreparedNotice(error instanceof Error ? error.message : 'The private package could not be loaded.')
    }
  }

  async function copyPrivatePreparationCommand() {
    try {
      await navigator.clipboard.writeText(privatePreparationCommand)
      setNotice('Private preparation command copied. Run it from the SuperMega project folder after adding the client CSV files.')
    } catch {
      setNotice('Copy was unavailable. Select the command below and run it from the SuperMega project folder.')
    }
  }

  async function installPreparedProducts() {
    const artifact = preparedArtifact
    if (!artifact || preparedBusyProduct || managedIdentity || !preparedApprovalReady) return
    const installedBeforeRun = new Set(demoWorkspace?.products.filter((product) => product.status === 'applied').map((product) => product.product) ?? [])
    let activeProduct: SetupProductId | null = null
    try {
      const { applyPreparedLocalClientDemoProduct, preparedLocalClientDemoInstallOrder } = await import('./local-client-import')
      const installOrder = (await preparedLocalClientDemoInstallOrder(artifact)).filter((product) => !installedBeforeRun.has(product))
      if (!installOrder.length) {
        setPreparedNotice('All products in this private package are already installed and current.')
        return
      }
      const summaries: string[] = []
      for (const [index, product] of installOrder.entries()) {
        activeProduct = product
        setPreparedBusyProduct(product)
        setPreparedInstallStep(`Installing ${index + 1} of ${installOrder.length}: ${productDisplayName(product)}`)
        setPreparedNotice(`Rechecking and installing ${productDisplayName(product)} locally...`)
        const installed = await applyPreparedLocalClientDemoProduct(artifact, product, preparedConfirmation)
        let packNotice = ''
        if (product === 'commerce') {
          try {
            const schedule = provisionLocalShopIndustryPack(artifact.client.shopIndustryPackId)
            packNotice = ` ${shopIndustryPack(schedule.industryPackId).name} Shop pack is active.`
          } catch { packNotice = ' Existing Shop appointment data was preserved.' }
        } else if (product === 'production') {
          try {
            savePlantIndustryPackId(artifact.client.plantIndustryPackId, window.localStorage)
            packNotice = ` ${plantIndustryPack(artifact.client.plantIndustryPackId).name} Plant pack is active.`
          } catch { packNotice = ' Existing Plant pack was preserved.' }
        }
        recordDemoProductProgress({
          product,
          status: 'applied',
          rows: installed.created + installed.alreadyPresent,
          readyRows: installed.created + installed.alreadyPresent,
          issueRows: 0,
          updatedAt: null,
        })
        summaries.push(`${productDisplayName(product)} ${installed.created ? `${installed.created} new` : 'current'}`)
        setPreparedNotice(`${productDisplayName(product)} installed.${packNotice}`)
      }
      setPreparedNotice(`Demo ready: ${summaries.join(' · ')}. Open each product below and run its proof workflow.`)
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'The product could not be installed.'
      setPreparedNotice(`Stopped${activeProduct ? ` at ${productDisplayName(activeProduct)}` : ''}: ${detail} Products already installed are preserved; fix the issue and run the remaining installation again.`)
    } finally {
      setPreparedBusyProduct(null)
      setPreparedInstallStep('')
    }
  }

  function createDemoKit() {
    try {
      const blueprint = buildClientDemoBlueprint({
        workspace: setup.workspace,
        owner: setup.owner,
        presetId: demoPresetId,
        shopIndustryPackId,
        plantIndustryPackId,
        selections: selectedDemoEntries.map(([product, templateId]) => ({ product, templateId })),
      })
      installDemoBlueprint(blueprint, 'created')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The client demo kit could not be prepared.')
    }
  }

  function recordDemoProductProgress(progress: ClientDemoProductProgress) {
    setDemoWorkspace((current) => {
      const previous = current?.products.find((product) => product.product === progress.product)
      if (!current || !previous) return current
      if ((progress.status === 'not_started' && previous.status !== 'not_started')
        || (previous.status === 'applied' && progress.status !== 'applied')) return current
      if (previous.status === progress.status && previous.rows === progress.rows && previous.readyRows === progress.readyRows && previous.issueRows === progress.issueRows) return current
      try { return updateClientDemoWorkspaceProgress(current, progress, new Date().toISOString()) } catch { return current }
    })
  }

  function chooseSettingsStep(step: 'workflow' | 'success') {
    setSettingsStep(step)
    if (location.hash) navigate('/settings/', { replace: true })
  }

  function changeTemplate(templateId: string) {
    const template = templateFor(setup.product, templateId)
    updateSetup({ templateId: template.id, entryPoint: template.entryPoints[0] ?? '', startedAt: undefined })
  }

  function startGuidedTrial() {
    if (!workflowReady) {
      setNotice('Name the trial workspace and responsible owner first.')
      chooseSettingsStep('workflow')
      return
    }
    if (setup.product === 'commerce') {
      try { provisionLocalShopIndustryPack(shopIndustryPackId) } catch { /* Existing local evidence stays authoritative. */ }
    }
    if (setup.product === 'production') savePlantIndustryPackId(plantIndustryPackId, window.localStorage)
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
        CLIENT_DEMO_WORKSPACE_STORAGE_KEY,
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
    setManagedNotice('Managed account disconnected.')
    setManagedBusy(false)
  }

  return (
    <div className="workspace-screen settings-screen">
      <PageHeading eyebrow={requestedProduct ? 'Guided trial' : 'Client setup'} title={requestedProduct ? `Set up ${selectedProduct.name}` : 'Create a working client demo.'} copy={requestedProduct ? requestedProduct === 'commerce' ? 'Name the client, choose the business pack, and prepare their data.' : 'Name the client, choose one workflow, and prepare their data.' : 'Pick the business, name the owner, and open a connected demo. Customize only when needed.'} actions={requestedProduct ? undefined : <div className="setup-action-group"><label className="core-button">Load setup kit<input accept=".json,application/json" className="sr-only" onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; event.currentTarget.value = ''; void loadDemoKit(file) }} type="file" /></label><label className="core-button primary">Load private package<input accept=".json,application/json" className="sr-only" onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; event.currentTarget.value = ''; void loadPreparedClientDemo(file) }} type="file" /></label></div>} />
      {!preparedArtifact && preparedNotice ? <p className="form-notice" role="status">{preparedNotice}</p> : null}
      {requestedProduct ? <nav aria-label="Setup steps" className="settings-step-nav">
        <button aria-current={settingsStep === 'workflow' ? 'step' : undefined} onClick={() => chooseSettingsStep('workflow')} type="button"><span>1</span>{requestedProduct ? 'Template' : 'Demo kit'}</button>
        <button aria-current={settingsStep === 'success' ? 'step' : undefined} onClick={() => chooseSettingsStep('success')} type="button"><span>2</span>Trial plan</button>
      </nav> : null}
      <div className="settings-grid settings-step-content">
        <form className="core-panel setup-form" onSubmit={save}>
          <div className="panel-head"><div><span className="core-eyebrow">{requestedProduct ? 'One product' : 'Client system'}</span><h2>{settingsStep === 'workflow' ? requestedProduct ? 'Choose the trial' : 'Create client demo' : 'Define success'}</h2></div><span className={`status-pill ${displayedReady ? 'approved' : 'bounded'}`}>{displayedReady ? 'ready' : `${displayedCompletion}%`}</span></div>
          <div className="pilot-progress"><div className="progress-track"><i style={{ width: `${displayedCompletion}%` }} /></div><small>{settingsStep === 'workflow' ? requestedProduct ? 'Template - owner' : 'Client - business - ready' : 'Record - target - evidence'}</small></div>
          <fieldset className="settings-step-fields" disabled={settingsStep !== 'workflow'} hidden={settingsStep !== 'workflow'}>
          {requestedProduct ? <div className="setup-selected-product"><span><small>Selected product</small><strong>{selectedProduct.name}</strong></span><Link className="text-link" to="/settings/">Build full demo kit</Link></div> : null}
          <div className="form-row"><label>Client or workspace name<input maxLength={60} required value={setup.workspace} onChange={(event) => updateSetup({ workspace: event.target.value })} placeholder="Example: Golden Valley Trading" /></label><label>Responsible owner<input maxLength={80} required value={setup.owner} onChange={(event) => updateSetup({ owner: event.target.value })} placeholder="Name or role" /></label></div>
          {requestedProduct === 'commerce' || (!requestedProduct && Boolean(demoSelections.commerce)) ? <div className="form-row"><label>Shop business pack<select onChange={(event) => changeShopIndustryPack(event.target.value as ShopIndustryPackId)} value={shopIndustryPackId}>{shopIndustryPacks.map((pack) => <option key={pack.id} value={pack.id}>{pack.name}</option>)}</select></label><div className="template-contract"><span>{selectedShopIndustryPack.description}</span><strong>{selectedShopIndustryPack.firstWorkflow}</strong><small>{selectedShopIndustryPack.capabilities.join(' · ')}</small></div></div> : null}
          {requestedProduct === 'production' || (!requestedProduct && Boolean(demoSelections.production)) ? <div className="form-row"><label>Plant industry pack<select onChange={(event) => changePlantIndustryPack(event.target.value as PlantIndustryPackId)} value={plantIndustryPackId}>{plantIndustryPacks.map((pack) => <option key={pack.id} value={pack.id}>{pack.name}</option>)}</select></label><div className="template-contract"><span>{selectedPlantIndustryPack.description}</span><strong>{selectedPlantIndustryPack.firstWorkflow}</strong><small>{selectedPlantIndustryPack.capabilities.join(' · ')}</small></div></div> : null}
          {requestedProduct ? <>
            <div className="form-row">{setup.product === 'commerce' ? <div className="template-contract"><span>Configured workflow</span><strong>{selectedTemplate.name}</strong><small>Selected automatically from the business pack.</small></div> : <label>Workflow<select value={setup.templateId} onChange={(event) => changeTemplate(event.target.value)}>{templatesFor(setup.product).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>}</div>
            <div className="setup-template-summary"><div><span>Outcome</span><strong>{selectedTemplate.outcome}</strong></div><ol aria-label={`${selectedTemplate.name} workflow`}>{selectedTemplate.workflow.map((step) => <li key={step}>{step}</li>)}</ol><small>Measure success with {selectedTemplate.metric.toLowerCase()}.</small></div>
          </> : <>
            <div aria-label="Choose client business type" className="demo-preset-grid" role="group">{clientDemoPresets.map((preset) => <button aria-pressed={demoPresetId === preset.id} key={preset.id} onClick={() => chooseDemoPreset(preset.id)} type="button"><strong>{preset.name}</strong><small>{preset.description}</small></button>)}</div>
            <div className="setup-template-summary"><div><span>Selected business</span><strong>{selectedDemoPreset.name}</strong></div><div><span>Connected products</span><strong>{selectedDemoProductSummary}</strong></div><small>{selectedDemoPreset.description}</small></div>
            <details className="compact-disclosure demo-product-customizer">
              <summary><span>Customize products</span><small>{selectedDemoEntries.length} selected</small></summary>
              <div><span className="core-eyebrow">Products and workflows</span><p className="panel-copy">Keep only what this client will actually use. Every selected product shares the client name and owner.</p></div>
              <div aria-label="Choose products for the client demo" className="demo-solution-grid">{Object.values(productContracts).map((product) => {
                const templateId = demoSelections[product.id]
                return <section className="demo-solution-card" data-selected={Boolean(templateId)} key={product.id}>
                  <label><input checked={Boolean(templateId)} onChange={() => toggleDemoProduct(product.id)} type="checkbox" /><span><strong>{product.name}</strong><small>{product.headline}</small></span></label>
                  {templateId ? product.id === 'commerce' ? <small>{templateFor('commerce', selectedShopIndustryPack.workflowTemplateId).name} · selected by Shop pack</small> : <select aria-label={`${product.name} workflow`} onChange={(event) => changeDemoTemplate(product.id, event.target.value)} value={templateId}>{templatesFor(product.id).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select> : <small>Not included in this demo.</small>}
                </section>
              })}</div>
            </details>
            <div className="settings-step-actions"><span>Creates a local setup package. No client data is sent.</span><button className="core-button primary" disabled={!demoInputReady} onClick={createDemoKit} type="button">Create client demo</button></div>
            {demoBlueprint ? <section aria-label="Client demo kit" className="demo-kit-result">
              <div className="panel-head"><div><span className="core-eyebrow">Client workspace</span><h3>{demoBlueprint.client.workspace}</h3><p>{demoRunbook?.provenCount ?? 0} proven · {demoReadyCount} data-ready · owner {demoBlueprint.client.owner}</p></div><a className="core-button" download={demoBlueprintFilename} href={demoBlueprintHref}>Download setup kit</a></div>
              <div aria-label="Shared operating foundation" className="readiness-list client-foundation-summary"><span><small>Operating unit</small><strong>{demoBlueprint.foundation.operatingUnit.name}</strong><em>{demoBlueprint.foundation.operatingUnit.code} · {demoBlueprint.foundation.operatingUnit.kind}</em></span><span><small>Market</small><strong>{demoBlueprint.foundation.localization.countryCode} · {demoBlueprint.foundation.localization.currency}</strong><em>{demoBlueprint.foundation.localization.locale}</em></span><span><small>Topology</small><strong>{demoBlueprint.topology.locations.length} location · {demoBlueprint.topology.channels.length} channels</strong><em>{demoBlueprint.topology.recordAuthorities.length} product authorities</em></span><span><small>Timezone</small><strong>{demoBlueprint.foundation.localization.timeZone}</strong><em>Shared by all selected products</em></span><span><small>Authority</small><strong>Client review required</strong><em>Managed identity required before activation</em></span></div>
              <details className="compact-disclosure client-preparation-handoff">
                <summary><span>Prepare private client files</span><small>Internal founder workflow</small></summary>
                <ol>
                  <li>Download the setup kit above.</li>
                  <li>Create a <code>client-data</code> folder beside it and add {demoBlueprint.products.map((product) => `${product.product}.csv`).join(', ')}.</li>
                  <li>Run the command below from the SuperMega project folder.</li>
                  <li>Load <code>private-review.json</code> with <strong>Load private package</strong>, review the digest, then install.</li>
                </ol>
                <div className="client-preparation-command"><code>{privatePreparationCommand}</code><button className="core-button compact" onClick={() => void copyPrivatePreparationCommand()} type="button">Copy command</button></div>
                <p>Preparation is local, serial, and fail-closed. It performs no model call, network send, managed write, or activation.</p>
              </details>
              {preparedArtifact ? <section aria-label="Private client package installer" className="setup-template-summary">
                <div><span className="core-eyebrow">Verified private package</span><strong>Install one connected local demo.</strong><small>Private client rows stay in this browser. Nothing is uploaded, shared, or installed automatically.</small></div>
                <div className="template-contract"><span>Founder approval</span><strong>{preparedArtifact.products.length} products · {preparedArtifact.products.reduce((total, product) => total + product.rowCount, 0)} reviewed rows</strong><small>{preparedArtifact.controls.containsNormalizedClientData ? 'Includes normalized client CSV data.' : 'Uses prepared sample fixtures.'}</small></div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <details className="compact-disclosure"><summary><span>Review exact package</span><small>{preparedArtifact.bundleDigest.slice(0, 22)}...</small></summary><ol>{preparedArtifact.review.checklist.map((item) => <li key={item}>{item}</li>)}</ol><code>{preparedArtifact.review.confirmation}</code></details>
                  <label>Paste the exact approval phrase<input autoComplete="off" disabled={Boolean(managedIdentity || preparedBusyProduct)} onChange={(event) => setPreparedConfirmation(event.target.value)} spellCheck={false} value={preparedConfirmation} /></label>
                  {managedIdentity ? <p className="form-notice">Disconnect the managed account to use this browser-local installer. Managed imports keep their separate server validation and approval flow.</p> : null}
                  <div className="settings-step-actions"><span>{preparedRemainingCount ? `${preparedRemainingCount} product${preparedRemainingCount === 1 ? '' : 's'} remaining · Shop installs before Ecommerce.` : 'All package products are installed.'}</span><button className="core-button primary" disabled={!preparedApprovalReady || Boolean(preparedBusyProduct) || Boolean(managedIdentity) || preparedRemainingCount === 0} onClick={() => void installPreparedProducts()} type="button">{preparedBusyProduct ? preparedInstallStep : `Install remaining ${preparedRemainingCount}`}</button></div>
                  <div aria-label="Install prepared products" className="demo-solution-grid">{preparedArtifact.products.map((product) => {
                    const applied = demoWorkspace?.products.find((entry) => entry.product === product.product)?.status === 'applied'
                    const busy = preparedBusyProduct === product.product
                    return <section className="demo-solution-card" data-selected key={product.product}><div><strong>{product.label}</strong><small>{busy ? 'Installing now...' : applied ? 'Installed and ready' : `${product.rowCount} rows · ${product.sourceMode === 'client_csv' ? 'client CSV' : 'prepared sample'}`}</small></div>{applied ? <Link className="core-button" to={product.demoPath}>Open</Link> : null}</section>
                  })}</div>
                  <p className="form-notice" aria-live="polite">{preparedNotice}</p>
                </div>
              </section> : null}
              {demoBlueprint.integrations.length ? <ol className="demo-integration-flow">{demoBlueprint.integrations.map((integration) => <li key={`${integration.from}-${integration.to}`}><strong>{productDisplayName(integration.from)} → {productDisplayName(integration.to)}</strong><span>{integration.outcome}</span></li>)}</ol> : <p className="form-notice">This demo has one standalone product.</p>}
              {nextDemoMission ? <div className="demo-next-mission"><div><span className="core-eyebrow">Do this next</span><strong>{nextDemoMission.label}: {nextDemoMission.scenario}</strong><small>{nextDemoMission.status === 'ready_to_run' ? nextDemoMission.evidenceRequirement : 'Prepare clean client data, then run the real workflow.'}</small></div>{nextDemoMission.status === 'prepare_data' || nextDemoMission.status === 'needs_fix' ? <button className="core-button primary" onClick={() => prepareDemoProduct(nextDemoMission.product, demoBlueprint.products.find((product) => product.product === nextDemoMission.product)?.templateId ?? '')} type="button">{nextDemoMission.actionLabel}</button> : <Link className="core-button primary" to={nextDemoMission.actionPath}>{nextDemoMission.actionLabel}</Link>}</div> : <div className="demo-next-mission complete"><div><span className="core-eyebrow">Demo evidence complete</span><strong>All selected product missions are proven.</strong><small>Export the setup kit and use the recorded product evidence for the client review.</small></div></div>}
              <details className="compact-disclosure demo-mission-list"><summary><span>All product missions</span><small>{demoRunbook?.products.length ?? 0} workflows</small></summary><div className="demo-runbook-products">{demoRunbook?.products.map((mission, index) => {
                const blueprintProduct = demoBlueprint.products.find((product) => product.product === mission.product)
                const statusClass = mission.status === 'proven' ? 'approved' : mission.status === 'needs_fix' ? 'pending' : 'bounded'
                return <details data-status={mission.status} key={mission.product}><summary><span><small>Mission {index + 1} · {templateFor(mission.product, blueprintProduct?.templateId ?? '').name}</small><strong>{mission.label}: {mission.scenario}</strong></span><span className={`status-pill ${statusClass}`}>{demoRunbookLabels[mission.status]}</span></summary><div><ol>{mission.steps.map((step) => <li key={step}>{step}</li>)}</ol><div className="demo-proof-contract"><small>Required proof</small><strong>{mission.evidenceRequirement}</strong><em>Observed: {mission.evidenceObserved} · data {demoProgressLabels[mission.importStatus].toLowerCase()}</em></div>{mission.status === 'prepare_data' || mission.status === 'needs_fix' ? <button className="core-button" onClick={() => prepareDemoProduct(mission.product, blueprintProduct?.templateId ?? '')} type="button">{mission.actionLabel}</button> : <Link className="core-button" to={mission.actionPath}>{mission.actionLabel}</Link>}</div></details>
              })}</div></details>
            </section> : null}
          </>}
          {requestedProduct || demoBlueprint ? <section className="demo-data-setup" id="client-data-setup"><div><span className="core-eyebrow">Client data</span><h3>Prepare {selectedProduct.name}</h3><p>Try the safe sample now or drop in the client's matching CSV for review.</p></div><Suspense fallback={<p className="form-notice" role="status">Loading the client data template...</p>}><ClientDataOnboarding managedIdentity={managedIdentity} onProgress={recordDemoProductProgress} owner={setup.owner} plantIndustryPackId={setup.product === 'production' ? plantIndustryPackId : undefined} product={setup.product} productName={selectedProduct.name} productSlug={selectedProduct.slug} shopIndustryPackId={setup.product === 'commerce' ? shopIndustryPackId : undefined} workflowTemplateId={selectedTemplate.id} workspace={setup.workspace} /></Suspense></section> : null}
          {requestedProduct || demoBlueprint ? <div className="settings-step-actions"><span>{requestedProduct ? 'Sample first. Plan when needed.' : 'Optional: add measurable success criteria after the demo works.'}</span><div className="setup-action-group"><button className="text-link" disabled={!workflowReady} onClick={() => chooseSettingsStep('success')} type="button">Add success criteria</button>{requestedProduct ? <button className="core-button primary" disabled={!workflowReady} onClick={startGuidedTrial} type="button">Start guided sample</button> : null}</div></div> : null}
          </fieldset>
          <fieldset className="settings-step-fields" disabled={settingsStep !== 'success'} hidden={settingsStep !== 'success'}>
          <div className="template-contract settings-workflow-summary"><span>{productDisplayName(setup.product)}</span><strong>{setup.workspace || 'Unnamed workspace'}</strong><small>{selectedTemplate.name} - {setup.owner || 'Owner needed'}</small></div>
          <label>Current record<input maxLength={180} required value={setup.currentRecord} onChange={(event) => updateSetup({ currentRecord: event.target.value })} placeholder="Chat, paper, sheet, system, or log." /></label>
          <div className="form-row pilot-text-row"><label>Baseline<textarea maxLength={240} required value={setup.baseline} onChange={(event) => updateSetup({ baseline: event.target.value })} placeholder="Current time, error rate, backlog, output." /></label><label>Target outcome<textarea maxLength={240} required value={setup.targetOutcome} onChange={(event) => updateSetup({ targetOutcome: event.target.value })} placeholder={`Target for ${selectedTemplate.metric.toLowerCase()}.`} /></label></div>
          <div className="form-row pilot-text-row"><label>Human authority boundary<textarea maxLength={240} required value={setup.authorityBoundary} onChange={(event) => updateSetup({ authorityBoundary: event.target.value })} placeholder="Which actions need owner approval?" /></label><label>Acceptance evidence<textarea maxLength={240} required value={setup.acceptanceEvidence} onChange={(event) => updateSetup({ acceptanceEvidence: event.target.value })} placeholder="What proves the pilot works?" /></label></div>
          <div className="settings-step-actions"><button className="text-link" onClick={() => chooseSettingsStep('workflow')} type="button">Back</button><button className="core-button primary" type="submit">Save client setup</button></div>
          {setup.savedAt ? <div className="setup-complete"><div><strong>Trial plan saved.</strong><small>Export evidence before managed import.</small></div><div className="setup-complete-actions"><Link className="core-button" to={setupProductPreviewPath(setup.product)}>Open {productDisplayName(setup.product)}</Link><a className="core-button" download={evidenceFilename} href={evidenceHref}>Export evidence</a><a className="core-button" download={managedTrialRequestFilename} href={managedTrialRequestHref}>Download request packet</a><a className="core-button primary" href={managedTrialRequestUrl(setup.product, selectedTemplate.id)}>Request managed trial</a></div></div> : null}
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
              <div aria-label="AI context handoff manifest" className="learning-plan-agent context-quality-panel">
                <div><span className="core-eyebrow">AI context handoff</span><h3>What premium receives</h3><p>This manifest tells support and the managed agent what it may use, what it must ignore, and which actions remain forbidden.</p></div>
                <div className="context-quality-rows">{contextHandoffRows.map(([label, value, detail]) => <span key={label}><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>)}</div>
              </div>
              <div aria-label="Managed workspace provisioning packet" className="learning-plan-agent context-quality-panel">
                <div><span className="core-eyebrow">Provisioning packet</span><h3>How this becomes a real workspace</h3><p>Premium activation creates a managed tenant from exported evidence only after roles, data, controls, and write gates are verified.</p></div>
                <div className="context-quality-rows">{provisioningRows.map(([label, value, detail]) => <span key={label}><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>)}</div>
              </div>
              <div aria-label="Managed import provisioning readiness" className="learning-plan-agent context-quality-panel">
                <div><span className="core-eyebrow">Import provisioning</span><h3>What must pass before real imports</h3><p>Backend health owns this checklist. Uploaded files stay local or export-only until identity, schema, validation, approval, adapter, and revision proof are ready.</p></div>
                <div className="context-quality-rows">{importProvisioningRows.map(([label, value, detail]) => <span key={label}><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>)}</div>
              </div>
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
