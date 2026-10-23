import { isIP } from 'node:net'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const packageState = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const projectRef = String(packageState?.supermega?.productionSupabaseProjectRef || '').trim()
const sourceBoundSupabaseOrigin = `https://${projectRef}.supabase.co`

const text = (value) => String(value || '').trim()

const privateIpv4 = (hostname) => {
  const octets = hostname.split('.').map(Number)
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false
  const [first, second] = octets
  return first === 0
    || first === 10
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
}

const privateIpv6 = (hostname) => {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return normalized === '::'
    || normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || /^fe[89ab]/.test(normalized)
}

const publicHostname = (hostname) => {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!normalized
    || normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.local')
    || normalized.endsWith('.internal')) return false
  if (isIP(normalized) === 4) return !privateIpv4(normalized)
  if (isIP(normalized) === 6) return !privateIpv6(normalized)
  return normalized.length <= 253 && normalized.split('.').every((label) =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
}

const parseHttpsUrl = (value, { originOnly = false } = {}) => {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:'
      || parsed.username
      || parsed.password
      || parsed.port
      || parsed.search
      || parsed.hash
      || !publicHostname(parsed.hostname)) return null
    if (originOnly && parsed.pathname !== '/') return null
    return parsed
  } catch {
    return null
  }
}

const evaluate = (environment) => {
  const failures = []
  const addFailure = (failure) => {
    if (!failures.includes(failure)) failures.push(failure)
  }

  const supabaseUrl = text(environment.SUPABASE_URL)
  const supabaseServiceRoleKey = text(environment.SUPABASE_SERVICE_ROLE_KEY)
  const expectedSupabaseOrigin = text(environment.SUPERMEGA_EXPECTED_PUBLIC_SUPABASE_ORIGIN)
  const webhookUrl = text(environment.SUPERMEGA_LEAD_WEBHOOK_URL)
  const webhookSecret = text(environment.SUPERMEGA_LEAD_WEBHOOK_SECRET)
  const expectedWebhookOrigin = text(environment.SUPERMEGA_EXPECTED_LEAD_WEBHOOK_ORIGIN)

  const supabaseConfigured = Boolean(supabaseUrl || supabaseServiceRoleKey)
  if (Boolean(supabaseUrl) !== Boolean(supabaseServiceRoleKey)) {
    addFailure('public_supabase_delivery_incomplete')
  }
  if (supabaseConfigured) {
    const approved = parseHttpsUrl(expectedSupabaseOrigin, { originOnly: true })
    const target = parseHttpsUrl(supabaseUrl, { originOnly: true })
    if (!approved || approved.origin !== sourceBoundSupabaseOrigin) {
      addFailure('public_supabase_expected_origin_invalid')
    }
    if (!target || !approved || target.origin !== approved.origin) {
      addFailure('public_supabase_target_invalid')
    }
  }

  const webhookConfigured = Boolean(webhookUrl)
  if (!webhookConfigured && webhookSecret) addFailure('public_webhook_secret_without_target')
  if (webhookConfigured) {
    const approved = parseHttpsUrl(expectedWebhookOrigin, { originOnly: true })
    const target = parseHttpsUrl(webhookUrl)
    if (!approved) addFailure('public_webhook_expected_origin_invalid')
    if (!target || !approved || target.origin !== approved.origin) {
      addFailure('public_webhook_target_invalid')
    }
  }

  return {
    ok: failures.length === 0,
    contract: 'supermega.public-runtime-environment-values.v1',
    supabaseDeliveryConfigured: Boolean(supabaseUrl && supabaseServiceRoleKey),
    supabaseOriginBound: Boolean(supabaseConfigured && failures.every((value) => !value.startsWith('public_supabase_'))),
    webhookDeliveryConfigured: webhookConfigured,
    webhookOriginBound: Boolean(webhookConfigured && failures.every((value) => !value.startsWith('public_webhook_'))),
    secretValuesExposed: false,
    failures,
  }
}

const result = evaluate(process.env)
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(result))
  if (!result.ok) process.exitCode = 1
}

export { evaluate }
