// Connector: messaging — Telegram. Push instant alerts to the CEO's phone via the Telegram
// Bot API (fetch-based, zero-dependency). This is the deliverability fix: the Resend email
// lead-alert gets DMARC-dropped, so the CEO never sees new leads. Telegram is the dominant
// messaging channel for Myanmar SMBs — instant, free, and no email-deliverability surface.
//
// category 'messaging' · configured = TELEGRAM_BOT_TOKEN present.
//
// Owner (1-min) setup via @BotFather:
//   1. Open Telegram, message @BotFather, send /newbot, pick a name + username.
//   2. BotFather replies with a token like 123456789:AA... — set it as TELEGRAM_BOT_TOKEN.
//   3. Send any message ("hi") to your new bot once (so it has a chat to reply to).
//   4. GET https://api.telegram.org/bot<TOKEN>/getUpdates and copy result[0].message.chat.id
//      — set it as TELEGRAM_CHAT_ID.
//
// Env:
//   TELEGRAM_BOT_TOKEN   (required)  BotFather token, e.g. 123456789:AA...
//   TELEGRAM_CHAT_ID     (optional)  default destination chat id for send() when no chatId is passed
//
// Capabilities:
//   send(text, { parseMode, chatId, disablePreview })  -> { ok, messageId, chatId }
//   health()                                           -> { ok, detail }  (a getMe call)

import { register } from './registry.mjs'

const API = 'https://api.telegram.org'
const token = () => String(process.env.TELEGRAM_BOT_TOKEN || '').trim()
const defaultChatId = () => String(process.env.TELEGRAM_CHAT_ID || '').trim()
const configured = () => Boolean(token())

async function telegram(method, body) {
  const t = token()
  if (!t) throw new Error('telegram_not_configured')
  const res = await fetch(`${API}/bot${t}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.ok === false) {
    throw new Error(`telegram_${res.status}: ${json?.description || ''}`.slice(0, 200))
  }
  return json.result
}

/**
 * send — push a text message to a Telegram chat.
 * @param {string} text                 the message body (Telegram caps at 4096 chars; we slice).
 * @param {object} [o]
 * @param {'HTML'|'MarkdownV2'} [o.parseMode]  optional formatting mode (default: plain text).
 * @param {string|number} [o.chatId]    target chat (default: TELEGRAM_CHAT_ID env).
 * @param {boolean} [o.disablePreview=true]  suppress link previews.
 * @returns {Promise<{ ok:boolean, messageId:number, chatId:(string|number) }>}
 */
export async function send(text, { parseMode, chatId, disablePreview = true } = {}) {
  if (!configured()) return { ok: false, reason: 'telegram_not_configured' }
  const target = String(chatId || defaultChatId()).trim()
  if (!target) return { ok: false, reason: 'telegram_missing_chat_id' }
  const message = String(text || '').trim()
  if (!message) return { ok: false, reason: 'telegram_empty_text' }
  const body = { chat_id: target, text: message.slice(0, 4096), disable_web_page_preview: disablePreview }
  if (parseMode) body.parse_mode = parseMode
  try {
    const result = await telegram('sendMessage', body)
    return { ok: true, messageId: result?.message_id, chatId: target }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'telegram_error').slice(0, 200) }
  }
}

const configuredFn = configured // alias for clarity in the connector object below

export const messagingTelegram = {
  key: 'messaging-telegram',
  name: 'Telegram',
  category: 'messaging',
  docs: 'kernel/connectors/messaging-telegram.mjs',
  configured: configuredFn,
  // Cheap real probe: getMe is a free, read-only auth check that confirms the token is live.
  async health() {
    if (!configured()) return { ok: false, detail: 'missing TELEGRAM_BOT_TOKEN' }
    try {
      const me = await telegram('getMe')
      const chat = defaultChatId() ? `, chat set` : ', no chat id'
      return { ok: true, detail: `auth ok (@${me?.username || 'bot'}${chat})` }
    } catch (e) {
      return { ok: false, detail: String(e.message || 'telegram_error').slice(0, 160) }
    }
  },
  // capability exposed on the connector for callers that get() it from the registry:
  send,
}

register(messagingTelegram)
export default messagingTelegram
