import assert from 'node:assert/strict'
import test from 'node:test'

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
const approvalEnv = 'SUPERMEGA_REVIEW_BRANCH_PUSH_APPROVAL'
const ownerApprovalTime = new Date('2026-08-28T03:00:00.000Z')

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
    if (command === `push origin ${commit}:refs/heads/${branch}`) {
      return { status: pushStatus, stdout: '', stderr: pushStatus === 0 ? '' : 'rejected' }
    }
    if (command === `merge-base --is-ancestor ${mergeBaseRemote} ${commit}`) {
      return { status: mergeBaseStatus, stdout: '', stderr: '' }
    }
    throw new Error(`unexpected git call: ${command}`)
  }
  return { git, calls }
}

test('plan is no-write, exact-commit-bound, and approval-aware', () => {
  const plan = buildReviewBranchPushPlan({
    handoffReceipt: receipt(),
    gitState: gitState(),
    env: {},
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
  assert.deepEqual(plan.possibleWrite.command, ['git', 'push', 'origin', `${commit}:refs/heads/${branch}`])
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
    env: { [approvalEnv]: fastForwardApprovalTemplate },
    git,
  })
  assert.equal(plan.possibleWrite.kind, 'fast_forward_branch_push')
  assert.equal(plan.fastForwardProof.required, true)
  assert.equal(plan.fastForwardProof.ok, true)
  assert.equal(plan.fastForwardProof.status, 'proven_ancestor')
  assert.deepEqual(plan.fastForwardProof.command, ['git', 'merge-base', '--is-ancestor', remoteBase, commit])
  assert.equal(plan.readiness.executeReady, true)
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
    env: { [approvalEnv]: fastForwardApprovalTemplate },
    git,
  })
  assert.equal(plan.fastForwardProof.required, true)
  assert.equal(plan.fastForwardProof.ok, false)
  assert.equal(plan.fastForwardProof.status, 'not_fast_forward')
  assert.equal(plan.readiness.executeReady, false)
  assert.ok(plan.readiness.blockers.includes('fast_forward_proof_missing_or_failed'))
  assert.equal(validateReviewBranchPushReport(plan, { expectedMode: 'plan_only_no_git_remote_write' }), plan)
  await assert.rejects(
    applyReviewBranchPushWithGit({
      handoffReceipt: receipt(existingBranch),
      mainProtectionSnapshotReceipt: mainProtectionReceipt(),
      env: { [approvalEnv]: fastForwardApprovalTemplate },
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
    }),
    /review_branch_push_fast_forward_unproven/,
  )
})

test('report validator rejects stale plan digests and wrong modes', () => {
  const plan = buildReviewBranchPushPlan({
    handoffReceipt: receipt(),
    gitState: gitState(),
    env: {},
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
    () => validateOwnerApproval({ gate, env: {}, execute: true }),
    /review_branch_push_owner_approval_required/,
  )
  assert.equal(
    validateOwnerApproval({ gate, env: { [approvalEnv]: approvalTemplate }, execute: true }).approved,
    true,
  )
  assert.throws(
    () => buildReviewBranchPushPlan({
      handoffReceipt: receipt(),
      gitState: gitState({ head: 'c'.repeat(40) }),
      env: {},
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
    env: {},
    execute: true,
    now: ownerApprovalTime,
  })
  assert.equal(approval.approved, true)
  assert.equal(approval.method, 'local_owner_click_receipt')
  assert.equal(approval.receipt.digest, ownerApprovalReceipt.packet.digest)
  assert.equal(approval.receipt.consumed, false)
  assert.throws(
    () => validateOwnerApproval({
      gate,
      handoffReceipt,
      ownerApprovalReceipt,
      env: {},
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
    env: {},
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
  assert.equal(result.approval.method, 'local_owner_click_receipt')
  assert.equal(result.approval.receipt.consumed, true)
  assert.equal(result.controls.ownerApprovalReceiptConsumed, true)
  assert.equal(validateReviewBranchPushReport(result), result)
})

test('execute performs one normal exact-commit branch push and verifies the remote head', async () => {
  const { git, calls } = stubGit()
  const result = await applyReviewBranchPushWithGit({
    handoffReceipt: receipt(),
    mainProtectionSnapshotReceipt: mainProtectionReceipt(),
    env: { [approvalEnv]: approvalTemplate },
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
  assert.equal(result.ok, true)
  assert.equal(result.mode, 'executed_owner_approved_git_remote_write')
  assert.equal(result.controls.gitRemoteWritesPerformed, true)
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
    [['push', 'origin', `${commit}:refs/heads/${branch}`]],
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
  await assert.rejects(
    applyReviewBranchPushWithGit({
      handoffReceipt: receipt(existingBranch),
      mainProtectionSnapshotReceipt: mainProtectionReceipt(),
      env: { [approvalEnv]: fastForwardApprovalTemplate },
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
    env: { [approvalEnv]: alreadyPublished.actions.reviewBranchPush.approvalTemplate },
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
  assert.equal(result.mode, 'executed_owner_approved_already_published_no_write')
  assert.equal(result.controls.gitRemoteWritesPerformed, false)
  assert.equal(result.controls.branchMutated, false)
  assert.equal(calls.some((args) => args[0] === 'push'), false)
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
    env: {},
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
