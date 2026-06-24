// Connector: payment — Stripe. A REAL NEW connector (the proof the framework works end-to-end).
// category 'payment' · configured = STRIPE_SECRET_KEY present.
//
// Zero-dependency: talks to Stripe's REST API with native fetch + the same retry-light style as
// gateway.mjs. No `stripe` SDK required (so the kernel stays dep-free). If you later add the SDK,
// you can swap the fetch calls without touching the registry interface.
//
// Capabilities beyond the interface:
//   createCheckout({ amount, currency, ref })  -> { url, id }   (Stripe Checkout Session)
//   verifyWebhook(rawBody, sig)                 -> { ok, event } (idempotent signature check)
//
// Env:
//   STRIPE_SECRET_KEY        (required)  sk_live_... / sk_test_...
//   STRIPE_WEBHOOK_SECRET    (optional)  whsec_...   — needed for verifyWebhook
//   STRIPE_SUCCESS_URL       (optional)  redirect after pay   (default supermega.dev/thanks)
//   STRIPE_CANCEL_URL        (optional)  redirect on cancel   (default supermega.dev/offers)

import crypto from 'node:crypto'
import { register } from './registry.mjs'
import store from '../store.mjs'

const API = 'https://api.stripe.com/v1'
const secret = () => String(process.env.STRIPE_SECRET_KEY || '').trim()
const webhookSecret = () => String(process.env.STRIPE_WEBHOOK_SECRET || '').trim()
const configured = () => /^sk_(live|test)_/.test(secret())

// Stripe wants application/x-www-form-urlencoded with bracketed nested keys (foo[bar]=baz).
function formEncode(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue
    const key = prefix ? `${prefix}[${k}]` : k
    if (typeof v === 'object' && !Array.isArray(v)) formEncode(v, key, out)
    else if (Array.isArray(v)) v.forEach((item, i) => formEncode({ [i]: item }, key, out))
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`)
  }
  return out.join('&')
}

async function stripe(method, path, params, idempotencyKey) {
  const key = secret()
  if (!key) throw new Error('stripe_missing_secret_key')
  const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/x-www-form-urlencoded' }
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: params ? formEncode(params) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(`stripe_${res.status}: ${json?.error?.message || ''}`.slice(0, 200))
    err.status = res.status
    err.stripe = json?.error || null
    throw err
  }
  return json
}

/**
 * createCheckout — a hosted Stripe Checkout Session for a one-off payment.
 * @param {object} o
 * @param {number} o.amount     amount in MAJOR units (e.g. 49 = $49.00). Converted to cents here.
 * @param {string} [o.currency='usd']
 * @param {string} [o.ref]      your reference (project id, deal id...) — stored in metadata + idem key.
 * @param {string} [o.description]
 * @returns {Promise<{ id:string, url:string, ref:string|null }>}
 */
export async function createCheckout({ amount, currency = 'usd', ref = null, description } = {}) {
  if (!configured()) throw new Error('stripe_not_configured')
  const cents = Math.round(Number(amount) * 100)
  if (!Number.isFinite(cents) || cents <= 0) throw new Error('stripe_bad_amount')
  const params = {
    mode: 'payment',
    success_url: process.env.STRIPE_SUCCESS_URL || 'https://supermega.dev/thanks?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: process.env.STRIPE_CANCEL_URL || 'https://supermega.dev/offers',
    'line_items[0][quantity]': 1,
    'line_items[0][price_data][currency]': currency,
    'line_items[0][price_data][unit_amount]': cents,
    'line_items[0][price_data][product_data][name]': description || (ref ? `SuperMega ${ref}` : 'SuperMega'),
  }
  if (ref) params['metadata[ref]'] = String(ref).slice(0, 200)
  // Idempotent on ref so a double-click doesn't create two sessions for the same project.
  const idem = ref ? `checkout_${ref}` : `checkout_${crypto.randomUUID()}`
  const session = await stripe('POST', '/checkout/sessions', params, idem)
  return { id: session.id, url: session.url, ref }
}

// Tracks webhook event ids we've already processed (per warm instance) so re-deliveries are no-ops.
// TODO(spine): back this with store.mjs (a supermega_console_webhooks table) so idempotency survives
// cold starts and is shared across instances — same caveat as the gateway's in-memory ledger.
const seenEvents = new Set()

// Events we've already reconciled into the store (per warm instance), so a re-delivery doesn't
// double-log even if it slips past the seenEvents check (e.g. reconcile() called directly).
const reconciledEvents = new Set()

/**
 * reconcile — record a verified Stripe event into the data spine, idempotently. On a completed
 * checkout we mark the referenced project's deposit as paid and append an activity row. Best-effort:
 * any store error is swallowed and returned in the result so the webhook still 200s (Stripe retries
 * are then a no-op via the idempotency guards). Safe to call with any verified event — non-payment
 * events are ignored.
 * @param {object} event  the parsed, signature-verified Stripe event
 * @returns {Promise<{ ok:boolean, handled:boolean, ref?:string|null, duplicate?:boolean, detail?:string }>}
 */
export async function reconcile(event) {
  try {
    if (!event || typeof event !== 'object') return { ok: false, handled: false, detail: 'no_event' }
    // Only settle on a completed checkout (or an async payment that later succeeded).
    const type = event.type
    if (type !== 'checkout.session.completed' && type !== 'checkout.session.async_payment_succeeded') {
      return { ok: true, handled: false, detail: `ignored:${type || 'unknown'}` }
    }
    if (event.id && reconciledEvents.has(event.id)) return { ok: true, handled: true, duplicate: true }

    const obj = (event.data && event.data.object) || {}
    const ref = (obj.metadata && obj.metadata.ref) || null
    // Only treat it as paid when Stripe says so (defensive — async flows can fire on 'unpaid').
    const paid = obj.payment_status === 'paid' || obj.status === 'complete'

    if (ref && paid) {
      // Mark the matching project's deposit paid. updateProject is a no-op if the id doesn't exist
      // in the active store mode, so this is safe even when ref points at a non-project reference.
      await store.updateProject(String(ref), { deposit_status: 'paid', deposit_method: 'stripe' }).catch(() => null)
    }
    // Always log the confirmed payment (best-effort; logActivity never throws).
    await store.logActivity({ kind: 'deposit', summary: `Stripe payment confirmed${ref ? ` (${ref})` : ''}`, ref })

    if (event.id) reconciledEvents.add(event.id)
    return { ok: true, handled: true, ref, duplicate: false }
  } catch (e) {
    return { ok: false, handled: false, detail: String((e && e.message) || 'reconcile_error').slice(0, 160) }
  }
}

/** Constant-time hex compare so signature checks don't leak timing. */
function timingSafeEqualHex(a, b) {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

/**
 * verifyWebhook — verify a Stripe webhook signature WITHOUT the SDK, then dedupe by event id.
 * Implements Stripe's scheme: header `t=...,v1=...`; signed payload is `${t}.${rawBody}`,
 * HMAC-SHA256 keyed by the whsec. Idempotent: a re-delivered event returns { ok, duplicate:true }.
 * @param {string|Buffer} rawBody  the EXACT raw request body (do not parse before calling)
 * @param {string} sig             the `Stripe-Signature` header value
 * @param {object} [o]
 * @param {number} [o.toleranceSec=300]  reject timestamps older than this (replay defense)
 * @returns {{ ok:boolean, event?:object, duplicate?:boolean, reason?:string }}
 */
export function verifyWebhook(rawBody, sig, { toleranceSec = 300 } = {}) {
  const whsec = webhookSecret()
  if (!whsec) return { ok: false, reason: 'no_webhook_secret' }
  if (!sig) return { ok: false, reason: 'no_signature' }
  const raw = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '')

  const parts = Object.fromEntries(sig.split(',').map((p) => p.split('=').map((s) => s.trim())))
  const t = parts.t
  const v1 = parts.v1
  if (!t || !v1) return { ok: false, reason: 'malformed_signature' }

  const expected = crypto.createHmac('sha256', whsec).update(`${t}.${raw}`).digest('hex')
  if (!timingSafeEqualHex(expected, v1)) return { ok: false, reason: 'signature_mismatch' }

  const ageSec = Math.abs(Math.floor(Date.now() / 1000) - Number(t))
  if (Number.isFinite(ageSec) && ageSec > toleranceSec) return { ok: false, reason: 'timestamp_out_of_tolerance' }

  let event
  try { event = JSON.parse(raw) } catch { return { ok: false, reason: 'bad_json' } }

  if (event.id && seenEvents.has(event.id)) return { ok: true, duplicate: true, event }
  if (event.id) seenEvents.add(event.id)

  // Reconcile the verified event into the data spine. Fire-and-forget so verifyWebhook stays
  // synchronous (callers depend on the sync signature) — reconcile() is internally best-effort and
  // never throws. Callers that want to await settlement can call reconcile(event) directly with the
  // returned event. Idempotent: re-deliveries are caught by seenEvents above and reconciledEvents.
  Promise.resolve().then(() => reconcile(event)).catch(() => {})

  return { ok: true, event, duplicate: false }
}

const configuredFn = configured // alias for clarity in the connector object below

export const paymentStripe = {
  key: 'payment-stripe',
  name: 'Stripe',
  category: 'payment',
  docs: 'kernel/connectors/payment-stripe.mjs',
  configured: configuredFn,
  // Cheap real probe: GET /v1/balance is a free, read-only auth check.
  async health() {
    if (!configured()) return { ok: false, detail: 'missing STRIPE_SECRET_KEY' }
    try {
      await stripe('GET', '/balance')
      const mode = secret().startsWith('sk_live_') ? 'live' : 'test'
      return { ok: true, detail: `auth ok (${mode}${webhookSecret() ? ', webhook set' : ', no webhook secret'})` }
    } catch (e) {
      return { ok: false, detail: String(e.message || 'stripe_error').slice(0, 160) }
    }
  },
  // capabilities exposed on the connector for callers that get() it from the registry:
  createCheckout,
  verifyWebhook,
  reconcile,
}

register(paymentStripe)
export default paymentStripe
