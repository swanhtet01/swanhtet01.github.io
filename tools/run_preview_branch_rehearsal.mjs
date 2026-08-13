import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildSupabaseRehearsalPacket,
  originMainReleaseReview,
  validateSupabaseRehearsalPacket,
} from './prepare_supabase_rehearsal_packet.mjs'

// Orchestrates the entire 24-hour Supabase preview-branch rehearsal window so
// it cannot burn on improvisation. Every hosted action shells out to a
// committed tool along the repo's documented paths:
//   - URL and target binding: tools/validate_supermega_database_url.py
//     --rehearsal-preflight (read-only, verify-full, non-production binding).
//   - Release authority: one validated rehearsal packet and a fresh private
//     owner approval bind origin/main, the non-production ref, connection
//     digests, and the exact public-baseline-plus-v1-v10 migration bytes.
//   - Migration application: psql --set ON_ERROR_STOP=1 --file <migration>.
//     No SQL is embedded here; only reviewed, packet-bound files are applied.
//   - Quarantine: supabase/rehearsal/20260804_public_browser_quarantine.sql
//     (self-guarding, self-verifying; fail-closes on inventory drift).
//   - Hosted validator: validate_supermega_database_url.py --ensure-schema
//     --require-ready (read-only v10 contract).
//   - Storage privacy: tools/verify_private_storage_privacy.py --preflight
//     (offline configuration proof; the live six-request audit stays
//     owner-gated in docs/rehearsal-runbook.md).
//   - Session revocation: supabase/rehearsal/
//     20260807_preview_session_revocation_probe.sql (rollback-only probe).
//
// The tool performs zero action when SUPERMEGA_REHEARSAL_DATABASE_URL is
// absent, is resumable through a state file, fail-closes on the first
// failing step, and never accepts or prints credential values.

export const PREVIEW_REHEARSAL_CONTRACT = 'supermega.preview-branch-rehearsal.v2'
export const PREVIEW_REHEARSAL_APPROVAL_CONTRACT = 'supermega.preview-rehearsal-approval.v1'
const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const WINDOW_HOURS = 24
const projectRefPattern = /^[a-z0-9]{20}$/
const commitPattern = /^[0-9a-f]{40}$/
const digestPattern = /^sha256:[0-9a-f]{64}$/
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const QUARANTINE_PATH = 'supabase/rehearsal/20260804_public_browser_quarantine.sql'
const PROBE_PATH = 'supabase/rehearsal/20260807_preview_session_revocation_probe.sql'
const MIGRATION_DIRECTORY = 'supabase/migrations'
const EXPECTED_MIGRATION_COUNT = 12
const EXPECTED_FIRST_MIGRATION = '20260711081300_public_legacy_baseline.sql'
const EXPECTED_FINAL_MIGRATION = '20260804102000_private_trial_backend_v10_supabase_session_revocation.sql'
const EXPECTED_MIGRATIONS = [
  EXPECTED_FIRST_MIGRATION,
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
  EXPECTED_FINAL_MIGRATION,
]
const URL_ENV = 'SUPERMEGA_REHEARSAL_DATABASE_URL'
const REF_ENV = 'SUPERMEGA_REHEARSAL_PROJECT_REF'
const CA_ENV = 'SUPERMEGA_SUPABASE_CA_FILE'
const RUNTIME_URL_ENV = 'SUPERMEGA_REHEARSAL_RUNTIME_DATABASE_URL'
const STORAGE_AUDIT_URL_ENV = 'SUPERMEGA_REHEARSAL_STORAGE_AUDIT_DATABASE_URL'
const PACKET_ENV = 'SUPERMEGA_REHEARSAL_PACKET_FILE'
const APPROVAL_ENV = 'SUPERMEGA_REHEARSAL_APPROVAL_FILE'
const PRODUCTION_REF_ENV = 'SUPERMEGA_PRODUCTION_PROJECT_REF'
const POSTGRES_BIN_ENV = 'SUPERMEGA_POSTGRES17_BIN'
const STORAGE_PRIVACY_ENV = [
  'SUPERMEGA_STORAGE_PRIVACY_ADAPTER',
  'SUPERMEGA_STORAGE_PRIVACY_BASE_URL',
  'SUPERMEGA_STORAGE_PRIVACY_ALLOWED_HOST',
  'SUPERMEGA_STORAGE_PRIVACY_OWNER_APPROVAL_ID',
  'SUPERMEGA_STORAGE_PRIVACY_BUCKET',
  'SUPERMEGA_STORAGE_PRIVACY_TENANT_A_PREFIX',
  'SUPERMEGA_STORAGE_PRIVACY_TENANT_A_OBJECT',
  'SUPERMEGA_STORAGE_PRIVACY_TENANT_B_PREFIX',
  'SUPERMEGA_STORAGE_PRIVACY_TENANT_B_OBJECT',
  'SUPERMEGA_STORAGE_PRIVACY_PUBLISHABLE_KEY',
  'SUPERMEGA_STORAGE_PRIVACY_TENANT_A_JWT',
  'SUPERMEGA_STORAGE_PRIVACY_TENANT_B_JWT',
]
const LEAK_TOKENS = ['postgres://', 'postgresql://', 'sb_secret_', 'password=']
const PRIVILEGED_DATABASE_ROLES = new Set([
  'postgres', 'supabase_admin', 'service_role', 'authenticator', 'anon', 'authenticated',
  'pg_read_all_data', 'pg_write_all_data', 'pg_execute_server_program',
  'pg_read_server_files', 'pg_write_server_files',
])
const REQUIRED_APPROVED_ACTIONS = [
  'apply_complete_source_migration_chain_to_preview',
  'run_preview_validation_and_rollback_only_probes',
]
const REQUIRED_CLEAN_TARGET_CHECKS = [
  'postgres_major_17',
  'read_only_encrypted_connection',
  'session_role_stable',
  'administrative_role_can_create_runtime_role',
  'administrative_role_can_create_private_schema',
  'postgres_database_selected',
  'private_schema_absent',
  'backend_role_absent',
  'public_user_relations_absent',
  'auth_users_absent',
  'auth_sessions_absent',
  'storage_buckets_absent',
  'storage_objects_absent',
]
const OWNER_CONSOLE_SEGMENTS = [
  { id: 'owner_branch_creation', estimateMinutes: 45, description: 'Create one empty preview branch without production data and capture ref, connection string, and CA file (docs/rehearsal-runbook.md step 2).' },
  { id: 'owner_runtime_login_and_urls', estimateMinutes: 30, description: 'Create the branch runtime login and read-only Storage-audit login, then prepare the private URL-bound approval (runbook step 4).' },
  { id: 'owner_backup_restore_evidence', estimateMinutes: 90, description: 'Capture provider backup inventory and independent restore evidence on the isolated target (runbook step 7).' },
  { id: 'owner_evidence_review', estimateMinutes: 120, description: 'Review the evidence packet against the required-evidence checklist (runbook step 8).' },
  { id: 'owner_branch_deletion', estimateMinutes: 15, description: 'Delete the preview branch after evidence capture and record the deletion receipt (runbook step 9).' },
]

function fail(code) {
  const error = new Error(code)
  error.rehearsalCode = code
  throw error
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function sanitizeText(value, secrets) {
  let output = String(value ?? '')
  for (const secret of secrets) {
    if (secret) output = output.split(secret).join('[redacted]')
  }
  return output
}

function assertNoCredential(serialized, code) {
  const lowered = serialized.toLowerCase()
  if (LEAK_TOKENS.some((token) => lowered.includes(token))) fail(code)
}

export function parsePreviewDatabaseUrl(rawUrl, { expectedProjectRef, productionProjectRef }) {
  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    fail('rehearsal_database_url_invalid')
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) fail('rehearsal_database_url_invalid')
  const parameters = [...parsed.searchParams.keys()]
  if (parameters.some((key) => key !== 'sslmode')) fail('rehearsal_connection_parameter_not_allowed')
  if (parsed.searchParams.getAll('sslmode').map((value) => value.toLowerCase()).join(',') !== 'verify-full') {
    fail('rehearsal_verify_full_required')
  }
  if (parsed.pathname.replace(/^\/+|\/+$/g, '') !== 'postgres') fail('rehearsal_database_must_be_postgres')
  const host = parsed.hostname.toLowerCase()
  const username = decodeURIComponent(parsed.username || '')
  const port = parsed.port ? Number(parsed.port) : 5432
  const direct = /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(host)
  const pooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(host)
  let targetRef = ''
  if (direct) {
    if (username !== 'postgres' || port !== 5432) fail('rehearsal_direct_admin_connection_required')
    targetRef = direct[1]
  } else if (pooler) {
    const poolerUser = /^postgres\.([a-z0-9]{20})$/.exec(username)
    if (!poolerUser) fail('rehearsal_pooler_admin_connection_required')
    if (port === 6543) fail('rehearsal_transaction_pooler_not_for_migrations')
    if (port !== 5432) fail('rehearsal_session_pooler_required')
    targetRef = poolerUser[1]
  } else {
    fail('rehearsal_target_not_supabase')
  }
  if (targetRef === productionProjectRef) fail('rehearsal_target_is_production')
  if (targetRef !== expectedProjectRef) fail('rehearsal_target_ref_mismatch')
  return {
    host,
    port,
    username,
    password: decodeURIComponent(parsed.password || ''),
    database: 'postgres',
  }
}

function exactKeys(value, expected) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort())
}

function parseBoundedDatabaseUrl(rawUrl, {
  expectedProjectRef,
  productionProjectRef,
  purpose,
}) {
  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    fail(`${purpose}_database_url_invalid`)
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) fail(`${purpose}_database_url_invalid`)
  if (!parsed.username || !parsed.password) fail(`${purpose}_database_url_credentials_incomplete`)
  if ([...parsed.searchParams.keys()].some((key) => key !== 'sslmode')) fail(`${purpose}_connection_parameter_not_allowed`)
  if (parsed.searchParams.getAll('sslmode').map((value) => value.toLowerCase()).join(',') !== 'verify-full') {
    fail(`${purpose}_verify_full_required`)
  }
  if (parsed.pathname.replace(/^\/+|\/+$/g, '') !== 'postgres') fail(`${purpose}_database_must_be_postgres`)

  const host = parsed.hostname.toLowerCase()
  const username = decodeURIComponent(parsed.username)
  const port = parsed.port ? Number(parsed.port) : 5432
  const direct = /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(host)
  const pooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(host)
  let targetRef = ''
  let loginRole = username
  if (direct) {
    if (port !== 5432) fail(`${purpose}_direct_port_invalid`)
    targetRef = direct[1]
  } else if (pooler) {
    if (![5432, 6543].includes(port)) fail(`${purpose}_pooler_port_invalid`)
    const match = /^([a-z][a-z0-9_]*)\.([a-z0-9]{20})$/.exec(username)
    if (!match) fail(`${purpose}_pooler_login_invalid`)
    loginRole = match[1]
    targetRef = match[2]
  } else {
    fail(`${purpose}_target_not_supabase`)
  }
  if (targetRef === productionProjectRef) fail('rehearsal_target_is_production')
  if (targetRef !== expectedProjectRef) fail(`${purpose}_target_ref_mismatch`)
  if (PRIVILEGED_DATABASE_ROLES.has(loginRole) || loginRole.startsWith('supabase_')) {
    fail(`${purpose}_privileged_credentials_rejected`)
  }
  if (purpose === 'runtime' && loginRole !== 'supermega_trial_runtime') {
    fail('runtime_dedicated_login_required')
  }
  if (purpose === 'storage_audit' && loginRole === 'supermega_trial_runtime') {
    fail('storage_audit_distinct_login_required')
  }
  return { host, port, loginRole, targetRef }
}

function resolvePrivateJson(rootDir, rawPath, code) {
  const value = String(rawPath || '').trim()
  if (!value) fail(`${code}_missing`)
  const target = isAbsolute(value) ? resolve(value) : resolve(rootDir, value)
  const temporaryRoot = resolve(rootDir, '.tmp')
  if (target !== temporaryRoot && !target.startsWith(`${temporaryRoot}${sep}`)) fail(`${code}_must_be_temporary`)
  if (!target.toLowerCase().endsWith('.json') || !existsSync(target)) fail(`${code}_invalid`)
  return target
}

function validateExecutionApproval(approval, {
  now,
  releaseCommit,
  packetDigest,
  targetProjectRef,
  connectionDigests,
}) {
  if (!exactKeys(approval, [
    'contract', 'decision', 'approvalId', 'approvedBy', 'approvedAt', 'expiresAt',
    'releaseCommit', 'rehearsalPacketDigest', 'targetProjectRef', 'connectionDigests',
    'branch', 'authorizedActions', 'controls',
  ])) fail('rehearsal_approval_shape_invalid')
  if (approval.contract !== PREVIEW_REHEARSAL_APPROVAL_CONTRACT || approval.decision !== 'approved') {
    fail('rehearsal_approval_not_granted')
  }
  if (!uuidPattern.test(approval.approvalId || '') || typeof approval.approvedBy !== 'string' || !approval.approvedBy.trim()) {
    fail('rehearsal_approval_identity_invalid')
  }
  const approvedAt = Date.parse(approval.approvedAt)
  const expiresAt = Date.parse(approval.expiresAt)
  const currentTime = now.getTime()
  if (!Number.isFinite(approvedAt) || !Number.isFinite(expiresAt)
    || approvedAt > currentTime || expiresAt <= currentTime
    || expiresAt - approvedAt > WINDOW_HOURS * 60 * 60 * 1000) {
    fail('rehearsal_approval_expired_or_window_invalid')
  }
  if (approval.releaseCommit !== releaseCommit
    || approval.rehearsalPacketDigest !== packetDigest
    || approval.targetProjectRef !== targetProjectRef) {
    fail('rehearsal_approval_target_stale')
  }
  if (!exactKeys(approval.connectionDigests, ['administrative', 'runtime', 'storageAudit'])
    || JSON.stringify(approval.connectionDigests) !== JSON.stringify(connectionDigests)
    || !Object.values(approval.connectionDigests).every((value) => digestPattern.test(value))) {
    fail('rehearsal_approval_connections_unreviewed')
  }
  if (!exactKeys(approval.branch, [
    'startsWithProductionData', 'maximumLifetimeHours', 'providerUsageChargesAcknowledged',
    'creationApproved', 'migrationApplicationApproved', 'deleteAfterEvidence',
  ])
    || approval.branch.startsWithProductionData !== false
    || approval.branch.maximumLifetimeHours !== WINDOW_HOURS
    || approval.branch.providerUsageChargesAcknowledged !== true
    || approval.branch.creationApproved !== true
    || approval.branch.migrationApplicationApproved !== true
    || approval.branch.deleteAfterEvidence !== true) {
    fail('rehearsal_approval_branch_boundary_invalid')
  }
  if (JSON.stringify(approval.authorizedActions) !== JSON.stringify(REQUIRED_APPROVED_ACTIONS)) {
    fail('rehearsal_approval_actions_invalid')
  }
  if (!exactKeys(approval.controls, [
    'productionTargetApproved', 'productionDataApproved', 'productionMutationApproved',
    'managedActivationApproved',
  ])
    || Object.values(approval.controls).some((value) => value !== false)) {
    fail('rehearsal_approval_production_boundary_invalid')
  }
  return {
    approvalIdDigest: `sha256:${sha256(approval.approvalId)}`,
    approvedByDigest: `sha256:${sha256(approval.approvedBy.trim())}`,
    approvedAt: new Date(approvedAt).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
  }
}

export function buildPlan() {
  const migrationSteps = EXPECTED_MIGRATIONS.map((name, index) => ({
    id: `apply_migration_${String(index + 1).padStart(2, '0')}`,
    kind: 'branch-mutation',
    estimateMinutes: 8,
    covers: ['ordered-migration-application-through-v10'],
    command: `psql --set ON_ERROR_STOP=1 --file ${MIGRATION_DIRECTORY}/${name}`,
  }))
  const steps = [
    { id: 'release_pin', kind: 'local', estimateMinutes: 1, covers: [], command: 'git status --porcelain && git rev-parse HEAD == origin/main' },
    { id: 'release_authority', kind: 'local', estimateMinutes: 2, covers: [], command: `verify ${PACKET_ENV} and ${APPROVAL_ENV} bind this clean origin/main commit, target ref, exact URL digests, and a maximum-24-hour owner approval` },
    { id: 'local_quarantine_guard', kind: 'local', estimateMinutes: 3, covers: ['public-browser-table-and-sequence-denial (local proof)'], command: 'node tools/verify_public_browser_quarantine.mjs' },
    { id: 'migration_inventory', kind: 'local', estimateMinutes: 1, covers: [], command: `verify exact packet digests for the public baseline and all eleven private migrations, plus quarantine and rollback-only probe` },
    { id: 'toolchain', kind: 'local', estimateMinutes: 1, covers: [], command: 'psql --version (major 17 required)' },
    { id: 'url_preflight', kind: 'network-read', estimateMinutes: 3, covers: ['hostname-verified-postgresql-17-preflight', 'clean-target-without-production-data'], command: `node tools/run_python_tool.mjs tools/validate_supermega_database_url.py --env-key ${URL_ENV} --rehearsal-preflight --expected-project-ref-env-key ${REF_ENV} --production-project-ref-env-key ${PRODUCTION_REF_ENV} --ssl-root-cert-env-key ${CA_ENV}` },
    { id: 'runtime_credential_boundary', kind: 'local', estimateMinutes: 1, covers: ['dedicated-unprivileged-runtime-and-storage-audit-logins'], command: `validate ${RUNTIME_URL_ENV} and ${STORAGE_AUDIT_URL_ENV} offline without printing credentials` },
    { id: 'storage_privacy_preflight', kind: 'local', estimateMinutes: 2, covers: ['private-storage-isolation-proof (offline configuration preflight; live audit stays owner-gated)'], command: 'node tools/run_python_tool.mjs tools/verify_private_storage_privacy.py --preflight' },
    ...migrationSteps,
    { id: 'apply_quarantine', kind: 'branch-mutation', estimateMinutes: 10, covers: ['public-browser-table-and-sequence-denial', 'public-default-privilege-denial-for-postgres-and-supabase-admin', 'service-role-contact-path-retained'], command: `psql --set ON_ERROR_STOP=1 --file ${QUARANTINE_PATH}` },
    { id: 'hosted_validator', kind: 'network-read', estimateMinutes: 10, covers: ['read-only-v10-runtime-validator'], command: `node tools/run_python_tool.mjs tools/validate_supermega_database_url.py --env-key ${RUNTIME_URL_ENV} --storage-audit-env-key ${STORAGE_AUDIT_URL_ENV} --ensure-schema --require-ready` },
    { id: 'session_revocation_probe', kind: 'network-read', estimateMinutes: 5, covers: ['active-session-acceptance-and-revoked-session-denial'], command: `psql --set ON_ERROR_STOP=1 --file ${PROBE_PATH} (single transaction, ends in ROLLBACK)` },
    { id: 'evidence_packet', kind: 'local', estimateMinutes: 2, covers: [], command: 'assemble sanitized evidence packet under .tmp/' },
  ]
  const toolMinutes = steps.reduce((total, step) => total + step.estimateMinutes, 0)
  const ownerMinutes = OWNER_CONSOLE_SEGMENTS.reduce((total, segment) => total + segment.estimateMinutes, 0)
  const plannedMinutes = toolMinutes + ownerMinutes
  return {
    contract: PREVIEW_REHEARSAL_CONTRACT,
    windowHours: WINDOW_HOURS,
    steps,
    ownerConsoleSegments: OWNER_CONSOLE_SEGMENTS,
    totals: {
      toolMinutes,
      ownerConsoleMinutes: ownerMinutes,
      plannedMinutes,
      windowMinutes: WINDOW_HOURS * 60,
      bufferMinutes: WINDOW_HOURS * 60 - plannedMinutes,
    },
  }
}

function defaultExec({ argv, envOverrides, cwd }) {
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd,
    env: { ...process.env, ...envOverrides },
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
  })
  if (result.error) {
    return { status: 127, stdout: '', stderr: String(result.error.message || 'spawn_failed') }
  }
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

function lastJsonLine(stdout) {
  const lines = String(stdout ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index])
    } catch {
      // keep scanning earlier lines
    }
  }
  return null
}

function resolvePsql(env, exec, rootDir) {
  const configured = String(env[POSTGRES_BIN_ENV] || '').trim()
  const psql = configured ? join(configured, process.platform === 'win32' ? 'psql.exe' : 'psql') : 'psql'
  const result = exec({ stepId: 'toolchain', argv: [psql, '--version'], envOverrides: {}, cwd: rootDir })
  if (result.status !== 0) fail('psql_unavailable')
  const match = /\s(\d+)(?:\.\d+)?/.exec(result.stdout || '')
  if (!match || Number(match[1]) !== 17) fail('psql_major_17_required')
  return { psql, versionOutput: String(result.stdout || '').trim() }
}

function psqlEnv(connection, caFile) {
  return {
    PGHOST: connection.host,
    PGPORT: String(connection.port),
    PGUSER: connection.username,
    PGPASSWORD: connection.password,
    PGDATABASE: connection.database,
    PGSSLMODE: 'verify-full',
    PGSSLROOTCERT: caFile,
    PGCONNECT_TIMEOUT: '30',
  }
}

function readState(statePath, readFile) {
  try {
    return JSON.parse(readFile(statePath))
  } catch {
    return null
  }
}

export async function runRehearsal({
  argv = [],
  env = process.env,
  exec = defaultExec,
  rootDir = root,
  evidenceRoot = '',
  now = () => new Date(),
  log = (line) => process.stdout.write(`${line}\n`),
  readFile = (path) => readFileSync(path, 'utf8'),
  readFileBytes = (path) => readFileSync(path),
} = {}) {
  const flags = new Set(argv)
  for (const flag of flags) {
    if (!['--dry-run', '--reset-state', '--self-test'].includes(flag)) fail('rehearsal_arguments_invalid')
  }

  if (flags.has('--dry-run')) {
    const plan = buildPlan()
    if (plan.totals.bufferMinutes <= 0) fail('rehearsal_plan_exceeds_window')
    log(JSON.stringify({ ok: true, mode: 'dry-run', ...plan }, null, 2))
    return { ok: true, mode: 'dry-run', plan, exitCode: 0 }
  }

  const databaseUrl = String(env[URL_ENV] || '').trim()
  if (!databaseUrl) {
    const report = {
      ok: true,
      contract: PREVIEW_REHEARSAL_CONTRACT,
      status: 'rehearsal_target_not_configured',
      stepsExecuted: 0,
      externalActionsPerformed: 0,
      productionMutated: false,
      hint: `Set ${URL_ENV} to the owner-reviewed preview-branch connection string (docs/rehearsal-runbook.md step 4) or use --dry-run to inspect the plan.`,
    }
    log(JSON.stringify(report))
    return { ...report, exitCode: 0 }
  }

  const stepResults = []
  let runRoot = ''
  let statePath = ''
  let state = null
  const saveState = () => {
    if (!state || !statePath) return
    const staged = `${statePath}.tmp`
    writeFileSync(staged, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    renameSync(staged, statePath)
  }
  try {
  const expectedProjectRef = String(env[REF_ENV] || '').trim().toLowerCase()
  if (!projectRefPattern.test(expectedProjectRef)) fail('rehearsal_expected_project_ref_invalid')
  const caFile = String(env[CA_ENV] || '').trim()
  if (!caFile || !existsSync(caFile)) fail('rehearsal_ssl_root_certificate_missing')

  const manifest = JSON.parse(readFile(resolve(rootDir, 'package.json')))
  const productionProjectRef = String(manifest?.supermega?.productionSupabaseProjectRef || '')
  if (!projectRefPattern.test(productionProjectRef)) fail('rehearsal_production_ref_unconfigured')
  if (manifest?.supermega?.productionSupabaseTargetStatus !== 'protected-unapproved') fail('rehearsal_production_guard_invalid')
  if (expectedProjectRef === productionProjectRef) fail('rehearsal_target_is_production')

  const connection = parsePreviewDatabaseUrl(databaseUrl, { expectedProjectRef, productionProjectRef })
  const runtimeUrl = String(env[RUNTIME_URL_ENV] || '').trim()
  const storageAuditUrl = String(env[STORAGE_AUDIT_URL_ENV] || '').trim()
  if (!runtimeUrl || !storageAuditUrl) fail('hosted_validator_environment_missing')
  const runtimeConnection = parseBoundedDatabaseUrl(runtimeUrl, {
    expectedProjectRef,
    productionProjectRef,
    purpose: 'runtime',
  })
  const storageAuditConnection = parseBoundedDatabaseUrl(storageAuditUrl, {
    expectedProjectRef,
    productionProjectRef,
    purpose: 'storage_audit',
  })
  if (runtimeConnection.loginRole === storageAuditConnection.loginRole) fail('storage_audit_distinct_login_required')
  const missingStoragePrivacy = STORAGE_PRIVACY_ENV.filter((key) => !String(env[key] || '').trim())
  if (missingStoragePrivacy.length) fail('storage_privacy_environment_missing')
  const secrets = [databaseUrl, connection.password, runtimeUrl, storageAuditUrl]
    .map((value) => value.trim())
    .filter(Boolean)

  const startedAt = now()
  const releaseHead = exec({ stepId: 'release_pin', argv: ['git', '-C', rootDir, 'rev-parse', 'HEAD'], envOverrides: {}, cwd: rootDir })
  if (releaseHead.status !== 0) fail('rehearsal_release_commit_unavailable')
  const releaseCommit = releaseHead.stdout.trim()
  if (!commitPattern.test(releaseCommit)) fail('rehearsal_release_commit_invalid')

  const packetPath = resolvePrivateJson(rootDir, env[PACKET_ENV], 'rehearsal_packet_file')
  let packet
  try {
    packet = JSON.parse(readFile(packetPath))
    await validateSupabaseRehearsalPacket(packet, {
      repositoryRoot: rootDir,
      expectedReleaseCommit: releaseCommit,
    })
  } catch {
    fail('rehearsal_packet_invalid_or_stale')
  }
  if (packet.release?.review?.mode !== 'origin_main'
    || packet.release.review.branch !== 'main'
    || packet.release.review.commit !== releaseCommit) {
    fail('rehearsal_release_not_reviewed_main')
  }
  if (packet.authority?.rehearsalProjectRef !== expectedProjectRef
    || packet.authority?.protectedProductionProjectRef !== productionProjectRef
    || packet.authority?.targetMustRemainNonProduction !== true
    || packet.preflight?.expectedStartingState !== 'clean-target') {
    fail('rehearsal_packet_target_invalid')
  }

  const migrations = packet.release?.migrations
  if (!Array.isArray(migrations)
    || migrations.length !== EXPECTED_MIGRATION_COUNT
    || migrations[0]?.name !== EXPECTED_FIRST_MIGRATION
    || migrations.at(-1)?.name !== EXPECTED_FINAL_MIGRATION
    || JSON.stringify(migrations.map((migration) => migration.name)) !== JSON.stringify(EXPECTED_MIGRATIONS)) {
    fail('rehearsal_packet_migration_chain_invalid')
  }
  const inventory = {}
  for (const migration of migrations) {
    const digest = `sha256:${sha256(readFileBytes(resolve(rootDir, MIGRATION_DIRECTORY, migration.name)))}`
    if (migration.sha256 !== digest.slice(7)) fail('rehearsal_packet_migration_digest_mismatch')
    inventory[migration.name] = digest
  }
  const quarantineDigest = `sha256:${sha256(readFileBytes(resolve(rootDir, QUARANTINE_PATH)))}`
  if (packet.release?.browserQuarantine?.script?.path !== QUARANTINE_PATH
    || packet.release.browserQuarantine.script.sha256 !== quarantineDigest.slice(7)) {
    fail('rehearsal_packet_quarantine_digest_mismatch')
  }
  inventory[QUARANTINE_PATH] = quarantineDigest
  inventory[PROBE_PATH] = `sha256:${sha256(readFileBytes(resolve(rootDir, PROBE_PATH)))}`

  const connectionDigests = {
    administrative: `sha256:${sha256(databaseUrl)}`,
    runtime: `sha256:${sha256(runtimeUrl)}`,
    storageAudit: `sha256:${sha256(storageAuditUrl)}`,
  }
  const approvalPath = resolvePrivateJson(rootDir, env[APPROVAL_ENV], 'rehearsal_approval_file')
  let approval
  try {
    approval = JSON.parse(readFile(approvalPath))
  } catch {
    fail('rehearsal_approval_file_invalid')
  }
  const approvalAuthority = validateExecutionApproval(approval, {
    now: startedAt,
    releaseCommit,
    packetDigest: packet.packetDigest,
    targetProjectRef: expectedProjectRef,
    connectionDigests,
  })
  const plan = buildPlan()

  const fingerprint = `sha256:${sha256(JSON.stringify({
    contract: PREVIEW_REHEARSAL_CONTRACT,
    releaseCommit,
    targetProjectRef: expectedProjectRef,
    packetDigest: packet.packetDigest,
    approval: approvalAuthority,
    inventory,
  }))}`

  const resolvedEvidenceRoot = evidenceRoot
    ? (isAbsolute(evidenceRoot) ? evidenceRoot : resolve(rootDir, evidenceRoot))
    : resolve(rootDir, '.tmp', 'preview-branch-rehearsal')
  const temporaryRoot = resolve(rootDir, '.tmp')
  if (resolvedEvidenceRoot !== temporaryRoot && !resolvedEvidenceRoot.startsWith(`${temporaryRoot}${sep}`)) {
    fail('rehearsal_evidence_root_must_be_temporary')
  }
  runRoot = join(resolvedEvidenceRoot, fingerprint.slice(7, 19))
  statePath = join(runRoot, 'state.json')
  mkdirSync(runRoot, { recursive: true })
  if (flags.has('--reset-state')) rmSync(statePath, { force: true })
  state = readState(statePath, readFile)
  if (state && state.fingerprint !== fingerprint) fail('rehearsal_state_fingerprint_mismatch')
  if (!state) state = { contract: PREVIEW_REHEARSAL_CONTRACT, fingerprint, releaseCommit, targetProjectRef: expectedProjectRef, steps: {} }

  let stepIndex = 0
  const record = (id, outcome, detail) => {
    stepIndex += 1
    const evidenceFile = join(runRoot, `${String(stepIndex).padStart(2, '0')}-${id}.json`)
    const payload = {
      contract: PREVIEW_REHEARSAL_CONTRACT,
      step: id,
      outcome,
      recordedAt: now().toISOString(),
      ...detail,
    }
    const serialized = JSON.stringify(payload, null, 2)
    assertNoCredential(serialized, 'rehearsal_evidence_credential_detected')
    writeFileSync(evidenceFile, `${serialized}\n`, 'utf8')
    stepResults.push({ id, outcome, evidenceFile })
    if (outcome === 'ok') {
      state.steps[id] = { ok: true, completedAt: payload.recordedAt, digest: `sha256:${sha256(serialized)}` }
      saveState()
    }
    return payload
  }

  const runCommandStep = (id, argv, envOverrides, { requireExitZero = true } = {}) => {
    if (state.steps[id]?.ok) {
      stepResults.push({ id, outcome: 'skipped_already_complete' })
      return null
    }
    const started = now()
    const result = exec({ stepId: id, argv, envOverrides, cwd: rootDir })
    const stdout = sanitizeText(result.stdout, secrets)
    const stderr = sanitizeText(result.stderr, secrets)
    const detail = {
      argv: argv.map((entry) => sanitizeText(entry, secrets)),
      exitCode: result.status,
      durationMs: now().getTime() - started.getTime(),
      stdout: stdout.slice(0, 20000),
      stderr: stderr.slice(0, 20000),
    }
    if (requireExitZero && result.status !== 0) {
      record(id, 'failed', detail)
      fail(`step_failed_${id}`)
    }
    record(id, 'ok', detail)
    return { ...result, stdout, stderr }
  }

    // release_pin: the run must start from a clean checkout of reviewed history.
    if (!state.steps.release_pin?.ok) {
      const status = exec({ stepId: 'release_pin', argv: ['git', '-C', rootDir, 'status', '--porcelain'], envOverrides: {}, cwd: rootDir })
      if (status.status !== 0 || status.stdout.trim()) {
        record('release_pin', 'failed', { reason: 'rehearsal_checkout_dirty' })
        fail('rehearsal_checkout_dirty')
      }
      const originMain = exec({ stepId: 'release_pin', argv: ['git', '-C', rootDir, 'rev-parse', 'origin/main'], envOverrides: {}, cwd: rootDir })
      if (originMain.status !== 0 || originMain.stdout.trim() !== releaseCommit) {
        record('release_pin', 'failed', { reason: 'rehearsal_head_not_origin_main_fetch_first' })
        fail('rehearsal_head_not_origin_main_fetch_first')
      }
      record('release_pin', 'ok', { releaseCommit, targetProjectRef: expectedProjectRef })
    } else {
      stepResults.push({ id: 'release_pin', outcome: 'skipped_already_complete' })
    }

    if (!state.steps.release_authority?.ok) {
      record('release_authority', 'ok', {
        releaseCommit,
        targetProjectRef: expectedProjectRef,
        rehearsalPacketContract: packet.contract,
        rehearsalPacketDigest: packet.packetDigest,
        approvalContract: PREVIEW_REHEARSAL_APPROVAL_CONTRACT,
        ...approvalAuthority,
        connectionReviewDigest: `sha256:${sha256(JSON.stringify(connectionDigests))}`,
        maximumLifetimeHours: WINDOW_HOURS,
        startsWithProductionData: false,
      })
    } else {
      stepResults.push({ id: 'release_authority', outcome: 'skipped_already_complete' })
    }

    runCommandStep('local_quarantine_guard', ['node', 'tools/verify_public_browser_quarantine.mjs'], {})

    // migration_inventory: bind every migration byte to the reviewed packet
    // before any hosted mutation. The chain starts with the public baseline,
    // then applies all eleven private migrations through v10.
    if (!state.steps.migration_inventory?.ok) {
      record('migration_inventory', 'ok', {
        migrationCount: EXPECTED_MIGRATION_COUNT,
        migrations: migrations.map((migration) => ({
          name: migration.name,
          packetDigest: `sha256:${migration.sha256}`,
        })),
        quarantineDigest: inventory[QUARANTINE_PATH],
        sessionRevocationProbeDigest: inventory[PROBE_PATH],
      })
    } else {
      stepResults.push({ id: 'migration_inventory', outcome: 'skipped_already_complete' })
    }

    const toolchain = resolvePsql(env, exec, rootDir)
    if (!state.steps.toolchain?.ok) record('toolchain', 'ok', { psqlVersion: sanitizeText(toolchain.versionOutput, secrets) })
    else stepResults.push({ id: 'toolchain', outcome: 'skipped_already_complete' })

    // url_preflight: require the clean target described by the reviewed packet.
    // A production schema mirror, existing private schema, or existing backend
    // role is rejected before any migration is handed to psql.
    if (!state.steps.url_preflight?.ok) {
      const preflightArgv = [
        'node', 'tools/run_python_tool.mjs', 'tools/validate_supermega_database_url.py',
        '--env-key', URL_ENV,
        '--rehearsal-preflight',
        '--expected-project-ref-env-key', REF_ENV,
        '--production-project-ref-env-key', PRODUCTION_REF_ENV,
        '--ssl-root-cert-env-key', CA_ENV,
      ]
      const started = now()
      const result = exec({
        stepId: 'url_preflight',
        argv: preflightArgv,
        envOverrides: { [PRODUCTION_REF_ENV]: productionProjectRef, [REF_ENV]: expectedProjectRef },
        cwd: rootDir,
      })
      const report = lastJsonLine(sanitizeText(result.stdout, secrets))
      const detail = {
        argv: preflightArgv,
        exitCode: result.status,
        durationMs: now().getTime() - started.getTime(),
        report,
        stderr: sanitizeText(result.stderr, secrets).slice(0, 20000),
      }
      if (!report || report.contract !== 'supermega_supabase_rehearsal_preflight_v1') {
        record('url_preflight', 'failed', detail)
        fail('url_preflight_report_invalid')
      }
      const failed = Array.isArray(report.failed_checks) ? report.failed_checks : null
      if (report.ready !== true
        || report.status !== 'clean_target'
        || !failed
        || failed.length !== 0
        || REQUIRED_CLEAN_TARGET_CHECKS.some((check) => report.checks?.[check] !== true)
        || report.production_mutated !== false
        || report.supabase_mutated !== false) {
        record('url_preflight', 'failed', detail)
        fail('rehearsal_clean_target_required')
      }
      record('url_preflight', 'ok', { ...detail, baseline: 'clean-target-without-production-data' })
    } else {
      stepResults.push({ id: 'url_preflight', outcome: 'skipped_already_complete' })
    }

    if (!state.steps.runtime_credential_boundary?.ok) {
      record('runtime_credential_boundary', 'ok', {
        targetProjectRef: expectedProjectRef,
        runtimeLoginRole: runtimeConnection.loginRole,
        storageAuditLoginRole: storageAuditConnection.loginRole,
        privilegedCredentialsRejected: true,
        credentialsIncluded: false,
      })
    } else {
      stepResults.push({ id: 'runtime_credential_boundary', outcome: 'skipped_already_complete' })
    }

    // All Storage configuration must pass locally before the first branch
    // mutation. The live six-request audit remains a separately confirmed,
    // read-only owner action documented in the runbook.
    runCommandStep('storage_privacy_preflight', [
      'node', 'tools/run_python_tool.mjs', 'tools/verify_private_storage_privacy.py', '--preflight',
    ], {})

    // Apply the reviewed public baseline and all private migrations through
    // v10. Recheck the exact packet digest immediately before every psql call.
    const branchEnv = psqlEnv(connection, caFile)
    for (const [index, migration] of migrations.entries()) {
      const id = `apply_migration_${String(index + 1).padStart(2, '0')}`
      if (state.steps[id]?.ok) {
        stepResults.push({ id, outcome: 'skipped_already_complete' })
        continue
      }
      const bytes = readFileBytes(resolve(rootDir, MIGRATION_DIRECTORY, migration.name))
      if (sha256(bytes) !== migration.sha256) {
        fail(`migration_digest_mismatch_${String(index + 1).padStart(2, '0')}`)
      }
      runCommandStep(id, [
        toolchain.psql, '--no-psqlrc', '--no-password',
        '--set', 'ON_ERROR_STOP=1',
        '--file', resolve(rootDir, MIGRATION_DIRECTORY, migration.name),
      ], branchEnv)
    }

    runCommandStep('apply_quarantine', [
      toolchain.psql, '--no-psqlrc', '--no-password',
      '--set', 'ON_ERROR_STOP=1',
      '--file', resolve(rootDir, QUARANTINE_PATH),
    ], branchEnv)

    // hosted_validator: read-only v10 contract via the prevalidated dedicated
    // runtime and Storage-audit logins.
    if (!state.steps.hosted_validator?.ok) {
      runCommandStep('hosted_validator', [
        'node', 'tools/run_python_tool.mjs', 'tools/validate_supermega_database_url.py',
        '--env-key', RUNTIME_URL_ENV,
        '--storage-audit-env-key', STORAGE_AUDIT_URL_ENV,
        '--ensure-schema', '--require-ready',
      ], {})
    } else {
      stepResults.push({ id: 'hosted_validator', outcome: 'skipped_already_complete' })
    }

    runCommandStep('session_revocation_probe', [
      toolchain.psql, '--no-psqlrc', '--no-password',
      '--set', 'ON_ERROR_STOP=1',
      '--file', resolve(rootDir, PROBE_PATH),
    ], branchEnv)

    const finishedAt = now()
    const evidencePacket = {
      contract: PREVIEW_REHEARSAL_CONTRACT,
      ok: true,
      generatedAt: finishedAt.toISOString(),
      releaseCommit,
      targetProjectRef: expectedProjectRef,
      baseline: 'clean-target-without-production-data',
      fingerprint,
      authority: {
        rehearsalPacketContract: packet.contract,
        rehearsalPacketDigest: packet.packetDigest,
        approvalContract: PREVIEW_REHEARSAL_APPROVAL_CONTRACT,
        ...approvalAuthority,
        connectionReviewDigest: `sha256:${sha256(JSON.stringify(connectionDigests))}`,
      },
      window: {
        windowHours: WINDOW_HOURS,
        plannedMinutes: plan.totals.plannedMinutes,
        toolStartedAt: startedAt.toISOString(),
        toolFinishedAt: finishedAt.toISOString(),
        actualToolMinutes: Math.ceil((finishedAt.getTime() - startedAt.getTime()) / 60000),
      },
      steps: stepResults,
      digests: {
        migrations: migrations.map((migration) => ({
          name: migration.name,
          packetDigest: `sha256:${migration.sha256}`,
        })),
        quarantine: inventory[QUARANTINE_PATH],
        sessionRevocationProbe: inventory[PROBE_PATH],
      },
      ownerGatedEvidence: [
        'provider-backup-inventory-before-migration (OWNER-CONSOLE, runbook step 7)',
        'independent-restore-to-isolated-target (OWNER-CONSOLE, runbook step 7)',
        'supabase-security-and-performance-advisors (OWNER-CONSOLE, runbook step 7)',
        'named-user-auth-and-cross-tenant-denial (live Storage audit, owner-approved, runbook step 7)',
        'branch deletion receipt (OWNER-CONSOLE, runbook step 9)',
      ],
      controls: {
        productionMutated: false,
        previewBranchMutated: true,
        activationAllowed: false,
        productionWritesEnabled: false,
        credentialsIncluded: false,
      },
    }
    const serialized = JSON.stringify(evidencePacket, null, 2)
    assertNoCredential(serialized, 'rehearsal_evidence_credential_detected')
    const evidencePacketPath = join(runRoot, `evidence-packet-${finishedAt.toISOString().replaceAll(':', '').replace(/\..+$/, 'Z')}.json`)
    writeFileSync(evidencePacketPath, `${serialized}\n`, 'utf8')
    state.steps.evidence_packet = { ok: true, completedAt: evidencePacket.generatedAt, digest: `sha256:${sha256(serialized)}` }
    saveState()
    const summary = {
      ok: true,
      contract: PREVIEW_REHEARSAL_CONTRACT,
      status: 'rehearsal_evidence_captured',
      evidencePacket: evidencePacketPath,
      stepsExecuted: stepResults.filter((step) => step.outcome === 'ok').length,
      stepsSkipped: stepResults.filter((step) => step.outcome === 'skipped_already_complete').length,
      productionMutated: false,
      nextAction: 'Founder evidence review, then preview-branch deletion (docs/rehearsal-runbook.md steps 8-9).',
    }
    log(JSON.stringify(summary))
    return { ...summary, packet: evidencePacket, runRoot, exitCode: 0 }
  } catch (error) {
    const code = error?.rehearsalCode || 'rehearsal_failed'
    saveState()
    const summary = {
      ok: false,
      contract: PREVIEW_REHEARSAL_CONTRACT,
      status: 'attention',
      error: code,
      failedAfterSteps: stepResults.filter((step) => step.outcome === 'ok').length,
      resumable: true,
      evidenceRoot: runRoot,
      productionMutated: false,
      hint: 'Fix the named failure and re-run; completed steps are skipped through the state file. Do not improvise: docs/rehearsal-runbook.md maps every failure code to its action.',
    }
    log(JSON.stringify(summary))
    return { ...summary, exitCode: 1 }
  }
}

// ---------------------------------------------------------------------------
// Self-test: stubbed database layer, no network, no child processes.
// ---------------------------------------------------------------------------

async function selfTestFixtures(testRoot) {
  const fixtureRef = 'previewbranchzzzz001'
  const releaseCommit = 'a'.repeat(40)
  const administrativeUrl = `postgresql://postgres:stub-password@db.${fixtureRef}.supabase.co:5432/postgres?sslmode=verify-full`
  const runtimeUrl = `postgresql://supermega_trial_runtime:stub@db.${fixtureRef}.supabase.co:5432/postgres?sslmode=verify-full`
  const storageAuditUrl = `postgresql://supermega_storage_audit:stub@db.${fixtureRef}.supabase.co:5432/postgres?sslmode=verify-full`
  const packet = await buildSupabaseRehearsalPacket({
    repositoryRoot: root,
    targetProjectRef: fixtureRef,
    releaseCommit,
    releaseReview: originMainReleaseReview(releaseCommit),
    generatedAt: '2026-08-12T16:00:00.000Z',
  })
  const authorityRoot = join(testRoot, 'authority')
  mkdirSync(authorityRoot, { recursive: true })
  const packetPath = join(authorityRoot, 'packet.json')
  const approvalPath = join(authorityRoot, 'approval.json')
  writeFileSync(packetPath, `${JSON.stringify(packet, null, 2)}\n`, 'utf8')
  const connectionDigests = {
    administrative: `sha256:${sha256(administrativeUrl)}`,
    runtime: `sha256:${sha256(runtimeUrl)}`,
    storageAudit: `sha256:${sha256(storageAuditUrl)}`,
  }
  const approval = {
    contract: PREVIEW_REHEARSAL_APPROVAL_CONTRACT,
    decision: 'approved',
    approvalId: '123e4567-e89b-42d3-a456-426614174000',
    approvedBy: 'owner-self-test',
    approvedAt: '2026-08-12T15:59:00.000Z',
    expiresAt: '2026-08-13T15:59:00.000Z',
    releaseCommit,
    rehearsalPacketDigest: packet.packetDigest,
    targetProjectRef: fixtureRef,
    connectionDigests,
    branch: {
      startsWithProductionData: false,
      maximumLifetimeHours: WINDOW_HOURS,
      providerUsageChargesAcknowledged: true,
      creationApproved: true,
      migrationApplicationApproved: true,
      deleteAfterEvidence: true,
    },
    authorizedActions: REQUIRED_APPROVED_ACTIONS,
    controls: {
      productionTargetApproved: false,
      productionDataApproved: false,
      productionMutationApproved: false,
      managedActivationApproved: false,
    },
  }
  writeFileSync(approvalPath, `${JSON.stringify(approval, null, 2)}\n`, 'utf8')
  const env = {
    [URL_ENV]: administrativeUrl,
    [REF_ENV]: fixtureRef,
    [CA_ENV]: resolve(root, 'package.json'),
    [RUNTIME_URL_ENV]: runtimeUrl,
    [STORAGE_AUDIT_URL_ENV]: storageAuditUrl,
    [PACKET_ENV]: packetPath,
    [APPROVAL_ENV]: approvalPath,
    ...Object.fromEntries(STORAGE_PRIVACY_ENV.map((key) => [key, 'fixture'])),
  }
  const cleanPreflight = JSON.stringify({
    ok: true,
    ready: true,
    status: 'clean_target',
    contract: 'supermega_supabase_rehearsal_preflight_v1',
    checks: Object.fromEntries(REQUIRED_CLEAN_TARGET_CHECKS.map((check) => [check, true])),
    failed_checks: [],
    mutation_statements_executed: 0,
    secret_values_exposed: false,
    production_mutated: false,
    supabase_mutated: false,
  })
  const makeExec = (overrides = {}, calls = []) => ({
    calls,
    exec(call) {
      calls.push({ stepId: call.stepId, argv: call.argv })
      if (overrides[call.stepId]) {
        const override = overrides[call.stepId]
        return typeof override === 'function' ? override(call) : override
      }
      if (call.argv[0] === 'git' && call.argv.includes('rev-parse')) return { status: 0, stdout: releaseCommit, stderr: '' }
      if (call.argv[0] === 'git' && call.argv.includes('status')) return { status: 0, stdout: '', stderr: '' }
      if (call.argv[1] === '--version') return { status: 0, stdout: 'psql (PostgreSQL) 17.10', stderr: '' }
      if (call.argv.includes('--rehearsal-preflight')) return { status: 0, stdout: cleanPreflight, stderr: '' }
      if (call.argv.includes('--require-ready')) return { status: 0, stdout: '{"ok": true, "contract": "supermega_private_trial_database_v10"}', stderr: '' }
      if (call.argv.includes('--preflight')) return { status: 0, stdout: '{"ok": true, "mode": "offline_configuration_preflight"}', stderr: '' }
      return { status: 0, stdout: 'stubbed-ok', stderr: '' }
    },
  })
  return { env, makeExec, approvalPath, packetPath, releaseCommit }
}

export async function runSelfTest() {
  const silent = () => {}
  const testRoot = resolve(root, '.tmp', 'preview-branch-rehearsal-self-test', `${process.pid}-${Date.now()}`)
  const { env, makeExec, approvalPath } = await selfTestFixtures(testRoot)
  const fixedNow = () => new Date('2026-08-12T16:00:00.000Z')
  const run = (options) => runRehearsal({ log: silent, now: fixedNow, ...options })
  let cases = 0
  const expectFailure = async (code, options) => {
    cases += 1
    const result = await run(options)
    if (result.ok !== false || result.error !== code || result.exitCode !== 1) {
      throw new Error(`self_test_expected_${code}_got_${result.error ?? result.status}`)
    }
    return result
  }

  // 1. Absent target environment performs zero actions.
  cases += 1
  {
    const stub = makeExec()
    const result = await run({ env: {}, exec: stub.exec })
    if (result.status !== 'rehearsal_target_not_configured' || result.exitCode !== 0 || stub.calls.length !== 0) {
      throw new Error('self_test_not_configured_failed')
    }
  }

  // 2. Dry-run prints the full plan inside the 24-hour budget with no calls.
  cases += 1
  {
    const stub = makeExec()
    const result = await run({ argv: ['--dry-run'], env: {}, exec: stub.exec })
    if (result.exitCode !== 0 || stub.calls.length !== 0) throw new Error('self_test_dry_run_failed')
    const plan = result.plan
    if (plan.steps.length !== 24 || plan.totals.bufferMinutes <= 0 || plan.totals.plannedMinutes >= plan.totals.windowMinutes) {
      throw new Error('self_test_dry_run_budget_failed')
    }
    if (plan.ownerConsoleSegments.length !== OWNER_CONSOLE_SEGMENTS.length) throw new Error('self_test_dry_run_owner_segments_failed')
  }

  // 3. Happy path executes every step in order and captures a clean packet.
  cases += 1
  {
    const stub = makeExec()
    const result = await run({
      env, exec: stub.exec, evidenceRoot: join(testRoot, 'happy'),
    })
    if (result.ok !== true || result.status !== 'rehearsal_evidence_captured' || result.exitCode !== 0) {
      throw new Error(`self_test_happy_path_failed_${result.error ?? ''}`)
    }
    const packetText = readFileSync(result.evidencePacket, 'utf8')
    assertNoCredential(packetText, 'self_test_packet_leaked_credential')
    if (packetText.includes('stub-password')) throw new Error('self_test_packet_leaked_password')
    const psqlFiles = stub.calls
      .filter((call) => call.argv.includes('--file'))
      .map((call) => call.argv[call.argv.indexOf('--file') + 1])
    const expectedOrder = [
      ...EXPECTED_MIGRATIONS.map((name) => resolve(root, MIGRATION_DIRECTORY, name)),
      resolve(root, QUARANTINE_PATH),
      resolve(root, PROBE_PATH),
    ]
    if (JSON.stringify(psqlFiles) !== JSON.stringify(expectedOrder)) throw new Error('self_test_step_order_failed')

    // 4. Resume skips every completed step: no psql or validator re-runs.
    cases += 1
    const resumeStub = makeExec()
    const resumed = await run({
      env, exec: resumeStub.exec, evidenceRoot: join(testRoot, 'happy'),
    })
    if (resumed.ok !== true || resumed.stepsSkipped < 23) throw new Error('self_test_resume_failed')
    if (resumeStub.calls.some((call) => call.argv.includes('--file'))) throw new Error('self_test_resume_reapplied_migration')
  }

  // 5. A non-empty schema target fails closed before the first migration.
  {
    const nonCleanPreflight = {
      status: 1,
      stdout: JSON.stringify({
        ok: false, ready: false, status: 'attention',
        contract: 'supermega_supabase_rehearsal_preflight_v1',
        checks: { private_schema_absent: false, backend_role_absent: false },
        failed_checks: ['backend_role_absent', 'private_schema_absent'],
        production_mutated: false,
        supabase_mutated: false,
      }),
      stderr: '',
    }
    const stub = makeExec({ url_preflight: nonCleanPreflight })
    const result = await expectFailure('rehearsal_clean_target_required', {
      env, exec: stub.exec, evidenceRoot: join(testRoot, 'non-clean-target'),
    })
    if (stub.calls.some((call) => call.argv.includes('--file'))) throw new Error('self_test_non_clean_target_applied_migration')
    if (result.productionMutated !== false) throw new Error('self_test_non_clean_target_controls_failed')
  }

  // 6. Tampered migration bytes fail closed before psql runs.
  {
    const stub = makeExec()
    const readFileBytes = (path) => {
      const bytes = readFileSync(path)
      if (String(path).includes('_v9_')) return Buffer.concat([bytes, Buffer.from('-- tampered\n')])
      return bytes
    }
    await expectFailure('rehearsal_packet_migration_digest_mismatch', {
      env, exec: stub.exec, readFileBytes, evidenceRoot: join(testRoot, 'tampered'),
    })
    if (stub.calls.some((call) => call.argv.includes('--file'))) throw new Error('self_test_tampered_digest_applied_migration')
  }

  // 7. A mid-run failure stops the sequence and resumes after the fix.
  {
    let v9Attempts = 0
    const failingV9 = () => {
      v9Attempts += 1
      return v9Attempts === 1
        ? { status: 3, stdout: '', stderr: 'psql:...: ERROR: private trial backend v9 requires schema version 8' }
        : { status: 0, stdout: 'stubbed-ok', stderr: '' }
    }
    const stub = makeExec({ apply_migration_11: failingV9 })
    await expectFailure('step_failed_apply_migration_11', {
      env, exec: stub.exec, evidenceRoot: join(testRoot, 'midrun'),
    })
    if (stub.calls.some((call) => call.stepId === 'apply_migration_12' || call.stepId === 'apply_quarantine')) {
      throw new Error('self_test_failure_did_not_stop_sequence')
    }
    cases += 1
    const resumeStub = makeExec({ apply_migration_11: failingV9 })
    const resumed = await run({ env, exec: resumeStub.exec, evidenceRoot: join(testRoot, 'midrun') })
    if (resumed.ok !== true) throw new Error('self_test_midrun_resume_failed')
    if (resumeStub.calls.some((call) => call.stepId === 'apply_migration_10' && call.argv.includes('--file'))) {
      throw new Error('self_test_midrun_resume_reapplied_prior_migration')
    }
  }

  // 8. Credential material in captured tool output is redacted, never stored.
  {
    cases += 1
    const leakyValidator = {
      status: 0,
      stdout: `{"ok": true, "contract": "supermega_private_trial_database_v10", "leak": "postgresql://user:secret@db.example.com/postgres"}`,
      stderr: '',
    }
    const stub = makeExec({ hosted_validator: leakyValidator })
    const result = await run({ env, exec: stub.exec, evidenceRoot: join(testRoot, 'leak') })
    if (result.ok !== false || result.error !== 'rehearsal_evidence_credential_detected') {
      throw new Error('self_test_leak_guard_failed')
    }
  }

  // 9. A valid but differently credentialed URL is unreviewed and rejected.
  {
    const stub = makeExec()
    await expectFailure('rehearsal_approval_connections_unreviewed', {
      env: {
        ...env,
        [RUNTIME_URL_ENV]: env[RUNTIME_URL_ENV].replace(':stub@', ':different@'),
      },
      exec: stub.exec,
      evidenceRoot: join(testRoot, 'unreviewed-url'),
    })
    if (stub.calls.some((call) => call.argv.includes('--file'))) throw new Error('self_test_unreviewed_url_reached_psql')
  }

  // 10. Privileged runtime credentials are rejected before any tool call.
  {
    const stub = makeExec()
    await expectFailure('runtime_privileged_credentials_rejected', {
      env: {
        ...env,
        [RUNTIME_URL_ENV]: env[URL_ENV],
      },
      exec: stub.exec,
      evidenceRoot: join(testRoot, 'privileged-runtime'),
    })
    if (stub.calls.length !== 0) throw new Error('self_test_privileged_runtime_reached_execution')
  }

  // 11. An approval that permits production data is invalid even for preview.
  {
    const approval = JSON.parse(readFileSync(approvalPath, 'utf8'))
    approval.branch.startsWithProductionData = true
    const productionDataApprovalPath = join(testRoot, 'authority', 'approval-production-data.json')
    writeFileSync(productionDataApprovalPath, `${JSON.stringify(approval, null, 2)}\n`, 'utf8')
    const stub = makeExec()
    await expectFailure('rehearsal_approval_branch_boundary_invalid', {
      env: { ...env, [APPROVAL_ENV]: productionDataApprovalPath },
      exec: stub.exec,
      evidenceRoot: join(testRoot, 'production-data-approval'),
    })
    if (stub.calls.some((call) => call.argv.includes('--file'))) throw new Error('self_test_production_data_approval_reached_psql')
  }

  // 12. An expired approval cannot resume or start a hosted rehearsal.
  {
    const approval = JSON.parse(readFileSync(approvalPath, 'utf8'))
    approval.expiresAt = '2026-08-12T15:59:30.000Z'
    const expiredApprovalPath = join(testRoot, 'authority', 'approval-expired.json')
    writeFileSync(expiredApprovalPath, `${JSON.stringify(approval, null, 2)}\n`, 'utf8')
    const stub = makeExec()
    await expectFailure('rehearsal_approval_expired_or_window_invalid', {
      env: { ...env, [APPROVAL_ENV]: expiredApprovalPath },
      exec: stub.exec,
      evidenceRoot: join(testRoot, 'expired-approval'),
    })
    if (stub.calls.some((call) => call.argv.includes('--file'))) throw new Error('self_test_expired_approval_reached_psql')
  }

  // 13. Production ref as the target fails closed offline.
  {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
    const productionRef = manifest.supermega.productionSupabaseProjectRef
    const stub = makeExec()
    await expectFailure('rehearsal_target_is_production', {
      env: {
        ...env,
        [REF_ENV]: productionRef,
        [URL_ENV]: `postgresql://postgres:stub@db.${productionRef}.supabase.co:5432/postgres?sslmode=verify-full`,
      },
      exec: stub.exec,
      evidenceRoot: join(testRoot, 'production-ref'),
    })
    if (stub.calls.length !== 0) throw new Error('self_test_production_ref_reached_execution')
  }

  // 14. URL binding rejects the transaction pooler and parameter smuggling.
  cases += 2
  for (const [badUrl, code] of [
    [`postgresql://postgres.previewbranchzzzz001:x@aws-0-x.pooler.supabase.com:6543/postgres?sslmode=verify-full`, 'rehearsal_transaction_pooler_not_for_migrations'],
    [`postgresql://postgres:x@db.previewbranchzzzz001.supabase.co:5432/postgres?sslmode=verify-full&options=x`, 'rehearsal_connection_parameter_not_allowed'],
  ]) {
    try {
      parsePreviewDatabaseUrl(badUrl, { expectedProjectRef: 'previewbranchzzzz001', productionProjectRef: 'z'.repeat(20) })
      throw new Error(`self_test_url_binding_missed_${code}`)
    } catch (error) {
      if (error?.rehearsalCode !== code) throw error
    }
  }

  rmSync(testRoot, { recursive: true, force: true })
  return {
    ok: true,
    contract: `${PREVIEW_REHEARSAL_CONTRACT}.self-test`,
    cases,
    networkRequestsPerformed: 0,
    childProcessesSpawned: 0,
    productionMutated: false,
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2)
  if (argv.includes('--self-test')) {
    runSelfTest()
      .then((report) => {
        console.log(JSON.stringify(report))
        process.exitCode = report.ok ? 0 : 1
      })
      .catch((error) => {
        console.error(JSON.stringify({ ok: false, error: String(error?.message || 'self_test_failed').slice(0, 240) }))
        process.exitCode = 1
      })
  } else {
    runRehearsal({ argv })
      .then((result) => {
        process.exitCode = result.exitCode
      })
      .catch((error) => {
        console.error(JSON.stringify({
          ok: false,
          contract: PREVIEW_REHEARSAL_CONTRACT,
          error: String(error?.rehearsalCode || error?.message || 'rehearsal_failed').slice(0, 240),
          productionMutated: false,
        }))
        process.exitCode = 1
      })
  }
}
