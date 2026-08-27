#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { open, lstat, mkdir, readFile, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'

import {
  GITHUB_MAIN_PROTECTION_SNAPSHOT_CONTRACT,
  collectGitHubMainProtectionSnapshot,
} from './collect_github_main_protection_snapshot.mjs'
import {
  REQUIRED_MAIN_CHECKS,
  assessGitHubMainProtection,
} from './verify_github_main_protection.mjs'

export const RELEASE_HANDOFF_CONTRACT = 'supermega.release-handoff.v2'

const root = resolve(import.meta.dirname, '..')
const REPOSITORY = 'swanhtet01/swanhtet01.github.io'
const ORIGIN = `https://github.com/${REPOSITORY}.git`
const APP_RELEASE_URL = 'https://app.supermega.dev/__release.json'
const PUBLIC_RELEASE_URL = 'https://supermega.dev/__release.json'
const LEGACY_RELEASE_BRANCH = 'agent/supermega-release-candidate'
const MAX_OUTPUT_BYTES = 1_000_000
const MAX_LIVE_BYTES = 65_536
const GITHUB_MAIN_PROTECTION_SNAPSHOT_ATTEMPTS = 3
const SHA_PATTERN = /^[0-9a-f]{40}$/
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/
const BRANCH_PATTERN = /^(?:agent|codex)\/[a-z0-9][a-z0-9._/-]{0,119}$/

function fail(reason) {
  throw new Error(reason)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function exactSha(value, reason) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!SHA_PATTERN.test(normalized)) fail(reason)
  return normalized
}

function exactDigest(value, reason) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!DIGEST_PATTERN.test(normalized)) fail(reason)
  return normalized
}

function exactCount(value, reason) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) fail(reason)
  return value
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function releaseIdentity(value, reason) {
  const text = (field) => {
    const candidate = String(value?.[field] || '')
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(candidate)) fail(reason)
    return candidate
  }
  return {
    commit: exactSha(value?.commit, reason),
    brandVersion: text('brandVersion'),
    contextVersion: text('contextVersion'),
    catalogVersion: text('catalogVersion'),
  }
}

export function validateWorkflowAuthority(source) {
  if (typeof source !== 'string'
    || !source.includes('name: SuperMega - Coordinated Verified Release')
    || !source.includes('workflow_dispatch:')
    || !source.includes('release_commit:')
    || !source.includes('confirmation:')
    || !source.includes('REQUESTED_RELEASE_COMMIT: ${{ inputs.release_commit }}')
    || !source.includes('RELEASE_CONFIRMATION: ${{ inputs.confirmation }}')
    || !source.includes('RELEASE_ACTOR: ${{ github.actor }}')
    || !source.includes('DEPLOY SUPERMEGA PAIRED PRODUCTION')
    || !source.includes('[ "$REQUESTED_RELEASE_COMMIT" != "$GITHUB_SHA" ]')
    || !source.includes('[ "$RELEASE_ACTOR" != "swanhtet01" ]')
    || /^\s*push:/m.test(source)
    || !source.includes("github.ref == 'refs/heads/main'")
    || !source.includes('environment: production')
    || !source.includes('permissions:\n  contents: read')
    || !source.includes('group: supermega-coordinated-production')
    || !source.includes('cancel-in-progress: false')
    || !source.includes('APP_VERCEL_PROJECT_ID: prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG')
    || !source.includes('PUBLIC_VERCEL_PROJECT_ID: prj_Yaf0cZYbiFXcLkMcKaAm4alPWMhR')
    || !source.includes('Capture app production rollback target')
    || !source.includes('Capture current production rollback target')
    || !source.includes('Roll back a failed production verification')) {
    fail('release_handoff_workflow_authority_invalid')
  }
  return {
    workflow: '.github/workflows/supermega-public-release.yml',
    productionEnvironment: 'production',
    sourceBranch: 'main',
    trigger: 'manual_exact_commit',
    ownerActor: 'swanhtet01',
    confirmation: 'DEPLOY SUPERMEGA PAIRED PRODUCTION',
    automaticPushDeployment: false,
    concurrency: 'supermega-coordinated-production',
    appProjectId: 'prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG',
    publicProjectId: 'prj_Yaf0cZYbiFXcLkMcKaAm4alPWMhR',
    rollbackRequired: true,
    workflowDigest: `sha256:${sha256(source)}`,
  }
}

export function validateReleaseCandidateAncestry(relations) {
  if (relations?.mainIsAncestor !== true) fail('release_handoff_candidate_diverged_from_main')
  if (relations?.liveIsAncestor !== true) fail('release_handoff_candidate_diverged_from_live')
  return true
}

function releaseWorkflowAuthority(value) {
  const workflowDigest = String(value?.workflowDigest || '')
  if (value?.workflow !== '.github/workflows/supermega-public-release.yml'
    || value.productionEnvironment !== 'production'
    || value.sourceBranch !== 'main'
    || value.trigger !== 'manual_exact_commit'
    || value.ownerActor !== 'swanhtet01'
    || value.confirmation !== 'DEPLOY SUPERMEGA PAIRED PRODUCTION'
    || value.automaticPushDeployment !== false
    || value.concurrency !== 'supermega-coordinated-production'
    || value.appProjectId !== 'prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG'
    || value.publicProjectId !== 'prj_Yaf0cZYbiFXcLkMcKaAm4alPWMhR'
    || value.rollbackRequired !== true
    || !/^sha256:[a-f0-9]{64}$/.test(workflowDigest)) {
    fail('release_handoff_workflow_authority_invalid')
  }
  return {
    workflow: value.workflow,
    productionEnvironment: value.productionEnvironment,
    sourceBranch: value.sourceBranch,
    trigger: value.trigger,
    ownerActor: value.ownerActor,
    confirmation: value.confirmation,
    automaticPushDeployment: false,
    concurrency: value.concurrency,
    appProjectId: value.appProjectId,
    publicProjectId: value.publicProjectId,
    rollbackRequired: true,
    workflowDigest,
  }
}

function githubMainProtectionEvidence(value) {
  if (!isRecord(value)) fail('release_handoff_github_main_protection_invalid')
  if (value.contract !== GITHUB_MAIN_PROTECTION_SNAPSHOT_CONTRACT
    || value.repository !== REPOSITORY
    || value.mode !== 'read_only_no_github_write') {
    fail('release_handoff_github_main_protection_invalid')
  }
  const generatedAt = String(value.generatedAt || '')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(generatedAt)
    || new Date(generatedAt).toISOString() !== generatedAt) {
    fail('release_handoff_github_main_protection_time_invalid')
  }
  if (!Array.isArray(value.requiredChecks)
    || value.requiredChecks.join(',') !== REQUIRED_MAIN_CHECKS.join(',')) {
    fail('release_handoff_github_main_protection_checks_invalid')
  }
  if (!isRecord(value.controls)
    || !Array.isArray(value.controls.githubApiMethods)
    || value.controls.githubApiMethods.join(',') !== 'GET') {
    fail('release_handoff_github_main_protection_controls_invalid')
  }
  for (const [key, controlValue] of Object.entries(value.controls)) {
    if (key !== 'githubApiMethods' && controlValue !== false) {
      fail(`release_handoff_github_main_protection_controls_invalid:${key}`)
    }
  }
  const assessment = assessGitHubMainProtection({ branch: value.branch, rulesets: value.rulesets })
  if (JSON.stringify(assessment) !== JSON.stringify(value.assessment)) {
    fail('release_handoff_github_main_protection_assessment_invalid')
  }
  const expectedAction = assessment.ok
    ? 'main_protection_verified_continue_to_review_branch_push'
    : 'apply_github_main_protection_after_owner_approval'
  if (value.currentAction !== expectedAction) fail('release_handoff_github_main_protection_action_invalid')
  return {
    contract: GITHUB_MAIN_PROTECTION_SNAPSHOT_CONTRACT,
    generatedAt,
    repository: REPOSITORY,
    mode: 'read_only_no_github_write',
    branch: value.branch,
    rulesets: value.rulesets,
    assessment,
    currentAction: value.currentAction,
    requiredChecks: [...REQUIRED_MAIN_CHECKS],
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
    snapshotDigest: exactDigest(value.snapshotDigest || value.digest, 'release_handoff_github_main_protection_digest_invalid'),
  }
}

function githubMainProtectionState(value) {
  const evidence = githubMainProtectionEvidence(value)
  const { generatedAt, snapshotDigest, ...state } = evidence
  return state
}

function boundedFailureReason(error) {
  return String(error?.message || 'unknown')
    .replace(/[^A-Za-z0-9_:.-]+/g, '_')
    .slice(0, 120)
}

export async function collectGitHubMainProtectionSnapshotForHandoff({
  collect = collectGitHubMainProtectionSnapshot,
  attempts = GITHUB_MAIN_PROTECTION_SNAPSHOT_ATTEMPTS,
  delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 5) {
    fail('release_handoff_github_main_protection_snapshot_attempts_invalid')
  }
  let lastError = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await collect()
      if (!isRecord(result) || !isRecord(result.packet)) {
        fail('release_handoff_github_main_protection_snapshot_result_invalid')
      }
      return result
    } catch (error) {
      lastError = error
      if (attempt >= attempts) break
      await delay(250 * attempt)
    }
  }
  fail(`release_handoff_github_main_protection_snapshot_unavailable:${boundedFailureReason(lastError)}`)
}

function reviewBranchPushAction({ remoteBranchState, branch, candidateCommit }) {
  const action = remoteBranchState === 'unpublished' ? 'initial' : 'fast-forward-only'
  return {
    kind: remoteBranchState === 'unpublished'
      ? 'owner_review_initial_branch_push'
      : 'owner_review_fast_forward_branch_push',
    branch,
    exactCommit: candidateCommit,
    forcePushAllowed: false,
    mergeIncluded: false,
    deploymentIncluded: false,
    approvalTemplate: `I approve one normal ${action} push of ${candidateCommit} to origin/${branch} for review only. I do not approve merge, workflow dispatch, deployment, domain, environment, database, credential, payment, message, customer contact, stock, or production changes.`,
  }
}

function githubMainProtectionAction({ branch, candidateCommit }) {
  return {
    kind: 'owner_review_github_main_protection',
    branch,
    exactCommit: candidateCommit,
    forcePushAllowed: false,
    mergeIncluded: false,
    deploymentIncluded: false,
    gitRemoteWriteIncluded: false,
    pullRequestIncluded: false,
    approvalTemplate: `I approve applying the SuperMega main release gate ruleset to ${REPOSITORY} main after reviewing the signed plan for ${candidateCommit}. I do not approve branch push, pull request creation, merge, workflow dispatch, deployment, domain, environment, database, credential, payment, message, customer contact, stock, or production changes.`,
  }
}

export function buildReleaseHandoff(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('release_handoff_input_invalid')
  const candidateCommit = exactSha(input.candidate?.commit, 'release_handoff_candidate_invalid')
  const remoteMainCommit = exactSha(input.remote?.mainCommit, 'release_handoff_remote_main_invalid')
  const liveApp = releaseIdentity(input.live?.app, 'release_handoff_live_app_invalid')
  const livePublic = releaseIdentity(input.live?.public, 'release_handoff_live_public_invalid')
  const branch = String(input.candidate?.branch || '')
  if (!BRANCH_PATTERN.test(branch) || branch === LEGACY_RELEASE_BRANCH) fail('release_handoff_branch_invalid')
  if (input.candidate?.clean !== true) fail('release_handoff_worktree_dirty')
  if (input.repository !== REPOSITORY || input.remote?.origin !== ORIGIN) fail('release_handoff_repository_invalid')
  validateReleaseCandidateAncestry(input.relations)
  if (input.verification?.passed !== true || input.verification?.verifiedCommit !== candidateCommit) fail('release_handoff_verification_invalid')
  if (JSON.stringify(liveApp) !== JSON.stringify(livePublic)) fail('release_handoff_live_pair_mismatch')

  const remoteCandidateCommit = input.remote?.candidateCommit == null
    ? null
    : exactSha(input.remote.candidateCommit, 'release_handoff_remote_candidate_invalid')
  const legacyCommit = input.legacyReleaseBranch?.commit == null
    ? null
    : exactSha(input.legacyReleaseBranch.commit, 'release_handoff_legacy_branch_invalid')
  const candidateAheadOfMain = exactCount(input.relations?.candidateAheadOfMain, 'release_handoff_main_count_invalid')
  const candidateAheadOfLive = exactCount(input.relations?.candidateAheadOfLive, 'release_handoff_live_count_invalid')
  const legacyOnly = exactCount(input.legacyReleaseBranch?.legacyOnlyCommits ?? 0, 'release_handoff_legacy_count_invalid')
  const candidateOnly = exactCount(input.legacyReleaseBranch?.candidateOnlyCommits ?? 0, 'release_handoff_candidate_count_invalid')
  const workflowAuthority = releaseWorkflowAuthority(input.verification?.workflowAuthority)
  const githubMainProtection = githubMainProtectionEvidence(input.githubMainProtection)
  if (candidateAheadOfMain < 1 || candidateAheadOfLive < 1) fail('release_handoff_no_release_delta')

  const remoteBranchState = remoteCandidateCommit === null
    ? 'unpublished'
    : remoteCandidateCommit === candidateCommit ? 'exact' : 'different'
  if (remoteBranchState === 'different' && input.relations?.remoteCandidateIsAncestor !== true) {
    fail('release_handoff_candidate_push_not_fast_forward')
  }
  if (legacyCommit && input.legacyReleaseBranch?.isAncestorOfCandidate === true) fail('release_handoff_legacy_disposition_invalid')

  const generatedAt = String(input.generatedAt || '')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(generatedAt)
    || new Date(generatedAt).toISOString() !== generatedAt) fail('release_handoff_time_invalid')

  const branchPushAction = reviewBranchPushAction({ remoteBranchState, branch, candidateCommit })
  const nextAction = githubMainProtection.assessment.ok === true
    ? branchPushAction
    : githubMainProtectionAction({ branch, candidateCommit })
  const body = {
    contract: RELEASE_HANDOFF_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt,
    repository: REPOSITORY,
    mode: 'owner_review_only',
    candidate: { branch, commit: candidateCommit, clean: true },
    remote: {
      origin: ORIGIN,
      mainCommit: remoteMainCommit,
      candidateCommit: remoteCandidateCommit,
      candidateBranchState: remoteBranchState,
    },
    live: {
      canonicalPair: ['https://supermega.dev', 'https://app.supermega.dev'],
      identity: liveApp,
    },
    githubMainProtection,
    relations: {
      mainIsAncestor: true,
      liveIsAncestor: true,
      candidateAheadOfMain,
      candidateAheadOfLive,
      remoteCandidateIsAncestor: remoteBranchState === 'different' ? true : null,
    },
    legacyReleaseBranch: {
      branch: LEGACY_RELEASE_BRANCH,
      commit: legacyCommit,
      disposition: legacyCommit ? 'diverged_superseded_review_only' : 'absent',
      legacyOnlyCommits: legacyOnly,
      candidateOnlyCommits: candidateOnly,
      forceUpdateAllowed: false,
    },
    verification: {
      command: 'npm run app:verify:local -- --serial',
      passed: true,
      verifiedCommit: candidateCommit,
      workflowAuthority,
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
    nextAction,
    actions: {
      reviewBranchPush: branchPushAction,
    },
  }
  return { ...body, digest: `sha256:${sha256(JSON.stringify(body))}` }
}

export function validateReleaseHandoffPacket(packet) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) fail('release_handoff_packet_invalid')
  const rebuilt = buildReleaseHandoff({
    generatedAt: packet.generatedAt,
    repository: packet.repository,
    candidate: packet.candidate,
    remote: {
      origin: packet.remote?.origin,
      mainCommit: packet.remote?.mainCommit,
      candidateCommit: packet.remote?.candidateCommit,
    },
    live: { app: packet.live?.identity, public: packet.live?.identity },
    githubMainProtection: packet.githubMainProtection,
    relations: packet.relations,
    legacyReleaseBranch: {
      commit: packet.legacyReleaseBranch?.commit,
      isAncestorOfCandidate: false,
      legacyOnlyCommits: packet.legacyReleaseBranch?.legacyOnlyCommits,
      candidateOnlyCommits: packet.legacyReleaseBranch?.candidateOnlyCommits,
    },
    verification: packet.verification,
  })
  if (JSON.stringify(rebuilt) !== JSON.stringify(packet)) fail('release_handoff_packet_invalid')
  return rebuilt
}

function run(file, args, { inherit = false, allowFailure = false } = {}) {
  const result = spawnSync(file, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
    maxBuffer: 16 * 1024 * 1024,
    // The canonical Windows runner executes hundreds of gates serially on the
    // Ally. Match the guarded production workflow's 35-minute hard bound so a
    // complete green run is possible without permitting an unbounded process.
    timeout: 35 * 60 * 1_000,
    windowsHide: true,
    stdio: inherit ? ['ignore', 'pipe', 'pipe'] : undefined,
  })
  const stdout = String(result.stdout || '')
  const stderr = String(result.stderr || '')
  if (inherit) {
    if (stdout) process.stdout.write(stdout)
    if (stderr) process.stderr.write(stderr)
  }
  if (!allowFailure && (result.error || result.signal || result.status !== 0)) fail('release_handoff_command_failed')
  return {
    status: result.status,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    signal: result.signal || null,
    errorCode: result.error?.code || null,
  }
}

function runStreaming(file, args, { timeoutMs = 35 * 60 * 1_000 } = {}) {
  return new Promise((resolve) => {
    let settled = false
    let timedOut = false
    let timer = null
    const child = spawn(file, args, {
      cwd: root,
      env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const finish = (result) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve(result)
    }
    timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, timeoutMs)
    child.stdout.on('data', (chunk) => process.stdout.write(chunk))
    child.stderr.on('data', (chunk) => process.stderr.write(chunk))
    child.on('error', (error) => finish({
      status: null,
      signal: null,
      errorCode: error?.code || 'spawn_error',
      timedOut,
    }))
    child.on('exit', (status, signal) => finish({
      status,
      signal: signal || null,
      errorCode: timedOut ? 'ETIMEDOUT' : null,
      timedOut,
    }))
  })
}

function git(...args) {
  return run('git', args).stdout
}

function isAncestor(ancestor, descendant) {
  const result = run('git', ['merge-base', '--is-ancestor', ancestor, descendant], { allowFailure: true })
  if (![0, 1].includes(result.status)) fail('release_handoff_ancestry_check_failed')
  return result.status === 0
}

function remoteHead(ref) {
  const output = git('ls-remote', '--heads', 'origin', ref)
  if (!output) return null
  const lines = output.split(/\r?\n/).filter(Boolean)
  if (lines.length !== 1) fail('release_handoff_remote_ref_ambiguous')
  const [commit, exactRef, ...extra] = lines[0].split(/\s+/)
  if (extra.length || exactRef !== `refs/heads/${ref}`) fail('release_handoff_remote_ref_invalid')
  return exactSha(commit, 'release_handoff_remote_ref_invalid')
}

function appVerifyCommand() {
  return {
    file: process.execPath,
    args: [resolve(root, 'tools', 'run_app_verify.mjs'), '--serial'],
  }
}

async function boundedJson(url) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) })
  if (!response.ok || !response.body) fail('release_handoff_live_fetch_failed')
  const reader = response.body.getReader()
  const chunks = []
  let bytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > MAX_LIVE_BYTES) {
      await reader.cancel()
      fail('release_handoff_live_response_too_large')
    }
    chunks.push(value)
  }
  try {
    return JSON.parse(Buffer.concat(chunks.map((value) => Buffer.from(value))).toString('utf8'))
  } catch {
    fail('release_handoff_live_json_invalid')
  }
}

export async function writeExclusiveJson(outputPath, packet) {
  const absolute = resolve(outputPath)
  await mkdir(dirname(absolute), { recursive: true })
  const existing = await lstat(absolute).catch(() => null)
  if (existing) fail('release_handoff_output_exists')
  const payload = `${JSON.stringify(packet, null, 2)}\n`
  if (Buffer.byteLength(payload) > MAX_OUTPUT_BYTES) fail('release_handoff_output_too_large')
  const handle = await open(absolute, 'wx', 0o600)
  try { await handle.writeFile(payload, 'utf8') } finally { await handle.close() }
  return {
    path: absolute,
    bytes: Buffer.byteLength(payload),
    digest: `sha256:${sha256(payload)}`,
    packetDigest: packet.digest,
  }
}

export async function withReleaseHandoffOutputLock(outputPath, action) {
  const absolute = resolve(outputPath)
  await mkdir(dirname(absolute), { recursive: true })
  const existing = await lstat(absolute).catch(() => null)
  if (existing) fail('release_handoff_output_exists')
  const lockPath = `${absolute}.lock`
  let handle
  try {
    handle = await open(lockPath, 'wx', 0o600)
  } catch (error) {
    if (error?.code === 'EEXIST') fail('release_handoff_output_lock_exists')
    throw error
  }
  try {
    await handle.writeFile(`${JSON.stringify({
      contract: `${RELEASE_HANDOFF_CONTRACT}.lock`,
      output: absolute,
      pid: process.pid,
      createdAt: new Date().toISOString(),
    })}\n`, 'utf8')
    return await action(absolute)
  } finally {
    await handle.close().catch(() => {})
    await rm(lockPath, { force: true }).catch(() => {})
  }
}

function parseArgs(argv) {
  if (argv.length !== 2 || !argv[1]) fail('release_handoff_path_required')
  if (argv[0] === '--output') return { mode: 'prepare', path: argv[1] }
  if (argv[0] === '--verify') return { mode: 'verify', path: argv[1] }
  fail('release_handoff_mode_invalid')
}

async function prepareReleaseHandoff(output) {
  return withReleaseHandoffOutputLock(output, async (lockedOutput) => {
  const branch = git('symbolic-ref', '--short', 'HEAD')
  const candidateCommit = exactSha(git('rev-parse', 'HEAD'), 'release_handoff_candidate_invalid')
  const origin = git('remote', 'get-url', 'origin')
  if (origin !== ORIGIN) fail('release_handoff_repository_invalid')
  if (git('status', '--porcelain=v1')) fail('release_handoff_worktree_dirty')
  const remoteMainCommit = remoteHead('main')
  const remoteCandidateCommit = remoteHead(branch)
  const legacyCommit = remoteHead(LEGACY_RELEASE_BRANCH)
  if (!remoteMainCommit) fail('release_handoff_remote_main_missing')
  const workflowSource = await readFile(resolve(root, '.github/workflows/supermega-public-release.yml'), 'utf8')
  const workflowAuthority = validateWorkflowAuthority(workflowSource.replace(/\r\n?/g, '\n'))
  const [app, publicRelease] = await Promise.all([boundedJson(APP_RELEASE_URL), boundedJson(PUBLIC_RELEASE_URL)])

  const relations = {
    mainIsAncestor: isAncestor(remoteMainCommit, candidateCommit),
    liveIsAncestor: isAncestor(app.commit, candidateCommit),
    remoteCandidateIsAncestor: remoteCandidateCommit ? isAncestor(remoteCandidateCommit, candidateCommit) : null,
    candidateAheadOfMain: Number(git('rev-list', '--count', `${remoteMainCommit}..${candidateCommit}`)),
    candidateAheadOfLive: Number(git('rev-list', '--count', `${app.commit}..${candidateCommit}`)),
  }
  validateReleaseCandidateAncestry(relations)

  const verificationCommand = appVerifyCommand()
  const verified = process.env.SUPERMEGA_RELEASE_HANDOFF_STREAM === '1'
    ? await runStreaming(verificationCommand.file, verificationCommand.args)
    : run(verificationCommand.file, verificationCommand.args, { inherit: true, allowFailure: true })
  if (verified.errorCode) fail(`release_handoff_app_verify_spawn_error:${verified.errorCode}`)
  if (verified.signal) fail(`release_handoff_app_verify_signal:${verified.signal}`)
  if (verified.status !== 0) fail('release_handoff_app_verify_failed')
  if (git('rev-parse', 'HEAD') !== candidateCommit || git('status', '--porcelain=v1')) fail('release_handoff_candidate_changed_during_verify')

  const { packet: githubMainProtection } = await collectGitHubMainProtectionSnapshotForHandoff()
  const legacyCounts = legacyCommit ? git('rev-list', '--left-right', '--count', `${legacyCommit}...${candidateCommit}`).split(/\s+/).map(Number) : [0, 0]
  const packet = buildReleaseHandoff({
    generatedAt: new Date().toISOString(),
    repository: REPOSITORY,
    candidate: { branch, commit: candidateCommit, clean: true },
    remote: { origin, mainCommit: remoteMainCommit, candidateCommit: remoteCandidateCommit },
    live: { app, public: publicRelease },
    relations,
    legacyReleaseBranch: {
      commit: legacyCommit,
      isAncestorOfCandidate: legacyCommit ? isAncestor(legacyCommit, candidateCommit) : null,
      legacyOnlyCommits: legacyCounts[0],
      candidateOnlyCommits: legacyCounts[1],
    },
    verification: { passed: true, verifiedCommit: candidateCommit, workflowAuthority },
    githubMainProtection,
  })
  const receipt = await writeExclusiveJson(lockedOutput, packet)
  return { ok: true, contract: RELEASE_HANDOFF_CONTRACT, ...receipt }
  })
}

export async function verifyCurrentReleaseHandoff(inputPath) {
  const absolute = resolve(inputPath)
  const metadata = await lstat(absolute).catch(() => null)
  if (!metadata || !metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 1 || metadata.size > MAX_OUTPUT_BYTES) {
    fail('release_handoff_file_invalid')
  }
  const payload = await readFile(absolute, 'utf8')
  if (Buffer.byteLength(payload) !== metadata.size) fail('release_handoff_file_changed')
  let packet
  try { packet = validateReleaseHandoffPacket(JSON.parse(payload)) } catch (error) {
    if (String(error?.message || '').startsWith('release_handoff_')) throw error
    fail('release_handoff_packet_invalid')
  }

  const branch = git('symbolic-ref', '--short', 'HEAD')
  const head = exactSha(git('rev-parse', 'HEAD'), 'release_handoff_candidate_invalid')
  const origin = git('remote', 'get-url', 'origin')
  if (git('status', '--porcelain=v1')) fail('release_handoff_worktree_dirty')
  if (branch !== packet.candidate.branch || head !== packet.candidate.commit || origin !== packet.remote.origin) {
    fail('release_handoff_local_state_changed')
  }

  const remoteMainCommit = remoteHead('main')
  const remoteCandidateCommit = remoteHead(branch)
  const legacyCommit = remoteHead(LEGACY_RELEASE_BRANCH)
  if (remoteMainCommit !== packet.remote.mainCommit
    || remoteCandidateCommit !== packet.remote.candidateCommit
    || legacyCommit !== packet.legacyReleaseBranch.commit) {
    fail('release_handoff_remote_state_changed')
  }

  const workflowSource = await readFile(resolve(root, '.github/workflows/supermega-public-release.yml'), 'utf8')
  const workflowAuthority = validateWorkflowAuthority(workflowSource.replace(/\r\n?/g, '\n'))
  if (JSON.stringify(workflowAuthority) !== JSON.stringify(packet.verification.workflowAuthority)) {
    fail('release_handoff_workflow_state_changed')
  }

  const [app, publicRelease] = await Promise.all([boundedJson(APP_RELEASE_URL), boundedJson(PUBLIC_RELEASE_URL)])
  const appIdentity = releaseIdentity(app, 'release_handoff_live_app_invalid')
  const publicIdentity = releaseIdentity(publicRelease, 'release_handoff_live_public_invalid')
  if (JSON.stringify(appIdentity) !== JSON.stringify(packet.live.identity)
    || JSON.stringify(publicIdentity) !== JSON.stringify(packet.live.identity)) {
    fail('release_handoff_live_state_changed')
  }
  const { packet: currentGitHubMainProtection } = await collectGitHubMainProtectionSnapshotForHandoff()
  if (JSON.stringify(githubMainProtectionState(currentGitHubMainProtection))
    !== JSON.stringify(githubMainProtectionState(packet.githubMainProtection))) {
    fail('release_handoff_github_main_protection_state_changed')
  }

  const legacyCounts = legacyCommit ? git('rev-list', '--left-right', '--count', `${legacyCommit}...${head}`).split(/\s+/).map(Number) : [0, 0]
  const currentRelations = {
    mainIsAncestor: isAncestor(remoteMainCommit, head),
    liveIsAncestor: isAncestor(appIdentity.commit, head),
    candidateAheadOfMain: Number(git('rev-list', '--count', `${remoteMainCommit}..${head}`)),
    candidateAheadOfLive: Number(git('rev-list', '--count', `${appIdentity.commit}..${head}`)),
    remoteCandidateIsAncestor: remoteCandidateCommit && remoteCandidateCommit !== head ? isAncestor(remoteCandidateCommit, head) : null,
  }
  if (JSON.stringify(currentRelations) !== JSON.stringify(packet.relations)
    || legacyCounts[0] !== packet.legacyReleaseBranch.legacyOnlyCommits
    || legacyCounts[1] !== packet.legacyReleaseBranch.candidateOnlyCommits
    || (legacyCommit ? isAncestor(legacyCommit, head) : false)) {
    fail('release_handoff_relation_state_changed')
  }

  return {
    ok: true,
    contract: RELEASE_HANDOFF_CONTRACT,
    mode: 'owner_review_only',
    path: absolute,
    bytes: Buffer.byteLength(payload),
    digest: `sha256:${sha256(payload)}`,
    packetDigest: packet.digest,
    candidate: packet.candidate,
    liveCommit: packet.live.identity.commit,
    remoteMainCommit: packet.remote.mainCommit,
    remoteCandidateState: packet.remote.candidateBranchState,
    githubMainProtection: {
      assessmentOk: packet.githubMainProtection.assessment.ok,
      currentAction: packet.githubMainProtection.currentAction,
      failures: packet.githubMainProtection.assessment.failures,
    },
    nextAction: {
      kind: packet.nextAction.kind,
      exactCommit: packet.nextAction.exactCommit,
      forcePushAllowed: false,
      mergeIncluded: false,
      deploymentIncluded: false,
    },
    authority: packet.authority,
  }
}

async function main() {
  const request = parseArgs(process.argv.slice(2))
  const receipt = request.mode === 'prepare'
    ? await prepareReleaseHandoff(request.path)
    : await verifyCurrentReleaseHandoff(request.path)
  process.stdout.write(`${JSON.stringify(receipt)}\n`)
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, contract: RELEASE_HANDOFF_CONTRACT, reason: String(error?.message || 'release_handoff_failed').slice(0, 160) })}\n`)
    process.exitCode = 1
  })
}
