// Metadata-only operating evidence for durable Agent Company work orders.
// This module never returns queued evidence or specialist model output.

import { createHash, timingSafeEqual } from 'node:crypto'

import {
  listCompanyAgents,
  MAX_CYCLE_ROLE_BUDGET,
} from './agent-company.mjs'
import {
  getCompanyWorkOrder,
  listCompanyWorkOrders,
  MAX_COMPANY_WORK_ORDERS,
} from './agent-company-work-orders.mjs'
import {
  FREE_PLAN,
  monthlyUsageFor,
  policyFor,
  resolvePlan,
  TIER_COST_WEIGHTS,
} from './gateway.mjs'
import {
  claimActivity,
  getCachedResponse,
  listCachedResponseRecords,
  putCachedResponse,
  releaseActivityClaim,
} from './store.mjs'

export const COMPANY_OPERATIONS_WINDOWS = Object.freeze([7, 30, 90])
export const COMPANY_USAGE_UNITS = 'bulk_equivalent_tokens'
export const CEO_OUTCOME_OPERATION_CONTRACT = 'supermega.ceo-outcome-operation.v1'
export const CEO_OUTCOME_EVALUATION_CONTRACT = 'supermega.ceo-outcome-evaluation.v1'
export const MAX_CEO_OUTCOME_RECORDS = 90
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
const CEO_OUTCOME_ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/
const CEO_OPERATION_ID_RE = /^ceo-outcome:[a-f0-9]{40}$/
const TERMINAL_STATUSES = new Set(['completed', 'partial', 'blocked', 'failed'])
const VERDICTS = new Set(['accepted', 'revision_required'])
const EVALUATION_FIELDS = new Set(['clientId', 'workOrderId', 'planHash', 'verdict', 'checks', 'confirmation'])
const GET_EVALUATION_FIELDS = new Set(['clientId', 'workOrderId'])
const REPORT_FIELDS = new Set(['clientId', 'windowDays'])
const CEO_OUTCOME_RECORD_INPUT_FIELDS = new Set(['clientId', 'outcomeId', 'authorityDigest', 'completedAt', 'usage'])
const CEO_OUTCOME_EVALUATION_INPUT_FIELDS = new Set(['clientId', 'operationId', 'recordHash', 'verdict', 'confirmation'])
const CEO_OUTCOME_RECORD_FIELDS = new Set([
  'contract',
  'operationId',
  'clientId',
  'outcomeId',
  'authorityDigest',
  'status',
  'usage',
  'completedAt',
  'recordHash',
])
const CEO_OUTCOME_EVALUATION_FIELDS = new Set([
  'contract',
  'evaluationId',
  'operationId',
  'clientId',
  'outcomeId',
  'authorityDigest',
  'operationHash',
  'verdict',
  'evaluatedAt',
  'evaluationHash',
])
const CEO_USAGE_FIELDS = new Set([
  'contract',
  'units',
  'modelCalls',
  'cacheHits',
  'measuredCalls',
  'unmeasuredCalls',
  'weightedTotalUnits',
])
const CEO_OUTCOME_RECORD_PREFIX = 'ceo-outcome-operation:'
const CEO_OUTCOME_EVALUATION_PREFIX = 'ceo-outcome-evaluation:'
const OPERATOR_USAGE_CONTRACT = 'supermega.operator-usage.v1'
const CHECK_FIELDS = Object.freeze(['accurate', 'complete', 'usable', 'boundarySafe'])
const USAGE_TIERS = Object.freeze(Object.keys(TIER_COST_WEIGHTS))
const MAX_USAGE_TOKENS_PER_CALL = 10_000_000

const failure = (reason, extra = {}) => ({ ok: false, reason, ...extra })
const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)
const evaluationIdFor = (workOrderId) => `company-evaluation:${String(workOrderId).split(':').pop()}`
const evaluationKey = (workOrderId) => `company-work-order-evaluation:${workOrderId}`
const ceoRecordKey = (operationId) => `${CEO_OUTCOME_RECORD_PREFIX}${String(operationId).split(':').pop()}`
const ceoEvaluationKey = (operationId) => `${CEO_OUTCOME_EVALUATION_PREFIX}${String(operationId).split(':').pop()}`

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

function exactIso(value) {
  const text = String(value || '')
  const time = Date.parse(text)
  return Number.isFinite(time) && new Date(time).toISOString() === text ? text : ''
}

function normalizeCeoUsage(value) {
  if (!isRecord(value)) return failure('ceo_outcome_invalid_usage')
  const unknown = Object.keys(value).filter((field) => !CEO_USAGE_FIELDS.has(field)).sort()
  if (unknown.length) return failure('ceo_outcome_invalid_usage', { fields: unknown })
  if (value.contract !== OPERATOR_USAGE_CONTRACT || value.units !== COMPANY_USAGE_UNITS) {
    return failure('ceo_outcome_invalid_usage')
  }
  const modelCalls = boundedUsageNumber(value.modelCalls, 2)
  const cacheHits = boundedUsageNumber(value.cacheHits, 2)
  const measuredCalls = boundedUsageNumber(value.measuredCalls, 2)
  const unmeasuredCalls = boundedUsageNumber(value.unmeasuredCalls, 2)
  const weightedTotalUnits = boundedUsageNumber(value.weightedTotalUnits, MAX_USAGE_TOKENS_PER_CALL * 30)
  if ([modelCalls, cacheHits, measuredCalls, unmeasuredCalls, weightedTotalUnits].some((item) => item === null)
    || modelCalls + cacheHits !== 1
    || measuredCalls + unmeasuredCalls !== modelCalls
    || (measuredCalls === 0 && weightedTotalUnits !== 0)) {
    return failure('ceo_outcome_invalid_usage')
  }
  return {
    contract: OPERATOR_USAGE_CONTRACT,
    units: COMPANY_USAGE_UNITS,
    modelCalls,
    cacheHits,
    measuredCalls,
    unmeasuredCalls,
    weightedTotalUnits,
  }
}

function publicCeoOutcomeRecord(record) {
  return {
    contract: record.contract,
    operationId: record.operationId,
    clientId: record.clientId,
    outcomeId: record.outcomeId,
    authorityDigest: record.authorityDigest,
    status: record.status,
    usage: { ...record.usage },
    completedAt: record.completedAt,
    recordHash: record.recordHash,
  }
}

function publicCeoOutcomeEvaluation(record) {
  return {
    contract: record.contract,
    evaluationId: record.evaluationId,
    operationId: record.operationId,
    clientId: record.clientId,
    outcomeId: record.outcomeId,
    authorityDigest: record.authorityDigest,
    operationHash: record.operationHash,
    verdict: record.verdict,
    evaluatedAt: record.evaluatedAt,
    evaluationHash: record.evaluationHash,
  }
}

function validateCeoOutcomeRecord(value, expectedKey = '') {
  if (!isRecord(value) || Object.keys(value).some((field) => !CEO_OUTCOME_RECORD_FIELDS.has(field))) return null
  if (value.contract !== CEO_OUTCOME_OPERATION_CONTRACT
    || !CEO_OPERATION_ID_RE.test(String(value.operationId || ''))
    || !ID_RE.test(String(value.clientId || ''))
    || !CEO_OUTCOME_ID_RE.test(String(value.outcomeId || ''))
    || !HASH_RE.test(String(value.authorityDigest || ''))
    || value.status !== 'completed'
    || !exactIso(value.completedAt)
    || !HASH_RE.test(String(value.recordHash || ''))
    || (expectedKey && expectedKey !== ceoRecordKey(value.operationId))) return null
  const usage = normalizeCeoUsage(value.usage)
  if (usage.ok === false) return null
  const payload = {
    contract: CEO_OUTCOME_OPERATION_CONTRACT,
    operationId: value.operationId,
    clientId: value.clientId,
    outcomeId: value.outcomeId,
    authorityDigest: value.authorityDigest,
    status: 'completed',
    usage,
    completedAt: value.completedAt,
  }
  return sameHash(value.recordHash, sha256(stableStringify(payload))) ? { ...payload, recordHash: value.recordHash } : null
}

function validateCeoOutcomeEvaluation(value, operation) {
  if (!isRecord(value) || Object.keys(value).some((field) => !CEO_OUTCOME_EVALUATION_FIELDS.has(field))) return null
  if (value.contract !== CEO_OUTCOME_EVALUATION_CONTRACT
    || !/^ceo-outcome-evaluation:[a-f0-9]{40}$/.test(String(value.evaluationId || ''))
    || value.operationId !== operation.operationId
    || value.clientId !== operation.clientId
    || value.outcomeId !== operation.outcomeId
    || value.authorityDigest !== operation.authorityDigest
    || !sameHash(value.operationHash, operation.recordHash)
    || !VERDICTS.has(value.verdict)
    || !exactIso(value.evaluatedAt)
    || !HASH_RE.test(String(value.evaluationHash || ''))) return null
  const payload = {
    contract: CEO_OUTCOME_EVALUATION_CONTRACT,
    evaluationId: value.evaluationId,
    operationId: value.operationId,
    clientId: value.clientId,
    outcomeId: value.outcomeId,
    authorityDigest: value.authorityDigest,
    operationHash: value.operationHash,
    verdict: value.verdict,
    evaluatedAt: value.evaluatedAt,
  }
  return sameHash(value.evaluationHash, sha256(stableStringify(payload))) ? { ...payload, evaluationHash: value.evaluationHash } : null
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
    planHash: record.planHash,
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

export async function getCompanyWorkOrderEvaluation(input, options = {}) {
  const fields = onlyFields(input, GET_EVALUATION_FIELDS)
  if (!fields.ok) return fields
  const clientId = normalizeId(input.clientId, 'company_invalid_client_id')
  if (isRecord(clientId)) return clientId
  const workOrderId = normalizeId(input.workOrderId, 'company_work_order_invalid_id')
  if (isRecord(workOrderId)) return workOrderId
  const evaluation = await readEvaluation(workOrderId, options)
  if (!evaluation || evaluation.clientId !== clientId) return failure('company_evaluation_not_found')
  return { ok: true, mode: 'work_order_evaluation_get', evaluation: publicEvaluation(evaluation) }
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

export async function recordCeoOutcomeCompletion(input, options = {}) {
  const fields = onlyFields(input, CEO_OUTCOME_RECORD_INPUT_FIELDS)
  if (!fields.ok) return fields
  const clientId = normalizeId(input.clientId, 'company_invalid_client_id')
  if (isRecord(clientId)) return clientId
  const outcomeId = String(input.outcomeId || '').trim()
  const authorityDigest = String(input.authorityDigest || '').trim()
  const completedAt = exactIso(input.completedAt)
  const usage = normalizeCeoUsage(input.usage)
  if (!CEO_OUTCOME_ID_RE.test(outcomeId)) return failure('ceo_outcome_invalid_id')
  if (!HASH_RE.test(authorityDigest)) return failure('ceo_outcome_invalid_authority_digest')
  if (!completedAt) return failure('ceo_outcome_invalid_completed_at')
  if (usage.ok === false) return usage

  const operationSuffix = sha256(stableStringify({
    clientId,
    outcomeId,
    authorityDigest,
    completedAt,
  })).slice(0, 40)
  const operationId = `ceo-outcome:${operationSuffix}`
  const payload = {
    contract: CEO_OUTCOME_OPERATION_CONTRACT,
    operationId,
    clientId,
    outcomeId,
    authorityDigest,
    status: 'completed',
    usage,
    completedAt,
  }
  const record = { ...payload, recordHash: sha256(stableStringify(payload)) }
  const reserve = options.claimActivity || claimActivity
  const release = options.releaseActivityClaim || releaseActivityClaim
  const save = options.putCeoOutcomeRecord || putCachedResponse
  const read = options.getCeoOutcomeRecord || getCachedResponse
  const claimId = `ceo-outcome-record:${operationSuffix}`
  const requireDurableClaim = options.requireDurableClaim !== false
  let claim
  try {
    claim = await reserve({
      id: claimId,
      kind: 'ceo_outcome_completion_record',
      summary: 'CEO outcome completion metadata recorded',
      ref: clientId,
    })
  } catch {
    claim = { fresh: false, durable: false }
  }
  if (!claim?.fresh) {
    if (!claim?.durable) return failure('ceo_outcome_store_unavailable', { status: 'blocked' })
    let existing = null
    try { existing = validateCeoOutcomeRecord(await read(ceoRecordKey(operationId)), ceoRecordKey(operationId)) }
    catch { existing = null }
    if (!existing) return failure('ceo_outcome_already_claimed', { status: 'duplicate', operationId })
    if (!sameHash(existing.recordHash, record.recordHash)) {
      return failure('ceo_outcome_record_conflict', { status: 'conflict', operationId })
    }
    return { ok: true, mode: 'ceo_outcome_record', replayed: true, outcome: publicCeoOutcomeRecord(existing) }
  }
  if (requireDurableClaim && !claim.durable) {
    try { await release(claimId, clientId) } catch { /* no outcome record was persisted */ }
    return failure('ceo_outcome_durable_claim_required', { status: 'blocked', operationId })
  }
  let stored = false
  try { stored = Boolean(await save(ceoRecordKey(operationId), record)) }
  catch { stored = false }
  if (!stored) {
    try { await release(claimId, clientId) } catch { /* allow an explicit retry */ }
    return failure('ceo_outcome_store_unavailable', { status: 'blocked', operationId })
  }
  return { ok: true, mode: 'ceo_outcome_record', replayed: false, outcome: publicCeoOutcomeRecord(record) }
}

export async function evaluateCeoOutcomeDelivery(input, options = {}) {
  const fields = onlyFields(input, CEO_OUTCOME_EVALUATION_INPUT_FIELDS)
  if (!fields.ok) return fields
  const clientId = normalizeId(input.clientId, 'company_invalid_client_id')
  if (isRecord(clientId)) return clientId
  const operationId = String(input.operationId || '').trim()
  const recordHash = String(input.recordHash || '').trim()
  const verdict = String(input.verdict || '').trim()
  if (!CEO_OPERATION_ID_RE.test(operationId)) return failure('ceo_outcome_invalid_operation_id')
  if (!HASH_RE.test(recordHash)) return failure('ceo_outcome_invalid_record_hash')
  if (!VERDICTS.has(verdict)) return failure('ceo_outcome_invalid_verdict')
  if (String(input.confirmation || '') !== `EVALUATE ${operationId}`) {
    return failure('ceo_outcome_evaluation_confirmation_required', {
      operationId,
      confirmation: `EVALUATE ${operationId}`,
    })
  }

  const readRecord = options.getCeoOutcomeRecord || getCachedResponse
  let operation = null
  try { operation = validateCeoOutcomeRecord(await readRecord(ceoRecordKey(operationId)), ceoRecordKey(operationId)) }
  catch { operation = null }
  if (!operation || operation.clientId !== clientId) return failure('ceo_outcome_not_found')
  if (!sameHash(operation.recordHash, recordHash)) {
    return failure('ceo_outcome_record_mismatch', { status: 'conflict', operationId })
  }

  const evaluationId = `ceo-outcome-evaluation:${operationId.split(':').pop()}`
  const evaluatedAt = exactIso(options.now?.() || new Date().toISOString())
  if (!evaluatedAt) return failure('ceo_outcome_evaluation_clock_invalid')
  const evaluationPayload = {
    contract: CEO_OUTCOME_EVALUATION_CONTRACT,
    evaluationId,
    operationId,
    clientId,
    outcomeId: operation.outcomeId,
    authorityDigest: operation.authorityDigest,
    operationHash: operation.recordHash,
    verdict,
    evaluatedAt,
  }
  const evaluation = {
    ...evaluationPayload,
    evaluationHash: sha256(stableStringify(evaluationPayload)),
  }
  const reserve = options.claimActivity || claimActivity
  const release = options.releaseActivityClaim || releaseActivityClaim
  const save = options.putCeoOutcomeEvaluation || putCachedResponse
  const readEvaluation = options.getCeoOutcomeEvaluation || getCachedResponse
  const claimId = `ceo-outcome-evaluation-record:${operationId.split(':').pop()}`
  const requireDurableClaim = options.requireDurableClaim !== false
  let claim
  try {
    claim = await reserve({
      id: claimId,
      kind: 'ceo_outcome_evaluation',
      summary: 'CEO outcome evaluation metadata recorded',
      ref: clientId,
    })
  } catch {
    claim = { fresh: false, durable: false }
  }
  if (!claim?.fresh) {
    if (!claim?.durable) return failure('ceo_outcome_evaluation_store_unavailable', { status: 'blocked' })
    let existing = null
    try { existing = validateCeoOutcomeEvaluation(await readEvaluation(ceoEvaluationKey(operationId)), operation) }
    catch { existing = null }
    if (!existing) return failure('ceo_outcome_evaluation_already_claimed', { status: 'duplicate', operationId })
    if (!sameHash(existing.evaluationHash, evaluation.evaluationHash)) {
      return failure('ceo_outcome_evaluation_conflict', { status: 'conflict', operationId })
    }
    return { ok: true, mode: 'ceo_outcome_evaluate', replayed: true, evaluation: publicCeoOutcomeEvaluation(existing) }
  }
  if (requireDurableClaim && !claim.durable) {
    try { await release(claimId, clientId) } catch { /* no evaluation was persisted */ }
    return failure('ceo_outcome_evaluation_durable_claim_required', { status: 'blocked', operationId })
  }
  let stored = false
  try { stored = Boolean(await save(ceoEvaluationKey(operationId), evaluation)) }
  catch { stored = false }
  if (!stored) {
    try { await release(claimId, clientId) } catch { /* allow an explicit retry */ }
    return failure('ceo_outcome_evaluation_store_unavailable', { status: 'blocked', operationId })
  }
  return { ok: true, mode: 'ceo_outcome_evaluate', replayed: false, evaluation: publicCeoOutcomeEvaluation(evaluation) }
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

function boundedUsageNumber(value, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value)
  return Number.isSafeInteger(number) && number >= 0 && number <= max ? number : null
}

function emptyUsageSummary() {
  return {
    roleCalls: 0,
    modelCalls: 0,
    cacheHits: 0,
    measuredCalls: 0,
    unmeasuredCalls: 0,
    rawPromptTokens: 0,
    rawCompletionTokens: 0,
    weightedPromptUnits: 0,
    weightedCompletionUnits: 0,
    weightedTotalUnits: 0,
    byTier: Object.fromEntries(USAGE_TIERS.map((tier) => [tier, {
      roleCalls: 0,
      modelCalls: 0,
      cacheHits: 0,
      measuredCalls: 0,
      weightedTotalUnits: 0,
    }])),
  }
}

function mergeUsage(target, source) {
  for (const field of [
    'roleCalls',
    'modelCalls',
    'cacheHits',
    'measuredCalls',
    'unmeasuredCalls',
    'rawPromptTokens',
    'rawCompletionTokens',
    'weightedPromptUnits',
    'weightedCompletionUnits',
    'weightedTotalUnits',
  ]) target[field] += boundedUsageNumber(source?.[field]) || 0
  for (const tier of USAGE_TIERS) {
    const sourceTier = source?.byTier?.[tier]
    if (!sourceTier) continue
    for (const field of ['roleCalls', 'modelCalls', 'cacheHits', 'measuredCalls', 'weightedTotalUnits']) {
      target.byTier[tier][field] += boundedUsageNumber(sourceTier[field]) || 0
    }
  }
  return target
}

function summarizeUsageByRole(value) {
  const summary = emptyUsageSummary()
  const allEntries = Array.isArray(value) ? value : []
  const entries = allEntries.slice(0, MAX_CYCLE_ROLE_BUDGET)
  summary.roleCalls = allEntries.length
  summary.unmeasuredCalls = Math.max(0, allEntries.length - entries.length)
  for (const entry of entries) {
    const tier = USAGE_TIERS.includes(entry?.tier) ? entry.tier : null
    if (tier) summary.byTier[tier].roleCalls += 1
    if (entry?.cached === true) {
      summary.cacheHits += 1
      if (tier) summary.byTier[tier].cacheHits += 1
      continue
    }
    summary.modelCalls += 1
    if (tier) summary.byTier[tier].modelCalls += 1
    const promptTokens = boundedUsageNumber(entry?.usage?.input_tokens, MAX_USAGE_TOKENS_PER_CALL)
    const completionTokens = boundedUsageNumber(entry?.usage?.output_tokens, MAX_USAGE_TOKENS_PER_CALL)
    if (!tier || promptTokens === null || completionTokens === null) {
      summary.unmeasuredCalls += 1
      continue
    }
    const weight = TIER_COST_WEIGHTS[tier]
    const weightedPromptUnits = promptTokens * weight
    const weightedCompletionUnits = completionTokens * weight
    summary.measuredCalls += 1
    summary.rawPromptTokens += promptTokens
    summary.rawCompletionTokens += completionTokens
    summary.weightedPromptUnits += weightedPromptUnits
    summary.weightedCompletionUnits += weightedCompletionUnits
    summary.weightedTotalUnits += weightedPromptUnits + weightedCompletionUnits
    summary.byTier[tier].measuredCalls += 1
    summary.byTier[tier].weightedTotalUnits += weightedPromptUnits + weightedCompletionUnits
  }
  return summary
}

async function buildUsageEconomics(clientId, orders, options = {}) {
  const sampled = emptyUsageSummary()
  for (const order of orders) mergeUsage(sampled, order.usage)
  const sampledUsage = {
    orders: orders.length,
    terminalOrders: orders.filter((order) => TERMINAL_STATUSES.has(order.status)).length,
    measuredOrders: orders.filter((order) => Number(order.usage?.measuredCalls) > 0).length,
    ...sampled,
  }

  const resolveTenantPlan = options.resolvePlan || resolvePlan
  const getPolicy = options.policyFor || policyFor
  const getMonthlyUsage = options.monthlyUsageFor || monthlyUsageFor
  let plan = FREE_PLAN
  let planSource = 'server'
  try {
    const resolved = String(await resolveTenantPlan(clientId) || '').trim().toLowerCase()
    if (/^[a-z][a-z0-9_-]{0,31}$/.test(resolved)) plan = resolved
    else planSource = 'fallback'
  } catch {
    planSource = 'fallback'
  }

  let capUnits = null
  try { capUnits = boundedUsageNumber(getPolicy(plan, {}).cap) }
  catch { capUnits = null }
  let ledger = null
  try { ledger = await getMonthlyUsage(clientId) }
  catch { ledger = null }
  const ledgerPromptUnits = boundedUsageNumber(ledger?.inTokens)
  const ledgerCompletionUnits = boundedUsageNumber(ledger?.outTokens)
  const ledgerModelCalls = boundedUsageNumber(ledger?.calls)
  const ledgerTotalUnits = ledgerPromptUnits !== null && ledgerCompletionUnits !== null
    ? ledgerPromptUnits + ledgerCompletionUnits
    : null
  const source = ['spine+local-max', 'memory'].includes(ledger?.source) ? ledger.source : 'unavailable'
  const window = /^\d{4}-\d{2}$/.test(String(ledger?.window || '')) ? ledger.window : null
  const available = Number.isSafeInteger(ledgerTotalUnits)
    && ledgerModelCalls !== null
    && source !== 'unavailable'
    && window !== null
  const weightedPromptUnits = available ? ledgerPromptUnits : null
  const weightedCompletionUnits = available ? ledgerCompletionUnits : null
  const weightedTotalUnits = available ? ledgerTotalUnits : null
  const modelCalls = available ? ledgerModelCalls : null
  const capEnforced = capUnits !== null && capUnits > 0
  const remainingUnits = available && capEnforced ? Math.max(0, capUnits - weightedTotalUnits) : null
  const utilizationRate = available && capEnforced
    ? Math.round((weightedTotalUnits / capUnits) * 10_000) / 10_000
    : null
  return {
    units: COMPANY_USAGE_UNITS,
    plan,
    planSource,
    monthly: {
      available,
      window,
      weightedPromptUnits,
      weightedCompletionUnits,
      weightedTotalUnits,
      modelCalls,
      capUnits,
      capEnforced,
      remainingUnits,
      utilizationRate,
      source,
    },
    sampled: sampledUsage,
  }
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
    const usage = summarizeUsageByRole(specialist?.usageByRole)
    return {
      agentId: assignment.agentId,
      name: assignment.name || assignment.agentId,
      department: assignment.department || 'unknown',
      crew: assignment.crew || null,
      status: specialist?.status || (terminal ? 'missing' : order.status),
      plannedRoleCalls: Number.isFinite(Number(assignment.roleCount)) ? Number(assignment.roleCount) : null,
      usedRoleCalls: Number.isFinite(usedRoleCalls) ? usedRoleCalls : null,
      usage,
    }
  })
  const usage = emptyUsageSummary()
  for (const agent of agents) mergeUsage(usage, agent.usage)
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
    usage,
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
    modelCalls: 0,
    cacheHits: 0,
    measuredCalls: 0,
    weightedTotalUnits: 0,
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
        modelCalls: 0,
        cacheHits: 0,
        measuredCalls: 0,
        weightedTotalUnits: 0,
      }
      current.assignedOrders += 1
      if (['planned', 'running'].includes(order.status)) current.activeAssignments += 1
      if (TERMINAL_STATUSES.has(order.status)) current.terminalAssignments += 1
      if (agent.status === 'completed') current.completedAssignments += 1
      if (Number.isFinite(agent.usedRoleCalls)) current.usedRoleCalls += agent.usedRoleCalls
      current.modelCalls += boundedUsageNumber(agent.usage?.modelCalls) || 0
      current.cacheHits += boundedUsageNumber(agent.usage?.cacheHits) || 0
      current.measuredCalls += boundedUsageNumber(agent.usage?.measuredCalls) || 0
      current.weightedTotalUnits += boundedUsageNumber(agent.usage?.weightedTotalUnits) || 0
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
    modelCalls: utilized.reduce((total, agent) => total + agent.modelCalls, 0),
    cacheHits: utilized.reduce((total, agent) => total + agent.cacheHits, 0),
    measuredCalls: utilized.reduce((total, agent) => total + agent.measuredCalls, 0),
    weightedTotalUnits: utilized.reduce((total, agent) => total + agent.weightedTotalUnits, 0),
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

function unavailableCeoOutcomeOperations(reason) {
  return {
    contract: CEO_OUTCOME_OPERATION_CONTRACT,
    available: false,
    durable: false,
    state: reason,
    counts: {
      completed: 0,
      evaluated: 0,
      accepted: 0,
      revisionRequired: 0,
      missingEvaluation: 0,
      uniqueOutcomes: 0,
    },
    usage: {
      units: COMPANY_USAGE_UNITS,
      modelCalls: 0,
      cacheHits: 0,
      measuredCalls: 0,
      unmeasuredCalls: 0,
      weightedTotalUnits: 0,
    },
    efficiency: {
      available: false,
      acceptedOutcomesPer1000WorkUnits: null,
      workUnitsPerAcceptedOutcome: null,
    },
    coverage: {
      listedRecords: 0,
      includedRecords: 0,
      invalidRecords: 0,
      duplicateRecords: 0,
      outOfWindowRecords: 0,
      invalidEvaluations: 0,
      unavailableEvaluations: 0,
      evaluationCoverageRate: null,
      usageCoverageRate: null,
      capped: false,
    },
    records: [],
  }
}

async function buildCeoOutcomeOperations(clientId, cutoff, nowMs, options = {}) {
  const listRecords = options.listCeoOutcomeRecords || listCachedResponseRecords
  const getEvaluation = options.getCeoOutcomeEvaluation || getCachedResponse
  let listed
  try {
    listed = await listRecords({
      prefix: CEO_OUTCOME_RECORD_PREFIX,
      clientId,
      limit: MAX_CEO_OUTCOME_RECORDS,
    })
  } catch {
    return unavailableCeoOutcomeOperations('store_unavailable')
  }
  if (!listed || !Array.isArray(listed.records)) return unavailableCeoOutcomeOperations('store_unavailable')

  const records = []
  const seen = new Set()
  let invalidRecords = 0
  let duplicateRecords = 0
  let outOfWindowRecords = 0
  let invalidEvaluations = 0
  let unavailableEvaluations = 0
  for (const entry of listed.records) {
    const record = validateCeoOutcomeRecord(entry?.payload, String(entry?.key || ''))
    if (!record || record.clientId !== clientId) {
      invalidRecords += 1
      continue
    }
    if (seen.has(record.operationId)) {
      duplicateRecords += 1
      continue
    }
    seen.add(record.operationId)
    const completedTime = parseTime(record.completedAt)
    if (completedTime === null || completedTime < cutoff || completedTime > nowMs + 300000) {
      outOfWindowRecords += 1
      continue
    }
    let rawEvaluation = null
    let evaluationReadFailed = false
    try { rawEvaluation = await getEvaluation(ceoEvaluationKey(record.operationId)) }
    catch { evaluationReadFailed = true }
    if (evaluationReadFailed) unavailableEvaluations += 1
    const evaluation = rawEvaluation ? validateCeoOutcomeEvaluation(rawEvaluation, record) : null
    if (rawEvaluation && !evaluation) invalidEvaluations += 1
    records.push({
      ...publicCeoOutcomeRecord(record),
      evaluation: evaluation ? publicCeoOutcomeEvaluation(evaluation) : null,
    })
  }
  records.sort((left, right) => right.completedAt.localeCompare(left.completedAt) || left.operationId.localeCompare(right.operationId))

  const evaluated = records.filter((record) => record.evaluation)
  const accepted = evaluated.filter((record) => record.evaluation.verdict === 'accepted').length
  const revisionRequired = evaluated.filter((record) => record.evaluation.verdict === 'revision_required').length
  const usage = {
    units: COMPANY_USAGE_UNITS,
    modelCalls: records.reduce((total, record) => total + record.usage.modelCalls, 0),
    cacheHits: records.reduce((total, record) => total + record.usage.cacheHits, 0),
    measuredCalls: records.reduce((total, record) => total + record.usage.measuredCalls, 0),
    unmeasuredCalls: records.reduce((total, record) => total + record.usage.unmeasuredCalls, 0),
    weightedTotalUnits: records.reduce((total, record) => total + record.usage.weightedTotalUnits, 0),
  }
  const invalidCoverage = invalidRecords + duplicateRecords + invalidEvaluations + unavailableEvaluations > 0
  const evaluationCoverageRate = rate(evaluated.length, records.length)
  const usageCovered = records.filter((record) => record.usage.unmeasuredCalls === 0).length
  const usageCoverageRate = rate(usageCovered, records.length)
  let state = 'measured'
  if (!records.length) state = 'no_outcomes'
  else if (invalidCoverage) state = 'invalid_coverage'
  else if (listed.durable !== true) state = 'non_durable'
  else if (evaluated.length !== records.length) state = 'incomplete_evaluations'
  else if (usageCovered !== records.length) state = 'incomplete_usage'
  else if (usage.weightedTotalUnits === 0) state = 'zero_work_units'
  const efficiencyAvailable = state === 'measured'
  const acceptedOutcomesPer1000WorkUnits = efficiencyAvailable
    ? Math.round(((accepted / usage.weightedTotalUnits) * 1000) * 1_000_000) / 1_000_000
    : null
  const workUnitsPerAcceptedOutcome = efficiencyAvailable && accepted > 0
    ? Math.round((usage.weightedTotalUnits / accepted) * 1000) / 1000
    : null
  return {
    contract: CEO_OUTCOME_OPERATION_CONTRACT,
    available: true,
    durable: listed.durable === true,
    state,
    counts: {
      completed: records.length,
      evaluated: evaluated.length,
      accepted,
      revisionRequired,
      missingEvaluation: records.length - evaluated.length,
      uniqueOutcomes: new Set(records.map((record) => record.outcomeId)).size,
    },
    usage,
    efficiency: {
      available: efficiencyAvailable,
      acceptedOutcomesPer1000WorkUnits,
      workUnitsPerAcceptedOutcome,
    },
    coverage: {
      listedRecords: listed.records.length,
      includedRecords: records.length,
      invalidRecords,
      duplicateRecords,
      outOfWindowRecords,
      invalidEvaluations,
      unavailableEvaluations,
      evaluationCoverageRate,
      usageCoverageRate,
      capped: listed.records.length === MAX_CEO_OUTCOME_RECORDS,
    },
    records,
  }
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
  const usage = await buildUsageEconomics(clientId, orders, options)
  const outcomes = await buildCeoOutcomeOperations(clientId, cutoff, nowMs, options)
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
    usage,
    outcomes,
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
      currencyCostClaimed: false,
      ceoBriefTextReturned: false,
      providerRowsReturned: false,
    },
    orders,
  }
}

export default {
  evaluateCompanyWorkOrder,
  recordCeoOutcomeCompletion,
  evaluateCeoOutcomeDelivery,
  buildCompanyOperationsReport,
}
