import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

import {
  COMPANY_CAPACITY_CLAIM_CONTRACT,
  COMPANY_CAPACITY_CLAIM_TTL_SECONDS,
  listCompanyAgents,
  MAX_ACTIVE_COMPANY_ASSIGNMENTS,
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
import { validateManagedPilotReadiness } from '../kernel/managed-pilot-readiness.mjs'

const root = resolve(import.meta.dirname, '..')
const [readme, now, qaBrief, workboard, current, manifestText, portfolioText, workforceText, agentWorkspaceText, research, agentSecurity, databaseRehearsalText, releaseReconciliation, allyAuditText, allyTrimText, allyCompanyCycleText, allyCeoPlannerText, allyCeoPlannerCliText, allyCeoLocalCycleText, agentJobRunnerText, packageText, storageAuditHandoff, hqLiveStateVerifier, kernelPackageText, kernelFootprintVerifier, kernelBriefText, kernelOperatorText, kernelAlertText, kernelOperationsText, kernelConsoleText, kernelAgentCompanyApiText, kernelGatewayText, kernelGatewayTestText, kernelConsoleApiText, kernelReadmeText, agentArchitectureText, agentGovernanceText, supabaseCompatibilityVerifierText, competitiveExecutionCutText] = await Promise.all([
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
  readFile(resolve(root, 'tools', 'trim_codex_working_sets.ps1'), 'utf8'),
  readFile(resolve(root, 'tools', 'invoke_supermega_company_cycle.ps1'), 'utf8'),
  readFile(resolve(root, 'kernel', 'ally-ceo-company-plan.mjs'), 'utf8'),
  readFile(resolve(root, 'kernel', 'scripts', 'plan-ally-ceo-company.mjs'), 'utf8'),
  readFile(resolve(root, 'tools', 'run_ally_ceo_local_cycle.mjs'), 'utf8'),
  readFile(resolve(root, 'tools', 'run_supermega_agent_jobs.py'), 'utf8'),
  readFile(resolve(root, 'package.json'), 'utf8'),
  readFile(resolve(root, 'hq', 'pilots', 'private-storage-privacy-audit.md'), 'utf8'),
  readFile(resolve(root, 'tools', 'verify_hq_live_state.mjs'), 'utf8'),
  readFile(resolve(root, 'kernel', 'package.json'), 'utf8'),
  readFile(resolve(root, 'kernel', 'scripts', 'verify-function-footprint.mjs'), 'utf8'),
  readFile(resolve(root, 'kernel', 'api', 'brief.mjs'), 'utf8'),
  readFile(resolve(root, 'kernel', 'api', 'operator.mjs'), 'utf8'),
  readFile(resolve(root, 'kernel', 'alert.mjs'), 'utf8'),
  readFile(resolve(root, 'kernel', 'agent-company-operations.mjs'), 'utf8'),
  readFile(resolve(root, 'kernel', 'public', 'index.html'), 'utf8'),
  readFile(resolve(root, 'kernel', 'api', 'agent-company.mjs'), 'utf8'),
  readFile(resolve(root, 'kernel', 'gateway.mjs'), 'utf8'),
  readFile(resolve(root, 'kernel', 'gateway.test.mjs'), 'utf8'),
  readFile(resolve(root, 'kernel', 'console', 'api.mjs'), 'utf8'),
  readFile(resolve(root, 'kernel', 'README.md'), 'utf8'),
  readFile(resolve(root, 'agent_os', 'agent_os_architecture.md'), 'utf8'),
  readFile(resolve(root, 'supermega_runtime', 'agent_governance.py'), 'utf8'),
  readFile(resolve(root, 'tools', 'verify_supabase_compatibility.mjs'), 'utf8'),
  readFile(resolve(root, 'hq', 'strategy', 'COMPETITIVE-EXECUTION-CUT.md'), 'utf8'),
])
const enterpriseRoadmap = await readFile(resolve(root, 'hq', 'research', 'enterprise-product-roadmap-2026-07-28.md'), 'utf8')
const managedPilotReadiness = validateManagedPilotReadiness(JSON.parse(await readFile(resolve(root, 'hq', 'readiness', 'managed-pilot-readiness.json'), 'utf8')))
const supabaseSecurityAudit = JSON.parse(await readFile(resolve(root, 'hq', 'readiness', 'supabase-security-advisor-audit.json'), 'utf8'))

const manifest = JSON.parse(manifestText)
const canonicalTextLength = (value) => value.replaceAll('\r\n', '\n').length
const portfolio = JSON.parse(portfolioText)
const workforce = JSON.parse(workforceText)
const agentWorkspace = JSON.parse(agentWorkspaceText)
const databaseRehearsal = JSON.parse(databaseRehearsalText)
const databaseImplementationPaths = [
  'supermega_runtime/managed_context.py',
  'supermega_runtime/managed_activation.py',
  'supermega_runtime/runtime.py',
  'supermega_runtime/trial_runtime.py',
  'supermega_runtime/trial_store.py',
  'supabase/migrations/20260730113000_private_trial_backend_v6_managed_activation.sql',
  'supabase/migrations/20260730123000_private_trial_backend_v7_workspace_discovery.sql',
  'supabase/migrations/20260802161500_private_trial_backend_v8_rls_initplan.sql',
  'supabase/migrations/20260803063822_private_trial_backend_v9_metadata_rls.sql',
  'supabase/migrations/20260804102000_private_trial_backend_v10_supabase_session_revocation.sql',
  'supabase/migrations/20260816120000_private_trial_backend_v11_self_serve_grants.sql',
  'supabase/rehearsal/20260804_public_browser_quarantine.sql',
  'tools/activate_supermega_database.ps1',
  'tools/rehearse_supermega_postgres17.py',
  'tools/validate_supermega_database_url.py',
  'tools/verify_public_browser_quarantine.mjs',
  'tools/verify_managed_runtime_environment_values.mjs',
]
const databaseImplementationHash = createHash('sha256')
for (const relativePath of databaseImplementationPaths) {
  databaseImplementationHash.update(relativePath, 'utf8')
  databaseImplementationHash.update('\0', 'utf8')
  const implementationSource = await readFile(resolve(root, relativePath), 'utf8')
  databaseImplementationHash.update(implementationSource.replace(/\r\n/g, '\n'), 'utf8')
  databaseImplementationHash.update('\0', 'utf8')
}
const databaseImplementationDigest = `sha256:${databaseImplementationHash.digest('hex')}`
const normalizedAgentGovernanceText = agentGovernanceText.replace(/\r\n?/g, '\n')
const competitiveExecutionCutNormalized = competitiveExecutionCutText.replace(/\s+/g, ' ')
const liveReleaseCommit = now.match(/^Live release commit: `([0-9a-f]{40})`$/m)?.[1] ?? ''
const executionOrderMarker = '## Execution order'
const workboardExecutionOrder = workboard.includes(executionOrderMarker)
  ? workboard.slice(workboard.indexOf(executionOrderMarker))
  : ''
const hqUpdatedAt = now.match(/^Updated: (\d{4}-\d{2}-\d{2})$/m)?.[1] ?? ''
const hqLiveReleaseCommit = now.match(/^Live release commit: `([0-9a-f]{40})`$/m)?.[1] ?? ''
const workboardAcceptedReleaseCommit = workboard.match(/^Current accepted release checkpoint: `([0-9a-f]{40})`$/m)?.[1] ?? ''
const kernelRoster = listCompanyAgents()
const kernelCrewCapabilities = kernelRoster.flatMap((agent) => [agent.crew, ...agent.capabilityCrews])
const workforceDailyRuns = Object.values(workforce.runtime_policy?.job_daily_limits || {})
  .reduce((total, value) => total + Number(value || 0), 0)
const workforceDailyWorkUnits = Object.entries(workforce.runtime_policy?.job_daily_limits || {})
  .reduce((total, [jobType, limit]) => total + Number(limit || 0) * Number(workforce.runtime_policy?.job_units?.[jobType] || 0), 0)
const workforceInstructionText = JSON.stringify(workforce.instruction_packs || [])
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
  attention: { overduePlanned: 0, overdueRunning: 0, failedOrBlocked: 0, revisionRequired: 0, missingEvaluation: 0, deliveryFailed: 0, deliveryUncertain: 0, deliveryMissing: 0 },
  targets: Array.from({ length: 8 }, () => ({ state: 'met' })),
  workforce: { registeredAgents: 12, availableAgents: 12, historicalAgents: 2, utilizedAgents: 2, activeAgents: 0, queuedAgents: 0, runningAgents: 0, computeConsumingAgents: 0, registeredAgentsConsumeCompute: false, activationMode: 'demand_driven', dormantAgents: 12, totalAssignments: 5, activeAssignments: 0, queuedAssignments: 0, runningAssignments: 0, usedRoleCalls: 15, modelCalls: 3, cacheHits: 2, weightedTotalUnits: 1200, agents: [{ agentId: 'must-not-escape' }] },
  outcomes: { available: true, durable: true, state: 'measured', counts: { completed: 5, evaluated: 5, accepted: 5, revisionRequired: 0 }, efficiency: { available: true, acceptedOutcomesPer1000WorkUnits: 4.166667 }, delivery: { available: true, durable: true, state: 'ready', counts: { completed: 5, recorded: 5, sent: 5, failed: 0, uncertain: 0, missing: 0 }, records: [{ deliveryId: 'must-not-escape-delivery' }] }, actions: { available: true, durable: true, state: 'ready', counts: { accepted: 5, proposed: 5, missing: 0 }, items: [{ actionId: 'must-not-escape-action', title: 'must-not-escape-action-content' }] }, records: [{ output: 'must-not-escape' }] },
  coverage: { directCyclesExcluded: true },
  exposure: { rawEvidenceReturned: false, modelOutputReturned: false, specialistOutputReturned: false, providerRowsReturned: false, ceoDeliveryContentReturned: false },
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
  typeof portfolio.updatedAt === 'string'
  && /^\d{4}-\d{2}-\d{2}$/.test(portfolio.updatedAt)
  && current.includes(`Last confirmed: ${portfolio.updatedAt}`)
  && /^\d{4}-\d{2}-\d{2}$/.test(hqUpdatedAt)
  && Date.parse(`${hqUpdatedAt}T00:00:00Z`) >= Date.parse(`${portfolio.updatedAt}T00:00:00Z`))
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
  && portfolio.agentOperatingModel?.activeAssignmentLimit === 1
  && portfolio.agentOperatingModel?.batchJobLimit === 1
  && portfolio.agentOperatingModel?.maxAgentsPerCycle === 1
  && portfolio.agentOperatingModel?.maxConcurrentCompanyCycles === 1
  && portfolio.agentOperatingModel?.validatedCrewCapabilities === 15
  && portfolio.agentOperatingModel?.ceoOutcomeAuthority === 'supermega.ceo-outcome-authority.v2'
  && portfolio.agentOperatingModel?.ceoOutcomeOperationsContract === CEO_OUTCOME_OPERATION_CONTRACT
  && portfolio.agentOperatingModel?.ceoOutcomeEvaluationContract === CEO_OUTCOME_EVALUATION_CONTRACT
  && portfolio.agentOperatingModel?.ceoOutcomeDeliveryContract === CEO_OUTCOME_DELIVERY_CONTRACT
  && portfolio.agentOperatingModel?.companyOperationsStatusContract === 'supermega.company-operations-status.v1'
  && portfolio.agentOperatingModel?.companyOperationsWindowDays === 30
  && portfolio.agentOperatingModel?.weeklyReadOnlyOutcomeCount === 5
  && portfolio.agentOperatingModel?.allWeeklyOutcomesObserveCompanyOperations === true
  && portfolio.agentOperatingModel?.dailyCompanyControlUsesFx === false
  && portfolio.agentOperatingModel?.companyOperationsRawEvidenceReturned === false
  && portfolio.agentOperatingModel?.companyOperationsDeliveryCoverage === true
  && portfolio.agentOperatingModel?.deliveryAttentionMetadataOnly === true
  && portfolio.agentOperatingModel?.ownerConsoleDeliveryCoverage === true
  && portfolio.agentOperatingModel?.weeklyCycleDeliveryRequiredForComplete === true
  && portfolio.agentOperatingModel?.ownerConsoleDeliveryPerOutcomeStatus === true
  && portfolio.agentOperatingModel?.scheduledCycleDeliveryReads === false
  && portfolio.agentOperatingModel?.scheduledFunctionFootprintContract === 'supermega.kernel-function-footprint.v1'
  && portfolio.agentOperatingModel?.scheduledFunctionMaxEagerFiles === 30
  && portfolio.agentOperatingModel?.scheduledFunctionMaxEagerBytes === 409600
  && portfolio.agentOperatingModel?.scheduledFunctionCurrentEagerFiles === 14
  && portfolio.agentOperatingModel?.scheduledFunctionCurrentEagerBytes === 324497
  && portfolio.agentOperatingModel?.companyOperationsDeferredForStartup === true
  && portfolio.agentOperatingModel?.optionalToolConnectorsDeferredForStartup === true
  && portfolio.agentOperatingModel?.fullPlatformStatusTeams?.join(',') === 'engineering,finance-risk'
  && portfolio.agentOperatingModel?.connectorFleetDeferredForDailyProductGrowth === true
  && portfolio.agentOperatingModel?.maxOutcomesPerCeoCycle === 1
  && portfolio.agentOperatingModel?.productControlFocusContract === 'supermega.ally-ceo-product-focus.v3'
  && portfolio.agentOperatingModel?.productControlStrategy === 'portfolio_priority_ready'
  && portfolio.agentOperatingModel?.productControlSpecialist === 'delivery-planner'
  && portfolio.agentOperatingModel?.productControlAcceptanceDimensions?.join(',') === 'user_job,state_transition,data_contract,failure_recovery,mobile_acceptance,import_reconciliation,security_boundary,automated_test'
  && portfolio.products?.every((product) =>
    Object.keys(product.localAutomation || {}).sort().join(',') === 'contract,priority,productId,reason,status,workOrder,workOrderId'
    && product.localAutomation.contract === 'supermega.product-work-authority.v2'
    && product.localAutomation.productId === product.id
    && /^[a-z0-9][a-z0-9-]{2,79}$/.test(product.localAutomation.workOrderId)
    && product.localAutomation.workOrderId.startsWith(`${product.id}-`)
    && product.localAutomation.workOrder.startsWith(`${product.name}: `)
    && Number.isInteger(product.localAutomation.priority)
    && product.localAutomation.priority >= 1
    && product.localAutomation.priority <= 100
    && ['ready-local', 'owner-gated', 'external-blocked'].includes(product.localAutomation.status)
    && product.localAutomation.workOrder?.trim()
    && product.localAutomation.reason?.trim())
  && Array.isArray(portfolio.completedLocalAutomations)
  && portfolio.completedLocalAutomations.length === 15
  && portfolio.completedLocalAutomations.every((entry) =>
    Object.keys(entry || {}).sort().join(',') === 'checkpoint,productId,workOrderId'
    && portfolio.products.some((product) => product.id === entry.productId)
    && /^[a-z0-9][a-z0-9-]{2,79}$/.test(entry.workOrderId)
    && /^(?:CEO|ENG|OPS|QA|UX)-\d{3}$/.test(entry.checkpoint)
    && !portfolio.products.some((product) => product.id === entry.productId && product.localAutomation.workOrderId === entry.workOrderId))
  && portfolio.completedLocalAutomations[0]?.productId === 'ecommerce'
  && portfolio.completedLocalAutomations[0]?.workOrderId === 'ecommerce-today-surface'
  && portfolio.completedLocalAutomations[0]?.checkpoint === 'ENG-130'
  && portfolio.completedLocalAutomations[1]?.productId === 'ecommerce'
  && portfolio.completedLocalAutomations[1]?.workOrderId === 'ecommerce-promotion-review'
  && portfolio.completedLocalAutomations[1]?.checkpoint === 'ENG-134'
  && portfolio.completedLocalAutomations[2]?.productId === 'ecommerce'
  && portfolio.completedLocalAutomations[2]?.workOrderId === 'ecommerce-promotion-policy-setup'
  && portfolio.completedLocalAutomations[2]?.checkpoint === 'ENG-135'
  && portfolio.completedLocalAutomations[3]?.productId === 'ecommerce'
  && portfolio.completedLocalAutomations[3]?.workOrderId === 'ecommerce-shipping-policy-review'
  && portfolio.completedLocalAutomations[3]?.checkpoint === 'ENG-136'
  && portfolio.completedLocalAutomations[4]?.productId === 'ecommerce'
  && portfolio.completedLocalAutomations[4]?.workOrderId === 'ecommerce-payment-method-policy-review'
  && portfolio.completedLocalAutomations[4]?.checkpoint === 'ENG-137'
  && portfolio.completedLocalAutomations[5]?.productId === 'ecommerce'
  && portfolio.completedLocalAutomations[5]?.workOrderId === 'ecommerce-tax-policy-review'
  && portfolio.completedLocalAutomations[5]?.checkpoint === 'ENG-138'
  && portfolio.completedLocalAutomations[6]?.productId === 'ecommerce'
  && portfolio.completedLocalAutomations[6]?.workOrderId === 'ecommerce-order-acknowledgement'
  && portfolio.completedLocalAutomations[6]?.checkpoint === 'ENG-139'
  && portfolio.completedLocalAutomations[7]?.productId === 'ecommerce'
  && portfolio.completedLocalAutomations[7]?.workOrderId === 'ecommerce-cancellation-request'
  && portfolio.completedLocalAutomations[7]?.checkpoint === 'ENG-140'
  && portfolio.completedLocalAutomations[8]?.productId === 'ecommerce'
  && portfolio.completedLocalAutomations[8]?.workOrderId === 'ecommerce-order-amendment-request'
  && portfolio.completedLocalAutomations[8]?.checkpoint === 'ENG-141'
  && portfolio.completedLocalAutomations[9]?.productId === 'ecommerce'
  && portfolio.completedLocalAutomations[9]?.workOrderId === 'ecommerce-delivery-reschedule-request'
  && portfolio.completedLocalAutomations[9]?.checkpoint === 'ENG-142'
  && portfolio.completedLocalAutomations[10]?.productId === 'ecommerce'
  && portfolio.completedLocalAutomations[10]?.workOrderId === 'ecommerce-return-outcome-receipt'
  && portfolio.completedLocalAutomations[10]?.checkpoint === 'ENG-143'
  && portfolio.completedLocalAutomations[11]?.productId === 'ecommerce'
  && portfolio.completedLocalAutomations[11]?.workOrderId === 'ecommerce-support-outcome-receipt'
  && portfolio.completedLocalAutomations[11]?.checkpoint === 'ENG-144'
  && portfolio.completedLocalAutomations[12]?.productId === 'ecommerce'
  && portfolio.completedLocalAutomations[12]?.workOrderId === 'ecommerce-correction-request'
  && portfolio.completedLocalAutomations[12]?.checkpoint === 'ENG-145'
  && portfolio.completedLocalAutomations[13]?.productId === 'ecommerce'
  && portfolio.completedLocalAutomations[13]?.workOrderId === 'ecommerce-contact-correction-request'
  && portfolio.completedLocalAutomations[13]?.checkpoint === 'ENG-146'
  && portfolio.completedLocalAutomations[14]?.productId === 'shop'
  && portfolio.completedLocalAutomations[14]?.workOrderId === 'shop-spa-membership-native'
  && portfolio.completedLocalAutomations[14]?.checkpoint === 'ENG-147'
  && portfolio.products?.find((product) => product.id === 'ecommerce')?.localAutomation.workOrderId === 'ecommerce-managed-order-exception-pilot'
  && portfolio.products?.filter((product) => product.localAutomation.status === 'ready-local').length === 0
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
  && portfolio.agentOperatingModel?.fixedHqSynthesisIgnoresGeneratedAt === true
  && portfolio.agentOperatingModel?.unchangedCeoEvidenceConsumesModelCalls === false
  && portfolio.agentOperatingModel?.hostedAiBudgetRequiresDurableStore === true
  && portfolio.agentOperatingModel?.scaleToZero === true
  && portfolio.agentOperatingModel?.idleCapabilitiesConsumeCompute === false
  && portfolio.agentOperatingModel?.dynamicDelegation === false
  && portfolio.agentOperatingModel?.recursiveDelegation === false
  && portfolio.agentOperatingModel?.consequentialAuthority === 'founder')
requireContract('local inference is explicit, loopback-only, budgeted, and scale-to-zero',
  portfolio.agentOperatingModel?.localInferenceProvider === 'ollama-local'
  && portfolio.agentOperatingModel?.localInferenceDefaultEnabled === false
  && portfolio.agentOperatingModel?.localInferenceExplicitModelRequired === true
  && portfolio.agentOperatingModel?.localInferenceLoopbackOnly === true
  && portfolio.agentOperatingModel?.localInferenceHostedAllowed === false
  && portfolio.agentOperatingModel?.localInferenceMaxAttempts === 1
  && portfolio.agentOperatingModel?.localInferenceResponseMaxBytes === 1048576
  && portfolio.agentOperatingModel?.localInferenceUnloadAfterResponse === true
  && portfolio.agentOperatingModel?.localInferenceUsesCompanyBudget === true
  && kernelGatewayText.includes("const OLLAMA_API_URL = 'http://127.0.0.1:11434/api/chat'")
  && kernelGatewayText.includes('const OLLAMA_RESPONSE_MAX_BYTES = 1024 * 1024')
  && kernelGatewayText.includes("process.env.SUPERMEGA_OLLAMA_ENABLED === '1'")
  && kernelGatewayText.includes('!hostedRuntime()')
  && kernelGatewayText.includes("name: 'ollama-local'")
  && kernelGatewayText.includes('maxAttempts: 1')
  && kernelGatewayText.includes('keep_alive: 0')
  && kernelGatewayText.includes("redirect: 'error'")
  && kernelGatewayText.includes('readBoundedResponseText')
  && kernelGatewayText.includes('await reader.cancel()')
  && kernelGatewayText.includes('return [OLLAMA, ANTHROPIC, OPENROUTER]')
  && kernelGatewayTestText.includes('hosted runtimes never admit the loopback provider')
  && kernelGatewayTestText.includes('local inference never retries on this constrained host')
  && kernelGatewayTestText.includes('oversized local response streams are cancelled immediately')
  && kernelConsoleApiText.includes('const aiConfigured = () => providerChain().length > 0')
  && kernelReadmeText.includes('SUPERMEGA_OLLAMA_ENABLED=1')
  && kernelReadmeText.includes('Never set these as Vercel production configuration.')
  && workboard.includes('| OPS-060 | CEO + Agent Operations / Local Inference Codex | done-local |')
  && workboard.includes('Live plain and schema-bound generation both succeeded with `qwen3.5:0.8b`')
  && workboard.includes('one non-terminating Codex-tree trim released 2,099.8 MB')
  && !kernelGatewayText.includes('SUPERMEGA_OLLAMA_URL')
  && !/\b(?:child_process|spawn|execFile|cluster)\b/.test(kernelGatewayText))
requireContract('agent capacity agrees across HQ, coordinator, and Kernel',
  workboard.includes('| OPS-093 | CEO + Agent Capacity / Runtime Integrity Codex | done-local |')
  && workboard.includes('one company cycle, at most two active assignments, and at most two waiting batch jobs')
  && workforce.runtime_policy?.max_registered_specialists === portfolio.agentOperatingModel?.registeredRoleLimit
  && workforce.runtime_policy?.max_running === portfolio.agentOperatingModel?.activeAssignmentLimit
  && workforce.runtime_policy?.max_company_cycles === portfolio.agentOperatingModel?.maxConcurrentCompanyCycles
  && workforce.runtime_policy?.max_specialists_per_company_cycle === portfolio.agentOperatingModel?.maxAgentsPerCycle
  && workforce.runtime_policy?.local_host_admission_contract === 'supermega.ally-host-admission.v1'
  && workforce.runtime_policy?.max_local_running === 1
  && workforce.runtime_policy?.local_memory_pressure_blocks_dispatch === true
  && workforce.runtime_policy?.local_duplicate_listener_blocks_dispatch === true
  && workforce.runtime_policy?.local_loaded_model_blocks_dispatch === true
  && workforce.runtime_policy?.max_batch_jobs === portfolio.agentOperatingModel?.batchJobLimit
  && workforce.runtime_policy?.max_queued === 24
  && workforce.runtime_policy?.max_daily_runs === workforceDailyRuns
  && workforce.runtime_policy?.max_daily_work_units === workforceDailyWorkUnits
  && workforceDailyRuns === 57
  && workforceDailyWorkUnits === 83
  && workforce.runtime_policy?.specialist_job_types?.join(',') === Object.keys(workforce.runtime_policy?.job_units || {}).join(',')
  && workforce.runtime_policy?.specialist_job_types?.join(',') === Object.keys(workforce.runtime_policy?.job_daily_limits || {}).join(',')
  && workforce.runtime_policy?.scale_to_zero === portfolio.agentOperatingModel?.scaleToZero
  && workforce.runtime_policy?.registered_specialists_consume_compute === portfolio.agentOperatingModel?.idleCapabilitiesConsumeCompute
  && workforce.build_teams?.map((entry) => entry.id).join(',') === portfolio.agentOperatingModel?.buildTeams?.join(',')
  && MAX_REGISTERED_COMPANY_AGENTS === portfolio.agentOperatingModel?.registeredRoleLimit
  && kernelRoster.length === MAX_REGISTERED_COMPANY_AGENTS
  && MAX_ACTIVE_COMPANY_ASSIGNMENTS === portfolio.agentOperatingModel?.activeAssignmentLimit
  && MAX_RUNNING_COMPANY_CYCLES === portfolio.agentOperatingModel?.maxConcurrentCompanyCycles
  && MAX_RUNNING_COMPANY_CYCLES * MAX_CYCLE_AGENTS === MAX_ACTIVE_COMPANY_ASSIGNMENTS
  && workforce.runtime_policy?.capacity_claim_contract === COMPANY_CAPACITY_CLAIM_CONTRACT
  && workforce.runtime_policy?.capacity_claim_ttl_seconds === COMPANY_CAPACITY_CLAIM_TTL_SECONDS
  && MAX_CYCLE_AGENTS === portfolio.agentOperatingModel?.maxAgentsPerCycle
  && kernelCrewCapabilities.length === portfolio.agentOperatingModel?.validatedCrewCapabilities
  && new Set(kernelCrewCapabilities).size === kernelCrewCapabilities.length
  && agentArchitectureText.includes('one assignment may run inside the single admitted company cycle')
  && !/four unique (?:job families|active assignments)/i.test(agentArchitectureText)
  && !/four unique active assignments/i.test(workforceInstructionText)
  && agentGovernanceText.includes('AGENT_DAILY_RUN_LIMIT = sum(AGENT_JOB_DAILY_LIMITS.values())')
  && agentGovernanceText.includes('AGENT_DAILY_WORK_UNIT_LIMIT = sum(')
  && agentGovernanceText.includes('max_daily_runs=_bounded_environment_int(')
  && normalizedAgentGovernanceText.includes('"SUPERMEGA_AGENT_MAX_DAILY_RUNS",\n            AGENT_DAILY_RUN_LIMIT,\n            1,\n            AGENT_DAILY_RUN_LIMIT,')
  && normalizedAgentGovernanceText.includes('"SUPERMEGA_AGENT_MAX_DAILY_UNITS",\n            AGENT_DAILY_WORK_UNIT_LIMIT,\n            1,\n            AGENT_DAILY_WORK_UNIT_LIMIT,'))
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
    ?.includes('tools/verify_private_storage_privacy.py')
  && SUPERMEGA_HQ_AUTHORITY.outcomes?.every((item) =>
    item.sourceRefs.every((source) => !/(?:instagram\.com|linkedin\.com|lnkd\.in)/i.test(source))))
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
  && kernelOperationsText.includes('async function buildCeoOutcomeDelivery(')
  && kernelOperationsText.includes('deliveryFailed: outcomes.delivery.counts.failed')
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
  && ceoOperationsEvidence.workforce?.registeredAgents === 12
  && ceoOperationsEvidence.workforce?.historicalAgents === 2
  && ceoOperationsEvidence.workforce?.utilizedAgents === 2
  && ceoOperationsEvidence.workforce?.computeConsumingAgents === 0
  && ceoOperationsEvidence.workforce?.registeredAgentsConsumeCompute === false
  && ceoOperationsEvidence.workforce?.activationMode === 'demand_driven'
  && ceoOperationsEvidence.outcomes?.durable === true
  && ceoOperationsEvidence.outcomes?.efficiencyAvailable === true
  && ceoOperationsEvidence.delivery?.durable === true
  && ceoOperationsEvidence.delivery?.state === 'ready'
  && ceoOperationsEvidence.delivery?.sent === 5
  && ceoOperationsEvidence.actions?.durable === true
  && ceoOperationsEvidence.actions?.state === 'ready'
  && ceoOperationsEvidence.actions?.proposed === 5
  && ceoOperationsEvidence.actions?.missing === 0
  && ceoOperationsEvidence.attention?.deliveryFailed === 0
  && ceoOperationsEvidence.attention?.deliveryUncertain === 0
  && ceoOperationsEvidence.attention?.deliveryMissing === 0
  && ceoOperationsEvidence.attentionQueue?.state === 'clear'
  && ceoOperationsEvidence.attentionQueue?.requiredActions === 0
  && ceoOperationsEvidence.attentionQueue?.signals === 0
  && ceoOperationsEvidence.workforce?.dormantAgents === 12
  && ceoOperationsEvidence.controls?.metadataOnly === true
  && ceoOperationsEvidence.controls?.rawEvidenceReturned === false
  && ceoOperationsEvidence.controls?.modelOutputReturned === false
  && ceoOperationsEvidence.controls?.specialistOutputReturned === false
  && ceoOperationsEvidence.controls?.providerRowsReturned === false
  && ceoOperationsEvidence.controls?.ceoDeliveryContentReturned === false
  && ceoOperationsEvidence.controls?.ceoActionContentReturned === false
  && !/must-not-escape|"clientId"|"agentId"|"briefText"|"deliveryId"|"actionId"/i.test(JSON.stringify(ceoOperationsEvidence)))
requireContract('owner console presents delivery coverage without exposing receipt content',
  kernelConsoleText.includes('function companyDeliverySection(delivery={})')
  && kernelConsoleText.includes('Receipt coverage only; message content stays private')
  && kernelConsoleText.includes('function companyAttentionSection(queue={})')
  && kernelConsoleText.includes('Only exceptions that need a decision')
  && kernelConsoleText.includes('No owner action needed in this window')
  && kernelConsoleText.includes('function companyDepartmentQueueSection(queue={})')
  && kernelConsoleText.includes('Accepted decisions become one accountable internal draft; nothing runs automatically')
  && kernelConsoleText.includes('departmentQueue=report.outcomes&&report.outcomes.actions||{}')
  && !/delivery\.records|deliveryId|deliveryClaimId/.test(kernelConsoleText))
requireContract('weekly CEO completion remains distinct from durable owner delivery',
  kernelOperationsText.includes("CEO_OUTCOME_CYCLE_STATE_FIELDS = new Set(['clientId', 'authorityDigest', 'asOf', 'includeDelivery'])")
  && kernelOperationsText.includes('includeOutcomeStatuses: true')
  && kernelAgentCompanyApiText.includes('includeDelivery: true')
  && kernelAgentCompanyApiText.includes('cycleComplete: recordedComplete && deliveryReady')
  && kernelAgentCompanyApiText.includes('deliveryRequiredForCycleComplete: true')
  && kernelAgentCompanyApiText.includes('contentReturned: false')
  && kernelConsoleText.includes("delivery_failed:'Delivery failed'")
  && kernelConsoleText.includes("delivery_unverified:'Delivery unverified'")
  && kernelConsoleText.includes("complete?'week delivered':deliveryAttention?'delivery attention'")
  && !kernelBriefText.includes('includeDelivery'))
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
  && now.includes('Product: four-product setup handoff, recovery, and Plant CAPA release gates pass.')
  && now.includes('HQ retains 12 dormant role definitions but admits one active assignment, one specialist, and one cycle')
  && now.includes('`multi_agent = false`; one lease blocks duplicates')
  && now.includes('unloaded roles/models consume no idle compute')
  && now.includes('YTF identities cannot render in core operations')
  && now.includes('Hosted scheduling remains deliberately dormant')
  && now.includes('flag-only, preview, stale, incomplete, or tampered activation attempts stop before worker invocation')
  && now.includes('Each CEO cycle selects one outcome')
  && now.includes('Owner-send uncertainty retains claims and is never auto-retried')
  && now.includes('Storage privacy now has a six-request owner-confirmed verifier')
  && now.includes('zero-network configuration preflight')
  && now.includes('HQ retains 12 dormant role definitions but admits one active assignment, one specialist, and one cycle')
  && now.includes('`multi_agent = false`; one lease blocks duplicates')
  && now.includes('unloaded roles/models consume no idle compute'))
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
  && agentSecurity.includes('sole atomic durable capacity claim')
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
  workboard.includes(`Current accepted product checkpoint: \`${hqLiveReleaseCommit}\``)
  && workboard.includes('| ENG-075 | Shop + Data Engineering Codex | done-local |')
  && workboard.includes('| ENG-076 | Plant + Manufacturing Engineering Codex | done-local |')
  && workboard.includes('| ENG-077 | Website + Product Engineering Codex | done-local |')
  && workboard.includes('| ENG-078 | Ecommerce + Commerce Engineering Codex | done-local |')
  && workboard.includes('Checkpoint `52917c5` adds a multi-line buying workspace')
  && workboard.includes('| ENG-079 | Shop + Data Integrity Codex | done-local |')
  && workboard.includes('making the store replace forged receipt actor/time')
  && workboard.includes('| CEO-013 | CEO / Codex integrator | done-live |')
  && workboard.includes('Commit `058c29140b9c4b648146cd6326aa7b3dd88192cf` renders Shop, Plant, Website, and Ecommerce before one collapsed `More tools` drawer')
  && workboard.includes('| CEO-014 | CEO / Codex integrator | done-live |')
  && workboard.includes('Commit `e3ec8b3f17e850f91110a4f98170afbcdc38390d` puts client and owner first')
  && workboard.includes('| CEO-015 | CEO / Codex integrator | done-live |')
  && workboard.includes('Commit `2909fd66848dcd49ce96cda99b43002e064582e3` makes one state-aware `Start here` action')
  && workboard.includes('| CEO-016 | CEO / Codex integrator | done-live |')
  && workboard.includes('Commit `2824da83052200953967b337e81304b99de1f3f4` guides the existing Website workspace through page readiness')
  && workboard.includes('SHA-256 `224b390f6ecf9c3631b7ba12edb5dcf61d32e05da233f27f0d4eb63003224302`')
  && workboard.includes('READY deployment `dpl_DaCmhfCfRcQRchQzuN7YeHCjrndx` on project `megaos`')
  && workboard.includes('READY deployment `dpl_8HwP6ZbKtihp5Q4An76ovvs51wfa` on `supermega-public`')
  && workboard.includes('| CEO-017 | CEO / Codex integrator | done-live |')
  && workboard.includes('Commit `e15d4a585b608a10a00b0dcd8a6842818d763bb4` makes the populated sample catalog a usable trial')
  && workboard.includes('READY deployment `dpl_F17kcWNLKBKbzxLyi8Z675QMWzkq` on project `megaos`')
  && workboard.includes('READY deployment `dpl_C9K9pf9Adft4fQpMFaQyLxDZxRnk` on `supermega-public`')
  && workboard.includes('| CEO-018 | CEO / Codex integrator | done-live |')
  && workboard.includes('Commit `690680540efaf138bfb7f57038371de01ea6bd1d` keeps one state-aware `Customize demo` action')
  && workboard.includes('Guarded release `30811690752` promoted both canonical domains')
  && workboard.includes('| CEO-019 | CEO / Codex integrator | done-live |')
  && workboard.includes('Commit `757cd3b64d0818d477e698235c58c4fbf34682c5` makes zero catalog the first prerequisite')
  && workboard.includes('Guarded release `30817032783` promoted both canonical domains')
  && workboard.includes('| CEO-020 | CEO / Codex integrator | done-live |')
  && workboard.includes('Commit `25cac2f50dfcc210d29dd1fd794ac194083f90d1` makes the free-local and managed-company-intelligence model explicit')
  && workboard.includes('Guarded release `30823422205` promoted both canonical domains')
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
  && workboard.includes('| ENG-098 | Shop + Finance Integrity Codex | done-local |')
  && workboard.includes('adds `supermega.commerce.accounting-handoff.v1`')
  && workboard.includes('54 Shop inventory/230 Commerce/265 Production checks')
  && workboard.includes('| ENG-099 | Shop + Finance Integrity Codex | done-local |')
  && workboard.includes('append-only tax-configuration revisions')
  && workboard.includes('All 331 Python tests, production build, 54 Shop inventory/242 Commerce/265 Production checks')
  && workboard.includes('Checkpoints `0831ad7` and `920c13d` add an immutable reviewed BOM/routing package')
  && workboard.includes('Checkpoints `0f3dc09` and `03e1f1b` add tenant-bound')
  && workboard.includes('Retain the completed Shop, Plant, Website, and Ecommerce checkpoints')
  && now.includes('Product: four-product setup handoff, recovery, and Plant CAPA release gates pass.')
  && now.includes('The deterministic 12-profile rehearsal passes 24 rows')
  && now.includes('The active delivery focus is:')
  && now.includes(`Live HQ and both domains agree on \`${hqLiveReleaseCommit.slice(0, 8)}\`; no release drift is present.`)
  && now.includes('Plant Jobs persists managed BOM/routing, WIP, minutes')
  && now.includes('operation/output requires exact authenticated Shop issue evidence')
  && now.includes('Controlled batches bind reviewed productive time and closed downtime')
  && now.includes('before Availability and OEE')
  && now.includes('one smart import and launchpad')
  && now.includes('paired brand, context, and catalog identities match')
  && now.includes('Shop Stock has one Commerce authority')
  && now.includes('Orders and Website conversions reserve deterministic location/lots')
  && now.includes('sellable returns restore the exact fulfilled location/lot')
  && now.includes('balanced accounting-review CSV grouped by payment method')
  && now.includes('human-approved versioned tax code, rate, and inclusive/exclusive treatment')
  && now.includes('Managed workspaces retain exact requests in the Shop inbox')
  && now.includes('`npm run dev` starts canonical FastAPI plus Vite on loopback')
  && now.includes('Records stay browser-local; hosted activation is not proven')
  && !now.includes('probe remains 500'))
requireContract('release history is retained and current live state is discoverable',
  workboard.includes('| OPS-006 | Release / Codex integrator | done-local |')
  && workboard.includes('strict fast-forward descendant of open draft PR #258 head `338b6fd`')
  && workboard.includes('release-reconciliation-2026-07-26.md')
  && /^[0-9a-f]{40}$/.test(liveReleaseCommit)
  && now.includes(`Both domains serve deployed \`${liveReleaseCommit}\``)
  && workboard.includes('| CEO-010 | CEO / Codex integrator | done-live |')
  && workboard.includes('focused bottom sheet with backdrop, Escape/Close actions, 44 px controls, and focus return')
  && workboard.includes('| CEO-011 | CEO / Codex integrator | done-live |')
  && workboard.includes('one append-only shift close only after positive good output, same-shift material trace'))
requireContract('workboard release authority and active execution order are current',
  workboard.includes('Integration branch: `main`')
  && /^[0-9a-f]{40}$/.test(workboardAcceptedReleaseCommit)
  && workboardAcceptedReleaseCommit === hqLiveReleaseCommit
  && workboard.includes('| UX-005 | Website + Product UX Codex | released |')
  && workboard.includes('standalone HTML download; connected managed workspaces add evidence, approval, and release records')
  && workboardExecutionOrder.includes('usable Website download checkpoint `e18fc6bc`')
  && workboardExecutionOrder.includes('Website mobile mission release `2824da83`')
  && workboardExecutionOrder.includes('Ecommerce mobile mission release `e15d4a58`')
  && workboardExecutionOrder.includes('owner-approved existing Supabase target')
  && workboardExecutionOrder.includes('Repeat the 12-profile rehearsal against the live isolated release')
  && workboardExecutionOrder.includes('retain complete rendered mobile Website and Ecommerce mission acceptance')
  && workboardExecutionOrder.includes('exact-commit protected preview')
  && workboardExecutionOrder.includes('fresh live-HQ snapshot')
  && workboardExecutionOrder.includes('Keep hosted scheduling and AI provider execution dormant')
  && !workboardExecutionOrder.includes('PR #258')
  && !workboardExecutionOrder.includes('fast-forward only the existing draft'))
requireContract('live Plant quality CAPA release is retained without overstated authority',
  workboard.includes('| OPS-151 | Product Platform + Plant Quality Codex | done-live |')
  && workboard.includes('NFKC-normalized recurrence keys preserve Unicode letters, marks, and numbers for Myanmar text')
  && workboard.includes('No fresh rendered-mobile claim is made')
  && now.includes('Plant quality problems now require structured CAPA evidence before an actionable record can close')
  && enterpriseRoadmap.includes('Checkpoint `8155e4b3` adds `supermega.production.quality-capa.v1`')
  && enterpriseRoadmap.includes('not a due-dated post-close effectiveness review')
  && !workboard.includes('OPS-151 | Product Platform + Plant Quality Codex | done-live | Automate'))
requireContract('live client setup handoff release is retained without overstated authority',
  workboard.includes('| OPS-152 | Product Operations + Client Setup QA Codex | done-live |')
  && workboard.includes('Product checkpoint `ac61fd84` makes Create and Update client demo focus and reveal')
  && workboard.includes('eight exact first-pass sources and four recovered sources')
  && workboard.includes('paired promotion run `30762780358`')
  && now.includes('create/update focuses `Open next demo`')
  && enterpriseRoadmap.includes('Checkpoint `ac61fd84` moves successful browser Create and Update directly to the unique next-demo action')
  && enterpriseRoadmap.includes('Import correction, idempotent replay, and setup-kit export also pass live; mobile, managed persistence, and activation do not.'))
requireContract('live local recovery release is retained without overstated authority',
  workboard.includes('| OPS-153 | Product Operations + Recovery Integrity Codex | done-live |')
  && workboard.includes('Product checkpoint `d9acb58f` fixes the live split state')
  && workboard.includes('saved a fresh 19-record baseline')
  && workboard.includes('paired promotion `30764088512`')
  && now.includes('reset/restore share one bounded scope')
  && enterpriseRoadmap.includes('Checkpoint `d9acb58f` gives Reset and Restore one exact bounded record registry')
  && enterpriseRoadmap.includes('excludes auth and managed identity'))
requireContract('live client proof baseline rejects seeded success without overstated authority',
  workboard.includes('| OPS-154 | Product Operations + Evidence Integrity Codex | done-live |')
  && workboard.includes('Product checkpoint `efb1ccad` upgrades the client-demo workspace to v4')
  && workboard.includes('Seeded history and a counter sale alone remain unproven')
  && workboard.includes('paired promotion `30765797532`')
  && workboard.includes('Rendered mobile acceptance and all managed-pilot gates remain open')
  && now.includes('A v4 setup baseline rejects seeded or pre-setup history as mission proof')
  && now.includes('a counter sale alone remains unproven')
  && now.includes('Rendered mobile Website and Ecommerce mission acceptance is complete')
  && enterpriseRoadmap.includes('Checkpoint `efb1ccad` adds a v4 setup baseline')
  && enterpriseRoadmap.includes('only accountable product evidence recorded strictly after setup can prove a mission'))
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
  && product('shop')?.job?.includes('versioned per-order tax calculation')
  && product('shop')?.job?.includes('native Spa prepaid-package sales and completed-treatment redemption')
  && product('shop')?.job?.includes('balanced review-only accounting handoff')
  && product('shop')?.templateContract?.productId === 'commerce'
  && product('shop')?.localAutomation?.workOrderId === 'shop-spa-owner-pilot'
  && product('shop')?.nextGate?.includes('reconciled package sale')
  && product('shop')?.nextGate?.includes('matching treatment redemption')
  && product('shop')?.nextGate?.includes('sample data as client proof'))
requireContract('Shop finance roadmap separates reviewed handoff from tax and posting authority',
  enterpriseRoadmap.includes('Checkpoint `369cb2b` adds `supermega.commerce.accounting-handoff.v1`')
  && enterpriseRoadmap.includes('Checkpoint `39b7fc2` adds `supermega.commerce.order-calculation.v2`')
  && enterpriseRoadmap.includes('Checkpoint `b738d05` adds immutable credit and debit correction notes')
  && enterpriseRoadmap.includes('Checkpoint `479802b` makes every new tax revision a reviewed schedule')
  && enterpriseRoadmap.includes('supermega.commerce.accounting-handoff.v3')
  && enterpriseRoadmap.includes('historical four-role mappings remain readable')
  && enterpriseRoadmap.includes('append-only human-reviewed tax-code revisions')
  && enterpriseRoadmap.includes('posting authority is `none`')
  && enterpriseRoadmap.includes('must not invent a Myanmar rate, hidden default, or G/L account')
  && workboard.includes('| ENG-104 | Shop + Finance Integrity Codex | done-local |')
  && workboard.includes('supermega.commerce.daily-close-export.v2')
  && workboard.includes('| ENG-105 | Shop + Finance Integrity Codex | done-local |')
  && workboard.includes('supermega.commerce.daily-close-export.v3')
  && workboard.includes('| ENG-107 | Shop + Finance Integrity Codex | done-local |')
  && workboard.includes('sales-adjustment, tax, correction-receivable, and correction-payable lines')
  && workboard.includes('lowers the largest chunk to 295,449 bytes')
  && enterpriseRoadmap.includes('https://help.sap.com/docs/SAP_BUSINESS_BYDESIGN/')
  && enterpriseRoadmap.includes('https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/'))
requireContract('Plant uses the stable production runtime',
  product('plant')?.name === 'Plant'
  && product('plant')?.runtimeSurface === 'production'
  && product('plant')?.compatibilityPath === '/operations/production/'
  && product('plant')?.surfaces?.join(',') === 'Jobs,Problems'
  && product('plant')?.templateContract?.productId === 'production'
  && product('plant')?.nextGate?.includes('Validate one order-bound OEE window')
  && workboard.includes('| ENG-102 | Plant + Manufacturing Performance Codex | done-local |')
  && workboard.includes('adds `supermega.plant.order_effectiveness.v1`')
  && workboard.includes('96.77% Performance, 80% Quality')
  && workboard.includes('| ENG-103 | Plant + Manufacturing Performance Codex | done-local |')
  && workboard.includes('upgrades the projection to `supermega.plant.order_effectiveness.v2`')
  && workboard.includes('75% Availability, 96.77% Performance, 80% Quality, and 58.06% OEE')
  && research.includes('https://help.sap.com/docs/sap-digital-manufacturing/insights/oee-calculations')
  && research.includes('must not calculate OEE until planned productive time and downtime are bound'))
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
requireContract('competitive execution cut preserves money-path focus and claim boundaries',
  competitiveExecutionCutText.includes('Contract: `supermega.competitive-execution-cut.v1`')
  && competitiveExecutionCutText.includes('OneDrive expert/audit exports are advisory inputs only.')
  && competitiveExecutionCutText.includes('AI is a shared capability, not a customer product.')
  && competitiveExecutionCutNormalized.includes('Do not claim SAP, Odoo, Shopify, or POS-SaaS replacement parity until managed tenant, support, observability, recovery, and commercial evidence gates pass.')
  && competitiveExecutionCutNormalized.includes('Shop remains the money-path product until its owner-private pilot has at least 20 consecutive accepted observed runs covering pilot days 1 through 5.')
  && competitiveExecutionCutNormalized.includes('GitHub `main` protection is verified. The current first external gate is the exact review-branch push.')
  && !competitiveExecutionCutText.includes('The current first external gate is GitHub `main` protection.')
  && competitiveExecutionCutNormalized.includes('The current first commercial evidence gate is the owner-private Shop baseline and pilot.')
  && competitiveExecutionCutText.includes('The implementer cannot sign its own verification.')
  && competitiveExecutionCutNormalized.includes('Do not create persistent subagents, recursive delegation, hosted agent runs, or parallel local model work.')
  && competitiveExecutionCutNormalized.includes('No new product shell should be created until one of the four products completes a real owner-reviewed learning loop.')
  && competitiveExecutionCutText.includes('No deploy, provider write, credential')
  && competitiveExecutionCutNormalized.includes('managed activation is authorized by this document.'))

requireContract('manifest has one canonical four-product registry',
  manifest.schemaVersion === 'supermega.site-context.v2'
  && manifest.customerProducts?.map((entry) => `${entry.id}:${entry.runtimeId}:${entry.name}`).join(',')
    === 'shop:commerce:Shop,plant:production:Plant,website:website:Website,ecommerce:ecommerce:Ecommerce')
requireContract('manifest customer routes are canonical',
  manifest.customerProducts?.map((entry) => entry.appRoute).join(',')
    === 'https://app.supermega.dev/shop/,https://app.supermega.dev/plant/,https://app.supermega.dev/website/,https://app.supermega.dev/ecommerce/')
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
  && manifest.templatePackPolicy?.lifecycle?.join(',') === 'choose-pack,map-import,preview-sample,named-operator-pilot,prove-outcome,managed-activation,measure-and-iterate'
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
  && now.includes('Plant issues link to Problems')
  && now.includes('`/work/` stays labelled HQ'))
requireContract('local and managed truth remains explicit',
  current.includes('The default app remains an isolated browser-local trial')
  && current.includes('Managed mode remains locked behind authenticated tenant identity')
  && now.includes('hosted activation is not proven'))
requireContract('research decision is superseded',
  research.includes('superseded in part by the founder')
  && research.includes('Shop and Plant are the canonical customer-facing operating products')
  && research.includes('Ecommerce owns the storefront and order-intent layer and feeds Shop'))

requireContract('local PostgreSQL rehearsal remains bounded',
  databaseRehearsal.schemaVersion === 'supermega.hq.database-rehearsal.v2'
  && /^[0-9a-f]{40}$/.test(databaseRehearsal.implementationCommit || '')
  && JSON.stringify(databaseRehearsal.implementation?.paths) === JSON.stringify(databaseImplementationPaths)
  && databaseRehearsal.implementation?.digest === databaseImplementationDigest
  && /^sha256:[0-9a-f]{64}$/.test(databaseRehearsal.implementationDigest || '')
  && Number.isSafeInteger(databaseRehearsal.implementationFileCount)
  && databaseRehearsal.implementationFileCount >= 10
  && databaseRehearsal.localVerification?.conclusion === 'success'
  && databaseRehearsal.localVerification?.externallyHosted === false
  && databaseRehearsal.githubCi?.coversImplementationCommit === false
  && databaseRehearsal.engine?.major === 17
  && databaseRehearsal.engine?.tlsActive === true
  && databaseRehearsal.engine?.loopbackOnly === true
  && databaseRehearsal.runtime?.adapter === 'PostgresTrialStore'
  && databaseRehearsal.runtime?.explicitTransaction === true
  && databaseRehearsal.migration?.count === 12
  && databaseRehearsal.migration?.schemaVersion === 11
  && databaseRehearsal.migration?.productionValidatorReady === true
  && Object.keys(databaseRehearsal.checks || {}).length === 56
  && Object.values(databaseRehearsal.checks || {}).every((value) => value === true)
  && databaseRehearsal.checks?.capabilityScopedReads === true
  && databaseRehearsal.checks?.capabilityScopedEventReads === true
  && databaseRehearsal.checks?.approvalRequesterReadScoped === true
  && databaseRehearsal.checks?.approvalReviewerReadsAll === true
  && databaseRehearsal.checks?.writeCapabilityImpliesRead === true
  && databaseRehearsal.checks?.managedOwnerAuthorizationDurable === true
  && databaseRehearsal.checks?.managedActivationAtomicRollback === true
  && databaseRehearsal.checks?.managedActivationIdempotentReplay === true
  && databaseRehearsal.checks?.managedSupabaseSessionRevocationEnforced === true
  && databaseRehearsal.checks?.publicBrowserQuarantineEnforced === true
  && databaseRehearsal.checks?.publicBrowserQuarantineIdempotent === true
  && databaseRehearsal.checks?.restoredPublicBrowserQuarantinePreserved === true
  && databaseRehearsal.checks?.managedContextActivationEvidenceBound === true
  && databaseRehearsal.checks?.managedContextAuthenticatedIdentityEnforced === true
  && databaseRehearsal.checks?.managedContextValidationZeroWrite === true
  && databaseRehearsal.checks?.managedContextRetentionRlsAudited === true
  && databaseRehearsal.checks?.managedContextRetentionIdempotentReplay === true
  && databaseRehearsal.checks?.managedContextOwnerCapabilityEnforced === true
  && databaseRehearsal.checks?.managedContextSummaryReadback === true
  && databaseRehearsal.checks?.managedSuspensionDatabaseEnforced === true
  && databaseRehearsal.checks?.managedSuspensionBlocksAdditionalMember === true
  && databaseRehearsal.checks?.managedSuspensionWriteDenied === true
  && databaseRehearsal.checks?.managedWorkspaceDiscoveryActorScoped === true
  && databaseRehearsal.checks?.managedWorkspaceDiscoverySuspensionFiltered === true
  && databaseRehearsal.storage?.hostedStoragePrivacyProofRequired === true
  && databaseRehearsal.storage?.publicBucketCount === 0
  && databaseRehearsal.safety?.cleanupComplete === true
  && databaseRehearsal.safety?.secretValuesExposed === false
  && databaseRehearsal.safety?.productionMutated === false
  && databaseRehearsal.safety?.supabaseMutated === false
  && databaseRehearsal.safety?.vercelMutated === false)

requireContract('managed pilot readiness is derived and fail closed',
  managedPilotReadiness.contract === 'supermega.managed-pilot-readiness.v5'
  && managedPilotReadiness.pilotMode === 'owner_named'
  && managedPilotReadiness.overall?.status === 'blocked'
  && managedPilotReadiness.overall?.localDatabaseProofReady === true
  && managedPilotReadiness.overall?.hostedActivationReady === false
  && managedPilotReadiness.overall?.blockingGateCount === managedPilotReadiness.gates?.filter((entry) => entry.status === 'blocked').length
  && managedPilotReadiness.overall?.blockingGateIds?.join(',') === managedPilotReadiness.gates?.filter((entry) => entry.status === 'blocked').map((entry) => entry.id).join(',')
  && managedPilotReadiness.overall?.blockingGateIds?.join(',') === 'preview_rehearsal,pilot_evidence,production_activation'
  && managedPilotReadiness.overall?.nextAction?.kind === 'founder_decision'
  && managedPilotReadiness.overall?.nextAction?.decisionId === 'managed-production-activation'
  && managedPilotReadiness.overall?.nextAction?.requires?.join(',') === 'approve_runtime_role_provisioning,approve_first_named_owner_identity,approve_exact_production_release,approve_managed_activation_window'
  && managedPilotReadiness.overall?.nextAction?.targetEnvironment === 'production'
  && managedPilotReadiness.overall?.nextAction?.operatorProductId === 'shop'
  && managedPilotReadiness.overall?.nextAction?.maximumLifetimeHours === null
  && managedPilotReadiness.products?.map((product) => product.productId).join(',') === 'shop,plant,website,ecommerce'
  && managedPilotReadiness.products?.every((product) => product.managedPilotStatus === 'blocked' && product.automationStatus === 'owner-gated')
  && managedPilotReadiness.founderDecision?.status === 'required'
  && managedPilotReadiness.founderDecision?.authority === 'proposal_only'
  && managedPilotReadiness.founderDecision?.createsAuthority === false
  && managedPilotReadiness.founderDecision?.approvalReceipt === null
  && managedPilotReadiness.founderDecision?.target?.environment === 'production'
  && managedPilotReadiness.founderDecision?.target?.production === true
  && managedPilotReadiness.founderDecision?.target?.startsWithProductionData === false
  && managedPilotReadiness.founderDecision?.target?.maximumLifetimeHours === null
  && managedPilotReadiness.founderDecision?.target?.deleteAfterEvidence === false
  && managedPilotReadiness.founderDecision?.operator?.productId === 'shop'
  && managedPilotReadiness.founderDecision?.proposedActions?.includes('provision_dedicated_runtime_login')
  && managedPilotReadiness.founderDecision?.proposedActions?.includes('deploy_exact_reviewed_release')
  && managedPilotReadiness.founderDecision?.doesNotAuthorize?.includes('additional_tenant_activation')
  && managedPilotReadiness.founderDecision?.doesNotAuthorize?.includes('hosted_scheduler_activation')
  && managedPilotReadiness.controls?.externalWritesPerformed === false
  && managedPilotReadiness.controls?.connectorRequestsPerformed === 0
  && managedPilotReadiness.controls?.modelCallsRequiredToBuild === 0
  && managedPilotReadiness.controls?.productionWritesEnabled === false
  && managedPilotReadiness.liveProduction?.operatingMode === 'isolated_demo'
  && managedPilotReadiness.liveProduction?.schemaVersion === supabaseSecurityAudit.managedBackend?.liveSchemaVersion
  && managedPilotReadiness.liveProduction?.localTargetVersion === supabaseSecurityAudit.managedBackend?.localTargetVersion
  && managedPilotReadiness.liveProduction?.versionDrift === supabaseSecurityAudit.managedBackend?.versionDrift
  && managedPilotReadiness.liveProduction?.browserRolesDenied === true
  && managedPilotReadiness.liveProduction?.publicBrowserQuarantine === true
  && managedPilotReadiness.liveProduction?.managedWritesEnabled === false
  && managedPilotReadiness.previewRehearsal?.proofComplete === false
  && managedPilotReadiness.previewRehearsal?.exactCandidateRequired === true
  && managedPilotReadiness.previewRehearsal?.productionRefsRejected === true
  && managedPilotReadiness.previewRehearsal?.productionDataRejected === true
  && managedPilotReadiness.previewRehearsal?.privilegedRuntimeCredentialsRejected === true
  && managedPilotReadiness.pilotEvidence?.pilotMode === 'owner_named'
  && managedPilotReadiness.pilotEvidence?.productId === 'shop'
  && managedPilotReadiness.pilotEvidence?.proofComplete === false
  && managedPilotReadiness.pilotEvidence?.requiredAcceptedConsecutiveRuns === 20
  && managedPilotReadiness.pilotEvidence?.acceptedConsecutiveRuns === 0
  && JSON.stringify(managedPilotReadiness.pilotEvidence?.requiredPilotDayIndexes) === JSON.stringify([1, 2, 3, 4, 5])
  && JSON.stringify(managedPilotReadiness.pilotEvidence?.acceptedConsecutivePilotDayIndexes) === JSON.stringify([])
  && managedPilotReadiness.pilotEvidence?.pilotSequenceCoverageMet === false
  && managedPilotReadiness.pilotEvidence?.syntheticEvidenceAccepted === false
  && managedPilotReadiness.pilotEvidence?.publicIdentityAllowed === false
  && managedPilotReadiness.sourceReceipts?.length === 10
  && managedPilotReadiness.sourceReceipts?.some((receipt) => receipt.path === 'hq/readiness/supabase-security-advisor-audit.json')
  && managedPilotReadiness.sourceReceipts?.some((receipt) => receipt.path === 'hq/readiness/hosted-storage-privacy-proof.json')
  && managedPilotReadiness.sourceReceipts?.some((receipt) => receipt.path === 'hq/readiness/managed-persistence-proof.json')
  && managedPilotReadiness.sourceReceipts?.some((receipt) => receipt.path === 'hq/readiness/self-serve-pilot-proof.json')
  && managedPilotReadiness.selfServePilot?.proofComplete === true
  && managedPilotReadiness.selfServePilot?.contract === 'supermega.self-serve-pilot-proof.v1'
  && managedPilotReadiness.selfServePilot?.schemaVersionProven === 11
  && managedPilotReadiness.gates?.map((gate) => gate.id).join(',') === 'preview_rehearsal,managed_persistence,storage_privacy,security,pilot_evidence,production_activation'
  && managedPilotReadiness.gates?.find((gate) => gate.id === 'preview_rehearsal')?.status === 'blocked'
  && managedPilotReadiness.gates?.find((gate) => gate.id === 'managed_persistence')?.status === 'ready-hosted'
  && managedPilotReadiness.gates?.find((gate) => gate.id === 'storage_privacy')?.status === 'ready-hosted'
  && managedPilotReadiness.gates?.find((gate) => gate.id === 'security')?.status === 'ready-hosted'
  && managedPilotReadiness.gates?.find((gate) => gate.id === 'pilot_evidence')?.status === 'blocked'
  && managedPilotReadiness.gates?.find((gate) => gate.id === 'production_activation')?.status === 'blocked'
  && managedPilotReadiness.securityAudit?.contract === 'supermega.supabase-security-advisor-audit.v2'
  && managedPilotReadiness.securityAudit?.asOf === supabaseSecurityAudit.asOf
  && managedPilotReadiness.securityAudit?.findingCount === supabaseSecurityAudit.advisor?.findingCount
  && managedPilotReadiness.securityAudit?.liveSchemaVersion === supabaseSecurityAudit.managedBackend?.liveSchemaVersion
  && managedPilotReadiness.securityAudit?.localTargetVersion === supabaseSecurityAudit.managedBackend?.localTargetVersion
  && managedPilotReadiness.securityAudit?.productionMutationAuthorized === false
  && managedPilotReadiness.securityAudit?.databaseWrites === 0
  && managedPilotReadiness.gates?.find((gate) => gate.id === 'security')?.evidence === (supabaseSecurityAudit.conclusion?.status === 'clear'
    ? `Protected production is at managed schema v${supabaseSecurityAudit.managedBackend?.liveSchemaVersion}, zero drift from local target v${supabaseSecurityAudit.managedBackend?.localTargetVersion}, browser roles denied, public-browser quarantine recorded, and Security Advisor clear.`
    : `${supabaseSecurityAudit.advisor?.findingCount} fail-closed public-table advisor findings remain; browser object/default grants are not yet quarantined on hosted Supabase, and protected managed schema v${supabaseSecurityAudit.managedBackend?.liveSchemaVersion} trails local target v${supabaseSecurityAudit.managedBackend?.localTargetVersion}.`)
  && managedPilotReadiness.gates?.find((gate) => gate.id === 'security')?.nextAction === supabaseSecurityAudit.conclusion?.nextAction
  && supabaseSecurityAudit.projectRef === JSON.parse(packageText).supermega?.productionSupabaseProjectRef
  && supabaseSecurityAudit.targetClassification === 'protected-production'
  && Number.isInteger(supabaseSecurityAudit.managedBackend?.liveSchemaVersion)
  && supabaseSecurityAudit.managedBackend.liveSchemaVersion >= 7
  && supabaseSecurityAudit.managedBackend.liveSchemaVersion <= 11
  && supabaseSecurityAudit.managedBackend?.localTargetVersion === 11
  && supabaseSecurityAudit.managedBackend?.browserRolesDenied === true
  && supabaseSecurityAudit.managedBackend?.metadataRlsEnabled === (supabaseSecurityAudit.managedBackend.liveSchemaVersion >= 9)
  && supabaseSecurityAudit.conclusion?.productionMutationAuthorized === false
  && supabaseSecurityAudit.controls?.databaseWrites === 0
  && packageText.includes('"readiness:supabase-security:verify": "node tools/verify_supabase_security_advisor_audit.mjs"')
  && packageText.includes('"estate:technical:verify": "node tools/manage_technical_estate.mjs --verify"')
  && packageText.includes('"supabase:preview-rehearsal:proposal:verify": "node tools/prepare_supabase_preview_rehearsal_proposal.mjs --verify"')
  && packageText.includes('"github:main-protection:proposal:verify": "node tools/prepare_github_main_protection_packet.mjs --verify"')
  && packageText.includes('"release:owner-gates:verify": "node tools/verify_release_stack_owner_gates.mjs --verify"')
  && packageText.includes('"github:main-protection:apply:plan": "node tools/apply_github_main_protection.mjs --plan"')
  && packageText.includes('"github:main-protection:apply:self-test": "node --test tools/apply_github_main_protection.test.mjs && node tools/apply_github_main_protection.mjs --self-test"')
  && packageText.includes('"github:main-protection:owner-action-card:self-test": "node --test tools/prepare_github_main_protection_owner_action_card.test.mjs && node tools/prepare_github_main_protection_owner_action_card.mjs --self-test"')
  && packageText.includes('"github:main-protection:snapshot:self-test": "node --test tools/collect_github_main_protection_snapshot.test.mjs && node tools/collect_github_main_protection_snapshot.mjs --self-test"')
  && packageText.includes('"release:branch-push:apply:self-test": "node --test tools/apply_review_branch_push.test.mjs && node tools/apply_review_branch_push.mjs --self-test"')
  && packageText.includes('"release:pull-request:create:self-test": "node --test tools/apply_release_pull_request.test.mjs && node tools/apply_release_pull_request.mjs --self-test"')
  && packageText.includes('"operator:board:self-test": "node --test tools/prepare_current_operator_board.test.mjs && node tools/prepare_current_operator_board.mjs --self-test"')
  && packageText.includes('"admin:technical-coordination": "node tools/prepare_admin_technical_coordination_packet.mjs"')
  && packageText.includes('"admin:technical-coordination:self-test": "node --test tools/prepare_admin_technical_coordination_packet.test.mjs && node tools/prepare_admin_technical_coordination_packet.mjs --self-test"')
  && packageText.includes('"operating:action-board:verify": "node tools/verify_operating_action_board.mjs"')
  && packageText.includes('"operating:action-board:self-test": "node --test kernel/operating-action-board.test.mjs && node tools/verify_operating_action_board.mjs --self-test"')
  && packageText.includes('"supermega:status:brief": "node tools/prepare_supermega_status_brief.mjs"')
  && packageText.includes('"supermega:status:brief:self-test": "node --test tools/prepare_supermega_status_brief.test.mjs && node tools/prepare_supermega_status_brief.mjs --self-test"')
  && packageText.includes('"product:readiness-matrix": "node tools/prepare_product_readiness_matrix.mjs"')
  && packageText.includes('"product:readiness-matrix:self-test": "node --test tools/prepare_product_readiness_matrix.test.mjs && node tools/prepare_product_readiness_matrix.mjs --self-test"')
  && packageText.includes('"release:next-action-preflight": "node tools/prepare_next_release_action_preflight.mjs"')
  && packageText.includes('"release:next-action-preflight:self-test": "node --test tools/prepare_next_release_action_preflight.test.mjs && node tools/prepare_next_release_action_preflight.mjs --self-test"')
  && packageText.includes('"release:artifact-family:verify": "node tools/verify_release_artifact_family.mjs"')
  && packageText.includes('"release:artifact-family:self-test": "node --test tools/verify_release_artifact_family.test.mjs && node tools/verify_release_artifact_family.mjs --self-test"')
  && packageText.includes('"shop:pilot:launch-gate:verify": "node tools/verify_shop_pilot_launch_gate.mjs --verify"')
  && packageText.includes('"shop:pilot:launch-gate:self-test": "node --test tools/verify_shop_pilot_launch_gate.test.mjs && node tools/verify_shop_pilot_launch_gate.mjs --self-test"')
  && packageText.includes('"shop:pilot:intake-packet": "node tools/prepare_shop_pilot_private_intake_packet.mjs"')
  && packageText.includes('"shop:pilot:intake-packet:self-test": "node --test tools/prepare_shop_pilot_private_intake_packet.test.mjs && node tools/prepare_shop_pilot_private_intake_packet.mjs --self-test"')
  && packageText.includes('"shop:pilot:baseline-packet": "node tools/prepare_shop_pilot_baseline_packet.mjs"')
  && packageText.includes('"shop:pilot:baseline-packet:self-test": "node --test tools/prepare_shop_pilot_baseline_packet.test.mjs && node tools/prepare_shop_pilot_baseline_packet.mjs --self-test"')
  && packageText.includes('"shop:pilot:day0-readiness": "node tools/prepare_shop_pilot_day0_readiness_packet.mjs"')
  && packageText.includes('"shop:pilot:day0-readiness:self-test": "node --test tools/prepare_shop_pilot_day0_readiness_packet.test.mjs && node tools/prepare_shop_pilot_day0_readiness_packet.mjs --self-test"')
  && packageText.includes('"shop:pilot:day0-owner-baseline-card": "node tools/prepare_shop_pilot_day0_owner_baseline_action_card.mjs"')
  && packageText.includes('"shop:pilot:day0-owner-baseline-card:self-test": "node --test tools/prepare_shop_pilot_day0_owner_baseline_action_card.test.mjs && node tools/prepare_shop_pilot_day0_owner_baseline_action_card.mjs --self-test"')
  && packageText.includes('"shop:pilot:owner-observation-pack": "node tools/prepare_shop_pilot_owner_observation_pack.mjs"')
  && packageText.includes('"shop:pilot:owner-observation-pack:self-test": "node --test tools/prepare_shop_pilot_owner_observation_pack.test.mjs && node tools/prepare_shop_pilot_owner_observation_pack.mjs --self-test"')
  && packageText.includes('"shop:pilot:decision-packet": "node tools/prepare_shop_pilot_decision_packet.mjs"')
  && packageText.includes('"shop:pilot:decision-packet:self-test": "node --test tools/prepare_shop_pilot_decision_packet.test.mjs && node tools/prepare_shop_pilot_decision_packet.mjs --self-test"')
  && packageText.includes('"shop:receipt:print-geometry:verify": "node tools/verify_shop_receipt_print_geometry.mjs"')
  && packageText.includes('"shop:receipt:print-geometry:self-test": "node --test tools/verify_shop_receipt_print_geometry.test.mjs && node tools/verify_shop_receipt_print_geometry.mjs --self-test"')
  && packageText.includes('"strategy:posture:verify": "node --test tools/verify_strategy_posture.test.mjs && node tools/verify_strategy_posture.mjs --self-test && node tools/verify_strategy_posture.mjs"')
  && packageText.includes('"operational:action-packet": "node tools/prepare_operational_report_action_packet.mjs"')
  && packageText.includes('"operational:action-packet:self-test": "node --test tools/prepare_operational_report_action_packet.test.mjs && node tools/prepare_operational_report_action_packet.mjs --self-test"')
  && packageText.includes('"hq:verify": "node tools/run_hq_verify.mjs"')
  && packageText.includes('"hq:verify:steps": "node tools/record_postgres17_rehearsal.mjs --verify')
  && packageText.includes('node tools/record_postgres17_rehearsal.mjs --verify && node tools/verify_supabase_security_advisor_audit.mjs && node tools/manage_technical_estate.mjs --verify && node tools/manage_managed_pilot_readiness.mjs --verify && node tools/prepare_supabase_preview_rehearsal_proposal.mjs --verify && node tools/prepare_github_main_protection_packet.mjs --verify && node tools/verify_release_stack_owner_gates.mjs --verify && npm run github:main-protection:apply:self-test && npm run github:main-protection:owner-action-card:self-test && npm run github:main-protection:snapshot:self-test && npm run release:branch-push:apply:self-test && npm run release:pull-request:create:self-test && npm run operator:board:self-test && npm run operating:action-board:self-test && npm run operational:action-packet:self-test && npm run operating:action-board:verify && npm run supermega:status:brief:self-test && npm run product:readiness-matrix:self-test && npm run release:next-action-preflight:self-test && npm run release:owner-approval:packet:self-test && npm run release:control-index:self-test && npm run admin:technical-coordination:self-test && npm run release:artifact-family:self-test && npm run shop:pilot:intake-packet:self-test && npm run shop:pilot:baseline-packet:self-test && npm run shop:pilot:day0-readiness:self-test && npm run shop:pilot:day0-owner-baseline-card:self-test && npm run shop:pilot:owner-observation-pack:self-test && npm run shop:pilot:decision-packet:self-test && npm run shop:pilot:day0-readiness && npm run shop:receipt:print-geometry:self-test && npm run shop:receipt:print-geometry:verify && node tools/verify_shop_pilot_launch_gate.mjs --verify && npm run strategy:posture:verify && node tools/verify_hq_contract.mjs'))

requireContract('current Supabase compatibility is a release gate',
  packageText.includes('"database:supabase:compatibility": "node tools/verify_supabase_compatibility.mjs"')
  && packageText.includes('npm run database:supabase:compatibility && npm run database:migrations:verify')
  && packageText.includes('"productionSupabaseTargetStatus": "protected-unapproved"')
  && supabaseCompatibilityVerifierText.includes("const PUBLIC_TABLE_AUTO_EXPOSURE_CHANGE = '2026-10-30'")
  && supabaseCompatibilityVerifierText.includes('public_table_exposure_posture_missing')
  && supabaseCompatibilityVerifierText.includes('explicit_table_grant_or_revoke_for_public_anon_authenticated_or_service_role')
  && supabaseCompatibilityVerifierText.includes('allow_cross_file_public_table_quarantine')
  && workboard.includes('| OPS-084 | CEO + Supabase Compatibility Codex | done-local |')
  && workboard.includes('| OPS-085 | CEO + Supabase Target Authority Codex | done-local |'))

requireContract('current authority includes HQ',
  current.includes('hq/portfolio.json')
  && current.includes('## Internal company system and R&D'))
requireContract('OneDrive archive is not authority',
  readme.includes('historical archive and source intake')
  && readme.includes('does not override this repository'))
requireContract('source provenance retained',
  ['1VkuZ5_aUQ7DiYirt2asvzwsQJT9F_AuA', '1uxZ1Ey8xLX5yGmOCZrJ7Mx3I0HMd1unT', 'DawBDyzkTf8', '7483054882816675840', 'Da-NXcnkz8p']
    .every((token) => readme.includes(token))
  && readme.includes('HQ derives no claim, feature, or backlog item from it')
  && workboard.includes('| OPS-053 | CEO + Agent Operations / Provenance Integrity Codex | done-local |')
  && workboard.includes('Checkpoint `72059a8` replaces the inaccessible Instagram reference')
  && workboard.includes('| OPS-054 | CEO + Agent Operations / Crew Authority Codex | done-local |')
  && workboard.includes('Checkpoint `02cb277` keeps the caller\'s role budget as a maximum admission ceiling')
  && workboard.includes('| OPS-055 | CEO + Agent Operations / Assignment Capacity Codex | done-local |')
  && workboard.includes('Checkpoint `f4aa81e` derives two concurrent company cycles from four active assignments')
  && workboard.includes('| OPS-056 | CEO + Vercel Operations / Startup Efficiency Codex | done-local |')
  && workboard.includes('Checkpoint `006070f` defers the 66 KB company-operations reporter')
  && workboard.includes('| OPS-057 | CEO + Vercel Operations / Connector Efficiency Codex | done-local |')
  && workboard.includes('Checkpoint `c508983` defers public HTTP, CBM, Gmail, Sheets, PayPal, Pipedrive, ClickUp, and Telegram modules')
  && workboard.includes('| OPS-058 | CEO + Agent Operations / Model Efficiency Codex | done-local |')
  && workboard.includes('Checkpoint `1c62d45` removes only top-level `company_operations_status.generatedAt`')
  && kernelOperatorText.includes("planningMode !== 'hq_authority_fixed'")
  && kernelOperatorText.includes("result?.tool !== 'company_operations_status'")
  && kernelOperatorText.includes('const { generatedAt: _generatedAt, ...stableData } = data')
  && !workboard.includes('The selected Instagram slide confirms'))
requireContract('HQ stays concise',
  canonicalTextLength(readme) < 7000
  && canonicalTextLength(now) < 9000
  && canonicalTextLength(qaBrief) < 6000
  && canonicalTextLength(current) < 14000
  && canonicalTextLength(portfolioText) < 16000)
requireContract('research remains gated',
  portfolio.researchGates?.some((entry) => entry.decision === 'reject')
  && current.includes('Resource intelligence stays inside HQ'))
requireContract('research uses official sources',
  portfolio.researchGates?.every((entry) =>
    /^https:\/\/(?:vercel\.com|tanstack\.com|supabase\.com|platform\.openai\.com)\//.test(entry.source || '')))
requireContract('Ally runtime audit is read-only and bounded',
  allyAuditText.includes("supermega.ally-runtime-audit.v1")
  && allyAuditText.includes("$HostAdmissionContract = 'supermega.ally-host-admission.v1'")
  && allyAuditText.includes('$Port -ge 5173 -and $Port -le 5199')
  && allyAuditText.includes('$BackendPorts = @(8000, 8001, 8788)')
  && allyAuditText.includes('$role = Get-ListenerRole $port')
  && allyAuditText.includes('maxConcurrentLocalRuns')
  && allyAuditText.includes("$CodexSubagentPolicyContract = 'supermega.codex-subagent-policy.v1'")
  && allyAuditText.includes("subagentObservation = 'runtime_count_not_os_observable'")
  && allyAuditText.includes('configuredMaxLocalSubagents = if ($enabled) { $null } else { 0 }')
  && allyAuditText.includes("code = 'codex_subagent_policy_unverified'")
  && allyAuditText.includes("code = 'codex_multi_agent_enabled'")
  && allyAuditText.includes('codexConfigPathReturned = $false')
  && allyAuditText.includes('codexConfigMaxBytes = $MaxCodexConfigBytes')
  && allyAuditText.includes("$LocalCompanyHealthContract = 'local-company.health.v1'")
  && allyAuditText.includes('$MaxLocalCompanyHealthBytes = 65536')
  && allyAuditText.includes("http://127.0.0.1:8765/health.json")
  && allyAuditText.includes("$request.AllowAutoRedirect = $false")
  && allyAuditText.includes("$request.Proxy = $null")
  && allyAuditText.includes("code = 'local_company_health_unavailable'")
  && allyAuditText.includes("code = 'local_company_work_active'")
  && allyAuditText.includes('commandLinesInspectedForOwnership = $true')
  && allyAuditText.includes('commandLinesReturned = $false')
  && allyAuditText.includes('secretValuesReturned = $false')
  && allyAuditText.includes('environmentRead = $false')
  && allyAuditText.includes('loopbackHealthRead = $true')
  && allyAuditText.includes('loopbackHealthMaxBytes = $MaxLocalCompanyHealthBytes')
  && allyAuditText.includes('automaticCleanup = $false')
  && allyAuditText.includes("http://127.0.0.1:11434/api/ps")
  && allyAuditText.includes('Get-NetTCPConnection -State Listen')
  && packageText.includes('"audit:ally"')
  && packageText.includes('"audit:ally:self-test"')
  && !/\b(?:Stop-Process|Start-Process|taskkill|kill|Remove-Item|EmptyWorkingSet|SetProcessWorkingSetSize)\b/i.test(allyAuditText))

requireContract('Ally zero-subagent policy is config-bound and fail-closed',
  workboard.includes('| OPS-091 | CEO + Ally Agent Capacity Codex | done-local |')
  && workboard.includes('configured ceiling is now reported as zero')
  && workboard.includes('enabled, missing, duplicate, malformed, oversized, or unreadable policy blocks company admission')
  && now.includes('`multi_agent = false`; one lease blocks duplicates')
  && now.includes('external handoffs require `release:handoff:verify`')
  && !now.includes('this integration candidate is `cd53a31'))

requireContract('Ally working-set recovery is preview-first and non-terminating',
  allyTrimText.includes("$Contract = 'supermega.ally-working-set-trim.v1'")
  && allyTrimText.includes("$RootProcessName = 'ChatGPT.exe'")
  && allyTrimText.includes("$RootExecutablePattern = 'C:\\Program Files\\WindowsApps\\OpenAI.Codex_*_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe'")
  && allyTrimText.includes('$MaxTargetCount = 128')
  && allyTrimText.includes('Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId, Name, ExecutablePath, WorkingSetSize')
  && allyTrimText.includes('Test-CodexLineage ([int]$_.ProcessId)')
  && allyTrimText.includes('[SuperMegaWorkingSet]::EmptyWorkingSet($liveTarget.Handle)')
  && allyTrimText.includes("mode = if ($Apply) { 'apply' } else { 'preview' }")
  && allyTrimText.includes('processTerminationCalls = 0')
  && allyTrimText.includes('commandLinesRead = $false')
  && allyTrimText.includes('environmentRead = $false')
  && allyTrimText.includes('secretValuesReturned = $false')
  && packageText.includes('"optimize:ally:preview"')
  && packageText.includes('"optimize:ally"')
  && packageText.includes('"optimize:ally:self-test"')
  && now.includes('Working-set trim is non-terminating')
  && workboard.includes('| OPS-059 | CEO + Ally Operations / Memory Recovery Codex | done-local |')
  && !/\b(?:Stop-Process|Start-Process|Stop-Service|Start-Service|Restart-Service|taskkill|kill|Remove-Item|SetProcessWorkingSetSize|Invoke-WebRequest|Invoke-RestMethod|curl(?:\.exe)?|wget(?:\.exe)?)\b/i.test(allyTrimText))

requireContract('Ally company cycles are host-admitted and serial',
  allyCompanyCycleText.includes("$Contract = 'supermega.ally-company-cycle.v2'")
  && allyCompanyCycleText.includes("$CeoCycleContract = 'supermega.ally-ceo-local-cycle.v1'")
  && allyCompanyCycleText.includes("$OwnerBriefContract = 'supermega.ally-ceo-owner-brief.v1'")
  && allyCompanyCycleText.includes("$LeaseContract = 'supermega.ally-company-cycle-lease.v1'")
  && allyCompanyCycleText.includes("$LeaseName = 'Local\\SuperMega.AllyCompanyCycle.v1'")
  && allyCompanyCycleText.includes('Enter-LocalCycleLease')
  && allyCompanyCycleText.includes("throw 'ally_local_cycle_busy'")
  && allyCompanyCycleText.includes('finally {')
  && allyCompanyCycleText.includes('Exit-LocalCycleLease $cycleLease')
  && allyCompanyCycleText.includes("@('--execute', '--refresh-knowledge')")
  && allyCompanyCycleText.includes("Join-Path $PSScriptRoot 'run_ally_ceo_local_cycle.mjs'")
  && allyCompanyCycleText.includes("$Receipt.ownerBrief.contract -ne $OwnerBriefContract")
  && allyCompanyCycleText.includes('[bool]$Receipt.controls.externalWrites')
  && allyCompanyCycleText.includes('[int]$resourceEnvelope.vercelActions -ne 0')
  && allyCompanyCycleText.includes('[bool]$resourceEnvelope.dynamicDelegation')
  && allyCompanyCycleText.includes("retryPolicy = 'next_scheduled_cycle'")
  && allyCompanyCycleText.includes('One local cycle maximum; external actions remain unavailable.')
  && packageText.includes('"company:ally:self-test"')
  && packageText.includes('"company:ally:auto"')
  && packageText.includes('"company:ally:auto:preflight"')
  && packageText.includes('"company:ally:auto:self-test"')
  && !/\b(?:Stop-Process|Start-Process|taskkill|kill|Remove-Item|EmptyWorkingSet|SetProcessWorkingSetSize)\b/i.test(allyCompanyCycleText))

requireContract('Ally CEO planning is exact, bounded, temporary, and side-effect free',
  allyCeoPlannerText.includes("ALLY_CEO_COMPANY_PLAN_CONTRACT = 'supermega.ally-ceo-company-plan.v1'")
  && allyCeoPlannerText.includes("'daily-company-control': Object.freeze(['operations-analyst'])")
  && allyCeoPlannerText.includes("'product-portfolio-control': Object.freeze(['delivery-planner'])")
  && allyCeoPlannerText.includes("ALLY_CEO_PRODUCT_FOCUS_CONTRACT = 'supermega.ally-ceo-product-focus.v3'")
  && allyCeoPlannerText.includes("PRODUCT_WORK_AUTHORITY_CONTRACT = 'supermega.product-work-authority.v2'")
  && allyCeoPlannerText.includes('completedLocalAutomations')
  && allyCeoPlannerText.includes('completedLocalAutomationSummary')
  && allyCeoPlannerText.includes('digest(stableStringify(portfolio.completedLocalAutomations))')
  && allyCeoPlannerText.includes('ally_ceo_company_plan_product_work_already_completed')
  && allyCeoPlannerText.includes("reason: 'no_executable_product_focus'")
  && allyCeoPlannerText.includes('planningModelCalls: 0')
  && allyCeoPlannerText.includes("selection: 'portfolio_priority_ready'")
  && allyCeoPlannerText.includes("'failure_recovery'")
  && allyCeoPlannerText.includes("registeredRoleLimit !== 12")
  && allyCeoPlannerText.includes("activeAssignmentLimit !== 1")
  && allyCeoPlannerText.includes("maxAgentsPerCycle !== 1")
  && allyCeoPlannerText.includes("maxConcurrentCompanyCycles !== 1")
  && allyCeoPlannerText.includes("maxConcurrentAllyRuns: 1")
  && allyCeoPlannerText.includes("maxAgents: 1")
  && allyCeoPlannerText.includes("ALLY_CEO_CYCLE_EXPERIMENT_CONTRACT = 'supermega.ally-ceo-cycle-experiment.v1'")
  && allyCeoPlannerText.includes("primaryMetric: 'accepted_outcomes_per_1000_work_units'")
  && allyCeoPlannerText.includes('automaticExecution: false')
  && allyCeoPlannerText.includes('automaticPromotion: false')
  && allyCeoPlannerText.includes("planningModelCalls: 0")
  && allyCeoPlannerText.includes("planningConnectorRequests: 0")
  && allyCeoPlannerText.includes("planningExternalWrites: false")
  && allyCeoPlannerText.includes("ally_ceo_company_plan_non_authoritative_source")
  && allyCeoPlannerText.includes("ally_ceo_company_plan_sensitive_evidence")
  && allyCeoPlannerText.includes("ally_ceo_company_plan_product_routing_invalid")
  && allyCeoPlannerText.includes('validateManagedPilotReadiness')
  && allyCeoPlannerText.includes('managedPilotReadiness')
  && allyCeoPlannerText.includes("hq/WORKBOARD.md#execution-order")
  && allyCeoPlannerCliText.includes('supermega-ally-ceo-company-plan-${planHash.slice(0, 12)}.json')
  && allyCeoPlannerCliText.includes("resolve(root, 'hq', 'readiness', 'managed-pilot-readiness.json')")
  && allyCeoPlannerCliText.includes("flag: 'wx'")
  && allyCeoPlannerCliText.includes("ally_ceo_company_plan_current_evidence_mismatch")
  && packageText.includes('"company:ally:plan": "node kernel/scripts/plan-ally-ceo-company.mjs"')
  && packageText.includes('"company:ally:plan:verify": "node kernel/scripts/plan-ally-ceo-company.mjs --verify"')
  && packageText.includes('"readiness:managed:verify": "node tools/manage_managed_pilot_readiness.mjs --verify"')
  && workboard.includes('| OPS-063 | CEO + Agent Operations / Ally Planning Codex | done-local |')
  && workboard.includes('| OPS-080 | CEO + R&D Efficiency Codex | done-local |')
  && workboard.includes('| OPS-081 | CEO + Local Runtime Efficiency Codex | done-local |')
  && workboard.includes('| OPS-082 | CEO + Vercel Release Truth Codex | done-local |')
  && workboard.includes('| OPS-083 | CEO + Live Admission Codex | done-local |')
  && allyCeoLocalCycleText.includes("skipped: 'period_closed'")
  && agentSecurity.includes('Instagram shortcode `Da-NXcnkz8p`')
  && !/\b(?:fetch|XMLHttpRequest|WebSocket|child_process|execFile|spawn|Worker|setInterval)\b/.test(allyCeoPlannerText)
  && !/\b(?:fetch|XMLHttpRequest|WebSocket|child_process|execFile|spawn|Worker|setInterval|unlink|rm)\b/.test(allyCeoPlannerCliText))

requireContract('Ally CEO execution uses one exact local-company run and no external action surface',
  allyCeoLocalCycleText.includes("ALLY_CEO_LOCAL_CYCLE_CONTRACT = 'supermega.ally-ceo-local-cycle.v1'")
  && allyCeoLocalCycleText.includes("resolve(root, 'hq', 'readiness', 'managed-pilot-readiness.json')")
  && allyCeoLocalCycleText.includes("'operations-analyst': 'operations'")
  && allyCeoLocalCycleText.includes("'delivery-planner': 'product'")
  && allyCeoLocalCycleText.includes("'project-controller': 'chief-of-staff'")
  && allyCeoLocalCycleText.includes("'growth-pipeline-control': 'growth-pipeline control'")
  && allyCeoLocalCycleText.includes('Draft one truthful four-product lead-qualification and demo-readiness record')
  && allyCeoLocalCycleText.includes('Reconcile one zero-spend operating budget and risk register')
  && !allyCeoLocalCycleText.includes("'growth-pipeline-control': 'internal growth-pipeline control'")
  && allyCeoLocalCycleText.includes("ally_ceo_local_cycle_host_blocked")
  && allyCeoLocalCycleText.includes("ally_ceo_local_cycle_host_not_idle")
  && allyCeoLocalCycleText.includes("ally_ceo_local_cycle_knowledge_not_current")
  && allyCeoLocalCycleText.includes("ally_ceo_local_cycle_knowledge_source_unavailable")
  && allyCeoLocalCycleText.includes("ally_ceo_local_cycle_knowledge_refresh_rejected")
  && allyCeoLocalCycleText.includes("ally_ceo_local_cycle_knowledge_refresh_requires_execution")
  && allyCeoLocalCycleText.includes('ally_ceo_local_cycle_hq_live_rejected')
  && allyCeoLocalCycleText.includes("kind === 'hq_live'")
  && allyCeoLocalCycleText.includes("resolve(root, 'tools', 'verify_hq_live_state.mjs')")
  && allyCeoLocalCycleText.includes("await runCommand({ kind: 'hq_live', args: [], timeoutMs: 90_000 })")
  && allyCeoLocalCycleText.includes("args: ['knowledge', 'refresh', '--project', 'SuperMega']")
  && allyCeoLocalCycleText.includes("ally_ceo_local_cycle_duplicate_plan")
  && allyCeoLocalCycleText.includes("ally_ceo_local_cycle_legacy_repair_requires_execution")
  && allyCeoLocalCycleText.includes("ally_ceo_local_cycle_legacy_repair_not_allowed")
  && allyCeoLocalCycleText.includes("ally_ceo_local_cycle_legacy_repair_not_available")
  && allyCeoLocalCycleText.includes("EXECUTION_SPEC_VERSION = '2026-07-29.23'")
  && allyCeoLocalCycleText.includes("LEGACY_EXECUTION_SPEC_VERSIONS = Object.freeze(['2026-07-29.22', '2026-07-29.21', '2026-07-29.20', '2026-07-29.19', '2026-07-29.18', '2026-07-29.17', '2026-07-29.16', '2026-07-29.15', '2026-07-29.14', '2026-07-29.13', '2026-07-29.12', '2026-07-29.11', '2026-07-29.10'])")
  && allyCeoLocalCycleText.includes('ALLY_CEO_RESOURCE_ENVELOPE_CONTRACT')
  && allyCeoLocalCycleText.includes('ally_ceo_local_cycle_resource_envelope_invalid')
  && allyCeoLocalCycleText.includes('productFocus.workOrder.startsWith')
  && allyCeoLocalCycleText.includes('productFocus.workOrderId')
  && allyCeoLocalCycleText.includes('workOrderId.startsWith(`${productFocus.productId}-`)')
  && allyCeoLocalCycleText.includes('vercelActions: 0')
  && allyCeoLocalCycleText.includes('hostedSchedulerActions: 0')
  && allyCeoLocalCycleText.includes("LOCAL_ONLY_HQ_LIVE_FAILURE = 'scheduler_batch_limit_exceeded'")
  && allyCeoLocalCycleText.includes('export function recoverableHqLiveOutput(error)')
  && allyCeoLocalCycleText.includes("failures[0] === LOCAL_ONLY_HQ_LIVE_FAILURE")
  && allyCeoLocalCycleText.includes("receipt.scheduler?.status === 'degraded'")
  && allyCeoLocalCycleText.includes('receipt.scheduler?.configured === false')
  && allyCeoLocalCycleText.includes('receipt.scheduler?.pcDependency === false')
  && allyCeoLocalCycleText.includes('receipt.scheduler?.maxJobsPerRun === 2')
  && allyCeoLocalCycleText.includes('receipt.scheduler?.budgetGrantsRequired === true')
  && allyCeoLocalCycleText.includes("executionMode: localOnlySchedulerDrift ? 'local_only_scheduler_drift' : 'live_observed'")
  && allyCeoLocalCycleText.includes('productionReleaseAccepted: false')
  && allyCeoLocalCycleText.includes('vercelActionsAllowed: false')
  && allyCeoLocalCycleText.includes('hostedSchedulerActionsAllowed: false')
  && allyCeoLocalCycleText.includes('dynamicDelegation: false')
  && allyCeoLocalCycleText.includes('recursiveDelegation: false')
  && allyCeoLocalCycleText.includes("MEMORY_RECOVERY_BLOCKERS = Object.freeze(new Set(['memory_pressure_critical', 'codex_working_set_high']))")
  && allyCeoLocalCycleText.includes('MEMORY_CRITICAL_SETTLEMENT_DELAY_MS = 12_000')
  && allyCeoLocalCycleText.includes('waitForMemorySettlement(memoryRecovery.stabilizationDelayMs)')
  && allyCeoLocalCycleText.includes('ally_ceo_local_cycle_memory_recovery_invalid')
  && allyCeoLocalCycleText.includes('function validateReadOnlyReplayHost(audit, memoryRecovery)')
  && allyCeoLocalCycleText.includes('host: validateReadOnlyReplayHost(audit, memoryRecovery)')
  && allyCeoLocalCycleText.includes('admissionEligible: finalHost.eligible')
  && allyCeoLocalCycleText.includes('admissionBlockers: [...blockers]')
  && allyCeoLocalCycleText.includes('if (scheduled && execute && recoverMemory && canAttemptMemoryRecovery(audit))')
  && allyCeoLocalCycleText.indexOf('if (scheduled && execute && recoverMemory && canAttemptMemoryRecovery(audit))') < allyCeoLocalCycleText.indexOf('if (scheduled && (audit.hostAdmission?.eligible !== true || !hostIsIdle(audit)))')
  && allyCeoLocalCycleText.includes('if (execute && !memoryRecovery.attempted && recoverMemory && canAttemptMemoryRecovery(audit))')
  && allyCeoLocalCycleText.indexOf('host: validateReadOnlyReplayHost(audit, memoryRecovery)') < allyCeoLocalCycleText.indexOf('if (execute && !memoryRecovery.attempted && recoverMemory && canAttemptMemoryRecovery(audit))')
  && allyCeoLocalCycleText.includes("kind === 'trim'")
  && allyCeoLocalCycleText.includes("'-Apply', '-Json'")
  && allyCeoLocalCycleText.includes('processTerminations: 0')
  && allyCeoLocalCycleText.includes('balancedSpecialistDelimiters(section)')
  && allyCeoLocalCycleText.includes('function specialistSectionHasSourceReference(text)')
  && allyCeoLocalCycleText.includes('specialistSectionHasSourceReference(section)')
  && allyCeoLocalCycleText.includes('hq/portfolio.json,hq/readiness/managed-pilot-readiness.json')
  && allyCeoLocalCycleText.includes('`[ALLY_CEO_OUTCOME:${period}:${outcomeId}]`')
  && allyCeoLocalCycleText.includes('`[ALLY_CEO_REPAIR:${period}:${outcomeId}:${shortHash}]`')
  && allyCeoLocalCycleText.includes("status: rotation.allDone ? 'period_complete' : 'period_incomplete'")
  && allyCeoLocalCycleText.includes('const rejectedOutcomes = []')
  && allyCeoLocalCycleText.includes('reason: inspection.reason || `queue_${existing.status}`')
  && allyCeoLocalCycleText.includes('ally_ceo_local_cycle_rotation_sequence_invalid')
  && allyCeoLocalCycleText.includes('ally_ceo_local_cycle_rotation_completion_invalid')
  && allyCeoLocalCycleText.includes('ally_ceo_local_cycle_skipped_outcome_invalid')
  && allyCeoLocalCycleText.includes('skippedOutcomes')
  && allyCeoLocalCycleText.includes("!/\\sp=100\\s/.test(line)")
  && allyCeoLocalCycleText.includes("!/\\sproject=SuperMega\\s/.test(line)")
  && allyCeoLocalCycleText.includes('`[ALLY_CEO_CYCLE:${shortHash}]`')
  && allyCeoLocalCycleText.includes("ally_ceo_local_cycle_queue_preflight_rejected")
  && allyCeoLocalCycleText.includes("'queue', 'run-next', '--queue-id', queueId")
  && allyCeoLocalCycleText.includes("'--keep-alive', spec.resourceEnvelope.modelKeepAlive")
  && allyCeoLocalCycleText.includes("controls: { externalWrites: false, connectors: 0, maxLocalRuns: 1, scaleToZero: true }")
  && allyCeoLocalCycleText.includes("PYTHONPATH: resolve(localCompanyRoot, 'src')")
  && allyCeoLocalCycleText.includes("defaultLocalCompanyPython = resolve('C:\\\\Users\\\\thesw\\\\AppData\\\\Local\\\\Python\\\\pythoncore-3.14-64\\\\python.exe')")
  && allyCeoLocalCycleText.includes('file = localCompanyPython')
  && allyCeoLocalCycleText.includes("else if (arg === '--record-result') result.recordResult = true")
  && allyCeoLocalCycleText.includes("else if (arg === '--scheduled') result.scheduled = true")
  && allyCeoLocalCycleText.includes('const SCHEDULED_MEMORY_BLOCK_PERCENT = 85')
  && allyCeoLocalCycleText.includes('function scheduledMemoryPressureReceipt()')
  && allyCeoLocalCycleText.includes('if (scheduled && !recoverMemory && !dependencies.runCommand)')
  && allyCeoLocalCycleText.indexOf('if (scheduled && !recoverMemory && !dependencies.runCommand)') < allyCeoLocalCycleText.indexOf("let audit = parseJson(await runCommand({ kind: 'audit'")
  && allyCeoLocalCycleText.includes("status: 'deferred'")
  && allyCeoLocalCycleText.includes("nextAction: 'wait_for_next_scheduled_cycle'")
  && allyCeoLocalCycleText.includes('ally_ceo_local_cycle_scheduled_contract_invalid')
  && allyCeoLocalCycleText.includes("resolve(defaultLocalCompanyHome, 'ally-ceo-cycle-last.json')")
  && allyCeoLocalCycleText.includes("await open(temporary, 'wx', 0o600)")
  && allyCeoLocalCycleText.includes('await handle.sync()')
  && allyCeoLocalCycleText.includes('await rename(temporary, absolute)')
  && allyCeoLocalCycleText.includes("within(resolve(localCompanyHome, 'outputs'), absolute)")
  && allyCeoLocalCycleText.includes('validateFinalAudit(finalAudit)')
  && allyCeoLocalCycleText.includes('validateAcceptedReport(await inspectReport(result.reportPath), spec.roles)')
  && allyCeoLocalCycleText.includes('ally_ceo_local_cycle_report_semantics_rejected')
  && allyCeoLocalCycleText.includes('ally_ceo_local_cycle_report_citations_rejected')
  && allyCeoLocalCycleText.includes('ally_ceo_local_cycle_specialist_section_rejected')
  && allyCeoLocalCycleText.includes('Proposed next action\\s*:')
  && allyCeoLocalCycleText.includes('plain text on one line with no Markdown markers and no filenames')
  && allyCeoLocalCycleText.includes('Not verified or performed: Proposed next action: review [one bounded local gap]. Assumption:')
  && allyCeoLocalCycleText.includes('may replace review only with inspect, compare, or draft')
  && allyCeoLocalCycleText.includes('Do not end a clause with a conjunction, helper verb, or unfinished phrase')
  && allyCeoLocalCycleText.includes("'--num-predict', String(spec.resourceEnvelope.modelOutputTokens)")
  && allyCeoLocalCycleText.includes('ally_ceo_local_cycle_model_count_invalid')
  && allyCeoLocalCycleText.includes("event[0] === 'model_metrics'")
  && allyCeoLocalCycleText.includes("status: inspected.reason ? 'existing_rejected' : 'existing'")
  && allyCeoLocalCycleText.includes("args: ['show', existing.jobId]")
  && packageText.includes('"company:ally:self-test": "node --test tools/run_ally_ceo_local_cycle.test.mjs"')
  && packageText.includes('"company:ally:preflight": "node tools/run_ally_ceo_local_cycle.mjs"')
  && packageText.includes('"company:ally:run": "node tools/run_ally_ceo_local_cycle.mjs --execute --refresh-knowledge"')
  && packageText.includes('"company:ally:repair": "node tools/run_ally_ceo_local_cycle.mjs --execute --refresh-knowledge --repair-rejected"')
  && workboard.includes('| OPS-064 | CEO + Local Agent Operations Codex | done-local |')
  && workboard.includes('| OPS-065 | CEO + Local Agent Quality Codex | done-local |')
  && workboard.includes('| OPS-067 | CEO + Local Agent Automation Codex | done-local |')
  && workboard.includes('| OPS-068 | CEO + Portfolio Rotation Codex | done-local |')
  && workboard.includes('| OPS-069 | CEO + Specialist Output Quality Codex | done-local |')
  && workboard.includes('| OPS-070 | CEO + Legacy Quality Recovery Codex | done-local |')
  && workboard.includes('| OPS-071 | CEO + Engineering Quality Recovery Codex | done-local |')
  && workboard.includes('| OPS-072 | CEO + Product Portfolio Quality Recovery Codex | done-local |')
  && workboard.includes('| OPS-073 | CEO + Growth Pipeline Quality Recovery Codex | done-local |')
  && workboard.includes('| OPS-074 | CEO + Finance/Risk Period Close Codex | done-local |')
  && workboard.includes('| OPS-107 | CEO + No-Waste Company Progression Codex | done-local |')
  && workboard.includes('| OPS-108 | CEO + Pressure-Safe Company Replay Codex | done-local |')
  && workboard.includes('| OPS-109 | Plant + ERP Cost Review Codex | done-local |')
  && workboard.includes('| OPS-110 | Product Operations + Private Client Intake Codex | done-local |')
  && workboard.includes('Real Growth job `8a5193212cc5` and Finance/Risk job `8482aaf939d9`')
  && workboard.includes('job `b7fe6524a638`')
  && workboard.includes('two specialist model calls, and zero synthesis model calls')
  && workboard.includes('Exact replay returned the same report with zero model calls and zero queue writes')
  && !packageText.includes('"company:ally:self-test": "powershell -NoProfile -ExecutionPolicy Bypass -File tools/invoke_supermega_company_cycle.ps1')
  && !/\b(?:fetch|XMLHttpRequest|WebSocket|https?:\/\/|vercel|supabase|stripe|resend)\b/i.test(allyCeoLocalCycleText))

requireContract('agent job cycles are canonical, bounded, and scale to zero',
  workforce.runtime_policy.max_batch_jobs === 1
  && workboard.includes('| OPS-122 | CEO + Agent Runtime Parity Codex | done-local |')
  && workboard.includes('one active assignment, one specialist per company cycle, and one job per automated or direct batch')
  && workboard.includes('The 12 dormant roles consume zero idle compute')
  && workforce.runtime_policy.scale_to_zero === true
  && agentJobRunnerText.includes('AGENT_RUNNER_CYCLE_CONTRACT = "supermega.agent-runner-cycle-budget.v1"')
  && agentJobRunnerText.includes('MAX_PROCESSED_PER_CYCLE = 1')
  && agentJobRunnerText.includes('MAX_JOB_TYPE_ARGUMENTS = 24')
  && agentJobRunnerText.includes('def build_job_cycle_plan(')
  && agentJobRunnerText.includes('raise RuntimeError("job_type_not_canonical")')
  && agentJobRunnerText.includes('raise RuntimeError("workspace_login_requires_explicit_job_types")')
  && agentJobRunnerText.includes('raise RuntimeError("workspace_login_job_limit_exceeded")')
  && agentJobRunnerText.includes('"limit": cycle_plan["process_limit"]')
  && !/\b(?:subprocess|Popen|Start-Process|multiprocessing|ThreadPoolExecutor)\b/.test(agentJobRunnerText))

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
  && hqLiveStateVerifier.includes("const APP_LIVE_CONTRACT = 'supermega_app_live'")
  && hqLiveStateVerifier.includes('const LIVE_PROBE_TIMEOUT_MS = 15_000')
  && hqLiveStateVerifier.includes('const LIVE_PROBE_MAX_ATTEMPTS = 2')
  && hqLiveStateVerifier.includes("reason === 'timeout' || reason === 'network_error' || /^http_5")
  && hqLiveStateVerifier.includes('live_${label}_fetch_failed:${reason}:attempts=${attempt}')
  && hqLiveStateVerifier.includes('const MAX_HQ_NOW_BYTES = 128 * 1_024')
  && hqLiveStateVerifier.includes("resolve(root, 'tools', 'verify_app_release_live.mjs')")
  && hqLiveStateVerifier.includes('live_app_product_contract_failed:')
  && hqLiveStateVerifier.includes('const LIVE_PRODUCT_DRIFT_REASON =')
  && hqLiveStateVerifier.includes("status: 'drifted'")
  && hqLiveStateVerifier.includes('verifier_receipt_contract_invalid')
  && hqLiveStateVerifier.includes("fetchLiveJson('cloud_autonomy', `${APP_ORIGIN}/api/cloud-autonomy/status`)")
  && hqLiveStateVerifier.includes("redirect: 'error'")
  && hqLiveStateVerifier.includes("requireCheck('hq_operating_mode_invalid'")
  && hqLiveStateVerifier.includes("requireCheck('hq_security_readiness_invalid'")
  && hqLiveStateVerifier.includes("requireCheck('snapshot_stale'")
  && hqLiveStateVerifier.includes("requireCheck('capacity_not_scale_to_zero'")
  && hqLiveStateVerifier.includes("requireCheck('registered_specialists_consume_compute'")
  && hqLiveStateVerifier.includes("requireCheck('scheduler_batch_limit_exceeded', scheduler?.max_jobs_per_run === 1)")
  && !/\b(?:writeFile|appendFile|unlink|rm|POST|PUT|PATCH|DELETE)\b/.test(hqLiveStateVerifier)
  && packageText.includes('"hq:verify:live"')
  && packageText.includes('"hq:verify:live:self-test"')
  && workboard.includes('| OPS-038 | CEO + Release Operations Codex | done-local |')
  && workboard.includes('Checkpoint `bc19dac2` adds `supermega.hq-live-state.v1`')
  && workboard.includes('A one-off non-terminating working-set trim released 2,084.8 MB'))

requireContract('hosted one-job release drift is resolved',
  workboard.includes('| OPS-123 | CEO + Hosted Agent Release Integrity Codex | done-local |')
  && workboard.includes('production remains `isolated_demo`, scheduler-disabled, and scale-to-zero, but still reports the superseded two-job ceiling')
  && workboard.includes('24 conflicts across five bounded batches')
  && workboard.includes('zero merge, push, deployment, or provider authority')
  && workboard.includes('| CEO-012 | CEO / Codex integrator | done-live |')
  && now.includes('scheduler ceiling is one job, and exact live verification passes.'))

requireContract('identity data integration authority follows the owning module',
  workboard.includes('| OPS-124 | CEO + Identity/Data Integration Contract Codex | done-local |')
  && workboard.includes('binds the owning `client-onboarding.ts` module')
  && workboard.includes('seven-file, ten-group batch')
  && workboard.includes('main `7c76b810` lacks 24 candidate tokens')
  && workboard.includes('candidate `a1eb2b58` lacks 38 upstream managed-account')
  && workboard.includes('verified immutable 9,667-byte comparison binds both exact commits')
  && workboard.includes('packet digest `sha256:de8d161ac5f527a2227e631e236a15e1c27718db4825cf852ba518a1b308f9af`'))

requireContract('app shell integration keeps actions reachable and consequences explicit',
  workboard.includes('| OPS-125 | CEO + App Shell Integration Contract Codex | done-local |')
  && workboard.includes('exact rule-bound desktop and mobile invariants')
  && workboard.includes('main `7c76b810` passing every upstream requirement while lacking 22 candidate tokens')
  && workboard.includes('candidate `96177d24` passes every candidate requirement while lacking 23 upstream')
  && workboard.includes('move sizing or padding into a decoy rule and now fail')
  && workboard.includes('verified immutable 8,718-byte comparison binds both exact commits')
  && workboard.includes('packet digest `sha256:e48b213fd823588a2df1664da2b48b1db0337e475822a235c16f2ec39a2792b2`'))

requireContract('Ecommerce integration keeps quote cleanup and governed order operations together',
  workboard.includes('| OPS-126 | CEO + Ecommerce Integration Contract Codex | done-local |')
  && workboard.includes('binds the live quote clock to one exact `useEffect` lifecycle')
  && workboard.includes('Removing the cleanup or scattering matching interval, cleanup, and dependency strings')
  && workboard.includes('main `7c76b810` passing every upstream requirement while lacking 19 candidate tokens')
  && workboard.includes('candidate `771a6c3d` passes every candidate requirement while lacking 12 upstream')
  && workboard.includes('verified immutable 6,654-byte comparison binds both exact commits')
  && workboard.includes('packet digest `sha256:c0d50b17783962e1f66ae6c8b4991631c19fbcf5ed410e4dd4ccd62aa96d67bb`'))

requireContract('final release integration keeps activation security and product operations together',
  workboard.includes('| OPS-127 | CEO + Release/Security/HQ Integration Contract Codex | done-local |')
  && workboard.includes('updates the production context gate to the real `Keep approved context` language')
  && workboard.includes('stable `supermega.hq.portfolio.v3` schema invariant')
  && workboard.includes('main `7c76b810` passing every upstream requirement while lacking 25 candidate')
  && workboard.includes('candidate `98b555d0` passes every candidate requirement while lacking 21 upstream')
  && workboard.includes('verified immutable 9,117-byte comparison binds both exact commits')
  && workboard.includes('packet digest `sha256:090061f2c921406be4b9c7a2f085c53d99939d1eefa1ac976718f5c5608709ee`'))

requireContract('current CEO platform evidence is recorded without expanding authority',
  workboard.includes('| OPS-039 | CEO + Agent Operations / Evidence Quality Codex | done-local |')
  && workboard.includes('Checkpoint `e8a3adb` adds `supermega.platform-status.v1`')
  && workboard.includes('All 289 Kernel tests, 69 connectors across 993 adversarial calls, 15 crews across 214 checks, plus the complete app gate with 69 release and 70 security checks pass')
  && now.includes('CEO status is output-free across weekly briefs')
  && workboard.includes('| OPS-130 | CEO + Local-Only Continuity Security Codex | done-local |')
  && workboard.includes('post-run non-terminating trim released 2,003.1 MB')
  && workboard.includes('eligible one-run admission at 79.9% RAM'))

requireContract('rejected CEO outcomes are quarantined without repair loops or hidden completion',
  workboard.includes('| OPS-079 | CEO + Agent Efficiency Codex | done-local |')
  && workboard.includes('Checkpoint `6e567181` separates accepted outcomes from terminal rejected attempts')
  && workboard.includes('closes the UTC day as `period_incomplete`')
  && workboard.includes('produced zero model calls, queue writes, connectors, or loaded models')
  && now.includes('Rejected CEO outcomes remain quarantined without repair loops or hidden completion')
  && workboard.includes('| OPS-090 | CEO + Release Operations / Truthful Automation Codex | done-local |')
  && workboard.includes('Checkpoint `cd53a31` preserves only recognized redacted live-contract categories')
  && workboard.includes('stopped before knowledge refresh, queue write, or model work'))

requireContract('current company-operations evidence is recorded without adding runtime capacity',
  workboard.includes('| OPS-040 | CEO + Agent Operations / Evidence Quality Codex | done-local |')
  && workboard.includes('Checkpoint `909807d` adds `supermega.company-operations-status.v1`')
  && workboard.includes('All 291 Kernel tests, 69 connectors across 993 adversarial calls, 15 crews across 214 checks')
  && workboard.includes('| OPS-044 | CEO + Agent Operations / Delivery Evidence Codex | done-local |')
  && workboard.includes('Checkpoint `8d97d4d` reconciles each in-window completion')
  && workboard.includes('| OPS-045 | Owner Console + Agent Operations Codex | done-local |')
  && workboard.includes('Checkpoint `2b24bbf` adds one receipt-only summary')
  && workboard.includes('| OPS-046 | Owner Console + Agent Operations / Delivery Truth Codex | done-local |')
  && workboard.includes('Checkpoint `ece46ce` reconciles receipt status only for the protected console')
  && now.includes('Company Week separates recorded from delivered and fails incomplete delivery to attention'))

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
  && now.includes('CEO brief startup is 14 files/324,497 bytes')
  && now.includes('unchanged evidence uses zero model work'))

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
    maxConcurrentCompanyCycles: portfolio.agentOperatingModel.maxConcurrentCompanyCycles,
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
