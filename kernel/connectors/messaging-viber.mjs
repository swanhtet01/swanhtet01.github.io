// Connector: messaging — Viber. Push instant alerts via the Viber Bot API (fetch-based,
// zero-dependency). Viber is the dominant messaging channel in Myanmar; this connector
// complements messaging-telegram as an alternative delivery path for CEO notifications.
//
// category 'messaging' · configured = VIBER_AUTH_TOKEN present.
//
// Owner (1-min) setup via Viber Partners:
//   1. Go to https://partners.viber.com, create a Bot / Public Account.
//   2. Copy the auth token from the dashboard — set it as VIBER_AUTH_TOKEN.
//   3. The bot must receive a message from a user first before it can reply; note the
//      user's Viber ID from the webhook payload and set it as VIBER_DEFAULT_RECEIVER.
//
// Env:
//   VIBER_AUTH_TOKEN        (required)  bot auth token from Viber Partners dashboard
//   VIBER_BOT_NAME          (optional)  sender name shown in messages (default: 'SuperMega')
//   VIBER_DEFAULT_RECEIVER  (optional)  default receiver Viber user id for send()

import { register } from './registry.mjs'

const API = 'https://chatapi.viber.com/pa'
const token = () => String(process.env.VIBER_AUTH_TOKEN || '').trim()
const botName = () => String(process.env.VIBER_BOT_NAME || 'SuperMega').trim()
const defaultReceiver = () => String(process.env.VIBER_DEFAULT_RECEIVER || '').trim()
const configured = () => Boolean(token())

async function viber(endpoint, body) {
  const t = token()
  if (!t) throw new Error('viber_not_configured')
  const res = await fetch(`${API}/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Viber-Auth-Token': t },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || (json.status !== 0 && json.status !== undefined)) {
    throw new Error(`viber_${res.status}: ${json?.status_message || ''}`.slice(0, 200))
  }
  return json
}

/**
 * send — push a text message to a Viber user.
 * @param {string} text               the message body.
 * @param {object} [o]
 * @param {string} [o.receiver]       target Viber user id (default: VIBER_DEFAULT_RECEIVER env).
 * @param {string} [o.chatId]         alias for receiver (cross-connector compatibility).
 * @returns {Promise<{ ok:boolean, messageToken:string, receiver:string }>}
 */
export async function send(text, { receiver, chatId } = {}) {
  if (!configured()) return { ok: false, reason: 'viber_not_configured' }
  const target = String(receiver || chatId || defaultReceiver()).trim()
  if (!target) return { ok: false, reason: 'viber_missing_receiver' }
  const message = String(text || '').trim()
  if (!message) return { ok: false, reason: 'viber_empty_text' }
  try {
    const result = await viber('send_message', {
      receiver: target,
      type: 'text',
      text: message,
      sender: { name: botName() },
    })
    return { ok: true, messageToken: result?.message_token, receiver: target }
  } catch (e) {
    return { ok: false, reason: String(e.message || 'viber_error').slice(0, 200) }
  }
}

const configuredFn = configured

export const messagingViber = {
  key: 'messaging-viber',
  name: 'Viber',
  category: 'messaging',
  docs: 'kernel/connectors/messaging-viber.mjs',
  configured: configuredFn,
  async health() {
    if (!configured()) return { ok: false, configured: false, reason: 'missing VIBER_AUTH_TOKEN' }
    try {
      const info = await viber('get_account_info', {})
      return { ok: true, configured: true, name: info?.name || botName(), uri: info?.uri || '' }
    } catch (e) {
      return { ok: false, configured: true, reason: String(e.message || 'viber_error').slice(0, 160) }
    }
  },
  send,
}

register(messagingViber)
export default messagingViber
