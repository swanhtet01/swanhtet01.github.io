import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { handleAgentCompany } from './agent-company.mjs'

const KEY = 'ops-secret'
const validBody = {
  action: 'plan',
  clientId: 'client-acme',
  cycleId: 'morning-1',
  agents: ['operations-analyst'],
  evidence: { 'operations-analyst': { revenue_mmk: 300000 } },
  roleBudget: 3,
}
const request = (patch = {}) => ({
  method: 'POST',
  headers: { 'x-ops-key': KEY },
  body: validBody,
  ...patch,
})

test('Agent Company API is ops-gated and method-restricted', async () => {
  assert.equal((await handleAgentCompany(request(), { env: {} })).status, 503)
  assert.equal((await handleAgentCompany(request({ headers: {} }), { opsKey: KEY })).status, 401)
  assert.equal((await handleAgentCompany(request({ method: 'PUT' }), { opsKey: KEY })).status, 405)
})

test('GET returns the protected fixed roster and hard limits', async () => {
  const result = await handleAgentCompany(request({ method: 'GET', body: undefined }), { opsKey: KEY })
  assert.equal(result.status, 200)
  assert.equal(result.json.actionMode, 'draft_only')
  assert.equal(result.json.agents.length, 8)
  assert.equal(result.json.limits.maxAgents, 2)
  assert.equal(result.json.limits.maxRoleBudget, 8)
  assert.equal(result.json.workOrders.enabled, true)
  assert.equal(result.json.workOrders.explicitDispatch, true)
  assert.equal(result.json.workOrders.rawEvidenceReturned, false)
  assert.equal(result.json.workOrders.deliveryProof, true)
  assert.equal(result.json.workOrders.operatorRecordedReview, true)
  assert.equal(result.json.workOrders.customerAuthenticated, false)
})

test('POST plans without claiming a run or accepting an implicit action', async () => {
  let runs = 0
  const result = await handleAgentCompany(request(), {
    opsKey: KEY,
    runCompanyCycle: async () => { runs += 1; return { ok: true } },
  })
  assert.equal(result.status, 200)
  assert.equal(result.json.mode, 'plan')
  assert.equal(result.json.budget.plannedRoles, 3)
  assert.equal(runs, 0)
  assert.equal((await handleAgentCompany(request({ body: { ...validBody, action: '' } }), { opsKey: KEY })).status, 400)
})

test('isolated deployments reject a different client id', async () => {
  const result = await handleAgentCompany(request(), { opsKey: KEY, clientId: 'client-other' })
  assert.equal(result.status, 403)
  assert.equal(result.json.reason, 'company_client_mismatch')
})

test('POST run maps duplicate and unavailable durable claims cleanly', async () => {
  const duplicate = await handleAgentCompany(request({ body: { ...validBody, action: 'run' } }), {
    opsKey: KEY,
    runCompanyCycle: async () => ({ ok: false, reason: 'company_cycle_already_claimed', status: 'duplicate' }),
  })
  assert.equal(duplicate.status, 409)
  const blocked = await handleAgentCompany(request({ body: { ...validBody, action: 'run' } }), {
    opsKey: KEY,
    runCompanyCycle: async () => ({ ok: false, reason: 'company_durable_claim_required', status: 'blocked' }),
  })
  assert.equal(blocked.status, 503)
})

test('protected work-order actions delegate to the durable queue contract', async () => {
  const calls = []
  const options = {
    opsKey: KEY,
    createCompanyWorkOrder: async (body) => { calls.push(['create', body]); return { ok: true, mode: 'work_order_create' } },
    listCompanyWorkOrders: async (body) => { calls.push(['list', body]); return { ok: true, mode: 'work_order_list' } },
    getCompanyWorkOrder: async (body) => { calls.push(['get', body]); return { ok: true, mode: 'work_order_get' } },
    runCompanyWorkOrder: async (body) => { calls.push(['run', body]); return { ok: true, mode: 'work_order_run' } },
    getCompanyWorkOrderProof: async (body) => { calls.push(['proof', body]); return { ok: true, mode: 'work_order_proof' } },
    reviewCompanyWorkOrder: async (body) => { calls.push(['review', body]); return { ok: true, mode: 'work_order_review' } },
  }
  const actions = [
    ['work-order-create', validBody],
    ['work-order-list', { clientId: 'client-acme', limit: 10 }],
    ['work-order-get', { clientId: 'client-acme', workOrderId: 'company-order:abc' }],
    ['work-order-run', { clientId: 'client-acme', workOrderId: 'company-order:abc', planHash: 'a'.repeat(64), confirmation: 'RUN company-order:abc' }],
    ['work-order-proof', { clientId: 'client-acme', workOrderId: 'company-order:abc' }],
    ['work-order-review', { clientId: 'client-acme', workOrderId: 'company-order:abc', resultHash: 'a'.repeat(64), decision: 'accepted', reviewerName: 'Aye Aye', source: 'chat', statement: 'Accepted.', recordedBy: 'Swan', confirmation: 'ACCEPT company-order:abc hash' }],
  ]
  for (const [action, body] of actions) {
    const result = await handleAgentCompany(request({ body: { ...body, action } }), options)
    assert.equal(result.status, 200)
  }
  assert.deepEqual(calls.map(([name]) => name), ['create', 'list', 'get', 'run', 'proof', 'review'])
  assert.equal(calls.every(([, body]) => !('action' in body)), true)
})

test('work-order API maps isolation, conflicts, and unavailable storage without leaking through GET', async () => {
  const mismatch = await handleAgentCompany(request({
    body: { action: 'work-order-list', clientId: 'client-other', limit: 10 },
  }), { opsKey: KEY, clientId: 'client-acme' })
  assert.equal(mismatch.status, 403)

  const conflict = await handleAgentCompany(request({
    body: { action: 'work-order-run', clientId: 'client-acme' },
  }), {
    opsKey: KEY,
    runCompanyWorkOrder: async () => ({ ok: false, reason: 'company_work_order_plan_mismatch' }),
  })
  assert.equal(conflict.status, 409)

  const unavailable = await handleAgentCompany(request({
    body: { action: 'work-order-create', clientId: 'client-acme' },
  }), {
    opsKey: KEY,
    createCompanyWorkOrder: async () => ({ ok: false, reason: 'company_work_order_store_unavailable' }),
  })
  assert.equal(unavailable.status, 503)

  const staleReview = await handleAgentCompany(request({
    body: { action: 'work-order-review', clientId: 'client-acme' },
  }), {
    opsKey: KEY,
    reviewCompanyWorkOrder: async () => ({ ok: false, reason: 'company_work_order_review_result_mismatch' }),
  })
  assert.equal(staleReview.status, 409)

  const notReviewable = await handleAgentCompany(request({
    body: { action: 'work-order-proof', clientId: 'client-acme' },
  }), {
    opsKey: KEY,
    getCompanyWorkOrderProof: async () => ({ ok: false, reason: 'company_work_order_proof_unavailable' }),
  })
  assert.equal(notReviewable.status, 422)
})

test('API runtime has no connector, approval execution, or process-launch path', async () => {
  const source = await readFile(new URL('./agent-company.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /approval-actions|connectors|child_process|execFile|spawn/)
})
