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
  assert.equal(result.json.auth.mode, 'owner')
  assert.equal(result.json.auth.role, 'owner')
  assert.deepEqual(result.json.auth.allowedActions, ['*'])
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
  assert.equal(result.json.workOrders.tenantBoundCustomerSessionReview, true)
  assert.equal(result.json.workOrders.customerAuthentication, 'tenant_bound_one_time_code_only')
  assert.equal(result.json.workOrders.customerSsoOrMfa, false)
  assert.equal(result.json.workOrders.customerLegalSignature, false)
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

test('tenant sessions bind one client and enforce viewer, reviewer, and operator roles', async () => {
  const session = (role) => async () => ({
    ok: true,
    auth: {
      mode: 'session',
      clientId: 'client-acme',
      operatorId: `ops.${role}`,
      role,
      issuedAt: '2026-07-14T09:00:00.000Z',
      expiresAt: '2026-07-14T17:00:00.000Z',
      allowedActions: role === 'operator' ? ['*'] : [],
    },
  })
  const viewerGet = await handleAgentCompany(request({ method: 'GET', headers: {}, body: undefined }), {
    authorizeCompanyRequest: session('viewer'),
  })
  assert.equal(viewerGet.status, 200)
  assert.equal(viewerGet.json.auth.clientId, 'client-acme')
  assert.equal(viewerGet.json.auth.role, 'viewer')

  const listed = []
  const viewerList = await handleAgentCompany(request({
    headers: {},
    body: { action: 'mission-list', clientId: 'client-acme', limit: 10 },
  }), {
    authorizeCompanyRequest: session('viewer'),
    listCompanyMissions: async (body) => { listed.push(body); return { ok: true, missions: [] } },
  })
  assert.equal(viewerList.status, 200)
  assert.deepEqual(listed, [{ clientId: 'client-acme', limit: 10 }])
  assert.equal((await handleAgentCompany(request({ headers: {}, body: validBody }), {
    authorizeCompanyRequest: session('viewer'),
  })).status, 403)
  assert.equal((await handleAgentCompany(request({
    headers: {},
    body: { action: 'mission-list', clientId: 'client-other', limit: 10 },
  }), {
    authorizeCompanyRequest: session('viewer'),
    listCompanyMissions: async () => ({ ok: true }),
  })).status, 403)

  const reviews = []
  const reviewer = await handleAgentCompany(request({
    headers: {},
    body: {
      action: 'work-order-review',
      clientId: 'client-acme',
      workOrderId: 'company-order:one',
      resultHash: 'a'.repeat(64),
      decision: 'accepted',
      reviewerName: 'Customer owner',
      source: 'signed_note',
      statement: 'Useful',
      recordedBy: 'spoofed-owner',
      confirmation: `ACCEPT company-order:one ${'a'.repeat(64)}`,
    },
  }), {
    authorizeCompanyRequest: session('reviewer'),
    reviewCompanyWorkOrder: async (body) => { reviews.push(body); return { ok: true } },
  })
  assert.equal(reviewer.status, 200)
  assert.equal(reviews[0].recordedBy, 'ops.reviewer')
  assert.equal((await handleAgentCompany(request({
    headers: {},
    body: { action: 'work-order-run', clientId: 'client-acme' },
  }), { authorizeCompanyRequest: session('reviewer') })).status, 403)

  const operatorRun = await handleAgentCompany(request({
    headers: {},
    body: { action: 'work-order-run', clientId: 'client-acme' },
  }), {
    authorizeCompanyRequest: session('operator'),
    runCompanyWorkOrder: async () => ({ ok: true, mode: 'work_order_run' }),
  })
  assert.equal(operatorRun.status, 200)
})

test('customer sessions expose and decide on one exact proof without workspace access', async () => {
  const scope = {
    kind: 'work_order_review',
    workOrderId: `company-order:${'a'.repeat(40)}`,
    resultHash: 'b'.repeat(64),
  }
  const customerAuth = async () => ({
    ok: true,
    auth: {
      mode: 'session',
      clientId: 'client-acme',
      operatorId: 'customer.aye',
      role: 'customer',
      scope,
      issuedAt: '2026-07-14T09:00:00.000Z',
      expiresAt: '2026-07-14T17:00:00.000Z',
      allowedActions: ['work-order-get', 'work-order-review'],
    },
  })
  const customerGet = await handleAgentCompany(request({ method: 'GET', headers: {}, body: undefined }), {
    authorizeCompanyRequest: customerAuth,
  })
  assert.equal(customerGet.status, 200)
  assert.equal(customerGet.json.actionMode, 'proof_review_only')
  assert.deepEqual(customerGet.json.customerReview, {
    scoped: true,
    workOrderId: scope.workOrderId,
    resultHash: scope.resultHash,
    proofAccess: true,
    immutableDecision: true,
    workspaceAccess: false,
    identity: 'tenant_bound_one_time_code_only',
    ssoOrMfa: false,
    legalSignature: false,
  })
  assert.equal('agents' in customerGet.json, false)
  assert.equal('playbooks' in customerGet.json, false)
  assert.equal('missions' in customerGet.json, false)

  const reads = []
  const reviews = []
  const getCompanyWorkOrder = async (body) => {
    reads.push(body)
    return {
      ok: true,
      workOrder: {
        clientId: 'client-acme',
        workOrderId: scope.workOrderId,
        resultHash: scope.resultHash,
        status: 'completed',
        completedAt: '2026-07-14T12:00:00.000Z',
        planHash: 'a'.repeat(64),
        plan: { assignments: [{ agentId: 'internal-agent', evidenceBytes: 88 }] },
        evidence: [{ agentId: 'internal-agent', digest: 'private-digest', bytes: 88 }],
        dispatchAttempts: 2,
        result: {
          status: 'completed',
          actionMode: 'draft_only',
          results: [{ agentId: 'internal-agent', department: 'Operations', output: { recommendation: 'Review the delivery.' } }],
        },
      },
    }
  }
  const getOrder = await handleAgentCompany(request({
    headers: {},
    body: { action: 'work-order-get', clientId: 'client-acme', workOrderId: scope.workOrderId },
  }), { authorizeCompanyRequest: customerAuth, getCompanyWorkOrder })
  assert.equal(getOrder.status, 200)
  assert.equal(getOrder.json.workOrder.workOrderId, scope.workOrderId)
  assert.equal(getOrder.json.workOrder.result.results[0].output.recommendation, 'Review the delivery.')
  assert.equal('plan' in getOrder.json.workOrder, false)
  assert.equal('planHash' in getOrder.json.workOrder, false)
  assert.equal('evidence' in getOrder.json.workOrder, false)
  assert.equal('dispatchAttempts' in getOrder.json.workOrder, false)
  assert.equal('agentId' in getOrder.json.workOrder.result.results[0], false)
  assert.equal('department' in getOrder.json.workOrder.result.results[0], false)
  assert.deepEqual(reads, [{ clientId: 'client-acme', workOrderId: scope.workOrderId }])

  const reviewed = await handleAgentCompany(request({
    headers: {},
    body: {
      action: 'work-order-review',
      clientId: 'client-acme',
      workOrderId: scope.workOrderId,
      resultHash: scope.resultHash,
      decision: 'accepted',
      statement: 'Accepted after reviewing the delivered result.',
      confirmation: `ACCEPT ${scope.workOrderId} ${scope.resultHash}`,
    },
  }), {
    authorizeCompanyRequest: customerAuth,
    getCompanyWorkOrder,
    reviewCompanyWorkOrder: async (body, options) => {
      reviews.push([body, options])
      return {
        ok: true,
        mode: 'work_order_review',
        review: {
          binding: 'tenant_bound_customer_session',
          customerAuthenticated: true,
          decision: 'accepted',
          statement: body.statement,
          reviewerName: 'customer.aye',
          recordedBy: 'customer.aye',
          recordedAt: '2026-07-14T12:05:00.000Z',
          resultHash: scope.resultHash,
          reviewHash: 'd'.repeat(64),
        },
        proofPacket: { evidenceFingerprints: [{ digest: 'private-digest' }] },
      }
    },
  })
  assert.equal(reviewed.status, 200)
  assert.equal(reviews[0][0].reviewerName, 'customer.aye')
  assert.equal(reviews[0][0].recordedBy, 'customer.aye')
  assert.equal(reviews[0][0].source, 'customer_session')
  assert.equal('proofPacket' in reviewed.json, false)
  assert.equal('plan' in reviewed.json.workOrder, false)
  assert.equal('reviewerName' in reviewed.json.review, false)
  assert.deepEqual(reviews[0][1], {
    reviewProvenance: {
      binding: 'tenant_bound_customer_session',
      customerAuthenticated: true,
      authenticatedReviewerId: 'customer.aye',
    },
  })

  const wrongOrder = await handleAgentCompany(request({
    headers: {},
    body: { action: 'work-order-get', clientId: 'client-acme', workOrderId: `company-order:${'c'.repeat(40)}` },
  }), { authorizeCompanyRequest: customerAuth })
  assert.equal(wrongOrder.status, 403)
  assert.equal(wrongOrder.json.reason, 'company_customer_scope_mismatch')
  const wrongResult = await handleAgentCompany(request({
    headers: {},
    body: {
      action: 'work-order-review',
      clientId: 'client-acme',
      workOrderId: scope.workOrderId,
      resultHash: 'c'.repeat(64),
      decision: 'accepted',
      statement: 'Accepted.',
      confirmation: `ACCEPT ${scope.workOrderId} ${'c'.repeat(64)}`,
    },
  }), { authorizeCompanyRequest: customerAuth })
  assert.equal(wrongResult.status, 403)
  assert.equal(wrongResult.json.reason, 'company_customer_scope_mismatch')
  const listed = await handleAgentCompany(request({
    headers: {},
    body: { action: 'work-order-list', clientId: 'client-acme', limit: 10 },
  }), { authorizeCompanyRequest: customerAuth })
  assert.equal(listed.status, 403)

  const proofDenied = await handleAgentCompany(request({
    headers: {},
    body: { action: 'work-order-proof', clientId: 'client-acme', workOrderId: scope.workOrderId },
  }), {
    authorizeCompanyRequest: customerAuth,
  })
  assert.equal(proofDenied.status, 403)
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
