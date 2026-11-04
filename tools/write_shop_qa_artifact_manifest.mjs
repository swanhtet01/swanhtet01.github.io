#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { link, lstat, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateShopQaArtifactManifest } from './shop_android_qa_handoff_validator.mjs'

export { validateShopQaArtifactManifest } from './shop_android_qa_handoff_validator.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SHA40 = /^[0-9a-f]{40}$/
const SHA256 = /^[0-9a-f]{64}$/

const contracts = Object.freeze({
  android: Object.freeze({
    artifact: 'app-qa-debug.apk',
    runnerOs: 'Linux',
    identity: Object.freeze({
      applicationId: 'dev.supermega.supermega_shop.qa',
      applicationLabel: 'Shop QA',
      capabilityContract: 'supermega.shop.android-qa-capabilities.v1',
      evidenceContract: 'supermega.shop.synthetic-qa-evidence.v1',
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

function fail(code) {
  throw new Error(code)
}

function exactKeys(value, expected) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('\0') === [...expected].sort().join('\0')
}

function withinRoot(root, path) {
  const child = relative(root, path)
  return child !== '' && child !== '..' && !child.startsWith(`..${sep}`) && !child.startsWith(sep)
}

function withinOrEqual(root, path) {
  return path === root || withinRoot(root, path)
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function defaultExec(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: 'utf8' }).trim()
}

export async function writeShopQaArtifactManifest({
  platform,
  artifactPath,
  checksumPath,
  toolchainPath,
  signingPath,
  identityPath,
  outputPath,
  root = repositoryRoot,
  environment = process.env,
  execute = defaultExec,
}) {
  if (!Object.hasOwn(contracts, platform)) fail('shop_qa_manifest_platform_unknown')
  const contract = contracts[platform]
  const absoluteRoot = resolve(root)
  const artifact = resolve(artifactPath)
  const checksum = resolve(checksumPath)
  const toolchainReceipt = resolve(toolchainPath)
  const signingReceipt = resolve(signingPath)
  const identityReceipt = identityPath ? resolve(identityPath) : null
  const output = resolve(outputPath)
  if (![artifact, checksum, toolchainReceipt, signingReceipt, output, ...(identityReceipt ? [identityReceipt] : [])]
    .every(path => withinRoot(absoluteRoot, path))) fail('shop_qa_manifest_path_outside_repository')
  if (basename(artifact) !== contract.artifact
    || basename(checksum) !== `${contract.artifact}.sha256`
    || basename(toolchainReceipt) !== `${contract.artifact}.toolchain.json`
    || basename(signingReceipt) !== `${contract.artifact}.signing.json`
    || basename(output) !== `${contract.artifact}.manifest`
    || (platform === 'android' && basename(identityReceipt || '') !== `${contract.artifact}.identity.json`)
    || (platform !== 'android' && identityReceipt !== null)) fail('shop_qa_manifest_path_contract_invalid')
  const realRoot = await realpath(absoluteRoot)
  for (const [path, code] of [
    [artifact, 'artifact'],
    [checksum, 'checksum'],
    [toolchainReceipt, 'toolchain'],
    [signingReceipt, 'signing'],
    ...(identityReceipt ? [[identityReceipt, 'identity']] : []),
  ]) {
    const info = await lstat(path).catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error))
    if (!info?.isFile() || info.isSymbolicLink()) fail(`shop_qa_manifest_${code}_invalid`)
    const real = await realpath(path)
    if (!withinRoot(realRoot, real)) fail('shop_qa_manifest_path_outside_repository')
  }
  const realOutputParent = await realpath(dirname(output))
  if (!withinOrEqual(realRoot, realOutputParent)) fail('shop_qa_manifest_path_outside_repository')
  const existingOutput = await lstat(output).catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error))
  if (existingOutput) fail('shop_qa_manifest_output_exists')

  const artifactBytes = await readFile(artifact)
  const artifactDigest = sha256(artifactBytes)
  const checksumText = await readFile(checksum, 'utf8')
  const checksumLine = `${artifactDigest}  ${contract.artifact}`
  if (![checksumLine, `${checksumLine}\n`, `${checksumLine}\r\n`].includes(checksumText)) fail('shop_qa_manifest_checksum_invalid')

  const sourceSha = execute('git', ['rev-parse', 'HEAD'], absoluteRoot).toLowerCase()
  const sourceTree = execute('git', ['rev-parse', 'HEAD^{tree}'], absoluteRoot).toLowerCase()
  const nativeTree = execute('git', ['rev-parse', 'HEAD:mobile/shop_pos'], absoluteRoot).toLowerCase()
  if (![sourceSha, sourceTree, nativeTree].every(value => SHA40.test(value))) fail('shop_qa_manifest_git_identity_invalid')
  if ((environment.GITHUB_SHA || '').toLowerCase() !== sourceSha) fail('shop_qa_manifest_github_sha_mismatch')

  const toolchainBytes = await readFile(toolchainReceipt)
  let flutter
  try {
    flutter = JSON.parse(toolchainBytes.toString('utf8'))
  } catch {
    fail('shop_qa_manifest_flutter_identity_invalid')
  }
  const flutterVersion = String(flutter.frameworkVersion || flutter.flutterVersion || '')
  const flutterRevision = String(flutter.frameworkRevision || '').toLowerCase()
  const dartVersion = String(flutter.dartSdkVersion || '')
  if (!/^\d+\.\d+\.\d+/.test(flutterVersion) || !SHA40.test(flutterRevision) || !dartVersion.trim()) {
    fail('shop_qa_manifest_flutter_identity_invalid')
  }
  const runnerOs = String(environment.RUNNER_OS || '')
  const runnerArch = String(environment.RUNNER_ARCH || '')
  const runnerImageOs = String(environment.ImageOS || '')
  const runnerImageVersion = String(environment.ImageVersion || '')
  if (runnerOs !== contract.runnerOs || !runnerArch || !runnerImageOs || !runnerImageVersion) {
    fail('shop_qa_manifest_runner_identity_invalid')
  }
  const signingBytes = await readFile(signingReceipt)
  let signingEvidence
  try {
    signingEvidence = JSON.parse(signingBytes.toString('utf8'))
  } catch {
    fail('shop_qa_manifest_signing_evidence_invalid')
  }
  const android = platform === 'android'
  const signingEvidenceKeys = android
    ? ['classification', 'productionSigned', 'stableUpdateIdentityProven', 'certificateSha256', 'signatureVerified', 'apksignerBuildToolsVersion', 'apksignerSha256', 'apksignerJarSha256', 'buildToolsSourcePropertiesSha256']
    : ['classification', 'productionSigned', 'stableUpdateIdentityProven']
  if (!exactKeys(signingEvidence, signingEvidenceKeys)
    || signingEvidence.classification !== contract.signing
    || signingEvidence.productionSigned !== false
    || signingEvidence.stableUpdateIdentityProven !== false
    || (android && (!SHA256.test(signingEvidence.certificateSha256)
      || signingEvidence.signatureVerified !== true
      || !/^\d+\.\d+\.\d+$/.test(signingEvidence.apksignerBuildToolsVersion)
      || !SHA256.test(signingEvidence.apksignerSha256)
      || !SHA256.test(signingEvidence.apksignerJarSha256)
      || !SHA256.test(signingEvidence.buildToolsSourcePropertiesSha256)))) {
    fail('shop_qa_manifest_signing_evidence_invalid')
  }

  let artifactIdentity = contract.identity
  let identityReceiptSha256
  if (android) {
    const identityBytes = await readFile(identityReceipt)
    let identityEvidence
    try {
      identityEvidence = JSON.parse(identityBytes.toString('utf8'))
    } catch {
      fail('shop_qa_manifest_android_identity_evidence_invalid')
    }
    if (!exactKeys(identityEvidence, [
      ...Object.keys(contract.identity), 'versionCode', 'versionName', 'compileSdk', 'minSdk', 'targetSdk', 'abis', 'buildIdentitySha256',
    ])
      || Object.entries(contract.identity).some(([key, value]) => identityEvidence[key] !== value)
      || !/^[1-9][0-9]*$/.test(identityEvidence.versionCode)
      || typeof identityEvidence.versionName !== 'string' || !identityEvidence.versionName.trim()
      || !Number.isSafeInteger(identityEvidence.compileSdk)
      || !Number.isSafeInteger(identityEvidence.minSdk) || identityEvidence.minSdk <= 0
      || !Number.isSafeInteger(identityEvidence.targetSdk) || identityEvidence.targetSdk < identityEvidence.minSdk
      || identityEvidence.compileSdk < identityEvidence.targetSdk
      || !Array.isArray(identityEvidence.abis) || identityEvidence.abis.length === 0
      || identityEvidence.abis.some((abi, index, values) => (
        !['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'].includes(abi)
        || (index > 0 && values[index - 1] >= abi)
      ))
      || !SHA256.test(identityEvidence.buildIdentitySha256)) fail('shop_qa_manifest_android_identity_evidence_invalid')
    artifactIdentity = identityEvidence
    identityReceiptSha256 = sha256(identityBytes)
  }

  const body = {
    contract: 'supermega.shop.synthetic-qa-artifact.v1',
    digestScope: 'utf8_compact_json_without_digest',
    platform,
    buildProfile: 'synthetic_qa_v1',
    source: { sourceSha, sourceTree, nativeTree },
    artifact: {
      fileName: contract.artifact,
      sha256: artifactDigest,
      bytes: artifactBytes.byteLength,
      identity: artifactIdentity,
      ...(android ? { identityReceiptSha256 } : {}),
    },
    toolchain: {
      flutterVersion,
      flutterRevision,
      dartVersion,
      runnerOs,
      runnerArch,
      runnerImageOs,
      runnerImageVersion,
      receiptSha256: sha256(toolchainBytes),
    },
    signing: {
      ...signingEvidence,
      receiptSha256: sha256(signingBytes),
    },
    claimBoundary: {
      internalSyntheticQaOnly: true,
      installedAcceptanceProven: false,
      hardwareAcceptanceProven: false,
      merchantAcceptanceProven: false,
      productionReady: false,
      promotionEligible: false,
    },
  }
  const manifest = { ...body, digest: `sha256:${sha256(JSON.stringify(body))}` }
  validateShopQaArtifactManifest(manifest)
  const temporary = `${output}.${process.pid}.${randomUUID()}.tmp`
  let temporaryCreated = false
  try {
    await writeFile(temporary, `${JSON.stringify(manifest)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    temporaryCreated = true
    await link(temporary, output)
  } finally {
    if (temporaryCreated) await rm(temporary, { force: true })
  }
  return manifest
}

function parseArguments(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!['--platform', '--artifact', '--checksum', '--toolchain', '--signing', '--identity', '--output'].includes(key) || !value || values.has(key)) {
      fail('usage: write_shop_qa_artifact_manifest.mjs --platform android|ios|windows --artifact path --checksum path --toolchain path --signing path [--identity path] --output path')
    }
    values.set(key, value)
  }
  const platform = values.get('--platform')
  const expectedSize = platform === 'android' ? 7 : 6
  if (values.size !== expectedSize || (platform === 'android') !== values.has('--identity')) {
    fail('usage: write_shop_qa_artifact_manifest.mjs --platform android|ios|windows --artifact path --checksum path --toolchain path --signing path [--identity path] --output path')
  }
  return {
    platform,
    artifactPath: values.get('--artifact'),
    checksumPath: values.get('--checksum'),
    toolchainPath: values.get('--toolchain'),
    signingPath: values.get('--signing'),
    identityPath: values.get('--identity'),
    outputPath: values.get('--output'),
  }
}

async function main() {
  const manifest = await writeShopQaArtifactManifest(parseArguments(process.argv.slice(2)))
  process.stdout.write(`${JSON.stringify({
    contract: manifest.contract,
    platform: manifest.platform,
    sourceSha: manifest.source.sourceSha,
    nativeTree: manifest.source.nativeTree,
    artifactSha256: manifest.artifact.sha256,
    manifestDigest: manifest.digest,
  })}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
