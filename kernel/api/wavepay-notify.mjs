// WavePay IPN (Instant Payment Notification) receiver.
// WavePay POSTs this endpoint after a customer completes (or fails) a payment.
// The handler verifies the SHA-256 hash, logs the event, and returns HTTP 200.
//
// Signature: SHA-256 of merchant_id + store_id + order_id + amount + secret_key (hex lowercase)
//
// POST /api/wavepay-notify
// Env: WAVEPAY_MERCHANT_ID, WAVEPAY_STORE_ID, WAVEPAY_SECRET_KEY (same as connector)
import { verifyNotify } from '../connectors/payment-wavepay.mjs'

export const config = { api: { bodyParser: false } }

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > 64 * 1024) { reject(new Error('payload_too_large')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { reject(new Error('invalid_json')) }
    })
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, reason: 'method_not_allowed' })
    return
  }

  let body
  try {
    body = await readBody(req)
  } catch (e) {
    res.status(400).json({ ok: false, reason: 'invalid_request' })
    return
  }

  const result = verifyNotify(body)
  if (!result.ok) {
    console.warn('[wavepay-notify] rejected:', result.reason, JSON.stringify(body).slice(0, 200))
    res.status(400).json({ ok: false, reason: result.reason || 'invalid_signature' })
    return
  }

  const p = result.payload
  const status    = String(p.status     || 'UNKNOWN')
  const orderId   = String(p.order_id   || '')
  const requestId = String(p.request_id || '')
  const amount    = String(p.amount     || '')

  console.log('[WAVEPAY-NOTIFY]', JSON.stringify({ orderId, requestId, status, amount, ts: new Date().toISOString() }))

  // Hook: add order reconciliation here when you have a payment ledger.
  // e.g. update subscriptions.status = 'active' where wavepay_order_id = orderId
  // and status === 'SUCCESS'.
  // SECURITY (required when wiring the ledger — hash is verified above, but the ledger MUST also):
  //   1. Idempotency — process each request_id/order_id ONCE (IPNs are retried; non-idempotent
  //      reconciliation double-credits on retry).
  //   2. Amount check — confirm amount === the order's expected amount (the hash binds amount, but
  //      verify it matches what was actually charged).
  //   3. Status gate — only act on the explicit 'SUCCESS' status; never on UNKNOWN/missing/failed.

  res.status(200).json({ ok: true })
}
