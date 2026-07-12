// Connector: commerce — Square. Read the POS catalog/locations of shops already running on Square
// via the Square Connect v2 API (zero-dependency, fetch-based). Lets a Myanmar SMB that already
// takes payments on Square surface its store locations (name + currency) inside the SuperMega
// kernel — so onboarding an existing Square merchant means pulling their shops automatically
// instead of re-keying every branch by hand.
//
// category 'commerce' · configured = SQUARE_ACCESS_TOKEN present. Square is a FIXED-host service
// (connect.squareup.com), so the base URL is a hardcoded https constant — no user value ever
// chooses the host — and configured() just checks that the access token is present.
//
// Quick setup:
//   1. In the Square Developer Dashboard (developer.squareup.com): create/open an application.
//      2. Under "Credentials", choose Production (or Sandbox) and copy the Access Token.
//   3. Set it as SQUARE_ACCESS_TOKEN.
//
// Env:
//   SQUARE_ACCESS_TOKEN  (required)  Square OAuth/personal access token (Bearer credential).
//
// Auth: HTTP Bearer. Authorization: 'Bearer ' + SQUARE_ACCESS_TOKEN, pinned to a specific API
//   version via the 'Square-Version' header (2024-10-17).
//
// Capabilities:
//   listLocations() — GET /v2/locations (list the merchant's store locations: id, name, currency).

import { register } from './registry.mjs'

// FIXED host — hardcoded https constant. No user/derived value ever selects the host.
const API_BASE = 'https://connect.squareup.com/v2'
// Pin the Square API version so response shapes stay stable across Square releases.
const SQUARE_VERSION = '2024-10-17'

const token = () => String(process.env.SQUARE_ACCESS_TOKEN || '').trim()

const authHeader = () => 'Bearer ' + token()

// configured — Square is a fixed-host service, so we only need the access token to be present. The
// base URL is a hardcoded https constant (never derived from any input), so there is no host to
// validate and no SSRF surface to guard against here.
const configured = () => Boolean(token())

/**
 * listLocations — list the merchant's Square store locations.
 *
 * GETs /v2/locations. Square returns 200 with { locations: [...] } on success. Each location is
 * reduced to the fields the kernel cares about: id, name, currency.
 *
 * @returns {Promise<{ ok:boolean, status?:number, locations?:Array<{id:string,name:string,currency:string}>, reason?:string }>}
 */
export async function listLocations() {
  if (!configured()) return { ok: false, reason: 'commerce-square_not_configured' }

  try {
    const res = await fetch(`${API_BASE}/locations`, {
      method: 'GET',
      headers: {
        authorization: authHeader(),
        'square-version': SQUARE_VERSION,
        'content-type': 'application/json',
        'user-agent': 'supermega-kernel/1.0',
      },
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const reason = data?.error || data?.message || `http_${res.status}`
      return { ok: false, status: res.status, reason: `commerce-square_${String(reason)}`.slice(0, 200) }
    }
    const locations = (data?.locations || []).map((l) => ({ id: l.id, name: l.name, currency: l.currency }))
    return { ok: true, status: res.status, locations }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'commerce-square_error').slice(0, 200) }
  }
}

export const commerceSquare = {
  key: 'commerce-square',
  name: 'Square',
  category: 'commerce',
  docs: 'kernel/connectors/commerce-square.mjs',
  configured,
  /**
   * health — GET /v2/locations is a cheap authenticated liveness probe: it returns 200 with the
   * merchant's locations when the access token is valid, and reports how many were found.
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!configured()) return { ok: false, detail: 'missing SQUARE_ACCESS_TOKEN' }
    try {
      const res = await fetch(`${API_BASE}/locations`, {
        method: 'GET',
        headers: {
          authorization: authHeader(),
          'square-version': SQUARE_VERSION,
          'user-agent': 'supermega-kernel/1.0',
        },
        signal: AbortSignal.timeout(8000),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return { ok: false, detail: `commerce-square_${res.status}: ${(data?.error || data?.message || '')}`.slice(0, 160) }
      }
      const count = (data?.locations || []).length
      return { ok: true, detail: `${count} location(s)`.slice(0, 160) }
    } catch (e) {
      return { ok: false, detail: String(e?.message || 'commerce-square_error').slice(0, 160) }
    }
  },
  listLocations,
}

register(commerceSquare)
export default commerceSquare
