#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises'
import { resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const libRoot = 'mobile/shop_pos/lib'

const requiredExisting = [
  'mobile/shop_pos/android/app/build.gradle.kts',
  'mobile/shop_pos/ios/Runner.xcodeproj/project.pbxproj',
  'mobile/shop_pos/lib/main.dart',
  'mobile/shop_pos/lib/shop_database.dart',
  'mobile/shop_pos/lib/shop_startup.dart',
  'mobile/shop_pos/lib/shop_backup_export_screen.dart',
  'mobile/shop_pos/lib/printer_services.dart',
  'mobile/shop_pos/lib/printer_setup_screen.dart',
  'mobile/shop_pos/lib/menu_import_screen.dart',
  'mobile/shop_pos/lib/menu_import_service.dart',
  'mobile/shop_pos/lib/camera_barcode_scanner.dart',
  'mobile/shop_pos/lib/connected_orders_service.dart',
  'mobile/shop_pos/lib/shop_correction_authorization_service.dart',
  '.github/workflows/shop-native-ci.yml',
]

const implementationFiles = [
  'mobile/shop_pos/lib/shop_runtime_profile.dart',
  'mobile/shop_pos/lib/shop_runtime_scope.dart',
  'mobile/shop_pos/lib/shop_build_identity.g.dart',
  'tools/generate_shop_build_identity.mjs',
  'mobile/shop_pos/scripts/configure_windows_qa_runner.ps1',
  'mobile/shop_pos/android/app/src/production/AndroidManifest.xml',
  'mobile/shop_pos/android/app/src/qa/AndroidManifest.xml',
  'mobile/shop_pos/ios/Runner.xcodeproj/xcshareddata/xcschemes/qa.xcscheme',
  'mobile/shop_pos/ios/Flutter/QA.xcconfig',
]

const currentUnsafeCeilings = new Map([
  ['SharedPreferences.getInstance', new Map([['mobile/shop_pos/lib/main.dart', 4], ['mobile/shop_pos/lib/shop_startup.dart', 1], ['mobile/shop_pos/lib/printer_services.dart', 1], ['mobile/shop_pos/lib/shop_runtime_scope.dart', 1]])],
  ['getApplicationDocumentsDirectory', new Map([['mobile/shop_pos/lib/main.dart', 1], ['mobile/shop_pos/lib/shop_backup_export_screen.dart', 1], ['mobile/shop_pos/lib/shop_runtime_scope.dart', 1]])],
  ['getTemporaryDirectory', new Map([['mobile/shop_pos/lib/shop_startup.dart', 1], ['mobile/shop_pos/lib/shop_backup_export_screen.dart', 1], ['mobile/shop_pos/lib/shop_runtime_scope.dart', 1]])],
  ['getApplicationSupportDirectory', new Map([['mobile/shop_pos/lib/shop_runtime_scope.dart', 1]])],
  ['Supabase.initialize', new Map([['mobile/shop_pos/lib/main.dart', 1]])],
  ['ImagePicker(', new Map([['mobile/shop_pos/lib/main.dart', 2], ['mobile/shop_pos/lib/menu_import_screen.dart', 1]])],
  ['MobileScanner(', new Map([['mobile/shop_pos/lib/camera_barcode_scanner.dart', 1]])],
  ['FileSaver.instance.saveAs', new Map([['mobile/shop_pos/lib/shop_backup_export_screen.dart', 1]])],
  ['openFile(', new Map([['mobile/shop_pos/lib/shop_startup.dart', 1]])],
  ['.post(', new Map([['mobile/shop_pos/lib/menu_import_service.dart', 1]])],
  ['_client.send(', new Map([['mobile/shop_pos/lib/connected_orders_service.dart', 1], ['mobile/shop_pos/lib/shop_correction_authorization_service.dart', 1]])],
  ['NetworkInfo(', new Map([['mobile/shop_pos/lib/printer_services.dart', 3]])],
  ['http.Client(', new Map([['mobile/shop_pos/lib/connected_orders_service.dart', 1], ['mobile/shop_pos/lib/menu_import_service.dart', 1], ['mobile/shop_pos/lib/shop_correction_authorization_service.dart', 1]])],
  ['PrinterManager(', new Map([['mobile/shop_pos/lib/printer_services.dart', 2]])],
  ['Socket.connect', new Map([['mobile/shop_pos/lib/printer_services.dart', 1]])],
  ['PrinterDiscoveryService(', new Map([['mobile/shop_pos/lib/printer_setup_screen.dart', 1], ['mobile/shop_pos/lib/printer_services.dart', 1]])],
])

function occurrences(text, token) {
  let count = 0
  let cursor = 0
  while ((cursor = text.indexOf(token, cursor)) >= 0) {
    count += 1
    cursor += token.length
  }
  return count
}

function add(list, code, detail) {
  list.push({ code, detail })
}

function codeOnly(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

function enclosingCallable(text, index) {
  const candidates = []
  const pattern = /\b(?:Future(?:<[^>{}]+>)?|void|Widget|[A-Za-z_]\w*(?:<[^>{}]+>)?\??)\s+[A-Za-z_]\w*\s*\([^;{}]*\)\s*(?:async\s*)?\{/g
  let match
  while ((match = pattern.exec(text)) !== null) {
    const open = text.indexOf('{', match.index)
    if (open < 0 || open >= index) continue
    let depth = 0
    let close = -1
    for (let cursor = open; cursor < text.length; cursor += 1) {
      if (text[cursor] === '{') depth += 1
      else if (text[cursor] === '}' && --depth === 0) { close = cursor; break }
    }
    if (close >= index) candidates.push({ open, close })
  }
  candidates.sort((left, right) => (left.close - left.open) - (right.close - right.open))
  return candidates[0] || null
}

function hasTerminatingGuardBefore(text, capability, beforeIndex) {
  const callable = enclosingCallable(text, beforeIndex)
  if (!callable) return false
  const callableText = text.slice(callable.open + 1, beforeIndex)
  const escaped = capability.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(
    `if\\s*\\(\\s*!(?:scope|runtimeScope)\\.capabilities\\.${escaped}\\s*\\)\\s*(?:\\{\\s*(?:return\\s*;|throw\\s+StateError\\([^;]+;)\\s*\\}|return\\s*;|throw\\s+StateError\\([^;]+;)`,
    'g',
  )
  let match
  let found = false
  while ((match = pattern.exec(callableText)) !== null) {
    found = true
  }
  return found
}

export function assessShopQaIsolationContract({ sources }) {
  const fatal = []
  const blockers = []
  if (!sources || typeof sources !== 'object' || Array.isArray(sources)) {
    return { ok: false, strictReady: false, fatal: [{ code: 'sources_invalid', detail: 'Source map is required.' }], blockers: [] }
  }
  for (const [path, source] of Object.entries(sources)) {
    if (typeof source !== 'string') add(fatal, 'source_unreadable', path)
  }
  for (const path of requiredExisting) {
    if (typeof sources[path] !== 'string' || !sources[path].length) add(fatal, 'required_source_missing', path)
  }
  if (fatal.length) return { ok: false, strictReady: false, fatal, blockers }

  const gradle = codeOnly(sources['mobile/shop_pos/android/app/build.gradle.kts'])
  const ios = codeOnly(sources['mobile/shop_pos/ios/Runner.xcodeproj/project.pbxproj'])
  const database = codeOnly(sources['mobile/shop_pos/lib/shop_database.dart'])
  const corpus = Object.entries(sources).map(([path, source]) => path.endsWith('.dart') ? codeOnly(source) : source).join('\n')
  if (occurrences(gradle, 'applicationId = "dev.supermega.supermega_shop"') !== 1) add(fatal, 'production_android_identity_drift', 'dev.supermega.supermega_shop')
  if (occurrences(ios, 'PRODUCT_BUNDLE_IDENTIFIER = dev.supermega.supermegaShop;') !== 3) add(fatal, 'production_ios_identity_drift', 'dev.supermega.supermegaShop')
  if (occurrences(database, 'supermega_shop.sqlite') !== 1) add(fatal, 'production_database_name_drift', 'supermega_shop.sqlite')
  for (const key of ['shop_locale_myanmar', 'shop_pending_picker_intent', 'shop_receipt_printer_host_v1', 'shop_receipt_paper_width_v1']) {
    if (!corpus.includes(key)) add(fatal, 'production_preference_key_drift', key)
  }

  const dartPaths = Object.keys(sources).filter(path => path.startsWith(`${libRoot}/`) && path.endsWith('.dart'))
  for (const [token, allowed] of currentUnsafeCeilings) {
    for (const path of dartPaths) {
      const count = occurrences(sources[path], token)
      const ceiling = allowed.get(path) ?? 0
      if (count > ceiling) add(fatal, 'new_unsafe_io_callsite', `${path}:${token}:${count}>${ceiling}`)
    }
  }

  for (const path of implementationFiles) {
    if (typeof sources[path] !== 'string' || !sources[path].length) add(blockers, 'isolation_source_missing', path)
  }
  const profile = sources['mobile/shop_pos/lib/shop_runtime_profile.dart'] || ''
  const scope = sources['mobile/shop_pos/lib/shop_runtime_scope.dart'] || ''
  const main = sources['mobile/shop_pos/lib/main.dart']
  const workflow = sources['.github/workflows/shop-native-ci.yml']
  const identity = sources['mobile/shop_pos/lib/shop_build_identity.g.dart'] || ''

  for (const token of ['enum ShopRuntimeProfile', 'ShopRuntimeProfile resolve', "String.fromEnvironment('SHOP_RUNTIME_PROFILE')", "String.fromEnvironment('SHOP_QA_PROFILE_ID')", 'synthetic_qa_v1', 'synthetic-qa-v1', 'throw StateError']) {
    if (!profile.includes(token)) add(blockers, 'runtime_profile_contract_missing', token)
  }
  for (const forbidden of ['externalIoOverride', 'ALLOW_EXTERNAL_IO', 'allowExternalIo']) {
    if (profile.includes(forbidden)) add(fatal, 'qa_external_io_override_forbidden', forbidden)
  }
  if (!/unknown|unsupported/i.test(profile) || !/partial|complete|all/i.test(profile)) add(blockers, 'runtime_profile_fail_closed_missing', 'unknown and partial tuples')
  for (const token of ['class ShopRuntimeScope', 'Future<ShopRuntimeScope> resolve', 'getApplicationSupportDirectory', 'getTemporaryDirectory', 'SharedPreferences.getInstance']) {
    if (!scope.includes(token)) add(blockers, 'scoped_roots_missing', token)
  }
  if (!scope.includes('synthetic-evidence') || !scope.includes('sentinel')) add(blockers, 'scoped_evidence_boundary_missing', 'synthetic evidence root and sentinel')
  if (!identity.includes('synthetic_qa_v1') || !identity.includes('platform')) add(blockers, 'build_identity_contract_missing', 'profile/platform binding')

  const profileValidation = main.indexOf('final runtimeProfile = ShopRuntimeProfile.resolve()')
  const scopeValidation = main.indexOf('final runtimeScope = await ShopRuntimeScope.resolve(runtimeProfile)')
  const firstIo = Math.min(...['SharedPreferences.getInstance', 'getApplicationDocumentsDirectory', 'Supabase.initialize'].map(token => {
    const index = main.indexOf(token)
    return index < 0 ? Number.MAX_SAFE_INTEGER : index
  }))
  if (profileValidation < 0 || scopeValidation < profileValidation || scopeValidation > firstIo) add(blockers, 'profile_validation_not_first', 'profile and scope must validate before preferences, paths, providers, or I/O')

  const serviceGuards = [
    ['mobile/shop_pos/lib/connected_orders_service.dart', 'connectedOrders', '_client.send('],
    ['mobile/shop_pos/lib/menu_import_service.dart', 'remoteImport', '.post('],
    ['mobile/shop_pos/lib/shop_correction_authorization_service.dart', 'correctionAuthorization', '_client.send('],
    ['mobile/shop_pos/lib/camera_barcode_scanner.dart', 'camera', 'MobileScanner('],
    ['mobile/shop_pos/lib/printer_services.dart', 'networkPrinter', 'Socket.connect'],
    ['mobile/shop_pos/lib/shop_startup.dart', 'externalFileSaving', 'openFile('],
    ['mobile/shop_pos/lib/shop_backup_export_screen.dart', 'externalFileSaving', 'FileSaver.instance.saveAs'],
  ]
  for (const [path, capability, ioToken] of serviceGuards) {
    const text = codeOnly(sources[path] || '')
    const scopeIndex = text.indexOf('ShopRuntimeScope')
    const capabilityIndex = text.indexOf(capability)
    const ioIndex = text.indexOf(ioToken)
    const guarded = ioIndex < 0 || hasTerminatingGuardBefore(text, capability, ioIndex)
    if (scopeIndex < 0 || capabilityIndex < 0 || !guarded) {
      add(blockers, 'service_boundary_guard_missing', `${path}:${capability}`)
    }
  }

  const guardedPrimitives = [
    ['Supabase.initialize', new Map([['mobile/shop_pos/lib/main.dart', 'managedAuth']])],
    ['ImagePicker(', new Map([['mobile/shop_pos/lib/main.dart', 'camera'], ['mobile/shop_pos/lib/menu_import_screen.dart', 'gallery']])],
    ['MobileScanner(', new Map([['mobile/shop_pos/lib/camera_barcode_scanner.dart', 'camera']])],
    ['http.Client(', new Map([['mobile/shop_pos/lib/connected_orders_service.dart', 'connectedOrders'], ['mobile/shop_pos/lib/menu_import_service.dart', 'remoteImport'], ['mobile/shop_pos/lib/shop_correction_authorization_service.dart', 'correctionAuthorization']])],
    ['PrinterManager(', new Map([['mobile/shop_pos/lib/printer_services.dart', 'networkPrinter']])],
    ['PrinterDiscoveryService()', new Map([['mobile/shop_pos/lib/printer_setup_screen.dart', 'networkPrinter']])],
    ['NetworkInfo(', new Map([['mobile/shop_pos/lib/printer_services.dart', 'networkPrinter']])],
    ['Socket.connect', new Map([['mobile/shop_pos/lib/printer_services.dart', 'networkPrinter']])],
    ['openFile(', new Map([['mobile/shop_pos/lib/shop_startup.dart', 'externalFileSaving']])],
    ['FileSaver.instance.saveAs', new Map([['mobile/shop_pos/lib/shop_backup_export_screen.dart', 'externalFileSaving']])],
  ]
  for (const [token, allowed] of guardedPrimitives) {
    for (const path of dartPaths) {
      const text = codeOnly(sources[path])
      let cursor = 0
      while ((cursor = text.indexOf(token, cursor)) >= 0) {
        const capability = allowed.get(path)
        if (!capability || !hasTerminatingGuardBefore(text, capability, cursor)) {
          add(blockers, 'dangerous_primitive_not_terminated', `${path}:${token}`)
        }
        cursor += token.length
      }
    }
  }
  const allowedDefines = new Set(['SHOP_CONNECTED_ORDERS_ENABLED', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SHOP_API_BASE_URL', 'SHOP_RUNTIME_PROFILE', 'SHOP_QA_PROFILE_ID'])
  for (const path of dartPaths) {
    for (const match of sources[path].matchAll(/(?:(?:String|bool|int)\.fromEnvironment|bool\.hasEnvironment)\(\s*['"]([^'"]+)['"]/g)) {
      if (!allowedDefines.has(match[1])) add(fatal, 'unknown_build_define', `${path}:${match[1]}`)
    }
  }

  const strictDirectPaths = new Map([
    ['SharedPreferences.getInstance', new Set(['mobile/shop_pos/lib/shop_runtime_scope.dart'])],
    ['getApplicationDocumentsDirectory', new Set(['mobile/shop_pos/lib/shop_runtime_scope.dart'])],
    ['getApplicationSupportDirectory', new Set(['mobile/shop_pos/lib/shop_runtime_scope.dart'])],
    ['getTemporaryDirectory', new Set(['mobile/shop_pos/lib/shop_runtime_scope.dart'])],
  ])
  for (const [token, allowedPaths] of strictDirectPaths) {
    for (const path of dartPaths) {
      if (occurrences(sources[path], token) > 0 && !allowedPaths.has(path)) add(blockers, 'legacy_direct_io_not_scoped', `${path}:${token}`)
    }
  }

  const databaseFilenamePaths = dartPaths.filter(path => codeOnly(sources[path]).includes('supermega_shop.sqlite'))
  if (databaseFilenamePaths.length !== 1 || databaseFilenamePaths[0] !== 'mobile/shop_pos/lib/shop_database.dart'
    || occurrences(codeOnly(database), 'supermega_shop.sqlite') !== 1
    || !codeOnly(database).includes('privateDatabaseFile')) add(blockers, 'database_filename_seam_invalid', databaseFilenamePaths.join(','))
  for (const key of ['shop_locale_myanmar', 'shop_pending_picker_intent', 'shop_receipt_printer_host_v1', 'shop_receipt_paper_width_v1']) {
    const paths = dartPaths.filter(path => codeOnly(sources[path]).includes(key))
    if (paths.length !== 1 || paths[0] !== 'mobile/shop_pos/lib/shop_runtime_scope.dart') add(blockers, 'preference_key_not_scoped', `${key}:${paths.join(',')}`)
  }

  const generator = sources['tools/generate_shop_build_identity.mjs'] || ''
  const windows = sources['mobile/shop_pos/scripts/configure_windows_qa_runner.ps1'] || ''
  const androidProduction = sources['mobile/shop_pos/android/app/src/production/AndroidManifest.xml'] || ''
  const androidQa = sources['mobile/shop_pos/android/app/src/qa/AndroidManifest.xml'] || ''
  const iosScheme = sources['mobile/shop_pos/ios/Runner.xcodeproj/xcshareddata/xcschemes/qa.xcscheme'] || ''
  const iosConfig = sources['mobile/shop_pos/ios/Flutter/QA.xcconfig'] || ''
  if (!/create\("production"\)/.test(gradle) || !/create\("qa"\)/.test(gradle) || !androidProduction.includes('Shop') || !androidQa.includes('Shop QA')) add(blockers, 'android_qa_identity_missing', 'exact production/qa flavors and manifests')
  if (!ios.includes('dev.supermega.supermegaShop.qa') || !iosScheme.includes('QA') || !iosConfig.includes('dev.supermega.supermegaShop.qa')) add(blockers, 'ios_qa_identity_missing', 'QA scheme, config, and bundle identity')
  if (!generator.includes('synthetic_qa_v1') || !generator.includes('production') || !generator.includes('windows')) add(blockers, 'identity_generator_missing', 'allowlisted platform/profile generator')
  if (!windows.includes('supermega_shop_qa.exe') || !windows.includes('Shop QA')) add(blockers, 'windows_qa_identity_missing', 'QA executable and product identity')
  if (!workflow.includes('synthetic-qa')
    || !workflow.includes('SHOP_RUNTIME_PROFILE=synthetic_qa_v1')
    || !/sha-?256/i.test(workflow)
    || !/source.?sha/i.test(workflow)
    || !/promotion.?ineligible/i.test(workflow)
    || !workflow.includes('app-production-debug.apk')
    || !workflow.includes('app-qa-debug.apk')
    || !workflow.includes('SHOP_QA_PROFILE_ID=synthetic-qa-v1')) {
    add(blockers, 'qa_build_contract_missing', 'promotion-ineligible QA artifact tuple with source SHA and checksum')
  }
  if (/(?:SUPABASE_URL|SUPABASE_PUBLISHABLE_KEY|SHOP_API_BASE_URL)=\S+/.test(workflow)) add(fatal, 'qa_build_provider_value_forbidden', 'provider value in native workflow')

  const strictReady = fatal.length === 0 && blockers.length === 0
  return {
    ok: fatal.length === 0,
    strictReady,
    evidenceLevel: 'source',
    artifactIdentityVerified: false,
    installedIsolationVerified: false,
    launchAuthorized: false,
    fatal,
    blockers,
  }
}

async function collectSources(base = root) {
  const sources = {}
  async function walk(relativeDirectory) {
    const entries = await readdir(resolve(base, relativeDirectory), { withFileTypes: true })
    for (const entry of entries) {
      const path = `${relativeDirectory}/${entry.name}`
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile() && path.endsWith('.dart')) sources[path] = await readFile(resolve(base, path), 'utf8')
    }
  }
  await walk(libRoot)
  for (const path of [...requiredExisting, ...implementationFiles]) {
    if (sources[path] !== undefined) continue
    try { sources[path] = await readFile(resolve(base, path), 'utf8') } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  return sources
}

async function main() {
  const mode = process.argv[2]
  if (!['--audit', '--strict'].includes(mode)) throw new Error('usage: verify_shop_qa_isolation_contract.mjs --audit|--strict')
  const result = assessShopQaIsolationContract({ sources: await collectSources() })
  console.log(JSON.stringify({ contract: 'supermega.shop.qa-isolation.v1', mode: mode.slice(2), ...result }, null, 2))
  if (!result.ok || (mode === '--strict' && !result.strictReady)) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
