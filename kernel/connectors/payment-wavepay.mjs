// Connector: payment — WavePay merchant wallet (Myanmar / YOMA Bank).
//
// WavePay is Myanmar's second largest mobile wallet. This connector talks to their merchant
// gateway to:
//   1. createQR       — POST /payment/create: generate a WavePay QR code for a customer to scan.
//   2. queryPayment   — POST /payment/check: poll payment status by merchant order id.
//   3. health         — no-network config check (no dedicated ping endpoint).
//
// Auth: SHA-256 of merchant_id + store_id + order_id + amount + secret_key (hex, lowercase).
// Base: https://gateway.wavemoney.io/
//
// Env:
//   WAVEPAY_MERCHANT_ID   (required)  merchant id issued by WavePay / YOMA Bank
//   WAVEPAY_STORE_ID      (required)  store id issued by WavePay / YOMA Bank
//   WAVEPAY_SECRET_KEY    (required)  signing secret

import crypto from 'node:crypto'
import { register } from './registry.mjs'

// ─── env helpers ────────────────────────────────────────────────────────────

const merchantId = () => String(process.env.WAVEPAY_MERCHANT_ID || '').trim()
const storeId    = () => String(process.env.WAVEPAY_STORE_ID    || '').trim()
const secretKey  = () => String(process.env.WAVEPAY_SECRET_KEY  || '').trim()
const configured = () => !!(merchantId() && storeId() && secretKey())

const BASE = 'https://gateway.wavemoney.io'

// ─── signing ────────────────────────────────────────────────────────────────

/**
 * WavePay sign method:
 *   SHA-256 of concatenated: merchant_id + store_id + order_id + amount + secret_key
 *   Returns lowercase hex digest.
 */
function sign(orderId, amount) {
  const raw = merchantId() + storeId() + String(orderId) + String(amount) + secretKey()
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex')
}

// ─── HTTP helper ────────────────────────────────────────────────────────────

async function waveRequest(path, payload) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(`wavepay_http_${res.status}`)
    err.status = res.status
    err.body = json
    throw err
  }
  return json
}

// ─── capabilities ───────────────────────────────────────────────────────────

/**
 * createQR — create a WavePay QR code for a customer to scan.
 * @param {object} o
 * @param {number}  o.amount       payment amount in MMK (e.g. 5000)
 * @param {string}  o.orderId      your merchant order id (unique per transaction)
 * @param {string}  [o.description] payment description shown in WavePay app
 * @returns {Promise<{ ok:boolean, qrString?:string, requestId?:string, orderId?:string, reason?:string }>}
 */
export async function createQR(_input = {}) {
  const { amount, orderId, description = 'SuperMega Payment' } = _input || {}
  try {
    if (!configured()) return { ok: false, reason: 'wavepay_not_configured' }
    if (!amount || !orderId) return { ok: false, reason: 'wavepay_missing_amount_or_orderId' }

    const payload = {
      merchant_id:  merchantId(),
      store_id:     storeId(),
      order_id:     String(orderId),
      amount:       String(Math.round(Number(amount))),
      description:  String(description).slice(0, 256),
      currency:     'MMK',
      timestamp:    new Date().toISOString(),
      hash:         sign(orderId, Math.round(Number(amount))),
    }

    const data = await waveRequest('/payment/create', payload)

    if (data.status !== 'CREATED') {
      return { ok: false, reason: `wavepay_create_fail: ${data.status || 'unknown'}` }
    }

    return {
      ok:        true,
      qrString:  data.qr_string  || null,
      requestId: data.request_id || null,
      orderId:   String(orderId),
    }
  } catch (e) {
    return { ok: false, reason: String((e && e.message) || 'wavepay_createQR_error').slice(0, 200) }
  }
}

/**
 * queryPayment — poll the payment status of an existing order.
 * @param {object} o
 * @param {string}  o.orderId   the merchant order id passed to createQR
 * @returns {Promise<{ ok:boolean, status?:string, requestId?:string, reason?:string }>}
 */
export async function queryPayment(_input = {}) {
  const { orderId } = _input || {}
  try {
    if (!configured()) return { ok: false, reason: 'wavepay_not_configured' }
    if (!orderId) return { ok: false, reason: 'wavepay_missing_orderId' }

    // For query, hash is merchant_id + store_id + order_id + secret_key (no amount)
    const raw = merchantId() + storeId() + String(orderId) + secretKey()
    const hash = crypto.createHash('sha256').update(raw, 'utf8').digest('hex')

    const payload = {
      merchant_id: merchantId(),
      order_id:    String(orderId),
      hash,
    }

    const data = await waveRequest('/payment/check', payload)

    return {
      ok:        true,
      status:    data.status     || 'UNKNOWN',
      requestId: data.request_id || null,
      orderId:   String(orderId),
    }
  } catch (e) {
    return { ok: false, reason: String((e && e.message) || 'wavepay_queryPayment_error').slice(0, 200) }
  }
}

// ─── notify verification ────────────────────────────────────────────────────

/**
 * verifyNotify — verify an incoming WavePay IPN callback.
 * WavePay sends: merchant_id, store_id, order_id, amount, status, request_id, hash
 * Hash: SHA-256 of merchant_id + store_id + order_id + amount + secret_key
 * @param {object} body  parsed JSON body from the callback POST
 * @returns {{ ok:boolean, payload?:object, reason?:string }}
 */
export function verifyNotify(body) {
  try {
    if (!body || typeof body !== 'object') return { ok: false, reason: 'invalid_payload' }
    if (!configured()) return { ok: false, reason: 'wavepay_not_configured' }
    const incomingHash = String(body.hash || '')
    if (!incomingHash) return { ok: false, reason: 'missing_hash' }
    const expected = sign(body.order_id, body.amount)
    const a = Buffer.from(incomingHash.padEnd(64, '\0'))
    const b = Buffer.from(expected.padEnd(64, '\0'))
    if (!crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'signature_mismatch' }
    return { ok: true, payload: body }
  } catch (e) {
    return { ok: false, reason: String(e.message).slice(0, 120) }
  }
}

// ─── connector object ────────────────────────────────────────────────────────

export const paymentWavepay = {
  key:      'payment-wavepay',
  name:     'WavePay',
  category: 'payment',
  docs:     'kernel/connectors/payment-wavepay.mjs',
  configured,
  /**
   * health — WavePay has no ping endpoint so we do a config-only check.
   * Returns ok:true only when all three required env vars are present.
   */
  async health() {
    const c = configured()
    if (!c) {
      const missing = [
        !merchantId() && 'WAVEPAY_MERCHANT_ID',
        !storeId()    && 'WAVEPAY_STORE_ID',
        !secretKey()  && 'WAVEPAY_SECRET_KEY',
      ].filter(Boolean).join(', ')
      return { ok: false, configured: false, detail: `missing env: ${missing}` }
    }
    return { ok: true, configured: true, detail: 'credentials present' }
  },
  createQR,
  queryPayment,
}

register(paymentWavepay)
export default paymentWavepay
