#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ORPHANED_CI_RECOVERY_PLAN_CONTRACT = 'supermega.exact-head-orphaned-ci-recovery-plan.v1'
export const ORPHANED_CI_RECOVERY_PLAN_TTL_MS = 5 * 60 * 1000
export const ORPHANED_CI_RECOVERY_GRACE_MS = 5 * 60 * 1000
export const ORPHANED_CI_RECOVERY_REPOSITORY = 'swanhtet01/swanhtet01.github.io'
export const ORPHANED_CI_RECOVERY_ORIGIN = `https://github.com/${ORPHANED_CI_RECOVERY_REPOSITORY}.git`
export const ORPHANED_CI_RECOVERY_WORKFLOW_PATH = '.github/workflows/showroom-ci.yml'

const root = resolve(import.meta.dirname, '..')
const API_BASE = `https://api.github.com/repos/${ORPHANED_CI_RECOVERY_REPOSITORY}`
const SHA = /^[0-9a-f]{40}$/
const DIGEST = /^sha256:[0-9a-f]{64}$/
const ACCEPTED = new Set(['success', 'neutral', 'skipped'])
const CANONICAL_BRANCH = 'codex/release-stack-integration-rehearsal-20260825'
const TARGET_JOB_NAME = 'validate'
const TOOL_PATHS = ['tools/prepare_exact_head_orphaned_ci_recovery.mjs', 'tools/apply_exact_head_orphaned_ci_recovery.mjs']
const FALSE_CONTROLS = ['githubWriteAttempted', 'githubWritesPerformed', 'workflowCancelled', 'workflowRerun', 'ownerApprovalReceiptConsumed', 'workflowDispatched', 'pullRequestMutated', 'repositorySettingsMutated', 'mergePerformed', 'deploymentPerformed', 'providerMutated', 'credentialValueExposed']

function fail(code) { throw new Error(code) }
function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function digest(value) { return `sha256:${createHash('sha256').update(String(value || '').replace(/\r\n?/g, '\n')).digest('hex')}` }
function signed(body) { return { ...body, digest: digest(JSON.stringify(body)) } }
function sha(value, code) { const text = String(value || '').trim().toLowerCase(); if (!SHA.test(text)) fail(code); return text }
function positive(value, code) { const number = Number(value); if (!Number.isSafeInteger(number) || number < 1) fail(code); return number }
function phase(value) { if (!['cancel', 'rerun'].includes(value)) fail('orphaned_ci_recovery_phase_invalid'); return value }
function exactDate(value, code) { const text = String(value || ''); const canonical = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(text) ? text.replace('Z', '.000Z') : text; const date = new Date(canonical); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(text) || !Number.isFinite(date.getTime()) || date.toISOString() !== canonical) fail(code); return date }
function noSecrets(value) { if (/Bearer\s+[A-Za-z0-9._-]+|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|https?:\/\/[^\s"']+:[^\s"']+@/i.test(JSON.stringify(value))) fail('orphaned_ci_recovery_secret_echo') }

export function localGitState(git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' } })) {
  const read = (args, code) => { const result = git(args); if (result?.error || result?.status !== 0) fail(code); return String(result.stdout || '').trim() }
  return { branch: read(['symbolic-ref', '--short', 'HEAD'], 'orphaned_ci_recovery_git_branch_failed'), head: sha(read(['rev-parse', 'HEAD'], 'orphaned_ci_recovery_git_head_failed'), 'orphaned_ci_recovery_git_head_invalid'), tree: sha(read(['show', '-s', '--format=%T', 'HEAD'], 'orphaned_ci_recovery_git_tree_failed'), 'orphaned_ci_recovery_git_tree_invalid'), origin: read(['remote', 'get-url', 'origin'], 'orphaned_ci_recovery_git_origin_failed'), clean: read(['status', '--porcelain=v1'], 'orphaned_ci_recovery_git_status_failed') === '' }
}

export async function sourceToolDigests(read = (path) => readFile(path, 'utf8')) { return Promise.all(TOOL_PATHS.map(async (path) => ({ path, digest: digest(await read(resolve(root, path))) }))) }

async function workflowBinding(read = (path) => readFile(path, 'utf8')) {
  const payload = await read(resolve(root, ORPHANED_CI_RECOVERY_WORKFLOW_PATH))
  const validateStart = /^ {2}validate:\s*$/mi.exec(payload)
  const remainder = validateStart ? payload.slice(validateStart.index + validateStart[0].length) : ''
  const nextJob = /^ {2}[a-z][a-z0-9_-]*:\s*$/mi.exec(remainder)
  const validateBlock = remainder.slice(0, nextJob?.index)
  const workflowName = /^name:\s*([^\r\n]+)\s*$/m.exec(payload)?.[1]?.trim()
  const match = /^ {4}timeout-minutes:\s*(\d+)\s*$/m.exec(validateBlock || '')
  const timeoutMinutes = Number(match?.[1])
  if (workflowName !== 'SuperMega App CI' || !Number.isSafeInteger(timeoutMinutes) || timeoutMinutes < 1 || timeoutMinutes > 120) fail('orphaned_ci_recovery_workflow_timeout_invalid')
  return { path: ORPHANED_CI_RECOVERY_WORKFLOW_PATH, name: workflowName, targetJobName: TARGET_JOB_NAME, fileDigest: digest(payload), timeoutMinutes }
}

function exactPr(value) {
  if (!record(value) || value.state !== 'open' || value.draft !== false || value.base?.repo?.full_name !== ORPHANED_CI_RECOVERY_REPOSITORY) fail('orphaned_ci_recovery_pr_invalid')
  return { number: positive(value.number, 'orphaned_ci_recovery_pr_invalid'), base: sha(value.base?.sha, 'orphaned_ci_recovery_base_invalid'), head: sha(value.head?.sha, 'orphaned_ci_recovery_head_invalid'), updatedAt: exactDate(value.updated_at, 'orphaned_ci_recovery_pr_updated_at_invalid').toISOString() }
}
export function exactRun(value, expectedHead, workflow) {
  const path = String(value?.path || '')
  if (!record(value) || sha(value.head_sha, 'orphaned_ci_recovery_run_head_invalid') !== expectedHead || value.event !== 'pull_request' || String(value.name || '') !== workflow.name || (path !== workflow.path && !path.startsWith(`${workflow.path}@`))) fail('orphaned_ci_recovery_run_invalid')
  const status = String(value.status || ''); const conclusion = value.conclusion === null ? null : String(value.conclusion || '')
  if (!['queued', 'in_progress', 'completed'].includes(status)) fail('orphaned_ci_recovery_run_invalid')
  return { id: positive(value.id, 'orphaned_ci_recovery_run_invalid'), workflowId: positive(value.workflow_id, 'orphaned_ci_recovery_run_invalid'), head: expectedHead, event: 'pull_request', status, conclusion, createdAt: exactDate(value.created_at, 'orphaned_ci_recovery_run_invalid').toISOString(), updatedAt: exactDate(value.updated_at, 'orphaned_ci_recovery_run_invalid').toISOString() }
}
export function exactJob(value, run) {
  if (!record(value) || positive(value.id, 'orphaned_ci_recovery_job_invalid') < 1 || !String(value.name || '') || positive(value.run_id, 'orphaned_ci_recovery_job_invalid') !== run.id) fail('orphaned_ci_recovery_job_invalid')
  const match = new RegExp(`^${API_BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/check-runs\\/(\\d+)$`).exec(String(value.check_run_url || '')); if (!match) fail('orphaned_ci_recovery_job_invalid')
  const status = String(value.status || ''); const conclusion = value.conclusion === null ? null : String(value.conclusion || '')
  if (!['queued', 'in_progress', 'completed'].includes(status)) fail('orphaned_ci_recovery_job_invalid')
  return { id: positive(value.id, 'orphaned_ci_recovery_job_invalid'), name: String(value.name), status, conclusion, checkRunId: positive(match[1], 'orphaned_ci_recovery_job_invalid'), startedAt: value.started_at === null ? null : exactDate(value.started_at, 'orphaned_ci_recovery_job_invalid').toISOString(), completedAt: value.completed_at === null ? null : exactDate(value.completed_at, 'orphaned_ci_recovery_job_invalid').toISOString(), runId: run.id }
}
export function exactCheck(value, job, checkName) {
  if (!record(value) || positive(value.id, 'orphaned_ci_recovery_check_invalid') !== job.checkRunId || String(value.name || '') !== checkName) fail('orphaned_ci_recovery_check_invalid')
  const status = String(value.status || ''); const conclusion = value.conclusion === null ? null : String(value.conclusion || '')
  if (!['queued', 'in_progress', 'completed'].includes(status)) fail('orphaned_ci_recovery_check_invalid')
  return { id: job.checkRunId, name: checkName, status, conclusion }
}
function exactChecks(value, targetId) {
  if (!Array.isArray(value?.check_runs)) fail('orphaned_ci_recovery_checks_invalid')
  const checks = value.check_runs.map((check) => ({ id: positive(check?.id, 'orphaned_ci_recovery_checks_invalid'), name: String(check?.name || ''), status: String(check?.status || ''), conclusion: check?.conclusion === null ? null : String(check?.conclusion || '') })).sort((a, b) => a.id - b.id)
  if (!checks.length || checks.some((check) => !check.name)) fail('orphaned_ci_recovery_checks_invalid')
  if (checks.filter((check) => check.id === targetId).length !== 1) fail('orphaned_ci_recovery_target_check_missing')
  if (checks.filter((check) => check.id !== targetId).some((check) => check.status !== 'completed' || !ACCEPTED.has(check.conclusion))) fail('orphaned_ci_recovery_sibling_checks_not_terminal_green')
  return checks
}
function exactRuns(value, run) {
  if (!Array.isArray(value?.workflow_runs)) fail('orphaned_ci_recovery_runs_invalid')
  const workflow = { name: run.workflowName, path: run.workflowPath }
  const matching = value.workflow_runs.filter((candidate) => Number(candidate?.workflow_id) === run.workflowId).map((candidate) => exactRun(candidate, run.head, workflow)).sort((a, b) => a.id - b.id)
  if (!matching.some((candidate) => candidate.id === run.id)) fail('orphaned_ci_recovery_run_not_current')
  if (matching.some((candidate) => candidate.id !== run.id && Date.parse(candidate.createdAt) >= Date.parse(run.createdAt))) fail('orphaned_ci_recovery_newer_exact_head_run_exists')
  return matching
}
function assertPhase({ phase: requested, run, job, check, now, timeoutMinutes }) {
  if (requested === 'cancel') {
    if (run.status === 'completed' || job.status === 'completed' || check.status === 'completed') fail('orphaned_ci_recovery_cancel_target_not_nonterminal')
    const staleAt = Date.parse(run.updatedAt) + timeoutMinutes * 60_000 + ORPHANED_CI_RECOVERY_GRACE_MS
    if (now.getTime() <= staleAt) fail('orphaned_ci_recovery_not_stale')
    return { kind: 'cancel_exact_orphaned_workflow_run', method: 'POST', path: `/actions/runs/${run.id}/cancel`, runTerminalRequiredBeforeAction: false }
  }
  if (run.status !== 'completed' || run.conclusion !== 'cancelled' || job.status !== 'completed' || job.conclusion !== 'cancelled' || check.status !== 'completed' || check.conclusion !== 'cancelled') fail('orphaned_ci_recovery_rerun_target_not_cancelled')
  return { kind: 'rerun_exact_cancelled_job', method: 'POST', path: `/actions/jobs/${job.id}/rerun`, runTerminalRequiredBeforeAction: true }
}

export async function collectOrphanedCiRecoveryPlan({ prNumber = 561, runId, jobId, checkName, phase: requestedPhase = 'cancel', fetchJson, gitState = localGitState(), now = new Date(), read = undefined, toolDigests = sourceToolDigests() } = {}) {
  if (typeof fetchJson !== 'function') fail('orphaned_ci_recovery_fetch_required')
  const number = positive(prNumber, 'orphaned_ci_recovery_pr_invalid'); const targetRunId = positive(runId, 'orphaned_ci_recovery_run_invalid'); const targetJobId = positive(jobId, 'orphaned_ci_recovery_job_invalid'); const targetCheckName = String(checkName || '').trim(); const currentPhase = phase(requestedPhase)
  if (targetCheckName !== TARGET_JOB_NAME) fail('orphaned_ci_recovery_check_invalid')
  if (!gitState.clean || gitState.branch !== CANONICAL_BRANCH || gitState.origin !== ORPHANED_CI_RECOVERY_ORIGIN) fail('orphaned_ci_recovery_local_state_invalid')
  const prRaw = await fetchJson(`/pulls/${number}`); const pr = exactPr(prRaw)
  if (gitState.head !== pr.head) fail('orphaned_ci_recovery_local_head_mismatch')
  const [runRaw, jobRaw, checksRaw, runsRaw, workflow, resolvedTools] = await Promise.all([
    fetchJson(`/actions/runs/${targetRunId}`), fetchJson(`/actions/jobs/${targetJobId}`), fetchJson(`/commits/${pr.head}/check-runs?per_page=100&filter=latest`), fetchJson(`/actions/runs?event=pull_request&head_sha=${pr.head}&per_page=100`), workflowBinding(read), toolDigests,
  ])
  const rawRun = exactRun(runRaw, pr.head, workflow); const run = { ...rawRun, workflowName: workflow.name, workflowPath: workflow.path }; if (run.id !== targetRunId) fail('orphaned_ci_recovery_run_invalid')
  const job = exactJob(jobRaw, run); if (job.id !== targetJobId || job.name !== targetCheckName) fail('orphaned_ci_recovery_job_invalid')
  const checkId = job.checkRunId
  const checkRaw = await fetchJson(`/check-runs/${checkId}`)
  const check = exactCheck(checkRaw?.id === checkId ? checkRaw : checksRaw?.check_runs?.find((entry) => Number(entry?.id) === checkId), job, targetCheckName)
  const checks = exactChecks(checksRaw, checkId); const runs = exactRuns(runsRaw, run)
  const generatedAt = exactDate(now instanceof Date ? now.toISOString() : now, 'orphaned_ci_recovery_time_invalid')
  const action = assertPhase({ phase: currentPhase, run, job, check, now: generatedAt, timeoutMinutes: workflow.timeoutMinutes })
  const body = {
    ok: true, contract: ORPHANED_CI_RECOVERY_PLAN_CONTRACT, digestScope: 'utf8_compact_json_without_digest', mode: 'plan_only_get_only', generatedAt: generatedAt.toISOString(), expiresAt: new Date(generatedAt.getTime() + ORPHANED_CI_RECOVERY_PLAN_TTL_MS).toISOString(),
    repository: ORPHANED_CI_RECOVERY_REPOSITORY, origin: ORPHANED_CI_RECOVERY_ORIGIN, pullRequest: { number, base: pr.base, head: pr.head, updatedAt: pr.updatedAt, state: 'open', draft: false }, local: { branch: gitState.branch, head: gitState.head, tree: gitState.tree, clean: true, origin: gitState.origin },
    workflow, target: { run, job, check, exactHeadSiblingChecks: checks, sameWorkflowExactHeadRuns: runs }, action: { phase: currentPhase, ...action }, sourceToolDigests: resolvedTools,
    readiness: { blockers: [], executeReady: false, ownerApprovalRequired: true }, controls: { githubApiMethods: ['GET'], githubWriteAttempted: false, githubWritesPerformed: false, githubWriteOutcome: 'confirmed_not_performed', githubWriteRetryAllowed: false, workflowCancelled: false, workflowRerun: false, ownerApprovalReceiptConsumed: false, workflowDispatched: false, pullRequestMutated: false, repositorySettingsMutated: false, mergePerformed: false, deploymentPerformed: false, providerMutated: false, credentialValueExposed: false },
  }
  noSecrets(body); return signed(body)
}

export function validateOrphanedCiRecoveryPlan(packet, { now = new Date() } = {}) {
  if (!record(packet)) fail('orphaned_ci_recovery_plan_invalid')
  const { digest: actual, ...body } = packet
  if (!DIGEST.test(String(actual || '')) || actual !== digest(JSON.stringify(body))) fail('orphaned_ci_recovery_plan_digest_invalid')
  if (packet.ok !== true || packet.contract !== ORPHANED_CI_RECOVERY_PLAN_CONTRACT || packet.mode !== 'plan_only_get_only' || packet.repository !== ORPHANED_CI_RECOVERY_REPOSITORY || packet.origin !== ORPHANED_CI_RECOVERY_ORIGIN || packet.local?.branch !== CANONICAL_BRANCH || packet.local?.head !== packet.pullRequest?.head || packet.local?.clean !== true || packet.local?.origin !== ORPHANED_CI_RECOVERY_ORIGIN || !SHA.test(String(packet.local?.tree || '')) || packet.pullRequest?.state !== 'open' || packet.pullRequest?.draft !== false || !Array.isArray(packet.controls?.githubApiMethods) || JSON.stringify(packet.controls.githubApiMethods) !== JSON.stringify(['GET'])) fail('orphaned_ci_recovery_plan_invalid')
  const current = now instanceof Date ? now.getTime() : new Date(now).getTime(); const expires = exactDate(packet.expiresAt, 'orphaned_ci_recovery_plan_expired'); if (!Number.isFinite(current) || current >= expires.getTime()) fail('orphaned_ci_recovery_plan_expired')
  if (!record(packet.workflow) || packet.workflow.path !== ORPHANED_CI_RECOVERY_WORKFLOW_PATH || packet.workflow.name !== 'SuperMega App CI' || packet.workflow.targetJobName !== TARGET_JOB_NAME || !DIGEST.test(String(packet.workflow.fileDigest || '')) || !Number.isSafeInteger(packet.workflow.timeoutMinutes) || packet.workflow.timeoutMinutes < 1 || packet.workflow.timeoutMinutes > 120 || !record(packet.target?.run) || !record(packet.target?.job) || !record(packet.target?.check) || !Array.isArray(packet.target?.exactHeadSiblingChecks) || !Array.isArray(packet.target?.sameWorkflowExactHeadRuns) || !Array.isArray(packet.sourceToolDigests) || packet.sourceToolDigests.length !== TOOL_PATHS.length || packet.sourceToolDigests.some((entry, index) => entry?.path !== TOOL_PATHS[index] || !DIGEST.test(String(entry?.digest || '')))) fail('orphaned_ci_recovery_plan_invalid')
  const target = packet.target; const rawRun = exactRun({ id: target.run.id, workflow_id: target.run.workflowId, head_sha: target.run.head, event: target.run.event, name: packet.workflow.name, path: `${packet.workflow.path}@${packet.pullRequest.head}`, status: target.run.status, conclusion: target.run.conclusion, created_at: target.run.createdAt, updated_at: target.run.updatedAt }, packet.pullRequest.head, packet.workflow); const run = { ...rawRun, workflowName: packet.workflow.name, workflowPath: packet.workflow.path }; const job = exactJob({ id: target.job.id, run_id: target.job.runId, name: target.job.name, status: target.job.status, conclusion: target.job.conclusion, check_run_url: `${API_BASE}/check-runs/${target.job.checkRunId}`, started_at: target.job.startedAt, completed_at: target.job.completedAt }, run); const check = exactCheck(target.check, job, TARGET_JOB_NAME); exactChecks({ check_runs: target.exactHeadSiblingChecks }, check.id); exactRuns({ workflow_runs: target.sameWorkflowExactHeadRuns.map((entry) => ({ id: entry.id, workflow_id: entry.workflowId, head_sha: entry.head, event: entry.event, name: packet.workflow.name, path: `${packet.workflow.path}@${packet.pullRequest.head}`, status: entry.status, conclusion: entry.conclusion, created_at: entry.createdAt, updated_at: entry.updatedAt })) }, run)
  const expectedAction = assertPhase({ phase: packet.action?.phase, run, job, check, now: exactDate(packet.generatedAt, 'orphaned_ci_recovery_time_invalid'), timeoutMinutes: packet.workflow.timeoutMinutes })
  if (packet.action?.kind !== expectedAction.kind || packet.action?.method !== 'POST' || packet.action?.path !== expectedAction.path || packet.action?.runTerminalRequiredBeforeAction !== expectedAction.runTerminalRequiredBeforeAction || packet.readiness?.executeReady !== false || packet.readiness?.ownerApprovalRequired !== true || packet.readiness?.blockers?.length !== 0 || packet.controls?.githubWriteOutcome !== 'confirmed_not_performed' || packet.controls?.githubWriteRetryAllowed !== false || FALSE_CONTROLS.some((key) => packet.controls?.[key] !== false) || Object.keys(packet.controls || {}).length !== FALSE_CONTROLS.length + 3) fail('orphaned_ci_recovery_plan_controls_invalid')
  noSecrets(packet); return packet
}

export async function readOrphanedCiRecoveryPlan(path, { now = new Date() } = {}) { const absolute = resolve(path || ''); const payload = await readFile(absolute, 'utf8'); if (Buffer.byteLength(payload, 'utf8') < 1 || Buffer.byteLength(payload, 'utf8') > 1_000_000) fail('orphaned_ci_recovery_plan_file_invalid'); let packet; try { packet = JSON.parse(payload) } catch { fail('orphaned_ci_recovery_plan_file_invalid') }; return { path: absolute, payload, fileDigest: digest(payload), packet: validateOrphanedCiRecoveryPlan(packet, { now }) } }

async function fetchResponse(path) { const response = await fetch(`${API_BASE}${path}`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'supermega-orphaned-ci-recovery-plan' } }); if (!response.ok) fail(`orphaned_ci_recovery_read_failed:${response.status}`); try { return { response, json: await response.json() } } catch { fail('orphaned_ci_recovery_read_json_invalid') } }
function nextPage(response, path, count) { const link = response.headers?.get?.('link') || null; if (!link) { if (count >= 100) fail('orphaned_ci_recovery_pagination_incomplete'); return null } const match = link.split(',').map((entry) => entry.trim()).map((entry) => /^<([^>]+)>;\s*rel="next"$/.exec(entry)).find(Boolean); if (!match) { if (count >= 100) fail('orphaned_ci_recovery_pagination_incomplete'); return null } let next; try { next = new URL(match[1]) } catch { fail('orphaned_ci_recovery_pagination_invalid') } const expected = new URL(API_BASE); if (next.origin !== expected.origin || !next.pathname.startsWith(expected.pathname) || next.href === new URL(`${API_BASE}${path}`).href) fail('orphaned_ci_recovery_pagination_invalid'); return `${next.pathname.slice(expected.pathname.length)}${next.search}` }
async function fetchAll(path, select) { let next = path; const values = []; for (let page = 0; next && page < 100; page += 1) { const current = next; const { response, json } = await fetchResponse(current); const items = select(json); if (!Array.isArray(items)) fail('orphaned_ci_recovery_pagination_shape_invalid'); values.push(...items); next = nextPage(response, current, items.length) } if (next) fail('orphaned_ci_recovery_pagination_limit_exceeded'); return values }
export async function fetchGitHubJson(path) { if (/\/check-runs(?:\?|$)/.test(path)) return { check_runs: await fetchAll(path, (json) => json?.check_runs) }; if (/\/actions\/runs\?(?:.*&)?event=pull_request/.test(path)) return { workflow_runs: await fetchAll(path, (json) => json?.workflow_runs) }; return (await fetchResponse(path)).json }

function parseArgs(argv) { const args = [...argv]; const options = { pr: 561, run: null, job: null, check: null, phase: 'cancel', output: null, verify: null, selfTest: false }; while (args.length) { const arg = args.shift(); if (arg === '--pr' && args[0]) options.pr = positive(args.shift(), 'orphaned_ci_recovery_pr_invalid'); else if (arg === '--run' && args[0]) options.run = positive(args.shift(), 'orphaned_ci_recovery_run_invalid'); else if (arg === '--job' && args[0]) options.job = positive(args.shift(), 'orphaned_ci_recovery_job_invalid'); else if (arg === '--check-name' && args[0]) options.check = args.shift(); else if (arg === '--phase' && args[0]) options.phase = phase(args.shift()); else if (arg === '--output' && args[0]) options.output = args.shift(); else if (arg === '--verify' && args[0]) options.verify = args.shift(); else if (arg === '--self-test') options.selfTest = true; else fail('orphaned_ci_recovery_plan_usage_invalid') } if (options.selfTest && (options.output || options.verify || options.run || options.job || options.check)) fail('orphaned_ci_recovery_plan_usage_invalid'); if (!options.selfTest && !options.verify && (!options.run || !options.job || !options.check || !options.output)) fail('orphaned_ci_recovery_plan_inputs_required'); return options }

export async function main(argv = process.argv.slice(2), dependencies = {}) { const options = parseArgs(argv); if (options.selfTest) { console.log(JSON.stringify({ ok: true, contract: `${ORPHANED_CI_RECOVERY_PLAN_CONTRACT}.self-test`, githubWritesPerformed: false }, null, 2)); return } if (options.verify) { const receipt = await readOrphanedCiRecoveryPlan(options.verify); console.log(JSON.stringify({ ok: true, contract: receipt.packet.contract, path: receipt.path, fileDigest: receipt.fileDigest, digest: receipt.packet.digest, githubWritesPerformed: false }, null, 2)); return } const packet = await collectOrphanedCiRecoveryPlan({ ...dependencies, prNumber: options.pr, runId: options.run, jobId: options.job, checkName: options.check, phase: options.phase, fetchJson: dependencies.fetchJson || fetchGitHubJson }); const absolute = resolve(options.output); await mkdir(dirname(absolute), { recursive: true }); await writeFile(absolute, `${JSON.stringify(packet, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' }); console.log(JSON.stringify({ ok: true, contract: packet.contract, path: absolute, digest: packet.digest, githubWritesPerformed: false }, null, 2)) }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(JSON.stringify({ ok: false, error: String(error?.message || 'orphaned_ci_recovery_failed'), githubWritesPerformed: false }, null, 2)); process.exitCode = 1 })
