import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildCompanyOperationsReport,
  evaluateCompanyWorkOrder,
} from './agent-company-operations.mjs'

const HASH = 'a'.repeat(64)
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
    assignments: [{ agentId: 'sales-qualifier' }],
    budget: { roleLimit: 3 },
    controls: { externalWrites: false, dynamicDelegation: false },
  },
  result: {
    ok: true,
    status: 'completed',
    actionMode: 'draft_only',
    approvalRequired: true,
    results: [{ agentId: 'sales-qualifier', status: 'completed', output: { private: 'model output' } }],
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
  assert.equal(report.exposure.rawEvidenceReturned, false)
  assert.equal(report.exposure.modelOutputReturned, false)
  const serialized = JSON.stringify(report)
  assert.equal(serialized.includes('model output'), false)
  assert.equal(serialized.includes('e'.repeat(64)), false)
  assert.equal(serialized.includes('output'), false)
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
