import { createHash } from 'node:crypto'

import { buildAgentCompanyManifestPreflight } from './agent-company-operator.mjs'
import { planCompanyCycle } from './agent-company.mjs'
import { selectCeoOutcome } from './supermega-hq-authority.mjs'

export const ALLY_CEO_COMPANY_PLAN_CONTRACT = 'supermega.ally-ceo-company-plan.v1'

const MAX_SOURCE_BYTES = 256 * 1024
const REQUIRED_PRODUCTS = ['shop', 'plant', 'website', 'ecommerce']
const SOCIAL_SIGNAL_RE = /(?:https?:\/\/)?(?:[^\s/]+\.)?(?:instagram\.com|linkedin\.com|lnkd\.in)(?:[/:?\s]|$)/i
const SENSITIVE_VALUE_RE = /(?:-----BEGIN [A-Z ]+PRIVATE KEY-----|\b(?:sk-proj|ghp|gho|glpat|xoxb|xoxp|xoxa|xoxr)-[A-Za-z0-9_-]{16,})/i

const OUTCOME_AGENTS = Object.freeze({
  'daily-company-control': Object.freeze(['operations-analyst', 'project-controller']),
  'engineering-release-control': Object.freeze(['proof-builder', 'quality-reviewer']),
  'product-portfolio-control': Object.freeze(['operations-analyst', 'quality-reviewer']),
  'growth-pipeline-control': Object.freeze(['sales-qualifier', 'project-controller']),
  'finance-risk-control': Object.freeze(['operations-analyst', 'cash-reconciler']),
})

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

function boundedSource(value, label) {
  const text = typeof value === 'string' ? value.trim() : ''
  const bytes = Buffer.byteLength(text, 'utf8')
  if (!text || bytes > MAX_SOURCE_BYTES || /\u0000/.test(text)) fail(`ally_ceo_company_plan_invalid_${label}`)
  return text
}

function markdownSection(source, heading) {
  const marker = `## ${heading}`
  const start = source.indexOf(marker)
  if (start < 0 || (start > 0 && source[start - 1] !== '\n')) fail('ally_ceo_company_plan_hq_section_missing')
  const contentStart = start + marker.length
  const next = source.indexOf('\n## ', contentStart)
  const body = source.slice(contentStart, next < 0 ? source.length : next).trim()
  if (!body) fail('ally_ceo_company_plan_hq_section_empty')
  return { heading, body }
}

function portfolioView(value) {
  if (!isRecord(value)
    || value.schemaVersion !== 'supermega.hq.portfolio.v3'
    || typeof value.northStar !== 'string'
    || !Array.isArray(value.products)
    || !isRecord(value.agentOperatingModel)) fail('ally_ceo_company_plan_portfolio_invalid')

  const products = value.products.map((product) => ({
    id: String(product?.id || ''),
    status: String(product?.status || ''),
    nextGate: String(product?.nextGate || ''),
  }))
  if (products.map((product) => product.id).join(',') !== REQUIRED_PRODUCTS.join(',')
    || products.some((product) => !product.status || !product.nextGate)) {
    fail('ally_ceo_company_plan_products_invalid')
  }

  const model = value.agentOperatingModel
  if (model.mode !== 'bounded-demand-driven'
    || model.registeredRoleLimit !== 12
    || model.activeAssignmentLimit !== 4
    || model.maxAgentsPerCycle !== 2
    || model.maxConcurrentCompanyCycles !== 2
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
    limits: {
      registeredRoles: 12,
      activeAssignments: 4,
      agentsPerCycle: 2,
      concurrentKernelCycles: 2,
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

function assertSafePlan(plan, expectedAgents) {
  if (!plan?.ok
    || plan.assignments?.map((assignment) => assignment.agentId).join(',') !== expectedAgents.join(',')
    || plan.controls?.execution !== 'sequential'
    || plan.controls?.dynamicDelegation !== false
    || plan.controls?.crossAgentContext !== false
    || plan.controls?.externalWrites !== false
    || plan.controls?.durableClaimRequired !== true
    || plan.controls?.maxConcurrentCycles !== 2
    || plan.controls?.maxActiveAssignments !== 4) {
    fail('ally_ceo_company_plan_unsafe')
  }
}

export async function buildAllyCeoCompanyPlan(input = {}) {
  const generatedAt = canonicalInstant(input.now ?? new Date())
  const hqNow = boundedSource(input.hqNow, 'hq_now')
  const workboard = boundedSource(input.workboard, 'workboard')
  const portfolioText = boundedSource(input.portfolioText, 'portfolio')
  let portfolio
  try { portfolio = portfolioView(JSON.parse(portfolioText)) }
  catch (error) {
    if (error?.message?.startsWith('ally_ceo_company_plan_')) throw error
    fail('ally_ceo_company_plan_portfolio_invalid')
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
      reason: selection.reason || 'no_authorized_ceo_outcome',
      authorityId: selection.authorityId,
      authorityDigest: selection.authorityDigest,
      manifest: null,
      preflight: null,
      plan: null,
    }
  }

  const agents = OUTCOME_AGENTS[selection.selected.id]
  if (!agents || agents.length !== 2) fail('ally_ceo_company_plan_outcome_unmapped')
  const currentState = [
    markdownSection(hqNow, 'North-star outcome'),
    markdownSection(hqNow, 'Portfolio correction'),
    markdownSection(hqNow, 'Verified baseline'),
    markdownSection(hqNow, 'Blockers'),
    markdownSection(hqNow, 'Next evidence'),
  ]
  const executionOrder = markdownSection(workboard, 'Execution order')
  const evidenceText = stableStringify({ currentState, executionOrder, portfolio })
  if (SOCIAL_SIGNAL_RE.test(evidenceText)) fail('ally_ceo_company_plan_non_authoritative_source')
  if (SENSITIVE_VALUE_RE.test(evidenceText)) fail('ally_ceo_company_plan_sensitive_evidence')

  const sourceReceipts = [
    { path: 'hq/NOW.md', digest: `sha256:${digest(hqNow)}` },
    { path: 'hq/WORKBOARD.md#execution-order', digest: `sha256:${digest(stableStringify(executionOrder))}` },
    { path: 'hq/portfolio.json', digest: `sha256:${digest(portfolioText)}` },
  ]
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
  const evidence = {
    [agents[0]]: {
      objective: selection.selected.objective,
      deliverable: selection.selected.deliverable,
      successMeasure: selection.selected.successMeasure,
      currentState,
      portfolio,
      sourceReceipts,
      controls: sharedControls,
    },
    [agents[1]]: {
      acceptedOutcome: selection.selected.deliverable,
      successMeasure: selection.selected.successMeasure,
      executionOrder,
      reviewRules: [
        'Use only the supplied source receipts and evidence.',
        'Name missing proof instead of inventing completion.',
        'Return one bounded next action and its acceptance check.',
        'Do not send, publish, deploy, pay, change access, or mutate a customer record.',
      ],
      sourceReceipts,
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

  return {
    ok: true,
    contract: ALLY_CEO_COMPANY_PLAN_CONTRACT,
    generatedAt,
    declined: false,
    authorityId: selection.authorityId,
    authorityDigest: selection.authorityDigest,
    outcomeId: selection.selected.id,
    successMeasureDigest: selection.selected.successMeasureDigest,
    manifest,
    preflight,
    plan,
    controls: {
      planningModelCalls: 0,
      planningConnectorRequests: 0,
      planningExternalWrites: false,
      maxAgents: 2,
      maxConcurrentAllyRuns: 1,
      scaleToZero: true,
      executionRequiresSeparateApproval: true,
    },
  }
}

export default { ALLY_CEO_COMPANY_PLAN_CONTRACT, buildAllyCeoCompanyPlan }
