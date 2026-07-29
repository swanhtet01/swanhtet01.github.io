import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAllyCeoCompanyPlan } from './ally-ceo-company-plan.mjs'

const now = `# Now

## North-star outcome
One accountable workflow reaches a measured result.

## Portfolio correction
Shop, Plant, Website, and Ecommerce are the only customer products.

## Verified baseline
All four local release candidates pass their current gates.

## Blockers
- Managed tenant proof is missing.

## Next evidence
1. Prove one isolated tenant.
`

const workboard = `# Workboard

## Execution order
1. Keep the four products stable.
2. Prove managed isolation before writes.
`

function portfolio(overrides = {}) {
  return JSON.stringify({
    schemaVersion: 'supermega.hq.portfolio.v3',
    northStar: 'One real workflow reaches a measurable outcome through an accountable operating record.',
    agentOperatingModel: {
      mode: 'bounded-demand-driven',
      registeredRoleLimit: 12,
      activeAssignmentLimit: 4,
      maxAgentsPerCycle: 2,
      maxConcurrentCompanyCycles: 2,
      scaleToZero: true,
      idleCapabilitiesConsumeCompute: false,
      dynamicDelegation: false,
      recursiveDelegation: false,
      consequentialAuthority: 'founder',
      ...overrides,
    },
    products: ['shop', 'plant', 'website', 'ecommerce'].map((id) => ({
      id,
      status: 'release-candidate-local',
      nextGate: `Prove ${id} with one named operator.`,
    })),
  })
}

test('CEO planning selects one scale-to-zero specialist with deterministic control and zero planning side effects', async () => {
  const result = await buildAllyCeoCompanyPlan({
    now: '2026-07-29T00:00:00.000Z',
    hqNow: now,
    workboard,
    portfolioText: portfolio(),
  })

  assert.equal(result.ok, true)
  assert.equal(result.outcomeId, 'daily-company-control')
  assert.deepEqual(result.manifest.agents, ['operations-analyst'])
  assert.equal(result.manifest.cycleId, 'ally-ceo-20260729-daily-company-control')
  assert.equal(result.manifest.roleBudget, result.plan.budget.plannedRoles)
  assert.equal(result.plan.budget.remainingRoles, 0)
  assert.equal(result.plan.controls.maxActiveAssignments, 4)
  assert.equal(result.plan.controls.maxConcurrentCycles, 2)
  assert.equal(result.plan.controls.execution, 'sequential')
  assert.equal(result.plan.controls.externalWrites, false)
  assert.equal(result.controls.planningModelCalls, 0)
  assert.equal(result.controls.planningConnectorRequests, 0)
  assert.equal(result.controls.maxConcurrentAllyRuns, 1)
  assert.equal(result.controls.maxAgents, 1)
  assert.equal(result.controls.scaleToZero, true)
  assert.equal(result.experiment.contract, 'supermega.ally-ceo-cycle-experiment.v1')
  assert.equal(result.experiment.outcomeId, result.outcomeId)
  assert.equal(result.experiment.treatment.specialists, 1)
  assert.equal(result.experiment.treatment.agentId, 'operations-analyst')
  assert.equal(result.experiment.treatment.maxRuns, 1)
  assert.equal(result.experiment.primaryMetric, 'accepted_outcomes_per_1000_work_units')
  assert.equal(result.experiment.controls.automaticExecution, false)
  assert.equal(result.experiment.controls.automaticPromotion, false)
  assert.equal(result.experiment.controls.modelCalls, 0)
  assert.equal(result.experiment.controls.connectorRequests, 0)
  assert.equal(result.experiment.controls.externalWrites, false)
  assert.match(result.experiment.experimentDigest, /^sha256:[a-f0-9]{64}$/)
  assert.equal(result.preflight.expectedRunId, result.plan.runId)
  assert.equal(result.preflight.controls.planOnlyDefault, true)
  assert.equal(JSON.stringify(result.manifest).includes('instagram.com'), false)
})

test('completed outcomes rotate through all five fixed teams and then stop', async () => {
  const sequence = [
    ['daily-company-control', ['operations-analyst']],
    ['engineering-release-control', ['proof-builder']],
    ['product-portfolio-control', ['operations-analyst']],
    ['growth-pipeline-control', ['sales-qualifier']],
    ['finance-risk-control', ['cash-reconciler']],
  ]
  const completedOutcomeIds = []
  for (const [outcomeId, agents] of sequence) {
    const result = await buildAllyCeoCompanyPlan({
      now: '2026-07-29T12:00:00.000Z',
      hqNow: now,
      workboard,
      portfolioText: portfolio(),
      completedOutcomeIds,
    })
    assert.equal(result.outcomeId, outcomeId)
    assert.deepEqual(result.manifest.agents, agents)
    assert.equal(result.plan.controls.dynamicDelegation, false)
    assert.equal(result.plan.controls.crossAgentContext, false)
    assert.equal(result.experiment.treatment.agentId, agents[0])
    assert.equal(result.experiment.successMeasureDigest, result.successMeasureDigest)
    completedOutcomeIds.push(outcomeId)
  }
  const declined = await buildAllyCeoCompanyPlan({
    now: '2026-07-29T12:00:00.000Z',
    hqNow: now,
    workboard,
    portfolioText: portfolio(),
    completedOutcomeIds,
  })
  assert.equal(declined.declined, true)
  assert.equal(declined.manifest, null)
})

test('capacity drift and non-authoritative social evidence fail before a work order exists', async () => {
  await assert.rejects(
    buildAllyCeoCompanyPlan({ now: '2026-07-29T00:00:00.000Z', hqNow: now, workboard, portfolioText: portfolio({ registeredRoleLimit: 175 }) }),
    /ally_ceo_company_plan_capacity_invalid/,
  )
  await assert.rejects(
    buildAllyCeoCompanyPlan({
      now: '2026-07-29T00:00:00.000Z',
      hqNow: now.replace('Managed tenant proof is missing.', 'See https://www.instagram.com/p/unverified for proof.'),
      workboard,
      portfolioText: portfolio(),
    }),
    /ally_ceo_company_plan_non_authoritative_source/,
  )
  await assert.rejects(
    buildAllyCeoCompanyPlan({
      now: '2026-07-29T00:00:00.000Z',
      hqNow: now.replace('Managed tenant proof is missing.', 'Temporary value sk-proj-1234567890abcdefghijkl must never enter evidence.'),
      workboard,
      portfolioText: portfolio(),
    }),
    /ally_ceo_company_plan_sensitive_evidence/,
  )
})
