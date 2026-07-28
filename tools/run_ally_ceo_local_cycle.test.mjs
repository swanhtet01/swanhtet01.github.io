import assert from 'node:assert/strict'
import test from 'node:test'

import { runAllyCeoLocalCycle } from './run_ally_ceo_local_cycle.mjs'

function plan() {
  return {
    ok: true,
    contract: 'supermega.ally-ceo-company-plan.v1',
    declined: false,
    outcomeId: 'daily-company-control',
    manifest: { agents: ['operations-analyst', 'project-controller'], roleBudget: 6 },
    preflight: { expectedPlanHash: 'a'.repeat(64), expectedWorkOrderId: 'company-order:' + 'b'.repeat(40) },
    plan: { budget: { plannedRoles: 6, remainingRoles: 0 } },
    controls: {
      planningModelCalls: 0,
      planningConnectorRequests: 0,
      planningExternalWrites: false,
      maxAgents: 2,
      maxConcurrentAllyRuns: 1,
      scaleToZero: true,
    },
  }
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
  ready_for_use: true,
  source_count: 17,
  status_counts: { current: 17, changed: 0, missing: 0, unavailable: 0 },
  effects: { model_called: false, work_started: false },
})

function harness(overrides = {}) {
  const calls = []
  const queueId = '123456789abc'
  const jobId = 'abcdef123456'
  const runCommand = async (request) => {
    calls.push(structuredClone(request))
    const args = request.args
    if (request.kind === 'audit') return overrides.audit || audit()
    if (args[0] === 'health') return health
    if (args[0] === 'knowledge') return overrides.knowledge || knowledge
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
      team: { selection: 'explicit', roles: ['operations', 'chief-of-staff'] },
      knowledge: {
        status: 'ready',
        source_count: 17,
        status_counts: { current: 17, changed: 0, missing: 0, unavailable: 0 },
      },
      effects: { model_called: false, work_started: false },
    })
    if (args[0] === 'queue' && args[1] === 'cancel') return `Queue item ${queueId} cancelled.\n`
    if (args[0] === 'queue' && args[1] === 'run-next') {
      return `Queue item ${queueId} completed as job ${jobId}; quality=passed\nReport: C:\\state\\reports\\report.md\n`
    }
    if (args[0] === 'show') return JSON.stringify({
      job: [args[1], 'objective', 'complete', '2026-07-29T00:00:00Z', 'C:\\state\\outputs\\report.md'],
      evaluation: { passed: true },
    })
    throw new Error(`unexpected:${args.join(' ')}`)
  }
  return { calls, jobId, queueId, runCommand }
}

const acceptedReport = [
  '# Local Agent Company Report',
  '## Team plan',
  '1. operations',
  '## operations',
  'Managed persistence is not ready. CURRENT.md [EVIDENCE:1111111111111111]',
  'Security is not ready. hq/NOW.md [EVIDENCE:2222222222222222]',
  'Missing Proof: isolated managed tenant persistence and security evidence.',
  '## Executive synthesis',
  'The live app is not a managed system of record.',
  'Owner review required.',
  '## Evidence manifest',
].join('\n')

test('preflight binds the CEO plan to two local roles without queue or model work', async () => {
  const state = harness()
  const result = await runAllyCeoLocalCycle({ execute: false }, { plan: plan(), runCommand: state.runCommand })
  assert.equal(result.ok, true)
  assert.equal(result.status, 'ready')
  assert.deepEqual(result.roles, ['operations', 'chief-of-staff'])
  assert.equal(result.modelCalls, 0)
  assert.equal(result.queueWrites, 0)
  assert.equal(state.calls.some((call) => call.args?.includes('add')), false)
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
  assert.equal(result.modelCalls, 4)
  const add = state.calls.find((call) => call.args?.[1] === 'add')
  assert.equal(add.args.includes('--roles'), true)
  assert.equal(add.args.includes('operations,chief-of-staff'), true)
  const run = state.calls.find((call) => call.args?.[1] === 'run-next')
  assert.deepEqual(run.args.slice(0, 4), ['queue', 'run-next', '--queue-id', state.queueId])
  assert.equal(run.args.includes('0s'), true)
  assert.equal(run.args.includes('512'), true)
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
