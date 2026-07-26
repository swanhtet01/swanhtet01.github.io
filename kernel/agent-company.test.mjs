import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  COMPANY_CAPACITY_CLAIM_CONTRACT,
  COMPANY_CAPACITY_CLAIM_TTL_SECONDS,
  listCompanyAgents,
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
  agents: ['operations-analyst', 'receivables-agent'],
  evidence: {
    'operations-analyst': { sales_mmk: 450000, refunds_mmk: 12000 },
    'receivables-agent': 'Invoice INV-7 has 85000 MMK outstanding.',
  },
  roleBudget: 6,
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
  assert.equal(MAX_RUNNING_COMPANY_CYCLES, 4)
  assert.equal(COMPANY_CAPACITY_CLAIM_CONTRACT, 'supermega.agent-company-capacity-claims.v1')
  assert.equal(COMPANY_CAPACITY_CLAIM_TTL_SECONDS, 120)
  assert.equal(MAX_CYCLE_AGENTS, 2)
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
  assert.equal(plan.budget.plannedRoles, 6)
  assert.equal(plan.controls.execution, 'sequential')
  assert.equal(plan.controls.maxConcurrentCycles, 4)
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
  }
})

test('general-use specialists plan through primary fixed crews under the same budget', async () => {
  const plan = await planCompanyCycle({
    clientId: 'client-acme',
    cycleId: '2026-07-14-general-work',
    agents: ['operations-analyst', 'customer-support-operator'],
    evidence: {
      'operations-analyst': 'Approved sales export, field dictionary, January to June, explain repeat purchase decline.',
      'customer-support-operator': 'Approved ticket 42, order facts, returns policy, and prior support actions.',
    },
    roleBudget: 6,
  })
  assert.equal(plan.ok, true)
  assert.deepEqual(plan.assignments.map((assignment) => assignment.crew), ['daily-operator-brief', 'customer-support-desk'])
  assert.equal(plan.budget.plannedRoles, 6)
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
  assert.equal((await planCompanyCycle(cycle({ agents: ['operations-analyst', 'operations-analyst'] }))).reason, 'company_duplicate_agent')
  assert.equal((await planCompanyCycle(cycle({ roleBudget: 5 }))).reason, 'company_role_budget_exceeded')
  assert.equal((await planCompanyCycle(cycle({ evidence: { ...cycle().evidence, hidden: 'data' } }))).reason, 'company_unassigned_evidence')
  assert.equal((await planCompanyCycle({ ...cycle(), execute: true })).reason, 'company_unknown_field')
})

test('runner uses a durable claim, executes serially, and isolates each agent evidence', async () => {
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
  assert.deepEqual(calls.map((call) => call.slug), ['daily-operator-brief', 'chase-the-money'])
  assert.equal(calls[0].clientId, 'client-acme')
  assert.match(calls[0].intake, /sales_mmk/)
  assert.doesNotMatch(calls[0].intake, /INV-7/)
  assert.match(calls[1].intake, /INV-7/)
  assert.doesNotMatch(calls[1].intake, /sales_mmk/)
  assert.equal(result.budget.usedRoleCalls, 2)
  assert.equal(result.persistedAgentResults, 2)
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

test('runner admits four durable cycles, blocks the fifth, and releases capacity on every result', async () => {
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
    new Promise((_, reject) => setTimeout(() => reject(new Error('capacity probe did not admit four cycles')), 1_000)),
  ])

  const fifthInput = inputFor(5)
  const fifth = await runCompanyCycle(fifthInput, {
    ...state,
    putRunResult: async () => true,
    runCrew: async () => { throw new Error('fifth cycle must not execute') },
  })
  assert.equal(fifth.reason, 'company_capacity_exhausted')
  assert.equal(fifth.status, 'busy')
  assert.equal(fifth.maxRunning, MAX_RUNNING_COMPANY_CYCLES)
  assert.equal(started, MAX_RUNNING_COMPANY_CYCLES)
  assert.equal([...state.claims.keys()].filter((id) => id.startsWith('agent-company-capacity:')).length, 4)

  releaseCrews()
  const completed = await Promise.all(admitted)
  assert.deepEqual(completed.map((result) => result.status), ['completed', 'completed', 'completed', 'failed'])
  assert.equal([...state.claims.keys()].filter((id) => id.startsWith('agent-company-capacity:')).length, 0)

  const retried = await runCompanyCycle(fifthInput, {
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

test('runner preserves partial results and never feeds one specialist output to another', async () => {
  const intakes = []
  const result = await runCompanyCycle(cycle(), {
    claimActivity: async () => ({ fresh: true, durable: true }),
    putRunResult: async () => true,
    runCrew: async (slug, intake) => {
      intakes.push(intake)
      if (slug === 'daily-operator-brief') return { ok: false, reason: 'crew_role_failed', role: 'ranker' }
      return { ok: true, output: { reminders: ['draft only'] }, usageByRole: [], trace: [] }
    },
  })
  assert.equal(result.ok, true)
  assert.equal(result.status, 'partial')
  assert.deepEqual(result.results.map((item) => item.status), ['failed', 'completed'])
  assert.equal(intakes.length, 2)
  assert.doesNotMatch(intakes[1], /crew_role_failed|ranker/)
  assert.deepEqual(result.retry, { requiresNewCycleId: true })
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
