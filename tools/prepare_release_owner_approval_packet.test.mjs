import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  RELEASE_OWNER_APPROVAL_PACKET_CONTRACT,
  buildReleaseOwnerApprovalPacket,
  selfTestInput,
  validateReleaseOwnerApprovalMarkdown,
} from './prepare_release_owner_approval_packet.mjs'
import { buildReleaseHandoff } from './prepare_release_handoff.mjs'

test('builds an exact owner approval packet for the release handoff commit', () => {
  const input = selfTestInput()
  const packet = buildReleaseOwnerApprovalPacket(input)

  assert.equal(packet.contract, RELEASE_OWNER_APPROVAL_PACKET_CONTRACT)
  assert.equal(packet.version, 'v0')
  assert.equal(packet.candidate.commit, input.handoff.candidate.commit)
  assert.match(packet.digest, /^sha256:[a-f0-9]{64}$/)
  assert.ok(packet.markdown.includes(`candidate commit \`${input.handoff.candidate.commit}\``))
  assert.ok(packet.markdown.includes(`Dialog action digest: \`${packet.approvals.reviewBranchPush.digest}\``))
  assert.ok(packet.markdown.includes('SUPERMEGA_GITHUB_MAIN_PROTECTION_APPROVAL'))
  assert.doesNotMatch(packet.markdown, /SUPERMEGA_REVIEW_BRANCH_PUSH_APPROVAL/)
  assert.equal(packet.approvals.reviewBranchPush.env, null)
  assert.equal(packet.approvals.reviewBranchPush.method, 'in_process_windows_owner_click')
  assert.ok(packet.markdown.includes('Only approval path: the execute command opens a local Windows owner-click dialog in the same process.'))
  assert.ok(packet.markdown.includes('never accepts a receipt path or plaintext environment fallback'))
  assert.ok(packet.markdown.includes('npm.cmd run release:branch-push:owner-click -- --handoff "'))
  assert.doesNotMatch(packet.markdown, /release:branch-push:apply -- --execute --handoff/)
  assert.doesNotMatch(packet.markdown, /SUPERMEGA_PULL_REQUEST_CREATION_APPROVAL/)
  assert.equal(packet.approvals.pullRequestCreation.env, null)
  assert.equal(packet.approvals.pullRequestCreation.method, 'in_process_windows_owner_click')
  assert.ok(packet.markdown.includes('seals a short-lived one-use receipt to the exact handoff, protection snapshot, PR payload, branch, and commit'))
  assert.ok(packet.markdown.includes('consumes it before any PR write attempt'))
  assert.ok(packet.markdown.includes('never accepts a receipt path or plaintext environment fallback'))
  assert.ok(packet.markdown.includes('dialog defaults to No and expires after 10 minutes'))
  assert.ok(packet.markdown.includes('No approval below grants merge, production release, deployment'))
  assert.ok(packet.markdown.includes('this packet intentionally avoids raw local paths'))
  assert.ok(packet.markdown.includes('Authentication may come from `GITHUB_TOKEN`, `GH_TOKEN`, or an authenticated GitHub CLI keyring'))
  assert.ok(packet.markdown.includes('token values must not be pasted into this packet or terminal output'))
  assert.doesNotMatch(packet.markdown, /[A-Za-z]:\\/)
  assert.ok(packet.markdown.includes('github:main-protection:apply:plan -- --proposal "'))
  assert.ok(packet.markdown.includes('apply_github_main_protection.mjs --execute --proposal "'))
  assert.ok(packet.markdown.includes(`--expected-head "${input.handoff.candidate.commit}"`))
  assert.equal(packet.controls.githubWritesPerformed, false)
  assert.equal(packet.controls.supabaseMutationsPerformed, false)
  assert.equal(packet.controls.customerContactPerformed, false)
})

test('verifies only the exact generated markdown for the current handoff', () => {
  const input = selfTestInput()
  const packet = buildReleaseOwnerApprovalPacket(input)
  const verified = validateReleaseOwnerApprovalMarkdown(packet.markdown, input)

  assert.equal(verified.ok, true)
  assert.equal(verified.digest, packet.digest)

  const stale = packet.markdown.replace(input.handoff.candidate.commit, 'f'.repeat(40))
  assert.throws(
    () => validateReleaseOwnerApprovalMarkdown(stale, input),
    /release_owner_approval_packet_stale/,
  )
})

test('names branch push as current safest next step once main protection is verified', () => {
  const base = selfTestInput()
  const input = {
    ...base,
    githubProtectionSnapshot: {
      ...base.githubProtectionSnapshot,
      assessmentOk: true,
      assessment: {
        ...(base.githubProtectionSnapshot.assessment || {}),
        ok: true,
      },
      currentAction: 'main_protection_verified_continue_to_review_branch_push',
    },
  }
  const packet = buildReleaseOwnerApprovalPacket(input)

  assert.match(packet.markdown, /GitHub main protection is verified\. Next approve the exact initial review-branch push only\./)
  assert.doesNotMatch(packet.markdown, /First approve and apply the GitHub main protection ruleset\./)
  assert.equal(validateReleaseOwnerApprovalMarkdown(packet.markdown, input).ok, true)
})

test('names fast-forward branch push when the review branch already exists', () => {
  const base = selfTestInput()
  const remoteCommit = '1'.repeat(40)
  const githubProtectionSnapshot = {
    ...base.githubProtectionSnapshot,
    assessmentOk: true,
    assessment: {
      ...(base.githubProtectionSnapshot.assessment || {}),
      ok: true,
    },
    currentAction: 'main_protection_verified_continue_to_review_branch_push',
  }
  const handoff = buildReleaseHandoff({
    generatedAt: base.handoff.generatedAt,
    repository: base.handoff.repository,
    candidate: base.handoff.candidate,
    remote: {
      ...base.handoff.remote,
      candidateCommit: remoteCommit,
    },
    live: { app: base.handoff.live.identity, public: base.handoff.live.identity },
    githubMainProtection: base.handoff.githubMainProtection,
    relations: {
      ...base.handoff.relations,
      remoteCandidateIsAncestor: true,
    },
    legacyReleaseBranch: {
      ...base.handoff.legacyReleaseBranch,
      isAncestorOfCandidate: false,
    },
    verification: base.handoff.verification,
  })
  const input = {
    ...base,
    handoff,
    githubProtectionSnapshot,
  }
  const packet = buildReleaseOwnerApprovalPacket(input)

  assert.match(packet.markdown, /## 2\. Fast-forward-only review-branch push/)
  assert.match(packet.markdown, /GitHub main protection is verified\. Next approve the exact fast-forward-only review-branch push only\./)
  assert.doesNotMatch(packet.markdown, /Next approve the exact initial review-branch push only/)
  assert.equal(validateReleaseOwnerApprovalMarkdown(packet.markdown, input).ok, true)
})

test('names pull request creation as current safest next step once review branch is exact', () => {
  const base = selfTestInput()
  const githubProtectionSnapshot = {
    ...base.githubProtectionSnapshot,
    assessmentOk: true,
    assessment: {
      ...(base.githubProtectionSnapshot.assessment || {}),
      ok: true,
    },
    currentAction: 'main_protection_verified_continue_to_review_branch_push',
  }
  const handoff = buildReleaseHandoff({
    generatedAt: base.handoff.generatedAt,
    repository: base.handoff.repository,
    candidate: base.handoff.candidate,
    remote: {
      ...base.handoff.remote,
      candidateCommit: base.handoff.candidate.commit,
    },
    live: { app: base.handoff.live.identity, public: base.handoff.live.identity },
    githubMainProtection: base.handoff.githubMainProtection,
    relations: base.handoff.relations,
    legacyReleaseBranch: {
      ...base.handoff.legacyReleaseBranch,
      isAncestorOfCandidate: false,
    },
    verification: base.handoff.verification,
  })
  const input = {
    ...base,
    handoff,
    githubProtectionSnapshot,
  }
  const packet = buildReleaseOwnerApprovalPacket(input)

  assert.equal(handoff.actions.pullRequestCreation.kind, 'owner_review_pull_request_creation')
  assert.equal(handoff.actions.reviewBranchPush, undefined)
  assert.equal(packet.approvals.reviewBranchPush.method, 'not_applicable_remote_branch_exact')
  assert.equal(packet.approvals.reviewBranchPush.digest, null)
  assert.match(packet.markdown, /The completed push is historical evidence only; no review-branch push is pending or authorized/)
  assert.doesNotMatch(packet.markdown, /release:branch-push:owner-click/)
  assert.match(packet.markdown, /GitHub main protection and the review branch are verified\. Next approve one review-only pull request creation only\./)
  assert.doesNotMatch(packet.markdown, /Next approve the exact initial review-branch push only/)
  assert.equal(validateReleaseOwnerApprovalMarkdown(packet.markdown, input).ok, true)
})

test('never repeats branch-push authority for an exact branch awaiting main protection', () => {
  const base = selfTestInput()
  const handoff = buildReleaseHandoff({
    generatedAt: base.handoff.generatedAt,
    repository: base.handoff.repository,
    candidate: base.handoff.candidate,
    remote: { ...base.handoff.remote, candidateCommit: base.handoff.candidate.commit },
    live: { app: base.handoff.live.identity, public: base.handoff.live.identity },
    githubMainProtection: base.handoff.githubMainProtection,
    relations: base.handoff.relations,
    legacyReleaseBranch: { ...base.handoff.legacyReleaseBranch, isAncestorOfCandidate: false },
    verification: base.handoff.verification,
  })
  const input = { ...base, handoff, githubProtectionSnapshot: null }
  const packet = buildReleaseOwnerApprovalPacket(input)

  assert.match(packet.markdown, /The review branch already equals the exact candidate commit; do not repeat the branch push\./)
  assert.doesNotMatch(packet.markdown, /release:branch-push:owner-click/)
  assert.equal(validateReleaseOwnerApprovalMarkdown(packet.markdown, input).ok, true)
})

test('CLI infers version from versioned output and verify paths', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'release-owner-approval-version-'))
  try {
    const input = selfTestInput()
    const handoffPath = join(directory, 'supermega.release-handoff.v109.generated-20260826.json')
    const outputPath = join(directory, 'supermega.release-owner-approval-packet.v109.generated-20260826.md')
    await writeFile(handoffPath, `${JSON.stringify(input.handoff, null, 2)}\n`, 'utf8')

    const write = spawnSync(process.execPath, [
      'tools/prepare_release_owner_approval_packet.mjs',
      '--handoff',
      handoffPath,
      '--output',
      outputPath,
    ], { cwd: process.cwd(), encoding: 'utf8' })
    assert.equal(write.status, 0, write.stderr || write.stdout)
    assert.equal(JSON.parse(write.stdout).candidate.commit, input.handoff.candidate.commit)

    const verify = spawnSync(process.execPath, [
      'tools/prepare_release_owner_approval_packet.mjs',
      '--handoff',
      handoffPath,
      '--verify',
      outputPath,
    ], { cwd: process.cwd(), encoding: 'utf8' })
    assert.equal(verify.status, 0, verify.stderr || verify.stdout)
    const verified = JSON.parse(verify.stdout)
    assert.equal(verified.ok, true)
    assert.equal(verified.version, 'v109')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('uses a validated owner-safe GitHub protection snapshot reference when provided', () => {
  const base = selfTestInput()
  const input = {
    ...base,
    githubProtectionSnapshotPath: 'C:\\Users\\fixture-owner\\Artifacts\\supermega.github-main-protection-snapshot.v82.generated-20260825.json',
  }
  const packet = buildReleaseOwnerApprovalPacket(input)
  const forwardSlashPacket = buildReleaseOwnerApprovalPacket({
    ...base,
    githubProtectionSnapshotPath: 'C:/Users/fixture-owner/Artifacts/supermega.github-main-protection-snapshot.v82.generated-20260825.json',
  })

  assert.ok(packet.markdown.includes('--github-protection-snapshot "<owner-artifact-dir>\\supermega.github-main-protection-snapshot.v82.generated-20260825.json"'))
  assert.ok(forwardSlashPacket.markdown.includes('--github-protection-snapshot "<owner-artifact-dir>\\supermega.github-main-protection-snapshot.v82.generated-20260825.json"'))
  assert.doesNotMatch(packet.markdown, /[A-Za-z]:[\\/]/)
  assert.doesNotMatch(forwardSlashPacket.markdown, /[A-Za-z]:[\\/]/)
  assert.equal(packet.markdown.includes('<github-main-protection-snapshot.json>'), false)
  assert.equal(validateReleaseOwnerApprovalMarkdown(packet.markdown, input).ok, true)
  assert.equal(validateReleaseOwnerApprovalMarkdown(forwardSlashPacket.markdown, {
    ...base,
    githubProtectionSnapshotPath: 'C:/Users/fixture-owner/Artifacts/supermega.github-main-protection-snapshot.v82.generated-20260825.json',
  }).ok, true)
})

test('binds GitHub main protection commands to the reviewed proposal path', () => {
  const input = selfTestInput()
  const packet = buildReleaseOwnerApprovalPacket(input)

  assert.match(packet.markdown, /hq\/readiness\/github-main-protection-proposal\.json"/)
  assert.match(packet.markdown, /--expected-head "[0-9a-f]{40}"/)
  assert.doesNotMatch(packet.markdown, /github:main-protection:apply:plan\s*```/)
  assert.doesNotMatch(packet.markdown, /apply_github_main_protection\.mjs --execute\s*```/)

  const stale = packet.markdown.replace(/--proposal "[^"]+"/, '--proposal "C:\\Users\\thesw\\OneDrive - BDA\\wrong-proposal.json"')
  assert.throws(
    () => validateReleaseOwnerApprovalMarkdown(stale, input),
    /release_owner_approval_packet_stale/,
  )
})

test('rejects preview proposals that would allow production data or writes', () => {
  const input = selfTestInput()
  const unsafe = {
    ...input,
    supabaseProposal: {
      ...input.supabaseProposal,
      previewBranch: {
        ...input.supabaseProposal.previewBranch,
        startsWithProductionData: true,
      },
    },
  }

  assert.throws(
    () => buildReleaseOwnerApprovalPacket(unsafe),
    /release_owner_approval_supabase_preview_invalid/,
  )
})

test('rejects an unsafe GitHub protection snapshot before rendering exact commands', () => {
  const input = selfTestInput()
  const unsafe = {
    ...input,
    githubProtectionSnapshot: {
      ...input.githubProtectionSnapshot,
      controls: {
        ...input.githubProtectionSnapshot.controls,
        githubWritesPerformed: true,
      },
    },
    githubProtectionSnapshotPath: 'C:\\Users\\thesw\\OneDrive - BDA\\supermega.github-main-protection-snapshot.v82.generated-20260825.json',
  }

  assert.throws(
    () => buildReleaseOwnerApprovalPacket(unsafe),
    /github_main_protection_snapshot_control_not_false:githubWritesPerformed|release_owner_approval_snapshot_controls_invalid/,
  )
})

test('rejects credential-shaped text before rendering owner packet', () => {
  const input = selfTestInput()
  const tokenShapedFixture = ['g', 'hp', '_', 'a'.repeat(36)].join('')
  const unsafe = {
    ...input,
    supabaseProposal: {
      ...input.supabaseProposal,
      ownerApprovalTemplate: `${input.supabaseProposal.ownerApprovalTemplate} ${tokenShapedFixture}`,
    },
  }

  assert.throws(
    () => buildReleaseOwnerApprovalPacket(unsafe),
    /release_owner_approval_supabase_secret_shape_detected|release_owner_approval_packet_secret_shape_detected/,
  )
})
