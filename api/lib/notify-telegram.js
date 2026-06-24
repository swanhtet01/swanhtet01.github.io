// Shared lead-alert helper — pushes an instant Telegram message to the CEO's phone.
//
// Why: the Resend email lead-alert gets DMARC-dropped, so the CEO never sees new leads.
// Telegram is instant, free, and has no email-deliverability surface. This is the ONE place
// that talks to the Telegram Bot API for alerts, so the contact handler, the demo-lead
// handler, and (when it returns to this tree) the supermega-machine pipeline all share it
// instead of each re-implementing the fetch.
//
// Dependency-free (native fetch). Best-effort: ALWAYS resolves, never throws — a failed or
// unconfigured Telegram alert must never break the lead-capture handler.
//
// Env:
//   TELEGRAM_BOT_TOKEN   (required)  BotFather token, e.g. 123456789:AA...
//   TELEGRAM_CHAT_ID     (required)  destination chat id (the CEO's chat)
//
// Owner setup via @BotFather:
//   1. Message @BotFather → /newbot → pick a name + username → copy the token (TELEGRAM_BOT_TOKEN).
//   2. Send any message to your new bot once.
//   3. GET https://api.telegram.org/bot<TOKEN>/getUpdates → copy result[0].message.chat.id (TELEGRAM_CHAT_ID).

function text(value) {
  return String(value || '').trim()
}

/**
 * notifyTelegram — send a concise alert to the CEO's Telegram. Best-effort, never throws.
 * @param {string} message                  the message body (sliced to Telegram's 4096 cap).
 * @param {object} [opts]
 * @param {'HTML'|'MarkdownV2'} [opts.parseMode]  optional Telegram formatting mode.
 * @param {string|number} [opts.chatId]     override the default TELEGRAM_CHAT_ID.
 * @returns {Promise<{ status:string, reason?:string, message_id?:number }>}
 */
async function notifyTelegram(message, opts = {}) {
  const token = text(process.env.TELEGRAM_BOT_TOKEN)
  const chatId = text(opts.chatId) || text(process.env.TELEGRAM_CHAT_ID)
  const body = text(message)
  if (!token || !chatId) return { status: 'skipped', reason: 'telegram_not_configured' }
  if (!body) return { status: 'skipped', reason: 'telegram_empty_text' }
  const payload = {
    chat_id: chatId,
    text: body.slice(0, 4096),
    disable_web_page_preview: true,
  }
  if (opts.parseMode) payload.parse_mode = opts.parseMode
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return { status: 'error', reason: `telegram_${res.status}` }
    const json = await res.json().catch(() => ({}))
    return { status: 'ready', message_id: json?.result?.message_id }
  } catch (err) {
    return { status: 'error', reason: text(err && err.message) || 'telegram_failed' }
  }
}

/**
 * configured — true when both env vars are present (so callers can short-circuit / report status).
 * @returns {boolean}
 */
function configured() {
  return Boolean(text(process.env.TELEGRAM_BOT_TOKEN) && text(process.env.TELEGRAM_CHAT_ID))
}

module.exports = { notifyTelegram, configured }
