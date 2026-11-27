import { createHash } from 'node:crypto'

export const SHOP_ANDROID_QA_HANDOFF_CONTRACT =
  'supermega.shop.android-qa-internal-handoff.v1'
export const SHOP_ANDROID_QA_CAPABILITY_HANDOFF_CONTRACT =
  'supermega.shop.android-qa-internal-handoff.v2'
export const SHOP_ANDROID_QA_CANONICAL_HANDOFF_CONTRACT =
  'supermega.shop.android-qa-internal-handoff.v3'
export const SHOP_ANDROID_QA_CAPABILITY_CONTRACT =
  'supermega.shop.android-qa-capabilities.v1'
export const SHOP_ANDROID_QA_EVIDENCE_CONTRACT =
  'supermega.shop.synthetic-qa-evidence.v1'
export const SHOP_ANDROID_QA_CAPABILITIES = Object.freeze([
  'scoped_encrypted_backup_restore',
  'scoped_synthetic_evidence_export',
])

export const SHOP_ANDROID_QA_EXPECTED_APPLICATION_ID =
  'dev.supermega.supermega_shop.qa'
export const SHOP_ANDROID_QA_EXPECTED_APPLICATION_LABEL = 'Shop QA'

export const SHOP_ANDROID_QA_REQUIRED_BLOCKED_CAPABILITIES = Object.freeze([
  'cross_build_update',
  'encrypted_backup_restore',
  'external_file_export',
  'camera_or_gallery',
  'physical_scanner_or_printer',
  'managed_auth_or_provider_access',
  'correction_authorization',
  'production_or_merchant_use',
])

export const SHOP_ANDROID_QA_CAPABILITY_AWARE_BLOCKED_CAPABILITIES = Object.freeze([
  'cross_build_update',
  'installed_backup_restore_acceptance',
  'general_external_file_export',
  'camera_or_gallery',
  'physical_scanner_or_printer',
  'managed_auth_or_provider_access',
  'correction_authorization',
  'production_or_merchant_use',
])

export const SHOP_ANDROID_QA_DECLARED_CAPABILITIES = Object.freeze(
  SHOP_ANDROID_QA_CAPABILITIES.map((id) => Object.freeze({
    id,
    contract: SHOP_ANDROID_QA_CAPABILITY_CONTRACT,
    status: 'SOURCE_BOUND_NOT_INSTALLED_ACCEPTED',
  })),
)

export const SHOP_ANDROID_QA_RUN_STEPS = Object.freeze([
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
].map((step) => Object.freeze(step)))

export const SHOP_ANDROID_QA_REQUIRED_EVIDENCE_FIELDS = Object.freeze([
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
])

export const SHOP_ANDROID_QA_EXPECTED_CLAIM_BOUNDARY = Object.freeze({
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
})

const SHA40 = /^[0-9a-f]{40}$/
const SHA64 = /^[0-9a-f]{64}$/
const DECIMAL_ID = /^[1-9][0-9]*$/

function fail(code) {
  throw new Error(code)
}

function exactKeys(value, expected) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('\0') === [...expected].sort().join('\0')
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function canonicalBody(manifest) {
  const { digest: _digest, ...body } = manifest
  return JSON.stringify(body)
}

const manifestContracts = Object.freeze({
  android: Object.freeze({
    artifact: 'app-qa-debug.apk',
    runnerOs: 'Linux',
    identity: Object.freeze({
      applicationId: SHOP_ANDROID_QA_EXPECTED_APPLICATION_ID,
      applicationLabel: SHOP_ANDROID_QA_EXPECTED_APPLICATION_LABEL,
      capabilityContract: SHOP_ANDROID_QA_CAPABILITY_CONTRACT,
      evidenceContract: SHOP_ANDROID_QA_EVIDENCE_CONTRACT,
      scopedEncryptedRestore: true,
      scopedSyntheticExport: true,
      generalExternalFileAccess: false,
    }),
    signing: 'android_debug',
  }),
  ios: Object.freeze({
    artifact: 'Runner.app.zip',
    runnerOs: 'macOS',
    identity: Object.freeze({
      bundleIdentifier: 'dev.supermega.supermegaShop.qa',
      displayName: 'Shop QA',
      bundleName: 'Shop QA',
    }),
    signing: 'ios_no_codesign',
  }),
  windows: Object.freeze({
    artifact: 'supermega-shop-windows-qa.zip',
    runnerOs: 'Windows',
    identity: Object.freeze({
      executableName: 'supermega_shop_qa.exe',
      productName: 'Shop QA',
      fileDescription: 'Shop QA',
      internalName: 'supermega_shop_qa',
      originalFilename: 'supermega_shop_qa.exe',
    }),
    signing: 'windows_unsigned',
  }),
})

export function validateShopQaArtifactManifest(manifest) {
  if (!exactKeys(manifest, [
    'contract', 'digestScope', 'platform', 'buildProfile', 'source', 'artifact',
    'toolchain', 'signing', 'claimBoundary', 'digest',
  ])) fail('shop_qa_manifest_keys_invalid')
  if (manifest.contract !== 'supermega.shop.synthetic-qa-artifact.v1'
    || manifest.digestScope !== 'utf8_compact_json_without_digest'
    || manifest.buildProfile !== 'synthetic_qa_v1'
    || !Object.hasOwn(manifestContracts, manifest.platform)) fail('shop_qa_manifest_contract_invalid')
  const contract = manifestContracts[manifest.platform]
  if (!exactKeys(manifest.source, ['sourceSha', 'sourceTree', 'nativeTree'])
    || !Object.values(manifest.source).every(value => SHA40.test(value))) fail('shop_qa_manifest_source_invalid')
  const android = manifest.platform === 'android'
  const artifactKeys = android
    ? ['fileName', 'sha256', 'bytes', 'identity', 'identityReceiptSha256']
    : ['fileName', 'sha256', 'bytes', 'identity']
  if (!exactKeys(manifest.artifact, artifactKeys)
    || manifest.artifact.fileName !== contract.artifact
    || !SHA64.test(manifest.artifact.sha256)
    || !Number.isSafeInteger(manifest.artifact.bytes)
    || manifest.artifact.bytes <= 0
    || (android && !SHA64.test(manifest.artifact.identityReceiptSha256))) fail('shop_qa_manifest_artifact_invalid')
  if (android) {
    if (!exactKeys(manifest.artifact.identity, [
      ...Object.keys(contract.identity), 'versionCode', 'versionName', 'compileSdk', 'minSdk', 'targetSdk', 'abis', 'buildIdentitySha256',
    ])
      || Object.entries(contract.identity).some(([key, value]) => manifest.artifact.identity[key] !== value)
      || !/^[1-9][0-9]*$/.test(manifest.artifact.identity.versionCode)
      || typeof manifest.artifact.identity.versionName !== 'string'
      || !manifest.artifact.identity.versionName.trim()
      || !Number.isSafeInteger(manifest.artifact.identity.compileSdk)
      || !Number.isSafeInteger(manifest.artifact.identity.minSdk)
      || !Number.isSafeInteger(manifest.artifact.identity.targetSdk)
      || manifest.artifact.identity.compileSdk < manifest.artifact.identity.targetSdk
      || manifest.artifact.identity.minSdk <= 0
      || manifest.artifact.identity.targetSdk < manifest.artifact.identity.minSdk
      || !Array.isArray(manifest.artifact.identity.abis)
      || manifest.artifact.identity.abis.length === 0
      || manifest.artifact.identity.abis.some((abi, index, values) => (
        !['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'].includes(abi)
        || (index > 0 && values[index - 1] >= abi)
      ))
      || !SHA64.test(manifest.artifact.identity.buildIdentitySha256)) fail('shop_qa_manifest_android_identity_invalid')
  } else if (JSON.stringify(manifest.artifact.identity) !== JSON.stringify(contract.identity)) {
    fail('shop_qa_manifest_artifact_invalid')
  }
  if (!exactKeys(manifest.toolchain, [
    'flutterVersion', 'flutterRevision', 'dartVersion', 'runnerOs', 'runnerArch',
    'runnerImageOs', 'runnerImageVersion', 'receiptSha256',
  ])
    || !/^\d+\.\d+\.\d+/.test(manifest.toolchain.flutterVersion)
    || !SHA40.test(manifest.toolchain.flutterRevision)
    || typeof manifest.toolchain.dartVersion !== 'string'
    || !manifest.toolchain.dartVersion.trim()
    || manifest.toolchain.runnerOs !== contract.runnerOs
    || !SHA64.test(manifest.toolchain.receiptSha256)
    || !['runnerArch', 'runnerImageOs', 'runnerImageVersion'].every(key => (
      typeof manifest.toolchain[key] === 'string' && manifest.toolchain[key].trim()
    ))) fail('shop_qa_manifest_toolchain_invalid')
  const signingKeys = android
    ? ['classification', 'productionSigned', 'stableUpdateIdentityProven', 'certificateSha256', 'signatureVerified', 'apksignerBuildToolsVersion', 'apksignerSha256', 'apksignerJarSha256', 'buildToolsSourcePropertiesSha256', 'receiptSha256']
    : ['classification', 'productionSigned', 'stableUpdateIdentityProven', 'receiptSha256']
  if (!exactKeys(manifest.signing, signingKeys)
    || manifest.signing.classification !== contract.signing
    || manifest.signing.productionSigned !== false
    || manifest.signing.stableUpdateIdentityProven !== false
    || (android && (!SHA64.test(manifest.signing.certificateSha256)
      || manifest.signing.signatureVerified !== true
      || !/^\d+\.\d+\.\d+$/.test(manifest.signing.apksignerBuildToolsVersion)
      || !SHA64.test(manifest.signing.apksignerSha256)
      || !SHA64.test(manifest.signing.apksignerJarSha256)
      || !SHA64.test(manifest.signing.buildToolsSourcePropertiesSha256)))
    || !SHA64.test(manifest.signing.receiptSha256)) fail('shop_qa_manifest_signing_invalid')
  if (!exactKeys(manifest.claimBoundary, [
    'internalSyntheticQaOnly', 'installedAcceptanceProven', 'hardwareAcceptanceProven',
    'merchantAcceptanceProven', 'productionReady', 'promotionEligible',
  ])
    || manifest.claimBoundary.internalSyntheticQaOnly !== true
    || ['installedAcceptanceProven', 'hardwareAcceptanceProven', 'merchantAcceptanceProven', 'productionReady', 'promotionEligible']
      .some(key => manifest.claimBoundary[key] !== false)) fail('shop_qa_manifest_claim_boundary_invalid')
  const expectedDigest = `sha256:${sha256(canonicalBody(manifest))}`
  if (manifest.digest !== expectedDigest) fail('shop_qa_manifest_digest_invalid')
  return manifest
}

function packetDigest(value) {
  return `sha256:${sha256(Buffer.from(JSON.stringify(value), 'utf8'))}`
}

function parseIsoMillis(value) {
  const millis = Date.parse(String(value || ''))
  return Number.isFinite(millis) ? millis : null
}

function expectedArtifactUrl(runId, artifactId) {
  return `https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/${runId}/artifacts/${artifactId}`
}

export function validateShopAndroidQaHandoff(packet, { nowMillis = Date.now() } = {}) {
  const body = { ...packet }
  const digest = body.digest
  delete body.digest
  if (digest !== packetDigest(body)) throw new Error('shop_android_qa_handoff_digest_invalid')
  const canonicalAware = packet.contract === SHOP_ANDROID_QA_CANONICAL_HANDOFF_CONTRACT
  const capabilityAware = canonicalAware || packet.contract === SHOP_ANDROID_QA_CAPABILITY_HANDOFF_CONTRACT
  if (packet.contract !== SHOP_ANDROID_QA_HANDOFF_CONTRACT && !capabilityAware) {
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
    || expectation.sourceSha !== artifact.sourceSha
    || expectation.mergeSha !== artifact.mergeSha
    || expectation.nativeTree !== artifact.nativeTree
    || expectation.runId !== artifact.runId
    || expectation.artifactId !== artifact.artifactId
    || expectation.archiveSha256 !== artifact.archiveSha256
    || generatedAtMillis == null || expiresAtMillis == null
    || expiresAtMillis <= generatedAtMillis || expiresAtMillis <= nowMillis) {
    throw new Error('shop_android_qa_handoff_provenance_invalid')
  }
  if (artifact.applicationId !== SHOP_ANDROID_QA_EXPECTED_APPLICATION_ID
    || artifact.applicationLabel !== SHOP_ANDROID_QA_EXPECTED_APPLICATION_LABEL
    || artifact.identityInspection !== (canonicalAware
      ? 'canonical_manifest_and_receipts_verified'
      : 'reported_producer_ci_passed_not_reinspected')
    || artifact.signingClass !== 'android_debug'
    || artifact.productionSigned !== false
    || artifact.promotionEligible !== false) {
    throw new Error('shop_android_qa_handoff_artifact_identity_invalid')
  }
  if (canonicalAware && (!SHA64.test(String(artifact.signerCertificateSha256 || ''))
    || !/^\d+\.\d+\.\d+$/.test(String(artifact.apksignerBuildToolsVersion || ''))
    || !SHA64.test(String(artifact.apksignerSha256 || ''))
    || !SHA64.test(String(artifact.apksignerJarSha256 || ''))
    || !SHA64.test(String(artifact.buildToolsSourcePropertiesSha256 || ''))
    || !/^[1-9][0-9]*$/.test(String(artifact.versionCode || ''))
    || typeof artifact.versionName !== 'string' || !artifact.versionName.trim()
    || !Number.isSafeInteger(artifact.compileSdk)
    || !Number.isSafeInteger(artifact.minSdk)
    || !Number.isSafeInteger(artifact.targetSdk)
    || artifact.compileSdk < artifact.targetSdk
    || artifact.targetSdk < artifact.minSdk
    || !Array.isArray(artifact.abis) || artifact.abis.length === 0
    || !SHA64.test(String(artifact.buildIdentitySha256 || '')))) {
    throw new Error('shop_android_qa_handoff_canonical_observation_invalid')
  }
  if (canonicalAware) {
    let canonicalManifest
    try {
      canonicalManifest = validateShopQaArtifactManifest(packet.canonicalArtifactManifest)
    } catch {
      throw new Error('shop_android_qa_handoff_canonical_manifest_invalid')
    }
    if (canonicalManifest.platform !== 'android'
      || canonicalManifest.source.sourceSha !== artifact.sourceSha
      || canonicalManifest.source.nativeTree !== artifact.nativeTree
      || canonicalManifest.artifact.sha256 !== artifact.apkSha256
      || JSON.stringify(canonicalManifest.artifact.identity.abis) !== JSON.stringify(artifact.abis)
      || canonicalManifest.artifact.identity.versionCode !== artifact.versionCode
      || canonicalManifest.artifact.identity.versionName !== artifact.versionName
      || canonicalManifest.artifact.identity.compileSdk !== artifact.compileSdk
      || canonicalManifest.artifact.identity.minSdk !== artifact.minSdk
      || canonicalManifest.artifact.identity.targetSdk !== artifact.targetSdk
      || canonicalManifest.artifact.identity.buildIdentitySha256 !== artifact.buildIdentitySha256
      || canonicalManifest.signing.certificateSha256 !== artifact.signerCertificateSha256
      || canonicalManifest.signing.apksignerBuildToolsVersion !== artifact.apksignerBuildToolsVersion
      || canonicalManifest.signing.apksignerSha256 !== artifact.apksignerSha256
      || canonicalManifest.signing.apksignerJarSha256 !== artifact.apksignerJarSha256
      || canonicalManifest.signing.buildToolsSourcePropertiesSha256 !== artifact.buildToolsSourcePropertiesSha256) {
      throw new Error('shop_android_qa_handoff_canonical_manifest_mismatch')
    }
  } else if (packet.canonicalArtifactManifest != null) {
    throw new Error('shop_android_qa_handoff_legacy_canonical_manifest_forbidden')
  }
  if (capabilityAware) {
    if (artifact.capabilityInspection !== (canonicalAware
      ? 'canonical_manifest_and_receipts_verified'
      : 'reported_producer_ci_passed_not_reinspected')
      || artifact.capabilityContract !== SHOP_ANDROID_QA_CAPABILITY_CONTRACT
      || artifact.evidenceContract !== SHOP_ANDROID_QA_EVIDENCE_CONTRACT
      || JSON.stringify(artifact.capabilities) !== JSON.stringify(SHOP_ANDROID_QA_CAPABILITIES)
      || artifact.scopedEncryptedRestore !== true
      || artifact.scopedSyntheticExport !== true
      || artifact.generalExternalFileAccess !== false
      || !Array.isArray(packet.artifactCapabilities)
      || JSON.stringify(packet.artifactCapabilities) !== JSON.stringify(SHOP_ANDROID_QA_DECLARED_CAPABILITIES)) {
      throw new Error('shop_android_qa_handoff_capability_identity_invalid')
    }
  } else if ((artifact.capabilityInspection != null
      && artifact.capabilityInspection !== 'unavailable')
    || (artifact.capabilityContract ?? null) !== null
    || (artifact.evidenceContract ?? null) !== null
    || (artifact.capabilities != null
      && (!Array.isArray(artifact.capabilities) || artifact.capabilities.length !== 0))
    || (artifact.scopedEncryptedRestore ?? false) !== false
    || (artifact.scopedSyntheticExport ?? false) !== false
    || (artifact.generalExternalFileAccess ?? false) !== false
    || (packet.artifactCapabilities != null
      && (!Array.isArray(packet.artifactCapabilities)
        || packet.artifactCapabilities.length !== 0))) {
    throw new Error('shop_android_qa_handoff_legacy_capability_claim_invalid')
  }
  if (!Array.isArray(packet.runPlan)
    || packet.runPlan.length !== SHOP_ANDROID_QA_RUN_STEPS.length
    || packet.runPlan.some((step, index) => step?.id !== SHOP_ANDROID_QA_RUN_STEPS[index][0]
      || step.instruction !== SHOP_ANDROID_QA_RUN_STEPS[index][1] || step.required !== true)) {
    throw new Error('shop_android_qa_handoff_run_plan_invalid')
  }
  if (!Array.isArray(packet.requiredEvidenceFields)
    || packet.requiredEvidenceFields.length !== SHOP_ANDROID_QA_REQUIRED_EVIDENCE_FIELDS.length
    || SHOP_ANDROID_QA_REQUIRED_EVIDENCE_FIELDS.some((field, index) =>
      packet.requiredEvidenceFields[index] !== field)) {
    throw new Error('shop_android_qa_handoff_evidence_fields_invalid')
  }
  const expectedBlockedCapabilities = capabilityAware
    ? SHOP_ANDROID_QA_CAPABILITY_AWARE_BLOCKED_CAPABILITIES
    : SHOP_ANDROID_QA_REQUIRED_BLOCKED_CAPABILITIES
  if (!Array.isArray(packet.blockedCapabilities)
    || packet.blockedCapabilities.length !== expectedBlockedCapabilities.length
    || packet.blockedCapabilities.some((entry, index) =>
      entry?.id !== expectedBlockedCapabilities[index] || entry.status !== 'BLOCKED')) {
    throw new Error('shop_android_qa_handoff_blocked_capabilities_invalid')
  }
  if (JSON.stringify(packet.claimBoundary) !== JSON.stringify(SHOP_ANDROID_QA_EXPECTED_CLAIM_BOUNDARY)) {
    throw new Error('shop_android_qa_handoff_claim_boundary_invalid')
  }
  return packet
}
