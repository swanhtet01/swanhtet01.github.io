// Controlled client workcell provisioner.
// Plan mode is pure. Apply mode creates one isolated Vercel project, supplies secrets only over
// stdin, deploys a clean kernel copy, and verifies the protected workcell catalog before success.

import { randomBytes } from 'node:crypto'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

import { getWorkcell } from './workcells.mjs'

const CLIENT_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/
const CLIENT_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/
const PROJECT_RE = /^[a-z0-9][a-z0-9-]{0,99}$/
const VERCEL_SCOPE_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/
const CLICKUP_LIST_RE = /^\d{1,32}$/
const DAILY_TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const SECRET_LINE_BREAK_RE = /[\r\n]/
const CONTROL_CHARACTER_RE = /[\u0000-\u001f\u007f]/
const WORKCELL_DATA_TABLES = [
  ['supermega_console_activity', 'id'],
  ['supermega_token_ledger', 'tenant_id'],
  ['supermega_ai_cache', 'cache_key'],
  ['supermega_action_queue', 'id'],
]

function text(value, max = 200) {
  try { return String(value ?? '').trim().slice(0, max) } catch { return '' }
}

function integer(value, fallback, min, max) {
  const parsed = Number.parseInt(text(value, 20), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function plainText(value, max, reason) {
  const candidate = text(value, max)
  if (!candidate || CONTROL_CHARACTER_RE.test(candidate)) throw new Error(reason)
  return candidate
}

function timeZone(value) {
  const candidate = text(value, 80) || 'Asia/Yangon'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date(0))
    return candidate
  } catch {
    throw new Error('manifest_invalid_time_zone')
  }
}

function projectNameFor(clientSlug, requested) {
  const value = text(requested, 100) || `supermega-wc-${clientSlug}`
  if (!PROJECT_RE.test(value)) throw new Error('manifest_invalid_project_name')
  return value
}

export function validateClientManifest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('manifest_object_required')
  if (Number(input.version) !== 1) throw new Error('manifest_version_must_be_1')
  const clientSlug = text(input.clientSlug, 40).toLowerCase()
  if (!CLIENT_SLUG_RE.test(clientSlug)) throw new Error('manifest_invalid_client_slug')
  const clientName = plainText(input.clientName, 120, 'manifest_client_name_required')
  const clientId = text(input.clientId, 80) || `workcell-${clientSlug}`
  if (!CLIENT_ID_RE.test(clientId)) throw new Error('manifest_invalid_client_id')

  const requested = Array.isArray(input.workcells) ? input.workcells : []
  const workcells = []
  for (const value of requested) {
    const slug = text(value, 60).toLowerCase()
    if (!getWorkcell(slug)) throw new Error(`manifest_unknown_workcell:${slug || 'blank'}`)
    if (!workcells.includes(slug)) workcells.push(slug)
  }
  if (!workcells.length || workcells.length > 3) throw new Error('manifest_workcells_1_to_3_required')

  const clickupRequired = workcells.some((slug) => slug === 'pipeline-control' || slug === 'owner-command')
  const clickupListId = text(input.clickupListId, 32)
  if (clickupRequired && !CLICKUP_LIST_RE.test(clickupListId)) throw new Error('manifest_clickup_list_id_required')
  if (clickupListId && !CLICKUP_LIST_RE.test(clickupListId)) throw new Error('manifest_invalid_clickup_list_id')

  const deliveryUtc = text(input.deliveryUtc, 5) || '01:30'
  if (!DAILY_TIME_RE.test(deliveryUtc)) throw new Error('manifest_invalid_delivery_utc')
  const currency = (text(input.currency, 8) || 'MMK').toUpperCase()
  if (!/^[A-Z]{3,8}$/.test(currency)) throw new Error('manifest_invalid_currency')

  return {
    version: 1,
    clientSlug,
    clientName,
    clientId,
    projectName: projectNameFor(clientSlug, input.projectName),
    workcells,
    timeZone: timeZone(input.timeZone),
    currency,
    lookbackHours: integer(input.lookbackHours, 24, 1, 168),
    clickupListId,
    deliveryUtc,
    tokenCap: integer(input.tokenCap, 150_000, 10_000, 5_000_000),
  }
}

function needsConnector(manifest, connector) {
  return manifest.workcells.some((slug) => getWorkcell(slug)?.requiredConnectors.includes(connector))
}

function clientSecret(target, sourceSuffix = target) {
  return { name: `SUPERMEGA_NEW_CLIENT_${sourceSuffix}`, target }
}

export function requiredSecretGroups(manifestInput) {
  const manifest = validateClientManifest(manifestInput)
  const groups = [
    { target: 'SUPERMEGA_OPS_KEY', sources: [clientSecret('SUPERMEGA_OPS_KEY', 'OPS_KEY')] },
    {
      target: 'ANTHROPIC_API_KEY|CLAUDE_API_KEY|OPENROUTER_API_KEY',
      sources: [
        clientSecret('ANTHROPIC_API_KEY'),
        clientSecret('CLAUDE_API_KEY'),
        clientSecret('OPENROUTER_API_KEY'),
      ],
      oneOf: true,
    },
    { target: 'SUPABASE_URL', sources: [clientSecret('SUPABASE_URL')] },
    { target: 'SUPABASE_SERVICE_ROLE_KEY', sources: [clientSecret('SUPABASE_SERVICE_ROLE_KEY')] },
    { target: 'TELEGRAM_BOT_TOKEN', sources: [clientSecret('TELEGRAM_BOT_TOKEN')] },
    {
      target: 'TELEGRAM_ALERT_CHAT_ID',
      sources: [clientSecret('TELEGRAM_ALERT_CHAT_ID'), clientSecret('TELEGRAM_ALERT_CHAT_ID', 'TELEGRAM_CHAT_ID')],
      oneOf: true,
    },
  ]
  if (needsConnector(manifest, 'payment-paypal')) {
    groups.push(
      { target: 'PAYPAL_CLIENT_ID', sources: [clientSecret('PAYPAL_CLIENT_ID')] },
      { target: 'PAYPAL_CLIENT_SECRET', sources: [clientSecret('PAYPAL_CLIENT_SECRET')] },
    )
  }
  if (needsConnector(manifest, 'crm-pipedrive')) {
    groups.push({
      target: 'PIPEDRIVE_ACCESS_TOKEN|PIPEDRIVE_API_TOKEN',
      sources: [clientSecret('PIPEDRIVE_ACCESS_TOKEN'), clientSecret('PIPEDRIVE_API_TOKEN')],
      oneOf: true,
    })
  }
  if (needsConnector(manifest, 'data-clickup')) {
    groups.push({
      target: 'CLICKUP_ACCESS_TOKEN|CLICKUP_API_TOKEN',
      sources: [clientSecret('CLICKUP_ACCESS_TOKEN'), clientSecret('CLICKUP_API_TOKEN')],
      oneOf: true,
    })
  }
  return groups
}

function pickSecret(group, env) {
  for (const source of group.sources) {
    const value = text(env[source.name], 20_000)
    if (value) {
      if (SECRET_LINE_BREAK_RE.test(value)) throw new Error(`secret_contains_line_break:${source.name}`)
      return { source: source.name, target: source.target, value }
    }
  }
  return null
}

export function resolveProvisionEnvironment(manifestInput, env = process.env, options = {}) {
  const manifest = validateClientManifest(manifestInput)
  const secrets = new Map()
  const missingSecrets = []
  const missingSecretInputs = []
  for (const group of requiredSecretGroups(manifest)) {
    const selected = pickSecret(group, env)
    if (!selected) {
      missingSecrets.push(group.target)
      missingSecretInputs.push(group.sources.map((source) => source.name).join('|'))
    }
    else secrets.set(selected.target, selected.value)
  }
  const suppliedCron = text(env.SUPERMEGA_NEW_CLIENT_CRON_SECRET, 20_000)
  if (suppliedCron && SECRET_LINE_BREAK_RE.test(suppliedCron)) throw new Error('secret_contains_line_break:SUPERMEGA_NEW_CLIENT_CRON_SECRET')
  secrets.set('CRON_SECRET', suppliedCron || (options.randomBytes || randomBytes)(32).toString('base64url'))

  const variables = new Map([
    ['SUPERMEGA_WORKCELL_SLUGS', manifest.workcells.join(',')],
    ['WORKCELL_CLIENT_NAME', manifest.clientName],
    ['WORKCELL_CLIENT_ID', manifest.clientId],
    ['WORKCELL_TIME_ZONE', manifest.timeZone],
    ['WORKCELL_CURRENCY', manifest.currency],
    ['WORKCELL_LOOKBACK_HOURS', String(manifest.lookbackHours)],
    ['SUPERMEGA_CLIENT_TOKEN_CAP', String(manifest.tokenCap)],
  ])
  if (manifest.clickupListId) variables.set('WORKCELL_CLICKUP_LIST_ID', manifest.clickupListId)
  return { manifest, variables, secrets, missingSecrets, missingSecretInputs }
}

export function buildProvisionPlan(manifestInput, options = {}) {
  const scope = text(options.scope || process.env.VERCEL_SCOPE, 120)
  if (!VERCEL_SCOPE_RE.test(scope)) throw new Error('vercel_scope_required')
  const resolved = resolveProvisionEnvironment(manifestInput, options.env || process.env, options)
  const requiredSecretInputs = requiredSecretGroups(resolved.manifest)
    .map((group) => group.sources.map((source) => source.name).join('|'))
  requiredSecretInputs.push('SUPERMEGA_NEW_CLIENT_CRON_SECRET (optional; generated when absent)')
  const [hour, minute] = resolved.manifest.deliveryUtc.split(':').map(Number)
  return {
    version: 1,
    projectName: resolved.manifest.projectName,
    scope,
    confirmation: `PROVISION ${resolved.manifest.projectName}`,
    client: {
      slug: resolved.manifest.clientSlug,
      name: resolved.manifest.clientName,
      timeZone: resolved.manifest.timeZone,
      currency: resolved.manifest.currency,
    },
    workcells: [...resolved.manifest.workcells],
    cron: { utc: resolved.manifest.deliveryUtc, expression: `${minute} ${hour} * * *` },
    variableNames: [...resolved.variables.keys()].sort(),
    secretNames: [...resolved.secrets.keys()].sort(),
    requiredSecretInputs,
    missingSecrets: [...resolved.missingSecrets],
    missingSecretInputs: [...resolved.missingSecretInputs],
    sourceDirectory: options.sourceDirectory ? resolve(options.sourceDirectory) : null,
  }
}

function defaultRunner(args, options = {}) {
  return new Promise((resolvePromise) => {
    const direct = args[0] === 'git'
    const executable = direct ? 'git' : (process.platform === 'win32' ? 'npx.cmd' : 'npx')
    const spawnArgs = direct ? args.slice(1) : args
    const child = spawn(executable, spawnArgs, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout = (stdout + chunk).slice(-100_000) })
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-100_000) })
    if (options.input !== undefined) child.stdin.end(`${options.input}\n`)
    else child.stdin.end()
    child.on('error', (error) => resolvePromise({ code: -1, stdout, stderr: error.message }))
    child.on('close', (code) => resolvePromise({ code: Number(code), stdout, stderr }))
  })
}

async function requireSuccess(run, args, options = {}) {
  const result = await run(args, options)
  if (result.code !== 0) {
    const error = new Error(options.reason || 'provision_command_failed')
    error.command = args.slice(0, 4).join(' ')
    error.detail = text(result.stderr || result.stdout, 500)
    throw error
  }
  return result
}

function sourceFilter(source) {
  const name = basename(source)
  if (name === 'node_modules' || name === '.vercel' || name === 'output' || name === '.git') return false
  if (name === '.env' || name.startsWith('.env.')) return false
  return true
}

async function prepareSource(sourceDirectory, cronExpression, options = {}) {
  const source = resolve(sourceDirectory)
  const tempRoot = await mkdtemp(join(options.tempRoot || tmpdir(), 'supermega-workcell-'))
  await cp(source, tempRoot, { recursive: true, filter: sourceFilter })
  const configPath = join(tempRoot, 'vercel.json')
  const config = JSON.parse(await readFile(configPath, 'utf8'))
  config.crons = [{ path: '/api/brief', schedule: cronExpression }]
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  return tempRoot
}

export async function isSourceClean(sourceDirectory, options = {}) {
  const run = options.run || defaultRunner
  const result = await run(['git', '-C', resolve(sourceDirectory), 'status', '--porcelain', '--', '.'], { cwd: sourceDirectory })
  return result.code === 0 && !text(result.stdout, 100_000)
}

export async function verifyClientDataSpine(resolvedInput, options = {}) {
  const resolved = resolvedInput?.secrets instanceof Map
    ? resolvedInput
    : resolveProvisionEnvironment(resolvedInput, options.env || process.env, options)
  const rawUrl = resolved.secrets.get('SUPABASE_URL')
  const serviceKey = resolved.secrets.get('SUPABASE_SERVICE_ROLE_KEY')
  let baseUrl
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('invalid')
    baseUrl = parsed.toString().replace(/\/$/, '')
  } catch {
    throw new Error('client_data_spine_invalid_url')
  }
  if (!serviceKey) throw new Error('client_data_spine_key_required')

  const fetchImpl = options.fetch || fetch
  const tables = []
  for (const [table, column] of WORKCELL_DATA_TABLES) {
    let response
    try {
      response = await fetchImpl(`${baseUrl}/rest/v1/${table}?select=${column}&limit=1`, {
        headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
        signal: AbortSignal.timeout(10_000),
      })
    } catch {
      throw new Error(`client_data_spine_unreachable:${table}`)
    }
    if (!response?.ok) throw new Error(`client_data_spine_schema_missing:${table}`)
    tables.push(table)
  }

  const probeId = `workcell-provision:${(options.randomBytes || randomBytes)(12).toString('hex')}`
  const activityUrl = `${baseUrl}/rest/v1/supermega_console_activity`
  const writeHeaders = {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    'content-type': 'application/json',
    prefer: 'resolution=ignore-duplicates,return=representation',
  }
  let failure = null
  try {
    const first = await fetchImpl(`${activityUrl}?on_conflict=id`, {
      method: 'POST',
      headers: writeHeaders,
      body: JSON.stringify({ id: probeId, kind: 'workcell_provision_probe', summary: 'temporary idempotency proof' }),
      signal: AbortSignal.timeout(10_000),
    })
    const firstRows = await first.json().catch(() => null)
    if (!first.ok || !Array.isArray(firstRows) || firstRows.length !== 1) {
      throw new Error('client_data_spine_claim_insert_failed')
    }

    const duplicate = await fetchImpl(`${activityUrl}?on_conflict=id`, {
      method: 'POST',
      headers: writeHeaders,
      body: JSON.stringify({ id: probeId, kind: 'workcell_provision_probe', summary: 'must not insert twice' }),
      signal: AbortSignal.timeout(10_000),
    })
    const duplicateRows = await duplicate.json().catch(() => null)
    if (!duplicate.ok || !Array.isArray(duplicateRows) || duplicateRows.length !== 0) {
      throw new Error('client_data_spine_claim_not_idempotent')
    }
  } catch (error) {
    failure = error
  }
  const cleanup = await fetchImpl(`${activityUrl}?id=eq.${encodeURIComponent(probeId)}`, {
    method: 'DELETE',
    headers: { ...writeHeaders, prefer: 'return=minimal' },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null)
  if (!cleanup?.ok && !failure) failure = new Error('client_data_spine_probe_cleanup_failed')
  if (failure) throw failure
  return { ok: true, tables, idempotentClaim: true, probeCleaned: true }
}

async function addEnvironmentVariable(run, cwd, scope, name, value, sensitive) {
  const args = [
    'vercel', 'env', 'add', name, 'production', '--force', '--yes',
    sensitive ? '--sensitive' : '--no-sensitive',
    '--scope', scope, '--cwd', cwd,
  ]
  await requireSuccess(run, args, { cwd, input: value, reason: `vercel_env_failed:${name}` })
}

function deploymentUrlFrom(output) {
  const urls = String(output || '').match(/https:\/\/[a-zA-Z0-9.-]+\.vercel\.app/g) || []
  return urls.at(-1) || ''
}

function projectDoesNotExist(result, projectName) {
  if (result?.code === 0) return false
  const output = text(`${result?.stdout || ''}\n${result?.stderr || ''}`, 2_000).toLowerCase()
  const name = projectName.toLowerCase()
  return output.includes(`there is no project for "${name}"`)
    || output.includes(`project "${name}" not found`)
}

export async function verifyProvisionedClient(deploymentUrl, options = {}) {
  const fetchImpl = options.fetch || fetch
  const opsKey = options.opsKey
  const selectedSlugs = options.workcells || []
  const statusResponse = await fetchImpl(`${deploymentUrl}/api/status`, { signal: AbortSignal.timeout(15_000) })
  const status = await statusResponse.json().catch(() => null)
  if (!statusResponse.ok || !status?.ok) throw new Error('provision_status_check_failed')
  const catalogResponse = await fetchImpl(`${deploymentUrl}/api/workcells`, {
    headers: { 'x-ops-key': opsKey },
    signal: AbortSignal.timeout(15_000),
  })
  const catalog = await catalogResponse.json().catch(() => null)
  if (!catalogResponse.ok || !catalog?.ok) throw new Error('provision_catalog_check_failed')
  const rows = Array.isArray(catalog.workcells) ? catalog.workcells : []
  for (const slug of selectedSlugs) {
    const row = rows.find((item) => item.slug === slug)
    if (!row) throw new Error(`provision_workcell_missing:${slug}`)
    if (!row.configured) throw new Error(`provision_workcell_not_configured:${slug}`)
  }
  return {
    service: status.service,
    connectors: status.connectors?.total || 0,
    registrationErrors: status.connectors?.registrationErrors || 0,
    workcells: rows.filter((row) => selectedSlugs.includes(row.slug)).map((row) => ({
      slug: row.slug,
      configured: Boolean(row.configured),
      missing: row.missing || [],
    })),
  }
}

export async function applyProvisionPlan(manifestInput, options = {}) {
  const sourceDirectory = resolve(options.sourceDirectory || '.')
  const env = options.env || process.env
  const scope = text(options.scope || env.VERCEL_SCOPE, 120)
  const plan = buildProvisionPlan(manifestInput, { scope, env, sourceDirectory, randomBytes: options.randomBytes })
  if (options.confirm !== plan.confirmation) throw new Error(`confirmation_required:${plan.confirmation}`)
  if (plan.missingSecrets.length) throw new Error(`missing_secrets:${plan.missingSecrets.join(',')}`)

  const sourceClean = options.sourceClean === undefined
    ? await isSourceClean(sourceDirectory, { run: options.sourceStatusRun })
    : Boolean(options.sourceClean)
  if (!sourceClean && options.allowDirtySource !== true) throw new Error('source_tree_not_clean')

  const resolved = resolveProvisionEnvironment(manifestInput, env, { randomBytes: options.randomBytes })
  const dataSpine = await (options.verifyDataSpine || verifyClientDataSpine)(resolved)
  const run = options.run || defaultRunner
  let tempDirectory
  try {
    tempDirectory = await prepareSource(sourceDirectory, plan.cron.expression, { tempRoot: options.tempRoot })
    const inspect = await run(['vercel', 'project', 'inspect', plan.projectName, '--scope', scope, '--yes'], { cwd: tempDirectory })
    const exists = inspect.code === 0
    if (!exists && !projectDoesNotExist(inspect, plan.projectName)) throw new Error('vercel_project_inspection_failed')
    if (exists && options.allowExisting !== true) throw new Error('project_already_exists')
    if (!exists) {
      await requireSuccess(run, ['vercel', 'project', 'add', plan.projectName, '--scope', scope], {
        cwd: tempDirectory,
        reason: 'vercel_project_create_failed',
      })
    }
    await requireSuccess(run, ['vercel', 'link', '--yes', '--team', scope, '--project', plan.projectName, '--cwd', tempDirectory], {
      cwd: tempDirectory,
      reason: 'vercel_project_link_failed',
    })

    for (const [name, value] of resolved.variables) await addEnvironmentVariable(run, tempDirectory, scope, name, value, false)
    for (const [name, value] of resolved.secrets) await addEnvironmentVariable(run, tempDirectory, scope, name, value, true)

    const deployment = await requireSuccess(run, [
      'vercel', 'deploy', '--prod', '--yes', '--scope', scope, '--cwd', tempDirectory, '--project', plan.projectName,
    ], { cwd: tempDirectory, reason: 'vercel_deploy_failed' })
    const deploymentUrl = deploymentUrlFrom(`${deployment.stdout}\n${deployment.stderr}`)
    if (!deploymentUrl) throw new Error('vercel_deployment_url_missing')
    const verification = await (options.verify || verifyProvisionedClient)(deploymentUrl, {
      opsKey: resolved.secrets.get('SUPERMEGA_OPS_KEY'),
      workcells: resolved.manifest.workcells,
    })
    return {
      ok: true,
      projectName: plan.projectName,
      scope,
      deploymentUrl,
      workcells: [...resolved.manifest.workcells],
      variablesApplied: plan.variableNames,
      secretsApplied: plan.secretNames,
      dataSpine,
      verification,
    }
  } finally {
    if (tempDirectory && options.keepTemp !== true) await rm(tempDirectory, { recursive: true, force: true })
  }
}

export default {
  validateClientManifest,
  requiredSecretGroups,
  resolveProvisionEnvironment,
  buildProvisionPlan,
  applyProvisionPlan,
  verifyProvisionedClient,
  verifyClientDataSpine,
  isSourceClean,
}
