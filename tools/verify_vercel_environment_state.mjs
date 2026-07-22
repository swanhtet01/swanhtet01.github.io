const kind = String(process.argv[2] || '').trim()
const strictCleanup = process.env.VERIFY_ENV_CLEANUP_STRICT === '1'

if (!['app', 'public'].includes(kind)) throw new Error('environment_kind_must_be_app_or_public')

let input = ''
for await (const chunk of process.stdin) input += chunk

const payload = JSON.parse(input)
const envs = Array.isArray(payload?.envs) ? payload.envs : []
const productionKeys = new Set(
  envs
    .filter((entry) => {
      const targets = Array.isArray(entry?.target) ? entry.target : [entry?.target]
      return targets.includes('production')
    })
    .map((entry) => String(entry?.key || '').trim())
    .filter(Boolean),
)

const failures = []
const missing = []
const requireKeys = (keys) => {
  for (const key of keys) {
    if (!productionKeys.has(key)) missing.push(key)
  }
}

let operatingMode = null
let deliveryModes = []
let allowed = new Set()

if (kind === 'app') {
  const core = [
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
  const optional = ['SUPERMEGA_CORS_ORIGINS']
  requireKeys(core)
  const managedCount = managedTrial.filter((key) => productionKeys.has(key)).length
  if (managedCount > 0 && managedCount < managedTrial.length) {
    failures.push('managed_trial_environment_incomplete')
    for (const key of managedTrial) if (!productionKeys.has(key)) missing.push(key)
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
  if (deliveryModes.length === 0) failures.push('contact_delivery_environment_missing')
  allowed = new Set([...required, ...optional])
}

if (missing.length) failures.push('required_production_environment_missing')

const unsafeBrowserSecrets = [...productionKeys]
  .filter((key) => /^VITE_.*(?:SERVICE_ROLE|SECRET|PRIVATE|TOKEN)/i.test(key))
  .sort()
if (unsafeBrowserSecrets.length) failures.push('browser_exposed_secret_name_present')

const cleanupCandidates = [...productionKeys]
  .filter((key) => !allowed.has(key))
  .sort()
if (strictCleanup && cleanupCandidates.length) failures.push('legacy_environment_variables_present')

const result = {
  ok: failures.length === 0,
  contract: 'supermega_vercel_environment_state',
  kind,
  productionVariableCount: productionKeys.size,
  operatingMode,
  deliveryModes,
  missing: [...new Set(missing)].sort(),
  unsafeBrowserSecrets,
  cleanupCandidateCount: cleanupCandidates.length,
  cleanupCandidates,
  strictCleanup,
  failures,
}

const output = JSON.stringify(result, null, 2)
if (failures.length) {
  console.error(output)
  process.exit(1)
}
console.log(output)
