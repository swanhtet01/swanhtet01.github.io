// Ops-gated approval inbox. Agents may draft; only explicit owner commands approve or execute.

import { usableOpsKey } from '../ops-key.mjs'
import { createHash, timingSafeEqual } from 'node:crypto'

import {
  approveAction,
  createActionDraft,
  executeAction,
  listActionApprovals,
  recoverAction,
  rejectAction,
  retryAction,
} from '../approval-actions.mjs'

function equal(a, b) {
  const left = createHash('sha256').update(String(a)).digest()
  const right = createHash('sha256').update(String(b)).digest()
  return timingSafeEqual(left, right)
}

function statusFor(result, successStatus = 200) {
  if (result.ok) return successStatus
  if (result.reason === 'approval_store_unavailable') return 503
  if (result.reason === 'approval_not_found') return 404
  if (result.reason === 'approval_execution_uncertain' || result.reason === 'approval_recovery_inconclusive') return 202
  if (/conflict|not_draft|not_approved|not_executing|not_failed|not_rejectable|lease_active|hash_mismatch/.test(result.reason || '')) return 409
  return 400
}

export async function handleApprovals(request = {}, options = {}) {
  const env = options.env || process.env
  const opsKey = usableOpsKey(options.opsKey ?? env.SUPERMEGA_OPS_KEY)
  if (!opsKey) return { status: 503, json: { ok: false, reason: 'ops_key_not_configured' } }
  if (!equal(request.headers?.['x-ops-key'] || '', opsKey)) {
    return { status: 401, json: { ok: false, reason: 'unauthorized' } }
  }
  const method = String(request.method || 'GET').toUpperCase()
  if (method === 'GET') {
    const result = await (options.listActionApprovals || listActionApprovals)({
      status: request.query?.status,
      clientId: request.query?.clientId,
      limit: request.query?.limit,
    }, options)
    return { status: statusFor(result), json: result }
  }
  if (method !== 'POST') return { status: 405, json: { ok: false, reason: 'method_not_allowed' } }

  const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body) ? request.body : {}
  const command = String(body.command || '').trim()
  const actor = String(request.headers?.['x-operator-id'] || body.actor || 'owner').trim().slice(0, 80)
  let result
  if (command === 'create') result = await (options.createActionDraft || createActionDraft)(body, options)
  else if (command === 'approve') result = await (options.approveAction || approveAction)({ id: body.id, payloadHash: body.payloadHash, actor }, options)
  else if (command === 'reject') result = await (options.rejectAction || rejectAction)({ id: body.id, payloadHash: body.payloadHash, actor, reason: body.reason }, options)
  else if (command === 'execute') result = await (options.executeAction || executeAction)({ id: body.id, payloadHash: body.payloadHash }, options)
  else if (command === 'recover') result = await (options.recoverAction || recoverAction)({ id: body.id }, options)
  else if (command === 'retry') result = await (options.retryAction || retryAction)({ id: body.id, payloadHash: body.payloadHash }, options)
  else result = { ok: false, reason: 'approval_unknown_command' }
  return { status: statusFor(result, command === 'create' ? 201 : 200), json: result }
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const result = await handleApprovals({
    method: req.method,
    headers: req.headers,
    query: Object.fromEntries(url.searchParams),
    body: req.body,
  })
  res.setHeader('Cache-Control', 'no-store')
  res.status(result.status).json(result.json)
}
