// Stripe webhook receiver — verifies the Stripe-Signature header, then reconciles the
// verified event into the data spine. Must NOT be gated by x-ops-key; Stripe's own
// HMAC-SHA256 signature (STRIPE_WEBHOOK_SECRET) is the auth mechanism.
//
// Raw body is required for signature verification — we read the stream directly rather
// than relying on Vercel's body-parser middleware (which would corrupt the HMAC).
//
// POST /api/stripe-webhook
// Env: STRIPE_WEBHOOK_SECRET (required for production), STRIPE_SECRET_KEY (required)
import { verifyWebhook, reconcile } from '../connectors/payment-stripe.mjs'
import { captureError } from '../alert.mjs'

export const config = { api: { bodyParser: false } }
const MAX_BODY_BYTES = 1024 * 1024
const BODY_READ_TIMEOUT_MS = 10_000

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let finished = false
    const fail = (code) => {
      if (finished) return
      finished = true
      clearTimeout(deadline)
      chunks.length = 0
      reject(Object.assign(new Error(code), { code }))
    }
    const deadline = setTimeout(() => fail('body_read_timeout'), BODY_READ_TIMEOUT_MS)
    req.on('data', (c) => {
      if (finished) return
      size += c.length
      if (size > MAX_BODY_BYTES) return fail('body_too_large')
      chunks.push(c)
    })
    req.on('end', () => {
      if (finished) return
      finished = true
      clearTimeout(deadline)
      resolve(Buffer.concat(chunks))
    })
    req.on('error', () => fail('body_read_error'))
    req.on('aborted', () => fail('body_read_error'))
    req.on('close', () => fail('body_read_error'))
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, reason: 'method_not_allowed' })
    return
  }
  let rawBody
  try {
    rawBody = await readRawBody(req)
  } catch (error) {
    const oversized = error.code === 'body_too_large'
    const timedOut = error.code === 'body_read_timeout'
    res.status(oversized ? 413 : timedOut ? 408 : 400).json({ ok: false, reason: oversized ? 'body_too_large' : timedOut ? 'body_read_timeout' : 'body_read_error' })
    return
  }
  const sig = req.headers['stripe-signature'] || ''
  const result = verifyWebhook(rawBody, sig)
  if (!result.ok) {
    res.status(400).json({ ok: false, reason: result.reason || 'invalid_signature' })
    return
  }
  // Await reconciliation so the deposit state + activity log are durably committed before we 200.
  const settled = await reconcile(result.event)
  // Genuine persistence error → 5xx so Stripe RETRIES (don't silently ack money we failed to record).
  // Everything else (handled / ignored / duplicate / amount-mismatch) is a definitive ack → 200.
  if (settled.ok === false) {
    // Alert — a verified payment we failed to persist is the highest-severity money event.
    // Database exception text may contain connection details or customer data.
    // Keep the public response and outbound alert limited to a stable code.
    await captureError('stripe-webhook reconcile failed', 'reconcile_failed').catch(() => {})
    res.status(500).json({ ok: false, reason: 'reconcile_failed' })
    return
  }
  res.status(200).json({ ok: true, duplicate: result.duplicate || settled.duplicate || false, handled: settled.handled, ref: settled.ref, mismatch: settled.mismatch || false })
}
