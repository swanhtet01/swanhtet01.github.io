import {
  applyProvisionPlan,
  buildProvisionPlan,
  requiredSecretGroups,
  validateClientManifest,
} from './workcell-provision.mjs'

export const GUIDED_BOOTSTRAP_INPUT = 'SUPERMEGA_NEW_CLIENT_SUPABASE_DB_URL'

const INPUT_LABELS = Object.freeze({
  SUPERMEGA_OPS_KEY: 'Client console passcode',
  'ANTHROPIC_API_KEY|CLAUDE_API_KEY|OPENROUTER_API_KEY': 'AI provider key',
  SUPABASE_URL: 'Client Supabase URL',
  SUPABASE_SERVICE_ROLE_KEY: 'Client Supabase service-role key',
  TELEGRAM_BOT_TOKEN: 'Client Telegram bot token',
  TELEGRAM_ALERT_CHAT_ID: 'Owner Telegram chat ID',
  PAYPAL_CLIENT_ID: 'Client PayPal ID',
  PAYPAL_CLIENT_SECRET: 'Client PayPal secret',
  'PIPEDRIVE_ACCESS_TOKEN|PIPEDRIVE_API_TOKEN': 'Client Pipedrive token',
  'CLICKUP_ACCESS_TOKEN|CLICKUP_API_TOKEN': 'Client ClickUp token',
})

function inputValue(value, inputName) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`guided_input_required:${inputName}`)
  if (value.length > 20_000 || /[\r\n]/.test(value)) throw new Error(`guided_input_invalid:${inputName}`)
  return value
}

function scrubEnvironment(env) {
  for (const inputName of Object.keys(env)) {
    env[inputName] = ''
    delete env[inputName]
  }
}

export function guidedInputGroups(manifestInput) {
  return requiredSecretGroups(validateClientManifest(manifestInput)).map((group) => ({
    target: group.target,
    label: INPUT_LABELS[group.target] || group.target,
    inputNames: group.sources.map((source) => source.name),
  }))
}

export async function collectGuidedEnvironment(manifestInput, options = {}) {
  const groups = guidedInputGroups(manifestInput)
  if (typeof options.readSecret !== 'function') throw new Error('guided_secret_reader_required')
  const env = Object.create(null)

  try {
    for (const group of groups) {
      let inputName = group.inputNames[0]
      if (group.inputNames.length > 1) {
        if (typeof options.chooseInput !== 'function') throw new Error(`guided_input_choice_required:${group.target}`)
        inputName = await options.chooseInput(group)
        if (!group.inputNames.includes(inputName)) throw new Error(`guided_input_choice_invalid:${group.target}`)
      }
      env[inputName] = inputValue(await options.readSecret({ ...group, inputName }), inputName)
    }

    const bootstrap = typeof options.confirmBootstrap === 'function'
      ? await options.confirmBootstrap({ inputName: GUIDED_BOOTSTRAP_INPUT, defaultValue: true })
      : true
    if (bootstrap !== true && bootstrap !== false) throw new Error('guided_bootstrap_choice_invalid')
    if (bootstrap) {
      env[GUIDED_BOOTSTRAP_INPUT] = inputValue(await options.readSecret({
        target: 'SUPABASE_DB_URL',
        label: 'Temporary client database URL for schema bootstrap',
        inputNames: [GUIDED_BOOTSTRAP_INPUT],
        inputName: GUIDED_BOOTSTRAP_INPUT,
        bootstrapOnly: true,
      }), GUIDED_BOOTSTRAP_INPUT)
    }
    return env
  } catch (error) {
    scrubEnvironment(env)
    throw error
  }
}

export async function runGuidedActivation(manifestInput, options = {}) {
  const manifest = validateClientManifest(manifestInput)
  const env = await collectGuidedEnvironment(manifest, options)
  try {
    const plan = buildProvisionPlan(manifest, {
      scope: options.scope,
      env,
      sourceDirectory: options.sourceDirectory,
      randomBytes: options.randomBytes,
    })
    if (plan.missingSecrets.length) throw new Error(`missing_secrets:${plan.missingSecrets.join(',')}`)
    if (typeof options.onPlan === 'function') await options.onPlan(plan)
    if (typeof options.readConfirmation !== 'function') throw new Error('guided_confirmation_reader_required')
    const confirmation = await options.readConfirmation(plan.confirmation)
    if (confirmation !== plan.confirmation) throw new Error(`confirmation_required:${plan.confirmation}`)
    const apply = options.apply || applyProvisionPlan
    return await apply(manifest, {
      scope: options.scope,
      env,
      sourceDirectory: options.sourceDirectory,
      confirm: confirmation,
      allowExisting: options.allowExisting,
      allowDirtySource: options.allowDirtySource,
      keepTemp: options.keepTemp,
    })
  } finally {
    scrubEnvironment(env)
  }
}

export default {
  GUIDED_BOOTSTRAP_INPUT,
  guidedInputGroups,
  collectGuidedEnvironment,
  runGuidedActivation,
}
