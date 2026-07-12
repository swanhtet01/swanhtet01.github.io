// Connector: messaging — Facebook Messenger. Push messages via the Facebook Graph API.
// Uses a Page Access Token to send messages on behalf of a Facebook Page.
//
// category 'messaging' · configured = FACEBOOK_PAGE_ACCESS_TOKEN present.
//
// Setup:
//   1. Create a Meta App at developers.facebook.com, add the Messenger product.
//   2. Generate a Page Access Token for your Facebook Page.
//   3. Set it as FACEBOOK_PAGE_ACCESS_TOKEN.
//   4. Set FACEBOOK_DEFAULT_RECIPIENT_ID to the PSID (Page-Scoped User ID) of the
//      person to message by default (optional; can be passed per-call).
//
// Env:
//   FACEBOOK_PAGE_ACCESS_TOKEN    (required)  Page Access Token from Meta Developer Portal
//   FACEBOOK_DEFAULT_RECIPIENT_ID (optional)  default recipient PSID for send() when no recipientId is passed
//
// Capabilities:
//   send(text, { recipientId })  -> { ok, messageId, recipientId }
//   health()                     -> { ok, detail }  (a /me call)

import { register } from './registry.mjs'

const BASE = 'https://graph.facebook.com/v19.0'
const token = () => String(process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '').trim()
const defaultRecipientId = () => String(process.env.FACEBOOK_DEFAULT_RECIPIENT_ID || '').trim()
const configured = () => Boolean(token())

/**
 * send — push a text message to a Facebook Messenger recipient.
 * @param {string} text              the message body (Messenger caps at 2000 chars; we slice).
 * @param {object} [o]
 * @param {string} [o.recipientId]   target Page-Scoped User ID (default: FACEBOOK_DEFAULT_RECIPIENT_ID env).
 * @returns {Promise<{ ok:boolean, messageId:string, recipientId:string }>}
 */
export async function send(text, { recipientId } = {}) {
  const t = token()
  if (!t) return { ok: false, reason: 'facebook_not_configured' }
  const target = String(recipientId || defaultRecipientId()).trim()
  if (!target) return { ok: false, reason: 'facebook_missing_recipient_id' }
  const message = String(text || '').trim()
  if (!message) return { ok: false, reason: 'facebook_empty_text' }

  try {
    // Token in Authorization header, not the URL query string (URLs leak into proxy/access/SDK logs).
    const res = await fetch(`${BASE}/me/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` },
      body: JSON.stringify({ recipient: { id: target }, message: { text: message.slice(0, 2000) } }),
      signal: AbortSignal.timeout(8000),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || json.error) {
      const detail = (json.error && json.error.message) || String(res.status)
      return { ok: false, reason: `facebook_${res.status}: ${detail}`.slice(0, 200) }
    }
    return { ok: true, messageId: json.message_id, recipientId: target }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'facebook_error').slice(0, 200) }
  }
}

export const messagingFacebook = {
  key: 'messaging-facebook',
  name: 'Facebook Messenger',
  category: 'messaging',
  docs: 'kernel/connectors/messaging-facebook.mjs',
  configured,
  // Health check: GET /me to verify the token is valid and fetch the page name.
  async health() {
    const t = token()
    if (!t) return { ok: false, detail: 'missing FACEBOOK_PAGE_ACCESS_TOKEN' }
    try {
      const res = await fetch(`${BASE}/me?fields=name,id`, {
        headers: { authorization: `Bearer ${t}` },
        signal: AbortSignal.timeout(8000),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.error) {
        const detail = (json.error && json.error.message) || String(res.status)
        return { ok: false, detail: `facebook_${res.status}: ${detail}`.slice(0, 160) }
      }
      const recipient = defaultRecipientId() ? ', recipient set' : ', no default recipient'
      return { ok: true, detail: `auth ok (page: ${json.name || json.id}${recipient})` }
    } catch (e) {
      return { ok: false, detail: String(e.message || 'facebook_error').slice(0, 160) }
    }
  },
  send,
}

register(messagingFacebook)
export default messagingFacebook
