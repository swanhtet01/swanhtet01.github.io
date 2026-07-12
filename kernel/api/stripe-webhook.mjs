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

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
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
  } catch {
    res.status(400).json({ ok: false, reason: 'body_read_error' })
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
    await captureError('stripe-webhook reconcile failed', settled.detail, { event: result.event?.id || '?', type: result.event?.type || '?' }).catch(() => {})
    res.status(500).json({ ok: false, reason: settled.detail || 'reconcile_failed' })
    return
  }
  res.status(200).json({ ok: true, duplicate: result.duplicate || settled.duplicate || false, handled: settled.handled, ref: settled.ref, mismatch: settled.mismatch || false })
}
