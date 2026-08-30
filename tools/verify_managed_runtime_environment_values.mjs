import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const packageState = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const projectRef = String(packageState?.supermega?.productionSupabaseProjectRef || '').trim()
const runtimeRole = 'supermega_trial_login'
const managedSchemaVersion = '11'

const evaluate = (environment, expectedMode) => {
  const failures = []
  const addFailure = (value) => {
    if (!failures.includes(value)) failures.push(value)
  }
  const databaseUrl = String(environment.SUPERMEGA_DATABASE_URL || '').trim()
  const supabaseUrl = String(environment.VITE_SUPABASE_URL || '').trim()
  const publishableKey = String(environment.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()
  const schemaVersion = String(environment.SUPERMEGA_TRIAL_SCHEMA_VERSION || '').trim()
  const boundProjectRef = String(environment.SUPERMEGA_SUPABASE_PROJECT_REF || '').trim()
  const configuredReleaseCommit = String(environment.SUPERMEGA_RELEASE_COMMIT || '').trim()
  const releaseCommit = String(
    configuredReleaseCommit
      || environment.VERCEL_GIT_COMMIT_SHA
      || environment.GITHUB_SHA
      || '',
  ).trim().toLowerCase()
  const selfServeWindow = String(environment.SUPERMEGA_SELF_SERVE_ACTIVATION_WINDOW || '').trim()
  const writesEnabled = String(environment.SUPERMEGA_TRIAL_WRITES_ENABLED || '').trim().toLowerCase()

  let databaseTargetReady = false
  try {
    const parsed = new URL(databaseUrl)
    const sslmode = String(parsed.searchParams.get('sslmode') || '').toLowerCase()
    const queryKeys = [...parsed.searchParams.keys()]
    const username = decodeURIComponent(parsed.username)
    const pooled = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(parsed.hostname)
      && username === `${runtimeRole}.${projectRef}`
      && parsed.port === '6543'
    databaseTargetReady = ['postgres:', 'postgresql:'].includes(parsed.protocol)
      && Boolean(parsed.password)
      && ['require', 'verify-ca', 'verify-full'].includes(sslmode)
      && queryKeys.length === 1
      && queryKeys[0] === 'sslmode'
      && parsed.pathname === '/postgres'
      && !parsed.hash
      && pooled
  } catch {
    databaseTargetReady = false
  }
  if (!databaseTargetReady) addFailure('managed_database_target_or_tls_invalid')
  if (supabaseUrl !== `https://${projectRef}.supabase.co`) addFailure('managed_browser_auth_url_invalid')
  if (!/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(publishableKey)) {
    addFailure('managed_browser_publishable_key_invalid')
  }
  if (schemaVersion !== managedSchemaVersion) addFailure('managed_schema_version_invalid')
  if (boundProjectRef !== projectRef) addFailure('managed_project_binding_invalid')
  if (!/^[0-9a-f]{40}$/.test(releaseCommit)) addFailure('managed_release_commit_invalid')
  if (selfServeWindow && selfServeWindow !== 'open') addFailure('managed_self_serve_window_invalid')
  if (['managed_trial', 'self_serve'].includes(expectedMode) && writesEnabled !== 'true') {
    addFailure('managed_writes_flag_not_enabled')
  }
  if (expectedMode === 'self_serve' && selfServeWindow !== 'open') {
    addFailure('managed_self_serve_window_not_open')
  }
  if (expectedMode === 'staged' && !['', 'false'].includes(writesEnabled)) {
    addFailure('staged_environment_must_not_enable_writes')
  }
  if (expectedMode === 'isolated_demo') {
    if ([databaseUrl, supabaseUrl, publishableKey, schemaVersion, boundProjectRef, configuredReleaseCommit, selfServeWindow, writesEnabled].some(Boolean)) {
      addFailure('isolated_environment_contains_managed_runtime_values')
    } else {
      failures.splice(0, failures.length)
    }
  }
  return {
    ok: failures.length === 0,
    contract: 'supermega_managed_runtime_environment_values.v1',
    expectedMode,
    effectiveMode: ['managed_trial', 'self_serve'].includes(expectedMode) && failures.length === 0
      ? 'managed_trial'
      : 'isolated_demo',
    projectRefMatched: databaseTargetReady && supabaseUrl === `https://${projectRef}.supabase.co`,
    tlsRequired: databaseTargetReady,
    browserAuthReady: supabaseUrl === `https://${projectRef}.supabase.co`
      && /^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(publishableKey),
    schemaVersionMatched: schemaVersion === managedSchemaVersion,
    releaseCommitBound: /^[0-9a-f]{40}$/.test(releaseCommit),
    selfServeEnabled: selfServeWindow === 'open',
    writesEnabled: writesEnabled === 'true',
    secretValuesExposed: false,
    failures,
  }
}

if (process.argv.includes('--self-test')) {
  const valid = {
    SUPERMEGA_DATABASE_URL: `postgresql://${runtimeRole}.${projectRef}:hidden@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require`,
    VITE_SUPABASE_URL: `https://${projectRef}.supabase.co`,
    VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_1234567890abcdef',
    SUPERMEGA_TRIAL_SCHEMA_VERSION: managedSchemaVersion,
    SUPERMEGA_SUPABASE_PROJECT_REF: projectRef,
    SUPERMEGA_RELEASE_COMMIT: 'a'.repeat(40),
  }
  assert.equal(evaluate(valid, 'staged').ok, true)
  assert.equal(evaluate({ ...valid, SUPERMEGA_TRIAL_WRITES_ENABLED: 'true' }, 'managed_trial').ok, true)
  assert.equal(evaluate({ ...valid, SUPERMEGA_TRIAL_WRITES_ENABLED: 'true', SUPERMEGA_SELF_SERVE_ACTIVATION_WINDOW: 'open' }, 'self_serve').ok, true)
  assert.equal(evaluate(valid, 'managed_trial').failures.includes('managed_writes_flag_not_enabled'), true)
  assert.equal(evaluate({ ...valid, SUPERMEGA_TRIAL_WRITES_ENABLED: 'true' }, 'self_serve').failures.includes('managed_self_serve_window_not_open'), true)
  assert.equal(evaluate({ ...valid, SUPERMEGA_TRIAL_SCHEMA_VERSION: '10' }, 'staged').failures.includes('managed_schema_version_invalid'), true)
  assert.equal(evaluate({ ...valid, SUPERMEGA_SUPABASE_PROJECT_REF: 'otherprojectref00000' }, 'staged').failures.includes('managed_project_binding_invalid'), true)
  assert.equal(evaluate({ ...valid, SUPERMEGA_RELEASE_COMMIT: 'not-a-commit' }, 'staged').failures.includes('managed_release_commit_invalid'), true)
  assert.equal(evaluate({ ...valid, SUPERMEGA_RELEASE_COMMIT: '', VERCEL_GIT_COMMIT_SHA: 'b'.repeat(40) }, 'staged').ok, true)
  assert.equal(evaluate({ ...valid, SUPERMEGA_RELEASE_COMMIT: '', GITHUB_SHA: 'c'.repeat(40) }, 'staged').ok, true)
  assert.equal(evaluate({ ...valid, SUPERMEGA_SELF_SERVE_ACTIVATION_WINDOW: 'enabled' }, 'staged').failures.includes('managed_self_serve_window_invalid'), true)
  assert.equal(evaluate({ ...valid, SUPERMEGA_DATABASE_URL: valid.SUPERMEGA_DATABASE_URL.replace('sslmode=require', 'sslmode=disable') }, 'staged').ok, false)
  assert.equal(evaluate({ ...valid, SUPERMEGA_DATABASE_URL: valid.SUPERMEGA_DATABASE_URL.replace(':6543/', ':5432/') }, 'staged').ok, false)
  assert.equal(evaluate({ ...valid, SUPERMEGA_DATABASE_URL: `${valid.SUPERMEGA_DATABASE_URL}&options=unsafe` }, 'staged').ok, false)
  assert.equal(evaluate({ ...valid, SUPERMEGA_DATABASE_URL: valid.SUPERMEGA_DATABASE_URL.replace(projectRef, 'otherprojectref00000') }, 'staged').ok, false)
  assert.equal(evaluate({ ...valid, SUPERMEGA_DATABASE_URL: valid.SUPERMEGA_DATABASE_URL.replace(runtimeRole, 'postgres') }, 'staged').ok, false)
  assert.equal(evaluate({ ...valid, SUPERMEGA_DATABASE_URL: valid.SUPERMEGA_DATABASE_URL.replace(runtimeRole, 'unexpected_runtime') }, 'staged').ok, false)
  assert.equal(evaluate({ ...valid, VITE_SUPABASE_PUBLISHABLE_KEY: 'service_role_secret' }, 'staged').ok, false)
  assert.equal(evaluate({}, 'isolated_demo').ok, true)
  assert.equal(evaluate({ GITHUB_SHA: 'd'.repeat(40) }, 'isolated_demo').ok, true)
  assert.equal(evaluate({ SUPERMEGA_RELEASE_COMMIT: 'd'.repeat(40) }, 'isolated_demo').ok, false)
  assert.equal(evaluate(valid, 'isolated_demo').ok, false)
  console.log(JSON.stringify({ ok: true, contract: 'supermega_managed_runtime_environment_values_self_test.v1', checks: 22 }))
  process.exit(0)
}

const expectedMode = String(process.argv[2] || '').trim()
if (!['isolated_demo', 'staged', 'managed_trial', 'self_serve'].includes(expectedMode)) {
  throw new Error('expected_mode_must_be_isolated_demo_staged_managed_trial_or_self_serve')
}
const result = evaluate(process.env, expectedMode)
console.log(JSON.stringify(result))
if (!result.ok) process.exit(1)

export { evaluate }
