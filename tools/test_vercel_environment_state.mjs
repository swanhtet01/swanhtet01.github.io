import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

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
  return spawnSync(process.execPath, [options.verifier ?? verifier, kind], {
    input: JSON.stringify({ envs: entries }),
    encoding: 'utf8',
    env: childEnv,
  })
}

function parse(result) {
  return JSON.parse(result.status === 0 ? result.stdout : result.stderr)
}

const dormantSchedulerEnvironment = [
  env('SUPERMEGA_HOSTED_SCHEDULER_ENABLED', { type: 'plain' }),
  env('SUPERMEGA_SCHEDULER_ACTIVATION_EVIDENCE'),
  env('SUPERMEGA_SCHEDULER_ACTIVATION_SIGNING_SECRET'),
  env('CRON_SECRET'),
  env('SUPERMEGA_INTERNAL_CRON_TOKEN', { type: 'encrypted' }),
  env('SUPERMEGA_CLOUD_TASKS_WORKER_URL', { type: 'plain' }),
  env('SUPERMEGA_CLOUD_TASKS_ALLOWED_HOSTS', { type: 'plain' }),
]
const managedTrial = [
  env('SUPERMEGA_DATABASE_URL', { type: 'secret' }),
  env('SUPERMEGA_TRIAL_SCHEMA_VERSION', { type: 'plain' }),
  env('SUPERMEGA_SUPABASE_PROJECT_REF', { type: 'plain' }),
  env('SUPERMEGA_TRIAL_WRITES_ENABLED', { type: 'plain' }),
  env('VITE_SUPABASE_URL', { type: 'plain' }),
  env('VITE_SUPABASE_PUBLISHABLE_KEY', { type: 'plain' }),
]
const managedGateway = env('SUPERMEGA_TRIAL_IDENTITY_SECRET')

const isolated = run('app', [])
assert.equal(isolated.status, 0, 'isolated_app_contract_failed')
assert.equal(parse(isolated).operatingMode, 'isolated_demo', 'isolated_app_mode_failed')
assert.equal(parse(isolated).schedulerActivation, 'dormant', 'dormant_scheduler_state_missing')

const managed = run('app', managedTrial)
assert.equal(managed.status, 0, 'managed_app_contract_failed')
assert.equal(parse(managed).operatingMode, 'managed_trial_candidate', 'managed_app_mode_failed')
assert.equal(parse(managed).valueVerificationRequired, true)

const partialManaged = run('app', [managedTrial[0]])
assert.notEqual(partialManaged.status, 0, 'partial_managed_app_allowed')
assert.ok(parse(partialManaged).failures.includes('managed_trial_environment_incomplete'))
assert.ok(parse(partialManaged).missing.includes('VITE_SUPABASE_URL'))
assert.ok(parse(partialManaged).missing.includes('VITE_SUPABASE_PUBLISHABLE_KEY'))
assert.ok(parse(partialManaged).missing.includes('SUPERMEGA_TRIAL_SCHEMA_VERSION'))
assert.ok(parse(partialManaged).missing.includes('SUPERMEGA_SUPABASE_PROJECT_REF'))

const serverOnlyManaged = run('app', [managedTrial[0], managedTrial[1], managedGateway])
assert.notEqual(serverOnlyManaged.status, 0, 'managed_mode_without_browser_auth_allowed')
assert.ok(parse(serverOnlyManaged).failures.includes('managed_trial_environment_incomplete'))

const managedWithGateway = run('app', [...managedTrial, managedGateway])
assert.equal(managedWithGateway.status, 0, 'optional_gateway_identity_rejected')
assert.equal(parse(managedWithGateway).operatingMode, 'managed_trial_candidate')

const managedWithSelfServe = run('app', [
  ...managedTrial,
  env('SUPERMEGA_SELF_SERVE_ACTIVATION_WINDOW', { type: 'plain' }),
])
assert.equal(managedWithSelfServe.status, 0, 'optional_self_serve_window_rejected')

const persistedReleaseCommit = run('app', [
  ...managedTrial,
  env('SUPERMEGA_RELEASE_COMMIT', { type: 'plain' }),
])
assert.notEqual(persistedReleaseCommit.status, 0, 'stale_persisted_release_commit_allowed')
assert.ok(parse(persistedReleaseCommit).cleanupCandidates.includes('SUPERMEGA_RELEASE_COMMIT'))

const dormantScheduler = run('app', dormantSchedulerEnvironment)
assert.notEqual(dormantScheduler.status, 0, 'dormant_scheduler_environment_allowed')
assert.ok(parse(dormantScheduler).failures.includes('dormant_scheduler_environment_present'))

const activeFixtureDirectory = mkdtempSync(join(tmpdir(), 'supermega-vercel-env-active-'))
const activeVerifier = join(activeFixtureDirectory, 'verify_vercel_environment_state.mjs')
const activeAuthorityPath = join(activeFixtureDirectory, 'supermega_scheduler_authority.json')
copyFileSync(verifier, activeVerifier)
const activeAuthority = JSON.parse(readFileSync(resolve(import.meta.dirname, 'supermega_scheduler_authority.json'), 'utf8'))
activeAuthority.activation.state = 'active'
writeFileSync(activeAuthorityPath, JSON.stringify(activeAuthority))
try {
  const activeScheduler = run('app', [...managedTrial, ...dormantSchedulerEnvironment], { verifier: activeVerifier })
  assert.equal(activeScheduler.status, 0, 'active_scheduler_environment_rejected')
  assert.equal(parse(activeScheduler).schedulerActivation, 'active')

  const missingActivationEvidence = run(
    'app',
    [...managedTrial, ...dormantSchedulerEnvironment.filter((entry) => entry.key !== 'SUPERMEGA_SCHEDULER_ACTIVATION_EVIDENCE')],
    { verifier: activeVerifier },
  )
  assert.notEqual(missingActivationEvidence.status, 0, 'missing_activation_evidence_allowed')
  assert.ok(parse(missingActivationEvidence).missing.includes('SUPERMEGA_SCHEDULER_ACTIVATION_EVIDENCE'))

  const plainActivationEvidence = run(
    'app',
    [
      ...managedTrial,
      ...dormantSchedulerEnvironment.filter((entry) => entry.key !== 'SUPERMEGA_SCHEDULER_ACTIVATION_EVIDENCE'),
      env('SUPERMEGA_SCHEDULER_ACTIVATION_EVIDENCE', { type: 'plain' }),
    ],
    { verifier: activeVerifier },
  )
  assert.notEqual(plainActivationEvidence.status, 0, 'plain_activation_evidence_allowed')
  assert.ok(parse(plainActivationEvidence).failures.includes('scheduler_activation_environment_not_protected'))

  const previewActivationSecret = run(
    'app',
    [
      ...managedTrial,
      ...dormantSchedulerEnvironment.filter((entry) => entry.key !== 'SUPERMEGA_SCHEDULER_ACTIVATION_SIGNING_SECRET'),
      env('SUPERMEGA_SCHEDULER_ACTIVATION_SIGNING_SECRET', { target: ['production', 'preview'] }),
    ],
    { verifier: activeVerifier },
  )
  assert.notEqual(previewActivationSecret.status, 0, 'preview_activation_secret_allowed')
  assert.ok(parse(previewActivationSecret).invalidScopeVariables.includes('SUPERMEGA_SCHEDULER_ACTIVATION_SIGNING_SECRET'))
} finally {
  rmSync(activeFixtureDirectory, { recursive: true, force: true })
}

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

const browserSecret = run('app', [env('VITE_SUPABASE_SERVICE_ROLE_KEY')], { strictCleanup: false })
assert.notEqual(browserSecret.status, 0, 'browser_secret_allowed')
assert.ok(parse(browserSecret).failures.includes('browser_exposed_secret_name_present'))

const previewLeakage = run('app', [
  ...managedTrial,
  env('SUPERMEGA_TRIAL_IDENTITY_SECRET', { target: ['production', 'preview'] }),
])
assert.notEqual(previewLeakage.status, 0, 'preview_scope_leakage_allowed')
assert.ok(parse(previewLeakage).failures.includes('allowed_environment_scope_not_production_only'))
assert.deepEqual(parse(previewLeakage).invalidScopeVariables, ['SUPERMEGA_TRIAL_IDENTITY_SECRET'])

const plainCredential = run('app', [
  ...managedTrial,
  env('SUPERMEGA_TRIAL_IDENTITY_SECRET', { type: 'plain' }),
])
assert.notEqual(plainCredential.status, 0, 'plain_credential_allowed')
assert.ok(parse(plainCredential).failures.includes('credential_environment_type_not_protected'))

const missingCredentialType = run('app', [
  ...managedTrial,
  env('SUPERMEGA_TRIAL_IDENTITY_SECRET', { omitType: true }),
])
assert.notEqual(missingCredentialType.status, 0, 'missing_credential_type_allowed')
assert.ok(parse(missingCredentialType).unprotectedCredentialVariables.includes('SUPERMEGA_TRIAL_IDENTITY_SECRET'))

const duplicate = run('app', [...managedTrial, managedGateway, env('SUPERMEGA_TRIAL_IDENTITY_SECRET')])
assert.notEqual(duplicate.status, 0, 'duplicate_environment_definition_allowed')
assert.ok(parse(duplicate).failures.includes('duplicate_environment_variables_present'))
assert.deepEqual(parse(duplicate).duplicateEnvironmentKeys, ['SUPERMEGA_TRIAL_IDENTITY_SECRET'])

const conflicting = run('app', [...managedTrial, managedGateway, env('SUPERMEGA_TRIAL_IDENTITY_SECRET', { target: ['preview'], type: 'plain' })])
assert.notEqual(conflicting.status, 0, 'conflicting_environment_definition_allowed')
assert.ok(parse(conflicting).failures.includes('conflicting_environment_definitions_present'))
assert.deepEqual(parse(conflicting).conflictingEnvironmentKeys, ['SUPERMEGA_TRIAL_IDENTITY_SECRET'])

const validPlainConfig = run('app', [env('SUPERMEGA_CORS_ORIGINS', { type: 'plain' })])
assert.equal(validPlainConfig.status, 0, 'plain_non_secret_config_rejected')

const strictCleanup = run('app', [env('LEGACY_FLAG', { type: 'plain' })])
assert.notEqual(strictCleanup.status, 0, 'strict_cleanup_not_enabled_by_default')
assert.equal(parse(strictCleanup).strictCleanup, true)
assert.ok(parse(strictCleanup).failures.includes('legacy_environment_variables_present'))

const diagnosticCleanup = run('app', [env('LEGACY_FLAG', { type: 'plain' })], { strictCleanup: false })
assert.equal(diagnosticCleanup.status, 0, 'diagnostic_cleanup_disable_failed')
assert.equal(parse(diagnosticCleanup).strictCleanup, false)
assert.deepEqual(parse(diagnosticCleanup).cleanupCandidates, ['LEGACY_FLAG'])

const sentinel = 'must-never-appear-in-verifier-output'
const redaction = run('app', [
  ...managedTrial,
  env('SUPERMEGA_TRIAL_IDENTITY_SECRET', { value: sentinel }),
])
assert.equal(redaction.status, 0, 'redaction_fixture_failed')
assert.equal(`${redaction.stdout}${redaction.stderr}`.includes(sentinel), false, 'environment_value_disclosed')

console.log(JSON.stringify({ ok: true, contract: 'supermega_vercel_environment_state_tests', checks: 25 }, null, 2))
