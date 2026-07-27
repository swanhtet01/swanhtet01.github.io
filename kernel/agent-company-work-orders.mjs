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
  transitionCachedResponse,
} from './store.mjs'

export const MAX_COMPANY_WORK_ORDERS = 40

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/
const FINAL_STATUSES = new Set(['completed', 'partial', 'blocked', 'failed'])
const REVIEWABLE_STATUSES = new Set(['completed', 'partial'])
const CREATE_FIELDS = new Set(['clientId', 'cycleId', 'agents', 'evidence', 'roleBudget'])
const LIST_FIELDS = new Set(['clientId', 'limit'])
const GET_FIELDS = new Set(['clientId', 'workOrderId'])
const RUN_FIELDS = new Set(['clientId', 'workOrderId', 'planHash', 'confirmation'])
const CANCEL_FIELDS = new Set(['clientId', 'workOrderId', 'planHash', 'confirmation'])
const PROOF_FIELDS = new Set(['clientId', 'workOrderId'])
const REVIEW_FIELDS = new Set([
  'clientId',
  'workOrderId',
  'resultHash',
  'decision',
  'reviewerName',
  'source',
  'statement',
  'recordedBy',
  'confirmation',
])
const REVIEW_DECISIONS = new Set(['accepted', 'changes_requested'])
const REVIEW_SOURCES = new Set(['email', 'chat', 'call', 'in_person', 'customer_session'])
const OPERATOR_RECORDED_REVIEW_BINDING = 'operator_recorded_customer_review'
const CUSTOMER_SESSION_REVIEW_BINDING = 'tenant_bound_customer_session'

const failure = (reason, extra = {}) => ({ ok: false, reason, ...extra })
const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)
const recordKey = (workOrderId) => `company-work-order-record:${workOrderId}`
const reviewRecordKey = (workOrderId) => `company-work-order-review-record:${workOrderId}`

function onlyFields(input, allowed) {
  if (!isRecord(input)) return failure('company_work_order_invalid_request')
  const fields = Object.keys(input).filter((field) => !allowed.has(field)).sort()
  return fields.length ? failure('company_work_order_unknown_field', { fields }) : { ok: true }
}

function normalizeId(value, reason) {
  const normalized = String(value || '').trim()
  return ID_RE.test(normalized) ? normalized : failure(reason)
}

function normalizeLine(value, maxLength, reason) {
  const normalized = String(value || '').trim()
  if (!normalized || normalized.length > maxLength || /[\r\n\u0000-\u001f\u007f]/.test(normalized)) return failure(reason)
  return normalized
}

function normalizeStatement(value) {
  const normalized = String(value || '').trim()
  if (!normalized || normalized.length > 1200 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)) {
    return failure('company_work_order_review_invalid_statement')
  }
  return normalized
}

function normalizeReviewProvenance(value) {
  if (value === undefined) {
    return {
      ok: true,
      binding: OPERATOR_RECORDED_REVIEW_BINDING,
      customerAuthenticated: false,
      authenticatedReviewerId: null,
    }
  }
  if (!isRecord(value)
    || Object.keys(value).sort().join(',') !== 'authenticatedReviewerId,binding,customerAuthenticated'
    || value.binding !== CUSTOMER_SESSION_REVIEW_BINDING
    || value.customerAuthenticated !== true) {
    return failure('company_work_order_review_provenance_invalid')
  }
  const authenticatedReviewerId = normalizeLine(
    value.authenticatedReviewerId,
    120,
    'company_work_order_review_provenance_invalid',
  )
  if (isRecord(authenticatedReviewerId)) return authenticatedReviewerId
  return {
    ok: true,
    binding: CUSTOMER_SESSION_REVIEW_BINDING,
    customerAuthenticated: true,
    authenticatedReviewerId,
  }
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex')
}

const reviewClaimId = (workOrderId) => `company-work-order-review:${sha256(workOrderId).slice(0, 40)}`

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
    startedAt: record.startedAt || null,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt || null,
    dispatchAttempts: Number(record.dispatchAttempts || 0),
    cancelledAt: record.cancelledAt || null,
    evidenceState: record.input === null ? 'scrubbed' : 'retained',
    plan: record.plan,
    evidence: record.plan.assignments.map((assignment) => ({
      agentId: assignment.agentId,
      bytes: assignment.evidenceBytes,
      digest: record.evidenceDigests[assignment.agentId],
    })),
    ...(result ? { result, resultHash: sha256(stableStringify(result)) } : {}),
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

async function transitionWorkOrder(record, nextRecord, options = {}) {
  const transition = options.transitionWorkOrder || transitionCachedResponse
  try {
    const result = await transition(recordKey(record.workOrderId), {
      status: record.status,
      planHash: record.planHash,
    }, nextRecord)
    return isRecord(result) ? result : { updated: false, reason: 'store_unavailable' }
  } catch {
    return { updated: false, reason: 'store_unavailable' }
  }
}

async function readWorkOrderReview(workOrderId, options = {}) {
  const read = options.getWorkOrderReview || options.getWorkOrder || getCachedResponse
  try {
    const record = await read(reviewRecordKey(workOrderId))
    return isRecord(record) && record.workOrderId === workOrderId ? record : null
  } catch {
    return null
  }
}

function publicWorkOrderReview(record) {
  if (!isRecord(record)) return null
  const customerAuthenticated = record.binding === CUSTOMER_SESSION_REVIEW_BINDING
    && record.customerAuthenticated === true
  return {
    reviewId: record.reviewId,
    binding: customerAuthenticated ? CUSTOMER_SESSION_REVIEW_BINDING : OPERATOR_RECORDED_REVIEW_BINDING,
    customerAuthenticated,
    ...(customerAuthenticated && record.authenticatedReviewerId
      ? { authenticatedReviewerId: record.authenticatedReviewerId }
      : {}),
    decision: record.decision,
    reviewerName: record.reviewerName,
    source: record.source,
    statement: record.statement,
    recordedBy: record.recordedBy,
    recordedAt: record.recordedAt,
    resultHash: record.resultHash,
    reviewHash: record.reviewHash,
  }
}

function deliveryResults(record) {
  const assignments = Array.isArray(record.plan?.assignments) ? record.plan.assignments : []
  const assignmentByAgent = new Map(assignments.map((assignment) => [assignment.agentId, assignment]))
  const results = Array.isArray(record.result?.results) ? record.result.results : []
  return results.map((result) => {
    const assignment = assignmentByAgent.get(result.agentId) || {}
    return {
      agentId: String(result.agentId || ''),
      name: String(assignment.name || result.agentId || ''),
      department: String(result.department || assignment.department || ''),
      status: String(result.status || 'unknown'),
      ...(result.output !== undefined ? { output: result.output } : {}),
      ...(result.reason ? { reason: String(result.reason).slice(0, 120) } : {}),
    }
  })
}

function buildDeliveryProof(record, review = null) {
  const exactResultHash = sha256(stableStringify(record.result))
  const results = deliveryResults(record)
  const packet = {
    version: 1,
    kind: 'agent_company_delivery_proof',
    workOrder: {
      workOrderId: record.workOrderId,
      clientId: record.clientId,
      cycleId: record.cycleId,
      status: record.status,
      planHash: record.planHash,
      createdAt: record.createdAt,
      completedAt: record.completedAt || null,
    },
    delivery: {
      resultHash: exactResultHash,
      status: record.result.status,
      actionMode: record.result.actionMode || record.plan?.actionMode || 'draft_only',
      specialists: results,
      budget: {
        plannedRoleCalls: Number(record.plan?.budget?.plannedRoles || 0),
        usedRoleCalls: Number(record.result?.budget?.usedRoleCalls || 0),
      },
    },
    evidenceFingerprints: record.plan.assignments.map((assignment) => ({
      agentId: assignment.agentId,
      bytes: assignment.evidenceBytes,
      digest: record.evidenceDigests[assignment.agentId],
    })),
    controls: {
      approvalRequired: record.plan?.approvalRequired === true,
      execution: record.plan?.controls?.execution || 'sequential',
      dynamicDelegation: record.plan?.controls?.dynamicDelegation === true,
      crossAgentContext: record.plan?.controls?.crossAgentContext === true,
      externalWrites: record.plan?.controls?.externalWrites === true,
      rawEvidenceIncluded: false,
    },
    review: publicWorkOrderReview(review),
  }
  return { ...packet, packetHash: sha256(stableStringify(packet)) }
}

function reviewConfirmation(decision, workOrderId, resultHash) {
  const command = decision === 'accepted' ? 'ACCEPT' : 'REQUEST CHANGES'
  return `${command} ${workOrderId} ${resultHash}`
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
  const review = await readWorkOrderReview(workOrderId, options)
  return {
    ok: true,
    mode: 'work_order_get',
    workOrder: { ...publicWorkOrder(record), review: publicWorkOrderReview(review) },
  }
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
  if (record.status === 'cancelled') {
    if (record.input !== null || record.cancellation?.evidenceScrubbed !== true) {
      return failure('company_work_order_state_unavailable', { status: 'recovery_required', workOrderId })
    }
    return failure('company_work_order_cancelled', {
      status: 'conflict',
      workOrderId,
      workOrder: publicWorkOrder(record),
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
  let running = record
  if (record.status === 'planned') {
    const dispatchAt = now()
    const candidate = {
      ...record,
      status: 'running',
      startedAt: record.startedAt || dispatchAt,
      dispatchAttempts: Number(record.dispatchAttempts || 0) + 1,
      updatedAt: dispatchAt,
    }
    const transitioned = await transitionWorkOrder(record, candidate, options)
    if (!transitioned.updated) {
      const latest = await readWorkOrder(workOrderId, options)
      if (!latest) return failure('company_work_order_store_unavailable', { status: 'blocked', workOrderId })
      if (latest.status === 'cancelled') {
        if (latest.input !== null || latest.cancellation?.evidenceScrubbed !== true) {
          return failure('company_work_order_state_unavailable', { status: 'recovery_required', workOrderId })
        }
        return failure('company_work_order_cancelled', {
          status: 'conflict',
          workOrderId,
          workOrder: publicWorkOrder(latest),
        })
      }
      if (FINAL_STATUSES.has(latest.status) && isRecord(latest.result)) {
        return {
          ok: true,
          mode: 'work_order_run',
          replayed: true,
          workOrder: publicWorkOrder(latest),
          cycleResult: latest.result,
        }
      }
      if (latest.status === 'running') {
        return failure('company_work_order_running', {
          status: 'duplicate',
          workOrderId,
          workOrder: publicWorkOrder(latest),
        })
      }
      const reason = transitioned.reason === 'store_unavailable'
        ? 'company_work_order_store_unavailable'
        : 'company_work_order_transition_conflict'
      return failure(reason, { status: transitioned.reason === 'store_unavailable' ? 'blocked' : 'conflict', workOrderId })
    }
    running = candidate
  } else if (record.status !== 'running') {
    return failure('company_work_order_invalid_state', { status: 'conflict', workOrderId })
  }

  const execute = options.runCompanyCycle || runCompanyCycle
  let result
  try { result = await execute(record.input) }
  catch { result = failure('company_work_order_dispatch_failed', { status: 'failed' }) }

  if ([
    'company_claim_unavailable',
    'company_durable_claim_required',
    'company_capacity_unavailable',
    'company_capacity_exhausted',
  ].includes(result.reason)) {
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
  const completedAt = now()
  const finished = {
    ...running,
    status,
    updatedAt: completedAt,
    completedAt,
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

export async function cancelCompanyWorkOrder(input, options = {}) {
  const fields = onlyFields(input, CANCEL_FIELDS)
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
  const confirmation = `CANCEL AND SCRUB ${workOrderId} ${record.planHash}`
  if (String(input.confirmation || '') !== confirmation) {
    return failure('company_work_order_cancel_confirmation_required', { workOrderId, confirmation })
  }
  if (record.status === 'cancelled') {
    if (record.input !== null || record.cancellation?.evidenceScrubbed !== true) {
      return failure('company_work_order_state_unavailable', { status: 'recovery_required', workOrderId })
    }
    return {
      ok: true,
      mode: 'work_order_cancel',
      replayed: true,
      workOrder: publicWorkOrder(record),
    }
  }
  if (record.status !== 'planned' || !isRecord(record.input)) {
    return failure('company_work_order_cancel_not_allowed', {
      status: 'conflict',
      workOrderId,
      workOrder: publicWorkOrder(record),
    })
  }

  const now = String(options.now?.() || new Date().toISOString())
  const cancelled = {
    ...record,
    status: 'cancelled',
    updatedAt: now,
    cancelledAt: now,
    input: null,
    cancellation: {
      evidenceScrubbed: true,
      modelRequested: false,
    },
  }
  const transitioned = await transitionWorkOrder(record, cancelled, options)
  if (!transitioned.updated) {
    const latest = await readWorkOrder(workOrderId, options)
    if (!latest) return failure('company_work_order_store_unavailable', { status: 'blocked', workOrderId })
    if (latest.status === 'cancelled' && sameHash(latest.planHash, record.planHash)) {
      if (latest.input !== null || latest.cancellation?.evidenceScrubbed !== true) {
        return failure('company_work_order_state_unavailable', { status: 'recovery_required', workOrderId })
      }
      return {
        ok: true,
        mode: 'work_order_cancel',
        replayed: true,
        workOrder: publicWorkOrder(latest),
      }
    }
    if (latest.status !== 'planned') {
      return failure('company_work_order_cancel_not_allowed', {
        status: 'conflict',
        workOrderId,
        workOrder: publicWorkOrder(latest),
      })
    }
    const reason = transitioned.reason === 'store_unavailable'
      ? 'company_work_order_store_unavailable'
      : 'company_work_order_transition_conflict'
    return failure(reason, { status: transitioned.reason === 'store_unavailable' ? 'blocked' : 'conflict', workOrderId })
  }
  return {
    ok: true,
    mode: 'work_order_cancel',
    replayed: false,
    workOrder: publicWorkOrder(cancelled),
  }
}

export async function getCompanyWorkOrderProof(input, options = {}) {
  const fields = onlyFields(input, PROOF_FIELDS)
  if (!fields.ok) return fields
  const clientId = normalizeId(input.clientId, 'company_invalid_client_id')
  if (isRecord(clientId)) return clientId
  const workOrderId = normalizeId(input.workOrderId, 'company_work_order_invalid_id')
  if (isRecord(workOrderId)) return workOrderId
  const record = await readWorkOrder(workOrderId, options)
  if (!record || record.clientId !== clientId) return failure('company_work_order_not_found')
  if (!REVIEWABLE_STATUSES.has(record.status) || !isRecord(record.result)) {
    return failure('company_work_order_proof_unavailable', { status: record.status, workOrderId })
  }
  if (record.input !== null) {
    return failure('company_work_order_state_unavailable', { status: 'recovery_required', workOrderId })
  }
  const review = await readWorkOrderReview(workOrderId, options)
  return {
    ok: true,
    mode: 'work_order_proof',
    reviewState: review ? review.decision : 'unreviewed',
    proofPacket: buildDeliveryProof(record, review),
  }
}

export async function reviewCompanyWorkOrder(input, options = {}) {
  const fields = onlyFields(input, REVIEW_FIELDS)
  if (!fields.ok) return fields
  const clientId = normalizeId(input.clientId, 'company_invalid_client_id')
  if (isRecord(clientId)) return clientId
  const workOrderId = normalizeId(input.workOrderId, 'company_work_order_invalid_id')
  if (isRecord(workOrderId)) return workOrderId
  const record = await readWorkOrder(workOrderId, options)
  if (!record || record.clientId !== clientId) return failure('company_work_order_not_found')
  if (!REVIEWABLE_STATUSES.has(record.status) || !isRecord(record.result)) {
    return failure('company_work_order_not_reviewable', { status: record.status, workOrderId })
  }
  if (record.input !== null) {
    return failure('company_work_order_state_unavailable', { status: 'recovery_required', workOrderId })
  }

  const exactResultHash = sha256(stableStringify(record.result))
  if (!sameHash(input.resultHash, exactResultHash)) {
    return failure('company_work_order_review_result_mismatch', { status: 'conflict', workOrderId })
  }
  const decision = String(input.decision || '').trim()
  if (!REVIEW_DECISIONS.has(decision)) return failure('company_work_order_review_invalid_decision')
  const source = String(input.source || '').trim()
  if (!REVIEW_SOURCES.has(source)) return failure('company_work_order_review_invalid_source')
  const reviewerName = normalizeLine(input.reviewerName, 120, 'company_work_order_review_invalid_reviewer')
  if (isRecord(reviewerName)) return reviewerName
  const recordedBy = normalizeLine(input.recordedBy, 120, 'company_work_order_review_invalid_recorder')
  if (isRecord(recordedBy)) return recordedBy
  const statement = normalizeStatement(input.statement)
  if (isRecord(statement)) return statement
  const provenance = normalizeReviewProvenance(options.reviewProvenance)
  if (!provenance.ok) return provenance
  if (source === 'customer_session' && !provenance.customerAuthenticated) {
    return failure('company_work_order_review_provenance_required')
  }
  if (provenance.customerAuthenticated
    && (source !== 'customer_session'
      || reviewerName !== provenance.authenticatedReviewerId
      || recordedBy !== provenance.authenticatedReviewerId)) {
    return failure('company_work_order_review_provenance_mismatch')
  }
  const requiredConfirmation = reviewConfirmation(decision, workOrderId, exactResultHash)
  if (String(input.confirmation || '') !== requiredConfirmation) {
    return failure('company_work_order_review_confirmation_required', {
      workOrderId,
      confirmation: requiredConfirmation,
    })
  }

  const reviewInput = {
    workOrderId,
    clientId,
    resultHash: exactResultHash,
    decision,
    reviewerName,
    source,
    statement,
    recordedBy,
    ...(provenance.customerAuthenticated
      ? {
          binding: provenance.binding,
          customerAuthenticated: true,
          authenticatedReviewerId: provenance.authenticatedReviewerId,
        }
      : {}),
  }
  const reviewHash = sha256(stableStringify(reviewInput))
  const reviewId = reviewClaimId(workOrderId)
  const reserve = options.claimActivity || claimActivity
  const release = options.releaseActivityClaim || releaseActivityClaim
  const save = options.putWorkOrderReview || options.putWorkOrder || putCachedResponse
  const requireDurableClaim = options.requireDurableClaim !== false
  let claim
  try {
    claim = await reserve({
      id: reviewId,
      kind: 'agent_company_work_order_review',
      summary: `${decision} review recorded for cycle ${record.cycleId}`,
      ref: clientId,
    })
  } catch {
    claim = { fresh: false, durable: false }
  }
  if (!claim?.fresh) {
    if (!claim?.durable) return failure('company_work_order_review_store_unavailable', { status: 'blocked' })
    const existing = await readWorkOrderReview(workOrderId, options)
    if (!existing) return failure('company_work_order_review_already_claimed', { status: 'duplicate', workOrderId })
    if (!sameHash(existing.reviewHash, reviewHash)) {
      return failure('company_work_order_review_conflict', { status: 'conflict', workOrderId })
    }
    return {
      ok: true,
      mode: 'work_order_review',
      replayed: true,
      review: publicWorkOrderReview(existing),
      proofPacket: buildDeliveryProof(record, existing),
    }
  }
  if (requireDurableClaim && !claim.durable) {
    try { await release(reviewId) } catch { /* no review was persisted */ }
    return failure('company_work_order_review_durable_claim_required', { status: 'blocked', workOrderId })
  }

  const storedReview = {
    version: 1,
    reviewId,
    ...reviewInput,
    reviewHash,
    binding: provenance.binding,
    customerAuthenticated: provenance.customerAuthenticated,
    ...(provenance.authenticatedReviewerId
      ? { authenticatedReviewerId: provenance.authenticatedReviewerId }
      : {}),
    recordedAt: String(options.now?.() || new Date().toISOString()),
  }
  let stored = false
  try { stored = Boolean(await save(reviewRecordKey(workOrderId), storedReview)) }
  catch { stored = false }
  if (!stored) {
    try { await release(reviewId) } catch { /* allow an explicit retry */ }
    return failure('company_work_order_review_store_unavailable', { status: 'blocked', workOrderId })
  }
  return {
    ok: true,
    mode: 'work_order_review',
    replayed: false,
    review: publicWorkOrderReview(storedReview),
    proofPacket: buildDeliveryProof(record, storedReview),
  }
}

export default {
  cancelCompanyWorkOrder,
  createCompanyWorkOrder,
  getCompanyWorkOrderProof,
  getCompanyWorkOrder,
  listCompanyWorkOrders,
  reviewCompanyWorkOrder,
  runCompanyWorkOrder,
}
