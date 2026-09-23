import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import {
  CURRENT_RELEASE_CONTROL_INDEX_CONTRACT,
  buildCurrentReleaseControlIndex,
  renderCurrentReleaseControlIndexMarkdown,
  runSelfTest,
  sampleCurrentReleaseControlIndexInput,
  validateCurrentReleaseControlIndex,
} from './prepare_current_release_control_index.mjs'

test('builds a current release control index for one exact candidate', () => {
  const packet = buildCurrentReleaseControlIndex(sampleCurrentReleaseControlIndexInput())
  assert.equal(packet.contract, CURRENT_RELEASE_CONTROL_INDEX_CONTRACT)
  assert.equal(packet.currentOwnerAction.gateId, 'github_main_protection')
  assert.equal(packet.currentOwnerAction.branchPushAllowedNow, false)
  assert.equal(packet.currentOwnerAction.pullRequestAllowedNow, false)
  assert.equal(packet.currentOwnerAction.deployAllowedNow, false)
  assert.equal(packet.currentOwnerAction.supabaseWriteAllowedNow, false)
  assert.equal(packet.currentOwnerAction.customerContactAllowedNow, false)
  assert.equal(packet.currentOwnerAction.paymentOrStockAllowedNow, false)
  assert.equal(packet.currentOwnerAction.managedActivationAllowedNow, false)
  assert.equal(packet.authoritativeArtifacts.releaseOwnerApprovalPacket.status, 'verified_current')
  assert.equal(packet.authoritativeArtifacts.githubMainProtectionOwnerActionCard.currentAction, 'github_main_protection')
  assert.equal(packet.authoritativeArtifacts.shopPilotDay0OwnerBaselineActionCard.currentAction, 'capture-owner-observed-baseline')
  assert.equal(packet.artifactFamily.version, 'v99')
  assert.equal(packet.shopPilot.currentPrivateGate, 'private_observation_incomplete')
  assert.equal(validateCurrentReleaseControlIndex(packet), packet)
})

test('records a stale owner packet without making it authoritative', () => {
  const packet = buildCurrentReleaseControlIndex(sampleCurrentReleaseControlIndexInput({
    staleOwnerApprovalPacketObserved: true,
    staleOwnerApprovalPacketFileName: 'supermega.release-owner-approval-packet.v100.generated-20260826.md',
    staleOwnerApprovalRejection: 'release_owner_approval_packet_stale',
  }))
  assert.equal(packet.stalePacketPolicy.staleOwnerApprovalPacketObserved, true)
  assert.equal(packet.stalePacketPolicy.staleOwnerApprovalPacketFileName, 'supermega.release-owner-approval-packet.v100.generated-20260826.md')
  assert.equal(packet.currentOwnerAction.sourcePacketFileName, 'supermega.release-owner-approval-packet.v99.generated-20260826.md')
  const markdown = renderCurrentReleaseControlIndexMarkdown(packet)
  assert.match(markdown, /Observed stale owner approval packet rejected/)
  assert.match(markdown, /supermega\.release-owner-approval-packet\.v99\.generated-20260826\.md/)
  assert.equal(validateCurrentReleaseControlIndex(packet), packet)
})

test('builds a current release control index after main protection advances to branch push', () => {
  const base = sampleCurrentReleaseControlIndexInput()
  const paths = { ...base.paths }
  delete paths.githubMainProtectionOwnerActionCard
  const packet = buildCurrentReleaseControlIndex(sampleCurrentReleaseControlIndexInput({
    githubMainProtectionSnapshot: {
      ...base.githubMainProtectionSnapshot,
      assessmentOk: true,
      currentAction: 'main_protection_verified_continue_to_review_branch_push',
    },
    operatorBoard: {
      ...base.operatorBoard,
      currentAction: { gateId: 'review_branch_push' },
    },
    productReadinessMatrix: {
      ...base.productReadinessMatrix,
      release: { currentGateId: 'review_branch_push' },
    },
    statusBrief: {
      ...base.statusBrief,
      release: { currentGateId: 'review_branch_push' },
    },
    nextReleaseActionPreflight: {
      ...base.nextReleaseActionPreflight,
      currentGateId: 'review_branch_push',
    },
    githubMainProtectionOwnerActionCard: null,
    paths,
  }))

  assert.equal(packet.currentOwnerAction.gateId, 'review_branch_push')
  assert.equal(packet.currentOwnerAction.sourceActionCardFileName, 'supermega.review-branch-push-plan.v99.generated-20260826.json')
  assert.equal(packet.authoritativeArtifacts.githubMainProtectionOwnerActionCard, undefined)
  const markdown = renderCurrentReleaseControlIndexMarkdown(packet)
  assert.match(markdown, /approve section 2 only: initial review-branch push/)
  assert.equal(validateCurrentReleaseControlIndex(packet), packet)
})

test('labels a review branch update as fast-forward when the remote branch already exists', () => {
  const base = sampleCurrentReleaseControlIndexInput()
  const paths = { ...base.paths }
  delete paths.githubMainProtectionOwnerActionCard
  const packet = buildCurrentReleaseControlIndex(sampleCurrentReleaseControlIndexInput({
    githubMainProtectionSnapshot: {
      ...base.githubMainProtectionSnapshot,
      assessmentOk: true,
      currentAction: 'main_protection_verified_continue_to_review_branch_push',
    },
    reviewBranchPushPlan: {
      ...base.reviewBranchPushPlan,
      possibleWrite: { kind: 'fast_forward_branch_push' },
    },
    operatorBoard: {
      ...base.operatorBoard,
      currentAction: { gateId: 'review_branch_push' },
    },
    productReadinessMatrix: {
      ...base.productReadinessMatrix,
      release: { currentGateId: 'review_branch_push' },
    },
    statusBrief: {
      ...base.statusBrief,
      release: { currentGateId: 'review_branch_push' },
    },
    nextReleaseActionPreflight: {
      ...base.nextReleaseActionPreflight,
      currentGateId: 'review_branch_push',
    },
    githubMainProtectionOwnerActionCard: null,
    paths,
  }))

  assert.equal(packet.currentOwnerAction.label, 'Approve exact fast-forward-only review-branch push only')
  const markdown = renderCurrentReleaseControlIndexMarkdown(packet)
  assert.match(markdown, /approve section 2 only: fast-forward-only review-branch push/)
  assert.doesNotMatch(markdown, /section 2 only: initial review-branch push/)
  assert.equal(validateCurrentReleaseControlIndex(packet), packet)
})

test('builds a current release control index after branch push advances to PR creation', () => {
  const base = sampleCurrentReleaseControlIndexInput()
  const paths = { ...base.paths }
  delete paths.githubMainProtectionOwnerActionCard
  const packet = buildCurrentReleaseControlIndex(sampleCurrentReleaseControlIndexInput({
    githubMainProtectionSnapshot: {
      ...base.githubMainProtectionSnapshot,
      assessmentOk: true,
      currentAction: 'main_protection_verified_continue_to_review_branch_push',
    },
    reviewBranchPushPlan: {
      ...base.reviewBranchPushPlan,
      possibleWrite: { kind: 'already_published_no_push' },
    },
    operatorBoard: {
      ...base.operatorBoard,
      currentAction: { gateId: 'pull_request_creation' },
    },
    productReadinessMatrix: {
      ...base.productReadinessMatrix,
      release: { currentGateId: 'pull_request_creation' },
    },
    statusBrief: {
      ...base.statusBrief,
      release: { currentGateId: 'pull_request_creation' },
    },
    nextReleaseActionPreflight: {
      ...base.nextReleaseActionPreflight,
      currentGateId: 'pull_request_creation',
    },
    githubMainProtectionOwnerActionCard: null,
    paths,
  }))

  assert.equal(packet.currentOwnerAction.gateId, 'pull_request_creation')
  assert.equal(packet.currentOwnerAction.sourceActionCardFileName, 'supermega.pull-request-create-plan.v99.generated-20260826.json')
  assert.equal(packet.authoritativeArtifacts.githubMainProtectionOwnerActionCard, undefined)
  const markdown = renderCurrentReleaseControlIndexMarkdown(packet)
  assert.match(markdown, /approve section 3 only: review-only pull request creation/)
  assert.equal(validateCurrentReleaseControlIndex(packet), packet)
})

test('accepts current preflight candidate schema without weakening mismatch guard', () => {
  const base = sampleCurrentReleaseControlIndexInput()
  const packet = buildCurrentReleaseControlIndex(sampleCurrentReleaseControlIndexInput({
    nextReleaseActionPreflight: {
      ...base.nextReleaseActionPreflight,
      candidateCommit: undefined,
      candidate: { commit: base.handoff.candidate.commit },
    },
  }))
  assert.equal(packet.candidate.commit, base.handoff.candidate.commit)
  assert.throws(
    () => buildCurrentReleaseControlIndex(sampleCurrentReleaseControlIndexInput({
      nextReleaseActionPreflight: {
        ...base.nextReleaseActionPreflight,
        candidateCommit: undefined,
        candidate: { commit: 'd'.repeat(40) },
      },
    })),
    /current_release_control_index_preflight_candidate_mismatch/,
  )
})

test('accepts current preflight gate schema from validated packet shape', () => {
  const base = sampleCurrentReleaseControlIndexInput()
  const packet = buildCurrentReleaseControlIndex(sampleCurrentReleaseControlIndexInput({
    nextReleaseActionPreflight: {
      ...base.nextReleaseActionPreflight,
      currentGateId: undefined,
      currentAction: { gateId: 'github_main_protection' },
    },
  }))
  assert.equal(packet.currentOwnerAction.gateId, 'github_main_protection')
  assert.throws(
    () => buildCurrentReleaseControlIndex(sampleCurrentReleaseControlIndexInput({
      nextReleaseActionPreflight: {
        ...base.nextReleaseActionPreflight,
        currentGateId: undefined,
        currentAction: { gateId: 'preview_rehearsal' },
      },
    })),
    /current_release_control_index_gate_invalid/,
  )
})

test('rejects mismatched candidate authority and unsafe owner action drift', () => {
  assert.throws(
    () => buildCurrentReleaseControlIndex(sampleCurrentReleaseControlIndexInput({
      releaseOwnerApproval: {
        ...sampleCurrentReleaseControlIndexInput().releaseOwnerApproval,
        candidate: { commit: 'c'.repeat(40) },
      },
    })),
    /current_release_control_index_owner_approval_candidate_mismatch/,
  )
  const packet = buildCurrentReleaseControlIndex(sampleCurrentReleaseControlIndexInput())
  assert.throws(
    () => validateCurrentReleaseControlIndex({
      ...packet,
      currentOwnerAction: {
        ...packet.currentOwnerAction,
        deployAllowedNow: true,
      },
    }),
    /current_release_control_index_digest_invalid/,
  )
})

test('rejects mixed generated artifact version families', () => {
  const base = sampleCurrentReleaseControlIndexInput()
  assert.throws(
    () => buildCurrentReleaseControlIndex(sampleCurrentReleaseControlIndexInput({
      paths: {
        ...base.paths,
        releaseOwnerApproval: 'supermega.release-owner-approval-packet.v100.generated-20260826.md',
      },
    })),
    /current_release_control_index_artifact_family_version_mismatch/,
  )

  const packet = buildCurrentReleaseControlIndex(base)
  assert.throws(
    () => validateCurrentReleaseControlIndex({
      ...packet,
      artifactFamily: { ...packet.artifactFamily, version: 'v100' },
      digest: packet.digest,
    }),
    /current_release_control_index_digest_invalid/,
  )
})

test('renders public-safe markdown and verifies CLI packet', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'supermega-release-index-'))
  try {
    const packet = buildCurrentReleaseControlIndex(sampleCurrentReleaseControlIndexInput())
    const packetPath = join(parent, 'index.json')
    const markdownPath = join(parent, 'index.md')
    await writeFile(packetPath, `${JSON.stringify(packet, null, 2)}\n`)
    await writeFile(markdownPath, `${renderCurrentReleaseControlIndexMarkdown(packet)}\n`)
    const verified = spawnSync(process.execPath, [resolve('tools/prepare_current_release_control_index.mjs'), '--verify', packetPath], { encoding: 'utf8' })
    assert.equal(verified.status, 0, verified.stderr)
    const result = JSON.parse(verified.stdout)
    assert.equal(result.ok, true)
    assert.equal(result.currentGateId, 'github_main_protection')
    const markdown = await readFile(markdownPath, 'utf8')
    assert.doesNotMatch(markdown, /sk-|github_pat_|ghp_|postgres:|owner@example|ready for managed activation/i)
    assert.match(markdown, /Only the artifacts listed above are current/)
    assert.match(markdown, /supermega\.github-main-protection-owner-action-card\.v99\.generated-20260826\.json/)
    assert.match(markdown, /supermega\.shop-pilot-day0-owner-baseline-action-card\.v99\.generated-20260826\.json/)
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})

test('self-test remains green', () => {
  const result = runSelfTest()
  assert.equal(result.ok, true)
  assert.equal(result.failedChecks.length, 0)
})
