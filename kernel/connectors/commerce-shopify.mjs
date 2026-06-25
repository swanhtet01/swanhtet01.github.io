// Connector: commerce — Shopify. Read orders, products, inventory, and customers via the
// Shopify Admin REST API (API version 2024-10). No SDK — fetch-based.
//
// category 'commerce' · configured = SHOPIFY_STORE_DOMAIN + SHOPIFY_ACCESS_TOKEN present.
//
// Quick setup (Custom App — Admin API access):
//   1. Shopify Admin → Settings → Apps and sales channels → Develop apps → Create an app.
//   2. Under API credentials → Configure Admin API scopes: add read_orders, read_products,
//      read_inventory (+ write_* scopes if you need to create/update resources).
//   3. Install the app → copy "Admin API access token" (starts with shpat_…).
//   4. Set SHOPIFY_STORE_DOMAIN to your store's myshopify.com domain (e.g. mystore.myshopify.com).
//   5. Set SHOPIFY_ACCESS_TOKEN to the token from step 3.
//
// Env:
//   SHOPIFY_STORE_DOMAIN   (required)  e.g. mystore.myshopify.com (no https://)
//   SHOPIFY_ACCESS_TOKEN   (required)  Admin API access token (shpat_…)

import { register } from './registry.mjs'

const API_VERSION = '2024-10'

const storeDomain = () => String(process.env.SHOPIFY_STORE_DOMAIN || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
const accessToken = () => String(process.env.SHOPIFY_ACCESS_TOKEN || '').trim()
const configured = () => Boolean(storeDomain() && accessToken())

function shopifyUrl(path) {
  return `https://${storeDomain()}/admin/api/${API_VERSION}/${path}`
}

function headers() {
  return {
    'X-Shopify-Access-Token': accessToken(),
    'Content-Type': 'application/json',
    'User-Agent': 'supermega-kernel/1.0',
  }
}

async function shopifyGet(path) {
  if (!configured()) return { ok: false, reason: 'shopify_not_configured' }
  try {
    const res = await fetch(shopifyUrl(path), {
      method: 'GET',
      headers: headers(),
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, reason: `shopify_${res.status}`, detail: data?.errors }
    return { ok: true, data }
  } catch (e) {
    return { ok: false, reason: String(e.message || 'shopify_error').slice(0, 200) }
  }
}

/**
 * listOrders — retrieve recent orders from the store.
 *
 * @param {object} [opts]
 * @param {string} [opts.status]      'open' | 'closed' | 'cancelled' | 'any' (default 'open')
 * @param {number} [opts.limit]       max orders to return (1–250, default 50)
 * @param {string} [opts.since_id]    only orders with id > since_id
 * @returns {Promise<{ ok:boolean, orders?:Array, reason?:string }>}
 */
export async function listOrders(opts = {}) {
  const params = new URLSearchParams({
    status: opts.status || 'open',
    limit: String(Math.min(opts.limit || 50, 250)),
  })
  if (opts.since_id) params.set('since_id', String(opts.since_id))
  const result = await shopifyGet(`orders.json?${params}`)
  if (!result.ok) return result
  return { ok: true, orders: result.data?.orders || [] }
}

/**
 * listProducts — retrieve products and their variants.
 *
 * @param {object} [opts]
 * @param {number} [opts.limit]  max products (1–250, default 50)
 * @returns {Promise<{ ok:boolean, products?:Array, reason?:string }>}
 */
export async function listProducts(opts = {}) {
  const params = new URLSearchParams({ limit: String(Math.min(opts.limit || 50, 250)) })
  const result = await shopifyGet(`products.json?${params}`)
  if (!result.ok) return result
  return { ok: true, products: result.data?.products || [] }
}

/**
 * getOrder — retrieve a single order by ID.
 *
 * @param {string|number} orderId
 * @returns {Promise<{ ok:boolean, order?:object, reason?:string }>}
 */
export async function getOrder(orderId) {
  if (!orderId) return { ok: false, reason: 'shopify_missing_order_id' }
  const result = await shopifyGet(`orders/${orderId}.json`)
  if (!result.ok) return result
  return { ok: true, order: result.data?.order || null }
}

export const commerceShopify = {
  key: 'commerce-shopify',
  name: 'Shopify',
  category: 'commerce',
  docs: 'kernel/connectors/commerce-shopify.mjs',
  configured,
  async health() {
    if (!configured()) return { ok: false, configured: false, detail: 'missing SHOPIFY_STORE_DOMAIN or SHOPIFY_ACCESS_TOKEN' }
    const result = await shopifyGet('shop.json')
    if (!result.ok) return { ok: false, configured: true, detail: `shop.json failed: ${result.reason}` }
    return { ok: true, configured: true, shop: result.data?.shop?.name || result.data?.shop?.domain || '' }
  },
  listOrders,
  listProducts,
  getOrder,
}

register(commerceShopify)
export default commerceShopify
