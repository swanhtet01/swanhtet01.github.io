// Connector: messaging — Microsoft Teams. Push messages via Teams Incoming Webhooks (zero-dependency,
// fetch-based). Supports Adaptive Cards for rich formatting when opts.card is supplied.
//
// category 'messaging' · configured = TEAMS_WEBHOOK_URL present.
//
// Quick setup (Incoming Webhook):
//   1. In Teams, go to a channel → … → Connectors → Incoming Webhook → Configure.
//   2. Give it a name (e.g. "SUPERMEGA"), optionally upload an icon, then Copy the URL.
//   3. Set it as TEAMS_WEBHOOK_URL.
//
// Env:
//   TEAMS_WEBHOOK_URL  (required)  incoming webhook URL from Teams channel connectors

import { register } from './registry.mjs'

const webhookUrl = () => String(process.env.TEAMS_WEBHOOK_URL || '').trim()
const configured = () => Boolean(webhookUrl())

/**
 * send — post a message to a Teams channel via the configured Incoming Webhook.
 *
 * @param {string}  text             the message body (plain text; markdown supported in Teams).
 * @param {object}  [opts]
 * @param {object}  [opts.card]      a full Adaptive Card JSON object; overrides plain-text body.
 * @param {string}  [opts.title]     optional title shown above the text in a MessageCard.
 * @param {string}  [opts.themeColor] hex accent color for the MessageCard, e.g. '#D97757'.
 * @returns {Promise<{ ok:boolean, reason?:string }>}
 */
export async function send(text, opts = {}) {
  if (!configured()) return { ok: false, reason: 'teams_not_configured' }
  const message = String(text || '').trim()
  if (!message && !opts.card) return { ok: false, reason: 'teams_empty_message' }

  let body
  if (opts.card) {
    body = {
      type: 'message',
      attachments: [{
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: opts.card,
      }],
    }
  } else {
    body = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: opts.themeColor || 'D97757',
      summary: message.slice(0, 80),
      sections: [{ activityText: message }],
    }
    if (opts.title) body.title = opts.title
  }

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
    if (!res.ok) {
      return { ok: false, reason: `teams_webhook_${res.status}: ${resText.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: String(e.message || 'teams_error').slice(0, 200) }
  }
}

export const messagingTeams = {
  key: 'messaging-teams',
  name: 'Microsoft Teams',
  category: 'messaging',
  docs: 'kernel/connectors/messaging-teams.mjs',
  configured,
  async health() {
    if (!configured()) return { ok: false, configured: false, reason: 'missing TEAMS_WEBHOOK_URL' }
    return { ok: true, configured: true, detail: 'webhook url set; Teams does not support probe-only health checks without sending a message' }
  },
  send,
}

register(messagingTeams)
export default messagingTeams
