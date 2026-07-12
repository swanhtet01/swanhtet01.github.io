// Connector: logistics — Ninja Van. Track and create parcel shipments via the Ninja Van API
// (Ninja Van is a leading SEA last-mile courier — widely used by Myanmar / SEA e-commerce sellers).
// Zero-dependency, native fetch only. Lets DeskPOS / the demo funnel surface live delivery status
// for an order so a seller (and their customer) can see where a parcel is without leaving the app.
//
// category 'logistics' · configured = NINJAVAN_ACCESS_TOKEN present.
//
// Quick setup (Ninja Van API):
//   1. Get API access from Ninja Van (client credentials → OAuth). You receive an OAuth access
//      token (Bearer). Tokens expire; refresh out-of-band and keep NINJAVAN_ACCESS_TOKEN current.
//   2. Set NINJAVAN_ACCESS_TOKEN to that Bearer token.
//   3. (Per call) pass the tracking id to trackOrder — the tracking number printed on the parcel /
//      returned when the order was created.
//
// Env:
//   NINJAVAN_ACCESS_TOKEN  (required)  OAuth Bearer access token for the Ninja Van API.
//
// Auth: HTTP Bearer. Authorization: 'Bearer ' + NINJAVAN_ACCESS_TOKEN.
//
// Capabilities:
//   trackOrder({ trackingId }) — GET /SG/1.0/orders/<trackingId>/events (parcel event history).
//   createOrder({ ... })       — stub: POST /SG/4.1/orders is not implemented server-side here yet.

import { register } from './registry.mjs'

// Fixed, documented Ninja Van API host. We do NOT read the base from env — there is no per-tenant
// host here, so hardcoding removes any chance of an env-driven SSRF target.
const API_BASE = 'https://api.ninjavan.co'
const API_HOST = 'api.ninjavan.co'

const accessToken = () => String(process.env.NINJAVAN_ACCESS_TOKEN || '').trim()

// configured — checks ONLY that the required env var is present. The host is a hardcoded https
// constant (never derived from any user/env value), so there is no host to validate here.
const configured = () => Boolean(accessToken())

const authHeader = () => `Bearer ${accessToken()}`

/**
 * ninjaGet — signed, timeout-bounded GET against the fixed Ninja Van host. Never throws: any
 * failure (not configured, bad host, network, non-2xx, unparseable body) becomes {ok:false,reason}.
 *
 * We build the URL from the hardcoded API_BASE and re-validate the resulting host with new URL()
 * (SSRF-safe: only the documented Ninja Van host is ever contacted, never a value from env).
 *
 * @param {string} apiPath  e.g. '/SG/1.0/orders/NVSGABC123/events'
 * @returns {Promise<{ ok:boolean, status?:number, data?:any, reason?:string }>}
 */
async function ninjaGet(apiPath) {
  if (!configured()) return { ok: false, reason: 'logistics-ninjavan_not_configured' }
  let url
  try {
    url = `${API_BASE}${apiPath}`
    const u = new URL(url)
    if (u.protocol !== 'https:' || u.hostname.toLowerCase() !== API_HOST) {
      return { ok: false, reason: 'logistics-ninjavan_bad_host' }
    }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'logistics-ninjavan_error').slice(0, 200) }
  }
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        authorization: authHeader(),
        'content-type': 'application/json',
        'user-agent': 'supermega-kernel/1.0',
      },
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const reason = data?.error?.message || data?.message || data?.title || `http_${res.status}`
      return { ok: false, status: res.status, reason: `logistics-ninjavan_${String(reason)}`.slice(0, 200) }
    }
    return { ok: true, status: res.status, data }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'logistics-ninjavan_error').slice(0, 200) }
  }
}

/**
 * trackOrder — fetch the delivery event history for a parcel.
 *
 * GET /SG/1.0/orders/<trackingId>/events returns the ordered list of tracking events (scans,
 * status changes, delivery). Read-only and cheap. Returns { ok, events:[] } on success.
 *
 * @param {object} [payload]
 * @param {string} [payload.trackingId]  the parcel tracking id / number (required).
 * @returns {Promise<{ ok:boolean, status?:number, events?:any[], reason?:string }>}
 */
export async function trackOrder(_input = {}) {
  const { trackingId } = _input || {}
  if (!configured()) return { ok: false, reason: 'logistics-ninjavan_not_configured' }
  const id = String(trackingId || '').trim()
  if (!id) return { ok: false, reason: 'logistics-ninjavan_missing_tracking_id' }

  const result = await ninjaGet(`/SG/1.0/orders/${encodeURIComponent(id)}/events`)
  if (!result.ok) return result
  // Ninja Van returns the events either as a bare array or wrapped under an `events` key.
  const raw = result.data
  const events = Array.isArray(raw) ? raw : Array.isArray(raw?.events) ? raw.events : []
  return { ok: true, status: result.status, events }
}

/**
 * createOrder — stub. Creating a parcel (POST /SG/4.1/orders) requires a full pickup/delivery
 * payload and is intentionally not implemented server-side here yet. Never throws.
 *
 * @returns {Promise<{ ok:false, reason:string }>}
 */
export async function createOrder(_input = {}) {
  if (!configured()) return { ok: false, reason: 'logistics-ninjavan_not_configured' }
  return { ok: false, reason: 'logistics-ninjavan_create_order_not_implemented' }
}

export const logisticsNinjavan = {
  key: 'logistics-ninjavan',
  name: 'Ninja Van',
  category: 'logistics',
  docs: 'kernel/connectors/logistics-ninjavan.mjs',
  configured,
  /**
   * health — a cheap authenticated liveness probe. We hit the tracking-events endpoint with a
   * clearly-synthetic tracking id: a 401/403 means the Bearer token is invalid (unhealthy), while a
   * 404 (unknown parcel) still proves the credentials are accepted and the API is reachable (healthy).
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!configured()) return { ok: false, detail: 'missing NINJAVAN_ACCESS_TOKEN' }
    const result = await ninjaGet('/SG/1.0/orders/SUPERMEGA-HEALTHCHECK/events')
    if (result.ok) return { ok: true, detail: 'ninjavan api reachable' }
    // 404 = auth accepted, parcel just not found → treat as healthy/reachable.
    if (result.status === 404) return { ok: true, detail: 'ninjavan api reachable (404 probe)' }
    return { ok: false, detail: String(result.reason || 'ninjavan_error').slice(0, 160) }
  },
  trackOrder,
  createOrder,
}

register(logisticsNinjavan)
export default logisticsNinjavan
