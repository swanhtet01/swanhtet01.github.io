import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  createCompanyWorkOrder,
  getCompanyWorkOrder,
  listCompanyWorkOrders,
  runCompanyWorkOrder,
} from './agent-company-work-orders.mjs'

const work = (patch = {}) => ({
  clientId: 'client-acme',
  cycleId: 'queue-2026-07-14-a',
  agents: ['sales-qualifier', 'quality-reviewer'],
  evidence: {
    'sales-qualifier': { problem: 'Manual close takes two days', buyer: 'Owner' },
    'quality-reviewer': 'Review draft v2 against acceptance rules A and B.',
  },
  roleBudget: 6,
  ...patch,
})

function harness() {
  const records = new Map()
  const claims = new Map()
  const activity = []
  return {
    records,
    activity,
    options: {
      claimActivity: async (row) => {
        if (claims.has(row.id)) return { fresh: false, durable: true }
        claims.set(row.id, row)
        activity.unshift({ ...row, at: '2026-07-14T00:00:00.000Z' })
        return { fresh: true, durable: true }
      },
      releaseActivityClaim: async (id) => claims.delete(id),
      putWorkOrder: async (key, payload) => { records.set(key, structuredClone(payload)); return true },
      getWorkOrder: async (key) => records.get(key) || null,
      listActivity: async () => activity,
      now: () => '2026-07-14T00:00:00.000Z',
    },
  }
}

test('creation durably queues one exact reviewed plan without running a model', async () => {
  const state = harness()
  let runs = 0
  const result = await createCompanyWorkOrder(work(), {
    ...state.options,
    runCompanyCycle: async () => { runs += 1; return { ok: true } },
  })
  assert.equal(result.ok, true)
  assert.equal(result.mode, 'work_order_create')
  assert.equal(result.workOrder.status, 'planned')
  assert.match(result.workOrder.workOrderId, /^company-order:[a-f0-9]{40}$/)
  assert.match(result.workOrder.planHash, /^[a-f0-9]{64}$/)
  assert.equal(result.workOrder.plan.assignments.length, 2)
  assert.equal(result.workOrder.plan.budget.plannedRoles, 6)
  assert.equal(result.workOrder.evidence.length, 2)
  assert.match(result.workOrder.evidence[0].digest, /^[a-f0-9]{64}$/)
  assert.equal('input' in result.workOrder, false)
  assert.equal(JSON.stringify(result).includes('Manual close takes two days'), false)
  assert.equal(runs, 0)
})

test('duplicate creation replays the same order and rejects changed evidence for one cycle id', async () => {
  const state = harness()
  const first = await createCompanyWorkOrder(work(), state.options)
  const replay = await createCompanyWorkOrder(work(), state.options)
  assert.equal(replay.ok, true)
  assert.equal(replay.replayed, true)
  assert.equal(replay.workOrder.workOrderId, first.workOrder.workOrderId)

  const conflict = await createCompanyWorkOrder(work({
    evidence: { ...work().evidence, 'sales-qualifier': 'Different evidence under the same cycle.' },
  }), state.options)
  assert.equal(conflict.ok, false)
  assert.equal(conflict.reason, 'company_work_order_conflict')
})

test('creation fails closed when the queue claim or record is not durable', async () => {
  let released = ''
  const nonDurable = await createCompanyWorkOrder(work(), {
    claimActivity: async () => ({ fresh: true, durable: false }),
    releaseActivityClaim: async (id) => { released = id; return true },
  })
  assert.equal(nonDurable.reason, 'company_work_order_durable_claim_required')
  assert.match(released, /^company-order:/)

  let releasedAfterWrite = ''
  const failedWrite = await createCompanyWorkOrder(work(), {
    claimActivity: async () => ({ fresh: true, durable: true }),
    putWorkOrder: async () => null,
    releaseActivityClaim: async (id) => { releasedAfterWrite = id; return true },
  })
  assert.equal(failedWrite.reason, 'company_work_order_store_unavailable')
  assert.match(releasedAfterWrite, /^company-order:/)
})

test('list and get remain client-bound and never return queued raw evidence', async () => {
  const state = harness()
  const created = await createCompanyWorkOrder(work(), state.options)
  state.activity.unshift({ id: 'company-order:other', kind: 'agent_company_work_order', ref: 'client-other' })

  let activityFilter
  state.options.listActivity = async (limit, filter) => {
    activityFilter = { limit, filter }
    return state.activity.filter((item) => item.kind === filter.kind && item.ref === filter.ref).slice(0, limit)
  }

  const list = await listCompanyWorkOrders({ clientId: 'client-acme', limit: 10 }, state.options)
  assert.equal(list.ok, true)
  assert.equal(list.workOrders.length, 1)
  assert.equal(list.workOrders[0].workOrderId, created.workOrder.workOrderId)
  assert.deepEqual(activityFilter, { limit: 10, filter: { kind: 'agent_company_work_order', ref: 'client-acme' } })
  assert.equal('result' in list.workOrders[0], false)
  assert.equal(JSON.stringify(list).includes('Manual close takes two days'), false)

  const fetched = await getCompanyWorkOrder({
    clientId: 'client-acme',
    workOrderId: created.workOrder.workOrderId,
  }, state.options)
  assert.equal(fetched.ok, true)
  assert.equal(JSON.stringify(fetched).includes('Manual close takes two days'), false)
  const wrongClient = await getCompanyWorkOrder({
    clientId: 'client-other',
    workOrderId: created.workOrder.workOrderId,
  }, state.options)
  assert.equal(wrongClient.reason, 'company_work_order_not_found')
})

test('dispatch is bound to the saved fingerprint and exact confirmation', async () => {
  const state = harness()
  const created = await createCompanyWorkOrder(work(), state.options)
  const args = {
    clientId: 'client-acme',
    workOrderId: created.workOrder.workOrderId,
    planHash: created.workOrder.planHash,
    confirmation: `RUN ${created.workOrder.workOrderId}`,
  }
  assert.equal((await runCompanyWorkOrder({ ...args, planHash: '0'.repeat(64) }, state.options)).reason, 'company_work_order_plan_mismatch')
  assert.equal((await runCompanyWorkOrder({ ...args, confirmation: 'RUN something-else' }, state.options)).reason, 'company_work_order_confirmation_required')

  let received
  const result = await runCompanyWorkOrder(args, {
    ...state.options,
    runCompanyCycle: async (input) => {
      received = input
      return {
        ok: true,
        mode: 'run',
        status: 'completed',
        runId: created.workOrder.plan.runId,
        clientId: input.clientId,
        cycleId: input.cycleId,
        results: [{ ok: true, status: 'completed', agentId: 'sales-qualifier', output: { fit: 'strong' } }],
        budget: { usedRoleCalls: 3 },
      }
    },
  })
  assert.equal(result.ok, true)
  assert.equal(result.workOrder.status, 'completed')
  assert.equal(received.clientId, 'client-acme')
  assert.deepEqual(received.agents, ['sales-qualifier', 'quality-reviewer'])
  assert.match(received.evidence['sales-qualifier'], /Manual close/)
  assert.equal(JSON.stringify(result.workOrder).includes('Manual close takes two days'), false)
  const saved = [...state.records.values()].find((row) => row.workOrderId === created.workOrder.workOrderId)
  assert.equal(saved.input, null)
  assert.equal(saved.result.status, 'completed')
})

test('completed dispatches replay without another specialist call', async () => {
  const state = harness()
  const created = await createCompanyWorkOrder(work(), state.options)
  const args = {
    clientId: 'client-acme',
    workOrderId: created.workOrder.workOrderId,
    planHash: created.workOrder.planHash,
    confirmation: `RUN ${created.workOrder.workOrderId}`,
  }
  let runs = 0
  const options = {
    ...state.options,
    runCompanyCycle: async () => { runs += 1; return { ok: true, status: 'completed', results: [] } },
  }
  assert.equal((await runCompanyWorkOrder(args, options)).ok, true)
  const replay = await runCompanyWorkOrder(args, options)
  assert.equal(replay.ok, true)
  assert.equal(replay.replayed, true)
  assert.equal(runs, 1)
})

test('dispatch never spends when the running state cannot be persisted', async () => {
  const state = harness()
  const created = await createCompanyWorkOrder(work(), state.options)
  let runs = 0
  const result = await runCompanyWorkOrder({
    clientId: 'client-acme',
    workOrderId: created.workOrder.workOrderId,
    planHash: created.workOrder.planHash,
    confirmation: `RUN ${created.workOrder.workOrderId}`,
  }, {
    ...state.options,
    putWorkOrder: async () => null,
    runCompanyCycle: async () => { runs += 1; return { ok: true, status: 'completed' } },
  })
  assert.equal(result.reason, 'company_work_order_store_unavailable')
  assert.equal(runs, 0)
})

test('work-order actions reject unknown fields and unbounded listing', async () => {
  assert.equal((await createCompanyWorkOrder({ ...work(), execute: true })).reason, 'company_work_order_unknown_field')
  assert.equal((await listCompanyWorkOrders({ clientId: 'client-acme', limit: 41 })).reason, 'company_work_order_invalid_limit')
  assert.equal((await runCompanyWorkOrder({ clientId: 'client-acme', workOrderId: 'x', planHash: 'x', confirmation: 'x', action: true })).reason, 'company_work_order_unknown_field')
})
