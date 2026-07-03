// Connector: messaging — Instagram. Reply to customers in Instagram Direct (DMs) via the Meta
// Graph API's Instagram Messaging endpoint (zero-dependency, fetch-based). Myanmar retail sells
// heavily through Instagram DMs — a shopper messages the shop's IG business account to ask about
// price/stock/delivery, and this connector lets DeskPOS / the kernel push a text reply straight
// back into that DM thread, so a captured lead or order question gets answered without anyone
// leaving the platform to open the Instagram app.
//
// category 'messaging' · configured = BOTH INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ID present.
// The API host is a hardcoded https constant (Meta Graph API) — no user value ever chooses the host.
//
// Quick setup:
//   1. Convert the Instagram account to a Business/Creator account and link it to a Facebook Page.
//   2. Create a Meta app (developers.facebook.com) and add the "Instagram" / Messaging product.
//   3. Grant the app instagram_business_manage_messages (+ pages_messaging) permissions and generate
//      a Page/Instagram access token. Set it as INSTAGRAM_ACCESS_TOKEN.
//   4. Find the Instagram business account id (the IG Business/Professional account id, an all-digits
//      id) and set it as INSTAGRAM_BUSINESS_ID. This is the sender ("<IG_ID>/messages" node).
//   5. Note: you can only send inside the 24-hour standard messaging window after the user's last
//      message (Meta policy). The recipientId is the Instagram-scoped id (IGSID) from the inbound
//      webhook — pass it to send().
//
// Env:
//   INSTAGRAM_ACCESS_TOKEN  (required)  Meta Graph API access token with IG messaging permission.
//   INSTAGRAM_BUSINESS_ID   (required)  the Instagram business account id (the message sender node).
//
// Auth: Bearer token in the Authorization header — 'authorization': 'Bearer ' + INSTAGRAM_ACCESS_TOKEN.
//
// Capabilities:
//   send({ recipientId, text }) — POST /<INSTAGRAM_BUSINESS_ID>/messages with
//     { recipient:{ id: recipientId }, message:{ text } } to reply in an Instagram DM thread.

import { register } from './registry.mjs'

// Meta Graph API base — HARDCODED https constant. No env/user value contributes to the host, so
// send()/health() can never be steered at an arbitrary host (no SSRF surface via configuration).
const API_BASE = 'https://graph.facebook.com/v21.0'

const token = () => String(process.env.INSTAGRAM_ACCESS_TOKEN || '').trim()
const businessId = () => String(process.env.INSTAGRAM_BUSINESS_ID || '').trim()

const authHeader = () => 'Bearer ' + token()

// configured — this is a FIXED-host service (Meta Graph API), so the base URL is the hardcoded
// API_BASE constant above and configured() only checks that BOTH required env vars are present. No
// user value ever selects the host, so there's nothing host-shaped to validate here.
const configured = () => Boolean(token() && businessId())

/**
 * send — reply to a customer in an Instagram Direct (DM) thread.
 *
 * POSTs to /<INSTAGRAM_BUSINESS_ID>/messages with the Graph API messaging shape
 * { recipient:{ id: recipientId }, message:{ text } }. On success Meta returns the recipient id and
 * a message id — surfaced as { ok:true, id }.
 *
 * @param {object}  [payload]
 * @param {string}  [payload.recipientId]  the Instagram-scoped recipient id (IGSID) to reply to (required).
 * @param {string}  [payload.text]         the message text to send (required).
 * @returns {Promise<{ ok:boolean, status?:number, id?:string, reason?:string }>}
 */
export async function send({ recipientId, text } = {}) {
  if (!configured()) return { ok: false, reason: 'messaging-instagram_not_configured' }
  const to = String(recipientId || '').trim()
  const body = String(text || '')
  if (!to) return { ok: false, reason: 'messaging-instagram_missing_recipientId' }
  if (!body) return { ok: false, reason: 'messaging-instagram_missing_text' }

  const payload = { recipient: { id: to }, message: { text: body } }

  try {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(businessId())}/messages`, {
      method: 'POST',
      headers: {
        authorization: authHeader(),
        'content-type': 'application/json',
        'user-agent': 'supermega-kernel/1.0',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const reason = data?.error?.message || data?.error || data?.message || `http_${res.status}`
      return { ok: false, status: res.status, reason: `messaging-instagram_${String(reason)}`.slice(0, 200) }
    }
    return { ok: true, status: res.status, id: data?.message_id || data?.id }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'messaging-instagram_error').slice(0, 200) }
  }
}

export const messagingInstagram = {
  key: 'messaging-instagram',
  name: 'Instagram',
  category: 'messaging',
  docs: 'kernel/connectors/messaging-instagram.mjs',
  configured,
  /**
   * health — GET /<INSTAGRAM_BUSINESS_ID>?fields=id,username is a cheap authenticated liveness
   * probe: it reads the linked IG business account's own profile, which validates BOTH the access
   * token and the business id in one call without touching any conversation data.
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!configured()) return { ok: false, detail: 'missing INSTAGRAM_ACCESS_TOKEN' }
    try {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(businessId())}?fields=id,username`, {
        method: 'GET',
        headers: {
          authorization: authHeader(),
          'user-agent': 'supermega-kernel/1.0',
        },
        signal: AbortSignal.timeout(8000),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const reason = data?.error?.message || data?.error || data?.message || ''
        return { ok: false, detail: `messaging-instagram_${res.status}: ${String(reason)}`.slice(0, 160) }
      }
      const label = data?.username ? `@${data.username}` : (data?.id || 'ig ok')
      return { ok: true, detail: String(label).slice(0, 160) }
    } catch (e) {
      return { ok: false, detail: String(e?.message || 'messaging-instagram_error').slice(0, 160) }
    }
  },
  send,
}

register(messagingInstagram)
export default messagingInstagram
