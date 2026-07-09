// Connector: data — Zoho Books. Read accounting data (invoices, etc.) from a Zoho Books
// organization via the Zoho Books API (zero-dependency, fetch-based). Lets Myanmar SMBs that keep
// their books in Zoho pull live invoice data into the kernel — so DeskPOS / the demo funnel can
// reconcile sales against what has actually been billed, without any manual export.
//
// category 'data' · configured = ZOHO_BOOKS_ACCESS_TOKEN present AND ZOHO_BOOKS_ORG_ID present.
//
// Quick setup (Zoho Books API v3):
//   1. In the Zoho API Console (https://api-console.zoho.com) create a Self Client / app and grant
//      the ZohoBooks.invoices.READ scope → run the OAuth flow to obtain an access token.
//      (Access tokens expire; refresh them out-of-band and keep ZOHO_BOOKS_ACCESS_TOKEN current.)
//   2. Find your Organization ID in Zoho Books → Settings → Organizations (a numeric id).
//   3. Set ZOHO_BOOKS_ACCESS_TOKEN and ZOHO_BOOKS_ORG_ID.
//
// Auth: Zoho's OAuth header — Authorization: 'Zoho-oauthtoken <ZOHO_BOOKS_ACCESS_TOKEN>'. The
//   organization_id rides as a query param on every call.
//
// Env:
//   ZOHO_BOOKS_ACCESS_TOKEN  (required)  Zoho OAuth access token with ZohoBooks read scope.
//   ZOHO_BOOKS_ORG_ID        (required)  numeric Zoho Books organization id.
//
// Capabilities:
//   listInvoices({ page }) — GET /books/v3/invoices (list invoices for the organization).

import { register } from './registry.mjs'

// Fixed, documented Zoho API host. We do NOT read the base from env — there is no per-tenant host
// here (the org is scoped by the organization_id query param, not the hostname), so hardcoding
// removes any chance of an env-driven SSRF target.
const API_BASE = 'https://www.zohoapis.com'

const accessToken = () => String(process.env.ZOHO_BOOKS_ACCESS_TOKEN || '').trim()
const orgId = () => String(process.env.ZOHO_BOOKS_ORG_ID || '').trim()

const authHeader = () => `Zoho-oauthtoken ${accessToken()}`

// configured — required env vars present ONLY. The host is a hardcoded https constant (never
// derived from any user/env value), so there is nothing host-related to validate here.
const configured = () => Boolean(accessToken() && orgId())

/**
 * listInvoices — list invoices for the configured Zoho Books organization.
 *
 * GET /books/v3/invoices?organization_id=<orgId>&page=<page>. Zoho returns a JSON envelope with a
 * `code` field (0 = success) and an `invoices` array. Non-zero codes / non-2xx responses are
 * surfaced via reason (never thrown).
 *
 * @param {object} [payload]
 * @param {number} [payload.page]  1-based page number (default 1).
 * @returns {Promise<{ ok:boolean, invoices?:object[], reason?:string, status?:number }>}
 */
export async function listInvoices(_input = {}) {
  if (!configured()) return { ok: false, reason: 'data-zoho-books_not_configured' }
  const { page = 1 } = _input || {}
  const params = new URLSearchParams({
    organization_id: orgId(),
    page: String(page || 1),
  })

  try {
    const res = await fetch(`${API_BASE}/books/v3/invoices?${params.toString()}`, {
      method: 'GET',
      headers: {
        authorization: authHeader(),
        'user-agent': 'supermega-kernel/1.0',
      },
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const reason = data?.message || `http_${res.status}`
      return { ok: false, status: res.status, reason: `data-zoho-books_${String(reason)}`.slice(0, 200) }
    }
    // Zoho envelopes carry a `code` field; non-zero means an API-level error even on HTTP 200.
    if (data && typeof data.code === 'number' && data.code !== 0) {
      return { ok: false, status: res.status, reason: `data-zoho-books_${String(data.message || data.code)}`.slice(0, 200) }
    }
    return { ok: true, status: res.status, invoices: Array.isArray(data?.invoices) ? data.invoices : [] }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'data-zoho-books_error').slice(0, 200) }
  }
}

export const dataZohoBooks = {
  key: 'data-zoho-books',
  name: 'Zoho Books',
  category: 'data',
  docs: 'kernel/connectors/data-zoho-books.mjs',
  configured,
  /**
   * health — GET /books/v3/invoices?page=1 is a cheap, read-only, org-scoped call. A 2xx with a
   * success `code` means the access token and organization id are both valid and live.
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!configured()) return { ok: false, detail: 'missing ZOHO_BOOKS_ACCESS_TOKEN or ZOHO_BOOKS_ORG_ID' }
    const result = await listInvoices({ page: 1 })
    if (!result.ok) {
      return { ok: false, detail: `list_invoices failed: ${result.reason}`.slice(0, 160) }
    }
    return { ok: true, detail: `invoices=${result.invoices.length}`.slice(0, 160) }
  },
  listInvoices,
}

register(dataZohoBooks)
export default dataZohoBooks
