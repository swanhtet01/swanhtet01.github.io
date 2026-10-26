import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import {
  SHOP_ANDROID_QA_HANDOFF_CONTRACT,
  assessShopAndroidQaHandoff,
  sampleShopAndroidQaHandoffInput,
  validateShopAndroidQaHandoff,
} from './prepare_shop_android_qa_handoff.mjs'

function resign(packet) {
  const body = { ...packet }
  delete body.digest
  return {
    ...body,
    digest: `sha256:${createHash('sha256').update(JSON.stringify(body)).digest('hex')}`,
  }
}

test('binds the original native QA evidence without claiming installation', () => {
  const packet = assessShopAndroidQaHandoff(sampleShopAndroidQaHandoffInput())
  assert.equal(packet.contract, SHOP_ANDROID_QA_HANDOFF_CONTRACT)
  assert.equal(packet.status, 'ready_for_internal_install_run')
  assert.equal(packet.artifact.applicationId, 'dev.supermega.supermega_shop.qa')
  assert.equal(packet.artifact.applicationLabel, 'Shop QA')
  assert.equal(packet.artifact.productionSigned, false)
  assert.equal(packet.artifact.archiveContentsBound, true)
  assert.equal(packet.claimBoundary.installedAcceptanceProven, false)
  assert.equal(packet.claimBoundary.backupRestoreAcceptanceProven, false)
  assert.ok(packet.blockedCapabilities.some((entry) => entry.id === 'encrypted_backup_restore'))
  assert.equal(validateShopAndroidQaHandoff(packet), packet)
})

test('rejects stale source or a different artifact URL', () => {
  for (const metadata of [
    { headSha: 'not-current' },
    { sourceSha: 'not-current' },
    { sourceSha: '1111111111111111111111111111111111111111' },
    { artifactUrl: 'https://example.invalid/artifact' },
  ]) {
    const packet = assessShopAndroidQaHandoff(sampleShopAndroidQaHandoffInput({ metadata }))
    assert.equal(packet.ok, false)
  }
})

test('rejects a different valid-looking PR head than the retained release expectation', () => {
  const packet = assessShopAndroidQaHandoff(sampleShopAndroidQaHandoffInput({
    metadata: { headSha: '1111111111111111111111111111111111111111' },
  }))
  assert.ok(packet.failures.includes('release_expectation_mismatch'))
})

test('rejects a wrong application ID, label, or missing producer inspection', () => {
  const valid = sampleShopAndroidQaHandoffInput().metadata.identityInspection
  for (const identityInspection of [
    { ...valid, applicationId: 'dev.supermega.supermega_shop' },
    { ...valid, applicationLabel: 'Shop' },
    { ...valid, status: 'not_run' },
    { ...valid, runId: '999' },
    { ...valid, sourceSha: '1111111111111111111111111111111111111111' },
  ]) {
    const packet = assessShopAndroidQaHandoff(sampleShopAndroidQaHandoffInput({ metadata: { identityInspection } }))
    assert.ok(packet.failures.includes('android_qa_identity_evidence_invalid'))
  }
})

test('rejects tampered archive, APK checksum, or source manifest', () => {
  const archive = assessShopAndroidQaHandoff(sampleShopAndroidQaHandoffInput({ archiveBytes: Buffer.from('tampered') }))
  assert.ok(archive.failures.includes('artifact_archive_sha256_mismatch'))
  const checksum = assessShopAndroidQaHandoff(sampleShopAndroidQaHandoffInput({ checksumText: `${'f'.repeat(64)}  app-qa-debug.apk` }))
  assert.ok(checksum.failures.includes('apk_checksum_file_mismatch'))
  const manifest = assessShopAndroidQaHandoff(sampleShopAndroidQaHandoffInput({ manifestText: 'promotion-ineligible' }))
  assert.ok(manifest.failures.includes('artifact_manifest_mismatch'))
})

test('rejects files that did not come from the retained archive', () => {
  const replaced = assessShopAndroidQaHandoff(
    sampleShopAndroidQaHandoffInput({ apkBytes: Buffer.from('different apk') }),
  )
  assert.ok(replaced.failures.includes('artifact_archive_extraction_mismatch'))
})

test('rejects an archive with a falsified central-directory CRC', () => {
  const input = sampleShopAndroidQaHandoffInput()
  const archiveBytes = Buffer.from(input.archiveBytes)
  const eocd = archiveBytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const centralOffset = archiveBytes.readUInt32LE(eocd + 16)
  archiveBytes.writeUInt32LE(0, centralOffset + 16)
  const packet = assessShopAndroidQaHandoff({
    ...input,
    archiveBytes,
    metadata: {
      ...input.metadata,
      archiveSha256: createHash('sha256').update(archiveBytes).digest('hex'),
    },
  })
  assert.ok(packet.failures.includes('artifact_archive_format_invalid'))
  assert.equal(packet.artifact.archiveContentsBound, false)
})

test('rejects unparsed bytes between the central directory and EOCD', () => {
  const input = sampleShopAndroidQaHandoffInput()
  const archiveBytes = Buffer.from(input.archiveBytes)
  const eocd = archiveBytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const withGap = Buffer.concat([
    archiveBytes.subarray(0, eocd),
    Buffer.from('unparsed'),
    archiveBytes.subarray(eocd),
  ])
  const archiveSha256 = createHash('sha256').update(withGap).digest('hex')
  const packet = assessShopAndroidQaHandoff({
    ...input,
    archiveBytes: withGap,
    metadata: { ...input.metadata, archiveSha256 },
    expectations: { ...input.expectations, archiveSha256 },
  })
  assert.ok(packet.failures.includes('artifact_archive_format_invalid'))
  assert.equal(packet.artifact.archiveContentsBound, false)
})

test('rejects production-signing or stable-update claims', () => {
  const valid = sampleShopAndroidQaHandoffInput().metadata.signing
  for (const signing of [
    { ...valid, class: 'production' },
    { ...valid, productionSigned: true },
    { ...valid, stableUpdateIdentityProven: true },
  ]) {
    const packet = assessShopAndroidQaHandoff(sampleShopAndroidQaHandoffInput({ metadata: { signing } }))
    assert.ok(packet.failures.includes('android_qa_signing_classification_invalid'))
  }
})

test('rejects expired evidence and premature acceptance claims', () => {
  const expired = assessShopAndroidQaHandoff(sampleShopAndroidQaHandoffInput({ metadata: { expiresAt: '2026-10-25T00:00:00.000Z' } }))
  assert.ok(expired.failures.includes('artifact_expired'))
  const claims = { ...sampleShopAndroidQaHandoffInput().metadata.claims, installedAcceptanceProven: true }
  const premature = assessShopAndroidQaHandoff(sampleShopAndroidQaHandoffInput({ metadata: { claims } }))
  assert.ok(premature.failures.includes('premature_claim:installedAcceptanceProven'))
})

test('packet validation rejects post-hoc claim-boundary changes', () => {
  const packet = assessShopAndroidQaHandoff(sampleShopAndroidQaHandoffInput())
  assert.throws(
    () => validateShopAndroidQaHandoff({ ...packet, claimBoundary: { ...packet.claimBoundary, backupRestoreAcceptanceProven: true } }),
    /shop_android_qa_handoff_digest_invalid/,
  )
})

test('packet validation independently rejects expired or malformed provenance', () => {
  const packet = assessShopAndroidQaHandoff(sampleShopAndroidQaHandoffInput())
  const expired = resign({
    ...packet,
    artifact: { ...packet.artifact, expiresAt: '2000-01-01T00:00:00.000Z' },
  })
  assert.throws(
    () => validateShopAndroidQaHandoff(expired, { nowMillis: Date.parse('2026-10-26T00:00:00Z') }),
    /shop_android_qa_handoff_provenance_invalid/,
  )
  const missingRun = resign({
    ...packet,
    artifact: { ...packet.artifact, runId: '' },
  })
  assert.throws(
    () => validateShopAndroidQaHandoff(missingRun, { nowMillis: Date.parse('2026-10-26T00:00:00Z') }),
    /shop_android_qa_handoff_provenance_invalid/,
  )
})

test('packet validation independently rejects side effects and incomplete run plans', () => {
  const packet = assessShopAndroidQaHandoff(sampleShopAndroidQaHandoffInput())
  const sideEffect = resign({
    ...packet,
    claimBoundary: { ...packet.claimBoundary, externalWritesPerformed: true },
  })
  assert.throws(
    () => validateShopAndroidQaHandoff(sideEffect),
    /shop_android_qa_handoff_claim_boundary_invalid/,
  )
  const incomplete = resign({ ...packet, runPlan: packet.runPlan.slice(1) })
  assert.throws(
    () => validateShopAndroidQaHandoff(incomplete),
    /shop_android_qa_handoff_run_plan_invalid/,
  )
  const unsafeInstruction = resign({
    ...packet,
    runPlan: packet.runPlan.map((step, index) => index === 0
      ? { ...step, instruction: 'Use the production phone.' }
      : step),
  })
  assert.throws(
    () => validateShopAndroidQaHandoff(unsafeInstruction),
    /shop_android_qa_handoff_run_plan_invalid/,
  )
})
