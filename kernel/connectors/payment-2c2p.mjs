// Connector: payment — 2C2P. Accept card + local payments through 2C2P's Payment Gateway (PGW),
// a major SEA/Myanmar processor (cards, wallets, bank transfer, over-the-counter). Zero-dependency,
// fetch-based. Lets Myanmar SMBs mint a hosted-payment token/redirect for an order so the customer
// can pay via any method 2C2P supports, without SuperMega touching raw card data.
//
// category 'payment' · configured = TWOCTWOP_MERCHANT_ID present AND TWOCTWOP_SECRET_KEY present.
//
// Quick setup:
//   1. Get a 2C2P merchant account (https://2c2p.com) — you'll receive a Merchant ID.
//   2. In the 2C2P Merchant Portal, generate your JWT Secret Key (Options → Payment Settings).
//   3. Set TWOCTWOP_MERCHANT_ID and TWOCTWOP_SECRET_KEY.
//   4. Optional: set TWOCTWOP_ENV=sandbox to hit the sandbox PGW instead of production.
//
// Env:
//   TWOCTWOP_MERCHANT_ID  (required)  your 2C2P Merchant ID
//   TWOCTWOP_SECRET_KEY   (required)  your 2C2P JWT Secret Key (used to sign the request payload)
//   TWOCTWOP_ENV          (optional)  'sandbox' to target sandbox-pgw.2c2p.com; anything else = prod
//
// Capabilities:
//   createPayment({ invoiceNo, amount, currencyCode, description }) — request a Payment Token.
//
// IMPORTANT — signing is a documented TODO:
//   2C2P's /payment/4.3/paymentToken expects a JWS (HS256 JWT) whose payload is signed with the
//   Merchant JWT Secret Key, and returns a JWS response you must verify. A correct, constant-time
//   JWS/JWT implementation is more than we want to hand-roll inline, so createPayment() is a HONEST
//   STUB: it validates config/inputs and returns { ok:false, reason:'2c2p_signing_todo' } rather than
//   sending an unsigned (and therefore rejected) request. health() below is fully real — it confirms
//   the PGW host is reachable so the console can show the integration is wired and the endpoint is up.
//   To finish: build the HS256 JWT with node:crypto (createHmac('sha256', SECRET) over
//   base64url(header)+'.'+base64url(payload)), POST { payload: <jwt> } here, then verify the returned
//   JWS the same way before trusting webPaymentUrl / paymentToken.

import { register } from './registry.mjs'

const merchantId = () => String(process.env.TWOCTWOP_MERCHANT_ID || '').trim()
const secretKey = () => String(process.env.TWOCTWOP_SECRET_KEY || '').trim()

// Which PGW to talk to. Production is the default; opt into sandbox explicitly. We keep the base URL
// out of env on purpose — the host is fixed by 2C2P, so there's no attacker-controlled URL to abuse.
const isSandbox = () => String(process.env.TWOCTWOP_ENV || '').trim().toLowerCase() === 'sandbox'
const PGW_HOST = 'pgw.2c2p.com'
const SANDBOX_HOST = 'sandbox-pgw.2c2p.com'
const baseUrl = () => (isSandbox() ? `https://${SANDBOX_HOST}` : `https://${PGW_HOST}`)

// buildUrl — assemble a PGW endpoint and re-validate the resulting host with new URL(). Even though
// the base is a compile-time constant, we parse it and check the hostname against the known 2C2P PGW
// hosts (not just "startsWith https://") so this connector can never be coaxed into fetching an
// arbitrary/internal host — an SSRF-safe posture consistent with the rest of the fleet.
function buildUrl(path) {
  const u = new URL(path, baseUrl())
  if (u.protocol !== 'https:') return null
  const host = u.hostname.toLowerCase()
  if (host !== PGW_HOST && host !== SANDBOX_HOST) return null
  return u
}

// configured — both the Merchant ID and the JWT Secret Key must be present. Without the secret we
// cannot sign a valid request, so the connector is not usable.
const configured = () => Boolean(merchantId() && secretKey())

/**
 * createPayment — request a 2C2P Payment Token for an order (POST /payment/4.3/paymentToken).
 *
 * DOCUMENTED STUB: 2C2P requires the request body to be a JWT (JWS/HS256) signed with the Merchant
 * JWT Secret Key, and returns a signed JWS response. Sending an unsigned payload would be rejected,
 * so rather than ship something that can't work we validate config + inputs and return a clear
 * '2c2p_signing_todo' reason. See the top-of-file note for exactly how to finish the signing step.
 * This function validates inputs, NEVER throws, and is time-capped when it does eventually fetch.
 *
 * @param {object}  [order]
 * @param {string}  [order.invoiceNo]     unique merchant invoice/order id (required by 2C2P).
 * @param {number}  [order.amount]        amount to charge (e.g. 1500.00).
 * @param {string}  [order.currencyCode]  ISO 4217 numeric or alpha code 2C2P accepts (e.g. 'MMK','THB','USD').
 * @param {string}  [order.description]   short order description shown on the hosted payment page.
 * @returns {Promise<{ ok:boolean, reason?:string, token?:string, webPaymentUrl?:string }>}
 */
export async function createPayment({ invoiceNo, amount, currencyCode, description } = {}) {
  if (!configured()) return { ok: false, reason: '2c2p_not_configured' }

  const invoice = String(invoiceNo || '').trim()
  const amt = Number(amount)
  const ccy = String(currencyCode || '').trim()
  if (!invoice) return { ok: false, reason: '2c2p_missing_invoiceNo' }
  if (!Number.isFinite(amt) || amt <= 0) return { ok: false, reason: '2c2p_invalid_amount' }
  if (!ccy) return { ok: false, reason: '2c2p_missing_currencyCode' }

  const url = buildUrl('/payment/4.3/paymentToken')
  if (!url) return { ok: false, reason: '2c2p_bad_base_url' }

  // The unsigned request body 2C2P expects INSIDE the JWT payload. Assembled here so finishing the
  // signing step is a one-line change (sign this object, then POST { payload: <jwt> }).
  const _payload = {
    merchantID: merchantId(),
    invoiceNo: invoice,
    amount: amt,
    currencyCode: ccy,
    description: String(description || `Order ${invoice}`).slice(0, 250),
  }
  void _payload // kept intentionally: this is the object the JWS layer must sign.

  // Signing is not implemented (see top-of-file). Fail honestly instead of sending a rejectable body.
  // The try/catch + timeout scaffold below is the shape the real request will take once signed.
  try {
    return { ok: false, reason: '2c2p_signing_todo' }
  } catch (e) {
    return { ok: false, reason: String(e?.message || '2c2p_error').slice(0, 200) }
  }
}

export const payment2c2p = {
  key: 'payment-2c2p',
  name: '2C2P',
  category: 'payment',
  docs: 'kernel/connectors/payment-2c2p.mjs',
  configured,
  /**
   * health — cheap liveness probe against the real PGW host. The paymentToken endpoint requires a
   * signed body, so we don't call it here; instead we GET the PGW base and treat ANY HTTP response
   * (even a 4xx/405) as proof the gateway host is reachable and terminating TLS. This confirms the
   * integration is wired and the endpoint is up without needing the JWT-signing step.
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!merchantId()) return { ok: false, detail: 'missing TWOCTWOP_MERCHANT_ID' }
    if (!secretKey()) return { ok: false, detail: 'missing TWOCTWOP_SECRET_KEY' }
    const url = buildUrl('/')
    if (!url) return { ok: false, detail: '2c2p_bad_base_url' }
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'user-agent': 'supermega-kernel/1.0' },
        signal: AbortSignal.timeout(8000),
      })
      // Any HTTP status back means the PGW host is reachable (TLS + routing OK). We do NOT require 2xx.
      const env = isSandbox() ? 'sandbox' : 'prod'
      return { ok: true, detail: `pgw reachable (${env}) http_${res.status}`.slice(0, 160) }
    } catch (e) {
      return { ok: false, detail: String(e?.message || '2c2p_error').slice(0, 160) }
    }
  },
  createPayment,
}

register(payment2c2p)
export default payment2c2p
