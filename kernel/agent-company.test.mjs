import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  listCompanyAgents,
  MAX_CYCLE_AGENTS,
  MAX_CYCLE_ROLE_BUDGET,
  planCompanyCycle,
  runCompanyCycle,
} from './agent-company.mjs'

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

test('agent roster is fixed, bounded, and backed by validated crews', async () => {
  const roster = listCompanyAgents()
  assert.equal(roster.length, 15)
  assert.equal(MAX_CYCLE_AGENTS, 2)
  assert.equal(MAX_CYCLE_ROLE_BUDGET, 8)
  assert.equal(new Set(roster.map((agent) => agent.id)).size, roster.length)
  assert.equal(roster.every((agent) => typeof agent.evidenceHint === 'string' && agent.evidenceHint.length > 20), true)
  assert.deepEqual(
    roster.slice(-7).map((agent) => agent.id),
    [
      'data-insights-analyst',
      'customer-support-operator',
      'knowledge-manager',
      'project-controller',
      'document-processor',
      'meeting-actions-coordinator',
      'procurement-analyst',
    ],
  )
  const plan = await planCompanyCycle(cycle())
  assert.equal(plan.ok, true)
  assert.equal(plan.actionMode, 'draft_only')
  assert.equal(plan.approvalRequired, true)
  assert.equal(plan.budget.plannedRoles, 6)
  assert.equal(plan.controls.execution, 'sequential')
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

test('new general-use specialists plan through fixed validated crews under the same budget', async () => {
  const plan = await planCompanyCycle({
    clientId: 'client-acme',
    cycleId: '2026-07-14-general-work',
    agents: ['data-insights-analyst', 'customer-support-operator'],
    evidence: {
      'data-insights-analyst': 'Approved sales export, field dictionary, January to June, explain repeat purchase decline.',
      'customer-support-operator': 'Approved ticket 42, order facts, returns policy, and prior support actions.',
    },
    roleBudget: 6,
  })
  assert.equal(plan.ok, true)
  assert.deepEqual(plan.assignments.map((assignment) => assignment.crew), ['data-insights-desk', 'customer-support-desk'])
  assert.equal(plan.budget.plannedRoles, 6)
  assert.equal(plan.controls.execution, 'sequential')
  assert.equal(plan.controls.dynamicDelegation, false)
  assert.equal(plan.controls.externalWrites, false)
})

test('document, meeting, and procurement workers remain isolated fixed crews', async () => {
  const cases = [
    ['document-processor', 'document-processing-desk'],
    ['meeting-actions-coordinator', 'meeting-actions-desk'],
    ['procurement-analyst', 'procurement-review-desk'],
  ]
  for (const [agentId, crew] of cases) {
    const plan = await planCompanyCycle({
      clientId: 'client-acme',
      cycleId: `general-${agentId}`,
      agents: [agentId],
      evidence: { [agentId]: `Approved evidence fixture for ${agentId}.` },
      roleBudget: 3,
    })
    assert.equal(plan.ok, true)
    assert.equal(plan.assignments[0].crew, crew)
    assert.equal(plan.assignments[0].roleCount, 3)
    assert.equal(plan.controls.dynamicDelegation, false)
    assert.equal(plan.controls.crossAgentContext, false)
    assert.equal(plan.controls.externalWrites, false)
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
