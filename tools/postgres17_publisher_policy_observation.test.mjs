import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  inspectPostgres17PublisherPolicy,
  inspectPostgres17ToolchainProfile,
  verifyWindowsAuthenticodePublisherEvidence,
} from './postgres17_toolchain_profile.mjs'

const policy = JSON.parse(readFileSync(new URL('../hq/research/postgres17-publisher-policy.json', import.meta.url)))
const profile = JSON.parse(readFileSync(new URL('../hq/research/postgres17-toolchain-profile.json', import.meta.url)))
const evidenceUrl = new URL('../hq/research/postgres17-edb-source-authenticode-observation.json', import.meta.url)
const evidenceBytes = readFileSync(evidenceUrl)
const evidence = JSON.parse(evidenceBytes)
const source = profile.sources.find((entry) => entry.component === 'postgresql')

// A memory-only unit fixture exercises the pure publisher verifier. It is
// never written to disk, installed as policy, or used to start any artifact.
function unitOnlyReviewedPolicy() {
  const value = structuredClone(policy)
  value.status = 'reviewed'
  value.approval = {
    status: 'reviewed',
    reviewedBy: 'unit-fixture-only-not-runtime-authority',
    reviewedAt: '2026-11-22T00:00:00.000Z',
  }
  return value
}

test('retained source observation is digest-bound while production approval stays pending', () => {
  assert.equal(policy.status, 'pending')
  assert.equal(policy.approval.status, 'pending')
  assert.equal(policy.approval.reviewedBy, null)
  assert.equal(inspectPostgres17PublisherPolicy(policy).ready, false)
  assert.equal(profile.status, 'pending')
  assert.equal(profile.approval.status, 'pending')
  assert.equal(profile.loadClosureComplete, false)
  assert.equal(profile.bindings.length, 0)
  assert.equal(inspectPostgres17ToolchainProfile(profile).ready, false)
  assert.equal(source.authentication.status, 'observed-retained-pending-review')
  assert.equal(source.authentication.evidencePath, 'postgres17-edb-source-authenticode-observation.json')
  assert.equal(source.authentication.evidenceBytes, evidenceBytes.length)
  assert.equal(source.authentication.evidenceSha256, createHash('sha256').update(evidenceBytes).digest('hex'))
  assert.equal(evidenceBytes.includes(13), false)
  assert.ok(readFileSync(new URL('../.gitattributes', import.meta.url), 'utf8').split('\n').includes(
    'hq/research/postgres17-edb-source-authenticode-observation.json text eol=lf',
  ))
  assert.throws(() => verifyWindowsAuthenticodePublisherEvidence({
    source, policy, evidence, observed: structuredClone(evidence),
  }), /database_rehearsal_publisher_policy_unapproved/)
})

test('full retained EDB issuer matches the pure verifier under a unit-only reviewed copy', () => {
  assert.equal(evidence.signatureStatus, 'Valid')
  const result = verifyWindowsAuthenticodePublisherEvidence({
    source, policy: unitOnlyReviewedPolicy(), evidence, observed: structuredClone(evidence),
  })
  assert.equal(result.signerCertificateSha256, evidence.signerCertificateSha256)
  assert.equal(result.sourceArtifactSha256, source.sha256)
})

const rejected = [
  ['truncated issuer', { signerIssuer: 'DigiCert Trusted G4 Code Signing RSA4096 SHA384 2021 CA1' }, 'signer_unapproved'],
  ['wrong signer', { signerCertificateSha256: '0'.repeat(64) }, 'signer_unapproved'],
  ['wrong timestamp', { timestampCertificateSha256: '0'.repeat(64) }, 'timestamp_unapproved'],
  ['missing code-signing EKU', { ekuOids: [] }, 'eku_missing'],
  ['wrong artifact digest', { artifactSha256: '0'.repeat(64) }, 'observation_mismatch'],
]
for (const [label, change, error] of rejected) {
  test('publisher verifier still rejects ' + label, () => {
    const invalid = { ...structuredClone(evidence), ...change }
    assert.throws(() => verifyWindowsAuthenticodePublisherEvidence({
      source, policy: unitOnlyReviewedPolicy(), evidence: invalid, observed: structuredClone(invalid),
    }), new RegExp('database_rehearsal_authenticode_' + error))
  })
}

test('changed live observation cannot reuse the retained record', () => {
  assert.throws(() => verifyWindowsAuthenticodePublisherEvidence({
    source, policy: unitOnlyReviewedPolicy(), evidence,
    observed: { ...structuredClone(evidence), artifactBytes: evidence.artifactBytes + 1 },
  }), /database_rehearsal_authenticode_observation_mismatch/)
})
