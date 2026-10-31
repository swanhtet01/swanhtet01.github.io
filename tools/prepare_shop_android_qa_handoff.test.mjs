import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import {
  SHOP_ANDROID_QA_CAPABILITIES,
  SHOP_ANDROID_QA_CAPABILITY_CONTRACT,
  SHOP_ANDROID_QA_CAPABILITY_HANDOFF_CONTRACT,
  SHOP_ANDROID_QA_EVIDENCE_CONTRACT,
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

function archiveWithRebasedInsertion(archive, insertionOffset, inserted) {
  const original = Buffer.from(archive)
  const oldEocd = original.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const oldCentralOffset = original.readUInt32LE(oldEocd + 16)
  const added = Buffer.from(inserted)
  const next = Buffer.concat([
    original.subarray(0, insertionOffset),
    added,
    original.subarray(insertionOffset),
  ])
  const nextCentralOffset = oldCentralOffset + added.length
  const nextEocd = oldEocd + added.length
  next.writeUInt32LE(nextCentralOffset, nextEocd + 16)
  let cursor = nextCentralOffset
  const totalEntries = next.readUInt16LE(nextEocd + 10)
  for (let index = 0; index < totalEntries; index += 1) {
    assert.equal(next.readUInt32LE(cursor), 0x02014b50)
    const localOffset = next.readUInt32LE(cursor + 42)
    if (localOffset >= insertionOffset) next.writeUInt32LE(localOffset + added.length, cursor + 42)
    cursor += 46 + next.readUInt16LE(cursor + 28)
      + next.readUInt16LE(cursor + 30) + next.readUInt16LE(cursor + 32)
  }
  return next
}

function inputWithArchive(input, archiveBytes) {
  const archiveSha256 = createHash('sha256').update(archiveBytes).digest('hex')
  return {
    ...input,
    archiveBytes,
    metadata: { ...input.metadata, archiveSha256 },
    expectations: { ...input.expectations, archiveSha256 },
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
  assert.deepEqual(packet.artifactCapabilities, [])
  assert.equal(packet.artifact.capabilityInspection, 'unavailable')
  assert.ok(packet.blockedCapabilities.some((entry) => entry.id === 'encrypted_backup_restore'))
  assert.equal(validateShopAndroidQaHandoff(packet), packet)
})

test('v2 binds scoped recovery capabilities without claiming installed acceptance', () => {
  const packet = assessShopAndroidQaHandoff(
    sampleShopAndroidQaHandoffInput({ capabilityAware: true }),
  )
  assert.equal(packet.contract, SHOP_ANDROID_QA_CAPABILITY_HANDOFF_CONTRACT)
  assert.equal(packet.artifact.capabilityInspection, 'reported_producer_ci_passed_not_reinspected')
  assert.equal(packet.artifact.capabilityContract, SHOP_ANDROID_QA_CAPABILITY_CONTRACT)
  assert.equal(packet.artifact.evidenceContract, SHOP_ANDROID_QA_EVIDENCE_CONTRACT)
  assert.deepEqual(packet.artifact.capabilities, SHOP_ANDROID_QA_CAPABILITIES)
  assert.equal(packet.artifact.scopedEncryptedRestore, true)
  assert.equal(packet.artifact.scopedSyntheticExport, true)
  assert.equal(packet.artifact.generalExternalFileAccess, false)
  assert.deepEqual(
    packet.artifactCapabilities.map((entry) => entry.id),
    SHOP_ANDROID_QA_CAPABILITIES,
  )
  assert.equal(packet.claimBoundary.backupRestoreAcceptanceProven, false)
  assert.ok(packet.blockedCapabilities.some((entry) =>
    entry.id === 'installed_backup_restore_acceptance'))
  assert.ok(packet.blockedCapabilities.some((entry) =>
    entry.id === 'general_external_file_export'))
  assert.equal(validateShopAndroidQaHandoff(packet), packet)
})

test('old v1 artifact cannot be relabelled as recovery-capable', () => {
  const capabilityInspection = sampleShopAndroidQaHandoffInput({
    capabilityAware: true,
  }).metadata.capabilityInspection
  const reassessed = assessShopAndroidQaHandoff(sampleShopAndroidQaHandoffInput({
    metadata: { capabilityInspection },
  }))
  assert.equal(reassessed.contract, SHOP_ANDROID_QA_CAPABILITY_HANDOFF_CONTRACT)
  assert.ok(reassessed.failures.includes('artifact_manifest_mismatch'))

  const legacy = assessShopAndroidQaHandoff(sampleShopAndroidQaHandoffInput())
  const relabelled = resign({
    ...legacy,
    contract: SHOP_ANDROID_QA_CAPABILITY_HANDOFF_CONTRACT,
    artifact: {
      ...legacy.artifact,
      capabilityInspection: 'reported_producer_ci_passed_not_reinspected',
    },
    artifactCapabilities: SHOP_ANDROID_QA_CAPABILITIES.map((id) => ({
      id,
      contract: SHOP_ANDROID_QA_CAPABILITY_CONTRACT,
      status: 'SOURCE_BOUND_NOT_INSTALLED_ACCEPTED',
    })),
  })
  assert.throws(
    () => validateShopAndroidQaHandoff(relabelled),
    /shop_android_qa_handoff_capability_identity_invalid/,
  )
})

test('v1 rejects every post-hoc legacy capability claim with a recomputed digest', () => {
  const legacy = assessShopAndroidQaHandoff(sampleShopAndroidQaHandoffInput())
  const artifactMutations = [
    { capabilityInspection: 'reported_producer_ci_passed_not_reinspected' },
    { capabilityContract: SHOP_ANDROID_QA_CAPABILITY_CONTRACT },
    { evidenceContract: SHOP_ANDROID_QA_EVIDENCE_CONTRACT },
    { capabilities: ['scoped_encrypted_backup_restore'] },
    { scopedEncryptedRestore: true },
    { scopedSyntheticExport: true },
    { generalExternalFileAccess: true },
  ]
  for (const mutation of artifactMutations) {
    const packet = resign({
      ...legacy,
      artifact: { ...legacy.artifact, ...mutation },
    })
    assert.throws(
      () => validateShopAndroidQaHandoff(packet),
      /shop_android_qa_handoff_legacy_capability_claim_invalid/,
      JSON.stringify(mutation),
    )
  }
  const packet = resign({
    ...legacy,
    artifactCapabilities: [{
      id: 'scoped_encrypted_backup_restore',
      contract: SHOP_ANDROID_QA_CAPABILITY_CONTRACT,
      status: 'SOURCE_BOUND_NOT_INSTALLED_ACCEPTED',
    }],
  })
  assert.throws(
    () => validateShopAndroidQaHandoff(packet),
    /shop_android_qa_handoff_legacy_capability_claim_invalid/,
  )
})

test('v2 rejects missing, unsupported, or unsafe compiled capability evidence', () => {
  const valid = sampleShopAndroidQaHandoffInput({ capabilityAware: true })
    .metadata.capabilityInspection
  for (const capabilityInspection of [
    { ...valid, contract: 'supermega.shop.android-qa-capabilities.v999' },
    { ...valid, evidenceContract: 'supermega.shop.synthetic-qa-evidence.v999' },
    { ...valid, capabilities: [SHOP_ANDROID_QA_CAPABILITIES[0]] },
    { ...valid, capabilities: [...SHOP_ANDROID_QA_CAPABILITIES].reverse() },
    { ...valid, scopedEncryptedRestore: false },
    { ...valid, scopedSyntheticExport: false },
    { ...valid, generalExternalFileAccess: true },
    { ...valid, status: 'not_run' },
    { ...valid, runId: '999' },
    { ...valid, sourceSha: '1'.repeat(40) },
    { ...valid, jobName: 'Another job' },
    { ...valid, applicationId: 'dev.supermega.supermega_shop' },
  ]) {
    const packet = assessShopAndroidQaHandoff(sampleShopAndroidQaHandoffInput({
      capabilityAware: true,
      metadata: { capabilityInspection },
    }))
    assert.ok(packet.failures.includes('android_qa_capability_evidence_invalid'))
  }
})

test('v2 rejects missing or tampered capability sidecar metadata', () => {
  const input = sampleShopAndroidQaHandoffInput({ capabilityAware: true })
  for (const manifestText of [
    input.manifestText.replace(` qa-evidence-contract=${SHOP_ANDROID_QA_EVIDENCE_CONTRACT}`, ''),
    input.manifestText.replace('qa-scoped-encrypted-restore=true', 'qa-scoped-encrypted-restore=false'),
    input.manifestText.replace('qa-general-external-file-access=false', 'qa-general-external-file-access=true'),
  ]) {
    const packet = assessShopAndroidQaHandoff({ ...input, manifestText })
    assert.ok(packet.failures.includes('artifact_manifest_mismatch'))
    assert.ok(packet.failures.includes('artifact_archive_extraction_mismatch'))
  }
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

test('binds exact artifact source, merge, and native tree expectations', () => {
  for (const metadata of [
    { sourceSha: '1'.repeat(40) },
    { mergeSha: '2'.repeat(40) },
    { nativeTree: '3'.repeat(40) },
  ]) {
    const packet = assessShopAndroidQaHandoff(sampleShopAndroidQaHandoffInput({ metadata }))
    assert.ok(packet.failures.includes('release_expectation_mismatch'))
  }
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

test('rejects every unparsed prefix, local-entry gap, or local-region tail', () => {
  const input = sampleShopAndroidQaHandoffInput()
  const archive = Buffer.from(input.archiveBytes)
  const eocd = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const centralOffset = archive.readUInt32LE(eocd + 16)
  const firstCentral = centralOffset
  const secondCentral = firstCentral + 46 + archive.readUInt16LE(firstCentral + 28)
    + archive.readUInt16LE(firstCentral + 30) + archive.readUInt16LE(firstCentral + 32)
  const secondLocalOffset = archive.readUInt32LE(secondCentral + 42)
  for (const insertionOffset of [0, secondLocalOffset, centralOffset]) {
    const withGap = archiveWithRebasedInsertion(archive, insertionOffset, Buffer.from('HIDDEN'))
    const packet = assessShopAndroidQaHandoff(inputWithArchive(input, withGap))
    assert.ok(packet.failures.includes('artifact_archive_format_invalid'), String(insertionOffset))
    assert.equal(packet.artifact.archiveContentsBound, false)
  }
})

test('accepts exact signed data descriptors and rejects unaccounted descriptor bytes', () => {
  const input = sampleShopAndroidQaHandoffInput({ zipDataDescriptors: true })
  assert.equal(assessShopAndroidQaHandoff(input).ok, true)
  const archive = Buffer.from(input.archiveBytes)
  const eocd = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const centralOffset = archive.readUInt32LE(eocd + 16)
  const localOffset = archive.readUInt32LE(centralOffset + 42)
  const dataStart = localOffset + 30 + archive.readUInt16LE(localOffset + 26)
    + archive.readUInt16LE(localOffset + 28)
  const descriptorOffset = dataStart + archive.readUInt32LE(centralOffset + 20)
  assert.equal(archive.readUInt32LE(descriptorOffset), 0x08074b50)
  archive.writeUInt32LE(0, descriptorOffset)
  const packet = assessShopAndroidQaHandoff(inputWithArchive(input, archive))
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
