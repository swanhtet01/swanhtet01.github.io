import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

const required = ['SUPERMEGA_DATABASE_URL', 'SUPERMEGA_TRIAL_SCHEMA_VERSION',
  'SUPERMEGA_BILLING_SCHEMA_VERSION', 'SUPERMEGA_SUPABASE_PROJECT_REF',
  'SUPERMEGA_TRIAL_WRITES_ENABLED', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']
function check(keys, target = ['production']) {
  const run = spawnSync(process.execPath, ['tools/verify_vercel_environment_state.mjs', 'app'], {
    encoding: 'utf8', input: JSON.stringify({ envs: keys.map(key => ({ key, target, type: 'encrypted' })) }),
    env: { ...process.env, VERIFY_ENV_CLEANUP_STRICT: '1' },
  })
  return { status: run.status, receipt: JSON.parse(run.stdout || run.stderr) }
}
test('complete schema13 settings are accepted without allowing arbitrary legacy settings', () => {
  assert.equal(check(required).status, 0)
  const stale = check([...required, 'OBSOLETE_TEST_SETTING'])
  assert.notEqual(stale.status, 0)
  assert.ok(stale.receipt.failures.includes('legacy_environment_variables_present'))
})
test('missing billing setting and non-production scope fail closed', () => {
  const missing = check(required.filter(key => key !== 'SUPERMEGA_BILLING_SCHEMA_VERSION'))
  assert.notEqual(missing.status, 0)
  assert.ok(missing.receipt.missing.includes('SUPERMEGA_BILLING_SCHEMA_VERSION'))
  assert.notEqual(check(required, ['production', 'preview']).status, 0)
})
