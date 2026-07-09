// Connector: payment — PayPal. Read settled transactions out of PayPal's REST reporting API
// (zero-dependency, native fetch) so a Myanmar/SEA SMB that takes cross-border card and PayPal
// payments can pull its real money movement into the SuperMega kernel — reconciling DeskPOS sales
// against what actually cleared, and enriching the ledger without exporting CSVs by hand.
//
// category 'payment' · configured = PAYPAL_CLIENT_ID AND PAYPAL_CLIENT_SECRET both present.
//
// Quick setup:
//   1. In the PayPal Developer Dashboard (https://developer.paypal.com) create a LIVE REST app.
//   2. Copy the app's Client ID and Secret. Grant it the "Transaction Search" feature so the
//      reporting endpoint is available.
//   3. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET. The host is fixed (api-m.paypal.com, live).
//
// Env:
//   PAYPAL_CLIENT_ID      (required)  REST app client id.
//   PAYPAL_CLIENT_SECRET  (required)  REST app secret.
//
// Auth: OAuth 2.0 client-credentials. We POST /v1/oauth2/token with an HTTP Basic header built from
// base64(client_id:client_secret) and body grant_type=client_credentials to mint a short-lived
// access token, then send that token as a Bearer on the reporting call. The token is fetched
// per-request (no caching) — simplest correct behaviour for a health/read connector.
//
// Base: https://api-m.paypal.com (fixed LIVE host — never chosen from a user value).
//
// Capabilities:
//   listTransactions({ startDate, endDate }) — GET /v1/reporting/transactions (settled money movement).

import { register } from './registry.mjs'

// Fixed, documented LIVE API host — hardcoded https constant, so no env/user value ever chooses the
// host (no SSRF surface via configuration).
const API_BASE = 'https://api-m.paypal.com'

const clientId = () => String(process.env.PAYPAL_CLIENT_ID || '').trim()
const clientSecret = () => String(process.env.PAYPAL_CLIENT_SECRET || '').trim()

// configured — ONLY checks that both required env vars are present. The host is a hardcoded https
// constant (never derived from a user/env value), so this stays SSRF-safe.
const configured = () => Boolean(clientId() && clientSecret())

// Basic auth header for the token exchange: base64(client_id:client_secret).
const basicAuth = () => 'Basic ' + Buffer.from(`${clientId()}:${clientSecret()}`).toString('base64')

/**
 * getAccessToken — mint a short-lived OAuth 2.0 access token via client-credentials.
 *
 * POSTs /v1/oauth2/token with the Basic header and grant_type=client_credentials. Returns the raw
 * token string on success, or an { ok:false, reason } object on any failure (never throws).
 *
 * @returns {Promise<string | { ok:false, status?:number, reason:string }>}
 */
async function getAccessToken() {
  try {
    const res = await fetch(`${API_BASE}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        authorization: basicAuth(),
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': 'supermega-kernel/1.0',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const reason = data?.error_description || data?.error || data?.message || `http_${res.status}`
      return { ok: false, status: res.status, reason: `payment-paypal_${String(reason)}`.slice(0, 200) }
    }
    const token = data?.access_token
    if (!token) return { ok: false, reason: 'payment-paypal_no_access_token' }
    return String(token)
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'payment-paypal_error').slice(0, 200) }
  }
}

/**
 * listTransactions — read settled transactions from PayPal's REST reporting API.
 *
 * First mints an access token (client-credentials), then GETs /v1/reporting/transactions for the
 * given window. PayPal requires both start_date and end_date as RFC 3339 timestamps and caps the
 * window at 31 days per call. Any non-2xx or transport failure is surfaced via reason (never thrown).
 *
 * @param {object} [payload]
 * @param {string} [payload.startDate]  RFC 3339 start (e.g. '2026-07-01T00:00:00-0000'). Required.
 * @param {string} [payload.endDate]    RFC 3339 end   (e.g. '2026-07-08T23:59:59-0000'). Required.
 * @returns {Promise<{ ok:boolean, status?:number, transactions?:any[], reason?:string }>}
 */
export async function listTransactions(_input = {}) {
  const { startDate, endDate } = _input || {}
  if (!configured()) return { ok: false, reason: 'payment-paypal_not_configured' }
  const start = String(startDate || '').trim()
  const end = String(endDate || '').trim()
  if (!start) return { ok: false, reason: 'payment-paypal_missing_startDate' }
  if (!end) return { ok: false, reason: 'payment-paypal_missing_endDate' }

  const token = await getAccessToken()
  if (typeof token !== 'string') return token // { ok:false, reason } passthrough

  try {
    const qs = new URLSearchParams({ start_date: start, end_date: end, fields: 'transaction_info' })
    const res = await fetch(`${API_BASE}/v1/reporting/transactions?${qs.toString()}`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'user-agent': 'supermega-kernel/1.0',
      },
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const reason = data?.message || data?.error_description || data?.name || `http_${res.status}`
      return { ok: false, status: res.status, reason: `payment-paypal_${String(reason)}`.slice(0, 200) }
    }
    const transactions = data?.transaction_details || []
    return { ok: true, status: res.status, transactions: Array.isArray(transactions) ? transactions : [] }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'payment-paypal_error').slice(0, 200) }
  }
}

export const paymentPaypal = {
  key: 'payment-paypal',
  name: 'PayPal',
  category: 'payment',
  docs: 'kernel/connectors/payment-paypal.mjs',
  configured,
  /**
   * health — mint an access token via client-credentials. A successful token proves the client id
   * and secret are valid and live, without pulling any transaction data.
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!configured()) return { ok: false, detail: 'missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET' }
    const token = await getAccessToken()
    if (typeof token !== 'string') {
      return { ok: false, detail: `token failed: ${token.reason}`.slice(0, 160) }
    }
    return { ok: true, detail: 'token ok'.slice(0, 160) }
  },
  listTransactions,
}

register(paymentPaypal)
export default paymentPaypal
