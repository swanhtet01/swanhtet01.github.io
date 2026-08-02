import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  COMPANY_CAPACITY_CLAIM_CONTRACT,
  COMPANY_CAPACITY_CLAIM_TTL_SECONDS,
  listCompanyAgents,
  MAX_ACTIVE_COMPANY_ASSIGNMENTS,
  MAX_CYCLE_AGENTS,
  MAX_CYCLE_ROLE_BUDGET,
  MAX_REGISTERED_COMPANY_AGENTS,
  MAX_RUNNING_COMPANY_CYCLES,
  planCompanyCycle,
  runCompanyCycle,
} from './agent-company.mjs'
import { loadCrew } from './crew-runner.mjs'

const cycle = (patch = {}) => ({
  clientId: 'client-acme',
  cycleId: '2026-07-13-am',
  agents: ['operations-analyst'],
  evidence: {
    'operations-analyst': { sales_mmk: 450000, refunds_mmk: 12000 },
  },
  roleBudget: 3,
  ...patch,
})

function durableClaimHarness() {
  const claims = new Map()
  return {
    claims,
    claimActivity: async (row) => {
      if (claims.has(row.id)) return { fresh: false, durable: true }
      claims.set(row.id, { ...row })
      return { fresh: true, durable: true }
    },
    releaseActivityClaim: async (id, expectedRef = undefined) => {
      const current = claims.get(id)
      if (!current || (expectedRef !== undefined && current.ref !== expectedRef)) return false
      claims.delete(id)
      return true
    },
    getActivityClaim: async (id) => ({ claim: claims.get(id) || null, durable: true }),
    transitionActivityClaim: async (id, expectedRef, nextRef) => {
      const current = claims.get(id)
      if (!current || current.ref !== expectedRef) {
        return { updated: false, durable: true, reason: 'claim_transition_conflict' }
      }
      claims.set(id, { ...current, ref: nextRef })
      return { updated: true, durable: true }
    },
  }
}

test('agent roster is fixed, bounded, and backed by validated crews', async () => {
  const roster = listCompanyAgents()
  assert.equal(roster.length, 12)
  assert.equal(MAX_REGISTERED_COMPANY_AGENTS, 12)
  assert.equal(MAX_ACTIVE_COMPANY_ASSIGNMENTS, 1)
  assert.equal(MAX_RUNNING_COMPANY_CYCLES, 1)
  assert.equal(MAX_RUNNING_COMPANY_CYCLES * MAX_CYCLE_AGENTS, MAX_ACTIVE_COMPANY_ASSIGNMENTS)
  assert.equal(COMPANY_CAPACITY_CLAIM_CONTRACT, 'supermega.agent-company-capacity-claims.v1')
  assert.equal(COMPANY_CAPACITY_CLAIM_TTL_SECONDS, 120)
  assert.equal(MAX_CYCLE_AGENTS, 1)
  assert.equal(MAX_CYCLE_ROLE_BUDGET, 8)
  assert.equal(new Set(roster.map((agent) => agent.id)).size, roster.length)
  assert.equal(roster.every((agent) => Array.isArray(agent.capabilityCrews)), true)
  assert.equal(roster.every((agent) => typeof agent.evidenceHint === 'string' && agent.evidenceHint.length > 20), true)
  assert.deepEqual(
    roster.map((agent) => agent.id),
    [
      'operations-analyst',
      'cash-reconciler',
      'receivables-agent',
      'evidence-organizer',
      'proof-builder',
      'sales-qualifier',
      'delivery-planner',
      'quality-reviewer',
      'customer-support-operator',
      'knowledge-manager',
      'project-controller',
      'procurement-analyst',
    ],
  )
  const capabilityCrews = roster.flatMap((agent) => [agent.crew, ...agent.capabilityCrews])
  assert.equal(capabilityCrews.length, 15)
  assert.equal(new Set(capabilityCrews).size, 15)
  for (const crewSlug of capabilityCrews) {
    assert.equal((await loadCrew(crewSlug)).slug, crewSlug, `${crewSlug} remains a validated capability`)
  }
  const plan = await planCompanyCycle(cycle())
  assert.equal(plan.ok, true)
  assert.equal(plan.actionMode, 'draft_only')
  assert.equal(plan.approvalRequired, true)
  assert.equal(plan.budget.plannedRoles, 3)
  assert.equal(plan.budget.roleLimit, 3)
  assert.equal(plan.budget.remainingRoles, 0)
  assert.equal(plan.controls.execution, 'sequential')
  assert.equal(plan.controls.maxConcurrentCycles, 1)
  assert.equal(plan.controls.maxActiveAssignments, 1)
  assert.equal(plan.controls.capacityClaimContract, COMPANY_CAPACITY_CLAIM_CONTRACT)
  assert.equal(plan.controls.capacityClaimTtlSeconds, COMPANY_CAPACITY_CLAIM_TTL_SECONDS)
  assert.equal(plan.controls.dynamicDelegation, false)
  assert.equal(plan.controls.crossAgentContext, false)
  assert.equal(plan.controls.externalWrites, false)
  for (const agent of roster) {
    const single = await planCompanyCycle({
      clientId: 'client-acme',
      cycleId: `contract-${agent.id}`,
      agents: [agent.id],
      evidence: { [agent.id]: `Approved evidence fixture for ${agent.id}.` },
      roleBudget: MAX_CYCLE_ROLE_BUDGET,
    })
    assert.equal(single.ok, true, `${agent.id} is backed by a valid fixed crew`)
    assert.equal(single.budget.roleLimit, single.budget.plannedRoles, `${agent.id} has no unused role authority`)
    assert.equal(single.budget.remainingRoles, 0, `${agent.id} has no executable role headroom`)
  }
})

test('planner uses the caller role budget only as an admission ceiling', async () => {
  const plan = await planCompanyCycle({
    clientId: 'client-acme',
    cycleId: 'exact-role-authority',
    agents: ['operations-analyst'],
    evidence: { 'operations-analyst': 'Approved daily operations evidence.' },
    roleBudget: MAX_CYCLE_ROLE_BUDGET,
  })
  assert.equal(plan.ok, true)
  assert.equal(plan.budget.plannedRoles, 3)
  assert.equal(plan.budget.roleLimit, 3)
  assert.equal(plan.budget.remainingRoles, 0)
})

test('general-use specialists plan one at a time through primary fixed crews', async () => {
  const plan = await planCompanyCycle({
    clientId: 'client-acme',
    cycleId: '2026-07-14-general-work',
    agents: ['customer-support-operator'],
    evidence: { 'customer-support-operator': 'Approved ticket 42, order facts, returns policy, and prior support actions.' },
    roleBudget: 3,
  })
  assert.equal(plan.ok, true)
  assert.deepEqual(plan.assignments.map((assignment) => assignment.crew), ['customer-support-desk'])
  assert.equal(plan.budget.plannedRoles, 3)
  assert.equal(plan.controls.execution, 'sequential')
  assert.equal(plan.controls.dynamicDelegation, false)
  assert.equal(plan.controls.externalWrites, false)
})

test('specialized capabilities are consolidated without registering duplicate agents', async () => {
  const roster = new Map(listCompanyAgents().map((agent) => [agent.id, agent]))
  assert.deepEqual(roster.get('operations-analyst').capabilityCrews, ['data-insights-desk'])
  assert.deepEqual(roster.get('knowledge-manager').capabilityCrews, ['document-processing-desk'])
  assert.deepEqual(roster.get('project-controller').capabilityCrews, ['meeting-actions-desk'])
  for (const removedId of ['data-insights-analyst', 'document-processor', 'meeting-actions-coordinator']) {
    const plan = await planCompanyCycle({
      clientId: 'client-acme',
      cycleId: `removed-${removedId}`,
      agents: [removedId],
      evidence: { [removedId]: `Approved evidence fixture for ${removedId}.` },
      roleBudget: 3,
    })
    assert.equal(plan.reason, 'company_unknown_agent')
  }
})

test('planner rejects dynamic agents, excess roles, unassigned evidence, and action fields', async () => {
  assert.equal((await planCompanyCycle(cycle({ agents: ['invented-agent'] }))).reason, 'company_unknown_agent')
  assert.equal((await planCompanyCycle(cycle({ agents: ['operations-analyst', 'receivables-agent'] }))).reason, 'company_agent_limit_exceeded')
  assert.equal((await planCompanyCycle(cycle({ roleBudget: 2 }))).reason, 'company_role_budget_exceeded')
  assert.equal((await planCompanyCycle(cycle({ evidence: { ...cycle().evidence, hidden: 'data' } }))).reason, 'company_unassigned_evidence')
  assert.equal((await planCompanyCycle({ ...cycle(), execute: true })).reason, 'company_unknown_field')
})

test('runner uses a durable claim and executes one specialist', async () => {
  const calls = []
  let active = 0
  let maxActive = 0
  const result = await runCompanyCycle(cycle(), {
    claimActivity: async () => ({ fresh: true, durable: true }),
    putRunResult: async () => true,
    runCrew: async (slug, intake, options) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      calls.push({ slug, intake, clientId: options.clientId })
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return {
        ok: true,
        output: { slug, evidence_seen: intake },
        usageByRole: [{ role: 'intake', tier: 'bulk' }],
        trace: [{ role: 'intake', tier: 'bulk' }],
        guardrails: {
          version: 1,
          intakeTreatedAsUntrustedData: true,
          handoffsResanitized: true,
          outputFieldsAllowlisted: true,
          externalToolAccess: false,
          externalWrites: false,
          persistentMemory: false,
          maxUntrustedBytes: 16384,
          maxUntrustedChars: 12000,
          maxRoles: 8,
          maxOutputFields: 24,
        },
      }
    },
  })
  assert.equal(result.ok, true)
  assert.equal(result.status, 'completed')
  assert.equal(maxActive, 1)
  assert.deepEqual(calls.map((call) => call.slug), ['daily-operator-brief'])
  assert.equal(calls[0].clientId, 'client-acme')
  assert.match(calls[0].intake, /sales_mmk/)
  assert.equal(result.budget.usedRoleCalls, 1)
  assert.equal(result.persistedAgentResults, 1)
  assert.equal(result.durableResultStored, true)
  assert.equal(result.retry, null)
  assert.deepEqual(result.results[0].guardrails, {
    version: 1,
    intakeTreatedAsUntrustedData: true,
    handoffsResanitized: true,
    outputFieldsAllowlisted: true,
    externalToolAccess: false,
    externalWrites: false,
    persistentMemory: false,
    maxUntrustedBytes: 16384,
    maxUntrustedChars: 12000,
    maxRoles: 8,
    maxOutputFields: 24,
  })
  assert.deepEqual(result.trace[0].guardrails, result.results[0].guardrails)
})

test('runner admits one durable cycle, blocks the second, and releases capacity after failure', async () => {
  const state = durableClaimHarness()
  let started = 0
  let releaseCrews
  let resolveStarted
  const crewsStarted = new Promise((resolve) => { resolveStarted = resolve })
  const crewGate = new Promise((resolve) => { releaseCrews = resolve })
  const inputFor = (index) => cycle({
    cycleId: `capacity-${index}`,
    agents: ['operations-analyst'],
    evidence: { 'operations-analyst': `Approved operations evidence ${index}.` },
    roleBudget: 3,
  })
  const heldCrew = (throws = false) => async () => {
    started += 1
    if (started === MAX_RUNNING_COMPANY_CYCLES) resolveStarted()
    await crewGate
    if (throws) throw new Error('synthetic crew failure')
    return { ok: true, output: { ready: true }, usageByRole: [], trace: [] }
  }
  const admitted = Array.from({ length: MAX_RUNNING_COMPANY_CYCLES }, (_, index) => runCompanyCycle(inputFor(index + 1), {
    ...state,
    putRunResult: async () => true,
    runCrew: heldCrew(index === MAX_RUNNING_COMPANY_CYCLES - 1),
  }))
  await Promise.race([
    crewsStarted,
    new Promise((_, reject) => setTimeout(() => reject(new Error('capacity probe did not admit bounded cycles')), 1_000)),
  ])

  const overflowInput = inputFor(MAX_RUNNING_COMPANY_CYCLES + 1)
  const overflow = await runCompanyCycle(overflowInput, {
    ...state,
    putRunResult: async () => true,
    runCrew: async () => { throw new Error('overflow cycle must not execute') },
  })
  assert.equal(overflow.reason, 'company_capacity_exhausted')
  assert.equal(overflow.status, 'busy')
  assert.equal(overflow.maxRunning, MAX_RUNNING_COMPANY_CYCLES)
  assert.equal(started, MAX_RUNNING_COMPANY_CYCLES)
  assert.equal([...state.claims.keys()].filter((id) => id.startsWith('agent-company-capacity:')).length, MAX_RUNNING_COMPANY_CYCLES)

  releaseCrews()
  const completed = await Promise.all(admitted)
  assert.deepEqual(completed.map((result) => result.status), ['failed'])
  assert.equal([...state.claims.keys()].filter((id) => id.startsWith('agent-company-capacity:')).length, 0)

  const retried = await runCompanyCycle(overflowInput, {
    ...state,
    putRunResult: async () => true,
    runCrew: async () => ({ ok: true, output: { ready: true }, usageByRole: [], trace: [] }),
  })
  assert.equal(retried.status, 'completed')
  assert.equal(retried.capacity.contract, COMPANY_CAPACITY_CLAIM_CONTRACT)
  assert.equal(retried.capacity.claimTtlSeconds, COMPANY_CAPACITY_CLAIM_TTL_SECONDS)
  assert.equal([...state.claims.keys()].filter((id) => id.startsWith('agent-company-capacity:')).length, 0)
})

test('expired capacity is atomically reassigned and an old owner cannot release the new lease', async () => {
  const state = durableClaimHarness()
  const staleOwner = `agent-company:${'a'.repeat(40)}|1000000000000`
  state.claims.set('agent-company-capacity:1', {
    id: 'agent-company-capacity:1',
    kind: 'agent_company_capacity',
    summary: 'stale slot',
    ref: staleOwner,
  })
  for (let slot = 2; slot <= MAX_RUNNING_COMPANY_CYCLES; slot++) {
    state.claims.set(`agent-company-capacity:${slot}`, {
      id: `agent-company-capacity:${slot}`,
      kind: 'agent_company_capacity',
      summary: 'active slot',
      ref: `agent-company:${String(slot).repeat(40)}|2000000000000`,
    })
  }
  let releaseRecovered
  let started
  const crewStarted = new Promise((resolve) => { started = resolve })
  const crewGate = new Promise((resolve) => { releaseRecovered = resolve })
  const run = runCompanyCycle(cycle({
    cycleId: 'recover-expired-capacity',
    agents: ['operations-analyst'],
    evidence: { 'operations-analyst': 'Approved recovery evidence.' },
    roleBudget: 3,
  }), {
    ...state,
    capacityNowMs: () => 1_500_000_000_000,
    putRunResult: async () => true,
    runCrew: async () => {
      started()
      await crewGate
      return { ok: true, output: { recovered: true }, usageByRole: [], trace: [] }
    },
  })
  await crewStarted
  const recoveredRef = state.claims.get('agent-company-capacity:1').ref
  assert.notEqual(recoveredRef, staleOwner)
  assert.equal(await state.releaseActivityClaim('agent-company-capacity:1', staleOwner), false)
  assert.equal(state.claims.get('agent-company-capacity:1').ref, recoveredRef)
  releaseRecovered()
  assert.equal((await run).status, 'completed')
  assert.equal(state.claims.has('agent-company-capacity:1'), false)
})

test('runner preserves a failed specialist result without another dispatch', async () => {
  const intakes = []
  const result = await runCompanyCycle(cycle(), {
    claimActivity: async () => ({ fresh: true, durable: true }),
    putRunResult: async () => true,
    runCrew: async (slug, intake) => {
      intakes.push(intake)
      return { ok: false, reason: 'crew_role_failed', role: 'ranker' }
    },
  })
  assert.equal(result.ok, false)
  assert.equal(result.status, 'failed')
  assert.deepEqual(result.results.map((item) => item.status), ['failed'])
  assert.equal(intakes.length, 1)
  assert.deepEqual(result.retry, { requiresNewCycleId: true })
})

test('company budget admission failures are blocked, durable, and replay without another crew run', async () => {
  for (const reason of ['crew_company_budget_exhausted', 'crew_company_budget_unavailable']) {
    const claims = durableClaimHarness()
    const records = new Map()
    let runs = 0
    const input = cycle({
      cycleId: `budget-block-${reason}`,
      agents: ['operations-analyst'],
      evidence: { 'operations-analyst': 'Approved daily operating evidence.' },
      roleBudget: 3,
    })
    const options = {
      ...claims,
      getRunResult: async (key) => records.get(key) || null,
      putRunResult: async (key, payload) => { records.set(key, structuredClone(payload)); return true },
      runCrew: async () => { runs += 1; return { ok: false, reason, role: 'ranker', usageByRole: [], trace: [] } },
    }
    const result = await runCompanyCycle(input, options)
    assert.equal(result.ok, false)
    assert.equal(result.status, 'blocked')
    assert.equal(result.results[0].status, 'blocked')
    assert.equal(result.results[0].reason, reason)
    assert.equal(result.budget.usedRoleCalls, 0)
    assert.deepEqual(result.retry, { requiresNewCycleId: true })
    assert.equal(result.durableResultStored, true)
    assert.equal([...claims.claims.keys()].some((id) => id.startsWith('agent-company-capacity:')), false)

    const replay = await runCompanyCycle(input, options)
    assert.equal(replay.replayed, true)
    assert.equal(replay.status, 'blocked')
    assert.equal(runs, 1, 'the same blocked cycle never calls a crew twice')
  }
})

test('a shared company budget block stops the one specialist without another crew attempt', async () => {
  for (const reason of ['crew_company_budget_exhausted', 'crew_company_budget_unavailable']) {
    const claims = durableClaimHarness()
    const records = new Map()
    const calls = []
    const input = cycle({ cycleId: `shared-budget-stop-${reason}` })
    const options = {
      ...claims,
      getRunResult: async (key) => records.get(key) || null,
      putRunResult: async (key, payload) => { records.set(key, structuredClone(payload)); return true },
      runCrew: async (slug) => {
        calls.push(slug)
        return { ok: false, reason, role: 'ranker', usageByRole: [], trace: [] }
      },
    }

    const result = await runCompanyCycle(input, options)
    assert.equal(result.ok, false)
    assert.equal(result.status, 'blocked')
    assert.deepEqual(calls, ['daily-operator-brief'])
    assert.deepEqual(result.results.map((item) => item.status), ['blocked'])
    assert.equal(result.budget.usedRoleCalls, 0)
    assert.equal(result.persistedAgentResults, 1)
    assert.equal(result.durableResultStored, true)

    const replay = await runCompanyCycle(input, options)
    assert.equal(replay.replayed, true)
    assert.equal(replay.status, 'blocked')
    assert.deepEqual(calls, ['daily-operator-brief'])
  }
})

test('runner fails closed without durable idempotency and releases only the unused claim', async () => {
  let released = ''
  let runs = 0
  const result = await runCompanyCycle(cycle(), {
    claimActivity: async () => ({ fresh: true, durable: false }),
    releaseActivityClaim: async (id) => { released = id; return true },
    runCrew: async () => { runs += 1; return { ok: true, output: {} } },
  })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'company_durable_claim_required')
  assert.match(released, /^agent-company:/)
  assert.equal(runs, 0)
})

test('duplicate cycle ids never spend twice', async () => {
  let runs = 0
  const result = await runCompanyCycle(cycle(), {
    claimActivity: async () => ({ fresh: false, durable: true }),
    getRunResult: async () => null,
    runCrew: async () => { runs += 1; return { ok: true, output: {} } },
  })
  assert.equal(result.reason, 'company_cycle_already_claimed')
  assert.equal(result.status, 'duplicate')
  assert.equal(runs, 0)
})

test('duplicate delivery replays a durable final envelope without another model call', async () => {
  let runs = 0
  const result = await runCompanyCycle(cycle({ cycleId: 'stored-cycle' }), {
    claimActivity: async () => ({ fresh: false, durable: true }),
    getRunResult: async (key) => key.endsWith(':final') ? {
      ok: true,
      mode: 'run',
      status: 'completed',
      runId: key.slice('company-cycle:'.length, -':final'.length),
      clientId: 'client-acme',
      cycleId: 'stored-cycle',
      results: [{ agentId: 'operations-analyst', status: 'completed' }],
    } : null,
    runCrew: async () => { runs += 1; return { ok: true, output: {} } },
  })
  assert.equal(result.ok, true)
  assert.equal(result.replayed, true)
  assert.equal(result.durableResultStored, true)
  assert.equal(runs, 0)
})
