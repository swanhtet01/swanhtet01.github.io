import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// Orchestrates the entire 24-hour Supabase preview-branch rehearsal window so
// it cannot burn on improvisation. Every hosted action shells out to a
// committed tool along the repo's documented paths:
//   - URL and target binding: tools/validate_supermega_database_url.py
//     --rehearsal-preflight (read-only, verify-full, non-production binding).
//   - Migration application: psql --set ON_ERROR_STOP=1 --file <migration>,
//     the exact invocation used by tools/rehearse_supermega_postgres17.py.
//     No SQL is embedded here; only committed files are applied.
//   - Quarantine: supabase/rehearsal/20260804_public_browser_quarantine.sql
//     (self-guarding, self-verifying; fail-closes on inventory drift).
//   - Hosted validator: validate_supermega_database_url.py --ensure-schema
//     --require-ready (read-only v10 contract).
//   - Storage privacy: tools/verify_private_storage_privacy.py --preflight
//     (offline configuration proof; the live six-request audit stays
//     founder-gated in docs/rehearsal-runbook.md).
//   - Session revocation: supabase/rehearsal/
//     20260807_preview_session_revocation_probe.sql (rollback-only probe).
//
// The tool performs zero action when SUPERMEGA_REHEARSAL_DATABASE_URL is
// absent, is resumable through a state file, fail-closes on the first
// failing step, and never accepts or prints credential values.

export const PREVIEW_REHEARSAL_CONTRACT = 'supermega.preview-branch-rehearsal.v1'
const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const WINDOW_HOURS = 24
const projectRefPattern = /^[a-z0-9]{20}$/
const AUDIT_PATH = 'hq/readiness/supabase-security-advisor-audit.json'
const QUARANTINE_PATH = 'supabase/rehearsal/20260804_public_browser_quarantine.sql'
const PROBE_PATH = 'supabase/rehearsal/20260807_preview_session_revocation_probe.sql'
const MIGRATION_DIRECTORY = 'supabase/migrations'
const PENDING_MIGRATIONS = [
  { version: 8, name: '20260802161500_private_trial_backend_v8_rls_initplan.sql' },
  { version: 9, name: '20260803063822_private_trial_backend_v9_metadata_rls.sql' },
  { version: 10, name: '20260804102000_private_trial_backend_v10_supabase_session_revocation.sql' },
]
const EXPECTED_MIGRATION_COUNT = 11
const URL_ENV = 'SUPERMEGA_REHEARSAL_DATABASE_URL'
const REF_ENV = 'SUPERMEGA_REHEARSAL_PROJECT_REF'
const CA_ENV = 'SUPERMEGA_SUPABASE_CA_FILE'
const RUNTIME_URL_ENV = 'SUPERMEGA_REHEARSAL_RUNTIME_DATABASE_URL'
const STORAGE_AUDIT_URL_ENV = 'SUPERMEGA_REHEARSAL_STORAGE_AUDIT_DATABASE_URL'
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
const FOUNDER_CONSOLE_SEGMENTS = [
  { id: 'founder_branch_creation', estimateMinutes: 45, description: 'Create one preview branch without production data and capture ref, connection string, CA file (docs/rehearsal-runbook.md step 2).' },
  { id: 'founder_runtime_login_and_urls', estimateMinutes: 30, description: 'Create the branch runtime login and read-only storage-audit login, paste the three connection URLs as environment values (runbook step 4).' },
  { id: 'founder_backup_restore_evidence', estimateMinutes: 90, description: 'Capture provider backup inventory and independent restore evidence on the isolated target (runbook step 7).' },
  { id: 'founder_evidence_review', estimateMinutes: 120, description: 'Review the evidence packet against the required-evidence checklist (runbook step 8).' },
  { id: 'founder_branch_deletion', estimateMinutes: 15, description: 'Delete the preview branch after evidence capture and record the deletion receipt (runbook step 9).' },
]

function fail(code) {
  const error = new Error(code)
  error.rehearsalCode = code
  throw error
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

// The committed audit digests for the pending migrations have mixed
// end-of-line provenance (v8 and v9 were digested from CRLF working-tree
// bytes, v10 from LF bytes), so a digest matches when any byte-stable
// end-of-line form of the committed file matches. The applied bytes are the
// checked-out file either way; psql treats both forms identically.
function digestCandidates(buffer) {
  const text = buffer.toString('utf8')
  const lf = text.replaceAll('\r\n', '\n')
  const crlf = lf.replaceAll('\n', '\r\n')
  return [...new Set([
    `sha256:${sha256(buffer)}`,
    `sha256:${sha256(Buffer.from(lf, 'utf8'))}`,
    `sha256:${sha256(Buffer.from(crlf, 'utf8'))}`,
  ])]
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

export function buildPlan() {
  const steps = [
    { id: 'release_pin', kind: 'local', estimateMinutes: 1, covers: [], command: 'git status --porcelain && git rev-parse HEAD == origin/main' },
    { id: 'local_quarantine_guard', kind: 'local', estimateMinutes: 3, covers: ['public-browser-table-and-sequence-denial (local proof)'], command: 'node tools/verify_public_browser_quarantine.mjs' },
    { id: 'migration_inventory', kind: 'local', estimateMinutes: 1, covers: [], command: `verify ${EXPECTED_MIGRATION_COUNT} committed migrations and audit-pinned v8-v10 digests` },
    { id: 'toolchain', kind: 'local', estimateMinutes: 1, covers: [], command: 'psql --version (major 17 required)' },
    { id: 'url_preflight', kind: 'network-read', estimateMinutes: 3, covers: ['hostname-verified-postgresql-17-preflight'], command: `node tools/run_python_tool.mjs tools/validate_supermega_database_url.py --env-key ${URL_ENV} --rehearsal-preflight --expected-project-ref-env-key ${REF_ENV} --production-project-ref-env-key ${PRODUCTION_REF_ENV} --ssl-root-cert-env-key ${CA_ENV}` },
    { id: 'apply_v8', kind: 'branch-mutation', estimateMinutes: 10, covers: ['ordered-migration-application-through-v10'], command: `psql --set ON_ERROR_STOP=1 --file ${MIGRATION_DIRECTORY}/${PENDING_MIGRATIONS[0].name}` },
    { id: 'apply_v9', kind: 'branch-mutation', estimateMinutes: 10, covers: ['ordered-migration-application-through-v10'], command: `psql --set ON_ERROR_STOP=1 --file ${MIGRATION_DIRECTORY}/${PENDING_MIGRATIONS[1].name}` },
    { id: 'apply_v10', kind: 'branch-mutation', estimateMinutes: 10, covers: ['ordered-migration-application-through-v10'], command: `psql --set ON_ERROR_STOP=1 --file ${MIGRATION_DIRECTORY}/${PENDING_MIGRATIONS[2].name}` },
    { id: 'apply_quarantine', kind: 'branch-mutation', estimateMinutes: 10, covers: ['public-browser-table-and-sequence-denial', 'public-default-privilege-denial-for-postgres-and-supabase-admin', 'service-role-contact-path-retained'], command: `psql --set ON_ERROR_STOP=1 --file ${QUARANTINE_PATH}` },
    { id: 'hosted_validator', kind: 'network-read', estimateMinutes: 10, covers: ['read-only-v10-runtime-validator'], command: `node tools/run_python_tool.mjs tools/validate_supermega_database_url.py --env-key ${RUNTIME_URL_ENV} --storage-audit-env-key ${STORAGE_AUDIT_URL_ENV} --ensure-schema --require-ready` },
    { id: 'storage_privacy_preflight', kind: 'local', estimateMinutes: 2, covers: ['private-storage-isolation-proof (offline configuration preflight; live audit stays founder-gated)'], command: 'node tools/run_python_tool.mjs tools/verify_private_storage_privacy.py --preflight' },
    { id: 'session_revocation_probe', kind: 'network-read', estimateMinutes: 5, covers: ['active-session-acceptance-and-revoked-session-denial'], command: `psql --set ON_ERROR_STOP=1 --file ${PROBE_PATH} (single transaction, ends in ROLLBACK)` },
    { id: 'evidence_packet', kind: 'local', estimateMinutes: 2, covers: [], command: 'assemble sanitized evidence packet under .tmp/' },
  ]
  const toolMinutes = steps.reduce((total, step) => total + step.estimateMinutes, 0)
  const founderMinutes = FOUNDER_CONSOLE_SEGMENTS.reduce((total, segment) => total + segment.estimateMinutes, 0)
  const plannedMinutes = toolMinutes + founderMinutes
  return {
    contract: PREVIEW_REHEARSAL_CONTRACT,
    windowHours: WINDOW_HOURS,
    steps,
    founderConsoleSegments: FOUNDER_CONSOLE_SEGMENTS,
    totals: {
      toolMinutes,
      founderConsoleMinutes: founderMinutes,
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
      hint: `Set ${URL_ENV} to the founder-pasted preview-branch connection string (docs/rehearsal-runbook.md step 4) or use --dry-run to inspect the plan.`,
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

  const audit = JSON.parse(readFile(resolve(rootDir, AUDIT_PATH)))
  if (audit?.projectRef && expectedProjectRef === String(audit.projectRef)) fail('rehearsal_target_is_production')
  const pendingByVersion = new Map((audit?.managedBackend?.pendingMigrations ?? []).map((entry) => [entry.version, entry]))

  const connection = parsePreviewDatabaseUrl(databaseUrl, { expectedProjectRef, productionProjectRef })
  const secrets = [databaseUrl, connection.password, String(env[RUNTIME_URL_ENV] || ''), String(env[STORAGE_AUDIT_URL_ENV] || '')]
    .map((value) => value.trim())
    .filter(Boolean)

  const startedAt = now()
  const plan = buildPlan()
  const inventory = {}
  for (const migration of PENDING_MIGRATIONS) {
    const bytes = readFileBytes(resolve(rootDir, MIGRATION_DIRECTORY, migration.name))
    inventory[migration.name] = digestCandidates(bytes)
  }
  inventory[QUARANTINE_PATH] = digestCandidates(readFileBytes(resolve(rootDir, QUARANTINE_PATH)))
  inventory[PROBE_PATH] = digestCandidates(readFileBytes(resolve(rootDir, PROBE_PATH)))

  const releaseHead = exec({ stepId: 'release_pin', argv: ['git', '-C', rootDir, 'rev-parse', 'HEAD'], envOverrides: {}, cwd: rootDir })
  if (releaseHead.status !== 0) fail('rehearsal_release_commit_unavailable')
  const releaseCommit = releaseHead.stdout.trim()

  const fingerprint = `sha256:${sha256(JSON.stringify({
    contract: PREVIEW_REHEARSAL_CONTRACT,
    releaseCommit,
    targetProjectRef: expectedProjectRef,
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

    runCommandStep('local_quarantine_guard', ['node', 'tools/verify_public_browser_quarantine.mjs'], {})

    // migration_inventory: digest-bind the exact files that will be applied to
    // the committed security-advisor audit before any hosted mutation.
    if (!state.steps.migration_inventory?.ok) {
      for (const migration of PENDING_MIGRATIONS) {
        const pinned = pendingByVersion.get(migration.version)
        if (!pinned || pinned.path !== `${MIGRATION_DIRECTORY}/${migration.name}`) fail('rehearsal_audit_migration_pin_missing')
        if (!inventory[migration.name].includes(pinned.digest)) fail(`migration_digest_mismatch_v${migration.version}`)
      }
      record('migration_inventory', 'ok', {
        migrationCount: EXPECTED_MIGRATION_COUNT,
        pendingMigrations: PENDING_MIGRATIONS.map((migration) => ({
          name: migration.name,
          auditDigest: pendingByVersion.get(migration.version).digest,
        })),
        quarantineDigests: inventory[QUARANTINE_PATH],
        probeDigests: inventory[PROBE_PATH],
      })
    } else {
      stepResults.push({ id: 'migration_inventory', outcome: 'skipped_already_complete' })
    }

    const toolchain = resolvePsql(env, exec, rootDir)
    if (!state.steps.toolchain?.ok) record('toolchain', 'ok', { psqlVersion: sanitizeText(toolchain.versionOutput, secrets) })
    else stepResults.push({ id: 'toolchain', outcome: 'skipped_already_complete' })

    // url_preflight: the committed read-only validator binds the pasted URL to
    // the expected non-production ref over verify-full TLS. On a branch that
    // mirrors production at managed schema v7, exactly the two "absent" checks
    // fail; anything else fails the run closed.
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
      const failed = Array.isArray(report.failed_checks) ? [...report.failed_checks].sort() : null
      if (report.ready === true) {
        record('url_preflight', 'failed', { ...detail, reason: 'clean target cannot host the audit-prescribed v8-v10 and quarantine rehearsal' })
        fail('rehearsal_branch_must_mirror_production_schema_v7')
      }
      if (!failed || failed.join(',') !== 'backend_role_absent,private_schema_absent') {
        record('url_preflight', 'failed', detail)
        fail('url_preflight_failed')
      }
      record('url_preflight', 'ok', { ...detail, baseline: 'production-mirror-v7' })
    } else {
      stepResults.push({ id: 'url_preflight', outcome: 'skipped_already_complete' })
    }

    // v8-v10 apply along the committed psql path; each migration re-checks its
    // audit digest immediately before it is handed to psql, and each committed
    // migration self-guards its predecessor schema version.
    const branchEnv = psqlEnv(connection, caFile)
    for (const migration of PENDING_MIGRATIONS) {
      const id = `apply_v${migration.version}`
      if (state.steps[id]?.ok) {
        stepResults.push({ id, outcome: 'skipped_already_complete' })
        continue
      }
      const bytes = readFileBytes(resolve(rootDir, MIGRATION_DIRECTORY, migration.name))
      if (!digestCandidates(bytes).includes(pendingByVersion.get(migration.version).digest)) {
        fail(`migration_digest_mismatch_v${migration.version}`)
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

    // hosted_validator: read-only v10 contract via the committed validator.
    // It requires the branch runtime login and a read-only storage-audit URL
    // that the founder creates in the console (runbook step 4).
    if (!state.steps.hosted_validator?.ok) {
      if (!String(env[RUNTIME_URL_ENV] || '').trim() || !String(env[STORAGE_AUDIT_URL_ENV] || '').trim()) {
        record('hosted_validator', 'failed', {
          reason: 'hosted_validator_environment_missing',
          required: [RUNTIME_URL_ENV, STORAGE_AUDIT_URL_ENV],
          hint: 'Create the branch runtime login and read-only storage-audit login (docs/rehearsal-runbook.md step 4), then resume this run.',
        })
        fail('hosted_validator_environment_missing')
      }
      runCommandStep('hosted_validator', [
        'node', 'tools/run_python_tool.mjs', 'tools/validate_supermega_database_url.py',
        '--env-key', RUNTIME_URL_ENV,
        '--storage-audit-env-key', STORAGE_AUDIT_URL_ENV,
        '--ensure-schema', '--require-ready',
      ], {})
    } else {
      stepResults.push({ id: 'hosted_validator', outcome: 'skipped_already_complete' })
    }

    // storage_privacy_preflight: offline configuration proof. The live
    // six-request hosted audit stays founder-gated (runbook step 7).
    if (!state.steps.storage_privacy_preflight?.ok) {
      const missing = STORAGE_PRIVACY_ENV.filter((key) => !String(env[key] || '').trim())
      if (missing.length) {
        record('storage_privacy_preflight', 'failed', {
          reason: 'storage_privacy_environment_missing',
          missingCount: missing.length,
          required: STORAGE_PRIVACY_ENV,
          hint: 'Configure the storage-privacy environment values for the preview branch bucket (docs/rehearsal-runbook.md step 6), then resume this run.',
        })
        fail('storage_privacy_environment_missing')
      }
      runCommandStep('storage_privacy_preflight', [
        'node', 'tools/run_python_tool.mjs', 'tools/verify_private_storage_privacy.py', '--preflight',
      ], {})
    } else {
      stepResults.push({ id: 'storage_privacy_preflight', outcome: 'skipped_already_complete' })
    }

    runCommandStep('session_revocation_probe', [
      toolchain.psql, '--no-psqlrc', '--no-password',
      '--set', 'ON_ERROR_STOP=1',
      '--file', resolve(rootDir, PROBE_PATH),
    ], branchEnv)

    const finishedAt = now()
    const packet = {
      contract: PREVIEW_REHEARSAL_CONTRACT,
      ok: true,
      generatedAt: finishedAt.toISOString(),
      releaseCommit,
      targetProjectRef: expectedProjectRef,
      baseline: 'production-mirror-v7',
      fingerprint,
      window: {
        windowHours: WINDOW_HOURS,
        plannedMinutes: plan.totals.plannedMinutes,
        toolStartedAt: startedAt.toISOString(),
        toolFinishedAt: finishedAt.toISOString(),
        actualToolMinutes: Math.ceil((finishedAt.getTime() - startedAt.getTime()) / 60000),
      },
      steps: stepResults,
      digests: {
        pendingMigrations: PENDING_MIGRATIONS.map((migration) => ({
          name: migration.name,
          auditDigest: pendingByVersion.get(migration.version)?.digest ?? null,
        })),
        quarantine: inventory[QUARANTINE_PATH],
        sessionRevocationProbe: inventory[PROBE_PATH],
        securityAuditEvidenceDigest: audit?.evidenceDigest ?? null,
      },
      founderGatedEvidence: [
        'provider-backup-inventory-before-migration (FOUNDER-CONSOLE, runbook step 7)',
        'independent-restore-to-isolated-target (FOUNDER-CONSOLE, runbook step 7)',
        'supabase-security-advisor-without-applicable-errors (FOUNDER-CONSOLE advisor re-run on the branch, runbook step 7)',
        'named-user-auth-and-cross-tenant-denial (live storage audit, founder-approved, runbook step 7)',
        'branch deletion receipt (FOUNDER-CONSOLE, runbook step 9)',
      ],
      controls: {
        productionMutated: false,
        previewBranchMutated: true,
        activationAllowed: false,
        productionWritesEnabled: false,
        credentialsIncluded: false,
      },
    }
    const serialized = JSON.stringify(packet, null, 2)
    assertNoCredential(serialized, 'rehearsal_evidence_credential_detected')
    const packetPath = join(runRoot, `evidence-packet-${finishedAt.toISOString().replaceAll(':', '').replace(/\..+$/, 'Z')}.json`)
    writeFileSync(packetPath, `${serialized}\n`, 'utf8')
    state.steps.evidence_packet = { ok: true, completedAt: packet.generatedAt, digest: `sha256:${sha256(serialized)}` }
    saveState()
    const summary = {
      ok: true,
      contract: PREVIEW_REHEARSAL_CONTRACT,
      status: 'rehearsal_evidence_captured',
      evidencePacket: packetPath,
      stepsExecuted: stepResults.filter((step) => step.outcome === 'ok').length,
      stepsSkipped: stepResults.filter((step) => step.outcome === 'skipped_already_complete').length,
      productionMutated: false,
      nextAction: 'Founder evidence review, then preview-branch deletion (docs/rehearsal-runbook.md steps 8-9).',
    }
    log(JSON.stringify(summary))
    return { ...summary, packet, runRoot, exitCode: 0 }
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

function selfTestFixtures() {
  const auditJson = readFileSync(resolve(root, AUDIT_PATH), 'utf8')
  const packageJson = readFileSync(resolve(root, 'package.json'), 'utf8')
  const fixtureRef = 'previewbranchzzzz001'
  const env = {
    [URL_ENV]: `postgresql://postgres:stub-password@db.${fixtureRef}.supabase.co:5432/postgres?sslmode=verify-full`,
    [REF_ENV]: fixtureRef,
    [CA_ENV]: resolve(root, 'package.json'),
    [RUNTIME_URL_ENV]: `postgresql://stub_runtime:stub@db.${fixtureRef}.supabase.co:5432/postgres?sslmode=verify-full`,
    [STORAGE_AUDIT_URL_ENV]: `postgresql://stub_audit:stub@db.${fixtureRef}.supabase.co:5432/postgres?sslmode=verify-full`,
    ...Object.fromEntries(STORAGE_PRIVACY_ENV.map((key) => [key, 'fixture'])),
  }
  const mirrorPreflight = JSON.stringify({
    ok: false,
    ready: false,
    status: 'attention',
    contract: 'supermega_supabase_rehearsal_preflight_v1',
    checks: { private_schema_absent: false, backend_role_absent: false },
    failed_checks: ['backend_role_absent', 'private_schema_absent'],
    mutation_statements_executed: 0,
    secret_values_exposed: false,
    production_mutated: false,
  })
  const makeExec = (overrides = {}, calls = []) => ({
    calls,
    exec(call) {
      calls.push({ stepId: call.stepId, argv: call.argv })
      if (overrides[call.stepId]) {
        const override = overrides[call.stepId]
        return typeof override === 'function' ? override(call) : override
      }
      if (call.argv[0] === 'git' && call.argv.includes('rev-parse')) return { status: 0, stdout: 'a'.repeat(40), stderr: '' }
      if (call.argv[0] === 'git' && call.argv.includes('status')) return { status: 0, stdout: '', stderr: '' }
      if (call.argv[1] === '--version') return { status: 0, stdout: 'psql (PostgreSQL) 17.10', stderr: '' }
      if (call.argv.includes('--rehearsal-preflight')) return { status: 1, stdout: mirrorPreflight, stderr: '' }
      if (call.argv.includes('--require-ready')) return { status: 0, stdout: '{"ok": true, "contract": "supermega_private_trial_database_v10"}', stderr: '' }
      if (call.argv.includes('--preflight')) return { status: 0, stdout: '{"ok": true, "mode": "offline_configuration_preflight"}', stderr: '' }
      return { status: 0, stdout: 'stubbed-ok', stderr: '' }
    },
  })
  return { env, makeExec, auditJson, packageJson }
}

export async function runSelfTest() {
  const { env, makeExec } = selfTestFixtures()
  const silent = () => {}
  const testRoot = resolve(root, '.tmp', 'preview-branch-rehearsal-self-test', `${process.pid}-${Date.now()}`)
  let cases = 0
  const expectFailure = async (code, options) => {
    cases += 1
    const result = await runRehearsal({ log: silent, ...options })
    if (result.ok !== false || result.error !== code || result.exitCode !== 1) {
      throw new Error(`self_test_expected_${code}_got_${result.error ?? result.status}`)
    }
    return result
  }

  // 1. Absent target environment performs zero actions.
  cases += 1
  {
    const stub = makeExec()
    const result = await runRehearsal({ env: {}, exec: stub.exec, log: silent })
    if (result.status !== 'rehearsal_target_not_configured' || result.exitCode !== 0 || stub.calls.length !== 0) {
      throw new Error('self_test_not_configured_failed')
    }
  }

  // 2. Dry-run prints the full plan inside the 24-hour budget with no calls.
  cases += 1
  {
    const stub = makeExec()
    const result = await runRehearsal({ argv: ['--dry-run'], env: {}, exec: stub.exec, log: silent })
    if (result.exitCode !== 0 || stub.calls.length !== 0) throw new Error('self_test_dry_run_failed')
    const plan = result.plan
    if (plan.steps.length !== 13 || plan.totals.bufferMinutes <= 0 || plan.totals.plannedMinutes >= plan.totals.windowMinutes) {
      throw new Error('self_test_dry_run_budget_failed')
    }
    if (plan.founderConsoleSegments.length !== FOUNDER_CONSOLE_SEGMENTS.length) throw new Error('self_test_dry_run_founder_segments_failed')
  }

  // 3. Happy path executes every step in order and captures a clean packet.
  cases += 1
  {
    const stub = makeExec()
    const result = await runRehearsal({
      env, exec: stub.exec, log: silent, evidenceRoot: join(testRoot, 'happy'),
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
      ...PENDING_MIGRATIONS.map((migration) => resolve(root, MIGRATION_DIRECTORY, migration.name)),
      resolve(root, QUARANTINE_PATH),
      resolve(root, PROBE_PATH),
    ]
    if (JSON.stringify(psqlFiles) !== JSON.stringify(expectedOrder)) throw new Error('self_test_step_order_failed')

    // 4. Resume skips every completed step: no psql or validator re-runs.
    cases += 1
    const resumeStub = makeExec()
    const resumed = await runRehearsal({
      env, exec: resumeStub.exec, log: silent, evidenceRoot: join(testRoot, 'happy'),
    })
    if (resumed.ok !== true || resumed.stepsSkipped < 11) throw new Error('self_test_resume_failed')
    if (resumeStub.calls.some((call) => call.argv.includes('--file'))) throw new Error('self_test_resume_reapplied_migration')
  }

  // 5. A clean branch (committed preflight reports ready) fails closed:
  // the audit-prescribed v8-v10 chain and quarantine need the v7 mirror.
  {
    const cleanPreflight = {
      status: 0,
      stdout: JSON.stringify({
        ok: true, ready: true, status: 'clean_target',
        contract: 'supermega_supabase_rehearsal_preflight_v1',
        checks: {}, failed_checks: [],
      }),
      stderr: '',
    }
    const stub = makeExec({ url_preflight: cleanPreflight })
    const result = await expectFailure('rehearsal_branch_must_mirror_production_schema_v7', {
      env, exec: stub.exec, evidenceRoot: join(testRoot, 'clean-target'),
    })
    if (stub.calls.some((call) => call.argv.includes('--file'))) throw new Error('self_test_clean_target_applied_migration')
    if (result.productionMutated !== false) throw new Error('self_test_clean_target_controls_failed')
  }

  // 6. Tampered migration bytes fail closed before psql runs.
  {
    const stub = makeExec()
    const readFileBytes = (path) => {
      const bytes = readFileSync(path)
      if (String(path).includes('_v9_')) return Buffer.concat([bytes, Buffer.from('-- tampered\n')])
      return bytes
    }
    await expectFailure('migration_digest_mismatch_v9', {
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
    const stub = makeExec({ apply_v9: failingV9 })
    await expectFailure('step_failed_apply_v9', {
      env, exec: stub.exec, evidenceRoot: join(testRoot, 'midrun'),
    })
    if (stub.calls.some((call) => call.stepId === 'apply_v10' || call.stepId === 'apply_quarantine')) {
      throw new Error('self_test_failure_did_not_stop_sequence')
    }
    cases += 1
    const resumeStub = makeExec({ apply_v9: failingV9 })
    const resumed = await runRehearsal({ env, exec: resumeStub.exec, log: silent, evidenceRoot: join(testRoot, 'midrun') })
    if (resumed.ok !== true) throw new Error('self_test_midrun_resume_failed')
    if (resumeStub.calls.some((call) => call.stepId === 'apply_v8' && call.argv.includes('--file'))) {
      throw new Error('self_test_midrun_resume_reapplied_v8')
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
    const result = await runRehearsal({ env, exec: stub.exec, log: silent, evidenceRoot: join(testRoot, 'leak') })
    if (result.ok !== false || result.error !== 'rehearsal_evidence_credential_detected') {
      throw new Error('self_test_leak_guard_failed')
    }
  }

  // 9. Production ref as the target fails closed offline.
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

  // 10. URL binding rejects the transaction pooler and parameter smuggling.
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
