import { createHash } from 'node:crypto'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  advanceCompanyMissionStage,
  createCompanyMission,
  getCompanyMission,
  listCompanyMissions,
  queueCompanyMissionStage,
} from './agent-company-missions.mjs'

const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex')
const createInput = (patch = {}) => ({
  clientId: 'client-acme',
  missionId: 'cash-close-1',
  playbookId: 'cash-control',
  ...patch,
})

function missionHarness() {
  const missions = new Map()
  const claims = new Map()
  const workOrders = new Map()
  const evaluations = new Map()
  const calls = { createOrder: 0, model: 0 }
  let clock = 0
  const now = () => `2026-07-14T0${clock++}:00:00.000Z`
  const options = {
    now,
    claimActivity: async (row) => {
      if (claims.has(row.id)) return { fresh: false, durable: true }
      claims.set(row.id, structuredClone(row))
      return { fresh: true, durable: true }
    },
    releaseActivityClaim: async (id) => claims.delete(id),
    putMission: async (key, record) => { missions.set(key, structuredClone(record)); return true },
    getMission: async (key) => structuredClone(missions.get(key) || null),
    transitionMission: async (key, expected, next) => {
      const current = missions.get(key)
      if (!current
        || current.status !== expected.status
        || current.planHash !== expected.planHash
        || current.revision !== expected.revision) {
        return { updated: false, durable: true, reason: 'transition_conflict' }
      }
      missions.set(key, structuredClone(next))
      return { updated: true, durable: true }
    },
    listActivity: async (limit, filter) => [...claims.values()]
      .filter((item) => item.kind === filter.kind && item.ref === filter.ref)
      .slice(0, limit)
      .map((item) => structuredClone(item)),
    createCompanyWorkOrder: async (input) => {
      calls.createOrder += 1
      const agentId = input.agents[0]
      const text = typeof input.evidence[agentId] === 'string'
        ? input.evidence[agentId].trim()
        : JSON.stringify(input.evidence[agentId])
      const workOrderId = `company-order:${sha256(`${input.clientId}\n${input.cycleId}`).slice(0, 40)}`
      const existing = workOrders.get(workOrderId)
      if (existing) return { ok: true, replayed: true, workOrder: structuredClone(existing) }
      const workOrder = {
        workOrderId,
        clientId: input.clientId,
        cycleId: input.cycleId,
        status: 'planned',
        planHash: sha256(JSON.stringify(input)),
        createdAt: now(),
        updatedAt: now(),
        plan: {
          assignments: [{ agentId, name: agentId, department: 'test', crew: 'test-crew' }],
          budget: { roleLimit: input.roleBudget, plannedRoles: input.roleBudget },
        },
        evidence: [{ agentId, digest: sha256(text), bytes: Buffer.byteLength(text, 'utf8') }],
      }
      workOrders.set(workOrderId, structuredClone(workOrder))
      return { ok: true, replayed: false, workOrder }
    },
    getCompanyWorkOrder: async ({ clientId, workOrderId }) => {
      const order = workOrders.get(workOrderId)
      return order?.clientId === clientId
        ? { ok: true, workOrder: structuredClone(order) }
        : { ok: false, reason: 'company_work_order_not_found' }
    },
    getCompanyWorkOrderEvaluation: async ({ clientId, workOrderId }) => {
      const evaluation = evaluations.get(workOrderId)
      return evaluation?.clientId === clientId
        ? { ok: true, evaluation: structuredClone(evaluation) }
        : { ok: false, reason: 'company_evaluation_not_found' }
    },
  }
  const completeAndAccept = (workOrderId, resultHash) => {
    const current = workOrders.get(workOrderId)
    workOrders.set(workOrderId, {
      ...current,
      status: 'completed',
      completedAt: now(),
      result: { ok: true, status: 'completed', actionMode: 'draft_only', results: [] },
      resultHash,
    })
    evaluations.set(workOrderId, {
      evaluationId: `company-evaluation:${workOrderId.split(':').pop()}`,
      workOrderId,
      clientId: current.clientId,
      planHash: current.planHash,
      verdict: 'accepted',
      checks: { accurate: true, complete: true, usable: true, boundarySafe: true },
      evaluatedAt: now(),
      evaluationHash: sha256(`${workOrderId}\naccepted`),
    })
  }
  return { calls, claims, completeAndAccept, evaluations, missions, options, workOrders }
}

const queueInput = (mission, stage, evidence, patch = {}) => ({
  clientId: mission.clientId,
  missionRunId: mission.missionRunId,
  missionPlanHash: mission.planHash,
  stageId: stage.stageId,
  evidence,
  confirmation: `QUEUE ${mission.missionRunId} ${stage.stageId} ${mission.planHash}`,
  ...patch,
})

const advanceInput = (mission, stage, workOrder, resultHash, nextStageEvidence, patch = {}) => ({
  clientId: mission.clientId,
  missionRunId: mission.missionRunId,
  missionPlanHash: mission.planHash,
  stageId: stage.stageId,
  workOrderId: workOrder.workOrderId,
  resultHash,
  ...(nextStageEvidence === undefined ? {} : { nextStageEvidence }),
  confirmation: `ADVANCE ${mission.missionRunId} ${stage.stageId} ${workOrder.workOrderId} ${resultHash}`,
  ...patch,
})

test('mission creation durably freezes one fixed playbook without model execution', async () => {
  const state = missionHarness()
  const created = await createCompanyMission(createInput(), state.options)
  assert.equal(created.ok, true)
  assert.equal(created.durableMissionCreated, true)
  assert.equal(created.mission.status, 'active')
  assert.equal(created.mission.revision, 1)
  assert.deepEqual(created.mission.stages.map((stage) => stage.status), ['ready', 'locked', 'locked'])
  assert.equal(created.mission.controls.serverVerifiedStageGates, true)
  assert.equal(created.mission.controls.automaticQueue, false)
  assert.equal(created.mission.controls.automaticDispatch, false)
  assert.equal(created.mission.controls.rawHandoffsStored, false)
  assert.equal(state.calls.model, 0)

  const replay = await createCompanyMission(createInput(), state.options)
  assert.equal(replay.ok, true)
  assert.equal(replay.replayed, true)
  assert.equal(replay.mission.missionRunId, created.mission.missionRunId)

  const listed = await listCompanyMissions({ clientId: 'client-acme', limit: 10 }, state.options)
  assert.deepEqual(listed.missions.map((mission) => mission.missionRunId), [created.mission.missionRunId])
  assert.equal((await getCompanyMission({ clientId: 'client-other', missionRunId: created.mission.missionRunId }, state.options)).reason, 'company_mission_not_found')
})

test('mission creation fails closed without a durable claim or record', async () => {
  const state = missionHarness()
  let released = ''
  const nonDurable = await createCompanyMission(createInput(), {
    ...state.options,
    claimActivity: async () => ({ fresh: true, durable: false }),
    releaseActivityClaim: async (id) => { released = id; return true },
  })
  assert.equal(nonDurable.reason, 'company_mission_durable_claim_required')
  assert.match(released, /^company-mission:/)

  const state2 = missionHarness()
  let releasedAfterWrite = ''
  const failedWrite = await createCompanyMission(createInput(), {
    ...state2.options,
    putMission: async () => null,
    releaseActivityClaim: async (id) => { releasedAfterWrite = id; return true },
  })
  assert.equal(failedWrite.reason, 'company_mission_store_unavailable')
  assert.match(releasedAfterWrite, /^company-mission:/)
})

test('stage queueing binds exact evidence to one existing work order and never stores raw handoff text', async () => {
  const state = missionHarness()
  const created = await createCompanyMission(createInput(), state.options)
  const stage = created.mission.stages[0]
  const evidence = 'approved cash facts only'
  let invalidCalls = 0
  const badConfirmation = await queueCompanyMissionStage(queueInput(created.mission, stage, evidence, { confirmation: 'QUEUE' }), {
    ...state.options,
    createCompanyWorkOrder: async () => { invalidCalls += 1; return { ok: true } },
  })
  assert.equal(badConfirmation.reason, 'company_mission_queue_confirmation_required')
  assert.equal(invalidCalls, 0)

  const queued = await queueCompanyMissionStage(queueInput(created.mission, stage, evidence), state.options)
  assert.equal(queued.ok, true)
  assert.equal(queued.mission.stages[0].status, 'queued')
  assert.equal(queued.mission.stages[1].status, 'locked')
  assert.equal(queued.workOrder.status, 'planned')
  assert.equal(state.calls.createOrder, 1)
  assert.equal(JSON.stringify([...state.missions.values()]).includes(evidence), false)
  assert.equal(queued.mission.stages[0].evidenceDigest, sha256(evidence))

  const savedOrder = structuredClone(state.workOrders.get(queued.workOrder.workOrderId))
  state.workOrders.delete(queued.workOrder.workOrderId)
  const missingOrder = await queueCompanyMissionStage(queueInput(queued.mission, queued.mission.stages[0], evidence), state.options)
  assert.equal(missingOrder.reason, 'company_mission_work_order_unavailable')
  state.workOrders.set(savedOrder.workOrderId, savedOrder)
  const replay = await queueCompanyMissionStage(queueInput(queued.mission, queued.mission.stages[0], evidence), state.options)
  assert.equal(replay.ok, true)
  assert.equal(replay.replayed, true)
  assert.equal(state.calls.createOrder, 1)
  const locked = await queueCompanyMissionStage(queueInput(queued.mission, queued.mission.stages[1], 'invented handoff'), state.options)
  assert.equal(locked.reason, 'company_mission_stage_locked')
})

test('accepted evaluation and exact reviewed handoff unlock only the next stage', async () => {
  const state = missionHarness()
  const created = await createCompanyMission(createInput(), state.options)
  const queued = await queueCompanyMissionStage(queueInput(created.mission, created.mission.stages[0], 'cash evidence'), state.options)
  const resultHash = 'a'.repeat(64)
  const advance = advanceInput(queued.mission, queued.mission.stages[0], queued.workOrder, resultHash, 'reviewed redacted stage two packet')

  const beforeEvaluation = await advanceCompanyMissionStage(advance, state.options)
  assert.equal(beforeEvaluation.reason, 'company_mission_result_mismatch')
  state.completeAndAccept(queued.workOrder.workOrderId, resultHash)
  state.evaluations.get(queued.workOrder.workOrderId).verdict = 'revision_required'
  const revisionRequired = await advanceCompanyMissionStage(advance, state.options)
  assert.equal(revisionRequired.reason, 'company_mission_accepted_evaluation_required')
  state.evaluations.get(queued.workOrder.workOrderId).verdict = 'accepted'

  const advanced = await advanceCompanyMissionStage(advance, state.options)
  assert.equal(advanced.ok, true)
  assert.deepEqual(advanced.mission.stages.map((stage) => stage.status), ['accepted', 'ready', 'locked'])
  assert.equal(advanced.mission.currentStageNumber, 2)
  assert.equal(advanced.mission.stages[1].approvedInputDigest, sha256('reviewed redacted stage two packet'))
  assert.equal(JSON.stringify([...state.missions.values()]).includes('reviewed redacted stage two packet'), false)

  const wrong = await queueCompanyMissionStage(queueInput(advanced.mission, advanced.mission.stages[1], 'different packet'), state.options)
  assert.equal(wrong.reason, 'company_mission_handoff_mismatch')
  const exact = await queueCompanyMissionStage(queueInput(advanced.mission, advanced.mission.stages[1], 'reviewed redacted stage two packet'), state.options)
  assert.equal(exact.ok, true)
  assert.equal(exact.mission.stages[1].status, 'queued')
})

test('a three-stage mission completes through serial server-verified gates without automatic dispatch', async () => {
  const state = missionHarness()
  let mission = (await createCompanyMission(createInput(), state.options)).mission
  const handoffs = ['reviewed packet for stage two', 'reviewed packet for stage three']
  for (let index = 0; index < mission.stages.length; index += 1) {
    const stage = mission.stages[index]
    const evidence = index === 0 ? 'approved first-stage evidence' : handoffs[index - 1]
    const queued = await queueCompanyMissionStage(queueInput(mission, stage, evidence), state.options)
    assert.equal(queued.ok, true)
    const resultHash = String(index + 1).repeat(64)
    state.completeAndAccept(queued.workOrder.workOrderId, resultHash)
    const nextEvidence = index < mission.stages.length - 1 ? handoffs[index] : undefined
    const advanced = await advanceCompanyMissionStage(
      advanceInput(queued.mission, queued.mission.stages[index], queued.workOrder, resultHash, nextEvidence),
      state.options,
    )
    assert.equal(advanced.ok, true)
    mission = advanced.mission
  }
  assert.equal(mission.status, 'completed')
  assert.equal(mission.completedAt !== null, true)
  assert.deepEqual(mission.stages.map((stage) => stage.status), ['accepted', 'accepted', 'accepted'])
  assert.equal(state.calls.createOrder, 3)
  assert.equal(state.calls.model, 0)

  const finalStage = mission.stages[2]
  const finalOrder = state.workOrders.get(finalStage.workOrderId)
  const replay = await advanceCompanyMissionStage(
    advanceInput(mission, finalStage, finalOrder, finalStage.resultHash, undefined),
    state.options,
  )
  assert.equal(replay.ok, true)
  assert.equal(replay.replayed, true)
})

test('mission input, shape, and stale transitions fail closed before execution', async () => {
  const state = missionHarness()
  assert.equal((await createCompanyMission({ ...createInput(), dispatch: true }, state.options)).reason, 'company_mission_unknown_field')
  assert.equal((await listCompanyMissions({ clientId: 'client-acme', limit: 21 }, state.options)).reason, 'company_mission_invalid_limit')
  const created = await createCompanyMission(createInput(), state.options)
  const oversized = await queueCompanyMissionStage(
    queueInput(created.mission, created.mission.stages[0], 'x'.repeat(12_001)),
    state.options,
  )
  assert.equal(oversized.reason, 'company_mission_evidence_too_large')
  assert.equal(state.calls.createOrder, 0)

  const conflict = await queueCompanyMissionStage(
    queueInput(created.mission, created.mission.stages[0], 'approved evidence'),
    { ...state.options, transitionMission: async () => ({ updated: false, durable: true, reason: 'transition_conflict' }) },
  )
  assert.equal(conflict.reason, 'company_mission_transition_conflict')
  assert.equal(conflict.status, 'conflict')
})
