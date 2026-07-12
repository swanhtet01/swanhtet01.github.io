// Connector: data — QuickBooks Online. Read a company's accounting data from Intuit QuickBooks
// Online, the #1 SMB accounting system (zero-dependency, fetch-based). Lets the SUPERMEGA console
// pull the connected company's profile (legal name, country, fiscal-year start, currency) so the
// CEO console can confirm the books are wired up and surface the real business name on dashboards —
// the foundation for later pulling invoices, P&L, and balances into one operating view.
//
// category 'data' · configured = QUICKBOOKS_ACCESS_TOKEN present AND QUICKBOOKS_REALM_ID present.
//
// Quick setup (QuickBooks Online — via an Intuit OAuth2 app):
//   1. Create an app at https://developer.intuit.com and add the "Accounting" (com.intuit.quickbooks.accounting) scope.
//   2. Run the OAuth2 authorization flow and connect the target QuickBooks company.
//   3. The flow returns an access token + the company's realmId (a.k.a. the Company ID).
//   4. Set QUICKBOOKS_ACCESS_TOKEN (the bearer access token) and QUICKBOOKS_REALM_ID (the company id).
//
// NOTE ON TOKENS: QuickBooks access tokens are OAuth2 bearer tokens that expire (~1h) and are
// refreshed with a refresh token. That refresh cycle is handled UPSTREAM — this connector simply
// reads a currently-valid access token from the env and never performs the refresh itself.
//
// Env:
//   QUICKBOOKS_ACCESS_TOKEN  (required)  a current OAuth2 bearer access token for the QBO company
//   QUICKBOOKS_REALM_ID      (required)  the QuickBooks company id (realmId) to query
//
// Capabilities:
//   companyInfo() — GET the company profile for the configured realm (name, country, currency, fiscal year).

import { register } from './registry.mjs'

// Intuit QuickBooks Online production API base. (The sandbox uses sandbox-quickbooks.api.intuit.com;
// this connector targets production, matching the documented base for live company data.)
const API_BASE = 'https://quickbooks.api.intuit.com'
const API_HOST = 'quickbooks.api.intuit.com'

const accessToken = () => String(process.env.QUICKBOOKS_ACCESS_TOKEN || '').trim()
const realmId = () => String(process.env.QUICKBOOKS_REALM_ID || '').trim()

// configured — both the bearer token AND the realm id must be present. We also VALIDATE that the
// URL we build resolves to the real Intuit API host (not just "starts with https://") so a tampered
// API_BASE could never turn companyInfo()/health() into an SSRF primitive against an internal host.
const configured = () => {
  try {
    if (!accessToken() || !realmId()) return false
    const u = new URL(API_BASE)
    if (u.protocol !== 'https:') return false
    return u.hostname.toLowerCase() === API_HOST
  } catch {
    return false
  }
}

/**
 * companyInfo — fetch the CompanyInfo record for the configured realm.
 *
 * QuickBooks exposes the company profile at:
 *   GET /v3/company/<realmId>/companyinfo/<realmId>
 * authenticated with the OAuth2 bearer access token. On success it returns a
 * { CompanyInfo: { CompanyName, LegalName, Country, ... } } envelope.
 *
 * @returns {Promise<{ ok:boolean, status?:number, company?:object, name?:string, reason?:string }>}
 */
export async function companyInfo() {
  if (!configured()) return { ok: false, reason: 'quickbooks_not_configured' }

  const realm = realmId()
  const url = `${API_BASE}/v3/company/${encodeURIComponent(realm)}/companyinfo/${encodeURIComponent(realm)}`

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${accessToken()}`,
        accept: 'application/json',
        'user-agent': 'supermega-kernel/1.0',
      },
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const msg = data?.Fault?.Error?.[0]?.Message || data?.fault?.error?.[0]?.message || ''
      return { ok: false, status: res.status, reason: `quickbooks_${res.status}: ${String(msg).slice(0, 200)}` }
    }
    const company = data?.CompanyInfo || null
    const name = company?.CompanyName || company?.LegalName || ''
    return { ok: true, status: res.status, company, name }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'quickbooks_error').slice(0, 200) }
  }
}

export const dataQuickbooks = {
  key: 'data-quickbooks',
  name: 'QuickBooks',
  category: 'data',
  docs: 'kernel/connectors/data-quickbooks.mjs',
  configured,
  /**
   * health — a cheap authenticated liveness probe: fetch the company profile via companyInfo().
   * A 200 with a real CompanyInfo record proves the token is valid AND scoped to the realm, so we
   * report the company name as the detail. Any non-200 (401 expired token, 403, etc.) is unhealthy.
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!configured()) {
      const missing = !accessToken() ? 'QUICKBOOKS_ACCESS_TOKEN' : 'QUICKBOOKS_REALM_ID'
      return { ok: false, detail: `missing ${missing}` }
    }
    try {
      const r = await companyInfo()
      if (!r.ok) return { ok: false, detail: String(r.reason || 'unhealthy').slice(0, 160) }
      const label = r.name || 'company ok'
      return { ok: true, detail: `company=${label}`.slice(0, 160) }
    } catch (e) {
      return { ok: false, detail: String(e?.message || 'quickbooks_error').slice(0, 160) }
    }
  },
  companyInfo,
}

register(dataQuickbooks)
export default dataQuickbooks
