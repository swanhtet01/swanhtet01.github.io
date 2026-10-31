import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, mkdtemp, rm, writeFile, access, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'

import {
  DATABASE_REHEARSAL_EVIDENCE_SCHEMA,
  buildSanitizedProof,
  validateSanitizedProof,
  implementationEvidence,
  catalogCheckNames,
  proofDigest,
  buildRecorderFailureDiagnostic,
  recorderChildFailureCode,
  recorderOutcomeReconciled,
  recorderDiagnosticPersistenceCode,
  record,
  withRecorderLease,
  recordCompletionSummary,
  writeRecorderFailureDiagnostic,
  toolchainChildEnvironment,
  requireVerifiedRecorderRuntime,
} from './record_postgres17_rehearsal.mjs'

const verifiedToolchainFixture = () => ({
  profileId: 'synthetic-profile',
  archiveFileName: 'synthetic-installer.exe',
  archiveBytes: 1234,
  archiveSha256: '5'.repeat(64),
  manifestSha256: '1'.repeat(64),
  policySha256: '4'.repeat(64),
  sourceDigest: '2'.repeat(64),
  bindingDigest: '3'.repeat(64),
  loadClosureEvidenceSha256: '8'.repeat(64),
  executionBundleSha256: '3'.repeat(64),
  receiptEvidence: {
    contract: 'supermega.postgres17-toolchain-receipt-evidence.v1',
    profileId: 'synthetic-profile',
    manifestSha256: '1'.repeat(64),
    policySha256: '4'.repeat(64),
    sourceDigest: '2'.repeat(64),
    bindingDigest: '3'.repeat(64),
    executionBundleSha256: '3'.repeat(64),
    loadClosureEvidenceSha256: '8'.repeat(64),
    sourceAuthentication: [{
      sourceId: 'synthetic-postgresql',
      sourceArtifactSha256: '5'.repeat(64),
      evidenceSha256: '9'.repeat(64),
    }],
  },
  archivePath: '/synthetic/archive.exe',
  execution: {
    root: '/synthetic/pgsql',
    postgresBin: '/synthetic/pgsql/bin',
    openssl: '/synthetic/pgsql/bin/openssl.exe',
    python: '/synthetic/pgsql/python/python.exe',
    psycopg: '/synthetic/pgsql/python/psycopg/__init__.py',
    node: process.execPath,
    git: '/synthetic/pgsql/git/bin/git.exe',
  },
})

test('child environment omits every caller and verified tool selector', () => {
  const environment = toolchainChildEnvironment({ execution: {
    postgresBin: 'C:\\verified\\pgsql\\bin',
    openssl: 'C:\\verified\\openssl.exe',
    python: 'C:\\verified\\python.exe',
    psycopg: 'C:\\verified\\psycopg\\__init__.py',
    node: process.execPath,
    git: 'C:\\verified\\git.exe',
  } }, {
    SUPERMEGA_POSTGRES17_BIN: 'C:\\untrusted',
    SUPERMEGA_OPENSSL: 'C:\\untrusted.exe',
    SUPERMEGA_PYTHON: 'C:\\untrusted-python.exe',
    SUPERMEGA_PSYCOPG_FILE: 'C:\\untrusted-psycopg.py',
    SUPERMEGA_POSTGRES17_AUTHORITY_REQUEST: 'C:\\forged\\request.json',
    SUPERMEGA_POSTGRES17_AUTHORITY_SESSION: 'forged-session',
  })
  assert.equal('SUPERMEGA_POSTGRES17_BIN' in environment, false)
  assert.equal('SUPERMEGA_OPENSSL' in environment, false)
  assert.equal('SUPERMEGA_PYTHON' in environment, false)
  assert.equal('SUPERMEGA_PSYCOPG_FILE' in environment, false)
  assert.equal('SUPERMEGA_POSTGRES17_AUTHORITY_REQUEST' in environment, false)
  assert.equal('SUPERMEGA_POSTGRES17_AUTHORITY_SESSION' in environment, false)
  assert.throws(() => toolchainChildEnvironment({ execution: {} }), /execution_binding_missing/)
})

test('recorder authority requires the current exact verified Node executable', async () => {
  const verified = verifiedToolchainFixture()
  assert.equal(
    await requireVerifiedRecorderRuntime(verified, process.execPath, async value => value),
    process.execPath,
  )
  await assert.rejects(
    requireVerifiedRecorderRuntime(verified, '/substituted/node', async value => value),
    /recorder_node_mismatch/,
  )
  await assert.rejects(
    requireVerifiedRecorderRuntime({ execution: {} }, process.execPath, async value => value),
    /recorder_node_unverified/,
  )
})

test('record rejects a substituted Node before inspecting source or invoking Git', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'supermega-recorder-node-'))
  let sourceInspections = 0
  try {
    const substituted = verifiedToolchainFixture()
    substituted.execution.node = join(folder, 'substituted-node.exe')
    await assert.rejects(record(join(folder, 'receipt.json'), {
      revalidateToolchain: async () => substituted,
      cleanSource: () => { sourceInspections += 1; throw new Error('must_not_run') },
      gitOutput: () => { throw new Error('must_not_run') },
    }), /recorder_node_unverified/)
    assert.equal(sourceInspections, 0)
  } finally { await rm(folder, { recursive: true, force: true }) }
})

test('recorder launches only the verified Python and explicit verified tool paths', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'supermega-recorder-launch-'))
  const destination = join(folder, 'receipt.json')
  let observed
  const events = []
  try {
    await assert.rejects(record(destination, {
      cleanSource: git => { events.push(`source:${git}`); return { implementationCommit: 'a'.repeat(40), implementationTree: 'b'.repeat(40) } },
      gitOutput: git => { events.push(`git:${git}`); return join(folder, 'common-git-directory') },
      implementationEvidence: async () => ({ digest: `sha256:${'c'.repeat(64)}`, fileCount: 1, paths: ['synthetic'] }),
      revalidateToolchain: async () => { events.push('profile'); return verifiedToolchainFixture() },
      spawnSync: (...args) => { observed = args; return { status: 1, stdout: '', stderr: '' } },
      tmpdir: () => folder,
    }), /database_rehearsal_termination_unreconciled/)
    assert.equal(observed[0], '/synthetic/pgsql/python/python.exe')
    assert.equal(events[0], 'profile')
    assert.equal(events[1], 'source:/synthetic/pgsql/git/bin/git.exe')
    assert.equal(events[2], 'git:/synthetic/pgsql/git/bin/git.exe')
    assert.deepEqual(observed[1].slice(0, 3), ['-I', '-B', observed[1][2]])
    assert.equal(observed[1][2].endsWith('tools/rehearse_supermega_postgres17.py'), true)
    assert.deepEqual(observed[1].slice(3), [
      '--expected-head', 'a'.repeat(40),
      '--postgres-bin', '/synthetic/pgsql/bin',
      '--openssl', '/synthetic/pgsql/bin/openssl.exe',
      '--git', '/synthetic/pgsql/git/bin/git.exe',
    ])
    assert.equal(observed[2].input, '')
    assert.equal(observed[2].env.PYTHONNOUSERSITE, '1')
    assert.equal('PATH' in observed[2].env, false)
    assert.equal('SUPERMEGA_POSTGRES17_AUTHORITY_REQUEST' in observed[2].env, false)
  } finally { await rm(folder, { recursive: true, force: true }) }
})

test('record refuses a stale diagnostic before launching a child', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'supermega-recorder-collision-'))
  const destination = join(folder, 'receipt.json')
  let launches = 0
  try {
    await writeFile(`${destination}.diagnostic.json`, '{"retained":true}\n')
    await assert.rejects(
      record(destination, { spawnSync() { launches += 1 } }),
      /database_rehearsal_output_exists/,
    )
    assert.equal(launches, 0)
    assert.equal(await readFile(`${destination}.diagnostic.json`, 'utf8'), '{"retained":true}\n')
  } finally { await rm(folder, { recursive: true, force: true }) }
})

test('record keeps both leases and surfaces only allowlisted diagnostic persistence failure', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'supermega-recorder-orchestration-'))
  const destination = join(folder, 'receipt.json')
  const commonDirectory = join(folder, 'Common-Git-Directory')
  const commonKey = process.platform === 'win32' ? commonDirectory.toLowerCase() : commonDirectory
  const commonDigest = createHash('sha256').update(commonKey).digest('hex')
  const repositoryLock = join(folder, `supermega-postgres17-${commonDigest}.lock`)
  let launches = 0
  try {
    await assert.rejects(
      record(destination, {
        cleanSource: () => ({ implementationCommit: 'a'.repeat(40), implementationTree: 'b'.repeat(40) }),
        gitOutput: () => commonDirectory,
        implementationEvidence: async () => ({ digest: `sha256:${'c'.repeat(64)}`, fileCount: 1, paths: ['synthetic'] }),
        revalidateToolchain: async () => verifiedToolchainFixture(),
        readFile: async () => { const error = new Error('private path and credential'); error.code = 'ENOENT'; throw error },
        spawnSync: () => { launches += 1; return { status: null, signal: 'SIGTERM', stdout: 'password=private', stderr: 'C:\\private' } },
        tmpdir: () => folder,
        writeRecorderFailureDiagnostic: async () => { const error = new Error('private path and credential'); error.code = 'EACCES'; throw error },
      }),
      /database_rehearsal_diagnostic_persistence_eacces/,
    )
    assert.equal(launches, 1)
    await access(repositoryLock)
    await access(`${destination}.lock`)
  } finally { await rm(folder, { recursive: true, force: true }) }

  for (const [error, code] of [
    [{ code: 'EEXIST', message: 'private' }, 'database_rehearsal_diagnostic_persistence_eexist'],
    [{ code: 'UNKNOWN', message: 'password=private' }, 'database_rehearsal_diagnostic_persistence_failed'],
  ]) assert.equal(recorderDiagnosticPersistenceCode(error), code)
})

test('record writes sanitized missing-raw diagnostics and a retained repository lease blocks another output', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'supermega-recorder-retained-'))
  const destination = join(folder, 'first.json')
  const secondDestination = join(folder, 'second.json')
  const commonDirectory = join(folder, 'common-git-directory')
  let launches = 0
  const runtime = {
    cleanSource: () => ({ implementationCommit: 'a'.repeat(40), implementationTree: 'b'.repeat(40) }),
    gitOutput: () => commonDirectory,
    implementationEvidence: async () => ({ digest: `sha256:${'c'.repeat(64)}`, fileCount: 1, paths: ['synthetic'] }),
    revalidateToolchain: async () => verifiedToolchainFixture(),
    readFile: async () => { const error = new Error('private path'); error.code = 'ENOENT'; throw error },
    spawnSync: () => { launches += 1; return { status: null, signal: 'SIGTERM', stdout: 'password=private', stderr: 'C:\\private' } },
    tmpdir: () => folder,
  }
  try {
    await assert.rejects(record(destination, runtime), /database_rehearsal_termination_unreconciled/)
    assert.equal(launches, 1)
    const diagnostic = JSON.parse(await readFile(`${destination}.diagnostic.json`, 'utf8'))
    assert.equal(diagnostic.rawStatus, 'malformed')
    assert.equal(diagnostic.streams.contentsRetained, false)
    assert.equal(JSON.stringify(diagnostic).includes('private'), false)
    assert.equal(JSON.stringify(diagnostic).includes('password'), false)
    await access(`${destination}.lock`)
    await assert.rejects(record(secondDestination, runtime), /database_rehearsal_active_or_unreconciled/)
    assert.equal(launches, 1)
  } finally { await rm(folder, { recursive: true, force: true }) }
})

test('record classifies malformed and parsed-unreconciled raw evidence without releasing leases', async () => {
  for (const [name, rawText, expectedStatus] of [
    ['malformed', '{not-json', 'malformed'],
    ['cleanup-false', JSON.stringify({
      contract: 'supermega_postgres17_rehearsal_v2',
      cleanup_complete: false,
      production_mutated: false,
      supabase_mutated: false,
      vercel_mutated: false,
      secret_values_exposed: false,
    }), 'parsed_unreconciled'],
  ]) {
    const folder = await mkdtemp(join(tmpdir(), `supermega-recorder-${name}-`))
    const destination = join(folder, 'receipt.json')
    try {
      await assert.rejects(record(destination, {
        cleanSource: () => ({ implementationCommit: 'a'.repeat(40), implementationTree: 'b'.repeat(40) }),
        gitOutput: () => join(folder, 'common-git-directory'),
        implementationEvidence: async () => ({ digest: `sha256:${'c'.repeat(64)}`, fileCount: 1, paths: ['synthetic'] }),
        revalidateToolchain: async () => verifiedToolchainFixture(),
        spawnSync: () => ({ status: 1, stdout: rawText, stderr: '' }),
        tmpdir: () => folder,
      }), /database_rehearsal_termination_unreconciled/)
      assert.equal(JSON.parse(await readFile(`${destination}.diagnostic.json`, 'utf8')).rawStatus, expectedStatus)
      await access(`${destination}.lock`)
    } finally { await rm(folder, { recursive: true, force: true }) }
  }
})

test('record retains only a fixed code when the child cannot persist sanitized evidence', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'supermega-recorder-child-write-'))
  const destination = join(folder, 'receipt.json')
  const safeChildReport = JSON.stringify({
    ok: false,
    ready: false,
    status: 'attention',
    contract: 'supermega_postgres17_rehearsal_v2',
    error: 'evidence_write_failed',
    cleanup_complete: true,
    secret_values_exposed: false,
    production_mutated: false,
    supabase_mutated: false,
    vercel_mutated: false,
  })
  try {
    await assert.rejects(record(destination, {
      cleanSource: () => ({ implementationCommit: 'a'.repeat(40), implementationTree: 'b'.repeat(40) }),
      gitOutput: () => join(folder, 'common-git-directory'),
      implementationEvidence: async () => ({ digest: `sha256:${'c'.repeat(64)}`, fileCount: 1, paths: ['synthetic'] }),
      revalidateToolchain: async () => verifiedToolchainFixture(),
      readFile: async () => { const error = new Error('private raw path'); error.code = 'ENOENT'; throw error },
      spawnSync: () => ({ status: 1, stdout: safeChildReport, stderr: 'password=private C:\\secret' }),
      tmpdir: () => folder,
    }), /database_rehearsal_child_evidence_write_failed/)
    const diagnostic = JSON.parse(await readFile(`${destination}.diagnostic.json`, 'utf8'))
    assert.equal(diagnostic.childFailureCode, 'database_rehearsal_child_evidence_write_failed')
    assert.equal(JSON.stringify(diagnostic).includes('private'), false)
    assert.equal(JSON.stringify(diagnostic).includes('password'), false)
    await access(`${destination}.lock`)
  } finally { await rm(folder, { recursive: true, force: true }) }
})

test('missing raw evidence retains only an allowlisted sanitized child failure code', () => {
  const launcher = JSON.stringify({
    ok: false,
    contract: 'supermega_postgres17_rehearsal_launcher_v1',
    error: 'configured_python_unusable',
    secret_values_exposed: false,
  })
  assert.equal(
    recorderChildFailureCode({ status: 2, stderr: launcher, stdout: '' }),
    'database_rehearsal_child_configured_python_unusable',
  )
  const evidenceWriteFailure = JSON.stringify({
    ok: false,
    contract: 'supermega_postgres17_rehearsal_v2',
    error: 'evidence_write_failed',
    cleanup_complete: false,
    secret_values_exposed: false,
    production_mutated: false,
    supabase_mutated: false,
    vercel_mutated: false,
  })
  assert.equal(
    recorderChildFailureCode({ status: 1, stdout: evidenceWriteFailure, stderr: '' }),
    'database_rehearsal_child_evidence_write_failed',
  )
  assert.equal(
    recorderChildFailureCode({ status: 1, stdout: JSON.stringify({
      ...JSON.parse(evidenceWriteFailure), production_mutated: true,
    }), stderr: '' }),
    '',
  )
  for (const unsafe of [
    'Traceback: private path',
    JSON.stringify({
      ok: false,
      contract: 'supermega_postgres17_rehearsal_launcher_v1',
      error: 'configured_python_unusable',
      secret_values_exposed: true,
    }),
    JSON.stringify({
      ok: false,
      contract: 'supermega_postgres17_rehearsal_launcher_v1',
      error: 'secret_material_1234',
      secret_values_exposed: false,
    }),
    JSON.stringify({
      ok: false,
      contract: 'untrusted',
      error: 'workspace_initialization_failed',
      secret_values_exposed: false,
    }),
  ]) assert.equal(recorderChildFailureCode({ status: 1, stderr: unsafe }), '')
  for (const ambiguous of [
    { status: null, error: { code: 'ETIMEDOUT' }, stderr: launcher },
    { status: 1, signal: 'SIGTERM', stderr: launcher },
    { status: 0, stderr: launcher },
  ]) assert.equal(recorderChildFailureCode(ambiguous), '')
  const incompleteRehearsal = JSON.stringify({
    ok: false,
    contract: 'supermega_postgres17_rehearsal_v2',
    error: 'workspace_initialization_failed',
    cleanup_complete: false,
    secret_values_exposed: false,
  })
  assert.equal(
    recorderChildFailureCode({ status: 1, stderr: incompleteRehearsal }),
    '',
  )
})

test('failure diagnostics retain terminal metadata but never child output or authority', async () => {
  const result = {
    status: null,
    signal: 'SIGTERM',
    error: { code: 'ETIMEDOUT', message: 'private path and credential text' },
    stdout: 'password=private-output',
    stderr: 'Traceback at C:\\private\\fixture',
  }
  const diagnostic = buildRecorderFailureDiagnostic(result, 'missing')
  assert.deepEqual(diagnostic.terminal, {
    exitStatus: null,
    signal: 'SIGTERM',
    spawnError: 'ETIMEDOUT',
  })
  assert.equal(diagnostic.streams.stdoutBytes, Buffer.byteLength(result.stdout))
  assert.equal(diagnostic.streams.stderrBytes, Buffer.byteLength(result.stderr))
  assert.equal(diagnostic.streams.contentsRetained, false)
  assert.equal(diagnostic.rawEvidenceAccepted, false)
  assert.equal(diagnostic.cleanupAttested, false)
  assert.equal(diagnostic.leaseReleased, false)
  assert.equal(diagnostic.retryAuthorized, false)
  assert.equal(diagnostic.secretValuesRetained, false)
  assert.equal(JSON.stringify(diagnostic).includes('private'), false)
  assert.equal(JSON.stringify(diagnostic).includes('password'), false)

  const folder = await mkdtemp(join(tmpdir(), 'supermega-recorder-diagnostic-'))
  const destination = join(folder, 'receipt.json')
  try {
    const written = await writeRecorderFailureDiagnostic(destination, result, 'missing')
    assert.deepEqual(JSON.parse(await readFile(written.path, 'utf8')), diagnostic)
    await assert.rejects(
      writeRecorderFailureDiagnostic(destination, result, 'malformed'),
      { code: 'EEXIST' },
    )
    assert.deepEqual(JSON.parse(await readFile(written.path, 'utf8')), diagnostic)
  } finally { await rm(folder, { recursive: true, force: true }) }

  for (const rawStatus of ['unreadable', 'malformed', 'parsed_unreconciled']) {
    assert.equal(buildRecorderFailureDiagnostic({ status: 1 }, rawStatus).rawStatus, rawStatus)
  }
  assert.throws(
    () => buildRecorderFailureDiagnostic({ status: 1 }, 'accepted'),
    /database_rehearsal_diagnostic_raw_status_invalid/,
  )
})

test('core security catalog changes invalidate implementation evidence', async () => {
  const baseline = await implementationEvidence()
  const securityPath = 'supermega_runtime/core_security_catalog.py'
  assert.equal(baseline.paths.filter(path => path === securityPath).length, 1)
  const folder = await mkdtemp(join(tmpdir(), 'supermega-evidence-binding-'))
  try {
    for (const path of baseline.paths) {
      const target = join(folder, path)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, await readFile(new URL(`../${path}`, import.meta.url)))
    }
    assert.deepEqual(await implementationEvidence(folder), baseline)
    const target = join(folder, securityPath)
    await writeFile(target, `${await readFile(target, 'utf8')}\n# changed security contract\n`)
    assert.notEqual((await implementationEvidence(folder)).digest, baseline.digest)
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
})

const checkNames = [
  'approval_agent_row_spoof_denied', 'approval_decision_event_immutable', 'approval_exact_retry', 'approval_human_decision_once',
  'approval_mutated_retry_rejected', 'approval_record_immutable', 'approval_requester_read_scoped', 'approval_reviewer_reads_all',
  'approval_service_row_spoof_denied', 'approval_terminal_replay_rejected', 'backup_created', 'browser_role_isolation',
  'capability_denial', 'capability_scoped_event_reads', 'capability_scoped_reads', 'dedicated_runtime_role_validated',
  'event_immutability', 'identity_transaction_local', 'invalid_initial_version_denied', 'legacy_actor_denied',
  'managed_counter_old_receipt_recovery', 'temporary_runtime_password_expiry_verified', 'managed_exact_retry', 'managed_human_attribution', 'managed_owner_authorization_durable',
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
  'shop_correction_tables_and_forced_rls_validated',
  'shop_correction_constraints_and_indexes_validated',
  'shop_correction_triggers_and_functions_validated',
  'shop_correction_policies_and_acl_validated',
  'shop_correction_catalog_preserved_after_restore',
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
  assert.ok(runner.paths.includes('supermega_runtime/ecommerce_decision_schema.py'))
  assert.equal(runner.migrations.at(-1), '20261024090000_private_trial_backend_v14_shop_correction_consumption.sql')
  assert.ok(runner.paths.includes('tools/private_trial_v14_contract.py'))
  assert.ok(runner.paths.includes('tests/test_shop_correction_postgres_v14_contract.py'))
})
const expectedToolchain = {
  contract: 'supermega.postgres17-toolchain-receipt-evidence.v1',
  profileId: 'synthetic-profile',
  archiveFileName: 'synthetic-installer.exe',
  archiveBytes: 333_927_270,
  sourceArtifactSha256: 'c'.repeat(64),
  manifestSha256: '1'.repeat(64),
  policySha256: '2'.repeat(64),
  sourceDigest: '3'.repeat(64),
  bindingDigest: '4'.repeat(64),
  loadClosureEvidenceSha256: '7'.repeat(64),
  executionBundleSha256: '4'.repeat(64),
  sourceAuthentication: [{
    sourceId: 'synthetic-postgresql',
    sourceArtifactSha256: 'c'.repeat(64),
    evidenceSha256: '5'.repeat(64),
  }],
  trustedBoundary: 'isolated-single-purpose-windows-x64-v1',
}
implementation.expectedToolchain = expectedToolchain
const context = {
  recordedAt: '2026-07-31T10:00:00.000Z',
  implementationCommit: 'b'.repeat(40),
  implementationTree: 'e'.repeat(40),
  implementation,
  archive: { bytes: 333_927_270, sha256: 'c'.repeat(64) },
  toolchain: expectedToolchain,
}
const raw = {
  contract: 'supermega_postgres17_rehearsal_v2', ok: true, authoritative: false,
  ready: true, status: 'rehearsed',
  engine: { major: 17, version: '17.10', tls_active: true, loopback_only: true, start_mode: 'pg_ctl_restricted_token' },
  migrations: { count: migrationNames.length, schema_version: 14, names: migrationNames, schema_profile: 'v14-shop-correction',
    catalog_contract: 'supermega_private_trial_database_v14_shop_correction_v1', production_validator_ready: true },
  source: { head: context.implementationCommit, tree: context.implementationTree, implementation_digest: implementation.digest },
  authority: { actor_identity_source: 'trusted_backend_transaction_context', database_authenticates_individual_actors: false, runtime_credentials_must_remain_server_only: true },
  implementation: { digest: implementation.digest, paths: implementation.paths },
  checks: Object.fromEntries(checkNames.map((name) => [name, true])),
  catalog: { before: Object.fromEntries(catalogCheckNames.map((name) => [name, true])),
    after: Object.fromEntries(catalogCheckNames.map((name) => [name, true])) },
  recovery: { backup_nonempty: true, format: 'pg_dump_custom', restored_schema_version: 14,
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
    checks: 79,
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
  assert.equal(summary.checks, 79)
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
    [r => { r.authoritative = true }, /not_ready/],
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
  assert.equal(checkNames.length, 79)
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
    [p => { p.engine.toolchain.sourceDigest = 'a'.repeat(64) }, /toolchain_stale/],
    [p => { p.engine.toolchain.loadClosureEvidenceSha256 = 'b'.repeat(64) }, /toolchain_stale/],
  ]
  for (const [mutate, error] of mutations) {
    const invalid = buildSanitizedProof(raw, context)
    mutate(invalid)
    invalid.receiptDigest = proofDigest(invalid)
    assert.throws(() => validateSanitizedProof(invalid, implementation), error)
  }
})

test('receipt verifier rejects non-canonical or incomplete toolchain evidence', () => {
  const vectors = [
    p => { p.engine.toolchain.executionBundleSha256 = 'f'.repeat(64) },
    p => { p.engine.toolchain.archiveBytes += 1 },
    p => { p.engine.toolchain.sourceAuthentication = [] },
    p => { p.engine.toolchain.sourceAuthentication[0].unreviewed = true },
    p => { p.engine.toolchain.sourceAuthentication.push({
      sourceId: 'synthetic-a', sourceArtifactSha256: 'a'.repeat(64), evidenceSha256: 'b'.repeat(64),
    }) },
  ]
  for (const mutate of vectors) {
    const invalid = buildSanitizedProof(raw, context)
    mutate(invalid)
    invalid.receiptDigest = proofDigest(invalid)
    assert.throws(() => validateSanitizedProof(invalid, implementation), /toolchain_invalid/)
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

test('read-only CLI consumer rejects a receipt whose authority is not current source-controlled evidence', async () => {
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
    assert.match(duplicate.stderr, /database_rehearsal_toolchain_provenance_unapproved/)
    const fail = invoke()
    assert.equal(fail.status, 1)
    assert.match(fail.stderr, /database_rehearsal_evidence_toolchain_invalid/)
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

test('only successful reconciled completion or prelaunch failure releases owned leases', async () => {
  for (const mode of ['success', 'failed-cleaned', 'before-launch']) {
    const folder = await mkdtemp(join(tmpdir(), 'supermega-lease-test-'))
    const locks = [join(folder, 'repository.lock'), join(folder, 'output.lock')]
    try {
      await assert.rejects(withRecorderLease(locks, async lease => {
        if (mode !== 'before-launch') {
          lease.markLaunched()
          assert.equal(
            lease.reconcile({ status: mode === 'success' ? 0 : 1 }, raw),
            mode === 'success',
          )
        }
        throw new Error('simulated_end')
      }), /simulated_end/)
      for (const path of locks) {
        if (mode === 'failed-cleaned') await access(path)
        else await assert.rejects(access(path), { code: 'ENOENT' })
      }
    } finally { await rm(folder, { recursive: true, force: true }) }
  }
})

test('CLI reports stale evidence before rebuilding a raw runner receipt', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'supermega-stale-rehearsal-'))
  try {
    const proof = buildSanitizedProof(raw, context)
    const staleDigest = `sha256:${'0'.repeat(64)}`
    proof.implementationDigest = staleDigest
    proof.implementation.digest = staleDigest
    proof.receiptDigest = proofDigest(proof)
    const input = join(folder, 'receipt.json')
    await writeFile(input, JSON.stringify(proof))
    await writeFile(`${input}.raw.json`, '{}')
    const result = spawnSync(process.execPath, ['tools/record_postgres17_rehearsal.mjs', '--verify', '--input', input], { encoding: 'utf8', windowsHide: true })
    assert.equal(result.status, 1)
    assert.equal(JSON.parse(result.stderr).error, 'database_rehearsal_evidence_stale')
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
})

test('release CLI rejects every new receipt while toolchain provenance is unapproved', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'supermega-provenance-gate-'))
  try {
    const output = join(folder, 'new-receipt.json')
    const result = spawnSync(process.execPath,
      ['tools/record_postgres17_rehearsal.mjs', '--output', output],
      { encoding: 'utf8', windowsHide: true })
    assert.equal(result.status, 1)
    assert.equal(JSON.parse(result.stderr).error, 'database_rehearsal_toolchain_provenance_unapproved')
    await assert.rejects(access(output), { code: 'ENOENT' })
    await assert.rejects(access(`${output}.raw.json`), { code: 'ENOENT' })
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
})

test('launcher preflight reaches the sanitized platform gate without requiring psycopg', () => {
  const result = spawnSync(process.execPath,
    ['tools/run_postgres17_rehearsal.mjs', '--preflight'],
    { encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 1)
  const report = JSON.parse(result.stdout)
  assert.equal(report.error, 'postgres17_platform_unapproved')
  assert.equal(report.cleanup_complete, true)
  assert.equal(report.production_mutated, false)
})
