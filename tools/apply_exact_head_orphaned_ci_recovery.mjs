#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ORPHANED_CI_RECOVERY_PLAN_CONTRACT,
  ORPHANED_CI_RECOVERY_PLAN_TTL_MS,
  ORPHANED_CI_RECOVERY_REPOSITORY,
  collectOrphanedCiRecoveryPlan,
  fetchGitHubJson,
  localGitState,
  readOrphanedCiRecoveryPlan,
  sourceToolDigests,
  validateOrphanedCiRecoveryPlan,
} from './prepare_exact_head_orphaned_ci_recovery.mjs'

export const ORPHANED_CI_RECOVERY_APPLY_CONTRACT = 'supermega.exact-head-orphaned-ci-recovery-apply.v1'

const API_BASE = `https://api.github.com/repos/${ORPHANED_CI_RECOVERY_REPOSITORY}`
const DIGEST = /^sha256:[0-9a-f]{64}$/
const WRITE_CONFIRMED_PERFORMED = 'confirmed_performed'
const WRITE_CONFIRMED_NOT_PERFORMED = 'confirmed_not_performed'
const WRITE_OUTCOME_UNKNOWN = 'outcome_unknown'
const consumed = new Set()

function fail(code) { throw new Error(code) }
function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function digest(value) { return `sha256:${createHash('sha256').update(String(value || '').replace(/\r\n?/g, '\n')).digest('hex')}` }
function signed(body) { return { ...body, digest: digest(JSON.stringify(body)) } }
function safe(error) { const code = String(error?.message || 'orphaned_ci_recovery_failed'); return /^[a-z0-9_:-]{1,240}$/.test(code) ? code : 'orphaned_ci_recovery_failed' }
function exactNow(value) { const date = value instanceof Date ? value : new Date(value); if (!Number.isFinite(date.getTime())) fail('orphaned_ci_recovery_time_invalid'); return date }
function noSecrets(value) { if (/Bearer\s+[A-Za-z0-9._-]+|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}/i.test(JSON.stringify(value))) fail('orphaned_ci_recovery_secret_echo') }
function controls({ attempted, outcome }) { const performed = { [WRITE_CONFIRMED_PERFORMED]: true, [WRITE_CONFIRMED_NOT_PERFORMED]: false, [WRITE_OUTCOME_UNKNOWN]: null }[outcome]; if (performed === undefined || (!attempted && outcome !== WRITE_CONFIRMED_NOT_PERFORMED)) fail('orphaned_ci_recovery_outcome_invalid'); return { githubWriteAttempted: attempted, githubWritesPerformed: performed, githubWriteOutcome: outcome, githubWriteRetryAllowed: false, workflowCancelled: false, workflowRerun: false } }
function writeFailure(code, attempted, outcome, receiptConsumed) { const error = new Error(code); error.writeOutcome = { attempted, outcome, receiptConsumed }; return error }

export function buildOrphanedCiRecoveryFailureReceipt(error) {
  const state = record(error?.writeOutcome) ? error.writeOutcome : { attempted: false, outcome: WRITE_CONFIRMED_NOT_PERFORMED, receiptConsumed: false }
  return { ok: false, contract: ORPHANED_CI_RECOVERY_APPLY_CONTRACT, error: safe(error), controls: { ...controls(state), ownerApprovalReceiptConsumed: state.receiptConsumed === true, workflowDispatched: false, pullRequestMutated: false, repositorySettingsMutated: false, mergePerformed: false, deploymentPerformed: false, providerMutated: false, credentialValueExposed: false } }
}

export function renderOrphanedCiRecoveryOwnerConfirmation(plan) {
  validateOrphanedCiRecoveryPlan(plan)
  const action = plan.action.phase === 'cancel' ? 'cancel one exact orphaned workflow run' : 'rerun one exact cancelled validation job'
  return ['SuperMega owner gate', '', `Approve ${action}?`, '', `Repository: ${plan.repository}`, `PR: #${plan.pullRequest.number}`, `Base: ${plan.pullRequest.base}`, `Exact head: ${plan.pullRequest.head}`, `Workflow run: ${plan.target.run.id}`, `Job: ${plan.target.job.id} (${plan.target.job.name})`, `Check: ${plan.target.check.name}`, '', 'This acts on exactly the listed GitHub Actions target and nothing else.', 'It cannot push source, edit the PR, request review, dispatch another workflow, dismiss a finding, merge, deploy, change settings, mutate a provider, contact a customer, take payment, or move stock.', '', 'This dialog expires after 5 minutes and fails closed unless you choose Yes.', 'No is the default. A Yes receipt is one-use and is consumed before the API POST.'].join('\n')
}

export function confirmOrphanedCiRecoveryOwnerClick(message, { platform = process.platform, spawn = spawnSync } = {}) {
  if (platform !== 'win32') fail('orphaned_ci_recovery_windows_required')
  const windowsRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows'
  const script = ['Add-Type -AssemblyName System.Windows.Forms', '$result = [System.Windows.Forms.MessageBox]::Show($env:SUPERMEGA_OWNER_GATE_MESSAGE, $env:SUPERMEGA_OWNER_GATE_TITLE, [System.Windows.Forms.MessageBoxButtons]::YesNo, [System.Windows.Forms.MessageBoxIcon]::Warning, [System.Windows.Forms.MessageBoxDefaultButton]::Button2)', 'if ($result -eq [System.Windows.Forms.DialogResult]::Yes) { Write-Output "APPROVED" } else { Write-Output "DECLINED" }'].join('; ')
  const result = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-Sta', '-Command', script], { encoding: 'utf8', timeout: ORPHANED_CI_RECOVERY_PLAN_TTL_MS, windowsHide: false, env: { PATH: process.env.PATH || `${windowsRoot}\\System32;${windowsRoot}`, SystemRoot: windowsRoot, WINDIR: windowsRoot, SUPERMEGA_OWNER_GATE_TITLE: 'SuperMega orphaned CI recovery', SUPERMEGA_OWNER_GATE_MESSAGE: String(message || '') } })
  if (result?.error?.code === 'ETIMEDOUT') fail('orphaned_ci_recovery_owner_timed_out')
  if (result?.error || result?.signal || result?.status !== 0) fail('orphaned_ci_recovery_owner_confirmation_failed')
  return String(result.stdout || '').trim() === 'APPROVED'
}

function receipt(plan, now = new Date(), nonce = randomBytes(32).toString('hex')) { const confirmedAt = exactNow(now); return signed({ decision: 'approved', planDigest: plan.digest, phase: plan.action.phase, runId: plan.target.run.id, jobId: plan.target.job.id, confirmedAt: confirmedAt.toISOString(), expiresAt: new Date(confirmedAt.getTime() + ORPHANED_CI_RECOVERY_PLAN_TTL_MS).toISOString(), nonce, defaultDecision: 'decline', method: 'windows_local_owner_click', reusable: false }) }
function consume(value, now = new Date()) { if (!record(value) || !DIGEST.test(String(value.digest || '')) || value.digest !== digest(JSON.stringify(Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'digest'))) ) || value.decision !== 'approved' || value.defaultDecision !== 'decline' || value.method !== 'windows_local_owner_click' || value.reusable !== false) fail('orphaned_ci_recovery_receipt_invalid'); const confirmedAt = exactNow(value.confirmedAt); const expiresAt = exactNow(value.expiresAt); const current = exactNow(now); if (expiresAt.getTime() - confirmedAt.getTime() !== ORPHANED_CI_RECOVERY_PLAN_TTL_MS || current < confirmedAt || current >= expiresAt || consumed.has(value.digest)) fail('orphaned_ci_recovery_receipt_expired_or_consumed'); consumed.add(value.digest); return value }
function token(env = process.env) { for (const key of ['GITHUB_TOKEN', 'GH_TOKEN']) { const value = String(env[key] || '').trim(); if (value) return value } return null }
async function github(path, { method = 'GET', tokenValue = null, request = fetch } = {}) { const headers = { accept: 'application/vnd.github+json', 'user-agent': 'supermega-orphaned-ci-recovery' }; if (tokenValue) headers.authorization = `Bearer ${tokenValue}`; const response = await request(`${API_BASE}${path}`, { method, headers }); let json = null; try { json = await response.json() } catch {} return { ok: response.ok, status: response.status, json } }

function sameState(plan, fresh) {
  return fresh.pullRequest.base === plan.pullRequest.base && fresh.pullRequest.head === plan.pullRequest.head && fresh.pullRequest.updatedAt === plan.pullRequest.updatedAt && fresh.local.head === plan.local.head && fresh.local.tree === plan.local.tree && fresh.workflow.fileDigest === plan.workflow.fileDigest && fresh.workflow.timeoutMinutes === plan.workflow.timeoutMinutes && JSON.stringify(fresh.target) === JSON.stringify(plan.target) && fresh.action.phase === plan.action.phase && fresh.action.path === plan.action.path && JSON.stringify(fresh.sourceToolDigests) === JSON.stringify(plan.sourceToolDigests)
}
async function currentState(plan, { fetchJson, gitState, now, toolDigests, read }) { const fresh = await collectOrphanedCiRecoveryPlan({ prNumber: plan.pullRequest.number, runId: plan.target.run.id, jobId: plan.target.job.id, checkName: plan.target.check.name, phase: plan.action.phase, fetchJson, gitState, now, toolDigests, read }); if (!sameState(plan, fresh)) fail('orphaned_ci_recovery_state_drift'); return fresh }

export async function applyOrphanedCiRecovery({ plan, planPayload = null, planFileDigest = null, fetchJson = fetchGitHubJson, request = fetch, confirmer = confirmOrphanedCiRecoveryOwnerClick, env = process.env, gitState = localGitState(), now = () => new Date(), toolDigests = sourceToolDigests(), read = undefined, nonce = () => randomBytes(32).toString('hex') } = {}) {
  let attempted = false; let outcome = null; let receiptConsumed = false
  try {
    validateOrphanedCiRecoveryPlan(plan, { now: now() })
    if (planFileDigest !== null && (!DIGEST.test(String(planFileDigest)) || typeof planPayload !== 'string' || digest(planPayload) !== planFileDigest)) fail('orphaned_ci_recovery_plan_file_digest_invalid')
    if (planPayload !== null && JSON.stringify(JSON.parse(planPayload)) !== JSON.stringify(plan)) fail('orphaned_ci_recovery_plan_payload_invalid')
    if (!gitState.clean || gitState.branch !== plan.local.branch || gitState.origin !== plan.local.origin || gitState.head !== plan.local.head || gitState.tree !== plan.local.tree) fail('orphaned_ci_recovery_local_state_drift')
    const actualTools = await toolDigests; if (JSON.stringify(actualTools) !== JSON.stringify(plan.sourceToolDigests)) fail('orphaned_ci_recovery_tool_bytes_drift')
    const auth = token(env); if (!auth) fail('orphaned_ci_recovery_token_required')
    await currentState(plan, { fetchJson, gitState, now: now(), toolDigests: Promise.resolve(actualTools), read })
    if (confirmer(renderOrphanedCiRecoveryOwnerConfirmation(plan)) !== true) fail('orphaned_ci_recovery_owner_declined')
    const beforeWrite = now()
    validateOrphanedCiRecoveryPlan(plan, { now: beforeWrite })
    await currentState(plan, { fetchJson, gitState, now: beforeWrite, toolDigests: Promise.resolve(actualTools), read })
    const ownerReceipt = receipt(plan, beforeWrite, nonce())
    consume(ownerReceipt, beforeWrite); receiptConsumed = true; attempted = true
    let response
    try { response = await github(plan.action.path, { method: 'POST', tokenValue: auth, request }) } catch { throw writeFailure('orphaned_ci_recovery_write_outcome_unknown', true, WRITE_OUTCOME_UNKNOWN, receiptConsumed) }
    if (!response.ok && response.status >= 400 && response.status < 500) throw writeFailure(`orphaned_ci_recovery_post_failed:${response.status}`, true, WRITE_CONFIRMED_NOT_PERFORMED, receiptConsumed)
    if (!response.ok) throw writeFailure('orphaned_ci_recovery_write_outcome_unknown', true, WRITE_OUTCOME_UNKNOWN, receiptConsumed)
    if (plan.action.phase === 'cancel') {
      let run; try { run = await fetchJson(`/actions/runs/${plan.target.run.id}`) } catch { throw writeFailure('orphaned_ci_recovery_write_outcome_unknown', true, WRITE_OUTCOME_UNKNOWN, receiptConsumed) }
      if (run?.status !== 'completed' || run?.conclusion !== 'cancelled') throw writeFailure('orphaned_ci_recovery_write_outcome_unknown', true, WRITE_OUTCOME_UNKNOWN, receiptConsumed)
    } else if (!Number.isSafeInteger(response.json?.id) || response.json.id !== plan.target.job.id) {
      throw writeFailure('orphaned_ci_recovery_write_outcome_unknown', true, WRITE_OUTCOME_UNKNOWN, receiptConsumed)
    }
    outcome = WRITE_CONFIRMED_PERFORMED
    const body = { ok: true, contract: ORPHANED_CI_RECOVERY_APPLY_CONTRACT, digestScope: 'utf8_compact_json_without_digest', mode: plan.action.phase === 'cancel' ? 'executed_owner_approved_exact_orphan_cancel' : 'executed_owner_approved_exact_job_rerun', repository: plan.repository, plan: { digest: plan.digest, fileDigest: planFileDigest }, target: { pullRequest: plan.pullRequest.number, base: plan.pullRequest.base, head: plan.pullRequest.head, runId: plan.target.run.id, jobId: plan.target.job.id, checkName: plan.target.check.name }, receipt: { digest: ownerReceipt.digest, consumed: true, defaultDecision: 'decline', method: 'windows_local_owner_click' }, controls: { ...controls({ attempted: true, outcome }), workflowCancelled: plan.action.phase === 'cancel', workflowRerun: plan.action.phase === 'rerun', ownerApprovalReceiptConsumed: true, workflowDispatched: false, pullRequestMutated: false, repositorySettingsMutated: false, mergePerformed: false, deploymentPerformed: false, providerMutated: false, credentialValueExposed: false } }
    noSecrets(body); return signed(body)
  } catch (error) {
    if (record(error?.writeOutcome)) throw error
    throw writeFailure(attempted && outcome === null ? 'orphaned_ci_recovery_write_outcome_unknown' : safe(error), attempted, attempted ? (outcome || WRITE_OUTCOME_UNKNOWN) : WRITE_CONFIRMED_NOT_PERFORMED, receiptConsumed)
  }
}

function parseArgs(argv) { const args = [...argv]; const options = { plan: null, execute: false, ownerClick: false, selfTest: false }; while (args.length) { const arg = args.shift(); if (arg === '--plan' && args[0]) options.plan = args.shift(); else if (arg === '--execute') options.execute = true; else if (arg === '--owner-click') options.ownerClick = true; else if (arg === '--self-test') options.selfTest = true; else fail('orphaned_ci_recovery_usage_invalid') } if (options.selfTest && (options.plan || options.execute || options.ownerClick)) fail('orphaned_ci_recovery_usage_invalid'); if (!options.selfTest && (!options.plan || !options.execute || !options.ownerClick)) fail('orphaned_ci_recovery_owner_click_required'); return options }
async function main() { const options = parseArgs(process.argv.slice(2)); if (options.selfTest) { console.log(JSON.stringify({ ok: true, contract: `${ORPHANED_CI_RECOVERY_APPLY_CONTRACT}.self-test`, githubWritesPerformed: false }, null, 2)); return } const source = await readOrphanedCiRecoveryPlan(options.plan); const result = await applyOrphanedCiRecovery({ plan: source.packet, planPayload: source.payload, planFileDigest: source.fileDigest }); console.log(JSON.stringify(result, null, 2)) }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(JSON.stringify(buildOrphanedCiRecoveryFailureReceipt(error), null, 2)); process.exitCode = 1 })
