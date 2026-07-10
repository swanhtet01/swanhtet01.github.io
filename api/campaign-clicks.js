const crypto = require('crypto')

const defaultAllowedOrigins = 'https://supermega.dev,https://www.supermega.dev'
const defaultDestinationHosts = 'supermega.dev,www.supermega.dev,forms.office.com,calendar.app.google.com'
const rateLimitWindowMs = Number(process.env.SUPERMEGA_CAMPAIGN_RATE_WINDOW_MS || 15 * 60 * 1000)
const rateLimitMax = Number(process.env.SUPERMEGA_CAMPAIGN_RATE_MAX || 60)
const rateStore = globalThis.__supermegaCampaignClickRateStore || new Map()
globalThis.__supermegaCampaignClickRateStore = rateStore

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

function allowedDestinationHosts() {
  return String(process.env.SUPERMEGA_ALLOWED_CAMPAIGN_DESTINATION_HOSTS || defaultDestinationHosts)
    .split(',')
    .map((host) => host.trim().toLowerCase())
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
      if (raw.length > 50000) {
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

function parseDestinationConfig() {
  const raw = text(process.env.SUPERMEGA_CAMPAIGN_DESTINATIONS)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function safeDestination(value, fallback) {
  const candidate = text(value) || fallback
  try {
    const url = new URL(candidate, 'https://supermega.dev')
    if (!['http:', 'https:'].includes(url.protocol)) return fallback
    if (!allowedDestinationHosts().includes(url.hostname.toLowerCase())) return fallback
    return url.toString()
  } catch {
    return fallback
  }
}

function defaultDestination(campaign) {
  const slug = encodeURIComponent(text(campaign) || 'business-card')
  return `https://supermega.dev/contact/?utm_source=business_card&utm_medium=qr&utm_campaign=${slug}&utm_content=front_qr`
}

function resolveDestination(campaign) {
  const slug = text(campaign) || 'business-card'
  const destinations = parseDestinationConfig()
  return safeDestination(destinations[slug], defaultDestination(slug))
}

function supabaseConfig() {
  return {
    url: envText('SUPABASE_URL', 'DATABASE_URL_SUPABASE_URL', 'DATABASE_URL_SUPERMEGA_DATABASE_URLSUPABASE_URL').replace(/\/$/, ''),
    serviceRoleKey: envText('SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL_SUPABASE_SERVICE_ROLE_KEY'),
  }
}

async function saveClickLedger(record) {
  const config = supabaseConfig()
  if (!config.url || !config.serviceRoleKey) {
    return { status: 'skipped', reason: 'supabase_not_configured', table: 'supermega_campaign_clicks' }
  }

  try {
    const response = await fetch(`${config.url}/rest/v1/supermega_campaign_clicks`, {
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
      return { status: 'ready', code: response.status, table: 'supermega_campaign_clicks' }
    }

    return {
      status: 'error',
      reason: `supabase_${response.status}`,
      table: 'supermega_campaign_clicks',
      hint: 'create_supermega_campaign_clicks_table',
    }
  } catch (error) {
    return { status: 'error', reason: error.message || 'supabase_failed', table: 'supermega_campaign_clicks' }
  }
}

function buildClickRecord({ payload, req, destinationUrl }) {
  const campaign = truncate(payload.campaign || payload.utm_campaign || 'business-card', 180)
  return {
    click_id: `CLICK-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
    campaign,
    source: truncate(payload.utm_source || 'business_card', 120),
    medium: truncate(payload.utm_medium || 'qr', 120),
    content: truncate(payload.utm_content || 'front_qr', 180),
    destination_url: truncate(destinationUrl, 500),
    source_url: truncate(payload.source_url, 500),
    page_path: truncate(payload.page_path, 300),
    referrer: truncate(payload.referrer, 500),
    user_agent: truncate(req.headers['user-agent'], 500),
    ip_hint: clientIp(req),
    clicked_at: new Date().toISOString(),
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

  if (!checkRateLimit(req)) {
    json(res, 429, { status: 'error', reason: 'rate_limited' })
    return
  }

  if (req.method === 'GET') {
    const url = new URL(req.url || '/api/campaign-clicks', 'https://supermega.dev')
    const campaign = text(url.searchParams.get('campaign') || url.searchParams.get('utm_campaign') || 'business-card')
    json(res, 200, {
      status: 'ready',
      endpoint: 'campaign-clicks',
      campaign,
      destination_url: resolveDestination(campaign),
    })
    return
  }

  if (req.method !== 'POST') {
    json(res, 405, { status: 'error', reason: 'method_not_allowed' })
    return
  }

  let payload = {}
  try {
    payload = await readBody(req)
  } catch (error) {
    json(res, 400, { status: 'error', reason: error.message || 'invalid_request' })
    return
  }

  const campaign = text(payload.campaign || payload.utm_campaign || 'business-card')
  const destinationUrl = resolveDestination(campaign)
  const record = buildClickRecord({ payload: { ...payload, campaign }, req, destinationUrl })
  const ledger = await saveClickLedger(record)

  json(res, 200, {
    status: 'ready',
    message: 'Campaign click captured.',
    click: record,
    destination_url: destinationUrl,
    ledger,
  })
}
