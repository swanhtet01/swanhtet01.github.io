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

async function send({ to, subject, html, text, from, fromName, replyTo, cc, bcc }) {
  const key = getKey()
  if (!key) throw new Error('resend_not_configured')
  if (!to || !subject || (!html && !text)) throw new Error('resend: to, subject, and html or text are required')

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

  const res = await fetch(`${API}/emails`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`resend_${res.status}: ${json?.message || json?.name || ''}`.slice(0, 200))
  return { id: json.id }
}

async function health() {
  const key = getKey()
  if (!key) return { ok: false, configured: false, reason: 'RESEND_API_KEY not set' }
  try {
    // Light check: verify the key is syntactically valid (re_... prefix) without making a real API call
    if (!key.startsWith('re_')) return { ok: false, configured: false, reason: 'RESEND_API_KEY format invalid (expected re_...)' }
    return { ok: true, configured: true, from: getFrom() }
  } catch (err) {
    return { ok: false, configured: true, reason: String(err.message).slice(0, 100) }
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
