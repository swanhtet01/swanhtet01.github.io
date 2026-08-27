#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
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

export const RELEASE_PULL_REQUEST_APPLY_CONTRACT = 'supermega.release-pull-request-apply.v1'

const root = resolve(import.meta.dirname, '..')
const REPOSITORY = 'swanhtet01/swanhtet01.github.io'
const OWNER = 'swanhtet01'
const REPO = 'swanhtet01.github.io'
const ORIGIN = `https://github.com/${REPOSITORY}.git`
const BASE_BRANCH = 'main'
const APPROVAL_ENV = 'SUPERMEGA_PULL_REQUEST_CREATION_APPROVAL'
const TOKEN_ENVS = ['GITHUB_TOKEN', 'GH_TOKEN']
const GH_CLI_TOKEN_KEY = 'gh_cli'
const API_BASE = `https://api.github.com/repos/${REPOSITORY}`
const API_VERSION = '2026-03-10'
const MAX_FILE_BYTES = 1_000_000
const SHA_PATTERN = /^[0-9a-f]{40}$/
const BRANCH_PATTERN = /^codex\/[a-z0-9][a-z0-9._/-]{0,119}$/

function fail(code) {
  throw new Error(code)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
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

export function validateOwnerApproval({ gate, env = process.env, execute = false } = {}) {
  if (!isRecord(gate)) fail('release_pull_request_gate_required')
  const expected = String(gate.approvalTemplate || '')
  if (!expected.includes('I approve one GitHub pull request creation') || !expected.includes('for SuperMega review only')) {
    fail('release_pull_request_approval_template_invalid')
  }
  const actual = String(env[APPROVAL_ENV] || '')
  const approved = actual === expected
  if (execute && !approved) fail('release_pull_request_owner_approval_required')
  return {
    env: APPROVAL_ENV,
    approved,
    expectedDigest: digest(expected),
    actualDigest: actual ? digest(actual) : null,
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
  const approval = validateOwnerApproval({ gate, env, execute: false })
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
      `${APPROVAL_ENV} exactly equals the owner approval template`,
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
      githubWritesPerformed: false,
      pullRequestCreated: false,
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
    || packet.approval.env !== APPROVAL_ENV
    || typeof packet.approval.approved !== 'boolean'
    || !/^sha256:[0-9a-f]{64}$/.test(String(packet.approval.expectedDigest || ''))) {
    fail('release_pull_request_report_approval_invalid')
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
      || packet.controls?.githubWritesPerformed !== false
      || packet.controls?.pullRequestCreated !== false
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
      || !packet.executionRequirements.includes('signed GitHub main-protection snapshot verifies assessment.ok:true')
      || !packet.executionRequirements.includes('remote review branch equals the exact approved commit')
      || !packet.executionRequirements.includes('existing exact open PR returns no-write instead of duplicate creation')) {
      fail('release_pull_request_plan_requirements_invalid')
    }
  } else if (packet.mode === 'executed_owner_approved_existing_pr_no_write'
    || packet.mode === 'executed_owner_approved_github_pr_write') {
    if (packet.controls?.githubWritesApproved !== true
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
      if (packet.controls.githubWritesPerformed !== false
        || packet.controls.pullRequestCreated !== false
        || packet.verification.existingPullRequestResult !== 'exact_open_pr_reused') {
        fail('release_pull_request_existing_pr_controls_invalid')
      }
    } else if (packet.controls.githubWritesPerformed !== true
      || packet.controls.pullRequestCreated !== true
      || packet.verification.existingPullRequestResult !== 'none_before_create'
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

export async function applyReleasePullRequestWithClient({
  handoffReceipt,
  mainProtectionSnapshotReceipt = null,
  env = process.env,
  git = gitDefault,
  gh = ghDefault,
  useGitHubCliAuth = false,
  request = fetch,
  verifyHandoff = verifyCurrentReleaseHandoff,
} = {}) {
  const gate = validatePullRequestHandoff(handoffReceipt?.packet)
  const gitState = currentGitState(git)
  validateLocalState({ gate, gitState, execute: true })
  const approval = validateOwnerApproval({ gate, env, execute: true })
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
        githubWritesPerformed: false,
        pullRequestCreated: false,
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
  const created = await githubRequest({
    path: '/pulls',
    method: 'POST',
    token: token.value,
    body: payload,
    request,
  })
  if (!created.ok) fail(`release_pull_request_create_failed:${created.status}`)
  if (created.json?.state !== 'open'
    || created.json?.head?.ref !== gate.branch
    || created.json?.head?.sha !== gate.commit
    || created.json?.base?.ref !== BASE_BRANCH
    || !Number.isSafeInteger(created.json?.number)) {
    fail('release_pull_request_create_response_invalid')
  }

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
      duplicatePullRequestCreated: false,
    },
    action: {
      method: 'POST',
      path: `/repos/${REPOSITORY}/pulls`,
      status: created.status,
    },
    pullRequest: {
      number: created.json.number,
      state: created.json.state,
      head: created.json.head.ref,
      base: created.json.base.ref,
      url: created.json.html_url || null,
    },
    controls: {
      githubWritesApproved: true,
      githubWritesPerformed: true,
      pullRequestCreated: true,
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
        validateOwnerApproval({ gate, env: {}, execute: true })
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
      env: { [APPROVAL_ENV]: gate.approvalTemplate, GITHUB_TOKEN: 'placeholder' },
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
  const result = options.mode === 'execute'
    ? await applyReleasePullRequestWithClient({ handoffReceipt, mainProtectionSnapshotReceipt, useGitHubCliAuth: true })
    : buildPullRequestPlan({ handoffReceipt, mainProtectionSnapshotReceipt, useGitHubCliAuth: true })
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
    console.error(JSON.stringify({
      ok: false,
      contract: RELEASE_PULL_REQUEST_APPLY_CONTRACT,
      error: String(error?.message || 'release_pull_request_failed').slice(0, 240),
      controls: {
        githubWritesPerformed: false,
        pullRequestCreated: false,
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
    }, null, 2))
    process.exitCode = 1
  })
}
