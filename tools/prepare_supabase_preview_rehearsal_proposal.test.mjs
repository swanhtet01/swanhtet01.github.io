import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import {
  SUPABASE_PREVIEW_REHEARSAL_PROPOSAL_CONTRACT,
  buildSupabasePreviewRehearsalProposal,
  validateSupabasePreviewRehearsalProposal,
} from './prepare_supabase_preview_rehearsal_proposal.mjs'

const sourceReceipts = [
  'package.json',
  'tools/prepare_supabase_preview_rehearsal_proposal.mjs',
  'tools/prepare_supabase_rehearsal_packet.mjs',
  'tools/verify_private_trial_migrations.mjs',
  'tools/verify_public_browser_quarantine.mjs',
  'hq/readiness/supabase-security-advisor-audit.json',
  'hq/readiness/managed-pilot-readiness.json',
  'hq/readiness/github-main-protection-proposal.json',
  'supabase/rehearsal/20260804_public_browser_quarantine.sql',
].map((path) => ({ path, digest: `sha256:${createHash('sha256').update(path).digest('hex')}` }))

const securityAudit = {
  contract: 'supermega.supabase-security-advisor-audit.v2',
  projectRef: 'abcdefghijklmnopqrst',
  targetClassification: 'protected-production',
  postgres: { major: 17, status: 'ACTIVE_HEALTHY' },
  advisor: { status: 'clear', findingCount: 0 },
  catalog: { businessRowsRead: 0 },
  managedBackend: { liveSchemaVersion: 11, localTargetVersion: 11, versionDrift: 0, browserRolesDenied: true },
  controls: { databaseWrites: 0, providerMutations: 0 },
  asOf: '2026-08-25T00:00:00.000+06:30',
}
const readiness = {
  contract: 'supermega.managed-pilot-readiness.v5',
  overall: { blockingGateIds: ['preview_rehearsal', 'pilot_evidence', 'production_activation'], hostedActivationReady: false },
  previewRehearsal: {
    proofComplete: false,
    exactCandidateRequired: true,
    productionRefsRejected: true,
    productionDataRejected: true,
    privilegedRuntimeCredentialsRejected: true,
  },
}

async function proposal(overrides = {}) {
  return buildSupabasePreviewRehearsalProposal({
    sourceReceipts,
    securityAudit,
    readiness,
    generatedAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  })
}

test('builds a clean empty Supabase preview rehearsal proposal', async () => {
  const built = await proposal()
  assert.equal(built.contract, SUPABASE_PREVIEW_REHEARSAL_PROPOSAL_CONTRACT)
  assert.equal(built.mode, 'owner_approval_required')
  assert.equal(built.state, 'prepared-not-executed')
  assert.equal(built.previewBranch.kind, 'clean_empty_ephemeral_preview')
  assert.equal(built.previewBranch.maximumLifetimeHours, 24)
  assert.equal(built.previewBranch.startsWithProductionData, false)
  assert.equal(built.previewBranch.productionRefsAllowed, false)
  assert.equal(built.previewBranch.privilegedRuntimeCredentialsAllowed, false)
  assert.equal(built.previewBranch.deleteAfterEvidence, true)
  assert.equal(built.migrationPlan.migrationCount, 15)
  assert.equal(built.migrationPlan.privateMigrationCount, 14)
  assert.equal(built.migrationPlan.schemaVersion, 13)
  assert.equal(built.migrationPlan.publicBaseline, '20260711081300_public_legacy_baseline.sql')
  assert.equal(built.migrationPlan.finalMigration, '20260818090000_private_trial_backend_v13_billing_entitlement_read.sql')
  assert.equal(built.migrationPlan.sourceAheadOfLiveProduction, true)
  assert.equal(built.gates.previewRehearsal.proofComplete, false)
  assert.ok(built.requiredEvidence.includes('metadata-only-schema-fingerprint-comparison'))
  assert.ok(built.requiredEvidence.includes('private-storage-six-request-privacy-proof'))
  assert.equal(built.controls.supabaseBranchCreationApproved, false)
  assert.equal(built.controls.supabaseBranchCreated, false)
  assert.equal(built.controls.productionProjectMutated, false)
  assert.equal(built.controls.productionDataCopied, false)
  assert.equal(built.controls.githubWritesAllowed, false)
  assert.match(built.digest, /^sha256:[0-9a-f]{64}$/)
})

test('rejects production data, privileged credentials, mutation authority, and tampering', async () => {
  const built = await proposal()
  await assert.rejects(
    validateSupabasePreviewRehearsalProposal({ ...built, previewBranch: { ...built.previewBranch, startsWithProductionData: true } }),
    /supabase_preview_rehearsal_proposal_data_boundary_invalid/,
  )
  await assert.rejects(
    validateSupabasePreviewRehearsalProposal({ ...built, previewBranch: { ...built.previewBranch, privilegedRuntimeCredentialsAllowed: true } }),
    /supabase_preview_rehearsal_proposal_secret_boundary_invalid/,
  )
  await assert.rejects(
    validateSupabasePreviewRehearsalProposal({ ...built, controls: { ...built.controls, productionProjectMutated: true } }),
    /supabase_preview_rehearsal_proposal_controls_invalid/,
  )
  await assert.rejects(
    validateSupabasePreviewRehearsalProposal({ ...built, digest: `sha256:${'f'.repeat(64)}` }),
    /supabase_preview_rehearsal_proposal_digest_invalid/,
  )
})

test('rejects unsafe production baselines and does not carry credentials', async () => {
  await assert.rejects(
    proposal({ securityAudit: { ...securityAudit, advisor: { status: 'attention', findingCount: 1 } } }),
    /supabase_preview_rehearsal_security_advisor_not_clear/,
  )
  await assert.rejects(
    proposal({ securityAudit: { ...securityAudit, catalog: { businessRowsRead: 1 } } }),
    /supabase_preview_rehearsal_security_rows_read_invalid/,
  )
  await assert.rejects(
    proposal({ securityAudit: { ...securityAudit, controls: { databaseWrites: 1, providerMutations: 0 } } }),
    /supabase_preview_rehearsal_security_mutation_invalid/,
  )
  const text = JSON.stringify(await proposal())
  assert.doesNotMatch(text, /postgres(?:ql)?:\/\//i)
  assert.doesNotMatch(text, /sb_secret_|service_role|password=/i)
})
