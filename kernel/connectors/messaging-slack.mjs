// Connector: messaging — Slack. Push messages via Slack Incoming Webhooks (zero-dependency,
// fetch-based). Optionally supports the Slack Bot API (chat.postMessage) when a bot token is
// present, enabling per-channel targeting and richer auth.test health checks.
//
// category 'messaging' · configured = SLACK_WEBHOOK_URL present.
//
// Quick setup (Incoming Webhook — no bot token needed for basic alerts):
//   1. Go to https://api.slack.com/apps → "Create New App" → "From scratch".
//   2. Enable "Incoming Webhooks" under Features and activate it.
//   3. Click "Add New Webhook to Workspace", choose a channel, then copy the URL.
//   4. Set it as SLACK_WEBHOOK_URL.
//
// Optional (Bot API — enables channel targeting at runtime):
//   1. Under OAuth & Permissions add scope: chat:write, auth:test.
//   2. Install the app to workspace, copy the "Bot User OAuth Token" (xoxb-…).
//   3. Set it as SLACK_BOT_TOKEN.
//
// Env:
//   SLACK_WEBHOOK_URL   (required)  incoming webhook URL from the Slack app config
//   SLACK_BOT_TOKEN     (optional)  bot OAuth token (xoxb-…) for bot API + auth.test health

import { register } from './registry.mjs'

const SLACK_API = 'https://slack.com/api'
const webhookUrl = () => String(process.env.SLACK_WEBHOOK_URL || '').trim()
const botToken = () => String(process.env.SLACK_BOT_TOKEN || '').trim()
const configured = () => Boolean(webhookUrl())

/**
 * send — post a message to Slack via the configured Incoming Webhook.
 *
 * When SLACK_BOT_TOKEN is set and opts.channel is provided, the message is
 * sent via chat.postMessage instead, which allows dynamic channel targeting
 * without pre-configuring a separate webhook per channel.
 *
 * @param {string}   text               the message body (plain text or mrkdwn).
 * @param {object}   [opts]
 * @param {Array}    [opts.blocks]       Slack Block Kit blocks for rich layout.
 * @param {string}   [opts.channel]      target channel id or name, e.g. '#alerts'.
 *                                       Requires SLACK_BOT_TOKEN; ignored for webhook mode.
 * @param {string}   [opts.username]     override the bot display name shown in Slack.
 * @param {string}   [opts.icon_emoji]   override the bot icon emoji, e.g. ':robot_face:'.
 * @param {string}   [opts.icon_url]     override the bot icon with an image URL.
 * @returns {Promise<{ ok:boolean, ts?:string, reason?:string }>}
 */
export async function send(text, opts = {}) {
  if (!configured()) return { ok: false, reason: 'slack_not_configured' }
  const message = String(text || '').trim()
  if (!message && !opts.blocks?.length) return { ok: false, reason: 'slack_empty_message' }

  const { blocks, channel, username, icon_emoji, icon_url } = opts

  // Use Bot API when a channel is explicitly specified and a bot token is available.
  const token = botToken()
  if (channel && token) {
    const body = { channel, text: message }
    if (blocks) body.blocks = blocks
    if (username) body.username = username
    if (icon_emoji) body.icon_emoji = icon_emoji
    if (icon_url) body.icon_url = icon_url

    try {
      const res = await fetch(`${SLACK_API}/chat.postMessage`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${token}`,
          'user-agent': 'supermega-kernel/1.0',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) {
        return { ok: false, reason: `slack_bot_${res.status}: ${json.error || ''}`.slice(0, 200) }
      }
      return { ok: true, ts: json.ts }
    } catch (e) {
      return { ok: false, reason: String(e.message || 'slack_error').slice(0, 200) }
    }
  }

  // Default: Incoming Webhook mode (no token needed, no channel targeting).
  const body = { text: message }
  if (blocks) body.blocks = blocks
  if (username) body.username = username
  if (icon_emoji) body.icon_emoji = icon_emoji
  if (icon_url) body.icon_url = icon_url

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
    const resText = await res.text().catch(() => '')
    if (!res.ok || resText === 'invalid_payload') {
      return { ok: false, reason: `slack_webhook_${res.status}: ${resText.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: String(e.message || 'slack_error').slice(0, 200) }
  }
}

export const messagingSlack = {
  key: 'messaging-slack',
  name: 'Slack',
  category: 'messaging',
  docs: 'kernel/connectors/messaging-slack.mjs',
  configured,
  /**
   * health — verify the connector is reachable.
   *
   * If SLACK_BOT_TOKEN is set, calls auth.test to confirm token validity and returns
   * workspace/bot info. Otherwise, reports whether SLACK_WEBHOOK_URL is configured
   * (the webhook URL itself cannot be probed without sending a real message).
   *
   * @returns {Promise<{ ok:boolean, configured:boolean, team?:string, bot?:string, reason?:string }>}
   */
  async health() {
    if (!configured()) return { ok: false, configured: false, detail: 'missing SLACK_WEBHOOK_URL' }
    const token = botToken()
    if (token) {
      try {
        const res = await fetch(`${SLACK_API}/auth.test`, {
          method: 'GET',
          headers: {
            'authorization': `Bearer ${token}`,
            'user-agent': 'supermega-kernel/1.0',
          },
          signal: AbortSignal.timeout(8000),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json.ok) {
          return { ok: false, configured: true, detail: `auth.test failed: ${json.error || res.status}` }
        }
        return { ok: true, configured: true, team: json.team || '', bot: json.bot_id || json.user || '' }
      } catch (e) {
        return { ok: false, configured: true, detail: String(e.message || 'slack_error').slice(0, 160) }
      }
    }
    // Webhook-only mode: can't probe the URL without sending a message — report presence only.
    return { ok: true, configured: true, detail: 'webhook url set; no bot token (auth.test skipped)' }
  },
  send,
}

register(messagingSlack)
export default messagingSlack
