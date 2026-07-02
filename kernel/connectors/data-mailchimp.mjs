// Connector: data — Mailchimp. Push contacts into a Mailchimp audience (list) via the Mailchimp
// Marketing API (zero-dependency, fetch-based). Lets Myanmar SMBs sync new customers, leads, and
// signups from DeskPOS / the demo funnel straight into an email audience they already own — so a
// captured email becomes a subscriber (and a future campaign recipient) without any manual export.
//
// category 'data' · configured = MAILCHIMP_API_KEY present AND it carries a "-<dc>" datacenter suffix.
//
// Quick setup:
//   1. In Mailchimp: Account → Extras → API keys → "Create A Key".
//   2. Copy the key. It ALWAYS ends with a datacenter suffix, e.g. "abc123...def-us21".
//   3. Set it as MAILCHIMP_API_KEY. The server prefix (us21) is derived from the part after the
//      last '-' — the API base becomes https://us21.api.mailchimp.com/3.0.
//   4. (Per call) pass the audience/list id to addSubscriber — find it under
//      Audience → Settings → "Audience name and defaults" → Audience ID.
//
// Env:
//   MAILCHIMP_API_KEY  (required)  Mailchimp Marketing API key in "<key>-<dc>" form (dc = datacenter).
//
// Auth: HTTP Basic. Username is any non-empty string ('anystring'), password is the API key.
//   Authorization: 'Basic ' + base64('anystring:' + MAILCHIMP_API_KEY).
//
// Capabilities:
//   addSubscriber({ listId, email, status }) — POST /lists/<listId>/members (add a member to an audience).

import { register } from './registry.mjs'

const apiKey = () => String(process.env.MAILCHIMP_API_KEY || '').trim()

// Derive the datacenter (server prefix) from the part after the LAST '-' in the key, e.g.
// "…def-us21" → "us21". Returns '' when there's no suffix so configured() can reject it.
function datacenter() {
  const key = apiKey()
  const idx = key.lastIndexOf('-')
  if (idx < 0) return ''
  return key.slice(idx + 1).trim()
}

// Build the API base for the derived datacenter, e.g. https://us21.api.mailchimp.com/3.0.
function apiBase() {
  return `https://${datacenter()}.api.mailchimp.com/3.0`
}

const authHeader = () => 'Basic ' + Buffer.from(`anystring:${apiKey()}`).toString('base64')

// configured — key present AND it has a "-<dc>" suffix that yields a valid Mailchimp API host. We
// build the base from the derived datacenter and VALIDATE the resulting host with new URL() (not a
// bare "startsWith https://") so a malformed/hostile datacenter segment can't turn addSubscriber()/
// health() into an SSRF primitive that hits an arbitrary internal host.
const configured = () => {
  try {
    const dc = datacenter()
    // dc must be a plausible datacenter token (e.g. us21, us6) — letters+digits only. This blocks
    // anything that could smuggle a different host (dots, slashes, '@', etc.) into the URL.
    if (!dc || !/^[a-z]+[0-9]+$/i.test(dc)) return false
    const u = new URL(apiBase())
    if (u.protocol !== 'https:') return false
    const host = u.hostname.toLowerCase()
    return host === `${dc.toLowerCase()}.api.mailchimp.com`
  } catch {
    return false
  }
}

/**
 * addSubscriber — add (or attempt to add) a member to a Mailchimp audience (list).
 *
 * POSTs to /lists/<listId>/members. Mailchimp returns 200 with the new member on success. A 400
 * "Member Exists" means the email is already on the audience — surfaced via reason (not thrown).
 *
 * @param {object}  [payload]
 * @param {string}  [payload.listId]  the audience/list id to add the member to (required).
 * @param {string}  [payload.email]   the subscriber email address (required).
 * @param {string}  [payload.status]  subscription status: 'subscribed' (default) | 'pending' | etc.
 * @returns {Promise<{ ok:boolean, status?:number, id?:string, reason?:string }>}
 */
export async function addSubscriber({ listId, email, status = 'subscribed' } = {}) {
  if (!configured()) return { ok: false, reason: 'mailchimp_not_configured' }
  const id = String(listId || '').trim()
  const addr = String(email || '').trim()
  if (!id) return { ok: false, reason: 'mailchimp_missing_list_id' }
  if (!addr) return { ok: false, reason: 'mailchimp_missing_email' }

  const body = { email_address: addr, status: String(status || 'subscribed') }

  try {
    const res = await fetch(`${apiBase()}/lists/${encodeURIComponent(id)}/members`, {
      method: 'POST',
      headers: {
        authorization: authHeader(),
        'content-type': 'application/json',
        'user-agent': 'supermega-kernel/1.0',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const reason = data?.title || data?.detail || `http_${res.status}`
      return { ok: false, status: res.status, reason: `mailchimp_${String(reason)}`.slice(0, 200) }
    }
    return { ok: true, status: res.status, id: data?.id }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'mailchimp_error').slice(0, 200) }
  }
}

export const dataMailchimp = {
  key: 'data-mailchimp',
  name: 'Mailchimp',
  category: 'data',
  docs: 'kernel/connectors/data-mailchimp.mjs',
  configured,
  /**
   * health — GET /ping is Mailchimp's documented cheap authenticated liveness probe. It returns
   * 200 with { health_status: "Everything's Chimpy!" } when the key/datacenter are valid, without
   * touching any audience data.
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!configured()) return { ok: false, detail: 'missing MAILCHIMP_API_KEY' }
    try {
      const res = await fetch(`${apiBase()}/ping`, {
        method: 'GET',
        headers: {
          authorization: authHeader(),
          'user-agent': 'supermega-kernel/1.0',
        },
        signal: AbortSignal.timeout(8000),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return { ok: false, detail: `mailchimp_${res.status}: ${(data?.title || data?.detail || '')}`.slice(0, 160) }
      }
      const label = data?.health_status || 'ping ok'
      return { ok: true, detail: String(label).slice(0, 160) }
    } catch (e) {
      return { ok: false, detail: String(e?.message || 'mailchimp_error').slice(0, 160) }
    }
  },
  addSubscriber,
}

register(dataMailchimp)
export default dataMailchimp
