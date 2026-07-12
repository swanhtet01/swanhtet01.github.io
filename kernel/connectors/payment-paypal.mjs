// PayPal Transaction Search connector. Read-only: it never creates, captures, or refunds money.
// Uses the fixed live PayPal host and caches the OAuth client-credentials token until shortly
// before expiry so repeated agent reads do not mint one token per task.

import { register } from './registry.mjs'

const API_BASE = 'https://api-m.paypal.com'
const MAX_WINDOW_MS = 31 * 24 * 60 * 60 * 1000
const tokenCache = { value: '', expiresAt: 0 }

const clientId = () => String(process.env.PAYPAL_CLIENT_ID || '').trim()
const clientSecret = () => String(process.env.PAYPAL_CLIENT_SECRET || '').trim()
const configured = () => Boolean(clientId() && clientSecret())

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

function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(safeString(value), 10)
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback
}

function internetDate(value) {
  const raw = safeString(value)
  if (!raw || raw.length > 64) return null
  const time = Date.parse(raw)
  return Number.isFinite(time) ? { iso: new Date(time).toISOString(), time } : null
}

async function accessToken() {
  if (tokenCache.value && tokenCache.expiresAt > Date.now() + 30_000) {
    return { ok: true, token: tokenCache.value, cached: true }
  }

  try {
    const basic = Buffer.from(`${clientId()}:${clientSecret()}`).toString('base64')
    const response = await fetch(`${API_BASE}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${basic}`,
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': 'supermega-kernel/1.0',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(8_000),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        reason: `payment-paypal_token_http_${response.status}_${safeCode(data?.error || data?.name)}`,
      }
    }

    const token = safeString(data?.access_token)
    if (!token) return { ok: false, reason: 'payment-paypal_no_access_token' }
    const expiresIn = boundedInteger(data?.expires_in, 300, 60, 28_800)
    tokenCache.value = token
    tokenCache.expiresAt = Date.now() + expiresIn * 1000
    return { ok: true, token, cached: false }
  } catch {
    return { ok: false, reason: 'payment-paypal_token_transport_error' }
  }
}

export function resetPayPalTokenCacheForTests() {
  tokenCache.value = ''
  tokenCache.expiresAt = 0
}

export async function listTransactions(input = {}) {
  if (!configured()) return { ok: false, reason: 'payment-paypal_not_configured' }

  const start = internetDate(read(input, 'startDate'))
  const end = internetDate(read(input, 'endDate'))
  if (!start) return { ok: false, reason: 'payment-paypal_invalid_startDate' }
  if (!end) return { ok: false, reason: 'payment-paypal_invalid_endDate' }
  if (end.time <= start.time) return { ok: false, reason: 'payment-paypal_invalid_date_order' }
  if (end.time - start.time > MAX_WINDOW_MS) {
    return { ok: false, reason: 'payment-paypal_window_exceeds_31_days' }
  }

  const page = boundedInteger(read(input, 'page'), 1, 1, 10_000)
  const pageSize = boundedInteger(read(input, 'pageSize'), 100, 1, 500)
  const auth = await accessToken()
  if (!auth.ok) return auth

  try {
    const query = new URLSearchParams({
      start_date: start.iso,
      end_date: end.iso,
      fields: 'transaction_info',
      page: String(page),
      page_size: String(pageSize),
    })
    const response = await fetch(`${API_BASE}/v1/reporting/transactions?${query}`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${auth.token}`,
        accept: 'application/json',
        'user-agent': 'supermega-kernel/1.0',
      },
      signal: AbortSignal.timeout(8_000),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        reason: `payment-paypal_http_${response.status}_${safeCode(data?.name || data?.error)}`,
      }
    }
    const transactions = Array.isArray(data?.transaction_details) ? data.transaction_details : []
    return {
      ok: true,
      status: response.status,
      transactions,
      page,
      totalItems: Number(data?.total_items) || transactions.length,
      totalPages: Number(data?.total_pages) || null,
    }
  } catch {
    return { ok: false, reason: 'payment-paypal_transport_error' }
  }
}

export const paymentPaypal = {
  key: 'payment-paypal',
  name: 'PayPal Transaction Search',
  category: 'payment',
  docs: 'kernel/connectors/payment-paypal.mjs',
  configured,
  async health() {
    if (!configured()) return { ok: false, detail: 'missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET' }
    const result = await accessToken()
    return result.ok
      ? { ok: true, detail: result.cached ? 'oauth token cached' : 'oauth token minted' }
      : { ok: false, detail: result.reason }
  },
  listTransactions,
}

register(paymentPaypal)
export default paymentPaypal
