import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { verifyShopNativeCiContract } from './verify_shop_native_ci_contract.mjs'

const workflow = await readFile('.github/workflows/shop-native-ci.yml', 'utf8')
const gradleWrapper = await readFile('mobile/shop_pos/android/gradle/wrapper/gradle-wrapper.properties', 'utf8')
const qaManifest = await readFile('mobile/shop_pos/android/app/src/qa/AndroidManifest.xml', 'utf8')
const actualTestPaths = (await readdir('mobile/shop_pos/test', { withFileTypes: true }))
  .filter(entry => entry.isFile() && entry.name.endsWith('_test.dart'))
  .map(entry => `test/${entry.name}`)

test('Android QA source declares the exact fail-closed recovery capability tuple', () => {
  for (const token of [
    'android:name="dev.supermega.shop.qa.capabilityContract"',
    'android:value="supermega.shop.android-qa-capabilities.v1"',
    'android:name="dev.supermega.shop.qa.evidenceContract"',
    'android:value="supermega.shop.synthetic-qa-evidence.v1"',
    'android:name="dev.supermega.shop.qa.scopedEncryptedRestore"',
    'android:name="dev.supermega.shop.qa.scopedSyntheticExport"',
    'android:name="dev.supermega.shop.qa.generalExternalFileAccess"',
    'android:value="false"',
  ]) {
    assert.equal(qaManifest.split(token).length - 1, 1, token)
  }
  assert.equal(qaManifest.split('android:value="true"').length - 1, 2)
})

test('native CI retains checksums for the actual Android and Windows QA files', () => {
  const result = verifyShopNativeCiContract(workflow, gradleWrapper, actualTestPaths)
  assert.deepEqual(result.failures, [])
  assert.equal(result.ok, true)
  assert.equal(result.androidArtifactKind, 'debug')
  assert.equal(result.androidReleaseArtifactRetained, false)
  assert.equal(result.windowsArtifactKind, 'unsigned')
  assert.equal(result.iosArtifactRetained, false)
  assert.equal(result.minimumRetentionDays, 14)
  assert.equal(result.flutterVersion, '3.47.8')
  assert.equal(result.gradleDistribution, 'gradle-9.3.1-bin.zip')
  assert.equal(result.gradleDistributionSha256, 'b266d5ff6b90eada6dc3b20cb090e3731302e553a27c5d3e4df1f0d76beaff06')
})

test('iOS and Windows QA artifacts inspect signing and use canonical source binding', () => {
  for (const [command, failure] of [
    ['codesign -dv --verbose=4', 'ios_qa_signature_not_inspected'],
    ['code object is not signed at all', 'ios_qa_unsigned_result_not_verified'],
    ['flutter --version --machine > Runner.app.zip.toolchain.json', 'ios_qa_observed_toolchain_missing'],
    [
      'node tools/write_shop_qa_artifact_manifest.mjs --platform ios --artifact Runner.app.zip --checksum Runner.app.zip.sha256 --toolchain Runner.app.zip.toolchain.json --signing Runner.app.zip.signing.json --output Runner.app.zip.manifest',
      'ios_qa_canonical_manifest_missing',
    ],
    ['Get-AuthenticodeSignature -LiteralPath $executable', 'windows_qa_signature_not_inspected'],
    ["$signature.Status -cne 'NotSigned'", 'windows_qa_unsigned_result_not_verified'],
    ["flutter --version --machine | Set-Content -LiteralPath 'supermega-shop-windows-qa.zip.toolchain.json' -Encoding utf8NoBOM", 'windows_qa_observed_toolchain_missing'],
    [
      'node tools/write_shop_qa_artifact_manifest.mjs --platform windows --artifact supermega-shop-windows-qa.zip --checksum supermega-shop-windows-qa.zip.sha256 --toolchain supermega-shop-windows-qa.zip.toolchain.json --signing supermega-shop-windows-qa.zip.signing.json --output supermega-shop-windows-qa.zip.manifest',
      'windows_qa_canonical_manifest_missing',
    ],
  ]) {
    const result = verifyShopNativeCiContract(
      workflow.replace(command, 'echo loose-source-binding'),
      gradleWrapper,
      actualTestPaths,
    )
    assert.ok(result.failures.includes(failure), failure)
  }
})

test('native CI retains exactly the contracted 18-file public gallery artifact', () => {
  const lastGalleryPath = 'mobile/shop_pos/test/goldens/shop_today_820_my.png'
  for (const changed of [
    workflow.replace('mobile/shop_pos/test/goldens/shop_checkout_1200_en.png\n', ''),
    workflow.replace(
      'mobile/shop_pos/test/goldens/shop_checkout_1200_en.png',
      'mobile/shop_pos/test/goldens/shop_checkout_1200_en.png\n            mobile/shop_pos/test/goldens/shop_checkout_1200_en.png',
    ),
    workflow.replace(
      'mobile/shop_pos/test/goldens/shop_checkout_1200_en.png',
      'mobile/shop_pos/test/goldens/shop_unreviewed_extra.png',
    ),
    workflow.replace(
      'mobile/shop_pos/test/goldens/shop_checkout_1200_en.png',
      'mobile/shop_pos/test/goldens/shop_*.png',
    ),
    workflow.replace('if-no-files-found: error', 'if-no-files-found: warn'),
    workflow.replace(
      lastGalleryPath,
      `${lastGalleryPath}\n            mobile/shop_pos/test/goldens/*.png`,
    ),
    workflow.replace(
      lastGalleryPath,
      `${lastGalleryPath}\n            mobile/shop_pos/test/goldens/unreviewed.png`,
    ),
    workflow.replace(
      '          if-no-files-found: error',
      '          path: |\n            mobile/shop_pos/test/goldens/*.png\n          if-no-files-found: error',
    ),
    workflow.replace(
      '          if-no-files-found: error',
      '          if-no-files-found: error\n          if-no-files-found: warn',
    ),
    workflow.replace(
      '          if-no-files-found: error',
      '          path: mobile/shop_pos/test/goldens/*.png\n          if-no-files-found: error',
    ),
    workflow.replace(
      '          if-no-files-found: error',
      '          if-no-files-found: error\n          if-no-files-found: warn # duplicate override',
    ),
  ]) {
    const result = verifyShopNativeCiContract(changed, gradleWrapper, actualTestPaths)
    assert.ok(result.failures.includes('native_public_gallery_artifact_contract_drift'))
  }
})

test('Android QA label is parsed structurally from the built manifest', () => {
  for (const token of [
    'xml.etree.ElementTree',
    'findall("application")',
    'apps[0].get(android + "label")',
    'sys.exit(None if valid else "shop_android_qa_identity_or_capability_mismatch")',
  ]) {
    const missing = verifyShopNativeCiContract(
      workflow.replace(token, 'label-inspection-omitted'),
      gradleWrapper,
    )
    assert.ok(missing.failures.includes('android_qa_postbuild_label_not_structurally_inspected'))
  }
})

test('Android QA analyzer is resolved from one consistent runner SDK root', () => {
  for (const token of [
    'android_sdk_root="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"',
    'test "$(readlink -f "$ANDROID_SDK_ROOT")" = "$(readlink -f "$ANDROID_HOME")"',
    'android_sdk_root="$(readlink -f "$android_sdk_root")"',
    'analyzer="$android_sdk_root/cmdline-tools/latest/bin/apkanalyzer"',
    'test -x "$analyzer"',
  ]) {
    const missing = verifyShopNativeCiContract(
      workflow.replace(token, 'sdk-analyzer-discovery-omitted'),
      gradleWrapper,
    )
    assert.ok(missing.failures.includes('android_qa_postbuild_analyzer_not_pinned_to_sdk'))
  }
  const pathLookup = verifyShopNativeCiContract(
    workflow.replace(
      'analyzer="$android_sdk_root/cmdline-tools/latest/bin/apkanalyzer"',
      'analyzer="$(command -v apkanalyzer)"',
    ),
    gradleWrapper,
  )
  assert.ok(pathLookup.failures.includes('android_qa_postbuild_analyzer_not_pinned_to_sdk'))
  assert.ok(pathLookup.failures.includes('android_qa_analyzer_path_lookup_forbidden'))
})

test('Android QA label parser fails closed for wrong, missing, duplicate, and malformed manifests', async () => {
  const parser = workflow.match(/python3 -c '([^'\n]+)' "\$manifest_xml"/)?.[1]
  assert.ok(parser, 'workflow must retain an executable Android manifest parser')
  const directory = await mkdtemp(join(tmpdir(), 'shop-android-qa-manifest-'))
  try {
    const fixtures = [
      { name: 'valid.xml', source: '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:label="Shop QA"><meta-data android:name="dev.supermega.shop.qa.capabilityContract" android:value="supermega.shop.android-qa-capabilities.v1"/><meta-data android:name="dev.supermega.shop.qa.evidenceContract" android:value="supermega.shop.synthetic-qa-evidence.v1"/><meta-data android:name="dev.supermega.shop.qa.scopedEncryptedRestore" android:value="true"/><meta-data android:name="dev.supermega.shop.qa.scopedSyntheticExport" android:value="true"/><meta-data android:name="dev.supermega.shop.qa.generalExternalFileAccess" android:value="false"/></application></manifest>', status: 0 },
      { name: 'wrong.xml', source: '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:label="Shop"/></manifest>', status: 1 },
      { name: 'wrong-capability.xml', source: '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:label="Shop QA"><meta-data android:name="dev.supermega.shop.qa.capabilityContract" android:value="supermega.shop.android-qa-capabilities.v999"/></application></manifest>', status: 1 },
      { name: 'unsafe-external.xml', source: '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:label="Shop QA"><meta-data android:name="dev.supermega.shop.qa.generalExternalFileAccess" android:value="true"/></application></manifest>', status: 1 },
      { name: 'duplicate-metadata.xml', source: '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:label="Shop QA"><meta-data android:name="dev.supermega.shop.qa.capabilityContract" android:value="supermega.shop.android-qa-capabilities.v1"/><meta-data android:name="dev.supermega.shop.qa.capabilityContract" android:value="supermega.shop.android-qa-capabilities.v1"/></application></manifest>', status: 1 },
      { name: 'missing.xml', source: '<manifest xmlns:android="http://schemas.android.com/apk/res/android"/>', status: 1 },
      { name: 'duplicate.xml', source: '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:label="Shop QA"/><application android:label="Shop QA"/></manifest>', status: 1 },
      { name: 'malformed.xml', source: '<manifest><application>', status: 1 },
    ]
    for (const fixture of fixtures) {
      const path = join(directory, fixture.name)
      await writeFile(path, fixture.source, 'utf8')
      const result = spawnSync('python3', ['-c', parser, path], {
        encoding: 'utf8',
        env: { ...process.env, PYTHONOPTIMIZE: '1' },
      })
      assert.equal(result.status, fixture.status, fixture.name)
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('native CI pins one exact Flutter SDK across production and QA native jobs', () => {
  const mutable = verifyShopNativeCiContract(
    workflow.replace("flutter-version: '3.47.8'", 'channel: stable'),
    gradleWrapper,
  )
  assert.ok(mutable.failures.includes('flutter_sdk_not_exactly_pinned_for_all_native_jobs'))
  assert.ok(mutable.failures.includes('flutter_sdk_uses_mutable_stable_channel'))

  const missingGuard = verifyShopNativeCiContract(
    workflow.replace('npm run shop:native:ci-contract:verify', 'true'),
    gradleWrapper,
  )
  assert.ok(missingGuard.failures.includes('native_toolchain_contract_command_missing'))

  const missingQaFormat = verifyShopNativeCiContract(
    workflow.replaceAll('lib/shop_runtime_scope.dart', 'lib/shop_runtime_scope_omitted.dart'),
    gradleWrapper,
  )
  assert.ok(missingQaFormat.failures.includes('qa_dart_format_gate_missing:lib/shop_runtime_scope.dart'))

  const missingCorrectionFormat = verifyShopNativeCiContract(
    workflow.replaceAll('lib/shop_correction_consumption.dart', 'lib/shop_correction_consumption_omitted.dart'),
    gradleWrapper,
  )
  assert.ok(
    missingCorrectionFormat.failures.includes(
      'qa_dart_format_gate_missing:lib/shop_correction_consumption.dart',
    ),
  )

  const wrongIosProduct = verifyShopNativeCiContract(
    workflow.replaceAll('build/ios/iphoneos/Runner.app', 'build/ios/iphoneos/Shop QA.app'),
    gradleWrapper,
  )
  assert.ok(wrongIosProduct.failures.includes('ios_qa_runner_bundle_not_staged'))
  assert.ok(wrongIosProduct.failures.includes('ios_qa_runner_bundle_not_inspected'))
})

test('native CI checkouts never persist the workflow credential', () => {
  const missingCheckout = verifyShopNativeCiContract(
    workflow.replace('uses: actions/checkout@', 'uses: actions/not-checkout@'),
    gradleWrapper,
  )
  assert.ok(missingCheckout.failures.includes('native_checkout_step_count_not_exactly_six'))

  const persisted = verifyShopNativeCiContract(
    workflow.replace('persist-credentials: false', 'persist-credentials: true'),
    gradleWrapper,
  )
  assert.ok(
    persisted.failures.includes('native_checkout_credentials_persisted_or_unspecified'),
  )

  const missing = verifyShopNativeCiContract(
    workflow.replace('          persist-credentials: false\n', ''),
    gradleWrapper,
  )
  assert.ok(
    missing.failures.includes('native_checkout_credentials_persisted_or_unspecified'),
  )

  const underEnvironment = verifyShopNativeCiContract(
    workflow.replace(
      '        with:\n          persist-credentials: false',
      '        env:\n          persist-credentials: false',
    ),
    gradleWrapper,
  )
  assert.ok(
    underEnvironment.failures.includes('native_checkout_credentials_persisted_or_unspecified'),
  )

  const afterRun = verifyShopNativeCiContract(
    workflow.replace(
      '        with:\n          persist-credentials: false',
      '        run: true\n        persist-credentials: false',
    ),
    gradleWrapper,
  )
  assert.ok(
    afterRun.failures.includes('native_checkout_credentials_persisted_or_unspecified'),
  )

  const conflicting = verifyShopNativeCiContract(
    workflow.replace(
      '          persist-credentials: false',
      '          persist-credentials: false\n          persist-credentials: true',
    ),
    gradleWrapper,
  )
  assert.ok(
    conflicting.failures.includes('native_checkout_credentials_persisted_or_unspecified'),
  )
})

test('production identity is generated only after every default-profile test shard', () => {
  const generatedTooEarly = verifyShopNativeCiContract(
    workflow.replace(
      '      - name: Check first-sale widget in isolation',
      '      - name: Generate Android production identity\n        run: node tools/generate_shop_build_identity.mjs --platform android --profile production\n\n      - name: Check first-sale widget in isolation',
    ),
    gradleWrapper,
  )
  assert.ok(generatedTooEarly.failures.includes('android_production_identity_generated_before_default_profile_tests'))

  const omittedShard = verifyShopNativeCiContract(
    workflow.replaceAll('test/shop_member_identity_test.dart', 'test/omitted_member_identity_test.dart'),
    gradleWrapper,
  )
  assert.ok(omittedShard.failures.includes('native_test_shard_missing:test/shop_member_identity_test.dart'))

  const omittedMmkShard = verifyShopNativeCiContract(
    workflow.replaceAll('test/shop_mmk_input_test.dart', 'test/omitted_mmk_input_test.dart'),
    gradleWrapper,
  )
  assert.ok(omittedMmkShard.failures.includes('native_test_shard_missing:test/shop_mmk_input_test.dart'))

  const omittedPendingCashShard = verifyShopNativeCiContract(
    workflow.replaceAll(
      'test/shop_pending_cash_checkout_test.dart',
      'test/omitted_pending_cash_checkout_test.dart',
    ),
    gradleWrapper,
  )
  assert.ok(
    omittedPendingCashShard.failures.includes(
      'native_test_shard_missing:test/shop_pending_cash_checkout_test.dart',
    ),
  )

  const omittedSqliteFullShard = verifyShopNativeCiContract(
    workflow.replaceAll(
      'test/shop_sqlite_full_recovery_test.dart',
      'test/omitted_sqlite_full_recovery_test.dart',
    ),
    gradleWrapper,
  )
  assert.ok(
    omittedSqliteFullShard.failures.includes(
      'native_test_shard_missing:test/shop_sqlite_full_recovery_test.dart',
    ),
  )

  const duplicatedMmkShard = verifyShopNativeCiContract(
    workflow.replace(
      '            test/shop_mmk_input_test.dart \\',
      '            test/shop_mmk_input_test.dart \\\n            test/shop_mmk_input_test.dart \\',
    ),
    gradleWrapper,
  )
  assert.ok(duplicatedMmkShard.failures.includes('native_test_shard_duplicate:test/shop_mmk_input_test.dart'))

  const duplicatedMmkFormatGate = verifyShopNativeCiContract(
    workflow.replace(
      'dart format lib/camera_barcode_scanner.dart',
      'dart format test/shop_mmk_input_test.dart lib/camera_barcode_scanner.dart',
    ),
    gradleWrapper,
  )
  assert.ok(duplicatedMmkFormatGate.failures.includes('qa_dart_format_gate_duplicate:test/shop_mmk_input_test.dart'))

  const missingInventoryGate = verifyShopNativeCiContract(
    workflow.replace('diff -u /tmp/shop-test-files.expected /tmp/shop-test-files.actual', 'true'),
    gradleWrapper,
  )
  assert.ok(missingInventoryGate.failures.includes('native_test_inventory_equality_gate_missing'))

  const missingWorkerInventory = verifyShopNativeCiContract(
    workflow.replace('          test/shop_process_interrupt_worker_test.dart\n', ''),
    gradleWrapper,
    actualTestPaths,
  )
  assert.ok(
    missingWorkerInventory.failures.includes('native_test_inventory_does_not_match_filesystem'),
  )

  const missingProcessHarness = verifyShopNativeCiContract(
    workflow.replace(
      'FLUTTER_BIN="$flutter_bin" timeout --signal=TERM --kill-after=10s 180s python3 scripts/test_shop_process_interruption.py',
      'true',
    ),
    gradleWrapper,
  )
  assert.ok(
    missingProcessHarness.failures.includes('native_process_interruption_harness_not_bounded_or_missing'),
  )
})

test('default-profile test shards share one evidence-backed aggregate budget', () => {
  const widened = verifyShopNativeCiContract(
    workflow.replace(
      'SHOP_FLUTTER_TEST_AGGREGATE_BUDGET_SECONDS: "300"',
      'SHOP_FLUTTER_TEST_AGGREGATE_BUDGET_SECONDS: "360"',
    ),
    gradleWrapper,
  )
  assert.ok(
    widened.failures.includes(
      'native_test_aggregate_budget_not_bounded_to_300_seconds',
    ),
  )

  const missingStart = verifyShopNativeCiContract(
    workflow.replace(
      'started_at="$(date +%s)"',
      'true',
    ),
    gradleWrapper,
  )
  assert.ok(
    missingStart.failures.includes('native_test_aggregate_budget_start_missing'),
  )

  const unboundedPersistence = verifyShopNativeCiContract(
    workflow.replace(
      'TMPDIR="$persistence_tmp" timeout --signal=TERM --kill-after=10s "${SHOP_FLUTTER_TEST_AGGREGATE_BUDGET_SECONDS}s" flutter test --concurrency=1',
      'TMPDIR="$behavior_tmp" flutter test --concurrency=2',
    ),
    gradleWrapper,
  )
  assert.ok(
    unboundedPersistence.failures.includes(
      'native_persistence_shard_not_bounded_or_sequential',
    ),
  )

  const unboundedBehavior = verifyShopNativeCiContract(
    workflow.replace(
      'TMPDIR="$behavior_tmp" timeout --signal=TERM --kill-after=10s "${SHOP_FLUTTER_TEST_AGGREGATE_BUDGET_SECONDS}s" flutter test --concurrency=1',
      'TMPDIR="$behavior_tmp" flutter test --concurrency=2',
    ),
    gradleWrapper,
  )
  assert.ok(
    unboundedBehavior.failures.includes(
      'native_behavior_shard_not_bounded_or_sequential',
    ),
  )

  const missingElapsedGuard = verifyShopNativeCiContract(
    workflow.replace(
      'if [ "$elapsed" -gt "$SHOP_FLUTTER_TEST_AGGREGATE_BUDGET_SECONDS" ]; then',
      'if false; then',
    ),
    gradleWrapper,
  )
  assert.ok(
    missingElapsedGuard.failures.includes(
      'native_test_aggregate_budget_elapsed_guard_missing',
    ),
  )

  const sharedTemp = verifyShopNativeCiContract(
    workflow.replace(
      'persistence_tmp="$(mktemp -d "${RUNNER_TEMP}/shop-persistence.XXXXXX")"',
      'persistence_tmp="$behavior_tmp"',
    ),
    gradleWrapper,
  )
  assert.ok(
    sharedTemp.failures.includes('native_persistence_shard_temp_isolation_missing'),
  )
})

test('Gradle wrapper uses the checksum-pinned 9.3.1 bin distribution', () => {
  const mutableArchive = verifyShopNativeCiContract(
    workflow,
    gradleWrapper.replace('gradle-9.3.1-bin.zip', 'gradle-9.3.1-all.zip'),
  )
  assert.ok(mutableArchive.failures.includes('gradle_distribution_not_pinned_to_expected_bin_archive'))

  const wrongChecksum = verifyShopNativeCiContract(
    workflow,
    gradleWrapper.replace(
      'b266d5ff6b90eada6dc3b20cb090e3731302e553a27c5d3e4df1f0d76beaff06',
      '0'.repeat(64),
    ),
  )
  assert.ok(wrongChecksum.failures.includes('gradle_distribution_sha256_missing_or_wrong'))
})

test('missing or unverified Android checksum fails closed', () => {
  const missing = verifyShopNativeCiContract(
    workflow.replace('sha256sum app-production-debug.apk > app-production-debug.apk.sha256', 'true'),
  )
  assert.ok(missing.failures.includes('android_inner_checksum_not_recorded'))

  const unchecked = verifyShopNativeCiContract(
    workflow.replace('sha256sum --check app-production-debug.apk.sha256', 'true'),
  )
  assert.ok(unchecked.failures.includes('android_inner_checksum_not_verified'))

  const binaryMissing = verifyShopNativeCiContract(
    workflow.replace(/^\s+mobile\/shop_pos\/build\/app\/outputs\/flutter-apk\/app-production-debug\.apk\s*$/m, ''),
  )
  assert.ok(binaryMissing.failures.includes('android_binary_not_retained'))
})

test('missing Windows checksum or truthful artifact labels fails closed', () => {
  const noChecksum = verifyShopNativeCiContract(
    workflow.replace('Get-FileHash -Algorithm SHA256 -LiteralPath $packagePath', 'Write-Output $packagePath'),
  )
  assert.ok(noChecksum.failures.includes('windows_inner_checksum_not_recorded'))

  const unchecked = verifyShopNativeCiContract(
    workflow.replace("if ($recordedChecksum -cne $expectedChecksum)", 'if ($false)'),
  )
  assert.ok(unchecked.failures.includes('windows_inner_checksum_not_verified'))

  const binaryMissing = verifyShopNativeCiContract(
    workflow.replace(/^\s+mobile\/shop_pos\/build\/supermega-shop-windows-unsigned\.zip\s*$/m, ''),
  )
  assert.ok(binaryMissing.failures.includes('windows_binary_not_retained'))

  const mislabeled = verifyShopNativeCiContract(
    workflow.replace('supermega-shop-windows-unsigned-${{ github.sha }}', 'supermega-shop-windows-release-${{ github.sha }}'),
  )
  assert.ok(mislabeled.failures.includes('windows_artifact_not_explicitly_unsigned'))
})

test('no-codesign iOS output cannot be retained as an installable artifact', () => {
  const withUpload = workflow.replace(
    '\n  windows:',
    '\n      - uses: actions/upload-artifact@synthetic\n        with:\n          path: mobile/shop_pos/build/ios\n\n  windows:',
  )
  const result = verifyShopNativeCiContract(withUpload)
  assert.ok(result.failures.includes('unsigned_ios_build_must_not_be_retained_as_installable'))
})

test('native QA artifacts remain available through the launch window', () => {
  const result = verifyShopNativeCiContract(workflow.replaceAll('retention-days: 14', 'retention-days: 7'))
  assert.ok(result.failures.includes('native_artifact_retention_below_launch_window'))
})

test('Android release packaging stays fail-closed and unretained', () => {
  const missingGate = verifyShopNativeCiContract(
    workflow.replace('name: Reject unsigned Android release packaging', 'name: Build Android release APK'),
  )
  assert.ok(missingGate.failures.includes('android_release_negative_gate_missing'))

  const noCleanup = verifyShopNativeCiContract(
    workflow.replace("trap 'result=$?; cleanup_release_outputs || result=1; trap - EXIT; exit \"$result\"' EXIT", 'true'),
  )
  assert.ok(noCleanup.failures.includes('android_release_artifact_cleanup_not_always_run'))

  const inheritedCredential = verifyShopNativeCiContract(
    workflow.replace('unset ORG_GRADLE_PROJECT_SHOP_ANDROID_KEY_ALIAS', 'true'),
  )
  assert.ok(inheritedCredential.failures.includes('android_release_ci_may_inherit_signing_credentials:SHOP_ANDROID_KEY_ALIAS'))

  const retainedRelease = verifyShopNativeCiContract(
    workflow.replace(
      'name: Retain Android debug APK for device QA',
      'uses: actions/upload-artifact@synthetic\n        with:\n          path: |\n            mobile/shop_pos/build/app/outputs/flutter-apk/app-release.apk\n\n      - name: Retain Android debug APK for device QA',
    ),
  )
  assert.ok(retainedRelease.failures.includes('unauthorized_android_release_artifact_retained'))
})
