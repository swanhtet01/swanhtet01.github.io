import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { buildReleaseHandoff, collectGitHubMainProtectionSnapshotForHandoff, validateReleaseCandidateAncestry, validateReleaseHandoffPacket, validateWorkflowAuthority, withReleaseHandoffOutputLock, writeExclusiveJson } from './prepare_release_handoff.mjs'
import {
  buildGitHubMainProtectionSnapshot,
} from './collect_github_main_protection_snapshot.mjs'
import { REQUIRED_MAIN_CHECKS } from './verify_github_main_protection.mjs'

const candidate = 'a'.repeat(40)
const main = 'b'.repeat(40)
const live = 'c'.repeat(40)
const legacy = 'd'.repeat(40)
const identity = { commit: live, brandVersion: 'jade-v2', contextVersion: '2026-07', catalogVersion: '2026-07' }
const workflow = `
name: SuperMega - Coordinated Verified Release
on:
  workflow_dispatch:
    inputs:
      release_commit:
      confirmation:
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
      - name: Require exact owner release instruction
        env:
          REQUESTED_RELEASE_COMMIT: \${{ inputs.release_commit }}
          RELEASE_CONFIRMATION: \${{ inputs.confirmation }}
          RELEASE_ACTOR: \${{ github.actor }}
        run: |
          if [ "$REQUESTED_RELEASE_COMMIT" != "$GITHUB_SHA" ]; then exit 1; fi
          if [ "$RELEASE_CONFIRMATION" != "DEPLOY SUPERMEGA PAIRED PRODUCTION" ]; then exit 1; fi
          if [ "$RELEASE_ACTOR" != "swanhtet01" ]; then exit 1; fi
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
    githubMainProtection: unprotectedMainSnapshot(),
    ...overrides,
  }
}

function unprotectedMainSnapshot() {
  return buildGitHubMainProtectionSnapshot({
    generatedAt: '2026-07-29T13:59:00.000Z',
    branch: {
      name: 'main',
      protected: false,
      commit: { sha: main },
      protection: { enabled: false, required_status_checks: { contexts: [], checks: [] } },
    },
    rulesets: [],
  })
}

function protectedMainSnapshot() {
  return buildGitHubMainProtectionSnapshot({
    generatedAt: '2026-07-29T13:59:00.000Z',
    branch: {
      name: 'main',
      protected: false,
      commit: { sha: main },
      protection: { enabled: false, required_status_checks: { contexts: [], checks: [] } },
    },
    rulesets: [{
      id: 1,
      name: 'SuperMega main release gate',
      target: 'branch',
      enforcement: 'active',
      conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
      rules: [
        { type: 'deletion' },
        { type: 'non_fast_forward' },
        { type: 'pull_request', parameters: { required_review_thread_resolution: true } },
        {
          type: 'required_status_checks',
          parameters: {
            required_status_checks: REQUIRED_MAIN_CHECKS.map((context) => ({ context })),
          },
        },
      ],
    }],
  })
}

test('release handoff is immutable, review-only, and exact-commit bound', () => {
  const packet = buildReleaseHandoff(valid())
  assert.equal(packet.contract, 'supermega.release-handoff.v2')
  assert.equal(packet.digestScope, 'utf8_compact_json_without_digest')
  assert.equal(packet.mode, 'owner_review_only')
  assert.equal(packet.candidate.commit, candidate)
  assert.equal(packet.remote.candidateBranchState, 'unpublished')
  assert.equal(packet.legacyReleaseBranch.disposition, 'diverged_superseded_review_only')
  assert.equal(packet.authority.pushApproved, false)
  assert.equal(packet.authority.deploymentApproved, false)
  assert.equal(packet.authority.remoteWritesPerformed, false)
  assert.equal(packet.githubMainProtection.assessment.ok, false)
  assert.equal(packet.nextAction.kind, 'owner_review_github_main_protection')
  assert.equal(packet.nextAction.forcePushAllowed, false)
  assert.equal(packet.actions.reviewBranchPush.kind, 'owner_review_initial_branch_push')
  assert.equal(packet.actions.reviewBranchPush.forcePushAllowed, false)
  assert.match(packet.digest, /^sha256:[a-f0-9]{64}$/)
  const { digest, ...body } = packet
  assert.equal(digest, `sha256:${createHash('sha256').update(JSON.stringify(body)).digest('hex')}`)
  assert.match(packet.actions.reviewBranchPush.approvalTemplate, /customer contact/)
  assert.match(packet.actions.reviewBranchPush.approvalTemplate, /stock/)
  assert.doesNotMatch(JSON.stringify(packet), /token|secret|password/i)
  assert.deepEqual(validateReleaseHandoffPacket(packet), packet)
})

test('release handoff advances to branch push only after main protection is verified', () => {
  const packet = buildReleaseHandoff(valid({ githubMainProtection: protectedMainSnapshot() }))
  assert.equal(packet.githubMainProtection.assessment.ok, true)
  assert.equal(packet.nextAction.kind, 'owner_review_initial_branch_push')
  assert.equal(packet.nextAction.approvalTemplate, packet.actions.reviewBranchPush.approvalTemplate)
})

test('release handoff advances an exact remote branch to owner-gated pull request creation', () => {
  const packet = buildReleaseHandoff(valid({
    remote: { ...valid().remote, candidateCommit: candidate },
    githubMainProtection: protectedMainSnapshot(),
  }))
  assert.equal(packet.remote.candidateBranchState, 'exact')
  assert.equal(packet.nextAction.kind, 'owner_review_pull_request_creation')
  assert.equal(packet.nextAction.branch, packet.candidate.branch)
  assert.equal(packet.nextAction.exactCommit, candidate)
  assert.equal(packet.nextAction.baseBranch, 'main')
  assert.equal(packet.nextAction.pullRequestIncluded, true)
  assert.equal(packet.nextAction.forcePushAllowed, false)
  assert.equal(packet.nextAction.mergeIncluded, false)
  assert.equal(packet.nextAction.deploymentIncluded, false)
  assert.equal(packet.actions.reviewBranchPush, undefined)
  assert.deepEqual(packet.actions.pullRequestCreation, packet.nextAction)
  assert.match(packet.nextAction.approvalTemplate, /pull request creation/)
  assert.match(packet.nextAction.approvalTemplate, /I do not approve merge/)
  assert.deepEqual(validateReleaseHandoffPacket(packet), packet)
})

test('release handoff preserves fast-forward-only push for a different ancestor tip', () => {
  const packet = buildReleaseHandoff(valid({
    remote: { ...valid().remote, candidateCommit: legacy },
    relations: { ...valid().relations, remoteCandidateIsAncestor: true },
    githubMainProtection: protectedMainSnapshot(),
  }))
  assert.equal(packet.remote.candidateBranchState, 'different')
  assert.equal(packet.nextAction.kind, 'owner_review_fast_forward_branch_push')
  assert.equal(packet.actions.pullRequestCreation, undefined)
  assert.deepEqual(packet.actions.reviewBranchPush, packet.nextAction)
})

test('GitHub main protection snapshot collection retries transient read-only failures', async () => {
  let calls = 0
  const result = await collectGitHubMainProtectionSnapshotForHandoff({
    delay: async () => {},
    collect: async () => {
      calls += 1
      if (calls === 1) throw new Error('github_main_protection_snapshot_rulesets_invalid')
      return { packet: protectedMainSnapshot() }
    },
  })
  assert.equal(calls, 2)
  assert.equal(result.packet.assessment.ok, true)
  await assert.rejects(
    collectGitHubMainProtectionSnapshotForHandoff({
      attempts: 2,
      delay: async () => {},
      collect: async () => {
        throw new Error('github_main_protection_snapshot_rulesets_invalid')
      },
    }),
    /release_handoff_github_main_protection_snapshot_unavailable:github_main_protection_snapshot_rulesets_invalid/,
  )
})

test('release handoff fails closed on drift, dirty state, weak ancestry, or invented verification', () => {
  assert.throws(() => buildReleaseHandoff(valid({ candidate: { branch: 'main', commit: candidate, clean: true } })), /release_handoff_branch_invalid/)
  assert.throws(() => buildReleaseHandoff(valid({ candidate: { branch: 'agent/test', commit: candidate, clean: false } })), /release_handoff_worktree_dirty/)
  assert.throws(() => buildReleaseHandoff(valid({ relations: { ...valid().relations, mainIsAncestor: false } })), /release_handoff_candidate_diverged_from_main/)
  assert.throws(() => buildReleaseHandoff(valid({ relations: { ...valid().relations, liveIsAncestor: false } })), /release_handoff_candidate_diverged_from_live/)
  assert.throws(() => buildReleaseHandoff(valid({ verification: { ...valid().verification, verifiedCommit: main } })), /release_handoff_verification_invalid/)
  assert.throws(() => buildReleaseHandoff(valid({ live: { app: identity, public: { ...identity, commit: main } } })), /release_handoff_live_pair_mismatch/)
  assert.throws(() => buildReleaseHandoff(valid({ remote: { ...valid().remote, candidateCommit: 'malformed' } })), /release_handoff_remote_candidate_invalid/)
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
  assert.equal(authority.trigger, 'manual_exact_commit')
  assert.equal(authority.ownerActor, 'swanhtet01')
  assert.equal(authority.automaticPushDeployment, false)
  assert.match(authority.workflowDigest, /^sha256:[a-f0-9]{64}$/)
  assert.throws(() => validateWorkflowAuthority(workflow.replace('environment: production', 'environment: preview')), /release_handoff_workflow_authority_invalid/)
  assert.throws(() => validateWorkflowAuthority(workflow.replace('  workflow_dispatch:', '  push:\n  workflow_dispatch:')), /release_handoff_workflow_authority_invalid/)
  assert.throws(() => validateWorkflowAuthority(workflow.replace('DEPLOY SUPERMEGA PAIRED PRODUCTION', 'DEPLOY')), /release_handoff_workflow_authority_invalid/)
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

test('release handoff output lock prevents duplicate expensive generation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'supermega-release-handoff-lock-'))
  const output = join(directory, 'packet.json')
  let release
  const first = withReleaseHandoffOutputLock(output, async (lockedOutput) => {
    assert.equal(lockedOutput, output)
    return new Promise((resolve) => {
      release = () => resolve('first')
    })
  })
  while (!release) await new Promise((resolve) => setImmediate(resolve))
  await assert.rejects(
    withReleaseHandoffOutputLock(output, async () => 'second'),
    /release_handoff_output_lock_exists/,
  )
  release()
  assert.equal(await first, 'first')
  assert.equal(await withReleaseHandoffOutputLock(output, async () => 'after-release'), 'after-release')
  await writeFile(output, '{}\n', 'utf8')
  await assert.rejects(
    withReleaseHandoffOutputLock(output, async () => 'after-output'),
    /release_handoff_output_exists/,
  )
})
