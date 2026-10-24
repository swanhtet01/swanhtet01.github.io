import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import { assessShopQaIsolationContract } from './verify_shop_qa_isolation_contract.mjs'

function workflowFixture() {
  const qa = '--dart-define=SHOP_RUNTIME_PROFILE=synthetic_qa_v1 --dart-define=SHOP_QA_PROFILE_ID=synthetic-qa-v1'
  const artifactSteps = (artifact, checksum = `sha256sum ${artifact} > ${artifact}.sha256`) => `
      - name: Verify QA artifact
        run: |
          ${checksum}
          echo "source-sha=\${{ github.sha }} sha-256=$(cat ${artifact}.sha256) promotion-ineligible" > ${artifact}.manifest
      - name: Upload synthetic QA evidence
        uses: actions/upload-artifact@v4
        with:
          name: synthetic-qa-promotion-ineligible-\${{ github.sha }}-sha-256
          path: |
            ${artifact}
            ${artifact}.sha256
            ${artifact}.manifest`
  const inspections = Object.freeze({
    android: `
      - name: Inspect Android QA identity
        run: |
          test "$(apkanalyzer manifest application-id app-qa-debug.apk)" = 'dev.supermega.supermega_shop.qa'
          apkanalyzer manifest print app-qa-debug.apk | grep -F 'android:label="Shop QA"'`,
    ios: `
      - name: Inspect iOS QA identity
        run: |
          info='build/ios/iphoneos/Runner.app/Info.plist'
          test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$info")" = 'dev.supermega.supermegaShop.qa'
          test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleDisplayName' "$info")" = 'Shop QA'
          test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleName' "$info")" = 'Shop QA'`,
    windows: `
      - name: Inspect Windows QA identity
        run: |
          $identity = (Get-Item supermega_shop_qa.exe).VersionInfo
          if ($identity.ProductName -cne 'Shop QA' -or $identity.FileDescription -cne 'Shop QA' -or $identity.InternalName -cne 'supermega_shop_qa' -or $identity.OriginalFilename -cne 'supermega_shop_qa.exe') { throw 'mismatch' }
      - name: Package full Windows QA runtime
        run: Compress-Archive -Path $releaseDirectory -DestinationPath $packagePath`,
  })
  return `jobs:
  android-production:
    steps:
      - name: Generate Android production identity
        run: node tools/generate_shop_build_identity.mjs --platform android --profile production
      - name: Build Android production comparison
        run: flutter build apk --debug --no-pub --flavor production
  android-qa:
    steps:
      - name: Generate Android QA identity
        run: node tools/generate_shop_build_identity.mjs --platform android --profile synthetic_qa_v1
      - name: Build Android QA
        run: flutter build apk --debug --no-pub --flavor qa ${qa}
${inspections.android}
${artifactSteps('app-qa-debug.apk')}
  ios-production:
    steps:
      - name: Generate iOS production identity
        run: node tools/generate_shop_build_identity.mjs --platform ios --profile production
      - name: Build iOS production comparison
        run: flutter build ios --debug --no-codesign --no-pub
  ios-qa:
    steps:
      - name: Generate iOS QA identity
        run: node tools/generate_shop_build_identity.mjs --platform ios --profile synthetic_qa_v1
      - name: Build iOS QA
        run: flutter build ios --debug --no-codesign --no-pub --flavor qa ${qa}
${inspections.ios}
${artifactSteps('Runner.app.zip')}
  windows-production:
    steps:
      - name: Generate Windows production identity
        run: node tools/generate_shop_build_identity.mjs --platform windows --profile production
      - name: Build Windows production comparison
        run: flutter build windows --release --no-pub
  windows-qa:
    steps:
      - name: Generate Windows QA identity
        run: node tools/generate_shop_build_identity.mjs --platform windows --profile synthetic_qa_v1
      - name: Configure Windows QA runner
        run: ./mobile/shop_pos/scripts/configure_windows_qa_runner.ps1
      - name: Build Windows QA
        run: flutter build windows --release --no-pub ${qa}
${inspections.windows}
${artifactSteps('supermega-shop-windows-qa.zip', `$artifact = 'supermega-shop-windows-qa.zip'; $digest = (Get-FileHash -Algorithm SHA256 -LiteralPath $artifact).Hash.ToLowerInvariant(); "$digest  $artifact" | Set-Content supermega-shop-windows-qa.zip.sha256; if ($recorded -cne $expected) { throw "mismatch" }`)}
`
}

function fixture() {
  return {
    'mobile/shop_pos/android/app/build.gradle.kts': 'applicationId = "dev.supermega.supermega_shop"\ncreate("production") create("qa") synthetic_qa_v1 dev.supermega.supermega_shop.qa verifyShopAndroidProductionIdentity verifyShopAndroidQaIdentity preProduction preQa shopBuildIdentityProfile = \'$profile\' shopBuildIdentityQaProfileId = \'$qaProfile\' shopBuildIdentityPlatformIdentity = \'$identity\' shop_android_build_identity_mismatch',
    'mobile/shop_pos/android/app/src/production/AndroidManifest.xml': '<application android:label="Shop"/>',
    'mobile/shop_pos/android/app/src/qa/AndroidManifest.xml': '<application android:label="Shop QA"/>',
    'mobile/shop_pos/ios/Runner.xcodeproj/project.pbxproj': 'PRODUCT_BUNDLE_IDENTIFIER = dev.supermega.supermegaShop;\nPRODUCT_BUNDLE_IDENTIFIER = dev.supermega.supermegaShop;\nPRODUCT_BUNDLE_IDENTIFIER = dev.supermega.supermegaShop;\ndev.supermega.supermegaShop.qa\npath = Runner.app;\nVerify Shop build identity shop_ios_build_identity_missing shop_ios_build_configuration_unknown\nshopBuildIdentityProfile = \'synthetic_qa_v1\' shopBuildIdentityQaProfileId = \'synthetic-qa-v1\' shopBuildIdentityProfile = \'production\' shopBuildIdentityQaProfileId = \'\'\nPRODUCT_NAME = "$(TARGET_NAME)";\nPRODUCT_NAME = "$(TARGET_NAME)";\nPRODUCT_NAME = "$(TARGET_NAME)";\nPRODUCT_NAME = "$(TARGET_NAME)";\nPRODUCT_NAME = "$(TARGET_NAME)";\nPRODUCT_NAME = "$(TARGET_NAME)";',
    'mobile/shop_pos/lib/main.dart': 'Future<void> main() async { final runtimeProfile = ShopRuntimeProfile.resolve(); final runtimeScope = await ShopRuntimeScope.resolve(runtimeProfile); if (!runtimeScope.capabilities.managedAuth) return; if (!runtimeScope.capabilities.camera) return; }',
    'mobile/shop_pos/lib/shop_database.dart': "privateDatabaseFile() => 'supermega_shop.sqlite';",
    'mobile/shop_pos/lib/shop_startup.dart': 'ShopRuntimeScope scope; void pick() { if (!scope.capabilities.externalFileSaving) return; }',
    'mobile/shop_pos/lib/shop_backup_export_screen.dart': 'ShopRuntimeScope scope; void save() { if (!scope.capabilities.externalFileSaving) return; }',
    'mobile/shop_pos/lib/printer_services.dart': 'ShopRuntimeScope scope; void connect() { if (!scope.capabilities.networkPrinter) return; }',
    'mobile/shop_pos/lib/printer_setup_screen.dart': 'ShopRuntimeScope scope; void discover() { if (!scope.capabilities.networkPrinter) return; }',
    'mobile/shop_pos/lib/menu_import_screen.dart': 'ShopRuntimeScope scope; void pick() { if (!scope.capabilities.gallery) return; }',
    'mobile/shop_pos/lib/menu_import_service.dart': 'ShopRuntimeScope scope; void importRemote() { if (!scope.capabilities.remoteImport) return; }',
    'mobile/shop_pos/lib/camera_barcode_scanner.dart': 'ShopRuntimeScope scope; void scan() { if (!scope.capabilities.camera) return; }',
    'mobile/shop_pos/lib/connected_orders_service.dart': 'ShopRuntimeScope scope; void connect() { if (!scope.capabilities.connectedOrders) return; }',
    'mobile/shop_pos/lib/shop_correction_authorization_service.dart': 'ShopRuntimeScope scope; void correct() { if (!scope.capabilities.correctionAuthorization) return; }',
    'mobile/shop_pos/lib/shop_runtime_profile.dart': "enum ShopRuntimeProfile { production, syntheticQa } class ShopRuntimeCapabilities { static const failClosed = ShopRuntimeCapabilities(); const ShopRuntimeCapabilities(); } ShopRuntimeProfile resolve() { const a=String.fromEnvironment('SHOP_RUNTIME_PROFILE', defaultValue: shopBuildIdentityProfile); const b=String.fromEnvironment('SHOP_QA_PROFILE_ID', defaultValue: shopBuildIdentityQaProfileId); const ids={'dev.supermega.supermega_shop.qa','dev.supermega.supermegaShop.qa','dev.supermega.supermega_shop.qa.windows','production-current','dev.supermega.supermega_shop','dev.supermega.supermegaShop','dev.supermega.supermega_shop.windows'}; if (a=='synthetic_qa_v1' && b=='synthetic-qa-v1') return ShopRuntimeProfile.syntheticQa; if (a.isNotEmpty || b.isNotEmpty) throw StateError('unknown partial'); return ShopRuntimeProfile.production; }",
    'mobile/shop_pos/lib/shop_runtime_scope.dart': "ShopRuntimeScope? requireShopRuntimeScopeOrTestSeam(ShopRuntimeScope? scope) { if (scope == null) throw StateError('shop_runtime_scope_required'); return scope; } class ShopRuntimeScope { static Future<ShopRuntimeScope> resolve(p) async { SharedPreferences.getInstance(); getApplicationSupportDirectory(); getTemporaryDirectory(); return ShopRuntimeScope(); } } synthetic-evidence sentinel shop_locale_myanmar shop_pending_picker_intent shop_receipt_printer_host_v1 shop_receipt_paper_width_v1",
    'mobile/shop_pos/lib/shop_build_identity.g.dart': 'synthetic_qa_v1 platform',
    'tools/generate_shop_build_identity.mjs': 'production synthetic_qa_v1 windows',
    'mobile/shop_pos/scripts/configure_windows_qa_runner.ps1': 'supermega_shop_qa.exe Shop QA',
    'mobile/shop_pos/ios/Runner.xcodeproj/xcshareddata/xcschemes/qa.xcscheme': '<TestAction buildConfiguration="Debug-qa"/><LaunchAction buildConfiguration="Debug-qa"/><ProfileAction buildConfiguration="Debug-qa"/><AnalyzeAction buildConfiguration="Debug-qa"/><ArchiveAction buildConfiguration="Debug-qa"/>',
    'mobile/shop_pos/ios/Runner/Info.plist': '<string>$(SHOP_DISPLAY_NAME)</string><string>$(SHOP_BUNDLE_NAME)</string>',
    'mobile/shop_pos/ios/Flutter/Debug.xcconfig': 'SHOP_DISPLAY_NAME=Shop\nSHOP_BUNDLE_NAME=supermega_shop',
    'mobile/shop_pos/ios/Flutter/Release.xcconfig': 'SHOP_DISPLAY_NAME=Shop\nSHOP_BUNDLE_NAME=supermega_shop',
    'mobile/shop_pos/ios/Flutter/QA.xcconfig': 'PRODUCT_BUNDLE_IDENTIFIER=dev.supermega.supermegaShop.qa\nSHOP_DISPLAY_NAME=Shop QA\nSHOP_BUNDLE_NAME=Shop QA',
    '.github/workflows/shop-native-ci.yml': workflowFixture(),
  }
}

test('a complete source contract remains source-only and not launch authority', () => {
  const result = assessShopQaIsolationContract({ sources: fixture() })
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(result.strictReady, true, JSON.stringify(result))
  assert.equal(result.evidenceLevel, 'source')
  assert.equal(result.artifactIdentityVerified, false)
  assert.equal(result.installedIsolationVerified, false)
  assert.equal(result.launchAuthorized, false)
})

test('missing existing sources and production identity or storage drift fail closed', () => {
  const missing = fixture(); delete missing['mobile/shop_pos/lib/main.dart']
  assert.equal(assessShopQaIsolationContract({ sources: missing }).ok, false)
  for (const [path, token] of [
    ['mobile/shop_pos/android/app/build.gradle.kts', 'dev.supermega.supermega_shop'],
    ['mobile/shop_pos/ios/Runner.xcodeproj/project.pbxproj', 'dev.supermega.supermegaShop'],
    ['mobile/shop_pos/lib/shop_database.dart', 'supermega_shop.sqlite'],
    ['mobile/shop_pos/lib/shop_runtime_scope.dart', 'shop_locale_myanmar'],
  ]) {
    const sources = fixture(); sources[path] = sources[path].replace(token, 'drifted')
    assert.equal(assessShopQaIsolationContract({ sources }).ok, false, `${path}:${token}`)
  }
})

test('a new unreviewed Dart I/O callsite fails even in audit mode', () => {
  for (const token of ['SharedPreferences.getInstance', 'getApplicationDocumentsDirectory', 'getApplicationSupportDirectory', 'Supabase.initialize', 'ImagePicker(', 'MobileScanner(', 'FileSaver.instance.saveAs', 'Socket.connect', 'PrinterDiscoveryService(', 'http.Client(', 'PrinterManager(']) {
    const sources = fixture()
    sources['mobile/shop_pos/lib/new_path.dart'] = `void unsafe() { ${token}; }`
    const result = assessShopQaIsolationContract({ sources })
    assert.equal(result.ok, false, token)
    assert.ok(result.fatal.some(item => item.code === 'new_unsafe_io_callsite'), token)
  }
})

test('strict rejects retained legacy direct I/O even below audit ceilings', () => {
  const sources = fixture()
  sources['mobile/shop_pos/lib/main.dart'] += ' SharedPreferences.getInstance();'
  const result = assessShopQaIsolationContract({ sources })
  assert.equal(result.ok, true)
  assert.equal(result.strictReady, false)
  assert.ok(result.blockers.some(item => item.code === 'legacy_direct_io_not_scoped'))
})

test('partial profiles, late validation, and missing service guards stay blocked', () => {
  for (const mutate of [
    sources => { sources['mobile/shop_pos/lib/shop_runtime_profile.dart'] = 'SHOP_RUNTIME_PROFILE synthetic_qa_v1' },
    sources => { sources['mobile/shop_pos/lib/main.dart'] = 'SharedPreferences.getInstance(); ShopRuntimeProfile.resolve();' },
    sources => { sources['mobile/shop_pos/lib/camera_barcode_scanner.dart'] = 'class Camera {}' },
    sources => { delete sources['mobile/shop_pos/lib/shop_runtime_scope.dart'] },
  ]) {
    const sources = fixture(); mutate(sources)
    const result = assessShopQaIsolationContract({ sources })
    assert.equal(result.strictReady, false)
  }
})

test('comment-only and guard-after-I/O markers do not satisfy service boundaries', () => {
  const commentOnly = fixture()
  commentOnly['mobile/shop_pos/lib/camera_barcode_scanner.dart'] = '// ShopRuntimeScope camera\nMobileScanner();'
  assert.equal(assessShopQaIsolationContract({ sources: commentOnly }).strictReady, false)
  const late = fixture()
  late['mobile/shop_pos/lib/camera_barcode_scanner.dart'] = 'MobileScanner(); ShopRuntimeScope scope; var camera;'
  assert.equal(assessShopQaIsolationContract({ sources: late }).strictReady, false)
})

test('no-op guards and allowed-path dangerous calls cannot make strict pass', () => {
  const sources = fixture()
  sources['mobile/shop_pos/lib/main.dart'] += ' Supabase.initialize(); ImagePicker();'
  sources['mobile/shop_pos/lib/printer_services.dart'] = 'PrinterManager(); NetworkInfo(); ShopRuntimeScope scope; if (!scope.capabilities.networkPrinter) {} Socket.connect();'
  sources['mobile/shop_pos/lib/camera_barcode_scanner.dart'] = 'ShopRuntimeScope scope; if (!scope.capabilities.camera) {} MobileScanner();'
  const result = assessShopQaIsolationContract({ sources })
  assert.equal(result.ok, true)
  assert.equal(result.strictReady, false)
  assert.ok(result.blockers.some(item => item.code === 'dangerous_primitive_not_terminated'))
})

test('a terminating guard in another callable cannot authorize device I/O', () => {
  const sources = fixture()
  sources['mobile/shop_pos/lib/camera_barcode_scanner.dart'] = 'ShopRuntimeScope scope; void decoy() { if (!scope.capabilities.camera) return; } void scan() { MobileScanner(); }'
  const result = assessShopQaIsolationContract({ sources })
  assert.equal(result.ok, true)
  assert.equal(result.strictReady, false)
  assert.ok(result.blockers.some(item => item.code === 'dangerous_primitive_not_terminated'))
})

test('printer setup construction and every environment value type are guarded', () => {
  const printer = fixture()
  printer['mobile/shop_pos/lib/printer_setup_screen.dart'] += ' void unsafe() { PrinterDiscoveryService(); }'
  assert.equal(assessShopQaIsolationContract({ sources: printer }).strictReady, false)
  for (const expression of ["int.fromEnvironment('SHOP_ESCAPE')", "bool.hasEnvironment('SHOP_ESCAPE')"]) {
    const sources = fixture(); sources['mobile/shop_pos/lib/main.dart'] += ` ${expression};`
    assert.equal(assessShopQaIsolationContract({ sources }).ok, false, expression)
  }
})

test('external-I/O overrides and provider values in QA commands are fatal', () => {
  const override = fixture(); override['mobile/shop_pos/lib/shop_runtime_profile.dart'] += ' ALLOW_EXTERNAL_IO'
  assert.equal(assessShopQaIsolationContract({ sources: override }).ok, false)
  const provider = fixture()
  provider['.github/workflows/shop-native-ci.yml'] = workflowFixture().replace(
    'run: node tools/generate_shop_build_identity.mjs --platform android --profile production',
    'run: SUPABASE_URL=https://provider.invalid node tools/generate_shop_build_identity.mjs --platform android --profile production',
  )
  assert.equal(assessShopQaIsolationContract({ sources: provider }).ok, false)
})

test('unknown build defines and comment-only production identities fail closed', () => {
  const unknown = fixture()
  unknown['mobile/shop_pos/lib/main.dart'] += " const bad=String.fromEnvironment('UNREVIEWED_FLAG');"
  assert.equal(assessShopQaIsolationContract({ sources: unknown }).ok, false)
  const commented = fixture()
  commented['mobile/shop_pos/android/app/build.gradle.kts'] = '// applicationId = "dev.supermega.supermega_shop"\ncreate("production") create("qa")'
  assert.equal(assessShopQaIsolationContract({ sources: commented }).ok, false)
})

test('exact platform identity and artifact contracts cannot be replaced by loose labels', () => {
  for (const path of [
    'mobile/shop_pos/android/app/build.gradle.kts',
    'mobile/shop_pos/android/app/src/qa/AndroidManifest.xml',
    'mobile/shop_pos/ios/Runner.xcodeproj/project.pbxproj',
    'mobile/shop_pos/ios/Runner.xcodeproj/xcshareddata/xcschemes/qa.xcscheme',
    'mobile/shop_pos/ios/Runner/Info.plist',
    'mobile/shop_pos/ios/Flutter/Debug.xcconfig',
    'mobile/shop_pos/ios/Flutter/Release.xcconfig',
    'mobile/shop_pos/ios/Flutter/QA.xcconfig',
    'mobile/shop_pos/scripts/configure_windows_qa_runner.ps1',
    'tools/generate_shop_build_identity.mjs',
  ]) {
    const sources = fixture(); sources[path] = 'unrelated text'
    assert.equal(assessShopQaIsolationContract({ sources }).strictReady, false, path)
  }

  const mixedIosScheme = fixture()
  mixedIosScheme['mobile/shop_pos/ios/Runner.xcodeproj/xcshareddata/xcschemes/qa.xcscheme'] =
    '<TestAction buildConfiguration="Debug"/><LaunchAction buildConfiguration="Debug-qa"/><ProfileAction buildConfiguration="Profile"/><AnalyzeAction buildConfiguration="Debug-qa"/><ArchiveAction buildConfiguration="Release"/>'
  assert.equal(
    assessShopQaIsolationContract({ sources: mixedIosScheme }).strictReady,
    false,
    'QA scheme must not fall back to production configurations',
  )

  const productionWidgetDefault = fixture()
  productionWidgetDefault['mobile/shop_pos/lib/main.dart'] +=
    ' ShopRuntimeCapabilities runtimeCapabilities = ShopRuntimeCapabilities.production;'
  assert.equal(
    assessShopQaIsolationContract({ sources: productionWidgetDefault }).strictReady,
    false,
    'missing runtime scope must not silently inherit production capabilities',
  )

  const missingScopeGuard = fixture()
  missingScopeGuard['mobile/shop_pos/lib/shop_runtime_scope.dart'] =
    missingScopeGuard['mobile/shop_pos/lib/shop_runtime_scope.dart'].replace(
      'requireShopRuntimeScopeOrTestSeam',
      'unguardedOptionalScope',
    )
  assert.equal(
    assessShopQaIsolationContract({ sources: missingScopeGuard }).strictReady,
    false,
    'missing runtime scope must have a fail-closed guard or explicit test seam',
  )

  for (const token of [
    'manifest application-id app-qa-debug.apk',
    "info='build/ios/iphoneos/Runner.app/Info.plist'",
    'Print :CFBundleIdentifier',
    "$identity.ProductName -cne 'Shop QA'",
    'Compress-Archive -Path $releaseDirectory -DestinationPath $packagePath',
    '"$digest  $artifact"',
  ]) {
    const sources = fixture()
    sources['.github/workflows/shop-native-ci.yml'] =
      sources['.github/workflows/shop-native-ci.yml'].replace(token, 'identity-check-omitted')
    assert.equal(
      assessShopQaIsolationContract({ sources }).strictReady,
      false,
      `post-build contract must require ${token}`,
    )
  }
})

test('wrong artifact tuple remains blocked without upgrading evidence', () => {
  const sources = fixture()
  sources['.github/workflows/shop-native-ci.yml'] = 'qa-output SHOP_RUNTIME_PROFILE=production source-sha sha-256'
  const result = assessShopQaIsolationContract({ sources })
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(result.strictReady, false)
  assert.equal(result.artifactIdentityVerified, false)
  assert.equal(result.launchAuthorized, false)
})

test('workflow tokens outside executable jobs and run blocks cannot make strict pass', () => {
  for (const workflow of [
    '# synthetic-qa SHOP_RUNTIME_PROFILE=synthetic_qa_v1 SHOP_QA_PROFILE_ID=synthetic-qa-v1\n# flutter build apk --debug --no-pub --flavor qa\n# source-sha sha-256 promotion-ineligible',
    'name: token-only\nenv:\n  NOTE: "synthetic-qa flutter build source-sha sha-256 promotion-ineligible"',
    workflowFixture().replace('run: flutter build apk --debug --no-pub --flavor qa', 'name: flutter build apk --debug --no-pub --flavor qa'),
  ]) {
    const sources = fixture(); sources['.github/workflows/shop-native-ci.yml'] = workflow
    const result = assessShopQaIsolationContract({ sources })
    assert.equal(result.strictReady, false, JSON.stringify(result))
    assert.ok(result.blockers.some(item => item.code === 'qa_build_contract_missing'))
  }
})

test('wrong workflow job, command order, flavor, or QA define fails closed', () => {
  for (const mutate of [
    workflow => workflow.replace('android-qa:', 'mobile-qa:'),
    workflow => workflow.replace(
      'run: node tools/generate_shop_build_identity.mjs --platform android --profile synthetic_qa_v1\n      - name: Build Android QA',
      'run: echo generated-too-late\n      - name: Build Android QA',
    ),
    workflow => workflow.replace('--flavor qa --dart-define=SHOP_RUNTIME_PROFILE', '--flavor production --dart-define=SHOP_RUNTIME_PROFILE'),
    workflow => workflow.replace('--dart-define=SHOP_QA_PROFILE_ID=synthetic-qa-v1', '--dart-define=SHOP_QA_PROFILE_ID=wrong'),
    workflow => workflow
      .replace('run: node tools/generate_shop_build_identity.mjs --platform android --profile synthetic_qa_v1', 'run: true')
      .replace(' --dart-define=SHOP_RUNTIME_PROFILE=synthetic_qa_v1 --dart-define=SHOP_QA_PROFILE_ID=synthetic-qa-v1', ''),
    workflow => workflow.replace('echo "source-sha=${{ github.sha }} sha-256=$(cat app-qa-debug.apk.sha256) promotion-ineligible"', 'echo "source-sha=${{ github.sha }} sha-256 promotion-ineligible"'),
    workflow => workflow.replace(
      'path: |\n            app-qa-debug.apk\n            app-qa-debug.apk.sha256\n            app-qa-debug.apk.manifest',
      'path: |\n            unrelated.apk\n            unrelated.apk.sha256\n            unrelated.apk.manifest',
    ),
    workflow => workflow.replace(/^  android-production:/m, '  android:').replace(/^  android-qa:\n    steps:\n/m, ''),
  ]) {
    const sources = fixture(); sources['.github/workflows/shop-native-ci.yml'] = mutate(workflowFixture())
    const result = assessShopQaIsolationContract({ sources })
    assert.equal(result.strictReady, false, JSON.stringify(result))
    assert.ok(result.blockers.some(item => item.code === 'qa_build_contract_missing'))
  }
})

test('disabled, error-tolerant, or non-executing required jobs and steps fail closed', () => {
  for (const mutate of [
    workflow => workflow.replace('  android-qa:\n    steps:', '  android-qa:\n    if: ${{ false }}\n    steps:'),
    workflow => `jobs:\n  gate:\n    if: \${{ false }}\n    steps:\n      - run: echo skipped\n${workflow.replace(/^jobs:\n/, '').replace('  android-production:\n    steps:', '  android-production:\n    needs: gate\n    steps:')}`,
    workflow => workflow.replace('      - name: Build Android QA\n        run:', '      - name: Build Android QA\n        if: ${{ false }}\n        run:'),
    workflow => workflow.replace('      - name: Build Android QA\n        run:', '      - name: Build Android QA\n        continue-on-error: true\n        run:'),
    workflow => workflow.replace('      - name: Build Android QA\n        run:', '      - name: Build Android QA\n        continue-on-error: ${{ true }}\n        run:'),
    workflow => workflow.replace('      - name: Build Android QA\n        run:', '      - name: Build Android QA\n        shell: echo {0}\n        run:'),
    workflow => `defaults:\n  run:\n    shell: echo {0}\n${workflow}`,
  ]) {
    const sources = fixture(); sources['.github/workflows/shop-native-ci.yml'] = mutate(workflowFixture())
    assert.equal(assessShopQaIsolationContract({ sources }).strictReady, false)
  }
})

test('foreign upload action and artifact-name substrings do not bind evidence', () => {
  for (const mutate of [
    workflow => workflow.replace('uses: actions/upload-artifact@v4', 'uses: attacker/actions/upload-artifact@v4'),
    workflow => workflow.replace('            app-qa-debug.apk\n', '            prefix-app-qa-debug.apk-suffix\n'),
  ]) {
    const sources = fixture(); sources['.github/workflows/shop-native-ci.yml'] = mutate(workflowFixture())
    assert.equal(assessShopQaIsolationContract({ sources }).strictReady, false)
  }
})

test('YAML environment provider values are fatal even without shell assignment syntax', () => {
  for (const entry of [
    'SUPABASE_URL: https://provider.invalid',
    '"SUPABASE_URL": https://provider.invalid',
    "'SUPABASE_URL': https://provider.invalid",
    'SUPABASE_PUBLISHABLE_KEY: injected',
    'SHOP_API_BASE_URL: https://api.invalid',
  ]) {
    const sources = fixture()
    sources['.github/workflows/shop-native-ci.yml'] = `env:\n  ${entry}\n${workflowFixture()}`
    const result = assessShopQaIsolationContract({ sources })
    assert.equal(result.ok, false, entry)
    assert.ok(result.fatal.some(item => item.code === 'qa_build_provider_value_forbidden'))
  }
  const inline = fixture()
  inline['.github/workflows/shop-native-ci.yml'] = `env: { SUPABASE_URL: https://provider.invalid }\n${workflowFixture()}`
  assert.equal(assessShopQaIsolationContract({ sources: inline }).ok, false)

  const descriptive = fixture()
  descriptive['.github/workflows/shop-native-ci.yml'] = `${workflowFixture()}\n# SUPABASE_URL: comments are not values\n`
  assert.equal(assessShopQaIsolationContract({ sources: descriptive }).ok, true)
})

test('repository CLI reports source readiness without granting launch authority', () => {
  const script = new URL('./verify_shop_qa_isolation_contract.mjs', import.meta.url)
  const audit = spawnSync(process.execPath, [script.pathname, '--audit'], { encoding: 'utf8' })
  assert.equal(audit.status, 0, audit.stderr)
  assert.equal(JSON.parse(audit.stdout).strictReady, true)
  const strict = spawnSync(process.execPath, [script.pathname, '--strict'], { encoding: 'utf8' })
  assert.equal(strict.status, 0, strict.stderr)
  assert.equal(JSON.parse(strict.stdout).launchAuthorized, false)
  assert.equal(JSON.parse(strict.stdout).artifactIdentityVerified, false)
  assert.equal(JSON.parse(strict.stdout).installedIsolationVerified, false)
})
