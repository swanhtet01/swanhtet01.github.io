import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DATABASE_REHEARSAL_EVIDENCE_SCHEMA,
  buildSanitizedProof,
  validateSanitizedProof,
} from './record_postgres17_rehearsal.mjs'

const checkNames = [
  'approval_agent_row_spoof_denied', 'approval_decision_event_immutable', 'approval_exact_retry', 'approval_human_decision_once',
  'approval_mutated_retry_rejected', 'approval_record_immutable', 'approval_requester_read_scoped', 'approval_reviewer_reads_all',
  'approval_service_row_spoof_denied', 'approval_terminal_replay_rejected', 'backup_created', 'browser_role_isolation',
  'capability_denial', 'capability_scoped_event_reads', 'capability_scoped_reads', 'dedicated_runtime_role_validated',
  'event_immutability', 'identity_transaction_local', 'invalid_initial_version_denied', 'legacy_actor_denied',
  'managed_exact_retry', 'managed_human_attribution', 'managed_owner_authorization_durable',
  'managed_supabase_session_revocation_enforced',
  'managed_activation_atomic_rollback', 'managed_activation_idempotent_replay', 'managed_context_activation_evidence_bound',
  'managed_context_authenticated_identity_enforced', 'managed_context_owner_capability_enforced',
  'managed_context_retention_idempotent_replay', 'managed_context_retention_rls_audited',
  'managed_context_summary_readback', 'managed_context_validation_zero_write', 'managed_suspension_database_enforced',
  'managed_suspension_blocks_additional_member', 'managed_suspension_write_denied',
  'managed_workspace_discovery_actor_scoped', 'managed_workspace_discovery_suspension_filtered',
  'managed_production_job_to_output', 'managed_website_to_commerce_journey',
  'migration_chain_applied', 'mismatched_identity_denied', 'optimistic_concurrency',
  'public_browser_quarantine_enforced', 'public_browser_quarantine_idempotent', 'restore_completed',
  'restored_data_preserved', 'restored_database_validated', 'restored_public_browser_quarantine_preserved', 'revocation', 'runtime_role_settings_empty',
  'runtime_set_role_denied', 'server_timestamps', 'tenant_isolation', 'v1_upgrade_preserved', 'write_capability_implies_read',
]

const implementation = { digest: `sha256:${'a'.repeat(64)}`, fileCount: 11, paths: Array.from({ length: 11 }, (_, index) => `path-${index}`) }
const context = {
  recordedAt: '2026-07-31T10:00:00.000Z',
  implementationCommit: 'b'.repeat(40),
  implementation,
  archive: { bytes: 333_927_270, sha256: 'c'.repeat(64) },
}
const raw = {
  contract: 'supermega_postgres17_rehearsal_v1', ok: true, ready: true, status: 'rehearsed',
  engine: { major: 17, version: '17.10', tls_active: true, loopback_only: true, start_mode: 'pg_ctl_restricted_token' },
  migrations: { count: 12, schema_version: 11, production_validator_ready: true },
  authority: { actor_identity_source: 'trusted_backend_transaction_context', database_authenticates_individual_actors: false, runtime_credentials_must_remain_server_only: true },
  implementation: { digest: implementation.digest, paths: implementation.paths },
  checks: Object.fromEntries(checkNames.map((name) => [name, true])),
  recovery: { backup_nonempty: true, format: 'pg_dump_custom', restored_schema_version: 11 },
  storage: { catalog_mode: 'local_private_fixture', hosted_storage_privacy_proof_required: true, policy_count: 0, public_bucket_count: 0 },
  cleanup_complete: true, secret_values_exposed: false, production_mutated: false, supabase_mutated: false, vercel_mutated: false,
}

test('builds a sanitized digest-bound local PostgreSQL 17 proof without hosted claims', () => {
  const proof = buildSanitizedProof(raw, context)
  assert.equal(proof.schemaVersion, DATABASE_REHEARSAL_EVIDENCE_SCHEMA)
  assert.equal(proof.implementationDigest, implementation.digest)
  assert.equal(proof.checks.restoreCompletedOnFreshCluster, true)
  assert.equal(proof.storage.hostedStoragePrivacyProofRequired, true)
  assert.equal(proof.localVerification.externallyHosted, false)
  assert.deepEqual(validateSanitizedProof(proof, implementation), {
    ok: true,
    contract: DATABASE_REHEARSAL_EVIDENCE_SCHEMA,
    checks: 56,
    implementationFiles: 11,
    hostedActivationProven: false,
  })
})

test('rejects failed checks, stale implementation evidence, and overclaimed scope', () => {
  const failed = structuredClone(raw)
  failed.checks.tenant_isolation = false
  assert.throws(() => buildSanitizedProof(failed, context), /database_rehearsal_check_failed/)

  const proof = buildSanitizedProof(raw, context)
  assert.throws(() => validateSanitizedProof(proof, { ...implementation, digest: `sha256:${'d'.repeat(64)}` }), /database_rehearsal_evidence_stale/)
  const mismatchedRunner = structuredClone(raw)
  mismatchedRunner.implementation.digest = `sha256:${'e'.repeat(64)}`
  assert.throws(() => buildSanitizedProof(mismatchedRunner, context), /database_rehearsal_runner_implementation_mismatch/)
  proof.localVerification.externallyHosted = true
  assert.throws(() => validateSanitizedProof(proof, implementation), /database_rehearsal_evidence_scope_overclaimed/)
})
