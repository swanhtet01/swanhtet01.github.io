import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import { assessShopQaIsolationContract } from './verify_shop_qa_isolation_contract.mjs'

function fixture() {
  return {
    'mobile/shop_pos/android/app/build.gradle.kts': 'applicationId = "dev.supermega.supermega_shop"\ncreate("production") create("qa") synthetic_qa_v1 dev.supermega.supermega_shop.qa',
    'mobile/shop_pos/android/app/src/production/AndroidManifest.xml': '<application android:label="Shop"/>',
    'mobile/shop_pos/android/app/src/qa/AndroidManifest.xml': '<application android:label="Shop QA"/>',
    'mobile/shop_pos/ios/Runner.xcodeproj/project.pbxproj': 'PRODUCT_BUNDLE_IDENTIFIER = dev.supermega.supermegaShop;\nPRODUCT_BUNDLE_IDENTIFIER = dev.supermega.supermegaShop;\nPRODUCT_BUNDLE_IDENTIFIER = dev.supermega.supermegaShop;\ndev.supermega.supermegaShop.qa',
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
    'mobile/shop_pos/lib/shop_runtime_profile.dart': "enum ShopRuntimeProfile { production, syntheticQa } ShopRuntimeProfile resolve() { const a=String.fromEnvironment('SHOP_RUNTIME_PROFILE'); const b=String.fromEnvironment('SHOP_QA_PROFILE_ID'); if (a=='synthetic_qa_v1' && b=='synthetic-qa-v1') return ShopRuntimeProfile.syntheticQa; if (a.isNotEmpty || b.isNotEmpty) throw StateError('unknown partial'); return ShopRuntimeProfile.production; }",
    'mobile/shop_pos/lib/shop_runtime_scope.dart': "class ShopRuntimeScope { static Future<ShopRuntimeScope> resolve(p) async { SharedPreferences.getInstance(); getApplicationSupportDirectory(); getTemporaryDirectory(); return ShopRuntimeScope(); } } synthetic-evidence sentinel shop_locale_myanmar shop_pending_picker_intent shop_receipt_printer_host_v1 shop_receipt_paper_width_v1",
    'mobile/shop_pos/lib/shop_build_identity.g.dart': 'synthetic_qa_v1 platform',
    'tools/generate_shop_build_identity.mjs': 'production synthetic_qa_v1 windows',
    'mobile/shop_pos/scripts/configure_windows_qa_runner.ps1': 'supermega_shop_qa.exe Shop QA',
    'mobile/shop_pos/ios/Runner.xcodeproj/xcshareddata/xcschemes/qa.xcscheme': '<Scheme name="QA"/>',
    'mobile/shop_pos/ios/Flutter/QA.xcconfig': 'PRODUCT_BUNDLE_IDENTIFIER=dev.supermega.supermegaShop.qa',
    '.github/workflows/shop-native-ci.yml': 'synthetic-qa SHOP_RUNTIME_PROFILE=synthetic_qa_v1 SHOP_QA_PROFILE_ID=synthetic-qa-v1 source-sha sha-256 promotion-ineligible app-production-debug.apk app-qa-debug.apk',
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
  const provider = fixture(); provider['.github/workflows/shop-native-ci.yml'] += '\nSUPABASE_URL=https://provider.invalid'
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
    'mobile/shop_pos/android/app/src/qa/AndroidManifest.xml',
    'mobile/shop_pos/ios/Runner.xcodeproj/xcshareddata/xcschemes/qa.xcscheme',
    'mobile/shop_pos/ios/Flutter/QA.xcconfig',
    'mobile/shop_pos/scripts/configure_windows_qa_runner.ps1',
    'tools/generate_shop_build_identity.mjs',
  ]) {
    const sources = fixture(); sources[path] = 'unrelated text'
    assert.equal(assessShopQaIsolationContract({ sources }).strictReady, false, path)
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

test('repository CLI keeps audit nonzero-free and strict fail-closed', () => {
  const script = new URL('./verify_shop_qa_isolation_contract.mjs', import.meta.url)
  const audit = spawnSync(process.execPath, [script.pathname, '--audit'], { encoding: 'utf8' })
  assert.equal(audit.status, 0, audit.stderr)
  assert.equal(JSON.parse(audit.stdout).strictReady, false)
  const strict = spawnSync(process.execPath, [script.pathname, '--strict'], { encoding: 'utf8' })
  assert.equal(strict.status, 1)
  assert.equal(JSON.parse(strict.stdout).launchAuthorized, false)
})
