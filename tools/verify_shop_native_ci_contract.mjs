import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const WORKFLOW_PATH = '.github/workflows/shop-native-ci.yml'

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

export function verifyShopNativeCiContract(source) {
  const failures = []

  for (const [token, failure] of [
    ['name: supermega-shop-android-debug-${{ github.sha }}', 'android_artifact_not_explicitly_debug'],
    ['sha256sum app-debug.apk > app-debug.apk.sha256', 'android_inner_checksum_not_recorded'],
    ['sha256sum --check app-debug.apk.sha256', 'android_inner_checksum_not_verified'],
    ['mobile/shop_pos/build/app/outputs/flutter-apk/app-debug.apk.sha256', 'android_checksum_not_retained'],
    ['name: Reject unsigned Android release packaging', 'android_release_negative_gate_missing'],
    ["grep -F 'shop_android_release_signing_unavailable'", 'android_release_failure_marker_not_verified'],
    ["./gradlew build --console=plain", 'android_aggregate_release_gate_not_tested'],
    ["find build/app/outputs/flutter-apk -maxdepth 1 -name 'app-release*.apk'", 'android_release_artifact_absence_not_verified'],
    ["trap 'result=$?; cleanup_release_outputs || result=1; trap - EXIT; exit \"$result\"' EXIT", 'android_release_artifact_cleanup_not_always_run'],
    ['name: supermega-shop-windows-unsigned-${{ github.sha }}', 'windows_artifact_not_explicitly_unsigned'],
    ["Get-FileHash -Algorithm SHA256 -LiteralPath $packagePath", 'windows_inner_checksum_not_recorded'],
    ["if ($recordedChecksum -cne $expectedChecksum)", 'windows_inner_checksum_not_verified'],
    ['supermega-shop-windows-unsigned.zip.sha256', 'windows_checksum_not_retained'],
    ['Build iOS app without signing', 'ios_no_codesign_boundary_missing'],
    ['flutter build ios --debug --no-codesign --no-pub', 'ios_no_codesign_command_missing'],
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
    /^\s+mobile\/shop_pos\/build\/app\/outputs\/flutter-apk\/app-debug\.apk\s*$/m,
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
    'sha256sum --check app-debug.apk.sha256',
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
  if (
    retainedArtifactCount !== 3 ||
    launchWindowRetentionCount !== retainedArtifactCount
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
    failures,
  }
}

async function main() {
  const source = await readFile(WORKFLOW_PATH, 'utf8')
  const result = verifyShopNativeCiContract(source)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (!result.ok) process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
