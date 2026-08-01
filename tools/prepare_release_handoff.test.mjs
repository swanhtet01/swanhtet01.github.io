import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { buildReleaseHandoff, validateReleaseCandidateAncestry, validateReleaseHandoffPacket, validateWorkflowAuthority, writeExclusiveJson } from './prepare_release_handoff.mjs'

const candidate = 'a'.repeat(40)
const main = 'b'.repeat(40)
const live = 'c'.repeat(40)
const legacy = 'd'.repeat(40)
const identity = { commit: live, brandVersion: 'jade-v2', contextVersion: '2026-07', catalogVersion: '2026-07' }
const workflow = `
name: SuperMega - Coordinated Verified Release
on:
  workflow_dispatch:
permissions:
  contents: read
concurrency:
  group: supermega-coordinated-production
  cancel-in-progress: false
jobs:
  release:
    if: github.ref == 'refs/heads/main'
    environment: production
    env:
      APP_VERCEL_PROJECT_ID: prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG
      PUBLIC_VERCEL_PROJECT_ID: prj_Yaf0cZYbiFXcLkMcKaAm4alPWMhR
    steps:
      - name: Capture app production rollback target
      - name: Capture current production rollback target
      - name: Roll back a failed production verification
`

function valid(overrides = {}) {
  return {
    generatedAt: '2026-07-29T14:00:00.000Z',
    repository: 'swanhtet01/swanhtet01.github.io',
    candidate: { branch: 'agent/integrated-client-demo-foundation', commit: candidate, clean: true },
    remote: { origin: 'https://github.com/swanhtet01/swanhtet01.github.io.git', mainCommit: main, candidateCommit: null },
    live: { app: identity, public: identity },
    relations: { mainIsAncestor: true, liveIsAncestor: true, remoteCandidateIsAncestor: null, candidateAheadOfMain: 173, candidateAheadOfLive: 225 },
    legacyReleaseBranch: { commit: legacy, isAncestorOfCandidate: false, legacyOnlyCommits: 3, candidateOnlyCommits: 334 },
    verification: { passed: true, verifiedCommit: candidate, workflowAuthority: validateWorkflowAuthority(workflow) },
    ...overrides,
  }
}

test('release handoff is immutable, review-only, and exact-commit bound', () => {
  const packet = buildReleaseHandoff(valid())
  assert.equal(packet.contract, 'supermega.release-handoff.v1')
  assert.equal(packet.digestScope, 'utf8_compact_json_without_digest')
  assert.equal(packet.mode, 'owner_review_only')
  assert.equal(packet.candidate.commit, candidate)
  assert.equal(packet.remote.candidateBranchState, 'unpublished')
  assert.equal(packet.legacyReleaseBranch.disposition, 'diverged_superseded_review_only')
  assert.equal(packet.authority.pushApproved, false)
  assert.equal(packet.authority.deploymentApproved, false)
  assert.equal(packet.authority.remoteWritesPerformed, false)
  assert.equal(packet.nextAction.kind, 'owner_review_initial_branch_push')
  assert.equal(packet.nextAction.forcePushAllowed, false)
  assert.match(packet.digest, /^sha256:[a-f0-9]{64}$/)
  const { digest, ...body } = packet
  assert.equal(digest, `sha256:${createHash('sha256').update(JSON.stringify(body)).digest('hex')}`)
  assert.doesNotMatch(JSON.stringify(packet), /token|secret|password|customer/i)
  assert.deepEqual(validateReleaseHandoffPacket(packet), packet)
})

test('release handoff fails closed on drift, dirty state, weak ancestry, or invented verification', () => {
  assert.throws(() => buildReleaseHandoff(valid({ candidate: { branch: 'main', commit: candidate, clean: true } })), /release_handoff_branch_invalid/)
  assert.throws(() => buildReleaseHandoff(valid({ candidate: { branch: 'agent/test', commit: candidate, clean: false } })), /release_handoff_worktree_dirty/)
  assert.throws(() => buildReleaseHandoff(valid({ relations: { ...valid().relations, mainIsAncestor: false } })), /release_handoff_candidate_diverged_from_main/)
  assert.throws(() => buildReleaseHandoff(valid({ relations: { ...valid().relations, liveIsAncestor: false } })), /release_handoff_candidate_diverged_from_live/)
  assert.throws(() => buildReleaseHandoff(valid({ verification: { ...valid().verification, verifiedCommit: main } })), /release_handoff_verification_invalid/)
  assert.throws(() => buildReleaseHandoff(valid({ live: { app: identity, public: { ...identity, commit: main } } })), /release_handoff_live_pair_mismatch/)
  assert.throws(() => buildReleaseHandoff(valid({ remote: { ...valid().remote, candidateCommit: legacy }, relations: { ...valid().relations, remoteCandidateIsAncestor: false } })), /release_handoff_candidate_push_not_fast_forward/)
  assert.throws(() => buildReleaseHandoff(valid({ verification: { ...valid().verification, workflowAuthority: { ...valid().verification.workflowAuthority, appProjectId: 'prj_forged' } } })), /release_handoff_workflow_authority_invalid/)
  const tampered = buildReleaseHandoff(valid())
  tampered.authority.pushApproved = true
  assert.throws(() => validateReleaseHandoffPacket(tampered), /release_handoff_packet_invalid/)
  const extra = { ...buildReleaseHandoff(valid()), inventedAuthority: true }
  assert.throws(() => validateReleaseHandoffPacket(extra), /release_handoff_packet_invalid/)
})

test('release ancestry gate reports the exact divergence before expensive verification', () => {
  assert.equal(validateReleaseCandidateAncestry(valid().relations), true)
  assert.throws(() => validateReleaseCandidateAncestry({ mainIsAncestor: false, liveIsAncestor: true }), /release_handoff_candidate_diverged_from_main/)
  assert.throws(() => validateReleaseCandidateAncestry({ mainIsAncestor: true, liveIsAncestor: false }), /release_handoff_candidate_diverged_from_live/)
})

test('workflow authority rejects missing production and rollback controls', () => {
  const authority = validateWorkflowAuthority(workflow)
  assert.equal(authority.rollbackRequired, true)
  assert.match(authority.workflowDigest, /^sha256:[a-f0-9]{64}$/)
  assert.throws(() => validateWorkflowAuthority(workflow.replace('environment: production', 'environment: preview')), /release_handoff_workflow_authority_invalid/)
})

test('release handoff output is exclusive and non-overwriting', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'supermega-release-handoff-'))
  const output = join(directory, 'packet.json')
  const packet = buildReleaseHandoff(valid())
  const receipt = await writeExclusiveJson(output, packet)
  const payload = await readFile(output, 'utf8')
  assert.equal(receipt.bytes > 0, true)
  assert.equal(receipt.digest, `sha256:${createHash('sha256').update(payload).digest('hex')}`)
  assert.equal(receipt.packetDigest, packet.digest)
  assert.deepEqual(JSON.parse(payload), packet)
  await assert.rejects(writeExclusiveJson(output, packet), /release_handoff_output_exists/)
})
