// Connector: data — Xero. Read invoices/contacts out of Xero's accounting API (zero-dependency,
// fetch-based) so a Myanmar SMB can pull the customer list and financials it already keeps in Xero
// into the SuperMega kernel — reconciling DeskPOS sales, chasing invoices, and enriching CRM records
// against the real books instead of re-keying them by hand.
//
// category 'data' · configured = XERO_ACCESS_TOKEN AND XERO_TENANT_ID both present.
//
// Quick setup:
//   1. In Xero: create an app at https://developer.xero.com/app/manage and connect it to the
//      organisation you want to read (OAuth 2.0). Grant the `accounting.contacts.read` and
//      `accounting.transactions.read` scopes.
//   2. Complete the OAuth flow to obtain an access token (short-lived — refresh it out-of-band and
//      keep XERO_ACCESS_TOKEN current).
//   3. Set XERO_ACCESS_TOKEN to that bearer token.
//   4. A Xero access token can span multiple connected organisations, so every call must name one:
//      call GET https://api.xero.com/connections and set XERO_TENANT_ID to the tenantId of the org
//      you want to read.
//
// Env:
//   XERO_ACCESS_TOKEN  (required)  OAuth 2.0 bearer access token for the Xero Accounting API.
//   XERO_TENANT_ID     (required)  tenantId of the connected organisation to read (Xero-tenant-id).
//
// Auth: Bearer. Every request sends:
//   Authorization: 'Bearer ' + XERO_ACCESS_TOKEN
//   Xero-tenant-id: XERO_TENANT_ID
//   Accept: 'application/json'   (Xero defaults to XML without it)
//
// Base: https://api.xero.com/api.xro/2.0 (fixed host — never chosen from a user value).
//
// Capabilities:
//   listContacts({ page }) — GET /Contacts?page=<page> (customers/suppliers, one page of results).

import { register } from './registry.mjs'

// Fixed API base — hardcoded https constant, so no user value ever chooses the host.
const API_BASE = 'https://api.xero.com/api.xro/2.0'

const accessToken = () => String(process.env.XERO_ACCESS_TOKEN || '').trim()
const tenantId = () => String(process.env.XERO_TENANT_ID || '').trim()

// configured — both the bearer token and the tenant id must be present. The host is a fixed
// constant, so there's no user-controlled host to validate; we only gate on env presence.
const configured = () => Boolean(accessToken()) && Boolean(tenantId())

// Standard authenticated headers for a Xero Accounting API request. Accept:application/json is
// required — without it Xero returns XML, which json() can't parse.
function authHeaders() {
  return {
    authorization: `Bearer ${accessToken()}`,
    'xero-tenant-id': tenantId(),
    accept: 'application/json',
    'user-agent': 'supermega-kernel/1.0',
  }
}

/**
 * listContacts — read one page of contacts (customers/suppliers) from the connected organisation.
 *
 * GETs /Contacts?page=<page>. Xero paginates contacts 100 per page; pass the page number to walk
 * through them. Returns a flattened [{ id, name }] list so callers don't touch Xero's PascalCase.
 *
 * @param {object} [payload]
 * @param {number} [payload.page]  1-based page of results to fetch (default 1).
 * @returns {Promise<{ ok:boolean, status?:number, contacts?:Array<{id:string,name:string}>, reason?:string }>}
 */
export async function listContacts({ page = 1 } = {}) {
  if (!configured()) return { ok: false, reason: 'data-xero_not_configured' }
  const p = Number(page) || 1

  try {
    const res = await fetch(`${API_BASE}/Contacts?page=${encodeURIComponent(p)}`, {
      method: 'GET',
      headers: authHeaders(),
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const reason = data?.error || data?.message || `http_${res.status}`
      return { ok: false, status: res.status, reason: `data-xero_${String(reason)}`.slice(0, 200) }
    }
    const contacts = (data?.Contacts || []).map((c) => ({ id: c.ContactID, name: c.Name }))
    return { ok: true, status: res.status, contacts }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'data-xero_error').slice(0, 200) }
  }
}

export const dataXero = {
  key: 'data-xero',
  name: 'Xero',
  category: 'data',
  docs: 'kernel/connectors/data-xero.mjs',
  configured,
  /**
   * health — GET /Organisation is Xero's cheapest authenticated read: it returns the connected
   * org's details (one small object) and confirms the token + tenant id are valid without touching
   * invoice or contact volume.
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!configured()) return { ok: false, detail: 'missing XERO_ACCESS_TOKEN' }
    try {
      const res = await fetch(`${API_BASE}/Organisation`, {
        method: 'GET',
        headers: authHeaders(),
        signal: AbortSignal.timeout(8000),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return { ok: false, detail: `data-xero_${res.status}: ${(data?.error || data?.message || '')}`.slice(0, 160) }
      }
      const label = data?.Organisations?.[0]?.Name || 'organisation ok'
      return { ok: true, detail: String(label).slice(0, 160) }
    } catch (e) {
      return { ok: false, detail: String(e?.message || 'data-xero_error').slice(0, 160) }
    }
  },
  listContacts,
}

register(dataXero)
export default dataXero
