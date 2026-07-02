import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'

const { Client } = pg
const rootDir = process.cwd()
const positionalBaseUrl = process.argv.slice(2).find((arg) => !arg.startsWith('--'))
const baseUrl = (positionalBaseUrl || process.env.SUPERMEGA_PUBLIC_BASE_URL || 'https://supermega.dev').replace(/\/$/, '')
const maxAttempts = Number(process.env.SUPERMEGA_PUBLIC_AUDIT_ATTEMPTS || 8)
const envFileArg = process.argv.find((arg) => arg.startsWith('--env-file='))?.split('=').slice(1).join('=')
const requireDatabase = process.env.SUPERMEGA_REQUIRE_BEHAVIOR_DB === '1'
const expectedEvents = ['page_viewed', 'cta_clicked', 'template_clicked', 'setup_started', 'lead_form_submitted']

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithRetry(url, options = {}) {
  let lastError = null
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(Number(process.env.SUPERMEGA_PUBLIC_AUDIT_TIMEOUT_MS || 45000)),
      })
      if (![408, 425, 429, 500, 502, 503, 504].includes(response.status) || attempt === maxAttempts) return response
      await response.arrayBuffer().catch(() => undefined)
      lastError = new Error(`retryable_status_${response.status}`)
    } catch (error) {
      lastError = error
      if (attempt === maxAttempts) throw error
    }
    await sleep(1500 * attempt)
  }
  throw lastError || new Error('fetch_failed')
}

function fail(reason, extra = {}) {
  console.error(JSON.stringify({ status: 'error', reason, ...extra }, null, 2))
  process.exit(1)
}

function readRequired(path) {
  const absolutePath = resolve(rootDir, path)
  if (!existsSync(absolutePath)) fail('missing_file', { path })
  return readFileSync(absolutePath, 'utf8')
}

function parseEnvFile(path) {
  if (!path || !existsSync(path)) return {}
  const env = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index === -1) continue
    let value = trimmed.slice(index + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[trimmed.slice(0, index).trim()] = value.replace(/\\n/g, '\n')
  }
  return env
}

function firstEnv(env, ...names) {
  for (const name of names) {
    const value = String(env[name] || process.env[name] || '').trim()
    if (value) return value
  }
  return ''
}

function defaultEnvFiles() {
  return [
    envFileArg,
    resolve(rootDir, '.vercel/public.env.production.local'),
    resolve(rootDir, '.vercel/.env.production.local'),
    resolve(rootDir, '.env.production.local'),
  ].filter(Boolean)
}

function mergedEnv() {
  return defaultEnvFiles().reduce((acc, file) => ({ ...acc, ...parseEnvFile(file) }), {})
}

function stripSslMode(connectionString) {
  try {
    const url = new URL(connectionString)
    url.searchParams.delete('sslmode')
    return url.toString()
  } catch {
    return connectionString
  }
}

async function auditDatabase(env) {
  const connectionString = firstEnv(
    env,
    'POSTGRES_URL_NON_POOLING',
    'POSTGRES_URL',
    'DATABASE_URL_UNPOOLED',
    'DATABASE_URL_POSTGRES_URL_NON_POOLING',
    'DATABASE_URL_POSTGRES_URL',
    'DATABASE_URL_POSTGRES_PRISMA_URL',
    'POSTGRES_PRISMA_URL',
    'SUPERMEGA_DATABASE_URL',
    'DATABASE_URL',
  )

  if (!/^postgres(?:ql)?:\/\//i.test(connectionString)) {
    return { status: requireDatabase ? 'blocked' : 'skipped', reason: 'postgres_connection_env_missing' }
  }

  const client = new Client({
    connectionString: stripSslMode(connectionString),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: Number(process.env.SUPERMEGA_BEHAVIOR_DB_TIMEOUT_MS || 10000),
  })
  try {
    await client.connect()
    const table = await client.query("select to_regclass('public.supermega_behavior_events') as table_name")
    const indexes = await client.query("select count(*)::int as count from pg_indexes where schemaname = 'public' and tablename = 'supermega_behavior_events'")
    const recent = await client.query("select count(*)::int as count from public.supermega_behavior_events where recorded_at >= now() - interval '7 days'")
    const tableName = table.rows[0]?.table_name || null
    return {
      status: tableName === 'supermega_behavior_events' ? 'ready' : 'blocked',
      table: tableName,
      index_count: Number(indexes.rows[0]?.count || 0),
      recent_7d_count: Number(recent.rows[0]?.count || 0),
      provider: 'vercel_postgres_neon',
      adapter: 'pg',
    }
  } catch (error) {
    return { status: 'blocked', reason: error instanceof Error ? error.message : String(error), code: error?.code || null }
  } finally {
    await client.end().catch(() => undefined)
  }
}

const apiSource = readRequired('api/behavior-events.js')
const schemaSource = readRequired('docs/supabase/supermega_behavior_events.sql')

for (const token of [
  "require('./lib/supermega-datastore')",
  'savePostgresBehaviorEvent',
  'saveSupabaseBehaviorEvent',
  'behaviorSummary',
  'buildAdaptationQueue',
  'buildSellableToolRecommendations',
  'sellable_tool_recommendations',
  'free_core_tool',
  'premium_upgrade',
  'proof_metric',
  'requireOpsAuth',
  'operator_summary_no_ip_user_agent_or_raw_payloads',
]) {
  if (!apiSource.includes(token)) fail('api_contract_missing_token', { token })
}

for (const token of [
  'create table if not exists public.supermega_behavior_events',
  'event_id text primary key',
  'raw jsonb not null',
  'supermega_behavior_events_recorded_idx',
  'enable row level security',
  "notify pgrst, 'reload schema'",
]) {
  if (!schemaSource.toLowerCase().includes(token.toLowerCase())) fail('schema_contract_missing_token', { token })
}

const outputFunctionPath = resolve(rootDir, '.vercel/output/functions/api/behavior-events.js.func/api/behavior-events.js')
const outputContract = existsSync(outputFunctionPath)
  ? {
      status: readFileSync(outputFunctionPath, 'utf8').includes('behaviorSummary') ? 'ready' : 'blocked',
      path: '.vercel/output/functions/api/behavior-events.js.func/api/behavior-events.js',
    }
  : { status: 'skipped', reason: 'vercel_output_not_generated' }

let live = { status: 'skipped', reason: 'live_audit_disabled' }
let summaryPrivacy = { status: 'skipped', reason: 'live_audit_disabled' }
if (process.env.SUPERMEGA_SKIP_LIVE_AUDIT !== '1') {
  try {
    const response = await fetchWithRetry(`${baseUrl}/api/behavior-events/status`, {
      headers: { accept: 'application/json', 'user-agent': 'supermega-behavior-events-audit/1.0' },
      redirect: 'follow',
    })
    const body = await response.text()
    if (!response.ok) {
      live = { status: 'blocked', code: response.status }
    } else {
      const parsed = JSON.parse(body)
      const missingEvents = expectedEvents.filter((eventType) => !parsed.allowed_events?.includes(eventType))
      live = {
        status: parsed.status === 'ready' && missingEvents.length === 0 ? 'ready' : 'blocked',
        code: response.status,
        endpoint: parsed.endpoint,
        allowed_events: parsed.allowed_events || [],
        missing_events: missingEvents,
        privacy: parsed.privacy,
        summary_endpoint: parsed.summary_endpoint,
        summary_auth: parsed.summary_auth,
      }
    }
  } catch (error) {
    live = { status: 'blocked', reason: error instanceof Error ? error.message : String(error) }
  }

  try {
    const response = await fetchWithRetry(`${baseUrl}/api/behavior-events?summary=1`, {
      headers: { accept: 'application/json', 'user-agent': 'supermega-behavior-events-audit/1.0' },
      redirect: 'follow',
    })
    const body = await response.text().catch(() => '')
    summaryPrivacy = {
      status: response.status === 401 ? 'ready' : 'blocked',
      code: response.status,
      expected: 'unauthenticated_summary_returns_401',
      body_excerpt: response.status === 401 ? '' : body.slice(0, 120),
    }
  } catch (error) {
    summaryPrivacy = { status: 'blocked', reason: error instanceof Error ? error.message : String(error) }
  }
}

const database = await auditDatabase(mergedEnv())
const status =
  live.status === 'blocked' ||
  summaryPrivacy.status === 'blocked' ||
  outputContract.status === 'blocked' ||
  database.status === 'blocked'
    ? 'blocked'
    : 'ready'

console.log(
  JSON.stringify(
    {
      status,
      base_url: baseUrl,
      local_contract: 'ready',
      schema: 'docs/supabase/supermega_behavior_events.sql',
      output_contract: outputContract,
      live,
      summary_privacy: summaryPrivacy,
      database,
      note: 'No-write audit for first-party behavior monitoring. Public capture is open to allowed origins; behavior summaries are private and aggregate only.',
    },
    null,
    2,
  ),
)

if (status === 'blocked') process.exit(1)
