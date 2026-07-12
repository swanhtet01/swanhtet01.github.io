// Connector: messaging — Discord. Push ops alerts/notifications to a Discord channel via an
// Incoming Webhook (zero-dependency, fetch-based). Lets Myanmar SMBs route order alerts, payment
// confirmations, low-stock warnings, and system health pings into a shared Discord channel the
// whole team already watches — no bot hosting, no extra app to install.
//
// category 'messaging' · configured = DISCORD_WEBHOOK_URL present AND a valid discord.com webhook URL.
//
// Quick setup (Incoming Webhook — no bot token needed):
//   1. In Discord: Server Settings → Integrations → Webhooks → "New Webhook".
//   2. Pick the target channel, optionally name it (e.g. "SUPERMEGA") and set an avatar.
//   3. Click "Copy Webhook URL" (looks like https://discord.com/api/webhooks/<id>/<token>).
//   4. Set it as DISCORD_WEBHOOK_URL.
//
// Env:
//   DISCORD_WEBHOOK_URL  (required)  incoming webhook URL from the Discord channel config
//
// Capabilities:
//   send({ content, username, embeds }) — post a message/embeds to the channel.

import { register } from './registry.mjs'

const webhookUrl = () => String(process.env.DISCORD_WEBHOOK_URL || '').trim()

// configured — present AND a real Discord webhook URL. We validate the host here (not just
// "starts with https://") so a misconfigured/hostile DISCORD_WEBHOOK_URL can't turn send()/health()
// into an SSRF primitive that POSTs/GETs against an arbitrary internal host.
const configured = () => {
  try {
    const raw = webhookUrl()
    if (!raw || !raw.startsWith('https://')) return false
    const u = new URL(raw)
    if (u.protocol !== 'https:') return false
    const host = u.hostname.toLowerCase()
    const okHost = host === 'discord.com' || host === 'discordapp.com' || host === 'canary.discord.com' || host === 'ptb.discord.com'
    if (!okHost) return false
    return u.pathname.startsWith('/api/webhooks/')
  } catch {
    return false
  }
}

/**
 * send — post a message to the configured Discord channel via its Incoming Webhook.
 *
 * Discord returns 204 No Content on success; any 2xx is treated as ok.
 *
 * @param {object}  [payload]
 * @param {string}  [payload.content]   the message body (plain text; markdown supported in Discord).
 * @param {string}  [payload.username]  override the webhook display name shown for this message.
 * @param {Array}   [payload.embeds]    Discord embed objects for rich layout (title/desc/fields/color).
 * @returns {Promise<{ ok:boolean, status?:number, reason?:string }>}
 */
export async function send(_input = {}) {
  const { content, username, embeds } = _input || {}
  if (!configured()) return { ok: false, reason: 'discord_not_configured' }
  const message = String(content || '').trim()
  const hasEmbeds = Array.isArray(embeds) && embeds.length > 0
  if (!message && !hasEmbeds) return { ok: false, reason: 'discord_empty_message' }

  const body = {}
  if (message) body.content = message
  if (username) body.username = String(username)
  if (hasEmbeds) body.embeds = embeds

  try {
    const res = await fetch(webhookUrl(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'supermega-kernel/1.0',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      const resText = await res.text().catch(() => '')
      return { ok: false, reason: `discord_webhook_${res.status}: ${resText.slice(0, 200)}` }
    }
    return { ok: true, status: res.status }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'discord_error').slice(0, 200) }
  }
}

export const messagingDiscord = {
  key: 'messaging-discord',
  name: 'Discord',
  category: 'messaging',
  docs: 'kernel/connectors/messaging-discord.mjs',
  configured,
  /**
   * health — a GET on a Discord webhook URL returns 200 with the webhook's JSON metadata
   * (id, name, channel_id, guild_id) without sending a message, so it's a safe liveness probe.
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!configured()) return { ok: false, detail: 'missing DISCORD_WEBHOOK_URL' }
    try {
      const res = await fetch(webhookUrl(), {
        method: 'GET',
        headers: { 'user-agent': 'supermega-kernel/1.0' },
        signal: AbortSignal.timeout(8000),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return { ok: false, detail: `discord_webhook_${res.status}: ${(data?.message || '')}`.slice(0, 160) }
      }
      const label = data?.name || data?.channel_id || data?.id || 'webhook ok'
      return { ok: true, detail: `webhook=${label}`.slice(0, 160) }
    } catch (e) {
      return { ok: false, detail: String(e?.message || 'discord_error').slice(0, 160) }
    }
  },
  send,
}

register(messagingDiscord)
export default messagingDiscord
