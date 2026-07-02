const crypto = require('crypto')
const datastore = require('./lib/supermega-datastore')

const defaultAllowedOrigins = 'https://supermega.dev,https://www.supermega.dev'
const rateLimitWindowMs = Number(process.env.SUPERMEGA_BEHAVIOR_RATE_WINDOW_MS || 15 * 60 * 1000)
const rateLimitMax = Number(process.env.SUPERMEGA_BEHAVIOR_RATE_MAX || 120)
const rateStore = globalThis.__supermegaBehaviorEventRateStore || new Map()
globalThis.__supermegaBehaviorEventRateStore = rateStore

const allowedEventTypes = new Set([
  'page_viewed',
  'cta_clicked',
  'template_clicked',
  'setup_started',
  'lead_form_submitted',
])

function json(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

function safeEqual(a, b) {
  const aHash = crypto.createHash('sha256').update(String(a || '')).digest()
  const bHash = crypto.createHash('sha256').update(String(b || '')).digest()
  return crypto.timingSafeEqual(aHash, bHash)
}

function text(value) {
  return String(value || '').trim()
}

function truncate(value, maxLength) {
  const normalized = text(value)
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized
}

function envText(...names) {
  for (const name of names) {
    const value = text(process.env[name])
    if (value) return value
  }
  return ''
}

function allowedOrigins() {
  return String(process.env.SUPERMEGA_ALLOWED_ORIGINS || defaultAllowedOrigins)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

function isAllowedOrigin(origin) {
  const normalized = text(origin)
  if (!normalized) return true
  try {
    const url = new URL(normalized)
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true
    if (url.hostname.endsWith('.vercel.app')) return true
  } catch {
    return false
  }
  return allowedOrigins().includes(normalized)
}

function cors(req, res) {
  const origin = text(req.headers.origin)
  if (isAllowedOrigin(origin) && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://supermega.dev')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 40000) {
        reject(new Error('request_too_large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (!raw.trim()) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('invalid_json'))
      }
    })
    req.on('error', reject)
  })
}

function clientIp(req) {
  return text(req.headers['x-forwarded-for']).split(',')[0].trim() || text(req.socket?.remoteAddress) || 'unknown'
}

function checkRateLimit(req) {
  const now = Date.now()
  const key = clientIp(req)
  const entries = (rateStore.get(key) || []).filter((timestamp) => now - timestamp < rateLimitWindowMs)
  entries.push(now)
  rateStore.set(key, entries)
  return entries.length <= rateLimitMax
}

function requestUrl(req) {
  return new URL(req.url || '/api/behavior-events', 'https://supermega.dev')
}

function summaryRequested(req) {
  const url = requestUrl(req)
  return url.searchParams.get('summary') === '1' || url.searchParams.get('summary') === 'true'
}

function requireOpsAuth(req) {
  const opsKey = text(process.env.SUPERMEGA_OPS_KEY)
  if (!opsKey) return { ok: false, code: 503, reason: 'auth_not_configured' }
  const authHeader = req.headers.authorization || req.headers.Authorization || ''
  const provided = String(authHeader).startsWith('Bearer ') ? String(authHeader).slice(7) : ''
  if (!provided || !safeEqual(provided, opsKey)) return { ok: false, code: 401, reason: 'unauthorized' }
  return { ok: true }
}

function supabaseConfig() {
  return {
    url: envText('SUPABASE_URL', 'DATABASE_URL_SUPABASE_URL', 'DATABASE_URL_SUPERMEGA_DATABASE_URLSUPABASE_URL').replace(/\/$/, ''),
    serviceRoleKey: envText('SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL_SUPABASE_SERVICE_ROLE_KEY'),
  }
}

function countValue(result) {
  return Number(result?.rows?.[0]?.count || 0)
}

function buildBehaviorRecord({ payload, req }) {
  return {
    event_id: `BEHAV-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
    event_type: truncate(payload.event_type, 80),
    page_path: truncate(payload.page_path, 300),
    template_id: truncate(payload.template_id, 160),
    requested_package: truncate(payload.requested_package, 160),
    component: truncate(payload.component, 160),
    cta_text: truncate(payload.cta_text, 160),
    source_url: truncate(payload.source_url, 500),
    referrer: truncate(payload.referrer, 500),
    utm_source: truncate(payload.utm_source, 120),
    utm_medium: truncate(payload.utm_medium, 120),
    utm_campaign: truncate(payload.utm_campaign, 180),
    utm_content: truncate(payload.utm_content, 180),
    utm_term: truncate(payload.utm_term, 180),
    session_hint: truncate(payload.session_hint, 160),
    user_agent: truncate(req.headers['user-agent'], 500),
    ip_hint: clientIp(req),
    recorded_at: new Date().toISOString(),
    raw: {
      privacy: 'coarse_first_party_event_no_keystrokes_no_source_files_no_credentials',
      has_template_id: Boolean(text(payload.template_id)),
      has_campaign: Boolean(text(payload.utm_campaign)),
    },
  }
}

async function saveBehaviorEvent(record) {
  const primary = await savePostgresBehaviorEvent(record)
  if (primary.status === 'ready') return primary
  const fallback = await saveSupabaseBehaviorEvent(record)
  if (fallback.status === 'ready') {
    return {
      status: 'ready',
      table: 'supermega_behavior_events',
      primary_database: primary,
      fallback_database: fallback,
      note: 'saved_to_supabase_fallback',
    }
  }
  return {
    status: 'degraded',
    table: 'supermega_behavior_events',
    primary_database: primary,
    fallback_database: fallback,
    hint: 'create_supermega_behavior_events_table',
  }
}

async function savePostgresBehaviorEvent(record) {
  if (!datastore.postgresConfigured()) {
    return { status: 'skipped', reason: 'postgres_not_configured', table: 'supermega_behavior_events', adapter: 'vercel_postgres_neon' }
  }
  const result = await datastore.query(
    `
      insert into public.supermega_behavior_events (
        event_id, event_type, page_path, template_id, requested_package,
        component, cta_text, source_url, referrer, utm_source, utm_medium,
        utm_campaign, utm_content, utm_term, session_hint, user_agent,
        ip_hint, recorded_at, raw
      )
      values (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16,
        $17, $18::timestamptz, $19::jsonb
      )
      on conflict (event_id) do nothing
    `,
    [
      record.event_id,
      record.event_type,
      record.page_path,
      record.template_id,
      record.requested_package,
      record.component,
      record.cta_text,
      record.source_url,
      record.referrer,
      record.utm_source,
      record.utm_medium,
      record.utm_campaign,
      record.utm_content,
      record.utm_term,
      record.session_hint,
      record.user_agent,
      record.ip_hint,
      record.recorded_at,
      JSON.stringify(record.raw || {}),
    ],
  )
  return {
    ...result,
    table: 'supermega_behavior_events',
    adapter: 'vercel_postgres_neon',
    provider: 'vercel_postgres_neon',
  }
}

async function saveSupabaseBehaviorEvent(record) {
  const config = supabaseConfig()
  if (!config.url || !config.serviceRoleKey) {
    return { status: 'skipped', reason: 'supabase_not_configured', table: 'supermega_behavior_events' }
  }

  try {
    const response = await fetch(`${config.url}/rest/v1/supermega_behavior_events`, {
      method: 'POST',
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(record),
    })

    if (response.ok) {
      return { status: 'ready', code: response.status, table: 'supermega_behavior_events' }
    }

    return {
      status: 'error',
      reason: `supabase_${response.status}`,
      table: 'supermega_behavior_events',
      hint: 'create_supermega_behavior_events_table',
    }
  } catch (error) {
    return { status: 'error', reason: error.message || 'supabase_failed', table: 'supermega_behavior_events' }
  }
}

function behaviorSummaryDegraded(reason, detail = {}) {
  return {
    status: 'ready',
    endpoint: 'behavior-events',
    behavior_summary: {
      status: 'degraded',
      source: 'vercel_postgres_neon',
      reason,
      generated_at: new Date().toISOString(),
      events_24h: 0,
      events_7d: 0,
      event_counts: [],
      top_templates: [],
      recent_events: [],
      adaptation_queue: [{
        priority: 'medium',
        signal: reason,
        recommended_next_step: 'Create the behavior events table in Vercel Postgres/Neon, then reload this console.',
        owner_gate: 'operator_only_no_public_signal_leak',
      }],
      privacy: 'operator_summary_no_ip_user_agent_or_raw_payloads',
      ...detail,
    },
  }
}

function buildAdaptationQueue(topTemplates, eventCounts) {
  if (!topTemplates.length) {
    return [{
      priority: 'medium',
      signal: 'no_behavior_signal_yet',
      recommended_next_step: 'Drive traffic to /ai-agents/ and one template setup page, then watch which worker receives the first setup_started signal.',
      owner_gate: 'no_external_send_or_connector_write_without_owner_approval',
    }]
  }
  const leadForms = Number((eventCounts.find((event) => event.event_type === 'lead_form_submitted') || {}).count || 0)
  return topTemplates.slice(0, 5).map((row, index) => {
    const setupStarts = Number(row.setup_starts || 0)
    const templateClicks = Number(row.template_clicks || 0)
    const leadSubmits = Number(row.lead_form_submits || 0)
    const templateId = text(row.template_id || 'unknown-template')
    let priority = index === 0 ? 'high' : 'medium'
    let signal = 'template_interest'
    let recommendedNextStep = `Add a clearer first-proof example and source-pack ask for ${templateId}.`
    if (leadSubmits > 0 || leadForms > 0) {
      priority = 'critical'
      signal = 'lead_form_submitted'
      recommendedNextStep = `Open the lead queue and prepare the first-proof source request for ${templateId}.`
    } else if (setupStarts > 0) {
      signal = 'setup_started'
      recommendedNextStep = `Prepare a short follow-up offer and sample source checklist for ${templateId}.`
    } else if (templateClicks > 1) {
      signal = 'repeat_template_clicks'
      recommendedNextStep = `Move ${templateId} higher in the worker gallery and add a buyer-specific proof card.`
    }
    return {
      priority,
      signal,
      template_id: templateId,
      event_count: Number(row.count || 0),
      setup_starts: setupStarts,
      template_clicks: templateClicks,
      lead_form_submits: leadSubmits,
      recommended_next_step: recommendedNextStep,
      owner_gate: 'no_external_send_or_connector_write_without_owner_approval',
    }
  })
}

async function behaviorSummary() {
  if (!datastore.postgresConfigured()) return behaviorSummaryDegraded('postgres_not_configured')

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const checks = await Promise.all([
    datastore.query('select count(*)::int as count from public.supermega_behavior_events where recorded_at >= $1::timestamptz', [since24h]),
    datastore.query('select count(*)::int as count from public.supermega_behavior_events where recorded_at >= $1::timestamptz', [since7d]),
    datastore.query(
      `
        select event_type, count(*)::int as count, max(recorded_at) as last_recorded_at
        from public.supermega_behavior_events
        where recorded_at >= $1::timestamptz
        group by event_type
        order by count desc, last_recorded_at desc
      `,
      [since7d],
    ),
    datastore.query(
      `
        select
          nullif(template_id, '') as template_id,
          count(*)::int as count,
          count(*) filter (where event_type = 'setup_started')::int as setup_starts,
          count(*) filter (where event_type = 'template_clicked')::int as template_clicks,
          count(*) filter (where event_type = 'lead_form_submitted')::int as lead_form_submits,
          max(recorded_at) as last_recorded_at
        from public.supermega_behavior_events
        where recorded_at >= $1::timestamptz
          and nullif(template_id, '') is not null
        group by nullif(template_id, '')
        order by count desc, last_recorded_at desc
        limit 6
      `,
      [since7d],
    ),
    datastore.query(
      `
        select event_id, event_type, page_path, template_id, requested_package,
          component, cta_text, utm_campaign, recorded_at
        from public.supermega_behavior_events
        order by recorded_at desc
        limit 8
      `,
    ),
  ])

  const blocked = checks.find((result) => result.status !== 'ready')
  if (blocked) {
    return behaviorSummaryDegraded(blocked.reason || 'behavior_summary_query_failed', {
      detail: blocked.code || blocked.detail || null,
    })
  }

  const eventCounts = checks[2].rows || []
  const topTemplates = checks[3].rows || []
  return {
    status: 'ready',
    endpoint: 'behavior-events',
    behavior_summary: {
      status: 'ready',
      source: 'vercel_postgres_neon',
      adapter: 'pg',
      generated_at: new Date().toISOString(),
      window: { since_24h: since24h, since_7d: since7d },
      events_24h: countValue(checks[0]),
      events_7d: countValue(checks[1]),
      event_counts: eventCounts,
      top_templates: topTemplates,
      recent_events: checks[4].rows || [],
      adaptation_queue: buildAdaptationQueue(topTemplates, eventCounts),
      privacy: 'operator_summary_no_ip_user_agent_or_raw_payloads',
    },
  }
}

module.exports = async function handler(req, res) {
  cors(req, res)

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (!isAllowedOrigin(req.headers.origin)) {
    json(res, 403, { status: 'error', reason: 'origin_not_allowed' })
    return
  }

  if (req.method === 'GET') {
    if (summaryRequested(req)) {
      const auth = requireOpsAuth(req)
      if (!auth.ok) {
        json(res, auth.code, { status: 'error', reason: auth.reason })
        return
      }
      json(res, 200, await behaviorSummary())
      return
    }
    json(res, 200, {
      status: 'ready',
      endpoint: 'behavior-events',
      allowed_events: Array.from(allowedEventTypes),
      privacy: 'coarse_first_party_events_only',
      summary_endpoint: '/api/behavior-events?summary=1',
      summary_auth: 'SUPERMEGA_OPS_KEY bearer token required',
    })
    return
  }

  if (req.method !== 'POST') {
    json(res, 405, { status: 'error', reason: 'method_not_allowed' })
    return
  }

  if (!checkRateLimit(req)) {
    json(res, 429, { status: 'error', reason: 'rate_limited' })
    return
  }

  let payload = {}
  try {
    payload = await readBody(req)
  } catch (error) {
    json(res, 400, { status: 'error', reason: error.message || 'invalid_request' })
    return
  }

  const eventType = text(payload.event_type)
  if (!allowedEventTypes.has(eventType)) {
    json(res, 400, { status: 'error', reason: 'invalid_event_type', allowed_events: Array.from(allowedEventTypes) })
    return
  }

  const record = buildBehaviorRecord({ payload: { ...payload, event_type: eventType }, req })
  const ledger = await saveBehaviorEvent(record)

  json(res, 200, {
    status: 'ready',
    message: 'Behavior event captured.',
    event: {
      event_id: record.event_id,
      event_type: record.event_type,
      page_path: record.page_path,
      template_id: record.template_id,
      recorded_at: record.recorded_at,
    },
    ledger,
  })
}
