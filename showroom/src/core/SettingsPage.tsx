import { lazy, Suspense, type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router'

import {
  LEGACY_WEBSITE_STORAGE_KEY,
  WEBSITE_ECOMMERCE_HANDOFF_KEY,
  WEBSITE_STORAGE_KEY,
} from '../products/product-handoff'
import {
  readBehaviorTrail,
  summarizeBehaviorPreferences,
  summarizeProductActivationFunnel,
  summarizeProductFirstValue,
} from './behavior-trail'
import { ManagedContextConsent } from './ManagedContextConsent'
import { buildManagedAiContextExport, buildManagedContextProfileRequest, managedContextProductLabel } from './managed-context'
import { operatingChangeCopy } from './operating-baseline'
import { getCurrentPublish, loadWebsiteWorkspace } from '../products/website/website-model'
import { LOCAL_STOREFRONT_DRAFT_SCOPE, readStorefrontDraft } from '../products/ecommerce/storefront-draft'
import { managedTrialRequestUrl } from './CoreApp'
import { PageHeading, RuntimeBadge, type RuntimeHealth } from './CoreShell'
import { bi } from './i18n-actions'
import {
  mergeManagedApprovals,
  toManagedApprovalRequest,
  useAccountableActions,
  useApprovalWorkspace,
  useCommerceWorkspace,
  useManagedIdentity,
  useProductionWorkspace,
  useSetupWorkspace,
} from './workspace-runtime'
import {
  collectLocalProductRecords,
  LEGACY_STOREFRONT_DRAFT_RESET_PREFIX,
  pilotProgress,
  pilotReady,
  productContracts,
  productDisplayName,
  rememberProductSetup,
  seedSetupForProduct,
  setupProductPreviewPath,
  STOREFRONT_DRAFT_RESET_PREFIX,
  templateFor,
  templatesFor,
  type SetupProductId,
  type SetupState,
} from './product-setup'
import {
  type ManagedEcommerceOrderQueueApplyPreflight,
  type ManagedEcommerceOrderQueueImportPlan,
  type ManagedEcommerceOrderQueueValidation,
  buildManagedEcommerceOrderQueueValidation,
  completeManagedWorkspaceSignIn,
  createManagedApproval,
  loadManagedCompanyBrief,
  loadManagedBootstrap,
  managedTrialAuthConfigured,
  planManagedEcommerceOrderQueueImport,
  preflightManagedEcommerceOrderQueueApply,
  retainManagedCompanyBrief,
  signInAndDiscoverManagedWorkspaces,
  signOutManagedTrial,
  validateManagedEcommerceOrderQueue,
  type ManagedCompanyBrief,
  type ManagedIdentity,
  type ManagedWorkspaceSignIn,
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
import { currentProductionShiftClose } from './production-workspace'
import { formatTime, useTeamWorkspace } from './team-work'
import { buildManagedTrialProof } from './managed-trial-proof'
import { PilotOutcomePanel } from './PilotOutcomePanel'
import { buildPilotOutcomeDecisionApproval } from './pilot-outcome-decision'
import {
  buildPlantGuidedShiftCloseOutcomeMetric,
  buildShopGuidedSaleOutcomeMetric,
  type PilotOutcomeReport,
  type PilotOutcomeReview,
} from './pilot-outcome'
import { useLocalPilotOutcome } from './useLocalPilotOutcome'
import { buildClientCapabilityPlan } from './client-capability-plan'
import { lockedCapabilityNotice } from './capability-tiers'
import {
  buildClientCsvStarterPack,
  buildClientDemoBlueprint,
  buildClientDemoRunbook,
  CLIENT_DEMO_KIT_MAX_BYTES,
  CLIENT_DEMO_PREPARATION_MAX_BYTES,
  CLIENT_IMPORT_MAX_BYTES,
  CLIENT_DEMO_WORKSPACE_STORAGE_KEY,
  clientDemoKitReadiness,
  clientDemoPreparationBlueprint,
  clientDemoPreparationConfirmationMatches,
  clientDemoPresets,
  clientCsvStarterPackHref,
  clientImportWorkflowTemplateIds,
  prepareClientDemoInBrowser,
  reconcileClientDemoWorkspace,
  restoreClientDemoWorkspace,
  restoreClientDemoKit,
  restoreClientDemoPreparationArtifact,
  updateClientDemoWorkspaceProgress,
  type ClientDemoBlueprint,
  type ClientDemoProductProgress,
  type ClientDemoPresetId,
  type ClientDemoPreparationArtifact,
  type ClientDemoPreparationSource,
  type ClientDemoWorkspace,
  type ClientSolutionId,
} from './client-onboarding'
import { projectPlantOrder } from './plant-order-foundation'
import { productionOrderPortfolioEntries } from './production-order-portfolio'
import {
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
import { provisionLocalShopIndustryPack, readLocalShopIndustryPackId } from './product-onboarding-runtime'
import { activateLocalWebsiteWorkingSample, type WebsiteStarterTemplateId } from '../products/website/website-starter'
import {
  LOCAL_WORKSPACE_BACKUP_MAX_BYTES,
  LOCAL_WORKSPACE_RESTORE_POINT_KEY,
  applyLocalWorkspaceBackup,
  collectLocalWorkspaceBackup,
  listLocalWorkspaceStorageKeys,
  restoreLocalWorkspaceBackup,
  restoreLocalWorkspaceBackupFromEvidence,
  type LocalWorkspaceBackup,
} from './local-workspace-backup'

const clientCsvProductByName: Readonly<Record<string, ClientSolutionId>> = {
  'shop.csv': 'commerce',
  'commerce.csv': 'commerce',
  'plant.csv': 'production',
  'production.csv': 'production',
  'website.csv': 'website',
  'ecommerce.csv': 'ecommerce',
}

const ClientDataOnboarding = lazy(() => import('./ClientDataOnboarding').then((module) => ({ default: module.ClientDataOnboarding })))
const ManagedActivationRunbook = lazy(() => import('./ManagedActivationRunbook').then((module) => ({ default: module.ManagedActivationRunbook })))
const CompanyBackupPanel = lazy(() => import('./CompanyBackupPanel').then((module) => ({ default: module.CompanyBackupPanel })))

function loadClientDemoWorkspace() {
  if (typeof window === 'undefined') return null
  try { return restoreClientDemoWorkspace(JSON.parse(window.localStorage.getItem(CLIENT_DEMO_WORKSPACE_STORAGE_KEY) || 'null')) } catch { return null }
}

function loadLocalWorkspaceRestorePoint() {
  if (typeof window === 'undefined') return null
  try { return restoreLocalWorkspaceBackup(JSON.parse(window.sessionStorage.getItem(LOCAL_WORKSPACE_RESTORE_POINT_KEY) || 'null')) } catch { return null }
}

const demoProgressLabels: Record<ClientDemoProductProgress['status'], string> = {
  not_started: 'Not started',
  needs_fix: 'Needs fixes',
  data_ready: 'Data ready',
  workspace_checked: 'Company checked',
  applied: 'Applied',
}

const demoRunbookLabels = {
  prepare_data: 'Prepare data',
  needs_fix: 'Fix data',
  ready_to_run: 'Ready to run',
  proven: 'Evidence proven',
} as const

const demoLaunchLabels = {
  prepare_data: 'Sample ready',
  needs_fix: 'Fix client data',
  ready_to_run: 'Client data ready',
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

function safePacketFilename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'store'
}

function latestIsoTimestamp(values: Array<string | null | undefined>) {
  return values.reduce<string | null>((latest, value) => {
    if (!value || !Number.isFinite(Date.parse(value))) return latest
    return !latest || Date.parse(value) > Date.parse(latest) ? value : latest
  }, null)
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
  const [setup, setSetup] = useSetupWorkspace()
  const pilotOutcomeSetup = {
    product: setup.product,
    workspace: setup.workspace,
    owner: setup.owner,
    templateId: setup.templateId,
  }
  const [actions] = useAccountableActions()
  const [production] = useProductionWorkspace()
  const currentPlantShiftClose = currentProductionShiftClose(production)
  const guidedOutcomeMetric = setup.startedAt
    ? setup.product === 'commerce'
      ? buildShopGuidedSaleOutcomeMetric(actions, setup.startedAt) ?? undefined
      : setup.product === 'production'
        ? buildPlantGuidedShiftCloseOutcomeMetric(currentPlantShiftClose ? [currentPlantShiftClose] : [], setup.startedAt) ?? undefined
        : undefined
    : undefined
  const { metric: pilotOutcomeMetric, report: pilotOutcomeReport, refresh: refreshPilotOutcome } = useLocalPilotOutcome(pilotOutcomeSetup, guidedOutcomeMetric)
  const [commerce] = useCommerceWorkspace()
  const [approvals, setApprovals] = useApprovalWorkspace()
  const [teamWorkspace] = useTeamWorkspace()
  const [notice, setNotice] = useState('')
  const [resetArmed, setResetArmed] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const [restorePoint, setRestorePoint] = useState<LocalWorkspaceBackup | null>(loadLocalWorkspaceRestorePoint)
  const [restorePointLabel, setRestorePointLabel] = useState(() => loadLocalWorkspaceRestorePoint() ? 'Saved on this device' : '')
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [restoreNotice, setRestoreNotice] = useState('')
  const [settingsStep, setSettingsStep] = useState<'workflow' | 'success'>('workflow')
  const [managedIdentity, setManagedIdentity] = useManagedIdentity(runtime.status === 'enterprise')
  const [managedEmail, setManagedEmail] = useState('')
  const [managedPassword, setManagedPassword] = useState('')
  const [managedWorkspace, setManagedWorkspace] = useState('')
  const [managedWorkspaceSignIn, setManagedWorkspaceSignIn] = useState<ManagedWorkspaceSignIn | null>(null)
  const [managedNotice, setManagedNotice] = useState('')
  const [managedBusy, setManagedBusy] = useState(false)
  const [managedPilotBrief, setManagedPilotBrief] = useState<ManagedCompanyBrief | null>(null)
  const [managedPilotCommandId, setManagedPilotCommandId] = useState('')
  const [managedPilotRetained, setManagedPilotRetained] = useState(false)
  const [managedPilotNotice, setManagedPilotNotice] = useState('')
  const [managedPilotBusy, setManagedPilotBusy] = useState(false)
  const [aiContextExportApproval, setAiContextExportApproval] = useState<{ key: string; reviewedAt: string } | null>(null)
  const managedPilotRequestRef = useRef(0)
  const demoLaunchActionRef = useRef<HTMLAnchorElement>(null)
  const demoLaunchHandoffPendingRef = useRef(false)
  const [demoWorkspaceSource, setDemoWorkspace] = useState<ClientDemoWorkspace | null>(loadClientDemoWorkspace)
  const demoWorkspace = useMemo(() => restoreClientDemoWorkspace(demoWorkspaceSource), [demoWorkspaceSource])
  const [demoPresetId, setDemoPresetId] = useState<ClientDemoPresetId>(() => demoWorkspace?.blueprint.client.presetId ?? 'social-seller')
  const [shopIndustryPackId, setShopIndustryPackId] = useState<ShopIndustryPackId>(() => demoWorkspace?.blueprint.client.shopIndustryPackId ?? readLocalShopIndustryPackId())
  const [plantIndustryPackId, setPlantIndustryPackId] = useState<PlantIndustryPackId>(() => demoWorkspace?.blueprint.client.plantIndustryPackId ?? readPlantIndustryPackId(typeof window === 'undefined' ? undefined : window.localStorage))
  const [demoSelections, setDemoSelections] = useState<Partial<Record<SetupProductId, string>>>(() => Object.fromEntries((demoWorkspace?.blueprint.products ?? clientDemoPresets[0].selections).map((selection) => [selection.product, selection.templateId])))
  const [demoBlueprintSource, setDemoBlueprint] = useState<ClientDemoBlueprint | null>(() => demoWorkspace?.blueprint ?? null)
  const demoKitReadiness = useMemo(() => demoBlueprintSource ? clientDemoKitReadiness(demoBlueprintSource, new Date().toISOString()) : null, [demoBlueprintSource])
  const demoBlueprint = demoKitReadiness?.kit?.blueprint ?? null
  const demoRecoveryNeeded = Boolean((demoWorkspaceSource || demoBlueprintSource) && (!demoWorkspace || !demoBlueprint))
  const [demoDataSetupOpen, setDemoDataSetupOpen] = useState(false)
  const [preparedArtifact, setPreparedArtifact] = useState<ClientDemoPreparationArtifact | null>(null)
  const [preparingClientFiles, setPreparingClientFiles] = useState(false)
  const [preparedConfirmation, setPreparedConfirmation] = useState('')
  const [preparedBusyProduct, setPreparedBusyProduct] = useState<SetupProductId | null>(null)
  const [preparedInstallStep, setPreparedInstallStep] = useState('')
  const [preparedNotice, setPreparedNotice] = useState('')
  const [preparedBlockedProduct, setPreparedBlockedProduct] = useState<SetupProductId | null>(null)
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

  useEffect(() => {
    if (!setup.savedAt || !managedIdentity) {
      managedPilotRequestRef.current += 1
      return undefined
    }

    const refresh = () => {
      const requestId = managedPilotRequestRef.current + 1
      managedPilotRequestRef.current = requestId
      Promise.resolve().then(() => {
        if (managedPilotRequestRef.current !== requestId) return
        setManagedPilotBusy(true)
        setManagedPilotNotice('Verifying approved company context...')
      })
      loadManagedCompanyBrief('attention', managedIdentity)
        .then((brief) => {
          if (managedPilotRequestRef.current !== requestId) return
          setManagedPilotBrief(brief)
          setManagedPilotCommandId(settingsCommandUuid())
          setManagedPilotRetained(brief.retention === 'persisted_managed_audit')
          setManagedPilotNotice(`${brief.sourceCount} company source${brief.sourceCount === 1 ? '' : 's'} verified for this company.`)
        })
        .catch((error) => {
          if (managedPilotRequestRef.current !== requestId) return
          setManagedPilotBrief(null)
          setManagedPilotCommandId('')
          setManagedPilotRetained(false)
          setManagedPilotNotice(error instanceof Error ? error.message : 'Managed company context is not ready.')
        })
        .finally(() => {
          if (managedPilotRequestRef.current === requestId) setManagedPilotBusy(false)
        })
    }
    refresh()
    const interval = window.setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      managedPilotRequestRef.current += 1
    }
  }, [managedIdentity, setup.savedAt])
  const completion = pilotProgress(setup)
  const isPilotReady = pilotReady(setup)
  const selectedDemoEntries = Object.entries(demoSelections).filter((entry): entry is [SetupProductId, string] => Boolean(entry[1]))
  const selectedDemoPreset = clientDemoPresets.find((preset) => preset.id === demoPresetId) ?? clientDemoPresets[0]
  const selectedShopIndustryPack = shopIndustryPack(shopIndustryPackId)
  const selectedPlantIndustryPack = plantIndustryPack(plantIndustryPackId)
  const selectedDemoProductNames = selectedDemoEntries.map(([product]) => productDisplayName(product))
  const selectedDemoProductSummary = selectedDemoProductNames.length ? selectedDemoProductNames.join(' · ') : 'Choose at least one'
  const demoInputReady = Boolean(setup.workspace.trim() && setup.owner.trim() && selectedDemoEntries.length)
  const workflowReady = Boolean(demoWorkspace)
  const workflowCompletion = Math.round(([setup.workspace.trim(), setup.owner.trim(), selectedDemoEntries.length ? 'products' : '', demoWorkspace ? 'created' : ''].filter(Boolean).length / 4) * 100)
  const displayedCompletion = settingsStep === 'workflow' ? workflowCompletion : completion
  const displayedReady = settingsStep === 'workflow' ? workflowReady : isPilotReady
  const selectedProduct = productContracts[setup.product]
  const selectedTemplate = templateFor(setup.product, setup.templateId)
  const launchPackRows: Array<readonly [string, string, string]> = setup.product === 'commerce'
    ? [
      ['Bring', 'Product CSV, stock count, payment proof', 'Start from products, on-hand units, prices, and recent payment exceptions.'],
      ['AI prepares', 'Catalog, reorder, order, accounting packets', 'SuperMega maps SKU data, ranks stock risk, drafts Shop work, and keeps receipts reviewable.'],
      ['First proof', 'One clean sale or stock review', 'Show the owner a reviewed queue before any stock, supplier, refund, or ledger write.'],
      ['Gate', 'Owner approves writes', 'No sale, payment, supplier message, stock move, or accounting export runs from setup.'],
    ]
    : setup.product === 'production'
      ? [
        ['Bring', 'Job CSV, material list, quality holds', 'Start from planned work, BOM/material needs, WCM/maintenance issues, and ISO evidence.'],
        ['AI prepares', 'MES queue, MRP check, ISO handoff', 'SuperMega ranks jobs, blockers, material proof, quality release, and cost-readiness.'],
        ['First proof', 'One accountable shift close', 'Show output, same-shift material trace, clear quality/WCM gates, and a revision-bound owner close.'],
        ['Gate', 'Owner approves production', 'No equipment command, material issue, quality release, costing, or production write runs from setup.'],
      ]
      : setup.product === 'website'
        ? [
          ['Bring', 'Facts, offers, proof, photos, links', 'Start from the buyer proof needed to generate a useful website package.'],
          ['AI prepares', 'Pages, copy, CTAs, SEO, release checklist', 'SuperMega creates a reviewable static package and rollout plan without touching DNS.'],
          ['First proof', 'One reviewed site package', 'Show the owner a package with contact route, claims, proof, and publish blockers.'],
          ['Gate', 'Owner approves launch', 'No domain, form send, analytics install, CRM write, or publish action runs from setup.'],
        ]
        : [
          ['Bring', 'Catalog rows, order CSV, channel samples', 'Start from products plus Viber, LINE, WeChat, email, form, or CSV order examples.'],
          ['AI prepares', 'Store, quote, order review, Shop review', 'SuperMega normalizes customer, SKU, quantity, fulfilment, payment, and source proof.'],
          ['First proof', 'One Shop-ready order packet', 'Show ready/blocked order rows and owner review before customer contact or fulfilment.'],
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
  const demoBlueprintFilename = `supermega-client-demo-${setup.workspace.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || evidenceDate}.json`
  const demoBlueprintHref = demoKitReadiness?.ready ? `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(demoKitReadiness.kit, null, 2))}` : ''
  const clientCsvStarterPack = useMemo(() => demoBlueprint ? buildClientCsvStarterPack(demoBlueprint) : null, [demoBlueprint])
  const clientCsvStarterPackDownloadHref = useMemo(() => clientCsvStarterPack ? clientCsvStarterPackHref(clientCsvStarterPack) : '', [clientCsvStarterPack])
  const capabilityPlan = demoBlueprint && demoKitReadiness?.kit
    ? buildClientCapabilityPlan(demoBlueprint, demoKitReadiness.kit.exportedAt)
    : null
  const capabilityPlanFilename = `supermega-capability-plan-${setup.workspace.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || evidenceDate}.json`
  const capabilityPlanHref = capabilityPlan ? `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(capabilityPlan, null, 2))}` : ''
  const demoReadyCount = demoWorkspace?.products.filter((product) => ['data_ready', 'workspace_checked', 'applied'].includes(product.status)).length ?? 0
  const preparedApprovalReady = Boolean(preparedArtifact && clientDemoPreparationConfirmationMatches(preparedArtifact, preparedConfirmation))
  const preparedAppliedProducts = new Set(demoWorkspace?.products.filter((product) => product.status === 'applied').map((product) => product.product) ?? [])
  const preparedRemainingCount = preparedArtifact?.products.filter((product) => !preparedAppliedProducts.has(product.product)).length ?? 0
  const preparedBlockedEntry = preparedBlockedProduct
    ? preparedArtifact?.products.find((product) => product.product === preparedBlockedProduct) ?? null
    : null
  const accountableShopSaleTimes = commerce.orders.flatMap((order) => {
    const completedAt = order.status === 'completed' ? order.completion?.capturedAt : null
    const reconciledAt = order.paymentStatus === 'reconciled' ? order.paymentReconciledAt : null
    if (!completedAt || !reconciledAt || !Number.isFinite(Date.parse(completedAt)) || !Number.isFinite(Date.parse(reconciledAt))) return []
    return [Date.parse(completedAt) < Date.parse(reconciledAt) ? completedAt : reconciledAt]
  })
  const releasedPlantBatchProofTimes = (() => {
    try {
      return productionOrderPortfolioEntries(production).flatMap((entry) => {
        const projection = projectPlantOrder(entry.execution)
        return projection.status === 'released_to_stock' && projection.batchRelease ? [projection.batchRelease.proof.capturedAt] : []
      })
    } catch { return [] }
  })()
  const currentWebsitePublish = (() => {
    const loaded = loadWebsiteWorkspace(window.localStorage)
    return loaded.ok ? getCurrentPublish(loaded.workspace) : null
  })()
  const ecommerceDemoEvidence = useMemo(() => {
    const localEcommerceStorefront = managedIdentity ? null : readStorefrontDraft(LOCAL_STOREFRONT_DRAFT_SCOPE)
    const currentEcommerceStorefrontAt = managedIdentity
      ? commerce.storefrontConfiguration?.saved.capturedAt ?? null
      : localEcommerceStorefront?.status === 'ready'
        ? localEcommerceStorefront.draft?.savedAt ?? null
        : null
    const reviewedEcommerceOrders = commerce.orders.filter((order) => order.sourceRecordId?.startsWith('ECR-'))
    return {
      savedStorefronts: currentEcommerceStorefrontAt ? 1 : 0,
      reviewedRequests: reviewedEcommerceOrders.length,
      latestSavedStorefrontAt: currentEcommerceStorefrontAt,
      latestReviewedRequestAt: latestIsoTimestamp(reviewedEcommerceOrders.map((order) => order.createdAt)),
    }
  }, [commerce, managedIdentity])
  const demoRunbook = demoWorkspace ? buildClientDemoRunbook(demoWorkspace, {
    commerce: {
      completedOrders: commerce.orders.filter((order) => order.status === 'completed').length,
      reconciledOrders: commerce.orders.filter((order) => order.paymentStatus === 'reconciled').length,
      latestAccountableSaleAt: latestIsoTimestamp(accountableShopSaleTimes),
    },
    production: {
      releasedBatches: releasedPlantBatchProofTimes.length,
      latestReleasedAt: latestIsoTimestamp(releasedPlantBatchProofTimes),
    },
    website: {
      approvedReleases: currentWebsitePublish ? 1 : 0,
      latestApprovedAt: currentWebsitePublish?.recordedAt ?? null,
    },
    ecommerce: ecommerceDemoEvidence,
  }) : null
  const nextDemoMission = demoRunbook?.products.find((product) => product.product === demoRunbook.nextProduct) ?? null
  const demoLaunchPath = nextDemoMission?.startPath ?? demoRunbook?.products[0]?.startPath ?? '/'
  const managedTrialRequestFilename = `supermega-managed-trial-request-${evidenceDate}.json`
  const managedApprovalRequests = approvals.map(toManagedApprovalRequest).filter((request): request is NonNullable<typeof request> => Boolean(request))
  const reviewedDecisionCount = approvals.filter((approval) => (
    (approval.status === 'approved' || approval.status === 'declined')
    && approval.decidedActorKind === 'human'
    && Boolean(approval.decidedBy?.trim())
    && Boolean(approval.decisionNote?.trim())
  )).length
  const localProductRecords = collectLocalProductRecords(window.localStorage)
  const localWorkspaceBackup = collectLocalWorkspaceBackup(window.localStorage)
  const localRecordCount = Object.keys(localProductRecords).length
  const localProductRecordKeys = Object.keys(localProductRecords)
  const websiteLocalRecordCount = localProductRecordKeys.filter((key) => key === WEBSITE_STORAGE_KEY || key === LEGACY_WEBSITE_STORAGE_KEY || key.startsWith('supermega.website.workspace.recovery.v1.')).length
  const ecommerceLocalRecordCount = localProductRecordKeys.filter((key) => key === WEBSITE_ECOMMERCE_HANDOFF_KEY || key.startsWith(STOREFRONT_DRAFT_RESET_PREFIX) || key.startsWith(LEGACY_STOREFRONT_DRAFT_RESET_PREFIX)).length
  const selectedProductRecordCount = setup.product === 'commerce'
    ? commerce.items.length + commerce.orders.length + (commerce.purchaseOrders?.length ?? 0)
    : setup.product === 'production'
      ? production.jobs.length + production.machines.length + production.issues.length + production.events.length
      : setup.product === 'website'
        ? websiteLocalRecordCount
        : ecommerceLocalRecordCount
  const preparedRecordCount = Math.max(localRecordCount, selectedProductRecordCount)
  const behaviorTrail = readBehaviorTrail(window.localStorage)
  const behaviorSignalCount = behaviorTrail.length
  const agentBehaviorSignals = behaviorTrail.filter((entry) => entry.event === 'agent_job_seen' || entry.event === 'agent_job_chosen')
  const behaviorPreference = summarizeBehaviorPreferences(behaviorTrail)
  const productActivationFunnel = summarizeProductActivationFunnel(behaviorTrail, setup.product)
  const productFirstValue = summarizeProductFirstValue(behaviorTrail, setup.product)
  const firstValueElapsed = productFirstValue.elapsedSeconds == null
    ? null
    : productFirstValue.elapsedSeconds < 60
      ? `${productFirstValue.elapsedSeconds}s`
      : `${Math.ceil(productFirstValue.elapsedSeconds / 60)}m`
  const agentProductName = (product: string) => (
    product === 'commerce'
    || product === 'production'
    || product === 'website'
    || product === 'ecommerce'
      ? productDisplayName(product)
      : productDisplayName(setup.product)
  )
  const topAgentJob = behaviorPreference.preferred
  const lastChosenAgentJob = behaviorPreference.latest
  const productActivationRows = [
    ['First value', productFirstValue.status === 'completed' ? 'Complete' : productFirstValue.status === 'in_progress' ? 'In progress' : 'Not started', productFirstValue.status === 'completed'
      ? `${productFirstValue.detail ?? 'A useful product workflow was completed.'}${firstValueElapsed ? ` First value took ${firstValueElapsed} in this browser.` : ''}`
      : productFirstValue.status === 'in_progress'
        ? 'The product journey started. Complete its guided first workflow to prove useful value.'
        : 'Open onboarding or the product sample, then complete its guided first workflow to begin.'],
    ['Next steps', productActivationFunnel.nextStepsOpened ? `${productActivationFunnel.nextStepsOpened} opened` : 'Not opened', 'The user opened this product\'s optional next-step panel.'],
    ['Own data', productActivationFunnel.dataSetupsOpened ? `${productActivationFunnel.dataSetupsOpened} started` : 'Not started', 'The user opened local CSV or sample-data setup for this product.'],
    ['Product request', productActivationFunnel.productRequests ? `${productActivationFunnel.productRequests} intent` : 'No intent yet', 'The user chose the product-specific setup handoff. No message was sent by this scorecard.'],
    ['Next move', productActivationFunnel.nextAction, `${productActivationFunnel.completionPercent}% of the local activation journey observed in this browser.`],
  ] as const
  const learningRows = [
    ['Data', preparedRecordCount ? `${preparedRecordCount} records` : 'Import'],
    ['Trust', `${runtime.coverageScore}%`],
    ['Review', `${approvals.length} packets`],
    ['Behavior', behaviorSignalCount ? `${behaviorSignalCount} signals` : 'Local only'],
  ] as const
  const learningPlanRows = [
    ['Source graph', preparedRecordCount ? `${preparedRecordCount} local records prepared` : 'No local records yet', preparedRecordCount ? 'Exported evidence keeps the browser-local source package for managed validation.' : 'Use Shop, Plant, Website, Ecommerce, or import setup to create the first record.'],
    ['Behavior trail', behaviorSignalCount ? `${behaviorSignalCount} local signals` : 'No local signals yet', behaviorSignalCount ? 'Premium can rank next actions from reviewed workspace behavior after import.' : 'Open Shop, Plant, Website, Ecommerce, or setup so the system can capture local activity history.'],
    ['Decision memory', reviewedDecisionCount ? `${reviewedDecisionCount} reviewed decisions` : 'No reviewed decisions yet', reviewedDecisionCount ? 'Named human decisions can become reusable context after managed activation.' : 'Approve or decline at least one prepared decision before relying on AI context.'],
    ['Pilot outcome', pilotOutcomeReport?.review ? `${pilotOutcomeReport.outcomeStatus} / owner accepted` : 'No accepted outcome yet', pilotOutcomeReport?.review ? 'The measured aggregate result is bound to a named-owner acceptance.' : 'Start from validated product data, run one workflow, and accept a clear or improved result.'],
    ['Owner gate', isPilotReady ? 'Ready for managed review' : `${completion}% trial evidence`, isPilotReady ? 'Export evidence, then request managed trial; writes stay locked until server controls pass.' : 'Complete baseline, target, authority boundary, and acceptance evidence first.'],
  ] as const
  const agentPlanRows = [
    ['Product helper', `${selectedProduct.name} operator`, `Prepares ${selectedTemplate.name.toLowerCase()} from approved sources.`],
    ['First job', selectedTemplate.workflow[0] ?? selectedTemplate.outcome, selectedTemplate.outcome],
    ['Tool boundary', runtime.writesReady ? 'Write gate ready' : 'Writes locked', 'Drafts, imports, messages, publishes, payments, and production changes wait for human approval.'],
    ['Learning loop', preparedRecordCount || actions.length || behaviorSignalCount ? `${preparedRecordCount + actions.length + behaviorSignalCount} signals` : 'No signals yet', 'Premium learns only from exported records, local behavior, accountable actions, and reviewed decisions.'],
  ] as const
  const evidencePlanReady = runtime.evidencePlan.length > 0 && runtime.evidencePlan.every((item) => item.ready)
  const aiContextQualityRows = [
    ['Source data', preparedRecordCount ? `${preparedRecordCount} prepared` : 'Need records', preparedRecordCount ? 'Local product records are ready for managed validation.' : 'Import or use a product workspace before premium learning.'],
    ['Behavior', agentBehaviorSignals.length ? `${agentBehaviorSignals.length} signals` : 'Need usage', agentBehaviorSignals.length ? 'Next-step views and choices can teach ranking after approval.' : 'Open a product and choose recommended next steps to create behavior memory.'],
    ['Decisions', reviewedDecisionCount ? `${reviewedDecisionCount} reviewed` : 'Need review', reviewedDecisionCount ? 'Named human decisions can become reusable context.' : 'Record at least one approval or decline before learning from decisions.'],
    ['Controls', runtime.writesReady && evidencePlanReady ? 'Ready' : 'Locked', runtime.writesReady && evidencePlanReady ? 'Managed writes and evidence gates are ready.' : 'Managed activation gates must pass before AI can learn from customer data.'],
    ['Next handoff', preparedRecordCount && agentBehaviorSignals.length && reviewedDecisionCount ? 'Export context' : 'Collect proof', 'Export stays browser-local until the owner requests managed activation.'],
  ] as const
  const aiProductSourceRows = [
    ['Shop', commerce.items.length || commerce.orders.length ? `${commerce.items.length} SKU / ${commerce.orders.length} orders` : 'Need Shop use', 'Premium can learn stock, order, payment, purchase, and counter patterns after managed import.'],
    ['Plant', production.jobs.length || production.events.length ? `${production.jobs.length} jobs / ${production.events.length} events` : 'Need Plant use', 'Premium can learn MES, quality, WCM, trace, and handoff patterns after managed import.'],
    ['Website', websiteLocalRecordCount ? `${websiteLocalRecordCount} local records` : 'Need website save', 'Premium can learn content, lead capture, approval, package, and rollout readiness after managed import.'],
    ['Ecommerce', ecommerceLocalRecordCount ? `${ecommerceLocalRecordCount} handoff records` : 'Need store handoff', 'Premium can learn catalog, storefront, order review, and Shop queue handoff after managed import.'],
    ['Behavior', agentBehaviorSignals.length ? `${agentBehaviorSignals.length} choice signals` : 'Need usage', 'Premium ranks next actions only from exported local choices and approved decisions.'],
  ] as const
  const aiProductSourceMap = {
    contract: 'supermega.ai_product_source_map.v1',
    version: 1,
    createdAt: new Date().toISOString(),
    evidenceVersion: 24,
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
    decisionPackets: reviewedDecisionCount,
    allowedUses: ['summarize_product_sources', 'rank_product_next_actions', 'prepare_import_mapping', 'draft_operator_recommendations'],
    forbiddenActions: ['customer_message_send', 'payment_capture', 'stock_move', 'production_write', 'domain_publish', 'crm_write', 'model_training_without_owner_approval'],
    activationRequired: true,
  }
  const selectedProductSource = aiProductSourceMap.products.find((product) => product.product === selectedProduct.name)
  const contextHandoffReady = preparedRecordCount > 0 && agentBehaviorSignals.length > 0 && reviewedDecisionCount > 0
  const managedContextProduct = setup.product === 'commerce' ? 'shop' : setup.product === 'production' ? 'plant' : setup.product
  const managedContextPackage = contextHandoffReady
    ? buildManagedContextProfileRequest({
        product: managedContextProduct,
        templateId: selectedTemplate.id,
        selectedProductRecords: preparedRecordCount,
        behaviorSignals: agentBehaviorSignals.length,
        reviewedDecisions: reviewedDecisionCount,
        behaviorPreference,
      })
    : null
  const acceptedAiContextOutcome = pilotOutcomeReport?.review
    && pilotOutcomeReport.review.reviewedBy === setup.owner
    && (pilotOutcomeReport.outcomeStatus === 'target_met' || pilotOutcomeReport.outcomeStatus === 'improved')
    ? {
        status: pilotOutcomeReport.outcomeStatus,
        digest: pilotOutcomeReport.reportDigest,
      }
    : null
  const aiContextExportApprovalKey = managedContextPackage && acceptedAiContextOutcome
    ? JSON.stringify([
        managedContextPackage.product,
        managedContextPackage.templateId,
        managedContextPackage.sourceCounts,
        managedContextPackage.behaviorPreference,
        acceptedAiContextOutcome,
        setup.owner,
      ])
    : ''
  const aiContextExportApproved = Boolean(
    aiContextExportApprovalKey
    && aiContextExportApproval?.key === aiContextExportApprovalKey,
  )
  const approvedAiContextExport = aiContextExportApproved && aiContextExportApproval && acceptedAiContextOutcome
    ? buildManagedAiContextExport({
        product: managedContextProduct,
        templateId: selectedTemplate.id,
        selectedProductRecords: preparedRecordCount,
        behaviorSignals: agentBehaviorSignals.length,
        reviewedDecisions: reviewedDecisionCount,
        behaviorPreference,
        outcomeStatus: acceptedAiContextOutcome.status,
        outcomeDigest: acceptedAiContextOutcome.digest,
        reviewedBy: setup.owner,
        reviewedAt: aiContextExportApproval.reviewedAt,
      })
    : null
  const approvedAiContextExportFilename = `supermega-approved-ai-context-${evidenceDate}.json`
  const approvedAiContextExportHref = approvedAiContextExport
    ? `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(approvedAiContextExport, null, 2))}`
    : ''
  const contextHandoffManifest = {
    contract: 'supermega.ai_context_handoff.v1',
    version: 1,
    createdAt: new Date().toISOString(),
    evidenceVersion: 24,
    product: selectedProduct.name,
    productSlug: selectedProduct.slug,
    templateId: selectedTemplate.id,
    templateName: selectedTemplate.name,
    workspace: setup.workspace || 'Workspace not named',
    owner: setup.owner || 'Owner not assigned',
    sourceCounts: {
      localRecords: preparedRecordCount,
      storagePackages: localRecordCount,
      selectedProductRecords: selectedProductRecordCount,
      behaviorSignals: agentBehaviorSignals.length,
      approvalPackets: reviewedDecisionCount,
      accountableActions: actions.length,
    },
    productSourceMap: aiProductSourceMap,
    behaviorPreference,
    allowedUses: ['rank_next_actions', 'draft_internal_recommendations', 'prepare_import_mapping', 'summarize_workspace_evidence'],
    forbiddenActions: ['customer_message_send', 'payment_capture', 'domain_deploy', 'production_write', 'training_without_owner_approval'],
    activationRequired: !runtime.writesReady || !evidencePlanReady,
    nextAction: contextHandoffReady ? (runtime.writesReady && evidencePlanReady ? 'Ready for managed import review.' : 'Request managed activation with this context package.') : 'Collect records, behavior, and reviewed decisions before premium activation.',
  }
  const contextHandoffRows = [
    ['Package', `${preparedRecordCount} records / ${agentBehaviorSignals.length} signals`, contextHandoffReady ? 'Enough context exists for a support review.' : 'Use the product and review at least one decision first.'],
    ['Allowed use', 'Draft and rank only', 'AI may summarize, map imports, and recommend next actions after import.'],
    ['Forbidden', 'No send/write/train', 'Customer messages, payments, publishing, production writes, and model training stay blocked.'],
    ['Activation', contextHandoffManifest.activationRequired ? 'Required' : 'Ready', contextHandoffManifest.activationRequired ? 'Managed controls must pass before premium learns from customer data.' : 'Managed evidence gates are ready for import review.'],
    ['Owner action', contextHandoffReady ? 'Export context' : 'Collect proof', contextHandoffManifest.nextAction],
  ] as const
  const aiContextReadinessGates = [
    ['Records', preparedRecordCount > 0, preparedRecordCount ? `${preparedRecordCount} local records prepared.` : 'Use or import one product workspace first.'],
    ['Behavior', agentBehaviorSignals.length > 0, agentBehaviorSignals.length ? `${agentBehaviorSignals.length} next-step signals captured.` : 'Open a product and choose a recommended action.'],
    ['Decisions', reviewedDecisionCount > 0, reviewedDecisionCount ? `${reviewedDecisionCount} named human decision${reviewedDecisionCount === 1 ? '' : 's'} ready.` : 'Record one approval or decline before premium learns from decisions.'],
    ['Controls', runtime.writesReady && evidencePlanReady, runtime.writesReady && evidencePlanReady ? 'Managed evidence gates are ready.' : 'Managed Postgres, identity, audit, and write gates remain locked.'],
    ['Products', aiProductSourceMap.products.some((product) => product.prepared), aiProductSourceMap.products.some((product) => product.prepared) ? 'At least one product has a usable source package.' : 'Create Shop, Plant, Website, or Ecommerce evidence.'],
    ['Owner setup', Boolean(setup.savedAt), setup.savedAt ? 'Trial plan is saved for handoff.' : 'Save the trial plan before requesting managed activation.'],
    ['Outcome', Boolean(pilotOutcomeReport?.review), pilotOutcomeReport?.review ? `${pilotOutcomeReport.outcomeStatus} result accepted by ${pilotOutcomeReport.review.reviewedBy}.` : 'Accept one measured product outcome before managed activation.'],
  ] as const
  const aiContextReadyGateCount = aiContextReadinessGates.filter(([, ready]) => ready).length
  const aiContextReadinessScore = Math.round((aiContextReadyGateCount / aiContextReadinessGates.length) * 100)
  const aiContextNextMove = !preparedRecordCount
    ? 'Create or import product records'
    : !agentBehaviorSignals.length
      ? 'Use product next steps'
      : !reviewedDecisionCount
        ? 'Record owner decision'
      : !setup.savedAt
          ? 'Save trial plan'
          : !pilotOutcomeReport?.review
            ? 'Prove one product outcome'
          : !runtime.writesReady || !evidencePlanReady
            ? 'Request managed activation'
            : 'Export context for review'
  const aiContextReadinessScoreRows = [
    ['Score', `${aiContextReadinessScore}%`, `${aiContextReadyGateCount}/${aiContextReadinessGates.length} gates ready for premium context review.`],
    ['Next move', aiContextNextMove, 'Follow this before asking premium AI to learn from customer data.'],
    ['Records', preparedRecordCount ? `${preparedRecordCount} prepared` : 'Need records', aiContextReadinessGates[0][2]],
    ['Behavior', agentBehaviorSignals.length ? `${agentBehaviorSignals.length} signals` : 'Need usage', aiContextReadinessGates[1][2]],
    ['Controls', runtime.writesReady && evidencePlanReady ? 'Ready' : 'Locked', aiContextReadinessGates[3][2]],
  ] as const
  const provisioningReady = isPilotReady && preparedRecordCount > 0 && reviewedDecisionCount > 0 && Boolean(pilotOutcomeReport?.review)
  const measuredManagedTrialProofReady = reviewedDecisionCount > 0
    && Boolean(pilotOutcomeReport?.review)
    && Boolean(pilotOutcomeReport?.reportDigest)
    && (pilotOutcomeReport?.outcomeStatus === 'target_met' || pilotOutcomeReport?.outcomeStatus === 'improved')
  const managedTrialProofReady = measuredManagedTrialProofReady && Boolean(approvedAiContextExport)
  const managedTrialProofActionLabel = measuredManagedTrialProofReady && !approvedAiContextExport
    ? 'Approve AI context'
    : pilotOutcomeReport?.review && !reviewedDecisionCount
    ? 'Review one owner decision'
    : pilotOutcomeReport
      ? 'Finish proof run'
      : 'Start proof run'
  const managedTrialProofActionPath = measuredManagedTrialProofReady && !approvedAiContextExport
    ? '#approved-ai-context'
    : pilotOutcomeReport?.review && !reviewedDecisionCount
    ? setupProductPreviewPath(setup.product)
    : '#pilot-outcome-proof'
  const managedWorkspaceProvisioningPacket = {
    contract: 'supermega.managed_workspace_provisioning.v1',
    version: 1,
    createdAt: new Date().toISOString(),
    evidenceVersion: 24,
    workspace: setup.workspace || 'Workspace not named',
    owner: setup.owner || 'Owner not assigned',
    product: selectedProduct.name,
    template: selectedTemplate.name,
    tenantMode: runtime.status === 'enterprise' ? 'managed_ready' : 'managed_required',
    dataPackage: {
      evidenceFilename,
      localRecords: preparedRecordCount,
      storagePackages: localRecordCount,
      selectedProductRecords: selectedProductRecordCount,
      productSources: Object.keys(localProductRecords),
      approvalPackets: reviewedDecisionCount,
      behaviorSignals: agentBehaviorSignals.length,
      pilotOutcomeDigest: pilotOutcomeReport?.review ? pilotOutcomeReport.reportDigest : null,
    },
    requiredControls: ['dedicated_postgres_rls', 'trusted_identity_gateway', 'private_storage', 'audit_trail', 'owner_write_approvals', 'scheduler_budget_limits'],
    firstSafeActivation: provisioningReady ? 'Create managed tenant from exported evidence after activation gates pass.' : 'Finish trial evidence, local records, owner-reviewed decisions, and one accepted product outcome before provisioning.',
    forbiddenUntilProvisioned: ['copy_browser_storage_to_production', 'enable_hosted_scheduler', 'send_customer_messages', 'capture_payments', 'publish_domains'],
  }
  const importProvisioningRows = runtime.importProvisioning?.checks.length
    ? runtime.importProvisioning.checks.map((check) => [check.label, check.ready ? 'Ready' : 'Blocked', check.action] as const)
    : [
      ['Managed identity', runtime.authReady ? 'Ready' : 'Blocked', 'Verify trusted gateway or Supabase named-user identity before import approval.'] as const,
      ['Private workspace schema', runtime.enterpriseDbReady ? 'Ready' : 'Blocked', 'Apply the private trial schema with a non-BYPASSRLS runtime role.'] as const,
      ['Zero-write validation', runtime.auditReady ? 'Ready' : 'Blocked', 'Run the managed import validation endpoint and prove external_writes_performed is false.'] as const,
      ['Owner approval', reviewedDecisionCount ? 'Ready' : 'Blocked', 'Capture a named owner approval before any import apply request.'] as const,
      ['Atomic adapter', runtime.writesReady ? 'Ready' : 'Blocked', 'Confirm the product adapter can create one idempotent managed revision.'] as const,
      ['Durable revision', runtime.writesReady ? 'Ready' : 'Blocked', 'Read back workspace state after apply and compare the revision digest.'] as const,
    ]
  const importProvisioningPacket = {
    contract: runtime.importProvisioning?.contract ?? 'supermega.import_provisioning_readiness.v1',
    evidenceVersion: 24,
    status: runtime.importProvisioning?.status ?? 'blocked',
    ready: runtime.importProvisioning?.ready === true,
    checks: runtime.importProvisioning?.checks ?? [],
    forbiddenUntilReady: runtime.importProvisioning?.forbidden_until_ready ?? ['copy_browser_storage_to_production', 'customer_message_send', 'payment_capture', 'domain_publish', 'scheduler_autopilot'],
    nextAction: runtime.importProvisioning?.next_action ?? 'Validate a staged client import package inside a company account before any activation write.',
    secretValuesExposed: false,
  }
  const provisioningRows = [
    ['Tenant', managedWorkspaceProvisioningPacket.tenantMode === 'managed_ready' ? 'Ready' : 'Required', runtime.requirements[0] ?? 'Managed controls must be verified before customer data import.'],
    ['Data package', `${preparedRecordCount} records`, preparedRecordCount ? 'Exported evidence can seed a reviewed company account.' : 'Import or use a product demo before provisioning.'],
    ['Roles', reviewedDecisionCount ? `${reviewedDecisionCount} reviewed` : 'Need owner review', 'Named owner decisions define who can approve writes after activation.'],
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
    evidenceVersion: 24,
    pilotReady: isPilotReady && Boolean(pilotOutcomeReport?.review),
    localRecords: preparedRecordCount,
    storagePackages: localRecordCount,
    selectedProductRecords: selectedProductRecordCount,
    approvalPackets: reviewedDecisionCount,
    behaviorSignals: agentBehaviorSignals.length,
    behaviorPreference,
    launchPackManifest,
    productSourceMap: aiProductSourceMap,
    contextHandoffManifest,
    managedWorkspaceProvisioningPacket,
    importProvisioningPacket,
    activationManifest: runtime.activationManifest,
    importProvisioning: runtime.importProvisioning,
    schedulerActivation,
    pilotOutcomeReport,
    approvedAiContext: approvedAiContextExport,
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
    ['Pilot outcome', pilotOutcomeReport?.review ? `${pilotOutcomeReport.outcomeStatus} / owner accepted` : pilotOutcomeReport ? `${pilotOutcomeReport.outcomeStatus} / review needed` : 'Start outcome proof'],
    ['AI context', approvedAiContextExport ? `Approved summary / ${approvedAiContextExport.contextDigest}` : 'Approval required'],
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
  const aiMemorySourceRecordCount = preparedRecordCount
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
      ? 'Use product next steps'
      : !reviewedDecisionCount
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
      localProductRecords: preparedRecordCount,
      storagePackages: localRecordCount,
      summarizedRecords: aiMemorySourceRecordCount,
      selectedProductPrepared: selectedProductSource?.prepared === true,
      selectedProductRecordCounts: selectedProductSource?.records ?? {},
      accountableActions: actions.length,
      behaviorSignals: agentBehaviorSignals.length,
      decisionPackets: reviewedDecisionCount,
      acceptedPilotOutcome: pilotOutcomeReport?.review ? pilotOutcomeReport.reportDigest : null,
    },
    ownerBehavior: {
      contract: behaviorPreference.contract,
      preferred: behaviorPreference.preferred,
      latest: behaviorPreference.latest,
      topRecommendedJob: topAgentJob ? `${agentProductName(topAgentJob.product)}: ${topAgentJob.detail}` : null,
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
    ['Behavior', agentBehaviorSignals.length ? `${agentBehaviorSignals.length} signals` : 'No pattern yet', topAgentJob ? `${agentProductName(topAgentJob.product)}: ${topAgentJob.detail}` : 'Choose a recommended product action to start owner preference memory.'],
    ['Decisions', reviewedDecisionCount ? `${reviewedDecisionCount} reviewed` : 'Needs one review', 'Only named human approvals or declines can become reusable premium context.'],
    ['Readiness', `${aiMemoryReadinessScore}%`, aiMemoryNextMove],
  ] as const
  const aiMemoryHref = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(aiMemoryPreview, null, 2))}`
  const managedTrialPrefill = {
    company: setup.workspace,
    goal: [
      setup.currentRecord ? `Current: ${setup.currentRecord}` : '',
      setup.targetOutcome ? `Target: ${setup.targetOutcome}` : '',
    ].filter(Boolean).join('\n'),
    proof: buildManagedTrialProof({
      product: selectedProduct.slug,
      templateId: selectedTemplate.id,
      readinessScore: aiMemoryReadinessScore,
      sourceRecordCount: aiMemorySourceRecordCount,
      behaviorSignalCount: agentBehaviorSignals.length,
      reviewedDecisionCount,
      outcomeStatus: pilotOutcomeReport?.outcomeStatus ?? 'not_started',
      outcomeDigest: pilotOutcomeReport?.reportDigest ?? null,
      outcomeAccepted: Boolean(pilotOutcomeReport?.review),
    }),
    approvedContext: approvedAiContextExport ? {
      contract: approvedAiContextExport.contract,
      digest: approvedAiContextExport.contextDigest,
      outcomeDigest: approvedAiContextExport.outcome.digest,
      approved: true as const,
      rawRecordsIncluded: false as const,
    } : undefined,
  }
  const premiumPilotProofKept = managedPilotRetained || managedPilotBrief?.retention === 'persisted_managed_audit'
  const retainedOwnerProduct = managedPilotBrief?.ownerContext?.preferredProduct
  const operatingLearning = managedPilotBrief ? operatingChangeCopy(managedPilotBrief.operatingChange) : null
  const premiumPilotRows = [
    ['Owner pattern', retainedOwnerProduct ? `${managedContextProductLabel(retainedOwnerProduct)} retained` : topAgentJob ? `${agentProductName(topAgentJob.product)}: ${topAgentJob.detail}` : 'Not learned yet', retainedOwnerProduct ? 'Managed briefs may use this preference only after risk and evidence checks.' : topAgentJob ? `${topAgentJob.chosenCount} local choice${topAgentJob.chosenCount === 1 ? '' : 's'}.` : 'Choose a recommended product action to teach the next handoff.'],
    ['Company account', managedIdentity?.email ?? 'Not connected', managedIdentity ? 'Named-user access verified for this company.' : 'Your local trial remains usable without an account.'],
    ['Approved sources', managedPilotBrief ? `${managedPilotBrief.sourceCount} company` : preparedRecordCount ? `${preparedRecordCount} local prepared` : 'No source proof yet', managedPilotBrief ? 'Counts only; raw source records are not shown here.' : 'Open a company account to verify company-scoped sources.'],
    ['Learning checkpoint', premiumPilotProofKept ? 'Kept in audit' : managedPilotBrief ? 'Ready to keep' : 'Local preview only', premiumPilotProofKept ? 'The aggregate operating baseline has a managed audit receipt.' : 'No external action runs from this panel.'],
  ] as const
  const evidenceHref = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ contract: 'supermega_trial_evidence', version: 24, exportedAt: new Date().toISOString(), environment: 'isolated_demo', pilotReady: isPilotReady && Boolean(pilotOutcomeReport?.review), setup, workflowProfile: selectedTemplate, launchPackManifest, commerce, production, accountableActions: actions, approvals, managedApprovalRequests, teams: teamWorkspace, localProductRecords, localWorkspaceBackup, behaviorTrail, behaviorPreference, productActivationFunnel, productFirstValue, pilotOutcomeReport, activationRows, activationSteps: runtime.activationSteps, activationEvidencePlan: runtime.evidencePlan, activationManifest: runtime.activationManifest, activationManifestRows, importProvisioning: runtime.importProvisioning, importProvisioningPacket, importProvisioningRows, schedulerActivation, schedulerActivationRows, managedTrialRequest, managedTrialRequestRows, learningRows, learningPlanRows, agentPlanRows, aiContextQualityRows, aiProductSourceRows, aiProductSourceMap, contextHandoffManifest, contextHandoffRows, aiContextReadinessScore, aiContextReadyGateCount, aiContextReadinessGates, aiContextReadinessScoreRows, managedWorkspaceProvisioningPacket, provisioningRows }, null, 2))}`
  const managedTrialRequestHref = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(managedTrialRequest, null, 2))}`
  const ecommerceOrderQueueReadinessFilename = ecommerceOrderQueueReadinessPacket
    ? `supermega-ecommerce-order-queue-${safePacketFilename(ecommerceOrderQueueReadinessPacket.storeName)}.json`
    : 'supermega-ecommerce-order-queue.json'
  const ecommerceOrderQueueManagedValidation = ecommerceOrderQueueReadinessPacket && managedIdentity
    ? ecommerceOrderQueueServerValidation ?? buildManagedEcommerceOrderQueueValidation(ecommerceOrderQueueReadinessPacket, managedIdentity)
    : null
  const ecommerceOrderQueueManagedRows: Array<readonly [string, string, string]> = ecommerceOrderQueueReadinessPacket
    ? [
        ['Company access', managedIdentity ? 'Connected' : 'Connect company', managedIdentity ? 'Named-user access selected for zero-write check.' : 'Premium check waits for managed sign-in.'],
        ['Rows', `${ecommerceOrderQueueReadinessPacket.sourceReview.readyRows}/${ecommerceOrderQueueReadinessPacket.sourceReview.totalRows} ready`, `${ecommerceOrderQueueReadinessPacket.sourceReview.blockedRows} blocked rows.`],
        ['Managed check', ecommerceOrderQueueServerBusy ? 'Checking' : ecommerceOrderQueueManagedValidation?.status ?? 'Waiting', ecommerceOrderQueueServerValidation ? 'Server validation passed with zero records written.' : ecommerceOrderQueueManagedValidation ? 'Local receipt ready; run managed check before owner approval.' : 'No managed request or write has run.'],
        ['Boundary', ecommerceOrderQueueManagedValidation?.external_writes_performed === false ? 'Zero write' : 'Locked', 'Order import, customer send, payment, delivery, stock, and Shop writes remain blocked.'],
      ]
    : [
        ['Company access', managedIdentity ? 'Connected' : 'Connect company', 'Validate an order packet first.'],
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
    let failureNoticeTimer: number | undefined
    try {
      if (demoWorkspace) window.localStorage.setItem(CLIENT_DEMO_WORKSPACE_STORAGE_KEY, JSON.stringify(demoWorkspace))
      else window.localStorage.removeItem(CLIENT_DEMO_WORKSPACE_STORAGE_KEY)
    } catch {
      failureNoticeTimer = window.setTimeout(() => setNotice('This browser could not save the client setup. The current setup remains open for this session.'), 0)
    }
    return () => { if (failureNoticeTimer !== undefined) window.clearTimeout(failureNoticeTimer) }
  }, [demoWorkspace])

  useEffect(() => {
    if (!demoBlueprint || !demoLaunchHandoffPendingRef.current) return undefined
    demoLaunchHandoffPendingRef.current = false
    const animationFrame = window.requestAnimationFrame(() => {
      const launchAction = demoLaunchActionRef.current
      if (!launchAction) return
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      launchAction.focus({ preventScroll: true })
      launchAction.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' })
    })
    return () => window.cancelAnimationFrame(animationFrame)
  }, [demoBlueprint])

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
    setDemoDataSetupOpen(true)
    window.requestAnimationFrame(() => document.getElementById('client-data-setup')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  async function installDemoBlueprint(blueprint: ClientDemoBlueprint, origin: 'created' | 'loaded') {
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
    // The launchpad links straight to /website/, bypassing product onboarding, so
    // provision the client's site here too or that entry shows the untouched starter.
    let websitePackNotice = ''
    const websiteSelection = blueprint.products.find((product) => product.product === 'website')
    if (origin === 'created' && websiteSelection) {
      const activation = await activateLocalWebsiteWorkingSample({
        templateId: websiteSelection.templateId as WebsiteStarterTemplateId,
        businessName: blueprint.client.workspace,
        capturedAt: new Date().toISOString(),
      })
      websitePackNotice = activation.ok
        ? ` ${templateFor('website', websiteSelection.templateId).name} Website sample is prepared.`
        : ` ${activation.error}`
    }
    // Retain the client's chosen template for every selected product, not only the
    // first: without this the Website and Ecommerce onboarding pages fall back to
    // templates[0] and every client type opens the same generic sample.
    for (const selection of blueprint.products) {
      rememberProductSetup(window.localStorage, {
        ...seedSetupForProduct(selection.product, selection.templateId),
        workspace: blueprint.client.workspace,
        owner: blueprint.client.owner,
      })
    }
    const first = blueprint.products[0]
    setDemoPresetId(blueprint.client.presetId)
    setShopIndustryPackId(blueprint.client.shopIndustryPackId)
    setPlantIndustryPackId(blueprint.client.plantIndustryPackId)
    setDemoSelections(Object.fromEntries(blueprint.products.map((product) => [product.product, product.templateId])))
    if (origin === 'created') demoLaunchHandoffPendingRef.current = true
    setDemoBlueprint(blueprint)
    setDemoWorkspace((currentWorkspace) => reconcileClientDemoWorkspace(blueprint, currentWorkspace, new Date().toISOString()))
    setDemoDataSetupOpen(false)
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
      : `${blueprint.products.length}-product demo kit ready.${shopPackNotice}${plantPackNotice}${websitePackNotice} Prepare data or open a product.`)
  }

  async function loadDemoKit(file: File | null) {
    if (!file) return
    try {
      if (file.size < 1 || file.size > CLIENT_DEMO_KIT_MAX_BYTES) throw new Error('Choose a SuperMega setup kit smaller than 128 KB.')
      const kit = restoreClientDemoKit(JSON.parse(await file.text()))
      if (!kit) throw new Error('This setup kit is invalid or has been changed.')
      await installDemoBlueprint(kit.blueprint, 'loaded')
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
      await installDemoBlueprint(clientDemoPreparationBlueprint(artifact), 'loaded')
      setPreparedArtifact(artifact)
      setPreparedConfirmation('')
      setPreparedBlockedProduct(null)
      setPreparedNotice(`${artifact.products.length}-product private package verified. Review it, then approve one serial installation.`)
    } catch (error) {
      setPreparedArtifact(null)
      setPreparedConfirmation('')
      setPreparedBlockedProduct(null)
      setPreparedNotice(error instanceof Error ? error.message : 'The private package could not be loaded.')
    }
  }

  async function prepareClientFiles(files: readonly File[]) {
    if (!files.length || !demoKitReadiness?.kit) return
    setPreparingClientFiles(true)
    setPreparedArtifact(null)
    setPreparedConfirmation('')
    setPreparedBlockedProduct(null)
    setPreparedNotice('Checking the selected files locally...')
    try {
      if (files.length > 4) throw new Error('Choose no more than four product CSV files.')
      const selectedProducts = new Set(demoKitReadiness.kit.blueprint.products.map((product) => product.product))
      const seenProducts = new Set<ClientSolutionId>()
      const sources: ClientDemoPreparationSource[] = []
      for (const file of files) {
        const product = clientCsvProductByName[file.name.trim().toLowerCase()]
        if (!product) throw new Error('Use shop.csv, plant.csv, website.csv, or ecommerce.csv.')
        if (!selectedProducts.has(product)) throw new Error(`${productDisplayName(product)} is not selected in this client demo.`)
        if (seenProducts.has(product)) throw new Error(`Choose only one ${productDisplayName(product)} CSV.`)
        if (file.size < 1 || file.size > CLIENT_IMPORT_MAX_BYTES) throw new Error(`${file.name} must be between 1 byte and 512 KB.`)
        seenProducts.add(product)
        sources.push({ product, sourceName: file.name, csvText: await file.text() })
      }
      const artifact = await prepareClientDemoInBrowser(demoKitReadiness.kit, sources)
      setPreparedArtifact(artifact)
      setPreparedNotice(`${artifact.products.length}-product package verified locally. ${sources.length} client file${sources.length === 1 ? '' : 's'} used; missing products use visible sample data.`)
    } catch (error) {
      setPreparedNotice(error instanceof Error ? error.message : 'The selected client files could not be prepared.')
    } finally {
      setPreparingClientFiles(false)
    }
  }

  async function installPreparedProducts() {
    const artifact = preparedArtifact
    if (!artifact || preparedBusyProduct || managedIdentity || !preparedApprovalReady) return
    const installedBeforeRun = new Set(demoWorkspace?.products.filter((product) => product.status === 'applied').map((product) => product.product) ?? [])
    let activeProduct: SetupProductId | null = null
    setPreparedBlockedProduct(null)
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
      setPreparedBlockedProduct(null)
      setPreparedNotice(`Demo ready: ${summaries.join(' · ')}. Open each product below and run its proof workflow.`)
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'The product could not be installed.'
      setPreparedBlockedProduct(activeProduct)
      setPreparedNotice(`Stopped${activeProduct ? ` at ${productDisplayName(activeProduct)}` : ''}: ${detail} Products already installed are preserved; fix the issue and run the remaining installation again.`)
    } finally {
      setPreparedBusyProduct(null)
      setPreparedInstallStep('')
    }
  }

  async function createDemoKit() {
    try {
      const blueprint = buildClientDemoBlueprint({
        workspace: setup.workspace,
        owner: setup.owner,
        presetId: demoPresetId,
        shopIndustryPackId,
        plantIndustryPackId,
        selections: selectedDemoEntries.map(([product, templateId]) => ({ product, templateId })),
      })
      await installDemoBlueprint(blueprint, 'created')
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
    if (location.hash) navigate('/internal/client-builder/', { replace: true })
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

  function recordAcceptedPilotOutcomeDecision(report: PilotOutcomeReport, review: PilotOutcomeReview) {
    const approval = buildPilotOutcomeDecisionApproval(report, review, setup.acceptanceEvidence)
    setApprovals((current) => [
      approval,
      ...current.filter((candidate) => candidate.id !== approval.id && candidate.packetFingerprint !== approval.packetFingerprint),
    ])
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
      setNotice('Open a company account and validate an order packet first.')
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
      const managedRecord = await createManagedApproval(request, managedIdentity)
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

  function saveLocalRestorePoint() {
    const backup = collectLocalWorkspaceBackup(window.localStorage)
    if (!backup) {
      setRestoreNotice('This local workspace is too large to save safely. Export evidence before resetting.')
      return
    }
    try {
      window.sessionStorage.setItem(LOCAL_WORKSPACE_RESTORE_POINT_KEY, JSON.stringify(backup))
      setRestorePoint(backup)
      setRestorePointLabel('Saved on this device')
      setRestoreNotice(`${Object.keys(backup.records).length} local records saved as the reset baseline.`)
    } catch {
      setRestoreNotice('The browser could not save a restore point. Export evidence before resetting.')
    }
  }

  async function loadEvidenceRestorePoint(file: File | null) {
    if (!file) return
    try {
      if (file.size < 1 || file.size > LOCAL_WORKSPACE_BACKUP_MAX_BYTES) throw new Error('Choose a SuperMega evidence file smaller than 5 MB.')
      const backup = restoreLocalWorkspaceBackupFromEvidence(JSON.parse(await file.text()))
      if (!backup) throw new Error('This evidence file cannot restore a local workspace. Export a current version 24 evidence file first.')
      window.sessionStorage.setItem(LOCAL_WORKSPACE_RESTORE_POINT_KEY, JSON.stringify(backup))
      setRestorePoint(backup)
      setRestorePointLabel(file.name)
      setRestoreNotice(`${Object.keys(backup.records).length} local records verified. Restore only when you are ready to replace this browser workspace.`)
    } catch (error) {
      setRestoreNotice(error instanceof Error ? error.message : 'The evidence backup could not be loaded.')
    }
  }

  async function restoreSavedLocalWorkspace() {
    if (!restorePoint || restoreBusy) return
    setRestoreBusy(true)
    try {
      await applyLocalWorkspaceBackup(window.localStorage, restorePoint)
      window.sessionStorage.removeItem(LOCAL_WORKSPACE_RESTORE_POINT_KEY)
      window.location.assign('/settings/#controls')
    } catch (error) {
      setRestoreNotice(error instanceof Error ? error.message : 'The previous local workspace could not be restored safely.')
      setRestoreBusy(false)
    }
  }

  async function resetDemoWorkspace() {
    setResetBusy(true)
    try {
      if (!loadLocalWorkspaceRestorePoint()) {
        const backup = collectLocalWorkspaceBackup(window.localStorage)
        if (!backup) throw new Error('Save or export a restore point before resetting this local workspace.')
        window.sessionStorage.setItem(LOCAL_WORKSPACE_RESTORE_POINT_KEY, JSON.stringify(backup))
      }
      const { resetCommerceOrderDraftRecovery } = await import('./commerce-order-draft')
      await resetCommerceOrderDraftRecovery()
      const resettableKeys = listLocalWorkspaceStorageKeys(window.localStorage)
      resettableKeys.forEach((key) => window.localStorage.removeItem(key))
      window.location.assign('/')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The local trial could not be reset safely.')
      setResetBusy(false)
    }
  }

  async function activateManagedWorkspace(identity: ManagedIdentity) {
    setManagedIdentity(identity)
    setEcommerceOrderQueueServerValidation(null)
    setEcommerceOrderQueueImportPlan(null)
    setEcommerceOrderQueueApplyPreflight(null)
    setManagedPassword('')
    try {
      const bootstrap = await loadManagedBootstrap(identity)
      setApprovals((current) => mergeManagedApprovals(current, bootstrap.approvals))
      setManagedNotice('Connected. Managed approvals are ready.')
    } catch (workspaceError) {
      setManagedNotice(workspaceError instanceof Error ? workspaceError.message : 'Signed in, but this workspace is not ready.')
    }
  }

  async function connectManagedWorkspace(event: FormEvent) {
    event.preventDefault()
    setManagedBusy(true)
    try {
      if (managedWorkspaceSignIn) {
        setManagedNotice('Opening the selected company...')
        await activateManagedWorkspace(
          await completeManagedWorkspaceSignIn(managedWorkspaceSignIn, managedWorkspace),
        )
        setManagedWorkspaceSignIn(null)
        return
      }
      setManagedNotice('Finding companies assigned to this account...')
      const signIn = await signInAndDiscoverManagedWorkspaces(managedEmail, managedPassword)
      if (signIn.workspaces.length === 1) {
        await activateManagedWorkspace(
          await completeManagedWorkspaceSignIn(signIn, signIn.workspaces[0].workspaceId),
        )
        return
      }
      setManagedWorkspaceSignIn(signIn)
      setManagedWorkspace(signIn.workspaces[0].workspaceId)
      setManagedPassword('')
      setManagedNotice(`Choose one of ${signIn.workspaces.length} companies assigned to ${signIn.email}.`)
    } catch (error) {
      setManagedNotice(error instanceof Error ? error.message : 'Managed sign-in failed.')
    } finally {
      setManagedBusy(false)
    }
  }

  async function verifyManagedPilot() {
    if (!managedIdentity) return
    const identity = managedIdentity
    const requestId = managedPilotRequestRef.current + 1
    managedPilotRequestRef.current = requestId
    setManagedPilotBusy(true)
    setManagedPilotNotice('Verifying approved company context...')
    try {
      const brief = await loadManagedCompanyBrief('attention', identity)
      if (managedPilotRequestRef.current !== requestId) return
      setManagedPilotBrief(brief)
      setManagedPilotCommandId(settingsCommandUuid())
      setManagedPilotRetained(brief.retention === 'persisted_managed_audit')
          setManagedPilotNotice(`${brief.sourceCount} company source${brief.sourceCount === 1 ? '' : 's'} verified for this company.`)
    } catch (error) {
      if (managedPilotRequestRef.current !== requestId) return
      setManagedPilotBrief(null)
      setManagedPilotCommandId('')
      setManagedPilotRetained(false)
      setManagedPilotNotice(error instanceof Error ? error.message : 'Managed company context is not ready.')
    } finally {
      if (managedPilotRequestRef.current === requestId) setManagedPilotBusy(false)
    }
  }

  async function keepManagedPilotProof() {
    if (!managedIdentity || !managedPilotBrief || !managedPilotCommandId || premiumPilotProofKept) return
    const identity = managedIdentity
    const brief = managedPilotBrief
    const requestId = managedPilotRequestRef.current + 1
    managedPilotRequestRef.current = requestId
    setManagedPilotBusy(true)
    setManagedPilotNotice('Keeping the aggregate learning checkpoint...')
    try {
      const receipt = await retainManagedCompanyBrief({
        brief,
        commandId: managedPilotCommandId,
        identity,
      })
      if (managedPilotRequestRef.current !== requestId) return
      setManagedPilotBrief(receipt.brief)
      setManagedPilotRetained(true)
      setManagedPilotNotice(receipt.retention.idempotentReplay ? 'This learning checkpoint was already kept.' : 'Learning checkpoint kept in the managed audit. No external action ran.')
    } catch (error) {
      if (managedPilotRequestRef.current !== requestId) return
      setManagedPilotNotice(error instanceof Error ? error.message : 'The learning checkpoint could not be kept.')
    } finally {
      if (managedPilotRequestRef.current === requestId) setManagedPilotBusy(false)
    }
  }

  async function disconnectManagedWorkspace() {
    setManagedBusy(true)
    managedPilotRequestRef.current += 1
    await signOutManagedTrial()
    setManagedWorkspaceSignIn(null)
    setManagedWorkspace('')
    setManagedIdentity(null)
    setManagedPilotBrief(null)
    setManagedPilotCommandId('')
    setManagedPilotRetained(false)
    setManagedPilotNotice('')
    setManagedPilotBusy(false)
    setEcommerceOrderQueueServerValidation(null)
    setEcommerceOrderQueueImportPlan(null)
    setEcommerceOrderQueueApplyPreflight(null)
    setEcommerceOrderQueueApprovalBusy(false)
    setEcommerceOrderQueueImportPlanBusy(false)
    setEcommerceOrderQueueApplyPreflightBusy(false)
    setApprovals((current) => current.filter((approval) => !approval.managed))
    setManagedNotice('Company account disconnected.')
    setManagedBusy(false)
  }

  return (
    <div className="workspace-screen settings-screen">
      <PageHeading eyebrow="Client setup" title="Set up a client demo" copy="Name the client, choose the business, create one workspace, then open any selected product demo." />
      {!preparedArtifact && preparedNotice ? <p className="form-notice" role="status">{preparedNotice}</p> : null}
      <div className="settings-grid settings-step-content">
        <form className="core-panel setup-form" onSubmit={save}>
          <div className="panel-head"><div><span className="core-eyebrow">Client demo</span><h2>{settingsStep === 'workflow' ? 'Client and business' : 'Define success'}</h2></div><span className={`status-pill ${displayedReady ? 'approved' : 'bounded'}`}>{displayedReady ? 'ready' : `${displayedCompletion}%`}</span></div>
          <div className="pilot-progress"><div className="progress-track"><i style={{ width: `${displayedCompletion}%` }} /></div><small>{settingsStep === 'workflow' ? 'Client - business - ready' : 'Record - target - evidence'}</small></div>
          <fieldset className="settings-step-fields" disabled={settingsStep !== 'workflow'} hidden={settingsStep !== 'workflow'}>
          <div className="form-row"><label>Client or workspace name<input maxLength={60} required value={setup.workspace} onChange={(event) => updateSetup({ workspace: event.target.value })} placeholder="Example: Golden Valley Trading" /></label><label>Responsible owner<input maxLength={80} required value={setup.owner} onChange={(event) => updateSetup({ owner: event.target.value })} placeholder="Name or role" /></label></div>
          <>
            <label className="demo-preset-select">Business type<select aria-label="Choose client business type" onChange={(event) => chooseDemoPreset(event.target.value as ClientDemoPresetId)} value={demoPresetId}>{clientDemoPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select><small>{selectedDemoPreset.description} Includes {selectedDemoProductSummary}.</small></label>
            <div className="settings-step-actions"><span>{demoBlueprint ? 'Updates the saved local setup package. No client data is sent.' : 'Creates a local setup package. No client data is sent.'}</span><button className="core-button primary" disabled={!demoInputReady} onClick={createDemoKit} type="button">{demoBlueprint ? 'Update client demo' : 'Create client demo'}</button></div>
            <details className="compact-disclosure demo-product-customizer">
              <summary><span>Customize products</span><small>{selectedDemoEntries.length} selected</small></summary>
              <div><span className="core-eyebrow">Products and workflows</span><p className="panel-copy">Keep only what this client will actually use. Every selected product shares the client name and owner.</p></div>
              <div className="form-row">
                {demoSelections.commerce ? <label className="demo-pack-select">Shop pack<select onChange={(event) => changeShopIndustryPack(event.target.value as ShopIndustryPackId)} value={shopIndustryPackId}>{shopIndustryPacks.map((pack) => <option key={pack.id} value={pack.id}>{pack.name} · {pack.nameMy}</option>)}</select><small>{selectedShopIndustryPack.firstWorkflow} {selectedShopIndustryPack.description}</small></label> : null}
                {demoSelections.production ? <label className="demo-pack-select">Plant pack<select onChange={(event) => changePlantIndustryPack(event.target.value as PlantIndustryPackId)} value={plantIndustryPackId}>{plantIndustryPacks.map((pack) => <option key={pack.id} value={pack.id}>{pack.name}</option>)}</select><small>{selectedPlantIndustryPack.firstWorkflow} {selectedPlantIndustryPack.description}</small></label> : null}
              </div>
              <div aria-label="Choose products for the client demo" className="demo-solution-grid">{Object.values(productContracts).map((product) => {
                const templateId = demoSelections[product.id]
                return <section className="demo-solution-card" data-selected={Boolean(templateId)} key={product.id}>
                  <label><input checked={Boolean(templateId)} onChange={() => toggleDemoProduct(product.id)} type="checkbox" /><span><strong>{product.name}</strong><small>{product.headline}</small></span></label>
                  {templateId ? product.id === 'commerce' ? <small>{templateFor('commerce', selectedShopIndustryPack.workflowTemplateId).name} · selected by Shop pack</small> : <select aria-label={`${product.name} workflow`} onChange={(event) => changeDemoTemplate(product.id, event.target.value)} value={templateId}>{templatesFor(product.id).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select> : <small>Not included in this demo.</small>}
                </section>
              })}</div>
            </details>
            <details className="compact-disclosure setup-existing-package">
              <summary><span>Continue existing setup</span><small>Load a saved kit or prepared private package</small></summary>
              <div className="setup-action-group"><label className="core-button">Load setup kit<input accept=".json,application/json" className="sr-only" onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; event.currentTarget.value = ''; void loadDemoKit(file) }} type="file" /></label><label className="core-button primary">Load private package<input accept=".json,application/json" className="sr-only" onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; event.currentTarget.value = ''; void loadPreparedClientDemo(file) }} type="file" /></label></div>
            </details>
            {demoRecoveryNeeded ? <section aria-label="Client demo recovery" className="demo-kit-result"><div className="panel-head"><div><span className="core-eyebrow">Recovery needed</span><h3>Rebuild the saved client demo</h3><p>{demoKitReadiness?.reason ?? 'The saved workspace no longer matches the current setup contract.'}</p></div><button className="core-button primary" disabled={!demoInputReady} onClick={createDemoKit} type="button">Rebuild demo</button></div></section> : null}
            {demoBlueprint ? <section aria-label="Client demo kit" className="demo-kit-result">
              <div className="panel-head"><div><span className="core-eyebrow">Client workspace</span><h3>{demoBlueprint.client.workspace}</h3><p>{demoRunbook?.provenCount ?? 0} proven · {demoReadyCount} data-ready · owner {demoBlueprint.client.owner}</p></div><a className="core-button" download={demoBlueprintFilename} href={demoBlueprintHref}>Download setup kit</a></div>
              <section aria-label="Client demo launchpad" className="client-demo-launchpad">
                <div className="client-demo-launchpad-head"><div><span className="core-eyebrow">Demo launchpad</span><strong>{nextDemoMission ? `Next: ${nextDemoMission.label}` : 'All selected demos are proven'}</strong><small>Every product below uses this client setup. Open any working sample now; add client data only when it is ready.</small></div><Link className="core-button primary" ref={demoLaunchActionRef} to={demoLaunchPath}>{nextDemoMission ? 'Open next demo' : 'Review demos'}</Link></div>
                <div className="client-demo-launch-grid">{demoRunbook?.products.map((mission) => {
                  const blueprintProduct = demoBlueprint.products.find((product) => product.product === mission.product)
                  const statusClass = mission.status === 'proven' ? 'approved' : mission.status === 'needs_fix' ? 'pending' : 'bounded'
                  return <Link aria-label={`Open ${mission.label} demo`} className="client-demo-launch-card" data-next={mission.product === demoRunbook.nextProduct || undefined} key={mission.product} to={mission.startPath}><span><small>{templateFor(mission.product, blueprintProduct?.templateId ?? '').name}</small><strong>{mission.label}</strong><em>{mission.scenario}</em></span><span className={`status-pill ${statusClass}`}>{demoLaunchLabels[mission.status]}</span></Link>
                })}</div>
                {nextDemoMission && (nextDemoMission.status === 'prepare_data' || nextDemoMission.status === 'needs_fix') ? <div className="client-demo-launch-data"><span>The sample is ready. Personalize it when you have reviewed client data.</span><button className="text-link" onClick={() => prepareDemoProduct(nextDemoMission.product, demoBlueprint.products.find((product) => product.product === nextDemoMission.product)?.templateId ?? '')} type="button">Add {nextDemoMission.label} data</button></div> : null}
              </section>
              <details className="compact-disclosure client-system-details">
                <summary><span>Client system details</span><small>{demoBlueprint.products.length} products · {demoBlueprint.integrations.length} connections</small></summary>
              <div aria-label="Shared operating foundation" className="readiness-list client-foundation-summary"><span><small>Operating unit</small><strong>{demoBlueprint.foundation.operatingUnit.name}</strong><em>{demoBlueprint.foundation.operatingUnit.code} · {demoBlueprint.foundation.operatingUnit.kind}</em></span><span><small>Market</small><strong>{demoBlueprint.foundation.localization.countryCode} · {demoBlueprint.foundation.localization.currency}</strong><em>{demoBlueprint.foundation.localization.locale}</em></span><span><small>Topology</small><strong>{demoBlueprint.topology.locations.length} location · {demoBlueprint.topology.channels.length} channels</strong><em>{demoBlueprint.topology.recordAuthorities.length} product authorities</em></span><span><small>Timezone</small><strong>{demoBlueprint.foundation.localization.timeZone}</strong><em>Shared by all selected products</em></span><span><small>Authority</small><strong>Client review required</strong><em>Company account required before go-live</em></span></div>
              {capabilityPlan ? <details className="compact-disclosure capability-rollout">
                <summary><span>Enterprise system map</span><small>{capabilityPlan.summary.total} governed capabilities</small></summary>
                <div className="capability-rollout-body">
                  <div className="capability-phase-grid capability-platform-grid">
                    <section><div><small>Shared platform</small><strong>{capabilityPlan.summary.sharedPlatform} controls connect every selected product.</strong></div><ul>{capabilityPlan.platformCapabilities.map((capability) => <li key={capability.id}><span>{capability.phase} · {capability.domain}</span><strong>{capability.label}</strong><small>{capability.outcome}</small><em>{capability.roles.join(' · ')}</em></li>)}</ul></section>
                  </div>
                  <div className="capability-rollout-head"><div><span className="core-eyebrow">Enterprise lifecycle</span><strong>Deep operational scope without overwhelming the operator.</strong><p>Day-one work stays simple. Records, roles, dependencies, controls, and scale modules remain explicit—and a capability is never claimed until its proof is verified.</p></div><a className="core-button compact" download={capabilityPlanFilename} href={capabilityPlanHref}>Download system blueprint</a></div>
                  <div className="capability-phase-grid">{capabilityPlan.phases.map((phase) => <section key={phase.id}><div><small>{phase.label}</small><strong>{phase.outcome}</strong></div><ul>{phase.capabilities.map((capability) => <li key={capability.id}><span>{productDisplayName(capability.product)} · {capability.domain}</span><strong>{capability.label}</strong><small>{capability.outcome}</small><em>{capability.records.join(' · ')}</em></li>)}</ul></section>)}</div>
                  <p className="capability-control-note">Shared controls: {capabilityPlan.sharedControls.join(' · ')}. Every capability must be verified before it is presented as available.</p>
                </div>
              </details> : null}
                {demoBlueprint.integrations.length ? <ol className="demo-integration-flow">{demoBlueprint.integrations.map((integration) => <li key={`${integration.from}-${integration.to}`}><strong>{productDisplayName(integration.from)} → {productDisplayName(integration.to)}</strong><span>{integration.outcome}</span></li>)}</ol> : <p className="form-notice">This demo has one standalone product.</p>}
              </details>
              <details className="compact-disclosure client-preparation-handoff">
                <summary><span>Use client data</span><small>One local step</small></summary>
                <div className="client-preparation-picker">
                  <div><strong>Download ready files or choose client files.</strong><p>Selected product templates are included. Missing files keep sample data.</p><small>Accepted: shop.csv, plant.csv, website.csv, ecommerce.csv (512 KB each).</small></div>
                  <div className="client-preparation-actions">
                    {clientCsvStarterPack ? <a className="core-button" download={clientCsvStarterPack.filename} href={clientCsvStarterPackDownloadHref}>Download CSV starter pack</a> : null}
                    <label className={`core-button primary${preparingClientFiles ? ' disabled' : ''}`}>
                      <input accept=".csv,text/csv" disabled={preparingClientFiles} multiple onChange={(event) => {
                        const files = Array.from(event.currentTarget.files ?? [])
                        event.currentTarget.value = ''
                        void prepareClientFiles(files)
                      }} type="file" />
                      {preparingClientFiles ? 'Checking files...' : 'Choose client CSV files'}
                    </label>
                  </div>
                </div>
                <p>Files stay in this browser. Preparation makes no upload, model call, managed write, or activation.</p>
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
                    const blocked = preparedBlockedProduct === product.product
                    return <section className="demo-solution-card" data-selected key={product.product}><div><strong>{product.label}</strong><small>{busy ? 'Installing now...' : applied ? 'Installed and ready' : blocked ? 'Existing work needs a decision' : `${product.rowCount} rows · ${product.sourceMode === 'client_csv' ? 'client CSV' : 'prepared sample'}`}</small></div>{applied || blocked ? <Link className="core-button" to={product.demoPath}>{blocked ? 'Review existing work' : bi('Open')}</Link> : null}</section>
                  })}</div>
                  <p className="form-notice" aria-live="polite">{preparedNotice}</p>
                  {preparedBlockedEntry ? <div className="settings-step-actions" aria-label="Blocked installation recovery"><span>Keep the existing {preparedBlockedEntry.label} work, or use the recoverable reset controls before retrying.</span><div className="setup-action-group"><Link className="core-button" to={preparedBlockedEntry.demoPath}>Review {preparedBlockedEntry.label}</Link><a className="core-button primary" href="#controls">Open restore or reset controls</a></div></div> : null}
                </div>
              </section> : null}
              <details className="compact-disclosure demo-mission-list"><summary><span>All product missions</span><small>{demoRunbook?.products.length ?? 0} workflows</small></summary><div className="demo-runbook-products">{demoRunbook?.products.map((mission, index) => {
                const blueprintProduct = demoBlueprint.products.find((product) => product.product === mission.product)
                const statusClass = mission.status === 'proven' ? 'approved' : mission.status === 'needs_fix' ? 'pending' : 'bounded'
                return <details data-status={mission.status} key={mission.product}><summary><span><small>Mission {index + 1} · {templateFor(mission.product, blueprintProduct?.templateId ?? '').name}</small><strong>{mission.label}: {mission.scenario}</strong></span><span className={`status-pill ${statusClass}`}>{demoRunbookLabels[mission.status]}</span></summary><div><ol>{mission.steps.map((step) => <li key={step}>{step}</li>)}</ol><div className="demo-proof-contract"><small>Required proof</small><strong>{mission.evidenceRequirement}</strong><em>Observed: {mission.evidenceObserved} · data {demoProgressLabels[mission.importStatus].toLowerCase()}</em></div>{mission.status === 'prepare_data' || mission.status === 'needs_fix' ? <button className="core-button" onClick={() => prepareDemoProduct(mission.product, blueprintProduct?.templateId ?? '')} type="button">{mission.actionLabel}</button> : <Link className="core-button" to={mission.actionPath}>{mission.actionLabel}</Link>}</div></details>
              })}</div></details>
            </section> : null}
          </>
          {demoBlueprint && demoDataSetupOpen ? <section className="demo-data-setup" id="client-data-setup"><div><span className="core-eyebrow">Client data</span><h3>Load data when ready</h3><p>The working sample is available first. Import the client's matching CSV only when you have it.</p></div><Suspense fallback={<p className="form-notice" role="status">Loading the client data template...</p>}><ClientDataOnboarding initiallyOpen managedIdentity={managedIdentity} onProgress={recordDemoProductProgress} owner={setup.owner} plantIndustryPackId={setup.product === 'production' ? plantIndustryPackId : undefined} product={setup.product} productName={selectedProduct.name} productSlug={selectedProduct.slug} shopIndustryPackId={setup.product === 'commerce' ? shopIndustryPackId : undefined} workflowTemplateId={selectedTemplate.id} workspace={setup.workspace} /></Suspense></section> : null}
          {demoBlueprint && demoDataSetupOpen ? <div className="settings-step-actions"><span>Optional: add measurable success criteria after the demo works.</span><div className="setup-action-group"><button className="text-link" disabled={!workflowReady} onClick={() => chooseSettingsStep('success')} type="button">Add success criteria</button></div></div> : null}
          </fieldset>
          <fieldset className="settings-step-fields" disabled={settingsStep !== 'success'} hidden={settingsStep !== 'success'}>
          <div className="template-contract settings-workflow-summary"><span>{productDisplayName(setup.product)}</span><strong>{setup.workspace || 'Unnamed workspace'}</strong><small>{selectedTemplate.name} - {setup.owner || 'Owner needed'}</small></div>
          <label>Current record<input maxLength={180} required value={setup.currentRecord} onChange={(event) => updateSetup({ currentRecord: event.target.value })} placeholder="Chat, paper, sheet, system, or log." /></label>
          <div className="form-row pilot-text-row"><label>Baseline<textarea maxLength={240} required value={setup.baseline} onChange={(event) => updateSetup({ baseline: event.target.value })} placeholder="Current time, error rate, backlog, output." /></label><label>Target outcome<textarea maxLength={240} required value={setup.targetOutcome} onChange={(event) => updateSetup({ targetOutcome: event.target.value })} placeholder={`Target for ${selectedTemplate.metric.toLowerCase()}.`} /></label></div>
          <div className="form-row pilot-text-row"><label>Human authority boundary<textarea maxLength={240} required value={setup.authorityBoundary} onChange={(event) => updateSetup({ authorityBoundary: event.target.value })} placeholder="Which actions need owner approval?" /></label><label>Acceptance evidence<textarea maxLength={240} required value={setup.acceptanceEvidence} onChange={(event) => updateSetup({ acceptanceEvidence: event.target.value })} placeholder="What proves the pilot works?" /></label></div>
          <div className="settings-step-actions"><button className="text-link" onClick={() => chooseSettingsStep('workflow')} type="button">{bi('Back')}</button><button className="core-button primary" type="submit">{bi('Save client setup')}</button></div>
          {setup.savedAt ? <>
            <div className="setup-complete"><div><strong>Trial plan saved.</strong><small>Your AI memory preview is ready.</small></div><div className="setup-complete-actions"><Link className="core-button" to={setupProductPreviewPath(setup.product)}>Open {productDisplayName(setup.product)}</Link><a className="core-button" download={aiMemoryFilename} href={aiMemoryHref}>Download AI memory</a>{managedTrialProofReady ? <a className="core-button primary" href={managedTrialRequestUrl(setup.product, selectedTemplate.id, managedTrialPrefill)}>Request managed AI</a> : <a className="core-button primary" href={managedTrialProofActionPath}>{managedTrialProofActionLabel}</a>}</div></div>
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
      {setup.savedAt ? <PilotOutcomePanel metric={pilotOutcomeMetric} onAccepted={recordAcceptedPilotOutcomeDecision} onChanged={refreshPilotOutcome} report={pilotOutcomeReport} setup={pilotOutcomeSetup} /> : null}
      {setup.savedAt ? <section aria-label="Premium pilot" className="premium-pilot">
        <div className="premium-pilot-head"><div><span className="core-eyebrow">Premium pilot</span><h2>Your business context, remembered.</h2><p>SuperMega combines approved product data and owner patterns, then prepares one next move for review.</p></div><span className={`status-pill ${premiumPilotProofKept ? 'approved' : managedPilotBrief ? 'bounded' : ''}`}>{premiumPilotProofKept ? 'checkpoint kept' : managedPilotBrief ? 'verified' : 'local'}</span></div>
        <div className="premium-pilot-rows">{premiumPilotRows.map(([label, value, detail]) => <span key={label}><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>)}</div>
        <div aria-label="Approved AI context export" className="managed-context-consent" id="approved-ai-context">
          <div><span className="core-eyebrow">Local context handoff</span><h3>Review the summary AI can receive.</h3><p>Contains counts and a preferred product only. Raw product records, behavior entries, decision records, notes, and browser text are excluded.</p></div>
          <div className="premium-pilot-rows">
            <span><small>Prepared sources</small><strong>{preparedRecordCount}</strong><em>Count only</em></span>
            <span><small>Behavior signals</small><strong>{agentBehaviorSignals.length}</strong><em>{topAgentJob ? `${agentProductName(topAgentJob.product)} preferred` : 'Choose one action first'}</em></span>
            <span><small>Human decisions</small><strong>{reviewedDecisionCount}</strong><em>Count only; no notes</em></span>
            <span><small>Measured outcome</small><strong>{acceptedAiContextOutcome?.status ?? 'Proof required'}</strong><em>{acceptedAiContextOutcome ? 'Accepted result digest included' : 'Accept a clear or improved result first'}</em></span>
            <span><small>Boundary</small><strong>Draft and rank only</strong><em>No send, write, publish, payment, stock, production, CRM, or training</em></span>
          </div>
          <label className="managed-context-approval">
            <input checked={aiContextExportApproved} disabled={!managedContextPackage || !acceptedAiContextOutcome} onChange={(event) => setAiContextExportApproval(event.target.checked && aiContextExportApprovalKey ? { key: aiContextExportApprovalKey, reviewedAt: new Date().toISOString() } : null)} type="checkbox" />
            <span>I approve this summary-only context package for managed AI review.</span>
          </label>
          {approvedAiContextExport ? <a className="core-button primary" download={approvedAiContextExportFilename} href={approvedAiContextExportHref}>Download approved context</a> : <button className="core-button primary" disabled type="button">{managedContextPackage && acceptedAiContextOutcome ? 'Approve to download' : 'Complete proof first'}</button>}
          <p className="premium-pilot-boundary">The download performs no upload, managed write, model training, customer action, or external send.</p>
        </div>
        {managedPilotBrief ? <div className="premium-pilot-brief"><div><span className="core-eyebrow">Managed company brief</span><h3>{managedPilotBrief.title}</h3><p>{managedPilotBrief.summary}</p>{operatingLearning ? <div className="premium-pilot-learning"><span className="core-eyebrow">AI learned</span><strong>{operatingLearning.label}</strong><small>{operatingLearning.detail}</small></div> : null}</div><div className="premium-pilot-next"><small>Reviewed next move</small><strong>{managedPilotBrief.nextAction.label}</strong><em>{managedPilotBrief.boundary}</em></div></div> : null}
        <ManagedContextConsent approvedContext={approvedAiContextExport} identity={managedIdentity} onRetained={() => void verifyManagedPilot()} />
        {runtime.status === 'enterprise' && managedTrialAuthConfigured() ? managedIdentity ? <div className="premium-pilot-actions"><button className="core-button" disabled={managedPilotBusy} onClick={() => void verifyManagedPilot()} type="button">{managedPilotBusy && !managedPilotBrief ? 'Verifying...' : 'Verify context'}</button>{managedPilotBrief ? <><Link className="core-button" to={managedPilotBrief.nextAction.path}>{managedPilotBrief.nextAction.label}</Link><button className="core-button primary" disabled={managedPilotBusy || premiumPilotProofKept} onClick={() => void keepManagedPilotProof()} type="button">{premiumPilotProofKept ? 'Checkpoint kept' : managedPilotBusy ? 'Keeping...' : 'Keep learning checkpoint'}</button></> : null}</div> : <form className="premium-pilot-login" onSubmit={(event) => void connectManagedWorkspace(event)}><div><span className="core-eyebrow">Connect company account</span><strong>Verify this company, not a generic demo.</strong></div>{managedWorkspaceSignIn ? <label>Company<select onChange={(event) => setManagedWorkspace(event.target.value)} required value={managedWorkspace}>{managedWorkspaceSignIn.workspaces.map((workspace) => <option key={workspace.workspaceId} value={workspace.workspaceId}>{workspace.label} - {workspace.access}</option>)}</select></label> : <><label>Email<input autoComplete="username" maxLength={160} onChange={(event) => setManagedEmail(event.target.value)} required type="email" value={managedEmail} /></label><label>Password<input autoComplete="current-password" minLength={8} onChange={(event) => setManagedPassword(event.target.value)} required type="password" value={managedPassword} /></label></>}<button className="core-button primary" disabled={managedBusy} type="submit">{managedBusy ? 'Checking...' : managedWorkspaceSignIn ? bi('Open company') : bi('Find my company')}</button></form> : <div className="premium-pilot-actions">{managedTrialProofReady ? <a className="core-button primary" href={managedTrialRequestUrl(setup.product, selectedTemplate.id, managedTrialPrefill)}>Request managed pilot</a> : <a className="core-button primary" href={managedTrialProofActionPath}>{managedTrialProofActionLabel}</a>}</div>}
        {managedNotice || managedPilotNotice ? <p className="form-notice" role="status">{managedPilotNotice || managedNotice}</p> : null}
        <p className="premium-pilot-boundary">Review only. No customer send, payment, stock move, production write, domain publish, or model training runs from this pilot.</p>
      </section> : null}
      <details className="settings-advanced" id="controls" open={location.hash === '#controls' || undefined}>
        <summary><span>Advanced controls</span><small>Security, evidence, reset</small></summary>
        <div className="settings-advanced-content">
          {restorePoint ? <section aria-label="Local workspace restore point" className="setup-complete settings-restore-point"><div><strong>Restore point ready.</strong><small>{restorePointLabel} · {Object.keys(restorePoint.records).length} local records</small></div><button className="core-button" disabled={restoreBusy} onClick={restoreSavedLocalWorkspace} type="button">{restoreBusy ? 'Restoring...' : 'Restore previous workspace'}</button></section> : null}
          {restoreNotice ? <p className="form-notice settings-restore-point" role="status">{restoreNotice}</p> : null}
          <section className="core-panel system-boundary-panel">
            <div className="panel-head"><div><span className="core-eyebrow">System boundary</span><h2>{runtime.status === 'enterprise' ? 'Managed mode ready' : 'Managed mode locked'}</h2></div><RuntimeBadge status={runtime.status} /></div>
            {managedIdentity ? <div className="template-contract"><span>Company account</span><strong>{managedIdentity.email}</strong><small>Named-user access verified in Premium pilot</small><button className="text-link" disabled={managedBusy} onClick={() => void disconnectManagedWorkspace()} type="button">Disconnect</button></div> : runtime.status === 'enterprise' && managedTrialAuthConfigured() && !setup.savedAt ? <form className="core-form compact-form managed-recovery-login" onSubmit={(event) => void connectManagedWorkspace(event)}><span className="core-eyebrow">Company access recovery</span><p className="authority-note">Sign in and SuperMega will find the active companies assigned to you.</p>{managedWorkspaceSignIn ? <label>Company<select onChange={(event) => setManagedWorkspace(event.target.value)} required value={managedWorkspace}>{managedWorkspaceSignIn.workspaces.map((workspace) => <option key={workspace.workspaceId} value={workspace.workspaceId}>{workspace.label} - {workspace.access}</option>)}</select></label> : <><label>Email<input autoComplete="username" maxLength={160} onChange={(event) => setManagedEmail(event.target.value)} required type="email" value={managedEmail} /></label><label>Password<input autoComplete="current-password" minLength={8} onChange={(event) => setManagedPassword(event.target.value)} required type="password" value={managedPassword} /></label></>}<button className="core-button primary" disabled={managedBusy} type="submit">{managedBusy ? 'Checking...' : managedWorkspaceSignIn ? bi('Open company') : 'Recover company access'}</button>{managedNotice ? <p className="form-notice" role="status">{managedNotice}</p> : null}</form> : runtime.status === 'enterprise' && managedTrialAuthConfigured() ? <p className="authority-note">Connect through Premium pilot after saving a trial.</p> : null}
            <div className="readiness-list" aria-label="Go-live readiness">{activationRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div>
            <div className="readiness-list" aria-label="AI learning readiness">{learningRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div>
            <div className="learning-plan" aria-label="Premium company learning plan">
              <div><span className="core-eyebrow">Premium company learning</span><h3>What the system can learn</h3><p>Free mode prepares the review package. Premium imports approved data, behavior, and decisions only after company controls pass.</p></div>
              <div className="learning-plan-rows">{learningPlanRows.map(([label, value, detail]) => <span key={label}><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>)}</div>
              <div aria-label="Premium work plan" className="learning-plan-agent">
                <div><span className="core-eyebrow">Premium work plan</span><h3>What SuperMega can prepare</h3><p>SuperMega prepares the next workflow from this product setup; real writes stay locked until company controls pass.</p></div>
                <div className="learning-plan-rows">{agentPlanRows.map(([label, value, detail]) => <span key={label}><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>)}</div>
              </div>
              <div aria-label="Company data quality" className="learning-plan-agent context-quality-panel">
                <div><span className="core-eyebrow">Company data quality</span><h3>What premium can safely use</h3><p>Premium learning starts only when source records, behavior, decisions, and company controls are present in the exported evidence.</p></div>
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
              <div aria-label="Company account setup file" className="learning-plan-agent context-quality-panel">
                <div><span className="core-eyebrow">Account setup file</span><h3>How this becomes a real workspace</h3><p>Premium creates a company account from exported evidence only after roles, data, controls, and review status are verified.</p></div>
                <div className="context-quality-rows">{provisioningRows.map(([label, value, detail]) => <span key={label}><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>)}</div>
              </div>
              <div aria-label="Company import readiness" className="learning-plan-agent context-quality-panel">
                <div><span className="core-eyebrow">Import readiness</span><h3>What must pass before real imports</h3><p>Backend health owns this checklist. Uploaded files stay local or export-only until identity, schema, validation, review, adapter, and revision proof are ready.</p></div>
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
                  <div className="learning-plan-actions"><button className="core-button" onClick={loadSampleEcommerceOrderReviewPacket} type="button">{bi('Load sample order packet')}</button><button className="core-button" disabled={!ecommerceOrderReviewPacketText.trim()} onClick={reviewEcommerceOrderReviewPacket} type="button">Check order packet locally</button><button className="core-button" disabled={!managedIdentity || !ecommerceOrderQueueReadinessPacket || ecommerceOrderQueueServerBusy} onClick={() => void runManagedEcommerceOrderQueueCheck()} type="button">{ecommerceOrderQueueServerBusy ? 'Checking managed queue...' : 'Run managed queue check'}</button><button className="core-button" disabled={!ecommerceOrderQueueReadinessPacket} onClick={downloadEcommerceOrderQueueReadinessPacket} type="button">Download queue packet</button>{ecommerceOrderQueueApprovalPacket ? <a className="core-button" download={ecommerceOrderQueueApprovalFilename} href={ecommerceOrderQueueApprovalHref}>Download approval packet</a> : <button className="core-button" disabled type="button">Download approval packet</button>}<button className="core-button" disabled={!managedIdentity || !ecommerceOrderQueueApprovalPacket || ecommerceOrderQueueApprovalBusy} onClick={() => void requestManagedEcommerceOrderQueueApproval()} type="button">{ecommerceOrderQueueApprovalBusy ? 'Recording approval...' : 'Record owner approval request'}</button><button className="core-button" disabled={!managedIdentity || !ecommerceOrderQueueApprovalPacket || ecommerceOrderQueueImportPlanBusy} onClick={() => void prepareManagedEcommerceOrderQueueImportPlan()} type="button">{ecommerceOrderQueueImportPlanBusy ? 'Preparing plan...' : 'Prepare import plan'}</button><button className="core-button" disabled={!managedIdentity || !ecommerceOrderQueueImportPlan || !approvedEcommerceQueueApproval || ecommerceOrderQueueApplyPreflightBusy} onClick={() => void runManagedEcommerceOrderQueueApplyPreflight()} type="button">{ecommerceOrderQueueApplyPreflightBusy ? 'Checking apply...' : 'Run apply preflight'}</button><button className="text-link" disabled={!ecommerceOrderReviewPacketText.trim()} onClick={clearEcommerceOrderReviewPacketReview} type="button">{bi('Clear order packet')}</button></div>
                </div>
                <div aria-label="Ecommerce go-live file review" className="learning-plan-agent context-quality-panel">
                  <div><span className="core-eyebrow">Ecommerce go-live file</span><h3>Review before company setup</h3><p>Paste the downloaded Ecommerce go-live JSON. The browser validates schema, source, queue, and forbidden actions locally; no import, managed activation, Shop write, payment, delivery, stock, or customer action runs.</p></div>
                  <label className="packet-review-field">Go-live file JSON<textarea maxLength={12000} onChange={(event) => setEcommerceActivationPacketText(event.target.value)} placeholder="Paste supermega.ecommerce.managed_store_activation_packet.v1 JSON" rows={5} value={ecommerceActivationPacketText} /></label>
                  <div className="context-quality-rows">{ecommerceActivationPacketReview.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong><em>{label === 'Boundary' ? 'Review only; production setup still requires managed proof.' : 'Local packet check'}</em></span>)}</div>
                  <div className="learning-plan-actions"><button className="core-button" onClick={loadSampleEcommerceActivationPacket} type="button">{bi('Load sample packet')}</button><button className="core-button" disabled={!ecommerceActivationPacketText.trim()} onClick={reviewEcommerceActivationPacket} type="button">Review packet locally</button><button className="text-link" disabled={!ecommerceActivationPacketText.trim()} onClick={clearEcommerceActivationPacketReview} type="button">{bi('Clear packet')}</button></div>
                </div>
              </> : null}
              <div aria-label={`${selectedProduct.name} activation journey`} className="learning-plan-agent">
                <div><span className="core-eyebrow">Selected product only</span><h3>{selectedProduct.name} activation journey</h3><p>Shows where this browser stopped between next steps, own data, and a product request. It stays local until the owner exports evidence.</p></div>
                <div className="learning-plan-rows">{productActivationRows.map(([label, value, detail]) => <span key={label}><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>)}</div>
              </div>
              <div aria-label="Go-live automation summary" className="learning-plan-agent">
                <div><span className="core-eyebrow">Go-live summary</span><h3>What automation may do next</h3><p>{runtime.activationManifest?.automation_boundary ?? 'SuperMega may prepare evidence and drafts; managed writes stay locked until runtime health confirms activation.'}</p></div>
                <div className="learning-plan-rows">{activationManifestRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div>
              </div>
              <div aria-label="Scheduler go-live packet" className="learning-plan-agent managed-request-panel">
                <div><span className="core-eyebrow">Scheduler go-live</span><h3>Automation stays blocked until proof passes</h3><p>Hosted workers can run only after signed evidence, protected secrets, worker allowlist, budget grants, and no-redirect checks are ready.</p></div>
                <div className="managed-request-rows">{schedulerActivationRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div>
              </div>
              <div aria-label="Managed trial request packet" className="learning-plan-agent managed-request-panel">
                <div><span className="core-eyebrow">Managed trial request</span><h3>What support needs</h3><p>This local activation packet includes the exact owner-approved context summary and digest. Raw records remain excluded; managed writes stay locked.</p></div>
                <div className="managed-request-rows">{managedTrialRequestRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div>
              </div>
              <div className="learning-plan-actions">{approvedAiContextExport ? <a className="core-button" download={approvedAiContextExportFilename} href={approvedAiContextExportHref}>Download approved context</a> : <button className="core-button" disabled type="button">Review context above</button>}{setup.savedAt ? <>{approvedAiContextExport ? <a className="core-button" download={managedTrialRequestFilename} href={managedTrialRequestHref}>Download managed activation packet</a> : <button className="core-button" disabled type="button">Approve context first</button>}{managedTrialProofReady ? <a className="core-button primary" href={managedTrialRequestUrl(setup.product, selectedTemplate.id, managedTrialPrefill)}>Request managed trial</a> : <a className="core-button primary" href={managedTrialProofActionPath}>{managedTrialProofActionLabel}</a>}</> : <button className="core-button primary" disabled type="button">Save trial first</button>}</div>
            </div>
            <Suspense fallback={<p className="form-notice" role="status">Loading managed activation plan...</p>}><ManagedActivationRunbook runtime={runtime} /></Suspense>
            {runtime.status !== 'enterprise' ? <ul className="requirement-list">{(runtime.requirements.length ? runtime.requirements : ['Configure managed tenant persistence.', 'Verify production identity and source coverage.']).map((requirement) => <li key={requirement}>{requirement}</li>)}</ul> : null}
            <p className="authority-note">AI learns from imported records; owners approve consequential actions.</p>
          </section>
          <div className="settings-control-stack">
            <Suspense fallback={<section className="core-panel company-backup-panel"><p className="form-notice" role="status">Loading encrypted company backup...</p></section>}><CompanyBackupPanel /></Suspense>
            <section className="core-panel trial-control-panel">
              <div><span className="core-eyebrow">Safety and recovery</span><h2>Save, export, restore, or reset.</h2><p>Save a restore point before a demo. Export complete local evidence for durable recovery. Reset clears current Shop, Plant, Website, Ecommerce, owner-control, outcome, setup, unfinished order drafts, and local AI-memory records.</p></div>
              <div className="trial-actions">
                <button className="core-button" onClick={saveLocalRestorePoint} type="button">{bi('Save restore point')}</button>
                <a className="core-button" download={evidenceFilename} href={evidenceHref}>{bi('Export full evidence')}</a>
                <label className="core-button">Load evidence backup<input accept=".json,application/json" className="sr-only" onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; event.currentTarget.value = ''; void loadEvidenceRestorePoint(file) }} type="file" /></label>
                {resetArmed ? <><button className="text-link" disabled={resetBusy} onClick={() => setResetArmed(false)} type="button">{bi('Cancel')}</button><button className="core-button danger" disabled={resetBusy} onClick={() => void resetDemoWorkspace()} type="button">{resetBusy ? 'Resetting...' : 'Confirm reset'}</button></> : <button className="text-link danger-text" onClick={() => setResetArmed(true)} type="button">Reset local trial</button>}
              </div>
            </section>
            {runtime.status !== 'enterprise' ? <section className="core-panel company-backup-panel">
              <div className="company-backup-head">
                <div><span className="core-eyebrow">Enterprise capabilities</span><h2>What managed mode unlocks.</h2><p>These work alongside everything in free mode. Free features can never be removed.</p></div>
                <span className="status-pill">enterprise</span>
              </div>
              <ul className="capability-locked-list">
                {(['shared-workspace', 'staff-roles', 'verified-statements'] as const).map((id) => {
                  const notice = lockedCapabilityNotice(id)
                  return <li key={id}><strong>{notice.label}</strong><small>{notice.outcome}</small><span>{notice.reason}</span></li>
                })}
              </ul>
              <p className="form-notice">All three need managed workspace activation. <a className="text-link" href="/contact/?product=guide&source=managed-intelligence">Talk to us about this.</a></p>
            </section> : null}
          </div>
        </div>
      </details>
    </div>
  )
}
