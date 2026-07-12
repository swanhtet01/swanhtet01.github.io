// Connector: commerce — Shopee. Read shop/order/product data from the Shopee Open Platform
// (Shopee is the dominant SEA marketplace — huge for Myanmar sellers). No SDK — native fetch,
// with request signing done via Node's built-in crypto (HMAC-SHA256). Zero dependencies.
//
// category 'commerce' · configured = SHOPEE_PARTNER_ID + SHOPEE_PARTNER_KEY + SHOPEE_SHOP_ID
//   + SHOPEE_ACCESS_TOKEN all present.
//
// Quick setup (Shopee Open Platform — Shop-level API):
//   1. Register at https://open.shopee.com and create an app → note the Partner ID and Partner Key.
//   2. Authorize your shop to the app (OAuth) → you receive a Shop ID + an access token
//      (access tokens expire; refresh them out-of-band and keep SHOPEE_ACCESS_TOKEN current).
//   3. Set SHOPEE_PARTNER_ID (numeric), SHOPEE_PARTNER_KEY (the app's partner key / secret),
//      SHOPEE_SHOP_ID (numeric), and SHOPEE_ACCESS_TOKEN.
//
// Auth model (Shopee "common parameters"): every Shop API call is signed. The base string is
//   partner_id + api_path + timestamp + access_token + shop_id
// signed with HMAC-SHA256 using the Partner Key; the hex digest is sent as `sign`. partner_id,
// timestamp, sign, shop_id and access_token all ride as query params. Signatures are valid for a
// short window (Shopee rejects timestamps skewed > ~5 min), so we sign per-request with a fresh
// Unix-seconds timestamp.
//
// Env:
//   SHOPEE_PARTNER_ID     (required)  numeric partner id from the Open Platform app
//   SHOPEE_PARTNER_KEY    (required)  partner key / secret used to HMAC-SHA256 sign requests
//   SHOPEE_SHOP_ID        (required)  numeric shop id (from the shop authorization step)
//   SHOPEE_ACCESS_TOKEN   (required)  shop access token from the OAuth authorization
//
// Capabilities:
//   getShopInfo() — GET /api/v2/shop/get_shop_info (shop name, region, status, expiry).

import { createHmac } from 'node:crypto'
import { register } from './registry.mjs'

// Fixed, documented Open Platform host. We do NOT read the base from env — there is no
// per-tenant host here, so hardcoding removes any chance of an env-driven SSRF target.
const API_BASE = 'https://partner.shopeemobile.com'
const API_HOST = 'partner.shopeemobile.com'

const partnerId = () => String(process.env.SHOPEE_PARTNER_ID || '').trim()
const partnerKey = () => String(process.env.SHOPEE_PARTNER_KEY || '').trim()
const shopId = () => String(process.env.SHOPEE_SHOP_ID || '').trim()
const accessToken = () => String(process.env.SHOPEE_ACCESS_TOKEN || '').trim()

const configured = () => Boolean(partnerId() && partnerKey() && shopId() && accessToken())

/**
 * signedUrl — build a fully-signed Shopee Shop-API URL for the given api path.
 *
 * Base string = partner_id + api_path + timestamp + access_token + shop_id, HMAC-SHA256 with the
 * partner key (hex). The common params ride in the query string. We build the URL with the real
 * API_BASE and then re-validate the resulting host with new URL() (SSRF-safe: only the documented
 * Shopee host is ever contacted, never a value derived from env), like the reference does.
 *
 * @param {string} apiPath  e.g. '/api/v2/shop/get_shop_info'
 * @returns {string} absolute https URL on the Shopee Open Platform host
 */
function signedUrl(apiPath) {
  const ts = Math.floor(Date.now() / 1000)
  const base = `${partnerId()}${apiPath}${ts}${accessToken()}${shopId()}`
  const sign = createHmac('sha256', partnerKey()).update(base).digest('hex')
  const params = new URLSearchParams({
    partner_id: partnerId(),
    timestamp: String(ts),
    access_token: accessToken(),
    shop_id: shopId(),
    sign,
  })
  const url = `${API_BASE}${apiPath}?${params.toString()}`
  // Defensive: confirm we're only ever hitting the documented Shopee host over https.
  const u = new URL(url)
  if (u.protocol !== 'https:' || u.hostname.toLowerCase() !== API_HOST) {
    throw new Error('shopee_bad_host')
  }
  return url
}

async function shopeeGet(apiPath) {
  if (!configured()) return { ok: false, reason: 'shopee_not_configured' }
  try {
    const res = await fetch(signedUrl(apiPath), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'supermega-kernel/1.0',
      },
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => null)
    // Shopee returns HTTP 200 even for API-level errors; the `error` field carries the real status.
    if (!res.ok) return { ok: false, reason: `shopee_${res.status}`, detail: data }
    if (data && data.error) {
      return { ok: false, reason: `shopee_${data.error}`, detail: String(data.message || '').slice(0, 200) }
    }
    return { ok: true, data }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'shopee_error').slice(0, 200) }
  }
}

/**
 * getShopInfo — fetch this shop's profile from the Shopee Open Platform.
 *
 * GET /api/v2/shop/get_shop_info returns fields such as shop_name, region, status, and the
 * shop's auth/token expiry. It's a cheap, read-only, shop-scoped call — a good liveness probe.
 *
 * @returns {Promise<{ ok:boolean, shop?:object, reason?:string, detail?:any }>}
 */
export async function getShopInfo() {
  const result = await shopeeGet('/api/v2/shop/get_shop_info')
  if (!result.ok) return result
  return { ok: true, shop: result.data || null }
}

export const commerceShopee = {
  key: 'commerce-shopee',
  name: 'Shopee',
  category: 'commerce',
  docs: 'kernel/connectors/commerce-shopee.mjs',
  configured,
  /**
   * health — signed GET /api/v2/shop/get_shop_info. A 200 with no `error` field means the
   * partner credentials, signature, shop id and access token are all valid and live.
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!configured()) {
      return { ok: false, detail: 'missing SHOPEE_PARTNER_ID, SHOPEE_PARTNER_KEY, SHOPEE_SHOP_ID or SHOPEE_ACCESS_TOKEN' }
    }
    const result = await getShopInfo()
    if (!result.ok) {
      return { ok: false, detail: `get_shop_info failed: ${result.reason}`.slice(0, 160) }
    }
    const label = result.shop?.shop_name || result.shop?.region || shopId()
    return { ok: true, detail: `shop=${label}`.slice(0, 160) }
  },
  getShopInfo,
}

register(commerceShopee)
export default commerceShopee
