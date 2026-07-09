// Connector: commerce — TikTok Shop. Read order data from the TikTok Shop Open Platform
// (TikTok Shop is a fast-growing SEA marketplace — increasingly relevant for Myanmar sellers).
// No SDK — native fetch, with request signing done via Node's built-in crypto (HMAC-SHA256).
// Zero dependencies.
//
// category 'commerce' · configured = TIKTOK_SHOP_APP_KEY + TIKTOK_SHOP_APP_SECRET
//   + TIKTOK_SHOP_ACCESS_TOKEN all present.
//
// Quick setup (TikTok Shop Partner Center — Open API):
//   1. Register at https://partner.tiktokshop.com and create an app → note the App Key and App Secret.
//   2. Authorize your shop to the app (OAuth) → you receive an access token
//      (access tokens expire; refresh them out-of-band and keep TIKTOK_SHOP_ACCESS_TOKEN current).
//   3. Set TIKTOK_SHOP_APP_KEY, TIKTOK_SHOP_APP_SECRET, and TIKTOK_SHOP_ACCESS_TOKEN.
//
// Auth model (TikTok Shop "common parameters"): every API call is signed. The sign base string is
// built by concatenating app_secret + (path + each sorted request query param as key+value) +
// app_secret, then HMAC-SHA256'd with the App Secret; the hex digest is sent as the `sign` query
// param. app_key, timestamp and sign ride as query params; the access token rides in the
// `x-tts-access-token` header. Signatures are timestamp-scoped (TikTok rejects large skew), so we
// sign per-request with a fresh Unix-seconds timestamp.
//
// Env:
//   TIKTOK_SHOP_APP_KEY        (required)  app key from the Partner Center app
//   TIKTOK_SHOP_APP_SECRET     (required)  app secret used to HMAC-SHA256 sign requests
//   TIKTOK_SHOP_ACCESS_TOKEN   (required)  shop access token from the OAuth authorization
//
// Capabilities:
//   listOrders({ pageSize }) — GET /order/202309/orders/search (recent orders for the shop).

import { createHmac } from 'node:crypto'
import { register } from './registry.mjs'

// Fixed, documented Open Platform host. We do NOT read the base from env — there is no
// per-tenant host here, so hardcoding removes any chance of an env-driven SSRF target.
const API_BASE = 'https://open-api.tiktokglobalshop.com'
const API_HOST = 'open-api.tiktokglobalshop.com'

const appKey = () => String(process.env.TIKTOK_SHOP_APP_KEY || '').trim()
const appSecret = () => String(process.env.TIKTOK_SHOP_APP_SECRET || '').trim()
const accessToken = () => String(process.env.TIKTOK_SHOP_ACCESS_TOKEN || '').trim()

const configured = () => Boolean(appKey() && appSecret() && accessToken())

/**
 * signedUrl — build a fully-signed TikTok Shop Open-API URL for the given path.
 *
 * TikTok's sign base = app_secret + path + (each request query param, sorted by key, concatenated
 * as key+value, EXCLUDING `sign` and `access_token`) + app_secret; HMAC-SHA256 with the app secret
 * (hex). app_key, timestamp and the computed sign ride in the query string. We build the URL with
 * the real API_BASE and then re-validate the resulting host with new URL() (SSRF-safe: only the
 * documented TikTok Shop host is ever contacted, never a value derived from env).
 *
 * @param {string} path            e.g. '/order/202309/orders/search'
 * @param {object} [extraParams]   additional query params to include in the signed request
 * @returns {string} absolute https URL on the TikTok Shop Open Platform host
 */
function signedUrl(path, extraParams = {}) {
  const ts = Math.floor(Date.now() / 1000)
  // Query params that participate in the signature (access_token and sign are excluded by spec).
  const signedParams = { app_key: appKey(), timestamp: String(ts), ...extraParams }
  const sortedKeys = Object.keys(signedParams).sort()
  let base = appSecret() + path
  for (const k of sortedKeys) {
    base += k + String(signedParams[k])
  }
  base += appSecret()
  const sign = createHmac('sha256', appSecret()).update(base).digest('hex')

  const params = new URLSearchParams(signedParams)
  params.set('sign', sign)
  const url = `${API_BASE}${path}?${params.toString()}`
  // Defensive: confirm we're only ever hitting the documented TikTok Shop host over https.
  const u = new URL(url)
  if (u.protocol !== 'https:' || u.hostname.toLowerCase() !== API_HOST) {
    throw new Error('tiktok_shop_bad_host')
  }
  return url
}

/**
 * listOrders — fetch a page of recent orders for the authorized shop.
 *
 * GET /order/202309/orders/search with page_size in the signed query. TikTok returns a `code` of 0
 * on success; any non-zero `code` is surfaced via reason (not thrown). The access token rides in the
 * `x-tts-access-token` header per the Open API spec.
 *
 * @param {object} [payload]
 * @param {number} [payload.pageSize=20]  number of orders to request (page size).
 * @returns {Promise<{ ok:boolean, orders?:any[], reason?:string, detail?:any }>}
 */
export async function listOrders(_input = {}) {
  if (!configured()) return { ok: false, reason: 'commerce-tiktok-shop_not_configured' }
  const { pageSize = 20 } = _input || {}
  const size = Math.max(1, Math.min(100, parseInt(pageSize, 10) || 20))
  try {
    const res = await fetch(signedUrl('/order/202309/orders/search', { page_size: String(size) }), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'supermega-kernel/1.0',
        'x-tts-access-token': accessToken(),
      },
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, reason: `commerce-tiktok-shop_${res.status}`, detail: data }
    // TikTok Shop returns HTTP 200 with a JSON envelope; a non-zero `code` is the real error.
    if (data && data.code && data.code !== 0) {
      return { ok: false, reason: `commerce-tiktok-shop_${data.code}`, detail: String(data.message || '').slice(0, 200) }
    }
    const orders = data?.data?.orders || []
    return { ok: true, orders: Array.isArray(orders) ? orders : [] }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'commerce-tiktok-shop_error').slice(0, 200) }
  }
}

export const commerceTiktokShop = {
  key: 'commerce-tiktok-shop',
  name: 'TikTok Shop',
  category: 'commerce',
  docs: 'kernel/connectors/commerce-tiktok-shop.mjs',
  configured,
  /**
   * health — signed GET /order/202309/orders/search (page_size=1). A 200 with `code` 0 means the
   * app key, secret, signature and access token are all valid and live, without pulling a full page.
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!configured()) {
      return { ok: false, detail: 'missing TIKTOK_SHOP_APP_KEY, TIKTOK_SHOP_APP_SECRET or TIKTOK_SHOP_ACCESS_TOKEN' }
    }
    const result = await listOrders({ pageSize: 1 })
    if (!result.ok) {
      return { ok: false, detail: `orders/search failed: ${result.reason}`.slice(0, 160) }
    }
    return { ok: true, detail: `orders reachable (${result.orders.length} in probe)`.slice(0, 160) }
  },
  listOrders,
}

register(commerceTiktokShop)
export default commerceTiktokShop
