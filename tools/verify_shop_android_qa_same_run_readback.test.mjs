import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import { sampleShopAndroidQaHandoffInput } from './prepare_shop_android_qa_handoff.mjs'
import { verifyShopAndroidQaSameRunReadback } from './verify_shop_android_qa_same_run_readback.mjs'

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function input(overrides = {}) {
  const sample = sampleShopAndroidQaHandoffInput({ canonicalAware: true, ...overrides })
  const manifest = JSON.parse(sample.manifestText)
  return {
    archiveBytes: sample.archiveBytes,
    artifactDigest: sha256(sample.archiveBytes),
    artifactId: sample.metadata.artifactId,
    runId: sample.metadata.runId,
    mergeSha: sample.metadata.mergeSha,
    sourceTree: manifest.source.sourceTree,
    nativeTree: sample.metadata.nativeTree,
  }
}

test('same-run raw ZIP readback binds all six bytes and remains transport-only', () => {
  const result = verifyShopAndroidQaSameRunReadback(input())
  assert.equal(result.result, 'PASS')
  assert.equal(result.memberNames.length, 6)
  assert.equal(result.memberSha256['app-qa-debug.apk'], result.apkSha256)
  assert.equal(result.providerExpiryProven, false)
  assert.equal(result.installedQaProven, false)
  assert.equal(result.readyForInstall, false)
})

test('upload digest, artifact ID and checked-out merge provenance fail closed', () => {
  const valid = input()
  assert.throws(() => verifyShopAndroidQaSameRunReadback({
    ...valid, artifactDigest: 'a'.repeat(64),
  }), /upload_digest_mismatch/)
  assert.throws(() => verifyShopAndroidQaSameRunReadback({
    ...valid, artifactDigest: `sha256:${valid.artifactDigest}`,
  }), /upload_digest_invalid/)
  assert.throws(() => verifyShopAndroidQaSameRunReadback({
    ...valid, artifactId: '',
  }), /artifact_identity_invalid/)
  assert.throws(() => verifyShopAndroidQaSameRunReadback({
    ...valid, sourceTree: 'a'.repeat(40),
  }), /manifest_source_mismatch/)
})

test('missing, extra and altered ZIP members are refused', () => {
  assert.throws(() => verifyShopAndroidQaSameRunReadback(input({
    canonicalOmitArchiveFile: 'app-qa-debug.apk.identity.json',
  })), /zip_members_invalid/)
  assert.throws(() => verifyShopAndroidQaSameRunReadback(input({
    canonicalExtraArchiveEntry: ['unexpected.txt', Buffer.from('extra')],
  })), /zip_members_invalid/)
  assert.throws(() => verifyShopAndroidQaSameRunReadback(input({
    canonicalArchiveIdentityBytes: Buffer.from('{}'),
  })), /sidecar_digest_mismatch/)
  const changed = Buffer.from(input().archiveBytes)
  changed[70] ^= 1
  assert.throws(() => verifyShopAndroidQaSameRunReadback({
    ...input(), archiveBytes: changed, artifactDigest: sha256(changed),
  }))
})
