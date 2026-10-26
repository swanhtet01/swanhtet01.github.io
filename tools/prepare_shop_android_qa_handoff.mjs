#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateRawSync } from 'node:zlib'

export const SHOP_ANDROID_QA_HANDOFF_CONTRACT =
  'supermega.shop.android-qa-internal-handoff.v1'

const EXPECTED_APPLICATION_ID = 'dev.supermega.supermega_shop.qa'
const EXPECTED_APPLICATION_LABEL = 'Shop QA'
const EXPECTED_APK_NAME = 'app-qa-debug.apk'
const EXPECTED_ARCHIVE_FILES = [
  EXPECTED_APK_NAME,
  `${EXPECTED_APK_NAME}.sha256`,
  `${EXPECTED_APK_NAME}.manifest`,
]
const SHA40 = /^[0-9a-f]{40}$/
const SHA64 = /^[0-9a-f]{64}$/
const DECIMAL_ID = /^[1-9][0-9]*$/
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024
const MAX_TOTAL_UNCOMPRESSED_BYTES = 512 * 1024 * 1024
const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0)
  }
  return value >>> 0
})

const REQUIRED_BLOCKED_CAPABILITIES = [
  'cross_build_update',
  'encrypted_backup_restore',
  'external_file_export',
  'camera_or_gallery',
  'physical_scanner_or_printer',
  'managed_auth_or_provider_access',
  'correction_authorization',
  'production_or_merchant_use',
]

const RUN_STEPS = [
  ['clean_target', 'Use a separately approved disposable Android device or emulator containing no SuperMega Shop data.'],
  ['production_sentinel_before', 'Record installed package IDs and a production-data sentinel before installing; do not open or modify production Shop.'],
  ['install_qa', 'Install the verified debug-signed Shop QA APK and confirm the visible Shop QA label and QA application ID.'],
  ['fictional_setup', 'Create only a fictional shop and synthetic products.'],
  ['cash_sale', 'Complete one fictional cash sale, record tender and change, and verify the saved sale and stock movement.'],
  ['receipt_reprint', 'Open the saved receipt and reprint through the simulated/available QA path without creating another sale, payment, or stock movement.'],
  ['shift_close', 'Close the synthetic shift and record the expected totals.'],
  ['restart_reopen', 'Terminate and reopen the app, then verify the same sale, stock, receipt, and shift-close state.'],
  ['uninstall_qa', 'Uninstall the QA application and record removal of the QA package only.'],
  ['production_sentinel_after', 'Verify the production package inventory and production-data sentinel remain unchanged.'],
]

const REQUIRED_EVIDENCE_FIELDS = [
  'device_or_emulator_id',
  'android_version',
  'disposable_target_basis',
  'package_inventory_before',
  'package_inventory_after',
  'production_sentinel_before',
  'production_sentinel_after',
  'artifact_archive_sha256',
  'apk_sha256',
  'source_sha',
  'merge_sha',
  'native_tree',
  'run_id',
  'artifact_id',
  'application_id_observed',
  'application_label_observed',
  'install_result',
  'sale_id_and_total',
  'stock_before_and_after',
  'receipt_id_and_reprint_result',
  'shift_close_totals',
  'restart_result',
  'uninstall_result',
  'unexpected_errors',
  'recorded_at',
]

const EXPECTED_CLAIM_BOUNDARY = {
  internalSyntheticQaOnly: true,
  disposableTargetRequired: true,
  installedAcceptanceProven: false,
  updateAcceptanceProven: false,
  backupRestoreAcceptanceProven: false,
  hardwareAcceptanceProven: false,
  merchantAcceptanceProven: false,
  productionReady: false,
  productionSigned: false,
  externalWritesPerformed: false,
  providerAccessPerformed: false,
  databaseExecutionPerformed: false,
  deploymentPerformed: false,
  credentialValuesInspected: false,
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff]
  }
  return (crc ^ 0xffffffff) >>> 0
}

function packetDigest(value) {
  return `sha256:${sha256(Buffer.from(JSON.stringify(value), 'utf8'))}`
}

function addFailure(failures, code) {
  if (!failures.includes(code)) failures.push(code)
}

function canonicalText(value) {
  return String(value || '').replace(/\r\n?/g, '\n').trim()
}

function parseIsoMillis(value) {
  const millis = Date.parse(String(value || ''))
  return Number.isFinite(millis) ? millis : null
}

function expectedArtifactUrl(runId, artifactId) {
  return `https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/${runId}/artifacts/${artifactId}`
}

function readZipEntries(archiveBytes) {
  const bytes = Buffer.from(archiveBytes || Buffer.alloc(0))
  if (!bytes.length || bytes.length > MAX_ARCHIVE_BYTES) throw new Error('zip_size_invalid')
  let eocd = -1
  for (let offset = bytes.length - 22;
    offset >= Math.max(0, bytes.length - 65_557);
    offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset
      break
    }
  }
  if (eocd < 0) throw new Error('zip_eocd_missing')
  const disk = bytes.readUInt16LE(eocd + 4)
  const centralDisk = bytes.readUInt16LE(eocd + 6)
  const diskEntries = bytes.readUInt16LE(eocd + 8)
  const totalEntries = bytes.readUInt16LE(eocd + 10)
  const centralSize = bytes.readUInt32LE(eocd + 12)
  const centralOffset = bytes.readUInt32LE(eocd + 16)
  const commentLength = bytes.readUInt16LE(eocd + 20)
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== totalEntries
    || totalEntries === 0xffff || centralSize === 0xffffffff
    || centralOffset === 0xffffffff || centralOffset + centralSize !== eocd
    || eocd + 22 + commentLength !== bytes.length) {
    throw new Error('zip_layout_unsupported')
  }
  const entries = new Map()
  let cursor = centralOffset
  let totalUncompressed = 0
  for (let index = 0; index < totalEntries; index += 1) {
    if (cursor + 46 > bytes.length || bytes.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error('zip_central_header_invalid')
    }
    const flags = bytes.readUInt16LE(cursor + 8)
    const method = bytes.readUInt16LE(cursor + 10)
    const expectedCrc32 = bytes.readUInt32LE(cursor + 16)
    const compressedSize = bytes.readUInt32LE(cursor + 20)
    const uncompressedSize = bytes.readUInt32LE(cursor + 24)
    const nameLength = bytes.readUInt16LE(cursor + 28)
    const extraLength = bytes.readUInt16LE(cursor + 30)
    const commentLength = bytes.readUInt16LE(cursor + 32)
    const localOffset = bytes.readUInt32LE(cursor + 42)
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8')
    cursor += 46 + nameLength + extraLength + commentLength
    if ((flags & 1) !== 0 || ![0, 8].includes(method)
      || !name || name.includes('/') || name.includes('\\') || name.includes('\0')
      || entries.has(name)) {
      throw new Error('zip_entry_unsafe')
    }
    if (localOffset + 30 > bytes.length || bytes.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error('zip_local_header_invalid')
    }
    const localFlags = bytes.readUInt16LE(localOffset + 6)
    const localMethod = bytes.readUInt16LE(localOffset + 8)
    const localCrc32 = bytes.readUInt32LE(localOffset + 14)
    const localCompressedSize = bytes.readUInt32LE(localOffset + 18)
    const localUncompressedSize = bytes.readUInt32LE(localOffset + 22)
    const localNameLength = bytes.readUInt16LE(localOffset + 26)
    const localExtraLength = bytes.readUInt16LE(localOffset + 28)
    const localName = bytes
      .subarray(localOffset + 30, localOffset + 30 + localNameLength)
      .toString('utf8')
    if (localFlags !== flags || localMethod !== method || localName !== name) {
      throw new Error('zip_local_central_mismatch')
    }
    if ((flags & 8) === 0
      && (localCrc32 !== expectedCrc32
        || localCompressedSize !== compressedSize
        || localUncompressedSize !== uncompressedSize)) {
      throw new Error('zip_local_sizes_mismatch')
    }
    const entryLimit = name === EXPECTED_APK_NAME ? 256 * 1024 * 1024 : 64 * 1024
    totalUncompressed += uncompressedSize
    if (uncompressedSize > entryLimit || totalUncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new Error('zip_uncompressed_size_invalid')
    }
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const dataEnd = dataStart + compressedSize
    if (dataEnd > bytes.length) throw new Error('zip_entry_truncated')
    const compressed = bytes.subarray(dataStart, dataEnd)
    const content = method === 0
      ? Buffer.from(compressed)
      : inflateRawSync(compressed, { maxOutputLength: entryLimit + 1 })
    if (content.length !== uncompressedSize) throw new Error('zip_entry_size_mismatch')
    if (crc32(content) !== expectedCrc32) throw new Error('zip_entry_crc_mismatch')
    entries.set(name, content)
  }
  if (cursor !== centralOffset + centralSize) throw new Error('zip_central_size_mismatch')
  return entries
}

function storedZipFixture(entries) {
  const locals = []
  const centrals = []
  let localOffset = 0
  for (const [name, value] of entries) {
    const nameBytes = Buffer.from(name, 'utf8')
    const content = Buffer.from(value)
    const contentCrc32 = crc32(content)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(contentCrc32, 14)
    local.writeUInt32LE(content.length, 18)
    local.writeUInt32LE(content.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    locals.push(local, nameBytes, content)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt32LE(contentCrc32, 16)
    central.writeUInt32LE(content.length, 20)
    central.writeUInt32LE(content.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE(localOffset, 42)
    centrals.push(central, nameBytes)
    localOffset += local.length + nameBytes.length + content.length
  }
  const centralBytes = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralBytes.length, 12)
  eocd.writeUInt32LE(localOffset, 16)
  return Buffer.concat([...locals, centralBytes, eocd])
}

export function assessShopAndroidQaHandoff(input = {}) {
  const failures = []
  const metadata = input.metadata || {}
  const expectations = input.expectations || {}
  const headSha = String(metadata.headSha || '')
  const sourceSha = String(metadata.sourceSha || '')
  const mergeSha = String(metadata.mergeSha || '')
  const nativeTree = String(metadata.nativeTree || '')
  const runId = String(metadata.runId || '')
  const artifactId = String(metadata.artifactId || '')
  const artifactUrl = String(metadata.artifactUrl || '')
  const archiveSha256 = sha256(input.archiveBytes || Buffer.alloc(0))
  const apkSha256 = sha256(input.apkBytes || Buffer.alloc(0))
  const checksumText = canonicalText(input.checksumText)
  const manifestText = canonicalText(input.manifestText)
  const generatedAt = input.generatedAt || new Date().toISOString()
  const generatedAtMillis = parseIsoMillis(generatedAt)
  const expiresAtMillis = parseIsoMillis(metadata.expiresAt)
  const identity = metadata.identityInspection || {}
  const signing = metadata.signing || {}
  const claims = metadata.claims || {}

  if (String(expectations.headSha || '') !== headSha
    || String(expectations.runId || '') !== runId
    || String(expectations.artifactId || '') !== artifactId
    || String(expectations.archiveSha256 || '') !== String(metadata.archiveSha256 || '')) {
    addFailure(failures, 'release_expectation_mismatch')
  }

  if (!SHA40.test(headSha)) addFailure(failures, 'head_sha_invalid')
  if (!SHA40.test(sourceSha)) addFailure(failures, 'source_sha_invalid')
  if (!SHA40.test(mergeSha)) addFailure(failures, 'merge_sha_invalid')
  if (sourceSha !== mergeSha) addFailure(failures, 'artifact_source_merge_mismatch')
  if (!SHA40.test(nativeTree)) addFailure(failures, 'native_tree_invalid')
  if (!DECIMAL_ID.test(runId)) addFailure(failures, 'run_id_invalid')
  if (!DECIMAL_ID.test(artifactId)) addFailure(failures, 'artifact_id_invalid')
  if (artifactUrl !== expectedArtifactUrl(runId, artifactId)) {
    addFailure(failures, 'artifact_url_invalid')
  }
  if (!SHA64.test(String(metadata.archiveSha256 || ''))
    || metadata.archiveSha256 !== archiveSha256) {
    addFailure(failures, 'artifact_archive_sha256_mismatch')
  }
  try {
    const entries = readZipEntries(input.archiveBytes)
    if (entries.size !== EXPECTED_ARCHIVE_FILES.length
      || EXPECTED_ARCHIVE_FILES.some((name) => !entries.has(name))) {
      addFailure(failures, 'artifact_archive_contents_invalid')
    } else if (!entries.get(EXPECTED_APK_NAME).equals(Buffer.from(input.apkBytes || Buffer.alloc(0)))
      || !entries.get(`${EXPECTED_APK_NAME}.sha256`).equals(Buffer.from(String(input.checksumText || ''), 'utf8'))
      || !entries.get(`${EXPECTED_APK_NAME}.manifest`).equals(Buffer.from(String(input.manifestText || ''), 'utf8'))) {
      addFailure(failures, 'artifact_archive_extraction_mismatch')
    }
  } catch {
    addFailure(failures, 'artifact_archive_format_invalid')
  }
  if (!input.apkBytes?.length) addFailure(failures, 'apk_missing')
  if (checksumText !== `${apkSha256}  ${EXPECTED_APK_NAME}`) {
    addFailure(failures, 'apk_checksum_file_mismatch')
  }
  if (manifestText !== `source-sha=${sourceSha} sha-256=${checksumText} promotion-ineligible`) {
    addFailure(failures, 'artifact_manifest_mismatch')
  }
  if (identity.status !== 'passed'
    || identity.tool !== 'apkanalyzer'
    || String(identity.runId || '') !== runId
    || String(identity.sourceSha || '') !== sourceSha
    || identity.jobName !== 'Build isolated Android synthetic QA app'
    || identity.applicationId !== EXPECTED_APPLICATION_ID
    || identity.applicationLabel !== EXPECTED_APPLICATION_LABEL) {
    addFailure(failures, 'android_qa_identity_evidence_invalid')
  }
  if (signing.class !== 'android_debug'
    || signing.productionSigned !== false
    || signing.stableUpdateIdentityProven !== false) {
    addFailure(failures, 'android_qa_signing_classification_invalid')
  }
  if (generatedAtMillis == null || expiresAtMillis == null) {
    addFailure(failures, 'artifact_expiry_invalid')
  } else if (expiresAtMillis <= generatedAtMillis) {
    addFailure(failures, 'artifact_expired')
  }
  for (const key of [
    'installedAcceptanceProven',
    'updateAcceptanceProven',
    'backupRestoreAcceptanceProven',
    'hardwareAcceptanceProven',
    'merchantAcceptanceProven',
    'productionReady',
  ]) {
    if (claims[key] !== false) addFailure(failures, `premature_claim:${key}`)
  }

  const body = {
    contract: SHOP_ANDROID_QA_HANDOFF_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt,
    status: failures.length ? 'blocked' : 'ready_for_internal_install_run',
    ok: failures.length === 0,
    failures,
    artifact: {
      repository: 'swanhtet01/swanhtet01.github.io',
      runId,
      artifactId,
      artifactUrl,
      headSha,
      sourceSha,
      mergeSha,
      nativeTree,
      expiresAt: metadata.expiresAt || null,
      archiveSha256,
      archiveContentsBound: !failures.some((failure) => failure.startsWith('artifact_archive_')),
      apkName: EXPECTED_APK_NAME,
      apkSha256,
      applicationId: identity.applicationId || null,
      applicationLabel: identity.applicationLabel || null,
      identityInspection: identity.status === 'passed'
        ? 'reported_producer_ci_passed_not_reinspected'
        : 'unverified',
      signingClass: signing.class || null,
      productionSigned: false,
      promotionEligible: false,
    },
    releaseExpectation: {
      headSha: String(expectations.headSha || ''),
      runId: String(expectations.runId || ''),
      artifactId: String(expectations.artifactId || ''),
      archiveSha256: String(expectations.archiveSha256 || ''),
    },
    runPlan: RUN_STEPS.map(([id, instruction]) => ({ id, instruction, required: true })),
    requiredEvidenceFields: REQUIRED_EVIDENCE_FIELDS,
    blockedCapabilities: REQUIRED_BLOCKED_CAPABILITIES.map((id) => ({ id, status: 'BLOCKED' })),
    claimBoundary: { ...EXPECTED_CLAIM_BOUNDARY },
  }
  return { ...body, digest: packetDigest(body) }
}

export function validateShopAndroidQaHandoff(packet, { nowMillis = Date.now() } = {}) {
  const body = { ...packet }
  const digest = body.digest
  delete body.digest
  if (digest !== packetDigest(body)) throw new Error('shop_android_qa_handoff_digest_invalid')
  if (packet.contract !== SHOP_ANDROID_QA_HANDOFF_CONTRACT) {
    throw new Error('shop_android_qa_handoff_contract_invalid')
  }
  if (packet.ok !== true || packet.status !== 'ready_for_internal_install_run') {
    throw new Error('shop_android_qa_handoff_not_ready')
  }
  const artifact = packet.artifact || {}
  const expectation = packet.releaseExpectation || {}
  const generatedAtMillis = parseIsoMillis(packet.generatedAt)
  const expiresAtMillis = parseIsoMillis(artifact.expiresAt)
  if (packet.digestScope !== 'utf8_compact_json_without_digest'
    || !Array.isArray(packet.failures) || packet.failures.length !== 0
    || artifact.repository !== 'swanhtet01/swanhtet01.github.io'
    || !SHA40.test(String(artifact.headSha || ''))
    || !SHA40.test(String(artifact.sourceSha || ''))
    || !SHA40.test(String(artifact.mergeSha || ''))
    || artifact.sourceSha !== artifact.mergeSha
    || !SHA40.test(String(artifact.nativeTree || ''))
    || !DECIMAL_ID.test(String(artifact.runId || ''))
    || !DECIMAL_ID.test(String(artifact.artifactId || ''))
    || artifact.artifactUrl !== expectedArtifactUrl(artifact.runId, artifact.artifactId)
    || !SHA64.test(String(artifact.archiveSha256 || ''))
    || !SHA64.test(String(artifact.apkSha256 || ''))
    || artifact.archiveContentsBound !== true
    || expectation.headSha !== artifact.headSha
    || expectation.runId !== artifact.runId
    || expectation.artifactId !== artifact.artifactId
    || expectation.archiveSha256 !== artifact.archiveSha256
    || generatedAtMillis == null || expiresAtMillis == null
    || expiresAtMillis <= generatedAtMillis || expiresAtMillis <= nowMillis) {
    throw new Error('shop_android_qa_handoff_provenance_invalid')
  }
  if (artifact.applicationId !== EXPECTED_APPLICATION_ID
    || packet.artifact?.applicationLabel !== EXPECTED_APPLICATION_LABEL
    || artifact.identityInspection !== 'reported_producer_ci_passed_not_reinspected'
    || artifact.signingClass !== 'android_debug'
    || packet.artifact?.productionSigned !== false
    || packet.artifact?.promotionEligible !== false) {
    throw new Error('shop_android_qa_handoff_artifact_identity_invalid')
  }
  if (!Array.isArray(packet.runPlan)
    || packet.runPlan.length !== RUN_STEPS.length
    || packet.runPlan.some((step, index) => step?.id !== RUN_STEPS[index][0]
      || step.instruction !== RUN_STEPS[index][1] || step.required !== true)) {
    throw new Error('shop_android_qa_handoff_run_plan_invalid')
  }
  if (!Array.isArray(packet.requiredEvidenceFields)
    || packet.requiredEvidenceFields.length !== REQUIRED_EVIDENCE_FIELDS.length
    || REQUIRED_EVIDENCE_FIELDS.some((field, index) => packet.requiredEvidenceFields[index] !== field)) {
    throw new Error('shop_android_qa_handoff_evidence_fields_invalid')
  }
  if (!Array.isArray(packet.blockedCapabilities)
    || packet.blockedCapabilities.length !== REQUIRED_BLOCKED_CAPABILITIES.length
    || packet.blockedCapabilities.some((entry, index) =>
      entry?.id !== REQUIRED_BLOCKED_CAPABILITIES[index] || entry.status !== 'BLOCKED')) {
    throw new Error('shop_android_qa_handoff_blocked_capabilities_invalid')
  }
  if (JSON.stringify(packet.claimBoundary) !== JSON.stringify(EXPECTED_CLAIM_BOUNDARY)) {
    throw new Error('shop_android_qa_handoff_claim_boundary_invalid')
  }
  return packet
}

export function sampleShopAndroidQaHandoffInput(overrides = {}) {
  const headSha = '6bf59b49c6607f411953a19aa90d64ca89eb522e'
  const sourceSha = '0a7fb8e4c01741a1195b6f2a586d43a1f0e3af6a'
  const runId = '40221959431'
  const artifactId = '12609717130'
  const apkBytes = Buffer.from('synthetic android qa apk fixture')
  const apkHash = sha256(apkBytes)
  const checksumText = `${apkHash}  ${EXPECTED_APK_NAME}\n`
  const manifestText = `source-sha=${sourceSha} sha-256=${apkHash}  ${EXPECTED_APK_NAME} promotion-ineligible\n`
  const archiveBytes = storedZipFixture([
    [EXPECTED_APK_NAME, apkBytes],
    [`${EXPECTED_APK_NAME}.sha256`, Buffer.from(checksumText)],
    [`${EXPECTED_APK_NAME}.manifest`, Buffer.from(manifestText)],
  ])
  const metadata = {
    headSha,
    sourceSha,
    mergeSha: sourceSha,
    nativeTree: '3cbfc2038bef56d889fa0ccdef1d266783e0fcb8',
    runId,
    artifactId,
    artifactUrl: expectedArtifactUrl(runId, artifactId),
    archiveSha256: sha256(archiveBytes),
    expiresAt: '2099-11-01T00:00:00.000Z',
    identityInspection: {
      status: 'passed',
      tool: 'apkanalyzer',
      runId,
      sourceSha,
      jobName: 'Build isolated Android synthetic QA app',
      applicationId: EXPECTED_APPLICATION_ID,
      applicationLabel: EXPECTED_APPLICATION_LABEL,
    },
    signing: {
      class: 'android_debug',
      productionSigned: false,
      stableUpdateIdentityProven: false,
    },
    claims: {
      installedAcceptanceProven: false,
      updateAcceptanceProven: false,
      backupRestoreAcceptanceProven: false,
      hardwareAcceptanceProven: false,
      merchantAcceptanceProven: false,
      productionReady: false,
    },
  }
  const base = {
    metadata,
    expectations: {
      headSha,
      runId,
      artifactId,
      archiveSha256: metadata.archiveSha256,
    },
    archiveBytes,
    apkBytes,
    checksumText,
    manifestText,
    generatedAt: '2026-10-26T00:00:00.000Z',
  }
  return { ...base, ...overrides, metadata: { ...metadata, ...(overrides.metadata || {}) } }
}

function renderMarkdown(packet) {
  return `${[
    '# SuperMega Shop — internal Android QA handoff',
    '',
    `Generated: ${packet.generatedAt}`,
    `Status: ${packet.status}`,
    `Packet digest: ${packet.digest}`,
    `PR head: ${packet.artifact.headSha}`,
    `Artifact source: ${packet.artifact.sourceSha}`,
    `Merge: ${packet.artifact.mergeSha}`,
    `Native tree: ${packet.artifact.nativeTree}`,
    `Artifact: ${packet.artifact.artifactId}`,
    `Archive SHA-256: ${packet.artifact.archiveSha256}`,
    `APK SHA-256: ${packet.artifact.apkSha256}`,
    '',
    'This packet prepares an internal synthetic-QA run. It is not evidence that installation, update, backup/restore, hardware, merchant acceptance, or production release passed.',
    '',
    '## Run only on an approved disposable target',
    '',
    ...packet.runPlan.map((step) => `- [ ] ${step.id}: ${step.instruction}`),
    '',
    '## Required private evidence',
    '',
    ...packet.requiredEvidenceFields.map((field) => `- ${field}`),
    '',
    '## Blocked capabilities',
    '',
    ...packet.blockedCapabilities.map((entry) => `- ${entry.id}: ${entry.status}`),
    '',
  ].join('\n')}\n`
}

async function writeExclusive(path, content) {
  const absolute = resolve(path)
  await mkdir(dirname(absolute), { recursive: true })
  await writeFile(absolute, content, { encoding: 'utf8', flag: 'wx' })
  return absolute
}

function parseArgs(argv) {
  const args = {
    metadata: null,
    archive: null,
    apk: null,
    checksum: null,
    manifest: null,
    expectedHeadSha: null,
    expectedRunId: null,
    expectedArtifactId: null,
    expectedArchiveSha256: null,
    output: null,
    markdownOutput: null,
    verify: null,
    selfTest: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--metadata') args.metadata = argv[++index]
    else if (arg === '--archive') args.archive = argv[++index]
    else if (arg === '--apk') args.apk = argv[++index]
    else if (arg === '--checksum') args.checksum = argv[++index]
    else if (arg === '--manifest') args.manifest = argv[++index]
    else if (arg === '--expected-head-sha') args.expectedHeadSha = argv[++index]
    else if (arg === '--expected-run-id') args.expectedRunId = argv[++index]
    else if (arg === '--expected-artifact-id') args.expectedArtifactId = argv[++index]
    else if (arg === '--expected-archive-sha256') args.expectedArchiveSha256 = argv[++index]
    else if (arg === '--output') args.output = argv[++index]
    else if (arg === '--markdown-output') args.markdownOutput = argv[++index]
    else if (arg === '--verify') args.verify = argv[++index]
    else if (arg === '--self-test') args.selfTest = true
    else throw new Error(`shop_android_qa_handoff_unknown_arg:${arg}`)
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.selfTest) {
    validateShopAndroidQaHandoff(assessShopAndroidQaHandoff(sampleShopAndroidQaHandoffInput()))
    console.log(JSON.stringify({ ok: true, contract: `${SHOP_ANDROID_QA_HANDOFF_CONTRACT}.self-test`, externalWritesPerformed: false }))
    return
  }
  if (args.verify) {
    const packet = validateShopAndroidQaHandoff(JSON.parse(await readFile(resolve(args.verify), 'utf8')))
    console.log(JSON.stringify({ ok: true, contract: packet.contract, digest: packet.digest, status: packet.status }, null, 2))
    return
  }
  for (const [name, value] of Object.entries({
    metadata: args.metadata,
    archive: args.archive,
    apk: args.apk,
    checksum: args.checksum,
    manifest: args.manifest,
    expectedHeadSha: args.expectedHeadSha,
    expectedRunId: args.expectedRunId,
    expectedArtifactId: args.expectedArtifactId,
    expectedArchiveSha256: args.expectedArchiveSha256,
  })) {
    if (!value) throw new Error(`shop_android_qa_handoff_required_arg_missing:${name}`)
  }
  const packet = assessShopAndroidQaHandoff({
    metadata: JSON.parse(await readFile(resolve(args.metadata), 'utf8')),
    expectations: {
      headSha: args.expectedHeadSha,
      runId: args.expectedRunId,
      artifactId: args.expectedArtifactId,
      archiveSha256: args.expectedArchiveSha256,
    },
    archiveBytes: await readFile(resolve(args.archive)),
    apkBytes: await readFile(resolve(args.apk)),
    checksumText: await readFile(resolve(args.checksum), 'utf8'),
    manifestText: await readFile(resolve(args.manifest), 'utf8'),
  })
  if (!packet.ok) {
    console.log(JSON.stringify(packet, null, 2))
    process.exitCode = 1
    return
  }
  if (args.output) await writeExclusive(args.output, `${JSON.stringify(packet, null, 2)}\n`)
  if (args.markdownOutput) await writeExclusive(args.markdownOutput, renderMarkdown(packet))
  console.log(JSON.stringify({ ok: true, contract: packet.contract, digest: packet.digest, status: packet.status, output: args.output ? resolve(args.output) : null, markdownOutput: args.markdownOutput ? resolve(args.markdownOutput) : null, externalWritesPerformed: false }, null, 2))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
