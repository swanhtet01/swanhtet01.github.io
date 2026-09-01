import assert from 'node:assert/strict'
import test from 'node:test'

import { applyOrphanedCiRecovery, buildOrphanedCiRecoveryFailureReceipt, confirmOrphanedCiRecoveryOwnerClick, ORPHANED_CI_RECOVERY_CANCEL_POLL_ATTEMPTS } from './apply_exact_head_orphaned_ci_recovery.mjs'
import { ORPHANED_CI_RECOVERY_PLAN_TTL_MS, collectOrphanedCiRecoveryPlan } from './prepare_exact_head_orphaned_ci_recovery.mjs'

const head = 'a'.repeat(40)
const base = 'b'.repeat(40)
const tree = 'c'.repeat(40)
const now = new Date('2099-09-01T00:20:00.000Z')
const gitState = { branch: 'codex/release-stack-integration-rehearsal-20260825', head, tree, origin: 'https://github.com/swanhtet01/swanhtet01.github.io.git', clean: true }
const tools = [{ path: 'tools/prepare_exact_head_orphaned_ci_recovery.mjs', digest: `sha256:${'1'.repeat(64)}` }, { path: 'tools/apply_exact_head_orphaned_ci_recovery.mjs', digest: `sha256:${'2'.repeat(64)}` }]
const read = async () => 'name: SuperMega App CI\njobs:\n  validate:\n    timeout-minutes: 10\n'

function state() {
  const run = { id: 33, workflow_id: 44, run_attempt: 1, name: 'SuperMega App CI', path: '.github/workflows/showroom-ci.yml@main', head_sha: head, event: 'pull_request', status: 'in_progress', conclusion: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' }
  const job = { id: 55, run_id: 33, name: 'validate', status: 'in_progress', conclusion: null, check_run_url: 'https://api.github.com/repos/swanhtet01/swanhtet01.github.io/check-runs/66', started_at: '2026-09-01T00:00:00Z', completed_at: null }
  const check = { id: 66, name: 'validate', status: 'in_progress', conclusion: null }
  return { pr: { number: 561, state: 'open', draft: false, updated_at: '2026-09-01T00:00:00Z', base: { sha: base, repo: { full_name: 'swanhtet01/swanhtet01.github.io' } }, head: { sha: head } }, run, job, check, checks: { check_runs: [check, { id: 67, name: 'verify', status: 'completed', conclusion: 'success' }] }, runs: { workflow_runs: [run] }, cancelled: false }
}
function fetcher(value) { return async (path) => { if (path === '/pulls/561') return value.pr; if (path === '/actions/runs/33') return value.postRunResponses?.length ? value.postRunResponses.shift() : value.rerunRun || (value.cancelled ? { ...value.run, status: 'completed', conclusion: 'cancelled' } : value.run); if (path === '/actions/jobs/55') return value.job; if (path === '/check-runs/66') return value.check; if (path.startsWith('/commits/')) return value.checks; if (path.startsWith('/actions/runs?')) return value.runs; if (path === '/actions/runs/33/attempts/2/jobs?per_page=100') return value.rerunJobs; if (path === '/check-runs/99') return value.rerunCheck; throw new Error(`unexpected:${path}`) } }
async function plan(value) { return collectOrphanedCiRecoveryPlan({ prNumber: 561, runId: 33, jobId: 55, checkName: 'validate', phase: 'cancel', fetchJson: fetcher(value), gitState, now, read, toolDigests: Promise.resolve(tools) }) }
function response(status, json = {}) { return { ok: status >= 200 && status < 300, status, async json() { return json } } }
function queueRerun(value, { headSha = head, workflowId = 44, runAttempt = 2, jobRunId = 33, checkRunId = 99 } = {}) {
  const run = { ...value.run, workflow_id: workflowId, run_attempt: runAttempt, head_sha: headSha, status: 'queued', conclusion: null }
  const job = { id: 88, run_id: jobRunId, name: 'validate', status: 'queued', conclusion: null, check_run_url: `https://api.github.com/repos/swanhtet01/swanhtet01.github.io/check-runs/${checkRunId}`, started_at: null, completed_at: null }
  value.rerunRun = run
  value.rerunJobs = { total_count: 1, jobs: [job] }
  value.rerunCheck = { id: checkRunId, name: 'validate', status: 'queued', conclusion: null }
}

test('owner-approved cancellation uses exactly one POST and confirms only terminal cancellation', async () => {
  const value = state(); const packet = await plan(value); const calls = []
  const result = await applyOrphanedCiRecovery({ plan: packet, fetchJson: fetcher(value), request: async (url, init) => { calls.push({ url: String(url), method: init.method }); value.cancelled = true; return response(202) }, confirmer: () => true, env: { GITHUB_TOKEN: 'test-token-value' }, gitState, now: () => now, toolDigests: Promise.resolve(tools), read, nonce: () => '1'.repeat(64) })
  assert.equal(result.ok, true)
  assert.equal(result.controls.githubWritesPerformed, true)
  assert.equal(result.controls.workflowCancelled, true)
  assert.equal(result.controls.workflowRerun, false)
  assert.equal(result.controls.ownerApprovalReceiptConsumed, true)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], { url: 'https://api.github.com/repos/swanhtet01/swanhtet01.github.io/actions/runs/33/cancel', method: 'POST' })
})

test('cancellation polls the same exact run until terminal cancellation and fails closed on timeout', async () => {
  const value = state(); const packet = await plan(value); const cancelled = { ...value.run, status: 'completed', conclusion: 'cancelled' }; const waits = []
  const result = await applyOrphanedCiRecovery({ plan: packet, fetchJson: fetcher(value), request: async () => { value.postRunResponses = [value.run, cancelled]; return response(202) }, confirmer: () => true, env: { GITHUB_TOKEN: 'test-token-value' }, gitState, now: () => now, toolDigests: Promise.resolve(tools), read, nonce: () => 'b'.repeat(64), sleep: async (milliseconds) => { waits.push(milliseconds) } })
  assert.equal(result.controls.workflowCancelled, true)
  assert.equal(waits.length, 1)
  const stalled = state(); const stalledPacket = await plan(stalled); let calls = 0; let error
  try { await applyOrphanedCiRecovery({ plan: stalledPacket, fetchJson: fetcher(stalled), request: async () => { calls += 1; stalled.postRunResponses = Array.from({ length: ORPHANED_CI_RECOVERY_CANCEL_POLL_ATTEMPTS }, () => stalled.run); return response(202) }, confirmer: () => true, env: { GITHUB_TOKEN: 'test-token-value' }, gitState, now: () => now, toolDigests: Promise.resolve(tools), read, nonce: () => 'c'.repeat(64), sleep: async () => {} }) } catch (caught) { error = caught }
  assert.equal(calls, 1)
  assert.equal(buildOrphanedCiRecoveryFailureReceipt(error).controls.githubWriteOutcome, 'outcome_unknown')
})

test('decline and pre-write drift fail closed without a POST', async () => {
  const value = state(); const packet = await plan(value); let calls = 0
  await assert.rejects(applyOrphanedCiRecovery({ plan: packet, fetchJson: fetcher(value), request: async () => { calls += 1; return response(202) }, confirmer: () => false, env: { GITHUB_TOKEN: 'test-token-value' }, gitState, now: () => now, toolDigests: Promise.resolve(tools), read, nonce: () => '2'.repeat(64) }), /orphaned_ci_recovery_owner_declined/)
  assert.equal(calls, 0)
  const drift = state(); const driftPacket = await plan(drift); drift.pr = { ...drift.pr, updated_at: '2026-09-01T00:00:01Z' }
  await assert.rejects(applyOrphanedCiRecovery({ plan: driftPacket, fetchJson: fetcher(drift), request: async () => { calls += 1; return response(202) }, confirmer: () => true, env: { GITHUB_TOKEN: 'test-token-value' }, gitState, now: () => now, toolDigests: Promise.resolve(tools), read, nonce: () => '3'.repeat(64) }), /orphaned_ci_recovery_state_drift/)
  assert.equal(calls, 0)
})

test('post-initiation transport or response loss is outcome_unknown and never retries', async () => {
  const value = state(); const packet = await plan(value); let calls = 0
  let error
  try { await applyOrphanedCiRecovery({ plan: packet, fetchJson: fetcher(value), request: async () => { calls += 1; throw new Error('connection_lost') }, confirmer: () => true, env: { GITHUB_TOKEN: 'test-token-value' }, gitState, now: () => now, toolDigests: Promise.resolve(tools), read, nonce: () => '4'.repeat(64) }) } catch (caught) { error = caught }
  assert.equal(calls, 1)
  const receipt = buildOrphanedCiRecoveryFailureReceipt(error)
  assert.equal(receipt.controls.githubWriteAttempted, true)
  assert.equal(receipt.controls.githubWritesPerformed, null)
  assert.equal(receipt.controls.githubWriteOutcome, 'outcome_unknown')
  assert.equal(receipt.controls.githubWriteRetryAllowed, false)
})

test('explicit 4xx is confirmed not performed and cannot expose tokens or widen authority', async () => {
  const value = state(); const packet = await plan(value); let error
  try { await applyOrphanedCiRecovery({ plan: packet, fetchJson: fetcher(value), request: async () => response(422), confirmer: () => true, env: { GITHUB_TOKEN: 'test-token-value' }, gitState, now: () => now, toolDigests: Promise.resolve(tools), read, nonce: () => '5'.repeat(64) }) } catch (caught) { error = caught }
  const receipt = buildOrphanedCiRecoveryFailureReceipt(error)
  assert.equal(receipt.controls.githubWriteAttempted, true)
  assert.equal(receipt.controls.githubWritesPerformed, false)
  assert.equal(receipt.controls.workflowDispatched, false)
  assert.equal(JSON.stringify(receipt).includes('test-token-value'), false)
})

test('rerun is a separate cancelled-only action and a one-use receipt cannot replay', async () => {
  const value = state()
  value.run = { ...value.run, status: 'completed', conclusion: 'cancelled' }
  value.job = { ...value.job, status: 'completed', conclusion: 'cancelled', completed_at: '2026-09-01T00:01:00Z' }
  value.check = { ...value.check, status: 'completed', conclusion: 'cancelled' }
  value.checks = { check_runs: [value.check, { id: 67, name: 'verify', status: 'completed', conclusion: 'success' }] }
  value.runs = { workflow_runs: [value.run] }
  const packet = await collectOrphanedCiRecoveryPlan({ prNumber: 561, runId: 33, jobId: 55, checkName: 'validate', phase: 'rerun', fetchJson: fetcher(value), gitState, now, read, toolDigests: Promise.resolve(tools) })
  const waits = []
  const request = async (url, init) => { assert.equal(init.method, 'POST'); assert.equal(String(url).endsWith('/actions/jobs/55/rerun'), true); queueRerun(value); value.postRunResponses = [value.run, value.rerunRun]; return response(201, null) }
  const options = { plan: packet, fetchJson: fetcher(value), request, confirmer: () => true, env: { GITHUB_TOKEN: 'test-token-value' }, gitState, now: () => now, toolDigests: Promise.resolve(tools), read, nonce: () => '6'.repeat(64), sleep: async (milliseconds) => { waits.push(milliseconds) } }
  const result = await applyOrphanedCiRecovery(options)
  assert.equal(result.controls.workflowRerun, true)
  assert.equal(waits.length, 1)
  assert.deepEqual(result.rerunAcknowledgement, { responseStatus: 201, runId: 33, runAttempt: 2, jobId: 88, checkId: 99, workflowId: 44, head })
  value.runs = { workflow_runs: [value.run] }
  delete value.rerunRun
  delete value.postRunResponses
  delete value.rerunJobs
  delete value.rerunCheck
  await assert.rejects(applyOrphanedCiRecovery(options), /orphaned_ci_recovery_receipt_expired_or_consumed/)
})

test('rerun acknowledgement fails closed without one fresh exact workflow run and named job', async () => {
  const cases = [
    { name: 'missing run', update: () => {} },
    { name: 'wrong head', update: (value) => queueRerun(value, { headSha: 'd'.repeat(40) }) },
    { name: 'wrong workflow', update: (value) => queueRerun(value, { workflowId: 45 }) },
    { name: 'missing incremented attempt', update: (value) => queueRerun(value, { runAttempt: 1 }) },
    { name: 'wrong job binding', update: (value) => queueRerun(value, { jobRunId: 77 }) },
    { name: 'reused check identity', update: (value) => queueRerun(value, { checkRunId: 66 }) },
  ]
  for (const [index, candidate] of cases.entries()) {
    const value = state()
    value.run = { ...value.run, status: 'completed', conclusion: 'cancelled' }
    value.job = { ...value.job, status: 'completed', conclusion: 'cancelled', completed_at: '2026-09-01T00:01:00Z' }
    value.check = { ...value.check, status: 'completed', conclusion: 'cancelled' }
    value.checks = { check_runs: [value.check, { id: 67, name: 'verify', status: 'completed', conclusion: 'success' }] }
    value.runs = { workflow_runs: [value.run] }
    const packet = await collectOrphanedCiRecoveryPlan({ prNumber: 561, runId: 33, jobId: 55, checkName: 'validate', phase: 'rerun', fetchJson: fetcher(value), gitState, now, read, toolDigests: Promise.resolve(tools) })
    let calls = 0; let error
    try { await applyOrphanedCiRecovery({ plan: packet, fetchJson: fetcher(value), request: async () => { calls += 1; candidate.update(value); return response(201, null) }, confirmer: () => true, env: { GITHUB_TOKEN: 'test-token-value' }, gitState, now: () => now, toolDigests: Promise.resolve(tools), read, nonce: () => String(index + 7).repeat(64), sleep: async () => {} }) } catch (caught) { error = caught }
    assert.equal(calls, 1, candidate.name)
    const receipt = buildOrphanedCiRecoveryFailureReceipt(error)
    assert.equal(receipt.controls.githubWriteAttempted, true, candidate.name)
    assert.equal(receipt.controls.githubWritesPerformed, null, candidate.name)
    assert.equal(receipt.controls.githubWriteOutcome, 'outcome_unknown', candidate.name)
    assert.equal(receipt.controls.githubWriteRetryAllowed, false, candidate.name)
  }
})

test('Windows dialog timeout is fail-closed before any API action', () => {
  assert.throws(() => confirmOrphanedCiRecoveryOwnerClick('message', { platform: 'win32', spawn: () => ({ error: { code: 'ETIMEDOUT' } }) }), /orphaned_ci_recovery_owner_timed_out/)
})

test('a plan that expires while the dialog is open cannot reach the POST', async () => {
  const value = state(); const packet = await plan(value); let postCalls = 0; let ticks = 0
  const delayedNow = () => new Date(now.getTime() + (ticks++ >= 2 ? ORPHANED_CI_RECOVERY_PLAN_TTL_MS : 0))
  await assert.rejects(applyOrphanedCiRecovery({ plan: packet, fetchJson: fetcher(value), request: async () => { postCalls += 1; return response(202) }, confirmer: () => true, env: { GITHUB_TOKEN: 'test-token-value' }, gitState, now: delayedNow, toolDigests: Promise.resolve(tools), read, nonce: () => '7'.repeat(64) }), /orphaned_ci_recovery_plan_expired/)
  assert.equal(postCalls, 0)
})
