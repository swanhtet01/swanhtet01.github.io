// Connector: data — Google Analytics (GA4). Run reports against the Google Analytics Data API v1
// (zero-dependency, native fetch). Lets Myanmar SMBs pull traffic/engagement metrics for a GA4
// property straight into the kernel — e.g. daily active users, sessions, conversions — so website
// analytics land in the same place as their POS and marketing data without any manual export.
//
// category 'data' · configured = GA4_ACCESS_TOKEN present AND GA4_PROPERTY_ID present.
//
// Quick setup (Google Analytics Data API v1):
//   1. In Google Cloud, enable the "Google Analytics Data API" for a project with a service account
//      (or use an OAuth flow) that has read access to the GA4 property.
//   2. Obtain a short-lived OAuth 2.0 access token for the
//      https://www.googleapis.com/auth/analytics.readonly scope (refresh it out-of-band and keep
//      GA4_ACCESS_TOKEN current — access tokens expire, typically after ~1 hour).
//   3. Find the numeric GA4 Property ID: Admin → Property Settings → "PROPERTY ID"
//      (a number like 123456789 — NOT the "G-XXXX" measurement id).
//   4. Set GA4_ACCESS_TOKEN (the Bearer token) and GA4_PROPERTY_ID (the numeric property id).
//
// Auth: HTTP Bearer. Authorization: 'Bearer ' + GA4_ACCESS_TOKEN.
//
// Env:
//   GA4_ACCESS_TOKEN  (required)  OAuth 2.0 access token for the analytics.readonly scope
//   GA4_PROPERTY_ID   (required)  numeric GA4 property id (e.g. 123456789)
//
// Capabilities:
//   runReport({ dimensions, metrics }) — POST /v1beta/properties/<PROPERTY_ID>:runReport
//     (returns the report rows for the requested dimensions/metrics over the last ~28 days).

import { register } from './registry.mjs'

// Fixed, documented Analytics Data API host. We do NOT read the base from env — there is no
// per-tenant host here, so hardcoding removes any chance of an env-driven SSRF target.
const API_BASE = 'https://analyticsdata.googleapis.com'
const API_HOST = 'analyticsdata.googleapis.com'

const accessToken = () => String(process.env.GA4_ACCESS_TOKEN || '').trim()
const propertyId = () => String(process.env.GA4_PROPERTY_ID || '').trim()

// configured — both the Bearer token and the numeric property id must be present. We check ONLY that
// the env vars exist; the host is a hardcoded https constant (never derived from a user value), so
// there's no SSRF surface here.
const configured = () => Boolean(accessToken() && propertyId())

const authHeader = () => 'Bearer ' + accessToken()

/**
 * runReport — run a GA4 report for the configured property.
 *
 * POSTs to /v1beta/properties/<PROPERTY_ID>:runReport with the requested dimensions and metrics.
 * Defaults to the "date" dimension and the "activeUsers" metric over the last 28 days. The GA4
 * property id rides ONLY in the URL path (it's numeric and encodeURIComponent-escaped); the host is
 * the hardcoded API_BASE and we re-validate the built URL with new URL() so only the documented
 * Google host is ever contacted (SSRF-safe), like the reference connectors do.
 *
 * @param {object}   [payload]
 * @param {string[]} [payload.dimensions]  GA4 dimension names (default ['date']).
 * @param {string[]} [payload.metrics]     GA4 metric names (default ['activeUsers']).
 * @returns {Promise<{ ok:boolean, rows?:any[], status?:number, reason?:string }>}
 */
export async function runReport(_input = {}) {
  if (!configured()) return { ok: false, reason: 'data-ga4_not_configured' }

  const { dimensions = ['date'], metrics = ['activeUsers'] } = _input || {}

  const dims = (Array.isArray(dimensions) ? dimensions : [])
    .map((d) => String(d || '').trim())
    .filter(Boolean)
  const mets = (Array.isArray(metrics) ? metrics : [])
    .map((m) => String(m || '').trim())
    .filter(Boolean)
  if (!dims.length) return { ok: false, reason: 'data-ga4_missing_dimensions' }
  if (!mets.length) return { ok: false, reason: 'data-ga4_missing_metrics' }

  const body = {
    dimensions: dims.map((name) => ({ name })),
    metrics: mets.map((name) => ({ name })),
    dateRanges: [{ startDate: '28daysAgo', endDate: 'today' }],
  }

  try {
    const url = `${API_BASE}/v1beta/properties/${encodeURIComponent(propertyId())}:runReport`
    // Defensive: confirm we're only ever hitting the documented Google host over https.
    const u = new URL(url)
    if (u.protocol !== 'https:' || u.hostname.toLowerCase() !== API_HOST) {
      return { ok: false, reason: 'data-ga4_bad_host' }
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: authHeader(),
        'content-type': 'application/json',
        'user-agent': 'supermega-kernel/1.0',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const reason = data?.error?.message || data?.error?.status || `http_${res.status}`
      return { ok: false, status: res.status, reason: `data-ga4_${String(reason)}`.slice(0, 200) }
    }
    return { ok: true, status: res.status, rows: Array.isArray(data?.rows) ? data.rows : [] }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'data-ga4_error').slice(0, 200) }
  }
}

export const dataGa4 = {
  key: 'data-ga4',
  name: 'Google Analytics (GA4)',
  category: 'data',
  docs: 'kernel/connectors/data-ga4.mjs',
  configured,
  /**
   * health — a minimal runReport (date × activeUsers over the last 28 days) is the cheapest
   * authenticated liveness probe: a 200 means the access token, property id and API access are all
   * valid. We don't inspect the rows, only that the call succeeds.
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!configured()) return { ok: false, detail: 'missing GA4_ACCESS_TOKEN or GA4_PROPERTY_ID' }
    const result = await runReport({ dimensions: ['date'], metrics: ['activeUsers'] })
    if (!result.ok) return { ok: false, detail: `runReport failed: ${result.reason}`.slice(0, 160) }
    return { ok: true, detail: `property=${propertyId()} rows=${result.rows?.length ?? 0}`.slice(0, 160) }
  },
  runReport,
}

register(dataGa4)
export default dataGa4
