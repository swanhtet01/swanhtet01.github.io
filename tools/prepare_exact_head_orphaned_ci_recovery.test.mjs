import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ORPHANED_CI_RECOVERY_GRACE_MS,
  collectOrphanedCiRecoveryPlan,
  fetchGitHubJson,
  validateOrphanedCiRecoveryPlan,
} from './prepare_exact_head_orphaned_ci_recovery.mjs'

const head = 'a'.repeat(40)
const base = 'b'.repeat(40)
const tree = 'c'.repeat(40)
const now = new Date('2026-09-01T00:20:00.000Z')
const gitState = { branch: 'codex/release-stack-integration-rehearsal-20260825', head, tree, origin: 'https://github.com/swanhtet01/swanhtet01.github.io.git', clean: true }
const toolDigests = Promise.resolve([{ path: 'tools/prepare_exact_head_orphaned_ci_recovery.mjs', digest: `sha256:${'1'.repeat(64)}` }, { path: 'tools/apply_exact_head_orphaned_ci_recovery.mjs', digest: `sha256:${'2'.repeat(64)}` }])
const read = async () => 'name: SuperMega App CI\njobs:\n  validate:\n    timeout-minutes: 10\n  unrelated:\n    timeout-minutes: 1\n'

function fixture(overrides = {}) {
  const run = { id: 33, workflow_id: 44, name: 'SuperMega App CI', path: '.github/workflows/showroom-ci.yml@main', head_sha: head, event: 'pull_request', status: 'in_progress', conclusion: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' }
  const job = { id: 55, run_id: 33, name: 'validate', status: 'in_progress', conclusion: null, check_run_url: 'https://api.github.com/repos/swanhtet01/swanhtet01.github.io/check-runs/66', started_at: '2026-09-01T00:00:00Z', completed_at: null }
  const check = { id: 66, name: 'validate', status: 'in_progress', conclusion: null }
  return {
    pr: { number: 561, state: 'open', draft: false, updated_at: '2026-09-01T00:00:00Z', base: { sha: base, repo: { full_name: 'swanhtet01/swanhtet01.github.io' } }, head: { sha: head } },
    run, job, check,
    checks: { check_runs: [check, { id: 67, name: 'hosting-contract', status: 'completed', conclusion: 'success' }] },
    runs: { workflow_runs: [run] },
    ...overrides,
  }
}
function fetcher(state, calls = []) { return async (path) => { calls.push(path); if (path === '/pulls/561') return state.pr; if (path === '/actions/runs/33') return state.run; if (path === '/actions/jobs/55') return state.job; if (path === '/check-runs/66') return state.check; if (path.startsWith('/commits/')) return state.checks; if (path.startsWith('/actions/runs?')) return state.runs; throw new Error(`unexpected:${path}`) } }
async function plan(state = fixture(), options = {}) { return collectOrphanedCiRecoveryPlan({ prNumber: 561, runId: 33, jobId: 55, checkName: 'validate', phase: 'cancel', fetchJson: fetcher(state), gitState, now, read, toolDigests, ...options }) }

test('cancel plan is exact-head, stale, GET-only, and binds run/job/check/workflow timeout', async () => {
  const calls = []; const packet = await collectOrphanedCiRecoveryPlan({ prNumber: 561, runId: 33, jobId: 55, checkName: 'validate', phase: 'cancel', fetchJson: fetcher(fixture(), calls), gitState, now, read, toolDigests })
  assert.equal(packet.action.kind, 'cancel_exact_orphaned_workflow_run')
  assert.equal(packet.action.path, '/actions/runs/33/cancel')
  assert.equal(packet.workflow.timeoutMinutes, 10)
  assert.deepEqual(packet.controls.githubApiMethods, ['GET'])
  assert.equal(packet.controls.githubWritesPerformed, false)
  assert.equal(packet.target.job.checkRunId, 66)
  assert.deepEqual(calls.sort(), ['/actions/jobs/55', '/actions/runs/33', '/actions/runs?event=pull_request&head_sha=' + head + '&per_page=100', '/check-runs/66', '/commits/' + head + '/check-runs?per_page=100&filter=latest', '/pulls/561'].sort())
  assert.equal(validateOrphanedCiRecoveryPlan(packet, { now }), packet)
})

test('planner rejects non-stale, wrong head/run/job/check, sibling failure, and newer replacement run', async () => {
  const tooFresh = fixture({ run: { ...fixture().run, updated_at: '2026-09-01T00:15:01Z' } })
  tooFresh.runs = { workflow_runs: [tooFresh.run] }
  await assert.rejects(plan(tooFresh), /orphaned_ci_recovery_not_stale/)
  await assert.rejects(plan(fixture({ pr: { ...fixture().pr, head: { sha: 'd'.repeat(40) } } })), /orphaned_ci_recovery_local_head_mismatch/)
  await assert.rejects(plan(fixture({ job: { ...fixture().job, id: 56 } })), /orphaned_ci_recovery_job_invalid/)
  await assert.rejects(plan(fixture({ job: { ...fixture().job, run_id: 99 } })), /orphaned_ci_recovery_job_invalid/)
  const wrongWorkflow = fixture({ run: { ...fixture().run, path: '.github/workflows/other.yml@main' } }); wrongWorkflow.runs = { workflow_runs: [wrongWorkflow.run] }
  await assert.rejects(plan(wrongWorkflow), /orphaned_ci_recovery_run_invalid/)
  await assert.rejects(plan(fixture({ check: { ...fixture().check, name: 'wrong' } })), /orphaned_ci_recovery_check_invalid/)
  const failed = fixture({ checks: { check_runs: [fixture().check, { id: 67, name: 'hosting-contract', status: 'completed', conclusion: 'failure' }] } })
  await assert.rejects(plan(failed), /orphaned_ci_recovery_sibling_checks_not_terminal_green/)
  const newer = fixture(); newer.runs = { workflow_runs: [newer.run, { ...newer.run, id: 34, created_at: '2026-09-01T00:00:01Z', updated_at: '2026-09-01T00:00:01Z' }] }
  await assert.rejects(plan(newer), /orphaned_ci_recovery_newer_exact_head_run_exists/)
  const unrelated = fixture(); unrelated.runs = { workflow_runs: [unrelated.run, { ...unrelated.run, id: 98, workflow_id: 777, name: 'Other CI', path: '.github/workflows/other.yml@main', created_at: '2026-09-01T00:00:01Z', updated_at: '2026-09-01T00:00:01Z' }] }
  assert.equal((await plan(unrelated)).ok, true)
})

test('rerun plan requires terminal cancellation and never treats the cancelled target as a green sibling', async () => {
  const state = fixture()
  state.run = { ...state.run, status: 'completed', conclusion: 'cancelled' }
  state.job = { ...state.job, status: 'completed', conclusion: 'cancelled', completed_at: '2026-09-01T00:02:00Z' }
  state.check = { ...state.check, status: 'completed', conclusion: 'cancelled' }
  state.checks = { check_runs: [state.check, { id: 67, name: 'hosting-contract', status: 'completed', conclusion: 'neutral' }] }
  state.runs = { workflow_runs: [state.run] }
  const packet = await plan(state, { phase: 'rerun' })
  assert.equal(packet.action.kind, 'rerun_exact_cancelled_job')
  assert.equal(packet.action.path, '/actions/jobs/55/rerun')
  const notCancelled = fixture()
  await assert.rejects(plan(notCancelled, { phase: 'rerun' }), /orphaned_ci_recovery_rerun_target_not_cancelled/)
})

test('plan validation fails closed for replay/tamper and source workflow timeout drift', async () => {
  const packet = await plan()
  assert.throws(() => validateOrphanedCiRecoveryPlan({ ...packet, action: { ...packet.action, path: '/actions/runs/34/cancel' } }, { now }), /orphaned_ci_recovery_plan_digest_invalid/)
  const stale = new Date(now.getTime() + ORPHANED_CI_RECOVERY_GRACE_MS + 10 * 60_000)
  assert.throws(() => validateOrphanedCiRecoveryPlan(packet, { now: stale }), /orphaned_ci_recovery_plan_expired/)
  await assert.rejects(plan(fixture(), { read: async () => 'name: SuperMega App CI\njobs:\n  validate:\n    timeout-minutes: bogus' }), /orphaned_ci_recovery_workflow_timeout_invalid/)
})

test('default collector uses GET only and exhausts check/run pagination', async () => {
  const original = globalThis.fetch; const calls = []; const value = fixture()
  const response = (json, link = null) => ({ ok: true, status: 200, headers: { get: (name) => name === 'link' ? link : null }, async json() { return json } })
  globalThis.fetch = async (url, init) => {
    const parsed = new URL(String(url)); const path = parsed.pathname; const page = parsed.searchParams.get('page'); calls.push({ path, method: init.method || 'GET' })
    if (path.endsWith('/pulls/561')) return response(value.pr)
    if (path.endsWith('/actions/runs/33')) return response(value.run)
    if (path.endsWith('/actions/jobs/55')) return response(value.job)
    if (path.endsWith('/check-runs/66')) return response(value.check)
    if (path.includes('/commits/') && path.endsWith('/check-runs')) return response(page ? { check_runs: [] } : { check_runs: value.checks.check_runs }, page ? null : `<https://api.github.com/repos/swanhtet01/swanhtet01.github.io/commits/${head}/check-runs?per_page=100&filter=latest&page=2>; rel="next"`)
    if (path.endsWith('/actions/runs')) return response(page ? { workflow_runs: [] } : { workflow_runs: value.runs.workflow_runs }, page ? null : `<https://api.github.com/repos/swanhtet01/swanhtet01.github.io/actions/runs?event=pull_request&head_sha=${head}&per_page=100&page=2>; rel="next"`)
    throw new Error(`unexpected:${path}`)
  }
  try {
    const packet = await collectOrphanedCiRecoveryPlan({ prNumber: 561, runId: 33, jobId: 55, checkName: 'validate', phase: 'cancel', fetchJson: fetchGitHubJson, gitState, now, read, toolDigests })
    assert.equal(packet.ok, true)
    assert.equal(calls.every((call) => call.method === 'GET'), true)
    assert.equal(calls.filter((call) => call.path.endsWith('/actions/runs')).length, 2)
  } finally { globalThis.fetch = original }
})
