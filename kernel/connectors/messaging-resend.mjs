// Connector: messaging — Resend. Send transactional email via the Resend REST API
// (fetch-based, zero-dependency). Lets the kernel fire deal outreach, deposit receipts,
// and onboarding messages without the Google Workspace delegation requirement.
//
// category 'messaging' · configured = RESEND_API_KEY present.
//
// Env:
//   RESEND_API_KEY            (required) your Resend API key (re_...)
//   RESEND_FROM_EMAIL         (optional, default ops@supermega.dev)
//   RESEND_FROM_NAME          (optional, default SuperMega)
//
// Capabilities:
//   send({ to, subject, html, text, from, fromName, replyTo, cc, bcc })
//        -> { id }    (Resend email id)
//   health()          -> { ok, configured }

import { register } from './registry.mjs'

const API = 'https://api.resend.com'
const getKey = () => String(process.env.RESEND_API_KEY || '').trim()
const getFrom = () => {
  const name = String(process.env.RESEND_FROM_NAME || 'SuperMega').trim()
  const addr = String(process.env.RESEND_FROM_EMAIL || 'ops@supermega.dev').trim()
  return name ? `${name} <${addr}>` : addr
}

async function send(input) {
  const { to, subject, html, text, from, fromName, replyTo, cc, bcc } = input || {}
  const key = getKey()
  if (!key) return { ok: false, reason: 'resend_not_configured' }
  if (!to || !subject || (!html && !text)) return { ok: false, reason: 'resend: to, subject, and html or text are required' }

  let fromField = from
  if (!fromField) {
    const name = fromName || String(process.env.RESEND_FROM_NAME || 'SuperMega').trim()
    const addr = String(process.env.RESEND_FROM_EMAIL || 'ops@supermega.dev').trim()
    fromField = name ? `${name} <${addr}>` : addr
  }

  const body = { from: fromField, to: Array.isArray(to) ? to : [to], subject: String(subject).slice(0, 500) }
  if (html) body.html = html
  if (text) body.text = text
  if (replyTo) body.reply_to = replyTo
  if (cc) body.cc = Array.isArray(cc) ? cc : [cc]
  if (bcc) body.bcc = Array.isArray(bcc) ? bcc : [bcc]

  try {
    const res = await fetch(`${API}/emails`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, reason: `resend_${res.status}: ${json?.message || json?.name || ''}`.slice(0, 200) }
    return { ok: true, id: json.id }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'resend_timeout').slice(0, 200) }
  }
}

async function health() {
  const key = getKey()
  if (!key) return { ok: false, detail: 'RESEND_API_KEY not set' }
  try {
    if (!key.startsWith('re_')) return { ok: false, detail: 'RESEND_API_KEY format invalid (expected re_...)' }
    return { ok: true, detail: `from: ${getFrom()}` }
  } catch (err) {
    return { ok: false, detail: String(err.message).slice(0, 100) }
  }
}

export const messagingResend = {
  key: 'messaging-resend',
  name: 'Resend Email',
  category: 'messaging',
  configured: () => Boolean(getKey()),
  capabilities: ['send', 'health'],
  send,
  health,
}

register(messagingResend)

export default messagingResend
