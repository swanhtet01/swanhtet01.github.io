import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  REVIEW_BRANCH_PUSH_APPLY_CONTRACT,
  applyReviewBranchPushWithGit,
  buildReviewBranchPushPlan,
  validateOwnerApproval,
  validateReviewBranchPushReport,
  validateReviewBranchPushHandoff,
} from './apply_review_branch_push.mjs'
import {
  buildGitHubMainProtectionSnapshot,
} from './collect_github_main_protection_snapshot.mjs'
import {
  REVIEW_BRANCH_PUSH_OWNER_RECEIPT_TTL_MS,
  buildReviewBranchPushOwnerReceipt,
} from './review_branch_push_owner_receipt.mjs'

const repository = 'swanhtet01/swanhtet01.github.io'
const origin = `https://github.com/${repository}.git`
const branch = 'codex/release-stack-integration-rehearsal-20260825'
const commit = 'a'.repeat(40)
const remoteBase = 'd'.repeat(40)
const remoteMain = 'b'.repeat(40)
const approvalTemplate = `I approve one normal initial push of ${commit} to origin/${branch} for review only. I do not approve merge, workflow dispatch, deployment, domain, environment, database, credential, payment, message, customer contact, stock, or production changes.`
const fastForwardApprovalTemplate = `I approve one normal fast-forward-only push of ${commit} to origin/${branch} for review only. I do not approve merge, workflow dispatch, deployment, domain, environment, database, credential, payment, message, customer contact, stock, or production changes.`
const ownerApprovalTime = new Date('2026-08-28T03:00:00.000Z')
const ownerApprovalChallenge = '6'.repeat(64)

function packet(overrides = {}) {
  return {
    repository,
    candidate: {
      branch,
      commit,
      clean: true,
      ...(overrides.candidate || {}),
    },
    remote: {
      origin,
      mainCommit: remoteMain,
      candidateCommit: null,
      candidateBranchState: 'unpublished',
      ...(overrides.remote || {}),
    },
    nextAction: {
      kind: 'owner_review_github_main_protection',
      branch,
      exactCommit: commit,
      forcePushAllowed: false,
      mergeIncluded: false,
      deploymentIncluded: false,
      approvalTemplate: `I approve applying the SuperMega main release gate ruleset to ${repository} main after reviewing the signed plan for ${commit}. I do not approve branch push, pull request creation, merge, workflow dispatch, deployment, domain, environment, database, credential, payment, message, customer contact, stock, or production changes.`,
      ...(overrides.nextAction || {}),
    },
    actions: {
      reviewBranchPush: {
        kind: 'owner_review_initial_branch_push',
        branch,
        exactCommit: commit,
        forcePushAllowed: false,
        mergeIncluded: false,
        deploymentIncluded: false,
        approvalTemplate,
      },
      ...(overrides.actions || {}),
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
      ...(overrides.authority || {}),
    },
  }
}

function legacyPacket(overrides = {}) {
  return {
    repository,
    candidate: {
      branch,
      commit,
      clean: true,
      ...(overrides.candidate || {}),
    },
    remote: {
      origin,
      mainCommit: remoteMain,
      candidateCommit: null,
      candidateBranchState: 'unpublished',
      ...(overrides.remote || {}),
    },
    nextAction: {
      kind: 'owner_review_initial_branch_push',
      branch,
      exactCommit: commit,
      forcePushAllowed: false,
      mergeIncluded: false,
      deploymentIncluded: false,
      approvalTemplate,
      ...(overrides.nextAction || {}),
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
      ...(overrides.authority || {}),
    },
  }
}

function receipt(packetValue = packet()) {
  return {
    path: 'C:\\evidence\\supermega.release-handoff.generated.json',
    digest: `sha256:${'1'.repeat(64)}`,
    packet: {
      digest: `sha256:${'2'.repeat(64)}`,
      ...packetValue,
    },
  }
}

function ownerClickReceipt(handoffReceipt = receipt(), gate = validateReviewBranchPushHandoff(handoffReceipt.packet)) {
  return {
    path: 'C:\\private\\review-branch-push-owner-receipt.json',
    payload: '{}\n',
    fileDigest: `sha256:${'4'.repeat(64)}`,
    consumedPath: 'C:\\private\\review-branch-push-owner-receipt.used.json',
    packet: buildReviewBranchPushOwnerReceipt({
      gate,
      handoffReceipt,
      executionChallenge: ownerApprovalChallenge,
      confirmedAt: ownerApprovalTime,
      nonce: '5'.repeat(64),
    }),
  }
}

function mainProtectionReceipt() {
  return {
    path: 'C:\\evidence\\supermega.github-main-protection-snapshot.generated.json',
    digest: `sha256:${'3'.repeat(64)}`,
    packet: buildGitHubMainProtectionSnapshot({
      generatedAt: '2026-08-25T00:00:00.000Z',
      branch: {
        name: 'main',
        protected: false,
        commit: { sha: remoteMain },
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
    }),
  }
}

function gitState(overrides = {}) {
  return {
    branch,
    head: commit,
    clean: true,
    origin,
    ...overrides,
  }
}

function stubGit({ before = null, after = commit, pushStatus = 0, mergeBaseStatus = 0, mergeBaseRemote = before } = {}) {
  const calls = []
  let readCount = 0
  const git = (args) => {
    calls.push([...args])
    const command = args.join(' ')
    if (command === 'symbolic-ref --short HEAD') return { status: 0, stdout: branch, stderr: '' }
    if (command === 'rev-parse HEAD') return { status: 0, stdout: commit, stderr: '' }
    if (command === 'status --porcelain=v1') return { status: 0, stdout: '', stderr: '' }
    if (command === 'remote get-url origin') return { status: 0, stdout: origin, stderr: '' }
    if (command === `ls-remote --heads origin ${branch}`) {
      const value = readCount === 0 ? before : after
      readCount += 1
      return {
        status: 0,
        stdout: value ? `${value}\trefs/heads/${branch}` : '',
        stderr: '',
      }
    }
    if (command === `push --force-with-lease=refs/heads/${branch}:${before || ''} origin ${commit}:refs/heads/${branch}`) {
      return { status: pushStatus, stdout: '', stderr: pushStatus === 0 ? '' : 'rejected' }
    }
    if (command === `merge-base --is-ancestor ${mergeBaseRemote} ${commit}`) {
      return { status: mergeBaseStatus, stdout: '', stderr: '' }
    }
    throw new Error(`unexpected git call: ${command}`)
  }
  return { git, calls }
}

function runLocalGit(cwd, args, { optional = false } = {}) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
    timeout: 30_000,
    windowsHide: true,
  })
  if (!optional && (result.error || result.signal || result.status !== 0)) {
    throw new Error(`local_git_test_failed:${args[0]}:${String(result.stderr || result.error?.message || '').trim()}`)
  }
  return result
}

test('plan is no-write, exact-commit-bound, and approval-aware', () => {
  const plan = buildReviewBranchPushPlan({
    handoffReceipt: receipt(),
    gitState: gitState(),
  })
  assert.equal(plan.contract, REVIEW_BRANCH_PUSH_APPLY_CONTRACT)
  assert.equal(validateReviewBranchPushReport(plan, { expectedMode: 'plan_only_no_git_remote_write' }), plan)
  assert.match(plan.digest, /^sha256:[0-9a-f]{64}$/)
  assert.equal(plan.digestScope, 'utf8_compact_json_without_digest')
  assert.equal(plan.mode, 'plan_only_no_git_remote_write')
  assert.equal(plan.candidate.head, commit)
  assert.equal(plan.candidate.branch, branch)
  assert.equal(plan.approval.approved, false)
  assert.equal(plan.controls.gitRemoteWritesPerformed, false)
  assert.equal(plan.controls.branchMutated, false)
  assert.equal(plan.controls.pullRequestCreated, false)
  assert.equal(plan.controls.deploymentPerformed, false)
  assert.equal(plan.fastForwardProof.required, false)
  assert.equal(plan.fastForwardProof.ok, true)
  assert.equal(plan.fastForwardProof.status, 'not_required_unpublished_branch')
  assert.deepEqual(plan.possibleWrite.command, [
    'git',
    'push',
    `--force-with-lease=refs/heads/${branch}:`,
    'origin',
    `${commit}:refs/heads/${branch}`,
  ])
  assert.equal(plan.possibleWrite.forcePushAllowed, false)
  assert.equal(plan.possibleWrite.deleteAllowed, false)
  assert.doesNotMatch(JSON.stringify(plan), /ghp_|github_pat_|Bearer\s+\w+/)
})

test('plan proves fast-forward ancestry when the review branch already exists', () => {
  const existingBranch = packet({
    remote: {
      candidateCommit: remoteBase,
      candidateBranchState: 'different',
    },
    actions: { reviewBranchPush: {
      kind: 'owner_review_fast_forward_branch_push',
      branch,
      exactCommit: commit,
      forcePushAllowed: false,
      mergeIncluded: false,
      deploymentIncluded: false,
      approvalTemplate: fastForwardApprovalTemplate,
    } },
  })
  const { git, calls } = stubGit({ before: remoteBase, mergeBaseStatus: 0 })
  const plan = buildReviewBranchPushPlan({
    handoffReceipt: receipt(existingBranch),
    mainProtectionSnapshotReceipt: mainProtectionReceipt(),
    gitState: gitState(),
    git,
  })
  assert.equal(plan.possibleWrite.kind, 'fast_forward_branch_push')
  assert.equal(plan.fastForwardProof.required, true)
  assert.equal(plan.fastForwardProof.ok, true)
  assert.equal(plan.fastForwardProof.status, 'proven_ancestor')
  assert.deepEqual(plan.fastForwardProof.command, ['git', 'merge-base', '--is-ancestor', remoteBase, commit])
  assert.equal(plan.readiness.executeReady, false)
  assert.deepEqual(plan.readiness.blockers, ['owner_approval_missing'])
  assert.equal(validateReviewBranchPushReport(plan, { expectedMode: 'plan_only_no_git_remote_write' }), plan)
  assert.deepEqual(
    calls.filter((args) => args[0] === 'merge-base'),
    [['merge-base', '--is-ancestor', remoteBase, commit]],
  )
})

test('plan and execute fail closed when fast-forward ancestry is not proven', async () => {
  const existingBranch = packet({
    remote: {
      candidateCommit: remoteBase,
      candidateBranchState: 'different',
    },
    actions: { reviewBranchPush: {
      kind: 'owner_review_fast_forward_branch_push',
      branch,
      exactCommit: commit,
      forcePushAllowed: false,
      mergeIncluded: false,
      deploymentIncluded: false,
      approvalTemplate: fastForwardApprovalTemplate,
    } },
  })
  const { git } = stubGit({ before: remoteBase, mergeBaseStatus: 1 })
  const plan = buildReviewBranchPushPlan({
    handoffReceipt: receipt(existingBranch),
    mainProtectionSnapshotReceipt: mainProtectionReceipt(),
    gitState: gitState(),
    git,
  })
  assert.equal(plan.fastForwardProof.required, true)
  assert.equal(plan.fastForwardProof.ok, false)
  assert.equal(plan.fastForwardProof.status, 'not_fast_forward')
  assert.equal(plan.readiness.executeReady, false)
  assert.ok(plan.readiness.blockers.includes('fast_forward_proof_missing_or_failed'))
  assert.equal(validateReviewBranchPushReport(plan, { expectedMode: 'plan_only_no_git_remote_write' }), plan)
  const existingHandoffReceipt = receipt(existingBranch)
  const existingGate = validateReviewBranchPushHandoff(existingHandoffReceipt.packet)
  await assert.rejects(
    applyReviewBranchPushWithGit({
      handoffReceipt: existingHandoffReceipt,
      mainProtectionSnapshotReceipt: mainProtectionReceipt(),
      ownerApprovalReceipt: ownerClickReceipt(existingHandoffReceipt, existingGate),
      ownerApprovalChallenge,
      git,
      verifyHandoff: async () => ({
        ok: true,
        candidate: { branch, commit, clean: true },
        nextAction: {
          exactCommit: commit,
          forcePushAllowed: false,
          mergeIncluded: false,
          deploymentIncluded: false,
        },
      }),
      now: () => ownerApprovalTime,
    }),
    /review_branch_push_fast_forward_unproven/,
  )
})

test('report validator rejects stale plan digests and wrong modes', () => {
  const plan = buildReviewBranchPushPlan({
    handoffReceipt: receipt(),
    gitState: gitState(),
  })
  assert.throws(
    () => validateReviewBranchPushReport({ ...plan, mode: 'executed_owner_approved_git_remote_write' }, { expectedMode: 'plan_only_no_git_remote_write' }),
    /review_branch_push_report_digest_invalid/,
  )
  assert.throws(
    () => validateReviewBranchPushReport({ ...plan, digest: `sha256:${'0'.repeat(64)}` }, { expectedMode: 'plan_only_no_git_remote_write' }),
    /review_branch_push_report_digest_invalid/,
  )
})

test('execution requires exact owner approval and matching local state', () => {
  const gate = validateReviewBranchPushHandoff(packet())
  assert.throws(
    () => validateOwnerApproval({ gate, execute: true }),
    /review_branch_push_owner_approval_required/,
  )
  assert.throws(
    () => validateOwnerApproval({
      gate,
      env: { SUPERMEGA_REVIEW_BRANCH_PUSH_APPROVAL: approvalTemplate },
      execute: true,
    }),
    /review_branch_push_owner_approval_required/,
  )
  assert.throws(
    () => buildReviewBranchPushPlan({
      handoffReceipt: receipt(),
      gitState: gitState({ head: 'c'.repeat(40) }),
    }),
    /review_branch_push_local_state_mismatch/,
  )
})

test('local owner-click receipt replaces plaintext approval and expires fail closed', () => {
  const handoffReceipt = receipt()
  const gate = validateReviewBranchPushHandoff(handoffReceipt.packet)
  const ownerApprovalReceipt = ownerClickReceipt(handoffReceipt, gate)
  const approval = validateOwnerApproval({
    gate,
    handoffReceipt,
    ownerApprovalReceipt,
    ownerApprovalChallenge,
    execute: true,
    now: ownerApprovalTime,
  })
  assert.equal(approval.approved, true)
  assert.equal(approval.method, 'in_process_owner_click_receipt')
  assert.equal(approval.receipt.digest, ownerApprovalReceipt.packet.digest)
  assert.equal(approval.receipt.consumed, false)
  assert.throws(
    () => validateOwnerApproval({
      gate,
      handoffReceipt,
      ownerApprovalReceipt,
      ownerApprovalChallenge,
      execute: true,
      now: new Date(ownerApprovalTime.getTime() + REVIEW_BRANCH_PUSH_OWNER_RECEIPT_TTL_MS),
    }),
    /review_branch_push_owner_receipt_expired_or_not_current/,
  )
})

test('execute consumes the owner-click receipt exactly once before the push', async () => {
  const handoffReceipt = receipt()
  const gate = validateReviewBranchPushHandoff(handoffReceipt.packet)
  const ownerApprovalReceipt = ownerClickReceipt(handoffReceipt, gate)
  const base = stubGit()
  const sequence = []
  let consumeCount = 0
  const git = (args, options) => {
    if (args[0] === 'push') sequence.push('push')
    return base.git(args, options)
  }
  const result = await applyReviewBranchPushWithGit({
    handoffReceipt,
    mainProtectionSnapshotReceipt: mainProtectionReceipt(),
    ownerApprovalReceipt,
    ownerApprovalChallenge,
    git,
    verifyHandoff: async () => ({
      ok: true,
      candidate: { branch, commit, clean: true },
      nextAction: {
        exactCommit: commit,
        forcePushAllowed: false,
        mergeIncluded: false,
        deploymentIncluded: false,
      },
    }),
    consumeApprovalReceipt: async (received) => {
      consumeCount += 1
      sequence.push('consume')
      return { ok: true, packetDigest: received.packet.digest }
    },
    now: () => ownerApprovalTime,
  })
  assert.equal(consumeCount, 1)
  assert.deepEqual(sequence, ['consume', 'push'])
  assert.equal(result.approval.method, 'in_process_owner_click_receipt')
  assert.equal(result.approval.receipt.consumed, true)
  assert.equal(result.controls.ownerApprovalReceiptConsumed, true)
  assert.equal(validateReviewBranchPushReport(result), result)
})

test('execute performs one normal exact-commit branch push and verifies the remote head', async () => {
  const handoffReceipt = receipt()
  const gate = validateReviewBranchPushHandoff(handoffReceipt.packet)
  const ownerApprovalReceipt = ownerClickReceipt(handoffReceipt, gate)
  const { git, calls } = stubGit()
  const result = await applyReviewBranchPushWithGit({
    handoffReceipt,
    mainProtectionSnapshotReceipt: mainProtectionReceipt(),
    ownerApprovalReceipt,
    ownerApprovalChallenge,
    git,
    verifyHandoff: async () => ({
      ok: true,
      candidate: { branch, commit, clean: true },
      nextAction: {
        exactCommit: commit,
        forcePushAllowed: false,
        mergeIncluded: false,
        deploymentIncluded: false,
      },
    }),
    consumeApprovalReceipt: async (received) => ({
      ok: true,
      packetDigest: received.packet.digest,
    }),
    now: () => ownerApprovalTime,
  })
  assert.equal(result.ok, true)
  assert.equal(result.mode, 'executed_owner_approved_git_remote_write')
  assert.equal(result.controls.gitRemoteWritesPerformed, true)
  assert.equal(result.controls.remoteHeadLeaseEnforced, true)
  assert.equal(result.controls.branchMutated, true)
  assert.equal(result.controls.forcePushPerformed, false)
  assert.equal(result.controls.branchDeletionPerformed, false)
  assert.equal(result.controls.pullRequestCreated, false)
  assert.equal(result.controls.mergePerformed, false)
  assert.equal(result.controls.deploymentPerformed, false)
  assert.equal(result.fastForwardProof.required, false)
  assert.equal(result.fastForwardProof.ok, true)
  assert.equal(result.verification.remoteStateUnchanged, true)
  assert.equal(result.verification.fastForwardProofOk, true)
  assert.deepEqual(
    calls.filter((args) => args[0] === 'push'),
    [[
      'push',
      `--force-with-lease=refs/heads/${branch}:`,
      'origin',
      `${commit}:refs/heads/${branch}`,
    ]],
  )
})

test('execute rejects a changed remote branch before pushing', async () => {
  const changedRemote = 'e'.repeat(40)
  const existingBranch = packet({
    remote: {
      candidateCommit: remoteBase,
      candidateBranchState: 'different',
    },
    actions: { reviewBranchPush: {
      kind: 'owner_review_fast_forward_branch_push',
      branch,
      exactCommit: commit,
      forcePushAllowed: false,
      mergeIncluded: false,
      deploymentIncluded: false,
      approvalTemplate: fastForwardApprovalTemplate,
    } },
  })
  const { git, calls } = stubGit({
    before: changedRemote,
    after: commit,
    mergeBaseRemote: remoteBase,
    mergeBaseStatus: 0,
  })
  const handoffReceipt = receipt(existingBranch)
  const gate = validateReviewBranchPushHandoff(handoffReceipt.packet)
  await assert.rejects(
    applyReviewBranchPushWithGit({
      handoffReceipt,
      mainProtectionSnapshotReceipt: mainProtectionReceipt(),
      ownerApprovalReceipt: ownerClickReceipt(handoffReceipt, gate),
      ownerApprovalChallenge,
      git,
      verifyHandoff: async () => ({
        ok: true,
        candidate: { branch, commit, clean: true },
        nextAction: {
          exactCommit: commit,
          forcePushAllowed: false,
          mergeIncluded: false,
          deploymentIncluded: false,
        },
      }),
      now: () => ownerApprovalTime,
    }),
    /review_branch_push_remote_state_changed/,
  )
  assert.equal(calls.some((args) => args[0] === 'push'), false)
})

test('execute no-ops when the remote branch already equals the candidate', async () => {
  const alreadyPublished = packet({
    remote: {
      candidateCommit: commit,
      candidateBranchState: 'exact',
    },
    actions: { reviewBranchPush: {
      kind: 'owner_review_fast_forward_branch_push',
      branch,
      exactCommit: commit,
      forcePushAllowed: false,
      mergeIncluded: false,
      deploymentIncluded: false,
      approvalTemplate: `I approve one normal fast-forward-only push of ${commit} to origin/${branch} for review only. I do not approve merge, workflow dispatch, deployment, domain, environment, database, credential, payment, message, customer contact, stock, or production changes.`,
    } },
  })
  const { git, calls } = stubGit({ before: commit, after: commit })
  const result = await applyReviewBranchPushWithGit({
    handoffReceipt: receipt(alreadyPublished),
    mainProtectionSnapshotReceipt: mainProtectionReceipt(),
    git,
    verifyHandoff: async () => ({
      ok: true,
      candidate: { branch, commit, clean: true },
      nextAction: {
        exactCommit: commit,
        forcePushAllowed: false,
        mergeIncluded: false,
        deploymentIncluded: false,
      },
    }),
  })
  assert.equal(result.mode, 'executed_already_published_no_write')
  assert.equal(result.controls.gitRemoteWritesPerformed, false)
  assert.equal(result.controls.gitRemoteWritesApproved, false)
  assert.equal(result.controls.ownerApprovalReceiptConsumed, false)
  assert.equal(result.controls.remoteHeadLeaseEnforced, false)
  assert.equal(result.controls.branchMutated, false)
  assert.equal(result.approval.method, 'none')
  assert.equal(calls.some((args) => args[0] === 'push'), false)
})

test('exact remote-head lease rejects a race after approval instead of overwriting the branch', async () => {
  const existingBranch = packet({
    remote: {
      candidateCommit: remoteBase,
      candidateBranchState: 'different',
    },
    actions: { reviewBranchPush: {
      kind: 'owner_review_fast_forward_branch_push',
      branch,
      exactCommit: commit,
      forcePushAllowed: false,
      mergeIncluded: false,
      deploymentIncluded: false,
      approvalTemplate: fastForwardApprovalTemplate,
    } },
  })
  const handoffReceipt = receipt(existingBranch)
  const gate = validateReviewBranchPushHandoff(handoffReceipt.packet)
  const ownerApprovalReceipt = ownerClickReceipt(handoffReceipt, gate)
  const { git, calls } = stubGit({
    before: remoteBase,
    after: commit,
    mergeBaseRemote: remoteBase,
    mergeBaseStatus: 0,
    pushStatus: 1,
  })
  let consumeCount = 0
  await assert.rejects(
    applyReviewBranchPushWithGit({
      handoffReceipt,
      mainProtectionSnapshotReceipt: mainProtectionReceipt(),
      ownerApprovalReceipt,
      ownerApprovalChallenge,
      git,
      verifyHandoff: async () => ({
        ok: true,
        candidate: { branch, commit, clean: true },
        nextAction: {
          exactCommit: commit,
          forcePushAllowed: false,
          mergeIncluded: false,
          deploymentIncluded: false,
        },
      }),
      consumeApprovalReceipt: async (received) => {
        consumeCount += 1
        return { ok: true, packetDigest: received.packet.digest }
      },
      now: () => ownerApprovalTime,
    }),
    /review_branch_push_push_failed/,
  )
  assert.equal(consumeCount, 1)
  assert.deepEqual(
    calls.filter((args) => args[0] === 'push'),
    [[
      'push',
      `--force-with-lease=refs/heads/${branch}:${remoteBase}`,
      'origin',
      `${commit}:refs/heads/${branch}`,
    ]],
  )
})

test('real Git exact leases create an absent ref, allow the approved fast-forward, and reject a raced head', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'supermega-review-lease-'))
  const remote = join(directory, 'remote.git')
  const work = join(directory, 'work')
  const successRef = 'refs/heads/codex/lease-success'
  const raceRef = 'refs/heads/codex/lease-race'
  try {
    runLocalGit(directory, ['init', '--bare', remote])
    runLocalGit(directory, ['init', work])
    runLocalGit(work, ['config', 'user.name', 'SuperMega focused test'])
    runLocalGit(work, ['config', 'user.email', 'focused-test@localhost'])
    runLocalGit(work, ['commit', '--allow-empty', '-m', 'base'])
    const base = runLocalGit(work, ['rev-parse', 'HEAD']).stdout.trim()
    runLocalGit(work, ['remote', 'add', 'origin', remote])

    runLocalGit(work, ['push', `--force-with-lease=${successRef}:`, 'origin', `${base}:${successRef}`])
    runLocalGit(work, ['push', `--force-with-lease=${raceRef}:`, 'origin', `${base}:${raceRef}`])

    runLocalGit(work, ['commit', '--allow-empty', '-m', 'approved candidate'])
    const approvedCandidate = runLocalGit(work, ['rev-parse', 'HEAD']).stdout.trim()
    runLocalGit(work, ['push', `--force-with-lease=${successRef}:${base}`, 'origin', `${approvedCandidate}:${successRef}`])
    assert.equal(runLocalGit(work, ['ls-remote', '--heads', 'origin', successRef]).stdout.split(/\s+/)[0], approvedCandidate)

    runLocalGit(work, ['switch', '--detach', base])
    runLocalGit(work, ['commit', '--allow-empty', '-m', 'racing writer'])
    const racedHead = runLocalGit(work, ['rev-parse', 'HEAD']).stdout.trim()
    runLocalGit(work, ['push', `--force-with-lease=${raceRef}:${base}`, 'origin', `${racedHead}:${raceRef}`])
    const staleAttempt = runLocalGit(
      work,
      ['push', `--force-with-lease=${raceRef}:${base}`, 'origin', `${approvedCandidate}:${raceRef}`],
      { optional: true },
    )
    assert.notEqual(staleAttempt.status, 0)
    assert.equal(runLocalGit(work, ['ls-remote', '--heads', 'origin', raceRef]).stdout.split(/\s+/)[0], racedHead)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('supported CLI rejects caller-supplied approval receipt paths', () => {
  const cli = fileURLToPath(new URL('./apply_review_branch_push.mjs', import.meta.url))
  const result = spawnSync(process.execPath, [cli, '--self-test', '--approval-receipt', 'caller-authored.json'], {
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true,
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /review_branch_push_usage_invalid/)
  assert.match(result.stderr, /"gitRemoteWritesPerformed": false/)
})

test('plan treats an already-published branch as satisfied without a second push approval', () => {
  const alreadyPublished = packet({
    remote: {
      candidateCommit: commit,
      candidateBranchState: 'exact',
    },
    actions: { reviewBranchPush: {
      kind: 'owner_review_fast_forward_branch_push',
      branch,
      exactCommit: commit,
      forcePushAllowed: false,
      mergeIncluded: false,
      deploymentIncluded: false,
      approvalTemplate: `I approve one normal fast-forward-only push of ${commit} to origin/${branch} for review only. I do not approve merge, workflow dispatch, deployment, domain, environment, database, credential, payment, message, customer contact, stock, or production changes.`,
    } },
  })
  const plan = buildReviewBranchPushPlan({
    handoffReceipt: receipt(alreadyPublished),
    mainProtectionSnapshotReceipt: mainProtectionReceipt(),
    gitState: { branch, head: commit, clean: true, origin },
  })
  assert.equal(plan.possibleWrite.kind, 'already_published_no_push')
  assert.equal(plan.possibleWrite.command, null)
  assert.equal(plan.readiness.executeReady, true)
  assert.deepEqual(plan.readiness.blockers, [])
  assert.equal(plan.controls.gitRemoteWritesApproved, false)
})

test('handoff validation rejects main, force, unsafe authority, and inconsistent remote state', () => {
  assert.throws(
    () => validateReviewBranchPushHandoff(packet({ candidate: { branch: 'main' }, nextAction: { branch: 'main' } })),
    /review_branch_push_branch_invalid/,
  )
  assert.throws(
    () => validateReviewBranchPushHandoff(packet({ actions: { reviewBranchPush: { ...packet().actions.reviewBranchPush, forcePushAllowed: true } } })),
    /review_branch_push_next_action_invalid/,
  )
  assert.throws(
    () => validateReviewBranchPushHandoff(packet({ authority: { deploymentApproved: true } })),
    /review_branch_push_authority_invalid/,
  )
  assert.throws(
    () => validateReviewBranchPushHandoff(packet({ remote: { candidateCommit: commit, candidateBranchState: 'unpublished' } })),
    /review_branch_push_remote_state_invalid/,
  )
  assert.throws(
    () => validateReviewBranchPushHandoff(packet({
      actions: {
        reviewBranchPush: {
          ...packet().actions.reviewBranchPush,
          approvalTemplate: approvalTemplate.replace(', customer contact, stock', ''),
        },
      },
    })),
    /review_branch_push_approval_template_invalid/,
  )
})

test('handoff validation still accepts the legacy nextAction branch-push shape', () => {
  const gate = validateReviewBranchPushHandoff(legacyPacket())
  assert.equal(gate.nextActionKind, 'owner_review_initial_branch_push')
  assert.equal(gate.approvalTemplate, approvalTemplate)
})
