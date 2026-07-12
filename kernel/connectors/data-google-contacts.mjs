// Connector: data — Google Contacts. Read the connected Google account's contacts (People API,
// zero-dependency, fetch-based). Lets Myanmar SMBs pull the customer/lead/supplier names, emails,
// and phone numbers they already keep in Google Contacts into the kernel — so an existing address
// book becomes a queryable source for outreach, dedupe, and enrichment without any manual export.
//
// category 'data' · configured = GOOGLE_CONTACTS_TOKEN present (non-empty).
//
// Quick setup:
//   1. Obtain an OAuth 2.0 access token for the Google account with scope
//      https://www.googleapis.com/auth/contacts.readonly (People API).
//   2. Set it as GOOGLE_CONTACTS_TOKEN. Requests send it as a Bearer token.
//   3. (Per call) pass pageSize to listContacts to bound how many connections come back.
//
// Env:
//   GOOGLE_CONTACTS_TOKEN  (required)  OAuth 2.0 access token for the People API (Bearer).
//
// Auth: Bearer token. Authorization: 'Bearer ' + GOOGLE_CONTACTS_TOKEN.
//
// The API host is a FIXED hardcoded constant (https://people.googleapis.com) — no user value ever
// selects the host, so these calls can't be turned into an SSRF primitive against an arbitrary host.
//
// Capabilities:
//   listContacts({ pageSize }) — GET /v1/people/me/connections (list the account's contacts).

import { register } from './registry.mjs'

// Fixed host — never derived from user input (SSRF-safe).
const API_HOST = 'https://people.googleapis.com'

const token = () => String(process.env.GOOGLE_CONTACTS_TOKEN || '').trim()

const authHeader = () => `Bearer ${token()}`

// configured — the Bearer token env var is present (non-empty).
const configured = () => token().length > 0

/**
 * listContacts — list the connected Google account's contacts (People API "connections").
 *
 * GETs /v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers&pageSize=<n> and
 * maps each connection to a flat { name, email, phone } using the first entry of each field.
 *
 * @param {object} [payload]
 * @param {number} [payload.pageSize=50]  max number of contacts to return (People API page size).
 * @returns {Promise<{ ok:boolean, status?:number, contacts?:Array<{name?:string,email?:string,phone?:string}>, reason?:string }>}
 */
export async function listContacts(_input = {}) {
  if (!configured()) return { ok: false, reason: 'data-google-contacts_not_configured' }
  const { pageSize = 50 } = _input || {}
  const size = Number(pageSize) || 50

  try {
    const url = `${API_HOST}/v1/people/me/connections?personFields=${encodeURIComponent('names,emailAddresses,phoneNumbers')}&pageSize=${encodeURIComponent(size)}`
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        authorization: authHeader(),
        accept: 'application/json',
        'user-agent': 'supermega-kernel/1.0',
      },
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      return { ok: false, status: res.status, reason: `data-google-contacts_${res.status}` }
    }
    const connections = Array.isArray(data?.connections) ? data.connections : []
    const contacts = connections.map((c) => ({
      name: c?.names?.[0]?.displayName,
      email: c?.emailAddresses?.[0]?.value,
      phone: c?.phoneNumbers?.[0]?.value,
    }))
    return { ok: true, status: res.status, contacts }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'data-google-contacts_error').slice(0, 200) }
  }
}

export const dataGoogleContacts = {
  key: 'data-google-contacts',
  name: 'Google Contacts',
  category: 'data',
  docs: 'kernel/connectors/data-google-contacts.mjs',
  configured,
  /**
   * health — GET /v1/people/me/connections with pageSize=1 is the cheapest authenticated liveness
   * probe: it confirms the Bearer token is valid and the People API is reachable while pulling at
   * most one connection.
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!configured()) return { ok: false, detail: 'missing GOOGLE_CONTACTS_TOKEN' }
    try {
      const url = `${API_HOST}/v1/people/me/connections?personFields=${encodeURIComponent('names')}&pageSize=1`
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          authorization: authHeader(),
          accept: 'application/json',
          'user-agent': 'supermega-kernel/1.0',
        },
        signal: AbortSignal.timeout(8000),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return { ok: false, detail: `data-google-contacts_${res.status}: ${(data?.error?.message || '')}`.slice(0, 160) }
      }
      return { ok: true, detail: 'connected' }
    } catch (e) {
      return { ok: false, detail: String(e?.message || 'data-google-contacts_error').slice(0, 160) }
    }
  },
  listContacts,
}

register(dataGoogleContacts)
export default dataGoogleContacts
