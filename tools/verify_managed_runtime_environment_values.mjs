import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const packageState = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const projectRef = String(packageState?.supermega?.productionSupabaseProjectRef || '').trim()
const runtimeRole = 'supermega_trial_runtime'

const evaluate = (environment, expectedMode) => {
  const failures = []
  const addFailure = (value) => {
    if (!failures.includes(value)) failures.push(value)
  }
  const databaseUrl = String(environment.SUPERMEGA_DATABASE_URL || '').trim()
  const supabaseUrl = String(environment.VITE_SUPABASE_URL || '').trim()
  const publishableKey = String(environment.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()
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
  if (expectedMode === 'managed_trial' && writesEnabled !== 'true') {
    addFailure('managed_writes_flag_not_enabled')
  }
  if (expectedMode === 'staged' && !['', 'false'].includes(writesEnabled)) {
    addFailure('staged_environment_must_not_enable_writes')
  }
  if (expectedMode === 'isolated_demo') {
    if ([databaseUrl, supabaseUrl, publishableKey, writesEnabled].some(Boolean)) {
      addFailure('isolated_environment_contains_managed_runtime_values')
    } else {
      failures.splice(0, failures.length)
    }
  }
  return {
    ok: failures.length === 0,
    contract: 'supermega_managed_runtime_environment_values.v1',
    expectedMode,
    effectiveMode: expectedMode === 'managed_trial' && failures.length === 0
      ? 'managed_trial'
      : 'isolated_demo',
    projectRefMatched: databaseTargetReady && supabaseUrl === `https://${projectRef}.supabase.co`,
    tlsRequired: databaseTargetReady,
    browserAuthReady: supabaseUrl === `https://${projectRef}.supabase.co`
      && /^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(publishableKey),
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
  }
  assert.equal(evaluate(valid, 'staged').ok, true)
  assert.equal(evaluate({ ...valid, SUPERMEGA_TRIAL_WRITES_ENABLED: 'true' }, 'managed_trial').ok, true)
  assert.equal(evaluate(valid, 'managed_trial').failures.includes('managed_writes_flag_not_enabled'), true)
  assert.equal(evaluate({ ...valid, SUPERMEGA_DATABASE_URL: valid.SUPERMEGA_DATABASE_URL.replace('sslmode=require', 'sslmode=disable') }, 'staged').ok, false)
  assert.equal(evaluate({ ...valid, SUPERMEGA_DATABASE_URL: valid.SUPERMEGA_DATABASE_URL.replace(':6543/', ':5432/') }, 'staged').ok, false)
  assert.equal(evaluate({ ...valid, SUPERMEGA_DATABASE_URL: `${valid.SUPERMEGA_DATABASE_URL}&options=unsafe` }, 'staged').ok, false)
  assert.equal(evaluate({ ...valid, SUPERMEGA_DATABASE_URL: valid.SUPERMEGA_DATABASE_URL.replace(projectRef, 'otherprojectref00000') }, 'staged').ok, false)
  assert.equal(evaluate({ ...valid, SUPERMEGA_DATABASE_URL: valid.SUPERMEGA_DATABASE_URL.replace(runtimeRole, 'postgres') }, 'staged').ok, false)
  assert.equal(evaluate({ ...valid, SUPERMEGA_DATABASE_URL: valid.SUPERMEGA_DATABASE_URL.replace(runtimeRole, 'unexpected_runtime') }, 'staged').ok, false)
  assert.equal(evaluate({ ...valid, VITE_SUPABASE_PUBLISHABLE_KEY: 'service_role_secret' }, 'staged').ok, false)
  assert.equal(evaluate({}, 'isolated_demo').ok, true)
  assert.equal(evaluate(valid, 'isolated_demo').ok, false)
  console.log(JSON.stringify({ ok: true, contract: 'supermega_managed_runtime_environment_values_self_test.v1', checks: 12 }))
  process.exit(0)
}

const expectedMode = String(process.argv[2] || '').trim()
if (!['isolated_demo', 'staged', 'managed_trial'].includes(expectedMode)) {
  throw new Error('expected_mode_must_be_isolated_demo_staged_or_managed_trial')
}
const result = evaluate(process.env, expectedMode)
console.log(JSON.stringify(result))
if (!result.ok) process.exit(1)

export { evaluate }
