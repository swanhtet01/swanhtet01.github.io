// Connector: payment — Dinger (Myanmar wallets). Dinger is a Myanmar-native payment aggregator that
// puts KBZPay, WavePay, AYA Pay, CB Pay and card rails behind ONE API — so a Myanmar SMB on DeskPOS
// or the demo funnel can accept every local wallet through a single integration instead of wiring
// each bank one-by-one. That local-rail coverage is a moat: it's the payment layer Stripe/PayPal
// don't reach. Zero-dependency, native fetch only.
//
// category 'payment' · configured = DINGER_API_KEY + DINGER_MERCHANT_ID both present.
//
// Quick setup:
//   1. Onboard as a Dinger merchant → you receive a merchant id and an API key.
//   2. Set DINGER_MERCHANT_ID (your merchant id) and DINGER_API_KEY (Bearer token).
//   3. createPayment() opens a payment against your merchant; checkStatus() polls a transaction.
//
// Env:
//   DINGER_API_KEY      (required)  Bearer token for the Dinger API.
//   DINGER_MERCHANT_ID  (required)  your Dinger merchant id (sent with each request).
//
// Auth: HTTP Bearer. Authorization: 'Bearer ' + DINGER_API_KEY.
//
// Capabilities:
//   checkStatus({ transactionId }) — GET /api/v2/transaction/<id> (poll a transaction's state).
//   createPayment({ amount, method }) — POST /api/v2/payment (open a payment; method = wallet rail).

import { register } from './registry.mjs'

// Fixed, documented Dinger host. We do NOT read the base from env — there is no per-tenant host
// here, so hardcoding removes any chance of an env-driven SSRF target.
const API_BASE = 'https://api.dinger.asia'
const API_HOST = 'api.dinger.asia'

const apiKey = () => String(process.env.DINGER_API_KEY || '').trim()
const merchantId = () => String(process.env.DINGER_MERCHANT_ID || '').trim()

const configured = () => Boolean(apiKey() && merchantId())

const authHeader = () => `Bearer ${apiKey()}`

/**
 * dingerUrl — build an absolute Dinger API URL for the given path and re-validate its host.
 *
 * The path is a hardcoded constant from the caller (never env-derived), but we still confirm with
 * new URL() that we only ever contact the documented Dinger host over https (SSRF-safe).
 *
 * @param {string} apiPath  e.g. '/api/v2/payment'
 * @returns {string} absolute https URL on the Dinger host
 */
function dingerUrl(apiPath) {
  const url = `${API_BASE}${apiPath}`
  const u = new URL(url)
  if (u.protocol !== 'https:' || u.hostname.toLowerCase() !== API_HOST) {
    throw new Error('dinger_bad_host')
  }
  return url
}

/**
 * checkStatus — poll the state of a single Dinger transaction.
 *
 * GET /api/v2/transaction/<transactionId> returns the transaction record (status, amount, method,
 * timestamps). Read-only — a good liveness probe and the way to confirm a payment settled.
 *
 * @param {object} [payload]
 * @param {string} [payload.transactionId]  the Dinger transaction id to look up (required).
 * @returns {Promise<{ ok:boolean, status?:number, transaction?:object, reason?:string }>}
 */
export async function checkStatus(_input = {}) {
  const { transactionId } = _input || {}
  if (!configured()) return { ok: false, reason: 'payment-dinger_not_configured' }
  const id = String(transactionId || '').trim()
  if (!id) return { ok: false, reason: 'payment-dinger_missing_transaction_id' }

  try {
    const res = await fetch(dingerUrl(`/api/v2/transaction/${encodeURIComponent(id)}`), {
      method: 'GET',
      headers: {
        authorization: authHeader(),
        'x-merchant-id': merchantId(),
        'content-type': 'application/json',
        'user-agent': 'supermega-kernel/1.0',
      },
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const reason = data?.message || data?.error || `http_${res.status}`
      return { ok: false, status: res.status, reason: `payment-dinger_${String(reason)}`.slice(0, 200) }
    }
    return { ok: true, status: res.status, transaction: data }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'payment-dinger_error').slice(0, 200) }
  }
}

/**
 * createPayment — open a payment against the configured merchant.
 *
 * POST /api/v2/payment with the amount and the wallet rail (method, e.g. 'KBZPay' | 'WavePay' |
 * 'AYAPay' | 'CBPay'). Dinger returns the created transaction (id, pay url / deep link, status).
 *
 * @param {object} [payload]
 * @param {number|string} [payload.amount]  the amount to charge (required).
 * @param {string}        [payload.method]  the wallet rail to use (required).
 * @returns {Promise<{ ok:boolean, status?:number, payment?:object, reason?:string }>}
 */
export async function createPayment(_input = {}) {
  const { amount, method } = _input || {}
  if (!configured()) return { ok: false, reason: 'payment-dinger_not_configured' }
  const amt = String(amount ?? '').trim()
  const rail = String(method || '').trim()
  if (!amt) return { ok: false, reason: 'payment-dinger_missing_amount' }
  if (!rail) return { ok: false, reason: 'payment-dinger_missing_method' }

  const body = { merchantId: merchantId(), amount: amt, method: rail }

  try {
    const res = await fetch(dingerUrl('/api/v2/payment'), {
      method: 'POST',
      headers: {
        authorization: authHeader(),
        'x-merchant-id': merchantId(),
        'content-type': 'application/json',
        'user-agent': 'supermega-kernel/1.0',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const reason = data?.message || data?.error || `http_${res.status}`
      return { ok: false, status: res.status, reason: `payment-dinger_${String(reason)}`.slice(0, 200) }
    }
    return { ok: true, status: res.status, payment: data }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'payment-dinger_error').slice(0, 200) }
  }
}

export const paymentDinger = {
  key: 'payment-dinger',
  name: 'Dinger (Myanmar wallets)',
  category: 'payment',
  docs: 'kernel/connectors/payment-dinger.mjs',
  configured,
  /**
   * health — GET /api/v2/transaction/health is a cheap authenticated liveness probe: a 200 (or a
   * benign 404 "not found" for the sentinel id) confirms the Bearer key + merchant id reach Dinger.
   * We treat any non-error transport response as live; hard failures surface via detail.
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!configured()) return { ok: false, detail: 'missing DINGER_API_KEY or DINGER_MERCHANT_ID' }
    try {
      const res = await fetch(dingerUrl('/api/v2/transaction/health'), {
        method: 'GET',
        headers: {
          authorization: authHeader(),
          'x-merchant-id': merchantId(),
          'user-agent': 'supermega-kernel/1.0',
        },
        signal: AbortSignal.timeout(8000),
      })
      // 404 for the sentinel probe id still proves credentials reached Dinger's API.
      if (!res.ok && res.status !== 404) {
        const data = await res.json().catch(() => null)
        return { ok: false, detail: `dinger_${res.status}: ${(data?.message || data?.error || '')}`.slice(0, 160) }
      }
      return { ok: true, detail: `merchant=${merchantId()}`.slice(0, 160) }
    } catch (e) {
      return { ok: false, detail: String(e?.message || 'dinger_error').slice(0, 160) }
    }
  },
  checkStatus,
  createPayment,
}

register(paymentDinger)
export default paymentDinger
