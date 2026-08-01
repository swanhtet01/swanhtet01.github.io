import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

import {
  AGENT_COMPANY_ENDPOINT,
  buildAgentCompanyManifestPreflight,
  createAgentCompanyApi,
  runGuidedAgentCompany,
  validateAgentCompanyManifest,
} from './agent-company-operator.mjs'
import { createCompanyWorkOrder } from './agent-company-work-orders.mjs'

const MANIFEST = {
  clientId: 'supermega-internal',
  cycleId: 'internal-proof-a',
  agents: ['operations-analyst'],
  roleBudget: 3,
  evidence: {
    'operations-analyst': { objective: 'Rank one redacted operating period.', facts: ['No customer claim.'] },
  },
}
const PREFLIGHT = buildAgentCompanyManifestPreflight(MANIFEST)
const HASH = PREFLIGHT.expectedPlanHash

const PLAN = {
  runId: PREFLIGHT.expectedRunId,
  clientId: MANIFEST.clientId,
  cycleId: MANIFEST.cycleId,
  actionMode: 'draft_only',
  approvalRequired: true,
  assignments: [
    {
      agentId: 'operations-analyst',
      name: 'Operations Analyst',
      department: 'operations',
      crew: 'daily-operator-brief',
      roleCount: 3,
      evidenceBytes: 80,
      returns: ['brief'],
    },
  ],
  budget: { agentLimit: 1, selectedAgents: 1, roleLimit: 3, plannedRoles: 3, remainingRoles: 0 },
  controls: {
    execution: 'sequential',
    maxConcurrentCycles: 1,
    maxActiveAssignments: 1,
    dynamicDelegation: false,
    crossAgentContext: false,
    externalWrites: false,
    durableClaimRequired: true,
  },
}

const PLANNED_ORDER = {
  workOrderId: PREFLIGHT.expectedWorkOrderId,
  clientId: MANIFEST.clientId,
  cycleId: MANIFEST.cycleId,
  status: 'planned',
  planHash: HASH,
  evidenceState: 'retained',
  plan: PLAN,
}

const COMPLETED_ORDER = {
  ...PLANNED_ORDER,
  status: 'completed',
  completedAt: '2026-07-14T03:00:00.000Z',
  evidenceState: 'scrubbed',
  resultHash: 'b'.repeat(64),
  result: {
    ok: true,
    status: 'completed',
    actionMode: 'draft_only',
    results: [{ agentId: 'operations-analyst', status: 'completed', output: { priority: 'one proof' } }],
    budget: { usedRoleCalls: 6 },
  },
}

function harness() {
  const calls = []
  return {
    calls,
    request: async (method, body) => {
      calls.push({ method, body: structuredClone(body) })
      if (method === 'GET') return { ok: true, agents: MANIFEST.agents.map((id) => ({ id })) }
      if (body.action === 'plan') return { ok: true, plan: structuredClone(PLAN) }
      if (body.action === 'work-order-create') return { ok: true, workOrder: structuredClone(PLANNED_ORDER) }
      if (body.action === 'work-order-run') return { ok: true, workOrder: structuredClone(COMPLETED_ORDER) }
      if (body.action === 'work-order-evaluate') {
        return {
          ok: true,
          evaluation: {
            workOrderId: body.workOrderId,
            clientId: body.clientId,
            verdict: body.verdict,
            checks: body.checks,
            evaluationHash: 'c'.repeat(64),
          },
        }
      }
      if (body.action === 'work-order-proof') {
        return {
          ok: true,
          proofPacket: {
            version: 1,
            kind: 'agent_company_delivery_proof',
            packetHash: 'd'.repeat(64),
            workOrder: {
              workOrderId: COMPLETED_ORDER.workOrderId,
              clientId: COMPLETED_ORDER.clientId,
              cycleId: COMPLETED_ORDER.cycleId,
              planHash: COMPLETED_ORDER.planHash,
            },
            delivery: {
              resultHash: COMPLETED_ORDER.resultHash,
              actionMode: 'draft_only',
            },
            controls: { externalWrites: false, rawEvidenceIncluded: false },
            review: null,
          },
        }
      }
      throw new Error(`unexpected:${body.action}`)
    },
  }
}

test('operator validates a bounded redacted manifest and rejects secret-shaped evidence before network access', async () => {
  assert.deepEqual(validateAgentCompanyManifest(MANIFEST).agents, MANIFEST.agents)
  assert.throws(() => validateAgentCompanyManifest({ ...MANIFEST, endpoint: 'https://elsewhere.invalid' }), /unknown_field:endpoint/)
  assert.throws(() => validateAgentCompanyManifest({ ...MANIFEST, agents: [...MANIFEST.agents, 'quality-reviewer'] }), /invalid_agents/)
  assert.throws(() => validateAgentCompanyManifest({
    ...MANIFEST,
    evidence: { ...MANIFEST.evidence, 'operations-analyst': { apiKey: 'must-never-enter-evidence' } },
  }), /sensitive_field/)
  assert.throws(() => validateAgentCompanyManifest({
    ...MANIFEST,
    evidence: { ...MANIFEST.evidence, 'operations-analyst': undefined },
  }), /invalid_evidence/)

  let requests = 0
  await assert.rejects(runGuidedAgentCompany({
    ...MANIFEST,
    evidence: { 'operations-analyst': { nested: { accessToken: 'blocked' } } },
  }, {
    request: async () => { requests += 1 },
    readConfirmation: async () => '',
  }), /sensitive_field/)
  assert.equal(requests, 0)
})

test('offline preflight hides evidence and matches the durable queue plan hash exactly', async () => {
  const preflight = buildAgentCompanyManifestPreflight(MANIFEST)
  const printed = JSON.stringify(preflight)
  assert.equal(preflight.kind, 'agent_company_manifest_preflight')
  assert.equal(preflight.expectedPlanHash, HASH)
  assert.equal(preflight.expectedRunId, PLAN.runId)
  assert.equal(preflight.expectedWorkOrderId, PLANNED_ORDER.workOrderId)
  assert.match(preflight.expectedPlanHash, /^[a-f0-9]{64}$/)
  assert.deepEqual(preflight.agents.map((entry) => entry.agentId), MANIFEST.agents)
  assert.equal(preflight.totalEvidenceBytes, preflight.agents.reduce((total, entry) => total + entry.bytes, 0))
  assert.equal(printed.includes('No customer claim'), false)
  assert.equal(printed.includes('Owner evidence required'), false)
  assert.notEqual(buildAgentCompanyManifestPreflight({
    ...MANIFEST,
    evidence: {
      ...MANIFEST.evidence,
      'operations-analyst': { objective: 'A reviewed change produces a new hash.' },
    },
  }).expectedPlanHash, HASH)

  let stored
  const created = await createCompanyWorkOrder(MANIFEST, {
    claimActivity: async () => ({ fresh: true, durable: true }),
    putWorkOrder: async (_key, record) => { stored = record; return true },
  })
  assert.equal(created.ok, true)
  assert.equal(created.workOrder.planHash, preflight.expectedPlanHash)
  assert.equal(created.workOrder.workOrderId, preflight.expectedWorkOrderId)
  assert.equal(stored.planHash, preflight.expectedPlanHash)
})

test('operator is plan-only by default and returns no raw evidence in its plan summary', async () => {
  const state = harness()
  let printed
  const result = await runGuidedAgentCompany(MANIFEST, {
    request: state.request,
    readConfirmation: async () => '',
    onPlan: async (plan) => { printed = JSON.stringify(plan) },
  })
  assert.equal(result.status, 'planned')
  assert.deepEqual(state.calls.map((call) => call.body?.action || call.method), ['GET', 'plan'])
  assert.equal(printed.includes('No customer claim'), false)
  assert.equal(printed.includes('Owner evidence required'), false)
  assert.equal(result.plan.controls.externalWrites, false)
  assert.match(result.plan.reviewedPlanHash, /^[a-f0-9]{64}$/)
})

test('queue and dispatch require separate exact confirmations', async () => {
  const queuedState = harness()
  const queued = await runGuidedAgentCompany(MANIFEST, {
    request: queuedState.request,
    readConfirmation: async (confirmation, stage) => stage === 'queue' ? confirmation : '',
  })
  assert.equal(queued.status, 'queued')
  assert.deepEqual(queuedState.calls.map((call) => call.body?.action || call.method), ['GET', 'plan', 'work-order-create'])

  const wrongState = harness()
  await assert.rejects(runGuidedAgentCompany(MANIFEST, {
    request: wrongState.request,
    readConfirmation: async (_confirmation, stage) => stage === 'queue' ? 'QUEUE wrong-run' : '',
  }), new RegExp(`confirmation_required:QUEUE ${PREFLIGHT.expectedRunId}`))
  assert.deepEqual(wrongState.calls.map((call) => call.body?.action || call.method), ['GET', 'plan'])
})

test('queued evidence stays bound to the validated manifest even if caller state changes after planning', async () => {
  const mutable = structuredClone(MANIFEST)
  const state = harness()
  await runGuidedAgentCompany(mutable, {
    request: state.request,
    readConfirmation: async (confirmation, stage) => stage === 'queue' ? confirmation : '',
    onPlan: async () => {
      mutable.evidence['operations-analyst'].objective = 'mutated after plan'
    },
  })
  const planned = state.calls.find((call) => call.body?.action === 'plan').body
  const queued = state.calls.find((call) => call.body?.action === 'work-order-create').body
  assert.equal(planned.evidence['operations-analyst'].objective, MANIFEST.evidence['operations-analyst'].objective)
  assert.equal(queued.evidence['operations-analyst'].objective, MANIFEST.evidence['operations-analyst'].objective)
})

test('full operator flow dispatches once, records checklist evaluation, and retrieves proof without customer review', async () => {
  const state = harness()
  const events = []
  const result = await runGuidedAgentCompany(MANIFEST, {
    request: state.request,
    readConfirmation: async (confirmation) => confirmation,
    readEvaluation: async (workOrder) => ({
      verdict: 'accepted',
      checks: { accurate: true, complete: true, usable: true, boundarySafe: true },
      confirmation: `EVALUATE ${workOrder.workOrderId}`,
    }),
    onQueued: async () => events.push('queued'),
    onResult: async () => events.push('result'),
    onEvaluation: async () => events.push('evaluation'),
    onProof: async () => events.push('proof'),
  })
  assert.equal(result.status, 'completed')
  assert.equal(result.evaluation.verdict, 'accepted')
  assert.equal(result.proofPacket.review, null)
  assert.deepEqual(events, ['queued', 'result', 'evaluation', 'proof'])
  const actions = state.calls.map((call) => call.body?.action || call.method)
  assert.deepEqual(actions, ['GET', 'plan', 'work-order-create', 'work-order-run', 'work-order-evaluate', 'work-order-proof'])
  assert.equal(actions.includes('work-order-review'), false)
  const run = state.calls.find((call) => call.body?.action === 'work-order-run').body
  assert.equal(run.confirmation, `RUN ${PLANNED_ORDER.workOrderId}`)
  assert.equal(run.planHash, HASH)
})

test('operator rejects identity, hash, and boundary drift across server responses', async () => {
  for (const testCase of [
    { action: 'plan', mutate: (body) => { body.plan.clientId = 'another-client' } },
    { action: 'plan', mutate: (body) => { body.plan.runId = 'agent-company:another-run' } },
    { action: 'plan', mutate: (body) => { body.plan.budget.roleLimit = 8 } },
    { action: 'plan', mutate: (body) => { body.plan.controls.maxConcurrentCycles = 4 } },
    { action: 'plan', mutate: (body) => { body.plan.controls.maxActiveAssignments = 4 } },
    { action: 'work-order-create', mutate: (body) => { body.workOrder.cycleId = 'another-cycle' } },
    { action: 'work-order-create', mutate: (body) => { body.workOrder.workOrderId = 'company-order:another-order' } },
    { action: 'work-order-create', mutate: (body) => { body.workOrder.planHash = 'f'.repeat(64) } },
    { action: 'work-order-create', mutate: (body) => { body.workOrder.plan.assignments[0].crew = 'drifted-crew' } },
    { action: 'work-order-run', mutate: (body) => { body.workOrder.planHash = 'f'.repeat(64) } },
    { action: 'work-order-proof', mutate: (body) => { body.proofPacket.controls.externalWrites = true } },
  ]) {
    const state = harness()
    const request = async (method, body) => {
      const response = await state.request(method, body)
      if (body?.action === testCase.action) testCase.mutate(response)
      return response
    }
    await assert.rejects(runGuidedAgentCompany(MANIFEST, {
      request,
      readConfirmation: async (confirmation) => confirmation,
    }), /agent_company_operator_(plan_mismatch|budget_mismatch|unsafe_plan|work_order_mismatch|plan_hash_mismatch|queued_plan_mismatch|result_mismatch|invalid_proof)/)
  }
})

test('API client fixes the production endpoint and keeps the Ops key out of payloads and errors', async () => {
  const seen = []
  const request = createAgentCompanyApi({
    opsKey: 'owner-only-key',
    fetchImpl: async (url, options) => {
      seen.push({ url, options })
      return { ok: true, json: async () => ({ ok: true, agents: [] }) }
    },
  })
  await request('GET')
  assert.equal(seen[0].url, AGENT_COMPANY_ENDPOINT)
  assert.equal(seen[0].options.headers['x-ops-key'], 'owner-only-key')
  assert.equal(seen[0].options.body, undefined)
  assert.equal(JSON.stringify(seen[0].options.body || {}).includes('owner-only-key'), false)

  const failed = createAgentCompanyApi({
    opsKey: 'owner-only-key',
    fetchImpl: async () => ({ ok: false, json: async () => ({ reason: 'provider leaked secret text' }) }),
  })
  await assert.rejects(failed('POST', { action: 'plan' }), /^Error: agent_company_request_failed$/)
})

test('CLI takes the Ops key only from the environment and has no customer-review command', async () => {
  const source = await readFile(new URL('./scripts/operate-agent-company.mjs', import.meta.url), 'utf8')
  assert.match(source, /process\.env\.SUPERMEGA_OPS_KEY/)
  assert.match(source, /press Enter to stop/)
  assert.match(source, /customerReviewRecorded: false/)
  assert.doesNotMatch(source, /--ops-key|--secret|work-order-review|writeFile|appendFile/)

  const script = fileURLToPath(new URL('./scripts/operate-agent-company.mjs', import.meta.url))
  const manifest = fileURLToPath(new URL('./examples/agent-company-work-order.example.json', import.meta.url))
  const result = spawnSync(process.execPath, [script, '--manifest', manifest, '--preflight'], {
    encoding: 'utf8',
    env: { ...process.env, SUPERMEGA_OPS_KEY: '' },
  })
  assert.equal(result.status, 0, result.stderr)
  const output = JSON.parse(result.stdout)
  assert.equal(output.mode, 'agent_company_manifest_preflight')
  assert.match(output.preflight.expectedPlanHash, /^[a-f0-9]{64}$/)
  assert.match(output.preflight.expectedRunId, /^agent-company:[a-f0-9]{40}$/)
  assert.match(output.preflight.expectedWorkOrderId, /^company-order:[a-f0-9]{40}$/)
  assert.equal(output.preflight.planner.assignments.length, 1)
  assert.equal(output.preflight.planner.budget.plannedRoles, 3)
  assert.equal(output.preflight.planner.controls.externalWrites, false)
  assert.equal(result.stdout.includes('owner-approved business evidence'), false)
  assert.equal(result.stdout.includes('approved baseline and current state'), false)

  const blocked = spawnSync(process.execPath, [script, '--manifest', manifest], {
    encoding: 'utf8',
    env: { ...process.env, SUPERMEGA_OPS_KEY: '' },
  })
  assert.equal(blocked.status, 1)
  assert.match(blocked.stderr, /agent_company_ops_key_required/)
  assert.equal(blocked.stdout, '')
})
