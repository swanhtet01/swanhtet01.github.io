// Connector: messaging — LINE Notify. Push notifications to LINE users via the LINE Notify API.
// Free, no SDK, webhook-style: each subscriber generates a personal access token that this
// connector uses to push messages directly to their LINE account.
//
// category 'messaging' · configured = LINE_NOTIFY_TOKEN present.
//
// Quick setup:
//   1. Go to https://notify-bot.line.me/ → Log in with LINE → My page → Generate token.
//   2. Name the token (e.g. "SUPERMEGA alerts"), select the chat or group to notify.
//   3. Copy the token and set it as LINE_NOTIFY_TOKEN.
//   (For per-client delivery, pass the token directly to send() as opts.token.)
//
// Env:
//   LINE_NOTIFY_TOKEN  (required for default sends)  personal access token from notify-bot.line.me

import { register } from './registry.mjs'

const BASE = 'https://notify-api.line.me/api'
const defaultToken = () => String(process.env.LINE_NOTIFY_TOKEN || '').trim()
const configured = () => Boolean(defaultToken())

/**
 * send — push a notification to a LINE account or group.
 *
 * @param {string}  message          notification text (max 1000 chars).
 * @param {object}  [opts]
 * @param {string}  [opts.token]     override the default LINE_NOTIFY_TOKEN for per-recipient sends.
 * @param {string}  [opts.imageUrl]  full HTTPS URL of an image to attach (JPEG/PNG, max 2 MB).
 * @returns {Promise<{ ok:boolean, reason?:string }>}
 */
export async function send(message, opts = {}) {
  const token = opts.token || defaultToken()
  if (!token) return { ok: false, reason: 'line_notify_not_configured' }
  const text = String(message || '').trim().slice(0, 1000)
  if (!text) return { ok: false, reason: 'line_notify_empty_message' }

  const body = new URLSearchParams({ message: text })
  if (opts.imageUrl) body.set('imageThumbnail', opts.imageUrl)

  try {
    const res = await fetch(`${BASE}/notify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'supermega-kernel/1.0',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      return { ok: false, reason: `line_notify_${res.status}`, detail: data?.message }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: String(e.message || 'line_notify_error').slice(0, 200) }
  }
}

export const messagingLineNotify = {
  key: 'messaging-line-notify',
  name: 'LINE Notify',
  category: 'messaging',
  docs: 'kernel/connectors/messaging-line-notify.mjs',
  configured,
  async health() {
    if (!configured()) return { ok: false, configured: false, reason: 'missing LINE_NOTIFY_TOKEN' }
    try {
      const res = await fetch(`${BASE}/status`, {
        headers: {
          Authorization: `Bearer ${defaultToken()}`,
          'User-Agent': 'supermega-kernel/1.0',
        },
        signal: AbortSignal.timeout(8000),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return { ok: false, configured: true, reason: `status check failed: ${data?.message || res.status}` }
      return { ok: true, configured: true, target: data?.targetType || '', name: data?.target || '' }
    } catch (e) {
      return { ok: false, configured: true, reason: String(e.message || 'line_notify_error').slice(0, 160) }
    }
  },
  send,
}

register(messagingLineNotify)
export default messagingLineNotify
