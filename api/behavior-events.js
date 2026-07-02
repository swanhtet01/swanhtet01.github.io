const crypto = require('crypto')

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
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

function supabaseConfig() {
  return {
    url: envText('SUPABASE_URL', 'DATABASE_URL_SUPABASE_URL', 'DATABASE_URL_SUPERMEGA_DATABASE_URLSUPABASE_URL').replace(/\/$/, ''),
    serviceRoleKey: envText('SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL_SUPABASE_SERVICE_ROLE_KEY'),
  }
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
    json(res, 200, {
      status: 'ready',
      endpoint: 'behavior-events',
      allowed_events: Array.from(allowedEventTypes),
      privacy: 'coarse_first_party_events_only',
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
