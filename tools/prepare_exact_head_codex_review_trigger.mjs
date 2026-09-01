#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const EXACT_HEAD_CODEX_REVIEW_TRIGGER_PLAN_CONTRACT = 'supermega.exact-head-codex-review-trigger-plan.v1'
export const EXACT_HEAD_CODEX_REVIEW_BODY = '@codex review'
export const EXACT_HEAD_CODEX_REVIEW_PLAN_TTL_MS = 10 * 60 * 1000
export const EXACT_HEAD_CODEX_REVIEW_REPOSITORY = 'swanhtet01/swanhtet01.github.io'
export const EXACT_HEAD_CODEX_REVIEW_ORIGIN = `https://github.com/${EXACT_HEAD_CODEX_REVIEW_REPOSITORY}.git`

const root = resolve(import.meta.dirname, '..')
const API_BASE = `https://api.github.com/repos/${EXACT_HEAD_CODEX_REVIEW_REPOSITORY}`
const SHA = /^[0-9a-f]{40}$/
const DIGEST = /^sha256:[0-9a-f]{64}$/
const MAX_FILE_BYTES = 1_000_000
const ACCEPTED_CHECK_CONCLUSIONS = new Set(['success', 'neutral', 'skipped'])
const CANONICAL_BRANCH = 'codex/release-stack-integration-rehearsal-20260825'
const TOOL_PATHS = ['tools/prepare_exact_head_codex_review_trigger.mjs', 'tools/apply_exact_head_codex_review_trigger.mjs']
const CONTROL_FALSE_KEYS = ['githubWriteAttempted', 'githubWritesPerformed', 'issueCommentPosted', 'ownerApprovalReceiptConsumed', 'reviewerRequested', 'pullRequestMutated', 'workflowDispatched', 'repositorySettingsMutated', 'mergePerformed', 'deploymentPerformed', 'providerMutated', 'credentialValueExposed']

function fail(code) { throw new Error(code) }
function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function compactDigest(value) { return `sha256:${createHash('sha256').update(String(value || '').replace(/\r\n?/g, '\n')).digest('hex')}` }
function signed(body) { return { ...body, digest: compactDigest(JSON.stringify(body)) } }
function exactSha(value, code) { const normalized = String(value || '').trim().toLowerCase(); if (!SHA.test(normalized)) fail(code); return normalized }
function exactNumber(value, code) { const number = Number(value); if (!Number.isSafeInteger(number) || number < 1) fail(code); return number }
function exactDate(value, code) { const text = String(value || ''); const canonical = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(text) ? text.replace('Z', '.000Z') : text; const date = new Date(canonical); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(text) || !Number.isFinite(date.getTime()) || date.toISOString() !== canonical) fail(code); return date }
function noSecrets(value) { if (/Bearer\s+[A-Za-z0-9._-]+|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|https?:\/\/[^\s"']+:[^\s"']+@/i.test(JSON.stringify(value))) fail('exact_head_codex_review_secret_echo') }

export function sourceToolDigests(read = (path) => readFile(path, 'utf8')) {
  return Promise.all(TOOL_PATHS.map(async (path) => ({ path, digest: compactDigest(await read(resolve(root, path))) })))
}

export function localGitState(git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' } })) {
  const read = (args, code) => { const result = git(args); if (result?.error || result?.status !== 0) fail(code); return String(result.stdout || '').trim() }
  return { branch: read(['symbolic-ref', '--short', 'HEAD'], 'exact_head_codex_review_git_branch_failed'), head: exactSha(read(['rev-parse', 'HEAD'], 'exact_head_codex_review_git_head_failed'), 'exact_head_codex_review_git_head_invalid'), tree: exactSha(read(['show', '-s', '--format=%T', 'HEAD'], 'exact_head_codex_review_git_tree_failed'), 'exact_head_codex_review_git_tree_invalid'), origin: read(['remote', 'get-url', 'origin'], 'exact_head_codex_review_git_origin_failed'), clean: read(['status', '--porcelain=v1'], 'exact_head_codex_review_git_status_failed') === '' }
}

function normaliseTimelineBinding(value, head, codexReviewComments) {
  if (!record(value) || value.headCommit !== head || !Number.isSafeInteger(value.headCommitOrdinal) || value.headCommitOrdinal < 1 || !Number.isSafeInteger(value.eventCount) || value.eventCount < value.headCommitOrdinal || !Array.isArray(value.codexReviewCommentRelations)) fail('exact_head_codex_review_head_timeline_invalid')
  const relations = value.codexReviewCommentRelations.map((entry) => ({ id: exactNumber(entry?.id, 'exact_head_codex_review_head_timeline_invalid'), afterHead: entry?.afterHead === true ? true : entry?.afterHead === false ? false : fail('exact_head_codex_review_head_timeline_invalid') }))
  if (new Set(relations.map((entry) => entry.id)).size !== relations.length || JSON.stringify(relations.map((entry) => entry.id)) !== JSON.stringify(codexReviewComments.map((comment) => comment.id))) fail('exact_head_codex_review_head_timeline_invalid')
  return { headCommit: head, headCommitOrdinal: value.headCommitOrdinal, eventCount: value.eventCount, codexReviewCommentRelations: relations }
}

function timelineBinding(timeline, head, codexReviewComments) {
  if (!Array.isArray(timeline) || !timeline.length) fail('exact_head_codex_review_head_timeline_invalid')
  const headPositions = []
  const commitPositions = []
  const commentPositions = new Map()
  timeline.forEach((entry, index) => {
    if (!record(entry) || !String(entry.event || '')) fail('exact_head_codex_review_head_timeline_invalid')
    if (entry.event === 'committed') {
      const commit = exactSha(entry.sha, 'exact_head_codex_review_head_timeline_invalid')
      commitPositions.push(index)
      if (commit === head) headPositions.push(index)
    }
    if (entry.event === 'commented') {
      const id = exactNumber(entry.id, 'exact_head_codex_review_head_timeline_invalid')
      if (commentPositions.has(id)) fail('exact_head_codex_review_head_timeline_invalid')
      commentPositions.set(id, index)
    }
  })
  if (headPositions.length !== 1) fail('exact_head_codex_review_head_timeline_invalid')
  const headPosition = headPositions[0]
  if (commitPositions.at(-1) !== headPosition) fail('exact_head_codex_review_head_timeline_invalid')
  const relations = codexReviewComments.map((comment) => {
    if (!commentPositions.has(comment.id)) fail('exact_head_codex_review_head_timeline_invalid')
    return { id: comment.id, afterHead: commentPositions.get(comment.id) > headPosition }
  })
  return normaliseTimelineBinding({ headCommit: head, headCommitOrdinal: headPosition + 1, eventCount: timeline.length, codexReviewCommentRelations: relations }, head, codexReviewComments)
}

function normaliseState({ pr, checks, reviews, comments, timeline = null, headTimeline = null }) {
  if (!record(pr) || pr.base?.repo?.full_name !== EXACT_HEAD_CODEX_REVIEW_REPOSITORY || pr.state !== 'open' || pr.draft !== false) fail('exact_head_codex_review_pr_invalid')
  const number = exactNumber(pr.number, 'exact_head_codex_review_pr_invalid')
  const base = exactSha(pr.base?.sha, 'exact_head_codex_review_base_invalid')
  const head = exactSha(pr.head?.sha, 'exact_head_codex_review_head_invalid')
  const updatedAt = exactDate(pr.updated_at, 'exact_head_codex_review_pr_updated_at_invalid').toISOString()
  if (!Array.isArray(checks?.check_runs) || !Array.isArray(reviews) || !Array.isArray(comments) || (timeline === null && headTimeline === null)) fail('exact_head_codex_review_api_shape_invalid')
  const exactChecks = checks.check_runs.map((check) => ({ id: exactNumber(check?.id, 'exact_head_codex_review_check_invalid'), name: String(check?.name || ''), status: String(check?.status || ''), conclusion: check?.conclusion === null ? null : String(check?.conclusion || '') })).sort((left, right) => left.id - right.id)
  if (!exactChecks.length) fail('exact_head_codex_review_checks_missing')
  if (exactChecks.some((check) => !check.name || check.status !== 'completed' || !ACCEPTED_CHECK_CONCLUSIONS.has(check.conclusion))) fail('exact_head_codex_review_checks_not_terminal_green')
  const reviewNamedChecks = exactChecks.filter((check) => /(?:^|[^a-z])(?:codex|review)(?:$|[^a-z])/i.test(check.name))
  if (reviewNamedChecks.length) fail('exact_head_codex_review_named_check_exists')
  const exactHeadReviews = reviews.filter((review) => String(review?.commit_id || '').toLowerCase() === head).map((review) => exactNumber(review?.id, 'exact_head_codex_review_review_invalid'))
  if (exactHeadReviews.length) fail('exact_head_codex_review_exists')
  const codexReviewComments = comments.filter((comment) => String(comment?.body || '').trim() === EXACT_HEAD_CODEX_REVIEW_BODY).map((comment) => ({ id: exactNumber(comment?.id, 'exact_head_codex_review_comment_invalid'), createdAt: exactDate(comment?.created_at, 'exact_head_codex_review_comment_invalid').toISOString() })).sort((left, right) => left.id - right.id)
  const acceptedHeadTimeline = timeline === null ? normaliseTimelineBinding(headTimeline, head, codexReviewComments) : timelineBinding(timeline, head, codexReviewComments)
  const currentIds = new Set(acceptedHeadTimeline.codexReviewCommentRelations.filter((entry) => entry.afterHead).map((entry) => entry.id))
  const currentHeadTriggers = codexReviewComments.filter((comment) => currentIds.has(comment.id))
  if (currentHeadTriggers.length) fail('exact_head_codex_review_current_head_trigger_exists')
  return { number, base, head, updatedAt, checks: exactChecks, reviewNamedChecks, exactHeadReviews, codexReviewComments, currentHeadTriggers, headTimeline: acceptedHeadTimeline }
}

function validateAuthority(authority, head) {
  if (!record(authority) || authority.handoff?.candidate !== head || !DIGEST.test(String(authority.handoff?.fileDigest || '')) || !DIGEST.test(String(authority.handoff?.bodyDigest || '')) || authority.protection?.healthy !== true || !DIGEST.test(String(authority.protection?.fileDigest || '')) || !DIGEST.test(String(authority.protection?.bodyDigest || ''))) fail('exact_head_codex_review_authority_invalid')
  return authority
}

export async function collectExactHeadCodexReviewPlan({ prNumber = 561, authority, fetchJson, gitState = localGitState(), now = new Date(), toolDigests = sourceToolDigests() } = {}) {
  const number = exactNumber(prNumber, 'exact_head_codex_review_pr_invalid')
  if (typeof fetchJson !== 'function') fail('exact_head_codex_review_fetch_required')
  if (!gitState.clean || gitState.branch !== CANONICAL_BRANCH || gitState.origin !== EXACT_HEAD_CODEX_REVIEW_ORIGIN) fail('exact_head_codex_review_local_state_invalid')
  const pr = await fetchJson(`/pulls/${number}`)
  const head = exactSha(pr?.head?.sha, 'exact_head_codex_review_head_invalid')
  const [checks, reviews, comments, timeline, resolvedToolDigests] = await Promise.all([fetchJson(`/commits/${head}/check-runs?per_page=100&filter=latest`), fetchJson(`/pulls/${number}/reviews?per_page=100`), fetchJson(`/issues/${number}/comments?per_page=100`), fetchJson(`/issues/${number}/timeline?per_page=100`), toolDigests])
  const observed = normaliseState({ pr, checks, reviews, comments, timeline })
  if (gitState.head !== observed.head) fail('exact_head_codex_review_local_head_mismatch')
  const acceptedAuthority = validateAuthority(authority, observed.head)
  const generatedAt = exactDate(now instanceof Date ? now.toISOString() : now, 'exact_head_codex_review_time_invalid')
  const expiresAt = new Date(generatedAt.getTime() + EXACT_HEAD_CODEX_REVIEW_PLAN_TTL_MS).toISOString()
  const body = {
    ok: true, contract: EXACT_HEAD_CODEX_REVIEW_TRIGGER_PLAN_CONTRACT, digestScope: 'utf8_compact_json_without_digest', mode: 'plan_only_no_github_write', generatedAt: generatedAt.toISOString(), expiresAt,
    repository: EXACT_HEAD_CODEX_REVIEW_REPOSITORY, origin: EXACT_HEAD_CODEX_REVIEW_ORIGIN,
    pullRequest: { number: observed.number, state: 'open', draft: false, base: observed.base, head: observed.head, headUpdatedAt: observed.updatedAt },
    local: { branch: gitState.branch, head: gitState.head, tree: gitState.tree, clean: true, origin: gitState.origin },
    authority: acceptedAuthority,
    observed: { exactHeadChecks: observed.checks, exactHeadReviews: observed.exactHeadReviews, reviewNamedChecks: observed.reviewNamedChecks, codexReviewComments: observed.codexReviewComments, headTimeline: observed.headTimeline, currentHeadTriggerCount: 0 },
    action: { kind: 'exact_head_codex_review_issue_comment', method: 'POST', path: `/repos/${EXACT_HEAD_CODEX_REVIEW_REPOSITORY}/issues/${observed.number}/comments`, body: EXACT_HEAD_CODEX_REVIEW_BODY, exactHead: observed.head, reviewerRequestIncluded: false, pullRequestEditIncluded: false },
    sourceToolDigests: resolvedToolDigests,
    readiness: { blockers: [], executeReady: false, ownerApprovalRequired: true },
    controls: { githubWriteAttempted: false, githubWritesPerformed: false, githubWriteOutcome: 'confirmed_not_performed', githubWriteRetryAllowed: false, issueCommentPosted: false, ownerApprovalReceiptConsumed: false, reviewerRequested: false, pullRequestMutated: false, workflowDispatched: false, repositorySettingsMutated: false, mergePerformed: false, deploymentPerformed: false, providerMutated: false, credentialValueExposed: false },
  }
  noSecrets(body)
  return signed(body)
}

export function validateExactHeadCodexReviewPlan(packet, { now = new Date() } = {}) {
  if (!record(packet)) fail('exact_head_codex_review_plan_invalid')
  const { digest: actualDigest, ...body } = packet
  if (!DIGEST.test(String(actualDigest || '')) || actualDigest !== compactDigest(JSON.stringify(body))) fail('exact_head_codex_review_plan_digest_invalid')
  if (packet.ok !== true || packet.contract !== EXACT_HEAD_CODEX_REVIEW_TRIGGER_PLAN_CONTRACT || packet.digestScope !== 'utf8_compact_json_without_digest' || packet.mode !== 'plan_only_no_github_write' || packet.repository !== EXACT_HEAD_CODEX_REVIEW_REPOSITORY || packet.origin !== EXACT_HEAD_CODEX_REVIEW_ORIGIN || packet.action?.body !== EXACT_HEAD_CODEX_REVIEW_BODY || packet.action?.method !== 'POST' || packet.action?.path !== `/repos/${EXACT_HEAD_CODEX_REVIEW_REPOSITORY}/issues/${packet.pullRequest?.number}/comments` || packet.action?.exactHead !== packet.pullRequest?.head || packet.action?.reviewerRequestIncluded !== false || packet.action?.pullRequestEditIncluded !== false) fail('exact_head_codex_review_plan_invalid')
  const expires = exactDate(packet.expiresAt, 'exact_head_codex_review_plan_expiry_invalid'); const current = now instanceof Date ? now.getTime() : new Date(now).getTime(); if (!Number.isFinite(current) || current >= expires.getTime()) fail('exact_head_codex_review_plan_expired')
  normaliseState({ pr: { number: packet.pullRequest?.number, state: packet.pullRequest?.state, draft: packet.pullRequest?.draft, base: { repo: { full_name: packet.repository }, sha: packet.pullRequest?.base }, head: { sha: packet.pullRequest?.head }, updated_at: packet.pullRequest?.headUpdatedAt }, checks: { check_runs: packet.observed?.exactHeadChecks }, reviews: packet.observed?.exactHeadReviews.map((id) => ({ id, commit_id: packet.pullRequest?.head })) || [], comments: packet.observed?.codexReviewComments.map((comment) => ({ ...comment, body: EXACT_HEAD_CODEX_REVIEW_BODY, created_at: comment.createdAt })) || [], headTimeline: packet.observed?.headTimeline })
  validateAuthority(packet.authority, packet.pullRequest?.head)
  if (!packet.local?.clean || packet.local?.branch !== CANONICAL_BRANCH || packet.local?.origin !== EXACT_HEAD_CODEX_REVIEW_ORIGIN || packet.local?.head !== packet.pullRequest?.head || !SHA.test(String(packet.local?.tree || '')) || !Array.isArray(packet.sourceToolDigests) || packet.sourceToolDigests.length !== TOOL_PATHS.length || packet.sourceToolDigests.some((entry, index) => entry?.path !== TOOL_PATHS[index] || !DIGEST.test(String(entry?.digest || ''))) || packet.readiness?.executeReady !== false || packet.readiness?.ownerApprovalRequired !== true || packet.readiness?.blockers?.length !== 0 || packet.controls?.githubWriteOutcome !== 'confirmed_not_performed' || packet.controls?.githubWriteRetryAllowed !== false || CONTROL_FALSE_KEYS.some((key) => packet.controls?.[key] !== false) || Object.keys(packet.controls || {}).length !== CONTROL_FALSE_KEYS.length + 2) fail('exact_head_codex_review_plan_controls_invalid')
  noSecrets(packet)
  return packet
}

export async function readExactHeadCodexReviewPlan(path, { now = new Date() } = {}) {
  const absolute = resolve(path || ''); const payload = await readFile(absolute, 'utf8'); if (Buffer.byteLength(payload, 'utf8') < 1 || Buffer.byteLength(payload, 'utf8') > MAX_FILE_BYTES) fail('exact_head_codex_review_plan_file_invalid')
  let packet; try { packet = JSON.parse(payload) } catch { fail('exact_head_codex_review_plan_file_invalid') }
  return { path: absolute, payload, fileDigest: compactDigest(payload), packet: validateExactHeadCodexReviewPlan(packet, { now }) }
}

async function readAuthority(path, kind) {
  const payload = await readFile(resolve(path || ''), 'utf8'); let packet; try { packet = JSON.parse(payload) } catch { fail(`exact_head_codex_review_${kind}_file_invalid`) }
  const { digest: bodyDigest, ...body } = packet
  if (!DIGEST.test(String(bodyDigest || '')) || bodyDigest !== compactDigest(JSON.stringify(body))) fail(`exact_head_codex_review_${kind}_digest_invalid`)
  return { fileDigest: compactDigest(payload), bodyDigest, packet }
}

function assertAuthorityPackets(handoff, protection) {
  const handoffPacket = handoff?.packet
  const protectionPacket = protection?.packet
  if (handoffPacket?.contract !== 'supermega.release-handoff.v2'
    || handoffPacket?.repository !== EXACT_HEAD_CODEX_REVIEW_REPOSITORY
    || !SHA.test(String(handoffPacket?.candidate?.commit || ''))
    || handoffPacket?.candidate?.clean !== true
    || handoffPacket?.verification?.passed !== true
    || handoffPacket?.verification?.verifiedCommit !== handoffPacket.candidate.commit
    || !record(handoffPacket?.authority)
    || Object.values(handoffPacket.authority).some((value) => value !== false)) {
    fail('exact_head_codex_review_handoff_authority_invalid')
  }
  if (protectionPacket?.contract !== 'supermega.github-main-protection-snapshot.v1'
    || protectionPacket?.repository !== EXACT_HEAD_CODEX_REVIEW_REPOSITORY
    || protectionPacket?.assessment?.ok !== true
    || !Array.isArray(protectionPacket?.assessment?.failures)
    || protectionPacket.assessment.failures.length !== 0
    || JSON.stringify(protectionPacket?.controls?.githubApiMethods) !== JSON.stringify(['GET'])
    || ['githubWritesPerformed', 'repositorySettingsMutated', 'branchMutated', 'pullRequestCreated', 'mergePerformed', 'deploymentPerformed', 'supabaseMutated', 'credentialValueExposed'].some((key) => protectionPacket.controls?.[key] !== false)) {
    fail('exact_head_codex_review_protection_authority_invalid')
  }
}

function nextPagePath(response, currentPath, itemCount) {
  const link = response.headers?.get?.('link') || null
  if (!link) { if (itemCount >= 100) fail('exact_head_codex_review_pagination_incomplete'); return null }
  const match = link.split(',').map((entry) => entry.trim()).map((entry) => /^<([^>]+)>;\s*rel="next"$/.exec(entry)).find(Boolean)
  if (!match) { if (itemCount >= 100) fail('exact_head_codex_review_pagination_incomplete'); return null }
  let next; try { next = new URL(match[1]) } catch { fail('exact_head_codex_review_pagination_invalid') }
  const expected = new URL(API_BASE)
  if (next.origin !== expected.origin || !next.pathname.startsWith(expected.pathname) || next.href === new URL(`${API_BASE}${currentPath}`).href) fail('exact_head_codex_review_pagination_invalid')
  return `${next.pathname.slice(expected.pathname.length)}${next.search}`
}

async function fetchGitHubResponse(path) {
  const response = await fetch(`${API_BASE}${path}`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'supermega-exact-head-codex-review-plan' } })
  if (!response.ok) fail(`exact_head_codex_review_read_failed:${response.status}`)
  try { return { response, json: await response.json() } } catch { fail('exact_head_codex_review_read_json_invalid') }
}

async function fetchAllPages(path, select) {
  let next = path; const pages = []
  for (let page = 0; next && page < 100; page += 1) {
    const current = next; const { response, json } = await fetchGitHubResponse(current); const items = select(json)
    if (!Array.isArray(items)) fail('exact_head_codex_review_pagination_shape_invalid')
    pages.push(...items); next = nextPagePath(response, current, items.length)
  }
  if (next) fail('exact_head_codex_review_pagination_limit_exceeded')
  return pages
}

export async function fetchGitHubJson(path) {
  if (/\/check-runs(?:\?|$)/.test(path)) return { check_runs: await fetchAllPages(path, (json) => json?.check_runs) }
  if (/\/(?:reviews|comments|timeline)(?:\?|$)/.test(path)) return fetchAllPages(path, (json) => json)
  return (await fetchGitHubResponse(path)).json
}

function parseArgs(argv) { const args = [...argv]; const options = { pr: 561, handoff: null, protection: null, output: null, verify: null, selfTest: false }; while (args.length) { const arg = args.shift(); if (arg === '--pr' && args[0]) options.pr = exactNumber(args.shift(), 'exact_head_codex_review_pr_invalid'); else if (arg === '--handoff' && args[0]) options.handoff = args.shift(); else if (arg === '--protection' && args[0]) options.protection = args.shift(); else if (arg === '--output' && args[0]) options.output = args.shift(); else if (arg === '--verify' && args[0]) options.verify = args.shift(); else if (arg === '--self-test') options.selfTest = true; else fail('exact_head_codex_review_plan_usage_invalid') } if (options.selfTest && (options.output || options.verify || options.handoff || options.protection)) fail('exact_head_codex_review_plan_usage_invalid'); if (!options.selfTest && !options.verify && (!options.handoff || !options.protection || !options.output)) fail('exact_head_codex_review_plan_inputs_required'); return options }

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseArgs(argv)
  if (options.selfTest) { console.log(JSON.stringify({ ok: true, contract: `${EXACT_HEAD_CODEX_REVIEW_TRIGGER_PLAN_CONTRACT}.self-test`, githubWritesPerformed: false }, null, 2)); return }
  if (options.verify) { const receipt = await readExactHeadCodexReviewPlan(options.verify); console.log(JSON.stringify({ ok: true, contract: receipt.packet.contract, path: receipt.path, fileDigest: receipt.fileDigest, digest: receipt.packet.digest, githubWritesPerformed: false }, null, 2)); return }
  const [handoff, protection] = await Promise.all([readAuthority(options.handoff, 'handoff'), readAuthority(options.protection, 'protection')])
  assertAuthorityPackets(handoff, protection)
  const candidate = handoff.packet?.candidate?.commit
  const plan = await collectExactHeadCodexReviewPlan({ ...dependencies, prNumber: options.pr, fetchJson: fetchGitHubJson, authority: { handoff: { candidate, fileDigest: handoff.fileDigest, bodyDigest: handoff.bodyDigest }, protection: { healthy: protection.packet?.assessment?.ok === true && Array.isArray(protection.packet?.assessment?.failures) && protection.packet.assessment.failures.length === 0, fileDigest: protection.fileDigest, bodyDigest: protection.bodyDigest } } })
  const output = resolve(options.output); await mkdir(dirname(output), { recursive: true }); await writeFile(output, `${JSON.stringify(plan, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' }); console.log(JSON.stringify({ ok: true, contract: plan.contract, output, fileDigest: compactDigest(await readFile(output, 'utf8')), digest: plan.digest, githubWritesPerformed: false }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(JSON.stringify({ ok: false, contract: EXACT_HEAD_CODEX_REVIEW_TRIGGER_PLAN_CONTRACT, error: String(error?.message || 'exact_head_codex_review_plan_failed'), controls: { githubWritesPerformed: false, issueCommentPosted: false, credentialValueExposed: false } }, null, 2)); process.exitCode = 1 })
