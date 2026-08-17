import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  buildSupabaseRehearsalPacket,
  candidateReleaseReviewFromReceipt,
  originMainReleaseReview,
  validateSupabaseRehearsalPacket,
} from './prepare_supabase_rehearsal_packet.mjs'

const repositoryRoot = resolve(import.meta.dirname, '..')
const targetProjectRef = 'abcdefghijklmnopqrst'
const releaseCommit = 'a'.repeat(40)
const generatedAt = '2026-08-03T00:00:00.000Z'
const releaseReview = originMainReleaseReview(releaseCommit)

test('builds an exact non-mutating v12 rehearsal packet', async () => {
  const manifest = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'))
  const ignoreRules = await readFile(resolve(repositoryRoot, '.gitignore'), 'utf8')
  const runbook = await readFile(resolve(repositoryRoot, 'docs', 'supermega-enterprise-activation.md'), 'utf8')
  const packet = await buildSupabaseRehearsalPacket({
    repositoryRoot,
    targetProjectRef,
    releaseCommit,
    releaseReview,
    generatedAt,
  })
  await validateSupabaseRehearsalPacket(packet, { repositoryRoot, expectedReleaseCommit: releaseCommit })

  assert.equal(packet.contract, 'supermega.supabase-rehearsal-packet.v2')
  assert.equal(packet.state, 'prepared-not-executed')
  assert.equal(packet.release.schemaVersion, 12)
  assert.equal(packet.release.migrationCount, 13)
  assert.deepEqual(packet.release.review, releaseReview)
  assert.equal(packet.release.migrations.at(-1).name, '20260817090000_private_trial_backend_v12_billing_rail.sql')
  assert.equal(packet.release.browserQuarantine.contract, 'supermega.public-browser-quarantine.v1')
  assert.equal(packet.release.browserQuarantine.scope, 'isolated-rehearsal-only')
  assert.equal(packet.release.browserQuarantine.sourceAudit.publicTableCount, 27)
  assert.equal(packet.release.browserQuarantine.sourceAudit.publicSequenceCount, 2)
  assert.match(packet.release.browserQuarantine.script.sha256, /^[0-9a-f]{64}$/)
  assert.deepEqual(packet.release.browserQuarantine.browserRolesDenied, ['anon', 'authenticated'])
  assert.equal(packet.release.browserQuarantine.serviceRolePreserved, true)
  assert.ok(packet.requiredEvidence.includes('public-browser-table-and-sequence-denial'))
  assert.ok(packet.requiredEvidence.includes('service-role-contact-path-retained'))
  assert.equal(packet.authority.rehearsalProjectRef, targetProjectRef)
  assert.equal(packet.controls.activationAllowed, false)
  assert.equal(packet.controls.externalMutationPerformed, false)
  assert.match(packet.packetDigest, /^sha256:[0-9a-f]{64}$/)
  assert.doesNotMatch(JSON.stringify(packet), /postgres(?:ql)?:\/\//i)
  assert.equal(manifest.scripts['database:supabase:packet'], 'node tools/prepare_supabase_rehearsal_packet.mjs')
  assert.match(ignoreRules, /^\.tmp\/$/m)
  assert.match(runbook, /all eleven migrations/)
  assert.match(runbook, /Runtime readiness requires schema version 10/)
  assert.match(runbook, /database:supabase:packet:verify/)
  assert.match(runbook, /public browser quarantine/i)
})

test('rejects the protected production project', async () => {
  const manifest = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'))
  await assert.rejects(
    buildSupabaseRehearsalPacket({
      repositoryRoot,
      targetProjectRef: manifest.supermega.productionSupabaseProjectRef,
      releaseCommit,
      releaseReview,
      generatedAt,
    }),
    /supabase_rehearsal_target_is_production/,
  )
})

test('rejects malformed target refs and stale evidence', async () => {
  await assert.rejects(
    buildSupabaseRehearsalPacket({ repositoryRoot, targetProjectRef: 'not-a-ref', releaseCommit, releaseReview, generatedAt }),
    /supabase_rehearsal_target_ref_invalid/,
  )

  const packet = await buildSupabaseRehearsalPacket({
    repositoryRoot,
    targetProjectRef,
    releaseCommit,
    releaseReview,
    generatedAt,
  })
  packet.release.migrations[0].sha256 = '0'.repeat(64)
  await assert.rejects(
    validateSupabaseRehearsalPacket(packet, { repositoryRoot, expectedReleaseCommit: releaseCommit }),
    /supabase_rehearsal_packet_evidence_stale/,
  )
})

test('binds an unpublished candidate only through an exact owner-review handoff receipt', async () => {
  const receipt = {
    ok: true,
    contract: 'supermega.release-handoff.v2',
    mode: 'owner_review_only',
    digest: `sha256:${'1'.repeat(64)}`,
    packetDigest: `sha256:${'2'.repeat(64)}`,
    candidate: { branch: 'codex/reviewed-candidate', commit: releaseCommit, clean: true },
    remoteCandidateState: 'unpublished',
    nextAction: {
      kind: 'owner_review_initial_branch_push',
      exactCommit: releaseCommit,
      forcePushAllowed: false,
      mergeIncluded: false,
      deploymentIncluded: false,
    },
    authority: {
      pushApproved: false,
      mergeApproved: false,
      workflowDispatchApproved: false,
      deploymentApproved: false,
      domainChangeApproved: false,
      providerMutationApproved: false,
      remoteWritesPerformed: false,
      providerWritesPerformed: false,
      credentialValuesInspected: false,
    },
  }
  const candidateReview = candidateReleaseReviewFromReceipt(receipt)
  const packet = await buildSupabaseRehearsalPacket({
    repositoryRoot,
    targetProjectRef,
    releaseCommit,
    releaseReview: candidateReview,
    generatedAt,
  })
  await validateSupabaseRehearsalPacket(packet, {
    repositoryRoot,
    expectedReleaseCommit: releaseCommit,
    expectedReleaseReview: candidateReview,
  })
  assert.equal(packet.release.review.mode, 'owner_review_handoff')
  assert.equal(packet.release.review.handoffPacketDigest, receipt.packetDigest)
  assert.equal(packet.release.review.pushApproved, false)
  assert.equal(packet.controls.externalMutationPerformed, false)

  assert.throws(
    () => candidateReleaseReviewFromReceipt({ ...receipt, authority: { ...receipt.authority, providerMutationApproved: true } }),
    /supabase_rehearsal_release_handoff_invalid/,
  )
})
