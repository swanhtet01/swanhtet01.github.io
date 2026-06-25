// Connector: messaging — SMS via Twilio. Outbound SMS for alerts to feature-phone users.
// Complements the YTF app's sms-webhook.js (inbound); together they form a full SMS channel.
//
// category 'messaging' · configured = TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM present.
//
// Setup:
//   1. console.twilio.com → buy a number (supports SMS in Myanmar via international routes).
//   2. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (the purchased number, E.164 format).
//   3. For inbound: wire the number's webhook to https://ytf.supermega.dev/api/sms-webhook.
//
// Env:
//   TWILIO_ACCOUNT_SID  (required)  e.g. AC...
//   TWILIO_AUTH_TOKEN   (required)  from console.twilio.com
//   TWILIO_FROM         (required)  E.164 sender number, e.g. +12015551234
//
// Capabilities:
//   send(to, text)   -> { ok, sid }
//   health()         -> { ok, detail }

import { register } from './registry.mjs'

const BASE = 'https://api.twilio.com/2010-04-01'
const sid = () => String(process.env.TWILIO_ACCOUNT_SID || '').trim()
const token = () => String(process.env.TWILIO_AUTH_TOKEN || '').trim()
const from = () => String(process.env.TWILIO_FROM || '').trim()
const configured = () => Boolean(sid() && token() && from())

function basicAuth() {
  return 'Basic ' + Buffer.from(`${sid()}:${token()}`).toString('base64')
}

/**
 * send — deliver an SMS to a phone number.
 * @param {string} to    E.164 destination number, e.g. +959...
 * @param {string} text  message body (max 1600 chars; Twilio auto-segments long messages).
 * @returns {Promise<{ ok:boolean, sid:string }>}
 */
export async function send(to, text) {
  if (!configured()) throw new Error('sms_not_configured')
  if (!to) throw new Error('sms_missing_to')
  const body = new URLSearchParams({ To: to, From: from(), Body: String(text || '').slice(0, 1600) })
  const res = await fetch(`${BASE}/Accounts/${sid()}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(10000),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`twilio_${res.status}: ${json?.message || ''}`.slice(0, 200))
  return { ok: true, sid: json.sid }
}

export const messagingSms = {
  key: 'messaging-sms',
  name: 'SMS (Twilio)',
  category: 'messaging',
  docs: 'kernel/connectors/messaging-sms.mjs',
  configured,
  async health() {
    if (!configured()) return { ok: false, detail: 'missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_FROM' }
    try {
      // Fetch account details as a lightweight auth probe.
      const res = await fetch(`${BASE}/Accounts/${sid()}.json`, {
        headers: { Authorization: basicAuth() },
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) return { ok: false, detail: `twilio_${res.status}` }
      const j = await res.json().catch(() => ({}))
      return { ok: true, detail: `account ${j.friendly_name || sid()} (${j.status || 'active'})` }
    } catch (e) {
      return { ok: false, detail: String(e.message || 'twilio_error').slice(0, 160) }
    }
  },
  send,
}

register(messagingSms)
export default messagingSms
