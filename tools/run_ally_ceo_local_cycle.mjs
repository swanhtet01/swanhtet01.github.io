#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { lstat, open, readFile, rename, unlink } from 'node:fs/promises'
import { freemem, tmpdir, totalmem } from 'node:os'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import { ALLY_CEO_RESOURCE_ENVELOPE_CONTRACT, buildAllyCeoCompanyPlan } from '../kernel/ally-ceo-company-plan.mjs'

export const ALLY_CEO_LOCAL_CYCLE_CONTRACT = 'supermega.ally-ceo-local-cycle.v1'
export const ALLY_CEO_OWNER_BRIEF_CONTRACT = 'supermega.ally-ceo-owner-brief.v1'

const execFileAsync = promisify(execFile)
const root = resolve(import.meta.dirname, '..')
const defaultLocalCompanyRoot = resolve(root, '..', 'local-agent-company')
const defaultLocalCompanyHome = resolve(root, '..', 'supermega-local-company-state')
const defaultLocalCompanyPython = resolve('C:\\Users\\thesw\\AppData\\Local\\Python\\pythoncore-3.14-64\\python.exe')
const powershell = resolve(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
const MAX_COMMAND_BYTES = 512 * 1024
const MAX_REPORT_BYTES = 256 * 1024
const MAX_CYCLE_RECEIPT_BYTES = 64 * 1024
const MEMORY_SETTLEMENT_DELAY_MS = 3_000
const MEMORY_CRITICAL_SETTLEMENT_DELAY_MS = 12_000
const SCHEDULED_MEMORY_BLOCK_PERCENT = 85
const LOCAL_LLAMA_MODELS = Object.freeze(new Set(['llama3.2:1b', 'llama3.2:3b']))
const EXECUTION_SPEC_VERSION = '2026-07-29.26'
const LEGACY_EXECUTION_SPEC_VERSIONS = Object.freeze(['2026-07-29.25', '2026-07-29.24', '2026-07-29.23', '2026-07-29.22', '2026-07-29.21', '2026-07-29.20', '2026-07-29.19', '2026-07-29.18', '2026-07-29.17', '2026-07-29.16', '2026-07-29.15', '2026-07-29.14', '2026-07-29.13', '2026-07-29.12', '2026-07-29.11', '2026-07-29.10'])
const MANAGED_PILOT_DECISION_PREVIEW_COMMAND = 'npm run readiness:managed:decision'
const MEMORY_RECOVERY_BLOCKERS = Object.freeze(new Set(['memory_pressure_critical', 'codex_working_set_high']))
const CEO_LIVE_ADVISORIES = Object.freeze(new Set(['app_product_contract_drift', 'hq_release_commit_stale']))
const LOCAL_ONLY_HQ_LIVE_FAILURE = 'scheduler_batch_limit_exceeded'
const SAFE_HQ_LIVE_FAILURES = Object.freeze(new Set([
  'app_product_contract_drift',
  'app_release_contract_invalid',
  'public_release_contract_invalid',
  'paired_release_identity_mismatch',
  'hq_release_commit_stale',
  'app_canonical_domain_invalid',
  'hq_operating_mode_invalid',
  'hq_scheduler_status_invalid',
  'hq_scheduler_configuration_invalid',
  'hq_managed_persistence_readiness_invalid',
  'hq_security_readiness_invalid',
  'health_not_ready',
  'operating_mode_drift',
  'managed_persistence_readiness_drift',
  'security_readiness_drift',
  'scheduler_status_drift',
  'scheduler_configuration_drift',
  'scheduler_pc_dependency_forbidden',
  'scheduler_budget_grant_required',
  'scheduler_batch_limit_exceeded',
  'capacity_not_scale_to_zero',
  'idle_execution_target_nonzero',
  'registered_specialists_consume_compute',
  'external_action_policy_drift',
  'snapshot_from_future',
  'snapshot_stale',
]))
const PRODUCT_IDS = Object.freeze(['shop', 'plant', 'website', 'ecommerce'])
const PRODUCT_NAMES = Object.freeze({ shop: 'Shop', plant: 'Plant', website: 'Website', ecommerce: 'Ecommerce' })
const PRODUCT_FOCUS_UNSAFE_RE = /[\u0000-\u001f]|\[(?:ALLY_CEO_[A-Z_]+|EVIDENCE):|(?:instagram\.com|linkedin\.com|lnkd\.in)|-----BEGIN [A-Z ]+PRIVATE KEY-----|\b(?:sk-proj|ghp|gho|glpat|xoxb|xoxp|xoxa|xoxr)-[A-Za-z0-9_-]{16,}/i
const EXPECTED_RESOURCE_ENVELOPE = Object.freeze({
  contract: ALLY_CEO_RESOURCE_ENVELOPE_CONTRACT,
  registeredRoleRecords: 12,
  selectedAgents: 1,
  maxActiveAssignments: 1,
  maxConcurrentCycles: 1,
  execution: 'sequential',
  providerPolicy: 'local_ollama_or_test_mock',
  maxModelCalls: 3,
  modelContextTokens: 4_096,
  modelOutputTokens: 256,
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
})
const EXPECTED_ROLE_CAPABILITY_COUNT = 15

const AGENT_ROLE_MAP = Object.freeze({
  'operations-analyst': 'operations',
  'delivery-planner': 'product',
  'project-controller': 'chief-of-staff',
  'proof-builder': 'engineering',
  'quality-reviewer': 'quality',
  'sales-qualifier': 'sales',
  'cash-reconciler': 'finance',
})

const OUTCOME_BRIEFS = Object.freeze({
  'daily-company-control': 'daily SuperMega operating control',
  'engineering-release-control': 'engineering quality and release-readiness control',
  'product-portfolio-control': 'one product delivery work order',
  'growth-pipeline-control': 'growth-pipeline control',
  'finance-risk-control': 'finance and risk control',
})
const OUTCOME_TASK_DIRECTIVES = Object.freeze({
  'daily-company-control': 'Reconcile the current four-product readiness ledger and name every blocked proof.',
  'engineering-release-control': 'Compare current candidate and live release evidence, then define one bounded local fix that preserves every security gate.',
  'product-portfolio-control': 'Format only the authorized product work order and its complete acceptance evidence.',
  'growth-pipeline-control': 'Draft one truthful four-product lead-qualification and demo-readiness record without contacting or naming prospects.',
  'finance-risk-control': 'Reconcile one zero-spend operating budget and risk register with evidence gaps and owner approvals.',
})
const OUTCOME_SEQUENCE = Object.freeze([
  'daily-company-control',
  'engineering-release-control',
  'product-portfolio-control',
  'growth-pipeline-control',
  'finance-risk-control',
])
const LEGACY_OUTCOME_ROLES = Object.freeze({
  'daily-company-control': Object.freeze(['operations', 'chief-of-staff']),
  'engineering-release-control': Object.freeze(['engineering', 'quality']),
  'product-portfolio-control': Object.freeze(['operations', 'quality']),
  'growth-pipeline-control': Object.freeze(['sales', 'chief-of-staff']),
  'finance-risk-control': Object.freeze(['operations', 'finance']),
})
const LEGACY_REPAIRABLE_REASONS = Object.freeze(new Set([
  'ally_ceo_local_cycle_report_semantics_rejected',
  'ally_ceo_local_cycle_report_citations_rejected',
  'ally_ceo_local_cycle_specialist_section_rejected',
]))
const SPECIALIST_SECTION_CONTRACT = 'Each specialist section must be at most 90 words and contain exactly these advisory labels: Proposed next action, Assumption, and Missing proof. Specialists must not claim execution or verified facts; the evidence-grounded executive synthesis remains code-owned. The executive synthesis must be at most 120 words and end with: Owner review required.'
const SPECIALIST_OUTPUT_GRAMMAR = 'Write each specialist section as plain text on one line with no Markdown markers and no filenames. Return only this line with no introduction, heading, list, explanation, or closing. Preserve this literal skeleton and replace only the bracketed phrases: Not verified or performed: Proposed next action: review [one bounded local gap]. Assumption: [one unverified premise]. Missing proof: [one named proof item]. The Proposed next action may replace review only with inspect, compare, or draft and must name the bounded local gap. Missing proof must name a concrete unresolved proof and must never be none, no, complete, or not applicable. Do not include Owner review required inside a specialist section. End every clause as a complete sentence. Do not end a clause with a conjunction, helper verb, or unfinished phrase, and do not append canned scope warnings after a semicolon.'

function fail(reason) {
  throw new Error(reason)
}

async function writeCycleReceipt(result, output = resolve(defaultLocalCompanyHome, 'ally-ceo-cycle-last.json')) {
  const absolute = resolve(output)
  const parent = dirname(absolute)
  const parentStat = await lstat(parent).catch(() => null)
  const existing = await lstat(absolute).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error))
  if (!parentStat?.isDirectory() || parentStat.isSymbolicLink()
    || existing && (!existing.isFile() || existing.isSymbolicLink() || existing.size > MAX_CYCLE_RECEIPT_BYTES)) {
    fail('ally_ceo_local_cycle_receipt_path_unsafe')
  }
  const bytes = Buffer.from(`${JSON.stringify(result)}\n`, 'utf8')
  if (bytes.length < 2 || bytes.length > MAX_CYCLE_RECEIPT_BYTES) fail('ally_ceo_local_cycle_receipt_size_invalid')
  const temporary = resolve(parent, `.ally-ceo-cycle-last.${randomUUID()}.tmp`)
  let handle = null
  try {
    handle = await open(temporary, 'wx', 0o600)
    await handle.writeFile(bytes)
    await handle.sync()
    await handle.close()
    handle = null
    await rename(temporary, absolute)
  } catch (error) {
    await handle?.close().catch(() => {})
    await unlink(temporary).catch(() => {})
    fail(`ally_ceo_local_cycle_receipt_write_failed:${String(error?.code || 'error').slice(0, 40)}`)
  }
  return { path: absolute, bytes: bytes.length, digest: `sha256:${sha256(bytes)}` }
}

function buildOwnerBrief({
  status,
  outcomeId = null,
  completedOutcomeIds = [],
  rejectedOutcomes = [],
  skippedOutcomes = [],
  capacityAdmission = null,
}) {
  const attention = []
  if (rejectedOutcomes.length > 0) {
    attention.push({
      code: 'quality_review_required',
      count: rejectedOutcomes.length,
      outcomeIds: rejectedOutcomes.map((item) => item.outcomeId),
    })
  }
  const gatedProduct = skippedOutcomes.find((item) => item.outcomeId === 'product-portfolio-control')
  if (gatedProduct) {
    attention.push({
      code: 'managed_pilot_authorization_required',
      count: gatedProduct.gatedProductWork.length,
      productIds: gatedProduct.gatedProductWork.map((item) => item.productId),
      previewCommand: MANAGED_PILOT_DECISION_PREVIEW_COMMAND,
    })
  }
  if (capacityAdmission?.companyAttentionStatus === 'attention_required') {
    attention.push({
      code: 'retained_company_quality_attention',
      count: capacityAdmission.companyAdvisories.length,
      advisories: [...capacityAdmission.companyAdvisories],
    })
  }

  let briefStatus = 'no_action'
  let headline = 'No owner decision is required for this local cycle.'
  let nextAction = 'leave_external_gates_closed'
  if (attention.some((item) => item.code === 'quality_review_required' || item.code === 'retained_company_quality_attention')) {
    briefStatus = 'quality_review_required'
    headline = 'Review retained quality evidence before retrying any failed company outcome.'
    nextAction = 'review_quality_failures_before_retry'
  } else if (gatedProduct) {
    briefStatus = 'decision_required'
    headline = 'Four internal outcomes are complete; choose at most one managed product pilot to authorize.'
    nextAction = 'authorize_one_managed_pilot_or_leave_all_external_gates_closed'
  } else if (status === 'ready' || status === 'executing') {
    briefStatus = 'local_action_ready'
    headline = `One bounded local ${outcomeId || 'company'} outcome is ready.`
    nextAction = 'run_one_local_company_outcome'
  } else if (status === 'accepted' || status === 'existing') {
    briefStatus = 'review_required'
    headline = `One bounded local ${outcomeId || 'company'} brief is ready for review.`
    nextAction = 'review_accepted_local_brief'
  }

  return {
    contract: ALLY_CEO_OWNER_BRIEF_CONTRACT,
    status: briefStatus,
    reviewBudgetMinutes: 10,
    headline,
    nextAction,
    completedOutcomeCount: completedOutcomeIds.length,
    attentionCount: attention.length,
    attention,
    controls: {
      codeOwned: true,
      externalActionPerformed: false,
      connectorRequests: 0,
    },
  }
}

function scheduledDeferredReceipt(audit, memoryRecovery) {
  const blockers = audit?.hostAdmission?.blockers
  if (audit?.contract !== 'supermega.ally-runtime-audit.v1'
    || audit.mode !== 'read_only'
    || audit.hostAdmission?.contract !== 'supermega.ally-host-admission.v1'
    || audit.hostAdmission.eligible !== false
    || !Array.isArray(blockers)
    || blockers.length < 1
    || blockers.length > 8
    || new Set(blockers).size !== blockers.length
    || blockers.some((blocker) => !/^[a-z0-9_]{1,80}$/.test(String(blocker)))) {
    fail('ally_ceo_local_cycle_scheduled_defer_invalid')
  }
  return {
    ok: true,
    contract: ALLY_CEO_LOCAL_CYCLE_CONTRACT,
    status: 'deferred',
    replayed: true,
    period: null,
    outcomeId: null,
    completedOutcomeIds: [],
    host: {
      generatedAt: String(audit.generatedAt || ''),
      memoryUsedPercent: Number(audit.memory?.usedPercent),
      maxConcurrentLocalRuns: 0,
      loadedModels: Number(audit.localModels?.loaded),
      admissionEligible: false,
      admissionBlockers: [...blockers],
      memoryRecovery,
    },
    liveHq: { performed: false, skipped: 'host_not_admitted' },
    sourceCount: null,
    knowledgeRefresh: { requested: false, performed: false, refreshedSources: 0, skipped: 'host_not_admitted' },
    modelCalls: 0,
    queueWrites: 0,
    ownerBrief: {
      contract: ALLY_CEO_OWNER_BRIEF_CONTRACT,
      status: 'no_action',
      reviewBudgetMinutes: 10,
      headline: 'Local CEO work was deferred until the Ally is safely admitted.',
      nextAction: 'wait_for_next_scheduled_cycle',
      completedOutcomeCount: 0,
      attentionCount: 1,
      attention: [{ code: 'host_admission_deferred', count: blockers.length, blockers: [...blockers] }],
      controls: { codeOwned: true, externalActionPerformed: false, connectorRequests: 0 },
    },
    controls: { externalWrites: false, connectors: 0, maxLocalRuns: 1, scaleToZero: true },
  }
}

function scheduledMemoryPressureReceipt() {
  const totalBytes = totalmem()
  const freeBytes = freemem()
  const usedPercent = totalBytes > 0
    ? Math.round(((totalBytes - freeBytes) / totalBytes) * 1000) / 10
    : 100
  if (usedPercent < SCHEDULED_MEMORY_BLOCK_PERCENT) return null
  const audit = {
    contract: 'supermega.ally-runtime-audit.v1',
    mode: 'read_only',
    generatedAt: new Date().toISOString(),
    memory: { usedPercent },
    localModels: { loaded: 0 },
    hostAdmission: {
      contract: 'supermega.ally-host-admission.v1',
      eligible: false,
      blockers: ['memory_pressure_critical'],
    },
  }
  return scheduledDeferredReceipt(audit, {
    attempted: false,
    initialMemoryUsedPercent: usedPercent,
    stabilizationDelayMs: 0,
    targetCount: 0,
    beforeWorkingSetMb: 0,
    afterWorkingSetMb: 0,
    releasedWorkingSetMb: 0,
    processTerminations: 0,
  })
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function parseJson(text, reason) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_COMMAND_BYTES) fail(reason)
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail(reason)
    return parsed
  } catch {
    fail(reason)
  }
}

function validatedResourceEnvelope(plan, agentId) {
  const envelope = plan?.resourceEnvelope
  const retained = plan?.manifest?.evidence?.[agentId]?.resourceEnvelope
  const expectedKeys = Object.keys(EXPECTED_RESOURCE_ENVELOPE).sort()
  const valid = [envelope, retained].every((candidate) => candidate
    && typeof candidate === 'object'
    && !Array.isArray(candidate)
    && Object.keys(candidate).sort().join(',') === expectedKeys.join(',')
    && expectedKeys.every((key) => candidate[key] === EXPECTED_RESOURCE_ENVELOPE[key]))
  if (!valid) fail('ally_ceo_local_cycle_resource_envelope_invalid')
  return { ...EXPECTED_RESOURCE_ENVELOPE }
}

function within(base, target) {
  const rel = relative(resolve(base), resolve(target))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function planSpec(plan) {
  const hash = String(plan?.preflight?.expectedPlanHash || '')
  const agents = plan?.manifest?.agents
  const outcomeId = String(plan?.outcomeId || '')
  const productFocus = plan?.productFocus
  const generatedAt = String(plan?.generatedAt || '')
  const period = generatedAt.slice(0, 10)
  if (!plan?.ok
    || plan.contract !== 'supermega.ally-ceo-company-plan.v1'
    || plan.declined !== false
    || !/^[a-f0-9]{64}$/.test(hash)
    || !Array.isArray(agents)
    || agents.length !== 1
    || new Set(agents).size !== 1
    || plan.manifest?.roleBudget !== plan.plan?.budget?.plannedRoles
    || plan.plan?.budget?.remainingRoles !== 0
    || plan.controls?.planningModelCalls !== 0
    || plan.controls?.planningConnectorRequests !== 0
    || plan.controls?.planningExternalWrites !== false
    || plan.controls?.maxAgents !== 1
    || plan.controls?.maxConcurrentAllyRuns !== 1
    || plan.controls?.scaleToZero !== true
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(generatedAt)
    || new Date(generatedAt).toISOString() !== generatedAt
    || plan.manifest?.cycleId !== `ally-ceo-${period.replaceAll('-', '')}-${outcomeId}`) {
    fail('ally_ceo_local_cycle_plan_invalid')
  }
  const roles = agents.map((agent) => AGENT_ROLE_MAP[agent])
  if (roles.some((role) => !role) || new Set(roles).size !== 1
    || !OUTCOME_BRIEFS[outcomeId] || !OUTCOME_TASK_DIRECTIVES[outcomeId]) {
    fail('ally_ceo_local_cycle_team_invalid')
  }
  const resourceEnvelope = validatedResourceEnvelope(plan, agents[0])
  const productFocusRequired = outcomeId === 'product-portfolio-control'
  const manifestProductFocus = plan.manifest?.evidence?.['delivery-planner']?.productFocus
  const productFocusValid = productFocusRequired
    && productFocus?.contract === 'supermega.ally-ceo-product-focus.v3'
    && productFocus?.selection === 'portfolio_priority_ready'
    && PRODUCT_IDS.includes(productFocus?.productId)
    && /^[a-z0-9-]{1,80}$/.test(productFocus?.status || '')
    && typeof productFocus?.nextGate === 'string'
    && productFocus.nextGate.length > 0
    && productFocus.nextGate.length <= 1_200
    && Number.isInteger(productFocus?.localPriority)
    && productFocus.localPriority >= 1
    && productFocus.localPriority <= 100
    && /^[a-z0-9][a-z0-9-]{2,79}$/.test(productFocus?.workOrderId || '')
    && productFocus.workOrderId.startsWith(`${productFocus.productId}-`)
    && typeof productFocus?.workOrder === 'string'
    && productFocus.workOrder.length > 0
    && productFocus.workOrder.length <= 1_200
    && productFocus.workOrder.startsWith(`${PRODUCT_NAMES[productFocus.productId]}: `)
    && typeof productFocus?.selectionReason === 'string'
    && productFocus.selectionReason.length > 0
    && productFocus.selectionReason.length <= 600
    && Number.isInteger(productFocus?.readyCandidateCount)
    && productFocus.readyCandidateCount >= 1
    && productFocus.readyCandidateCount <= PRODUCT_IDS.length
    && !PRODUCT_FOCUS_UNSAFE_RE.test(`${productFocus.nextGate} | ${productFocus.workOrder} | ${productFocus.selectionReason}`)
    && productFocus?.lifecycle?.join(',') === 'discover,define,build,release,learn'
    && productFocus?.acceptanceDimensions?.join(',') === 'user_job,state_transition,data_contract,failure_recovery,mobile_acceptance,import_reconciliation,security_boundary,automated_test'
    && JSON.stringify(productFocus) === JSON.stringify(manifestProductFocus)
  if ((productFocusRequired && !productFocusValid) || (!productFocusRequired && productFocus != null)) {
    fail('ally_ceo_local_cycle_product_focus_invalid')
  }
  const planShortHash = hash.slice(0, 12)
  const cycleHash = sha256([
    ALLY_CEO_LOCAL_CYCLE_CONTRACT,
    EXECUTION_SPEC_VERSION,
    hash,
    outcomeId,
    roles.join(','),
  ].join('|'))
  const legacyRoles = LEGACY_OUTCOME_ROLES[outcomeId]
  if (!legacyRoles) fail('ally_ceo_local_cycle_legacy_team_invalid')
  const legacyShortHashes = LEGACY_EXECUTION_SPEC_VERSIONS.map((version) => sha256([
    ALLY_CEO_LOCAL_CYCLE_CONTRACT,
    version,
    hash,
    outcomeId,
    legacyRoles.join(','),
  ].join('|')).slice(0, 12))
  const shortHash = cycleHash.slice(0, 12)
  const outcomeMarker = `[ALLY_CEO_OUTCOME:${period}:${outcomeId}]`
  const repairMarker = `[ALLY_CEO_REPAIR:${period}:${outcomeId}:${shortHash}]`
  const legacyRepairMarkers = [
    ...legacyShortHashes.map((hash) => `[ALLY_CEO_REPAIR:${period}:${outcomeId}:${hash}]`),
    `[ALLY_CEO_REPAIR:${period}:${outcomeId}]`,
  ]
  const objectiveBody = [
    `Using imported SuperMega project evidence, produce one concise internal ${OUTCOME_BRIEFS[outcomeId]} brief and separate verified facts from assumptions.`,
    'Use CURRENT.md, hq/NOW.md, hq/portfolio.json, and site-manifest.json as current authority; treat older handoff files as historical context that cannot prove current completion.',
    'Lead with current limitations: the live app is not a managed system of record, and managed persistence and security remain not ready.',
    'Define 1 reusable task template under Task templates for the highest-value internal next action, plus success checks, failure modes that expose missing proof, and owner gates.',
    `Department deliverable: ${OUTCOME_TASK_DIRECTIVES[outcomeId]}`,
    'Every verified claim must name its exact source filename and matching supplied evidence ID.',
    SPECIALIST_SECTION_CONTRACT,
    SPECIALIST_OUTPUT_GRAMMAR,
  ]
  if (productFocusValid) {
    objectiveBody.splice(3, 0,
      `Focus only on ${productFocus.productId}; execute portfolio work order ${productFocus.workOrderId}: ${productFocus.workOrder}`,
      `Selection reason: ${productFocus.selectionReason} The external next gate remains: ${productFocus.nextGate}`,
      'The Task templates item must be one build-ready delivery work order covering exactly these acceptance dimensions: user job, state transition, data contract, failure recovery, mobile acceptance, import reconciliation, security boundary, and automated test.',
      'Do not propose another page, product, agent, dashboard, or integration unless that work order requires it to complete the named state transition.',
    )
  }
  const objective = [outcomeMarker, `[ALLY_CEO_CYCLE:${shortHash}]`, `[ALLY_CEO_PLAN:${planShortHash}]`, ...objectiveBody].join(' ')
  const repairObjective = [
    repairMarker,
    `[ALLY_CEO_CYCLE:${shortHash}]`,
    `[ALLY_CEO_PLAN:${planShortHash}]`,
    'Replace one rejected legacy control artifact under the current quality contract; do not retry a current-version failure.',
    ...objectiveBody,
  ].join(' ')
  return {
    outcomeId,
    productFocus: productFocusValid ? structuredClone(productFocus) : null,
    period,
    outcomeMarker,
    repairMarker,
    legacyRepairMarkers,
    planHash: hash,
    cycleHash,
    shortHash,
    legacyShortHashes,
    workOrderId: String(plan.preflight?.expectedWorkOrderId || ''),
    agents: [...agents],
    roles,
    objective,
    objectiveDigest: `sha256:${sha256(objective)}`,
    repairObjective,
    repairObjectiveDigest: `sha256:${sha256(repairObjective)}`,
    resourceEnvelope,
  }
}

function validateAudit(audit) {
  if (audit?.contract !== 'supermega.ally-runtime-audit.v1'
    || audit.mode !== 'read_only'
    || audit.hostAdmission?.contract !== 'supermega.ally-host-admission.v1') {
    fail('ally_ceo_local_cycle_audit_invalid')
  }
  if (audit.hostAdmission.eligible !== true || audit.hostAdmission.maxConcurrentLocalRuns !== 1) {
    const blockers = Array.isArray(audit.hostAdmission.blockers) ? audit.hostAdmission.blockers.join(',') : 'unknown'
    fail(`ally_ceo_local_cycle_host_blocked:${blockers}`)
  }
  if (audit.localModels?.loaded !== 0
    || audit.localCompany?.activeJobs !== 0
    || audit.localCompany?.queuedMissions !== 0
    || audit.localCompany?.runningMissions !== 0
    || audit.localCompany?.pendingApprovals !== 0
    || audit.localCompany?.pendingReportFinalizations !== 0
    || audit.localCompany?.pendingEvaluations !== 0) {
    fail('ally_ceo_local_cycle_host_not_idle')
  }
  return {
    generatedAt: String(audit.generatedAt || ''),
    memoryUsedPercent: Number(audit.memory?.usedPercent),
    maxConcurrentLocalRuns: 1,
    loadedModels: 0,
  }
}

function validateHqLiveReceipt(receipt) {
  const commit = String(receipt?.release?.commit || '')
  const observedAt = String(receipt?.observedAt || '')
  const snapshotAgeHours = Number(receipt?.snapshotAgeHours)
  const probes = receipt?.probes
  const attempts = [
    probes?.appReleaseAttempts,
    probes?.publicReleaseAttempts,
    probes?.healthAttempts,
    probes?.cloudAutonomyAttempts,
  ]
  const productContract = receipt?.appProductContract
  const advisories = receipt?.advisories
  const productContractCurrent = productContract?.contract === 'supermega_app_live'
    && productContract.ok === true
    && productContract.status === 'current'
    && productContract.reason === null
  const productContractDrifted = productContract?.contract === 'supermega_app_live'
    && productContract.ok === false
    && productContract.status === 'drifted'
    && /^(?:missing_live_[a-z0-9_]+|live_[a-z0-9_]+|[a-z0-9_]+_(?:missing|wrong|invalid|mismatch|rejected))(?::[A-Za-z0-9_.=/-]+){0,3}$/.test(String(productContract.reason || ''))
  const failures = receipt?.failures
  const localOnlySchedulerDrift = receipt?.ok === false
    && Array.isArray(failures)
    && failures.length === 1
    && failures[0] === LOCAL_ONLY_HQ_LIVE_FAILURE
    && receipt.scheduler?.status === 'degraded'
    && receipt.scheduler?.configured === false
    && receipt.scheduler?.pcDependency === false
    && receipt.scheduler?.maxJobsPerRun === 2
    && receipt.scheduler?.budgetGrantsRequired === true
  const liveReceiptAccepted = (receipt?.ok === true && Array.isArray(failures) && failures.length === 0)
    || localOnlySchedulerDrift
  if (receipt?.contract !== 'supermega.hq-live-state.v1'
    || !liveReceiptAccepted
    || !Array.isArray(advisories)
    || advisories.some((advisory) => !CEO_LIVE_ADVISORIES.has(advisory))
    || new Set(advisories).size !== advisories.length
    || (!productContractCurrent && !productContractDrifted)
    || (productContractDrifted && !advisories.includes('app_product_contract_drift'))
    || (productContractCurrent && advisories.includes('app_product_contract_drift'))
    || !/^[a-f0-9]{40}$/.test(commit)
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(observedAt)
    || !Number.isFinite(snapshotAgeHours)
    || snapshotAgeHours < 0
    || snapshotAgeHours > 72
    || probes?.timeoutMs !== 15_000
    || probes?.maxAttempts !== 2
    || attempts.some((value) => !Number.isInteger(value) || value < 1 || value > 2)
    || receipt.runtime?.operatingMode !== 'isolated_demo'
    || receipt.runtime?.managedPersistenceReady !== false
    || receipt.runtime?.securityReady !== false
    || receipt.capacity?.scaleToZero !== true
    || receipt.capacity?.idleActiveExecutionTarget !== 0
    || receipt.capacity?.registeredSpecialistsConsumeCompute !== false) {
    fail('ally_ceo_local_cycle_hq_live_rejected')
  }
  return {
    contract: receipt.contract,
    performed: true,
    observedAt,
    releaseCommit: commit,
    snapshotAgeHours,
    probeAttempts: attempts,
    managedPersistenceReady: false,
    securityReady: false,
    launchReadinessCurrent: productContractCurrent,
    productContractStatus: productContract.status,
    productContractReason: productContract.reason,
    advisories: [...advisories],
    failures: [...failures],
    executionMode: localOnlySchedulerDrift ? 'local_only_scheduler_drift' : 'live_observed',
    productionReleaseAccepted: false,
    vercelActionsAllowed: false,
    hostedSchedulerActionsAllowed: false,
  }
}

function hostIsIdle(audit) {
  return audit?.localModels?.loaded === 0
    && audit?.localCompany?.activeJobs === 0
    && audit?.localCompany?.queuedMissions === 0
    && audit?.localCompany?.runningMissions === 0
    && audit?.localCompany?.pendingApprovals === 0
    && audit?.localCompany?.pendingReportFinalizations === 0
    && audit?.localCompany?.pendingEvaluations === 0
}

function canAttemptMemoryRecovery(audit) {
  const blockers = audit?.hostAdmission?.blockers
  return audit?.contract === 'supermega.ally-runtime-audit.v1'
    && audit.mode === 'read_only'
    && audit.hostAdmission?.contract === 'supermega.ally-host-admission.v1'
    && audit.hostAdmission.eligible === false
    && Array.isArray(blockers)
    && blockers.length > 0
    && blockers.every((blocker) => MEMORY_RECOVERY_BLOCKERS.has(blocker))
    && hostIsIdle(audit)
}

function memorySettlementDelayMs(audit) {
  return audit?.hostAdmission?.blockers?.includes('memory_pressure_critical')
    ? MEMORY_CRITICAL_SETTLEMENT_DELAY_MS
    : MEMORY_SETTLEMENT_DELAY_MS
}

function validateMemoryRecovery(receipt, beforeAudit) {
  const beforeWorkingSetMb = Number(receipt?.beforeWorkingSetMb)
  const afterWorkingSetMb = Number(receipt?.afterWorkingSetMb)
  const releasedWorkingSetMb = Number(receipt?.releasedWorkingSetMb)
  if (receipt?.contract !== 'supermega.ally-working-set-trim.v1'
    || receipt.mode !== 'apply'
    || receipt.ok !== true
    || receipt.targetScope !== 'verified_codex_process_tree'
    || !Number.isInteger(receipt.targetCount)
    || receipt.targetCount < 1
    || !Number.isFinite(beforeWorkingSetMb)
    || !Number.isFinite(afterWorkingSetMb)
    || !Number.isFinite(releasedWorkingSetMb)
    || beforeWorkingSetMb < afterWorkingSetMb
    || releasedWorkingSetMb < 0
    || receipt.trimFailed !== 0
    || receipt.controls?.processMutation !== true
    || receipt.controls?.processTerminationCalls !== 0
    || receipt.controls?.filesModified !== 0
    || receipt.controls?.networkRequests !== 0
    || receipt.controls?.commandLinesRead !== false
    || receipt.controls?.environmentRead !== false
    || receipt.controls?.secretValuesReturned !== false) {
    fail('ally_ceo_local_cycle_memory_recovery_invalid')
  }
  return {
    attempted: true,
    initialMemoryUsedPercent: Number(beforeAudit.memory?.usedPercent),
    stabilizationDelayMs: memorySettlementDelayMs(beforeAudit),
    targetCount: receipt.targetCount,
    beforeWorkingSetMb,
    afterWorkingSetMb,
    releasedWorkingSetMb,
    processTerminations: 0,
  }
}

function validateFinalAudit(audit) {
  if (audit?.contract !== 'supermega.ally-runtime-audit.v1'
    || audit.mode !== 'read_only'
    || audit.hostAdmission?.contract !== 'supermega.ally-host-admission.v1') {
    fail('ally_ceo_local_cycle_final_audit_invalid')
  }
  if (audit.localModels?.loaded !== 0
    || audit.localCompany?.activeJobs !== 0
    || audit.localCompany?.queuedMissions !== 0
    || audit.localCompany?.runningMissions !== 0
    || audit.localCompany?.pendingApprovals !== 0
    || audit.localCompany?.pendingReportFinalizations !== 0
    || audit.localCompany?.pendingEvaluations !== 0) {
    fail('ally_ceo_local_cycle_final_host_not_idle')
  }
  return {
    eligible: audit.hostAdmission.eligible === true,
    memoryUsedPercent: Number(audit.memory?.usedPercent),
    loadedModels: 0,
    activeJobs: 0,
    queuedMissions: 0,
    runningMissions: 0,
  }
}

function validateReadOnlyReplayHost(audit, memoryRecovery) {
  const finalHost = validateFinalAudit(audit)
  const blockers = audit.hostAdmission?.blockers
  const memoryUsedPercent = Number(audit.memory?.usedPercent)
  if (!Array.isArray(blockers)
    || blockers.length > 8
    || new Set(blockers).size !== blockers.length
    || blockers.some((blocker) => !/^[a-z0-9_]{1,80}$/.test(String(blocker)))
    || !Number.isFinite(memoryUsedPercent)
    || memoryUsedPercent < 0
    || memoryUsedPercent > 100) {
    fail('ally_ceo_local_cycle_replay_audit_invalid')
  }
  return {
    generatedAt: String(audit.generatedAt || ''),
    memoryUsedPercent,
    maxConcurrentLocalRuns: finalHost.eligible ? 1 : 0,
    loadedModels: 0,
    admissionEligible: finalHost.eligible,
    admissionBlockers: [...blockers],
    memoryRecovery,
  }
}

function validateHealth(health, provider, model) {
  const exactZero = ['active_jobs', 'queued_missions', 'running_missions', 'pending_approvals', 'pending_report_finalizations', 'pending_evaluations']
    .every((key) => health?.[key] === 0)
  if (!exactZero || !Array.isArray(health?.pending_completion) || health.pending_completion.length !== 0) {
    fail('ally_ceo_local_cycle_company_not_idle')
  }
  if (provider === 'ollama' && (!Array.isArray(health.installed_models) || !health.installed_models.includes(model))) {
    fail('ally_ceo_local_cycle_model_unavailable')
  }
}

function validateCapacityAdmission(receipt, spec) {
  const listenerCounts = receipt?.runtime?.listener_counts
  const listenerKeys = ['11434', '5173', '8765', '8788']
  const effects = receipt?.effects
  const advisories = receipt?.advisories
  const companyAttention = receipt?.company_attention
  const clearCompanyAttention = ['ready', 'work_pending'].includes(companyAttention?.status)
    && Array.isArray(advisories)
    && advisories.length === 0
  const retainedQualityAttention = companyAttention?.status === 'attention_required'
    && companyAttention?.next_action === 'review_quality_failures_before_retry'
    && Array.isArray(advisories)
    && advisories.length === 1
    && advisories[0] === 'quality_failures_retained_for_review'
  if (receipt?.company?.registered_roles !== EXPECTED_ROLE_CAPABILITY_COUNT) {
    fail('ally_ceo_local_cycle_capacity_role_capabilities_invalid')
  }
  if (receipt?.schema !== 'local-company.machine-capacity.v1'
    || receipt.status !== 'ready'
    || receipt.focus?.enabled !== true
    || !/^[a-f0-9]{12}$/.test(String(receipt.focus?.project_id || ''))
    || !Number.isInteger(receipt.focus?.max_roles)
    || receipt.focus.max_roles < spec.roles.length
    || receipt.focus.max_roles > 6
    || receipt.company?.resident_role_processes !== 0
    || receipt.company?.execution_parallelism !== 1
    || receipt.company?.active_jobs !== 0
    || receipt.company?.running_missions !== 0
    || receipt.runtime?.service_live !== true
    || receipt.runtime?.service_identity !== 'match'
    || !listenerCounts
    || Object.keys(listenerCounts).sort().join(',') !== listenerKeys.join(',')
    || listenerKeys.some((port) => !Number.isInteger(listenerCounts[port]) || listenerCounts[port] < 0 || listenerCounts[port] > 1)
    || listenerCounts['8765'] !== 1
    || receipt.runtime?.loaded_models !== 0
    || !Number.isInteger(receipt.runtime?.available_memory_bytes)
    || !Number.isInteger(receipt.runtime?.minimum_available_memory_bytes)
    || receipt.runtime.minimum_available_memory_bytes < 1024 * 1024 * 1024
    || receipt.runtime.available_memory_bytes < receipt.runtime.minimum_available_memory_bytes
    || (!clearCompanyAttention && !retainedQualityAttention)
    || !Array.isArray(receipt.blockers)
    || receipt.blockers.length !== 0
    || !Array.isArray(receipt.indeterminate)
    || receipt.indeterminate.length !== 0
    || effects?.database_mutated !== false
    || effects?.model_called !== false
    || effects?.process_started !== false
    || effects?.process_stopped !== false
    || effects?.queue_changed !== false) {
    const blockers = Array.isArray(receipt?.blockers) && receipt.blockers.length > 0
      ? receipt.blockers.join(',')
      : Array.isArray(receipt?.indeterminate) && receipt.indeterminate.length > 0
        ? receipt.indeterminate.join(',')
        : 'invalid'
    fail(`ally_ceo_local_cycle_capacity_blocked:${blockers}`)
  }
  return {
    status: 'ready',
    focusProjectId: receipt.focus.project_id,
    focusedRoleLimit: receipt.focus.max_roles,
    registeredRoles: spec.resourceEnvelope.registeredRoleRecords,
    roleCapabilitiesAvailable: receipt.company.registered_roles,
    roleDefinitionsConsumeCompute: false,
    companyAttentionStatus: companyAttention.status,
    companyAdvisories: [...advisories],
    residentRoleProcesses: 0,
    executionParallelism: 1,
    availableMemoryBytes: receipt.runtime.available_memory_bytes,
    minimumAvailableMemoryBytes: receipt.runtime.minimum_available_memory_bytes,
    loadedModels: 0,
    nextAction: String(receipt.next_action || ''),
  }
}

function knowledgeStatus(knowledge) {
  const counts = knowledge?.status_counts
  if (knowledge?.schema !== 'local-company.knowledge-freshness.v1'
    || !/^[a-f0-9]{12}$/.test(String(knowledge.project_id || ''))
    || typeof knowledge.ready_for_use !== 'boolean'
    || !Number.isInteger(knowledge.source_count)
    || knowledge.source_count < 1
    || !['current', 'changed', 'missing', 'unavailable'].every((key) => Number.isInteger(counts?.[key]) && counts[key] >= 0)
    || counts.current + counts.changed + counts.missing + counts.unavailable !== knowledge.source_count
    || knowledge.ready_for_use !== (counts.changed === 0 && counts.missing === 0 && counts.unavailable === 0)
    || knowledge.effects?.knowledge_records_mutated !== false
    || knowledge.effects?.model_called !== false
    || knowledge.effects?.work_started !== false) {
    fail('ally_ceo_local_cycle_knowledge_invalid')
  }
  return {
    projectId: knowledge.project_id,
    sourceCount: knowledge.source_count,
    current: counts.current,
    changed: counts.changed,
    missing: counts.missing,
    unavailable: counts.unavailable,
    ready: knowledge.ready_for_use,
  }
}

function validateCurrentKnowledge(knowledge) {
  const status = knowledgeStatus(knowledge)
  if (!status.ready || status.changed !== 0 || status.missing !== 0 || status.unavailable !== 0) {
    fail('ally_ceo_local_cycle_knowledge_not_current')
  }
  return status
}

function validateKnowledgeRefresh(receipt, before) {
  const refreshedIds = receipt?.refreshed_ids
  if (receipt?.schema !== 'local-company.knowledge-refresh.v1'
    || receipt.project_id !== before.projectId
    || receipt.source_count !== before.sourceCount
    || receipt.refreshed_count !== before.changed
    || receipt.unchanged_count !== before.current
    || !Array.isArray(refreshedIds)
    || refreshedIds.length !== before.changed
    || new Set(refreshedIds).size !== refreshedIds.length
    || !refreshedIds.every((id) => /^[a-f0-9]{12}$/.test(String(id)))
    || receipt.effects?.knowledge_records_mutated !== true
    || receipt.effects?.model_called !== false
    || receipt.effects?.work_started !== false) {
    fail('ally_ceo_local_cycle_knowledge_refresh_rejected')
  }
  return receipt.refreshed_count
}

function findExistingCycle(queueText, marker) {
  if (typeof queueText !== 'string' || Buffer.byteLength(queueText, 'utf8') > MAX_COMMAND_BYTES) {
    fail('ally_ceo_local_cycle_queue_inventory_invalid')
  }
  if (typeof marker !== 'string' || !/^\[ALLY_CEO_(?:OUTCOME|CYCLE|REPAIR):[A-Za-z0-9:-]+\]$/.test(marker)) {
    fail('ally_ceo_local_cycle_queue_marker_invalid')
  }
  const parsed = queueText.split(/\r?\n/)
    .filter((line) => line.includes(marker))
    .map((line) => {
      const match = /^([a-f0-9]{12})\s+([a-z_]+)/.exec(line)
      const job = /\sjob=([a-f0-9]{12}|-)\s/.exec(line)
      if (!match
        || !job
        || !/\sp=100\s/.test(line)
        || !/\sproject=SuperMega\s/.test(line)) {
        fail('ally_ceo_local_cycle_queue_inventory_invalid')
      }
      return { queueId: match[1], status: match[2], jobId: job[1] === '-' ? null : job[1] }
    })
    .filter((item) => item.status !== 'cancelled')
  if (parsed.length > 1) fail('ally_ceo_local_cycle_duplicate_plan')
  return parsed[0] || null
}

function existingForSpec(queueText, spec) {
  const markers = [
    spec.repairMarker,
    ...spec.legacyRepairMarkers,
    `[ALLY_CEO_CYCLE:${spec.shortHash}]`,
    spec.outcomeMarker,
    ...spec.legacyShortHashes.map((hash) => `[ALLY_CEO_CYCLE:${hash}]`),
  ]
  for (const marker of markers) {
    const existing = findExistingCycle(queueText, marker)
    if (existing) return existing
  }
  return null
}

function validateSkippedOutcome(plan, expectedOutcomeId, expectedPeriod = null) {
  const generatedAt = String(plan?.generatedAt || '')
  const period = generatedAt.slice(0, 10)
  const productIds = ['shop', 'plant', 'website', 'ecommerce']
  if (!plan
    || plan.ok !== true
    || plan.contract !== 'supermega.ally-ceo-company-plan.v1'
    || plan.declined !== false
    || plan.skipped !== true
    || plan.reason !== 'no_executable_product_focus'
    || plan.outcomeId !== expectedOutcomeId
    || expectedOutcomeId !== 'product-portfolio-control'
    || !/^\d{4}-\d{2}-\d{2}T/.test(generatedAt)
    || expectedPeriod && period !== expectedPeriod
    || plan.productFocus !== null
    || plan.manifest !== null
    || plan.preflight !== null
    || plan.plan !== null
    || !Array.isArray(plan.gatedProductWork)
    || plan.gatedProductWork.length !== productIds.length
    || plan.gatedProductWork.some((item, index) => item?.productId !== productIds[index]
      || !['owner-gated', 'external-blocked'].includes(item.status)
      || !new RegExp(`^${productIds[index]}-[a-z0-9-]{2,79}$`).test(String(item.workOrderId || '')))
    || !Array.isArray(plan.sourceReceipts)
    || plan.sourceReceipts.map((receipt) => receipt?.path).join(',') !== 'hq/NOW.md,hq/WORKBOARD.md#execution-order,hq/portfolio.json,hq/readiness/managed-pilot-readiness.json'
    || plan.sourceReceipts.some((receipt) => !/^sha256:[a-f0-9]{64}$/.test(String(receipt?.digest || '')))
    || plan.controls?.planningModelCalls !== 0
    || plan.controls?.planningConnectorRequests !== 0
    || plan.controls?.planningExternalWrites !== false
    || plan.controls?.maxAgents !== 0
    || plan.controls?.maxConcurrentAllyRuns !== 0
    || plan.controls?.scaleToZero !== true) {
    fail('ally_ceo_local_cycle_skipped_outcome_invalid')
  }
  return {
    outcomeId: plan.outcomeId,
    reason: plan.reason,
    gatedProductWork: structuredClone(plan.gatedProductWork),
  }
}

function validateQueuePreflight(preflight, queueId, roles) {
  if (preflight?.schema !== 'local-company.queue-preflight.v1'
    || preflight.status !== 'ready'
    || preflight.queue_id !== queueId
    || preflight.reviewed_queue_matches !== true
    || preflight.submission_allowed !== true
    || preflight.model_execution_ready !== true
    || !Array.isArray(preflight.blockers)
    || preflight.blockers.length !== 0
    || !Array.isArray(preflight.owner_gate_categories)
    || preflight.owner_gate_categories.length !== 0
    || preflight.team?.selection !== 'explicit'
    || preflight.team?.roles?.join(',') !== roles.join(',')
    || preflight.knowledge?.status !== 'ready'
    || !Number.isInteger(preflight.knowledge?.source_count)
    || preflight.knowledge.source_count < 1
    || preflight.knowledge.status_counts?.changed !== 0
    || preflight.knowledge.status_counts?.missing !== 0
    || preflight.knowledge.status_counts?.unavailable !== 0
    || preflight.effects?.model_called !== false
    || preflight.effects?.work_started !== false) {
    fail('ally_ceo_local_cycle_queue_preflight_rejected')
  }
}

function parseQueueAdd(text) {
  const match = /^Queued mission ([a-f0-9]{12}); nothing was executed\.\s*$/m.exec(String(text || ''))
  if (!match) fail('ally_ceo_local_cycle_queue_add_invalid')
  return match[1]
}

function parseQueueResult(text, queueId) {
  const match = /^Queue item ([a-f0-9]{12}) completed as job ([a-f0-9]{12}); quality=(passed|failed)\r?\nReport: (.+)\s*$/m.exec(String(text || ''))
  if (!match || match[1] !== queueId) fail('ally_ceo_local_cycle_result_invalid')
  return { queueId: match[1], jobId: match[2], qualityPassed: match[3] === 'passed', reportPath: match[4].trim() }
}

async function currentPlan(now, completedOutcomeIds = []) {
  const [hqNow, workboard, portfolioText, completedAutomationArchiveText, managedReadinessText] = await Promise.all([
    readFile(resolve(root, 'hq', 'NOW.md'), 'utf8'),
    readFile(resolve(root, 'hq', 'WORKBOARD.md'), 'utf8'),
    readFile(resolve(root, 'hq', 'portfolio.json'), 'utf8'),
    readFile(resolve(root, 'hq', 'archive', 'completed-local-automations-through-ops-225.json'), 'utf8'),
    readFile(resolve(root, 'hq', 'readiness', 'managed-pilot-readiness.json'), 'utf8'),
  ])
  return buildAllyCeoCompanyPlan({ now, hqNow, workboard, portfolioText, completedAutomationArchiveText, managedReadinessText, completedOutcomeIds })
}

function limitedEnvironment(localCompanyRoot) {
  const environment = {
    PYTHONIOENCODING: 'utf-8',
    PYTHONPATH: resolve(localCompanyRoot, 'src'),
    PYTHONUTF8: '1',
    TEMP: tmpdir(),
    TMP: tmpdir(),
  }
  for (const name of ['SystemRoot', 'WINDIR']) {
    if (process.env[name]) environment[name] = process.env[name]
  }
  return environment
}

export function commandFailureReason(kind, error) {
  const code = typeof error?.code === 'number' ? error.code : 'error'
  const fallback = `ally_ceo_local_cycle_command_failed:${kind}:${code}`
  if (kind !== 'hq_live') return fallback
  for (const stream of [error?.stderr, error?.stdout]) {
    try {
      const receipt = JSON.parse(String(stream || '').trim())
      if (receipt?.contract !== 'supermega.hq-live-state.v1') continue
      const detail = String(receipt?.error || '')
      if (/^live_app_product_contract_failed:(?:missing_live_[a-z0-9_]+|live_[a-z0-9_]+|[a-z0-9_]+_(?:missing|wrong|invalid|mismatch|rejected))(?::[A-Za-z0-9_.=/-]+){0,3}$/.test(detail)) {
        return `ally_ceo_local_cycle_hq_live_failed:${detail}`
      }
      const failures = Array.isArray(receipt?.failures) ? receipt.failures : []
      if (failures.length > 0 && failures.every((failure) => SAFE_HQ_LIVE_FAILURES.has(failure))) {
        return `ally_ceo_local_cycle_hq_live_failed:${failures.join(',')}`
      }
    } catch {
      continue
    }
  }
  return fallback
}

export function recoverableHqLiveOutput(error) {
  if (error?.code !== 1 || error?.killed === true || error?.signal) return null
  const output = String(error?.stdout || '').trim()
  if (!output || Buffer.byteLength(output) > MAX_COMMAND_BYTES) return null
  try {
    const receipt = JSON.parse(output)
    if (receipt?.contract !== 'supermega.hq-live-state.v1'
      || receipt.ok !== false
      || !Array.isArray(receipt.failures)
      || receipt.failures.length !== 1
      || receipt.failures[0] !== LOCAL_ONLY_HQ_LIVE_FAILURE) return null
    return output
  } catch {
    return null
  }
}

async function defaultCommandRunner({ kind, args, timeoutMs, localCompanyRoot, localCompanyHome, localCompanyPython }) {
  let file
  let commandArgs
  let cwd
  let env
  if (kind === 'audit') {
    file = powershell
    commandArgs = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resolve(root, 'tools', 'audit_ally_runtime.ps1'), '-Json']
    cwd = root
    env = limitedEnvironment(localCompanyRoot)
  } else if (kind === 'trim') {
    file = powershell
    commandArgs = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resolve(root, 'tools', 'trim_codex_working_sets.ps1'), '-Apply', '-Json']
    cwd = root
    env = limitedEnvironment(localCompanyRoot)
  } else if (kind === 'hq_live') {
    file = process.execPath
    commandArgs = [resolve(root, 'tools', 'verify_hq_live_state.mjs'), '--ceo-advisory']
    cwd = root
    env = limitedEnvironment(localCompanyRoot)
  } else if (kind === 'local') {
    file = localCompanyPython
    commandArgs = ['-m', 'local_company.cli', '--home', localCompanyHome, ...args]
    cwd = localCompanyRoot
    env = limitedEnvironment(localCompanyRoot)
  } else {
    fail('ally_ceo_local_cycle_command_kind_invalid')
  }
  for (const candidate of [
    file,
    ...(kind === 'local' ? [resolve(localCompanyRoot, 'src', 'local_company', 'cli.py')] : []),
    ...(kind === 'trim' ? [resolve(root, 'tools', 'trim_codex_working_sets.ps1')] : []),
    ...(kind === 'hq_live' ? [resolve(root, 'tools', 'verify_hq_live_state.mjs')] : []),
  ]) {
    const stat = await lstat(candidate).catch(() => null)
    if (!stat?.isFile() || stat.isSymbolicLink()) fail('ally_ceo_local_cycle_runtime_untrusted')
  }
  try {
    const result = await execFileAsync(file, commandArgs, {
      cwd,
      env,
      encoding: 'utf8',
      maxBuffer: MAX_COMMAND_BYTES,
      timeout: timeoutMs,
      windowsHide: true,
    })
    return String(result.stdout || '')
  } catch (error) {
    const recoverable = kind === 'hq_live' ? recoverableHqLiveOutput(error) : null
    if (recoverable) return recoverable
    fail(commandFailureReason(kind, error))
  }
}

async function defaultReportInspector(reportPath, localCompanyHome) {
  const absolute = resolve(reportPath)
  if (!within(resolve(localCompanyHome, 'outputs'), absolute)) fail('ally_ceo_local_cycle_report_path_invalid')
  const stat = await lstat(absolute).catch(() => null)
  if (!stat?.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > MAX_REPORT_BYTES) {
    fail('ally_ceo_local_cycle_report_invalid')
  }
  const bytes = await readFile(absolute)
  return { path: absolute, bytes: bytes.length, digest: `sha256:${sha256(bytes)}`, text: bytes.toString('utf8') }
}

function specialistSection(text, role) {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === `## ${role}`)
  if (start < 0) return ''
  const endOffset = lines.slice(start + 1).findIndex((line) => line.startsWith('## '))
  const end = endOffset < 0 ? lines.length : start + 1 + endOffset
  return lines.slice(start + 1, end).join('\n').trim()
}

function balancedSpecialistDelimiters(text) {
  const stack = []
  const closing = { ')': '(', ']': '[', '}': '{' }
  for (const character of text) {
    if ('([{'.includes(character)) stack.push(character)
    else if (closing[character] && stack.pop() !== closing[character]) return false
  }
  return stack.length === 0 && (text.match(/`/g) || []).length % 2 === 0
}

function specialistSectionHasSourceReference(text) {
  return /[\\`]/.test(text)
    || /\b[a-z][a-z0-9+.-]*:\/\//i.test(text)
    || /\b[A-Za-z]:[\\/]/.test(text)
    || /(?:^|\s)\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+(?:\s|$)/.test(text)
    || /\b[A-Za-z0-9][A-Za-z0-9._-]{0,80}[.,;:](?:md|json|toml|ya?ml|csv|sql|html|css|tsx?|m?js|py|ps1)\b/i.test(text)
    || /\b(?:dot|comma|period)\s+(?:md|json|toml|ya?ml|csv|sql|html|css|tsx?|m?js|py|ps1)\b/i.test(text)
}

function validateSpecialistSections(text, requiredRoles) {
  if (!Array.isArray(requiredRoles) || requiredRoles.length !== 1 || new Set(requiredRoles).size !== 1) {
    fail('ally_ceo_local_cycle_specialist_roles_invalid')
  }
  for (const role of requiredRoles) {
    const section = specialistSection(text, role)
    const words = section.match(/\b[\p{L}\p{N}][\p{L}\p{N}'-]*\b/gu) || []
    if (!section.startsWith('Not verified or performed:')
      || words.length < 12
      || words.length > 90
      || !/Proposed next action\s*:/i.test(section)
      || !/Proposed next action\s*:\s*(?:review|inspect|compare|draft)\b/i.test(section)
      || /Proposed next action\s*:\s*(?:review|inspect|compare|draft)\s*(?:[.!?]|Assumption\s*:)/i.test(section)
      || !/Assumption\s*:/i.test(section)
      || !/Missing proof\s*:/i.test(section)
      || /Missing proof\s*:\s*(?:none|nothing|complete|n\/?a|not applicable|no(?:\s+missing)?\s+proof)\b/i.test(section)
      || /\bOwner review required\b/i.test(section)
      || /specialist draft withheld|incomplete model output|no substantive specialist draft/i.test(section)
      || /Proposed next action\s*:\s*(?:execute|deploy|publish|send|pay|purchase|migrate|enable)\b/i.test(section)
      || /\b(?:and|or|to|for|with|using|before|after|the|a|an|of|in|on|at|from|does|is|are|has|have|can|will|must|should|could|would|may|might|verify|confirm|assuming|currently|whether)\.?$/i.test(section)
      || /\b(?:and|or|to|for|with|using|before|after|the|a|an|of|in|on|at|from|does|is|are|has|have|can|will|must|should|could|would|may|might|verify|confirm|assuming|currently|whether|not|state|reusable|consequential)\s*;\s*(?:Keep the scope local|Treat this as unverified|Require evidence before consequential action)\b/i.test(section)
      || !balancedSpecialistDelimiters(section)
      || specialistSectionHasSourceReference(section)
      || /\[EVIDENCE:/i.test(section)) {
      fail('ally_ceo_local_cycle_specialist_section_rejected')
    }
  }
}

function validateAcceptedReport(value, requiredRoles) {
  const text = typeof value?.text === 'string' ? value.text : ''
  const digest = String(value?.digest || '')
  if (!value
    || typeof value.path !== 'string'
    || !Number.isInteger(value.bytes)
    || value.bytes < 2
    || value.bytes > MAX_REPORT_BYTES
    || !/^sha256:[a-f0-9]{64}$/.test(digest)
    || Buffer.byteLength(text, 'utf8') !== value.bytes
    || !text.includes('## Executive synthesis')
    || !text.includes('Owner review required.')
    || /(?:instagram\.com|linkedin\.com|lnkd\.in|-----BEGIN [A-Z ]+PRIVATE KEY-----|\b(?:sk-proj|ghp|gho|glpat|xoxb|xoxp|xoxa|xoxr)-[A-Za-z0-9_-]{16,})/i.test(text)) {
    fail('ally_ceo_local_cycle_report_semantics_rejected')
  }
  const generatedOutput = (text.split('## Team plan')[1] || '').split('## Evidence manifest')[0]
  validateSpecialistSections(generatedOutput, requiredRoles)
  const structuredLabels = [
    'Verified facts:', 'Assumptions:', 'Task templates:', 'Success checks:',
    'Failure modes:', 'Owner gates:',
  ]
  const structured = structuredLabels.every((label) => generatedOutput.includes(label))
  if (structured) {
    if (!/records this frozen limitation:/i.test(generatedOutput)
      || !/remain unverified/i.test(generatedOutput)
      || !/Missing evidence blocks local report acceptance\./i.test(generatedOutput)) {
      fail('ally_ceo_local_cycle_report_semantics_rejected')
    }
  } else if (!/missing proof\s*:/i.test(generatedOutput)
    || /missing proof\s*:\s*(?:no|none|nothing|complete)\b/i.test(generatedOutput)
    || !/managed persistence/i.test(generatedOutput)
    || !/security/i.test(generatedOutput)
    || !/(?:not ready|unready|not a managed system of record)/i.test(generatedOutput)) {
    fail('ally_ceo_local_cycle_report_semantics_rejected')
  }
  const evidenceCitations = generatedOutput.match(/\[EVIDENCE:[a-f0-9]{16}\]/gi) || []
  const authorityNames = ['CURRENT.md', 'hq/NOW.md', 'hq/portfolio.json', 'site-manifest.json']
    .filter((name) => generatedOutput.includes(name))
  if (evidenceCitations.length < 2 || authorityNames.length < 1) {
    fail('ally_ceo_local_cycle_report_citations_rejected')
  }
  return { path: value.path, bytes: value.bytes, digest }
}

function validateRejectedReportMetadata(value) {
  const text = typeof value?.text === 'string' ? value.text : ''
  const digest = String(value?.digest || '')
  if (!value
    || typeof value.path !== 'string'
    || !Number.isInteger(value.bytes)
    || value.bytes < 2
    || value.bytes > MAX_REPORT_BYTES
    || !/^sha256:[a-f0-9]{64}$/.test(digest)
    || Buffer.byteLength(text, 'utf8') !== value.bytes) {
    fail('ally_ceo_local_cycle_rejected_report_invalid')
  }
  return { path: value.path, bytes: value.bytes, digest }
}

async function inspectExistingCycle(existing, spec, runCommand, inspectReport) {
  let report = null
  let reason = null
  let legacyExecution = false
  if (existing.status === 'complete' && existing.jobId) {
    try {
      const detail = parseJson(
        await runCommand({ kind: 'local', args: ['show', existing.jobId], timeoutMs: 30_000 }),
        'ally_ceo_local_cycle_existing_job_invalid',
      )
      if (!Array.isArray(detail.job)
        || detail.job[0] !== existing.jobId
        || detail.job[2] !== 'complete'
        || detail.evaluation?.passed !== true
        || typeof detail.job[1] !== 'string'
        || typeof detail.job[4] !== 'string') {
        fail('ally_ceo_local_cycle_existing_job_rejected')
      }
      const objective = detail.job[1]
      const hasLegacyHash = spec.legacyShortHashes.some((hash) => objective.includes(`[ALLY_CEO_CYCLE:${hash}]`))
      const hasLegacyGrammar = objective.includes(spec.outcomeMarker)
        && /\[ALLY_CEO_CYCLE:[a-f0-9]{12}\]/.test(objective)
        && /\[ALLY_CEO_PLAN:[a-f0-9]{12}\]/.test(objective)
        && objective.includes(SPECIALIST_SECTION_CONTRACT)
        && !objective.includes(SPECIALIST_OUTPUT_GRAMMAR)
      legacyExecution = hasLegacyHash || hasLegacyGrammar
      report = validateAcceptedReport(await inspectReport(detail.job[4]), spec.roles)
    } catch (error) {
      reason = String(error?.message || 'ally_ceo_local_cycle_existing_job_rejected').slice(0, 160)
    }
  }
  return {
    accepted: existing.status === 'complete' && Boolean(report) && !reason,
    report,
    reason,
    legacyExecution,
  }
}

async function selectRotatingPlan({ buildPlan, queueText, runCommand, inspectReport, repairRejected = false }) {
  const completedOutcomeIds = []
  const processedOutcomeIds = []
  const rejectedOutcomes = []
  const skippedOutcomes = []
  let period = null
  for (const expectedOutcomeId of OUTCOME_SEQUENCE) {
    const plan = await buildPlan([...processedOutcomeIds])
    if (plan?.skipped === true) {
      const skipped = validateSkippedOutcome(plan, expectedOutcomeId, period)
      period ??= plan.generatedAt.slice(0, 10)
      skippedOutcomes.push(skipped)
      processedOutcomeIds.push(expectedOutcomeId)
      continue
    }
    const spec = planSpec(plan)
    if (spec.outcomeId !== expectedOutcomeId || period && spec.period !== period) {
      fail('ally_ceo_local_cycle_rotation_sequence_invalid')
    }
    period ??= spec.period
    const existing = existingForSpec(queueText, spec)
    if (!existing) return { allDone: false, periodIncomplete: false, plan, spec, existing: null, inspection: null, completedOutcomeIds, rejectedOutcomes, skippedOutcomes }
    const inspection = await inspectExistingCycle(existing, spec, runCommand, inspectReport)
    if (inspection.accepted) completedOutcomeIds.push(spec.outcomeId)
    else {
      rejectedOutcomes.push({
        outcomeId: spec.outcomeId,
        queueId: existing.queueId,
        jobId: existing.jobId ?? null,
        status: existing.status,
        reason: inspection.reason || `queue_${existing.status}`,
      })
      if (repairRejected
        && existing.status === 'complete'
        && existing.jobId
        && inspection.legacyExecution
        && LEGACY_REPAIRABLE_REASONS.has(inspection.reason)) {
        return {
          allDone: false,
          periodIncomplete: false,
          period,
          plan,
          spec,
          existing,
          inspection,
          completedOutcomeIds,
          rejectedOutcomes,
          skippedOutcomes,
        }
      }
    }
    processedOutcomeIds.push(spec.outcomeId)
  }

  const declined = await buildPlan([...processedOutcomeIds])
  if (!declined?.ok
    || declined.contract !== 'supermega.ally-ceo-company-plan.v1'
    || declined.declined !== true
    || declined.reason !== 'no_authorized_ceo_outcome'
    || declined.manifest !== null
    || declined.plan !== null) {
    fail('ally_ceo_local_cycle_rotation_completion_invalid')
  }
  return {
    allDone: rejectedOutcomes.length === 0 && skippedOutcomes.length === 0,
    periodIncomplete: rejectedOutcomes.length > 0 || skippedOutcomes.length > 0,
    period,
    completedOutcomeIds,
    rejectedOutcomes,
    skippedOutcomes,
  }
}

export async function runAllyCeoLocalCycle(input = {}, dependencies = {}) {
  const execute = input.execute === true
  const refreshKnowledge = input.refreshKnowledge === true
  const repairRejected = input.repairRejected === true
  const recoverMemory = input.recoverMemory !== false
  const scheduled = input.scheduled === true
  const provider = input.provider || 'ollama'
  const model = input.model || 'llama3.2:1b'
  if (refreshKnowledge && !execute) fail('ally_ceo_local_cycle_knowledge_refresh_requires_execution')
  if (repairRejected && !execute) fail('ally_ceo_local_cycle_legacy_repair_requires_execution')
  if (!['ollama', 'mock'].includes(provider)
    || !/^[a-zA-Z0-9._:-]{1,80}$/.test(model)
    || (provider === 'ollama' && !LOCAL_LLAMA_MODELS.has(model.toLowerCase()))) {
    fail('ally_ceo_local_cycle_provider_invalid')
  }
  if (scheduled && !recoverMemory && !dependencies.runCommand) {
    const pressureReceipt = scheduledMemoryPressureReceipt()
    if (pressureReceipt) return pressureReceipt
  }
  const localCompanyRoot = resolve(input.localCompanyRoot || defaultLocalCompanyRoot)
  const localCompanyHome = resolve(input.localCompanyHome || defaultLocalCompanyHome)
  const localCompanyPython = resolve(input.localCompanyPython || defaultLocalCompanyPython)
  const runCommand = dependencies.runCommand || ((request) => defaultCommandRunner({ ...request, localCompanyRoot, localCompanyHome, localCompanyPython }))
  const inspectReport = dependencies.inspectReport || ((path) => defaultReportInspector(path, localCompanyHome))
  const cycleNow = input.now ?? new Date()
  const buildPlan = dependencies.buildPlan || ((completedOutcomeIds) => currentPlan(cycleNow, completedOutcomeIds))
  const waitForMemorySettlement = dependencies.waitForMemorySettlement
    || ((delayMs) => new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs)))

  let audit = parseJson(await runCommand({ kind: 'audit', args: [], timeoutMs: 30_000 }), 'ally_ceo_local_cycle_audit_json_invalid')
  let memoryRecovery = {
    attempted: false,
    initialMemoryUsedPercent: Number(audit.memory?.usedPercent),
    stabilizationDelayMs: 0,
    targetCount: 0,
    beforeWorkingSetMb: 0,
    afterWorkingSetMb: 0,
    releasedWorkingSetMb: 0,
    processTerminations: 0,
  }
  if (scheduled && execute && recoverMemory && canAttemptMemoryRecovery(audit)) {
    const receipt = parseJson(
      await runCommand({ kind: 'trim', args: [], timeoutMs: 30_000 }),
      'ally_ceo_local_cycle_memory_recovery_json_invalid',
    )
    memoryRecovery = validateMemoryRecovery(receipt, audit)
    await waitForMemorySettlement(memoryRecovery.stabilizationDelayMs)
    audit = parseJson(await runCommand({ kind: 'audit', args: [], timeoutMs: 30_000 }), 'ally_ceo_local_cycle_recovery_audit_json_invalid')
  }
  if (scheduled && (audit.hostAdmission?.eligible !== true || !hostIsIdle(audit))) {
    return scheduledDeferredReceipt(audit, memoryRecovery)
  }
  const health = parseJson(await runCommand({ kind: 'local', args: ['health'], timeoutMs: 30_000 }), 'ally_ceo_local_cycle_health_invalid')
  validateHealth(health)
  const queueText = await runCommand({ kind: 'local', args: ['queue', 'list'], timeoutMs: 30_000 })
  const rotation = dependencies.plan
    ? (() => {
        const spec = planSpec(dependencies.plan)
        return {
          allDone: false,
          plan: dependencies.plan,
          spec,
          existing: existingForSpec(queueText, spec),
          inspection: null,
          completedOutcomeIds: [],
          skippedOutcomes: [],
        }
      })()
    : await selectRotatingPlan({ buildPlan, queueText, runCommand, inspectReport, repairRejected })
  if (rotation.periodIncomplete || rotation.allDone) {
    return {
      ok: rotation.allDone,
      contract: ALLY_CEO_LOCAL_CYCLE_CONTRACT,
      status: rotation.allDone ? 'period_complete' : 'period_incomplete',
      replayed: true,
      period: rotation.period,
      outcomeId: rotation.allDone ? null : undefined,
      completedOutcomeIds: rotation.completedOutcomeIds,
      ...(rotation.periodIncomplete ? {
        rejectedOutcomes: rotation.rejectedOutcomes,
        skippedOutcomes: rotation.skippedOutcomes,
      } : {}),
      host: validateReadOnlyReplayHost(audit, memoryRecovery),
      liveHq: { performed: false, skipped: 'period_closed' },
      sourceCount: null,
      knowledgeRefresh: {
        requested: refreshKnowledge,
        performed: false,
        refreshedSources: 0,
        skipped: 'period_closed',
      },
      modelCalls: 0,
      queueWrites: 0,
      ownerBrief: buildOwnerBrief({
        status: rotation.allDone ? 'period_complete' : 'period_incomplete',
        completedOutcomeIds: rotation.completedOutcomeIds,
        rejectedOutcomes: rotation.rejectedOutcomes,
        skippedOutcomes: rotation.skippedOutcomes,
      }),
      controls: { externalWrites: false, connectors: 0, maxLocalRuns: 1, scaleToZero: true },
    }
  }
  if (execute && !memoryRecovery.attempted && recoverMemory && canAttemptMemoryRecovery(audit)) {
    const receipt = parseJson(
      await runCommand({ kind: 'trim', args: [], timeoutMs: 30_000 }),
      'ally_ceo_local_cycle_memory_recovery_json_invalid',
    )
    memoryRecovery = validateMemoryRecovery(receipt, audit)
    await waitForMemorySettlement(memoryRecovery.stabilizationDelayMs)
    audit = parseJson(await runCommand({ kind: 'audit', args: [], timeoutMs: 30_000 }), 'ally_ceo_local_cycle_recovery_audit_json_invalid')
  }
  const host = { ...validateAudit(audit), memoryRecovery }
  validateHealth(health, provider, model)
  const knowledge = parseJson(await runCommand({ kind: 'local', args: ['knowledge', 'audit', '--project', 'SuperMega'], timeoutMs: 30_000 }), 'ally_ceo_local_cycle_knowledge_invalid')
  const initialKnowledge = knowledgeStatus(knowledge)
  if (initialKnowledge.missing > 0 || initialKnowledge.unavailable > 0) {
    fail('ally_ceo_local_cycle_knowledge_source_unavailable')
  }
  let refreshedSources = 0
  let currentKnowledge
  if (initialKnowledge.changed > 0) {
    if (!refreshKnowledge) fail('ally_ceo_local_cycle_knowledge_not_current')
    const refreshReceipt = parseJson(
      await runCommand({ kind: 'local', args: ['knowledge', 'refresh', '--project', 'SuperMega'], timeoutMs: 30_000 }),
      'ally_ceo_local_cycle_knowledge_refresh_invalid',
    )
    refreshedSources = validateKnowledgeRefresh(refreshReceipt, initialKnowledge)
    const refreshedAudit = parseJson(
      await runCommand({ kind: 'local', args: ['knowledge', 'audit', '--project', 'SuperMega'], timeoutMs: 30_000 }),
      'ally_ceo_local_cycle_knowledge_invalid',
    )
    currentKnowledge = validateCurrentKnowledge(refreshedAudit)
  } else {
    currentKnowledge = validateCurrentKnowledge(knowledge)
  }
  const sourceCount = currentKnowledge.sourceCount
  const knowledgeRefresh = {
    requested: refreshKnowledge,
    performed: refreshedSources > 0,
    refreshedSources,
  }
  // Changed registered sources are themselves a company-attention blocker. Reconcile
  // that no-model condition before final capacity admission so --refresh-knowledge
  // cannot deadlock behind the stale evidence it is explicitly authorized to repair.
  const capacityAdmission = validateCapacityAdmission(parseJson(
    await runCommand({ kind: 'local', args: ['capacity', '--project', 'SuperMega'], timeoutMs: 30_000 }),
    'ally_ceo_local_cycle_capacity_invalid',
  ), rotation.spec)
  const liveHq = validateHqLiveReceipt(parseJson(
    await runCommand({ kind: 'hq_live', args: [], timeoutMs: 90_000 }),
    'ally_ceo_local_cycle_hq_live_invalid',
  ))
  const { spec, existing, completedOutcomeIds, rejectedOutcomes = [], skippedOutcomes = [] } = rotation
  let repair = null
  if (existing) {
    const inspected = rotation.inspection || await inspectExistingCycle(existing, spec, runCommand, inspectReport)
    if (repairRejected && !inspected.accepted) {
      if (existing.status !== 'complete'
        || !existing.jobId
        || !inspected.legacyExecution
        || !LEGACY_REPAIRABLE_REASONS.has(inspected.reason)) {
        fail('ally_ceo_local_cycle_legacy_repair_not_allowed')
      }
      repair = { queueId: existing.queueId, jobId: existing.jobId, reason: inspected.reason }
    } else {
      return {
        ok: inspected.accepted,
        contract: ALLY_CEO_LOCAL_CYCLE_CONTRACT,
        status: inspected.reason ? 'existing_rejected' : 'existing',
        replayed: true,
        period: spec.period,
        outcomeId: spec.outcomeId,
        productFocus: spec.productFocus,
        completedOutcomeIds,
        skippedOutcomes,
        planHash: spec.planHash,
        cycleHash: spec.cycleHash,
        workOrderId: spec.workOrderId,
        agents: spec.agents,
        roles: spec.roles,
        objectiveDigest: spec.objectiveDigest,
        resourceEnvelope: spec.resourceEnvelope,
        queueId: existing.queueId,
        jobId: existing.jobId,
        queueStatus: existing.status,
        qualityPassed: inspected.accepted,
        report: inspected.report,
        reason: inspected.reason,
        host,
        capacityAdmission,
        liveHq,
        sourceCount,
        knowledgeRefresh,
        modelCalls: 0,
        queueWrites: 0,
        ownerBrief: buildOwnerBrief({
          status: inspected.reason ? 'existing_rejected' : 'existing',
          outcomeId: spec.outcomeId,
          completedOutcomeIds,
          skippedOutcomes,
          capacityAdmission,
        }),
        controls: { externalWrites: false, connectors: 0, vercelActions: 0, hostedSchedulerActions: 0, productionReleaseAccepted: false, maxLocalRuns: 1, scaleToZero: true },
      }
    }
  } else if (repairRejected) {
    fail('ally_ceo_local_cycle_legacy_repair_not_available')
  }

  const executionObjective = repair ? spec.repairObjective : spec.objective
  const base = {
    ok: true,
    contract: ALLY_CEO_LOCAL_CYCLE_CONTRACT,
    status: execute ? 'executing' : 'ready',
    replayed: false,
    period: spec.period,
    outcomeId: spec.outcomeId,
    productFocus: spec.productFocus,
    completedOutcomeIds,
    rejectedOutcomes,
    skippedOutcomes,
    planHash: spec.planHash,
    cycleHash: spec.cycleHash,
    workOrderId: spec.workOrderId,
    agents: spec.agents,
    roles: spec.roles,
    objectiveDigest: repair ? spec.repairObjectiveDigest : spec.objectiveDigest,
    resourceEnvelope: spec.resourceEnvelope,
    repair,
    host,
    capacityAdmission,
    liveHq,
    sourceCount,
    knowledgeRefresh,
    ownerBrief: buildOwnerBrief({
      status: execute ? 'executing' : 'ready',
      outcomeId: spec.outcomeId,
      completedOutcomeIds,
      rejectedOutcomes,
      skippedOutcomes,
      capacityAdmission,
    }),
    controls: { externalWrites: false, connectors: 0, vercelActions: 0, hostedSchedulerActions: 0, productionReleaseAccepted: false, maxLocalRuns: 1, scaleToZero: true },
  }
  if (!execute) return { ...base, status: 'ready', modelCalls: 0, queueWrites: 0 }

  const added = await runCommand({
    kind: 'local',
    args: ['queue', 'add', executionObjective, '--project', 'SuperMega', '--roles', spec.roles.join(','), '--priority', '100'],
    timeoutMs: 30_000,
  })
  const queueId = parseQueueAdd(added)
  let preflight
  try {
    preflight = parseJson(
      await runCommand({ kind: 'local', args: ['queue', 'preflight', '--queue-id', queueId], timeoutMs: 30_000 }),
      'ally_ceo_local_cycle_queue_preflight_invalid',
    )
    validateQueuePreflight(preflight, queueId, spec.roles)
  } catch (error) {
    await runCommand({ kind: 'local', args: ['queue', 'cancel', queueId], timeoutMs: 30_000 }).catch(() => '')
    throw error
  }

  const execution = await runCommand({
    kind: 'local',
    args: [
      'queue', 'run-next', '--queue-id', queueId,
      '--provider', provider,
      '--model', model,
      '--num-ctx', String(spec.resourceEnvelope.modelContextTokens),
      '--num-predict', String(spec.resourceEnvelope.modelOutputTokens),
      '--keep-alive', spec.resourceEnvelope.modelKeepAlive,
    ],
    timeoutMs: spec.resourceEnvelope.cycleTimeoutMs,
  })
  const result = parseQueueResult(execution, queueId)
  const detail = parseJson(
    await runCommand({ kind: 'local', args: ['show', result.jobId], timeoutMs: 30_000 }),
    'ally_ceo_local_cycle_job_invalid',
  )
  if (!Array.isArray(detail.job)
    || detail.job[0] !== result.jobId
    || detail.job[2] !== 'complete'
    || detail.job[4] !== result.reportPath
    || detail.evaluation?.passed !== result.qualityPassed
    || !Array.isArray(detail.events)) {
    fail('ally_ceo_local_cycle_job_rejected')
  }
  const modelCalls = detail.events.filter((event) => Array.isArray(event) && event[0] === 'model_metrics').length
  if (modelCalls < spec.roles.length || modelCalls > spec.resourceEnvelope.maxModelCalls) {
    fail('ally_ceo_local_cycle_model_count_invalid')
  }
  const inspectedReport = await inspectReport(result.reportPath)
  let report
  let reportRejectionReason = null
  try {
    report = validateAcceptedReport(inspectedReport, spec.roles)
  } catch (error) {
    const reason = String(error?.message || '')
    if (!LEGACY_REPAIRABLE_REASONS.has(reason)) throw error
    report = validateRejectedReportMetadata(inspectedReport)
    reportRejectionReason = reason
  }
  const finalHealth = parseJson(await runCommand({ kind: 'local', args: ['health'], timeoutMs: 30_000 }), 'ally_ceo_local_cycle_final_health_invalid')
  validateHealth(finalHealth, provider, model)
  const finalAudit = parseJson(await runCommand({ kind: 'audit', args: [], timeoutMs: 30_000 }), 'ally_ceo_local_cycle_final_audit_invalid')
  const finalHost = validateFinalAudit(finalAudit)
  const qualityFailureReason = reportRejectionReason || (result.qualityPassed ? null : 'queue_quality_failed')
  const qualityPassed = result.qualityPassed && !qualityFailureReason
  const currentRejection = qualityFailureReason ? {
    outcomeId: spec.outcomeId,
    queueId,
    jobId: result.jobId,
    status: 'quality_failed',
    reason: qualityFailureReason,
  } : null

  return {
    ...base,
    ok: qualityPassed,
    status: qualityPassed ? 'accepted' : 'quality_failed',
    queueId,
    jobId: result.jobId,
    qualityPassed,
    queueQualityPassed: result.qualityPassed,
    reason: qualityFailureReason,
    report,
    modelCalls,
    queueWrites: 1,
    finalHost,
    ownerBrief: buildOwnerBrief({
      status: qualityPassed ? 'accepted' : 'quality_failed',
      outcomeId: spec.outcomeId,
      completedOutcomeIds,
      rejectedOutcomes: currentRejection ? [...rejectedOutcomes, currentRejection] : rejectedOutcomes,
      skippedOutcomes,
      capacityAdmission,
    }),
  }
}

function parseArgs(argv) {
  const result = { execute: false, refreshKnowledge: false, repairRejected: false, recoverMemory: true, recordResult: false, scheduled: false, provider: 'ollama' }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--execute') result.execute = true
    else if (arg === '--refresh-knowledge') result.refreshKnowledge = true
    else if (arg === '--repair-rejected') result.repairRejected = true
    else if (arg === '--no-memory-recovery') result.recoverMemory = false
    else if (arg === '--record-result') result.recordResult = true
    else if (arg === '--scheduled') result.scheduled = true
    else if (arg === '--provider') result.provider = argv[++index]
    else if (arg === '--help' || arg === '-h') result.help = true
    else fail(`ally_ceo_local_cycle_unknown_argument:${arg}`)
  }
  return result
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.scheduled && (!args.execute || !args.recordResult)) fail('ally_ceo_local_cycle_scheduled_contract_invalid')
  if (args.help) {
    process.stdout.write([
      'SuperMega Ally CEO local company cycle',
      '',
      '  npm run company:ally:preflight',
      '  npm run company:ally:run',
      '  npm run company:ally:repair',
      '',
      'Preflight is read-only. Run refreshes changed registered sources, then queues and executes one exact local mission.',
      'Run may trim the verified idle Codex process tree once when memory pressure is the only host blocker; it never terminates a process.',
      'Repair replaces at most one rejected prior-version artifact; a current-version failure is never retried.',
      'Missing, unavailable, unstable, or malformed source evidence fails before queue or model work.',
      'No connector, deployment, payment, message, or customer action is available.',
      '--record-result atomically replaces only the fixed local CEO receipt after a complete result.',
      '--scheduled requires execution plus result recording, attempts at most one verified non-terminating memory trim, and safely defers while admission remains unavailable.',
    ].join('\n') + '\n')
    return
  }
  const result = await runAllyCeoLocalCycle(args)
  if (args.recordResult) await writeCycleReceipt(result)
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (!result.ok) process.exitCode = 2
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, reason: String(error?.message || 'ally_ceo_local_cycle_failed').slice(0, 300) })}\n`)
    process.exitCode = 1
  })
}

export default { ALLY_CEO_LOCAL_CYCLE_CONTRACT, ALLY_CEO_OWNER_BRIEF_CONTRACT, runAllyCeoLocalCycle, writeCycleReceipt }
