#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { readZipEntries } from './prepare_shop_android_qa_handoff.mjs'
import { validateShopQaArtifactManifest } from './shop_android_qa_handoff_validator.mjs'

const APK = 'app-qa-debug.apk'
const MEMBERS = [
  APK,
  `${APK}.sha256`,
  `${APK}.toolchain.json`,
  `${APK}.signing.json`,
  `${APK}.identity.json`,
  `${APK}.manifest`,
]
const SHA40 = /^[0-9a-f]{40}$/
const SHA64 = /^[0-9a-f]{64}$/
const DIGEST = /^sha256:[0-9a-f]{64}$/
const DECIMAL_ID = /^[1-9][0-9]*$/
const MAX_ZIP_BYTES = 256 * 1024 * 1024

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function requireCondition(condition, code) {
  if (!condition) throw new Error(code)
}

function parseJson(bytes, code) {
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch {
    throw new Error(code)
  }
}

// This checks transport and producer receipts. It neither installs the APK nor
// proves the provider's actual artifact expiry or the APK's runtime behavior.
export function verifyShopAndroidQaSameRunReadback({
  archiveBytes, artifactDigest, artifactId, runId,
  mergeSha, sourceTree, nativeTree,
}) {
  requireCondition(DIGEST.test(artifactDigest), 'upload_digest_invalid')
  requireCondition(DECIMAL_ID.test(artifactId) && DECIMAL_ID.test(runId), 'artifact_identity_invalid')
  requireCondition([mergeSha, sourceTree, nativeTree].every(value => SHA40.test(value)), 'source_identity_invalid')
  requireCondition(Buffer.isBuffer(archiveBytes)
    && archiveBytes.length > 0 && archiveBytes.length <= MAX_ZIP_BYTES, 'archive_size_invalid')
  const archiveSha256 = sha256(archiveBytes)
  requireCondition(artifactDigest === `sha256:${archiveSha256}`, 'upload_digest_mismatch')

  const entries = readZipEntries(archiveBytes)
  requireCondition(entries.size === MEMBERS.length && MEMBERS.every(name => entries.has(name)), 'zip_members_invalid')
  const apkBytes = entries.get(APK)
  const apkSha256 = sha256(apkBytes)
  const manifest = validateShopQaArtifactManifest(
    parseJson(entries.get(`${APK}.manifest`), 'manifest_json_invalid'),
  )
  requireCondition(manifest.platform === 'android'
    && manifest.source.sourceSha === mergeSha
    && manifest.source.sourceTree === sourceTree
    && manifest.source.nativeTree === nativeTree, 'manifest_source_mismatch')
  requireCondition(manifest.artifact.fileName === APK
    && manifest.artifact.sha256 === apkSha256
    && manifest.artifact.bytes === apkBytes.length, 'manifest_apk_mismatch')
  const checksumText = entries.get(`${APK}.sha256`).toString('utf8')
  requireCondition([`${apkSha256}  ${APK}\n`, `${apkSha256}  ${APK}\r\n`].includes(checksumText),
    'apk_checksum_mismatch')

  const identityBytes = entries.get(`${APK}.identity.json`)
  const signingBytes = entries.get(`${APK}.signing.json`)
  const toolchainBytes = entries.get(`${APK}.toolchain.json`)
  requireCondition(sha256(identityBytes) === manifest.artifact.identityReceiptSha256
    && sha256(signingBytes) === manifest.signing.receiptSha256
    && sha256(toolchainBytes) === manifest.toolchain.receiptSha256, 'sidecar_digest_mismatch')
  const identity = parseJson(identityBytes, 'identity_json_invalid')
  const signing = parseJson(signingBytes, 'signing_json_invalid')
  const toolchain = parseJson(toolchainBytes, 'toolchain_json_invalid')
  const { receiptSha256: _signingReceiptSha256, ...manifestSigning } = manifest.signing
  requireCondition(isDeepStrictEqual(identity, manifest.artifact.identity)
    && isDeepStrictEqual(signing, manifestSigning)
    && String(toolchain.frameworkVersion || toolchain.flutterVersion || '') === manifest.toolchain.flutterVersion
    && String(toolchain.frameworkRevision || '').toLowerCase() === manifest.toolchain.flutterRevision
    && String(toolchain.dartSdkVersion || '') === manifest.toolchain.dartVersion, 'sidecar_content_mismatch')

  return {
    contract: 'supermega.shop.android-qa-same-run-zip-readback.v1',
    result: 'PASS',
    expectedArtifactName: `synthetic-qa-promotion-ineligible-${mergeSha}-sha-256-android`,
    artifactId,
    runId,
    archiveBytes: archiveBytes.length,
    archiveSha256,
    memberNames: MEMBERS,
    memberSha256: Object.fromEntries(MEMBERS.map(name => [name, sha256(entries.get(name))])),
    apkSha256,
    mergeSha,
    sourceTree,
    nativeTree,
    manifestDigest: manifest.digest,
    providerExpiryProven: false,
    installedQaProven: false,
    readyForInstall: false,
  }
}

async function main() {
  const directory = process.env.QA_DOWNLOAD_DIR || ''
  requireCondition(directory.startsWith('/'), 'download_directory_invalid')
  const directoryInfo = await lstat(directory)
  requireCondition(directoryInfo.isDirectory() && !directoryInfo.isSymbolicLink(), 'download_directory_invalid')
  const names = await readdir(directory)
  requireCondition(names.length === 1 && names[0].endsWith('.zip'), 'download_file_set_invalid')
  const archivePath = resolve(directory, names[0])
  const info = await lstat(archivePath)
  requireCondition(info.isFile() && !info.isSymbolicLink()
    && info.size > 0 && info.size <= MAX_ZIP_BYTES, 'download_zip_invalid')
  const archiveBytes = await readFile(archivePath)
  requireCondition(archiveBytes.length === info.size, 'download_zip_changed')
  const result = verifyShopAndroidQaSameRunReadback({
    archiveBytes,
    artifactDigest: process.env.QA_ARTIFACT_DIGEST,
    artifactId: process.env.QA_ARTIFACT_ID,
    runId: process.env.QA_RUN_ID,
    mergeSha: process.env.QA_MERGE_SHA,
    sourceTree: process.env.QA_SOURCE_TREE,
    nativeTree: process.env.QA_NATIVE_TREE,
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => {
    const code = /^[a-z_]+$/.test(error?.message || '') ? error.message : 'readback_invalid'
    process.stderr.write(`${JSON.stringify({ result: 'FAIL', code })}\n`)
    process.exitCode = 1
  })
}
