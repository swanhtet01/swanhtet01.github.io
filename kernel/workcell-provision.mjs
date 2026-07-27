// Controlled client workcell provisioner.
// Plan mode is pure. Apply mode creates one isolated Vercel project, supplies secrets only over
// stdin, deploys a clean kernel copy, and verifies the protected workcell catalog before success.

import { randomBytes, randomUUID } from 'node:crypto'
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
const SCHEMA_BOOTSTRAP_INPUT = 'SUPERMEGA_NEW_CLIENT_SUPABASE_DB_URL'
const WORKCELL_DATA_TABLES = [
  ['supermega_console_activity', 'id,kind,summary,at'],
  ['supermega_token_ledger', 'tenant_id,window,in_tokens,out_tokens,calls,updated_at'],
  ['supermega_ai_budget_reservations', 'reservation_id,window,reserved_units,actual_units,status,tenant_id,tier,provider,created_at,settled_at'],
  ['supermega_ai_cache', 'cache_key,payload,created_at'],
  ['supermega_action_queue', 'id,client_id,action_type,title,payload,payload_hash,source,status,version,approved_by,approved_at,rejected_by,rejected_at,executing_at,lease_expires_at,attempts,provider_ref,result,last_error,executed_at,created_at,updated_at'],
  ['supermega_owner_evidence', 'id,source,source_ref,occurred_at,text,reviewed_by,reviewed_at,fingerprint,created_at'],
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

  const clickupRequired = workcells.some((slug) => slug === 'pipeline-control')
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
  return manifest.workcells.some((slug) => {
    const definition = getWorkcell(slug)
    return definition?.requiredConnectors.includes(connector)
      || Boolean(manifest.clickupListId && definition?.optionalConnectors?.includes(connector))
  })
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
    ['SUPERMEGA_COMPANY_DAILY_AI_BUDGET_UNITS', String(Math.min(manifest.tokenCap, 500_000))],
  ])
  if (manifest.clickupListId) variables.set('WORKCELL_CLICKUP_LIST_ID', manifest.clickupListId)
  if (manifest.workcells.includes('owner-command')) variables.set('WORKCELL_OWNER_EVIDENCE_ENABLED', 'true')
  return { manifest, variables, secrets, missingSecrets, missingSecretInputs }
}

function supabaseProjectRef(rawUrl) {
  try {
    const parsed = new URL(rawUrl)
    const suffix = '.supabase.co'
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname.endsWith(suffix)) throw new Error('invalid')
    const projectRef = parsed.hostname.slice(0, -suffix.length)
    if (!/^[a-z0-9][a-z0-9-]{2,62}[a-z0-9]$/.test(projectRef) || projectRef.includes('.')) throw new Error('invalid')
    return projectRef
  } catch {
    throw new Error('client_schema_bootstrap_supabase_url_invalid')
  }
}

export function resolveSchemaBootstrapEnvironment(resolvedInput, env = process.env) {
  const resolved = resolvedInput?.secrets instanceof Map
    ? resolvedInput
    : resolveProvisionEnvironment(resolvedInput, env)
  let rawInput
  try { rawInput = String(env[SCHEMA_BOOTSTRAP_INPUT] ?? '') } catch { throw new Error('client_schema_bootstrap_url_invalid') }
  if (rawInput.length > 4_096 || SECRET_LINE_BREAK_RE.test(rawInput) || CONTROL_CHARACTER_RE.test(rawInput)) {
    throw new Error('client_schema_bootstrap_url_invalid')
  }
  const raw = rawInput.trim()
  const supabaseUrl = resolved.secrets.get('SUPABASE_URL')
  if (!supabaseUrl) {
    if (raw) throw new Error('client_schema_bootstrap_supabase_url_invalid')
    return { provided: false, inputName: SCHEMA_BOOTSTRAP_INPUT, projectRef: null, connectionMode: null }
  }
  const projectRef = supabaseProjectRef(supabaseUrl)
  if (!raw) return { provided: false, inputName: SCHEMA_BOOTSTRAP_INPUT, projectRef, connectionMode: null }
  let parsed
  try { parsed = new URL(raw) } catch { throw new Error('client_schema_bootstrap_url_invalid') }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.username || !parsed.password) {
    throw new Error('client_schema_bootstrap_url_invalid')
  }
  if (parsed.port !== '5432') throw new Error('client_schema_bootstrap_requires_port_5432')
  if (parsed.pathname !== '/postgres') throw new Error('client_schema_bootstrap_database_must_be_postgres')
  const requestedSslMode = parsed.searchParams.get('sslmode')
  if (requestedSslMode === 'disable') throw new Error('client_schema_bootstrap_ssl_required')
  if (requestedSslMode && requestedSslMode !== 'require') throw new Error('client_schema_bootstrap_ssl_mode_unsupported')

  const direct = parsed.hostname === `db.${projectRef}.supabase.co` && parsed.username === 'postgres'
  const sessionPooler = parsed.hostname.endsWith('.pooler.supabase.com') && parsed.username === `postgres.${projectRef}`
  if (!direct && !sessionPooler) throw new Error('client_schema_bootstrap_project_mismatch')
  parsed.searchParams.delete('sslmode')
  return {
    provided: true,
    inputName: SCHEMA_BOOTSTRAP_INPUT,
    projectRef,
    connectionMode: direct ? 'direct' : 'session_pooler',
    connectionString: parsed.toString(),
    tlsMode: 'require',
  }
}

export function buildProvisionPlan(manifestInput, options = {}) {
  const scope = text(options.scope || process.env.VERCEL_SCOPE, 120)
  if (!VERCEL_SCOPE_RE.test(scope)) throw new Error('vercel_scope_required')
  const resolved = resolveProvisionEnvironment(manifestInput, options.env || process.env, options)
  const schemaBootstrap = resolveSchemaBootstrapEnvironment(resolved, options.env || process.env)
  const requiredSecretInputs = requiredSecretGroups(resolved.manifest)
    .map((group) => group.sources.map((source) => source.name).join('|'))
  requiredSecretInputs.push('SUPERMEGA_NEW_CLIENT_CRON_SECRET (optional; generated when absent)')
  requiredSecretInputs.push(`${SCHEMA_BOOTSTRAP_INPUT} (conditional; bootstrap-only when schema is not pre-applied)`)
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
    schemaBootstrap: {
      inputName: schemaBootstrap.inputName,
      supplied: schemaBootstrap.provided,
      targetProjectRef: schemaBootstrap.projectRef,
      connectionMode: schemaBootstrap.connectionMode,
      tlsMode: schemaBootstrap.provided ? schemaBootstrap.tlsMode : null,
      deployedToVercel: false,
    },
    sourceDirectory: options.sourceDirectory ? resolve(options.sourceDirectory) : null,
  }
}

export async function applyClientSchema(resolvedInput, options = {}) {
  const env = options.env || process.env
  const bootstrap = options.bootstrap || resolveSchemaBootstrapEnvironment(resolvedInput, env)
  if (!bootstrap.provided) {
    return { requested: false, applied: false, projectRef: bootstrap.projectRef, connectionMode: null }
  }
  let client
  try {
    const clientFactory = options.clientFactory || (async (config) => {
      const pgmod = (await import('pg')).default
      return new pgmod.Client(config)
    })
    client = await clientFactory({
      connectionString: bootstrap.connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15_000,
      query_timeout: 30_000,
      statement_timeout: 30_000,
      application_name: 'supermega-workcell-bootstrap',
    })
    await client.connect()
    const sql = await readFile(new URL('./supabase/workcell-client.sql', import.meta.url), 'utf8')
    await client.query(sql)
    return {
      requested: true,
      applied: true,
      projectRef: bootstrap.projectRef,
      connectionMode: bootstrap.connectionMode,
    }
  } catch {
    try { await client?.query('rollback') } catch { /* best effort after an aborted transaction */ }
    throw new Error('client_schema_bootstrap_failed')
  } finally {
    try { await client?.end() } catch { /* connection is disposable */ }
  }
}

async function proveClientDataSpine(resolved, options = {}) {
  const verify = options.verify || verifyClientDataSpine
  const attempts = options.schemaApplied ? 5 : 1
  const sleep = options.sleep || ((milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)))
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await verify(resolved) } catch (error) {
      lastError = error
      const schemaVisibilityDelay = String(error?.message || '').startsWith('client_data_spine_schema_missing:')
      if (!schemaVisibilityDelay || attempt === attempts) throw error
      await sleep(1_000)
    }
  }
  throw lastError
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

  const budgetWindow = '1970-01-01'
  const budgetIds = [`${probeId}:ai-1`, `${probeId}:ai-2`]
  const budgetRpcUrl = `${baseUrl}/rest/v1/rpc/supermega_reserve_ai_budget`
  const budgetUsageRpcUrl = `${baseUrl}/rest/v1/rpc/supermega_get_ai_budget_usage`
  let budgetFailure = null
  try {
    const reserve = async (reservationId) => {
      const response = await fetchImpl(budgetRpcUrl, {
        method: 'POST',
        headers: writeHeaders,
        body: JSON.stringify({
          p_reservation_id: reservationId,
          p_window: budgetWindow,
          p_reserved_units: 1,
          p_cap_units: 1,
          p_tenant_id: resolved.manifest.clientId,
          p_tier: 'bulk',
          p_provider: 'provision_probe',
        }),
        signal: AbortSignal.timeout(10_000),
      })
      const rows = await response.json().catch(() => null)
      return { response, row: Array.isArray(rows) ? rows[0] : rows }
    }
    const first = await reserve(budgetIds[0])
    if (!first.response.ok || first.row?.granted !== true || Number(first.row?.used_units) !== 1) {
      throw new Error('client_data_spine_ai_budget_reservation_failed')
    }
    const usageResponse = await fetchImpl(budgetUsageRpcUrl, {
      method: 'POST',
      headers: writeHeaders,
      body: JSON.stringify({ p_window: budgetWindow }),
      signal: AbortSignal.timeout(10_000),
    })
    const usageRows = await usageResponse.json().catch(() => null)
    const usage = Array.isArray(usageRows) ? usageRows[0] : usageRows
    if (!usageResponse.ok
      || Number(usage?.reserved_units) !== 1
      || Number(usage?.attempts) !== 1
      || Number(usage?.in_flight) !== 1
      || Number(usage?.consumed) !== 0
      || Number(usage?.failed) !== 0) {
      throw new Error('client_data_spine_ai_budget_telemetry_failed')
    }
    const overCap = await reserve(budgetIds[1])
    if (!overCap.response.ok || overCap.row?.granted !== false || overCap.row?.reason !== 'company_daily_budget_reached') {
      throw new Error('client_data_spine_ai_budget_not_atomic')
    }
  } catch (error) {
    budgetFailure = error
  }
  const budgetCleanup = await fetchImpl(
    `${baseUrl}/rest/v1/supermega_ai_budget_reservations?reservation_id=in.(${budgetIds.map(encodeURIComponent).join(',')})`,
    { method: 'DELETE', headers: { ...writeHeaders, prefer: 'return=minimal' }, signal: AbortSignal.timeout(10_000) },
  ).catch(() => null)
  if (!budgetCleanup?.ok && !budgetFailure) budgetFailure = new Error('client_data_spine_ai_budget_cleanup_failed')
  if (budgetFailure) throw budgetFailure

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

  const actionId = (options.randomUUID || randomUUID)()
  const actionUrl = `${baseUrl}/rest/v1/supermega_action_queue`
  let actionFailure = null
  try {
    const draft = await fetchImpl(actionUrl, {
      method: 'POST',
      headers: writeHeaders,
      body: JSON.stringify({
        id: actionId,
        client_id: resolved.manifest.clientId,
        action_type: 'clickup.create_task',
        title: 'temporary approval CAS proof',
        payload: { list_id: '1', name: 'temporary proof', marker: `supermega-action:${actionId}` },
        payload_hash: '0'.repeat(64),
        source: { kind: 'provision_probe' },
      }),
      signal: AbortSignal.timeout(10_000),
    })
    const draftRows = await draft.json().catch(() => null)
    if (!draft.ok || !Array.isArray(draftRows) || draftRows.length !== 1 || draftRows[0]?.status !== 'draft' || Number(draftRows[0]?.version) !== 0) {
      throw new Error('client_data_spine_approval_insert_failed')
    }

    const transitionUrl = `${actionUrl}?id=eq.${encodeURIComponent(actionId)}&status=eq.draft&version=eq.0`
    const transitionBody = JSON.stringify({ status: 'approved', version: 1, approved_by: 'provision_probe', approved_at: new Date(0).toISOString() })
    const firstTransition = await fetchImpl(transitionUrl, {
      method: 'PATCH', headers: writeHeaders, body: transitionBody, signal: AbortSignal.timeout(10_000),
    })
    const firstTransitionRows = await firstTransition.json().catch(() => null)
    if (!firstTransition.ok || !Array.isArray(firstTransitionRows) || firstTransitionRows.length !== 1 || firstTransitionRows[0]?.status !== 'approved' || Number(firstTransitionRows[0]?.version) !== 1) {
      throw new Error('client_data_spine_approval_transition_failed')
    }

    const duplicateTransition = await fetchImpl(transitionUrl, {
      method: 'PATCH', headers: writeHeaders, body: transitionBody, signal: AbortSignal.timeout(10_000),
    })
    const duplicateTransitionRows = await duplicateTransition.json().catch(() => null)
    if (!duplicateTransition.ok || !Array.isArray(duplicateTransitionRows) || duplicateTransitionRows.length !== 0) {
      throw new Error('client_data_spine_approval_transition_not_atomic')
    }
  } catch (error) {
    actionFailure = error
  }
  const actionCleanup = await fetchImpl(`${actionUrl}?id=eq.${encodeURIComponent(actionId)}`, {
    method: 'DELETE', headers: { ...writeHeaders, prefer: 'return=minimal' }, signal: AbortSignal.timeout(10_000),
  }).catch(() => null)
  if (!actionCleanup?.ok && !actionFailure) actionFailure = new Error('client_data_spine_approval_cleanup_failed')
  if (actionFailure) throw actionFailure
  return { ok: true, tables, atomicAiBudget: true, aiBudgetTelemetry: true, idempotentClaim: true, approvalCas: true, probeCleaned: true }
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
  const actionWorkcells = new Set(options.actionWorkcells || selectedSlugs.filter((slug) => slug === 'pipeline-control' || slug === 'owner-command'))
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
    const actionExpected = actionWorkcells.has(slug)
    if (actionExpected && (!row.actionDraftSupported || !row.actionDraftReady)) {
      throw new Error(`provision_workcell_action_not_ready:${slug}`)
    }
  }
  const approvalsResponse = await fetchImpl(`${deploymentUrl}/api/approvals`, {
    headers: { 'x-ops-key': opsKey },
    signal: AbortSignal.timeout(15_000),
  })
  const approvals = await approvalsResponse.json().catch(() => null)
  if (!approvalsResponse.ok || !approvals?.ok || !Array.isArray(approvals.approvals)) {
    throw new Error('provision_approval_inbox_check_failed')
  }
  let ownerEvidenceInbox = { required: false, ready: false, count: 0 }
  if (selectedSlugs.includes('owner-command')) {
    const evidenceResponse = await fetchImpl(`${deploymentUrl}/api/owner-evidence`, {
      headers: { 'x-ops-key': opsKey },
      signal: AbortSignal.timeout(15_000),
    })
    const evidence = await evidenceResponse.json().catch(() => null)
    if (!evidenceResponse.ok || !evidence?.ok || evidence.configured !== true || !Array.isArray(evidence.evidence)) {
      throw new Error('provision_owner_evidence_inbox_check_failed')
    }
    ownerEvidenceInbox = { required: true, ready: true, count: Number(evidence.count) || 0 }
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
    approvalInbox: { ready: true, count: approvals.approvals.length },
    ownerEvidenceInbox,
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
  const bootstrap = resolveSchemaBootstrapEnvironment(resolved, env)
  const schemaBootstrap = bootstrap.provided
    ? await (options.applySchema || applyClientSchema)(resolved, { env, bootstrap })
    : { requested: false, applied: false, projectRef: bootstrap.projectRef, connectionMode: null }
  const dataSpine = await proveClientDataSpine(resolved, {
    verify: options.verifyDataSpine,
    schemaApplied: schemaBootstrap.applied,
    sleep: options.sleep,
  })
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
      actionWorkcells: resolved.manifest.clickupListId
        ? resolved.manifest.workcells.filter((slug) => slug === 'pipeline-control' || slug === 'owner-command')
        : [],
    })
    return {
      ok: true,
      projectName: plan.projectName,
      scope,
      deploymentUrl,
      workcells: [...resolved.manifest.workcells],
      variablesApplied: plan.variableNames,
      secretsApplied: plan.secretNames,
      schemaBootstrap,
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
  resolveSchemaBootstrapEnvironment,
  applyClientSchema,
  isSourceClean,
}
