import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { handleAgentCompany } from './agent-company.mjs'
import { SUPERMEGA_HQ_AUTHORITY } from '../supermega-hq-authority.mjs'

const KEY = 'ops-secret'
const CYCLE_NOW = new Date('2026-07-14T09:00:00.000Z')
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
const hostedResponse = (payload, { status = 200, contentType = 'application/json', contentLength } = {}) => {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
  return {
    status,
    headers: {
      get(name) {
        if (String(name).toLowerCase() === 'content-type') return contentType
        if (String(name).toLowerCase() === 'content-length') return contentLength ?? String(Buffer.byteLength(body))
        return null
      },
    },
    text: async () => body,
  }
}
const cycleDelivery = (outcomes, patch = {}) => {
  const counts = { sent: 0, failed: 0, uncertain: 0, missing: 0 }
  outcomes.forEach((outcome) => { counts[outcome.status] += 1 })
  const completed = outcomes.length
  const recorded = completed - counts.missing
  const state = counts.missing ? 'missing' : counts.failed + counts.uncertain ? 'attention' : completed ? 'ready' : 'no_outcomes'
  return {
    contract: 'supermega.ceo-outcome-delivery.v1',
    available: true,
    durable: true,
    state,
    counts: { completed, recorded, ...counts },
    outcomes,
    ...patch,
  }
}

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
  assert.equal(result.json.agents.length, 12)
  assert.equal(
    new Set(result.json.agents.flatMap((agent) => [agent.crew, ...agent.capabilityCrews])).size,
    15,
  )
  assert.equal(result.json.agents.every((agent) => agent.evidenceHint), true)
  assert.equal(result.json.limits.maxAgents, 2)
  assert.equal(result.json.limits.maxRoleBudget, 8)
  assert.equal(result.json.limits.maxActiveAssignments, 2)
  assert.equal(result.json.limits.maxConcurrentCycles, 1)
  assert.equal(result.json.limits.capacityClaimContract, 'supermega.agent-company-capacity-claims.v1')
  assert.equal(result.json.limits.capacityClaimTtlSeconds, 120)
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
  assert.equal(result.json.operations.ownerDeliveryCoverage, true)
  assert.equal(result.json.operations.ownerDeliveryContentReturned, false)
  assert.equal(result.json.ceoCycle.contract, 'supermega.ceo-cycle-view.v1')
  assert.equal(result.json.ceoCycle.available, false)
  assert.equal(result.json.ceoCycle.reason, 'company_client_id_missing')
  assert.equal(result.json.ceoCycle.totalOutcomes, 5)
  assert.equal(result.json.hostedActivation.contract, 'supermega.hosted-activation-view.v1')
  assert.equal(result.json.hostedActivation.source.status, 'unavailable')
  assert.equal(result.json.hostedActivation.source.reason, 'hosted_status_not_checked')
  assert.equal(result.json.hostedActivation.activationReady, false)
  assert.equal(result.json.hostedActivation.proofs.length, 5)
  assert.equal(result.json.hostedActivation.scheduler.currentInvocationsPerDay, 0)
  assert.equal(result.json.hostedActivation.scheduler.plannedInvocationsPerDay, 25)
})

test('GET observes fixed-origin hosted activation metadata without returning secrets', async () => {
  const calls = []
  const result = await handleAgentCompany(request({ method: 'GET', body: undefined }), {
    opsKey: KEY,
    fetchHostedStatus: async (url, init) => {
      calls.push({ url, init })
      return hostedResponse({
        status: 'ready',
        runtime_target: 'hosted_vercel_api',
        pc_dependency: false,
        scheduler: {
          configured: true,
          activation_requested: true,
          activation_enabled: true,
          activation_evidence_valid: true,
          activation_evidence_count: 5,
          activation_evidence_digest: 'private-evidence-digest',
          activation_evidence_environment_key: 'PRIVATE_EVIDENCE_ENV',
          configuration_errors: ['private-configuration-detail'],
          max_jobs_per_run: 2,
        },
      })
    },
  })
  assert.equal(result.status, 200)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://app.supermega.dev/api/cloud-autonomy/status')
  assert.equal(calls[0].init.method, 'GET')
  assert.equal(calls[0].init.redirect, 'error')
  assert.equal(calls[0].init.cache, 'no-store')
  assert.equal(calls[0].init.headers.accept, 'application/json')
  assert.ok(calls[0].init.signal instanceof AbortSignal)
  assert.equal(result.json.hostedActivation.liveState, 'enabled_unverified')
  assert.equal(result.json.hostedActivation.activationReady, false)
  assert.equal(result.json.hostedActivation.scheduler.runtimeReady, true)
  assert.equal(result.json.hostedActivation.verifiedProofCount, 5)
  assert.equal(result.json.hostedActivation.requiredProofCount, 5)
  assert.equal(result.json.hostedActivation.nextProof, null)
  assert.equal(result.json.hostedActivation.scheduler.cadenceCompatibility, 'unverified')
  assert.match(result.json.hostedActivation.nextAction, /Confirm the Vercel plan/)
  const serialized = JSON.stringify(result.json.hostedActivation)
  assert.doesNotMatch(serialized, /private-evidence-digest|PRIVATE_EVIDENCE_ENV|private-configuration-detail/)

  const authority = JSON.parse(await readFile(new URL('../../tools/supermega_scheduler_authority.json', import.meta.url), 'utf8'))
  assert.deepEqual(
    result.json.hostedActivation.proofs.map((proof) => proof.id),
    authority.activation.required_evidence,
  )
  assert.equal(result.json.hostedActivation.declaredState, authority.activation.state)
  assert.equal(result.json.hostedActivation.scheduler.currentInvocationsPerDay, authority.maximum_scheduler_invocations_per_day)
  assert.equal(result.json.hostedActivation.scheduler.plannedInvocationsPerDay, authority.activation_plan.maximum_scheduler_invocations_per_day)
})

test('GET fails hosted observation closed without blocking protected company work', async () => {
  const cases = [
    async () => hostedResponse({}, { status: 503 }),
    async () => hostedResponse('{}', { contentType: 'text/html' }),
    async () => hostedResponse('{}', { contentLength: String(64 * 1024 + 1) }),
    async () => hostedResponse('{bad json'),
    async () => hostedResponse({ runtime_target: 'other', pc_dependency: false, scheduler: {} }),
    async () => { throw new Error('dns unavailable') },
  ]
  const expectedReasons = [
    'hosted_status_rejected',
    'hosted_status_content_type_invalid',
    'hosted_status_too_large',
    'hosted_status_json_invalid',
    'hosted_status_contract_invalid',
    'hosted_status_unavailable',
  ]
  for (const [index, fetchHostedStatus] of cases.entries()) {
    const result = await handleAgentCompany(request({ method: 'GET', body: undefined }), {
      opsKey: KEY,
      fetchHostedStatus,
    })
    assert.equal(result.status, 200)
    assert.equal(result.json.ok, true)
    assert.equal(result.json.hostedActivation.source.status, 'unavailable')
    assert.equal(result.json.hostedActivation.source.reason, expectedReasons[index])
    assert.equal(result.json.hostedActivation.activationReady, false)
    assert.equal(result.json.hostedActivation.verifiedProofCount, 0)
    assert.equal(result.json.hostedActivation.proofs.every((proof) => proof.status === 'unverified'), true)
  }
})

test('GET exposes one tenant-bound metadata-only company week', async () => {
  const calls = []
  const result = await handleAgentCompany(request({ method: 'GET', body: undefined }), {
    opsKey: KEY,
    clientId: 'client-acme',
    now: CYCLE_NOW,
    loadCeoOutcomeCycleState: async (input) => {
      calls.push(input)
      return {
        ok: true,
        contract: 'supermega.ceo-outcome-cycle-state.v1',
        durable: true,
        clientId: input.clientId,
        authorityDigest: input.authorityDigest,
        cycleId: '2026-07-13',
        startsAt: '2026-07-13T00:00:00.000Z',
        endsAt: '2026-07-20T00:00:00.000Z',
        completedOutcomeIds: ['daily-company-control'],
        completedCount: 1,
        matchedRecords: 1,
        delivery: cycleDelivery([{ outcomeId: 'daily-company-control', status: 'sent' }]),
      }
    },
  })
  assert.equal(result.status, 200)
  assert.deepEqual(calls, [{
    clientId: 'client-acme',
    authorityDigest: result.json.ceoCycle.authorityDigest,
    asOf: CYCLE_NOW.toISOString(),
    includeDelivery: true,
  }])
  assert.equal(result.json.ceoCycle.available, true)
  assert.equal(result.json.ceoCycle.durable, true)
  assert.equal(result.json.ceoCycle.completedCount, 1)
  assert.equal(result.json.ceoCycle.deliveredCount, 1)
  assert.equal(result.json.ceoCycle.totalOutcomes, 5)
  assert.equal(result.json.ceoCycle.nextOutcome.id, 'engineering-release-control')
  assert.deepEqual(result.json.ceoCycle.outcomes.map((outcome) => outcome.status), [
    'delivered',
    'next',
    'queued',
    'queued',
    'queued',
  ])
  assert.equal(result.json.ceoCycle.blockedConsequentialCount, 3)
  assert.deepEqual(result.json.ceoCycle.controls, {
    maxOutcomesPerCycle: 1,
    externalWrites: false,
    dynamicDelegation: false,
    recursiveDelegation: false,
    humanApprovalForConsequentialActions: true,
    deliveryRequiredForCycleComplete: true,
  })
  assert.deepEqual(result.json.ceoCycle.delivery, {
    contract: 'supermega.ceo-outcome-delivery.v1',
    available: true,
    durable: true,
    state: 'ready',
    completed: 1,
    recorded: 1,
    sent: 1,
    failed: 0,
    uncertain: 0,
    missing: 0,
    contentReturned: false,
  })
  const serialized = JSON.stringify(result.json.ceoCycle)
  assert.doesNotMatch(serialized, /evidencePlan|objective|sourceRefs|blockers|usage|answer|output|deliveryId|claim/i)

  const allReadyOutcomeIds = SUPERMEGA_HQ_AUTHORITY.outcomes
    .filter((outcome) => outcome.state === 'ready')
    .map((outcome) => outcome.id)
  const failedDelivery = await handleAgentCompany(request({ method: 'GET', body: undefined }), {
    opsKey: KEY,
    clientId: 'client-acme',
    now: CYCLE_NOW,
    loadCeoOutcomeCycleState: async (input) => ({
      ok: true,
      contract: 'supermega.ceo-outcome-cycle-state.v1',
      durable: true,
      clientId: input.clientId,
      authorityDigest: input.authorityDigest,
      cycleId: '2026-07-13',
      startsAt: '2026-07-13T00:00:00.000Z',
      endsAt: '2026-07-20T00:00:00.000Z',
      completedOutcomeIds: allReadyOutcomeIds,
      completedCount: allReadyOutcomeIds.length,
      matchedRecords: allReadyOutcomeIds.length,
      delivery: cycleDelivery(allReadyOutcomeIds.map((outcomeId, index) => ({
        outcomeId,
        status: index === 0 ? 'failed' : 'sent',
      }))),
    }),
  })
  assert.equal(failedDelivery.json.ceoCycle.completionRecorded, true)
  assert.equal(failedDelivery.json.ceoCycle.cycleComplete, false)
  assert.equal(failedDelivery.json.ceoCycle.deliveredCount, 4)
  assert.equal(failedDelivery.json.ceoCycle.delivery.failed, 1)
  assert.equal(failedDelivery.json.ceoCycle.outcomes.filter((outcome) => outcome.status === 'delivery_failed').length, 1)
  const forgedDelivery = await handleAgentCompany(request({ method: 'GET', body: undefined }), {
    opsKey: KEY,
    clientId: 'client-acme',
    now: CYCLE_NOW,
    loadCeoOutcomeCycleState: async (input) => ({
      ok: true,
      contract: 'supermega.ceo-outcome-cycle-state.v1',
      durable: true,
      clientId: input.clientId,
      authorityDigest: input.authorityDigest,
      cycleId: '2026-07-13',
      startsAt: '2026-07-13T00:00:00.000Z',
      endsAt: '2026-07-20T00:00:00.000Z',
      completedOutcomeIds: ['daily-company-control'],
      completedCount: 1,
      matchedRecords: 1,
      delivery: cycleDelivery([{ outcomeId: 'daily-company-control', status: 'sent', briefText: 'must-not-escape' }]),
    }),
  })
  assert.equal(forgedDelivery.json.ceoCycle.available, false)
  assert.equal(forgedDelivery.json.ceoCycle.reason, 'ceo_outcome_cycle_state_invalid')
  assert.doesNotMatch(JSON.stringify(forgedDelivery.json.ceoCycle), /must-not-escape|briefText/)
  const consoleHtml = await readFile(new URL('../public/index.html', import.meta.url), 'utf8')
  assert.match(consoleHtml, /delivery_failed:'Delivery failed'/)
  assert.match(consoleHtml, /delivery_uncertain:'Delivery uncertain'/)
  assert.match(consoleHtml, /delivery_missing:'Delivery missing'/)
  assert.match(consoleHtml, /delivery_unverified:'Delivery unverified'/)
  assert.match(consoleHtml, /delivery\.contentReturned!==false/)
  assert.match(consoleHtml, /deliveryAttention=.*delivery\.failed.*delivery\.uncertain.*delivery\.missing/)
  assert.match(consoleHtml, /week delivered/)
  assert.match(consoleHtml, /recorded Â·.*delivered Â·.*no external writes/)
  assert.doesNotMatch(consoleHtml, /statusLabel=\{complete:'Done'/)
  assert.match(consoleHtml, /\.company-week-step\.delivery_failed,.company-week-step\.delivery_unverified/)
  assert.match(consoleHtml, /\.company-week-step\.delivery_uncertain,.company-week-step\.delivery_missing/)

  const mismatched = await handleAgentCompany(request({ method: 'GET', body: undefined }), {
    opsKey: KEY,
    clientId: 'client-acme',
    now: CYCLE_NOW,
    loadCeoOutcomeCycleState: async () => ({
      ok: true,
      contract: 'supermega.ceo-outcome-cycle-state.v1',
      durable: true,
      clientId: 'client-other',
      authorityDigest: 'a'.repeat(64),
      cycleId: '2026-07-13',
      startsAt: '2026-07-13T00:00:00.000Z',
      endsAt: '2026-07-20T00:00:00.000Z',
      completedOutcomeIds: [],
      completedCount: 0,
    }),
  })
  assert.equal(mismatched.status, 200)
  assert.equal(mismatched.json.ceoCycle.available, false)
  assert.equal(mismatched.json.ceoCycle.reason, 'ceo_outcome_cycle_state_invalid')
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
  assert.equal('ceoCycle' in customerGet.json, false)

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
  const unavailableCapacity = await handleAgentCompany(request({ body: { ...validBody, action: 'run' } }), {
    opsKey: KEY,
    runCompanyCycle: async () => ({ ok: false, reason: 'company_capacity_unavailable', status: 'blocked' }),
  })
  assert.equal(unavailableCapacity.status, 503)
  const exhausted = await handleAgentCompany(request({ body: { ...validBody, action: 'run' } }), {
    opsKey: KEY,
    runCompanyCycle: async () => ({ ok: false, reason: 'company_capacity_exhausted', status: 'busy' }),
  })
  assert.equal(exhausted.status, 429)
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
    evaluateCeoOutcomeDelivery: async (body) => { calls.push(['evaluate-outcome', body]); return { ok: true, mode: 'ceo_outcome_evaluate' } },
    promoteAcceptedCeoOutcomeAction: async (body) => { calls.push(['promote-outcome', body]); return { ok: true, mode: 'ceo_outcome_action_promote' } },
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
    ['ceo-outcome-evaluate', { clientId: 'client-acme', operationId: `ceo-outcome:${'a'.repeat(40)}`, recordHash: 'b'.repeat(64), successMeasureDigest: 'c'.repeat(64), verdict: 'accepted', confirmation: `EVALUATE ceo-outcome:${'a'.repeat(40)} ${'c'.repeat(64)}` }],
    ['ceo-outcome-promote', { clientId: 'client-acme', operationId: `ceo-outcome:${'a'.repeat(40)}`, evaluationHash: 'd'.repeat(64), confirmation: `PROMOTE ceo-outcome:${'a'.repeat(40)} ${'d'.repeat(64)}` }],
    ['operations-report', { clientId: 'client-acme', windowDays: 30 }],
  ]
  for (const [action, body] of actions) {
    const result = await handleAgentCompany(request({ body: { ...body, action } }), options)
    assert.equal(result.status, 200)
  }
  assert.deepEqual(calls.map(([name]) => name), ['create', 'list', 'get', 'run', 'cancel', 'proof', 'review', 'evaluate', 'evaluate-outcome', 'promote-outcome', 'report'])
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
