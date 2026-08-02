// SUPERMEGA kernel — best-effort error alerting. Makes a backend failure (especially in the money
// path) VISIBLE to an operator instead of dying in console logs. Structured console.error ALWAYS;
// plus a Telegram ping when TELEGRAM_BOT_TOKEN + a chat id are configured. Never throws, time-bounded,
// never logs secret values.
//
// Env: TELEGRAM_BOT_TOKEN, TELEGRAM_ALERT_CHAT_ID (or TELEGRAM_CHAT_ID)
export async function captureError(context, detail, meta = {}) {
  const msg = String(detail && detail.message ? detail.message : detail || '').slice(0, 300)
  const line = `[supermega] ${context}: ${msg}`
  try { console.error(line, meta && Object.keys(meta).length ? meta : '') } catch { /* logging must never throw */ }

  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim()
  const chat = String(process.env.TELEGRAM_ALERT_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '').trim()
  if (!token || !chat) return false
  try {
    const extras = Object.entries(meta || {}).map(([k, v]) => `${k}: ${String(v).slice(0, 80)}`).join('\n')
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: `🚨 ${line}${extras ? '\n' + extras : ''}`, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(5000),
    })
    return true
  } catch { return false }
}

// Plain best-effort notification (no error framing) to the owner's own Telegram. Never throws.
// The detailed form lets guarded callers distinguish a definite rejection from an uncertain
// transport failure and choose a safe idempotency policy.
export async function notifyDetailed(text, options = {}) {
  const env = options.env || process.env
  const request = options.fetch || fetch
  const token = String(env.TELEGRAM_BOT_TOKEN || '').trim()
  const chat = String(env.TELEGRAM_ALERT_CHAT_ID || env.TELEGRAM_CHAT_ID || '').trim()
  if (!token || !chat) return { ok: false, status: 'failed' }
  try {
    const response = await request(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: String(text || '').slice(0, 3500), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(6000),
    })
    return response?.ok === true
      ? { ok: true, status: 'sent' }
      : { ok: false, status: 'failed' }
  } catch { return { ok: false, status: 'uncertain' } }
}

export async function notify(text) {
  return (await notifyDetailed(text)).ok
}

export default { captureError, notify, notifyDetailed }
