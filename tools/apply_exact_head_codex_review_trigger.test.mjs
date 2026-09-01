import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import {
  EXACT_HEAD_CODEX_REVIEW_BODY,
  collectExactHeadCodexReviewPlan,
} from './prepare_exact_head_codex_review_trigger.mjs'
import {
  applyExactHeadCodexReviewTrigger,
  buildExactHeadCodexReviewTriggerFailureReceipt,
  confirmExactHeadCodexReviewOwnerClick,
  renderExactHeadCodexReviewOwnerConfirmation,
} from './apply_exact_head_codex_review_trigger.mjs'

const head = 'a'.repeat(40)
const base = 'b'.repeat(40)
const tree = 'c'.repeat(40)
const fixedNow = new Date('2026-08-31T09:00:00.000Z')
const authority = { handoff: { candidate: head, fileDigest: `sha256:${'1'.repeat(64)}`, bodyDigest: `sha256:${'2'.repeat(64)}` }, protection: { healthy: true, fileDigest: `sha256:${'3'.repeat(64)}`, bodyDigest: `sha256:${'4'.repeat(64)}` } }
const gitState = { branch: 'codex/release-stack-integration-rehearsal-20260825', head, tree, origin: 'https://github.com/swanhtet01/swanhtet01.github.io.git', clean: true }
const tools = [{ path: 'tools/prepare_exact_head_codex_review_trigger.mjs', digest: `sha256:${'5'.repeat(64)}` }, { path: 'tools/apply_exact_head_codex_review_trigger.mjs', digest: `sha256:${'6'.repeat(64)}` }]
const digest = (value) => `sha256:${createHash('sha256').update(value.replace(/\r\n?/g, '\n')).digest('hex')}`

function api(overrides = {}) {
  const value = { pr: { number: 561, state: 'open', draft: false, updated_at: '2026-08-31T08:04:23.000Z', base: { sha: base, repo: { full_name: 'swanhtet01/swanhtet01.github.io' } }, head: { sha: head } }, checks: { check_runs: [{ id: 1, name: 'validate', status: 'completed', conclusion: 'success' }] }, reviews: [], comments: [], timeline: [{ event: 'committed', sha: head }], ...overrides }
  if (!Object.hasOwn(overrides, 'timeline')) value.timeline = [{ event: 'committed', sha: head }, ...value.comments.map((comment) => ({ event: 'commented', id: comment.id }))]
  return value
}
function fetcher(current) { return async (path) => path.startsWith('/pulls/') && path.includes('/reviews') ? current.reviews : path.includes('/timeline?') ? current.timeline : path.startsWith('/issues/') ? current.comments : path.startsWith('/commits/') ? current.checks : current.pr }
async function fixture(current = api()) { const plan = await collectExactHeadCodexReviewPlan({ authority, fetchJson: fetcher(current), gitState, now: fixedNow, toolDigests: Promise.resolve(tools) }); return { plan, payload: JSON.stringify(plan), current } }
function response(status, json) { return { ok: status >= 200 && status < 300, status, async json() { return json } } }
function options(plan, payload, current, request, extra = {}) { return { plan, planPayload: payload, planFileDigest: digest(payload), fetchJson: fetcher(current), request, confirmer: () => true, env: { GITHUB_TOKEN: 'unit-test-token' }, gitState, now: () => fixedNow, toolDigests: Promise.resolve(tools), nonce: () => '9'.repeat(64), ...extra } }

test('owner-approved executor posts one exact body and reads it back against the same PR head', async () => {
  const { plan, payload, current } = await fixture(); let posts = 0
  const request = async (url, init) => {
    if (init.method === 'POST') { posts += 1; assert.equal(init.body, JSON.stringify({ body: EXACT_HEAD_CODEX_REVIEW_BODY })); return response(201, { id: 77 }) }
    assert.match(url, /issues\/comments\/77$/); return response(200, { id: 77, body: EXACT_HEAD_CODEX_REVIEW_BODY, user: { login: 'codex-bot' }, created_at: '2026-08-31T09:00:01.000Z' })
  }
  const result = await applyExactHeadCodexReviewTrigger(options(plan, payload, current, request))
  assert.equal(posts, 1)
  assert.equal(result.comment.id, 77)
  assert.equal(result.comment.body, EXACT_HEAD_CODEX_REVIEW_BODY)
  assert.equal(result.comment.exactHeadBeforeAndAfter, head)
  assert.equal(result.controls.githubWritesPerformed, true)
  assert.equal(result.controls.reviewerRequested, false)
  assert.equal(result.controls.deploymentPerformed, false)
  assert.match(renderExactHeadCodexReviewOwnerConfirmation(plan, { now: fixedNow }), /No is the default/)
})

test('Windows dialog is default-No and a timeout fails closed through the mocked process boundary', () => {
  let command = null
  const declined = confirmExactHeadCodexReviewOwnerClick('test', { platform: 'win32', spawn: (file, args) => { command = { file, args }; return { status: 0, stdout: 'DECLINED' } } })
  assert.equal(declined, false)
  assert.equal(command.file, 'powershell.exe')
  assert.match(command.args.join(' '), /MessageBoxDefaultButton\]::Button2/)
  assert.throws(() => confirmExactHeadCodexReviewOwnerClick('test', { platform: 'win32', spawn: () => ({ error: { code: 'ETIMEDOUT' } }) }), /exact_head_codex_review_trigger_owner_timed_out/)
})

test('default CLI collector performs only the required GET preflight reads before a mocked default-No decision', async () => {
  const { plan, payload, current } = await fixture(); const calls = []; const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET' })
    const path = new URL(String(url)).pathname.replace('/repos/swanhtet01/swanhtet01.github.io', '')
    return response(200, await fetcher(current)(path + new URL(String(url)).search))
  }
  try {
    const execute = options(plan, payload, current, async () => { throw new Error('post must not run') }, { confirmer: () => false })
    delete execute.fetchJson
    await assert.rejects(applyExactHeadCodexReviewTrigger(execute), /exact_head_codex_review_trigger_owner_declined/)
  } finally { globalThis.fetch = originalFetch }
  assert.deepEqual(calls.map((call) => call.method), ['GET', 'GET', 'GET', 'GET', 'GET'])
  assert.deepEqual(calls.map((call) => new URL(call.url).pathname), [
    '/repos/swanhtet01/swanhtet01.github.io/pulls/561',
    '/repos/swanhtet01/swanhtet01.github.io/commits/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/check-runs',
    '/repos/swanhtet01/swanhtet01.github.io/pulls/561/reviews',
    '/repos/swanhtet01/swanhtet01.github.io/issues/561/comments',
    '/repos/swanhtet01/swanhtet01.github.io/issues/561/timeline',
  ])
})

test('GitHub CLI keyring binds the expected active account and keeps its token out of the receipt', async () => {
  const { plan, payload, current } = await fixture(); const keyringToken = 'keyring-unit-token'; const commands = []
  const githubCli = (args) => {
    commands.push(args)
    if (args[1] === 'status') return { status: 0, stdout: '', stderr: 'Logged in to github.com account swanhtet01 (keyring)\nActive account: true' }
    if (args[1] === 'token') return { status: 0, stdout: keyringToken, stderr: '' }
    throw new Error('unexpected gh command')
  }
  const request = async (url, init) => {
    if (init.method === 'POST') { assert.equal(init.headers.authorization, `Bearer ${keyringToken}`); return response(201, { id: 78 }) }
    assert.match(url, /issues\/comments\/78$/); return response(200, { id: 78, body: EXACT_HEAD_CODEX_REVIEW_BODY, user: { login: 'codex-bot' }, created_at: '2026-08-31T09:00:01.000Z' })
  }
  const result = await applyExactHeadCodexReviewTrigger(options(plan, payload, current, request, { env: {}, githubCli, nonce: () => 'a'.repeat(64) }))
  assert.deepEqual(commands, [['auth', 'status', '--hostname', 'github.com'], ['auth', 'token', '--hostname', 'github.com']])
  assert.deepEqual(result.authentication, { source: 'github_cli_keyring', valueExposed: false })
  assert.doesNotMatch(JSON.stringify(result), new RegExp(keyringToken))
})

test('environment tokens remain preferred and malformed or unavailable keyring authentication fails before POST', async () => {
  const { plan, payload, current } = await fixture(); let posts = 0
  const request = async (_url, init) => { if (init.method === 'POST') { posts += 1; return response(201, { id: 79 }) }; return response(200, { id: 79, body: EXACT_HEAD_CODEX_REVIEW_BODY, user: { login: 'codex-bot' }, created_at: '2026-08-31T09:00:01.000Z' }) }
  const environment = await applyExactHeadCodexReviewTrigger(options(plan, payload, current, request, { githubCli: () => { throw new Error('keyring must not be read') }, nonce: () => 'b'.repeat(64) }))
  assert.deepEqual(environment.authentication, { source: 'environment', valueExposed: false })
  const wrongHost = () => ({ status: 0, stdout: '', stderr: 'Logged in to github.example account swanhtet01 (keyring)\nActive account: true' })
  await assert.rejects(applyExactHeadCodexReviewTrigger(options(plan, payload, current, request, { env: {}, githubCli: wrongHost })), /exact_head_codex_review_trigger_token_required/)
  const suffixedAccount = () => ({ status: 0, stdout: '', stderr: 'Logged in to github.com account swanhtet01-other (keyring)\nActive account: true' })
  await assert.rejects(applyExactHeadCodexReviewTrigger(options(plan, payload, current, request, { env: {}, githubCli: suffixedAccount })), /exact_head_codex_review_trigger_token_required/)
  const missingKeyring = () => ({ status: 0, stdout: '', stderr: 'Logged in to github.com account swanhtet01\nActive account: true\nkeyring' })
  await assert.rejects(applyExactHeadCodexReviewTrigger(options(plan, payload, current, request, { env: {}, githubCli: missingKeyring })), /exact_head_codex_review_trigger_token_required/)
  const mismatched = () => ({ status: 0, stdout: '', stderr: 'Logged in to github.com account another-user (keyring)\nActive account: true' })
  await assert.rejects(applyExactHeadCodexReviewTrigger(options(plan, payload, current, request, { env: {}, githubCli: mismatched })), /exact_head_codex_review_trigger_token_required/)
  const tokenFailure = (args) => args[1] === 'status' ? { status: 0, stdout: '', stderr: 'Logged in to github.com account swanhtet01 (keyring)\nActive account: true' } : { status: 1, stdout: '', stderr: 'failed' }
  await assert.rejects(applyExactHeadCodexReviewTrigger(options(plan, payload, current, request, { env: {}, githubCli: tokenFailure })), /exact_head_codex_review_trigger_token_required/)
  const emptyToken = (args) => args[1] === 'status' ? { status: 0, stdout: '', stderr: 'Logged in to github.com account swanhtet01 (keyring)\nActive account: true' } : { status: 0, stdout: '   ', stderr: '' }
  await assert.rejects(applyExactHeadCodexReviewTrigger(options(plan, payload, current, request, { env: {}, githubCli: emptyToken })), /exact_head_codex_review_trigger_token_required/)
  assert.equal(posts, 1, 'only the environment-authenticated success posts')
})

test('decline, stale or changed plan, and pre-post head/base/comment drift fail closed without a POST', async () => {
  const { plan, payload, current } = await fixture(); let posts = 0; const request = async () => { posts += 1; return response(201, { id: 1 }) }
  await assert.rejects(applyExactHeadCodexReviewTrigger(options(plan, payload, current, request, { confirmer: () => false })), /exact_head_codex_review_trigger_owner_declined/)
  await assert.rejects(applyExactHeadCodexReviewTrigger(options(plan, payload, current, request, { now: () => new Date('2026-08-31T09:10:00.000Z') })), /exact_head_codex_review_plan_expired/)
  const baseDrift = api({ pr: { ...current.pr, base: { ...current.pr.base, sha: 'd'.repeat(40) } } })
  await assert.rejects(applyExactHeadCodexReviewTrigger(options(plan, payload, baseDrift, request)), /exact_head_codex_review_trigger_state_drift/)
  const checkDrift = api({ checks: { check_runs: [{ id: 1, name: 'validate', status: 'completed', conclusion: 'neutral' }] } })
  await assert.rejects(applyExactHeadCodexReviewTrigger(options(plan, payload, checkDrift, request)), /exact_head_codex_review_trigger_state_drift/)
  const reviewDrift = api({ reviews: [{ id: 12, commit_id: head }] })
  await assert.rejects(applyExactHeadCodexReviewTrigger(options(plan, payload, reviewDrift, request)), /exact_head_codex_review_exists/)
  const duplicate = api({ comments: [{ id: 4, body: EXACT_HEAD_CODEX_REVIEW_BODY, created_at: '2026-08-31T08:05:00.000Z' }], timeline: [{ event: 'committed', sha: head }, { event: 'commented', id: 4 }] })
  await assert.rejects(applyExactHeadCodexReviewTrigger(options(plan, payload, duplicate, request)), /exact_head_codex_review_current_head_trigger_exists/)
  await assert.rejects(applyExactHeadCodexReviewTrigger(options({ ...plan, digest: `sha256:${'f'.repeat(64)}` }, payload, current, request)), /exact_head_codex_review_plan_digest_invalid/)
  assert.equal(posts, 0)
})

test('one-use receipt and indeterminate post never retry or falsely claim no write', async () => {
  const { plan, payload, current } = await fixture(); let posts = 0
  const unknown = async (_url, init) => { if (init.method === 'POST') { posts += 1; throw new Error('connection reset after request') } return response(200, {}) }
  let firstError
  try { await applyExactHeadCodexReviewTrigger(options(plan, payload, current, unknown, { nonce: () => '8'.repeat(64) })) } catch (error) { firstError = error }
  assert.match(String(firstError?.message), /exact_head_codex_review_trigger_write_outcome_unknown/)
  assert.equal(posts, 1)
  const receipt = buildExactHeadCodexReviewTriggerFailureReceipt(firstError)
  assert.equal(receipt.controls.githubWriteOutcome, 'outcome_unknown'); assert.equal(receipt.controls.githubWritesPerformed, null); assert.equal(receipt.controls.githubWriteRetryAllowed, false); assert.equal(receipt.controls.ownerApprovalReceiptConsumed, true)
  await assert.rejects(applyExactHeadCodexReviewTrigger(options(plan, payload, current, unknown, { nonce: () => '8'.repeat(64) })), /exact_head_codex_review_trigger_receipt_expired_or_consumed/)
  assert.equal(posts, 1, 'replay is rejected before another POST')
})

test('explicit pre-write 4xx is confirmed not performed and post-readback loss remains unknown', async () => {
  const first = await fixture(); let posts = 0
  await assert.rejects(applyExactHeadCodexReviewTrigger(options(first.plan, first.payload, first.current, async (_url, init) => { if (init.method === 'POST') { posts += 1; return response(422, {}) } return response(200, {}) }, { nonce: () => '7'.repeat(64) })), /exact_head_codex_review_trigger_post_failed:422/)
  assert.equal(posts, 1)
  const second = await fixture(); let reads = 0
  await assert.rejects(applyExactHeadCodexReviewTrigger(options(second.plan, second.payload, second.current, async (_url, init) => { if (init.method === 'POST') return response(201, { id: 88 }); reads += 1; throw new Error('response lost') }, { nonce: () => '6'.repeat(64) })), /exact_head_codex_review_trigger_write_outcome_unknown/)
  assert.equal(reads, 1)
})
