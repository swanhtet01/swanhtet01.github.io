// Pipedrive CRM connector. Read-only deal access through the current v2 deals API.
// OAuth access tokens are preferred; a personal API token remains available for one-company setup.

import { register } from './registry.mjs'

const DEALS_BASE = 'https://api.pipedrive.com/api/v2'
const USERS_BASE = 'https://api.pipedrive.com/v1'
const ALLOWED_STATUS = new Set(['open', 'won', 'lost', 'deleted'])

const oauthToken = () => String(process.env.PIPEDRIVE_ACCESS_TOKEN || '').trim()
const apiToken = () => String(process.env.PIPEDRIVE_API_TOKEN || '').trim()
const configured = () => Boolean(oauthToken() || apiToken())

function safeString(value) {
  try { return String(value ?? '').trim() } catch { return '' }
}

function safeCode(value, fallback = 'error') {
  const code = safeString(value).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)
  return code || fallback
}

function read(input, key) {
  try {
    return input && typeof input === 'object' && !Array.isArray(input) ? input[key] : undefined
  } catch {
    return undefined
  }
}

function auth(query) {
  if (oauthToken()) return { headers: { authorization: `Bearer ${oauthToken()}` }, query }
  query.set('api_token', apiToken())
  return { headers: {}, query }
}

async function request(base, path, query = new URLSearchParams()) {
  const authorized = auth(query)
  try {
    const response = await fetch(`${base}${path}?${authorized.query}`, {
      method: 'GET',
      headers: {
        ...authorized.headers,
        accept: 'application/json',
        'user-agent': 'supermega-kernel/1.0',
      },
      signal: AbortSignal.timeout(8_000),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok || data?.success === false) {
      return {
        ok: false,
        status: response.status,
        reason: `crm-pipedrive_http_${response.status}_${safeCode(data?.error_info || data?.error)}`,
      }
    }
    return { ok: true, status: response.status, data }
  } catch {
    return { ok: false, reason: 'crm-pipedrive_transport_error' }
  }
}

export async function listDeals(input = {}) {
  if (!configured()) return { ok: false, reason: 'crm-pipedrive_not_configured' }

  const limitRaw = Number.parseInt(safeString(read(input, 'limit')), 10)
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, limitRaw)) : 100
  const cursor = safeString(read(input, 'cursor'))
  if (cursor.length > 2_048) return { ok: false, reason: 'crm-pipedrive_cursor_too_long' }
  const status = safeString(read(input, 'status')).toLowerCase()
  if (status && !ALLOWED_STATUS.has(status)) return { ok: false, reason: 'crm-pipedrive_invalid_status' }

  const query = new URLSearchParams({ limit: String(limit) })
  if (cursor) query.set('cursor', cursor)
  if (status) query.set('status', status)
  const result = await request(DEALS_BASE, '/deals', query)
  if (!result.ok) return result

  const deals = Array.isArray(result.data?.data) ? result.data.data : []
  return {
    ok: true,
    status: result.status,
    deals,
    nextCursor: safeString(result.data?.additional_data?.next_cursor) || null,
  }
}

export const crmPipedrive = {
  key: 'crm-pipedrive',
  name: 'Pipedrive CRM',
  category: 'data',
  docs: 'kernel/connectors/crm-pipedrive.mjs',
  configured,
  async health() {
    if (!configured()) return { ok: false, detail: 'missing PIPEDRIVE_ACCESS_TOKEN or PIPEDRIVE_API_TOKEN' }
    const result = await request(USERS_BASE, '/users/me')
    return result.ok
      ? { ok: true, detail: 'authenticated user available' }
      : { ok: false, detail: result.reason }
  },
  listDeals,
}

register(crmPipedrive)
export default crmPipedrive
