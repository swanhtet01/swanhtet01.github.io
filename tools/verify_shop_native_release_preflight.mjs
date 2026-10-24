import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export const SHOP_NATIVE_RELEASE_PREFLIGHT_CONTRACT = 'supermega.shop.native-release-preflight.v1'

const DEFAULT_ANDROID_ID = 'dev.supermega.supermega_shop'
const DEFAULT_IOS_ID = 'dev.supermega.supermegaShop'
const DEFAULT_VERSION = '1.0.0+1'
const METADATA_PATH = 'mobile/shop_pos/release-metadata.json'
const WINDOWS_CONTRACT_PATH = 'mobile/shop_pos/windows/release-contract.json'

function add(blockers, condition, code) {
  if (condition) blockers.push(code)
}

function sourceValue(source, pattern) {
  return source.match(pattern)?.[1] ?? null
}

function meaningful(value) {
  return typeof value === 'string'
    && value.trim().length > 2
    && !/(todo|tbd|placeholder|example|changeme|unknown)/i.test(value)
}

export function assessShopNativeReleasePreflight({ androidGradle, pubspec, iosProject, metadata, windowsContract = null }) {
  const blockers = []
  const androidApplicationId = sourceValue(androidGradle, /applicationId\s*=\s*"([^"]+)"/)
  const iosBundleId = sourceValue(iosProject, /PRODUCT_BUNDLE_IDENTIFIER\s*=\s*([^;\s]+);/)
  const version = sourceValue(pubspec, /^version:\s*([^\s#]+)\s*$/m)

  add(blockers, /signingConfig\s*=\s*signingConfigs\.getByName\("debug"\)/.test(androidGradle), 'android_release_uses_debug_signing')
  add(blockers, !/^\s*throw GradleException\("shop_android_release_signing_unavailable"\)\s*$/m.test(androidGradle), 'android_release_missing_fail_closed_gate')
  add(blockers, !/^\s*gradle\.taskGraph\.whenReady\s*\{/m.test(androidGradle), 'android_release_gate_not_bound_to_resolved_task_graph')
  add(blockers, !/^\s*throw GradleException\("shop_android_release_keystore_unavailable"\)\s*$/m.test(androidGradle), 'android_release_keystore_file_gate_missing')
  for (const property of [
    'SHOP_ANDROID_KEYSTORE_PATH',
    'SHOP_ANDROID_KEY_ALIAS',
    'SHOP_ANDROID_STORE_PASSWORD',
    'SHOP_ANDROID_KEY_PASSWORD',
  ]) {
    const binding = new RegExp(`^\\s*val\\s+\\w+\\s*=\\s*providers\\.gradleProperty\\("${property}"\\)\\.orNull\\s*$`, 'm')
    add(blockers, !binding.test(androidGradle), `android_release_property_missing:${property}`)
  }

  add(blockers, version === DEFAULT_VERSION, 'release_version_unapproved_default')
  add(blockers, !metadata || metadata.approved !== true, 'release_metadata_not_approved')
  const approval = metadata ?? {}
  add(blockers, !meaningful(approval.androidApplicationId), 'android_application_id_approval_missing')
  if (meaningful(approval.androidApplicationId)) {
    add(blockers, approval.androidApplicationId !== androidApplicationId, 'android_application_id_source_mismatch')
    add(blockers, approval.androidApplicationId === DEFAULT_ANDROID_ID, 'android_application_id_unapproved_default')
  }
  add(blockers, !meaningful(approval.iosBundleId), 'ios_bundle_id_approval_missing')
  if (meaningful(approval.iosBundleId)) {
    add(blockers, approval.iosBundleId !== iosBundleId, 'ios_bundle_id_source_mismatch')
    add(blockers, approval.iosBundleId === DEFAULT_IOS_ID, 'ios_bundle_id_unapproved_default')
  }
  add(blockers, !meaningful(approval.iosDevelopmentTeam), 'ios_development_team_missing')
  add(blockers, !['app-store', 'ad-hoc', 'enterprise'].includes(approval.iosDistributionMethod), 'ios_distribution_method_invalid')
  add(blockers, approval.version !== version || version === DEFAULT_VERSION, 'release_version_approval_mismatch')
  add(blockers, !['msix', 'msi'].includes(approval.windowsInstallerFormat), 'windows_installer_format_invalid')
  add(blockers, !meaningful(approval.windowsPublisherIdentityRef), 'windows_publisher_identity_missing')
  add(blockers, !meaningful(approval.windowsUpdateStrategy), 'windows_update_strategy_missing')
  add(blockers, !meaningful(approval.windowsRollbackStrategy), 'windows_rollback_strategy_missing')

  const decisionBlockerCount = blockers.length
  if (meaningful(approval.iosDevelopmentTeam)) {
    const teamBinding = new RegExp(`DEVELOPMENT_TEAM\\s*=\\s*${approval.iosDevelopmentTeam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*;`)
    add(blockers, !teamBinding.test(iosProject), 'ios_development_team_not_source_bound')
  }
  add(
    blockers,
    !windowsContract
      || windowsContract.approved !== true
      || windowsContract.installerFormat !== approval.windowsInstallerFormat
      || windowsContract.publisherIdentityRef !== approval.windowsPublisherIdentityRef
      || windowsContract.updateStrategy !== approval.windowsUpdateStrategy
      || windowsContract.rollbackStrategy !== approval.windowsRollbackStrategy,
    'windows_release_implementation_contract_missing',
  )

  const sourcePreparationComplete = blockers.length === 0

  return {
    ok: true,
    contract: SHOP_NATIVE_RELEASE_PREFLIGHT_CONTRACT,
    status: sourcePreparationComplete ? 'source-prepared' : 'blocked',
    ready: sourcePreparationComplete,
    decisionsComplete: decisionBlockerCount === 0,
    sourcePreparationComplete,
    metadataPath: METADATA_PATH,
    windowsContractPath: WINDOWS_CONTRACT_PATH,
    androidReleaseUsesDebugSigning: blockers.includes('android_release_uses_debug_signing'),
    androidReleaseCredentialGate: !blockers.includes('android_release_missing_fail_closed_gate'),
    releaseArtifactAuthorized: false,
    runtimeSigningProofRequired: true,
    blockers,
  }
}

async function readOptionalJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length !== 1 || !['--audit', '--strict'].includes(args[0])) {
    throw new Error('shop_native_release_preflight_arguments_invalid')
  }
  const [androidGradle, pubspec, iosProject, metadata, windowsContract] = await Promise.all([
    readFile('mobile/shop_pos/android/app/build.gradle.kts', 'utf8'),
    readFile('mobile/shop_pos/pubspec.yaml', 'utf8'),
    readFile('mobile/shop_pos/ios/Runner.xcodeproj/project.pbxproj', 'utf8'),
    readOptionalJson(METADATA_PATH),
    readOptionalJson(WINDOWS_CONTRACT_PATH),
  ])
  const result = assessShopNativeReleasePreflight({ androidGradle, pubspec, iosProject, metadata, windowsContract })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (args[0] === '--strict' && !result.ready) process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, contract: SHOP_NATIVE_RELEASE_PREFLIGHT_CONTRACT, error: String(error?.message ?? error) })}\n`)
    process.exitCode = 1
  })
}
