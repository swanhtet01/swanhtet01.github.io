import test from 'node:test'
import assert from 'node:assert/strict'
import { acceptanceProject as ref, inspectAcceptanceEnvironment as inspect } from './verify_acceptance_runtime_environment.mjs'
const commit = 'a'.repeat(40)
const valid = { VERCEL_ENV: 'preview', SUPERMEGA_RELEASE_COMMIT: commit,
 SUPERMEGA_SUPABASE_PROJECT_REF: ref, VITE_SUPABASE_URL: `https://${ref}.supabase.co`,
 VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic000000000',
 SUPERMEGA_TRIAL_SCHEMA_VERSION: '13', SUPERMEGA_BILLING_SCHEMA_VERSION: '13',
 SUPERMEGA_TRIAL_WRITES_ENABLED: 'true',
 SUPERMEGA_DATABASE_URL: `postgresql://supermega_trial_login.${ref}:PRIVATE_TEST_SECRET@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require`,
 SUPERMEGA_STORAGE_AUDIT_DATABASE_URL: `postgresql://supermega_storage_audit.${ref}:PRIVATE_AUDIT_SECRET@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require` }
test('accepts only staged acceptance preview configuration', () => {
 assert.equal(inspect(valid, commit).ok, true)
 for (const patch of [{ VERCEL_ENV: 'production' }, { SUPERMEGA_SUPABASE_PROJECT_REF: 'zvtzwcimpvvtkowflhda' },
 { VITE_SUPABASE_URL: 'https://zvtzwcimpvvtkowflhda.supabase.co' }, { SUPERMEGA_RELEASE_COMMIT: 'b'.repeat(40) },
 { SUPERMEGA_TRIAL_WRITES_ENABLED: 'false' }, { SUPERMEGA_SELF_SERVE_ACTIVATION_WINDOW: 'open' },
 { VITE_SUPABASE_PUBLISHABLE_KEY: 'service_role' }, { SUPERMEGA_BILLING_SCHEMA_VERSION: '12' }]) {
  assert.equal(inspect({ ...valid, ...patch }, commit).ok, false)
 }
 assert.equal(inspect(valid, '').ok, false)
 assert.equal(inspect({ ...valid, SUPERMEGA_STORAGE_AUDIT_DATABASE_URL: '' }, commit).ok, false)
})
test('rejects privileged, cross-project, insecure and ambiguous database URLs without leaking values', () => {
 for (const value of [undefined, 'PRIVATE_TEST_SECRET', valid.SUPERMEGA_DATABASE_URL.replace(ref, 'zvtzwcimpvvtkowflhda'),
 valid.SUPERMEGA_DATABASE_URL.replace(`supermega_trial_login.${ref}`, 'postgres'),
 valid.SUPERMEGA_DATABASE_URL.replace('sslmode=require', 'sslmode=disable'),
 valid.SUPERMEGA_DATABASE_URL + '&sslmode=disable', valid.SUPERMEGA_DATABASE_URL + '&options=unsafe',
 valid.SUPERMEGA_DATABASE_URL.replace('6543', '5432')]) {
  const result = inspect({ ...valid, SUPERMEGA_DATABASE_URL: value }, commit)
  assert.equal(result.ok, false)
  assert.ok(!JSON.stringify(result).includes('PRIVATE_TEST_SECRET'))
 }
 for (const value of [undefined, 'PRIVATE_AUDIT_SECRET', valid.SUPERMEGA_STORAGE_AUDIT_DATABASE_URL.replace(ref, 'zvtzwcimpvvtkowflhda'),
 valid.SUPERMEGA_STORAGE_AUDIT_DATABASE_URL.replace('supermega_storage_audit', 'postgres'),
 valid.SUPERMEGA_STORAGE_AUDIT_DATABASE_URL.replace('sslmode=require', 'sslmode=disable')]) {
  const result = inspect({ ...valid, SUPERMEGA_STORAGE_AUDIT_DATABASE_URL: value }, commit)
  assert.equal(result.ok, false)
  assert.ok(!JSON.stringify(result).includes('PRIVATE_AUDIT_SECRET'))
 }
})


test('rejects inherited server Auth overrides that would bypass the acceptance browser configuration', () => {
 for (const name of ['SUPERMEGA_SUPABASE_URL', 'SUPABASE_URL']) {
  assert.equal(inspect({ ...valid, [name]: 'https://zvtzwcimpvvtkowflhda.supabase.co' }, commit).ok, false)
  assert.equal(inspect({ ...valid, [name]: valid.VITE_SUPABASE_URL + '/' }, commit).ok, true)
 }
 for (const name of ['SUPERMEGA_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLISHABLE_KEY',
   'SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY']) {
  const result = inspect({ ...valid, [name]: 'PRIVATE_OTHER_PROJECT_KEY' }, commit)
  assert.equal(result.ok, false)
  assert.ok(!JSON.stringify(result).includes('PRIVATE_OTHER_PROJECT_KEY'))
  assert.equal(inspect({ ...valid, [name]: valid.VITE_SUPABASE_PUBLISHABLE_KEY }, commit).ok, true)
 }
})
