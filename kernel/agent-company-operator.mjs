import { createHash } from 'node:crypto'

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/
const HASH_RE = /^[a-f0-9]{64}$/
const MANIFEST_FIELDS = new Set(['clientId', 'cycleId', 'agents', 'evidence', 'roleBudget'])
const MAX_AGENTS = 2
const MAX_ROLE_BUDGET = 8
const MAX_ACTIVE_ASSIGNMENTS = 2
const MAX_CONCURRENT_CYCLES = Math.floor(MAX_ACTIVE_ASSIGNMENTS / MAX_AGENTS)
const MAX_EVIDENCE_BYTES = 8_192
const TERMINAL_STATUSES = new Set(['completed', 'partial', 'failed'])
const WORK_ORDER_STATUSES = new Set(['planned', 'running', ...TERMINAL_STATUSES])
const SENSITIVE_KEY_PARTS = [
  'secret',
  'password',
  'credential',
  'apikey',
  'accesstoken',
  'refreshtoken',
  'privatekey',
  'authorization',
  'cookie',
]

export const AGENT_COMPANY_ENDPOINT = 'https://console.supermega.dev/api/agent-company'

function fail(reason) {
  throw new Error(reason)
}

function isRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function hasSensitiveField(value, seen = new Set()) {
  if (!value || typeof value !== 'object') return false
  if (seen.has(value)) return false
  seen.add(value)
  if (Array.isArray(value)) return value.some((entry) => hasSensitiveField(entry, seen))
  return Object.entries(value).some(([key, entry]) => {
    const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
    return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part)) || hasSensitiveField(entry, seen)
  })
}

function evidenceText(value) {
  try {
    const serialized = typeof value === 'string' ? value.trim() : JSON.stringify(value)
    return typeof serialized === 'string' ? serialized : ''
  } catch {
    fail('agent_company_operator_invalid_evidence')
  }
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

function storedManifestInput(manifest) {
  return {
    clientId: manifest.clientId,
    cycleId: manifest.cycleId,
    agents: [...manifest.agents],
    evidence: Object.fromEntries(manifest.agents.map((agentId) => [agentId, evidenceText(manifest.evidence[agentId])])),
    roleBudget: manifest.roleBudget,
  }
}

function stableHash(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex')
}

export function validateAgentCompanyManifest(value) {
  if (!isRecord(value)) fail('agent_company_operator_invalid_manifest')
  const unknown = Object.keys(value).filter((field) => !MANIFEST_FIELDS.has(field)).sort()
  if (unknown.length) fail(`agent_company_operator_unknown_field:${unknown.join(',')}`)

  const clientId = String(value.clientId || '').trim()
  const cycleId = String(value.cycleId || '').trim()
  if (!ID_RE.test(clientId)) fail('agent_company_operator_invalid_client_id')
  if (!ID_RE.test(cycleId)) fail('agent_company_operator_invalid_cycle_id')
  if (!Array.isArray(value.agents) || value.agents.length < 1 || value.agents.length > MAX_AGENTS) {
    fail('agent_company_operator_invalid_agents')
  }
  const agents = value.agents.map((agent) => String(agent || '').trim())
  if (agents.some((agent) => !ID_RE.test(agent)) || new Set(agents).size !== agents.length) {
    fail('agent_company_operator_invalid_agents')
  }
  const roleBudget = Number(value.roleBudget)
  if (!Number.isInteger(roleBudget) || roleBudget < 1 || roleBudget > MAX_ROLE_BUDGET) {
    fail('agent_company_operator_invalid_role_budget')
  }
  if (!isRecord(value.evidence)) fail('agent_company_operator_invalid_evidence')
  const evidenceIds = Object.keys(value.evidence).sort()
  if (evidenceIds.length !== agents.length || evidenceIds.some((agent) => !agents.includes(agent))) {
    fail('agent_company_operator_evidence_mismatch')
  }
  if (hasSensitiveField(value.evidence)) fail('agent_company_operator_sensitive_field')

  const evidence = {}
  for (const agent of agents) {
    const text = evidenceText(value.evidence[agent])
    const bytes = Buffer.byteLength(text, 'utf8')
    if (!text || bytes > MAX_EVIDENCE_BYTES || /\u0000/.test(text)) {
      fail('agent_company_operator_invalid_evidence')
    }
    evidence[agent] = typeof value.evidence[agent] === 'string' ? text : JSON.parse(text)
  }
  return { clientId, cycleId, agents, evidence, roleBudget }
}

export function buildAgentCompanyManifestPreflight(value) {
  const manifest = validateAgentCompanyManifest(value)
  const storedInput = storedManifestInput(manifest)
  const cycleDigest = createHash('sha256').update(`${manifest.clientId}\n${manifest.cycleId}`).digest('hex').slice(0, 40)
  const evidence = manifest.agents.map((agentId) => ({
    agentId,
    bytes: Buffer.byteLength(storedInput.evidence[agentId], 'utf8'),
  }))
  return {
    version: 1,
    kind: 'agent_company_manifest_preflight',
    clientId: manifest.clientId,
    cycleId: manifest.cycleId,
    expectedRunId: `agent-company:${cycleDigest}`,
    expectedWorkOrderId: `company-order:${cycleDigest}`,
    agents: evidence,
    roleBudget: manifest.roleBudget,
    totalEvidenceBytes: evidence.reduce((total, entry) => total + entry.bytes, 0),
    expectedPlanHash: stableHash(storedInput),
    controls: {
      planOnlyDefault: true,
      explicitQueue: true,
      explicitDispatch: true,
      externalWrites: false,
      rawEvidenceIncluded: false,
    },
  }
}

function safeReason(value) {
  const reason = String(value || '')
  return /^company_[a-z0-9_]{1,120}$/.test(reason) ? reason : 'agent_company_request_failed'
}

export function createAgentCompanyApi(options = {}) {
  const opsKey = String(options.opsKey || '').trim()
  if (!opsKey) fail('agent_company_ops_key_required')
  const fetchImpl = options.fetchImpl || globalThis.fetch
  if (typeof fetchImpl !== 'function') fail('agent_company_fetch_required')

  return async function request(method, body) {
    let response
    try {
      response = await fetchImpl(AGENT_COMPANY_ENDPOINT, {
        method,
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-ops-key': opsKey,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(Number(options.timeoutMs || 75_000)),
      })
    } catch {
      fail('agent_company_request_unavailable')
    }

    let result
    try { result = await response.json() } catch { fail('agent_company_invalid_response') }
    if (!response.ok || !result?.ok) fail(safeReason(result?.reason))
    return result
  }
}

function summarizePlan(plan, preflight) {
  return {
    runId: plan.runId,
    clientId: plan.clientId,
    cycleId: plan.cycleId,
    actionMode: plan.actionMode,
    approvalRequired: plan.approvalRequired === true,
    expectedPlanHash: preflight.expectedPlanHash,
    reviewedPlanHash: stableHash(plan),
    assignments: (plan.assignments || []).map((assignment) => ({
      agentId: assignment.agentId,
      name: assignment.name,
      department: assignment.department,
      crew: assignment.crew,
      roleCount: assignment.roleCount,
      evidenceBytes: assignment.evidenceBytes,
      returns: assignment.returns,
    })),
    budget: plan.budget,
    controls: plan.controls,
  }
}

function assertPlan(plan, manifest, roster, preflight) {
  if (!isRecord(plan) || !ID_RE.test(String(plan.runId || ''))) fail('agent_company_operator_invalid_plan')
  if (plan.runId !== preflight.expectedRunId
    || plan.clientId !== manifest.clientId
    || plan.cycleId !== manifest.cycleId
    || plan.actionMode !== 'draft_only'
    || plan.approvalRequired !== true) {
    fail('agent_company_operator_plan_mismatch')
  }
  const assignments = Array.isArray(plan.assignments) ? plan.assignments : []
  if (assignments.length !== manifest.agents.length) fail('agent_company_operator_invalid_plan')
  const rosterIds = new Set((roster || []).map((agent) => agent.id))
  if (manifest.agents.some((agent) => !rosterIds.has(agent))) fail('agent_company_operator_unknown_agent')
  if (assignments.some((assignment, index) => assignment.agentId !== manifest.agents[index])) {
    fail('agent_company_operator_assignment_mismatch')
  }
  const plannedRoles = Number(plan.budget?.plannedRoles)
  const roleLimit = Number(plan.budget?.roleLimit)
  const assignedRoles = assignments.reduce((total, assignment) => total + Number(assignment?.roleCount || 0), 0)
  if (!Number.isInteger(plannedRoles)
    || plannedRoles < 1
    || plannedRoles > manifest.roleBudget
    || roleLimit !== plannedRoles
    || assignedRoles !== plannedRoles
    || Number(plan.budget?.remainingRoles) !== 0) {
    fail('agent_company_operator_budget_mismatch')
  }
  if (plan.controls?.execution !== 'sequential'
    || Number(plan.controls?.maxConcurrentCycles) !== MAX_CONCURRENT_CYCLES
    || Number(plan.controls?.maxActiveAssignments) !== MAX_ACTIVE_ASSIGNMENTS
    || plan.controls?.dynamicDelegation !== false
    || plan.controls?.crossAgentContext !== false
    || plan.controls?.externalWrites !== false
    || plan.controls?.durableClaimRequired !== true) {
    fail('agent_company_operator_unsafe_plan')
  }
}

function assertQueuedWorkOrder(workOrder, manifest, preflight, reviewedPlanHash) {
  if (!isRecord(workOrder)
    || !ID_RE.test(String(workOrder.workOrderId || ''))
    || !HASH_RE.test(String(workOrder.planHash || ''))
    || !isRecord(workOrder.plan)
    || !WORK_ORDER_STATUSES.has(workOrder.status)) {
    fail('agent_company_operator_invalid_work_order')
  }
  if (workOrder.workOrderId !== preflight.expectedWorkOrderId
    || workOrder.clientId !== manifest.clientId
    || workOrder.cycleId !== manifest.cycleId) {
    fail('agent_company_operator_work_order_mismatch')
  }
  if (workOrder.planHash !== preflight.expectedPlanHash) fail('agent_company_operator_plan_hash_mismatch')
  if (stableHash(workOrder.plan) !== reviewedPlanHash) fail('agent_company_operator_queued_plan_mismatch')
}

function assertCompletedWorkOrder(completed, queued, manifest, reviewedPlanHash) {
  if (!isRecord(completed)
    || !TERMINAL_STATUSES.has(completed.status)
    || !isRecord(completed.result)
    || !isRecord(completed.plan)
    || !HASH_RE.test(String(completed.resultHash || ''))
    || completed.evidenceState !== 'scrubbed') {
    fail('agent_company_operator_invalid_result')
  }
  if (completed.workOrderId !== queued.workOrderId
    || completed.clientId !== manifest.clientId
    || completed.cycleId !== manifest.cycleId
    || completed.planHash !== queued.planHash
    || stableHash(completed.plan) !== reviewedPlanHash
    || completed.result.actionMode !== 'draft_only') {
    fail('agent_company_operator_result_mismatch')
  }
}

function assertEvaluation(evaluation, expected, completed) {
  if (!isRecord(evaluation)
    || evaluation.workOrderId !== completed.workOrderId
    || evaluation.clientId !== completed.clientId
    || evaluation.verdict !== expected.verdict
    || !HASH_RE.test(String(evaluation.evaluationHash || ''))
    || !isRecord(evaluation.checks)
    || Object.keys(expected.checks).some((field) => evaluation.checks[field] !== expected.checks[field])) {
    fail('agent_company_operator_evaluation_mismatch')
  }
}

function assertProof(proofPacket, completed) {
  if (!isRecord(proofPacket)
    || proofPacket.kind !== 'agent_company_delivery_proof'
    || !HASH_RE.test(String(proofPacket.packetHash || ''))
    || proofPacket.workOrder?.workOrderId !== completed.workOrderId
    || proofPacket.workOrder?.clientId !== completed.clientId
    || proofPacket.workOrder?.cycleId !== completed.cycleId
    || proofPacket.workOrder?.planHash !== completed.planHash
    || proofPacket.delivery?.resultHash !== completed.resultHash
    || proofPacket.delivery?.actionMode !== 'draft_only'
    || proofPacket.controls?.externalWrites !== false
    || proofPacket.controls?.rawEvidenceIncluded !== false) {
    fail('agent_company_operator_invalid_proof')
  }
}

function validateEvaluation(value, workOrderId) {
  if (value === null || value === undefined) return null
  if (!isRecord(value) || !isRecord(value.checks)) fail('agent_company_operator_invalid_evaluation')
  const checks = {
    accurate: value.checks.accurate === true,
    complete: value.checks.complete === true,
    usable: value.checks.usable === true,
    boundarySafe: value.checks.boundarySafe === true,
  }
  const allPassed = Object.values(checks).every(Boolean)
  const verdict = String(value.verdict || '')
  if ((verdict === 'accepted') !== allPassed || !['accepted', 'revision_required'].includes(verdict)) {
    fail('agent_company_operator_invalid_evaluation')
  }
  const confirmation = `EVALUATE ${workOrderId}`
  if (String(value.confirmation || '') !== confirmation) fail(`confirmation_required:${confirmation}`)
  return { verdict, checks, confirmation }
}

export async function runGuidedAgentCompany(manifestValue, options = {}) {
  const manifest = validateAgentCompanyManifest(manifestValue)
  const preflight = buildAgentCompanyManifestPreflight(manifest)
  const manifestPayload = () => structuredClone(manifest)
  const request = options.request
  if (typeof request !== 'function') fail('agent_company_request_required')
  if (typeof options.readConfirmation !== 'function') fail('agent_company_confirmation_reader_required')

  const rosterResult = await request('GET')
  const planResult = await request('POST', { action: 'plan', ...manifestPayload() })
  const plan = planResult?.plan
  assertPlan(plan, manifest, rosterResult?.agents, preflight)
  const planSummary = summarizePlan(plan, preflight)
  await options.onPlan?.(planSummary)

  const queueConfirmation = `QUEUE ${plan.runId}`
  const queueAnswer = String(await options.readConfirmation(queueConfirmation, 'queue') || '').trim()
  if (!queueAnswer) return { ok: true, status: 'planned', plan: planSummary }
  if (queueAnswer !== queueConfirmation) fail(`confirmation_required:${queueConfirmation}`)

  const queued = await request('POST', { action: 'work-order-create', ...manifestPayload() })
  const workOrder = queued?.workOrder
  assertQueuedWorkOrder(workOrder, manifest, preflight, planSummary.reviewedPlanHash)
  await options.onQueued?.(workOrder)

  const runConfirmation = `RUN ${workOrder.workOrderId}`
  const runAnswer = String(await options.readConfirmation(runConfirmation, 'dispatch') || '').trim()
  if (!runAnswer) return { ok: true, status: 'queued', plan: planSummary, workOrder }
  if (runAnswer !== runConfirmation) fail(`confirmation_required:${runConfirmation}`)

  const dispatched = await request('POST', {
    action: 'work-order-run',
    clientId: manifest.clientId,
    workOrderId: workOrder.workOrderId,
    planHash: workOrder.planHash,
    confirmation: runConfirmation,
  })
  const completed = dispatched?.workOrder
  assertCompletedWorkOrder(completed, workOrder, manifest, planSummary.reviewedPlanHash)
  await options.onResult?.(completed)

  let evaluation = null
  if (typeof options.readEvaluation === 'function') {
    const evaluationInput = validateEvaluation(await options.readEvaluation(completed), completed.workOrderId)
    if (evaluationInput) {
      const evaluated = await request('POST', {
        action: 'work-order-evaluate',
        clientId: manifest.clientId,
        workOrderId: completed.workOrderId,
        planHash: completed.planHash,
        ...evaluationInput,
      })
      evaluation = evaluated.evaluation
      assertEvaluation(evaluation, evaluationInput, completed)
      await options.onEvaluation?.(evaluation)
    }
  }

  const proofResult = await request('POST', {
    action: 'work-order-proof',
    clientId: manifest.clientId,
    workOrderId: completed.workOrderId,
  })
  assertProof(proofResult?.proofPacket, completed)
  await options.onProof?.(proofResult.proofPacket)
  return {
    ok: true,
    status: completed.status,
    plan: planSummary,
    workOrder: completed,
    evaluation,
    proofPacket: proofResult.proofPacket,
  }
}

export default {
  AGENT_COMPANY_ENDPOINT,
  buildAgentCompanyManifestPreflight,
  createAgentCompanyApi,
  runGuidedAgentCompany,
  validateAgentCompanyManifest,
}
