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
import { captureError } from '../alert.mjs'

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
    signal: AbortSignal.timeout(10000),
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
  if (!configured()) return { ok: false, reason: 'stripe_not_configured' }
  const cents = Math.round(Number(amount) * 100)
  if (!Number.isFinite(cents) || cents <= 0) return { ok: false, reason: 'stripe_bad_amount' }
  try {
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
    // Bind the expected charge into session metadata so the webhook can verify amount/currency
    // integrity. Metadata is covered by Stripe's event signature, so a replayer cannot alter it.
    params['metadata[expected_cents]'] = cents
    params['metadata[currency]'] = currency
    // Idempotent on ref+amount+currency so a double-click reuses the session, but a RE-PRICED ref
    // (changed amount) yields a NEW session instead of Stripe replaying/erroring on the old amount.
    const idem = ref ? `checkout_${ref}_${cents}_${currency}` : `checkout_${crypto.randomUUID()}`
    const session = await stripe('POST', '/checkout/sessions', params, idem)
    return { ok: true, id: session.id, url: session.url, ref }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'stripe_checkout_error').slice(0, 200) }
  }
}

// Tracks webhook event ids we've already processed (per warm instance) so re-deliveries are no-ops.
// TODO(spine): back this with store.mjs (a supermega_console_webhooks table) so idempotency survives
// cold starts and is shared across instances — same caveat as the gateway's in-memory ledger.
const seenEvents = new Set()

/**
 * reconcile — record a verified Stripe event into the data spine, IDEMPOTENTLY and with AMOUNT
 * integrity. Enterprise-hardened:
 *  - Persistent dedup via store.recordPaymentEvent (survives serverless cold starts / many instances).
 *  - Amount/currency verified against the value bound into the session metadata at creation (which is
 *    covered by Stripe's signature → a replayer cannot reuse a small payment's event for a big project).
 *  - Conditional mark-paid (store.markDepositPaid only flips an 'unpaid' project) so a re-delivery never
 *    re-flips state or double-logs the deposit.
 * Returns ok:false ONLY on a genuine persistence error so the HTTP handler can 5xx → Stripe retries.
 * @param {object} event  the parsed, signature-verified Stripe event
 * @returns {Promise<{ ok:boolean, handled:boolean, ref?:string|null, paid?:boolean, duplicate?:boolean, mismatch?:boolean, detail?:string }>}
 */
export async function reconcile(event) {
  try {
    if (!event || typeof event !== 'object') return { ok: false, handled: false, detail: 'no_event' }
    // Only settle on a completed checkout (or an async payment that later succeeded).
    const type = event.type
    if (type !== 'checkout.session.completed' && type !== 'checkout.session.async_payment_succeeded') {
      return { ok: true, handled: false, detail: `ignored:${type || 'unknown'}` }
    }

    const obj = (event.data && event.data.object) || {}
    const ref = (obj.metadata && obj.metadata.ref) || null
    // Treat as paid ONLY on a settled payment_status — NOT session status 'complete' (can be 'unpaid'
    // for async/delayed methods, which settle later via checkout.session.async_payment_succeeded).
    const paid = obj.payment_status === 'paid' || obj.payment_status === 'no_payment_required'

    // Persistent idempotency: only the FIRST delivery of this event id does any work.
    if (event.id) {
      const dedup = await store.recordPaymentEvent('stripe', event.id, { ref, amount: obj.amount_total, currency: obj.currency })
      if (!dedup.fresh) return { ok: true, handled: true, ref, duplicate: true }
    }

    if (!paid) return { ok: true, handled: true, ref, paid: false }

    // Amount/currency integrity: compare the settled total against what this ref was quoted (bound into
    // metadata at checkout creation). If it doesn't match, do NOT mark paid — log and ack (no retry).
    const expectedCents = Number(obj.metadata?.expected_cents)
    if (Number.isFinite(expectedCents) && expectedCents > 0) {
      const gotCents = Number(obj.amount_total)
      const expCur = String(obj.metadata?.currency || '').toLowerCase()
      const gotCur = String(obj.currency || '').toLowerCase()
      if (gotCents !== expectedCents || (expCur && gotCur !== expCur)) {
        await store.logActivity({ kind: 'deposit_mismatch', summary: `Stripe amount mismatch${ref ? ` (${ref})` : ''}: got ${gotCents} ${gotCur}, expected ${expectedCents} ${expCur}`, ref }).catch(() => null)
        // Alert — a settled amount that doesn't match the quote can indicate a replay/tamper attempt.
        await captureError('stripe amount mismatch (possible replay)', `${ref || '?'}: got ${gotCents} ${gotCur}, expected ${expectedCents} ${expCur}`).catch(() => {})
        return { ok: true, handled: true, ref, paid: false, mismatch: true }
      }
    }

    // Conditional, idempotent flip — only marks (and only logs) when it actually transitions unpaid→paid.
    if (ref) {
      const flipped = await store.markDepositPaid(String(ref), { method: 'stripe' })
      if (flipped) await store.logActivity({ kind: 'deposit', summary: `Stripe payment confirmed (${ref})`, ref }).catch(() => null)
      return { ok: true, handled: true, ref, paid: true, alreadyPaid: !flipped }
    }
    // Paid event with no project ref — record it once (dedup above already gated this to first delivery).
    await store.logActivity({ kind: 'deposit', summary: 'Stripe payment confirmed (no ref)', ref: null }).catch(() => null)
    return { ok: true, handled: true, ref: null, paid: true }
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

  // NOTE: reconcile() is intentionally NOT called here. The HTTP handler awaits reconcile(event) exactly
  // once, so a persistence failure can return 5xx → Stripe retries. Running it here too would double-run
  // on first delivery (the bug this replaces). verifyWebhook stays a pure signature/parse step.
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
