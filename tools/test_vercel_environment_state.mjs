import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const verifier = resolve(import.meta.dirname, 'verify_vercel_environment_state.mjs')
const env = (key, options = {}) => {
  const entry = {
    key,
    target: options.target ?? ['production'],
  }
  if (!options.omitType) entry.type = options.type ?? 'sensitive'
  if (Object.hasOwn(options, 'value')) entry.value = options.value
  return entry
}

function run(kind, entries, options = {}) {
  const childEnv = { ...process.env }
  delete childEnv.VERIFY_ENV_CLEANUP_STRICT
  if (options.strictCleanup === false) childEnv.VERIFY_ENV_CLEANUP_STRICT = '0'
  if (options.strictCleanup === true) childEnv.VERIFY_ENV_CLEANUP_STRICT = '1'
  return spawnSync(process.execPath, [verifier, kind], {
    input: JSON.stringify({ envs: entries }),
    encoding: 'utf8',
    env: childEnv,
  })
}

function parse(result) {
  return JSON.parse(result.status === 0 ? result.stdout : result.stderr)
}

const appCore = [
  env('CRON_SECRET'),
  env('SUPERMEGA_INTERNAL_CRON_TOKEN', { type: 'encrypted' }),
  env('SUPERMEGA_CLOUD_TASKS_WORKER_URL', { type: 'plain' }),
  env('SUPERMEGA_CLOUD_TASKS_ALLOWED_HOSTS', { type: 'plain' }),
]
const managedTrial = [
  env('SUPERMEGA_DATABASE_URL', { type: 'secret' }),
  env('SUPERMEGA_TRIAL_IDENTITY_SECRET'),
  env('SUPERMEGA_TRIAL_WRITES_ENABLED', { type: 'plain' }),
]

const isolated = run('app', appCore)
assert.equal(isolated.status, 0, 'isolated_app_contract_failed')
assert.equal(parse(isolated).operatingMode, 'isolated_demo', 'isolated_app_mode_failed')

const managed = run('app', [...appCore, ...managedTrial])
assert.equal(managed.status, 0, 'managed_app_contract_failed')
assert.equal(parse(managed).operatingMode, 'managed_trial', 'managed_app_mode_failed')

const partialManaged = run('app', [...appCore, managedTrial[0]])
assert.notEqual(partialManaged.status, 0, 'partial_managed_app_allowed')
assert.ok(parse(partialManaged).failures.includes('managed_trial_environment_incomplete'))

const publicReady = run('public', [
  env('SUPERMEGA_CONTACT_IDEMPOTENCY_SECRET'),
  env('SUPABASE_URL', { type: 'plain' }),
  env('SUPABASE_SERVICE_ROLE_KEY'),
])
assert.equal(publicReady.status, 0, 'public_delivery_contract_failed')
assert.ok(parse(publicReady).deliveryModes.includes('supabase'))

const publicNoDelivery = run('public', [env('SUPERMEGA_CONTACT_IDEMPOTENCY_SECRET')])
assert.notEqual(publicNoDelivery.status, 0, 'public_without_delivery_allowed')
assert.ok(parse(publicNoDelivery).failures.includes('contact_delivery_environment_missing'))

const browserSecret = run('app', [...appCore, env('VITE_SUPABASE_SERVICE_ROLE_KEY')], { strictCleanup: false })
assert.notEqual(browserSecret.status, 0, 'browser_secret_allowed')
assert.ok(parse(browserSecret).failures.includes('browser_exposed_secret_name_present'))

const previewLeakage = run('app', [
  ...appCore.filter((entry) => entry.key !== 'CRON_SECRET'),
  env('CRON_SECRET', { target: ['production', 'preview'] }),
])
assert.notEqual(previewLeakage.status, 0, 'preview_scope_leakage_allowed')
assert.ok(parse(previewLeakage).failures.includes('allowed_environment_scope_not_production_only'))
assert.deepEqual(parse(previewLeakage).invalidScopeVariables, ['CRON_SECRET'])

const plainCredential = run('app', [
  ...appCore.filter((entry) => entry.key !== 'CRON_SECRET'),
  env('CRON_SECRET', { type: 'plain' }),
])
assert.notEqual(plainCredential.status, 0, 'plain_credential_allowed')
assert.ok(parse(plainCredential).failures.includes('credential_environment_type_not_protected'))

const missingCredentialType = run('app', [
  ...appCore.filter((entry) => entry.key !== 'CRON_SECRET'),
  env('CRON_SECRET', { omitType: true }),
])
assert.notEqual(missingCredentialType.status, 0, 'missing_credential_type_allowed')
assert.ok(parse(missingCredentialType).unprotectedCredentialVariables.includes('CRON_SECRET'))

const duplicate = run('app', [...appCore, env('CRON_SECRET')])
assert.notEqual(duplicate.status, 0, 'duplicate_environment_definition_allowed')
assert.ok(parse(duplicate).failures.includes('duplicate_environment_variables_present'))
assert.deepEqual(parse(duplicate).duplicateEnvironmentKeys, ['CRON_SECRET'])

const conflicting = run('app', [...appCore, env('CRON_SECRET', { target: ['preview'], type: 'plain' })])
assert.notEqual(conflicting.status, 0, 'conflicting_environment_definition_allowed')
assert.ok(parse(conflicting).failures.includes('conflicting_environment_definitions_present'))
assert.deepEqual(parse(conflicting).conflictingEnvironmentKeys, ['CRON_SECRET'])

const validPlainConfig = run('app', [...appCore, env('SUPERMEGA_CORS_ORIGINS', { type: 'plain' })])
assert.equal(validPlainConfig.status, 0, 'plain_non_secret_config_rejected')

const strictCleanup = run('app', [...appCore, env('LEGACY_FLAG', { type: 'plain' })])
assert.notEqual(strictCleanup.status, 0, 'strict_cleanup_not_enabled_by_default')
assert.equal(parse(strictCleanup).strictCleanup, true)
assert.ok(parse(strictCleanup).failures.includes('legacy_environment_variables_present'))

const diagnosticCleanup = run('app', [...appCore, env('LEGACY_FLAG', { type: 'plain' })], { strictCleanup: false })
assert.equal(diagnosticCleanup.status, 0, 'diagnostic_cleanup_disable_failed')
assert.equal(parse(diagnosticCleanup).strictCleanup, false)
assert.deepEqual(parse(diagnosticCleanup).cleanupCandidates, ['LEGACY_FLAG'])

const sentinel = 'must-never-appear-in-verifier-output'
const redaction = run('app', [
  ...appCore.filter((entry) => entry.key !== 'CRON_SECRET'),
  env('CRON_SECRET', { value: sentinel }),
])
assert.equal(redaction.status, 0, 'redaction_fixture_failed')
assert.equal(`${redaction.stdout}${redaction.stderr}`.includes(sentinel), false, 'environment_value_disclosed')

console.log(JSON.stringify({ ok: true, contract: 'supermega_vercel_environment_state_tests', checks: 15 }, null, 2))
