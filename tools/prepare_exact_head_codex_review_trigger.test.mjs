import assert from 'node:assert/strict'
import test from 'node:test'

import {
  EXACT_HEAD_CODEX_REVIEW_BODY,
  EXACT_HEAD_CODEX_REVIEW_PLAN_TTL_MS,
  collectExactHeadCodexReviewPlan,
  validateExactHeadCodexReviewPlan,
} from './prepare_exact_head_codex_review_trigger.mjs'

const head = 'a'.repeat(40)
const base = 'b'.repeat(40)
const tree = 'c'.repeat(40)
const now = new Date('2026-08-31T09:00:00.000Z')
const authority = { handoff: { candidate: head, fileDigest: `sha256:${'1'.repeat(64)}`, bodyDigest: `sha256:${'2'.repeat(64)}` }, protection: { healthy: true, fileDigest: `sha256:${'3'.repeat(64)}`, bodyDigest: `sha256:${'4'.repeat(64)}` } }
const gitState = { branch: 'codex/release-stack-integration-rehearsal-20260825', head, tree, origin: 'https://github.com/swanhtet01/swanhtet01.github.io.git', clean: true }
const tools = [{ path: 'tools/prepare_exact_head_codex_review_trigger.mjs', digest: `sha256:${'5'.repeat(64)}` }, { path: 'tools/apply_exact_head_codex_review_trigger.mjs', digest: `sha256:${'6'.repeat(64)}` }]

function state(overrides = {}) {
  return {
    pr: { number: 561, state: 'open', draft: false, updated_at: '2026-08-31T08:04:23.000Z', base: { sha: base, repo: { full_name: 'swanhtet01/swanhtet01.github.io' } }, head: { sha: head } },
    checks: { check_runs: [{ id: 1, name: 'validate', status: 'completed', conclusion: 'success' }] },
    reviews: [], comments: [], ...overrides,
  }
}
function fetcher(value) { return async (path) => path.startsWith('/pulls/') && path.endsWith('/reviews?per_page=100') ? value.reviews : path.startsWith('/issues/') ? value.comments : path.startsWith('/commits/') ? value.checks : value.pr }
async function plan(value = state()) { return collectExactHeadCodexReviewPlan({ authority, fetchJson: fetcher(value), gitState, now, toolDigests: Promise.resolve(tools) }) }

test('plan is read-only, digest-bound, exact-head, and hard-codes the sole comment body', async () => {
  const packet = await plan()
  assert.equal(packet.ok, true)
  assert.equal(packet.action.body, EXACT_HEAD_CODEX_REVIEW_BODY)
  assert.equal(packet.readiness.executeReady, false)
  assert.equal(packet.controls.githubWritesPerformed, false)
  assert.equal(packet.controls.issueCommentPosted, false)
  assert.equal(packet.observed.currentHeadTriggerCount, 0)
  assert.equal(validateExactHeadCodexReviewPlan(packet, { now }), packet)
})

test('plan fails closed for a current-head trigger, head/base/check/review drift, and stale or changed packets', async () => {
  await assert.rejects(plan(state({ comments: [{ id: 44, body: EXACT_HEAD_CODEX_REVIEW_BODY, created_at: '2026-08-31T08:05:00.000Z' }] })), /exact_head_codex_review_current_head_trigger_exists/)
  await assert.rejects(plan(state({ checks: { check_runs: [{ id: 1, name: 'validate', status: 'in_progress', conclusion: null }] } })), /exact_head_codex_review_checks_not_terminal_green/)
  await assert.rejects(plan(state({ checks: { check_runs: [{ id: 1, name: 'Codex review', status: 'completed', conclusion: 'success' }] } })), /exact_head_codex_review_named_check_exists/)
  await assert.rejects(plan(state({ reviews: [{ id: 9, commit_id: head }] })), /exact_head_codex_review_exists/)
  const packet = await plan()
  assert.throws(() => validateExactHeadCodexReviewPlan({ ...packet, pullRequest: { ...packet.pullRequest, base: 'd'.repeat(40) } }, { now }), /exact_head_codex_review_plan_digest_invalid/)
  assert.throws(() => validateExactHeadCodexReviewPlan(packet, { now: new Date(now.getTime() + EXACT_HEAD_CODEX_REVIEW_PLAN_TTL_MS) }), /exact_head_codex_review_plan_expired/)
})

test('plan rejects non-canonical local state and malformed authority without exposing credentials', async () => {
  await assert.rejects(collectExactHeadCodexReviewPlan({ authority, fetchJson: fetcher(state()), gitState: { ...gitState, clean: false }, now, toolDigests: Promise.resolve(tools) }), /exact_head_codex_review_local_state_invalid/)
  await assert.rejects(collectExactHeadCodexReviewPlan({ authority: { ...authority, protection: { ...authority.protection, healthy: false } }, fetchJson: fetcher(state()), gitState, now, toolDigests: Promise.resolve(tools) }), /exact_head_codex_review_authority_invalid/)
})
