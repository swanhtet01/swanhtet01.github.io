// Connector: payment — CB Pay (CB Bank Myanmar).
// CB Pay is CB Bank Myanmar's mobile payment platform. This connector creates merchant
// QR payment requests and queries payment status via the CB Pay Merchant API.
//
// category 'payment' · configured = CBPAY_MERCHANT_CODE + CBPAY_API_KEY + CBPAY_SECRET present.
//
// Quick setup:
//   1. Register as a merchant at https://www.cbbank.com.mm (CB Bank business account).
//   2. Get your Merchant Code, API Key, and Secret from the CB Pay merchant portal.
//   3. Set the env vars below.
//   4. Set CBPAY_SANDBOX=true during testing; remove or set to false for production.
//
// Env:
//   CBPAY_MERCHANT_CODE  (required)  merchant code from CB Pay merchant portal
//   CBPAY_API_KEY        (required)  API key from CB Pay merchant portal
//   CBPAY_SECRET         (required)  signing secret
//   CBPAY_NOTIFY_URL     (optional)  async callback URL (default: https://supermega.dev/api/cbpay-notify)
//   CBPAY_SANDBOX        (optional)  'true' to use sandbox/UAT endpoint

import crypto from 'node:crypto'
import { register } from './registry.mjs'

const merchantCode = () => String(process.env.CBPAY_MERCHANT_CODE || '').trim()
const apiKey       = () => String(process.env.CBPAY_API_KEY       || '').trim()
const secret       = () => String(process.env.CBPAY_SECRET        || '').trim()
const notifyUrl    = () => String(process.env.CBPAY_NOTIFY_URL    || 'https://supermega.dev/api/cbpay-notify').trim()
const isSandbox    = () => String(process.env.CBPAY_SANDBOX       || '').toLowerCase() === 'true'
const configured   = () => !!(merchantCode() && apiKey() && secret())

const BASE_URL = () => isSandbox()
  ? 'https://sandbox.cbpay.com.mm/api/v1/merchant/'
  : 'https://api.cbpay.com.mm/api/v1/merchant/'

function sign(params) {
  const s = secret()
  const sorted = Object.keys(params)
    .filter(k => k !== 'sign' && params[k] != null && params[k] !== '')
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&')
  return crypto.createHmac('sha256', s).update(`${sorted}&secret=${s}`).digest('hex').toUpperCase()
}

async function cbRequest(path, payload) {
  const signed = { ...payload, sign: sign(payload) }
  const res = await fetch(`${BASE_URL()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey(),
      'User-Agent': 'supermega-kernel/1.0',
    },
    body: JSON.stringify(signed),
    signal: AbortSignal.timeout(10000),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(`cbpay_http_${res.status}`)
    err.status = res.status
    err.body = json
    throw err
  }
  return json
}

/**
 * createQR — generate a CB Pay QR code for a customer to scan.
 *
 * @param {object} o
 * @param {number}  o.amount       amount in kyat
 * @param {string}  o.orderId      unique merchant order ID
 * @param {string}  [o.title]      payment description shown in CB Pay app
 * @param {string}  [o.callbackUrl] redirect URL after payment
 * @returns {Promise<{ ok:boolean, qrCode?:string, orderId?:string, reason?:string }>}
 */
export async function createQR(_input = {}) {
  const { amount, orderId, title = 'SUPERMEGA Payment', callbackUrl = '' } = _input || {}
  if (!configured()) return { ok: false, reason: 'cbpay_not_configured' }
  if (!amount || !orderId) return { ok: false, reason: 'cbpay_missing_amount_or_orderId' }
  try {
    const payload = {
      merchant_code:  merchantCode(),
      order_id:       String(orderId),
      amount:         String(Math.round(Number(amount))),
      currency:       'MMK',
      description:    String(title).slice(0, 256),
      callback_url:   String(callbackUrl || ''),
      notify_url:     notifyUrl(),
      timestamp:      String(Date.now()),
    }
    const data = await cbRequest('qr/generate', payload)
    if (data.result_code !== '0' && data.status !== 'SUCCESS') {
      return { ok: false, reason: `cbpay_create_fail: ${data.result_message || data.message || 'unknown'}` }
    }
    return {
      ok: true,
      qrCode: data.qr_string || data.qr_code || data.data?.qr_string || null,
      orderId: String(orderId),
    }
  } catch (e) {
    return { ok: false, reason: String(e.message || 'cbpay_createQR_error').slice(0, 200) }
  }
}

/**
 * queryPayment — poll payment status for an order.
 *
 * @param {object} o
 * @param {string}  o.orderId  the merchant order ID passed to createQR
 * @returns {Promise<{ ok:boolean, status?:string, transactionId?:string, reason?:string }>}
 */
export async function queryPayment(_input = {}) {
  const { orderId } = _input || {}
  if (!configured()) return { ok: false, reason: 'cbpay_not_configured' }
  if (!orderId) return { ok: false, reason: 'cbpay_missing_orderId' }
  try {
    const payload = {
      merchant_code: merchantCode(),
      order_id:      String(orderId),
      timestamp:     String(Date.now()),
    }
    const data = await cbRequest('qr/status', payload)
    if (data.result_code !== '0' && data.status !== 'SUCCESS') {
      return { ok: false, reason: `cbpay_query_fail: ${data.result_message || data.message || 'unknown'}` }
    }
    return {
      ok:            true,
      status:        data.payment_status || data.transaction_status || 'UNKNOWN',
      transactionId: data.transaction_id || data.cb_ref_no || null,
      orderId:       String(orderId),
    }
  } catch (e) {
    return { ok: false, reason: String(e.message || 'cbpay_queryPayment_error').slice(0, 200) }
  }
}

export const paymentCbpay = {
  key:      'payment-cbpay',
  name:     'CB Pay',
  category: 'payment',
  docs:     'kernel/connectors/payment-cbpay.mjs',
  configured,
  async health() {
    if (!configured()) {
      const missing = [
        !merchantCode() && 'CBPAY_MERCHANT_CODE',
        !apiKey()       && 'CBPAY_API_KEY',
        !secret()       && 'CBPAY_SECRET',
      ].filter(Boolean).join(', ')
      return { ok: false, configured: false, detail: `missing env: ${missing}` }
    }
    const mode = isSandbox() ? 'sandbox' : 'production'
    return { ok: true, configured: true, detail: `credentials present, ${mode}` }
  },
  createQR,
  queryPayment,
}

register(paymentCbpay)
export default paymentCbpay
