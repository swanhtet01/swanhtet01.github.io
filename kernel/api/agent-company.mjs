// Tenant-session or owner-key gated planner and runner for bounded Agent Company cycles.

import {
  listCompanyAgents,
  COMPANY_CAPACITY_CLAIM_CONTRACT,
  COMPANY_CAPACITY_CLAIM_TTL_SECONDS,
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
  evaluateCeoOutcomeDelivery,
  evaluateCompanyWorkOrder,
} from '../agent-company-operations.mjs'
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
    return {
      status: 200,
      json: {
        ok: true,
        actionMode: 'draft_only',
        auth,
        agents: listCompanyAgents(),
        limits: {
          maxAgents: MAX_CYCLE_AGENTS,
          maxRoleBudget: MAX_CYCLE_ROLE_BUDGET,
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
