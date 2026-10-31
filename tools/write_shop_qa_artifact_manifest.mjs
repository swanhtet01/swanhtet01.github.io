#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { lstat, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SHA40 = /^[0-9a-f]{40}$/
const SHA256 = /^[0-9a-f]{64}$/

const contracts = Object.freeze({
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

function canonicalBody(manifest) {
  const { digest: _digest, ...body } = manifest
  return JSON.stringify(body)
}

export function validateShopQaArtifactManifest(manifest) {
  if (!exactKeys(manifest, [
    'contract', 'digestScope', 'platform', 'buildProfile', 'source', 'artifact',
    'toolchain', 'signing', 'claimBoundary', 'digest',
  ])) fail('shop_qa_manifest_keys_invalid')
  if (manifest.contract !== 'supermega.shop.synthetic-qa-artifact.v1'
    || manifest.digestScope !== 'utf8_compact_json_without_digest'
    || manifest.buildProfile !== 'synthetic_qa_v1'
    || !Object.hasOwn(contracts, manifest.platform)) fail('shop_qa_manifest_contract_invalid')
  const contract = contracts[manifest.platform]
  if (!exactKeys(manifest.source, ['sourceSha', 'sourceTree', 'nativeTree'])
    || !Object.values(manifest.source).every(value => SHA40.test(value))) fail('shop_qa_manifest_source_invalid')
  if (!exactKeys(manifest.artifact, ['fileName', 'sha256', 'bytes', 'identity'])
    || manifest.artifact.fileName !== contract.artifact
    || !SHA256.test(manifest.artifact.sha256)
    || !Number.isSafeInteger(manifest.artifact.bytes)
    || manifest.artifact.bytes <= 0
    || JSON.stringify(manifest.artifact.identity) !== JSON.stringify(contract.identity)) fail('shop_qa_manifest_artifact_invalid')
  if (!exactKeys(manifest.toolchain, [
    'flutterVersion', 'flutterRevision', 'dartVersion', 'runnerOs', 'runnerArch',
    'runnerImageOs', 'runnerImageVersion', 'receiptSha256',
  ])
    || !/^\d+\.\d+\.\d+/.test(manifest.toolchain.flutterVersion)
    || !SHA40.test(manifest.toolchain.flutterRevision)
    || typeof manifest.toolchain.dartVersion !== 'string'
    || !manifest.toolchain.dartVersion.trim()
    || manifest.toolchain.runnerOs !== contract.runnerOs
    || !SHA256.test(manifest.toolchain.receiptSha256)
    || !['runnerArch', 'runnerImageOs', 'runnerImageVersion'].every(key => (
      typeof manifest.toolchain[key] === 'string' && manifest.toolchain[key].trim()
    ))) fail('shop_qa_manifest_toolchain_invalid')
  if (!exactKeys(manifest.signing, ['classification', 'productionSigned', 'stableUpdateIdentityProven', 'receiptSha256'])
    || manifest.signing.classification !== contract.signing
    || manifest.signing.productionSigned !== false
    || manifest.signing.stableUpdateIdentityProven !== false
    || !SHA256.test(manifest.signing.receiptSha256)) fail('shop_qa_manifest_signing_invalid')
  if (!exactKeys(manifest.claimBoundary, [
    'internalSyntheticQaOnly', 'installedAcceptanceProven', 'hardwareAcceptanceProven',
    'merchantAcceptanceProven', 'productionReady', 'promotionEligible',
  ])
    || manifest.claimBoundary.internalSyntheticQaOnly !== true
    || ['installedAcceptanceProven', 'hardwareAcceptanceProven', 'merchantAcceptanceProven', 'productionReady', 'promotionEligible']
      .some(key => manifest.claimBoundary[key] !== false)) fail('shop_qa_manifest_claim_boundary_invalid')
  const expectedDigest = `sha256:${sha256(canonicalBody(manifest))}`
  if (manifest.digest !== expectedDigest) fail('shop_qa_manifest_digest_invalid')
  return manifest
}

export async function writeShopQaArtifactManifest({
  platform,
  artifactPath,
  checksumPath,
  toolchainPath,
  signingPath,
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
  const output = resolve(outputPath)
  if (![artifact, checksum, toolchainReceipt, signingReceipt, output].every(path => withinRoot(absoluteRoot, path))) fail('shop_qa_manifest_path_outside_repository')
  if (basename(artifact) !== contract.artifact
    || basename(checksum) !== `${contract.artifact}.sha256`
    || basename(toolchainReceipt) !== `${contract.artifact}.toolchain.json`
    || basename(signingReceipt) !== `${contract.artifact}.signing.json`
    || basename(output) !== `${contract.artifact}.manifest`) fail('shop_qa_manifest_path_contract_invalid')
  const realRoot = await realpath(absoluteRoot)
  for (const [path, code] of [
    [artifact, 'artifact'],
    [checksum, 'checksum'],
    [toolchainReceipt, 'toolchain'],
    [signingReceipt, 'signing'],
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
  if (!exactKeys(signingEvidence, ['classification', 'productionSigned', 'stableUpdateIdentityProven'])
    || signingEvidence.classification !== contract.signing
    || signingEvidence.productionSigned !== false
    || signingEvidence.stableUpdateIdentityProven !== false) fail('shop_qa_manifest_signing_evidence_invalid')

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
      identity: contract.identity,
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
  const temporary = `${output}.${process.pid}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(manifest)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    await rename(temporary, output)
  } finally {
    await rm(temporary, { force: true })
  }
  return manifest
}

function parseArguments(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!['--platform', '--artifact', '--checksum', '--toolchain', '--signing', '--output'].includes(key) || !value || values.has(key)) {
      fail('usage: write_shop_qa_artifact_manifest.mjs --platform ios|windows --artifact path --checksum path --toolchain path --signing path --output path')
    }
    values.set(key, value)
  }
  if (values.size !== 6) fail('usage: write_shop_qa_artifact_manifest.mjs --platform ios|windows --artifact path --checksum path --toolchain path --signing path --output path')
  return {
    platform: values.get('--platform'),
    artifactPath: values.get('--artifact'),
    checksumPath: values.get('--checksum'),
    toolchainPath: values.get('--toolchain'),
    signingPath: values.get('--signing'),
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
