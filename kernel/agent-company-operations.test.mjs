import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildCompanyOperationsReport,
  evaluateCeoOutcomeDelivery,
  evaluateCompanyWorkOrder,
  getCompanyWorkOrderEvaluation,
  recordCeoOutcomeCompletion,
  recordCeoOutcomeDeliveryResult,
} from './agent-company-operations.mjs'

const HASH = 'a'.repeat(64)
const AUTHORITY_DIGEST = 'c'.repeat(64)
const operatorUsage = (patch = {}) => ({
  contract: 'supermega.operator-usage.v1',
  units: 'bulk_equivalent_tokens',
  modelCalls: 1,
  cacheHits: 0,
  measuredCalls: 1,
  unmeasuredCalls: 0,
  weightedTotalUnits: 45,
  ...patch,
})
const order = (patch = {}) => ({
  workOrderId: 'company-order:1111111111111111111111111111111111111111',
  clientId: 'client-acme',
  cycleId: 'cycle-1',
  status: 'completed',
  planHash: HASH,
  createdAt: '2026-07-14T00:00:00.000Z',
  startedAt: '2026-07-14T00:10:00.000Z',
  completedAt: '2026-07-14T00:20:00.000Z',
  plan: {
    assignments: [{ agentId: 'sales-qualifier', name: 'Sales Qualifier', department: 'growth', crew: 'lead-qualification-desk', roleCount: 3 }],
    budget: { roleLimit: 3 },
    controls: { externalWrites: false, dynamicDelegation: false },
  },
  result: {
    ok: true,
    status: 'completed',
    actionMode: 'draft_only',
    approvalRequired: true,
    results: [{
      agentId: 'sales-qualifier',
      status: 'completed',
      usedRoleCalls: 3,
      output: { private: 'model output' },
      usageByRole: [
        { role: 'intake', requestedTier: 'bulk', tier: 'bulk', provider: 'anthropic', model: 'private-model-1', cached: false, usage: { input_tokens: 100, output_tokens: 50 } },
        { role: 'analyst', requestedTier: 'reason', tier: 'reason', provider: 'anthropic', model: 'private-model-2', cached: false, usage: { input_tokens: 20, output_tokens: 10 } },
        { role: 'writer', requestedTier: 'reason', tier: 'reason', provider: 'anthropic', model: 'private-model-3', cached: true, usage: { input_tokens: 30, output_tokens: 15 } },
      ],
    }],
    budget: { usedRoleCalls: 3 },
    durableResultStored: true,
  },
  evidence: [{ digest: 'e'.repeat(64), bytes: 20 }],
  ...patch,
})

const evaluationInput = (patch = {}) => ({
  clientId: 'client-acme',
  workOrderId: order().workOrderId,
  planHash: HASH,
  verdict: 'accepted',
  checks: { accurate: true, complete: true, usable: true, boundarySafe: true },
  confirmation: `EVALUATE ${order().workOrderId}`,
  ...patch,
})

function evaluationHarness() {
  const records = new Map()
  const claims = new Map()
  return {
    records,
    options: {
      getCompanyWorkOrder: async ({ clientId, workOrderId }) => (
        clientId === 'client-acme' && workOrderId === order().workOrderId
          ? { ok: true, workOrder: structuredClone(order()) }
          : { ok: false, reason: 'company_work_order_not_found' }
      ),
      claimActivity: async (row) => {
        if (claims.has(row.id)) return { fresh: false, durable: true }
        claims.set(row.id, row)
        return { fresh: true, durable: true }
      },
      releaseActivityClaim: async (id) => claims.delete(id),
      putEvaluation: async (key, value) => { records.set(key, structuredClone(value)); return true },
      getEvaluation: async (key) => records.get(key) || null,
      now: () => '2026-07-14T01:00:00.000Z',
    },
  }
}

function ceoOutcomeHarness() {
  const cache = new Map()
  const claims = new Map()
  return {
    cache,
    claims,
    options: {
      claimActivity: async (row) => {
        if (claims.has(row.id)) return { fresh: false, durable: true }
        claims.set(row.id, structuredClone(row))
        return { fresh: true, durable: true }
      },
      releaseActivityClaim: async (id) => claims.delete(id),
      putCeoOutcomeRecord: async (key, value) => { cache.set(key, structuredClone(value)); return true },
      getCeoOutcomeRecord: async (key) => structuredClone(cache.get(key) || null),
      putCeoOutcomeEvaluation: async (key, value) => { cache.set(key, structuredClone(value)); return true },
      getCeoOutcomeEvaluation: async (key) => structuredClone(cache.get(key) || null),
      putCeoOutcomeDeliveryRecord: async (key, value) => { cache.set(key, structuredClone(value)); return true },
      getCeoOutcomeDeliveryRecord: async (key) => structuredClone(cache.get(key) || null),
      getActivityClaim: async (id) => ({
        durable: true,
        claim: { id, kind: 'workcell_delivery', ref: 'ceo-daily-company-control:2026-07-14' },
      }),
      now: () => '2026-07-16T01:00:00.000Z',
    },
  }
}

const ceoOutcomeInput = (patch = {}) => ({
  clientId: 'client-acme',
  outcomeId: 'daily-company-control',
  authorityDigest: AUTHORITY_DIGEST,
  completedAt: '2026-07-14T01:00:00.000Z',
  usage: operatorUsage(),
  ...patch,
})

test('terminal work-order evaluation is hash-bound, checklist-bound, immutable, and output-free', async () => {
  const state = evaluationHarness()
  const result = await evaluateCompanyWorkOrder(evaluationInput(), state.options)
  assert.equal(result.ok, true)
  assert.equal(result.evaluation.verdict, 'accepted')
  assert.match(result.evaluation.evaluationHash, /^[a-f0-9]{64}$/)
  assert.equal(JSON.stringify(result).includes('model output'), false)
  assert.equal(JSON.stringify(result).includes('e'.repeat(64)), false)

  const replay = await evaluateCompanyWorkOrder(evaluationInput(), state.options)
  assert.equal(replay.ok, true)
  assert.equal(replay.replayed, true)
  const conflict = await evaluateCompanyWorkOrder(evaluationInput({
    verdict: 'revision_required',
    checks: { accurate: false, complete: true, usable: true, boundarySafe: true },
  }), state.options)
  assert.equal(conflict.reason, 'company_evaluation_conflict')
})

test('saved evaluation lookup is tenant-bound and metadata-only', async () => {
  const state = evaluationHarness()
  const saved = await evaluateCompanyWorkOrder(evaluationInput(), state.options)
  const found = await getCompanyWorkOrderEvaluation({
    clientId: 'client-acme',
    workOrderId: order().workOrderId,
  }, state.options)
  assert.equal(found.ok, true)
  assert.deepEqual(found.evaluation, saved.evaluation)
  assert.equal(JSON.stringify(found).includes('model output'), false)
  assert.equal((await getCompanyWorkOrderEvaluation({
    clientId: 'client-other',
    workOrderId: order().workOrderId,
  }, state.options)).reason, 'company_evaluation_not_found')
  assert.equal((await getCompanyWorkOrderEvaluation({
    clientId: 'client-acme',
    workOrderId: order().workOrderId,
    includeOutput: true,
  }, state.options)).reason, 'company_operations_unknown_field')
})

test('evaluation rejects non-terminal work, mismatched plans, weak verdicts, and unknown fields', async () => {
  const state = evaluationHarness()
  assert.equal((await evaluateCompanyWorkOrder(evaluationInput({ planHash: 'b'.repeat(64) }), state.options)).reason, 'company_work_order_plan_mismatch')
  assert.equal((await evaluateCompanyWorkOrder(evaluationInput({ checks: { accurate: false, complete: true, usable: true, boundarySafe: true } }), state.options)).reason, 'company_evaluation_acceptance_checks_required')
  assert.equal((await evaluateCompanyWorkOrder(evaluationInput({ verdict: 'revision_required' }), state.options)).reason, 'company_evaluation_revision_check_required')
  assert.equal((await evaluateCompanyWorkOrder({ ...evaluationInput(), notes: 'unbounded customer text' }, state.options)).reason, 'company_operations_unknown_field')
  assert.equal((await evaluateCompanyWorkOrder(evaluationInput(), {
    ...state.options,
    getCompanyWorkOrder: async () => ({ ok: true, workOrder: order({ status: 'running', result: undefined }) }),
  })).reason, 'company_evaluation_terminal_result_required')
})

test('evaluation fails closed when its immutable claim or record is not durable', async () => {
  let released = ''
  const nonDurable = await evaluateCompanyWorkOrder(evaluationInput(), {
    getCompanyWorkOrder: async () => ({ ok: true, workOrder: order() }),
    claimActivity: async () => ({ fresh: true, durable: false }),
    releaseActivityClaim: async (id) => { released = id; return true },
  })
  assert.equal(nonDurable.reason, 'company_evaluation_durable_claim_required')
  assert.match(released, /^company-evaluation:/)

  let releasedAfterWrite = ''
  const failedWrite = await evaluateCompanyWorkOrder(evaluationInput(), {
    getCompanyWorkOrder: async () => ({ ok: true, workOrder: order() }),
    claimActivity: async () => ({ fresh: true, durable: true }),
    putEvaluation: async () => null,
    releaseActivityClaim: async (id) => { releasedAfterWrite = id; return true },
  })
  assert.equal(failedWrite.reason, 'company_evaluation_store_unavailable')
  assert.match(releasedAfterWrite, /^company-evaluation:/)
})

test('CEO outcome completion and owner acceptance are immutable, tenant-bound, and metadata-only', async () => {
  const state = ceoOutcomeHarness()
  const completed = await recordCeoOutcomeCompletion(ceoOutcomeInput(), state.options)
  assert.equal(completed.ok, true)
  assert.equal(completed.outcome.status, 'completed')
  assert.match(completed.outcome.operationId, /^ceo-outcome:[a-f0-9]{40}$/)
  assert.match(completed.outcome.recordHash, /^[a-f0-9]{64}$/)
  assert.equal(JSON.stringify(completed).includes('provider'), false)
  assert.equal(JSON.stringify(completed).includes('answer'), false)

  const replay = await recordCeoOutcomeCompletion(ceoOutcomeInput(), state.options)
  assert.equal(replay.ok, true)
  assert.equal(replay.replayed, true)
  const conflict = await recordCeoOutcomeCompletion(ceoOutcomeInput({ usage: operatorUsage({ weightedTotalUnits: 46 }) }), state.options)
  assert.equal(conflict.reason, 'ceo_outcome_record_conflict')
  assert.equal((await recordCeoOutcomeCompletion({ ...ceoOutcomeInput(), briefText: 'private answer' }, state.options)).reason, 'company_operations_unknown_field')
  assert.equal((await recordCeoOutcomeCompletion(ceoOutcomeInput({ usage: { ...operatorUsage(), provider: 'private-provider' } }), state.options)).reason, 'ceo_outcome_invalid_usage')

  const evaluationInput = {
    clientId: 'client-acme',
    operationId: completed.outcome.operationId,
    recordHash: completed.outcome.recordHash,
    verdict: 'accepted',
    confirmation: `EVALUATE ${completed.outcome.operationId}`,
  }
  assert.equal((await evaluateCeoOutcomeDelivery({ ...evaluationInput, clientId: 'client-other' }, state.options)).reason, 'ceo_outcome_not_found')
  assert.equal((await evaluateCeoOutcomeDelivery({ ...evaluationInput, recordHash: 'd'.repeat(64) }, state.options)).reason, 'ceo_outcome_record_mismatch')
  const accepted = await evaluateCeoOutcomeDelivery(evaluationInput, state.options)
  assert.equal(accepted.ok, true)
  assert.equal(accepted.evaluation.verdict, 'accepted')
  assert.equal(JSON.stringify(accepted).includes('answer'), false)
  assert.equal((await evaluateCeoOutcomeDelivery(evaluationInput, state.options)).replayed, true)
  assert.equal((await evaluateCeoOutcomeDelivery({ ...evaluationInput, verdict: 'revision_required' }, state.options)).reason, 'ceo_outcome_evaluation_conflict')
})

test('CEO owner-delivery result is durable, idempotent, claim-bound, and metadata-only', async () => {
  const state = ceoOutcomeHarness()
  const completed = await recordCeoOutcomeCompletion(ceoOutcomeInput(), state.options)
  const input = {
    clientId: 'client-acme',
    operationId: completed.outcome.operationId,
    recordHash: completed.outcome.recordHash,
    deliveryClaimId: `workcell:${'d'.repeat(40)}`,
    status: 'sent',
  }
  const recorded = await recordCeoOutcomeDeliveryResult(input, state.options)
  assert.equal(recorded.ok, true)
  assert.equal(recorded.delivery.status, 'sent')
  assert.match(recorded.delivery.deliveryId, /^ceo-outcome-delivery:[a-f0-9]{40}$/)
  assert.match(recorded.delivery.deliveryHash, /^[a-f0-9]{64}$/)
  assert.doesNotMatch(JSON.stringify(recorded), /answer|provider|model output|private/)

  const replay = await recordCeoOutcomeDeliveryResult(input, state.options)
  assert.equal(replay.ok, true)
  assert.equal(replay.replayed, true)
  const conflict = await recordCeoOutcomeDeliveryResult({ ...input, status: 'failed' }, state.options)
  assert.equal(conflict.reason, 'ceo_outcome_delivery_conflict')
  assert.equal((await recordCeoOutcomeDeliveryResult({ ...input, briefText: 'private answer' }, state.options)).reason, 'company_operations_unknown_field')
  assert.equal((await recordCeoOutcomeDeliveryResult(input, {
    ...state.options,
    getActivityClaim: async () => ({ durable: true, claim: { id: input.deliveryClaimId, kind: 'other', ref: 'private' } }),
  })).reason, 'ceo_outcome_delivery_claim_mismatch')
  assert.equal((await recordCeoOutcomeDeliveryResult(input, {
    ...state.options,
    getActivityClaim: async () => ({ durable: false, claim: null }),
  })).reason, 'ceo_outcome_delivery_store_unavailable')
})

test('accepted CEO outcomes per work unit require complete evaluation, valid usage, and clean coverage', async () => {
  const state = ceoOutcomeHarness()
  const first = await recordCeoOutcomeCompletion(ceoOutcomeInput(), state.options)
  const second = await recordCeoOutcomeCompletion(ceoOutcomeInput({
    completedAt: '2026-07-15T01:00:00.000Z',
    usage: operatorUsage({ weightedTotalUnits: 30 }),
  }), state.options)
  await evaluateCeoOutcomeDelivery({
    clientId: 'client-acme',
    operationId: first.outcome.operationId,
    recordHash: first.outcome.recordHash,
    verdict: 'accepted',
    confirmation: `EVALUATE ${first.outcome.operationId}`,
  }, state.options)
  const listCeoOutcomeRecords = async () => ({
    durable: true,
    records: [...state.cache.entries()]
      .filter(([key]) => key.startsWith('ceo-outcome-operation:'))
      .map(([key, payload]) => ({ key, payload: structuredClone(payload) })),
  })
  const reportOptions = {
    listCompanyWorkOrders: async () => ({ ok: true, workOrders: [] }),
    listCeoOutcomeRecords,
    getCeoOutcomeEvaluation: state.options.getCeoOutcomeEvaluation,
    now: () => '2026-07-16T02:00:00.000Z',
  }
  const incomplete = await buildCompanyOperationsReport({ clientId: 'client-acme', windowDays: 30 }, reportOptions)
  assert.equal(incomplete.outcomes.state, 'incomplete_evaluations')
  assert.equal(incomplete.outcomes.counts.accepted, 1)
  assert.equal(incomplete.outcomes.counts.missingEvaluation, 1)
  assert.equal(incomplete.outcomes.efficiency.available, false)

  await evaluateCeoOutcomeDelivery({
    clientId: 'client-acme',
    operationId: second.outcome.operationId,
    recordHash: second.outcome.recordHash,
    verdict: 'revision_required',
    confirmation: `EVALUATE ${second.outcome.operationId}`,
  }, state.options)
  const measured = await buildCompanyOperationsReport({ clientId: 'client-acme', windowDays: 30 }, reportOptions)
  assert.equal(measured.outcomes.state, 'measured')
  assert.deepEqual(measured.outcomes.counts, {
    completed: 2,
    evaluated: 2,
    accepted: 1,
    revisionRequired: 1,
    missingEvaluation: 0,
    uniqueOutcomes: 1,
  })
  assert.equal(measured.outcomes.usage.weightedTotalUnits, 75)
  assert.equal(measured.outcomes.efficiency.available, true)
  assert.equal(measured.outcomes.efficiency.acceptedOutcomesPer1000WorkUnits, 13.333333)
  assert.equal(measured.outcomes.efficiency.workUnitsPerAcceptedOutcome, 75)
  assert.equal(measured.exposure.ceoBriefTextReturned, false)
  assert.equal(measured.exposure.providerRowsReturned, false)
  assert.equal(JSON.stringify(measured.outcomes).includes('private-provider'), false)

  const nonDurable = await buildCompanyOperationsReport({ clientId: 'client-acme', windowDays: 30 }, {
    ...reportOptions,
    listCeoOutcomeRecords: async () => ({ ...(await listCeoOutcomeRecords()), durable: false }),
  })
  assert.equal(nonDurable.outcomes.state, 'non_durable')
  assert.equal(nonDurable.outcomes.efficiency.available, false)

  const validRows = await listCeoOutcomeRecords()
  const tampered = structuredClone(validRows.records[0])
  tampered.payload.briefText = 'private answer'
  tampered.payload.provider = 'private-provider'
  const otherState = ceoOutcomeHarness()
  await recordCeoOutcomeCompletion(ceoOutcomeInput({ clientId: 'client-other' }), otherState.options)
  const otherRow = [...otherState.cache.entries()]
    .filter(([key]) => key.startsWith('ceo-outcome-operation:'))
    .map(([key, payload]) => ({ key, payload }))[0]
  const invalidCoverage = await buildCompanyOperationsReport({ clientId: 'client-acme', windowDays: 30 }, {
    ...reportOptions,
    listCeoOutcomeRecords: async () => ({
      durable: true,
      records: [...validRows.records, structuredClone(validRows.records[0]), tampered, otherRow],
    }),
  })
  assert.equal(invalidCoverage.outcomes.state, 'invalid_coverage')
  assert.equal(invalidCoverage.outcomes.coverage.duplicateRecords, 1)
  assert.equal(invalidCoverage.outcomes.coverage.invalidRecords, 2)
  assert.equal(invalidCoverage.outcomes.efficiency.available, false)
  assert.equal(JSON.stringify(invalidCoverage.outcomes).includes('private-'), false)
})

test('operations report remains usable when CEO outcome metadata storage is unavailable', async () => {
  const report = await buildCompanyOperationsReport({ clientId: 'client-acme', windowDays: 30 }, {
    listCompanyWorkOrders: async () => ({ ok: true, workOrders: [] }),
    listCeoOutcomeRecords: async () => { throw new Error('private store failure') },
    now: () => '2026-07-16T02:00:00.000Z',
  })
  assert.equal(report.ok, true)
  assert.equal(report.outcomes.available, false)
  assert.equal(report.outcomes.state, 'store_unavailable')
  assert.equal(report.outcomes.efficiency.available, false)
  assert.equal(JSON.stringify(report).includes('private store failure'), false)
})

test('operations report measures five durable accepted orders without exposing evidence or output', async () => {
  const orders = Array.from({ length: 5 }, (_, index) => order({
    workOrderId: `company-order:${String(index + 1).repeat(40)}`,
    cycleId: `cycle-${index + 1}`,
    createdAt: `2026-07-1${index + 1}T00:00:00.000Z`,
    startedAt: `2026-07-1${index + 1}T00:10:00.000Z`,
    completedAt: `2026-07-1${index + 1}T00:20:00.000Z`,
  }))
  const evaluations = new Map(orders.map((item) => [
    `company-work-order-evaluation:${item.workOrderId}`,
    {
      evaluationId: `company-evaluation:${item.workOrderId.split(':').pop()}`,
      workOrderId: item.workOrderId,
      clientId: item.clientId,
      verdict: 'accepted',
      checks: { accurate: true, complete: true, usable: true, boundarySafe: true },
      evaluatedAt: item.completedAt,
      evaluationHash: 'f'.repeat(64),
    },
  ]))
  const report = await buildCompanyOperationsReport({ clientId: 'client-acme', windowDays: 30 }, {
    listCompanyWorkOrders: async () => ({ ok: true, workOrders: orders.map(({ result, evidence, ...item }) => item) }),
    getCompanyWorkOrder: async ({ workOrderId }) => ({ ok: true, workOrder: structuredClone(orders.find((item) => item.workOrderId === workOrderId)) }),
    getEvaluation: async (key) => evaluations.get(key) || null,
    resolvePlan: async () => 'pro',
    policyFor: () => ({ plan: 'pro', tier: 'reason', cap: 100_000 }),
    monthlyUsageFor: async () => ({ inTokens: 30_000, outTokens: 10_000, calls: 12, total: 40_000, window: '2026-07', source: 'spine+local-max' }),
    now: () => '2026-07-15T00:00:00.000Z',
  })
  assert.equal(report.ok, true)
  assert.equal(report.readiness, 'meeting_targets')
  assert.equal(report.counts.total, 5)
  assert.equal(report.counts.accepted, 5)
  assert.equal(report.measures.queueP90Minutes, 10)
  assert.equal(report.measures.executionP90Minutes, 10)
  assert.equal(report.measures.acceptedEvaluationRate, 1)
  assert.equal(report.targets.every((target) => target.state === 'met'), true)
  assert.equal(report.workforce.availableAgents, 12)
  assert.equal(report.workforce.utilizedAgents, 1)
  assert.equal(report.workforce.totalAssignments, 5)
  assert.equal(report.workforce.usedRoleCalls, 15)
  assert.equal(report.workforce.modelCalls, 10)
  assert.equal(report.workforce.cacheHits, 5)
  assert.equal(report.workforce.weightedTotalUnits, 1200)
  assert.deepEqual(report.workforce.agents.map((agent) => ({
    id: agent.agentId,
    assignments: agent.assignedOrders,
    completionRate: agent.completionRate,
  })), [{ id: 'sales-qualifier', assignments: 5, completionRate: 1 }])
  assert.equal(report.exposure.rawEvidenceReturned, false)
  assert.equal(report.exposure.modelOutputReturned, false)
  assert.equal(report.exposure.specialistOutputReturned, false)
  assert.equal(report.exposure.currencyCostClaimed, false)
  assert.equal(report.usage.units, 'bulk_equivalent_tokens')
  assert.equal(report.usage.plan, 'pro')
  assert.deepEqual(report.usage.monthly, {
    available: true,
    window: '2026-07',
    weightedPromptUnits: 30_000,
    weightedCompletionUnits: 10_000,
    weightedTotalUnits: 40_000,
    modelCalls: 12,
    capUnits: 100_000,
    capEnforced: true,
    remainingUnits: 60_000,
    utilizationRate: 0.4,
    source: 'spine+local-max',
  })
  assert.equal(report.usage.sampled.orders, 5)
  assert.equal(report.usage.sampled.measuredOrders, 5)
  assert.equal(report.usage.sampled.modelCalls, 10)
  assert.equal(report.usage.sampled.cacheHits, 5)
  assert.equal(report.usage.sampled.rawPromptTokens, 600)
  assert.equal(report.usage.sampled.rawCompletionTokens, 300)
  assert.equal(report.usage.sampled.weightedTotalUnits, 1200)
  const serialized = JSON.stringify(report)
  assert.equal(serialized.includes('model output'), false)
  assert.equal(serialized.includes('e'.repeat(64)), false)
  assert.equal(serialized.includes('output'), false)
  assert.equal(serialized.includes('private-model'), false)
  assert.equal(serialized.includes('anthropic'), false)
})

test('workforce utilization aggregates specialist metadata without carrying deliverables', async () => {
  const mixed = order({
    workOrderId: `company-order:${'9'.repeat(40)}`,
    cycleId: 'mixed-workforce',
    plan: {
      assignments: [
        { agentId: 'data-insights-analyst', name: 'Data & Insights Analyst', department: 'insights', crew: 'data-insights-desk', roleCount: 3 },
        { agentId: 'project-controller', name: 'Project Controller', department: 'delivery', crew: 'project-control-desk', roleCount: 3 },
      ],
      budget: { roleLimit: 6 },
      controls: { externalWrites: false, dynamicDelegation: false },
    },
    result: {
      ok: true,
      status: 'partial',
      actionMode: 'draft_only',
      approvalRequired: true,
      results: [
        { agentId: 'data-insights-analyst', status: 'completed', usedRoleCalls: 3, output: { privateMetric: 42 } },
        { agentId: 'project-controller', status: 'failed', usedRoleCalls: 2, reason: 'company_agent_failed' },
      ],
      budget: { usedRoleCalls: 5 },
      durableResultStored: true,
    },
  })
  const report = await buildCompanyOperationsReport({ clientId: 'client-acme', windowDays: 30 }, {
    listCompanyWorkOrders: async () => ({ ok: true, workOrders: [mixed] }),
    getCompanyWorkOrder: async () => ({ ok: true, workOrder: structuredClone(mixed) }),
    getEvaluation: async () => null,
    now: () => '2026-07-15T00:00:00.000Z',
  })
  assert.equal(report.workforce.availableAgents, 12)
  assert.equal(report.workforce.utilizedAgents, 2)
  assert.equal(report.workforce.totalAssignments, 2)
  assert.equal(report.workforce.usedRoleCalls, 5)
  const byId = Object.fromEntries(report.workforce.agents.map((agent) => [agent.agentId, agent]))
  assert.equal(byId['data-insights-analyst'].completionRate, 1)
  assert.equal(byId['project-controller'].completionRate, 0)
  assert.equal(JSON.stringify(report).includes('privateMetric'), false)
  assert.equal(JSON.stringify(report).includes('company_agent_failed'), false)
})

test('usage economics ignores malformed metadata and degrades without inventing cost', async () => {
  const malformed = order({
    workOrderId: `company-order:${'8'.repeat(40)}`,
    cycleId: 'malformed-usage',
    result: {
      ok: true,
      status: 'completed',
      actionMode: 'draft_only',
      approvalRequired: true,
      results: [{
        agentId: 'sales-qualifier',
        status: 'completed',
        usedRoleCalls: 3,
        usageByRole: [
          { role: 'intake', tier: 'reason', provider: 'anthropic', model: 'PRIVATE_MODEL', usage: { input_tokens: 10, output_tokens: 5 } },
          { role: 'analyst', tier: 'unknown-tier', provider: 'PRIVATE_PROVIDER', usage: { input_tokens: 20, output_tokens: 10 } },
          { role: 'writer', tier: 'bulk', cached: true, usage: { input_tokens: Number.MAX_SAFE_INTEGER, output_tokens: -1 } },
        ],
      }],
      budget: { usedRoleCalls: 3 },
      durableResultStored: true,
    },
  })
  const report = await buildCompanyOperationsReport({ clientId: 'client-acme', windowDays: 30 }, {
    listCompanyWorkOrders: async () => ({ ok: true, workOrders: [malformed] }),
    getCompanyWorkOrder: async () => ({ ok: true, workOrder: structuredClone(malformed) }),
    getEvaluation: async () => null,
    resolvePlan: async () => { throw new Error('private plan failure') },
    policyFor: () => { throw new Error('private policy failure') },
    monthlyUsageFor: async () => ({ inTokens: -1, outTokens: Infinity, calls: 'secret', window: 'bad', source: 'private-store' }),
    now: () => '2026-07-15T00:00:00.000Z',
  })

  assert.equal(report.ok, true)
  assert.equal(report.usage.plan, 'free')
  assert.equal(report.usage.planSource, 'fallback')
  assert.equal(report.usage.monthly.available, false)
  assert.equal(report.usage.monthly.capUnits, null)
  assert.equal(report.usage.monthly.weightedTotalUnits, null)
  assert.equal(report.usage.monthly.source, 'unavailable')
  assert.equal(report.usage.sampled.roleCalls, 3)
  assert.equal(report.usage.sampled.modelCalls, 2)
  assert.equal(report.usage.sampled.cacheHits, 1)
  assert.equal(report.usage.sampled.measuredCalls, 1)
  assert.equal(report.usage.sampled.unmeasuredCalls, 1)
  assert.equal(report.usage.sampled.weightedTotalUnits, 45)
  assert.equal(JSON.stringify(report).includes('PRIVATE_'), false)
  assert.equal(JSON.stringify(report).includes('private plan failure'), false)
})

test('operations report distinguishes no evidence, collecting evidence, and bounded coverage', async () => {
  const empty = await buildCompanyOperationsReport({ clientId: 'client-acme', windowDays: 7 }, {
    listCompanyWorkOrders: async () => ({ ok: true, workOrders: [] }),
    now: () => '2026-07-15T00:00:00.000Z',
  })
  assert.equal(empty.readiness, 'no_orders')
  assert.equal(empty.coverage.directCyclesExcluded, true)

  const collecting = await buildCompanyOperationsReport({ clientId: 'client-acme', windowDays: 30 }, {
    listCompanyWorkOrders: async () => ({ ok: true, workOrders: [order()] }),
    getCompanyWorkOrder: async () => ({ ok: true, workOrder: order() }),
    getEvaluation: async () => null,
    now: () => '2026-07-15T00:00:00.000Z',
  })
  assert.equal(collecting.readiness, 'collecting')
  assert.equal(collecting.counts.missingEvaluation, 1)
  assert.equal(collecting.targets.every((target) => target.state === 'collecting'), true)

  const cancelled = order({
    workOrderId: `company-order:${'9'.repeat(40)}`,
    cycleId: 'cycle-cancelled',
    status: 'cancelled',
    startedAt: null,
    completedAt: null,
    result: undefined,
  })
  const withCancellation = await buildCompanyOperationsReport({ clientId: 'client-acme', windowDays: 30 }, {
    listCompanyWorkOrders: async () => ({ ok: true, workOrders: [order(), cancelled] }),
    getCompanyWorkOrder: async ({ workOrderId }) => ({
      ok: true,
      workOrder: workOrderId === cancelled.workOrderId ? cancelled : order(),
    }),
    getEvaluation: async () => null,
    now: () => '2026-07-15T00:00:00.000Z',
  })
  assert.equal(withCancellation.counts.total, 2)
  assert.equal(withCancellation.counts.terminal, 1)
  assert.equal(withCancellation.counts.cancelled, 1)
  assert.equal(withCancellation.counts.missingEvaluation, 1)
  assert.equal(withCancellation.coverage.cancelledOrdersExcluded, 1)

  const legacyRunning = order({ status: 'running', startedAt: null, completedAt: null, result: undefined })
  const attention = await buildCompanyOperationsReport({ clientId: 'client-acme', windowDays: 30 }, {
    listCompanyWorkOrders: async () => ({ ok: true, workOrders: [legacyRunning] }),
    getCompanyWorkOrder: async () => ({ ok: true, workOrder: legacyRunning }),
    getEvaluation: async () => null,
    now: () => '2026-07-15T00:00:00.000Z',
  })
  assert.equal(attention.attention.overdueRunning, 1)
  assert.equal((await buildCompanyOperationsReport({ clientId: 'client-acme', windowDays: 31 })).reason, 'company_operations_invalid_window')
  assert.equal((await buildCompanyOperationsReport({ clientId: 'client-acme', windowDays: 30, raw: true })).reason, 'company_operations_unknown_field')
})
