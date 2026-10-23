import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { verifyShopNativeCiContract } from './verify_shop_native_ci_contract.mjs'

const workflow = await readFile('.github/workflows/shop-native-ci.yml', 'utf8')

test('native CI retains checksums for the actual Android and Windows QA files', () => {
  const result = verifyShopNativeCiContract(workflow)
  assert.deepEqual(result.failures, [])
  assert.equal(result.ok, true)
  assert.equal(result.androidArtifactKind, 'debug')
  assert.equal(result.androidReleaseArtifactRetained, false)
  assert.equal(result.windowsArtifactKind, 'unsigned')
  assert.equal(result.iosArtifactRetained, false)
  assert.equal(result.minimumRetentionDays, 14)
})

test('missing or unverified Android checksum fails closed', () => {
  const missing = verifyShopNativeCiContract(
    workflow.replace('sha256sum app-debug.apk > app-debug.apk.sha256', 'true'),
  )
  assert.ok(missing.failures.includes('android_inner_checksum_not_recorded'))

  const unchecked = verifyShopNativeCiContract(
    workflow.replace('sha256sum --check app-debug.apk.sha256', 'true'),
  )
  assert.ok(unchecked.failures.includes('android_inner_checksum_not_verified'))

  const binaryMissing = verifyShopNativeCiContract(
    workflow.replace(/^\s+mobile\/shop_pos\/build\/app\/outputs\/flutter-apk\/app-debug\.apk\s*$/m, ''),
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
