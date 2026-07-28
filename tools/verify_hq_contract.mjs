import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  COMPANY_CAPACITY_CLAIM_CONTRACT,
  COMPANY_CAPACITY_CLAIM_TTL_SECONDS,
  listCompanyAgents,
  MAX_CYCLE_AGENTS,
  MAX_CYCLE_ROLE_BUDGET,
  MAX_REGISTERED_COMPANY_AGENTS,
  MAX_RUNNING_COMPANY_CYCLES,
} from '../kernel/agent-company.mjs'
import { companyOperationsStatusView, platformStatusView } from '../kernel/tools.mjs'
import { SUPERMEGA_HQ_AUTHORITY, selectCeoOutcome } from '../kernel/supermega-hq-authority.mjs'
import {
  CEO_OUTCOME_EVALUATION_CONTRACT,
  CEO_OUTCOME_DELIVERY_CONTRACT,
  CEO_OUTCOME_OPERATION_CONTRACT,
  COMPANY_USAGE_UNITS,
} from '../kernel/agent-company-operations.mjs'
import {
  COMPANY_DAILY_BUDGET_DEFAULT_UNITS,
  COMPANY_DAILY_BUDGET_HARD_MAX_UNITS,
} from '../kernel/gateway.mjs'

const root = resolve(import.meta.dirname, '..')
const [readme, now, qaBrief, workboard, current, manifestText, portfolioText, workforceText, agentWorkspaceText, research, agentSecurity, databaseRehearsalText, releaseReconciliation, allyAuditText, allyCompanyCycleText, packageText, storageAuditHandoff, hqLiveStateVerifier, kernelPackageText, kernelFootprintVerifier, kernelBriefText, kernelOperatorText, kernelAlertText, kernelOperationsText] = await Promise.all([
  readFile(resolve(root, 'hq', 'README.md'), 'utf8'),
  readFile(resolve(root, 'hq', 'NOW.md'), 'utf8'),
  readFile(resolve(root, 'hq', 'CODEX-PRODUCT-QA-BRIEF.md'), 'utf8'),
  readFile(resolve(root, 'hq', 'WORKBOARD.md'), 'utf8'),
  readFile(resolve(root, 'CURRENT.md'), 'utf8'),
  readFile(resolve(root, 'site-manifest.json'), 'utf8'),
  readFile(resolve(root, 'hq', 'portfolio.json'), 'utf8'),
  readFile(resolve(root, 'agent_os', 'workforce', 'supermega_build_workforce.json'), 'utf8'),
  readFile(resolve(root, 'agent_os', 'resources', 'supermega_core_agent_workspace.json'), 'utf8'),
  readFile(resolve(root, 'hq', 'research', 'product-rd-2026-07.md'), 'utf8'),
  readFile(resolve(root, 'hq', 'research', 'agent-operations-security-2026-07-26.md'), 'utf8'),
  readFile(resolve(root, 'hq', 'research', 'postgres17-rehearsal.json'), 'utf8'),
  readFile(resolve(root, 'hq', 'research', 'release-reconciliation-2026-07-26.md'), 'utf8'),
  readFile(resolve(root, 'tools', 'audit_ally_runtime.ps1'), 'utf8'),
  readFile(resolve(root, 'tools', 'invoke_supermega_company_cycle.ps1'), 'utf8'),
  readFile(resolve(root, 'package.json'), 'utf8'),
  readFile(resolve(root, 'hq', 'pilots', 'private-storage-privacy-audit.md'), 'utf8'),
  readFile(resolve(root, 'tools', 'verify_hq_live_state.mjs'), 'utf8'),
  readFile(resolve(root, 'kernel', 'package.json'), 'utf8'),
  readFile(resolve(root, 'kernel', 'scripts', 'verify-function-footprint.mjs'), 'utf8'),
  readFile(resolve(root, 'kernel', 'api', 'brief.mjs'), 'utf8'),
  readFile(resolve(root, 'kernel', 'api', 'operator.mjs'), 'utf8'),
  readFile(resolve(root, 'kernel', 'alert.mjs'), 'utf8'),
  readFile(resolve(root, 'kernel', 'agent-company-operations.mjs'), 'utf8'),
])

const manifest = JSON.parse(manifestText)
const portfolio = JSON.parse(portfolioText)
const workforce = JSON.parse(workforceText)
const agentWorkspace = JSON.parse(agentWorkspaceText)
const databaseRehearsal = JSON.parse(databaseRehearsalText)
const liveReleaseCommit = now.match(/^Live release commit: `([0-9a-f]{40})`$/m)?.[1] ?? ''
const executionOrderMarker = '## Execution order'
const workboardExecutionOrder = workboard.includes(executionOrderMarker)
  ? workboard.slice(workboard.indexOf(executionOrderMarker))
  : ''
const kernelRoster = listCompanyAgents()
const kernelCrewCapabilities = kernelRoster.flatMap((agent) => [agent.crew, ...agent.capabilityCrews])
const ceoOutcomeSelection = selectCeoOutcome()
const ceoPlatformEvidence = platformStatusView({
  ok: true,
  db: { ok: true, mode: 'supabase', detail: 'must-not-escape' },
  connectors: { total: 69, configured: 4, registrationErrors: 0, byCategory: { data: 10 } },
  ai: { providers: ['must-not-escape-one', 'must-not-escape-two'], failover: true },
  agentCompany: { plannerReady: true, maxAgents: MAX_CYCLE_AGENTS, maxRoleBudget: MAX_CYCLE_ROLE_BUDGET },
  money: { stripe: true, manual: false },
  tenant: 'must-not-escape',
  prompt: 'must-not-escape',
})
const ceoOperationsEvidence = companyOperationsStatusView({
  ok: true,
  mode: 'operations_report',
  clientId: 'must-not-escape',
  generatedAt: '2026-07-28T12:00:00.000Z',
  windowDays: 30,
  readiness: 'meeting_targets',
  counts: { total: 5, planned: 0, running: 0, cancelled: 0, terminal: 5, completed: 5, partial: 0, blocked: 0, failed: 0, evaluated: 5, accepted: 5, revisionRequired: 0, missingEvaluation: 0 },
  attention: { overduePlanned: 0, overdueRunning: 0, failedOrBlocked: 0, revisionRequired: 0, missingEvaluation: 0 },
  targets: Array.from({ length: 8 }, () => ({ state: 'met' })),
  workforce: { availableAgents: 12, utilizedAgents: 2, totalAssignments: 5, activeAssignments: 0, usedRoleCalls: 15, modelCalls: 3, cacheHits: 2, weightedTotalUnits: 1200, agents: [{ agentId: 'must-not-escape' }] },
  outcomes: { available: true, durable: true, state: 'measured', counts: { completed: 5, evaluated: 5, accepted: 5, revisionRequired: 0 }, efficiency: { available: true, acceptedOutcomesPer1000WorkUnits: 4.166667 }, records: [{ output: 'must-not-escape' }] },
  coverage: { directCyclesExcluded: true },
  exposure: { rawEvidenceReturned: false, modelOutputReturned: false, specialistOutputReturned: false, providerRowsReturned: false },
})
const ceoClientGateIndex = kernelBriefText.indexOf('if (!clientId)')
const ceoExecutionClaimIndex = kernelBriefText.indexOf('const executionClaim =', ceoClientGateIndex)
const ceoOperatorRunIndex = kernelBriefText.indexOf('result = await run({', ceoClientGateIndex)
const hqEvidenceFailureIndex = kernelOperatorText.indexOf("reason: 'hq_evidence_unavailable'")
const operatorSynthesisIndex = kernelOperatorText.indexOf('const rawContext = results.length')
const ceoCompletionRecordIndex = kernelBriefText.indexOf('recorded = await recordOutcome({')
const ceoOwnerSendIndex = kernelBriefText.indexOf('const delivery = await deliverSafely(send, `SuperMega')
const ceoDeliveryRecordIndex = kernelBriefText.indexOf('deliveryRecord = await recordDelivery({')
const failures = []
const requireContract = (name, condition) => { if (!condition) failures.push(name) }
const product = (id) => portfolio.products?.find((entry) => entry.id === id)
const sharedCapability = (id) => portfolio.sharedCapabilities?.find((entry) => entry.id === id)
const internalSystem = (id) => portfolio.internalSystems?.find((entry) => entry.id === id)

requireContract('portfolio schema', portfolio.schemaVersion === 'supermega.hq.portfolio.v3')
requireContract('portfolio is current',
  portfolio.updatedAt === '2026-07-28'
  && now.includes('Updated: 2026-07-28')
  && current.includes('Last confirmed: 2026-07-28'))
requireContract('customer portfolio is explicit',
  portfolio.products?.map((entry) => entry.id).join(',') === 'shop,plant,website,ecommerce')
requireContract('customer paths are canonical',
  portfolio.products?.map((entry) => entry.path).join(',') === '/shop/,/plant/,/website/,/ecommerce/')
requireContract('AI is shared infrastructure, not a fifth product',
  portfolio.sharedCapabilities?.map((entry) => entry.id).join(',') === 'ai-assistance'
  && sharedCapability('ai-assistance')?.kind === 'shared-capability'
  && sharedCapability('ai-assistance')?.compatibilityPath === '/agents/'
  && sharedCapability('ai-assistance')?.appAnchor === '/work/?view=agents')
requireContract('product lifecycle is explicit',
  portfolio.productLifecycle?.join(',') === 'discover,define,build,release,learn')
requireContract('one bounded agent operating model is authoritative',
  portfolio.agentOperatingModel?.mode === 'bounded-demand-driven'
  && portfolio.agentOperatingModel?.manager === 'CEO / Codex integrator'
  && portfolio.agentOperatingModel?.buildTeams?.join(',') === 'product,engineering,growth,finance-risk'
  && portfolio.agentOperatingModel?.registeredRoleLimit === 12
  && portfolio.agentOperatingModel?.activeAssignmentLimit === 4
  && portfolio.agentOperatingModel?.batchJobLimit === 4
  && portfolio.agentOperatingModel?.maxAgentsPerCycle === 2
  && portfolio.agentOperatingModel?.validatedCrewCapabilities === 15
  && portfolio.agentOperatingModel?.ceoOutcomeAuthority === 'supermega.ceo-outcome-authority.v1'
  && portfolio.agentOperatingModel?.ceoOutcomeOperationsContract === CEO_OUTCOME_OPERATION_CONTRACT
  && portfolio.agentOperatingModel?.ceoOutcomeEvaluationContract === CEO_OUTCOME_EVALUATION_CONTRACT
  && portfolio.agentOperatingModel?.ceoOutcomeDeliveryContract === CEO_OUTCOME_DELIVERY_CONTRACT
  && portfolio.agentOperatingModel?.companyOperationsStatusContract === 'supermega.company-operations-status.v1'
  && portfolio.agentOperatingModel?.companyOperationsWindowDays === 30
  && portfolio.agentOperatingModel?.weeklyReadOnlyOutcomeCount === 5
  && portfolio.agentOperatingModel?.allWeeklyOutcomesObserveCompanyOperations === true
  && portfolio.agentOperatingModel?.dailyCompanyControlUsesFx === false
  && portfolio.agentOperatingModel?.companyOperationsRawEvidenceReturned === false
  && portfolio.agentOperatingModel?.scheduledFunctionFootprintContract === 'supermega.kernel-function-footprint.v1'
  && portfolio.agentOperatingModel?.scheduledFunctionMaxEagerFiles === 30
  && portfolio.agentOperatingModel?.scheduledFunctionMaxEagerBytes === 409600
  && portfolio.agentOperatingModel?.fullPlatformStatusTeams?.join(',') === 'engineering,finance-risk'
  && portfolio.agentOperatingModel?.connectorFleetDeferredForDailyProductGrowth === true
  && portfolio.agentOperatingModel?.maxOutcomesPerCeoCycle === 1
  && portfolio.agentOperatingModel?.fixedReadOnlyEvidencePlan === true
  && portfolio.agentOperatingModel?.blockedOrDuplicateOutcomesConsumeModelCalls === false
  && portfolio.agentOperatingModel?.ceoClientIdentityRequiredBeforeClaims === true
  && portfolio.agentOperatingModel?.unavailableRequiredEvidenceConsumesModelCalls === false
  && portfolio.agentOperatingModel?.deliveryAttemptMetadataOnly === true
  && portfolio.agentOperatingModel?.deliveryFailureAutomaticRetry === false
  && portfolio.agentOperatingModel?.deliveryTransportUncertaintyExplicit === true
  && portfolio.agentOperatingModel?.uncertainWorkcellDeliveryAutomaticRetry === false
  && portfolio.agentOperatingModel?.completionMustBeDurableBeforeNotification === true
  && portfolio.agentOperatingModel?.explicitOwnerOutcomeAcceptance === true
  && portfolio.agentOperatingModel?.acceptedOutcomeEfficiencyUnits === COMPANY_USAGE_UNITS
  && portfolio.agentOperatingModel?.incompleteOutcomeCoverageProducesEfficiency === false
  && portfolio.agentOperatingModel?.ceoBriefTextStoredInOperations === false
  && portfolio.agentOperatingModel?.providerRowsStoredInOperations === false
  && portfolio.agentOperatingModel?.companyAiBudgetContract === 'supermega.company-ai-budget.v1'
  && portfolio.agentOperatingModel?.companyAiBudgetUnits === COMPANY_USAGE_UNITS
  && portfolio.agentOperatingModel?.companyAiBudgetWindow === 'utc_day'
  && portfolio.agentOperatingModel?.companyAiBudgetDefaultUnits === COMPANY_DAILY_BUDGET_DEFAULT_UNITS
  && portfolio.agentOperatingModel?.companyAiBudgetHardMaxUnits === COMPANY_DAILY_BUDGET_HARD_MAX_UNITS
  && portfolio.agentOperatingModel?.providerAttemptReservedBeforeNetwork === true
  && portfolio.agentOperatingModel?.providerFailuresRemainCharged === true
  && portfolio.agentOperatingModel?.cacheHitsReserveProviderBudget === false
  && portfolio.agentOperatingModel?.hostedAiBudgetRequiresDurableStore === true
  && portfolio.agentOperatingModel?.scaleToZero === true
  && portfolio.agentOperatingModel?.idleCapabilitiesConsumeCompute === false
  && portfolio.agentOperatingModel?.dynamicDelegation === false
  && portfolio.agentOperatingModel?.recursiveDelegation === false
  && portfolio.agentOperatingModel?.consequentialAuthority === 'founder')
requireContract('agent capacity agrees across HQ, coordinator, and Kernel',
  workforce.runtime_policy?.max_registered_specialists === portfolio.agentOperatingModel?.registeredRoleLimit
  && workforce.runtime_policy?.max_running === portfolio.agentOperatingModel?.activeAssignmentLimit
  && workforce.runtime_policy?.local_host_admission_contract === 'supermega.ally-host-admission.v1'
  && workforce.runtime_policy?.max_local_running === 1
  && workforce.runtime_policy?.local_memory_pressure_blocks_dispatch === true
  && workforce.runtime_policy?.local_duplicate_listener_blocks_dispatch === true
  && workforce.runtime_policy?.local_loaded_model_blocks_dispatch === true
  && workforce.runtime_policy?.max_batch_jobs === portfolio.agentOperatingModel?.batchJobLimit
  && workforce.runtime_policy?.scale_to_zero === portfolio.agentOperatingModel?.scaleToZero
  && workforce.runtime_policy?.registered_specialists_consume_compute === portfolio.agentOperatingModel?.idleCapabilitiesConsumeCompute
  && workforce.build_teams?.map((entry) => entry.id).join(',') === portfolio.agentOperatingModel?.buildTeams?.join(',')
  && MAX_REGISTERED_COMPANY_AGENTS === portfolio.agentOperatingModel?.registeredRoleLimit
  && kernelRoster.length === MAX_REGISTERED_COMPANY_AGENTS
  && MAX_RUNNING_COMPANY_CYCLES === portfolio.agentOperatingModel?.activeAssignmentLimit
  && workforce.runtime_policy?.capacity_claim_contract === COMPANY_CAPACITY_CLAIM_CONTRACT
  && workforce.runtime_policy?.capacity_claim_ttl_seconds === COMPANY_CAPACITY_CLAIM_TTL_SECONDS
  && MAX_CYCLE_AGENTS === portfolio.agentOperatingModel?.maxAgentsPerCycle
  && kernelCrewCapabilities.length === portfolio.agentOperatingModel?.validatedCrewCapabilities
  && new Set(kernelCrewCapabilities).size === kernelCrewCapabilities.length)
requireContract('CEO outcome authority is bounded and reconciled to HQ',
  SUPERMEGA_HQ_AUTHORITY.contract === portfolio.agentOperatingModel?.ceoOutcomeAuthority
  && SUPERMEGA_HQ_AUTHORITY.maxSelectedOutcomes === portfolio.agentOperatingModel?.maxOutcomesPerCeoCycle
  && SUPERMEGA_HQ_AUTHORITY.northStar === portfolio.northStar
  && ceoOutcomeSelection.ok === true
  && ceoOutcomeSelection.selected?.id === 'daily-company-control'
  && ceoOutcomeSelection.selected?.evidencePlan?.map((step) => step.tool).join(',') === 'leads_overview,pipeline_overview,company_operations_status'
  && SUPERMEGA_HQ_AUTHORITY.outcomes?.filter((item) => item.state === 'ready').length === 5
  && SUPERMEGA_HQ_AUTHORITY.outcomes?.filter((item) => item.state === 'ready').every((item) =>
    item.evidencePlan.length <= 4
    && item.evidencePlan.filter((step) => step.tool === 'company_operations_status').length === 1)
  && ceoOutcomeSelection.skipped?.filter((item) => item.reason === 'authority_blocked').length === 3
  && SUPERMEGA_HQ_AUTHORITY.outcomes?.find((item) => item.id === 'managed-storage-privacy-proof')?.sourceRefs
    ?.includes('https://www.instagram.com/p/Da-NXcnkz8p/?img_index=8'))
requireContract('CEO client identity fails before state, claims, tools, models, or sends',
  ceoClientGateIndex >= 0
  && ceoClientGateIndex < ceoExecutionClaimIndex
  && ceoClientGateIndex < ceoOperatorRunIndex
  && kernelBriefText.includes('const COMPANY_CLIENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/')
  && kernelBriefText.includes("reason: 'company_client_id_invalid'")
  && (kernelBriefText.match(/company_client_id_missing/g) || []).length === 1)
requireContract('unavailable fixed HQ evidence stops before synthesis and returns metadata only',
  hqEvidenceFailureIndex >= 0
  && hqEvidenceFailureIndex < operatorSynthesisIndex
  && kernelOperatorText.includes("planningMode === 'hq_authority_fixed'")
  && kernelOperatorText.includes("String(result?.data?.status || '').toLowerCase() !== 'unavailable'")
  && kernelOperatorText.includes('results: hqEvidenceMetadata(results)'))
requireContract('CEO owner delivery is durable, metadata-only, and never unsafely retried',
  ceoCompletionRecordIndex >= 0
  && ceoCompletionRecordIndex < ceoOwnerSendIndex
  && ceoOwnerSendIndex < ceoDeliveryRecordIndex
  && kernelBriefText.includes("retryable: false")
  && kernelBriefText.includes("delivery.status === 'uncertain' ? 'owner_delivery_uncertain'")
  && kernelBriefText.includes("if (!sent && delivery.status === 'failed')")
  && kernelBriefText.includes("delivery.status === 'uncertain' ? false : retryable")
  && kernelAlertText.includes("response?.ok === true")
  && kernelAlertText.includes("status: 'uncertain'")
  && kernelOperationsText.includes("export const CEO_OUTCOME_DELIVERY_CONTRACT = 'supermega.ceo-outcome-delivery.v1'")
  && kernelOperationsText.includes("const CEO_OUTCOME_DELIVERY_INPUT_FIELDS = new Set(['clientId', 'operationId', 'recordHash', 'deliveryClaimId', 'status'])")
  && kernelOperationsText.includes("CEO_DELIVERY_STATUSES = new Set(['sent', 'failed', 'uncertain'])")
  && !kernelOperationsText.includes("CEO_OUTCOME_DELIVERY_INPUT_FIELDS = new Set(['briefText'"))
requireContract('CEO platform evidence is exact, bounded, and secret-safe',
  ceoPlatformEvidence.contract === 'supermega.platform-status.v1'
  && ceoPlatformEvidence.status === 'ready'
  && ceoPlatformEvidence.persistence?.durable === true
  && ceoPlatformEvidence.connectors?.total === 69
  && ceoPlatformEvidence.ai?.configuredProviders === 2
  && ceoPlatformEvidence.ai?.failoverReady === true
  && ceoPlatformEvidence.agentCompany?.plannerReady === true
  && ceoPlatformEvidence.agentCompany?.actionMode === 'draft_only'
  && ceoPlatformEvidence.agentCompany?.maxAgents === MAX_CYCLE_AGENTS
  && ceoPlatformEvidence.agentCompany?.maxRoleBudget === MAX_CYCLE_ROLE_BUDGET
  && ceoPlatformEvidence.agentCompany?.dynamicDelegation === false
  && ceoPlatformEvidence.agentCompany?.recursiveDelegation === false
  && ceoPlatformEvidence.agentCompany?.modelRequest === false
  && ceoPlatformEvidence.agentCompany?.externalWrites === false
  && !/must-not-escape|tenant|prompt|providerError|reservationId|secret|token/i.test(JSON.stringify(ceoPlatformEvidence)))
requireContract('CEO company-operations evidence is measured, bounded, and output-free',
  ceoOperationsEvidence.contract === 'supermega.company-operations-status.v1'
  && ceoOperationsEvidence.status === 'ready'
  && ceoOperationsEvidence.counts?.accepted === 5
  && ceoOperationsEvidence.workforce?.availableAgents === 12
  && ceoOperationsEvidence.workforce?.utilizedAgents === 2
  && ceoOperationsEvidence.outcomes?.durable === true
  && ceoOperationsEvidence.outcomes?.efficiencyAvailable === true
  && ceoOperationsEvidence.controls?.metadataOnly === true
  && ceoOperationsEvidence.controls?.rawEvidenceReturned === false
  && ceoOperationsEvidence.controls?.modelOutputReturned === false
  && ceoOperationsEvidence.controls?.specialistOutputReturned === false
  && ceoOperationsEvidence.controls?.providerRowsReturned === false
  && !/must-not-escape|"clientId"|"agentId"|"briefText"/i.test(JSON.stringify(ceoOperationsEvidence)))
requireContract('workspace consumes one capacity authority without repeating ceilings',
  agentWorkspace.resource_id === 'supermega-core-agent-workspace-v3'
  && agentWorkspace.capacity_authority === 'repository://agent_os/workforce/supermega_build_workforce.json'
  && !Object.hasOwn(agentWorkspace, 'runtime_policy')
  && agentWorkspace.knowledge_resources?.some((entry) =>
    entry.id === 'workforce'
    && entry.reference === agentWorkspace.capacity_authority
    && entry.authority === 'sole agent capacity and team contract')
  && !/\b(?:175|256)\b/.test(agentWorkspaceText))
requireContract('workspace storage release gate denies bucket enumeration',
  agentWorkspace.trust_boundaries?.some((entry) =>
    entry.id === 'private-storage'
    && entry.rule.includes('bucket listing are denied')
    && entry.release_evidence?.join(',') === 'bucket inventory,anonymous listing denied,cross-tenant listing denied,short-lived authorized object access'))
requireContract('agent roster consolidation is recorded',
  workboard.includes('Current accepted operating checkpoint: `63a245f`')
  && workboard.includes('| OPS-011 | CEO + Agent Operations Codex | done-local |')
  && workboard.includes('12 active specialist identities while preserving all 15 validated crew capabilities')
  && workboard.includes('all eight fixed playbooks')
  && workboard.includes('| OPS-012 | CEO + Agent Operations Codex | done-local |')
  && workboard.includes('zero Agent Runs in 30 days')
  && workboard.includes('| OPS-014 | CEO + Agent Operations Codex | done-local |')
  && workboard.includes('workforce and capacity contracts to v2')
  && workboard.includes('execution follows the same order instead of reverting to FIFO')
  && workboard.includes('| OPS-015 | CEO + Agent Operations Codex | done-local |')
  && workboard.includes('automated admission due-only')
  && workboard.includes('before either a run or reservation is written')
  && workboard.includes('explicit manual runs remain available')
  && workboard.includes('| OPS-016 | CEO + Security Codex | done-local |')
  && workboard.includes('narrowing-only over the compiled app and canonical Cloud Run hosts')
  && workboard.includes('arbitrary, mixed, URL-shaped, and empty overrides fail before any request')
  && workboard.includes('| OPS-017 | CEO + Agent Operations Codex | done-local |')
  && workboard.includes('one bounded recovery attempt only to the four read-only')
  && workboard.includes('callers may narrow but cannot expand the policy')
  && workboard.includes('stale token')
  && workboard.includes('| OPS-018 | CEO + Release Security Codex | done-local |')
  && workboard.includes('atomically reserves the exact approved action and target before any deploy subprocess starts')
  && workboard.includes('leaves the approval non-reusable')
  && workboard.includes('| OPS-019 | CEO + Release Security Codex | done-local |')
  && workboard.includes('remove the unlinked claimable-preview service')
  && workboard.includes('nine required verification contracts')
  && workboard.includes('Local project linkage and exact Vercel environment credentials are absent')
  && workboard.includes('| OPS-020 | CEO + Release Security Codex | done-local |')
  && workboard.includes('deploy --prebuilt')
  && workboard.includes('all 213 Python tests, 61 coordinated-release checks')
  && workboard.includes('| OPS-021 | CEO + Agent Operations Codex | done-local |')
  && workboard.includes('| OPS-022 | CEO + Agent Operations / Security Codex | done-local |')
  && workboard.includes('four atomic durable capacity slots with 120-second stale recovery')
  && workboard.includes('zero production Agent Run projects in both 30 and 90 days')
  && workboard.includes('| OPS-023 | CEO + Release / Security Codex | done-local |')
  && workboard.includes('Vercel production the sole recurring scheduler')
  && workboard.includes('Cloud Tasks is enqueue-on-demand and Google Cloud Scheduler mutation is retired')
  && workboard.includes('| OPS-024 | CEO + Agent Operations / Security Codex | done-local |')
  && workboard.includes('4,096-token context and 30-second keep-alive')
  && workboard.includes('24-hour SHA-256 fingerprint')
  && workboard.includes('zero production and preview Agent Run projects in 90 days')
  && workboard.includes('| OPS-025 | CEO + Agent Operations / Security Codex | done-local |')
  && workboard.includes('routes all seven reviewed job families through SuperMega Agent Operations or the core GitHub feed')
  && workboard.includes('YTF connectors cannot render in core operations')
  && workboard.includes('| OPS-026 | CEO + Agent Operations / Security Codex | done-local |')
  && workboard.includes('scheduler authority v2 dormant with zero crons, zero scheduled invocations')
  && workboard.includes('at most 25 invocations/day instead of 97')
  && workboard.includes('| OPS-027 | CEO + Agent Operations / Security Codex | done-local |')
  && workboard.includes('adds `supermega.ceo-outcome-authority.v1`')
  && workboard.includes('removing the planner model call')
  && workboard.includes('| OPS-028 | CEO + Agent Operations / Security Codex | done-local |')
  && workboard.includes('adds `supermega.ceo-outcome-operation.v1` and `supermega.ceo-outcome-evaluation.v1`')
  && workboard.includes('Acceptance or revision is a separate immutable owner/operator decision')
  && workboard.includes('| OPS-029 | CEO + Ally Operations Codex | done-local |')
  && workboard.includes('adds `supermega.ally-runtime-audit.v1`')
  && workboard.includes('subagent count is not OS-observable')
  && workboard.includes('No process was stopped')
  && workboard.includes('| OPS-030 | CEO + Agent Operations / Release Security Codex | done-local |')
  && workboard.includes('add `supermega.scheduler-activation-evidence.v1`')
  && workboard.includes('The flag alone cannot activate')
  && workboard.includes('all 279 Python tests, 20 Vercel environment, 67 release, and 59 security checks pass')
  && workboard.includes('| OPS-031 | CEO + Agent Operations / Storage Security Codex | done-local |')
  && workboard.includes('adds `supermega.private-storage-privacy.v1`')
  && workboard.includes('the 11-case zero-network self-test, all 291 Python tests')
  && workboard.includes('| OPS-032 | CEO + Agent Operations / Storage Security Codex | done-local |')
  && workboard.includes('adds `storage:privacy:preflight`')
  && workboard.includes('all 292 Python tests')
  && workboard.includes('| OPS-033 | CEO + Ally Operations Codex | done-local |')
  && workboard.includes('Eight dormant artifact or duplicate-browser plugins and ambient suggestions are disabled')
  && workboard.includes('issued zero termination calls, and released 2,027.8 MB')
  && workboard.includes('| OPS-034 | CEO + Agent Operations / Cost Security Codex | done-local |')
  && workboard.includes('adds `supermega.company-ai-budget.v1`')
  && workboard.includes('| OPS-042 | CEO + Agent Operations / Cost Security Codex | done-local |')
  && workboard.includes('failed or `unavailable` required fixed-evidence result stops the remaining plan and synthesis')
  && workboard.includes('| OPS-043 | CEO + Agent Operations / Delivery Security Codex | done-local |')
  && workboard.includes('Checkpoints `cafdafe` and `f626ee7` add `supermega.ceo-outcome-delivery.v1`')
  && workboard.includes('Current accepted agent-operations checkpoint: `a2e1b89`')
  && now.includes('agent operations `a2e1b89`')
  && now.includes('operations `63a245f`')
  && now.includes('Ally stays zero-subagent; multi-agent is disabled')
  && now.includes('no duplicate dev server or loaded local model')
  && now.includes('Idle Ollama hosts were stopped')
  && now.includes('YTF identities cannot render in core operations')
  && now.includes('Hosted scheduling remains deliberately dormant')
  && now.includes('flag-only, preview, stale, incomplete, or tampered activation attempts stop before worker invocation')
  && now.includes('Each CEO cycle selects one outcome')
  && now.includes('owner-send uncertainty is explicit, retains claims, and is never auto-retried')
  && now.includes('Storage privacy now has a six-request owner-confirmed verifier')
  && now.includes('zero-network configuration preflight')
  && now.includes('overrides fail closed and duplicate ceilings are removed'))
requireContract('agent security brief is reconciled to current controls',
  agentSecurity.includes('Agent-operations checkpoint: `a2e1b89`')
  && agentSecurity.includes('Agent visibility, execution, and preview deployment use separate capabilities')
  && agentSecurity.includes('The root development Compose entry point is retired as `services: {}`')
  && agentSecurity.includes('An environment value cannot add a third credential destination')
  && agentSecurity.includes('Expired leases may reclaim the same run once only for the four read-only jobs')
  && agentSecurity.includes('Preview deployment approval is atomically reserved before a deploy subprocess starts')
  && agentSecurity.includes('authority v2 is dormant')
  && agentSecurity.includes('zero crons and zero scheduled invocations')
  && agentSecurity.includes('capped at 25 invocations/day instead of 97')
  && agentSecurity.includes('post-deploy verification rejects every surviving cron')
  && agentSecurity.includes('CEO outcome evidence now follows `supermega.ceo-outcome-operation.v1`')
  && agentSecurity.includes('Hosted scheduler activation now follows `supermega.scheduler-activation-evidence.v1`')
  && agentSecurity.includes('an HMAC-signed exact-shape bundle must bind the scheduler-authority digest')
  && agentSecurity.includes('Managed Storage privacy now has `supermega.private-storage-privacy.v1`')
  && agentSecurity.includes('The 11-case self-test makes zero network requests')
  && agentSecurity.includes('`storage:privacy:preflight` now loads the same exact target')
  && agentSecurity.includes('Company model calls now follow `supermega.company-ai-budget.v1`')
  && agentSecurity.includes('Daily AI-budget telemetry is already implemented')
  && agentSecurity.includes('CEO platform-status reads now follow `supermega.platform-status.v1`')
  && agentSecurity.includes('Every ready weekly CEO outcome now reads `supermega.company-operations-status.v1`')
  && agentSecurity.includes('Scheduled CEO startup now follows `supermega.kernel-function-footprint.v1`')
  && agentSecurity.includes('Scheduled CEO preflight now fails before spend (`f1328a0`)')
  && agentSecurity.includes('Scheduled owner delivery now follows acknowledgement-aware idempotency (`cafdafe`, `f626ee7`)')
  && agentSecurity.includes('Efficiency remains unavailable unless the tenant-bound records are durable')
  && agentSecurity.includes('Hosted cleanup still requires a protected deployment')
  && agentSecurity.includes('The unlinked claimable-preview service is retired')
  && agentSecurity.includes('Human review is bound to one clean commit')
  && agentSecurity.includes('builds once, rechecks the canonical project')
  && agentSecurity.includes('pinned `--prebuilt`')
  && agentSecurity.includes('four atomic durable capacity claims')
  && agentSecurity.includes('old Google Cloud Scheduler entry point is now a read-only compatibility shim')
  && agentSecurity.includes('no production or preview project activity over 90 days')
  && agentSecurity.includes('prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG')
  && agentSecurity.includes('SuperMega CEO brief now follows `supermega.ceo-outcome-authority.v1`')
  && agentSecurity.includes('removing the planner model call')
  && !agentSecurity.includes('queue viewing can authorize processing or preview deployment')
  && !agentSecurity.includes('root development compose publishes services'))
requireContract('private Storage audit handoff is offline-first and secret-free',
  storageAuditHandoff.includes('Verifier: `supermega.private-storage-privacy.v1`')
  && storageAuditHandoff.includes('This handoff is not approval to run against `supermegabase`')
  && storageAuditHandoff.includes('npm.cmd run storage:privacy:preflight')
  && storageAuditHandoff.includes('--confirm-read-only-audit $env:SUPERMEGA_STORAGE_PRIVACY_OWNER_APPROVAL_ID')
  && storageAuditHandoff.includes('provider_credentials_verified` equal to `false`')
  && storageAuditHandoff.includes('Cleanup is destructive provider activity')
  && packageText.includes('"storage:privacy:preflight": "node tools/run_python_tool.mjs tools/verify_private_storage_privacy.py --preflight"')
  && storageAuditHandoff.length < 7000
  && !/sb_secret_|eyJ[A-Za-z0-9_-]{12,}|fixture-signed-token/.test(storageAuditHandoff))
requireContract('product QA brief matches current portfolio',
  qaBrief.includes('Work item: `QA-003`')
  && qaBrief.includes('Mode: read-only')
  && qaBrief.includes('Website and Ecommerce are local release candidates')
  && qaBrief.includes('AI assistance remains a shared, evaluation-gated capability')
  && ['/shop/?tab=orders', '/shop/?tab=inventory', '/plant/?tab=production', '/plant/?tab=control', '/website/', '/ecommerce/', '/agents/']
    .every((route) => qaBrief.includes(`\`${route}\``))
  && qaBrief.includes('Do not edit files or browser data.')
  && !qaBrief.includes('Work item: `QA-002`')
  && !qaBrief.includes('Ecommerce and AI Agent Solutions are visibly planned'))
requireContract('product QA brief is discoverable from assignment authority',
  workboard.includes('| QA-003 | Product / QA Codex | done-local |')
  && workboard.includes('Checkpoint `dadb013` passes 10 routes at 390/1280 px')
  && workboard.includes('focus lands on `#workspace-main`'))
requireContract('accepted core checkpoints lead directly to real work',
  workboard.includes('Current accepted product checkpoint: `7ae8c80617b73c4827bfbc08f74262685620a86f`')
  && workboard.includes('| ENG-075 | Shop + Data Engineering Codex | done-local |')
  && workboard.includes('| ENG-076 | Plant + Manufacturing Engineering Codex | done-local |')
  && workboard.includes('| ENG-077 | Website + Product Engineering Codex | done-local |')
  && workboard.includes('| ENG-078 | Ecommerce + Commerce Engineering Codex | done-local |')
  && workboard.includes('Checkpoint `52917c5` adds a multi-line buying workspace')
  && workboard.includes('| ENG-079 | Shop + Data Integrity Codex | done-local |')
  && workboard.includes('making the store replace forged receipt actor/time')
  && workboard.includes('| ENG-080 | Shop + Data Integrity Codex | done-local |')
  && workboard.includes('replaces forged cancellation actor/time with the authenticated human')
  && workboard.includes('| ENG-081 | Shop + Pricing Integrity Codex | done-local |')
  && workboard.includes('derive the whole-MMK subtotal from current catalog prices')
  && workboard.includes('| ENG-082 | Shop + Operator UX Codex | done-local |')
  && workboard.includes('New records display the immutable calculation')
  && workboard.includes('| ENG-083 | Shop + Accounting Integrity Codex | done-local |')
  && workboard.includes('New closes cannot predate included payment or completion evidence')
  && workboard.includes('| ENG-084 | Plant + Manufacturing UX Codex | done-local |')
  && workboard.includes('one prefilled material plus up to 11 optional pipe-delimited BOM rows')
  && workboard.includes('including zero for explicit shortage evidence')
  && workboard.includes('| ENG-085 | Ecommerce + Shop Engineering Codex | done-local |')
  && workboard.includes('records exact V2 carts in the tenant-bound revisioned Shop workspace')
  && workboard.includes('Legacy V1 requests stay readable')
  && workboard.includes('| ENG-086 | Plant + Manufacturing Engineering Codex | done-local |')
  && workboard.includes('embeds the versioned digest-chained execution ledger in managed Production state')
  && workboard.includes('All 298 Python tests, 31 Plant model and 258 Production runtime checks')
  && workboard.includes('| ENG-087 | Website + Release Engineering Codex | done-local |')
  && workboard.includes('stores bounded digest-chained release ledgers per approved site file in managed Website state')
  && workboard.includes('All 300 Python tests, 94 Website and 23 release-model checks')
  && workboard.includes('| ENG-088 | Plant + Manufacturing Engineering Codex | done-local |')
  && workboard.includes('adds backward-compatible v2 execution plans while retaining v1 history')
  && workboard.includes('All 302 Python tests, 42 Plant and 258 Production runtime checks')
  && workboard.includes('| ENG-089 | Shop + Plant Manufacturing Integrity Codex | done-local |')
  && workboard.includes('records exactly one authenticated negative `production_issue` movement')
  && workboard.includes('All 306 Python tests, 221 Commerce/42 Plant/258 Production checks')
  && workboard.includes('| ENG-090 | Shop + Performance Codex | done-local |')
  && workboard.includes('initial JavaScript chunk falls from 479,774 to 472,527 bytes')
  && workboard.includes('| ENG-091 | Shop + Warehouse Integrity Codex | done-local |')
  && workboard.includes('location totals drift from aggregate Shop stock fail closed')
  && workboard.includes('All 309 Python tests, 25 Shop inventory/221 Commerce checks')
  && workboard.includes('| ENG-092 | Shop + Warehouse Integrity Codex | done-local |')
  && workboard.includes('appends the aggregate purchase receipt and exactly one linked location receipt')
  && workboard.includes('All 310 Python tests, 33 Shop inventory/221 Commerce checks')
  && workboard.includes('| ENG-093 | Shop + Simplification/Data Integrity Codex | done-local |')
  && workboard.includes('proves only `COMMERCE_KEY` is written')
  && workboard.includes('Legacy standalone browser records stay untouched but are no longer read')
  && workboard.includes('28 Shop inventory/221 Commerce checks')
  && workboard.includes('| ENG-094 | Shop + Warehouse Integrity Codex | done-local |')
  && workboard.includes('one deterministic fewest-lot `order_reserve`, `order_release`, or `order_fulfil` command')
  && workboard.includes('All 312 Python tests, 39 Shop inventory/221 Commerce checks')
  && workboard.includes('| ENG-095 | Shop + Warehouse Integrity Codex | done-local |')
  && workboard.includes('A managed count includes reserved physical units')
  && workboard.includes('All 313 Python tests, 44 Shop inventory/221 Commerce checks')
  && workboard.includes('| ENG-096 | Shop + Plant Manufacturing Integrity Codex | done-local |')
  && workboard.includes('One deterministic `PIS` command binds the Plant request digest')
  && workboard.includes('All 314 Python tests, 50 Shop inventory/221 Commerce/258 Production checks')
  && workboard.includes('| ENG-097 | Shop + Warehouse Integrity Codex | done-local |')
  && workboard.includes('one deterministic `ORT` command bound to the order, SKU, quantity, human evidence')
  && workboard.includes('All 314 Python tests, 54 Shop inventory/221 Commerce/258 Production checks')
  && workboard.includes('previewed `Main store / OPENING-001`')
  && workboard.includes('Checkpoints `0831ad7` and `920c13d` add an immutable reviewed BOM/routing package')
  && workboard.includes('Checkpoints `0f3dc09` and `03e1f1b` add tenant-bound')
  && workboard.includes('Retain the completed Shop, Plant, Website, and Ecommerce checkpoints')
  && now.includes('Current checkpoints: product `7ae8c80`, CEO preflight `f1328a0`, delivery `cafdafe`/`f626ee7`, CEO operations `909807d`, performance `6bad4e7`, release `39642eb`')
  && now.includes('First-action QA routes Shop, Plant, and Website blockers to the next task')
  && now.includes('The active delivery focus is:')
  && now.includes('Plant Jobs persists managed BOM/routing, WIP, minutes')
  && now.includes('operation/output requires exact authenticated Shop issue evidence')
  && now.includes('one manifest-backed smart import')
  && now.includes('The public site exposes four direct product links with no template catalogue')
  && now.includes('Shop Stock has one Commerce authority')
  && now.includes('Orders and Website conversions reserve deterministic location/lots')
  && now.includes('sellable returns restore the exact fulfilled location/lot')
  && now.includes('Managed workspaces retain exact requests in the Shop inbox')
  && now.includes('`npm run dev` starts canonical FastAPI plus Vite on loopback')
  && now.includes('Records stay browser-local; hosted activation is not proven')
  && !now.includes('probe remains 500'))
requireContract('release history is retained and current live state is discoverable',
  workboard.includes('| OPS-006 | Release / Codex integrator | done-local |')
  && workboard.includes('strict fast-forward descendant of open draft PR #258 head `338b6fd`')
  && workboard.includes('release-reconciliation-2026-07-26.md')
  && /^[0-9a-f]{40}$/.test(liveReleaseCommit)
  && now.includes(`Both \`supermega.dev\` and \`app.supermega.dev\` serve exact remote \`main\` commit \`${liveReleaseCommit}\``)
  && workboard.includes('| CEO-010 | CEO / Codex integrator | done-live |')
  && workboard.includes('focused bottom sheet with backdrop, Escape/Close actions, 44 px controls, and focus return'))
requireContract('workboard release authority and active execution order are current',
  workboard.includes('Integration branch: `main`')
  && workboard.includes('Current accepted release checkpoint: `39642eb7a881a09899a030bbdfb68a5687f12fc6`')
  && workboard.includes('| UX-005 | Website + Product UX Codex | released |')
  && workboard.includes('standalone HTML download; connected managed workspaces add evidence, approval, and release records')
  && workboardExecutionOrder.includes('usable Website download checkpoint `e18fc6bc`')
  && workboardExecutionOrder.includes('newly approved isolated Supabase target')
  && workboardExecutionOrder.includes('Repeat the 12-profile rehearsal against the live isolated release')
  && workboardExecutionOrder.includes('exact-commit protected preview')
  && workboardExecutionOrder.includes('fresh live-HQ snapshot')
  && workboardExecutionOrder.includes('Keep hosted scheduling and AI provider execution dormant')
  && !workboardExecutionOrder.includes('PR #258')
  && !workboardExecutionOrder.includes('fast-forward only the existing draft'))
requireContract('release reconciliation binds exact Git and Vercel evidence',
  releaseReconciliation.includes('Audited implementation checkpoint: `b67db9422b523df0c1707f8dc39082ffa1c7a8dd`')
  && releaseReconciliation.includes('Live `main`: `6885c3201d523d42d176c3dcd91de28dc1e17f6f`')
  && releaseReconciliation.includes('Remote pull-request head: `338b6fd11bc27da9b7aa42bee2c293a5c0e3a9ef`')
  && releaseReconciliation.includes('0 commits behind and 230 commits ahead')
  && releaseReconciliation.includes('129 files changed, 45,291 insertions, and 4,455 deletions')
  && releaseReconciliation.includes('`supermega.dev` from Vercel project `supermega-public`')
  && releaseReconciliation.includes('`app.supermega.dev` from Vercel project `megaos`')
  && releaseReconciliation.includes('dpl_Dc5U4M2fXkob3KejYAYDv4jAjEw1')
  && releaseReconciliation.includes('dpl_FL5eESWF2vGJffydGAVNA4vPQzdp'))
requireContract('release action remains owner-gated and push-only',
  releaseReconciliation.includes('combined-status endpoint returned no status contexts for remote checkpoint `338b6fd`')
  && releaseReconciliation.includes('perform one normal fast-forward-only push')
  && releaseReconciliation.includes('Do not force push.')
  && releaseReconciliation.includes('Do not merge, deploy, promote, change aliases or domains')
  && releaseReconciliation.includes('No GitHub, Vercel, DNS, Supabase, domain, deployment, alias, environment, credential, payment, or production state was changed'))

requireContract('Shop uses the stable commerce runtime',
  product('shop')?.name === 'Shop'
  && product('shop')?.runtimeSurface === 'commerce'
  && product('shop')?.compatibilityPath === '/operations/commerce/'
  && product('shop')?.surfaces?.join(',') === 'Sell,Orders,Stock'
  && product('shop')?.templateContract?.productId === 'commerce')
requireContract('Plant uses the stable production runtime',
  product('plant')?.name === 'Plant'
  && product('plant')?.runtimeSurface === 'production'
  && product('plant')?.compatibilityPath === '/operations/production/'
  && product('plant')?.surfaces?.join(',') === 'Jobs,Problems'
  && product('plant')?.templateContract?.productId === 'production')
requireContract('Website remains truthful',
  product('website')?.status === 'release-candidate-local'
  && product('website')?.surfaces?.join(',') === 'Preview,Edit,Download'
  && product('website')?.templateContract?.productId === 'website'
  && product('website')?.nextGate?.includes('named-business brief'))
requireContract('Ecommerce is separate and truthfully limited after cart-to-Shop completion and before hosted or payment proof',
  product('ecommerce')?.status === 'release-candidate-local'
  && product('ecommerce')?.job?.includes('read-only Shop catalogue')
  && product('ecommerce')?.surfaces?.join(',') === 'Store,Edit store,Cart,Quote,Shop review'
  && product('ecommerce')?.templateContract?.productId === 'ecommerce'
  && product('ecommerce')?.nextGate?.includes('protected preview')
  && product('ecommerce')?.nextGate?.includes('isolated managed tenant')
  && product('ecommerce')?.nextGate?.includes('tax, shipping, and payment adapters')
  && product('ecommerce')?.nextGate?.includes('accountable approval')
  && product('ecommerce')?.nextGate?.includes('duplicate-safe recovery'))
requireContract('shared AI assistance starts with Order Intake',
  sharedCapability('ai-assistance')?.status === 'gated-r-and-d'
  && sharedCapability('ai-assistance')?.firstWorkflow === 'Order Intake'
  && sharedCapability('ai-assistance')?.nextGate?.includes('zero side effects'))
requireContract('internal systems are not customer products',
  portfolio.internalSystems?.map((entry) => entry.id).join(',') === 'company-system,rnd-system'
  && internalSystem('company-system')?.name === 'SuperMega HQ'
  && internalSystem('rnd-system')?.public === false)

requireContract('manifest has one canonical four-product registry',
  manifest.schemaVersion === 'supermega.site-context.v2'
  && manifest.customerProducts?.map((entry) => `${entry.id}:${entry.runtimeId}:${entry.name}`).join(',')
    === 'shop:commerce:Shop,plant:production:Plant,website:website:Website,ecommerce:ecommerce:Ecommerce')
requireContract('manifest customer routes are canonical',
  manifest.customerProducts?.map((entry) => entry.appRoute).join(',')
    === 'https://app.supermega.dev/shop/?tab=counter,https://app.supermega.dev/plant/?tab=production,https://app.supermega.dev/website/,https://app.supermega.dev/ecommerce/')
requireContract('manifest shared capability is separate from products',
  manifest.sharedCapabilities?.map((entry) => `${entry.id}:${entry.status}:${entry.firstWorkflow}`).join(',')
    === 'ai-assistance:gated-r-and-d:Order Intake')

const expectedInternalPackIds = {
  shop: 'retail,cafe,restaurant,spa,gym,school',
  plant: 'general-manufacturing,batch-process,food-beverage,apparel,assembly',
}
requireContract('internal template packs are bounded configuration, not code forks',
  manifest.templatePackPolicy?.contract === 'supermega.product-template-pack.v1'
  && manifest.templatePackPolicy?.internalConfigurationOnly === true
  && manifest.templatePackPolicy?.sharedCoreNoClientForks === true
  && manifest.templatePackPolicy?.plannedModulesMayNotBeSoldAsAvailable === true
  && manifest.templatePackPolicy?.maxEnabledModulesAtLaunch === 6
  && manifest.templatePackPolicy?.lifecycle?.join(',') === 'choose-pack,map-import,preview-sample,named-operator-pilot,managed-activation,measure-and-iterate'
  && manifest.templatePackPolicy?.importWorkflow?.join(',') === 'upload,map,validate,preview,named-human-confirm,activate')
for (const [productId, expectedIds] of Object.entries(expectedInternalPackIds)) {
  const packs = manifest.customerProducts?.find((entry) => entry.id === productId)?.internalTemplatePacks
  requireContract(`${productId} internal packs are honest and bounded`,
    packs?.map((entry) => entry.id).join(',') === expectedIds
    && packs.every((entry) => entry.status === 'core-compatible'
      && entry.firstWorkflow?.trim()
      && entry.availableNow?.length >= 4
      && entry.availableNow.length <= manifest.templatePackPolicy.maxEnabledModulesAtLaunch
      && entry.plannedNext?.length >= 1))
}

const expectedTemplateIds = {
  commerce: 'social-commerce,retail-wholesale,restaurant-ordering',
  production: 'production-control,maintenance-downtime,quality-traceability',
  website: 'business-presence,lead-generation,catalog-showcase',
  ecommerce: 'social-storefront,pickup-preorder,wholesale-request',
}
let workflowProfileCount = 0
for (const runtimeSurface of Object.keys(expectedTemplateIds)) {
  const manifestProduct = manifest.customerProducts?.find((entry) => entry.runtimeId === runtimeSurface)
  requireContract(`${runtimeSurface} template set is supported`,
    manifestProduct?.templates?.map((entry) => entry.id).join(',') === expectedTemplateIds[runtimeSurface])
  requireContract(`${runtimeSurface} template profiles are executable`,
    manifestProduct?.templates?.every((entry) =>
      entry.outcome?.trim()
      && entry.metric?.trim()
      && entry.workflow?.length >= 5
      && entry.entryPoints?.length >= 3))
  workflowProfileCount += manifestProduct?.templates?.length || 0
}

requireContract('current direction owns the corrected boundary',
  current.includes('The customer portfolio is exactly **Shop**, **Plant**, **Website**, and **Ecommerce**')
  && current.includes('AI assistance** is a shared capability inside those products, not a fifth product')
  && current.includes('`commerce` and `production` remain stable internal runtime')
  && current.includes('Ecommerce is not a second Shop back office')
  && current.includes('SuperMega HQ, R&D, agent coordination, Ops, Console, and machine coordination are internal'))
requireContract('canonical product routes are stated',
  ['/shop/', '/plant/', '/website/', '/ecommerce/']
    .every((route) => current.includes(`\`${route}\``)))
requireContract('legacy Agents path resolves to internal coordination',
  current.includes('`/agents/` — compatibility-only path to HQ')
  && current.includes('it is not a product route or separate workspace'))
requireContract('owner authority remains explicit',
  current.includes('External sends, payments, publishing, access changes, deployment, and production writes remain owner-approved')
  && now.includes('No external send, payment, refund, publish, domain change, connector write, merge, deployment, access change, production database write'))
requireContract('Home prioritizes products before internal machinery',
  now.includes('Home keeps Shop and Plant exceptions above collapsed HQ work.')
  && now.includes('a Plant issue badge links to Problems and otherwise the card opens Jobs.')
  && now.includes('`/work/` stays labelled HQ')
  && now.includes('bottom navigation reads Home, HQ, and Products'))
requireContract('local and managed truth remains explicit',
  current.includes('The default app remains an isolated browser-local trial')
  && current.includes('Managed mode remains locked behind authenticated tenant identity')
  && now.includes('hosted activation is not proven'))
requireContract('research decision is superseded',
  research.includes('superseded in part by the founder')
  && research.includes('Shop and Plant are the canonical customer-facing operating products')
  && research.includes('Ecommerce owns the storefront and order-intent layer and feeds Shop'))

requireContract('local PostgreSQL rehearsal remains bounded',
  databaseRehearsal.schemaVersion === 'supermega.hq.database-rehearsal.v1'
  && /^[0-9a-f]{40}$/.test(databaseRehearsal.implementationCommit || '')
  && databaseRehearsal.engine?.major === 17
  && databaseRehearsal.engine?.tlsActive === true
  && databaseRehearsal.engine?.loopbackOnly === true
  && databaseRehearsal.runtime?.adapter === 'PostgresTrialStore'
  && databaseRehearsal.runtime?.explicitTransaction === true
  && databaseRehearsal.migration?.count === 6
  && databaseRehearsal.migration?.schemaVersion === 5
  && databaseRehearsal.migration?.productionValidatorReady === true
  && Object.keys(databaseRehearsal.checks || {}).length === 37
  && Object.values(databaseRehearsal.checks || {}).every((value) => value === true)
  && databaseRehearsal.checks?.capabilityScopedReads === true
  && databaseRehearsal.checks?.capabilityScopedEventReads === true
  && databaseRehearsal.checks?.approvalRequesterReadScoped === true
  && databaseRehearsal.checks?.approvalReviewerReadsAll === true
  && databaseRehearsal.checks?.writeCapabilityImpliesRead === true
  && databaseRehearsal.safety?.cleanupComplete === true
  && databaseRehearsal.safety?.secretValuesExposed === false
  && databaseRehearsal.safety?.productionMutated === false
  && databaseRehearsal.safety?.supabaseMutated === false
  && databaseRehearsal.safety?.vercelMutated === false)

requireContract('current authority includes HQ',
  current.includes('hq/portfolio.json')
  && current.includes('## Internal company system and R&D'))
requireContract('OneDrive archive is not authority',
  readme.includes('historical archive and source intake')
  && readme.includes('does not override this repository'))
requireContract('source provenance retained',
  ['1VkuZ5_aUQ7DiYirt2asvzwsQJT9F_AuA', '1uxZ1Ey8xLX5yGmOCZrJ7Mx3I0HMd1unT', 'DawBDyzkTf8', '7483054882816675840']
    .every((token) => readme.includes(token)))
requireContract('HQ stays concise',
  readme.length < 7000
  && now.length < 9000
  && qaBrief.length < 6000
  && current.length < 14000
  && portfolioText.length < 16000)
requireContract('research remains gated',
  portfolio.researchGates?.some((entry) => entry.decision === 'reject')
  && current.includes('Resource intelligence stays inside HQ'))
requireContract('research uses official sources',
  portfolio.researchGates?.every((entry) =>
    /^https:\/\/(?:vercel\.com|tanstack\.com|supabase\.com|platform\.openai\.com)\//.test(entry.source || '')))
requireContract('Ally runtime audit is read-only and bounded',
  allyAuditText.includes("supermega.ally-runtime-audit.v1")
  && allyAuditText.includes("$HostAdmissionContract = 'supermega.ally-host-admission.v1'")
  && allyAuditText.includes('$port -ge 5173 -and $port -le 5199')
  && allyAuditText.includes('maxConcurrentLocalRuns')
  && allyAuditText.includes("subagentObservation = 'not_os_observable'")
  && allyAuditText.includes('commandLinesInspectedForOwnership = $true')
  && allyAuditText.includes('commandLinesReturned = $false')
  && allyAuditText.includes('secretValuesReturned = $false')
  && allyAuditText.includes('environmentRead = $false')
  && allyAuditText.includes('automaticCleanup = $false')
  && allyAuditText.includes("http://127.0.0.1:11434/api/ps")
  && allyAuditText.includes('Get-NetTCPConnection -State Listen')
  && packageText.includes('"audit:ally"')
  && packageText.includes('"audit:ally:self-test"')
  && !/\b(?:Stop-Process|Start-Process|taskkill|kill|Remove-Item|EmptyWorkingSet|SetProcessWorkingSetSize)\b/i.test(allyAuditText))

requireContract('Ally company cycles are host-admitted and serial',
  allyCompanyCycleText.includes("$Contract = 'supermega.ally-company-cycle.v1'")
  && allyCompanyCycleText.includes("$HostAdmissionContract = 'supermega.ally-host-admission.v1'")
  && allyCompanyCycleText.includes("throw 'ally_local_job_limit_exceeded'")
  && allyCompanyCycleText.includes('ally_host_admission_blocked:')
  && allyCompanyCycleText.includes("'--job-type', $JobType")
  && allyCompanyCycleText.includes('scale to zero after completion')
  && !/\b(?:Stop-Process|Start-Process|taskkill|kill|Remove-Item|EmptyWorkingSet|SetProcessWorkingSetSize)\b/i.test(allyCompanyCycleText))

requireContract('live HQ state is machine-verifiable and read-only',
  now.includes('Live state contract: `supermega.hq-live-state.v1`')
  && /^Live release commit: `[0-9a-f]{40}`$/m.test(now)
  && now.includes('Live operating mode: `isolated_demo`')
  && now.includes('Live scheduler status: `degraded`')
  && now.includes('Live scheduler configured: `false`')
  && now.includes('Live managed persistence ready: `false`')
  && now.includes('Live security ready: `false`')
  && hqLiveStateVerifier.includes("const CONTRACT = 'supermega.hq-live-state.v1'")
  && hqLiveStateVerifier.includes("const APP_ORIGIN = 'https://app.supermega.dev'")
  && hqLiveStateVerifier.includes("const PUBLIC_ORIGIN = 'https://supermega.dev'")
  && hqLiveStateVerifier.includes('const MAX_HQ_NOW_BYTES = 128 * 1_024')
  && hqLiveStateVerifier.includes("fetchJson(`${APP_ORIGIN}/api/cloud-autonomy/status`)")
  && hqLiveStateVerifier.includes("redirect: 'error'")
  && hqLiveStateVerifier.includes("requireCheck('hq_operating_mode_invalid'")
  && hqLiveStateVerifier.includes("requireCheck('hq_security_readiness_invalid'")
  && hqLiveStateVerifier.includes("requireCheck('snapshot_stale'")
  && hqLiveStateVerifier.includes("requireCheck('capacity_not_scale_to_zero'")
  && hqLiveStateVerifier.includes("requireCheck('registered_specialists_consume_compute'")
  && !/\b(?:writeFile|appendFile|unlink|rm|POST|PUT|PATCH|DELETE)\b/.test(hqLiveStateVerifier)
  && packageText.includes('"hq:verify:live"')
  && packageText.includes('"hq:verify:live:self-test"')
  && workboard.includes('| OPS-038 | CEO + Release Operations Codex | done-local |')
  && workboard.includes('Checkpoint `bc19dac2` adds `supermega.hq-live-state.v1`')
  && workboard.includes('A one-off non-terminating working-set trim released 2,084.8 MB'))

requireContract('current CEO platform evidence is recorded without expanding authority',
  workboard.includes('| OPS-039 | CEO + Agent Operations / Evidence Quality Codex | done-local |')
  && workboard.includes('Checkpoint `e8a3adb` adds `supermega.platform-status.v1`')
  && workboard.includes('All 289 Kernel tests, 69 connectors across 993 adversarial calls, 15 crews across 214 checks, plus the complete app gate with 69 release and 70 security checks pass')
  && now.includes('CEO status and 30-day operations evidence are secret-safe, output-free')
  && now.includes('No process, task, or server was stopped'))

requireContract('current company-operations evidence is recorded without adding runtime capacity',
  workboard.includes('| OPS-040 | CEO + Agent Operations / Evidence Quality Codex | done-local |')
  && workboard.includes('Checkpoint `909807d` adds `supermega.company-operations-status.v1`')
  && workboard.includes('All 291 Kernel tests, 69 connectors across 993 adversarial calls, 15 crews across 214 checks')
  && now.includes('present in all five weekly briefs')
  && now.includes('daily control no longer fetches FX'))

requireContract('scheduled CEO function keeps the full connector fleet deferred and budgeted',
  kernelPackageText.includes('"function:footprint": "node scripts/verify-function-footprint.mjs"')
  && kernelPackageText.includes('npm run function:footprint')
  && kernelFootprintVerifier.includes("const MAX_EAGER_FILES = 30")
  && kernelFootprintVerifier.includes('const MAX_EAGER_BYTES = 400 * 1024')
  && kernelFootprintVerifier.includes("fullStatusNotEager: !relativeFiles.includes('api/status.mjs')")
  && kernelFootprintVerifier.includes("connectorFleetNotEager: !relativeFiles.includes('connectors/index.mjs')")
  && kernelFootprintVerifier.includes("statusImportIsDeferred: toolsSource.includes(\"await import('./api/status.mjs')\")")
  && kernelFootprintVerifier.includes('connectorInventoryComplete: connectorImports === EXPECTED_CONNECTORS')
  && workboard.includes('| OPS-041 | CEO + Agent Operations / Vercel Efficiency Codex | done-local |')
  && workboard.includes('Checkpoint `6bad4e7` defers full status from the operator tool import')
  && now.includes('CEO brief startup is capped at 30 eager files/409,600 bytes')
  && now.includes('full 69-connector audit loads only for Engineering and Finance/Risk'))

for (const forbidden of ['Yangon Tyre', 'ytf.supermega.dev', 'pos.supermega.dev', 'twelve product']) {
  requireContract(`retired HQ context absent: ${forbidden}`,
    !`${readme}\n${now}\n${current}\n${portfolioText}`.toLowerCase().includes(forbidden.toLowerCase()))
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, contract: 'supermega_hq', failures }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({
  ok: true,
  contract: 'supermega_hq',
  products: portfolio.products.map((entry) => entry.id),
  sharedCapabilities: portfolio.sharedCapabilities.map((entry) => entry.id),
  internalSystems: portfolio.internalSystems.map((entry) => entry.id),
  agentOperatingModel: {
    registeredRoles: portfolio.agentOperatingModel.registeredRoleLimit,
    activeAssignments: portfolio.agentOperatingModel.activeAssignmentLimit,
    crewCapabilities: portfolio.agentOperatingModel.validatedCrewCapabilities,
    ceoOutcomeAuthority: portfolio.agentOperatingModel.ceoOutcomeAuthority,
    maxOutcomesPerCeoCycle: portfolio.agentOperatingModel.maxOutcomesPerCeoCycle,
    selectedCeoOutcome: ceoOutcomeSelection.selected.id,
    companyDailyAiBudget: {
      units: portfolio.agentOperatingModel.companyAiBudgetUnits,
      default: portfolio.agentOperatingModel.companyAiBudgetDefaultUnits,
      hardMax: portfolio.agentOperatingModel.companyAiBudgetHardMaxUnits,
    },
    scaleToZero: portfolio.agentOperatingModel.scaleToZero,
  },
  workflowProfiles: workflowProfileCount,
  researchGates: portfolio.researchGates.length,
}, null, 2))
