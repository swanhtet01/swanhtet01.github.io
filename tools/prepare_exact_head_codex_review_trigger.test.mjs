import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  EXACT_HEAD_CODEX_REVIEW_BODY,
  EXACT_HEAD_CODEX_REVIEW_PLAN_TTL_MS,
  collectExactHeadCodexReviewPlan,
  fetchGitHubJson,
  main,
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
function response(status, json, link = null) { return { ok: status >= 200 && status < 300, status, headers: { get: (name) => name.toLowerCase() === 'link' ? link : null }, async json() { return json } } }
function digest(value) { return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}` }
function sealed(body) { return { ...body, digest: digest(JSON.stringify(body)) } }

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

test('default GitHub collector exhausts later pages before accepting checks, reviews, or prior triggers', async () => {
  const originalFetch = globalThis.fetch
  const link = (path) => `<https://api.github.com/repos/swanhtet01/swanhtet01.github.io${path}?per_page=100&page=2>; rel="next"`
  const oldComments = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, body: EXACT_HEAD_CODEX_REVIEW_BODY, created_at: '2026-08-30T20:00:00.000Z' }))
  const oldReviews = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, commit_id: 'd'.repeat(40) }))
  const greenChecks = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, name: `check-${index}`, status: 'completed', conclusion: 'success' }))
  async function expectLatePageFailure(kind, code) {
    globalThis.fetch = async (url) => {
      const parsed = new URL(String(url)); const page = parsed.searchParams.get('page'); const path = parsed.pathname
      if (path.endsWith('/pulls/561')) return response(200, state().pr)
      if (path.includes('/check-runs')) return response(200, { check_runs: kind === 'checks' && page === '2' ? [{ id: 300, name: 'check-late', status: 'completed', conclusion: 'failure' }] : kind === 'checks' ? greenChecks : state().checks.check_runs }, kind === 'checks' && !page ? link('/commits/' + head + '/check-runs') : null)
      if (path.endsWith('/reviews')) return response(200, kind === 'reviews' && page === '2' ? [{ id: 300, commit_id: head }] : kind === 'reviews' ? oldReviews : [], kind === 'reviews' && !page ? link('/pulls/561/reviews') : null)
      if (path.endsWith('/comments')) return response(200, kind === 'comments' && page === '2' ? [{ id: 300, body: EXACT_HEAD_CODEX_REVIEW_BODY, created_at: '2026-08-31T08:05:00.000Z' }] : kind === 'comments' ? oldComments : [], kind === 'comments' && !page ? link('/issues/561/comments') : null)
      throw new Error(`unexpected path ${path}`)
    }
    await assert.rejects(collectExactHeadCodexReviewPlan({ authority, fetchJson: fetchGitHubJson, gitState, now, toolDigests: Promise.resolve(tools) }), code)
  }
  try {
    await expectLatePageFailure('checks', /exact_head_codex_review_checks_not_terminal_green/)
    await expectLatePageFailure('reviews', /exact_head_codex_review_exists/)
    await expectLatePageFailure('comments', /exact_head_codex_review_current_head_trigger_exists/)
  } finally { globalThis.fetch = originalFetch }
})

test('CLI main uses the exhaustive GET-only collector to write an exact no-write plan', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'supermega-exact-head-codex-review-'))
  const handoffPath = join(directory, 'handoff.json')
  const protectionPath = join(directory, 'protection.json')
  const outputPath = join(directory, 'plan.json')
  const handoff = sealed({ contract: 'supermega.release-handoff.v2', repository: 'swanhtet01/swanhtet01.github.io', candidate: { commit: head, clean: true }, verification: { passed: true, verifiedCommit: head }, authority: { pushApproved: false, mergeApproved: false, workflowDispatchApproved: false, deploymentApproved: false, domainChangeApproved: false, providerMutationApproved: false, remoteWritesPerformed: false, providerWritesPerformed: false, credentialValuesInspected: false } })
  const protection = sealed({ contract: 'supermega.github-main-protection-snapshot.v1', repository: 'swanhtet01/swanhtet01.github.io', assessment: { ok: true, failures: [] }, controls: { githubApiMethods: ['GET'], githubWritesPerformed: false, repositorySettingsMutated: false, branchMutated: false, pullRequestCreated: false, mergePerformed: false, deploymentPerformed: false, supabaseMutated: false, credentialValueExposed: false } })
  await writeFile(handoffPath, JSON.stringify(handoff), 'utf8')
  await writeFile(protectionPath, JSON.stringify(protection), 'utf8')
  const originalFetch = globalThis.fetch
  const calls = []
  const link = (path) => `<https://api.github.com/repos/swanhtet01/swanhtet01.github.io${path}?per_page=100&page=2>; rel="next"`
  const greenChecks = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, name: `check-${index}`, status: 'completed', conclusion: 'success' }))
  const oldReviews = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, commit_id: 'd'.repeat(40) }))
  const oldComments = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, body: EXACT_HEAD_CODEX_REVIEW_BODY, created_at: '2026-08-30T20:00:00.000Z' }))
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url)); const path = parsed.pathname; const page = parsed.searchParams.get('page')
    calls.push(path)
    if (path.endsWith('/pulls/561')) return response(200, state().pr)
    if (path.includes('/check-runs')) return response(200, page === '2' ? state().checks : { check_runs: greenChecks }, page ? null : link(`/commits/${head}/check-runs`))
    if (path.endsWith('/reviews')) return response(200, page === '2' ? [] : oldReviews, page ? null : link('/pulls/561/reviews'))
    if (path.endsWith('/comments')) return response(200, page === '2' ? [] : oldComments, page ? null : link('/issues/561/comments'))
    throw new Error(`unexpected path ${path}`)
  }
  try {
    await main(['--pr', '561', '--handoff', handoffPath, '--protection', protectionPath, '--output', outputPath], { gitState, now, toolDigests: Promise.resolve(tools) })
    const output = JSON.parse(await readFile(outputPath, 'utf8'))
    assert.equal(output.action.body, EXACT_HEAD_CODEX_REVIEW_BODY)
    assert.equal(output.pullRequest.head, head)
    assert.equal(output.controls.githubWritesPerformed, false)
    assert.equal(output.observed.exactHeadChecks.length, 101)
    assert.equal(output.observed.codexReviewComments.length, 100)
    assert.equal(calls.filter((path) => path.includes('/check-runs')).length, 2)
    assert.equal(calls.filter((path) => path.endsWith('/reviews')).length, 2)
    assert.equal(calls.filter((path) => path.endsWith('/comments')).length, 2)
  } finally {
    globalThis.fetch = originalFetch
    await rm(directory, { recursive: true, force: true })
  }
})
