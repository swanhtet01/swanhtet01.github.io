// Connector: messaging — WhatsApp Business. Push messages via the Meta Graph API.
// Uses a WhatsApp Business Phone Number ID and Access Token (same format as Facebook page token).
//
// Key difference from Facebook Messenger: the message endpoint is /{PHONE_NUMBER_ID}/messages,
// not /me/messages. The recipient is a phone number (e.g. "959XXXXXXXX"), not a PSID.
//
// category 'messaging' · configured = WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID present.
//
// Setup:
//   1. Create a Meta App at developers.facebook.com, add the WhatsApp product.
//   2. Add a WhatsApp Business phone number and grab its Phone Number ID.
//   3. Generate a permanent (System User) access token with whatsapp_business_messaging permission.
//   4. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.
//   5. Optionally set WHATSAPP_DEFAULT_RECIPIENT to a default recipient phone number.
//
// Env:
//   WHATSAPP_ACCESS_TOKEN       (required)  Meta access token with WhatsApp messaging permission
//   WHATSAPP_PHONE_NUMBER_ID    (required)  numeric Phone Number ID from Meta Business Manager
//   WHATSAPP_DEFAULT_RECIPIENT  (optional)  default recipient phone number (e.g. "959XXXXXXXX")
//
// Capabilities:
//   send(text, { to, recipientPhone })  -> { ok, messageId, to }
//   health()                            -> { ok, detail }  (GET /{ID}?fields=verified_name,status)

import { register } from './registry.mjs'

const BASE = 'https://graph.facebook.com/v19.0'

const token           = () => String(process.env.WHATSAPP_ACCESS_TOKEN      || '').trim()
const phoneNumberId   = () => String(process.env.WHATSAPP_PHONE_NUMBER_ID   || '').trim()
const defaultRecipient = () => String(process.env.WHATSAPP_DEFAULT_RECIPIENT || '').trim()
const configured      = () => Boolean(token() && phoneNumberId())

/**
 * send — push a text message to a WhatsApp recipient.
 * @param {string} text              the message body (WhatsApp caps at 4096 chars; we slice).
 * @param {object} [o]
 * @param {string} [o.to]            recipient phone number in international format (alias for recipientPhone).
 * @param {string} [o.recipientPhone] recipient phone number in international format (alias for to).
 * @returns {Promise<{ ok:boolean, messageId:string, to:string }>}
 */
export async function send(text, { to, recipientPhone } = {}) {
  const t = token()
  if (!t) throw new Error('whatsapp_not_configured: missing WHATSAPP_ACCESS_TOKEN')
  const id = phoneNumberId()
  if (!id) throw new Error('whatsapp_not_configured: missing WHATSAPP_PHONE_NUMBER_ID')

  const target = String(to || recipientPhone || defaultRecipient()).trim()
  if (!target) throw new Error('whatsapp_missing_recipient: pass to/recipientPhone or set WHATSAPP_DEFAULT_RECIPIENT')

  const message = String(text || '').trim()
  if (!message) throw new Error('whatsapp_empty_text')

  const res = await fetch(`${BASE}/${encodeURIComponent(id)}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${t}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type:    'individual',
      to:                target,
      type:              'text',
      text:              { body: message.slice(0, 4096) },
    }),
    signal: AbortSignal.timeout(8000),
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.error) {
    const detail = (json.error && json.error.message) || String(res.status)
    throw new Error(`whatsapp_${res.status}: ${detail}`.slice(0, 200))
  }

  const messageId = (json.messages && json.messages[0] && json.messages[0].id) || json.message_id || null
  return { ok: true, messageId, to: target }
}

export const messagingWhatsapp = {
  key:      'messaging-whatsapp',
  name:     'WhatsApp Business',
  category: 'messaging',
  docs:     'kernel/connectors/messaging-whatsapp.mjs',
  configured,
  /**
   * health — verify the access token and phone number ID by calling
   * GET /{PHONE_NUMBER_ID}?fields=verified_name,status.
   */
  async health() {
    const t = token()
    if (!t) return { ok: false, detail: 'missing WHATSAPP_ACCESS_TOKEN' }
    const id = phoneNumberId()
    if (!id) return { ok: false, detail: 'missing WHATSAPP_PHONE_NUMBER_ID' }
    try {
      const res = await fetch(
        `${BASE}/${encodeURIComponent(id)}?fields=verified_name,status&access_token=${encodeURIComponent(t)}`,
        { signal: AbortSignal.timeout(8000) },
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.error) {
        const detail = (json.error && json.error.message) || String(res.status)
        return { ok: false, detail: `whatsapp_${res.status}: ${detail}`.slice(0, 160) }
      }
      const name = json.verified_name || id
      const status = json.status ? `, status: ${json.status}` : ''
      const recipient = defaultRecipient() ? ', default recipient set' : ', no default recipient'
      return { ok: true, detail: `auth ok (number: ${name}${status}${recipient})` }
    } catch (e) {
      return { ok: false, detail: String(e.message || 'whatsapp_error').slice(0, 160) }
    }
  },
  send,
}

register(messagingWhatsapp)
export default messagingWhatsapp
