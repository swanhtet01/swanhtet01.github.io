// Durable, reviewed work orders for the bounded Agent Company cycle runner.
// This layer queues exact plans; it does not invent agents or add another execution engine.

import { createHash, timingSafeEqual } from 'node:crypto'

import { planCompanyCycle, runCompanyCycle } from './agent-company.mjs'
import {
  claimActivity,
  getCachedResponse,
  listActivity,
  putCachedResponse,
  releaseActivityClaim,
} from './store.mjs'

export const MAX_COMPANY_WORK_ORDERS = 40

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/
const FINAL_STATUSES = new Set(['completed', 'partial', 'blocked', 'failed'])
const CREATE_FIELDS = new Set(['clientId', 'cycleId', 'agents', 'evidence', 'roleBudget'])
const LIST_FIELDS = new Set(['clientId', 'limit'])
const GET_FIELDS = new Set(['clientId', 'workOrderId'])
const RUN_FIELDS = new Set(['clientId', 'workOrderId', 'planHash', 'confirmation'])

const failure = (reason, extra = {}) => ({ ok: false, reason, ...extra })
const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)
const recordKey = (workOrderId) => `company-work-order-record:${workOrderId}`

function onlyFields(input, allowed) {
  if (!isRecord(input)) return failure('company_work_order_invalid_request')
  const fields = Object.keys(input).filter((field) => !allowed.has(field)).sort()
  return fields.length ? failure('company_work_order_unknown_field', { fields }) : { ok: true }
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
  if (!/^[a-f0-9]{64}$/.test(String(left)) || !/^[a-f0-9]{64}$/.test(String(right))) return false
  return timingSafeEqual(Buffer.from(String(left), 'hex'), Buffer.from(String(right), 'hex'))
}

function evidenceText(value) {
  return typeof value === 'string' ? value.trim() : JSON.stringify(value)
}

function normalizeStoredInput(input, plan) {
  const evidence = {}
  for (const assignment of plan.assignments) evidence[assignment.agentId] = evidenceText(input.evidence[assignment.agentId])
  return {
    clientId: plan.clientId,
    cycleId: plan.cycleId,
    agents: plan.assignments.map((assignment) => assignment.agentId),
    evidence,
    roleBudget: plan.budget.roleLimit,
  }
}

function publicWorkOrder(record, { includeResult = true } = {}) {
  const result = includeResult && isRecord(record.result) ? record.result : undefined
  return {
    workOrderId: record.workOrderId,
    clientId: record.clientId,
    cycleId: record.cycleId,
    status: record.status,
    planHash: record.planHash,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt || null,
    plan: record.plan,
    evidence: record.plan.assignments.map((assignment) => ({
      agentId: assignment.agentId,
      bytes: assignment.evidenceBytes,
      digest: record.evidenceDigests[assignment.agentId],
    })),
    ...(result ? { result } : {}),
  }
}

async function readWorkOrder(workOrderId, options = {}) {
  const read = options.getWorkOrder || getCachedResponse
  try {
    const record = await read(recordKey(workOrderId))
    return isRecord(record) && record.workOrderId === workOrderId ? record : null
  } catch {
    return null
  }
}

export async function createCompanyWorkOrder(input, options = {}) {
  const fields = onlyFields(input, CREATE_FIELDS)
  if (!fields.ok) return fields
  const planCycle = options.planCompanyCycle || planCompanyCycle
  const plan = await planCycle(input)
  if (!plan.ok) return plan

  let storedInput
  try { storedInput = normalizeStoredInput(input, plan) }
  catch { return failure('company_work_order_invalid_evidence') }
  const planHash = sha256(stableStringify(storedInput))
  const workOrderId = `company-order:${String(plan.runId).split(':').pop()}`
  const evidenceDigests = Object.fromEntries(
    Object.entries(storedInput.evidence).map(([agentId, evidence]) => [agentId, sha256(evidence)]),
  )

  const reserve = options.claimActivity || claimActivity
  const release = options.releaseActivityClaim || releaseActivityClaim
  const save = options.putWorkOrder || putCachedResponse
  const requireDurableClaim = options.requireDurableClaim !== false
  let claim
  try {
    claim = await reserve({
      id: workOrderId,
      kind: 'agent_company_work_order',
      summary: `${plan.assignments.length} specialists queued for cycle ${plan.cycleId}`,
      ref: plan.clientId,
    })
  } catch {
    claim = { fresh: false, durable: false }
  }
  if (!claim?.fresh) {
    if (!claim?.durable) return failure('company_work_order_store_unavailable', { status: 'blocked' })
    const existing = await readWorkOrder(workOrderId, options)
    if (!existing) return failure('company_work_order_already_claimed', { status: 'duplicate', workOrderId })
    if (!sameHash(existing.planHash, planHash)) {
      return failure('company_work_order_conflict', { status: 'conflict', workOrderId })
    }
    return { ok: true, mode: 'work_order_create', replayed: true, workOrder: publicWorkOrder(existing) }
  }
  if (requireDurableClaim && !claim.durable) {
    try { await release(workOrderId) } catch { /* no evidence was persisted */ }
    return failure('company_work_order_durable_claim_required', { status: 'blocked', workOrderId })
  }

  const now = String(options.now?.() || new Date().toISOString())
  const record = {
    version: 1,
    workOrderId,
    clientId: plan.clientId,
    cycleId: plan.cycleId,
    status: 'planned',
    planHash,
    createdAt: now,
    updatedAt: now,
    plan,
    evidenceDigests,
    input: storedInput,
  }
  let stored = false
  try { stored = Boolean(await save(recordKey(workOrderId), record)) }
  catch { stored = false }
  if (!stored) {
    try { await release(workOrderId) } catch { /* allow an explicit retry */ }
    return failure('company_work_order_store_unavailable', { status: 'blocked', workOrderId })
  }
  return { ok: true, mode: 'work_order_create', replayed: false, workOrder: publicWorkOrder(record) }
}

export async function getCompanyWorkOrder(input, options = {}) {
  const fields = onlyFields(input, GET_FIELDS)
  if (!fields.ok) return fields
  const clientId = normalizeId(input.clientId, 'company_invalid_client_id')
  if (isRecord(clientId)) return clientId
  const workOrderId = normalizeId(input.workOrderId, 'company_work_order_invalid_id')
  if (isRecord(workOrderId)) return workOrderId
  const record = await readWorkOrder(workOrderId, options)
  if (!record || record.clientId !== clientId) return failure('company_work_order_not_found')
  return { ok: true, mode: 'work_order_get', workOrder: publicWorkOrder(record) }
}

export async function listCompanyWorkOrders(input, options = {}) {
  const fields = onlyFields(input, LIST_FIELDS)
  if (!fields.ok) return fields
  const clientId = normalizeId(input.clientId, 'company_invalid_client_id')
  if (isRecord(clientId)) return clientId
  const requestedLimit = input.limit === undefined ? 20 : Number(input.limit)
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > MAX_COMPANY_WORK_ORDERS) {
    return failure('company_work_order_invalid_limit', { maxWorkOrders: MAX_COMPANY_WORK_ORDERS })
  }
  const readActivity = options.listActivity || listActivity
  let activity
  try {
    activity = await readActivity(requestedLimit, {
      kind: 'agent_company_work_order',
      ref: clientId,
    })
  }
  catch { return failure('company_work_order_store_unavailable', { status: 'blocked' }) }

  const workOrders = []
  for (const item of Array.isArray(activity) ? activity : []) {
    if (item.kind !== 'agent_company_work_order' || item.ref !== clientId) continue
    const record = await readWorkOrder(String(item.id || ''), options)
    if (!record || record.clientId !== clientId) continue
    workOrders.push(publicWorkOrder(record, { includeResult: false }))
    if (workOrders.length >= requestedLimit) break
  }
  return { ok: true, mode: 'work_order_list', clientId, workOrders }
}

export async function runCompanyWorkOrder(input, options = {}) {
  const fields = onlyFields(input, RUN_FIELDS)
  if (!fields.ok) return fields
  const clientId = normalizeId(input.clientId, 'company_invalid_client_id')
  if (isRecord(clientId)) return clientId
  const workOrderId = normalizeId(input.workOrderId, 'company_work_order_invalid_id')
  if (isRecord(workOrderId)) return workOrderId
  const record = await readWorkOrder(workOrderId, options)
  if (!record || record.clientId !== clientId) return failure('company_work_order_not_found')
  if (!sameHash(input.planHash, record.planHash)) {
    return failure('company_work_order_plan_mismatch', { status: 'conflict', workOrderId })
  }
  if (String(input.confirmation || '') !== `RUN ${workOrderId}`) {
    return failure('company_work_order_confirmation_required', {
      workOrderId,
      confirmation: `RUN ${workOrderId}`,
    })
  }
  if (FINAL_STATUSES.has(record.status) && isRecord(record.result)) {
    return {
      ok: true,
      mode: 'work_order_run',
      replayed: true,
      workOrder: publicWorkOrder(record),
      cycleResult: record.result,
    }
  }
  if (!isRecord(record.input)) return failure('company_work_order_input_unavailable', { status: 'blocked', workOrderId })

  const save = options.putWorkOrder || putCachedResponse
  const now = () => String(options.now?.() || new Date().toISOString())
  const running = { ...record, status: 'running', updatedAt: now() }
  let runningStored = false
  try { runningStored = Boolean(await save(recordKey(workOrderId), running)) }
  catch { runningStored = false }
  if (!runningStored) return failure('company_work_order_store_unavailable', { status: 'blocked', workOrderId })

  const execute = options.runCompanyCycle || runCompanyCycle
  let result
  try { result = await execute(record.input) }
  catch { result = failure('company_work_order_dispatch_failed', { status: 'failed' }) }

  if (result.reason === 'company_claim_unavailable' || result.reason === 'company_durable_claim_required') {
    const retryable = { ...running, status: 'planned', updatedAt: now(), lastDispatch: { reason: result.reason } }
    try { await save(recordKey(workOrderId), retryable) } catch { /* next read reports running */ }
    return failure(result.reason, { status: 'blocked', workOrderId, workOrder: publicWorkOrder(retryable) })
  }
  if (result.reason === 'company_cycle_already_claimed') {
    const latest = await readWorkOrder(workOrderId, options) || running
    return failure('company_work_order_running', {
      status: 'duplicate',
      workOrderId,
      recoveredResults: result.recoveredResults || [],
      workOrder: publicWorkOrder(latest),
    })
  }

  const status = FINAL_STATUSES.has(result.status) ? result.status : (result.ok ? 'completed' : 'failed')
  const finished = {
    ...running,
    status,
    updatedAt: now(),
    completedAt: now(),
    input: null,
    result,
  }
  let finalStored = false
  try { finalStored = Boolean(await save(recordKey(workOrderId), finished)) }
  catch { finalStored = false }
  if (!finalStored) {
    return failure('company_work_order_state_unavailable', {
      status: 'recovery_required',
      workOrderId,
      cycleResult: result,
      workOrder: publicWorkOrder(finished),
    })
  }
  return {
    ok: true,
    mode: 'work_order_run',
    replayed: Boolean(result.replayed),
    workOrder: publicWorkOrder(finished),
    cycleResult: result,
  }
}

export default {
  createCompanyWorkOrder,
  getCompanyWorkOrder,
  listCompanyWorkOrders,
  runCompanyWorkOrder,
}
