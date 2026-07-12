// KBZPay IPN (Instant Payment Notification) receiver.
// KBZPay POSTs this endpoint after a customer completes (or fails) a payment.
// The handler verifies the MD5 signature, logs the event, and returns the
// required {"return_code":"SUCCESS"} acknowledgment.
//
// Signature verification uses the same sign() function as the QR-create flow:
//   MD5 of sorted key=value pairs (excluding `sign`) + &key=APP_SECRET, uppercase hex.
//
// POST /api/kbzpay-notify
// Env: KBZPAY_APP_SECRET (required — same secret as the connector)
import { verifyNotify } from '../connectors/payment-kbzpay.mjs'

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
    res.status(405).json({ return_code: 'FAIL', return_msg: 'method_not_allowed' })
    return
  }

  let body
  try {
    body = await readBody(req)
  } catch (e) {
    res.status(400).json({ return_code: 'FAIL', return_msg: 'invalid_request' })
    return
  }

  const result = verifyNotify(body)
  if (!result.ok) {
    console.warn('[kbzpay-notify] rejected:', result.reason, JSON.stringify(body).slice(0, 200))
    res.status(400).json({ return_code: 'FAIL', return_msg: result.reason || 'invalid_signature' })
    return
  }

  const p = result.payload
  const status = String(p.trade_status || p.status || 'UNKNOWN')
  const orderId = String(p.merch_order_id || '')
  const tradeNo = String(p.trade_no || '')
  const amount  = String(p.total_amount || '')

  console.log('[KBZPAY-NOTIFY]', JSON.stringify({ orderId, tradeNo, status, amount, ts: new Date().toISOString() }))

  // Hook: add order reconciliation here when you have a payment ledger.
  // e.g. update subscriptions.status = 'active' where kbzpay_order_id = orderId
  // and status === 'PAY_SUCCESS'.
  // SECURITY (required when wiring the ledger — signature is verified above, but the ledger MUST also):
  //   1. Idempotency — process each trade_no ONCE (KBZPay retries IPNs; a non-idempotent ledger
  //      double-credits on retry).
  //   2. Amount check — confirm total_amount === the order's expected amount (the sig binds amount,
  //      but verify it matches what was actually charged, not just that it's internally consistent).
  //   3. Status gate — only act on the explicit success status; never on UNKNOWN/missing/failed.

  res.status(200).json({ return_code: 'SUCCESS', return_msg: 'OK' })
}
