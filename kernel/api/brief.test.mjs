import { test } from 'node:test'
import assert from 'node:assert/strict'

import { runScheduledBrief } from './brief.mjs'
import { loadCeoOutcomeCycleState, recordCeoOutcomeCompletion } from '../agent-company-operations.mjs'
import { SUPERMEGA_HQ_AUTHORITY } from '../supermega-hq-authority.mjs'
import { executionClaimId } from '../workcell-run.mjs'

const NOW = new Date('2026-07-13T01:30:00.000Z')

function emptyCycleState(input, completedOutcomeIds = []) {
  return {
    ok: true,
    contract: 'supermega.ceo-outcome-cycle-state.v1',
    durable: true,
    clientId: input.clientId,
    authorityDigest: input.authorityDigest,
    cycleId: '2026-07-13',
    startsAt: '2026-07-13T00:00:00.000Z',
    endsAt: '2026-07-20T00:00:00.000Z',
    completedOutcomeIds,
    completedCount: completedOutcomeIds.length,
    matchedRecords: completedOutcomeIds.length,
  }
}

const CEO_USAGE = Object.freeze({
  contract: 'supermega.operator-usage.v1',
  units: 'bulk_equivalent_tokens',
  modelCalls: 1,
  cacheHits: 0,
  measuredCalls: 1,
  unmeasuredCalls: 0,
  weightedTotalUnits: 45,
})

async function makeCeoOutcomeRecord({ outcomeId, authorityDigest, completedAt }) {
  let saved = null
  const result = await recordCeoOutcomeCompletion({
    clientId: 'client-acme',
    outcomeId,
    authorityDigest,
    completedAt,
    usage: CEO_USAGE,
  }, {
    claimActivity: async () => ({ fresh: true, durable: true }),
    putCeoOutcomeRecord: async (key, payload) => { saved = { key, payload }; return true },
  })
  assert.equal(result.ok, true)
  return saved
}

function workcell(slug) {
  return {
    ok: true,
    slug,
    name: slug,
    clientName: 'Acme',
    localDate: '2026-07-13',
    timeZone: 'Asia/Yangon',
    sources: [{ tool: 'read', items: 1 }],
    output: { headline: 'Ready', metrics: [], priorities: [], exceptions: [], owner_action: 'Act' },
  }
}

function durableClaimStore(prefix) {
  const claims = new Set()
  return {
    claim: async (slug) => {
      const claimId = `${prefix}:${slug}`
      if (claims.has(claimId)) return { fresh: false, durable: true, claimId }
      claims.add(claimId)
      return { fresh: true, durable: true, claimId }
    },
    release: async (claim) => claims.delete(claim?.claimId),
  }
}

test('scheduled workcells deliver once and duplicate events do not resend', async () => {
  const sent = []
  const executions = durableClaimStore('execution')
  const deliveries = durableClaimStore('delivery')
  let runs = 0
  const options = {
    env: { SUPERMEGA_WORKCELL_SLUGS: 'cash-close,owner-command', WORKCELL_CLIENT_NAME: 'Acme' },
    now: NOW,
    runWorkcell: async (slug) => { runs += 1; return workcell(slug) },
    claimWorkcellExecution: executions.claim,
    claimWorkcellDelivery: deliveries.claim,
    releaseWorkcellDelivery: async (claim) => (await executions.release(claim)) || deliveries.release(claim),
    notify: async (message) => { sent.push(message); return true },
  }
  const first = await runScheduledBrief(options)
  assert.equal(first.ok, true)
  assert.equal(sent.length, 2)
  const duplicate = await runScheduledBrief(options)
  assert.equal(duplicate.ok, true)
  assert.equal(duplicate.results.every((item) => item.duplicate), true)
  assert.equal(sent.length, 2)
  assert.equal(runs, 2)
  assert.equal((sent[0].match(/Owner action:/g) || []).length, 1)
})

test('execution admission is stable only within one client, workcell, and UTC hour', () => {
  const config = { clientId: 'acme', localDate: '2026-07-13' }
  const first = executionClaimId('cash-close', config, new Date('2026-07-13T01:05:00.000Z'))
  assert.equal(first, executionClaimId('cash-close', config, new Date('2026-07-13T01:59:59.999Z')))
  assert.notEqual(first, executionClaimId('cash-close', config, new Date('2026-07-13T02:00:00.000Z')))
  assert.notEqual(first, executionClaimId('owner-command', config, new Date('2026-07-13T01:05:00.000Z')))
  assert.notEqual(first, executionClaimId('cash-close', { ...config, clientId: 'other' }, new Date('2026-07-13T01:05:00.000Z')))
})

test('scheduled delivery refuses to send without a durable idempotency claim', async () => {
  let sends = 0
  let runs = 0
  const result = await runScheduledBrief({
    env: { SUPERMEGA_WORKCELL_SLUG: 'cash-close' },
    now: NOW,
    runWorkcell: async (slug) => { runs += 1; return workcell(slug) },
    claimWorkcellExecution: async () => ({ fresh: true, durable: false }),
    claimWorkcellDelivery: async () => ({ fresh: true, durable: true }),
    notify: async () => { sends += 1; return true },
  })
  assert.equal(result.ok, false)
  assert.equal(result.results[0].reason, 'durable_execution_claim_unavailable')
  assert.equal(sends, 0)
  assert.equal(runs, 0)
})

test('execution claim storage errors fail closed before work begins', async () => {
  let runs = 0
  let sends = 0
  const result = await runScheduledBrief({
    env: { SUPERMEGA_WORKCELL_SLUG: 'cash-close' },
    now: NOW,
    runWorkcell: async (slug) => { runs += 1; return workcell(slug) },
    claimWorkcellExecution: async () => { throw new Error('private storage detail') },
    notify: async () => { sends += 1; return true },
  })
  assert.equal(result.ok, false)
  assert.equal(result.results[0].reason, 'durable_execution_claim_unavailable')
  assert.equal(runs, 0)
  assert.equal(sends, 0)
  assert.doesNotMatch(JSON.stringify(result), /private storage detail/)
})

test('concurrent cron deliveries claim before running expensive work', async () => {
  let claimed = false
  let runs = 0
  let sends = 0
  const options = {
    env: { SUPERMEGA_WORKCELL_SLUG: 'cash-close' },
    now: NOW,
    runWorkcell: async (slug) => { runs += 1; await new Promise((resolve) => setTimeout(resolve, 5)); return workcell(slug) },
    claimWorkcellExecution: async () => claimed
      ? { fresh: false, durable: true, claimId: 'workcell:test' }
      : (claimed = true, { fresh: true, durable: true, claimId: 'workcell:test' }),
    claimWorkcellDelivery: async () => ({ fresh: true, durable: true, claimId: 'delivery:test' }),
    notify: async () => { sends += 1; return true },
  }
  const results = await Promise.all([runScheduledBrief(options), runScheduledBrief(options)])
  assert.equal(results.every((result) => result.ok), true)
  assert.equal(results.some((result) => result.results[0].duplicate), true)
  assert.equal(runs, 1)
  assert.equal(sends, 1)
})

test('a failed owner send releases its claim so a manual retry can deliver', async () => {
  const executions = durableClaimStore('execution')
  const deliveries = durableClaimStore('delivery')
  let attempts = 0
  let releases = 0
  const options = {
    env: { SUPERMEGA_WORKCELL_SLUG: 'cash-close' },
    now: NOW,
    runWorkcell: async (slug) => workcell(slug),
    claimWorkcellExecution: executions.claim,
    claimWorkcellDelivery: deliveries.claim,
    releaseWorkcellDelivery: async (claim) => {
      releases += 1
      return (await executions.release(claim)) || deliveries.release(claim)
    },
    notify: async () => { attempts += 1; return attempts > 1 },
  }
  const failed = await runScheduledBrief(options)
  assert.equal(failed.ok, false)
  assert.equal(failed.results[0].reason, 'owner_delivery_failed')
  assert.equal(failed.results[0].retryable, true)
  assert.equal(releases, 2)
  const retried = await runScheduledBrief(options)
  assert.equal(retried.ok, true)
  assert.equal(retried.results[0].sent, true)
  assert.equal(attempts, 2)
})

test('failed computation releases only the execution claim for an immediate retry', async () => {
  const executions = durableClaimStore('execution')
  const deliveries = durableClaimStore('delivery')
  let runs = 0
  let sends = 0
  const options = {
    env: { SUPERMEGA_WORKCELL_SLUG: 'cash-close' },
    now: NOW,
    runWorkcell: async (slug) => {
      runs += 1
      return runs === 1 ? { ok: false, slug, reason: 'workcell_source_failed' } : workcell(slug)
    },
    claimWorkcellExecution: executions.claim,
    claimWorkcellDelivery: deliveries.claim,
    releaseWorkcellDelivery: async (claim) => (await executions.release(claim)) || deliveries.release(claim),
    notify: async () => { sends += 1; return true },
  }
  const failed = await runScheduledBrief(options)
  assert.equal(failed.ok, false)
  assert.equal(failed.results[0].retryable, true)
  const retried = await runScheduledBrief(options)
  assert.equal(retried.ok, true)
  assert.equal(runs, 2)
  assert.equal(sends, 1)
})

test('legacy CEO brief remains available and is also duplicate-safe', async () => {
  let sends = 0
  let runs = 0
  const result = await runScheduledBrief({
    env: {},
    now: NOW,
    runOperator: async () => { runs += 1; return { ok: true, answer: 'Real numbers', results: [{ tool: 'platform_status' }] } },
    claimWorkcellExecution: async () => ({ fresh: false, durable: true }),
    claimWorkcellDelivery: async () => ({ fresh: false, durable: true }),
    notify: async () => { sends += 1; return true },
  })
  assert.equal(result.ok, true)
  assert.equal(result.mode, 'legacy')
  assert.equal(result.companyMode, 'supermega_hq')
  assert.equal(result.duplicate, true)
  assert.equal(result.declined, true)
  assert.equal(result.reason, 'ceo_outcome_duplicate')
  assert.equal(result.outcome.id, 'daily-company-control')
  assert.equal(sends, 0)
  assert.equal(runs, 0)
})

test('SuperMega CEO cycle selects one HQ outcome and uses its fixed evidence plan', async () => {
  const executions = durableClaimStore('execution')
  const deliveries = durableClaimStore('delivery')
  const operatorInputs = []
  const sent = []
  const recorded = []
  const result = await runScheduledBrief({
    env: { SUPERMEGA_CLIENT_ID: 'client-acme' },
    now: NOW,
    loadCeoOutcomeCycleState: async (input) => emptyCycleState(input),
    runOperator: async (input) => {
      operatorInputs.push(input)
      return {
        ok: true,
        planningMode: 'hq_authority_fixed',
        answer: 'One decision',
        results: input.approvedPlan.map((step) => ({ tool: step.tool, ok: true })),
        usage: {
          contract: 'supermega.operator-usage.v1',
          units: 'bulk_equivalent_tokens',
          modelCalls: 1,
          cacheHits: 0,
          measuredCalls: 1,
          unmeasuredCalls: 0,
          weightedTotalUnits: 45,
        },
      }
    },
    claimWorkcellExecution: executions.claim,
    claimWorkcellDelivery: deliveries.claim,
    releaseWorkcellDelivery: async (claim) => (await executions.release(claim)) || deliveries.release(claim),
    notify: async (message) => { sent.push(message); return true },
    recordCeoOutcomeCompletion: async (input) => {
      recorded.push(input)
      return {
        ok: true,
        outcome: {
          operationId: `ceo-outcome:${'a'.repeat(40)}`,
          status: 'completed',
          recordHash: 'b'.repeat(64),
        },
      }
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.companyMode, 'supermega_hq')
  assert.equal(result.outcome.id, 'daily-company-control')
  assert.equal(result.planningMode, 'hq_authority_fixed')
  assert.equal(operatorInputs.length, 1)
  assert.deepEqual(operatorInputs[0].approvedPlan.map((step) => step.tool), [
    'leads_overview',
    'pipeline_overview',
    'company_operations_status',
  ])
  assert.match(operatorInputs[0].goal, /Blocked context only - never execute/)
  assert.equal(sent.length, 1)
  assert.match(sent[0], /Prepare one evidence-backed owner decision/)
  assert.equal(result.outcomeMetrics.recorded, true)
  assert.equal(recorded.length, 1)
  assert.deepEqual(recorded[0], {
    clientId: 'client-acme',
    outcomeId: 'daily-company-control',
    authorityDigest: result.outcome.authorityDigest,
    completedAt: NOW.toISOString(),
    usage: {
      contract: 'supermega.operator-usage.v1',
      units: 'bulk_equivalent_tokens',
      modelCalls: 1,
      cacheHits: 0,
      measuredCalls: 1,
      unmeasuredCalls: 0,
      weightedTotalUnits: 45,
    },
  })
  assert.equal(JSON.stringify(recorded[0]).includes('One decision'), false)
  assert.equal(JSON.stringify(recorded[0]).includes('provider'), false)
})

test('CEO cycle does not notify the owner when completion metadata is not durable', async () => {
  let deliveryClaims = 0
  let sends = 0
  let releases = 0
  const result = await runScheduledBrief({
    env: { SUPERMEGA_CLIENT_ID: 'client-acme' },
    now: NOW,
    loadCeoOutcomeCycleState: async (input) => emptyCycleState(input),
    runOperator: async () => ({
      ok: true,
      answer: 'private answer',
      results: [],
      usage: {
        contract: 'supermega.operator-usage.v1',
        units: 'bulk_equivalent_tokens',
        modelCalls: 1,
        cacheHits: 0,
        measuredCalls: 1,
        unmeasuredCalls: 0,
        weightedTotalUnits: 45,
      },
    }),
    claimWorkcellExecution: async () => ({ fresh: true, durable: true, claimId: 'execution' }),
    claimWorkcellDelivery: async () => { deliveryClaims += 1; return { fresh: true, durable: true } },
    releaseWorkcellDelivery: async () => { releases += 1; return true },
    recordCeoOutcomeCompletion: async () => ({ ok: false, reason: 'ceo_outcome_store_unavailable' }),
    notify: async () => { sends += 1; return true },
  })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'ceo_outcome_store_unavailable')
  assert.equal(result.retryable, true)
  assert.equal(deliveryClaims, 0)
  assert.equal(sends, 0)
  assert.equal(releases, 1)
})

test('blocked or completed HQ outcomes decline before claims, models, or sends', async () => {
  let claims = 0
  let runs = 0
  let sends = 0
  const result = await runScheduledBrief({
    env: {},
    now: NOW,
    completedOutcomeIds: SUPERMEGA_HQ_AUTHORITY.outcomes
      .filter((outcome) => outcome.state === 'ready')
      .map((outcome) => outcome.id),
    runOperator: async () => { runs += 1; return { ok: true, answer: 'unused', results: [] } },
    claimWorkcellExecution: async () => { claims += 1; return { fresh: true, durable: true } },
    claimWorkcellDelivery: async () => { claims += 1; return { fresh: true, durable: true } },
    notify: async () => { sends += 1; return true },
  })
  assert.equal(result.ok, true)
  assert.equal(result.declined, true)
  assert.equal(result.reason, 'no_authorized_ceo_outcome')
  assert.equal(result.skipped.filter((item) => item.reason === 'authority_blocked').length, 3)
  assert.equal(claims, 0)
  assert.equal(runs, 0)
  assert.equal(sends, 0)
})

test('durable weekly CEO state rotates departments and exposes metadata only', async () => {
  const initial = SUPERMEGA_HQ_AUTHORITY.outcomes.find((outcome) => outcome.id === 'daily-company-control')
  const authorityProbe = await runScheduledBrief({
    env: {},
    now: NOW,
    completedOutcomeIds: SUPERMEGA_HQ_AUTHORITY.outcomes
      .filter((outcome) => outcome.state === 'ready')
      .map((outcome) => outcome.id),
  })
  const authorityDigest = authorityProbe.authorityDigest
  assert.match(authorityDigest, /^[a-f0-9]{64}$/)

  const current = await makeCeoOutcomeRecord({
    outcomeId: initial.id,
    authorityDigest,
    completedAt: '2026-07-13T00:30:00.000Z',
  })
  const previous = await makeCeoOutcomeRecord({
    outcomeId: 'daily-company-control',
    authorityDigest,
    completedAt: '2026-07-12T23:59:59.000Z',
  })
  const state = await loadCeoOutcomeCycleState({
    clientId: 'client-acme',
    authorityDigest,
    asOf: NOW.toISOString(),
  }, {
    listCeoOutcomeRecords: async () => ({ durable: true, records: [current, previous] }),
  })
  assert.equal(state.ok, true)
  assert.equal(state.cycleId, '2026-07-13')
  assert.deepEqual(state.completedOutcomeIds, ['daily-company-control'])
  assert.equal(JSON.stringify(state).includes('answer'), false)
  assert.equal(JSON.stringify(state).includes('usage'), false)

  let selectedGoal = ''
  const rotated = await runScheduledBrief({
    env: { SUPERMEGA_CLIENT_ID: 'client-acme' },
    now: NOW,
    loadCeoOutcomeCycleState: async () => state,
    runOperator: async (input) => {
      selectedGoal = input.goal
      return { ok: false, reason: 'stop_after_selection' }
    },
    claimWorkcellExecution: async () => ({ fresh: true, durable: true, claimId: 'rotation' }),
    releaseWorkcellDelivery: async () => true,
  })
  assert.equal(rotated.ok, false)
  assert.equal(rotated.outcome.id, 'engineering-release-control')
  assert.match(selectedGoal, /Review engineering and release health/)
  assert.equal(rotated.cycle.cycleId, '2026-07-13')
  assert.equal(rotated.cycle.completedCount, 1)

  const invalid = await loadCeoOutcomeCycleState({
    clientId: 'client-acme',
    authorityDigest,
    asOf: NOW.toISOString(),
  }, {
    listCeoOutcomeRecords: async () => ({
      durable: true,
      records: [{ ...current, payload: { ...current.payload, recordHash: '0'.repeat(64) } }],
    }),
  })
  assert.equal(invalid.reason, 'ceo_outcome_cycle_record_invalid')

  const unavailable = await loadCeoOutcomeCycleState({
    clientId: 'client-acme',
    authorityDigest,
    asOf: NOW.toISOString(),
  }, {
    listCeoOutcomeRecords: async () => ({ durable: false, records: [] }),
  })
  assert.equal(unavailable.reason, 'ceo_outcome_cycle_store_unavailable')

  let work = 0
  const stopped = await runScheduledBrief({
    env: { SUPERMEGA_CLIENT_ID: 'client-acme' },
    now: NOW,
    loadCeoOutcomeCycleState: async () => unavailable,
    runOperator: async () => { work += 1; return { ok: true } },
    claimWorkcellExecution: async () => { work += 1; return { fresh: true, durable: true } },
    notify: async () => { work += 1; return true },
  })
  assert.equal(stopped.reason, 'ceo_outcome_cycle_store_unavailable')
  assert.equal(work, 0)

  const mismatched = await runScheduledBrief({
    env: { SUPERMEGA_CLIENT_ID: 'client-acme' },
    now: NOW,
    loadCeoOutcomeCycleState: async () => ({ ...state, authorityDigest: 'f'.repeat(64) }),
    runOperator: async () => { work += 1; return { ok: true } },
  })
  assert.equal(mismatched.reason, 'ceo_outcome_cycle_state_invalid')
  assert.equal(work, 0)
})

test('invalid HQ authority fails closed before claims, models, or sends', async () => {
  let work = 0
  const result = await runScheduledBrief({
    env: {},
    now: NOW,
    ceoAuthority: {},
    runOperator: async () => { work += 1; return { ok: true } },
    claimWorkcellExecution: async () => { work += 1; return { fresh: true, durable: true } },
    notify: async () => { work += 1; return true },
  })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'ceo_outcome_authority_invalid')
  assert.equal(work, 0)
})
