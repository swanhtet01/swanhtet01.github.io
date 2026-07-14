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
  assert.equal(result.json.agents.length, 15)
  assert.equal(result.json.agents.every((agent) => agent.evidenceHint), true)
  assert.equal(result.json.limits.maxAgents, 2)
  assert.equal(result.json.limits.maxRoleBudget, 8)
  assert.equal(result.json.playbooks.enabled, true)
  assert.equal(result.json.playbooks.catalog.length, 8)
  assert.equal(result.json.playbooks.staged, true)
  assert.equal(result.json.playbooks.automaticQueue, false)
  assert.equal(result.json.playbooks.automaticDispatch, false)
  assert.equal(result.json.playbooks.dynamicDelegation, false)
  assert.equal(result.json.playbooks.crossStageContext, false)
  assert.equal(result.json.playbooks.handoff, 'owner_reviewed_redacted_output_only')
  assert.equal(result.json.missions.enabled, true)
  assert.equal(result.json.missions.durable, true)
  assert.equal(result.json.missions.maxList, 20)
  assert.equal(result.json.missions.serverVerifiedStageGates, true)
  assert.equal(result.json.missions.acceptedEvaluationRequired, true)
  assert.equal(result.json.missions.reviewedHandoffDigestRequired, true)
  assert.equal(result.json.missions.rawHandoffsStored, false)
  assert.equal(result.json.missions.automaticQueue, false)
  assert.equal(result.json.missions.automaticDispatch, false)
  assert.equal(result.json.workOrders.enabled, true)
  assert.equal(result.json.workOrders.explicitDispatch, true)
  assert.equal(result.json.workOrders.rawEvidenceReturned, false)
  assert.equal(result.json.workOrders.deliveryProof, true)
  assert.equal(result.json.workOrders.operatorRecordedReview, true)
  assert.equal(result.json.workOrders.customerAuthenticated, false)
  assert.equal(result.json.workOrders.explicitCancellation, true)
  assert.equal(result.json.workOrders.cancelledEvidenceScrubbed, true)
  assert.equal(result.json.operations.enabled, true)
  assert.deepEqual(result.json.operations.windows, [7, 30, 90])
  assert.equal(result.json.operations.immutableReviews, true)
  assert.equal(result.json.operations.rawEvidenceReturned, false)
  assert.equal(result.json.operations.modelOutputReturned, false)
  assert.equal(result.json.operations.workforceMetrics, true)
  assert.equal(result.json.operations.customerSlaClaimed, false)
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

test('POST playbook planning delegates only to the plan-only workforce contract', async () => {
  const calls = []
  const body = {
    action: 'playbook-plan',
    clientId: 'client-acme',
    missionId: 'mission-1',
    playbookId: 'source-to-decision',
  }
  const result = await handleAgentCompany(request({ body }), {
    opsKey: KEY,
    planCompanyPlaybook: async (input) => {
      calls.push(input)
      return { ok: true, mode: 'playbook_plan', actionMode: 'plan_only' }
    },
  })
  assert.equal(result.status, 200)
  assert.equal(result.json.mode, 'playbook_plan')
  assert.deepEqual(calls, [{ clientId: 'client-acme', missionId: 'mission-1', playbookId: 'source-to-decision' }])
})

test('protected mission actions delegate only to the durable staged mission contract', async () => {
  const calls = []
  const options = {
    opsKey: KEY,
    createCompanyMission: async (body) => { calls.push(['create', body]); return { ok: true, mode: 'mission_create' } },
    listCompanyMissions: async (body) => { calls.push(['list', body]); return { ok: true, mode: 'mission_list' } },
    getCompanyMission: async (body) => { calls.push(['get', body]); return { ok: true, mode: 'mission_get' } },
    queueCompanyMissionStage: async (body) => { calls.push(['queue', body]); return { ok: true, mode: 'mission_stage_queue' } },
    advanceCompanyMissionStage: async (body) => { calls.push(['advance', body]); return { ok: true, mode: 'mission_stage_advance' } },
  }
  const missionRunId = `company-mission:${'1'.repeat(40)}`
  const planHash = 'a'.repeat(64)
  const workOrderId = `company-order:${'2'.repeat(40)}`
  const stageId = 'mission-1:stage:1'
  const actions = [
    ['mission-create', { clientId: 'client-acme', missionId: 'mission-1', playbookId: 'source-to-decision' }],
    ['mission-list', { clientId: 'client-acme', limit: 10 }],
    ['mission-get', { clientId: 'client-acme', missionRunId }],
    ['mission-stage-queue', { clientId: 'client-acme', missionRunId, missionPlanHash: planHash, stageId, evidence: 'approved facts', confirmation: `QUEUE ${missionRunId} ${stageId} ${planHash}` }],
    ['mission-stage-advance', { clientId: 'client-acme', missionRunId, missionPlanHash: planHash, stageId, workOrderId, resultHash: 'b'.repeat(64), nextStageEvidence: 'reviewed handoff', confirmation: `ADVANCE ${missionRunId} ${stageId} ${workOrderId} ${'b'.repeat(64)}` }],
  ]
  for (const [action, body] of actions) {
    const result = await handleAgentCompany(request({ body: { action, ...body } }), options)
    assert.equal(result.status, 200)
  }
  assert.deepEqual(calls.map(([name]) => name), ['create', 'list', 'get', 'queue', 'advance'])
  assert.equal(calls.every(([, body]) => !('action' in body)), true)
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
    cancelCompanyWorkOrder: async (body) => { calls.push(['cancel', body]); return { ok: true, mode: 'work_order_cancel' } },
    getCompanyWorkOrderProof: async (body) => { calls.push(['proof', body]); return { ok: true, mode: 'work_order_proof' } },
    reviewCompanyWorkOrder: async (body) => { calls.push(['review', body]); return { ok: true, mode: 'work_order_review' } },
    evaluateCompanyWorkOrder: async (body) => { calls.push(['evaluate', body]); return { ok: true, mode: 'work_order_evaluate' } },
    buildCompanyOperationsReport: async (body) => { calls.push(['report', body]); return { ok: true, mode: 'operations_report' } },
  }
  const actions = [
    ['work-order-create', validBody],
    ['work-order-list', { clientId: 'client-acme', limit: 10 }],
    ['work-order-get', { clientId: 'client-acme', workOrderId: 'company-order:abc' }],
    ['work-order-run', { clientId: 'client-acme', workOrderId: 'company-order:abc', planHash: 'a'.repeat(64), confirmation: 'RUN company-order:abc' }],
    ['work-order-cancel', { clientId: 'client-acme', workOrderId: 'company-order:abc', planHash: 'a'.repeat(64), confirmation: 'CANCEL AND SCRUB company-order:abc hash' }],
    ['work-order-proof', { clientId: 'client-acme', workOrderId: 'company-order:abc' }],
    ['work-order-review', { clientId: 'client-acme', workOrderId: 'company-order:abc', resultHash: 'a'.repeat(64), decision: 'accepted', reviewerName: 'Aye Aye', source: 'chat', statement: 'Accepted.', recordedBy: 'Swan', confirmation: 'ACCEPT company-order:abc hash' }],
    ['work-order-evaluate', { clientId: 'client-acme', workOrderId: 'company-order:abc', planHash: 'a'.repeat(64), verdict: 'accepted', checks: { accurate: true, complete: true, usable: true, boundarySafe: true }, confirmation: 'EVALUATE company-order:abc' }],
    ['operations-report', { clientId: 'client-acme', windowDays: 30 }],
  ]
  for (const [action, body] of actions) {
    const result = await handleAgentCompany(request({ body: { ...body, action } }), options)
    assert.equal(result.status, 200)
  }
  assert.deepEqual(calls.map(([name]) => name), ['create', 'list', 'get', 'run', 'cancel', 'proof', 'review', 'evaluate', 'report'])
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

  const evaluationConflict = await handleAgentCompany(request({
    body: { action: 'work-order-evaluate', clientId: 'client-acme' },
  }), {
    opsKey: KEY,
    evaluateCompanyWorkOrder: async () => ({ ok: false, reason: 'company_evaluation_conflict' }),
  })
  assert.equal(evaluationConflict.status, 409)

  const reportUnavailable = await handleAgentCompany(request({
    body: { action: 'operations-report', clientId: 'client-acme', windowDays: 30 },
  }), {
    opsKey: KEY,
    buildCompanyOperationsReport: async () => ({ ok: false, reason: 'company_operations_store_unavailable' }),
  })
  assert.equal(reportUnavailable.status, 503)

  const cancelled = await handleAgentCompany(request({
    body: { action: 'work-order-run', clientId: 'client-acme' },
  }), {
    opsKey: KEY,
    runCompanyWorkOrder: async () => ({ ok: false, reason: 'company_work_order_cancelled' }),
  })
  assert.equal(cancelled.status, 409)

  const cancelUnavailable = await handleAgentCompany(request({
    body: { action: 'work-order-cancel', clientId: 'client-acme' },
  }), {
    opsKey: KEY,
    cancelCompanyWorkOrder: async () => ({ ok: false, reason: 'company_work_order_store_unavailable' }),
  })
  assert.equal(cancelUnavailable.status, 503)

  const missionNotFound = await handleAgentCompany(request({
    body: { action: 'mission-get', clientId: 'client-acme', missionRunId: 'company-mission:none' },
  }), {
    opsKey: KEY,
    getCompanyMission: async () => ({ ok: false, reason: 'company_mission_not_found' }),
  })
  assert.equal(missionNotFound.status, 404)

  const missionGate = await handleAgentCompany(request({
    body: { action: 'mission-stage-advance', clientId: 'client-acme' },
  }), {
    opsKey: KEY,
    advanceCompanyMissionStage: async () => ({ ok: false, reason: 'company_mission_accepted_evaluation_required' }),
  })
  assert.equal(missionGate.status, 409)

  const missionUnavailable = await handleAgentCompany(request({
    body: { action: 'mission-create', clientId: 'client-acme' },
  }), {
    opsKey: KEY,
    createCompanyMission: async () => ({ ok: false, reason: 'company_mission_store_unavailable' }),
  })
  assert.equal(missionUnavailable.status, 503)
})

test('API runtime has no connector, approval execution, or process-launch path', async () => {
  const source = await readFile(new URL('./agent-company.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /approval-actions|connectors|child_process|execFile|spawn/)
})
