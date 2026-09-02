import { after, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildCompanyOperationsReport,
  evaluateCeoOutcomeDelivery,
  evaluateCompanyWorkOrder,
  getCompanyWorkOrderEvaluation,
  loadCeoOutcomeCycleState,
  promoteAcceptedCeoOutcomeAction,
  recordCeoOutcomeCompletion,
  recordCeoOutcomeDeliveryResult,
} from './agent-company-operations.mjs'
import {
  resolveCeoOutcomeActionAuthority,
  selectCeoOutcome,
  SUPERMEGA_HQ_AUTHORITY,
} from './supermega-hq-authority.mjs'

// The founder breach alert is the only path in this module that can reach the network, and it
// does so through alert.mjs `notifyDetailed`, which falls back to the GLOBAL `fetch` whenever no
// transport is injected. Take that global before anything runs a report: ESM import declarations
// are evaluated ahead of every module-body statement, so this is the earliest point a single test
// module can install the stub, and it is still before the first test executes. Calls are recorded
// and then refused — no test in this file may perform real network I/O.
const globalFetchCalls = []
const realGlobalFetch = globalThis.fetch
globalThis.fetch = async (...args) => {
  globalFetchCalls.push(args)
  throw new Error('global fetch is stubbed in this test file: no network I/O')
}
after(() => { globalThis.fetch = realGlobalFetch })

const HASH = 'a'.repeat(64)
const AUTHORITY_DIGEST = 'c'.repeat(64)
const SUCCESS_MEASURE_DIGEST = 'b'.repeat(64)
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
      putCeoOutcomeAction: async (key, value) => { cache.set(key, structuredClone(value)); return true },
      getCeoOutcomeAction: async (key) => structuredClone(cache.get(key) || null),
      resolveCeoOutcomeActionAuthority: async ({ outcomeId, authorityDigest, successMeasureDigest }) => ({
        ok: true,
        authorityDigest,
        outcome: { id: outcomeId, team: 'product', successMeasureDigest },
        controls: {
          externalWrites: false,
          dynamicDelegation: false,
          recursiveDelegation: false,
          humanApprovalForConsequentialActions: true,
        },
      }),
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
  successMeasureDigest: SUCCESS_MEASURE_DIGEST,
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
  assert.equal(completed.outcome.successMeasureDigest, SUCCESS_MEASURE_DIGEST)
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
  assert.equal((await recordCeoOutcomeCompletion({ ...ceoOutcomeInput(), successMeasure: 'private target text' }, state.options)).reason, 'company_operations_unknown_field')
  assert.equal((await recordCeoOutcomeCompletion(ceoOutcomeInput({ successMeasureDigest: undefined }), state.options)).reason, 'ceo_outcome_invalid_success_measure_digest')
  assert.equal((await recordCeoOutcomeCompletion(ceoOutcomeInput({ usage: { ...operatorUsage(), provider: 'private-provider' } }), state.options)).reason, 'ceo_outcome_invalid_usage')

  const evaluationInput = {
    clientId: 'client-acme',
    operationId: completed.outcome.operationId,
    recordHash: completed.outcome.recordHash,
    successMeasureDigest: completed.outcome.successMeasureDigest,
    verdict: 'accepted',
    confirmation: `EVALUATE ${completed.outcome.operationId} ${completed.outcome.successMeasureDigest}`,
  }
  assert.equal((await evaluateCeoOutcomeDelivery({ ...evaluationInput, clientId: 'client-other' }, state.options)).reason, 'ceo_outcome_not_found')
  assert.equal((await evaluateCeoOutcomeDelivery({ ...evaluationInput, recordHash: 'd'.repeat(64) }, state.options)).reason, 'ceo_outcome_record_mismatch')
  assert.equal((await evaluateCeoOutcomeDelivery({ ...evaluationInput, successMeasureDigest: undefined }, state.options)).reason, 'ceo_outcome_invalid_success_measure_digest')
  assert.equal((await evaluateCeoOutcomeDelivery({
    ...evaluationInput,
    successMeasureDigest: 'd'.repeat(64),
    confirmation: `EVALUATE ${completed.outcome.operationId} ${'d'.repeat(64)}`,
  }, state.options)).reason, 'ceo_outcome_success_measure_mismatch')
  assert.equal((await evaluateCeoOutcomeDelivery({ ...evaluationInput, confirmation: `EVALUATE ${completed.outcome.operationId}` }, state.options)).reason, 'ceo_outcome_evaluation_confirmation_required')
  const accepted = await evaluateCeoOutcomeDelivery(evaluationInput, state.options)
  assert.equal(accepted.ok, true)
  assert.equal(accepted.evaluation.verdict, 'accepted')
  assert.equal(accepted.evaluation.successMeasureDigest, SUCCESS_MEASURE_DIGEST)
  assert.equal(accepted.action.status, 'proposed')
  assert.equal(accepted.action.ownerRole, 'milestone-builder')
  assert.equal(accepted.action.actionMode, 'internal_draft_only')
  assert.equal(JSON.stringify(accepted).includes('answer'), false)
  assert.equal((await evaluateCeoOutcomeDelivery(evaluationInput, state.options)).replayed, true)
  assert.equal((await evaluateCeoOutcomeDelivery({ ...evaluationInput, verdict: 'revision_required' }, state.options)).reason, 'ceo_outcome_evaluation_conflict')
})

test('accepted outcome action authority fails closed on stale or blocked definitions', () => {
  const selected = selectCeoOutcome()
  const resolved = resolveCeoOutcomeActionAuthority({
    outcomeId: selected.selected.id,
    authorityDigest: selected.authorityDigest,
    successMeasureDigest: selected.selected.successMeasureDigest,
  })
  assert.equal(resolved.ok, true)
  assert.equal(resolved.outcome.team, 'product')
  assert.equal(resolved.controls.externalWrites, false)
  assert.equal(resolved.controls.dynamicDelegation, false)
  assert.equal(resolveCeoOutcomeActionAuthority({
    outcomeId: selected.selected.id,
    authorityDigest: 'a'.repeat(64),
    successMeasureDigest: selected.selected.successMeasureDigest,
  }).reason, 'ceo_outcome_action_authority_stale')
  const blocked = SUPERMEGA_HQ_AUTHORITY.outcomes.find((outcome) => outcome.state === 'blocked')
  assert.equal(resolveCeoOutcomeActionAuthority({
    outcomeId: blocked.id,
    authorityDigest: selected.authorityDigest,
    successMeasureDigest: 'a'.repeat(64),
  }).reason, 'ceo_outcome_action_not_authorized')
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

test('accepted CEO outcome promotes to one durable internal draft action', async () => {
  const state = ceoOutcomeHarness()
  const completed = await recordCeoOutcomeCompletion(ceoOutcomeInput(), state.options)
  const evaluated = await evaluateCeoOutcomeDelivery({
    clientId: 'client-acme',
    operationId: completed.outcome.operationId,
    recordHash: completed.outcome.recordHash,
    successMeasureDigest: completed.outcome.successMeasureDigest,
    verdict: 'accepted',
    confirmation: `EVALUATE ${completed.outcome.operationId} ${completed.outcome.successMeasureDigest}`,
  }, state.options)
  const input = {
    clientId: 'client-acme',
    operationId: completed.outcome.operationId,
    evaluationHash: evaluated.evaluation.evaluationHash,
    confirmation: `PROMOTE ${completed.outcome.operationId} ${evaluated.evaluation.evaluationHash}`,
  }
  const promoted = await promoteAcceptedCeoOutcomeAction(input, state.options)
  assert.equal(promoted.ok, true)
  assert.equal(promoted.action.status, 'proposed')
  assert.equal(promoted.action.actionMode, 'internal_draft_only')
  assert.equal(promoted.action.ownerRole, 'milestone-builder')
  assert.equal(promoted.action.team, 'product')
  assert.match(promoted.action.actionId, /^ceo-outcome-action:[a-f0-9]{40}$/)
  assert.match(promoted.action.actionHash, /^[a-f0-9]{64}$/)
  assert.doesNotMatch(JSON.stringify(promoted), /provider|model output|private answer/)
  const replay = await promoteAcceptedCeoOutcomeAction(input, {
    ...state.options,
    now: () => '2026-07-17T01:00:00.000Z',
  })
  assert.equal(replay.ok, true)
  assert.equal(replay.replayed, true)
  assert.equal(replay.action.actionHash, promoted.action.actionHash)
  assert.equal((await promoteAcceptedCeoOutcomeAction({
    ...input,
    confirmation: `PROMOTE ${completed.outcome.operationId}`,
  }, state.options)).reason, 'ceo_outcome_action_confirmation_required')
  assert.equal((await promoteAcceptedCeoOutcomeAction({
    ...input,
    evaluationHash: 'd'.repeat(64),
    confirmation: `PROMOTE ${completed.outcome.operationId} ${'d'.repeat(64)}`,
  }, state.options)).reason, 'ceo_outcome_action_evaluation_mismatch')
})

test('CEO outcome action promotion fails closed without accepted durable authority', async () => {
  const state = ceoOutcomeHarness()
  const completed = await recordCeoOutcomeCompletion(ceoOutcomeInput(), state.options)
  const revised = await evaluateCeoOutcomeDelivery({
    clientId: 'client-acme',
    operationId: completed.outcome.operationId,
    recordHash: completed.outcome.recordHash,
    successMeasureDigest: completed.outcome.successMeasureDigest,
    verdict: 'revision_required',
    confirmation: `EVALUATE ${completed.outcome.operationId} ${completed.outcome.successMeasureDigest}`,
  }, state.options)
  const input = {
    clientId: 'client-acme',
    operationId: completed.outcome.operationId,
    evaluationHash: revised.evaluation.evaluationHash,
    confirmation: `PROMOTE ${completed.outcome.operationId} ${revised.evaluation.evaluationHash}`,
  }
  assert.equal((await promoteAcceptedCeoOutcomeAction(input, state.options)).reason, 'ceo_outcome_action_accepted_evaluation_required')

  const acceptedState = ceoOutcomeHarness()
  const acceptedOperation = await recordCeoOutcomeCompletion(ceoOutcomeInput(), acceptedState.options)
  const accepted = await evaluateCeoOutcomeDelivery({
    clientId: 'client-acme',
    operationId: acceptedOperation.outcome.operationId,
    recordHash: acceptedOperation.outcome.recordHash,
    successMeasureDigest: acceptedOperation.outcome.successMeasureDigest,
    verdict: 'accepted',
    confirmation: `EVALUATE ${acceptedOperation.outcome.operationId} ${acceptedOperation.outcome.successMeasureDigest}`,
  }, acceptedState.options)
  const acceptedInput = {
    clientId: 'client-acme',
    operationId: acceptedOperation.outcome.operationId,
    evaluationHash: accepted.evaluation.evaluationHash,
    confirmation: `PROMOTE ${acceptedOperation.outcome.operationId} ${accepted.evaluation.evaluationHash}`,
  }
  assert.equal((await promoteAcceptedCeoOutcomeAction(acceptedInput, {
    ...acceptedState.options,
    resolveCeoOutcomeActionAuthority: async () => ({ ok: false, reason: 'ceo_outcome_action_authority_stale' }),
  })).reason, 'ceo_outcome_action_authority_stale')
  let released = ''
  assert.equal((await promoteAcceptedCeoOutcomeAction(acceptedInput, {
    ...acceptedState.options,
    claimActivity: async () => ({ fresh: true, durable: false }),
    releaseActivityClaim: async (id) => { released = id; return true },
  })).reason, 'ceo_outcome_action_durable_claim_required')
  assert.match(released, /^ceo-outcome-action-record:/)
})

test('accepted evaluation reports action persistence failure and recovers on exact replay', async () => {
  const state = ceoOutcomeHarness()
  const completed = await recordCeoOutcomeCompletion(ceoOutcomeInput(), state.options)
  const input = {
    clientId: 'client-acme',
    operationId: completed.outcome.operationId,
    recordHash: completed.outcome.recordHash,
    successMeasureDigest: completed.outcome.successMeasureDigest,
    verdict: 'accepted',
    confirmation: `EVALUATE ${completed.outcome.operationId} ${completed.outcome.successMeasureDigest}`,
  }
  const failed = await evaluateCeoOutcomeDelivery(input, {
    ...state.options,
    putCeoOutcomeAction: async () => false,
  })
  assert.equal(failed.ok, false)
  assert.equal(failed.reason, 'ceo_outcome_action_store_unavailable')
  assert.equal(failed.evaluationRecorded, true)
  const recovered = await evaluateCeoOutcomeDelivery(input, state.options)
  assert.equal(recovered.ok, true)
  assert.equal(recovered.replayed, true)
  assert.equal(recovered.action.status, 'proposed')
  assert.equal(recovered.actionReplayed, false)
})

test('weekly CEO state reconciles delivery only for the protected console and returns no receipt identity', async () => {
  const state = ceoOutcomeHarness()
  const operation = await recordCeoOutcomeCompletion(ceoOutcomeInput({
    completedAt: '2026-07-14T01:00:00.000Z',
  }), state.options)
  await recordCeoOutcomeDeliveryResult({
    clientId: 'client-acme',
    operationId: operation.outcome.operationId,
    recordHash: operation.outcome.recordHash,
    deliveryClaimId: `workcell:${'d'.repeat(40)}`,
    status: 'failed',
  }, state.options)
  const list = (prefix) => async () => ({
    durable: true,
    records: [...state.cache.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, payload]) => ({ key, payload: structuredClone(payload) })),
  })
  const input = {
    clientId: 'client-acme',
    authorityDigest: AUTHORITY_DIGEST,
    asOf: '2026-07-14T09:00:00.000Z',
    includeDelivery: true,
  }
  const reconciled = await loadCeoOutcomeCycleState(input, {
    listCeoOutcomeRecords: list('ceo-outcome-operation:'),
    listCeoOutcomeDeliveryRecords: list('ceo-outcome-delivery:'),
  })
  assert.equal(reconciled.ok, true)
  assert.equal(reconciled.delivery.state, 'attention')
  assert.deepEqual(reconciled.delivery.counts, { completed: 1, recorded: 1, sent: 0, failed: 1, uncertain: 0, missing: 0 })
  assert.deepEqual(reconciled.delivery.outcomes, [{ outcomeId: 'daily-company-control', status: 'failed' }])
  assert.doesNotMatch(JSON.stringify(reconciled.delivery), /operationId|deliveryId|claim|brief|provider|model/i)

  const missing = await loadCeoOutcomeCycleState(input, {
    listCeoOutcomeRecords: list('ceo-outcome-operation:'),
    listCeoOutcomeDeliveryRecords: async () => ({ durable: true, records: [] }),
  })
  assert.equal(missing.delivery.state, 'missing')
  assert.deepEqual(missing.delivery.outcomes, [{ outcomeId: 'daily-company-control', status: 'missing' }])

  let deliveryReads = 0
  const scheduled = await loadCeoOutcomeCycleState({ ...input, includeDelivery: false }, {
    listCeoOutcomeRecords: list('ceo-outcome-operation:'),
    listCeoOutcomeDeliveryRecords: async () => { deliveryReads += 1; throw new Error('must not run') },
  })
  assert.equal(scheduled.ok, true)
  assert.equal(Object.hasOwn(scheduled, 'delivery'), false)
  assert.equal(deliveryReads, 0)
  assert.equal((await loadCeoOutcomeCycleState({ ...input, includeDelivery: 'yes' })).reason, 'ceo_outcome_cycle_delivery_option_invalid')
})

test('accepted CEO outcomes per work unit require complete evaluation, valid usage, and clean coverage', async () => {
  const state = ceoOutcomeHarness()
  const first = await recordCeoOutcomeCompletion(ceoOutcomeInput(), state.options)
  const second = await recordCeoOutcomeCompletion(ceoOutcomeInput({
    completedAt: '2026-07-15T01:00:00.000Z',
    usage: operatorUsage({ weightedTotalUnits: 30 }),
  }), state.options)
  await recordCeoOutcomeDeliveryResult({
    clientId: 'client-acme',
    operationId: first.outcome.operationId,
    recordHash: first.outcome.recordHash,
    deliveryClaimId: `workcell:${'d'.repeat(40)}`,
    status: 'sent',
  }, state.options)
  await recordCeoOutcomeDeliveryResult({
    clientId: 'client-acme',
    operationId: second.outcome.operationId,
    recordHash: second.outcome.recordHash,
    deliveryClaimId: `workcell:${'e'.repeat(40)}`,
    status: 'sent',
  }, state.options)
  await evaluateCeoOutcomeDelivery({
    clientId: 'client-acme',
    operationId: first.outcome.operationId,
    recordHash: first.outcome.recordHash,
    successMeasureDigest: first.outcome.successMeasureDigest,
    verdict: 'accepted',
    confirmation: `EVALUATE ${first.outcome.operationId} ${first.outcome.successMeasureDigest}`,
  }, state.options)
  const listCeoOutcomeRecords = async () => ({
    durable: true,
    records: [...state.cache.entries()]
      .filter(([key]) => key.startsWith('ceo-outcome-operation:'))
      .map(([key, payload]) => ({ key, payload: structuredClone(payload) })),
  })
  const listCeoOutcomeDeliveryRecords = async () => ({
    durable: true,
    records: [...state.cache.entries()]
      .filter(([key]) => key.startsWith('ceo-outcome-delivery:'))
      .map(([key, payload]) => ({ key, payload: structuredClone(payload) })),
  })
  const listCeoOutcomeActionRecords = async () => ({
    durable: true,
    records: [...state.cache.entries()]
      .filter(([key]) => key.startsWith('ceo-outcome-action:'))
      .map(([key, payload]) => ({ key, payload: structuredClone(payload) })),
  })
  const reportOptions = {
    listCompanyWorkOrders: async () => ({ ok: true, workOrders: [] }),
    listCeoOutcomeRecords,
    listCeoOutcomeDeliveryRecords,
    listCeoOutcomeActionRecords,
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
    successMeasureDigest: second.outcome.successMeasureDigest,
    verdict: 'revision_required',
    confirmation: `EVALUATE ${second.outcome.operationId} ${second.outcome.successMeasureDigest}`,
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
  assert.deepEqual(measured.outcomes.delivery.counts, { completed: 2, recorded: 2, sent: 2, failed: 0, uncertain: 0, missing: 0 })
  assert.equal(measured.outcomes.delivery.state, 'ready')
  assert.equal(measured.outcomes.actions.state, 'ready')
  assert.deepEqual(measured.outcomes.actions.counts, { accepted: 1, proposed: 1, missing: 0 })
  assert.deepEqual(measured.outcomes.actions.items, [{
    outcomeId: 'daily-company-control',
    team: 'product',
    ownerRole: 'milestone-builder',
    title: 'Convert the accepted CEO brief into one bounded implementation task',
    acceptanceCheck: 'Record one accountable owner, one exact artifact, and one verifiable acceptance check before execution.',
    actionMode: 'internal_draft_only',
    status: 'proposed',
  }])
  assert.doesNotMatch(JSON.stringify(measured.outcomes.actions), /operationId|evaluationId|actionId|Hash|provider|model output/i)
  assert.equal(measured.attention.deliveryFailed, 0)
  assert.equal(measured.attention.deliveryUncertain, 0)
  assert.equal(measured.attention.deliveryMissing, 0)
  assert.deepEqual(measured.attentionQueue, {
    contract: 'supermega.company-attention-queue.v1',
    state: 'clear',
    requiredActions: 0,
    signals: 0,
    items: [],
  })
  assert.equal(measured.exposure.ceoBriefTextReturned, false)
  assert.equal(measured.exposure.ceoDeliveryContentReturned, false)
  assert.equal(measured.exposure.providerRowsReturned, false)
  assert.equal(JSON.stringify(measured.outcomes).includes('private-provider'), false)

  const missingAction = await buildCompanyOperationsReport({ clientId: 'client-acme', windowDays: 30 }, {
    ...reportOptions,
    listCeoOutcomeActionRecords: async () => ({ durable: true, records: [] }),
  })
  assert.equal(missingAction.outcomes.actions.state, 'missing')
  assert.deepEqual(missingAction.outcomes.actions.counts, { accepted: 1, proposed: 0, missing: 1 })
  assert.deepEqual(missingAction.outcomes.actions.items, [])

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

test('CEO delivery coverage surfaces failed, uncertain, missing, non-durable, and invalid receipts without content', async () => {
  const state = ceoOutcomeHarness()
  const statuses = ['failed', 'uncertain', 'sent']
  const completed = []
  for (let index = 0; index < statuses.length; index += 1) {
    const operation = await recordCeoOutcomeCompletion(ceoOutcomeInput({
      completedAt: `2026-07-${14 + index}T01:00:00.000Z`,
      usage: operatorUsage({ weightedTotalUnits: 40 + index }),
    }), state.options)
    completed.push(operation)
    await recordCeoOutcomeDeliveryResult({
      clientId: 'client-acme',
      operationId: operation.outcome.operationId,
      recordHash: operation.outcome.recordHash,
      deliveryClaimId: `workcell:${String.fromCharCode(100 + index).repeat(40)}`,
      status: statuses[index],
    }, state.options)
  }
  const operationRows = [...state.cache.entries()]
    .filter(([key]) => key.startsWith('ceo-outcome-operation:'))
    .map(([key, payload]) => ({ key, payload: structuredClone(payload) }))
  const deliveryRows = [...state.cache.entries()]
    .filter(([key]) => key.startsWith('ceo-outcome-delivery:'))
    .map(([key, payload]) => ({ key, payload: structuredClone(payload) }))
  const options = {
    listCompanyWorkOrders: async () => ({ ok: true, workOrders: [] }),
    listCeoOutcomeRecords: async () => ({ durable: true, records: operationRows.slice(0, 2) }),
    listCeoOutcomeDeliveryRecords: async () => ({ durable: true, records: deliveryRows.slice(0, 2) }),
    now: () => '2026-07-16T02:00:00.000Z',
  }

  const attention = await buildCompanyOperationsReport({ clientId: 'client-acme', windowDays: 30 }, options)
  assert.equal(attention.outcomes.delivery.state, 'attention')
  assert.deepEqual(attention.outcomes.delivery.counts, { completed: 2, recorded: 2, sent: 0, failed: 1, uncertain: 1, missing: 0 })
  assert.equal(attention.attention.deliveryFailed, 1)
  assert.equal(attention.attention.deliveryUncertain, 1)
  assert.equal(attention.attentionQueue.state, 'action_required')
  assert.equal(attention.attentionQueue.requiredActions, 2)
  assert.equal(attention.attentionQueue.signals, 2)
  assert.deepEqual(attention.attentionQueue.items.map((item) => item.id), ['delivery_uncertain', 'delivery_failed'])

  const missing = await buildCompanyOperationsReport({ clientId: 'client-acme', windowDays: 30 }, {
    ...options,
    listCeoOutcomeDeliveryRecords: async () => ({ durable: true, records: deliveryRows.slice(0, 1) }),
  })
  assert.equal(missing.outcomes.delivery.state, 'missing')
  assert.equal(missing.outcomes.delivery.counts.missing, 1)
  assert.equal(missing.attention.deliveryMissing, 1)

  const nonDurable = await buildCompanyOperationsReport({ clientId: 'client-acme', windowDays: 30 }, {
    ...options,
    listCeoOutcomeDeliveryRecords: async () => ({ durable: false, records: deliveryRows.slice(0, 2) }),
  })
  assert.equal(nonDurable.outcomes.delivery.state, 'non_durable')

  const tampered = structuredClone(deliveryRows[0])
  tampered.payload.briefText = 'private delivery content'
  const invalid = await buildCompanyOperationsReport({ clientId: 'client-acme', windowDays: 30 }, {
    ...options,
    listCeoOutcomeDeliveryRecords: async () => ({
      durable: true,
      records: [...deliveryRows.slice(0, 2), structuredClone(deliveryRows[0]), tampered, deliveryRows[2]],
    }),
  })
  assert.equal(invalid.outcomes.delivery.state, 'invalid_coverage')
  assert.equal(invalid.outcomes.delivery.coverage.duplicateRecords, 1)
  assert.equal(invalid.outcomes.delivery.coverage.invalidRecords, 1)
  assert.equal(invalid.outcomes.delivery.coverage.orphanRecords, 1)
  assert.doesNotMatch(JSON.stringify(invalid.outcomes.delivery), /private|operationId|deliveryId|claim/i)

  const unavailable = await buildCompanyOperationsReport({ clientId: 'client-acme', windowDays: 30 }, {
    ...options,
    listCeoOutcomeDeliveryRecords: async () => { throw new Error('private store failure') },
  })
  assert.equal(unavailable.outcomes.delivery.state, 'store_unavailable')
  assert.equal(unavailable.outcomes.delivery.counts.missing, 2)
  assert.doesNotMatch(JSON.stringify(unavailable.outcomes.delivery), /private store failure/)
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
  assert.equal(report.workforce.registeredAgents, 12)
  assert.equal(report.workforce.historicalAgents, 1)
  assert.equal(report.workforce.utilizedAgents, 1)
  assert.equal(report.workforce.activeAgents, 0)
  assert.equal(report.workforce.queuedAgents, 0)
  assert.equal(report.workforce.runningAgents, 0)
  assert.equal(report.workforce.computeConsumingAgents, 0)
  assert.equal(report.workforce.registeredAgentsConsumeCompute, false)
  assert.equal(report.workforce.activationMode, 'demand_driven')
  assert.equal(report.workforce.dormantAgents, 12)
  assert.equal(report.workforce.queuedAssignments, 0)
  assert.equal(report.workforce.runningAssignments, 0)
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
  assert.equal(report.workforce.registeredAgents, 12)
  assert.equal(report.workforce.historicalAgents, 2)
  assert.equal(report.workforce.utilizedAgents, 2)
  assert.equal(report.workforce.computeConsumingAgents, 0)
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
  assert.equal(attention.attentionQueue.state, 'action_required')
  assert.equal(attention.attentionQueue.requiredActions, 1)
  assert.equal(attention.attentionQueue.signals, 1)
  assert.equal(attention.attentionQueue.items[0].id, 'overdue_running')
  assert.equal(attention.workforce.activeAgents, 1)
  assert.equal(attention.workforce.runningAgents, 1)
  assert.equal(attention.workforce.computeConsumingAgents, 1)
  assert.equal(attention.workforce.runningAssignments, 1)
  assert.equal(attention.workforce.queuedAgents, 0)
  assert.equal(attention.workforce.dormantAgents, 11)
  assert.equal((await buildCompanyOperationsReport({ clientId: 'client-acme', windowDays: 31 })).reason, 'company_operations_invalid_window')
  assert.equal((await buildCompanyOperationsReport({ clientId: 'client-acme', windowDays: 30, raw: true })).reason, 'company_operations_unknown_field')
})

function alertHarness(clientId) {
  const orders = Array.from({ length: 5 }, (_, index) => order({
    workOrderId: `company-order:${String(index + 1).repeat(40)}`,
    clientId,
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
  const alertState = new Map()
  const claims = new Map()
  const sends = []
  const harness = {
    sends,
    alertState,
    claims,
    stateReads: 0,
    evaluated: false,
    options: (patch = {}) => ({
      listCompanyWorkOrders: async () => ({ ok: true, workOrders: orders.map(({ result, evidence, ...item }) => item) }),
      getCompanyWorkOrder: async ({ workOrderId }) => ({ ok: true, workOrder: structuredClone(orders.find((item) => item.workOrderId === workOrderId)) }),
      getEvaluation: async (key) => (harness.evaluated ? evaluations.get(key) || null : null),
      getOperationsAlertState: async (key) => { harness.stateReads += 1; return structuredClone(alertState.get(key) || null) },
      putOperationsAlertState: async (key, value) => {
        if (alertState.has(key)) return null
        alertState.set(key, structuredClone(value))
        return true
      },
      transitionOperationsAlertState: async (key, expected, value) => {
        const current = alertState.get(key)
        if (!current || current.status !== expected.status || current.planHash !== expected.planHash) {
          return { updated: false, durable: true, reason: 'transition_conflict' }
        }
        alertState.set(key, structuredClone(value))
        return { updated: true, durable: true }
      },
      claimOperationsAlertInit: async ({ id }) => {
        if (claims.has(id)) return { fresh: false, durable: true }
        claims.set(id, true)
        return { fresh: true, durable: true }
      },
      releaseOperationsAlertInit: async (id) => claims.delete(id),
      env: { TELEGRAM_BOT_TOKEN: 'unit-test-token', TELEGRAM_ALERT_CHAT_ID: '1001' },
      fetch: async (url, init) => { sends.push(JSON.parse(init.body)); return { ok: true } },
      now: () => '2026-07-15T00:00:00.000Z',
      ...patch,
    }),
  }
  return harness
}

test('operations report alerts the founder once per breach set with metadata only', async () => {
  const clientId = 'client-alert-dedupe'
  const harness = alertHarness(clientId)
  const first = await buildCompanyOperationsReport({ clientId, windowDays: 30 }, harness.options())
  assert.equal(first.ok, true)
  assert.equal(harness.sends.length, 1)
  assert.equal(harness.sends[0].chat_id, '1001')
  assert.match(harness.sends[0].text, /evaluation_coverage_rate: 0 vs target >= 1/)
  assert.match(harness.sends[0].text, new RegExp(`client ${clientId}`))
  assert.match(harness.sends[0].text, /30d window/)
  assert.doesNotMatch(harness.sends[0].text, /model output|anthropic|private|e{64}/)
  const stored = harness.alertState.get(`company-operations-alert:${clientId}:30`)
  assert.equal(stored.contract, 'supermega.company-operations-alert-state.v1')
  assert.equal(stored.status, 'alerted')
  assert.equal(stored.signature, 'evaluation_coverage_rate')
  assert.deepEqual(stored.breachedTargetIds, ['evaluation_coverage_rate'])
  assert.equal(stored.updatedAt, '2026-07-15T00:00:00.000Z')
  assert.match(String(stored.planHash), /^[a-f0-9]{64}$/)

  const second = await buildCompanyOperationsReport({ clientId, windowDays: 30 }, harness.options())
  assert.equal(second.ok, true)
  assert.equal(harness.sends.length, 1)

  const afterInterval = await buildCompanyOperationsReport({ clientId, windowDays: 30 }, harness.options({
    now: () => '2026-07-15T07:00:00.000Z',
  }))
  assert.equal(afterInterval.ok, true)
  assert.equal(harness.sends.length, 2)
})

test('operations alert clears on recovery and alerts again when the same breach returns', async () => {
  const clientId = 'client-alert-recovery'
  const harness = alertHarness(clientId)
  await buildCompanyOperationsReport({ clientId, windowDays: 30 }, harness.options())
  assert.equal(harness.sends.length, 1)

  harness.evaluated = true
  const recovered = await buildCompanyOperationsReport({ clientId, windowDays: 30 }, harness.options())
  assert.equal(recovered.readiness, 'meeting_targets')
  assert.equal(harness.sends.length, 1)
  assert.equal(harness.alertState.get(`company-operations-alert:${clientId}:30`).status, 'clear')
  assert.equal(harness.alertState.get(`company-operations-alert:${clientId}:30`).signature, '')

  harness.evaluated = false
  const rebroken = await buildCompanyOperationsReport({ clientId, windowDays: 30 }, harness.options())
  assert.equal(rebroken.ok, true)
  assert.equal(harness.sends.length, 2)
})

test('operations report survives alert transport failure and retries only a definite rejection', async () => {
  const clientId = 'client-alert-transport'
  const harness = alertHarness(clientId)
  let attempts = 0
  const rejecting = harness.options({ fetch: async () => { attempts += 1; return { ok: false } } })
  const rejected = await buildCompanyOperationsReport({ clientId, windowDays: 30 }, rejecting)
  assert.equal(rejected.ok, true)
  assert.equal(attempts, 1)
  // A definite rejection releases the claim so the next report request retries immediately.
  assert.equal(harness.alertState.get(`company-operations-alert:${clientId}:30`).status, 'clear')
  const retried = await buildCompanyOperationsReport({ clientId, windowDays: 30 }, rejecting)
  assert.equal(retried.ok, true)
  assert.equal(attempts, 2)

  const throwing = harness.options({ fetch: async () => { attempts += 1; throw new Error('transport down') } })
  const uncertain = await buildCompanyOperationsReport({ clientId, windowDays: 30 }, throwing)
  assert.equal(uncertain.ok, true)
  assert.equal(attempts, 3)
  assert.equal(harness.alertState.get(`company-operations-alert:${clientId}:30`).status, 'alerted')
  assert.equal(harness.alertState.get(`company-operations-alert:${clientId}:30`).signature, 'evaluation_coverage_rate')
  const deduped = await buildCompanyOperationsReport({ clientId, windowDays: 30 }, throwing)
  assert.equal(deduped.ok, true)
  assert.equal(attempts, 3)
})

test('operations alert claim races defer to the winner and silent write failures still alert once', async () => {
  const racedClientId = 'client-alert-race'
  const raced = alertHarness(racedClientId)
  raced.alertState.set(`company-operations-alert:${racedClientId}:30`, {
    contract: 'supermega.company-operations-alert-state.v1',
    clientId: racedClientId,
    windowDays: 30,
    status: 'clear',
    signature: '',
    breachedTargetIds: [],
    updatedAt: '2026-07-14T00:00:00.000Z',
    planHash: 'd'.repeat(64),
  })
  const lost = await buildCompanyOperationsReport({ clientId: racedClientId, windowDays: 30 }, raced.options({
    transitionOperationsAlertState: async () => ({ updated: false, durable: true, reason: 'transition_conflict' }),
  }))
  assert.equal(lost.ok, true)
  assert.equal(raced.sends.length, 0)

  // Durable reads keep returning null while writes silently fail (store.mjs put paths swallow
  // errors): alert once, then the per-process mirror dedupes.
  const clientId = 'client-alert-write-null'
  const harness = alertHarness(clientId)
  const silentWrites = () => harness.options({ putOperationsAlertState: async () => null })
  const first = await buildCompanyOperationsReport({ clientId, windowDays: 30 }, silentWrites())
  assert.equal(first.ok, true)
  assert.equal(harness.sends.length, 1)
  assert.equal(harness.alertState.size, 0)
  const second = await buildCompanyOperationsReport({ clientId, windowDays: 30 }, silentWrites())
  assert.equal(second.ok, true)
  assert.equal(harness.sends.length, 1)
})

test('two concurrent first-breach reports send exactly one alert under every store write semantic', async () => {
  const writeSemantics = {
    // supabase: insert-only; an existing key 409s and is swallowed to null (conflict and outage
    // are indistinguishable to the caller)
    'client-alert-conc-supabase': (alertState) => async (key, value) => {
      if (alertState.has(key)) return null
      alertState.set(key, structuredClone(value))
      return true
    },
    // postgres: on conflict do update — the upsert always "succeeds"
    'client-alert-conc-postgres': (alertState) => async (key, value) => { alertState.set(key, structuredClone(value)); return true },
    // memory: unconditional overwrite
    'client-alert-conc-memory': (alertState) => async (key, value) => { alertState.set(key, structuredClone(value)); return true },
  }
  for (const [clientId, semantics] of Object.entries(writeSemantics)) {
    const harness = alertHarness(clientId)
    const options = () => harness.options({ putOperationsAlertState: semantics(harness.alertState) })
    const [left, right] = await Promise.all([
      buildCompanyOperationsReport({ clientId, windowDays: 30 }, options()),
      buildCompanyOperationsReport({ clientId, windowDays: 30 }, options()),
    ])
    assert.equal(left.ok, true, clientId)
    assert.equal(right.ok, true, clientId)
    assert.equal(harness.sends.length, 1, clientId)
    assert.equal(harness.claims.size, 1, clientId)
  }

  // A definitively lost creation claim skips the send; an unavailable claim store fails open.
  const lostClientId = 'client-alert-claim-lost'
  const lost = alertHarness(lostClientId)
  const lostReport = await buildCompanyOperationsReport({ clientId: lostClientId, windowDays: 30 }, lost.options({
    claimOperationsAlertInit: async () => ({ fresh: false, durable: true }),
  }))
  assert.equal(lostReport.ok, true)
  assert.equal(lost.sends.length, 0)

  const downClientId = 'client-alert-claim-down'
  const down = alertHarness(downClientId)
  const downReport = await buildCompanyOperationsReport({ clientId: downClientId, windowDays: 30 }, down.options({
    claimOperationsAlertInit: async () => ({ fresh: false, durable: false, reason: 'claim_store_unavailable' }),
  }))
  assert.equal(downReport.ok, true)
  assert.equal(down.sends.length, 1)
})

test('operations alert is a silent no-op without owner tokens and dedupes in memory when state storage fails', async () => {
  const unconfiguredClientId = 'client-alert-unconfigured'
  const unconfigured = alertHarness(unconfiguredClientId)
  const report = await buildCompanyOperationsReport({ clientId: unconfiguredClientId, windowDays: 30 }, unconfigured.options({ env: {} }))
  assert.equal(report.ok, true)
  assert.equal(unconfigured.sends.length, 0)
  assert.equal(unconfigured.stateReads, 0)
  assert.equal(unconfigured.alertState.size, 0)

  const clientId = 'client-alert-state-down'
  const harness = alertHarness(clientId)
  const failingState = () => harness.options({
    getOperationsAlertState: async () => { throw new Error('state store down') },
    putOperationsAlertState: async () => { throw new Error('state store down') },
    transitionOperationsAlertState: async () => { throw new Error('state store down') },
  })
  const first = await buildCompanyOperationsReport({ clientId, windowDays: 30 }, failingState())
  assert.equal(first.ok, true)
  assert.equal(harness.sends.length, 1)
  const second = await buildCompanyOperationsReport({ clientId, windowDays: 30 }, failingState())
  assert.equal(second.ok, true)
  assert.equal(harness.sends.length, 1)
})

// Distinctive customer-shaped content planted in the work orders the report reads. None of it is
// operating metadata, so none of it may reach the founder alert.
const customerMarkers = Object.freeze({
  orderId: 'CUST-PO-99120',
  name: 'Wilhelmina Vandersloot',
  email: `buyer.wilhelmina@${'customer'}.invalid`,
  freeText: 'the second pallet arrived smashed and the buyer wants a full refund today',
})

function contaminatedAlertHarness(clientId) {
  const harness = alertHarness(clientId)
  const contaminated = Array.from({ length: 5 }, (_, index) => order({
    workOrderId: `company-order:${String(index + 1).repeat(40)}`,
    clientId,
    cycleId: `cycle-${index + 1}-${customerMarkers.orderId}`,
    createdAt: `2026-07-1${index + 1}T00:00:00.000Z`,
    startedAt: `2026-07-1${index + 1}T00:10:00.000Z`,
    completedAt: `2026-07-1${index + 1}T00:20:00.000Z`,
    customerReference: customerMarkers.orderId,
    notes: customerMarkers.freeText,
    plan: {
      brief: customerMarkers.freeText,
      assignments: [{ agentId: 'sales-qualifier', name: customerMarkers.name, department: 'growth', crew: 'lead-qualification-desk', roleCount: 3 }],
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
        summary: customerMarkers.freeText,
        output: { customer: customerMarkers.name, email: customerMarkers.email, note: customerMarkers.freeText },
      }],
      budget: { usedRoleCalls: 3 },
      durableResultStored: true,
    },
    evidence: [{ digest: 'e'.repeat(64), bytes: 20, label: customerMarkers.orderId }],
  }))
  const baseOptions = harness.options
  harness.options = (patch = {}) => baseOptions({
    listCompanyWorkOrders: async () => ({ ok: true, workOrders: contaminated.map(({ result, evidence, ...item }) => item) }),
    getCompanyWorkOrder: async ({ workOrderId }) => ({
      ok: true,
      workOrder: structuredClone(contaminated.find((item) => item.workOrderId === workOrderId)),
    }),
    ...patch,
  })
  return harness
}

test('a changed operations breach set alerts immediately inside the repeat interval', async () => {
  const clientId = 'client-alert-changed-set'
  const harness = alertHarness(clientId)
  const stateKey = `company-operations-alert:${clientId}:30`
  // A second breach on top of the first: 120 minutes from dispatch to terminal result against a
  // 30 minute target, on the same five orders the base harness lists.
  const slowExecution = async ({ workOrderId }) => {
    const day = workOrderId.split(':')[1].slice(0, 1)
    return {
      ok: true,
      workOrder: order({
        workOrderId,
        clientId,
        cycleId: `cycle-${day}`,
        createdAt: `2026-07-1${day}T00:00:00.000Z`,
        startedAt: `2026-07-1${day}T00:10:00.000Z`,
        completedAt: `2026-07-1${day}T02:10:00.000Z`,
      }),
    }
  }

  const first = await buildCompanyOperationsReport({ clientId, windowDays: 30 }, harness.options())
  assert.equal(first.ok, true)
  assert.equal(harness.sends.length, 1)
  assert.equal(harness.alertState.get(stateKey).signature, 'evaluation_coverage_rate')

  // Same clock as the first alert — well inside the 6 hour repeat interval — but the breach set
  // is different, so the founder is told immediately instead of waiting out the interval.
  const widened = await buildCompanyOperationsReport({ clientId, windowDays: 30 }, harness.options({
    getCompanyWorkOrder: slowExecution,
  }))
  assert.equal(widened.ok, true)
  assert.deepEqual(
    widened.targets.filter((target) => target.state === 'missed').map((target) => target.id),
    ['execution_p90', 'evaluation_coverage_rate'],
  )
  assert.equal(harness.sends.length, 2)
  assert.match(harness.sends[1].text, /execution_p90: 120 vs target <= 30/)
  assert.match(harness.sends[1].text, /2\/8 operating targets missed/)
  assert.equal(harness.alertState.get(stateKey).signature, 'execution_p90,evaluation_coverage_rate')
  assert.deepEqual(harness.alertState.get(stateKey).breachedTargetIds, ['execution_p90', 'evaluation_coverage_rate'])

  // Narrowing back to the original set is also a change: alert again, still on the same clock.
  const narrowed = await buildCompanyOperationsReport({ clientId, windowDays: 30 }, harness.options())
  assert.equal(narrowed.ok, true)
  assert.equal(harness.sends.length, 3)
  assert.equal(harness.alertState.get(stateKey).signature, 'evaluation_coverage_rate')

  // ...and the now-current set still dedupes for the rest of the interval.
  const repeated = await buildCompanyOperationsReport({ clientId, windowDays: 30 }, harness.options())
  assert.equal(repeated.ok, true)
  assert.equal(harness.sends.length, 3)
})

test('a throwing alert path can neither alter nor escape the operations report', async () => {
  const clientId = 'client-alert-fail-open-env'
  const harness = alertHarness(clientId)
  // Baseline: the identical report with alerting configured off, so any difference below comes
  // from the alert path rather than from the report inputs.
  const baseline = await buildCompanyOperationsReport({ clientId, windowDays: 30 }, harness.options({ env: {} }))
  assert.equal(baseline.ok, true)
  // 'collecting' rather than 'at_risk': accepted_evaluation_rate has no samples yet. A breach
  // still alerts — the alert reads target states, not the rolled-up readiness word.
  assert.equal(baseline.readiness, 'collecting')
  assert.equal(baseline.targets.some((target) => target.state === 'missed'), true)

  // Reading the alert env throws. That happens before the alert routine's own guards, so only the
  // fail-open wrapper around the alert call in buildCompanyOperationsReport can contain it.
  const hostileEnv = harness.options()
  Object.defineProperty(hostileEnv, 'env', { get() { throw new Error('alert env unavailable') } })
  const escaped = await buildCompanyOperationsReport({ clientId, windowDays: 30 }, hostileEnv)
  assert.equal(escaped.ok, true)
  assert.deepEqual(escaped, baseline)
  assert.equal(harness.sends.length, 0)
  assert.equal(harness.alertState.size, 0)

  // Every alert dependency down at once — state read, insert, transition, claim, release, and the
  // transport — still returns the same report and still never throws.
  const downClientId = 'client-alert-fail-open-store'
  const down = alertHarness(downClientId)
  const downBaseline = await buildCompanyOperationsReport({ clientId: downClientId, windowDays: 30 }, down.options({ env: {} }))
  assert.equal(downBaseline.ok, true)
  const boom = () => { throw new Error('alert dependency down') }
  const allDown = await buildCompanyOperationsReport({ clientId: downClientId, windowDays: 30 }, down.options({
    getOperationsAlertState: async () => boom(),
    putOperationsAlertState: async () => boom(),
    transitionOperationsAlertState: async () => boom(),
    claimOperationsAlertInit: async () => boom(),
    releaseOperationsAlertInit: async () => boom(),
    fetch: async () => boom(),
  }))
  assert.equal(allDown.ok, true)
  assert.deepEqual(allDown, downBaseline)
  assert.equal(down.sends.length, 0)
})

test('the operations breach alert carries target metadata only and no customer content', async () => {
  const clientId = 'client-alert-metadata-only'
  const harness = contaminatedAlertHarness(clientId)
  const report = await buildCompanyOperationsReport({ clientId, windowDays: 30 }, harness.options())
  assert.equal(report.ok, true)
  // The contaminated orders really did reach the report, so the alert had the chance to leak them.
  assert.equal(report.counts.total, 5)
  assert.equal(JSON.stringify(report).includes(customerMarkers.name), true)
  assert.equal(harness.sends.length, 1)

  const payload = harness.sends[0]
  assert.deepEqual(Object.keys(payload).sort(), ['chat_id', 'disable_web_page_preview', 'text'])
  for (const [field, marker] of Object.entries(customerMarkers)) {
    assert.equal(payload.text.includes(marker), false, `alert leaked customer ${field}`)
  }
  assert.equal(payload.text.includes('company-order:'), false)
  assert.doesNotMatch(payload.text, /model output|anthropic|private|[a-f0-9]{40}/)

  // Whole-message grammar: a metadata header plus one measured-target line each. Nothing else can
  // appear, so free text appended to this message anywhere later fails here.
  const targetsById = new Map(report.targets.map((target) => [target.id, target]))
  const [header, ...details] = payload.text.split('\n')
  assert.match(header, new RegExp(`^SuperMega ops \\| client ${clientId} \\| 30d window \\| ${details.length}/8 operating targets missed$`))
  assert.equal(details.length > 0, true)
  for (const line of details) {
    const parsed = /^- ([a-z0-9_]+): (unmeasured|-?\d+(?:\.\d+)?) vs target (<=|>=) (-?\d+(?:\.\d+)?) \(sample (\d+)\)$/.exec(line)
    assert.notEqual(parsed, null, `alert line is not target metadata: ${line}`)
    const [, id, value, bound, target, sample] = parsed
    const measured = targetsById.get(id)
    assert.notEqual(measured, undefined, `alert named an unknown target: ${id}`)
    assert.equal(measured.state, 'missed')
    assert.equal(value, String(measured.value))
    assert.equal(bound, measured.direction === 'max' ? '<=' : '>=')
    assert.equal(target, String(measured.target))
    assert.equal(sample, String(measured.sample))
  }
})

test('without owner Telegram tokens the alert path performs zero network I/O', async () => {
  const clientId = 'client-alert-zero-io'
  const harness = alertHarness(clientId)
  const unconfigured = harness.options({ env: {} })
  // No injected transport either: the only remaining way out to the network is the global fetch,
  // which this file replaced with a recording stub before any test ran.
  delete unconfigured.fetch
  const callsBefore = globalFetchCalls.length
  const report = await buildCompanyOperationsReport({ clientId, windowDays: 30 }, unconfigured)
  assert.equal(report.ok, true)
  assert.equal(report.readiness, 'collecting')
  assert.equal(report.targets.some((target) => target.state === 'missed'), true)
  assert.equal(globalFetchCalls.length, callsBefore)
  assert.equal(harness.sends.length, 0)
  assert.equal(harness.stateReads, 0)
  assert.equal(harness.alertState.size, 0)
  assert.equal(harness.claims.size, 0)

  // Positive control: the same breach with tokens configured and still no injected transport does
  // reach the global fetch, so the zero-call assertion above is falsifiable rather than vacuous.
  const configuredClientId = 'client-alert-global-transport'
  const configured = alertHarness(configuredClientId)
  const configuredOptions = configured.options()
  delete configuredOptions.fetch
  const sent = await buildCompanyOperationsReport({ clientId: configuredClientId, windowDays: 30 }, configuredOptions)
  assert.equal(sent.ok, true)
  assert.equal(globalFetchCalls.length, callsBefore + 1)
  const [requestUrl, requestInit] = globalFetchCalls[callsBefore]
  const telegramHost = ['api', 'telegram', 'org'].join('.')
  assert.equal(new URL(requestUrl).host, telegramHost)
  assert.equal(new URL(requestUrl).pathname.startsWith(`/bot${'unit-test-token'}/`), true)
  assert.match(JSON.parse(requestInit.body).text, /evaluation_coverage_rate: 0 vs target >= 1/)
})
