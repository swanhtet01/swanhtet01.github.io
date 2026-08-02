// Tenant-session or owner-key gated planner and runner for bounded Agent Company cycles.

import {
  listCompanyAgents,
  COMPANY_CAPACITY_CLAIM_CONTRACT,
  COMPANY_CAPACITY_CLAIM_TTL_SECONDS,
  MAX_ACTIVE_COMPANY_ASSIGNMENTS,
  MAX_CYCLE_AGENTS,
  MAX_CYCLE_ROLE_BUDGET,
  MAX_RUNNING_COMPANY_CYCLES,
  planCompanyCycle,
  runCompanyCycle,
} from '../agent-company.mjs'
import {
  cancelCompanyWorkOrder,
  createCompanyWorkOrder,
  getCompanyWorkOrder,
  getCompanyWorkOrderProof,
  listCompanyWorkOrders,
  MAX_COMPANY_WORK_ORDERS,
  reviewCompanyWorkOrder,
  runCompanyWorkOrder,
} from '../agent-company-work-orders.mjs'
import {
  buildCompanyOperationsReport,
  COMPANY_OPERATIONS_TARGETS,
  COMPANY_OPERATIONS_WINDOWS,
  CEO_OUTCOME_CYCLE_STATE_CONTRACT,
  CEO_OUTCOME_DELIVERY_CONTRACT,
  evaluateCeoOutcomeDelivery,
  evaluateCompanyWorkOrder,
  loadCeoOutcomeCycleState,
  promoteAcceptedCeoOutcomeAction,
} from '../agent-company-operations.mjs'
import {
  selectCeoOutcome,
  SUPERMEGA_HQ_AUTHORITY,
} from '../supermega-hq-authority.mjs'
import {
  listCompanyPlaybooks,
  planCompanyPlaybook,
} from '../agent-company-playbooks.mjs'
import {
  advanceCompanyMissionStage,
  createCompanyMission,
  getCompanyMission,
  listCompanyMissions,
  MAX_COMPANY_MISSIONS,
  queueCompanyMissionStage,
} from '../agent-company-missions.mjs'
import {
  authorizeCompanyRequest,
  companyRoleAllows,
} from '../agent-company-operator-auth.mjs'

const CEO_CYCLE_VIEW_CONTRACT = 'supermega.ceo-cycle-view.v1'
const HOSTED_ACTIVATION_VIEW_CONTRACT = 'supermega.hosted-activation-view.v1'
const HOSTED_STATUS_URL = 'https://app.supermega.dev/api/cloud-autonomy/status'
const HOSTED_STATUS_TIMEOUT_MS = 2500
const HOSTED_STATUS_MAX_BYTES = 64 * 1024
const CEO_CYCLE_DELIVERY_STATES = new Set(['ready', 'no_outcomes', 'missing', 'attention', 'invalid_coverage', 'non_durable', 'store_unavailable'])
const CEO_CYCLE_DELIVERY_STATUSES = new Set(['sent', 'failed', 'uncertain', 'missing'])
const CEO_CYCLE_DELIVERY_FIELDS = new Set(['contract', 'available', 'durable', 'state', 'counts', 'coverage', 'outcomes'])
const CEO_CYCLE_DELIVERY_COUNT_FIELDS = Object.freeze(['completed', 'recorded', 'sent', 'failed', 'uncertain', 'missing'])
const HOSTED_ACTIVATION_PROOFS = Object.freeze([
  ['managed-database-tenant-isolation', 'Managed database tenant isolation'],
  ['private-storage-privacy', 'Private storage privacy'],
  ['protected-worker-egress', 'Protected worker egress'],
  ['queue-recovery-side-effect-accounting', 'Queue recovery and side-effect accounting'],
  ['protected-release-rollback-owner-decision', 'Protected release, rollback, and owner decision'],
])

function unavailableHostedActivation(reason) {
  const proofs = HOSTED_ACTIVATION_PROOFS.map(([id, label]) => ({ id, label, status: 'unverified' }))
  return {
    contract: HOSTED_ACTIVATION_VIEW_CONTRACT,
    authority: 'vercel',
    environment: 'production',
    declaredState: 'dormant',
    liveState: 'unavailable',
    source: { status: 'unavailable', reason },
    activationReady: false,
    proofs,
    verifiedProofCount: 0,
    requiredProofCount: proofs.length,
    nextProof: proofs[0],
    scheduler: {
      configured: false,
      activationRequested: false,
      activationEnabled: false,
      runtimeReady: false,
      pcDependency: false,
      currentInvocationsPerDay: 0,
      plannedInvocationsPerDay: 25,
      maxJobsPerRun: 1,
      cadence: 'hourly_and_daily',
      cadenceCompatibility: 'unverified',
    },
    nextAction: 'Restore the fixed hosted status read, then verify the signed activation evidence.',
  }
}

async function buildHostedActivationView(fetchHostedStatus) {
  if (typeof fetchHostedStatus !== 'function') return unavailableHostedActivation('hosted_status_not_checked')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), HOSTED_STATUS_TIMEOUT_MS)
  let response
  try {
    response = await fetchHostedStatus(HOSTED_STATUS_URL, {
      method: 'GET',
      headers: { accept: 'application/json' },
      redirect: 'error',
      cache: 'no-store',
      signal: controller.signal,
    })
  } catch (error) {
    const reason = error?.name === 'AbortError' ? 'hosted_status_timeout' : 'hosted_status_unavailable'
    return unavailableHostedActivation(reason)
  } finally {
    clearTimeout(timeout)
  }
  if (!response || response.status !== 200) return unavailableHostedActivation('hosted_status_rejected')
  const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase()
  if (!contentType.includes('application/json')) return unavailableHostedActivation('hosted_status_content_type_invalid')
  const declaredLength = Number(response.headers?.get?.('content-length') || 0)
  if (Number.isFinite(declaredLength) && declaredLength > HOSTED_STATUS_MAX_BYTES) {
    return unavailableHostedActivation('hosted_status_too_large')
  }
  let text
  try {
    text = await response.text()
  } catch {
    return unavailableHostedActivation('hosted_status_unreadable')
  }
  if (new TextEncoder().encode(text).byteLength > HOSTED_STATUS_MAX_BYTES) {
    return unavailableHostedActivation('hosted_status_too_large')
  }
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    return unavailableHostedActivation('hosted_status_json_invalid')
  }
  const scheduler = payload?.scheduler
  if (!payload || payload.runtime_target !== 'hosted_vercel_api' || payload.pc_dependency !== false
    || !scheduler || typeof scheduler !== 'object' || Array.isArray(scheduler)) {
    return unavailableHostedActivation('hosted_status_contract_invalid')
  }
  const evidenceCount = Number.isInteger(scheduler.activation_evidence_count)
    && scheduler.activation_evidence_count >= 0
    && scheduler.activation_evidence_count <= HOSTED_ACTIVATION_PROOFS.length
    ? scheduler.activation_evidence_count
    : 0
  const evidenceValid = scheduler.activation_evidence_valid === true
    && evidenceCount === HOSTED_ACTIVATION_PROOFS.length
  const proofs = HOSTED_ACTIVATION_PROOFS.map(([id, label]) => ({
    id,
    label,
    status: evidenceValid ? 'verified' : 'unverified',
  }))
  const activationRequested = scheduler.activation_requested === true
  const activationEnabled = scheduler.activation_enabled === true
  const configured = scheduler.configured === true
  const runtimeReady = configured && activationEnabled && evidenceValid
  const cadenceCompatibility = 'unverified'
  const activationReady = runtimeReady && cadenceCompatibility === 'verified'
  const liveState = runtimeReady ? 'enabled_unverified' : activationRequested ? 'blocked' : 'dormant'
  return {
    contract: HOSTED_ACTIVATION_VIEW_CONTRACT,
    authority: 'vercel',
    environment: 'production',
    declaredState: 'dormant',
    liveState,
    source: { status: 'observed' },
    activationReady,
    proofs,
    verifiedProofCount: evidenceValid ? proofs.length : 0,
    requiredProofCount: proofs.length,
    nextProof: evidenceValid ? null : proofs[0],
    scheduler: {
      configured,
      activationRequested,
      activationEnabled,
      runtimeReady,
      pcDependency: false,
      currentInvocationsPerDay: 0,
      plannedInvocationsPerDay: 25,
      maxJobsPerRun: Number.isInteger(scheduler.max_jobs_per_run) ? scheduler.max_jobs_per_run : 1,
      cadence: 'hourly_and_daily',
      cadenceCompatibility,
    },
    nextAction: evidenceValid
      ? configured
        ? 'Confirm the Vercel plan supports the hourly cadence before any owner activation decision.'
        : 'Finish the protected worker configuration before any owner activation decision.'
      : `Verify ${proofs[0].label.toLowerCase()} in the signed activation bundle.`,
  }
}

function unavailableCeoCycle(reason, extra = {}) {
  return {
    contract: CEO_CYCLE_VIEW_CONTRACT,
    available: false,
    durable: false,
    reason,
    ...extra,
  }
}

function validCycleState(state, expected) {
  if (!state?.ok
    || state.contract !== CEO_OUTCOME_CYCLE_STATE_CONTRACT
    || state.durable !== true
    || state.clientId !== expected.clientId
    || state.authorityDigest !== expected.authorityDigest
    || !/^\d{4}-\d{2}-\d{2}$/.test(String(state.cycleId || ''))
    || !Array.isArray(state.completedOutcomeIds)
    || state.completedOutcomeIds.length > 12
    || new Set(state.completedOutcomeIds).size !== state.completedOutcomeIds.length
    || state.completedCount !== state.completedOutcomeIds.length
    || !validCycleDelivery(state.delivery, state.completedOutcomeIds)) return false
  const startsAt = Date.parse(state.startsAt)
  const endsAt = Date.parse(state.endsAt)
  const asOf = expected.asOf.getTime()
  return Number.isFinite(startsAt)
    && Number.isFinite(endsAt)
    && endsAt - startsAt === 7 * 24 * 60 * 60 * 1000
    && asOf >= startsAt
    && asOf < endsAt
}

function validCycleDelivery(delivery, completedOutcomeIds) {
  if (!delivery || typeof delivery !== 'object' || Array.isArray(delivery)
    || Object.keys(delivery).some((field) => !CEO_CYCLE_DELIVERY_FIELDS.has(field))
    || delivery.contract !== CEO_OUTCOME_DELIVERY_CONTRACT
    || typeof delivery.available !== 'boolean'
    || typeof delivery.durable !== 'boolean'
    || !CEO_CYCLE_DELIVERY_STATES.has(delivery.state)
    || !Array.isArray(delivery.outcomes)
    || delivery.outcomes.length !== completedOutcomeIds.length) return false
  const counts = delivery.counts
  const countFields = CEO_CYCLE_DELIVERY_COUNT_FIELDS
  if (!counts || Object.keys(counts).sort().join(',') !== [...countFields].sort().join(',')
    || !countFields.every((field) => Number.isSafeInteger(counts[field]) && counts[field] >= 0)
    || counts.completed !== completedOutcomeIds.length
    || counts.recorded !== counts.sent + counts.failed + counts.uncertain
    || counts.missing !== counts.completed - counts.recorded) return false
  const completed = new Set(completedOutcomeIds)
  const seen = new Set()
  const observed = { sent: 0, failed: 0, uncertain: 0, missing: 0 }
  for (const outcome of delivery.outcomes) {
    if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)
      || Object.keys(outcome).sort().join(',') !== 'outcomeId,status'
      || !completed.has(outcome.outcomeId)
      || seen.has(outcome.outcomeId)
      || !CEO_CYCLE_DELIVERY_STATUSES.has(outcome.status)) return false
    seen.add(outcome.outcomeId)
    observed[outcome.status] += 1
  }
  if (countFields.slice(2).some((field) => counts[field] !== observed[field])) return false
  if (delivery.state === 'ready' && (!delivery.available || !delivery.durable || counts.sent !== counts.completed)) return false
  if (delivery.state === 'no_outcomes' && (!delivery.available || !delivery.durable || counts.completed !== 0 || counts.recorded !== 0)) return false
  if (delivery.state === 'missing' && counts.missing === 0) return false
  if (delivery.state === 'attention' && (counts.failed + counts.uncertain === 0 || counts.missing !== 0)) return false
  if (delivery.state === 'non_durable' && delivery.durable) return false
  if (delivery.state === 'store_unavailable' && (delivery.available || delivery.durable || counts.missing !== counts.completed)) return false
  return true
}

async function buildCeoCycleView({ clientId, now, loadCycleState }) {
  const initial = selectCeoOutcome()
  if (!initial.ok) return unavailableCeoCycle('ceo_outcome_authority_invalid')
  const readyOutcomes = SUPERMEGA_HQ_AUTHORITY.outcomes
    .filter((outcome) => outcome.state === 'ready')
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id))
  const blockedConsequentialCount = SUPERMEGA_HQ_AUTHORITY.outcomes
    .filter((outcome) => outcome.state === 'blocked').length
  if (!clientId) {
    return unavailableCeoCycle('company_client_id_missing', {
      authorityId: initial.authorityId,
      authorityDigest: initial.authorityDigest,
      totalOutcomes: readyOutcomes.length,
      blockedConsequentialCount,
    })
  }

  let state
  try {
    state = await loadCycleState({
      clientId,
      authorityDigest: initial.authorityDigest,
      asOf: now.toISOString(),
      includeDelivery: true,
    })
  } catch {
    return unavailableCeoCycle('ceo_outcome_cycle_store_unavailable')
  }
  if (!state?.ok) return unavailableCeoCycle(state?.reason || 'ceo_outcome_cycle_store_unavailable')
  if (!validCycleState(state, { clientId, authorityDigest: initial.authorityDigest, asOf: now })) {
    return unavailableCeoCycle('ceo_outcome_cycle_state_invalid')
  }

  const selection = selectCeoOutcome({ completedOutcomeIds: state.completedOutcomeIds })
  if (!selection.ok) return unavailableCeoCycle(selection.reason || 'ceo_outcome_authority_invalid')
  const completed = new Set(state.completedOutcomeIds)
  const deliveryByOutcome = new Map(state.delivery.outcomes.map((outcome) => [outcome.outcomeId, outcome.status]))
  const nextId = selection.selected?.id || ''
  const deliveryReady = state.delivery.state === 'ready'
    && state.delivery.durable === true
    && state.delivery.counts.sent === state.completedCount
  const recordedComplete = selection.declined === true
  return {
    contract: CEO_CYCLE_VIEW_CONTRACT,
    available: true,
    durable: true,
    clientId,
    authorityId: selection.authorityId,
    authorityDigest: selection.authorityDigest,
    cycleId: state.cycleId,
    startsAt: state.startsAt,
    endsAt: state.endsAt,
    completedCount: state.completedCount,
    deliveredCount: state.delivery.counts.sent,
    totalOutcomes: readyOutcomes.length,
    completionRecorded: recordedComplete,
    cycleComplete: recordedComplete && deliveryReady,
    nextOutcome: selection.selected ? {
      id: selection.selected.id,
      title: selection.selected.title,
      team: selection.selected.team,
    } : null,
    outcomes: readyOutcomes.map((outcome) => {
      let status = outcome.id === nextId ? 'next' : 'queued'
      if (completed.has(outcome.id)) {
        const deliveryStatus = deliveryByOutcome.get(outcome.id)
        status = ['invalid_coverage', 'non_durable', 'store_unavailable'].includes(state.delivery.state)
          ? 'delivery_unverified'
          : deliveryStatus === 'sent' ? 'delivered'
            : deliveryStatus === 'failed' ? 'delivery_failed'
              : deliveryStatus === 'uncertain' ? 'delivery_uncertain' : 'delivery_missing'
      }
      return { id: outcome.id, title: outcome.title, team: outcome.team, status }
    }),
    delivery: {
      contract: state.delivery.contract,
      available: state.delivery.available,
      durable: state.delivery.durable,
      state: state.delivery.state,
      completed: state.delivery.counts.completed,
      recorded: state.delivery.counts.recorded,
      sent: state.delivery.counts.sent,
      failed: state.delivery.counts.failed,
      uncertain: state.delivery.counts.uncertain,
      missing: state.delivery.counts.missing,
      contentReturned: false,
    },
    blockedConsequentialCount,
    controls: {
      maxOutcomesPerCycle: 1,
      externalWrites: false,
      dynamicDelegation: false,
      recursiveDelegation: false,
      humanApprovalForConsequentialActions: true,
      deliveryRequiredForCycleComplete: true,
    },
  }
}

function statusFor(result) {
  if (result.ok) return 200
  if (['company_work_order_not_found', 'company_mission_not_found', 'ceo_outcome_not_found'].includes(result.reason)) return 404
  if ([
    'company_cycle_already_claimed',
    'company_work_order_already_claimed',
    'company_work_order_conflict',
    'company_work_order_cancel_not_allowed',
    'company_work_order_cancelled',
    'company_work_order_invalid_state',
    'company_work_order_plan_mismatch',
    'company_work_order_review_already_claimed',
    'company_work_order_review_conflict',
    'company_work_order_review_result_mismatch',
    'company_work_order_running',
    'company_work_order_transition_conflict',
    'company_evaluation_already_claimed',
    'company_evaluation_conflict',
    'company_evaluation_terminal_result_required',
    'ceo_outcome_already_claimed',
    'ceo_outcome_record_conflict',
    'ceo_outcome_record_mismatch',
    'ceo_outcome_evaluation_already_claimed',
    'ceo_outcome_evaluation_conflict',
    'ceo_outcome_action_already_claimed',
    'ceo_outcome_action_conflict',
    'ceo_outcome_action_evaluation_mismatch',
    'ceo_outcome_action_authority_stale',
    'ceo_outcome_action_success_measure_stale',
    'company_mission_already_claimed',
    'company_mission_conflict',
    'company_mission_handoff_mismatch',
    'company_mission_invalid_state',
    'company_mission_plan_mismatch',
    'company_mission_result_mismatch',
    'company_mission_stage_conflict',
    'company_mission_stage_locked',
    'company_mission_transition_conflict',
    'company_mission_work_order_mismatch',
    'company_mission_accepted_evaluation_required',
  ].includes(result.reason)) return 409
  if ([
    'company_capacity_exhausted',
  ].includes(result.reason)) return 429
  if ([
    'company_claim_unavailable',
    'company_capacity_unavailable',
    'company_durable_claim_required',
    'company_work_order_durable_claim_required',
    'company_work_order_state_unavailable',
    'company_work_order_store_unavailable',
    'company_work_order_review_durable_claim_required',
    'company_work_order_review_store_unavailable',
    'company_evaluation_durable_claim_required',
    'company_evaluation_store_unavailable',
    'company_operations_store_unavailable',
    'ceo_outcome_store_unavailable',
    'ceo_outcome_durable_claim_required',
    'ceo_outcome_evaluation_store_unavailable',
    'ceo_outcome_evaluation_durable_claim_required',
    'ceo_outcome_action_store_unavailable',
    'ceo_outcome_action_durable_claim_required',
    'ceo_outcome_action_authority_unavailable',
    'company_mission_durable_claim_required',
    'company_mission_store_unavailable',
    'company_mission_work_order_unavailable',
  ].includes(result.reason)) return 503
  if ([
    'company_role_budget_exceeded',
    'company_playbook_role_budget_exceeded',
    'company_work_order_not_reviewable',
    'company_work_order_proof_unavailable',
  ].includes(result.reason)) return 422
  if (result.status === 'failed') return 502
  return 400
}

function customerReviewScope(auth) {
  const scope = auth?.scope
  return auth?.role === 'customer'
    && scope?.kind === 'work_order_review'
    && /^company-order:[a-f0-9]{40}$/.test(String(scope.workOrderId || ''))
    && /^[a-f0-9]{64}$/.test(String(scope.resultHash || ''))
    ? scope
    : null
}

function customerReviewView(review) {
  if (!review || typeof review !== 'object' || Array.isArray(review)) return null
  return {
    binding: String(review.binding || ''),
    customerAuthenticated: review.customerAuthenticated === true,
    decision: String(review.decision || ''),
    statement: String(review.statement || ''),
    recordedAt: String(review.recordedAt || ''),
    resultHash: String(review.resultHash || ''),
    reviewHash: String(review.reviewHash || ''),
  }
}

function customerDeliveryView(workOrder) {
  const result = workOrder?.result && typeof workOrder.result === 'object' && !Array.isArray(workOrder.result)
    ? workOrder.result
    : {}
  const rawResults = Array.isArray(result.results)
    ? result.results
    : Array.isArray(result.recoveredResults) ? result.recoveredResults : []
  const results = rawResults.map((item) => {
    const safe = item && typeof item === 'object' && !Array.isArray(item) ? item : {}
    return {
      status: String(safe.status || 'unknown').slice(0, 40),
      ...(Object.hasOwn(safe, 'output') ? { output: safe.output } : {}),
      ...(safe.reason ? { reason: String(safe.reason).slice(0, 120) } : {}),
    }
  })
  return {
    workOrderId: String(workOrder?.workOrderId || ''),
    clientId: String(workOrder?.clientId || ''),
    cycleId: String(workOrder?.cycleId || ''),
    status: String(workOrder?.status || ''),
    completedAt: workOrder?.completedAt || null,
    resultHash: String(workOrder?.resultHash || ''),
    result: {
      status: String(result.status || workOrder?.status || 'unknown').slice(0, 40),
      actionMode: String(result.actionMode || 'draft_only').slice(0, 40),
      results,
    },
    review: customerReviewView(workOrder?.review),
  }
}

export async function handleAgentCompany(request = {}, options = {}) {
  const env = options.env || process.env
  const authorize = options.authorizeCompanyRequest || authorizeCompanyRequest
  const authorized = await authorize(request, options)
  if (!authorized.ok) {
    const unavailable = ['ops_key_not_configured', 'company_session_store_unavailable', 'company_auth_clock_invalid'].includes(authorized.reason)
    return { status: unavailable ? 503 : 401, json: { ok: false, reason: authorized.reason } }
  }
  const auth = authorized.auth

  const method = String(request.method || '').toUpperCase()
  if (method === 'GET') {
    const customerScope = customerReviewScope(auth)
    if (auth.role === 'customer') {
      if (!customerScope) return { status: 403, json: { ok: false, reason: 'company_customer_scope_invalid' } }
      return {
        status: 200,
        json: {
          ok: true,
          actionMode: 'proof_review_only',
          auth,
          customerReview: {
            scoped: true,
            workOrderId: customerScope.workOrderId,
            resultHash: customerScope.resultHash,
            proofAccess: true,
            immutableDecision: true,
            workspaceAccess: false,
            identity: 'tenant_bound_one_time_code_only',
            ssoOrMfa: false,
            legalSignature: false,
          },
        },
      }
    }
    const configuredClientId = String(options.clientId ?? env.SUPERMEGA_CLIENT_ID ?? '').trim()
    const protectedClientId = String(auth.clientId || configuredClientId).trim()
    const now = options.now instanceof Date ? options.now : new Date()
    const fetchHostedStatus = Object.hasOwn(options, 'fetchHostedStatus')
      ? options.fetchHostedStatus
      : options.opsKey !== undefined || options.authorizeCompanyRequest !== undefined
        ? null
        : globalThis.fetch
    const [ceoCycle, hostedActivation] = await Promise.all([
      buildCeoCycleView({
        clientId: protectedClientId,
        now,
        loadCycleState: options.loadCeoOutcomeCycleState || loadCeoOutcomeCycleState,
      }),
      buildHostedActivationView(fetchHostedStatus),
    ])
    return {
      status: 200,
      json: {
        ok: true,
        actionMode: 'draft_only',
        auth,
        ceoCycle,
        hostedActivation,
        agents: listCompanyAgents(),
        limits: {
          maxAgents: MAX_CYCLE_AGENTS,
          maxRoleBudget: MAX_CYCLE_ROLE_BUDGET,
          maxActiveAssignments: MAX_ACTIVE_COMPANY_ASSIGNMENTS,
          maxConcurrentCycles: MAX_RUNNING_COMPANY_CYCLES,
          capacityClaimContract: COMPANY_CAPACITY_CLAIM_CONTRACT,
          capacityClaimTtlSeconds: COMPANY_CAPACITY_CLAIM_TTL_SECONDS,
        },
        playbooks: {
          enabled: true,
          catalog: listCompanyPlaybooks(),
          staged: true,
          automaticQueue: false,
          automaticDispatch: false,
          dynamicDelegation: false,
          crossStageContext: false,
          handoff: 'owner_reviewed_redacted_output_only',
        },
        missions: {
          enabled: true,
          durable: true,
          maxList: MAX_COMPANY_MISSIONS,
          serverVerifiedStageGates: true,
          acceptedEvaluationRequired: true,
          reviewedHandoffDigestRequired: true,
          rawHandoffsStored: false,
          automaticQueue: false,
          automaticDispatch: false,
        },
        workOrders: {
          enabled: true,
          maxList: MAX_COMPANY_WORK_ORDERS,
          explicitDispatch: true,
          rawEvidenceReturned: false,
          deliveryProof: true,
          operatorRecordedReview: true,
          tenantBoundCustomerSessionReview: true,
          customerAuthentication: 'tenant_bound_one_time_code_only',
          customerSsoOrMfa: false,
          customerLegalSignature: false,
          explicitCancellation: true,
          cancelledEvidenceScrubbed: true,
        },
        operations: {
          enabled: true,
          windows: COMPANY_OPERATIONS_WINDOWS,
          targets: COMPANY_OPERATIONS_TARGETS,
          immutableReviews: true,
          workforceMetrics: true,
          rawEvidenceReturned: false,
          modelOutputReturned: false,
          customerSlaClaimed: false,
          ceoOutcomeMetrics: true,
          explicitOwnerOutcomeAcceptance: true,
          acceptedOutcomeEfficiency: true,
          ceoBriefTextReturned: false,
          providerRowsReturned: false,
          ownerDeliveryCoverage: true,
          ownerDeliveryContentReturned: false,
        },
      },
    }
  }
  if (method !== 'POST') return { status: 405, json: { ok: false, reason: 'method_not_allowed' } }

  const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
    ? { ...request.body }
    : {}
  const action = String(body.action || '').trim()
  delete body.action
  if (![
    'plan',
    'playbook-plan',
    'mission-create',
    'mission-list',
    'mission-get',
    'mission-stage-queue',
    'mission-stage-advance',
    'run',
    'work-order-create',
    'work-order-list',
    'work-order-get',
    'work-order-run',
    'work-order-cancel',
    'work-order-proof',
    'work-order-review',
    'work-order-evaluate',
    'ceo-outcome-evaluate',
    'ceo-outcome-promote',
    'operations-report',
  ].includes(action)) {
    return { status: 400, json: { ok: false, reason: 'company_invalid_action' } }
  }
  if (!companyRoleAllows(auth.role, action)) {
    return { status: 403, json: { ok: false, reason: 'company_action_forbidden' } }
  }
  const configuredClientId = String(options.clientId ?? env.SUPERMEGA_CLIENT_ID ?? '').trim()
  if (configuredClientId && auth.clientId && auth.clientId !== configuredClientId) {
    return { status: 403, json: { ok: false, reason: 'company_client_mismatch' } }
  }
  const authorizedClientId = auth.clientId || configuredClientId
  if (authorizedClientId && String(body.clientId || '').trim() !== authorizedClientId) {
    return { status: 403, json: { ok: false, reason: 'company_client_mismatch' } }
  }
  const customerScope = customerReviewScope(auth)
  if (auth.role === 'customer') {
    if (!customerScope) return { status: 403, json: { ok: false, reason: 'company_customer_scope_invalid' } }
    if (String(body.workOrderId || '').trim() !== customerScope.workOrderId) {
      return { status: 403, json: { ok: false, reason: 'company_customer_scope_mismatch' } }
    }
    if (action === 'work-order-review') {
      if (String(body.resultHash || '').trim() !== customerScope.resultHash) {
        return { status: 403, json: { ok: false, reason: 'company_customer_scope_mismatch' } }
      }
      const suppliedIdentityFields = ['reviewerName', 'source', 'recordedBy']
        .filter((field) => Object.hasOwn(body, field))
      if (suppliedIdentityFields.length) {
        return { status: 400, json: { ok: false, reason: 'company_customer_review_identity_server_set' } }
      }
      body.reviewerName = auth.operatorId
      body.source = 'customer_session'
      body.recordedBy = auth.operatorId
    }
  } else if (auth.mode === 'session' && action === 'work-order-review') body.recordedBy = auth.operatorId

  const plan = options.planCompanyCycle || planCompanyCycle
  const planPlaybook = options.planCompanyPlaybook || planCompanyPlaybook
  const createMission = options.createCompanyMission || createCompanyMission
  const listMissions = options.listCompanyMissions || listCompanyMissions
  const getMission = options.getCompanyMission || getCompanyMission
  const queueMissionStage = options.queueCompanyMissionStage || queueCompanyMissionStage
  const advanceMissionStage = options.advanceCompanyMissionStage || advanceCompanyMissionStage
  const run = options.runCompanyCycle || runCompanyCycle
  const createOrder = options.createCompanyWorkOrder || createCompanyWorkOrder
  const listOrders = options.listCompanyWorkOrders || listCompanyWorkOrders
  const getOrder = options.getCompanyWorkOrder || getCompanyWorkOrder
  const runOrder = options.runCompanyWorkOrder || runCompanyWorkOrder
  const cancelOrder = options.cancelCompanyWorkOrder || cancelCompanyWorkOrder
  const getProof = options.getCompanyWorkOrderProof || getCompanyWorkOrderProof
  const reviewOrder = options.reviewCompanyWorkOrder || reviewCompanyWorkOrder
  const evaluateOrder = options.evaluateCompanyWorkOrder || evaluateCompanyWorkOrder
  const evaluateOutcome = options.evaluateCeoOutcomeDelivery || evaluateCeoOutcomeDelivery
  const promoteOutcome = options.promoteAcceptedCeoOutcomeAction || promoteAcceptedCeoOutcomeAction
  const operationsReport = options.buildCompanyOperationsReport || buildCompanyOperationsReport
  let customerScopedOrder = null
  if (auth.role === 'customer') {
    const scopedOrder = await getOrder({
      clientId: authorizedClientId,
      workOrderId: customerScope.workOrderId,
    })
    if (!scopedOrder.ok) return { status: statusFor(scopedOrder), json: scopedOrder }
    if (String(scopedOrder.workOrder?.resultHash || '') !== customerScope.resultHash) {
      return { status: 403, json: { ok: false, reason: 'company_customer_scope_mismatch' } }
    }
    customerScopedOrder = scopedOrder
    if (action === 'work-order-get') {
      return {
        status: 200,
        json: {
          ok: true,
          mode: 'work_order_get',
          workOrder: customerDeliveryView(scopedOrder.workOrder),
        },
      }
    }
  }
  const result = action === 'plan' ? await plan(body)
    : action === 'playbook-plan' ? await planPlaybook(body)
      : action === 'mission-create' ? await createMission(body)
        : action === 'mission-list' ? await listMissions(body)
          : action === 'mission-get' ? await getMission(body)
            : action === 'mission-stage-queue' ? await queueMissionStage(body)
              : action === 'mission-stage-advance' ? await advanceMissionStage(body)
                : action === 'run' ? await run(body)
                  : action === 'work-order-create' ? await createOrder(body)
                    : action === 'work-order-list' ? await listOrders(body)
                      : action === 'work-order-get' ? await getOrder(body)
                        : action === 'work-order-run' ? await runOrder(body)
                          : action === 'work-order-cancel' ? await cancelOrder(body)
                            : action === 'work-order-proof' ? await getProof(body)
                              : action === 'work-order-review' ? await reviewOrder(body, auth.role === 'customer'
                                ? {
                                    reviewProvenance: {
                                      binding: 'tenant_bound_customer_session',
                                      customerAuthenticated: true,
                                      authenticatedReviewerId: auth.operatorId,
                                    },
                                  }
                                : {})
                                : action === 'work-order-evaluate' ? await evaluateOrder(body)
                                  : action === 'ceo-outcome-evaluate' ? await evaluateOutcome(body)
                                    : action === 'ceo-outcome-promote' ? await promoteOutcome(body)
                                      : await operationsReport(body)
  if (auth.role === 'customer' && action === 'work-order-review' && result.ok) {
    return {
      status: 200,
      json: {
        ok: true,
        mode: result.mode,
        replayed: result.replayed === true,
        review: customerReviewView(result.review),
        workOrder: customerDeliveryView({ ...customerScopedOrder.workOrder, review: result.review }),
      },
    }
  }
  return { status: statusFor(result), json: result }
}

export default async function handler(req, res) {
  const result = await handleAgentCompany({ method: req.method, headers: req.headers, body: req.body })
  res.setHeader('Cache-Control', 'no-store')
  res.status(result.status).json(result.json)
}
