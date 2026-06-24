// Connector: payment — KBZPay merchant wallet (Myanmar).
//
// KBZPay is Myanmar's largest mobile wallet. This connector talks to their merchant gateway to:
//   1. createQR  — POST /precreate: generate a KBZPay QR code for a customer to scan.
//   2. queryPayment — POST /query: poll payment status by your merchant order id.
//   3. health   — no-network config check (KBZPay has no dedicated ping endpoint).
//
// Auth: MD5 signature of sorted key=value pairs + key=<APP_SECRET> appended.
// UAT:  https://api.kbzpay.com/payment/gateway/uat/
// Prod: https://api.kbzpay.com/payment/gateway/
//
// Env:
//   KBZPAY_APP_ID       (required)  merchant app id issued by KBZPay
//   KBZPAY_MERCH_CODE   (required)  merchant code issued by KBZPay
//   KBZPAY_APP_SECRET   (required)  signing secret
//   KBZPAY_NOTIFY_URL   (optional)  async IPN callback (default: https://console.supermega.dev/api/kbzpay-notify)
//   KBZPAY_SANDBOX      (optional)  'true' to force UAT endpoint (default: auto-detect from APP_ID prefix or use prod)

import crypto from 'node:crypto'
import { register } from './registry.mjs'

// ─── env helpers ────────────────────────────────────────────────────────────

const appId      = () => String(process.env.KBZPAY_APP_ID      || '').trim()
const merchCode  = () => String(process.env.KBZPAY_MERCH_CODE  || '').trim()
const appSecret  = () => String(process.env.KBZPAY_APP_SECRET  || '').trim()
const notifyUrl  = () => String(process.env.KBZPAY_NOTIFY_URL  || 'https://console.supermega.dev/api/kbzpay-notify').trim()
const isSandbox  = () => String(process.env.KBZPAY_SANDBOX     || '').toLowerCase() === 'true'
const configured = () => !!(appId() && merchCode() && appSecret())

const baseUrl = () => isSandbox()
  ? 'https://api.kbzpay.com/payment/gateway/uat/'
  : 'https://api.kbzpay.com/payment/gateway/'

// ─── signing ────────────────────────────────────────────────────────────────

/**
 * KBZPay sign method:
 *   1. Sort params alphabetically by key (exclude `sign` itself).
 *   2. Concatenate as "key1=val1&key2=val2...".
 *   3. Append "&key=<APP_SECRET>".
 *   4. MD5 the whole string → uppercase hex.
 */
function sign(params) {
  const secret = appSecret()
  const sorted = Object.keys(params)
    .filter((k) => k !== 'sign' && params[k] !== '' && params[k] != null)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  const raw = `${sorted}&key=${secret}`
  return crypto.createHash('md5').update(raw, 'utf8').digest('hex').toUpperCase()
}

// ─── HTTP helper ────────────────────────────────────────────────────────────

async function kbzRequest(endpoint, payload) {
  const signed = { ...payload, sign: sign(payload) }
  const res = await fetch(`${baseUrl()}${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(signed),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(`kbzpay_http_${res.status}`)
    err.status = res.status
    err.body = json
    throw err
  }
  return json
}

// ─── capabilities ───────────────────────────────────────────────────────────

/**
 * createQR — create a KBZPay QR code for a customer to scan.
 * @param {object} o
 * @param {number}  o.amount       payment amount (in kyat, e.g. 5000)
 * @param {string}  o.orderId      your merchant order id (unique per transaction)
 * @param {string}  [o.title]      payment title shown in KBZPay app (max 256 chars)
 * @param {string}  [o.callbackUrl]  browser redirect after customer pays (optional deeplink)
 * @returns {Promise<{ ok:boolean, qrCode?:string, prepayId?:string, orderId?:string, reason?:string }>}
 */
export async function createQR({ amount, orderId, title = 'SuperMega Payment', callbackUrl = '' } = {}) {
  try {
    if (!configured()) return { ok: false, reason: 'kbzpay_not_configured' }
    if (!amount || !orderId) return { ok: false, reason: 'kbzpay_missing_amount_or_orderId' }

    const payload = {
      appid:          appId(),
      merch_code:     merchCode(),
      merch_order_id: String(orderId),
      trade_type:     'PAYSCORE',   // KBZPay standard merchant QR trade type
      title:          String(title).slice(0, 256),
      total_amount:   String(Math.round(Number(amount))),
      callback_url:   String(callbackUrl || ''),
      notify_url:     notifyUrl(),
      timestamp:      String(Math.floor(Date.now() / 1000)),
    }

    const data = await kbzRequest('precreate', payload)

    if (data.return_code !== 'SUCCESS') {
      return { ok: false, reason: `kbzpay_precreate_fail: ${data.return_msg || 'unknown'}` }
    }

    const result = data.result || {}
    return {
      ok:       true,
      qrCode:   result.qrCode   || result.qr_code   || null,
      prepayId: result.prepay_id || null,
      orderId:  String(orderId),
    }
  } catch (e) {
    return { ok: false, reason: String((e && e.message) || 'kbzpay_createQR_error').slice(0, 200) }
  }
}

/**
 * queryPayment — poll the payment status of an existing order.
 * @param {object} o
 * @param {string}  o.orderId   the merchant order id passed to createQR
 * @returns {Promise<{ ok:boolean, status?:string, tradeNo?:string, reason?:string }>}
 */
export async function queryPayment({ orderId } = {}) {
  try {
    if (!configured()) return { ok: false, reason: 'kbzpay_not_configured' }
    if (!orderId) return { ok: false, reason: 'kbzpay_missing_orderId' }

    const payload = {
      appid:          appId(),
      merch_code:     merchCode(),
      merch_order_id: String(orderId),
      timestamp:      String(Math.floor(Date.now() / 1000)),
    }

    const data = await kbzRequest('query', payload)

    if (data.return_code !== 'SUCCESS') {
      return { ok: false, reason: `kbzpay_query_fail: ${data.return_msg || 'unknown'}` }
    }

    const result = data.result || {}
    return {
      ok:      true,
      status:  result.trade_status || result.status || 'UNKNOWN',
      tradeNo: result.trade_no     || result.transaction_id || null,
      orderId: String(orderId),
    }
  } catch (e) {
    return { ok: false, reason: String((e && e.message) || 'kbzpay_queryPayment_error').slice(0, 200) }
  }
}

// ─── connector object ────────────────────────────────────────────────────────

export const paymentKbzpay = {
  key:      'payment-kbzpay',
  name:     'KBZPay',
  category: 'payment',
  docs:     'kernel/connectors/payment-kbzpay.mjs',
  configured,
  /**
   * health — KBZPay has no ping endpoint so we do a config-only check.
   * Returns ok:true only when all three required env vars are present.
   */
  async health() {
    const c = configured()
    if (!c) {
      const missing = [
        !appId()     && 'KBZPAY_APP_ID',
        !merchCode() && 'KBZPAY_MERCH_CODE',
        !appSecret() && 'KBZPAY_APP_SECRET',
      ].filter(Boolean).join(', ')
      return { ok: false, configured: false, detail: `missing env: ${missing}` }
    }
    const mode = isSandbox() ? 'sandbox (UAT)' : 'production'
    return { ok: true, configured: true, detail: `credentials present, ${mode}` }
  },
  createQR,
  queryPayment,
}

register(paymentKbzpay)
export default paymentKbzpay
