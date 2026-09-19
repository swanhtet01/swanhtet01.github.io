import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

import {
  DATABASE_REHEARSAL_EVIDENCE_SCHEMA,
  buildSanitizedProof,
  validateSanitizedProof,
  implementationEvidence,
  catalogCheckNames,
  proofDigest,
  recorderOutcomeReconciled,
  withRecorderLease,
  recordCompletionSummary,
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
  'self_serve_four_product_workspaces_created', 'self_serve_product_entitlements_exact', 'self_serve_exact_create_replay',
  'self_serve_claim_conflict_without_takeover', 'self_serve_durable_budget_enforced', 'self_serve_actor_directory_isolated',
  'self_serve_cross_actor_read_denied', 'self_serve_revoked_session_denied', 'billing_unpaid_invoice_not_entitled',
  'billing_payment_confirmation_not_entitlement', 'billing_separate_entitlement_grant_visible', 'billing_runtime_write_denied',
  'billing_entitlement_preserved_after_restore', 'self_serve_budget_preserved_after_restore',
  'private_rows_exact_after_restore', 'current_catalog_checked_before_and_after_restore',
]

const implementation = await implementationEvidence()
const migrationNames = implementation.paths.filter((path) => path.startsWith('supabase/migrations/')).map((path) => path.split('/').at(-1))
test('receipt inventory matches the actual PostgreSQL runner including Website acceptance', () => {
  const python = process.env.SUPERMEGA_PYTHON || (process.platform === 'win32' ? 'python' : 'python3')
  const result = spawnSync(python, ['-c', 'import json; from tools.rehearse_supermega_postgres17 import IMPLEMENTATION_PATHS, CURRENT_MIGRATIONS; print(json.dumps({"paths": list(IMPLEMENTATION_PATHS), "migrations": list(CURRENT_MIGRATIONS)}))'], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 10000, windowsHide: true,
  })
  assert.equal(result.status, 0, 'runner inventory must be readable')
  const runner = JSON.parse(result.stdout)
  assert.deepEqual(implementation.paths, runner.paths)
  assert.deepEqual(migrationNames, runner.migrations)
  assert.ok(runner.paths.includes('supermega_runtime/website_acceptance_schema.py'))
  assert.equal(runner.migrations.at(-1), '20260918011500_website_customer_acceptance.sql')
})
const context = {
  recordedAt: '2026-07-31T10:00:00.000Z',
  implementationCommit: 'b'.repeat(40),
  implementationTree: 'e'.repeat(40),
  implementation,
  archive: { bytes: 333_927_270, sha256: 'c'.repeat(64) },
}
const raw = {
  contract: 'supermega_postgres17_rehearsal_v2', ok: true, ready: true, status: 'rehearsed',
  engine: { major: 17, version: '17.10', tls_active: true, loopback_only: true, start_mode: 'pg_ctl_restricted_token' },
  migrations: { count: migrationNames.length, schema_version: 13, names: migrationNames, schema_profile: 'v13-self-serve',
    catalog_contract: 'supermega_private_trial_database_v13_self_serve_v1', production_validator_ready: true },
  source: { head: context.implementationCommit, tree: context.implementationTree, implementation_digest: implementation.digest },
  authority: { actor_identity_source: 'trusted_backend_transaction_context', database_authenticates_individual_actors: false, runtime_credentials_must_remain_server_only: true },
  implementation: { digest: implementation.digest, paths: implementation.paths },
  checks: Object.fromEntries(checkNames.map((name) => [name, true])),
  catalog: { before: Object.fromEntries(catalogCheckNames.map((name) => [name, true])),
    after: Object.fromEntries(catalogCheckNames.map((name) => [name, true])) },
  recovery: { backup_nonempty: true, format: 'pg_dump_custom', restored_schema_version: 13,
    private_snapshot_before: `sha256:${'f'.repeat(64)}`, private_snapshot_after: `sha256:${'f'.repeat(64)}` },
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
    checks: 72,
    implementationFiles: implementation.fileCount,
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
  proof.receiptDigest = proofDigest(proof)
  assert.throws(() => validateSanitizedProof(proof, implementation), /database_rehearsal_evidence_scope_overclaimed/)
})

test('record completion is derived from validated shared proof before publishing output', async () => {
  const proof = buildSanitizedProof(raw, context)
  const summary = recordCompletionSummary(proof, implementation)
  assert.equal(summary.ok, true)
  assert.equal(summary.checks, 72)
  assert.equal(summary.implementationCommit, context.implementationCommit)
  assert.equal(summary.implementationTree, context.implementationTree)
  assert.equal(summary.receiptDigest, proof.receiptDigest)
  assert.equal(summary.hostedActivationProven, false)
  proof.checks.tenantIsolation = false
  assert.throws(() => recordCompletionSummary(proof, implementation), /digest_invalid/)
  const source = await readFile(new URL('./record_postgres17_rehearsal.mjs', import.meta.url), 'utf8')
  assert.equal(source.includes('rawCheckNames'), false)
  assert.ok(source.indexOf('const summary = recordCompletionSummary(') < source.indexOf('await writeFile(destination,'))
  assert.match(source, /return summary/)
})

test('requires exact current migration identity, source commit/tree and implementation paths', () => {
  const vectors = [
    [r => { r.contract = 'supermega_postgres17_rehearsal_v1' }, /not_ready/],
    [r => { r.migrations.schema_version = 11 }, /migrations_invalid/],
    [r => { r.migrations.names[14] = 'missing.sql' }, /migrations_invalid/],
    [r => { r.migrations.schema_profile = 'legacy-v11' }, /migrations_invalid/],
    [r => { r.source.head = 'a'.repeat(40) }, /source_mismatch/],
    [r => { r.source.tree = 'a'.repeat(40) }, /source_mismatch/],
    [r => { r.source.implementation_digest = `sha256:${'a'.repeat(64)}` }, /source_mismatch/],
  ]
  for (const [mutate, error] of vectors) {
    const invalid = structuredClone(raw)
    mutate(invalid)
    assert.throws(() => buildSanitizedProof(invalid, context), error)
  }
  assert.throws(() => buildSanitizedProof(raw, { ...context, implementation: { ...implementation, paths: [] } }), /implementation_invalid/)
})

test('exact catalog checks cannot be omitted, renamed, failed or replaced by a count', () => {
  assert.equal(catalogCheckNames.length, 33)
  for (const phase of ['before', 'after']) {
    for (const mode of ['missing', 'renamed', 'false', 'count']) {
      const invalid = structuredClone(raw)
      if (mode === 'false') invalid.catalog[phase].private_column_acl_exact = false
      else if (mode === 'count') invalid.catalog[phase] = { count: 33 }
      else {
        delete invalid.catalog[phase].private_column_acl_exact
        if (mode === 'renamed') invalid.catalog[phase].fake_check = true
      }
      assert.throws(() => buildSanitizedProof(invalid, context), /catalog_invalid/)
    }
  }
})

test('restored rows must match and every legacy plus new behavior must pass', () => {
  assert.equal(checkNames.length, 72)
  for (const name of checkNames) {
    const invalid = structuredClone(raw)
    invalid.checks[name] = false
    assert.throws(() => buildSanitizedProof(invalid, context), /check_failed/)
  }
  const invalid = structuredClone(raw)
  invalid.recovery.private_snapshot_after = `sha256:${'a'.repeat(64)}`
  assert.throws(() => buildSanitizedProof(invalid, context), /recovery_invalid/)
})

test('consumer rejects tampering and rehashed semantic overclaims', () => {
  const proof = buildSanitizedProof(raw, context)
  proof.recordedAt = '2026-09-01T00:00:00Z'
  assert.throws(() => validateSanitizedProof(proof, implementation), /digest_invalid/)
  const mutations = [
    [p => { delete p.checks.tenantIsolation; p.checks.unrelated = true }, /checks_invalid/],
    [p => { p.recovery.privateSnapshotAfter = `sha256:${'a'.repeat(64)}` }, /recovery_invalid/],
    [p => { p.runtime.databaseAuthenticatesIndividualActors = true }, /runtime_invalid/],
    [p => { p.storage.policyCount = 1 }, /storage_boundary_invalid/],
    [p => { p.migration.names.reverse() }, /migrations_invalid/],
    [p => { delete p.catalog.after.private_column_acl_exact }, /catalog_invalid/],
    [p => { p.safety.productionMutated = true }, /safety_invalid/],
  ]
  for (const [mutate, error] of mutations) {
    const invalid = buildSanitizedProof(raw, context)
    mutate(invalid)
    invalid.receiptDigest = proofDigest(invalid)
    assert.throws(() => validateSanitizedProof(invalid, implementation), error)
  }
})

test('Python and recorder bind the same exact ordered source inventory and digest', () => {
  const result = spawnSync(process.execPath, ['tools/run_python_tool.mjs', '-c',
    'import json; from tools import rehearse_supermega_postgres17 as p; print(json.dumps({"paths":list(p.IMPLEMENTATION_PATHS),"digest":p._implementation_digest(),"migrations":list(p.CURRENT_MIGRATIONS)}))'],
  { cwd: new URL('..', import.meta.url), encoding: 'utf8', windowsHide: true, timeout: 30_000 })
  assert.equal(result.status, 0, result.stderr)
  const observed = JSON.parse(result.stdout.trim())
  assert.deepEqual(observed.paths, implementation.paths)
  assert.equal(observed.digest, implementation.digest)
  assert.deepEqual(observed.migrations, migrationNames)
})

test('read-only CLI consumer recomputes exact raw receipt pair and rejects changed raw evidence', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'supermega-recorder-test-'))
  const input = join(folder, 'receipt.json')
  const invoke = () => spawnSync(process.execPath, ['tools/record_postgres17_rehearsal.mjs', '--verify', '--input', input],
    { cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 30_000, windowsHide: true })
  try {
    const proof = buildSanitizedProof(raw, context)
    await writeFile(input, JSON.stringify(proof), { flag: 'wx' })
    await writeFile(`${input}.raw.json`, JSON.stringify(raw), { flag: 'wx' })
    const duplicate = spawnSync(process.execPath, ['tools/record_postgres17_rehearsal.mjs', '--output', input],
      { cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 30_000, windowsHide: true })
    assert.equal(duplicate.status, 1)
    assert.match(duplicate.stderr, /database_rehearsal_output_exists/)
    const pass = invoke()
    assert.equal(pass.status, 0, pass.stderr)
    assert.equal(JSON.parse(pass.stdout).checks, 72)
    const changed = structuredClone(raw)
    changed.checks.billing_runtime_write_denied = false
    await writeFile(`${input}.raw.json`, JSON.stringify(changed))
    const fail = invoke()
    assert.equal(fail.status, 1)
    assert.match(fail.stderr, /database_rehearsal_check_failed/)
    assert.equal(await readFile(input, 'utf8'), JSON.stringify(proof))
    assert.equal(fail.stderr.includes(folder), false)
  } finally {
    // Exact fresh temporary test directory, never a repository/user directory.
    await rm(folder, { recursive: true, force: true })
  }
})

test('timeout, signal, absent report or unknown cleanup cannot release a rehearsal lease', async () => {
  const terminal = { status: 0, signal: null }
  const vectors = [
    [{ status: null, error: { code: 'ETIMEDOUT' } }, raw],
    [{ status: 0, error: { code: 'ETIMEDOUT' } }, raw],
    [{ status: null, signal: 'SIGTERM' }, raw],
    [terminal, undefined],
    [terminal, { ...raw, cleanup_complete: false }],
    [terminal, { ...raw, contract: 'old' }],
  ]
  for (const [result, report] of vectors) {
    assert.equal(recorderOutcomeReconciled(result, report), false)
    const folder = await mkdtemp(join(tmpdir(), 'supermega-lease-test-'))
    const locks = [join(folder, 'repository.lock'), join(folder, 'output.lock')]
    try {
      await assert.rejects(withRecorderLease(locks, async lease => {
        lease.markLaunched()
        assert.equal(lease.reconcile(result, report), false)
        throw new Error('simulated_termination')
      }), /simulated_termination/)
      for (const path of locks) await access(path)
      let secondLaunched = false
      await assert.rejects(withRecorderLease([locks[0], join(folder, 'other-output.lock')], async () => {
        secondLaunched = true
      }), /active_or_unreconciled/)
      assert.equal(secondLaunched, false)
      for (const path of locks) await access(path)
    } finally { await rm(folder, { recursive: true, force: true }) }
  }
})

test('only terminal confirmed cleanup, or prelaunch failure, releases owned leases', async () => {
  for (const mode of ['success', 'failed-cleaned', 'before-launch']) {
    const folder = await mkdtemp(join(tmpdir(), 'supermega-lease-test-'))
    const locks = [join(folder, 'repository.lock'), join(folder, 'output.lock')]
    try {
      await assert.rejects(withRecorderLease(locks, async lease => {
        if (mode !== 'before-launch') {
          lease.markLaunched()
          assert.equal(lease.reconcile({ status: mode === 'success' ? 0 : 1 }, raw), true)
        }
        throw new Error('simulated_end')
      }), /simulated_end/)
      for (const path of locks) await assert.rejects(access(path), { code: 'ENOENT' })
    } finally { await rm(folder, { recursive: true, force: true }) }
  }
})
