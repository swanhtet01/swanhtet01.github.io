import assert from 'node:assert/strict'
import test from 'node:test'

import {
  RELEASE_ARTIFACT_FAMILY_VERIFIER_CONTRACT,
  runSelfTest,
  scanOwnerFacingText,
  verifyShopDay0ProductMatrixBinding,
  verifyReleaseArtifactFamily,
} from './verify_release_artifact_family.mjs'

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
  const day0Artifact = { digest: `sha256:${'a'.repeat(64)}` }
  const matrix = {
    sourceDigests: { shopPilotDay0ReadinessDigest: day0Artifact.digest },
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
    sourceDigests: { shopPilotDay0ReadinessDigest: `sha256:${'b'.repeat(64)}` },
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
