// Durable staged delegation for fixed Agent Company playbooks.
// Missions never dispatch models automatically and never persist raw stage-to-stage handoffs.

import { createHash, timingSafeEqual } from 'node:crypto'

import { getCompanyWorkOrderEvaluation } from './agent-company-operations.mjs'
import { planCompanyPlaybook } from './agent-company-playbooks.mjs'
import {
  createCompanyWorkOrder,
  getCompanyWorkOrder,
} from './agent-company-work-orders.mjs'
import {
  MAX_CREW_UNTRUSTED_BYTES,
  MAX_CREW_UNTRUSTED_CHARS,
} from './crew-run.mjs'
import {
  claimActivity,
  getCachedResponse,
  listActivity,
  putCachedResponse,
  releaseActivityClaim,
  transitionCachedResponse,
} from './store.mjs'

export const MAX_COMPANY_MISSIONS = 20

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/
const HASH_RE = /^[a-f0-9]{64}$/
const CREATE_FIELDS = new Set(['clientId', 'missionId', 'playbookId'])
const LIST_FIELDS = new Set(['clientId', 'limit'])
const GET_FIELDS = new Set(['clientId', 'missionRunId'])
const QUEUE_FIELDS = new Set([
  'clientId',
  'missionRunId',
  'missionPlanHash',
  'stageId',
  'evidence',
  'confirmation',
])
const ADVANCE_FIELDS = new Set([
  'clientId',
  'missionRunId',
  'missionPlanHash',
  'stageId',
  'workOrderId',
  'resultHash',
  'nextStageEvidence',
  'confirmation',
])
const ACCEPTED_ORDER_STATUSES = new Set(['completed', 'partial'])
const ACCEPTANCE_CHECKS = Object.freeze(['accurate', 'complete', 'usable', 'boundarySafe'])

const failure = (reason, extra = {}) => ({ ok: false, reason, ...extra })
const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)
const missionKey = (missionRunId) => `company-mission-record:${missionRunId}`

function onlyFields(input, allowed) {
  if (!isRecord(input)) return failure('company_mission_invalid_request')
  const fields = Object.keys(input).filter((field) => !allowed.has(field)).sort()
  return fields.length ? failure('company_mission_unknown_field', { fields }) : { ok: true }
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

function normalizeEvidence(value, reason = 'company_mission_invalid_evidence') {
  let text
  try { text = typeof value === 'string' ? value.trim() : JSON.stringify(value) }
  catch { return failure(reason) }
  if (!text) return failure(reason)
  const bytes = Buffer.byteLength(text, 'utf8')
  if (text.length > MAX_CREW_UNTRUSTED_CHARS || bytes > MAX_CREW_UNTRUSTED_BYTES) {
    return failure('company_mission_evidence_too_large', {
      maxChars: MAX_CREW_UNTRUSTED_CHARS,
      maxBytes: MAX_CREW_UNTRUSTED_BYTES,
    })
  }
  return { ok: true, text, bytes, digest: sha256(text) }
}

function publicStage(stage) {
  return {
    number: stage.number,
    stageId: stage.stageId,
    cycleId: stage.cycleId,
    key: stage.key,
    name: stage.name,
    objective: stage.objective,
    agentId: stage.agentId,
    agentName: stage.agentName,
    department: stage.department,
    crew: stage.crew,
    crewVersion: stage.crewVersion,
    roleBudget: stage.roleBudget,
    roles: stage.roles,
    returns: stage.returns,
    evidenceHint: stage.evidenceHint,
    gate: stage.gate,
    handoffFrom: stage.handoffFrom,
    status: stage.status,
    workOrderId: stage.workOrderId || null,
    workOrderPlanHash: stage.workOrderPlanHash || null,
    evidenceDigest: stage.evidenceDigest || null,
    evidenceBytes: stage.evidenceBytes || null,
    approvedInputDigest: stage.approvedInputDigest || null,
    approvedInputBytes: stage.approvedInputBytes || null,
    resultHash: stage.resultHash || null,
    evaluationHash: stage.evaluationHash || null,
    queuedAt: stage.queuedAt || null,
    acceptedAt: stage.acceptedAt || null,
  }
}

function publicMission(record) {
  return {
    missionRunId: record.missionRunId,
    clientId: record.clientId,
    missionId: record.missionId,
    status: record.status,
    revision: record.revision,
    planHash: record.planHash,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt || null,
    currentStageNumber: record.currentStageNumber,
    playbook: record.plan.playbook,
    budget: record.plan.budget,
    controls: {
      ...record.plan.controls,
      durableMission: true,
      serverVerifiedStageGates: true,
      rawHandoffsStored: false,
    },
    stages: record.stages.map(publicStage),
  }
}

async function readMission(missionRunId, options = {}) {
  const read = options.getMission || getCachedResponse
  try {
    const record = await read(missionKey(missionRunId))
    return isRecord(record) && record.missionRunId === missionRunId ? record : null
  } catch {
    return null
  }
}

async function transitionMission(record, nextRecord, options = {}) {
  const transition = options.transitionMission || transitionCachedResponse
  try {
    const result = await transition(missionKey(record.missionRunId), {
      status: record.status,
      planHash: record.planHash,
      revision: record.revision,
    }, nextRecord)
    return isRecord(result) ? result : { updated: false, durable: false, reason: 'store_unavailable' }
  } catch {
    return { updated: false, durable: false, reason: 'store_unavailable' }
  }
}

function missionRecordFromPlan(plan, now) {
  return {
    version: 1,
    missionRunId: plan.missionRunId,
    clientId: plan.clientId,
    missionId: plan.missionId,
    status: 'active',
    revision: 1,
    planHash: plan.planHash,
    createdAt: now,
    updatedAt: now,
    currentStageNumber: 1,
    plan,
    stages: plan.stages.map((stage, index) => ({
      ...stage,
      status: index === 0 ? 'ready' : 'locked',
      workOrderId: null,
      workOrderPlanHash: null,
      evidenceDigest: null,
      evidenceBytes: null,
      approvedInputDigest: null,
      approvedInputBytes: null,
      resultHash: null,
      evaluationHash: null,
      queuedAt: null,
      acceptedAt: null,
    })),
  }
}

export async function createCompanyMission(input, options = {}) {
  const fields = onlyFields(input, CREATE_FIELDS)
  if (!fields.ok) return fields
  const planPlaybook = options.planCompanyPlaybook || planCompanyPlaybook
  const plan = await planPlaybook(input)
  if (!plan?.ok) return plan || failure('company_mission_plan_unavailable')

  const reserve = options.claimActivity || claimActivity
  const release = options.releaseActivityClaim || releaseActivityClaim
  const save = options.putMission || putCachedResponse
  const requireDurableClaim = options.requireDurableClaim !== false
  let claim
  try {
    claim = await reserve({
      id: plan.missionRunId,
      kind: 'agent_company_mission',
      summary: `${plan.stages.length} reviewed stages for ${plan.playbook.name}`,
      ref: plan.clientId,
    })
  } catch {
    claim = { fresh: false, durable: false }
  }
  if (!claim?.fresh) {
    if (!claim?.durable) return failure('company_mission_store_unavailable', { status: 'blocked' })
    const existing = await readMission(plan.missionRunId, options)
    if (!existing) return failure('company_mission_already_claimed', { status: 'duplicate', missionRunId: plan.missionRunId })
    if (existing.clientId !== plan.clientId || !sameHash(existing.planHash, plan.planHash)) {
      return failure('company_mission_conflict', { status: 'conflict', missionRunId: plan.missionRunId })
    }
    return { ok: true, mode: 'mission_create', replayed: true, durableMissionCreated: true, mission: publicMission(existing) }
  }
  if (requireDurableClaim && !claim.durable) {
    try { await release(plan.missionRunId) } catch { /* no mission was persisted */ }
    return failure('company_mission_durable_claim_required', { status: 'blocked', missionRunId: plan.missionRunId })
  }

  const record = missionRecordFromPlan(plan, String(options.now?.() || new Date().toISOString()))
  let stored = false
  try { stored = Boolean(await save(missionKey(record.missionRunId), record)) }
  catch { stored = false }
  if (!stored) {
    try { await release(record.missionRunId) } catch { /* allow explicit retry */ }
    return failure('company_mission_store_unavailable', { status: 'blocked', missionRunId: record.missionRunId })
  }
  return { ok: true, mode: 'mission_create', replayed: false, durableMissionCreated: true, mission: publicMission(record) }
}

export async function getCompanyMission(input, options = {}) {
  const fields = onlyFields(input, GET_FIELDS)
  if (!fields.ok) return fields
  const clientId = normalizeId(input.clientId, 'company_invalid_client_id')
  if (isRecord(clientId)) return clientId
  const missionRunId = normalizeId(input.missionRunId, 'company_mission_invalid_id')
  if (isRecord(missionRunId)) return missionRunId
  const record = await readMission(missionRunId, options)
  if (!record || record.clientId !== clientId) return failure('company_mission_not_found')
  return { ok: true, mode: 'mission_get', mission: publicMission(record) }
}

export async function listCompanyMissions(input, options = {}) {
  const fields = onlyFields(input, LIST_FIELDS)
  if (!fields.ok) return fields
  const clientId = normalizeId(input.clientId, 'company_invalid_client_id')
  if (isRecord(clientId)) return clientId
  const requestedLimit = input.limit === undefined ? 10 : Number(input.limit)
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > MAX_COMPANY_MISSIONS) {
    return failure('company_mission_invalid_limit', { maxMissions: MAX_COMPANY_MISSIONS })
  }
  const readActivity = options.listActivity || listActivity
  let activity
  try {
    activity = await readActivity(requestedLimit, { kind: 'agent_company_mission', ref: clientId })
  } catch {
    return failure('company_mission_store_unavailable', { status: 'blocked' })
  }
  const missions = []
  for (const item of Array.isArray(activity) ? activity : []) {
    if (item.kind !== 'agent_company_mission' || item.ref !== clientId) continue
    const record = await readMission(String(item.id || ''), options)
    if (!record || record.clientId !== clientId) continue
    missions.push(publicMission(record))
    if (missions.length >= requestedLimit) break
  }
  return { ok: true, mode: 'mission_list', clientId, missions }
}

function validateWorkOrderBinding(order, record, stage, evidence, { requirePlanned = false } = {}) {
  const assignments = Array.isArray(order?.plan?.assignments) ? order.plan.assignments : []
  const fingerprints = Array.isArray(order?.evidence) ? order.evidence : []
  return isRecord(order)
    && ID_RE.test(String(order.workOrderId || ''))
    && order.clientId === record.clientId
    && order.cycleId === stage.cycleId
    && (!requirePlanned || order.status === 'planned')
    && HASH_RE.test(String(order.planHash || ''))
    && (!stage.workOrderId || order.workOrderId === stage.workOrderId)
    && (!stage.workOrderPlanHash || sameHash(order.planHash, stage.workOrderPlanHash))
    && Number(order.plan?.budget?.roleLimit) === stage.roleBudget
    && assignments.length === 1
    && assignments[0].agentId === stage.agentId
    && fingerprints.length === 1
    && fingerprints[0].agentId === stage.agentId
    && fingerprints[0].digest === evidence.digest
    && Number(fingerprints[0].bytes) === evidence.bytes
}

function queuedReplay(record, stageId, evidence, workOrder = null) {
  const stage = record?.stages?.find((item) => item.stageId === stageId)
  if (!stage || stage.status !== 'queued' || !sameHash(stage.evidenceDigest, evidence.digest)) return null
  return {
    ok: true,
    mode: 'mission_stage_queue',
    replayed: true,
    mission: publicMission(record),
    ...(workOrder ? { workOrder } : {}),
  }
}

export async function queueCompanyMissionStage(input, options = {}) {
  const fields = onlyFields(input, QUEUE_FIELDS)
  if (!fields.ok) return fields
  const clientId = normalizeId(input.clientId, 'company_invalid_client_id')
  if (isRecord(clientId)) return clientId
  const missionRunId = normalizeId(input.missionRunId, 'company_mission_invalid_id')
  if (isRecord(missionRunId)) return missionRunId
  const stageId = normalizeId(input.stageId, 'company_mission_invalid_stage_id')
  if (isRecord(stageId)) return stageId
  if (!HASH_RE.test(String(input.missionPlanHash || ''))) return failure('company_mission_plan_mismatch')
  const evidence = normalizeEvidence(input.evidence)
  if (!evidence.ok) return evidence
  if (String(input.confirmation || '') !== `QUEUE ${missionRunId} ${stageId} ${input.missionPlanHash}`) {
    return failure('company_mission_queue_confirmation_required', {
      confirmation: `QUEUE ${missionRunId} ${stageId} ${input.missionPlanHash}`,
    })
  }

  const record = await readMission(missionRunId, options)
  if (!record || record.clientId !== clientId) return failure('company_mission_not_found')
  if (!sameHash(record.planHash, input.missionPlanHash)) return failure('company_mission_plan_mismatch', { status: 'conflict' })
  if (record.status !== 'active') return failure('company_mission_invalid_state', { status: 'conflict' })
  const index = record.stages.findIndex((stage) => stage.stageId === stageId)
  if (index < 0 || index !== record.currentStageNumber - 1) return failure('company_mission_stage_locked', { status: 'conflict' })
  const stage = record.stages[index]
  if (stage.status === 'queued') {
    const replay = queuedReplay(record, stageId, evidence)
    if (!replay) return failure('company_mission_stage_conflict', { status: 'conflict' })
    const fetched = await (options.getCompanyWorkOrder || getCompanyWorkOrder)({ clientId, workOrderId: stage.workOrderId }, options)
    if (!fetched?.ok || !validateWorkOrderBinding(fetched.workOrder, record, stage, evidence)) {
      return failure('company_mission_work_order_unavailable', { status: 'blocked' })
    }
    return { ...replay, workOrder: fetched.workOrder }
  }
  if (stage.status !== 'ready') return failure('company_mission_stage_locked', { status: 'conflict' })
  if (stage.approvedInputDigest && !sameHash(stage.approvedInputDigest, evidence.digest)) {
    return failure('company_mission_handoff_mismatch', { status: 'conflict' })
  }

  const createOrder = options.createCompanyWorkOrder || createCompanyWorkOrder
  const created = await createOrder({
    clientId,
    cycleId: stage.cycleId,
    agents: [stage.agentId],
    evidence: { [stage.agentId]: evidence.text },
    roleBudget: stage.roleBudget,
  }, options)
  if (!created?.ok) return created || failure('company_mission_work_order_unavailable')
  if (!validateWorkOrderBinding(created.workOrder, record, stage, evidence, { requirePlanned: true })) {
    return failure('company_mission_work_order_mismatch', { status: 'conflict' })
  }

  const now = String(options.now?.() || new Date().toISOString())
  const nextRecord = {
    ...record,
    revision: record.revision + 1,
    updatedAt: now,
    stages: record.stages.map((item, itemIndex) => itemIndex === index ? {
      ...item,
      status: 'queued',
      workOrderId: created.workOrder.workOrderId,
      workOrderPlanHash: created.workOrder.planHash,
      evidenceDigest: evidence.digest,
      evidenceBytes: evidence.bytes,
      queuedAt: now,
    } : item),
  }
  const transitioned = await transitionMission(record, nextRecord, options)
  if (!transitioned.updated) {
    const latest = await readMission(missionRunId, options)
    const replay = latest && queuedReplay(latest, stageId, evidence, created.workOrder)
    if (replay) return replay
    return failure(
      transitioned.reason === 'store_unavailable' ? 'company_mission_store_unavailable' : 'company_mission_transition_conflict',
      { status: transitioned.reason === 'store_unavailable' ? 'blocked' : 'conflict' },
    )
  }
  return {
    ok: true,
    mode: 'mission_stage_queue',
    replayed: false,
    mission: publicMission(nextRecord),
    workOrder: created.workOrder,
  }
}

function acceptedReplay(record, stageId, resultHash, handoff) {
  const stage = record?.stages?.find((item) => item.stageId === stageId)
  if (!stage || stage.status !== 'accepted' || !sameHash(stage.resultHash, resultHash)) return null
  const index = record.stages.indexOf(stage)
  if (index < record.stages.length - 1) {
    const next = record.stages[index + 1]
    if (!handoff?.ok || !sameHash(next.approvedInputDigest, handoff.digest)) return null
  }
  return { ok: true, mode: 'mission_stage_advance', replayed: true, mission: publicMission(record) }
}

export async function advanceCompanyMissionStage(input, options = {}) {
  const fields = onlyFields(input, ADVANCE_FIELDS)
  if (!fields.ok) return fields
  const clientId = normalizeId(input.clientId, 'company_invalid_client_id')
  if (isRecord(clientId)) return clientId
  const missionRunId = normalizeId(input.missionRunId, 'company_mission_invalid_id')
  if (isRecord(missionRunId)) return missionRunId
  const stageId = normalizeId(input.stageId, 'company_mission_invalid_stage_id')
  if (isRecord(stageId)) return stageId
  const workOrderId = normalizeId(input.workOrderId, 'company_work_order_invalid_id')
  if (isRecord(workOrderId)) return workOrderId
  const resultHash = String(input.resultHash || '')
  if (!HASH_RE.test(resultHash)) return failure('company_mission_result_mismatch')
  if (!HASH_RE.test(String(input.missionPlanHash || ''))) return failure('company_mission_plan_mismatch')
  if (String(input.confirmation || '') !== `ADVANCE ${missionRunId} ${stageId} ${workOrderId} ${resultHash}`) {
    return failure('company_mission_advance_confirmation_required', {
      confirmation: `ADVANCE ${missionRunId} ${stageId} ${workOrderId} ${resultHash}`,
    })
  }

  const record = await readMission(missionRunId, options)
  if (!record || record.clientId !== clientId) return failure('company_mission_not_found')
  if (!sameHash(record.planHash, input.missionPlanHash)) return failure('company_mission_plan_mismatch', { status: 'conflict' })
  const index = record.stages.findIndex((stage) => stage.stageId === stageId)
  if (index < 0) return failure('company_mission_stage_locked', { status: 'conflict' })
  const isFinal = index === record.stages.length - 1
  const handoff = isFinal
    ? (input.nextStageEvidence === undefined || input.nextStageEvidence === null || input.nextStageEvidence === '' ? null : failure('company_mission_final_handoff_not_allowed'))
    : normalizeEvidence(input.nextStageEvidence, 'company_mission_handoff_required')
  if (handoff?.ok === false) return handoff
  const replay = acceptedReplay(record, stageId, resultHash, handoff)
  if (replay) return replay
  if (record.status !== 'active' || index !== record.currentStageNumber - 1) {
    return failure('company_mission_stage_locked', { status: 'conflict' })
  }
  const stage = record.stages[index]
  if (stage.status !== 'queued' || stage.workOrderId !== workOrderId) {
    return failure('company_mission_work_order_mismatch', { status: 'conflict' })
  }

  const fetchOrder = options.getCompanyWorkOrder || getCompanyWorkOrder
  const fetched = await fetchOrder({ clientId, workOrderId }, options)
  const order = fetched?.workOrder
  if (!fetched?.ok || !isRecord(order)) return failure('company_mission_work_order_unavailable')
  if (!validateWorkOrderBinding(order, record, stage, {
    digest: stage.evidenceDigest,
    bytes: stage.evidenceBytes,
  })
    || !ACCEPTED_ORDER_STATUSES.has(order.status)
    || !isRecord(order.result)
    || !sameHash(order.resultHash, resultHash)) {
    return failure('company_mission_result_mismatch', { status: 'conflict' })
  }
  const fetchEvaluation = options.getCompanyWorkOrderEvaluation || getCompanyWorkOrderEvaluation
  const evaluated = await fetchEvaluation({ clientId, workOrderId }, options)
  const evaluation = evaluated?.evaluation
  if (!evaluated?.ok
    || !isRecord(evaluation)
    || evaluation.clientId !== clientId
    || evaluation.workOrderId !== workOrderId
    || !sameHash(evaluation.planHash, order.planHash)
    || !HASH_RE.test(String(evaluation.evaluationHash || ''))
    || evaluation.verdict !== 'accepted'
    || !ACCEPTANCE_CHECKS.every((field) => evaluation.checks?.[field] === true)) {
    return failure('company_mission_accepted_evaluation_required', { status: 'conflict' })
  }

  const now = String(options.now?.() || new Date().toISOString())
  const stages = record.stages.map((item, itemIndex) => {
    if (itemIndex === index) return {
      ...item,
      status: 'accepted',
      resultHash,
      evaluationHash: evaluation.evaluationHash,
      acceptedAt: now,
    }
    if (!isFinal && itemIndex === index + 1) return {
      ...item,
      status: 'ready',
      approvedInputDigest: handoff.digest,
      approvedInputBytes: handoff.bytes,
    }
    return item
  })
  const nextRecord = {
    ...record,
    status: isFinal ? 'completed' : 'active',
    revision: record.revision + 1,
    updatedAt: now,
    ...(isFinal ? { completedAt: now } : {}),
    currentStageNumber: isFinal ? record.stages.length : index + 2,
    stages,
  }
  const transitioned = await transitionMission(record, nextRecord, options)
  if (!transitioned.updated) {
    const latest = await readMission(missionRunId, options)
    const latestReplay = latest && acceptedReplay(latest, stageId, resultHash, handoff)
    if (latestReplay) return latestReplay
    return failure(
      transitioned.reason === 'store_unavailable' ? 'company_mission_store_unavailable' : 'company_mission_transition_conflict',
      { status: transitioned.reason === 'store_unavailable' ? 'blocked' : 'conflict' },
    )
  }
  return { ok: true, mode: 'mission_stage_advance', replayed: false, mission: publicMission(nextRecord) }
}

export default {
  advanceCompanyMissionStage,
  createCompanyMission,
  getCompanyMission,
  listCompanyMissions,
  queueCompanyMissionStage,
}
