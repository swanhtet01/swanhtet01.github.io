#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  validateReleaseHandoffPacket,
  verifyCurrentReleaseHandoff,
} from './prepare_release_handoff.mjs'
import {
  buildGitHubMainProtectionSnapshot,
  validateGitHubMainProtectionSnapshot,
} from './collect_github_main_protection_snapshot.mjs'

export const RELEASE_PULL_REQUEST_APPLY_CONTRACT = 'supermega.release-pull-request-apply.v2'
export const RELEASE_PULL_REQUEST_OWNER_RECEIPT_CONTRACT = 'supermega.release-pull-request-owner-receipt.v1'
export const RELEASE_PULL_REQUEST_OWNER_RECEIPT_TTL_MS = 10 * 60 * 1000
export const RELEASE_PULL_REQUEST_OWNER_DIALOG_TIMEOUT_MS = RELEASE_PULL_REQUEST_OWNER_RECEIPT_TTL_MS

const root = resolve(import.meta.dirname, '..')
const REPOSITORY = 'swanhtet01/swanhtet01.github.io'
const OWNER = 'swanhtet01'
const REPO = 'swanhtet01.github.io'
const ORIGIN = `https://github.com/${REPOSITORY}.git`
const BASE_BRANCH = 'main'
const TOKEN_ENVS = ['GITHUB_TOKEN', 'GH_TOKEN']
const GH_CLI_TOKEN_KEY = 'gh_cli'
const API_BASE = `https://api.github.com/repos/${REPOSITORY}`
const API_VERSION = '2026-03-10'
const MAX_FILE_BYTES = 1_000_000
const SHA_PATTERN = /^[0-9a-f]{40}$/
const BRANCH_PATTERN = /^codex\/[a-z0-9][a-z0-9._/-]{0,119}$/
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/
const NONCE_PATTERN = /^[0-9a-f]{64}$/
const EXECUTION_CHALLENGE_PATTERN = /^[0-9a-f]{64}$/
const EXECUTION_SEAL_PATTERN = /^hmac-sha256:[0-9a-f]{64}$/
const consumedOwnerReceiptDigests = new Set()
const WRITE_CONFIRMED_PERFORMED = 'confirmed_performed'
const WRITE_CONFIRMED_NOT_PERFORMED = 'confirmed_not_performed'
const WRITE_OUTCOME_UNKNOWN = 'outcome_unknown'

function fail(code) {
  throw new Error(code)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function githubWriteControls({ attempted, outcome }) {
  const performedByOutcome = {
    [WRITE_CONFIRMED_PERFORMED]: true,
    [WRITE_CONFIRMED_NOT_PERFORMED]: false,
    [WRITE_OUTCOME_UNKNOWN]: null,
  }
  if (!(outcome in performedByOutcome)) fail('release_pull_request_write_outcome_invalid')
  if (!attempted && outcome !== WRITE_CONFIRMED_NOT_PERFORMED) fail('release_pull_request_write_outcome_invalid')
  const performed = performedByOutcome[outcome]
  return {
    githubWriteAttempted: attempted,
    githubWritesPerformed: performed,
    githubWriteOutcome: outcome,
    githubWriteRetryAllowed: false,
    pullRequestCreated: performed,
  }
}

function safeFailureCode(error) {
  const code = String(error?.message || 'release_pull_request_failed')
  return /^[a-z0-9_:-]{1,240}$/.test(code) ? code : 'release_pull_request_failed'
}

function writeFailure(code, { attempted, outcome, ownerApprovalReceiptConsumed = false }) {
  const error = new Error(code)
  error.writeOutcome = { attempted, outcome, ownerApprovalReceiptConsumed }
  return error
}

function throwWithWriteOutcome(error, { attempted, resolvedOutcome = null, ownerApprovalReceiptConsumed }) {
  if (isRecord(error?.writeOutcome)) throw error
  throw writeFailure(
    attempted && resolvedOutcome === null ? 'release_pull_request_write_outcome_unknown' : safeFailureCode(error),
    {
      attempted,
      outcome: attempted ? (resolvedOutcome || WRITE_OUTCOME_UNKNOWN) : WRITE_CONFIRMED_NOT_PERFORMED,
      ownerApprovalReceiptConsumed,
    },
  )
}

export function buildReleasePullRequestFailureReceipt(error) {
  const writeOutcome = isRecord(error?.writeOutcome)
    ? error.writeOutcome
    : {
        attempted: false,
        outcome: WRITE_CONFIRMED_NOT_PERFORMED,
        ownerApprovalReceiptConsumed: false,
      }
  return {
    ok: false,
    contract: RELEASE_PULL_REQUEST_APPLY_CONTRACT,
    error: safeFailureCode(error),
    controls: {
      githubWritesApproved: writeOutcome.attempted || writeOutcome.ownerApprovalReceiptConsumed === true,
      ...githubWriteControls(writeOutcome),
      ownerApprovalReceiptConsumed: writeOutcome.ownerApprovalReceiptConsumed === true,
      repositorySettingsMutated: false,
      branchMutated: false,
      forcePushPerformed: false,
      branchDeletionPerformed: false,
      mergePerformed: false,
      workflowDispatchPerformed: false,
      deploymentPerformed: false,
      supabaseMutated: false,
      credentialValueExposed: false,
    },
  }
}

function digest(value) {
  return `sha256:${createHash('sha256').update(String(value || '').replace(/\r\n?/g, '\n')).digest('hex')}`
}

function signed(body) {
  return { ...body, digest: digest(JSON.stringify(body)) }
}

function exactSha(value, code) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!SHA_PATTERN.test(normalized)) fail(code)
  return normalized
}

function tokenFromEnv(env = process.env) {
  for (const key of TOKEN_ENVS) {
    const value = String(env[key] || '').trim()
    if (value) return { key, value, source: 'environment' }
  }
  return null
}

function gitDefault(args, { optional = false, timeout = 120_000 } = {}) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
    maxBuffer: 2_000_000,
    timeout,
    windowsHide: true,
  })
  if (!optional && (result.error || result.signal || result.status !== 0)) {
    fail(`release_pull_request_git_failed:${String(args[0] || 'git').slice(0, 40)}`)
  }
  return {
    status: result.status,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  }
}

function ghDefault(args, { optional = false, timeout = 30_000 } = {}) {
  const result = spawnSync('gh', args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    maxBuffer: 2_000_000,
    timeout,
    windowsHide: true,
  })
  const status = result.status ?? 1
  if (!optional && (result.error || result.signal || status !== 0)) {
    fail(`release_pull_request_gh_cli_failed:${String(args[0] || 'gh').slice(0, 40)}`)
  }
  return {
    status,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
    errorCode: result.error?.code || null,
    signal: result.signal || null,
  }
}

function githubCliAuthPresence(gh = ghDefault) {
  const result = gh(['auth', 'status', '--hostname', 'github.com'], { optional: true, timeout: 30_000 })
  if (result.status !== 0 || result.errorCode || result.signal) return null
  const output = `${result.stdout}\n${result.stderr}`
  if (!/Logged in to github\.com/i.test(output)) return null
  return { key: GH_CLI_TOKEN_KEY, value: null, source: 'github_cli_keyring' }
}

function githubCliExecutionToken(gh = ghDefault) {
  const result = gh(['auth', 'token', '--hostname', 'github.com'], { optional: true, timeout: 30_000 })
  if (result.status !== 0 || result.errorCode || result.signal) return null
  const value = String(result.stdout || '').trim()
  if (!value || /\s/.test(value)) return null
  return { key: GH_CLI_TOKEN_KEY, value, source: 'github_cli_keyring' }
}

function tokenForPlan({ env = process.env, gh = ghDefault, useGitHubCliAuth = false } = {}) {
  return tokenFromEnv(env) || (useGitHubCliAuth ? githubCliAuthPresence(gh) : null)
}

function tokenForExecute({ env = process.env, gh = ghDefault, useGitHubCliAuth = false } = {}) {
  return tokenFromEnv(env) || (useGitHubCliAuth ? githubCliExecutionToken(gh) : null)
}

function currentGitState(git = gitDefault) {
  const branch = git(['symbolic-ref', '--short', 'HEAD']).stdout
  const head = git(['rev-parse', 'HEAD']).stdout
  const status = git(['status', '--porcelain=v1'], { optional: true }).stdout
  const origin = git(['remote', 'get-url', 'origin']).stdout
  return {
    branch,
    head,
    clean: status.length === 0,
    origin,
  }
}

function remoteHead(git, branch) {
  const result = git(['ls-remote', '--heads', 'origin', branch], { optional: true, timeout: 120_000 })
  if (result.status !== 0) fail('release_pull_request_remote_read_failed')
  if (!result.stdout) return null
  const lines = result.stdout.split(/\r?\n/).filter(Boolean)
  if (lines.length !== 1) fail('release_pull_request_remote_ref_ambiguous')
  const [commit, ref, ...extra] = lines[0].split(/\s+/)
  if (extra.length || ref !== `refs/heads/${branch}`) fail('release_pull_request_remote_ref_invalid')
  return exactSha(commit, 'release_pull_request_remote_ref_invalid')
}

function assertNoSecretEcho(value) {
  const text = JSON.stringify(value || {})
  if (/Bearer\s+[A-Za-z0-9._-]+/i.test(text)
    || /gh[pousr]_[A-Za-z0-9_]{20,}/.test(text)
    || /github_pat_[A-Za-z0-9_]{20,}/.test(text)
    || /sk-[A-Za-z0-9_-]{20,}/.test(text)
    || /postgres(?:ql)?:\/\/[^"\s]+/i.test(text)
    || /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PRIVATE )?PRIVATE KEY-----/.test(text)) {
    fail('release_pull_request_secret_echo')
  }
}

export async function readGitHubMainProtectionSnapshotReceipt(path) {
  const absolute = resolve(path || '')
  const payload = await readFile(absolute, 'utf8')
  if (Buffer.byteLength(payload, 'utf8') < 1 || Buffer.byteLength(payload, 'utf8') > MAX_FILE_BYTES) {
    fail('release_pull_request_main_protection_snapshot_file_invalid')
  }
  let packet
  try {
    packet = validateGitHubMainProtectionSnapshot(JSON.parse(payload))
  } catch (error) {
    if (String(error?.message || '').startsWith('github_main_protection_snapshot_')) {
      fail('release_pull_request_main_protection_snapshot_invalid')
    }
    throw error
  }
  return {
    path: absolute,
    digest: digest(payload),
    packet,
  }
}

function buildMainProtectionEvidence(snapshotReceipt = null) {
  if (!snapshotReceipt?.packet) {
    return {
      path: null,
      digest: null,
      packetDigest: null,
      assessmentOk: false,
      currentAction: null,
      failures: ['github_main_protection_snapshot_missing'],
      verifiedForPullRequest: false,
    }
  }
  const packet = validateGitHubMainProtectionSnapshot(snapshotReceipt.packet)
  const failures = Array.isArray(packet.assessment?.failures) ? [...packet.assessment.failures] : []
  const verifiedForPullRequest = packet.assessment?.ok === true
    && packet.currentAction === 'main_protection_verified_continue_to_review_branch_push'
  return {
    path: snapshotReceipt.path || null,
    digest: snapshotReceipt.digest || null,
    packetDigest: packet.digest,
    assessmentOk: packet.assessment?.ok === true,
    currentAction: packet.currentAction,
    failures,
    verifiedForPullRequest,
  }
}

function requireMainProtectionVerified(snapshotReceipt) {
  const evidence = buildMainProtectionEvidence(snapshotReceipt)
  if (!evidence.verifiedForPullRequest) fail('release_pull_request_main_protection_unverified')
  return evidence
}

export async function readReleaseHandoffReceipt(path) {
  const absolute = resolve(path || '')
  const payload = await readFile(absolute, 'utf8')
  if (Buffer.byteLength(payload, 'utf8') < 1 || Buffer.byteLength(payload, 'utf8') > MAX_FILE_BYTES) {
    fail('release_pull_request_handoff_file_invalid')
  }
  let packet
  try {
    packet = validateReleaseHandoffPacket(JSON.parse(payload))
  } catch (error) {
    if (String(error?.message || '').startsWith('release_handoff_')) fail('release_pull_request_handoff_invalid')
    throw error
  }
  return {
    path: absolute,
    digest: digest(payload),
    packet,
  }
}

function approvalTemplate({ branch, commit }) {
  return `I approve one GitHub pull request creation from ${branch} at ${commit} into main for SuperMega review only. I do not approve merge, workflow dispatch, deployment, domain, environment, database, credential, payment, message, customer contact, stock, or production changes.`
}

function publicPullRequestBody({ branch, commit, handoffDigest, packetDigest }) {
  return [
    'SuperMega release-stack integration candidate for owner review.',
    '',
    `Candidate branch: \`${branch}\``,
    `Candidate commit: \`${commit}\``,
    `Release handoff file digest: \`${handoffDigest}\``,
    `Release handoff packet digest: \`${packetDigest}\``,
    '',
    'Scope: source review only. This PR is not approval to merge, deploy, mutate Supabase, change credentials, contact customers, process payments, move stock, change domains, or activate managed persistence.',
  ].join('\n')
}

function exactExecutionChallenge(value) {
  const challenge = String(value || '')
  if (!EXECUTION_CHALLENGE_PATTERN.test(challenge)) {
    fail('release_pull_request_owner_receipt_execution_challenge_required')
  }
  return challenge
}

function executionSeal(body, executionChallenge) {
  const challenge = exactExecutionChallenge(executionChallenge)
  return `hmac-sha256:${createHmac('sha256', Buffer.from(challenge, 'hex')).update(JSON.stringify(body)).digest('hex')}`
}

function sameExecutionSeal(actual, expected) {
  if (!EXECUTION_SEAL_PATTERN.test(String(actual || ''))
    || !EXECUTION_SEAL_PATTERN.test(String(expected || ''))) return false
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
}

function exactIso(value, code) {
  const text = String(value || '')
  const timestamp = Date.parse(text)
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== text) fail(code)
  return { text, timestamp }
}

function exactOwnerReceiptContext({ gate, handoffReceipt, mainProtectionSnapshotReceipt } = {}) {
  if (!isRecord(gate) || !isRecord(handoffReceipt?.packet)) {
    fail('release_pull_request_owner_receipt_context_required')
  }
  const mainProtection = requireMainProtectionVerified(mainProtectionSnapshotReceipt)
  const payload = buildCreatePullRequestPayload({ gate, handoffReceipt })
  const context = {
    repository: String(handoffReceipt.packet.repository || ''),
    origin: String(handoffReceipt.packet.remote?.origin || ''),
    branch: String(gate.branch || ''),
    commit: String(gate.commit || '').toLowerCase(),
    base: BASE_BRANCH,
    handoffFileDigest: String(handoffReceipt.digest || ''),
    handoffPacketDigest: String(handoffReceipt.packet.digest || ''),
    protectionFileDigest: String(mainProtection.digest || ''),
    protectionPacketDigest: String(mainProtection.packetDigest || ''),
    approvalTemplateDigest: digest(String(gate.approvalTemplate || '')),
    payloadDigest: digest(JSON.stringify(payload)),
  }
  if (context.repository !== REPOSITORY
    || context.origin !== ORIGIN
    || !BRANCH_PATTERN.test(context.branch)
    || !SHA_PATTERN.test(context.commit)
    || !DIGEST_PATTERN.test(context.handoffFileDigest)
    || !DIGEST_PATTERN.test(context.handoffPacketDigest)
    || !DIGEST_PATTERN.test(context.protectionFileDigest)
    || !DIGEST_PATTERN.test(context.protectionPacketDigest)
    || !DIGEST_PATTERN.test(context.approvalTemplateDigest)
    || !DIGEST_PATTERN.test(context.payloadDigest)) {
    fail('release_pull_request_owner_receipt_context_invalid')
  }
  return context
}

export function renderPullRequestOwnerConfirmation({
  gate,
  handoffReceipt,
  mainProtectionSnapshotReceipt,
} = {}) {
  const context = exactOwnerReceiptContext({ gate, handoffReceipt, mainProtectionSnapshotReceipt })
  return [
    'SuperMega owner gate',
    '',
    'Approve creation of exactly one review-only GitHub pull request?',
    '',
    `Repository: ${context.repository}`,
    `From branch: ${context.branch}`,
    `Exact commit: ${context.commit}`,
    `Into branch: ${context.base}`,
    '',
    'This can create only the exact SuperMega release-stack review PR shown above.',
    'It cannot push, merge, dispatch a workflow, deploy, change a domain or environment, mutate a database, change credentials, contact a customer, take payment, or move stock.',
    '',
    'This dialog expires after 10 minutes and fails closed if you do not choose Yes.',
    'A Yes receipt is valid only in this process for 10 minutes and is consumed before any PR write attempt.',
    'No is the default. Choose Yes only if you want this exact review-only PR created now.',
  ].join('\n')
}

export function buildPullRequestOwnerReceipt({
  gate,
  handoffReceipt,
  mainProtectionSnapshotReceipt,
  executionChallenge,
  confirmedAt = new Date(),
  nonce = randomBytes(32).toString('hex'),
} = {}) {
  const context = exactOwnerReceiptContext({ gate, handoffReceipt, mainProtectionSnapshotReceipt })
  const confirmedAtDate = confirmedAt instanceof Date ? confirmedAt : new Date(confirmedAt)
  if (!Number.isFinite(confirmedAtDate.getTime()) || !NONCE_PATTERN.test(String(nonce || ''))) {
    fail('release_pull_request_owner_receipt_confirmation_invalid')
  }
  const confirmedAtIso = confirmedAtDate.toISOString()
  const body = {
    ok: true,
    contract: RELEASE_PULL_REQUEST_OWNER_RECEIPT_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    decision: 'approved',
    action: {
      id: 'github_pull_request_create',
      repository: context.repository,
      origin: context.origin,
      branch: context.branch,
      commit: context.commit,
      base: context.base,
      method: 'POST',
      path: `/repos/${REPOSITORY}/pulls`,
      payloadDigest: context.payloadDigest,
      draft: false,
      maintainerCanModify: false,
      pushIncluded: false,
      mergeIncluded: false,
      workflowDispatchIncluded: false,
      deploymentIncluded: false,
    },
    binding: {
      releaseHandoffFileDigest: context.handoffFileDigest,
      releaseHandoffPacketDigest: context.handoffPacketDigest,
      githubMainProtectionFileDigest: context.protectionFileDigest,
      githubMainProtectionPacketDigest: context.protectionPacketDigest,
      approvalTemplateDigest: context.approvalTemplateDigest,
    },
    confirmation: {
      method: 'windows_local_owner_click',
      defaultDecision: 'decline',
      confirmedAt: confirmedAtIso,
      expiresAt: new Date(confirmedAtDate.getTime() + RELEASE_PULL_REQUEST_OWNER_RECEIPT_TTL_MS).toISOString(),
      ttlSeconds: RELEASE_PULL_REQUEST_OWNER_RECEIPT_TTL_MS / 1000,
      nonce,
    },
    authority: {
      pullRequestCreationApproved: true,
      pushApproved: false,
      mergeApproved: false,
      workflowDispatchApproved: false,
      deploymentApproved: false,
      domainChangeApproved: false,
      environmentChangeApproved: false,
      databaseMutationApproved: false,
      credentialChangeApproved: false,
      customerContactApproved: false,
      paymentApproved: false,
      stockMovementApproved: false,
      managedActivationApproved: false,
    },
    controls: {
      interactiveOwnerClickRequired: true,
      externalWritePerformed: false,
      reusable: false,
      identityRecorded: false,
    },
  }
  return signed({ ...body, executionSeal: executionSeal(body, executionChallenge) })
}

export function validatePullRequestOwnerReceipt(packet, {
  gate,
  handoffReceipt,
  mainProtectionSnapshotReceipt,
  executionChallenge,
  now = new Date(),
} = {}) {
  if (!isRecord(packet)) fail('release_pull_request_owner_receipt_invalid')
  const { digest: actualDigest, ...sealedBody } = packet
  if (actualDigest !== digest(JSON.stringify(sealedBody))) {
    fail('release_pull_request_owner_receipt_digest_invalid')
  }
  const { executionSeal: actualExecutionSeal, ...body } = sealedBody
  if (!sameExecutionSeal(actualExecutionSeal, executionSeal(body, executionChallenge))) {
    fail('release_pull_request_owner_receipt_execution_seal_invalid')
  }
  const context = exactOwnerReceiptContext({ gate, handoffReceipt, mainProtectionSnapshotReceipt })
  if (packet.ok !== true
    || packet.contract !== RELEASE_PULL_REQUEST_OWNER_RECEIPT_CONTRACT
    || packet.digestScope !== 'utf8_compact_json_without_digest'
    || packet.decision !== 'approved'
    || packet.action?.id !== 'github_pull_request_create'
    || packet.action?.repository !== context.repository
    || packet.action?.origin !== context.origin
    || packet.action?.branch !== context.branch
    || packet.action?.commit !== context.commit
    || packet.action?.base !== context.base
    || packet.action?.method !== 'POST'
    || packet.action?.path !== `/repos/${REPOSITORY}/pulls`
    || packet.action?.payloadDigest !== context.payloadDigest
    || packet.action?.draft !== false
    || packet.action?.maintainerCanModify !== false
    || packet.action?.pushIncluded !== false
    || packet.action?.mergeIncluded !== false
    || packet.action?.workflowDispatchIncluded !== false
    || packet.action?.deploymentIncluded !== false) {
    fail('release_pull_request_owner_receipt_action_mismatch')
  }
  if (packet.binding?.releaseHandoffFileDigest !== context.handoffFileDigest
    || packet.binding?.releaseHandoffPacketDigest !== context.handoffPacketDigest
    || packet.binding?.githubMainProtectionFileDigest !== context.protectionFileDigest
    || packet.binding?.githubMainProtectionPacketDigest !== context.protectionPacketDigest
    || packet.binding?.approvalTemplateDigest !== context.approvalTemplateDigest) {
    fail('release_pull_request_owner_receipt_binding_mismatch')
  }
  if (packet.confirmation?.method !== 'windows_local_owner_click'
    || packet.confirmation?.defaultDecision !== 'decline'
    || packet.confirmation?.ttlSeconds !== RELEASE_PULL_REQUEST_OWNER_RECEIPT_TTL_MS / 1000
    || !NONCE_PATTERN.test(String(packet.confirmation?.nonce || ''))) {
    fail('release_pull_request_owner_receipt_confirmation_invalid')
  }
  const confirmed = exactIso(packet.confirmation.confirmedAt, 'release_pull_request_owner_receipt_confirmation_invalid')
  const expires = exactIso(packet.confirmation.expiresAt, 'release_pull_request_owner_receipt_confirmation_invalid')
  const current = now instanceof Date ? now.getTime() : new Date(now).getTime()
  if (!Number.isFinite(current)
    || expires.timestamp - confirmed.timestamp !== RELEASE_PULL_REQUEST_OWNER_RECEIPT_TTL_MS
    || current < confirmed.timestamp
    || current >= expires.timestamp) {
    fail('release_pull_request_owner_receipt_expired_or_not_current')
  }
  const authority = packet.authority
  if (!isRecord(authority)
    || authority.pullRequestCreationApproved !== true
    || authority.pushApproved !== false
    || authority.mergeApproved !== false
    || authority.workflowDispatchApproved !== false
    || authority.deploymentApproved !== false
    || authority.domainChangeApproved !== false
    || authority.environmentChangeApproved !== false
    || authority.databaseMutationApproved !== false
    || authority.credentialChangeApproved !== false
    || authority.customerContactApproved !== false
    || authority.paymentApproved !== false
    || authority.stockMovementApproved !== false
    || authority.managedActivationApproved !== false
    || Object.keys(authority).length !== 13
    || packet.controls?.interactiveOwnerClickRequired !== true
    || packet.controls?.externalWritePerformed !== false
    || packet.controls?.reusable !== false
    || packet.controls?.identityRecorded !== false) {
    fail('release_pull_request_owner_receipt_authority_invalid')
  }
  return packet
}

export function confirmPullRequestOwnerClick(message, {
  platform = process.platform,
  spawn = spawnSync,
} = {}) {
  if (platform !== 'win32') fail('release_pull_request_owner_receipt_windows_required')
  const windowsRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows'
  const tempDir = process.env.TEMP || process.env.TMP || tmpdir()
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$result = [System.Windows.Forms.MessageBox]::Show($env:SUPERMEGA_OWNER_GATE_MESSAGE, $env:SUPERMEGA_OWNER_GATE_TITLE, [System.Windows.Forms.MessageBoxButtons]::YesNo, [System.Windows.Forms.MessageBoxIcon]::Warning, [System.Windows.Forms.MessageBoxDefaultButton]::Button2)',
    'if ($result -eq [System.Windows.Forms.DialogResult]::Yes) { Write-Output "APPROVED" } else { Write-Output "DECLINED" }',
  ].join('; ')
  const result = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-Sta', '-Command', script], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH || `${windowsRoot}\\System32;${windowsRoot}`,
      SystemRoot: windowsRoot,
      WINDIR: windowsRoot,
      TEMP: tempDir,
      TMP: tempDir,
      SUPERMEGA_OWNER_GATE_TITLE: 'SuperMega exact review pull request',
      SUPERMEGA_OWNER_GATE_MESSAGE: String(message || ''),
    },
    timeout: RELEASE_PULL_REQUEST_OWNER_DIALOG_TIMEOUT_MS,
    windowsHide: false,
  })
  if (result?.error?.code === 'ETIMEDOUT') fail('release_pull_request_owner_receipt_confirmation_timed_out')
  if (result?.error || result?.signal || result?.status !== 0) {
    fail('release_pull_request_owner_receipt_confirmation_failed')
  }
  return String(result.stdout || '').trim() === 'APPROVED'
}

export async function requestPullRequestOwnerReceipt({
  gate,
  handoffReceipt,
  mainProtectionSnapshotReceipt,
  executionChallenge,
  confirmer = confirmPullRequestOwnerClick,
  now = () => new Date(),
  nonce = () => randomBytes(32).toString('hex'),
} = {}) {
  exactExecutionChallenge(executionChallenge)
  const message = renderPullRequestOwnerConfirmation({ gate, handoffReceipt, mainProtectionSnapshotReceipt })
  if (await confirmer(message) !== true) fail('release_pull_request_owner_receipt_declined')
  return {
    packet: buildPullRequestOwnerReceipt({
      gate,
      handoffReceipt,
      mainProtectionSnapshotReceipt,
      executionChallenge,
      confirmedAt: now(),
      nonce: nonce(),
    }),
  }
}

export async function consumePullRequestOwnerReceipt(receipt) {
  const packetDigest = String(receipt?.packet?.digest || '')
  if (!DIGEST_PATTERN.test(packetDigest)) fail('release_pull_request_owner_receipt_read_required')
  if (consumedOwnerReceiptDigests.has(packetDigest)) fail('release_pull_request_owner_receipt_already_consumed')
  consumedOwnerReceiptDigests.add(packetDigest)
  return { ok: true, packetDigest }
}

export function validatePullRequestHandoff(packet) {
  if (!isRecord(packet)) fail('release_pull_request_handoff_required')
  const branch = String(packet.candidate?.branch || '')
  const commit = exactSha(packet.candidate?.commit, 'release_pull_request_commit_invalid')
  const remoteCommit = packet.remote?.candidateCommit == null
    ? null
    : exactSha(packet.remote.candidateCommit, 'release_pull_request_remote_commit_invalid')
  const remoteState = String(packet.remote?.candidateBranchState || '')

  if (packet.repository !== REPOSITORY || packet.remote?.origin !== ORIGIN) fail('release_pull_request_repository_invalid')
  if (!BRANCH_PATTERN.test(branch) || branch.includes('..') || branch.endsWith('/') || branch.includes('//')) {
    fail('release_pull_request_branch_invalid')
  }
  if (packet.candidate?.clean !== true) fail('release_pull_request_candidate_not_clean')
  if (packet.remote?.mainCommit !== exactSha(packet.remote?.mainCommit, 'release_pull_request_main_commit_invalid')) {
    fail('release_pull_request_main_commit_invalid')
  }
  if (!['unpublished', 'different', 'exact'].includes(remoteState)) fail('release_pull_request_remote_state_invalid')
  if (remoteState === 'unpublished' && remoteCommit !== null) fail('release_pull_request_remote_state_invalid')
  if (remoteState !== 'unpublished' && remoteCommit === null) fail('release_pull_request_remote_state_invalid')
  if (packet.nextAction?.forcePushAllowed !== false
    || packet.nextAction?.mergeIncluded !== false
    || packet.nextAction?.deploymentIncluded !== false) {
    fail('release_pull_request_release_handoff_action_invalid')
  }
  for (const [key, value] of Object.entries(packet.authority || {})) {
    if (value !== false) fail(`release_pull_request_authority_invalid:${key}`)
  }

  const remoteBranchExact = remoteState === 'exact' && remoteCommit === commit
  return {
    branch,
    commit,
    remoteState,
    remoteCommit,
    remoteBranchExact,
    approvalTemplate: approvalTemplate({ branch, commit }),
  }
}

function validateLocalState({ gate, gitState, execute }) {
  if (!isRecord(gitState)) fail('release_pull_request_git_state_required')
  if (gitState.origin !== ORIGIN) fail('release_pull_request_repository_invalid')
  if (gitState.branch !== gate.branch || gitState.head !== gate.commit) fail('release_pull_request_local_state_mismatch')
  if (execute && gitState.clean !== true) fail('release_pull_request_worktree_dirty')
  return true
}

export function validateOwnerApproval({
  gate,
  handoffReceipt = null,
  mainProtectionSnapshotReceipt = null,
  ownerApprovalReceipt = null,
  ownerApprovalChallenge = null,
  execute = false,
  now = new Date(),
} = {}) {
  if (!isRecord(gate)) fail('release_pull_request_gate_required')
  const expected = String(gate.approvalTemplate || '')
  if (!expected.includes('I approve one GitHub pull request creation') || !expected.includes('for SuperMega review only')) {
    fail('release_pull_request_approval_template_invalid')
  }
  const receiptPacket = ownerApprovalReceipt?.packet
    ? validatePullRequestOwnerReceipt(ownerApprovalReceipt.packet, {
        gate,
        handoffReceipt,
        mainProtectionSnapshotReceipt,
        executionChallenge: ownerApprovalChallenge,
        now,
      })
    : null
  const approved = receiptPacket !== null
  if (execute && !approved) fail('release_pull_request_owner_approval_required')
  return {
    env: null,
    method: approved ? 'in_process_owner_click_receipt' : 'none',
    approved,
    expectedDigest: digest(expected),
    actualDigest: receiptPacket?.digest || null,
    receipt: receiptPacket
      ? {
          contract: receiptPacket.contract,
          digest: receiptPacket.digest,
          expiresAt: receiptPacket.confirmation.expiresAt,
          consumed: false,
        }
      : null,
  }
}

function buildCreatePullRequestPayload({ gate, handoffReceipt }) {
  return {
    title: 'SuperMega release-stack integration rehearsal',
    head: gate.branch,
    base: BASE_BRANCH,
    body: publicPullRequestBody({
      branch: gate.branch,
      commit: gate.commit,
      handoffDigest: handoffReceipt.digest || null,
      packetDigest: handoffReceipt.packet?.digest || null,
    }),
    maintainer_can_modify: false,
    draft: false,
  }
}

export function buildPullRequestPlan({
  handoffReceipt,
  mainProtectionSnapshotReceipt = null,
  gitState = currentGitState(),
  env = process.env,
  gh = ghDefault,
  useGitHubCliAuth = false,
} = {}) {
  const gate = validatePullRequestHandoff(handoffReceipt?.packet)
  validateLocalState({ gate, gitState, execute: false })
  const approval = validateOwnerApproval({ gate, execute: false })
  const token = tokenForPlan({ env, gh, useGitHubCliAuth })
  const payload = buildCreatePullRequestPayload({ gate, handoffReceipt })
  const mainProtection = buildMainProtectionEvidence(mainProtectionSnapshotReceipt)
  const blockers = [
    ...(mainProtection.verifiedForPullRequest ? [] : [
      'github_main_protection_unverified',
      ...mainProtection.failures,
    ]),
    ...(gate.remoteBranchExact ? [] : ['remote_review_branch_not_exact']),
    ...(gitState.clean === true ? [] : ['local_worktree_dirty']),
    ...(approval.approved ? [] : ['owner_approval_missing']),
    ...(token ? [] : ['github_token_missing']),
  ]
  const body = {
    ok: true,
    contract: RELEASE_PULL_REQUEST_APPLY_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    mode: 'plan_only_no_github_write',
    repository: REPOSITORY,
    releaseHandoff: {
      path: handoffReceipt.path || null,
      digest: handoffReceipt.digest || null,
      packetDigest: handoffReceipt.packet?.digest || null,
    },
    candidate: {
      branch: gate.branch,
      head: gate.commit,
      clean: gitState.clean === true,
    },
    remoteBefore: {
      origin: ORIGIN,
      mainBranch: BASE_BRANCH,
      candidateBranchState: gate.remoteState,
      candidateCommit: gate.remoteCommit,
      branchExactForPr: gate.remoteBranchExact,
    },
    approval,
    githubMainProtection: mainProtection,
    token: {
      present: Boolean(token),
      env: token?.key || null,
      source: token?.source || null,
      valueExposed: false,
    },
    readiness: {
      executeReady: blockers.length === 0,
      blockers,
    },
    plannedNetworkReadsBeforeExecute: [
      'verify release handoff current state',
      'verify signed GitHub main-protection snapshot assessment.ok is true',
      `git ls-remote --heads origin ${gate.branch}`,
      `GET /repos/${REPOSITORY}/pulls?state=open&head=${OWNER}:${gate.branch}&base=${BASE_BRANCH}`,
      'gh auth status --hostname github.com when env token is absent',
    ],
    possibleWrite: {
      method: 'POST',
      path: `/repos/${REPOSITORY}/pulls`,
      payloadDigest: digest(JSON.stringify(payload)),
      payloadPreview: {
        title: payload.title,
        head: payload.head,
        base: payload.base,
        draft: payload.draft,
        maintainer_can_modify: payload.maintainer_can_modify,
      },
    },
    existingPullRequestPolicy: existingPullRequestPolicy(gate.branch),
    executionRequirements: [
      '--execute flag',
      'same-process Windows owner click sealed by an executor-generated challenge and consumed before any PR write attempt',
      'GITHUB_TOKEN, GH_TOKEN, or authenticated GitHub CLI keyring is available',
      'signed GitHub main-protection snapshot verifies assessment.ok:true',
      'release handoff re-verifies current remote/live state immediately before PR creation',
      'remote review branch equals the exact approved commit',
      'existing exact open PR returns no-write instead of duplicate creation',
      'local worktree is clean',
      'no existing open pull request conflicts with the branch/base pair',
    ],
    controls: {
      githubWritesApproved: approval.approved,
      ...githubWriteControls({ attempted: false, outcome: WRITE_CONFIRMED_NOT_PERFORMED }),
      ownerApprovalReceiptConsumed: false,
      repositorySettingsMutated: false,
      branchMutated: false,
      forcePushPerformed: false,
      branchDeletionPerformed: false,
      mergePerformed: false,
      workflowDispatchPerformed: false,
      deploymentPerformed: false,
      supabaseMutated: false,
      credentialValueExposed: false,
    },
  }
  assertNoSecretEcho(body)
  return signed(body)
}

export function validatePullRequestReport(packet, { expectedMode = null } = {}) {
  if (!isRecord(packet)) fail('release_pull_request_report_invalid')
  const { digest: actualDigest, ...body } = packet
  if (actualDigest !== digest(JSON.stringify(body))) fail('release_pull_request_report_digest_invalid')
  if (packet.contract !== RELEASE_PULL_REQUEST_APPLY_CONTRACT) fail('release_pull_request_report_contract_invalid')
  if (packet.repository !== REPOSITORY) fail('release_pull_request_report_repository_invalid')
  if (packet.digestScope !== 'utf8_compact_json_without_digest') fail('release_pull_request_report_digest_scope_invalid')
  if (expectedMode && packet.mode !== expectedMode) fail('release_pull_request_report_mode_invalid')
  if (!isRecord(packet.releaseHandoff)
    || !/^sha256:[0-9a-f]{64}$/.test(String(packet.releaseHandoff.digest || ''))
    || !/^sha256:[0-9a-f]{64}$/.test(String(packet.releaseHandoff.packetDigest || ''))) {
    fail('release_pull_request_report_handoff_invalid')
  }
  if (!isRecord(packet.candidate)
    || !BRANCH_PATTERN.test(String(packet.candidate.branch || ''))
    || !SHA_PATTERN.test(String(packet.candidate.head || ''))
    || typeof packet.candidate.clean !== 'boolean') {
    fail('release_pull_request_report_candidate_invalid')
  }
  if (!isRecord(packet.approval)
    || packet.approval.env !== null
    || typeof packet.approval.approved !== 'boolean'
    || !['none', 'in_process_owner_click_receipt'].includes(String(packet.approval.method || ''))
    || !/^sha256:[0-9a-f]{64}$/.test(String(packet.approval.expectedDigest || ''))) {
    fail('release_pull_request_report_approval_invalid')
  }
  if (packet.approval.method === 'in_process_owner_click_receipt') {
    if (packet.approval.approved !== true
      || packet.approval.receipt?.contract !== RELEASE_PULL_REQUEST_OWNER_RECEIPT_CONTRACT
      || !DIGEST_PATTERN.test(String(packet.approval.receipt?.digest || ''))
      || packet.approval.actualDigest !== packet.approval.receipt.digest
      || !Number.isFinite(Date.parse(String(packet.approval.receipt?.expiresAt || '')))
      || typeof packet.approval.receipt?.consumed !== 'boolean') {
      fail('release_pull_request_report_approval_receipt_invalid')
    }
  } else if (packet.approval.approved !== false
    || packet.approval.actualDigest !== null
    || packet.approval.receipt !== null) {
    fail('release_pull_request_report_approval_receipt_invalid')
  }
  if (!isRecord(packet.token) || packet.token.valueExposed !== false) {
    fail('release_pull_request_report_token_invalid')
  }
  if (!isRecord(packet.githubMainProtection)
    || typeof packet.githubMainProtection.assessmentOk !== 'boolean'
    || typeof packet.githubMainProtection.verifiedForPullRequest !== 'boolean'
    || !Array.isArray(packet.githubMainProtection.failures)) {
    fail('release_pull_request_report_main_protection_invalid')
  }
  if (packet.githubMainProtection.digest != null) {
    if (!/^sha256:[0-9a-f]{64}$/.test(String(packet.githubMainProtection.digest || ''))
      || !/^sha256:[0-9a-f]{64}$/.test(String(packet.githubMainProtection.packetDigest || ''))) {
      fail('release_pull_request_report_main_protection_invalid')
    }
  }
  if (packet.mode === 'plan_only_no_github_write') {
    if (packet.ok !== true
      || packet.controls?.githubWriteAttempted !== false
      || packet.controls?.githubWritesPerformed !== false
      || packet.controls?.githubWriteOutcome !== WRITE_CONFIRMED_NOT_PERFORMED
      || packet.controls?.githubWriteRetryAllowed !== false
      || packet.controls?.pullRequestCreated !== false
      || packet.controls?.ownerApprovalReceiptConsumed !== false
      || packet.controls?.repositorySettingsMutated !== false
      || packet.controls?.branchMutated !== false
      || packet.controls?.forcePushPerformed !== false
      || packet.controls?.branchDeletionPerformed !== false
      || packet.controls?.mergePerformed !== false
      || packet.controls?.workflowDispatchPerformed !== false
      || packet.controls?.deploymentPerformed !== false
      || packet.controls?.supabaseMutated !== false
      || packet.controls?.credentialValueExposed !== false) {
      fail('release_pull_request_plan_controls_invalid')
    }
    if (!isRecord(packet.readiness)
      || typeof packet.readiness.executeReady !== 'boolean'
      || !Array.isArray(packet.readiness.blockers)) {
      fail('release_pull_request_plan_readiness_invalid')
    }
    if (!Array.isArray(packet.plannedNetworkReadsBeforeExecute)
      || !packet.plannedNetworkReadsBeforeExecute.includes('verify release handoff current state')
      || !packet.plannedNetworkReadsBeforeExecute.includes('verify signed GitHub main-protection snapshot assessment.ok is true')
      || !packet.plannedNetworkReadsBeforeExecute.includes(`git ls-remote --heads origin ${packet.candidate.branch}`)
      || !packet.plannedNetworkReadsBeforeExecute.includes(`GET /repos/${REPOSITORY}/pulls?state=open&head=${OWNER}:${packet.candidate.branch}&base=${BASE_BRANCH}`)) {
      fail('release_pull_request_plan_reads_invalid')
    }
    if (packet.possibleWrite?.method !== 'POST'
      || packet.possibleWrite?.path !== `/repos/${REPOSITORY}/pulls`
      || !/^sha256:[0-9a-f]{64}$/.test(String(packet.possibleWrite?.payloadDigest || ''))
      || packet.possibleWrite?.payloadPreview?.head !== packet.candidate.branch
      || packet.possibleWrite?.payloadPreview?.base !== BASE_BRANCH
      || packet.possibleWrite?.payloadPreview?.draft !== false) {
      fail('release_pull_request_plan_write_invalid')
    }
    if (packet.existingPullRequestPolicy?.checkedDuringPlan !== false
      || packet.existingPullRequestPolicy?.checkedImmediatelyBeforeCreate !== true
      || packet.existingPullRequestPolicy?.query !== `GET /repos/${REPOSITORY}${pullsQueryPath(packet.candidate.branch)}`
      || packet.existingPullRequestPolicy?.exactOpenPullRequestResult !== 'return_existing_pr_without_github_write'
      || packet.existingPullRequestPolicy?.mismatchedOpenPullRequestResult !== 'fail_closed_release_pull_request_existing_pr_mismatch'
      || packet.existingPullRequestPolicy?.ambiguousOpenPullRequestResult !== 'fail_closed_release_pull_request_existing_pr_ambiguous'
      || packet.existingPullRequestPolicy?.duplicateCreationAllowed !== false) {
      fail('release_pull_request_plan_existing_pr_policy_invalid')
    }
    if (!Array.isArray(packet.executionRequirements)
      || !packet.executionRequirements.includes('--execute flag')
      || !packet.executionRequirements.includes('same-process Windows owner click sealed by an executor-generated challenge and consumed before any PR write attempt')
      || !packet.executionRequirements.includes('signed GitHub main-protection snapshot verifies assessment.ok:true')
      || !packet.executionRequirements.includes('remote review branch equals the exact approved commit')
      || !packet.executionRequirements.includes('existing exact open PR returns no-write instead of duplicate creation')) {
      fail('release_pull_request_plan_requirements_invalid')
    }
  } else if (packet.mode === 'executed_owner_approved_existing_pr_no_write'
    || packet.mode === 'executed_owner_approved_github_pr_write') {
    if (packet.approval.method !== 'in_process_owner_click_receipt'
      || packet.approval.approved !== true
      || packet.approval.receipt?.consumed !== true
      || packet.controls?.ownerApprovalReceiptConsumed !== true
      || packet.controls?.githubWritesApproved !== true
      || packet.controls?.repositorySettingsMutated !== false
      || packet.controls?.branchMutated !== false
      || packet.controls?.forcePushPerformed !== false
      || packet.controls?.branchDeletionPerformed !== false
      || packet.controls?.mergePerformed !== false
      || packet.controls?.workflowDispatchPerformed !== false
      || packet.controls?.deploymentPerformed !== false
      || packet.controls?.supabaseMutated !== false
      || packet.controls?.credentialValueExposed !== false
      || !isRecord(packet.pullRequest)) {
      fail('release_pull_request_execute_controls_invalid')
    }
    if (!Number.isSafeInteger(packet.pullRequest.number)
      || packet.pullRequest.state !== 'open'
      || packet.pullRequest.head !== packet.candidate.branch
      || packet.pullRequest.base !== BASE_BRANCH) {
      fail('release_pull_request_execute_pull_request_invalid')
    }
    if (!isRecord(packet.verification)
      || packet.verification.releaseHandoffCurrent !== true
      || packet.verification.remoteBranchObservedAtCreate !== packet.candidate.head
      || packet.verification.remoteBranchExactAtCreate !== true
      || packet.verification.existingPullRequestCheckedBeforeCreate !== true
      || packet.verification.duplicatePullRequestCreated !== false) {
      fail('release_pull_request_execute_verification_invalid')
    }
    if (packet.mode === 'executed_owner_approved_existing_pr_no_write') {
      if (packet.controls.githubWriteAttempted !== false
        || packet.controls.githubWritesPerformed !== false
        || packet.controls.githubWriteOutcome !== WRITE_CONFIRMED_NOT_PERFORMED
        || packet.controls.githubWriteRetryAllowed !== false
        || packet.controls.pullRequestCreated !== false
        || packet.verification.existingPullRequestResult !== 'exact_open_pr_reused') {
        fail('release_pull_request_existing_pr_controls_invalid')
      }
    } else if (packet.controls.githubWriteAttempted !== true
      || packet.controls.githubWritesPerformed !== true
      || packet.controls.githubWriteOutcome !== WRITE_CONFIRMED_PERFORMED
      || packet.controls.githubWriteRetryAllowed !== false
      || packet.controls.pullRequestCreated !== true
      || packet.verification.existingPullRequestResult !== 'none_before_create'
      || packet.verification.postCreateReadBackExact !== true
      || packet.action?.method !== 'POST'
      || packet.action?.path !== `/repos/${REPOSITORY}/pulls`) {
      fail('release_pull_request_create_controls_invalid')
    }
  } else {
    fail('release_pull_request_report_mode_invalid')
  }
  assertNoSecretEcho(packet)
  return packet
}

async function githubRequest({ path, method = 'GET', token, body, request = fetch }) {
  const response = await request(`${API_BASE}${path}`, {
    method,
    redirect: 'error',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': API_VERSION,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  const text = await response.text()
  let json = null
  if (text) {
    try { json = JSON.parse(text) } catch {
      fail('release_pull_request_response_json_invalid')
    }
  }
  if (!response.ok) return { ok: false, status: response.status, json }
  return { ok: true, status: response.status, json }
}

function pullsQueryPath(branch) {
  const params = new URLSearchParams({
    state: 'open',
    head: `${OWNER}:${branch}`,
    base: BASE_BRANCH,
    per_page: '10',
  })
  return `/pulls?${params.toString()}`
}

function existingPullRequestPolicy(branch) {
  return {
    checkedDuringPlan: false,
    checkedImmediatelyBeforeCreate: true,
    query: `GET /repos/${REPOSITORY}${pullsQueryPath(branch)}`,
    exactOpenPullRequestResult: 'return_existing_pr_without_github_write',
    mismatchedOpenPullRequestResult: 'fail_closed_release_pull_request_existing_pr_mismatch',
    ambiguousOpenPullRequestResult: 'fail_closed_release_pull_request_existing_pr_ambiguous',
    duplicateCreationAllowed: false,
  }
}

function classifyExistingPulls(pulls, gate) {
  if (!Array.isArray(pulls)) fail('release_pull_request_list_invalid')
  const relevant = pulls.filter((pull) => pull?.state === 'open'
    && pull?.base?.ref === BASE_BRANCH
    && pull?.head?.ref === gate.branch)
  if (relevant.length > 1) fail('release_pull_request_existing_pr_ambiguous')
  if (relevant.length === 0) return null
  const [pull] = relevant
  if (pull.head?.sha !== gate.commit) fail('release_pull_request_existing_pr_mismatch')
  return pull
}

function exactPullRequestShape(pull, gate) {
  return pull?.state === 'open'
    && pull?.head?.ref === gate.branch
    && pull?.head?.sha === gate.commit
    && pull?.base?.ref === BASE_BRANCH
    && Number.isSafeInteger(pull?.number)
}

export async function applyReleasePullRequestWithClient({
  handoffReceipt,
  mainProtectionSnapshotReceipt = null,
  ownerApprovalReceipt = null,
  ownerApprovalChallenge = null,
  env = process.env,
  git = gitDefault,
  gh = ghDefault,
  useGitHubCliAuth = false,
  request = fetch,
  verifyHandoff = verifyCurrentReleaseHandoff,
  consumeApprovalReceipt = consumePullRequestOwnerReceipt,
  now = () => new Date(),
} = {}) {
  let githubWriteAttempted = false
  let resolvedWriteOutcome = null
  let ownerApprovalReceiptConsumed = false
  try {
    const gate = validatePullRequestHandoff(handoffReceipt?.packet)
    const gitState = currentGitState(git)
    validateLocalState({ gate, gitState, execute: true })
    let approval = validateOwnerApproval({
      gate,
      handoffReceipt,
      mainProtectionSnapshotReceipt,
      ownerApprovalReceipt,
      ownerApprovalChallenge,
      execute: true,
      now: now(),
    })
    const mainProtection = requireMainProtectionVerified(mainProtectionSnapshotReceipt)
    const token = tokenForExecute({ env, gh, useGitHubCliAuth })
    if (!token) fail('release_pull_request_token_required')

    const verification = await verifyHandoff(handoffReceipt.path)
    if (verification?.ok !== true
      || verification.candidate?.branch !== gate.branch
      || verification.candidate?.commit !== gate.commit
      || verification.candidate?.clean !== true) {
      fail('release_pull_request_handoff_not_current')
    }

    const observedRemote = remoteHead(git, gate.branch)
    if (observedRemote !== gate.commit) fail('release_pull_request_remote_branch_not_exact')

    approval = validateOwnerApproval({
      gate,
      handoffReceipt,
      mainProtectionSnapshotReceipt,
      ownerApprovalReceipt,
      ownerApprovalChallenge,
      execute: true,
      now: now(),
    })
    const consumed = await consumeApprovalReceipt(ownerApprovalReceipt)
    if (consumed?.ok !== true || consumed.packetDigest !== approval.receipt.digest) {
      fail('release_pull_request_owner_receipt_consume_verify_failed')
    }
    approval = {
      ...approval,
      receipt: { ...approval.receipt, consumed: true },
    }
    ownerApprovalReceiptConsumed = true

    const existingResponse = await githubRequest({
      path: pullsQueryPath(gate.branch),
      token: token.value,
      request,
    })
    if (!existingResponse.ok) fail(`release_pull_request_list_failed:${existingResponse.status}`)
    const existing = classifyExistingPulls(existingResponse.json, gate)
    if (existing) {
      const body = {
        ok: true,
        contract: RELEASE_PULL_REQUEST_APPLY_CONTRACT,
        digestScope: 'utf8_compact_json_without_digest',
        mode: 'executed_owner_approved_existing_pr_no_write',
        repository: REPOSITORY,
        releaseHandoff: {
          path: handoffReceipt.path || null,
          digest: handoffReceipt.digest || null,
          packetDigest: handoffReceipt.packet?.digest || null,
        },
        candidate: { branch: gate.branch, head: gate.commit, clean: true },
        approval,
        githubMainProtection: mainProtection,
        token: { present: true, env: token.key, source: token.source || null, valueExposed: false },
        verification: {
          releaseHandoffCurrent: true,
          remoteBranchObservedAtCreate: observedRemote,
          remoteBranchExactAtCreate: true,
          existingPullRequestCheckedBeforeCreate: true,
          existingPullRequestResult: 'exact_open_pr_reused',
          duplicatePullRequestCreated: false,
        },
        pullRequest: {
          number: existing.number,
          state: existing.state,
          head: existing.head.ref,
          base: existing.base.ref,
          url: existing.html_url || null,
        },
        controls: {
          githubWritesApproved: true,
          ...githubWriteControls({ attempted: false, outcome: WRITE_CONFIRMED_NOT_PERFORMED }),
          ownerApprovalReceiptConsumed: true,
          repositorySettingsMutated: false,
          branchMutated: false,
          forcePushPerformed: false,
          branchDeletionPerformed: false,
          mergePerformed: false,
          workflowDispatchPerformed: false,
          deploymentPerformed: false,
          supabaseMutated: false,
          credentialValueExposed: false,
        },
      }
      assertNoSecretEcho(body)
      return signed(body)
    }

    const payload = buildCreatePullRequestPayload({ gate, handoffReceipt })
    let created = null
    let createFailure = null
    githubWriteAttempted = true
    try {
      created = await githubRequest({
        path: '/pulls',
        method: 'POST',
        token: token.value,
        body: payload,
        request,
      })
    } catch (error) {
      createFailure = error
    }
    if (created && !created.ok && created.status >= 400 && created.status < 500) {
      throw writeFailure(`release_pull_request_create_failed:${created.status}`, {
        attempted: true,
        outcome: WRITE_CONFIRMED_NOT_PERFORMED,
        ownerApprovalReceiptConsumed,
      })
    }
    if (created && !created.ok) createFailure = new Error(`release_pull_request_create_failed:${created.status}`)
    if (created?.ok && !exactPullRequestShape(created.json, gate)) {
      createFailure = new Error('release_pull_request_create_response_invalid')
    }

    let readBackResponse
    try {
      readBackResponse = await githubRequest({
        path: pullsQueryPath(gate.branch),
        token: token.value,
        request,
      })
    } catch (error) {
      throw writeFailure('release_pull_request_write_outcome_unknown', {
        attempted: true,
        outcome: WRITE_OUTCOME_UNKNOWN,
        ownerApprovalReceiptConsumed,
      })
    }
    if (!readBackResponse.ok) {
      throw writeFailure('release_pull_request_write_outcome_unknown', {
        attempted: true,
        outcome: WRITE_OUTCOME_UNKNOWN,
        ownerApprovalReceiptConsumed,
      })
    }
    const createdPull = classifyExistingPulls(readBackResponse.json, gate)
    if (!createdPull) {
      throw writeFailure('release_pull_request_write_outcome_unknown', {
        attempted: true,
        outcome: WRITE_OUTCOME_UNKNOWN,
        ownerApprovalReceiptConsumed,
      })
    }
    resolvedWriteOutcome = WRITE_CONFIRMED_PERFORMED

    const body = {
      ok: true,
      contract: RELEASE_PULL_REQUEST_APPLY_CONTRACT,
      digestScope: 'utf8_compact_json_without_digest',
      mode: 'executed_owner_approved_github_pr_write',
      repository: REPOSITORY,
      releaseHandoff: {
        path: handoffReceipt.path || null,
        digest: handoffReceipt.digest || null,
        packetDigest: handoffReceipt.packet?.digest || null,
      },
      candidate: { branch: gate.branch, head: gate.commit, clean: true },
      approval,
      githubMainProtection: mainProtection,
      token: { present: true, env: token.key, source: token.source || null, valueExposed: false },
      verification: {
        releaseHandoffCurrent: true,
        remoteBranchObservedAtCreate: observedRemote,
        remoteBranchExactAtCreate: true,
        existingPullRequestCheckedBeforeCreate: true,
        existingPullRequestResult: 'none_before_create',
        postCreateReadBackExact: true,
        duplicatePullRequestCreated: false,
      },
      action: {
        method: 'POST',
        path: `/repos/${REPOSITORY}/pulls`,
        status: created?.status ?? null,
        responseFailure: createFailure ? safeFailureCode(createFailure) : null,
      },
      pullRequest: {
        number: createdPull.number,
        state: createdPull.state,
        head: createdPull.head.ref,
        base: createdPull.base.ref,
        url: createdPull.html_url || null,
      },
      controls: {
        githubWritesApproved: true,
        ...githubWriteControls({ attempted: true, outcome: WRITE_CONFIRMED_PERFORMED }),
        ownerApprovalReceiptConsumed: true,
        repositorySettingsMutated: false,
        branchMutated: false,
        forcePushPerformed: false,
        branchDeletionPerformed: false,
        mergePerformed: false,
        workflowDispatchPerformed: false,
        deploymentPerformed: false,
        supabaseMutated: false,
        credentialValueExposed: false,
      },
    }
    assertNoSecretEcho(body)
    return signed(body)
  } catch (error) {
    throwWithWriteOutcome(error, {
      attempted: githubWriteAttempted,
      resolvedOutcome: resolvedWriteOutcome,
      ownerApprovalReceiptConsumed,
    })
  }
}

function parseArgs(argv) {
  const args = [...argv]
  const options = { mode: 'plan', handoff: null, githubProtectionSnapshot: null, output: null, verify: null }
  while (args.length) {
    const arg = args.shift()
    if (arg === '--plan') {
      options.mode = 'plan'
    } else if (arg === '--execute') {
      options.mode = 'execute'
    } else if (arg === '--self-test') {
      options.mode = 'self-test'
    } else if (arg === '--handoff' && args[0]) {
      options.handoff = args.shift()
    } else if ((arg === '--github-protection-snapshot' || arg === '--main-protection-snapshot') && args[0]) {
      options.githubProtectionSnapshot = args.shift()
    } else if (arg === '--output' && args[0]) {
      options.output = args.shift()
    } else if (arg === '--verify' && args[0]) {
      options.mode = 'verify'
      options.verify = args.shift()
    } else {
      fail('release_pull_request_usage_invalid')
    }
  }
  if (options.output && options.mode !== 'plan') fail('release_pull_request_output_plan_only')
  if (options.mode !== 'self-test' && options.mode !== 'verify' && !options.handoff) fail('release_pull_request_handoff_required')
  return options
}

async function writeExclusive(path, content) {
  const absolute = resolve(path)
  await mkdir(dirname(absolute), { recursive: true })
  await writeFile(absolute, content, { encoding: 'utf8', flag: 'wx' })
  return absolute
}

async function runSelfTest() {
  const branch = 'codex/release-stack-integration-rehearsal-20260825'
  const commit = 'a'.repeat(40)
  const packet = {
    repository: REPOSITORY,
    candidate: { branch, commit, clean: true },
    remote: {
      origin: ORIGIN,
      mainCommit: 'b'.repeat(40),
      candidateCommit: commit,
      candidateBranchState: 'exact',
    },
    nextAction: {
      forcePushAllowed: false,
      mergeIncluded: false,
      deploymentIncluded: false,
    },
    authority: {
      pushApproved: false,
      mergeApproved: false,
      workflowDispatchApproved: false,
      deploymentApproved: false,
      domainChangeApproved: false,
      providerMutationApproved: false,
      remoteWritesPerformed: false,
      providerWritesPerformed: false,
      credentialValuesInspected: false,
    },
  }
  const receipt = { path: '<self-test>', digest: `sha256:${'1'.repeat(64)}`, packet: { digest: `sha256:${'2'.repeat(64)}`, ...packet } }
  const mainProtectionSnapshotReceipt = {
    path: '<main-protection-self-test>',
    digest: `sha256:${'3'.repeat(64)}`,
    packet: {
      contract: 'supermega.github-main-protection-snapshot.v1',
      digestScope: 'utf8_compact_json_without_digest',
      generatedAt: '2026-08-25T00:00:00.000Z',
      repository: REPOSITORY,
      mode: 'read_only_no_github_write',
      source: {
        branchUrl: 'https://api.github.com/repos/swanhtet01/swanhtet01.github.io/branches/main',
        rulesetsUrl: 'https://api.github.com/repos/swanhtet01/swanhtet01.github.io/rulesets',
        tokenPresent: false,
        tokenEnv: null,
        tokenValueExposed: false,
      },
      branch: {
        name: 'main',
        protected: false,
        commit: { sha: 'b'.repeat(40) },
        protection: {
          enabled: false,
          required_status_checks: { contexts: [], checks: [] },
          allow_force_pushes: null,
          allow_deletions: null,
          required_pull_request_reviews: null,
          required_conversation_resolution: null,
        },
      },
      rulesets: [{
        id: 1,
        name: 'SuperMega main release gate',
        target: 'branch',
        enforcement: 'active',
        conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
        rules: [
          { type: 'deletion' },
          { type: 'non_fast_forward' },
          {
            type: 'pull_request',
            parameters: {
              required_review_thread_resolution: true,
              require_review_thread_resolution: false,
              requires_conversation_resolution: false,
              require_last_push_approval: false,
              required_approving_review_count: null,
            },
          },
          {
            type: 'required_status_checks',
            parameters: {
              required_status_checks: [
                { context: 'SuperMega App CI' },
                { context: 'Dependency Security Audit' },
                { context: 'Kernel Console - Verify & Owner-Gated Release' },
              ],
              contexts: [],
              strict_required_status_checks_policy: false,
              do_not_enforce_on_create: false,
            },
          },
        ],
      }],
      assessment: {
        ok: true,
        contract: 'supermega.github-main-protection.v1',
        failures: [],
        observedRequiredChecks: [
          'SuperMega App CI',
          'Dependency Security Audit',
          'Kernel Console - Verify & Owner-Gated Release',
        ],
        evidence: {
          branchProtected: false,
          activeMainRulesets: ['SuperMega main release gate'],
        },
      },
      currentAction: 'main_protection_verified_continue_to_review_branch_push',
      requiredChecks: [
        'SuperMega App CI',
        'Dependency Security Audit',
        'Kernel Console - Verify & Owner-Gated Release',
      ],
      controls: {
        githubApiMethods: ['GET'],
        githubWritesPerformed: false,
        repositorySettingsMutated: false,
        branchMutated: false,
        pullRequestCreated: false,
        mergePerformed: false,
        deploymentPerformed: false,
        supabaseMutated: false,
        credentialValueExposed: false,
      },
    },
  }
  mainProtectionSnapshotReceipt.packet.digest = digest(JSON.stringify(mainProtectionSnapshotReceipt.packet))
  mainProtectionSnapshotReceipt.packet = buildGitHubMainProtectionSnapshot({
    generatedAt: '2026-08-25T00:00:00.000Z',
    branch: {
      name: 'main',
      protected: false,
      commit: { sha: 'b'.repeat(40) },
      protection: { enabled: false, required_status_checks: { contexts: [], checks: [] } },
    },
    rulesets: [{
      id: 1,
      name: 'SuperMega main release gate',
      target: 'branch',
      enforcement: 'active',
      conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
      rules: [
        { type: 'deletion' },
        { type: 'non_fast_forward' },
        { type: 'pull_request', parameters: { required_review_thread_resolution: true } },
        {
          type: 'required_status_checks',
          parameters: {
            required_status_checks: [
              { context: 'SuperMega App CI' },
              { context: 'Dependency Security Audit' },
              { context: 'Kernel Console - Verify & Owner-Gated Release' },
            ],
          },
        },
      ],
    }],
  })
  const gate = validatePullRequestHandoff(packet)
  const plan = buildPullRequestPlan({
    handoffReceipt: receipt,
    mainProtectionSnapshotReceipt,
    gitState: { branch, head: commit, clean: true, origin: ORIGIN },
    env: {},
  })
  const checks = {
    plan_mode_does_not_write: plan.mode === 'plan_only_no_github_write'
      && plan.controls.githubWritesPerformed === false
      && plan.controls.pullRequestCreated === false,
    approval_required_for_execute: (() => {
      try {
        validateOwnerApproval({ gate, execute: true })
        return false
      } catch (error) {
        return String(error?.message || '') === 'release_pull_request_owner_approval_required'
      }
    })(),
    requires_exact_remote_branch: buildPullRequestPlan({
      handoffReceipt: {
        ...receipt,
        packet: {
          ...receipt.packet,
          remote: { ...receipt.packet.remote, candidateCommit: null, candidateBranchState: 'unpublished' },
        },
      },
      mainProtectionSnapshotReceipt,
      gitState: { branch, head: commit, clean: true, origin: ORIGIN },
      env: { GITHUB_TOKEN: 'placeholder' },
    }).readiness.blockers.includes('remote_review_branch_not_exact'),
    payload_is_public_review_only: plan.possibleWrite.payloadPreview.base === BASE_BRANCH
      && plan.possibleWrite.payloadPreview.head === branch
      && plan.possibleWrite.payloadPreview.draft === false,
    main_protection_required_for_execute: buildPullRequestPlan({
      handoffReceipt: receipt,
      gitState: { branch, head: commit, clean: true, origin: ORIGIN },
      env: { GITHUB_TOKEN: 'placeholder' },
    }).readiness.blockers.includes('github_main_protection_snapshot_missing'),
    plan_digest_verifies: validatePullRequestReport(plan, { expectedMode: 'plan_only_no_github_write' }) === plan,
    no_secret_echo: plan.token.valueExposed === false,
  }
  const failedChecks = Object.entries(checks).filter(([, ok]) => !ok).map(([key]) => key)
  return {
    ok: failedChecks.length === 0,
    contract: `${RELEASE_PULL_REQUEST_APPLY_CONTRACT}.self-test`,
    checks,
    failedChecks,
    githubWritesPerformed: false,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.mode === 'self-test') {
    const result = await runSelfTest()
    console.log(JSON.stringify(result, null, 2))
    if (!result.ok) process.exitCode = 1
    return
  }
  if (options.mode === 'verify') {
    const report = validatePullRequestReport(JSON.parse(await readFile(resolve(options.verify), 'utf8')), {
      expectedMode: 'plan_only_no_github_write',
    })
    console.log(JSON.stringify({
      ok: true,
      contract: report.contract,
      mode: report.mode,
      path: resolve(options.verify),
      digest: report.digest,
      repository: report.repository,
      githubWritesPerformed: false,
      pullRequestCreated: false,
    }, null, 2))
    return
  }
  const handoffReceipt = await readReleaseHandoffReceipt(options.handoff)
  const mainProtectionSnapshotReceipt = options.githubProtectionSnapshot
    ? await readGitHubMainProtectionSnapshotReceipt(options.githubProtectionSnapshot)
    : null
  let result
  if (options.mode === 'execute') {
    const gate = validatePullRequestHandoff(handoffReceipt.packet)
    const ownerApprovalChallenge = randomBytes(32).toString('hex')
    const ownerApprovalReceipt = await requestPullRequestOwnerReceipt({
      gate,
      handoffReceipt,
      mainProtectionSnapshotReceipt,
      executionChallenge: ownerApprovalChallenge,
    })
    result = await applyReleasePullRequestWithClient({
      handoffReceipt,
      mainProtectionSnapshotReceipt,
      ownerApprovalReceipt,
      ownerApprovalChallenge,
      useGitHubCliAuth: true,
    })
  } else {
    result = buildPullRequestPlan({ handoffReceipt, mainProtectionSnapshotReceipt, useGitHubCliAuth: true })
  }
  if (options.output) {
    const output = await writeExclusive(options.output, `${JSON.stringify(validatePullRequestReport(result, { expectedMode: 'plan_only_no_github_write' }), null, 2)}\n`)
    console.log(JSON.stringify({
      ok: true,
      contract: result.contract,
      mode: result.mode,
      output,
      digest: result.digest,
      githubWritesPerformed: false,
      pullRequestCreated: false,
    }, null, 2))
    return
  }
  console.log(JSON.stringify(result, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify(buildReleasePullRequestFailureReceipt(error), null, 2))
    process.exitCode = 1
  })
}
