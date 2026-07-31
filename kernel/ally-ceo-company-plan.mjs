import { createHash } from 'node:crypto'

import { buildAgentCompanyManifestPreflight } from './agent-company-operator.mjs'
import { planCompanyCycle } from './agent-company.mjs'
import { validateManagedPilotReadiness } from './managed-pilot-readiness.mjs'
import { selectCeoOutcome } from './supermega-hq-authority.mjs'

export const ALLY_CEO_COMPANY_PLAN_CONTRACT = 'supermega.ally-ceo-company-plan.v1'
export const ALLY_CEO_CYCLE_EXPERIMENT_CONTRACT = 'supermega.ally-ceo-cycle-experiment.v1'
export const ALLY_CEO_PRODUCT_FOCUS_CONTRACT = 'supermega.ally-ceo-product-focus.v3'
export const ALLY_CEO_RESOURCE_ENVELOPE_CONTRACT = 'supermega.ally-ceo-resource-envelope.v1'

const MAX_SOURCE_BYTES = 256 * 1024
const MAX_WORKBOARD_BYTES = 512 * 1024
const MAX_SECTION_BYTES = 64 * 1024
const REQUIRED_PRODUCTS = ['shop', 'plant', 'website', 'ecommerce']
const SOCIAL_SIGNAL_RE = /(?:https?:\/\/)?(?:[^\s/]+\.)?(?:instagram\.com|linkedin\.com|lnkd\.in)(?:[/:?\s]|$)/i
const SENSITIVE_VALUE_RE = /(?:-----BEGIN [A-Z ]+PRIVATE KEY-----|\b(?:sk-proj|ghp|gho|glpat|xoxb|xoxp|xoxa|xoxr)-[A-Za-z0-9_-]{16,})/i

const OUTCOME_AGENTS = Object.freeze({
  'daily-company-control': Object.freeze(['operations-analyst']),
  'engineering-release-control': Object.freeze(['proof-builder']),
  'product-portfolio-control': Object.freeze(['delivery-planner']),
  'growth-pipeline-control': Object.freeze(['sales-qualifier']),
  'finance-risk-control': Object.freeze(['cash-reconciler']),
})

const PRODUCT_ACCEPTANCE_DIMENSIONS = Object.freeze([
  'user_job',
  'state_transition',
  'data_contract',
  'failure_recovery',
  'mobile_acceptance',
  'import_reconciliation',
  'security_boundary',
  'automated_test',
])
const PRODUCT_AUTOMATION_STATUSES = Object.freeze(new Set(['ready-local', 'owner-gated', 'external-blocked']))
const PRODUCT_WORK_AUTHORITY_CONTRACT = 'supermega.product-work-authority.v2'
const PRODUCT_AUTOMATION_KEYS = Object.freeze(['contract', 'priority', 'productId', 'reason', 'status', 'workOrder', 'workOrderId'])
const COMPLETED_AUTOMATION_KEYS = Object.freeze(['checkpoint', 'productId', 'workOrderId'])
const WORK_ORDER_ID_RE = /^[a-z0-9][a-z0-9-]{2,79}$/
const PRODUCT_NAMES = Object.freeze({ shop: 'Shop', plant: 'Plant', website: 'Website', ecommerce: 'Ecommerce' })

const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)

function fail(reason) {
  throw new Error(reason)
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex')
}

function boundedSource(value, label, maximumBytes = MAX_SOURCE_BYTES) {
  const text = typeof value === 'string' ? value.trim() : ''
  const bytes = Buffer.byteLength(text, 'utf8')
  if (!text || bytes > maximumBytes || /\u0000/.test(text)) fail(`ally_ceo_company_plan_invalid_${label}`)
  return text
}

function markdownSection(source, heading) {
  const marker = `## ${heading}`
  const start = source.indexOf(marker)
  if (start < 0 || (start > 0 && source[start - 1] !== '\n')) fail('ally_ceo_company_plan_hq_section_missing')
  const contentStart = start + marker.length
  const next = source.indexOf('\n## ', contentStart)
  const body = source.slice(contentStart, next < 0 ? source.length : next).trim()
  if (!body || Buffer.byteLength(body, 'utf8') > MAX_SECTION_BYTES) fail('ally_ceo_company_plan_hq_section_empty')
  return { heading, body }
}

function portfolioView(value) {
  if (!isRecord(value)
    || value.schemaVersion !== 'supermega.hq.portfolio.v3'
    || typeof value.northStar !== 'string'
    || !Array.isArray(value.products)
    || !isRecord(value.agentOperatingModel)) fail('ally_ceo_company_plan_portfolio_invalid')

  if (!Array.isArray(value.completedLocalAutomations)) fail('ally_ceo_company_plan_completed_automation_invalid')
  const completedLocalAutomations = value.completedLocalAutomations.map((entry) => {
    const productId = String(entry?.productId || '')
    const workOrderId = String(entry?.workOrderId || '')
    const checkpoint = String(entry?.checkpoint || '')
    if (!isRecord(entry)
      || Object.keys(entry).sort().join(',') !== COMPLETED_AUTOMATION_KEYS.join(',')
      || !PRODUCT_NAMES[productId]
      || !WORK_ORDER_ID_RE.test(workOrderId)
      || !/^(?:CEO|ENG|OPS|QA|UX)-\d{3}$/.test(checkpoint)) {
      fail('ally_ceo_company_plan_completed_automation_invalid')
    }
    return { productId, workOrderId, checkpoint }
  })
  const completedAutomationKeys = new Set(completedLocalAutomations.map((entry) => `${entry.productId}:${entry.workOrderId}`))
  if (completedAutomationKeys.size !== completedLocalAutomations.length) fail('ally_ceo_company_plan_completed_automation_duplicate')

  const products = value.products.map((product) => {
    const productId = String(product?.id || '')
    const localAutomation = product?.localAutomation
    const automationKeys = isRecord(localAutomation) ? Object.keys(localAutomation).sort() : []
    const priority = localAutomation?.priority
    const automationStatus = String(localAutomation?.status || '')
    const workOrder = String(localAutomation?.workOrder || '').trim()
    const workOrderId = String(localAutomation?.workOrderId || '')
    const reason = String(localAutomation?.reason || '').trim()
    if (automationKeys.join(',') !== PRODUCT_AUTOMATION_KEYS.join(',')
      || !Number.isInteger(priority)
      || priority < 1
      || priority > 100
      || !PRODUCT_AUTOMATION_STATUSES.has(automationStatus)
      || !workOrder
      || workOrder.length > 1_200
      || !WORK_ORDER_ID_RE.test(workOrderId)
      || !reason
      || reason.length > 600
      || /\u0000/.test(`${workOrder}${reason}`)) {
      fail('ally_ceo_company_plan_product_automation_invalid')
    }
    if (localAutomation.contract !== PRODUCT_WORK_AUTHORITY_CONTRACT
      || localAutomation.productId !== productId
      || !PRODUCT_NAMES[productId]
      || !workOrderId.startsWith(`${productId}-`)
      || !workOrder.startsWith(`${PRODUCT_NAMES[productId]}: `)) {
      fail('ally_ceo_company_plan_product_routing_invalid')
    }
    if (completedAutomationKeys.has(`${productId}:${workOrderId}`)) fail('ally_ceo_company_plan_product_work_already_completed')
    return {
      id: productId,
      status: String(product?.status || ''),
      nextGate: String(product?.nextGate || ''),
      localAutomation: {
        contract: PRODUCT_WORK_AUTHORITY_CONTRACT,
        productId,
        priority,
        status: automationStatus,
        workOrder,
        workOrderId,
        reason,
      },
    }
  })
  if (products.map((product) => product.id).join(',') !== REQUIRED_PRODUCTS.join(',')
    || products.some((product) => !product.status || !product.nextGate)) {
    fail('ally_ceo_company_plan_products_invalid')
  }

  const model = value.agentOperatingModel
  if (model.mode !== 'bounded-demand-driven'
    || model.registeredRoleLimit !== 12
    || model.activeAssignmentLimit !== 1
    || model.maxAgentsPerCycle !== 1
    || model.maxConcurrentCompanyCycles !== 1
    || model.scaleToZero !== true
    || model.idleCapabilitiesConsumeCompute !== false
    || model.dynamicDelegation !== false
    || model.recursiveDelegation !== false
    || model.consequentialAuthority !== 'founder') {
    fail('ally_ceo_company_plan_capacity_invalid')
  }

  return {
    northStar: value.northStar.trim(),
    products,
    completedLocalAutomations,
    limits: {
      registeredRoles: 12,
      activeAssignments: 1,
      agentsPerCycle: 1,
      concurrentKernelCycles: 1,
      concurrentAllyRuns: 1,
      scaleToZero: true,
    },
  }
}

function canonicalInstant(value) {
  const instant = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(instant.getTime())) fail('ally_ceo_company_plan_clock_invalid')
  return instant.toISOString()
}

function productFocusFor(portfolio, outcomeId) {
  if (outcomeId !== 'product-portfolio-control') return null
  const candidates = portfolio.products
    .filter((product) => product.localAutomation.status === 'ready-local')
    .sort((left, right) => right.localAutomation.priority - left.localAutomation.priority
      || REQUIRED_PRODUCTS.indexOf(left.id) - REQUIRED_PRODUCTS.indexOf(right.id))
  const product = candidates[0]
  if (!product) return null
  return {
    contract: ALLY_CEO_PRODUCT_FOCUS_CONTRACT,
    selection: 'portfolio_priority_ready',
    productId: product.id,
    status: product.status,
    nextGate: product.nextGate,
    localPriority: product.localAutomation.priority,
    workOrderId: product.localAutomation.workOrderId,
    workOrder: product.localAutomation.workOrder,
    selectionReason: product.localAutomation.reason,
    readyCandidateCount: candidates.length,
    lifecycle: ['discover', 'define', 'build', 'release', 'learn'],
    acceptanceDimensions: [...PRODUCT_ACCEPTANCE_DIMENSIONS],
  }
}

function assertSafePlan(plan, expectedAgents) {
  if (!plan?.ok
    || plan.assignments?.map((assignment) => assignment.agentId).join(',') !== expectedAgents.join(',')
    || plan.controls?.execution !== 'sequential'
    || plan.controls?.dynamicDelegation !== false
    || plan.controls?.crossAgentContext !== false
    || plan.controls?.externalWrites !== false
    || plan.controls?.durableClaimRequired !== true
    || plan.controls?.maxConcurrentCycles !== 1
    || plan.controls?.maxActiveAssignments !== 1) {
    fail('ally_ceo_company_plan_unsafe')
  }
}

function buildCycleExperiment(selection, agentId) {
  const definition = {
    contract: ALLY_CEO_CYCLE_EXPERIMENT_CONTRACT,
    outcomeId: selection.selected.id,
    successMeasureDigest: selection.selected.successMeasureDigest,
    hypothesis: 'One specialist preserves owner-accepted outcome quality with fewer work units than the latest accepted two-specialist artifact.',
    treatment: {
      specialists: 1,
      agentId,
      maxRuns: 1,
    },
    baseline: 'latest accepted two-specialist artifact for the same outcome and success measure',
    primaryMetric: 'accepted_outcomes_per_1000_work_units',
    requiredQualityGates: [
      'sealed_report_integrity',
      'source_receipt_integrity',
      'success_measure_addressed',
      'owner_evaluation_recorded',
      'no_consequential_action',
    ],
    decisionRule: {
      promote: 'accepted, all quality gates pass, and treatment work units do not exceed baseline',
      revise: 'owner requests revision while integrity and safety gates pass',
      reject: 'any integrity or safety gate fails',
      inconclusive: 'no comparable accepted baseline exists',
    },
    controls: {
      planningOnly: true,
      automaticExecution: false,
      automaticPromotion: false,
      modelCalls: 0,
      connectorRequests: 0,
      externalWrites: false,
    },
  }
  return { ...definition, experimentDigest: `sha256:${digest(stableStringify(definition))}` }
}

function buildResourceEnvelope() {
  return {
    contract: ALLY_CEO_RESOURCE_ENVELOPE_CONTRACT,
    registeredRoleRecords: 12,
    selectedAgents: 1,
    maxActiveAssignments: 1,
    maxConcurrentCycles: 1,
    execution: 'sequential',
    providerPolicy: 'local_ollama_or_test_mock',
    maxModelCalls: 3,
    modelContextTokens: 4_096,
    modelOutputTokens: 768,
    modelKeepAlive: '0s',
    cycleTimeoutMs: 8 * 60_000,
    loadedModelsBefore: 0,
    loadedModelsAfter: 0,
    connectorRequests: 0,
    externalWrites: false,
    vercelActions: 0,
    hostedSchedulerActions: 0,
    dynamicDelegation: false,
    recursiveDelegation: false,
    scaleToZero: true,
  }
}

export async function buildAllyCeoCompanyPlan(input = {}) {
  const generatedAt = canonicalInstant(input.now ?? new Date())
  const hqNow = boundedSource(input.hqNow, 'hq_now')
  const workboard = boundedSource(input.workboard, 'workboard', MAX_WORKBOARD_BYTES)
  const portfolioText = boundedSource(input.portfolioText, 'portfolio')
  let portfolio
  try { portfolio = portfolioView(JSON.parse(portfolioText)) }
  catch (error) {
    if (error?.message?.startsWith('ally_ceo_company_plan_')) throw error
    fail('ally_ceo_company_plan_portfolio_invalid')
  }
  let managedReadiness = null
  if (input.managedReadinessText !== undefined) {
    try { managedReadiness = validateManagedPilotReadiness(JSON.parse(boundedSource(input.managedReadinessText, 'managed_readiness'))) }
    catch (error) {
      if (error?.message?.startsWith('managed_pilot_readiness_')) fail('ally_ceo_company_plan_managed_readiness_invalid')
      if (error?.message?.startsWith('ally_ceo_company_plan_')) throw error
      fail('ally_ceo_company_plan_managed_readiness_invalid')
    }
  }

  const selection = selectCeoOutcome({
    authority: input.authority,
    completedOutcomeIds: input.completedOutcomeIds,
    inFlightOutcomeIds: input.inFlightOutcomeIds,
  })
  if (!selection?.ok) fail(selection?.reason || 'ally_ceo_company_plan_authority_invalid')
  if (selection.declined || !selection.selected) {
    return {
      ok: true,
      contract: ALLY_CEO_COMPANY_PLAN_CONTRACT,
      generatedAt,
      declined: true,
      skipped: false,
      reason: selection.reason || 'no_authorized_ceo_outcome',
      authorityId: selection.authorityId,
      authorityDigest: selection.authorityDigest,
      manifest: null,
      preflight: null,
      plan: null,
    }
  }

  const agents = OUTCOME_AGENTS[selection.selected.id]
  if (!agents || agents.length !== 1) fail('ally_ceo_company_plan_outcome_unmapped')
  const productFocus = productFocusFor(portfolio, selection.selected.id)
  const currentState = [
    markdownSection(hqNow, 'North-star outcome'),
    markdownSection(hqNow, 'Portfolio correction'),
    markdownSection(hqNow, 'Verified baseline'),
    markdownSection(hqNow, 'Blockers'),
    markdownSection(hqNow, 'Next evidence'),
  ]
  const executionOrder = markdownSection(workboard, 'Execution order')
  const evidenceText = stableStringify({ currentState, executionOrder, portfolio, managedReadiness })
  if (SOCIAL_SIGNAL_RE.test(evidenceText)) fail('ally_ceo_company_plan_non_authoritative_source')
  if (SENSITIVE_VALUE_RE.test(evidenceText)) fail('ally_ceo_company_plan_sensitive_evidence')

  const sourceReceipts = [
    { path: 'hq/NOW.md', digest: `sha256:${digest(hqNow)}` },
    { path: 'hq/WORKBOARD.md#execution-order', digest: `sha256:${digest(stableStringify(executionOrder))}` },
    { path: 'hq/portfolio.json', digest: `sha256:${digest(portfolioText)}` },
    ...(managedReadiness ? [{ path: 'hq/readiness/managed-pilot-readiness.json', digest: `sha256:${digest(stableStringify(managedReadiness))}` }] : []),
  ]
  if (selection.selected.id === 'product-portfolio-control' && !productFocus) {
    return {
      ok: true,
      contract: ALLY_CEO_COMPANY_PLAN_CONTRACT,
      generatedAt,
      declined: false,
      skipped: true,
      reason: 'no_executable_product_focus',
      authorityId: selection.authorityId,
      authorityDigest: selection.authorityDigest,
      outcomeId: selection.selected.id,
      productFocus: null,
      successMeasureDigest: selection.selected.successMeasureDigest,
      gatedProductWork: portfolio.products.map((product) => ({
        productId: product.id,
        status: product.localAutomation.status,
        workOrderId: product.localAutomation.workOrderId,
      })),
      sourceReceipts,
      manifest: null,
      preflight: null,
      plan: null,
      controls: {
        planningModelCalls: 0,
        planningConnectorRequests: 0,
        planningExternalWrites: false,
        maxAgents: 0,
        maxConcurrentAllyRuns: 0,
        scaleToZero: true,
        executionRequiresSeparateApproval: true,
      },
    }
  }
  const compactDate = generatedAt.slice(0, 10).replaceAll('-', '')
  const cycleId = `ally-ceo-${compactDate}-${selection.selected.id}`
  const sharedControls = {
    planningOnly: true,
    externalWrites: false,
    dynamicDelegation: false,
    recursiveDelegation: false,
    humanApprovalForConsequentialActions: true,
    scaleToZero: true,
  }
  const portfolioEvidence = {
    northStar: portfolio.northStar,
    products: portfolio.products.map(({ id, status, nextGate }) => ({ id, status, nextGate })),
    limits: portfolio.limits,
    completedLocalAutomationSummary: {
      count: portfolio.completedLocalAutomations.length,
      digest: `sha256:${digest(stableStringify(portfolio.completedLocalAutomations))}`,
    },
    ...(managedReadiness ? {
      managedPilotReadiness: {
        contract: managedReadiness.contract,
        sourceDigest: managedReadiness.sourceDigest,
        status: managedReadiness.overall.status,
        localDatabaseProofReady: managedReadiness.overall.localDatabaseProofReady,
        hostedActivationReady: managedReadiness.overall.hostedActivationReady,
        blockingGateIds: managedReadiness.gates.filter(({ status }) => status === 'blocked').map(({ id }) => id),
        products: managedReadiness.products.map(({ productId, managedPilotStatus }) => ({ productId, managedPilotStatus })),
      },
    } : {}),
  }
  const resourceEnvelope = buildResourceEnvelope()
  const evidence = {
    [agents[0]]: {
      objective: selection.selected.objective,
      deliverable: selection.selected.deliverable,
      successMeasure: selection.selected.successMeasure,
      currentState: productFocus
        ? currentState.filter((section) => section.heading === 'North-star outcome' || section.heading === 'Verified baseline')
        : currentState,
      portfolio: portfolioEvidence,
      ...(productFocus ? { productFocus } : {}),
      sourceReceipts,
      resourceEnvelope,
      controls: sharedControls,
    },
  }
  const provisional = {
    clientId: 'supermega-internal',
    cycleId,
    agents: [...agents],
    roleBudget: 8,
    evidence,
  }
  const provisionalPlan = await planCompanyCycle(provisional)
  if (!provisionalPlan?.ok) fail(provisionalPlan?.reason || 'ally_ceo_company_plan_failed')
  const roleBudget = provisionalPlan.budget?.plannedRoles
  if (!Number.isInteger(roleBudget) || roleBudget < 1 || roleBudget > 8) fail('ally_ceo_company_plan_budget_invalid')

  const manifest = { ...provisional, roleBudget }
  const plan = await planCompanyCycle(manifest)
  assertSafePlan(plan, agents)
  const preflight = buildAgentCompanyManifestPreflight(manifest)
  if (preflight.expectedRunId !== plan.runId
    || preflight.roleBudget !== roleBudget
    || preflight.controls?.planOnlyDefault !== true
    || preflight.controls?.explicitQueue !== true
    || preflight.controls?.explicitDispatch !== true
    || preflight.controls?.externalWrites !== false) {
    fail('ally_ceo_company_plan_preflight_mismatch')
  }
  const experiment = buildCycleExperiment(selection, agents[0])

  return {
    ok: true,
    contract: ALLY_CEO_COMPANY_PLAN_CONTRACT,
    generatedAt,
    declined: false,
    skipped: false,
    authorityId: selection.authorityId,
    authorityDigest: selection.authorityDigest,
    outcomeId: selection.selected.id,
    productFocus,
    successMeasureDigest: selection.selected.successMeasureDigest,
    manifest,
    preflight,
    plan,
    experiment,
    resourceEnvelope,
    controls: {
      planningModelCalls: 0,
      planningConnectorRequests: 0,
      planningExternalWrites: false,
      maxAgents: 1,
      maxConcurrentAllyRuns: 1,
      scaleToZero: true,
      executionRequiresSeparateApproval: true,
    },
  }
}

export default {
  ALLY_CEO_COMPANY_PLAN_CONTRACT,
  ALLY_CEO_CYCLE_EXPERIMENT_CONTRACT,
  ALLY_CEO_PRODUCT_FOCUS_CONTRACT,
  ALLY_CEO_RESOURCE_ENVELOPE_CONTRACT,
  buildAllyCeoCompanyPlan,
}
