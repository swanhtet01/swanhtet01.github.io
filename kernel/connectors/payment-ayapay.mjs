// Connector: payment — AYA Pay (AYA Bank Myanmar).
// AYA Pay is one of Myanmar's major mobile wallets (AYA Bank). This connector creates
// merchant QR payment requests and queries payment status via the AYA Pay Merchant API.
//
// category 'payment' · configured = AYAPAY_MERCHANT_ID + AYAPAY_API_KEY + AYAPAY_SECRET present.
//
// Quick setup:
//   1. Register as a merchant at https://www.ayabank.com/en_US/aya-pay (business account).
//   2. Get your Merchant ID, API Key, and Secret from the AYA Pay merchant portal.
//   3. Set the env vars below.
//   4. Set AYAPAY_SANDBOX=true during testing; remove or set to false for production.
//
// Env:
//   AYAPAY_MERCHANT_ID   (required)  merchant ID from AYA Pay merchant portal
//   AYAPAY_API_KEY       (required)  API key from AYA Pay merchant portal
//   AYAPAY_SECRET        (required)  signing secret
//   AYAPAY_NOTIFY_URL    (optional)  async callback URL (default: https://supermega.dev/api/ayapay-notify)
//   AYAPAY_SANDBOX       (optional)  'true' to use sandbox/UAT endpoint

import crypto from 'node:crypto'
import { register } from './registry.mjs'

const merchantId  = () => String(process.env.AYAPAY_MERCHANT_ID || '').trim()
const apiKey      = () => String(process.env.AYAPAY_API_KEY     || '').trim()
const secret      = () => String(process.env.AYAPAY_SECRET      || '').trim()
const notifyUrl   = () => String(process.env.AYAPAY_NOTIFY_URL  || 'https://supermega.dev/api/ayapay-notify').trim()
const isSandbox   = () => String(process.env.AYAPAY_SANDBOX     || '').toLowerCase() === 'true'
const configured  = () => !!(merchantId() && apiKey() && secret())

const BASE_URL = () => isSandbox()
  ? 'https://sandbox.ayapay.com.mm/merchant/api/v1/'
  : 'https://api.ayapay.com.mm/merchant/api/v1/'

function sign(params) {
  const s = secret()
  const sorted = Object.keys(params)
    .filter(k => k !== 'sign' && params[k] != null && params[k] !== '')
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&')
  return crypto.createHmac('sha256', s).update(`${sorted}&key=${s}`).digest('hex').toUpperCase()
}

async function ayaRequest(path, payload) {
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
    const err = new Error(`ayapay_http_${res.status}`)
    err.status = res.status
    err.body = json
    throw err
  }
  return json
}

/**
 * createQR — generate an AYA Pay QR code for a customer to scan.
 *
 * @param {object} o
 * @param {number}  o.amount       amount in kyat
 * @param {string}  o.orderId      unique merchant order ID
 * @param {string}  [o.title]      payment title shown in AYA Pay app
 * @param {string}  [o.callbackUrl] redirect URL after payment
 * @returns {Promise<{ ok:boolean, qrCode?:string, orderId?:string, reason?:string }>}
 */
export async function createQR(_input = {}) {
  const { amount, orderId, title = 'SUPERMEGA Payment', callbackUrl = '' } = _input || {}
  if (!configured()) return { ok: false, reason: 'ayapay_not_configured' }
  if (!amount || !orderId) return { ok: false, reason: 'ayapay_missing_amount_or_orderId' }
  try {
    const payload = {
      merchant_id:    merchantId(),
      order_id:       String(orderId),
      amount:         String(Math.round(Number(amount))),
      currency:       'MMK',
      title:          String(title).slice(0, 256),
      callback_url:   String(callbackUrl || ''),
      notify_url:     notifyUrl(),
      timestamp:      String(Date.now()),
    }
    const data = await ayaRequest('qr/create', payload)
    if (data.code !== '000' && data.status !== 'SUCCESS') {
      return { ok: false, reason: `ayapay_create_fail: ${data.message || data.msg || 'unknown'}` }
    }
    return {
      ok: true,
      qrCode: data.qr_code || data.qrCode || data.data?.qr_code || null,
      orderId: String(orderId),
    }
  } catch (e) {
    return { ok: false, reason: String(e.message || 'ayapay_createQR_error').slice(0, 200) }
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
  if (!configured()) return { ok: false, reason: 'ayapay_not_configured' }
  if (!orderId) return { ok: false, reason: 'ayapay_missing_orderId' }
  try {
    const payload = {
      merchant_id: merchantId(),
      order_id:    String(orderId),
      timestamp:   String(Date.now()),
    }
    const data = await ayaRequest('qr/query', payload)
    if (data.code !== '000' && data.status !== 'SUCCESS') {
      return { ok: false, reason: `ayapay_query_fail: ${data.message || data.msg || 'unknown'}` }
    }
    return {
      ok:            true,
      status:        data.payment_status || data.status || 'UNKNOWN',
      transactionId: data.transaction_id || data.txn_id || null,
      orderId:       String(orderId),
    }
  } catch (e) {
    return { ok: false, reason: String(e.message || 'ayapay_queryPayment_error').slice(0, 200) }
  }
}

export const paymentAyapay = {
  key:      'payment-ayapay',
  name:     'AYA Pay',
  category: 'payment',
  docs:     'kernel/connectors/payment-ayapay.mjs',
  configured,
  async health() {
    if (!configured()) {
      const missing = [
        !merchantId() && 'AYAPAY_MERCHANT_ID',
        !apiKey()     && 'AYAPAY_API_KEY',
        !secret()     && 'AYAPAY_SECRET',
      ].filter(Boolean).join(', ')
      return { ok: false, configured: false, detail: `missing env: ${missing}` }
    }
    const mode = isSandbox() ? 'sandbox' : 'production'
    return { ok: true, configured: true, detail: `credentials present, ${mode}` }
  },
  createQR,
  queryPayment,
}

register(paymentAyapay)
export default paymentAyapay
