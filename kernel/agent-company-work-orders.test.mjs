import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  cancelCompanyWorkOrder,
  createCompanyWorkOrder,
  getCompanyWorkOrder,
  getCompanyWorkOrderProof,
  listCompanyWorkOrders,
  reviewCompanyWorkOrder,
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
      transitionWorkOrder: async (key, expected, payload) => {
        const current = records.get(key)
        if (!current || current.status !== expected.status || current.planHash !== expected.planHash) {
          return { updated: false, durable: true, reason: 'transition_conflict' }
        }
        records.set(key, structuredClone(payload))
        return { updated: true, durable: true }
      },
      getWorkOrder: async (key) => records.get(key) || null,
      listActivity: async () => activity,
      now: () => '2026-07-14T00:00:00.000Z',
    },
  }
}

async function completeOrder(state) {
  const created = await createCompanyWorkOrder(work(), state.options)
  return runCompanyWorkOrder({
    clientId: created.workOrder.clientId,
    workOrderId: created.workOrder.workOrderId,
    planHash: created.workOrder.planHash,
    confirmation: `RUN ${created.workOrder.workOrderId}`,
  }, {
    ...state.options,
    runCompanyCycle: async (input) => ({
      ok: true,
      mode: 'run',
      status: 'completed',
      runId: created.workOrder.plan.runId,
      clientId: input.clientId,
      cycleId: input.cycleId,
      actionMode: 'draft_only',
      results: [
        { ok: true, status: 'completed', agentId: 'sales-qualifier', department: 'Revenue', output: { fit: 'strong', nextStep: 'Owner review' } },
        { ok: true, status: 'completed', agentId: 'quality-reviewer', department: 'Quality', output: { verdict: 'pass' } },
      ],
      budget: { usedRoleCalls: 6 },
    }),
  })
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

test('planned work orders cancel atomically and scrub queued evidence without model spend', async () => {
  const state = harness()
  const created = await createCompanyWorkOrder(work(), state.options)
  const args = {
    clientId: created.workOrder.clientId,
    workOrderId: created.workOrder.workOrderId,
    planHash: created.workOrder.planHash,
    confirmation: `CANCEL AND SCRUB ${created.workOrder.workOrderId} ${created.workOrder.planHash}`,
  }
  const before = [...state.records.values()].find((row) => row.workOrderId === created.workOrder.workOrderId)
  assert.match(before.input.evidence['sales-qualifier'], /Manual close/)
  assert.equal((await cancelCompanyWorkOrder({ ...args, confirmation: 'CANCEL something-else' }, state.options)).reason, 'company_work_order_cancel_confirmation_required')

  const cancelled = await cancelCompanyWorkOrder(args, state.options)
  assert.equal(cancelled.ok, true)
  assert.equal(cancelled.mode, 'work_order_cancel')
  assert.equal(cancelled.replayed, false)
  assert.equal(cancelled.workOrder.status, 'cancelled')
  assert.equal(cancelled.workOrder.evidenceState, 'scrubbed')
  assert.equal(cancelled.workOrder.cancelledAt, '2026-07-14T00:00:00.000Z')
  assert.equal(JSON.stringify(cancelled).includes('Manual close takes two days'), false)

  const saved = [...state.records.values()].find((row) => row.workOrderId === created.workOrder.workOrderId)
  assert.equal(saved.input, null)
  assert.deepEqual(saved.cancellation, { evidenceScrubbed: true, modelRequested: false })
  assert.match(saved.evidenceDigests['sales-qualifier'], /^[a-f0-9]{64}$/)

  const replay = await cancelCompanyWorkOrder(args, state.options)
  assert.equal(replay.ok, true)
  assert.equal(replay.replayed, true)
  let runs = 0
  const dispatch = await runCompanyWorkOrder({
    clientId: created.workOrder.clientId,
    workOrderId: created.workOrder.workOrderId,
    planHash: created.workOrder.planHash,
    confirmation: `RUN ${created.workOrder.workOrderId}`,
  }, {
    ...state.options,
    runCompanyCycle: async () => { runs += 1; return { ok: true } },
  })
  assert.equal(dispatch.reason, 'company_work_order_cancelled')
  assert.equal(runs, 0)
})

test('cancellation loses safely to dispatch and fails closed when the atomic store is unavailable', async () => {
  const state = harness()
  const created = await createCompanyWorkOrder(work(), state.options)
  const args = {
    clientId: created.workOrder.clientId,
    workOrderId: created.workOrder.workOrderId,
    planHash: created.workOrder.planHash,
    confirmation: `CANCEL AND SCRUB ${created.workOrder.workOrderId} ${created.workOrder.planHash}`,
  }
  const raced = await cancelCompanyWorkOrder(args, {
    ...state.options,
    transitionWorkOrder: async (key) => {
      const current = state.records.get(key)
      state.records.set(key, { ...current, status: 'running' })
      return { updated: false, durable: true, reason: 'transition_conflict' }
    },
  })
  assert.equal(raced.reason, 'company_work_order_cancel_not_allowed')
  assert.equal(raced.workOrder.status, 'running')
  assert.match(state.records.get(`company-work-order-record:${created.workOrder.workOrderId}`).input.evidence['sales-qualifier'], /Manual close/)

  const unavailable = harness()
  const unavailableCreated = await createCompanyWorkOrder(work(), unavailable.options)
  const unavailableArgs = {
    clientId: unavailableCreated.workOrder.clientId,
    workOrderId: unavailableCreated.workOrder.workOrderId,
    planHash: unavailableCreated.workOrder.planHash,
    confirmation: `CANCEL AND SCRUB ${unavailableCreated.workOrder.workOrderId} ${unavailableCreated.workOrder.planHash}`,
  }
  const failed = await cancelCompanyWorkOrder(unavailableArgs, {
    ...unavailable.options,
    transitionWorkOrder: async () => ({ updated: false, durable: false, reason: 'store_unavailable' }),
  })
  assert.equal(failed.reason, 'company_work_order_store_unavailable')
  const stillPlanned = unavailable.records.get(`company-work-order-record:${unavailableCreated.workOrder.workOrderId}`)
  assert.equal(stillPlanned.status, 'planned')
  assert.match(stillPlanned.input.evidence['sales-qualifier'], /Manual close/)

  const completed = harness()
  const completedOrder = await completeOrder(completed)
  const notAllowed = await cancelCompanyWorkOrder({
    clientId: completedOrder.workOrder.clientId,
    workOrderId: completedOrder.workOrder.workOrderId,
    planHash: completedOrder.workOrder.planHash,
    confirmation: `CANCEL AND SCRUB ${completedOrder.workOrder.workOrderId} ${completedOrder.workOrder.planHash}`,
  }, completed.options)
  assert.equal(notAllowed.reason, 'company_work_order_cancel_not_allowed')
})

test('dispatch stops before model spend when cancellation wins the atomic transition', async () => {
  const state = harness()
  const created = await createCompanyWorkOrder(work(), state.options)
  let runs = 0
  const result = await runCompanyWorkOrder({
    clientId: created.workOrder.clientId,
    workOrderId: created.workOrder.workOrderId,
    planHash: created.workOrder.planHash,
    confirmation: `RUN ${created.workOrder.workOrderId}`,
  }, {
    ...state.options,
    transitionWorkOrder: async (key) => {
      const current = state.records.get(key)
      state.records.set(key, {
        ...current,
        status: 'cancelled',
        input: null,
        cancelledAt: '2026-07-14T00:00:00.000Z',
        cancellation: { evidenceScrubbed: true, modelRequested: false },
      })
      return { updated: false, durable: true, reason: 'transition_conflict' }
    },
    runCompanyCycle: async () => { runs += 1; return { ok: true, status: 'completed' } },
  })
  assert.equal(result.reason, 'company_work_order_cancelled')
  assert.equal(result.workOrder.evidenceState, 'scrubbed')
  assert.equal(runs, 0)
})

test('scrubbed-state claims fail closed when a terminal record still contains raw input', async () => {
  const cancelledState = harness()
  const created = await createCompanyWorkOrder(work(), cancelledState.options)
  const key = `company-work-order-record:${created.workOrder.workOrderId}`
  const current = cancelledState.records.get(key)
  cancelledState.records.set(key, {
    ...current,
    status: 'cancelled',
    cancellation: { evidenceScrubbed: true, modelRequested: false },
  })
  const cancellation = await cancelCompanyWorkOrder({
    clientId: created.workOrder.clientId,
    workOrderId: created.workOrder.workOrderId,
    planHash: created.workOrder.planHash,
    confirmation: `CANCEL AND SCRUB ${created.workOrder.workOrderId} ${created.workOrder.planHash}`,
  }, cancelledState.options)
  assert.equal(cancellation.reason, 'company_work_order_state_unavailable')

  const completedState = harness()
  const completed = await completeOrder(completedState)
  const completedKey = `company-work-order-record:${completed.workOrder.workOrderId}`
  const completedRecord = completedState.records.get(completedKey)
  completedState.records.set(completedKey, { ...completedRecord, input: work() })
  const proof = await getCompanyWorkOrderProof({
    clientId: completed.workOrder.clientId,
    workOrderId: completed.workOrder.workOrderId,
  }, completedState.options)
  assert.equal(proof.reason, 'company_work_order_state_unavailable')
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
  assert.equal(result.workOrder.startedAt, '2026-07-14T00:00:00.000Z')
  assert.equal(result.workOrder.dispatchAttempts, 1)
  assert.equal(received.clientId, 'client-acme')
  assert.deepEqual(received.agents, ['sales-qualifier', 'quality-reviewer'])
  assert.match(received.evidence['sales-qualifier'], /Manual close/)
  assert.equal(JSON.stringify(result.workOrder).includes('Manual close takes two days'), false)
  const saved = [...state.records.values()].find((row) => row.workOrderId === created.workOrder.workOrderId)
  assert.equal(saved.input, null)
  assert.equal(saved.result.status, 'completed')
  assert.equal(saved.startedAt, '2026-07-14T00:00:00.000Z')
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

test('completed work orders produce deterministic customer delivery proof without raw evidence', async () => {
  const state = harness()
  const completed = await completeOrder(state)
  const proof = await getCompanyWorkOrderProof({
    clientId: 'client-acme',
    workOrderId: completed.workOrder.workOrderId,
  }, state.options)
  assert.equal(proof.ok, true)
  assert.equal(proof.mode, 'work_order_proof')
  assert.equal(proof.reviewState, 'unreviewed')
  assert.equal(proof.proofPacket.kind, 'agent_company_delivery_proof')
  assert.match(proof.proofPacket.delivery.resultHash, /^[a-f0-9]{64}$/)
  assert.match(proof.proofPacket.packetHash, /^[a-f0-9]{64}$/)
  assert.equal(proof.proofPacket.delivery.specialists.length, 2)
  assert.equal(proof.proofPacket.delivery.specialists[0].output.fit, 'strong')
  assert.deepEqual(proof.proofPacket.delivery.budget, { plannedRoleCalls: 6, usedRoleCalls: 6 })
  assert.equal(proof.proofPacket.controls.externalWrites, false)
  assert.equal(proof.proofPacket.controls.rawEvidenceIncluded, false)
  assert.equal(proof.proofPacket.review, null)
  assert.equal(JSON.stringify(proof).includes('Manual close takes two days'), false)

  const replay = await getCompanyWorkOrderProof({
    clientId: 'client-acme',
    workOrderId: completed.workOrder.workOrderId,
  }, state.options)
  assert.equal(replay.proofPacket.packetHash, proof.proofPacket.packetHash)
  assert.equal((await getCompanyWorkOrderProof({
    clientId: 'client-other',
    workOrderId: completed.workOrder.workOrderId,
  }, state.options)).reason, 'company_work_order_not_found')
})

test('proof and customer review stay unavailable until a work order has a saved result', async () => {
  const state = harness()
  const created = await createCompanyWorkOrder(work(), state.options)
  const input = {
    clientId: 'client-acme',
    workOrderId: created.workOrder.workOrderId,
  }

  const proof = await getCompanyWorkOrderProof(input, state.options)
  assert.equal(proof.reason, 'company_work_order_proof_unavailable')
  assert.equal(proof.status, 'planned')

  const review = await reviewCompanyWorkOrder({
    ...input,
    resultHash: '0'.repeat(64),
    decision: 'accepted',
    reviewerName: 'Aye Aye',
    source: 'chat',
    statement: 'Accepted.',
    recordedBy: 'Swan',
    confirmation: 'not-applicable',
  }, state.options)
  assert.equal(review.reason, 'company_work_order_not_reviewable')
  assert.equal(review.status, 'planned')
})

test('operator-recorded customer review is durably bound to one exact result', async () => {
  const state = harness()
  const completed = await completeOrder(state)
  const proof = await getCompanyWorkOrderProof({
    clientId: 'client-acme',
    workOrderId: completed.workOrder.workOrderId,
  }, state.options)
  const resultHash = proof.proofPacket.delivery.resultHash
  const review = {
    clientId: 'client-acme',
    workOrderId: completed.workOrder.workOrderId,
    resultHash,
    decision: 'accepted',
    reviewerName: 'Aye Aye',
    source: 'chat',
    statement: 'Accepted. The qualified next-step list is usable by our sales team.',
    recordedBy: 'Swan',
    confirmation: `ACCEPT ${completed.workOrder.workOrderId} ${resultHash}`,
  }

  assert.equal((await reviewCompanyWorkOrder({ ...review, resultHash: '0'.repeat(64) }, state.options)).reason, 'company_work_order_review_result_mismatch')
  assert.equal((await reviewCompanyWorkOrder({ ...review, source: 'internal' }, state.options)).reason, 'company_work_order_review_invalid_source')
  assert.equal((await reviewCompanyWorkOrder({ ...review, confirmation: 'ACCEPT something else' }, state.options)).reason, 'company_work_order_review_confirmation_required')
  const saved = await reviewCompanyWorkOrder(review, state.options)
  assert.equal(saved.ok, true)
  assert.equal(saved.mode, 'work_order_review')
  assert.equal(saved.replayed, false)
  assert.equal(saved.review.binding, 'operator_recorded_customer_review')
  assert.equal(saved.review.customerAuthenticated, false)
  assert.equal(saved.review.decision, 'accepted')
  assert.equal(saved.review.resultHash, resultHash)
  assert.match(saved.review.reviewHash, /^[a-f0-9]{64}$/)
  assert.notEqual(saved.proofPacket.packetHash, proof.proofPacket.packetHash)
  assert.equal(saved.proofPacket.review.statement, review.statement)

  const fetched = await getCompanyWorkOrder({
    clientId: 'client-acme',
    workOrderId: completed.workOrder.workOrderId,
  }, state.options)
  assert.equal(fetched.workOrder.review.decision, 'accepted')
  assert.equal(fetched.workOrder.review.customerAuthenticated, false)
  assert.equal(JSON.stringify(fetched).includes('Manual close takes two days'), false)
})

test('tenant-bound customer-session review is immutable and hashes authenticated provenance', async () => {
  const state = harness()
  const completed = await completeOrder(state)
  const proof = await getCompanyWorkOrderProof({
    clientId: 'client-acme',
    workOrderId: completed.workOrder.workOrderId,
  }, state.options)
  const resultHash = proof.proofPacket.delivery.resultHash
  const review = {
    clientId: 'client-acme',
    workOrderId: completed.workOrder.workOrderId,
    resultHash,
    decision: 'accepted',
    reviewerName: 'customer.aye',
    source: 'customer_session',
    statement: 'Accepted after reviewing this delivered result.',
    recordedBy: 'customer.aye',
    confirmation: `ACCEPT ${completed.workOrder.workOrderId} ${resultHash}`,
  }
  assert.equal((await reviewCompanyWorkOrder(review, state.options)).reason, 'company_work_order_review_provenance_required')
  const saved = await reviewCompanyWorkOrder(review, {
    ...state.options,
    reviewProvenance: {
      binding: 'tenant_bound_customer_session',
      customerAuthenticated: true,
      authenticatedReviewerId: 'customer.aye',
    },
  })
  assert.equal(saved.ok, true)
  assert.equal(saved.review.binding, 'tenant_bound_customer_session')
  assert.equal(saved.review.customerAuthenticated, true)
  assert.equal(saved.review.authenticatedReviewerId, 'customer.aye')
  assert.equal(saved.proofPacket.review.binding, 'tenant_bound_customer_session')
  assert.equal(saved.proofPacket.review.customerAuthenticated, true)
  assert.equal((await reviewCompanyWorkOrder({ ...review, statement: 'Different decision.' }, {
    ...state.options,
    reviewProvenance: {
      binding: 'tenant_bound_customer_session',
      customerAuthenticated: true,
      authenticatedReviewerId: 'customer.aye',
    },
  })).reason, 'company_work_order_review_conflict')
})

test('customer review is replay-safe, immutable, and fails closed without durable storage', async () => {
  const state = harness()
  const completed = await completeOrder(state)
  const proof = await getCompanyWorkOrderProof({
    clientId: 'client-acme',
    workOrderId: completed.workOrder.workOrderId,
  }, state.options)
  const resultHash = proof.proofPacket.delivery.resultHash
  const review = {
    clientId: 'client-acme',
    workOrderId: completed.workOrder.workOrderId,
    resultHash,
    decision: 'changes_requested',
    reviewerName: 'Aye Aye',
    source: 'call',
    statement: 'Please add the buyer owner and due date to each next step.',
    recordedBy: 'Swan',
    confirmation: `REQUEST CHANGES ${completed.workOrder.workOrderId} ${resultHash}`,
  }
  const first = await reviewCompanyWorkOrder(review, state.options)
  assert.equal(first.ok, true)
  assert.equal(first.review.decision, 'changes_requested')
  const replay = await reviewCompanyWorkOrder(review, state.options)
  assert.equal(replay.ok, true)
  assert.equal(replay.replayed, true)
  const conflict = await reviewCompanyWorkOrder({ ...review, statement: 'A different statement.' }, state.options)
  assert.equal(conflict.reason, 'company_work_order_review_conflict')

  const fresh = harness()
  const freshCompleted = await completeOrder(fresh)
  const freshProof = await getCompanyWorkOrderProof({ clientId: 'client-acme', workOrderId: freshCompleted.workOrder.workOrderId }, fresh.options)
  const freshHash = freshProof.proofPacket.delivery.resultHash
  let released = ''
  const blocked = await reviewCompanyWorkOrder({
    ...review,
    workOrderId: freshCompleted.workOrder.workOrderId,
    resultHash: freshHash,
    confirmation: `REQUEST CHANGES ${freshCompleted.workOrder.workOrderId} ${freshHash}`,
  }, {
    ...fresh.options,
    claimActivity: async () => ({ fresh: true, durable: false }),
    releaseActivityClaim: async (id) => { released = id; return true },
  })
  assert.equal(blocked.reason, 'company_work_order_review_durable_claim_required')
  assert.match(released, /^company-work-order-review:/)

  const writeFailure = harness()
  const writeFailureCompleted = await completeOrder(writeFailure)
  const writeFailureProof = await getCompanyWorkOrderProof({
    clientId: 'client-acme',
    workOrderId: writeFailureCompleted.workOrder.workOrderId,
  }, writeFailure.options)
  const writeFailureHash = writeFailureProof.proofPacket.delivery.resultHash
  let releasedAfterWrite = ''
  const notStored = await reviewCompanyWorkOrder({
    ...review,
    workOrderId: writeFailureCompleted.workOrder.workOrderId,
    resultHash: writeFailureHash,
    confirmation: `REQUEST CHANGES ${writeFailureCompleted.workOrder.workOrderId} ${writeFailureHash}`,
  }, {
    ...writeFailure.options,
    putWorkOrderReview: async () => null,
    releaseActivityClaim: async (id) => { releasedAfterWrite = id; return true },
  })
  assert.equal(notStored.reason, 'company_work_order_review_store_unavailable')
  assert.match(releasedAfterWrite, /^company-work-order-review:/)
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
    transitionWorkOrder: async () => ({ updated: false, durable: false, reason: 'store_unavailable' }),
    runCompanyCycle: async () => { runs += 1; return { ok: true, status: 'completed' } },
  })
  assert.equal(result.reason, 'company_work_order_store_unavailable')
  assert.equal(runs, 0)
})

test('capacity pressure returns a work order to planned for a safe retry', async () => {
  const state = harness()
  const created = await createCompanyWorkOrder(work({ cycleId: 'capacity-retry' }), state.options)
  const result = await runCompanyWorkOrder({
    clientId: created.workOrder.clientId,
    workOrderId: created.workOrder.workOrderId,
    planHash: created.workOrder.planHash,
    confirmation: `RUN ${created.workOrder.workOrderId}`,
  }, {
    ...state.options,
    runCompanyCycle: async () => ({
      ok: false,
      reason: 'company_capacity_exhausted',
      status: 'busy',
      maxRunning: 4,
    }),
  })
  assert.equal(result.reason, 'company_capacity_exhausted')
  assert.equal(result.status, 'blocked')
  assert.equal(result.workOrder.status, 'planned')
  assert.equal(
    state.records.get(`company-work-order-record:${created.workOrder.workOrderId}`).lastDispatch.reason,
    'company_capacity_exhausted',
  )
})

test('daily budget pressure records one blocked work order and requires a new cycle', async () => {
  const state = harness()
  const created = await createCompanyWorkOrder(work({ cycleId: 'daily-budget-blocked' }), state.options)
  let runs = 0
  const args = {
    clientId: created.workOrder.clientId,
    workOrderId: created.workOrder.workOrderId,
    planHash: created.workOrder.planHash,
    confirmation: `RUN ${created.workOrder.workOrderId}`,
  }
  const options = {
    ...state.options,
    runCompanyCycle: async () => {
      runs += 1
      return {
        ok: false,
        mode: 'run',
        status: 'blocked',
        reason: 'crew_company_budget_exhausted',
        results: [{ ok: false, status: 'blocked', reason: 'crew_company_budget_exhausted' }],
        budget: { usedRoleCalls: 0 },
        retry: { requiresNewCycleId: true },
      }
    },
  }
  const result = await runCompanyWorkOrder(args, options)
  assert.equal(result.ok, true)
  assert.equal(result.workOrder.status, 'blocked')
  assert.deepEqual(result.cycleResult.retry, { requiresNewCycleId: true })
  const stored = state.records.get(`company-work-order-record:${created.workOrder.workOrderId}`)
  assert.equal(stored.input, null)
  assert.equal(stored.result.reason, 'crew_company_budget_exhausted')

  const replay = await runCompanyWorkOrder(args, options)
  assert.equal(replay.replayed, true)
  assert.equal(replay.workOrder.status, 'blocked')
  assert.equal(runs, 1, 'a blocked work order never dispatches the same cycle twice')
})

test('work-order actions reject unknown fields and unbounded listing', async () => {
  assert.equal((await createCompanyWorkOrder({ ...work(), execute: true })).reason, 'company_work_order_unknown_field')
  assert.equal((await listCompanyWorkOrders({ clientId: 'client-acme', limit: 41 })).reason, 'company_work_order_invalid_limit')
  assert.equal((await runCompanyWorkOrder({ clientId: 'client-acme', workOrderId: 'x', planHash: 'x', confirmation: 'x', action: true })).reason, 'company_work_order_unknown_field')
  assert.equal((await cancelCompanyWorkOrder({ clientId: 'client-acme', workOrderId: 'x', planHash: 'x', confirmation: 'x', action: true })).reason, 'company_work_order_unknown_field')
  assert.equal((await getCompanyWorkOrderProof({ clientId: 'client-acme', workOrderId: 'x', output: true })).reason, 'company_work_order_unknown_field')
  assert.equal((await reviewCompanyWorkOrder({ clientId: 'client-acme', workOrderId: 'x', accept: true })).reason, 'company_work_order_unknown_field')
})
