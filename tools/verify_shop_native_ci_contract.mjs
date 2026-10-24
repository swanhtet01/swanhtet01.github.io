import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const WORKFLOW_PATH = '.github/workflows/shop-native-ci.yml'
const GRADLE_WRAPPER_PATH = 'mobile/shop_pos/android/gradle/wrapper/gradle-wrapper.properties'
const FLUTTER_VERSION = '3.47.8'
const GRADLE_DISTRIBUTION = 'gradle-9.3.1-bin.zip'
const GRADLE_DISTRIBUTION_SHA256 = 'b266d5ff6b90eada6dc3b20cb090e3731302e553a27c5d3e4df1f0d76beaff06'

function requireToken(source, token, failure, failures) {
  if (!source.includes(token)) failures.push(failure)
}

function requireOrder(source, before, after, failure, failures) {
  const beforeIndex = source.indexOf(before)
  const afterIndex = source.indexOf(after)
  if (beforeIndex < 0 || afterIndex < 0 || beforeIndex >= afterIndex) failures.push(failure)
}

function requirePattern(source, pattern, failure, failures) {
  if (!pattern.test(source)) failures.push(failure)
}

export function verifyShopNativeCiContract(source, gradleWrapperSource = '') {
  const failures = []

  const flutterVersionPins = source.match(new RegExp(`flutter-version: '${FLUTTER_VERSION.replaceAll('.', '\\.')}'`, 'g')) ?? []
  if (flutterVersionPins.length !== 6) failures.push('flutter_sdk_not_exactly_pinned_for_all_native_jobs')
  if (/^\s*channel:\s*stable\s*$/m.test(source)) failures.push('flutter_sdk_uses_mutable_stable_channel')
  requireToken(
    source,
    'name: Verify pinned native toolchain contract',
    'native_toolchain_contract_not_run_in_ci',
    failures,
  )
  requireToken(
    source,
    'npm run shop:native:ci-contract:verify',
    'native_toolchain_contract_command_missing',
    failures,
  )

  requireToken(
    gradleWrapperSource,
    `distributionUrl=https\\://services.gradle.org/distributions/${GRADLE_DISTRIBUTION}`,
    'gradle_distribution_not_pinned_to_expected_bin_archive',
    failures,
  )
  requireToken(
    gradleWrapperSource,
    `distributionSha256Sum=${GRADLE_DISTRIBUTION_SHA256}`,
    'gradle_distribution_sha256_missing_or_wrong',
    failures,
  )

  for (const [token, failure] of [
    ['name: supermega-shop-android-production-debug-${{ github.sha }}', 'android_artifact_not_explicitly_debug'],
    ['sha256sum app-production-debug.apk > app-production-debug.apk.sha256', 'android_inner_checksum_not_recorded'],
    ['sha256sum --check app-production-debug.apk.sha256', 'android_inner_checksum_not_verified'],
    ['mobile/shop_pos/build/app/outputs/flutter-apk/app-production-debug.apk.sha256', 'android_checksum_not_retained'],
    ['name: Reject unsigned Android release packaging', 'android_release_negative_gate_missing'],
    ["grep -F 'shop_android_release_signing_unavailable'", 'android_release_failure_marker_not_verified'],
    ["./gradlew assembleProductionRelease --console=plain", 'android_aggregate_release_gate_not_tested'],
    ["find build/app/outputs/flutter-apk -maxdepth 1 -name 'app-production-release*.apk'", 'android_release_artifact_absence_not_verified'],
    ["trap 'result=$?; cleanup_release_outputs || result=1; trap - EXIT; exit \"$result\"' EXIT", 'android_release_artifact_cleanup_not_always_run'],
    ['name: supermega-shop-windows-unsigned-${{ github.sha }}', 'windows_artifact_not_explicitly_unsigned'],
    ["Get-FileHash -Algorithm SHA256 -LiteralPath $packagePath", 'windows_inner_checksum_not_recorded'],
    ["if ($recordedChecksum -cne $expectedChecksum)", 'windows_inner_checksum_not_verified'],
    ['supermega-shop-windows-unsigned.zip.sha256', 'windows_checksum_not_retained'],
    ['Build iOS app without signing', 'ios_no_codesign_boundary_missing'],
    ['flutter build ios --debug --no-codesign --no-pub', 'ios_no_codesign_command_missing'],
    ['name: synthetic-qa-promotion-ineligible-${{ github.sha }}-sha-256-android', 'android_qa_artifact_not_bound_to_source_or_promotion_state'],
    ['name: synthetic-qa-promotion-ineligible-${{ github.sha }}-sha-256-ios', 'ios_qa_artifact_not_bound_to_source_or_promotion_state'],
    ['name: synthetic-qa-promotion-ineligible-${{ github.sha }}-sha-256-windows', 'windows_qa_artifact_not_bound_to_source_or_promotion_state'],
  ]) requireToken(source, token, failure, failures)

  for (const property of [
    'SHOP_ANDROID_KEYSTORE_PATH',
    'SHOP_ANDROID_KEY_ALIAS',
    'SHOP_ANDROID_STORE_PASSWORD',
    'SHOP_ANDROID_KEY_PASSWORD',
  ]) {
    requireToken(
      source,
      `unset ORG_GRADLE_PROJECT_${property}`,
      `android_release_ci_may_inherit_signing_credentials:${property}`,
      failures,
    )
  }

  requirePattern(
    source,
    /^\s+mobile\/shop_pos\/build\/app\/outputs\/flutter-apk\/app-production-debug\.apk\s*$/m,
    'android_binary_not_retained',
    failures,
  )
  requirePattern(
    source,
    /^\s+mobile\/shop_pos\/build\/supermega-shop-windows-unsigned\.zip\s*$/m,
    'windows_binary_not_retained',
    failures,
  )

  requireOrder(
    source,
    'sha256sum --check app-production-debug.apk.sha256',
    'name: Retain Android debug APK for device QA',
    'android_checksum_not_verified_before_retention',
    failures,
  )
  requireOrder(
    source,
    'Set-Content -LiteralPath $checksumPath',
    'name: Retain Windows QA package',
    'windows_checksum_not_recorded_before_retention',
    failures,
  )

  const iosStart = source.indexOf('\n  ios:')
  const windowsStart = source.indexOf('\n  windows:')
  if (iosStart < 0 || windowsStart <= iosStart) {
    failures.push('ios_job_boundary_missing')
  } else if (source.slice(iosStart, windowsStart).includes('actions/upload-artifact')) {
    failures.push('unsigned_ios_build_must_not_be_retained_as_installable')
  }
  if (
    /^\s+mobile\/shop_pos\/build\/app\/outputs\/flutter-apk\/app-release\.apk\s*$/m.test(source)
    || /name:\s*supermega-shop-android-release-/.test(source)
  ) {
    failures.push('unauthorized_android_release_artifact_retained')
  }

  const retainedArtifactCount = (source.match(/actions\/upload-artifact@/g) ?? []).length
  const launchWindowRetentionCount = (source.match(/retention-days:\s*14\b/g) ?? []).length
  const qaRetentionCount = (source.match(/retention-days:\s*7\b/g) ?? []).length
  if (
    retainedArtifactCount !== 6 ||
    launchWindowRetentionCount !== 3 ||
    qaRetentionCount !== 3
  ) {
    failures.push('native_artifact_retention_below_launch_window')
  }

  return {
    ok: failures.length === 0,
    contract: 'supermega.shop.native-ci-artifact-identity.v1',
    workflow: WORKFLOW_PATH,
    androidArtifactKind: 'debug',
    androidReleaseArtifactRetained: false,
    windowsArtifactKind: 'unsigned',
    iosArtifactRetained: false,
    innerChecksumsRequired: true,
    minimumRetentionDays: 14,
    flutterVersion: FLUTTER_VERSION,
    gradleDistribution: GRADLE_DISTRIBUTION,
    gradleDistributionSha256: GRADLE_DISTRIBUTION_SHA256,
    failures,
  }
}

async function main() {
  const [source, gradleWrapperSource] = await Promise.all([
    readFile(WORKFLOW_PATH, 'utf8'),
    readFile(GRADLE_WRAPPER_PATH, 'utf8'),
  ])
  const result = verifyShopNativeCiContract(source, gradleWrapperSource)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (!result.ok) process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
