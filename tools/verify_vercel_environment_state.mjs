import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const kind = String(process.argv[2] || '').trim()
const strictCleanup = process.env.VERIFY_ENV_CLEANUP_STRICT !== '0'
const protectedTypes = new Set(['sensitive', 'encrypted', 'secret'])
const schedulerAuthority = JSON.parse(await readFile(
  resolve(import.meta.dirname, 'supermega_scheduler_authority.json'),
  'utf8',
))
if (schedulerAuthority.contract !== 'supermega.scheduler-authority.v2'
  || !['dormant', 'active'].includes(schedulerAuthority.activation?.state)
  || schedulerAuthority.activation?.runtime_environment_key !== 'SUPERMEGA_HOSTED_SCHEDULER_ENABLED') {
  throw new Error('scheduler_authority_contract_invalid')
}
const schedulerActive = schedulerAuthority.activation.state === 'active'

if (!['app', 'public'].includes(kind)) throw new Error('environment_kind_must_be_app_or_public')

let input = ''
for await (const chunk of process.stdin) input += chunk

const payload = JSON.parse(input)
const envs = Array.isArray(payload?.envs) ? payload.envs : []
const entriesByKey = new Map()
let invalidEntryCount = 0

const normalizeTargets = (target) => {
  const targets = Array.isArray(target) ? target : target == null ? [] : [target]
  return [...new Set(targets.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))].sort()
}

for (const entry of envs) {
  const key = String(entry?.key || '').trim()
  if (!key) {
    invalidEntryCount += 1
    continue
  }
  const metadata = {
    targets: normalizeTargets(entry?.target),
    type: String(entry?.type || '').trim().toLowerCase(),
  }
  const definitions = entriesByKey.get(key) || []
  definitions.push(metadata)
  entriesByKey.set(key, definitions)
}

const environmentKeys = [...entriesByKey.keys()].sort()
const productionKeys = new Set(
  environmentKeys.filter((key) => entriesByKey.get(key).some((entry) => entry.targets.includes('production'))),
)
const isExactlyProduction = (entry) => entry.targets.length === 1 && entry.targets[0] === 'production'
const isCredentialLike = (key) =>
  /(?:^|_)(?:SECRET|TOKEN|KEY)(?:_|$)|DATABASE_URL(?:_|$)|SERVICE_ROLE(?:_|$)|WEBHOOK_URL(?:_|$)/i.test(key)

const failures = []
const missing = []
const addFailure = (failure) => {
  if (!failures.includes(failure)) failures.push(failure)
}
const requireKeys = (keys) => {
  for (const key of keys) {
    if (!productionKeys.has(key)) missing.push(key)
  }
}

let operatingMode = null
let deliveryModes = []
let allowed = new Set()

if (kind === 'app') {
  const schedulerEnvironment = [
    'SUPERMEGA_HOSTED_SCHEDULER_ENABLED',
    'CRON_SECRET',
    'SUPERMEGA_INTERNAL_CRON_TOKEN',
    'SUPERMEGA_CLOUD_TASKS_WORKER_URL',
    'SUPERMEGA_CLOUD_TASKS_ALLOWED_HOSTS',
  ]
  const core = schedulerActive ? schedulerEnvironment : []
  const managedTrial = [
    'SUPERMEGA_DATABASE_URL',
    'SUPERMEGA_TRIAL_IDENTITY_SECRET',
    'SUPERMEGA_TRIAL_WRITES_ENABLED',
  ]
  const optional = ['SUPERMEGA_CORS_ORIGINS']
  requireKeys(core)
  const managedCount = managedTrial.filter((key) => productionKeys.has(key)).length
  if (managedCount > 0 && managedCount < managedTrial.length) {
    addFailure('managed_trial_environment_incomplete')
    for (const key of managedTrial) if (!productionKeys.has(key)) missing.push(key)
  }
  if (schedulerActive && managedCount !== managedTrial.length) {
    addFailure('scheduler_activation_requires_managed_trial')
    for (const key of managedTrial) if (!productionKeys.has(key)) missing.push(key)
  }
  if (!schedulerActive && schedulerEnvironment.some((key) => productionKeys.has(key))) {
    addFailure('dormant_scheduler_environment_present')
  }
  operatingMode = managedCount === managedTrial.length ? 'managed_trial' : 'isolated_demo'
  allowed = new Set([...core, ...managedTrial, ...optional])
} else {
  const required = ['SUPERMEGA_CONTACT_IDEMPOTENCY_SECRET']
  const optional = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'RESEND_API_KEY',
    'SUPERMEGA_CONTACT_NOTIFY_EMAIL',
    'SUPERMEGA_CONTACT_FROM_EMAIL',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_CHAT_ID',
    'SUPERMEGA_LEAD_WEBHOOK_URL',
    'SUPERMEGA_LEAD_WEBHOOK_SECRET',
  ]
  requireKeys(required)
  if (productionKeys.has('SUPABASE_URL') && productionKeys.has('SUPABASE_SERVICE_ROLE_KEY')) deliveryModes.push('supabase')
  if (productionKeys.has('RESEND_API_KEY')) deliveryModes.push('email')
  if (productionKeys.has('TELEGRAM_BOT_TOKEN') && productionKeys.has('TELEGRAM_CHAT_ID')) deliveryModes.push('telegram')
  if (productionKeys.has('SUPERMEGA_LEAD_WEBHOOK_URL')) deliveryModes.push('webhook')
  if (deliveryModes.length === 0) addFailure('contact_delivery_environment_missing')
  allowed = new Set([...required, ...optional])
}

if (missing.length) addFailure('required_production_environment_missing')

const duplicateEnvironmentKeys = environmentKeys.filter((key) => entriesByKey.get(key).length > 1)
if (duplicateEnvironmentKeys.length) addFailure('duplicate_environment_variables_present')

const conflictingEnvironmentKeys = duplicateEnvironmentKeys.filter((key) => {
  const signatures = entriesByKey.get(key).map((entry) => JSON.stringify([entry.targets, entry.type]))
  return new Set(signatures).size > 1
})
if (conflictingEnvironmentKeys.length) addFailure('conflicting_environment_definitions_present')

const invalidScopeVariables = environmentKeys
  .filter((key) => allowed.has(key) && entriesByKey.get(key).some((entry) => !isExactlyProduction(entry)))
  .sort()
if (invalidScopeVariables.length) addFailure('allowed_environment_scope_not_production_only')

const unprotectedCredentialVariables = environmentKeys
  .filter(
    (key) =>
      isCredentialLike(key) &&
      entriesByKey.get(key).some((entry) => !protectedTypes.has(entry.type)),
  )
  .sort()
if (unprotectedCredentialVariables.length) addFailure('credential_environment_type_not_protected')

const unsafeBrowserSecrets = environmentKeys
  .filter((key) => /^(?:VITE_|NEXT_PUBLIC_).*(?:SERVICE_ROLE|SECRET|PRIVATE|TOKEN)/i.test(key))
  .sort()
if (unsafeBrowserSecrets.length) addFailure('browser_exposed_secret_name_present')

const cleanupCandidates = environmentKeys
  .filter((key) => !allowed.has(key))
  .sort()
if (strictCleanup && cleanupCandidates.length) addFailure('legacy_environment_variables_present')
if (invalidEntryCount) addFailure('invalid_environment_entries_present')

const result = {
  ok: failures.length === 0,
  contract: 'supermega_vercel_environment_state',
  kind,
  productionVariableCount: productionKeys.size,
  environmentVariableCount: environmentKeys.length,
  operatingMode,
  schedulerActivation: kind === 'app' ? schedulerAuthority.activation.state : null,
  deliveryModes,
  missing: [...new Set(missing)].sort(),
  duplicateEnvironmentKeys,
  conflictingEnvironmentKeys,
  invalidScopeVariables,
  unprotectedCredentialVariables,
  unsafeBrowserSecrets,
  cleanupCandidateCount: cleanupCandidates.length,
  cleanupCandidates,
  invalidEntryCount,
  strictCleanup,
  failures,
}

const output = JSON.stringify(result, null, 2)
if (failures.length) {
  console.error(output)
  process.exit(1)
}
console.log(output)
