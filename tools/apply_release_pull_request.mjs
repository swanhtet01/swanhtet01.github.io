#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  validateReleaseHandoffPacket,
  verifyCurrentReleaseHandoff,
} from './prepare_release_handoff.mjs'

export const RELEASE_PULL_REQUEST_APPLY_CONTRACT = 'supermega.release-pull-request-apply.v1'

const root = resolve(import.meta.dirname, '..')
const REPOSITORY = 'swanhtet01/swanhtet01.github.io'
const OWNER = 'swanhtet01'
const REPO = 'swanhtet01.github.io'
const ORIGIN = `https://github.com/${REPOSITORY}.git`
const BASE_BRANCH = 'main'
const APPROVAL_ENV = 'SUPERMEGA_PULL_REQUEST_CREATION_APPROVAL'
const TOKEN_ENVS = ['GITHUB_TOKEN', 'GH_TOKEN']
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

function exactSha(value, code) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!SHA_PATTERN.test(normalized)) fail(code)
  return normalized
}

function tokenFromEnv(env = process.env) {
  for (const key of TOKEN_ENVS) {
    const value = String(env[key] || '').trim()
    if (value) return { key, value }
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
  gitState = currentGitState(),
  env = process.env,
} = {}) {
  const gate = validatePullRequestHandoff(handoffReceipt?.packet)
  validateLocalState({ gate, gitState, execute: false })
  const approval = validateOwnerApproval({ gate, env, execute: false })
  const token = tokenFromEnv(env)
  const payload = buildCreatePullRequestPayload({ gate, handoffReceipt })
  const blockers = [
    ...(gate.remoteBranchExact ? [] : ['remote_review_branch_not_exact']),
    ...(gitState.clean === true ? [] : ['local_worktree_dirty']),
    ...(approval.approved ? [] : ['owner_approval_missing']),
    ...(token ? [] : ['github_token_missing']),
  ]
  const body = {
    ok: true,
    contract: RELEASE_PULL_REQUEST_APPLY_CONTRACT,
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
    token: {
      present: Boolean(token),
      env: token?.key || null,
      valueExposed: false,
    },
    readiness: {
      executeReady: blockers.length === 0,
      blockers,
    },
    plannedNetworkReadsBeforeExecute: [
      'verify release handoff current state',
      `git ls-remote --heads origin ${gate.branch}`,
      `GET /repos/${REPOSITORY}/pulls?state=open&head=${OWNER}:${gate.branch}&base=${BASE_BRANCH}`,
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
    executionRequirements: [
      '--execute flag',
      `${APPROVAL_ENV} exactly equals the owner approval template`,
      'GITHUB_TOKEN or GH_TOKEN is set',
      'release handoff re-verifies current remote/live state immediately before PR creation',
      'remote review branch equals the exact approved commit',
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
  return body
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
  env = process.env,
  git = gitDefault,
  request = fetch,
  verifyHandoff = verifyCurrentReleaseHandoff,
} = {}) {
  const gate = validatePullRequestHandoff(handoffReceipt?.packet)
  const gitState = currentGitState(git)
  validateLocalState({ gate, gitState, execute: true })
  const approval = validateOwnerApproval({ gate, env, execute: true })
  const token = tokenFromEnv(env)
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
      mode: 'executed_owner_approved_existing_pr_no_write',
      repository: REPOSITORY,
      candidate: { branch: gate.branch, head: gate.commit, clean: true },
      approval,
      token: { present: true, env: token.key, valueExposed: false },
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
    return body
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
    mode: 'executed_owner_approved_github_pr_write',
    repository: REPOSITORY,
    candidate: { branch: gate.branch, head: gate.commit, clean: true },
    approval,
    token: { present: true, env: token.key, valueExposed: false },
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
  return body
}

function parseArgs(argv) {
  const args = [...argv]
  const options = { mode: 'plan', handoff: null }
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
    } else {
      fail('release_pull_request_usage_invalid')
    }
  }
  if (options.mode !== 'self-test' && !options.handoff) fail('release_pull_request_handoff_required')
  return options
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
  const gate = validatePullRequestHandoff(packet)
  const plan = buildPullRequestPlan({
    handoffReceipt: receipt,
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
      gitState: { branch, head: commit, clean: true, origin: ORIGIN },
      env: { GITHUB_TOKEN: 'placeholder' },
    }).readiness.blockers.includes('remote_review_branch_not_exact'),
    payload_is_public_review_only: plan.possibleWrite.payloadPreview.base === BASE_BRANCH
      && plan.possibleWrite.payloadPreview.head === branch
      && plan.possibleWrite.payloadPreview.draft === false,
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
  const handoffReceipt = await readReleaseHandoffReceipt(options.handoff)
  const result = options.mode === 'execute'
    ? await applyReleasePullRequestWithClient({ handoffReceipt })
    : buildPullRequestPlan({ handoffReceipt })
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

