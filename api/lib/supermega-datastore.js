function text(value) {
  return String(value || '').trim()
}

function envText(...names) {
  for (const name of names) {
    const value = text(process.env[name])
    if (value) return value
  }
  return ''
}

function postgresConnectionString() {
  const value = envText(
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
  return /^postgres(?:ql)?:\/\//i.test(value) ? value : ''
}

function postgresConfigured() {
  return Boolean(postgresConnectionString())
}

function datastoreStatus() {
  if (postgresConfigured()) {
    return {
      status: 'configured',
      provider: 'vercel_postgres_neon',
      adapter: 'pg',
      env: 'POSTGRES_URL_or_DATABASE_URL',
      source: 'vercel_marketplace',
    }
  }
  return {
    status: 'not_configured',
    provider: 'vercel_postgres_neon',
    adapter: 'pg',
    env: 'POSTGRES_URL_or_DATABASE_URL',
    source: 'vercel_marketplace',
  }
}

function pgSslConfig(connectionString) {
  // Strict cert verification is opt-in via PG_SSL_STRICT=1. Flipping it blind can break the connection
  // if the provider cert isn't chained to the system roots, so the default preserves existing behavior
  // (no outage risk); enable strict after validating against the live DB. Localhost/sslmode=disable → no SSL.
  const strict = String(process.env.PG_SSL_STRICT || '') === '1'
  try {
    const url = new URL(connectionString)
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return false
    if (url.searchParams.get('sslmode') === 'disable') return false
  } catch {
    return { rejectUnauthorized: strict }
  }
  return { rejectUnauthorized: strict }
}

// Strip sslmode from the connection string URL so pg-connection-string doesn't emit
// its deprecation warning. SSL is controlled via the `ssl` option passed directly
// to the Client constructor; the URL's sslmode param is redundant and triggers a
// noisy "SECURITY WARNING" on every invocation.
function stripSslMode(connectionString) {
  try {
    const url = new URL(connectionString)
    url.searchParams.delete('sslmode')
    return url.toString()
  } catch {
    return connectionString
  }
}

// Pooled Postgres — ONE pool per warm instance. Previously this opened new Client()+connect()+end()
// on EVERY query (a TCP+TLS handshake per call; pipelineSnapshot fired 6 per request → connection
// exhaustion under any concurrency). The pool removes the per-query handshake and bounds connections.
let _pool
let _poolTried = false
function getPool() {
  if (_poolTried) return _pool
  _poolTried = true
  const connectionString = postgresConnectionString()
  if (!connectionString) { _pool = null; return null }
  let Pool
  try { ({ Pool } = require('pg')) } catch { _pool = null; return null }
  _pool = new Pool({
    connectionString: stripSslMode(connectionString),
    ssl: pgSslConfig(connectionString),
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
  })
  _pool.on('error', () => { /* swallow idle-client errors so a dropped backend conn can't crash the fn */ })
  return _pool
}

async function query(sql, params = []) {
  const connectionString = postgresConnectionString()
  if (!connectionString) return { status: 'skipped', reason: 'postgres_not_configured' }
  const pool = getPool()
  if (!pool) return { status: 'error', reason: 'pg_dependency_missing' }
  try {
    const result = await pool.query(sql, params)
    return { status: 'ready', rows: result.rows || [], rowCount: result.rowCount || 0 }
  } catch (error) {
    return { status: 'error', reason: error.message || 'postgres_query_failed', code: error.code || null, detail: error.detail || null }
  }
}

async function saveLeadLedger(payload) {
  const result = await query(
    `
      insert into public.supermega_leads (
        lead_id, task_id, source, name, email, company, workflow, requested_package,
        goal, data, team, source_url, page_path, referrer, utm_source, utm_medium,
        utm_campaign, utm_content, utm_term, lead_score, lead_stage, status, owner,
        next_step, submitted_at, raw
      )
      values (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23,
        $24, $25, $26::jsonb
      )
      on conflict (lead_id) do update set
        task_id = excluded.task_id,
        status = excluded.status,
        owner = excluded.owner,
        next_step = excluded.next_step,
        raw = excluded.raw
    `,
    [
      payload.lead_id,
      payload.task_id,
      payload.source,
      payload.name,
      payload.email,
      payload.company,
      payload.workflow,
      payload.requested_package,
      payload.goal,
      payload.data,
      payload.team,
      payload.source_url,
      payload.page_path,
      payload.referrer,
      payload.utm_source,
      payload.utm_medium,
      payload.utm_campaign,
      payload.utm_content,
      payload.utm_term,
      payload.lead_score,
      payload.lead_stage,
      payload.status,
      payload.owner,
      payload.next_step,
      payload.submitted_at,
      JSON.stringify(payload.raw || {}),
    ],
  )
  return {
    ...result,
    table: 'supermega_leads',
    adapter: 'vercel_postgres_neon',
  }
}

async function savePipelineAction(payload) {
  const result = await query(
    `
      insert into public.supermega_pipeline_actions (
        action_id, lead_id, task_id, run_id, action_type, status, priority, owner,
        title, next_step, due_at, evidence_url, source_url, approval_required,
        approval_state, notification_channel, notification_status, payload
      )
      values (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18::jsonb
      )
      on conflict (action_id) do update set
        status = excluded.status,
        priority = excluded.priority,
        owner = excluded.owner,
        next_step = excluded.next_step,
        approval_state = excluded.approval_state,
        notification_status = excluded.notification_status,
        payload = excluded.payload,
        updated_at = now()
    `,
    [
      payload.action_id,
      payload.lead_id,
      payload.task_id,
      payload.run_id || null,
      payload.action_type,
      payload.status,
      payload.priority,
      payload.owner,
      payload.title,
      payload.next_step,
      payload.due_at,
      payload.evidence_url,
      payload.source_url,
      payload.approval_required,
      payload.approval_state,
      payload.notification_channel,
      payload.notification_status,
      JSON.stringify(payload.payload || {}),
    ],
  )
  return {
    ...result,
    table: 'supermega_pipeline_actions',
    action_id: payload.action_id,
    adapter: 'vercel_postgres_neon',
  }
}

async function saveSalesRun(payload) {
  const result = await query(
    `
      insert into public.supermega_sales_runs (
        run_id, run_type, campaign, status, summary, metrics, payload, generated_at
      )
      values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::timestamptz)
      on conflict (run_id) do update set
        run_type = excluded.run_type,
        campaign = excluded.campaign,
        status = excluded.status,
        summary = excluded.summary,
        metrics = excluded.metrics,
        payload = excluded.payload,
        generated_at = excluded.generated_at
    `,
    [
      payload.run_id,
      payload.run_type,
      payload.campaign,
      payload.status,
      payload.summary,
      JSON.stringify(payload.metrics || {}),
      JSON.stringify(payload.payload || {}),
      payload.generated_at,
    ],
  )
  return {
    ...result,
    table: 'supermega_sales_runs',
    run_id: payload.run_id,
    adapter: 'vercel_postgres_neon',
  }
}

async function latestSalesRun() {
  const result = await query(
    `
      select run_id, generated_at, campaign, status, summary, metrics
      from public.supermega_sales_runs
      order by generated_at desc
      limit 1
    `,
  )
  return {
    ...result,
    table: 'supermega_sales_runs',
    adapter: 'vercel_postgres_neon',
  }
}

function countValue(result) {
  return Number(result?.rows?.[0]?.count || 0)
}

async function pipelineSnapshot({ since24h, since7d }) {
  const checks = await Promise.all([
    query(
      `
        select lead_id, task_id, submitted_at, requested_package, lead_score, lead_stage, status, next_step
        from public.supermega_leads
        order by submitted_at desc nulls last, created_at desc
        limit 5
      `,
    ),
    query(
      `
        select action_id, lead_id, task_id, action_type, status, priority, owner, title, next_step,
          approval_required, approval_state, notification_channel, notification_status, payload, result, created_at
        from public.supermega_pipeline_actions
        order by created_at desc
        limit 8
      `,
    ),
    query("select count(*)::int as count from public.supermega_pipeline_actions where status <> 'done'"),
    query('select count(*)::int as count from public.supermega_leads where submitted_at >= $1::timestamptz', [since24h]),
    query('select count(*)::int as count from public.supermega_leads where submitted_at >= $1::timestamptz', [since7d]),
    query(
      `
        select run_id, generated_at, status, summary
        from public.supermega_sales_runs
        order by generated_at desc
        limit 3
      `,
    ),
  ])

  const blocked = checks.find((result) => result.status !== 'ready')
  if (blocked) {
    return {
      ...blocked,
      adapter: 'vercel_postgres_neon',
      provider: 'vercel_postgres_neon',
    }
  }

  return {
    status: 'ready',
    adapter: 'vercel_postgres_neon',
    provider: 'vercel_postgres_neon',
    latestLeads: checks[0].rows,
    latestActions: checks[1].rows,
    pendingActionCount: countValue(checks[2]),
    lead24hCount: countValue(checks[3]),
    lead7dCount: countValue(checks[4]),
    latestRuns: checks[5].rows,
  }
}

// Lightweight reachability probe for health endpoints (uses the pool + query's bounded timeout).
async function ping() {
  if (!postgresConfigured()) return { ok: true, reachable: false, configured: false, detail: 'no_db_configured' }
  try {
    const r = await query('select 1')
    if (r.status === 'ready') return { ok: true, reachable: true, configured: true }
    return { ok: false, reachable: false, configured: true, detail: r.reason || 'query_failed' }
  } catch (e) {
    return { ok: false, reachable: false, configured: true, detail: String((e && e.message) || 'ping_error').slice(0, 120) }
  }
}

module.exports = {
  datastoreStatus,
  postgresConfigured,
  ping,
  query,
  saveLeadLedger,
  savePipelineAction,
  saveSalesRun,
  latestSalesRun,
  pipelineSnapshot,
}
