// Ops-gated planner and runner for bounded Agent Company cycles.

import crypto from 'node:crypto'

import {
  listCompanyAgents,
  MAX_CYCLE_AGENTS,
  MAX_CYCLE_ROLE_BUDGET,
  planCompanyCycle,
  runCompanyCycle,
} from '../agent-company.mjs'

function constantTimeEqual(a, b) {
  const left = crypto.createHash('sha256').update(String(a)).digest()
  const right = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(left, right)
}

function statusFor(result) {
  if (result.ok) return 200
  if (result.reason === 'company_cycle_already_claimed') return 409
  if (result.reason === 'company_claim_unavailable' || result.reason === 'company_durable_claim_required') return 503
  if (result.reason === 'company_role_budget_exceeded') return 422
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
      },
    }
  }
  if (method !== 'POST') return { status: 405, json: { ok: false, reason: 'method_not_allowed' } }

  const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
    ? { ...request.body }
    : {}
  const action = String(body.action || '').trim()
  delete body.action
  if (action !== 'plan' && action !== 'run') {
    return { status: 400, json: { ok: false, reason: 'company_invalid_action' } }
  }
  const configuredClientId = String(options.clientId ?? env.SUPERMEGA_CLIENT_ID ?? '').trim()
  if (configuredClientId && String(body.clientId || '').trim() !== configuredClientId) {
    return { status: 403, json: { ok: false, reason: 'company_client_mismatch' } }
  }

  const plan = options.planCompanyCycle || planCompanyCycle
  const run = options.runCompanyCycle || runCompanyCycle
  const result = action === 'plan' ? await plan(body) : await run(body)
  return { status: statusFor(result), json: result }
}

export default async function handler(req, res) {
  const result = await handleAgentCompany({ method: req.method, headers: req.headers, body: req.body })
  res.setHeader('Cache-Control', 'no-store')
  res.status(result.status).json(result.json)
}
