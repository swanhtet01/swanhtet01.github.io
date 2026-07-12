// Connector: logistics — J&T Express (Myanmar). Track parcels via the J&T Express Open Platform
// (J&T is one of the dominant last-mile couriers across SEA, including Myanmar). No SDK — native
// fetch, with request signing done via Node's built-in crypto (MD5 digest). Zero dependencies.
//
// category 'logistics' · configured = JNT_API_ACCOUNT + JNT_PRIVATE_KEY both present.
//
// Quick setup (J&T Express Open Platform):
//   1. Obtain a merchant integration from J&T → you receive an API account (customer/api code)
//      and a private key (the signing secret).
//   2. Set JNT_API_ACCOUNT (the api account / customer code) and JNT_PRIVATE_KEY (the signing key).
//
// Auth model (J&T "digest" signing): the request body carries a `bizContent` JSON string. The
// signature is a base64-encoded MD5 of (bizContent + private_key), sent as the `digest` header
// alongside the api account as `apiAccount`. J&T verifies the digest server-side. We hardcode the
// host (no per-tenant host), so there is no env-driven SSRF target.
//
// Env:
//   JNT_API_ACCOUNT   (required)  the J&T api account / customer code used as the `apiAccount` header
//   JNT_PRIVATE_KEY   (required)  the signing private key used to MD5-digest the request body
//
// Capabilities:
//   trackParcel({ billCode }) — POST /webopenplatformapi/api/logistics/trace (parcel trace events).

import { createHash } from 'node:crypto'
import { register } from './registry.mjs'

// Fixed, documented Open Platform host. We do NOT read the base from env — there is no
// per-tenant host here, so hardcoding removes any chance of an env-driven SSRF target.
const API_BASE = 'https://openapi.jtexpress.com.mm'
const API_HOST = 'openapi.jtexpress.com.mm'

const apiAccount = () => String(process.env.JNT_API_ACCOUNT || '').trim()
const privateKey = () => String(process.env.JNT_PRIVATE_KEY || '').trim()

// configured — checks ONLY that the required env vars are present. The host is a hardcoded https
// constant (never derived from a user/env value), so this stays SSRF-safe.
const configured = () => Boolean(apiAccount() && privateKey())

/**
 * digest — J&T's request signature: base64( MD5( bizContent + private_key ) ).
 *
 * @param {string} bizContent  the exact JSON string sent as the request body's bizContent field
 * @returns {string} base64 MD5 digest
 */
function digest(bizContent) {
  return createHash('md5').update(`${bizContent}${privateKey()}`).digest('base64')
}

/**
 * jntPost — POST a signed request to a J&T Open Platform api path.
 *
 * The URL is built from the hardcoded API_BASE and re-validated with new URL() (SSRF-safe: only the
 * documented J&T host is ever contacted, never a value derived from env), like the reference does.
 *
 * @param {string} apiPath      e.g. '/webopenplatformapi/api/logistics/trace'
 * @param {object} bizObject    the business payload (serialized to the `bizContent` field)
 * @returns {Promise<{ ok:boolean, data?:any, reason?:string, detail?:any, status?:number }>}
 */
async function jntPost(apiPath, bizObject) {
  if (!configured()) return { ok: false, reason: 'logistics-jnt_not_configured' }
  try {
    const bizContent = JSON.stringify(bizObject || {})
    const url = `${API_BASE}${apiPath}`
    // Defensive: confirm we're only ever hitting the documented J&T host over https.
    const u = new URL(url)
    if (u.protocol !== 'https:' || u.hostname.toLowerCase() !== API_HOST) {
      return { ok: false, reason: 'logistics-jnt_bad_host' }
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'supermega-kernel/1.0',
        apiAccount: apiAccount(),
        digest: digest(bizContent),
      },
      body: JSON.stringify({ bizContent }),
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      return { ok: false, status: res.status, reason: `logistics-jnt_http_${res.status}`, detail: data }
    }
    // J&T returns HTTP 200 with a `code`/`success` envelope even for API-level errors.
    if (data && (data.success === false || (data.code && String(data.code) !== '1' && data.code !== 200))) {
      const msg = data.msg || data.message || data.code
      return { ok: false, reason: `logistics-jnt_${String(msg)}`.slice(0, 200), detail: data }
    }
    return { ok: true, data }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'logistics-jnt_error').slice(0, 200) }
  }
}

/**
 * trackParcel — fetch the trace (scan) events for a J&T parcel by its bill code (waybill number).
 *
 * POST /webopenplatformapi/api/logistics/trace with the billCode in the signed bizContent. Returns
 * the list of trace events (scan history) on success.
 *
 * @param {object} [payload]
 * @param {string} [payload.billCode]  the J&T waybill / bill code to trace (required).
 * @returns {Promise<{ ok:boolean, traces?:any[], reason?:string, detail?:any }>}
 */
export async function trackParcel(_input = {}) {
  const { billCode } = _input || {}
  if (!configured()) return { ok: false, reason: 'logistics-jnt_not_configured' }
  const code = String(billCode || '').trim()
  if (!code) return { ok: false, reason: 'logistics-jnt_missing_bill_code' }

  const result = await jntPost('/webopenplatformapi/api/logistics/trace', { billCode: code })
  if (!result.ok) return result

  const data = result.data
  // The trace list can live under a few documented shapes; normalize to a flat array.
  let traces = []
  if (Array.isArray(data?.data)) traces = data.data
  else if (Array.isArray(data?.data?.details)) traces = data.data.details
  else if (Array.isArray(data?.details)) traces = data.details
  else if (Array.isArray(data?.data?.traces)) traces = data.data.traces
  return { ok: true, traces }
}

export const logisticsJnt = {
  key: 'logistics-jnt',
  name: 'J&T Express',
  category: 'logistics',
  docs: 'kernel/connectors/logistics-jnt.mjs',
  configured,
  /**
   * health — a signed trace call against a sentinel bill code. When the api account + private key
   * (and thus the digest) are valid, J&T answers the request (even a "not found" bill code is a
   * live, authenticated response) rather than rejecting the credentials/signature outright.
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!configured()) return { ok: false, detail: 'missing JNT_API_ACCOUNT or JNT_PRIVATE_KEY' }
    const result = await trackParcel({ billCode: 'HEALTHCHECK' })
    if (!result.ok) return { ok: false, detail: `trace failed: ${result.reason}`.slice(0, 160) }
    return { ok: true, detail: `trace ok (${(result.traces || []).length} events)`.slice(0, 160) }
  },
  trackParcel,
}

register(logisticsJnt)
export default logisticsJnt
