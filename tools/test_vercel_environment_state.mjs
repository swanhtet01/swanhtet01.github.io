import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const verifier = resolve(import.meta.dirname, 'verify_vercel_environment_state.mjs')
const env = (key) => ({ key, target: ['production'], type: 'sensitive' })

function run(kind, keys, options = {}) {
  return spawnSync(process.execPath, [verifier, kind], {
    input: JSON.stringify({ envs: keys.map(env) }),
    encoding: 'utf8',
    env: { ...process.env, VERIFY_ENV_CLEANUP_STRICT: options.strict ? '1' : '0' },
  })
}

function parse(result) {
  return JSON.parse(result.status === 0 ? result.stdout : result.stderr)
}

const appCore = [
  'CRON_SECRET',
  'SUPERMEGA_INTERNAL_CRON_TOKEN',
  'SUPERMEGA_CLOUD_TASKS_WORKER_URL',
  'SUPERMEGA_CLOUD_TASKS_ALLOWED_HOSTS',
]
const managedTrial = [
  'SUPERMEGA_DATABASE_URL',
  'SUPERMEGA_TRIAL_IDENTITY_SECRET',
  'SUPERMEGA_TRIAL_WRITES_ENABLED',
]

const isolated = run('app', appCore)
if (isolated.status !== 0 || parse(isolated).operatingMode !== 'isolated_demo') throw new Error('isolated_app_contract_failed')

const managed = run('app', [...appCore, ...managedTrial, 'VITE_SUPABASE_URL'])
if (managed.status !== 0 || parse(managed).operatingMode !== 'managed_trial' || parse(managed).cleanupCandidateCount !== 1) throw new Error('managed_app_contract_failed')

const partialManaged = run('app', [...appCore, managedTrial[0]])
if (partialManaged.status === 0 || !parse(partialManaged).failures.includes('managed_trial_environment_incomplete')) throw new Error('partial_managed_app_allowed')

const publicReady = run('public', ['SUPERMEGA_CONTACT_IDEMPOTENCY_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
if (publicReady.status !== 0 || !parse(publicReady).deliveryModes.includes('supabase')) throw new Error('public_delivery_contract_failed')

const publicNoDelivery = run('public', ['SUPERMEGA_CONTACT_IDEMPOTENCY_SECRET'])
if (publicNoDelivery.status === 0 || !parse(publicNoDelivery).failures.includes('contact_delivery_environment_missing')) throw new Error('public_without_delivery_allowed')

const browserSecret = run('app', [...appCore, 'VITE_SUPABASE_SERVICE_ROLE_KEY'])
if (browserSecret.status === 0 || !parse(browserSecret).failures.includes('browser_exposed_secret_name_present')) throw new Error('browser_secret_allowed')

const strictCleanup = run('app', [...appCore, 'VITE_SUPABASE_URL'], { strict: true })
if (strictCleanup.status === 0 || !parse(strictCleanup).failures.includes('legacy_environment_variables_present')) throw new Error('strict_cleanup_contract_failed')

console.log(JSON.stringify({ ok: true, contract: 'supermega_vercel_environment_state_tests', checks: 7 }, null, 2))
