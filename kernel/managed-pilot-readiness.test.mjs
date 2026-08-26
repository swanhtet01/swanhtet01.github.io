import test from 'node:test'
import assert from 'node:assert/strict'

import { buildManagedPilotReadiness, readinessDigest, validateManagedPilotReadiness } from './managed-pilot-readiness.mjs'

const products = ['shop', 'plant', 'website', 'ecommerce'].map((id) => ({
  id,
  status: 'release-candidate-local',
  nextGate: `${id} hosted proof`,
  localAutomation: {
    contract: 'supermega.product-work-authority.v2',
    productId: id,
    workOrderId: `${id}-managed-pilot`,
    status: 'owner-gated',
    workOrder: `${id}: run managed pilot`,
    reason: 'Named operator and isolated tenant are missing.',
  },
}))
const sourceReceipts = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((path) => ({ path, digest: readinessDigest(path) }))
const selfServePilotProof = {
  contract: 'supermega.self-serve-pilot-proof.v1',
  approvalId: 'self-serve-proof-v11c-20260816',
  recordedAt: '2026-08-16T17:00:52.000Z',
  branch: { deleteAfterEvidence: true, deletedAt: '2026-08-16T17:00:52.000Z' },
  audit: {
    ok: true,
    sessions_performed: 3,
    statements_performed: 23,
    store_calls_performed: 4,
    schema_version_observed: 11,
    secrets_exposed: false,
    tenant_rows_exposed: false,
    writes_confined_to_fixtures: true,
    proofs: [
      { id: 'window_closed_refused' },
      { id: 'claim_creates_isolated_tenant' },
      { id: 'exact_idempotent_replay' },
      { id: 'different_user_same_claim_rejected', conflict_class: 'claim_code_conflict' },
      { id: 'created_event_immutable' },
      { id: 'cross_tenant_invisible' },
    ],
  },
}
const input = {
  portfolio: { schemaVersion: 'supermega.hq.portfolio.v3', products },
  databaseEvidence: {
    schemaVersion: 'supermega.hq.database-rehearsal.v2',
    recordedAt: '2026-07-31T10:00:00.000Z',
    checks: {
      ...Object.fromEntries(Array.from({ length: 53 }, (_, index) => [`check${index}`, true])),
      publicBrowserQuarantineEnforced: true,
      publicBrowserQuarantineIdempotent: true,
      restoredPublicBrowserQuarantinePreserved: true,
    },
    storage: { hostedStoragePrivacyProofRequired: true },
    localVerification: { externallyHosted: false },
  },
  storageAudit: 'Status: local verifier ready; hosted proof blocked',
  securityAudit: {
    contract: 'supermega.supabase-security-advisor-audit.v2',
    asOf: '2026-08-04T05:28:37.850Z',
    projectRef: 'abcdefghijklmnopqrst',
    targetClassification: 'protected-production',
    postgres: { major: 17 },
    advisor: { status: 'blocked', findingCount: 27 },
    catalog: { sequenceCount: 2, nonTableRelationCount: 0, publicRoutineCount: 0, browserCallableRoutineCount: 0 },
    managedBackend: { liveSchemaVersion: 7, localTargetVersion: 11, versionDrift: 4, browserRolesDenied: true, metadataRlsEnabled: false, storageBucketCount: 0 },
    conclusion: { productionMutationAuthorized: false, indirectExposureAudited: true, nextAction: 'Rehearse hardening on an isolated target.' },
    controls: { databaseWrites: 0 },
  },
  hqNow: 'Live operating mode: `isolated_demo`\nLive managed persistence ready: `false`\nLive security ready: `false`\nno release drift is present\nNo self-serve pilot tenant',
  packageManifest: { supermega: { productionSupabaseTargetStatus: 'protected-unapproved', productionSupabaseProjectRef: 'abcdefghijklmnopqrst' } },
  sourceReceipts,
}

test('derives one blocked four-product ledger from current bounded evidence', () => {
  const ledger = buildManagedPilotReadiness(input)
  assert.equal(ledger.contract, 'supermega.managed-pilot-readiness.v5')
  assert.equal(ledger.pilotMode, 'owner_named')
  assert.equal(ledger.overall.blockingGateCount, 6)
  assert.deepEqual(ledger.overall.blockingGateIds, ['preview_rehearsal', 'managed_persistence', 'storage_privacy', 'security', 'pilot_evidence', 'production_activation'])
  assert.equal(ledger.gates[0].id, 'preview_rehearsal')
  assert.equal(ledger.gates[0].status, 'blocked')
  assert.equal(ledger.previewRehearsal.proofComplete, false)
  assert.equal(
    ledger.gates.find((gate) => gate.id === 'pilot_evidence')?.evidence,
    'Owner-named Shop pilot proof is absent. Required proof remains: shop hosted proof',
  )
  assert.equal(
    ledger.gates.find((gate) => gate.id === 'security')?.evidence,
    '27 fail-closed public-table advisor findings remain; browser object/default grants are not yet quarantined on hosted Supabase, and protected managed schema v7 trails local target v11.',
  )
  assert.equal(ledger.liveProduction.schemaVersion, 7)
  assert.equal(ledger.liveProduction.publicBrowserQuarantine, true)
  assert.equal(ledger.liveProduction.managedWritesEnabled, false)
  assert.equal(ledger.pilotEvidence.pilotMode, 'owner_named')
  assert.equal(ledger.pilotEvidence.requiredAcceptedConsecutiveRuns, 20)
  assert.equal(ledger.pilotEvidence.acceptedConsecutiveRuns, 0)
  assert.deepEqual(ledger.pilotEvidence.requiredPilotDayIndexes, [1, 2, 3, 4, 5])
  assert.deepEqual(ledger.pilotEvidence.acceptedConsecutivePilotDayIndexes, [])
  assert.equal(ledger.pilotEvidence.pilotSequenceCoverageMet, false)
  assert.equal(ledger.pilotEvidence.syntheticEvidenceAccepted, false)
  assert.doesNotMatch(JSON.stringify(ledger), /app_product_contract_drift/)
  assert.equal(ledger.products.length, 4)
  assert.equal(ledger.controls.modelCallsRequiredToBuild, 0)
  assert.equal(ledger.asOf, '2026-08-04T05:28:37.850Z')
  assert.equal(ledger.founderDecision.target.environment, 'production')
  assert.equal(ledger.founderDecision.target.maximumLifetimeHours, null)
  assert.equal(ledger.founderDecision.target.startsWithProductionData, false)
  assert.equal(ledger.founderDecision.operator.productId, 'shop')
  assert.equal(ledger.founderDecision.authority, 'proposal_only')
  assert.equal(ledger.founderDecision.createsAuthority, false)
  assert.equal(ledger.founderDecision.approvalReceipt, null)
  assert.ok(ledger.founderDecision.doesNotAuthorize.includes('additional_tenant_activation'))
  assert.equal(ledger.securityAudit.findingCount, 27)
  assert.equal(ledger.securityAudit.productionMutationAuthorized, false)
  assert.equal(ledger.securityAudit.databaseWrites, 0)
  assert.deepEqual(ledger.overall.nextAction, {
    kind: 'founder_decision',
    decisionId: 'managed-production-activation',
    requires: ['approve_runtime_role_provisioning', 'approve_first_named_owner_identity', 'approve_exact_production_release', 'approve_managed_activation_window'],
    targetEnvironment: 'production',
    operatorProductId: 'shop',
    maximumLifetimeHours: null,
  })
  assert.equal(ledger.gates.at(-1)?.id, 'production_activation')
  assert.equal(ledger.gates.at(-1)?.status, 'blocked')
  assert.equal(ledger.controls.productionWritesEnabled, false)
  assert.equal(ledger.controls.ownerApprovalRequired, true)
  assert.ok(ledger.controls.forbiddenUntilReady.includes('production_write'))
  assert.ok(ledger.controls.forbiddenUntilReady.includes('deploy'))
  assert.ok(ledger.controls.forbiddenUntilReady.includes('hosted_scheduler_activation'))
  assert.equal(validateManagedPilotReadiness(ledger), ledger)
})

test('records the self-serve pilot proof independently from production activation', () => {
  const withoutProof = buildManagedPilotReadiness(input)
  assert.equal(withoutProof.selfServePilot.proofComplete, false)
  assert.equal(withoutProof.gates.some((gate) => gate.id === 'self_serve_pilot'), false)
  assert.equal(withoutProof.gates.find((gate) => gate.id === 'pilot_evidence').status, 'blocked')

  const proven = buildManagedPilotReadiness({ ...input, selfServePilotEvidence: selfServePilotProof })
  assert.equal(proven.selfServePilot.proofComplete, true)
  assert.equal(proven.selfServePilot.approvalId, 'self-serve-proof-v11c-20260816')
  assert.equal(proven.selfServePilot.schemaVersionProven, 11)
  assert.equal(proven.selfServePilot.liveActivationBlockedOn, 'production_activation')
  assert.equal(proven.gates.find((gate) => gate.id === 'pilot_evidence').status, 'blocked')
  assert.match(proven.gates.find((gate) => gate.id === 'pilot_evidence').evidence, /Owner-named Shop pilot proof is absent/)
  assert.equal(validateManagedPilotReadiness(proven), proven)
})

test('rejects a self-serve pilot proof whose cross-actor conflict is not claim_code_conflict', () => {
  const tampered = structuredClone(selfServePilotProof)
  tampered.audit.proofs[3].conflict_class = 'wrong_class'
  assert.throws(
    () => buildManagedPilotReadiness({ ...input, selfServePilotEvidence: tampered }),
    /managed_pilot_readiness_self_serve_proof_invalid/,
  )
})

test('text evidence digests are stable across Git line-ending normalization', () => {
  assert.equal(readinessDigest('line one\r\nline two\r\n'), readinessDigest('line one\nline two\n'))
})

test('rejects hosted overclaims and product authority drift', () => {
  const hosted = structuredClone(input)
  hosted.hqNow = hosted.hqNow.replace('`false`', '`true`')
  assert.throws(() => buildManagedPilotReadiness(hosted), /managed_pilot_readiness_live_boundary_invalid/)
  const ungated = structuredClone(input)
  ungated.portfolio.products[0].localAutomation.status = 'ready-local'
  assert.throws(() => buildManagedPilotReadiness(ungated), /managed_pilot_readiness_product_invalid/)
})

test('rejects database evidence that lacks the 56-check quarantine-proving rehearsal', () => {
  const shortChecks = structuredClone(input)
  delete shortChecks.databaseEvidence.checks.check52
  assert.throws(() => buildManagedPilotReadiness(shortChecks), /managed_pilot_readiness_database_evidence_invalid/)

  const noQuarantine = structuredClone(input)
  delete noQuarantine.databaseEvidence.checks.publicBrowserQuarantineEnforced
  noQuarantine.databaseEvidence.checks.check53 = true
  assert.throws(() => buildManagedPilotReadiness(noQuarantine), /managed_pilot_readiness_database_quarantine_invalid/)
})

test('rejects evidence or ledger state that could touch protected production', () => {
  const approvedTarget = structuredClone(input)
  approvedTarget.packageManifest.supermega.productionSupabaseTargetStatus = 'approved'
  assert.throws(() => buildManagedPilotReadiness(approvedTarget), /managed_pilot_readiness_production_boundary_invalid/)

  const wrongProject = structuredClone(input)
  wrongProject.securityAudit.projectRef = 'bcdefghijklmnopqrstu'
  assert.throws(() => buildManagedPilotReadiness(wrongProject), /managed_pilot_readiness_security_audit_invalid/)

  const mutationAuthorized = structuredClone(input)
  mutationAuthorized.securityAudit.conclusion.productionMutationAuthorized = true
  assert.throws(() => buildManagedPilotReadiness(mutationAuthorized), /managed_pilot_readiness_security_audit_invalid/)

  const writesPerformed = structuredClone(input)
  writesPerformed.securityAudit.controls.databaseWrites = 1
  assert.throws(() => buildManagedPilotReadiness(writesPerformed), /managed_pilot_readiness_security_audit_invalid/)

  const cleanAdvisor = structuredClone(input)
  cleanAdvisor.securityAudit.advisor.findingCount = 0
  assert.throws(() => buildManagedPilotReadiness(cleanAdvisor), /managed_pilot_readiness_security_audit_invalid/)

  const missingAudit = structuredClone(input)
  delete missingAudit.securityAudit
  assert.throws(() => buildManagedPilotReadiness(missingAudit), /managed_pilot_readiness_security_audit_invalid/)

  const productionEnabled = buildManagedPilotReadiness(input)
  productionEnabled.controls.productionWritesEnabled = true
  assert.throws(() => validateManagedPilotReadiness(productionEnabled), /managed_pilot_readiness_controls_invalid/)

  const activationUnlocked = buildManagedPilotReadiness(input)
  activationUnlocked.gates.at(-1).status = 'ready-hosted'
  assert.throws(() => validateManagedPilotReadiness(activationUnlocked), /managed_pilot_readiness_gates_invalid/)

  const laundered = buildManagedPilotReadiness(input)
  laundered.securityAudit.findingCount = 1
  assert.throws(() => validateManagedPilotReadiness(laundered), /managed_pilot_readiness_gate_evidence_invalid/)

  const overwritten = buildManagedPilotReadiness(input)
  overwritten.securityAudit.productionMutationAuthorized = true
  assert.throws(() => validateManagedPilotReadiness(overwritten), /managed_pilot_readiness_security_audit_invalid/)
})

test('rejects a founder decision that changes the exact empty production target', () => {
  const ledger = buildManagedPilotReadiness(input)
  ledger.founderDecision.target.production = false
  assert.throws(() => validateManagedPilotReadiness(ledger), /managed_pilot_readiness_founder_decision_invalid/)

  const longLived = buildManagedPilotReadiness(input)
  longLived.founderDecision.target.maximumLifetimeHours = 24
  assert.throws(() => validateManagedPilotReadiness(longLived), /managed_pilot_readiness_founder_decision_invalid/)

  const seeded = buildManagedPilotReadiness(input)
  seeded.founderDecision.target.startsWithProductionData = true
  assert.throws(() => validateManagedPilotReadiness(seeded), /managed_pilot_readiness_founder_decision_invalid/)
})

test('rejects broadened, incomplete, or contradictory proposal authority', () => {
  const broadened = buildManagedPilotReadiness(input)
  broadened.founderDecision.proposedActions.push('activate_additional_tenant')
  assert.throws(() => validateManagedPilotReadiness(broadened), /managed_pilot_readiness_founder_decision_invalid/)

  const incomplete = buildManagedPilotReadiness(input)
  incomplete.founderDecision.doesNotAuthorize.pop()
  assert.throws(() => validateManagedPilotReadiness(incomplete), /managed_pilot_readiness_founder_decision_invalid/)

  const contradictory = buildManagedPilotReadiness(input)
  contradictory.founderDecision.doesNotAuthorize[0] = contradictory.founderDecision.proposedActions[0]
  assert.throws(() => validateManagedPilotReadiness(contradictory), /managed_pilot_readiness_founder_decision_invalid/)

  const authoritative = buildManagedPilotReadiness(input)
  authoritative.founderDecision.createsAuthority = true
  authoritative.founderDecision.approvalReceipt = { approvedBy: 'founder' }
  assert.throws(() => validateManagedPilotReadiness(authoritative), /managed_pilot_readiness_founder_decision_invalid/)

  const collapsed = buildManagedPilotReadiness(input)
  collapsed.founderDecision.proposedActions = [collapsed.founderDecision.proposedActions.join(',')]
  collapsed.founderDecision.doesNotAuthorize = [collapsed.founderDecision.doesNotAuthorize.join(',')]
  assert.throws(() => validateManagedPilotReadiness(collapsed), /managed_pilot_readiness_founder_decision_invalid/)
})

test('rejects an unvalidated or broadened founder ask in overall.nextAction', () => {
  const prose = buildManagedPilotReadiness(input)
  prose.overall.nextAction = 'Approve one 24-hour, data-less Supabase preview branch and name one Shop pilot operator.'
  assert.throws(() => validateManagedPilotReadiness(prose), /managed_pilot_readiness_next_action_invalid/)

  const renamed = buildManagedPilotReadiness(input)
  renamed.overall.nextAction.decisionId = 'activate-production'
  assert.throws(() => validateManagedPilotReadiness(renamed), /managed_pilot_readiness_next_action_invalid/)

  const broadenedAsk = buildManagedPilotReadiness(input)
  broadenedAsk.overall.nextAction.requires = ['approve_runtime_role_provisioning']
  assert.throws(() => validateManagedPilotReadiness(broadenedAsk), /managed_pilot_readiness_next_action_invalid/)

  const divergent = buildManagedPilotReadiness(input)
  divergent.overall.nextAction.targetEnvironment = 'preview_branch'
  assert.throws(() => validateManagedPilotReadiness(divergent), /managed_pilot_readiness_next_action_invalid/)

  const smuggled = buildManagedPilotReadiness(input)
  smuggled.overall.nextAction.alsoApprove = 'production_write'
  assert.throws(() => validateManagedPilotReadiness(smuggled), /managed_pilot_readiness_next_action_invalid/)

  const extended = buildManagedPilotReadiness(input)
  extended.overall.nextAction.maximumLifetimeHours = 24
  assert.throws(() => validateManagedPilotReadiness(extended), /managed_pilot_readiness_next_action_invalid/)
})

test('rejects tampered receipts and derived-ledger drift', () => {
  const tampered = buildManagedPilotReadiness(input)
  tampered.sourceReceipts = tampered.sourceReceipts.slice(0, -1)
  assert.throws(() => validateManagedPilotReadiness(tampered), /managed_pilot_readiness_sources_invalid/)

  const swapped = buildManagedPilotReadiness(input)
  swapped.sourceReceipts = [...swapped.sourceReceipts.slice(1), swapped.sourceReceipts[0]]
  assert.throws(() => validateManagedPilotReadiness(swapped), /managed_pilot_readiness_digest_invalid/)

  const sixReceipts = structuredClone(input)
  sixReceipts.sourceReceipts = sixReceipts.sourceReceipts.slice(0, 6)
  assert.throws(() => buildManagedPilotReadiness(sixReceipts), /managed_pilot_readiness_sources_invalid/)
})
