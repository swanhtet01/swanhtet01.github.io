import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import {
  SUPABASE_PREVIEW_REHEARSAL_PROPOSAL_CONTRACT,
  buildSupabasePreviewRehearsalProposal,
  validateSupabasePreviewRehearsalProposal,
  validatePreviewMigrationEntries,
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
    generatedAt: '2026-10-21T00:00:00.000Z',
    ...overrides,
  })
}

test('builds a data-less preview proposal with branch mode and schema unverified', async () => {
  const built = await proposal()
  assert.equal(built.contract, SUPABASE_PREVIEW_REHEARSAL_PROPOSAL_CONTRACT)
  assert.equal(built.mode, 'owner_approval_required')
  assert.equal(built.state, 'prepared-not-executed')
  assert.equal(built.previewBranch.kind, 'data_less_ephemeral_preview_schema_unverified')
  assert.equal(built.previewBranch.creationMode, 'unselected')
  assert.equal(built.previewBranch.maximumLifetimeHours, 24)
  assert.equal(built.previewBranch.startsWithProductionData, false)
  assert.equal(built.previewBranch.includeProductionData, false)
  assert.equal(built.previewBranch.branchSchemaVerified, false)
  assert.equal(built.previewBranch.costConfirmed, false)
  assert.equal(built.previewBranch.productionRefsAllowed, false)
  assert.equal(built.previewBranch.privilegedRuntimeCredentialsAllowed, false)
  assert.equal(built.previewBranch.deleteAfterEvidence, true)
  assert.equal(built.migrationPlan.migrationCount, 33)
  assert.equal(built.migrationPlan.privateMigrationCount, 32)
  assert.equal(built.migrationPlan.schemaVersion, 13)
  assert.equal(built.migrationPlan.publicBaseline, '20260711081300_public_legacy_baseline.sql')
  assert.equal(built.migrationPlan.finalMigration, '20261020175519_access_control_member_read_hardening.sql')
  assert.ok(!built.migrationPlan.migrations.some(entry => entry.name === '20261014103000_website_custom_domain_bindings.sql'))
  assert.ok(!built.migrationPlan.migrations.some(entry => entry.name === '20261016143945_optimize_sites_inquiry_rls_initplans.sql'))
  assert.equal(built.productionBaseline.schemaVersionAtAudit, 11)
  assert.equal(built.migrationPlan.historicalAuditSchemaVersion, 11)
  assert.equal(built.migrationPlan.sourceAheadOfHistoricalAudit, true)
  assert.equal(built.migrationPlan.currentProductionSchemaVersionVerified, false)
  assert.equal(built.migrationPlan.branchApplyStrategy, 'inspect_creation_mode_and_actual_catalog_then_review_delta')
  assert.equal(built.migrationPlan.manualFullChainReplayAllowed, false)
  assert.equal(built.migrationPlan.providerAutomaticReplayReviewed, false)
  assert.equal(built.migrationPlan.currentLiveHistoryReconciled, false)
  assert.equal(built.productionBaseline.evidenceClassification, 'historical-audit-only')
  assert.equal(built.productionBaseline.currentStateRevalidated, false)
  assert.equal(built.productionBaseline.currentCandidateProven, false)
  assert.equal(built.gates.productionMigrationReplay.status, 'blocked')
  assert.equal(built.gates.productionMigrationReplay.newPreviewCreationAllowed, false)
  assert.equal(built.gates.productionMigrationReplay.currentProviderStateRevalidated, false)
  assert.ok(built.requiredEvidence.includes('branch-creation-mode-and-workflow-reviewed'))
  assert.ok(built.requiredEvidence.includes('production-and-branch-migration-history-reconciled-before-any-delta'))
  assert.ok(built.requiredEvidence.includes('data-less-branch-and-actual-schema-verified'))
  assert.ok(built.requiredEvidence.includes('only-reviewed-manual-delta-run-after-provider-branch-workflow'))
  assert.ok(built.requiredEvidence.includes('durable-attempt-budget-restart-concurrency-and-restored-limit-proof'))
  assert.equal(built.gates.previewRehearsal.proofComplete, false)
  assert.ok(built.requiredEvidence.includes('metadata-only-schema-fingerprint-comparison'))
  assert.ok(built.requiredEvidence.includes('private-storage-six-request-privacy-proof'))
  assert.equal(built.controls.supabaseBranchCreationApproved, false)
  assert.equal(built.controls.supabaseBranchCreated, false)
  assert.equal(built.controls.productionProjectMutated, false)
  assert.equal(built.controls.productionDataCopied, false)
  assert.equal(built.controls.githubWritesAllowed, false)
  assert.equal(built.executionPacketAfterApproval.status, 'blocked-pending-branch-mode-and-history-adapter')
  assert.equal(built.executionPacketAfterApproval.commandTemplate, null)
  assert.match(built.ownerApprovalTemplate, /Manual replay of the full source chain is not approved/)
  assert.match(built.ownerApprovalTemplate, /branch creation mode and automatic migration replay are reviewed/)
  assert.match(built.ownerApprovalTemplate, /separately confirm the quoted branch cost/)
  assert.match(built.digest, /^sha256:[0-9a-f]{64}$/)
})

test('records generation time and rejects malformed or backdated source packets', async () => {
  const before = Date.now()
  const built = await proposal({ generatedAt: undefined })
  assert.ok(Date.parse(built.generatedAt) >= before && Date.parse(built.generatedAt) <= Date.now())
  for (const generatedAt of ['2026-10-14T00:00:00.000Z', 'invalid', '2026-10-15']) {
    await assert.rejects(proposal({ generatedAt }), /supabase_preview_rehearsal_proposal_timestamp_invalid/)
    await assert.rejects(validateSupabasePreviewRehearsalProposal({ ...built, generatedAt }), /supabase_preview_rehearsal_proposal_timestamp_invalid/)
  }
})

test('binds exact ordered public baseline and thirty-two private migrations through access-control hardening', async () => {
  const built = await proposal()
  const entries = built.migrationPlan.migrations
  assert.deepEqual(entries.slice(-17).map(entry => entry.name), [
    '20260915184728_website_customer_review_storage.sql',
    '20260915191528_website_review_entitlement_proof.sql',
    '20260918011500_website_customer_acceptance.sql',
    '20260924190304_ecommerce_review_entitlement_proof.sql',
    '20260924194557_ecommerce_customer_review_storage.sql',
    '20260924231714_ecommerce_customer_decisions.sql',
    '20260929171000_ecommerce_decision_review_fk_index.sql',
    '20260930010000_app_rls_initplan_optimization.sql',
    '20261010063000_website_publishing_and_inquiries.sql',
    '20261010070000_website_published_hero_media.sql',
    '20261010120857_website_inquiry_followup.sql',
    '20261014090000_website_channel_stable_update.sql',
    '20261015091500_website_six_page_reviews.sql',
    '20261015202629_ecommerce_operator_review_grant.sql',
    '20261019070000_ecommerce_operator_management_boundary.sql',
    '20261019103000_ecommerce_review_shared_state_lock.sql',
    '20261020175519_access_control_member_read_hardening.sql',
  ])
  assert.equal(validatePreviewMigrationEntries(entries), entries)
  for (const mutate of [list => list.pop(), list => list.push({ ...list.at(-1) }),
    list => { list[1] = { ...list[0] } }, list => { [list[1], list[2]] = [list[2], list[1]] },
    list => { list.at(-1).name = '20261010120857_unreviewed.sql' },
    list => { list.at(-1).path = '../unreviewed.sql' },
    list => { list.at(-1).digest = '' }, list => { list.at(-1).execute = true }]) {
    const altered = structuredClone(entries)
    mutate(altered)
    assert.throws(() => validatePreviewMigrationEntries(altered), /supabase_preview_rehearsal_migration_inventory_invalid/)
  }
})

test('rehashing cannot hide omitted budget or Website evidence or turn historical audit into current proof', async () => {
  for (const mutate of [p => { p.migrationPlan.migrations.at(-1).digest = `sha256:${'1'.repeat(64)}` },
    p => { p.productionBaseline.currentCandidateProven = true },
    p => { p.productionBaseline.currentStateRevalidated = true },
    p => { p.migrationPlan.currentProductionSchemaVersionVerified = true },
    p => { p.migrationPlan.historicalAuditSchemaVersion = 13 },
    p => { p.requiredEvidence = p.requiredEvidence.filter(e => !e.startsWith('durable-attempt-budget-')) },
    p => { p.requiredEvidence = p.requiredEvidence.filter(e => e !== 'website-review-recipient-isolation-entitlement-and-session-revocation') },
    p => { p.requiredEvidence = p.requiredEvidence.filter(e => e !== 'website-review-and-feedback-nonempty-backup-restore') },
    p => { p.requiredEvidence = p.requiredEvidence.filter(e => e !== 'website-acceptance-exact-revision-idempotency-and-decision-race-proof') },
    p => { p.requiredEvidence = p.requiredEvidence.filter(e => e !== 'website-acceptance-nonempty-backup-restore-and-no-publication-authority') }]) {
    const altered = structuredClone(await proposal())
    mutate(altered)
    const { digest: ignored, ...body } = altered
    altered.digest = `sha256:${createHash('sha256').update(JSON.stringify(body)).digest('hex')}`
    await assert.rejects(validateSupabasePreviewRehearsalProposal(altered), /supabase_preview_rehearsal_proposal_(migration_digest_invalid|production_baseline_invalid|historical_schema_invalid|evidence_missing)/)
  }
})

test('a rehashed proposal cannot waive branch-mode, history, and cost gates', async () => {
  for (const mutate of [
    p => { p.gates.productionMigrationReplay.status = 'ready' },
    p => { p.gates.productionMigrationReplay.newPreviewCreationAllowed = true },
    p => { p.gates.productionMigrationReplay.currentProviderStateRevalidated = true },
    p => { p.requiredEvidence = p.requiredEvidence.filter(e => e !== 'production-and-branch-migration-history-reconciled-before-any-delta') },
    p => { p.requiredEvidence = p.requiredEvidence.filter(e => e !== 'branch-creation-mode-and-workflow-reviewed') },
    p => { p.requiredEvidence = p.requiredEvidence.filter(e => e !== 'only-reviewed-manual-delta-run-after-provider-branch-workflow') },
    p => { p.previewBranch.costConfirmed = true },
    p => { p.previewBranch.includeProductionData = true },
    p => { p.previewBranch.creationMode = 'dashboard' },
    p => { p.previewBranch.branchSchemaVerified = true },
    p => { p.migrationPlan.manualFullChainReplayAllowed = true },
    p => { p.migrationPlan.providerAutomaticReplayReviewed = true },
    p => { p.migrationPlan.currentLiveHistoryReconciled = true },
    p => { p.executionPacketAfterApproval.commandTemplate = 'apply all migrations' },
  ]) {
    const altered = structuredClone(await proposal())
    mutate(altered)
    const { digest: ignored, ...body } = altered
    altered.digest = `sha256:${createHash('sha256').update(JSON.stringify(body)).digest('hex')}`
    await assert.rejects(validateSupabasePreviewRehearsalProposal(altered), /supabase_preview_rehearsal_proposal_(replay_gate_invalid|evidence_missing|cost_gate_invalid|data_boundary_invalid|branch_kind_invalid|branch_strategy_invalid|execution_packet_invalid)/)
  }
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
