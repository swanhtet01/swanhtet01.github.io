import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import {
  ADMIN_TECHNICAL_COORDINATION_PACKET_CONTRACT,
  buildAdminTechnicalCoordinationPacket,
  renderAdminTechnicalCoordinationMarkdown,
  runSelfTest,
  validateAdminTechnicalCoordinationPacket,
} from './prepare_admin_technical_coordination_packet.mjs'
import {
  buildCurrentReleaseControlIndex,
  sampleCurrentReleaseControlIndexInput,
} from './prepare_current_release_control_index.mjs'

function reviewBranchControlIndex() {
  const base = sampleCurrentReleaseControlIndexInput()
  const paths = { ...base.paths }
  delete paths.githubMainProtectionOwnerActionCard
  return buildCurrentReleaseControlIndex(sampleCurrentReleaseControlIndexInput({
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
}

test('builds an owner-safe Admin/ROG coordination packet for the current release gate', () => {
  const controlIndex = reviewBranchControlIndex()
  const packet = buildAdminTechnicalCoordinationPacket({
    generatedAt: '2026-08-26T00:00:00.000Z',
    currentReleaseControlIndex: controlIndex,
    remoteReviewBranchCommit: '4'.repeat(40),
    remoteMainCommit: '5'.repeat(40),
    sourceFileNames: {
      currentReleaseControlIndex: 'supermega.current-release-control-index.v99.generated-20260826.json',
      releaseOwnerApprovalPacket: 'supermega.release-owner-approval-packet.v99.generated-20260826.md',
      reviewBranchPushPlan: 'supermega.review-branch-push-plan.v99.generated-20260826.json',
      pullRequestCreatePlan: 'supermega.pull-request-create-plan.v99.generated-20260826.json',
      shopPilotOwnerObservationPack: 'supermega.shop-pilot-owner-observation-pack.v99.current-control.generated-20260826.md',
    },
  })
  assert.equal(packet.contract, ADMIN_TECHNICAL_COORDINATION_PACKET_CONTRACT)
  assert.equal(packet.candidate.commit, controlIndex.candidate.commit)
  assert.equal(packet.nextGate.id, 'review_branch_push')
  assert.equal(packet.currentOwnerAction.branchPushAllowedNow, false)
  assert.equal(packet.currentOwnerAction.pullRequestAllowedNow, false)
  assert.equal(packet.currentOwnerAction.deployAllowedNow, false)
  assert.equal(packet.currentOwnerAction.supabaseWriteAllowedNow, false)
  assert.equal(packet.currentOwnerAction.customerContactAllowedNow, false)
  assert.equal(packet.currentOwnerAction.paymentOrStockAllowedNow, false)
  assert.equal(packet.currentOwnerAction.managedActivationAllowedNow, false)
  assert.equal(packet.shopPilot.currentPrivateGate, 'private_observation_incomplete')
  assert.match(packet.nextGate.exactApprovalText, new RegExp(controlIndex.candidate.commit))
  assert.equal(validateAdminTechnicalCoordinationPacket(packet), packet)
})

test('renders markdown without local paths or credential-shaped values', () => {
  const controlIndex = reviewBranchControlIndex()
  const packet = buildAdminTechnicalCoordinationPacket({
    generatedAt: '2026-08-26T00:00:00.000Z',
    currentReleaseControlIndex: controlIndex,
    remoteReviewBranchCommit: '4'.repeat(40),
    sourceFileNames: {
      currentReleaseControlIndex: 'C:/Users/example/supermega.current-release-control-index.v99.generated-20260826.json',
    },
  })
  const markdown = renderAdminTechnicalCoordinationMarkdown(packet)
  assert.match(markdown, /Admin\/ROG Technical Coordination Packet/)
  assert.match(markdown, /fast-forward-only push/)
  assert.doesNotMatch(markdown, /C:\/Users/)
  assert.doesNotMatch(markdown, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(markdown, /github_pat_/)
})

test('moves to PR readiness refresh when remote review branch already equals candidate', () => {
  const controlIndex = reviewBranchControlIndex()
  const packet = buildAdminTechnicalCoordinationPacket({
    currentReleaseControlIndex: controlIndex,
    remoteReviewBranchCommit: controlIndex.candidate.commit,
  })
  assert.equal(packet.observedRemote.reviewBranchEqualsCandidate, true)
  assert.equal(packet.nextGate.id, 'pull_request_creation_readiness_refresh')
  assert.equal(packet.nextGate.exactApprovalText, null)
})

test('rejects unsafe external-write drift', () => {
  const controlIndex = reviewBranchControlIndex()
  const packet = buildAdminTechnicalCoordinationPacket({ currentReleaseControlIndex: controlIndex })
  assert.throws(
    () => validateAdminTechnicalCoordinationPacket({
      ...packet,
      currentOwnerAction: {
        ...packet.currentOwnerAction,
        deployAllowedNow: true,
      },
    }),
    /admin_technical_coordination_current_action_controls_invalid/,
  )
})

test('CLI writes and verifies generated packets without overwriting existing files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'supermega-admin-coordination-'))
  try {
    const controlIndexPath = join(dir, 'control-index.json')
    const output = join(dir, 'packet.json')
    const markdownOutput = join(dir, 'packet.md')
    await writeFile(controlIndexPath, `${JSON.stringify(reviewBranchControlIndex(), null, 2)}\n`)
    const run = spawnSync(process.execPath, [
      'tools/prepare_admin_technical_coordination_packet.mjs',
      '--control-index',
      controlIndexPath,
      '--remote-review-branch-commit',
      '4'.repeat(40),
      '--remote-main-commit',
      '5'.repeat(40),
      '--output',
      output,
      '--markdown-output',
      markdownOutput,
    ], { encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr || run.stdout)
    const packet = validateAdminTechnicalCoordinationPacket(JSON.parse(await readFile(output, 'utf8')))
    assert.equal(packet.nextGate.id, 'review_branch_push')
    const verify = spawnSync(process.execPath, [
      'tools/prepare_admin_technical_coordination_packet.mjs',
      '--verify',
      output,
    ], { encoding: 'utf8' })
    assert.equal(verify.status, 0, verify.stderr || verify.stdout)
    assert.match(await readFile(markdownOutput, 'utf8'), /Admin\/ROG operating rules/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('self-test reports owner-safe controls', () => {
  const result = runSelfTest()
  assert.equal(result.ok, true)
  assert.equal(result.externalWritesPerformed, false)
  assert.equal(result.checks.unsafe_control_drift_rejected, true)
})
