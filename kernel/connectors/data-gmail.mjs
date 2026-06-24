// Connector: data — Gmail. Send + search messages via the Gmail REST API using a service-account
// JWT (fetch-based, zero-dependency — no googleapis SDK). Lets the kernel send transactional mail
// (deal packets, deposit confirmations) and search a mailbox from agents.
//
// category 'data' · configured = a Google service-account credential env is present.
//
// IMPORTANT: Gmail acts on a *user mailbox*, not the service account itself. You need a real
// mailbox to act as, supplied via domain-wide delegation:
//   GOOGLE_WORKSPACE_SUBJECT — the mailbox to impersonate (e.g. ops@supermega.dev). Required for
//                              real sends/searches; the service account must have domain-wide
//                              delegation granted for the Gmail scopes in the Workspace admin.
//
// Env:
//   GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_APPLICATION_CREDENTIALS  (one required — see _google-auth)
//   GOOGLE_WORKSPACE_SUBJECT                                      (required for live send/search)
//
// Capabilities beyond the interface:
//   send({ to, subject, text, from, cc, bcc })  -> { id, threadId }
//   search(query, { maxResults })               -> { messages, resultSizeEstimate }

import { register } from './registry.mjs'
import { credsConfigured, readServiceAccount, getAccessToken } from './_google-auth.mjs'

const API = 'https://gmail.googleapis.com/gmail/v1/users/me'
// send + read. (gmail.send alone can't search; gmail.readonly can't send — request both.)
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
]

const configured = credsConfigured
const subjectEnv = () => String(process.env.GOOGLE_WORKSPACE_SUBJECT || '').trim() || undefined

async function gmailFetch(method, path, { query, body, subject } = {}) {
  const sub = subject || subjectEnv()
  const token = await getAccessToken(SCOPES, { subject: sub })
  const qs = query ? `?${new URLSearchParams(query).toString()}` : ''
  const res = await fetch(`${API}${path}${qs}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(`gmail_${res.status}: ${json?.error?.message || ''}`.slice(0, 200))
    err.status = res.status
    throw err
  }
  return json
}

// Build a base64url RFC-2822 message. Plain-text only (sufficient for transactional mail).
function buildRawMessage({ to, subject, text, from, cc, bcc }) {
  const headers = []
  if (from) headers.push(`From: ${from}`)
  headers.push(`To: ${Array.isArray(to) ? to.join(', ') : to}`)
  if (cc) headers.push(`Cc: ${Array.isArray(cc) ? cc.join(', ') : cc}`)
  if (bcc) headers.push(`Bcc: ${Array.isArray(bcc) ? bcc.join(', ') : bcc}`)
  headers.push(`Subject: ${subject || ''}`)
  headers.push('MIME-Version: 1.0')
  headers.push('Content-Type: text/plain; charset="UTF-8"')
  const mime = `${headers.join('\r\n')}\r\n\r\n${text || ''}`
  return Buffer.from(mime, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * send — send a plain-text email as the impersonated mailbox.
 * @param {object} o
 * @param {string|string[]} o.to
 * @param {string} o.subject
 * @param {string} o.text
 * @param {string} [o.from]   defaults to the impersonated mailbox
 * @param {string|string[]} [o.cc]
 * @param {string|string[]} [o.bcc]
 * @param {string} [o.subjectUser]  override the impersonated mailbox for this call
 * @returns {Promise<{ id:string, threadId:string }>}
 */
export async function send({ to, subject, text, from, cc, bcc, subjectUser } = {}) {
  if (!configured()) throw new Error('gmail_not_configured')
  if (!to) throw new Error('gmail_missing_to')
  const sub = subjectUser || subjectEnv()
  if (!sub) throw new Error('gmail_missing_subject_mailbox') // need a mailbox to act as
  const raw = buildRawMessage({ to, subject, text, from: from || sub, cc, bcc })
  const json = await gmailFetch('POST', '/messages/send', { body: { raw }, subject: sub })
  return { id: json.id, threadId: json.threadId }
}

/**
 * search — list message ids matching a Gmail search query (e.g. 'from:client@x.com newer_than:7d').
 * @param {string} query
 * @param {object} [o]
 * @param {number} [o.maxResults=20]
 * @param {string} [o.subjectUser]
 * @returns {Promise<{ messages:Array, resultSizeEstimate:number }>}
 */
export async function search(query, { maxResults = 20, subjectUser } = {}) {
  if (!configured()) throw new Error('gmail_not_configured')
  const sub = subjectUser || subjectEnv()
  if (!sub) throw new Error('gmail_missing_subject_mailbox')
  const json = await gmailFetch('GET', '/messages', {
    query: { q: String(query || ''), maxResults: String(maxResults) },
    subject: sub,
  })
  return { messages: json.messages || [], resultSizeEstimate: json.resultSizeEstimate || 0 }
}

export const dataGmail = {
  key: 'data-gmail',
  name: 'Gmail',
  category: 'data',
  docs: 'kernel/connectors/data-gmail.mjs',
  configured,
  // Probe in two parts: creds must parse, and (if a subject mailbox is set) we mint a token for it.
  // Without GOOGLE_WORKSPACE_SUBJECT we can't truly act, so report that clearly but don't hard-fail
  // the page on a missing optional — surface it as a detail.
  async health() {
    if (!configured()) return { ok: false, detail: 'missing GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_APPLICATION_CREDENTIALS' }
    const sa = readServiceAccount()
    if (!sa) return { ok: false, detail: 'google creds present but unparseable (need client_email + private_key)' }
    const sub = subjectEnv()
    if (!sub) return { ok: false, detail: 'creds ok but no GOOGLE_WORKSPACE_SUBJECT (mailbox to act as) — send/search disabled' }
    try {
      await getAccessToken(SCOPES, { subject: sub })
      return { ok: true, detail: `auth ok (as ${sub})` }
    } catch (e) {
      return { ok: false, detail: String(e.message || 'google_token_error').slice(0, 160) }
    }
  },
  send,
  search,
}

register(dataGmail)
export default dataGmail
