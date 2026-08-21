import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const outputPath = resolve(root, 'hq', 'research', 'postgres17-rehearsal.json')
const rehearsalRunner = resolve(root, 'tools', 'run_postgres17_rehearsal.mjs')
const archivePath = resolve(homedir(), '.cache', 'supermega-postgresql', 'postgresql-17.10-2-windows-x64-binaries.zip')

export const DATABASE_REHEARSAL_EVIDENCE_SCHEMA = 'supermega.hq.database-rehearsal.v2'

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
]

const implementationPaths = [
  'supermega_runtime/managed_context.py',
  'supermega_runtime/managed_activation.py',
  'supermega_runtime/runtime.py',
  'supermega_runtime/trial_runtime.py',
  'supermega_runtime/trial_store.py',
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
]

function fail(code) {
  throw new Error(code)
}

export async function implementationEvidence(repositoryRoot = root) {
  const digest = createHash('sha256')
  for (const path of implementationPaths) {
    digest.update(path, 'utf8')
    digest.update('\0', 'utf8')
    digest.update((await readFile(resolve(repositoryRoot, path), 'utf8')).replace(/\r\n/g, '\n'), 'utf8')
    digest.update('\0', 'utf8')
  }
  return {
    digest: `sha256:${digest.digest('hex')}`,
    fileCount: implementationPaths.length,
    paths: [...implementationPaths],
  }
}

async function archiveEvidence(path = archivePath) {
  await access(path)
  const metadata = await stat(path)
  const digest = createHash('sha256')
  await new Promise((resolveStream, rejectStream) => {
    const stream = createReadStream(path)
    stream.on('data', (chunk) => digest.update(chunk))
    stream.on('error', rejectStream)
    stream.on('end', resolveStream)
  })
  return { bytes: metadata.size, sha256: digest.digest('hex') }
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
  if (raw?.contract !== 'supermega_postgres17_rehearsal_v1' || raw.ok !== true || raw.ready !== true || raw.status !== 'rehearsed') fail('database_rehearsal_not_ready')
  if (raw.engine?.major !== 17
    || raw.engine?.tls_active !== true
    || raw.engine?.loopback_only !== true
    || !['pg_ctl_restricted_token', 'windows_direct_sandbox'].includes(raw.engine?.start_mode)) fail('database_rehearsal_engine_invalid')
  if (raw.migrations?.count !== migrations.length || raw.migrations?.schema_version !== 11 || raw.migrations?.production_validator_ready !== true) fail('database_rehearsal_migrations_invalid')
  if (raw.cleanup_complete !== true || raw.secret_values_exposed !== false || raw.production_mutated !== false || raw.supabase_mutated !== false || raw.vercel_mutated !== false) fail('database_rehearsal_safety_invalid')
  if (raw.storage?.catalog_mode !== 'local_private_fixture' || raw.storage?.hosted_storage_privacy_proof_required !== true) fail('database_rehearsal_storage_boundary_invalid')
  if (raw.recovery?.backup_nonempty !== true || raw.recovery?.restored_schema_version !== 11) fail('database_rehearsal_recovery_invalid')
  if (!/^[0-9a-f]{40}$/.test(context.implementationCommit || '')) fail('database_rehearsal_commit_invalid')
  if (!/^sha256:[0-9a-f]{64}$/.test(context.implementation.digest || '') || !Number.isSafeInteger(context.implementation.fileCount) || context.implementation.fileCount < 10) fail('database_rehearsal_implementation_invalid')
  if (raw.implementation?.digest !== context.implementation.digest
    || JSON.stringify(raw.implementation?.paths) !== JSON.stringify(context.implementation.paths)) {
    fail('database_rehearsal_runner_implementation_mismatch')
  }
  if (!/^[0-9a-f]{64}$/.test(context.archive.sha256 || '') || !Number.isSafeInteger(context.archive.bytes) || context.archive.bytes < 1) fail('database_rehearsal_archive_invalid')

  return {
    schemaVersion: DATABASE_REHEARSAL_EVIDENCE_SCHEMA,
    recordedAt: context.recordedAt,
    runner: 'tools/rehearse_supermega_postgres17.py',
    implementationCommit: context.implementationCommit,
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
    recovery: {
      backupNonempty: raw.recovery.backup_nonempty,
      format: raw.recovery.format,
      restoredSchemaVersion: raw.recovery.restored_schema_version,
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
      'Keep production writes disabled until founder approval.',
    ],
  }
}

export function validateSanitizedProof(proof, currentImplementation) {
  if (proof?.schemaVersion !== DATABASE_REHEARSAL_EVIDENCE_SCHEMA) fail('database_rehearsal_evidence_schema_invalid')
  if (!Number.isFinite(Date.parse(proof.recordedAt))) fail('database_rehearsal_evidence_time_invalid')
  if (proof.implementationDigest !== currentImplementation.digest || proof.implementationFileCount !== currentImplementation.fileCount || proof.implementation?.digest !== currentImplementation.digest || JSON.stringify(proof.implementation?.paths) !== JSON.stringify(currentImplementation.paths)) fail('database_rehearsal_evidence_stale')
  if (proof.engine?.major !== 17
    || proof.engine?.tlsActive !== true
    || proof.engine?.loopbackOnly !== true
    || !['pg_ctl_restricted_token', 'windows_direct_sandbox'].includes(proof.engine?.startMode)
    || !/^[0-9a-f]{64}$/.test(proof.engine?.observedArchiveSha256 || '')) fail('database_rehearsal_evidence_engine_invalid')
  if (proof.migration?.count !== migrations.length || proof.migration?.schemaVersion !== 11 || proof.migration?.productionValidatorReady !== true || proof.recovery?.restoredSchemaVersion !== 11) fail('database_rehearsal_evidence_migrations_invalid')
  if (Object.keys(proof.checks || {}).length !== rawCheckNames.length || Object.values(proof.checks || {}).some((value) => value !== true)) fail('database_rehearsal_evidence_checks_invalid')
  if (proof.storage?.hostedStoragePrivacyProofRequired !== true || proof.storage?.publicBucketCount !== 0) fail('database_rehearsal_evidence_storage_boundary_invalid')
  if (proof.safety?.cleanupComplete !== true || proof.safety?.secretValuesExposed !== false || proof.safety?.productionMutated !== false || proof.safety?.supabaseMutated !== false || proof.safety?.vercelMutated !== false) fail('database_rehearsal_evidence_safety_invalid')
  if (proof.localVerification?.externallyHosted !== false || proof.githubCi?.coversImplementationCommit !== false) fail('database_rehearsal_evidence_scope_overclaimed')
  const serialized = JSON.stringify(proof).toLowerCase()
  if (serialized.includes('postgresql://') || serialized.includes('password=') || serialized.includes('service_role')) fail('database_rehearsal_evidence_secret_material_detected')
  return { ok: true, contract: DATABASE_REHEARSAL_EVIDENCE_SCHEMA, checks: rawCheckNames.length, implementationFiles: currentImplementation.fileCount, hostedActivationProven: false }
}

function gitOutput(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 10_000, windowsHide: true })
  if (result.status !== 0) fail('database_rehearsal_git_unavailable')
  return result.stdout.trim()
}

async function record() {
  if (gitOutput(['status', '--porcelain', '--untracked-files=all'])) fail('database_rehearsal_record_requires_clean_worktree')
  const implementationCommit = gitOutput(['rev-parse', 'HEAD'])
  const tempEvidence = resolve(tmpdir(), `supermega-postgres17-${randomUUID()}.json`)
  try {
    // The loopback PostgreSQL cluster, TLS checks, dump, and restore can exceed
    // two minutes on the ROG Ally under normal foreground load. Keep the run
    // bounded, but allow enough time to avoid converting machine contention
    // into a false database failure.
    const result = spawnSync(process.execPath, [rehearsalRunner, '--evidence-file', tempEvidence], { cwd: root, encoding: 'utf8', timeout: 300_000, windowsHide: true })
    if (result.status !== 0) fail('database_rehearsal_execution_failed')
    const raw = JSON.parse(await readFile(tempEvidence, 'utf8'))
    const proof = buildSanitizedProof(raw, {
      recordedAt: new Date().toISOString(),
      implementationCommit,
      implementation: await implementationEvidence(),
      archive: await archiveEvidence(),
    })
    validateSanitizedProof(proof, await implementationEvidence())
    await mkdir(dirname(outputPath), { recursive: true })
    const staged = resolve(dirname(outputPath), `.${basename(outputPath)}.${randomUUID()}.tmp`)
    await writeFile(staged, `${JSON.stringify(proof, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    await rename(staged, outputPath)
    return { ok: true, contract: DATABASE_REHEARSAL_EVIDENCE_SCHEMA, output: outputPath, implementationCommit, implementationDigest: proof.implementationDigest, checks: rawCheckNames.length, hostedActivationProven: false }
  } finally {
    await rm(tempEvidence, { force: true })
  }
}

async function verify() {
  const proof = JSON.parse(await readFile(outputPath, 'utf8'))
  return validateSanitizedProof(proof, await implementationEvidence())
}

async function main() {
  const command = process.argv.slice(2)
  if (command.length > 1 || (command[0] && command[0] !== '--verify')) fail('database_rehearsal_record_arguments_invalid')
  const result = command[0] === '--verify' ? await verify() : await record()
  console.log(JSON.stringify(result, null, 2))
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, contract: DATABASE_REHEARSAL_EVIDENCE_SCHEMA, error: error instanceof Error ? error.message : 'database_rehearsal_record_failed', secretValuesExposed: false }))
    process.exitCode = 1
  })
}
