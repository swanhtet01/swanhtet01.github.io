import { createHash } from 'node:crypto'

export const DATABASE_REHEARSAL_EVIDENCE_SCHEMA = 'supermega.hq.database-rehearsal.v3'
const schemaProfile = 'v13-self-serve'
const catalogContract = 'supermega_private_trial_database_v13_self_serve_v1'

const migrations = [
  '20260722004500_private_trial_backend_role_preflight.sql',
  '20260722005134_private_trial_backend_foundation.sql',
  '20260722142801_private_trial_backend_v2.sql',
  '20260723094500_private_trial_backend_v3_website.sql',
  '20260723144500_private_trial_backend_v4_hardening.sql',
  '20260724204920_private_trial_backend_v5_read_capabilities.sql',
  '20260730113000_private_trial_backend_v6_managed_activation.sql',
  '20260730123000_private_trial_backend_v7_workspace_discovery.sql',
  '20260802161500_private_trial_backend_v8_rls_initplan.sql',
  '20260803063822_private_trial_backend_v9_metadata_rls.sql',
  '20260804102000_private_trial_backend_v10_supabase_session_revocation.sql',
  '20260816120000_private_trial_backend_v11_self_serve_grants.sql',
  '20260817090000_private_trial_backend_v12_billing_rail.sql',
  '20260818090000_private_trial_backend_v13_billing_entitlement_read.sql',
  '20260907024457_self_serve_durable_attempt_budget.sql',
  '20260915184728_website_customer_review_storage.sql',
  '20260915191528_website_review_entitlement_proof.sql',
  '20260918011500_website_customer_acceptance.sql',
]

const implementationPaths = [...new Set([
  'supermega_runtime/managed_context.py',
  'supermega_runtime/managed_activation.py',
  'supermega_runtime/runtime.py',
  'supermega_runtime/trial_runtime.py',
  'supermega_runtime/trial_store.py',
  'supermega_runtime/core_security_catalog.py',
  'supabase/migrations/20260730113000_private_trial_backend_v6_managed_activation.sql',
  'supabase/migrations/20260730123000_private_trial_backend_v7_workspace_discovery.sql',
  'supabase/migrations/20260802161500_private_trial_backend_v8_rls_initplan.sql',
  'supabase/migrations/20260803063822_private_trial_backend_v9_metadata_rls.sql',
  'supabase/migrations/20260804102000_private_trial_backend_v10_supabase_session_revocation.sql',
  'supabase/migrations/20260816120000_private_trial_backend_v11_self_serve_grants.sql',
  'supabase/rehearsal/20260804_public_browser_quarantine.sql',
  'tools/activate_supermega_database.ps1',
  'tools/rehearse_supermega_postgres17.py',
  'tools/validate_supermega_database_url.py',
  'tools/verify_public_browser_quarantine.mjs',
  'tools/verify_managed_runtime_environment_values.mjs',
  ...migrations.map((name) => `supabase/migrations/${name}`),
  'kernel/database-rehearsal-evidence.mjs',
  'supermega_runtime/billing_rail.py',
  'tests/test_billing_rail.py',
  'supermega_runtime/website_customer_review.py',
  'supermega_runtime/website_customer_review_store.py',
  'supermega_runtime/website_acceptance_schema.py',
  'supermega_runtime/website_runtime.py',
  'supermega_runtime/website_release_foundation.py',
  'tests/test_website_runtime.py',
  'tools/rehearse_self_serve_v13.py',
  'tools/private_trial_v13_contract.py',
  'tools/run_postgres17_rehearsal.mjs',
  'tools/record_postgres17_rehearsal.mjs',
  'tools/record_postgres17_rehearsal.test.mjs',
  'tests/test_postgres17_rehearsal_contract.py',
])].sort()

export const catalogCheckNames = [
  'postgres_major_supported', 'supabase_postgres17_unsupported_extensions_absent',
  'read_only_encrypted_connection', 'dedicated_runtime_role', 'backend_group_role_safe',
  'private_schema_present', 'schema_version_current', 'expected_private_tables_only',
  'metadata_table_rls', 'tenant_tables_force_rls', 'trusted_private_object_ownership',
  'runtime_role_membership_exact', 'backend_membership_exact', 'runtime_and_backend_role_settings_empty',
  'policy_contract_exact', 'security_constraints_exact', 'immutable_and_version_triggers_exact',
  'private_indexes_exact', 'private_acl_exact', 'backend_acl_scope_exact', 'private_default_acl_empty',
  'browser_roles_not_backend_members', 'storage_audit_connection_read_only_encrypted',
  'storage_catalog_present', 'storage_tables_rls_enabled', 'storage_bucket_inventory_readable',
  'storage_public_buckets_absent', 'storage_policy_surface_empty_until_allowlisted',
  'extension_columns_exact', 'extension_constraints_exact', 'extension_functions_exact',
  'extension_policies_exact', 'private_column_acl_exact',
]

const rawCheckNames = [
  'approval_agent_row_spoof_denied',
  'approval_decision_event_immutable',
  'approval_exact_retry',
  'approval_human_decision_once',
  'approval_mutated_retry_rejected',
  'approval_record_immutable',
  'approval_requester_read_scoped',
  'approval_reviewer_reads_all',
  'approval_service_row_spoof_denied',
  'approval_terminal_replay_rejected',
  'backup_created',
  'browser_role_isolation',
  'capability_denial',
  'capability_scoped_event_reads',
  'capability_scoped_reads',
  'dedicated_runtime_role_validated',
  'event_immutability',
  'identity_transaction_local',
  'invalid_initial_version_denied',
  'legacy_actor_denied',
  'managed_exact_retry',
  'managed_human_attribution',
  'managed_owner_authorization_durable',
  'managed_supabase_session_revocation_enforced',
  'managed_activation_atomic_rollback',
  'managed_activation_idempotent_replay',
  'managed_context_activation_evidence_bound',
  'managed_context_authenticated_identity_enforced',
  'managed_context_owner_capability_enforced',
  'managed_context_retention_idempotent_replay',
  'managed_context_retention_rls_audited',
  'managed_context_summary_readback',
  'managed_context_validation_zero_write',
  'managed_suspension_database_enforced',
  'managed_suspension_blocks_additional_member',
  'managed_suspension_write_denied',
  'managed_workspace_discovery_actor_scoped',
  'managed_workspace_discovery_suspension_filtered',
  'managed_production_job_to_output',
  'managed_website_to_commerce_journey',
  'migration_chain_applied',
  'mismatched_identity_denied',
  'optimistic_concurrency',
  'public_browser_quarantine_enforced',
  'public_browser_quarantine_idempotent',
  'restore_completed',
  'restored_data_preserved',
  'restored_database_validated',
  'restored_public_browser_quarantine_preserved',
  'revocation',
  'runtime_role_settings_empty',
  'runtime_set_role_denied',
  'server_timestamps',
  'tenant_isolation',
  'v1_upgrade_preserved',
  'write_capability_implies_read',
  'self_serve_four_product_workspaces_created',
  'self_serve_product_entitlements_exact',
  'self_serve_exact_create_replay',
  'self_serve_claim_conflict_without_takeover',
  'self_serve_durable_budget_enforced',
  'self_serve_actor_directory_isolated',
  'self_serve_cross_actor_read_denied',
  'self_serve_revoked_session_denied',
  'billing_unpaid_invoice_not_entitled',
  'billing_payment_confirmation_not_entitlement',
  'billing_separate_entitlement_grant_visible',
  'billing_runtime_write_denied',
  'billing_entitlement_preserved_after_restore',
  'self_serve_budget_preserved_after_restore',
  'private_rows_exact_after_restore',
  'current_catalog_checked_before_and_after_restore',
]

function fail(code) {
  throw new Error(code)
}

const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`
const validDigest = (value) => /^sha256:[0-9a-f]{64}$/.test(value || '')
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)

function requireExactChecks(checks, names, code) {
  if (!same(Object.keys(checks || {}).sort(), [...names].sort())
    || names.some((name) => checks[name] !== true)) fail(code)
}

function requireCatalog(catalog) {
  for (const phase of ['before', 'after']) {
    requireExactChecks(catalog?.[phase], catalogCheckNames, 'database_rehearsal_catalog_invalid')
  }
}

export function proofDigest(proof) {
  const { receiptDigest: _ignored, ...body } = proof
  return sha256(JSON.stringify(body))
}

function camelCheckName(name) {
  if (name === 'restore_completed') return 'restoreCompletedOnFreshCluster'
  return name.replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase())
}

function mappedChecks(rawChecks) {
  const names = Object.keys(rawChecks || {}).sort()
  if (JSON.stringify(names) !== JSON.stringify([...rawCheckNames].sort())) fail('database_rehearsal_check_set_drifted')
  if (rawCheckNames.some((name) => rawChecks[name] !== true)) fail('database_rehearsal_check_failed')
  return Object.fromEntries(rawCheckNames.map((name) => [camelCheckName(name), true]))
}

export function buildSanitizedProof(raw, context) {
  if (raw?.contract !== 'supermega_postgres17_rehearsal_v2' || raw.ok !== true || raw.ready !== true || raw.status !== 'rehearsed') fail('database_rehearsal_not_ready')
  if (raw.engine?.major !== 17
    || raw.engine?.tls_active !== true
    || raw.engine?.loopback_only !== true
    || !['pg_ctl_restricted_token', 'windows_direct_sandbox'].includes(raw.engine?.start_mode)) fail('database_rehearsal_engine_invalid')
  if (raw.migrations?.count !== migrations.length || raw.migrations?.schema_version !== 13
    || !same(raw.migrations?.names, migrations) || raw.migrations?.schema_profile !== schemaProfile
    || raw.migrations?.catalog_contract !== catalogContract
    || raw.migrations?.production_validator_ready !== true) fail('database_rehearsal_migrations_invalid')
  if (raw.cleanup_complete !== true || raw.secret_values_exposed !== false || raw.production_mutated !== false || raw.supabase_mutated !== false || raw.vercel_mutated !== false) fail('database_rehearsal_safety_invalid')
  if (raw.storage?.catalog_mode !== 'local_private_fixture' || raw.storage?.hosted_storage_privacy_proof_required !== true) fail('database_rehearsal_storage_boundary_invalid')
  if (raw.recovery?.backup_nonempty !== true || raw.recovery?.restored_schema_version !== 13
    || raw.recovery?.format !== 'pg_dump_custom'
    || !validDigest(raw.recovery?.private_snapshot_before)
    || raw.recovery.private_snapshot_before !== raw.recovery.private_snapshot_after) fail('database_rehearsal_recovery_invalid')
  requireCatalog(raw.catalog)
  if (!/^[0-9a-f]{40}$/.test(context.implementationCommit || '')) fail('database_rehearsal_commit_invalid')
  if (!validDigest(context.implementation.digest) || context.implementation.fileCount !== implementationPaths.length
    || !same(context.implementation.paths, implementationPaths)) fail('database_rehearsal_implementation_invalid')
  if (raw.implementation?.digest !== context.implementation.digest
    || JSON.stringify(raw.implementation?.paths) !== JSON.stringify(context.implementation.paths)) {
    fail('database_rehearsal_runner_implementation_mismatch')
  }
  if (!/^[0-9a-f]{40}$/.test(context.implementationTree || '')
    || raw.source?.head !== context.implementationCommit || raw.source?.tree !== context.implementationTree
    || raw.source?.implementation_digest !== context.implementation.digest) fail('database_rehearsal_source_mismatch')
  if (!/^[0-9a-f]{64}$/.test(context.archive.sha256 || '') || !Number.isSafeInteger(context.archive.bytes) || context.archive.bytes < 1) fail('database_rehearsal_archive_invalid')

  const proof = {
    schemaVersion: DATABASE_REHEARSAL_EVIDENCE_SCHEMA,
    recordedAt: context.recordedAt,
    runner: 'tools/rehearse_supermega_postgres17.py',
    implementationCommit: context.implementationCommit,
    implementationTree: context.implementationTree,
    sourceCleanBeforeAndAfter: true,
    rawReportDigest: sha256(JSON.stringify(raw)),
    implementation: {
      digest: context.implementation.digest,
      paths: [...context.implementation.paths],
    },
    implementationDigest: context.implementation.digest,
    implementationFileCount: context.implementation.fileCount,
    localVerification: {
      command: 'npm run database:postgres17:record',
      conclusion: 'success',
      externallyHosted: false,
    },
    githubCi: {
      workflow: 'SuperMega App CI',
      run: null,
      commit: null,
      conclusion: 'not_recorded',
      coversImplementationCommit: false,
    },
    engine: {
      distribution: 'EDB PostgreSQL Windows x86-64 binaries',
      version: raw.engine.version,
      major: raw.engine.major,
      sourcePage: 'https://www.postgresql.org/download/windows/',
      archive: 'https://get.enterprisedb.com/postgresql/postgresql-17.10-2-windows-x64-binaries.zip',
      archiveBytes: context.archive.bytes,
      observedArchiveSha256: context.archive.sha256,
      tlsActive: raw.engine.tls_active,
      loopbackOnly: raw.engine.loopback_only,
      startMode: raw.engine.start_mode,
    },
    migration: {
      count: raw.migrations.count,
      schemaVersion: raw.migrations.schema_version,
      names: [...raw.migrations.names],
      schemaProfile,
      catalogContract,
      productionValidatorReady: raw.migrations.production_validator_ready,
    },
    runtime: {
      adapter: 'PostgresTrialStore',
      autocommit: false,
      explicitTransaction: true,
      transactionLocalIdentity: raw.authority?.actor_identity_source === 'trusted_backend_transaction_context',
      databaseAuthenticatesIndividualActors: raw.authority?.database_authenticates_individual_actors === true,
      runtimeCredentialsServerOnly: raw.authority?.runtime_credentials_must_remain_server_only === true,
    },
    checks: mappedChecks(raw.checks),
    catalog: structuredClone(raw.catalog),
    recovery: {
      backupNonempty: raw.recovery.backup_nonempty,
      format: raw.recovery.format,
      restoredSchemaVersion: raw.recovery.restored_schema_version,
      privateSnapshotBefore: raw.recovery.private_snapshot_before,
      privateSnapshotAfter: raw.recovery.private_snapshot_after,
    },
    storage: {
      catalogMode: raw.storage.catalog_mode,
      hostedStoragePrivacyProofRequired: raw.storage.hosted_storage_privacy_proof_required,
      policyCount: raw.storage.policy_count,
      publicBucketCount: raw.storage.public_bucket_count,
    },
    safety: {
      cleanupComplete: raw.cleanup_complete,
      secretValuesExposed: raw.secret_values_exposed,
      productionMutated: raw.production_mutated,
      supabaseMutated: raw.supabase_mutated,
      vercelMutated: raw.vercel_mutated,
    },
    remainingHostedGates: [
      'Repeat the complete migration and product-journey rehearsal on an isolated Supabase non-production target.',
      'Run Supabase Security Advisor and resolve applicable findings.',
      'Exercise the provider transaction-mode pooler and hosted backup/restore process.',
      'Prove private Storage bucket inventory plus anonymous and cross-tenant listing denial.',
      'Database backup does not include Storage object bytes; prove separate private object export and restore.',
      'Prove real Auth signup, verified email, account recovery, admin MFA and revocation on the hosted target.',
      'Keep production writes disabled until founder approval.',
    ],
  }
  proof.receiptDigest = proofDigest(proof)
  return proof
}

export function validateSanitizedProof(proof, currentImplementation) {
  if (!validDigest(currentImplementation?.digest) || currentImplementation?.fileCount !== implementationPaths.length
    || !same(currentImplementation?.paths, implementationPaths)) fail('database_rehearsal_implementation_invalid')
  if (proof?.schemaVersion !== DATABASE_REHEARSAL_EVIDENCE_SCHEMA) fail('database_rehearsal_evidence_schema_invalid')
  if (proof.receiptDigest !== proofDigest(proof)) fail('database_rehearsal_evidence_digest_invalid')
  if (!Number.isFinite(Date.parse(proof.recordedAt))) fail('database_rehearsal_evidence_time_invalid')
  if (!/^[0-9a-f]{40}$/.test(proof.implementationCommit || '') || !/^[0-9a-f]{40}$/.test(proof.implementationTree || '')
    || proof.sourceCleanBeforeAndAfter !== true || !validDigest(proof.rawReportDigest)) fail('database_rehearsal_evidence_source_invalid')
  if (proof.implementationDigest !== currentImplementation.digest || proof.implementationFileCount !== currentImplementation.fileCount || proof.implementation?.digest !== currentImplementation.digest || JSON.stringify(proof.implementation?.paths) !== JSON.stringify(currentImplementation.paths)) fail('database_rehearsal_evidence_stale')
  if (proof.engine?.major !== 17
    || proof.engine?.tlsActive !== true
    || proof.engine?.loopbackOnly !== true
    || !['pg_ctl_restricted_token', 'windows_direct_sandbox'].includes(proof.engine?.startMode)
    || !/^[0-9a-f]{64}$/.test(proof.engine?.observedArchiveSha256 || '')) fail('database_rehearsal_evidence_engine_invalid')
  if (proof.migration?.count !== migrations.length || proof.migration?.schemaVersion !== 13
    || !same(proof.migration?.names, migrations) || proof.migration?.schemaProfile !== schemaProfile
    || proof.migration?.catalogContract !== catalogContract
    || proof.migration?.productionValidatorReady !== true || proof.recovery?.restoredSchemaVersion !== 13) fail('database_rehearsal_evidence_migrations_invalid')
  requireExactChecks(proof.checks, rawCheckNames.map(camelCheckName), 'database_rehearsal_evidence_checks_invalid')
  requireCatalog(proof.catalog)
  if (proof.recovery?.backupNonempty !== true || proof.recovery?.format !== 'pg_dump_custom'
    || !validDigest(proof.recovery?.privateSnapshotBefore)
    || proof.recovery.privateSnapshotBefore !== proof.recovery.privateSnapshotAfter) fail('database_rehearsal_evidence_recovery_invalid')
  if (proof.storage?.catalogMode !== 'local_private_fixture' || proof.storage?.policyCount !== 0
    || proof.storage?.hostedStoragePrivacyProofRequired !== true || proof.storage?.publicBucketCount !== 0) fail('database_rehearsal_evidence_storage_boundary_invalid')
  if (proof.runtime?.transactionLocalIdentity !== true || proof.runtime?.databaseAuthenticatesIndividualActors !== false
    || proof.runtime?.runtimeCredentialsServerOnly !== true) fail('database_rehearsal_evidence_runtime_invalid')
  if (proof.safety?.cleanupComplete !== true || proof.safety?.secretValuesExposed !== false || proof.safety?.productionMutated !== false || proof.safety?.supabaseMutated !== false || proof.safety?.vercelMutated !== false) fail('database_rehearsal_evidence_safety_invalid')
  if (proof.localVerification?.externallyHosted !== false || proof.githubCi?.coversImplementationCommit !== false) fail('database_rehearsal_evidence_scope_overclaimed')
  const serialized = JSON.stringify(proof).toLowerCase()
  if (serialized.includes('postgresql://') || serialized.includes('password=') || serialized.includes('service_role')) fail('database_rehearsal_evidence_secret_material_detected')
  return { ok: true, contract: DATABASE_REHEARSAL_EVIDENCE_SCHEMA, checks: rawCheckNames.length, implementationFiles: currentImplementation.fileCount, hostedActivationProven: false }
}

export { implementationPaths, fail, sha256, same }
