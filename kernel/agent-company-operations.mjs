// Metadata-only operating evidence for durable Agent Company work orders.
// This module never returns queued evidence or specialist model output.

import { createHash, timingSafeEqual } from 'node:crypto'

import { listCompanyAgents } from './agent-company.mjs'
import {
  getCompanyWorkOrder,
  listCompanyWorkOrders,
  MAX_COMPANY_WORK_ORDERS,
} from './agent-company-work-orders.mjs'
import {
  claimActivity,
  getCachedResponse,
  putCachedResponse,
  releaseActivityClaim,
} from './store.mjs'

export const COMPANY_OPERATIONS_WINDOWS = Object.freeze([7, 30, 90])
export const COMPANY_OPERATIONS_TARGETS = Object.freeze({
  minimumSamples: 5,
  queueP90Minutes: 1440,
  executionP90Minutes: 30,
  terminalCompletionRate: 0.9,
  durableResultRate: 1,
  budgetComplianceRate: 1,
  boundaryComplianceRate: 1,
  evaluationCoverageRate: 1,
  acceptedEvaluationRate: 0.8,
})

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/
const HASH_RE = /^[a-f0-9]{64}$/
const TERMINAL_STATUSES = new Set(['completed', 'partial', 'blocked', 'failed'])
const VERDICTS = new Set(['accepted', 'revision_required'])
const EVALUATION_FIELDS = new Set(['clientId', 'workOrderId', 'planHash', 'verdict', 'checks', 'confirmation'])
const REPORT_FIELDS = new Set(['clientId', 'windowDays'])
const CHECK_FIELDS = Object.freeze(['accurate', 'complete', 'usable', 'boundarySafe'])

const failure = (reason, extra = {}) => ({ ok: false, reason, ...extra })
const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)
const evaluationIdFor = (workOrderId) => `company-evaluation:${String(workOrderId).split(':').pop()}`
const evaluationKey = (workOrderId) => `company-work-order-evaluation:${workOrderId}`

function onlyFields(input, allowed) {
  if (!isRecord(input)) return failure('company_operations_invalid_request')
  const fields = Object.keys(input).filter((field) => !allowed.has(field)).sort()
  return fields.length ? failure('company_operations_unknown_field', { fields }) : { ok: true }
}

function normalizeId(value, reason) {
  const normalized = String(value || '').trim()
  return ID_RE.test(normalized) ? normalized : failure(reason)
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex')
}

function sameHash(left, right) {
  if (!HASH_RE.test(String(left)) || !HASH_RE.test(String(right))) return false
  return timingSafeEqual(Buffer.from(String(left), 'hex'), Buffer.from(String(right), 'hex'))
}

function normalizeChecks(value) {
  if (!isRecord(value)) return failure('company_evaluation_invalid_checks')
  const unknown = Object.keys(value).filter((field) => !CHECK_FIELDS.includes(field)).sort()
  if (unknown.length) return failure('company_evaluation_unknown_check', { fields: unknown })
  if (!CHECK_FIELDS.every((field) => typeof value[field] === 'boolean')) {
    return failure('company_evaluation_invalid_checks')
  }
  return Object.fromEntries(CHECK_FIELDS.map((field) => [field, value[field]]))
}

function publicEvaluation(record) {
  return {
    evaluationId: record.evaluationId,
    workOrderId: record.workOrderId,
    clientId: record.clientId,
    verdict: record.verdict,
    checks: record.checks,
    evaluatedAt: record.evaluatedAt,
    evaluationHash: record.evaluationHash,
  }
}

async function readEvaluation(workOrderId, options = {}) {
  const read = options.getEvaluation || getCachedResponse
  try {
    const record = await read(evaluationKey(workOrderId))
    return isRecord(record) && record.workOrderId === workOrderId ? record : null
  } catch {
    return null
  }
}

export async function evaluateCompanyWorkOrder(input, options = {}) {
  const fields = onlyFields(input, EVALUATION_FIELDS)
  if (!fields.ok) return fields
  const clientId = normalizeId(input.clientId, 'company_invalid_client_id')
  if (isRecord(clientId)) return clientId
  const workOrderId = normalizeId(input.workOrderId, 'company_work_order_invalid_id')
  if (isRecord(workOrderId)) return workOrderId
  const verdict = String(input.verdict || '').trim()
  if (!VERDICTS.has(verdict)) return failure('company_evaluation_invalid_verdict')
  const checks = normalizeChecks(input.checks)
  if (checks.ok === false) return checks
  if (verdict === 'accepted' && CHECK_FIELDS.some((field) => !checks[field])) {
    return failure('company_evaluation_acceptance_checks_required')
  }
  if (verdict === 'revision_required' && CHECK_FIELDS.every((field) => checks[field])) {
    return failure('company_evaluation_revision_check_required')
  }
  if (String(input.confirmation || '') !== `EVALUATE ${workOrderId}`) {
    return failure('company_evaluation_confirmation_required', {
      workOrderId,
      confirmation: `EVALUATE ${workOrderId}`,
    })
  }

  const getOrder = options.getCompanyWorkOrder || getCompanyWorkOrder
  const fetched = await getOrder({ clientId, workOrderId }, options)
  if (!fetched?.ok) return fetched || failure('company_work_order_not_found')
  const order = fetched.workOrder
  if (!sameHash(input.planHash, order.planHash)) {
    return failure('company_work_order_plan_mismatch', { status: 'conflict', workOrderId })
  }
  if (!TERMINAL_STATUSES.has(order.status) || !isRecord(order.result)) {
    return failure('company_evaluation_terminal_result_required', { status: 'conflict', workOrderId })
  }

  const evaluationPayload = { clientId, workOrderId, planHash: order.planHash, verdict, checks }
  const evaluationHash = sha256(stableStringify(evaluationPayload))
  const evaluationId = evaluationIdFor(workOrderId)
  const reserve = options.claimActivity || claimActivity
  const release = options.releaseActivityClaim || releaseActivityClaim
  const save = options.putEvaluation || putCachedResponse
  const requireDurableClaim = options.requireDurableClaim !== false
  let claim
  try {
    claim = await reserve({
      id: evaluationId,
      kind: 'agent_company_work_order_evaluation',
      summary: `Quality verdict recorded for cycle ${order.cycleId}`,
      ref: clientId,
    })
  } catch {
    claim = { fresh: false, durable: false }
  }
  if (!claim?.fresh) {
    if (!claim?.durable) return failure('company_evaluation_store_unavailable', { status: 'blocked' })
    const existing = await readEvaluation(workOrderId, options)
    if (!existing) return failure('company_evaluation_already_claimed', { status: 'duplicate', workOrderId })
    if (!sameHash(existing.evaluationHash, evaluationHash)) {
      return failure('company_evaluation_conflict', { status: 'conflict', workOrderId })
    }
    return { ok: true, mode: 'work_order_evaluate', replayed: true, evaluation: publicEvaluation(existing) }
  }
  if (requireDurableClaim && !claim.durable) {
    try { await release(evaluationId) } catch { /* no evaluation was persisted */ }
    return failure('company_evaluation_durable_claim_required', { status: 'blocked', workOrderId })
  }

  const record = {
    version: 1,
    evaluationId,
    ...evaluationPayload,
    evaluationHash,
    evaluatedAt: String(options.now?.() || new Date().toISOString()),
  }
  let stored = false
  try { stored = Boolean(await save(evaluationKey(workOrderId), record)) }
  catch { stored = false }
  if (!stored) {
    try { await release(evaluationId) } catch { /* allow an explicit retry */ }
    return failure('company_evaluation_store_unavailable', { status: 'blocked', workOrderId })
  }
  return { ok: true, mode: 'work_order_evaluate', replayed: false, evaluation: publicEvaluation(record) }
}

function parseTime(value) {
  const time = Date.parse(String(value || ''))
  return Number.isFinite(time) ? time : null
}

function minutesBetween(start, end) {
  const startTime = parseTime(start)
  const endTime = parseTime(end)
  if (startTime === null || endTime === null || endTime < startTime) return null
  return Math.round(((endTime - startTime) / 60000) * 10) / 10
}

function rate(numerator, denominator) {
  return denominator ? Math.round((numerator / denominator) * 1000) / 1000 : null
}

function percentile(values, fraction) {
  const numbers = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!numbers.length) return null
  return numbers[Math.max(0, Math.ceil(numbers.length * fraction) - 1)]
}

function targetState(sample, met) {
  return sample < COMPANY_OPERATIONS_TARGETS.minimumSamples ? 'collecting' : met ? 'met' : 'missed'
}

function evaluateOrder(order, evaluation, nowMs) {
  const plan = isRecord(order.plan) ? order.plan : {}
  const assignments = Array.isArray(plan.assignments) ? plan.assignments : []
  const result = isRecord(order.result) ? order.result : null
  const results = Array.isArray(result?.results) ? result.results : []
  const terminal = TERMINAL_STATUSES.has(order.status)
  const completedSpecialists = results.filter((item) => item?.status === 'completed').length
  const usedRoleCalls = Number(result?.budget?.usedRoleCalls)
  const roleLimit = Number(plan?.budget?.roleLimit)
  const budgetCompliant = terminal && Number.isFinite(usedRoleCalls) && Number.isFinite(roleLimit)
    ? usedRoleCalls >= 0 && usedRoleCalls <= roleLimit
    : null
  const boundaryCompliant = terminal ? Boolean(
    result?.actionMode === 'draft_only'
    && result?.approvalRequired === true
    && plan?.controls?.externalWrites === false
    && plan?.controls?.dynamicDelegation === false,
  ) : null
  const durableResult = terminal ? result?.durableResultStored === true : null
  const specialistCompletionRate = terminal ? rate(completedSpecialists, assignments.length) : null
  const createdTime = parseTime(order.createdAt)
  const queueMinutes = minutesBetween(order.createdAt, order.startedAt)
  const executionMinutes = minutesBetween(order.startedAt, order.completedAt)
  const ageMinutes = createdTime === null ? null : Math.max(0, Math.round(((nowMs - createdTime) / 60000) * 10) / 10)
  const evaluationPublic = evaluation ? publicEvaluation(evaluation) : null
  const resultByAgent = new Map(results.map((item) => [item?.agentId, item]))
  const agents = assignments.map((assignment) => {
    const specialist = resultByAgent.get(assignment.agentId)
    const usedRoleCalls = Number(specialist?.usedRoleCalls)
    return {
      agentId: assignment.agentId,
      name: assignment.name || assignment.agentId,
      department: assignment.department || 'unknown',
      crew: assignment.crew || null,
      status: specialist?.status || (terminal ? 'missing' : order.status),
      plannedRoleCalls: Number.isFinite(Number(assignment.roleCount)) ? Number(assignment.roleCount) : null,
      usedRoleCalls: Number.isFinite(usedRoleCalls) ? usedRoleCalls : null,
    }
  })
  return {
    workOrderId: order.workOrderId,
    cycleId: order.cycleId,
    status: order.status,
    createdAt: order.createdAt,
    startedAt: order.startedAt || null,
    completedAt: order.completedAt || null,
    ageMinutes,
    queueMinutes,
    executionMinutes,
    specialists: assignments.length,
    specialistCompletionRate,
    usedRoleCalls: Number.isFinite(usedRoleCalls) ? usedRoleCalls : null,
    roleLimit: Number.isFinite(roleLimit) ? roleLimit : null,
    durableResult,
    budgetCompliant,
    boundaryCompliant,
    executionGate: terminal ? Boolean(
      order.status === 'completed'
      && specialistCompletionRate === 1
      && durableResult
      && budgetCompliant
      && boundaryCompliant,
    ) : null,
    evaluation: evaluationPublic,
    agents,
  }
}

function buildWorkforce(orders) {
  const catalog = listCompanyAgents()
  const byId = new Map(catalog.map((agent) => [agent.id, {
    agentId: agent.id,
    name: agent.name,
    department: agent.department,
    crew: agent.crew,
    assignedOrders: 0,
    activeAssignments: 0,
    terminalAssignments: 0,
    completedAssignments: 0,
    usedRoleCalls: 0,
  }]))
  for (const order of orders) {
    for (const agent of order.agents || []) {
      const current = byId.get(agent.agentId) || {
        agentId: agent.agentId,
        name: agent.name || agent.agentId,
        department: agent.department || 'unknown',
        crew: agent.crew || null,
        assignedOrders: 0,
        activeAssignments: 0,
        terminalAssignments: 0,
        completedAssignments: 0,
        usedRoleCalls: 0,
      }
      current.assignedOrders += 1
      if (['planned', 'running'].includes(order.status)) current.activeAssignments += 1
      if (TERMINAL_STATUSES.has(order.status)) current.terminalAssignments += 1
      if (agent.status === 'completed') current.completedAssignments += 1
      if (Number.isFinite(agent.usedRoleCalls)) current.usedRoleCalls += agent.usedRoleCalls
      byId.set(agent.agentId, current)
    }
  }
  const utilized = [...byId.values()]
    .filter((agent) => agent.assignedOrders > 0)
    .map((agent) => ({
      ...agent,
      completionRate: rate(agent.completedAssignments, agent.terminalAssignments),
    }))
    .sort((left, right) => right.assignedOrders - left.assignedOrders || left.name.localeCompare(right.name))
  return {
    availableAgents: catalog.length,
    utilizedAgents: utilized.length,
    totalAssignments: utilized.reduce((total, agent) => total + agent.assignedOrders, 0),
    activeAssignments: utilized.reduce((total, agent) => total + agent.activeAssignments, 0),
    usedRoleCalls: utilized.reduce((total, agent) => total + agent.usedRoleCalls, 0),
    agents: utilized,
  }
}

function buildTargets(orders) {
  const terminal = orders.filter((order) => TERMINAL_STATUSES.has(order.status))
  const evaluated = terminal.filter((order) => order.evaluation)
  const queueValues = orders.map((order) => order.queueMinutes).filter(Number.isFinite)
  const executionValues = terminal.map((order) => order.executionMinutes).filter(Number.isFinite)
  const queueP90 = percentile(queueValues, 0.9)
  const executionP90 = percentile(executionValues, 0.9)
  const measures = {
    terminalCompletionRate: rate(terminal.filter((order) => order.status === 'completed').length, terminal.length),
    durableResultRate: rate(terminal.filter((order) => order.durableResult).length, terminal.length),
    budgetComplianceRate: rate(terminal.filter((order) => order.budgetCompliant).length, terminal.length),
    boundaryComplianceRate: rate(terminal.filter((order) => order.boundaryCompliant).length, terminal.length),
    evaluationCoverageRate: rate(evaluated.length, terminal.length),
    acceptedEvaluationRate: rate(evaluated.filter((order) => order.evaluation.verdict === 'accepted').length, evaluated.length),
  }
  const definitions = [
    ['queue_p90', 'Queue to first dispatch', queueValues.length, queueP90, COMPANY_OPERATIONS_TARGETS.queueP90Minutes, 'max'],
    ['execution_p90', 'First dispatch to terminal result', executionValues.length, executionP90, COMPANY_OPERATIONS_TARGETS.executionP90Minutes, 'max'],
    ['completion_rate', 'Terminal completion rate', terminal.length, measures.terminalCompletionRate, COMPANY_OPERATIONS_TARGETS.terminalCompletionRate, 'min'],
    ['durable_result_rate', 'Durable result rate', terminal.length, measures.durableResultRate, COMPANY_OPERATIONS_TARGETS.durableResultRate, 'min'],
    ['budget_compliance_rate', 'Role budget compliance', terminal.length, measures.budgetComplianceRate, COMPANY_OPERATIONS_TARGETS.budgetComplianceRate, 'min'],
    ['boundary_compliance_rate', 'Draft-only boundary compliance', terminal.length, measures.boundaryComplianceRate, COMPANY_OPERATIONS_TARGETS.boundaryComplianceRate, 'min'],
    ['evaluation_coverage_rate', 'Internal evaluation coverage', terminal.length, measures.evaluationCoverageRate, COMPANY_OPERATIONS_TARGETS.evaluationCoverageRate, 'min'],
    ['accepted_evaluation_rate', 'Accepted evaluation rate', evaluated.length, measures.acceptedEvaluationRate, COMPANY_OPERATIONS_TARGETS.acceptedEvaluationRate, 'min'],
  ]
  const targets = definitions.map(([id, label, sample, value, target, direction]) => {
    const met = Number.isFinite(value) && (direction === 'max' ? value <= target : value >= target)
    return { id, label, sample, value, target, direction, state: targetState(sample, met) }
  })
  return { measures: { queueP90Minutes: queueP90, executionP90Minutes: executionP90, ...measures }, targets }
}

export async function buildCompanyOperationsReport(input, options = {}) {
  const fields = onlyFields(input, REPORT_FIELDS)
  if (!fields.ok) return fields
  const clientId = normalizeId(input.clientId, 'company_invalid_client_id')
  if (isRecord(clientId)) return clientId
  const windowDays = Number(input.windowDays ?? 30)
  if (!COMPANY_OPERATIONS_WINDOWS.includes(windowDays)) {
    return failure('company_operations_invalid_window', { windows: COMPANY_OPERATIONS_WINDOWS })
  }
  const listOrders = options.listCompanyWorkOrders || listCompanyWorkOrders
  const getOrder = options.getCompanyWorkOrder || getCompanyWorkOrder
  let listed
  try { listed = await listOrders({ clientId, limit: MAX_COMPANY_WORK_ORDERS }, options) }
  catch { return failure('company_operations_store_unavailable', { status: 'blocked' }) }
  if (!listed?.ok) return listed || failure('company_operations_store_unavailable', { status: 'blocked' })

  const generatedAt = String(options.now?.() || new Date().toISOString())
  const nowMs = parseTime(generatedAt) ?? Date.now()
  const cutoff = nowMs - windowDays * 86400000
  const listedOrders = Array.isArray(listed.workOrders) ? listed.workOrders : []
  const summaries = listedOrders
    .filter((order) => {
      const created = parseTime(order.createdAt)
      return created !== null && created >= cutoff && created <= nowMs + 300000
    })
  const orders = []
  let unavailableOrders = 0
  for (const summary of summaries) {
    let fetched
    try { fetched = await getOrder({ clientId, workOrderId: summary.workOrderId }, options) }
    catch { fetched = null }
    if (!fetched?.ok || !fetched.workOrder) { unavailableOrders += 1; continue }
    const evaluation = await readEvaluation(summary.workOrderId, options)
    orders.push(evaluateOrder(fetched.workOrder, evaluation, nowMs))
  }

  const terminal = orders.filter((order) => TERMINAL_STATUSES.has(order.status))
  const evaluated = terminal.filter((order) => order.evaluation)
  const { measures, targets } = buildTargets(orders)
  const workforce = buildWorkforce(orders)
  const overduePlanned = orders.filter((order) => order.status === 'planned' && order.ageMinutes > COMPANY_OPERATIONS_TARGETS.queueP90Minutes).length
  const overdueRunning = orders.filter((order) => order.status === 'running' && (
    !order.startedAt
    || minutesBetween(order.startedAt, generatedAt) > COMPANY_OPERATIONS_TARGETS.executionP90Minutes
  )).length
  const counts = {
    total: orders.length,
    planned: orders.filter((order) => order.status === 'planned').length,
    running: orders.filter((order) => order.status === 'running').length,
    cancelled: orders.filter((order) => order.status === 'cancelled').length,
    terminal: terminal.length,
    completed: terminal.filter((order) => order.status === 'completed').length,
    partial: terminal.filter((order) => order.status === 'partial').length,
    blocked: terminal.filter((order) => order.status === 'blocked').length,
    failed: terminal.filter((order) => order.status === 'failed').length,
    evaluated: evaluated.length,
    accepted: evaluated.filter((order) => order.evaluation.verdict === 'accepted').length,
    revisionRequired: evaluated.filter((order) => order.evaluation.verdict === 'revision_required').length,
    missingEvaluation: terminal.length - evaluated.length,
    overduePlanned,
    overdueRunning,
  }
  const requiredTargets = targets
  const sampleReady = requiredTargets.every((target) => target.sample >= COMPANY_OPERATIONS_TARGETS.minimumSamples)
  const readiness = !orders.length ? 'no_orders'
    : !sampleReady ? 'collecting'
      : requiredTargets.every((target) => target.state === 'met') ? 'meeting_targets' : 'at_risk'

  return {
    ok: true,
    mode: 'operations_report',
    clientId,
    generatedAt,
    windowDays,
    readiness,
    counts,
    measures,
    targets,
    workforce,
    attention: {
      overduePlanned,
      overdueRunning,
      failedOrBlocked: counts.failed + counts.blocked,
      revisionRequired: counts.revisionRequired,
      missingEvaluation: counts.missingEvaluation,
    },
    coverage: {
      scope: 'durable_work_orders_only',
      listedOrders: listedOrders.length,
      includedOrders: orders.length,
      unavailableOrders,
      capped: listedOrders.length === MAX_COMPANY_WORK_ORDERS,
      directCyclesExcluded: true,
      cancelledOrdersExcluded: counts.cancelled,
      minimumSamples: COMPANY_OPERATIONS_TARGETS.minimumSamples,
    },
    exposure: {
      rawEvidenceReturned: false,
      modelOutputReturned: false,
      specialistOutputReturned: false,
      customerSlaClaimed: false,
    },
    orders,
  }
}

export default { evaluateCompanyWorkOrder, buildCompanyOperationsReport }
