// Ops-gated planner and runner for bounded Agent Company cycles.

import crypto from 'node:crypto'

import {
  listCompanyAgents,
  MAX_CYCLE_AGENTS,
  MAX_CYCLE_ROLE_BUDGET,
  planCompanyCycle,
  runCompanyCycle,
} from '../agent-company.mjs'
import {
  createCompanyWorkOrder,
  getCompanyWorkOrder,
  getCompanyWorkOrderProof,
  listCompanyWorkOrders,
  MAX_COMPANY_WORK_ORDERS,
  reviewCompanyWorkOrder,
  runCompanyWorkOrder,
} from '../agent-company-work-orders.mjs'

function constantTimeEqual(a, b) {
  const left = crypto.createHash('sha256').update(String(a)).digest()
  const right = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(left, right)
}

function statusFor(result) {
  if (result.ok) return 200
  if (result.reason === 'company_work_order_not_found') return 404
  if ([
    'company_cycle_already_claimed',
    'company_work_order_already_claimed',
    'company_work_order_conflict',
    'company_work_order_plan_mismatch',
    'company_work_order_review_already_claimed',
    'company_work_order_review_conflict',
    'company_work_order_review_result_mismatch',
    'company_work_order_running',
  ].includes(result.reason)) return 409
  if ([
    'company_claim_unavailable',
    'company_durable_claim_required',
    'company_work_order_durable_claim_required',
    'company_work_order_state_unavailable',
    'company_work_order_store_unavailable',
    'company_work_order_review_durable_claim_required',
    'company_work_order_review_store_unavailable',
  ].includes(result.reason)) return 503
  if (['company_role_budget_exceeded', 'company_work_order_not_reviewable', 'company_work_order_proof_unavailable'].includes(result.reason)) return 422
  if (result.status === 'failed') return 502
  return 400
}

export async function handleAgentCompany(request = {}, options = {}) {
  const env = options.env || process.env
  const opsKey = String(options.opsKey ?? env.SUPERMEGA_OPS_KEY ?? '').trim()
  if (!opsKey) return { status: 503, json: { ok: false, reason: 'ops_key_not_configured' } }
  if (!constantTimeEqual(String(request.headers?.['x-ops-key'] || ''), opsKey)) {
    return { status: 401, json: { ok: false, reason: 'unauthorized' } }
  }

  const method = String(request.method || '').toUpperCase()
  if (method === 'GET') {
    return {
      status: 200,
      json: {
        ok: true,
        actionMode: 'draft_only',
        agents: listCompanyAgents(),
        limits: { maxAgents: MAX_CYCLE_AGENTS, maxRoleBudget: MAX_CYCLE_ROLE_BUDGET },
        workOrders: {
          enabled: true,
          maxList: MAX_COMPANY_WORK_ORDERS,
          explicitDispatch: true,
          rawEvidenceReturned: false,
          deliveryProof: true,
          operatorRecordedReview: true,
          customerAuthenticated: false,
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
    'run',
    'work-order-create',
    'work-order-list',
    'work-order-get',
    'work-order-run',
    'work-order-proof',
    'work-order-review',
  ].includes(action)) {
    return { status: 400, json: { ok: false, reason: 'company_invalid_action' } }
  }
  const configuredClientId = String(options.clientId ?? env.SUPERMEGA_CLIENT_ID ?? '').trim()
  if (configuredClientId && String(body.clientId || '').trim() !== configuredClientId) {
    return { status: 403, json: { ok: false, reason: 'company_client_mismatch' } }
  }

  const plan = options.planCompanyCycle || planCompanyCycle
  const run = options.runCompanyCycle || runCompanyCycle
  const createOrder = options.createCompanyWorkOrder || createCompanyWorkOrder
  const listOrders = options.listCompanyWorkOrders || listCompanyWorkOrders
  const getOrder = options.getCompanyWorkOrder || getCompanyWorkOrder
  const runOrder = options.runCompanyWorkOrder || runCompanyWorkOrder
  const getProof = options.getCompanyWorkOrderProof || getCompanyWorkOrderProof
  const reviewOrder = options.reviewCompanyWorkOrder || reviewCompanyWorkOrder
  const result = action === 'plan' ? await plan(body)
    : action === 'run' ? await run(body)
      : action === 'work-order-create' ? await createOrder(body)
        : action === 'work-order-list' ? await listOrders(body)
          : action === 'work-order-get' ? await getOrder(body)
            : action === 'work-order-run' ? await runOrder(body)
              : action === 'work-order-proof' ? await getProof(body)
                : await reviewOrder(body)
  return { status: statusFor(result), json: result }
}

export default async function handler(req, res) {
  const result = await handleAgentCompany({ method: req.method, headers: req.headers, body: req.body })
  res.setHeader('Cache-Control', 'no-store')
  res.status(result.status).json(result.json)
}
