import assert from 'node:assert/strict'
import test from 'node:test'

import {
  RELEASE_ARTIFACT_FAMILY_VERIFIER_CONTRACT,
  runSelfTest,
  scanOwnerFacingText,
  verifyAdminTechnicalCoordinationBinding,
  verifyShopDay0ProductMatrixBinding,
  verifyReleaseArtifactFamily,
} from './verify_release_artifact_family.mjs'
import {
  buildCurrentReleaseControlIndex,
  sampleCurrentReleaseControlIndexInput,
} from './prepare_current_release_control_index.mjs'
import { buildAdminTechnicalCoordinationPacket } from './prepare_admin_technical_coordination_packet.mjs'

test('release artifact family verifier self-test remains fail-closed', () => {
  const result = runSelfTest()
  assert.equal(result.contract, `${RELEASE_ARTIFACT_FAMILY_VERIFIER_CONTRACT}.self-test`)
  assert.equal(result.ok, true)
  assert.deepEqual(result.failedChecks, [])
  assert.equal(result.externalWritesPerformed, false)
})

test('owner-facing scan allows digests and gate labels', () => {
  const findings = scanOwnerFacingText(
    'safe.md',
    `Gate github_main_protection candidate sha256:${'a'.repeat(64)} controls false.`,
  )
  assert.deepEqual(findings, [])
})

test('owner-facing scan rejects private paths, contacts, and token shapes', () => {
  const findings = scanOwnerFacingText(
    'unsafe.md',
    'C:\\Users\\owner\\secret.txt owner@example.com ghp_123456789012345678901234',
  )
  assert.ok(findings.some((finding) => finding.pattern === 'windows_absolute_path'))
  assert.ok(findings.some((finding) => finding.pattern === 'email_like'))
  assert.ok(findings.some((finding) => finding.pattern === 'token_shape'))
})

test('artifact verification requires an explicit control index path', async () => {
  await assert.rejects(
    () => verifyReleaseArtifactFamily(),
    /release_artifact_family_control_index_missing/,
  )
})

test('product matrix must stay bound to Shop Day-0 intake and baseline state', () => {
  const day0Artifact = {
    digest: `sha256:${'a'.repeat(64)}`,
    sourceDigest: `sha256:${'b'.repeat(64)}`,
  }
  const matrix = {
    sourceDigests: { shopPilotDay0ReadinessDigest: day0Artifact.sourceDigest },
    products: [
      {
        productId: 'shop',
        currentBlockers: ['github_main_protection', 'owner_private_baseline', 'real_shop_pilot_evidence'],
      },
    ],
  }
  const day0 = {
    day0Readiness: {
      baselinePacketAccepted: false,
      intakePacketAccepted: true,
    },
  }
  assert.equal(verifyShopDay0ProductMatrixBinding(matrix, day0, day0Artifact), true)
  assert.throws(() => verifyShopDay0ProductMatrixBinding({
    ...matrix,
    sourceDigests: { shopPilotDay0ReadinessDigest: day0Artifact.digest },
  }, day0, day0Artifact), /shop_day0_digest_mismatch/)
  assert.throws(() => verifyShopDay0ProductMatrixBinding({
    ...matrix,
    products: [{ productId: 'shop', currentBlockers: [...matrix.products[0].currentBlockers, 'owner_private_intake'] }],
  }, day0, day0Artifact), /stale_shop_intake_blocker/)
  assert.throws(() => verifyShopDay0ProductMatrixBinding({
    ...matrix,
    products: [{ productId: 'shop', currentBlockers: ['github_main_protection', 'real_shop_pilot_evidence'] }],
  }, day0, day0Artifact), /missing_shop_baseline_blocker/)
})

test('admin technical coordination packet must bind to the same current release index', () => {
  const controlIndexFileName = 'supermega.current-release-control-index.v99.generated-20260826.json'
  const controlIndex = buildCurrentReleaseControlIndex(sampleCurrentReleaseControlIndexInput())
  const adminPacket = buildAdminTechnicalCoordinationPacket({
    currentReleaseControlIndex: controlIndex,
    remoteReviewBranchCommit: 'b'.repeat(40),
    remoteMainCommit: 'c'.repeat(40),
    sourceFileNames: { currentReleaseControlIndex: controlIndexFileName },
  })

  assert.equal(
    verifyAdminTechnicalCoordinationBinding(adminPacket, controlIndex, controlIndexFileName),
    adminPacket,
  )

  const differentControlIndex = buildCurrentReleaseControlIndex(sampleCurrentReleaseControlIndexInput({
    handoff: {
      ...sampleCurrentReleaseControlIndexInput().handoff,
      candidate: {
        ...sampleCurrentReleaseControlIndexInput().handoff.candidate,
        commit: 'd'.repeat(40),
      },
    },
    githubMainProtectionApplyPlan: {
      ...sampleCurrentReleaseControlIndexInput().githubMainProtectionApplyPlan,
      candidate: { head: 'd'.repeat(40) },
    },
    reviewBranchPushPlan: {
      ...sampleCurrentReleaseControlIndexInput().reviewBranchPushPlan,
      candidate: { head: 'd'.repeat(40) },
    },
    pullRequestCreatePlan: {
      ...sampleCurrentReleaseControlIndexInput().pullRequestCreatePlan,
      candidate: { head: 'd'.repeat(40) },
    },
    operatorBoard: {
      ...sampleCurrentReleaseControlIndexInput().operatorBoard,
      candidate: {
        ...sampleCurrentReleaseControlIndexInput().operatorBoard.candidate,
        commit: 'd'.repeat(40),
      },
    },
    nextReleaseActionPreflight: {
      ...sampleCurrentReleaseControlIndexInput().nextReleaseActionPreflight,
      candidateCommit: 'd'.repeat(40),
    },
    releaseOwnerApproval: {
      ...sampleCurrentReleaseControlIndexInput().releaseOwnerApproval,
      candidate: { commit: 'd'.repeat(40) },
    },
    githubMainProtectionOwnerActionCard: {
      ...sampleCurrentReleaseControlIndexInput().githubMainProtectionOwnerActionCard,
      currentAction: {
        ...sampleCurrentReleaseControlIndexInput().githubMainProtectionOwnerActionCard.currentAction,
        candidateCommit: 'd'.repeat(40),
      },
    },
    shopPilotDay0Readiness: {
      ...sampleCurrentReleaseControlIndexInput().shopPilotDay0Readiness,
      candidate: { head: 'd'.repeat(40) },
    },
    shopPilotDay0OwnerBaselineActionCard: {
      ...sampleCurrentReleaseControlIndexInput().shopPilotDay0OwnerBaselineActionCard,
      candidate: { head: 'd'.repeat(40) },
    },
  }))

  assert.throws(
    () => verifyAdminTechnicalCoordinationBinding(adminPacket, differentControlIndex, controlIndexFileName),
    /admin_technical_coordination_candidate_mismatch/,
  )
})
