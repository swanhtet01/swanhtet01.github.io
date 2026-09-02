import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAllyCeoCompanyPlan } from './ally-ceo-company-plan.mjs'
import { buildManagedPilotReadiness, readinessDigest } from './managed-pilot-readiness.mjs'

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

function portfolio(overrides = {}, automationOverrides = {}) {
  const automation = {
    shop: { workOrderId: 'shop-named-pilot', priority: 80, status: 'owner-gated', workOrder: 'Shop: run the named pilot.', reason: 'A named operator is required.' },
    plant: { workOrderId: 'plant-named-pilot', priority: 70, status: 'owner-gated', workOrder: 'Plant: run the named pilot.', reason: 'Operator timing evidence is required.' },
    website: { workOrderId: 'website-named-brief', priority: 60, status: 'owner-gated', workOrder: 'Website: run the named business brief.', reason: 'An accepted business brief is required.' },
    ecommerce: { workOrderId: 'ecommerce-support-case', priority: 100, status: 'ready-local', workOrder: 'Ecommerce: add one order-bound support case.', reason: 'Identity handoff is implemented and support remains local-ready.' },
  }
  return JSON.stringify({
    schemaVersion: 'supermega.hq.portfolio.v3',
    northStar: 'One real workflow reaches a measurable outcome through an accountable operating record.',
    completedLocalAutomations: [],
    agentOperatingModel: {
      mode: 'bounded-demand-driven',
      registeredRoleLimit: 12,
      activeAssignmentLimit: 1,
      maxAgentsPerCycle: 1,
      maxConcurrentCompanyCycles: 1,
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
      localAutomation: { contract: 'supermega.product-work-authority.v2', productId: id, ...automation[id], ...automationOverrides[id] },
    })),
  })
}

function managedReadiness() {
  const sourceReceipts = ['portfolio', 'database', 'storage', 'security', 'storageproof', 'persistenceproof', 'selfserveproof', 'now', 'package', 'kernel']
    .map((path) => ({ path, digest: readinessDigest(path) }))
  return JSON.stringify(buildManagedPilotReadiness({
    portfolio: JSON.parse(portfolio({}, { ecommerce: { status: 'owner-gated' } })),
    databaseEvidence: {
      schemaVersion: 'supermega.hq.database-rehearsal.v2',
      recordedAt: '2026-07-31T10:00:00.000Z',
      checks: {
        ...Object.fromEntries(Array.from({ length: 53 }, (_, index) => [`check${index}`, true])),
        publicBrowserQuarantineEnforced: true,
        publicBrowserQuarantineIdempotent: true,
        restoredPublicBrowserQuarantinePreserved: true,
      },
      storage: { hostedStoragePrivacyProofRequired: true },
      localVerification: { externallyHosted: false },
    },
    storageAudit: 'Status: local verifier ready; hosted proof blocked',
    securityAudit: {
      contract: 'supermega.supabase-security-advisor-audit.v2',
      asOf: '2026-07-31T10:00:00.000Z',
      projectRef: 'abcdefghijklmnopqrst',
      targetClassification: 'protected-production',
      postgres: { major: 17 },
      advisor: { status: 'blocked', findingCount: 27 },
      catalog: { sequenceCount: 2, nonTableRelationCount: 0, publicRoutineCount: 0, browserCallableRoutineCount: 0 },
      managedBackend: { liveSchemaVersion: 7, localTargetVersion: 11, versionDrift: 4, browserRolesDenied: true, metadataRlsEnabled: false, storageBucketCount: 0 },
      conclusion: { productionMutationAuthorized: false, indirectExposureAudited: true, nextAction: 'Rehearse hardening on an isolated target.' },
      controls: { databaseWrites: 0 },
    },
    hqNow: 'Live operating mode: `isolated_demo`\nLive managed persistence ready: `false`\nLive security ready: `false`\nno release drift is present\nNo self-serve pilot tenant',
    packageManifest: { supermega: { productionSupabaseTargetStatus: 'protected-unapproved', productionSupabaseProjectRef: 'abcdefghijklmnopqrst' } },
    sourceReceipts,
  }))
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
  assert.equal(result.productFocus, null)
  assert.deepEqual(result.manifest.agents, ['operations-analyst'])
  assert.equal(result.manifest.cycleId, 'ally-ceo-20260729-daily-company-control')
  assert.equal(result.manifest.roleBudget, result.plan.budget.plannedRoles)
  assert.equal(result.plan.budget.remainingRoles, 0)
  assert.equal(result.plan.controls.maxActiveAssignments, 1)
  assert.equal(result.plan.controls.maxConcurrentCycles, 1)
  assert.equal(result.plan.controls.execution, 'sequential')
  assert.equal(result.plan.controls.externalWrites, false)
  assert.equal(result.controls.planningModelCalls, 0)
  assert.equal(result.controls.planningConnectorRequests, 0)
  assert.equal(result.controls.maxConcurrentAllyRuns, 1)
  assert.equal(result.controls.maxAgents, 1)
  assert.equal(result.controls.scaleToZero, true)
  assert.deepEqual(result.manifest.evidence['operations-analyst'].resourceEnvelope, result.resourceEnvelope)
  assert.deepEqual(result.resourceEnvelope, {
    contract: 'supermega.ally-ceo-resource-envelope.v1',
    registeredRoleRecords: 12,
    selectedAgents: 1,
    maxActiveAssignments: 1,
    maxConcurrentCycles: 1,
    execution: 'sequential',
    providerPolicy: 'local_ollama_or_test_mock',
    maxModelCalls: 3,
    modelContextTokens: 4_096,
    modelOutputTokens: 768,
    modelKeepAlive: '0s',
    cycleTimeoutMs: 480_000,
    loadedModelsBefore: 0,
    loadedModelsAfter: 0,
    connectorRequests: 0,
    externalWrites: false,
    vercelActions: 0,
    hostedSchedulerActions: 0,
    dynamicDelegation: false,
    recursiveDelegation: false,
    scaleToZero: true,
  })
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

test('CEO planning carries compact four-product managed-pilot truth within the evidence cap', async () => {
  const result = await buildAllyCeoCompanyPlan({
    now: '2026-07-31T00:00:00.000Z',
    hqNow: now,
    workboard,
    portfolioText: portfolio(),
    managedReadinessText: managedReadiness(),
  })

  const readiness = result.manifest.evidence['operations-analyst'].portfolio.managedPilotReadiness
  assert.equal(readiness.status, 'blocked')
  assert.equal(readiness.localDatabaseProofReady, true)
  assert.equal(readiness.hostedActivationReady, false)
  assert.deepEqual(readiness.blockingGateIds, ['preview_rehearsal', 'managed_persistence', 'storage_privacy', 'security', 'pilot_evidence', 'production_activation'])
  assert.deepEqual(readiness.products.map(({ productId }) => productId), ['shop', 'plant', 'website', 'ecommerce'])
  assert.equal(result.manifest.evidence['operations-analyst'].sourceReceipts.at(-1).path, 'hq/readiness/managed-pilot-readiness.json')
  assert.ok(result.preflight.totalEvidenceBytes <= 8_192)
})

test('growing Workboard history stays out of active context while current execution order remains bounded', async () => {
  const historicalLedger = `# Workboard\n\n${'historical completed row\n'.repeat(12_000)}\n## Execution order\n1. Keep the four products stable.\n2. Prove managed isolation before writes.\n`
  const result = await buildAllyCeoCompanyPlan({
    now: '2026-07-29T00:00:00.000Z',
    hqNow: now,
    workboard: historicalLedger,
    portfolioText: portfolio(),
  })
  assert.equal(result.ok, true)
  assert.equal(JSON.stringify(result.manifest).includes('historical completed row'), false)
  assert.equal(result.manifest.evidence['operations-analyst'].currentState.length, 5)

  await assert.rejects(
    buildAllyCeoCompanyPlan({
      now: '2026-07-29T00:00:00.000Z',
      hqNow: now,
      workboard: `# Workboard\n${'x'.repeat(512 * 1024)}\n## Execution order\n1. Safe.`,
      portfolioText: portfolio(),
    }),
    /ally_ceo_company_plan_invalid_workboard/,
  )
  await assert.rejects(
    buildAllyCeoCompanyPlan({
      now: '2026-07-29T00:00:00.000Z',
      hqNow: now,
      workboard: `# Workboard\n\n## Execution order\n${'x'.repeat(65 * 1024)}`,
      portfolioText: portfolio(),
    }),
    /ally_ceo_company_plan_hq_section_empty/,
  )
})

test('completed automation history is receipt-bound instead of copied into every agent context', async () => {
  const largePortfolio = JSON.parse(portfolio())
  largePortfolio.completedLocalAutomations = Array.from({ length: 180 }, (_, index) => ({
    productId: 'ecommerce',
    workOrderId: `ecommerce-completed-${String(index).padStart(3, '0')}`,
    checkpoint: `ENG-${String(index).padStart(3, '0')}`,
  }))
  const result = await buildAllyCeoCompanyPlan({
    now: '2026-07-29T12:00:00.000Z',
    hqNow: now,
    workboard,
    portfolioText: JSON.stringify(largePortfolio),
    completedOutcomeIds: ['daily-company-control'],
  })
  const evidence = result.manifest.evidence['proof-builder']

  assert.equal(result.outcomeId, 'engineering-release-control')
  assert.equal(evidence.portfolio.completedLocalAutomationSummary.count, 180)
  assert.match(evidence.portfolio.completedLocalAutomationSummary.digest, /^sha256:[a-f0-9]{64}$/)
  assert.equal(JSON.stringify(evidence).includes('ecommerce-completed-000'), false)
  assert.ok(Buffer.byteLength(JSON.stringify(evidence), 'utf8') <= 8_192)
})

test('completed outcomes rotate through all five fixed teams and then stop', async () => {
  const sequence = [
    ['daily-company-control', ['operations-analyst']],
    ['engineering-release-control', ['proof-builder']],
    ['product-portfolio-control', ['delivery-planner']],
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

test('product control selects the highest-priority ready local work order without adding agents', async () => {
  for (let offset = 0; offset < 4; offset += 1) {
    const result = await buildAllyCeoCompanyPlan({
      now: new Date(Date.parse('2026-07-29T12:00:00.000Z') + offset * 86_400_000),
      hqNow: now,
      workboard,
      portfolioText: portfolio(),
      completedOutcomeIds: ['daily-company-control', 'engineering-release-control'],
    })
    assert.equal(result.outcomeId, 'product-portfolio-control')
    assert.deepEqual(result.manifest.agents, ['delivery-planner'])
    assert.equal(result.productFocus.contract, 'supermega.ally-ceo-product-focus.v3')
    assert.equal(result.productFocus.selection, 'portfolio_priority_ready')
    assert.equal(result.productFocus.productId, 'ecommerce')
    assert.equal(result.productFocus.localPriority, 100)
    assert.equal(result.productFocus.workOrderId, 'ecommerce-support-case')
    assert.equal(result.productFocus.workOrder, 'Ecommerce: add one order-bound support case.')
    assert.equal(result.productFocus.readyCandidateCount, 1)
    assert.equal(result.productFocus.acceptanceDimensions.length, 8)
    assert.deepEqual(result.manifest.evidence['delivery-planner'].productFocus, result.productFocus)
    assert.equal(result.controls.maxAgents, 1)
    assert.equal(result.controls.scaleToZero, true)
  }
})

test('product control skips gated priorities and records fully gated automation without work', async () => {
  const selected = await buildAllyCeoCompanyPlan({
    now: '2026-07-29T12:00:00.000Z',
    hqNow: now,
    workboard,
    portfolioText: portfolio({}, {
      shop: { priority: 100, status: 'owner-gated' },
      plant: { priority: 90, status: 'ready-local' },
      ecommerce: { priority: 80, status: 'ready-local' },
    }),
    completedOutcomeIds: ['daily-company-control', 'engineering-release-control'],
  })
  assert.equal(selected.productFocus.productId, 'plant')
  assert.equal(selected.productFocus.readyCandidateCount, 2)

  await assert.rejects(
    buildAllyCeoCompanyPlan({
      now: '2026-07-29T12:00:00.000Z',
      hqNow: now,
      workboard,
      portfolioText: portfolio({}, { ecommerce: { priority: 101 } }),
      completedOutcomeIds: ['daily-company-control', 'engineering-release-control'],
    }),
    /ally_ceo_company_plan_product_automation_invalid/,
  )
  const gated = await buildAllyCeoCompanyPlan({
    now: '2026-07-29T12:00:00.000Z',
    hqNow: now,
    workboard,
    portfolioText: portfolio({}, { ecommerce: { status: 'owner-gated' } }),
    completedOutcomeIds: ['daily-company-control', 'engineering-release-control'],
  })
  assert.equal(gated.outcomeId, 'product-portfolio-control')
  assert.equal(gated.skipped, true)
  assert.equal(gated.reason, 'no_executable_product_focus')
  assert.equal(gated.manifest, null)
  assert.equal(gated.plan, null)
  assert.deepEqual(gated.gatedProductWork.map(({ productId, status }) => ({ productId, status })), [
    { productId: 'shop', status: 'owner-gated' },
    { productId: 'plant', status: 'owner-gated' },
    { productId: 'website', status: 'owner-gated' },
    { productId: 'ecommerce', status: 'owner-gated' },
  ])
  assert.equal(gated.controls.maxAgents, 0)
  assert.equal(gated.controls.planningModelCalls, 0)
  await assert.rejects(
    buildAllyCeoCompanyPlan({
      now: '2026-07-29T12:00:00.000Z',
      hqNow: now,
      workboard,
      portfolioText: portfolio({}, { ecommerce: { productId: 'plant' } }),
      completedOutcomeIds: ['daily-company-control', 'engineering-release-control'],
    }),
    /ally_ceo_company_plan_product_routing_invalid/,
  )
  await assert.rejects(
    buildAllyCeoCompanyPlan({
      now: '2026-07-29T12:00:00.000Z',
      hqNow: now,
      workboard,
      portfolioText: portfolio({}, { ecommerce: { workOrderId: 'shop-forged-work-order' } }),
      completedOutcomeIds: ['daily-company-control', 'engineering-release-control'],
    }),
    /ally_ceo_company_plan_product_routing_invalid/,
  )
  await assert.rejects(
    buildAllyCeoCompanyPlan({
      now: '2026-07-29T12:00:00.000Z',
      hqNow: now,
      workboard,
      portfolioText: JSON.stringify({
        ...JSON.parse(portfolio()),
        completedLocalAutomations: [{ productId: 'ecommerce', workOrderId: 'ecommerce-support-case', checkpoint: 'ENG-130' }],
      }),
      completedOutcomeIds: ['daily-company-control', 'engineering-release-control'],
    }),
    /ally_ceo_company_plan_product_work_already_completed/,
  )
  await assert.rejects(
    buildAllyCeoCompanyPlan({
      now: '2026-07-29T12:00:00.000Z',
      hqNow: now,
      workboard,
      portfolioText: portfolio({}, { ecommerce: { workOrder: 'Plant: revoke a material substitute.' } }),
      completedOutcomeIds: ['daily-company-control', 'engineering-release-control'],
    }),
    /ally_ceo_company_plan_product_routing_invalid/,
  )
})

test('capacity drift and non-authoritative social evidence fail before a work order exists', async () => {
  await assert.rejects(
    buildAllyCeoCompanyPlan({ now: '2026-07-29T00:00:00.000Z', hqNow: now, workboard, portfolioText: portfolio({ registeredRoleLimit: 175 }) }),
    /ally_ceo_company_plan_capacity_invalid/,
  )
  await assert.rejects(
    buildAllyCeoCompanyPlan({ now: '2026-07-29T00:00:00.000Z', hqNow: now, workboard, portfolioText: portfolio({ activeAssignmentLimit: 4 }) }),
    /ally_ceo_company_plan_capacity_invalid/,
  )
  await assert.rejects(
    buildAllyCeoCompanyPlan({ now: '2026-07-29T00:00:00.000Z', hqNow: now, workboard, portfolioText: portfolio({ maxConcurrentCompanyCycles: 2 }) }),
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
