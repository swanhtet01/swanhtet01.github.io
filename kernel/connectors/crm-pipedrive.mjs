// Connector: data — Pipedrive. Read deals out of Pipedrive CRM via its REST API (zero-dependency,
// native fetch). Pipedrive is a common sales-pipeline CRM for SEA SMBs; this connector lets the
// SuperMega kernel pull the deals a business already tracks — so an agent can reconcile pipeline
// against DeskPOS sales, surface open opportunities, and enrich CRM records without re-keying.
//
// category 'data' · configured = PIPEDRIVE_API_TOKEN present.
// The API host is a hardcoded https constant (Pipedrive) — no user value ever chooses the host.
//
// Quick setup:
//   1. In Pipedrive: Settings → Personal preferences → API → copy your personal API token.
//   2. Set it as PIPEDRIVE_API_TOKEN. The host is fixed (api.pipedrive.com).
//
// Env:
//   PIPEDRIVE_API_TOKEN  (required)  Pipedrive personal API token.
//
// Auth: api_token query parameter. Pipedrive authenticates by appending `?api_token=<token>` to the
// request URL (there is no bearer header for the classic token). We URL-encode the token so it can
// never break out of the query string.
//
// Base: https://api.pipedrive.com/v1 (fixed host — never chosen from a user value).
//
// Capabilities:
//   listDeals({ limit }) — GET /deals?limit=<limit> (a page of deals from the pipeline).

import { register } from './registry.mjs'

// Fixed API base — hardcoded https constant, so no user value ever chooses the host.
const API_BASE = 'https://api.pipedrive.com/v1'

const apiToken = () => String(process.env.PIPEDRIVE_API_TOKEN || '').trim()

// configured — this is a FIXED-host service, so configured() only checks that the required env var
// is present. The token rides as a query param (URL-encoded at call time), never as a host segment.
const configured = () => Boolean(apiToken())

/**
 * listDeals — read a page of deals from the Pipedrive pipeline.
 *
 * GETs /deals?limit=<limit>&api_token=<token>. Pipedrive returns { success, data:[...] }; a
 * top-level success:false (or non-2xx) is surfaced via reason (never thrown).
 *
 * @param {object} [payload]
 * @param {number} [payload.limit=20]  max deals to return (page size).
 * @returns {Promise<{ ok:boolean, status?:number, deals?:any[], reason?:string }>}
 */
export async function listDeals(_input = {}) {
  if (!configured()) return { ok: false, reason: 'crm-pipedrive_not_configured' }
  const { limit = 20 } = _input || {}
  const n = Math.max(1, Math.min(500, parseInt(limit, 10) || 20))
  try {
    const qs = new URLSearchParams({ limit: String(n), api_token: apiToken() })
    const res = await fetch(`${API_BASE}/deals?${qs.toString()}`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'user-agent': 'supermega-kernel/1.0',
      },
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || (data && data.success === false)) {
      const reason = data?.error || data?.message || `http_${res.status}`
      return { ok: false, status: res.status, reason: `crm-pipedrive_${String(reason)}`.slice(0, 200) }
    }
    const deals = data?.data || []
    return { ok: true, status: res.status, deals: Array.isArray(deals) ? deals : [] }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'crm-pipedrive_error').slice(0, 200) }
  }
}

export const crmPipedrive = {
  key: 'crm-pipedrive',
  name: 'Pipedrive',
  category: 'data',
  docs: 'kernel/connectors/crm-pipedrive.mjs',
  configured,
  /**
   * health — GET /users/me is Pipedrive's cheapest authenticated read: it returns the token owner's
   * own user record, confirming the token is valid without touching any pipeline data.
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!configured()) return { ok: false, detail: 'missing PIPEDRIVE_API_TOKEN' }
    try {
      const qs = new URLSearchParams({ api_token: apiToken() })
      const res = await fetch(`${API_BASE}/users/me?${qs.toString()}`, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'user-agent': 'supermega-kernel/1.0',
        },
        signal: AbortSignal.timeout(8000),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || (data && data.success === false)) {
        return { ok: false, detail: `crm-pipedrive_${res.status}: ${(data?.error || data?.message || '')}`.slice(0, 160) }
      }
      const label = data?.data?.name || data?.data?.email || 'user ok'
      return { ok: true, detail: String(label).slice(0, 160) }
    } catch (e) {
      return { ok: false, detail: String(e?.message || 'crm-pipedrive_error').slice(0, 160) }
    }
  },
  listDeals,
}

register(crmPipedrive)
export default crmPipedrive
