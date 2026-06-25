// Connector: messaging — LINE Business API (LINE Official Account / Messaging API).
//
// LINE is widely used by Myanmar businesses (especially retail, clinics, studios) for
// customer communication. This connector handles:
//   1. send        — push a text/flex message to a single user (userId/groupId/roomId)
//   2. broadcast   — send to all followers of the LINE Official Account
//   3. health      — GET /v2/bot/info to verify the channel access token
//
// Env:
//   LINE_CHANNEL_ACCESS_TOKEN   (required) long-lived channel access token from LINE Developers
//   LINE_CHANNEL_SECRET         (optional) for validating incoming webhook signatures
//
// Docs: https://developers.line.biz/en/reference/messaging-api/

import crypto from 'node:crypto'
import { register } from './registry.mjs'

const getToken  = () => String(process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim()
const getSecret = () => String(process.env.LINE_CHANNEL_SECRET       || '').trim()
const configured = () => Boolean(getToken())

const API = 'https://api.line.me'

async function linePost(path, body) {
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${getToken()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  })
  const json = await r.json().catch(() => ({}))
  if (!r.ok) {
    const err = new Error(`line_${r.status}: ${json.message || r.statusText}`)
    err.status = r.status
    err.body = json
    throw err
  }
  return json
}

/**
 * send — push a message to a single LINE user/group/room.
 * @param {object} o
 * @param {string}   o.to      LINE userId / groupId / roomId
 * @param {string}   o.text    plain-text message body (up to 5000 chars)
 * @param {object[]} [o.messages]  raw LINE message objects (overrides `text`)
 * @returns {Promise<{ ok:boolean, requestId?:string, reason?:string }>}
 */
export async function send({ to, text, messages } = {}) {
  if (!configured()) return { ok: false, reason: 'line_not_configured' }
  if (!to) return { ok: false, reason: 'line_missing_to' }
  const msgs = messages || [{ type: 'text', text: String(text || '').slice(0, 5000) }]
  try {
    const r = await linePost('/v2/bot/message/push', { to, messages: msgs })
    return { ok: true, requestId: r.requestId || null }
  } catch (e) {
    return { ok: false, reason: String(e.message).slice(0, 200), status: e.status }
  }
}

/**
 * broadcast — send to all followers (use sparingly; rate-limited by plan).
 * @param {object} o
 * @param {string}   o.text     plain-text body
 * @param {object[]} [o.messages]  raw LINE message objects (overrides `text`)
 * @returns {Promise<{ ok:boolean, requestId?:string, reason?:string }>}
 */
export async function broadcast({ text, messages } = {}) {
  if (!configured()) return { ok: false, reason: 'line_not_configured' }
  const msgs = messages || [{ type: 'text', text: String(text || '').slice(0, 5000) }]
  try {
    const r = await linePost('/v2/bot/message/broadcast', { messages: msgs })
    return { ok: true, requestId: r.requestId || null }
  } catch (e) {
    return { ok: false, reason: String(e.message).slice(0, 200), status: e.status }
  }
}

/**
 * verifyWebhook — verify an incoming LINE webhook signature.
 * @param {string|Buffer} rawBody  the raw POST body bytes
 * @param {string}        signature  X-Line-Signature header value
 * @returns {{ ok:boolean, reason?:string }}
 */
export function verifyWebhook(rawBody, signature) {
  const secret = getSecret()
  if (!secret) return { ok: false, reason: 'LINE_CHANNEL_SECRET not set' }
  try {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64')
    const expBuf = Buffer.from(expected, 'utf8')
    const recBuf = Buffer.from((signature || '').padEnd(expected.length, '\0').slice(0, expected.length), 'utf8')
    const ok = expBuf.length === recBuf.length && crypto.timingSafeEqual(expBuf, recBuf)
    return ok ? { ok: true } : { ok: false, reason: 'signature_mismatch' }
  } catch (e) {
    return { ok: false, reason: String(e.message).slice(0, 80) }
  }
}

export const messagingLine = {
  key: 'messaging-line',
  name: 'LINE',
  category: 'messaging',
  docs: 'kernel/connectors/messaging-line.mjs',
  configured,
  async health() {
    if (!configured()) return { ok: false, configured: false, detail: 'missing LINE_CHANNEL_ACCESS_TOKEN' }
    try {
      const r = await fetch(`${API}/v2/bot/info`, {
        headers: { authorization: `Bearer ${getToken()}` },
        signal: AbortSignal.timeout(8000),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) return { ok: false, configured: true, detail: `auth failed: ${j.message || r.status}` }
      return { ok: true, configured: true, detail: `ok — bot: ${j.displayName || '?'} (${j.basicId || ''})` }
    } catch (e) {
      return { ok: false, configured: true, detail: String(e.message).slice(0, 160) }
    }
  },
  send,
  broadcast,
  verifyWebhook,
}

register(messagingLine)
export default messagingLine
