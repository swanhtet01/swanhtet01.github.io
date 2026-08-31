#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  EXACT_HEAD_CODEX_REVIEW_BODY,
  EXACT_HEAD_CODEX_REVIEW_ORIGIN,
  EXACT_HEAD_CODEX_REVIEW_PLAN_TTL_MS,
  EXACT_HEAD_CODEX_REVIEW_REPOSITORY,
  collectExactHeadCodexReviewPlan,
  fetchGitHubJson,
  localGitState,
  readExactHeadCodexReviewPlan,
  sourceToolDigests,
  validateExactHeadCodexReviewPlan,
} from './prepare_exact_head_codex_review_trigger.mjs'

export const EXACT_HEAD_CODEX_REVIEW_TRIGGER_APPLY_CONTRACT = 'supermega.exact-head-codex-review-trigger-apply.v1'

const root = resolve(import.meta.dirname, '..')
const API_BASE = `https://api.github.com/repos/${EXACT_HEAD_CODEX_REVIEW_REPOSITORY}`
const DIGEST = /^sha256:[0-9a-f]{64}$/
const consumedReceipts = new Set()
const WRITE_CONFIRMED_PERFORMED = 'confirmed_performed'
const WRITE_CONFIRMED_NOT_PERFORMED = 'confirmed_not_performed'
const WRITE_OUTCOME_UNKNOWN = 'outcome_unknown'

function fail(code) { throw new Error(code) }
function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function compactDigest(value) { return `sha256:${createHash('sha256').update(String(value || '').replace(/\r\n?/g, '\n')).digest('hex')}` }
function signed(body) { return { ...body, digest: compactDigest(JSON.stringify(body)) } }
function safe(error) { const code = String(error?.message || 'exact_head_codex_review_trigger_failed'); return /^[a-z0-9_:-]{1,240}$/.test(code) ? code : 'exact_head_codex_review_trigger_failed' }
function writeControls({ attempted, outcome }) { const performed = { [WRITE_CONFIRMED_PERFORMED]: true, [WRITE_CONFIRMED_NOT_PERFORMED]: false, [WRITE_OUTCOME_UNKNOWN]: null }[outcome]; if (performed === undefined || (!attempted && outcome !== WRITE_CONFIRMED_NOT_PERFORMED)) fail('exact_head_codex_review_trigger_outcome_invalid'); return { githubWriteAttempted: attempted, githubWritesPerformed: performed, githubWriteOutcome: outcome, githubWriteRetryAllowed: false, issueCommentPosted: performed } }
function writeFailure(code, attempted, outcome, consumed = false) { const error = new Error(code); error.writeOutcome = { attempted, outcome, consumed }; return error }

export function buildExactHeadCodexReviewTriggerFailureReceipt(error) {
  const state = record(error?.writeOutcome) ? error.writeOutcome : { attempted: false, outcome: WRITE_CONFIRMED_NOT_PERFORMED, consumed: false }
  return { ok: false, contract: EXACT_HEAD_CODEX_REVIEW_TRIGGER_APPLY_CONTRACT, error: safe(error), controls: { ...writeControls(state), ownerApprovalReceiptConsumed: state.consumed === true, reviewerRequested: false, pullRequestMutated: false, workflowDispatched: false, repositorySettingsMutated: false, mergePerformed: false, deploymentPerformed: false, providerMutated: false, credentialValueExposed: false } }
}

function exactNow(value) { const date = value instanceof Date ? value : new Date(value); if (!Number.isFinite(date.getTime())) fail('exact_head_codex_review_trigger_time_invalid'); return date }
function assertNoSecret(value) { if (/Bearer\s+[A-Za-z0-9._-]+|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}/i.test(JSON.stringify(value))) fail('exact_head_codex_review_trigger_secret_echo') }

export function renderExactHeadCodexReviewOwnerConfirmation(plan) {
  validateExactHeadCodexReviewPlan(plan)
  return ['SuperMega owner gate', '', 'Approve one exact Codex review trigger comment?', '', `Repository: ${plan.repository}`, `PR: #${plan.pullRequest.number}`, `Base: ${plan.pullRequest.base}`, `Exact head: ${plan.pullRequest.head}`, `Comment body: ${EXACT_HEAD_CODEX_REVIEW_BODY}`, '', 'This posts exactly one review-trigger comment and nothing else.', 'It cannot request reviewers, edit the PR, rerun a workflow, dismiss a security finding, merge, deploy, change settings, mutate a provider, contact a customer, take payment, or move stock.', '', 'This dialog expires after 10 minutes and fails closed unless you choose Yes.', 'No is the default. A Yes receipt is one-use and is consumed before the POST.'].join('\n')
}

export function confirmExactHeadCodexReviewOwnerClick(message, { platform = process.platform, spawn = spawnSync } = {}) {
  if (platform !== 'win32') fail('exact_head_codex_review_trigger_windows_required')
  const windowsRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows'
  const script = ['Add-Type -AssemblyName System.Windows.Forms', '$result = [System.Windows.Forms.MessageBox]::Show($env:SUPERMEGA_OWNER_GATE_MESSAGE, $env:SUPERMEGA_OWNER_GATE_TITLE, [System.Windows.Forms.MessageBoxButtons]::YesNo, [System.Windows.Forms.MessageBoxIcon]::Warning, [System.Windows.Forms.MessageBoxDefaultButton]::Button2)', 'if ($result -eq [System.Windows.Forms.DialogResult]::Yes) { Write-Output "APPROVED" } else { Write-Output "DECLINED" }'].join('; ')
  const result = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-Sta', '-Command', script], { encoding: 'utf8', timeout: EXACT_HEAD_CODEX_REVIEW_PLAN_TTL_MS, windowsHide: false, env: { PATH: process.env.PATH || `${windowsRoot}\\System32;${windowsRoot}`, SystemRoot: windowsRoot, WINDIR: windowsRoot, SUPERMEGA_OWNER_GATE_TITLE: 'SuperMega exact Codex review', SUPERMEGA_OWNER_GATE_MESSAGE: String(message || '') } })
  if (result?.error?.code === 'ETIMEDOUT') fail('exact_head_codex_review_trigger_owner_timed_out')
  if (result?.error || result?.signal || result?.status !== 0) fail('exact_head_codex_review_trigger_owner_confirmation_failed')
  return String(result.stdout || '').trim() === 'APPROVED'
}

function buildReceipt(plan, now = new Date(), nonce = randomBytes(32).toString('hex')) {
  const confirmed = exactNow(now); const body = { decision: 'approved', planDigest: plan.digest, head: plan.pullRequest.head, confirmedAt: confirmed.toISOString(), expiresAt: new Date(confirmed.getTime() + EXACT_HEAD_CODEX_REVIEW_PLAN_TTL_MS).toISOString(), nonce, defaultDecision: 'decline', method: 'windows_local_owner_click', reusable: false }
  return signed(body)
}
function consumeReceipt(receipt, now = new Date()) { if (!record(receipt) || !DIGEST.test(String(receipt.digest || '')) || receipt.digest !== compactDigest(JSON.stringify(Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== 'digest')))) || receipt.decision !== 'approved' || receipt.defaultDecision !== 'decline' || receipt.method !== 'windows_local_owner_click' || receipt.reusable !== false) fail('exact_head_codex_review_trigger_receipt_invalid'); const confirmed = exactNow(receipt.confirmedAt); const expires = exactNow(receipt.expiresAt); const current = exactNow(now); if (expires.getTime() - confirmed.getTime() !== EXACT_HEAD_CODEX_REVIEW_PLAN_TTL_MS || current < confirmed || current >= expires || consumedReceipts.has(receipt.digest)) fail('exact_head_codex_review_trigger_receipt_expired_or_consumed'); consumedReceipts.add(receipt.digest); return receipt }

function token(env = process.env) { for (const key of ['GITHUB_TOKEN', 'GH_TOKEN']) { const value = String(env[key] || '').trim(); if (value) return { key, value } } return null }
async function githubJson(path, { method = 'GET', body = null, tokenValue = null, request = fetch } = {}) { const headers = { accept: 'application/vnd.github+json', 'user-agent': 'supermega-exact-head-codex-review-trigger' }; if (tokenValue) headers.authorization = `Bearer ${tokenValue}`; if (body !== null) headers['content-type'] = 'application/json'; const response = await request(`${API_BASE}${path}`, { method, headers, body: body === null ? undefined : JSON.stringify(body) }); let json = null; try { json = await response.json() } catch {} return { ok: response.ok, status: response.status, json } }

function sameState(plan, fresh) { return fresh.pullRequest.number === plan.pullRequest.number && fresh.pullRequest.base === plan.pullRequest.base && fresh.pullRequest.head === plan.pullRequest.head && fresh.pullRequest.headUpdatedAt === plan.pullRequest.headUpdatedAt && JSON.stringify(fresh.observed.exactHeadChecks) === JSON.stringify(plan.observed.exactHeadChecks) && JSON.stringify(fresh.observed.codexReviewComments) === JSON.stringify(plan.observed.codexReviewComments) && fresh.observed.exactHeadReviews.length === 0 && fresh.observed.reviewNamedChecks.length === 0 && fresh.observed.currentHeadTriggerCount === 0 }
async function currentPlanState(plan, { fetchJson, gitState, now, toolDigests }) { const fresh = await collectExactHeadCodexReviewPlan({ prNumber: plan.pullRequest.number, authority: plan.authority, fetchJson, gitState, now, toolDigests }); if (!sameState(plan, fresh)) fail('exact_head_codex_review_trigger_state_drift'); return fresh }

export async function applyExactHeadCodexReviewTrigger({ plan, planPayload = null, planFileDigest = null, fetchJson = fetchGitHubJson, request = fetch, confirmer = confirmExactHeadCodexReviewOwnerClick, env = process.env, gitState = localGitState(), now = () => new Date(), toolDigests = sourceToolDigests(), nonce = () => randomBytes(32).toString('hex') } = {}) {
  let attempted = false; let outcome = null; let consumed = false
  try {
    validateExactHeadCodexReviewPlan(plan, { now: now() })
    if (planFileDigest !== null && (!DIGEST.test(String(planFileDigest)) || typeof planPayload !== 'string' || compactDigest(planPayload) !== planFileDigest)) fail('exact_head_codex_review_trigger_plan_file_digest_invalid')
    if (planPayload !== null && JSON.stringify(JSON.parse(planPayload)) !== JSON.stringify(plan)) fail('exact_head_codex_review_trigger_plan_payload_invalid')
    if (!gitState.clean || gitState.branch !== plan.local.branch || gitState.origin !== EXACT_HEAD_CODEX_REVIEW_ORIGIN || gitState.head !== plan.pullRequest.head || gitState.tree !== plan.local.tree) fail('exact_head_codex_review_trigger_local_state_drift')
    const actualTools = await toolDigests
    if (JSON.stringify(actualTools) !== JSON.stringify(plan.sourceToolDigests)) fail('exact_head_codex_review_trigger_tool_bytes_drift')
    const auth = token(env); if (!auth) fail('exact_head_codex_review_trigger_token_required')
    await currentPlanState(plan, { fetchJson, gitState, now: now(), toolDigests: Promise.resolve(actualTools) })
    if (confirmer(renderExactHeadCodexReviewOwnerConfirmation(plan)) !== true) fail('exact_head_codex_review_trigger_owner_declined')
    const receipt = buildReceipt(plan, now(), nonce())
    await currentPlanState(plan, { fetchJson, gitState, now: now(), toolDigests: Promise.resolve(actualTools) })
    consumeReceipt(receipt, now()); consumed = true
    let posted
    attempted = true
    try { posted = await githubJson(`/issues/${plan.pullRequest.number}/comments`, { method: 'POST', body: { body: EXACT_HEAD_CODEX_REVIEW_BODY }, tokenValue: auth.value, request }) } catch { throw writeFailure('exact_head_codex_review_trigger_write_outcome_unknown', true, WRITE_OUTCOME_UNKNOWN, consumed) }
    if (!posted.ok && posted.status >= 400 && posted.status < 500) throw writeFailure(`exact_head_codex_review_trigger_post_failed:${posted.status}`, true, WRITE_CONFIRMED_NOT_PERFORMED, consumed)
    if (!posted.ok || !Number.isSafeInteger(posted.json?.id)) throw writeFailure('exact_head_codex_review_trigger_write_outcome_unknown', true, WRITE_OUTCOME_UNKNOWN, consumed)
    let readBack
    try { readBack = await githubJson(`/issues/comments/${posted.json.id}`, { tokenValue: auth.value, request }) } catch { throw writeFailure('exact_head_codex_review_trigger_write_outcome_unknown', true, WRITE_OUTCOME_UNKNOWN, consumed) }
    if (!readBack.ok || readBack.json?.id !== posted.json.id || readBack.json?.body !== EXACT_HEAD_CODEX_REVIEW_BODY || !readBack.json?.user?.login || !readBack.json?.created_at) throw writeFailure('exact_head_codex_review_trigger_write_outcome_unknown', true, WRITE_OUTCOME_UNKNOWN, consumed)
    const after = await fetchJson(`/pulls/${plan.pullRequest.number}`)
    if (after?.state !== 'open' || after?.draft !== false || after?.base?.sha !== plan.pullRequest.base || after?.head?.sha !== plan.pullRequest.head) fail('exact_head_codex_review_trigger_post_write_head_drift')
    outcome = WRITE_CONFIRMED_PERFORMED
    const body = { ok: true, contract: EXACT_HEAD_CODEX_REVIEW_TRIGGER_APPLY_CONTRACT, digestScope: 'utf8_compact_json_without_digest', mode: 'executed_owner_approved_exact_head_comment', repository: EXACT_HEAD_CODEX_REVIEW_REPOSITORY, plan: { digest: plan.digest, fileDigest: planFileDigest }, pullRequest: { number: plan.pullRequest.number, base: after.base.sha, head: after.head.sha, state: after.state, draft: after.draft }, comment: { id: readBack.json.id, body: readBack.json.body, author: readBack.json.user.login, createdAt: readBack.json.created_at, exactHeadBeforeAndAfter: plan.pullRequest.head }, receipt: { digest: receipt.digest, consumed: true, defaultDecision: 'decline', method: 'windows_local_owner_click' }, controls: { ...writeControls({ attempted: true, outcome }), ownerApprovalReceiptConsumed: true, reviewerRequested: false, pullRequestMutated: false, workflowDispatched: false, repositorySettingsMutated: false, mergePerformed: false, deploymentPerformed: false, providerMutated: false, credentialValueExposed: false } }
    assertNoSecret(body); return signed(body)
  } catch (error) {
    if (record(error?.writeOutcome)) throw error
    throw writeFailure(attempted && outcome === null ? 'exact_head_codex_review_trigger_write_outcome_unknown' : safe(error), attempted, attempted ? (outcome || WRITE_OUTCOME_UNKNOWN) : WRITE_CONFIRMED_NOT_PERFORMED, consumed)
  }
}

function parseArgs(argv) { const args = [...argv]; const options = { plan: null, execute: false, ownerClick: false, selfTest: false }; while (args.length) { const arg = args.shift(); if (arg === '--plan' && args[0]) options.plan = args.shift(); else if (arg === '--execute') options.execute = true; else if (arg === '--owner-click') options.ownerClick = true; else if (arg === '--self-test') options.selfTest = true; else fail('exact_head_codex_review_trigger_usage_invalid') } if (options.selfTest && (options.plan || options.execute || options.ownerClick)) fail('exact_head_codex_review_trigger_usage_invalid'); if (!options.selfTest && (!options.plan || !options.execute || !options.ownerClick)) fail('exact_head_codex_review_trigger_owner_click_required'); return options }

async function main() { const options = parseArgs(process.argv.slice(2)); if (options.selfTest) { console.log(JSON.stringify({ ok: true, contract: `${EXACT_HEAD_CODEX_REVIEW_TRIGGER_APPLY_CONTRACT}.self-test`, githubWritesPerformed: false }, null, 2)); return } const receipt = await readExactHeadCodexReviewPlan(options.plan); const result = await applyExactHeadCodexReviewTrigger({ plan: receipt.packet, planPayload: receipt.payload, planFileDigest: receipt.fileDigest }); console.log(JSON.stringify(result, null, 2)) }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(JSON.stringify(buildExactHeadCodexReviewTriggerFailureReceipt(error), null, 2)); process.exitCode = 1 })
