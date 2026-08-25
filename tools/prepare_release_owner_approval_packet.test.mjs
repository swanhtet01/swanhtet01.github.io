import assert from 'node:assert/strict'
import test from 'node:test'

import {
  RELEASE_OWNER_APPROVAL_PACKET_CONTRACT,
  buildReleaseOwnerApprovalPacket,
  selfTestInput,
  validateReleaseOwnerApprovalMarkdown,
} from './prepare_release_owner_approval_packet.mjs'

test('builds an exact owner approval packet for the release handoff commit', () => {
  const input = selfTestInput()
  const packet = buildReleaseOwnerApprovalPacket(input)

  assert.equal(packet.contract, RELEASE_OWNER_APPROVAL_PACKET_CONTRACT)
  assert.equal(packet.version, 'v0')
  assert.equal(packet.candidate.commit, input.handoff.candidate.commit)
  assert.match(packet.digest, /^sha256:[a-f0-9]{64}$/)
  assert.ok(packet.markdown.includes(`candidate commit \`${input.handoff.candidate.commit}\``))
  assert.ok(packet.markdown.includes(input.handoff.actions.reviewBranchPush.approvalTemplate))
  assert.ok(packet.markdown.includes('SUPERMEGA_GITHUB_MAIN_PROTECTION_APPROVAL'))
  assert.ok(packet.markdown.includes('SUPERMEGA_REVIEW_BRANCH_PUSH_APPROVAL'))
  assert.ok(packet.markdown.includes('SUPERMEGA_PULL_REQUEST_CREATION_APPROVAL'))
  assert.ok(packet.markdown.includes('No approval below grants merge, production release, deployment'))
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

test('uses a validated exact GitHub protection snapshot path when provided', () => {
  const base = selfTestInput()
  const input = {
    ...base,
    githubProtectionSnapshotPath: 'C:\\Users\\thesw\\OneDrive - BDA\\supermega.github-main-protection-snapshot.v82.generated-20260825.json',
  }
  const packet = buildReleaseOwnerApprovalPacket(input)

  assert.ok(packet.markdown.includes('--github-protection-snapshot "C:\\Users\\thesw\\OneDrive - BDA\\supermega.github-main-protection-snapshot.v82.generated-20260825.json"'))
  assert.equal(packet.markdown.includes('<github-main-protection-snapshot.json>'), false)
  assert.equal(validateReleaseOwnerApprovalMarkdown(packet.markdown, input).ok, true)
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
  const unsafe = {
    ...input,
    supabaseProposal: {
      ...input.supabaseProposal,
      ownerApprovalTemplate: `${input.supabaseProposal.ownerApprovalTemplate} ghp_abcdefghijklmnopqrstuvwxyz123456`,
    },
  }

  assert.throws(
    () => buildReleaseOwnerApprovalPacket(unsafe),
    /release_owner_approval_supabase_secret_shape_detected|release_owner_approval_packet_secret_shape_detected/,
  )
})
