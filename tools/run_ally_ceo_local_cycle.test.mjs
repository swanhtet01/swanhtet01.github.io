import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import { commandFailureReason, runAllyCeoLocalCycle } from './run_ally_ceo_local_cycle.mjs'

const outcomeAgents = {
  'daily-company-control': ['operations-analyst'],
  'engineering-release-control': ['proof-builder'],
  'product-portfolio-control': ['operations-analyst'],
  'growth-pipeline-control': ['sales-qualifier'],
  'finance-risk-control': ['cash-reconciler'],
}
const outcomeSequence = Object.keys(outcomeAgents)

test('HQ live command failures retain only recognized contract categories', () => {
  assert.equal(commandFailureReason('hq_live', {
    code: 1,
    stderr: JSON.stringify({
      ok: false,
      contract: 'supermega.hq-live-state.v1',
      error: 'live_app_product_contract_failed:missing_live_launch_readiness_context',
    }),
  }), 'ally_ceo_local_cycle_hq_live_failed:live_app_product_contract_failed:missing_live_launch_readiness_context')
  assert.equal(commandFailureReason('hq_live', {
    code: 1,
    stderr: JSON.stringify({ contract: 'supermega.hq-live-state.v1', error: 'token=must-not-escape' }),
  }), 'ally_ceo_local_cycle_command_failed:hq_live:1')
  assert.equal(commandFailureReason('local', { code: 2, stderr: 'private output' }), 'ally_ceo_local_cycle_command_failed:local:2')
})

function plan({ outcomeId = 'daily-company-control', hashCharacter = 'a' } = {}) {
  const generatedAt = '2026-07-29T00:00:00.000Z'
  return {
    ok: true,
    contract: 'supermega.ally-ceo-company-plan.v1',
    generatedAt,
    declined: false,
    outcomeId,
    manifest: {
      cycleId: `ally-ceo-20260729-${outcomeId}`,
      agents: outcomeAgents[outcomeId],
      roleBudget: 3,
    },
    preflight: { expectedPlanHash: hashCharacter.repeat(64), expectedWorkOrderId: 'company-order:' + 'b'.repeat(40) },
    plan: { budget: { plannedRoles: 3, remainingRoles: 0 } },
    controls: {
      planningModelCalls: 0,
      planningConnectorRequests: 0,
      planningExternalWrites: false,
      maxAgents: 1,
      maxConcurrentAllyRuns: 1,
      scaleToZero: true,
    },
  }
}

function rotatingPlan(completedOutcomeIds) {
  if (completedOutcomeIds.length === outcomeSequence.length) {
    return {
      ok: true,
      contract: 'supermega.ally-ceo-company-plan.v1',
      generatedAt: '2026-07-29T00:00:00.000Z',
      declined: true,
      reason: 'no_authorized_ceo_outcome',
      manifest: null,
      plan: null,
    }
  }
  const outcomeId = outcomeSequence[completedOutcomeIds.length]
  return plan({ outcomeId, hashCharacter: String.fromCharCode(97 + completedOutcomeIds.length) })
}

function completedOutcomeLine(outcomeId, index = 0, status = 'complete') {
  const queueId = (index + 1).toString(16).padStart(12, '0')
  const jobId = (index + 101).toString(16).padStart(12, '0')
  return `${queueId}  ${status.padEnd(14)}  p=100  2026-07-29T00:00:00Z  project=SuperMega  playbook=-  job=${jobId}  [ALLY_CEO_OUTCOME:2026-07-29:${outcomeId}] prior accepted outcome\n`
}

function legacyDailyHash(version = '2026-07-29.10') {
  return createHash('sha256').update([
    'supermega.ally-ceo-local-cycle.v1',
    version,
    'a'.repeat(64),
    'daily-company-control',
    'operations,chief-of-staff',
  ].join('|')).digest('hex').slice(0, 12)
}

const audit = (eligible = true) => JSON.stringify({
  contract: 'supermega.ally-runtime-audit.v1',
  mode: 'read_only',
  generatedAt: '2026-07-29T00:00:00.000Z',
  memory: { usedPercent: eligible ? 80 : 90 },
  localModels: { loaded: 0 },
  localCompany: {
    activeJobs: 0,
    queuedMissions: 0,
    runningMissions: 0,
    pendingApprovals: 0,
    pendingReportFinalizations: 0,
    pendingEvaluations: 0,
  },
  hostAdmission: {
    contract: 'supermega.ally-host-admission.v1',
    eligible,
    maxConcurrentLocalRuns: eligible ? 1 : 0,
    blockers: eligible ? [] : ['memory_pressure_critical'],
  },
})

const trimReceipt = JSON.stringify({
  ok: true,
  contract: 'supermega.ally-working-set-trim.v1',
  mode: 'apply',
  targetScope: 'verified_codex_process_tree',
  targetCount: 35,
  beforeWorkingSetMb: 2806,
  afterWorkingSetMb: 268.3,
  releasedWorkingSetMb: 2537.7,
  trimSucceeded: 35,
  trimFailed: 0,
  controls: {
    processMutation: true,
    processTerminationCalls: 0,
    filesModified: 0,
    networkRequests: 0,
    commandLinesRead: false,
    environmentRead: false,
    secretValuesReturned: false,
  },
})

const health = JSON.stringify({
  installed_models: ['qwen3.5:0.8b'],
  active_jobs: 0,
  queued_missions: 0,
  running_missions: 0,
  pending_approvals: 0,
  pending_report_finalizations: 0,
  pending_evaluations: 0,
  pending_completion: [],
})

const knowledge = JSON.stringify({
  schema: 'local-company.knowledge-freshness.v1',
  project_id: '9fb0ee15570b',
  ready_for_use: true,
  source_count: 17,
  status_counts: { current: 17, changed: 0, missing: 0, unavailable: 0 },
  effects: { knowledge_records_mutated: false, model_called: false, work_started: false },
})

const changedKnowledge = JSON.stringify({
  schema: 'local-company.knowledge-freshness.v1',
  project_id: '9fb0ee15570b',
  ready_for_use: false,
  source_count: 17,
  status_counts: { current: 16, changed: 1, missing: 0, unavailable: 0 },
  effects: { knowledge_records_mutated: false, model_called: false, work_started: false },
})

const missingKnowledge = JSON.stringify({
  schema: 'local-company.knowledge-freshness.v1',
  project_id: '9fb0ee15570b',
  ready_for_use: false,
  source_count: 17,
  status_counts: { current: 16, changed: 0, missing: 1, unavailable: 0 },
  effects: { knowledge_records_mutated: false, model_called: false, work_started: false },
})

const knowledgeRefresh = JSON.stringify({
  schema: 'local-company.knowledge-refresh.v1',
  project_id: '9fb0ee15570b',
  source_count: 17,
  refreshed_count: 1,
  unchanged_count: 16,
  refreshed_ids: ['123456789abc'],
  effects: { knowledge_records_mutated: true, model_called: false, work_started: false },
})

const hqLive = JSON.stringify({
  ok: true,
  contract: 'supermega.hq-live-state.v1',
  failures: [],
  snapshotAgeHours: 1.5,
  observedAt: '2026-07-29T00:30:00.000Z',
  appProductContract: { ok: true, contract: 'supermega_app_live' },
  probes: {
    timeoutMs: 15000,
    maxAttempts: 2,
    appReleaseAttempts: 1,
    publicReleaseAttempts: 2,
    healthAttempts: 1,
    cloudAutonomyAttempts: 1,
  },
  release: { commit: 'a'.repeat(40) },
  runtime: { operatingMode: 'isolated_demo', managedPersistenceReady: false, securityReady: false },
  capacity: { scaleToZero: true, idleActiveExecutionTarget: 0, registeredSpecialistsConsumeCompute: false },
})

function harness(overrides = {}) {
  const calls = []
  let auditIndex = 0
  let knowledgeAuditIndex = 0
  const queueId = '123456789abc'
  const jobId = 'abcdef123456'
  const runCommand = async (request) => {
    calls.push(structuredClone(request))
    const args = request.args
    if (request.kind === 'audit') {
      const sequence = overrides.auditSequence || [overrides.audit || audit()]
      const response = sequence[Math.min(auditIndex, sequence.length - 1)]
      auditIndex += 1
      return response
    }
    if (request.kind === 'trim') return overrides.trimReceipt || trimReceipt
    if (request.kind === 'hq_live') return overrides.hqLive || hqLive
    if (args[0] === 'health') return health
    if (args[0] === 'knowledge' && args[1] === 'audit') {
      const sequence = overrides.knowledgeSequence || [overrides.knowledge || knowledge]
      const response = sequence[Math.min(knowledgeAuditIndex, sequence.length - 1)]
      knowledgeAuditIndex += 1
      return response
    }
    if (args[0] === 'knowledge' && args[1] === 'refresh') return overrides.refreshReceipt || knowledgeRefresh
    if (args.join(' ') === 'queue list') return overrides.queueList || 'No queue items found.\n'
    if (args[0] === 'queue' && args[1] === 'add') return `Queued mission ${queueId}; nothing was executed.\n`
    if (args[0] === 'queue' && args[1] === 'preflight') return overrides.preflight || JSON.stringify({
      schema: 'local-company.queue-preflight.v1',
      status: 'ready',
      queue_id: queueId,
      reviewed_queue_matches: true,
      submission_allowed: true,
      model_execution_ready: true,
      blockers: [],
      owner_gate_categories: [],
      team: { selection: 'explicit', roles: ['operations'] },
      knowledge: {
        status: 'ready',
        source_count: 17,
        status_counts: { current: 17, changed: 0, missing: 0, unavailable: 0 },
      },
      effects: { model_called: false, work_started: false },
    })
    if (args[0] === 'queue' && args[1] === 'cancel') return `Queue item ${queueId} cancelled.\n`
    if (args[0] === 'queue' && args[1] === 'run-next') {
      return `Queue item ${queueId} completed as job ${jobId}; quality=passed\nReport: C:\\state\\outputs\\report.md\n`
    }
    if (args[0] === 'show') return JSON.stringify({
      job: [
        args[1],
        overrides.jobObjectives?.[args[1]] || 'objective',
        'complete',
        '2026-07-29T00:00:00Z',
        overrides.reportPaths?.[args[1]] || 'C:\\state\\outputs\\report.md',
      ],
      evaluation: { passed: true },
      events: Array.from({ length: overrides.modelEventCount ?? 3 }, () => ['model_metrics', '{}']),
    })
    throw new Error(`unexpected:${args.join(' ')}`)
  }
  return { calls, jobId, queueId, runCommand }
}

const acceptedSpecialistSections = [
  'operations', 'chief-of-staff', 'engineering', 'quality', 'sales', 'finance',
].flatMap((role) => [
  `## ${role}`,
  'Not verified or performed: Proposed next action: review one bounded local gap, Assumption: its priority is unconfirmed, Missing proof: owner-reviewed evidence.',
])

const acceptedReport = [
  '# Local Agent Company Report',
  '## Team plan',
  '1. operations',
  ...acceptedSpecialistSections,
  'Missing Proof: isolated managed tenant persistence and security evidence.',
  '## Executive synthesis',
  'CURRENT.md [EVIDENCE:1111111111111111] records that the live app is not a managed system of record. hq/NOW.md [EVIDENCE:2222222222222222] records managed persistence and security as not ready.',
  'Owner review required.',
  '## Evidence manifest',
].join('\n')

const acceptedStructuredReport = [
  '# Local Agent Company Report',
  '## Team plan',
  '1. operations',
  ...acceptedSpecialistSections,
  '## Executive synthesis',
  'Verified facts: CURRENT.md [EVIDENCE:1111111111111111] is verified as a frozen local source for this brief. hq/NOW.md [EVIDENCE:2222222222222222] records this frozen limitation: managed persistence is not ready.',
  'Assumptions: Current operational readiness and adoption remain unverified pending owner review.',
  'Task templates: 1. Proposed, not verified or performed: Review managed readiness evidence.',
  'Success checks: Require a sealed local report, valid hashes, and every deterministic quality gate to pass.',
  'Failure modes: Missing evidence blocks local report acceptance.',
  'Owner gates: External actions require owner approval.',
  'Owner review required.',
  '## Evidence manifest',
].join('\n\n')

test('preflight binds the CEO plan to one local specialist without queue or model work', async () => {
  const state = harness()
  const result = await runAllyCeoLocalCycle({ execute: false }, { plan: plan(), runCommand: state.runCommand })
  assert.equal(result.ok, true)
  assert.equal(result.status, 'ready')
  assert.deepEqual(result.roles, ['operations'])
  assert.equal(result.modelCalls, 0)
  assert.equal(result.queueWrites, 0)
  assert.equal(result.liveHq.releaseCommit, 'a'.repeat(40))
  assert.equal(result.liveHq.performed, true)
  assert.deepEqual(result.liveHq.probeAttempts, [1, 2, 1, 1])
  assert.equal(state.calls.findIndex((call) => call.kind === 'hq_live') < state.calls.findIndex((call) => call.args?.[0] === 'knowledge'), true)
  assert.equal(state.calls.some((call) => call.args?.includes('add')), false)
})

test('fresh outcomes fail before knowledge, queue, or model work when live HQ truth is rejected', async () => {
  const state = harness({ hqLive: JSON.stringify({ ok: false, contract: 'supermega.hq-live-state.v1', failures: ['snapshot_stale'] }) })
  await assert.rejects(
    runAllyCeoLocalCycle({ execute: true, refreshKnowledge: true }, { plan: plan(), runCommand: state.runCommand }),
    /ally_ceo_local_cycle_hq_live_rejected/,
  )
  assert.equal(state.calls.filter((call) => call.kind === 'hq_live').length, 1)
  assert.equal(state.calls.some((call) => call.args?.[0] === 'knowledge'), false)
  assert.equal(state.calls.some((call) => call.args?.[1] === 'add'), false)
  assert.equal(state.calls.some((call) => call.args?.[1] === 'run-next'), false)
})

test('accepted daily evidence rotates the next serial run to Engineering despite plan-hash drift', async () => {
  const state = harness({ queueList: completedOutcomeLine('daily-company-control') })
  const result = await runAllyCeoLocalCycle(
    { execute: false },
    {
      buildPlan: async (completedOutcomeIds) => rotatingPlan(completedOutcomeIds),
      runCommand: state.runCommand,
      inspectReport: async () => ({
        path: 'C:\\state\\outputs\\daily.md',
        bytes: Buffer.byteLength(acceptedStructuredReport),
        digest: 'sha256:' + '7'.repeat(64),
        text: acceptedStructuredReport,
      }),
    },
  )
  assert.equal(result.status, 'ready')
  assert.equal(result.outcomeId, 'engineering-release-control')
  assert.deepEqual(result.completedOutcomeIds, ['daily-company-control'])
  assert.deepEqual(result.roles, ['engineering'])
  assert.equal(result.modelCalls, 0)
  assert.equal(state.calls.filter((call) => call.args?.[0] === 'show').length, 1)
})

test('five accepted outcomes close the UTC period with zero queue or model work', async () => {
  const queueList = outcomeSequence.map((outcomeId, index) => completedOutcomeLine(outcomeId, index)).join('')
  const state = harness({ queueList })
  const result = await runAllyCeoLocalCycle(
    { execute: true, refreshKnowledge: true },
    {
      buildPlan: async (completedOutcomeIds) => rotatingPlan(completedOutcomeIds),
      runCommand: state.runCommand,
      inspectReport: async () => ({
        path: 'C:\\state\\outputs\\accepted.md',
        bytes: Buffer.byteLength(acceptedStructuredReport),
        digest: 'sha256:' + '8'.repeat(64),
        text: acceptedStructuredReport,
      }),
    },
  )
  assert.equal(result.ok, true)
  assert.equal(result.status, 'period_complete')
  assert.equal(result.period, '2026-07-29')
  assert.deepEqual(result.completedOutcomeIds, outcomeSequence)
  assert.equal(result.modelCalls, 0)
  assert.equal(result.queueWrites, 0)
  assert.equal(result.sourceCount, null)
  assert.deepEqual(result.liveHq, { performed: false, skipped: 'period_closed' })
  assert.deepEqual(result.knowledgeRefresh, {
    requested: true,
    performed: false,
    refreshedSources: 0,
    skipped: 'period_closed',
  })
  assert.equal(state.calls.some((call) => call.args?.[0] === 'knowledge'), false)
  assert.equal(state.calls.some((call) => call.kind === 'hq_live'), false)
  assert.equal(state.calls.some((call) => call.args?.[1] === 'add'), false)
})

test('failed period outcomes are quarantined while rotation advances without replacement work', async () => {
  const failed = harness({ queueList: completedOutcomeLine('daily-company-control', 0, 'quality_failed') })
  const failedResult = await runAllyCeoLocalCycle(
    { execute: false },
    { buildPlan: async (completedOutcomeIds) => rotatingPlan(completedOutcomeIds), runCommand: failed.runCommand },
  )
  assert.equal(failedResult.ok, true)
  assert.equal(failedResult.status, 'ready')
  assert.equal(failedResult.outcomeId, 'engineering-release-control')
  assert.deepEqual(failedResult.completedOutcomeIds, [])
  assert.deepEqual(failedResult.rejectedOutcomes, [{
    outcomeId: 'daily-company-control',
    queueId: '000000000001',
    jobId: '000000000065',
    status: 'quality_failed',
    reason: 'queue_quality_failed',
  }])
  assert.equal(failed.calls.some((call) => call.args?.[1] === 'add'), false)

  const duplicate = harness({
    queueList: completedOutcomeLine('daily-company-control', 0) + completedOutcomeLine('daily-company-control', 1),
  })
  await assert.rejects(
    runAllyCeoLocalCycle(
      { execute: true },
      { buildPlan: async (completedOutcomeIds) => rotatingPlan(completedOutcomeIds), runCommand: duplicate.runCommand },
    ),
    /ally_ceo_local_cycle_duplicate_plan/,
  )
  assert.equal(duplicate.calls.some((call) => call.args?.[1] === 'add'), false)
})

test('a fully attempted period with rejected outcomes closes incomplete without queue or model work', async () => {
  const queueList = outcomeSequence.map((outcomeId, index) => completedOutcomeLine(
    outcomeId,
    index,
    index === 0 ? 'quality_failed' : 'complete',
  )).join('')
  const state = harness({ queueList })
  const result = await runAllyCeoLocalCycle(
    { execute: true },
    {
      buildPlan: async (completedOutcomeIds) => rotatingPlan(completedOutcomeIds),
      runCommand: state.runCommand,
      inspectReport: async () => ({
        path: 'C:\\state\\outputs\\accepted.md',
        bytes: Buffer.byteLength(acceptedStructuredReport),
        digest: 'sha256:' + '8'.repeat(64),
        text: acceptedStructuredReport,
      }),
    },
  )
  assert.equal(result.ok, false)
  assert.equal(result.status, 'period_incomplete')
  assert.deepEqual(result.completedOutcomeIds, outcomeSequence.slice(1))
  assert.deepEqual(result.rejectedOutcomes.map((item) => item.outcomeId), ['daily-company-control'])
  assert.equal(result.modelCalls, 0)
  assert.equal(result.queueWrites, 0)
  assert.equal(result.sourceCount, null)
  assert.deepEqual(result.liveHq, { performed: false, skipped: 'period_closed' })
  assert.equal(result.knowledgeRefresh.skipped, 'period_closed')
  assert.equal(state.calls.some((call) => call.args?.[0] === 'knowledge'), false)
  assert.equal(state.calls.some((call) => call.kind === 'hq_live'), false)
  assert.equal(state.calls.some((call) => call.args?.[1] === 'add'), false)
})

test('a closed period permits exactly one explicit legacy repair and remains closed without it', async () => {
  const firstJobId = '000000000065'
  const firstReportPath = 'C:\\state\\outputs\\legacy-rejected.md'
  const queueList = outcomeSequence.map((outcomeId, index) => completedOutcomeLine(outcomeId, index)).join('')
  const withheldReport = acceptedStructuredReport.replace(
    'Not verified or performed: Proposed next action: review one bounded local gap, Assumption: its priority is unconfirmed, Missing proof: owner-reviewed evidence.',
    'Not verified or performed: specialist draft withheld after incomplete model output.',
  )
  const options = {
    queueList,
    jobObjectives: {
      [firstJobId]: '[ALLY_CEO_OUTCOME:2026-07-29:daily-company-control] [ALLY_CEO_CYCLE:7f6fa5f49409] [ALLY_CEO_PLAN:1680d458f8e4] Each specialist section must be at most 90 words and contain exactly these advisory labels: Proposed next action, Assumption, and Missing proof. Specialists must not claim execution or verified facts; the evidence-grounded executive synthesis remains code-owned. The executive synthesis must be at most 120 words and end with: Owner review required.',
    },
    reportPaths: { [firstJobId]: firstReportPath },
  }
  const inspectReport = async (path) => {
    const text = path === firstReportPath ? withheldReport : acceptedStructuredReport
    return { path, bytes: Buffer.byteLength(text), digest: 'sha256:' + '4'.repeat(64), text }
  }

  const closed = harness(options)
  const closedResult = await runAllyCeoLocalCycle(
    { execute: true },
    {
      buildPlan: async (completedOutcomeIds) => rotatingPlan(completedOutcomeIds),
      runCommand: closed.runCommand,
      inspectReport,
    },
  )
  assert.equal(closedResult.status, 'period_incomplete')
  assert.equal(closedResult.queueWrites, 0)
  assert.equal(closedResult.modelCalls, 0)
  assert.equal(closed.calls.some((call) => call.args?.[1] === 'add'), false)

  const repair = harness(options)
  const repaired = await runAllyCeoLocalCycle(
    { execute: true, repairRejected: true },
    {
      buildPlan: async (completedOutcomeIds) => rotatingPlan(completedOutcomeIds),
      runCommand: repair.runCommand,
      inspectReport,
    },
  )
  assert.equal(repaired.status, 'accepted')
  assert.equal(repaired.outcomeId, 'daily-company-control')
  assert.equal(repaired.repair.jobId, firstJobId)
  assert.equal(repaired.queueWrites, 1)
  assert.equal(repair.calls.filter((call) => call.args?.[1] === 'add').length, 1)
  assert.match(repair.calls.find((call) => call.args?.[1] === 'add').args[2], /\[ALLY_CEO_REPAIR:2026-07-29:daily-company-control:[a-f0-9]{12}\]/)
})

test('a closed period never repairs a rejected current-version outcome', async () => {
  const firstJobId = '000000000065'
  const firstReportPath = 'C:\\state\\outputs\\current-rejected.md'
  const queueList = outcomeSequence.map((outcomeId, index) => completedOutcomeLine(outcomeId, index)).join('')
  const withheldReport = acceptedStructuredReport.replace(
    'Not verified or performed: Proposed next action: review one bounded local gap, Assumption: its priority is unconfirmed, Missing proof: owner-reviewed evidence.',
    'Not verified or performed: specialist draft withheld after incomplete model output.',
  )
  const state = harness({
    queueList,
    jobObjectives: {
      [firstJobId]: '[ALLY_CEO_OUTCOME:2026-07-29:daily-company-control] [ALLY_CEO_CYCLE:0123456789ab] [ALLY_CEO_PLAN:fedcba987654] Each specialist section must be at most 90 words and contain exactly these advisory labels: Proposed next action, Assumption, and Missing proof. Specialists must not claim execution or verified facts; the evidence-grounded executive synthesis remains code-owned. The executive synthesis must be at most 120 words and end with: Owner review required. Write each specialist section as complete sentences on one line. The Proposed next action must begin with review, inspect, compare, or draft; never begin it with execute, deploy, publish, send, pay, purchase, migrate, or enable. Do not end a clause with a conjunction, helper verb, or unfinished phrase, and do not append canned scope warnings after a semicolon.',
    },
    reportPaths: { [firstJobId]: firstReportPath },
  })
  const result = await runAllyCeoLocalCycle(
    { execute: true, repairRejected: true },
    {
      buildPlan: async (completedOutcomeIds) => rotatingPlan(completedOutcomeIds),
      runCommand: state.runCommand,
      inspectReport: async (path) => ({
        path,
        bytes: Buffer.byteLength(withheldReport),
        digest: 'sha256:' + '6'.repeat(64),
        text: withheldReport,
      }),
    },
  )
  assert.equal(result.status, 'period_incomplete')
  assert.equal(result.queueWrites, 0)
  assert.equal(result.modelCalls, 0)
  assert.equal(state.calls.some((call) => call.args?.[1] === 'add'), false)
})

test('a period marker from another project cannot satisfy SuperMega rotation', async () => {
  const foreign = harness({
    queueList: completedOutcomeLine('daily-company-control').replace('project=SuperMega', 'project=Other'),
  })
  await assert.rejects(
    runAllyCeoLocalCycle(
      { execute: true },
      { buildPlan: async (completedOutcomeIds) => rotatingPlan(completedOutcomeIds), runCommand: foreign.runCommand },
    ),
    /ally_ceo_local_cycle_queue_inventory_invalid/,
  )
  assert.equal(foreign.calls.some((call) => call.args?.[1] === 'add'), false)
})

test('execution claims the exact reviewed mission once and accepts only a quality-passed report', async () => {
  const state = harness()
  const result = await runAllyCeoLocalCycle(
    { execute: true },
    {
      plan: plan(),
      runCommand: state.runCommand,
      inspectReport: async () => ({
        path: 'C:\\state\\outputs\\report.md',
        bytes: Buffer.byteLength(acceptedReport),
        digest: 'sha256:' + 'c'.repeat(64),
        text: acceptedReport,
      }),
    },
  )
  assert.equal(result.status, 'accepted')
  assert.equal(result.queueId, state.queueId)
  assert.equal(result.jobId, state.jobId)
  assert.equal(result.qualityPassed, true)
  assert.equal(result.modelCalls, 3)
  const add = state.calls.find((call) => call.args?.[1] === 'add')
  assert.equal(add.args.includes('--roles'), true)
  assert.equal(add.args.includes('operations'), true)
  assert.match(add.args[2], /Proposed next action, Assumption, and Missing proof/)
  assert.match(add.args[2], /must begin with review, inspect, compare, or draft/)
  assert.match(add.args[2], /never begin it with execute, deploy, publish, send, pay, purchase, migrate, or enable/)
  assert.match(add.args[2], /Do not end a clause with a conjunction, helper verb, or unfinished phrase/)
  const run = state.calls.find((call) => call.args?.[1] === 'run-next')
  assert.deepEqual(run.args.slice(0, 4), ['queue', 'run-next', '--queue-id', state.queueId])
  assert.equal(run.args.includes('0s'), true)
  assert.equal(run.args.includes('768'), true)
})

test('execution can atomically refresh changed registered evidence before queue or model work', async () => {
  const state = harness({ knowledgeSequence: [changedKnowledge, knowledge], modelEventCount: 2 })
  const result = await runAllyCeoLocalCycle(
    { execute: true, refreshKnowledge: true },
    {
      plan: plan(),
      runCommand: state.runCommand,
      inspectReport: async () => ({
        path: 'C:\\state\\outputs\\refreshed.md',
        bytes: Buffer.byteLength(acceptedStructuredReport),
        digest: 'sha256:' + '9'.repeat(64),
        text: acceptedStructuredReport,
      }),
    },
  )
  assert.equal(result.ok, true)
  assert.deepEqual(result.knowledgeRefresh, { requested: true, performed: true, refreshedSources: 1 })
  const localCalls = state.calls.filter((call) => call.kind === 'local').map((call) => call.args.slice(0, 2).join(' '))
  assert.deepEqual(localCalls.slice(1, 5), ['queue list', 'knowledge audit', 'knowledge refresh', 'knowledge audit'])
})

test('knowledge refresh is execution-only and stale evidence still fails without the explicit control', async () => {
  const preflight = harness()
  await assert.rejects(
    runAllyCeoLocalCycle({ execute: false, refreshKnowledge: true }, { plan: plan(), runCommand: preflight.runCommand }),
    /ally_ceo_local_cycle_knowledge_refresh_requires_execution/,
  )
  assert.equal(preflight.calls.length, 0)

  const stale = harness({ knowledge: changedKnowledge })
  await assert.rejects(
    runAllyCeoLocalCycle({ execute: true }, { plan: plan(), runCommand: stale.runCommand }),
    /ally_ceo_local_cycle_knowledge_not_current/,
  )
  assert.equal(stale.calls.some((call) => call.args?.[1] === 'refresh'), false)
  assert.equal(stale.calls.some((call) => call.args?.[1] === 'add'), false)
})

test('missing sources and forged refresh receipts fail before a queue write', async () => {
  const missing = harness({ knowledge: missingKnowledge })
  await assert.rejects(
    runAllyCeoLocalCycle({ execute: true, refreshKnowledge: true }, { plan: plan(), runCommand: missing.runCommand }),
    /ally_ceo_local_cycle_knowledge_source_unavailable/,
  )
  assert.equal(missing.calls.some((call) => call.args?.[1] === 'refresh'), false)

  const forged = harness({
    knowledge: changedKnowledge,
    refreshReceipt: JSON.stringify({
      ...JSON.parse(knowledgeRefresh),
      refreshed_ids: ['123456789abc', 'abcdef123456'],
    }),
  })
  await assert.rejects(
    runAllyCeoLocalCycle({ execute: true, refreshKnowledge: true }, { plan: plan(), runCommand: forged.runCommand }),
    /ally_ceo_local_cycle_knowledge_refresh_rejected/,
  )
  assert.equal(forged.calls.some((call) => call.args?.[1] === 'add'), false)
})

test('code-owned structured evidence and limitation sections satisfy CEO semantics', async () => {
  const state = harness({ modelEventCount: 2 })
  const result = await runAllyCeoLocalCycle(
    { execute: true },
    {
      plan: plan(),
      runCommand: state.runCommand,
      inspectReport: async () => ({
        path: 'C:\\state\\outputs\\structured.md',
        bytes: Buffer.byteLength(acceptedStructuredReport),
        digest: 'sha256:' + 'f'.repeat(64),
        text: acceptedStructuredReport,
      }),
    },
  )
  assert.equal(result.ok, true)
  assert.equal(result.modelCalls, 2)
})

test('quality-passed reports with withheld specialist work cannot advance CEO control', async () => {
  const state = harness({ modelEventCount: 2 })
  const withheldReport = acceptedStructuredReport.replace(
    'Not verified or performed: Proposed next action: review one bounded local gap, Assumption: its priority is unconfirmed, Missing proof: owner-reviewed evidence.',
    'Not verified or performed: specialist draft withheld after incomplete model output.',
  )
  await assert.rejects(
    runAllyCeoLocalCycle(
      { execute: true },
      {
        plan: plan(),
        runCommand: state.runCommand,
        inspectReport: async () => ({
          path: 'C:\\state\\outputs\\withheld.md',
          bytes: Buffer.byteLength(withheldReport),
          digest: 'sha256:' + '1'.repeat(64),
          text: withheldReport,
        }),
      },
    ),
    /ally_ceo_local_cycle_specialist_section_rejected/,
  )
})

test('quality-passed reports ending in a dangling specialist clause cannot advance', async () => {
  for (const ending of ['or', 'does', 'currently']) {
    const state = harness({ modelEventCount: 2 })
    const danglingReport = acceptedStructuredReport.replace(
      'Not verified or performed: Proposed next action: review one bounded local gap, Assumption: its priority is unconfirmed, Missing proof: owner-reviewed evidence.',
      `Not verified or performed: Proposed next action: review one bounded local gap. Assumption: its priority is unconfirmed. Missing proof: validate Shop Plant ${ending}.`,
    )
    await assert.rejects(
      runAllyCeoLocalCycle(
        { execute: true },
        {
          plan: plan(),
          runCommand: state.runCommand,
          inspectReport: async () => ({
            path: 'C:\\state\\outputs\\dangling.md',
            bytes: Buffer.byteLength(danglingReport),
            digest: 'sha256:' + '4'.repeat(64),
            text: danglingReport,
          }),
        },
      ),
      /ally_ceo_local_cycle_specialist_section_rejected/,
    )
  }
})

test('quality-passed reports with unbalanced specialist markdown cannot advance', async () => {
  for (const fragment of ['`Shop', '(Shop', '[Shop', '{Shop']) {
    const state = harness({ modelEventCount: 2 })
    const malformedReport = acceptedStructuredReport.replace(
      'Not verified or performed: Proposed next action: review one bounded local gap, Assumption: its priority is unconfirmed, Missing proof: owner-reviewed evidence.',
      `Not verified or performed: Proposed next action: review one bounded local gap. Assumption: its priority is unconfirmed. Missing proof: validate ${fragment} and Plant evidence.`,
    )
    await assert.rejects(
      runAllyCeoLocalCycle(
        { execute: true },
        {
          plan: plan(),
          runCommand: state.runCommand,
          inspectReport: async () => ({
            path: 'C:\\state\\outputs\\malformed.md',
            bytes: Buffer.byteLength(malformedReport),
            digest: 'sha256:' + '7'.repeat(64),
            text: malformedReport,
          }),
        },
      ),
      /ally_ceo_local_cycle_specialist_section_rejected/,
    )
  }
})

test('consequential proposals and dangling words before code-owned closings cannot advance', async () => {
  const unsafeSections = [
    'Not verified or performed: Proposed next action: Execute the hosted migration. Assumption: readiness is unconfirmed. Missing proof: owner-reviewed evidence.',
    ...['currently', 'state', 'not', 'reusable', 'consequential'].map((word) =>
      `Not verified or performed: Proposed next action: review one bounded local gap ending ${word}; Keep the scope local. Assumption: readiness is unconfirmed. Missing proof: owner-reviewed evidence.`
    ),
  ]
  for (const unsafeSection of unsafeSections) {
    const state = harness({ modelEventCount: 2 })
    const unsafeReport = acceptedStructuredReport.replace(
      'Not verified or performed: Proposed next action: review one bounded local gap, Assumption: its priority is unconfirmed, Missing proof: owner-reviewed evidence.',
      unsafeSection,
    )
    await assert.rejects(
      runAllyCeoLocalCycle(
        { execute: true },
        {
          plan: plan(),
          runCommand: state.runCommand,
          inspectReport: async () => ({
            path: 'C:\\state\\outputs\\unsafe-action.md',
            bytes: Buffer.byteLength(unsafeReport),
            digest: 'sha256:' + 'a'.repeat(64),
            text: unsafeReport,
          }),
        },
      ),
      /ally_ceo_local_cycle_specialist_section_rejected/,
    )
  }
})

test('one rejected legacy outcome can be repaired once under the current quality contract', async () => {
  const oldQueueId = 'f'.repeat(12)
  const oldJobId = 'e'.repeat(12)
  const oldReportPath = 'C:\\state\\outputs\\legacy.md'
  const marker = `[ALLY_CEO_CYCLE:${legacyDailyHash()}]`
  const state = harness({
    queueList: `${oldQueueId}  complete        p=100  2026-07-29T00:00:00Z  project=SuperMega  playbook=-  job=${oldJobId}  ${marker} legacy cycle\n`,
    jobObjectives: { [oldJobId]: `${marker} legacy objective` },
    reportPaths: { [oldJobId]: oldReportPath },
    modelEventCount: 2,
  })
  const withheldReport = acceptedStructuredReport.replace(
    'Not verified or performed: Proposed next action: review one bounded local gap, Assumption: its priority is unconfirmed, Missing proof: owner-reviewed evidence.',
    'Not verified or performed: specialist draft withheld after incomplete model output.',
  )
  const result = await runAllyCeoLocalCycle(
    { execute: true, repairRejected: true },
    {
      plan: plan(),
      runCommand: state.runCommand,
      inspectReport: async (path) => {
        const text = path === oldReportPath ? withheldReport : acceptedStructuredReport
        return { path, bytes: Buffer.byteLength(text), digest: 'sha256:' + '2'.repeat(64), text }
      },
    },
  )
  assert.equal(result.status, 'accepted')
  assert.deepEqual(result.repair, {
    queueId: oldQueueId,
    jobId: oldJobId,
    reason: 'ally_ceo_local_cycle_specialist_section_rejected',
  })
  assert.equal(result.queueWrites, 1)
  const addedObjective = state.calls.find((call) => call.args?.[1] === 'add').args[2]
  assert.match(addedObjective, /\[ALLY_CEO_REPAIR:2026-07-29:daily-company-control:[a-f0-9]{12}\]/)
  assert.doesNotMatch(addedObjective, /\[ALLY_CEO_OUTCOME:/)
})

test('a rejected preceding-version repair migrates to one versioned repair marker', async () => {
  const oldQueueId = '9'.repeat(12)
  const oldJobId = '8'.repeat(12)
  const oldReportPath = 'C:\\state\\outputs\\old-repair.md'
  const cycleMarker = `[ALLY_CEO_CYCLE:${legacyDailyHash('2026-07-29.12')}]`
  const repairMarker = '[ALLY_CEO_REPAIR:2026-07-29:daily-company-control]'
  const state = harness({
    queueList: `${oldQueueId}  complete        p=100  2026-07-29T00:00:00Z  project=SuperMega  playbook=-  job=${oldJobId}  ${repairMarker} prior repair\n`,
    jobObjectives: { [oldJobId]: `${repairMarker} ${cycleMarker} prior repair` },
    reportPaths: { [oldJobId]: oldReportPath },
    modelEventCount: 2,
  })
  const danglingReport = acceptedStructuredReport.replace(
    'Not verified or performed: Proposed next action: review one bounded local gap, Assumption: its priority is unconfirmed, Missing proof: owner-reviewed evidence.',
    'Not verified or performed: Proposed next action: review one bounded local gap. Assumption: its priority is unconfirmed. Missing proof: validate Shop Plant or.',
  )
  const result = await runAllyCeoLocalCycle(
    { execute: true, repairRejected: true },
    {
      plan: plan(),
      runCommand: state.runCommand,
      inspectReport: async (path) => {
        const text = path === oldReportPath ? danglingReport : acceptedStructuredReport
        return { path, bytes: Buffer.byteLength(text), digest: 'sha256:' + '5'.repeat(64), text }
      },
    },
  )
  assert.equal(result.status, 'accepted')
  assert.equal(result.repair.queueId, oldQueueId)
  const addedObjective = state.calls.find((call) => call.args?.[1] === 'add').args[2]
  assert.match(addedObjective, /\[ALLY_CEO_REPAIR:2026-07-29:daily-company-control:[a-f0-9]{12}\]/)
  assert.doesNotMatch(addedObjective, /\[ALLY_CEO_REPAIR:2026-07-29:daily-company-control\]/)
})

test('newest versioned repair takes precedence over an older unversioned repair', async () => {
  const oldQueueId = '9'.repeat(12)
  const oldJobId = '8'.repeat(12)
  const recentQueueId = '7'.repeat(12)
  const recentJobId = '6'.repeat(12)
  const oldPath = 'C:\\state\\outputs\\old.md'
  const recentPath = 'C:\\state\\outputs\\recent.md'
  const oldMarker = '[ALLY_CEO_REPAIR:2026-07-29:daily-company-control]'
  const recentHash = legacyDailyHash('2026-07-29.13')
  const recentMarker = `[ALLY_CEO_REPAIR:2026-07-29:daily-company-control:${recentHash}]`
  const state = harness({
    queueList: [
      `${oldQueueId}  complete        p=100  2026-07-29T00:00:00Z  project=SuperMega  playbook=-  job=${oldJobId}  ${oldMarker} old repair`,
      `${recentQueueId}  complete        p=100  2026-07-29T00:01:00Z  project=SuperMega  playbook=-  job=${recentJobId}  ${recentMarker} recent repair`,
      '',
    ].join('\n'),
    jobObjectives: {
      [oldJobId]: `${oldMarker} [ALLY_CEO_CYCLE:${legacyDailyHash('2026-07-29.12')}] old`,
      [recentJobId]: `${recentMarker} [ALLY_CEO_CYCLE:${recentHash}] recent`,
    },
    reportPaths: { [oldJobId]: oldPath, [recentJobId]: recentPath },
  })
  const danglingReport = acceptedStructuredReport.replace(
    'Not verified or performed: Proposed next action: review one bounded local gap, Assumption: its priority is unconfirmed, Missing proof: owner-reviewed evidence.',
    'Not verified or performed: Proposed next action: review one bounded local gap. Assumption: its priority is unconfirmed. Missing proof: validate Shop Plant does.',
  )
  const result = await runAllyCeoLocalCycle(
    { execute: false },
    {
      plan: plan(),
      runCommand: state.runCommand,
      inspectReport: async (path) => {
        const text = path === recentPath ? danglingReport : acceptedStructuredReport
        return { path, bytes: Buffer.byteLength(text), digest: 'sha256:' + '6'.repeat(64), text }
      },
    },
  )
  assert.equal(result.status, 'existing_rejected')
  assert.equal(result.queueId, recentQueueId)
  assert.equal(state.calls.filter((call) => call.args?.[0] === 'show').length, 1)
})

test('legacy repair is execution-only and never retries a rejected current-version outcome', async () => {
  const beforeExecution = harness()
  await assert.rejects(
    runAllyCeoLocalCycle(
      { execute: false, repairRejected: true },
      { plan: plan(), runCommand: beforeExecution.runCommand },
    ),
    /ally_ceo_local_cycle_legacy_repair_requires_execution/,
  )
  assert.equal(beforeExecution.calls.length, 0)

  const preview = await runAllyCeoLocalCycle(
    { execute: false },
    { plan: plan(), runCommand: harness().runCommand },
  )
  const oldQueueId = 'f'.repeat(12)
  const oldJobId = 'e'.repeat(12)
  const currentMarker = `[ALLY_CEO_CYCLE:${preview.cycleHash.slice(0, 12)}]`
  const state = harness({
    queueList: `${oldQueueId}  complete        p=100  2026-07-29T00:00:00Z  project=SuperMega  playbook=-  job=${oldJobId}  ${currentMarker} current cycle\n`,
    jobObjectives: { [oldJobId]: `${currentMarker} current objective` },
  })
  const withheldReport = acceptedStructuredReport.replace(
    'Not verified or performed: Proposed next action: review one bounded local gap, Assumption: its priority is unconfirmed, Missing proof: owner-reviewed evidence.',
    'Not verified or performed: specialist draft withheld after incomplete model output.',
  )
  await assert.rejects(
    runAllyCeoLocalCycle(
      { execute: true, repairRejected: true },
      {
        plan: plan(),
        runCommand: state.runCommand,
        inspectReport: async () => ({
          path: 'C:\\state\\outputs\\current.md',
          bytes: Buffer.byteLength(withheldReport),
          digest: 'sha256:' + '3'.repeat(64),
          text: withheldReport,
        }),
      },
    ),
    /ally_ceo_local_cycle_legacy_repair_not_allowed/,
  )
  assert.equal(state.calls.some((call) => call.args?.[1] === 'add'), false)
})

test('a locally passed report is still rejected when it denies known missing proof', async () => {
  const state = harness()
  const falseReport = acceptedReport.replace(
    'Missing Proof: isolated managed tenant persistence and security evidence.',
    'Missing Proof: No.',
  )
  await assert.rejects(
    runAllyCeoLocalCycle(
      { execute: true },
      {
        plan: plan(),
        runCommand: state.runCommand,
        inspectReport: async () => ({
          path: 'C:\\state\\outputs\\false.md',
          bytes: Buffer.byteLength(falseReport),
          digest: 'sha256:' + 'd'.repeat(64),
          text: falseReport,
        }),
      },
    ),
    /ally_ceo_local_cycle_report_semantics_rejected/,
  )
})

test('an existing plan token replays without creating duplicate work', async () => {
  const preview = await runAllyCeoLocalCycle({ execute: false }, { plan: plan(), runCommand: harness().runCommand })
  const state = harness({
    queueList: `${'f'.repeat(12)}  complete        p=100  2026-07-29T00:00:00Z  project=SuperMega  playbook=-  job=${'e'.repeat(12)}  [ALLY_CEO_CYCLE:${preview.cycleHash.slice(0, 12)}] prior cycle\n`,
  })
  const result = await runAllyCeoLocalCycle(
    { execute: true },
    {
      plan: plan(),
      runCommand: state.runCommand,
      inspectReport: async () => ({
        path: 'C:\\state\\outputs\\report.md',
        bytes: Buffer.byteLength(acceptedReport),
        digest: 'sha256:' + 'e'.repeat(64),
        text: acceptedReport,
      }),
    },
  )
  assert.equal(result.status, 'existing')
  assert.equal(result.replayed, true)
  assert.equal(result.ok, true)
  assert.equal(result.modelCalls, 0)
  assert.equal(state.calls.some((call) => call.args?.includes('add')), false)
})

test('a completed local report cannot replay as accepted when CEO semantics reject it', async () => {
  const preview = await runAllyCeoLocalCycle({ execute: false }, { plan: plan(), runCommand: harness().runCommand })
  const state = harness({
    queueList: `${'f'.repeat(12)}  complete        p=100  2026-07-29T00:00:00Z  project=SuperMega  playbook=-  job=${'e'.repeat(12)}  [ALLY_CEO_CYCLE:${preview.cycleHash.slice(0, 12)}] prior cycle\n`,
  })
  const falseReport = acceptedReport.replace(
    'Missing Proof: isolated managed tenant persistence and security evidence.',
    'Missing Proof: No.',
  )
  const result = await runAllyCeoLocalCycle(
    { execute: true },
    {
      plan: plan(),
      runCommand: state.runCommand,
      inspectReport: async () => ({
        path: 'C:\\state\\outputs\\report.md',
        bytes: Buffer.byteLength(falseReport),
        digest: 'sha256:' + 'e'.repeat(64),
        text: falseReport,
      }),
    },
  )
  assert.equal(result.ok, false)
  assert.equal(result.status, 'existing_rejected')
  assert.equal(result.modelCalls, 0)
  assert.equal(state.calls.some((call) => call.args?.includes('run-next')), false)
})

test('a cancelled attempt does not block a clean exact retry', async () => {
  const preview = await runAllyCeoLocalCycle({ execute: false }, { plan: plan(), runCommand: harness().runCommand })
  const state = harness({
    queueList: `${'d'.repeat(12)}  cancelled       p=100  2026-07-29T00:00:00Z  project=SuperMega  playbook=-  job=-  [ALLY_CEO_CYCLE:${preview.cycleHash.slice(0, 12)}] cancelled attempt\n`,
  })
  const result = await runAllyCeoLocalCycle({ execute: false }, { plan: plan(), runCommand: state.runCommand })
  assert.equal(result.status, 'ready')
  assert.equal(result.replayed, false)
})

test('host pressure and a rejected exact preflight fail closed', async () => {
  const blocked = harness({ audit: audit(false) })
  await assert.rejects(
    runAllyCeoLocalCycle({ execute: true }, { plan: plan(), runCommand: blocked.runCommand }),
    /ally_ceo_local_cycle_host_blocked:memory_pressure_critical/,
  )
  const rejected = harness({
    preflight: JSON.stringify({ schema: 'local-company.queue-preflight.v1', status: 'blocked' }),
  })
  await assert.rejects(
    runAllyCeoLocalCycle({ execute: true }, { plan: plan(), runCommand: rejected.runCommand }),
    /ally_ceo_local_cycle_queue_preflight_rejected/,
  )
  assert.equal(rejected.calls.some((call) => call.args?.[1] === 'cancel'), true)
})

test('one idle memory-only blocker receives a bounded trim and fresh admission audit', async () => {
  const recovered = harness({ auditSequence: [audit(false), audit(true), audit(true)] })
  const result = await runAllyCeoLocalCycle(
    { execute: true },
    {
      plan: plan(),
      runCommand: recovered.runCommand,
      inspectReport: async () => ({
        path: 'C:\\state\\outputs\\recovered.md',
        bytes: Buffer.byteLength(acceptedStructuredReport),
        digest: 'sha256:' + '8'.repeat(64),
        text: acceptedStructuredReport,
      }),
    },
  )
  assert.equal(result.status, 'accepted')
  assert.deepEqual(result.host.memoryRecovery, {
    attempted: true,
    initialMemoryUsedPercent: 90,
    targetCount: 35,
    beforeWorkingSetMb: 2806,
    afterWorkingSetMb: 268.3,
    releasedWorkingSetMb: 2537.7,
    processTerminations: 0,
  })
  assert.equal(recovered.calls.filter((call) => call.kind === 'trim').length, 1)
  assert.equal(recovered.calls.filter((call) => call.kind === 'audit').length, 3)
})

test('memory recovery is execution-only, opt-out capable, and never handles another blocker', async () => {
  const preview = harness({ audit: audit(false) })
  await assert.rejects(
    runAllyCeoLocalCycle({ execute: false }, { plan: plan(), runCommand: preview.runCommand }),
    /ally_ceo_local_cycle_host_blocked:memory_pressure_critical/,
  )
  assert.equal(preview.calls.some((call) => call.kind === 'trim'), false)

  const optedOut = harness({ audit: audit(false) })
  await assert.rejects(
    runAllyCeoLocalCycle({ execute: true, recoverMemory: false }, { plan: plan(), runCommand: optedOut.runCommand }),
    /ally_ceo_local_cycle_host_blocked:memory_pressure_critical/,
  )
  assert.equal(optedOut.calls.some((call) => call.kind === 'trim'), false)

  const otherBlocker = JSON.parse(audit(false))
  otherBlocker.hostAdmission.blockers = ['ambiguous_listener']
  const unsafe = harness({ audit: JSON.stringify(otherBlocker) })
  await assert.rejects(
    runAllyCeoLocalCycle({ execute: true }, { plan: plan(), runCommand: unsafe.runCommand }),
    /ally_ceo_local_cycle_host_blocked:ambiguous_listener/,
  )
  assert.equal(unsafe.calls.some((call) => call.kind === 'trim'), false)
})

test('malformed memory recovery evidence fails before queue, model, or retry', async () => {
  const invalid = harness({
    audit: audit(false),
    trimReceipt: JSON.stringify({ ...JSON.parse(trimReceipt), controls: { processTerminationCalls: 1 } }),
  })
  await assert.rejects(
    runAllyCeoLocalCycle({ execute: true }, { plan: plan(), runCommand: invalid.runCommand }),
    /ally_ceo_local_cycle_memory_recovery_invalid/,
  )
  assert.equal(invalid.calls.filter((call) => call.kind === 'trim').length, 1)
  assert.equal(invalid.calls.filter((call) => call.kind === 'audit').length, 1)
  assert.equal(invalid.calls.some((call) => call.args?.includes('queue')), false)
})
