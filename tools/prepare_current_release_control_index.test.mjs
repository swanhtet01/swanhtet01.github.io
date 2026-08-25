import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import {
  CURRENT_RELEASE_CONTROL_INDEX_CONTRACT,
  buildCurrentReleaseControlIndex,
  renderCurrentReleaseControlIndexMarkdown,
  runSelfTest,
  sampleCurrentReleaseControlIndexInput,
  validateCurrentReleaseControlIndex,
} from './prepare_current_release_control_index.mjs'

test('builds a current release control index for one exact candidate', () => {
  const packet = buildCurrentReleaseControlIndex(sampleCurrentReleaseControlIndexInput())
  assert.equal(packet.contract, CURRENT_RELEASE_CONTROL_INDEX_CONTRACT)
  assert.equal(packet.currentOwnerAction.gateId, 'github_main_protection')
  assert.equal(packet.currentOwnerAction.branchPushAllowedNow, false)
  assert.equal(packet.currentOwnerAction.pullRequestAllowedNow, false)
  assert.equal(packet.currentOwnerAction.deployAllowedNow, false)
  assert.equal(packet.currentOwnerAction.supabaseWriteAllowedNow, false)
  assert.equal(packet.currentOwnerAction.customerContactAllowedNow, false)
  assert.equal(packet.currentOwnerAction.paymentOrStockAllowedNow, false)
  assert.equal(packet.currentOwnerAction.managedActivationAllowedNow, false)
  assert.equal(packet.authoritativeArtifacts.releaseOwnerApprovalPacket.status, 'verified_current')
  assert.equal(packet.shopPilot.currentPrivateGate, 'private_observation_incomplete')
  assert.equal(validateCurrentReleaseControlIndex(packet), packet)
})

test('records a stale owner packet without making it authoritative', () => {
  const packet = buildCurrentReleaseControlIndex(sampleCurrentReleaseControlIndexInput({
    staleOwnerApprovalPacketObserved: true,
    staleOwnerApprovalPacketFileName: 'supermega.release-owner-approval-packet.v100.generated-20260826.md',
    staleOwnerApprovalRejection: 'release_owner_approval_packet_stale',
  }))
  assert.equal(packet.stalePacketPolicy.staleOwnerApprovalPacketObserved, true)
  assert.equal(packet.stalePacketPolicy.staleOwnerApprovalPacketFileName, 'supermega.release-owner-approval-packet.v100.generated-20260826.md')
  assert.equal(packet.currentOwnerAction.sourcePacketFileName, 'supermega.release-owner-approval-packet.v99.generated-20260826.md')
  const markdown = renderCurrentReleaseControlIndexMarkdown(packet)
  assert.match(markdown, /Observed stale owner approval packet rejected/)
  assert.match(markdown, /supermega\.release-owner-approval-packet\.v99\.generated-20260826\.md/)
  assert.equal(validateCurrentReleaseControlIndex(packet), packet)
})

test('accepts current preflight candidate schema without weakening mismatch guard', () => {
  const base = sampleCurrentReleaseControlIndexInput()
  const packet = buildCurrentReleaseControlIndex(sampleCurrentReleaseControlIndexInput({
    nextReleaseActionPreflight: {
      ...base.nextReleaseActionPreflight,
      candidateCommit: undefined,
      candidate: { commit: base.handoff.candidate.commit },
    },
  }))
  assert.equal(packet.candidate.commit, base.handoff.candidate.commit)
  assert.throws(
    () => buildCurrentReleaseControlIndex(sampleCurrentReleaseControlIndexInput({
      nextReleaseActionPreflight: {
        ...base.nextReleaseActionPreflight,
        candidateCommit: undefined,
        candidate: { commit: 'd'.repeat(40) },
      },
    })),
    /current_release_control_index_preflight_candidate_mismatch/,
  )
})

test('rejects mismatched candidate authority and unsafe owner action drift', () => {
  assert.throws(
    () => buildCurrentReleaseControlIndex(sampleCurrentReleaseControlIndexInput({
      releaseOwnerApproval: {
        ...sampleCurrentReleaseControlIndexInput().releaseOwnerApproval,
        candidate: { commit: 'c'.repeat(40) },
      },
    })),
    /current_release_control_index_owner_approval_candidate_mismatch/,
  )
  const packet = buildCurrentReleaseControlIndex(sampleCurrentReleaseControlIndexInput())
  assert.throws(
    () => validateCurrentReleaseControlIndex({
      ...packet,
      currentOwnerAction: {
        ...packet.currentOwnerAction,
        deployAllowedNow: true,
      },
    }),
    /current_release_control_index_digest_invalid/,
  )
})

test('renders public-safe markdown and verifies CLI packet', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'supermega-release-index-'))
  try {
    const packet = buildCurrentReleaseControlIndex(sampleCurrentReleaseControlIndexInput())
    const packetPath = join(parent, 'index.json')
    const markdownPath = join(parent, 'index.md')
    await writeFile(packetPath, `${JSON.stringify(packet, null, 2)}\n`)
    await writeFile(markdownPath, `${renderCurrentReleaseControlIndexMarkdown(packet)}\n`)
    const verified = spawnSync(process.execPath, [resolve('tools/prepare_current_release_control_index.mjs'), '--verify', packetPath], { encoding: 'utf8' })
    assert.equal(verified.status, 0, verified.stderr)
    const result = JSON.parse(verified.stdout)
    assert.equal(result.ok, true)
    assert.equal(result.currentGateId, 'github_main_protection')
    const markdown = await readFile(markdownPath, 'utf8')
    assert.doesNotMatch(markdown, /sk-|github_pat_|ghp_|postgres:|owner@example|ready for managed activation/i)
    assert.match(markdown, /Only the artifacts listed above are current/)
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})

test('self-test remains green', () => {
  const result = runSelfTest()
  assert.equal(result.ok, true)
  assert.equal(result.failedChecks.length, 0)
})
