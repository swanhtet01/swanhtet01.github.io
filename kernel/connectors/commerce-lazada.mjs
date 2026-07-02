// Connector: commerce — Lazada. Read seller/shop info, orders, and products via the Lazada
// Open Platform (LazOP) System API. Lazada is one of Southeast Asia's largest marketplaces
// (Singapore, Malaysia, Thailand, Vietnam, Philippines, Indonesia), so this lets a SUPERMEGA
// merchant pull their Lazada shop identity + order flow into the same console as everything else.
// No SDK — native fetch + node:crypto for the request signature only.
//
// category 'commerce' · configured = LAZADA_APP_KEY + LAZADA_APP_SECRET + LAZADA_ACCESS_TOKEN present.
//
// Quick setup (Lazada Open Platform):
//   1. Register an app at https://open.lazada.com → App Console → create a new app.
//   2. Copy the App Key and App Secret from the app's "App Info" page.
//   3. Complete the OAuth authorization flow for your seller account to obtain an
//      access_token (LazAuth: /oauth/token). Store the resulting token.
//   4. Set LAZADA_APP_KEY, LAZADA_APP_SECRET, and LAZADA_ACCESS_TOKEN below.
//
// Signing (LazOP HMAC-SHA256): every call carries the common params
//   app_key, timestamp (ms), sign_method=sha256, access_token, and a computed `sign`.
// The signature is HMAC-SHA256, keyed by the App Secret, over: the API path, followed by
// each request param (excluding `sign`) sorted by key and concatenated as key+value with no
// separators. The digest is hex, upper-cased. See https://open.lazada.com/doc (Signature).
//
// Env:
//   LAZADA_APP_KEY       (required)  App Key from the Lazada Open Platform app console
//   LAZADA_APP_SECRET    (required)  App Secret — used only to sign requests, never sent
//   LAZADA_ACCESS_TOKEN  (required)  seller access_token from the LazAuth OAuth flow
//
// Capabilities:
//   getSeller() — GET /seller/get: return the authorized shop/seller profile.

import crypto from 'node:crypto'
import { register } from './registry.mjs'

// Lazada System APIs (seller/get, etc.) live on the global gateway host. Region-specific
// business APIs use per-country hosts, but /seller/get is a System API and is served here.
const API_BASE = 'https://api.lazada.com/rest'
const API_HOST = 'api.lazada.com'

const appKey      = () => String(process.env.LAZADA_APP_KEY      || '').trim()
const appSecret   = () => String(process.env.LAZADA_APP_SECRET   || '').trim()
const accessToken = () => String(process.env.LAZADA_ACCESS_TOKEN || '').trim()

// configured — all three credentials present AND the fixed API base is the real Lazada host.
// We validate the host with new URL() (not a bare "startsWith https://") so that even though the
// base is a constant here, the same guard that would protect an env-driven URL is in place and any
// future change can't silently turn a signed, access-token-bearing request into an SSRF primitive.
const configured = () => {
  try {
    if (!appKey() || !appSecret() || !accessToken()) return false
    const u = new URL(API_BASE)
    if (u.protocol !== 'https:') return false
    return u.hostname.toLowerCase() === API_HOST
  } catch {
    return false
  }
}

/**
 * sign — LazOP HMAC-SHA256 request signature.
 *
 * Concatenate the API path (e.g. '/seller/get') with each param sorted by key as key+value
 * (no separators), HMAC-SHA256 it with the App Secret, and hex-encode upper-cased. `sign`
 * itself is never part of the signed string.
 *
 * @param {string} apiPath  the API path, leading slash included (e.g. '/seller/get')
 * @param {Record<string,string>} params  every request param except `sign`
 * @returns {string} uppercase hex signature
 */
function sign(apiPath, params) {
  const sorted = Object.keys(params)
    .filter((k) => k !== 'sign' && params[k] != null && params[k] !== '')
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join('')
  const base = `${apiPath}${sorted}`
  return crypto.createHmac('sha256', appSecret()).update(base, 'utf8').digest('hex').toUpperCase()
}

/**
 * lazadaGet — perform a signed GET against a Lazada System/business API path.
 * Builds the common params, computes the signature, and returns parsed JSON. Never throws —
 * on transport/parse failure it returns { ok:false, reason }.
 *
 * @param {string} apiPath  leading-slash API path (e.g. '/seller/get')
 * @param {Record<string,string>} [extra]  additional business params
 * @returns {Promise<{ ok:boolean, data?:object, reason?:string }>}
 */
async function lazadaGet(apiPath, extra = {}) {
  if (!configured()) return { ok: false, reason: 'lazada_not_configured' }
  try {
    const params = {
      app_key: appKey(),
      timestamp: String(Date.now()),
      sign_method: 'sha256',
      access_token: accessToken(),
      ...extra,
    }
    params.sign = sign(apiPath, params)

    const qs = new URLSearchParams(params).toString()
    const res = await fetch(`${API_BASE}${apiPath}?${qs}`, {
      method: 'GET',
      headers: { 'User-Agent': 'supermega-kernel/1.0' },
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      return { ok: false, reason: `lazada_http_${res.status}: ${(data?.message || '')}`.slice(0, 200) }
    }
    // Lazada envelopes success as code '0'; any other code is an API-level error.
    if (data && String(data.code) !== '0') {
      return { ok: false, reason: `lazada_${data.code}: ${(data.message || data.type || 'error')}`.slice(0, 200) }
    }
    return { ok: true, data }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'lazada_error').slice(0, 200) }
  }
}

/**
 * getSeller — fetch the authorized shop/seller profile (GET /seller/get).
 *
 * Returns the seller record Lazada exposes (name, short_code, seller_id, country, etc.).
 *
 * @returns {Promise<{ ok:boolean, seller?:object, reason?:string }>}
 */
export async function getSeller() {
  const result = await lazadaGet('/seller/get')
  if (!result.ok) return result
  return { ok: true, seller: result.data?.data || null }
}

export const commerceLazada = {
  key: 'commerce-lazada',
  name: 'Lazada',
  category: 'commerce',
  docs: 'kernel/connectors/commerce-lazada.mjs',
  configured,
  /**
   * health — a cheap authenticated liveness probe: signed GET /seller/get. If Lazada returns
   * code '0' the credentials + signature are valid and the token is live.
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!configured()) {
      const missing = [
        !appKey() && 'LAZADA_APP_KEY',
        !appSecret() && 'LAZADA_APP_SECRET',
        !accessToken() && 'LAZADA_ACCESS_TOKEN',
      ].filter(Boolean).join(', ')
      return { ok: false, detail: `missing ${missing || 'env'}` }
    }
    const result = await lazadaGet('/seller/get')
    if (!result.ok) return { ok: false, detail: String(result.reason || 'seller/get failed').slice(0, 160) }
    const s = result.data?.data || {}
    const label = s.name || s.short_code || s.seller_id || 'seller ok'
    return { ok: true, detail: `seller=${label}`.slice(0, 160) }
  },
  getSeller,
}

register(commerceLazada)
export default commerceLazada
