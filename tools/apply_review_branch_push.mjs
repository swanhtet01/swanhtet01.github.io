#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  validateReleaseHandoffPacket,
  verifyCurrentReleaseHandoff,
} from './prepare_release_handoff.mjs'
import {
  buildGitHubMainProtectionSnapshot,
  validateGitHubMainProtectionSnapshot,
} from './collect_github_main_protection_snapshot.mjs'
import {
  REVIEW_BRANCH_PUSH_OWNER_RECEIPT_CONTRACT,
  consumeReviewBranchPushOwnerReceipt,
  requestReviewBranchPushOwnerReceipt,
  validateReviewBranchPushOwnerReceipt,
} from './review_branch_push_owner_receipt.mjs'

export const REVIEW_BRANCH_PUSH_APPLY_CONTRACT = 'supermega.review-branch-push-apply.v2'

const root = resolve(import.meta.dirname, '..')
const REPOSITORY = 'swanhtet01/swanhtet01.github.io'
const ORIGIN = `https://github.com/${REPOSITORY}.git`
const SHA_PATTERN = /^[0-9a-f]{40}$/
const BRANCH_PATTERN = /^codex\/[a-z0-9][a-z0-9._/-]{0,119}$/
const MAX_FILE_BYTES = 1_000_000

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
    fail(`review_branch_push_git_failed:${String(args[0] || 'git').slice(0, 40)}`)
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

function assertNoSecretEcho(value) {
  const text = JSON.stringify(value || {})
  if (/Bearer\s+[A-Za-z0-9._-]+/i.test(text)
    || /gh[pousr]_[A-Za-z0-9_]{20,}/.test(text)
    || /github_pat_[A-Za-z0-9_]{20,}/.test(text)
    || /sk-[A-Za-z0-9_-]{20,}/.test(text)
    || /postgres(?:ql)?:\/\/[^"\s]+/i.test(text)) {
    fail('review_branch_push_secret_echo')
  }
}

function remoteHead(git, branch) {
  const result = git(['ls-remote', '--heads', 'origin', branch], { optional: true, timeout: 120_000 })
  if (result.status !== 0) fail('review_branch_push_remote_read_failed')
  if (!result.stdout) return null
  const lines = result.stdout.split(/\r?\n/).filter(Boolean)
  if (lines.length !== 1) fail('review_branch_push_remote_ref_ambiguous')
  const [commit, ref, ...extra] = lines[0].split(/\s+/)
  if (extra.length || ref !== `refs/heads/${branch}`) fail('review_branch_push_remote_ref_invalid')
  return exactSha(commit, 'review_branch_push_remote_ref_invalid')
}

function reviewBranchPushCommand(gate) {
  const remoteRef = `refs/heads/${gate.branch}`
  // --force-with-lease is used only as compare-and-swap. The separate ancestry proof below
  // requires the approved remote head to be an ancestor of the candidate, so this cannot
  // authorize a non-fast-forward update. If the ref changes after the final read, Git rejects it.
  const lease = `--force-with-lease=${remoteRef}:${gate.remoteCommit || ''}`
  return ['git', 'push', lease, 'origin', `${gate.commit}:${remoteRef}`]
}

export async function readReleaseHandoffReceipt(path) {
  const absolute = resolve(path || '')
  const payload = await readFile(absolute, 'utf8')
  if (Buffer.byteLength(payload, 'utf8') < 1 || Buffer.byteLength(payload, 'utf8') > MAX_FILE_BYTES) {
    fail('review_branch_push_handoff_file_invalid')
  }
  let packet
  try {
    packet = validateReleaseHandoffPacket(JSON.parse(payload))
  } catch (error) {
    if (String(error?.message || '').startsWith('release_handoff_')) fail('review_branch_push_handoff_invalid')
    throw error
  }
  return {
    path: absolute,
    digest: digest(payload),
    packet,
  }
}

export async function readGitHubMainProtectionSnapshotReceipt(path) {
  const absolute = resolve(path || '')
  const payload = await readFile(absolute, 'utf8')
  if (Buffer.byteLength(payload, 'utf8') < 1 || Buffer.byteLength(payload, 'utf8') > MAX_FILE_BYTES) {
    fail('review_branch_push_main_protection_snapshot_file_invalid')
  }
  let packet
  try {
    packet = validateGitHubMainProtectionSnapshot(JSON.parse(payload))
  } catch (error) {
    if (String(error?.message || '').startsWith('github_main_protection_snapshot_')) {
      fail('review_branch_push_main_protection_snapshot_invalid')
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
      verifiedForBranchPush: false,
    }
  }
  const packet = validateGitHubMainProtectionSnapshot(snapshotReceipt.packet)
  const failures = Array.isArray(packet.assessment?.failures) ? [...packet.assessment.failures] : []
  const verifiedForBranchPush = packet.assessment?.ok === true
    && packet.currentAction === 'main_protection_verified_continue_to_review_branch_push'
  return {
    path: snapshotReceipt.path || null,
    digest: snapshotReceipt.digest || null,
    packetDigest: packet.digest,
    assessmentOk: packet.assessment?.ok === true,
    currentAction: packet.currentAction,
    failures,
    verifiedForBranchPush,
  }
}

function requireMainProtectionVerified(snapshotReceipt) {
  const evidence = buildMainProtectionEvidence(snapshotReceipt)
  if (!evidence.verifiedForBranchPush) fail('review_branch_push_main_protection_unverified')
  return evidence
}

export function validateReviewBranchPushHandoff(packet) {
  if (!isRecord(packet)) fail('review_branch_push_handoff_required')
  const branch = String(packet.candidate?.branch || '')
  const commit = exactSha(packet.candidate?.commit, 'review_branch_push_commit_invalid')
  const remoteState = String(packet.remote?.candidateBranchState || '')
  const remoteCommit = packet.remote?.candidateCommit == null
    ? null
    : exactSha(packet.remote.candidateCommit, 'review_branch_push_remote_commit_invalid')
  const action = isRecord(packet.actions?.reviewBranchPush) ? packet.actions.reviewBranchPush : packet.nextAction
  const kind = String(action?.kind || '')
  const approvalTemplate = String(action?.approvalTemplate || '')

  if (packet.repository !== REPOSITORY || packet.remote?.origin !== ORIGIN) fail('review_branch_push_repository_invalid')
  if (!BRANCH_PATTERN.test(branch) || branch.includes('..') || branch.endsWith('/') || branch.includes('//')) {
    fail('review_branch_push_branch_invalid')
  }
  if (packet.candidate?.clean !== true) fail('review_branch_push_candidate_not_clean')
  if (!['unpublished', 'different', 'exact'].includes(remoteState)) fail('review_branch_push_remote_state_invalid')
  if (remoteState === 'unpublished' && remoteCommit !== null) fail('review_branch_push_remote_state_invalid')
  if (remoteState !== 'unpublished' && remoteCommit === null) fail('review_branch_push_remote_state_invalid')
  if (!['owner_review_initial_branch_push', 'owner_review_fast_forward_branch_push'].includes(kind)) {
    fail('review_branch_push_next_action_invalid')
  }
  if (remoteState === 'unpublished' && kind !== 'owner_review_initial_branch_push') fail('review_branch_push_next_action_invalid')
  if (remoteState !== 'unpublished' && kind !== 'owner_review_fast_forward_branch_push') fail('review_branch_push_next_action_invalid')
  if (action.exactCommit !== commit
    || action.branch !== branch
    || action.forcePushAllowed !== false
    || action.mergeIncluded !== false
    || action.deploymentIncluded !== false) {
    fail('review_branch_push_next_action_invalid')
  }
  if (!approvalTemplate.includes(`push of ${commit} to origin/${branch} for review only`)
    || !approvalTemplate.includes('I do not approve merge')
    || !approvalTemplate.includes('customer contact')
    || !approvalTemplate.includes('stock')
    || /force/i.test(approvalTemplate)
    || /deploy/i.test(approvalTemplate.replace('deployment', ''))) {
    fail('review_branch_push_approval_template_invalid')
  }
  for (const [key, value] of Object.entries(packet.authority || {})) {
    if (value !== false) fail(`review_branch_push_authority_invalid:${key}`)
  }

  return {
    branch,
    commit,
    remoteState,
    remoteCommit,
    nextActionKind: kind,
    approvalTemplate,
    pushKind: remoteState === 'unpublished'
      ? 'initial_branch_push'
      : remoteState === 'different'
        ? 'fast_forward_branch_push'
        : 'already_published_no_push',
  }
}

export function validateOwnerApproval({
  gate,
  handoffReceipt = null,
  ownerApprovalReceipt = null,
  ownerApprovalChallenge = null,
  execute = false,
  now = new Date(),
} = {}) {
  if (!isRecord(gate)) fail('review_branch_push_gate_required')
  const expected = String(gate.approvalTemplate || '')
  if (!expected.includes('I approve one normal') || !expected.includes('for review only')) {
    fail('review_branch_push_approval_template_invalid')
  }
  const receiptPacket = ownerApprovalReceipt?.packet
    ? validateReviewBranchPushOwnerReceipt(ownerApprovalReceipt.packet, {
        gate,
        handoffReceipt,
        executionChallenge: ownerApprovalChallenge,
        now,
      })
    : null
  const approved = receiptPacket !== null
  if (execute && !approved) fail('review_branch_push_owner_approval_required')
  return {
    env: null,
    approved,
    method: receiptPacket ? 'in_process_owner_click_receipt' : 'none',
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

function validateFastForwardProofRecord(packet) {
  const proof = packet.fastForwardProof
  const remoteState = String(packet.remoteBefore?.candidateBranchState || '')
  const remoteCommit = packet.remoteBefore?.candidateCommit == null
    ? null
    : exactSha(packet.remoteBefore.candidateCommit, 'review_branch_push_report_fast_forward_proof_invalid')
  if (!isRecord(proof)
    || proof.branch !== packet.candidate.branch
    || proof.candidateCommit !== packet.candidate.head
    || proof.remoteCommit !== remoteCommit
    || proof.localOnly !== true
    || typeof proof.required !== 'boolean'
    || typeof proof.ok !== 'boolean'
    || !['not_required_unpublished_branch', 'already_published_exact', 'proven_ancestor', 'not_fast_forward', 'unavailable', 'unavailable_no_git'].includes(String(proof.status || ''))) {
    fail('review_branch_push_report_fast_forward_proof_invalid')
  }
  if (remoteState === 'unpublished') {
    if (proof.required !== false
      || proof.ok !== true
      || proof.status !== 'not_required_unpublished_branch'
      || proof.remoteCommit !== null
      || proof.command !== null
      || proof.ancestorOfCandidate !== null) {
      fail('review_branch_push_report_fast_forward_proof_invalid')
    }
    return proof
  }
  if (remoteState === 'exact') {
    if (proof.required !== false
      || proof.ok !== true
      || proof.status !== 'already_published_exact'
      || proof.remoteCommit !== packet.candidate.head
      || proof.command !== null
      || proof.ancestorOfCandidate !== true) {
      fail('review_branch_push_report_fast_forward_proof_invalid')
    }
    return proof
  }
  if (remoteState !== 'different' || !remoteCommit) fail('review_branch_push_report_fast_forward_proof_invalid')
  const expectedCommand = ['git', 'merge-base', '--is-ancestor', remoteCommit, packet.candidate.head]
  if (proof.required !== true
    || !Array.isArray(proof.command)
    || proof.command.join('\n') !== expectedCommand.join('\n')) {
    fail('review_branch_push_report_fast_forward_proof_invalid')
  }
  if (proof.ok === true) {
    if (proof.status !== 'proven_ancestor' || proof.ancestorOfCandidate !== true) {
      fail('review_branch_push_report_fast_forward_proof_invalid')
    }
  } else if (proof.status === 'not_fast_forward') {
    if (proof.ancestorOfCandidate !== false) fail('review_branch_push_report_fast_forward_proof_invalid')
  } else if (proof.status === 'unavailable' || proof.status === 'unavailable_no_git') {
    if (proof.ancestorOfCandidate !== null) fail('review_branch_push_report_fast_forward_proof_invalid')
  } else {
    fail('review_branch_push_report_fast_forward_proof_invalid')
  }
  return proof
}

function validateLocalState({ gate, gitState, execute }) {
  if (!isRecord(gitState)) fail('review_branch_push_git_state_required')
  if (gitState.origin !== ORIGIN) fail('review_branch_push_repository_invalid')
  if (gitState.branch !== gate.branch || gitState.head !== gate.commit) fail('review_branch_push_local_state_mismatch')
  if (execute && gitState.clean !== true) fail('review_branch_push_worktree_dirty')
  return true
}

export function buildFastForwardProof({ gate, git = gitDefault } = {}) {
  if (!isRecord(gate)) fail('review_branch_push_gate_required')
  const base = {
    branch: gate.branch,
    candidateCommit: gate.commit,
    remoteCommit: gate.remoteCommit,
    localOnly: true,
    command: null,
  }
  if (gate.pushKind === 'initial_branch_push') {
    return {
      ...base,
      required: false,
      ok: true,
      status: 'not_required_unpublished_branch',
      ancestorOfCandidate: null,
    }
  }
  if (gate.pushKind === 'already_published_no_push') {
    return {
      ...base,
      required: false,
      ok: true,
      status: 'already_published_exact',
      ancestorOfCandidate: true,
    }
  }
  if (gate.pushKind !== 'fast_forward_branch_push' || !gate.remoteCommit) {
    fail('review_branch_push_fast_forward_gate_invalid')
  }
  const command = ['git', 'merge-base', '--is-ancestor', gate.remoteCommit, gate.commit]
  if (typeof git !== 'function') {
    return {
      ...base,
      required: true,
      ok: false,
      status: 'unavailable_no_git',
      command,
      ancestorOfCandidate: null,
    }
  }
  const result = git(['merge-base', '--is-ancestor', gate.remoteCommit, gate.commit], {
    optional: true,
    timeout: 120_000,
  })
  if (result.status === 0) {
    return {
      ...base,
      required: true,
      ok: true,
      status: 'proven_ancestor',
      command,
      ancestorOfCandidate: true,
    }
  }
  if (result.status === 1) {
    return {
      ...base,
      required: true,
      ok: false,
      status: 'not_fast_forward',
      command,
      ancestorOfCandidate: false,
    }
  }
  return {
    ...base,
    required: true,
    ok: false,
    status: 'unavailable',
    command,
    ancestorOfCandidate: null,
  }
}

export function buildReviewBranchPushPlan({
  handoffReceipt,
  mainProtectionSnapshotReceipt = null,
  gitState = null,
  git = gitDefault,
  fastForwardProof = null,
} = {}) {
  const gate = validateReviewBranchPushHandoff(handoffReceipt?.packet)
  const resolvedGitState = gitState || currentGitState(git)
  validateLocalState({ gate, gitState: resolvedGitState, execute: false })
  const approval = validateOwnerApproval({
    gate,
    handoffReceipt,
    execute: false,
  })
  const mainProtection = buildMainProtectionEvidence(mainProtectionSnapshotReceipt)
  const fastForward = fastForwardProof || buildFastForwardProof({ gate, git })
  const alreadyPublished = gate.pushKind === 'already_published_no_push'
  const blockers = [
    ...(mainProtection.verifiedForBranchPush ? [] : [
      'github_main_protection_unverified',
      ...mainProtection.failures,
    ]),
    ...(resolvedGitState.clean === true ? [] : ['local_worktree_dirty']),
    ...(fastForward.ok === true ? [] : ['fast_forward_proof_missing_or_failed']),
    ...(alreadyPublished || approval.approved ? [] : ['owner_approval_missing']),
  ]
  const body = {
    ok: true,
    contract: REVIEW_BRANCH_PUSH_APPLY_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    mode: 'plan_only_no_git_remote_write',
    repository: REPOSITORY,
    releaseHandoff: {
      path: handoffReceipt.path || null,
      digest: handoffReceipt.digest || null,
      packetDigest: handoffReceipt.packet?.digest || null,
    },
    candidate: {
      branch: gate.branch,
      head: gate.commit,
      clean: resolvedGitState.clean === true,
    },
    remoteBefore: {
      origin: ORIGIN,
      candidateBranchState: gate.remoteState,
      candidateCommit: gate.remoteCommit,
      mainCommit: handoffReceipt.packet?.remote?.mainCommit || null,
    },
    approval,
    githubMainProtection: mainProtection,
    fastForwardProof: fastForward,
    readiness: {
      executeReady: blockers.length === 0,
      blockers,
    },
    plannedNetworkReadsBeforeExecute: [
      'verify release handoff current state',
      'verify signed GitHub main-protection snapshot assessment.ok is true',
      `git ls-remote --heads origin ${gate.branch}`,
      ...(fastForward.required
        ? [`git merge-base --is-ancestor ${gate.remoteCommit} ${gate.commit}`]
        : []),
    ],
    possibleWrite: {
      kind: gate.pushKind,
      command: gate.pushKind === 'already_published_no_push'
        ? null
        : reviewBranchPushCommand(gate),
      forcePushAllowed: false,
      deleteAllowed: false,
      branch: gate.branch,
      exactCommit: gate.commit,
    },
    executionRequirements: alreadyPublished
      ? [
          '--execute flag',
          'signed GitHub main-protection snapshot verifies assessment.ok:true',
          'release handoff re-verifies current remote/live state immediately before no-op confirmation',
          'local worktree is clean',
          'remote branch still equals the exact handoff commit immediately before no-op confirmation',
        ]
      : [
          '--execute flag',
          'same-process Windows owner click sealed by an executor-generated challenge and consumed before push',
          'signed GitHub main-protection snapshot verifies assessment.ok:true',
          'release handoff re-verifies current remote/live state immediately before push',
          'remote review branch still equals the handoff remote commit immediately before push',
          'git push atomically requires that exact approved remote head through an exact lease',
          'remote review branch is an ancestor of the exact candidate commit when branch already exists',
          'local worktree is clean',
          'post-push remote branch equals the exact approved commit',
        ],
    controls: {
      gitRemoteWritesApproved: approval.approved,
      gitRemoteWritesPerformed: false,
      ownerApprovalReceiptConsumed: false,
      remoteHeadLeaseEnforced: false,
      repositorySettingsMutated: false,
      branchMutated: false,
      forcePushPerformed: false,
      branchDeletionPerformed: false,
      pullRequestCreated: false,
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

export function validateReviewBranchPushReport(packet, { expectedMode = null } = {}) {
  if (!isRecord(packet)) fail('review_branch_push_report_invalid')
  const { digest: actualDigest, ...body } = packet
  if (actualDigest !== digest(JSON.stringify(body))) fail('review_branch_push_report_digest_invalid')
  if (packet.contract !== REVIEW_BRANCH_PUSH_APPLY_CONTRACT) fail('review_branch_push_report_contract_invalid')
  if (packet.repository !== REPOSITORY) fail('review_branch_push_report_repository_invalid')
  if (packet.digestScope !== 'utf8_compact_json_without_digest') fail('review_branch_push_report_digest_scope_invalid')
  if (expectedMode && packet.mode !== expectedMode) fail('review_branch_push_report_mode_invalid')
  if (!isRecord(packet.releaseHandoff)
    || !/^sha256:[0-9a-f]{64}$/.test(String(packet.releaseHandoff.digest || ''))
    || !/^sha256:[0-9a-f]{64}$/.test(String(packet.releaseHandoff.packetDigest || ''))) {
    fail('review_branch_push_report_handoff_invalid')
  }
  if (!isRecord(packet.candidate)
    || !BRANCH_PATTERN.test(String(packet.candidate.branch || ''))
    || !SHA_PATTERN.test(String(packet.candidate.head || ''))
    || typeof packet.candidate.clean !== 'boolean') {
    fail('review_branch_push_report_candidate_invalid')
  }
  if (!isRecord(packet.approval)
    || packet.approval.env !== null
    || typeof packet.approval.approved !== 'boolean'
    || !['none', 'in_process_owner_click_receipt'].includes(String(packet.approval.method || ''))
    || !/^sha256:[0-9a-f]{64}$/.test(String(packet.approval.expectedDigest || ''))) {
    fail('review_branch_push_report_approval_invalid')
  }
  if (packet.approval.method === 'in_process_owner_click_receipt') {
    if (packet.approval.approved !== true
      || packet.approval.receipt?.contract !== REVIEW_BRANCH_PUSH_OWNER_RECEIPT_CONTRACT
      || !/^sha256:[0-9a-f]{64}$/.test(String(packet.approval.receipt?.digest || ''))
      || packet.approval.actualDigest !== packet.approval.receipt.digest
      || !Number.isFinite(Date.parse(String(packet.approval.receipt?.expiresAt || '')))
      || typeof packet.approval.receipt?.consumed !== 'boolean') {
      fail('review_branch_push_report_approval_receipt_invalid')
    }
  } else if (packet.approval.receipt !== null
    || (packet.approval.method === 'none'
      && (packet.approval.approved !== false || packet.approval.actualDigest !== null))) {
    fail('review_branch_push_report_approval_receipt_invalid')
  }
  if (!isRecord(packet.githubMainProtection)
    || typeof packet.githubMainProtection.assessmentOk !== 'boolean'
    || typeof packet.githubMainProtection.verifiedForBranchPush !== 'boolean'
    || !Array.isArray(packet.githubMainProtection.failures)) {
    fail('review_branch_push_report_main_protection_invalid')
  }
  if (packet.githubMainProtection.digest != null) {
    if (!/^sha256:[0-9a-f]{64}$/.test(String(packet.githubMainProtection.digest || ''))
      || !/^sha256:[0-9a-f]{64}$/.test(String(packet.githubMainProtection.packetDigest || ''))) {
      fail('review_branch_push_report_main_protection_invalid')
    }
  }
  if (packet.mode === 'plan_only_no_git_remote_write') {
    const fastForwardProof = validateFastForwardProofRecord(packet)
    if (packet.ok !== true
      || packet.controls?.gitRemoteWritesPerformed !== false
      || packet.controls?.ownerApprovalReceiptConsumed !== false
      || packet.controls?.remoteHeadLeaseEnforced !== false
      || packet.controls?.gitRemoteWritesApproved !== packet.approval.approved
      || packet.controls?.repositorySettingsMutated !== false
      || packet.controls?.branchMutated !== false
      || packet.controls?.forcePushPerformed !== false
      || packet.controls?.branchDeletionPerformed !== false
      || packet.controls?.pullRequestCreated !== false
      || packet.controls?.mergePerformed !== false
      || packet.controls?.workflowDispatchPerformed !== false
      || packet.controls?.deploymentPerformed !== false
      || packet.controls?.supabaseMutated !== false
      || packet.controls?.credentialValueExposed !== false) {
      fail('review_branch_push_plan_controls_invalid')
    }
    if (!Array.isArray(packet.plannedNetworkReadsBeforeExecute)
      || !packet.plannedNetworkReadsBeforeExecute.includes('verify release handoff current state')
      || !packet.plannedNetworkReadsBeforeExecute.includes('verify signed GitHub main-protection snapshot assessment.ok is true')
      || !packet.plannedNetworkReadsBeforeExecute.includes(`git ls-remote --heads origin ${packet.candidate.branch}`)) {
      fail('review_branch_push_plan_reads_invalid')
    }
    if (fastForwardProof.required === true
      && !packet.plannedNetworkReadsBeforeExecute.includes(`git merge-base --is-ancestor ${fastForwardProof.remoteCommit} ${packet.candidate.head}`)) {
      fail('review_branch_push_plan_reads_invalid')
    }
    if (!isRecord(packet.readiness)
      || typeof packet.readiness.executeReady !== 'boolean'
      || !Array.isArray(packet.readiness.blockers)) {
      fail('review_branch_push_plan_readiness_invalid')
    }
    if (packet.possibleWrite?.command !== null
      && packet.readiness.blockers.includes('owner_approval_missing') === packet.approval.approved) {
      fail('review_branch_push_plan_readiness_invalid')
    }
    if (fastForwardProof.ok === true) {
      if (packet.readiness.blockers.includes('fast_forward_proof_missing_or_failed')) {
        fail('review_branch_push_plan_readiness_invalid')
      }
    } else if (!packet.readiness.blockers.includes('fast_forward_proof_missing_or_failed')) {
      fail('review_branch_push_plan_readiness_invalid')
    }
    if (!isRecord(packet.possibleWrite)
      || packet.possibleWrite.branch !== packet.candidate.branch
      || packet.possibleWrite.exactCommit !== packet.candidate.head
      || packet.possibleWrite.forcePushAllowed !== false
      || packet.possibleWrite.deleteAllowed !== false) {
      fail('review_branch_push_plan_write_invalid')
    }
    if (packet.possibleWrite.command !== null) {
      const remoteRef = `refs/heads/${packet.candidate.branch}`
      const expectedCommand = [
        'git',
        'push',
        `--force-with-lease=${remoteRef}:${packet.remoteBefore.candidateCommit || ''}`,
        'origin',
        `${packet.candidate.head}:${remoteRef}`,
      ]
      if (!Array.isArray(packet.possibleWrite.command)
        || packet.possibleWrite.command.join('\n') !== expectedCommand.join('\n')) {
        fail('review_branch_push_plan_write_invalid')
      }
    }
    if (!Array.isArray(packet.executionRequirements)
      || !packet.executionRequirements.includes('--execute flag')
      || !packet.executionRequirements.includes('signed GitHub main-protection snapshot verifies assessment.ok:true')
      || !(packet.possibleWrite.command === null
        ? packet.executionRequirements.includes('remote branch still equals the exact handoff commit immediately before no-op confirmation')
        : packet.executionRequirements.includes('post-push remote branch equals the exact approved commit'))
      || (packet.possibleWrite.command !== null
        && !packet.executionRequirements.includes('remote review branch still equals the handoff remote commit immediately before push'))
      || (packet.possibleWrite.command !== null
        && !packet.executionRequirements.includes('git push atomically requires that exact approved remote head through an exact lease'))
      || (fastForwardProof.required === true
        && !packet.executionRequirements.includes('remote review branch is an ancestor of the exact candidate commit when branch already exists'))) {
      fail('review_branch_push_plan_requirements_invalid')
    }
  } else if (packet.mode === 'executed_owner_approved_git_remote_write'
    || packet.mode === 'executed_already_published_no_write') {
    const fastForwardProof = validateFastForwardProofRecord(packet)
    const branchMutated = packet.mode === 'executed_owner_approved_git_remote_write'
    const remoteRef = `refs/heads/${packet.candidate.branch}`
    const expectedCommand = branchMutated
      ? [
          'git',
          'push',
          `--force-with-lease=${remoteRef}:${packet.remoteBefore.candidateCommit || ''}`,
          'origin',
          `${packet.candidate.head}:${remoteRef}`,
        ]
      : null
    if (packet.approval.approved !== branchMutated
      || packet.controls?.gitRemoteWritesApproved !== branchMutated
      || packet.controls?.gitRemoteWritesPerformed !== branchMutated
      || packet.controls?.remoteHeadLeaseEnforced !== branchMutated
      || packet.controls?.branchMutated !== branchMutated
      || packet.controls?.repositorySettingsMutated !== false
      || packet.controls?.forcePushPerformed !== false
      || packet.controls?.branchDeletionPerformed !== false
      || packet.controls?.pullRequestCreated !== false
      || packet.controls?.mergePerformed !== false
      || packet.controls?.workflowDispatchPerformed !== false
      || packet.controls?.deploymentPerformed !== false
      || packet.controls?.supabaseMutated !== false
      || packet.controls?.credentialValueExposed !== false
      || packet.verification?.remoteStateUnchanged !== true
      || packet.verification?.remoteBranchExact !== true
      || packet.verification?.fastForwardProofOk !== true
      || fastForwardProof.ok !== true
      || (expectedCommand === null
        ? packet.action?.command !== null
        : !Array.isArray(packet.action?.command) || packet.action.command.join('\n') !== expectedCommand.join('\n'))) {
      fail('review_branch_push_execute_controls_invalid')
    }
    if (branchMutated) {
      if (packet.approval.method !== 'in_process_owner_click_receipt'
        || packet.approval.receipt?.consumed !== true
        || packet.controls?.ownerApprovalReceiptConsumed !== true) {
        fail('review_branch_push_execute_approval_receipt_not_consumed')
      }
    } else if (packet.approval.method !== 'none'
      || packet.approval.receipt !== null
      || packet.controls?.ownerApprovalReceiptConsumed !== false) {
      fail('review_branch_push_execute_noop_approval_invalid')
    }
  } else {
    fail('review_branch_push_report_mode_invalid')
  }
  assertNoSecretEcho(packet)
  return packet
}

export async function applyReviewBranchPushWithGit({
  handoffReceipt,
  mainProtectionSnapshotReceipt = null,
  ownerApprovalReceipt = null,
  ownerApprovalChallenge = null,
  git = gitDefault,
  verifyHandoff = verifyCurrentReleaseHandoff,
  consumeApprovalReceipt = consumeReviewBranchPushOwnerReceipt,
  now = () => new Date(),
} = {}) {
  const gate = validateReviewBranchPushHandoff(handoffReceipt?.packet)
  const gitState = currentGitState(git)
  validateLocalState({ gate, gitState, execute: true })
  let approval = validateOwnerApproval({
    gate,
    handoffReceipt,
    ownerApprovalReceipt,
    ownerApprovalChallenge,
    execute: gate.pushKind !== 'already_published_no_push',
    now: now(),
  })
  const mainProtection = requireMainProtectionVerified(mainProtectionSnapshotReceipt)
  const fastForward = buildFastForwardProof({ gate, git })
  if (fastForward.ok !== true) fail('review_branch_push_fast_forward_unproven')

  const verification = await verifyHandoff(handoffReceipt.path)
  if (verification?.ok !== true
    || verification.candidate?.branch !== gate.branch
    || verification.candidate?.commit !== gate.commit
    || verification.candidate?.clean !== true
    || verification.nextAction?.exactCommit !== gate.commit
    || verification.nextAction?.forcePushAllowed !== false
    || verification.nextAction?.mergeIncluded !== false
    || verification.nextAction?.deploymentIncluded !== false) {
    fail('review_branch_push_handoff_not_current')
  }

  const before = remoteHead(git, gate.branch)
  if (before !== gate.remoteCommit) fail('review_branch_push_remote_state_changed')

  let pushStatus = null
  let branchMutated = false
  let ownerApprovalReceiptConsumed = false
  if (before !== gate.commit) {
    approval = validateOwnerApproval({
      gate,
      handoffReceipt,
      ownerApprovalReceipt,
      ownerApprovalChallenge,
      execute: true,
      now: now(),
    })
    if (approval.method === 'in_process_owner_click_receipt') {
      const consumed = await consumeApprovalReceipt(ownerApprovalReceipt)
      if (consumed?.ok !== true || consumed.packetDigest !== approval.receipt.digest) {
        fail('review_branch_push_owner_receipt_consume_verify_failed')
      }
      approval = {
        ...approval,
        receipt: { ...approval.receipt, consumed: true },
      }
      ownerApprovalReceiptConsumed = true
    }
    const [, ...pushArgs] = reviewBranchPushCommand(gate)
    const push = git(pushArgs, { optional: true, timeout: 180_000 })
    pushStatus = push.status
    if (push.status !== 0) fail('review_branch_push_push_failed')
    branchMutated = true
  }

  const after = remoteHead(git, gate.branch)
  if (after !== gate.commit) fail('review_branch_push_post_verify_failed')

  const body = {
    ok: true,
    contract: REVIEW_BRANCH_PUSH_APPLY_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    mode: branchMutated ? 'executed_owner_approved_git_remote_write' : 'executed_already_published_no_write',
    repository: REPOSITORY,
    releaseHandoff: {
      path: handoffReceipt.path || null,
      digest: handoffReceipt.digest || null,
      packetDigest: handoffReceipt.packet?.digest || null,
    },
    candidate: {
      branch: gate.branch,
      head: gate.commit,
      clean: true,
    },
    remoteBefore: {
      origin: ORIGIN,
      candidateBranchState: gate.remoteState,
      candidateCommit: gate.remoteCommit,
      mainCommit: handoffReceipt.packet?.remote?.mainCommit || null,
    },
    action: {
      kind: gate.pushKind,
      command: branchMutated ? reviewBranchPushCommand(gate) : null,
      pushExitStatus: pushStatus,
      remoteCommitBefore: before,
      remoteCommitAfter: after,
    },
    approval,
    githubMainProtection: mainProtection,
    fastForwardProof: fastForward,
    verification: {
      handoffCurrent: true,
      remoteStateUnchanged: true,
      remoteBranchExact: true,
      fastForwardProofOk: true,
    },
    controls: {
      gitRemoteWritesApproved: branchMutated,
      gitRemoteWritesPerformed: branchMutated,
      ownerApprovalReceiptConsumed,
      remoteHeadLeaseEnforced: branchMutated,
      repositorySettingsMutated: false,
      branchMutated,
      forcePushPerformed: false,
      branchDeletionPerformed: false,
      pullRequestCreated: false,
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
  const options = {
    mode: 'plan',
    handoff: null,
    githubProtectionSnapshot: null,
    ownerClick: false,
    output: null,
    verify: null,
  }
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
    } else if (arg === '--owner-click') {
      options.ownerClick = true
    } else if (arg === '--output' && args[0]) {
      options.output = args.shift()
    } else if (arg === '--verify' && args[0]) {
      options.mode = 'verify'
      options.verify = args.shift()
    } else {
      fail('review_branch_push_usage_invalid')
    }
  }
  if (options.output && options.mode !== 'plan') fail('review_branch_push_output_plan_only')
  if (options.ownerClick && options.mode !== 'execute') fail('review_branch_push_owner_click_execute_only')
  if (options.ownerClick && ['self-test', 'verify'].includes(options.mode)) {
    fail('review_branch_push_owner_approval_mode_invalid')
  }
  if (options.mode !== 'self-test' && options.mode !== 'verify' && !options.handoff) fail('review_branch_push_handoff_required')
  return options
}

async function writeExclusive(path, content) {
  const absolute = resolve(path)
  await mkdir(dirname(absolute), { recursive: true })
  await writeFile(absolute, content, { encoding: 'utf8', flag: 'wx' })
  return absolute
}

function temporaryOwnerReceiptPath(gate) {
  const safeBranch = gate.branch.replace(/[^a-z0-9.-]+/g, '-')
  return join(
    tmpdir(),
    'supermega-owner-receipts',
    `${safeBranch}-${gate.commit}-${randomBytes(8).toString('hex')}.json`,
  )
}

async function runSelfTest() {
  const approvalTemplate = `I approve one normal initial push of ${'a'.repeat(40)} to origin/codex/release-stack-integration-rehearsal-20260825 for review only. I do not approve merge, workflow dispatch, deployment, domain, environment, database, credential, payment, message, customer contact, stock, or production changes.`
  const packet = {
    repository: REPOSITORY,
    candidate: {
      branch: 'codex/release-stack-integration-rehearsal-20260825',
      commit: 'a'.repeat(40),
      clean: true,
    },
    remote: {
      origin: ORIGIN,
      mainCommit: 'b'.repeat(40),
      candidateCommit: null,
      candidateBranchState: 'unpublished',
    },
    nextAction: {
      kind: 'owner_review_initial_branch_push',
      branch: 'codex/release-stack-integration-rehearsal-20260825',
      exactCommit: 'a'.repeat(40),
      forcePushAllowed: false,
      mergeIncluded: false,
      deploymentIncluded: false,
      approvalTemplate,
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
  const plan = buildReviewBranchPushPlan({
    handoffReceipt: receipt,
    mainProtectionSnapshotReceipt,
    gitState: {
      branch: packet.candidate.branch,
      head: packet.candidate.commit,
      clean: true,
      origin: ORIGIN,
    },
  })
  const checks = {
    plan_mode_does_not_write: plan.mode === 'plan_only_no_git_remote_write'
      && plan.controls.gitRemoteWritesPerformed === false
      && plan.controls.branchMutated === false,
    approval_required_for_execute: (() => {
      try {
        validateOwnerApproval({ gate: validateReviewBranchPushHandoff(packet), execute: true })
        return false
      } catch (error) {
        return String(error?.message || '') === 'review_branch_push_owner_approval_required'
      }
    })(),
    command_is_exact_commit_push: plan.possibleWrite.command?.join(' ') === `git push --force-with-lease=refs/heads/${packet.candidate.branch}: origin ${packet.candidate.commit}:refs/heads/${packet.candidate.branch}`,
    command_has_exact_remote_lease: plan.possibleWrite.command?.includes(`--force-with-lease=refs/heads/${packet.candidate.branch}:`) === true,
    force_and_deletion_forbidden: plan.possibleWrite.forcePushAllowed === false && plan.possibleWrite.deleteAllowed === false,
    main_protection_required_for_execute: buildReviewBranchPushPlan({
      handoffReceipt: receipt,
      gitState: {
        branch: packet.candidate.branch,
        head: packet.candidate.commit,
        clean: true,
        origin: ORIGIN,
      },
    }).readiness.blockers.includes('github_main_protection_snapshot_missing'),
    plan_digest_verifies: validateReviewBranchPushReport(plan, { expectedMode: 'plan_only_no_git_remote_write' }) === plan,
    no_secret_echo: plan.controls.credentialValueExposed === false,
  }
  const failedChecks = Object.entries(checks).filter(([, ok]) => !ok).map(([key]) => key)
  return {
    ok: failedChecks.length === 0,
    contract: `${REVIEW_BRANCH_PUSH_APPLY_CONTRACT}.self-test`,
    checks,
    failedChecks,
    gitRemoteWritesPerformed: false,
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
    const report = validateReviewBranchPushReport(JSON.parse(await readFile(resolve(options.verify), 'utf8')), {
      expectedMode: 'plan_only_no_git_remote_write',
    })
    console.log(JSON.stringify({
      ok: true,
      contract: report.contract,
      mode: report.mode,
      path: resolve(options.verify),
      digest: report.digest,
      repository: report.repository,
      gitRemoteWritesPerformed: false,
      branchMutated: false,
    }, null, 2))
    return
  }
  const handoffReceipt = await readReleaseHandoffReceipt(options.handoff)
  const mainProtectionSnapshotReceipt = options.githubProtectionSnapshot
    ? await readGitHubMainProtectionSnapshotReceipt(options.githubProtectionSnapshot)
    : null
  const gate = validateReviewBranchPushHandoff(handoffReceipt.packet)
  let ownerApprovalReceipt = null
  let ownerApprovalChallenge = null
  if (options.ownerClick && gate.pushKind !== 'already_published_no_push') {
    const preflight = buildReviewBranchPushPlan({
      handoffReceipt,
      mainProtectionSnapshotReceipt,
    })
    const nonApprovalBlockers = preflight.readiness.blockers.filter((blocker) => blocker !== 'owner_approval_missing')
    if (nonApprovalBlockers.length > 0) fail(`review_branch_push_owner_click_preflight_blocked:${nonApprovalBlockers[0]}`)
    // Created inside this executor and never written into the receipt or accepted from CLI.
    // The HMAC seal makes a copied or caller-authored JSON receipt unusable as click authority.
    ownerApprovalChallenge = randomBytes(32).toString('hex')
    ownerApprovalReceipt = await requestReviewBranchPushOwnerReceipt({
      gate,
      handoffReceipt,
      executionChallenge: ownerApprovalChallenge,
      output: temporaryOwnerReceiptPath(gate),
    })
  }
  const result = options.mode === 'execute'
    ? await applyReviewBranchPushWithGit({
        handoffReceipt,
        mainProtectionSnapshotReceipt,
        ownerApprovalReceipt,
        ownerApprovalChallenge,
      })
    : buildReviewBranchPushPlan({
        handoffReceipt,
        mainProtectionSnapshotReceipt,
      })
  if (options.output) {
    const output = await writeExclusive(options.output, `${JSON.stringify(validateReviewBranchPushReport(result, { expectedMode: 'plan_only_no_git_remote_write' }), null, 2)}\n`)
    console.log(JSON.stringify({
      ok: true,
      contract: result.contract,
      mode: result.mode,
      output,
      digest: result.digest,
      gitRemoteWritesPerformed: false,
      branchMutated: false,
    }, null, 2))
    return
  }
  console.log(JSON.stringify(result, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      contract: REVIEW_BRANCH_PUSH_APPLY_CONTRACT,
      error: String(error?.message || 'review_branch_push_failed').slice(0, 240),
      controls: {
        gitRemoteWritesPerformed: false,
        repositorySettingsMutated: false,
        branchMutated: false,
        forcePushPerformed: false,
        branchDeletionPerformed: false,
        pullRequestCreated: false,
        mergePerformed: false,
        deploymentPerformed: false,
        supabaseMutated: false,
        credentialValueExposed: false,
      },
    }, null, 2))
    process.exitCode = 1
  })
}
