import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { assessShopNativeReleasePreflight } from './verify_shop_native_release_preflight.mjs'

const actual = {
  androidGradle: await readFile('mobile/shop_pos/android/app/build.gradle.kts', 'utf8'),
  pubspec: await readFile('mobile/shop_pos/pubspec.yaml', 'utf8'),
  iosProject: await readFile('mobile/shop_pos/ios/Runner.xcodeproj/project.pbxproj', 'utf8'),
  metadata: null,
  windowsContract: null,
}
const DEFAULT_ANDROID_ID_FOR_TEST = 'dev.supermega.supermega_shop'

test('current source blocks distribution without owner-approved release metadata', () => {
  const result = assessShopNativeReleasePreflight(actual)
  assert.equal(result.ok, true)
  assert.equal(result.ready, false)
  assert.equal(result.status, 'blocked')
  assert.equal(result.androidReleaseUsesDebugSigning, false)
  assert.equal(result.androidReleaseCredentialGate, true)
  assert.equal(result.releaseArtifactAuthorized, false)
  assert.equal(result.runtimeSigningProofRequired, true)
  assert.ok(result.blockers.includes('windows_release_implementation_contract_missing'))
  assert.ok(result.blockers.includes('release_version_unapproved_default'))
  assert.ok(result.blockers.includes('release_metadata_not_approved'))
})

test('Android debug signing or an incomplete credential gate fails closed', () => {
  const debugSigned = assessShopNativeReleasePreflight({
    ...actual,
    androidGradle: `${actual.androidGradle}\nsigningConfig = signingConfigs.getByName("debug")`,
  })
  assert.ok(debugSigned.blockers.includes('android_release_uses_debug_signing'))

  const missingGate = assessShopNativeReleasePreflight({
    ...actual,
    androidGradle: actual.androidGradle.replace('shop_android_release_signing_unavailable', 'release unavailable'),
  })
  assert.ok(missingGate.blockers.includes('android_release_missing_fail_closed_gate'))

  const commentOnlyGate = assessShopNativeReleasePreflight({
    ...actual,
    androidGradle: actual.androidGradle.replace(
      'throw GradleException("shop_android_release_signing_unavailable")',
      '// shop_android_release_signing_unavailable',
    ),
  })
  assert.ok(commentOnlyGate.blockers.includes('android_release_missing_fail_closed_gate'))

  const missingKeystoreGate = assessShopNativeReleasePreflight({
    ...actual,
    androidGradle: actual.androidGradle.replace(
      'throw GradleException("shop_android_release_keystore_unavailable")',
      '// shop_android_release_keystore_unavailable',
    ),
  })
  assert.ok(missingKeystoreGate.blockers.includes('android_release_keystore_file_gate_missing'))

  const requestNameOnly = assessShopNativeReleasePreflight({
    ...actual,
    androidGradle: actual.androidGradle.replace('gradle.taskGraph.whenReady', 'gradle.startParameter.taskNames.any'),
  })
  assert.ok(requestNameOnly.blockers.includes('android_release_gate_not_bound_to_resolved_task_graph'))

  for (const property of [
    'SHOP_ANDROID_KEYSTORE_PATH',
    'SHOP_ANDROID_KEY_ALIAS',
    'SHOP_ANDROID_STORE_PASSWORD',
    'SHOP_ANDROID_KEY_PASSWORD',
  ]) {
    const missingProperty = assessShopNativeReleasePreflight({
      ...actual,
      androidGradle: actual.androidGradle.replaceAll(property, `REMOVED_${property}`),
    })
    assert.ok(missingProperty.blockers.includes(`android_release_property_missing:${property}`))

    const commentOnlyProperty = assessShopNativeReleasePreflight({
      ...actual,
      androidGradle: actual.androidGradle.replace(
        new RegExp(`^.*providers\\.gradleProperty\\("${property}"\\).*$`, 'm'),
        `// ${property}`,
      ),
    })
    assert.ok(commentOnlyProperty.blockers.includes(`android_release_property_missing:${property}`))
  }
})

test('partial and placeholder approvals cannot authorize release packaging', () => {
  const result = assessShopNativeReleasePreflight({
    ...actual,
    metadata: {
      approved: true,
      androidApplicationId: 'TODO',
      iosBundleId: 'example.bundle',
      iosDevelopmentTeam: 'TBD',
      iosDistributionMethod: 'development',
      version: '1.0.0+1',
      windowsInstallerFormat: 'zip',
      windowsPublisherIdentityRef: 'placeholder',
      windowsUpdateStrategy: '',
      windowsRollbackStrategy: '',
    },
  })
  assert.equal(result.ready, false)
  assert.ok(result.blockers.length >= 8)
})

test('complete approved metadata can satisfy the source-only preflight without exposing secrets', () => {
  const androidGradle = actual.androidGradle.replaceAll(DEFAULT_ANDROID_ID_FOR_TEST, 'dev.supermega.shop')
  const pubspec = actual.pubspec.replace('version: 1.0.0+1', 'version: 1.2.0+42')
  const iosProject = actual.iosProject.replaceAll('dev.supermega.supermegaShop', 'dev.supermega.shop')
    .replace('PRODUCT_BUNDLE_IDENTIFIER = dev.supermega.shop;', 'PRODUCT_BUNDLE_IDENTIFIER = dev.supermega.shop;\n\t\t\t\tDEVELOPMENT_TEAM = owner-approved-team;')
  const result = assessShopNativeReleasePreflight({
    androidGradle,
    pubspec,
    iosProject,
    metadata: {
      approved: true,
      androidApplicationId: 'dev.supermega.shop',
      iosBundleId: 'dev.supermega.shop',
      iosDevelopmentTeam: 'owner-approved-team',
      iosDistributionMethod: 'app-store',
      version: '1.2.0+42',
      windowsInstallerFormat: 'msix',
      windowsPublisherIdentityRef: 'owner-approved-publisher',
      windowsUpdateStrategy: 'signed channel with monotonic versions',
      windowsRollbackStrategy: 'retain prior signed installer',
    },
    windowsContract: {
      approved: true,
      installerFormat: 'msix',
      publisherIdentityRef: 'owner-approved-publisher',
      updateStrategy: 'signed channel with monotonic versions',
      rollbackStrategy: 'retain prior signed installer',
    },
  })
  assert.equal(result.ok, true)
  assert.equal(result.ready, true)
  assert.equal(result.sourcePreparationComplete, true)
  assert.equal(result.releaseArtifactAuthorized, false)
  assert.deepEqual(result.blockers, [])
  assert.doesNotMatch(JSON.stringify(result), /password|keystore/i)
})

