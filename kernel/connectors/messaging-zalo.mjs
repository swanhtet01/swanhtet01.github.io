// Connector: messaging — Zalo. Send Zalo Official Account (OA) messages via the Zalo openapi
// (zero-dependency, fetch-based). Lets Myanmar/SEA SMBs reach customers on Zalo — the dominant
// chat app in the region — straight from DeskPOS / the demo funnel: an order confirmation, a
// follow-up, or a support reply becomes a Zalo message without any manual copy-paste.
//
// category 'messaging' · configured = ZALO_ACCESS_TOKEN present.
//
// Quick setup:
//   1. Create a Zalo Official Account and register an app at https://developers.zalo.me.
//   2. Obtain an OA access token (from the OA management console / OAuth flow).
//   3. Set it as ZALO_ACCESS_TOKEN.
//   4. (Per call) pass the recipient's Zalo user_id to send().
//
// Env:
//   ZALO_ACCESS_TOKEN  (required)  Zalo OA access token, sent in the "access_token" header.
//
// Auth: Zalo uses a custom header — NOT Bearer. Every request carries:
//   access_token: ZALO_ACCESS_TOKEN
//
// Capabilities:
//   send({ userId, text }) — POST /v3.0/oa/message/cs (send a customer-service message to a user).

import { register } from './registry.mjs'

// Fixed, hardcoded host. No user value ever selects the host — SSRF-safe.
const HOST = 'https://openapi.zalo.me'

const accessToken = () => String(process.env.ZALO_ACCESS_TOKEN || '').trim()

// configured — required env var present (non-empty).
const configured = () => Boolean(accessToken())

/**
 * send — send a Zalo OA customer-service text message to a user.
 *
 * POSTs to /v3.0/oa/message/cs with { recipient:{ user_id }, message:{ text } }. Zalo returns
 * a JSON body carrying a message_id (either at top level or under data) on success.
 *
 * @param {object} [payload]
 * @param {string} [payload.userId]  recipient Zalo user_id (required).
 * @param {string} [payload.text]    message text (required).
 * @returns {Promise<{ ok:boolean, status?:number, id?:string, reason?:string }>}
 */
export async function send(_input = {}) {
  if (!configured()) return { ok: false, reason: 'messaging-zalo_not_configured' }
  const { userId, text } = _input || {}
  const uid = String(userId || '').trim()
  const msg = String(text || '')
  if (!uid || !msg) return { ok: false, reason: 'messaging-zalo_missing_args' }

  const body = { recipient: { user_id: uid }, message: { text: msg } }

  try {
    const res = await fetch(`${HOST}/v3.0/oa/message/cs`, {
      method: 'POST',
      headers: {
        access_token: accessToken(),
        'content-type': 'application/json',
        accept: 'application/json',
        'user-agent': 'supermega-kernel/1.0',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, status: res.status, reason: 'messaging-zalo_' + res.status }
    return { ok: true, status: res.status, id: data?.message_id || data?.data?.message_id }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'messaging-zalo_error').slice(0, 200) }
  }
}

export const messagingZalo = {
  key: 'messaging-zalo',
  name: 'Zalo',
  category: 'messaging',
  docs: 'kernel/connectors/messaging-zalo.mjs',
  configured,
  /**
   * health — GET /v2.0/oa/getoa is Zalo's cheap authenticated liveness probe. It returns the OA's
   * profile (including its name) when the access token is valid, without touching any user data.
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!configured()) return { ok: false, detail: 'missing ZALO_ACCESS_TOKEN' }
    try {
      const res = await fetch(`${HOST}/v2.0/oa/getoa`, {
        method: 'GET',
        headers: {
          access_token: accessToken(),
          accept: 'application/json',
          'user-agent': 'supermega-kernel/1.0',
        },
        signal: AbortSignal.timeout(8000),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) return { ok: false, detail: `messaging-zalo_${res.status}`.slice(0, 160) }
      return { ok: true, detail: String(data?.data?.name || 'ok').slice(0, 160) }
    } catch (e) {
      return { ok: false, detail: String(e?.message || 'messaging-zalo_error').slice(0, 160) }
    }
  },
  send,
}

register(messagingZalo)
export default messagingZalo
