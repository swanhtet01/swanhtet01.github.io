// Connector: commerce — WooCommerce. Read products and orders, and update orders on any
// WordPress shop via the WooCommerce REST API (v3). Huge for Myanmar SMBs already running a
// WordPress site — turn it into a sales channel the kernel can read and act on. No SDK — fetch-based.
//
// category 'commerce' · configured = WOOCOMMERCE_URL (https://) + WOOCOMMERCE_KEY + WOOCOMMERCE_SECRET present.
//
// Quick setup (REST API key pair):
//   1. WP Admin → WooCommerce → Settings → Advanced → REST API → Add key.
//   2. Set a description, pick the user, set Permissions to Read/Write.
//   3. Generate → copy the Consumer key (ck_…) and Consumer secret (cs_…) — shown once.
//   4. Set WOOCOMMERCE_URL to your store base (e.g. https://shop.example.com — no trailing path).
//   5. Set WOOCOMMERCE_KEY to the consumer key and WOOCOMMERCE_SECRET to the consumer secret.
//
// Auth = HTTP Basic over HTTPS: Authorization: 'Basic ' + base64(key:secret).
//
// Env:
//   WOOCOMMERCE_URL     (required)  store base, must start with https:// (e.g. https://shop.example.com)
//   WOOCOMMERCE_KEY     (required)  REST API consumer key (ck_…)
//   WOOCOMMERCE_SECRET  (required)  REST API consumer secret (cs_…)

import { register } from './registry.mjs'

const storeUrl = () => String(process.env.WOOCOMMERCE_URL || '').trim().replace(/\/$/, '')
const consumerKey = () => String(process.env.WOOCOMMERCE_KEY || '').trim()
const consumerSecret = () => String(process.env.WOOCOMMERCE_SECRET || '').trim()
const configured = () =>
  Boolean(storeUrl() && consumerKey() && consumerSecret() && storeUrl().startsWith('https://'))

function basePath() {
  return storeUrl() + '/wp-json/wc/v3'
}

function headers() {
  const token = Buffer.from(consumerKey() + ':' + consumerSecret()).toString('base64')
  return {
    Authorization: 'Basic ' + token,
    'Content-Type': 'application/json',
    'User-Agent': 'supermega-kernel/1.0',
  }
}

async function wooFetch(path, options = {}) {
  if (!configured()) return { ok: false, reason: 'woocommerce_not_configured' }
  try {
    const res = await fetch(basePath() + path, {
      ...options,
      headers: { ...headers(), ...(options.headers || {}) },
      signal: AbortSignal.timeout(options.timeout || 10000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, reason: ('woocommerce_' + res.status + ': ' + (data?.message || '')).slice(0, 200) }
    return { ok: true, data }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'woocommerce_error').slice(0, 200) }
  }
}

/**
 * listProducts — retrieve products from the store.
 *
 * @param {object} [opts]
 * @param {number} [opts.perPage]  max products to return (1–100, default 20)
 * @returns {Promise<{ ok:boolean, products?:Array, reason?:string }>}
 */
export async function listProducts({ perPage = 20 } = {}) {
  const params = new URLSearchParams({ per_page: String(Math.min(Math.max(1, perPage), 100)) })
  const r = await wooFetch('/products?' + params.toString(), { method: 'GET' })
  if (!r.ok) return r
  return { ok: true, products: Array.isArray(r.data) ? r.data : [] }
}

/**
 * listOrders — retrieve recent orders from the store.
 *
 * @param {object} [opts]
 * @param {number} [opts.perPage]  max orders to return (1–100, default 20)
 * @param {string} [opts.status]   filter by status (e.g. 'processing', 'completed', 'on-hold')
 * @returns {Promise<{ ok:boolean, orders?:Array, reason?:string }>}
 */
export async function listOrders({ perPage = 20, status } = {}) {
  const params = new URLSearchParams({ per_page: String(Math.min(Math.max(1, perPage), 100)) })
  if (status) params.set('status', String(status))
  const r = await wooFetch('/orders?' + params.toString(), { method: 'GET' })
  if (!r.ok) return r
  return { ok: true, orders: Array.isArray(r.data) ? r.data : [] }
}

/**
 * getOrder — retrieve a single order by ID.
 *
 * @param {string|number} id
 * @returns {Promise<{ ok:boolean, order?:object, reason?:string }>}
 */
export async function getOrder(id) {
  if (!id) return { ok: false, reason: 'woocommerce_missing_order_id' }
  const r = await wooFetch('/orders/' + encodeURIComponent(id), { method: 'GET' })
  if (!r.ok) return r
  return { ok: true, order: r.data || null }
}

/**
 * updateOrder — patch fields on an existing order (e.g. status, note).
 *
 * @param {string|number} id      the order ID to update.
 * @param {object}        fields  WooCommerce order fields to set.
 * @returns {Promise<{ ok:boolean, order?:object, reason?:string }>}
 */
export async function updateOrder(id, fields) {
  if (!id) return { ok: false, reason: 'woocommerce_missing_order_id' }
  if (!fields || typeof fields !== 'object') return { ok: false, reason: 'woocommerce_missing_fields' }
  const r = await wooFetch('/orders/' + encodeURIComponent(id), {
    method: 'PUT',
    body: JSON.stringify(fields),
  })
  if (!r.ok) return r
  return { ok: true, order: r.data || null }
}

export const commerceWoocommerce = {
  key: 'commerce-woocommerce',
  name: 'WooCommerce',
  category: 'commerce',
  docs: 'kernel/connectors/commerce-woocommerce.mjs',
  configured,
  async health() {
    if (!configured()) return { ok: false, detail: 'missing WOOCOMMERCE_URL or WOOCOMMERCE_KEY or WOOCOMMERCE_SECRET' }
    const r = await wooFetch('/products?per_page=1', { method: 'GET', timeout: 8000 })
    return r.ok ? { ok: true, detail: 'store reachable' } : { ok: false, detail: r.reason }
  },
  listProducts,
  listOrders,
  getOrder,
  updateOrder,
}

register(commerceWoocommerce)
export default commerceWoocommerce
