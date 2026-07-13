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
//   readOwnerUpdates({ startDate, endDate, limit })     -> reduced incoming owner-chat evidence
//   health()                                            -> { ok, detail }  (a getMe call)

import { register } from './registry.mjs'

const API = 'https://api.telegram.org'
const token = () => String(process.env.TELEGRAM_BOT_TOKEN || '').trim()
const defaultChatId = () => String(process.env.TELEGRAM_ALERT_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '').trim()
export const configured = () => Boolean(token())
export const ownerChatConfigured = () => configured() && /^-?\d{1,20}$/.test(defaultChatId())

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

/**
 * Read a bounded, non-acknowledging view of incoming updates from the configured owner chat.
 * The request deliberately omits Telegram's offset field, so reading cannot confirm or advance
 * the update queue. Messages from every other chat are discarded before returning.
 */
export async function readOwnerUpdates(input = {}) {
  const options = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const { startDate, endDate, limit = 100 } = options
  if (!configured()) return { ok: false, reason: 'telegram_not_configured' }
  const target = defaultChatId()
  if (!/^-?\d{1,20}$/.test(target)) return { ok: false, reason: 'telegram_invalid_owner_chat_id' }
  const startMs = Date.parse(String(startDate || ''))
  const endMs = Date.parse(String(endDate || ''))
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs || endMs - startMs > 168 * 60 * 60 * 1000) {
    return { ok: false, reason: 'telegram_invalid_update_window' }
  }
  const boundedLimit = Math.max(1, Math.min(100, Number.parseInt(String(limit), 10) || 100))
  try {
    const result = await telegram('getUpdates', {
      limit: boundedLimit,
      timeout: 0,
      allowed_updates: ['message', 'edited_message', 'channel_post'],
    })
    const rows = Array.isArray(result) ? result.slice(0, boundedLimit) : []
    const updates = []
    for (const row of rows) {
      const message = row?.message || row?.edited_message || row?.channel_post
      if (String(message?.chat?.id ?? '') !== target) continue
      const atMs = Number(message?.date) * 1000
      if (!Number.isFinite(atMs) || atMs < startMs || atMs > endMs) continue
      const text = String(message?.text || message?.caption || '').trim().slice(0, 2_000)
      if (!text) continue
      updates.push({
        updateId: Number.isSafeInteger(row?.update_id) ? row.update_id : null,
        messageId: Number.isSafeInteger(message?.message_id) ? message.message_id : null,
        at: new Date(atMs).toISOString(),
        text,
      })
    }
    updates.sort((left, right) => left.at.localeCompare(right.at) || Number(left.updateId || 0) - Number(right.updateId || 0))
    return { ok: true, updates, fetched: rows.length, truncated: rows.length === boundedLimit }
  } catch {
    return { ok: false, reason: 'telegram_updates_read_failed' }
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
  readOwnerUpdates,
  ownerChatConfigured,
}

register(messagingTelegram)
export default messagingTelegram
